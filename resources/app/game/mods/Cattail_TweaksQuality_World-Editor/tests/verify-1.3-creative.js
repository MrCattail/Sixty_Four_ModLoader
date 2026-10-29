'use strict'

// Uses shipped Electron, native Game save/price/purchase methods, real Store DOM,
// real IndexedDB and SnapshotStore. World entities, Loader lifecycle/identity and
// Steam IPC are fixtures. Never starts the game or opens the player's profile.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { createRequire } = require('node:module')
const ROOT = path.resolve(__dirname, '../../..')
const RUNTIME = path.resolve(ROOT, '../../..')
const MOD = 'Cattail_TweaksQuality_World-Editor'
const BETTER = 'Cattail_TweaksQuality_Better-UIs'
const REALITY = 'Cattail_TweaksX_Mechanic-Mods'
const SAVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'world-editor-1.3-creative-'))
const { SnapshotStore } = require(path.join(ROOT, 'modloader/snapshot-store.js'))
const snapshots = new SnapshotStore({ rootDir: path.join(output, 'snapshots') })
const snapshotContext = { modId: MOD, saveInstanceId: SAVE_ID, accountScope: 'world-editor-isolated-test' }
const entries = ['core/save-adapter', 'core/creative-mode', 'core/creative-economy', 'i18n/editor-text'].map(v => `mods/${MOD}/scripts/${v}.js`)
const otherEntries = [`mods/${BETTER}/scripts/classic-shop.js`, `mods/${BETTER}/scripts/shop-categories.js`, `mods/${REALITY}/scripts/flat-build-costs.js`]

let suite = { label: 'creative', setup: function () {}, exercise }

