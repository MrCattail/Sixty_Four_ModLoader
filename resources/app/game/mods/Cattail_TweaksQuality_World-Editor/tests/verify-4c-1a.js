const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const DELETE_SOURCE = 'scripts/core/selection-delete.js'
const DELETE_UI_SOURCE = 'scripts/ui/selection-delete-ui.js'
const ANALYSIS_SOURCE = 'scripts/core/selection-analysis.js'
const SHARED_SOURCE = 'scripts/core/shared.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function range(minU, maxU, minV, maxV) {
	return {
		start: [minU, minV],
		end: [maxU, maxV],
		minU,
		maxU,
		minV,
		maxV,
		width: maxU - minU + 1,
		height: maxV - minV + 1
	}
}

function definition(price, options = {}) {
	return {
		canPurchase: options.canPurchase !== false,
		price: price.slice(),
		priceExponent: options.priceExponent === undefined ? 1 : options.priceExponent,
		entitySpan: options.entitySpan || 0,
		onlyone: options.onlyone === true,
		isUpgradeTo: options.isUpgradeTo
	}
}

function createGame(options = {}) {
	const cells = new Map()
	const game = {
		plane: 0,
		resources: (options.resources || [100]).slice(),
		eraserType: options.eraserType || 0,
		entitiesInGame: {},
		onlyones: {},
		stuff: [],
		stats: {
			machinesSold: 0,
			timeSinceLastDelete: options.timeSinceLastDelete ?? 42
		},
		clearCalls: 0,
		addCalls: 0,
		sounds: [],
		codex: {
			entities: {
				conductor: definition([10], { onlyone: true }),
				vault: definition([20], { entitySpan: 1 }),
				pump: definition([8]),
				pump2: definition([12]),
				gradient: definition([16]),
				stabilizer: definition([20]),
				eraser: definition([1]),
				eraser2: definition([2]),
				eraser3: definition([3]),
				cube: definition([0], { canPurchase: false }),
				modded: definition([4])
			},
			resources: [
				{ name: 'stone' }
			]
		},
		shop: {
			updateElements() {},
			check() {}
		},
		processMousemove2() {},
		entityAtCoordinates(position) {
			return cells.get(cellKey(position)) || null
		},
		getEntityString(entity) {
			if (entity.saveUnavailable) throw new Error('save unavailable')
			const par = clone(entity.par || {})
			for (const key of Object.keys(entity)) {
				if (['name', 'position', 'entitySpan', 'par', 'init'].includes(key)) continue
				if (typeof entity[key] !== 'function') par[key] = clone(entity[key])
			}
			return {
				name: entity.name,
				position: entity.position.slice(),
				par
			}
		},
		addEntity(name, position, misc) {
			this.addCalls += 1
			const entity = {
				name,
				position: position.slice(),
				entitySpan: Number(this.codex.entities[name]?.entitySpan) || 0,
				par: {},
				init() {}
			}
			if (misc && typeof misc === 'object') Object.assign(entity, clone(misc))
			this.stuff.push(entity)
			this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
			writeEntityCells(cells, entity)
			return entity
		},
		clearCell(position) {
			this.clearCalls += 1
			if (this.failClearAt && this.clearCalls === this.failClearAt) {
				throw new Error('forced clear failure')
			}
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
		playSound(name, pan) {
			this.sounds.push({ name, pan })
		},
		uvToXYUntranslated(position) {
			return position.slice()
		},
		getPanValueFromX(value) {
			return value / 10
		},
		makeReadable(value) {
			return String(value)
		}
	}

	game.spawn = function (name, position, properties = {}) {
		const entity = {
			name,
			position: position.slice(),
			entitySpan: Number(this.codex.entities[name]?.entitySpan) || 0,
			par: clone(properties.par || {}),
			init() {}
		}
		for (const key of Object.keys(properties)) {
			if (key !== 'par') entity[key] = clone(properties[key])
		}
		this.stuff.push(entity)
		this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
		writeEntityCells(cells, entity)
		return entity
	}
	return game
}

function writeEntityCells(cells, entity) {
	const span = Number(entity.entitySpan) || 0
	for (let v = entity.position[1] - span; v <= entity.position[1] + span; v += 1) {
		for (let u = entity.position[0] - span; u <= entity.position[0] + span; u += 1) {
			cells.set(cellKey([u, v]), entity)
		}
	}
}

function cellKey(position) {
	return position[0] + ':' + position[1]
}

function clone(value) {
	if (value === undefined) return undefined
	return JSON.parse(JSON.stringify(value))
}

function createSelection(entries) {
	let revision = 1
	let selections = entries.map((entry, index) => ({
		id: entry.id || index + 1,
		range: clone(entry.range),
		plane: entry.plane || 0,
		primary: index === entries.length - 1
	}))
	const listeners = new Set()
	const service = {
		game: null,
		preview: false,
		moving: false,
		resizing: false,
		snapshot() {
			const primary = selections[selections.length - 1] || null
			return {
				selections: clone(selections),
				selectionCount: selections.length,
				primaryId: primary?.id || null,
				selectedRange: clone(primary?.range || null),
				previewRange: this.preview ? clone(primary?.range || null) : null,
				plane: primary?.plane ?? null,
				revision
			}
		},
		hasPreview() {
			return this.preview
		},
		isMoving() {
			return this.moving
		},
		isResizing() {
			return this.resizing
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(this.snapshot())
			return () => listeners.delete(listener)
		},
		bump() {
			revision += 1
			for (const listener of listeners) listener(this.snapshot())
		},
		setEntries(next) {
			selections = next.map((entry, index) => ({
				id: entry.id || index + 1,
				range: clone(entry.range),
				plane: entry.plane || 0,
				primary: index === next.length - 1
			}))
			this.bump()
		}
	}
	return service
}

function createRuntime() {
	const listeners = new Set()
	const cleanups = []
	let state = { active: true }
	return {
		game: null,
		snapshot() {
			return state
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(state)
			return () => listeners.delete(listener)
		},
		addCleanup(callback) {
			cleanups.push(callback)
		},
		setActive(active) {
			state = { active: !!active }
			for (const listener of listeners) listener(state)
		},
		dispose() {
			for (const callback of cleanups.splice(0)) callback()
		}
	}
}

function createPlacement(game) {
	const safeNames = new Set(['conductor', 'vault', 'pump', 'pump2', 'gradient', 'stabilizer'])
	return {
		game,
		assessEntity(entity) {
			if (!entity) return { safe: false, reason: 'missing' }
			if (entity.name === 'cube') return { safe: false, reason: 'unsupported-type' }
			if (!safeNames.has(entity.name)) return { safe: false, reason: 'unsupported-type' }
			if (entity.indestructible) return { safe: false, reason: 'indestructible' }
			if (game.transportedEntity === entity) return { safe: false, reason: 'being-relocated' }
			if (
				['pump', 'pump2', 'gradient'].includes(entity.name) &&
				(Number(game.entitiesInGame.pump) || 0) +
					(Number(game.entitiesInGame.pump2) || 0) +
					(Number(game.entitiesInGame.gradient) || 0) < 2
			) {
				return { safe: false, reason: 'last-extractor' }
			}
			try {
				game.getEntityString(entity)
			} catch (error) {
				return { safe: false, reason: 'save-unavailable' }
			}
			return { safe: true, reason: 'restorable' }
		}
	}
}

function createTransactions() {
	const listeners = new Set()
	const adapters = new Map()
	const undoStack = []
	const redoStack = []
	let busy = false
	let sequence = 0
	const service = {
		game: null,
		snapshotCount: 0,
		beforeSecondPreflight: null,
		snapshot() {
			return {
				ready: true,
				busy,
				terminalBlockedReason: null,
				undoCount: undoStack.length,
				redoCount: redoStack.length,
				canUndo: !busy && undoStack.length > 0,
				canRedo: !busy && redoStack.length > 0
			}
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(this.snapshot())
			return () => listeners.delete(listener)
		},
		registerAdapter(kind, adapter) {
			adapters.set(kind, adapter)
			return () => adapters.delete(kind)
		},
		isBusy() {
			return busy
		},
		async execute(request) {
			const adapter = adapters.get(request.kind)
			if (!adapter) return failure('forward', 'ADAPTER_UNAVAILABLE')
			busy = true
			notify()
			const operationId = 'operation-' + (++sequence)
			const context = createContext(operationId, 'forward')
			let record
			let applied = false
			try {
				const prepared = await adapter.prepare(context, clone(request.payload))
				record = {
					id: 'transaction-' + sequence,
					kind: request.kind,
					input: request.input,
					plane: 0,
					summary: clone(prepared.summary),
					scope: clone(prepared.scope),
					payload: clone(prepared.payload)
				}
				await approve(adapter.preflight(context, record, 'forward'))
				record.before = clone(await adapter.capture(context, record))
				this.snapshotCount += 1
				this.beforeSecondPreflight?.()
				this.beforeSecondPreflight = null
				await approve(adapter.preflight(context, record, 'forward'))
				assert.deepEqual(clone(await adapter.capture(context, record)), record.before)
				applied = true
				await adapter.apply(context, record, 'forward')
				record.after = clone(await adapter.capture(context, record))
				await approve(adapter.verify(context, record, 'forward'))
				undoStack.push(record)
				redoStack.length = 0
				return success('forward', record)
			} catch (error) {
				if (applied && record) {
					const restored = await adapter.restore(context, record, 'before')
					if (restored?.ok !== true) return failure('forward', 'ROLLBACK_FAILED', 'rollback failed')
					return failure('forward', error.code || 'APPLY_FAILED', error.message, 'rolled-back')
				}
				return failure('forward', error.code || 'PREFLIGHT_FAILED', error.message)
			} finally {
				busy = false
				notify()
			}
		},
		undo(options) {
			return history('undo', options)
		},
		redo(options) {
			return history('redo', options)
		},
		adapter(kind) {
			return adapters.get(kind)
		}
	}

	async function history(direction) {
		const sourceStack = direction === 'undo' ? undoStack : redoStack
		const targetStack = direction === 'undo' ? redoStack : undoStack
		const record = sourceStack[sourceStack.length - 1]
		if (!record) return failure(direction, direction === 'undo' ? 'NO_UNDO' : 'NO_REDO')
		const adapter = adapters.get(record.kind)
		busy = true
		notify()
		const operationId = 'operation-' + (++sequence)
		const context = createContext(operationId, direction)
		let applied = false
		try {
			await approve(adapter.preflight(context, record, direction))
			const expectedCurrent = direction === 'undo' ? record.after : record.before
			assert.deepEqual(clone(await adapter.capture(context, record)), expectedCurrent)
			service.snapshotCount += 1
			service.beforeSecondPreflight?.()
			service.beforeSecondPreflight = null
			await approve(adapter.preflight(context, record, direction))
			assert.deepEqual(clone(await adapter.capture(context, record)), expectedCurrent)
			applied = true
			await adapter.apply(context, record, direction)
			const expectedResult = direction === 'undo' ? record.before : record.after
			assert.deepEqual(clone(await adapter.capture(context, record)), expectedResult)
			await approve(adapter.verify(context, record, direction))
			sourceStack.pop()
			targetStack.push(record)
			return success(direction, record)
		} catch (error) {
			if (applied) {
				const target = direction === 'undo' ? 'after' : 'before'
				const restored = await adapter.restore(context, record, target)
				if (restored?.ok !== true) return failure(direction, 'ROLLBACK_FAILED')
				return failure(direction, error.code || 'APPLY_FAILED', error.message, 'rolled-back')
			}
			return failure(direction, error.code || 'PREFLIGHT_FAILED', error.message)
		} finally {
			busy = false
			notify()
		}
	}

	function createContext(operationId, direction) {
		return {
			operationId,
			direction,
			isCurrent() {
				return true
			}
		}
	}

	function notify() {
		for (const listener of listeners) listener(service.snapshot())
	}

	return service
}

function approve(promise) {
	return Promise.resolve(promise).then(result => {
		if (result?.ok === true) return
		const error = new Error(result?.message || result?.code || 'rejected')
		error.code = result?.code || 'PREFLIGHT_FAILED'
		throw error
	})
}

function success(direction, record) {
	return {
		accepted: true,
		executed: true,
		direction,
		reason: 'complete',
		transaction: {
			id: record.id,
			kind: record.kind,
			summary: clone(record.summary)
		},
		snapshotId: 'snapshot',
		error: null
	}
}

function failure(direction, code, message, reason) {
	return {
		accepted: true,
		executed: false,
		direction,
		reason: reason || String(code).toLowerCase().replaceAll('_', '-'),
		transaction: null,
		snapshotId: null,
		error: {
			code,
			message: message || code
		}
	}
}

function createEnvironment(options = {}) {
	const game = createGame(options)
	const selection = createSelection(options.selections || [
		{ range: range(0, 0, 0, 0) }
	])
	selection.game = game
	const runtime = createRuntime()
	runtime.game = game
	const transactions = createTransactions()
	transactions.game = game
	const placement = createPlacement(game)
	const creative = {
		game,
		snapshot() {
			return {
				ready: true,
				creativeMode: options.creative === true
			}
		}
	}
	const analysis = {
		game,
		refreshCount: 0,
		refresh() {
			this.refreshCount += 1
			return true
		}
	}
	const preview = {
		active: options.previewActive !== false,
		refreshCount: 0,
		snapshot() {
			return { active: this.active }
		},
		async refreshNow() {
			this.refreshCount += 1
			return { ok: true }
		}
	}
	const events = new Map()
	const cleanups = []
	const api = {
		on(name, callback) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(callback)
		},
		storage: {},
		id: 'Cattail_TweaksQuality_World-Editor'
	}
	const definitions = []
	const sandbox = {
		console: {
			info() {},
			warn() {},
			error() {}
		},
		ModLoader: {
			register(definitionValue) {
				definitions.push(definitionValue)
			}
		},
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Date,
		Error,
		TypeError,
		setTimeout,
		clearTimeout,
		requestAnimationFrame(callback) {
			return setTimeout(callback, 0)
		}
	}
	sandbox.globalThis = sandbox
	sandbox[RUNTIME_KEY] = runtime
	sandbox[TRANSACTIONS_KEY] = transactions
	sandbox[SELECTION_KEY] = selection
	sandbox[PLACEMENT_KEY] = placement
	sandbox[CREATIVE_KEY] = creative
	sandbox[ANALYSIS_KEY] = analysis
	sandbox[PREVIEW_KEY] = preview
	vm.createContext(sandbox)
	vm.runInContext(source(DELETE_SOURCE), sandbox, { filename: DELETE_SOURCE })
	for (const definitionValue of definitions) definitionValue.init(api)
	for (const callback of events.get('afterGameInit') || []) callback({}, game)
	const deletion = sandbox[DELETE_KEY]
	assert.ok(deletion)
	cleanups.push(() => runtime.dispose())
	return {
		game,
		selection,
		runtime,
		transactions,
		placement,
		creative,
		analysis,
		preview,
		deletion,
		dispose() {
			for (const cleanup of cleanups) cleanup()
		}
	}
}

