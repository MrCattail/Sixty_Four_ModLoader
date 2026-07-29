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

function createApi(options = {}) {
	const handlers = new Map()
	const layers = []
	const api = {
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
		},
		layers
	}
	if (options.render) {
		api.render = {
			isEnabled() {
				return options.renderEnabled !== false
			},
			onLayer(layer, callback, layerOptions) {
				const entry = { layer, callback, options: layerOptions, active: true }
				layers.push(entry)
				return function () {
					entry.active = false
				}
			}
		}
	}
	return api
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

function selectRange(selection, start, end, plane = 0) {
	selection.begin(start, plane, 'test-start')
	selection.commit(end, plane, 'test-commit')
}

function createContext() {
	return {
		arcs: [],
		fills: [],
		strokes: [],
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 0,
		save() {},
		restore() {},
		setTransform() {},
		beginPath() {},
		arc(x, y, radius, start, end) {
			this.arcs.push([x, y, radius, start, end])
		},
		fill() {
			this.fills.push(this.fillStyle)
		},
		stroke() {
			this.strokes.push({ style: this.strokeStyle, width: this.lineWidth })
		}
	}
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

function testResizeStateAndEndpointIdentity() {
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
	assert.equal(tool.version, '0.2.6')
	assert.deepEqual(plain(tool.modes), ['select'])
	assert.deepEqual(plain(selection.resizeHandles), [
		'minU-minV',
		'midU-minV',
		'maxU-minV',
		'maxU-midV',
		'maxU-maxV',
		'midU-maxV',
		'minU-maxV',
		'minU-midV'
	])

	const originalStart = [1, 2]
	const originalEnd = [4, 6]
	const expected = {
		'minU-minV': [[2, 3], [4, 6]],
		'midU-minV': [[1, 3], [4, 6]],
		'maxU-minV': [[1, 3], [5, 6]],
		'maxU-midV': [[1, 2], [5, 6]],
		'maxU-maxV': [[1, 2], [5, 7]],
		'midU-maxV': [[1, 2], [4, 7]],
		'minU-maxV': [[2, 2], [4, 7]],
		'minU-midV': [[2, 2], [4, 6]]
	}

	for (const handle of selection.resizeHandles) {
		selectRange(selection, originalStart, originalEnd)
		assert.equal(selection.beginResize(handle, [0, 0], 0, 'resize-start'), true)
		assert.equal(selection.snapshot().previewKind, 'resize')
		assert.equal(selection.snapshot().resizeOriginHandle, handle)
		assert.equal(selection.updateResize([1, 1], 0, 'resize-update'), true)
		const preview = selection.snapshot().previewRange
		assert.deepEqual(plain(preview.start), expected[handle][0])
		assert.deepEqual(plain(preview.end), expected[handle][1])
		assert.equal(selection.cancelPreview('resize-cancel'), true)
		assert.deepEqual(plain(selection.snapshot().selectedRange), range(originalStart, originalEnd))
	}

	selectRange(selection, originalStart, originalEnd)
	assert.equal(selection.beginResize('invalid', [0, 0], 0, 'invalid-handle'), false)
	assert.equal(selection.beginResize('minU-minV', [0, 0], 1, 'wrong-plane'), false)
	assert.equal(selection.beginResize('minU-minV', [0, 0], 0, 'cross-start'), true)
	selection.updateResize([5, 5], 0, 'cross-preview')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([6, 7], [4, 6]))
	assert.equal(selection.snapshot().resizeOriginHandle, 'minU-minV')
	assert.equal(selection.snapshot().resizeHandle, 'maxU-maxV')
	assert.equal(selection.commitResize([5, 5], 0, 'cross-commit'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange.start), [6, 7])
	assert.deepEqual(plain(selection.snapshot().selectedRange.end), [4, 6])
	assert.equal(selection.snapshot().previewRange, null)

	selectRange(selection, [2, 2], [2, 2])
	selection.beginResize('minU-minV', [0, 0], 0, 'tie-min')
	selection.updateResize([-1, -1], 0, 'tie-min-preview')
	assert.deepEqual(plain(selection.snapshot().previewRange.start), [1, 1])
	assert.deepEqual(plain(selection.snapshot().previewRange.end), [2, 2])
	selection.cancelPreview('tie-min-cancel')

	selection.beginResize('maxU-maxV', [0, 0], 0, 'tie-max')
	selection.updateResize([1, 1], 0, 'tie-max-preview')
	assert.deepEqual(plain(selection.snapshot().previewRange.start), [2, 2])
	assert.deepEqual(plain(selection.snapshot().previewRange.end), [3, 3])
	selection.commitResize([1, 1], 0, 'tie-max-commit')
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([2, 2], [3, 3]))

	assert.equal(tool.setMode('resize', 'test-resize-tool'), false)
	assert.equal(tool.snapshot().mode, 'select')
	selection.clear('selection-empty')
	assert.equal(tool.snapshot().mode, 'select')

	runtime.runCleanups()
	assert.equal(sandbox[SELECTION_KEY], undefined)
	assert.equal(sandbox[TOOL_KEY], undefined)
}

