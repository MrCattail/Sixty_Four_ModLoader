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
				silo: definition([6]),
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
			if (entity.name === 'cube' && Number(entity.state) !== 2) return undefined
			const par = clone(entity.par || {})
			for (const key of Object.keys(entity)) {
				if (['name', 'position', 'entitySpan', 'par', 'init', 'surge', 'stabilizer', 'pump'].includes(key)) continue
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
			if (misc && typeof misc === 'object') {
				for (const key of Object.keys(misc)) {
					entity[key] = key === 'pump' ? misc[key] : clone(misc[key])
				}
			}
			this.stuff.push(entity)
			this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
			writeEntityCells(cells, entity)
			if (options.simulateVanillaRelationInit === true) {
				entity.init()
				for (const neighbour of getTestNeighbours(game, entity)) neighbour.init?.()
			}
			return entity
		},
		moveEntity(entity, position) {
			for (const [key, value] of Array.from(cells.entries())) {
				if (value === entity) cells.delete(key)
			}
			entity.position = position.slice()
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
			if (key !== 'par') entity[key] = key === 'pump' ? properties[key] : clone(properties[key])
		}
		this.stuff.push(entity)
		this.entitiesInGame[name] = (Number(this.entitiesInGame[name]) || 0) + 1
		writeEntityCells(cells, entity)
		if (options.simulateVanillaRelationInit === true) {
			entity.init()
			for (const neighbour of getTestNeighbours(game, entity)) neighbour.init?.()
		}
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
	if (entity?.name === 'conductor') {
		initializeTestConductorVariant(game, entity)
		return
	}
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

function initializeTestConductorVariant(game, entity) {
	const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]]
	const connectedNames = new Set([
		'conductor',
		'chasm',
		'silo2',
		'gradient',
		'generaldecay',
		'waypoint2'
	])
	const map = offsets.map(function (offset) {
		const neighbour = game.entityAtCoordinates([
			entity.position[0] + offset[0],
			entity.position[1] + offset[1]
		])
		return connectedNames.has(neighbour?.name) ? 'a' : 'b'
	}).join('')
	const df = 1 / 11
	const variants = {
		bbbb: 0,
		bbab: df,
		abab: df,
		abbb: df,
		bbaa: df * 2,
		abba: df * 3,
		aabb: df * 4,
		baab: df * 5,
		aaba: df * 6,
		abaa: df * 7,
		baaa: df * 8,
		aaab: df * 9,
		aaaa: df * 10
	}
	entity.variant = variants[map] || 0
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

