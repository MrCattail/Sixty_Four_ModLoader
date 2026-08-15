const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const FILES = [
	'scripts/core/paint-cube-state.js',
	'scripts/core/blueprint-painted.js',
	'scripts/core/blueprint-state.js',
	'scripts/core/blueprint-preview-plan.js',
	'scripts/core/blueprint-placement.js'
]
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function cellKey(position) {
	return position[0] + ':' + position[1]
}

function createGame() {
	const game = {
		plane: 0,
		stuff: [],
		stuffMap: {},
		resources: [],
		stats: { machinesBuild: 0, machinesSold: 0 },
		entitiesInGame: {},
		onlyones: {},
		codex: { entities: {
			cube: { name: 'cube', canPurchase: false, price: [], priceExponent: 1 },
			pump: { name: 'pump', canPurchase: true, price: [], priceExponent: 1 }
		} },
		shop: { updateElements() {}, check() {} },
		processMousemove2() {},
		entityAtCoordinates(position) {
			return this.stuffMap['u' + position[0] + 'v' + position[1]] || null
		},
		addEntity(name, position, misc) {
			if (this.entityAtCoordinates(position)) return null
			const entity = {
				name,
				position: position.slice(),
				entitySpan: 0,
				state: 0,
				fill: 0,
				unveilProgress: 0,
				broken: 0,
				resources: plain(misc?.resources || []),
				init() {}
			}
			this.stuff.push(entity)
			this.stuffMap['u' + position[0] + 'v' + position[1]] = entity
			this.entitiesInGame[name] = (this.entitiesInGame[name] || 0) + 1
			return entity
		},
		clearCell(position) {
			const entity = this.entityAtCoordinates(position)
			if (!entity) return false
			delete this.stuffMap['u' + entity.position[0] + 'v' + entity.position[1]]
			this.stuff = this.stuff.filter(function (entry) { return entry !== entity })
			this.entitiesInGame[entity.name] = Math.max(0, (this.entitiesInGame[entity.name] || 0) - 1)
			return true
		},
		getEntityString(entity) {
			return {
				name: entity.name,
				position: plain(entity.position),
				par: {
					state: entity.state,
					fill: entity.fill,
					unveilProgress: entity.unveilProgress,
					broken: entity.broken,
					resources: plain(entity.resources || []),
					...(entity.worldEditorPaint ? { worldEditorPaint: plain(entity.worldEditorPaint) } : {})
				}
			}
		}
	}
	return game
}

function createEnvironment() {
	const definitions = []
	const events = new Map()
	let placementAdapter = null
	const sandbox = {
		console: { info() {}, warn() {} },
		performance: { now: () => Date.now() },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	const api = {
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		},
		patch(target, key, factory) { target[key] = factory(target[key]) }
	}
	vm.createContext(sandbox)
	for (const relative of FILES) {
		vm.runInContext(fs.readFileSync(path.join(MOD_ROOT, relative), 'utf8'), sandbox, { filename: relative })
		const definition = definitions.shift()
		assert.ok(definition, relative)
		definition.init(api)
	}
	const game = createGame()
	sandbox[RUNTIME_KEY] = { game, addCleanup() {} }
	sandbox[CREATIVE_KEY] = { game, snapshot() { return { ready: true, creativeMode: true } } }
	sandbox[TRANSACTIONS_KEY] = {
		game,
		registerAdapter(kind, adapter) {
			assert.equal(kind, 'blueprint-placement')
			placementAdapter = adapter
			return function () {}
		},
		execute() {},
		undo() {},
		redo() {},
		isBusy() { return false }
	}
	for (const listener of events.get('afterGameInit') || []) listener({}, game)
	return {
		sandbox,
		game,
		paint: sandbox[PAINT_KEY],
		painted: sandbox[PAINTED_KEY],
		planner: sandbox[PLAN_KEY],
		placement: sandbox[PLACEMENT_KEY],
		adapter() { return placementAdapter }
	}
}

function record(save) {
	return { kind: 'painted-cube', name: 'cube', position: plain(save.position), state: plain(save.par) }
}

