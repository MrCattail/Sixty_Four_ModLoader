const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-state.js')
const STROKE_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-stroke.js')
const FILL_PATH = path.join(MOD_ROOT, 'scripts/core/paint-cube-fill.js')
const TRANSACTIONS_PATH = path.join(MOD_ROOT, 'scripts/core/editor-transactions.js')
const stateSource = fs.readFileSync(STATE_PATH, 'utf8')
const strokeSource = fs.readFileSync(STROKE_PATH, 'utf8')
const fillSource = fs.readFileSync(FILL_PATH, 'utf8')
const transactionsSource = fs.readFileSync(TRANSACTIONS_PATH, 'utf8')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
const FILL_KEY = Symbol.for('cattail.world-editor.paint-cube-fill')

function plain(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function createEnvironment(options = {}) {
	const definitions = []
	const events = new Map()
	const cleanups = []
	const cells = new Map()
	const requests = []
	const snapshots = []
	let adapter = null
	let entitySequence = 0

	const sandbox = {
		console: options.debug ? console : { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } },
		setTimeout,
		clearTimeout
	}
	vm.createContext(sandbox)
	if (options.realTransactions) vm.runInContext(transactionsSource, sandbox, { filename: TRANSACTIONS_PATH })
	vm.runInContext(stateSource, sandbox, { filename: STATE_PATH })
	vm.runInContext(strokeSource, sandbox, { filename: STROKE_PATH })
	if (options.actualFill) vm.runInContext(fillSource, sandbox, { filename: FILL_PATH })

	const api = {
		on(name, listener) {
			if (!events.has(name)) events.set(name, [])
			events.get(name).push(listener)
		},
		patch() {},
		storage: {
			snapshots: {
				async create(request) {
					snapshots.push(plain(request))
					if (typeof options.onSnapshotCreate === 'function') {
						await options.onSnapshotCreate({ request: plain(request), game })
					}
					return { id: 'snapshot-' + snapshots.length }
				},
				async remove() { return true }
			}
		}
	}
	for (const definition of definitions) definition.init(api)

	const key = cell => 'u' + cell[0] + 'v' + cell[1]
	const game = {
		plane: 0,
		stuff: [],
		stuffMap: Object.create(null),
		sortCalls: 0,
		assembleCalls: 0,
		shop: { updates: 0, checks: 0, updateElements() { this.updates += 1 }, check() { this.checks += 1 } },
		mouseRefreshes: 0,
		entityAtCoordinates(cell) { return cells.get(key(cell)) || null },
		addEntity(name, position, misc) {
			if (cells.has(key(position))) return false
			const entity = {
				id: ++entitySequence,
				name,
				position: position.slice(),
				state: 0,
				fill: 0,
				broken: 0,
				soul: 1,
				resources: plain(misc?.resources || []),
				initCalls: 0,
				init() { this.initCalls += 1 }
			}
			cells.set(key(position), entity)
			game.stuffMap[key(position)] = entity
			game.stuff.push(entity)
			game.stuff.sort((left, right) => left.position[0] + left.position[1] - right.position[0] - right.position[1])
			return entity
		},
		clearCell(position) {
			const entity = cells.get(key(position)) || null
			cells.delete(key(position))
			delete game.stuffMap[key(position)]
			if (entity) {
				const index = game.stuff.indexOf(entity)
				if (index >= 0) game.stuff.splice(index, 1)
				game.shop.updateElements()
			}
		},
		getEntityString(entity) {
			if (entity.name === 'surge') {
				return {
					name: 'surge',
					position: entity.position.slice(),
					par: {
						resources: plain(entity.resources),
						rayNumber: entity.rayNumber,
						grade: entity.grade,
						colors: plain(entity.colors),
						type: entity.type,
						maxLife: entity.maxLife,
						life: entity.life
					}
				}
			}
			let save = {
				name: entity.name,
				position: entity.position.slice(),
				par: {
					state: entity.state,
					fill: entity.fill,
					broken: entity.broken,
					soul: entity.soul,
					resources: plain(entity.resources)
				}
			}
			for (const hook of events.get('entitySave') || []) save = hook(save, { entity, game })
			return save
		},
		processMousemove2() { this.mouseRefreshes += 1 }
	}
	const nativeSort = game.stuff.sort
	Object.defineProperty(game.stuff, 'sort', {
		value(comparator) {
			game.sortCalls += 1
			return nativeSort.call(this, comparator)
		},
		configurable: true,
		writable: true
	})
	game.assembleSave = function () {
		this.assembleCalls += 1
		return JSON.stringify({ modloader: { saveInstanceId: 'stage4-save' } })
	}
	game.decodeSave = function (value) { return JSON.parse(value) }
	const runtime = { game, addCleanup(cleanup) { cleanups.push(cleanup) } }
	const selectionState = {
		revision: 1,
		selections: plain(options.selections || [])
	}
	const selection = {
		game,
		snapshot() {
			return {
				version: '0.2.6',
				revision: selectionState.revision,
				selections: plain(selectionState.selections),
				selectionCount: selectionState.selections.length,
				previewRange: null
			}
		}
	}
	const transactions = {
		game,
		registerAdapter(kind, value) {
			assert.equal(kind, 'paint-cube-stroke')
			adapter = value
			return function () { adapter = null }
		},
		execute(request) {
			requests.push(plain(request))
			return Promise.resolve({ accepted: true, executed: true })
		},
		beginApplied(request) {
			requests.push(plain(Object.assign({ live: true }, request)))
			return Promise.resolve({
				accepted: true,
				begun: true,
				snapshotId: 'snapshot-live',
				commit(prepared) {
					requests.push(plain(Object.assign({ committedLive: true }, prepared)))
					return Promise.resolve({ accepted: true, executed: true, transaction: { summary: plain(prepared.summary) } })
				},
				cancel() {
					return Promise.resolve(true)
				},
				blockRollback(message) {
					return { accepted: true, executed: false, error: { code: 'ROLLBACK_FAILED', message: String(message || '') } }
				}
			})
		}
	}
	sandbox[RUNTIME_KEY] = runtime
	if (options.actualFill) sandbox[SELECTION_KEY] = selection
	if (!options.realTransactions) sandbox[TRANSACTIONS_KEY] = transactions
	let loadedSave = { modloader: { saveInstanceId: 'stage4-save' } }
	for (const listener of events.get('beforeSaveLoad') || []) loadedSave = listener(loadedSave, game) || loadedSave
	for (const listener of events.get('afterGameInit') || []) listener({}, game)

	function seed(save) {
		const entity = game.addEntity(save.name, save.position, { resources: save.par?.resources || [] })
		assert.ok(entity)
		for (const [name, value] of Object.entries(save.par || {})) entity[name] = plain(value)
		return entity
	}

	function seedOrdinary(cell, name = 'pump') {
		return seed({ name, position: cell.slice(), par: { state: 9, fill: 3, broken: 0, resources: [7] } })
	}

	function seedPainted(cell, overrides = {}) {
		const save = plain(sandbox[PAINT_KEY].buildStableCubeSave(cell))
		Object.assign(save.par, plain(overrides))
		return seed(save)
	}

	function seedSurge(cell, overrides = {}) {
		return seed({
			name: 'surge',
			position: cell.slice(),
			par: Object.assign({
				resources: [0, 3, 0, 2],
				rayNumber: 7,
				grade: 2,
				colors: ['#102030', '#405060'],
				type: 3,
				maxLife: 28000,
				life: 20000
			}, plain(overrides))
		})
	}

	function seedGrow(cell, durationMs = 4000, lineage = 'grow-seeded-lineage') {
		return seed(plain(sandbox[PAINT_KEY].buildGrowCubeSave(
			cell,
			sandbox[PAINT_KEY].defaultRecipe(),
			durationMs,
			lineage
		)))
	}

	return {
		sandbox,
		game,
		cells,
		requests,
		snapshots,
		cleanups,
		paintState: sandbox[PAINT_KEY],
		stroke: sandbox[STROKE_KEY],
		fill: sandbox[FILL_KEY],
		selectionState,
		transactions: sandbox[TRANSACTIONS_KEY],
		adapter() { return adapter },
		key,
		seed,
		seedOrdinary,
		seedPainted,
		seedSurge,
		seedGrow
	}
}

