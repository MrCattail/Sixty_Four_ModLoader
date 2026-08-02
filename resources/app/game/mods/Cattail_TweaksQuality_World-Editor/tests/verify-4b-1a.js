const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const TRANSACTION_SOURCE = 'scripts/core/editor-transactions.js'
const STATE_SOURCE = 'scripts/core/blueprint-state.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PLACEMENT_SOURCE = 'scripts/core/blueprint-placement.js'
const DIALOG_SOURCE = 'scripts/ui/dialog.js'
const SHELL_SOURCE = 'scripts/ui/editor-shell.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
const SAVE_INSTANCE_ID = '44444444-4444-4444-8444-444444444444'

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

class SnapshotStore {
	constructor() {
		this.created = []
		this.removed = []
		this.onCreate = null
	}

	create(options) {
		this.created.push(options)
		this.onCreate?.(options)
		return Promise.resolve({ id: 'snapshot-' + this.created.length })
	}

	remove(options) {
		this.removed.push(options.id)
		return Promise.resolve({ removed: true })
	}
}

class EventHub {
	constructor() {
		this.listeners = new Map()
		this.width = 1280
		this.height = 720
		this.style = {}
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set())
		this.listeners.get(type).add(listener)
	}

	removeEventListener(type, listener) {
		this.listeners.get(type)?.delete(listener)
	}

	dispatch(type, event = {}) {
		for (const listener of Array.from(this.listeners.get(type) || [])) listener(event)
	}

	getBoundingClientRect() {
		return { left: 0, top: 0, width: this.width, height: this.height }
	}
}

function createGame(options = {}) {
	const cells = new Map()
	const game = {
		saveInstanceId: SAVE_INSTANCE_ID,
		plane: 0,
		resources: (options.resources || [100, 100]).slice(),
		eraserType: options.eraserType || 0,
		entitiesInGame: {},
		onlyones: {},
		stuff: [],
		stats: {
			machinesBuild: 0,
			machinesSold: 0
		},
		codex: {
			entities: {
				silo: definition([10, 2], 2),
				pinhole: definition([40, 0]),
				pump: definition([8, 1]),
				pump2: definition([12, 2]),
				gradient: definition([16, 3]),
				stabilizer: definition([20, 4]),
				stabilizer2: definition([24, 5]),
				eraser: definition([1, 0]),
				eraser2: definition([2, 0]),
				eraser3: definition([3, 0]),
				modded: definition([1, 0]),
				cube: {
					canPurchase: false,
					price: [0, 0],
					priceExponent: 1
				},
				surge: {
					canPurchase: false,
					price: [0, 0],
					priceExponent: 1
				}
			}
		},
		shop: {
			updateElements() {},
			check() {}
		},
		processMousemove2() {},
		assembleSave() {
			return JSON.stringify({
				modloader: { saveInstanceId: this.saveInstanceId },
				plane: this.plane,
				resources: this.resources,
				entities: this.stuff.map(entity => ({
					name: entity.name,
					position: entity.position
				}))
			})
		},
		decodeSave(data) {
			return JSON.parse(data)
		},
		entityAtCoordinates(position) {
			return cells.get(cellKey(position)) || null
		},
		getEntityString(entity) {
			const par = JSON.parse(JSON.stringify(entity.par || {}))
			for (const key of Object.keys(entity)) {
				if (['name', 'position', 'entitySpan', 'par', 'init'].includes(key)) continue
				if (typeof entity[key] !== 'function') par[key] = JSON.parse(JSON.stringify(entity[key]))
			}
			return {
				name: entity.name,
				position: entity.position.slice(),
				par
			}
		},
		addEntity(name, position, misc) {
			this.addCalls += 1
			if (this.failAddAt && this.addCalls === this.failAddAt) return null
			const span = Math.max(0, Number(this.codex.entities[name]?.entitySpan) || 0)
			const entity = {
				name,
				position: position.slice(),
				entitySpan: span,
				par: {},
				init() {}
			}
			if (misc && typeof misc === 'object') Object.assign(entity, misc)
			this.stuff.push(entity)
			this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
			writeEntityCells(cells, entity)
			return entity
		},
		clearCell(position) {
			if (this.throwOnClear) throw new Error('clear failed')
			const entity = this.entityAtCoordinates(position)
			if (!entity) return false
			for (const [key, value] of Array.from(cells.entries())) {
				if (value === entity) cells.delete(key)
			}
			const index = this.stuff.indexOf(entity)
			if (index >= 0) this.stuff.splice(index, 1)
			this.entitiesInGame[entity.name] = Math.max(
				0,
				(Number(this.entitiesInGame[entity.name]) || 0) - 1
			)
			return true
		},
		addCalls: 0,
		failAddAt: null,
		throwOnClear: false
	}

	game.seed = function (name, position, properties = {}) {
		const entity = game.addEntity(name, position)
		assert.ok(entity)
		Object.assign(entity, properties)
		if (properties.par) entity.par = JSON.parse(JSON.stringify(properties.par))
		return entity
	}
	game.entityNames = function () {
		return game.stuff
			.map(entity => entity.name + '@' + entity.position.join(','))
			.sort()
	}
	return game
}

function definition(price, priceExponent = 1) {
	return {
		canPurchase: true,
		price: price.slice(),
		priceExponent
	}
}

