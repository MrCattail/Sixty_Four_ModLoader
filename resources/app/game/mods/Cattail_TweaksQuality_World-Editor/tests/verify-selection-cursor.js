const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(MOD_ROOT, 'scripts/render/selection-cursor.js')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')
const source = fs.readFileSync(SOURCE_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createFeed(initial) {
	let state = clone(initial)
	const listeners = new Set()
	return {
		snapshot() { return clone(state) },
		subscribe(listener) {
			listeners.add(listener)
			listener(clone(state))
			return function () { listeners.delete(listener) }
		},
		emit(next) {
			state = clone(next)
			for (const listener of Array.from(listeners)) listener(clone(state))
		},
		listenerCount() { return listeners.size }
	}
}

function createEventTarget() {
	const listeners = new Map()
	return {
		style: {},
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(listener)
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener)
		},
		dispatch(type, event = {}) {
			for (const listener of Array.from(listeners.get(type) || [])) listener(event)
		},
		matches() { return false },
		listenerCount(type) { return listeners.get(type)?.size || 0 }
	}
}

function createContext() {
	const operations = []
	const stack = []
	const ctx = {
		operations,
		globalCompositeOperation: 'source-over',
		fillStyle: '#000',
		strokeStyle: '#000',
		lineWidth: 1,
		lineJoin: 'miter',
		shadowColor: 'rgba(0,0,0,0)',
		shadowBlur: 0,
		shadowOffsetY: 0,
		save() {
			stack.push({
				globalCompositeOperation: this.globalCompositeOperation,
				fillStyle: this.fillStyle,
				strokeStyle: this.strokeStyle,
				lineWidth: this.lineWidth,
				lineJoin: this.lineJoin,
				shadowColor: this.shadowColor,
				shadowBlur: this.shadowBlur,
				shadowOffsetY: this.shadowOffsetY
			})
			operations.push(['save'])
		},
		restore() {
			Object.assign(this, stack.pop() || {})
			operations.push(['restore'])
		},
		setTransform(...args) { operations.push(['setTransform', ...args]) },
		translate(...args) { operations.push(['translate', ...args]) },
		beginPath() { operations.push(['beginPath']) },
		closePath() { operations.push(['closePath']) },
		moveTo(...args) { operations.push(['moveTo', ...args]) },
		lineTo(...args) { operations.push(['lineTo', ...args]) },
		bezierCurveTo(...args) { operations.push(['bezierCurveTo', ...args]) },
		arc(...args) { operations.push(['arc', ...args]) },
		fill() { operations.push(['fill', this.globalCompositeOperation, this.fillStyle]) },
		stroke() { operations.push(['stroke', this.strokeStyle, this.lineWidth]) },
		clip() { operations.push(['clip']) },
		fillRect(...args) { operations.push(['fillRect', this.fillStyle, ...args]) },
		createLinearGradient(...args) {
			const stops = []
			const gradient = {
				stops,
				addColorStop(offset, color) { stops.push([offset, color]) }
			}
			operations.push(['gradient', args, stops])
			return gradient
		}
	}
	return ctx
}

function range(start, end = start) {
	return {
		start: start.slice(),
		end: end.slice(),
		minU: Math.min(start[0], end[0]),
		maxU: Math.max(start[0], end[0]),
		minV: Math.min(start[1], end[1]),
		maxV: Math.max(start[1], end[1]),
		width: Math.abs(end[0] - start[0]) + 1,
		height: Math.abs(end[1] - start[1]) + 1
	}
}

function baseSelection(overrides = {}) {
	return Object.assign({
		selections: [],
		primaryId: null,
		selectionCount: 0,
		selectedRange: null,
		previewRange: null,
		previewKind: null,
		plane: null,
		lastReason: 'initialized'
	}, overrides)
}