async function testUnionPlanningExecutionUndoRedo() {
	const env = createEnvironment({
		selections: [
			{ id: 1, range: range(0, 0, 0, 0) },
			{ id: 2, range: range(1, 1, 0, 0) },
			{ id: 3, range: range(5, 5, 5, 5) }
		]
	})
	const conductor = env.game.spawn('conductor', [0, 0], { channel: 3 })
	const vault = env.game.spawn('vault', [2, 0], { capacity: 9 })
	const cube = env.game.spawn('cube', [5, 5])
	env.game.onlyones.conductor = true

	const plan = await env.deletion.planSelections()
	assert.equal(plan.schema, 1)
	assert.equal(plan.source.kind, 'selection')
	assert.equal(plan.summary.sourceCellCount, 3)
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.summary.protectedCount, 1)
	assert.equal(plan.summary.crossBoundaryCount, 1)
	assert.deepEqual(clone(plan.removals.map(entry => entry.name)), ['conductor', 'vault'])
	assert.equal(plan.removals[1].crossBoundary, true)
	assert.equal(plan.protectedTargets[0].name, 'cube')
	assert.equal(plan.protectedTargets[0].reason, 'cube')
	assert.deepEqual(clone(plan.economy.delta), [13])
	assert.equal(plan.economy.steps.length, 4)
	assert.deepEqual(clone(plan.onlyonesBefore), { conductor: true, vault: false })
	assert.deepEqual(clone(plan.onlyonesAfter), { conductor: false, vault: false })

	const selectionBefore = env.selection.snapshot()
	const result = await env.deletion.execute(plan, 'keyboard')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(result.transaction.kind, 'selection-delete')
	assert.equal(result.transaction.summary.label, 'Selection contents deletion')
	assert.equal(env.transactions.snapshotCount, 1)
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([2, 0]), null)
	assert.equal(env.game.entityAtCoordinates([5, 5]), cube)
	assert.deepEqual(env.game.resources, [113])
	assert.equal(env.game.stats.machinesSold, 2)
	assert.equal(env.game.stats.timeSinceLastDelete, 0)
	assert.equal(env.game.onlyones.conductor, undefined)
	assert.deepEqual(env.selection.snapshot(), selectionBefore)
	assert.equal(env.game.sounds.length, 1)
	assert.equal(env.game.sounds[0].name, 'recycle')
	assert.equal(env.analysis.refreshCount, 1)
	assert.equal(env.preview.refreshCount, 1)
	const diagnostics = clone(env.deletion.diagnostics())
	assert.equal(diagnostics.version, 1)
	assert.equal(diagnostics.service.phase, 'success')
	assert.ok(diagnostics.events.some(entry => entry.event === 'execute.requested'))
	assert.ok(diagnostics.events.some(entry => entry.event === 'adapter.prepare.ready'))
	assert.ok(
		diagnostics.events.filter(entry => entry.event === 'adapter.preflight.ready').length >= 2
	)
	assert.equal(
		diagnostics.events.filter(entry => entry.event === 'apply.clear.before').length,
		2
	)
	assert.equal(
		diagnostics.events.filter(entry => entry.event === 'apply.clear.after' && entry.details.remaining === false).length,
		2
	)
	assert.ok(diagnostics.events.some(entry => entry.event === 'adapter.verify.complete'))
	assert.ok(diagnostics.events.some(entry => entry.event === 'execute.result' && entry.details.executed === true))
	assert.doesNotMatch(JSON.stringify(diagnostics.events), /\"save\"|\"par\"/)

	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true)
	assert.equal(env.transactions.snapshotCount, 2)
	assert.equal(env.game.entityAtCoordinates([0, 0]).channel, conductor.channel)
	assert.equal(env.game.entityAtCoordinates([2, 0]).capacity, vault.capacity)
	assert.deepEqual(env.game.resources, [100])
	assert.equal(env.game.stats.machinesSold, 0)
	assert.equal(env.game.stats.timeSinceLastDelete, 42)
	assert.equal(env.game.onlyones.conductor, true)
	assert.deepEqual(env.selection.snapshot(), selectionBefore)
	assert.equal(env.game.sounds.length, 1)
	assert.equal(env.analysis.refreshCount, 2)

	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(env.transactions.snapshotCount, 3)
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([2, 0]), null)
	assert.deepEqual(env.game.resources, [113])
	assert.equal(env.game.stats.machinesSold, 2)
	assert.equal(env.game.stats.timeSinceLastDelete, 0)
	assert.equal(env.game.sounds.length, 2)
	assert.equal(env.analysis.refreshCount, 3)
	env.dispose()
}

