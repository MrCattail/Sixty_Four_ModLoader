'use strict'

// Isolated Electron/IndexedDB. Native Pinhole, Game save/upgrade/ending/reset,
// Store events and actual Better UIs/Tweaks wrappers execute. Rendering, Steam,
// world generation and Loader lifecycle/identity are fixtures, never player data.
const fs = require('node:fs')
const path = require('node:path')
const { run } = require('./verify-1.3-creative.js')
const ROOT = path.resolve(__dirname, '../../..')
const assert = require('node:assert/strict')
const shellSource = fs.readFileSync(path.join(__dirname, '../scripts/ui/editor-shell.js'), 'utf8')
const statusStart = shellSource.indexOf('const refreshEconomyStatus = function')
const statusEnd = shellSource.indexOf('const refreshVisibility = function', statusStart)
assert.ok(statusStart >= 0 && statusEnd > statusStart, 'status renderer boundary')
const statusRenderer = new Function('currentCreativeEconomy', 'i18n', 'economyStatus', 'game', 'refreshVisibility', shellSource.slice(statusStart, statusEnd) + '\nrefreshEconomyStatus()')
for (const [state, expected] of [
	[{ phase: 'checkpointing', operation: 'pinhole' }, 'creativePinholeCheckpointing'],
	[{ phase: 'failed', operation: 'pinhole', error: { code: 'PINHOLE_CHECKPOINT_FAILED' } }, 'creativePinholeCheckpointFailed'],
	[{ phase: 'idle', operation: null, writeBlockedReason: 'PINHOLE_EXECUTION_FAILED', error: { code: 'PINHOLE_EXECUTION_FAILED' } }, 'creativePinholeExecutionFailed']
]) {
	const element = { dataset: {}, setAttribute() {} }
	statusRenderer(state, { t: (_, key) => key }, element, {}, () => {})
	assert.equal(element.textContent, expected, 'Pinhole status never claims a WE snapshot, including after the display timer')
}

function setup() {
	window.pinholeSnapshotCalls = 0
	const register = ModLoader.register
	ModLoader.register = definition => register({ ...definition, init(api) {
		api.ui.pages = { register() {}, isActive: () => false }
		const create = api.storage.snapshots.create
		api.storage.snapshots.create = (...args) => { pinholeSnapshotCalls++; return create(...args) }
		definition.init(api)
	} })
	Object.assign(Game.prototype, nativeEntityMethods)
	const nativeReset = Game.prototype.reset
	Game.prototype.reset = async function (...args) {
		const timeout = window.setTimeout
		window.setTimeout = (callback, delay, ...rest) => String(callback).includes('location.reload') ? 0 : timeout(callback, delay, ...rest)
		try { return await nativeReset.apply(this, args) } finally { window.setTimeout = timeout }
	}
	window.abstract_getWords = () => ({ en: { credits: Array(50).fill('fixture') } })
	HTMLMediaElement.prototype.play = () => Promise.resolve()
	HTMLMediaElement.prototype.pause = () => {}
	ModLoader.register({ id: 'pinhole-fixture', init(api) {
		api.on('afterGameInit', (_, game) => {
			game.stuffMap = {}; delete game.entityAtCoordinates
			game.stuff = []; game.entitiesInGame = {}; game.unlockedEntities = {}
			game.resources.fill(0); game.memoryBuffer = []; game.completions = 0
			game.stats.machinesSold = 0; game.stats.totalResourcesMined = Array(10).fill(0)
			game.maxHoles = 20; game.orbUpgrades = 0
			game.hollowSite = {}; game.createHollowEvent = () => {}; game.playMusic = () => {}
			game.messenger.element = document.createElement('div')
			game.assembleMemory = () => ({ fixtureMemory: true })
			const pronounce = game.pronounce
			game.pronounce = (...args) => args[0] === 'credits' ? Array(50).fill('fixture') : pronounce(...args)
			game.isWithinMemoryComplex = cell => game.testMemory?.some(p => p[0] === cell[0] && p[1] === cell[1]) || false
			for (const [name, definition] of Object.entries(game.codex.entities)) {
				definition.class = class {
					constructor(master) { this.master = master; this.name = name; this.entitySpan = 0; this.soi = [] }
					setPosition(p) { this.position = p.slice(); this.init(); return this }
					init() {} onDelete() {} getNeighbours() { return [] }
				}
			}
			game.codex.entities.chasm = { ...game.codex.entities.pump, onlyone: true, class: class {
				constructor(master) { this.master = master; this.name = 'chasm'; this.soi = []; this.entitySpan = 0 }
				setPosition(p) { this.position = p.slice(); return this }
				init() {} onDelete() {} getNeighbours() { return [] }
			} }
			game.codex.entityTypes.uniques = {}
			game.codex.entities.pinhole = { ...nativePinholeDefinition, class: nativeClasses.Pinhole }
			window.Cube = nativeClasses.Cube
			game.store.reinit()
		})
	} })
}

