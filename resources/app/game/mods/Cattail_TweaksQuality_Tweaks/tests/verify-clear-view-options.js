'use strict'

// Actual desktop 1.3 renderers/projection, Canvas, Loader layers and menu in an
// isolated Electron profile. The outer frame/world/entities are fixtures.
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
const ROOT = path.resolve(__dirname, '../../..')
const RUNTIME = path.resolve(ROOT, '../../..')
const MOD = 'Cattail_TweaksQuality_Tweaks'
const KEYS = ['enableClearViewGridBlock', 'enableClearViewClipBlock', 'enableClearViewGridStyle']
const entries = ['scripts/grid.js', 'scripts/clear-view-options.js', 'scripts/camera-angles.js']
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', MOD, 'mod.json'), 'utf8'))
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tweaks-clear-view-options-'))

function fixture() {
	window.nativeGrid = Game.prototype.renderGrid
	window.nativeAbstract = Game.prototype.renderEntitiesAbstract
	const condition = Game.prototype.renderloop.toString().match(/const clearView = ([^\r\n]+)/)[1]
	const clearView = new Function('showItemInHand', 'return (' + condition + ')')
	Game.prototype.renderloop = function () {
		this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
		this.ctx.save(); this.ctx.translate(this.w2, this.h2)
		try {
			this.renderConductors(16)
			const clear = clearView.call(this, this.itemInHand && this.hoveredCell)
			if (clear) this.renderEntitiesAbstract(16)
			else this.renderEntities(16)
		} finally { this.ctx.restore() }
		if (clearView.call(this, this.itemInHand && this.hoveredCell)) this.renderGrid()
	}
	window.game = Object.assign(Object.create(Game.prototype), {
		version: '1.3', isMobile: false, language: 'sch', languageId: 12,
		w: 320, h: 180, w2: 240, h2: 135, pixelRatio: 1.5,
		zoom: 0.5, unit: 28, translation: [0, 0], plane: 0, touchMode: 0,
		altActive: true, conductors: new Set(), stuff: [], stuffMap: { u0v0: { name: 'existing' } },
		codex: { entities: { candidate: {} } }, itemInHand: null, interactionMode: null,
		canvas: document.querySelector('canvas')
	})
	game.canvas.width = 480; game.canvas.height = 270
	game.ctx = game.canvas.getContext('2d', { willReadFrequently: true })
	window.mainContext = game.ctx
	window.logs = []
	window.instrument = function (ctx, name) {
		if (ctx.__clearOptionsLog) return
		ctx.__clearOptionsLog = true
		for (const method of ['stroke', 'fill', 'clip']) {
			const original = ctx[method]
			ctx[method] = function (...args) {
				logs.push({ method, name, width: this.lineWidth, color: method === 'stroke' ? this.strokeStyle : this.fillStyle, cap: this.lineCap })
				return original.apply(this, args)
			}
		}
	}
	instrument(mainContext, 'main')
	window.renderCalls = []
	for (const [name, position, masked] of [['building', [0, 0], false], ['masked', [2, 0], true], ['conductor', [0, 0], false], ['hidden', [0, 0], false]]) {
		game.stuff.push({ name, position, entitySpan: 0, entityHeight: 3,
			render(dt) {
				renderCalls.push([this.name, dt])
				const xy = game.uvToXY(this.position), ctx = game.ctx
				ctx.save()
				try {
					if (masked) { ctx.beginPath(); ctx.rect(xy[0] - 8, xy[1] - 60, 16, 65); ctx.clip() }
					ctx.fillStyle = masked ? '#00ff00' : '#ff0000'
					ctx.fillRect(xy[0] - 25, xy[1] - 60, 50, 65)
				} finally { ctx.restore() }
			},
			darkrender(dt) { renderCalls.push(['dark:' + this.name, dt]) }
		})
	}
	game.isVisible = entity => entity.name !== 'hidden'
	window.setOption = function (key, value) {
		ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.set(key, value)
		window.dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key, value } }))
	}
	window.clearOptions = function () {
		for (const key of ['enableClearViewGridBlock', 'enableClearViewClipBlock', 'enableClearViewGridStyle']) setOption(key, false)
		setOption('enableGrid', false); setOption('enableCameraAngle', false)
		Object.assign(game, { altActive: true, interactionMode: null, itemInHand: null, hoveredCell: null, transportedEntity: null, plane: 0, touchMode: 0 })
	}
	window.gridSample = function () {
		logs.length = 0; game.ctx.lineCap = 'round'
		const descriptor = Object.getOwnPropertyDescriptor(game.ctx, 'stroke')
		game.renderGrid('arg')
		return { strokes: logs.filter(v => v.method === 'stroke'), fills: logs.filter(v => v.method === 'fill'), cap: game.ctx.lineCap,
			restored: Object.getOwnPropertyDescriptor(game.ctx, 'stroke')?.value === descriptor?.value }
	}
	window.boot = async function () {
		await ModLoader.boot()
		const api = ModLoader.forMod('Cattail_TweaksQuality_Tweaks'), query = new URLSearchParams(location.search)
		api.config.set('enableGrid', false); api.config.set('enableCameraAngle', false)

		if (query.has('startup')) for (const key of ['enableClearViewGridBlock', 'enableClearViewClipBlock', 'enableClearViewGridStyle']) api.config.set(key, true)
		if (query.has('old')) game.version = '1.2.1'
		if (query.has('mobile')) game.isMobile = true
		if (query.has('earlyLayer')) ModLoader.render.install(game)
		await ModLoader.stage('afterVanillaScripts', game)
		for (const layer of ['background', 'interaction', 'buildings']) {
			api.render.onLayer(layer, () => {}, { id: 'options-test-' + layer })
			instrument(api.render.context(layer, game), layer)
		}
		window.ready = true
	}
}

