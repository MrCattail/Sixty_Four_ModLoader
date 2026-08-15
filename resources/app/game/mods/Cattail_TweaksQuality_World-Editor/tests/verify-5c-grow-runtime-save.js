const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-state.js')
const GROWTH_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-growth.js')
const stateSource = fs.readFileSync(STATE_PATH, 'utf8')
const growthSource = fs.readFileSync(GROWTH_PATH, 'utf8')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const GROWTH_KEY = Symbol.for('cattail.world-editor.paint-cube-growth')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function createEnvironment(options = {}) {
	const definitions = []
	const events = new Map()
	const frameQueue = []
	const statuses = []
	const metrics = { originalUpdates: 0, clears: 0, refreshes: 0, swaps: 0, normalizePaintCalls: 0 }

	class Cube {
		onmousedown() { return false }
		update(dt) {
			metrics.originalUpdates += 1
			if (this.state === 0 && !this.pump?.hold) {
				this.fill -= .01 * dt
				if (this.fill <= 0) {
					this.fill = 0
					this.master.clearCell(this.position)
				}
			} else if (this.state === 1) {
				this.unveilProgress += .004 * dt
				if (this.unveilProgress >= 1) {
					this.unveilProgress = 1
					this.state = 2
					this.master.processMousemove2()
					this.master.activeCubes.add(this)
					for (const offset of this.soi || []) {
						if (offset) metrics.swaps += 1
					}
				}
			}
		}
	}

	const sandbox = {
		Cube,
		console: { info() {}, warn() {}, error() {} },
		CustomEvent: class CustomEvent {
			constructor(type, options) { this.type = type; this.detail = options?.detail }
		},
		dispatchEvent(event) { statuses.push(event.detail); return true },
		requestAnimationFrame(callback) { frameQueue.push(callback); return frameQueue.length },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	vm.runInContext(stateSource, sandbox, { filename: STATE_PATH })
	vm.runInContext(growthSource, sandbox, { filename: GROWTH_PATH })
	assert.equal(definitions.length, 2)

	const api = {
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		},
		patch(target, key, factory) {
			const original = target[key]
			target[key] = factory(original)
			return function () { target[key] = original }
		}
	}
	for (const definition of definitions) definition.init(api)
	if (options.instrumentNormalize === true) {
		const strictPaintState = sandbox[PAINT_KEY]
		sandbox[PAINT_KEY] = Object.freeze(Object.assign({}, strictPaintState, {
			normalizePaint(value) {
				metrics.normalizePaintCalls += 1
				return strictPaintState.normalizePaint(value)
			}
		}))
	}
	for (const listener of events.get('afterVanillaScripts') || []) listener()

	const master = {
		stuff: [],
		stuffMap: Object.create(null),
		activeCubes: new Set(),
		clearCell() { metrics.clears += 1 },
		processMousemove2() { metrics.refreshes += 1 }
	}
	for (const listener of events.get('afterGameInit') || []) listener(null, master)

	function cubeFrom(state, position) {
		return Object.assign(new Cube(), plain(state), {
			name: 'cube',
			position: Array.from(position),
			master,
			pump: false,
			soi: [[1, 0]],
			unveilSpeed: .004
		})
	}

	function runFrames() {
		while (frameQueue.length) frameQueue.shift()()
	}

	return {
		sandbox,
		events,
		metrics,
		statuses,
		master,
		cubeFrom,
		runFrames,
		paintState: sandbox[PAINT_KEY],
		growth: sandbox[GROWTH_KEY]
	}
}