function spawnAttachedCube(game, pump, position, overrides = {}) {
	const cube = game.spawn('cube', position, Object.assign({
		state: 0,
		fill: 12,
		maxFill: 64,
		reversePause: 100,
		reverseTimer: 80,
		reverseSpeed: 0.01,
		unveilSpeed: 0.004,
		unveilProgress: 0,
		broken: 0,
		baseBreakPower: 0.08,
		breakPower: 0.08,
		shakePower: 0.04,
		resources: new Array(64).fill(0)
	}, clone(overrides)))
	cube.pump = pump
	return cube
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
	const safeNames = new Set(['conductor', 'silo', 'vault', 'pump', 'pump2', 'gradient', 'stabilizer', 'stabilizer2', 'stabilizer3'])
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
			if (['pump', 'pump2'].includes(entity.name)) {
				const attached = game.stuff.filter(candidate => (
					candidate?.name === 'cube' &&
					[0, 1].includes(Number(candidate.state)) &&
					candidate.killme !== true &&
					candidate.pump === entity
				))
				const safelyBundled = attached.length > 0 && attached.every(candidate => (
					[0, 1].includes(Number(candidate.state)) &&
					candidate.killme !== true &&
					Array.isArray(candidate.resources) &&
					candidate.resources.length === 64
				))
				if (attached.length && (details?.allowAttachedCube !== true || !safelyBundled)) {
					return { safe: false, reason: 'attached-cube' }
				}
			}
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
		beforeVerify: null,
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
				context.snapshotId = 'snapshot-' + sequence
				this.beforeSecondPreflight?.()
				this.beforeSecondPreflight = null
				await approve(adapter.preflight(context, record, 'forward'))
				assert.deepEqual(clone(await adapter.capture(context, record)), record.before)
				this.beforeApply?.()
				this.beforeApply = null
				applied = true
				await adapter.apply(context, record, 'forward')
				record.after = clone(await adapter.capture(context, record))
				const beforeVerify = this.beforeVerify
				this.beforeVerify = null
				beforeVerify?.('forward')
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
			context.snapshotId = 'snapshot-' + sequence
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
				const beforeVerify = service.beforeVerify
				service.beforeVerify = null
				beforeVerify?.(direction)
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
			return setTimeout(function () {
				options.onAnimationFrame?.(game)
				callback()
			}, 0)
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

async function testDynamicOrdinaryCubeLayerDoesNotBlockBuildings() {
	const retained = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	retained.game.spawn('silo', [0, 0], { fill: 3 })
	const oldRetainedCube = retained.game.spawn('cube', [1, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const retainedPlan = await retained.deletion.planSelections({ removeCubes: false })
	assert.equal(retainedPlan.summary.safeCount, 1)
	assert.equal(retainedPlan.summary.protectedCount, 1)
	retained.transactions.beforeSecondPreflight = function () {
		retained.game.clearCell(oldRetainedCube.position)
		retained.game.spawn('cube', [1, 0], {
			state: 2,
			fill: 64,
			broken: 0.25,
			resources: new Array(64).fill(1)
		})
	}
	const retainedResult = await retained.deletion.execute(retainedPlan, 'mouse')
	assert.equal(retainedResult.executed, true, JSON.stringify({
		retainedResult,
		diagnostics: retained.deletion.diagnostics()
	}))
	assert.equal(retained.game.entityAtCoordinates([0, 0]), null)
	assert.equal(retained.game.entityAtCoordinates([1, 0])?.name, 'cube')
	assert.equal((await retained.transactions.undo()).executed, true)
	assert.equal(retained.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.equal(retained.game.entityAtCoordinates([1, 0])?.name, 'cube')
	retained.dispose()

	const cut = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 4, 0, 0) }]
	})
	cut.game.spawn('silo', [0, 0], { fill: 5 })
	const cubeA = cut.game.spawn('cube', [1, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const cubeB = cut.game.spawn('cube', [2, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const cutPlan = await cut.deletion.planSelections({ removeCubes: true })
	cut.transactions.beforeSecondPreflight = function () {
		cubeA.resources[0] = 3
		cubeA.broken = 0.5
		cut.game.clearCell(cubeB.position)
		cut.game.spawn('cube', [3, 0], {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(2)
		})
	}
	const cutResult = await cut.deletion.execute(cutPlan, 'mouse', { origin: 'cut' })
	assert.equal(cutResult.executed, true, JSON.stringify({
		cutResult,
		diagnostics: cut.deletion.diagnostics()
	}))
	assert.equal(cut.game.entityAtCoordinates([0, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([1, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([2, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([3, 0]), null)

	const undo = await cut.transactions.undo()
	assert.equal(undo.executed, true, JSON.stringify(undo))
	assert.equal(cut.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.equal(cut.game.entityAtCoordinates([1, 0])?.resources[0], 3)
	assert.equal(cut.game.entityAtCoordinates([2, 0]), null)
	const restoredC = cut.game.entityAtCoordinates([3, 0])
	assert.equal(restoredC?.resources[0], 2)
	cut.game.entityAtCoordinates([1, 0]).resources[0] = 7
	cut.game.clearCell(restoredC.position)
	const laterCube = cut.game.spawn('cube', [4, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(4)
	})

	const redo = await cut.transactions.redo()
	assert.equal(redo.executed, true, JSON.stringify({ redo, diagnostics: cut.deletion.diagnostics() }))
	assert.equal(cut.game.entityAtCoordinates([0, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([1, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([3, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([4, 0]), laterCube)
	const secondUndo = await cut.transactions.undo()
	assert.equal(secondUndo.executed, true, JSON.stringify(secondUndo))
	assert.equal(cut.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.equal(cut.game.entityAtCoordinates([1, 0])?.resources[0], 7)
	assert.equal(cut.game.entityAtCoordinates([3, 0]), null)
	assert.equal(cut.game.entityAtCoordinates([4, 0]), laterCube)
	cut.dispose()

	const moved = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	moved.game.spawn('silo', [0, 0], { fill: 1 })
	const movedCube = moved.game.spawn('cube', [1, 0], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const movedPlan = await moved.deletion.planSelections({ removeCubes: true })
	moved.transactions.beforeSecondPreflight = function () {
		movedCube.position = [2, 0]
	}
	const movedResult = await moved.deletion.execute(movedPlan, 'mouse')
	assert.equal(movedResult.executed, false)
	assert.equal(movedResult.error.code, 'TARGET_CHANGED')
	assert.equal(moved.game.entityAtCoordinates([0, 0])?.name, 'silo')
	moved.dispose()
}

async function testCutRetainedCubeLayersRebindBetweenPreflights() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 10, 0, 1) }]
	})
	const firstPump = env.game.spawn('pump', [0, 0], { depth: 3 })
	const secondPump = env.game.spawn('pump2', [5, 0], { depth: 4 })
	env.game.spawn('gradient', [20, 0])
	env.game.spawn('conductor', [10, 0], { channel: 1 })
	const completingAttachment = spawnAttachedCube(env.game, firstPump, [1, 0], { fill: 63 })
	const replacedAttachment = spawnAttachedCube(env.game, secondPump, [6, 0], { fill: 18 })
	const oldOrdinary = env.game.spawn('cube', [2, 1], {
		state: 2,
		fill: 64,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const oldPainted = env.game.spawn('cube', [3, 1], {
		state: 0,
		fill: 12,
		unveilProgress: 0,
		broken: 0,
		resources: new Array(64).fill(0),
		worldEditorPaint: growPaint(4000)
	})
	const plan = await env.deletion.planSelections({
		removeCubes: false,
		removePaintedCubes: false
	})
	assert.equal(plan.summary.buildingCount, 3)
	assert.equal(plan.summary.attachedCubeCount, 2)
	assert.equal(plan.summary.protectedCount, 2)

	let currentFirstAttachment
	let currentSecondAttachment
	let currentOrdinary
	let currentPainted
	env.transactions.beforeSecondPreflight = function () {
		completingAttachment.state = 2
		completingAttachment.fill = 64
		completingAttachment.unveilProgress = 1
		currentFirstAttachment = spawnAttachedCube(env.game, firstPump, [-1, 0], { fill: 7 })

		env.game.clearCell(replacedAttachment.position)
		currentSecondAttachment = spawnAttachedCube(env.game, secondPump, [5, 1], { fill: 29 })

		env.game.clearCell(oldOrdinary.position)
		currentOrdinary = env.game.spawn('cube', [4, 1], {
			state: 0,
			fill: 9,
			broken: 0,
			resources: new Array(64).fill(1)
		})

		env.game.clearCell(oldPainted.position)
		currentPainted = env.game.spawn('cube', [7, 1], {
			state: 1,
			fill: 64,
			unveilProgress: 0.45,
			broken: 0,
			resources: new Array(64).fill(2),
			worldEditorPaint: growPaint(9000, 'revealing')
		})
	}

	const result = await env.deletion.execute(plan, 'mouse', { origin: 'cut' })
	assert.equal(result.executed, true, JSON.stringify({
		result,
		diagnostics: env.deletion.diagnostics()
	}))
	for (const position of [[0, 0], [5, 0], [10, 0], [-1, 0], [5, 1]]) {
		assert.equal(env.game.entityAtCoordinates(position), null)
	}
	assert.strictEqual(env.game.entityAtCoordinates([1, 0]), completingAttachment)
	assert.strictEqual(env.game.entityAtCoordinates([4, 1]), currentOrdinary)
	assert.strictEqual(env.game.entityAtCoordinates([7, 1]), currentPainted)
	assert.ok(!env.game.stuff.includes(currentFirstAttachment))
	assert.ok(!env.game.stuff.includes(currentSecondAttachment))
	assert.ok(env.deletion.diagnostics().events.some(event => (
		event.event === 'contract.forward.cut-retained-cubes-rebased' &&
		event.details.beforeAttachedCount === 2 &&
		event.details.afterAttachedCount === 2
	)))

	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify({ undo, diagnostics: env.deletion.diagnostics() }))
	assert.strictEqual(env.game.entityAtCoordinates([1, 0]), completingAttachment)
	assert.strictEqual(env.game.entityAtCoordinates([4, 1]), currentOrdinary)
	assert.strictEqual(env.game.entityAtCoordinates([7, 1]), currentPainted)
	assert.strictEqual(env.game.entityAtCoordinates([-1, 0]).pump, env.game.entityAtCoordinates([0, 0]))
	assert.strictEqual(env.game.entityAtCoordinates([5, 1]).pump, env.game.entityAtCoordinates([5, 0]))

	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify({ redo, diagnostics: env.deletion.diagnostics() }))
	assert.strictEqual(env.game.entityAtCoordinates([1, 0]), completingAttachment)
	assert.strictEqual(env.game.entityAtCoordinates([4, 1]), currentOrdinary)
	assert.strictEqual(env.game.entityAtCoordinates([7, 1]), currentPainted)
	env.dispose()

	const strict = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	const conductor = strict.game.spawn('conductor', [0, 0], { channel: 1 })
	strict.game.spawn('cube', [1, 0], {
		state: 0,
		fill: 5,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const strictPlan = await strict.deletion.planSelections({ removeCubes: false })
	strict.transactions.beforeSecondPreflight = function () {
		conductor.channel = 2
	}
	const rejected = await strict.deletion.execute(strictPlan, 'mouse', { origin: 'cut' })
	assert.equal(rejected.executed, false, JSON.stringify(rejected))
	assert.equal(rejected.error.code, 'TARGET_CHANGED')
	assert.strictEqual(strict.game.entityAtCoordinates([0, 0]), conductor)
	strict.dispose()

	const dismantle = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	const silo = dismantle.game.spawn('silo', [0, 0], { fill: 3 })
	const changingCube = dismantle.game.spawn('cube', [1, 0], {
		state: 0,
		fill: 5,
		broken: 0,
		resources: new Array(64).fill(0)
	})
	const dismantlePlan = await dismantle.deletion.planSelections({ removeCubes: false })
	dismantle.transactions.beforeSecondPreflight = function () {
		dismantle.game.clearCell(changingCube.position)
		dismantle.game.spawn('cube', [1, 0], {
			state: 1,
			fill: 64,
			unveilProgress: 0.2,
			broken: 0,
			resources: new Array(64).fill(1)
		})
	}
	const dismantleRejected = await dismantle.deletion.execute(dismantlePlan, 'mouse')
	assert.equal(dismantleRejected.executed, false, JSON.stringify(dismantleRejected))
	assert.equal(dismantleRejected.error.code, 'TARGET_CHANGED')
	assert.strictEqual(dismantle.game.entityAtCoordinates([0, 0]), silo)
	dismantle.dispose()
}

async function testRedoDynamicOrdinaryCubeUsesHistoricalCellAnchor() {
	function spawnOrdinaryCube(game, position, resource, overrides = {}) {
		return game.spawn('cube', position, Object.assign({
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(resource)
		}, overrides))
	}

	async function runRetainedCase(options) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 1, 0, 0) }]
		})
		env.game.spawn('silo', [0, 0], { fill: 6 })
		spawnOrdinaryCube(env.game, [1, 0], 1)
		const plan = await env.deletion.planSelections({ removeCubes: true })
		assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true, options.label)
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, options.label)
		const restoredCube = env.game.entityAtCoordinates([1, 0])
		const retainedCube = options.mutate(env.game, restoredCube)
		if (options.beforeApply) {
			env.transactions.beforeApply = function () {
				options.beforeApply(env.game, retainedCube)
			}
		}

		const redo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, true, JSON.stringify({ label: options.label, redo }))
		assert.equal(env.game.entityAtCoordinates([0, 0]), null, options.label + '.building-deleted')
		options.assertRetained(env.game, retainedCube)

		const skipped = env.deletion.diagnostics().events.filter(function (entry) {
			return entry.event === 'contract.redo.dynamic-cube-skipped' &&
				entry.details?.reason === options.reason
		}).at(-1)
		assert.ok(skipped, JSON.stringify({ label: options.label, events: env.deletion.diagnostics().events }))
		assert.deepEqual(clone(skipped.details.historicalPosition), [1, 0], options.label)
		assert.deepEqual(clone(skipped.details.currentPosition), options.currentPosition, options.label)
		options.assertDiagnostics?.(env.deletion.diagnostics().events)

		const secondUndo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(secondUndo.executed, true, JSON.stringify({ label: options.label, secondUndo }))
		assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'silo', options.label + '.building-restored')
		options.assertRetained(env.game, retainedCube)
		const secondRedo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(secondRedo.executed, true, JSON.stringify({ label: options.label, secondRedo }))
		assert.equal(env.game.entityAtCoordinates([0, 0]), null, options.label + '.building-redeleted')
		options.assertRetained(env.game, retainedCube)
		env.dispose()
	}

	await runRetainedCase({
		label: 'relocated recorded Cube',
		reason: 'relocated-recorded-cube',
		currentPosition: [3, 0],
		mutate(game, restoredCube) {
			return game.moveEntity(restoredCube, [3, 0])
		},
		assertRetained(game, retainedCube) {
			assert.strictEqual(game.entityAtCoordinates([3, 0]), retainedCube)
			assert.equal(game.entityAtCoordinates([1, 0]), null)
		}
	})

	await runRetainedCase({
		label: 'disappeared recorded Cube',
		reason: 'disappeared',
		currentPosition: null,
		mutate(game, restoredCube) {
			game.clearCell(restoredCube.position)
			return null
		},
		assertRetained(game) {
			assert.equal(game.entityAtCoordinates([1, 0]), null)
		}
	})

	await runRetainedCase({
		label: 'dynamic successor retained',
		reason: 'dynamic-successor-retained',
		currentPosition: [1, 0],
		mutate(game, restoredCube) {
			game.clearCell(restoredCube.position)
			return spawnOrdinaryCube(game, [1, 0], 9)
		},
		assertRetained(game, retainedCube) {
			assert.strictEqual(game.entityAtCoordinates([1, 0]), retainedCube)
			assert.equal(retainedCube.resources[0], 9)
		}
	})

	await runRetainedCase({
		label: 'growing vanilla Cube successor retained',
		reason: 'dynamic-successor-retained',
		currentPosition: [1, 0],
		mutate(game, restoredCube) {
			game.clearCell(restoredCube.position)
			return spawnOrdinaryCube(game, [1, 0], 5, { state: 0, fill: 32 })
		},
		assertRetained(game, retainedCube) {
			assert.strictEqual(game.entityAtCoordinates([1, 0]), retainedCube)
			assert.equal(retainedCube.state, 0)
		},
		assertDiagnostics(events) {
			assert.ok(events.some(entry => (
				entry.event === 'contract.redo.dynamic-cube-skipped' &&
				entry.details?.liveCube?.state === 0 &&
				entry.details?.liveCube?.retainable === true
			)), JSON.stringify(events))
		}
	})

	await runRetainedCase({
		label: 'revealing vanilla Cube successor retained',
		reason: 'dynamic-successor-retained',
		currentPosition: [1, 0],
		mutate(game, restoredCube) {
			game.clearCell(restoredCube.position)
			return spawnOrdinaryCube(game, [1, 0], 6, {
				state: 1,
				unveilProgress: 0.4
			})
		},
		assertRetained(game, retainedCube) {
			assert.strictEqual(game.entityAtCoordinates([1, 0]), retainedCube)
			assert.equal(retainedCube.state, 1)
		},
		assertDiagnostics(events) {
			assert.ok(events.some(entry => (
				entry.event === 'contract.redo.dynamic-cube-skipped' &&
				entry.details?.liveCube?.state === 1 &&
				entry.details?.liveCube?.paint === null
			)), JSON.stringify(events))
		}
	})

	await runRetainedCase({
		label: 'revealing successor reaches stable before Apply',
		reason: 'dynamic-successor-retained',
		currentPosition: [1, 0],
		mutate(game, restoredCube) {
			game.clearCell(restoredCube.position)
			return spawnOrdinaryCube(game, [1, 0], 7, {
				state: 1,
				unveilProgress: 0.9
			})
		},
		beforeApply(game, retainedCube) {
			retainedCube.state = 2
			retainedCube.unveilProgress = 1
		},
		assertRetained(game, retainedCube) {
			assert.strictEqual(game.entityAtCoordinates([1, 0]), retainedCube)
			assert.equal(retainedCube.state, 2)
		},
		assertDiagnostics(events) {
			const samples = events.filter(entry => (
				entry.event === 'contract.redo.dynamic-cube-skipped' &&
				entry.details?.reason === 'dynamic-successor-retained'
			)).map(entry => entry.details?.liveCube?.state)
			assert.ok(samples.includes(1), JSON.stringify(events))
			assert.ok(samples.includes(2), JSON.stringify(events))
		}
	})

	const attachedRetained = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	attachedRetained.game.spawn('silo', [0, 0], { fill: 8 })
	spawnOrdinaryCube(attachedRetained.game, [1, 0], 1)
	const attachedRetainedPlan = await attachedRetained.deletion.planSelections({ removeCubes: true })
	assert.equal((await attachedRetained.deletion.execute(attachedRetainedPlan, 'mouse')).executed, true)
	assert.equal((await attachedRetained.transactions.undo({ input: 'keyboard' })).executed, true)
	attachedRetained.game.clearCell([1, 0])
	const survivingPump = attachedRetained.game.spawn('pump', [3, 0], { depth: 4 })
	const survivingAttachedCube = spawnAttachedCube(attachedRetained.game, survivingPump, [1, 0], {
		state: 2,
		fill: 64,
		unveilProgress: 1
	})
	const attachedRetainedRedo = await attachedRetained.transactions.redo({ input: 'keyboard' })
	assert.equal(attachedRetainedRedo.executed, true, JSON.stringify(attachedRetainedRedo))
	assert.equal(attachedRetained.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(attachedRetained.game.entityAtCoordinates([1, 0]), survivingAttachedCube)
	assert.strictEqual(survivingAttachedCube.pump, survivingPump)
	const retainedAttachedEvent = attachedRetained.deletion.diagnostics().events.find(entry => (
		entry.event === 'contract.redo.dynamic-cube-skipped' &&
		entry.details?.liveCube?.state === 2 &&
		entry.details?.liveCube?.pump?.name === 'pump'
	))
	assert.ok(retainedAttachedEvent, JSON.stringify(attachedRetained.deletion.diagnostics().events))
	assert.equal((await attachedRetained.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(attachedRetained.game.entityAtCoordinates([1, 0]), survivingAttachedCube)
	attachedRetained.dispose()

	const attachedRemoved = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	const removedPump = attachedRemoved.game.spawn('pump', [0, 0], { depth: 6 })
	attachedRemoved.game.spawn('gradient', [5, 0])
	spawnAttachedCube(attachedRemoved.game, removedPump, [1, 0], {
		state: 2,
		fill: 64,
		unveilProgress: 1
	})
	const attachedRemovedPlan = await attachedRemoved.deletion.planSelections({ removeCubes: true })
	assert.equal((await attachedRemoved.deletion.execute(attachedRemovedPlan, 'mouse')).executed, true)
	assert.equal((await attachedRemoved.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredRemovedPump = attachedRemoved.game.entityAtCoordinates([0, 0])
	attachedRemoved.game.clearCell([1, 0])
	const currentAttachedCube = spawnAttachedCube(attachedRemoved.game, restoredRemovedPump, [1, 0], { fill: 19 })
	const attachedRemovedRedo = await attachedRemoved.transactions.redo({ input: 'keyboard' })
	assert.equal(attachedRemovedRedo.executed, true, JSON.stringify({
		attachedRemovedRedo,
		diagnostics: attachedRemoved.deletion.diagnostics()
	}))
	assert.equal(attachedRemoved.game.entityAtCoordinates([0, 0]), null)
	assert.equal(attachedRemoved.game.entityAtCoordinates([1, 0]), null)
	assert.ok(!attachedRemoved.game.stuff.includes(currentAttachedCube))
	assert.equal((await attachedRemoved.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(attachedRemoved.game.entityAtCoordinates([0, 0])?.name, 'pump')
	assert.strictEqual(
		attachedRemoved.game.entityAtCoordinates([1, 0])?.pump,
		attachedRemoved.game.entityAtCoordinates([0, 0])
	)
	attachedRemoved.dispose()

	async function runStrictCubeCase(options) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 1, 0, 0) }]
		})
		env.game.spawn('silo', [0, 0], { fill: 2 })
		spawnOrdinaryCube(env.game, [1, 0], 1)
		const plan = await env.deletion.planSelections({ removeCubes: true })
		assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true, options.label)
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, options.label)
		env.game.clearCell([1, 0])
		const occupant = options.spawn(env.game)
		const redo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, false, JSON.stringify({ label: options.label, redo }))
		assert.equal(redo.error.code, 'EXTERNAL_CHANGE', JSON.stringify({ label: options.label, redo }))
		assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'silo', options.label)
		assert.strictEqual(env.game.entityAtCoordinates([1, 0]), occupant, options.label)
		const denied = env.deletion.diagnostics().events.find(entry => (
			entry.event === 'contract.redo.dynamic-cube-denied' &&
			entry.details?.reason === 'strict-occupant'
		))
		assert.ok(denied, JSON.stringify({ label: options.label, events: env.deletion.diagnostics().events }))
		options.assertDiagnostic(denied.details.liveCube)
		env.dispose()
	}

	await runStrictCubeCase({
		label: 'exploded Cube remains strict',
		spawn(game) { return spawnOrdinaryCube(game, [1, 0], 2, { state: 3 }) },
		assertDiagnostic(details) {
			assert.equal(details.state, 3)
			assert.equal(details.retainable, false)
		}
	})
	await runStrictCubeCase({
		label: 'killme Cube remains strict',
		spawn(game) { return spawnOrdinaryCube(game, [1, 0], 2, { killme: true }) },
		assertDiagnostic(details) { assert.equal(details.killme, true) }
	})
	await runStrictCubeCase({
		label: 'malformed Cube resources remain strict',
		spawn(game) { return spawnOrdinaryCube(game, [1, 0], 2, { resources: new Array(63).fill(2) }) },
		assertDiagnostic(details) {
			assert.equal(details.resourcesLength, 63)
			assert.equal(details.resourcesValid, false)
		}
	})
	await runStrictCubeCase({
		label: 'painted Cube remains strict',
		spawn(game) { return spawnOrdinaryCube(game, [1, 0], 2, { worldEditorPaint: stablePaint('redo-strict') }) },
		assertDiagnostic(details) {
			assert.equal(details.hasWorldEditorPaint, true)
			assert.equal(details.paint.mode, 'Cube')
		}
	})
	await runStrictCubeCase({
		label: 'Grow Cube remains strict',
		spawn(game) {
			return spawnOrdinaryCube(game, [1, 0], 2, {
				state: 0,
				fill: 20,
				worldEditorPaint: growPaint(3000)
			})
		},
		assertDiagnostic(details) {
			assert.equal(details.paint.mode, 'Grow')
			assert.equal(details.paint.growthPhase, 'growing')
		}
	})

	const strict = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	strict.game.spawn('silo', [0, 0], { fill: 2 })
	spawnOrdinaryCube(strict.game, [1, 0], 1)
	const strictPlan = await strict.deletion.planSelections({ removeCubes: true })
	assert.equal((await strict.deletion.execute(strictPlan, 'mouse')).executed, true)
	assert.equal((await strict.transactions.undo({ input: 'keyboard' })).executed, true)
	strict.game.clearCell([1, 0])
	const strictOccupant = strict.game.spawn('conductor', [1, 0], { channel: 3 })
	const strictRedo = await strict.transactions.redo({ input: 'keyboard' })
	assert.equal(strictRedo.executed, false, JSON.stringify(strictRedo))
	assert.equal(strictRedo.error.code, 'EXTERNAL_CHANGE', JSON.stringify(strictRedo))
	assert.equal(strict.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.strictEqual(strict.game.entityAtCoordinates([1, 0]), strictOccupant)
	const strictDenied = strict.deletion.diagnostics().events.find(function (entry) {
		return entry.event === 'contract.redo.dynamic-cube-denied' &&
			entry.details?.reason === 'strict-occupant'
	})
	assert.ok(strictDenied, JSON.stringify(strict.deletion.diagnostics().events))
	assert.deepEqual(clone(strictDenied.details.historicalPosition), [1, 0])
	assert.deepEqual(clone(strictDenied.details.currentPosition), [1, 0])
	strict.dispose()

	const applyRace = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	applyRace.game.spawn('silo', [0, 0], { fill: 4 })
	spawnOrdinaryCube(applyRace.game, [1, 0], 1)
	const applyRacePlan = await applyRace.deletion.planSelections({ removeCubes: true })
	assert.equal((await applyRace.deletion.execute(applyRacePlan, 'mouse')).executed, true)
	assert.equal((await applyRace.transactions.undo({ input: 'keyboard' })).executed, true)
	let applyRaceOccupant = null
	applyRace.transactions.beforeApply = function () {
		applyRace.game.clearCell([1, 0])
		applyRaceOccupant = applyRace.game.spawn('conductor', [1, 0], { channel: 4 })
	}
	const applyRaceRedo = await applyRace.transactions.redo({ input: 'keyboard' })
	assert.equal(applyRaceRedo.executed, false, JSON.stringify(applyRaceRedo))
	assert.equal(applyRaceRedo.reason, 'rolled-back', JSON.stringify(applyRaceRedo))
	assert.equal(applyRaceRedo.error.code, 'EXTERNAL_CHANGE', JSON.stringify(applyRaceRedo))
	assert.equal(applyRace.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.strictEqual(applyRace.game.entityAtCoordinates([1, 0]), applyRaceOccupant)
	assert.ok(applyRace.deletion.diagnostics().events.some(function (entry) {
		return entry.event === 'contract.redo.dynamic-cube-denied' &&
			entry.details?.reason === 'strict-occupant'
	}), JSON.stringify(applyRace.deletion.diagnostics().events))
	applyRace.dispose()

	const initialUndoStrict = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	initialUndoStrict.game.spawn('silo', [0, 0], { fill: 5 })
	spawnOrdinaryCube(initialUndoStrict.game, [1, 0], 1)
	const initialUndoPlan = await initialUndoStrict.deletion.planSelections({ removeCubes: true })
	assert.equal((await initialUndoStrict.deletion.execute(initialUndoPlan, 'mouse')).executed, true)
	const undoOccupant = spawnOrdinaryCube(initialUndoStrict.game, [1, 0], 8, {
		state: 0,
		fill: 24
	})
	const blockedInitialUndo = await initialUndoStrict.transactions.undo({ input: 'keyboard' })
	assert.equal(blockedInitialUndo.executed, false, JSON.stringify(blockedInitialUndo))
	assert.equal(blockedInitialUndo.error.code, 'EXTERNAL_CHANGE', JSON.stringify(blockedInitialUndo))
	assert.equal(initialUndoStrict.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(initialUndoStrict.game.entityAtCoordinates([1, 0]), undoOccupant)
	initialUndoStrict.dispose()
}

async function testUndoTransientOccupantDenialReportsHistoryProvenance() {
	function spawnOrdinaryCube(game, position, resource) {
		return game.spawn('cube', position, {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(resource)
		})
	}

	async function runCase(origin) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 2, 0, 0) }]
		})
		env.game.spawn('silo', [0, 0], { fill: 6 })
		spawnOrdinaryCube(env.game, [1, 0], 1)
		spawnOrdinaryCube(env.game, [2, 0], 2)
		const plan = await env.deletion.planSelections({ removeCubes: true })
		const forward = await env.deletion.execute(plan, 'mouse', { origin })
		assert.equal(forward.executed, true, JSON.stringify({ origin, forward }))
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, origin)

		const retainedCube = env.game.entityAtCoordinates([1, 0])
		env.game.moveEntity(retainedCube, [3, 0])
		const redo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, true, JSON.stringify({ origin, redo }))
		assert.equal(env.game.entityAtCoordinates([0, 0]), null, origin)
		assert.equal(env.game.entityAtCoordinates([2, 0]), null, origin)
		env.game.moveEntity(retainedCube, [2, 0])

		const clearsBefore = env.game.clearCalls
		const deniedUndo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(deniedUndo.executed, false, JSON.stringify({ origin, deniedUndo }))
		assert.equal(deniedUndo.error.code, 'EXTERNAL_CHANGE', origin)
		assert.equal(env.game.clearCalls, clearsBefore, origin + '.zero-writes')
		assert.equal(env.game.entityAtCoordinates([0, 0]), null, origin)
		assert.strictEqual(env.game.entityAtCoordinates([2, 0]), retainedCube, origin)

		const event = env.deletion.diagnostics().events.find(entry => (
			entry.event === 'contract.undo.transient-occupant-denied' &&
			entry.details?.origin === origin
		))
		assert.ok(event, JSON.stringify({ origin, diagnostics: env.deletion.diagnostics() }))
		assert.equal(event.details.direction, 'undo', origin)
		assert.equal(event.details.descriptor.name, 'cube', origin)
		assert.equal(event.details.descriptor.layer, 'cube', origin)
		assert.deepEqual(clone(event.details.descriptor.position), [2, 0], origin)
		assert.deepEqual(clone(event.details.descriptor.footprint), {
			minU: 2,
			maxU: 2,
			minV: 0,
			maxV: 0,
			span: 0
		}, origin)
		assert.equal(event.details.occupant.name, 'cube', origin)
		assert.equal(event.details.occupant.layer, 'cube', origin)
		assert.deepEqual(clone(event.details.occupant.position), [2, 0], origin)
		assert.equal(event.details.occupant.state, 2, origin)
		assert.equal(event.details.occupant.killme, false, origin)
		assert.equal(event.details.occupant.pumpIdentity, null, origin)
		assert.equal(event.details.sameIdentity, false, origin)
		assert.equal(event.details.occupantInActualRemovals, false, origin)
		assert.equal(event.details.occupantInOriginalRemovals, true, origin)
		assert.equal(event.details.liveCube.retainable, true, origin)
		env.dispose()
	}

	await runCase('delete')
	await runCase('cut')
}

