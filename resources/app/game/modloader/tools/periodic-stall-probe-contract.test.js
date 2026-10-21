'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { createRecorder, createClient, ring } = require('../diagnostics/periodic-stall-probe')
const { createService, CATEGORIES } = require('../diagnostics/periodic-stall-main')
const checks = []
async function test(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
function fixture() {
  let clock = 1000
  const flags = { focused: true, hidden: false, width: 1280, height: 800 }
  const error = new Error('original'), proto = {
    assembleSave(value) { assert.equal(this, game); clock += 7; return value },
    saveGame(value) { clock += 2; return this.assembleSave(value) },
    renderloop(value) { clock += 1; return value },
    renderVFX() { clock += 2; throw error }
  }
  const game = Object.create(proto)
  game.canvas = {}; game.spaceport = { invoke(channel, result) { clock += 3; return result }, send() { clock += 1 } }
  const recorder = createRecorder({ game, now: () => clock, flags: () => ({ ...flags }) })
  return { game, recorder, proto, error, flags, now: () => clock, advance: ms => { clock += ms } }
}
function mainFixture() {
  let clock = 1000
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-periodic-probe-'))
  const jobs = new Set(), sender = new EventEmitter(), win = new EventEmitter(), mainFrame = {}
  sender.mainFrame = mainFrame; sender.isDevToolsOpened = () => f.devtools; sender.send = (...args) => f.messages.push(args)
  win.webContents = sender; win.isDestroyed = () => false
  const f = { directory, jobs, win, sender, mainFrame, messages: [], devtools: false, otherBusy: false, starts: 0, stops: 0, traceGate: null }
  const timers = { setTimeout(fn, ms) { const job = { fn, ms }; jobs.add(job); return job }, clearTimeout(job) { jobs.delete(job) },
    setInterval(fn, ms) { const job = { fn, ms, interval: true }; jobs.add(job); return job }, clearInterval(job) { jobs.delete(job) } }
  const service = createService({ outputRoot: directory, getWindow: () => win, now: () => clock, timers, isOtherBusy: () => f.otherBusy,
    electron: { ipcMain: { handle() {}, on() {} }, app: { getGPUFeatureStatus: () => ({ gpu_compositing: 'enabled' }) }, shell: { openPath: async () => '' },
      contentTracing: { getCategories: async () => CATEGORIES, async startRecording(options) { f.traceOptions = options; f.starts++; if (f.traceGate) await f.traceGate },
        async stopRecording(file) { f.stops++; await fs.promises.writeFile(file, '{"traceEvents":[]}') }, getTraceBufferUsage() { throw Error('unsafe API called') } } } })
  service.attachWindow(win)
  Object.assign(f, { service, call: (action, args = {}) => service.handle({ sender, senderFrame: mainFrame }, { action, ...args }), advance: ms => { clock += ms } })
  return f
}
const emptyReport = () => { const f = fixture(); f.recorder.start(); f.game.renderloop(); f.recorder.stop(); return f.recorder.report() }
async function until(run) { for (let i = 0; i < 100; i++) { if (run()) return; await new Promise(resolve => setTimeout(resolve, 5)) } throw Error('Timed out') }

;(async () => {
  await test('sync this, arguments, return, exception identity, nesting and inherited descriptor restoration', () => {
    const f = fixture(), value = {}; f.recorder.start(); assert.equal(f.game.saveGame(value), value)
    assert.throws(() => f.game.renderVFX(), error => error === f.error); f.recorder.stop()
    const report = f.recorder.report(); assert.equal(report.methods.find(r => r.name === 'saveGame').selfMeasuredMs, 2)
    assert.equal(report.methods.find(r => r.name === 'assembleSave').totalMs, 7); assert.equal(Object.hasOwn(f.game, 'saveGame'), false)
  })
  await test('original IPC promise identity, synchronous clone time and async completion are separate', async () => {
    const f = fixture(); let resolve; const promise = new Promise(r => { resolve = r })
    f.recorder.start(); assert.equal(f.game.spaceport.invoke('store', promise), promise); f.advance(500); resolve(false); await promise; await Promise.resolve()
    f.recorder.stop(); const rows = f.recorder.report().methods
    assert.equal(rows.find(r => r.name === 'ipc.store.invoke').totalMs, 3)
    assert.equal(rows.find(r => r.name === 'ipc.store.invoke.settled').totalMs, 503)
    assert.equal(f.recorder.report().pendingAtStop.length, 0)
  })
  await test('unrelated IPC is not instrumented and rejections remain rejected', async () => {
    const f = fixture(); f.recorder.start(); f.game.spaceport.invoke('other', 42)
    const rejected = Promise.reject(f.error); assert.equal(f.game.spaceport.invoke('store', rejected), rejected)
    await assert.rejects(rejected, error => error === f.error); f.recorder.stop()
    assert.equal(f.recorder.report().methods.find(r => r.name === 'ipc.store.invoke').calls, 1)
    assert.ok(f.recorder.report().events.some(e => e.failed === true))
  })
  await test('IndexedDB put sync and completion wait, existing handlers and restoration', () => {
    const f = fixture(), tx = new EventEmitter(), store = { put(value) { f.advance(15); return value } }, marker = {}
    tx.mode = 'readwrite'; tx.objectStoreNames = { contains: () => true }; tx.objectStore = () => store
    tx.addEventListener = tx.on.bind(tx); tx.removeEventListener = tx.off.bind(tx)
    let originalComplete = 0; tx.on('complete', () => originalComplete++)
    f.game.localDatabase = { transaction: () => tx }; const originalPut = store.put
    f.recorder.start(); const result = f.game.localDatabase.transaction('charps_memory_slots', 'readwrite')
    assert.equal(result.objectStore('charps_memory_slots').put(marker), marker); f.advance(60); tx.emit('complete', { type: 'complete' }); f.recorder.stop()
    assert.equal(originalComplete, 1); assert.equal(store.put, originalPut)
    assert.equal(f.recorder.report().methods.find(r => r.name === 'local.put').totalMs, 15)
    assert.equal(f.recorder.report().methods.find(r => r.name === 'local.transaction.settled').totalMs, 75)
  })
  await test('later wrappers retained safely and stopped probes remain inert', () => {
    const f = fixture(); f.recorder.start(); const inner = f.game.saveGame; f.game.saveGame = function (...args) { return inner.apply(this, args) }
    const later = f.game.saveGame; f.game.saveGame(42); f.recorder.stop(); const before = f.recorder.report().methods[0].calls
    f.game.saveGame(43); assert.equal(f.game.saveGame, later); assert.equal(f.recorder.report().methods[0].calls, before)
    assert.ok(f.recorder.report().warnings.some(w => w.includes('Later wrapper')))
  })
  await test('transition frames excluded, ring bounds enforced and drops explicit', () => {
    const f = fixture(); f.recorder.start(); f.game.renderloop(); f.advance(16); f.game.renderloop(); f.flags.focused = false; f.game.renderloop()
    for (let i = 0; i < 30005; i++) f.game.renderloop(); f.recorder.stop()
    const report = f.recorder.report(); assert.equal(report.frames.length, 30000); assert.equal(report.dropped.frames, 8); assert.ok(report.frames.every(frame => !frame.comparable))
    const r = ring(2); r.push(1); r.push(2); r.push(3); assert.deepEqual(r.values(), [2, 3])
  })
  await test('idle main service owns no timers and preserves values and errors', () => {
    const f = mainFixture(), error = new Error('native'); assert.equal(f.jobs.size, 0)
    assert.equal(f.service.measure('cloud.writeFile', () => 42), 42)
    assert.throws(() => f.service.measure('cloud.writeFile', () => { throw error }), e => e === error); assert.equal(f.jobs.size, 0)
  })
  await test('owner main frame enforced, duplicate and other captures rejected', async () => {
    const f = mainFixture(); assert.equal((await f.service.handle({ sender: f.sender, senderFrame: {} }, { action: 'start' })).ok, false)
    f.otherBusy = true; assert.equal((await f.call('start')).ok, false); f.otherBusy = false
    const start = await f.call('start'); assert.equal(start.ok, true); assert.equal((await f.call('start')).ok, false)
    assert.equal((await f.call('abort', { id: start.result.id })).ok, true); assert.equal(f.jobs.size, 0)
  })
  await test('main operation and heartbeat lag exported, deep flags avoid known native crash APIs', async () => {
    const f = mainFixture(), start = await f.call('start', { deep: true }); assert.equal(start.ok, true)
    const value = {}; assert.equal(f.service.measure('cloud.writeFile', () => { f.advance(160); return value }), value)
    ;[...f.jobs].find(j => j.interval).fn(); const result = await f.call('finish', { id: start.result.id, report: emptyReport() }); assert.equal(result.ok, true)
    const session = JSON.parse(fs.readFileSync(path.join(result.result.directory, 'session.json')))
    assert.equal(session.main.methods[0].maxMs, 160); assert.equal(session.main.maxLagMs, 60); assert.equal(f.stops, 1); assert.equal(f.jobs.size, 0)
    assert.equal(f.traceOptions.enable_argument_filter, false); assert.equal(f.traceOptions.recording_mode, 'record-until-full')
  })
  await test('watchdog requests stop then exports incomplete on renderer timeout', async () => {
    const f = mainFixture(), start = await f.call('start', { deep: true }); [...f.jobs].find(j => j.ms === 20000).fn()
    assert.equal(f.messages[0][1].id, start.result.id); [...f.jobs].find(j => j.ms === 15000).fn()
    await until(() => !f.service.isBusy()); assert.equal(f.jobs.size, 0); assert.equal(f.stops, 1)
    const session = JSON.parse(fs.readFileSync(path.join(f.directory, start.result.id, 'session.json'))); assert.equal(session.status, 'incomplete')
  })
  await test('navigation during pending tracing setup cannot leave an active trace', async () => {
    const f = mainFixture(); let release; f.traceGate = new Promise(resolve => { release = resolve })
    const start = f.call('start', { deep: true }); await until(() => f.starts === 1)
    f.sender.emit('did-start-navigation', {}, '', false, true); release(); assert.equal((await start).ok, false)
    await until(() => !f.service.isBusy()); assert.equal(f.stops, 1); assert.equal(f.jobs.size, 0)
  })
  await test('export failure stops sampling and supports retry without duplicate tracing stop', async () => {
    const f = mainFixture(), start = await f.call('start', { deep: true }), directory = path.join(f.directory, start.result.id)
    fs.mkdirSync(path.join(directory, 'summary.md')); const report = emptyReport()
    assert.equal((await f.call('finish', { id: start.result.id, report })).ok, false); assert.equal(f.jobs.size, 0); assert.equal(f.service.isBusy(), true)
    fs.rmdirSync(path.join(directory, 'summary.md')); assert.equal((await f.call('finish', { id: start.result.id, report })).ok, true); assert.equal(f.stops, 1)
  })
  await test('bad report is rejected and explicit abort still cleans up', async () => {
    const f = mainFixture(), start = await f.call('start'); assert.equal((await f.call('finish', { id: start.result.id, report: {} })).ok, false)
    await f.call('abort', { id: start.result.id }); assert.equal(f.jobs.size, 0)
  })
  await test('five minute mode has a bounded independent main deadline', async () => {
    const f = mainFixture(), start = await f.call('start', { seconds: 300 })
    assert.equal(start.result.seconds, 300); assert.ok([...f.jobs].some(job => job.ms === 300000))
    await f.call('abort', { id: start.result.id }); assert.equal(f.jobs.size, 0)
  })
  await test('actual native store and statistics handlers retain payloads, return and error behavior', async () => {
    const f = mainFixture(), start = await f.call('start'), handlers = {}, calls = []
    const source = fs.readFileSync(path.resolve(__dirname, '../../../main.js'), 'utf8')
    const store = source.slice(source.indexOf('ipcMain.on(`store`'), source.indexOf('ipcMain.on(`updateAccumulatedPlaytime`'))
    const stat = source.slice(source.indexOf('ipcMain.on(`updateStat`'), source.indexOf('ipcMain.on(`gameError`'))
    const client = { cloud: { writeFile(name, data) { f.advance(13); calls.push({ name, data }); return true } }, stats: { setInt(id, value) { calls.push({ id, value }) } } }
    vm.runInNewContext(store + stat, { ipcMain: { on(name, fn) { handlers[name + ':on'] = fn }, handle(name, fn) { handlers[name + ':handle'] = fn } },
      client, ModLoaderMainProcess: { measureDiagnostic: f.service.measure }, console: { error() {} } })
    const slots = [{ stack: [{ state: { fixtureOnly: true } }] }]
    assert.equal(await handlers['store:handle']({}, slots), true); handlers['store:on']({}, slots); handlers['updateStat:on']({}, [{ id: 'X', value: 5 }])
    assert.equal(calls[0].data, JSON.stringify(slots)); assert.equal(calls[1].data, JSON.stringify(slots)); assert.equal(calls[2].value, 5)
    const savedCloud = client.cloud; client.cloud = null
    const cyclic = {}; cyclic.self = cyclic
    assert.doesNotThrow(() => handlers['store:on']({}, cyclic)); client.cloud = savedCloud
    client.cloud.writeFile = () => { throw Error('fixture failed') }; assert.equal(await handlers['store:handle']({}, slots), false)
    const done = await f.call('finish', { id: start.result.id, report: emptyReport() }); assert.equal(done.ok, true)
    const text = fs.readFileSync(path.join(done.result.directory, 'session.json'), 'utf8'); assert.ok(!text.includes('fixtureOnly'))
  })
  await test('renderer countdown can be cancelled without any main request or game patch', async () => {
    const f = fixture(), listeners = new Map(), jobs = new Set()
    const win = { performance: { timeOrigin: 0, now: f.now }, addEventListener() {}, removeEventListener() {},
      setTimeout(fn, ms) { const job = { fn, ms }; jobs.add(job); return job }, clearTimeout(job) { jobs.delete(job) } }
    const client = createClient({ window: win, document: {}, ipc: { on(name, fn) { listeners.set(name, fn) }, invoke() { throw Error('should not request main') } }, getGame: () => f.game })
    await client.start(); assert.equal(client.status().phase, 'arming'); await client.finish(); assert.equal(client.status().phase, 'idle'); assert.equal(jobs.size, 0); assert.equal(Object.hasOwn(f.game, 'renderloop'), false)
  })
  await test('renderer cancellation during a pending main start aborts after acknowledgement', async () => {
    const f = fixture(), jobs = new Set(), requests = []; let release
    const gate = new Promise(resolve => { release = resolve })
    const win = { performance: { timeOrigin: 0, now: f.now }, addEventListener() {}, removeEventListener() {},
      setTimeout(fn, ms) { const job = { fn, ms }; jobs.add(job); return job }, clearTimeout(job) { jobs.delete(job) } }
    const ipc = { on() {}, async invoke(_channel, payload) { requests.push(payload.action); if (payload.action === 'start') { await gate; return { ok: true, result: { id: 'pending-start', seconds: 120 } } } return { ok: true } } }
    const client = createClient({ window: win, document: {}, ipc, getGame: () => f.game })
    await client.start(); const beginning = [...jobs][0].fn(); assert.equal(client.status().phase, 'starting')
    await client.finish(); release(); await beginning
    assert.equal(client.status().phase, 'idle'); assert.deepEqual(requests, ['start', 'abort']); assert.equal(Object.hasOwn(f.game, 'saveGame'), false)
  })
  console.log('Periodic stall probe: ' + checks.length + ' checks passed.')
})().catch(error => { console.error(error.stack); process.exitCode = 1 })
