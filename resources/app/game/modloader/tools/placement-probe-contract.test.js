'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const placement = require('../diagnostics/placement-probe')
const { createRecorder, createClient } = require('../diagnostics/clear-view-probe')
const { createService } = require('../diagnostics/clear-view-main')
const source = fs.readFileSync(process.env.SF_PLACEMENT_GAME_SOURCE || path.join(__dirname, '../../scripts/game.js'), 'utf8')
function native(name) {
  const match = source.match(new RegExp('^\\t' + name + '\\([^\\r\\n]*\\)\\{[\\s\\S]*?^\\t\\}', 'm'))
  assert.ok(match, name)
  return vm.runInNewContext('({' + match[0] + '})')[name]
}
const originals = Object.fromEntries(['renderGrid', 'renderEntitiesAbstract', 'xyToUV', 'uvToXY', 'uvToXYUntranslated'].map(name => [name, native(name)]))
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }

function fixture(options = {}) {
  let clock = 0
  const log = [], stack = [], state = { lineCap: 'round', lineWidth: 1, fillStyle: 'initial', strokeStyle: 'initial' }
  const ctx = {}
  for (const key of Object.keys(state)) Object.defineProperty(ctx, key, { get: () => state[key], set(value) { state[key] = value; log.push(['set', key, value]) } })
  for (const key of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill', 'clip']) ctx[key] = (...args) => log.push([key, ...args])
  ctx.save = () => { stack.push({ ...state }); log.push(['save']) }
  ctx.restore = () => { Object.assign(state, stack.pop()); log.push(['restore']) }
  const proto = { ...originals }, controller = options.noHooks ? null : placement.installNativeHooks(proto)
  const f = { log, state, proto, controller, aborts: [], phases: [], lookupCount: 0, now: () => clock += .001, setTime: value => { clock = value } }
  const game = Object.assign(Object.create(proto), { ctx, canvas: { width: 1280, height: 720 }, w: 1280, h: 720, w2: 640, h2: 360,
    version: '1.3', pixelRatio: 1, zoom: .3, unit: 21.6, translation: [0, 0], plane: 0,
    itemInHand: { name: 'candidate' }, hoveredCell: [0, 0], codex: { entities: { candidate: {} } },
    isVisible: e => !e.hidden,
    stuffMap: new Proxy({ u0v0: { name: 'occupied' } }, { get(target, key) { f.lookupCount++; return target[key] } }) })
  game.stuff = [['A', [0, 0]], ['conductor', [1, 0]], ['hidden', [2, 0]]].map(([name, position]) => ({ name, position, hidden: name === 'hidden', render(dt) {
    log.push(['entity', name, dt]); ctx.save(); ctx.beginPath(); ctx.clip(); ctx.fillStyle = 'internal'; ctx.fill(); ctx.restore()
    if (f.throwEntity) throw f.error
  }, darkrender(dt) { log.push(['dark', name, dt]) } }))
  const scene = { width: 1280, height: 720, windowWidth: 1280, windowHeight: 720, dpr: 1, gamePixelRatio: 1, focused: true, hidden: false,
    item: true, itemType: 'candidate', hovered: true, hoveredX: 0, hoveredY: 0, plane: 0, configSignature: '{}',
    zoom: .3, unit: 21.6, cameraX: 0, cameraY: 0, projectionPitch: null, projectionYaw: null, entities: 3 }
  const snapshot = () => ({ ...scene })
  const make = extra => placement.createPlacementCapture({ game, controller, snapshot, now: f.now, onAbort: reason => f.aborts.push(reason), onPhase: phase => f.phases.push(phase.id), ...extra })
  const draw = dt => { game.renderEntitiesAbstract(dt); game.renderGrid() }
  Object.assign(f, { game, scene, snapshot, make, draw,
    frame(capture, dt = 17) { capture.beforeFrame(); const s = capture.state(); draw(dt); return { s, data: capture.afterFrame({ methods: { renderGrid: 1, renderEntitiesAbstract: 1 } }) } } })
  return f
}

function serviceFixture() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-contract-')), jobs = new Set(), sender = new EventEmitter(), mainFrame = {}
  const f = { output, jobs, starts: 0, stops: 0, sent: [], devtools: false }
  sender.mainFrame = mainFrame; sender.isDestroyed = () => false; sender.send = (...args) => f.sent.push(args)
  sender.isDevToolsOpened = () => f.devtools
  const win = { webContents: sender, getBounds: () => ({}), getContentBounds: () => ({}), isFullScreen: () => false, isDestroyed: () => false }
  const service = createService({ outputRoot: output, getWindow: () => win, isOtherBusy: () => f.otherBusy,
    timers: { setTimeout(fn, ms) { const job = { fn, ms }; jobs.add(job); return job }, clearTimeout(job) { jobs.delete(job) } },
    electron: { ipcMain: { handle() {} }, app: { getGPUFeatureStatus: () => ({}), getGPUInfo: async () => ({ gpuDevice: [] }) },
      screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) }, shell: { openPath: async () => '' },
      contentTracing: { getCategories: async () => f.categories || ['devtools.timeline', 'blink.user_timing'], startRecording: async () => { f.starts++ },
        stopRecording: async file => { f.stops++; fs.writeFileSync(file, f.binaryTrace ? Buffer.from([10, 2, 8, 1]) : '{"traceEvents":[]}') } } } })
  Object.assign(f, { call: payload => service.handle({ sender, senderFrame: mainFrame }, payload), service, sender, mainFrame })
  return f
}
function clientFixture(options = {}) {
  const f = fixture(), events = new EventEmitter(), docEvents = new EventEmitter(), jobs = new Map(), calls = [], messages = []
  let id = 0, time = 0
  const win = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => time, timeOrigin: 100 },
    setTimeout(fn, ms) { jobs.set(++id, { fn, ms }); return id }, clearTimeout(key) { jobs.delete(key) },
    addEventListener: (...args) => events.on(...args), removeEventListener: (...args) => events.off(...args) }
  const doc = { hidden: false, hasFocus: () => true, addEventListener: (...args) => docEvents.on(...args), removeEventListener: (...args) => docEvents.off(...args) }
  Object.assign(f.game, { renderloop() { f.draw(17) } })
  const client = createClient({ window: win, document: doc, getGame: () => f.game, getPlacementController: () => f.controller,
    placementConfiguration: () => ({}), notify: text => messages.push(text),
    ipc: { on() {}, async invoke(channel, payload) {
      calls.push(payload)
      if (payload.action === 'start') return { ok: true, result: { id: 'test', seconds: payload.seconds } }
      if (payload.action === 'finish') { f.report = payload.report; return { ok: true, result: { directory: 'synthetic', traceStatus: 'not-requested' } } }
      return { ok: true, result: {} }
    } }, ...options })
  return Object.assign(f, { client, events, docEvents, jobs, calls, messages, win,
    advance(ms) { time += ms },
    async fire(ms) { const entry = [...jobs].find(([, job]) => job.ms === ms); assert.ok(entry, 'timer ' + ms); jobs.delete(entry[0]); time += ms; await entry[1].fn(); await Promise.resolve(); await Promise.resolve() } })
}