async function testUndoHistoricalCubeReplacesTransactionPumpSuccessor() {
	function createFixture(origin, failAfterRebase = false) {
		let armed = false
		let injected = null
		let env
		env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 34, 0, 0) }],
			onAnimationFrame(game) {
				if (armed === false || injected || game.entityAtCoordinates([33, 0])) return
				const restoredPump = game.entityAtCoordinates([0, 0])
				if (
					restoredPump?.name !== 'pump2' ||
					game.entityAtCoordinates([32, 0])?.name !== 'cube'
				) return
				injected = spawnAttachedCube(game, restoredPump, [33, 0], {
					fill: 17,
					resources: new Array(64).fill(91)
				})
			}
		})
		env.game.spawn('pump2', [0, 0], { depth: 11, soe: [[33, 0]] })
		env.game.spawn('gradient', [100, 0])
		for (let u = 1; u <= 34; u += 1) {
			env.game.spawn('cube', [u, 0], {
				state: 2,
				fill: 64,
				unveilProgress: 1,
				broken: 0,
				resources: new Array(64).fill(u)
			})
		}

		return {
			env,
			origin,
			get injected() { return injected },
			arm() {
				armed = true
				if (!failAfterRebase) return
				const originalAddEntity = env.game.addEntity
				let failed = false
				env.game.addEntity = function (name, position, misc, options) {
					if (
						failed === false &&
						name === 'cube' &&
						position?.[0] === 34 &&
						position?.[1] === 0
					) {
						failed = true
						throw new Error('forced post-rebase restore failure')
					}
					return originalAddEntity.call(this, name, position, misc, options)
				}
			}
		}
	}

	for (const origin of ['delete', 'cut']) {
		const fixture = createFixture(origin)
		const plan = await fixture.env.deletion.planSelections({ removeCubes: true })
		assert.equal(plan.summary.buildingCount, 1, origin)
		assert.equal(plan.summary.cubeCount, 34, origin)
		assert.equal((await fixture.env.deletion.execute(plan, 'mouse', { origin })).executed, true)
		fixture.arm()

		const undo = await fixture.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({
			origin,
			undo,
			diagnostics: fixture.env.deletion.diagnostics()
		}))
		assert.ok(fixture.injected, origin)
		assert.equal(fixture.env.game.stuff.includes(fixture.injected), false, origin)
		const restored = fixture.env.game.entityAtCoordinates([33, 0])
		assert.equal(restored?.state, 2, origin)
		assert.equal(restored?.resources?.[0], 33, origin)
		assert.notStrictEqual(restored, fixture.injected, origin)
		assert.ok(fixture.env.deletion.diagnostics().events.some(function (entry) {
			return entry.event === 'contract.undo.owner-bound-successor-rebased' &&
				entry.details?.origin === origin &&
				entry.details?.descriptor?.layer === 'cube' &&
				entry.details?.occupant?.layer === 'attached-cube'
		}), JSON.stringify(fixture.env.deletion.diagnostics()))

		assert.equal((await fixture.env.transactions.redo({ input: 'keyboard' })).executed, true, origin)
		for (let u = 0; u <= 34; u += 1) {
			assert.equal(fixture.env.game.entityAtCoordinates([u, 0]), null, origin + ':' + u)
		}
		fixture.env.dispose()
	}

	const rollback = createFixture('delete', true)
	const rollbackPlan = await rollback.env.deletion.planSelections({ removeCubes: true })
	assert.equal((await rollback.env.deletion.execute(rollbackPlan, 'mouse')).executed, true)
	rollback.arm()
	const failedUndo = await rollback.env.transactions.undo({ input: 'keyboard' })
	assert.equal(failedUndo.executed, false, JSON.stringify(failedUndo))
	assert.equal(failedUndo.reason, 'rolled-back', JSON.stringify(failedUndo))
	assert.notEqual(failedUndo.error.code, 'ROLLBACK_FAILED', JSON.stringify(failedUndo))
	assert.ok(rollback.injected)
	assert.equal(rollback.env.game.stuff.includes(rollback.injected), false)
	for (let u = 0; u <= 34; u += 1) {
		assert.equal(rollback.env.game.entityAtCoordinates([u, 0]), null, 'rollback:' + u)
	}
	rollback.env.dispose()
}

async function testUndoRestorationOccupantDenialDiagnostics() {
	async function runCase(label, createOccupant, expected) {
		let armed = false
		let injected = null
		let externalOwner = null
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 34, 0, 0) }],
			onAnimationFrame(game) {
				if (armed === false || injected || game.entityAtCoordinates([33, 0])) return
				const restoredPump = game.entityAtCoordinates([0, 0])
				if (
					restoredPump?.name !== 'pump2' ||
					game.entityAtCoordinates([32, 0])?.name !== 'cube'
				) return
				injected = createOccupant(game, restoredPump, externalOwner)
			}
		})
		env.game.spawn('pump2', [0, 0], { depth: 11, soe: [[33, 0]] })
		externalOwner = env.game.spawn('pump2', [100, 0], { depth: 3, soe: [[-67, 0]] })
		for (let u = 1; u <= 34; u += 1) {
			env.game.spawn('cube', [u, 0], {
				state: 2,
				fill: 64,
				unveilProgress: 1,
				broken: 0,
				resources: new Array(64).fill(u)
			})
		}

		const plan = await env.deletion.planSelections({ removeCubes: true })
		assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true, label)
		armed = true
		const undo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, false, label)
		assert.equal(undo.reason, 'rolled-back', label)
		assert.equal(undo.error.code, 'EXTERNAL_CHANGE', label)
		assert.equal(undo.error.message, 'A deletion restoration target changed outside World Editor.', label)
		assert.ok(injected, label)
		assert.equal(env.game.stuff.includes(injected), true, label + ': diagnostic must not clear occupant')

		const diagnostics = env.deletion.diagnostics()
		assert.equal(diagnostics.implementation, 'operating-targets-r21', label)
		const events = diagnostics.events.filter(function (entry) {
			return entry.event === 'contract.undo.restoration-occupant-denied'
		})
		assert.equal(events.length, 1, label)
		const details = events[0].details
		assert.equal(details.direction, 'undo', label)
		assert.equal(details.origin, 'delete', label)
		assert.deepEqual(clone(details.descriptor.position), [33, 0], label)
		assert.equal(details.descriptor.layer, 'cube', label)
		assert.deepEqual(clone(details.occupant.position), [33, 0], label)
		assert.equal(details.occupant.name, expected.occupantName, label)
		assert.equal(details.occupant.layer, expected.occupantLayer, label)
		assert.equal(details.liveCube.state, expected.state, label)
		assert.equal(details.baselineOccupant, null, label)
		assert.equal(details.identityProvenance.historicalIdentityOccupant, null, label)
		assert.equal(details.identityProvenance.occupantInRemovals, false, label)
		assert.equal(details.removalCount, 35, label)
		assert.equal(details.priorOwnerBoundRebaseCount, 0, label)
		for (const [gate, value] of Object.entries(expected.gates)) {
			assert.equal(details.gates[gate], value, label + ':' + gate)
		}
		assert.deepEqual(clone(details.failedGates), expected.failedGates, label)
		assert.doesNotMatch(JSON.stringify(details), /"save"|"par"/, label)
		env.dispose()
	}

	await runCase('matured transaction Pump Cube', function (game, restoredPump) {
		return spawnAttachedCube(game, restoredPump, [33, 0], {
			state: 2,
			fill: 64,
			unveilProgress: 1,
			resources: new Array(64).fill(7)
		})
	}, {
		occupantName: 'cube',
		occupantLayer: 'attached-cube',
		state: 2,
		gates: {
			historicalTargetEligible: true,
			occupantPresent: true,
			historicalIdentityAbsent: true,
			ownerIsPump: true,
			ownerRecorded: true,
			ownerAtHistoricalPosition: true,
			ownerCreatedByTransaction: true,
			occupantUnfinished: false,
			occupantRemovalSafe: true,
			baselineAuthorized: true,
			occupantNotInRemovals: true
		},
		failedGates: ['occupantUnfinished']
	})

	await runCase('unfinished Cube owned by external Pump', function (game, restoredPump, externalOwner) {
		return spawnAttachedCube(game, externalOwner, [33, 0])
	}, {
		occupantName: 'cube',
		occupantLayer: 'attached-cube',
		state: 0,
		gates: {
			historicalTargetEligible: true,
			occupantPresent: true,
			historicalIdentityAbsent: true,
			ownerIsPump: true,
			ownerRecorded: false,
			ownerAtHistoricalPosition: false,
			ownerCreatedByTransaction: false,
			occupantUnfinished: true,
			occupantRemovalSafe: true,
			baselineAuthorized: true,
			occupantNotInRemovals: true
		},
		failedGates: ['ownerRecorded', 'ownerAtHistoricalPosition', 'ownerCreatedByTransaction']
	})

	await runCase('strict building occupant', function (game) {
		return game.spawn('silo', [33, 0], { fill: 9 })
	}, {
		occupantName: 'silo',
		occupantLayer: 'building',
		state: null,
		gates: {
			historicalTargetEligible: true,
			occupantPresent: true,
			historicalIdentityAbsent: true,
			ownerIsPump: false,
			ownerRecorded: false,
			ownerAtHistoricalPosition: false,
			ownerCreatedByTransaction: false,
			occupantUnfinished: false,
			occupantRemovalSafe: false,
			baselineAuthorized: true,
			occupantNotInRemovals: true
		},
		failedGates: [
			'ownerIsPump',
			'ownerRecorded',
			'ownerAtHistoricalPosition',
			'ownerCreatedByTransaction',
			'occupantUnfinished',
			'occupantRemovalSafe'
		]
	})
}

async function testDynamicOrdinaryCubeCanDisappearDuringChunkedApply() {
	let injected = false
	let env
	env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 35, 0, 0) }],
		onAnimationFrame() {
			if (injected) return
			injected = true
			env.game.clearCell([34, 0])
			env.game.spawn('cube', [35, 0], {
				state: 2,
				fill: 64,
				broken: 0,
				resources: new Array(64).fill(9)
			})
		}
	})
	env.game.spawn('silo', [0, 0], { fill: 2 })
	for (let u = 1; u <= 34; u += 1) {
		env.game.spawn('cube', [u, 0], {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(u)
		})
	}
	const plan = await env.deletion.planSelections({ removeCubes: true })
	assert.equal(plan.summary.safeCount, 35)
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, true, JSON.stringify({ result, diagnostics: env.deletion.diagnostics() }))
	assert.equal(injected, true)
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([34, 0]), null)
	assert.equal(env.game.entityAtCoordinates([35, 0])?.resources[0], 9)
	const skipped = env.deletion.diagnostics().events.filter(function (entry) {
		return entry.event === 'apply.dynamic-cube-skipped'
	})
	assert.equal(skipped.length, 1)
	assert.deepEqual(clone(skipped[0].details.position), [34, 0])
	const undo = await env.transactions.undo()
	assert.equal(undo.executed, true, JSON.stringify(undo))
	assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.equal(env.game.entityAtCoordinates([34, 0]), null)
	assert.equal(env.game.entityAtCoordinates([35, 0])?.resources[0], 9)
	env.dispose()
}

async function testUndoDynamicCubeCommitManifestAndGoalStateRollback() {
	let reconcileArmed = false
	let reconcileInjected = false
	let reconcileEnv
	reconcileEnv = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 34, 0, 0) }],
		onAnimationFrame(game) {
			if (!reconcileArmed || reconcileInjected) return
			const restored = game.entityAtCoordinates([1, 0])
			if (!restored) return
			reconcileInjected = true
			restored.resources = new Array(64).fill(99)
		}
	})
	reconcileEnv.game.spawn('silo', [0, 0], { fill: 3 })
	for (let u = 1; u <= 34; u += 1) {
		reconcileEnv.game.spawn('cube', [u, 0], {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(u)
		})
	}
	const reconcilePlan = await reconcileEnv.deletion.planSelections({ removeCubes: true })
	assert.equal((await reconcileEnv.deletion.execute(reconcilePlan, 'mouse')).executed, true)
	reconcileArmed = true
	const reconciledUndo = await reconcileEnv.transactions.undo({ input: 'keyboard' })
	assert.equal(reconciledUndo.executed, true, JSON.stringify({
		reconciledUndo,
		diagnostics: reconcileEnv.deletion.diagnostics()
	}))
	assert.equal(reconcileInjected, true)
	assert.equal(reconcileEnv.game.entityAtCoordinates([1, 0])?.resources?.[0], 99)
	const reconcileDiagnostics = reconcileEnv.deletion.diagnostics()
	assert.equal(reconcileDiagnostics.version, 3)
	assert.equal(reconcileDiagnostics.implementation, 'operating-targets-r21')
	const reconcileEvent = reconcileDiagnostics.events.find(function (entry) {
		return entry.event === 'contract.dynamic.committed' && entry.details.position?.[0] === 1
	})
	assert.ok(reconcileEvent, JSON.stringify(reconcileDiagnostics.events))
	assert.equal(reconcileEvent.details.layer, 'cube')
	assert.equal(reconcileEvent.details.reason, 'dynamic-state-drift')
	assert.equal(reconcileEvent.details.baselineOccupant, null)
	assert.equal(reconcileEvent.details.currentOccupant.name, 'cube')
	assert.equal((await reconcileEnv.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(reconcileEnv.game.entityAtCoordinates([1, 0]), null)
	reconcileEnv.dispose()

	let rollbackArmed = false
	let rollbackInjected = false
	const rollbackEnv = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 34, 0, 0) }]
	})
	rollbackEnv.game.spawn('silo', [0, 0], { fill: 7 })
	for (let u = 1; u <= 34; u += 1) {
		rollbackEnv.game.spawn('cube', [u, 0], {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(u)
		})
	}
	const rollbackPlan = await rollbackEnv.deletion.planSelections({ removeCubes: true })
	assert.equal((await rollbackEnv.deletion.execute(rollbackPlan, 'mouse')).executed, true)
	rollbackArmed = true
	rollbackEnv.transactions.beforeVerify = function (direction) {
		if (!rollbackArmed || rollbackInjected || direction !== 'undo') return
		rollbackInjected = true
		rollbackEnv.game.entityAtCoordinates([1, 0]).resources = new Array(64).fill(77)
	}
	const rolledBackUndo = await rollbackEnv.transactions.undo({ input: 'keyboard' })
	assert.equal(rollbackInjected, true)
	assert.equal(rolledBackUndo.executed, false, JSON.stringify(rolledBackUndo))
	assert.equal(rolledBackUndo.reason, 'rolled-back', JSON.stringify(rolledBackUndo))
	assert.notEqual(rolledBackUndo.error.code, 'ROLLBACK_FAILED')
	for (let u = 0; u <= 34; u += 1) assert.equal(rollbackEnv.game.entityAtCoordinates([u, 0]), null)
	const compensation = rollbackEnv.deletion.diagnostics().events.find(function (entry) {
		return entry.event === 'contract.rollback.dynamic-compensated' && entry.details.position?.[0] === 1
	})
	assert.ok(compensation, JSON.stringify(rollbackEnv.deletion.diagnostics().events))
	assert.equal(compensation.details.reason, 'exact-identity-provenance')
	rollbackEnv.dispose()
}

