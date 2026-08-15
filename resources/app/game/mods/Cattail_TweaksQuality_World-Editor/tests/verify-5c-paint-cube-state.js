const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-state.js')
const source = fs.readFileSync(SOURCE_PATH, 'utf8')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')

function createEnvironment() {
	const definitions = []
	const events = new Map()
	const calls = { sparks: 0, transfers: 0, consumes: 0 }

	class Cube {
		onmousedown(power = 1) {
			if (this.state !== 2) return false
			for (const amount of this.composition || []) {
				if (amount) this.master.playSound('resource')
			}
			this.master.createResourceSpark(this.composition, [0, 0])
			this.broken += .4 * power
			if (this.broken < 1) return false
			this.broken = 1
			this.state = 3
			const consumer = this.consumers?.[0]
			if (consumer) consumer.consume([1], [0, 0])
			else this.master.createResourceTransfer([1], [0, 0])
			this.killme = true
			return true
		}
	}

	const sandbox = {
		Cube,
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: SOURCE_PATH })
	assert.equal(definitions.length, 1)
	definitions[0].init({
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		},
		patch(target, key, factory) { target[key] = factory(target[key]) }
	})
	for (const listener of events.get('afterVanillaScripts') || []) listener()

	const master = {
		playSound() {},
		createResourceSpark() { calls.sparks += 1 },
		createResourceTransfer() { calls.transfers += 1 }
	}
	const consumer = { consume() { calls.consumes += 1 } }
	function entityFrom(state) {
		return Object.assign(new Cube(), state, {
			name: 'cube',
			position: [4, 5],
			master,
			resourceCoordinates: [[1, 1]],
			composition: [1],
			consumers: [consumer]
		})
	}
	return { sandbox, service: sandbox[PAINT_KEY], events, calls, entityFrom }
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function tally(resources) {
	const counts = new Array(10).fill(0)
	for (const resource of resources) counts[resource] += 1
	return counts
}

function legacyPaint() {
	return {
		version: 1,
		kind: 'world-editor-painted-cube',
		reward: 'none',
		mode: 'stable',
		recipe: { version: 1, weights: [{ resource: 0, weight: 1 }], totalWeight: 1 },
		generated: { algorithm: 'fixed-slots-v1', slots: 64 }
	}
}

function testRecipeAllocationAndDeterminism() {
	const env = createEnvironment()
	const service = env.service
	assert.equal(service.version, '0.6.0')
	assert.equal(service.field, 'worldEditorPaint')
	assert.equal(service.paintVersion, 2)
	assert.equal(service.slots, 64)
	assert.equal(service.resourceCount, 10)
	assert.equal(service.maxWeight, 100)
	assert.deepEqual(plain(service.defaultRecipe()), {
		version: 1,
		weights: [{ resource: 0, weight: 100 }],
		totalWeight: 100
	})
	const recipe = service.normalizeRecipe({
		weights: [
			{ resource: 2, weight: 20 },
			{ resource: 0, weight: 50 },
			{ resource: 7, weight: 0 },
			{ resource: 1, weight: 30 }
		]
	})
	assert.deepEqual(plain(recipe), {
		version: 1,
		weights: [
			{ resource: 0, weight: 50 },
			{ resource: 1, weight: 30 },
			{ resource: 2, weight: 20 }
		],
		totalWeight: 100
	})
	assert.deepEqual(Array.from(service.allocateSlots(recipe)), [32, 19, 13, 0, 0, 0, 0, 0, 0, 0])
	assert.deepEqual(Array.from(service.allocateSlots({ weights: [
		{ resource: 0, weight: 1 }, { resource: 1, weight: 1 }, { resource: 2, weight: 1 }
	] })), [22, 21, 21, 0, 0, 0, 0, 0, 0, 0], 'largest-remainder ties use resource ID')
	const first = Array.from(service.buildResources(recipe, [12, -8]))
	const repeated = Array.from(service.buildResources(recipe, [12, -8]))
	const neighbor = Array.from(service.buildResources(recipe, [13, -8]))
	assert.deepEqual(first, repeated)
	assert.notDeepEqual(first, neighbor)
	assert.deepEqual(tally(first), [32, 19, 13, 0, 0, 0, 0, 0, 0, 0])
	assert.deepEqual(tally(neighbor), tally(first))
	assert.equal(service.normalizeRecipe({ weights: [] }), null)
	assert.equal(service.normalizeRecipe({ weights: [{ resource: 0, weight: 0 }] }), null)
	assert.equal(service.normalizeRecipe({ weights: [{ resource: 10, weight: 1 }] }), null)
	assert.equal(service.normalizeRecipe({ weights: [{ resource: 0, weight: 101 }] }), null)
	assert.equal(service.validateRecipe(Object.assign({}, plain(recipe), { totalWeight: 99 })), null)
}

