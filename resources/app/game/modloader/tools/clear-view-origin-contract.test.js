'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { createArmStore, createOriginObserver, PROTOCOL } = require('../diagnostics/clear-view-origin')
const { createOriginCapture } = require('../diagnostics/clear-view-probe')
const { createService } = require('../diagnostics/clear-view-main')
const checks = []
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-origin-test-'))
async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture() {
  const values = new WeakMap()
  class CanvasContext {
    constructor() { values.set(this, 'butt'); this.canvas = { width: 200, height: 100 }; this.lineWidth = 1; this.saved = [] }
    get lineCap() { if (!values.has(this)) throw new TypeError('brand'); return values.get(this) }
    set lineCap(v) { if (!values.has(this)) throw new TypeError('brand'); if (['butt', 'round', 'square'].includes(v)) values.set(this, v) }
    save() { this.saved.push(values.get(this)) }
    restore() { values.set(this, this.saved.pop()) }
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }
  }
  let time = 0, capture = null
  const main = new CanvasContext(), boom = new Error('original')
  const game = { ctx: main, canvas: main.canvas, pixelRatio: 1.5, zoom: .2, plane: 0, stuff: [], resources: Array(10).fill(0),
    vaults: new Set(), annihilators: new Set(), entitiesInGame: {}, vfx: [],
    loadSave(value) { assert.equal(this, game); this.resources = value.slice(); return 'loaded' },
    updateResourceInteractions(value) { return this.createResourceExplosion(value) },
    createResourceExplosion(value) { this.vfx.push(value); return value },
    renderVFX() { this.ctx.lineCap = 'round' },
    renderGrid() { capture?.gridEntry(this) },
    renderloop(arg) { this.renderGrid(); time += 2; if (arg === boom) throw boom; return arg },
    updateCycle() {} }
  const observer = () => createOriginObserver({ game, now: () => time, contextPrototype: CanvasContext.prototype })
  const timers = new Map(); let id = 0
  const win = { CanvasRenderingContext2D: CanvasContext, performance: { now: () => time, timeOrigin: 1000 },
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id }, clearTimeout(key) { timers.delete(key) } }
  return { game, main, boom, CanvasContext, observer, win, timers, tick(ms = 16) { time += ms },
    bind(o) { capture = o }, fire(ms) { const found = [...timers].find(([, v]) => v.ms === ms); assert.ok(found, 'timer ' + ms); timers.delete(found[0]); found[1].fn() } }
}

function mainFixture() {
  const sender = new EventEmitter(), jobs = new Map(); let serial = 0, traces = 0
  sender.mainFrame = {}; sender.isDestroyed = () => false; sender.send = () => {}
  const win = { webContents: sender, getBounds: () => ({ width: 200, height: 100 }), getContentBounds: () => ({}), isFullScreen: () => false }
  const service = createService({ outputRoot: path.join(output, 'main-' + Math.random()), getWindow: () => win,
    timers: { setTimeout(fn, ms) { jobs.set(++serial, { fn, ms }); return serial }, clearTimeout(id) { jobs.delete(id) } },
    electron: { ipcMain: { handle() {} }, app: { getGPUFeatureStatus: () => ({}), getGPUInfo: async () => ({}) },
      screen: { getDisplayMatching: () => ({ scaleFactor: 1 }) }, shell: { openPath: async () => '' },
      contentTracing: { startRecording() { traces++ } } } })
  const call = (action, payload = {}, frame = sender.mainFrame) => service.handle({ sender, senderFrame: frame }, { action, ...payload })
  return { call, jobs, traces: () => traces }
}