function prepare() {
	const options = new URLSearchParams(location.search)
	const hooks = new Map()
	const config = window.testConfig = { shopVersion: options.get('view') === 'native' ? '1.3' : '1.2.1', enableShopCategories: options.get('view') === 'categories', showCreativePurchaseCosts: true, enableFlatBuildCosts: options.has('flat') }
	localStorage.setItem('cattailShopCategoriesCompressed', '1')
	const clone = value => JSON.parse(JSON.stringify(value))
	const faults = window.faults = { writeFailures: 0, failSnapshot: false, snapshotGate: null, writeGate: null, readGate: null, writes: 0, inFlight: 0, maxInFlight: 0 }
	window.runHook = async function (name, value, game) {
		for (const listener of hooks.get(name) || []) { const next = await listener(value, game); if (next !== undefined) value = next }
		return value
	}
	window.runHookSync = function (name, value, game) {
		for (const listener of hooks.get(name) || []) { const next = listener(value, game); if (next !== undefined) value = next }
		return value
	}
	async function snapshotRequest(action, data) {
		const response = await fetch('/snapshot/' + action, { method: 'POST', body: JSON.stringify(data) })
		const result = await response.json()
		if (!response.ok) throw Object.assign(new Error(result.message), { code: result.code })
		return result
	}
	window.readSnapshot = id => snapshotRequest('read', { id })
	window.ModLoader = {
		resolveAsset: value => value,
		register(definition) {
			definition.init({
				id: definition.id,
				config: { get: (key, fallback) => config[key] ?? fallback },
				on(name, listener) { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(listener) },
				patch(target, name, factory) { target[name] = factory(target[name]) },
				storage: { snapshots: {
					async create(request) {
						if (faults.snapshotGate) await faults.snapshotGate
						if (faults.failSnapshot) throw new Error('injected snapshot failure')
						if (faults.emptySnapshotResult) return {}
						return snapshotRequest('create', request)
					},
					remove: request => snapshotRequest('remove', request)
				} },
				ui: { registerCornerButton({ element }) { document.body.append(element) }, unregisterCornerButton() {}, registerHud() { return function () {} } }
			})
		},
		applySave(save, game) {
			save.modloader = { saveInstanceId: game.testSaveId, otherMod: { note: '保留其他模组' } }
			return runHookSync('beforeSaveWrite', save, game)
		},
		applyEntitySave: value => value
	}
	window.nativeToolMethods = Object.fromEntries(['processMove'].map(name => [name, Game.prototype[name]]))
	window.nativeEntityMethods = Object.fromEntries(['addEntity', 'clearCell', 'entityAtCoordinates', 'getEntityString'].map(name => [name, Game.prototype[name]]))
	// Small deterministic world, with native placement and purchase orchestration.
	Game.prototype.addEntity = function (name, position) {
		if (faults.failExecution) throw new Error('injected entity failure')
		const entity = new this.codex.entities[name].class(this)
		entity.position = position.slice()
		this.stuff.push(entity)
		this.entitiesInGame[name] = (this.entitiesInGame[name] || 0) + 1
		this.store.compositionUpdate()
		return entity
	}
	Game.prototype.clearCell = function (cell) {
		const old = this.entityAtCoordinates(cell)
		this.stuff = this.stuff.filter(e => e !== old)
		if (old) this.entitiesInGame[old.name]--
		this.store.compositionUpdate()
	}
	Game.prototype.createResourceTransfer = function (resources, from) {
		this.testTransfers.push({ resources: resources.slice(), from })
		if (from) for (let i = 0; i < resources.length; i++) this.resources[i] += resources[i] || 0
	}
	Game.prototype.processMove = function () { this.testMoves = (this.testMoves || 0) + 1 }
	// Exercise the existing gamepad input-source wrapper without a physical pad.
	Game.prototype.updateGamepad = function () { return this.processClick() }
	const nativeWrite = Game.prototype.writeToSlot
	Game.prototype.writeToSlot = async function () {
		faults.writes++
		faults.inFlight++
		faults.maxInFlight = Math.max(faults.maxInFlight, faults.inFlight)
		try {
			if (faults.writeGate) await faults.writeGate
			if (faults.writeFailures > 0) { faults.writeFailures--; throw new Error('injected disk failure') }
			const result = await nativeWrite.apply(this, arguments)
			if (faults.corruptAfterWrite) { faults.corruptAfterWrite = false; faults.corruptNextRead = true }
			return result
		} finally { faults.inFlight-- }
	}
	const nativeRead = Game.prototype.readFromSlot
	Game.prototype.readFromSlot = async function () {
		if (faults.readGate) await faults.readGate
		const result = await nativeRead.apply(this, arguments)
		if (faults.corruptNextRead) { faults.corruptNextRead = false; result.stack[0].state.modloader.worldEditor.creativeMode = !result.stack[0].state.modloader.worldEditor.creativeMode }
		return result
	}
	window.newWorld = async function (creativeMode = false, lockedStart = false) {
		faults.failSnapshot = false; faults.failExecution = false; faults.writeFailures = 0
		faults.emptySnapshotResult = faults.corruptAfterWrite = faults.corruptNextRead = false
		faults.snapshotGate = faults.writeGate = faults.readGate = null
		const game = window.game = Object.assign(Object.create(Game.prototype), {
			testSaveId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', steamId: 'isolated-player', version: '1.3', language: 'sch',
			isMobile: false, plane: 0, stuff: [], resources: new Array(10).fill(0), onlyones: {}, entitiesInGame: { mega3: 1 },
			unlockedEntities: {}, eraserType: 0, stats: { machinesBuild: 0 }, analytics: {}, messenger: {}, achiever: { fired: ['fixture'] },
			completions: 2, orbUpgrades: 3, orbUpgradeMap: [1, 0], memorycomplex: { fixture: true }, currentOrbPositions: [[1, 2]],
			memorycomplexCenter: [1000, 1000], memorycomplexRadius: 3, maxSaveStack: 10, currentSlotId: 0,
			saveSlots: [{ name: 'fixture', stack: [{ permanents: { memory: { keep: true } } }] }],
			testTransfers: [], spaceport: { invoke: async (channel, data) => { if (channel !== 'store') throw Error(channel); game.testCloud = clone(data); return true } },
			mouse: { state: 1, positionChanged: false, timer: 0, maxTimer: 20, xy: [0, 0] },
			hoveredCell: [0, 0], hoveredEntity: null, w: 800, screenUnit: 20,
			pronounce: (...args) => args[args.length - 1], playSound() {}, punchScreen() {}, removeHint() {},
			uvToXYUntranslated: cell => cell.slice(), getPanValueFromX: () => 0,
			entityAtCoordinates(cell) { return this.stuff.find(e => Math.abs(e.position[0] - cell[0]) <= (e.entitySpan || 0) && Math.abs(e.position[1] - cell[1]) <= (e.entitySpan || 0)) || null }
		})
		game.codex = { entityTypes: { default: {}, dark: {} }, entities: {} }
		for (const [name, settings] of Object.entries({ gradient: {}, pump: {}, pump2: { isUpgradeTo: 'pump' }, chasm: { onlyone: true }, pinhole: { isUpgradeTo: 'chasm', onlyone: true }, wide: { span: 1 }, locked: {}, unique: { onlyone: true }, dark: { type: 'dark', isDark: true }, base: { canPurchase: false }, upgrade: { isUpgradeTo: 'base' } })) {
			game.codex.entities[name] = { canPurchase: true, price: [50e6, 40e6, 30e6, 0, 0, 0, 0, 0, 2e4, 1e4], priceExponent: 1.2, ...settings,
				class: class { constructor(master) { this.master = master; this.name = name; this.position = [0, 0]; this.entitySpan = settings.span || 0 } init() {} }
			}
			if (!lockedStart && name !== 'locked') game.unlockedEntities[name] = true
		}
		game.localDatabase = await new Promise((resolve, reject) => {
			const request = indexedDB.open('we-test-' + crypto.randomUUID(), 1)
			request.onupgradeneeded = () => request.result.createObjectStore('charps_memory_slots')
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
		const vessel = document.createElement('div'); document.body.append(vessel)
		game.store = new DesktopStoreVersion(vessel, game)
		game.store.compositionUpdate()
		runHookSync('beforeSaveLoad', { modloader: { worldEditor: { schema: 1, creativeMode, entryMode: creativeMode ? 'in-place' : null, createdAt: creativeMode ? 123 : 0 } } }, game)
		await game.saveGame()
		await runHook('afterGameInit', null, game)
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		return game
	}
}

async function exercise() {
	const results = []
	const check = (value, message) => { if (!value) throw new Error(message) }
	const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message)
	const mode = () => window[Symbol.for('cattail.world-editor.creative-mode')]
	const economy = () => window[Symbol.for('cattail.world-editor.creative-economy')]
	const adapter = () => window[Symbol.for('cattail.world-editor.save-adapter')]
	const tick = () => new Promise(resolve => setTimeout(resolve, 0))
	const waitUntil = async predicate => { for (let i = 0; i < 400; i++) { if (predicate()) return; await tick() } throw Error('wait timed out') }
	const rejection = async (promise, code) => { try { await promise } catch (error) { if (code) check(error.code === code, error.code + ' != ' + code); return error } throw Error('expected rejection') }
	const target = (game, name, cell) => { game.pickupItem(name); game.hoveredCell = cell; game.hoveredEntity = game.entityAtCoordinates(cell); game.mouse.state = 1; game.mouse.positionChanged = false }
	await runHook('afterVanillaScripts')
	let game = await newWorld()
	check(!localStorage.getItem('abstractv03isolated-player'), 'legacy slot must be absent')
	await rejection(mode().createFork({ originalName: 'fixture' }), 'SAVE_SLOTS_UNAVAILABLE')
	mode().setDialogOpen(true)
	await mode().enableInPlace()
	check(mode().snapshot().creativeMode, 'enable with an open confirmation dialog')
	const saved = await game.readFromSlot(0)
	check(saved.stack[0].state.modloader.worldEditor.creativeMode, 'native creative marker persisted')
	same(saved.stack[0].permanents.memory, { keep: true }, 'permanents preserved')
	same(game.testCloud[0].stack[0].state.modloader.worldEditor, saved.stack[0].state.modloader.worldEditor, 'marker forwarded to mocked cloud')
	const encoded = adapter().encodeSnapshot(game, adapter().capture(game))
	check(game.decodeSave(encoded).state.modloader.otherMod.note === '保留其他模组', 'Unicode snapshot metadata')
	check(game.decodeSave(encoded).permanents.completions === 2, 'snapshot includes permanent progress')
	await rejection(mode().createFork({ originalName: 'fixture' }), 'INVALID_STATE')
	results.push('native mode save, metadata and full record encoding')

	check(!game.store.html.items.gradient.classList.contains('disabled'), 'zero-resource Store qualification')
	check(!game.store.html.items.locked.classList.contains('hidden'), 'creative locked item is visible')
	check(game.store.html.priceContainers.gradient.textContent.includes('M'), 'reference cost remains visible')
	if (testConfig.shopVersion === '1.2.1') {
		let view
		window[Symbol.for('cattail.better-uis.classic-shop')].subscribe(value => { view = value })()
		check(view && view.master === game, 'classic view attached')
		if (testConfig.enableShopCategories) {
			view.centerCategory('gradient')
			const row = view.vessel.querySelector('[data-shop-item="gradient"]')
			check(row && !row.classList.contains('disabled'), 'categorized card available')
			row.click()
		} else view.activate('gradient')
	} else game.store.html.items.gradient.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.itemInHand?.name === 'gradient', 'real card activation selects gradient')
	testConfig.showCreativePurchaseCosts = false; economy().refreshPricePresentation()
	check(!game.store.html.priceContainers.gradient.textContent, 'hide native reference cost')
	if (testConfig.enableShopCategories) check(!document.querySelector('[data-shop-item="gradient"] .itemPrice')?.textContent, 'hide categorized reference cost')
	testConfig.showCreativePurchaseCosts = true; economy().refreshPricePresentation()
	check(game.itemInHandPriceTag?.master === game, '1.3 Cloud owner')
	results.push('native/classic/category selection and reference-price toggle')

	const beforeResources = game.resources.slice()
	target(game, 'gradient', [1, 1])
	let operation = await game.processUp()
	check(operation.executed && game.entityAtCoordinates([1, 1])?.name === 'gradient', 'native single build')
	same(game.resources, beforeResources, 'build does not debit resources')
	const storedSnapshot = await readSnapshot(operation.snapshotId)
	const record = game.decodeSave(storedSnapshot.data)
	check(record.state && record.permanents && !record.state.stuff.length, 'disk snapshot is pre-build and complete')
	game.addEntity('base', [3, 3]); target(game, 'upgrade', [3, 3])
	operation = await game.processUp()
	check(operation.executed && game.entityAtCoordinates([3, 3])?.name === 'upgrade', 'native upgrade')
	same(game.resources, beforeResources, 'upgrade has neither debit nor refund from unpurchasable base')
	check(game.testTransfers.every(t => t.resources.every(n => n === 0)), 'no paid transfer or refund animation')
	target(game, 'pump', [4, 4]); check((await game.updateGamepad()).executed, 'gamepad single purchase uses native transaction')
	results.push('free native build/upgrade and real disk SnapshotStore')

	let release
	faults.snapshotGate = new Promise(resolve => { release = resolve })
	target(game, 'pump', [5, 5]); const pending = game.processUp()
	await waitUntil(() => economy().snapshot().busy)
	check(!(await game.processUp())?.executed, 'duplicate release blocked')
	game.addEntity('base', [5, 5]); release(); faults.snapshotGate = null
	check(!(await pending).executed, 'occupied target invalidates snapshot operation')
	faults.failSnapshot = true; target(game, 'pump', [6, 6])
	check(!(await game.processUp()).executed && !game.entityAtCoordinates([6, 6]), 'snapshot failure prevents mutation')
	faults.failSnapshot = false
	faults.emptySnapshotResult = true; target(game, 'pump', [6, 6])
	check(!(await game.processUp()).executed && !game.entityAtCoordinates([6, 6]), 'missing recovery point prevents mutation')
	faults.emptySnapshotResult = false
	target(game, 'wide', [20, 20]); game.memorycomplexCenter = [31, 20]; game.memorycomplexRadius = 3
	check(!(await game.processUp())?.executed, 'memory restriction on outer footprint')
	game.memorycomplexCenter = [1000, 1000]
	game.onlyones.unique = true; target(game, 'unique', [7, 7]); check(!(await game.processUp())?.executed, 'unique restriction')
	target(game, 'locked', [17, 7]); check((await game.processUp())?.executed, 'creative locked item can be placed directly')
	target(game, 'dark', [7, 7]); check(!(await game.processUp())?.executed, 'wrong plane restriction')
	game.plane = 1; target(game, 'dark', [7, 7]); check((await game.processUp()).executed, 'Void single build')
	game.plane = 0
	results.push('snapshot failure, duplicate input, target/footprint/creative unlock/unique/plane checks')

	for (const action of ['pickupEraser', 'processE', 'finalizeErase', 'massRelocate', 'confirmMassClone']) {
		const world = JSON.stringify(game.stuff.map(e => [e.name, e.position]))
		game[action]()
		same(game.stuff.map(e => [e.name, e.position]), JSON.parse(world), action + ' deferred')
	}
	delete game.interactionMode
	game.store.html.relocator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.interactionMode !== 'relocate', 'direct native relocation control blocked')
	game.pickupItem('pinhole'); check(game.itemInHand?.name === 'pinhole', 'Pinhole preview available; ending tested separately')
	game.interactionMode = 'relocate'; game.processMove(); check(!game.interactionMode, 'stale relocation cancelled safely')
	results.push('deferred native controls and direct method guards')

	await mode().disable(); check(!mode().snapshot().creativeMode, 'disable saved')
	game.store.visibilityUpdate(); check(game.store.html.items.gradient.classList.contains('disabled'), 'normal insufficient card disabled')
	game.resources.fill(1e12)
	target(game, 'pump', [8, 8]); const price = game.getRealPrice('pump').slice(), funds = game.resources.slice()
	await game.processUp()
	same(game.resources, funds.map((v, i) => v - (price[i] || 0)), 'normal mode charges native price')
	game.pickupEraser(); check(game.interactionMode === 'erase', 'normal eraser restored')
	results.push('normal-mode prices, UI and tools restored')

	game = await newWorld()
	faults.writeFailures = 1
	await rejection(mode().enableInPlace())
	check(mode().snapshot().ready && !mode().snapshot().creativeMode, 'recoverable save failure restores mode')
	check(!(await game.readFromSlot(0)).stack[0].state.modloader.worldEditor.creativeMode, 'recovery persisted prior mode')
	game.resources[0] = 42
	faults.writeFailures = 2
	await rejection(mode().enableInPlace(), 'ROLLBACK_FAILED')
	check(mode().isInputBlocked() && economy().isWriteBlocked(), 'uncertain write freezes future actions')
	check(game.resources[0] === 42, 'recovery does not rewind live world resources')
	results.push('save recovery and terminal failure protection')

	game = await newWorld()
	let releaseWrite
	faults.writeGate = new Promise(resolve => { releaseWrite = resolve })
	const writesBefore = faults.writes
	const enabling = mode().enableInPlace()
	await waitUntil(() => faults.writes > writesBefore)
	const autosave = game.saveGame()
	await tick(); check(faults.writes === writesBefore + 1, 'autosave waits for mode transaction')
	faults.writeGate = null; releaseWrite(); await enabling; await autosave
	check(faults.maxInFlight === 1, 'native saves serialized')
	results.push('autosave and mode-switch serialization')

	game = await newWorld()
	const checkpointWrites = faults.writes
	const checkpoint = game.saveGame()
	game.preventSaving = true
	check(faults.writes === checkpointWrites + 1, 'normal save captures synchronously before ending guard')
	await checkpoint
	check((await game.readFromSlot(0)).stack[0].state.modloader.worldEditor.creativeMode === false, 'normal checkpoint persisted')
	await rejection(mode().enableInPlace(), 'SAVING_BLOCKED')
	results.push('normal ending-checkpoint timing and saving guard')

	game = await newWorld()
	faults.corruptAfterWrite = true
	await rejection(mode().enableInPlace(), 'VERIFY_FAILED')
	check(mode().snapshot().ready && !mode().snapshot().creativeMode, 'mismatched readback recovers prior mode')
	check(!(await game.readFromSlot(0)).stack[0].state.modloader.worldEditor.creativeMode, 'recovered marker verified on disk')
	const foreign = await game.readFromSlot(0)
	foreign.stack[0].state.modloader.saveInstanceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
	await game.writeToSlot(foreign, 0)
	const writesBeforeMismatch = faults.writes
	await rejection(mode().enableInPlace(), 'VERIFY_FAILED')
	check(faults.writes === writesBeforeMismatch, 'foreign disk identity does not trigger a write')
	results.push('readback mismatch recovery and foreign identity refusal')

	game = await newWorld()
	faults.writeGate = new Promise(resolve => { release = resolve })
	const oldSlot = JSON.parse(JSON.stringify(game.saveSlots[0]))
	const pendingMode = mode().enableInPlace()
	await waitUntil(() => faults.inFlight === 1)
	game.saveSlots[1] = oldSlot; game.currentSlotId = 1
	const writesBeforeSwitch = faults.writes
	release(); faults.writeGate = null
	await rejection(pendingMode, 'ROLLBACK_FAILED')
	check(faults.writes === writesBeforeSwitch && mode().isInputBlocked(), 'no recovery write into switched slot')
	results.push('slot switch during mode save freezes without overwriting another slot')

	game = await newWorld(true)
	faults.snapshotGate = new Promise(resolve => { release = resolve })
	target(game, 'pump', [9, 9]); const switching = game.processUp()
	await waitUntil(() => economy().snapshot().busy)
	game.saveSlots[1] = JSON.parse(JSON.stringify(game.saveSlots[0])); game.currentSlotId = 1
	release(); faults.snapshotGate = null
	check(!(await switching).executed && !game.stuff.length, 'slot switch cancels purchase even with same identity')
	results.push('same-identity slot switch invalidates pending purchase')

	game = await newWorld()
	faults.readGate = new Promise(resolve => { release = resolve })
	const oldController = mode(), stale = oldController.enableInPlace()
	await tick()
	runHookSync('beforeSaveLoad', { modloader: { worldEditor: { schema: 1, creativeMode: false } } }, game)
	release(); faults.readGate = null
	await rejection(stale)
	check(oldController.snapshot().disposed, 'loaded world disposes stale controller')
	results.push('load epoch rejects stale mode completion')

	game = await newWorld(true)
	faults.failExecution = true
	target(game, 'pump', [10, 10]); const failed = await game.processUp()
	check(!failed.executed && economy().isWriteBlocked(), 'execution failure freezes future writes')
	check(economy().snapshot().lastSnapshotId, 'execution failure retains recovery point')
	check((await readSnapshot(economy().snapshot().lastSnapshotId)).data, 'retained snapshot readable')
	results.push('execution failure retains disk snapshot and blocks further writes')

	game = await newWorld(false, true)
	const unlockObject = game.unlockedEntities
	check(game.store.html.items.locked.classList.contains('hidden'), 'initial normal shop hides locked building')
	await mode().enableInPlace()
	check(game.unlockedEntities === unlockObject && Object.keys(unlockObject).length === 0, 'creative enable never replaces or fills real unlock table')
	check(!game.store.html.items.locked.classList.contains('hidden') && !game.store.html.items.locked.classList.contains('disabled'), 'initial zero-resource creative shop exposes locked building')
	if (testConfig.shopVersion === '1.2.1') {
		let view
		window[Symbol.for('cattail.better-uis.classic-shop')].subscribe(value => { view = value })()
		if (testConfig.enableShopCategories) {
			view.centerCategory('locked')
			const row = view.vessel.querySelector('[data-shop-item="locked"]')
			check(row && !row.classList.contains('disabled'), 'initial categorized locked building exposed')
			row.click()
		} else view.activate('locked')
	} else game.store.html.items.locked.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.itemInHand?.name === 'locked', 'initial locked building selected through real view')
	game.hoveredCell = [40, 40]; game.hoveredEntity = null; game.mouse.state = 1
	check((await game.processUp()).executed, 'initial locked building placed')
	check(game.resources.every(v => v === 0), 'initial locked build is free')
	game.pickupItem('locked')
	await mode().disable()
	check(!game.itemInHand && game.interactionMode !== 'build', 'disabling clears still-locked held building')
	check(game.store.html.items.locked.classList.contains('hidden'), 'disabling hides temporary native card')
	if (testConfig.enableShopCategories) check(!document.querySelector('[data-shop-item="locked"]'), 'disabling removes temporary categorized row')
	check(game.entityAtCoordinates([40, 40])?.name === 'locked', 'disabling keeps actually built building')
	const normalDisk = (await game.readFromSlot(0)).stack[0].state
	same(normalDisk.unlockedEntities, {}, 'save contains no mass unlock grant')
	check(!normalDisk.modloader.worldEditor.creativeMode, 'normal marker persisted')
	results.push('initial locked/zero-resource shop selection and free build; disable clears hand/cards and preserves buildings without granting unlocks')

	await mode().enableInPlace()
	game.codex.entities.pump.shouldUnlock = () => true
	game.store.visibilityUpdate()
	check(game.unlockedEntities.pump === true, 'native natural unlock still persists during creative mode')
	game.pickupItem('pump'); await mode().disable()
	check(game.itemInHand?.name === 'pump' && !game.store.html.items.pump.classList.contains('hidden'), 'natural unlock and selection survive leaving creative')
	check(!game.unlockedEntities.locked, 'unrelated lock remains real')
	await mode().enableInPlace(); await game.saveGame()
	const reload = (await game.readFromSlot(0)).stack[0].state
	runHookSync('beforeSaveLoad', reload, game); await runHook('afterGameInit', null, game)
	game.store.visibilityUpdate()
	check(mode().snapshot().creativeMode && !game.store.html.items.locked.classList.contains('hidden'), 'saved creative mode restores temporary unlock availability')
	same(game.unlockedEntities, { pump: true }, 'reload preserves only real unlocks')
	for (const name of ['memory', 'orbifold', 'whitehole', 'eraser']) {
		game.codex.entities[name] ||= { canPurchase: true }
		check(!mode().canBypassUnlock(name), 'special unlock remains protected: ' + name)
	}
	game.codex.entities.ending = { canPurchase: true, type: 'complete' }
	check(!mode().canBypassUnlock('ending') && !mode().canBypassUnlock('base'), 'complete and unpurchasable definitions excluded')
	results.push('natural progress preserved, creative save reload restores temporary permission, special objects excluded')
	return results
}