async function exercise() {
	const results = []
	const get = name => window[Symbol.for('cattail.world-editor.' + name)]
	const check = (ok, message) => { if (!ok) throw Error(message + '; completed: ' + results.join(', ')) }
	const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message)
	const tick = () => new Promise(resolve => setTimeout(resolve, 0))
	const wait = async predicate => { for (let i = 0; i < 600; i++) { if (predicate()) return; await tick() } throw Error('wait timed out') }
	const clone = value => JSON.parse(JSON.stringify(value))
	const target = (g, cell = [4, 4]) => { g.pickupItem('pinhole'); g.hoveredCell = cell; g.hoveredEntity = g.entityAtCoordinates(cell); g.mouse.state = 1; g.mouse.positionChanged = false }
	const cleanup = () => {
		window.game?.__cattailEndingSkipController?.dispose?.()
		for (const element of document.querySelectorAll('.credits,.orbVeil,.orbResetWrap')) element.remove()
	}
	const fresh = async (creative = true) => { cleanup(); const game = await newWorld(creative, true); game.addEntity('chasm', [4, 4]); await game.saveGame(); return game }
	await runHook('afterVanillaScripts')
	let game = await fresh()
	const failures = []
	if (!get('creative-mode').canBypassUnlock('pinhole')) failures.push('initial Creative Pinhole remains unavailable')
	if (!game.assemblePermanents().modloader?.worldEditor?.creativeMode) failures.push('native reset permanents lose Creative mode')
	check(!failures.length, failures.join('; '))
	let view
	window[Symbol.for('cattail.better-uis.classic-shop')]?.subscribe(value => { view = value })()
	const card = game.store.html.items.pinhole
	check(!card.classList.contains('hidden') && !card.classList.contains('disabled'), 'initial Pinhole card visible and affordable')
	if (testConfig.enableShopCategories) { view.centerCategory('pinhole'); view.vessel.querySelector('[data-shop-item="pinhole"]').click() }
	else card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.itemInHand instanceof nativeClasses.Pinhole && game.interactionMode === 'build' && !game.pinhole, 'real Pinhole constructor selected without triggering ending')
	check(!game.unlockedEntities.pinhole, 'temporary availability never writes unlock')
	await get('creative-mode').disable()
	check(!game.itemInHand && game.store.html.items.pinhole.classList.contains('hidden'), 'disable cancels locked preview and hides card')
	await get('creative-mode').enableInPlace(); game.unlockedEntities.pinhole = true; target(game)
	await get('creative-mode').disable(); check(game.unlockedEntities.pinhole, 'real unlock from progress or Reality Pack preserved')
	check(game.store.html.items.pinhole.classList.contains('disabled'), 'ordinary mode still requires resources')
	results.push('real Pinhole card selection, temporary unlock, exit and actual unlock preservation')

	for (const invalid of ['empty', 'wrong', 'memory', 'duplicate', 'plane']) {
		game = await fresh(); if (invalid === 'wrong') { game.clearCell([4,4]); game.addEntity('pump', [4,4]) }
		if (invalid === 'memory') game.testMemory = [[4,4]]
		if (invalid === 'duplicate') game.onlyones.pinhole = true
		if (invalid === 'plane') game.plane = 1
		target(game, invalid === 'empty' ? [8,8] : [4,4])
		const writes = faults.writes, snapshots = pinholeSnapshotCalls
		const result = await game.processUp()
		check(!result?.executed && !game.pinhole && faults.writes === writes && pinholeSnapshotCalls === snapshots, 'invalid target rejected: ' + invalid)
	}
	results.push('requires existing Chasm, ordinary plane, unprotected location and unique Pinhole')

	for (const failure of ['disk', 'readback', 'stale', 'target', 'slot', 'identity', 'load', 'saving']) {
		game = await fresh(); target(game)
		const before = pinholeSnapshotCalls
		let release
		if (failure === 'disk') faults.writeFailures = 1
		if (failure === 'readback') faults.corruptAfterWrite = true
		if (failure === 'saving') game.preventSaving = true
		if (failure === 'stale') {
			const originalRead = game.readFromSlot, stale = clone(await originalRead.call(game, 0))
			stale.stack[0].state.timestamp = 1
			game.readFromSlot = async () => clone(stale)
		}
		if (['target','slot','identity','load'].includes(failure)) faults.writeGate = new Promise(resolve => { release = resolve })
		const writing = faults.writes, pending = game.processUp()
		if (release) {
			await wait(() => faults.writes > writing)
			if (failure === 'target') { game.clearCell([4,4]); game.addEntity('chasm', [4,4]) }
			if (failure === 'slot') { game.saveSlots[1] = clone(game.saveSlots[0]); game.currentSlotId = 1 }
			if (failure === 'identity') game.testSaveId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
			if (failure === 'load') runHookSync('beforeSaveLoad', {}, game)
			release(); faults.writeGate = null
		}
		const result = await pending
		check(!result?.executed && !game.pinhole && pinholeSnapshotCalls === before, 'checkpoint failure stops ending: ' + failure)
	}
	results.push('save/readback/stale-record failures, target/slot/identity/load changes and blocked saving')


	game = await fresh(); target(game)
	const add = game.addEntity
	game.addEntity = function (name, ...args) { if (name === 'pinhole') throw Error('injected native ending failure'); return add.call(this, name, ...args) }
	const failedSnapshots = pinholeSnapshotCalls
	const failedEnding = await game.processUp()
	check(failedEnding?.error?.code === 'PINHOLE_EXECUTION_FAILED' && get('save-adapter').isSavingBlocked(game), 'partial native execution blocks further saves')
	check((await game.readFromSlot(0)).stack[0].state.stuff.some(e => e.name === 'chasm') && pinholeSnapshotCalls === failedSnapshots, 'native checkpoint survives partial execution without a WE snapshot')
	results.push('partial execution failure retains native checkpoint and stops further saves')

	game = await fresh(); target(game)
	faults.failSnapshot = true
	let release
	faults.writeGate = new Promise(resolve => { release = resolve })
	const autosave = game.saveGame(), writing = faults.writes
	await wait(() => faults.inFlight > 0)
	const snapshots = pinholeSnapshotCalls
	const pending = game.processUp()
	check(get('creative-economy').snapshot().phase === 'checkpointing', 'checkpoint has its own status')
	check(!await game.processUp() && !game.pinhole, 'double click ignored while checkpoint pending')
	release(); faults.writeGate = null; await autosave
	const result = await pending
	check(result?.executed, 'native first ending starts after checkpoint: ' + JSON.stringify(result))
	check(faults.maxInFlight === 1 && faults.writes > writing, 'pending save and checkpoint serialize')
	check(pinholeSnapshotCalls === snapshots && result.snapshotId === null, '25B uses zero WE snapshots even when SnapshotStore throws')
	check(game.pinhole instanceof nativeClasses.Pinhole && game.pinhole.finalTimer === 300000 && game.stats.gameIsFinished, 'actual first-completion Pinhole.init and finishGame')
	check(game.resources.every(v => v === 0) && game.testTransfers.every(t => t.resources.every(v => v === 0)), 'Pinhole costs and Chasm refund zero')
	const checkpoint = clone((await game.readFromSlot(0)).stack[0])
	check(checkpoint.state.stuff.some(e => e.name === 'chasm') && !checkpoint.state.stuff.some(e => e.name === 'pinhole'), 'native checkpoint retains pre-ending Chasm')
	check(checkpoint.state.modloader.worldEditor.creativeMode && !checkpoint.state.stats.gameIsFinished && checkpoint.permanents.completions === 0, 'checkpoint precedes ending and reward')
	check(!get('runtime').activate() && !get('runtime').isActive(), 'editor cannot reactivate during ending')
	check(!get('creative-economy').isInputBlocked(), 'native ending pointer input remains available')
	game.mouse.xy = [2,3]; game.processDown(); same(game.mouse.originalPosition, [2,3], 'native processDown passes during ending')
	game.selectedEntity = { onmouseup() { game.testEndingPointer = true } }; game.mouse.state = 1; game.processUp()
	check(game.testEndingPointer, 'native processUp passes during ending')
	results.push('pending-save ordering, duplicate clicks, zero snapshot, real first ending, checkpoint and native pointer input')

	// Actual Tweaks skip opens actual vanilla credits; reward uses actual reset.
	const skip = game.__cattailEndingSkipController
	check(skip, 'Tweaks ending controller loaded')
	skip.button.click()
	check(game.credits?.isConnected && !get('runtime').activate(), 'Tweaks skip reaches original credits while editor stays off')
	game.deployOrbElement()
	const reward = document.querySelector('.orbResetButton')
	check(reward, 'original reward button is available')
	const oldId = checkpoint.state.modloader.saveInstanceId
	reward.click(); reward.click()
	await wait(() => game.saveSlots[0].stack[0].state === null && faults.inFlight === 0)
	check(game.completions === 1, 'Tweaks reward guard permits one reward only')
	const freshRecord = clone((await game.readFromSlot(0)).stack[0])
	check(freshRecord.state === null && freshRecord.permanents.completions === 1 && freshRecord.permanents.modloader.worldEditor.creativeMode, 'actual reset writes null world and creative carrier with reward')
	check(!freshRecord.permanents.modloader.saveInstanceId, 'carrier contains no old world identity')
	same(game.saveSlots[0].stack[1], checkpoint, 'previous native checkpoint kept unchanged')
	// Run the actual Better UIs copy/export/parse functions on fixture data only.
	const slotData = clone(game.saveSlots[0])
	const copied = saveSlotFunctions.forkSlot(slotData)
	same(copied.stack[0].permanents.modloader.worldEditor, freshRecord.permanents.modloader.worldEditor, 'copy preserves null-run Creative carrier')
	check(copied.stack[0].state === null && copied.stack[1].state.modloader.saveInstanceId !== oldId, 'copy retains blank new world and forks historical identity')
	const exported = 'CattailSaveSlots:v2\n' + saveSlotFunctions.encodeBase64(JSON.stringify(saveSlotFunctions.buildExportPayload(game)))
	const imported = saveSlotFunctions.parseImportedSlots(game, exported)
	same(imported.slots[0].stack[0].permanents.modloader.worldEditor, freshRecord.permanents.modloader.worldEditor, 'export/import preserves Creative carrier')
	same(game.saveSlots[0], slotData, 'copy/export/import parsing does not mutate source slot')
	results.push('actual Better UIs copy and export/import parser preserve per-record mode')
	results.push('Tweaks skip, native credits/reward, duplicate reward guard and native reset carrier')

	// Model reload order: a new Game object, null state skips beforeSaveLoad,
	// Loader first persists fresh identity, THEN Mod afterGameInit hooks run.
	const resume = async record => {
		cleanup()
		const next = Object.assign(Object.create(Game.prototype), game, { stuff: [], stuffMap: {}, onlyones: {}, stats: {}, resources: Array(10).fill(0),
			pinhole: null, credits: null, halt: false, preventSaving: false, testSaveId: crypto.randomUUID(),
			saveSlots: [{ name: 'next', stack: [clone(record)] }], currentSlotId: 0 })
		delete next.__cattailEndingSkipController
		delete next.deployOrbElement; delete next.watchCredits; delete next.pronounce
		next.pronounce = (...args) => args[args.length - 1]
		await next.writeToSlot(next.saveSlots[0], 0)
		const loader = createNativeLoader(runHookSync)
		const previousApply = ModLoader.applySave
		ModLoader.applySave = loader.applySave
		try {
			await loader.activate(next)
			check(loader.state.snapshotContextReady, 'real Loader identity activation succeeds')
			next.testSaveId = loader.state.snapshotSaveInstanceId
		} finally { ModLoader.applySave = previousApply }
		const saved = await next.readFromSlot(0)
		await runHook('afterGameInit', null, next)
		window.game = next
		return { next, saved }
	}
	let resumed = await resume(freshRecord); game = resumed.next
	check(resumed.saved.stack[0].state.modloader.worldEditor.creativeMode && get('creative-mode').snapshot().creativeMode, 'first identity save and new controller inherit Creative')
	check(resumed.saved.stack[0].state.modloader.saveInstanceId !== oldId && !game.stuff.length && !get('runtime').isActive(), 'new world gets fresh identity and editor runtime')
	game.completions = 1; game.addEntity('chasm', [4,4]); await game.saveGame(); target(game)
	check((await game.processUp())?.executed && game.halt && !game.pinhole.finalTimer, 'actual later completion uses quickFinish')
	check(document.querySelector('.orbResetButton'), 'quick ending keeps native reward choices')
	document.querySelector('.orbResetButton').click()
	await wait(() => game.saveSlots[0].stack[0].state === null && faults.inFlight === 0)
	const twice = clone((await game.readFromSlot(0)).stack[0])
	resumed = await resume(twice); game = resumed.next
	check(get('creative-mode').snapshot().creativeMode, 'repeated cycles retain mode')
	await get('creative-mode').disable()
	await game.reset(true)
	check(!game.saveSlots[0].stack[0].permanents.modloader.worldEditor.creativeMode, 'disable stops future inheritance')
	results.push('new-cycle first identity save, fresh runtime, quick ending, repeated inheritance and explicit disable')

	for (const record of [{ state: {}, permanents: freshRecord.permanents }, { state: null, permanents: {} }, { state: null, permanents: { modloader: { worldEditor: { schema: 9, creativeMode: true } } } }]) {
		resumed = await resume(record); game = resumed.next
		check(!get('creative-mode').snapshot().creativeMode, 'old ordinary world/blank save/invalid marker never inherits stale Creative')
	}
	game = await fresh()
	game.saveSlots[1] = { stack: [{ state: {}, permanents: {} }] }; game.currentSlotId = 1
	check(!game.assembleSave().modloader.worldEditor.creativeMode && !game.assemblePermanents().modloader.worldEditor.creativeMode, 'another slot never uses previous controller mode')
	results.push('full-state precedence, old saves, invalid carriers and cross-slot isolation')
	cleanup()
	return results
}

