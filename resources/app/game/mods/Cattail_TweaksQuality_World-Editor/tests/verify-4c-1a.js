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
const PAINT_CUBE_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
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
		stabilizers: new Set(),
		stats: {
			machinesSold: 0,
			timeSinceLastDelete: options.timeSinceLastDelete ?? 42
		},
		shopUpdates: 0,
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
				stabilizer2: definition([24]),
				stabilizer3: definition([64], { canPurchase: false }),
				surge: definition([0], { canPurchase: false }),
				eraser: definition([1]),
				eraser2: definition([2]),
				eraser3: definition([3]),
				cube: definition([0], { canPurchase: false }),
				modded: definition([4])
			},
			resources: [
				{ name: 'stone' },
				{ name: 'charonite' },
				{ name: 'elmerine' },
				{ name: 'hellgem' }
			]
		},
		shop: {
			updateElements() { game.shopUpdates += 1 },
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
				if (['name', 'position', 'entitySpan', 'par', 'init', 'surge', 'stabilizer'].includes(key)) continue
				if (typeof entity[key] !== 'function') par[key] = clone(entity[key])
			}
			if (entity.name === 'surge' && entity.stabilizer) {
				par.stabilizerPosition = clone(entity.stabilizer.position)
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
				init() {
					if (options.simulateVanillaRelationInit === true) initializeVanillaTestRelation(game, this)
					else initializeTestRelation(game, this)
				},
				getNeighbours() { return getTestNeighbours(game, this) },
				onDelete() {
					if (options.simulateVanillaRelationInit === true) deleteVanillaTestRelation(game, this)
				}
			}
			if (misc && typeof misc === 'object') Object.assign(entity, clone(misc))
			this.stuff.push(entity)
			this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
			writeEntityCells(cells, entity)
			if (options.simulateVanillaRelationInit === true) entity.init()
			return entity
		},
		clearCell(position) {
			this.clearCalls += 1
			if (this.failClearAt && this.clearCalls === this.failClearAt) {
				throw new Error('forced clear failure')
			}
			const entity = this.entityAtCoordinates(position)
			if (!entity) return false
			let neighbours = []
			if (options.simulateVanillaRelationInit === true) {
				entity.onDelete?.()
				neighbours = entity.getNeighbours?.() || []
			} else {
				disconnectTestRelation(entity)
			}
			for (const [key, value] of Array.from(cells.entries())) {
				if (value === entity) cells.delete(key)
			}
			const index = this.stuff.indexOf(entity)
			if (index >= 0) this.stuff.splice(index, 1)
			this.entitiesInGame[entity.name] = Math.max(
				0,
				(Number(this.entitiesInGame[entity.name]) || 0) - 1
			)
			this.shop.updateElements()
			if (Number.isFinite(Number(options.resourceGrowthPerClear))) {
				this.resources[0] = (Number(this.resources[0]) || 0) + Number(options.resourceGrowthPerClear)
			}
			if (options.simulateVanillaRelationInit === true) {
				for (const neighbour of neighbours) neighbour?.init?.()
			}
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
			init() {
				if (options.simulateVanillaRelationInit === true) initializeVanillaTestRelation(game, this)
				else initializeTestRelation(game, this)
			},
			getNeighbours() { return getTestNeighbours(game, this) },
			onDelete() {
				if (options.simulateVanillaRelationInit === true) deleteVanillaTestRelation(game, this)
			}
		}
		for (const key of Object.keys(properties)) {
			if (key !== 'par') entity[key] = clone(properties[key])
		}
		this.stuff.push(entity)
		this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
		writeEntityCells(cells, entity)
		if (options.simulateVanillaRelationInit === true) entity.init()
		return entity
	}
	return game
}

function connectTestPair(stabilizer, surge) {
	if (!stabilizer || !surge) return false
	disconnectTestRelation(stabilizer)
	disconnectTestRelation(surge)
	stabilizer.surge = surge
	surge.stabilizer = stabilizer
	delete surge.stabilizerPosition
	return true
}

function disconnectTestRelation(entity) {
	if (entity?.name === 'surge' && entity.stabilizer) {
		const stabilizer = entity.stabilizer
		if (stabilizer.surge === entity) stabilizer.surge = false
		entity.stabilizer = false
	}
	if (['stabilizer', 'stabilizer2', 'stabilizer3'].includes(entity?.name) && entity.surge) {
		const surge = entity.surge
		if (surge.stabilizer === entity) surge.stabilizer = false
		entity.surge = false
	}
}

function initializeTestRelation(game, entity) {
	if (entity?.name === 'surge' && Array.isArray(entity.stabilizerPosition)) {
		const stabilizer = game.entityAtCoordinates(entity.stabilizerPosition)
		if (
			['stabilizer', 'stabilizer2', 'stabilizer3'].includes(stabilizer?.name) &&
			!stabilizer.surge
		) connectTestPair(stabilizer, entity)
		return
	}
	if (!['stabilizer', 'stabilizer2', 'stabilizer3'].includes(entity?.name)) return
	const surge = game.stuff.find(function (candidate) {
		return candidate?.name === 'surge' &&
			Array.isArray(candidate.stabilizerPosition) &&
			cellKey(candidate.stabilizerPosition) === cellKey(entity.position)
	})
	if (surge && !entity.surge) connectTestPair(entity, surge)
}

function initializeVanillaTestRelation(game, entity) {
	if (entity?.name === 'surge') {
		for (const neighbour of getTestNeighbours(game, entity)) {
			if (isTestStabilizer(neighbour)) neighbour.init()
		}
		return
	}
	if (!isTestStabilizer(entity)) return
	game.stabilizers.add(entity)
	const previousSurge = entity.surge || null
	if (previousSurge) disconnectTestRelation(entity)
	const candidates = []
	for (const neighbour of getTestNeighbours(game, entity)) {
		if (
			neighbour?.name !== 'surge' ||
			neighbour.harvestProgression ||
			neighbour.stabilizer ||
			(Array.isArray(neighbour.stabilizerPosition) &&
				cellKey(neighbour.stabilizerPosition) !== cellKey(entity.position))
		) continue
		if (neighbour === previousSurge || Array.isArray(neighbour.stabilizerPosition)) {
			candidates.length = 0
			candidates.push(neighbour)
			break
		}
		candidates.push(neighbour)
	}
	if (candidates.length) connectTestPair(entity, candidates[0])
}

function deleteVanillaTestRelation(game, entity) {
	if (entity?.name === 'surge' && entity.stabilizer) {
		const stabilizer = entity.stabilizer
		stabilizer.surge = false
		stabilizer.init()
		return
	}
	if (isTestStabilizer(entity)) {
		if (entity.surge) entity.surge.stabilizer = false
		game.stabilizers.delete(entity)
	}
}

function getTestNeighbours(game, entity) {
	const neighbours = []
	const seen = new Set()
	for (let dv = -1; dv <= 1; dv += 1) {
		for (let du = -1; du <= 1; du += 1) {
			if (du === 0 && dv === 0) continue
			const neighbour = game.entityAtCoordinates([
				entity.position[0] + du,
				entity.position[1] + dv
			])
			if (!neighbour || neighbour === entity || seen.has(neighbour)) continue
			seen.add(neighbour)
			neighbours.push(neighbour)
		}
	}
	return neighbours
}

