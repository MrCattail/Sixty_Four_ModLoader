// Dependency-free service contract for the regular verifier. The complementary
// verify-save-slots-native-browser.js exercises real IndexedDB and rendered UI.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { webcrypto } = require('node:crypto')
const root = path.resolve(__dirname, '../../..')
const source = fs.readFileSync(path.resolve(__dirname, '../scripts/save-slots.js'), 'utf8')
const native = fs.readFileSync(path.join(root, 'scripts/game.js'), 'utf8')
const clone = value => JSON.parse(JSON.stringify(value))
const id = '11111111-1111-4111-8111-111111111111'
const world = () => ({ stuff: [], resources: [64], timestamp: 100, modloader: { saveInstanceId: id, keep: true } })
const permanent = { glory: [1], completions: 3, upgrades: 4, orbUpgradeMap: [2], memory: { keep: true } }
const slot = (name = 'Main') => ({ name, ownerHash: 42, creationTimeStamp: 1, lastModified: 100, stack: [{ state: world(), permanents: clone(permanent), isProtected: false }] })
const entry = name => ({ name, data: Buffer.from(JSON.stringify(world()), 'binary').toString('base64'), nameConflict: 'reject' })

function database(initial) {
	const state = { values: new Map(initial.map((s, i) => [JSON.stringify(['synthetic', i]), clone(s)])), abortIndex: null }
	state.api = { transaction(storeName, mode) {
		assert.equal(storeName, 'charps_memory_slots')
		const draft = new Map(state.values)
		let aborted = false
		const request = result => { const r = { result }; queueMicrotask(() => r.onsuccess?.()); return r }
		const tx = { error: null,
			abort() { aborted = true; tx.error = new Error('synthetic abort'); queueMicrotask(() => tx.onabort?.()) },
			objectStore() { return {
				put(value, key) { if (state.abortIndex === key[1]) { state.abortIndex = null; throw new Error('synthetic abort') }; draft.set(JSON.stringify(key), clone(value)) },
				delete(key) { draft.delete(JSON.stringify(key)) },
				get(key) { const value = state.values.get(JSON.stringify(key)); return request(value ? clone(value) : undefined) },
				getAllKeys() { return request([...state.values.keys()].map(JSON.parse)) }
			} }
		}
		queueMicrotask(() => { if (!aborted) { if (mode === 'readwrite') state.values = draft; tx.oncomplete?.() } })
		return tx
	} }
	return state
}
async function runtime(options = {}) {
	const slots = options.slots || [slot()]
	const db = options.db || database(slots)
	const storage = options.storage || new Map([['abstractv03synthetic', 'legacy-auto'], ['abstractv03_saveSlotssynthetic', 'legacy-manual']])
	const hooks = new Map(); const reloads = []; const cloud = []; const events = []
	const sandbox = { console: { warn() {}, log() {} }, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array,
		atob, btoa, setTimeout(fn) { reloads.push(fn) }, location: { reload() {} },
		CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
		dispatchEvent(event) { events.push(event) },
		localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
		IDBKeyRange: { bound: () => null }, document: { getElementById: () => null, createElement: () => ({}), head: { append() {} } }
	}
	sandbox.ModLoader = { register(definition) {
		definition.init({ id: definition.id, config: { get: () => options.enabled !== false }, ui: { pages: { register() {}, isActive: () => false, refresh() {} } },
			on(name, fn) { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn) }, patch(target, name, wrapper) { target[name] = wrapper(target[name]) } })
	} }
	vm.createContext(sandbox)
	vm.runInContext(native.slice(native.indexOf('class Game {')) + '\nglobalThis.NativeGame = Game', sandbox)
	const game = Object.assign(Object.create(sandbox.NativeGame.prototype), {
		version: '1.3', steamId: 'synthetic', currentSlotId: options.index || 0, saveSlots: clone(slots), localDatabase: db.api, maxSaveStack: 16,
		assembleSave: () => world(), assemblePermanents: () => clone(permanent),
		savePreferences() { storage.set('abstractv03_preferencessynthetic', JSON.stringify({ currentSlotId: this.currentSlotId })) },
		spaceport: { async invoke(channel, value) { assert.equal(channel, 'store'); cloud.push(clone(value)); return !options.cloudFailure } }
	})
	vm.runInContext(source, sandbox)
	for (const fn of hooks.get('afterVanillaScripts') || []) await fn()
	for (const fn of hooks.get('afterGameInit') || []) await fn(null, game)
	return { game, service: sandbox[Symbol.for('cattail.better-uis.save-slots')], db, storage, cloud, reloads, events }
}
async function main() {
	const protectedArgs = r => ({
		entries: [{ name: 'Protected copy', data: clone(r.game.saveSlots[0].stack[0]), nameConflict: 'reject' }], activateEntry: 0,
		preserveSource: { record: clone(r.game.saveSlots[0].stack[0]), sourceIndex: 0, saveInstanceId: id, name: 'Main', assertCurrent() {} }
	})
	let passed = 0
	const test = async (name, work) => { await work(); passed++; console.log('PASS', name) }
	await test('ready snapshot, native source and unchanged public v1 methods', async () => {
		const r = await runtime(); const state = r.service.snapshot()
		assert.equal(state.ready, true); assert.equal(state.manualSlotCount, 20); assert.equal(state.emptyCount, 19)
		assert.equal(state.source.saveInstanceId, id); assert.equal(r.service.version, 1)
		assert.equal(r.service.capabilities().atomicBatchScope, 'local-indexeddb')
		assert.ok(Object.isFrozen(state)); assert.equal(state.slots.some(s => 'data' in s), false)
	})
	await test('batch native activation persists independent identity and current permanents', async () => {
		const r = await runtime(); const result = await r.service.createAndActivate({ entries: [entry('one'), entry('two')], activateEntry: 1 })
		assert.equal(result.activeIndex, 2); assert.equal(result.reloadScheduled, true); assert.equal(r.reloads.length, 1)
		assert.equal(r.game.preventSaving, true); assert.equal(r.game.saveSlots.length, 3)
		const saved = await r.game.readFromSlot(2)
		assert.notEqual(saved.stack[0].state.modloader.saveInstanceId, id); assert.deepEqual(saved.stack[0].permanents, permanent)
		assert.equal(saved.ownerHash, 42); assert.equal(r.cloud.at(-1).length, 3)
		assert.equal(r.storage.get('abstractv03synthetic'), 'legacy-auto'); assert.equal(r.storage.get('abstractv03_saveSlotssynthetic'), 'legacy-manual')
		const restored = await runtime({ slots: r.game.saveSlots, index: 2, db: r.db, storage: r.storage })
		assert.equal(restored.service.snapshot().ready, true)
		assert.equal(r.storage.has('abstractv03_saveSlotsNativeActivationsynthetic'), false)
		await restored.service.settle({ game: restored.game }); assert.equal(restored.service.snapshot().ready, true)
	})
	await test('argument, name, format, conflict and capacity errors preserve existing slots', async () => {
		const r = await runtime()
		for (const [args, code] of [
			[{ entries: [], activateEntry: 0 }, 'INVALID_ARGUMENT'],
			[{ entries: [entry('')], activateEntry: 0 }, 'INVALID_NAME'],
			[{ entries: [entry('Main')], activateEntry: 0 }, 'NAME_CONFLICT'],
			[{ entries: [{ ...entry('bad'), data: undefined }], activateEntry: 0 }, 'INVALID_SAVE'],
			[{ entries: [{ ...entry('bad'), data: '{"oops":true}' }], activateEntry: 0 }, 'INVALID_SAVE']
		]) await assert.rejects(r.service.createAndActivate(args), e => e.code === code)
		assert.equal(r.game.saveSlots.length, 1)
		const full = await runtime({ slots: Array.from({ length: 20 }, (_, i) => slot(String(i))) })
		await assert.rejects(full.service.createAndActivate({ entries: [entry('extra')], activateEntry: 0 }), e => e.code === 'INSUFFICIENT_EMPTY_SLOTS')
	})
	await test('atomic local batch abort restores availability without publishing partial data', async () => {
		const r = await runtime(); r.db.abortIndex = 2
		await assert.rejects(r.service.createAndActivate({ entries: [entry('one'), entry('two')], activateEntry: 1 }), e => e.code === 'WRITE_FAILED')
		assert.equal(r.game.saveSlots.length, 1); assert.equal(r.db.values.size, 1); assert.equal(r.game.currentSlotId, 0)
		assert.equal(r.game.preventSaving, undefined); assert.equal(r.service.snapshot().ready, true); assert.equal(r.reloads.length, 0)
	})
	await test('cloud false retains locally persisted batch', async () => {
		const r = await runtime({ cloudFailure: true }); await r.service.createAndActivate({ entries: [entry('new')], activateEntry: 0 })
		assert.equal(r.db.values.size, 2); assert.equal(r.game.currentSlotId, 1)
	})
	await test('mismatched persisted activation remains pending and not ready', async () => {
		const storage = new Map([['abstractv03_saveSlotsNativeActivationsynthetic', JSON.stringify({ schema: 2, steamId: 'synthetic', index: 1, saveInstanceId: id })]])
		const r = await runtime({ storage }); assert.equal(r.service.snapshot().ready, false); assert.equal(r.service.snapshot().error.code, 'VERIFY_FAILED')
		assert.equal(storage.has('abstractv03_saveSlotsNativeActivationsynthetic'), true)
	})
	await test('concurrent batch calls rejected; blocked and disabled service gates', async () => {
		const r = await runtime(); const first = r.service.createAndActivate({ entries: [entry('a')], activateEntry: 0 })
		await assert.rejects(r.service.createAndActivate({ entries: [entry('b')], activateEntry: 0 }), e => e.code === 'TRANSACTION_ACTIVE'); await first
		const blocked = await runtime(); blocked.game.preventSaving = true
		await assert.rejects(blocked.service.createAndActivate({ entries: [entry('c')], activateEntry: 0 }), e => e.code === 'SAVING_BLOCKED')
		assert.equal((await runtime({ enabled: false })).service, undefined)
	})
	await test('protected fork capability preserves the manual head and adds a separate checkpoint', async () => {
		const r = await runtime(), old = clone(r.game.saveSlots[0])
		assert.equal(r.service.capabilities().protectedCurrentFork, true)
		assert.equal(r.service.snapshot().fork.requiredSlots, 1)
		const args = protectedArgs(r); args.preserveSource.record.state.resources = [321]; args.entries[0].data.state.resources = [321]
		const result = await r.service.createAndActivate(args)
		assert.equal(result.entries[0].index, 1); assert.equal(result.sourceIndex, 0)
		assert.deepEqual(clone(r.game.saveSlots[0].stack[0]), old.stack[0])
		assert.equal(r.game.saveSlots[0].stack[1].isProtected, true)
		assert.equal(r.game.saveSlots[0].stack[1].state.resources[0], 321)
		assert.equal(r.game.saveSlots[1].stack.length, 1)
		assert.notEqual(r.game.saveSlots[1].stack[0].state.modloader.saveInstanceId, id)
	})
	await test('protected fork rejects unverified source and name conflicts without writes', async () => {
		const r = await runtime(), before = clone(r.game.saveSlots)
		const wrong = protectedArgs(r); wrong.preserveSource.sourceIndex = 1
		await assert.rejects(r.service.createAndActivate(wrong), e => e.code === 'SAVE_CONTEXT_CHANGED')
		const conflict = protectedArgs(r); conflict.entries[0].name = 'Main'
		await assert.rejects(r.service.createAndActivate(conflict), e => e.code === 'NAME_CONFLICT')
		assert.deepEqual(clone(r.game.saveSlots), before); assert.equal(r.reloads.length, 0)
	})
	await test('protected fork abort restores original database and allows retry', async () => {
		const r = await runtime(), before = clone(r.game.saveSlots); r.db.abortIndex = 1
		await assert.rejects(r.service.createAndActivate(protectedArgs(r)), e => e.code === 'WRITE_FAILED')
		assert.deepEqual(clone(r.game.saveSlots), before); assert.equal(r.db.values.size, 1)
		assert.equal(r.service.snapshot().ready, true); assert.equal(r.reloads.length, 0)
		assert.equal((await r.service.createAndActivate(protectedArgs(r))).activated, true)
	})
	await test('local-only protected fork notice survives activation settlement', async () => {
		const r = await runtime({ cloudFailure: true }); const result = await r.service.createAndActivate(protectedArgs(r))
		assert.equal(result.cloudSaved, false)
		const restored = await runtime({ slots: r.game.saveSlots, index: 1, db: r.db, storage: r.storage })
		assert.equal(restored.service.snapshot().ready, true)
		assert.equal(restored.service.snapshot().activationNotice.cloudSaved, false)
		assert.equal(r.storage.has('abstractv03_saveSlotsNativeActivationsynthetic'), false)
		await restored.game.saveGame()
		assert.equal(restored.service.snapshot().activationNotice.cloudSaved, false, 'Local-only saves cannot clear a failed cloud notice')
		assert.equal(restored.events.length, 0)
		await restored.service.createAndActivate({ entries: [entry('Cloud checkpoint')], activateEntry: 0 })
		assert.equal(restored.service.snapshot().activationNotice, null)
		assert.equal(restored.events.length, 1)
		assert.equal(restored.events[0].type, 'cattail:better-uis-save-status')
		assert.equal(restored.events[0].detail.game, restored.game)
		await restored.game.saveGame()
		assert.equal(restored.events.length, 1, 'No repeated event after the notice is cleared')
	})
	await test('native 1.3.0.1 periodic saves stay local through the v1 wrapper', async () => {
		const r = await runtime(), count = r.cloud.length
		await r.game.saveGame()
		assert.equal(r.cloud.length, count)
		assert.equal((await r.game.readFromSlot(0)).stack[0].state.modloader.saveInstanceId, id)
	})
	await test('normal deferred-cloud status is translated for all 20 runtime languages', async () => {
		const labels = JSON.parse(source.match(/const LOCAL_PENDING_LABELS = (\{[\s\S]*?\})\s*function text/)[1])
		assert.equal(Object.keys(labels).length, 20)
		for (const value of Object.values(labels)) assert.equal(typeof value, 'string')
		assert.equal(labels.sch, '已保存在本地，等待云提交。')
		assert.equal(labels.modsch, labels.sch)
	})
	await test('independent autosave is a Save option owned by the same service Mod', async () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../mod.json'), 'utf8'))
		assert.equal(manifest.id, 'Cattail_TweaksQuality_Better-UIs')
		assert.equal(manifest.config.enableIndependentAutoSave.type, 'boolean')
		assert.equal(manifest.config.enableIndependentAutoSave.section, manifest.config.enableSaveSlots.section)
		assert.equal(manifest.config.enableIndependentAutoSave.default, true)
		assert.equal(manifest.translations.sch.config.enableIndependentAutoSave.label, '更好的存档逻辑')
	})
	console.log(`Better UIs native Save Slots service v1: ${passed} checks passed.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
