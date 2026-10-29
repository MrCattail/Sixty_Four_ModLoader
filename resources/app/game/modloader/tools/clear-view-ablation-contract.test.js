'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { createAblation, hashMethod, NATIVE_HASHES, PHASES } = require('../diagnostics/clear-view-ablation')
const { createRecorder, createClient } = require('../diagnostics/clear-view-probe')
const source = fs.readFileSync(path.join(__dirname, '../../scripts/game.js'), 'utf8')
function native(name, next) {
  const a = source.indexOf('\t' + name + '(') + 1, b = source.indexOf('\n\t' + next + '(', a)
  assert.ok(a > 0 && b > a)
  return Function('return ({' + source.slice(a, b).trim() + '})')()[name]
}
const abstract = native('renderEntitiesAbstract', 'updateUnfilled')
const grid = native('renderGrid', 'drawResourceInScreenCoordinates')
const checks = []
async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
function fixture() {
  let clock = 0
  const log = [], aborts = [], phases = [], ctx = {}, f = { log, aborts, phases }
  for (const method of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'clip', 'stroke', 'fill']) ctx[method] = (...args) => log.push([method, ...args])
  const game = Object.create({ renderEntitiesAbstract: abstract, renderGrid: grid })
  Object.assign(game, { canvas: { width: 1280, height: 800 }, ctx, w: 1280, h: 800, unit: 20, zoom: .5, plane: 0, pixelRatio: 1,
    translation: [0, 0], altActive: true, isVisible: e => !e.hidden, uvToXY: p => p.map(v => v * 10),
    xyToUV: p => p.map(v => v / 200), uvToXYUntranslated: p => p.map(v => v * 200),
    renderloop(dt) { this.renderEntitiesAbstract(dt); if (!f.client?.skipGrid(game, grid) && !f.ablation?.skipGrid(game, grid)) this.renderGrid() }
  })
  const entity = (name, position, span, hidden) => ({ name, position, entitySpan: span, hidden, render(dt) {
    log.push(['entity', name, dt]); ctx.clip(); log.push(['inner-clip-end']); if (f.throwEntity) throw f.boom
  } })
  game.stuff = [entity('one', [1, 2]), entity('wide', [-1, 3], 2), entity('conductor', [0, 0]), entity('hidden', [0, 0], 0, true)]
  f.game = game; f.boom = new Error('entity failed')
  f.scene = { width: 1280, height: 800, windowWidth: 1280, windowHeight: 800, dpr: 1, gamePixelRatio: 1,
    zoom: .5, cameraX: 0, cameraY: 0, plane: 0, alt: true, focused: true, entities: 4 }
  f.snapshot = () => ({ ...f.scene })
  f.now = () => clock
  f.setTime = t => { clock = t }
  f.make = extra => createAblation({ game, now: f.now, snapshot: f.snapshot, getNativeGrid: () => grid,
    onAbort: why => aborts.push(why), onPhase: (_, i) => phases.push(i), ...extra })
  f.run = () => { log.length = 0; game.renderloop(17); return structuredClone(log) }
  return f
}
function dropOuterClips(log) {
  return log.filter((entry, i) => entry[0] !== 'clip' || log[i - 1]?.[0] === 'entity')
}
function clientFixture() {
  const f = fixture(), jobs = new Map(), events = new EventEmitter(), docEvents = new EventEmitter()
  let id = 0
  const doc = { hidden: false, hasFocus: () => true, addEventListener: (...a) => docEvents.on(...a), removeEventListener: (...a) => docEvents.off(...a) }
  const win = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, performance: { now: f.now, timeOrigin: 123456 },
    setTimeout(fn, ms) { jobs.set(++id, { fn, at: f.now() + ms }); return id }, clearTimeout(i) { jobs.delete(i) },
    addEventListener: (...a) => events.on(...a), removeEventListener: (...a) => events.off(...a) }
  const calls = [], messages = []
  const client = createClient({ window: win, document: doc, getGame: () => f.game, getNativeGrid: () => grid,
    notify: x => messages.push(x), isMenuOpen: () => false,
    ipc: { on() {}, async invoke(_channel, payload) {
      calls.push(payload)
      if (payload.action === 'start') { if (f.startGate) await f.startGate; return { ok: true, result: { id: 'test', seconds: f.oldMain ? 20 : payload.seconds } } }
      if (payload.action === 'finish') { f.report = payload.report; return { ok: true, result: { directory: 'isolated-fixture', traceStatus: 'not-requested' } } }
      return { ok: true, result: {} }
    } }
  })
  Object.assign(f, { client, jobs, calls, messages, events, docEvents, doc, win })
  f.advance = async to => {
    f.setTime(to)
    for (const [i, job] of [...jobs]) if (job.at <= to) { jobs.delete(i); await job.fn() }
    await Promise.resolve(); await Promise.resolve()
  }
  f.flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  return f
}