function context(plane = 0, operationId = 'op-1') {
	return { plane, operationId, isCurrent() { return true } }
}

async function expectCode(code, action) {
	await assert.rejects(action, error => error?.code === code)
}

async function testInspectionAndRequestBoundary() {
	const env = createEnvironment()
	const adapter = env.adapter()
	assert.equal(adapter.version, '1.0.0')
	assert.equal(env.stroke.version, '0.6.0')
	assert.equal(env.stroke.maxCells, 512)
	for (const method of ['prepare', 'preflight', 'capture', 'apply', 'verify', 'restore']) {
		assert.equal(typeof adapter[method], 'function', method)
	}

	const empty = env.stroke.inspectCell([1, 1], 'paint')
	assert.deepEqual(plain(empty), {
		cell: [1, 1], action: 'paint', known: true, eligible: true, occupied: false,
		painted: false, operation: 'paint', before: null
	})
	env.seedOrdinary([2, 2])
	assert.equal(env.stroke.inspectCell([2, 2], 'paint').eligible, false)
	assert.equal(env.stroke.inspectCell([2, 2], 'erase').eligible, false)
	const damaged = env.seedPainted([3, 3], { state: 0, fill: 11, broken: 1 })
	assert.equal(env.paintState.isPainted(damaged), true)
	assert.equal(env.stroke.inspectCell([3, 3], 'paint').operation, 'replace')
	assert.equal(env.stroke.inspectCell([3, 3], 'erase').operation, 'erase')

	const targets = []
	for (let index = 0; index < 514; index += 1) targets.push([index, 8])
	await env.stroke.executeStroke({ action: 'paint', targets, input: 'mouse' })
	assert.equal(env.requests.length, 1)
	assert.equal(env.requests[0].payload.targets.length, 512)
	assert.equal(env.requests[0].payload.limitReached, true)
	assert.equal(env.requests[0].payload.action, 'paint')
	assert.equal(env.requests[0].input, 'mouse')
	assert.deepEqual(plain(env.requests[0].payload.recipe), plain(env.paintState.defaultRecipe()))
	const invalid = await env.stroke.executeStroke({ action: 'paint', targets: [[900, 8]], recipe: { weights: [] } })
	assert.equal(invalid.executed, false)
	assert.equal(invalid.error.code, 'INVALID_SPEC')
}