function createEnvironment(options = {}) {
	let clock = 0
	let inputBlocked = false
	let hitId = null
	let hoveredHandle = null
	let blueprintActive = false
	let interactionState = { gestureType: null, wheelLatched: false }
	const cleanup = []
	const canvas = createEventTarget()
	const windowTarget = createEventTarget()
	const game = {
		canvas,
		halt: false,
		plane: 0,
		pixelRatio: 1,
		hoveredCell: [3, 4],
		mouse: { xy: [200, 150], cursorVisible: true },
		splash: { isShown: false }
	}
	const runtimeFeed = createFeed({ active: true })
	const runtime = Object.assign(runtimeFeed, {
		game,
		isActive() { return runtime.snapshot().active },
		addCleanup(fn) { cleanup.push(fn) }
	})
	const selectionFeed = createFeed(baseSelection())
	const selection = Object.assign(selectionFeed, {
		game,
		selectionAt() { return hitId }
	})
	const tool = createFeed({ mode: 'select' })
	const render = { callback: null, options: null, stopped: false }
	const hooks = {}
	let definition = null
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		performance: { now() { return clock } },
		matchMedia() { return { matches: options.reducedMotion === true } },
		window: windowTarget,
		ModLoader: {
			register(value) { definition = value }
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source, sandbox, { filename: SOURCE_PATH })
	assert.ok(definition)

	const api = {
		on(name, listener) { hooks[name] = listener },
		render: {
			onLayer(layer, callback, callbackOptions) {
				assert.equal(layer, 'cursor')
				render.callback = callback
				render.options = callbackOptions
				return function () { render.stopped = true }
			}
		}
	}

	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.shared')] = {
		isWorldEditorInputBlocked() { return inputBlocked }
	}
	sandbox[Symbol.for('cattail.world-editor.selection')] = selection
	sandbox[Symbol.for('cattail.world-editor.tool')] = tool
	sandbox[Symbol.for('cattail.world-editor.resize-handles')] = {
		snapshot() { return { hoveredHandle } }
	}
	sandbox[Symbol.for('cattail.world-editor.selection-interaction')] = {
		snapshot() { return clone(interactionState) }
	}
	sandbox[Symbol.for('cattail.world-editor.blueprint-preview')] = {
		game,
		snapshot() { return { active: blueprintActive } }
	}

	definition.init(api)
	assert.equal(typeof hooks.afterGameInit, 'function')
	hooks.afterGameInit({}, game)
	const service = sandbox[Symbol.for('cattail.world-editor.selection-cursor')]
	assert.ok(service)
	assert.equal(typeof render.callback, 'function')
	assert.equal(render.options.id, 'world-editor-selection-cursor')

	return {
		sandbox,
		game,
		canvas,
		window: windowTarget,
		runtime,
		selection,
		tool,
		render,
		service,
		setClock(value) { clock = value },
		advance(value) { clock += value },
		setInputBlocked(value) { inputBlocked = value },
		setHitId(value) { hitId = value },
		setHoveredHandle(value) { hoveredHandle = value },
		setBlueprintActive(value) { blueprintActive = value },
		setInteraction(value) { interactionState = Object.assign({ gestureType: null, wheelLatched: false }, value) },
		enabled() { return render.options.enabled({ game }) },
		draw(ctx = createContext()) {
			render.callback({ game, ctx })
			return ctx
		},
		cleanup() {
			while (cleanup.length) cleanup.pop()()
		}
	}
}