function writeEntityCells(cells, entity) {
	const span = Math.max(0, Number(entity.entitySpan) || 0)
	for (let v = entity.position[1] - span; v <= entity.position[1] + span; v += 1) {
		for (let u = entity.position[0] - span; u <= entity.position[0] + span; u += 1) {
			cells.set(u + ':' + v, entity)
		}
	}
}

function cellKey(position) {
	return position[0] + ':' + position[1]
}

function blueprint(records) {
	const entities = records.map(function (entry, index) {
		const position = entry.position.slice()
		const span = Math.max(0, Number(entry.span) || 0)
		return {
			id: index + 1,
			kind: 'entity',
			name: entry.name,
			position,
			footprint: {
				span,
				min: [position[0] - span, position[1] - span],
				max: [position[0] + span, position[1] + span]
			},
			config: Object.assign({}, entry.config),
			restricted: Object.assign({}, entry.restricted)
		}
	})
	const minU = Math.min(...entities.map(entity => entity.footprint.min[0]))
	const maxU = Math.max(...entities.map(entity => entity.footprint.max[0]))
	const minV = Math.min(...entities.map(entity => entity.footprint.min[1]))
	const maxV = Math.max(...entities.map(entity => entity.footprint.max[1]))
	return {
		schemaVersion: 3,
		mode: 'structure',
		sourcePlane: 0,
		anchor: {
			position: [0, 0],
			selectionIds: [1]
		},
		contentBounds: {
			min: [minU, minV],
			max: [maxU, maxV],
			width: maxU - minU + 1,
			height: maxV - minV + 1
		},
		entities
	}
}