async function testPrepareApplyUndoRedoAndDriftFiltering() {
	const env = createEnvironment()
	const adapter = env.adapter()
	const oldPainted = env.seedPainted([3, 4], { state: 0, fill: 7, broken: 1, customDurable: { note: 'restore-exactly' } })
	const ordinary = env.seedOrdinary([5, 6])
	const oldSave = env.game.getEntityString(oldPainted)
	const ordinarySave = env.game.getEntityString(ordinary)
	const recipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 1, weight: 50 },
		{ resource: 4, weight: 30 },
		{ resource: 9, weight: 20 }
	] })
	const prepared = await adapter.prepare(context(), {
		action: 'paint',
		recipe,
		targets: [
			{ cell: [1, 2], before: null },
			{ cell: [3, 4], before: oldSave },
			{ cell: [5, 6], before: ordinarySave },
			{ cell: [1, 2], before: null }
		],
		initialSkipped: 2,
		limitReached: true
	})
	assert.deepEqual(plain(prepared.summary), {
		label: 'Paint configured cube stroke',
		action: 'paint', cellCount: 2, paintedCount: 1, replacedCount: 1,
		erasedCount: 0, skippedCount: 3, limitReached: true
	})
	assert.equal(prepared.payload.schema, 4)
	assert.deepEqual(plain(prepared.payload.recipe), plain(recipe))
	assert.deepEqual(plain(prepared.payload.changes.map(change => change.operation)), ['paint', 'replace'])
	assert.deepEqual(plain(prepared.scope.cells), [[1, 2], [3, 4]])

	const record = { payload: prepared.payload, before: null, after: null }
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'forward')), { ok: true })
	record.before = await adapter.capture(context(), record)
	await adapter.apply(context(), record, 'forward')
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([1, 2])), true)
	const replacement = env.game.entityAtCoordinates([3, 4])
	assert.equal(env.paintState.isPainted(replacement), true)
	assert.notEqual(replacement.id, oldPainted.id)
	assert.equal(replacement.state, 2)
	assert.equal(replacement.fill, 64)
	assert.deepEqual(
		plain(env.paintState.normalizePaint(replacement).recipe),
		plain(recipe),
		'the transaction freezes one canonical recipe into every painted cell'
	)
	assert.deepEqual(
		Array.from(env.paintState.allocateSlots(recipe)),
		replacement.resources.reduce((counts, resource) => { counts[resource] += 1; return counts }, new Array(10).fill(0))
	)
	assert.equal(env.game.entityAtCoordinates([5, 6]).id, ordinary.id)
	record.after = await adapter.capture(context(), record)
	assert.equal(env.game.entityAtCoordinates([1, 2]).soul, 1, 'real vanilla defaults are retained by the created entity')
	assert.equal(record.after.cells[0].save.par.soul, 'painted-runtime', 'dynamic vanilla soul is compatibility-guarded in history')
	assert.deepEqual(plain(await adapter.verify(context(), record, 'forward', record.after)), { ok: true })

	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true })
	await adapter.apply(context('0', 'undo-1'), record, 'undo')
	assert.equal(env.game.entityAtCoordinates([1, 2]), null)
	assert.deepEqual(plain(env.game.getEntityString(env.game.entityAtCoordinates([3, 4]))), plain(oldSave))
	record.before = await adapter.capture(context(), record)
	await adapter.verify(context(), record, 'undo', record.before)

	assert.deepEqual(plain(await adapter.preflight(context(), record, 'redo')), { ok: true })
	await adapter.apply(context(0, 'redo-1'), record, 'redo')
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([1, 2])), true)
	assert.equal(env.game.entityAtCoordinates([3, 4]).state, 2)

	const sampledEmpty = env.stroke.inspectCell([9, 9], 'paint')
	env.seedOrdinary([9, 9], 'crate')
	const driftPrepared = await adapter.prepare(context(), {
		action: 'paint',
		targets: [{ cell: [8, 8], before: null }, { cell: [9, 9], before: sampledEmpty.before }]
	})
	assert.equal(driftPrepared.summary.cellCount, 1)
	assert.equal(driftPrepared.summary.skippedCount, 1)
	assert.deepEqual(plain(driftPrepared.scope.cells), [[8, 8]])
	await expectCode('NOTHING_TO_CHANGE', () => adapter.prepare(context(), {
		action: 'paint', targets: [{ cell: [9, 9], before: null }]
	}))
	await expectCode('PLANE_CHANGED', () => adapter.prepare(context(1), { action: 'paint', targets: [[7, 8]] }))
}

async function testEraserStrictnessAndAtomicRecovery() {
	const env = createEnvironment({ realTransactions: true, debug: process.env.WORLD_EDITOR_TEST_DEBUG === '1' })
	const damaged = env.seedPainted([20, 20], { state: 0, fill: 2, broken: 1, customDurable: 'damaged' })
	const damagedSave = plain(env.game.getEntityString(damaged))
	const ordinary = env.seedOrdinary([21, 20], 'cube')
	const erased = await env.stroke.executeStroke({
		action: 'erase',
		targets: [
			{ cell: [20, 20], before: damagedSave },
			{ cell: [21, 20], before: env.game.getEntityString(ordinary) }
		],
		input: 'mouse'
	})
	assert.equal(erased.executed, true)
	assert.deepEqual(plain(erased.transaction.summary), {
		label: 'Erase painted cube stroke', action: 'erase', cellCount: 1,
		paintedCount: 0, replacedCount: 0, erasedCount: 1, skippedCount: 1, limitReached: false
	})
	assert.equal(env.game.entityAtCoordinates([20, 20]), null)
	assert.equal(env.game.entityAtCoordinates([21, 20]).id, ordinary.id)
	assert.equal(env.transactions.snapshot().undoCount, 1)
	await env.transactions.undo({ input: 'keyboard' })
	assert.deepEqual(plain(env.game.getEntityString(env.game.entityAtCoordinates([20, 20]))), damagedSave)
	await env.transactions.redo({ input: 'keyboard' })
	assert.equal(env.game.entityAtCoordinates([20, 20]), null)

	let failRefresh = true
	const originalCheck = env.game.shop.check
	const beforeA = env.game.entityAtCoordinates([30, 30])
	const beforeB = env.game.entityAtCoordinates([31, 30])
	env.game.shop.check = function () {
		if (failRefresh) {
			failRefresh = false
			throw new Error('synthetic refresh failure')
		}
		return originalCheck.call(this)
	}
	const recovered = await env.stroke.executeStroke({ action: 'paint', targets: [[30, 30], [31, 30]], input: 'mouse' })
	assert.equal(recovered.executed, false)
	assert.equal(recovered.reason, 'rolled-back')
	assert.equal(env.game.entityAtCoordinates([30, 30]), beforeA)
	assert.equal(env.game.entityAtCoordinates([31, 30]), beforeB)
	assert.equal(env.transactions.snapshot().terminalBlockedReason, null)
	assert.deepEqual(env.snapshots.map(entry => entry.reason), [
		'world-editor-before-forward',
		'world-editor-before-undo',
		'world-editor-before-redo',
		'world-editor-before-forward'
	])
}