function testSynchronousNoPumpGrowthAndIsolation() {
	const env = createEnvironment()
	assert.equal(env.growth.ready, true)
	const recipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 0, weight: 25 },
		{ resource: 4, weight: 75 }
	] })
	const cubes = Array.from({ length: 512 }, (_, index) => {
		const cell = [index, 7]
		const cube = env.cubeFrom(
			env.paintState.buildGrowCubeState(0, recipe, cell, 4000, 'grow-runtime-512'),
			cell
		)
		env.master.stuff.push(cube)
		return cube
	})
	const resources = cubes.map(cube => cube.resources.slice())

	for (const dt of [1000, 1000, 1000, 800]) {
		for (const cube of cubes) cube.update(dt)
	}
	for (const cube of cubes) {
		assert.equal(cube.state, 1)
		assert.equal(cube.fill, 64)
		assert.equal(cube.unveilProgress, .2)
		assert.equal(cube.worldEditorPaint.growth.phase, 'revealing')
		assert.equal(cube.worldEditorPaint.growth.elapsedMs, 3800)
		assert.equal(cube.pump, false)
	}
	assert.equal(env.metrics.originalUpdates, 512, 'only the 50ms overflow into the original reveal is delegated')
	assert.equal(env.metrics.clears, 0)

	for (const cube of cubes) cube.update(200)
	assert.equal(env.metrics.originalUpdates, 1024, 'the total frozen duration includes the original reveal')
	assert.equal(env.metrics.swaps, 0, 'injector resource swapping is isolated during the reveal')
	assert.equal(env.metrics.refreshes, 0, 'per-cube refreshes are suppressed until the batch frame')
	assert.equal(env.master.activeCubes.size, 512)
	for (let index = 0; index < cubes.length; index += 1) {
		const cube = cubes[index]
		assert.equal(cube.state, 2)
		assert.equal(cube.unveilProgress, 1)
		assert.equal(cube.worldEditorPaint.growth.phase, 'stable')
		assert.equal(cube.worldEditorPaint.growth.elapsedMs, 4000)
		assert.deepEqual(Array.from(cube.resources), resources[index])
	}
	assert.equal(env.metrics.refreshes, 0)
	env.runFrames()
	assert.equal(env.metrics.refreshes, 1, '512 completions request one world refresh')
	assert.equal(growthSource.includes('setTimeout('), false, 'Grow does not allocate per-cube timers')
	const updateSegment = growthSource.slice(growthSource.indexOf('function updateGrowingCube'), growthSource.indexOf('function updateRevealingCube'))
	assert.equal(updateSegment.includes('.stuff'), false, 'state 0 updates do not scan the world')
}

function testExactSaveResumeAndOfflinePause() {
	const env = createEnvironment()
	const recipe = env.paintState.defaultRecipe()
	const first = env.cubeFrom(
		env.paintState.buildGrowCubeState(.25, recipe, [2, 3], 4000, 'grow-save-resume'),
		[2, 3]
	)
	env.master.stuff.push(first)
	first.update(1000)
	first.update(500)
	assert.equal(first.worldEditorPaint.growth.elapsedMs, 1500)
	assert.equal(first.fill, 25.6)

	const beforeSave = env.events.get('beforeSaveWrite')[0]
	const saved = beforeSave({ stuff: [] }, env.master)
	assert.equal(saved.stuff.length, 1)
	assert.equal(saved.stuff[0].par.state, 0)
	assert.equal(saved.stuff[0].par.fill, 25.6)
	assert.equal(saved.stuff[0].par.worldEditorPaint.growth.elapsedMs, 1500)
	assert.equal(saved.stuff[0].par.worldEditorPaint.growth.durationMs, 4000)
	assert.equal(saved.stuff[0].par.worldEditorPaint.growth.lineage, 'grow-save-resume')

	const duplicate = beforeSave({ stuff: [plain(saved.stuff[0])] }, env.master)
	assert.equal(duplicate.stuff.length, 1, 'beforeSaveWrite deduplicates by occupied cell')
	env.master.preventNoise = true
	first.update(1000)
	delete env.master.preventNoise
	const offlineSecondSave = beforeSave({ stuff: [] }, env.master)
	assert.deepEqual(
		plain(offlineSecondSave.stuff[0].par.worldEditorPaint.growth),
		plain(saved.stuff[0].par.worldEditorPaint.growth),
		'offline wall time cannot advance progress without Cube.update'
	)

	const resumed = env.cubeFrom(saved.stuff[0].par, saved.stuff[0].position)
	resumed.update(500)
	assert.equal(resumed.worldEditorPaint.growth.elapsedMs, 2000)
	assert.equal(resumed.fill, 64 * 2000 / 3750)
	for (const dt of [1000, 750]) resumed.update(dt)
	assert.equal(resumed.state, 1)
	resumed.update(250)
	assert.equal(resumed.state, 2)
	assert.equal(resumed.worldEditorPaint.growth.phase, 'stable')

	const stableSave = env.events.get('entitySave')[0](
		{ name: 'cube', position: [2, 3], par: {} },
		{ entity: resumed }
	)
	assert.equal(stableSave.par.worldEditorPaint.version, 3)
	assert.equal(stableSave.par.worldEditorPaint.growth.phase, 'stable')
	assert.equal(stableSave.par.worldEditorPaint.growth.elapsedMs, 4000)
}