function isTestStabilizer(entity) {
	return ['stabilizer', 'stabilizer2', 'stabilizer3'].includes(entity?.name)
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

function createPaintCubeState() {
	function normalizePaint(value) {
		const candidate = value?.worldEditorPaint || value?.par?.worldEditorPaint ||
			(value?.kind === 'world-editor-painted-cube' ? value : null)
		if (
			!candidate ||
			candidate.kind !== 'world-editor-painted-cube' ||
			candidate.reward !== 'none' ||
			![1, 2, 3].includes(candidate.version)
		) return null
		if (candidate.version === 3) {
			const growth = candidate.growth
			if (
				candidate.mode !== 'Grow' ||
				!growth ||
				growth.version !== 1 ||
				!growth.lineage ||
				!['growing', 'revealing', 'stable'].includes(growth.phase) ||
				!Number.isFinite(growth.durationMs) ||
				!Number.isFinite(growth.elapsedMs) ||
				growth.elapsedMs < 0 ||
				growth.elapsedMs > growth.durationMs
			) return null
		}
		return clone(candidate)
	}

	function capturePaintedCubeSave(entity, position) {
		const paint = normalizePaint(entity)
		const resources = Array.isArray(entity?.resources) ? entity.resources.map(Number) : null
		if (
			!paint ||
			entity?.name !== 'cube' ||
			!resources ||
			resources.length !== 64 ||
			!resources.every(resource => Number.isInteger(resource) && resource >= 0 && resource < 4)
		) return null
		return {
			name: 'cube',
			position: clone(position || entity.position),
			par: {
				state: entity.state,
				fill: entity.fill,
				unveilProgress: entity.unveilProgress,
				broken: Math.max(0, Math.min(1, Number(entity.broken) || 0)),
				resources: clone(resources),
				worldEditorPaint: paint
			}
		}
	}

	function growIdentity(value) {
		const paint = normalizePaint(value)
		if (paint?.version !== 3) return null
		return {
			version: paint.version,
			kind: paint.kind,
			reward: paint.reward,
			mode: paint.mode,
			recipe: paint.recipe,
			generated: paint.generated,
			growth: {
				version: paint.growth.version,
				lineage: paint.growth.lineage,
				durationMs: paint.growth.durationMs
			}
		}
	}

	function sameGrowIdentity(left, right) {
		return JSON.stringify(growIdentity(left)) === JSON.stringify(growIdentity(right))
	}

	return {
		growPaintVersion: 3,
		normalizePaint,
		capturePaintedCubeSave,
		sameGrowIdentity,
		matchesGrowProgress(actual, intended) {
			const actualPaint = normalizePaint(actual)
			const intendedPaint = normalizePaint(intended)
			return !!actualPaint && !!intendedPaint && sameGrowIdentity(actualPaint, intendedPaint) &&
				actualPaint.growth.elapsedMs >= intendedPaint.growth.elapsedMs
		}
	}
}

function growPaint(elapsedMs, phase = 'growing', lineage = 'grow-selection-compat') {
	return {
		version: 3,
		kind: 'world-editor-painted-cube',
		reward: 'none',
		mode: 'Grow',
		recipe: { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 },
		generated: { algorithm: 'weighted-seeded-v1', seed: 17, slots: 64 },
		growth: { version: 1, lineage, phase, durationMs: 20000, elapsedMs }
	}
}

function stablePaint(seed = '0:0') {
	return {
		version: 2,
		kind: 'world-editor-painted-cube',
		reward: 'none',
		mode: 'Cube',
		recipe: { version: 1, weights: [{ resource: 0, weight: 100 }], totalWeight: 100 },
		generated: { algorithm: 'largest-remainder-shuffle-v2', seed, slots: 64 }
	}
}

function spawnStandaloneSurge(game, position, overrides = {}) {
	return game.spawn('surge', position, Object.assign({
		state: 2,
		lifeTimer: 100,
		maxLifeTimer: 100,
		life: 100,
		maxLife: 100,
		harvestProgression: 0,
		resources: [0, 20],
		grade: 1,
		type: 1,
		rayNumber: 4,
		colors: ['#ffffff']
	}, clone(overrides)))
}

function installVanillaSurgeSave(game) {
	const fallback = game.getEntityString.bind(game)
	game.getEntityString = function (entity) {
		if (entity?.name !== 'surge') return fallback(entity)
		if (entity.saveUnavailable) throw new Error('save unavailable')
		const par = {}
		if (entity.resources !== undefined) par.resources = clone(entity.resources)
		if (entity.soul !== undefined) par.soul = entity.soul
		if (entity.grade !== undefined) {
			par.grade = entity.grade
			par.type = entity.type
			par.rayNumber = entity.rayNumber
			par.colors = clone(entity.colors)
			par.maxLife = entity.maxLifeTimer
			par.life = entity.lifeTimer
			if (entity.stabilizer) par.stabilizerPosition = clone(entity.stabilizer.position)
		}
		return {
			name: entity.name,
			position: entity.position.slice(),
			par
		}
	}
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
	const safeNames = new Set(['conductor', 'vault', 'pump', 'pump2', 'gradient', 'stabilizer', 'stabilizer2', 'stabilizer3'])
	return {
		game,
		assessEntity(entity, details) {
			if (!entity) return { safe: false, reason: 'missing' }
			if (entity.name === 'cube') return { safe: false, reason: 'unsupported-type' }
			if (!safeNames.has(entity.name)) return { safe: false, reason: 'unsupported-type' }
			if (entity.name === 'stabilizer3' && details?.allowShatteredStabilizer !== true) {
				return { safe: false, reason: 'not-purchasable' }
			}
			if (entity.indestructible) return { safe: false, reason: 'indestructible' }
			if (game.transportedEntity === entity) return { safe: false, reason: 'being-relocated' }
			if (['stabilizer', 'stabilizer2', 'stabilizer3'].includes(entity.name) && entity.surge) {
				return { safe: false, reason: 'attached-surge' }
			}
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
		beforeApply: null,
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
				this.beforeApply?.()
				this.beforeApply = null
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
			service.beforeApply?.()
			service.beforeApply = null
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
	sandbox[PAINT_CUBE_STATE_KEY] = options.paintCubeState || null
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

async function testCreativeOrdinaryStableCubeDisassemblyAndSafety() {
	const creative = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 4, 0, 0) }]
	})
	creative.game.spawn('cube', [0, 0], {
		state: 2,
		fill: 64,
		resources: new Array(64).fill(0)
	})
	creative.game.spawn('cube', [1, 0], {
		state: 0,
		fill: 0,
		resources: new Array(64).fill(0)
	})
	creative.game.spawn('cube', [2, 0], {
		state: 1,
		fill: 64,
		resources: new Array(64).fill(0)
	})
	creative.game.spawn('cube', [3, 0], {
		state: 2,
		fill: 64,
		killme: true,
		resources: new Array(64).fill(0)
	})
	creative.game.spawn('cube', [4, 0], {
		state: 2,
		fill: 64,
		resources: new Array(64).fill(0),
		worldEditorPaint: { version: 99, kind: 'world-editor-painted-cube' }
	})

	const plan = await creative.deletion.planSelections({
		removeCubes: true,
		removePaintedCubes: true
	})
	assert.equal(plan.source.removeCubes, true)
	assert.equal(plan.summary.cubeCount, 1)
	assert.equal(plan.summary.paintedCubeCount, 0)
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.summary.protectedCount, 4)
	assert.deepEqual(clone(plan.removals.map(entry => entry.layer)), ['cube'])
	assert.deepEqual(clone(plan.removals.map(entry => entry.position)), [[0, 0]])
	assert.deepEqual(clone(plan.economy.delta), [])

	const result = await creative.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(creative.game.entityAtCoordinates([0, 0]), null)
	for (let u = 1; u <= 4; u += 1) assert.ok(creative.game.entityAtCoordinates([u, 0]))
	const undo = await creative.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	assert.equal(creative.game.entityAtCoordinates([0, 0]).state, 2)
	creative.dispose()

	const normal = createEnvironment({
		creative: false,
		paintCubeState: createPaintCubeState()
	})
	normal.game.spawn('cube', [0, 0], {
		state: 2,
		fill: 64,
		resources: new Array(64).fill(0)
	})
	const normalPlan = await normal.deletion.planSelections({
		removeCubes: true,
		removePaintedCubes: true
	})
	assert.equal(normalPlan.source.removeCubes, undefined)
	assert.equal(normalPlan.summary.cubeCount, 0)
	assert.equal(normalPlan.summary.safeCount, 0)
	assert.equal(normalPlan.summary.protectedCount, 1)
	assert.ok(normal.game.entityAtCoordinates([0, 0]))
	normal.dispose()
}