function loadRuntime(options = {}) {
	const hooks = new Map()
	const definitions = []
	const cleanups = []
	const snapshotStore = new SnapshotStore()
	const game = options.game || createGame(options)
	let uuidSequence = 0
	const sandbox = {
		console: {
			info() {},
			warn() {},
			error() {}
		},
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		Uint8Array,
		setTimeout,
		performance: {
			now() {
				return Date.now()
			}
		},
		crypto: {
			randomUUID() {
				uuidSequence += 1
				return '00000000-0000-4000-8000-' + String(uuidSequence).padStart(12, '0')
			}
		},
		ModLoader: {
			register(definitionValue) {
				definitions.push(definitionValue)
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	for (const relativePath of [TRANSACTION_SOURCE, STATE_SOURCE, PLAN_SOURCE, PLACEMENT_SOURCE]) {
		vm.runInContext(source(relativePath), sandbox, { filename: relativePath })
	}
	const api = {
		storage: { snapshots: snapshotStore },
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	}
	for (const definitionValue of definitions) definitionValue.init(api)
	sandbox[RUNTIME_KEY] = {
		game,
		addCleanup(callback) {
			cleanups.push(callback)
			return callback
		}
	}
	const creativeState = {
		ready: true,
		creativeMode: options.creative === true
	}
	sandbox[CREATIVE_KEY] = {
		game,
		snapshot() {
			return Object.assign({}, creativeState)
		}
	}
	for (const listener of hooks.get('afterGameInit') || []) listener({}, game)
	const runtime = {
		game,
		sandbox,
		snapshotStore,
		transactions: sandbox[TRANSACTIONS_KEY],
		planner: sandbox[PLAN_KEY],
		placement: sandbox[PLACEMENT_KEY],
		creativeState,
		dispose() {
			for (const cleanup of cleanups.splice(0).reverse()) cleanup()
			runtime.transactions?.dispose?.('test-complete')
		}
	}
	assert.ok(runtime.transactions)
	assert.ok(runtime.planner)
	assert.ok(runtime.placement)
	return runtime
}

function loadPreviewRuntime() {
	const hooks = new Map()
	const cleanups = []
	const windowHub = new EventHub()
	const canvas = new EventHub()
	const game = {
		canvas,
		plane: 0,
		halt: false,
		splash: { isShown: false },
		hoveredCell: [1, 1],
		resources: [100],
		entitiesInGame: {},
		onlyones: {},
		codex: { entities: {} },
		unit: 24,
		zoom: 1,
		w: 1280,
		h: 720,
		w2: 640,
		h2: 360,
		uvToXY(position) {
			return [position[0] * 10, position[1] * 6]
		},
		updateMouseData() {}
	}
	let sessionState = {
		attemptId: 0,
		blueprint: null,
		lastResult: null
	}
	const sessionListeners = new Set()
	const session = {
		game,
		snapshot() {
			return sessionState
		},
		subscribe(listener) {
			sessionListeners.add(listener)
			listener(sessionState)
			return function () {
				sessionListeners.delete(listener)
			}
		},
		emit(next) {
			sessionState = next
			for (const listener of Array.from(sessionListeners)) listener(sessionState)
		}
	}
	const runtimeState = { active: true }
	const runtime = {
		game,
		snapshot() {
			return runtimeState
		},
		subscribe(listener) {
			listener(runtimeState)
			return function () {}
		},
		addCleanup(callback) {
			cleanups.push(callback)
		}
	}
	const buildTargets = []
	let retryTarget = null
	let retryIssued = false
	const planner = {
		build(nextGame, nextBlueprint, target) {
			const normalizedTarget = target.slice()
			buildTargets.push(normalizedTarget)
			const key = normalizedTarget.join(':')
			const retry = key === retryTarget && !retryIssued
			if (retry) retryIssued = true
			return Promise.resolve({
				version: '0.5.0',
				target: normalizedTarget,
				records: [],
				statusCounts: {
					buildable: 0,
					satisfied: 0,
					conflict: 0,
					blocked: 0
				},
				cost: {
					complete: true,
					buildCount: 0,
					required: [],
					owned: [],
					shortfall: []
				},
				bounds: {
					minU: normalizedTarget[0],
					maxU: normalizedTarget[0],
					minV: normalizedTarget[1],
					maxV: normalizedTarget[1]
				},
				guard: {
					cells: [],
					retry
				}
			})
		},
		inspect(nextGame, guard) {
			return guard.retry
				? { valid: false, reason: 'cells' }
				: { valid: true, reason: 'same' }
		},
		verify() {
			return true
		},
		refreshResources(nextGame, plan) {
			return plan
		},
		benchmark() {
			return Promise.resolve({ results: [] })
		}
	}
	let definitionValue = null
	let timerSequence = 0
	const sandbox = {
		console: {
			info() {},
			warn() {},
			error() {}
		},
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		performance: {
			now() {
				return Date.now()
			}
		},
		setTimeout() {
			timerSequence += 1
			return timerSequence
		},
		clearTimeout() {},
		window: windowHub,
		ModLoader: {
			register(value) {
				definitionValue = value
			}
		}
	}
	sandbox.globalThis = sandbox
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = {
		game,
		snapshot() {
			return { plane: 0 }
		}
	}
	sandbox[BLUEPRINT_KEY] = session
	sandbox[PLAN_KEY] = planner
	sandbox[PLACEMENT_KEY] = {
		game,
		assessEntity() {
			return { safe: true, reason: 'test' }
		}
	}
	sandbox[SHARED_KEY] = {
		isEditableEvent() {
			return false
		},
		isModLoaderPanelBlocking() {
			return false
		},
		isWorldEditorInputBlocked() {
			return false
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(source(PREVIEW_SOURCE), sandbox, { filename: PREVIEW_SOURCE })
	assert.ok(definitionValue)
	definitionValue.init({
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		},
		render: {
			registerLayer() {
				return function () {}
			},
			onLayer() {
				return function () {}
			},
			onFrame() {
				return function () {}
			},
			markDirty() {}
		}
	})
	for (const listener of hooks.get('afterGameInit') || []) listener({}, game)
	const controller = sandbox[PREVIEW_KEY]
	assert.ok(controller)
	return {
		game,
		windowHub,
		session,
		controller,
		buildTargets,
		setRetryTarget(position) {
			retryTarget = position.join(':')
			retryIssued = false
		},
		dispose() {
			for (const cleanup of cleanups.splice(0).reverse()) cleanup()
		}
	}
}

async function flush() {
	for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

function keyEvent(code, key) {
	return {
		code,
		key,
		location: code === 'AltRight' ? 2 : 1,
		preventDefault() {},
		stopImmediatePropagation() {}
	}
}

async function testInitializationAndBasicHistory() {
	const runtime = loadRuntime()
	assert.equal(runtime.placement.version, '1.3.0')
	assert.equal(runtime.placement.snapshot().version, '1.3.0')
	assert.equal(runtime.placement.snapshot().ready, true)
	assert.deepEqual(
		Array.from(runtime.transactions.snapshot().registeredKinds),
		['blueprint-placement']
	)

	const initialResources = runtime.game.resources.slice()
	const result = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [5, 6],
		input: 'mouse'
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(runtime.game.entityAtCoordinates([5, 6]).name, 'silo')
	assert.deepEqual(runtime.game.resources, [90, 98])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 1, machinesSold: 0 })
	assert.equal(runtime.placement.snapshot().canUndo, true)
	const satisfiedPlan = await runtime.planner.build(
		runtime.game,
		blueprint([{ name: 'silo', position: [0, 0] }]),
		[5, 6],
		{
			includeDynamicConflicts: true,
			canReplaceEntity(entity) {
				return runtime.placement.assessEntity(entity)
			}
		}
	)
	assert.equal(satisfiedPlan.records[0].status, 'satisfied')

	const undo = await runtime.placement.undo('keyboard')
	assert.equal(undo.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([5, 6]), null)
	assert.deepEqual(runtime.game.resources, initialResources)
	assert.deepEqual(runtime.game.stats, { machinesBuild: 0, machinesSold: 0 })
	assert.equal(runtime.placement.snapshot().canRedo, true)

	const redo = await runtime.placement.redo('keyboard')
	assert.equal(redo.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([5, 6]).name, 'silo')
	assert.deepEqual(runtime.game.resources, [90, 98])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 1, machinesSold: 0 })
	assert.equal(runtime.snapshotStore.created.length, 3)
	runtime.dispose()
}

async function testSkipAndReplaceChoices() {
	const skipRuntime = loadRuntime()
	const skippedConflict = skipRuntime.game.seed('pinhole', [10, 10], {
		par: { marker: 'keep-me' }
	})
	const mixedBlueprint = blueprint([
		{ name: 'silo', position: [0, 0] },
		{ name: 'silo', position: [1, 0] }
	])
	const skip = await skipRuntime.placement.place({
		blueprint: mixedBlueprint,
		target: [10, 10],
		replaceConflicts: false,
		input: 'mouse'
	})
	assert.equal(skip.executed, true)
	assert.equal(skipRuntime.game.entityAtCoordinates([10, 10]), skippedConflict)
	assert.equal(skipRuntime.game.entityAtCoordinates([11, 10]).name, 'silo')
	assert.deepEqual(skipRuntime.game.stats, { machinesBuild: 1, machinesSold: 0 })
	skipRuntime.dispose()

	const replaceRuntime = loadRuntime()
	replaceRuntime.game.seed('pinhole', [20, 20], {
		par: { marker: 'restore-me' }
	})
	const beforeResources = replaceRuntime.game.resources.slice()
	const replace = await replaceRuntime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [20, 20],
		replaceConflicts: true,
		input: 'mouse'
	})
	assert.equal(replace.executed, true)
	assert.equal(replaceRuntime.game.entityAtCoordinates([20, 20]).name, 'silo')
	assert.deepEqual(replaceRuntime.game.resources, [109, 98])
	assert.deepEqual(replaceRuntime.game.stats, { machinesBuild: 1, machinesSold: 1 })

	const undo = await replaceRuntime.placement.undo('keyboard')
	assert.equal(undo.executed, true)
	const restored = replaceRuntime.game.entityAtCoordinates([20, 20])
	assert.equal(restored.name, 'pinhole')
	assert.equal(restored.marker, 'restore-me')
	assert.deepEqual(replaceRuntime.game.resources, beforeResources)
	assert.deepEqual(replaceRuntime.game.stats, { machinesBuild: 0, machinesSold: 0 })

	const redo = await replaceRuntime.placement.redo('keyboard')
	assert.equal(redo.executed, true)
	assert.equal(replaceRuntime.game.entityAtCoordinates([20, 20]).name, 'silo')
	assert.deepEqual(replaceRuntime.game.resources, [109, 98])
	replaceRuntime.dispose()
}