function testResizeHandlesRenderingInputAndCancellation() {
	class Game {
		switchPlane() {}
	}

	const windowHub = new EventHub()
	const canvas = new EventHub()
	canvas.style = { cursor: 'default' }
	canvas.width = 400
	canvas.height = 300
	const { definitions, sandbox } = loadModules([
		'scripts/core/shared.js',
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/core/input-controller.js',
		'scripts/render/resize-handles.js',
		'scripts/input/selection-controller.js'
	], {
		Game,
		window: windowHub,
		document: {
			activeElement: null,
			getElementById() {
				return null
			}
		},
		devicePixelRatio: 2
	})
	const api = createApi({ render: true })
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const game = new Game()
	game.canvas = canvas
	game.plane = false
	game.halt = false
	game.splash = { isShown: false }
	game.mouse = { cursorVisible: true }
	game.pixelRatio = 2
	game.w = 400
	game.h = 300
	game.w2 = 200
	game.h2 = 150
	game.unit = 20
	game.solidUnit = 20
	game.zoom = 1
	game.uvToXY = uv => [uv[0] * 20, uv[1] * 20]
	game.updateMouseData = function (x, y) {
		const centeredX = x * this.pixelRatio - this.w2
		const centeredY = y * this.pixelRatio - this.h2
		this.hoveredCell = [Math.floor(centeredX / 20), Math.floor(centeredY / 20)]
	}
	game.hoveredCell = [0, 0]

	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]
	const tool = sandbox[TOOL_KEY]
	const handles = sandbox[RESIZE_HANDLES_KEY]
	assert.ok(handles)
	assert.equal(handles.version, '0.2.6')
	assert.equal(handles.handles.length, 8)

	const cssForUv = function (u, v) {
		const projected = game.uvToXY([u, v])
		return [
			(game.w2 + projected[0]) / game.pixelRatio,
			(game.h2 + projected[1]) / game.pixelRatio
		]
	}
	const minCorner = function (targetRange) {
		return cssForUv(targetRange.minU - .5, targetRange.minV - .5)
	}

	selectRange(selection, [1, 1], [3, 3])
	const original = range([1, 1], [3, 3])
	const corner = minCorner(original)
	assert.equal(handles.hitTestPoint(corner[0], corner[1]), 'minU-minV')

	canvas.dispatch('mousemove', mouseEvent({ offsetX: corner[0], offsetY: corner[1] }))
	assert.equal(handles.snapshot().hoveredHandle, 'minU-minV')
	assert.notEqual(canvas.style.cursor, 'default')

	const layer = api.layers.find(entry => entry.options?.id === 'world-editor-resize-handles')
	assert.ok(layer)
	assert.equal(layer.layer, 'interaction')
	assert.equal(layer.options.order, 60)
	assert.equal(layer.options.space, 'screen')
	assert.equal(layer.options.enabled({ game }), true)

	const normalContext = createContext()
	layer.callback({ game, ctx: normalContext })
	assert.equal(normalContext.arcs.length, 16)
	assert.equal(normalContext.fills.length, 8)

	game.zoom = .25
	const farContext = createContext()
	layer.callback({ game, ctx: farContext })
	game.zoom = 4
	const nearContext = createContext()
	layer.callback({ game, ctx: nearContext })
	assert.ok(farContext.arcs[0][2] < nearContext.arcs[0][2])
	game.zoom = 1

	const down = canvas.dispatch('mousedown', mouseEvent({
		button: 0,
		buttons: 1,
		offsetX: corner[0],
		offsetY: corner[1]
	}))
	assert.equal(down.defaultPrevented, true)
	assert.equal(selection.isResizing(), true)
	assert.equal(selection.snapshot().resizeHandle, 'minU-minV')

	const crossedPointer = cssForUv(3.5, 3.5)
	const drag = canvas.dispatch('mousemove', mouseEvent({
		buttons: 1,
		offsetX: crossedPointer[0],
		offsetY: crossedPointer[1]
	}))
	assert.equal(drag.defaultPrevented, true)
	assert.deepEqual(plain(selection.snapshot().previewRange.start), [4, 4])
	assert.deepEqual(plain(selection.snapshot().previewRange.end), [3, 3])
	assert.equal(selection.snapshot().resizeHandle, 'maxU-maxV')

	const up = canvas.dispatch('mouseup', mouseEvent({
		button: 0,
		buttons: 0,
		offsetX: crossedPointer[0],
		offsetY: crossedPointer[1]
	}))
	assert.equal(up.defaultPrevented, true)
	assert.equal(selection.isResizing(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange.start), [4, 4])
	assert.deepEqual(plain(selection.snapshot().selectedRange.end), [3, 3])
	assert.equal(canvas.style.cursor, 'move')

	const outside = canvas.dispatch('mousedown', mouseEvent({
		button: 0,
		buttons: 1,
		offsetX: 5,
		offsetY: 5
	}))
	assert.equal(outside.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)

	selectRange(selection, [1, 1], [3, 3])
	const resetCorner = minCorner(original)
	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: resetCorner[0], offsetY: resetCorner[1] }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: crossedPointer[0], offsetY: crossedPointer[1] }))
	const right = canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2, offsetX: crossedPointer[0], offsetY: crossedPointer[1] }))
	assert.equal(right.defaultPrevented, false)
	assert.equal(right.immediatePropagationStopped, false)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: resetCorner[0], offsetY: resetCorner[1] }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: crossedPointer[0], offsetY: crossedPointer[1] }))
	canvas.dispatch('mouseleave', mouseEvent())
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: resetCorner[0], offsetY: resetCorner[1] }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: crossedPointer[0], offsetY: crossedPointer[1] }))
	windowHub.dispatch('blur', {})
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1, offsetX: resetCorner[0], offsetY: resetCorner[1] }))
	canvas.dispatch('mousemove', mouseEvent({ buttons: 1, offsetX: crossedPointer[0], offsetY: crossedPointer[1] }))
	const escape = windowHub.dispatch('keydown', mouseEvent({ key: 'Escape', keyCode: 27 }))
	assert.equal(escape.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), original)

	const oldCorner = minCorner(original)
	assert.equal(handles.hitTestPoint(oldCorner[0], oldCorner[1]), 'minU-minV')
	game.uvToXY = uv => [uv[0] * 20 + 120, uv[1] * 20 - 80]
	const shiftedCorner = minCorner(original)
	assert.equal(handles.hitTestPoint(oldCorner[0], oldCorner[1]), null)
	assert.equal(handles.hitTestPoint(shiftedCorner[0], shiftedCorner[1]), 'minU-minV')

	game.uvToXY = () => [0, 0]
	assert.equal(handles.hitTestPoint(game.w2 / game.pixelRatio, game.h2 / game.pixelRatio), 'minU-minV')

	game.uvToXY = uv => [uv[0] * 20, uv[1] * 20]
	game.plane = true
	selectRange(selection, [1, 1], [3, 3], 1)
	const voidContext = createContext()
	layer.callback({ game, ctx: voidContext })
	assert.equal(voidContext.fills.length, 8)
	assert.notEqual(voidContext.fills[0], normalContext.fills[0])

	runtime.runCleanups()
	assert.equal(sandbox[RESIZE_HANDLES_KEY], undefined)
	assert.equal(canvas.style.cursor, 'default')
	assert.equal(layer.active, false)
}

