'use strict'

// Private, optional diagnostics for the shipped desktop 1.3.0.1 methods.
// Idle hooks delegate to the captured method; no recording runs until requested.
const crypto = require('crypto')
const NATIVE_HASHES = Object.freeze({
  renderGrid: '6a5aca11ad870d75d600e9746d05b01077fe357d044263a7d36a50039b0ee0db',
  renderEntitiesAbstract: '4bf7952815088c219d76c296018c484239823d79444dd62e25b6efd8a7b9ed62'
})
const PHASE_MS = 12000, SETTLE_MS = 3000, DETAIL_EVERY = 30
const PHASES = Object.freeze([
  { id: 'placement-before', label: '原样' },
  { id: 'placement-no-scan', label: '仅跳过放置扫描及占位阴影', skipScan: true },
  { id: 'placement-no-stroke', label: '仅取消原生网格描边', skipStroke: true },
  { id: 'placement-no-mask', label: '仅取消新版外层白色遮罩', skipMask: true },
  { id: 'placement-after', label: '恢复原样复测' }
].map(Object.freeze))
const FIXED = ['width', 'height', 'windowWidth', 'windowHeight', 'dpr', 'gamePixelRatio', 'zoom', 'unit', 'plane',
  'cameraX', 'cameraY', 'projectionPitch', 'projectionYaw', 'itemType', 'hoveredX', 'hoveredY', 'alt', 'touch', 'interactionMode', 'configSignature']
const PROJECTIONS = ['xyToUV', 'uvToXY', 'uvToXYUntranslated']
const installed = new WeakMap()
const hashMethod = fn => typeof fn === 'function' ? crypto.createHash('sha256').update(Function.prototype.toString.call(fn).replace(/\s+/g, '')).digest('hex') : null

function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error('放置探针的原生源码锚不唯一。')
  return source.replace(from, to)
}

// Compile only a whitelisted source. Injected calls bracket blocks; there is no
// per-cell clock, callback, proxy, log, IPC, or change to the native lookup loop.
function compileNativeMethod(name, original, probe, renderHooks) {
  if (!NATIVE_HASHES[name] || hashMethod(original) !== NATIVE_HASHES[name]) throw new Error('原生方法不是已核对的桌面1.3.0.1，未启用放置细分。')
  let source = Function.prototype.toString.call(original).replace(/\r\n/g, '\n')
  if (name === 'renderGrid') {
    source = replaceOnce(source, 'renderGrid(){', 'renderGrid(){\nconst __sfSkipScan = probe.skipScan, __sfSkipStroke = probe.skipStroke;\nprobe.gridBegin();')
    source = replaceOnce(source, '\t\tthis.ctx.save()', '\t\tprobe.gridSetupDone(lt, rb, rt, lb);\n\t\tthis.ctx.save()')
    if (source.split('this.ctx.stroke()').length !== 3) throw new Error('原生网格描边锚不匹配。')
    source = source.replaceAll('this.ctx.stroke()', 'if (!__sfSkipStroke) this.ctx.stroke()')
    source = replaceOnce(source, '\t\tthis.ctx.restore()', '\t\tthis.ctx.restore()\n\t\tprobe.gridPlacementBegin()')
    source = replaceOnce(source, 'if (this.itemInHand && !this.transportedEntity', 'if (!__sfSkipScan && this.itemInHand && !this.transportedEntity')
  } else {
    source = replaceOnce(source, 'renderEntitiesAbstract(dt){', 'renderEntitiesAbstract(dt){\nconst __sfDetail = probe.detail, __sfSkipMask = probe.skipMask;')
    source = replaceOnce(source, '\t\t\t\t\tthis.stuff[i].render(dt)', '\t\t\t\t\tif (__sfDetail) probe.entityBegin();\n\t\t\t\t\tthis.stuff[i].render(dt)\n\t\t\t\t\tif (__sfDetail) { probe.entityEnd(); probe.maskBegin(); }')
    source = replaceOnce(source, '\t\t\t\t\tthis.ctx.fill()', '\t\t\t\t\tif (!__sfSkipMask) this.ctx.fill()\n\t\t\t\t\tif (__sfDetail) probe.maskEnd()')
  }
  return renderHooks ? renderHooks.compile(name, source, probe) : Function('probe', '"use strict"; return function ' + source)(probe)
}

