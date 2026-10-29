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
const GAME_ROOT = path.resolve(MOD_ROOT, '..', '..')
const loadModules = createModuleLoader(MOD_ROOT)
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')

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

function createEvent(values = {}) {
	return Object.assign({
		button: 0,
		buttons: 0,
		offsetX: 0,
		offsetY: 0,
		deltaX: 0,
		deltaY: 0,
		deltaMode: 0,
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
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

function selectRange(selection, start, end, plane = 0) {
	selection.begin(start, plane, 'test-start')
	selection.commit(end, plane, 'test-commit')
}

function testWheelInteraction() {
	class Game {
		switchPlane() {}
	}

	const timers = createTimers()
	const windowHub = new EventHub()
	const canvas = new EventHub()
	canvas.width = 800
	canvas.height = 600
	canvas.clientWidth = 800
	canvas.clientHeight = 600
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
	game.forcedHoveredCell = null
	game.updateMouseData = function (x, y) {
		this.hoveredCell = this.forcedHoveredCell
			? this.forcedHoveredCell.slice()
			: [Math.trunc(x / 10), Math.trunc(y / 10)]
	}
	game.w2 = 0
	game.h2 = 0
	game.uvToXY = uv => [uv[0] * 10, uv[1] * 10]
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	sandbox[RESIZE_HANDLES_KEY] = {
		hitTest(pointerEvent) {
			return pointerEvent?.handle || null
		}
	}
	api.emit('afterGameInit', {}, game)

	const selection = sandbox[SELECTION_KEY]
	const tool = sandbox[TOOL_KEY]
	const interaction = sandbox[INTERACTION_KEY]
	assert.equal(selection.version, '0.2.6')
	assert.equal(tool.version, '0.6.0')
	assert.equal(interaction.version, '0.2.6')
	assert.equal(interaction.wheelCommitMs, 1250)
	assert.equal(interaction.wheelPixelThreshold, 100)
	assert.equal(interaction.wheelMaxSteps, 4)
	assert.equal(interaction.wheelEdgeCornerPx, 16)
	assert.equal(interaction.wheelEdgeOppositeGuardPx, 4)
	assert.equal(interaction.wheelBottomTiePx, 1)
	assert.equal(interaction.wheelEdgeSideEpsilonPx, .01)
	assert.equal(interaction.wheelUnlockSlopPx, 6)

	let vanillaWheelCount = 0
	canvas.addEventListener('wheel', () => {
		vanillaWheelCount += 1
	})
	const reset = function (start, end) {
		interaction.cancelPending('test-reset')
		selection.clear('test-reset')
		selectRange(selection, start, end)
	}
	const dispatchCanvas = function (type, values, hoveredCell) {
		game.forcedHoveredCell = hoveredCell ? hoveredCell.slice() : null
		const result = canvas.dispatch(type, createEvent(values))
		game.forcedHoveredCell = null
		return result
	}
	const wheel = function (values, hoveredCell) {
		return dispatchCanvas('wheel', values, hoveredCell)
	}

	reset([10, 10], [12, 12])
	for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
		const before = vanillaWheelCount
		const passed = wheel({ offsetX: 124, offsetY: 110, deltaY: 100, [modifier]: true }, [12, 11])
		assert.equal(passed.defaultPrevented, false)
		assert.equal(vanillaWheelCount, before + 1)
		assert.equal(interaction.snapshot().gestureType, null)
	}
	const outside = wheel({ offsetX: 400, offsetY: 400, deltaY: 100 }, [40, 40])
	assert.equal(outside.defaultPrevented, false)
	assert.equal(interaction.snapshot().gestureType, null)
	const horizontal = wheel({ offsetX: 124, offsetY: 110, deltaX: 100 }, [12, 11])
	assert.equal(horizontal.defaultPrevented, false)
	assert.equal(interaction.snapshot().gestureType, null)

	const vanillaBeforeMove = vanillaWheelCount
	const partialA = wheel({ offsetX: 124, offsetY: 110, deltaY: -60 }, [12, 11])
	assert.equal(partialA.defaultPrevented, true)
	assert.equal(vanillaWheelCount, vanillaBeforeMove)
	assert.equal(interaction.snapshot().gestureType, 'wheel-pending')
	assert.equal(interaction.snapshot().wheelTarget, 'move')
	assert.equal(interaction.snapshot().wheelLatched, true)
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [1, 0])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU'])
	assert.equal(selection.hasPreview(), false)
	wheel({ offsetX: 124, offsetY: 110, deltaY: -39, handle: 'minU-minV' }, [1, 1])
	assert.equal(selection.hasPreview(), false)
	wheel({ offsetX: 124, offsetY: 110, deltaY: -1, handle: 'minU-minV' }, [1, 1])
	assert.equal(interaction.snapshot().gestureType, 'wheel-move')
	assert.equal(interaction.snapshot().wheelAxis, 'vertical')
	assert.equal(selection.snapshot().previewKind, 'move')
	assert.equal(selection.snapshot().previewSource, 'wheel')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([11, 10], [13, 12]))
	timers.advance(1249)
	assert.equal(selection.hasPreview(), true)
	timers.advance(1)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([11, 10], [13, 12]))
	assert.equal(interaction.snapshot().gestureType, null)
	assert.equal(interaction.snapshot().wheelLatched, true)

	wheel({ offsetX: 124, offsetY: 110, deltaY: -100, handle: 'maxU-maxV' }, [13, 12])
	assert.equal(selection.snapshot().previewKind, 'move')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([12, 10], [14, 12]))
	assert.equal(interaction.snapshot().wheelTarget, 'move')
	timers.advance(1250)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([12, 10], [14, 12]))
	assert.equal(interaction.snapshot().wheelLatched, true)

	dispatchCanvas('mousemove', { buttons: 0, offsetX: 129, offsetY: 110 }, [12, 11])
	assert.equal(interaction.snapshot().wheelLatched, true)
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 130, offsetY: 110 }, [12, 11])
	assert.equal(interaction.snapshot().wheelLatched, false)

	reset([10, 10], [12, 12])
	wheel({ offsetX: 110, offsetY: 110, deltaY: -100 }, [11, 11])
	assert.equal(interaction.snapshot().wheelLatchEdges.length, 1)
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [1, 0])
	interaction.cancelPending('center-tie-test-done')

	reset([10, 10], [12, 12])
	wheel({ offsetX: 111, offsetY: 124, deltaY: -100 }, [11, 12])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxV'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [0, -1])
	assert.equal(interaction.snapshot().wheelLatchCorner, null)
	assert.equal(interaction.snapshot().wheelLatchVisualSide, 'lower')
	interaction.cancelPending('opposite-edge-guard-test-done')

	reset([10, 10], [12, 12])
	wheel({ offsetX: 124, offsetY: 124, deltaY: -100 }, [12, 12])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [-1, -1])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU', 'maxV'])
	assert.equal(interaction.snapshot().wheelLatchCorner, 'maxU-maxV')
	assert.equal(interaction.snapshot().wheelLatchVisualCorner, 'bottom')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([9, 9], [11, 11]))
	const settleClick = dispatchCanvas('mousedown', {
		button: 0,
		buttons: 1,
		offsetX: 124,
		offsetY: 124
	}, [12, 12])
	assert.equal(settleClick.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([9, 9], [11, 11]))
	assert.equal(interaction.snapshot().wheelLatched, true)
	dispatchCanvas('mouseup', { button: 0, offsetX: 124, offsetY: 124 }, [12, 12])
	dispatchCanvas('click', { button: 0, offsetX: 124, offsetY: 124 }, [12, 12])
	assert.equal(selection.hasPreview(), false)

	reset([10, 10], [12, 12])
	wheel({ offsetX: 124, offsetY: 115, deltaY: -100 }, [12, 11])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU', 'maxV'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [-1, -1])
	assert.equal(interaction.snapshot().wheelLatchCorner, 'maxU-maxV')
	assert.equal(interaction.snapshot().wheelLatchVisualCorner, 'bottom')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([9, 9], [11, 11]))
	interaction.cancelPending('expanded-bottom-corner-test-done')

	reset([10, 10], [12, 12])
	wheel({ offsetX: 124, offsetY: 105, deltaY: -100 }, [12, 10])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU', 'minV'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [1, -1])
	assert.equal(interaction.snapshot().wheelLatchCorner, 'maxU-minV')
	assert.equal(interaction.snapshot().wheelLatchVisualCorner, null)
	assert.deepEqual(plain(selection.snapshot().previewRange), range([11, 9], [13, 11]))
	interaction.cancelPending('expanded-top-corner-test-done')

	reset([10, 10], [12, 12])
	wheel({ offsetX: 110, offsetY: 96, deltaY: 100 }, [11, 10])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [0, -1])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([10, 11], [12, 13]))
	const escape = windowHub.dispatch('keydown', createEvent({ key: 'Escape', keyCode: 27 }))
	assert.equal(escape.defaultPrevented, true)
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([10, 10], [12, 12]))
	assert.equal(interaction.snapshot().wheelLatched, false)

	game.h2 = 300
	game.uvToXY = uv => [uv[1] * 10, -uv[0] * 10]
	wheel({ offsetX: 110, offsetY: 176, deltaY: -100 }, [12, 11])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU'])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([11, 10], [13, 12]))
	interaction.cancelPending('rotated-projection-test-done')
	game.h2 = 0
	game.uvToXY = uv => [uv[0] * 10, uv[1] * 10]

	game.w2 = 200
	game.h2 = 200
	game.uvToXY = uv => [(uv[0] - uv[1]) * 10, (uv[0] + uv[1]) * 5]
	reset([10, 10], [20, 20])
	wheel({ offsetX: 255, offsetY: 378, deltaY: -100 }, [20, 15])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxU'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [-1, 0])
	assert.equal(interaction.snapshot().wheelLatchVisualSide, 'lower')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([9, 10], [19, 20]))
	interaction.cancelPending('visual-lower-right-edge-test-done')

	reset([10, 10], [20, 20])
	wheel({ offsetX: 145, offsetY: 378, deltaY: -100 }, [15, 20])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['maxV'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [0, -1])
	assert.equal(interaction.snapshot().wheelLatchVisualSide, 'lower')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([10, 9], [20, 19]))
	interaction.cancelPending('visual-lower-left-edge-test-done')

	reset([10, 10], [20, 20])
	wheel({ offsetX: 255, offsetY: 323, deltaY: -100 }, [15, 10])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['minV'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [0, -1])
	assert.equal(interaction.snapshot().wheelLatchVisualSide, 'upper')
	interaction.cancelPending('visual-upper-right-edge-test-done')

	reset([10, 10], [20, 20])
	wheel({ offsetX: 145, offsetY: 323, deltaY: -100 }, [10, 15])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchEdges), ['minU'])
	assert.deepEqual(plain(interaction.snapshot().wheelLatchDirection), [-1, 0])
	assert.equal(interaction.snapshot().wheelLatchVisualSide, 'upper')
	interaction.cancelPending('visual-upper-left-edge-test-done')

	game.w2 = 0
	game.h2 = 0
	game.uvToXY = uv => [uv[0] * 10, uv[1] * 10]
	reset([10, 10], [12, 12])
	wheel({ offsetX: 124, offsetY: 110, deltaY: -100 }, [12, 11])
	const right = dispatchCanvas('mousedown', {
		button: 2,
		buttons: 2,
		offsetX: 124,
		offsetY: 110
	}, [12, 11])
	assert.equal(right.defaultPrevented, false)
	assert.equal(selection.hasPreview(), false)
	assert.equal(interaction.snapshot().wheelLatched, false)
	wheel({ offsetX: 124, offsetY: 110, deltaY: -100 }, [12, 11])
	canvas.dispatch('mouseleave', createEvent())
	assert.equal(selection.hasPreview(), false)
	assert.equal(interaction.snapshot().wheelLatched, false)
	wheel({ offsetX: 124, offsetY: 110, deltaY: -100 }, [12, 11])
	windowHub.dispatch('blur', createEvent())
	assert.equal(selection.hasPreview(), false)
	assert.equal(interaction.snapshot().wheelLatched, false)

	reset([10, 10], [12, 12])
	wheel({ offsetX: 124, offsetY: 110, deltaY: -100 }, [12, 11])
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 129, offsetY: 110 }, [12, 11])
	assert.equal(selection.hasPreview(), true)
	assert.equal(interaction.snapshot().wheelLatched, true)
	wheel({ offsetX: 129, offsetY: 110, deltaY: -100 }, [13, 11])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([12, 10], [14, 12]))
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 134, offsetY: 110 }, [13, 11])
	assert.equal(selection.hasPreview(), true)
	assert.equal(interaction.snapshot().wheelLatched, true)
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 135, offsetY: 110 }, [13, 11])
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([12, 10], [14, 12]))
	assert.equal(interaction.snapshot().wheelLatched, false)
	wheel({
		offsetX: 135,
		offsetY: 110,
		deltaY: -100,
		handle: 'minU-midV'
	}, [11, 11])
	assert.equal(selection.snapshot().previewKind, 'resize')
	assert.equal(interaction.snapshot().wheelTarget, 'resize')
	interaction.cancelPending('pointer-unlock-reacquire-test-done')

	reset([1, 1], [3, 3])
	wheel({ offsetX: 5, offsetY: 5, deltaY: -100, handle: 'minU-minV' }, [1, 1])
	assert.equal(interaction.snapshot().wheelTarget, 'resize')
	assert.equal(selection.snapshot().previewKind, 'resize')
	assert.equal(selection.snapshot().previewSource, 'wheel')
	assert.equal(selection.snapshot().resizeOriginHandle, 'minU-minV')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([0, 0], [3, 3]))
	timers.advance(1249)
	assert.equal(selection.hasPreview(), true)
	timers.advance(1)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([0, 0], [3, 3]))
	assert.equal(interaction.snapshot().wheelLatched, true)
	assert.equal(interaction.snapshot().wheelLatchHandle, 'minU-minV')
	wheel({ offsetX: 5, offsetY: 5, deltaY: -100, handle: 'maxU-maxV' }, [3, 3])
	assert.equal(selection.snapshot().resizeOriginHandle, 'minU-minV')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([-1, -1], [3, 3]))
	timers.advance(1250)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([-1, -1], [3, 3]))
	wheel({ offsetX: 5, offsetY: 5, deltaY: -100, handle: 'maxU-maxV' }, [3, 3])
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 10, offsetY: 5 }, [0, 0])
	assert.equal(selection.hasPreview(), true)
	assert.equal(interaction.snapshot().wheelLatched, true)
	wheel({ offsetX: 10, offsetY: 5, deltaY: -100, handle: 'maxU-maxV' }, [3, 3])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([-3, -3], [3, 3]))
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 15, offsetY: 5 }, [0, 0])
	assert.equal(selection.hasPreview(), true)
	assert.equal(interaction.snapshot().wheelLatched, true)
	dispatchCanvas('mousemove', { buttons: 0, offsetX: 16, offsetY: 5 }, [0, 0])
	assert.equal(selection.hasPreview(), false)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([-3, -3], [3, 3]))
	assert.equal(interaction.snapshot().wheelLatched, false)

	reset([1, 1], [2, 2])
	wheel({ offsetX: 5, offsetY: 5, deltaY: 400, handle: 'minU-midV' }, [1, 1])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([5, 1], [2, 2]))
	assert.equal(selection.snapshot().resizeOriginHandle, 'minU-midV')
	assert.equal(selection.snapshot().resizeHandle, 'maxU-midV')
	timers.advance(1250)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([5, 1], [2, 2]))
	assert.equal(interaction.snapshot().wheelLatchHandle, 'maxU-midV')
	wheel({ offsetX: 5, offsetY: 5, deltaY: -100, handle: 'maxU-maxV' }, [2, 2])
	assert.equal(selection.snapshot().resizeOriginHandle, 'maxU-midV')
	assert.deepEqual(plain(selection.snapshot().previewRange), range([4, 1], [2, 2]))
	interaction.cancelPending('crossing-lock-test-done')

	reset([0, 0], [1, 1])
	wheel({ offsetX: 5, offsetY: 5, deltaY: -1050, handle: 'maxU-midV' }, [1, 0])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([0, 0], [5, 1]))
	wheel({ offsetX: 5, offsetY: 5, deltaY: -49, handle: 'minU-minV' }, [0, 0])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([0, 0], [5, 1]))
	wheel({ offsetX: 5, offsetY: 5, deltaY: -1, handle: 'minU-minV' }, [0, 0])
	assert.deepEqual(plain(selection.snapshot().previewRange), range([0, 0], [6, 1]))
	const lockedHandle = interaction.snapshot()
	assert.equal(lockedHandle.wheelTarget, 'resize')
	assert.equal(lockedHandle.wheelAxis, 'vertical')
	timers.advance(1250)
	assert.deepEqual(plain(selection.snapshot().selectedRange), range([0, 0], [6, 1]))
	assert.equal(interaction.snapshot().wheelLatched, true)

	reset([0, 0], [2, 2])
	const lineWheel = wheel({ offsetX: 24, offsetY: 10, deltaY: 3, deltaMode: 1 }, [2, 1])
	assert.equal(lineWheel.defaultPrevented, true)
	assert.equal(selection.hasPreview(), true)
	interaction.cancelPending('line-mode-test-done')
	assert.equal(selection.hasPreview(), false)

	const wheelListenersBeforeCleanup = canvas.count('wheel')
	assert.equal(wheelListenersBeforeCleanup, 2)
	runtime.runCleanups()
	assert.equal(sandbox[INTERACTION_KEY], undefined)
	assert.equal(canvas.count('wheel'), 1)
}