async function contracts() {
  await test('one-shot tickets consume exactly once across service recreation, cancellation and expiry', async () => {
    let time = 1000
    const dir = path.join(output, 'arm'), a = createArmStore(dir, () => time)
    assert.equal(await a.consume(), null); await a.arm()
    const b = createArmStore(dir, () => time)
    const results = await Promise.all([b.consume(), b.consume()]); assert.equal(results.filter(Boolean).length, 1)
    await a.arm(); await a.cancel(); assert.equal(await a.consume(), null)
    await a.arm(); time += 86400001; assert.equal(await a.consume(), null)
    fs.writeFileSync(path.join(dir, 'next-start-origin.json'), '{broken')
    assert.equal(await a.consume(), null); assert.equal(fs.existsSync(path.join(dir, 'next-start-origin.json')), false)
  })
  await test('load, resource source, cap transition and actual grid context are ordered; no argument/save export', () => {
    const f = fixture(), o = f.observer(); f.bind(o); o.start()
    const resources = [0,0,0,0,155,8882,21983,0,0,0]
    assert.equal(f.game.loadSave(resources), 'loaded'); o.ready(); f.tick()
    assert.equal(f.game.updateResourceInteractions(resources), resources)
    f.game.renderVFX(); assert.equal(f.game.renderloop(64), 64)
    const other = new f.CanvasContext(); other.lineCap = 'round' // unrelated Canvas must not be attributed
    const layer = new f.CanvasContext(); f.game.ctx = layer; f.game.renderGrid(); f.game.ctx = f.main
    o.stop(); const r = o.report(), types = r.events.map(x => x.type)
    assert.ok(types.indexOf('load-end') < types.indexOf('explosion-create'))
    assert.ok(types.indexOf('explosion-create') < types.indexOf('lineCap-change'))
    assert.ok(types.indexOf('lineCap-change') < types.indexOf('grid-entry'))
    assert.equal(r.contexts.length, 2); assert.equal(f.main.lineCap, 'round'); assert.equal(layer.lineCap, 'butt')
    assert.deepEqual(r.events.filter(x => x.type === 'grid-entry').map(x => x.contextId), ['canvas-1', 'canvas-2'])
    assert.ok(r.stacks.find(x => x.label.startsWith('explosion:')).stack.includes('updateResourceInteractions'))
    assert.equal(JSON.stringify(r).includes('saveInstanceId'), false)
  })
  await test('native setter semantics, exceptions, own method descriptors and cleanup are preserved', () => {
    const f = fixture(), desc = Object.getOwnPropertyDescriptor(f.CanvasContext.prototype, 'lineCap')
    const own = Object.getOwnPropertyDescriptor(f.game, 'createResourceExplosion')
    const o = f.observer(); o.start(); f.main.lineCap = 'invalid'; assert.equal(f.main.lineCap, 'butt')
    assert.throws(() => Object.getOwnPropertyDescriptor(f.CanvasContext.prototype, 'lineCap').set.call({}, 'round'), TypeError)
    o.stop(); assert.deepEqual(Object.getOwnPropertyDescriptor(f.CanvasContext.prototype, 'lineCap'), desc)
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.game, 'createResourceExplosion'), own)
  })
  await test('already-round and restore-only changes remain explicitly unattributed', () => {
    const f = fixture(); f.main.lineCap = 'round'; const o = f.observer(); f.bind(o); o.start()
    f.main.save(); f.main.lineCap = 'butt'; f.main.restore(); f.game.renderGrid(); o.stop()
    assert.ok(o.report().warnings.some(x => x.includes('already round')))
    assert.ok(o.report().events.some(x => x.type === 'context-state-observed' && x.cap === 'round' && !x.sourceId))
  })
  await test('later wrappers and Canvas descriptors are not overwritten at stop', () => {
    const f = fixture(), o = f.observer(); o.start()
    const method = f.game.renderVFX, later = function () { return method.apply(this, arguments) }; f.game.renderVFX = later
    const d = Object.getOwnPropertyDescriptor(f.CanvasContext.prototype, 'lineCap'), setter = function (v) { d.set.call(this, v) }
    Object.defineProperty(f.CanvasContext.prototype, 'lineCap', { ...d, set: setter }); o.stop()
    const count = o.report().events.length; f.game.renderVFX()
    assert.equal(o.report().events.length, count); assert.equal(f.game.renderVFX, later)
    assert.equal(Object.getOwnPropertyDescriptor(f.CanvasContext.prototype, 'lineCap').set, setter)
  })
  await test('event and stack caps are enforced with explicit loss counters', () => {
    const f = fixture(), o = f.observer(); o.start()
    for (let i = 0; i < 3000; i++) f.main.lineCap = i % 2 ? 'round' : 'butt'
    o.stop(); const r = o.report(); assert.equal(r.events.length, 2048); assert.ok(r.droppedEvents > 0); assert.ok(r.stacks.length <= 24)
    assert.equal(r.events.filter(x => x.type === 'lineCap-change' && x.cap === 'round' && x.sourceId).length, 1)
  })
  await test('capture installs before delayed IPC and auto-finishes 30 seconds after ready', async () => {
    const f = fixture(); let resolveStart, report
    const invoke = (action, data) => action === 'start' ? new Promise(r => { resolveStart = r }) : action === 'finish' ? (report = data.report, Promise.resolve({ directory: 'fixture' })) : Promise.resolve({ seconds: 30 })
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke, snapshot: () => ({ focused: true }) }); f.bind(cap)
    f.game.loadSave(Array(10).fill(0)); f.game.updateResourceInteractions([1]); f.game.renderVFX(); f.game.renderloop()
    cap.ready(f.game); assert.ok([...f.timers.values()].some(t => t.ms === 30000)); assert.equal([...f.timers.values()].some(t => t.ms === 120000), false)
    resolveStart({ id: 'one', seconds: 30 }); await settle(); f.fire(30000); await settle(); await settle()
    assert.equal(cap.status().phase, 'idle'); assert.equal(report.origin.ready, true); assert.ok(report.origin.events.some(x => x.type === 'lineCap-change'))
    assert.equal(f.timers.size, 0)
  })
  await test('startup timeout exports an incomplete initialized-state record and removes hooks', async () => {
    const f = fixture(), before = f.game.renderVFX; let report
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke: async (a, d) => a === 'start' ? { id: 'timeout' } : (report = d.report, { directory: 'fixture' }), snapshot: () => ({}) })
    await settle(); f.fire(120000); await settle(); await settle()
    assert.equal(report.origin.ready, false); assert.equal(report.stopReason, 'load-timeout'); assert.equal(f.game.renderVFX, before); assert.equal(cap.status().phase, 'idle')
  })
  await test('render exception keeps identity and triggers capture cleanup', async () => {
    const f = fixture(), before = f.game.renderloop
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke: async a => a === 'start' ? { id: 'error' } : { directory: 'fixture' }, snapshot: () => ({}) })
    assert.throws(() => f.game.renderloop(f.boom), e => e === f.boom)
    await settle(); await settle(); assert.equal(cap.status().phase, 'idle'); assert.equal(f.game.renderloop, before)
  })
  await test('failed export is retryable after hooks have already been restored', async () => {
    const f = fixture(), before = f.game.renderloop; let attempts = 0
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke: async a => { if (a === 'start') return { id: 'retry' }; if (++attempts === 1) throw Error('disk full'); return { directory: 'fixture' } }, snapshot: () => ({}) })
    await assert.rejects(cap.finish(), /disk full/); assert.equal(f.game.renderloop, before); assert.equal(cap.status().phase, 'export-failed')
    await cap.finish(); assert.equal(cap.status().phase, 'idle')
  })
  await test('load errors preserve the native exception and restore both observer and timing hooks', async () => {
    const f = fixture(); const throws = function () { throw f.boom }; f.game.loadSave = throws
    const before = f.game.renderloop
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke: async a => a === 'start' ? { id: 'load-error' } : { directory: 'fixture' }, snapshot: () => ({}) })
    assert.throws(() => f.game.loadSave(), e => e === f.boom)
    await settle(); await settle(); assert.equal(cap.status().phase, 'idle'); assert.equal(f.game.loadSave, throws); assert.equal(f.game.renderloop, before)
  })
  await test('a second load stops observation without preventing the requested native load', async () => {
    const f = fixture(); let report
    const cap = createOriginCapture({ window: f.win, game: f.game, invoke: async (a, d) => a === 'start' ? { id: 'changed' } : (report = d.report, { directory: 'fixture' }), snapshot: () => ({}) })
    f.game.loadSave(Array(10).fill(1)); assert.equal(f.game.loadSave(Array(10).fill(2)), 'loaded')
    await settle(); await settle(); assert.equal(report.origin.loads, 2); assert.equal(report.stopReason, 'another-load'); assert.equal(cap.status().phase, 'idle')
    assert.equal(f.game.resources[4], 2)
  })
  await test('main bridge enforces owner, fixed deadlines, bounded origin export and no tracing', async () => {
    const f = mainFixture(); assert.equal((await f.call('arm-origin', {}, {})).ok, false)
    assert.equal((await f.call('arm-origin')).ok, true); assert.ok((await f.call('consume-origin')).result)
    assert.equal((await f.call('consume-origin')).result, null)
    const start = await f.call('start', { mode: 'origin', seconds: 999 }); assert.equal(start.result.seconds, 30)
    assert.ok([...f.jobs.values()].some(j => j.ms === 120000)); assert.equal((await f.call('arm-origin')).ok, false)
    await f.call('origin-ready', { id: start.result.id }); const size = f.jobs.size
    await f.call('origin-ready', { id: start.result.id }); assert.equal(f.jobs.size, size); assert.ok([...f.jobs.values()].every(j => j.ms === 30000))
    const report = { schemaVersion: 1, frames: [], methods: [], groups: [], frameCount: 0, warnings: [], limitations: [],
      origin: { protocol: PROTOCOL, events: [], stacks: [], contexts: [], warnings: [], limitations: [] } }
    assert.equal((await f.call('finish', { id: start.result.id, report: { ...report, origin: { ...report.origin, events: new Array(2049) } } })).ok, false)
    const finish = await f.call('finish', { id: start.result.id, report }); assert.equal(finish.ok, true); assert.equal(f.jobs.size, 0); assert.equal(f.traces(), 0)
    assert.ok(fs.readFileSync(path.join(finish.result.directory, 'summary.md'), 'utf8').includes('启动来源观测'))
  })
}