async function main() {
  await test('source guards match both actual native 1.3 methods', () => {
    assert.equal(hashMethod(abstract), NATIVE_HASHES.renderEntitiesAbstract)
    assert.equal(hashMethod(grid), NATIVE_HASHES.renderGrid)
  })
  await test('five variants change only outer clip and native grid; inner entity clip survives', () => {
    const f = fixture(), before = f.run(), original = f.game.renderEntitiesAbstract
    f.log.length = 0; abstract.call(f.game, 17); const abstractOnly = structuredClone(f.log)
    f.ablation = f.make(); f.ablation.start()
    for (let i = 0; i < PHASES.length; i++) {
      f.setTime(i * 12000); f.ablation.beforeFrame()
      let expected = before
      if (!PHASES[i].grid) expected = abstractOnly
      if (!PHASES[i].clip) expected = dropOuterClips(expected)
      assert.deepEqual(f.run(), expected, PHASES[i].id)
      assert.equal(f.log.filter(e => e[0] === 'entity').length, 2)
    }
    f.ablation.stop('duration'); assert.equal(f.game.renderEntitiesAbstract, original)
    assert.equal(Object.hasOwn(f.game, 'renderEntitiesAbstract'), false)
    assert.deepEqual(f.run(), before)
    assert.deepEqual(f.phases, [0, 1, 2, 3, 4])
  })
  await test('unknown method or missing bridge refuses before any method is changed', () => {
    const f = fixture(); f.game.renderEntitiesAbstract = function unknown() {}
    const before = f.game.renderEntitiesAbstract
    assert.throws(() => f.make().start(), /已验证的 1.3/); assert.equal(f.game.renderEntitiesAbstract, before)
    const g = fixture(); assert.throws(() => g.make({ getNativeGrid: () => null }).start(), /已验证的 1.3/)
    assert.equal(Object.hasOwn(g.game, 'renderEntitiesAbstract'), false)
  })
  await test('drawing failure restores canvas balance, preserves exception identity and restores stacked descriptors', () => {
    const f = fixture(); f.ablation = f.make(); f.ablation.start()
    const r = createRecorder({ game: f.game, now: f.now }); r.start()
    f.setTime(12000); f.ablation.beforeFrame(); f.throwEntity = true
    assert.throws(() => f.game.renderloop(17), e => e === f.boom)
    assert.equal(f.log.filter(e => e[0] === 'save').length, f.log.filter(e => e[0] === 'restore').length)
    r.stop(); f.ablation.stop('failed'); assert.equal(f.game.renderEntitiesAbstract, abstract)
    assert.deepEqual(f.aborts, ['draw-exception'])
    assert.deepEqual(f.ablation.report().warnings, [])
  })
  await test('input/focus/camera/size changes abort and dynamic entity counts do not', () => {
    for (const change of [{ alt: false }, { item: true }, { transported: true }, { focused: false }, { hidden: true }, { menuOpen: true }, { halt: true }, { resizing: true }, { zoom: .3 }, { width: 1920 }, { cameraX: 1 }, { plane: 1 }]) {
      const f = fixture(), a = f.make(); a.start(); Object.assign(f.scene, change); a.beforeFrame()
      assert.equal(a.state().ablationActive, false); assert.equal(f.aborts.length, 1); a.stop('manual')
      assert.equal(f.game.renderEntitiesAbstract, abstract)
    }
    const f = fixture(), a = f.make(); a.start(); f.scene.entities++; a.beforeFrame(); assert.equal(a.state().ablationActive, true); a.stop('manual')
  })
  await test('late frames cannot silently skip a group and settling follows actual first frame', () => {
    const f = fixture(), a = f.make(); a.start(); f.setTime(12999); a.beforeFrame()
    f.setTime(15998); assert.equal(a.state().ablationSettling, true)
    f.setTime(15999); assert.equal(a.state().ablationSettling, false)
    f.setTime(36000); a.beforeFrame(); assert.deepEqual(f.aborts, ['phase-skipped']); a.stop('manual')
  })
  await test('later wrappers remain installed but the retained intervention becomes inert', () => {
    const f = fixture(), before = f.run(), a = f.make(); a.start(); f.setTime(12000); a.beforeFrame()
    const ours = f.game.renderEntitiesAbstract, later = function (...args) { return ours.apply(this, args) }
    f.game.renderEntitiesAbstract = later; a.stop('manual')
    assert.equal(f.game.renderEntitiesAbstract, later); assert.deepEqual(f.run(), before); assert.equal(a.report().warnings.length, 1)
  })
  await test('summary keeps fluctuating entity counts but excludes phase boundaries and both settling ends', () => {
    const f = fixture(); f.ablation = f.make(); f.ablation.start()
    const r = createRecorder({ game: f.game, now: f.now, snapshot: () => ({ ...f.scene, ...f.ablation.state() }), beforeFrame: () => f.ablation.beforeFrame() }); r.start()
    for (const t of [2999, 3000, 3016, 12000, 15000, 15016]) { f.setTime(t); f.scene.entities++; f.game.renderloop(17) }
    r.stop(); f.ablation.stop('manual'); const report = r.report()
    assert.deepEqual(report.frames.map(x => x.comparable), [false, false, true, false, false, true])
    assert(report.frames.every(x => !x.strictlyComparable)); assert.equal(report.groups.length, 2)
    assert.equal(report.groups[0].entitiesMax - report.groups[0].entitiesMin, 2)
  })
  await test('ablation has room for sixty seconds at 240 fps without dropping earliest groups', () => {
    const game = { renderloop() {} }, r = createRecorder({ game, ablation: true, now: () => 0 })
    r.start(); for (let i = 0; i < 14401; i++) game.renderloop(); r.stop()
    assert.equal(r.report().dropped.frames, 0); assert.equal(r.report().frames.length, 14401)
  })
  await test('client runs all five phases, exports and restores through the real recorder', async () => {
    const f = clientFixture(); f.client.start('ablation'); await f.advance(3000)
    for (let t = 3000; t < 63000; t += 1000) { await f.advance(t); f.game.renderloop(17) }
    await f.advance(63000); await f.flush()
    assert.equal(f.client.status().phase, 'idle'); assert.equal(f.report.ablation.completed, true)
    assert.equal(f.report.ablation.phases.length, 5); assert.equal(f.report.groups.length, 5)
    assert.deepEqual(f.report.ablation.warnings, []); assert.equal(f.game.renderEntitiesAbstract, abstract)
    assert.equal(f.jobs.size, 0); assert.equal(f.events.listenerCount('keyup'), 0)
    assert(f.report.ablation.phases[2].gridOmissions > 0)
    assert(f.report.ablation.phases[1].noClipCalls > 0)
  })
  await test('client Alt release and focus loss restore before asynchronous export completes', async () => {
    for (const type of ['keyup', 'blur', 'resize']) {
      const f = clientFixture(); f.client.start('ablation'); await f.advance(3000); await f.advance(16000); f.game.renderloop(17)
      f.events.emit(type, { type, key: 'Alt' }); await f.flush()
      assert.equal(f.game.renderEntitiesAbstract, abstract); assert.equal(f.report.ablation.completed, false)
      assert.equal(f.client.status().phase, 'idle'); assert.equal(f.jobs.size, 0)
    }
  })
  await test('client can cancel countdown or pending IPC without leaving a session or patches', async () => {
    const f = clientFixture(); f.client.start('ablation'); await f.client.finish(); await f.advance(3000)
    assert.equal(f.calls.length, 0); assert.equal(f.client.status().phase, 'idle')
    const g = clientFixture(); let release; g.startGate = new Promise(r => { release = r })
    g.client.start('ablation'); const arming = g.advance(3000); await g.client.finish(); release(); await arming; await g.flush()
    assert.equal(g.client.status().phase, 'idle'); assert(g.calls.some(c => c.action === 'abort'))
    assert.equal(g.game.renderEntitiesAbstract, abstract); assert.equal(g.jobs.size, 0)
  })
  await test('client refuses stale main process and unload restores in-flight intervention', async () => {
    const f = clientFixture(); f.oldMain = true; f.client.start('ablation'); await f.advance(3000)
    assert.equal(f.game.renderEntitiesAbstract, abstract); assert(f.messages.some(x => x.includes('重启')))
    const g = clientFixture(); g.client.start('ablation'); await g.advance(3000); await g.advance(16000); g.game.renderloop(17)
    g.events.emit('beforeunload', { type: 'beforeunload' }); assert.equal(g.game.renderEntitiesAbstract, abstract); assert.equal(g.jobs.size, 0)
  })
  console.log(JSON.stringify({ passed: checks.length, checks }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
