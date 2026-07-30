const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
	createModuleLoader,
	createRuntime,
	EventHub,
	createTimers,
	plain,
	range
} = require('./helpers/runtime-harness')

const MOD_ROOT = path.resolve(__dirname, '..')
const loadModules = createModuleLoader(MOD_ROOT)
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')

function createApi(render) {
	const handlers = new Map()
	return {
		render,
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

function createEvent(values = {}) {
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

function selectRange(selection, start, end, options) {
	assert.equal(selection.begin(start, 0, 'test-start', options), true)
	assert.equal(selection.commit(end, 0, 'test-commit'), true)
}

function setupSelection() {
	class Game {
		switchPlane() {}
	}
	const { definitions, sandbox } = loadModules(['scripts/core/selection-state.js'], { Game })
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')
	const game = new Game()
	game.plane = false
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)
	return { api, game, runtime, sandbox, selection: sandbox[SELECTION_KEY] }
}

function testMultiSelectionState() {
	const { game, runtime, selection } = setupSelection()
	assert.equal(selection.version, '0.2.6')
	assert.equal(selection.snapshot().selectionCount, 0)

	selectRange(selection, [0, 0], [4, 4])
	let state = plain(selection.snapshot())
	const firstId = state.primaryId
	assert.equal(state.selectionCount, 1)
	assert.deepEqual(state.selectedRange, range([0, 0], [4, 4]))

	assert.equal(selection.begin([10, 10], 0, 'append-start', { additive: true }), true)
	state = plain(selection.snapshot())
	assert.equal(state.previewMode, 'append')
	assert.equal(state.selectionCount, 1)
	assert.equal(selection.cancelPreview('append-cancel'), true)
	assert.equal(selection.snapshot().primaryId, firstId)

	selectRange(selection, [2, 2], [6, 6], { additive: true })
	state = plain(selection.snapshot())
	const secondId = state.primaryId
	assert.equal(state.selectionCount, 2)
	assert.notEqual(secondId, firstId)
	assert.equal(selection.selectionAt([3, 3], 0), secondId)

	assert.equal(selection.setPrimary(firstId, 'overlap-promote'), true)
	state = plain(selection.snapshot())
	assert.equal(state.primaryId, firstId)
	assert.equal(state.selections[state.selections.length - 1].id, firstId)
	assert.equal(selection.selectionAt([3, 3], 0), firstId)

	const secondBefore = state.selections.find(entry => entry.id === secondId).range
	assert.equal(selection.beginMove([1, 1], 0, 'move-first'), true)
	assert.equal(selection.snapshot().previewTargetId, firstId)
	assert.equal(selection.updateMove([3, 2], 0, 'move-first-preview'), true)
	assert.deepEqual(plain(selection.snapshot().previewRange), range([2, 1], [6, 5]))
	assert.equal(selection.cancelPreview('move-first-cancel'), true)
	assert.deepEqual(
		plain(selection.snapshot().selections.find(entry => entry.id === secondId).range),
		secondBefore
	)

	assert.equal(selection.beginMove([1, 1], 0, 'move-first'), true)
	assert.equal(selection.commitMove([3, 2], 0, 'move-first-commit'), true)
	state = plain(selection.snapshot())
	assert.deepEqual(state.selectedRange, range([2, 1], [6, 5]))
	assert.deepEqual(state.selections.find(entry => entry.id === secondId).range, secondBefore)

	assert.equal(selection.beginResize('maxU-maxV', [6, 5], 0, 'resize-first'), true)
	assert.equal(selection.commitResize([7, 7], 0, 'resize-first-commit'), true)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([2, 1], [7, 7]))

	assert.equal(selection.removePrimary('remove-first'), true)
	state = plain(selection.snapshot())
	assert.equal(state.selectionCount, 1)
	assert.equal(state.primaryId, secondId)
	assert.deepEqual(state.selectedRange, secondBefore)

	selectRange(selection, [20, 20], [21, 21])
	state = plain(selection.snapshot())
	assert.equal(state.selectionCount, 1)
	assert.deepEqual(state.selectedRange, range([20, 20], [21, 21]))

	game.plane = true
	game.switchPlane()
	assert.equal(selection.snapshot().selectionCount, 0)
	runtime.runCleanups()
}

function setupInput() {
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
		'scripts/core/shared.js',
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
	game.uvToXY = uv => [uv[0] * 10, uv[1] * 10]
	game.w2 = 0
	game.h2 = 0
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	sandbox[RESIZE_HANDLES_KEY] = { hitTest() { return null } }
	api.emit('afterGameInit', {}, game)
	return {
		canvas,
		game,
		interaction: sandbox[INTERACTION_KEY],
		runtime,
		selection: sandbox[SELECTION_KEY],
		timers,
		windowHub
	}
}

function click(canvas, x, y, options = {}) {
	canvas.dispatch('mousedown', createEvent(Object.assign({
		button: 0,
		buttons: 1,
		offsetX: x,
		offsetY: y
	}, options)))
	canvas.dispatch('mouseup', createEvent({
		button: 0,
		offsetX: x,
		offsetY: y
	}))
}

function testCtrlAndPrimaryInput() {
	const { canvas, interaction, runtime, selection, windowHub } = setupInput()
	selectRange(selection, [1, 1], [3, 3])
	const firstId = selection.snapshot().primaryId

	click(canvas, 10, 10, { ctrlKey: true })
	assert.equal(selection.snapshot().previewMode, 'append')
	assert.equal(interaction.snapshot().gestureAdditive, false)
	assert.equal(selection.snapshot().selectionCount, 1)
	click(canvas, 12, 12)
	let state = plain(selection.snapshot())
	const secondId = state.primaryId
	assert.equal(state.selectionCount, 2)
	assert.notEqual(secondId, firstId)

	click(canvas, 2, 2)
	state = plain(selection.snapshot())
	assert.equal(state.primaryId, firstId)
	assert.equal(state.previewRange, null)

	click(canvas, 2, 2)
	assert.equal(selection.hasPreview(), false)

	const secondBefore = plain(selection.snapshot().selections.find(entry => entry.id === secondId).range)
	canvas.dispatch('mousedown', createEvent({ button: 0, buttons: 1, offsetX: 2, offsetY: 2 }))
	canvas.dispatch('mousemove', createEvent({ buttons: 1, offsetX: 8, offsetY: 2 }))
	assert.equal(selection.snapshot().previewTargetId, firstId)
	canvas.dispatch('mouseup', createEvent({ button: 0, offsetX: 8, offsetY: 2 }))
	state = plain(selection.snapshot())
	assert.deepEqual(state.selectedRange, range([7, 1], [9, 3]))
	assert.deepEqual(state.selections.find(entry => entry.id === secondId).range, secondBefore)

	click(canvas, 8, 2, { ctrlKey: true })
	assert.equal(selection.snapshot().previewMode, 'append')
	click(canvas, 14, 4)
	assert.equal(selection.snapshot().selectionCount, 3)

	const beforeBackspace = selection.snapshot().selectionCount
	const backspace = windowHub.dispatch('keydown', createEvent({ key: 'Backspace', keyCode: 8 }))
	assert.equal(backspace.defaultPrevented, true)
	assert.equal(selection.snapshot().selectionCount, beforeBackspace - 1)
	const repeated = windowHub.dispatch('keydown', createEvent({ key: 'Backspace', keyCode: 8, repeat: true }))
	assert.equal(repeated.defaultPrevented, true)
	assert.equal(selection.snapshot().selectionCount, beforeBackspace - 1)

	click(canvas, 30, 30)
	assert.equal(selection.snapshot().previewMode, 'replace')
	click(canvas, 31, 31)
	assert.equal(selection.snapshot().selectionCount, 1)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([30, 30], [31, 31]))
	runtime.runCleanups()
}

