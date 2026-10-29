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

function createSettingsUi(document) {
	return {
		version: 1,
		createControl(definition, options = {}) {
			const element = document.createElement('input')
			element.type = definition.type === 'slider' ? 'range' : 'number'
			element.value = String(options.value ?? definition.default ?? 0)
			const handle = {
				element,
				input: element,
				getValue() { return Number(element.value) },
				setValue(value) { element.value = String(value); return Number(element.value) },
				validate() {
					const value = Number(element.value)
					return Number.isFinite(value) ? { valid: true, value, error: null } : { valid: false, value: undefined, error: new Error('Invalid number') }
				},
				setDisabled(value) { element.disabled = !!value; return handle },
				destroy() { element.remove?.() }
			}
			return handle
		},
		scroll: { attach() { return function () {} } }
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
		subscribe(listener) {
			listeners.add(listener)
			listener({ active })
			return () => listeners.delete(listener)
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		deactivate(reason) {
			if (!active) return false
			active = false
			for (const listener of listeners) listener({ active, lastReason: reason })
			return true
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
		stopPropagation() {},
		stopImmediatePropagation() {
			this.immediatePropagationStopped = true
		}
	}, values)
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

function testMoveStateAndToolLifecycle() {
	class Game {
		constructor() {
			this.plane = false
		}

		switchPlane() {}
	}

	const { definitions, sandbox } = loadModules([
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js'
	], { Game })
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const game = new Game()
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]
	const tool = sandbox[TOOL_KEY]

	assert.equal(selection.version, '0.2.6')
	assert.equal(tool.version, '0.6.0')
	assert.deepEqual(plain(tool.modes), ['select', 'draw'])
	assert.equal(tool.snapshot().mode, 'select')

	selection.begin([4, 6], 0, 'start')
	selection.commit([1, 9], 0, 'commit')
	const original = plain(selection.snapshot().selectedRange)
	assert.equal(selection.beginMove([8, 8], 0, 'outside'), false)
	assert.equal(selection.beginMove([2, 7], 0, 'move-start'), true)
	assert.equal(selection.isMoving(), true)
	assert.equal(selection.snapshot().previewKind, 'move')
	assert.deepEqual(plain(selection.snapshot().previewRange), original)

	assert.equal(selection.updateMove([5, 3], 0, 'move-preview'), true)
	assert.deepEqual(plain(selection.snapshot().previewRange), {
		start: [7, 2],
		end: [4, 5],
		minU: 4,
		maxU: 7,
		minV: 2,
		maxV: 5,
		width: 4,
		height: 4
	})
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)
	assert.equal(selection.cancelPreview('move-cancel'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	assert.equal(selection.beginMove([2, 7], 0, 'move-start'), true)
	assert.equal(selection.commitMove([0, 10], 0, 'move-commit'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange), {
		start: [2, 9],
		end: [-1, 12],
		minU: -1,
		maxU: 2,
		minV: 9,
		maxV: 12,
		width: 4,
		height: 4
	})
	assert.equal(selection.snapshot().previewRange, null)
	assert.equal(selection.snapshot().previewKind, null)

	assert.equal(tool.setMode('move', 'test'), false)
	assert.equal(tool.snapshot().mode, 'select')
	selection.clear('test-clear')
	assert.equal(tool.snapshot().mode, 'select')
	assert.equal(tool.setMode('resize', '2d-supported'), false)
	assert.equal(tool.snapshot().mode, 'select')

	runtime.runCleanups()
	assert.equal(sandbox[SELECTION_KEY], undefined)
	assert.equal(sandbox[TOOL_KEY], undefined)
}

function testMoveInputAndCancellation() {
	class Game {
		switchPlane() {}
	}

	const windowHub = new EventHub()
	const canvas = new EventHub()
	const { definitions, sandbox } = loadModules([
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/input/selection-controller.js'
	], {
		Game,
		window: windowHub
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
	const tool = sandbox[TOOL_KEY]

	selection.begin([1, 1], 0, 'start')
	selection.commit([3, 2], 0, 'commit')
	const down = canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 2, offsetY: 1 }))
	assert.equal(down.defaultPrevented, true)
	assert.equal(selection.isMoving(), false)

	const drag = canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: 9, offsetY: 8 }))
	assert.equal(drag.defaultPrevented, true)
	assert.equal(selection.isMoving(), true)
	assert.deepEqual(plain(selection.snapshot().previewRange), range([8, 8], [10, 9]))

	const up = canvas.dispatch('mouseup', mouseEvent({ button: 0, buttons: 0, offsetX: 9, offsetY: 8 }))
	assert.equal(up.defaultPrevented, true)
	assert.equal(selection.isMoving(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([8, 8], [10, 9]))

	const outside = canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 20, offsetY: 20 }))
	assert.equal(outside.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)
	canvas.dispatch('mouseup', mouseEvent({ button: 0, buttons: 0, offsetX: 20, offsetY: 20 }))
	assert.equal(selection.snapshot().previewKind, 'selection')
	canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2, offsetX: 20, offsetY: 20 }))
	assert.equal(selection.hasPreview(), false)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 9, offsetY: 8 }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: 16, offsetY: 15 }))
	const right = canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2, offsetX: 16, offsetY: 15 }))
	assert.equal(right.defaultPrevented, false)
	assert.equal(right.immediatePropagationStopped, false)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([8, 8], [10, 9]))

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 9, offsetY: 8 }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: 16, offsetY: 15 }))
	canvas.dispatch('mouseleave', mouseEvent())
	assert.equal(selection.hasPreview(), false)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: 9, offsetY: 8 }))
	windowHub.dispatch('blur', {})
	assert.equal(selection.hasPreview(), false)

	runtime.runCleanups()
}