async function testUndoAttachedCubeReconciliation() {
	let armed = false
	let injected = false
	let env
	env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 0, 0, 0) }],
		onAnimationFrame(game) {
			if (!armed || injected) return
			const pump = game.entityAtCoordinates([0, 0])
			const cube = game.entityAtCoordinates([-1, 0])
			if (!pump || !cube || cube.pump !== pump) return
			injected = true
			cube.state = 2
			cube.fill = 64
			cube.unveilProgress = 1
			cube.resources = new Array(64).fill(88)
		}
	})
	const pump = env.game.spawn('pump', [0, 0], { depth: 9 })
	env.game.spawn('gradient', [100, 0])
	spawnAttachedCube(env.game, pump, [-1, 0], {
		fill: 12,
		resources: new Array(64).fill(4)
	})
	for (let u = 1; u <= 32; u += 1) {
		spawnAttachedCube(env.game, pump, [u, 0], {
			fill: u,
			resources: new Array(64).fill(u)
		})
	}
	const plan = await env.deletion.planSelections()
	assert.equal(plan.summary.attachedCubeCount, 33)
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
	armed = true
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify({ undo, diagnostics: env.deletion.diagnostics() }))
	assert.equal(injected, true)
	const restoredPump = env.game.entityAtCoordinates([0, 0])
	const restoredCube = env.game.entityAtCoordinates([-1, 0])
	assert.equal(restoredCube.state, 2)
	assert.equal(restoredCube.fill, 64)
	assert.equal(restoredCube.resources[0], 88)
	assert.strictEqual(restoredCube.pump, restoredPump)
	const event = env.deletion.diagnostics().events.find(function (entry) {
		return entry.event === 'contract.dynamic.committed' && entry.details.layer === 'attached-cube'
	})
	assert.ok(event, JSON.stringify(env.deletion.diagnostics().events))
	assert.equal(event.details.reason, 'dynamic-state-drift')
	env.dispose()
}

async function testUndoAttachedCubeLifecycleContract() {
	let armed = false
	let injected = false
	let env
	env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 40, 0, 0) }],
		onAnimationFrame(game) {
			if (!armed || injected) return
			const first = game.entityAtCoordinates([1, 0])
			const second = game.entityAtCoordinates([2, 0])
			if (!first || !second) return
			injected = true
			first.state = 3
			first.killme = true
			second.state = 3
			second.killme = true
		}
	})
	const pump = env.game.spawn('pump', [0, 0], { depth: 12 })
	env.game.spawn('gradient', [100, 0])
	for (let u = 1; u <= 33; u += 1) {
		spawnAttachedCube(env.game, pump, [u, 0], {
			fill: u,
			resources: new Array(64).fill(u)
		})
	}
	env.game.spawn('silo', [40, 0], { fill: 9 })
	const plan = await env.deletion.planSelections()
	assert.equal(plan.summary.buildingCount, 2)
	assert.equal(plan.summary.attachedCubeCount, 33)
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)

	const restoreOrder = []
	const originalAddEntity = env.game.addEntity
	env.game.addEntity = function (name, position, misc, options) {
		restoreOrder.push(name)
		return originalAddEntity.call(this, name, position, misc, options)
	}
	armed = true
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify({ undo, diagnostics: env.deletion.diagnostics() }))
	assert.equal(injected, true)
	assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'pump')
	assert.equal(env.game.entityAtCoordinates([40, 0])?.name, 'silo')
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.equal(env.game.entityAtCoordinates([2, 0]), null)
	for (let u = 3; u <= 33; u += 1) assert.equal(env.game.entityAtCoordinates([u, 0])?.name, 'cube')
	const firstCube = restoreOrder.indexOf('cube')
	const lastNonCube = restoreOrder.reduce(function (last, name, index) {
		return name === 'cube' ? last : index
	}, -1)
	assert.ok(firstCube > lastNonCube, JSON.stringify(restoreOrder))
	assert.ok(env.deletion.diagnostics().events.some(function (entry) {
		return entry.event === 'contract.dynamic.committed' &&
			entry.details?.reason === 'lifecycle-terminal'
	}), JSON.stringify(env.deletion.diagnostics().events))
	env.dispose()
}

async function testUndoDynamicLifecycleRollbackProvenance() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const pump = env.game.spawn('pump', [0, 0], { depth: 7 })
	env.game.spawn('gradient', [100, 0])
	spawnAttachedCube(env.game, pump, [1, 0], { fill: 20 })
	const plan = await env.deletion.planSelections()
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
	env.transactions.beforeVerify = function (direction) {
		if (direction !== 'undo') return
		const cube = env.game.entityAtCoordinates([1, 0])
		cube.state = 3
		cube.killme = true
	}
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, false, JSON.stringify(undo))
	assert.equal(undo.reason, 'rolled-back', JSON.stringify(undo))
	assert.notEqual(undo.error.code, 'ROLLBACK_FAILED', JSON.stringify(undo))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.ok(env.deletion.diagnostics().events.some(function (entry) {
		return entry.event === 'contract.rollback.dynamic-compensated' &&
			entry.details?.reason === 'exact-identity-provenance'
	}), JSON.stringify(env.deletion.diagnostics().events))
	env.dispose()
}

async function testRedoPumpOwnedStableCubeClosure() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const pump = env.game.spawn('pump', [0, 0], { depth: 11 })
	env.game.spawn('gradient', [100, 0])
	spawnAttachedCube(env.game, pump, [1, 0], { fill: 24 })
	const plan = await env.deletion.planSelections({ removeCubes: true })
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredPump = env.game.entityAtCoordinates([0, 0])
	const stableOwnedCube = env.game.entityAtCoordinates([1, 0])
	stableOwnedCube.state = 2
	stableOwnedCube.fill = 64
	stableOwnedCube.unveilProgress = 1
	assert.strictEqual(stableOwnedCube.pump, restoredPump)

	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify({ redo, diagnostics: env.deletion.diagnostics() }))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'pump')
	assert.strictEqual(
		env.game.entityAtCoordinates([1, 0])?.pump,
		env.game.entityAtCoordinates([0, 0])
	)
	env.dispose()

	const standard = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const standardPump = standard.game.spawn('pump', [0, 0], { depth: 5 })
	standard.game.spawn('gradient', [100, 0])
	const standardCube = spawnAttachedCube(standard.game, standardPump, [1, 0], {
		state: 2,
		fill: 64,
		unveilProgress: 1
	})
	const standardPlan = await standard.deletion.planSelections()
	assert.equal(standardPlan.summary.cubeCount, 0)
	assert.equal(standardPlan.summary.attachedCubeCount, 0)
	assert.equal((await standard.deletion.execute(standardPlan, 'mouse')).executed, true)
	assert.equal(standard.game.entityAtCoordinates([0, 0]), null)
	assert.strictEqual(standard.game.entityAtCoordinates([1, 0]), standardCube)
	standard.dispose()
}

async function testLateAttachedCubeDoesNotDuplicateHistoricalOrdinaryCell() {
	function createFixture(clearFailure = '') {
		const control = {
			armed: false,
			injected: null,
			clearFailureTriggered: false
		}
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(1, 34, 0, 0) }],
			onAnimationFrame(game) {
				if (control.armed === false || control.injected || game.entityAtCoordinates([1, 0])) return
				const pump = game.entityAtCoordinates([34, 0])
				if (pump?.name !== 'pump2' || game.entityAtCoordinates([32, 0])) return
				control.injected = spawnAttachedCube(game, pump, [1, 0], {
					fill: 23,
					resources: new Array(64).fill(81)
				})
			}
		})
		for (let u = 1; u <= 33; u += 1) {
			env.game.spawn('cube', [u, 0], {
				state: 2,
				fill: 64,
				unveilProgress: 1,
				broken: 0,
				resources: new Array(64).fill(u)
			})
		}
		env.game.spawn('pump2', [34, 0], { depth: 11, soe: [[-33, 0]] })
		env.game.spawn('gradient', [100, 0])
		if (clearFailure) {
			const originalClear = env.game.clearCell
			env.game.clearCell = function (position) {
				const target = this.entityAtCoordinates(position)
				if (
					control.clearFailureTriggered === false &&
					control.injected &&
					target === control.injected
				) {
					control.clearFailureTriggered = true
					if (clearFailure === 'before-clear') throw new Error('forced vacancy successor pre-clear failure')
					const result = originalClear.call(this, position)
					throw new Error('forced vacancy successor post-clear failure')
				}
				return originalClear.call(this, position)
			}
		}
		return { env, control }
	}

	async function runSuccessCase(origin, operationDirection) {
		const fixture = createFixture()
		const plan = await fixture.env.deletion.planSelections({ removeCubes: true })
		assert.equal(plan.summary.cubeCount, 33, origin + '.' + operationDirection)
		assert.equal(plan.summary.buildingCount, 1, origin + '.' + operationDirection)
		if (operationDirection === 'redo') {
			assert.equal((await fixture.env.deletion.execute(plan, 'mouse', { origin })).executed, true)
			assert.equal((await fixture.env.transactions.undo({ input: 'keyboard' })).executed, true)
		}
		fixture.control.armed = true
		const result = operationDirection === 'redo'
			? await fixture.env.transactions.redo({ input: 'keyboard' })
			: await fixture.env.deletion.execute(plan, 'mouse', { origin })
		assert.equal(result.executed, true, JSON.stringify({ origin, operationDirection, result }))
		assert.ok(fixture.control.injected, origin + '.' + operationDirection)
		assert.equal(fixture.env.game.stuff.includes(fixture.control.injected), false)
		const suppressed = fixture.env.deletion.diagnostics().events.find(function (entry) {
			return entry.event === 'contract.forward.transaction-vacancy-cube-suppressed' &&
				entry.details?.origin === origin &&
				entry.details?.direction === operationDirection
		})
		assert.ok(suppressed, JSON.stringify(fixture.env.deletion.diagnostics()))
		assert.deepEqual(clone(suppressed.details.position), [1, 0])
		assert.equal(suppressed.details.historical.layer, 'cube')
		assert.equal(suppressed.details.successor.layer, 'attached-cube')
		const verified = fixture.env.deletion.diagnostics().events.filter(function (entry) {
			return entry.event === 'adapter.verify.complete' && entry.details?.direction === operationDirection
		}).at(-1)
		assert.equal(verified?.details?.deleteCount, 34, origin + '.' + operationDirection)

		const undo = await fixture.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({ undo, diagnostics: fixture.env.deletion.diagnostics() }))
		const restored = fixture.env.game.entityAtCoordinates([1, 0])
		assert.equal(restored?.state, 2)
		assert.equal(restored?.fill, 64)
		assert.equal(restored?.resources?.[0], 1)
		assert.ok(!restored?.pump)
		assert.equal((await fixture.env.transactions.redo({ input: 'keyboard' })).executed, true)
		assert.equal(fixture.env.game.entityAtCoordinates([1, 0]), null)
		assert.equal((await fixture.env.transactions.undo({ input: 'keyboard' })).executed, true)
		assert.equal(fixture.env.game.entityAtCoordinates([1, 0])?.resources?.[0], 1)
		fixture.env.dispose()
	}

	for (const origin of ['delete', 'cut']) {
		await runSuccessCase(origin, 'forward')
		await runSuccessCase(origin, 'redo')
	}

	for (const clearFailure of ['before-clear', 'after-clear']) {
		const fixture = createFixture(clearFailure)
		const plan = await fixture.env.deletion.planSelections({ removeCubes: true })
		fixture.control.armed = true
		const result = await fixture.env.deletion.execute(plan, 'mouse')
		assert.equal(result.executed, false, clearFailure)
		assert.equal(result.reason, 'rolled-back', clearFailure)
		assert.notEqual(result.error.code, 'ROLLBACK_FAILED', clearFailure)
		assert.equal(fixture.control.clearFailureTriggered, true, clearFailure)
		assert.ok(fixture.control.injected, clearFailure)
		assert.equal(fixture.env.game.stuff.includes(fixture.control.injected), false, clearFailure)
		assert.equal(fixture.env.game.entityAtCoordinates([34, 0])?.name, 'pump2', clearFailure)
		const restored = fixture.env.game.entityAtCoordinates([1, 0])
		assert.equal(restored?.state, 2, clearFailure)
		assert.equal(restored?.resources?.[0], 1, clearFailure)
		assert.ok(!restored?.pump, clearFailure)
		if (clearFailure === 'before-clear') {
			assert.ok(fixture.env.deletion.diagnostics().events.some(function (entry) {
				return entry.event === 'contract.rollback.transaction-vacancy-cube-cleared'
			}), JSON.stringify(fixture.env.deletion.diagnostics()))
		}
		fixture.env.dispose()
	}
}