async function testPaintedCubeCompatibilityAndGrowProgress() {
	const paintCubeState = createPaintCubeState()
	const env = createEnvironment({
		paintCubeState,
		selections: [{ id: 1, range: range(0, 3, 0, 0) }]
	})
	const grow = env.game.spawn('cube', [0, 0], {
		state: 0,
		fill: 0,
		unveilProgress: 0,
		resources: new Array(64).fill(0),
		worldEditorPaint: growPaint(1000)
	})
	const stable = env.game.spawn('cube', [1, 0], {
		state: 2,
		fill: 64,
		resources: new Array(64).fill(0),
		worldEditorPaint: {
			version: 2,
			kind: 'world-editor-painted-cube',
			reward: 'none',
			mode: 'Cube'
		}
	})
	env.game.spawn('cube', [2, 0], {
		state: 2,
		worldEditorPaint: { version: 2, kind: 'malformed', reward: 'none', mode: 'Cube' }
	})
	env.game.spawn('cube', [3, 0], {
		state: 2,
		worldEditorPaint: { version: 4, kind: 'world-editor-painted-cube', reward: 'none', mode: 'Grow' }
	})

	const resourcesBefore = clone(env.game.resources)
	const statsBefore = clone(env.game.stats)
	const plan = await env.deletion.planSelections({ removePaintedCubes: true })
	assert.equal(plan.summary.paintedCubeCount, 2)
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.summary.protectedCount, 2)
	assert.deepEqual(clone(plan.removals.map(entry => entry.layer)), ['painted', 'painted'])
	assert.deepEqual(clone(plan.protectedTargets.map(entry => entry.reason)), [
		'invalid-painted-cube',
		'invalid-painted-cube'
	])
	assert.deepEqual(clone(plan.economy.delta), [])
	grow.worldEditorPaint = growPaint(4000)
	grow.fill = 8
	const progressedPlan = await env.deletion.planSelections({ removePaintedCubes: true })
	assert.equal(plan.compatibilitySignature, progressedPlan.compatibilitySignature, JSON.stringify({
		before: JSON.parse(plan.compatibilitySignature),
		after: JSON.parse(progressedPlan.compatibilitySignature)
	}))
	assert.deepEqual(clone(plan.growStates.map(entry => ({
		identity: entry.identity,
		disposition: entry.disposition,
		position: entry.position
	}))), clone(progressedPlan.growStates.map(entry => ({
		identity: entry.identity,
		disposition: entry.disposition,
		position: entry.position
	}))))
	assert.equal(paintCubeState.sameGrowIdentity(plan.growStates[0].paint, progressedPlan.growStates[0].paint), true)
	assert.equal(paintCubeState.matchesGrowProgress(progressedPlan.growStates[0].paint, plan.growStates[0].paint), true, JSON.stringify({
		before: plan.growStates[0].paint,
		after: progressedPlan.growStates[0].paint
	}))
	grow.worldEditorPaint = growPaint(1000)
	grow.fill = 0

	env.transactions.beforeSecondPreflight = function () {
		grow.worldEditorPaint = growPaint(4000)
		grow.fill = 8
	}
	const result = await env.deletion.execute(plan, 'keyboard')
	assert.equal(result.executed, true, JSON.stringify({ result, diagnostics: env.deletion.diagnostics() }))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.ok(env.game.entityAtCoordinates([2, 0]))
	assert.ok(env.game.entityAtCoordinates([3, 0]))
	assert.deepEqual(clone(env.game.resources), resourcesBefore)
	assert.deepEqual(clone(env.game.stats), statsBefore)

	const undo = await env.transactions.undo()
	assert.equal(undo.executed, true, JSON.stringify(undo))
	const restoredGrow = env.game.entityAtCoordinates([0, 0])
	assert.equal(restoredGrow.worldEditorPaint.growth.elapsedMs, 4000)
	assert.equal(restoredGrow.fill, 8)
	assert.equal(env.game.entityAtCoordinates([1, 0]).worldEditorPaint.version, 2)

	restoredGrow.worldEditorPaint = growPaint(9000, 'revealing')
	restoredGrow.fill = 56
	restoredGrow.unveilProgress = 0.5
	const redo = await env.transactions.redo()
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	const secondUndo = await env.transactions.undo()
	assert.equal(secondUndo.executed, true, JSON.stringify(secondUndo))
	const latestGrow = env.game.entityAtCoordinates([0, 0])
	assert.equal(latestGrow.worldEditorPaint.growth.phase, 'revealing')
	assert.equal(latestGrow.worldEditorPaint.growth.elapsedMs, 9000)
	assert.equal(latestGrow.fill, 56)
	assert.equal(latestGrow.unveilProgress, 0.5)
	assert.deepEqual(clone(env.game.resources), resourcesBefore)
	assert.deepEqual(clone(env.game.stats), statsBefore)
	assert.equal(stable.killme, undefined)
	env.dispose()
}

async function testResourceGrowthDuringLargePaintedDeletion() {
	const paintCubeState = createPaintCubeState()
	const cubeCount = 33
	const env = createEnvironment({
		paintCubeState,
		resourceGrowthPerClear: 1,
		selections: [{ id: 1, range: range(0, cubeCount - 1, 0, 0) }]
	})
	for (let u = 0; u < cubeCount; u += 1) {
		env.game.spawn('cube', [u, 0], {
			state: 2,
			fill: 64,
			resources: new Array(64).fill(0),
			worldEditorPaint: {
				version: 2,
				kind: 'world-editor-painted-cube',
				reward: 'none',
				mode: 'Cube'
			}
		})
	}
	const resourcesBefore = env.game.resources[0]
	const plan = await env.deletion.planSelections({ removePaintedCubes: true })
	assert.equal(plan.summary.paintedCubeCount, cubeCount)
	assert.deepEqual(clone(plan.economy.delta), [])
	const result = await env.deletion.execute(plan, 'keyboard')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(env.game.resources[0], resourcesBefore + cubeCount)
	assert.equal(env.game.shopUpdates, 1)
	assert.equal(env.game.stuff.filter(entity => entity.name === 'cube').length, 0)
	const undo = await env.transactions.undo()
	assert.equal(undo.executed, true, JSON.stringify(undo))
	assert.equal(env.game.resources[0], resourcesBefore + cubeCount)
	assert.equal(env.game.shopUpdates, 2)
	assert.equal(env.game.stuff.filter(entity => entity.name === 'cube').length, cubeCount)
	env.dispose()
}

async function testProtectedRuntimeSaveDriftDoesNotInvalidateDeletion() {
	const env = createEnvironment({
		paintCubeState: createPaintCubeState(),
		creative: true,
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	env.game.spawn('cube', [0, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0),
		worldEditorPaint: stablePaint('0:0')
	})
	const surge = env.game.spawn('surge', [1, 0], {
		state: 2,
		lifeTimer: 100,
		resources: [0, 20],
		grade: 1
	})
	const plan = await env.deletion.planSelections({ removePaintedCubes: true })
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.summary.protectedCount, 1)
	assert.equal(plan.protectedTargets[0].reason, 'surge')
	surge.lifeTimer = 90
	surge.resources[1] = 19
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify({ result, diagnostics: env.deletion.diagnostics() }))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), surge)
	assert.equal(surge.lifeTimer, 90)
	assert.deepEqual(surge.resources, [0, 19])
	env.dispose()
}

