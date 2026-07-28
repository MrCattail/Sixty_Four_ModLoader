const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHARED_SOURCE = 'scripts/core/shared.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const SELECTION_SOURCE = 'scripts/input/selection-controller.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function eventHub() {
	const listeners = new Map()
	return {
		addEventListener(type, listener, capture = false) {
			if (!listeners.has(type)) listeners.set(type, [])
			listeners.get(type).push({ listener, capture })
		},
		removeEventListener(type, listener, capture = false) {
			const current = listeners.get(type) || []
			listeners.set(type, current.filter(entry => entry.listener !== listener || entry.capture !== capture))
		},
		dispatch(type, event) {
			for (const entry of (listeners.get(type) || []).slice()) entry.listener(event)
		},
		listenerCount(type) {
			return (listeners.get(type) || []).length
		}
	}
}

class MiniElement {
	constructor(tagName, ownerDocument) {
		this.tagName = String(tagName).toUpperCase()
		this.ownerDocument = ownerDocument
		this.nodeType = 1
		this.children = []
		this.parentNode = null
		this.dataset = {}
		this.attributes = {}
		this.className = ''
		this.id = ''
		this.textContent = ''
		this.style = {}
		this.listeners = new Map()
		this.offsetWidth = 372
		this.offsetHeight = 260
		this.hidden = false
		this.classList = {
			contains: name => String(this.className).split(/\s+/).includes(name)
		}
	}

	append(...nodes) {
		for (const node of nodes) {
			node.parentNode = this
			this.children.push(node)
		}
	}

	replaceChildren(...nodes) {
		for (const child of this.children) child.parentNode = null
		this.children = []
		this.append(...nodes)
	}

	remove() {
		if (!this.parentNode) return
		const index = this.parentNode.children.indexOf(this)
		if (index >= 0) this.parentNode.children.splice(index, 1)
		this.parentNode = null
	}

	setAttribute(name, value) {
		this.attributes[name] = String(value)
	}

	getAttribute(name) {
		return this.attributes[name]
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const current = this.listeners.get(type) || []
		this.listeners.set(type, current.filter(entry => entry !== listener))
	}

	dispatch(type, event = {}) {
		if (!event.target) event.target = this
		for (const listener of (this.listeners.get(type) || []).slice()) listener(event)
		return event
	}

	find(predicate) {
		for (const child of this.children) {
			if (predicate(child)) return child
			const nested = child.find(predicate)
			if (nested) return nested
		}
		return null
	}

	closest() {
		return null
	}

	getBoundingClientRect() {
		return {
			left: Number.parseFloat(this.style.left) || 0,
			top: Number.parseFloat(this.style.top) || 0,
			width: this.offsetWidth,
			height: this.offsetHeight
		}
	}
}

function createMiniDocument() {
	const document = {}
	document.createElement = tagName => new MiniElement(tagName, document)
	document.body = document.createElement('body')
	document.head = document.createElement('head')
	document.documentElement = { clientWidth: 1000, clientHeight: 800 }
	document.activeElement = null
	document.getElementById = id => (
		document.body.find(node => node.id === id) ||
		document.head.find(node => node.id === id)
	)
	return document
}

function loadPlanner() {
	const definitions = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		},
		console: {
			info() {},
			warn() {},
			error() {}
		},
		setTimeout,
		clearTimeout
	}
	vm.createContext(sandbox)
	const filename = path.join(MOD_ROOT, PLAN_SOURCE)
	vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	assert.equal(definitions.length, 1)
	definitions[0].init()
	assert.ok(sandbox[PLAN_KEY])
	return { planner: sandbox[PLAN_KEY], sandbox }
}

function previewClass() {
	return class PreviewEntity {
		constructor(game) {
			this.game = game
		}

		renderColored(dt, position) {
			this.game.renderCalls += 1
			this.recordDraw(position)
		}

		darkrenderColored(dt, position) {
			this.game.darkRenderCalls += 1
			this.recordDraw(position)
		}

		recordDraw(position) {
			const projected = this.game.uvToXY(position)
			const transform = this.game.ctx.getTransform?.()
			this.game.renderTransforms.push(transform ? plain(transform) : null)
			this.game.ctx.fillRect?.(projected[0] - 1, projected[1] - 1, 2, 2)
		}
	}
}

function createGame() {
	const cells = new Map()
	const EntityClass = previewClass()
	const game = {
		plane: 0,
		halt: false,
		splash: { isShown: false },
		hoveredCell: [20, 20],
		resources: [10, 100],
		eraserType: 1,
		entitiesInGame: {
			silo: 1,
			pump: 1,
			unique: 0,
			'no-price': 0,
			eraser: 0,
			eraser2: 0,
			eraser3: 0
		},
		onlyones: {},
		renderCalls: 0,
		darkRenderCalls: 0,
		renderTransforms: [],
		unit: 24,
		zoom: 1,
		codex: {
			entities: {
				silo: { canPurchase: true, price: [10, 4], priceExponent: 2, class: EntityClass },
				pump: { canPurchase: true, price: [5, 1], priceExponent: 1, class: EntityClass },
				unique: { canPurchase: true, onlyone: true, price: [25, 0], priceExponent: 1, class: EntityClass },
				'no-price': { canPurchase: true, class: EntityClass },
				eraser: { canPurchase: true, price: [1, 0], priceExponent: 1, class: EntityClass },
				eraser2: { canPurchase: true, price: [2, 0], priceExponent: 1, class: EntityClass },
				eraser3: { canPurchase: true, price: [3, 0], priceExponent: 1, class: EntityClass }
			},
			resources: [
				{ name: 'resource-0', triplet: ['#111111', '#222222', '#333333'] },
				{ name: 'resource-1', triplet: ['#444444', '#555555', '#666666'] }
			]
		},
		entityAtCoordinates(position) {
			return cells.get(position[0] + ':' + position[1]) || null
		},
		uvToXY(position) {
			return [position[0] * 12, position[1] * 6]
		},
		updateMouseData() {},
		pronounce(section, name) {
			return name
		},
		makeReadable(value) {
			return String(value)
		}
	}
	game.setCell = function (u, v, entity) {
		const key = u + ':' + v
		if (entity) cells.set(key, entity)
		else cells.delete(key)
	}
	return game
}

