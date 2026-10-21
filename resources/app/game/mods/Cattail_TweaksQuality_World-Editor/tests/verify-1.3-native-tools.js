'use strict'

// Native input/Store methods, IndexedDB and SnapshotStore run in the shipped
// Electron runtime. Store pickup also uses native constructors/initHint; Sprite
// rendering and the other entity/lifecycle/Steam fixtures remain isolated.
const fs = require('node:fs')
const path = require('node:path')
const { run } = require('./verify-1.3-creative.js')
const { setup, entries } = require('./verify-1.3-transactions.js')

function setupTools() {
	Object.assign(Game.prototype, nativeToolMethods)
	ModLoader.register({ id: 'fixture-native-tools', init(api) {
		api.on('afterGameInit', (_, game) => {
			window.Pump = game.codex.entities.pump.class
			window.Gradient = game.codex.entities.gradient.class
			game.unlockedEntities = {}
			game.entitiesInGame = {}
			game.resources.fill(0)
			game.mouse.originalPosition = [0, 0]
			game.mouse.delta = [0, 0]
			game.updateMouseData = () => {}
			game.isWithinMemoryComplex = p => game.testMemory?.some(c => c[0] === p[0] && c[1] === p[1]) || false
			game.codex.resources.forEach(r => { r.name = 'fixture'; r.hex = '#fff' })
			for (const definition of Object.values(game.codex.entities)) {
				const proto = definition.class.prototype
				if (proto.nativeTestPatched) continue
				proto.nativeTestPatched = true
				const original = new Function('return ({' + nativeSetPositionSource + '}).setPosition')()
				proto.setPosition = function (p) {
					if (faults.setPositionHook) faults.setPositionHook(this, p)
					if (faults.failPosition === p[0]) throw Error('injected setPosition failure')
					if (faults.failPositionOnce === p[0]) { faults.failPositionOnce = null; throw Error('injected one-time setPosition failure') }
					return original ? original.call(this, p) : (this.position = p.slice())
				}
			}
		})
	} })
}

async function verifyShopConstruction() {
	const get = name => window[Symbol.for('cattail.world-editor.' + name)]
	const check = (ok, message) => { if (!ok) throw Error(message) }
	const game = await newWorld(true)
	// Use the actual constructor/initHint chain and native Cloud/Store DOM. Only
	// Sprite allocation is inert: this test does not load images or render a world.
	const codex = new Function('Sprite', 'Cloud', nativeConstructorSource)(class {
		constructor(options) { Object.assign(this, options) }
		switchSequence(sequence) { this.sequence = sequence }
	}, Cloud)
	game.codex = codex
	game.unlockedEntities = {}
	game.entitiesInGame = {}
	game.store.reinit()
	const names = Object.keys(codex.entities).filter(name => get('creative-mode').canBypassUnlock(name))
	check(names.includes('silo') && names.includes('destabilizer') && names.includes('chasm'), 'real catalog contains reported constructor path')
	let view
	window[Symbol.for('cattail.better-uis.classic-shop')]?.subscribe(value => { view = value })()
	const errors = []
	const onError = event => { errors.push(event.error?.stack || event.message); event.preventDefault() }
	window.addEventListener('error', onError)
	function pick(name) {
		delete game.itemInHand
		delete game.interactionMode
		game.plane = codex.entities[name].type === 'dark' ? 1 : 0
		game.store.visibilityUpdate()
		const card = game.store.html.items[name]
		check(card && !card.classList.contains('hidden') && !card.classList.contains('disabled'), 'real card available: ' + name)
		if (testConfig.enableShopCategories) {
			view.centerCategory(name)
			const row = view.vessel.querySelector('[data-shop-item="' + name + '"]')
			check(row && !row.classList.contains('disabled'), 'categorized real card: ' + name)
			row.click()
		} else {
			if (!view) {
				game.store.closeTypes()
				game.store.html.types[codex.entities[name].type || 'default'].button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
			}
			card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
		}
		check(!errors.length && game.interactionMode === 'build' && game.itemInHand?.name === name,
			'actual constructor card pickup: ' + name + ' ' + errors.join('; '))
		check(!game.stuff.includes(game.itemInHand), 'held preview is not a placed entity: ' + name)
	}
	try {
		for (const name of names) pick(name)
		check(game.resources.every(v => v === 0) && !game.stuff.length && !get('transactions').snapshot().undoCount, 'picking previews neither spends nor edits history/world')
		pick('silo')
		check(game.itemInHand.position === undefined, 'native silo remains unpositioned until placement')
		// Temporary qualification must not become permanent progress.
		game.unlockedEntities = {}
		await get('creative-mode').disable()
		check(!game.itemInHand && game.interactionMode !== 'build', 'mode exit clears still-locked native preview')
		game.resources.fill(1e20)
		for (const name of names) game.unlockedEntities[name] = true
		for (const name of names) pick(name)
		await get('creative-mode').enableInPlace()
		game.resources.fill(0)
		for (const name of names) pick(name)
		return names.length
	} finally {
		window.removeEventListener('error', onError)
	}
}