async function testLiveBrushEraserCommitCancelAndHistory() {
	const brushEnv = createEnvironment({ realTransactions: true })
	const liveBrush = brushEnv.stroke.beginLiveStroke({
		action: 'paint',
		cubeMode: 'stable',
		recipe: brushEnv.paintState.defaultRecipe(),
		input: 'mouse'
	})
	await liveBrush.ready
	assert.equal(brushEnv.transactions.snapshot().busy, true, 'live Brush holds the transaction lane while the pointer is down')
	assert.equal(brushEnv.snapshots.length, 1, 'live Brush creates its physical safety snapshot before writing')
	const beforeBatchRefreshes = {
		shopUpdates: brushEnv.game.shop.updates,
		shopChecks: brushEnv.game.shop.checks,
		mouseRefreshes: brushEnv.game.mouseRefreshes
	}
	assert.equal(liveBrush.sampleMany([[70, 70], [71, 70]]).ok, true)
	assert.equal(brushEnv.game.shop.updates - beforeBatchRefreshes.shopUpdates, 0, 'live Brush defers shop refreshes until commit')
	assert.equal(brushEnv.game.shop.checks - beforeBatchRefreshes.shopChecks, 0, 'live Brush defers shop checks until commit')
	assert.equal(brushEnv.game.mouseRefreshes - beforeBatchRefreshes.mouseRefreshes, 0, 'live Brush defers hover refreshes until commit')
	const liveDiagnostics = brushEnv.stroke.diagnostics()
	assert.equal(liveDiagnostics.liveBatches, 1)
	assert.equal(liveDiagnostics.liveCellsRequested, 2)
	assert.equal(liveDiagnostics.liveCellsChanged, 2)
	assert.equal(liveDiagnostics.liveRefreshes, 0)
	assert.equal(typeof liveDiagnostics.liveWriteMs, 'number')
	assert.equal(brushEnv.paintState.isPainted(brushEnv.game.entityAtCoordinates([70, 70])), true, 'live Brush writes before mouseup')
	assert.equal(brushEnv.paintState.isPainted(brushEnv.game.entityAtCoordinates([71, 70])), true)
	assert.equal(brushEnv.transactions.snapshot().undoCount, 0, 'live writes are not history until commit')
	const committed = await liveBrush.commit()
	assert.equal(committed.executed, true)
	assert.equal(committed.transaction.summary.cellCount, 2)
	assert.equal(brushEnv.game.shop.updates - beforeBatchRefreshes.shopUpdates, 1, 'live Brush refreshes once after commit')
	assert.equal(brushEnv.game.shop.checks - beforeBatchRefreshes.shopChecks, 1)
	assert.equal(brushEnv.game.mouseRefreshes - beforeBatchRefreshes.mouseRefreshes, 1)
	assert.equal(brushEnv.stroke.diagnostics().liveRefreshes, 1)
	assert.equal(brushEnv.transactions.snapshot().busy, false)
	assert.equal(brushEnv.transactions.snapshot().undoCount, 1, 'the whole live Brush stroke becomes one history entry')
	assert.equal((await brushEnv.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(brushEnv.game.entityAtCoordinates([70, 70]), null)
	assert.equal(brushEnv.game.entityAtCoordinates([71, 70]), null)
	assert.equal((await brushEnv.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(brushEnv.paintState.isPainted(brushEnv.game.entityAtCoordinates([70, 70])), true)

	const eraseEnv = createEnvironment({ realTransactions: true })
	const erasedSave = plain(eraseEnv.game.getEntityString(eraseEnv.seedPainted([80, 80], { customDurable: 'cancel-restore' })))
	const liveErase = eraseEnv.stroke.beginLiveStroke({ action: 'erase', input: 'mouse' })
	await liveErase.ready
	assert.equal(liveErase.sample([80, 80]).ok, true)
	assert.equal(eraseEnv.game.entityAtCoordinates([80, 80]), null, 'live Eraser removes before mouseup')
	assert.equal(await liveErase.cancel('escape'), true)
	assert.deepEqual(plain(eraseEnv.game.getEntityString(eraseEnv.game.entityAtCoordinates([80, 80]))), erasedSave)
	assert.equal(eraseEnv.transactions.snapshot().undoCount, 0, 'cancelled live Eraser does not create history')
}

async function testGrowIdentityProgressUndoAndRedoRestart() {
	const env = createEnvironment()
	const adapter = env.adapter()
	const priorGrow = env.seedGrow([42, 42], 4000, 'grow-prior-lineage')
	const priorSave = plain(env.game.getEntityString(priorGrow))
	const prepared = await adapter.prepare(context(), {
		action: 'paint',
		cubeMode: 'grow',
		growDurationMs: 6500,
		growLineage: 'grow-transaction-lineage',
		targets: [
			{ cell: [41, 42], before: null },
			{ cell: [42, 42], before: priorSave }
		]
	})
	assert.equal(prepared.payload.schema, 4)
	assert.equal(prepared.payload.cubeMode, 'grow')
	assert.equal(prepared.payload.growDurationMs, 6500)
	assert.equal(prepared.payload.growLineage, 'grow-transaction-lineage')
	assert.deepEqual(plain(prepared.payload.changes.map(change => change.operation)), ['paint', 'replace'])
	for (const change of prepared.payload.changes) {
		assert.equal(change.after.par.state, 0)
		assert.equal(change.after.par.fill, 0)
		assert.equal(change.after.par.worldEditorPaint.version, 3)
		assert.equal(change.after.par.worldEditorPaint.growth.elapsedMs, 0)
		assert.equal(change.after.par.worldEditorPaint.growth.durationMs, 6500)
		assert.equal(change.after.par.worldEditorPaint.growth.lineage, 'grow-transaction-lineage')
	}

	const record = { payload: prepared.payload, before: null, after: null }
	record.before = await adapter.capture(context(), record)
	await adapter.apply(context(), record, 'forward')
	record.after = await adapter.capture(context(), record)
	const active = env.game.entityAtCoordinates([41, 42])
	active.fill = 24
	active.worldEditorPaint = env.paintState.updateGrowProgress(active, 'growing', 2000)
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true }, 'monotonic Grow progress remains the same transaction identity')
	active.state = 1
	active.fill = 64
	active.unveilProgress = .4
	active.worldEditorPaint = env.paintState.updateGrowProgress(active, 'revealing', 6350)
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true }, 'revealing Grow progress remains undoable')
	active.state = 2
	active.unveilProgress = 1
	active.worldEditorPaint = env.paintState.updateGrowProgress(active, 'stable', 6500)
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true }, 'stable Grow completion remains undoable')
	const stablePaint = active.worldEditorPaint
	active.worldEditorPaint = Object.assign({}, plain(stablePaint), {
		growth: Object.assign({}, plain(stablePaint.growth), { lineage: 'grow-external-lineage' })
	})
	assert.equal((await adapter.preflight(context(), record, 'undo')).ok, false, 'a different Grow lineage remains an external change')
	active.worldEditorPaint = stablePaint
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true })
	await adapter.apply(context('0', 'grow-undo'), record, 'undo')
	assert.equal(env.game.entityAtCoordinates([41, 42]), null)
	assert.deepEqual(plain(env.game.getEntityString(env.game.entityAtCoordinates([42, 42]))), priorSave)

	assert.deepEqual(plain(await adapter.preflight(context(), record, 'redo')), { ok: true })
	await adapter.apply(context(0, 'grow-redo'), record, 'redo')
	const restarted = env.game.entityAtCoordinates([41, 42])
	assert.equal(restarted.state, 0)
	assert.equal(restarted.fill, 0)
	assert.equal(restarted.worldEditorPaint.growth.elapsedMs, 0, 'Redo restarts the frozen Grow stroke from zero')
	assert.equal(restarted.worldEditorPaint.growth.durationMs, 6500)
	assert.equal(restarted.worldEditorPaint.growth.lineage, 'grow-transaction-lineage')

	const currentResources = plain(restarted.resources)
	restarted.resources[0] = 9
	assert.deepEqual(plain(await adapter.preflight(context(), record, 'undo')), { ok: true }, 'legal 64-slot painted resource drift preserves history identity')
	restarted.resources = currentResources
	restarted.soul = 2
	assert.equal((await adapter.preflight(context(), record, 'undo')).ok, false, 'malformed vanilla soul cannot claim painted history identity')
	restarted.soul = 1
	restarted.worldEditorPaint = env.paintState.updateGrowProgress(restarted, 'growing', 1000)
	assert.equal((await adapter.preflight(context(), record, 'undo')).ok, true)
	restarted.worldEditorPaint = Object.assign({}, plain(restarted.worldEditorPaint), {
		growth: Object.assign({}, plain(restarted.worldEditorPaint.growth), { elapsedMs: -1 })
	})
	assert.equal((await adapter.preflight(context(), record, 'undo')).ok, false, 'malformed progress cannot claim transaction identity')
}

