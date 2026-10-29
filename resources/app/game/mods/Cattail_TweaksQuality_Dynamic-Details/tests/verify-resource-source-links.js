'use strict'

// Execute the real core and resource-source entry with synthetic world/events,
// Game shell and Render API callbacks. Canvas2D/WebGL2 drawing, shaders and GPU
// caches are real. SwiftShader + preserved WebGL buffers permit pixel inspection;
// this is not a full game, Loader contract, hardware-performance or player test.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
	playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const MOD = path.resolve(__dirname, '..')
const corePath = process.argv[2] || path.join(MOD, 'scripts/core.js')
const source = fs.readFileSync(corePath, 'utf8')
const entry = fs.readFileSync(path.join(MOD, 'scripts/resource-source.js'), 'utf8')
const output = process.env.DYNAMIC_DETAILS_LINE_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-details-line-peek-'))
fs.mkdirSync(output, { recursive: true })

function fixture(options) {
	window.testOptions = options
	window.fixtureNow = 10000
	Object.defineProperty(performance, 'now', { value: () => fixtureNow })
	const originalContext = HTMLCanvasElement.prototype.getContext
	HTMLCanvasElement.prototype.getContext = function (type, settings) {
		return originalContext.call(this, type, type === 'webgl2' ? { ...settings, preserveDrawingBuffer: true } : settings)
	}
	const setItem = Storage.prototype.setItem
	window.storageWrites = []
	Storage.prototype.setItem = function (key, value) { storageWrites.push([key, String(value)]); return setItem.call(this, key, value) }
	window.hooks = []
	window.layers = new Map()
	window.apiEnabled = options.apiEnabled
	window.api = {
		config: {
			get(key, fallback) {
				if (key === 'enableResourceSourceDetails') return true
				if (key === 'resourceSourceLineRenderer') return options.gpu ? 1 : 0
				if (['enableBuildingDetails', 'enableCoordinateOverlay', 'enableDirectionPointers', 'enableResourceSourceLineChart'].includes(key)) return false
				return fallback
			},
			set() { throw Error('Unexpected renderer configuration write') }
		},
		on(name, fn) { if (name === 'afterVanillaScripts') hooks.push(fn) },
		patch(target, method, wrapper) { if (typeof target?.[method] === 'function') target[method] = wrapper(target[method]) },
		render: {
			isEnabled: () => apiEnabled,
			registerLayer() {}, demandLayer() {},
			onLayer(id, callback, settings) { layers.set(id, { callback, settings }) }
		}
	}
	window.ModLoader = { register(definition) { definition.init(api) } }
	// Keep the optional idle warm-up pending; frames exercise the actual render path.
	window.requestIdleCallback = () => 1
	window.Game = class Game {
		renderCursor() {}
		renderResources() { this.vanillaHover = this.hoveredResource; this.ctx.fillStyle = '#fff'; this.ctx.fillRect(740, 10, 20, 20); return 'vanilla' }
		renderDarkResources() {}
		switchPlane() { this.plane = !this.plane }
		watchCredits() { this.credits = true }
		addEntity() {}
		updateAnalytics() {}
		createResourceTransfer() {}
		createLightning() {}
		createChasmTransfer() {}
		requestResources() {}
		askForResources() {}
	}
	window.game = Object.assign(new Game(), {
		resources: [100, 200], hoveredResource: null, altActive: false, shiftPressed: false,
		entitiesInGame: {}, stuff: [], plane: false, splash: { isShown: false },
		canvas: document.querySelector('#main'), ctx: document.querySelector('#main').getContext('2d'),
		w: 800, h: 600, unit: 40, screenUnit: 40, pixelRatio: 1,
		resourceHomes: [[550, 100], [700, 100]],
		codex: { resources: [{ triplet: ['#0f0', '#0f0', '#0f0'] }, { triplet: ['#00f', '#00f', '#00f'] }] },
		uvToXYUntranslated: point => point,
		pronounce: (_group, id) => id,
		makeReadable: value => String(value)
	})
	window.layerCanvas = document.querySelector('#links')
	window.layerContext = layerCanvas.getContext('2d')
	window.points = [[100, 300], [200, 300], [100, 500], [200, 500]]
	window.lockKeys = ['cattailDynamicResourceSourceLineLock', 'cattailDynamicResourceSourceLineResource']
	window.alphaAt = (point, gpu = options.gpu && apiEnabled) => {
		if (gpu) {
			const renderer = game._cattailDynamicResourceSourceGpuRenderer
			if (!renderer) return 0
			const pixel = new Uint8Array(4)
			renderer.gl.finish()
			renderer.gl.readPixels(point[0], renderer.canvas.height - point[1] - 1, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixel)
			return pixel[3]
		}
		return (apiEnabled ? layerContext : game.ctx).getImageData(point[0], point[1], 1, 1).data[3]
	}
	window.frame = () => {
		game.ctx.clearRect(0, 0, 800, 600); layerContext.clearRect(0, 0, 800, 600)
		const layer = layers.get('resource-links')
		if (apiEnabled && layer.settings.enabled({ game })) layer.callback({ game, ctx: layerContext })
		const nativeResult = game.renderResources()
		const renderer = game._cattailDynamicResourceSourceGpuRenderer
		return {
			alphas: points.map(point => alphaAt(point)), nativeResult,
			lock: game._cattailDynamicResourceSourceLineLock,
			lockedResource: game._cattailDynamicResourceSourceLineResource,
			hover: game.hoveredResource, vanillaHover: game.vanillaHover,
			storedLock: lockKeys.map(key => localStorage.getItem(key)),
			lockWrites: storageWrites.filter(([key]) => lockKeys.includes(key)).length,
			signature: renderer?._cattailResourceSourceGpuSignature,
			bounds: renderer?._cattailResourceSourceGpuCompositeBounds,
			gpu: Boolean(renderer?.gl), content: Boolean(renderer?._cattailResourceSourceGpuHasContent),
			gpuDisplay: renderer?.canvas.style.display
		}
	}
	window.middle = resource => {
		game.hoveredResource = resource
		window.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }))
	}
	window.seed = () => {
		game.renderResources()
		const state = game._cattailDynamicResourceSourceState
		state.startedAt = fixtureNow - 5000
		state.events = points.map((position, i) => ({ time: fixtureNow, resourceId: Math.floor(i / 2), type: i % 2 ? 'consume' : 'gain', amount: 10, source: { kind: 'synthetic', position, groupKey: 'fixture-' + i, instanceKey: 'fixture-' + i } }))
		state.summaryCache = Object.create(null)
	}
}