function installNativeHooks(prototype, renderHooks) {
  if (!prototype || typeof prototype !== 'object') return null
  if (installed.has(prototype)) return installed.get(prototype)
  const originals = {}, variants = {}, capabilities = {}, wrappers = {}, descriptors = {}, removers = []
  let active = null
  for (const name of Object.keys(NATIVE_HASHES)) {
    const original = renderHooks?.original(name) || prototype[name]
    capabilities[name] = { sha256: hashMethod(original), supported: hashMethod(original) === NATIVE_HASHES[name] }
    if (!capabilities[name].supported) continue
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (descriptor && descriptor.configurable === false) { capabilities[name].supported = false; continue }
    originals[name] = original; descriptors[name] = descriptor
    const wrapped = function (...args) {
      if (!active || this !== active.game) return original.apply(this, args)
      return active.invoke(name, original, variants[name], this, args)
    }
    if (renderHooks?.original(name)) {
      removers.push(renderHooks.observe(name, (game, args, next) => {
        if (!active || game !== active.game) return next.apply(game, args)
        return active.invoke(name, next, variants[name], game, args)
      }))
      continue
    }
    wrappers[name] = wrapped
    Object.defineProperty(prototype, name, { configurable: true, writable: true, enumerable: descriptor?.enumerable || false, value: wrapped })
  }
  const controller = {
    gridResult(game) { return renderHooks?.gridResult(game) || null },
    optimizationEnabled(game) { return renderHooks?.enabled(game) === true },
    describe() { return Object.fromEntries(Object.entries(capabilities).map(([name, row]) => [name, { ...row }])) },
    begin(capture, probe) {
      if (active) throw new Error('放置细分采集已在运行。')
      for (const name of Object.keys(originals)) variants[name] = compileNativeMethod(name, originals[name], probe, renderHooks)
      active = capture
    },
    end(capture) { if (active === capture) active = null },
    dispose() {
      active = null
      for (const remove of removers) remove()
      for (const name of Object.keys(wrappers)) {
        if (prototype[name] !== wrappers[name]) continue
        if (descriptors[name]) Object.defineProperty(prototype, name, descriptors[name]); else delete prototype[name]
      }
    }
  }
  installed.set(prototype, controller)
  return controller
}

function eligible(s, game) {
  return s.plane === 0 && s.item && s.hovered && !s.transported && !s.touch && !s.erase && !s.relocate &&
    !['clone', 'erase', 'relocate'].includes(s.interactionMode) && !/^eraser[23]?$/.test(s.itemType || '') &&
    !game.isMobile && !s.halt && !s.hidden && s.focused === true && !s.menuOpen && !s.resizing
}