function entity(name, position, options = {}) {
	return {
		name,
		position: position.slice(),
		entitySpan: options.entitySpan || 0,
		indestructible: !!options.indestructible,
		par: Object.assign({}, options.par)
	}
}

function record(id, name, position, options = {}) {
	const span = options.span || 0
	return {
		id,
		kind: 'entity',
		name,
		position: position.slice(),
		footprint: {
			span,
			min: [position[0] - span, position[1] - span],
			max: [position[0] + span, position[1] + span]
		},
		config: Object.assign({}, options.config),
		restricted: {
			onlyOne: !!options.onlyOne
		}
	}
}

function blueprint(records, options = {}) {
	const minU = Math.min(...records.map(entry => entry.footprint.min[0]))
	const maxU = Math.max(...records.map(entry => entry.footprint.max[0]))
	const minV = Math.min(...records.map(entry => entry.footprint.min[1]))
	const maxV = Math.max(...records.map(entry => entry.footprint.max[1]))
	const schemaVersion = options.schemaVersion ?? 1
	return {
		schemaVersion,
		mode: options.mode || 'structure',
		sourcePlane: options.sourcePlane || 0,
		anchor: schemaVersion === 2 || schemaVersion === 3
			? { position: [0, 0], selectionIds: [1] }
			: { position: [0, 0], selectionId: 1 },
		contentBounds: {
			min: [minU, minV],
			max: [maxU, maxV],
			width: maxU - minU + 1,
			height: maxV - minV + 1
		},
		entities: records
	}
}

async function testPlannerStatusesCostsAndGuards() {
	const { planner } = loadPlanner()
	const game = createGame()
	const exact = entity('silo', [11, 10], { par: { fill: 7 } })
	const replaceable = entity('pump', [12, 10])
	const cube = entity('cube', [13, 10], { indestructible: true })
	game.setCell(11, 10, exact)
	game.setCell(12, 10, replaceable)
	game.setCell(13, 10, cube)

	const source = blueprint([
		record(1, 'silo', [0, 0], { config: { fill: 7 } }),
		record(2, 'silo', [1, 0], { config: { fill: 7 } }),
		record(3, 'silo', [2, 0], { config: { fill: 7 } }),
		record(4, 'silo', [3, 0], { config: { fill: 7 } })
	])
	const plan = await planner.build(game, source, [10, 10])
	assert.equal(plan.version, '0.3.4')
	assert.deepEqual(plain(plan.records.map(entry => entry.status)), [
		'buildable',
		'satisfied',
		'conflict',
		'blocked'
	])
	assert.deepEqual(plain(plan.statusCounts), {
		buildable: 1,
		satisfied: 1,
		conflict: 1,
		blocked: 1
	})
	assert.equal(plan.cost.buildCount, 1)
	assert.deepEqual(plain(plan.cost.demand), [20, 8])
	assert.deepEqual(plain(plan.cost.required), [20, 8])
	assert.deepEqual(plain(plan.cost.shortfall), [10, 0])
	assert.deepEqual(plain(plan.cost.byType), [{
		name: 'silo',
		buildCount: 1,
		demand: [20, 8]
	}])
	assert.equal(planner.verify(game, plan.guard), true)
	assert.deepEqual(plain(planner.inspect(game, plan.guard)), { valid: true, reason: 'valid' })
	assert.deepEqual(plain(planner.inspect(null, plan.guard)), { valid: false, reason: 'invalid' })

	game.setCell(10, 10, entity('pump', [10, 10]))
	assert.equal(planner.verify(game, plan.guard), false)
	assert.deepEqual(plain(planner.inspect(game, plan.guard)), { valid: false, reason: 'cells' })
	game.setCell(10, 10, null)
	assert.equal(planner.verify(game, plan.guard), true)

	game.entitiesInGame.silo += 1
	assert.equal(planner.verify(game, plan.guard), false)
	assert.deepEqual(plain(planner.inspect(game, plan.guard)), { valid: false, reason: 'counts' })
	game.entitiesInGame.silo -= 1
	game.onlyones.silo = true
	assert.equal(planner.verify(game, plan.guard), false)
	assert.deepEqual(plain(planner.inspect(game, plan.guard)), { valid: false, reason: 'onlyones' })
	delete game.onlyones.silo
	game.resources[0] += 1
	assert.equal(planner.verify(game, plan.guard), false)
	assert.deepEqual(plain(planner.inspect(game, plan.guard)), { valid: false, reason: 'resources' })
	const refreshed = planner.refreshResources(game, plan)
	assert.notEqual(refreshed, plan)
	assert.equal(refreshed.records, plan.records)
	assert.equal(refreshed.statusCounts, plan.statusCounts)
	assert.equal(refreshed.bounds, plan.bounds)
	assert.equal(refreshed.guard.cells, plan.guard.cells)
	assert.equal(refreshed.guard.counts, plan.guard.counts)
	assert.equal(refreshed.guard.onlyones, plan.guard.onlyones)
	assert.equal(refreshed.cost.required, plan.cost.required)
	assert.equal(refreshed.cost.demand, plan.cost.demand)
	assert.equal(refreshed.cost.byType, plan.cost.byType)
	assert.deepEqual(plain(refreshed.guard.resources), [11, 100])
	assert.deepEqual(plain(refreshed.cost.owned), [11, 100])
	assert.deepEqual(plain(refreshed.cost.shortfall), [9, 0])
	assert.deepEqual(plain(plan.guard.resources), [10, 100])
	assert.equal(planner.verify(game, refreshed.guard), true)
	game.resources[0] -= 1
	assert.equal(planner.verify(game, plan.guard), true)

	const schema2Plan = await planner.build(game, blueprint([
		record(5, 'silo', [0, 0])
	], { schemaVersion: 2 }), [30, 30])
	assert.equal(schema2Plan.records[0].status, 'buildable')

	game.setCell(31, 30, entity('surge', [31, 30], { indestructible: true }))
	const surgePlan = await planner.build(game, blueprint([
		record(7, 'silo', [0, 0])
	], { schemaVersion: 2 }), [31, 30])
	assert.equal(surgePlan.records[0].status, 'buildable')
	assert.equal(surgePlan.cost.buildCount, 1)
	assert.equal(surgePlan.guard.cells[0].entity, null)
	game.setCell(31, 30, null)
	assert.equal(planner.verify(game, surgePlan.guard), true)
	game.setCell(31, 30, entity('surge', [31, 30], { indestructible: true }))
	assert.equal(planner.verify(game, surgePlan.guard), true)
	game.setCell(31, 30, null)

	const incomplete = await planner.build(game, blueprint([
		record(6, 'no-price', [0, 0])
	]), [40, 40])
	assert.equal(incomplete.cost.complete, false)
	assert.equal(incomplete.cost.buildCount, 1)
	assert.deepEqual(plain(incomplete.cost.byType), [{
		name: 'no-price',
		buildCount: 1,
		demand: []
	}])

	const dedupe = await planner.build(game, blueprint([
		record(1, 'silo', [0, 0]),
		record(2, 'silo', [0, 0])
	]), [12, 10])
	assert.equal(dedupe.cost.buildCount, 0)
	assert.deepEqual(plain(dedupe.cost.byType), [])
}