async function main() {
  await check('official source guards accept both current methods and reject deliberately changed or unknown source', () => {
    for (const [name, hash] of Object.entries(placement.NATIVE_HASHES)) assert.equal(placement.hashMethod(originals[name]), hash)
    assert.throws(() => placement.compileNativeMethod('renderGrid', function renderGrid() {}, {}), /1.3.0.1/)
    const changed = Function('return ({' + originals.renderGrid.toString().replace('this.ctx.stroke()', 'this.ctx.fill()') + '})')().renderGrid
    assert.throws(() => placement.compileNativeMethod('renderGrid', changed, {}), /1.3.0.1/)
    assert.equal(Object.values(placement.installNativeHooks({ renderGrid() {}, renderEntitiesAbstract() {} }).describe()).some(v => v.supported), false)
  })
  await check('idle delegations preserve exact native commands, state, order, arguments and return value', () => {
    const raw = fixture({ noHooks: true }), idle = fixture()
    raw.draw(71); idle.draw(71)
    assert.deepEqual(idle.log, raw.log); assert.deepEqual(idle.state, raw.state); assert.equal(idle.game.renderGrid(), undefined)
    assert.equal(placement.installNativeHooks(idle.proto), idle.controller)
  })
  await check('detailed, raw and timed observations preserve exact original commands including conductor and internal clip/fill', () => {
    const raw = fixture({ noHooks: true }), f = fixture(), capture = f.make()
    capture.start()
    for (const kind of ['detail', 'raw', 'timed']) {
      raw.log.length = f.log.length = 0; raw.draw(91)
      const result = f.frame(capture, 91)
      assert.equal(result.data.kind, kind); assert.deepEqual(f.log, raw.log); assert.deepEqual(f.state, raw.state)
    }
    capture.stop(); assert.equal(f.frame(capture).data, null)
  })
  await check('scan counts are derived from executed native bounds; Alt has no placement scan', () => {
    const f = fixture(), capture = f.make(); capture.start()
    for (const [zoom, expected] of [[1, 400], [.5, 1600], [.3, 4624], [.12, 28224], [.06, 114244], [.03, 456976]]) {
      f.game.zoom = zoom; f.game.unit = 72 * zoom; f.scene.zoom = zoom; f.scene.unit = f.game.unit; f.lookupCount = 0
      const data = f.frame(capture).data
      if (data.grid) assert.equal(data.grid.executedCells, expected)
      assert.equal(f.lookupCount, expected)
    }
    delete f.game.itemInHand; f.scene.item = false; f.scene.itemType = ''; f.scene.alt = true; f.lookupCount = 0
    const data = f.frame(capture).data; assert.equal(data.grid.executedCells, 0); assert.equal(f.lookupCount, 0)
    capture.stop()
  })
  await check('five phases omit only requested native commands and keep first/last output and world state', () => {
    const f = fixture(), capture = f.make({ comparison: true }), world = JSON.stringify({ stuff: f.game.stuff.map(e => [e.name, e.position]), held: f.game.itemInHand })
    capture.start(); const outputs = []
    for (let index = 0; index < 5; index++) {
      f.setTime(index * 12000 + 1); f.log.length = 0; f.lookupCount = 0
      const row = f.frame(capture); outputs.push(structuredClone(f.log))
      assert.equal(row.data.phase, placement.PHASES[index].id)
      assert.equal(row.data.nativeCalls.renderEntitiesAbstract, 1)
      assert.equal(f.lookupCount, index === 1 ? 0 : 4624)
      assert.equal(f.log.filter(v => v[0] === 'stroke').length, index === 2 ? 0 : 138)
      assert.equal(f.log.filter(v => v[0] === 'fill').length, index === 1 ? 4 : index === 3 ? 3 : 5)
      assert.equal(f.log.filter(v => v[0] === 'clip').length, 2)
      assert.equal(JSON.stringify({ stuff: f.game.stuff.map(e => [e.name, e.position]), held: f.game.itemInHand }), world)
    }
    assert.deepEqual(outputs[0], outputs[4]); f.setTime(60001); capture.beforeFrame(); assert.equal(capture.report().completed, true)
    assert.equal(capture.report().phases.length, 5)
  })
  await check('no raw sample silently disables an intervention during a comparison', () => {
    const f = fixture(), capture = f.make({ comparison: true }); capture.start(); f.frame(capture)
    f.setTime(12001); const data = f.frame(capture).data; assert.equal(data.kind, 'timed'); assert.equal(data.grid.executedCells, 0); capture.stop()
  })
  await check('configuration conflicts, unknown hooks, handheld/plane/tools and bypassed leaves fail closed', () => {
    for (const key of ['disableClearViewGrid', 'useTweaksClearViewGridStyle', 'disableClearViewBuildingClipping']) {
      const f = fixture(); f.scene.configSignature = JSON.stringify({ [key]: true }); assert.throws(() => f.make({ comparison: true }).start(), /设置/)
    }
    assert.throws(() => fixture({ noHooks: true }).make().start(), /原生入口/)
    for (const change of [{ plane: 1 }, { item: false }, { itemType: 'eraser2' }, { transported: true }, { interactionMode: 'clone' }]) {
      const f = fixture(); Object.assign(f.scene, change); assert.throws(() => f.make({ comparison: true }).start(), /放置对照需要/)
    }
    const f = fixture(), capture = f.make({ comparison: true }); capture.start(); f.proto.renderEntitiesAbstract = () => {}
    f.frame(capture); assert.ok(f.aborts.includes('native-path-bypassed')); assert.equal(capture.report().completed, false)
  })
  await check('later wrappers remain in call chain and are preserved after stop/disposal', () => {
    const f = fixture(), original = f.proto.renderGrid; let calls = 0
    const later = function (...args) { calls++; return original.apply(this, args) }
    f.proto.renderGrid = later; const capture = f.make(); capture.start(); f.frame(capture); capture.stop(); f.draw(1)
    assert.equal(calls, 2); f.controller.dispose(); assert.equal(f.proto.renderGrid, later); f.draw(2); assert.equal(calls, 3)
  })
  await check('native entity exceptions are the same object and cleanup restores delegation', () => {
    const f = fixture(), capture = f.make(), boom = new Error('sentinel'); f.throwEntity = true; f.error = boom
    capture.start(); capture.beforeFrame(); assert.throws(() => f.draw(1), error => error === boom)
    assert.equal(capture.report().stopReason, 'native-draw-exception'); f.throwEntity = false; f.draw(2)
  })
  await check('camera/hover/size/hand/config/projection/instance/focus changes stop controls without issuing world actions', () => {
    for (const change of [{ zoom: .1 }, { hoveredX: 2 }, { width: 800 }, { configSignature: '{"x":1}' }, { focused: false }]) {
      const f = fixture(), capture = f.make({ comparison: true }); capture.start(); Object.assign(f.scene, change); capture.beforeFrame(); assert.equal(capture.state().placementActive, false)
    }
    for (const mutate of [f => { f.game.itemInHand = { name: 'candidate' } }, f => { f.game.xyToUV = () => [0, 0] }]) {
      const f = fixture(), capture = f.make({ comparison: true }); capture.start(); mutate(f); capture.beforeFrame(); assert.equal(capture.state().placementActive, false)
    }
    const f = fixture(); let current = true; const capture = f.make({ isCurrent: () => current }); capture.start(); current = false; capture.beforeFrame(); assert.equal(capture.report().stopReason, 'game-instance-changed')
  })
  await check('detail samples and their adjacent intervals are excluded while original/timed frames remain available', () => {
    const f = fixture(), capture = f.make(); f.game.renderloop = () => f.draw(17); capture.start()
    const recorder = createRecorder({ game: f.game, now: f.now, snapshot: () => ({ ...f.snapshot(), ...capture.state() }), beforeFrame: () => capture.beforeFrame(), afterFrame: frame => { frame.placement = capture.afterFrame(frame) } })
    recorder.start(); for (let i = 0; i < 40; i++) f.game.renderloop(); recorder.stop(); capture.stop('duration')
    const report = recorder.report(); assert.equal(report.frames[0].comparable, false); assert.equal(report.frames[1].comparable, false)
    assert.equal(report.frames[30].comparable, false); assert.equal(report.frames[31].comparable, false); assert.equal(report.frames[5].comparable, true)
    assert.equal(report.frames[1].placement.kind, 'raw'); assert.equal(report.frames[0].placement.detail.entityCalls, 2)
  })
  await check('client uses 20/60 seconds, exports placement reports and removes listeners on stop', async () => {
    for (const mode of ['placement-light', 'placement-ablation']) {
      const f = clientFixture(); f.client.start(mode); await f.fire(3000); assert.equal(f.client.status().phase, 'recording')
      f.game.renderloop(); await f.client.finish('duration')
      assert.equal(f.report.placement.protocol, 'placement-v1'); assert.equal(f.calls[0].seconds, mode === 'placement-light' ? 20 : 60)
      assert.equal(f.events.listenerCount('modloader:config-preview'), 0); assert.equal(f.events.listenerCount('blur'), 0)
    }
  })
  await check('client countdown cancellation and config changes clean up before export', async () => {
    const f = clientFixture(); f.client.start('placement-light'); await f.client.finish(); assert.equal(f.jobs.size, 0); assert.equal(f.calls.length, 0)
    f.client.start('placement-light'); await f.fire(3000); f.game.renderloop(); f.events.emit('modloader:config-preview', { type: 'modloader:config-preview' })
    for (let i = 0; i < 10; i++) await Promise.resolve()
    assert.equal(f.report.placement.completed, false); assert.equal(f.client.status().phase, 'idle')
  })
  await check('main process pins 20/60 seconds, respects owner/mutual exclusion and exports summaries', async () => {
    const f = serviceFixture(); f.otherBusy = true; assert.equal((await f.call({ action: 'start', mode: 'placement-light' })).ok, false); f.otherBusy = false
    const start = await f.call({ action: 'start', mode: 'placement-ablation', seconds: 999 }); assert.equal(start.result.seconds, 60)
    assert.equal((await f.call({ action: 'start', mode: 'light' })).ok, false)
    assert.equal((await f.service.handle({ sender: f.sender, senderFrame: {} }, { action: 'abort', id: start.result.id })).ok, false)
    const report = { schemaVersion: 1, frames: [], methods: [], groups: [], placement: { protocol: 'placement-v1', comparison: true, completed: false, phases: [], warnings: [], limitations: [], detailEvery: 30 } }
    const done = await f.call({ action: 'finish', id: start.result.id, report }); assert.equal(done.result.status, 'incomplete')
    assert.ok(fs.readFileSync(path.join(done.result.directory, 'summary.md'), 'utf8').includes('新版放置细分'))
    assert.equal(f.jobs.size, 0)
    const next = await f.call({ action: 'start', mode: 'placement-light', seconds: 5 }); assert.equal(next.result.seconds, 20); await f.call({ action: 'abort', id: next.result.id })
  })
  await check('deep placement traces use existing safe categories and stop; oversized reports reject', async () => {
    const f = serviceFixture(); f.devtools = true; assert.equal((await f.call({ action: 'start', mode: 'placement-deep' })).ok, false); f.devtools = false
    const start = await f.call({ action: 'start', mode: 'placement-deep' }); assert.equal(f.starts, 1); assert.equal(start.result.seconds, 20)
    const invalid = { schemaVersion: 1, frames: new Array(12001), methods: [], groups: [] }
    assert.equal((await f.call({ action: 'finish', id: start.result.id, report: invalid })).ok, false)
    await f.call({ action: 'abort', id: start.result.id }); assert.equal(f.stops, 1)
  })
  await check('Perfetto native bytes keep their format and correct extension; incomplete discovery requests only fixed categories', async () => {
    const f = serviceFixture(); f.binaryTrace = true; f.categories = []
    const start = await f.call({ action: 'start', mode: 'placement-deep' }); assert.equal(start.ok, true)
    assert.ok([...f.jobs].some(job => job.ms === 21000), 'bounded watchdog includes marker-flush grace')
    const report = { schemaVersion: 1, frames: [], methods: [], groups: [], placement: { protocol: 'placement-v1', comparison: false, completed: false, phases: [], warnings: [], limitations: [] } }
    const done = await f.call({ action: 'finish', id: start.result.id, report }); assert.equal(done.ok, true)
    const session = JSON.parse(fs.readFileSync(path.join(done.result.directory, 'session.json')))
    assert.equal(session.trace.categoryDiscoveryIncomplete, true); assert.equal(session.trace.format, 'perfetto-protobuf')
    assert.equal(session.trace.fileName, 'trace.pftrace'); assert.equal(fs.existsSync(path.join(done.result.directory, 'trace.json')), false)
    assert.deepEqual(fs.readFileSync(path.join(done.result.directory, 'trace.pftrace')), Buffer.from([10, 2, 8, 1]))
    assert.ok(session.trace.categories.includes('blink.user_timing')); assert.ok(!session.trace.categories.includes('disabled-by-default-devtools.timeline'))
  })
  await check('zero samples cannot become a complete recording; later duplicate native calls are not silently attributed', async () => {
    const f = fixture(), capture = f.make(); capture.start(); capture.stop('duration'); assert.equal(capture.report().completed, false)
    const s = serviceFixture(), start = await s.call({ action: 'start', mode: 'placement-light' })
    const report = { schemaVersion: 1, frames: [], methods: [], groups: [], placement: { protocol: 'placement-v1', comparison: false, completed: true, phases: [{}], warnings: [], limitations: [] } }
    assert.equal((await s.call({ action: 'finish', id: start.result.id, report })).ok, false)
    await s.call({ action: 'abort', id: start.result.id })
    const g = fixture(), c = g.make(); c.start(); c.beforeFrame(); g.draw(17); g.game.renderGrid()
    const row = c.afterFrame({ methods: { renderGrid: 2, renderEntitiesAbstract: 1 } }); assert.equal(row.grid, null)
    c.stop(); assert.ok(c.report().warnings.some(w => w.includes('repeated native calls')))
  })
  await check('scene observer failure stops diagnostics while retaining native draw behavior', () => {
    const f = fixture(); let broken = false
    const capture = f.make({ snapshot() { if (broken) throw new Error('observer failure'); return f.snapshot() } })
    capture.start(); broken = true; assert.doesNotThrow(() => capture.beforeFrame()); assert.equal(capture.report().stopReason, 'scene-unavailable')
    assert.doesNotThrow(() => f.draw(17))
  })
  await check('three real startup rejection paths persist distinct errors, scene/config/capabilities and diagnostic directory', async () => {
    for (const kind of ['configuration', 'controller', 'handheld']) {
      const s = serviceFixture(), f = clientFixture({
        ipc: { on() {}, invoke: (_channel, payload) => s.call(payload) },
        ...(kind === 'configuration' ? { placementConfiguration: () => ({ disableClearViewGrid: true, unrelated: 'DO-NOT-EXPORT' }) } : {}),
        ...(kind === 'controller' ? { getPlacementController: () => null } : {})
      })
      if (kind === 'handheld') delete f.game.itemInHand
      f.client.start('placement-ablation'); await f.fire(3000)
      const result = f.client.status().lastResult, session = JSON.parse(fs.readFileSync(path.join(result.directory, 'session.json')))
      assert.equal(result.status, 'renderer-start-failed'); assert.equal(f.client.status().phase, 'idle')
      assert.equal(session.rendererStartup.stage, 'placement-start'); assert.equal(session.rendererStartup.cancelled, false)
      assert.match(session.rendererStartup.error.message, kind === 'configuration' ? /设置/ : kind === 'controller' ? /原生入口/ : /放置对照需要/)
      assert.equal(session.rendererStartup.scene.item, kind !== 'handheld'); assert.equal(session.rendererStartup.scene.zoom, .3)
      assert.equal(session.rendererStartup.capabilities.renderGrid.supported, kind !== 'controller')
      assert.equal(session.rendererStartup.capabilities.renderGrid.sha256, kind === 'controller' ? null : placement.NATIVE_HASHES.renderGrid)
      assert.equal(JSON.stringify(session).includes('DO-NOT-EXPORT'), false)
      assert.ok(f.messages.at(-1).includes('未开始采集') && f.messages.at(-1).includes(result.directory))
      assert.equal(f.messages.some(text => text.includes('已开始采集')), false)
      assert.ok(fs.readFileSync(path.join(result.directory, 'summary.md'), 'utf8').includes(session.rendererStartup.error.message))
      assert.equal(fs.existsSync(path.join(result.directory, 'frames.json')), false)
      assert.equal(f.jobs.size, 0); assert.equal(s.jobs.size, 0)
    }
  })
  await check('protocol mismatch and recorder/observer setup failures preserve stage and unwind interventions', async () => {
    for (const kind of ['protocol', 'recorder', 'observer']) {
      const s = serviceFixture(), f = clientFixture({ ipc: { on() {}, async invoke(_channel, payload) {
        const response = await s.call(payload)
        return kind === 'protocol' && payload.action === 'start' ? { ...response, result: { ...response.result, seconds: 20 } } : response
      } } })
      const original = f.game.renderloop
      if (kind === 'recorder') Object.defineProperty(f.game, 'renderloop', { value: original, writable: false, configurable: false })
      if (kind === 'observer') f.win.PerformanceObserver = class {
        static supportedEntryTypes = ['longtask']
        observe() { throw new TypeError('observer setup sentinel') }
        disconnect() {}
      }
      f.client.start('placement-ablation'); await f.fire(3000)
      const result = f.client.status().lastResult, session = JSON.parse(fs.readFileSync(path.join(result.directory, 'session.json')))
      assert.equal(session.rendererStartup.stage, { protocol: 'protocol-check', recorder: 'recorder-start', observer: 'observer-start' }[kind])
      assert.equal(session.status, 'renderer-start-failed'); assert.equal(f.game.renderloop, original)
      assert.equal(f.events.listenerCount('blur'), 0); assert.equal(f.jobs.size, 0)
      const next = f.make(); assert.doesNotThrow(() => next.start()); next.stop()
    }
  })
  await check('cancelling while main start is pending is saved as startup cancellation, not failure or completion', async () => {
    const s = serviceFixture(), started = await s.call({ action: 'start', mode: 'placement-ablation' })
    let release
    const pending = new Promise(resolve => { release = resolve })
    const f = clientFixture({ ipc: { on() {}, invoke: (_channel, payload) => payload.action === 'start' ? pending : s.call(payload) } })
    f.client.start('placement-ablation'); const starting = f.fire(3000)
    assert.equal(f.client.status().phase, 'starting'); await f.client.finish(); release(started); await starting
    const result = f.client.status().lastResult, session = JSON.parse(fs.readFileSync(path.join(result.directory, 'session.json')))
    assert.equal(result.status, 'startup-cancelled'); assert.equal(session.rendererStartup.stage, 'main-start')
    assert.equal(session.rendererStartup.cancelled, true); assert.match(f.messages.at(-1), /未开始采集：启动期间已取消/)
    assert.equal(s.jobs.size, 0); assert.equal(fs.existsSync(path.join(result.directory, 'frames.json')), false)
  })
  await check('startup payload is owner-bound, allowlisted, bounded and cannot rewrite a terminal report', async () => {
    const s = serviceFixture(), started = await s.call({ action: 'start', mode: 'placement-light' })
    const payload = { action: 'abort', id: started.result.id, startup: {
      schemaVersion: 1, stage: 'placement-start', cancelled: false,
      error: { name: 'X'.repeat(100), message: 'bad\n' + 'X'.repeat(2000), stack: 'DO-NOT-EXPORT' },
      scene: { zoom: Infinity, focused: true, itemType: 'X'.repeat(100), save: 'DO-NOT-EXPORT' },
      configuration: { disableClearViewGrid: true, save: 'DO-NOT-EXPORT' },
      capabilities: { renderGrid: { supported: true, sha256: 'wrong' }, unknown: 'DO-NOT-EXPORT' },
      save: 'DO-NOT-EXPORT'
    } }
    assert.equal((await s.service.handle({ sender: s.sender, senderFrame: {} }, payload)).ok, false)
    assert.equal((await s.call({ ...payload, id: 'wrong' })).ok, false)
    assert.equal((await s.call({ ...payload, startup: { ...payload.startup, stage: 'made-up' } })).ok, false)
    assert.equal(s.service.isBusy(), true)
    const done = await s.call(payload), file = path.join(done.result.directory, 'session.json'), text = fs.readFileSync(file, 'utf8')
    const session = JSON.parse(text), d = session.rendererStartup
    assert.equal(d.error.name.length, 64); assert.equal(d.error.message.length, 500); assert.equal(d.error.message.includes('\n'), false)
    assert.equal(d.scene.itemType.length, 64); assert.equal(d.scene.zoom, null); assert.equal(d.capabilities.renderGrid.sha256, null)
    assert.equal(text.includes('DO-NOT-EXPORT'), false); assert.ok(session.finishedAtUtc)
    assert.equal((await s.call(payload)).ok, false); assert.equal(fs.readFileSync(file, 'utf8'), text)
  })
  await check('old abort requests retain cancelled status and new failure diagnostics stop deep tracing', async () => {
    const s = serviceFixture(), first = await s.call({ action: 'start', mode: 'light' })
    const old = await s.call({ action: 'abort', id: first.result.id }); assert.equal(old.result.status, 'cancelled'); assert.ok(old.result.directory)
    assert.equal(JSON.parse(fs.readFileSync(path.join(old.result.directory, 'session.json'))).rendererStartup, undefined)
    const second = await s.call({ action: 'start', mode: 'placement-deep' })
    const done = await s.call({ action: 'abort', id: second.result.id, startup: { schemaVersion: 1, stage: 'recorder-start', cancelled: false, error: { name: 'Error', message: 'sentinel' } } })
    assert.equal(done.result.status, 'renderer-start-failed'); assert.equal(s.stops, 1); assert.equal(s.jobs.size, 0)
    assert.equal(fs.existsSync(path.join(done.result.directory, 'frames.json')), false)
  })
  await check('first comparison group explicitly reports successful recording and later groups retain live notices', async () => {
    const f = clientFixture(); f.client.start('placement-ablation')
    assert.equal(f.messages.some(text => text.includes('已开始采集')), false)
    await f.fire(3000); assert.match(f.messages.at(-1), /已开始采集，第1\/5组：原样/)
    assert.equal(f.client.status().phase, 'recording'); f.game.renderloop(); f.advance(12001); f.game.renderloop()
    assert.match(f.messages.at(-1), /采集中，第2\/5组/)
    await f.client.finish(); assert.equal(f.client.status().phase, 'idle')
    assert.ok(f.report.frames.length > 0); assert.equal(f.report.placement.completed, false)
  })
  await check('main rejection or failed diagnostic export never claims a saved or started capture', async () => {
    for (const kind of ['main', 'export']) {
      const f = clientFixture({ getPlacementController: () => null, ipc: { on() {}, async invoke(_channel, payload) {
        return payload.action === 'start' && kind === 'export' ? { ok: true, result: { id: 'test', seconds: 60 } } : { ok: false, error: kind + ' sentinel' }
      } } })
      f.client.start('placement-ablation'); await f.fire(3000)
      assert.equal(f.client.status().phase, 'idle'); assert.equal(f.client.status().lastResult, null)
      assert.match(f.messages.at(-1), /未开始采集/); assert.match(f.messages.at(-1), /启动诊断未保存/)
      assert.equal(f.messages.some(text => text.includes('已开始采集')), false)
    }
  })
  await check('late stop during failure export cannot relabel the saved failure as user cancellation', async () => {
    let release, diagnostic
    const pending = new Promise(resolve => { release = resolve })
    const f = clientFixture({ getPlacementController: () => null, ipc: { on() {}, async invoke(_channel, payload) {
      if (payload.action === 'start') return { ok: true, result: { id: 'test', seconds: 60 } }
      diagnostic = payload.startup; return pending
    } } })
    f.client.start('placement-ablation'); const starting = f.fire(3000)
    for (let i = 0; !diagnostic && i < 20; i++) await Promise.resolve()
    assert.ok(diagnostic); await f.client.finish()
    release({ ok: true, result: { directory: 'synthetic', status: 'renderer-start-failed' } }); await starting
    assert.equal(diagnostic.cancelled, false); assert.match(f.messages.at(-1), /未开始采集：未找到/)
    assert.equal(f.messages.at(-1).includes('启动期间已取消'), false)
  })
  await check('cleanup errors retain the primary startup error and still deactivate placement controls', async () => {
    const s = serviceFixture(), f = clientFixture({ ipc: { on() {}, invoke: (_channel, payload) => s.call(payload) } })
    f.win.PerformanceObserver = class {
      static supportedEntryTypes = ['longtask']
      observe() {
        Object.defineProperty(f.game, 'renderloop', { configurable: false, value: f.game.renderloop })
        throw new Error('primary startup sentinel')
      }
      disconnect() {}
    }
    f.client.start('placement-ablation'); await f.fire(3000)
    const session = JSON.parse(fs.readFileSync(path.join(f.client.status().lastResult.directory, 'session.json')))
    assert.equal(session.rendererStartup.error.message, 'primary startup sentinel')
    assert.equal(session.rendererStartup.cleanupError.name, 'TypeError')
    const next = f.make(); assert.doesNotThrow(() => next.start()); next.stop()
    assert.doesNotThrow(() => f.game.renderloop())
  })
  await check('new optimization rejects original comparison; renderer sends its flag and existing main schema saves the explicit bounded reason', async () => {
    const f = clientFixture({ placementConfiguration: () => ({ enablePlacementShadowTraversalReuse: true }) })
    f.client.start('placement-ablation'); await f.fire(3000)
    const abort = f.calls.find(call => call.action === 'abort')
    assert.equal(abort.startup.configuration.enablePlacementShadowTraversalReuse, true)
    assert.match(abort.startup.error.message, /复用建筑遍历/)
    assert.ok(f.messages.at(-1).includes('未开始采集'))
    const s = serviceFixture(), real = clientFixture({ placementConfiguration: () => ({ enablePlacementShadowTraversalReuse: true }), ipc: { on() {}, invoke: (_channel, payload) => s.call(payload) } })
    real.client.start('placement-ablation'); await real.fire(3000)
    const session = JSON.parse(fs.readFileSync(path.join(real.client.status().lastResult.directory, 'session.json')))
    assert.ok(session.rendererStartup.error.message.includes('[enablePlacementShadowTraversalReuse=true]'))
    assert.match(session.rendererStartup.error.message, /复用建筑遍历/)
  })
  await check('real shared native adapter retains optimized drawing in raw/timed/detail observations', () => {
    const { fixture: world } = require('../../mods/Cattail_TweaksQuality_Tweaks/tests/verify-placement-shadow.cjs')
    const f = world(); f.add('A', 0, 0, 1)
    const controller = placement.installNativeHooks(f.Game.prototype, f.bridge)
    const capture = placement.createPlacementCapture({ game: f.game, controller,
      snapshot: () => ({ focused: true, hidden: false, configSignature: '{}' }) })
    capture.start()
    for (let i = 0; i < 4; i++) {
      capture.beforeFrame(); f.draw(true); const data = capture.afterFrame({})
      assert.equal(data.placementPath.path, 'entity-traversal-reuse')
      if (data.grid) { assert.equal(data.grid.executedCells, 0); assert.equal(data.grid.mapLookups, 9); assert.ok(data.grid.nativeAreaCells > data.grid.candidateCells) }
    }
    capture.stop(); assert.equal(f.draw(true).path.path, 'entity-traversal-reuse')
  })
  console.log(JSON.stringify({ passed: checks.length, checks }))
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { fixture, originals, native }
