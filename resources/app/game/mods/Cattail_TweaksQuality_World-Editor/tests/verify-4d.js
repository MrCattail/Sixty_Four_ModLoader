const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const {
	MOD_ROOT,
	source,
	createGame,
	loadRuntime
} = require('./verify-4b-1a.js')

const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const STATE_SOURCE = 'scripts/core/blueprint-state.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const TRANSFORM_SOURCE = 'scripts/core/blueprint-transform.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PLACEMENT_SOURCE = 'scripts/core/blueprint-placement.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'

function record(name, position, state = {}, options = {}) {
	const span = Math.max(0, Number(options.span) || 0)
	return {
		id: Number(options.id) || 1,
		kind: 'entity',
		name,
		position: position.slice(),
		footprint: {
			span,
			min: [position[0] - span, position[1] - span],
			max: [position[0] + span, position[1] + span]
		},
		restricted: { onlyOne: options.onlyOne === true },
		config: Object.assign({}, options.config),
		state: JSON.parse(JSON.stringify(state)),
		...(options.stateMeta ? { stateMeta: Object.assign({}, options.stateMeta) } : {})
	}
}

function fullBlueprint(entities = [], options = {}) {
	const blocks = (options.blocks || []).map(function (entry) {
		return {
			kind: 'cube',
			name: 'cube',
			position: entry.position.slice(),
			state: JSON.parse(JSON.stringify(entry.state || { state: 2, resources: [] }))
		}
	})
	const emptyCells = (options.emptyCells || []).map(position => position.slice())
	const points = entities.map(entry => entry.position).concat(
		blocks.map(entry => entry.position),
		emptyCells
	)
	const minU = points.length ? Math.min(...points.map(point => point[0])) : 0
	const maxU = points.length ? Math.max(...points.map(point => point[0])) : 0
	const minV = points.length ? Math.min(...points.map(point => point[1])) : 0
	const maxV = points.length ? Math.max(...points.map(point => point[1])) : 0
	return {
		schemaVersion: options.schemaVersion || 5,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [{
			id: 1,
			primary: true,
			start: [minU, minV],
			end: [maxU, maxV],
			min: [minU, minV],
			max: [maxU, maxV],
			width: maxU - minU + 1,
			height: maxV - minV + 1
		}],
		...(Number(options.schemaVersion || 5) === 5 ? { emptyCells } : {}),
		contentBounds: {
			min: [minU, minV],
			max: [maxU, maxV],
			width: maxU - minU + 1,
			height: maxV - minV + 1
		},
		includeBlocks: blocks.length > 0,
		entities,
		blocks,
		production: null,
		summary: {
			selectionCount: 1,
			selectedCellCount: points.length,
			entityCount: entities.length,
			blockCount: blocks.length,
			emptyCellCount: emptyCells.length,
			crossBoundaryCount: 0,
			skippedCount: 0,
			normalizedCount: 0,
			capturedTypes: [],
			skippedTypes: []
		}
	}
}

async function plan(runtime, value, target = [0, 0]) {
	return runtime.planner.build(runtime.game, value, target, {
		includeDynamicConflicts: true,
		canReplaceEntity(entity, details) {
			return runtime.placement.assessEntity(entity, details)
		}
	})
}

function testNormalizationAndLegacyMigration() {
	const runtime = loadRuntime({ creative: true })
	const state = runtime.sandbox[STATE_KEY]
	assert.equal(state.version, '0.4.5')
	const detailed = state.normalizeSaveDetailed({
		name: 'pump2',
		position: [3, 4],
		par: {
			depth: 8,
			timeStamp: 99,
			spawnedHollows: 4,
			fill: 12,
			stabilizerPosition: [10, 20],
			runtimeOwner: { id: 7 }
		}
	})
	assert.deepEqual(
		JSON.parse(JSON.stringify(detailed.save.par)),
		{ depth: 8, timeStamp: 0, fill: 12, spawnedHollows: 0 }
	)
	assert.equal(detailed.changed, true)
	assert.deepEqual(detailed.removedFields.sort(), ['runtimeOwner', 'stabilizerPosition'])

	const legacy = fullBlueprint([
		record('waypoint', [0, 0], { timestamp: 300, fill: 1 }),
		record('waypoint2', [1, 0], { timestamp: 100, fill: 2 })
	], { schemaVersion: 3 })
	const normalized = state.normalizeBlueprint(legacy)
	assert.equal(normalized.schemaVersion, 3)
	assert.equal(Object.hasOwn(normalized, 'emptyCells'), false)
	assert.equal(Object.hasOwn(normalized.entities[0].state, 'timestamp'), false)
	assert.equal(normalized.entities[0].stateMeta.waypointOrder, 1)
	assert.equal(normalized.entities[1].stateMeta.waypointOrder, 0)
	runtime.dispose()
}

