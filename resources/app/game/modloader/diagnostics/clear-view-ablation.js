'use strict'

// Temporary, explicit diagnostic intervention. No prototype/Canvas patches or save access.
const crypto = require('crypto')
const PHASE_MS = 12000
const SETTLE_MS = 3000
const PHASES = Object.freeze([
  { id: 'baseline-before', label: '原样', clip: true, grid: true },
  { id: 'no-outer-clip', label: '仅取消建筑外层裁剪', clip: false, grid: true },
  { id: 'no-grid', label: '仅取消地板网格', clip: true, grid: false },
  { id: 'no-clip-no-grid', label: '同时取消外层裁剪和网格', clip: false, grid: false },
  { id: 'baseline-after', label: '恢复原样复测', clip: true, grid: true }
].map(Object.freeze))
const NATIVE_HASHES = Object.freeze({
  renderEntitiesAbstract: 'ac6551ecf975bbd5eae21625f571ea7f4cf11ed3306d72c8a23c8be1ef899439',
  renderGrid: '7bc9eca6df7e85d6dd88457e2835f056be26aceeacb0249a6201d62a75270871'
})
const FIXED_KEYS = ['width', 'height', 'windowWidth', 'windowHeight', 'dpr', 'gamePixelRatio', 'zoom', 'plane', 'cameraX', 'cameraY']
const hashMethod = fn => crypto.createHash('sha256').update(Function.prototype.toString.call(fn).replace(/\s+/g, '')).digest('hex')

function eligible(s) {
  return s.plane === 0 && s.alt && !s.item && !s.transported && !s.relocate && !s.erase && !s.touch &&
    !s.halt && !s.hidden && s.focused === true && !s.menuOpen && !s.resizing
}

// Same native 1.3 entity loop, visibility, path and sprite calls; only the OUTER clip is omitted.
// Entity render() may still use its own clip(). Do not substitute renderEntities/cache routing.
function renderWithoutOuterClip(dt) {
  const dx = .9 * .866 * this.unit
  const dy = .9 * .5 * this.unit
  for (let i = 0; i < this.stuff.length; i++) {
    if (this.stuff[i].name !== 'conductor' && this.isVisible(this.stuff[i])) {
      const xy = this.uvToXY(this.stuff[i].position)
      const mult = (this.stuff[i].entitySpan ?? 0) * 2 + 1
      this.ctx.save()
      try {
        this.ctx.beginPath()
        this.ctx.moveTo(xy[0], xy[1] - dy * mult)
        this.ctx.lineTo(xy[0] + dx * mult, xy[1])
        this.ctx.lineTo(xy[0], xy[1] + dy * mult)
        this.ctx.lineTo(xy[0] - dx * mult, xy[1])
        this.ctx.closePath()
        this.stuff[i].render(dt)
      } finally { this.ctx.restore() }
    }
  }
}

function createAblation(options) {
  const { game, now, snapshot } = options
  let active = false, used = false, started = 0, ended = 0, index = -1, changedAt = 0
  let original = null, descriptor = null, wrapped = null, baseline = null, reason = null
  const visits = [], warnings = []
  function deactivate(why, restore = true) {
    if (active) {
      active = false; ended = now(); reason = why
      if (visits.length) visits.at(-1).endMs = ended - started
    }
    if (!restore || !wrapped) return
    try {
      if (game.renderEntitiesAbstract === wrapped) {
        if (descriptor) Object.defineProperty(game, 'renderEntitiesAbstract', descriptor)
        else delete game.renderEntitiesAbstract
      } else warnings.push('A later wrapper is preserved; the retained diagnostic wrapper is inactive until reload.')
    } catch (_) { warnings.push('Descriptor changed during capture; diagnostic wrapper is inactive until reload.') }
    wrapped = null
  }
  function abort(why) {
    if (!active) return
    deactivate(why, false)
    options.onAbort?.(why)
  }
  function validate() {
    if (!active) return false
    if (options.isCurrent && !options.isCurrent()) { abort('game-instance-changed'); return false }
    let s
    try { s = snapshot() } catch (_) { abort('scene-unavailable'); return false }
    if (!eligible(s)) { abort('input-focus-or-mode-changed'); return false }
    if (FIXED_KEYS.some(k => s[k] !== baseline[k])) { abort('camera-or-size-changed'); return false }
    return true
  }
  function tick() {
    if (!validate()) return
    const next = Math.floor((now() - started) / PHASE_MS)
    if (next >= PHASES.length) { deactivate('duration', false); options.onComplete?.(); return }
    if (next === index) return
    if (next !== index + 1) { abort('phase-skipped'); return }
    changedAt = now()
    if (visits.length) visits.at(-1).endMs = changedAt - started
    index = next
    visits.push({ ...PHASES[index], index, startMs: changedAt - started, abstractCalls: 0, noClipCalls: 0, gridOmissions: 0 })
    options.onPhase?.(PHASES[index], index)
  }
  return {
    start() {
      if (used) throw new Error('对照组件不能重复启动。')
      used = true
      baseline = snapshot()
      if (!eligible(baseline)) throw new Error('自动对照需要：现实平面、按住 Alt、游戏前台、无手持建筑，且菜单关闭。')
      original = game.renderEntitiesAbstract
      const nativeGrid = options.getNativeGrid?.()
      if (typeof original !== 'function' || hashMethod(original) !== NATIVE_HASHES.renderEntitiesAbstract ||
          typeof nativeGrid !== 'function' || hashMethod(nativeGrid) !== NATIVE_HASHES.renderGrid) {
        throw new Error('当前原生绘制方法与已验证的 1.3 不同，未启动对照。')
      }
      descriptor = Object.getOwnPropertyDescriptor(game, 'renderEntitiesAbstract')
      wrapped = function (...args) {
        if (!active || this !== game) return original.apply(this, args)
        // Guard again at the actual call, including changes made by another frame wrapper.
        if (!validate()) return original.apply(this, args)
        visits.at(-1).abstractCalls++
        try {
          if (!PHASES[index].clip) { visits.at(-1).noClipCalls++; return renderWithoutOuterClip.apply(this, args) }
          return original.apply(this, args)
        } catch (error) { abort('draw-exception'); throw error }
      }
      Object.defineProperty(game, 'renderEntitiesAbstract', { configurable: true, writable: true, enumerable: descriptor?.enumerable || false, value: wrapped })
      started = now(); active = true
      tick()
    },
    beforeFrame: tick,
    abort,
    stop: deactivate,
    skipGrid(target, nativeGrid) {
      if (!active || target !== game || PHASES[index]?.grid || !validate()) return false
      if (nativeGrid !== options.getNativeGrid?.()) { abort('grid-method-changed'); return false }
      visits.at(-1).gridOmissions++
      return true
    },
    state() {
      return { ablationPhase: index < 0 ? 'none' : PHASES[index].id, ablationIndex: index,
        ablationSettling: !active || now() - changedAt < SETTLE_MS, ablationActive: active }
    },
    report() {
      return { protocol: 'clear-view-2x2-v1', phaseMs: PHASE_MS, settlingMs: SETTLE_MS, durationMs: ended - started,
        stopReason: reason, reachedFinalPhase: visits.length === PHASES.length,
        completed: ['duration', 'main-deadline'].includes(reason) && visits.length === PHASES.length,
        phases: visits.map(v => ({ ...v })), warnings: [...warnings], nativeHashes: NATIVE_HASHES }
    }
  }
}

module.exports = { PHASES, PHASE_MS, SETTLE_MS, NATIVE_HASHES, hashMethod, eligible, createAblation }