async function testProtectedEmptyEconomyAndCreativeRules() {
	const pumpEnv = createEnvironment({
		selections: [
			{ range: range(0, 1, 0, 0) }
		]
	})
	pumpEnv.game.spawn('pump', [0, 0])
	pumpEnv.game.spawn('gradient', [1, 0])
	const pumpPlan = await pumpEnv.deletion.planSelections()
	assert.equal(pumpPlan.summary.safeCount, 1)
	assert.equal(pumpPlan.summary.protectedCount, 1)
	assert.equal(pumpPlan.protectedTargets[0].reason, 'last-extractor')
	pumpEnv.dispose()

	const protectedEnv = createEnvironment({
		selections: [
			{ range: range(0, 1, 0, 0) }
		]
	})
	protectedEnv.game.spawn('cube', [0, 0])
	protectedEnv.game.spawn('modded', [1, 0])
	const protectedPlan = await protectedEnv.deletion.planSelections()
	assert.equal(protectedPlan.summary.safeCount, 0)
	assert.equal(protectedPlan.summary.protectedCount, 2)
	assert.deepEqual(
		clone(protectedPlan.protectedTargets.map(entry => entry.reason).sort()),
		['cube', 'unsupported-type']
	)
	const protectedResult = await protectedEnv.deletion.execute(protectedPlan, 'mouse')
	assert.equal(protectedResult.executed, false)
	assert.equal(protectedResult.error.code, 'NOTHING_SAFE')
	assert.equal(protectedEnv.transactions.snapshotCount, 0)
	assert.equal(protectedEnv.game.clearCalls, 0)
	protectedEnv.dispose()

	const poorEnv = createEnvironment({ resources: [0] })
	poorEnv.game.spawn('conductor', [0, 0])
	await assert.rejects(
		poorEnv.deletion.planSelections(),
		error => error.code === 'INSUFFICIENT_RESOURCES'
	)
	assert.equal(poorEnv.transactions.snapshotCount, 0)
	assert.equal(poorEnv.game.clearCalls, 0)
	poorEnv.dispose()

	const creativeEnv = createEnvironment({ resources: [0], creative: true })
	creativeEnv.game.spawn('conductor', [0, 0])
	const creativePlan = await creativeEnv.deletion.planSelections()
	assert.equal(creativePlan.economy.creative, true)
	assert.deepEqual(clone(creativePlan.economy.delta), [])
	assert.deepEqual(clone(creativePlan.economy.steps), [])
	const creativeResult = await creativeEnv.deletion.execute(creativePlan, 'mouse', { origin: 'cut' })
	assert.equal(creativeResult.executed, true)
	assert.equal(creativeResult.transaction.summary.label, 'Selection cut')
	assert.deepEqual(creativeEnv.game.resources, [0])
	creativeEnv.dispose()
}