const constructorSource = fs.readFileSync(path.join(ROOT, 'scripts/stuff.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'scripts/codex.js'), 'utf8') + '\nreturn { Pinhole, Cube, definition: abstract_getCodex().entities.pinhole };'
const loaderSource = fs.readFileSync(path.join(ROOT, 'modloader/loader.js'), 'utf8').replace(/\r\n/g, '\n')
function section(start, end) {
	const a = loaderSource.indexOf(start), b = loaderSource.indexOf(end, a + start.length)
	if (a < 0 || b < 0) throw Error('Native Loader boundary changed: ' + start)
	return loaderSource.slice(a, b)
}
const stage = section('async stage(name, context, payload)', '\n\t\ton(name, fn, modId)')
if (stage.indexOf('await activateSnapshotContext(context)') > stage.indexOf('const hooks = state.hooks[name]')) throw Error('Loader lifecycle order changed')
const loaderFactory = `
const state = { version:'fixture', mods:[], orphanEntities:[], loadedSaveMetadata:{}, snapshotActivationSerial:0 };
const SNAPSHOT_SAVE_ID_PATTERN = /^[0-9a-f-]{16,128}$/i;
class ModLoaderSnapshotError extends Error {}
const clone = value => JSON.parse(JSON.stringify(value));
const invokeSnapshotIpc = async () => ({ token:'isolated-test', capabilities:{} });
const addIssue = () => {}; const warn = () => {}; const saveSafeText = String;
` + section('const createSnapshotSaveInstanceId =', '\n\tconst getSnapshotIpcRenderer =') +
section('const verifyPersistedSnapshotIdentity =', '\n\tconst snapshotRuntimeRequest =') +
'const api = {' + section('applySave(save, game) {', '\n\t\tshowStatus,') + '}; return {applySave:api.applySave, activate:activateSnapshotContext, state};'
const setupWithSources = new Function('window.createNativeLoader = new Function("runHookSync", ' + JSON.stringify(loaderFactory) + '); const c = new Function("Sprite", "Cloud", ' + JSON.stringify(constructorSource) + ')(class { constructor(options) { Object.assign(this, options) } switchSequence() {} }, Cloud); window.nativeClasses=c; window.nativePinholeDefinition=c.definition; (' + setup.toString() + ')();')
const slotsEntry = 'mods/Cattail_TweaksQuality_Better-UIs/scripts/save-slots.js'
const slotsSource = fs.readFileSync(path.join(ROOT, slotsEntry), 'utf8')
const exposeAt = '\t\tconst service = Object.freeze({'
if (!slotsSource.includes(exposeAt)) throw Error('Save Slots helper boundary changed')
const overrides = { [slotsEntry]: slotsSource.replace(exposeAt, 'window.saveSlotFunctions = { forkSlot, buildExportPayload, encodeBase64, parseImportedSlots };\n' + exposeAt) }
run({ label: 'Pinhole', overrides, setup: setupWithSources, exercise, entries: ['core/editor-state'], otherEntries: [
	'mods/Cattail_TweaksQuality_Better-UIs/scripts/save-slots.js',
	'mods/Cattail_TweaksQuality_Tweaks/scripts/ending-skip.js'
] }).catch(error => { console.error(error); process.exitCode = 1 })
