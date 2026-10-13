'use strict'

// Explicit temporary diagnostic. No Canvas/instance patches, pixel readbacks, or save access.
const { PHASE_MS, SETTLE_MS, NATIVE_HASHES, hashMethod, eligible } = require('./clear-view-ablation')
const PHASES = Object.freeze([
  { id: 'grid-native-before', label: '原样', native: true },
  { id: 'grid-no-stroke', label: '只省略描边，保留计算和建路径', omitStroke: true },
  { id: 'grid-thin', label: '只改为 Tweaks 线宽', thin: true },
  { id: 'grid-opaque', label: '只取消颜色透明度', opaque: true },
  { id: 'grid-thin-opaque', label: '同时变细并取消颜色透明度', thin: true, opaque: true },
  { id: 'grid-native-after', label: '恢复原样复测', native: true }
].map(Object.freeze))
const THRESHOLD_PHASES = Object.freeze([
  { id: 'threshold-native-before', label: '原样', native: true },
  { id: 'threshold-050-round', label: '线宽 0.5／圆端', lineWidth: 0.5, lineCap: 'round' },
  { id: 'threshold-100-round', label: '线宽 1.0／圆端', lineWidth: 1, lineCap: 'round' },
  { id: 'threshold-101-round', label: '线宽 1.01／圆端', lineWidth: 1.01, lineCap: 'round' },
  { id: 'threshold-150-round', label: '线宽 1.5／圆端', lineWidth: 1.5, lineCap: 'round' },
  { id: 'threshold-150-butt', label: '线宽 1.5／平端', lineWidth: 1.5, lineCap: 'butt' },
  { id: 'threshold-101-butt', label: '线宽 1.01／平端', lineWidth: 1.01, lineCap: 'butt' },
  { id: 'threshold-native-after', label: '恢复原样复测', native: true }
].map(Object.freeze))
const FIXED_KEYS = ['width', 'height', 'windowWidth', 'windowHeight', 'dpr', 'gamePixelRatio', 'zoom', 'unit', 'plane', 'cameraX', 'cameraY', 'projectionPitch', 'projectionYaw']
const thinWidth = game => Math.max(0.5, Math.min((game.pixelRatio || 1) * 0.9, (game.unit || 1) * 0.015))
const phaseWidth = (game, phase) => phase.lineWidth ?? (phase.thin ? thinWidth(game) : game.pixelRatio)
const finite = n => Number.isFinite(n) ? n : null

// Native 1.3 Alt-only branch. Keep all projections, path calls, coordinates (+.5), order and state.
// The caller rejects handheld/erase/relocate/touch, so the native placement scan is ineligible.
function drawGridVariant(game, phase, onConfigured) {
  const lt = game.xyToUV([0, 0]), rb = game.xyToUV([game.w, game.h])
  const rt = game.xyToUV([game.w, 0]), lb = game.xyToUV([0, game.h])
  for (const p of [lt, rb, rt, lb]) { p[0] = Math.floor(p[0]); p[1] = Math.floor(p[1]) }
  const ctx = game.ctx
  let lines = 0
  ctx.save()
  try {
    ctx.strokeStyle = phase.opaque ? '#111122' : '#1129'
    ctx.lineWidth = phaseWidth(game, phase)
    if (phase.lineCap) ctx.lineCap = phase.lineCap
    onConfigured?.(ctx)
    for (let y = rt[1] + .5; y <= lb[1] + .5; y++) {
      ctx.beginPath()
      const xy0 = game.uvToXYUntranslated([lt[0] + .5, y])
      ctx.moveTo(xy0[0] + .5, xy0[1] + .5)
      const xy1 = game.uvToXYUntranslated([rb[0] + .5, y])
      ctx.lineTo(xy1[0] + .5, xy1[1] + .5)
      if (!phase.omitStroke) ctx.stroke()
      lines++
    }
    for (let x = lt[0] + .5; x <= rb[0] + .5; x++) {
      ctx.beginPath()
      const xy0 = game.uvToXYUntranslated([x, rt[1] + .5])
      ctx.moveTo(xy0[0] + .5, xy0[1] + .5)
      const xy1 = game.uvToXYUntranslated([x, lb[1] + .5])
      ctx.lineTo(xy1[0] + .5, xy1[1] + .5)
      if (!phase.omitStroke) ctx.stroke()
      lines++
    }
  } finally { ctx.restore() }
  return lines
}