async function testBatchedWorldWritesAndSingleSaveEnvelope() {
	const env = createEnvironment({ realTransactions: true })
	const cells = Array.from({ length: 512 }, (_, index) => [index, 40])
	env.game.sortCalls = 0
	env.game.shop.updates = 0
	env.game.shop.checks = 0
	const assembleBeforePaint = env.game.assembleCalls
	const painted = await env.stroke.executeStroke({ action: 'paint', targets: cells, input: 'mouse' })
	assert.equal(painted.executed, true)
	assert.equal(env.game.assembleCalls - assembleBeforePaint, 1, 'one full save envelope is assembled per stroke')
	assert.equal(env.snapshots.length, 1, 'the physical safety snapshot is retained')
	assert.equal(env.game.sortCalls, 1, '512 cube insertions sort the world entity list once')
	assert.equal(env.game.shop.updates, 1, 'the world shop refresh runs once after the stroke')
	assert.equal(env.game.shop.checks, 1)

	env.game.sortCalls = 0
	env.game.shop.updates = 0
	env.game.shop.checks = 0
	const eraseTargets = cells.map(cell => ({ cell, before: env.game.getEntityString(env.game.entityAtCoordinates(cell)) }))
	const assembleBeforeErase = env.game.assembleCalls
	const erased = await env.stroke.executeStroke({ action: 'erase', targets: eraseTargets, input: 'mouse' })
	assert.equal(erased.executed, true)
	assert.equal(env.game.assembleCalls - assembleBeforeErase, 1)
	assert.equal(env.game.sortCalls, 0)
	assert.equal(env.game.shop.updates, 1, '512 clearCell shop updates are deferred to one refresh')
	assert.equal(env.game.shop.checks, 1)

	env.game.sortCalls = 0
	env.game.shop.updates = 0
	const assembleBeforeUndo = env.game.assembleCalls
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(env.game.assembleCalls - assembleBeforeUndo, 1)
	assert.equal(env.game.sortCalls, 1, 'restoring 512 cubes also sorts once')
	assert.equal(env.game.shop.updates, 1)

	env.game.sortCalls = 0
	env.game.shop.updates = 0
	const assembleBeforeRedo = env.game.assembleCalls
	assert.equal((await env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(env.game.assembleCalls - assembleBeforeRedo, 1)
	assert.equal(env.game.sortCalls, 0)
	assert.equal(env.game.shop.updates, 1)
}

async function testBucket4096AtomicBoundary() {
	const env = createEnvironment({ realTransactions: true })
	const targets = Array.from({ length: 4096 }, function (_, index) {
		return { cell: [index % 64, Math.floor(index / 64)], before: null }
	})
	const fillGuard = { schema: 1, id: 'bucket-4096-guard' }
	let validationCalls = 0
	env.sandbox[FILL_KEY] = {
		game: env.game,
		async validatePlan(guard) {
			validationCalls += 1
			assert.deepEqual(plain(guard), fillGuard)
			return { ok: true, plan: { guard: fillGuard, targets } }
		}
	}
	assert.equal(env.stroke.maxCells, 512)
	assert.equal(env.stroke.bucketMaxCells, 4096)
	env.game.sortCalls = 0
	env.game.shop.updates = 0
	const painted = await env.stroke.executeStroke({
		action: 'paint',
		source: 'bucket',
		strictTargets: true,
		fillGuard,
		targets,
		input: 'mouse'
	})
	assert.equal(painted.executed, true)
	assert.equal(painted.transaction.summary.cellCount, 4096)
	assert.equal(painted.transaction.summary.label, 'Fill painted cube region')
	assert.equal(validationCalls, 3, 'Bucket is replanned during prepare and both preflights around the physical snapshot')
	assert.equal(env.snapshots.length, 1)
	assert.equal(env.game.sortCalls, 16, 'each 256-cell Bucket slice restores a sorted world before yielding')
	assert.equal(env.game.shop.updates, 1)
	assert.equal(env.transactions.snapshot().undoCount, 1)
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([0, 0])), true)
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([63, 63])), true)

	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([63, 63]), null)
	assert.equal((await env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([0, 0])), true)
	assert.equal(env.paintState.isPainted(env.game.entityAtCoordinates([63, 63])), true)
}

