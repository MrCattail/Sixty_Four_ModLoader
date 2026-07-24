const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function loadModules(relativePaths, extras = {}) {
	const definitions = []
	const sandbox = Object.assign({
		console: {
			info() {},
			warn() {},
			error() {}
		},
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}, extras)
	vm.createContext(sandbox)
	for (const relativePath of relativePaths) {
		const filename = path.join(MOD_ROOT, relativePath)
		vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	}
	return { definitions, sandbox }
}

function createApi() {
	const handlers = new Map()
	return {
		id: 'Cattail_TweaksQuality_World-Editor',
		handlers,
		on(name, listener) {
			if (!handlers.has(name)) handlers.set(name, [])
			handlers.get(name).push(listener)
		},
		patch(target, key, wrap) {
			target[key] = wrap(target[key])
		},
		emit(name, ...args) {
			for (const listener of handlers.get(name) || []) listener(...args)
		}
	}
}

function createRuntime(game, active = true) {
	const listeners = new Set()
	const cleanups = []
	let enabled = true
	let currentActive = active
	return {
		game,
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		subscribe(listener) {
			listeners.add(listener)
			listener({ active: currentActive, enabled })
			return () => listeners.delete(listener)
		},
		isActive() {
			return enabled && currentActive
		},
		isEnabled() {
			return enabled
		},
		deactivate(reason) {
			if (!currentActive) return false
			currentActive = false
			for (const listener of listeners) listener({ active: false, enabled, lastReason: reason })
			return true
		},
		activate(reason) {
			if (currentActive || !enabled) return false
			currentActive = true
			for (const listener of listeners) listener({ active: true, enabled, lastReason: reason })
			return true
		},
		toggle(reason) {
			return currentActive ? this.deactivate(reason) : this.activate(reason)
		},
		snapshot() {
			return { active: enabled && currentActive, enabled }
		},
		runCleanups() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

class EventHub {
	constructor() {
		this.listeners = new Map()
	}

	addEventListener(type, listener, capture = false) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push({ listener, capture })
	}

	removeEventListener(type, listener, capture = false) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry.listener !== listener || entry.capture !== capture))
	}

	dispatch(type, event = {}) {
		event.type = type
		for (const entry of (this.listeners.get(type) || []).slice()) {
			entry.listener(event)
			if (event.immediatePropagationStopped) break
		}
		return event
	}
}

function mouseEvent(values = {}) {
	return Object.assign({
		button: 0,
		buttons: 0,
		offsetX: 0,
		offsetY: 0,
		defaultPrevented: false,
		immediatePropagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true
		},
		stopImmediatePropagation() {
			this.immediatePropagationStopped = true
		}
	}, values)
}

function keyEvent(values = {}) {
	return Object.assign(mouseEvent(), {
		key: '',
		code: '',
		keyCode: 0,
		repeat: false,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		target: null,
		composedPath() {
			return []
		}
	}, values)
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function testSelectionState() {
	class Game {
		constructor() {
			this.plane = false
		}

		switchPlane() {}
	}

	const { definitions, sandbox } = loadModules(['scripts/core/selection-state.js'], { Game })
	const api = createApi()
	definitions[0].init(api)
	api.emit('afterVanillaScripts')

	const game = new Game()
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]

	assert.equal(selection.version, '0.2.6')
	assert.equal(selection.begin([4, 6], 0, 'start'), true)
	assert.deepEqual(plain(selection.snapshot().previewRange), {
		start: [4, 6],
		end: [4, 6],
		minU: 4,
		maxU: 4,
		minV: 6,
		maxV: 6,
		width: 1,
		height: 1
	})
	assert.equal(selection.updatePreview([1, 9], 0, 'reverse'), true)
	assert.deepEqual(plain(selection.snapshot().previewRange), {
		start: [4, 6],
		end: [1, 9],
		minU: 1,
		maxU: 4,
		minV: 6,
		maxV: 9,
		width: 4,
		height: 4
	})
	assert.equal(selection.updatePreview([1, 9], 0, 'same'), false)
	assert.equal(selection.commit([1, 9], 0, 'commit'), true)
	assert.equal(selection.hasPreview(), false)
	assert.equal(selection.isSelected([2, 7], 0), true)
	assert.equal(selection.isSelected([5, 7], 0), false)
	assert.equal(selection.isSelected([2, 7], 1), false)

	assert.equal(selection.begin([-3, -2], 0, 'replacement'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange.start), [4, 6])
	assert.equal(selection.cancelPreview('cancel'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange.end), [1, 9])

	assert.equal(selection.begin([8, 3], 0, 'one-cell'), true)
	assert.equal(selection.commit([8, 3], 0, 'one-cell'), true)
	assert.equal(selection.snapshot().selectedRange.width, 1)
	assert.equal(selection.snapshot().selectedRange.height, 1)

	assert.equal(selection.begin([10, 11], 0, 'plane-test'), true)
	game.plane = true
	game.switchPlane()
	assert.equal(selection.snapshot().selectedRange, null)
	assert.equal(selection.snapshot().previewRange, null)

	selection.select([2, 2], 1, 'direct-compatibility')
	runtime.deactivate('test')
	assert.equal(selection.snapshot().selectedRange, null)
	runtime.runCleanups()
	assert.equal(sandbox[SELECTION_KEY], undefined)
}