function sourceBlueprint(paint) {
	const recipe = { weights: [{ resource: 1, weight: 3 }, { resource: 7, weight: 2 }] }
	const first = paint.buildGrowCubeSave([0, 0], recipe, 4000, 'source-lineage-01')
	const second = paint.buildGrowCubeSave([1, 0], recipe, 4000, 'source-lineage-01')
	const stable = paint.buildGrowCubeSave([2, 0], recipe, 4000, 'source-lineage-02')
	stable.par.state = 2
	stable.par.fill = 64
	stable.par.unveilProgress = 1
	stable.par.worldEditorPaint = paint.updateGrowProgress(stable.par.worldEditorPaint, 'stable', 4000)
	return {
		schemaVersion: 7,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [],
		emptyCells: [],
		contentBounds: { min: [0, 0], max: [2, 0], width: 3, height: 1 },
		includeBlocks: true,
		entities: [],
		blocks: [],
		paintedCubes: [record(first), record(second), record(stable)],
		surges: [],
		production: null,
		summary: { paintedCubeCount: 3 }
	}
}

function sourceStructureBlueprint() {
	return {
		schemaVersion: 3,
		mode: 'structure',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		contentBounds: { min: [0, 0], max: [0, 0], width: 1, height: 1 },
		entities: [{
			id: 1,
			kind: 'entity',
			name: 'pump',
			position: [0, 0],
			footprint: { span: 0, min: [0, 0], max: [0, 0] },
			config: {},
			restricted: {}
		}]
	}
}

function context(operationId, direction) {
	return { operationId, direction, isCurrent() { return true } }
}

async function placeBlueprint(env, blueprint, target, id) {
	const plan = await env.planner.build(env.game, blueprint, target, {
		includeBlocks: true,
		includeSurges: false,
		canReplaceEntity() { return { safe: true } }
	})
	const analysis = env.placement.analyze(plan)
	const prepared = await env.adapter().prepare(context('prepare-' + id, 'forward'), {
		blueprint,
		target,
		includeBlocks: true,
		includeSurges: false,
		replaceConflicts: false,
		syncEmpty: false,
		confirmedSignature: analysis.variants['00'].signature
	})
	const recordValue = { id, kind: 'blueprint-placement', payload: prepared.payload }
	const operation = context('forward-' + id, 'forward')
	assert.equal((await env.adapter().preflight(operation, recordValue, 'forward')).ok, true)
	await env.adapter().capture(operation, recordValue)
	await env.adapter().apply(operation, recordValue, 'forward')
	assert.equal((await env.adapter().verify(operation, recordValue, 'forward')).ok, true)
	return recordValue
}

function addPaintedBuild(env, build) {
	const entity = env.game.addEntity(build.name, build.position, {
		resources: plain(build.save.par.resources || [])
	})
	for (const key of Object.keys(build.save.par)) entity[key] = plain(build.save.par[key])
	entity.position = plain(build.position)
	entity.init()
	assert.equal(env.painted.matchesMaterializedEntity(entity, build.save), true)
	return entity
}

function rebuildPaintedBuild(env, build) {
	const original = env.game.entityAtCoordinates(build.position)
	assert.ok(original)
	env.game.clearCell(build.position)
	const rebuilt = addPaintedBuild(env, build)
	assert.notEqual(rebuilt, original)
	return rebuilt
}

function rebuildPaintedBuilds(env, recordValue) {
	return recordValue.payload.builds.map(function (build) {
		return rebuildPaintedBuild(env, build)
	})
}