function createSelectionFeed(initial) {
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
		emit(next) {
			state = next
			for (const listener of listeners) listener(state)
		}
	}
}

function createContextRecorder() {
	const calls = []
	const context = {
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 0,
		lineJoin: '',
		save() {},
		restore() {},
		setTransform() {},
		beginPath() {},
		moveTo() {},
		lineTo() {},
		closePath() {},
		fill() {
			calls.push(['fill', this.fillStyle])
		},
		stroke() {}
	}
	context.calls = calls
	return context
}

function testMultiSelectionRendering() {
	let registration = null
	const render = {
		onLayer(layer, callback, options) {
			registration = { layer, callback, options }
			return () => {}
		}
	}
	const { definitions, sandbox } = loadModules(['scripts/render/selected-overlay.js'])
	const api = createApi(render)
	for (const definition of definitions) definition.init(api)
	const game = {
		canvas: { width: 800, height: 600 },
		halt: false,
		h2: 300,
		mouse: { cursorVisible: true },
		pixelRatio: 1,
		plane: false,
		solidUnit: 10,
		unit: 10,
		uvToXY(uv) {
			return [uv[0] * 10, uv[1] * 10]
		},
		w2: 400,
		zoom: 1
	}
	const runtime = createRuntime(game)
	const first = range([0, 0], [2, 2])
	const second = range([5, 5], [7, 7])
	const feed = createSelectionFeed({
		version: '0.2.6',
		selections: [
			{ id: 1, range: first, plane: 0, primary: false },
			{ id: 2, range: second, plane: 0, primary: true }
		],
		primaryId: 2,
		selectedRange: second,
		previewRange: null,
		previewTargetId: null,
		plane: 0
	})
	feed.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = feed
	api.emit('afterGameInit', {}, game)
	assert.ok(registration)

	let context = createContextRecorder()
	registration.callback({ game, ctx: context, width: 800, height: 600 })
	assert.equal(context.calls.filter(call => call[0] === 'fill').length, 4)
	assert.equal(context.calls[0][1], 'rgba(170, 137, 220, .07)')

	feed.emit({
		version: '0.2.6',
		selections: [
			{ id: 1, range: first, plane: 0, primary: false },
			{ id: 2, range: second, plane: 0, primary: true }
		],
		primaryId: 2,
		selectedRange: second,
		previewRange: range([10, 10], [12, 12]),
		previewKind: 'selection',
		previewMode: 'append',
		previewTargetId: null,
		plane: 0
	})
	context = createContextRecorder()
	registration.callback({ game, ctx: context, width: 800, height: 600 })
	assert.equal(context.calls.filter(call => call[0] === 'fill').length, 5)

	feed.emit({
		version: '0.2.6',
		selections: [
			{ id: 1, range: first, plane: 0, primary: false },
			{ id: 2, range: second, plane: 0, primary: true }
		],
		primaryId: 2,
		selectedRange: second,
		previewRange: range([6, 6], [8, 8]),
		previewKind: 'move',
		previewTargetId: 2,
		plane: 0
	})
	context = createContextRecorder()
	registration.callback({ game, ctx: context, width: 800, height: 600 })
	assert.equal(context.calls.filter(call => call[0] === 'fill').length, 4)
	runtime.runCleanups()
}

