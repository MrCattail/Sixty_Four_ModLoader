'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { createRecorder } = require('../diagnostics/clear-view-probe')
const { createService, TRACE_CATEGORIES } = require('../diagnostics/clear-view-main')
const checks = []
async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }

function rendererFixture() {
  let clock = 0, scene = { width: 1280, height: 800, zoom: .5, dpr: 1, focused: true }
  const proto = {
    renderEntitiesAbstract(a) { assert.equal(this, game); clock += 3; return a * 2 },
    renderGrid() { clock += 2 },
    renderloop(a) { clock++; const answer = this.renderEntitiesAbstract(a); this.renderGrid(); clock++; return answer },
    updateCycle() { clock += 4 },
    renderVFX() { clock += 2; throw boom }
  }
  const game = Object.create(proto), boom = new Error('native exception')
  const recorder = createRecorder({ game, now: () => clock, snapshot: () => ({ ...scene }) })
  return { recorder, game, proto, boom, tick() { clock += 10 }, setScene(s) { scene = { ...scene, ...s } } }
}

function mainFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-probe-contract-'))
  const jobs = new Set(), sender = new EventEmitter(), mainFrame = {}
  sender.mainFrame = mainFrame; sender.isDestroyed = () => false; sender.send = (...args) => { f.messages.push(args) }
  sender.isDevToolsOpened = () => f.devtools
  const win = { webContents: sender, getBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }), getContentBounds: () => ({ width: 1280, height: 800 }), isFullScreen: () => false, isDestroyed: () => false }
  const f = { directory, messages: [], devtools: false, starts: 0, stops: 0, startGate: null, bufferCalls: 0, jobs, sender }
  const service = createService({
    outputRoot: directory, getWindow: () => win,
    timers: { setTimeout(fn, ms) { const job = { fn, ms }; jobs.add(job); return job }, clearTimeout(job) { jobs.delete(job) } },
    electron: {
      ipcMain: { handle() {} }, app: { getGPUFeatureStatus: () => ({ gpu_compositing: 'enabled' }), getGPUInfo: async () => ({ gpuDevice: [] }) },
      screen: { getDisplayMatching: () => ({ scaleFactor: 1, displayFrequency: 60 }) }, shell: { openPath: async () => '' },
      contentTracing: {
        getCategories: async () => TRACE_CATEGORIES,
        async startRecording(options) { f.traceOptions = options; f.starts++; if (f.startGate) await f.startGate },
        async getTraceBufferUsage() { f.bufferCalls++; throw new Error('unsafe native API') },
        async stopRecording(file) { f.stops++; await fs.promises.writeFile(file, '{"traceEvents":[]}') }
      }
    }
  })
  service.attachWindow(win)
  f.call = (action, payload = {}) => service.handle({ sender, senderFrame: mainFrame }, { action, ...payload })
  f.untrusted = () => service.handle({ sender, senderFrame: {} }, { action: 'start', mode: 'light' })
  f.fire = async ms => {
    const job = [...jobs].find(j => j.ms === ms); assert.ok(job, 'timer exists'); jobs.delete(job); job.fn()
    for (let i = 0; i < 15; i++) await new Promise(resolve => setTimeout(resolve, 5))
  }
  return f
}
const emptyReport = () => ({ schemaVersion: 1, frames: [], methods: [], groups: [], frameCount: 0, durationMs: 10, warnings: [], limitations: [] })