async function testGroupedLineageAndAtomicUndoRedo() {
	const env = createEnvironment()
	const blueprint = sourceBlueprint(env.paint)
	const plan = await env.planner.build(env.game, blueprint, [10, 20], {
		includeBlocks: true,
		includeSurges: false,
		canReplaceEntity() { return { safe: true } }
	})
	assert.deepEqual(plain(plan.statusCounts), { buildable: 3, satisfied: 0, conflict: 0, blocked: 0 })
	assert.equal(Object.hasOwn(plan.guard.counts, 'cube'), false)
	env.game.entitiesInGame.cube = 99
	assert.deepEqual(plain(env.planner.inspect(env.game, plan.guard)), { valid: true, reason: 'valid' })
	const analysis = env.placement.analyze(plan)
	assert.equal(analysis.variants['00'].summary.paintedBuildCount, 3)
	const request = {
		blueprint,
		target: [10, 20],
		includeBlocks: true,
		includeSurges: false,
		replaceConflicts: false,
		syncEmpty: false,
		confirmedSignature: analysis.variants['00'].signature
	}
	const firstPrepared = await env.adapter().prepare(context('prepare-1', 'forward'), request)
	const secondPrepared = await env.adapter().prepare(context('prepare-2', 'forward'), request)
	const firstPaints = firstPrepared.payload.builds.map(function (build) { return build.save.par.worldEditorPaint })
	const secondPaints = secondPrepared.payload.builds.map(function (build) { return build.save.par.worldEditorPaint })
	assert.equal(firstPaints[0].growth.lineage, firstPaints[1].growth.lineage)
	assert.notEqual(firstPaints[0].growth.lineage, firstPaints[2].growth.lineage)
	assert.notEqual(firstPaints[0].growth.lineage, blueprint.paintedCubes[0].state.worldEditorPaint.growth.lineage)
	assert.notEqual(firstPaints[0].growth.lineage, secondPaints[0].growth.lineage)
	assert.equal(firstPrepared.payload.builds[0].save.par.state, 0)
	assert.equal(firstPrepared.payload.builds[0].save.par.fill, 0)
	assert.equal(firstPrepared.payload.builds[2].save.par.state, 2)
	assert.equal(firstPrepared.payload.builds[2].save.par.fill, 64)
	assert.deepEqual(plain(firstPrepared.payload.builds[0].save.par.resources), plain(blueprint.paintedCubes[0].state.resources))

	const recordValue = { id: 'painted-tx-1', kind: 'blueprint-placement', payload: firstPrepared.payload }
	assert.equal((await env.adapter().preflight(context('forward-1', 'forward'), recordValue, 'forward')).ok, true)
	await env.adapter().capture(context('forward-1', 'forward'), recordValue)
	await env.adapter().apply(context('forward-1', 'forward'), recordValue, 'forward')
	for (const build of recordValue.payload.builds) {
		const entity = env.game.entityAtCoordinates(build.position)
		assert.equal(env.painted.matchesMaterializedEntity(entity, build.save), true, JSON.stringify({ entity, save: build.save }))
	}
	const forwardVerification = await env.adapter().verify(context('forward-1', 'forward'), recordValue, 'forward')
	assert.equal(forwardVerification.ok, true, JSON.stringify(forwardVerification))
	assert.equal(env.game.stuff.length, 3)
	for (const build of recordValue.payload.builds) {
		const entity = env.game.entityAtCoordinates(build.position)
		assert.equal(env.painted.matchesMaterializedEntity(entity, build.save), true)
	}

	const satisfied = await env.planner.build(env.game, blueprint, [10, 20], {
		includeBlocks: true,
		includeSurges: false,
		canReplaceEntity() { return { safe: true } }
	})
	assert.equal(satisfied.statusCounts.satisfied, 3)

	assert.equal((await env.adapter().preflight(context('undo-1', 'undo'), recordValue, 'undo')).ok, true)
	await env.adapter().capture(context('undo-1', 'undo'), recordValue)
	await env.adapter().apply(context('undo-1', 'undo'), recordValue, 'undo')
	assert.equal((await env.adapter().verify(context('undo-1', 'undo'), recordValue, 'undo')).ok, true)
	assert.equal(env.game.stuff.length, 0)

	assert.equal((await env.adapter().preflight(context('redo-1', 'redo'), recordValue, 'redo')).ok, true)
	await env.adapter().capture(context('redo-1', 'redo'), recordValue)
	await env.adapter().apply(context('redo-1', 'redo'), recordValue, 'redo')
	assert.equal((await env.adapter().verify(context('redo-1', 'redo'), recordValue, 'redo')).ok, true)
	assert.equal(env.game.stuff.length, 3)
	assert.equal(
		env.game.entityAtCoordinates([10, 20]).worldEditorPaint.growth.lineage,
		firstPaints[0].growth.lineage
	)
}