async function testUndoDeletionTreatsSafeStandaloneSurgesAsEmpty() {
	async function runSuccessCase(options) {
		const env = createEnvironment({
			creative: options.creative === true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: clone(options.range) }]
		})
		options.spawnTarget(env.game)
		const plan = await env.deletion.planSelections(options.planOptions || {})
		assert.equal(plan.summary.safeCount, 1, options.label)
		const deleted = await env.deletion.execute(plan, 'mouse')
		assert.equal(deleted.executed, true, JSON.stringify(deleted))
		assert.equal(env.game.entityAtCoordinates(options.surgePosition), null, options.label)

		spawnStandaloneSurge(env.game, options.surgePosition)
		const undo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({ label: options.label, undo }))
		const restored = env.game.entityAtCoordinates(options.targetPosition)
		assert.equal(restored?.name, options.targetName, options.label)
		assert.equal(env.game.entityAtCoordinates(options.surgePosition), restored, options.label)
		assert.equal(env.game.stuff.some(entity => entity.name === 'surge'), false, options.label)

		const redo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, true, JSON.stringify({ label: options.label, redo }))
		assert.equal(env.game.entityAtCoordinates(options.targetPosition), null, options.label)
		assert.equal(env.game.entityAtCoordinates(options.surgePosition), null, options.label)
		assert.equal(env.game.stuff.some(entity => entity.name === 'surge'), false, options.label)

		const secondUndo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(secondUndo.executed, true, JSON.stringify({ label: options.label, secondUndo }))
		assert.equal(env.game.entityAtCoordinates(options.targetPosition)?.name, options.targetName, options.label)
		assert.equal(env.game.stuff.some(entity => entity.name === 'surge'), false, options.label)
		env.dispose()
	}

	await runSuccessCase({
		label: 'single-cell building',
		range: range(0, 0, 0, 0),
		targetName: 'conductor',
		targetPosition: [0, 0],
		surgePosition: [0, 0],
		spawnTarget(game) {
			game.spawn('conductor', [0, 0], { channel: 3 })
		}
	})
	await runSuccessCase({
		label: 'multi-cell building',
		range: range(0, 0, 0, 0),
		targetName: 'vault',
		targetPosition: [0, 0],
		surgePosition: [1, 0],
		spawnTarget(game) {
			game.spawn('vault', [0, 0], { capacity: 9 })
		}
	})
	await runSuccessCase({
		label: 'ordinary Cube',
		creative: true,
		range: range(0, 0, 0, 0),
		planOptions: { removeCubes: true },
		targetName: 'cube',
		targetPosition: [0, 0],
		surgePosition: [0, 0],
		spawnTarget(game) {
			game.spawn('cube', [0, 0], {
				pump: false,
				state: 2,
				fill: 64,
				resources: new Array(64).fill(0)
			})
		}
	})
	await runSuccessCase({
		label: 'painted Cube',
		range: range(0, 0, 0, 0),
		planOptions: { removePaintedCubes: true },
		targetName: 'cube',
		targetPosition: [0, 0],
		surgePosition: [0, 0],
		spawnTarget(game) {
			game.spawn('cube', [0, 0], {
				state: 2,
				fill: 64,
				broken: 0,
				resources: new Array(64).fill(0),
				worldEditorPaint: stablePaint('surge-restore')
			})
		}
	})

	async function runProtectedCase(label, configure) {
		const env = createEnvironment({ paintCubeState: createPaintCubeState() })
		env.game.spawn('conductor', [0, 0], { channel: 3 })
		const plan = await env.deletion.planSelections()
		assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true, label)
		const surge = spawnStandaloneSurge(env.game, [0, 0])
		configure(env, surge)
		const occupantBefore = env.game.entityAtCoordinates([0, 0])
		const clearsBefore = env.game.clearCalls
		const undo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, false, JSON.stringify({ label, undo }))
		assert.equal(undo.error.code, 'EXTERNAL_CHANGE', JSON.stringify({ label, undo }))
		assert.equal(env.game.entityAtCoordinates([0, 0]), occupantBefore, label)
		assert.equal(env.game.clearCalls, clearsBefore, label)
		env.dispose()
	}

	await runProtectedCase('connected Surge', (env, surge) => {
		const stabilizer = env.game.spawn('stabilizer', [2, 0])
		surge.stabilizer = stabilizer
		stabilizer.surge = surge
	})
	await runProtectedCase('reserved Surge connection', (env, surge) => {
		surge.stabilizerPosition = [2, 0]
	})
	await runProtectedCase('harvesting Surge', (env, surge) => {
		surge.harvestProgression = 0.25
	})
	await runProtectedCase('dying Surge', (env, surge) => {
		surge.lifeTimer = 0
	})
	await runProtectedCase('killme Surge', (env, surge) => {
		surge.killme = true
	})
	await runProtectedCase('unserializable Surge', (env, surge) => {
		surge.saveUnavailable = true
	})
	await runProtectedCase('wrong occupied entity', env => {
		env.game.clearCell([0, 0])
		env.game.spawn('modded', [0, 0])
	})

	const raced = createEnvironment({ paintCubeState: createPaintCubeState() })
	raced.game.spawn('conductor', [0, 0], { channel: 3 })
	const racedPlan = await raced.deletion.planSelections()
	assert.equal((await raced.deletion.execute(racedPlan, 'mouse')).executed, true)
	const racedSurge = spawnStandaloneSurge(raced.game, [0, 0])
	const racedStabilizer = raced.game.spawn('stabilizer', [2, 0])
	raced.transactions.beforeSecondPreflight = function () {
		racedSurge.stabilizer = racedStabilizer
		racedStabilizer.surge = racedSurge
	}
	const racedClearsBefore = raced.game.clearCalls
	const racedUndo = await raced.transactions.undo({ input: 'keyboard' })
	assert.equal(racedUndo.executed, false, JSON.stringify(racedUndo))
	assert.equal(racedUndo.error.code, 'EXTERNAL_CHANGE', JSON.stringify(racedUndo))
	assert.equal(raced.game.entityAtCoordinates([0, 0]), racedSurge)
	assert.equal(raced.game.clearCalls, racedClearsBefore)
	raced.dispose()

	const rolledBack = createEnvironment({ paintCubeState: createPaintCubeState() })
	rolledBack.game.spawn('conductor', [0, 0], { channel: 3 })
	const rollbackPlan = await rolledBack.deletion.planSelections()
	assert.equal((await rolledBack.deletion.execute(rollbackPlan, 'mouse')).executed, true)
	const rollbackSurge = spawnStandaloneSurge(rolledBack.game, [0, 0], {
		lifeTimer: 73,
		life: 73,
		resources: [1, 19]
	})
	const rollbackSave = clone(rolledBack.game.getEntityString(rollbackSurge))
	rolledBack.game.codex.entities.conductor = null
	const rollbackUndo = await rolledBack.transactions.undo({ input: 'keyboard' })
	assert.equal(rollbackUndo.executed, false, JSON.stringify(rollbackUndo))
	assert.equal(rollbackUndo.reason, 'rolled-back', JSON.stringify(rollbackUndo))
	const restoredSurge = rolledBack.game.entityAtCoordinates([0, 0])
	assert.equal(restoredSurge?.name, 'surge')
	assert.deepEqual(clone(rolledBack.game.getEntityString(restoredSurge)), rollbackSave)
	rolledBack.dispose()
}

async function testSurgeLifeDriftUsesLatestUndoStateAndStrictGuards() {
	function spawnCutSurge(game, overrides = {}) {
		return spawnStandaloneSurge(game, [1, 0], Object.assign({
			lifeTimer: 100,
			maxLifeTimer: 100,
			life: 100,
			maxLife: 100
		}, clone(overrides)))
	}

	function createCutEnvironment() {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 1, 0, 0) }]
		})
		installVanillaSurgeSave(env.game)
		env.game.spawn('conductor', [0, 0], { channel: 3 })
		return { env, surge: spawnCutSurge(env.game) }
	}

	const current = createCutEnvironment()
	const plan = await current.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.summary.surgeCount, 1)
	current.surge.lifeTimer = 99
	current.env.transactions.beforeSecondPreflight = function () {
		current.surge.lifeTimer = 98
	}
	current.env.transactions.beforeApply = function () {
		current.surge.lifeTimer = 97
	}
	const deleted = await current.env.deletion.execute(plan, 'cut', { origin: 'cut' })
	assert.equal(deleted.executed, true, JSON.stringify({
		deleted,
		diagnostics: current.env.deletion.diagnostics()
	}))
	assert.equal(current.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(current.env.game.entityAtCoordinates([1, 0]), null)

	const undo = await current.env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	const restored = current.env.game.entityAtCoordinates([1, 0])
	assert.equal(restored?.name, 'surge')
	assert.equal(restored.life, 97)
	assert.equal(restored.maxLife, 100)
	// The production Surge constructor maps restored life/maxLife values back to timers.
	// The compact harness records that mapping explicitly before simulating more runtime decay.
	current.env.transactions.beforeSecondPreflight = function () {
		restored.lifeTimer = 95
		restored.maxLifeTimer = 100
	}
	current.env.transactions.beforeApply = function () {
		restored.lifeTimer = 94
	}
	restored.lifeTimer = 96
	restored.maxLifeTimer = 100
	const redo = await current.env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(current.env.game.entityAtCoordinates([1, 0]), null)
	const secondUndo = await current.env.transactions.undo({ input: 'keyboard' })
	assert.equal(secondUndo.executed, true, JSON.stringify(secondUndo))
	assert.equal(current.env.game.entityAtCoordinates([1, 0])?.life, 94)
	current.env.dispose()

	async function assertRejected(label, mutate) {
		const test = createCutEnvironment()
		const testPlan = await test.env.deletion.planSelections({ removeSurges: true })
		await mutate(test.env, test.surge)
		const result = await test.env.deletion.execute(testPlan, 'cut', { origin: 'cut' })
		assert.equal(result.executed, false, JSON.stringify({ label, result }))
		assert.equal(result.error.code, 'TARGET_CHANGED', JSON.stringify({ label, result }))
		assert.equal(test.env.game.entityAtCoordinates([0, 0])?.name, 'conductor', label)
		assert.equal(test.env.game.stuff.some(entity => entity.name === 'surge'), true, label)
		assert.equal(test.env.transactions.snapshot().undoCount, 0, label)
		test.env.dispose()
	}

	await assertRejected('Surge life increase', (env, surge) => { surge.lifeTimer = 101 })
	await assertRejected('Surge life exhaustion', (env, surge) => { surge.lifeTimer = 0 })
	await assertRejected('Surge harvesting', (env, surge) => { surge.harvestProgression = 0.25 })
	await assertRejected('Surge killme', (env, surge) => { surge.killme = true })
	await assertRejected('Surge identity replacement', (env, surge) => {
		env.game.clearCell(surge.position)
		spawnCutSurge(env.game)
	})
	await assertRejected('Surge position change', (env, surge) => { surge.position = [2, 0] })
	await assertRejected('Surge resource change', (env, surge) => { surge.resources[1] = 19 })
	await assertRejected('Surge type change', (env, surge) => { surge.type = 2 })
	await assertRejected('Surge max life change', (env, surge) => { surge.maxLifeTimer = 101 })
	await assertRejected('Surge stabilizer connection', (env, surge) => {
		const stabilizer = env.game.spawn('stabilizer', [3, 0])
		surge.stabilizer = stabilizer
		stabilizer.surge = surge
	})
	await assertRejected('Surge save unavailable', (env, surge) => { surge.saveUnavailable = true })
}

