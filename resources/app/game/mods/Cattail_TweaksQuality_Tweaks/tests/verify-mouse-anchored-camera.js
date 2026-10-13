const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Use the installed 1.3 methods without constructing a Game or opening a profile.
const gameRoot = path.resolve(__dirname, '..', '..', '..')
const scripts = path.resolve(__dirname, '..', 'scripts')
const gameSource = fs.readFileSync(path.join(gameRoot, 'scripts/game.js'), 'utf8')
const stuffSource = fs.readFileSync(path.join(gameRoot, 'scripts/stuff.js'), 'utf8')
const waypointStart = stuffSource.indexOf('class Waypoint extends Entity')
const waypointEnd = stuffSource.indexOf('\nclass ', stuffSource.indexOf('class Waypoint2 extends Waypoint') + 1)
assert(waypointStart >= 0 && waypointEnd > waypointStart, 'native waypoint classes must be found')
const zoomKey = 'enableMouseAnchoredZoom'
const waypointKey = 'enableMouseAnchoredWaypointTeleport'
const results = []

function pointNear(actual, expected, message) {
	assert(actual.length === 2 && expected.length === 2, message)
	for (let i = 0; i < 2; i++) assert(Math.abs(actual[i] - expected[i]) < 1e-7, `${message}: expected ${expected}, got ${actual}`)
}
function classList() {
	const set = new Set()
	return { contains: name => set.has(name), add: name => set.add(name), remove: name => set.delete(name) }
}
function createHarness(camera = null, extraConfig = {}) {
	const handlers = {}
	const storage = new Map()
	const config = { [zoomKey]: true, [waypointKey]: true, enableDynamicCamera: !!camera, ...extraConfig }
	const api = {
		id: 'Cattail_TweaksQuality_Tweaks',
		config: { get: (key, fallback) => Object.hasOwn(config, key) ? config[key] : fallback, set: (key, value) => { config[key] = value } },
		on(name, handler) { (handlers[name] ||= []).push(handler) },
		patch(target, name, factory) {
			assert.equal(typeof target[name], 'function', `patch target ${name} exists in 1.3`)
			target[name] = factory(target[name])
		}
	}
	const context = vm.createContext({
		console, Entity: class {}, navigator: { getGamepads: () => [] }, performance: { now: () => 0 },
		localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
		addEventListener() {}, ModLoader: { register: definition => definition.init(api) }
	})
	vm.runInContext('globalThis.window = globalThis', context)
	vm.runInContext(gameSource + '\nglobalThis.GameType = Game', context)
	vm.runInContext(stuffSource.slice(waypointStart, waypointEnd) + '\nglobalThis.WaypointTypes = [Waypoint, Waypoint2]', context)
	context.GameType.prototype.createHollowEvent = function (...args) { this.hollowEvents.push(args) }
	// Match the manifest order; include the existing zoom-range and fade consumers.
	for (const file of ['view-distance.js', 'mouse-anchored-camera.js', 'waypoint-teleport-fade-skip.js', ...(camera ? ['dynamic-camera.js'] : [])]) {
		vm.runInContext(fs.readFileSync(path.join(scripts, file), 'utf8'), context, { filename: file })
	}
	for (const handler of handlers.afterVanillaScripts || []) handler()
	function makeGame(pixelRatio = 1, zoom = 1) {
		const game = Object.create(context.GameType.prototype)
		Object.assign(game, {
			pixelRatio, zoom, solidUnit: 100, unit: 100 * zoom, w: 1000 * pixelRatio, h: 800 * pixelRatio,
			w2: 500 * pixelRatio, h2: 400 * pixelRatio, translation: [17, -9], zoomRange: [.03, 4], time: { realDt: 100 },
			mouse: { sxy: [900, 650], xy: [900 * pixelRatio, 650 * pixelRatio], delta: [0, 0], lastOffset: [0, 0], state: 1 },
			screenUnit: 100, resourceHomes: [], stuffMap: {}, plane: 0, stats: { timesTeleported: 0 },
			waypointList: [], soundSources: new Set(), sounds: [], hollowEvents: [], resourceRequests: 0,
			store: { vessel: { classList: classList() } }, memoryComplexUI: { classList: classList(), style: {} },
			memorycomplex: true, memorycomplexCenter: [-1024, -1024], memorycomplexRadius: 256,
			playSound(...args) { this.sounds.push(args) },
			requestResources() { this.resourceRequests++; return this.canPay !== false }
		})
		if (camera) game.__cattailDynamicCameraState = { pitch: camera.pitch, yaw: camera.yaw * Math.PI / 180 }
		game.globalPositions = []
		game.pointerRefreshes = 0
		const nativeGlobal = game.updateGlobalPositioning
		const nativePointer = game.updatePointerState
		game.updateGlobalPositioning = function () {
			this.globalPositions.push([...this.translation])
			return nativeGlobal.call(this)
		}
		game.updatePointerState = function (...args) {
			this.pointerRefreshes++
			return nativePointer.apply(this, args)
		}
		return game
	}
	function addWaypoint(game, type = 0, position = [0, 0]) {
		const waypoint = Object.assign(Object.create(context.WaypointTypes[type].prototype), { master: game, position, name: type ? 'waypoint2' : 'waypoint' })
		game.waypointList.push(waypoint)
		game.stuffMap[`u${position[0]}v${position[1]}`] = waypoint
		return waypoint
	}
	return { makeGame, addWaypoint, config }
}
function assertFinalState(game) {
	pointNear(game.globalPositions.at(-1), game.translation, 'global state follows final translation')
	const center = game.xyToUVUntranslated([0, 0])
	const distance = Math.hypot(center[0] - game.memorycomplexCenter[0], center[1] - game.memorycomplexCenter[1])
	const visible = distance <= game.memorycomplexRadius
	assert.equal(game.memoryComplexIsVisible, visible, 'memory visibility follows final camera')
	assert.equal(game.store.vessel.classList.contains('memory_faded'), visible, 'shop visibility follows final camera')
	assert.equal(game.memoryComplexUI.classList.contains('active'), visible, 'memory UI activation follows final camera')
	if (visible) {
		const opacity = distance < game.memorycomplexRadius / 2 ? 1 - 2 * distance / game.memorycomplexRadius : 0
		assert(Math.abs(game.memoryComplexUI.style.opacity - opacity) < 1e-10, 'memory opacity follows final camera')
	}
	for (const sound of game.soundSources) {
		const xy = game.uvToXYUntranslated(sound.position)
		assert.equal(sound.pan.pan.value, game.getPanValueFromX(xy[0]), 'sound pan follows final camera')
		assert.equal(sound.volume.gain.value, game.getLoudnessFromXY(xy) * sound.baseVolume, 'sound gain follows final camera')
	}
}
function check(name, fn) { fn(); results.push(name) }