function createPlacementCapture(options) {
  const { game, controller, snapshot } = options, now = options.now || (() => performance.now())
  const comparison = options.comparison === true, capabilities = controller?.describe() || {}
  let active = false, used = false, started = 0, ended = 0, reason = null, baseline = null, held = null, projections = null
  let index = 0, changedAt = 0, number = 0, frame = null, ready = false, nativeSamples = 0
  let entityAt = 0, maskAt = 0, gridAt = 0, linesAt = 0, scanAt = 0
  const visits = [], warnings = [], bypasses = new Set()
  const warn = text => { if (warnings.length < 24 && !warnings.includes(text)) warnings.push(text) }
  function stop(why = 'manual') {
    if (!active) return
    active = false; ended = now(); reason = why; controller.end(capture)
    if (visits.length) visits.at(-1).endMs = ended - started
  }
  function abort(why) { if (active) { stop(why); options.onAbort?.(why) } }
  function validate() {
    if (!active) return false
    if (options.isCurrent && !options.isCurrent()) { abort('game-instance-changed'); return false }
    let s
    try { s = snapshot() } catch (_) { abort('scene-unavailable'); return false }
    if (s.hidden || s.focused === false || s.menuOpen || s.halt) { abort('focus-menu-or-game-state-changed'); return false }
    if (s.configSignature !== baseline.configSignature || PROJECTIONS.some(name => game[name] !== projections[name])) { abort('configuration-or-projection-changed'); return false }
    if (comparison && (!eligible(s, game) || held !== game.itemInHand || FIXED.some(k => s[k] !== baseline[k]))) { abort('placement-camera-or-size-changed'); return false }
    return true
  }
  const probe = {
    detail: false, skipScan: false, skipStroke: false, skipMask: false,
    gridBegin() { scanAt = linesAt = 0; gridAt = now() },
    gridSetupDone(lt, rb, rt, lb) {
      const at = now(), x = Math.max(0, rb[0] - lt[0]), y = Math.max(0, lb[1] - rt[1])
      const placement = !!game.itemInHand && !game.transportedEntity && !/^eraser[23]?$/.test(game.itemInHand.name)
      frame.grid = { setupMs: at - gridAt, linesMs: null, placementMs: null,
        candidateCells: placement ? x * y : 0, executedCells: placement && !probe.skipScan ? x * y : 0,
        attemptedStrokes: Math.max(0, rb[0] - lt[0] + 1) + Math.max(0, lb[1] - rt[1] + 1),
        issuedNativeStrokeCalls: probe.skipStroke ? 0 : Math.max(0, rb[0] - lt[0] + 1) + Math.max(0, lb[1] - rt[1] + 1),
        skipScan: probe.skipScan, skipStroke: probe.skipStroke, countSource: 'native-loop-bounds; stroke calls can be suppressed by existing wrappers' }
      if (probe.detail) frame.grid.bounds = { uMin: lt[0], uMax: rb[0], vMin: rt[1], vMax: lb[1] }
      linesAt = now(); frame.callbackOverheadMs += linesAt - at
    },
    gridPlacementBegin() { const at = now(); frame.grid.linesMs = at - linesAt; scanAt = at },
    entityBegin() { frame.detail.entityCalls++; entityAt = now() },
    entityEnd() { frame.detail.entityMs += now() - entityAt },
    maskBegin() { frame.detail.maskCandidates++; maskAt = now() },
    maskEnd() { frame.detail.maskMs += now() - maskAt; if (!probe.skipMask) frame.detail.issuedOuterFillCalls++ }
  }
  const capture = {
    game,
    start() {
      if (used) throw new Error('放置采集组件不能重复使用。')
      used = true
      if (!controller || Object.values(capabilities).every(c => !c.supported)) throw new Error('未找到已核对的新版原生入口，请完整退出并重启游戏。')
      baseline = snapshot()
      if (comparison && (!eligible(baseline, game) || !Object.values(capabilities).every(c => c.supported))) throw new Error('放置对照需要新版原生入口、现实平面、前台、手持建筑并指向固定格子，且无其他工具/菜单。')
      if (comparison && controller.optimizationEnabled?.(game)) throw new Error('复用建筑遍历绘制占位阴影已开启，不能作为原版五组对照；请使用观察记录，或自行关闭该开关后再对照。')
      if (comparison) {
        let config = {}; try { config = JSON.parse(baseline.configSignature || '{}') } catch (_) {}
        if (config.enablePlacementShadowReuse === true) throw new Error('复用建筑遍历绘制占位阴影已开启，不能作为原版五组对照；可使用观察记录。')
        if (config.enableClearViewGridBlock || config.enableClearViewGridStyle || config.enableClearViewClipBlock) throw new Error('当前清晰视图关闭/替换设置会干扰分项对照；未代改设置，可先用观察记录。')
      }
      held = game.itemInHand; projections = Object.fromEntries(PROJECTIONS.map(name => [name, game[name]]))
      started = changedAt = now(); active = true
      try { controller.begin(capture, probe) } catch (error) { active = false; controller.end(capture); throw error }
      visits.push({ ...(comparison ? PHASES[0] : { id: 'observe', label: '观察记录' }), startMs: 0, frames: 0, gridCalls: 0, abstractCalls: 0 })
    },
    beforeFrame() {
      frame = null
      if (!validate()) return
      if (comparison) {
        const next = Math.floor((now() - started) / PHASE_MS)
        if (next >= PHASES.length) { stop('duration'); options.onComplete?.(); return }
        if (next !== index) {
          if (!ready || next !== index + 1) { abort('phase-skipped-or-native-path-unverified'); return }
          visits.at(-1).endMs = now() - started; index = next; changedAt = now()
          visits.push({ ...PHASES[index], startMs: changedAt - started, frames: 0, gridCalls: 0, abstractCalls: 0 })
          options.onPhase?.(PHASES[index], index)
        }
      }
      const phase = comparison ? PHASES[index] : {}, kind = number % DETAIL_EVERY === 0 ? 'detail' : number % DETAIL_EVERY === 1 ? 'raw' : 'timed'
      // A raw frame never bypasses the selected intervention in a comparison.
      frame = { index: number++, phase: visits.at(-1).id, kind: comparison && kind === 'raw' ? 'timed' : kind,
        nativeCalls: { renderGrid: 0, renderEntitiesAbstract: 0 }, callbackOverheadMs: 0,
        grid: null, detail: kind === 'detail' ? { entityCalls: 0, entityMs: 0, maskCandidates: 0, maskMs: 0, issuedOuterFillCalls: 0 } : null }
      Object.assign(probe, { detail: kind === 'detail', skipScan: !!phase.skipScan, skipStroke: !!phase.skipStroke, skipMask: !!phase.skipMask })
    },
    invoke(name, original, variant, receiver, args) {
      if (!active || !frame || !validate()) return original.apply(receiver, args)
      frame.nativeCalls[name]++; visits.at(-1)[name === 'renderGrid' ? 'gridCalls' : 'abstractCalls']++
      nativeSamples++
      if (frame.kind === 'raw') return original.apply(receiver, args)
      try { return variant.apply(receiver, args) }
      catch (error) { abort('native-draw-exception'); throw error }
      finally {
        if (name === 'renderGrid' && frame?.grid && scanAt) {
          frame.grid.placementMs = Math.max(0, now() - scanAt)
          const path = controller.gridResult?.(game)
          if (path) {
            frame.grid.path = path.path
            frame.grid.fallbackReason = path.fallbackReason || null
            if (path.path === 'entity-traversal-reuse') {
              frame.grid.nativeAreaCells = frame.grid.candidateCells
              frame.grid.candidateCells = path.candidateCells
              frame.grid.executedCells = 0
              frame.grid.mapLookups = path.mapLookups
              frame.grid.occupiedCells = path.occupiedCells
              frame.grid.issuedShadowFills = path.fills
              frame.grid.countSource = 'current-frame entity footprints; original empty-area loop not executed'
            }
          }
        }
      }
    },
    afterFrame(outer) {
      if (!frame) return null
      const result = frame
      result.placementPath = controller.gridResult?.(game) || null
      if (!comparison && result.placementPath) result.phase += '/' + result.placementPath.path
      if (result.placementPath?.path === 'entity-traversal-reuse') warn('本记录包含建筑遍历复用路径，raw也保留优化；执行格数0仅指原生空格循环未执行，并非没有占格查询或阴影。实际路径、footprint候选/mapLookups/fills见frames.json；placementMs不含此前实体遍历的收集时间。')
      visits.at(-1).frames++
      if (!result.nativeCalls.renderEntitiesAbstract) result.detail = null
      for (const name of Object.keys(NATIVE_HASHES)) {
        if (outer?.methods?.[name] !== undefined && !result.nativeCalls[name]) { bypasses.add(name); warn(name + ': native leaf not reached; outer method timing is not native attribution') }
        if (result.nativeCalls[name] > 1) { warn(name + ': repeated native calls in one frame; block totals unavailable'); if (name === 'renderGrid') result.grid = null; else result.detail = null }
      }
      if (comparison && active) {
        if (result.nativeCalls.renderGrid === 1 && result.nativeCalls.renderEntitiesAbstract === 1) ready = true
        else abort('native-path-bypassed')
      }
      frame = null
      return result
    },
    state() { return { placementActive: active, placementDetailed: frame?.kind === 'detail', placementRaw: frame?.kind === 'raw',
      placementPhase: visits.at(-1)?.id || 'unavailable', placementSettling: comparison && (!active || now() - changedAt < SETTLE_MS) } },
    stop, abort,
    report() {
      return { protocol: 'placement-v1', comparison, completed: ['duration', 'main-deadline'].includes(reason) && nativeSamples > 0 && (!comparison || visits.length === PHASES.length && ready),
        stopReason: reason, durationMs: ended - started, phaseMs: comparison ? PHASE_MS : null, settlingMs: comparison ? SETTLE_MS : null,
        detailEvery: DETAIL_EVERY, frameCount: number, capabilities, nativeHashes: NATIVE_HASHES, nativePathsBypassed: [...bypasses],
        phases: visits.map(v => ({ ...v })), warnings: [...warnings],
        limitations: ['Counts identify either original native loop bounds or current-frame entity footprints; neither is GPU work. Collection time is inside the entity pass; placementMs covers the later grid stage.',
          'Detailed frames and adjacent intervals are excluded from comparable frame statistics; timings include observer overhead.',
          'callbackOverheadMs covers only bounded geometry bookkeeping and is not total probe overhead.',
          'Entity and mask timings are synchronous wall time from sparse frames, not hardware rasterization time.',
          'Raw frames call the captured original and are recorded separately; the idle delegation hook remains installed.',
          'Existing mod wrappers and actual projection remain in the call chain. No world/input/save operation is invoked.'] }
    }
  }
  return capture
}

module.exports = { NATIVE_HASHES, PHASES, PHASE_MS, DETAIL_EVERY, hashMethod, compileNativeMethod, installNativeHooks, createPlacementCapture, eligible }