async function testOnlyOneCancellationAndBenchmark() {
	const { planner } = loadPlanner()
	const game = createGame()
	const unique = entity('unique', [5, 5])
	game.setCell(5, 5, unique)
	game.entitiesInGame.unique = 1
	game.onlyones.unique = true
	const source = blueprint([record(1, 'unique', [0, 0], { onlyOne: true })])

	const exact = await planner.build(game, source, [5, 5])
	assert.equal(exact.records[0].status, 'satisfied')
	const elsewhere = await planner.build(game, source, [6, 5])
	assert.equal(elsewhere.records[0].status, 'blocked')
	assert.equal(elsewhere.records[0].reason, 'only-one')

	await assert.rejects(
		planner.build(game, source, [6, 5], { isCancelled() { return true } }),
		error => error?.code === 'plan-cancelled'
	)
	await assert.rejects(
		planner.build(game, blueprint(source.entities, { mode: 'full' }), [6, 5]),
		error => error?.code === 'structure-blueprint-required'
	)
	const schema3 = await planner.build(game, blueprint(source.entities, { schemaVersion: 3 }), [6, 5])
	assert.equal(schema3.records[0].status, 'blocked')

	let tick = 0
	const benchmark = await planner.benchmark({
		samples: 1,
		now() {
			tick += 1
			return tick
		}
	})
	assert.equal(benchmark.kind, 'synthetic-plan')
	assert.deepEqual(plain(benchmark.results.map(entry => entry.size)), [100, 500, 2000])
	for (const result of benchmark.results) {
		assert.equal(result.samples, 1)
		assert.equal(result.medianMs, 1)
		assert.equal(result.p95Ms, 1)
	}
}

function observable(initial) {
	let state = initial
	const listeners = new Set()
	return {
		snapshot() {
			return state
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(state)
			return () => listeners.delete(listener)
		},
		set(next) {
			state = next
			for (const listener of Array.from(listeners)) listener(state)
		}
	}
}

function inputEvent(button) {
	return {
		button,
		buttons: button === 2 ? 2 : 1,
		offsetX: 10,
		offsetY: 10,
		prevented: false,
		stopped: false,
		preventDefault() {
			this.prevented = true
		},
		stopImmediatePropagation() {
			this.stopped = true
		}
	}
}

function keyEvent(code, key) {
	return {
		code,
		key,
		prevented: false,
		stopped: false,
		preventDefault() {
			this.prevented = true
		},
		stopImmediatePropagation() {
			this.stopped = true
		}
	}
}

