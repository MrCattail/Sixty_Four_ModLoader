const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
const { loadRuntime } = require('./verify-4b-1a')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function fullBlueprint() {
	return {
		schemaVersion: 6,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [{ id: 1, min: [0, 0], max: [3, 0] }],
		contentBounds: { min: [0, 0], max: [3, 0], width: 4, height: 1 },
		includeBlocks: true,
		entities: [{
			id: 1,
			kind: 'entity',
			name: 'silo',
			position: [0, 0],
			footprint: { span: 0, min: [0, 0], max: [0, 0] },
			config: {},
			restricted: {},
			state: { fill: 7 }
		}],
		blocks: [{
			kind: 'cube',
			name: 'cube',
			position: [1, 0],
			state: { state: 2, fill: 64, resources: [1, 2], broken: 0.2 }
		}],
		surges: [{
			kind: 'surge',
			name: 'surge',
			position: [2, 0],
			state: {
				resources: [3, 4],
				rayNumber: 4,
				grade: 2,
				colors: ['#abc'],
				type: 1,
				maxLife: 99,
				life: 88,
				stabilizerPosition: [999, 999]
			}
		}],
		emptyCells: [[3, 0], [1, 0], [2, 0]],
		production: null,
		summary: { entityCount: 1, blockCount: 1, surgeCount: 1, skippedTypes: [] }
	}
}

async function testSchemaProjectionAndPlacementModes() {
	const normal = loadRuntime({ creative: false })
	const state = normal.sandbox[STATE_KEY]
	assert.equal(state.version, '0.5.1')
	const normalized = state.normalizeBlueprint(fullBlueprint())
	assert.equal(normalized.schemaVersion, 6)
	assert.equal(normalized.surges.length, 1)
	assert.equal(Object.hasOwn(normalized.surges[0].state, 'stabilizerPosition'), false)
	assert.deepEqual(clone(normalized.surges[0].state.resources), [3, 4])
	const legacy = state.normalizeBlueprint(Object.assign(fullBlueprint(), { schemaVersion: 5 }))
	assert.deepEqual(clone(legacy.surges), [])

	const structure = state.projectStructure(normalized)
	assert.equal(structure.schemaVersion, 4)
	assert.equal(structure.mode, 'structure')
	assert.equal(structure.entities.length, 1)
	assert.equal(Object.hasOwn(structure.entities[0], 'state'), false)
	assert.deepEqual(clone(structure.blocks), [])
	assert.deepEqual(clone(structure.surges), [])
	assert.deepEqual(clone(structure.neutralCells), [[1, 0], [2, 0]])
	assert.deepEqual(clone(structure.emptyCells), [[3, 0]])

	const normalPlaced = await normal.placement.place({
		blueprint: normalized,
		target: [10, 10],
		includeBlocks: true,
		includeSurges: true,
		input: 'test-normal'
	})
	assert.equal(normalPlaced.executed, true, JSON.stringify(normalPlaced))
	assert.equal(normal.game.entityAtCoordinates([10, 10]).name, 'silo')
	assert.equal(normal.game.entityAtCoordinates([11, 10]), null)
	assert.equal(normal.game.entityAtCoordinates([12, 10]), null)
	assert.equal(normal.game.entityAtCoordinates([13, 10]), null)
	assert.equal(normalPlaced.transaction.summary.buildCount, 1)
	assert.equal(normalPlaced.transaction.summary.surgeBuildCount, 0)
	normal.dispose()

	const creative = loadRuntime({ creative: true })
	const omitted = await creative.placement.place({
		blueprint: normalized,
		target: [20, 20],
		includeBlocks: false,
		includeSurges: false,
		input: 'test-creative-default-off'
	})
	assert.equal(omitted.executed, true, JSON.stringify(omitted))
	assert.equal(creative.game.entityAtCoordinates([20, 20]).name, 'silo')
	assert.equal(creative.game.entityAtCoordinates([21, 20]), null)
	assert.equal(creative.game.entityAtCoordinates([22, 20]), null)

	const included = await creative.placement.place({
		blueprint: normalized,
		target: [30, 30],
		includeBlocks: true,
		includeSurges: true,
		input: 'test-creative-layers-on'
	})
	assert.equal(included.executed, true, JSON.stringify(included))
	assert.equal(creative.game.entityAtCoordinates([30, 30]).name, 'silo')
	const cube = creative.game.entityAtCoordinates([31, 30])
	const surge = creative.game.entityAtCoordinates([32, 30])
	assert.equal(cube.name, 'cube')
	assert.equal(cube.state, 2)
	assert.deepEqual(clone(cube.resources), [1, 2])
	assert.equal(surge.name, 'surge')
	assert.equal(surge.life, 88)
	assert.equal(surge.rayNumber, 4)
	assert.equal(included.transaction.summary.buildCount, 3)
	assert.equal(included.transaction.summary.surgeBuildCount, 1)

	const undo = await creative.placement.undo('test')
	assert.equal(undo.executed, true)
	assert.equal(creative.game.entityAtCoordinates([30, 30]), null)
	assert.equal(creative.game.entityAtCoordinates([31, 30]), null)
	assert.equal(creative.game.entityAtCoordinates([32, 30]), null)
	const redo = await creative.placement.redo('test')
	assert.equal(redo.executed, true)
	assert.equal(creative.game.entityAtCoordinates([31, 30]).name, 'cube')
	assert.equal(creative.game.entityAtCoordinates([32, 30]).name, 'surge')
	creative.dispose()
}