const allowed = new Set(['scripts/game.js', 'scripts/ui.js', ...entries, ...otherEntries])
const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url, 'http://localhost')
		if (url.pathname === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html>'); return }
		if (req.method === 'POST' && url.pathname.startsWith('/snapshot/')) {
			let body = ''; for await (const chunk of req) body += chunk
			const action = url.pathname.slice('/snapshot/'.length)
			if (!['create', 'read', 'remove'].includes(action)) throw Error('invalid snapshot action')
			let result = await snapshots[action](snapshotContext, JSON.parse(body))
			if (action === 'read') result = { info: result.info, data: Buffer.from(result.payload).toString('utf8') }
			res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return
		}
		if (url.pathname === '/') {
			const order = url.searchParams.has('reverse') ? [...entries, ...otherEntries] : [...otherEntries, ...entries]
			const tags = ['scripts/game.js', 'scripts/ui.js'].map(src => `<script src="/${src}"></script>`).join('')
			const mods = order.map(src => `<script src="/${src}"></script>`).join('')
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
			res.end('<!doctype html><meta charset="utf-8">' + tags + '<script>(' + prepare.toString() + ')()</script>' + '<script>(' + suite.setup.toString() + ')()</script>' + mods + '<script>window.testDone=(' + suite.exercise.toString() + ')().then(results=>({results}),error=>({error:error.stack}))</script>'); return
		}
		const file = decodeURIComponent(url.pathname.slice(1))
		if (allowed.has(file)) { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(suite.overrides?.[file] ?? fs.readFileSync(path.join(ROOT, file))); return }
		res.writeHead(204); res.end()
	} catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: error.code, message: error.message })) }
})