async function testNoWriteBeforeSnapshotAndUnsafeClassification() {
	const insufficient = loadRuntime({ resources: [0, 0] })
	const insufficientResult = await insufficient.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [1, 1]
	})
	assert.equal(insufficientResult.executed, false)
	assert.equal(insufficientResult.error.code, 'INSUFFICIENT_RESOURCES')
	assert.equal(insufficient.snapshotStore.created.length, 0)
	assert.deepEqual(insufficient.game.entityNames(), [])
	assert.deepEqual(insufficient.game.resources, [0, 0])
	insufficient.dispose()

	const pureSkip = loadRuntime()
	const original = pureSkip.game.seed('pinhole', [2, 2])
	const skipResult = await pureSkip.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [2, 2],
		replaceConflicts: false
	})
	assert.equal(skipResult.executed, false)
	assert.equal(skipResult.error.code, 'NOTHING_TO_CHANGE')
	assert.equal(pureSkip.snapshotStore.created.length, 0)
	assert.equal(pureSkip.game.entityAtCoordinates([2, 2]), original)
	pureSkip.dispose()

	const unsafe = loadRuntime()
	const modded = unsafe.game.seed('modded', [3, 3])
	const assessment = unsafe.placement.assessEntity(modded)
	assert.equal(assessment.safe, false)
	assert.equal(assessment.reason, 'unsupported-type')
	const unsafePlan = await unsafe.planner.build(
		unsafe.game,
		blueprint([{ name: 'silo', position: [0, 0] }]),
		[3, 3],
		{
			includeDynamicConflicts: true,
			canReplaceEntity(entity) {
				return unsafe.placement.assessEntity(entity)
			}
		}
	)
	assert.equal(unsafePlan.records[0].status, 'blocked')
	assert.equal(unsafePlan.records[0].reason, 'unsafe-replacement')
	const unsafeResult = await unsafe.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [3, 3],
		replaceConflicts: true
	})
	assert.equal(unsafeResult.executed, false)
	assert.equal(unsafe.snapshotStore.created.length, 0)
	assert.equal(unsafe.game.entityAtCoordinates([3, 3]), modded)
	unsafe.dispose()
}