function testStrictV2StateAndLegacyV1() {
	const env = createEnvironment()
	const recipe = env.service.normalizeRecipe({ weights: [
		{ resource: 0, weight: 40 }, { resource: 4, weight: 60 }
	] })
	const state = env.service.buildStableCubeState(.25, recipe, [4, -2])
	assert.equal(state.state, 2)
	assert.equal(state.fill, 64)
	assert.equal(state.broken, .25)
	assert.equal(state.resources.length, 64)
	assert.deepEqual(tally(state.resources), Array.from(env.service.allocateSlots(recipe)))
	assert.deepEqual(plain(state.worldEditorPaint), {
		version: 2,
		kind: 'world-editor-painted-cube',
		reward: 'none',
		mode: 'stable',
		recipe: plain(recipe),
		generated: { algorithm: 'largest-remainder-shuffle-v2', seed: '4:-2', slots: 64 }
	})
	assert.equal(env.service.isPainted(state), true)
	assert.equal(env.service.isPainted({ par: state }), true)
	assert.deepEqual(plain(env.service.normalizePaint(legacyPaint())), legacyPaint())
	assert.equal(env.service.normalizePaint(Object.assign({}, state.worldEditorPaint, { version: 3 })), null)
	assert.equal(env.service.normalizePaint(Object.assign({}, state.worldEditorPaint, { reward: 'resources' })), null)
	assert.equal(env.service.normalizePaint(Object.assign({}, state.worldEditorPaint, {
		generated: { algorithm: 'weighted-random', seed: '4:-2', slots: 64 }
	})), null)
	assert.equal(env.service.normalizePaint(Object.assign({}, state.worldEditorPaint, { extra: true })), null)
	assert.equal(env.service.buildStableCubeSave([1.5, 2], recipe), null)
	assert.deepEqual(Array.from(env.service.buildStableCubeSave([1, -2], recipe).position), [1, -2])
}

function testStrictV3GrowStateAndProgress() {
	const env = createEnvironment()
	const service = env.service
	const recipe = service.normalizeRecipe({ weights: [
		{ resource: 2, weight: 35 }, { resource: 8, weight: 65 }
	] })
	const state = service.buildGrowCubeState(.25, recipe, [6, -3], 4000, 'grow-state-lineage')
	assert.equal(service.growPaintVersion, 3)
	assert.equal(service.growthVersion, 1)
	assert.equal(service.defaultGrowDurationMs, 4000)
	assert.equal(service.minGrowDurationMs, 1000)
	assert.equal(service.maxGrowDurationMs, 20000)
	assert.equal(service.growDurationStepMs, 500)
	assert.equal(service.growRevealMs, 250)
	assert.equal(state.state, 0)
	assert.equal(state.fill, 0)
	assert.equal(state.unveilProgress, 0)
	assert.equal(state.broken, .25)
	assert.deepEqual(plain(state.worldEditorPaint), {
		version: 3,
		kind: 'world-editor-painted-cube',
		reward: 'none',
		mode: 'grow',
		recipe: plain(recipe),
		generated: { algorithm: 'largest-remainder-shuffle-v2', seed: '6:-3', slots: 64 },
		growth: {
			version: 1,
			lineage: 'grow-state-lineage',
			phase: 'growing',
			durationMs: 4000,
			elapsedMs: 0
		}
	})
	assert.equal(service.isGrowPaint(state), true)
	assert.equal(service.isPainted(state), true)
	assert.equal(service.normalizeGrowDurationMs(1000), 1000)
	assert.equal(service.normalizeGrowDurationMs(20000), 20000)
	assert.equal(service.normalizeGrowDurationMs(1250), null)
	assert.equal(service.normalizeGrowDurationMs(20500), null)
	assert.equal(service.normalizeGrowLineage('grow-state-lineage'), 'grow-state-lineage')
	assert.equal(service.normalizeGrowLineage('short'), null)

	const revealing = service.updateGrowProgress(state, 'revealing', 3750)
	const stable = service.updateGrowProgress(revealing, 'stable', 4000)
	assert.equal(revealing.growth.phase, 'revealing')
	assert.equal(stable.growth.phase, 'stable')
	assert.equal(service.sameGrowIdentity(state, stable), true)
	assert.equal(service.matchesGrowProgress(stable, state), true)
	assert.equal(service.matchesGrowProgress(state, stable), false)
	assert.equal(service.updateGrowProgress(state, 'revealing', 3749), null)
	assert.equal(service.updateGrowProgress(state, 'stable', 3999), null)
	const other = service.buildGrowCubeState(0, recipe, [6, -3], 4000, 'grow-other-lineage')
	assert.equal(service.sameGrowIdentity(state, other), false)
	assert.equal(service.normalizePaint(Object.assign({}, plain(state.worldEditorPaint), { extra: true })), null)
	assert.equal(service.normalizePaint(Object.assign({}, plain(state.worldEditorPaint), {
		growth: Object.assign({}, plain(state.worldEditorPaint.growth), { elapsedMs: -1 })
	})), null)
	assert.equal(service.normalizePaint(Object.assign({}, plain(state.worldEditorPaint), { version: 4 })), null)

	const growingSave = service.capturePaintedCubeSave(Object.assign({
		name: 'cube', position: [6, -3]
	}, state, {
		fill: 64 * 1500 / 3750,
		worldEditorPaint: service.updateGrowProgress(state, 'growing', 1500)
	}), [6, -3])
	assert.equal(growingSave.par.state, 0)
	assert.equal(growingSave.par.worldEditorPaint.growth.elapsedMs, 1500)
	assert.equal(growingSave.par.fill, 64 * 1500 / 3750)
	const stableSave = service.capturePaintedCubeSave(Object.assign({
		name: 'cube', position: [6, -3]
	}, state, {
		state: 2,
		fill: 64,
		unveilProgress: 1,
		worldEditorPaint: stable
	}), [6, -3])
	assert.equal(stableSave.par.worldEditorPaint.version, 3)
	assert.equal(stableSave.par.worldEditorPaint.growth.phase, 'stable')
}

