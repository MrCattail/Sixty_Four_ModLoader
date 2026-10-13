'use strict'

// Real Game.renderGrid, Loader lifecycle/layers/settings, and Canvas2D in an
// isolated copy of the shipped Electron runtime. World/input are fixtures.
// No game startup, Steam, player profile, or player saves are used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
	playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const ROOT = path.resolve(__dirname, '../../..')
const RUNTIME = path.resolve(ROOT, '../../..')
const MOD = 'Cattail_TweaksQuality_Tweaks'
const KEY = 'enableClearViewGridFix'
const ENTRY = 'scripts/clear-view-grid-fix.js'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', MOD, 'mod.json'), 'utf8'))
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tweaks-clear-view-fix-'))
const { NATIVE_HASHES } = require(path.join(ROOT, 'modloader/diagnostics/clear-view-ablation'))
const hash = source => crypto.createHash('sha256').update(source.replace(/\s+/g, '')).digest('hex')

function fixture() {
	window.nativeGrid = Game.prototype.renderGrid
	// Only the outer loop is synthetic. The native grid and projection methods
	// below are not replaced. Other game systems are outside this test.
	Game.prototype.renderloop = function () { return this.renderGrid('fixture-argument') }
	window.game = Object.assign(Object.create(Game.prototype), {
		version: '1.3', isMobile: false, language: 'sch', languageId: 12,
		w: 320, h: 180, w2: 240, h2: 135, pixelRatio: 1.5,
		zoom: 0.5, unit: 28, translation: [0, 0], plane: 0, touchMode: 0,
		altActive: true, stuff: [], stuffMap: { u0v0: { name: 'existing' } },
		codex: { entities: { candidate: {} } }, itemInHand: null,
		canvas: document.querySelector('canvas')
	})
	game.canvas.width = 480; game.canvas.height = 270
	// Keep pixel comparisons on a stable readback backend. Otherwise repeated
	// getImageData can change the test Canvas raster backend mid-comparison.
	// Layer routing below still uses Loader-created default Canvas contexts.
	game.ctx = game.canvas.getContext('2d', { willReadFrequently: true })
	window.originalMain = game.ctx
	game.ctx.lineCap = 'round'
	game.ctx.lineWidth = 7
	game.ctx.strokeStyle = '#123456'
	window.instrument = function (ctx) {
		if (ctx.__gridLog) return ctx.__gridLog
		const log = ctx.__gridLog = []
		for (const key of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill']) {
			const original = ctx[key]
			ctx[key] = function (...args) {
				log.push(key === 'stroke' ? [key, this.lineCap, this.lineWidth, this.strokeStyle] :
					key === 'fill' ? [key, this.fillStyle] : [key, ...args])
				return original.apply(this, args)
			}
		}
		return log
	}
	window.compare = function (options = {}) {
		Object.assign(game, { itemInHand: options.item ? { name: 'candidate' } : null,
			transportedEntity: options.move ? { name: 'candidate' } : null })
		const ctx = game.ctx, log = instrument(ctx)
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
		ctx.lineCap = 'butt'; log.length = 0
		nativeGrid.call(game)
		const expected = JSON.stringify(log)
		const pixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data.slice()
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
		ctx.lineCap = 'round'; log.length = 0
		game.renderGrid()
		const actual = JSON.stringify(log)
		const fixedPixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data
		return { sameCommands: expected === actual,
			samePixels: pixels.every((v, i) => v === fixedPixels[i]), restored: ctx.lineCap === 'round',
			width: ctx.lineWidth, color: ctx.strokeStyle, strokes: log.filter(v => v[0] === 'stroke').length,
			fills: log.filter(v => v[0] === 'fill').length }
	}
	window.boot = async function () {
		await ModLoader.boot()
		const options = new URLSearchParams(location.search)
		if (options.has('off')) ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.set('enableClearViewGridFix', false)
		if (options.has('throw')) {
			const sentinel = window.sentinel = new Error('expected-grid-error')
			Game.prototype.renderGrid = function (...args) {
				window.throwCall = { sameThis: this === game, args, cap: this.ctx.lineCap }
				throw sentinel
			}
		}
		if (options.has('return')) Game.prototype.renderGrid = function (...args) { return { sameThis: this === game, args, cap: this.ctx.lineCap } }
		if (options.has('earlyLayer')) ModLoader.render.install(game)
		await ModLoader.stage('afterVanillaScripts', game)
		window.ready = true
	}
}

