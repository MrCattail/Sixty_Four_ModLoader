'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { EventEmitter } = require('node:events')
const { THRESHOLD_PHASES: PHASES, drawGridVariant, geometryInfo, createGridThreshold } = require('../diagnostics/clear-view-grid')
const { createRecorder, createClient } = require('../diagnostics/clear-view-probe')
const { hashMethod, NATIVE_HASHES } = require('../diagnostics/clear-view-ablation')
const source = fs.readFileSync(path.join(__dirname, '../../scripts/game.js'), 'utf8')
function native(name, next) {
  const a = source.indexOf('\t' + name + '(') + 1, b = source.indexOf('\n\t' + next + '(', a)
  assert.ok(a > 0 && b > a)
  return Function('return ({' + source.slice(a, b).trim() + '})')()[name]
}
const original = native('renderGrid', 'drawResourceInScreenCoordinates')
const projection = { uvToXY: native('uvToXY', 'uvToXYUntranslated'), uvToXYUntranslated: native('uvToXYUntranslated', 'xyToUV'), xyToUV: native('xyToUV', 'xyToUVUntranslated') }
function fixture() {
  let clock = 0, pendingPath = [], strokes = 0
  const log = [], states = [], aborts = []
  const canvas = { width: 120, height: 80 }
  const values = { canvas, lineWidth: 9, strokeStyle: '#abcdef', lineCap: 'round', lineJoin: 'round', globalAlpha: .7, globalCompositeOperation: 'multiply', lineDashOffset: 2, filter: 'blur(2px)', shadowBlur: 3, shadowColor: '#123456', shadowOffsetX: 2, shadowOffsetY: -1 }
  const methods = { save() { states.push({ ...values }); log.push(['save']) }, restore() { Object.assign(values, states.pop()); log.push(['restore']) },
    beginPath() { pendingPath = []; log.push(['beginPath']) }, moveTo(x, y) { pendingPath.push([x, y]); log.push(['moveTo', x, y]) },
    lineTo(x, y) { pendingPath.push([x, y]); log.push(['lineTo', x, y]) }, stroke() { strokes++; log.push(['stroke']); if (f.failStroke) throw f.boom },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }, getLineDash() { return [2, 3] }, getContextAttributes() { return { alpha: true, willReadFrequently: false } } }
  const ctx = new Proxy(values, { get(o, key) { return methods[key] || o[key] }, set(o, key, value) { o[key] = value; log.push(['set', key, value]); return true } })
  const game = Object.assign(Object.create({ ...projection, renderGrid: original, renderEntitiesAbstract() {} }), { canvas, ctx, w: 120, h: 80, w2: 60, h2: 40, unit: 20, zoom: .5, pixelRatio: 1.5, translation: [0, 0], plane: 0, altActive: true, stuff: [] })
  const f = { game, ctx, log, aborts, boom: new Error('draw failure'), now: () => clock, setTime: t => { clock = t },
    scene: { width: 120, height: 80, windowWidth: 120, windowHeight: 80, dpr: 1.5, gamePixelRatio: 1.5, unit: 20, zoom: .5, plane: 0, cameraX: 0, cameraY: 0, alt: true, focused: true, entities: 0 },
    snapshot: () => ({ ...f.scene }), resetLog() { log.length = 0; strokes = 0 }, get strokes() { return strokes }, get depth() { return states.length }, get currentPath() { return pendingPath },
    make(extra = {}) { return createGridThreshold({ game, now: f.now, snapshot: f.snapshot, getNativeGrid: () => original, isCurrent: () => true, onAbort: why => aborts.push(why), ...extra }) } }
  return f
}
function clientFixture() {
  const f = fixture(), events = new EventEmitter(), docEvents = new EventEmitter(), jobs = new Map()
  let nextJob = 0
  const doc = { hidden: false, hasFocus: () => true, addEventListener: (...a) => docEvents.on(...a), removeEventListener: (...a) => docEvents.off(...a) }
  const win = { innerWidth: 120, innerHeight: 80, devicePixelRatio: 1.5, performance: { now: f.now, timeOrigin: 12345 },
    addEventListener: (...a) => events.on(...a), removeEventListener: (...a) => events.off(...a),
    setTimeout(fn, ms) { jobs.set(++nextJob, { fn, ms }); return nextJob }, clearTimeout(id) { jobs.delete(id) } }
  const calls = [], messages = []
  const client = createClient({ window: win, document: doc, getGame: () => f.game, getNativeGrid: () => original, isMenuOpen: () => false, notify: v => messages.push(v),
    ipc: { on() {}, async invoke(_ch, p) { calls.push(p); if (p.action === 'start') { if (f.gate) await f.gate; return { ok: true, result: { id: 'grid', seconds: f.oldMain ? 72 : p.seconds } } }
      if (p.action === 'finish') { f.report = p.report; return { ok: true, result: { directory: 'fixture', traceStatus: 'not-requested' } } }
      return { ok: true, result: {} } } } })
  // Mirrors the private Loader native-call gate without changing layers or the Canvas object.
  f.game.renderGrid = function (...args) { if (!client.interceptGrid(this, original, args)) return original.apply(this, args) }
  f.game.renderloop = function () { this.renderEntitiesAbstract(); this.renderGrid() }
  const before = { grid: f.game.renderGrid, loop: f.game.renderloop, abstract: f.game.renderEntitiesAbstract }
  return Object.assign(f, { client, jobs, events, doc, docEvents, calls, messages, before,
    async fire(ms) { const found = [...jobs].find(([,v]) => v.ms === ms); assert.ok(found, 'timer ' + ms); jobs.delete(found[0]); await found[1].fn() } })
}
const checks = []
async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
async function main() {
  await test('fixed eight phases change only width and cap in actual native 1.3 command stream', () => {
    assert.equal(hashMethod(original), NATIVE_HASHES.renderGrid)
    assert.deepEqual(PHASES.map(p => p.native ? 'native' : [p.lineWidth, p.lineCap]), ['native', [.5, 'round'], [1, 'round'], [1.01, 'round'], [1.5, 'round'], [1.5, 'butt'], [1.01, 'butt'], 'native'])
    for (const p of PHASES.filter(p => !p.native)) {
      const a = fixture(), b = fixture(); original.call(a.game)
      const count = drawGridVariant(b.game, p)
      const expected = a.log.flatMap(v => v[0] === 'set' && v[1] === 'lineWidth' ? [['set', 'lineWidth', p.lineWidth], ['set', 'lineCap', p.lineCap]] : [v])
      assert.deepEqual(b.log, expected); assert.equal(count, a.strokes); assert.equal(b.strokes, a.strokes)
      assert.deepEqual(b.currentPath, a.currentPath); assert.equal(b.depth, 0)
      for (const k of ['lineWidth', 'strokeStyle', 'lineCap', 'lineJoin', 'globalAlpha', 'globalCompositeOperation', 'filter', 'shadowBlur']) assert.equal(b.ctx[k], a.ctx[k])
    }
  })
  await test('eight-phase controller keeps native ends, exact counts, and distinct inherited/effective state', () => {
    const f = fixture(), before = Object.getOwnPropertyDescriptors(f.game), c = f.make(); c.start()
    for (let i = 0; i < 8; i++) for (const t of [0, 3100, 3200]) { f.setTime(i * 12000 + t); c.beforeFrame(); assert.equal(c.interceptGrid(f.game, original, []), true) }
    f.setTime(96000); c.beforeFrame(); const r = c.report()
    assert.equal(r.protocol, 'clear-view-grid-threshold-v1'); assert.equal(r.completed, true); assert.equal(r.phases.length, 8); assert.deepEqual(r.warnings, [])
    for (const p of r.phases) {
      assert.equal(p.gridCalls, 3); assert.equal(p.metadata.length, 2); assert.equal(p.metadata[1].stage, 'stable')
      assert.equal(p.nativeCalls, p.native ? 3 : 0); assert.equal(p.variantCalls, p.native ? 0 : 3); assert.equal(p.omittedStrokes, 0)
      if (!p.native) assert.equal(p.constructedLines, p.issuedStrokes)
      for (const m of p.metadata) {
        assert.equal(m.requested.strokeStyle, '#1129'); assert.equal(m.context.properties.lineWidth, 9); assert.equal(m.context.properties.lineCap, 'round')
        assert.equal(m.matchesPreviousReference, true)
        if (p.native) { assert.equal(m.effective, null); assert.equal(m.requested.lineCap, 'inherited'); assert.equal(m.effectiveSource, 'native-source-contract-not-intercepted') }
        else assert.deepEqual(m.effective, { lineWidth: p.lineWidth, lineCap: p.lineCap, strokeStyle: '#1129', globalAlpha: .7 })
      }
    }
    assert.deepEqual(Object.getOwnPropertyDescriptors(f.game), before); assert.equal(c.interceptGrid(f.game, original, []), false)
  })
  await test('different reference context is labeled instead of pretending to reproduce prior device threshold', () => {
    const f = fixture(); f.game.pixelRatio = 2; f.ctx.lineCap = 'butt'; f.game.canvas = { width: 120, height: 80 }
    // Leave the Canvas unchanged but expose a scaled transform to the metadata reader.
    f.game.ctx = new Proxy(f.ctx, { get(o, k) { return k === 'getTransform' ? () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) : o[k] } })
    const c = f.make(); c.start(); c.interceptGrid(f.game, original, []); c.stop('manual')
    const m = c.report().phases[0].metadata[0]
    assert.equal(m.matchesPreviousReference, false)
    assert.deepEqual(m.referenceChecks, { identityTransform: false, nativeWidthIs1_5: false, inheritedCapIsRound: false, mainCanvas: false })
  })
  await test('butt draw failure preserves exception identity and all inherited Canvas state', () => {
    const f = fixture(), c = f.make(); c.start()
    for (let i = 1; i <= 5; i++) { f.setTime(i * 12000); c.beforeFrame() }
    f.failStroke = true
    assert.throws(() => c.interceptGrid(f.game, original, []), e => e === f.boom)
    assert.equal(f.depth, 0); assert.equal(f.ctx.lineWidth, 9); assert.equal(f.ctx.lineCap, 'round'); assert.equal(f.ctx.strokeStyle, '#abcdef')
    assert.equal(c.report().stopReason, 'grid-exception'); assert.equal(c.interceptGrid(f.game, original, []), false)
  })
  await test('effective state getter failure does not prevent actual drawing', () => {
    const f = fixture(); let reads = 0
    f.game.ctx = new Proxy(f.ctx, { get(o, k) { if (k === 'lineWidth' && ++reads === 3) throw Error('read failed'); return o[k] } })
    const c = f.make(); c.start(); c.interceptGrid(f.game, original, []); f.setTime(12000); c.beforeFrame(); c.interceptGrid(f.game, original, []); c.stop('manual')
    assert.ok(f.strokes > 0); assert.equal(f.depth, 0)
    const m = c.report().phases[1].metadata[0]; assert.ok(m.effectiveError); assert.equal(m.effective, null); assert.equal(c.report().warnings.length, 1)
  })
  await test('source mismatch, ineligible mode, camera/projection changes and phase skips stop intervention', () => {
    assert.throws(() => fixture().make({ getNativeGrid: () => function bad() {} }).start(), /1.3/)
    const bad = fixture(); bad.scene.item = true; assert.throws(() => bad.make().start(), /无手持/)
    for (const change of [f => { f.scene.width++ }, f => { f.scene.projectionPitch = .6 }, f => { f.scene.projectionYaw = 1 }, f => { f.scene.alt = false }, f => { f.game.xyToUV = () => [0, 0] }, f => { f.setTime(25000) }]) {
      const f = fixture(), c = f.make(); c.start(); change(f); c.beforeFrame(); assert.equal(c.state().ablationActive, false); assert.equal(c.interceptGrid(f.game, original, []), false)
    }
  })
  await test('client records all eight groups and excludes metadata frames plus following intervals', async () => {
    const f = clientFixture(); f.game.__cattailDynamicCameraState = { pitch: .5, yaw: 0 }; f.client.start('grid-threshold'); await f.fire(3000)
    for (let i = 0; i < 8; i++) for (const t of [0, 2900, 3100, 3200, 3300, 3400, 3500]) { f.setTime(i * 12000 + t); f.game.renderloop() }
    f.setTime(96000); await f.fire(96000); await flush()
    assert.equal(f.calls[0].mode, 'grid-threshold'); assert.equal(f.calls[0].seconds, 96); assert.equal(f.report.ablation.completed, true)
    assert.equal(f.report.groups.length, 8); assert.ok(f.report.groups.every(g => g.frames - g.excluded === 3))
    for (let i = 0; i < 8; i++) { const frames = f.report.frames.slice(i * 7, (i + 1) * 7); assert.equal(frames[2].scene.ablationSettling, true); assert.equal(frames[2].comparable, false); assert.equal(frames[3].comparable, false); assert.equal(frames[4].comparable, true) }
    assert.equal(f.report.frames[0].scene.projectionPitch, .5); assert.equal(f.report.frames[0].scene.projectionYaw, 0)
    assert.equal(f.game.renderGrid, f.before.grid); assert.equal(f.game.renderloop, f.before.loop); assert.equal(f.game.renderEntitiesAbstract, f.before.abstract)
    assert.ok(f.messages.some(s => s.includes('8/8'))); assert.equal(f.jobs.size, 0); assert.equal(f.events.listenerCount('keyup'), 0)
  })
  await test('manual stop, Alt release, blur, resize, visibility and navigation restore state', async () => {
    for (const event of ['manual', 'keyup', 'blur', 'resize', 'visibilitychange', 'beforeunload']) {
      const f = clientFixture(); f.client.start('grid-threshold'); await f.fire(3000)
      for (let i = 0; i <= 5; i++) { f.setTime(i * 12000); f.game.renderloop() }
      if (event === 'manual') await f.client.finish()
      else if (event === 'visibilitychange') { f.doc.hidden = true; f.docEvents.emit('visibilitychange', { type: event }) }
      else f.events.emit(event, { type: event, key: 'Alt' })
      await flush(); assert.equal(f.game.renderloop, f.before.loop); assert.equal(f.game.renderGrid, f.before.grid); assert.equal(f.ctx.lineCap, 'round')
      assert.equal(f.client.interceptGrid(f.game, original, []), false); if (event !== 'beforeunload') assert.equal(f.report.ablation.completed, false)
    }
  })
  await test('startup cancellation and old 72-second main acknowledgement cannot activate new protocol', async () => {
    const f = clientFixture(); let release; f.gate = new Promise(r => { release = r }); f.client.start('grid-threshold'); const start = f.fire(3000); await f.client.finish(); release(); await start
    assert.ok(f.calls.some(c => c.action === 'abort')); assert.equal(f.game.renderloop, f.before.loop)
    const g = clientFixture(); g.oldMain = true; g.client.start('grid-threshold'); await g.fire(3000); assert.equal(g.client.status().phase, 'idle'); assert.ok(g.messages.at(-1).includes('96 秒')); assert.equal(g.game.renderloop, g.before.loop)
  })
  await test('96 seconds at 240 render calls and 200 updates per second preserve earliest samples', () => {
    let t = 0; const game = { renderloop() {}, updateCycle() {} }, r = createRecorder({ game, now: () => t, snapshot: () => ({ focused: true }), ablation: true }); r.start()
    for (let i = 0; i <= 23040; i++) { t = i * 1000 / 240; game.renderloop(); if (i % 6 !== 0) game.updateCycle() }
    r.stop(); const report = r.report(); assert.equal(report.frames.length, 23041); assert.equal(report.roots.length, 42241); assert.equal(report.frames[0].startMs, 0); assert.equal(report.dropped.frames, 0); assert.equal(report.dropped.roots, 0)
  })
  console.log(JSON.stringify({ passed: checks.length, checks }))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