async function testApplyFailureRollsBackEveryMutation() {
	const env = createEnvironment({
		selections: [
			{ range: range(0, 0, 0, 0) },
			{ range: range(4, 4, 0, 0) }
		]
	})
	env.game.spawn('conductor', [0, 0], { channel: 1 })
	env.game.spawn('conductor', [4, 0], { channel: 2 })
	env.game.onlyones.conductor = true
	const plan = await env.deletion.planSelections()
	assert.equal(plan.summary.safeCount, 2)
	env.game.failClearAt = 2
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, false)
	assert.equal(result.reason, 'rolled-back', JSON.stringify(result))
	assert.ok(env.game.entityAtCoordinates([0, 0]))
	assert.ok(env.game.entityAtCoordinates([4, 0]))
	assert.deepEqual(env.game.resources, [100])
	assert.equal(env.game.stats.machinesSold, 0)
	assert.equal(env.game.stats.timeSinceLastDelete, 42)
	assert.equal(env.game.onlyones.conductor, true)
	assert.equal(env.transactions.snapshot().undoCount, 0)
	assert.equal(env.transactions.snapshotCount, 1)
	env.dispose()
}

async function testTargetBindingReusableMasksAndCancellation() {
	const env = createEnvironment()
	env.game.spawn('conductor', [0, 0])
	const plan = await env.deletion.planSelections()
	env.transactions.beforeSecondPreflight = function () {
		env.selection.bump()
	}
	const changed = await env.deletion.execute(plan, 'keyboard')
	assert.equal(changed.executed, false)
	assert.equal(changed.error.code, 'TARGET_CHANGED')
	assert.equal(env.transactions.snapshotCount, 1)
	assert.equal(env.game.clearCalls, 0)
	assert.ok(env.game.entityAtCoordinates([0, 0]))

	const rangePlan = await env.deletion.planRanges([range(0, 0, 0, 0)], { plane: 0 })
	assert.equal(rangePlan.source.kind, 'ranges')
	assert.equal(rangePlan.summary.safeCount, 1)
	const cellPlan = await env.deletion.planCells([[0, 0], [0, 0]], { plane: 0 })
	assert.equal(cellPlan.source.kind, 'cells')
	assert.equal(cellPlan.summary.sourceCellCount, 1)
	assert.equal(cellPlan.summary.safeCount, 1)

	const cells = []
	for (let index = 0; index < 700; index += 1) cells.push([index + 20, 0])
	let checks = 0
	await assert.rejects(
		env.deletion.planCells(cells, {
			plane: 0,
			isCancelled() {
				checks += 1
				return checks > 520
			}
		}),
		error => error.code === 'INVALIDATED'
	)
	env.dispose()
}