function createFrameQueue() {
	let nextId = 1
	const callbacks = new Map()
	return {
		request(callback) {
			const id = nextId++
			callbacks.set(id, callback)
			return id
		},
		cancel(id) {
			callbacks.delete(id)
		},
		flushAll(limit = 100) {
			let count = 0
			while (callbacks.size) {
				const entry = callbacks.entries().next().value
				callbacks.delete(entry[0])
				entry[1](0)
				count += 1
				if (count > limit) throw new Error('Frame queue did not settle.')
			}
		}
	}
}

function testMoveAnalysisReuseAndRestore() {
	class Game {
		constructor() {
			this.plane = false
		}

		switchPlane() {}
	}

	const frames = createFrameQueue()
	const { definitions, sandbox } = loadModules([
		'scripts/core/selection-state.js',
		'scripts/core/selection-analysis.js'
	], {
		Game,
		requestAnimationFrame: callback => frames.request(callback),
		cancelAnimationFrame: id => frames.cancel(id),
		setTimeout,
		clearTimeout
	})
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const building = { name: 'pump' }
	const cube = { name: 'cube' }
	const entities = new Map([
		['0:0', building],
		['5:5', cube]
	])
	let lookupCount = 0
	const game = new Game()
	game.entityAtCoordinates = function (cell) {
		lookupCount += 1
		return entities.get(cell[0] + ':' + cell[1]) || null
	}
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]
	const analysis = sandbox[ANALYSIS_KEY]

	selection.select([0, 0], 0, 'old-selection')
	frames.flushAll()
	assert.equal(analysis.snapshot().buildings, 1)
	assert.equal(analysis.snapshot().cubes, 0)

	selection.beginMove([0, 0], 0, 'move-start')
	selection.updateMove([5, 5], 0, 'move-preview')
	frames.flushAll()
	assert.equal(analysis.snapshot().phase, 'preview')
	assert.equal(analysis.snapshot().buildings, 0)
	assert.equal(analysis.snapshot().cubes, 1)
	const beforeCommit = lookupCount
	selection.commitMove([5, 5], 0, 'move-commit')
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.equal(analysis.snapshot().cubes, 1)
	assert.equal(lookupCount, beforeCommit)

	selection.beginMove([5, 5], 0, 'move-start')
	selection.updateMove([9, 9], 0, 'move-preview')
	frames.flushAll()
	assert.equal(analysis.snapshot().occupied, 0)
	const beforeCancel = lookupCount
	selection.cancelPreview('move-cancel')
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.equal(analysis.snapshot().cubes, 1)
	assert.equal(lookupCount, beforeCancel)

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

	querySelector(selector) {
		const textMatch = selector.match(/^\[data-world-editor-text="([^"]+)"\]$/)
		if (textMatch) return this.find(node => node.dataset.worldEditorText === textMatch[1])
		const actionMatch = selector.match(/^\[data-world-editor-action="([^"]+)"\]$/)
		if (actionMatch) return this.find(node => node.dataset.worldEditorAction === actionMatch[1])
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
	document.getElementById = id => (
		document.body.find(node => node.id === id) ||
		document.head.find(node => node.id === id)
	)
	return document
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
		},
		hasPreview() {
			return !!state.previewRange
		},
		cancelPreview() {
			if (!state.previewRange) return false
			state = Object.assign({}, state, {
				previewRange: null,
				previewKind: null
			})
			for (const listener of listeners) listener(state)
			return true
		}
	}
}

