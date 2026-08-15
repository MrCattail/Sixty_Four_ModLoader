const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const INPUT_PATH = path.join(MOD_ROOT, 'scripts/input/paint-cube-input.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const inputSource = fs.readFileSync(INPUT_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))

class EventHub {
	constructor() { this.listeners = new Map() }
	addEventListener(name, listener) {
		if (!this.listeners.has(name)) this.listeners.set(name, [])
		this.listeners.get(name).push(listener)
	}
	removeEventListener(name, listener) {
		this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== listener))
	}
	dispatch(name, event = {}) {
		event.type = event.type || name
		for (const listener of (this.listeners.get(name) || []).slice()) {
			listener(event)
			if (event.immediateStopped) break
		}
		return event
	}
	dispatchEvent(event) {
		this.dispatch(event.type, event)
		return true
	}
}

function mouseEvent(options) {
	return Object.assign({
		button: 0,
		buttons: 0,
		offsetX: 10,
		offsetY: 20,
		prevented: false,
		stopped: false,
		immediateStopped: false,
		preventDefault() { this.prevented = true },
		stopPropagation() { this.stopped = true },
		stopImmediatePropagation() { this.immediateStopped = true }
	}, options)
}

function plain(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function feed(initial) {
	let state = Object.assign({}, initial)
	const listeners = new Set()
	return {
		snapshot() { return Object.assign({}, state) },
		subscribe(listener) {
			listeners.add(listener)
			listener(Object.assign({}, state))
			return function () { listeners.delete(listener) }
		},
		emit(next) {
			state = Object.assign({}, state, next)
			for (const listener of listeners) listener(Object.assign({}, state))
		}
	}
}

function createEnvironment(options = {}) {
	const definitions = []
	const events = new Map()
	const cleanups = []
	const canvas = new EventHub()
	const windowHub = new EventHub()
	const frameCallbacks = []
	const statuses = []
	const calls = []
	const fillCalls = []
	const cellStates = new Map()
	let active = true
	let inputBlocked = options.inputBlocked === true
	let blueprintActive = options.blueprintActive === true
	let nextResult = null
	if (options.deferSampleFrame) {
		windowHub.requestAnimationFrame = function (callback) {
			frameCallbacks.push(callback)
			return frameCallbacks.length
		}
	}
	const runtimeFeed = feed({ active: true })
	const tool = feed({ mode: 'draw' })
	const defaultRecipe = {
		version: 1,
		weights: [{ resource: 0, weight: 60 }, { resource: 4, weight: 40 }],
		totalWeight: 100
	}
	const paintUi = feed({
		subtool: 'brush',
		cubeMode: 'stable',
		growAvailable: true,
		growDurationMs: 4000,
		recipe: defaultRecipe,
		paletteOpen: false
	})
	function Game() {}
	Game.prototype.switchPlane = function (value) { this.plane = value ? 1 : 0 }
	const game = Object.assign(Object.create(Game.prototype), {
		canvas,
		plane: 0,
		halt: false,
		splash: { isShown: false },
		mouse: { cursorVisible: true },
		hoveredCell: [2, 3],
		updateMouseData() {}
	})
	const runtime = Object.assign(runtimeFeed, {
		game,
		isActive() { return active },
		addCleanup(cleanup) { cleanups.push(cleanup) }
	})
	paintUi.game = game
	const stroke = {
		game,
		maxCells: options.maxCells || 512,
		inspectCell(cell, action) {
			const key = cell[0] + ':' + cell[1]
			const state = cellStates.get(key) || 'empty'
			const painted = state === 'painted'
			const occupied = state !== 'empty'
			const eligible = action === 'erase' ? painted : !occupied || painted
			return {
				cell: cell.slice(), action, known: true, eligible, occupied, painted,
				operation: eligible ? action === 'erase' ? 'erase' : painted ? 'replace' : 'paint' : null,
				before: occupied ? { name: state === 'ordinary' ? 'pump' : 'cube', position: cell.slice(), par: { marker: state } } : null
			}
		},
		executeStroke(request) {
			calls.push(plain(request))
			if (options.deferred) return options.deferred.promise
			if (nextResult) return Promise.resolve(nextResult)
			const painted = request.action === 'paint' ? request.targets.filter(target => target.before === null).length : 0
			const replaced = request.action === 'paint' ? request.targets.length - painted : 0
			const erased = request.action === 'erase' ? request.targets.length : 0
			return Promise.resolve({
				accepted: true,
				executed: true,
				transaction: {
					summary: {
						paintedCount: painted,
						replacedCount: replaced,
						erasedCount: erased,
						skippedCount: request.initialSkipped,
						limitReached: request.limitReached
					}
				}
			})
		},
		beginLiveStroke(request) {
			const changes = []
			const visited = new Set()
			let skippedCount = 0
			let limitReached = false
			let closed = false
			function sampleOne(cell) {
				if (closed) return { ok: false, reason: 'CLOSED' }
				const key = cell[0] + ':' + cell[1]
				if (visited.has(key)) return { ok: true, duplicate: true }
				visited.add(key)
				const inspection = stroke.inspectCell(cell, request.action)
				if (!inspection.eligible) {
					skippedCount += 1
					return { ok: true, skipped: true }
				}
				if (changes.length >= stroke.maxCells) {
					skippedCount += 1
					limitReached = true
					return { ok: true, skipped: true, limitReached: true }
				}
				const change = {
					cell: inspection.cell.slice(),
					operation: request.action === 'erase' ? 'erase' : inspection.before ? 'replace' : 'paint',
					before: plain(inspection.before),
					after: request.action === 'erase' ? null : { name: 'cube', position: inspection.cell.slice(), par: { marker: request.cubeMode || 'stable' } }
				}
				changes.push(change)
				return { ok: true, change: plain(change), limitReached }
			}
			return {
				ready: Promise.resolve({ begun: true }),
				sample(cell) {
					return sampleOne(cell)
				},
				sampleMany(cells) {
					let last = { ok: true }
					for (const cell of cells) {
						last = sampleOne(cell)
						if (last?.ok === false) return last
					}
					return Object.assign({ ok: true }, last)
				},
				commit() {
					closed = true
					if (options.deferred) return options.deferred.promise
					if (nextResult) return Promise.resolve(nextResult)
					const targets = changes.map(change => ({ cell: change.cell.slice(), before: plain(change.before) }))
					calls.push(Object.assign(plain(request), {
						targets,
						initialSkipped: skippedCount,
						limitReached
					}))
					const painted = request.action === 'paint' ? changes.filter(change => change.operation === 'paint').length : 0
					const replaced = request.action === 'paint' ? changes.filter(change => change.operation === 'replace').length : 0
					const erased = request.action === 'erase' ? changes.length : 0
					return Promise.resolve({
						accepted: true,
						executed: true,
						transaction: {
							summary: {
								paintedCount: painted,
								replacedCount: replaced,
								erasedCount: erased,
								skippedCount,
								limitReached
							}
						}
					})
				},
				cancel() {
					closed = true
					return Promise.resolve(true)
				},
				snapshot() {
					return {
						ready: true,
						closed,
						changes: plain(changes),
						skippedCount,
						limitReached,
						error: null
					}
				}
			}
		}
	}
	const fill = {
		game,
		maxCells: 4096,
		plan(request) {
			fillCalls.push(plain(request))
			if (options.fillDeferred) return options.fillDeferred.promise
			if (options.fillError) return Promise.reject(Object.assign(new Error(options.fillError), { code: options.fillError }))
			return Promise.resolve({
				guard: { schema: 1, cell: request.cell.slice() },
				targets: [{ cell: request.cell.slice(), before: null }],
				componentCount: 1,
				targetCount: 1
			})
		},
		validatePlan() { return Promise.resolve({ ok: true }) }
	}
	class CustomEvent {
		constructor(type, eventOptions) {
			this.type = type
			this.detail = eventOptions?.detail
		}
	}
	const sandbox = {
		Promise,
		CustomEvent,
		window: windowHub,
		Game,
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	vm.runInContext(inputSource, sandbox, { filename: INPUT_PATH })
	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.shared')] = { isWorldEditorInputBlocked() { return inputBlocked } }
	sandbox[Symbol.for('cattail.world-editor.tool')] = tool
	sandbox[Symbol.for('cattail.world-editor.paint-cube-ui')] = paintUi
	sandbox[Symbol.for('cattail.world-editor.paint-cube-stroke')] = stroke
	sandbox[Symbol.for('cattail.world-editor.paint-cube-fill')] = fill
	sandbox[Symbol.for('cattail.world-editor.blueprint-preview')] = { snapshot() { return { active: blueprintActive } } }
	definitions[0].init({
		on(name, listener) { events.set(name, listener) },
		patch(target, name, wrap) {
			const original = target[name]
			const replacement = wrap(original)
			target[name] = replacement
			return function () { if (target[name] === replacement) target[name] = original }
		}
	})
	windowHub.addEventListener('cattail:world-editor-paint-status', event => statuses.push(event.detail))
	events.get('afterVanillaScripts')()
	events.get('afterGameInit')({}, game)

	return {
		sandbox,
		canvas,
		windowHub,
		game,
		tool,
		paintUi,
		calls,
		fillCalls,
		statuses,
		cellStates,
		cleanups,
		service: sandbox[Symbol.for('cattail.world-editor.paint-cube-input')],
		flushAnimationFrame() {
			const callbacks = frameCallbacks.splice(0)
			for (const callback of callbacks) callback()
		},
		setActive(value) { active = value; runtimeFeed.emit({ active: value }) },
		setBlueprintActive(value) { blueprintActive = value === true },
		setInputBlocked(value) { inputBlocked = value === true },
		setResult(value) { nextResult = value }
	}
}

async function flush() {
	await Promise.resolve()
	await Promise.resolve()
	await new Promise(resolve => setImmediate(resolve))
}

function begin(env, cell) {
	env.game.hoveredCell = cell.slice()
	return env.canvas.dispatch('mousedown', mouseEvent({ button: 0, buttons: 1 }))
}

function move(env, cell) {
	env.game.hoveredCell = cell.slice()
	return env.canvas.dispatch('mousemove', mouseEvent({ buttons: 1 }))
}

async function finish(env, cell) {
	env.game.hoveredCell = cell.slice()
	const event = env.canvas.dispatch('mouseup', mouseEvent({ button: 0, buttons: 0 }))
	await flush()
	return event
}

function lastStatus(env) {
	return plain(env.statuses[env.statuses.length - 1])
}

async function testPendingStrokeAndSingleSubmission() {
	const env = createEnvironment()
	env.cellStates.set('3:3', 'ordinary')
	env.cellStates.set('4:3', 'painted')
	const down = begin(env, [1, 3])
	assert.equal(down.prevented, true)
	move(env, [5, 3])
	assert.equal(env.calls.length, 0, 'live Brush writes immediately but does not commit history before mouseup')
	assert.deepEqual(plain(env.service.snapshot().cells), [[1, 3], [2, 3], [4, 3], [5, 3]])
	assert.equal(env.service.snapshot().visitedCount, 5)
	assert.equal(env.service.snapshot().skippedCount, 1)
	assert.deepEqual(plain(env.service.snapshot().recipe), {
		version: 1,
		weights: [{ resource: 0, weight: 60 }, { resource: 4, weight: 40 }],
		totalWeight: 100
	})
	env.canvas.dispatch('mousemove', mouseEvent({ buttons: 0 }))
	assert.equal(env.service.snapshot().active, true, 'a release-adjacent buttons=0 mousemove waits for mouseup instead of cancelling')
	assert.notEqual(lastStatus(env)?.key, 'paintStrokeCancelled')
	move(env, [1, 3])
	assert.equal(env.service.snapshot().visitedCount, 5, 'revisited cells count only once')
	await finish(env, [5, 3])
	assert.equal(env.calls.length, 1)
	assert.equal(env.calls[0].action, 'paint')
	assert.deepEqual(env.calls[0].recipe, {
		version: 1,
		weights: [{ resource: 0, weight: 60 }, { resource: 4, weight: 40 }],
		totalWeight: 100
	}, 'the recipe is frozen at mousedown and submitted once with the stroke')
	assert.deepEqual(plain(env.calls[0].targets.map(target => target.cell)), [[1, 3], [2, 3], [4, 3], [5, 3]])
	assert.equal(env.calls[0].initialSkipped, 1)
	assert.equal(env.calls[0].input, 'mouse')
	assert.deepEqual(lastStatus(env), {
		key: 'paintStrokeSummary', kind: 'neutral', duration: 6000, persistent: false,
		values: { painted: 3, replaced: 1, erased: 0, skipped: 1, limit: 512 }
	})
	for (const cleanup of env.cleanups) cleanup()
	assert.equal(env.sandbox[Symbol.for('cattail.world-editor.paint-cube-input')], undefined)
}

async function testEraserAndFailureRouting() {
	const env = createEnvironment()
	env.paintUi.emit({ subtool: 'eraser' })
	env.cellStates.set('7:7', 'painted')
	env.cellStates.set('8:7', 'ordinary')
	begin(env, [7, 7])
	move(env, [8, 7])
	await finish(env, [8, 7])
	assert.equal(env.calls[0].action, 'erase')
	assert.equal(env.calls[0].cubeMode, 'stable')
	assert.equal(env.calls[0].growDurationMs, null)
	assert.deepEqual(plain(env.calls[0].targets.map(target => target.cell)), [[7, 7]])
	assert.equal(env.calls[0].initialSkipped, 1)

	env.paintUi.emit({ subtool: 'brush' })
	env.setResult({ accepted: false, executed: false, error: { code: 'EXTERNAL_CHANGE' } })
	begin(env, [10, 10])
	await finish(env, [10, 10])
	assert.deepEqual(lastStatus(env), {
		key: 'historyExternalChange', kind: 'warning', duration: 6000, persistent: false, values: {}
	})
	env.setResult({ accepted: false, executed: false, error: { code: 'ROLLBACK_FAILED' } })
	begin(env, [11, 11])
	await finish(env, [11, 11])
	assert.deepEqual(lastStatus(env), {
		key: 'historyReloadRequired', kind: 'terminal', duration: 0, persistent: true, values: {}
	})
}

async function testGrowModeAndFrozenDuration() {
	const env = createEnvironment()
	env.paintUi.emit({ cubeMode: 'grow', growAvailable: true, growDurationMs: 4000 })
	begin(env, [20, 20])
	assert.equal(env.service.snapshot().cubeMode, 'grow')
	assert.equal(env.service.snapshot().growDurationMs, 4000)
	env.paintUi.emit({ growDurationMs: 20000 })
	assert.equal(env.service.snapshot().active, true, 'a hot duration change does not cancel the current stroke')
	assert.equal(env.service.snapshot().growDurationMs, 4000, 'the current stroke keeps its mousedown duration')
	move(env, [21, 20])
	await finish(env, [21, 20])
	assert.equal(env.calls[0].cubeMode, 'grow')
	assert.equal(env.calls[0].growDurationMs, 4000)

	begin(env, [22, 20])
	await finish(env, [22, 20])
	assert.equal(env.calls[1].growDurationMs, 20000, 'the next stroke reads the hot setting')

	const unavailable = createEnvironment()
	unavailable.paintUi.emit({ cubeMode: 'grow', growAvailable: false, growDurationMs: 4000 })
	begin(unavailable, [30, 30])
	assert.equal(unavailable.service.snapshot().active, false)
	assert.equal(unavailable.calls.length, 0)
	assert.equal(lastStatus(unavailable).key, 'historyNotReady')
	assert.equal(lastStatus(unavailable).kind, 'warning')
}

async function testActiveStrokeSurvivesDragVisualStateChanges() {
	const env = createEnvironment()
	begin(env, [50, 50])
	env.game.mouse.cursorVisible = false
	env.setBlueprintActive(true)
	env.setInputBlocked(true)
	move(env, [52, 50])
	assert.equal(env.service.snapshot().active, true, 'drag-time cursor hiding, preview refresh, or live transaction busy blockers do not cancel a live stroke')
	assert.deepEqual(plain(env.service.snapshot().cells), [[50, 50], [51, 50], [52, 50]])
	await finish(env, [53, 50])
	assert.equal(env.calls.length, 1)
	assert.deepEqual(plain(env.calls[0].targets.map(target => target.cell)), [[50, 50], [51, 50], [52, 50], [53, 50]])
	assert.notEqual(lastStatus(env)?.key, 'paintStrokeCancelled')

	const hiddenAtStart = createEnvironment()
	hiddenAtStart.game.mouse.cursorVisible = false
	begin(hiddenAtStart, [60, 60])
	assert.equal(hiddenAtStart.service.snapshot().active, false, 'hidden cursor still blocks a new stroke from starting')
	assert.equal(hiddenAtStart.calls.length, 0)

	const previewAtStart = createEnvironment({ blueprintActive: true })
	begin(previewAtStart, [61, 60])
	assert.equal(previewAtStart.service.snapshot().active, false, 'active blueprint preview still blocks a new stroke from starting')
	assert.equal(previewAtStart.calls.length, 0)

	const blockedAtStart = createEnvironment({ inputBlocked: true })
	begin(blockedAtStart, [62, 60])
	assert.equal(blockedAtStart.service.snapshot().active, false, 'shared input blockers still block a new stroke from starting')
	assert.equal(blockedAtStart.calls.length, 0)
}

async function testDragSamplesOncePerAnimationFrame() {
	const env = createEnvironment({ deferSampleFrame: true })
	begin(env, [100, 100])
	assert.deepEqual(plain(env.service.snapshot().cells), [[100, 100]])
	move(env, [103, 100])
	move(env, [105, 100])
	assert.deepEqual(plain(env.service.snapshot().cells), [[100, 100]], 'mousemove samples are queued until the next animation frame')
	env.flushAnimationFrame()
	assert.deepEqual(plain(env.service.snapshot().cells), [[100, 100], [101, 100], [102, 100], [103, 100], [104, 100], [105, 100]])
	await finish(env, [105, 100])
	assert.equal(env.calls.length, 1)
	assert.deepEqual(plain(env.calls[0].targets.map(target => target.cell)), [[100, 100], [101, 100], [102, 100], [103, 100], [104, 100], [105, 100]])
}

async function testBucketSingleClickAndCancellation() {
	const env = createEnvironment()
	env.paintUi.emit({ subtool: 'bucket' })
	const down = begin(env, [12, 13])
	assert.equal(down.prevented, true)
	move(env, [20, 20])
	await flush()
	assert.equal(env.fillCalls.length, 1, 'holding or dragging Bucket does not repeat flood fill')
	assert.equal(env.calls.length, 1)
	assert.equal(env.calls[0].source, 'bucket')
	assert.equal(env.calls[0].strictTargets, true)
	assert.deepEqual(env.calls[0].targets.map(target => target.cell), [[12, 13]])
	assert.equal(lastStatus(env).key, 'paintBucketSummary')

	let resolvePlan
	const deferred = { promise: new Promise(resolve => { resolvePlan = resolve }) }
	const cancelled = createEnvironment({ fillDeferred: deferred })
	cancelled.paintUi.emit({ subtool: 'bucket' })
	begin(cancelled, [30, 31])
	assert.equal(cancelled.service.snapshot().planning, true)
	cancelled.windowHub.dispatch('keydown', mouseEvent({ key: 'Escape' }))
	resolvePlan({
		guard: { schema: 1, cell: [30, 31] },
		targets: [{ cell: [30, 31], before: null }],
		componentCount: 1,
		targetCount: 1
	})
	await flush()
	assert.equal(cancelled.calls.length, 0)
	assert.equal(cancelled.service.snapshot().planning, false)
	assert.equal(lastStatus(cancelled).key, 'paintBucketCancelled')
	assert.equal(lastStatus(cancelled).values.reason, 'escape')

	const open = createEnvironment({ fillError: 'OPEN_OR_TOO_LARGE' })
	open.paintUi.emit({ subtool: 'bucket' })
	begin(open, [40, 41])
	await flush()
	assert.equal(open.calls.length, 0)
	assert.equal(lastStatus(open).key, 'paintBucketOpenOrTooLarge')
}

async function testCancellationMatrixAndLimit() {
	const blocked = createEnvironment()
	blocked.paintUi.emit({ paletteOpen: true })
	const blockedDown = begin(blocked, [2, 2])
	assert.equal(blockedDown.prevented, false)
	assert.equal(blocked.service.snapshot().active, false)
	assert.equal(blocked.calls.length, 0)

	const scenarios = [
		['canvas-leave', env => env.canvas.dispatch('mouseleave')],
		['window-blur', env => env.windowHub.dispatch('blur')],
		['escape', env => env.windowHub.dispatch('keydown', mouseEvent({ key: 'Escape' }))],
		['right-button', env => env.canvas.dispatch('mousedown', mouseEvent({ button: 2, buttons: 2 }))],
		['draw-mode-left', env => env.tool.emit({ mode: 'select' })],
		['subtool-changed', env => env.paintUi.emit({ subtool: 'eraser' })],
		['palette-opened', env => env.paintUi.emit({ paletteOpen: true })],
		['recipe-changed', env => env.paintUi.emit({ recipe: {
			version: 1, weights: [{ resource: 2, weight: 100 }], totalWeight: 100
		} })],
		['editor-inactive', env => env.setActive(false)],
		['plane-changed', env => env.game.switchPlane(1)]
	]
	for (const [reason, cancel] of scenarios) {
		const env = createEnvironment()
		begin(env, [2, 2])
		move(env, [3, 2])
		cancel(env)
		await flush()
		assert.equal(env.calls.length, 0, reason)
		assert.equal(env.service.snapshot().active, false, reason)
		assert.equal(lastStatus(env).key, 'paintStrokeCancelled', reason)
		assert.equal(lastStatus(env).values.reason, reason)
	}

	const limited = createEnvironment({ maxCells: 2 })
	begin(limited, [0, 0])
	move(limited, [3, 0])
	assert.equal(limited.service.snapshot().limitReached, true)
	assert.deepEqual(plain(limited.service.snapshot().cells), [[0, 0], [1, 0]])
	assert.equal(limited.statuses[0].key, 'paintStrokeLimit')
	await finish(limited, [3, 0])
	assert.equal(limited.calls[0].targets.length, 2)
	assert.equal(limited.calls[0].initialSkipped, 2)
	assert.equal(limited.calls[0].limitReached, true)
}

async function testLateCompletionAndUnsafeCells() {
	let resolveStroke
	const deferred = { promise: new Promise(resolve => { resolveStroke = resolve }) }
	const env = createEnvironment({ deferred })
	begin(env, [40, 40])
	env.canvas.dispatch('mouseup', mouseEvent({ button: 0, buttons: 0 }))
	assert.equal(env.service.snapshot().pending, true)
	const statusCount = env.statuses.length
	env.service.dispose('late-completion-test')
	resolveStroke({
		accepted: true,
		executed: true,
		transaction: { summary: { paintedCount: 1, replacedCount: 0, erasedCount: 0, skippedCount: 0 } }
	})
	await flush()
	assert.equal(env.statuses.length, statusCount, 'a disposed stroke generation cannot publish late status')
	assert.equal(env.service.snapshot().lastResult, null, 'a disposed stroke generation cannot publish lastResult')

	const unsafe = createEnvironment()
	begin(unsafe, [Number.MAX_SAFE_INTEGER + 1, 0])
	assert.equal(unsafe.service.snapshot().active, false)
	assert.equal(unsafe.calls.length, 0, 'unsafe integer brush cells are rejected before a transaction')
}

function testManifestShellAndLocalizationContracts() {
	const paintUiIndex = manifest.entry.indexOf('scripts/ui/paint-cube-ui.js')
	const inputIndex = manifest.entry.indexOf('scripts/input/paint-cube-input.js')
	const selectionIndex = manifest.entry.indexOf('scripts/input/selection-controller.js')
	assert.ok(paintUiIndex >= 0 && paintUiIndex < inputIndex)
	assert.ok(inputIndex >= 0 && inputIndex < selectionIndex)
	assert.match(shellSource, /PAINT_STATUS_EVENT/)
	assert.match(shellSource, /paintStrokeSummary/)
	assert.match(shellSource, /paintStrokeCancelled/)
	assert.match(shellSource, /paintStrokeLimit/)
	assert.match(shellSource, /paintNoChanges/)
	assert.doesNotMatch(inputSource, /\bgame\.(?:addEntity|clearCell)\b/)
	assert.match(inputSource, /Game\.prototype, 'switchPlane'/)
	assert.doesNotMatch(inputSource, /schemaVersion\s*[:=]\s*7/i)

	const definitions = []
	const sandbox = { ModLoader: { register(definition) { definitions.push(definition) } } }
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	definitions[0].init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	for (const key of ['paintBrush', 'paintBucket', 'paintEraser', 'paintStrokeSummary', 'paintStrokeCancelled', 'paintStrokeLimit', 'paintNoChanges', 'paintBucketPlanning', 'paintBucketCancelled', 'paintBucketSummary', 'paintBucketOpenOrTooLarge', 'paintGrowSaveFailed']) {
		assert.ok(i18n.keys.includes(key), key)
		for (const language of manifest.languages) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key, language + ' ' + key)
			assert.ok(translated.trim(), language + ' ' + key)
		}
	}
}

async function run() {
	await testPendingStrokeAndSingleSubmission()
	await testEraserAndFailureRouting()
	await testGrowModeAndFrozenDuration()
	await testActiveStrokeSurvivesDragVisualStateChanges()
	await testDragSamplesOncePerAnimationFrame()
	await testBucketSingleClickAndCancellation()
	await testCancellationMatrixAndLimit()
	await testLateCompletionAndUnsafeCells()
	testManifestShellAndLocalizationContracts()
	console.log('World Editor 5C-9 input verification passed: live Brush/Eraser sampling, frozen Brush/Grow routing, single-click non-repeating Bucket submission, planning cancellation/failure status, palette blocking, one-operation transactions, and Brush 512 cap routing.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