async function testBlockedCountsAndSurgePlacement() {
	const blocked = loadRuntime()
	const cube = blocked.game.seed('cube', [4, 4], { indestructible: true })
	const blockedPlan = await blocked.planner.build(
		blocked.game,
		blueprint([{ name: 'silo', position: [0, 0] }]),
		[4, 4],
		{
			includeDynamicConflicts: true,
			canReplaceEntity(entity) {
				return blocked.placement.assessEntity(entity)
			}
		}
	)
	assert.equal(blockedPlan.records[0].status, 'blocked')
	assert.equal(blockedPlan.records[0].reason, 'indestructible')
	assert.equal(Object.hasOwn(blockedPlan.guard.counts, 'silo'), true)
	assert.equal(Object.hasOwn(blockedPlan.guard.counts, 'cube'), false)
	blocked.game.entitiesInGame.cube += 10
	const blockedInspection = blocked.planner.inspect(blocked.game, blockedPlan.guard)
	assert.equal(blockedInspection.valid, true)
	assert.equal(blockedInspection.reason, 'valid')
	assert.equal(blocked.game.entityAtCoordinates([4, 4]), cube)

	blocked.game.seed('pinhole', [6, 6])
	const conflictPlan = await blocked.planner.build(
		blocked.game,
		blueprint([{ name: 'silo', position: [0, 0] }]),
		[6, 6],
		{
			includeDynamicConflicts: true,
			canReplaceEntity(entity) {
				return blocked.placement.assessEntity(entity)
			}
		}
	)
	assert.equal(conflictPlan.records[0].status, 'conflict')
	assert.equal(Object.hasOwn(conflictPlan.guard.counts, 'pinhole'), true)
	blocked.game.entitiesInGame.pinhole += 1
	const conflictInspection = blocked.planner.inspect(blocked.game, conflictPlan.guard)
	assert.equal(conflictInspection.valid, false)
	assert.equal(conflictInspection.reason, 'counts')
	blocked.dispose()

	const runtime = loadRuntime()
	const surge = runtime.game.seed('surge', [5, 5], {
		indestructible: true,
		resources: [3, 4],
		rayNumber: 4,
		grade: 2,
		colors: ['#abc'],
		type: 1,
		maxLife: 99,
		life: 88
	})
	const surgeBlueprint = blueprint([{ name: 'silo', position: [0, 0] }])
	const surgePlan = await runtime.planner.build(
		runtime.game,
		surgeBlueprint,
		[5, 5],
		{
			includeDynamicConflicts: true,
			canReplaceEntity(entity) {
				return runtime.placement.assessEntity(entity)
			}
		}
	)
	assert.equal(surgePlan.records[0].status, 'buildable')
	assert.equal(surgePlan.records[0].reason, 'empty')
	assert.equal(surgePlan.guard.cells[0].entity, null)
	assert.equal(Object.hasOwn(surgePlan.guard.counts, 'surge'), false)
	runtime.game.entitiesInGame.surge += 10
	const surgeInspection = runtime.planner.inspect(runtime.game, surgePlan.guard)
	assert.equal(surgeInspection.valid, true)
	assert.equal(surgeInspection.reason, 'valid')
	runtime.game.entitiesInGame.surge -= 10

	const beforeResources = runtime.game.resources.slice()
	runtime.snapshotStore.onCreate = function () {
		runtime.snapshotStore.onCreate = null
		surge.life = 77
	}
	const placed = await runtime.placement.place({
		blueprint: surgeBlueprint,
		target: [5, 5],
		input: 'mouse'
	})
	assert.equal(placed.executed, true, JSON.stringify(placed))
	assert.equal(runtime.game.entityAtCoordinates([5, 5]).name, 'silo')
	assert.equal(runtime.game.stuff.includes(surge), false)
	assert.equal(runtime.game.entitiesInGame.surge, 0)
	assert.deepEqual(runtime.game.resources, [90, 98])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 1, machinesSold: 0 })

	const undo = await runtime.placement.undo('keyboard')
	assert.equal(undo.executed, true)
	const restored = runtime.game.entityAtCoordinates([5, 5])
	assert.equal(restored.name, 'surge')
	assert.deepEqual(restored.resources, [3, 4])
	assert.equal(restored.rayNumber, 4)
	assert.equal(restored.grade, 2)
	assert.equal(restored.type, 1)
	assert.equal(restored.maxLife, 99)
	assert.equal(restored.life, 77)
	assert.equal(runtime.game.entitiesInGame.surge, 1)
	assert.deepEqual(runtime.game.resources, beforeResources)
	assert.deepEqual(runtime.game.stats, { machinesBuild: 0, machinesSold: 0 })

	const redo = await runtime.placement.redo('keyboard')
	assert.equal(redo.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([5, 5]).name, 'silo')
	assert.equal(runtime.game.entitiesInGame.surge, 0)
	assert.deepEqual(runtime.game.resources, [90, 98])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 1, machinesSold: 0 })
	runtime.dispose()
}

async function testMultiCellConflictIsRemovedOnce() {
	const runtime = loadRuntime()
	runtime.game.codex.entities.pinhole.entitySpan = 1
	runtime.game.seed('pinhole', [60, 60], {
		par: { marker: 'multi-cell' }
	})
	const result = await runtime.placement.place({
		blueprint: blueprint([
			{ name: 'silo', position: [0, 0] },
			{ name: 'silo', position: [1, 0] }
		]),
		target: [60, 60],
		replaceConflicts: true
	})
	assert.equal(result.executed, true)
	assert.deepEqual(runtime.game.entityNames(), ['silo@60,60', 'silo@61,60'])
	assert.deepEqual(runtime.game.resources, [89, 94])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 2, machinesSold: 1 })

	const undo = await runtime.placement.undo('keyboard')
	assert.equal(undo.executed, true)
	assert.deepEqual(runtime.game.entityNames(), ['pinhole@60,60'])
	assert.equal(runtime.game.entityAtCoordinates([59, 59]).name, 'pinhole')
	assert.equal(runtime.game.entityAtCoordinates([61, 61]).name, 'pinhole')
	assert.deepEqual(runtime.game.resources, [100, 100])
	assert.deepEqual(runtime.game.stats, { machinesBuild: 0, machinesSold: 0 })
	runtime.dispose()
}