async function testLateAttachedCubeOwnerClosureAndLegacyUndoFallback() {
	function createLateEnvironment(injectionPosition, injectionOverrides = {}) {
		const control = {
			armed: false,
			injected: null
		}
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 0, 0, 0) }],
			onAnimationFrame(game) {
				if (control.armed !== true || control.injected) return
				const pump = game.entityAtCoordinates([0, 0])
				if (!pump || game.entityAtCoordinates(injectionPosition)) return
				control.injected = spawnAttachedCube(
					game,
					pump,
					injectionPosition,
					Object.assign({
						fill: 47,
						resources: new Array(64).fill(91)
					}, injectionOverrides)
				)
			}
		})
		const pump = env.game.spawn('pump2', [0, 0], { depth: 11 })
		env.game.spawn('gradient', [100, 0])
		for (let u = 1; u <= 33; u += 1) {
			spawnAttachedCube(env.game, pump, [u, 0], {
				state: u === 1 ? 1 : 0,
				fill: u,
				resources: new Array(64).fill(u)
			})
		}
		return { env, control }
	}

	async function runClosureCase(origin, operationDirection) {
		const fixture = createLateEnvironment([1, 0])
		const plan = await fixture.env.deletion.planSelections()
		assert.equal(plan.summary.attachedCubeCount, 33, origin + '.' + operationDirection)
		if (operationDirection === 'redo') {
			const initial = await fixture.env.deletion.execute(plan, 'mouse', { origin })
			assert.equal(initial.executed, true, JSON.stringify({ origin, operationDirection, initial }))
			assert.equal((await fixture.env.transactions.undo({ input: 'keyboard' })).executed, true)
		}
		fixture.control.armed = true
		const result = operationDirection === 'redo'
			? await fixture.env.transactions.redo({ input: 'keyboard' })
			: await fixture.env.deletion.execute(plan, 'mouse', { origin })
		assert.equal(result.executed, true, JSON.stringify({ origin, operationDirection, result }))
		assert.ok(fixture.control.injected, origin + '.' + operationDirection + '.injected')
		assert.equal(fixture.env.game.entityAtCoordinates([0, 0]), null, origin + '.' + operationDirection)
		assert.equal(fixture.env.game.entityAtCoordinates([1, 0]), null, origin + '.' + operationDirection)
		assert.ok(!fixture.env.game.stuff.includes(fixture.control.injected), origin + '.' + operationDirection)

		const closure = fixture.env.deletion.diagnostics().events.find(entry => (
			entry.event === 'contract.forward.late-attached-cube-rebased' &&
			entry.details?.direction === operationDirection &&
			entry.details?.origin === origin
		))
		assert.ok(closure, JSON.stringify({ origin, operationDirection, diagnostics: fixture.env.deletion.diagnostics() }))
		assert.deepEqual(clone(closure.details.position), [1, 0])
		assert.equal(closure.details.state, 0)

		const undo = await fixture.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({ origin, operationDirection, undo }))
		const restoredPump = fixture.env.game.entityAtCoordinates([0, 0])
		const restoredCube = fixture.env.game.entityAtCoordinates([1, 0])
		assert.equal(restoredPump?.name, 'pump2', origin + '.' + operationDirection)
		assert.equal(restoredCube?.fill, 47, origin + '.' + operationDirection)
		assert.equal(restoredCube?.resources?.[0], 91, origin + '.' + operationDirection)
		assert.strictEqual(restoredCube?.pump, restoredPump, origin + '.' + operationDirection)
		assert.equal(
			fixture.env.game.stuff.filter(entity => entity.name === 'cube' && entity.pump === restoredPump).length,
			33,
			origin + '.' + operationDirection + '.no-duplicate'
		)
		const baselineRefresh = fixture.env.deletion.diagnostics().events.find(entry => (
			entry.event === 'contract.undo.pump-cube-baseline-refreshed' &&
			entry.details?.origin === origin
		))
		assert.ok(baselineRefresh, JSON.stringify({ origin, operationDirection, diagnostics: fixture.env.deletion.diagnostics() }))
		assert.equal(baselineRefresh.details.expectedPumpCount, 1)
		assert.equal(baselineRefresh.details.restoredPumpCount, 1)
		assert.equal(baselineRefresh.details.afterCount, 33)
		const secondRedo = await fixture.env.transactions.redo({ input: 'keyboard' })
		assert.equal(
			secondRedo.executed,
			true,
			JSON.stringify({ origin, operationDirection, secondRedo, diagnostics: fixture.env.deletion.diagnostics() })
		)
		const acceptedRedoPreflights = fixture.env.deletion.diagnostics().events.filter(entry => (
			entry.sequence > baselineRefresh.sequence &&
			entry.event === 'adapter.preflight.rebuilt' &&
			entry.details?.direction === 'redo' &&
			entry.details?.accepted === true
		))
		assert.equal(acceptedRedoPreflights.length, 2, JSON.stringify({
			origin,
			operationDirection,
			acceptedRedoPreflights
		}))
		assert.equal(fixture.env.game.entityAtCoordinates([1, 0]), null)
		fixture.env.dispose()
	}

	for (const origin of ['delete', 'cut']) {
		await runClosureCase(origin, 'forward')
		await runClosureCase(origin, 'redo')
	}

	const wrongOwner = createLateEnvironment([1, 0])
	const wrongOwnerPlan = await wrongOwner.env.deletion.planSelections()
	wrongOwner.control.armed = true
	assert.equal((await wrongOwner.env.deletion.execute(
		wrongOwnerPlan,
		'mouse',
		{ origin: 'cut' }
	)).executed, true)
	assert.equal((await wrongOwner.env.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredWrongOwnerCube = wrongOwner.env.game.entityAtCoordinates([1, 0])
	const externalPump = wrongOwner.env.game.spawn('pump2', [50, 0], { depth: 3 })
	restoredWrongOwnerCube.pump = externalPump
	const wrongOwnerClearsBefore = wrongOwner.env.game.clearCalls
	const wrongOwnerRedo = await wrongOwner.env.transactions.redo({ input: 'keyboard' })
	assert.equal(wrongOwnerRedo.executed, false, JSON.stringify(wrongOwnerRedo))
	assert.equal(wrongOwnerRedo.error.code, 'TARGET_CHANGED', JSON.stringify(wrongOwnerRedo))
	assert.equal(wrongOwner.env.game.clearCalls, wrongOwnerClearsBefore)
	assert.strictEqual(wrongOwner.env.game.entityAtCoordinates([1, 0]), restoredWrongOwnerCube)
	assert.strictEqual(restoredWrongOwnerCube.pump, externalPump)
	wrongOwner.env.dispose()

	const extra = createLateEnvironment([40, 0], {
		fill: 29,
		resources: new Array(64).fill(73)
	})
	const extraPlan = await extra.env.deletion.planSelections()
	extra.control.armed = true
	const extraDelete = await extra.env.deletion.execute(extraPlan, 'mouse', { origin: 'delete' })
	assert.equal(extraDelete.executed, true, JSON.stringify(extraDelete))
	assert.ok(extra.control.injected)
	assert.equal(extra.env.game.entityAtCoordinates([40, 0]), null)
	const extraEvent = extra.env.deletion.diagnostics().events.find(entry => (
		entry.event === 'contract.forward.late-attached-cube-added'
	))
	assert.ok(extraEvent, JSON.stringify(extra.env.deletion.diagnostics()))
	assert.deepEqual(clone(extraEvent.details.position), [40, 0])
	assert.equal((await extra.env.transactions.undo({ input: 'keyboard' })).executed, true)
	const extraPump = extra.env.game.entityAtCoordinates([0, 0])
	const extraCube = extra.env.game.entityAtCoordinates([40, 0])
	assert.equal(extraCube?.fill, 29)
	assert.equal(extraCube?.resources?.[0], 73)
	assert.strictEqual(extraCube?.pump, extraPump)
	assert.equal((await extra.env.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(extra.env.game.entityAtCoordinates([40, 0]), null)
	extra.env.dispose()

	const retainedStable = createLateEnvironment([1, 0], {
		state: 2,
		fill: 64,
		unveilProgress: 1,
		resources: new Array(64).fill(31)
	})
	const retainedStablePlan = await retainedStable.env.deletion.planSelections()
	retainedStable.control.armed = true
	const retainedStableDelete = await retainedStable.env.deletion.execute(
		retainedStablePlan,
		'mouse',
		{ origin: 'cut' }
	)
	assert.equal(retainedStableDelete.executed, true, JSON.stringify(retainedStableDelete))
	assert.strictEqual(retainedStable.env.game.entityAtCoordinates([1, 0]), retainedStable.control.injected)
	assert.equal(retainedStable.control.injected.state, 2)
	assert.ok(!retainedStable.env.deletion.diagnostics().events.some(entry => (
		entry.event === 'contract.forward.late-attached-cube-rebased' ||
		entry.event === 'contract.forward.late-attached-cube-added'
	)))
	retainedStable.env.dispose()

	for (const strictKind of ['painted-source', 'killme-source']) {
		const strictSource = createLateEnvironment([1, 0], strictKind === 'painted-source'
			? { worldEditorPaint: stablePaint('late-owner-source-strict') }
			: { killme: true })
		const strictSourcePlan = await strictSource.env.deletion.planSelections()
		strictSource.control.armed = true
		const strictSourceDelete = await strictSource.env.deletion.execute(
			strictSourcePlan,
			'mouse',
			{ origin: 'delete' }
		)
		assert.equal(strictSourceDelete.executed, false, JSON.stringify({ strictKind, strictSourceDelete }))
		assert.equal(strictSourceDelete.reason, 'rolled-back', strictKind)
		assert.equal(strictSourceDelete.error.code, 'EXTERNAL_CHANGE', strictKind)
		assert.notEqual(strictSourceDelete.error.code, 'ROLLBACK_FAILED', strictKind)
		const restoredPump = strictSource.env.game.entityAtCoordinates([0, 0])
		assert.equal(restoredPump?.name, 'pump2', strictKind)
		assert.strictEqual(strictSource.env.game.entityAtCoordinates([1, 0]), strictSource.control.injected, strictKind)
		assert.strictEqual(strictSource.control.injected?.pump, restoredPump, strictKind)
		strictSource.env.dispose()
	}

	async function createLegacyHistory(origin) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 0, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], { depth: 8 })
		env.game.spawn('gradient', [100, 0])
		spawnAttachedCube(env.game, pump, [1, 0], { fill: 17 })
		const plan = await env.deletion.planSelections()
		assert.equal((await env.deletion.execute(plan, 'mouse', { origin })).executed, true)
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
		const deletedPumpObject = env.game.entityAtCoordinates([0, 0])
		assert.equal((await env.transactions.redo({ input: 'keyboard' })).executed, true)
		return { env, deletedPumpObject }
	}

	for (const origin of ['delete', 'cut']) {
		const legacy = await createLegacyHistory(origin)
		spawnAttachedCube(legacy.env.game, legacy.deletedPumpObject, [1, 0], {
			fill: 38,
			resources: new Array(64).fill(62)
		})
		const undo = await legacy.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({ origin, undo, diagnostics: legacy.env.deletion.diagnostics() }))
		const restoredPump = legacy.env.game.entityAtCoordinates([0, 0])
		const restoredCube = legacy.env.game.entityAtCoordinates([1, 0])
		assert.equal(restoredCube?.fill, 38, origin)
		assert.equal(restoredCube?.resources?.[0], 62, origin)
		assert.strictEqual(restoredCube?.pump, restoredPump, origin)
		assert.ok(legacy.env.deletion.diagnostics().events.some(entry => (
			entry.event === 'contract.undo.owner-bound-orphan-rebased' &&
			entry.details?.origin === origin
		)), JSON.stringify(legacy.env.deletion.diagnostics()))
		assert.equal((await legacy.env.transactions.redo({ input: 'keyboard' })).executed, true)
		legacy.env.dispose()
	}

	for (const strictKind of ['stable', 'painted']) {
		const strict = await createLegacyHistory('delete')
		const occupant = spawnAttachedCube(strict.env.game, strict.deletedPumpObject, [1, 0], strictKind === 'stable'
			? { state: 2, fill: 64, unveilProgress: 1 }
			: { worldEditorPaint: stablePaint('late-owner-strict') })
		const clearsBefore = strict.env.game.clearCalls
		const undo = await strict.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, false, JSON.stringify({ strictKind, undo }))
		assert.equal(undo.error.code, 'EXTERNAL_CHANGE', strictKind)
		assert.equal(strict.env.game.clearCalls, clearsBefore, strictKind)
		assert.strictEqual(strict.env.game.entityAtCoordinates([1, 0]), occupant, strictKind)
		strict.env.dispose()
	}

	const rollback = createLateEnvironment([1, 0], {
		fill: 55,
		resources: new Array(64).fill(44)
	})
	const rollbackPlan = await rollback.env.deletion.planSelections()
	rollback.control.armed = true
	rollback.env.game.failClearAt = rollbackPlan.summary.safeCount + 1
	const rolledBack = await rollback.env.deletion.execute(rollbackPlan, 'mouse', { origin: 'delete' })
	assert.equal(rolledBack.executed, false, JSON.stringify(rolledBack))
	assert.equal(rolledBack.reason, 'rolled-back', JSON.stringify(rolledBack))
	assert.notEqual(rolledBack.error.code, 'ROLLBACK_FAILED', JSON.stringify(rolledBack))
	const rollbackPump = rollback.env.game.entityAtCoordinates([0, 0])
	const rollbackCube = rollback.env.game.entityAtCoordinates([1, 0])
	assert.equal(rollbackPump?.name, 'pump2')
	assert.equal(rollbackCube?.fill, 55)
	assert.equal(rollbackCube?.resources?.[0], 44)
	assert.strictEqual(rollbackCube?.pump, rollbackPump)
	rollback.env.dispose()
}

async function testSecondPreflightProtectedCubeMismatchDiagnostics() {
	function createFixture() {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 1, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		const cube = spawnAttachedCube(env.game, pump, [1, 0], {
			state: 0,
			fill: 21,
			resources: new Array(64).fill(14)
		})
		return { env, pump, cube }
	}

	function assertDiagnostic(fixture, direction) {
		const diagnostic = fixture.env.deletion.diagnostics().events.find(entry => (
			entry.event === 'diagnostic.plan-mismatch' &&
			entry.details?.direction === direction &&
			entry.details?.hasSnapshot === true
		))
		assert.ok(diagnostic, JSON.stringify({ direction, diagnostics: fixture.env.deletion.diagnostics() }))
		assert.equal(diagnostic.details.stage, 'compatibility-branches')
		const added = diagnostic.details.targets?.protected?.added || []
		const cube = added.find(entry => (
			entry.after?.name === 'cube' &&
			entry.after?.layer === 'cube' &&
			entry.after?.reason === 'cube' &&
			entry.after?.position?.[0] === 1 &&
			entry.after?.position?.[1] === 0
		))
		assert.ok(cube, JSON.stringify(diagnostic.details.targets))
		assert.equal(cube.liveCube?.state, 0)
		assert.equal(cube.liveCube?.ownerIdentity, null)
		assert.equal(cube.liveCube?.inSelectedPumpVicinity, true)
	}

	const forward = createFixture()
	const forwardPlan = await forward.env.deletion.planSelections()
	assert.equal(forwardPlan.summary.attachedCubeCount, 1)
	forward.env.transactions.beforeSecondPreflight = function () {
		forward.cube.pump = null
	}
	const forwardClearsBefore = forward.env.game.clearCalls
	const forwardResult = await forward.env.deletion.execute(forwardPlan, 'mouse', { origin: 'delete' })
	assert.equal(forwardResult.executed, false, JSON.stringify(forwardResult))
	assert.equal(forwardResult.error.code, 'TARGET_CHANGED', JSON.stringify(forwardResult))
	assert.equal(forward.env.game.clearCalls, forwardClearsBefore)
	assertDiagnostic(forward, 'forward')
	forward.env.dispose()

	const redo = createFixture()
	const redoPlan = await redo.env.deletion.planSelections()
	assert.equal((await redo.env.deletion.execute(redoPlan, 'mouse', { origin: 'cut' })).executed, true)
	assert.equal((await redo.env.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(redo.env.deletion.diagnostics().events.some(entry => (
		entry.event === 'diagnostic.plan-mismatch'
	)), false)
	const restoredPump = redo.env.game.entityAtCoordinates([0, 0])
	const restoredCube = redo.env.game.entityAtCoordinates([1, 0])
	restoredPump.soi = [[1, 0]]
	redo.env.transactions.beforeSecondPreflight = function () {
		restoredCube.pump = null
	}
	const redoClearsBefore = redo.env.game.clearCalls
	const redoResult = await redo.env.transactions.redo({ input: 'keyboard' })
	assert.equal(redoResult.executed, false, JSON.stringify(redoResult))
	assert.equal(redoResult.error.code, 'TARGET_CHANGED', JSON.stringify(redoResult))
	assert.equal(redo.env.game.clearCalls, redoClearsBefore)
	assertDiagnostic(redo, 'redo')
	redo.env.dispose()
}

async function testSelectedPumpTerminalCubeContract() {
	function createFixture(maxU = 2) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, maxU, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0], [2, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		spawnAttachedCube(env.game, pump, [1, 0], {
			fill: 21,
			resources: new Array(64).fill(14)
		})
		return { env, pump }
	}

	for (const origin of ['delete', 'cut']) {
		const fixture = createFixture()
		const plan = await fixture.env.deletion.planSelections()
		assert.equal(plan.summary.attachedCubeCount, 1)
		const terminal = spawnAttachedCube(fixture.env.game, fixture.pump, [2, 0], {
			state: 3,
			killme: true,
			fill: 64,
			resources: new Array(64).fill(23)
		})
		const result = await fixture.env.deletion.execute(plan, 'mouse', { origin })
		assert.equal(result.executed, true, JSON.stringify({ origin, result, diagnostics: fixture.env.deletion.diagnostics() }))
		assert.strictEqual(fixture.env.game.entityAtCoordinates([2, 0]), terminal, origin)
		assert.equal(fixture.env.game.entityAtCoordinates([0, 0]), null, origin)
		assert.equal(fixture.env.game.entityAtCoordinates([1, 0]), null, origin)
		fixture.env.dispose()
	}

	const wrongOwner = createFixture()
	const wrongOwnerPlan = await wrongOwner.env.deletion.planSelections()
	const outsidePump = wrongOwner.env.game.spawn('pump2', [50, 0], { soi: [], soe: [] })
	const wrongOwnerCube = spawnAttachedCube(wrongOwner.env.game, outsidePump, [2, 0], {
		state: 3,
		killme: true,
		fill: 64
	})
	const wrongOwnerResult = await wrongOwner.env.deletion.execute(wrongOwnerPlan, 'mouse')
	assert.equal(wrongOwnerResult.executed, false, JSON.stringify(wrongOwnerResult))
	assert.equal(wrongOwnerResult.error.code, 'TARGET_CHANGED')
	assert.strictEqual(wrongOwner.env.game.entityAtCoordinates([2, 0]), wrongOwnerCube)
	wrongOwner.env.dispose()

	const outsideVicinity = createFixture(3)
	const outsideVicinityPlan = await outsideVicinity.env.deletion.planSelections()
	const outsideCube = spawnAttachedCube(outsideVicinity.env.game, outsideVicinity.pump, [3, 0], {
		state: 3,
		killme: true,
		fill: 64
	})
	const outsideResult = await outsideVicinity.env.deletion.execute(outsideVicinityPlan, 'mouse')
	assert.equal(outsideResult.executed, false, JSON.stringify(outsideResult))
	assert.equal(outsideResult.error.code, 'TARGET_CHANGED')
	assert.strictEqual(outsideVicinity.env.game.entityAtCoordinates([3, 0]), outsideCube)
	outsideVicinity.env.dispose()

	const painted = createFixture()
	const paintedPlan = await painted.env.deletion.planSelections()
	const paintedCube = spawnAttachedCube(painted.env.game, painted.pump, [2, 0], {
		state: 3,
		killme: true,
		fill: 64,
		worldEditorPaint: stablePaint('terminal-strict')
	})
	const paintedResult = await painted.env.deletion.execute(paintedPlan, 'mouse')
	assert.equal(paintedResult.executed, false, JSON.stringify(paintedResult))
	assert.equal(paintedResult.error.code, 'TARGET_CHANGED')
	assert.strictEqual(painted.env.game.entityAtCoordinates([2, 0]), paintedCube)
	painted.env.dispose()

	const invalidResources = createFixture()
	const invalidResourcesPlan = await invalidResources.env.deletion.planSelections()
	const invalidCube = spawnAttachedCube(invalidResources.env.game, invalidResources.pump, [2, 0], {
		state: 3,
		killme: true,
		fill: 64,
		resources: new Array(63).fill(0)
	})
	const invalidResult = await invalidResources.env.deletion.execute(invalidResourcesPlan, 'mouse')
	assert.equal(invalidResult.executed, false, JSON.stringify(invalidResult))
	assert.equal(invalidResult.error.code, 'TARGET_CHANGED')
	assert.strictEqual(invalidResources.env.game.entityAtCoordinates([2, 0]), invalidCube)
	invalidResources.env.dispose()
}

async function testPumpRuntimeAcceptsAttachedTerminalTransitions() {
	function createFixture() {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 2, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0], [2, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		const terminalCandidate = spawnAttachedCube(env.game, pump, [1, 0], {
			state: 1,
			fill: 64,
			unveilProgress: 0.75,
			resources: new Array(64).fill(17)
		})
		spawnAttachedCube(env.game, pump, [2, 0], {
			state: 0,
			fill: 21,
			resources: new Array(64).fill(18)
		})
		return { env, pump, terminalCandidate }
	}

	function finishTerminalTransition(cube) {
		cube.state = 3
		cube.killme = true
		cube.fill = 64
		cube.unveilProgress = 1
	}

	for (const origin of ['delete', 'cut']) {
		const forward = createFixture()
		const plan = await forward.env.deletion.planSelections()
		assert.equal(plan.summary.attachedCubeCount, 2, origin + '.forward.plan')
		forward.env.transactions.beforeSecondPreflight = function () {
			finishTerminalTransition(forward.terminalCandidate)
		}
		const result = await forward.env.deletion.execute(plan, 'mouse', { origin })
		assert.equal(result.executed, true, JSON.stringify({ origin, result, diagnostics: forward.env.deletion.diagnostics() }))
		assert.strictEqual(forward.env.game.entityAtCoordinates([1, 0]), forward.terminalCandidate, origin + '.forward.terminal')
		assert.equal(forward.env.game.entityAtCoordinates([0, 0]), null, origin + '.forward.pump')
		assert.equal(forward.env.game.entityAtCoordinates([2, 0]), null, origin + '.forward.attached')
		forward.env.dispose()

		const redo = createFixture()
		const redoPlan = await redo.env.deletion.planSelections()
		assert.equal((await redo.env.deletion.execute(redoPlan, 'mouse', { origin })).executed, true, origin + '.initial')
		assert.equal((await redo.env.transactions.undo({ input: 'keyboard' })).executed, true, origin + '.undo')
		const restoredTerminal = redo.env.game.entityAtCoordinates([1, 0])
		redo.env.transactions.beforeSecondPreflight = function () {
			finishTerminalTransition(restoredTerminal)
		}
		const redoResult = await redo.env.transactions.redo({ input: 'keyboard' })
		assert.equal(redoResult.executed, true, JSON.stringify({ origin, redoResult, diagnostics: redo.env.deletion.diagnostics() }))
		assert.strictEqual(redo.env.game.entityAtCoordinates([1, 0]), restoredTerminal, origin + '.redo.terminal')
		assert.equal(redo.env.game.entityAtCoordinates([0, 0]), null, origin + '.redo.pump')
		assert.equal(redo.env.game.entityAtCoordinates([2, 0]), null, origin + '.redo.attached')
		redo.env.dispose()
	}
}

async function testPumpRuntimeMixedLifecycleBatch() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 13, 0, 0) }]
	})
	const firstPump = env.game.spawn('pump2', [0, 0], {
		depth: 7,
		soi: [[1, 0], [2, 0], [3, 0], [4, 0]],
		soe: []
	})
	const secondPump = env.game.spawn('pump2', [10, 0], {
		depth: 8,
		soi: [[1, 0], [2, 0], [3, 0]],
		soe: []
	})
	env.game.spawn('gradient', [100, 0])
	const terminal = spawnAttachedCube(env.game, firstPump, [1, 0], { state: 1, fill: 64 })
	const stable = spawnAttachedCube(env.game, firstPump, [2, 0], { state: 1, fill: 64 })
	const disappearing = spawnAttachedCube(env.game, firstPump, [3, 0], { state: 1, fill: 64 })
	const progressing = spawnAttachedCube(env.game, secondPump, [11, 0], { state: 0, fill: 12 })
	spawnAttachedCube(env.game, secondPump, [12, 0], { state: 0, fill: 13 })

	const plan = await env.deletion.planSelections()
	assert.equal(plan.summary.attachedCubeCount, 5)
	env.transactions.beforeSecondPreflight = function () {
		terminal.state = 3
		terminal.killme = true
		terminal.unveilProgress = 1
		stable.state = 2
		stable.fill = 64
		stable.unveilProgress = 1
		env.game.clearCell(disappearing.position)
		spawnAttachedCube(env.game, firstPump, [4, 0], { state: 0, fill: 14 })
		progressing.state = 1
		progressing.fill = 32
		spawnAttachedCube(env.game, secondPump, [13, 0], { state: 0, fill: 15 })
	}
	const result = await env.deletion.execute(plan, 'mouse', { origin: 'cut' })
	assert.equal(result.executed, true, JSON.stringify({ result, diagnostics: env.deletion.diagnostics() }))
	assert.strictEqual(env.game.entityAtCoordinates([1, 0]), terminal)
	assert.strictEqual(env.game.entityAtCoordinates([2, 0]), stable)
	assert.equal(env.game.entityAtCoordinates([3, 0]), null)
	assert.equal(env.game.entityAtCoordinates([4, 0]), null)
	assert.equal(env.game.entityAtCoordinates([10, 0]), null)
	assert.equal(env.game.entityAtCoordinates([11, 0]), null)
	assert.equal(env.game.entityAtCoordinates([12, 0]), null)
	assert.equal(env.game.entityAtCoordinates([13, 0]), null)
	env.dispose()
}