async function testFullStateColorsAndCubeProtection() {
	const game = createGame()
	const existing = game.seed('silo', [0, 0], { fill: 12 })
	const stableCube = game.seed('cube', [2, 0], { state: 2, resources: [3, 4] })
	const runtime = loadRuntime({ game, creative: true })
	const value = fullBlueprint([
		record('silo', [0, 0], { fill: 12 })
	], {
		blocks: [{ position: [2, 0], state: { state: 2, resources: [3, 4] } }]
	})
	let preview = await plan(runtime, value)
	assert.equal(preview.mode, 'full')
	assert.equal(preview.schemaVersion, 5)
	assert.deepEqual(Array.from(preview.records, entry => entry.status), ['satisfied', 'satisfied'])

	existing.fill = 13
	preview = await plan(runtime, value)
	assert.equal(preview.records[0].status, 'conflict')
	assert.equal(preview.records[0].reason, 'occupied')
	assert.equal(preview.records[1].status, 'satisfied')

	stableCube.state = 1
	preview = await plan(runtime, value)
	assert.equal(preview.records[1].status, 'blocked')
	assert.equal(preview.records[1].reason, 'unstable-cube')
	runtime.dispose()
}

async function testCreativeGateFullStateCubeWaypointUndoRedo() {
	const value = fullBlueprint([
		record('silo', [0, 0], { fill: 44, resources: [7] }, { id: 1 }),
		record('waypoint', [2, 0], { fill: 1 }, {
			id: 2,
			stateMeta: { waypointOrder: 1 }
		}),
		record('waypoint2', [1, 0], { fill: 2 }, {
			id: 3,
			stateMeta: { waypointOrder: 0 }
		})
	], {
		blocks: [{ position: [3, 0], state: { state: 2, resources: [9], broken: 0.25 } }]
	})

	const normal = loadRuntime({ creative: false })
	normal.game.codex.entities.waypoint = { canPurchase: true, price: [1], priceExponent: 1 }
	normal.game.codex.entities.waypoint2 = { canPurchase: true, price: [1], priceExponent: 1 }
	const normalPlan = await plan(normal, value)
	const normalProposal = normal.placement.analyze(normalPlan).variants['00']
	const rejected = await normal.placement.place({
		blueprint: value,
		target: [0, 0],
		confirmedSignature: normalProposal.signature
	})
	assert.equal(rejected.executed, false)
	assert.equal(rejected.error.code, 'CREATIVE_REQUIRED')
	assert.equal(normal.snapshotStore.created.length, 0)
	normal.dispose()

	const runtime = loadRuntime({ creative: true })
	runtime.game.codex.entities.waypoint = { canPurchase: true, price: [1], priceExponent: 1 }
	runtime.game.codex.entities.waypoint2 = { canPurchase: true, price: [1], priceExponent: 1 }
	const preview = await plan(runtime, value)
	assert.equal(preview.statusCounts.buildable, 4)
	const proposal = runtime.placement.analyze(preview).variants['00']
	assert.equal(proposal.summary.buildCount, 4)
	assert.equal(proposal.summary.creative, true)
	const placed = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		confirmedSignature: proposal.signature
	})
	assert.equal(placed.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(runtime.game.entityAtCoordinates([0, 0]).fill, 44)
	assert.deepEqual(runtime.game.entityAtCoordinates([0, 0]).resources, [7])
	assert.equal(runtime.game.entityAtCoordinates([3, 0]).name, 'cube')
	assert.equal(runtime.game.entityAtCoordinates([3, 0]).state, 2)
	assert.deepEqual(runtime.game.entityAtCoordinates([3, 0]).resources, [9])
	assert.ok(
		runtime.game.entityAtCoordinates([1, 0]).timestamp <
		runtime.game.entityAtCoordinates([2, 0]).timestamp
	)
	assert.deepEqual(runtime.game.stats, { machinesBuild: 3, machinesSold: 0 })

	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	for (let u = 0; u <= 3; u += 1) assert.equal(runtime.game.entityAtCoordinates([u, 0]), null)
	const redone = await runtime.placement.redo('keyboard')
	assert.equal(redone.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([0, 0]).fill, 44)
	assert.equal(runtime.game.entityAtCoordinates([3, 0]).state, 2)
	assert.ok(
		runtime.game.entityAtCoordinates([1, 0]).timestamp <
		runtime.game.entityAtCoordinates([2, 0]).timestamp
	)
	runtime.dispose()
}