async function testPostSnapshotPriceRevalidation() {
	const runtime = loadRuntime()
	const beforeResources = runtime.game.resources.slice()
	runtime.snapshotStore.onCreate = function () {
		runtime.snapshotStore.onCreate = null
		runtime.game.seed('silo', [90, 90])
	}
	const result = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [70, 70]
	})
	assert.equal(result.executed, false)
	assert.equal(result.error.code, 'PRICE_CHANGED')
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(runtime.game.entityAtCoordinates([70, 70]), null)
	assert.equal(runtime.game.entityAtCoordinates([90, 90]).name, 'silo')
	assert.deepEqual(runtime.game.resources, beforeResources)
	assert.equal(runtime.transactions.snapshot().undoCount, 0)
	runtime.dispose()
}

async function testPostSnapshotReplacementStateRevalidation() {
	const runtime = loadRuntime()
	const conflict = runtime.game.seed('pinhole', [72, 72], {
		par: { marker: 'before-snapshot' }
	})
	const beforeResources = runtime.game.resources.slice()
	runtime.snapshotStore.onCreate = function () {
		runtime.snapshotStore.onCreate = null
		conflict.par.marker = 'changed-during-snapshot'
	}
	const result = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [72, 72],
		replaceConflicts: true
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(runtime.game.entityAtCoordinates([72, 72]).name, 'silo')
	assert.equal(runtime.transactions.snapshot().undoCount, 1)
	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([72, 72]).name, 'pinhole')
	assert.equal(runtime.game.entityAtCoordinates([72, 72]).marker, 'changed-during-snapshot')
	assert.deepEqual(runtime.game.resources, beforeResources)
	runtime.dispose()
}

async function testCreativeFreePlacement() {
	const runtime = loadRuntime({
		creative: true,
		resources: [0, 0]
	})
	const before = runtime.game.resources.slice()
	const result = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [7, 8],
		input: 'keyboard'
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.game.entityAtCoordinates([7, 8]).name, 'silo')
	assert.deepEqual(runtime.game.resources, before)
	const undo = await runtime.placement.undo('keyboard')
	assert.equal(undo.executed, true)
	assert.deepEqual(runtime.game.resources, before)
	runtime.dispose()
}

async function testAtomicRollbackAndExternalChangeGuard() {
	const rollbackRuntime = loadRuntime()
	const beforeResources = rollbackRuntime.game.resources.slice()
	rollbackRuntime.game.failAddAt = rollbackRuntime.game.addCalls + 2
	const failed = await rollbackRuntime.placement.place({
		blueprint: blueprint([
			{ name: 'silo', position: [0, 0] },
			{ name: 'silo', position: [1, 0] }
		]),
		target: [30, 30]
	})
	assert.equal(failed.executed, false)
	assert.equal(failed.error.code, 'APPLY_FAILED')
	assert.deepEqual(rollbackRuntime.game.entityNames(), [])
	assert.deepEqual(rollbackRuntime.game.resources, beforeResources)
	assert.deepEqual(rollbackRuntime.game.stats, { machinesBuild: 0, machinesSold: 0 })
	assert.equal(rollbackRuntime.transactions.snapshot().undoCount, 0)
	assert.equal(rollbackRuntime.transactions.snapshot().terminalBlockedReason, null)
	assert.equal(rollbackRuntime.snapshotStore.created.length, 1)
	assert.deepEqual(rollbackRuntime.snapshotStore.removed, [])
	rollbackRuntime.dispose()

	const externalRuntime = loadRuntime()
	const placed = await externalRuntime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [40, 40]
	})
	assert.equal(placed.executed, true)
	externalRuntime.game.clearCell([40, 40])
	const intruder = externalRuntime.game.seed('pinhole', [40, 40])
	const snapshotCount = externalRuntime.snapshotStore.created.length
	const undo = await externalRuntime.placement.undo('keyboard')
	assert.equal(undo.executed, false)
	assert.equal(undo.error.code, 'EXTERNAL_CHANGE')
	assert.equal(externalRuntime.snapshotStore.created.length, snapshotCount)
	assert.equal(externalRuntime.game.entityAtCoordinates([40, 40]), intruder)
	assert.equal(externalRuntime.transactions.snapshot().undoCount, 1)
	externalRuntime.dispose()
}

async function testRollbackFailureEntersTerminalBlock() {
	const runtime = loadRuntime()
	runtime.game.failAddAt = runtime.game.addCalls + 2
	runtime.game.throwOnClear = true
	const result = await runtime.placement.place({
		blueprint: blueprint([
			{ name: 'silo', position: [0, 0] },
			{ name: 'silo', position: [1, 0] }
		]),
		target: [80, 80]
	})
	assert.equal(result.executed, false)
	assert.equal(runtime.transactions.snapshot().terminalBlockedReason, 'ROLLBACK_FAILED')
	assert.equal(runtime.placement.snapshot().phase, 'blocked')
	assert.equal(runtime.placement.snapshot().terminalBlockedReason, 'ROLLBACK_FAILED')
	const snapshotCount = runtime.snapshotStore.created.length
	const blocked = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [82, 82]
	})
	assert.equal(blocked.executed, false)
	assert.equal(blocked.error.code, 'ROLLBACK_FAILED')
	assert.equal(runtime.snapshotStore.created.length, snapshotCount)
	runtime.dispose()
}