async function main() {
  await test('original this, arguments, return values and inherited descriptors survive sampling', () => {
    const f = rendererFixture(), before = f.game.renderloop
    f.recorder.start(); assert.equal(f.game.renderloop(9), 18); f.recorder.stop()
    assert.equal(f.game.renderloop, before); assert.equal(Object.hasOwn(f.game, 'renderloop'), false)
    assert.throws(() => f.recorder.start(), /already used/)
  })
  await test('inclusive and measured self time do not double-count children', () => {
    const f = rendererFixture(); f.recorder.start(); f.game.renderloop(1); f.game.updateCycle(); f.recorder.stop()
    const r = f.recorder.report(), parent = r.methods.find(x => x.method === 'renderloop')
    assert.equal(parent.totalInclusiveMs, 7); assert.equal(parent.selfMeasuredMs, 2)
    assert.equal(r.roots.length, 2); assert.equal(r.frames[0].observedView, 'clear')
    assert.equal(r.frames[0].methods.renderEntitiesAbstract, 3)
  })
  await test('native exceptions propagate by identity and still produce a timing record', () => {
    const f = rendererFixture(); f.recorder.start(); assert.throws(() => f.game.renderVFX(), e => e === f.boom)
    f.game.renderloop(1); f.recorder.stop(); assert.equal(f.recorder.report().methods.find(x => x.method === 'renderVFX').calls, 1)
  })
  await test('own descriptors restored and later mod wrappers are preserved', () => {
    const f = rendererFixture(), original = f.game.renderGrid
    Object.defineProperty(f.game, 'renderGrid', { value: original, configurable: true, writable: false, enumerable: true })
    f.recorder.start(); const ours = f.game.renderloop, later = function (...args) { return ours.apply(this, args) }
    f.game.renderloop = later; f.recorder.stop()
    assert.equal(f.game.renderloop, later); assert.equal(f.game.renderloop(4), 8)
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.game, 'renderGrid'), { value: original, configurable: true, writable: false, enumerable: true })
    assert.ok(f.recorder.report().warnings.some(x => x.includes('Another wrapper')))
  })
  await test('stable frames grouped separately from transitions, resize and focus loss', () => {
    const f = rendererFixture(); f.recorder.start()
    for (let i = 0; i < 3; i++) { f.game.renderloop(1); f.tick() }
    f.setScene({ alt: true }); f.game.renderloop(1); f.tick(); f.game.renderloop(1)
    f.setScene({ focused: false }); f.tick(); f.game.renderloop(1)
    f.recorder.stop(); const r = f.recorder.report()
    assert.equal(r.frames.filter(x => x.comparable).length, 3)
    assert.equal(r.frames[1].gapMs, 17); assert.equal(r.frames[3].comparable, false)
  })
  await test('missing renderloop fails without leaving other methods wrapped', () => {
    const game = { renderGrid() {} }, before = game.renderGrid
    assert.throws(() => createRecorder({ game, now: () => 0 }).start(), /renderloop unavailable/)
    assert.equal(game.renderGrid, before)
  })
  await test('ring buffers report loss rather than silently growing without bound', () => {
    const f = rendererFixture(); f.recorder.start()
    for (let i = 0; i < 12005; i++) f.game.renderloop(1)
    f.recorder.stop(); const r = f.recorder.report()
    assert.equal(r.frames.length, 12000); assert.equal(r.dropped.frames, 5)
    assert.equal(r.methods.find(x => x.method === 'renderloop').droppedSamples, 12005 - 4096)
  })
  await test('IPC accepts only the trusted main frame', async () => {
    const f = mainFixture(); assert.equal((await f.untrusted()).ok, false); assert.equal(f.starts, 0)
  })
  await test('light capture exports locally without starting browser tracing', async () => {
    const f = mainFixture(), start = await f.call('start', { mode: 'light' }); assert.equal(start.ok, true)
    assert.equal((await f.call('start', { mode: 'deep' })).ok, false)
    const result = await f.call('finish', { id: start.result.id, report: emptyReport() })
    assert.equal(result.ok, true); assert.equal(f.starts, 0); assert.equal(f.jobs.size, 0)
    assert.ok(fs.existsSync(path.join(result.result.directory, 'frames.json')))
    assert.ok(fs.existsSync(path.join(result.result.directory, 'summary.md')))
  })
  await test('deep capture has bounded, selected categories and one stop for concurrent requests', async () => {
    const f = mainFixture(), start = await f.call('start', { mode: 'deep' })
    const results = await Promise.all([f.call('finish', { id: start.result.id, report: emptyReport() }), f.call('finish', { id: start.result.id, report: emptyReport() })])
    assert.ok(results.every(r => r.ok)); assert.equal(f.starts, 1); assert.equal(f.stops, 1)
    assert.equal(f.traceOptions.recording_mode, 'record-until-full'); assert.deepEqual(f.traceOptions.excluded_categories, ['*'])
    assert.equal(f.traceOptions.enable_argument_filter, false)
  })
  await test('never invokes the native buffer API that crashes Electron 28', async () => {
    const f = mainFixture()
    const start = await f.call('start', { mode: 'deep' })
    const result = await f.call('finish', { id: start.result.id, report: emptyReport() })
    assert.equal(result.ok, true); assert.equal(f.stops, 1); assert.equal(f.bufferCalls, 0); assert.equal(result.result.traceStatus, 'saved')
  })
  await test('main watchdog stops tracing even without renderer response and preserves incomplete evidence', async () => {
    const f = mainFixture(); await f.call('start', { mode: 'deep', seconds: 5 }); await f.fire(5000)
    assert.equal(f.stops, 1); assert.equal(f.messages.length, 1)
    await f.fire(30000)
    const files = fs.readdirSync(f.directory), session = JSON.parse(fs.readFileSync(path.join(f.directory, files[0], 'session.json')))
    assert.equal(session.status, 'renderer-timeout'); assert.equal(f.jobs.size, 0)
    const next = await f.call('start', { mode: 'light' }); assert.equal(next.ok, true); await f.call('abort', { id: next.result.id })
  })
  await test('closing while trace start is pending cleans up after acknowledgement', async () => {
    const f = mainFixture(); let release
    f.startGate = new Promise(resolve => { release = resolve })
    const startPromise = f.call('start', { mode: 'deep' })
    while (!f.starts) await new Promise(resolve => setTimeout(resolve, 2))
    f.sender.emit('destroyed'); release()
    assert.equal((await startPromise).ok, false)
    assert.equal(f.stops, 1)
  })
  await test('rejects oversized report shape and debugger overlap without changing game files', async () => {
    const f = mainFixture(); f.devtools = true; assert.equal((await f.call('start', { mode: 'deep' })).ok, false)
    f.devtools = false; const start = await f.call('start', { mode: 'light' })
    assert.equal((await f.call('finish', { id: start.result.id, report: { ...emptyReport(), frames: new Array(12001) } })).ok, false)
    await f.call('abort', { id: start.result.id })
  })
  await test('ablation mode is fixed at 60 seconds without Chromium tracing', async () => {
    const f = mainFixture(), start = await f.call('start', { mode: 'ablation', seconds: 999 })
    assert.equal(start.ok, true); assert.equal(start.result.seconds, 60); assert.equal(f.starts, 0)
    await f.fire(60000); assert.equal(f.messages.length, 1)
    const done = await f.call('finish', { id: start.result.id, report: emptyReport() })
    assert.equal(done.ok, true); assert.equal(f.stops, 0); assert.equal(f.jobs.size, 0)
  })
  await test('long-protocol capacity is restricted to ablation sessions', async () => {
    const f = mainFixture(), a = await f.call('start', { mode: 'ablation' })
    assert.equal((await f.call('finish', { id: a.result.id, report: { ...emptyReport(), frames: new Array(24001) } })).ok, false)
    assert.equal((await f.call('finish', { id: a.result.id, report: { ...emptyReport(), frames: new Array(12001) } })).ok, true)
    const b = await f.call('start', { mode: 'light' })
    assert.equal((await f.call('finish', { id: b.result.id, report: { ...emptyReport(), frames: new Array(12001) } })).ok, false)
    await f.call('abort', { id: b.result.id })
  })
  await test('grid ablation is fixed at 72 seconds and has bounded long-capture capacity', async () => {
    const f = mainFixture(), start = await f.call('start', { mode: 'grid-ablation', seconds: 999 })
    assert.equal(start.ok, true); assert.equal(start.result.seconds, 72); assert.equal(f.starts, 0)
    assert.equal((await f.call('finish', { id: start.result.id, report: { ...emptyReport(), frames: new Array(24001) } })).ok, false)
    await f.fire(72000); assert.equal(f.messages.length, 1)
    const report = { ...emptyReport(), frames: new Array(17281), ablation: { protocol: 'clear-view-grid-stroke-v1', completed: true, phases: [], warnings: [] } }
    const done = await f.call('finish', { id: start.result.id, report }); assert.equal(done.ok, true); assert.equal(f.jobs.size, 0); assert.equal(f.stops, 0)
    assert.ok(fs.readFileSync(path.join(done.result.directory, 'summary.md'), 'utf8').includes('网格内部对照'))
  })
  await test('threshold protocol is fixed at 96 seconds, bounded, and exports effective cap metadata without tracing', async () => {
    const f = mainFixture(), start = await f.call('start', { mode: 'grid-threshold', seconds: 999 })
    assert.equal(start.ok, true); assert.equal(start.result.seconds, 96); assert.equal(f.starts, 0)
    assert.equal((await f.call('finish', { id: start.result.id, report: { ...emptyReport(), frames: new Array(24001) } })).ok, false)
    await f.fire(96000); assert.equal(f.messages.length, 1)
    const phases = [{ label: '原样', native: true, metadata: [{ requested: { lineWidth: 1.5, lineCap: 'inherited' }, matchesPreviousReference: false }] },
      { label: '测试平端', metadata: [{ requested: { lineWidth: 1.01, lineCap: 'butt' }, effective: { lineWidth: 1.01, lineCap: 'butt' }, matchesPreviousReference: true }] }]
    const report = { ...emptyReport(), frames: new Array(23041), ablation: { protocol: 'clear-view-grid-threshold-v1', completed: true, phases, warnings: [] } }
    const done = await f.call('finish', { id: start.result.id, report }); assert.equal(done.ok, true); assert.equal(f.jobs.size, 0); assert.equal(f.stops, 0)
    const summary = fs.readFileSync(path.join(done.result.directory, 'summary.md'), 'utf8')
    for (const text of ['线宽阈值／线端对照', '八组', '1.01 / butt', '原生未拦截，见源码契约', '否，请核对']) assert.ok(summary.includes(text), text)
    assert.equal(JSON.parse(fs.readFileSync(path.join(done.result.directory, 'session.json'))).trace.status, 'not-requested')
  })
  console.log(JSON.stringify({ passed: checks.length, checks }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