function testTwoClickInput() {
	class Game {
		switchPlane() {}
	}
	const windowHub = new EventHub()
	const canvas = new EventHub()
	const document = {
		activeElement: null,
		getElementById() {
			return null
		}
	}
	const { definitions, sandbox } = loadModules([
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/core/input-controller.js',
		'scripts/input/selection-controller.js'
	], {
		Game,
		window: windowHub,
		document
	})
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const game = new Game()
	game.canvas = canvas
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	game.hoveredCell = [0, 0]
	game.updateMouseData = function (x, y) {
		this.hoveredCell = [Math.trunc(x), Math.trunc(y)]
	}
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]

	const firstDown = canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 2, offsetY: 3 }))
	assert.equal(firstDown.defaultPrevented, true)
	assert.equal(selection.snapshot().previewRange, null)

	canvas.dispatch('mouseup', mouseEvent({ button: 0, offsetX: 2, offsetY: 3 }))
	assert.equal(selection.hasPreview(), true)
	assert.deepEqual(plain(selection.snapshot().previewRange.start), [2, 3])
	assert.equal(selection.snapshot().selectedRange, null)

	const freeMove = canvas.dispatch('mousemove', mouseEvent({ buttons: 0, offsetX: 6, offsetY: 8 }))
	assert.equal(freeMove.defaultPrevented, false)
	assert.deepEqual(plain(selection.snapshot().previewRange.end), [6, 8])

	const secondDown = canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 6, offsetY: 8 }))
	assert.equal(secondDown.defaultPrevented, true)
	assert.equal(selection.hasPreview(), true)
	canvas.dispatch('mouseup', mouseEvent({ button: 0, offsetX: 6, offsetY: 8 }))
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange.end), [6, 8])

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 9, offsetY: 10 }))
	const rightDown = canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2, offsetX: 9, offsetY: 10 }))
	assert.equal(rightDown.defaultPrevented, false)
	assert.equal(rightDown.immediatePropagationStopped, false)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange.end), [6, 8])

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 3, offsetY: 4 }))
	canvas.dispatch('mouseleave', mouseEvent())
	assert.equal(selection.hasPreview(), false)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 3, offsetY: 4 }))
	windowHub.dispatch('blur', {})
	assert.equal(selection.hasPreview(), false)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 3, offsetY: 4 }))
	const firstEscape = windowHub.dispatch('keydown', keyEvent({ key: 'Escape', keyCode: 27 }))
	assert.equal(firstEscape.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)
	assert.equal(runtime.isActive(), true)

	const secondEscape = windowHub.dispatch('keydown', keyEvent({ key: 'Escape', keyCode: 27 }))
	assert.equal(secondEscape.defaultPrevented, true)
	assert.equal(runtime.isActive(), false)
	runtime.runCleanups()
}

function createSelectionFeed(initialState) {
	let state = initialState
	const listeners = new Set()
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
		emit(nextState) {
			state = nextState
			for (const listener of listeners) listener(state)
		}
	}
}

function createRenderApi(api) {
	let registration = null
	api.render = {
		onLayer(layer, callback, options) {
			registration = { layer, callback, options }
			return () => {
				registration = null
			}
		}
	}
	return () => registration
}

function createContextRecorder() {
	const calls = []
	const ctx = {
		calls,
		save() {
			calls.push(['save'])
		},
		restore() {
			calls.push(['restore'])
		},
		setTransform(...args) {
			calls.push(['setTransform', ...args])
		},
		beginPath() {
			calls.push(['beginPath'])
		},
		moveTo(...args) {
			calls.push(['moveTo', ...args])
		},
		lineTo(...args) {
			calls.push(['lineTo', ...args])
		},
		closePath() {
			calls.push(['closePath'])
		},
		fill() {
			calls.push(['fill', this.fillStyle])
		},
		stroke() {
			calls.push(['stroke', this.strokeStyle, this.lineWidth])
		}
	}
	return ctx
}