function testUnifiedToolbarAndLocalization() {
	class Game {
		switchPlane() {}
	}

	const document = createMiniDocument()
	const windowHub = new EventHub()
	const { definitions, sandbox } = loadModules([
		'scripts/core/tool-state.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/dialog.js',
		'scripts/ui/editor-shell.js'
	], {
		Game,
		document,
		window: windowHub
	})
	const api = createApi()
	api.ui = {
		settings: createSettingsUi(document),
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
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const game = new Game()
	game.language = 'sch'
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	const runtime = createRuntime(game)
	const selection = createSelectionFeed({
		plane: null,
		selectedRange: null,
		previewRange: null,
		previewKind: null
	})
	selection.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	api.emit('afterGameInit', {}, game)

	const i18n = sandbox[I18N_KEY]
	const tool = sandbox[TOOL_KEY]
	const shell = document.getElementById('cattail-world-editor-shell')
	const selectButton = shell.querySelector('[data-world-editor-action="select"]')
	const moveButton = shell.querySelector('[data-world-editor-action="move"]')
	const resizeButton = shell.querySelector('[data-world-editor-action="resize"]')
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 268)
	assert.equal(shell.getAttribute('role'), 'toolbar')
	assert.equal(selectButton, null)
	assert.equal(moveButton, null)
	assert.equal(resizeButton, null)
	assert.equal(tool.snapshot().mode, 'select')
	assert.equal(shell.dataset.mode, 'select')
	assert.equal(shell.querySelector('[data-world-editor-text="mode"]').textContent, '选择模式')

	const selected = range([1, 1], [3, 2])
	selection.emit({ plane: 0, selectedRange: selected, previewRange: null, previewKind: null })
	assert.equal(tool.snapshot().mode, 'select')

	game.language = 'en'
	api.emit('afterWords', {}, game)
	assert.equal(shell.querySelector('[data-world-editor-text="mode"]').textContent, 'Selection Mode')

	runtime.runCleanups()
	assert.equal(document.getElementById('cattail-world-editor-shell'), null)
}

