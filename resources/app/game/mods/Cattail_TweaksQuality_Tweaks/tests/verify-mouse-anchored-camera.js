const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const scriptPath = path.resolve(__dirname, '..', 'scripts', 'mouse-anchored-camera.js')
const source = fs.readFileSync(scriptPath, 'utf8')

const zoomKey = 'enableMouseAnchoredZoom'
const waypointKey = 'enableMouseAnchoredWaypointTeleport'
const epsilon = 1e-9

function createHarness(config) {
	const handlers = {}

	class FakeGame {
		constructor() {
			this.solidUnit = 100
			this.unit = 100
			this.pixelRatio = 1
			this.w = 1000
			this.h = 800
			this.w2 = 500
			this.h2 = 400
			this.zoom = 1
			this.zoomRange = [.3, 4]
			this.translation = [0, 0]
			this.time = { realDt: 100 }
			this.mouse = {
				offsetxy: [700, 500],
				xy: [700, 500],
				delta: [0, 0],
				lastOffset: [700, 500]
			}
			this.hoveredCell = null
			this.updateMouseCalls = 0
			this.waypointList = []
		}

		zoomInOut(delta) {
			this.zoom = Math.min(this.zoomRange[1], Math.max(this.zoomRange[0], this.zoom + delta * this.time.realDt * .0002))
		}

		useWaypoint(waypoint) {
			for (let index = 0; index < this.waypointList.length; index++) {
				if (waypoint === this.waypointList[index]) {
					const next = this.waypointList[(index + 1) % this.waypointList.length]
					const delta = this.uvToXY(next.position)
					this.translation[0] += delta[0] / this.zoom
					this.translation[1] += delta[1] / this.zoom
				}
			}
		}

		uvToXY(uv) {
			return [
				(uv[0] * 0.866 - uv[1] * .866) * this.unit - this.translation[0] * this.zoom,
				(uv[0] * .5 + uv[1] * .5) * this.unit - this.translation[1] * this.zoom
			]
		}

		xyToUV(xy) {
			const centered = [
				xy[0] * this.pixelRatio - this.w2 + this.translation[0] * this.zoom,
				xy[1] * this.pixelRatio - this.h2 + this.translation[1] * this.zoom
			]
			const fx = centered[0] / .866 * .5
			return [
				(centered[1] + fx) / this.unit + .5,
				(centered[1] - fx) / this.unit + .5
			]
		}

		updateMouseData(x = this.mouse.offsetxy[0], y = this.mouse.offsetxy[1]) {
			this.updateMouseCalls++
			this.mouse.offsetxy = [x, y]
			this.mouse.xy = [x * this.pixelRatio, y * this.pixelRatio]
			const uv = this.xyToUV([x, y])
			this.hoveredCell = [Math.floor(uv[0]), Math.floor(uv[1])]
		}
	}

	const api = {
		config: {
			get(key, fallback) {
				return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : fallback
			}
		},
		on(name, handler) {
			if (!handlers[name]) handlers[name] = []
			handlers[name].push(handler)
		},
		patch(target, name, factory) {
			target[name] = factory(target[name])
		}
	}

	const sandbox = {
		console,
		Game: FakeGame,
		ModLoader: {
			register(definition) {
				definition.init(api)
			}
		}
	}
	sandbox.window = sandbox

	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: scriptPath })
	for (const handler of handlers.afterVanillaScripts || []) handler()
	return { Game: sandbox.Game }
}

function assertNear(left, right, message) {
	assert(Math.abs(left - right) <= epsilon, message + ': expected ' + right + ', got ' + left)
}

function assertPointNear(left, right, message) {
	assertNear(left[0], right[0], message + ' x')
	assertNear(left[1], right[1], message + ' y')
}

{
	const { Game } = createHarness({ [zoomKey]: true, [waypointKey]: false })
	const game = new Game()
	const beforeUv = game.xyToUV(game.mouse.offsetxy)
	game.zoomInOut(10)
	game.unit = game.solidUnit * game.zoom
	const afterUv = game.xyToUV(game.mouse.offsetxy)
	assertPointNear(afterUv, beforeUv, 'enabled mouse-position zoom preserves mouse world point')
	assert.notDeepStrictEqual(game.translation, [0, 0], 'enabled mouse-position zoom should adjust translation')
	assert.strictEqual(game.updateMouseCalls, 1, 'enabled mouse-position zoom refreshes mouse data')
}

{
	const { Game } = createHarness({ [zoomKey]: false, [waypointKey]: false })
	const game = new Game()
	const beforeUv = game.xyToUV(game.mouse.offsetxy)
	game.zoomInOut(10)
	game.unit = game.solidUnit * game.zoom
	const afterUv = game.xyToUV(game.mouse.offsetxy)
	assert.notDeepStrictEqual(afterUv, beforeUv, 'disabled mouse-position zoom preserves vanilla center zoom')
	assert.deepStrictEqual(game.translation, [0, 0], 'disabled mouse-position zoom should not adjust translation')
}

{
	const { Game } = createHarness({ [zoomKey]: false, [waypointKey]: true })
	const game = new Game()
	const current = { position: [0, 0] }
	const next = { position: [3, 1] }
	game.waypointList = [current, next]
	game.useWaypoint(current)
	const target = [
		game.mouse.offsetxy[0] * game.pixelRatio - game.w2,
		game.mouse.offsetxy[1] * game.pixelRatio - game.h2
	]
	assertPointNear(game.uvToXY(next.position), target, 'enabled waypoint teleport places destination under mouse')
	assert.strictEqual(game.updateMouseCalls, 1, 'enabled waypoint teleport refreshes mouse data')
}

{
	const { Game } = createHarness({ [zoomKey]: false, [waypointKey]: false })
	const game = new Game()
	const current = { position: [0, 0] }
	const next = { position: [3, 1] }
	game.waypointList = [current, next]
	game.useWaypoint(current)
	assertPointNear(game.uvToXY(next.position), [0, 0], 'disabled waypoint teleport keeps vanilla center destination')
}

console.log('mouse anchored camera verification passed')