async function testPumpRuntimeTerminalTransitionRemainsStrict() {
	async function expectRejected(label, mutate) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 3, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0], [2, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		const candidate = spawnAttachedCube(env.game, pump, [1, 0], { state: 1, fill: 64 })
		spawnAttachedCube(env.game, pump, [2, 0], { state: 0, fill: 19 })
		const plan = await env.deletion.planSelections()
		env.transactions.beforeSecondPreflight = function () {
			candidate.state = 3
			candidate.killme = true
			candidate.fill = 64
			candidate.unveilProgress = 1
			mutate({ env, pump, candidate })
		}
		const clearsBefore = env.game.clearCalls
		const result = await env.deletion.execute(plan, 'mouse', { origin: 'delete' })
		assert.equal(result.executed, false, JSON.stringify({ label, result }))
		assert.equal(result.error.code, 'TARGET_CHANGED', label)
		assert.equal(env.game.clearCalls, clearsBefore, label + '.zero-writes')
		assert.strictEqual(env.game.entityAtCoordinates([0, 0]), pump, label + '.pump')
		env.dispose()
	}

	await expectRejected('terminal requires killme', ({ candidate }) => {
		candidate.killme = false
	})
	await expectRejected('terminal requires valid resources', ({ candidate }) => {
		candidate.resources = new Array(63).fill(0)
	})
	await expectRejected('painted terminal remains strict', ({ candidate }) => {
		candidate.worldEditorPaint = stablePaint('pump-terminal-strict')
	})
	await expectRejected('Grow terminal remains strict', ({ candidate }) => {
		candidate.worldEditorPaint = growPaint(1000, 'growing', 'pump-terminal-grow')
	})
	await expectRejected('terminal requires the selected owner', ({ env, candidate }) => {
		candidate.pump = env.game.spawn('pump2', [50, 0], { soi: [], soe: [] })
	})
	await expectRejected('terminal must remain in Pump vicinity', ({ env, candidate }) => {
		env.game.moveEntity(candidate, [3, 0])
	})
}

async function testRedoUsesRecordedSelectionSource() {
	async function createHistory(origin) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 2, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0], [2, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		spawnAttachedCube(env.game, pump, [1, 0], { state: 0, fill: 21 })
		spawnAttachedCube(env.game, pump, [2, 0], { state: 1, fill: 64 })
		const plan = await env.deletion.planSelections()
		assert.equal((await env.deletion.execute(plan, 'mouse', { origin })).executed, true, origin + '.forward')
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true, origin + '.undo')
		return env
	}

	for (const origin of ['delete', 'cut']) {
		const emptySelection = await createHistory(origin)
		emptySelection.selection.setEntries([])
		const emptyRedo = await emptySelection.transactions.redo({ input: 'keyboard' })
		assert.equal(emptyRedo.executed, true, JSON.stringify({ origin, emptyRedo }))
		assert.equal(emptySelection.game.entityAtCoordinates([0, 0]), null, origin + '.empty.pump')
		assert.equal(emptySelection.selection.snapshot().selectionCount, 0, origin + '.empty.selection')
		emptySelection.dispose()

		const differentSelection = await createHistory(origin)
		differentSelection.selection.setEntries([{ id: 9, range: range(20, 20, 0, 0) }])
		const differentRedo = await differentSelection.transactions.redo({ input: 'keyboard' })
		assert.equal(differentRedo.executed, true, JSON.stringify({ origin, differentRedo }))
		assert.equal(differentSelection.game.entityAtCoordinates([0, 0]), null, origin + '.different.pump')
		assert.deepEqual(clone(differentSelection.selection.snapshot().selectedRange), range(20, 20, 0, 0))
		differentSelection.dispose()
	}

	const planeChanged = await createHistory('delete')
	planeChanged.selection.setEntries([])
	planeChanged.game.plane = 1
	const planeClearsBefore = planeChanged.game.clearCalls
	const planeRedo = await planeChanged.transactions.redo({ input: 'keyboard' })
	assert.equal(planeRedo.executed, false, JSON.stringify(planeRedo))
	assert.equal(planeRedo.error.code, 'PLANE_CHANGED', JSON.stringify(planeRedo))
	assert.equal(planeChanged.game.clearCalls, planeClearsBefore)
	assert.equal(planeChanged.game.entityAtCoordinates([0, 0])?.name, 'pump2')
	planeChanged.dispose()

	const changedTarget = await createHistory('cut')
	changedTarget.selection.setEntries([])
	const restoredPump = changedTarget.game.entityAtCoordinates([0, 0])
	changedTarget.game.moveEntity(restoredPump, [5, 0])
	const targetClearsBefore = changedTarget.game.clearCalls
	const changedRedo = await changedTarget.transactions.redo({ input: 'keyboard' })
	assert.equal(changedRedo.executed, false, JSON.stringify(changedRedo))
	assert.equal(changedRedo.error.code, 'TARGET_CHANGED', JSON.stringify(changedRedo))
	assert.equal(changedTarget.game.clearCalls, targetClearsBefore)
	assert.strictEqual(changedTarget.game.entityAtCoordinates([5, 0]), restoredPump)
	changedTarget.dispose()
}

async function testRedoUsesCurrentAttachedCubeSave() {
	for (const origin of ['delete', 'cut']) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 1, 0, 0) }]
		})
		const pump = env.game.spawn('pump2', [0, 0], {
			depth: 7,
			soi: [[1, 0]],
			soe: []
		})
		env.game.spawn('gradient', [100, 0])
		spawnAttachedCube(env.game, pump, [1, 0], {
			fill: 18,
			breakPower: 0.08,
			resources: new Array(64).fill(11)
		})

		const plan = await env.deletion.planSelections()
		assert.equal((await env.deletion.execute(plan, 'mouse', { origin })).executed, true)
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
		const restoredPump = env.game.entityAtCoordinates([0, 0])
		const restoredCube = env.game.entityAtCoordinates([1, 0])
		restoredPump.soi = [[1, 0]]
		restoredCube.resources[0] = 77
		restoredCube.breakPower = 0.19

		const redo = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, true, JSON.stringify({ origin, redo, diagnostics: env.deletion.diagnostics() }))
		assert.equal(env.game.entityAtCoordinates([0, 0]), null, origin)
		assert.equal(env.game.entityAtCoordinates([1, 0]), null, origin)

		const secondUndo = await env.transactions.undo({ input: 'keyboard' })
		assert.equal(secondUndo.executed, true, JSON.stringify({ origin, secondUndo }))
		const secondPump = env.game.entityAtCoordinates([0, 0])
		const secondCube = env.game.entityAtCoordinates([1, 0])
		assert.equal(secondCube?.resources?.[0], 77, origin)
		assert.equal(secondCube?.breakPower, 0.19, origin)
		assert.strictEqual(secondCube?.pump, secondPump, origin)
		env.dispose()
	}
}

async function testPrepareMismatchUsesRecordedTargetSummaries() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	env.game.spawn('silo', [0, 0], { channel: 1 })
	const plan = await env.deletion.planSelections()
	env.game.spawn('silo', [1, 0], { channel: 2 })
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(result.executed, false, JSON.stringify(result))
	assert.equal(result.error.code, 'TARGET_CHANGED')
	const diagnostic = env.deletion.diagnostics().events.find(entry => (
		entry.event === 'diagnostic.plan-mismatch' &&
		entry.details?.direction === 'forward' &&
		entry.details?.hasSnapshot === false
	))
	assert.ok(diagnostic, JSON.stringify(env.deletion.diagnostics()))
	assert.equal(diagnostic.details.targets.removal.added.length, 1, JSON.stringify(diagnostic.details.targets))
	assert.equal(diagnostic.details.targets.removal.removed.length, 0, JSON.stringify(diagnostic.details.targets))
	assert.equal(diagnostic.details.targets.removal.changed.length, 0, JSON.stringify(diagnostic.details.targets))
	assert.deepEqual(diagnostic.details.targets.removal.added[0].after.position, [1, 0])
	env.dispose()
}

async function testRecordedTargetStateDenialProbe() {
	const env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState()
	})
	env.game.spawn('silo', [0, 0], { channel: 1 })
	const plan = await env.deletion.planSelections()
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	const restored = env.game.entityAtCoordinates([0, 0])
	restored.customConfig = 5
	const clearsBefore = env.game.clearCalls
	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, false, JSON.stringify(redo))
	assert.equal(redo.error.code, 'EXTERNAL_CHANGE')
	assert.equal(env.game.clearCalls, clearsBefore)
	const denied = env.deletion.diagnostics().events.find(entry => (
		entry.event === 'contract.history.recorded-target-state-denied' &&
		entry.details?.direction === 'redo'
	))
	assert.ok(denied, JSON.stringify(env.deletion.diagnostics()))
	assert.equal(denied.details.descriptor?.name, 'silo')
	assert.ok(denied.details.changedFields?.includes('customConfig'), JSON.stringify(denied.details))
	env.dispose()
}

async function testForwardRollbackClearsTransactionVacancyCube() {
	let injected = false
	let env
	env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 34, 0, 0) }],
		onAnimationFrame(game) {
			if (injected || game.entityAtCoordinates([0, 0])) return
			injected = true
			game.spawn('cube', [0, 0], {
				state: 2,
				fill: 64,
				broken: 0,
				resources: new Array(64).fill(55)
			})
		}
	})
	for (let u = 0; u <= 34; u += 1) env.game.spawn('silo', [u, 0], { fill: u })
	const plan = await env.deletion.planSelections()
	env.game.failClearAt = 34
	const result = await env.deletion.execute(plan, 'mouse')
	assert.equal(injected, true)
	assert.equal(result.executed, false, JSON.stringify(result))
	assert.equal(result.reason, 'rolled-back', JSON.stringify(result))
	assert.notEqual(result.error.code, 'ROLLBACK_FAILED')
	for (let u = 0; u <= 34; u += 1) {
		assert.equal(env.game.entityAtCoordinates([u, 0])?.name, 'silo')
		assert.equal(env.game.entityAtCoordinates([u, 0])?.fill, u)
	}
	const compensation = env.deletion.diagnostics().events.find(function (entry) {
		return entry.event === 'contract.rollback.dynamic-compensated' && entry.details.position?.[0] === 0
	})
	assert.ok(compensation, JSON.stringify(env.deletion.diagnostics().events))
	assert.equal(compensation.details.reason, 'transaction-vacancy-successor')
	env.dispose()
}