function range(start, end) {
	const minU = Math.min(start[0], end[0])
	const maxU = Math.max(start[0], end[0])
	const minV = Math.min(start[1], end[1])
	const maxV = Math.max(start[1], end[1])
	return {
		start,
		end,
		minU,
		maxU,
		minV,
		maxV,
		width: maxU - minU + 1,
		height: maxV - minV + 1
	}
}

function testSelectionRendering() {
	const { definitions, sandbox } = loadModules(['scripts/render/selected-overlay.js'], {
		devicePixelRatio: 1
	})
	const api = createApi()
	const getRegistration = createRenderApi(api)
	definitions[0].init(api)

	const game = {
		canvas: {},
		plane: false,
		halt: false,
		splash: { isShown: false },
		unit: 32,
		solidUnit: 32,
		zoom: 1,
		pixelRatio: 1,
		w: 800,
		h: 600,
		w2: 400,
		h2: 300,
		uvToXY(uv) {
			return [uv[0] * 2 + uv[1] * 3, uv[0] * -1 + uv[1] * 4]
		}
	}
	const runtime = createRuntime(game)
	const preview = range([4, 5], [1, 2])
	const selection = createSelectionFeed({ plane: 0, previewRange: preview, selectedRange: null })
	selection.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	api.emit('afterGameInit', {}, game)
	const registration = getRegistration()
	assert.equal(registration.layer, 'interaction')
	assert.equal(registration.options.space, 'screen')
	assert.equal(registration.options.enabled({ game }), true)

	const projectedInputs = []
	const transform = game.uvToXY
	game.uvToXY = function (uv) {
		projectedInputs.push(uv.slice())
		return transform(uv)
	}
	let ctx = createContextRecorder()
	registration.callback({ game, ctx, width: 800, height: 600 })
	assert.deepEqual(plain(projectedInputs), [
		[0.5, 1.5], [4.5, 1.5], [4.5, 5.5], [0.5, 5.5],
		[3.5, 4.5], [4.5, 4.5], [4.5, 5.5], [3.5, 5.5],
		[0.5, 1.5], [1.5, 1.5], [1.5, 2.5], [0.5, 2.5]
	])
	assert.equal(ctx.calls.filter(call => call[0] === 'fill').length, 3)
	assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 6)
	assert.equal(ctx.calls.filter(call => call[0] === 'fill')[0][1], 'rgba(170, 137, 220, .11)')

	selection.emit({ plane: 0, previewRange: range([7, 7], [7, 7]), selectedRange: null })
	projectedInputs.length = 0
	ctx = createContextRecorder()
	registration.callback({ game, ctx, width: 800, height: 600 })
	assert.equal(projectedInputs.length, 8)
	assert.equal(ctx.calls.filter(call => call[0] === 'fill').length, 2)

	selection.emit({ plane: 0, previewRange: null, selectedRange: preview })
	projectedInputs.length = 0
	ctx = createContextRecorder()
	registration.callback({ game, ctx, width: 800, height: 600 })
	assert.equal(projectedInputs.length, 12)
	assert.equal(ctx.calls.filter(call => call[0] === 'fill').length, 3)
	assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 6)
	assert.equal(ctx.calls.filter(call => call[0] === 'fill')[0][1], 'rgba(170, 137, 220, .16)')
	assert.match(ctx.calls.filter(call => call[0] === 'fill')[1][1], /67, 180, 255/)
	assert.match(ctx.calls.filter(call => call[0] === 'fill')[2][1], /255, 152, 61/)

	game.plane = true
	selection.emit({ plane: 1, previewRange: null, selectedRange: preview })
	ctx = createContextRecorder()
	registration.callback({ game, ctx, width: 800, height: 600 })
	assert.equal(ctx.calls.filter(call => call[0] === 'fill')[0][1], 'rgba(198, 175, 241, .18)')
	game.plane = false

	selection.emit({ plane: 0, previewRange: null, selectedRange: range([7, 7], [7, 7]) })
	projectedInputs.length = 0
	ctx = createContextRecorder()
	registration.callback({ game, ctx, width: 800, height: 600 })
	assert.equal(projectedInputs.length, 12)
	assert.deepEqual(plain(projectedInputs.slice(8)).map(point => point.map(value => Number(value.toFixed(2)))), [
		[6.66, 6.66],
		[7.34, 6.66],
		[7.34, 7.34],
		[6.66, 7.34]
	])
	assert.equal(ctx.calls.filter(call => call[0] === 'fill')[2][1], 'rgba(255, 168, 78, .08)')

	selection.emit({ plane: 0, previewRange: null, selectedRange: preview })

	const matrices = [
		uv => [uv[0], uv[1]],
		uv => [uv[0] - uv[1], uv[0] + uv[1]],
		uv => [uv[0] * .4 + uv[1] * 2, uv[0] * 3 - uv[1] * .2],
		uv => [-uv[0] * 1.5 + uv[1] * .6, uv[0] * .7 + uv[1] * 1.8]
	]
	for (const matrix of matrices) {
		game.uvToXY = matrix
		ctx = createContextRecorder()
		registration.callback({ game, ctx, width: 800, height: 600 })
		const move = ctx.calls.find(call => call[0] === 'moveTo')
		const expected = matrix([.5, 1.5])
		assert.deepEqual(move.slice(1), [400 + expected[0], 300 + expected[1]])
	}
	runtime.runCleanups()
}