function testCardI18nManifestAndCompatibilityBoundary() {
	const i18nSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/i18n/editor-text.js'), 'utf8')
	assert.equal((i18nSource.match(/\bwheelHint\s*:/g) || []).length, 20)
	const { definitions, sandbox } = loadModules(['scripts/i18n/editor-text.js'])
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 268)
	assert.ok(i18n.keys.includes('wheelHint'))
	for (const language of i18n.languages) {
		assert.notEqual(i18n.t(language, 'wheelHint'), 'wheelHint')
		assert.ok(i18n.t(language, 'wheelHint').trim())
	}
	assert.equal(i18n.t('en', 'wheelHint'), 'Scroll to Adjust / Pause to Apply / Esc Cancel')
	assert.equal(i18n.t('sch', 'wheelHint'), '滚动调整 / 停止后应用 / Esc 取消')
	assert.equal(i18n.t('modsch', 'wheelHint'), '滚动调整 / 停止后应用 / Esc 取消')
	assert.equal(i18n.t('tch', 'wheelHint'), '滾動調整 / 停止後套用 / Esc 取消')

	const cardSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/selection-card.js'), 'utf8')
	const sharedSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/core/shared.js'), 'utf8')
	assert.match(cardSource, /previewSource\s*===\s*'wheel'/)
	assert.match(cardSource, /wheel\s*\?\s*i18n\.t\(source,\s*'wheelHint'\)/)
	assert.match(cardSource, /wheelLatched/)
	assert.match(cardSource, /data-input-pass-through="true"/)
	assert.match(cardSource, /const gap = 28/)
	assert.match(sharedSource, /--world-editor-card-pinned-border-color:\s*rgba\(166,\s*242,\s*70,\s*\.82\)/)
	assert.match(sharedSource, /--world-editor-card-pinned-glow-color:\s*rgba\(166,\s*242,\s*70,\s*\.36\)/)
	assert.match(sharedSource, /border-color:\s*color-mix\(in srgb,\s*var\(--world-editor-card-pinned-border-color\)/)
	assert.match(sharedSource, /0 0 16px color-mix\(in srgb,\s*var\(--world-editor-card-pinned-glow-color\)/)
	assert.match(cardSource, /card\.dataset\.worldEditorPinnable = 'true'/)
	assert.match(cardSource, /--world-editor-card-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.18\)/)
	assert.match(cardSource, /data-theme="void"[\s\S]*--world-editor-card-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.36\)/)
	assert.match(cardSource, /box-shadow:\s*0 10px 28px color-mix\(in srgb,\s*var\(--world-editor-card-base-shadow\)/)
	assert.doesNotMatch(cardSource, /\.cattail-world-editor-selection-card\[data-pinned="true"\]/)
	assert.doesNotMatch(cardSource, /rgba\(227,\s*253,\s*67,\s*\.98\)|rgba\(76,\s*185,\s*107,\s*\.98\)/)
	assert.match(cardSource, /pointer-events:\s*none/)

	const controllerSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/input/selection-controller.js'), 'utf8')
	assert.match(controllerSource, /WHEEL_COMMIT_MS\s*=\s*1250/)
	assert.match(controllerSource, /WHEEL_PIXEL_THRESHOLD\s*=\s*100/)
	assert.match(controllerSource, /WHEEL_MAX_STEPS\s*=\s*4/)
	assert.match(controllerSource, /WHEEL_EDGE_CORNER_PX\s*=\s*16/)
	assert.match(controllerSource, /WHEEL_EDGE_OPPOSITE_GUARD_PX\s*=\s*4/)
	assert.match(controllerSource, /WHEEL_BOTTOM_TIE_PX\s*=\s*1/)
	assert.match(controllerSource, /WHEEL_EDGE_SIDE_EPSILON_PX\s*=\s*\.01/)
	assert.match(controllerSource, /WHEEL_UNLOCK_SLOP_PX\s*=\s*6/)
	assert.match(controllerSource, /nearestSelectionDirection/)
	assert.match(controllerSource, /visualEdgeSide/)
	assert.match(controllerSource, /releaseWheelLatchOnPointerMove/)
	assert.match(controllerSource, /game\.uvToXY/)
	assert.match(controllerSource, /hasWheelModifier/)
	assert.match(controllerSource, /passive:\s*false/)

	const dynamicCameraSource = fs.readFileSync(
		path.join(GAME_ROOT, 'mods/Cattail_TweaksQuality_Tweaks/scripts/camera-angles.js'),
		'utf8'
	)
	assert.match(dynamicCameraSource, /window\.addEventListener\('wheel'/)
	assert.match(dynamicCameraSource, /event\.stopImmediatePropagation\(\)/)
	assert.match(dynamicCameraSource, /\},\s*true\)/)

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 47)

	const scriptText = manifest.entry
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const readOnlyScriptText = manifest.entry
		.filter(relativePath => (
			relativePath !== 'scripts/core/blueprint-placement.js' &&
			relativePath !== 'scripts/core/selection-delete.js' &&
			relativePath !== 'scripts/core/paint-cube-stroke.js'
		))
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const stateFreeScriptText = manifest.entry
		.filter(relativePath => (
			relativePath !== 'scripts/ui/card-opacity.js' &&
			relativePath !== 'scripts/core/creative-mode.js' &&
			relativePath !== 'scripts/ui/blueprint-library-ui.js'
		))
		.map(relativePath => fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8'))
		.join('\n')
	const cardOpacityText = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/card-opacity.js'), 'utf8')
	const creativeModeText = fs.readFileSync(path.join(MOD_ROOT, 'scripts/core/creative-mode.js'), 'utf8')
	const libraryUiText = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/blueprint-library-ui.js'), 'utf8')
	assert.doesNotMatch(readOnlyScriptText, /\baddEntity\s*\(/)
	assert.doesNotMatch(readOnlyScriptText, /\bclearCell\s*\(/)
	assert.doesNotMatch(stateFreeScriptText, /\blocalStorage\b|\bsessionStorage\b/)
	assert.doesNotMatch(cardOpacityText, /\bsessionStorage\b/)
	assert.match(creativeModeText, /\blocalStorage\b/)
	assert.doesNotMatch(creativeModeText, /\bsessionStorage\b/)
	assert.match(libraryUiText, /\blocalStorage\b/)
	assert.doesNotMatch(libraryUiText, /\bsessionStorage\b/)
	assert.doesNotMatch(scriptText, /\brequire\s*\(\s*['"](?:fs|node:fs)['"]\s*\)/)
}

testWheelInteraction()
testCardI18nManifestAndCompatibilityBoundary()

console.log('2F verification passed: expanded corner targeting, visual-bottom corner/lower-edge reversal, upper-edge preservation, nearest-edge movement, persistent per-adjustment 6px pointer-gated target lock, 1.25s settle, wheel accumulation, handle resize/crossing, 28px card clearance/pass-through, switch-green styling, cancellation, modifier priority, 20-language UI, manifest, and read-only boundary.')