async function testDynamicReconcileBudgetRollsBackCompletely() {
	let armed = false
	let undoFrames = 0
	let injected = false
	let env
	env = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 66, 0, 0) }],
		onAnimationFrame(game) {
			if (!armed || injected) return
			undoFrames += 1
			if (undoFrames < 2) return
			injected = true
			for (let u = 1; u <= 63; u += 1) {
				const current = game.entityAtCoordinates([u, 0])
				if (!current) continue
			current.resources = new Array(64).fill(66)
			}
		}
	})
	env.game.spawn('silo', [0, 0], { fill: 5 })
	for (let u = 1; u <= 66; u += 1) {
		env.game.spawn('cube', [u, 0], {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(u)
		})
	}
	const plan = await env.deletion.planSelections({ removeCubes: true })
	assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
	armed = true
	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(injected, true)
	assert.equal(undo.executed, true, JSON.stringify({ undo, diagnostics: env.deletion.diagnostics() }))
	assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'silo')
	for (let u = 1; u <= 63; u += 1) {
		assert.equal(env.game.entityAtCoordinates([u, 0])?.resources?.[0], 66)
	}
	for (let u = 64; u <= 66; u += 1) {
		assert.equal(env.game.entityAtCoordinates([u, 0])?.resources?.[0], u)
	}
	assert.ok(!env.deletion.diagnostics().events.some(function (entry) {
		return entry.event === 'contract.dynamic.denied'
	}), JSON.stringify(env.deletion.diagnostics().events))
	env.dispose()
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