function testHoverPreviewAndRightPanLock() {
	const canvas = new EventHub()
	const windowHub = new EventHub()
	const { definitions, sandbox } = loadModules(['scripts/render/hover-overlay.js'], {
		window: windowHub,
		devicePixelRatio: 1
	})
	const api = createApi()
	const getRegistration = createRenderApi(api)
	definitions[0].init(api)

	const projectedInputs = []
	const game = {
		canvas,
		plane: false,
		halt: false,
		splash: { isShown: false },
		mouse: { cursorVisible: true },
		hoveredCell: [1, 1],
		unit: 32,
		solidUnit: 32,
		zoom: 1,
		pixelRatio: 1,
		w2: 400,
		h2: 300,
		uvToXY(uv) {
			projectedInputs.push(uv.slice())
			return uv
		}
	}
	const runtime = createRuntime(game)
	const selection = createSelectionFeed({ plane: 0, previewRange: null, selectedRange: null })
	selection.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	api.emit('afterGameInit', {}, game)
	const registration = getRegistration()

	assert.equal(registration.options.enabled({ game }), true)
	selection.emit({ plane: 0, previewRange: range([1, 1], [2, 2]), selectedRange: null })
	assert.equal(registration.options.enabled({ game }), false)
	selection.emit({ plane: 0, previewRange: null, selectedRange: null })

	canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2 }))
	game.hoveredCell = [9, 9]
	canvas.dispatch('mousemove', mouseEvent({ buttons: 2 }))
	projectedInputs.length = 0
	registration.callback({ game, ctx: createContextRecorder(), width: 800, height: 600 })
	assert.deepEqual(plain(projectedInputs[0]), [.5, .5])

	canvas.dispatch('mouseup', mouseEvent({ button: 2, buttons: 0 }))
	projectedInputs.length = 0
	registration.callback({ game, ctx: createContextRecorder(), width: 800, height: 600 })
	assert.deepEqual(plain(projectedInputs[0]), [8.5, 8.5])
	runtime.runCleanups()
}

class MiniElement {
	constructor(tagName, ownerDocument) {
		this.tagName = String(tagName).toUpperCase()
		this.ownerDocument = ownerDocument
		this.children = []
		this.parentNode = null
		this.dataset = {}
		this.attributes = {}
		this.className = ''
		this.id = ''
		this.textContent = ''
		this.listeners = new Map()
		this.disabled = false
	}

