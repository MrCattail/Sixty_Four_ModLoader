'use strict'

// Actual 1.3 input handlers, Game/Cloud, Canvas, Loader and settings UI.
// World/entities and the outer frame are fixtures; no player data or Steam.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
	playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const ROOT = process.env.SIXTY_FOUR_GAME_ROOT || path.resolve(__dirname, '../../..')
const RUNTIME = path.resolve(ROOT, '../../..')
const MODROOT = path.resolve(__dirname, '..')
const MOD = 'Cattail_TweaksQuality_Tweaks'
const KEY = 'enableCardHoverFix'
const FIX = 'scripts/card-hover-fix.js'
const manifest = JSON.parse(fs.readFileSync(path.join(MODROOT, 'mod.json'), 'utf8'))
const output = fs.mkdtempSync(path.join(process.env.RIGHT_DRAG_TEST_OUTPUT_ROOT || os.tmpdir(), 'tweaks-right-drag-'))
const entries = ['scripts/camera-zoom-anchor.js', FIX, 'scripts/camera-angles.js', 'scripts/gradient-relocation-puncture-allow.js', 'scripts/gradient-relocation-no-penalty.js']
const bubbleCss = fs.readFileSync(path.join(ROOT, 'cascade.css'), 'utf8').match(/\.hintBubble\{[\s\S]*?\n\s*\}/)[0]

function fixture() {
	const params = new URLSearchParams(location.search)
	window.metrics = { nativeMoves: 0 }
	const nativeMove = Game.prototype.processMove
	Game.prototype.processMove = function (...args) {
		metrics.nativeMoves++
		metrics.delta = this.mouse.delta
		metrics.deltaValues = this.mouse.delta.slice()
		metrics.buttons = this.mouse.state
		return nativeMove.apply(this, args)
	}
	window.game = Object.create(Game.prototype)
	const canvas = document.querySelector('canvas')
	const api = () => ModLoader.forMod('Cattail_TweaksQuality_Tweaks')
	window.setOption = function (key, value) {
		api().config.set(key, value)
		dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key, value } }))
	}
	window.renderHint = function () {
		// Mobile rendering is outside this desktop fixture; test its delegation only.
		if (game.isMobile) return
		game.renderCursor(false)
		if (game.currentHint.element) {
			game.currentHint.element.style.left = game.mouse.sxy[0] + 'px'
			game.currentHint.element.style.top = game.mouse.sxy[1] + 'px'
		}
	}
	window.hintMutations = []
	new MutationObserver(records => {
		for (const r of records) for (const [kind, nodes] of [['add', r.addedNodes], ['remove', r.removedNodes]]) {
			for (const n of nodes) if (n.matches?.('.hintBubble')) hintMutations.push(kind)
		}
	}).observe(document.body, { childList: true })
	window.configureScene = async function (options = {}) {
		if (game.currentHint?.element) game.removeHint()
		const ratio = options.ratio || 1, zoom = options.zoom || 1
		Object.assign(game, {
			version: params.has('old') ? '1.2.1' : '1.3', isMobile: params.has('mobile'), isWindows: true,
			canvas, ctx: canvas.getContext('2d'), w: 900 * ratio, h: 650 * ratio, w2: 450 * ratio, h2: 325 * ratio,
			pixelRatio: ratio, zoom, solidUnit: 100, unit: 100 * zoom, translation: [0, 0], plane: options.plane || 0,
			mouse: { sxy: [450, 325], xy: [450 * ratio, 325 * ratio], delta: [0, 0], state: 0, cursorVisible: true },
			resourceHomes: [], screenUnit: 100 * ratio, currentHint: {}, distanceToOrigins: 0, touchMode: 0, altActive: false,
			stuffMap: {}, stuff: [], interactionMode: null, itemInHand: null, selectedEntity: false,
			relocationList: null, relocationOffsets: null, codex: { entities: { candidate: {} } },
			store: { isOpen: false, vessel: document.createElement('div') }, memoryComplexUI: document.createElement('div'),
			soundSources: new Set(), language: 'sch', languageId: 12, resources: new Array(10).fill(0)
		})
		canvas.width = game.w; canvas.height = game.h
		setOption('enableCameraAngle', !!options.camera)
		if (options.camera) game.__cattailTweaksCameraAngleState = { pitch: options.camera.pitch, yaw: options.camera.yaw }
		if (options.enabled !== undefined) setOption('enableCardHoverFix', options.enabled)
		window.addBuilding = function (position, name) {
			const entity = { master: game, name, position, canHit: () => false, canDarkHit: () => false, onmousedown() {}, onmouseup() {} }
			const hint = new Cloud(entity)
			hint.addDescription('<b>' + name + '</b><br>Building information')
			entity.getHint = entity.getDarkHint = entity.getSellHint = () => hint
			game.stuff.push(entity); game.stuffMap['u' + position[0] + 'v' + position[1]] = entity
			return entity
		}
		const cell = game.xyToUV(game.mouse.sxy).map(Math.floor)
		window.building = addBuilding(cell, 'fixture-building')
		game.updatePointerState()
		renderHint()
		window.metrics = { nativeMoves: 0 }
		await Promise.resolve()
		hintMutations.length = 0
	}
	window.snapshot = function () {
		const actual = game.entityAtCoordinates(game.xyToUV(game.mouse.sxy).map(Math.floor))
		const element = game.currentHint.element
		return {
			actual: actual?.name || null, hover: game.hoveredEntity?.name || null,
			hint: game.currentHint.entity?.name || null, visible: !!element?.isConnected && element.getBoundingClientRect().width > 0,
			moves: metrics.nativeMoves, deltaIdentity: metrics.delta === game.mouse.delta,
			deltaSame: JSON.stringify(metrics.deltaValues) === JSON.stringify(game.mouse.delta),
			buttonsSame: metrics.buttons === game.mouse.state, translation: game.translation.slice(),
			mutations: hintMutations.slice(), state: game.mouse.state
		}
	}
	window.boot = async function () {
		// The current game object is passed through the actual Loader lifecycle.
		Object.assign(game, { version: params.has('old') ? '1.2.1' : '1.3', isMobile: params.has('mobile'), canvas, language: 'sch', languageId: 12 })
		await ModLoader.boot()
		api().config.set('enableCameraAngle', false)
		await ModLoader.stage('afterVanillaScripts', game)
		await configureScene()
		game.setListenersDesktop()
		for (const type of ['mousemove', 'mousedown', 'mouseup']) canvas.addEventListener(type, renderHint)
		window.ready = true
	}
}

