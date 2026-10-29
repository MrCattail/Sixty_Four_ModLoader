'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { EventEmitter } = require('node:events')
const { PHASES, drawGridVariant, geometryInfo, createGridAblation } = require('../diagnostics/clear-view-grid')
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
    make(extra = {}) { return createGridAblation({ game, now: f.now, snapshot: f.snapshot, getNativeGrid: () => original, isCurrent: () => true, onAbort: why => aborts.push(why), ...extra }) } }
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
    ipc: { on() {}, async invoke(_ch, p) { calls.push(p); if (p.action === 'start') { if (f.gate) await f.gate; return { ok: true, result: { id: 'grid', seconds: f.oldMain ? 60 : p.seconds } } }
      if (p.action === 'finish') { f.report = p.report; return { ok: true, result: { directory: 'fixture', traceStatus: 'not-requested' } } }
      return { ok: true, result: {} } } } })
  // Mirrors the private Loader native-call gate without changing layers or the Canvas object.
  f.game.renderGrid = function (...args) { if (!client.interceptGrid(this, original, args)) return original.apply(this, args) }
  f.game.renderloop = function () { this.renderEntitiesAbstract(); this.renderGrid() }
  const before = { grid: f.game.renderGrid, loop: f.game.renderloop, abstract: f.game.renderEntitiesAbstract }
  return Object.assign(f, { client, jobs, events, docEvents, calls, messages, before,
    async fire(ms) { const found = [...jobs].find(([,v]) => v.ms === ms); assert.ok(found, 'timer ' + ms); jobs.delete(found[0]); await found[1].fn() } })
}
const checks = []
async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
async function main() {
  await test('source guard matches actual 1.3 grid; variant exactly preserves baseline command stream', () => {
    assert.equal(hashMethod(original), NATIVE_HASHES.renderGrid)
    const a = fixture(), b = fixture(); original.call(a.game); drawGridVariant(b.game, {})
    assert.deepEqual(b.log, a.log); assert.deepEqual(b.currentPath, a.currentPath); assert.equal(b.depth, 0)
  })
  await test('each variant changes only approved stroke or style operation and retains inherited state', () => {
    for (const p of PHASES.filter(p => !p.native)) {
      const a = fixture(), b = fixture(); original.call(a.game)
      const count = drawGridVariant(b.game, p)
      const expected = a.log.filter(v => !(p.omitStroke && v[0] === 'stroke')).map(v => v[0] === 'set' && v[1] === 'lineWidth' && p.thin ? ['set', 'lineWidth', .5] : v[0] === 'set' && v[1] === 'strokeStyle' && p.opaque ? ['set', 'strokeStyle', '#111122'] : v)
      assert.deepEqual(b.log, expected); assert.equal(count, a.strokes); assert.equal(b.strokes, p.omitStroke ? 0 : a.strokes)
      for (const k of ['lineCap', 'lineJoin', 'globalAlpha', 'globalCompositeOperation', 'filter', 'shadowBlur']) assert.equal(b.ctx[k], a.ctx[k])
      assert.deepEqual(b.currentPath, a.currentPath)
    }
  })
  await test('geometry uses actual projections and reports known recording geometry without drawing', () => {
    const f = fixture(); Object.assign(f.game, { w: 3360, h: 1890, w2: 1680, h2: 945, unit: 21.9996, zoom: .1164 })
    const g = geometryInfo(f.game); assert.equal(g.lineCount, 524); assert.equal(g.sampledLines, 524); assert.equal(g.lengthsExact, true)
    assert.ok(Math.abs(g.lengthMax - 5741.769276907232) < 1e-6); assert.equal(f.strokes, 0)
    f.game.w *= 100; f.game.h *= 100; const huge = geometryInfo(f.game); assert.equal(huge.lengthsExact, false); assert.ok(huge.sampledLines <= 4097)
  })
  await test('all six phases run through same gate, count variants, capture context and stop without patches', () => {
    const f = fixture(), before = Object.getOwnPropertyDescriptors(f.game), c = f.make(); c.start()
    for (let i = 0; i < 6; i++) for (const t of [0, 3100, 3200]) { f.setTime(i * 12000 + t); c.beforeFrame(); assert.equal(c.interceptGrid(f.game, original, []), true) }
    f.setTime(72000); c.beforeFrame(); const r = c.report()
    assert.equal(r.completed, true); assert.equal(r.phases.length, 6); assert.deepEqual(r.warnings, [])
    for (const p of r.phases) {
      assert.equal(p.gridCalls, 3); assert.equal(p.metadata.length, 2); assert.equal(p.metadata[1].stage, 'stable')
      assert.deepEqual(p.metadata[0].context.transform, [1, 0, 0, 1, 0, 0]); assert.deepEqual(p.metadata[0].context.lineDash, [2, 3]); assert.equal(p.metadata[0].context.properties.globalAlpha, .7)
      assert.equal(p.nativeCalls, p.native ? 3 : 0); assert.equal(p.variantCalls, p.native ? 0 : 3)
      if (!p.native) assert.equal(p.constructedLines, p.issuedStrokes + p.omittedStrokes)
    }
    assert.deepEqual(Object.getOwnPropertyDescriptors(f.game), before); assert.equal(c.interceptGrid(f.game, original, []), false)
  })
  await test('unknown native source and ineligible initial scenes refuse before intervention', () => {
    const f = fixture(); assert.throws(() => f.make({ getNativeGrid: () => function unknown() {} }).start(), /1.3/)
    f.scene.item = true; assert.throws(() => f.make().start(), /无手持/); assert.equal(f.game.renderGrid, original)
  })
  await test('input, projection, game, camera and native-method changes stop intervention', () => {
    for (const change of [f => { f.scene.alt = false }, f => { f.scene.width++ }, f => { f.scene.unit++ }, f => { f.scene.projectionPitch = .6 }, f => { f.scene.focused = false }, f => { f.scene.transported = true }, f => { f.game.xyToUV = () => [0, 0] }]) {
      const f = fixture(), c = f.make(); c.start(); change(f); c.beforeFrame(); assert.equal(c.state().ablationActive, false); assert.equal(c.interceptGrid(f.game, original, []), false)
    }
    const f = fixture(); let current = true; const c = f.make({ isCurrent: () => current }); c.start(); current = false; c.beforeFrame(); assert.equal(c.report().stopReason, 'game-instance-changed')
    const a = fixture(), d = a.make(); d.start(); assert.equal(d.interceptGrid(a.game, function other() {}, []), false); assert.equal(d.report().stopReason, 'grid-method-changed')
  })
  await test('drawing exception preserves identity, canvas balance and disables future interventions', () => {
    const f = fixture(), c = f.make(); c.start(); f.setTime(12000); c.beforeFrame(); f.setTime(24000); c.beforeFrame(); f.failStroke = true
    assert.throws(() => c.interceptGrid(f.game, original, []), e => e === f.boom); assert.equal(f.depth, 0); assert.equal(c.state().ablationActive, false); assert.equal(f.ctx.lineWidth, 9)
  })
  await test('phase skips abort and late phase settling uses actual transition', () => {
    const f = fixture(), c = f.make(); c.start(); f.setTime(25000); c.beforeFrame(); assert.equal(c.report().stopReason, 'phase-skipped')
    const g = fixture(), d = g.make(); d.start(); g.setTime(12900); d.beforeFrame(); d.interceptGrid(g.game, original, []); g.setTime(15000); d.beforeFrame(); assert.equal(d.state().ablationSettling, true)
  })
  await test('metadata failures are bounded, do not block drawing, and are reported', () => {
    const f = fixture(), c = f.make()
    // A failing metadata projection is isolated from the native draw by a one-shot getter.
    let calls = 0; const xy = f.game.xyToUV; f.game.xyToUV = function (p) { if (++calls === 1) throw Error('metadata failed'); return xy.call(this, p) }
    c.start(); assert.equal(c.interceptGrid(f.game, original, []), true); assert.ok(f.strokes > 0); c.stop('manual'); assert.equal(c.report().warnings.length, 1)
  })
  await test('metadata frames and neighboring intervals are excluded; dynamic entity counts remain comparable', () => {
    const f = fixture(), c = f.make(); c.start()
    f.game.renderloop = () => { c.interceptGrid(f.game, original, []) }
    const r = createRecorder({ game: f.game, now: f.now, snapshot: () => ({ ...f.scene, ...c.state() }), beforeFrame: c.beforeFrame, ablation: true }); r.start()
    for (const t of [0, 2900, 3001, 3100, 3200, 3300]) { f.setTime(t); f.scene.entities++; f.game.renderloop() }
    r.stop(); c.stop('manual'); const frames = r.report().frames
    assert.equal(frames[2].scene.ablationSettling, true); assert.equal(frames[2].comparable, false); assert.equal(frames[3].comparable, false)
    assert.equal(frames[4].comparable, true); assert.equal(frames[4].strictlyComparable, false)
  })
  await test('client completes all six groups, restores recorder, and accepts 72-second acknowledgement', async () => {
    const f = clientFixture(); f.client.start('grid-ablation'); await f.fire(3000)
    for (let i = 0; i < 6; i++) for (const t of [0, 3100, 3200, 3300, 3400, 3500]) { f.setTime(i * 12000 + t); f.game.renderloop() }
    f.setTime(72000); await f.fire(72000); await flush()
    assert.equal(f.calls[0].mode, 'grid-ablation'); assert.equal(f.calls[0].seconds, 72); assert.equal(f.report.ablation.completed, true)
    assert.equal(f.report.groups.length, 6); assert.ok(f.report.groups.every(g => g.frames - g.excluded >= 3))
    assert.equal(f.game.renderGrid, f.before.grid); assert.equal(f.game.renderloop, f.before.loop); assert.equal(f.game.renderEntitiesAbstract, f.before.abstract)
    assert.ok(f.messages.some(s => s.includes('6/6'))); assert.equal(f.jobs.size, 0); assert.equal(f.events.listenerCount('keyup'), 0)
  })
  await test('Alt release, blur, resize and unload restore recorder and stop private gate', async () => {
    for (const event of ['keyup', 'blur', 'resize', 'beforeunload']) {
      const f = clientFixture(); f.client.start('grid-ablation'); await f.fire(3000); f.game.renderloop(); f.events.emit(event, { type: event, key: 'Alt' }); await flush()
      assert.equal(f.game.renderloop, f.before.loop); assert.equal(f.game.renderGrid, f.before.grid); assert.equal(f.client.interceptGrid(f.game, original, []), false)
      if (event !== 'beforeunload') assert.equal(f.report.ablation.completed, false)
    }
  })
  await test('pending startup cancellation and stale process cannot activate drawing intervention', async () => {
    const f = clientFixture(); let release; f.gate = new Promise(r => { release = r }); f.client.start('grid-ablation'); const start = f.fire(3000); await f.client.finish(); release(); await start
    assert.ok(f.calls.some(c => c.action === 'abort')); assert.equal(f.game.renderloop, f.before.loop)
    const g = clientFixture(); g.oldMain = true; g.client.start('grid-ablation'); await g.fire(3000); assert.equal(g.client.status().phase, 'idle'); assert.ok(g.messages.at(-1).includes('72 秒')); assert.equal(g.game.renderloop, g.before.loop)
  })
  await test('72-second frame and root capacity preserves earliest groups at 240 fps plus 200 updates/s', () => {
    let t = 0; const game = { renderloop() {}, updateCycle() {} }, r = createRecorder({ game, now: () => t, snapshot: () => ({ focused: true }), ablation: true }); r.start()
    for (let i = 0; i <= 17280; i++) { t = i * 1000 / 240; game.renderloop(); if (i % 6 !== 0) game.updateCycle() }
    r.stop(); const report = r.report(); assert.equal(report.frames.length, 17281); assert.equal(report.dropped.frames, 0); assert.equal(report.dropped.roots, 0)
  })
  console.log(JSON.stringify({ passed: checks.length, checks }))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
