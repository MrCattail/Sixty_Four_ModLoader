const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')

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

function createRuntime(game) {
	const listeners = new Set()
	const cleanups = []
	let active = true
	return {
		game,
		snapshot() {
			return { active }
		},
		isActive() {
			return active
		},
		isEnabled() {
			return true
		},
		toggle() {
			active = !active
			for (const listener of listeners) listener({ active })
		},
		deactivate(reason) {
			if (!active) return false
			active = false
			for (const listener of listeners) listener({ active, lastReason: reason })
			return true
		},
		subscribe(listener) {
			listeners.add(listener)
			listener({ active })
			return () => listeners.delete(listener)
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
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

function event(values = {}) {
	return Object.assign({
		button: 0,
		buttons: 0,
		offsetX: 0,
		offsetY: 0,
		key: '',
		keyCode: 0,
		defaultPrevented: false,
		immediatePropagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true
		},
		stopPropagation() {},
		stopImmediatePropagation() {
			this.immediatePropagationStopped = true
		},
		composedPath() {
			return []
		}
	}, values)
}

function createTimers() {
	let now = 0
	let nextId = 1
	const tasks = new Map()
	return {
		setTimeout(callback, delay) {
			const id = nextId++
			tasks.set(id, { callback, at: now + Math.max(0, Number(delay) || 0) })
			return id
		},
		clearTimeout(id) {
			tasks.delete(id)
		},
		advance(milliseconds) {
			now += milliseconds
			let progressed = true
			while (progressed) {
				progressed = false
				for (const [id, task] of Array.from(tasks)) {
					if (task.at > now) continue
					tasks.delete(id)
					task.callback()
					progressed = true
				}
			}
		},
		get size() {
			return tasks.size
		}
	}
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
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

function selectRange(selection, start, end, plane = 0) {
	selection.begin(start, plane, 'test-start')
	selection.commit(end, plane, 'test-commit')
}

function testUnifiedInputGestures() {
	class Game {
		switchPlane() {}
	}

	const timers = createTimers()
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
		document,
		setTimeout: timers.setTimeout,
		clearTimeout: timers.clearTimeout
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
	sandbox[RESIZE_HANDLES_KEY] = {
		hitTest(pointerEvent) {
			return pointerEvent?.onHandle ? 'minU-minV' : null
		}
	}
	api.emit('afterGameInit', {}, game)

	const selection = sandbox[SELECTION_KEY]
	const tool = sandbox[TOOL_KEY]
	const interaction = sandbox[INTERACTION_KEY]
	assert.equal(selection.version, '0.2.6')
	assert.equal(tool.version, '0.2.6')
	assert.deepEqual(plain(tool.modes), ['select'])
	assert.equal(interaction.version, '0.2.6')
	assert.equal(interaction.longPressMs, 220)
	assert.equal(interaction.moveSlopPx, 6)

	selectRange(selection, [1, 1], [4, 4])
	const original = plain(selection.snapshot().selectedRange)

	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 2, offsetY: 2 }))
	assert.equal(interaction.snapshot().gestureType, 'pending-move')
	assert.equal(selection.hasPreview(), false)
	timers.advance(219)
	assert.equal(selection.isMoving(), false)
	canvas.dispatch('mouseup', event({ button: 0, offsetX: 3, offsetY: 3 }))
	assert.equal(selection.snapshot().previewKind, 'selection')
	assert.deepEqual(plain(selection.snapshot().previewRange.start), [2, 2])
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)
	canvas.dispatch('mousedown', event({ button: 2, buttons: 2, offsetX: 3, offsetY: 3 }))
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 2, offsetY: 2 }))
	timers.advance(220)
	assert.equal(selection.isMoving(), true)
	assert.equal(interaction.snapshot().gestureType, 'move')
	canvas.dispatch('mousemove', event({ buttons: 1, offsetX: 4, offsetY: 3 }))
	assert.deepEqual(plain(selection.snapshot().previewRange), range([3, 2], [6, 5]))
	canvas.dispatch('mouseup', event({ button: 0, offsetX: 4, offsetY: 3 }))
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([3, 2], [6, 5]))

	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 4, offsetY: 3 }))
	canvas.dispatch('mousemove', event({ buttons: 1, offsetX: 10, offsetY: 3 }))
	assert.equal(selection.isMoving(), true)
	assert.equal(interaction.snapshot().gestureType, 'move')
	const right = canvas.dispatch('mousedown', event({ button: 2, buttons: 2, offsetX: 10, offsetY: 3 }))
	assert.equal(right.defaultPrevented, false)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([3, 2], [6, 5]))

	selectRange(selection, [1, 1], [3, 3])
	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 1, offsetY: 1, onHandle: true }))
	assert.equal(selection.isResizing(), true)
	assert.equal(interaction.snapshot().gestureType, 'resize')
	timers.advance(500)
	assert.equal(selection.isResizing(), true)
	canvas.dispatch('mousemove', event({ buttons: 1, offsetX: 0, offsetY: 0 }))
	canvas.dispatch('mouseup', event({ button: 0, offsetX: 0, offsetY: 0 }))
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([0, 0], [3, 3]))

	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 20, offsetY: 20 }))
	assert.equal(selection.hasPreview(), false)
	canvas.dispatch('mouseup', event({ button: 0, offsetX: 20, offsetY: 20 }))
	assert.equal(selection.snapshot().previewKind, 'selection')
	canvas.dispatch('mousemove', event({ buttons: 0, offsetX: 22, offsetY: 23 }))
	assert.deepEqual(plain(selection.snapshot().previewRange.end), [22, 23])
	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 22, offsetY: 23, onHandle: true }))
	assert.equal(selection.isResizing(), false)
	canvas.dispatch('mouseup', event({ button: 0, offsetX: 22, offsetY: 23 }))
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([20, 20], [22, 23]))

	canvas.dispatch('mousedown', event({ button: 0, buttons: 1, offsetX: 21, offsetY: 21 }))
	const escape = windowHub.dispatch('keydown', event({ key: 'Escape', keyCode: 27 }))
	assert.equal(escape.defaultPrevented, true)
	assert.equal(interaction.snapshot().gestureType, null)
	assert.equal(runtime.isActive(), true)
	timers.advance(500)
	assert.equal(selection.isMoving(), false)

	runtime.runCleanups()
	assert.equal(sandbox[INTERACTION_KEY], undefined)
}