function testManifestAndReadOnlyBoundary() {
	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.deepEqual(manifest.entry, [
		'scripts/core/foundation.js',
		'scripts/core/shared.js',
		'scripts/core/editor-state.js',
		'scripts/core/save-adapter.js',
		'scripts/core/creative-mode.js',
		'scripts/core/creative-economy.js',
		'scripts/core/editor-transactions.js',
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/core/paint-cube-state.js',
		'scripts/core/blueprint-painted.js',
		'scripts/core/paint-cube-growth.js',
		'scripts/core/paint-cube-stroke.js',
		'scripts/core/paint-cube-fill.js',
		'scripts/ui/paint-cube-ui.js',
		'scripts/core/selection-analysis.js',
		'scripts/core/production-state.js',
		'scripts/core/blueprint-state.js',
		'scripts/core/blueprint-library-format.js',
		'scripts/core/blueprint-transform.js',
		'scripts/core/blueprint-preview-plan.js',
		'scripts/core/blueprint-placement.js',
		'scripts/core/selection-delete.js',
		'scripts/core/native-tools.js',
		'scripts/core/input-controller.js',
		'scripts/render/resize-handles.js',
		'scripts/input/paint-cube-input.js',
		'scripts/input/selection-controller.js',
		'scripts/render/hover-overlay.js',
		'scripts/render/selected-overlay.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/card-opacity.js',
		'scripts/ui/dialog.js',
		'scripts/ui/editor-shell.js',
		'scripts/ui/selection-delete-ui.js',
		'scripts/blueprint-session.js',
		'scripts/core/blueprint-library.js',
		'scripts/core/selection-cut.js',
		'scripts/ui/selection-cut-ui.js',
		'scripts/blueprint-preview.js',
		'scripts/render/selection-cursor.js',
		'scripts/render/paint-cube-cursor.js',
		'scripts/render/paint-cube-render-diagnostics.js',
		'scripts/render/blueprint-thumbnail.js',
		'scripts/ui/blueprint-library-ui.js',
		'scripts/ui/selection-card.js',
		'scripts/ui/production-cards.js'
	])

	const scriptRoot = path.join(MOD_ROOT, 'scripts')
	const cardOpacitySource = fs.readFileSync(path.join(scriptRoot, 'ui', 'card-opacity.js'), 'utf8')
	const creativeModeSource = fs.readFileSync(path.join(scriptRoot, 'core', 'creative-mode.js'), 'utf8')
	const libraryUiSource = fs.readFileSync(path.join(scriptRoot, 'ui', 'blueprint-library-ui.js'), 'utf8')
	const placementSource = fs.readFileSync(path.join(scriptRoot, 'core', 'blueprint-placement.js'), 'utf8')
	const selectionDeleteSource = fs.readFileSync(path.join(scriptRoot, 'core', 'selection-delete.js'), 'utf8')
	const paintStrokeSource = fs.readFileSync(path.join(scriptRoot, 'core', 'paint-cube-stroke.js'), 'utf8')
	const scriptSources = readScriptSources(scriptRoot)
	const sources = scriptSources.join('\n')
	const readOnlySources = scriptSources
		.filter(source => source !== placementSource && source !== selectionDeleteSource && source !== paintStrokeSource)
		.join('\n')
	const stateFreeSources = scriptSources
		.filter(source => source !== cardOpacitySource && source !== creativeModeSource && source !== libraryUiSource)
		.join('\n')
	assert.doesNotMatch(readOnlySources, /\bgame\.(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity)\b/)
	assert.doesNotMatch(stateFreeSources, /\b(?:localStorage|sessionStorage)\b/)
	assert.doesNotMatch(cardOpacitySource, /\bsessionStorage\b/)
	assert.match(creativeModeSource, /\blocalStorage\b/)
	assert.doesNotMatch(creativeModeSource, /\bsessionStorage\b/)
	assert.match(libraryUiSource, /\blocalStorage\b/)
	assert.doesNotMatch(libraryUiSource, /\bsessionStorage\b/)
	assert.doesNotMatch(sources, /\b(?:writeFile|writeFileSync|appendFile|appendFileSync)\b/)
}

function readScriptSources(directory) {
	const sources = []
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name)
		if (entry.isDirectory()) sources.push(...readScriptSources(entryPath))
		else if (entry.isFile() && entry.name.endsWith('.js')) sources.push(fs.readFileSync(entryPath, 'utf8'))
	}
	return sources
}

testMoveStateAndToolLifecycle()
testMoveInputAndCancellation()
testMoveAnalysisReuseAndRestore()
testUnifiedToolbarAndLocalization()
testManifestAndReadOnlyBoundary()
console.log('2C verification passed: move state, drag input, cancellation, statistics reuse, implicit selection tool, i18n, manifest, and read-only boundary.')