async function testConflictColorsAndReplacementBoundary() {
	const env = createEnvironment()
	const blueprint = sourceBlueprint(env.paint)
	const ordinary = env.game.addEntity('cube', [30, 30], { resources: [] })
	ordinary.state = 2
	ordinary.fill = 64
	const conflict = await env.planner.build(env.game, blueprint, [30, 30], {
		includeBlocks: true,
		includeSurges: false,
		canReplaceEntity() { return { safe: true } }
	})
	assert.equal(conflict.records[0].status, 'conflict')
	assert.equal(conflict.records[0].reason, 'occupied')

	env.game.clearCell([30, 30])
	const protectedEntity = env.game.addEntity('pump', [30, 30], {})
	protectedEntity.indestructible = true
	const blocked = await env.planner.build(env.game, blueprint, [30, 30], {
		includeBlocks: true,
		includeSurges: false,
		canReplaceEntity() { return { safe: false } }
	})
	assert.equal(blocked.records[0].status, 'blocked')
}

async function testUndoAcceptsCompatibleRebuiltPaintedEntities() {
	const env = createEnvironment()
	const blueprint = sourceBlueprint(env.paint)
	const recordValue = await placeBlueprint(env, blueprint, [40, 50], 'painted-tx-rebuilt')
	rebuildPaintedBuilds(env, recordValue)

	const undoOperation = context('undo-rebuilt', 'undo')
	const undoPreflight = await env.adapter().preflight(undoOperation, recordValue, 'undo')
	assert.equal(undoPreflight.ok, true, JSON.stringify(undoPreflight))
	const identityEvents = env.placement.diagnostics().events.filter(function (event) {
		return event.event === 'adapter.preflight.identity-rebound'
	})
	assert.equal(identityEvents.length, 1)
	assert.equal(identityEvents[0].details.buildCount, 3)
	await env.adapter().capture(undoOperation, recordValue)
	await env.adapter().apply(undoOperation, recordValue, 'undo')
	assert.equal((await env.adapter().verify(undoOperation, recordValue, 'undo')).ok, true)
	assert.equal(env.game.stuff.length, 0)

	const redoOperation = context('redo-rebuilt', 'redo')
	assert.equal((await env.adapter().preflight(redoOperation, recordValue, 'redo')).ok, true)
	await env.adapter().capture(redoOperation, recordValue)
	await env.adapter().apply(redoOperation, recordValue, 'redo')
	assert.equal((await env.adapter().verify(redoOperation, recordValue, 'redo')).ok, true)
	assert.equal(env.game.stuff.length, 3)

	const secondUndo = context('undo-rebuilt-again', 'undo')
	assert.equal((await env.adapter().preflight(secondUndo, recordValue, 'undo')).ok, true)
	await env.adapter().capture(secondUndo, recordValue)
	await env.adapter().apply(secondUndo, recordValue, 'undo')
	assert.equal((await env.adapter().verify(secondUndo, recordValue, 'undo')).ok, true)
	assert.equal(env.game.stuff.length, 0)
}

