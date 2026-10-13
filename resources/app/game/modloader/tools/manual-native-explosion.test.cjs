'use strict'

// Isolated shipped Electron; real Canvas/native explosion/Tweaks implementation.
// World, ModLoader registration, focus, timing and Bezier geometry are fixtures.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { createRequire } = require('node:module')
const playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolver.cjs'))('playwright')
const gameRoot = path.resolve(__dirname, '../..'), shipped = path.resolve(gameRoot, '../../..')
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-manual-explosion-'))
const runtime = path.join(output, 'runtime'), appDir = path.join(runtime, 'resources/app')
fs.mkdirSync(path.join(appDir, 'scripts'), { recursive: true })
for (const name of ['sixtyfour.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'locales']) {
  if (fs.existsSync(path.join(shipped, name))) fs.cpSync(path.join(shipped, name), path.join(runtime, name), { recursive: true })
}
fs.copyFileSync(path.join(gameRoot, 'scripts/game.js'), path.join(appDir, 'scripts/game.js'))
fs.copyFileSync(path.join(gameRoot, 'mods/Cattail_TweaksQuality_Tweaks/scripts/resource-explosion-bezier-fast-path.js'), path.join(appDir, 'fast-path.js'))
fs.copyFileSync(path.join(gameRoot, 'modloader/diagnostics/manual-native-explosion.cjs'), path.join(appDir, 'manual.cjs'))
function fixture() {
  window.hooks = {}
  window.ModLoader = { register(mod) { mod.init({ on(name, fn) { hooks[name] = fn }, config: { get: () => true },
    patch(target, key, wrapper) { target[key] = wrapper(target[key]) } }) } }
  window.Bezier = class {
    constructor(points) { this.points = points }
    getXY(t) { const r = 1 - t, ps = this.points; return [0, 1].map(i => r ** 3 * ps[0][i] + 3 * r * r * t * ps[1][i] + 3 * r * t * t * ps[2][i] + t ** 3 * ps[3][i]) }
  }
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true })
  window.resetWorld = function () {
    window.SFNativeExplosionTest?.stop('test-reset')
    window.cattailResourceSourceProfiler?.disable()
    window.__cattailClearViewGridFixInstalled = false
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 270
    window.DEBUG = Object.assign(Object.create(Game.prototype), { version: '1.3', vfx: [], chasmVfx: [], resources: Array(10).fill(100),
      canvas, ctx: canvas.getContext('2d'), w: 480, h: 270, unit: 24, pixelRatio: 1.5, zoom: .1, translation: [0, 0], plane: 0,
      altActive: true, halt: false, renderLimitOfAKind: 96, resourceHomes: Array.from({ length: 10 }, () => [0, 0]),
      codex: { resources: Array.from({ length: 10 }, () => ({ triplet: ['#ff0000', '#00ff00', '#0000ff'] })) } })
    window.dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key: 'enableResourceExplosionBezierFastPath', value: true } }))
    return DEBUG
  }
}
// Install the actual Dynamic Details F8 predicate and capture listener BEFORE
// the helper, reproducing the live listener ordering that the first test missed.
const ddSource = fs.readFileSync(path.join(gameRoot, 'mods/Cattail_TweaksQuality_Dynamic-Details/scripts/core.js'), 'utf8')
const predicate = ddSource.match(/function isResourceSourceProfilerToggleEvent\(event\) \{[\s\S]*?\n\t\t\}/)?.[0]
const listener = ddSource.match(/addEventListener\('keydown', function \(event\) \{\s*if \(!isResourceSourceProfilerToggleEvent\(event\)[\s\S]*?\}, true\)/)?.[0]
assert.ok(predicate && listener, 'actual profiler shortcut source located')
const profilerFixture = `let resourceSourceProfilerEnabled=false;window.profilerToggleCount=0;function setResourceSourceProfilerEnabled(v){resourceSourceProfilerEnabled=!!v;window.profilerToggleCount++};${predicate};${listener};window.cattailResourceSourceProfiler={isEnabled:()=>resourceSourceProfilerEnabled,disable:()=>{resourceSourceProfilerEnabled=false}};`
fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><script src="scripts/game.js"></script><script>(' + fixture.toString() + ')()</script><script>' + profilerFixture + '</script><script src="fast-path.js"></script><script>hooks.afterVanillaScripts();resetWorld();window.startTest=require(' + JSON.stringify(path.join(appDir, 'manual.cjs')) + ')</script>')
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'sf-manual-explosion-isolated', version: '1.0.0', main: 'main.cjs' }))
fs.writeFileSync(path.join(appDir, 'main.cjs'), `const {app,BrowserWindow,session}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith('file:')}));const w=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}});w.loadFile(require('path').join(__dirname,'index.html'));});app.on('window-all-closed',()=>app.quit());`)