function testConfiguredDurationBoundaries() {
	for (const durationMs of [1000, 4000, 20000]) {
		const env = createEnvironment()
		const cube = env.cubeFrom(
			env.paintState.buildGrowCubeState(
				0,
				env.paintState.defaultRecipe(),
				[durationMs / 500, 12],
				durationMs,
				'grow-duration-' + durationMs
			),
			[durationMs / 500, 12]
		)
		let remaining = durationMs - 1
		while (remaining > 0) {
			const dt = Math.min(777, remaining)
			cube.update(dt)
			remaining -= dt
		}
		assert.equal(cube.state, 1, durationMs + 'ms remains revealing at T-1ms')
		assert.equal(cube.worldEditorPaint.growth.elapsedMs, durationMs - 1)
		cube.update(1)
		assert.equal(cube.state, 2, durationMs + 'ms becomes stable exactly at T')
		assert.equal(cube.worldEditorPaint.growth.elapsedMs, durationMs)
	}
}

function testUnmarkedCubesStayOnVanillaPath() {
	const env = createEnvironment()
	const ordinary = env.cubeFrom({
		state: 2,
		fill: 64,
		resources: new Array(64).fill(0)
	}, [8, 8])
	assert.doesNotThrow(function () { ordinary.update(16) })
	assert.equal(env.metrics.originalUpdates, 1, 'ordinary cubes keep using the vanilla updater after reload')
	assert.equal(ordinary.worldEditorPaint, undefined, 'ordinary cubes are never promoted into painted cubes')
}

function testStableMarkersValidateOnceAndStayProtected() {
	const env = createEnvironment({ instrumentNormalize: true })
	const cell = [18, -7]
	const stable = env.cubeFrom(
		env.paintState.buildStableCubeState(0, env.paintState.defaultRecipe(), cell),
		cell
	)
	const sourceMarker = stable.worldEditorPaint
	for (let index = 0; index < 25; index += 1) stable.update(5)
	assert.equal(env.metrics.originalUpdates, 25, 'Stable painted Cubes keep using the vanilla updater')
	assert.equal(env.metrics.normalizePaintCalls, 1, 'Stable v2 markers are strictly normalized only on the cache miss')
	assert.notEqual(stable.worldEditorPaint, sourceMarker, 'the first validation installs a protected canonical marker')
	assert.equal(Object.isFrozen(stable.worldEditorPaint), true)
	assert.equal(Object.isFrozen(stable.worldEditorPaint.recipe), true)
	assert.equal(Object.isFrozen(stable.worldEditorPaint.recipe.weights), true)
	assert.equal(Object.isFrozen(stable.worldEditorPaint.recipe.weights[0]), true)
	assert.equal(Object.isFrozen(stable.worldEditorPaint.generated), true)
	assert.equal(Object.isFrozen(stable.resources), false, 'the original Cube payload remains mutable for vanilla interactions')
	assert.equal(Reflect.set(stable.worldEditorPaint, 'reward', 'resources'), false, 'validated markers reject in-place mutation')
	stable.resources[0] = 4
	stable.broken = .25
	stable.update(5)
	assert.equal(env.metrics.normalizePaintCalls, 1, 'a protected marker remains on the O(1) cache path')
	assert.equal(stable.resources[0], 4)
	assert.equal(stable.broken, .25)
	const stableSave = env.events.get('entitySave')[0](
		{ name: 'cube', position: cell, par: {} },
		{ entity: stable }
	)
	assert.equal(stableSave.par.worldEditorPaint.version, 2, 'protected Stable markers remain serializable')
	assert.equal(stableSave.par.resources[0], 4)
	assert.equal(stableSave.par.broken, .25)

	const validReplacement = plain(stable.worldEditorPaint)
	stable.worldEditorPaint = validReplacement
	stable.update(5)
	assert.equal(env.metrics.normalizePaintCalls, 2, 'replacing the marker reference forces strict revalidation')
	assert.notEqual(stable.worldEditorPaint, validReplacement)
	assert.equal(Object.isFrozen(stable.worldEditorPaint), true)

	const malformed = Object.assign({}, plain(stable.worldEditorPaint), { extra: true })
	stable.worldEditorPaint = malformed
	stable.update(5)
	assert.equal(env.metrics.normalizePaintCalls, 3, 'a replaced malformed marker is checked and rejected')
	assert.equal(stable.worldEditorPaint, malformed, 'malformed markers are not promoted into the cache')
	stable.update(5)
	assert.equal(env.metrics.normalizePaintCalls, 4, 'uncached malformed markers continue to fail closed')

	const legacy = env.cubeFrom({
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0),
		worldEditorPaint: {
			version: 1,
			kind: 'world-editor-painted-cube',
			reward: 'none',
			mode: 'stable',
			recipe: { version: 1, weights: [{ resource: 0, weight: 1 }], totalWeight: 1 },
			generated: { algorithm: 'fixed-slots-v1', slots: 64 }
		}
	}, [19, -7])
	for (let index = 0; index < 10; index += 1) legacy.update(5)
	assert.equal(env.metrics.normalizePaintCalls, 5, 'legacy v1 Stable markers share the one-time strict cache path')
	assert.equal(Object.isFrozen(legacy.worldEditorPaint), true)
}