async function testBucketLargePaintedRegionToleratesRuntimePayloadDrift() {
	const env = createEnvironment({ realTransactions: true })
	const cells = Array.from({ length: 1024 }, function (_, index) {
		return [index % 32, 100 + Math.floor(index / 32)]
	})
	for (const cell of cells) env.seedPainted(cell)
	const replacementRecipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 2, weight: 70 },
		{ resource: 7, weight: 30 }
	] })
	const fillGuard = { schema: 1, id: 'bucket-runtime-drift-guard' }
	let validationCalls = 0
	env.sandbox[FILL_KEY] = {
		game: env.game,
		async validatePlan(guard) {
			validationCalls += 1
			assert.deepEqual(plain(guard), fillGuard)
			const targets = cells.map(function (cell) {
				return { cell: cell.slice(), before: plain(env.game.getEntityString(env.game.entityAtCoordinates(cell))) }
			})
			if (validationCalls <= 3) {
				setTimeout(function () {
					for (const cell of cells) {
						const entity = env.game.entityAtCoordinates(cell)
						if (!entity) continue
						entity.broken = Number(entity.broken || 0) + 0.01
						entity.resources[0] = (Number(entity.resources[0]) + 1) % 10
					}
				}, 0)
			}
			return { ok: true, plan: { guard: fillGuard, targets } }
		}
	}

	const result = await env.stroke.executeStroke({
		action: 'paint',
		source: 'bucket',
		strictTargets: true,
		fillGuard,
		recipe: replacementRecipe,
		targets: cells.map(function (cell) {
			return { cell: cell.slice(), before: plain(env.game.getEntityString(env.game.entityAtCoordinates(cell))) }
		}),
		input: 'mouse'
	})
	assert.equal(result.executed, true, 'legal painted Cube runtime drift must not reject a large Bucket operation')
	assert.equal(result.transaction.summary.cellCount, 1024)
	assert.equal(validationCalls, 3)
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(cells[0])).recipe),
		plain(replacementRecipe)
	)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(cells[0])).recipe),
		plain(env.paintState.defaultRecipe())
	)
}

