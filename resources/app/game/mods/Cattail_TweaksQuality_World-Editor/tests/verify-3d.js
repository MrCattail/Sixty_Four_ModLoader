const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { performance } = require('node:perf_hooks')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHARED_SOURCE = 'scripts/core/shared.js'
const TRANSFORM_SOURCE = 'scripts/core/blueprint-transform.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const CARD_OPACITY_SOURCE = 'scripts/ui/card-opacity.js'
const SELECTION_CARD_SOURCE = 'scripts/ui/selection-card.js'
const SHELL_SOURCE = 'scripts/ui/editor-shell.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const VERIFY_3B_SOURCE = 'tests/verify-3b.js'
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function loadTransform(now = () => 1) {
	const sandbox = {
		console,
		performance: { now },
		ModLoader: {
			register(definition) {
				definition.init()
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	const source = fs.readFileSync(path.join(MOD_ROOT, TRANSFORM_SOURCE), 'utf8')
	vm.runInContext(source, sandbox, { filename: TRANSFORM_SOURCE })
	return sandbox[TRANSFORM_KEY]
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

function loadPreviewHarness() {
	const filename = path.join(MOD_ROOT, VERIFY_3B_SOURCE)
	const source = fs.readFileSync(filename, 'utf8')
	const runMarker = '\nasync function run()'
	const runIndex = source.indexOf(runMarker)
	assert.ok(runIndex > 0)
	const moduleRecord = { exports: {} }
	const instrumented = source.slice(0, runIndex) + `
module.exports = {
	blueprint,
	createMiniDocument,
	createRuntimeEnvironment,
	flushMicrotasks,
	inputEvent,
	record
}
`
	const factory = new Function('require', 'module', 'exports', '__dirname', '__filename', instrumented)
	factory(require, moduleRecord, moduleRecord.exports, path.dirname(filename), filename)
	return moduleRecord.exports
}

function fixture(mode = 'structure') {
	const config = Object.freeze({ fill: 12 })
	const restricted = Object.freeze({ onlyOne: false })
	return Object.freeze({
		schemaVersion: 2,
		mode,
		sourcePlane: 0,
		anchor: Object.freeze({
			position: Object.freeze([20, 30]),
			selectionIds: Object.freeze([1, 2])
		}),
		selections: Object.freeze([
			Object.freeze({
				id: 1,
				primary: true,
				start: Object.freeze([-2, -1]),
				end: Object.freeze([1, 2]),
				min: Object.freeze([-2, -1]),
				max: Object.freeze([1, 2]),
				width: 4,
				height: 4
			}),
			Object.freeze({
				id: 2,
				primary: false,
				start: Object.freeze([4, 0]),
				end: Object.freeze([4, 0]),
				min: Object.freeze([4, 0]),
				max: Object.freeze([4, 0]),
				width: 1,
				height: 1
			})
		]),
		contentBounds: Object.freeze({
			min: Object.freeze([-2, -2]),
			max: Object.freeze([7, 2]),
			width: 10,
			height: 5
		}),
		includeBlocks: mode === 'full',
		entities: Object.freeze([
			Object.freeze({
				kind: 'entity',
				name: 'silo',
				position: Object.freeze([-1, 0]),
				footprint: Object.freeze({
					span: 0,
					min: Object.freeze([-1, 0]),
					max: Object.freeze([-1, 0])
				}),
				restricted,
				config,
				...(mode === 'full' ? { state: Object.freeze({ fill: 99 }) } : {})
			}),
			Object.freeze({
				kind: 'entity',
				name: 'strange1',
				position: Object.freeze([2, 1]),
				footprint: Object.freeze({
					span: 1,
					min: Object.freeze([1, 0]),
					max: Object.freeze([3, 2])
				}),
				restricted,
				config
			})
		]),
		blocks: Object.freeze(mode === 'full' ? [
			Object.freeze({
				kind: 'cube',
				name: 'cube',
				position: Object.freeze([7, -2]),
				state: Object.freeze({ amount: 1 })
			})
		] : []),
		summary: Object.freeze({
			selectionCount: 2,
			selectedCellCount: 17,
			entityCount: 2,
			blockCount: mode === 'full' ? 1 : 0,
			crossBoundaryCount: 1,
			skippedCount: 1,
			capturedTypes: Object.freeze([
				Object.freeze({ name: 'cube', reason: 'captured', count: mode === 'full' ? 1 : 0 }),
				Object.freeze({ name: 'silo', reason: 'captured', count: 1 }),
				Object.freeze({ name: 'strange1', reason: 'captured', count: 1 })
			]),
			skippedTypes: Object.freeze([
				Object.freeze({ name: 'cube', reason: 'unstable', count: 1 })
			])
		})
	})
}

function testPivotAndOrderedMatrixState() {
	const transform = loadTransform()
	const source = fixture()
	assert.equal(transform.bind(source, 'test-bind'), true)
	assert.deepEqual(plain(transform.snapshot().pivot), [1, 1])
	assert.equal(transform.snapshot().blueprint, source)

	assert.equal(transform.mirrorU('test-u'), true)
	assert.equal(transform.snapshot().mirrorU, true)
	assert.equal(transform.snapshot().mirrorV, false)
	assert.deepEqual(plain(transform.snapshot().blueprint.entities[0].position), [-1, 2])

	assert.equal(transform.rotateClockwise('test-cw'), true)
	let state = transform.snapshot()
	assert.equal(state.rotation, 90)
	assert.equal(state.mirrorU, false)
	assert.equal(state.mirrorV, true)
	assert.deepEqual(plain(state.matrix), [0, 1, 1, 0])
	assert.deepEqual(plain(state.blueprint.entities[0].position), [0, -1])

	assert.equal(transform.mirrorU('test-u-again'), true)
	state = transform.snapshot()
	assert.equal(state.rotation, 90)
	assert.equal(state.mirrorU, true)
	assert.equal(state.mirrorV, true)
	assert.deepEqual(plain(state.matrix), [0, 1, -1, 0])
	assert.deepEqual(plain(state.blueprint.entities[0].position), [0, 3])
}

function testExhaustiveOrderedCommands() {
	const transform = loadTransform()
	const operations = [
		{ method: 'rotateClockwise', matrix: [0, -1, 1, 0] },
		{ method: 'rotateCounterclockwise', matrix: [0, 1, -1, 0] },
		{ method: 'mirrorU', matrix: [1, 0, 0, -1] },
		{ method: 'mirrorV', matrix: [-1, 0, 0, 1] }
	]
	const sequences = [[]]
	for (let length = 1; length <= 4; length += 1) {
		const previous = sequences.filter(sequence => sequence.length === length - 1)
		for (const sequence of previous) {
			for (const operation of operations) sequences.push(sequence.concat(operation))
		}
	}

	for (const sequence of sequences) {
		transform.bind(fixture())
		let expected = [1, 0, 0, 1]
		for (const operation of sequence) {
			transform[operation.method]()
			expected = multiplyMatrix(operation.matrix, expected)
		}
		assert.deepEqual(
			plain(transform.snapshot().matrix),
			expected,
			sequence.map(operation => operation.method).join(' -> ') || 'identity'
		)
	}
}

function multiplyMatrix(left, right) {
	return [
		left[0] * right[0] + left[1] * right[2],
		left[0] * right[1] + left[1] * right[3],
		left[2] * right[0] + left[3] * right[2],
		left[2] * right[1] + left[3] * right[3]
	].map(value => Object.is(value, -0) ? 0 : value)
}

function testRestorationAndBounds() {
	const transform = loadTransform()
	const source = fixture()
	transform.bind(source)
	for (let index = 0; index < 4; index += 1) transform.rotateClockwise()
	assert.equal(transform.snapshot().identity, true)
	assert.equal(transform.snapshot().blueprint, source)

	transform.mirrorV()
	const mirrored = transform.snapshot().blueprint
	assert.deepEqual(plain(mirrored.selections[0]), {
		id: 1,
		primary: true,
		start: [4, -1],
		end: [1, 2],
		min: [1, -1],
		max: [4, 2],
		width: 4,
		height: 4
	})
	assert.deepEqual(plain(mirrored.contentBounds), {
		min: [-5, -2],
		max: [4, 2],
		width: 10,
		height: 5
	})
	transform.mirrorV()
	assert.equal(transform.snapshot().identity, true)
	assert.equal(transform.snapshot().blueprint, source)

	transform.rotateCounterclockwise()
	assert.equal(transform.snapshot().rotation, 270)
	assert.deepEqual(plain(transform.snapshot().blueprint.entities[1].footprint), {
		span: 1,
		min: [0, -1],
		max: [2, 1]
	})
	transform.reset()
	assert.equal(transform.snapshot().identity, true)
	assert.equal(transform.reset(), false)
}

function testFullProjectionAndSourceImmutability() {
	const transform = loadTransform()
	const source = fixture('full')
	const before = JSON.stringify(source)
	transform.bind(source)
	let state = transform.snapshot()
	assert.equal(state.source, source)
	assert.equal(state.sourceMode, 'full')
	assert.equal(state.projected, true)
	assert.equal(state.blueprint.mode, 'structure')
	assert.equal(state.blueprint.includeBlocks, false)
	assert.deepEqual(plain(state.blueprint.blocks), [])
	assert.equal(Object.hasOwn(state.blueprint.entities[0], 'state'), false)
	assert.equal(state.blueprint.entities[0].config, source.entities[0].config)
	assert.equal(state.blueprint.entities[0].restricted, source.entities[0].restricted)
	assert.deepEqual(plain(state.blueprint.contentBounds), {
		min: [-1, 0],
		max: [3, 2],
		width: 5,
		height: 3
	})
	assert.deepEqual(plain(state.blueprint.summary.capturedTypes), [
		{ name: 'silo', reason: 'captured', count: 1 },
		{ name: 'strange1', reason: 'captured', count: 1 }
	])
	assert.equal(state.blueprint.summary.blockCount, 0)
	assert.equal(state.blueprint.summary.skippedCount, 0)
	assert.equal(JSON.stringify(source), before)

	transform.rotateClockwise()
	state = transform.snapshot()
	assert.equal(JSON.stringify(source), before)
	assert.deepEqual(plain(source.anchor.position), [20, 30])
	assert.equal(Object.isFrozen(state.blueprint), true)
	assert.equal(Object.isFrozen(state.blueprint.entities), true)
	assert.equal(Object.isFrozen(state.blueprint.entities[0].footprint), true)
}

function testEmptyProjectionAndLifecycle() {
	const transform = loadTransform()
	const source = Object.freeze(Object.assign({}, fixture('full'), {
		entities: Object.freeze([])
	}))
	let notifications = 0
	const stop = transform.subscribe(function () {
		notifications += 1
	})
	assert.equal(transform.bind(source), true)
	assert.equal(transform.snapshot().source, source)
	assert.equal(transform.snapshot().blueprint, null)
	assert.equal(transform.rotateClockwise(), false)
	assert.equal(transform.clear(), true)
	assert.equal(transform.snapshot().source, null)
	assert.equal(notifications, 3)
	stop()
	assert.equal(transform.dispose(), true)
	assert.equal(transform.dispose(), false)
}

function testCommandScaleAndSingleNotification() {
	const transform = loadTransform(() => performance.now())
	const base = fixture()
	const entities = Object.freeze(Array.from({ length: 256 }, function (_, index) {
		const u = index % 16
		const v = Math.floor(index / 16)
		return Object.freeze({
			kind: 'entity',
			name: index % 2 ? 'silo' : 'strange1',
			position: Object.freeze([u, v]),
			footprint: Object.freeze({
				span: 0,
				min: Object.freeze([u, v]),
				max: Object.freeze([u, v])
			}),
			restricted: base.entities[0].restricted,
			config: base.entities[0].config
		})
	}))
	const source = Object.freeze(Object.assign({}, base, {
		entities,
		contentBounds: Object.freeze({
			min: Object.freeze([0, 0]),
			max: Object.freeze([15, 15]),
			width: 16,
			height: 16
		})
	}))
	const before = JSON.stringify(source)
	let notifications = 0
	const stop = transform.subscribe(function () {
		notifications += 1
	})
	assert.equal(notifications, 1)
	assert.equal(transform.bind(source), true)
	assert.equal(notifications, 2)
	assert.equal(transform.rotateClockwise(), true)
	assert.equal(notifications, 3)
	assert.equal(transform.snapshot().blueprint.entities.length, 256)
	assert.equal(transform.snapshot().performance.transformCount, 1)
	assert.ok(Number.isFinite(transform.snapshot().performance.lastTransformMs))
	assert.ok(Number.isFinite(transform.snapshot().performance.maxTransformMs))
	assert.equal(JSON.stringify(source), before)
	stop()
}

async function testCameraTranslationCache() {
	const harness = loadPreviewHarness()
	const env = harness.createRuntimeEnvironment()
	let cameraX = 0
	let cameraY = 0
	let projectionScale = 1
	let layerRectWidth = 800
	let layerRectHeight = 600
	let layerRectReads = 0
	const styleValues = {
		transformOrigin: '',
		transform: '',
		filter: '',
		opacity: '',
		transition: '',
		willChange: ''
	}
	const styleWrites = new Map()
	env.context.canvas.style = new Proxy(styleValues, {
		set(target, property, value) {
			styleWrites.set(property, (styleWrites.get(property) || 0) + 1)
			target[property] = value
			return true
		}
	})
	env.context.canvas.getBoundingClientRect = function () {
		layerRectReads += 1
		return { left: 0, top: 0, width: layerRectWidth, height: layerRectHeight }
	}
	env.game.uvToXY = function (position) {
		return [
			position[0] * 12 * projectionScale + cameraX,
			position[1] * 6 * projectionScale + cameraY
		]
	}
	const records = Array.from({ length: 256 }, function (_, index) {
		return harness.record(index + 1, index % 2 ? 'silo' : 'pump', [
			index % 16,
			Math.floor(index / 16)
		])
	})
	const source = harness.blueprint(records, { schemaVersion: 2 })
	env.session.set({
		attemptId: 1,
		blueprint: source,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await harness.flushMicrotasks()
	assert.equal(env.controller.snapshot().active, true)
	assert.equal(env.runFrame(), true)
	assert.equal(layerRectReads, 1)
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '1')
	assert.equal(env.context.canvas.style.transition, 'opacity 80ms linear')
	assert.equal(env.context.canvas.style.willChange, 'transform')
	assert.equal(env.window.listenerCount('resize'), 1)

	const writesAfterRender = Object.fromEntries(styleWrites)
	for (let frame = 0; frame < 8; frame += 1) assert.equal(env.runFrame(), false)
	assert.deepEqual(Object.fromEntries(styleWrites), writesAfterRender)
	assert.equal(layerRectReads, 1)

	const beforePan = env.controller.snapshot().performance
	const dirtyBeforePan = env.getLayer().dirtyMarks
	const rightDown = harness.inputEvent(2)
	env.canvas.dispatch('mousedown', rightDown)
	assert.equal(rightDown.prevented, false)
	assert.equal(rightDown.stopped, false)

	for (let frame = 0; frame < 24; frame += 1) {
		cameraX += 4
		cameraY -= 2
		assert.equal(env.runFrame(), false)
	}
	const duringPan = env.controller.snapshot().performance
	assert.equal(duringPan.planRequests, beforePan.planRequests)
	assert.equal(duringPan.planCompletions, beforePan.planCompletions)
	assert.equal(duringPan.layerDirtyMarks, beforePan.layerDirtyMarks)
	assert.equal(duringPan.layerRedraws, beforePan.layerRedraws)
	assert.equal(duringPan.resourceRebuilds, beforePan.resourceRebuilds)
	assert.equal(env.getLayer().dirtyMarks, dirtyBeforePan)
	assert.equal(env.context.canvas.style.transform, 'translate3d(96px, -48px, 0)')
	assert.equal(env.context.canvas.style.filter, '')
	assert.equal(env.context.canvas.style.opacity, '1')
	assert.equal(env.context.canvas.style.transition, 'opacity 80ms linear')
	assert.equal(env.context.canvas.style.willChange, 'transform')
	assert.equal(layerRectReads, 1)
	for (const property of ['transformOrigin', 'filter', 'opacity', 'transition', 'willChange']) {
		assert.equal(styleWrites.get(property) || 0, writesAfterRender[property] || 0)
	}

	layerRectWidth = 400
	layerRectHeight = 300
	env.window.dispatch('resize', {})
	assert.equal(layerRectReads, 2)
	assert.equal(env.runFrame(), false)
	assert.equal(env.context.canvas.style.transform, 'translate3d(48px, -24px, 0)')

	env.window.dispatch('mouseup', harness.inputEvent(2))
	assert.equal(env.getLayer().dirty, true)
	assert.equal(env.getLayer().dirtyMarks, dirtyBeforePan + 1)
	assert.equal(env.runFrame(), true)
	assert.equal(layerRectReads, 3)
	const afterPan = env.controller.snapshot().performance
	assert.equal(afterPan.planRequests, beforePan.planRequests)
	assert.equal(afterPan.layerRedraws, beforePan.layerRedraws + 1)
	assert.equal(afterPan.resourceRebuilds, beforePan.resourceRebuilds)
	assert.equal(env.context.canvas.style.transform, '')

	const dirtyBeforeProjectionChange = env.getLayer().dirtyMarks
	projectionScale = 1.25
	assert.equal(env.runFrame(), false)
	assert.equal(env.getLayer().dirty, true)
	assert.equal(env.getLayer().dirtyMarks, dirtyBeforeProjectionChange + 1)
	assert.equal(layerRectReads, 3)
	assert.equal(env.runFrame(), true)
	assert.equal(layerRectReads, 4)
	assert.equal(
		env.controller.snapshot().performance.layerRedraws,
		afterPan.layerRedraws + 1
	)
	env.runtime.runCleanups()
	assert.equal(env.window.listenerCount('resize'), 0)
	assert.equal(env.context.canvas.style.willChange, '')
}

async function testIntegrityMetrics() {
	const harness = loadPreviewHarness()
	const env = harness.createRuntimeEnvironment()
	const records = Array.from({ length: 256 }, function (_, index) {
		return harness.record(index + 1, index % 2 ? 'silo' : 'pump', [
			index % 16,
			Math.floor(index / 16)
		])
	})
	env.session.set({
		attemptId: 1,
		blueprint: harness.blueprint(records, { schemaVersion: 2 }),
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await harness.flushMicrotasks()
	assert.equal(env.runFrame(), true)

	let timingNow = 0
	env.sandbox.performance.now = function () {
		timingNow += .25
		return timingNow
	}

	env.advanceTime(500)
	let current = env.controller.snapshot()
	assert.equal(current.pinned, false)
	assert.equal(current.performance.integrityIntervalMs, 500)
	assert.equal(current.performance.integrityChecks, 0)
	assert.equal(current.performance.integrityGuardCells, 0)
	assert.equal(current.performance.integrityGuardCellChecks, 0)
	assert.equal(current.performance.integrityRefreshes, 0)

	assert.equal(env.controller.setPinned(true, 'integrity-metrics'), true)
	env.advanceTime(500)
	current = env.controller.snapshot()
	assert.equal(current.performance.integrityChecks, 1)
	assert.equal(current.performance.integrityGuardCells, 256)
	assert.equal(current.performance.integrityGuardCellChecks, 256)
	assert.equal(current.performance.lastIntegrityMs, .25)
	assert.equal(current.performance.maxIntegrityMs, .25)
	assert.equal(current.performance.integrityRefreshes, 0)
	assert.equal(current.performance.resourceRefreshes, 0)
	assert.equal(current.performance.lastIntegrityReason, 'valid')

	const planBeforeResources = current.plan
	const planRequestsBeforeResources = current.performance.planRequests
	const dirtyMarksBeforeResources = current.performance.layerDirtyMarks
	const redrawsBeforeResources = current.performance.layerRedraws
	env.game.resources[0] += 5
	env.advanceTime(500)
	current = env.controller.snapshot()
	assert.equal(current.performance.integrityChecks, 2)
	assert.equal(current.performance.integrityGuardCells, 256)
	assert.equal(current.performance.integrityGuardCellChecks, 512)
	assert.equal(current.performance.integrityRefreshes, 0)
	assert.equal(current.performance.resourceRefreshes, 1)
	assert.equal(current.performance.lastIntegrityReason, 'resources')
	assert.equal(current.performance.planRequests, planRequestsBeforeResources)
	assert.equal(current.performance.layerDirtyMarks, dirtyMarksBeforeResources)
	assert.equal(current.performance.layerRedraws, redrawsBeforeResources)
	assert.notEqual(current.plan, planBeforeResources)
	assert.equal(current.plan.records, planBeforeResources.records)
	assert.deepEqual(plain(current.plan.guard.resources), [1005, 1000])
	assert.deepEqual(plain(current.plan.cost.owned), [1005, 1000])
	assert.equal(env.runFrame(), false)

	const guardedPosition = current.plan.guard.cells[0].position
	env.game.setCell(guardedPosition[0], guardedPosition[1], {
		name: 'pump',
		position: guardedPosition.slice()
	})
	const planRequestsBeforeChange = current.performance.planRequests
	env.advanceTime(500)
	current = env.controller.snapshot()
	assert.equal(current.performance.integrityChecks, 3)
	assert.equal(current.performance.integrityGuardCells, 256)
	assert.equal(current.performance.integrityGuardCellChecks, 768)
	assert.equal(current.performance.lastIntegrityMs, .25)
	assert.equal(current.performance.maxIntegrityMs, .25)
	assert.equal(current.performance.integrityRefreshes, 1)
	assert.equal(current.performance.resourceRefreshes, 1)
	assert.equal(current.performance.lastIntegrityReason, 'cells')
	assert.equal(current.performance.planRequests, planRequestsBeforeChange + 1)

	env.runtime.runCleanups()
}

async function testRotationTransitionOverlay() {
	const harness = loadPreviewHarness()
	const document = harness.createMiniDocument()
	let copiedFrames = 0
	let animationRecord = null
	const createElement = document.createElement
	document.createElement = function (tagName) {
		const element = createElement(tagName)
		if (String(tagName).toLowerCase() === 'canvas') {
			element.getContext = function () {
				return {
					drawImage() {
						copiedFrames += 1
					}
				}
			}
			element.animate = function (keyframes, options) {
				animationRecord = { keyframes, options, cancelled: false }
				return {
					cancel() {
						animationRecord.cancelled = true
					}
				}
			}
		}
		return element
	}
	let transformState = {
		source: null,
		blueprint: null,
		sourceRevision: 0,
		revision: 0,
		rotation: 0,
		quarterTurns: 0,
		pivot: [0, 0],
		lastCommand: 'initial'
	}
	const transformListeners = new Set()
	const transform = {
		snapshot() {
			return transformState
		},
		subscribe(listener) {
			transformListeners.add(listener)
			listener(transformState)
			return function () {
				transformListeners.delete(listener)
			}
		},
		set(next) {
			transformState = next
			for (const listener of Array.from(transformListeners)) listener(transformState)
		}
	}
	const env = harness.createRuntimeEnvironment({ document, transform })
	const source = harness.blueprint([harness.record(1, 'silo', [0, 0])], { schemaVersion: 2 })
	env.session.set({
		attemptId: 1,
		blueprint: source,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	transform.set({
		source,
		blueprint: source,
		sourceRevision: 1,
		revision: 1,
		rotation: 0,
		quarterTurns: 0,
		pivot: [0, 0],
		lastCommand: 'bind'
	})
	await harness.flushMicrotasks()
	assert.equal(env.runFrame(), true)
	assert.equal(env.controller.setPinned(true, 'rotation-transition-test'), true)

	const rotated = harness.blueprint([harness.record(1, 'silo', [0, 0])], { schemaVersion: 2 })
	transform.set({
		source,
		blueprint: rotated,
		sourceRevision: 1,
		revision: 2,
		rotation: 90,
		quarterTurns: 1,
		pivot: [0, 0],
		lastCommand: 'rotate-clockwise'
	})
	const overlayId = 'cattail-world-editor-blueprint-rotation-transition'
	let overlay = document.getElementById(overlayId)
	assert.ok(overlay)
	assert.equal(copiedFrames, 1)
	assert.equal(overlay.style.zIndex, '40')
	assert.equal(overlay.style.opacity, '1')
	assert.equal(overlay.dataset.targetTransform, 'matrix(0, 0.5, -2, 0, 0, 0)')

	await harness.flushMicrotasks()
	assert.equal(env.runFrame(), true)
	env.advanceTime(0)
	overlay = document.getElementById(overlayId)
	assert.ok(overlay)
	assert.ok(animationRecord)
	assert.equal(animationRecord.options.duration, 160)
	assert.equal(animationRecord.options.easing, 'linear')
	assert.equal(animationRecord.options.fill, 'forwards')
	assert.equal(animationRecord.keyframes.length, 9)
	assert.equal(animationRecord.keyframes[0].transform, 'matrix(1, 0, 0, 1, 0, 0)')
	assert.equal(animationRecord.keyframes[4].transform, 'matrix(0.707, 0.354, -1.414, 0.707, 0, 0)')
	assert.equal(animationRecord.keyframes[8].transform, 'matrix(0, 0.5, -2, 0, 0, 0)')
	assert.equal(animationRecord.keyframes[8].opacity, '0')
	env.advanceTime(200)
	assert.equal(document.getElementById(overlayId), null)
	assert.equal(animationRecord.cancelled, true)

	env.runtime.runCleanups()
}

async function testTransformGuideLayerIsolation() {
	const harness = loadPreviewHarness()
	const env = harness.createRuntimeEnvironment()
	const source = harness.blueprint([harness.record(1, 'silo', [0, 0])], { schemaVersion: 2 })
	env.session.set({
		attemptId: 1,
		blueprint: source,
		lastResult: { attemptId: 1, status: 'captured' }
	})
	await harness.flushMicrotasks()
	assert.equal(env.runFrame(), true)
	const previewRedraws = env.controller.snapshot().performance.layerRedraws
	const renderCalls = env.game.renderCalls
	const previewDirtyMarks = env.getLayer().dirtyMarks
	const guide = env.getLayer('world-editor-blueprint-transform-guide')
	assert.equal(env.controller.setTransformGuide('mirror-u', 'guide-test'), true)
	assert.equal(env.controller.snapshot().guideAction, 'mirror-u')
	assert.equal(guide.dirty, true)
	assert.equal(env.getLayer().dirtyMarks, previewDirtyMarks)
	assert.equal(env.runFrame(), true)
	assert.equal(env.game.renderCalls, renderCalls)
	assert.equal(env.controller.snapshot().performance.layerRedraws, previewRedraws)
	env.advanceTime(0)
	assert.equal(env.context.canvas.style.opacity, '1')
	assert.equal(env.controller.setTransformGuide(null, 'guide-test-hide'), true)
	assert.equal(env.context.canvas.style.opacity, '0')
	assert.equal(guide.dirty, true)
	env.runtime.runCleanups()
}

function testCardOpacityController() {
	const listeners = new Map()
	const window = {
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(listener)
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener)
		},
		dispatch(type, event) {
			for (const listener of Array.from(listeners.get(type) || [])) listener(event)
		}
	}
	const elements = new Map()
	const document = {
		head: {
			append(element) {
				if (element.id) elements.set(element.id, element)
				element.isConnected = true
			}
		},
		getElementById(id) {
			return elements.get(id) || null
		},
		createElement() {
			return { id: '', textContent: '', isConnected: false }
		}
	}
	const storedValues = new Map()
	const localStorage = {
		throwing: false,
		getItem(key) {
			if (this.throwing) throw new Error('storage unavailable')
			return storedValues.has(String(key)) ? storedValues.get(String(key)) : null
		},
		setItem(key, value) {
			if (this.throwing) throw new Error('storage unavailable')
			storedValues.set(String(key), String(value))
		}
	}
	const sandbox = {
		console,
		document,
		localStorage,
		window,
		ModLoader: {
			register(definition) {
				definition.init()
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	const opacitySource = fs.readFileSync(path.join(MOD_ROOT, CARD_OPACITY_SOURCE), 'utf8')
	const loadController = function () {
		vm.runInContext(opacitySource, sandbox, { filename: CARD_OPACITY_SOURCE })
		return vm.runInContext(
			"globalThis[Symbol.for('cattail.world-editor.card-opacity')]",
			sandbox
		)
	}
	const controller = loadController()
	assert.ok(controller)
	assert.equal(controller.min, .25)
	assert.equal(controller.max, 1)
	assert.equal(controller.step, .1)

	function card(id, left, right) {
		const style = {
			setProperty(name, value) {
				this[name] = String(value)
			},
			removeProperty(name) {
				delete this[name]
			}
		}
		return {
			id,
			isConnected: true,
			dataset: { visible: 'true', positionVisible: 'true' },
			style,
			getAttribute(name) {
				return name === 'aria-hidden' ? 'false' : null
			},
			getBoundingClientRect() {
				return { left, right, top: 0, bottom: 100, width: right - left, height: 100 }
			}
		}
	}

	function hint() {
		return {
			dataset: {},
			attributes: {},
			setAttribute(name, value) {
				this.attributes[name] = String(value)
			}
		}
	}

	function event(overrides) {
		return Object.assign({
			clientX: 75,
			clientY: 50,
			defaultPrevented: false,
			propagationStopped: false,
			immediatePropagationStopped: false,
			preventDefault() {
				this.defaultPrevented = true
			},
			stopPropagation() {
				this.propagationStopped = true
			},
			stopImmediatePropagation() {
				this.immediatePropagationStopped = true
			}
		}, overrides)
	}

	const selection = card('selection', 0, 100)
	const blueprint = card('blueprint', 50, 150)
	const blueprintProduction = card('blueprint-production', 150, 250)
	const selectionHint = hint()
	const blueprintHint = hint()
	const blueprintProductionHint = hint()
	const selectionControls = controller.register({
		id: 'selection',
		group: 'selection-production',
		element: selection,
		hint: selectionHint,
		priority: 47,
		getText(state) {
			return {
				instruction: 'adjust',
				mode: state.contentIndependent ? 'visible' : 'linked'
			}
		}
	})
	const blueprintControls = controller.register({
		id: 'blueprint',
		group: 'blueprint-production',
		element: blueprint,
		hint: blueprintHint,
		priority: 48,
		getText(state) {
			return {
				instruction: 'adjust',
				mode: state.contentIndependent ? 'visible' : 'linked'
			}
		}
	})
	const blueprintProductionControls = controller.register({
		id: 'blueprint-production',
		group: 'blueprint-production',
		element: blueprintProduction,
		hint: blueprintProductionHint,
		priority: 49,
		getText(state) {
			return {
				instruction: 'adjust',
				mode: state.contentIndependent ? 'visible' : 'linked'
			}
		}
	})

	window.dispatch('keydown', event({ key: 'z' }))
	const pathTarget = {}
	const pathWheel = event({
		deltaY: 100,
		target: pathTarget,
		composedPath() {
			return [pathTarget, selection, window]
		}
	})
	window.dispatch('wheel', pathWheel)
	assert.equal(pathWheel.defaultPrevented, true)
	assert.equal(selectionControls.snapshot().opacity, .9)
	assert.equal(storedValues.get('cattailWorldEditorSelectionCardOpacity'), '0.9')
	assert.equal(blueprintControls.snapshot().opacity, 1)
	window.dispatch('wheel', event({
		deltaY: -100,
		target: pathTarget,
		composedPath() {
			return [pathTarget, selection, window]
		}
	}))
	assert.equal(selectionControls.snapshot().opacity, 1)
	assert.equal(storedValues.get('cattailWorldEditorSelectionCardOpacity'), '1')

	const firstWheel = event({ deltaY: 100 })
	window.dispatch('wheel', firstWheel)
	assert.equal(firstWheel.defaultPrevented, true)
	assert.equal(blueprintControls.snapshot().opacity, .9)
	assert.equal(blueprintProductionControls.snapshot().opacity, .9)
	assert.equal(selectionControls.snapshot().opacity, 1)
	assert.equal(storedValues.get('cattailWorldEditorBlueprintCardOpacity'), '0.9')

	for (let index = 0; index < 10; index++) window.dispatch('wheel', event({ deltaY: 100 }))
	assert.equal(blueprintControls.snapshot().opacity, .25)
	assert.equal(blueprintProductionControls.snapshot().opacity, .25)
	assert.equal(storedValues.get('cattailWorldEditorBlueprintCardOpacity'), '0.25')
	const middle = event({ button: 1 })
	window.dispatch('mousedown', middle)
	assert.equal(middle.defaultPrevented, true)
	assert.equal(blueprintControls.snapshot().contentIndependent, true)
	assert.equal(blueprintProductionControls.snapshot().contentIndependent, true)
	assert.equal(storedValues.get('cattailWorldEditorBlueprintCardOpaqueInfo'), '1')
	assert.equal(blueprint.style['--world-editor-card-shell-opacity'], '0')
	assert.equal(blueprint.style['--world-editor-card-shell-percent'], '0%')
	assert.equal(blueprint.style['--world-editor-card-shell-blur-14'], '0px')
	assert.equal(blueprint.style['--world-editor-card-shell-saturate'], '1')
	assert.equal(blueprintProduction.style['--world-editor-card-shell-opacity'], '0')
	assert.equal(blueprintHint.dataset.contentIndependent, 'true')
	assert.equal(blueprintProductionHint.dataset.contentIndependent, 'true')
	assert.match(blueprintHint.attributes['aria-label'], /adjust visible/)
	window.dispatch('auxclick', event({ button: 1 }))
	assert.equal(blueprintControls.snapshot().contentIndependent, true)

	window.dispatch('mousedown', event({ button: 1, clientX: 25 }))
	assert.equal(selectionControls.snapshot().contentIndependent, true)
	assert.equal(storedValues.get('cattailWorldEditorSelectionCardOpaqueInfo'), '1')
	assert.equal(blueprintControls.snapshot().contentIndependent, true)
	assert.equal(blueprintProductionControls.snapshot().contentIndependent, true)
	window.dispatch('keyup', event({ key: 'z' }))
	const releasedWheel = event({ deltaY: -100, clientX: 25 })
	window.dispatch('wheel', releasedWheel)
	assert.equal(releasedWheel.defaultPrevented, false)
	assert.equal(selectionControls.snapshot().opacity, 1)

	selectionControls.release()
	blueprintControls.release()
	blueprintProductionControls.release()
	assert.equal(controller.snapshot().length, 0)
	controller.dispose()

	const restoredController = loadController()
	const restoredSelectionControls = restoredController.register({
		id: 'selection-restored',
		group: 'selection-production',
		element: card('selection-restored', 0, 100),
		hint: hint()
	})
	const restoredBlueprintControls = restoredController.register({
		id: 'blueprint-restored',
		group: 'blueprint-production',
		element: card('blueprint-restored', 100, 200),
		hint: hint()
	})
	assert.equal(restoredSelectionControls.snapshot().opacity, 1)
	assert.equal(restoredSelectionControls.snapshot().contentIndependent, true)
	assert.equal(restoredBlueprintControls.snapshot().opacity, .25)
	assert.equal(restoredBlueprintControls.snapshot().contentIndependent, true)
	restoredSelectionControls.release()
	restoredBlueprintControls.release()
	restoredController.dispose()

	storedValues.set('cattailWorldEditorSelectionCardOpacity', 'broken')
	storedValues.set('cattailWorldEditorSelectionCardOpaqueInfo', 'unexpected')
	storedValues.set('cattailWorldEditorBlueprintCardOpacity', '-7')
	storedValues.set('cattailWorldEditorBlueprintCardOpaqueInfo', '0')
	const fallbackController = loadController()
	const fallbackSelectionControls = fallbackController.register({
		id: 'selection-fallback',
		group: 'selection-production',
		element: card('selection-fallback', 0, 100),
		hint: hint()
	})
	const fallbackBlueprintControls = fallbackController.register({
		id: 'blueprint-fallback',
		group: 'blueprint-production',
		element: card('blueprint-fallback', 100, 200),
		hint: hint()
	})
	assert.equal(fallbackSelectionControls.snapshot().opacity, 1)
	assert.equal(fallbackSelectionControls.snapshot().contentIndependent, false)
	assert.equal(fallbackBlueprintControls.snapshot().opacity, .25)
	assert.equal(fallbackBlueprintControls.snapshot().contentIndependent, false)
	fallbackSelectionControls.release()
	fallbackBlueprintControls.release()
	fallbackController.dispose()

	localStorage.throwing = true
	const unavailableController = loadController()
	const unavailableControls = unavailableController.register({
		id: 'selection-unavailable',
		group: 'selection-production',
		element: card('selection-unavailable', 0, 100),
		hint: hint()
	})
	assert.equal(unavailableControls.snapshot().opacity, 1)
	assert.equal(unavailableControls.snapshot().contentIndependent, false)
	unavailableControls.release()
	unavailableController.dispose()
	localStorage.throwing = false
}

function testSharedEditorServices() {
	const listeners = new Map()
	const window = {
		innerHeight: 1000,
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(listener)
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener)
		},
		dispatch(type, event) {
			for (const listener of Array.from(listeners.get(type) || [])) listener(event)
		}
	}
	const elements = new Map()
	const document = {
		activeElement: null,
		head: {
			append(element) {
				if (element.id) elements.set(element.id, element)
				element.isConnected = true
			}
		},
		createElement() {
			return {
				id: '',
				textContent: '',
				isConnected: false,
				remove() {
					elements.delete(this.id)
					this.isConnected = false
				}
			}
		},
		getElementById(id) {
			return elements.get(id) || null
		}
	}
	const sandbox = {
		console,
		document,
		window,
		ModLoader: {
			register(definition) {
				definition.init()
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(
		fs.readFileSync(path.join(MOD_ROOT, SHARED_SOURCE), 'utf8'),
		sandbox,
		{ filename: SHARED_SOURCE }
	)
	const shared = vm.runInContext(
		"globalThis[Symbol.for('cattail.world-editor.shared')]",
		sandbox
	)
	assert.ok(shared)

	const unitControl = {
		nodeType: 1,
		closest(selector) {
			return selector.includes('[data-world-editor-card-control]') ? this : null
		}
	}
	assert.equal(shared.isCardControlEvent({
		target: unitControl,
		composedPath() {
			return [unitControl]
		}
	}), true)
	assert.equal(shared.isCardControlEvent({
		target: {
			nodeType: 1,
			closest() {
				return null
			}
		}
	}), false)

	const iconGame = {
		codex: {
			entities: {
				custom: { shopImage: 'mods/custom/icon.png' },
				scan: { isDark: true },
				silo: {}
			}
		}
	}
	assert.equal(shared.resolveEntityIcon(iconGame, 'custom'), 'mods/custom/icon.png')
	assert.equal(shared.resolveEntityIcon(iconGame, 'stabilizer3'), 'img/stabilizer3.png')
	assert.equal(shared.resolveEntityIcon(iconGame, 'surge'), '')
	assert.equal(shared.resolveEntityIcon(iconGame, 'scan'), 'img/shop/scan_dark.jpg')
	assert.equal(shared.resolveEntityIcon(iconGame, 'silo'), 'img/shop/silo.jpg')

	const canvas = {}
	const game = { canvas }
	const firstCard = { dataset: {} }
	const secondCard = { dataset: {} }
	const firstControls = shared.registerWorldDragCard(game, firstCard)
	const secondControls = shared.registerWorldDragCard(game, secondCard)
	window.dispatch('mousedown', { button: 2, target: canvas })
	assert.equal(firstCard.dataset.worldDragPassThrough, 'true')
	assert.equal(secondCard.dataset.worldDragPassThrough, 'true')
	window.dispatch('mouseup', { button: 2 })
	assert.equal(firstCard.dataset.worldDragPassThrough, 'false')
	assert.equal(secondCard.dataset.worldDragPassThrough, 'false')
	firstControls.release()
	secondControls.release()
	assert.equal('worldDragPassThrough' in firstCard.dataset, false)
	assert.equal('worldDragPassThrough' in secondCard.dataset, false)

	function interactiveElement(edge) {
		const eventListeners = new Map()
		return {
			dataset: edge ? { edge } : {},
			attributes: {},
			style: {
				setProperty(name, value) {
					this[name] = value
				}
			},
			addEventListener(type, listener) {
				if (!eventListeners.has(type)) eventListeners.set(type, new Set())
				eventListeners.get(type).add(listener)
			},
			removeEventListener(type, listener) {
				eventListeners.get(type)?.delete(listener)
			},
			dispatch(type, event = {}) {
				event.currentTarget = this
				event.target = event.target || this
				for (const listener of Array.from(eventListeners.get(type) || [])) listener(event)
			},
			setAttribute(name, value) {
				this.attributes[name] = String(value)
			},
			setPointerCapture(pointerId) {
				this.capturedPointer = pointerId
			},
			releasePointerCapture(pointerId) {
				if (this.capturedPointer === pointerId) this.capturedPointer = null
			}
		}
	}

	const disclosureSection = interactiveElement()
	const disclosureToggle = interactiveElement()
	const disclosureBody = interactiveElement()
	const disclosureChevron = interactiveElement()
	const topHandle = interactiveElement('top')
	const bottomHandle = interactiveElement('bottom')
	disclosureBody.offsetHeight = 100
	disclosureBody.scrollHeight = 180
	disclosureBody.getBoundingClientRect = () => ({ height: 100 })
	const disclosureChanges = []
	const disclosure = shared.createDisclosureController({
		section: disclosureSection,
		toggle: disclosureToggle,
		body: disclosureBody,
		chevron: disclosureChevron,
		handles: [topHandle, bottomHandle],
		state: { expanded: true, preferredHeight: null },
		minHeight: 44,
		maxViewportRatio: .45,
		defaultHeight: 180,
		onChange(detail) {
			disclosureChanges.push(detail.reason)
		}
	})
	assert.equal(disclosure.state.expanded, true)
	assert.equal(disclosureSection.dataset.worldEditorDisclosure, '')
	assert.equal(disclosureToggle.dataset.worldEditorDisclosureToggle, '')
	assert.equal(disclosureChevron.dataset.worldEditorDisclosureChevron, '')
	assert.equal(disclosureBody.dataset.worldEditorScrollbar, '')
	assert.equal(disclosureToggle.attributes['aria-expanded'], 'true')
	assert.equal(disclosureBody.style['--world-editor-disclosure-height'], '180px')
	disclosureToggle.dispatch('click', {
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	})
	assert.equal(disclosure.state.expanded, false)
	assert.equal(disclosureSection.dataset.expanded, 'false')
	disclosure.setExpanded(true, 'test-expand')
	bottomHandle.dispatch('pointerdown', {
		button: 0,
		pointerId: 7,
		clientY: 100,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	})
	window.dispatch('pointermove', {
		pointerId: 7,
		clientY: 150,
		preventDefault() {},
		stopPropagation() {}
	})
	assert.equal(disclosure.state.preferredHeight, 150)
	assert.equal(disclosureBody.style.height, '150px')
	window.dispatch('pointerup', {
		pointerId: 7,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	})
	assert.equal(bottomHandle.capturedPointer, null)
	disclosureBody.offsetHeight = 150
	topHandle.dispatch('pointerdown', {
		button: 0,
		pointerId: 8,
		clientY: 100,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	})
	window.dispatch('pointermove', {
		pointerId: 8,
		clientY: 120,
		preventDefault() {},
		stopPropagation() {}
	})
	assert.equal(disclosure.state.preferredHeight, 130)
	window.dispatch('pointercancel', {
		pointerId: 8,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	})
	assert.equal(disclosure.state.preferredHeight, 150)
	assert.equal(disclosureBody.style.height, '150px')
	assert.ok(disclosureChanges.includes('toggle'))
	assert.ok(disclosureChanges.includes('resize'))
	assert.ok(disclosureChanges.includes('pointercancel'))
	disclosure.release()
	shared.dispose()
}

function testLocalizationAndIntegrationContract() {
	const sharedSource = fs.readFileSync(path.join(MOD_ROOT, SHARED_SOURCE), 'utf8')
	const transformSource = fs.readFileSync(path.join(MOD_ROOT, TRANSFORM_SOURCE), 'utf8')
	const planSource = fs.readFileSync(path.join(MOD_ROOT, PLAN_SOURCE), 'utf8')
	const previewSource = fs.readFileSync(path.join(MOD_ROOT, PREVIEW_SOURCE), 'utf8')
	const sessionSource = fs.readFileSync(path.join(MOD_ROOT, SESSION_SOURCE), 'utf8')
	const cardOpacitySource = fs.readFileSync(path.join(MOD_ROOT, CARD_OPACITY_SOURCE), 'utf8')
	const selectionCardSource = fs.readFileSync(path.join(MOD_ROOT, SELECTION_CARD_SOURCE), 'utf8')
	const shellSource = fs.readFileSync(path.join(MOD_ROOT, SHELL_SOURCE), 'utf8')
	const readme = fs.readFileSync(path.join(MOD_ROOT, 'README.md'), 'utf8')
	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	const i18n = loadI18n()
	const transformKeys = [
		'blueprintRotateClockwise',
		'blueprintRotateCounterclockwise',
		'blueprintMirrorU',
		'blueprintMirrorV',
		'blueprintResetTransform',
		'blueprintTransformState',
		'blueprintTransformNone',
		'blueprintCollapseSection',
		'blueprintExpandSection',
		'cardOpacityControls',
		'cardOpacityContentLinked',
		'cardOpacityContentIndependent'
	]

	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 149)
	for (const language of i18n.languages) {
		for (const key of transformKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key)
			assert.ok(translated.trim())
		}
	}

	assert.equal(manifest.version, '0.4.2')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 28)
	assert.equal(
		manifest.entry.indexOf(SHARED_SOURCE),
		manifest.entry.indexOf('scripts/core/foundation.js') + 1
	)
	assert.equal(
		manifest.entry.indexOf(CARD_OPACITY_SOURCE),
		manifest.entry.indexOf(I18N_SOURCE) + 1
	)
	assert.equal(
		manifest.entry.indexOf(TRANSFORM_SOURCE),
		manifest.entry.indexOf('scripts/core/selection-analysis.js') + 2
	)
	assert.equal(
		manifest.entry.indexOf('scripts/core/blueprint-preview-plan.js'),
		manifest.entry.indexOf(TRANSFORM_SOURCE) + 1
	)

	assert.match(transformSource, /Symbol\.for\('cattail\.world-editor\.blueprint-transform'\)/)
	assert.match(transformSource, /version:\s*'0\.3\.3'/)
	assert.doesNotMatch(transformSource, /requestAnimationFrame|setInterval|onFrame/)
	assert.doesNotMatch(transformSource, /getEntityString|entityAtCoordinates|stuffMap/)
	assert.match(previewSource, /FOLLOW_PLAN_IDLE_MS\s*=\s*100/)
	assert.match(previewSource, /let renderedPlanPoint = null/)
	assert.match(previewSource, /let renderLayerScale = null/)
	assert.match(previewSource, /uBasis\[0\] - origin\[0\]/)
	assert.match(previewSource, /vBasis\[1\] - origin\[1\]/)
	assert.match(previewSource, /targetPoint\[0\] - renderedPlanPoint\[0\]/)
	assert.match(previewSource, /PENDING_PREVIEW_TRANSITION\s*=\s*'opacity 80ms linear'/)
	assert.doesNotMatch(previewSource, /PENDING_PREVIEW_FILTER|saturate\(/)
	assert.match(previewSource, /setStyleValue\(style,\s*'willChange',\s*layerReady\s*\?\s*'transform'\s*:\s*''\)/)
	assert.match(previewSource, /window\.addEventListener\('resize',\s*handleWindowResize\)/)
	assert.match(previewSource, /window\.removeEventListener\('resize',\s*handleWindowResize\)/)
	assert.match(previewSource, /integrityIntervalMs:\s*INTEGRITY_INTERVAL_MS/)
	assert.match(previewSource, /integrityGuardCellChecks:\s*metrics\.integrityGuardCellChecks/)
	assert.match(previewSource, /lastIntegrityMs:\s*metrics\.lastIntegrityMs/)
	assert.match(previewSource, /maxIntegrityMs:\s*metrics\.maxIntegrityMs/)
	assert.match(previewSource, /integrityRefreshes:\s*metrics\.integrityRefreshes/)
	assert.match(previewSource, /resourceRefreshes:\s*metrics\.resourceRefreshes/)
	assert.match(previewSource, /lastIntegrityReason:\s*metrics\.lastIntegrityReason/)
	assert.match(previewSource, /verification\.reason\s*===\s*'resources'/)
	assert.match(planSource, /inspect\(game,\s*guard\)/)
	assert.match(planSource, /refreshResources\(game,\s*plan\)/)
	assert.match(planSource, /function refreshPlanResources\(game,\s*plan\)/)
	assert.match(previewSource, /finishCameraDrag\(\)/)
	assert.doesNotMatch(previewSource, /projectedX,\s*projectedY/)
	assert.match(previewSource, /transform\.subscribe\(function \(state\)/)
	assert.match(previewSource, /if \(isTargetPinned\(\)\) scheduled = requestPlan/)
	assert.match(previewSource, /else scheduled = scheduleFollowPlan/)
	assert.match(previewSource, /ROTATION_TRANSITION_MS\s*=\s*160/)
	assert.match(previewSource, /context\.drawImage\(renderLayerCanvas,\s*0,\s*0\)/)
	assert.match(previewSource, /projectedRotationTransition\(previousState,\s*nextState,\s*rect\)/)
	assert.match(previewSource, /rotationMatrixAt\(angle \* offset\)/)
	assert.match(previewSource, /Math\.max\(8,\s*Math\.round\(Math\.abs\(angle\)/)
	assert.match(previewSource, /rotationOverlayAnimation = overlay\.animate\(keyframes/)
	assert.match(previewSource, /easing:\s*'linear'/)
	assert.match(previewSource, /GUIDE_LAYER_ID\s*=\s*'world-editor-blueprint-transform-guide'/)
	assert.match(previewSource, /GUIDE_TRANSITION_MS\s*=\s*100/)
	assert.match(previewSource, /drawRotationGuide\(/)
	assert.match(previewSource, /drawMirrorGuide\(/)
	assert.match(previewSource, /setTransformGuide\(action,\s*reason\)/)
	assert.match(previewSource, /window\.addEventListener\('keydown',\s*handleTemporaryPinKeydown,\s*true\)/)
	assert.match(previewSource, /window\.addEventListener\('keyup',\s*handleTemporaryPinKeyup,\s*true\)/)
	assert.match(previewSource, /releaseTemporaryPin\('window-blur',\s*false\)/)
	assert.match(previewSource, /temporaryPinned,\s*\n\s*effectivePinned:\s*isTargetPinned\(\)/)
	assert.match(previewSource, /code === 'KeyR'/)
	assert.match(previewSource, /code === 'KeyM'/)
	assert.match(previewSource, /event\?\.repeat/)
	assert.match(previewSource, /event\?\.isComposing/)
	assert.match(previewSource, /event\?\.ctrlKey/)
	assert.match(previewSource, /event\?\.altKey/)
	assert.match(previewSource, /event\?\.metaKey/)
	assert.match(previewSource, /isEditableEvent\(event\)/)
	assert.match(previewSource, /if \(changed\) consume\(event\)/)

	assert.match(sessionSource, /const ICON_ASSETS = Object\.freeze\(\{\}\)/)
	assert.match(sessionSource, /full\.hidden = true/)
	assert.match(sessionSource, /blocks\.hidden = true/)
	assert.match(sessionSource, /session\.setMode\('structure', reason \+ '-structure'\)/)
	assert.match(sessionSource, /data-world-editor-transform-controls="card"/)
	assert.match(sessionSource, /data-world-editor-transform-action/)
	assert.match(sessionSource, /previewState\?\.active && !previewState\.effectivePinned/)
	assert.match(sessionSource, /data-input-pass-through="true"/)
	assert.match(sessionSource, /font-family:\s*Montserrat/)
	assert.match(sessionSource, /width:\s*30px/)
	assert.match(sessionSource, /border-left-color:\s*transparent/)
	assert.match(sessionSource, /left:\s*0;\s*\n\s*bottom:\s*1px/)
	assert.match(sessionSource, /border-right:\s*5px solid currentColor;\s*\n\s*transform:\s*rotate\(25deg\)/)
	assert.doesNotMatch(sessionSource, /border-left:\s*5px solid currentColor/)
	assert.match(sessionSource, /data-icon="reset"\]::after\s*\{\s*left:\s*1px;\s*\n\s*bottom:\s*2px/)
	assert.doesNotMatch(sessionSource, /left:\s*0;\s*\n\s*top:\s*1px/)
	assert.doesNotMatch(sessionSource, /right:\s*0;\s*\n\s*top:\s*1px/)
	assert.ok((sessionSource.match(/transform:\s*rotate\(45deg\)/g) || []).length >= 2)
	assert.match(sessionSource, /game\.resourcesSprites\?\.\[index\]/)
	assert.match(sessionSource, /game\.makeReadable/)
	assert.match(sharedSource, /\[data-world-editor-scrollbar\]\s*\{[\s\S]*--world-editor-scrollbar-size:\s*4px/)
	assert.match(sharedSource, /\[data-world-editor-scrollbar\]::-webkit-scrollbar\s*\{[\s\S]*width:\s*var\(--world-editor-scrollbar-size\)/)
	assert.doesNotMatch(sessionSource, /scrollbar-width:\s*thin|scrollbar-color:|::-webkit-scrollbar/)
	assert.match(sessionSource, /previewTemporaryPinHint/)
	assert.match(sessionSource, /previewBuildPlan/)
	assert.match(sessionSource, /return !!ui\?\.pinned/)
	assert.match(sessionSource, /function cardInteractionEnabled\(\)/)
	assert.doesNotMatch(sessionSource, /previewController\.setPinned\(next,\s*previewState\.temporaryPinned/)
	assert.match(sessionSource, /crossingSymbol\.textContent = '↔'/)
	assert.match(sessionSource, /i18n\.t\(game,\s*'blueprintCrossBoundary'\)/)
	assert.match(previewSource, /main:\s*'#889'/)
	assert.match(previewSource, /direction === 'mirror-u' \? 'v' : 'u'/)
	assert.doesNotMatch(previewSource, /extents\.minDirection - visual\.offset \/ 2/)
	assert.doesNotMatch(previewSource, /extents\.maxDirection \+ visual\.offset \/ 2/)
	assert.match(previewSource, /layerReady \? \(provisional \? PENDING_PREVIEW_OPACITY : '1'\) : ''/)
	assert.match(shellSource, /UI_SCALE_BASE_WIDTH = 1600/)
	assert.match(shellSource, /UI_SCALE_BASE_HEIGHT = 1000/)
	assert.match(shellSource, /UI_SCALE_MIN = \.5/)
	assert.match(shellSource, /Math\.min\(viewportWidth \/ UI_SCALE_BASE_WIDTH,\s*viewportHeight \/ UI_SCALE_BASE_HEIGHT\)/)
	assert.match(shellSource, /function responsiveViewport\(game\)/)
	assert.match(shellSource, /game\?\.canvas/)
	assert.match(shellSource, /element\?\.getBoundingClientRect\?\.\(\)/)
	assert.match(shellSource, /width:\s*Math\.min\(\.\.\.widths\)/)
	assert.match(shellSource, /globalThis\.ResizeObserver/)
	assert.match(shellSource, /observer\.observe\(target\)/)
	assert.match(shellSource, /uiScaleObserver\?\.disconnect\?\.\(\)/)
	assert.match(shellSource, /--world-editor-ui-scale/)
	assert.match(sessionSource, /scale\(var\(--world-editor-ui-scale,\s*1\)\)/)
	assert.match(shellSource, /layout\.className = 'cattail-world-editor-shell__layout'/)
	assert.match(shellSource, /statusBar\.className = 'cattail-world-editor-shell__status-bar'/)
	assert.match(shellSource, /toolbarBar\.className = 'cattail-world-editor-shell__toolbar-bar'/)
	assert.match(shellSource, /historyGroup\.dataset\.worldEditorSlot = 'history'/)
	assert.match(shellSource, /blueprintGroup\.dataset\.worldEditorSlot = 'blueprint'/)
	assert.match(shellSource, /transformGroup\.dataset\.worldEditorSlot = 'transform'/)
	assert.match(
		shellSource,
		/actions\.append\(selectionGroup,\s*historyGroup,\s*blueprintGroup,\s*transformGroup,\s*creativeGroup\)/
	)
	assert.match(shellSource, /statusBar\.append\(identity,\s*divider,\s*status,\s*hint\)/)
	assert.match(shellSource, /toolbarBar\.append\(actions\)/)
	assert.match(shellSource, /layout\.append\(statusBar,\s*toolbarBar\)/)
	assert.match(shellSource, /shell\.append\(layout\)/)
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__layout\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*center;[\s\S]*gap:\s*8px;/
	)
	const toolbarLayoutStyle = shellSource.match(
		/\.cattail-world-editor-shell__layout\s*\{([^}]*)\}/
	)?.[1] || ''
	assert.doesNotMatch(toolbarLayoutStyle, /(?:^|[\s;])(?:background|border|box-shadow)\s*:/)
	assert.match(shellSource, /width:\s*max-content/)
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__status-bar,\s*\.cattail-world-editor-shell__toolbar-bar\s*\{[\s\S]*border:\s*1px solid var\(--world-editor-shell-border\);[\s\S]*background:\s*var\(--world-editor-shell-bg\);[\s\S]*box-shadow:\s*var\(--world-editor-shell-shadow\);/
	)
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__status-bar\s*\{[\s\S]*width:\s*max-content;[\s\S]*padding:\s*10px 14px;/
	)
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__toolbar-bar\s*\{[\s\S]*width:\s*max-content;[\s\S]*padding:\s*8px 10px;/
	)
	assert.doesNotMatch(shellSource, /cattail-world-editor-shell__bar/)
	assert.doesNotMatch(shellSource, /grid-template-rows:/)
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__group\s*\{[\s\S]*flex:\s*none;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*border-radius:\s*8px/
	)
	assert.match(shellSource, /\.cattail-world-editor-shell__group:empty\s*\{\s*display:\s*none/)
	assert.match(
		shellSource,
		/@media \(max-width:\s*520px\)[\s\S]*\.cattail-world-editor-shell__identity,[\s\S]*\.cattail-world-editor-shell__hint \{ display:\s*none; \}/
	)
	assert.doesNotMatch(shellSource, /data-world-editor-slot="actions"/)
	assert.doesNotMatch(shellSource, /createIconButton\('(?:undo|redo)'/)
	assert.match(sessionSource, /const blueprintSlot = shell\?\.querySelector\?\.\('\[data-world-editor-slot="blueprint"\]'\)/)
	assert.match(sessionSource, /const transformSlot = shell\?\.querySelector\?\.\('\[data-world-editor-slot="transform"\]'\)/)
	assert.match(sessionSource, /blueprintSlot\.append\(controls\.root\)/)
	assert.match(sessionSource, /transformSlot\.append\(controls\.transforms\)/)
	assert.match(sessionSource, /root\.append\(modes,\s*blocks,\s*copy\)/)
	assert.doesNotMatch(sessionSource, /root\.append\(modes,\s*blocks,\s*copy,\s*transforms\)/)
	assert.match(sessionSource, /ui\.controls\.transforms\.remove\(\)/)
	assert.match(
		sessionSource,
		/\.cattail-world-editor-blueprint-controls\s*\{[\s\S]*flex:\s*none;[\s\S]*flex-wrap:\s*nowrap/
	)
	assert.match(
		sessionSource,
		/\.cattail-world-editor-transform-controls\s*\{[\s\S]*flex:\s*none;[\s\S]*flex-wrap:\s*nowrap/
	)
	assert.match(readme, /顶部状态栏和工具栏是两个彻底独立的玻璃浮层/)
	assert.match(readme, /不存在包围二者的共同外框/)
	assert.match(readme, /未来历史入口/)
	assert.doesNotMatch(sessionSource, /SECTION_LONG_PRESS_MS|SECTION_PREACTIVATION_PX/)
	assert.match(sharedSource, /\[data-world-editor-disclosure-resize\]\s*\{[\s\S]*height:\s*10px/)
	assert.match(
		sharedSource,
		/\[data-input-pass-through="true"\]\s+\[data-world-editor-disclosure-resize\],\s*\[data-world-drag-pass-through="true"\]\s+\[data-world-editor-disclosure-resize\]\s*\{\s*pointer-events:\s*none !important;/s
	)
	assert.match(sharedSource, /handle\.setPointerCapture\?\.\(activeResize\.pointerId\)/)
	assert.match(sharedSource, /body\.offsetHeight/)
	assert.match(sharedSource, /deltaY \* direction \/ activeResize\.scale/)
	assert.match(sessionSource, /shared\.createDisclosureController\(\{/)
	assert.doesNotMatch(sessionSource, /function handleSectionToggle\(|function handleSectionResizeStart\(/)
	assert.doesNotMatch(sessionSource, /preactivation-move/)
	const rightPlacement = sessionSource.indexOf("placement: 'right'")
	const leftPlacement = sessionSource.indexOf("placement: 'left'", rightPlacement)
	const belowPlacement = sessionSource.indexOf("placement: 'below'", leftPlacement)
	const abovePlacement = sessionSource.indexOf("placement: 'above'", belowPlacement)
	assert.ok(rightPlacement >= 0 && rightPlacement < leftPlacement)
	assert.ok(leftPlacement < belowPlacement)
	assert.ok(belowPlacement < abovePlacement)
	assert.match(sessionSource, /const gap = 28/)
	assert.match(sessionSource, /function chooseCardCandidate\(candidates,\s*options\)/)
	assert.match(sessionSource, /shared\.cardCandidateFits\(candidate,\s*settings\)/)
	assert.match(sessionSource, /shared\.rectangleOverlapArea\(candidate,\s*settings\.previewRect\) \* 4/)
	assert.doesNotMatch(sessionSource, /function cardCandidateFits\(|function rectangleOverlapArea\(/)
	assert.match(sharedSource, /function cardCandidateFits\(candidate,\s*options\)/)
	assert.match(sharedSource, /candidate\.left \+ candidate\.width <= settings\.viewportWidth - settings\.margin/)
	assert.match(sessionSource, /positionPreviewTarget:\s*null/)
	assert.match(sessionSource, /positionPreviewWorldBounds:\s*null/)
	assert.match(sessionSource, /positionPreviewScreenBounds:\s*null/)
	assert.match(sessionSource, /const previewGeometry = previewState\?\.active && !previewState\.paused[\s\S]*previewCardPositionGeometry\(previewState\)/)
	assert.match(sessionSource, /const projectionChanged = !screenBoundsEqual\(ui\.positionPreviewScreenBounds,\s*bounds\)/)
	assert.match(sessionSource, /ui\.positionPreviewViewportWidth !== viewportWidth/)
	assert.match(sessionSource, /if \(!previewGeometry\.snapshotChanged && !projectionChanged && !viewportChanged\) \{\s*refreshCardVisibility\(\)\s*return/)
	const positionGeometryStart = sessionSource.indexOf('function previewCardPositionGeometry(state)')
	const positionGeometryEnd = sessionSource.indexOf('function resetPreviewCardPosition()', positionGeometryStart)
	const positionGeometryContract = sessionSource.slice(positionGeometryStart, positionGeometryEnd)
	assert.match(positionGeometryContract, /!samePosition\(target,\s*ui\.positionPreviewTarget\)/)
	assert.match(positionGeometryContract, /state\?\.blueprint\?\.contentBounds\?\.min/)
	assert.match(positionGeometryContract, /state\?\.blueprint\?\.contentBounds\?\.max/)
	assert.doesNotMatch(positionGeometryContract, /state\?\.plan|state\?\.transform|currentTransform/)
	assert.match(sessionSource, /function screenBoundsEqual\(left,\s*right\)[\s\S]*const tolerance = \.25/)
	assert.match(sessionSource, /const previewTemporaryPinnedVisible = !!\([\s\S]*previewState\.temporaryPinned[\s\S]*\)/)
	assert.match(sessionSource, /ui\.pinned \|\|[\s\S]*ui\.temporaryVisible \|\|[\s\S]*currentSession\.capturing \|\|[\s\S]*previewTemporaryPinnedVisible/)
	assert.doesNotMatch(sessionSource, /previewPinnedVisible/)
	assert.doesNotMatch(sessionSource, /currentSession\.capturing \|\| previewVisible/)
	assert.match(sessionSource, /function syncTemporaryWindowFromPreview\(previousState,\s*state\)/)
	assert.match(sessionSource, /if \(state\.temporaryPinned\) \{\s*pauseTemporaryTimer\(\)\s*return/)
	assert.match(sessionSource, /const permanentPinned = !!state\.active && !previousState\?\.pinned && !!state\.pinned/)
	assert.match(sessionSource, /const permanentReleased = !!state\.active && !!previousState\?\.pinned && !state\.pinned/)
	assert.match(sessionSource, /const temporaryReleased = !!state\.active && !!previousState\?\.temporaryPinned/)
	assert.match(sessionSource, /permanentPinned \|\|[\s\S]*permanentReleased \|\|[\s\S]*temporaryReleased \|\|/)
	assert.match(sessionSource, /warningAppeared \|\|[\s\S]*fallbackChanged/)
	assert.match(sessionSource, /previewSnapshot\(\)\?\.temporaryPinned/)
	const temporarySyncStart = sessionSource.indexOf('function syncTemporaryWindowFromPreview(')
	const temporarySyncEnd = sessionSource.indexOf('function resetCardDisplayState(', temporarySyncStart)
	const temporarySyncContract = sessionSource.slice(temporarySyncStart, temporarySyncEnd)
	assert.match(temporarySyncContract, /if \([\s\S]*permanentPinned \|\|[\s\S]*\) \{\s*restartTemporaryWindow\(\)/)
	assert.doesNotMatch(temporarySyncContract, /if \(state\.pinned\) \{\s*pauseTemporaryTimer\(\)/)
	const visibilityStart = sessionSource.indexOf('function refreshCardVisibility()')
	const visibilityEnd = sessionSource.indexOf('function syncCardPassThrough()', visibilityStart)
	const visibilityContract = sessionSource.slice(visibilityStart, visibilityEnd)
	assert.doesNotMatch(visibilityContract, /effectivePinned/)
	const timerStart = sessionSource.indexOf('function resumeTemporaryTimer()')
	const timerEnd = sessionSource.indexOf('function setCardText(', timerStart)
	const timerContract = sessionSource.slice(timerStart, timerEnd)
	assert.doesNotMatch(timerContract, /effectivePinned/)
	assert.match(sessionSource, /if \(!state\.active\) \{\s*resetCardDisplayState\('editor-inactive'\)/)
	assert.match(sessionSource, /if \(exited\) \{\s*resetCardDisplayState\('preview-exited'\)\s*return/)
	assert.match(sessionSource, /function resetCardDisplayState\(reason\)/)
	const resetStart = sessionSource.indexOf('function resetCardDisplayState(reason)')
	const resetEnd = sessionSource.indexOf('function clearTemporaryWindow()', resetStart)
	const resetContract = sessionSource.slice(resetStart, resetEnd)
	assert.match(resetContract, /cancelAllSectionResizes\(reason \|\| 'card-display-reset',\s*true\)/)
	assert.match(resetContract, /resetPreviewCardPosition\(\)/)
	assert.match(resetContract, /ui\.pinned = false/)
	assert.match(resetContract, /ui\.temporaryVisible = false/)
	assert.match(resetContract, /ui\.positionVisible = false/)
	assert.match(resetContract, /ui\.card\.dataset\.visible = 'false'/)
	assert.doesNotMatch(resetContract, /session\.clear/)
	assert.match(sessionSource, /if \(!currentRuntime\.active\) \{\s*resetPreviewCardPosition\(\)\s*ui\.positionVisible = false\s*refreshCardVisibility\(\)\s*return/)
	assert.match(sessionSource, /maxViewportRatio:\s*\.35/)
	assert.match(sessionSource, /maxViewportRatio:\s*\.45/)
	assert.match(sessionSource, /blueprintCollapseSection/)
	assert.match(sessionSource, /blueprintExpandSection/)
	assert.match(sessionSource, /crossing\.className = 'cattail-world-editor-blueprint-card__preview-status'/)
	assert.match(sessionSource, /crossing\.dataset\.status = 'cross-boundary'/)
	assert.match(sessionSource, /worldEditorBlueprintText = 'crossing-count'/)
	assert.match(sessionSource, /shared\.resolveEntityIcon\(game, name\)/)
	assert.match(sessionSource, /if \(!imageSource\) return createNeutralEntityIcon\(\)/)
	assert.doesNotMatch(sessionSource, /function resolveEntityIcon\(/)
	assert.match(sessionSource, /font-weight:\s*400/)
	assert.match(planSource, /function planningEntityAt\(game,\s*position\)/)
	assert.match(planSource, /safeName\(entity\?\.name\)\s*===\s*'surge'\s*\?\s*null\s*:\s*entity/)
	assert.doesNotMatch(planSource + '\n' + previewSource + '\n' + sessionSource, /cost\.overwrite|previewOverwritePlan|data-cost-mode/)
	assert.match(cardOpacitySource, /OPACITY_MIN = \.25/)
	assert.match(cardOpacitySource, /OPACITY_MAX = 1/)
	assert.match(cardOpacitySource, /OPACITY_STEP = \.1/)
	assert.match(cardOpacitySource, /window\.addEventListener\('wheel',\s*handleWheel,\s*\{\s*capture:\s*true,\s*passive:\s*false\s*\}\)/)
	assert.match(cardOpacitySource, /event\?\.button !== 1/)
	assert.match(cardOpacitySource, /for \(const node of eventPath\(event\)\)/)
	assert.match(cardOpacitySource, /cardContainsPoint\(state\.element,\s*x,\s*y\)/)
	assert.match(cardOpacitySource, /cattailWorldEditorSelectionCardOpacity/)
	assert.match(cardOpacitySource, /cattailWorldEditorSelectionCardOpaqueInfo/)
	assert.match(cardOpacitySource, /cattailWorldEditorBlueprintCardOpacity/)
	assert.match(cardOpacitySource, /cattailWorldEditorBlueprintCardOpaqueInfo/)
	assert.match(cardOpacitySource, /function loadSharedState\(group\)/)
	assert.match(cardOpacitySource, /function saveOpacity\(group,\s*value\)/)
	assert.match(cardOpacitySource, /function saveContentIndependent\(group,\s*value\)/)
	assert.match(cardOpacitySource, /raw === null \|\| raw === undefined \|\| raw === ''/)
	assert.doesNotMatch(cardOpacitySource, /sessionStorage/)
	assert.match(sessionSource, /CARD_OPACITY_KEY/)
	assert.match(sessionSource, /shared\.isCardControlEvent\(event,\s*'\[data-world-editor-disclosure-resize\]'\)/)
	assert.match(selectionCardSource, /shared\.isCardControlEvent\(event\)/)
	assert.match(sessionSource, /id:\s*'blueprint',[\s\S]*priority:\s*48/)
	assert.match(selectionCardSource, /id:\s*'selection',[\s\S]*priority:\s*47/)
	assert.match(sessionSource, /--world-editor-card-opacity/)
	assert.match(selectionCardSource, /--world-editor-card-opacity/)
	assert.match(sessionSource, /color-mix\(in srgb/)
	assert.match(selectionCardSource, /color-mix\(in srgb/)
	assert.doesNotMatch(
		sessionSource + '\n' + selectionCardSource,
		/calc\([^)]*\*\s*var\(--world-editor-card-shell/
	)
	assert.match(readme, /3D/)
	assert.equal(fs.existsSync(path.join(MOD_ROOT, 'assets', 'icons', '.gitkeep')), true)
	assert.equal(fs.existsSync(path.join(MOD_ROOT, 'assets', 'icons', 'z-opacity-hint.svg')), true)

	const implementation = sharedSource + '\n' + transformSource + '\n' + planSource + '\n' + previewSource + '\n' + sessionSource
	assert.doesNotMatch(implementation, /\bgame\.(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity)\b/)
}

async function run() {
	testPivotAndOrderedMatrixState()
	testExhaustiveOrderedCommands()
	testRestorationAndBounds()
	testFullProjectionAndSourceImmutability()
	testEmptyProjectionAndLifecycle()
	testCommandScaleAndSingleNotification()
	await testCameraTranslationCache()
	await testIntegrityMetrics()
	await testRotationTransitionOverlay()
	await testTransformGuideLayerIsolation()
	testCardOpacityController()
	testSharedEditorServices()
	testLocalizationAndIntegrationContract()
	console.log('3D verification passed: fixed pivot, ordered D4 normalization, exact restoration, 256-entity command scaling, cached camera translation and compositor geometry, pinned integrity timing with resource-only refresh and structural invalidation, immutable projection, 20-language UI, hidden noncreative controls, hotkeys, card pass-through, and manifest integration.')
}

run().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