function testResizeAnalysisReuseAndRestore() {
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

	const game = new Game()
	game.entityAtCoordinates = () => false
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	const selection = sandbox[SELECTION_KEY]
	const analysis = sandbox[ANALYSIS_KEY]

	selectRange(selection, [0, 0], [1, 1])
	frames.flushAll()
	assert.equal(analysis.snapshot().status, 'ready')
	const originalKey = analysis.snapshot().key

	selection.beginResize('maxU-midV', [0, 0], 0, 'resize-start')
	selection.updateResize([1, 0], 0, 'resize-preview')
	frames.flushAll()
	const previewKey = analysis.snapshot().key
	assert.notEqual(previewKey, originalKey)
	assert.equal(analysis.snapshot().phase, 'preview')
	assert.equal(analysis.snapshot().status, 'ready')
	selection.commitResize([1, 0], 0, 'resize-commit')
	assert.equal(analysis.snapshot().key, previewKey)
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.equal(analysis.snapshot().status, 'ready')

	const committed = analysis.snapshot()
	selection.beginResize('maxU-midV', [0, 0], 0, 'resize-start-2')
	selection.updateResize([5, 0], 0, 'resize-preview-2')
	assert.notEqual(analysis.snapshot().key, committed.key)
	selection.cancelPreview('resize-cancel')
	assert.equal(analysis.snapshot().key, committed.key)
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.equal(analysis.snapshot().status, 'ready')

	runtime.runCleanups()
}