function assertLines(state, resource) {
	assert.equal(state.nativeResult, 'vanilla')
	const expected = resource === null ? [false, false, false, false] : resource === 0 ? [true, true, false, false] : [false, false, true, true]
	assert.deepEqual(state.alphas.map(value => value > 0), expected, JSON.stringify(state))
}

async function main() {
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
	const contexts = [], results = [], errors = []
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	try {
		for (const apiEnabled of [false, true]) for (const gpu of [false, true]) {
			const prefix = (gpu ? 'WebGL2' : 'Canvas2D') + '/API-' + (apiEnabled ? 'on' : 'off') + ': '
			const context = await browser.newContext({ viewport: { width: 800, height: 600 } }); contexts.push(context)
			const page = await context.newPage()
			page.on('pageerror', error => errors.push(error.stack))
			await context.route('**/*', route => route.request().resourceType() === 'document'
				? route.fulfill({ contentType: 'text/html', body: '<style>body{margin:0}canvas{position:absolute;inset:0;pointer-events:none}</style><canvas id="main" width="800" height="600"></canvas><canvas id="links" width="800" height="600"></canvas>' })
				: route.abort())
			await page.goto('http://dynamic-details.invalid/')
			await page.evaluate(fixture, { apiEnabled, gpu })
			await page.addScriptTag({ content: source }); await page.addScriptTag({ content: entry })
			await page.evaluate(() => { for (const hook of hooks) hook(); seed() })
			await check(prefix + 'middle locks A and draws its gain/consume lines', async () => {
				const state = await page.evaluate(() => { middle(0); game.hoveredResource = null; return frame() })
				assertLines(state, 0); assert.equal(state.lock, true); assert.equal(state.lockedResource, 0)
				assert.deepEqual(state.storedLock, ['1', '0']); assert.equal(state.gpu, gpu)
			})
			let lockedState
			await check(prefix + 'Shift previews only hovered B without Alt, then restores A on release', async () => {
				lockedState = await page.evaluate(() => frame())
				const preview = await page.evaluate(() => { game.shiftPressed = true; game.hoveredResource = 1; return frame() })
				assertLines(preview, 1); assert.equal(preview.lockedResource, 0); assert.deepEqual(preview.storedLock, lockedState.storedLock); assert.equal(preview.lockWrites, lockedState.lockWrites)
				if (gpu) assert.notEqual(preview.signature, lockedState.signature)
				const restored = await page.evaluate(() => { game.shiftPressed = false; return frame() })
				assertLines(restored, 0); assert.equal(restored.lockedResource, 0)
				if (gpu) assert.equal(restored.signature, lockedState.signature)
			})
			await check(prefix + 'moving away while Shift is held restores A', async () => {
				const states = await page.evaluate(() => { game.shiftPressed = true; game.hoveredResource = 1; const preview = frame(); game.hoveredResource = null; return [preview, frame()] })
				assertLines(states[0], 1); assertLines(states[1], 0)
			})
			await check(prefix + 'pinned panel virtual B cannot replace real-hover selection', async () => {
				const state = await page.evaluate(() => {
					game.hoveredResource = 1
					window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', altKey: true, ctrlKey: true, bubbles: true }))
					game.hoveredResource = null; game.shiftPressed = true
					return frame()
				})
				assertLines(state, 0); assert.equal(state.hover, null); assert.equal(state.vanillaHover, 1)
				await page.evaluate(() => { game._cattailDynamicResourceSourceToggle = false; localStorage.setItem('cattailDynamicResourceSourceToggle', '0') })
			})
			await check(prefix + 'same resource previews once and reuses GPU cache', async () => {
				const states = await page.evaluate(() => { game.hoveredResource = 0; game.shiftPressed = true; const first = frame(); return [first, frame()] })
				assertLines(states[0], 0); assertLines(states[1], 0)
				assert.deepEqual(states[0].alphas, lockedState.alphas, 'same-resource preview must not draw the lines twice')
				if (gpu) assert.equal(states[0].signature, states[1].signature)
			})
			await check(prefix + 'empty preview clears previous content and restoring A invalidates its cache', async () => {
				const states = await page.evaluate(() => {
					const sourceState = game._cattailDynamicResourceSourceState
					window.savedEvents = sourceState.events
					// B has no sources; A's previous lines must disappear during preview.
					sourceState.events = sourceState.events.filter(event => event.resourceId === 0); sourceState.summaryCache = Object.create(null)
					game.hoveredResource = 1; const preview = frame(); game.shiftPressed = false; const restored = frame()
					sourceState.events = savedEvents; sourceState.summaryCache = Object.create(null)
					return [preview, restored]
				})
				assertLines(states[0], null); assertLines(states[1], 0)
				if (gpu) { assert.equal(states[0].content, false); assert.equal(states[1].content, true) }
			})
			await check(prefix + 'hovering B without Shift keeps A; middle transfers and releases the lock', async () => {
				const states = await page.evaluate(() => { game.hoveredResource = 1; game.shiftPressed = false; const before = frame(); middle(1); const changed = frame(); middle(1); return [before, changed, frame()] })
				assertLines(states[0], 0); assertLines(states[1], 1); assert.equal(states[1].lockedResource, 1); assertLines(states[2], null); assert.equal(states[2].lock, false)
			})
			await check(prefix + 'unlocked Shift retains Alt/pinned requirements and removes lines on release', async () => {
				let state = await page.evaluate(() => { game.hoveredResource = 1; game.shiftPressed = true; game.altActive = false; return frame() })
				assertLines(state, null)
				state = await page.evaluate(() => { game.altActive = true; return frame() }); assertLines(state, 1)
				state = await page.evaluate(() => { game.shiftPressed = false; return frame() }); assertLines(state, null)
				state = await page.evaluate(() => { game.shiftPressed = true; game.altActive = false; game._cattailDynamicResourceSourceToggle = true; return frame() }); assertLines(state, 1)
				await page.evaluate(() => { game._cattailDynamicResourceSourceToggle = false; game.shiftPressed = false; game.altActive = false; middle(0); game.hoveredResource = null })
			})
			await check(prefix + 'plane and ending states clear lines without altering the lock', async () => {
				for (const field of ['plane', 'credits', 'pinhole', 'splash']) {
					const states = await page.evaluate(field => {
						if (field === 'splash') game.splash.isShown = true; else game[field] = true
						const inactive = frame()
						if (field === 'splash') game.splash.isShown = false; else game[field] = false
						return [inactive, frame()]
					}, field)
					assertLines(states[0], null); assertLines(states[1], 0); assert.equal(states[1].lockedResource, 0)
				}
			})
			await check(prefix + 'repeated preview/release and API switching preserve lock and stock', async () => {
				const state = await page.evaluate(() => {
					const stock = JSON.stringify(game.resources), stored = lockKeys.map(key => localStorage.getItem(key))
					const sequence = []
					for (let i = 0; i < 8; i++) { game.shiftPressed = true; game.hoveredResource = 1; sequence.push(frame().alphas); game.shiftPressed = false; sequence.push(frame().alphas) }
					apiEnabled = !apiEnabled; sequence.push(frame().alphas); apiEnabled = !apiEnabled; sequence.push(frame().alphas)
					return { sequence, stockSame: stock === JSON.stringify(game.resources), lockSame: JSON.stringify(stored) === JSON.stringify(lockKeys.map(key => localStorage.getItem(key))) }
				})
				assert.equal(state.stockSame, true); assert.equal(state.lockSame, true)
				state.sequence.forEach((alphas, i) => assertLines({ alphas, nativeResult: 'vanilla' }, i < 16 && i % 2 === 0 ? 1 : 0))
			})
			await page.evaluate(() => { game.shiftPressed = true; game.hoveredResource = 1; frame() })
			await page.screenshot({ path: path.join(output, (gpu ? 'webgl' : 'canvas') + '-api-' + (apiEnabled ? 'on' : 'off') + '.png') })
			await context.close()
		}
		await check('no uncaught browser errors', async () => assert.deepEqual(errors, []))
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: results.length, results, browser: browser.version(), corePath, output }, null, 2))
		console.log(JSON.stringify({ passed: results.length, output }))
	} finally {
		for (const context of contexts) await context.close()
		await browser.close()
	}
}
main().catch(error => { console.error(error); process.exitCode = 1 })