function testSourceAndManifestContracts() {
	assert.equal(manifest.version, '0.6.0')
	const cursorIndex = manifest.entry.indexOf('scripts/render/selection-cursor.js')
	assert.ok(cursorIndex > manifest.entry.indexOf('scripts/blueprint-preview.js'))
	assert.ok(cursorIndex < manifest.entry.indexOf('scripts/render/blueprint-thumbnail.js'))
	assert.match(source, /const MARKER_WIDTH_CSS = 26/)
	assert.match(source, /const MARKER_HEIGHT_CSS = 39/)
	assert.match(source, /const OUTLINE_WIDTH_CSS = \.75/)
	assert.match(source, /const INNER_SHADOW_WIDTH_CSS = 1\.1/)
	assert.match(source, /const INNER_SHADOW_BLUR_CSS = 2\.4/)
	assert.match(source, /const INNER_SHADOW_OFFSET_Y_CSS = \.8/)
	assert.match(source, /const BLUE_RISE_MS = 180/)
	assert.match(source, /const ORANGE_RISE_MS = 160/)
	assert.match(source, /const COMMIT_DRAIN_MS = 520/)
	assert.match(source, /const RETURN_BLUE_RISE_MS = 520/)
	assert.match(source, /const CANCEL_DRAIN_MS = 120/)
	assert.match(source, /const BLUE = '#5DD3FF'/)
	assert.match(source, /const ORANGE = '#FFA84E'/)
	assert.match(source, /ctx\.fillStyle = '#000000'/)
	assert.match(source, /ctx\.strokeStyle = '#FFFFFF'/)
	assert.match(source, /ctx\.lineWidth = OUTLINE_WIDTH_CSS \* scale/)
	assert.match(source, /ctx\.strokeStyle = INNER_SHADOW_STROKE/)
	assert.match(source, /ctx\.shadowColor = INNER_SHADOW_COLOR/)
	assert.match(source, /ctx\.shadowBlur = INNER_SHADOW_BLUR_CSS \* scale/)
	assert.match(source, /ctx\.shadowOffsetY = INNER_SHADOW_OFFSET_Y_CSS \* scale/)
	assert.match(source, /drawInnerRimShadow\(ctx, scale\)/)
	assert.match(source, /globalCompositeOperation = 'destination-out'/)
	assert.match(source, /ctx\.arc\(point\[0\], point\[1\], CLEAR_RADIUS_CSS \* scale/)
	assert.match(source, /traceOuterMarker\(ctx, scale\)/)
	assert.match(source, /traceInnerMarker\(ctx, scale\)/)
	assert.match(source, /ctx\.moveTo\(0, -5\.7 \* scale\)/)
	assert.match(source, /ctx\.lineTo\(-8\.4 \* scale, -22\.5 \* scale\)/)
	assert.match(source, /ctx\.bezierCurveTo\(-9\.7 \* scale, -32 \* scale, -5\.2 \* scale, -35\.2 \* scale, 0, -35\.2 \* scale\)/)
	assert.match(source, /prefers-reduced-motion: reduce/)
	assert.doesNotMatch(source, /drawMarkerEdges|markerBodyGradient|mixWithWhite/)
	assert.doesNotMatch(source, /api\.patch\(|Game\.prototype|resources\/app\/game\/scripts\/game\.js/)
}

function testEligibilityAndDrawing() {
	const env = createEnvironment()
	env.canvas.dispatch('mouseenter', {})
	assert.equal(env.enabled(), true, JSON.stringify(env.service.snapshot()))
	const ctx = env.draw()
	assert.ok(ctx.operations.some(operation => operation[0] === 'arc' && operation[3] === 14))
	assert.ok(ctx.operations.some(operation => operation[0] === 'translate' && operation[1] === 200 && operation[2] === 150))
	assert.ok(ctx.operations.some(operation => operation[0] === 'fill' && operation[1] === 'destination-out'))
	assert.ok(ctx.operations.some(operation => operation[0] === 'stroke' && operation[1] === '#FFFFFF' && operation[2] === .75))
	assert.ok(ctx.operations.some(operation => operation[0] === 'stroke' && operation[1] === 'rgba(0, 0, 0, .28)' && operation[2] === 1.1))
	assert.ok(ctx.operations.filter(operation => operation[0] === 'bezierCurveTo').length >= 16)
	assert.ok(ctx.operations.filter(operation => operation[0] === 'lineTo').length >= 4)

	env.setBlueprintActive(true)
	assert.equal(env.enabled(), false)
	env.setBlueprintActive(false)
	assert.equal(env.enabled(), true)
	env.setHitId(7)
	assert.equal(env.enabled(), false)
	env.window.dispatch('keydown', { key: 'Control', code: 'ControlLeft' })
	assert.equal(env.enabled(), true)
	env.window.dispatch('keyup', { key: 'Control', code: 'ControlLeft' })
	assert.equal(env.enabled(), false)
	env.setHitId(null)
	env.setHoveredHandle('maxU-maxV')
	assert.equal(env.enabled(), false)
	env.setHoveredHandle(null)
	env.setInteraction({ gestureType: 'pending-move' })
	assert.equal(env.enabled(), false)
	env.setInteraction({ wheelLatched: true })
	assert.equal(env.enabled(), false)
	env.setInteraction({})
	env.selection.emit(baseSelection({
		previewRange: range([3, 4], [5, 6]),
		previewKind: 'move',
		plane: 0,
		lastReason: 'mouse-move-preview'
	}))
	assert.equal(env.enabled(), false)
	env.selection.emit(baseSelection({ lastReason: 'mouse-move-commit' }))
	env.setInputBlocked(true)
	assert.equal(env.enabled(), false)
	env.setInputBlocked(false)
	env.canvas.dispatch('mousedown', { button: 2, buttons: 2 })
	assert.equal(env.enabled(), false)
	env.canvas.dispatch('mouseup', { button: 2, buttons: 0 })
	assert.equal(env.enabled(), true)
	env.canvas.dispatch('mouseleave', {})
	assert.equal(env.enabled(), false)
	env.cleanup()
}

function testSelectionAnimationCycle() {
	const env = createEnvironment()
	env.canvas.dispatch('mouseenter', {})
	env.setClock(10)
	assert.equal(env.enabled(), true)
	let state = env.service.snapshot()
	assert.equal(state.phase, 'blue-rising')
	assert.equal(state.blueLevel, 0)
	env.advance(90)
	state = env.service.snapshot()
	assert.ok(state.blueLevel > 0 && state.blueLevel < .5)
	env.advance(90)
	state = env.service.snapshot()
	assert.equal(state.phase, 'blue-half')
	assert.equal(state.blueLevel, .5)

	env.selection.emit(baseSelection({
		previewRange: range([3, 4]),
		previewKind: 'selection',
		plane: 0,
		lastReason: 'mouse-first-click'
	}))
	state = env.service.snapshot()
	assert.equal(state.phase, 'orange-rising')
	assert.equal(state.blueLevel, .5)
	assert.equal(state.orangeLevel, 0)
	env.advance(80)
	state = env.service.snapshot()
	assert.equal(state.blueLevel, .5)
	assert.ok(state.orangeLevel > 0 && state.orangeLevel < 1)
	env.advance(80)
	state = env.service.snapshot()
	assert.equal(state.phase, 'orange-full')
	assert.equal(state.blueLevel, 0)
	assert.equal(state.orangeLevel, 1)

	env.selection.emit(baseSelection({
		selections: [{ id: 1, range: range([3, 4], [8, 9]), plane: 0, primary: true }],
		primaryId: 1,
		selectionCount: 1,
		selectedRange: range([3, 4], [8, 9]),
		plane: 0,
		lastReason: 'mouse-second-click'
	}))
	env.setHitId(1)
	assert.equal(env.enabled(), true)
	state = env.service.snapshot()
	assert.equal(state.phase, 'orange-draining')
	assert.equal(state.blueLevel, 0)
	assert.equal(state.orangeLevel, 1)
	env.advance(260)
	state = env.service.snapshot()
	assert.ok(state.orangeLevel > 0 && state.orangeLevel < 1)
	env.advance(260)
	state = env.service.snapshot()
	assert.equal(state.phase, 'return-blue-rising')
	assert.equal(state.blueLevel, 0)
	assert.equal(state.orangeLevel, 0)
	env.advance(260)
	state = env.service.snapshot()
	assert.ok(state.blueLevel > 0 && state.blueLevel < .5)
	env.advance(260)
	state = env.service.snapshot()
	assert.equal(state.phase, 'blue-half')
	assert.equal(state.blueLevel, .5)
	assert.equal(env.enabled(), false)
	env.cleanup()
}

function testCancelRestartAndInterruptions() {
	const env = createEnvironment()
	env.canvas.dispatch('mouseenter', {})
	env.setClock(100)
	assert.equal(env.enabled(), true)
	env.advance(180)
	assert.equal(env.service.snapshot().phase, 'blue-half')
	env.selection.emit(baseSelection({
		previewRange: range([1, 1]),
		previewKind: 'selection',
		plane: 0,
		lastReason: 'mouse-first-click'
	}))
	env.advance(80)
	const beforeCancel = env.service.snapshot().orangeLevel
	env.selection.emit(baseSelection({ lastReason: 'hotkey-escape' }))
	assert.equal(env.service.snapshot().phase, 'orange-draining')
	env.advance(60)
	const duringCancel = env.service.snapshot().orangeLevel
	assert.ok(duringCancel > 0 && duringCancel < beforeCancel)
	env.advance(60)
	assert.equal(env.service.snapshot().phase, 'return-blue-rising')
	env.advance(180)
	assert.equal(env.service.snapshot().phase, 'blue-half')

	env.selection.emit(baseSelection({
		previewRange: range([2, 2]),
		previewKind: 'selection',
		plane: 0,
		lastReason: 'mouse-first-click'
	}))
	env.advance(160)
	assert.equal(env.service.snapshot().phase, 'orange-full')
	env.selection.emit(baseSelection({
		selections: [{ id: 2, range: range([2, 2], [4, 4]), plane: 0, primary: true }],
		primaryId: 2,
		selectionCount: 1,
		selectedRange: range([2, 2], [4, 4]),
		plane: 0,
		lastReason: 'mouse-second-click'
	}))
	env.advance(260)
	assert.equal(env.service.snapshot().phase, 'orange-draining')
	env.selection.emit(baseSelection({
		selections: [{ id: 2, range: range([2, 2], [4, 4]), plane: 0, primary: true }],
		primaryId: 2,
		selectionCount: 1,
		selectedRange: range([2, 2], [4, 4]),
		previewRange: range([7, 7]),
		previewKind: 'selection',
		plane: 0,
		lastReason: 'mouse-first-click'
	}))
	let state = env.service.snapshot()
	assert.equal(state.phase, 'orange-rising')
	assert.equal(state.orangeLevel, 0)

	env.setBlueprintActive(true)
	assert.equal(env.enabled(), false)
	state = env.service.snapshot()
	assert.equal(state.phase, 'empty')
	env.cleanup()
}

function testReducedMotionAndCleanup() {
	const env = createEnvironment({ reducedMotion: true })
	env.canvas.dispatch('mouseenter', {})
	const durations = env.service.snapshot().durations
	assert.deepEqual(clone(durations), { blueRise: 50, orangeRise: 50, commitDrain: 50, returnBlueRise: 50, cancelDrain: 50 })
	assert.equal(env.enabled(), true)
	env.advance(50)
	assert.equal(env.service.snapshot().blueLevel, .5)
	env.selection.emit(baseSelection({
		previewRange: range([3, 4]),
		previewKind: 'selection',
		plane: 0,
		lastReason: 'mouse-first-click'
	}))
	env.advance(50)
	assert.equal(env.service.snapshot().orangeLevel, 1)
	assert.ok(env.canvas.listenerCount('mousemove') > 0)
	assert.ok(env.window.listenerCount('keydown') > 0)
	env.cleanup()
	assert.equal(env.service.snapshot().disposed, true)
	assert.equal(env.canvas.listenerCount('mousemove'), 0)
	assert.equal(env.window.listenerCount('keydown'), 0)
	assert.equal(env.render.stopped, true)
	assert.equal(env.sandbox[Symbol.for('cattail.world-editor.selection-cursor')], undefined)
}

testSourceAndManifestContracts()
testEligibilityAndDrawing()
testSelectionAnimationCycle()
testCancelRestartAndInterruptions()
testReducedMotionAndCleanup()

console.log('World Editor selection-cursor verification passed: contour-matched inner cavity, clipped dimensional inner-rim shadow, solid pin tip, vanilla-like white edge, exact hotspot, slow second-point reset, cancellation, priority, reduced motion, and cleanup.')