function createContext() {
	let saves = 0
	let restores = 0
	let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
	const stack = []
	const setTransforms = []
	const clearedRects = []
	const drawnRects = []
	const movedPoints = []
	const projectPoint = function (x, y) {
		return {
			x: transform.a * x + transform.c * y + transform.e,
			y: transform.b * x + transform.d * y + transform.f
		}
	}
	const canvas = {
		width: 800,
		height: 600,
		style: {},
		getBoundingClientRect() {
			return { left: 0, top: 0, width: 800, height: 600 }
		}
	}
	return {
		canvas,
		save() {
			saves += 1
			stack.push(Object.assign({}, transform))
		},
		restore() {
			restores += 1
			transform = stack.pop() || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
		},
		setTransform(a, b, c, d, e, f) {
			transform = { a, b, c, d, e, f }
			setTransforms.push(Object.assign({}, transform))
		},
		translate(x, y) {
			transform.e += transform.a * x + transform.c * y
			transform.f += transform.b * x + transform.d * y
		},
		getTransform() {
			return Object.assign({}, transform)
		},
		beginPath() {},
		clearRect(x, y, width, height) {
			const point = projectPoint(x, y)
			clearedRects.push({ x: point.x, y: point.y, width, height })
		},
		moveTo(x, y) {
			movedPoints.push(projectPoint(x, y))
		},
		lineTo() {},
		closePath() {},
		fill() {},
		fillRect(x, y, width, height) {
			const point = projectPoint(x, y)
			drawnRects.push({ x: point.x, y: point.y, width, height })
		},
		stroke() {},
		setLineDash() {},
		counts() {
			return { saves, restores }
		},
		snapshot() {
			return {
				transform: Object.assign({}, transform),
				setTransforms: setTransforms.map(entry => Object.assign({}, entry)),
				clearedRects: clearedRects.map(entry => Object.assign({}, entry)),
				drawnRects: drawnRects.map(entry => Object.assign({}, entry)),
				movedPoints: movedPoints.map(entry => Object.assign({}, entry))
			}
		}
	}
}

async function flushMicrotasks(rounds = 12) {
	for (let index = 0; index < rounds; index += 1) await Promise.resolve()
}

function createRuntimeEnvironment(options = {}) {
	const definitions = []
	const handlers = new Map()
	const canvas = eventHub()
	const window = options.window || eventHub()
	const document = options.document
	window.innerWidth = 1000
	window.innerHeight = 800
	const layers = new Map()
	const ensureLayer = function (id) {
		if (!layers.has(id)) {
			layers.set(id, {
				callback: null,
				options: null,
				definition: null,
				dirty: false,
				dirtyMarks: 0
			})
		}
		return layers.get(id)
	}
	let frameCallback = null
	let active = true
	const cleanup = []
	const runtimeListeners = new Set()
	const game = createGame()
	const context = createContext()
	game.canvas = canvas
	game.ctx = context
	game.w = 800
	game.h = 600
	game.w2 = 400
	game.h2 = 300
	game.pixelRatio = 1
	game.entitiesInGame.silo = 0
	game.entitiesInGame.pump = 0
	game.resources = [1000, 1000]
	canvas.width = 800
	canvas.height = 600
	canvas.getBoundingClientRect = function () {
		return { left: 100, top: 50, width: 800, height: 600 }
	}

	const runtime = {
		game,
		snapshot() {
			return { active }
		},
		isActive() {
			return active
		},
		subscribe(listener) {
			runtimeListeners.add(listener)
			listener({ active })
			return () => runtimeListeners.delete(listener)
		},
		addCleanup(listener) {
			cleanup.push(listener)
		},
		setActive(next) {
			active = !!next
			for (const listener of Array.from(runtimeListeners)) listener({ active })
		},
		runCleanups() {
			while (cleanup.length) cleanup.shift()()
		}
	}
	const session = observable({
		attemptId: 0,
		blueprint: null,
		lastResult: null
	})
	session.game = game
	const selection = {
		game,
		snapshot() {
			return {}
		}
	}
	let nowMs = 1000
	let timerId = 0
	const timers = new Map()
	const infoLogs = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		},
		console: {
			info(...args) {
				infoLogs.push(args.map(String).join(' '))
			},
			warn() {},
			error() {}
		},
		document,
		window,
		devicePixelRatio: 1,
		performance: {
			now() {
				return nowMs
			}
		},
		setTimeout(listener, delay) {
			timerId += 1
			timers.set(timerId, {
				listener,
				delay,
				dueAt: nowMs + Math.max(0, Number(delay) || 0)
			})
			return timerId
		},
		clearTimeout(id) {
			timers.delete(id)
		}
	}
	vm.createContext(sandbox)
	if (options.transform) sandbox[TRANSFORM_KEY] = options.transform
	for (const source of [SHARED_SOURCE, PLAN_SOURCE, PREVIEW_SOURCE]) {
		const filename = path.join(MOD_ROOT, source)
		vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	}
	assert.equal(definitions.length, 3)

	const api = {
		on(name, listener) {
			if (!handlers.has(name)) handlers.set(name, [])
			handlers.get(name).push(listener)
		},
		emit(name, ...args) {
			for (const listener of handlers.get(name) || []) listener(...args)
		},
		render: {
			registerLayer(layer, options) {
				assert.ok(['world-editor-blueprint-preview', 'world-editor-blueprint-transform-guide'].includes(layer))
				const state = ensureLayer(layer)
				state.definition = Object.assign({}, options)
				return function () {
					state.definition = null
				}
			},
			onLayer(layer, callback, options) {
				assert.ok(['world-editor-blueprint-preview', 'world-editor-blueprint-transform-guide'].includes(layer))
				const state = ensureLayer(layer)
				state.callback = callback
				state.options = options
				return function () {
					state.callback = null
				}
			},
			onFrame(callback) {
				frameCallback = callback
				return function () {
					frameCallback = null
				}
			},
			markDirty(layer, renderGame) {
				assert.ok(['world-editor-blueprint-preview', 'world-editor-blueprint-transform-guide'].includes(layer))
				assert.equal(renderGame, game)
				const state = ensureLayer(layer)
				state.dirty = true
				state.dirtyMarks += 1
				return true
			}
		},
		ui: {
			hud: {
				isHidden() {
					return false
				}
			},
			isVanillaGameHudHidden() {
				return false
			}
		}
	}
	definitions[0].init(api)
	definitions[1].init(api)
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[BLUEPRINT_KEY] = session
	sandbox[I18N_KEY] = {
		t(languageOrGame, key) {
			return key
		}
	}
	definitions[2].init(api)
	api.emit('afterGameInit', {}, game)
	return {
		api,
		sandbox,
		game,
		runtime,
		session,
		canvas,
		window,
		document,
		context,
		infoLogs,
		controller: sandbox[PREVIEW_KEY],
		getLayer(id = 'world-editor-blueprint-preview') {
			return ensureLayer(id)
		},
		getFrame() {
			return frameCallback
		},
		runFrame() {
			let redrawn = false
			for (const state of layers.values()) {
				if (state.callback && state.dirty && state.options?.enabled?.({ game })) {
					state.callback({ game, ctx: context })
					state.dirty = false
					redrawn = true
				}
			}
			if (frameCallback) frameCallback({ game })
			return redrawn
		},
		advanceTime(milliseconds) {
			nowMs += Math.max(0, Number(milliseconds) || 0)
			while (true) {
				const due = Array.from(timers.entries())
					.filter(([, timer]) => timer.dueAt <= nowMs)
					.sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])
				if (!due.length) break
				const [id, timer] = due[0]
				timers.delete(id)
				timer.listener()
			}
		},
		timerCount(delay) {
			return Array.from(timers.values()).filter(timer => delay === undefined || timer.delay === delay).length
		}
	}
}