async function testResourceGrowthDoesNotInvalidateStableEconomy() {
	const env = createEnvironment({ resources: [1e16] })
	env.game.spawn('conductor', [0, 0])
	const plan = await env.deletion.planSelections()
	assert.deepEqual(clone(plan.economy.delta), [4])
	env.game.resources[0] += 2
	const resourcesBeforeDelete = env.game.resources[0]
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.resources[0], resourcesBeforeDelete + 4)
	const diagnostics = clone(env.deletion.diagnostics())
	assert.ok(
		diagnostics.events.some(entry => (
			entry.event === 'adapter.prepare.rebuilt' &&
			entry.details.signatureMatch === true
		))
	)
	env.dispose()
}

async function testSignatureProbeIdentifiesChangedEntitySave() {
	const env = createEnvironment()
	const conductor = env.game.spawn('conductor', [0, 0], { channel: 1 })
	const plan = await env.deletion.planSelections()
	conductor.channel = 2
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, false)
	assert.equal(result.error.code, 'TARGET_CHANGED')
	const diagnostics = clone(env.deletion.diagnostics())
	const rebuilt = diagnostics.events.find(entry => (
		entry.event === 'adapter.prepare.rebuilt' &&
		entry.details.signatureMatch === false
	))
	assert.ok(rebuilt)
	assert.deepEqual(rebuilt.details.signatureDifference.changedComponents, ['removalSaves'])
	assert.deepEqual(rebuilt.details.signatureDifference.changedRemovalSaves, [{
		name: 'conductor',
		position: [0, 0],
		change: 'changed'
	}])
	assert.doesNotMatch(JSON.stringify(rebuilt), /\"save\"\\s*:/)
	env.dispose()
}