const allowed = new Set(['scripts/game.js', 'scripts/ui.js', 'modloader/loader.js', 'modloader/translations.json', ...entries.filter(f => f !== FIX).map(f => 'mods/' + MOD + '/' + f)])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost'), file = decodeURIComponent(url.pathname.slice(1))
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}canvas{position:absolute;left:0;top:0;width:900px;height:650px;background:#e5e1ee}' + bubbleCss + '</style><canvas class="canvas"></canvas><script src="/scripts/game.js"></script><script src="/scripts/ui.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(e=>window.bootError=e.stack)</script>'
	} else if (file === 'mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: [MOD] })
	} else if (file === 'mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries })
	} else if (file === 'mods/' + MOD + '/' + FIX) {
		body = fs.readFileSync(path.join(MODROOT, FIX), 'utf8')
	} else if (allowed.has(file)) {
		body = fs.readFileSync(path.join(ROOT, file), 'utf8')
		if (file.endsWith('.json')) type = 'application/json'
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	assert.equal(manifest.config[KEY].default, true)
	assert.equal(manifest.config[KEY].reloadPolicy, 'hot')
	assert.equal(manifest.entries.filter(f => f === FIX).length, 1)
	assert(manifest.entries.indexOf(FIX) < manifest.entries.indexOf('scripts/gradient-relocation-puncture-allow.js'))
	for (const lang of ['en', 'sch', 'modsch', 'tch']) assert(manifest.config[KEY].label[lang] && manifest.config[KEY].description[lang])
	assert.equal(manifest.version, '0.1.0')
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const runtime = path.join(output, 'runtime'), app = path.join(runtime, 'resources/app')
	fs.mkdirSync(app, { recursive: true })
	for (const file of ['sixtyfour.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'locales']) {
		if (fs.existsSync(path.join(RUNTIME, file))) fs.cpSync(path.join(RUNTIME, file), path.join(runtime, file), { recursive: true })
	}
	fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'tweaks-right-drag-test', version: '1.0.0', main: 'main.cjs' }))
	fs.writeFileSync(path.join(app, 'main.cjs'),
		'const {app,BrowserWindow,session}=require("electron");app.setPath("userData",' + JSON.stringify(path.join(output, 'profile')) + ');app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(' + JSON.stringify(address + '/') + ')}));const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});win.loadURL(' + JSON.stringify(address) + ');});app.on("window-all-closed",()=>app.quit());')
	const env = { ...process.env }
	for (const key of Object.keys(env)) if (['electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
	const electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env, args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] })
	const results = [], errors = [], page = await electron.firstWindow()
	page.setDefaultTimeout(15000)
	page.on('pageerror', e => errors.push(e.message))
	const ready = async () => { await page.waitForFunction(() => window.ready || window.bootError); assert.equal(await page.evaluate(() => window.bootError), undefined) }
	const reset = async query => { await page.evaluate(() => localStorage.clear()); await page.goto(address + (query || '')); await ready() }
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	async function drag(options = {}, domEvents = false) {
		if (domEvents) return page.evaluate(async options => {
			await configureScene(options)
			const emit = (type, x, buttons) => game.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 325, buttons, button: type === "mousemove" ? 0 : 2, bubbles: true }))
			emit("mousedown", 450, 2)
			metrics.nativeMoves = 0; hintMutations.length = 0
			const rows = [], scale = (options.zoom || 1) / (options.ratio || 1)
			for (const offset of [160, 161, 1, 0, 160, 161, 1, 0]) {
				emit("mousemove", 450 + offset * scale, 2)
				await Promise.resolve(); rows.push(snapshot())
			}
			emit("mouseup", 450, 0)
			return rows
		}, options)
		await page.evaluate(o => configureScene(o), options)
		await page.mouse.move(450, 325)
		await page.mouse.down({ button: 'right' })
		await page.evaluate(() => { metrics.nativeMoves = 0; hintMutations.length = 0 })
		const scale = (options.zoom || 1) / (options.ratio || 1), rows = []
		for (const offset of [160, 161, 1, 0, 160, 161, 1, 0]) {
			await page.mouse.move(450 + offset * scale, 325)
			rows.push(await page.evaluate(() => snapshot()))
		}
		await page.mouse.up({ button: 'right' })
		return rows
	}
	let passed = false
	try {
		await ready()
		await check('default enabled, real DOM remains attached through actual right-button events', async () => {
			assert.equal(await page.evaluate(() => ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.get('enableCardHoverFix')), true)
			const rows = await drag()
			assert(rows.every(r => r.actual === 'fixture-building' && r.hover === r.actual && r.hint === r.actual && r.visible))
			assert(rows.every((r, i) => r.moves === i + 1 && r.deltaIdentity && r.deltaSame && r.buttonsSame && r.state === 2))
			assert(rows.every(r => r.mutations.length === 0))
			assert.deepEqual(rows.at(-1).translation, [0, 0])
			assert.equal(await page.evaluate(() => game.mouse.state), 0)
			assert.equal(await page.locator('.hintBubble').count(), 1)
		})
		await check('native failure is observable when disabled, including actual DOM removals', async () => {
			const rows = await drag({ enabled: false })
			assert(rows.every(r => r.actual === 'fixture-building'))
			assert(rows.some(r => r.hover !== r.actual && !r.visible))
			assert(rows.some(r => r.hover === r.actual && r.visible))
			assert(rows.at(-1).mutations.includes('remove'))
		})
		await check('36 projection/plane/DPR/zoom combinations keep the correct building and one native move', async () => {
			for (const camera of [null, { pitch: .87, yaw: Math.PI / 4 }, { pitch: .25, yaw: -Math.PI / 6 }]) for (const ratio of [1, 2]) for (const zoom of [.5, 1, 2]) for (const plane of [0, 1]) {
				const options = { camera, ratio, zoom, plane, enabled: true }, rows = await drag(options, true)
				assert(rows.every(r => r.actual === 'fixture-building' && r.hover === r.actual && r.hint === r.actual && r.visible && r.mutations.length === 0), JSON.stringify(options))
				assert(rows.every((r, i) => r.moves === i + 1 && r.deltaIdentity && r.deltaSame && r.buttonsSame), JSON.stringify(options))
			}
		})
		await reset()
		await check('ordinary pointer exits and different buildings update without latching a hint', async () => {
			await page.evaluate(() => configureScene({ enabled: true }))
			const second = await page.evaluate(() => {
				const p = [building.position[0] + 1, building.position[1]]
				addBuilding(p, 'second-building')
				return game.uvToXYUntranslated(p).map(v => v / game.pixelRatio)
			})
			await page.mouse.move(...second)
			assert.equal((await page.evaluate(() => snapshot())).hint, 'second-building')
			await page.mouse.move(850, 50)
			assert.equal((await page.evaluate(() => snapshot())).visible, false)
			await page.mouse.move(450, 325)
			assert.equal((await page.evaluate(() => snapshot())).hint, 'fixture-building')
		})
		await check('no movement, non-right buttons, and native arguments/results remain delegated', async () => {
			const result = await page.evaluate(async () => {
				await configureScene({ enabled: true })
				const original = game.xyToUV; let lookups = 0
				game.xyToUV = function (...a) { lookups++; return original.apply(this, a) }
				const rows = []
				for (const [button, delta] of [[2, [0, 0]], [0, [80, 0]], [1, [80, 0]], [3, [80, 0]]]) {
					game.mouse.state = button; game.mouse.delta = delta; game.translation = [0, 0]
					lookups = 0
					const value = game.processMove('sentinel')
					rows.push({ lookups, translation: game.translation.slice(), result: value === undefined })
				}
				game.xyToUV = original; return rows
			})
			assert(result.every(r => r.lookups === 0 && r.result && r.translation.every(v => v === 0)))
		})
		await check('active build/erase/relocate retain one action pass alongside existing Gradient wrapper', async () => {
			const rows = await page.evaluate(async () => {
				const out = []
				for (const mode of ['build', 'erase', 'relocate']) {
					await configureScene({ enabled: true })
					game.interactionMode = mode; game.mouse.state = 2; game.mouse.delta = [160, 0]
					let builds = 0
					game.canPlaceEntityHere = () => { builds++; return false }
					game.itemInHand = { name: 'candidate' }
					game.relocationList = []; game.relocationOffsets = []
					game.processMove()
					out.push({ mode, builds, moves: metrics.nativeMoves, translation: game.translation.slice(), hover: game.hoveredEntity === building, canPlace: game.canPlace })
				}
				game.itemInHand = null; game.interactionMode = null
				return out
			})
			for (const r of rows) { assert.equal(r.moves, 1); assert.deepEqual(r.translation, [-160, 0]); assert.equal(r.hover, false); assert.equal(r.builds, r.mode === 'build' ? 1 : 0) }
			assert.equal(rows[0].canPlace, false); assert.equal(rows[2].canPlace, true)
		})
		await check('post-move projection/lookup failures are atomic and never repeat movement', async () => {
			const rows = await page.evaluate(async () => {
				const out = []
				for (const failure of ['projection', 'nonfinite', 'lookup']) {
					await configureScene({ enabled: true })
					const xy = game.xyToUV, at = game.entityAtCoordinates, oldCell = game.hoveredCell, oldEntity = game.hoveredEntity
					game.mouse.state = 2; game.mouse.delta = [160, 0]
					if (failure === 'projection') game.xyToUV = () => { throw new Error('expected projection') }
					if (failure === 'nonfinite') game.xyToUV = () => [NaN, Infinity]
					if (failure === 'lookup') game.entityAtCoordinates = () => { throw new Error('expected lookup') }
					const value = game.processMove()
					out.push({ moves: metrics.nativeMoves, translation: game.translation.slice(), cell: game.hoveredCell === oldCell, entity: game.hoveredEntity === oldEntity, result: value === undefined })
					game.xyToUV = xy; game.entityAtCoordinates = at
				}
				return out
			})
			for (const r of rows) assert.deepEqual(r, { moves: 1, translation: [-160, 0], cell: true, entity: true, result: true })
		})
		await check('native exception identity and pre-translation state are preserved', async () => {
			assert.equal(await page.evaluate(async () => {
				await configureScene({ enabled: true, plane: 1 })
				const sentinel = new Error('expected native')
				building.ondarkhover = () => { throw sentinel }
				game.mouse.state = 2; game.mouse.delta = [160, 0]
				try { game.processMove() } catch (error) { return error === sentinel && metrics.nativeMoves === 1 && game.translation[0] === 0 }
				return false
			}), true)
		})
		await reset()
		await check('repeated lifecycle does not stack the movement wrapper', async () => {
			assert.equal(await page.evaluate(async () => { const method = Game.prototype.processMove; await ModLoader.stage('afterVanillaScripts', game); return method === Game.prototype.processMove }), true)
		})
		await check('actual settings preview/cancel changes behavior immediately', async () => {
			await page.evaluate(() => ModLoader.togglePanel())
			await page.locator('.modloader-mod-title').click()
			const field = page.locator('[data-modloader-config-key="' + KEY + '"]')
			await field.scrollIntoViewIfNeeded(); assert.equal(await field.isChecked(), true); await field.uncheck()
			const stale = await page.evaluate(async () => { await configureScene(); game.mouse.state = 2; game.mouse.delta = [160, 0]; game.mouse.sxy[0] += 160; game.updatePointerState({ sxy: [610, 325], button: 2 }); game.mouse.delta = [160, 0]; game.processMove(); return game.hoveredEntity !== building })
			assert.equal(stale, true)
			await page.screenshot({ path: path.join(output, 'settings.png'), timeout: 8000 })
			await page.locator('.modloader-cancel-button').click()
			const rows = await drag()
			assert(rows.every(r => r.visible && r.hover === r.actual))
		})
		await reset()
		await check('actual settings save/reload retains false and restores the native behavior', async () => {
			await page.evaluate(() => ModLoader.togglePanel()); await page.locator('.modloader-mod-title').click()
			const field = page.locator('[data-modloader-config-key="' + KEY + '"]')
			await field.scrollIntoViewIfNeeded(); await field.uncheck(); await page.locator('.modloader-save-button').click()
			await page.reload(); await ready()
			assert.equal(await page.evaluate(() => ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.get('enableCardHoverFix')), false)
			assert((await drag()).some(r => !r.visible))
			await page.evaluate(() => setOption('enableCardHoverFix', true))
			assert((await drag()).every(r => r.visible))
		})
		for (const query of ['?old', '?mobile']) {
			await reset(query)
			await check('unsupported target delegates and has no installed fix ' + query, async () => {
				assert.equal(await page.evaluate(() => window.__cattailTweaksCardHoverFixInstalled), undefined)
				assert((await drag({ enabled: true })).some(r => r.hover !== r.actual))
			})
		}
		await check('disabled mod on reload has no fix and exposes the original defect', async () => {
			await page.route('**/mods/enabled.json*', route => route.fulfill({ contentType: 'application/json', body: '{"mods":[]}' }))
			await reset()
			assert.equal(await page.evaluate(() => window.__cattailTweaksCardHoverFixInstalled), undefined)
			assert((await drag()).some(r => !r.visible))
		})
		assert.deepEqual(errors, [])
		passed = true
		console.log('RIGHT_DRAG_HOVER_OK=' + results.length)
	} finally {
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed, results, errors, versions: await electron.evaluate(() => process.versions), scope: 'actual Game/Cloud/desktop handlers, DOM/Canvas, Loader/menu and current consumer wrappers; synthetic world, entities and outer frame; independent profile, local HTTP only, no player data, Steam or gameplay acceptance' }, null, 2))
		console.log('Report: ' + output)
		await electron.close(); await new Promise(resolve => server.close(resolve))
	}
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