async function testRuntimeLifecycleInputAndRendering() {
	const env = createRuntimeEnvironment()
	assert.ok(env.controller)
	assert.equal(env.controller.version, '0.3.4')
	assert.deepEqual(env.getLayer().definition, {
		order: 39,
		zIndex: 39,
		cache: true,
		clearEachFrame: false
	})
	assert.equal(env.getLayer().options.order, 0)
	assert.equal(env.getLayer().options.space, 'screen')
	assert.deepEqual(env.getLayer('world-editor-blueprint-transform-guide').definition, {
		order: 41,
		zIndex: 41,
		cache: true,
		clearEachFrame: false
	})
	assert.equal(env.canvas.listenerCount('wheel'), 0)

	const structure = blueprint([record(1, 'silo', [0, 0], { config: { fill: 3 } })])
	env.session.set({
		attemptId: 1,
		blueprint: structure,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await flushMicrotasks()
	let state = env.controller.snapshot()
	assert.equal(state.active, true)
	assert.equal(state.pinned, false)
	assert.deepEqual(plain(state.target), [20, 20])
	assert.ok(state.plan)
	assert.equal(state.plan.records[0].status, 'buildable')

	const left = inputEvent(0)
	env.canvas.dispatch('mousedown', left)
	assert.equal(left.prevented, true)
	assert.equal(left.stopped, true)
	assert.equal(env.controller.snapshot().pinned, true)

	env.game.hoveredCell = [21, 20]
	const unpin = inputEvent(0)
	env.canvas.dispatch('mousedown', unpin)
	env.advanceTime(100)
	await flushMicrotasks()
	state = env.controller.snapshot()
	assert.equal(state.pinned, false)
	assert.deepEqual(plain(state.target), [21, 20])
	assert.deepEqual(plain(state.plan.target), [21, 20])

	const right = inputEvent(2)
	env.canvas.dispatch('mousedown', right)
	assert.equal(right.prevented, false)
	assert.equal(right.stopped, false)

	const layer = env.getLayer()
	assert.equal(layer.options.enabled({ game: env.game }), true)
	assert.equal(env.runFrame(), true)
	assert.equal(env.game.renderCalls, 1)
	assert.deepEqual(env.context.counts(), { saves: 3, restores: 3 })
	assert.deepEqual(env.game.renderTransforms[0], { a: 1, b: 0, c: 0, d: 1, e: 400, f: 300 })
	const drawing = env.context.snapshot()
	assert.deepEqual(drawing.transform, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
	assert.deepEqual(drawing.clearedRects[0], { x: 0, y: 0, width: 800, height: 600 })
	assert.ok(drawing.setTransforms.some(entry => entry.e === 400 && entry.f === 300))
	assert.ok(drawing.drawnRects.some(rect => (
		rect.x >= 0 &&
		rect.x <= env.game.w &&
		rect.y >= 0 &&
		rect.y <= env.game.h
	)))
	assert.ok(drawing.movedPoints.length > 0)
	assert.ok(drawing.movedPoints.every(point => (
		point.x >= 0 &&
		point.x <= env.game.w &&
		point.y >= 0 &&
		point.y <= env.game.h
	)))
	for (let index = 0; index < 8; index += 1) assert.equal(env.runFrame(), false)
	assert.equal(env.game.renderCalls, 1)
	assert.equal(env.controller.snapshot().performance.layerRedraws, 1)

	env.game.zoom = 1.25
	assert.equal(env.runFrame(), false)
	assert.equal(env.getLayer().dirty, true)
	assert.equal(env.runFrame(), true)
	assert.equal(env.game.renderCalls, 2)
	assert.equal(env.controller.snapshot().performance.layerRedraws, 2)

	env.game.plane = 1
	env.getFrame()({ game: env.game })
	assert.equal(env.controller.snapshot().paused, true)
	env.game.plane = 0
	env.getFrame()({ game: env.game })
	await flushMicrotasks()
	assert.equal(env.controller.snapshot().paused, false)

	const full = blueprint([record(1, 'silo', [0, 0])], { mode: 'full' })
	env.session.set({
		attemptId: 2,
		blueprint: full,
		lastResult: { attemptId: 2, status: 'captured' }
	})
	state = env.controller.snapshot()
	assert.equal(state.active, false)
	assert.equal(state.warning, 'full-unavailable')

	env.session.set({
		attemptId: 3,
		blueprint: structure,
		lastResult: { attemptId: 3, status: 'captured' }
	})
	await flushMicrotasks()
	assert.equal(env.controller.snapshot().active, true)
	env.runtime.setActive(false)
	assert.equal(env.controller.snapshot().active, false)

	env.runtime.runCleanups()
	assert.equal(env.sandbox[PREVIEW_KEY], undefined)
	assert.equal(env.canvas.listenerCount('mousedown'), 0)
	assert.equal(env.window.listenerCount('blur'), 0)
	assert.equal(env.getLayer().callback, null)
	assert.equal(env.getLayer().definition, null)
	assert.equal(env.getLayer('world-editor-blueprint-transform-guide').callback, null)
	assert.equal(env.getLayer('world-editor-blueprint-transform-guide').definition, null)
	assert.equal(env.getFrame(), null)
}

async function testFollowThrottleUiAndMetrics() {
	const document = createMiniDocument()
	const env = createRuntimeEnvironment({ document })
	const structure = blueprint([record(1, 'silo', [0, 0], { config: { fill: 3 } })])
	env.session.set({
		attemptId: 1,
		blueprint: structure,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await flushMicrotasks()
	env.runFrame()

	const baseline = env.controller.snapshot().performance
	assert.equal(baseline.followPlanIdleMs, 100)
	assert.equal(baseline.planRequests, 1)
	assert.equal(baseline.planCompletions, 1)
	assert.equal(baseline.pendingFollowPlan, false)

	for (let index = 0; index < 12; index += 1) {
		env.game.hoveredCell = [30 + index, 20]
		env.canvas.dispatch('mousemove', {
			buttons: 0,
			offsetX: 20 + index,
			offsetY: 20
		})
		env.runFrame()
		if (index < 11) env.advanceTime(80)
	}
	let current = env.controller.snapshot()
	assert.deepEqual(plain(current.target), [41, 20])
	assert.deepEqual(plain(current.plan.target), [20, 20])
	assert.equal(current.performance.pendingFollowPlan, true)
	assert.equal(current.performance.planRequests, baseline.planRequests)
	assert.equal(current.performance.layerRedraws, baseline.layerRedraws)
	assert.equal(env.timerCount(100), 1)
	assert.equal(current.performance.uiRefreshes, baseline.uiRefreshes)
	assert.equal(current.performance.resourceRebuilds, baseline.resourceRebuilds)
	assert.ok(current.performance.visualFollowUpdates >= baseline.visualFollowUpdates + 12)
	assert.equal(env.context.canvas.style.transform, 'translate3d(252px, 0px, 0)')
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '.85')
	assert.equal(env.context.canvas.style.transition, 'opacity 80ms linear')
	assert.doesNotMatch(env.context.canvas.style.transition, /transform/)
	assert.equal(env.context.canvas.style.willChange, 'transform')

	env.advanceTime(99)
	await flushMicrotasks()
	assert.equal(env.controller.snapshot().performance.planRequests, baseline.planRequests)
	env.advanceTime(1)
	await flushMicrotasks()
	current = env.controller.snapshot()
	assert.equal(current.performance.planRequests, baseline.planRequests + 1)
	assert.equal(current.performance.planCompletions, baseline.planCompletions + 1)
	assert.equal(current.performance.pendingFollowPlan, false)
	assert.deepEqual(plain(current.plan.target), [41, 20])

	env.runFrame()
	current = env.controller.snapshot()
	assert.equal(current.performance.layerRedraws, baseline.layerRedraws + 1)
	assert.equal(current.performance.resourceRebuilds, baseline.resourceRebuilds)
	assert.ok(current.performance.followSchedules >= 12)
	assert.equal(env.context.canvas.style.transform, '')
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '1')
	assert.equal(env.context.canvas.style.transition, 'opacity 80ms linear')
	assert.equal(env.context.canvas.style.willChange, 'transform')
	assert.equal(env.infoLogs.some(line => /planned \(mouse-follow\)|planned \(frame-follow\)/.test(line)), false)

	env.game.hoveredCell = [50, 20]
	env.canvas.dispatch('mousemove', {
		buttons: 0,
		offsetX: 40,
		offsetY: 20
	})
	env.runFrame()
	const beforePin = env.controller.snapshot().performance
	assert.equal(beforePin.pendingFollowPlan, true)
	assert.notEqual(env.context.canvas.style.transform, '')
	const pin = inputEvent(0)
	env.canvas.dispatch('mousedown', pin)
	assert.equal(env.controller.snapshot().pinned, true)
	assert.equal(env.timerCount(100), 0)
	assert.equal(env.controller.snapshot().performance.planRequests, beforePin.planRequests + 1)
	await flushMicrotasks()
	assert.deepEqual(plain(env.controller.snapshot().plan.target), [50, 20])
	env.runFrame()
	assert.equal(env.context.canvas.style.transform, '')
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '1')
	assert.equal(env.context.canvas.style.transition, 'opacity 80ms linear')
	assert.equal(env.context.canvas.style.willChange, 'transform')

	env.runtime.runCleanups()
	assert.equal(env.context.canvas.style.transform, '')
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '')
	assert.equal(env.context.canvas.style.transition, '')
	assert.equal(env.context.canvas.style.willChange, '')
}

async function testPreviewPublishesStateWithoutMountingCard() {
	const document = createMiniDocument()
	const env = createRuntimeEnvironment({ document })
	assert.equal(document.getElementById('cattail-world-editor-preview-card'), null)
	assert.equal(document.getElementById('cattail-world-editor-preview-style'), null)

	const structure = blueprint([record(1, 'silo', [0, 0], { config: { fill: 3 } })])
	env.session.set({
		attemptId: 1,
		blueprint: structure,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await flushMicrotasks()
	assert.equal(env.controller.snapshot().active, true)
	assert.ok(env.controller.snapshot().plan)
	assert.equal(document.getElementById('cattail-world-editor-preview-card'), null)

	env.game.hoveredCell = [23, 20]
	env.canvas.dispatch('mousemove', {
		buttons: 0,
		offsetX: 20,
		offsetY: 20
	})
	await flushMicrotasks()
	env.runFrame()
	assert.deepEqual(plain(env.controller.snapshot().target), [23, 20])

	const pin = inputEvent(0)
	env.canvas.dispatch('mousedown', pin)
	assert.equal(env.controller.snapshot().pinned, true)
	assert.equal(document.getElementById('cattail-world-editor-preview-card'), null)

	env.runtime.runCleanups()
	assert.equal(document.getElementById('cattail-world-editor-preview-card'), null)
	assert.equal(document.getElementById('cattail-world-editor-preview-style'), null)
}

async function testTemporaryAltPinLifecycle() {
	const env = createRuntimeEnvironment()
	const structure = blueprint([record(1, 'silo', [0, 0], { config: { fill: 3 } })])
	env.session.set({
		attemptId: 1,
		blueprint: structure,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await flushMicrotasks()

	const altLeftDown = keyEvent('AltLeft', 'Alt')
	env.window.dispatch('keydown', altLeftDown)
	let state = env.controller.snapshot()
	assert.equal(altLeftDown.prevented, true)
	assert.equal(altLeftDown.stopped, true)
	assert.equal(state.temporaryPinned, true)
	assert.equal(state.effectivePinned, true)
	assert.equal(state.pinned, false)
	assert.deepEqual(plain(state.target), [20, 20])

	env.game.hoveredCell = [25, 20]
	env.canvas.dispatch('mousemove', {
		buttons: 0,
		offsetX: 25,
		offsetY: 20
	})
	assert.deepEqual(plain(env.controller.snapshot().target), [20, 20])

	const altLeftUp = keyEvent('AltLeft', 'Alt')
	env.window.dispatch('keyup', altLeftUp)
	state = env.controller.snapshot()
	assert.equal(altLeftUp.prevented, true)
	assert.equal(state.temporaryPinned, false)
	assert.equal(state.effectivePinned, false)
	assert.deepEqual(plain(state.target), [25, 20])

	const altRightDown = keyEvent('AltRight', 'Alt')
	env.window.dispatch('keydown', altRightDown)
	assert.equal(env.controller.snapshot().temporaryPinned, true)
	const promote = inputEvent(0)
	env.canvas.dispatch('mousedown', promote)
	state = env.controller.snapshot()
	assert.equal(state.temporaryPinned, false)
	assert.equal(state.pinned, true)
	assert.equal(state.effectivePinned, true)
	assert.equal(promote.prevented, true)

	env.runtime.runCleanups()
}

function loadI18n() {
	const definitions = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	const filename = path.join(MOD_ROOT, I18N_SOURCE)
	vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	definitions[0].init()
	return sandbox[I18N_KEY]
}

function testManifestLocalizationAndStaticContracts() {
	const previewKeys = [
		'previewCardTitle',
		'previewBuildable',
		'previewSatisfied',
		'previewConflict',
		'previewBlocked',
		'previewBuildPlan',
		'previewTemporaryPinHint',
		'previewFullUnavailable',
		'previewPlanFailed',
		'previewCalculating',
		'previewPinned',
		'previewFollowing',
		'previewWaitingTarget',
		'previewRenderFallback',
		'previewCostIncomplete',
		'previewExitHint',
		'previewRequired',
		'previewOwned',
		'previewShortfall',
		'previewNoCost'
	]
	const i18n = loadI18n()
	assert.equal(i18n.version, '0.4.0')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 118)
	for (const language of i18n.languages) {
		for (const key of previewKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key)
			assert.ok(translated.trim())
		}
	}

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.4.0')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.deepEqual(manifest.entry, [
		'scripts/core/foundation.js',
		'scripts/core/shared.js',
		'scripts/core/editor-state.js',
		'scripts/core/creative-mode.js',
		'scripts/core/creative-economy.js',
		'scripts/core/editor-transactions.js',
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/core/selection-analysis.js',
		'scripts/core/production-state.js',
		'scripts/core/blueprint-transform.js',
		'scripts/core/blueprint-preview-plan.js',
		'scripts/core/input-controller.js',
		'scripts/render/resize-handles.js',
		'scripts/input/selection-controller.js',
		'scripts/render/hover-overlay.js',
		'scripts/render/selected-overlay.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/card-opacity.js',
		'scripts/ui/editor-shell.js',
		'scripts/blueprint-session.js',
		'scripts/blueprint-preview.js',
		'scripts/ui/selection-card.js',
		'scripts/ui/production-cards.js'
	])

	const previewSource = fs.readFileSync(path.join(MOD_ROOT, PREVIEW_SOURCE), 'utf8')
	const plannerSource = fs.readFileSync(path.join(MOD_ROOT, PLAN_SOURCE), 'utf8')
	const sessionSource = fs.readFileSync(path.join(MOD_ROOT, SESSION_SOURCE), 'utf8')
	const selectionSource = fs.readFileSync(path.join(MOD_ROOT, SELECTION_SOURCE), 'utf8')
	const readme = fs.readFileSync(path.join(MOD_ROOT, 'README.md'), 'utf8')
	const implementation = plannerSource + '\n' + previewSource + '\n' + sessionSource
	assert.match(previewSource, /entity\.darkrenderColored\s*:\s*entity\.renderColored/)
	assert.match(previewSource, /api\.render\.registerLayer\(RENDER_LAYER_ID/)
	assert.match(previewSource, /api\.render\.onLayer\(RENDER_LAYER_ID/)
	assert.match(previewSource, /order:\s*39/)
	assert.match(previewSource, /zIndex:\s*39/)
	assert.match(previewSource, /cache:\s*true/)
	assert.match(previewSource, /clearEachFrame:\s*false/)
	assert.match(previewSource, /FOLLOW_PLAN_IDLE_MS\s*=\s*100/)
	assert.match(previewSource, /style\.transform\s*=\s*offsetX\s*\|\|\s*offsetY\s*\?\s*'translate3d\('/)
	assert.match(previewSource, /setStyleValue\(style,\s*'filter',\s*''\)/)
	assert.doesNotMatch(previewSource, /PENDING_PREVIEW_FILTER|saturate\(/)
	assert.match(previewSource, /setStyleValue\(style,\s*'opacity',\s*layerReady\s*\?\s*\(provisional\s*\?\s*PENDING_PREVIEW_OPACITY\s*:\s*'1'\)\s*:\s*''\)/)
	assert.match(previewSource, /PENDING_PREVIEW_TRANSITION\s*=\s*'opacity 80ms linear'/)
	assert.doesNotMatch(previewSource.match(/PENDING_PREVIEW_TRANSITION\s*=\s*'([^']+)'/)?.[1] || '', /transform/)
	assert.match(previewSource, /api\.render\.markDirty\(RENDER_LAYER_ID,\s*game\)/)
	assert.match(plannerSource, /schemaVersion\s*!==\s*1\s*&&\s*schemaVersion\s*!==\s*2\s*&&\s*schemaVersion\s*!==\s*3/)
	assert.match(previewSource, /space:\s*'screen'/)
	assert.match(previewSource, /ctx\.setTransform\(1,\s*0,\s*0,\s*1,\s*centerX,\s*centerY\)/)
	assert.match(previewSource, /ctx\.clearRect\?\.\(0,\s*0,\s*width,\s*height\)/)
	assert.match(previewSource, /ctx\?\.save\?\.\(\)/)
	assert.match(previewSource, /ctx\?\.restore\?\.\(\)/)
	assert.doesNotMatch(previewSource, /cattail-world-editor-preview-card/)
	assert.doesNotMatch(previewSource, /function mountUi\(\)/)
	assert.match(sessionSource, /pointer-events:\s*none/)
	assert.match(sessionSource, /\[data-visible="true"\]\[data-position-visible="true"\][^{]*\{[^}]*pointer-events:\s*auto/s)
	assert.match(sessionSource, /font:\s*400 12px\/1\.35 Montserrat,\s*Arial,\s*sans-serif/)
	assert.match(sessionSource, /api\.on\('afterWords'/)
	assert.match(previewSource, /sizes\)\s*&&\s*options\.sizes\.length\s*\?\s*options\.sizes\s*:\s*\[100,\s*500,\s*2000\]/)
	assert.match(selectionSource, /PREVIEW_KEY/)
	assert.match(selectionSource, /preview\.exit\('hotkey-escape'\)/)
	assert.match(selectionSource, /function previewOwnsSelectionInput\(\)/)
	assert.match(selectionSource, /return !!globalThis\[PREVIEW_KEY\]\?\.snapshot\?\.\(\)\.active/)
	assert.ok((selectionSource.match(/previewOwnsSelectionInput\(\)/g) || []).length >= 5)
	assert.match(readme, /## 3B/)
	assert.match(readme, /缓存图层/)
	assert.match(readme, /Ctrl\+V/)
	assert.doesNotMatch(previewSource, /KeyV|ctrlKey\s*&&[^;\n]*[vV]/)
	assert.doesNotMatch(implementation, /\b(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity|requestResources|substractResources)\s*\(/)
	assert.doesNotMatch(implementation, /\b(?:localStorage|sessionStorage)\b/)
	assert.doesNotMatch(implementation, /\bitemInHand\s*=/)
}

async function run() {
	await testPlannerStatusesCostsAndGuards()
	await testOnlyOneCancellationAndBenchmark()
	await testRuntimeLifecycleInputAndRendering()
	await testFollowThrottleUiAndMetrics()
	await testPreviewPublishesStateWithoutMountingCard()
	await testTemporaryAltPinLifecycle()
	testManifestLocalizationAndStaticContracts()
	console.log('3B verification passed: four-state planning, only-one precedence, deterministic build-plan costs, detailed read-only guards and resource-only cost refresh, cancellation/retry contracts, structure/full lifecycle, pin/follow input ownership, cached dirty-only centered rendering, CSS visual following with provisional opacity, 100 ms idle/fixed final planning, no duplicate preview card, 20-language UI, manifest order, and 100/500/2000 synthetic benchmark.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