function contextInfo(game, identify) {
  const ctx = game.ctx, canvas = ctx.canvas
  const scalar = value => typeof value === 'number' ? finite(value) : typeof value === 'string' ? value.slice(0, 160) : null
  const properties = {}
  for (const key of ['strokeStyle', 'lineWidth', 'globalAlpha', 'globalCompositeOperation', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'filter', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY']) properties[key] = scalar(ctx[key])
  const m = ctx.getTransform?.()
  return { canvas: { token: identify(canvas), main: canvas === game.canvas, width: canvas?.width, height: canvas?.height },
    transform: m ? ['a', 'b', 'c', 'd', 'e', 'f'].map(k => finite(m[k])) : null,
    properties, lineDash: ctx.getLineDash?.().slice(0, 64).map(finite) || [],
    contextAttributes: ctx.getContextAttributes?.() || null }
}

// At most two metadata samples per phase; their frames and adjacent intervals are excluded.
function geometryInfo(game) {
  const corners = [[0, 0], [game.w, game.h], [game.w, 0], [0, game.h]].map(xy => game.xyToUV(xy).map(Math.floor))
  const [lt, rb, rt, lb] = corners
  const yCount = Math.max(0, lb[1] - rt[1] + 1), xCount = Math.max(0, rb[0] - lt[0] + 1)
  const total = xCount + yCount
  if (!Number.isSafeInteger(total)) throw new Error('Non-finite grid bounds')
  const stride = Math.max(1, Math.ceil(total / 4096))
  let samples = 0, min = Infinity, max = -Infinity, sum = 0
  const examples = []
  const inspect = (a, b) => {
    const p = game.uvToXYUntranslated(a).map(v => v + .5), q = game.uvToXYUntranslated(b).map(v => v + .5)
    const length = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (!Number.isFinite(length)) throw new Error('Non-finite grid projection')
    min = Math.min(min, length); max = Math.max(max, length); sum += length; samples++
    if (examples.length < 4) examples.push({ from: p, to: q, length })
  }
  for (let i = 0; i < yCount; i += stride) inspect([lt[0] + .5, rt[1] + .5 + i], [rb[0] + .5, rt[1] + .5 + i])
  for (let i = 0; i < xCount; i += stride) inspect([lt[0] + .5 + i, rt[1] + .5], [lt[0] + .5 + i, lb[1] + .5])
  return { corners, xCount, yCount, lineCount: total, sampledLines: samples, lengthsExact: samples === total,
    lengthMin: finite(min), lengthMax: finite(max), sampledLengthTotal: sum, examples,
    projectedBasis: [[0, 0], [1, 0], [0, 1]].map(p => game.uvToXYUntranslated(p).map(finite)),
    projectionHashes: { xyToUV: hashMethod(game.xyToUV), uvToXY: typeof game.uvToXY === 'function' ? hashMethod(game.uvToXY) : null, uvToXYUntranslated: hashMethod(game.uvToXYUntranslated) } }
}

function createGridComparison(options, phases, protocol) {
  const { game, now, snapshot } = options
  const threshold = protocol === 'clear-view-grid-threshold-v1'
  let active = false, used = false, started = 0, ended = 0, changedAt = 0, index = -1, baseline, original, reason
  let samplePending = false, projectionMethods
  const visits = [], warnings = [], canvases = new WeakMap()
  let nextCanvas = 0
  const identify = canvas => {
    if (!canvas || typeof canvas !== 'object') return 'unavailable'
    if (!canvases.has(canvas)) canvases.set(canvas, 'canvas-' + (++nextCanvas))
    return canvases.get(canvas)
  }
  function stop(why) {
    if (!active) return
    active = false; ended = now(); reason = why
    if (visits.length) visits.at(-1).endMs = ended - started
    samplePending = false
  }
  function abort(why) { if (active) { stop(why); options.onAbort?.(why) } }
  function validate() {
    if (!active) return false
    if (options.isCurrent && !options.isCurrent()) { abort('game-instance-changed'); return false }
    let s
    try { s = snapshot() } catch (_) { abort('scene-unavailable'); return false }
    if (!eligible(s)) { abort('input-focus-or-mode-changed'); return false }
    if (FIXED_KEYS.some(k => s[k] !== baseline[k])) { abort('camera-or-size-changed'); return false }
    if (Object.keys(projectionMethods).some(k => game[k] !== projectionMethods[k])) { abort('projection-method-changed'); return false }
    return true
  }
  function tick() {
    if (!validate()) return
    const next = Math.floor((now() - started) / PHASE_MS)
    if (next >= phases.length) { stop('duration'); options.onComplete?.(); return }
    if (next !== index) {
      if (next !== index + 1) { abort('phase-skipped'); return }
      changedAt = now()
      if (visits.length) visits.at(-1).endMs = changedAt - started
      index = next
      visits.push({ ...phases[index], index, startMs: changedAt - started, gridCalls: 0, nativeCalls: 0, variantCalls: 0, constructedLines: 0, issuedStrokes: 0, omittedStrokes: 0, metadata: [] })
      options.onPhase?.(phases[index], index)
    }
    const count = visits.at(-1).metadata.length
    samplePending = count === 0 || (count === 1 && now() - changedAt >= SETTLE_MS)
  }
  return {
    start() {
      if (used) throw new Error('对照组件不能重复启动。')
      used = true; baseline = snapshot()
      if (!eligible(baseline)) throw new Error('网格对照需要：现实平面、按住 Alt、游戏前台、无手持建筑，且菜单关闭。')
      original = options.getNativeGrid?.()
      if (typeof original !== 'function' || hashMethod(original) !== NATIVE_HASHES.renderGrid) throw new Error('当前原生网格与已验证的 1.3 不同，未启动对照。')
      projectionMethods = Object.fromEntries(['xyToUV', 'uvToXY', 'uvToXYUntranslated'].map(k => [k, game[k]]))
      if (typeof game.xyToUV !== 'function' || typeof game.uvToXYUntranslated !== 'function') throw new Error('网格投影不可用。')
      started = now(); active = true; tick()
    },
    beforeFrame: tick,
    abort, stop,
    interceptGrid(target, nativeGrid, args) {
      if (!active || target !== game || !validate()) return false
      if (nativeGrid !== original || options.getNativeGrid?.() !== original) { abort('grid-method-changed'); return false }
      const phase = phases[index], visit = visits.at(-1)
      visit.gridCalls++
      let effectiveSample = null
      if (samplePending) {
        const metadata = { atMs: now() - started, stage: visit.metadata.length ? 'stable' : 'entry',
          requested: { lineWidth: phaseWidth(game, phase), strokeStyle: phase.opaque ? '#111122' : '#1129', omitStroke: !!phase.omitStroke } }
        if (threshold) {
          metadata.requested.lineCap = phase.lineCap || 'inherited'
          metadata.effectiveSource = phase.native ? 'native-source-contract-not-intercepted' : 'read-after-configuration'
          metadata.effective = null
          if (!phase.native) effectiveSample = metadata
        }
        try {
          metadata.context = contextInfo(game, identify); metadata.geometry = geometryInfo(game)
          if (threshold) {
            const checks = { identityTransform: JSON.stringify(metadata.context.transform) === '[1,0,0,1,0,0]',
              nativeWidthIs1_5: game.pixelRatio === 1.5, inheritedCapIsRound: metadata.context.properties.lineCap === 'round', mainCanvas: metadata.context.canvas.main }
            metadata.referenceChecks = checks
            metadata.matchesPreviousReference = Object.values(checks).every(Boolean)
          }
        }
        catch (error) { metadata.error = String(error.message).slice(0, 160); if (!warnings.includes('Some grid metadata is unavailable.')) warnings.push('Some grid metadata is unavailable.') }
        visit.metadata.push(metadata); samplePending = false
      }
      try {
        if (phase.native) { visit.nativeCalls++; original.apply(game, args) }
        else {
          visit.variantCalls++
          const captureEffective = effectiveSample ? ctx => {
            try { effectiveSample.effective = { lineWidth: finite(ctx.lineWidth), lineCap: ctx.lineCap, strokeStyle: ctx.strokeStyle, globalAlpha: finite(ctx.globalAlpha) } }
            catch (error) { effectiveSample.effectiveError = String(error.message).slice(0, 160); if (!warnings.includes('Some effective grid state is unavailable.')) warnings.push('Some effective grid state is unavailable.') }
          } : undefined
          const count = drawGridVariant(game, phase, captureEffective)
          visit.constructedLines += count
          if (phase.omitStroke) visit.omittedStrokes += count
          else visit.issuedStrokes += count
        }
      } catch (error) { abort('grid-exception'); throw error }
      return true
    },
    state() { return { ablationPhase: index < 0 ? 'none' : phases[index].id, ablationIndex: index,
      ablationSettling: !active || now() - changedAt < SETTLE_MS || samplePending, ablationActive: active } },
    report() {
      return { protocol, phaseMs: PHASE_MS, settlingMs: SETTLE_MS, durationMs: ended - started,
        stopReason: reason, reachedFinalPhase: visits.length === phases.length,
        completed: ['duration', 'main-deadline'].includes(reason) && visits.length === phases.length,
        phases: visits.map(v => ({ ...v })), warnings: [...warnings], nativeHashes: { renderGrid: NATIVE_HASHES.renderGrid },
        limitations: ['Baseline stroke counts are geometry estimates in metadata, not intercepted Canvas calls.',
          'Metadata frames and adjacent intervals are excluded; metadata samples are bounded to two per phase.',
          threshold ? 'Only explicit width and line cap vary. Color, geometry, other inherited state and layer routing stay in place.' : 'Only stroke submission, width and color alpha vary. Geometry, inherited state and layer routing stay in place.',
          ...(threshold ? ['Effective width/cap are read only on variant metadata frames; native state is inferred from guarded source, not intercepted.',
            'Reference checks describe sampled context only. Non-identity transforms or different native width/cap cannot directly reproduce the earlier threshold comparison.'] : [])] }
    }
  }
}

const createGridAblation = options => createGridComparison(options, PHASES, 'clear-view-grid-stroke-v1')
const createGridThreshold = options => createGridComparison(options, THRESHOLD_PHASES, 'clear-view-grid-threshold-v1')

module.exports = { PHASES, THRESHOLD_PHASES, PHASE_MS, SETTLE_MS, thinWidth, drawGridVariant, contextInfo, geometryInfo, createGridAblation, createGridThreshold }