class MiniElement {
	constructor(tagName, ownerDocument) {
		this.tagName = String(tagName).toUpperCase()
		this.ownerDocument = ownerDocument
		this.children = []
		this.parentNode = null
		this.dataset = {}
		this.attributes = {}
		this.listeners = new Map()
		this.className = ''
		this.id = ''
		this.textContent = ''
		this.style = {}
		this.offsetWidth = 288
		this.offsetHeight = 178
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

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, input = {}) {
		for (const listener of (this.listeners.get(type) || []).slice()) listener(input)
		return input
	}

	querySelector(selector) {
		const textMatch = selector.match(/^\[data-world-editor-text="([^"]+)"\]$/)
		if (textMatch) return this.find(node => node.dataset.worldEditorText === textMatch[1])
		if (selector === '[data-world-editor-progress-fill]') {
			return this.find(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorProgressFill'))
		}
		return null
	}

	find(predicate) {
		for (const child of this.children) {
			if (predicate(child)) return child
			const nested = child.find(predicate)
			if (nested) return nested
		}
		return null
	}

	getBoundingClientRect() {
		return { width: this.offsetWidth, height: this.offsetHeight }
	}
}

function createMiniDocument() {
	const document = {
		documentElement: {
			clientWidth: 1000,
			clientHeight: 700
		},
		createElement(tagName) {
			return new MiniElement(tagName, document)
		},
		getElementById(id) {
			return document.body.find(node => node.id === id) || document.head.find(node => node.id === id)
		},
		querySelectorAll(selector) {
			const idMatch = String(selector).match(/^#(.+)$/)
			if (!idMatch) return []
			const matches = []
			const visit = function (node) {
				for (const child of node.children) {
					if (child.id === idMatch[1]) matches.push(child)
					visit(child)
				}
			}
			visit(document.body)
			visit(document.head)
			return matches
		}
	}
	document.body = new MiniElement('body', document)
	document.head = new MiniElement('head', document)
	return document
}

function createFeed(initialState) {
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

function testCardLockAndTemporaryWindow() {
	class Game {
		switchPlane() {}
	}

	const timers = createTimers()
	const document = createMiniDocument()
	const windowHub = new EventHub()
	windowHub.innerWidth = 1000
	windowHub.innerHeight = 700
	windowHub.setInterval = function () {
		return 1
	}
	windowHub.clearInterval = function () {}
	const { definitions, sandbox } = loadModules([
		'scripts/i18n/editor-text.js',
		'scripts/ui/selection-card.js'
	], {
		Game,
		document,
		window: windowHub,
		setTimeout: timers.setTimeout,
		clearTimeout: timers.clearTimeout
	})
	const api = createApi()
	let frameCallback = null
	api.ui = {
		hud: {
			isHidden() {
				return false
			},
			register() {
				return () => {}
			}
		},
		isVanillaGameHudHidden() {
			return false
		}
	}
	api.render = {
		isEnabled() {
			return true
		},
		onFrame(callback) {
			frameCallback = callback
			return () => {
				frameCallback = null
			}
		}
	}
	for (const definition of definitions) definition.init(api)

	const game = new Game()
	game.language = 'sch'
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	game.w2 = 400
	game.h2 = 250
	game.uvToXY = uv => [uv[0] * 12, uv[1] * 12]
	const runtime = createRuntime(game)
	const selected = range([1, 1], [3, 2])
	const selection = createFeed({
		plane: 0,
		selectedRange: selected,
		previewRange: null,
		previewKind: null
	})
	selection.game = game
	const analysis = createFeed({
		key: '0:1:3:1:2',
		status: 'ready',
		progress: 1,
		occupied: 2,
		empty: 4,
		buildings: 1,
		cubes: 1
	})
	analysis.game = game
	let wheelLatched = false
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[ANALYSIS_KEY] = analysis
	sandbox[INTERACTION_KEY] = {
		snapshot() {
			return { wheelLatched }
		}
	}
	const staleCards = [document.createElement('div'), document.createElement('div')]
	for (const staleCard of staleCards) {
		staleCard.id = 'cattail-world-editor-selection-card'
		document.body.append(staleCard)
	}
	api.emit('afterGameInit', {}, game)

	const card = document.getElementById('cattail-world-editor-selection-card')
	const style = document.getElementById('cattail-world-editor-selection-card-style')
	assert.ok(card)
	assert.ok(style)
	assert.equal(document.querySelectorAll('#cattail-world-editor-selection-card').length, 1)
	assert.equal(staleCards.every(staleCard => staleCard.parentNode === null), true)
	assert.equal(card.getAttribute('role'), 'button')
	assert.equal(card.getAttribute('tabindex'), '0')
	assert.equal(card.dataset.pinned, 'false')
	assert.equal(card.getAttribute('aria-pressed'), 'false')
	assert.equal(card.dataset.visible, 'true')
	assert.match(card.getAttribute('aria-label'), /点击以长期显示/)
	assert.match(style.textContent, /data-pinned="true"/)
	assert.match(style.textContent, /world-editor-card-pin-glow/)
	assert.match(style.textContent, /pointer-events: auto/)
	assert.match(style.textContent, /data-input-pass-through="true"/)
	assert.match(style.textContent, /rgba\(227,\s*253,\s*67,\s*\.98\)/)
	assert.match(style.textContent, /rgba\(166,\s*242,\s*70,\s*\.96\)/)
	assert.match(style.textContent, /rgba\(76,\s*185,\s*107,\s*\.98\)/)
	assert.match(style.textContent, /overflow-y:\s*auto/)
	assert.match(style.textContent, /linear-gradient\(var\(--world-editor-card-bg\),\s*var\(--world-editor-card-bg\)\)\s*padding-box/)
	assert.match(style.textContent, /linear-gradient\(135deg,[^;]+border-box/)
	assert.doesNotMatch(style.textContent, /\.cattail-world-editor-selection-card::before/)
	assert.doesNotMatch(style.textContent, /inset:\s*-1px/)
	assert.equal(card.dataset.wheelLatched, 'false')
	assert.equal(card.dataset.inputPassThrough, 'false')

	wheelLatched = true
	frameCallback({ game })
	assert.equal(card.dataset.wheelLatched, 'true')
	assert.equal(card.dataset.inputPassThrough, 'true')
	wheelLatched = false
	frameCallback({ game })
	assert.equal(card.dataset.wheelLatched, 'false')
	assert.equal(card.dataset.inputPassThrough, 'false')

	selection.emit({
		plane: 0,
		selectedRange: selected,
		previewRange: range([4, 4], [5, 5]),
		previewKind: 'selection'
	})
	assert.equal(card.dataset.inputPassThrough, 'true')
	selection.emit({
		plane: 0,
		selectedRange: selected,
		previewRange: selected,
		previewKind: 'move'
	})
	assert.equal(card.dataset.inputPassThrough, 'true')
	selection.emit({
		plane: 0,
		selectedRange: selected,
		previewRange: selected,
		previewKind: 'resize'
	})
	assert.equal(card.dataset.inputPassThrough, 'true')
	selection.emit({
		plane: 0,
		selectedRange: selected,
		previewRange: null,
		previewKind: null
	})
	assert.equal(card.dataset.inputPassThrough, 'false')

	timers.advance(2999)
	assert.equal(card.dataset.visible, 'true')
	card.dispatch('mouseenter', {})
	timers.advance(5000)
	assert.equal(card.dataset.visible, 'true')
	card.dispatch('mouseleave', {})
	timers.advance(3000)
	assert.equal(card.dataset.visible, 'false')

	selection.emit({
		plane: 0,
		selectedRange: selected,
		previewRange: null,
		previewKind: null
	})
	assert.equal(card.dataset.visible, 'true')
	card.dispatch('click', event())
	assert.equal(card.dataset.pinned, 'true')
	assert.equal(card.getAttribute('aria-pressed'), 'true')
	assert.match(card.getAttribute('aria-label'), /点击以临时显示/)
	timers.advance(10000)
	assert.equal(card.dataset.visible, 'true')

	game.plane = true
	frameCallback({ game })
	assert.equal(card.dataset.theme, 'void')
	card.dispatch('click', event())
	assert.equal(card.dataset.pinned, 'false')
	timers.advance(3000)
	assert.equal(card.dataset.visible, 'false')

	runtime.runCleanups()
	assert.equal(document.getElementById('cattail-world-editor-selection-card'), null)
}

function testHoverLayerI18nManifestAndReadOnlyBoundary() {
	const source = fs.readFileSync(path.join(MOD_ROOT, 'scripts/render/hover-overlay.js'), 'utf8')
	assert.match(source, /order:\s*40/)
	assert.doesNotMatch(source, /mode === 'move'|mode === 'resize'/)

	const { definitions, sandbox } = loadModules(['scripts/i18n/editor-text.js'])
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.3.4')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 82)
	for (const language of i18n.languages) {
		for (const key of ['toolbarModeArea', 'toolSelect', 'cardPinAction', 'cardUnpinAction']) {
			assert.notEqual(i18n.t(language, key), key)
			assert.ok(i18n.t(language, key).trim())
		}
	}
	assert.equal(i18n.t('sch', 'toolbarModeArea'), '选择模式')
	assert.equal(i18n.t('modsch', 'toolSelect'), '选择')

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.3.4')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 18)
	assert.equal(manifest.entry.filter(entry => /selection-controller/.test(entry)).length, 1)
	assert.equal(manifest.entry.filter(entry => /resize-handles/.test(entry)).length, 1)

	const scriptText = manifest.entry
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	assert.doesNotMatch(scriptText, /\baddEntity\s*\(/)
	assert.doesNotMatch(scriptText, /\bclearCell\s*\(/)
	assert.doesNotMatch(scriptText, /\blocalStorage\b|\bsessionStorage\b/)
	assert.doesNotMatch(scriptText, /\brequire\s*\(\s*['"](?:fs|node:fs)['"]\s*\)/)
}

testUnifiedInputGestures()
testCardLockAndTemporaryWindow()
testHoverLayerI18nManifestAndReadOnlyBoundary()

console.log('2E verification passed: unified click/long-press/drag/handle priority, operation locking, interior hover layer, card temporary/pinned/immediate selection-move-resize pass-through states, switch-green styling, 20-language UI, manifest, and read-only boundary.')