function testEntitySavePreservesAuthoritativeSlots() {
	const env = createEnvironment()
	const recipe = env.service.normalizeRecipe({ weights: [
		{ resource: 1, weight: 55 }, { resource: 9, weight: 45 }
	] })
	const state = env.service.buildStableCubeState(.25, recipe, [4, 5])
	const authoritative = state.resources.slice().reverse()
	const entity = Object.assign({ name: 'cube', position: [4, 5] }, state, {
		broken: .25,
		resources: authoritative
	})
	const originalSave = { name: 'cube', position: [4, 5], par: { state: 2, broken: .25 } }
	const saveHook = env.events.get('entitySave')[0]
	const saved = saveHook(originalSave, { entity })
	assert.notEqual(saved, originalSave)
	assert.equal(saved.par.state, 2)
	assert.equal(saved.par.fill, 64)
	assert.equal(saved.par.broken, .25)
	assert.deepEqual(Array.from(saved.par.resources), Array.from(authoritative))
	assert.equal(saved.par.worldEditorPaint.version, 2)
	assert.equal(saved.par.worldEditorPaint.reward, 'none')
	assert.equal(saveHook(originalSave, { entity: { name: 'cube', state: 2 } }), originalSave)
	const otherSave = { name: 'pump', par: {} }
	assert.equal(saveHook(otherSave, { entity }), otherSave)
}

function testNoRewardManualAndAutomaticBreaks() {
	const env = createEnvironment()
	const partial = env.entityFrom(env.service.buildStableCubeState(0, env.service.defaultRecipe(), [4, 5]))
	const previous = {
		resources: partial.resources,
		coordinates: partial.resourceCoordinates,
		composition: partial.composition,
		consumers: partial.consumers,
		transfer: partial.master.createResourceTransfer,
		spark: partial.master.createResourceSpark
	}
	partial.onmousedown(.5)
	assert.equal(partial.state, 2)
	assert.equal(partial.resources, previous.resources)
	assert.equal(partial.resourceCoordinates, previous.coordinates)
	assert.equal(partial.composition, previous.composition)
	assert.equal(partial.consumers, previous.consumers)
	assert.equal(partial.master.createResourceTransfer, previous.transfer)
	assert.equal(partial.master.createResourceSpark, previous.spark)
	assert.deepEqual(env.calls, { sparks: 0, transfers: 0, consumes: 0 })

	const automatic = env.entityFrom(env.service.buildStableCubeState(0, env.service.defaultRecipe(), [4, 5]))
	automatic.onmousedown(3)
	assert.equal(automatic.state, 3)
	assert.equal(automatic.killme, true)
	assert.deepEqual(Array.from(automatic.resources), [])
	assert.deepEqual(Array.from(automatic.resourceCoordinates), [])
	assert.deepEqual(Array.from(automatic.composition), [])
	assert.deepEqual(Array.from(automatic.consumers), [])
	assert.deepEqual(env.calls, { sparks: 0, transfers: 0, consumes: 0 })

	const normal = env.entityFrom({ state: 2, fill: 64, broken: 0, resources: [0] })
	normal.onmousedown(3)
	assert.equal(normal.state, 3)
	assert.equal(env.calls.sparks, 1)
	assert.equal(env.calls.consumes, 1)
	assert.equal(env.calls.transfers, 0)
}

testRecipeAllocationAndDeterminism()
testStrictV2StateAndLegacyV1()
testStrictV3GrowStateAndProgress()
testEntitySavePreservesAuthoritativeSlots()
testNoRewardManualAndAutomaticBreaks()

console.log('World Editor 5C-6 paint-state verification passed: frozen strict v1/v2, strict v3 Grow identity/progress/save provenance, exact 64-slot largest-remainder allocation, deterministic cell shuffling, durable slots, and zero reward.')