async function testBucketUndoPreservesEarlierBrushHistoryAcrossRuntimeDrift() {
	const env = createEnvironment({ realTransactions: true })
	const cells = Array.from({ length: 256 }, function (_, index) {
		return [index % 16, 160 + Math.floor(index / 16)]
	})
	const brushed = await env.stroke.executeStroke({ action: 'paint', targets: cells, input: 'mouse' })
	assert.equal(brushed.executed, true)
	for (const cell of cells) {
		const entity = env.game.entityAtCoordinates(cell)
		entity.broken = 0.25
		entity.resources[0] = (Number(entity.resources[0]) + 1) % 10
		entity.soul = 0.25
	}
	const replacementRecipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 3, weight: 60 },
		{ resource: 8, weight: 40 }
	] })
	const fillGuard = { schema: 1, id: 'bucket-before-brush-history-guard' }
	env.sandbox[FILL_KEY] = {
		game: env.game,
		async validatePlan(guard) {
			assert.deepEqual(plain(guard), fillGuard)
			return {
				ok: true,
				plan: {
					guard: fillGuard,
					targets: cells.map(function (cell) {
						return { cell: cell.slice(), before: plain(env.game.getEntityString(env.game.entityAtCoordinates(cell))) }
					})
				}
			}
		}
	}
	const bucket = await env.stroke.executeStroke({
		action: 'paint',
		source: 'bucket',
		strictTargets: true,
		fillGuard,
		recipe: replacementRecipe,
		targets: cells,
		input: 'mouse'
	})
	assert.equal(bucket.executed, true)
	assert.equal(env.transactions.snapshot().undoCount, 2)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, 'Bucket itself remains undoable')
	assert.equal(
		(await env.transactions.undo({ input: 'keyboard' })).executed,
		true,
		'the earlier Brush history remains undoable after Bucket restores the same painted identities with newer runtime payloads'
	)
	assert.equal(env.game.entityAtCoordinates(cells[0]), null)
	assert.equal((await env.transactions.redo({ input: 'keyboard' })).executed, true, 'the earlier Brush history remains redoable')
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(cells[0])).recipe),
		plain(env.paintState.defaultRecipe())
	)
	assert.equal((await env.transactions.redo({ input: 'keyboard' })).executed, true, 'the later Bucket history remains redoable after replaying Brush')
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(cells[0])).recipe),
		plain(replacementRecipe)
	)
}

async function testActualPlannerPaintedRegionRecolorIntegration() {
	const start = [300, 300]
	const end = [315, 315]
	const env = createEnvironment({
		realTransactions: true,
		actualFill: true,
		selections: [{ id: 1, plane: 0, range: { start, end } }]
	})
	assert.ok(env.fill, 'the real read-only Bucket planner must mount beside the transaction adapter')
	const sourceRecipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 1, weight: 75 },
		{ resource: 4, weight: 25 }
	] })
	const targetRecipe = env.paintState.normalizeRecipe({ weights: [
		{ resource: 2, weight: 60 },
		{ resource: 8, weight: 40 }
	] })
	const cells = []
	for (let u = start[0]; u <= end[0]; u += 1) {
		for (let v = start[1]; v <= end[1]; v += 1) {
			const cell = [u, v]
			cells.push(cell)
			env.seed(plain(env.paintState.buildStableCubeSave(cell, sourceRecipe)))
		}
	}
	const plan = await env.fill.plan({ cell: start, cubeMode: 'stable', recipe: targetRecipe })
	assert.equal(plan.componentCount, 256)
	assert.equal(plan.targetCount, 256)
	const secondPlan = await env.fill.plan({ cell: start, cubeMode: 'stable', recipe: targetRecipe })
	assert.deepEqual(plain(secondPlan.guard), plain(plan.guard), 'read-only painted recolor planning must produce a stable guard')
	const directValidation = await env.fill.validatePlan(plan.guard)
	assert.equal(directValidation.ok, true)
	const result = await env.stroke.executeStroke({
		action: 'paint',
		source: 'bucket',
		strictTargets: true,
		fillGuard: plan.guard,
		cubeMode: 'stable',
		recipe: targetRecipe,
		targets: plan.targets,
		input: 'mouse'
	})
	assert.equal(result.executed, true, 'the real planner and transaction adapter must recolor one same-recipe painted component')
	assert.equal(result.transaction.summary.replacedCount, 256)
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(start)).recipe),
		plain(targetRecipe)
	)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.deepEqual(
		plain(env.paintState.normalizePaint(env.game.entityAtCoordinates(start)).recipe),
		plain(sourceRecipe)
	)
}