async function testUndoAffordabilityRetainsHistory() {
	const runtime = loadRuntime({ resources: [20, 20] })
	runtime.game.seed('pinhole', [50, 50])
	const placed = await runtime.placement.place({
		blueprint: blueprint([{ name: 'silo', position: [0, 0] }]),
		target: [50, 50],
		replaceConflicts: true
	})
	assert.equal(placed.executed, true)
	assert.deepEqual(runtime.game.resources, [29, 18])
	runtime.game.resources[0] = 0
	const snapshotCount = runtime.snapshotStore.created.length
	const undo = await runtime.placement.undo('keyboard')
	assert.equal(undo.executed, false)
	assert.equal(undo.error.code, 'INSUFFICIENT_RESOURCES')
	assert.equal(runtime.snapshotStore.created.length, snapshotCount)
	assert.equal(runtime.game.entityAtCoordinates([50, 50]).name, 'silo')
	assert.equal(runtime.transactions.snapshot().undoCount, 1)
	assert.equal(runtime.transactions.snapshot().redoCount, 0)
	runtime.dispose()
}

async function testPreviewCommandLockLifecycle() {
	const runtime = loadPreviewRuntime()
	const sourceBlueprint = blueprint([{ name: 'silo', position: [0, 0] }])
	runtime.session.emit({
		attemptId: 1,
		blueprint: sourceBlueprint,
		lastResult: {
			attemptId: 1,
			status: 'captured'
		}
	})
	await flush()
	let state = runtime.controller.snapshot()
	assert.equal(state.active, true)
	assert.deepEqual(Array.from(state.target), [1, 1])
	assert.deepEqual(Array.from(state.plan.target), [1, 1])

	assert.equal(runtime.controller.setPinned(true, 'test-permanent-pin'), true)
	runtime.game.hoveredCell = [9, 9]
	runtime.setRetryTarget([5, 6])
	const permanentToken = await runtime.controller.lockCommandTarget([5, 6], 'test-command')
	assert.ok(permanentToken)
	state = runtime.controller.snapshot()
	assert.equal(state.commandLocked, true)
	assert.equal(state.pinned, true)
	assert.deepEqual(Array.from(state.target), [5, 6])
	assert.deepEqual(Array.from(state.plan.target), [5, 6])
	assert.ok(
		runtime.buildTargets.filter(target => target[0] === 5 && target[1] === 6).length >= 2,
		'command lock must await the final automatic replan retry'
	)
	await runtime.controller.releaseCommandTarget(permanentToken, 'test-command-release')
	state = runtime.controller.snapshot()
	assert.equal(state.commandLocked, false)
	assert.equal(state.pinned, true)
	assert.deepEqual(Array.from(state.target), [1, 1])
	assert.deepEqual(Array.from(state.plan.target), [1, 1])

	assert.equal(runtime.controller.setPinned(false, 'test-following'), true)
	runtime.game.hoveredCell = [10, 10]
	const followingToken = await runtime.controller.lockCommandTarget([7, 7], 'test-follow-command')
	assert.ok(followingToken)
	runtime.game.hoveredCell = [11, 11]
	await runtime.controller.releaseCommandTarget(followingToken, 'test-follow-release')
	state = runtime.controller.snapshot()
	assert.equal(state.pinned, false)
	assert.equal(state.temporaryPinned, false)
	assert.deepEqual(Array.from(state.target), [11, 11])
	assert.deepEqual(Array.from(state.plan.target), [11, 11])

	runtime.windowHub.dispatch('keydown', keyEvent('AltLeft', 'Alt'))
	state = runtime.controller.snapshot()
	assert.equal(state.temporaryPinned, true)
	const temporaryTarget = Array.from(state.target)
	const temporaryToken = await runtime.controller.lockCommandTarget([12, 12], 'test-alt-command')
	assert.ok(temporaryToken)
	runtime.game.hoveredCell = [13, 13]
	await runtime.controller.releaseCommandTarget(temporaryToken, 'test-alt-release')
	state = runtime.controller.snapshot()
	assert.equal(state.pinned, false)
	assert.equal(state.temporaryPinned, true)
	assert.deepEqual(Array.from(state.target), temporaryTarget)
	assert.deepEqual(Array.from(state.plan.target), temporaryTarget)
	runtime.windowHub.dispatch('keyup', keyEvent('AltLeft', 'Alt'))
	runtime.dispose()
}