const entries = [ENTRY, 'scripts/floor-grid-lines.js', 'scripts/dynamic-camera.js']
const allowed = new Set(['scripts/game.js', 'modloader/loader.js', 'modloader/translations.json', ...entries.map(v => `mods/${MOD}/${v}`)])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	const file = decodeURIComponent(url.pathname.slice(1))
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><canvas></canvas><script src="/scripts/game.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(e=>window.bootError=e.stack)</script>'
	} else if (file === 'mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: [MOD] })
	} else if (file === `mods/${MOD}/mod.json`) {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries })
	} else if (allowed.has(file)) {
		body = fs.readFileSync(path.join(ROOT, file), 'utf8')
		if (file.endsWith('.json')) type = 'application/json'
		if (file === 'modloader/loader.js') {
			// Test-only access to the real diagnostic guard's captured function.
			body = body.replace('window.ModLoader = api', 'window.testNativeGrid = () => clearViewNativeGrid; window.ModLoader = api')
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	assert.ok(manifest.entries.includes(ENTRY))
	assert.equal(manifest.config[KEY].default, true)
	assert.equal(manifest.config[KEY].reloadPolicy, 'reload')
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const runtime = path.join(output, 'runtime'), app = path.join(runtime, 'resources/app')
	fs.mkdirSync(app, { recursive: true })
	for (const file of ['sixtyfour.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'locales']) {
		if (fs.existsSync(path.join(RUNTIME, file))) fs.cpSync(path.join(RUNTIME, file), path.join(runtime, file), { recursive: true })
	}
	fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'tweaks-grid-test', version: '1.0.0', main: 'main.cjs' }))
	fs.writeFileSync(path.join(app, 'main.cjs'), `const {app,BrowserWindow,session}=require('electron');
app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});
app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(${JSON.stringify(address + '/')})}));
const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});win.loadURL(${JSON.stringify(address)});});
app.on('window-all-closed',()=>app.quit());`)
	const env = { ...process.env }
	for (const key of Object.keys(env)) if (['electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
	const electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env })
	const results = [], errors = []
	const page = await electron.firstWindow()
	page.on('pageerror', error => errors.push(error.message))
	const ready = async () => {
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
	}
	const reset = async query => {
		await page.evaluate(() => localStorage.clear())
		await page.goto(address + (query || '')); await ready()
	}
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	try {
		await ready()
		await check('native command stream and pixels preserved, only stroke caps change', async () => {
			for (const state of [{}, { item: true }, { item: true, move: true }]) {
				const r = await page.evaluate(state => compare(state), state)
				assert.ok(r.sameCommands && r.samePixels && r.restored && r.strokes > 0)
				assert.equal(r.width, 7); assert.equal(r.color, '#123456')
				assert.equal(r.fills, state.item && !state.move ? 1 : 0)
			}
		})
		await check('DPR, zoom, camera angles and both planes retain geometry and placement fills', async () => {
			const output = await page.evaluate(() => {
				const rows = []
				for (const dpr of [1, 1.5, 2]) for (const zoom of [0.1, 0.5, 2]) for (const plane of [0, 1]) for (const camera of [{ pitch: 0.5, yaw: 0 }, { pitch: 0.7, yaw: Math.PI / 6 }]) {
					game.pixelRatio = dpr; game.zoom = zoom; game.unit = 56 * zoom; game.plane = plane
					game.canvas.width = game.w * dpr; game.canvas.height = game.h * dpr
					game.w2 = game.canvas.width / 2; game.h2 = game.canvas.height / 2
					game.__cattailDynamicCameraState = { ...camera }
					rows.push({ ...compare({ item: true }), dpr, zoom, plane, camera })
				}
				return rows
			})
			assert.equal(output.length, 36)
			const failures = output.filter(r => !r.sameCommands || !r.samePixels || !r.restored || !r.strokes)
			assert.deepEqual(failures, [])
		})
		await reset()
		await check('Loader layers on/off preserve caps, callbacks and Tweaks floor-grid independence', async () => {
			const rows = await page.evaluate(() => {
				const api = ModLoader.forMod('Cattail_TweaksQuality_Tweaks'), rows = []
				let callbacks = 0
				const scope = api.render.scope()
				scope.onLayer('interaction', () => { callbacks++ }, { id: 'grid-fix-test' })
				const layer = api.render.context('interaction', game)
				for (const enabled of [true, false, true]) for (const floor of [true, false]) {
					ModLoader.render.setEnabled(enabled); api.config.set('enableFloorGridLines', floor)
					const mainLog = instrument(originalMain), layerLog = instrument(layer)
					originalMain.lineCap = 'round'; layer.lineCap = 'square'; mainLog.length = layerLog.length = 0
					const before = callbacks; game.renderloop()
					const strokes = (enabled ? layerLog : mainLog).filter(v => v[0] === 'stroke')
					rows.push({ count: strokes.length, butt: strokes.every(v => v[1] === 'butt'),
						mainCap: originalMain.lineCap, layerCap: layer.lineCap, sameCtx: game.ctx === originalMain,
						callback: callbacks - before, expectedCallback: enabled ? 1 : 0 })
				}
				scope.dispose(); return rows
			})
			assert.ok(rows.every(r => r.count > 0 && r.butt && r.mainCap === 'round' && r.layerCap === 'square' && r.sameCtx && r.callback === r.expectedCallback), JSON.stringify(rows))
		})
		await check('repeated lifecycle hook does not install twice', async () => {
			assert.equal(await page.evaluate(async () => {
				const previous = Game.prototype.renderGrid
				await ModLoader.stage('afterVanillaScripts', game)
				return previous === Game.prototype.renderGrid
			}), true)
		})
		await check('diagnostic source guard rejects fixed baseline rather than silently relabeling it', async () => {
			assert.notEqual(hash(await page.evaluate(() => testNativeGrid().toString())), NATIVE_HASHES.renderGrid)
		})
		await check('menu option saves and reloads to the exact native diagnostic baseline', async () => {
			await page.evaluate(() => ModLoader.togglePanel())
			await page.locator('.modloader-mod-title').click()
			const field = page.locator('[data-modloader-config-key="enableClearViewGridFix"]')
			assert.equal(await field.getAttribute('aria-label'), '清晰视图网格卡顿修复')
			await page.waitForTimeout(350) // Let the existing settings expansion finish.
			await field.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'setting.png') })
			await field.uncheck()
			assert.notEqual(hash(await page.evaluate(() => testNativeGrid().toString())), NATIVE_HASHES.renderGrid, 'no partial hot uninstall')
			await Promise.all([page.waitForEvent('load'), page.locator('.modloader-save-button').click()]); await ready()
			assert.equal(hash(await page.evaluate(() => testNativeGrid().toString())), NATIVE_HASHES.renderGrid)
			const caps = await page.evaluate(() => { const log = instrument(game.ctx); game.renderGrid(); return log.filter(v => v[0] === 'stroke').map(v => v[1]) })
			assert.ok(caps.length > 0 && caps.every(v => v === 'round'))
		})
		await reset('?throw')
		await check('exceptions keep identity and restore the caller cap', async () => {
			const r = await page.evaluate(() => { let sameError = false; try { game.renderGrid('sentinel-arg') } catch (e) { sameError = e === sentinel }; return { sameError, restoredCap: game.ctx.lineCap, ...throwCall } })
			assert.deepEqual(r, { sameError: true, restoredCap: 'round', cap: 'butt', sameThis: true, args: ['sentinel-arg'] })
		})
		await reset('?return')
		await check('arguments, receiver and return values survive the wrapper', async () => {
			assert.deepEqual(await page.evaluate(() => game.renderGrid('a', 64)), { sameThis: true, args: ['a', 64], cap: 'butt' })
			assert.equal(await page.evaluate(() => game.ctx.lineCap), 'round')
			for (const field of ['version', 'isMobile']) {
				assert.equal(await page.evaluate(field => { game[field] = field === 'version' ? '1.2.1' : true; return game.renderGrid().cap }, field), 'round')
				await page.evaluate(() => { game.version = '1.3'; game.isMobile = false })
			}
		})
		await reset('?earlyLayer')
		await check('safe when the Loader has already installed its render wrapper', async () => {
			const r = await page.evaluate(() => compare())
			assert.ok(r.sameCommands && r.samePixels && r.restored)
		})
		await check('disabling Tweaks entirely restores the native method', async () => {
			await page.route('**/mods/enabled.json*', route => route.fulfill({ contentType: 'application/json', body: '{"mods":[]}' }))
			await reset()
			assert.equal(hash(await page.evaluate(() => testNativeGrid().toString())), NATIVE_HASHES.renderGrid)
			assert.equal(await page.evaluate(() => window.__cattailClearViewGridFixInstalled), undefined)
		})
		assert.deepEqual(errors, [])
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, results, errors,
			versions: await electron.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome })),
			scope: 'real native grid, Canvas, Loader/settings; pixel comparison uses a readback Canvas, layers use default contexts; synthetic loop/world/input, no player performance or gameplay acceptance' }, null, 2))
		console.log('Report: ' + output)
	} finally { await electron.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