async function testSoulDriftKeepsTargetStableAndRestoresActualSave() {
	const env = createEnvironment()
	const conductor = env.game.spawn('conductor', [0, 0], {
		channel: 1,
		soul: 0.2
	})
	const plan = await env.deletion.planSelections()
	conductor.soul = 0.35
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	const rebuilt = clone(env.deletion.diagnostics()).events.find(entry => (
		entry.event === 'adapter.prepare.rebuilt'
	))
	assert.equal(rebuilt.details.signatureMatch, true)
	assert.deepEqual(rebuilt.details.signatureDifference.changedComponents, [])
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true)
	assert.equal(env.game.entityAtCoordinates([0, 0]).channel, 1)
	assert.equal(env.game.entityAtCoordinates([0, 0]).soul, 0.35)
	env.dispose()
}

function testLocalizationManifestUiAndDocumentation() {
	const definitions = []
	const sandbox = {
		ModLoader: {
			register(value) {
				definitions.push(value)
			}
		},
		Symbol,
		Object
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(I18N_SOURCE), sandbox, { filename: I18N_SOURCE })
	assert.equal(definitions.length, 1)
	definitions[0].init()
	const i18n = sandbox[I18N_KEY]
	const keys = [
		'deleteSelectionContents',
		'toolbarCardDelete',
		'deleteConfirmTitle',
		'deleteConfirmMessage',
		'deleteResourceChanges',
		'deleteCreativeNoEconomy',
		'deleteConfirmAction',
		'deleteCancel',
		'deletePlanning',
		'deleteExecuting',
		'deleteSuccess',
		'deleteNothing',
		'deleteTargetChanged',
		'deleteInsufficientResources',
		'deleteBusy',
		'deleteFailed',
		'deleteRolledBack',
		'deleteReloadRequired',
		'deletePreviewRefreshFailed'
	]
	assert.equal(i18n.version, '0.5.1')
	assert.equal(i18n.languages.length, 20)
	assert.ok(i18n.toolbarKeys.includes('toolbarCardDelete'))
	for (const language of i18n.languages) {
		for (const key of keys) {
			assert.notEqual(i18n.t(language, key), key, language + '.' + key)
			assert.ok(i18n.t(language, key).trim(), language + '.' + key)
		}
	}
	assert.match(i18n.t('sch', 'deleteConfirmMessage'), /\{safe\}.*\{protected\}.*\{cross\}/)

	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.5.1')
	const placementIndex = manifest.entry.indexOf('scripts/core/blueprint-placement.js')
	const deletionIndex = manifest.entry.indexOf(DELETE_SOURCE)
	const inputIndex = manifest.entry.indexOf('scripts/core/input-controller.js')
	const shellIndex = manifest.entry.indexOf('scripts/ui/editor-shell.js')
	const deleteUiIndex = manifest.entry.indexOf(DELETE_UI_SOURCE)
	const sessionIndex = manifest.entry.indexOf('scripts/blueprint-session.js')
	assert.ok(placementIndex < deletionIndex && deletionIndex < inputIndex)
	assert.ok(shellIndex < deleteUiIndex && deleteUiIndex < sessionIndex)

	const core = source(DELETE_SOURCE)
	const ui = source(DELETE_UI_SOURCE)
	const analysis = source(ANALYSIS_SOURCE)
	const shared = source(SHARED_SOURCE)
	const readme = source('README.md')
	assert.match(core, /const SCAN_CHUNK_SIZE = 512/)
	assert.match(core, /const APPLY_CHUNK_SIZE = 32/)
	assert.match(core, /planSelections\(options\)/)
	assert.match(core, /planRanges\(ranges, options\)/)
	assert.match(core, /planCells\(cells, options\)/)
	assert.match(core, /transactions\.registerAdapter\(TRANSACTION_KIND, adapter\)/)
	assert.match(core, /playSound\('recycle', pan\)/)
	assert.doesNotMatch(core, /createResourceTransfer/)
	assert.match(ui, /key === 'delete'/)
	assert.match(ui, /event\.repeat/)
	assert.match(ui, /selection\.isMoving/)
	assert.match(ui, /selection\.isResizing/)
	assert.match(ui, /dialog\.mount\(cancel\)/)
	assert.match(ui, /primary: true,\s*danger: true/)
	assert.match(ui, /color: var\(--world-editor-dialog-muted\)/)
	assert.match(ui, /markProbe\('confirmation-clicked'/)
	assert.match(ui, /markProbe\('execute-returned'/)
	assert.match(ui, /clearStatus\(\)\s*openConfirmation\(plan, input\)/)
	assert.match(core, /const PROBE_EVENT_LIMIT = 160/)
	assert.match(core, /diagnostics\(\)/)
	assert.doesNotMatch(core, /\[4C-1a Probe\]/)
	assert.match(core, /apply\.clear\.before/)
	assert.match(core, /apply\.clear\.after/)
	assert.match(core, /comparePlanFingerprints/)
	assert.match(core, /changedRemovalSaves/)
	assert.match(core, /function comparableDeletionSave/)
	assert.match(core, /delete save\.par\.soul/)
	assert.match(ui, /safe: summary\.safeCount/)
	assert.match(ui, /protected: summary\.protectedCount/)
	assert.match(ui, /cross: summary\.crossBoundaryCount/)
	assert.doesNotMatch(ui, /sync[- ]?empty/i)
	assert.match(analysis, /refresh\(reason\)/)
	assert.match(shared, /SELECTION_DELETE_KEY/)
	assert.match(readme, /## 4C-1a 选区安全删除/)
	assert.match(readme, /planSelections\(\).*planRanges\(\).*planCells\(\)/s)
	assert.match(readme, /不显示或执行任何同步空地 UI\/行为/)
}

async function run() {
	await testUnionPlanningExecutionUndoRedo()
	await testProtectedEmptyEconomyAndCreativeRules()
	await testApplyFailureRollsBackEveryMutation()
	await testTargetBindingReusableMasksAndCancellation()
	await testResourceGrowthDoesNotInvalidateStableEconomy()
	await testSignatureProbeIdentifiesChangedEntitySave()
	await testSoulDriftKeepsTargetStableAndRestoresActualSave()
	testLocalizationManifestUiAndDocumentation()
	console.log('World Editor 4C-1a verification passed: union planning, protection, economy, snapshots, target rebinding, atomic delete, undo/redo, reusable masks, UI guards, 20 languages, and scope boundaries.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