function testStaticUiLocalizationAndManifestContracts() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.5.0')
	assert.equal(manifest.entry.length, 35)
	assert.ok(manifest.entry.indexOf(PLACEMENT_SOURCE) > manifest.entry.indexOf(PLAN_SOURCE))
	assert.ok(manifest.entry.indexOf(PLACEMENT_SOURCE) < manifest.entry.indexOf('scripts/core/input-controller.js'))
	assert.ok(manifest.entry.indexOf(DIALOG_SOURCE) > manifest.entry.indexOf('scripts/ui/card-opacity.js'))
	assert.ok(manifest.entry.indexOf(DIALOG_SOURCE) < manifest.entry.indexOf(SHELL_SOURCE))

	const placementSource = source(PLACEMENT_SOURCE)
	const dialogSource = source(DIALOG_SOURCE)
	const shellSource = source(SHELL_SOURCE)
	const sessionSource = source(SESSION_SOURCE)
	const previewSource = source(PREVIEW_SOURCE)
	const i18nSource = source(I18N_SOURCE)
	const readme = source('README.md')

	assert.match(placementSource, /TRANSACTION_KIND = 'blueprint-placement'/)
	assert.match(placementSource, /transactions\.registerAdapter\(TRANSACTION_KIND, adapter\)/)
	assert.match(placementSource, /includeDynamicConflicts:\s*true/)
	assert.match(placementSource, /replaceConflicts === true/)
	assert.match(placementSource, /RESTORABLE_NAMES/)
	assert.match(placementSource, /UNSAFE_REPLACEMENT/)
	assert.match(placementSource, /INSUFFICIENT_RESOURCES/)
	assert.match(placementSource, /PRICE_CHANGED/)
	assert.match(placementSource, /sameEconomy\(currentEconomy, payload\.economy\)/)
	assert.match(placementSource, /rollbackMutations\(state\)/)

	assert.match(dialogSource, /Symbol\.for\('cattail\.world-editor\.dialogs'\)/)
	assert.match(dialogSource, /setAttribute\('role', 'dialog'\)/)
	assert.match(dialogSource, /event\.key === 'Escape'/)
	assert.match(dialogSource, /event\.key !== 'Tab'/)
	assert.match(dialogSource, /window\.addEventListener\(type, handleWindowKeyEvent, true\)/)
	assert.match(dialogSource, /window\.removeEventListener\(type, handleWindowKeyEvent, true\)/)
	assert.match(dialogSource, /event\.target === element/)
	assert.match(dialogSource, /handle\.close\('dialog-backdrop'\)/)
	assert.match(dialogSource, /releaseGameKeyboardState\(game\)/)
	assert.match(dialogSource, /previousFocus/)
	assert.match(dialogSource, /setBusy\(next\)/)
	assert.match(dialogSource, /handle\.close\('dialog-replaced', true\)/)
	assert.match(shellSource, /globalThis\[DIALOGS_KEY\]/)
	assert.match(shellSource, /dialogs\.create\(/)

	assert.match(sessionSource, /placeButton\.dataset\.worldEditorBlueprintAction = 'place'/)
	assert.match(sessionSource, /previewState\.effectivePinned/)
	assert.match(sessionSource, /event\?\.code === 'KeyV'/)
	assert.match(sessionSource, /placeFromHotkey\(target\)/)
	const pasteShortcutStart = sessionSource.indexOf('const pasteKey =')
	const captureShortcutStart = sessionSource.indexOf(
		"!(event?.code === 'KeyC' || key === 'c')",
		pasteShortcutStart
	)
	assert.ok(pasteShortcutStart >= 0 && captureShortcutStart > pasteShortcutStart)
	const pasteShortcutSource = sessionSource.slice(pasteShortcutStart, captureShortcutStart)
	assert.doesNotMatch(pasteShortcutSource, /!event\?\.altKey/)
	assert.match(pasteShortcutSource, /!event\?\.shiftKey/)
	assert.match(sessionSource, /if \(!plan\) return null/)
	assert.match(sessionSource, /placementOptionsTitle/)
	assert.match(sessionSource, /placementReplaceOption/)
	assert.match(sessionSource, /placementSyncEmptyOption/)
	assert.match(sessionSource, /refreshNow\?\.\('placement-cancelled'\)/)
	assert.match(sessionSource, /cattail-world-editor-dialog__button--danger/)
	assert.match(previewSource, /lockCommandTarget\(position,\s*reason\)/)
	assert.match(previewSource, /releaseCommandTarget\(token,\s*reason\)/)
	assert.match(previewSource, /commandLocked:\s*!!commandLock/)
	assert.match(previewSource, /if \(pending === lastPlanPromise\) break/)

	for (const key of [
		'blueprintPlace',
		'placementCtrlVHint',
		'placementConflictTitle',
		'placementConflictMessage',
		'placementSkipConflicts',
		'placementReplaceConflicts',
		'placementOptionsTitle',
		'placementOptionsMessage',
		'placementReplaceOption',
		'placementSyncEmptyOption',
		'placementOptionsSummary',
		'placementConfirmAction',
		'placementCancel',
		'placementPlacing',
		'placementSuccess',
		'placementFailed',
		'placementBlocked',
		'placementNothingToBuild'
	]) {
		assert.match(i18nSource, new RegExp('\\b' + key + '\\b'))
	}
	assert.match(readme, /4B-1a/)
	assert.match(readme, /Ctrl\+V/)
	assert.match(readme, /blueprint-placement/)
}

async function run() {
	await testInitializationAndBasicHistory()
	await testSkipAndReplaceChoices()
	await testNoWriteBeforeSnapshotAndUnsafeClassification()
	await testBlockedCountsAndSurgePlacement()
	await testMultiCellConflictIsRemovedOnce()
	await testPostSnapshotPriceRevalidation()
	await testPostSnapshotReplacementStateRevalidation()
	await testCreativeFreePlacement()
	await testAtomicRollbackAndExternalChangeGuard()
	await testRollbackFailureEntersTerminalBlock()
	await testUndoAffordabilityRetainsHistory()
	await testPreviewCommandLockLifecycle()
	testStaticUiLocalizationAndManifestContracts()
	console.log(
		'World Editor 4B-1a verification passed: safe placement, snapshots, economy, conflict choices, rollback, history guards, shared dialogs, Ctrl+V, localization, and manifest.'
	)
}

module.exports = {
	MOD_ROOT,
	source,
	createGame,
	blueprint,
	loadRuntime,
	cellKey
}

if (require.main === module) {
	run().catch(error => {
		console.error(error)
		process.exitCode = 1
	})
}
