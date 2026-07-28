const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const TRANSACTION_SOURCE = 'scripts/core/editor-transactions.js'
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const SAVE_ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SAVE_ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

class SnapshotStore {
	constructor() {
		this.created = []
		this.removed = []
		this.mode = 'immediate'
		this.pending = []
		this.onCreate = null
	}

	create(options) {
		this.created.push(options)
		if (typeof this.onCreate === 'function') {
			const callback = this.onCreate
			this.onCreate = null
			callback(options)
		}
		if (this.mode === 'fail') return Promise.reject(new Error('snapshot failed'))
		if (this.mode === 'missing-id') return Promise.resolve({})
		if (this.mode === 'deferred') {
			return new Promise((resolve, reject) => {
				this.pending.push({ resolve, reject, id: 'snapshot-' + this.created.length })
			})
		}
		return Promise.resolve({ id: 'snapshot-' + this.created.length })
	}

	remove(options) {
		this.removed.push(options.id)
		return Promise.resolve({ removed: true })
	}

	resolveNext() {
		const pending = this.pending.shift()
		assert.ok(pending, 'expected a deferred snapshot')
		pending.resolve({ id: pending.id })
	}
}

function createGame(options = {}) {
	const game = {
		saveId: options.saveId === undefined ? SAVE_ID_A : options.saveId,
		plane: options.plane || 0,
		value: options.value || 0,
		resources: [100, 200],
		stats: { machinesBuild: 0 },
		assembleCalls: 0,
		assembleSave() {
			this.assembleCalls += 1
			return JSON.stringify({
				modloader: this.saveId ? { saveInstanceId: this.saveId } : {},
				value: this.value,
				timestamp: this.assembleCalls
			})
		},
		decodeSave(data) {
			return JSON.parse(data)
		}
	}
	return game
}

function loadRuntime(options = {}) {
	const hooks = new Map()
	const snapshotStore = options.snapshotStore || new SnapshotStore()
	const game = options.game || createGame()
	let definition = null
	let uuidSequence = 0
	const sandbox = {
		console: {
			info() {},
			warn() {},
			error() {}
		},
		Symbol,
		Object,
		Array,
		Map,
		Set,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		Uint8Array,
		crypto: {
			randomUUID() {
				uuidSequence += 1
				return '00000000-0000-4000-8000-' + String(uuidSequence).padStart(12, '0')
			}
		},
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(TRANSACTION_SOURCE), sandbox, { filename: TRANSACTION_SOURCE })
	assert.ok(definition)
	definition.init({
		storage: options.noSnapshots
			? { snapshots: {} }
			: { snapshots: options.snapshotApi || snapshotStore },
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	})
	for (const listener of hooks.get('afterGameInit') || []) listener({}, game)
	const service = sandbox[TRANSACTIONS_KEY]
	assert.ok(service)
	return { service, game, snapshotStore, sandbox, hooks }
}