async function main() {
	let playwright
	try { playwright = require('playwright') } catch (_) {
		playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
	}
	// Some Windows ephemeral ranges include Chromium's blocked service ports
	// (for example 3659). Keep the isolated HTTP fixture in a high port range.
	for (let attempt = 0; ; attempt++) {
		try {
			await new Promise((resolve, reject) => {
				server.once('error', reject)
				server.listen(20000 + Math.floor(Math.random() * 30000), '127.0.0.1', () => {
					server.off('error', reject)
					resolve()
				})
			})
			break
		} catch (error) {
			if (error.code !== 'EADDRINUSE' || attempt >= 19) throw error
		}
	}
	const address = 'http://127.0.0.1:' + server.address().port
	const runtime = path.join(output, 'runtime'), app = path.join(runtime, 'resources/app')
	fs.mkdirSync(app, { recursive: true })
	for (const file of ['sixtyfour.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll', 'locales']) {
		if (fs.existsSync(path.join(RUNTIME, file))) fs.cpSync(path.join(RUNTIME, file), path.join(runtime, file), { recursive: true })
	}
	fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'world-editor-creative-test', version: '1.0.0', main: 'main.cjs' }))
	fs.writeFileSync(path.join(app, 'main.cjs'), `const {app,BrowserWindow,session}=require('electron');
app.setPath('userData',${JSON.stringify(path.join(output, 'profile'))});
app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:!d.url.startsWith(${JSON.stringify(address + '/')})}));
const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});win.loadURL(${JSON.stringify(address + '/blank')});});
app.on('window-all-closed',()=>app.quit());`)
	const env = { ...process.env }
	for (const key of Object.keys(env)) if (['electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
	let electron
	const report = { output, limitation: 'Synthetic world and lifecycle/identity/Steam bridge; real native methods, DOM, IndexedDB and disk SnapshotStore. No player acceptance or cloud synchronization claim.', runs: [] }
	try {
		electron = await playwright._electron.launch({ executablePath: path.join(runtime, 'sixtyfour.exe'), env })
		const page = await electron.firstWindow()
		for (const scenario of ['view=native', 'view=classic&flat', 'view=categories', 'view=categories&flat&reverse']) {
			const errors = []; const onError = error => errors.push(error.message); page.on('pageerror', onError)
			await page.goto(address + '/?' + scenario)
			await page.waitForFunction(() => !!window.testDone)
			const result = await page.evaluate(() => window.testDone)
			page.off('pageerror', onError)
			report.runs.push({ scenario, ...result, errors })
			fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
			assert.equal(result.error, undefined, JSON.stringify({ scenario, result, errors }, null, 2))
			assert.deepEqual(errors, [], scenario)
			console.log(scenario + ': ' + result.results.length + ' scenarios passed')
		}
		report.versions = await electron.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome }))
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
		console.log('World Editor 1.3 ' + suite.label + ' verification passed. Report: ' + path.join(output, 'report.json'))
	} finally {
		if (electron) await electron.close()
		await new Promise(resolve => server.close(resolve))
	}
}

function run(options) {
	if (options) {
		suite = options
		for (const file of options.otherEntries || []) { otherEntries.push(file); allowed.add(file) }
		for (const entry of options.entries || []) { const file = `mods/${MOD}/scripts/${entry}.js`; entries.push(file); allowed.add(file) }
	}
	return main()
}
module.exports = { run }
if (require.main === module) run().catch(error => { console.error(error); console.error('Artifacts: ' + output); process.exitCode = 1; server.close() })
