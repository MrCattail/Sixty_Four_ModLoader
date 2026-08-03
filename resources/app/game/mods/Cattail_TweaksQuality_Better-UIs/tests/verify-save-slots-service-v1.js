const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SOURCE = fs.readFileSync(path.join(MOD_ROOT, 'scripts/save-slots.js'), 'utf8')
const SERVICE_KEY = Symbol.for('cattail.better-uis.save-slots')

function encode(value) {
	return Buffer.from(JSON.stringify(value), 'binary').toString('base64')
}

function decode(value) {
	try {
		return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('binary'))
	} catch (error) {
		return 0
	}
}

function createStorage(seed) {
	const values = new Map(Object.entries(seed || {}))
	return {
		values,
		api: {
			getItem(key) {
				return values.has(String(key)) ? values.get(String(key)) : null
			},
			setItem(key, value) {
				values.set(String(key), String(value))
			},
			removeItem(key) {
				values.delete(String(key))
			}
		}
	}
}

function createRuntime(storage, options = {}) {
	let definition = null
	const hooks = new Map()
	const reloads = []
	const sandbox = {
		console: { info() {}, warn() {}, log() {} },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
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
		parseInt,
		parseFloat,
		isFinite,
		localStorage: storage.api,
		setTimeout(callback) {
			reloads.push(callback)
			return reloads.length
		},
		clearTimeout() {},
		location: { reload() {} },
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(SOURCE, sandbox, { filename: 'save-slots.js' })
	assert.ok(definition)
	const pages = {
		register() {},
		isActive() { return false },
		refresh() {}
	}
	definition.init({
		id: definition.id,
		config: { get() { return options.enabled !== false } },
		ui: { pages },
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		},
		patch() {}
	})
	return {
		sandbox,
		reloads,
		service: sandbox[SERVICE_KEY],
		async stage(name, payload, game) {
			for (const listener of hooks.get(name) || []) await listener(payload, game)
		}
	}
}

function createGame(options = {}) {
	const sends = []
	return {
		steamId: options.steamId || 'player-1',
		preventSaving: false,
		preventCloud: false,
		decodeSave: decode,
		spaceport: {
			send(type, data) {
				if (options.throwOnSend) throw new Error('send failed')
				sends.push({ type, data })
			}
		},
		sends
	}
}

async function verifyCreateFinalizeAndConflict() {
	const steamId = 'player-1'
	const autoKey = 'abstractv03' + steamId
	const slotsKey = 'abstractv03_saveSlots' + steamId
	const originalId = '11111111-1111-4111-8111-111111111111'
	const creativeId = '22222222-2222-4222-8222-222222222222'
	const original = encode({ timestamp: 10, resources: [], modloader: { saveInstanceId: originalId } })
	const creative = encode({
		timestamp: 20,
		resources: [],
		modloader: {
			worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 20 }
		}
	})
	const storage = createStorage({ [autoKey]: original })
	const runtime = createRuntime(storage)
	const game = createGame({ steamId })
	await runtime.stage('afterGameInit', null, game)

	const before = runtime.service.snapshot()
	assert.equal(before.ready, true)
	assert.equal(before.emptyCount, 10)
	assert.equal(before.slots.some(slot => Object.hasOwn(slot, 'data')), false)

	const result = await runtime.service.createAndActivate({
		entries: [
			{ name: '主存档', data: original, nameConflict: 'allow' },
			{ name: '主存档创造模式', data: creative, nameConflict: 'reject' }
		],
		activateEntry: 1
	})
	assert.equal(result.activated, true)
	assert.equal(result.activeIndex, 1)
	assert.equal(game.preventSaving, true)
	assert.equal(storage.api.getItem(autoKey), creative)
	assert.equal(game.sends.length, 1)

	let slots = JSON.parse(storage.api.getItem(slotsKey))
	assert.equal(slots[0].name, '主存档')
	assert.equal(decode(slots[0].data).modloader.saveInstanceId, originalId)
	assert.equal(slots[1].name, '主存档创造模式')
	assert.ok(slots[1].pendingActivation?.token)
	assert.equal(decode(slots[1].data).modloader.saveInstanceId, undefined)

	const activeAfterReload = decode(creative)
	activeAfterReload.timestamp = 30
	activeAfterReload.modloader.saveInstanceId = creativeId
	storage.api.setItem(autoKey, encode(activeAfterReload))
	const reloaded = createRuntime(storage)
	const reloadedGame = createGame({ steamId })
	await reloaded.stage('afterGameInit', null, reloadedGame)

	slots = JSON.parse(storage.api.getItem(slotsKey))
	assert.equal(slots[1].pendingActivation, undefined)
	assert.equal(decode(slots[1].data).modloader.saveInstanceId, creativeId)
	assert.equal(reloaded.service.snapshot().source.name, '主存档创造模式')
	assert.equal(reloaded.service.snapshot().pendingActivation, false)

	await assert.rejects(
		reloaded.service.createAndActivate({
			entries: [
				{ name: '主存档', data: original, nameConflict: 'allow' },
				{ name: '主存档创造模式', data: creative, nameConflict: 'reject' }
			],
			activateEntry: 1
		}),
		error => error?.code === 'NAME_CONFLICT'
	)
}