// This function runs in a real, isolated Electron renderer. The resource logic
// and Canvas are native; startup/world/Bezier geometry are bounded fixtures.
function browserFixture() {
  window.fixtureReady = false
  window.originalCapDescriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineCap')
  window.Bezier = class { constructor(ps) { this.ps = ps } getXY(t) { return this.ps[0].map((v, i) => v + (this.ps[3][i] - v) * t) } }
  Game.prototype.loadSave = function () { this.resources = [0,0,0,0,155,8882,21983,0,0,0]; return true }
  Game.prototype.renderloop = function () { this.renderGrid(); return 64 }
  const canvas = document.querySelector('canvas')
  window.game = Object.assign(Object.create(Game.prototype), { canvas, ctx: canvas.getContext('2d'), version: '1.3', isMobile: false,
    language: 'sch', languageId: 12, w: 120, h: 80, w2: 60, h2: 40, pixelRatio: 1.5, zoom: .5, unit: 28, plane: 0, translation: [0, 0],
    stuff: [], stuffMap: {}, entitiesInGame: {}, resources: Array(10).fill(0), hellgemChunk: 64, chromaToContain: 0,
    vaults: new Set(), annihilators: new Set(), annihilationMachines: new Set(), resourceTransferType: 0,
    renderLimitOfAKind: 3, resourceHomes: Array.from({ length: 10 }, () => [10, 10]), vfx: [], chasmVfx: [],
    codex: { entities: {}, resources: Array.from({ length: 10 }, () => ({ triplet: ['#FFF','#FFF','#FFF'] })) },
    analytics: { frame: Array.from({ length: 10 }, () => [0, 0]) }, resourcePops: Array(10).fill(0),
    stats: { totalResourcesMined: Array(10).fill(0), absoluteResourcesCount: 0 }, playSound() {}, drawResourceInScreenCoordinates() {} })
  window.drive = function () { game.loadSave(); game.updateResourceInteractions(16); game.renderVFX(); game.altActive = true; game.renderloop() }
  window.bootFixture = async function () {
    await ModLoader.boot(); await ModLoader.stage('afterVanillaScripts', game)
    drive()
    // The real afterGameInit stage is used. No real slot/profile is configured.
    await ModLoader.stage('afterGameInit', game)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.fixtureReady = true
  }
  bootFixture().catch(e => { window.fixtureError = e.stack })
}