	append(...nodes) {
		for (const node of nodes) {
			node.parentNode = this
			this.children.push(node)
		}
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

	querySelector(selector) {
		const textMatch = selector.match(/^\[data-world-editor-text="([^"]+)"\]$/)
		if (textMatch) return this.find(node => node.dataset.worldEditorText === textMatch[1])
		const actionMatch = selector.match(/^\[data-world-editor-action="([^"]+)"\]$/)
		if (actionMatch) return this.find(node => node.dataset.worldEditorAction === actionMatch[1])
		return null
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, event = {}) {
		for (const listener of (this.listeners.get(type) || []).slice()) listener(event)
	}

	find(predicate) {
		for (const child of this.children) {
			if (predicate(child)) return child
			const nested = child.find(predicate)
			if (nested) return nested
		}
		return null
	}

	get isConnected() {
		let node = this
		while (node) {
			if (node === this.ownerDocument.body || node === this.ownerDocument.head) return true
			node = node.parentNode
		}
		return false
	}
}

function createMiniDocument() {
	const document = {}
	document.createElement = tagName => new MiniElement(tagName, document)
	document.body = document.createElement('body')
	document.head = document.createElement('head')
	document.getElementById = id => {
		if (document.body.id === id) return document.body
		if (document.head.id === id) return document.head
		return document.body.find(node => node.id === id) || document.head.find(node => node.id === id)
	}
	return document
}

function testI18nAndUi() {
	class Game {
		switchPlane() {}
	}
	const document = createMiniDocument()
	const windowHub = new EventHub()
	const { definitions, sandbox } = loadModules([
		'scripts/core/tool-state.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/editor-shell.js'
	], {
		Game,
		document,
		window: windowHub
	})
	const api = createApi()
	let releasedHud = false
	api.ui = {
		hud: {
			isHidden() {
				return false
			},
			register() {
				return () => {
					releasedHud = true
				}
			}
		},
		isVanillaGameHudHidden() {
			return false
		}
	}
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const i18n = sandbox[I18N_KEY]
	const languages = ['en', 'sch', 'modsch', 'ru', 'de', 'ptbr', 'it', 'es', 'fr', 'nl', 'cz', 'pl', 'jp', 'kr', 'tch', 'thai', 'hu', 'lv', 'ro', 'no']
	assert.equal(i18n.version, '0.2.6')
	assert.equal(i18n.languages.length, 20)
	assert.deepEqual(new Set(i18n.languages), new Set(languages))
	for (const key of ['brand', 'modeArea', 'exitHint', 'cancelHint', 'toolbarModeArea', 'toolbarModeMove', 'toolSelect', 'toolMove', 'cardMovePreview', 'moveHint', 'selectionCount']) {
		assert.ok(i18n.keys.includes(key), key)
	}
	for (const language of languages) {
		for (const key of i18n.keys) assert.ok(i18n.t(language, key).trim(), language + '.' + key)
	}

	const game = new Game()
	game.language = 'sch'
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	const runtime = createRuntime(game)
	const selection = createSelectionFeed({ plane: null, previewRange: null, selectedRange: null })
	selection.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	api.emit('afterGameInit', {}, game)

	const shell = document.getElementById('cattail-world-editor-shell')
	assert.ok(shell)
	assert.equal(sandbox[TOOL_KEY].snapshot().mode, 'select')
	assert.equal(shell.dataset.visible, 'true')
	assert.equal(shell.dataset.theme, 'reality')
	assert.equal(shell.querySelector('[data-world-editor-text="mode"]').textContent, '选择模式')
	assert.equal(shell.querySelector('[data-world-editor-text="hint"]').textContent, 'V / Esc 退出')
	assert.equal(shell.querySelector('[data-world-editor-text="selection-count"]').textContent, '选区：0')

	const preview = range([-2, 5], [3, 1])
	selection.emit({ plane: 0, previewRange: preview, selectedRange: null })
	assert.equal(shell.querySelector('[data-world-editor-text="selection-count"]').textContent, '选区：1')
	assert.equal(shell.querySelector('[data-world-editor-text="hint"]').textContent, 'V / Esc 退出')

	game.language = 'en'
	api.emit('afterWords', {}, game)
	assert.equal(shell.querySelector('[data-world-editor-text="mode"]').textContent, 'Selection Mode')
	assert.equal(shell.querySelector('[data-world-editor-text="selection-count"]').textContent, 'Selections: 1')
	assert.equal(shell.querySelector('[data-world-editor-text="hint"]').textContent, 'V / Esc Exit')

	selection.emit({ plane: 0, previewRange: null, selectedRange: preview })
	assert.equal(shell.querySelector('[data-world-editor-text="hint"]').textContent, 'V / Esc Exit')
	assert.equal(shell.querySelector('[data-world-editor-text="selection-count"]').textContent, 'Selections: 1')

	game.plane = true
	game.switchPlane()
	assert.equal(shell.dataset.theme, 'void')
	runtime.runCleanups()
	assert.equal(document.getElementById('cattail-world-editor-shell'), null)
	assert.equal(releasedHud, true)
}

testSelectionState()
testTwoClickInput()
testSelectionRendering()
testHoverPreviewAndRightPanLock()
testI18nAndUi()
console.log('2A regression verification passed: state, input, rendering, hover lock, i18n, and toolbar.')