async function testUndoRejectsIncompatibleRebuiltPaintedEntities() {
	const cases = [
		{
			name: 'missing',
			mutate(env, recordValue) {
				env.game.clearCell(recordValue.payload.builds[0].position)
			}
		},
		{
			name: 'wrong-name',
			mutate(env, recordValue) {
				const build = recordValue.payload.builds[0]
				env.game.clearCell(build.position)
				env.game.addEntity('pump', build.position, {})
			}
		},
		{
			name: 'wrong-footprint',
			mutate(env, recordValue, rebuilt) {
				rebuilt[0].entitySpan = 1
			}
		},
		{
			name: 'wrong-position',
			mutate(env, recordValue, rebuilt) {
				rebuilt[0].position = [61, 70]
			}
		},
		{
			name: 'wrong-grow-lineage',
			mutate(env, recordValue, rebuilt) {
				rebuilt[0].worldEditorPaint.growth.lineage = 'external-lineage'
			}
		},
		{
			name: 'wrong-resources',
			mutate(env, recordValue, rebuilt) {
				rebuilt[0].resources = [999]
			}
		},
		{
			name: 'wrong-broken',
			mutate(env, recordValue, rebuilt) {
				rebuilt[0].broken += 1
			}
		}
	]

	for (const scenario of cases) {
		const env = createEnvironment()
		const recordValue = await placeBlueprint(
			env,
			sourceBlueprint(env.paint),
			[60, 70],
			'painted-negative-' + scenario.name
		)
		const rebuilt = rebuildPaintedBuilds(env, recordValue)
		scenario.mutate(env, recordValue, rebuilt)
		const result = await env.adapter().preflight(
			context('undo-negative-' + scenario.name, 'undo'),
			recordValue,
			'undo'
		)
		assert.equal(result.ok, false, scenario.name)
		assert.equal(result.code, 'EXTERNAL_CHANGE', scenario.name)
		assert.equal(env.placement.diagnostics().events.some(function (event) {
			return event.event === 'adapter.preflight.identity-rebound'
		}), false, scenario.name)
	}
}

async function testUndoRejectsPaintedIdentityOwnedByAnotherEntity() {
	const env = createEnvironment()
	const recordValue = await placeBlueprint(
		env,
		sourceBlueprint(env.paint),
		[80, 90],
		'painted-identity-conflict'
	)
	const build = recordValue.payload.builds[0]
	const identityOwner = env.game.entityAtCoordinates(build.position)
	delete env.game.stuffMap['u' + build.position[0] + 'v' + build.position[1]]
	identityOwner.position = [100, 110]
	env.game.stuffMap.u100v110 = identityOwner
	addPaintedBuild(env, build)
	for (const remaining of recordValue.payload.builds.slice(1)) rebuildPaintedBuild(env, remaining)

	const result = await env.adapter().preflight(
		context('undo-identity-conflict', 'undo'),
		recordValue,
		'undo'
	)
	assert.equal(result.ok, false)
	assert.equal(result.code, 'EXTERNAL_CHANGE')
	assert.equal(env.placement.diagnostics().events.some(function (event) {
		return event.event === 'adapter.preflight.identity-rebound'
	}), false)
}

async function testUndoDoesNotRebindOrdinaryBlueprintEntities() {
	const env = createEnvironment()
	const recordValue = await placeBlueprint(
		env,
		sourceStructureBlueprint(),
		[120, 130],
		'ordinary-identity-rebuild'
	)
	const build = recordValue.payload.builds[0]
	assert.equal(build.sourceKind, 'entity')
	const original = env.game.entityAtCoordinates(build.position)
	env.game.clearCell(build.position)
	const rebuilt = env.game.addEntity(build.name, build.position, {})
	assert.notEqual(rebuilt, original)

	const result = await env.adapter().preflight(
		context('undo-ordinary-identity-rebuild', 'undo'),
		recordValue,
		'undo'
	)
	assert.equal(result.ok, false)
	assert.equal(result.code, 'EXTERNAL_CHANGE')
	assert.equal(env.placement.diagnostics().events.some(function (event) {
		return event.event === 'adapter.preflight.identity-rebound'
	}), false)
}

async function run() {
	await testGroupedLineageAndAtomicUndoRedo()
	await testConflictColorsAndReplacementBoundary()
	await testUndoAcceptsCompatibleRebuiltPaintedEntities()
	await testUndoRejectsIncompatibleRebuiltPaintedEntities()
	await testUndoRejectsPaintedIdentityOwnedByAnotherEntity()
	await testUndoDoesNotRebindOrdinaryBlueprintEntities()
	const placementSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/core/blueprint-placement.js'), 'utf8')
	assert.match(placementSource, /materializePaintedBuilds\(builds\)/)
	assert.match(placementSource, /painted-cube/)
	assert.match(placementSource, /rollbackMutations/)
	console.log('World Editor 5C-7 painted blueprint placement/transaction verification passed.')
}

run().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