async function exercise() {
	const results = []
	const get = name => window[Symbol.for('cattail.world-editor.' + name)]
	const check = (ok, message) => { if (!ok) throw Error(message + '; completed: ' + results.join(', ')) }
	const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify(a))
	const ok = (result, message) => check(result?.executed, message + ': ' + JSON.stringify(result))
	const tick = () => new Promise(resolve => setTimeout(resolve, 0))
	const wait = async fn => { for (let i = 0; i < 800; i++) { if (fn()) return; await tick() } throw Error('wait timeout') }
	let game
	async function fresh(creative = true) {
		faults.failPosition = faults.failPositionOnce = faults.setPositionHook = faults.failCell = null
		faults.failClear = false
		game = await newWorld(creative)
		return game
	}
	const add = (name, p) => game.addEntity(name, p)
	const pointer = p => { game.hoveredCell = p.slice(); game.hoveredEntity = game.entityAtCoordinates(p); game.mouse.xy = p.slice() }
	function keyMove(entity) {
		delete game.interactionMode
		pointer(entity.position)
		game.processE()
	}
	async function drop(p) {
		pointer(p); game.mouse.state = 1; game.processMove(); game.processUp()
		return get('native-tools').whenIdle()
	}
	async function move(entity, p) { keyMove(entity); return drop(p) }
	async function erase(start, end = start) {
		delete game.interactionMode; game.pickupEraser()
		pointer(start); game.mouse.state = 1; game.processDown()
		pointer(end); game.processMove(); game.processUp()
		return get('native-tools').whenIdle()
	}
	const history = async () => { ok(await get('transactions').undo({ input: 'keyboard' }), 'undo'); ok(await get('transactions').redo({ input: 'keyboard' }), 'redo') }
	await runHook('afterVanillaScripts')
	const constructorCount = await verifyShopConstruction()
	results.push('actual native constructors and Store pickup in creative/normal/re-enabled modes: ' + constructorCount + ' buildings')
	await fresh()
	const malformed = add('silo', [0, 0])
	delete malformed.position
	check(!game.canRelocate(malformed) && !game.canEraseEntity(malformed), 'live unpositioned entity is rejected without throwing')
	for (const invalid of [null, [], [NaN, 0], [0.5, 0], [Number.MAX_SAFE_INTEGER + 1, 0]]) {
		malformed.position = invalid
		check(!game.canRelocate(malformed) && !game.canEraseEntity(malformed), 'malformed live coordinates stay protected')
	}
	const detached = new game.codex.entities.silo.class(game)
	delete detached.position
	check(game.canRelocate(detached), 'constructor hint keeps the native movable-type result')
	check(!get('native-tools').safe(detached, 'relocate'), 'constructor hint is not permission for an actual tool operation')
	game.hoveredEntity = detached
	game.processE()
	check(game.interactionMode !== 'relocate' && !game.relocationList?.length, 'E refuses a detached preview without throwing')
	game.relocationCandidatesList = [detached]
	game.pickupEntitiesForRelocation()
	check(!game.relocationList?.length, 'direct native pickup rejects the detached preview')
	const detachedMove = await get('native-tools').handle('massRelocate', [[detached], [[3, 3]]])
	check(!detachedMove.executed && !get('transactions').snapshot().undoCount, 'detached preview cannot be committed as a move')
	results.push('invalid live entity coordinates fail closed without breaking input')
	await fresh()
	let entity = add('silo', [0, 0])
	keyMove(entity)
	check(game.interactionMode === 'relocate' && game.relocationList?.[0] === entity, 'initial creative E must select a building without mega3')
	check(get('native-tools'), 'native tool service')
	const resources = game.resources.slice()
	entity.testProduction = { stored: 77, progress: 0.35 }
	ok(await drop([5, 5]), 'E mouse placement')
	check(game.entityAtCoordinates([5, 5]) === entity && !game.entityAtCoordinates([0, 0]), 'moves the same object')
	same(entity.testProduction, { stored: 77, progress: 0.35 }, 'production state preserved')
	same(game.resources, resources, 'creative movement is free')
	check(get('transactions').snapshot().undoCount === 1, 'one movement history item')
	await history()
	check(game.entityAtCoordinates([5, 5]) === entity, 'redo retains same object')
	results.push('initial creative E, same live object/production, free move and history')

	await fresh(false)
	entity = add('silo', [0, 0])
	keyMove(entity); check(game.interactionMode !== 'relocate', 'normal locked E remains locked')
	game.entitiesInGame.mega3 = 1
	keyMove(entity); pointer([4, 4]); game.mouse.state = 1; game.processMove(); game.processUp()
	check(game.entityAtCoordinates([4, 4]) === entity, 'normal unlocked E uses native move')
	check(get('transactions').snapshot().undoCount === 0, 'normal E adds no WE history')
	check(!get('transactions').snapshot().lastTransaction, 'normal E creates no WE transaction')
	results.push('normal progression gate and unmodified native move without WE history')

	await fresh()
	entity = add('silo', [0, 0])
	ok(await move(entity, [4, 4]), 'move before mode toggle')
	await get('creative-mode').disable()
	let rejected = await get('transactions').undo({ input: 'api' })
	check(!rejected.executed && rejected.error.code === 'ECONOMY_MODE_CHANGED', 'normal mode cannot undo creative relocation: ' + JSON.stringify(rejected))
	check(game.entityAtCoordinates([4, 4]) === entity, 'mode disable leaves completed relocation')
	check(game.store.html.relocator.classList.contains('hidden'), 'normal locked tool hidden again')
	await get('creative-mode').enableInPlace()
	ok(await get('transactions').undo({ input: 'api' }), 'creative history resumes after validation')
	keyMove(entity); await get('creative-mode').disable()
	check(!game.relocationList && game.interactionMode !== 'relocate', 'disable cancels pending preview')
	same(game.unlockedEntities, {}, 'tools never grant permanent unlocks')
	check(!game.entitiesInGame.mega3, 'tools never fake mega3 count')
	results.push('mode-only history, tool visibility, preview cancellation and no permanent progress grant')

	await fresh()
	entity = add('silo', [0, 0]); pointer([0, 0])
	game.store.html.relocator.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.interactionMode === 'relocate' && !game.relocationList, 'Store relocator enters selection without picking the last hovered building')
	pointer([0, 0]); game.mouse.state = 1; game.processDown(); pointer([1, 1]); game.processMove(); game.processUp()
	check(game.relocationList?.length === 1, 'native rectangle selection')
	ok(await drop([10, 10]), 'Store initiated rectangle move')
	game.store.html.eraser.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(game.interactionMode === 'erase' && !game.store.html.eraser.classList.contains('disabled'), 'real Store eraser button')
	game.store.html.eraser.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	check(!game.interactionMode, 'second Store press cancels tool')
	pointer([30, 30]); game.store.isOpen = false; game.processQ()
	check(game.interactionMode === 'erase', 'native Q on blank selects eraser')
	game.processQ(); check(!game.interactionMode, 'native Q cancellation')
	results.push('actual Store buttons, native rectangle selection, Q blank and cancellation')

	await fresh()
	const a = add('silo', [0, 0]), b = add('silo', [3, 0])
	ok(await move(a, [3, 0]), 'single-cell occupied swap')
	check(game.entityAtCoordinates([3, 0]) === a && game.entityAtCoordinates([0, 0]) === b, 'swap both objects')
	await history()
	results.push('single-cell swap with one atomic undo/redo')

	await fresh()
	entity = add('silo2', [0, 0])
	ok(await move(entity, [10, 10]), 'wide building to empty footprint')
	for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
		check(!game.entityAtCoordinates([u, v]), 'old wide footprint cleared')
		check(game.entityAtCoordinates([10 + u, 10 + v]) === entity, 'new full wide footprint populated')
	}
	await history()
	const occupant = add('silo', [20, 20])
	rejected = await move(entity, [20, 20]); check(!rejected.executed && rejected.error.code === 'UNSAFE_SWAP', 'wide occupied swap denied')
	check(game.entityAtCoordinates([20, 20]) === occupant && game.entityAtCoordinates([10, 10]) === entity, 'rejected swap leaves objects')
	game.testMemory = [[31, 30]]
	rejected = await move(entity, [30, 30]); check(!rejected.executed, 'edge of wide target in memory denied')
	results.push('wide empty placement and map cells, wide swap refusal, full memory footprint')

	await fresh()
	entity = add('silo', [0, 0])
	let second = add('silo', [2, 0])
	game.relocationCandidatesList = [entity, second]; game.interactionMode = 'relocate'; game.pickupEntitiesForRelocation()
	ok(await drop([10, 10]), 'native multi-object relocation')
	check(game.entityAtCoordinates([9, 10]) === entity && game.entityAtCoordinates([11, 10]) === second, 'relative offsets preserved')
	check(get('transactions').snapshot().undoCount === 1, 'batch one history')
	await history()
	results.push('batch offsets and one history record')

	await fresh()
	const pump = add('pump', [0, 0]); const special = add('orbifold', [4, 0]); entity = add('silo', [8, 0])
	check(!game.canRelocate(pump) && !game.canRelocate(special), 'native forbidden and special types protected')
	check(!game.canEraseEntity(pump), 'last extractor protected')
	entity.spawnedHollows = 1
	check(!game.canRelocate(entity) && !game.canEraseEntity(entity), 'attached production protected')
	entity.spawnedHollows = 0; game.testMemory = [[8, 0]]
	check(!game.canRelocate(entity) && !game.canEraseEntity(entity), 'source memory protected')
	game.testMemory = []; game.plane = 1; game.processE(); check(game.interactionMode !== 'relocate', 'other plane blocked')
	game.plane = 0; game.entitiesInGame.pinhole = 1; game.processE(); check(game.interactionMode !== 'relocate', 'ending context blocked')
	results.push('last extractor, native types, attachments, special/source-memory/plane/ending protection')

	await fresh()
	entity = add('silo', [0, 0]); second = add('silo', [2, 0])
	ok(await erase([0, 0], [2, 0]), 'creative native drag erase')
	check(!game.stuff.length, 'selected objects removed')
	same(game.resources, new Array(10).fill(0), 'creative demolition does not refund')
	check(game.testTransfers.length === 0, 'no resource transfer on creative erase')
	check(get('transactions').snapshot().undoCount === 1, 'batch erase one history')
	await history()
	results.push('native drag erase, no refund and one history')

	await fresh()
	entity = add('silo2', [0, 0])
	ok(await erase([1, 1]), 'erase wide building from an edge cell')
	await history()
	results.push('wide deletion deduplicates and captures complete footprint')

	await fresh(false)
	game.unlockedEntities.pump = true
	entity = add('silo', [0, 0])
	game.pickupEraser(); pointer([0, 0]); game.mouse.state = 1; game.processDown(); game.processUp()
	check(!game.entityAtCoordinates([0, 0]) && game.resources.some(v => v > 0), 'normal native demolition still refunds')
	check(get('transactions').snapshot().undoCount === 0, 'normal demolition no new history')
	results.push('normal demolition original refund and history boundary')

	await fresh()
	entity = add('silo', [0, 0]); let release
	faults.snapshotGate = new Promise(resolve => { release = resolve })
	keyMove(entity); pointer([5, 5]); game.mouse.state = 1; game.processMove(); game.processUp()
	await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	check(game.entityAtCoordinates([0, 0]) === entity, 'no movement before snapshot')
	try { await get('creative-mode').disable(); throw Error('mode change unexpectedly accepted') } catch (e) { check(e.code === 'BUSY', 'mode change excluded during snapshot') }
	game.pickupItem('silo'); check(!game.itemInHand, 'purchases excluded during edit')
	const blocked = await get('transactions').undo({ input: 'api' }); check(!blocked.executed, 'concurrent history excluded')
	add('silo', [5, 5]); release(); faults.snapshotGate = null
	rejected = await get('native-tools').whenIdle(); check(!rejected.executed && game.entityAtCoordinates([0, 0]) === entity, 'changed target during snapshot rejected')
	results.push('snapshot before writing, input/mode/history exclusion and destination revalidation')

	await fresh()
	entity = add('silo', [0, 0]); keyMove(entity)
	game.clearCell([0, 0]); add('silo', [0, 0])
	rejected = await drop([5, 5]); check(!rejected.executed, 'same-type replacement after pickup rejected')
	results.push('picked-up source identity cannot be replaced')

	await fresh()
	entity = add('silo', [0, 0]); faults.failSnapshot = true
	rejected = await move(entity, [5, 5]); check(!rejected.executed && game.entityAtCoordinates([0, 0]) === entity, 'snapshot failure leaves world')
	check(get('transactions').snapshot().undoCount === 0, 'failed snapshot no history')
	results.push('snapshot failure is nonmutating')

	await fresh()
	entity = add('silo', [0, 0]); second = add('silo', [2, 0])
	faults.failPositionOnce = 11
	game.relocationCandidatesList = [entity, second]; game.interactionMode = 'relocate'; game.pickupEntitiesForRelocation()
	rejected = await drop([10, 10]); check(!rejected.executed && rejected.reason === 'rolled-back', 'partial relocation locally rolls back')
	check(game.entityAtCoordinates([0, 0]) === entity && game.entityAtCoordinates([2, 0]) === second, 'both original positions restored')
	check(!game.entityAtCoordinates([9, 10]) && !game.entityAtCoordinates([11, 10]), 'failed target maps cleaned')
	check(!get('transactions').isWriteBlocked(), 'successful rollback permits future edits')
	results.push('partial batch write rollback restores object identities and map')

	await fresh()
	entity = add('silo', [0, 0]); faults.failPositionOnce = 5; faults.failPosition = 0
	rejected = await move(entity, [5, 5])
	check(!rejected.executed && get('transactions').isWriteBlocked(), 'failed local rollback blocks editing')
	check(get('save-adapter').isSavingBlocked(game), 'failed rollback blocks saving')
	check((await readSnapshot(rejected.snapshotId)).data, 'failed rollback retains full snapshot')
	results.push('rollback failure preserves snapshot and blocks saving/editing')

	await fresh()
	entity = add('silo', [0, 0]); faults.snapshotGate = new Promise(resolve => { release = resolve })
	keyMove(entity); pointer([5, 5]); game.mouse.state = 1; game.processMove(); game.processUp()
	await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	game.saveSlots.push({ stack: [] }); game.currentSlotId = 1
	release(); faults.snapshotGate = null
	rejected = await get('native-tools').whenIdle(); check(!rejected.executed && game.entityAtCoordinates([0, 0]) === entity, 'switching slots aborts old operation')
	results.push('slot switch aborts before mutation')

	await fresh()
	entity = add('silo', [0, 0]); let releaseSave
	faults.writeGate = new Promise(resolve => { releaseSave = resolve })
	const pendingSave = game.saveGame(); await wait(() => faults.inFlight > 0)
	keyMove(entity); pointer([5, 5]); game.mouse.state = 1; game.processMove(); game.processUp()
	await tick(); check(game.entityAtCoordinates([0, 0]) === entity, 'waits for already active save')
	releaseSave(); faults.writeGate = null; await pendingSave
	ok(await get('native-tools').whenIdle(), 'continues after native save')
	await game.saveGame(); const saved = (await game.readFromSlot(0)).stack[0].state
	check(saved.modloader.worldEditor.creativeMode && !saved.unlockedEntities?.mega3, 'saved creative state without fake progress')
	results.push('pending native save coordination and native creative save write/read')

	await fresh()
	entity = add('silo', [0, 0]); keyMove(entity); game.mouse.state = 2; game.processUp()
	check(!game.relocationList && !game.interactionMode && game.entityAtCoordinates([0, 0]) === entity, 'right click cancels without mutation')
	check(get('transactions').snapshot().undoCount === 0, 'cancel makes no history')
	ok(await move(entity, [5, 5]), 'move before external history change')
	game.clearCell([5, 5]); add('silo', [5, 5])
	rejected = await get('transactions').undo({ input: 'api' }); check(!rejected.executed, 'history rejects replacement identity')
	results.push('right-click cancellation and historical object identity revalidation')

	await fresh()
	entity = add('silo', [0, 0])
	ok(await move(entity, [5, 5]), 'move before deletion history')
	ok(await erase([5, 5]), 'delete moved building')
	ok(await get('transactions').undo({ input: 'api' }), 'undo native deletion')
	ok(await get('transactions').undo({ input: 'api' }), 'undo movement after trusted deletion restoration')
	check(game.entityAtCoordinates([0, 0])?.name === 'silo', 'mixed history original position')
	ok(await get('transactions').redo({ input: 'api' }), 'mixed history redo movement')
	ok(await get('transactions').redo({ input: 'api' }), 'mixed history redo deletion')
	results.push('mixed relocation/deletion history preserves trusted restored identity')

	await fresh()
	const blueprint = { schemaVersion: 3, mode: 'structure', sourcePlane: 0, anchor: { position: [0, 0], selectionIds: [1] }, contentBounds: { min: [0, 0], max: [0, 0], width: 1, height: 1 }, entities: [{ id: 1, kind: 'entity', name: 'silo', position: [0, 0], footprint: { span: 0, min: [0, 0], max: [0, 0] }, config: {}, restricted: {} }] }
	ok(await get('blueprint-placement').place({ blueprint, target: [0, 0], input: 'api' }), 'blueprint before relocation')
	entity = game.entityAtCoordinates([0, 0])
	ok(await move(entity, [5, 5]), 'move blueprint-created object')
	ok(await get('transactions').undo({ input: 'api' }), 'undo blueprint object movement')
	ok(await get('transactions').undo({ input: 'api' }), 'undo original blueprint')
	ok(await get('transactions').redo({ input: 'api' }), 'redo original blueprint')
	ok(await get('transactions').redo({ input: 'api' }), 'redo movement after blueprint restoration')
	check(game.entityAtCoordinates([5, 5])?.name === 'silo', 'blueprint/movement history final position')
	results.push('blueprint and relocation share trusted restoration identity')

	await fresh()
	entity = add('silo', [0, 0])
	faults.snapshotGate = new Promise(resolve => { release = resolve })
	const deleting = erase([0, 0])
	await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	game.clearCell([0, 0]); const replacement = add('silo', [0, 0])
	release(); faults.snapshotGate = null
	rejected = await deleting
	check(!rejected.executed && game.entityAtCoordinates([0, 0]) === replacement, 'native deletion rechecks object after snapshot')
	results.push('deletion snapshot source replacement rejected')

	await fresh()
	entity = add('silo', [0, 0])
	const newWorldStuff = []
	faults.setPositionHook = () => {
		faults.setPositionHook = null
		game.saveSlots.push({ stack: [] }); game.currentSlotId = 1
		game.stuff = newWorldStuff; game.stuffMap = {}
	}
	rejected = await move(entity, [5, 5])
	check(!rejected.executed && game.stuff === newWorldStuff && game.stuff.length === 0, 'context switch during write never restores into new world')
	check((await readSnapshot(rejected.snapshotId)).data, 'interrupted old-world snapshot kept')
	results.push('mid-write world change never rolls old objects into new world')

	await fresh()
	entity = add('silo', [0, 0]); faults.failPositionOnce = 5
	faults.setPositionHook = () => { faults.setPositionHook = null; game.testMemory = [[0, 0]] }
	rejected = await move(entity, [5, 5])
	check(!rejected.executed && get('transactions').isWriteBlocked(), 'newly protected rollback destination is not overwritten')
	check(!game.entityAtCoordinates([0, 0]) && (await readSnapshot(rejected.snapshotId)).data, 'memory destination remains clear and recovery snapshot retained')
	results.push('rollback rechecks memory protection and stops for reload when recovery is unsafe')
	return results
}