function testI18nManifestAndReadOnlyBoundary() {
	const i18nSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/i18n/editor-text.js'), 'utf8')
	assert.equal((i18nSource.match(/\bremoveSelection\s*:/g) || []).length, 20)
	const { definitions, sandbox } = loadModules(['scripts/i18n/editor-text.js'])
	for (const definition of definitions) definition.init(createApi())
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.4.4')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 177)
	assert.ok(i18n.keys.includes('removeSelection'))
	for (const language of i18n.languages) {
		const translated = i18n.t(language, 'removeSelection')
		assert.notEqual(translated, 'removeSelection')
		assert.ok(translated.trim())
	}
	assert.equal(i18n.t('sch', 'removeSelection'), '移除当前选区（Backspace）')
	assert.equal(i18n.t('tch', 'removeSelection'), '移除目前選區（Backspace）')

	const toolbarSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/editor-shell.js'), 'utf8')
	assert.match(toolbarSource, /data-world-editor-action="remove-selection"/)
	assert.match(toolbarSource, /i18n\.t\(source,\s*'removeSelection'\)/)
	assert.match(toolbarSource, /removePrimary\('toolbar-remove-primary'\)/)

	const controllerSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/input/selection-controller.js'), 'utf8')
	assert.match(controllerSource, /event\?\.ctrlKey/)
	assert.match(controllerSource, /selection\.selectionAt/)
	assert.match(controllerSource, /selection\.setPrimary/)
	assert.match(controllerSource, /selection\.isPrimarySelected/)

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.4.4')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 30)

	const scriptText = manifest.entry
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const readOnlyScriptText = manifest.entry
		.filter(relativePath => (
			relativePath !== 'scripts/core/blueprint-placement.js' &&
			relativePath !== 'scripts/core/selection-delete.js'
		))
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const stateFreeScriptText = manifest.entry
		.filter(relativePath => (
			relativePath !== 'scripts/ui/card-opacity.js' &&
			relativePath !== 'scripts/core/creative-mode.js'
		))
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const cardOpacityText = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/card-opacity.js'), 'utf8')
	const creativeModeText = fs.readFileSync(path.join(MOD_ROOT, 'scripts/core/creative-mode.js'), 'utf8')
	assert.doesNotMatch(readOnlyScriptText, /\baddEntity\s*\(/)
	assert.doesNotMatch(readOnlyScriptText, /\bclearCell\s*\(/)
	assert.doesNotMatch(stateFreeScriptText, /\blocalStorage\b|\bsessionStorage\b/)
	assert.doesNotMatch(cardOpacityText, /\bsessionStorage\b/)
	assert.match(creativeModeText, /\blocalStorage\b/)
	assert.doesNotMatch(creativeModeText, /\bsessionStorage\b/)
	assert.doesNotMatch(scriptText, /\brequire\s*\(\s*['"](?:fs|node:fs)['"]\s*\)/)
}

testMultiSelectionState()
testCtrlAndPrimaryInput()
testMultiSelectionRendering()
testI18nManifestAndReadOnlyBoundary()

console.log('2G verification passed: Ctrl-add mode locking, stable selection IDs, overlap-primary ordering, independent move/resize, primary removal, Backspace protection, primary-only compatibility fields, secondary rendering, 20-language UI, manifest, and read-only boundary.')