function testMalformedAndFutureMarkersFailClosed() {
	const env = createEnvironment()
	const recipe = env.paintState.defaultRecipe()
	const valid = env.cubeFrom(
		env.paintState.buildGrowCubeState(0, recipe, [9, 9], 4000, 'grow-strict-check'),
		[9, 9]
	)
	valid.update(500)
	assert.equal(valid.worldEditorPaint.growth.elapsedMs, 500)
	valid.worldEditorPaint.growth.elapsedMs = -1
	valid.fill = 4
	valid.update(500)
	assert.equal(env.metrics.originalUpdates, 1)
	assert.equal(env.metrics.clears, 1, 'mutated malformed markers return to vanilla behavior')

	const future = env.cubeFrom({
		state: 0,
		fill: 4,
		resources: new Array(64).fill(0),
		worldEditorPaint: Object.assign({}, plain(valid.worldEditorPaint), { version: 4 })
	}, [10, 9])
	future.update(500)
	assert.equal(env.metrics.originalUpdates, 2)
	assert.equal(env.metrics.clears, 2)
	assert.equal(env.paintState.normalizePaint(future), null)
	const saved = env.events.get('beforeSaveWrite')[0]({ stuff: [] }, { stuff: [valid, future] })
	assert.equal(saved.stuff.length, 0, 'malformed and future markers are never injected into saves')
}

function testGrowSaveCaptureFailureAbortsOnlyCurrentSave() {
	for (const failureMode of ['throw', 'null']) {
		const env = createEnvironment()
		const cube = env.cubeFrom(
			env.paintState.buildGrowCubeState(0, env.paintState.defaultRecipe(), [12, 13], 4000, 'grow-save-failure'),
			[12, 13]
		)
		env.master.stuff.push(cube)
		const failingState = Object.assign({}, env.paintState, {
			capturePaintedCubeSave() {
				if (failureMode === 'throw') throw new Error('fault injection')
				return null
			}
		})
		env.sandbox[PAINT_KEY] = failingState
		const beforeSave = env.events.get('beforeSaveWrite')[0]
		const aborted = beforeSave({ stuff: [] }, env.master)
		assert.throws(function () { JSON.stringify(aborted) }, function (error) {
			return error?.code === 'PAINT_GROW_SAVE_FAILED' && error?.cell === '12:13'
		}, failureMode)
		assert.equal(env.statuses.at(-1)?.key, 'paintGrowSaveFailed')
		assert.equal(env.statuses.at(-1)?.persistent, true)
		assert.equal(env.statuses.at(-1)?.values?.code, 'PAINT_GROW_SAVE_FAILED')
		assert.equal(env.growth.ready, true, 'Grow save failure does not latch a runtime lock')

		env.sandbox[PAINT_KEY] = env.paintState
		const retried = beforeSave({ stuff: [] }, env.master)
		assert.doesNotThrow(function () { JSON.stringify(retried) })
		assert.equal(retried.stuff.length, 1, 'a later save can retry after the capture service recovers')
	}
}

testSynchronousNoPumpGrowthAndIsolation()
testExactSaveResumeAndOfflinePause()
testConfiguredDurationBoundaries()
testUnmarkedCubesStayOnVanillaPath()
testStableMarkersValidateOnceAndStayProtected()
testMalformedAndFutureMarkersFailClosed()
testGrowSaveCaptureFailureAbortsOnlyCurrentSave()

console.log('World Editor 5C-6 Grow runtime/save verification passed: strict v3 no-pump growth, exact 1/4/20-second completion, one batched reveal refresh for 512 cubes, injector isolation, exact save/resume, offline pause, dedupe, one-time protected Stable v1/v2 marker validation, ordinary-cube vanilla delegation, and malformed/future fail-closed behavior.')