const stuffSource = fs.readFileSync(path.resolve(__dirname, '../../../scripts/stuff.js'), 'utf8')
const setterStart = stuffSource.indexOf('\tsetPosition(uv){')
const setterEnd = stuffSource.indexOf('\n\tgetNeighbours()', setterStart)
if (setterStart < 0 || setterEnd < 0) throw Error('Native Entity.setPosition source unavailable')
const setter = stuffSource.slice(setterStart, setterEnd)
const constructorSource = stuffSource + '\n' + fs.readFileSync(path.resolve(__dirname, '../../../scripts/codex.js'), 'utf8') + '\nreturn abstract_getCodex()'
const options = { label: 'native-tools', setup: new Function('window.nativeConstructorSource = ' + JSON.stringify(constructorSource) + '; window.verifyShopConstruction = ' + verifyShopConstruction.toString() + '; window.nativeSetPositionSource = ' + JSON.stringify(setter) + '; (' + setup.toString() + ')(); (' + setupTools.toString() + ')();'), exercise, entries: [...entries, 'core/native-tools'] }
if (process.argv.includes('--baseline')) {
	const root = fs.readFileSync(path.join(require('os').tmpdir(), 'world-editor-18a-backup.txt'), 'utf8')
	options.entries = entries
	options.overrides = {}
	for (const file of ['core/creative-economy', 'core/blueprint-placement', 'core/selection-delete']) {
		options.overrides['mods/Cattail_TweaksQuality_World-Editor/scripts/' + file + '.js'] = fs.readFileSync(path.join(root, 'resources/app/game/mods/Cattail_TweaksQuality_World-Editor/scripts/' + file + '.js'), 'utf8')
	}
}
run(options).catch(error => { console.error(error); process.exitCode = 1 })