function createAdapter(game, options = {}) {
	const calls = []
	let preflightCount = 0
	let captureCount = 0
	let applyCount = 0
	let verifyCount = 0
	let restoreCount = 0
	let applyDeferred = null
	if (options.deferApply) {
		applyDeferred = {}
		applyDeferred.promise = new Promise((resolve, reject) => {
			applyDeferred.resolve = resolve
			applyDeferred.reject = reject
		})
	}
	const adapter = {
		version: '1.0.0',
		async prepare(context, inputPayload) {
			calls.push('prepare:' + context.direction)
			if (options.prepareFail) throw new Error('prepare failed')
			return {
				summary: {
					label: 'test-change',
					affectedCount: 1
				},
				scope: { key: 'value' },
				payload: {
					delta: Number(inputPayload.delta)
				}
			}
		},
		async preflight(context, record, direction) {
			preflightCount += 1
			calls.push('preflight:' + direction)
			if (options.preflightFailAt === preflightCount) {
				return { ok: false, code: 'PREFLIGHT_FAILED', message: 'preflight failed' }
			}
			if (typeof options.onPreflight === 'function') {
				options.onPreflight({ context, record, direction, count: preflightCount })
			}
			return { ok: true }
		},
		async capture(context) {
			captureCount += 1
			calls.push('capture:' + context.direction)
			if (options.captureFailAt === captureCount) throw new Error('capture failed')
			if (typeof options.onCapture === 'function') {
				options.onCapture({ context, count: captureCount })
			}
			return { value: game.value }
		},
		async apply(context, record, direction) {
			applyCount += 1
			calls.push('apply:' + direction)
			if (direction === 'forward') game.value += record.payload.delta
			else if (direction === 'undo') game.value = record.before.value
			else game.value = record.after.value
			if (typeof options.onApply === 'function') {
				options.onApply({ context, record, direction, count: applyCount })
			}
			if (applyDeferred) await applyDeferred.promise
			if (options.applyFailDirection === direction) throw new Error('apply failed')
			if (options.applyReturnFalseDirection === direction) return { ok: false, message: 'apply returned false' }
			return { ok: true }
		},
		async verify(context, record, direction, observed) {
			verifyCount += 1
			calls.push('verify:' + direction)
			if (options.verifyFailDirection === direction) {
				return { ok: false, code: 'VERIFY_FAILED', message: 'verify failed' }
			}
			if (typeof options.onVerify === 'function') {
				options.onVerify({ context, record, direction, observed, count: verifyCount })
			}
			return { ok: true }
		},
		async restore(context, record, target) {
			restoreCount += 1
			calls.push('restore:' + target)
			if (options.restoreFail) throw new Error('restore failed')
			game.value = record[target].value
			if (options.restoreMismatch) game.value += 1
			return { ok: true }
		}
	}
	return {
		adapter,
		calls,
		applyDeferred,
		counts() {
			return { preflightCount, captureCount, applyCount, verifyCount, restoreCount }
		}
	}
}

function registerStandard(runtime, options = {}) {
	const created = createAdapter(runtime.game, options)
	const unregister = runtime.service.registerAdapter('test-change', created.adapter)
	return Object.assign(created, { unregister })
}

function request(delta = 1, input = 'keyboard') {
	return {
		kind: 'test-change',
		input,
		payload: { delta }
	}
}