async function testBrushAndBucketReplaceTransientSurgesAndRestoreThem() {
	const brushCell = [260, 260]
	const brushEnv = createEnvironment({
		realTransactions: true,
		onSnapshotCreate({ game }) {
			const entity = game.entityAtCoordinates(brushCell)
			if (entity?.name === 'surge') entity.life -= 1000
		}
	})
	const surge = brushEnv.seedSurge(brushCell)
	const inspection = brushEnv.stroke.inspectCell(brushCell, 'paint')
	assert.equal(inspection.eligible, true, 'Brush treats a standalone Surge as replaceable empty terrain')
	assert.equal(inspection.operation, 'replace')
	assert.equal(brushEnv.stroke.inspectCell(brushCell, 'erase').eligible, false, 'Eraser does not delete Surges')
	const brushResult = await brushEnv.stroke.executeStroke({
		action: 'paint',
		cubeMode: 'stable',
		recipe: brushEnv.paintState.defaultRecipe(),
		targets: [{ cell: brushCell, before: inspection.before }],
		input: 'mouse'
	})
	assert.equal(brushResult.executed, true)
	assert.equal(brushResult.transaction.summary.replacedCount, 1)
	assert.equal(brushEnv.game.entityAtCoordinates(brushCell)?.name, 'cube')
	assert.equal((await brushEnv.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredAfterForward = brushEnv.game.entityAtCoordinates(brushCell)
	assert.equal(restoredAfterForward?.name, 'surge')
	assert.equal(restoredAfterForward.life, 19000, 'Undo restores the Surge state captured immediately before replacement')
	assert.deepEqual(
		plain(brushEnv.game.getEntityString(restoredAfterForward).par),
		Object.assign(plain(brushEnv.game.getEntityString(surge).par), { life: 19000 })
	)
	assert.equal((await brushEnv.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(brushEnv.game.entityAtCoordinates(brushCell)?.name, 'cube')
	assert.equal((await brushEnv.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(brushEnv.game.entityAtCoordinates(brushCell)?.life, 18000, 'Redo rebases the restorable Surge state at the next replacement')

	const driftCell = [270, 270]
	let swapped = false
	const driftEnv = createEnvironment({
		realTransactions: true,
		onSnapshotCreate({ game }) {
			if (swapped) return
			swapped = true
			game.clearCell(driftCell)
			const replacement = game.addEntity('surge', driftCell, { resources: [9] })
			replacement.rayNumber = 1
			replacement.grade = 1
			replacement.colors = ['#ffffff']
			replacement.type = 9
			replacement.maxLife = 10000
			replacement.life = 9999
		}
	})
	driftEnv.seedSurge(driftCell)
	const driftInspection = driftEnv.stroke.inspectCell(driftCell, 'paint')
	const driftResult = await driftEnv.stroke.executeStroke({
		action: 'paint',
		cubeMode: 'stable',
		recipe: driftEnv.paintState.defaultRecipe(),
		targets: [{ cell: driftCell, before: driftInspection.before }],
		input: 'mouse'
	})
	assert.equal(driftResult.executed, false, 'a different Surge entity cannot inherit the replaceable target identity')
	assert.equal(driftResult.error.code, 'EXTERNAL_CHANGE')
	assert.equal(driftEnv.game.entityAtCoordinates(driftCell)?.type, 9)

	const bucketStart = [280, 280]
	const bucketSurgeCell = [281, 280]
	const bucketEnv = createEnvironment({
		realTransactions: true,
		actualFill: true,
		selections: [{ id: 1, plane: 0, range: { start: bucketStart, end: [281, 281] } }]
	})
	const bucketSurge = bucketEnv.seedSurge(bucketSurgeCell, { life: 12345, type: 8 })
	const bucketSurgeSave = plain(bucketEnv.game.getEntityString(bucketSurge))
	const bucketPlan = await bucketEnv.fill.plan({
		cell: bucketSurgeCell,
		cubeMode: 'stable',
		recipe: bucketEnv.paintState.defaultRecipe()
	})
	assert.equal(bucketPlan.source.kind, 'empty', 'a Surge can seed the same empty-region Bucket fill as a blank cell')
	assert.equal(bucketPlan.componentCount, 4)
	assert.equal(bucketPlan.targetCount, 4)
	const bucketResult = await bucketEnv.stroke.executeStroke({
		action: 'paint',
		source: 'bucket',
		strictTargets: true,
		fillGuard: bucketPlan.guard,
		cubeMode: 'stable',
		recipe: bucketEnv.paintState.defaultRecipe(),
		targets: bucketPlan.targets,
		input: 'mouse'
	})
	assert.equal(bucketResult.executed, true)
	for (const cell of [bucketStart, bucketSurgeCell, [280, 281], [281, 281]]) {
		assert.equal(bucketEnv.game.entityAtCoordinates(cell)?.name, 'cube')
	}
	assert.equal((await bucketEnv.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.deepEqual(plain(bucketEnv.game.getEntityString(bucketEnv.game.entityAtCoordinates(bucketSurgeCell))), bucketSurgeSave)
	for (const cell of [bucketStart, [280, 281], [281, 281]]) {
		assert.equal(bucketEnv.game.entityAtCoordinates(cell), null)
	}
}

async function run() {
	await testInspectionAndRequestBoundary()
	await testPrepareApplyUndoRedoAndDriftFiltering()
	await testEraserStrictnessAndAtomicRecovery()
	await testLiveBrushEraserCommitCancelAndHistory()
	await testGrowIdentityProgressUndoAndRedoRestart()
	await testBatchedWorldWritesAndSingleSaveEnvelope()
	await testBucket4096AtomicBoundary()
	await testBucketLargePaintedRegionToleratesRuntimePayloadDrift()
	await testBucketUndoPreservesEarlierBrushHistoryAcrossRuntimeDrift()
	await testActualPlannerPaintedRegionRecolorIntegration()
	await testBrushAndBucketReplaceTransientSurgesAndRestoreThem()
	console.log('World Editor 5C-9 stroke verification passed: live Brush/Eraser writes with one history entry, cancellation rollback, frozen canonical recipes, Brush 512 and Bucket 4096 boundaries, v2/v3 create/replace/erase, transient Surge replacement/restoration, Bucket revalidation around one physical snapshot, atomic undo/redo, batched time-sliced writes, exact palette slots, drift filtering, and rollback recovery.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