async function testPaintedRuntimeDriftUsesLatestUndoState() {
	const env = createEnvironment({
		paintCubeState: createPaintCubeState(),
		creative: true
	})
	const painted = env.game.spawn('cube', [0, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0),
		worldEditorPaint: stablePaint('0:0')
	})
	const plan = await env.deletion.planSelections({ removePaintedCubes: true })
	env.transactions.beforeSecondPreflight = function () {
		painted.broken = 0.16
		painted.resources[0] = 1
	}
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify({ result, diagnostics: env.deletion.diagnostics() }))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)

	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	const restored = env.game.entityAtCoordinates([0, 0])
	assert.equal(restored.broken, 0.16)
	assert.equal(restored.resources[0], 1)
	restored.broken = 0.32
	restored.resources[0] = 2

	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	const secondUndo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(secondUndo.executed, true, JSON.stringify(secondUndo))
	const latest = env.game.entityAtCoordinates([0, 0])
	assert.equal(latest.broken, 0.32)
	assert.equal(latest.resources[0], 2)
	env.dispose()
}

async function testCrossTransactionPaintDeleteRedoRebindsCompatibleRuntimeIdentity() {
	function patternAdapter(game) {
		return {
			version: 'test-pattern-v1',
			async prepare(context, payload) {
				return {
					summary: { action: 'paint-pattern-b' },
					scope: { cells: [clone(payload.save.position)] },
					payload: clone(payload)
				}
			},
			async preflight() {
				return { ok: true }
			},
			async capture(context, record) {
				const entity = game.entityAtCoordinates(record.payload.save.position)
				return entity ? clone(game.getEntityString(entity)) : null
			},
			async apply(context, record, direction) {
				const save = record.payload.save
				if (direction === 'undo') game.clearCell(save.position)
				else game.spawn(save.name, save.position, clone(save.par))
				return { ok: true }
			},
			async verify() {
				return { ok: true }
			},
			async restore() {
				return { ok: true }
			}
		}
	}

	async function runCase(options = {}) {
		const cell = [0, 0]
		const grow = options.grow === true
		const env = createEnvironment({
			paintCubeState: createPaintCubeState(),
			creative: true
		})
		const patternA = {
			name: 'cube',
			position: cell,
			par: {
				state: 2,
				fill: 64,
				unveilProgress: 1,
				broken: 0,
				resources: new Array(64).fill(0),
				worldEditorPaint: grow
					? growPaint(20000, 'stable', 'pattern-a-lineage')
					: stablePaint('pattern-a')
			}
		}
		env.game.spawn(patternA.name, patternA.position, clone(patternA.par))
		const deletePlan = await env.deletion.planSelections({ removePaintedCubes: true })
		const deletedA = await env.deletion.execute(deletePlan, 'mouse')
		assert.equal(deletedA.executed, true, JSON.stringify(deletedA))

		const unregisterPattern = env.transactions.registerAdapter('test-paint-pattern', patternAdapter(env.game))
		const patternB = {
			name: 'cube',
			position: cell,
			par: {
				state: 2,
				fill: 64,
				unveilProgress: 1,
				broken: 0,
				resources: new Array(64).fill(1),
				worldEditorPaint: stablePaint('pattern-b')
			}
		}
		const paintedB = await env.transactions.execute({
			kind: 'test-paint-pattern',
			input: 'mouse',
			payload: { save: patternB }
		})
		assert.equal(paintedB.executed, true, JSON.stringify(paintedB))
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, 'Undo B returns to the deleted state')
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, 'Undo delete restores pattern A')

		const restored = env.game.entityAtCoordinates(cell)
		assert.ok(restored)
		const rebuiltSave = clone(env.game.getEntityString(restored))
		env.game.clearCell(cell)
		if (options.mutation !== 'empty') {
			if (options.mutation === 'wrong-name') rebuiltSave.name = 'modded'
			if (options.mutation === 'wrong-lineage') {
				rebuiltSave.par.worldEditorPaint.growth.lineage = 'external-lineage'
			}
			if (options.mutation === 'invalid-resources') rebuiltSave.par.resources.length = 63
			if (options.mutation === 'unsafe-stable') rebuiltSave.par.state = 0
			env.game.spawn(rebuiltSave.name, rebuiltSave.position, clone(rebuiltSave.par))
		}

		const redoneDelete = await env.transactions.redo({ input: 'keyboard' })
		if (options.expectedCode) {
			assert.equal(redoneDelete.executed, false, JSON.stringify(redoneDelete))
			assert.equal(redoneDelete.error.code, options.expectedCode, JSON.stringify(redoneDelete))
		} else {
			assert.equal(redoneDelete.executed, true, JSON.stringify(redoneDelete))
			assert.equal(env.game.entityAtCoordinates(cell), null)
			const restoredAgain = await env.transactions.undo({ input: 'keyboard' })
			assert.equal(restoredAgain.executed, true, JSON.stringify(restoredAgain))
			assert.ok(env.game.entityAtCoordinates(cell), 'Undo after the rebound Redo restores pattern A again')
		}
		unregisterPattern()
		env.dispose()
	}

	await runCase()
	await runCase({ mutation: 'empty', expectedCode: 'EXTERNAL_CHANGE' })
	await runCase({ mutation: 'wrong-name', expectedCode: 'EXTERNAL_CHANGE' })
	await runCase({ grow: true, mutation: 'wrong-lineage', expectedCode: 'EXTERNAL_CHANGE' })
	await runCase({ mutation: 'invalid-resources', expectedCode: 'UNSAFE_DELETION' })
	await runCase({ mutation: 'unsafe-stable', expectedCode: 'UNSAFE_DELETION' })
}

async function testPaintedRuntimeCompatibilityRemainsStrict() {
	async function expectRejected(change, expectedCode = 'TARGET_CHANGED') {
		const env = createEnvironment({ paintCubeState: createPaintCubeState(), creative: true })
		const painted = env.game.spawn('cube', [0, 0], {
			state: 2,
			fill: 64,
			broken: 0.5,
			resources: new Array(64).fill(0),
			worldEditorPaint: stablePaint('0:0')
		})
		const plan = await env.deletion.planSelections({ removePaintedCubes: true })
		change(env, painted)
		const clearsBefore = env.game.clearCalls
		const result = await env.deletion.execute(plan, 'mouse')
		assert.equal(result.executed, false, JSON.stringify(result))
		assert.equal(result.error.code, expectedCode, JSON.stringify(result))
		assert.equal(env.game.clearCalls, clearsBefore)
		env.dispose()
	}

	await expectRejected((env, painted) => {
		painted.worldEditorPaint = Object.assign({}, painted.worldEditorPaint, { reward: 'changed' })
	})
	await expectRejected((env, painted) => {
		painted.state = 0
	})
	await expectRejected((env, painted) => {
		painted.resources.length = 63
	})
	await expectRejected((env, painted) => {
		painted.broken = 0.25
	})
	await expectRejected((env, painted) => {
		env.game.clearCell(painted.position)
		env.game.spawn('cube', [0, 0], {
			state: 2,
			fill: 64,
			broken: 0.5,
			resources: new Array(64).fill(0),
			worldEditorPaint: stablePaint('0:0')
		})
	})
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
	const env = createEnvironment({ resources: [1e16], resourceGrowthPerClear: 2 })
	env.game.spawn('conductor', [0, 0])
	const plan = await env.deletion.planSelections()
	assert.deepEqual(clone(plan.economy.delta), [4])
	env.game.resources[0] += 2
	const resourcesBeforeDelete = env.game.resources[0]
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.resources[0], resourcesBeforeDelete + 6)
	const diagnostics = clone(env.deletion.diagnostics())
	assert.ok(
		diagnostics.events.some(entry => (
			entry.event === 'adapter.prepare.rebuilt' &&
			entry.details.signatureMatch === true
		))
	)
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	assert.equal(env.game.resources[0], resourcesBeforeDelete + 2)
	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal(env.game.resources[0], resourcesBeforeDelete + 8)
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