async function testRedoRebasesSafeStandaloneSurgeSet() {
	async function createDeletedPumpArray(removeSurges) {
		const env = createEnvironment({
			creative: true,
			paintCubeState: createPaintCubeState(),
			selections: [{ id: 1, range: range(0, 2, 0, 0) }]
		})
		installVanillaSurgeSave(env.game)
		const pump = env.game.spawn('pump', [0, 0], { depth: 9 })
		env.game.spawn('gradient', [100, 0])
		spawnAttachedCube(env.game, pump, [1, 0], { fill: 27 })
		const plan = await env.deletion.planSelections({
			removeCubes: true,
			removeSurges: removeSurges === true
		})
		assert.equal(plan.summary.buildingCount, 1)
		assert.equal(plan.summary.attachedCubeCount, 1)
		assert.equal((await env.deletion.execute(plan, 'mouse')).executed, true)
		assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
		return env
	}

	const dynamic = await createDeletedPumpArray(true)
	const emerged = spawnStandaloneSurge(dynamic.game, [2, 0], {
		lifeTimer: 83,
		maxLifeTimer: 120,
		life: 83,
		maxLife: 120,
		resources: [1, 19],
		type: 2
	})
	const emergedSave = clone(dynamic.game.getEntityString(emerged))
	const redo = await dynamic.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify({
		redo,
		diagnostics: dynamic.deletion.diagnostics()
	}))
	for (const position of [[0, 0], [1, 0], [2, 0]]) {
		assert.equal(dynamic.game.entityAtCoordinates(position), null)
	}
	assert.equal((await dynamic.transactions.undo({ input: 'keyboard' })).executed, true)
	const restoredSurge = dynamic.game.entityAtCoordinates([2, 0])
	assert.equal(restoredSurge?.name, 'surge')
	assert.deepEqual(clone(dynamic.game.getEntityString(restoredSurge)), emergedSave)
	dynamic.game.clearCell([2, 0])
	assert.equal((await dynamic.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal((await dynamic.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(dynamic.game.entityAtCoordinates([2, 0]), null)
	assert.ok(dynamic.deletion.diagnostics().events.some(function (entry) {
		return entry.event === 'contract.redo.dynamic-surge-rebased'
	}), JSON.stringify(dynamic.deletion.diagnostics().events))
	dynamic.dispose()

	const noPump = createEnvironment({
		creative: true,
		paintCubeState: createPaintCubeState(),
		selections: [{ id: 1, range: range(0, 1, 0, 0) }]
	})
	installVanillaSurgeSave(noPump.game)
	noPump.game.spawn('conductor', [0, 0], { channel: 3 })
	const noPumpPlan = await noPump.deletion.planSelections({ removeSurges: true })
	assert.equal((await noPump.deletion.execute(noPumpPlan, 'mouse')).executed, true)
	assert.equal((await noPump.transactions.undo({ input: 'keyboard' })).executed, true)
	spawnStandaloneSurge(noPump.game, [1, 0], { lifeTimer: 71, life: 71 })
	assert.equal((await noPump.transactions.redo({ input: 'keyboard' })).executed, true)
	assert.equal(noPump.game.entityAtCoordinates([1, 0]), null)
	assert.equal((await noPump.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(noPump.game.entityAtCoordinates([1, 0])?.name, 'surge')
	noPump.dispose()

	const retained = await createDeletedPumpArray(false)
	const retainedSurge = spawnStandaloneSurge(retained.game, [2, 0], {
		lifeTimer: 77,
		life: 77
	})
	const retainedRedo = await retained.transactions.redo({ input: 'keyboard' })
	assert.equal(retainedRedo.executed, true, JSON.stringify({
		retainedRedo,
		diagnostics: retained.deletion.diagnostics()
	}))
	assert.strictEqual(retained.game.entityAtCoordinates([2, 0]), retainedSurge)
	assert.equal((await retained.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.strictEqual(retained.game.entityAtCoordinates([2, 0]), retainedSurge)
	retained.dispose()

	async function expectStrictRejection(label, configure) {
		const env = await createDeletedPumpArray(true)
		const surge = spawnStandaloneSurge(env.game, [2, 0])
		configure(env, surge)
		const clearCallsBefore = env.game.clearCalls
		const result = await env.transactions.redo({ input: 'keyboard' })
		assert.equal(result.executed, false, JSON.stringify({ label, result }))
		assert.equal(result.error.code, 'TARGET_CHANGED', JSON.stringify({ label, result }))
		assert.equal(env.game.clearCalls, clearCallsBefore, label)
		assert.equal(env.game.entityAtCoordinates([0, 0])?.name, 'pump', label)
		assert.strictEqual(env.game.entityAtCoordinates([2, 0]), surge, label)
		env.dispose()
	}

	await expectStrictRejection('connected emerging Surge', (env, surge) => {
		const stabilizer = env.game.spawn('stabilizer', [4, 0])
		connectTestPair(stabilizer, surge)
	})
	await expectStrictRejection('reserved emerging Surge', (env, surge) => {
		surge.stabilizerPosition = [4, 0]
	})
	await expectStrictRejection('harvesting emerging Surge', (env, surge) => {
		surge.harvestProgression = 0.25
	})

	const raced = await createDeletedPumpArray(true)
	const racedSurge = spawnStandaloneSurge(raced.game, [2, 0])
	raced.transactions.beforeApply = function () {
		racedSurge.harvestProgression = 0.5
	}
	const racedRedo = await raced.transactions.redo({ input: 'keyboard' })
	assert.equal(racedRedo.executed, false, JSON.stringify(racedRedo))
	assert.equal(racedRedo.reason, 'rolled-back', JSON.stringify(racedRedo))
	assert.notEqual(racedRedo.error.code, 'ROLLBACK_FAILED', JSON.stringify(racedRedo))
	assert.equal(raced.game.entityAtCoordinates([0, 0])?.name, 'pump')
	assert.strictEqual(
		raced.game.entityAtCoordinates([1, 0])?.pump,
		raced.game.entityAtCoordinates([0, 0])
	)
	assert.strictEqual(raced.game.entityAtCoordinates([2, 0]), racedSurge)
	raced.dispose()
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
	assert.equal(diagnostics.version, 3)
	assert.equal(diagnostics.implementation, 'operating-targets-r21')
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
		change: 'changed',
		fields: ['channel']
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

async function testOperatingBuildingRuntimeDriftUsesLatestUndoState() {
	const env = createEnvironment()
	const machine = env.game.spawn('conductor', [0, 0], {
		channel: 3,
		fill: 4,
		state: 0,
		conversion: 0.25,
		resources: [2, 1],
		resourceCount: 3
	})
	const plan = await env.deletion.planSelections()
	machine.fill = 9
	machine.state = 1
	machine.conversion = 0.5
	machine.resources = [1, 4]
	machine.resourceCount = 5
	env.transactions.beforeSecondPreflight = function () {
		machine.fill = 10
		machine.state = 2
		machine.conversion = 0.6
		machine.resources = [4, 1]
		machine.resourceCount = 6
	}
	env.transactions.beforeApply = function () {
		machine.fill = 11
		machine.conversion = 0.7
		machine.resources = [3, 3]
		machine.resourceCount = 7
	}
	const deleted = await env.deletion.execute(plan, 'mouse')
	assert.equal(deleted.executed, true, JSON.stringify(deleted))
	const acceptedPreflights = clone(env.deletion.diagnostics()).events.filter(entry => (
		entry.event === 'adapter.preflight.rebuilt' && entry.details.accepted === true
	))
	assert.ok(acceptedPreflights.length >= 2)

	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	let restored = env.game.entityAtCoordinates([0, 0])
	assert.equal(restored.channel, 3)
	assert.equal(restored.fill, 11)
	assert.equal(restored.state, 2)
	assert.equal(restored.conversion, 0.7)
	assert.deepEqual(restored.resources, [3, 3])
	assert.equal(restored.resourceCount, 7)

	restored.fill = 12
	restored.conversion = 0.75
	restored.resourceCount = 7
	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	restored = env.game.entityAtCoordinates([0, 0])
	assert.equal(restored.fill, 12)
	assert.equal(restored.conversion, 0.75)
	assert.equal(restored.resourceCount, 7)
	env.dispose()
}

async function testOperatingPumpAndUnfinishedCubeAreAtomic() {
	const env = createEnvironment({
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const pump = env.game.spawn('pump', [0, 0], { depth: 5 })
	env.game.spawn('gradient', [5, 0])
	const cube = spawnAttachedCube(env.game, pump, [1, 0])
	const resourcesBefore = clone(env.game.resources)
	const plan = await env.deletion.planSelections()
	assert.equal(plan.summary.safeCount, 2)
	assert.equal(plan.summary.buildingCount, 1)
	assert.equal(plan.summary.attachedCubeCount, 1)
	assert.deepEqual(clone(plan.removals.map(entry => entry.layer)), ['building', 'attached-cube'])
	assert.equal(plan.removals.find(entry => entry.layer === 'attached-cube').pump.identity, plan.removals[0].identity)

	pump.depth = 5.5
	cube.fill = 20
	cube.reverseTimer = 70
	const deleted = await env.deletion.execute(plan, 'mouse')
	assert.equal(deleted.executed, true, JSON.stringify(deleted))
	assert.equal(env.game.entityAtCoordinates([0, 0]), null)
	assert.equal(env.game.entityAtCoordinates([1, 0]), null)
	assert.deepEqual(env.game.resources, resourcesBefore.map((value, index) => value + (index === 0 ? 3 : 0)))

	const undo = await env.transactions.undo({ input: 'keyboard' })
	assert.equal(undo.executed, true, JSON.stringify(undo))
	let restoredPump = env.game.entityAtCoordinates([0, 0])
	let restoredCube = env.game.entityAtCoordinates([1, 0])
	assert.equal(restoredPump.depth, 5.5)
	assert.equal(restoredCube.fill, 20)
	assert.equal(restoredCube.reverseTimer, 70)
	assert.strictEqual(restoredCube.pump, restoredPump)

	restoredPump.depth = 6
	restoredCube.fill = 24
	restoredCube.unveilProgress = 0.2
	const redo = await env.transactions.redo({ input: 'keyboard' })
	assert.equal(redo.executed, true, JSON.stringify(redo))
	assert.equal((await env.transactions.undo({ input: 'keyboard' })).executed, true)
	restoredPump = env.game.entityAtCoordinates([0, 0])
	restoredCube = env.game.entityAtCoordinates([1, 0])
	assert.equal(restoredPump.depth, 6)
	assert.equal(restoredCube.fill, 24)
	assert.equal(restoredCube.unveilProgress, 0.2)
	assert.strictEqual(restoredCube.pump, restoredPump)
	env.dispose()

	const lastExtractor = createEnvironment({ creative: true })
	const lastPump = lastExtractor.game.spawn('pump', [0, 0], { depth: 2 })
	spawnAttachedCube(lastExtractor.game, lastPump, [1, 0])
	const protectedPlan = await lastExtractor.deletion.planSelections()
	assert.equal(protectedPlan.summary.safeCount, 0)
	assert.equal(protectedPlan.summary.protectedCount, 2)
	assert.deepEqual(
		clone(protectedPlan.protectedTargets.map(entry => [entry.layer, entry.reason])),
		[['building', 'last-extractor'], ['attached-cube', 'attached-pump-protected']]
	)
	lastExtractor.dispose()

	const changedRelation = createEnvironment()
	const firstPump = changedRelation.game.spawn('pump', [0, 0], { depth: 2 })
	const secondPump = changedRelation.game.spawn('pump2', [5, 0], { depth: 3 })
	const changedCube = spawnAttachedCube(changedRelation.game, firstPump, [1, 0])
	const changedPlan = await changedRelation.deletion.planSelections()
	changedCube.pump = secondPump
	const changed = await changedRelation.deletion.execute(changedPlan, 'mouse')
	assert.equal(changed.executed, false)
	assert.equal(changed.error.code, 'TARGET_CHANGED')
	changedRelation.dispose()

	const changedResources = createEnvironment()
	const resourcePump = changedResources.game.spawn('pump', [0, 0], { depth: 2 })
	changedResources.game.spawn('gradient', [5, 0])
	const resourceCube = spawnAttachedCube(changedResources.game, resourcePump, [1, 0])
	const resourcePlan = await changedResources.deletion.planSelections()
	resourceCube.resources[0] = 1
	const resourceResult = await changedResources.deletion.execute(resourcePlan, 'mouse')
	assert.equal(resourceResult.executed, true, JSON.stringify(resourceResult))
	assert.equal(changedResources.game.entityAtCoordinates([0, 0]), null)
	assert.equal(changedResources.game.entityAtCoordinates([1, 0]), null)
	changedResources.dispose()

	const rollback = createEnvironment()
	const rollbackPump = rollback.game.spawn('pump', [0, 0], { depth: 4 })
	rollback.game.spawn('gradient', [5, 0])
	spawnAttachedCube(rollback.game, rollbackPump, [1, 0], { fill: 18 })
	const rollbackPlan = await rollback.deletion.planSelections()
	rollback.game.failClearAt = 2
	const rolledBack = await rollback.deletion.execute(rollbackPlan, 'mouse')
	assert.equal(rolledBack.executed, false)
	assert.equal(rolledBack.reason, 'rolled-back')
	assert.strictEqual(
		rollback.game.entityAtCoordinates([1, 0]).pump,
		rollback.game.entityAtCoordinates([0, 0])
	)
	assert.equal(rollback.game.entityAtCoordinates([1, 0]).fill, 18)
	rollback.dispose()

	const stable = createEnvironment({
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const stablePump = stable.game.spawn('pump', [0, 0], { depth: 7 })
	stable.game.spawn('gradient', [5, 0])
	const completedCube = spawnAttachedCube(stable.game, stablePump, [1, 0], {
		state: 2,
		fill: 64,
		unveilProgress: 1
	})
	const currentCube = spawnAttachedCube(stable.game, stablePump, [-1, 0], { fill: 9 })
	const stablePlan = await stable.deletion.planSelections()
	assert.equal(stablePlan.summary.safeCount, 2)
	assert.equal(stablePlan.summary.protectedCount, 0)
	assert.equal(stablePlan.summary.attachedCubeCount, 1)
	assert.deepEqual(clone(stablePlan.removals.map(entry => entry.layer).sort()), ['attached-cube', 'building'])
	assert.equal((await stable.deletion.execute(stablePlan, 'mouse')).executed, true)
	assert.strictEqual(stable.game.entityAtCoordinates([1, 0]), completedCube)
	assert.equal(stable.game.entityAtCoordinates([-1, 0]), null)
	assert.ok(!stable.game.stuff.includes(currentCube))
	stable.dispose()

	const lifecycle = createEnvironment({
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const lifecyclePump = lifecycle.game.spawn('pump', [0, 0], { depth: 8 })
	lifecycle.game.spawn('gradient', [5, 0])
	const revealingCube = spawnAttachedCube(lifecycle.game, lifecyclePump, [1, 0], {
		state: 1,
		fill: 64,
		unveilProgress: 0.9
	})
	const lifecyclePlan = await lifecycle.deletion.planSelections()
	revealingCube.state = 2
	revealingCube.unveilProgress = 1
	const nextCube = spawnAttachedCube(lifecycle.game, lifecyclePump, [-1, 0], { fill: 3 })
	const lifecycleResult = await lifecycle.deletion.execute(lifecyclePlan, 'mouse')
	assert.equal(lifecycleResult.executed, true, JSON.stringify({
		lifecycleResult,
		diagnostics: lifecycle.deletion.diagnostics()
	}))
	assert.strictEqual(lifecycle.game.entityAtCoordinates([1, 0]), revealingCube)
	assert.equal(lifecycle.game.entityAtCoordinates([-1, 0]), null)
	assert.ok(!lifecycle.game.stuff.includes(nextCube))
	lifecycle.dispose()

	const rebound = createEnvironment({
		selections: [{ id: 1, range: range(0, 0, 0, 0) }]
	})
	const reboundPump = rebound.game.spawn('pump', [0, 0], { depth: 9 })
	rebound.game.spawn('gradient', [8, 0])
	spawnAttachedCube(rebound.game, reboundPump, [1, 0], { fill: 5 })
	const reboundPlan = await rebound.deletion.planSelections()
	rebound.game.clearCell([1, 0])
	const replacementBeforeDelete = spawnAttachedCube(rebound.game, reboundPump, [-1, 0], { fill: 17 })
	const reboundDelete = await rebound.deletion.execute(reboundPlan, 'mouse')
	assert.equal(reboundDelete.executed, true, JSON.stringify({
		reboundDelete,
		diagnostics: rebound.deletion.diagnostics()
	}))
	assert.equal(rebound.game.entityAtCoordinates([0, 0]), null)
	assert.equal(rebound.game.entityAtCoordinates([-1, 0]), null)
	assert.ok(!rebound.game.stuff.includes(replacementBeforeDelete))

	assert.equal((await rebound.transactions.undo({ input: 'keyboard' })).executed, true)
	let reboundRestoredPump = rebound.game.entityAtCoordinates([0, 0])
	const completedBeforeRedo = rebound.game.entityAtCoordinates([-1, 0])
	assert.equal(completedBeforeRedo.fill, 17)
	assert.strictEqual(completedBeforeRedo.pump, reboundRestoredPump)
	completedBeforeRedo.state = 2
	completedBeforeRedo.fill = 64
	completedBeforeRedo.unveilProgress = 1
	const replacementBeforeRedo = spawnAttachedCube(rebound.game, reboundRestoredPump, [0, 1], { fill: 23 })
	const reboundRedo = await rebound.transactions.redo({ input: 'keyboard' })
	assert.equal(reboundRedo.executed, true, JSON.stringify({
		reboundRedo,
		diagnostics: rebound.deletion.diagnostics()
	}))
	assert.strictEqual(rebound.game.entityAtCoordinates([-1, 0]), completedBeforeRedo)
	assert.equal(rebound.game.entityAtCoordinates([0, 1]), null)
	assert.ok(!rebound.game.stuff.includes(replacementBeforeRedo))

	assert.equal((await rebound.transactions.undo({ input: 'keyboard' })).executed, true)
	reboundRestoredPump = rebound.game.entityAtCoordinates([0, 0])
	const restoredRedoCube = rebound.game.entityAtCoordinates([0, 1])
	assert.equal(restoredRedoCube.fill, 23)
	assert.strictEqual(restoredRedoCube.pump, reboundRestoredPump)
	assert.strictEqual(rebound.game.entityAtCoordinates([-1, 0]), completedBeforeRedo)
	rebound.dispose()

	const mixedCut = createEnvironment({
		selections: [
			{ id: 1, range: range(0, 0, 0, 0) },
			{ id: 2, range: range(5, 5, 0, 0) },
			{ id: 3, range: range(10, 10, 0, 0) }
		]
	})
	const firstCutPump = mixedCut.game.spawn('pump', [0, 0], { depth: 3 })
	const secondCutPump = mixedCut.game.spawn('pump2', [5, 0], { depth: 4 })
	mixedCut.game.spawn('gradient', [20, 0])
	mixedCut.game.spawn('conductor', [10, 0], { fill: 7, resources: [2, 5] })
	spawnAttachedCube(mixedCut.game, firstCutPump, [1, 0], { fill: 6 })
	spawnAttachedCube(mixedCut.game, secondCutPump, [6, 0], { fill: 8 })
	const mixedCutPlan = await mixedCut.deletion.planSelections()
	mixedCut.game.clearCell([1, 0])
	mixedCut.game.clearCell([6, 0])
	const currentFirstCutCube = spawnAttachedCube(mixedCut.game, firstCutPump, [-1, 0], { fill: 26 })
	const currentSecondCutCube = spawnAttachedCube(mixedCut.game, secondCutPump, [5, 1], { fill: 28 })
	const mixedCutResult = await mixedCut.deletion.execute(mixedCutPlan, 'mouse', { origin: 'cut' })
	assert.equal(mixedCutResult.executed, true, JSON.stringify({
		mixedCutResult,
		diagnostics: mixedCut.deletion.diagnostics()
	}))
	for (const position of [[0, 0], [5, 0], [10, 0], [-1, 0], [5, 1]]) {
		assert.equal(mixedCut.game.entityAtCoordinates(position), null)
	}
	assert.ok(!mixedCut.game.stuff.includes(currentFirstCutCube))
	assert.ok(!mixedCut.game.stuff.includes(currentSecondCutCube))
	assert.equal((await mixedCut.transactions.undo({ input: 'keyboard' })).executed, true)
	assert.equal(mixedCut.game.entityAtCoordinates([10, 0]).fill, 7)
	assert.strictEqual(mixedCut.game.entityAtCoordinates([-1, 0]).pump, mixedCut.game.entityAtCoordinates([0, 0]))
	assert.strictEqual(mixedCut.game.entityAtCoordinates([5, 1]).pump, mixedCut.game.entityAtCoordinates([5, 0]))
	mixedCut.dispose()

	const unsafeReplacement = createEnvironment()
	const unsafePump = unsafeReplacement.game.spawn('pump', [0, 0], { depth: 2 })
	unsafeReplacement.game.spawn('gradient', [5, 0])
	const unsafeCube = spawnAttachedCube(unsafeReplacement.game, unsafePump, [1, 0])
	const unsafePlan = await unsafeReplacement.deletion.planSelections()
	unsafeCube.resources.length = 63
	const unsafeResult = await unsafeReplacement.deletion.execute(unsafePlan, 'mouse')
	assert.equal(unsafeResult.executed, false)
	assert.equal(unsafeResult.error.code, 'TARGET_CHANGED')
	unsafeReplacement.dispose()
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

async function testBatchOwnedConductorVariantRebase() {
	function createBatchEnvironment() {
		const env = createEnvironment({
			simulateVanillaRelationInit: true,
			selections: [{ id: 1, range: range(0, 0, 0, 2) }]
		})
		env.game.spawn('silo', [0, 0], { fill: 4, state: 1 })
		const first = env.game.spawn('conductor', [0, 1], { channel: 1 })
		const second = env.game.spawn('conductor', [0, 2], { channel: 2 })
		return {
			env,
			first,
			second,
			initialVariants: [first.variant, second.variant]
		}
	}

	async function runHistoryRoundTrip(origin) {
		const batch = createBatchEnvironment()
		assert.ok(batch.initialVariants[0] > 0, origin + '.first-initial-variant')
		assert.ok(batch.initialVariants[1] > 0, origin + '.second-initial-variant')
		const plan = await batch.env.deletion.planSelections()
		assert.equal(plan.summary.safeCount, 3, origin)
		assert.deepEqual(clone(plan.removals.map(entry => entry.name)), [
			'silo',
			'conductor',
			'conductor'
		], origin)
		const result = await batch.env.deletion.execute(
			plan,
			origin === 'cut' ? 'cut' : 'mouse',
			{ origin }
		)
		assert.equal(result.executed, true, JSON.stringify({ origin, result }))
		for (let v = 0; v <= 2; v += 1) {
			assert.equal(batch.env.game.entityAtCoordinates([0, v]), null, origin + '.deleted.' + v)
		}
		assert.ok(
			batch.env.deletion.diagnostics().events.some(event => (
				event.event === 'apply.conductor-variant-rebased' &&
				event.details?.position?.[0] === 0 &&
				event.details?.position?.[1] === 2
			)),
			origin + '.variant-rebase-event'
		)

		const undo = await batch.env.transactions.undo({ input: 'keyboard' })
		assert.equal(undo.executed, true, JSON.stringify({ origin, undo }))
		assert.equal(batch.env.game.entityAtCoordinates([0, 0])?.name, 'silo', origin)
		assert.equal(batch.env.game.entityAtCoordinates([0, 1])?.channel, 1, origin)
		assert.equal(batch.env.game.entityAtCoordinates([0, 2])?.channel, 2, origin)
		assert.deepEqual([
			batch.env.game.entityAtCoordinates([0, 1])?.variant,
			batch.env.game.entityAtCoordinates([0, 2])?.variant
		], batch.initialVariants, origin + '.undo-variants')

		const redo = await batch.env.transactions.redo({ input: 'keyboard' })
		assert.equal(redo.executed, true, JSON.stringify({ origin, redo }))
		for (let v = 0; v <= 2; v += 1) {
			assert.equal(batch.env.game.entityAtCoordinates([0, v]), null, origin + '.redo.' + v)
		}

		const secondUndo = await batch.env.transactions.undo({ input: 'keyboard' })
		assert.equal(secondUndo.executed, true, JSON.stringify({ origin, secondUndo }))
		assert.deepEqual([
			batch.env.game.entityAtCoordinates([0, 1])?.variant,
			batch.env.game.entityAtCoordinates([0, 2])?.variant
		], batch.initialVariants, origin + '.second-undo-variants')
		batch.env.dispose()
	}

	await runHistoryRoundTrip('delete')
	await runHistoryRoundTrip('cut')

	const rollback = createBatchEnvironment()
	const rollbackPlan = await rollback.env.deletion.planSelections()
	rollback.env.game.failClearAt = 3
	const failed = await rollback.env.deletion.execute(rollbackPlan, 'mouse')
	assert.equal(failed.executed, false, JSON.stringify(failed))
	assert.equal(failed.reason, 'rolled-back', JSON.stringify(failed))
	assert.equal(failed.error.code, 'APPLY_FAILED', JSON.stringify(failed))
	assert.equal(rollback.env.game.entityAtCoordinates([0, 0])?.name, 'silo')
	assert.equal(rollback.env.game.entityAtCoordinates([0, 1])?.channel, 1)
	assert.equal(rollback.env.game.entityAtCoordinates([0, 2])?.channel, 2)
	assert.deepEqual([
		rollback.env.game.entityAtCoordinates([0, 1])?.variant,
		rollback.env.game.entityAtCoordinates([0, 2])?.variant
	], rollback.initialVariants)
	rollback.env.dispose()

	async function assertExternalChangeRejected(label, mutate, readValue, expectedValue) {
		const batch = createBatchEnvironment()
		const plan = await batch.env.deletion.planSelections()
		batch.env.transactions.beforeApply = function () {
			mutate(batch.second)
		}
		const result = await batch.env.deletion.execute(plan, 'mouse')
		assert.equal(result.executed, false, JSON.stringify({ label, result }))
		assert.equal(result.reason, 'rolled-back', JSON.stringify({ label, result }))
		assert.equal(result.error.code, 'EXTERNAL_CHANGE', JSON.stringify({ label, result }))
		assert.equal(batch.env.game.entityAtCoordinates([0, 0])?.name, 'silo', label)
		assert.equal(batch.env.game.entityAtCoordinates([0, 1])?.name, 'conductor', label)
		assert.equal(batch.env.game.entityAtCoordinates([0, 2])?.name, 'conductor', label)
		assert.equal(readValue(batch.second), expectedValue, label + '.external-state-preserved')
		batch.env.dispose()
	}

	await assertExternalChangeRejected(
		'external Conductor variant change',
		entity => { entity.variant = 0.75 },
		entity => entity.variant,
		0.75
	)
	await assertExternalChangeRejected(
		'external Conductor configuration change',
		entity => { entity.channel = 9 },
		entity => entity.channel,
		9
	)
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
		'deletePreviewRefreshFailed',
		'attachedCubeRemovalNotice'
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
	assert.match(ui, /attachedCubeRemovalNotice/)
	assert.match(core, /const PROBE_EVENT_LIMIT = 160/)
	assert.match(core, /diagnostics\(\)/)
	assert.doesNotMatch(core, /\[4C-1a Probe\]/)
	assert.match(core, /apply\.clear\.before/)
	assert.match(core, /apply\.clear\.after/)
	assert.match(core, /comparePlanFingerprints/)
	assert.match(core, /changedRemovalSaves/)
	assert.match(core, /operating-targets-r21/)
	assert.match(core, /contract\.redo\.dynamic-surge-rebased/)
	assert.match(core, /contract\.dynamic\.committed/)
	assert.match(core, /contract\.rollback\.dynamic-compensated/)
	assert.match(core, /contract\.undo\.restoration-occupant-denied/)
	assert.match(core, /contract\.forward\.transaction-vacancy-cube-suppressed/)
	assert.match(core, /contract\.rollback\.transaction-vacancy-cube-cleared/)
	assert.match(core, /function isUnfinishedPumpCube/)
	assert.match(core, /function compatiblePumpCubeStates/)
	assert.match(core, /function comparableDeletionSave/)
	assert.match(core, /delete save\.par\.soul/)
	assert.match(ui, /safe: confirmedTargetCount/)
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
	await testOperatingBuildingRuntimeDriftUsesLatestUndoState()
	await testOperatingPumpAndUnfinishedCubeAreAtomic()
	await testCreativeOrdinaryStableCubeDisassemblyAndSafety()
	await testDynamicOrdinaryCubeLayerDoesNotBlockBuildings()
	await testCutRetainedCubeLayersRebindBetweenPreflights()
	await testRedoDynamicOrdinaryCubeUsesHistoricalCellAnchor()
	await testUndoTransientOccupantDenialReportsHistoryProvenance()
	await testUndoHistoricalCubeReplacesTransactionPumpSuccessor()
	await testUndoRestorationOccupantDenialDiagnostics()
	await testDynamicOrdinaryCubeCanDisappearDuringChunkedApply()
	await testUndoDynamicCubeCommitManifestAndGoalStateRollback()
	await testUndoAttachedCubeReconciliation()
	await testUndoAttachedCubeLifecycleContract()
	await testUndoDynamicLifecycleRollbackProvenance()
	await testRedoPumpOwnedStableCubeClosure()
	await testLateAttachedCubeDoesNotDuplicateHistoricalOrdinaryCell()
	await testLateAttachedCubeOwnerClosureAndLegacyUndoFallback()
	await testSecondPreflightProtectedCubeMismatchDiagnostics()
	await testSelectedPumpTerminalCubeContract()
	await testPumpRuntimeAcceptsAttachedTerminalTransitions()
	await testPumpRuntimeMixedLifecycleBatch()
	await testPumpRuntimeTerminalTransitionRemainsStrict()
	await testRedoUsesRecordedSelectionSource()
	await testRedoUsesCurrentAttachedCubeSave()
	await testPrepareMismatchUsesRecordedTargetSummaries()
	await testRecordedTargetStateDenialProbe()
	await testForwardRollbackClearsTransactionVacancyCube()
	await testDynamicReconcileBudgetRollsBackCompletely()
	await testPaintedCubeCompatibilityAndGrowProgress()
	await testResourceGrowthDuringLargePaintedDeletion()
	await testProtectedRuntimeSaveDriftDoesNotInvalidateDeletion()
	await testUndoDeletionTreatsSafeStandaloneSurgesAsEmpty()
	await testRedoRebasesSafeStandaloneSurgeSet()
	await testSurgeLifeDriftUsesLatestUndoStateAndStrictGuards()
	await testPaintedRuntimeDriftUsesLatestUndoState()
	await testCrossTransactionPaintDeleteRedoRebindsCompatibleRuntimeIdentity()
	await testPaintedRuntimeCompatibilityRemainsStrict()
	await testConnectedStabilizerSurgeSingleAndPairTransactions()
	await testBatchOwnedConductorVariantRebase()
	testLocalizationManifestUiAndDocumentation()
	console.log('World Editor 4C-1a verification passed: union planning, Creative Stable ordinary Cube dismantling, painted Cube and Surge runtime compatibility, Grow drift, protection, economy, snapshots, atomic delete, undo/redo, UI guards, 20 languages, and scope boundaries.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