function loadDeletionHarness() {
	const filename = path.join(MOD_ROOT, 'tests/verify-4c-1a.js')
	const instrumented = fs.readFileSync(filename, 'utf8').replace(
		/\nrun\(\)\.catch[\s\S]*$/,
		'\nmodule.exports = { createEnvironment, range, clone }\n'
	)
	const harnessModule = { exports: {} }
	const factory = new Function('require', 'module', 'exports', '__dirname', '__filename', instrumented)
	factory(require, harnessModule, harnessModule.exports, path.dirname(filename), filename)
	return harnessModule.exports
}

async function testCreativeCutLayerTransaction() {
	const harness = loadDeletionHarness()
	const env = harness.createEnvironment({
		creative: true,
		selections: [{ id: 1, range: harness.range(0, 2, 0, 0) }]
	})
	env.game.codex.entities.surge = { canPurchase: false, price: [0], priceExponent: 1, entitySpan: 0 }
	env.game.getEntityString = transientSave
	const cube = env.game.spawn('cube', [0, 0], {
		state: 2,
		fill: 64,
		resources: [5, 6],
		broken: 0.25
	})
	const surge = env.game.spawn('surge', [1, 0], {
		lifeTimer: 88,
		harvestProgression: 0,
		resources: [7, 8],
		rayNumber: 4,
		grade: 2,
		colors: ['#def'],
		type: 1,
		maxLife: 99,
		life: 88
	})
	const retained = await env.deletion.planSelections()
	assert.equal(retained.summary.safeCount, 0)
	assert.equal(retained.summary.protectedCount, 2)
	assert.deepEqual(harness.clone(retained.protectedTargets.map(entry => entry.reason)), ['cube', 'surge'])

	const plan = await env.deletion.planSelections({ removeCubes: true, removeSurges: true })
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.summary.buildingCount, 0)
	assert.equal(plan.summary.cubeCount, 1)
	assert.equal(plan.summary.surgeCount, 1)
	assert.deepEqual(harness.clone(plan.economy.delta), [])
	assert.deepEqual(harness.clone(plan.removals.map(entry => entry.layer)), ['cube', 'surge'])

	const resourcesBefore = env.game.resources.slice()
	const statsBefore = clone(env.game.stats)
	const result = await env.deletion.execute(plan, 'cut', { origin: 'cut' })
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.deepEqual(env.game.resources, resourcesBefore)
	assert.deepEqual(clone(env.game.stats), statsBefore)

	const undo = await env.transactions.undo('test')
	assert.equal(undo.executed, true)
	const restoredCube = env.game.entityAtCoordinates([0, 0])
	const restoredSurge = env.game.entityAtCoordinates([1, 0])
	assert.notStrictEqual(restoredCube, cube)
	assert.notStrictEqual(restoredSurge, surge)
	assert.equal(restoredCube.name, 'cube')
	assert.equal(restoredCube.state, 2)
	assert.deepEqual(clone(restoredCube.resources), [5, 6])
	assert.equal(restoredSurge.name, 'surge')
	assert.equal(restoredSurge.life, 88)
	assert.equal(restoredSurge.rayNumber, 4)
	assert.deepEqual(env.game.resources, resourcesBefore)
	assert.deepEqual(clone(env.game.stats), statsBefore)

	const redo = await env.transactions.redo('test')
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	env.dispose()

	const unsafe = harness.createEnvironment({
		creative: true,
		selections: [{ id: 1, range: harness.range(5, 5, 5, 5) }]
	})
	unsafe.game.codex.entities.surge = { canPurchase: false, price: [0], priceExponent: 1, entitySpan: 0 }
	unsafe.game.getEntityString = transientSave
	unsafe.game.spawn('surge', [5, 5], {
		lifeTimer: 0,
		harvestProgression: 0,
		resources: [1],
		rayNumber: 1,
		grade: 1,
		colors: ['#fff'],
		type: 0,
		maxLife: 10,
		life: 0
	})
	const unsafePlan = await unsafe.deletion.planSelections({ removeSurges: true })
	assert.equal(unsafePlan.summary.safeCount, 0)
	assert.equal(unsafePlan.protectedTargets[0].reason, 'unsafe-surge')
	unsafe.dispose()
}

function transientSave(entity) {
	const position = entity.position.slice()
	if (entity.name === 'cube') {
		return {
			name: 'cube',
			position,
			par: {
				fill: entity.fill,
				state: entity.state,
				resources: clone(entity.resources),
				broken: entity.broken
			}
		}
	}
	if (entity.name === 'surge') {
		return {
			name: 'surge',
			position,
			par: {
				resources: clone(entity.resources),
				rayNumber: entity.rayNumber,
				grade: entity.grade,
				colors: clone(entity.colors),
				type: entity.type,
				maxLife: entity.maxLife,
				life: entity.life
			}
		}
	}
	throw new Error('Unexpected transient test entity: ' + entity.name)
}

function testStaticCaptureAndCutContracts() {
	const session = source('scripts/blueprint-session.js')
	const cut = source('scripts/core/selection-cut.js')
	const deletion = source('scripts/core/selection-delete.js')
	assert.match(session, /schemaVersion:\s*6/)
	assert.match(session, /mode:\s*'full'/)
	assert.match(session, /surges:\s*surgeRecords/)
	assert.match(cut, /success-retained-layers/)
	assert.match(cut, /removeCubes/)
	assert.match(cut, /removeSurges/)
	assert.match(deletion, /statsDelta:\s*\{[\s\S]*isBuildingRemoval/)
	assert.match(deletion, /transientRemovalSafe/)
}

async function run() {
	await testSchemaProjectionAndPlacementModes()
	await testCreativeCutLayerTransaction()
	testStaticCaptureAndCutContracts()
	console.log('World Editor 5A data verification passed: schema-6 normalization, safe Surge payloads, neutral structure projection, normal-mode downgrade, creative Cube/Surge placement choices, and transaction-safe creative cut undo/redo.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