async function run() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (['electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
  let electron
  const checks = []
  async function test(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
  try {
    electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env })
    const page = await electron.firstWindow()
    await page.waitForFunction(() => !!window.startTest)
    await test('native first-writer stack, no fast rendering/curve preparation, resources unchanged and scoped restore', async () => {
      const r = await page.evaluate(() => {
        const g = resetWorld(), sentinel = { render() {}, untouched: true }; g.vfx.push(sentinel)
        const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineCap')
        const c = startTest(window); c.fire(); const fx = g.vfx.at(-1); g.renderVFX()
        const during = c.result(), beforeStop = g.ctx.lineCap
        c.stop(); return { during, beforeStop, after: c.result(), remaining: g.vfx.length, same: g.vfx[0] === sentinel,
          descriptorSame: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineCap').set === d.set,
          noOwnRender: !Object.hasOwn(fx, 'render'), noFastCurve: !Object.hasOwn(fx, '__cattailResourceExplosionBezierFastPathPrepared') }
      })
      assert.equal(r.during.nativePathConfirmed, true); assert.equal(r.during.resourcesUnchangedByCreation, true)
      assert.equal(r.during.directRenderCallsDelta, 0); assert.equal(r.during.afterStats.enabled, false)
      assert.equal(r.during.afterStats.curvesPrepared, r.during.beforeStats.curvesPrepared)
      assert.equal(r.beforeStop, 'round'); assert.equal(r.after.endScene.cap, 'butt'); assert.equal(r.after.restoredEnabled, true)
      assert.equal(r.remaining, 1); assert(r.same && r.descriptorSame && r.noOwnRender && r.noFastCurve)
      assert.equal(r.after.sceneChanged, false)
      assert.equal(JSON.parse(fs.readFileSync(r.after.reportPath, 'utf8')).nativePathConfirmed, true)
      assert.ok(path.resolve(r.after.reportPath).startsWith(path.resolve(output) + path.sep))
      fs.writeFileSync(path.join(output, 'native-result.json'), JSON.stringify(r, null, 2))
    })
    await test('already-round baseline refuses injection and does not reset Canvas', async () => {
      const r = await page.evaluate(() => { const g = resetWorld(); g.ctx.lineCap = 'round'; const c = startTest(window); let failed = false; try { c.fire() } catch (_) { failed = true } c.stop(); return { failed, n: g.vfx.length, cap: g.ctx.lineCap } })
      assert.deepEqual(r, { failed: true, n: 0, cap: 'round' })
    })
    await test('fix enabled refuses installation before changing optimizer', async () => {
      const r = await page.evaluate(() => { resetWorld(); window.__cattailClearViewGridFixInstalled = true; let failed = false; try { startTest(window) } catch (_) { failed = true } return { failed, enabled: CattailTweaksResourceExplosionBezierFastPath.stats().enabled } })
      assert.deepEqual(r, { failed: true, enabled: true })
    })
    await test('single explicit trigger and F9 restore; repeated injection rejected', async () => {
      const r = await page.evaluate(() => { const g = resetWorld(), c = startTest(window); c.fire(); let failed = false; try { c.fire() } catch (_) { failed = true } const n = g.vfx.length; g.renderVFX(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9' })); return { failed, n, active: c.active, cap: g.ctx.lineCap, reason: c.result().stopReason } })
      assert.deepEqual(r, { failed: true, n: 1, active: false, cap: 'butt', reason: 'F9' })
    })
    await test('restore preserves previously disabled effective configuration', async () => {
      const r = await page.evaluate(() => { resetWorld(); window.dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key: 'enableResourceExplosionBezierFastPath', value: false } })); const c = startTest(window); c.fire(); DEBUG.renderVFX(); c.stop(); return c.result() })
      assert.equal(r.previousEnabled, false); assert.equal(r.restoredEnabled, false); assert.equal(r.nativePathConfirmed, true)
    })
    await test('pre-render competing round writer invalidates trial without clearing its state', async () => {
      const r = await page.evaluate(() => { const g = resetWorld(), c = startTest(window); c.fire(); g.ctx.lineCap = 'round'; g.renderVFX(); return { r: c.result(), cap: g.ctx.lineCap, count: g.vfx.length } })
      assert.equal(r.r.nativePathConfirmed, false); assert.equal(r.r.stopReason, 'baseline-changed-before-render'); assert.equal(r.cap, 'round'); assert.equal(r.count, 0)
    })
    await test('native render exception identity, Canvas descriptor and effective settings restored', async () => {
      const r = await page.evaluate(() => { const g = resetWorld(), d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineCap'), error = new Error('sentinel'), c = startTest(window); c.fire(); g.ctx.stroke = () => { throw error }; let same = false; try { g.renderVFX() } catch (e) { same = e === error } return { same, r: c.result(), cap: g.ctx.lineCap, descriptorSame: Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineCap').set === d.set } })
      assert(r.same && r.descriptorSame); assert.equal(r.cap, 'butt'); assert.equal(r.r.restoredEnabled, true); assert.equal(r.r.stopReason, 'render-error')
    })
    await test('newer user preview wins and removes only own effect', async () => {
      const r = await page.evaluate(() => { resetWorld(); const c = startTest(window); c.fire(); window.dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key: 'enableResourceExplosionBezierFastPath', value: false } })); return { active: c.active, n: DEBUG.vfx.length, enabled: CattailTweaksResourceExplosionBezierFastPath.stats().enabled } })
      assert.deepEqual(r, { active: false, n: 0, enabled: false })
    })
    await test('20-second restore and 60-second idle deadline invoke cleanup', async () => {
      const r = await page.evaluate(() => {
        const st = window.setTimeout, ct = window.clearTimeout, jobs = new Map(); let serial = 0
        window.setTimeout = (fn, ms) => { jobs.set(++serial, { fn, ms }); return serial }; window.clearTimeout = id => jobs.delete(id)
        try { resetWorld(); let c = startTest(window); c.fire(); DEBUG.renderVFX(); [...jobs.values()].find(x => x.ms === 20000).fn(); const after = c.result();
          resetWorld(); c = startTest(window); [...jobs.values()].find(x => x.ms === 60000).fn(); return { after, idle: c.result(), jobs: jobs.size }
        } finally { window.setTimeout = st; window.clearTimeout = ct }
      })
      assert.equal(r.after.capRestored, true); assert.equal(r.after.stopReason, '20-seconds-after-trigger'); assert.equal(r.idle.stopReason, '60-second-safety-timeout'); assert.equal(r.idle.fired, false); assert.equal(r.jobs, 0)
    })
    await test('actual earlier Dynamic Details F8 handler is independent; countdown reaches native explosion', async () => {
      const r = await page.evaluate(() => {
        resetWorld(); const st = window.setTimeout, ct = window.clearTimeout, jobs = new Map(); let id = 0
        window.setTimeout = (fn, ms) => { jobs.set(++id, { fn, ms }); return id }; window.clearTimeout = id => jobs.delete(id)
        try { const c = startTest(window); const old = profilerToggleCount; c.fireAfter(); [...jobs.values()].find(j => j.ms === 8000).fn(); DEBUG.renderVFX();
          const during = c.result(), untouched = profilerToggleCount === old; c.stop();
          const c2 = startTest(window); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8' })); const n = DEBUG.vfx.length, enabled = cattailResourceSourceProfiler.isEnabled(); c2.stop();
          return { during, untouched, n, enabled, jobs: jobs.size }
        } finally { window.setTimeout = st; window.clearTimeout = ct; cattailResourceSourceProfiler.disable() }
      })
      assert.equal(r.during.nativePathConfirmed, true); assert.equal(r.untouched, true); assert.equal(r.n, 0); assert.equal(r.enabled, true); assert.equal(r.jobs, 0)
    })
    await test('profiler enabled at start refuses helper without changing explosion optimization', async () => {
      const r = await page.evaluate(() => { resetWorld(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' })); let failed = false; try { startTest(window) } catch (_) { failed = true } const enabled = CattailTweaksResourceExplosionBezierFastPath.stats().enabled; cattailResourceSourceProfiler.disable(); return { failed, enabled } })
      assert.deepEqual(r, { failed: true, enabled: true })
    })
    await test('profiler enabled during countdown cancels injection and restores; F9 cancels pending timer', async () => {
      const r = await page.evaluate(() => {
        resetWorld(); const st = window.setTimeout, ct = window.clearTimeout, jobs = new Map(); let id = 0
        window.setTimeout = (fn, ms) => { jobs.set(++id, { fn, ms }); return id }; window.clearTimeout = id => jobs.delete(id)
        try { let c = startTest(window); c.fireAfter(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' })); [...jobs.values()].find(j => j.ms === 8000).fn(); const r = c.result();
          resetWorld(); c = startTest(window); c.fireAfter(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9' })); return { r, n: DEBUG.vfx.length, active: c.active, jobs: jobs.size }
        } finally { window.setTimeout = st; window.clearTimeout = ct; cattailResourceSourceProfiler.disable() }
      })
      assert.equal(r.r.fired, false); assert.equal(r.r.stopReason, 'resource-profiler-enabled'); assert.equal(r.r.restoredEnabled, true); assert.equal(r.n, 0); assert.equal(r.active, false); assert.equal(r.jobs, 0)
    })
    const versions = await electron.evaluate(() => process.versions)
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, versions, scope: 'Native methods + actual Tweaks + real Canvas. World/registration/focus/timer/Bezier fixtures; no player profile or performance acceptance.' }, null, 2))
    console.log('REPORT ' + path.join(output, 'report.json'))
  } finally { if (electron) await electron.close() }
}
run().catch(error => { console.error(error); console.error('OUTPUT ' + output); process.exitCode = 1 })