async function electronChecks() {
  const { createRequire } = require('node:module')
  let playwright
  try { playwright = require('playwright') } catch (_) { playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolver.cjs'))('playwright') }
  const root = path.resolve(__dirname, '../..'), shipped = path.resolve(root, '../../..')
  const runtime = path.join(output, 'runtime'), appDir = path.join(runtime, 'resources/app'), gameDir = path.join(appDir, 'game')
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true }); fs.mkdirSync(path.join(gameDir, 'scripts')); fs.mkdirSync(path.join(gameDir, 'modloader/diagnostics'), { recursive: true })
  for (const file of ['sixtyfour.exe','chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','ffmpeg.dll','icudtl.dat','libEGL.dll','libGLESv2.dll','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','vk_swiftshader.dll','vk_swiftshader_icd.json','vulkan-1.dll','locales']) {
    if (fs.existsSync(path.join(shipped, file))) fs.cpSync(path.join(shipped, file), path.join(runtime, file), { recursive: true })
  }
  for (const file of ['scripts/game.js','modloader/translations.json','modloader/diagnostics/clear-view-origin.js','modloader/diagnostics/clear-view-probe.js','modloader/diagnostics/clear-view-main.js']) fs.copyFileSync(path.join(root, file), path.join(gameDir, file))
  let loader = fs.readFileSync(path.join(root, 'modloader/loader.js'), 'utf8')
  loader = loader.replace('window.ModLoader = api', 'window.testProbe = () => getClearViewProbe(); window.ModLoader = api')
  fs.writeFileSync(path.join(gameDir, 'modloader/loader.js'), loader)
  fs.writeFileSync(path.join(gameDir, 'mods/enabled.json'), '{"mods":[]}')
  fs.writeFileSync(path.join(gameDir, 'index.html'), '<!doctype html><meta charset="utf-8"><canvas width="120" height="80"></canvas><script src="scripts/game.js"></script><script src="modloader/loader.js"></script><script>(' + browserFixture.toString() + ')()</script>')
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'sf-origin-isolated', version: '1.0.0', main: 'main.cjs' }))
  fs.writeFileSync(path.join(appDir, 'main.cjs'), `const electron=require('electron'),path=require('path');const {app,BrowserWindow,session}=electron;
app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});let win;
const service=require('./game/modloader/diagnostics/clear-view-main').createService({electron,outputRoot:path.join(__dirname,'game/modloader/state/performance-probes'),getWindow:()=>win});
app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('file:')}));win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});service.attachWindow(win);win.loadFile(path.join(__dirname,'game/index.html'));});app.on('window-all-closed',()=>app.quit());`)
  const env = { ...process.env }; for (const k of Object.keys(env)) if (['electron_run_as_node','node_options'].includes(k.toLowerCase())) delete env[k]
  let electron, page
  const launch = async () => {
    electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env })
    page = await electron.firstWindow(); await page.waitForFunction(() => window.fixtureReady || window.fixtureError)
    assert.equal(await page.evaluate(() => window.fixtureError), undefined)
  }
  try {
    await launch()
    await test('Electron: unarmed Loader startup leaves the Canvas descriptor untouched', async () => {
      assert.equal(await page.evaluate(() => Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'lineCap').set === originalCapDescriptor.set), true)
    })
    await test('Electron: real menu arms exactly one subsequent application start', async () => {
      await page.evaluate(() => ModLoader.togglePanel())
      await page.locator('.modloader-panel-settings').click()
      await page.getByRole('button', { name: '预备下次启动来源记录', exact: true }).click()
      await page.waitForFunction(() => document.getElementById('modloader-clear-view-probe').textContent.includes('已预备'))
      assert.ok(fs.existsSync(path.join(gameDir, 'modloader/state/performance-probes/next-start-origin.json')))
      await electron.close(); electron = null; await launch()
      assert.equal(fs.existsSync(path.join(gameDir, 'modloader/state/performance-probes/next-start-origin.json')), false)
      assert.equal(await page.evaluate(() => testProbe().status().mode), 'origin')
    })
    await test('Electron: native resource explosion changes real Canvas cap before the actual Loader grid entry', async () => {
      const result = await page.evaluate(async () => { await testProbe().finish(); return testProbe().status().lastResult })
      const r = JSON.parse(fs.readFileSync(path.join(result.directory, 'frames.json'), 'utf8')); const e = r.origin.events
      const explosion = e.find(x => x.type === 'explosion-create'), cap = e.find(x => x.type === 'lineCap-change' && x.cap === 'round'), grid = e.find(x => x.type === 'grid-entry' && x.cap === 'round')
      assert.ok(explosion && cap && grid, JSON.stringify(e)); assert.ok(explosion.sequence < cap.sequence && cap.sequence < grid.sequence)
      assert.equal(cap.contextId, grid.contextId); assert.ok(r.origin.stacks.some(x => x.stack.includes('ResourceExplosion.render')))
      assert.equal(r.origin.ready, true); assert.equal(r.metadata.clearViewGridFix.modLoaded, false)
      assert.equal(await page.evaluate(() => Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'lineCap').set === originalCapDescriptor.set), true)
    })
    await test('Electron: Render API interaction layer attribution differs from the main effect canvas', async () => {
      const result = await page.evaluate(async () => {
        game.ctx.lineCap = 'butt'; game.vfx = []
        const scope = ModLoader.forMod('origin-test').render.scope(); scope.onLayer('interaction', () => {}, { id: 'origin-layer' })
        testProbe().startOrigin(game); drive(); testProbe().gameReady(game)
        const result = await testProbe().finish(); scope.dispose(); return result
      })
      const r = JSON.parse(fs.readFileSync(path.join(result.directory, 'frames.json'), 'utf8'))
      const cap = r.origin.events.find(x => x.type === 'lineCap-change' && x.cap === 'round')
      const grid = r.origin.events.find(x => x.type === 'grid-entry')
      assert.ok(cap && grid); assert.notEqual(cap.contextId, grid.contextId)
    })
    await test('Electron: another cold start is unarmed and retains no diagnostic hooks', async () => {
      await electron.close(); electron = null; await launch()
      assert.equal(await page.evaluate(() => Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,'lineCap').set === originalCapDescriptor.set), true)
    })
    await test('Electron: removing the optional module hides only the new controls and leaves startup working', async () => {
      const file = path.join(gameDir, 'modloader/diagnostics/clear-view-origin.js')
      fs.renameSync(file, file + '.disabled')
      await page.reload(); await page.waitForFunction(() => window.fixtureReady || window.fixtureError)
      assert.equal(await page.evaluate(() => window.fixtureError), undefined)
      // This check concerns optional-module control construction. The real menu
      // click was tested above; do not race the menu's pointer auto-hide here.
      const labels = await page.evaluate(() => {
        if (!document.getElementById('modloader-panel')) ModLoader.togglePanel()
        return [...document.querySelectorAll('#modloader-clear-view-probe button')].map(button => button.textContent)
      })
      assert.equal(labels.includes('预备下次启动来源记录'), false)
      assert.equal(labels.includes('轻量记录'), true)
    })
    fs.writeFileSync(path.join(output, 'electron-versions.json'), JSON.stringify(await electron.evaluate(() => process.versions), null, 2))
  } finally { if (electron) await electron.close() }
}

async function main() {
  await contracts()
  if (process.argv.includes('--electron')) await electronChecks()
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, scope: 'Native resource methods, Canvas, Loader and IPC where noted; world, input, geometry and timing fixtures. No player profile or performance acceptance.' }, null, 2))
  console.log('Report: ' + output)
}
main().catch(error => { fs.writeFileSync(path.join(output, 'failure.txt'), error.stack); console.error(error); console.log('Failed output: ' + output); process.exitCode = 1 })