async function verifyRollbackOnActivationFailure() {
	const steamId = 'player-2'
	const autoKey = 'abstractv03' + steamId
	const slotsKey = 'abstractv03_saveSlots' + steamId
	const original = encode({
		timestamp: 10,
		resources: [],
		modloader: { saveInstanceId: '33333333-3333-4333-8333-333333333333' }
	})
	const creative = encode({
		timestamp: 20,
		resources: [],
		modloader: { worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 20 } }
	})
	const storage = createStorage({ [autoKey]: original })
	const runtime = createRuntime(storage)
	const game = createGame({ steamId, throwOnSend: true })
	await runtime.stage('afterGameInit', null, game)

	await assert.rejects(
		runtime.service.createAndActivate({
			entries: [
				{ name: 'Original', data: original, nameConflict: 'allow' },
				{ name: 'Original创造模式', data: creative, nameConflict: 'reject' }
			],
			activateEntry: 1
		}),
		error => error?.code === 'ACTIVATE_FAILED'
	)
	assert.equal(storage.api.getItem(autoKey), original)
	assert.equal(storage.api.getItem(slotsKey), null)
	assert.equal(game.preventSaving, false)
	assert.equal(runtime.service.snapshot().emptyCount, 10)
}

async function verifyFinalizationRejectsWrongActiveSave() {
	const steamId = 'player-3'
	const autoKey = 'abstractv03' + steamId
	const original = encode({
		timestamp: 10,
		modloader: { saveInstanceId: '44444444-4444-4444-8444-444444444444' }
	})
	const creative = encode({
		timestamp: 20,
		modloader: { worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 20 } }
	})
	const storage = createStorage({ [autoKey]: original })
	const runtime = createRuntime(storage)
	await runtime.stage('afterGameInit', null, createGame({ steamId }))
	await runtime.service.createAndActivate({
		entries: [
			{ name: 'Original', data: original, nameConflict: 'allow' },
			{ name: 'Original创造模式', data: creative, nameConflict: 'reject' }
		],
		activateEntry: 1
	})

	storage.api.setItem(autoKey, encode({
		timestamp: 30,
		modloader: {
			saveInstanceId: '55555555-5555-4555-8555-555555555555',
			worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 999 }
		}
	}))
	const reloaded = createRuntime(storage)
	await reloaded.stage('afterGameInit', null, createGame({ steamId }))
	const state = reloaded.service.snapshot()
	assert.equal(state.ready, false)
	assert.equal(state.pendingActivation, true)
	assert.equal(state.error.code, 'VERIFY_FAILED')
}

async function verifyFinalizationIsIdempotentAfterSlotWrite() {
	const steamId = 'player-4'
	const autoKey = 'abstractv03' + steamId
	const slotsKey = 'abstractv03_saveSlots' + steamId
	const pendingKey = 'abstractv03_saveSlotsPendingActivation' + steamId
	const original = encode({
		timestamp: 10,
		modloader: { saveInstanceId: '66666666-6666-4666-8666-666666666666' }
	})
	const creative = encode({
		timestamp: 20,
		modloader: { worldEditor: { schema: 1, creativeMode: true, entryMode: 'forked', createdAt: 20 } }
	})
	const storage = createStorage({ [autoKey]: original })
	const runtime = createRuntime(storage)
	await runtime.stage('afterGameInit', null, createGame({ steamId }))
	await runtime.service.createAndActivate({
		entries: [
			{ name: 'Original', data: original, nameConflict: 'allow' },
			{ name: 'Original创造模式', data: creative, nameConflict: 'reject' }
		],
		activateEntry: 1
	})

	const active = decode(creative)
	active.timestamp = 30
	active.modloader.saveInstanceId = '77777777-7777-4777-8777-777777777777'
	const activeData = encode(active)
	storage.api.setItem(autoKey, activeData)
	const slots = JSON.parse(storage.api.getItem(slotsKey))
	slots[1] = {
		name: slots[1].name,
		data: activeData,
		timestamp: 30,
		createdAt: slots[1].createdAt,
		updatedAt: 30
	}
	storage.api.setItem(slotsKey, JSON.stringify(slots))
	assert.ok(storage.api.getItem(pendingKey))

	const reloaded = createRuntime(storage)
	await reloaded.stage('afterGameInit', null, createGame({ steamId }))
	assert.equal(storage.api.getItem(pendingKey), null)
	assert.equal(reloaded.service.snapshot().ready, true)
	assert.equal(reloaded.service.snapshot().source.saveInstanceId, active.modloader.saveInstanceId)
}

async function verifyDisabledService() {
	const storage = createStorage()
	const runtime = createRuntime(storage, { enabled: false })
	assert.equal(runtime.service, undefined)
}

Promise.resolve()
	.then(verifyCreateFinalizeAndConflict)
	.then(verifyRollbackOnActivationFailure)
	.then(verifyFinalizationRejectsWrongActiveSave)
	.then(verifyFinalizationIsIdempotentAfterSlotWrite)
	.then(verifyDisabledService)
	.then(function () {
		console.log('Better UIs Save Slots Service v1 verification passed.')
	})
	.catch(function (error) {
		console.error(error)
		process.exitCode = 1
	})