function testLocalizationManifestAndReadOnlyBoundary() {
	const { definitions, sandbox } = loadModules(['scripts/i18n/editor-text.js'])
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.4.1')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 130)
	for (const language of i18n.languages) {
		for (const key of ['toolbarModeResize', 'toolResize', 'cardResizePreview', 'resizeHint']) {
			assert.notEqual(i18n.t(language, key), key)
			assert.ok(i18n.t(language, key).length > 0)
		}
	}
	assert.equal(i18n.t('sch', 'toolbarModeResize'), '缩放选区模式')
	assert.equal(i18n.t('tch', 'cardResizePreview'), '縮放預覽')
	assert.equal(i18n.t('en', 'resizeHint'), 'Release to resize / Esc Cancel')

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.4.1')
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
		'scripts/core/blueprint-placement.js',
		'scripts/core/input-controller.js',
		'scripts/render/resize-handles.js',
		'scripts/input/selection-controller.js',
		'scripts/render/hover-overlay.js',
		'scripts/render/selected-overlay.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/card-opacity.js',
		'scripts/ui/dialog.js',
		'scripts/ui/editor-shell.js',
		'scripts/blueprint-session.js',
		'scripts/blueprint-preview.js',
		'scripts/ui/selection-card.js',
		'scripts/ui/production-cards.js'
	])

	const scriptRoot = path.join(MOD_ROOT, 'scripts')
	const cardOpacitySource = fs.readFileSync(path.join(scriptRoot, 'ui', 'card-opacity.js'), 'utf8')
	const creativeModeSource = fs.readFileSync(path.join(scriptRoot, 'core', 'creative-mode.js'), 'utf8')
	const placementSource = fs.readFileSync(path.join(scriptRoot, 'core', 'blueprint-placement.js'), 'utf8')
	const scriptSources = readScriptSources(scriptRoot)
	const sources = scriptSources.join('\n')
	const readOnlySources = scriptSources
		.filter(source => source !== placementSource)
		.join('\n')
	const stateFreeSources = scriptSources
		.filter(source => source !== cardOpacitySource && source !== creativeModeSource)
		.join('\n')
	assert.doesNotMatch(readOnlySources, /\bgame\.(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity)\b/)
	assert.doesNotMatch(stateFreeSources, /\b(?:localStorage|sessionStorage)\b/)
	assert.doesNotMatch(cardOpacitySource, /\bsessionStorage\b/)
	assert.match(creativeModeSource, /\blocalStorage\b/)
	assert.doesNotMatch(creativeModeSource, /\bsessionStorage\b/)
	assert.doesNotMatch(sources, /\b(?:writeFile|writeFileSync|appendFile|appendFileSync)\b/)
	assert.match(sources, /api\.render\.onLayer\(RENDER_LAYER_ID/)
	assert.match(sources, /previewKind: previewRange \? \(moveSession \? 'move' : resizeSession \? 'resize'/)
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

testResizeStateAndEndpointIdentity()
testResizeHandlesRenderingInputAndCancellation()
testResizeAnalysisReuseAndRestore()
testLocalizationManifestAndReadOnlyBoundary()
console.log('2D verification passed: eight-handle resize state, crossing identity, dynamic projection, render/input lifecycle, cancellation, analysis reuse, i18n, manifest, and read-only boundary.')
