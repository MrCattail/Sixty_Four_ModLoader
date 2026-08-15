const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const scriptPath = path.resolve(__dirname, '..', 'scripts', 'waypoint-teleport-fade-skip.js')
const source = fs.readFileSync(scriptPath, 'utf8')

function createHarness(enabled) {
	const handlers = {}

	class FakeGame {
		constructor() {
			this.hollowEvents = []
		}

		createHollowEvent(color, time) {
			this.hollowEvents.push({ color, time })
		}
	}

	class FakeWaypoint {
		constructor(master) {
			this.master = master
		}

		onmousedown() {
			this.master.createHollowEvent('#000', 10000)
		}
	}

	class FakeWaypoint2 {
		constructor(master) {
			this.master = master
		}

		onmousedown() {
			this.master.createHollowEvent('#000', 1000)
		}
	}

	const api = {
		config: {
			get(key, fallback) {
				assert.strictEqual(key, 'enableWaypointTeleportFadeSkip')
				return enabled === undefined ? fallback : enabled
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
		Waypoint: FakeWaypoint,
		Waypoint2: FakeWaypoint2,
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

	return {
		Game: sandbox.Game,
		Waypoint: sandbox.Waypoint,
		Waypoint2: sandbox.Waypoint2
	}
}

{
	const { Game, Waypoint, Waypoint2 } = createHarness(true)
	const game = new Game()
	new Waypoint(game).onmousedown()
	new Waypoint2(game).onmousedown()
	assert.deepStrictEqual(game.hollowEvents, [], 'enabled skip should suppress LV1 and LV2 black teleport fades')
}

{
	const { Game, Waypoint } = createHarness(true)
	const game = new Game()
	game.createHollowEvent('#000', 10000)
	assert.deepStrictEqual(game.hollowEvents, [{ color: '#000', time: 10000 }], 'non-waypoint black events should remain visible')
	new Waypoint(game).onmousedown()
	assert.deepStrictEqual(game.hollowEvents, [{ color: '#000', time: 10000 }], 'waypoint black event should be the only suppressed event')
}

{
	const { Game, Waypoint } = createHarness(false)
	const game = new Game()
	new Waypoint(game).onmousedown()
	assert.deepStrictEqual(game.hollowEvents, [{ color: '#000', time: 10000 }], 'disabled config should preserve vanilla waypoint fade')
}

console.log('waypoint teleport fade skip verification passed')