async function testFullReplacementRebaseEmptySyncAndLegacy() {
	const game = createGame()
	const target = game.seed('silo', [0, 0], { fill: 10 })
	game.seed('pinhole', [2, 0], { fill: 5 })
	const runtime = loadRuntime({ game, creative: true })
	const value = fullBlueprint([
		record('silo', [0, 0], { fill: 20 })
	], { emptyCells: [[2, 0]] })
	const initialPlan = await plan(runtime, value)
	assert.equal(initialPlan.records[0].status, 'conflict')
	const proposal = runtime.placement.analyze(initialPlan).variants['11']
	assert.equal(proposal.summary.replaceCount, 1)
	assert.equal(proposal.summary.syncDeleteCount, 1)
	target.fill = 11
	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		replaceConflicts: true,
		syncEmpty: true,
		confirmedSignature: proposal.signature
	})
	assert.equal(result.executed, true)
	assert.equal(game.entityAtCoordinates([0, 0]).fill, 20)
	assert.equal(game.entityAtCoordinates([2, 0]), null)
	assert.ok(
		runtime.placement.diagnostics().events.some(function (entry) {
			return entry.event === 'adapter.prepare.state-rebased' ||
				entry.event === 'adapter.preflight.state-rebased'
		})
	)
	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(game.entityAtCoordinates([0, 0]).fill, 11)
	assert.equal(game.entityAtCoordinates([2, 0]).name, 'pinhole')
	runtime.dispose()

	const legacyRuntime = loadRuntime({ creative: true })
	const legacy = fullBlueprint([
		record('silo', [0, 0], { fill: 31 })
	], { schemaVersion: 3 })
	const legacyPlan = await plan(legacyRuntime, legacy)
	assert.equal(legacyPlan.schemaVersion, 3)
	assert.equal(legacyPlan.emptyCells.length, 0)
	const legacyProposal = legacyRuntime.placement.analyze(legacyPlan).variants['00']
	const legacyResult = await legacyRuntime.placement.place({
		blueprint: legacy,
		target: [0, 0],
		confirmedSignature: legacyProposal.signature
	})
	assert.equal(legacyResult.executed, true)
	assert.equal(legacyRuntime.game.entityAtCoordinates([0, 0]).fill, 31)
	legacyRuntime.dispose()
}

async function testFullEmptySyncIgnoresNaturalResourceDrift() {
	const game = createGame()
	game.seed('silo', [0, 0], { fill: 10 })
	game.seed('pinhole', [2, 0], { fill: 5 })
	const runtime = loadRuntime({ game, creative: true })
	const value = fullBlueprint([], { emptyCells: [[0, 0], [2, 0]] })
	const initialPlan = await plan(runtime, value)
	const proposal = runtime.placement.analyze(initialPlan).variants['01']
	assert.equal(proposal.summary.buildCount, 0)
	assert.equal(proposal.summary.syncDeleteCount, 2)
	game.resources[0] += 17
	game.resources[1] += 3
	const resourcesBeforePlacement = game.resources.slice()

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: proposal.signature,
		input: 'mouse'
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(game.entityAtCoordinates([0, 0]), null)
	assert.equal(game.entityAtCoordinates([2, 0]), null)
	assert.deepEqual(game.resources, resourcesBeforePlacement)
	const rebuilt = runtime.placement.diagnostics().events.find(function (entry) {
		return entry.event === 'adapter.prepare.rebuilt'
	})
	assert.equal(rebuilt.details.signatureMatch, true)
	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(game.entityAtCoordinates([0, 0]).name, 'silo')
	assert.equal(game.entityAtCoordinates([2, 0]).name, 'pinhole')
	runtime.dispose()
}

function testManifestI18nAndStaticContracts() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.4.5')
	assert.equal(
		manifest.entry.indexOf(STATE_SOURCE),
		manifest.entry.indexOf('scripts/core/production-state.js') + 1
	)
	assert.equal(manifest.entry.indexOf(TRANSFORM_SOURCE), manifest.entry.indexOf(STATE_SOURCE) + 1)
	for (const filename of [
		STATE_SOURCE,
		SESSION_SOURCE,
		TRANSFORM_SOURCE,
		PLAN_SOURCE,
		PLACEMENT_SOURCE,
		PREVIEW_SOURCE
	]) {
		assert.doesNotThrow(function () {
			new vm.Script(source(filename), { filename })
		})
	}
	const definitions = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(source(I18N_SOURCE), sandbox, { filename: I18N_SOURCE })
	definitions[0].init()
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.4.5')
	assert.equal(i18n.languages.length, 20)
	for (const language of i18n.languages) {
		for (const key of ['previewFullUnavailable', 'placementOptionsTitleFull', 'blueprintFullSummary']) {
			const translated = i18n.t({ language }, key)
			assert.equal(typeof translated, 'string')
			assert.ok(translated.trim())
		}
	}
	const sessionSource = source(SESSION_SOURCE)
	assert.match(sessionSource, /schemaVersion:\s*captureMode === 'structure' \? 4 : 5/)
	assert.match(sessionSource, /emptyCells:\s*normalizedEmptyCells/)
	assert.match(sessionSource, /waypointOrder/)
	assert.match(source(PLACEMENT_SOURCE), /label:\s*plan\.mode === 'full' \? 'Full blueprint placement'/)
	assert.match(source(PREVIEW_SOURCE), /fullPlacementLocked/)
}

async function run() {
	testNormalizationAndLegacyMigration()
	await testFullStateColorsAndCubeProtection()
	await testCreativeGateFullStateCubeWaypointUndoRedo()
	await testFullReplacementRebaseEmptySyncAndLegacy()
	await testFullEmptySyncIgnoresNaturalResourceDrift()
	testManifestI18nAndStaticContracts()
	console.log(
		'World Editor 4D verification passed: schema 5 normalization, full-state colors, stable Cube, Creative gating, Waypoint order, empty sync, live-state rebasing, undo/redo, legacy schema 3, 20 languages, and manifest scope.'
	)
}

run().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
