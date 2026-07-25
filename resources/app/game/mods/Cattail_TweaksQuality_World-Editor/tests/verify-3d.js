const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { performance } = require('node:perf_hooks')

const MOD_ROOT = path.resolve(__dirname, '..')
const TRANSFORM_SOURCE = 'scripts/core/blueprint-transform.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
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
	assert.equal(env.context.canvas.style.opacity, '')
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
	assert.equal(env.context.canvas.style.opacity, '')
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
	assert.deepEqual(plain(current.plan.cost.safe.owned), [1005, 1000])
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

function testLocalizationAndIntegrationContract() {
	const transformSource = fs.readFileSync(path.join(MOD_ROOT, TRANSFORM_SOURCE), 'utf8')
	const planSource = fs.readFileSync(path.join(MOD_ROOT, PLAN_SOURCE), 'utf8')
	const previewSource = fs.readFileSync(path.join(MOD_ROOT, PREVIEW_SOURCE), 'utf8')
	const sessionSource = fs.readFileSync(path.join(MOD_ROOT, SESSION_SOURCE), 'utf8')
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
		'blueprintTransformNone'
	]

	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 77)
	for (const language of i18n.languages) {
		for (const key of transformKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key)
			assert.ok(translated.trim())
		}
	}

	assert.equal(manifest.version, '0.3.3')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 17)
	assert.equal(
		manifest.entry.indexOf(TRANSFORM_SOURCE),
		manifest.entry.indexOf('scripts/core/selection-analysis.js') + 1
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
	assert.match(previewSource, /if \(pinned\) scheduled = requestPlan/)
	assert.match(previewSource, /else scheduled = scheduleFollowPlan/)
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
	assert.match(sessionSource, /previewState\?\.active && !previewState\.pinned/)
	assert.match(sessionSource, /data-input-pass-through="true"/)
	assert.match(sessionSource, /font-family:\s*Montserrat/)
	assert.match(sessionSource, /width:\s*30px/)
	assert.match(readme, /3D/)
	assert.equal(fs.existsSync(path.join(MOD_ROOT, 'assets', 'icons', '.gitkeep')), true)

	const implementation = transformSource + '\n' + planSource + '\n' + previewSource + '\n' + sessionSource
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
	testLocalizationAndIntegrationContract()
	console.log('3D verification passed: fixed pivot, ordered D4 normalization, exact restoration, 256-entity command scaling, cached camera translation and compositor geometry, pinned integrity timing with resource-only refresh and structural invalidation, immutable projection, 20-language UI, hidden noncreative controls, hotkeys, card pass-through, and manifest integration.')
}

run().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