const allowed = new Set(['scripts/game.js', 'modloader/loader.js', 'modloader/translations.json', ...entries.map(v => `mods/${MOD}/${v}`)])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost'), file = decodeURIComponent(url.pathname.slice(1))
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
		if (file === 'modloader/loader.js') body = body.replace('window.ModLoader = api', 'window.testNativeGrid = () => clearViewNativeGrid; window.ModLoader = api')
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	for (const key of KEYS) { assert.equal(manifest.config[key].default, false); assert.equal(manifest.config[key].reloadPolicy, 'hot') }
	assert.ok(manifest.entries.includes('scripts/clear-view-options.js'))
	assert.equal(manifest.version, '0.1.0')
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const runtime = path.join(output, 'runtime'), app = path.join(runtime, 'resources/app')
	fs.mkdirSync(app, { recursive: true })
	for (const file of ['sixtyfour.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'locales']) {
		if (fs.existsSync(path.join(RUNTIME, file))) fs.cpSync(path.join(RUNTIME, file), path.join(runtime, file), { recursive: true })
	}
	fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'tweaks-options-test', version: '1.0.0', main: 'main.cjs' }))
	fs.writeFileSync(path.join(app, 'main.cjs'), `const {app,BrowserWindow,session}=require('electron');
app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});
app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(${JSON.stringify(address + '/')})}));
const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});win.loadURL(${JSON.stringify(address)});});
app.on('window-all-closed',()=>app.quit());`)
	const env = { ...process.env }
	for (const key of Object.keys(env)) if (['electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
	const electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env })
	const results = [], errors = [], page = await electron.firstWindow()
	page.on('pageerror', error => errors.push(error.message))
	const ready = async () => { await page.waitForFunction(() => window.ready || window.bootError); assert.equal(await page.evaluate(() => window.bootError), undefined) }
	const reset = async query => { await page.evaluate(() => localStorage.clear()); await page.goto(address + (query || '')); await ready() }
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	try {
		await ready()
		await check('all-off preserves current native strokes and fills without the retired grid fix', async () => {
			const result = await page.evaluate(() => {
				clearOptions(); game.itemInHand = { name: 'candidate' }
				return gridSample()
			})
			assert.ok(result.strokes.length > 0 && result.strokes.every(v => v.cap === 'butt'))
			assert.equal(result.fills.length, 1); assert.equal(result.cap, 'round'); assert.ok(result.restored)
		})
		await check('all eight toggle combinations preserve shading, priority and style', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); game.itemInHand = { name: 'candidate' }; const rows = [], nativeColor = gridSample().strokes[0].color
				for (const hide of [false, true]) for (const crop of [false, true]) for (const style of [false, true]) {
					setOption('enableClearViewGridBlock', hide); setOption('enableClearViewClipBlock', crop); setOption('enableClearViewGridStyle', style)
					rows.push({ hide, crop, style, nativeColor, ...gridSample() })
				}
				return rows
			})
			for (const row of rows) {
				assert.equal(row.fills.length, 1); assert.ok(row.restored); assert.equal(row.cap, 'round')
				if (row.hide) assert.equal(row.strokes.length, 0)
				else { assert.ok(row.strokes.length > 0); assert.ok(row.strokes.every(v => v.color === (row.style ? '#cbc3e5' : row.nativeColor)), JSON.stringify(row)) }
			}
		})
		await check('off delegates to the current native renderer; enabled path retains internal masks and dt/order', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); ModLoader.render.setEnabled(false); const rows = []
				for (const off of [false, true]) {
					setOption('enableClearViewClipBlock', off)
					const sample = draw => {
						logs.length = 0; renderCalls.length = 0
						mainContext.clearRect(0, 0, 480, 270); mainContext.save(); mainContext.translate(game.w2, game.h2)
						try { draw() } finally { mainContext.restore() }
						const xy = game.uvToXYUntranslated([2, 0])
						const pixel = (x, y) => Array.from(mainContext.getImageData(Math.round(x), Math.round(y), 1, 1).data)
						return { calls: [...renderCalls], clips: logs.filter(v => v.method === 'clip').length, image: game.canvas.toDataURL(),
							top: pixel(game.w2, game.h2 - 40), masked: pixel(xy[0], xy[1] - 40), outsideMask: pixel(xy[0] + 20, xy[1] - 40) }
					}
					rows.push({ off, native: sample(() => nativeAbstract.call(game, 37)), current: sample(() => game.renderEntitiesAbstract(37)) })
				}
				return rows
			})
			// Current native 1.3.0.1 uses reverse drawing and a white fill instead
			// of the old diamond clip. Keep its all-off output as the baseline.
			assert.deepEqual(rows[0].current, rows[0].native)
			assert.deepEqual(rows[0].native.calls, [['conductor', 37], ['masked', 37], ['building', 37]])
			const enabled = rows[1].current
			assert.equal(enabled.clips, 1); assert.deepEqual(enabled.calls, [['building', 37], ['masked', 37]])
			assert.deepEqual(enabled.top, [255, 0, 0, 255])
			assert.deepEqual(enabled.masked, [0, 255, 0, 255]); assert.equal(enabled.outsideMask[3], 0)
			fs.writeFileSync(path.join(output, 'unclipped-canvas.png'), Buffer.from(await page.evaluate(() => game.canvas.toDataURL().split(',')[1]), 'base64'))
		})
		await check('native trigger expression covers Alt, erase, relocate, Q/store placement and ordinary view', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); ModLoader.render.setEnabled(false); setOption('enableClearViewGridStyle', true)
				const rows = []
				for (const mode of ['ordinary', 'alt', 'erase', 'relocate', 'placement', 'touch']) {
					game.altActive = mode === 'alt'; game.interactionMode = ['erase', 'relocate'].includes(mode) ? mode : null
					game.itemInHand = mode === 'placement' ? { name: 'candidate' } : null; game.hoveredCell = mode === 'placement' ? {} : null; game.touchMode = mode === 'touch' ? 1 : 0
					logs.length = 0; game.renderloop(); rows.push({ mode, strokes: logs.filter(v => v.method === 'stroke').length })
				}
				return rows
			})
			for (const row of rows) assert.equal(row.strokes > 0, row.mode !== 'ordinary')
		})
		await check('persistent grid independence and no double drawing across real Loader layers on/off', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); const rows = []
				for (const layers of [false, true]) for (const floor of [false, true]) for (const hide of [false, true]) for (const style of [false, true]) {
					ModLoader.render.setEnabled(layers); setOption('enableGrid', floor); setOption('enableClearViewGridBlock', hide); setOption('enableClearViewGridStyle', style)
					logs.length = 0; game.renderloop()
					rows.push({ layers, floor, hide, style, strokes: logs.filter(v => v.method === 'stroke') })
				}
				return rows
			})
			for (const row of rows) {
				const same = rows.find(v => v.layers === row.layers && v.floor === row.floor && !v.hide && v.style)
				const strokes = row.strokes.filter(v => v.color === '#cbc3e5')
				assert.equal(strokes.length > 0, row.floor || (!row.hide && row.style), JSON.stringify(row))
				if (row.floor && row.style) assert.equal(row.strokes.length, same.strokes.length, 'persistent grid is drawn once')
				if (row.layers && row.floor) assert.ok(strokes.every(v => v.name === 'background'))
			}
		})
		await check('custom abstract-method routing is respected; hot off restores current native rendering', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); ModLoader.render.setEnabled(true); const rows = []
				const api = ModLoader.forMod('Cattail_TweaksQuality_Tweaks'), dispose = api.render.routeMethod('renderEntitiesAbstract', 'buildings')
				const layer = api.render.context('buildings', game)
				for (const off of [true, false]) {
					setOption('enableClearViewClipBlock', off); logs.length = 0; renderCalls.length = 0
					game.renderloop()
					rows.push({ off, clips: logs.filter(v => v.method === 'clip').length, calls: [...renderCalls],
						top: Array.from(layer.getImageData(game.w2, game.h2 - 40, 1, 1).data), sameContext: game.ctx === mainContext })
				}
				dispose(); return rows
			})
			assert.equal(rows[0].clips, 1); assert.deepEqual(rows[0].top, [255, 0, 0, 255])
			assert.equal(rows[1].clips, 1); assert.deepEqual(rows[1].top, [255, 255, 255, 255])
			assert.deepEqual(rows[0].calls, [['building', 16], ['masked', 16]])
			assert.deepEqual(rows[1].calls, [['conductor', 16], ['masked', 16], ['building', 16]])
			for (const row of rows) assert.ok(row.sameContext)
		})
		await check('shared color previews, void fallback, density limit and dynamic camera combinations', async () => {
			const rows = await page.evaluate(() => {
				clearOptions(); setOption('enableClearViewGridStyle', true); const rows = []
				setOption('floorGridRealityColor', '#123abc'); setOption('floorGridVoidColor', '#654321')
				for (const layers of [false, true]) for (const dynamic of [false, true]) for (const plane of [0, 1]) for (const dpr of [1, 1.5, 2]) for (const yaw of [-Math.PI / 2, 0, Math.PI / 6, Math.PI / 2, Math.PI]) {
					ModLoader.render.setEnabled(layers); setOption('enableCameraAngle', dynamic); game.plane = plane; game.pixelRatio = dpr
					game.__cattailTweaksCameraAngleState = { pitch: 0.7, yaw }
					logs.length = 0; game.renderloop(); rows.push({ plane, count: logs.filter(v => v.method === 'stroke').length, strokes: logs.filter(v => v.method === 'stroke') })
				}
				ModLoader.render.setEnabled(false); game.plane = 0; game.unit = 0.02; game.zoom = 0.001
				rows.push({ plane: 0, ...(() => { const v = gridSample(); return { count: v.strokes.length, strokes: v.strokes } })() })
				return rows
			})
			for (const row of rows) { assert.ok(row.count > 0 && row.count <= 1201); assert.ok(row.strokes.every(v => v.color === (row.plane ? '#654321' : '#123abc') && v.cap === 'butt')) }
		})
		await reset()
		await check('actual menu cancel reverses unsaved hot options', async () => {
			await page.evaluate(() => ModLoader.togglePanel()); await page.locator('.modloader-mod-title').click()
			const field = page.locator('[data-modloader-config-key="enableClearViewGridBlock"]')
			await field.scrollIntoViewIfNeeded(); await field.check()
			assert.equal((await page.evaluate(() => gridSample())).strokes.length, 0)
			await page.locator('.modloader-cancel-button').click()
			assert.ok((await page.evaluate(() => gridSample())).strokes.length > 0)
		})
		await reset()
		await check('actual menu preview changes immediately; save/reload retains all three', async () => {
			await page.evaluate(() => ModLoader.togglePanel()); await page.locator('.modloader-mod-title').click()
			for (const key of KEYS) { const field = page.locator(`[data-modloader-config-key="${key}"]`); await field.scrollIntoViewIfNeeded(); assert.equal(await field.isChecked(), false); await field.check() }
			await page.screenshot({ path: path.join(output, 'settings.png'), timeout: 8000 })
			assert.equal((await page.evaluate(() => gridSample())).strokes.length, 0)
			assert.equal(await page.evaluate(() => { ModLoader.render.setEnabled(false); logs.length = 0; game.renderEntitiesAbstract(5); return logs.filter(v => v.method === 'clip').length }), 1)
			await page.locator('.modloader-save-button').click()
			await page.reload(); await ready()
			assert.deepEqual(await page.evaluate(keys => keys.map(k => ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.get(k)), KEYS), [true, true, true])
			assert.equal((await page.evaluate(() => gridSample())).strokes.length, 0)
		})
		await reset('?startup')
		await check('startup true, repeated lifecycle, and hot reversion preserve priority and native output', async () => {
			assert.equal((await page.evaluate(() => gridSample())).strokes.length, 0)
			assert.equal(await page.evaluate(async () => { const before = Game.prototype.renderGrid; await ModLoader.stage('afterVanillaScripts', game); return before === Game.prototype.renderGrid }), true)
			assert.ok((await page.evaluate(() => { clearOptions(); return gridSample() })).strokes.length > 0)
		})
		await reset()
		await check('all-off cold startup keeps exact native diagnostic baseline; native and Tweaks style use butt', async () => {
			assert.equal(await page.evaluate(() => testNativeGrid() === nativeGrid), true)
			assert.ok((await page.evaluate(() => gridSample())).strokes.every(v => v.cap === 'butt'))
			assert.ok((await page.evaluate(() => { setOption('enableClearViewGridStyle', true); return gridSample() })).strokes.every(v => v.cap === 'butt'))
		})
		await check('exceptions retain error identity and restore stroke property and entity Canvas state', async () => {
			const result = await page.evaluate(() => {
				clearOptions(); ModLoader.render.setEnabled(false)
				const sentinel = new Error('expected')
				setOption('enableClearViewGridBlock', true)
				const stroke = mainContext.stroke, xyToUV = game.xyToUV
				game.xyToUV = () => { throw sentinel }; let gridSame = false
				try { game.renderGrid() } catch (error) { gridSame = error === sentinel }
				game.xyToUV = xyToUV
				const render = game.stuff[0].render, matrix = mainContext.getTransform()
				setOption('enableClearViewClipBlock', true); game.stuff[0].render = () => { mainContext.translate(99, 99); throw sentinel }; let entitySame = false
				try { game.renderEntitiesAbstract(8) } catch (error) { entitySame = error === sentinel }
				game.stuff[0].render = render
				return { gridSame, entitySame, stroke: mainContext.stroke === stroke, matrix: mainContext.getTransform().toString() === matrix.toString() }
			})
			assert.deepEqual(result, { gridSame: true, entitySame: true, stroke: true, matrix: true })
		})
		await reset('?startup&earlyLayer')
		await check('enabled startup after preinstalled Loader routing uses correct canvases', async () => {
			const result = await page.evaluate(() => {
				game.itemInHand = { name: 'candidate' }; const grid = gridSample()
				logs.length = 0; game.renderloop()
				return { strokes: grid.strokes.length, fills: grid.fills.length, clips: logs.filter(v => v.method === 'clip').length, context: game.ctx === mainContext }
			})
			assert.deepEqual(result, { strokes: 0, fills: 1, clips: 1, context: true })
		})
		for (const query of ['?old&startup', '?mobile&startup']) {
			await reset(query)
			await check('unsupported target delegates without clipping/grid overrides ' + query, async () => {
				assert.ok((await page.evaluate(() => gridSample())).strokes.length > 0)
				assert.equal(await page.evaluate(() => { ModLoader.render.setEnabled(false); logs.length = 0; game.renderEntitiesAbstract(6); return logs.filter(v => v.method === 'clip').length }), 1)
			})
		}
		await check('disabling Tweaks removes all consumers and patches', async () => {
			await page.route('**/mods/enabled.json*', route => route.fulfill({ contentType: 'application/json', body: '{"mods":[]}' }))
			await reset()
			assert.equal(await page.evaluate(() => window.__cattailTweaksFloorGridV1), undefined)
			assert.equal(await page.evaluate(() => testNativeGrid() === nativeGrid), true)
		})
		assert.deepEqual(errors, [])
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, results, errors, versions: await electron.evaluate(() => process.versions),
			scope: 'actual native grid/abstract renderers and trigger expression, Canvas/Loader/menu; synthetic outer frame, world and entities; no player profile, Steam, gameplay or performance acceptance' }, null, 2))
		console.log('CLEAR_VIEW_OPTIONS_OK=' + results.length)
		console.log('Report: ' + output)
	} finally { await electron.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