async function testConnectedStabilizerSurgeSingleAndPairTransactions() {
	function createLinkedEnvironment(selectionRange, stabilizerName = 'stabilizer', options = {}) {
		const env = createEnvironment(Object.assign({}, options, {
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: selectionRange }]
		}))
		installVanillaSurgeSave(env.game)
		const stabilizer = env.game.spawn(stabilizerName, [0, 0])
		const surge = spawnStandaloneSurge(env.game, [1, 0])
		connectTestPair(stabilizer, surge)
		return { env, stabilizer, surge }
	}

	const stabilizerOnly = createLinkedEnvironment(range(0, 0, 0, 0))
	let plan = await stabilizerOnly.env.deletion.planSelections()
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.summary.buildingCount, 1)
	assert.equal(plan.relations.length, 1)
	assert.equal(plan.relations[0].removeStabilizer, true)
	assert.equal(plan.relations[0].removeSurge, false)
	assert.equal((await stabilizerOnly.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal(stabilizerOnly.env.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(stabilizerOnly.env.game.entityAtCoordinates([1, 0]), stabilizerOnly.surge)
	assert.equal(!!stabilizerOnly.surge.stabilizer, false)
	assert.equal((await stabilizerOnly.env.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredStabilizer = stabilizerOnly.env.game.entityAtCoordinates([0, 0])
	assert.strictEqual(stabilizerOnly.surge.stabilizer, restoredStabilizer)
	assert.strictEqual(restoredStabilizer.surge, stabilizerOnly.surge)
	assert.equal((await stabilizerOnly.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(stabilizerOnly.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(!!stabilizerOnly.surge.stabilizer, false)
	stabilizerOnly.env.dispose()

	const surgeOnly = createLinkedEnvironment(range(1, 1, 0, 0))
	plan = await surgeOnly.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.summary.surgeCount, 1)
	assert.equal(plan.relations[0].removeStabilizer, false)
	assert.equal(plan.relations[0].removeSurge, true)
	assert.equal((await surgeOnly.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.strictEqual(surgeOnly.env.game.entityAtCoordinates([0, 0]), surgeOnly.stabilizer)
	assert.equal(!!surgeOnly.stabilizer.surge, false)
	assert.equal((await surgeOnly.env.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredSurge = surgeOnly.env.game.entityAtCoordinates([1, 0])
	assert.strictEqual(restoredSurge.stabilizer, surgeOnly.stabilizer)
	assert.strictEqual(surgeOnly.stabilizer.surge, restoredSurge)
	const surgeRedo = await surgeOnly.env.transactions.redo({ input: 'keyboard' })
	assert.equal(surgeRedo.executed, true, JSON.stringify(surgeRedo))
	assert.equal(surgeOnly.env.game.entityAtCoordinates([1, 0]), null)
	assert.equal(!!surgeOnly.stabilizer.surge, false)
	surgeOnly.env.dispose()

	const pair = createLinkedEnvironment(range(0, 1, 0, 0))
	plan = await pair.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.relations.length, 1)
	assert.equal(plan.relations[0].removeStabilizer, true)
	assert.equal(plan.relations[0].removeSurge, true)
	assert.equal((await pair.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal(pair.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(pair.env.game.entityAtCoordinates([1, 0]), null)
	assert.equal((await pair.env.transactions.undo({ input: 'keyboard' })).executed, true)
	const pairStabilizer = pair.env.game.entityAtCoordinates([0, 0])
	const pairSurge = pair.env.game.entityAtCoordinates([1, 0])
	assert.strictEqual(pairStabilizer.surge, pairSurge)
	assert.strictEqual(pairSurge.stabilizer, pairStabilizer)
	assert.equal((await pair.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(pair.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(pair.env.game.entityAtCoordinates([1, 0]), null)
	pair.env.dispose()

	const unsafePair = createLinkedEnvironment(range(0, 1, 0, 0))
	unsafePair.surge.harvestProgression = 0.5
	plan = await unsafePair.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 0)
	assert.equal(plan.summary.protectedCount, 2)
	assert.equal(plan.relations.length, 0)
	unsafePair.env.dispose()

	const stabilizerAutoReconnect = createLinkedEnvironment(
		range(0, 0, 0, 0),
		'stabilizer3',
		{ simulateVanillaRelationInit: true }
	)
	const competingStabilizer = stabilizerAutoReconnect.env.game.spawn('stabilizer', [2, 0])
	connectTestPair(stabilizerAutoReconnect.stabilizer, stabilizerAutoReconnect.surge)
	plan = await stabilizerAutoReconnect.env.deletion.planSelections()
	const stabilizerDelete = await stabilizerAutoReconnect.env.deletion.execute(plan, 'cut', { origin: 'cut' })
	assert.equal(stabilizerDelete.executed, true, JSON.stringify(stabilizerDelete))
	assert.equal(stabilizerAutoReconnect.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(!!stabilizerAutoReconnect.surge.stabilizer, false)
	assert.equal(Object.hasOwn(stabilizerAutoReconnect.surge, 'stabilizerPosition'), false)
	assert.equal(!!competingStabilizer.surge, false)
	assert.equal((await stabilizerAutoReconnect.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(
		stabilizerAutoReconnect.surge.stabilizer,
		stabilizerAutoReconnect.env.game.entityAtCoordinates([0, 0])
	)
	assert.equal(Object.hasOwn(stabilizerAutoReconnect.surge, 'stabilizerPosition'), false)
	assert.equal((await stabilizerAutoReconnect.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(!!stabilizerAutoReconnect.surge.stabilizer, false)
	assert.equal(Object.hasOwn(stabilizerAutoReconnect.surge, 'stabilizerPosition'), false)
	assert.equal(!!competingStabilizer.surge, false)
	stabilizerAutoReconnect.env.dispose()

	const upgradedStabilizerOnly = createLinkedEnvironment(
		range(0, 0, 0, 0),
		'stabilizer2',
		{ simulateVanillaRelationInit: true }
	)
	plan = await upgradedStabilizerOnly.env.deletion.planSelections()
	assert.equal((await upgradedStabilizerOnly.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal(!!upgradedStabilizerOnly.surge.stabilizer, false)
	assert.equal(Object.hasOwn(upgradedStabilizerOnly.surge, 'stabilizerPosition'), false)
	assert.equal((await upgradedStabilizerOnly.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(
		upgradedStabilizerOnly.surge.stabilizer,
		upgradedStabilizerOnly.env.game.entityAtCoordinates([0, 0])
	)
	assert.equal((await upgradedStabilizerOnly.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(Object.hasOwn(upgradedStabilizerOnly.surge, 'stabilizerPosition'), false)
	upgradedStabilizerOnly.env.dispose()

	const forwardRollback = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		simulateVanillaRelationInit: true,
		selections: [
			{ id: 1, range: range(0, 0, 0, 0) },
			{ id: 2, range: range(4, 4, 0, 0) }
		]
	})
	installVanillaSurgeSave(forwardRollback.game)
	const rollbackStabilizer = forwardRollback.game.spawn('stabilizer3', [0, 0])
	const rollbackSurge = spawnStandaloneSurge(forwardRollback.game, [1, 0])
	const rollbackCompetitor = forwardRollback.game.spawn('stabilizer', [2, 0])
	forwardRollback.game.spawn('conductor', [4, 0])
	connectTestPair(rollbackStabilizer, rollbackSurge)
	plan = await forwardRollback.deletion.planSelections()
	forwardRollback.game.failClearAt = 2
	const forwardFailure = await forwardRollback.deletion.execute(plan, 'mouse')
	assert.equal(forwardFailure.executed, false, JSON.stringify(forwardFailure))
	assert.equal(forwardFailure.reason, 'rolled-back', JSON.stringify(forwardFailure))
	assert.notEqual(forwardFailure.error.code, 'ROLLBACK_FAILED')
	assert.strictEqual(forwardRollback.game.entityAtCoordinates([0, 0])?.surge, rollbackSurge)
	assert.strictEqual(rollbackSurge.stabilizer, forwardRollback.game.entityAtCoordinates([0, 0]))
	assert.equal(Object.hasOwn(rollbackSurge, 'stabilizerPosition'), false)
	assert.equal(!!rollbackCompetitor.surge, false)
	assert.equal(forwardRollback.game.entityAtCoordinates([4, 0])?.name, 'conductor')
	forwardRollback.dispose()

	const surgeAutoReconnect = createLinkedEnvironment(
		range(1, 1, 0, 0),
		'stabilizer3',
		{ simulateVanillaRelationInit: true }
	)
	const competingSurge = spawnStandaloneSurge(surgeAutoReconnect.env.game, [-1, 0])
	connectTestPair(surgeAutoReconnect.stabilizer, surgeAutoReconnect.surge)
	plan = await surgeAutoReconnect.env.deletion.planSelections({ removeSurges: true })
	const surgeDelete = await surgeAutoReconnect.env.deletion.execute(plan, 'mouse')
	assert.equal(surgeDelete.executed, true, JSON.stringify(surgeDelete))
	assert.equal(surgeAutoReconnect.env.game.entityAtCoordinates([1, 0]), null)
	assert.equal(!!surgeAutoReconnect.stabilizer.surge, false)
	assert.equal(!!competingSurge.stabilizer, false)
	assert.equal(Object.hasOwn(competingSurge, 'stabilizerPosition'), false)
	const surgeUndo = await surgeAutoReconnect.env.transactions.undo({ input: 'keyboard' })
	assert.equal(surgeUndo.executed, true, JSON.stringify(surgeUndo))
	assert.strictEqual(
		surgeAutoReconnect.stabilizer.surge,
		surgeAutoReconnect.env.game.entityAtCoordinates([1, 0])
	)
	assert.equal(!!competingSurge.stabilizer, false)
	assert.equal((await surgeAutoReconnect.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(!!surgeAutoReconnect.stabilizer.surge, false)
	assert.equal(!!competingSurge.stabilizer, false)
	assert.equal(Object.hasOwn(competingSurge, 'stabilizerPosition'), false)
	surgeAutoReconnect.env.dispose()

	const undoRollback = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		simulateVanillaRelationInit: true,
		selections: [
			{ id: 1, range: range(1, 1, 0, 0) },
			{ id: 2, range: range(4, 4, 0, 0) }
		]
	})
	installVanillaSurgeSave(undoRollback.game)
	const survivingStabilizer = undoRollback.game.spawn('stabilizer3', [0, 0])
	const removedSurge = spawnStandaloneSurge(undoRollback.game, [1, 0])
	const untouchedSurge = spawnStandaloneSurge(undoRollback.game, [-1, 0])
	undoRollback.game.spawn('conductor', [4, 0])
	connectTestPair(survivingStabilizer, removedSurge)
	plan = await undoRollback.deletion.planSelections({ removeSurges: true })
	assert.equal((await undoRollback.deletion.execute(plan, 'mouse')).executed, true)
	undoRollback.game.codex.entities.conductor = null
	const undoFailure = await undoRollback.transactions.undo({ input: 'keyboard' })
	assert.equal(undoFailure.executed, false, JSON.stringify(undoFailure))
	assert.equal(undoFailure.reason, 'rolled-back', JSON.stringify(undoFailure))
	assert.notEqual(undoFailure.error.code, 'ROLLBACK_FAILED')
	assert.equal(undoRollback.game.entityAtCoordinates([1, 0]), null)
	assert.equal(!!survivingStabilizer.surge, false)
	assert.equal(!!untouchedSurge.stabilizer, false)
	assert.equal(Object.hasOwn(untouchedSurge, 'stabilizerPosition'), false)
	undoRollback.dispose()

	const changed = createLinkedEnvironment(range(0, 0, 0, 0))
	plan = await changed.env.deletion.planSelections()
	assert.equal((await changed.env.deletion.execute(plan, 'mouse')).executed, true)
	const intruder = changed.env.game.spawn('stabilizer', [2, 0])
	connectTestPair(intruder, changed.surge)
	const undo = await changed.env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, false, JSON.stringify(undo))
	assert.equal(undo.error.code, 'EXTERNAL_CHANGE')
	assert.equal(changed.env.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(changed.surge.stabilizer, intruder)
	changed.env.dispose()

	const reservedChanged = createLinkedEnvironment(range(0, 0, 0, 0), 'stabilizer3')
	plan = await reservedChanged.env.deletion.planSelections()
	assert.equal((await reservedChanged.env.deletion.execute(plan, 'mouse')).executed, true)
	reservedChanged.surge.stabilizerPosition = [5, 0]
	const reservedUndo = await reservedChanged.env.transactions.undo({ input: 'keyboard' })
	assert.equal(reservedUndo.executed, false, JSON.stringify(reservedUndo))
	assert.equal(reservedUndo.error.code, 'EXTERNAL_CHANGE')
	assert.deepEqual(clone(reservedChanged.surge.stabilizerPosition), [5, 0])
	reservedChanged.env.dispose()

	const shatteredStabilizerOnly = createLinkedEnvironment(range(0, 0, 0, 0), 'stabilizer3')
	plan = await shatteredStabilizerOnly.env.deletion.planSelections()
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.relations.length, 1)
	assert.equal(plan.relations[0].stabilizer.name, 'stabilizer3')
	assert.equal((await shatteredStabilizerOnly.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal(!!shatteredStabilizerOnly.surge.stabilizer, false)
	assert.equal((await shatteredStabilizerOnly.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(
		shatteredStabilizerOnly.surge.stabilizer,
		shatteredStabilizerOnly.env.game.entityAtCoordinates([0, 0])
	)
	shatteredStabilizerOnly.env.dispose()

	const shatteredSoulDrift = createLinkedEnvironment(range(0, 0, 0, 0), 'stabilizer3')
	shatteredSoulDrift.surge.soul = 0.2
	plan = await shatteredSoulDrift.env.deletion.planSelections()
	assert.equal(plan.relations[0].surgeSave.par.soul, 0.2)
	shatteredSoulDrift.surge.soul = 0.35
	const soulDriftDelete = await shatteredSoulDrift.env.deletion.execute(plan, 'mouse')
	assert.equal(soulDriftDelete.executed, true, JSON.stringify(soulDriftDelete))
	const soulDriftRebuilt = clone(shatteredSoulDrift.env.deletion.diagnostics()).events.find(entry => (
		entry.event === 'adapter.prepare.rebuilt'
	))
	assert.equal(soulDriftRebuilt.details.signatureMatch, false)
	assert.deepEqual(soulDriftRebuilt.details.signatureDifference.changedComponents, ['relations'])
	shatteredSoulDrift.env.game.clearCell([1, 0])
	const soulDriftUndo = await shatteredSoulDrift.env.transactions.undo({ input: 'keyboard' })
	assert.equal(soulDriftUndo.executed, true, JSON.stringify(soulDriftUndo))
	assert.equal(shatteredSoulDrift.env.game.entityAtCoordinates([1, 0]).soul, 0.35)
	shatteredSoulDrift.env.dispose()

	const shatteredRelationChanged = createLinkedEnvironment(range(0, 0, 0, 0), 'stabilizer3')
	shatteredRelationChanged.surge.soul = 0.2
	plan = await shatteredRelationChanged.env.deletion.planSelections()
	shatteredRelationChanged.surge.soul = 0.35
	shatteredRelationChanged.surge.resources = [2, 18]
	const relationChangedDelete = await shatteredRelationChanged.env.deletion.execute(plan, 'mouse')
	assert.equal(relationChangedDelete.executed, false, JSON.stringify(relationChangedDelete))
	assert.equal(relationChangedDelete.error.code, 'TARGET_CHANGED')
	assert.strictEqual(shatteredRelationChanged.env.game.entityAtCoordinates([0, 0]), shatteredRelationChanged.stabilizer)
	assert.strictEqual(shatteredRelationChanged.env.game.entityAtCoordinates([1, 0]), shatteredRelationChanged.surge)
	shatteredRelationChanged.env.dispose()

	const expiredShatteredSurge = createLinkedEnvironment(
		range(0, 0, 0, 0),
		'stabilizer3',
		{ simulateVanillaRelationInit: true }
	)
	expiredShatteredSurge.surge.type = 9
	expiredShatteredSurge.surge.lifeTimer = 0.25
	expiredShatteredSurge.surge.maxLifeTimer = 100
	expiredShatteredSurge.surge.resources = [1, 19]
	connectTestPair(expiredShatteredSurge.stabilizer, expiredShatteredSurge.surge)
	plan = await expiredShatteredSurge.env.deletion.planSelections()
	assert.equal(plan.relations[0].stabilizer.name, 'stabilizer3')
	assert.equal(plan.relations[0].surgeSave.name, 'surge')
	assert.equal(plan.relations[0].surgeSave.par.type, 9)
	assert.deepEqual(clone(plan.relations[0].surgeSave.par.resources), [1, 19])
	assert.equal((await expiredShatteredSurge.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.strictEqual(expiredShatteredSurge.env.game.entityAtCoordinates([1, 0]), expiredShatteredSurge.surge)
	expiredShatteredSurge.env.game.clearCell([1, 0])
	assert.equal(expiredShatteredSurge.env.game.entityAtCoordinates([1, 0]), null)
	const expiredUndo = await expiredShatteredSurge.env.transactions.undo({ input: 'keyboard' })
	assert.equal(expiredUndo.executed, true, JSON.stringify(expiredUndo))
	const revivedShattered = expiredShatteredSurge.env.game.entityAtCoordinates([0, 0])
	const revivedSurge = expiredShatteredSurge.env.game.entityAtCoordinates([1, 0])
	assert.equal(revivedSurge.name, 'surge')
	assert.equal(revivedSurge.type, 9)
	assert.deepEqual(clone(revivedSurge.resources), [1, 19])
	assert.strictEqual(revivedShattered.surge, revivedSurge)
	assert.strictEqual(revivedSurge.stabilizer, revivedShattered)
	assert.equal((await expiredShatteredSurge.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(expiredShatteredSurge.env.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(expiredShatteredSurge.env.game.entityAtCoordinates([1, 0]), revivedSurge)
	assert.equal(!!revivedSurge.stabilizer, false)
	assert.equal((await expiredShatteredSurge.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(
		expiredShatteredSurge.env.game.entityAtCoordinates([1, 0]).stabilizer,
		expiredShatteredSurge.env.game.entityAtCoordinates([0, 0])
	)
	expiredShatteredSurge.env.dispose()

	const expiredSurgeUndoRollback = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		simulateVanillaRelationInit: true,
		selections: [
			{ id: 1, range: range(0, 0, 0, 0) },
			{ id: 2, range: range(4, 4, 0, 0) }
		]
	})
	installVanillaSurgeSave(expiredSurgeUndoRollback.game)
	const rollbackShattered = expiredSurgeUndoRollback.game.spawn('stabilizer3', [0, 0])
	const rollbackExpiredSurge = spawnStandaloneSurge(expiredSurgeUndoRollback.game, [1, 0], {
		type: 9,
		lifeTimer: 0.25
	})
	expiredSurgeUndoRollback.game.spawn('conductor', [4, 0])
	connectTestPair(rollbackShattered, rollbackExpiredSurge)
	plan = await expiredSurgeUndoRollback.deletion.planSelections()
	assert.equal((await expiredSurgeUndoRollback.deletion.execute(plan, 'mouse')).executed, true)
	expiredSurgeUndoRollback.game.clearCell([1, 0])
	expiredSurgeUndoRollback.game.codex.entities.conductor = null
	const expiredRollbackFailure = await expiredSurgeUndoRollback.transactions.undo({ input: 'keyboard' })
	assert.equal(expiredRollbackFailure.executed, false, JSON.stringify(expiredRollbackFailure))
	assert.equal(expiredRollbackFailure.reason, 'rolled-back', JSON.stringify(expiredRollbackFailure))
	assert.notEqual(expiredRollbackFailure.error.code, 'ROLLBACK_FAILED')
	assert.equal(expiredSurgeUndoRollback.game.entityAtCoordinates([0, 0]), null)
	assert.equal(expiredSurgeUndoRollback.game.entityAtCoordinates([1, 0]), null)
	assert.equal(expiredSurgeUndoRollback.game.entityAtCoordinates([4, 0]), null)
	expiredSurgeUndoRollback.dispose()

	for (const strictName of ['stabilizer', 'stabilizer2']) {
		const missingStrictSurge = createLinkedEnvironment(range(0, 0, 0, 0), strictName)
		plan = await missingStrictSurge.env.deletion.planSelections()
		assert.equal(Object.hasOwn(plan.relations[0], 'surgeSave'), false)
		assert.equal((await missingStrictSurge.env.deletion.execute(plan, 'mouse')).executed, true)
		missingStrictSurge.env.game.clearCell([1, 0])
		const strictUndo = await missingStrictSurge.env.transactions.undo({ input: 'keyboard' })
		assert.equal(strictUndo.executed, false, JSON.stringify(strictUndo))
		assert.equal(strictUndo.error.code, 'EXTERNAL_CHANGE')
		assert.equal(missingStrictSurge.env.game.entityAtCoordinates([0, 0]), null)
		assert.equal(missingStrictSurge.env.game.entityAtCoordinates([1, 0]), null)
		missingStrictSurge.env.dispose()
	}

	const shatteredSurgeOnly = createLinkedEnvironment(range(1, 1, 0, 0), 'stabilizer3')
	plan = await shatteredSurgeOnly.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 1)
	assert.equal(plan.relations[0].stabilizer.name, 'stabilizer3')
	assert.equal((await shatteredSurgeOnly.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal(!!shatteredSurgeOnly.stabilizer.surge, false)
	assert.equal((await shatteredSurgeOnly.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(
		shatteredSurgeOnly.stabilizer.surge,
		shatteredSurgeOnly.env.game.entityAtCoordinates([1, 0])
	)
	shatteredSurgeOnly.env.dispose()

	const shatteredPair = createLinkedEnvironment(range(0, 1, 0, 0), 'stabilizer3')
	plan = await shatteredPair.env.deletion.planSelections({ removeSurges: true })
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.relations[0].stabilizer.name, 'stabilizer3')
	assert.equal((await shatteredPair.env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal((await shatteredPair.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal((await shatteredPair.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(shatteredPair.env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(shatteredPair.env.game.entityAtCoordinates([1, 0]), null)
	shatteredPair.env.dispose()

	const shatteredChanged = createLinkedEnvironment(range(0, 0, 0, 0), 'stabilizer3')
	plan = await shatteredChanged.env.deletion.planSelections()
	assert.equal((await shatteredChanged.env.deletion.execute(plan, 'mouse')).executed, true)
	const secondShattered = shatteredChanged.env.game.spawn('stabilizer3', [5, 0])
	const shatteredUndo = await shatteredChanged.env.transactions.undo({ input: 'keyboard' })
	assert.equal(shatteredUndo.executed, false)
	assert.equal(shatteredUndo.error.code, 'EXTERNAL_CHANGE')
	assert.strictEqual(shatteredChanged.env.game.entityAtCoordinates([5, 0]), secondShattered)
	assert.equal(shatteredChanged.env.game.entityAtCoordinates([0, 0]), null)
	shatteredChanged.env.dispose()

	const nonCreative = createEnvironment({
		creative: false,
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	nonCreative.game.spawn('stabilizer3', [0, 0])
	plan = await nonCreative.deletion.planSelections()
	assert.equal(plan.summary.safeCount, 0)
	assert.equal(plan.summary.protectedCount, 1)
	assert.equal(plan.protectedTargets[0].reason, 'not-purchasable')
	nonCreative.dispose()
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
		'deleteConfirmPaintedMessage',
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
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	assert.ok(i18n.toolbarKeys.includes('toolbarCardDelete'))
	for (const language of i18n.languages) {
		for (const key of keys) {
			assert.notEqual(i18n.t(language, key), key, language + '.' + key)
			assert.ok(i18n.t(language, key).trim(), language + '.' + key)
		}
	}
	assert.match(i18n.t('sch', 'deleteConfirmMessage'), /\{safe\}.*\{protected\}.*\{cross\}/)
	for (const language of i18n.languages) {
		const message = i18n.t(language, 'deleteConfirmPaintedMessage')
		for (const placeholder of ['{buildings}', '{ordinary}', '{painted}', '{protected}', '{cross}']) {
			assert.ok(message.includes(placeholder), language + '.deleteConfirmPaintedMessage.' + placeholder)
		}
	}

	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.6.0')
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
	assert.match(ui, /planSelections\(\{\s*removeCubes: true,\s*removePaintedCubes: true,\s*removeSurges: creativeActive\s*\}\)/)
	assert.match(ui, /cubeCount: Number\(plan\?\.summary\?\.cubeCount\) \|\| 0/)
	assert.match(ui, /summary\.cubeCount > 0 \|\| summary\.paintedCubeCount > 0/)
	assert.match(ui, /ordinary: summary\.cubeCount/)
	assert.match(ui, /deleteConfirmPaintedMessage/)
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
	assert.match(readme, /Creative Mode Disassemble Selection automatically includes eligible ordinary Stable Cubes/)
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
	await testCreativeOrdinaryStableCubeDisassemblyAndSafety()
	await testPaintedCubeCompatibilityAndGrowProgress()
	await testResourceGrowthDuringLargePaintedDeletion()
	await testProtectedRuntimeSaveDriftDoesNotInvalidateDeletion()
	await testUndoDeletionTreatsSafeStandaloneSurgesAsEmpty()
	await testSurgeLifeDriftUsesLatestUndoStateAndStrictGuards()
	await testPaintedRuntimeDriftUsesLatestUndoState()
	await testCrossTransactionPaintDeleteRedoRebindsCompatibleRuntimeIdentity()
	await testPaintedRuntimeCompatibilityRemainsStrict()
	await testConnectedStabilizerSurgeSingleAndPairTransactions()
	testLocalizationManifestUiAndDocumentation()
	console.log('World Editor 4C-1a verification passed: union planning, Creative Stable ordinary Cube dismantling, painted Cube and Surge runtime compatibility, Grow drift, protection, economy, snapshots, atomic delete, undo/redo, UI guards, 20 languages, and scope boundaries.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