async function flush() {
	for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

async function testInitializationAndLifecycle() {
	const runtime = loadRuntime()
	const first = runtime.service.snapshot()
	assert.equal(first.version, '1.0.0')
	assert.equal(first.ready, true)
	assert.equal(first.busy, false)
	assert.equal(first.phase, 'idle')
	assert.equal(first.undoCount, 0)
	assert.equal(first.redoCount, 0)
	assert.equal(first.undoBlockedReason, 'NO_UNDO')
	assert.equal(first.redoBlockedReason, 'NO_REDO')
	assert.deepEqual(first.registeredKinds, [])
	assert.ok(Object.isFrozen(first))

	let notifications = 0
	const unsubscribe = runtime.service.subscribe(() => {
		notifications += 1
		throw new Error('listener isolation')
	})
	registerStandard(runtime)
	assert.ok(notifications >= 2)
	unsubscribe()
	assert.equal(runtime.service.dispose('test-dispose'), true)
	assert.equal(runtime.service.snapshot().disposed, true)
	assert.equal(runtime.sandbox[TRANSACTIONS_KEY], undefined)
}

async function testUnavailableDependencies() {
	const noSnapshots = loadRuntime({ noSnapshots: true })
	registerStandard(noSnapshots)
	assert.equal(noSnapshots.service.snapshot().ready, false)
	const snapshotFailure = await noSnapshots.service.execute(request())
	assert.equal(snapshotFailure.accepted, true)
	assert.equal(snapshotFailure.executed, false)
	assert.equal(snapshotFailure.error.code, 'SNAPSHOT_UNAVAILABLE')
	assert.equal(noSnapshots.game.value, 0)
	assert.equal(noSnapshots.service.snapshot().undoCount, 0)

	let createWithoutRemoveCalls = 0
	const noRemove = loadRuntime({
		snapshotApi: {
			create() {
				createWithoutRemoveCalls += 1
				return Promise.resolve({ id: 'unsafe-snapshot' })
			}
		}
	})
	registerStandard(noRemove)
	const removeFailure = await noRemove.service.execute(request())
	assert.equal(removeFailure.error.code, 'SNAPSHOT_UNAVAILABLE')
	assert.equal(createWithoutRemoveCalls, 0)

	const noIdentity = loadRuntime({ game: createGame({ saveId: null }) })
	registerStandard(noIdentity)
	assert.equal(noIdentity.service.snapshot().ready, false)
	const identityFailure = await noIdentity.service.execute(request())
	assert.equal(identityFailure.accepted, false)
	assert.equal(identityFailure.error.code, 'SAVE_IDENTITY_UNAVAILABLE')
	assert.equal(noIdentity.snapshotStore.created.length, 0)
}

async function testAdapterRegistrationContract() {
	const runtime = loadRuntime()
	const created = registerStandard(runtime)
	assert.deepEqual(runtime.service.snapshot().registeredKinds, ['test-change'])
	assert.throws(
		() => runtime.service.registerAdapter('test-change', created.adapter),
		(error) => error.code === 'ADAPTER_EXISTS'
	)
	assert.throws(
		() => runtime.service.registerAdapter('Bad Kind', created.adapter),
		(error) => error.code === 'INVALID_SPEC'
	)
	assert.throws(
		() => runtime.service.registerAdapter('missing-methods', { version: '1.0.0' }),
		(error) => error.code === 'INVALID_SPEC'
	)
	assert.equal(created.unregister(), true)
	assert.deepEqual(runtime.service.snapshot().registeredKinds, [])
	const replacement = registerStandard(runtime)
	assert.equal(typeof replacement.unregister, 'function')
}

async function testPayloadSafety() {
	const runtime = loadRuntime()
	registerStandard(runtime)
	const cyclic = { delta: 1 }
	cyclic.self = cyclic
	for (const payload of [
		{ delta: Infinity },
		cyclic,
		{ delta: () => 1 },
		new Date()
	]) {
		const result = await runtime.service.execute({
			kind: 'test-change',
			input: 'api',
			payload
		})
		assert.equal(result.accepted, false)
		assert.equal(result.error.code, 'INVALID_SPEC')
	}
	const dangerous = {}
	Object.defineProperty(dangerous, '__proto__', {
		value: { polluted: true },
		enumerable: true
	})
	const dangerousResult = await runtime.service.execute({
		kind: 'test-change',
		input: 'api',
		payload: dangerous
	})
	assert.equal(dangerousResult.error.code, 'INVALID_SPEC')
	const accessorArray = [1]
	Object.defineProperty(accessorArray, 0, {
		get() {
			throw new Error('must not invoke array getter')
		},
		enumerable: true
	})
	const accessorResult = await runtime.service.execute({
		kind: 'test-change',
		input: 'api',
		payload: { delta: accessorArray }
	})
	assert.equal(accessorResult.error.code, 'INVALID_SPEC')
	assert.equal(runtime.snapshotStore.created.length, 0)
	assert.equal(runtime.game.value, 0)
}

async function testSuccessfulForwardContract() {
	const runtime = loadRuntime()
	const created = registerStandard(runtime)
	const phases = []
	const stop = runtime.service.subscribe((state) => phases.push(state.phase))
	phases.length = 0
	const result = await runtime.service.execute(request(3, 'keyboard'))
	stop()

	assert.equal(result.accepted, true)
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(result.direction, 'forward')
	assert.equal(result.reason, 'complete')
	assert.equal(runtime.game.value, 3)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(runtime.snapshotStore.created[0].reason, 'world-editor-before-forward')
	assert.equal(runtime.snapshotStore.created[0].tags.feature, 'world-editor-transaction')
	assert.equal(runtime.snapshotStore.created[0].tags.direction, 'forward')
	assert.equal(runtime.snapshotStore.created[0].tags.input, 'keyboard')
	assert.equal(runtime.snapshotStore.created[0].tags.originInput, 'keyboard')
	assert.equal(runtime.snapshotStore.created[0].tags.plane, 'reality')
	assert.equal(runtime.snapshotStore.created[0].tags.transactionId, result.transaction.id)
	assert.notEqual(runtime.snapshotStore.created[0].tags.operationId, '')
	assert.deepEqual(created.calls, [
		'prepare:forward',
		'preflight:forward',
		'capture:forward',
		'preflight:forward',
		'capture:forward',
		'apply:forward',
		'capture:forward',
		'verify:forward'
	])
	assert.deepEqual(phases, [
		'preparing',
		'preflighting',
		'snapshotting',
		'revalidating',
		'applying',
		'verifying',
		'idle'
	])
	const state = runtime.service.snapshot()
	assert.equal(state.undoCount, 1)
	assert.equal(state.redoCount, 0)
	assert.equal(state.canUndo, true)
	assert.equal(state.undoTop.id, result.transaction.id)
	assert.ok(Object.isFrozen(result))
	assert.ok(Object.isFrozen(result.transaction))
}

async function testPreparePreflightAndCaptureFailures() {
	for (const options of [
		{ prepareFail: true },
		{ preflightFailAt: 1 },
		{ captureFailAt: 1 }
	]) {
		const runtime = loadRuntime()
		registerStandard(runtime, options)
		const result = await runtime.service.execute(request())
		assert.equal(result.accepted, true)
		assert.equal(result.executed, false)
		assert.equal(result.error.code, 'PREFLIGHT_FAILED')
		assert.equal(runtime.snapshotStore.created.length, 0)
		assert.equal(runtime.game.value, 0)
		assert.equal(runtime.service.snapshot().undoCount, 0)
		assert.equal(runtime.service.snapshot().phase, 'idle')
	}
}

async function testSnapshotFailures() {
	for (const mode of ['fail', 'missing-id']) {
		const store = new SnapshotStore()
		store.mode = mode
		const runtime = loadRuntime({ snapshotStore: store })
		registerStandard(runtime)
		const result = await runtime.service.execute(request())
		assert.equal(result.accepted, true)
		assert.equal(result.executed, false)
		assert.equal(result.error.code, 'SNAPSHOT_FAILED')
		assert.equal(runtime.game.value, 0)
		assert.equal(runtime.service.snapshot().undoCount, 0)
	}
}

async function testPostSnapshotRevalidationFailures() {
	const identityRuntime = loadRuntime()
	registerStandard(identityRuntime)
	identityRuntime.snapshotStore.onCreate = () => {
		identityRuntime.game.saveId = SAVE_ID_B
	}
	const identityResult = await identityRuntime.service.execute(request())
	assert.equal(identityResult.error.code, 'SAVE_CHANGED')
	assert.deepEqual(identityRuntime.snapshotStore.removed, ['snapshot-1'])
	assert.equal(identityRuntime.game.value, 0)

	const planeRuntime = loadRuntime()
	registerStandard(planeRuntime)
	planeRuntime.snapshotStore.onCreate = () => {
		planeRuntime.game.plane = 1
	}
	const planeResult = await planeRuntime.service.execute(request())
	assert.equal(planeResult.error.code, 'PLANE_CHANGED')
	assert.deepEqual(planeRuntime.snapshotStore.removed, ['snapshot-1'])
	assert.equal(planeRuntime.game.value, 0)

	const guardRuntime = loadRuntime()
	registerStandard(guardRuntime)
	guardRuntime.snapshotStore.onCreate = () => {
		guardRuntime.game.value = 9
	}
	const guardResult = await guardRuntime.service.execute(request())
	assert.equal(guardResult.error.code, 'EXTERNAL_CHANGE')
	assert.deepEqual(guardRuntime.snapshotStore.removed, ['snapshot-1'])
	assert.equal(guardRuntime.service.snapshot().undoCount, 0)
}

async function testApplyAndVerifyRollback() {
	const applyRuntime = loadRuntime()
	const applyAdapter = registerStandard(applyRuntime, { applyFailDirection: 'forward' })
	const applyResult = await applyRuntime.service.execute(request(4))
	assert.equal(applyResult.accepted, true)
	assert.equal(applyResult.executed, false)
	assert.equal(applyResult.reason, 'rolled-back')
	assert.equal(applyResult.error.code, 'APPLY_FAILED')
	assert.equal(applyRuntime.game.value, 0)
	assert.equal(applyRuntime.snapshotStore.removed.length, 0)
	assert.equal(applyRuntime.service.snapshot().undoCount, 0)
	assert.equal(applyAdapter.counts().applyCount, 1)
	assert.equal(applyAdapter.counts().restoreCount, 1)

	const verifyRuntime = loadRuntime()
	const verifyAdapter = registerStandard(verifyRuntime, { verifyFailDirection: 'forward' })
	const verifyResult = await verifyRuntime.service.execute(request(5))
	assert.equal(verifyResult.reason, 'rolled-back')
	assert.equal(verifyResult.error.code, 'VERIFY_FAILED')
	assert.equal(verifyRuntime.game.value, 0)
	assert.equal(verifyAdapter.counts().restoreCount, 1)
	assert.equal(verifyRuntime.snapshotStore.removed.length, 0)
}

async function testRollbackFailureTerminalBlock() {
	const runtime = loadRuntime()
	registerStandard(runtime, {
		applyFailDirection: 'forward',
		restoreFail: true
	})
	const result = await runtime.service.execute(request())
	assert.equal(result.error.code, 'ROLLBACK_FAILED')
	const state = runtime.service.snapshot()
	assert.equal(state.phase, 'blocked')
	assert.equal(state.terminalBlockedReason, 'ROLLBACK_FAILED')
	assert.equal(state.canUndo, false)
	assert.equal(runtime.service.clear('try-clear').error.code, 'ROLLBACK_FAILED')
	const retry = await runtime.service.execute(request())
	assert.equal(retry.accepted, false)
	assert.equal(retry.error.code, 'ROLLBACK_FAILED')
	assert.equal(runtime.snapshotStore.created.length, 1)
}

async function testUndoRedoAndSnapshotMetadata() {
	const runtime = loadRuntime()
	registerStandard(runtime)
	const forward = await runtime.service.execute(request(6, 'keyboard'))
	assert.equal(runtime.game.value, 6)

	const undo = await runtime.service.undo({ input: 'api' })
	assert.equal(undo.executed, true)
	assert.equal(runtime.game.value, 0)
	assert.equal(runtime.service.snapshot().undoCount, 0)
	assert.equal(runtime.service.snapshot().redoCount, 1)
	assert.equal(runtime.snapshotStore.created[1].reason, 'world-editor-before-undo')
	assert.equal(runtime.snapshotStore.created[1].tags.input, 'api')
	assert.equal(runtime.snapshotStore.created[1].tags.originInput, 'keyboard')
	assert.equal(runtime.snapshotStore.created[1].tags.transactionId, forward.transaction.id)
	assert.notEqual(
		runtime.snapshotStore.created[1].tags.operationId,
		runtime.snapshotStore.created[0].tags.operationId
	)

	const redo = await runtime.service.redo({ input: 'gamepad' })
	assert.equal(redo.executed, true)
	assert.equal(runtime.game.value, 6)
	assert.equal(runtime.service.snapshot().undoCount, 1)
	assert.equal(runtime.service.snapshot().redoCount, 0)
	assert.equal(runtime.snapshotStore.created[2].reason, 'world-editor-before-redo')
	assert.equal(runtime.snapshotStore.created[2].tags.input, 'gamepad')
	assert.equal(runtime.snapshotStore.created[2].tags.originInput, 'keyboard')
	assert.equal(redo.transaction.snapshotId, forward.snapshotId)
}

async function testExternalGuardAndDeltaCoexistence() {
	const blockedRuntime = loadRuntime()
	registerStandard(blockedRuntime)
	await blockedRuntime.service.execute(request(2))
	blockedRuntime.game.value = 99
	const snapshotsBefore = blockedRuntime.snapshotStore.created.length
	const blocked = await blockedRuntime.service.undo({ input: 'api' })
	assert.equal(blocked.error.code, 'EXTERNAL_CHANGE')
	assert.equal(blockedRuntime.snapshotStore.created.length, snapshotsBefore)
	assert.equal(blockedRuntime.service.snapshot().undoCount, 1)

	const delayedRuntime = loadRuntime()
	registerStandard(delayedRuntime)
	await delayedRuntime.service.execute(request(3))
	delayedRuntime.snapshotStore.onCreate = () => {
		delayedRuntime.game.value = 12
	}
	const delayed = await delayedRuntime.service.undo({ input: 'api' })
	assert.equal(delayed.error.code, 'EXTERNAL_CHANGE')
	assert.equal(delayedRuntime.snapshotStore.removed.at(-1), 'snapshot-2')
	assert.equal(delayedRuntime.service.snapshot().undoCount, 1)

	const deltaRuntime = loadRuntime()
	registerStandard(deltaRuntime)
	await deltaRuntime.service.execute(request(4))
	deltaRuntime.game.resources[0] += 50
	deltaRuntime.game.stats.machinesBuild += 7
	const deltaUndo = await deltaRuntime.service.undo({ input: 'api' })
	assert.equal(deltaUndo.executed, true)
	assert.equal(deltaRuntime.game.resources[0], 150)
	assert.equal(deltaRuntime.game.stats.machinesBuild, 7)
}

async function testRedoClearingRules() {
	const runtime = loadRuntime()
	const created = registerStandard(runtime)
	await runtime.service.execute(request(1))
	await runtime.service.undo({ input: 'api' })
	assert.equal(runtime.service.snapshot().redoCount, 1)

	const originalPrepare = created.adapter.prepare
	created.adapter.prepare = async function () {
		throw new Error('blocked new forward')
	}
	const failed = await runtime.service.execute(request(2))
	assert.equal(failed.error.code, 'PREFLIGHT_FAILED')
	assert.equal(runtime.service.snapshot().redoCount, 1)
	created.adapter.prepare = originalPrepare

	const successful = await runtime.service.execute(request(2))
	assert.equal(successful.executed, true)
	assert.equal(runtime.service.snapshot().redoCount, 0)
	assert.equal(runtime.service.snapshot().undoCount, 1)
}

async function testHistoryLimit() {
	const runtime = loadRuntime()
	registerStandard(runtime)
	let firstId = null
	for (let index = 0; index < 51; index += 1) {
		const result = await runtime.service.execute(request(1, 'api'))
		if (index === 0) firstId = result.transaction.id
	}
	const state = runtime.service.snapshot()
	assert.equal(state.undoCount, 50)
	assert.notEqual(state.undoTop.id, firstId)
	for (let index = 0; index < 50; index += 1) {
		const result = await runtime.service.undo({ input: 'api' })
		assert.equal(result.executed, true)
	}
	assert.equal(runtime.service.snapshot().undoCount, 0)
	assert.equal(runtime.service.snapshot().redoCount, 50)
}

async function testBusyDuplicateSuppression() {
	const store = new SnapshotStore()
	store.mode = 'deferred'
	const runtime = loadRuntime({ snapshotStore: store })
	const created = registerStandard(runtime)
	const first = runtime.service.execute(request(1))
	await flush()
	assert.equal(runtime.service.isBusy(), true)
	assert.equal(store.pending.length, 1)
	const duplicate = await runtime.service.execute(request(1))
	assert.equal(duplicate.accepted, false)
	assert.equal(duplicate.error.code, 'BUSY')
	assert.equal(store.created.length, 1)
	assert.equal(created.unregister(), false)
	store.resolveNext()
	const firstResult = await first
	assert.equal(firstResult.executed, true)
	assert.equal(created.counts().applyCount, 1)
}

async function testSaveIdentityPlaneAndAdapterAvailability() {
	const planeRuntime = loadRuntime()
	registerStandard(planeRuntime)
	await planeRuntime.service.execute(request())
	planeRuntime.game.plane = 1
	const planeResult = await planeRuntime.service.undo({ input: 'api' })
	assert.equal(planeResult.accepted, false)
	assert.equal(planeResult.error.code, 'PLANE_CHANGED')
	assert.equal(planeRuntime.service.snapshot().undoCount, 1)
	assert.equal(planeRuntime.snapshotStore.created.length, 1)
	planeRuntime.game.plane = 0
	assert.equal((await planeRuntime.service.undo({ input: 'api' })).executed, true)

	const saveRuntime = loadRuntime()
	registerStandard(saveRuntime)
	await saveRuntime.service.execute(request())
	saveRuntime.game.saveId = SAVE_ID_B
	const saveResult = await saveRuntime.service.undo({ input: 'api' })
	assert.equal(saveResult.error.code, 'SAVE_CHANGED')
	assert.equal(saveRuntime.service.snapshot().undoCount, 0)
	assert.equal(saveRuntime.service.snapshot().redoCount, 0)
	assert.equal(saveRuntime.service.snapshot().lastTransaction, null)

	const forwardRuntime = loadRuntime()
	registerStandard(forwardRuntime)
	await forwardRuntime.service.execute(request())
	forwardRuntime.game.saveId = SAVE_ID_B
	const rebound = await forwardRuntime.service.execute(request(2))
	assert.equal(rebound.executed, true)
	assert.equal(forwardRuntime.service.snapshot().undoCount, 1)

	const adapterRuntime = loadRuntime()
	const old = registerStandard(adapterRuntime)
	await adapterRuntime.service.execute(request())
	assert.equal(old.unregister(), true)
	const unavailable = await adapterRuntime.service.undo({ input: 'api' })
	assert.equal(unavailable.error.code, 'ADAPTER_UNAVAILABLE')
	assert.equal(adapterRuntime.service.snapshot().undoCount, 1)
	registerStandard(adapterRuntime)
	assert.equal((await adapterRuntime.service.undo({ input: 'api' })).executed, true)
}

async function testUndoRedoFailureRollback() {
	const undoRuntime = loadRuntime()
	const undoAdapter = registerStandard(undoRuntime)
	await undoRuntime.service.execute(request(5))
	const originalApply = undoAdapter.adapter.apply
	undoAdapter.adapter.apply = async function (context, record, direction) {
		const result = await originalApply.call(this, context, record, direction)
		if (direction === 'undo') throw new Error('undo failed')
		return result
	}
	const undoFailure = await undoRuntime.service.undo({ input: 'api' })
	assert.equal(undoFailure.reason, 'rolled-back')
	assert.equal(undoFailure.error.code, 'APPLY_FAILED')
	assert.equal(undoRuntime.game.value, 5)
	assert.equal(undoRuntime.service.snapshot().undoCount, 1)
	assert.equal(undoRuntime.service.snapshot().redoCount, 0)

	const redoRuntime = loadRuntime()
	const redoAdapter = registerStandard(redoRuntime)
	await redoRuntime.service.execute(request(7))
	await redoRuntime.service.undo({ input: 'api' })
	const redoOriginalApply = redoAdapter.adapter.apply
	redoAdapter.adapter.apply = async function (context, record, direction) {
		const result = await redoOriginalApply.call(this, context, record, direction)
		if (direction === 'redo') throw new Error('redo failed')
		return result
	}
	const redoFailure = await redoRuntime.service.redo({ input: 'api' })
	assert.equal(redoFailure.reason, 'rolled-back')
	assert.equal(redoRuntime.game.value, 0)
	assert.equal(redoRuntime.service.snapshot().undoCount, 0)
	assert.equal(redoRuntime.service.snapshot().redoCount, 1)
}

async function testClearContract() {
	const runtime = loadRuntime()
	registerStandard(runtime)
	const emptyClear = runtime.service.clear('empty-clear')
	assert.equal(emptyClear.cleared, true)
	await runtime.service.execute(request())
	assert.equal(runtime.service.snapshot().undoCount, 1)
	const cleared = runtime.service.clear('manual-clear')
	assert.equal(cleared.cleared, true)
	assert.equal(runtime.service.snapshot().undoCount, 0)
	assert.equal(runtime.service.snapshot().redoCount, 0)
	assert.equal(runtime.snapshotStore.removed.length, 0)
}

async function testDisposeBeforeAndAfterApply() {
	const beforeStore = new SnapshotStore()
	beforeStore.mode = 'deferred'
	const beforeRuntime = loadRuntime({ snapshotStore: beforeStore })
	registerStandard(beforeRuntime)
	const beforeOperation = beforeRuntime.service.execute(request())
	await flush()
	assert.equal(beforeRuntime.service.dispose('dispose-before-apply'), true)
	beforeStore.resolveNext()
	const beforeResult = await beforeOperation
	assert.equal(beforeResult.error.code, 'INVALIDATED')
	assert.equal(beforeRuntime.game.value, 0)
	assert.deepEqual(beforeStore.removed, ['snapshot-1'])
	assert.equal(beforeRuntime.service.snapshot().disposed, true)

	const afterRuntime = loadRuntime()
	const afterAdapter = registerStandard(afterRuntime, { deferApply: true })
	const afterOperation = afterRuntime.service.execute(request(4))
	for (let index = 0; index < 10 && afterRuntime.service.snapshot().phase !== 'applying'; index += 1) {
		await flush()
	}
	assert.equal(afterRuntime.service.snapshot().phase, 'applying')
	assert.equal(afterRuntime.service.dispose('dispose-after-apply'), true)
	assert.equal(afterRuntime.service.snapshot().busy, true)
	afterAdapter.applyDeferred.resolve()
	const afterResult = await afterOperation
	assert.equal(afterResult.executed, true)
	assert.equal(afterRuntime.game.value, 4)
	assert.equal(afterRuntime.service.snapshot().disposed, true)
	assert.equal(afterRuntime.snapshotStore.removed.length, 0)
}

function testStaticIntegrationBoundary() {
	const transactionSource = source(TRANSACTION_SOURCE)
	const manifest = JSON.parse(source('mod.json'))
	const readme = source('README.md')
	const entries = manifest.entry
	const transactionIndex = entries.indexOf(TRANSACTION_SOURCE)
	assert.ok(transactionIndex > entries.indexOf('scripts/core/creative-economy.js'))
	assert.ok(transactionIndex < entries.indexOf('scripts/core/selection-state.js'))
	assert.equal(manifest.version, '0.4.0')
	assert.match(readme, /4A-3a 内部事务引擎/)
	assert.match(readme, /cattail\.world-editor\.transactions/)
	assert.match(transactionSource, /Symbol\.for\('cattail\.world-editor\.transactions'\)/)
	assert.match(transactionSource, /world-editor-before-forward/)
	assert.match(transactionSource, /world-editor-before-undo/)
	assert.match(transactionSource, /world-editor-before-redo/)
	assert.doesNotMatch(transactionSource, /\bapi\.patch\s*\(/)
	assert.doesNotMatch(transactionSource, /\bGame\.prototype\b/)
	assert.doesNotMatch(transactionSource, /\bgame\.(?:addEntity|clearCell|deleteEntity|removeEntity|relocate)\s*\(/)
	assert.doesNotMatch(transactionSource, /\brequestResources\s*\(/)
	assert.doesNotMatch(transactionSource, /\baddEventListener\s*\(/)
	assert.doesNotMatch(transactionSource, /undoButton|redoButton|keydown|keyup/)
}

async function run() {
	testStaticIntegrationBoundary()
	await testInitializationAndLifecycle()
	await testUnavailableDependencies()
	await testAdapterRegistrationContract()
	await testPayloadSafety()
	await testSuccessfulForwardContract()
	await testPreparePreflightAndCaptureFailures()
	await testSnapshotFailures()
	await testPostSnapshotRevalidationFailures()
	await testApplyAndVerifyRollback()
	await testRollbackFailureTerminalBlock()
	await testUndoRedoAndSnapshotMetadata()
	await testExternalGuardAndDeltaCoexistence()
	await testRedoClearingRules()
	await testHistoryLimit()
	await testBusyDuplicateSuppression()
	await testSaveIdentityPlaneAndAdapterAvailability()
	await testUndoRedoFailureRollback()
	await testClearContract()
	await testDisposeBeforeAndAfterApply()
	console.log('World Editor 4A-3a verification passed: 26 transaction lifecycle, snapshot, rollback, history, guard, and disposal contracts.')
}

run().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