const cameras = [null, { pitch: .87, yaw: 45 }, { pitch: .25, yaw: -30 }]
for (const camera of cameras) for (const ratio of [1, 2]) for (const zoom of [.03, 1, 4]) for (const type of [0, 1]) for (const enabled of [false, true]) {
	check(`waypoint ${JSON.stringify({camera, ratio, zoom, type, enabled})}`, () => {
		const h = createHarness(camera, { [waypointKey]: enabled, enableWaypointTeleportFadeSkip: type === 0 })
		const g = h.makeGame(ratio, zoom)
		const points = [h.addWaypoint(g, type, [0, 0]), h.addWaypoint(g, type, [-1024, -1024]), h.addWaypoint(g, type, [30, 10])]
		g.soundSources.add({ position: points[1].position, pan: { pan: { value: 0 } }, volume: { gain: { value: 0 } }, baseVolume: .5, audibility: [1, 1] })
		for (let step = 0; step < 3; step++) {
			g.hoveredEntity = points[step]
			g.processDown()
			const next = points[(step + 1) % points.length]
			const expected = enabled ? [400 * ratio, 250 * ratio] : [0, 0]
			pointNear(g.uvToXY(next.position), expected, 'destination uses 1.3 pointer position')
			assert.equal(g.stats.timesTeleported, step + 1, 'teleport count once per click')
			assert.equal(g.sounds.length, step + 1, 'sound plays once per click')
			assert.equal(g.resourceRequests, step + 1, 'resource charge once per click')
			assert.equal(g.hollowEvents.length, type === 0 ? 0 : step + 1, 'fade switch preserved')
			assert.equal(g.mouse.offsetxy, undefined, 'no legacy input field injected')
			assert.equal(g.mouse.state, 1, 'pressed button preserved')
			assert.equal(g.mouse.positionChanged, false, 'refresh does not manufacture a drag')
			if (enabled) {
				assert.strictEqual(g.hoveredEntity, next, 'hover follows destination')
				pointNear(g.mouse.delta, [0, 0], 'refresh does not manufacture pointer movement')
			}
			assertFinalState(g)
		}
		assert.equal(g.pointerRefreshes, enabled ? 3 : 0, 'only active anchor refreshes the pointer')
	})
}
for (const camera of cameras) for (const ratio of [1, 2]) for (const enabled of [false, true]) for (const delta of [-1000, -10, 0, 10, 1000]) {
	check(`zoom ${JSON.stringify({camera, ratio, enabled, delta})}`, () => {
		const h = createHarness(camera, { [zoomKey]: enabled })
		const g = h.makeGame(ratio)
		const before = Array.from(g.xyToUV(g.mouse.sxy))
		const translation = [...g.translation]
		g.zoomInOut(delta)
		g.unit = g.solidUnit * g.zoom // native renderloop also maintains this
		assert(g.zoom >= g.zoomRange[0] && g.zoom <= g.zoomRange[1], 'view-distance bounds preserved')
		if (enabled) {
			pointNear(g.xyToUV(g.mouse.sxy), before, 'zoom preserves world point under pointer')
			assertFinalState(g)
			assert.equal(g.pointerRefreshes, 1)
		} else {
			pointNear(g.translation, translation, 'disabled zoom keeps native translation')
			assert.equal(g.globalPositions.length, 0)
			assert.equal(g.pointerRefreshes, 0)
		}
	})
}
check('hot toggles use the existing two independent configuration keys', () => {
	const h = createHarness(), g = h.makeGame()
	const first = h.addWaypoint(g), next = h.addWaypoint(g, 1, [30, 10])
	for (const enabled of [true, false, true]) {
		h.config[waypointKey] = enabled
		g.useWaypoint(first)
		pointNear(g.uvToXY(next.position), enabled ? [400, 250] : [0, 0], 'hot waypoint toggle')
	}
	h.config[zoomKey] = false
	const before = [...g.translation]
	g.zoomInOut(10)
	pointNear(g.translation, before, 'zoom remains independently disabled')
})
check('invalid or missing pointer falls back without changing native teleport', () => {
	for (const pointer of [undefined, [NaN, 1], [1, Infinity]]) {
		const h = createHarness(), g = h.makeGame()
		const first = h.addWaypoint(g), next = h.addWaypoint(g, 1, [30, 10])
		g.mouse.sxy = pointer
		g.useWaypoint(first)
		pointNear(g.uvToXY(next.position), [0, 0], 'invalid pointer keeps native center')
		assert.equal(g.globalPositions.length, 1)
		assert.equal(g.pointerRefreshes, 0)
	}
})
check('resource failure and unregistered waypoint do not move the camera', () => {
	const h = createHarness(), g = h.makeGame(), first = h.addWaypoint(g)
	h.addWaypoint(g, 1, [30, 10])
	const before = [...g.translation]
	g.canPay = false
	g.hoveredEntity = first
	g.processDown()
	g.useWaypoint({ position: [5, 5] })
	pointNear(g.translation, before, 'failed or unknown waypoint leaves camera untouched')
	assert.equal(g.stats.timesTeleported, 0)
	assert.equal(g.pointerRefreshes, 0)
	assert.equal(g.globalPositions.length, 0)
})
check('single waypoint still anchors to the pointer', () => {
	const h = createHarness(), g = h.makeGame(), first = h.addWaypoint(g)
	g.useWaypoint(first)
	pointNear(g.uvToXY(first.position), [400, 250], 'single waypoint destination')
	assertFinalState(g)
})
console.log(JSON.stringify({ status: 'passed', scenarios: results.length, nativeVersion: 'desktop 1.3', coverage: ['LV1/LV2 and repeated teleports', 'zoom and clamps', 'DPR 1/2', 'native and dynamic projection', 'native pointer and hover refresh', 'sound and memory/shop state', 'independent hot toggles', 'view-distance and fade coexistence', 'invalid pointer and failed activation'], limitations: 'VM method-level validation; synthetic world/UI/audio/ModLoader API. No full game, real saves or Steam.' }, null, 2))
