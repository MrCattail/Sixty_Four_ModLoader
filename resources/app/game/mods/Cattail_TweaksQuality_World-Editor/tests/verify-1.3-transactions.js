'use strict'

// Isolated Electron/IndexedDB/disk snapshots. Native Game save/codecs/entity
// add/remove/map methods run unchanged. Entity classes, selection UI, clipboard,
// Loader identity/lifecycle and Steam are fixtures, never player data.
const { run } = require('./verify-1.3-creative.js')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const assert = require('node:assert/strict')
const sessionSource = fs.readFileSync(path.join(__dirname, '../scripts/blueprint-session.js'), 'utf8')
const uiStart = sessionSource.indexOf('async function placeAtTarget(')
const uiEnd = sessionSource.indexOf('function confirmPlacementOptions(', uiStart)
if (uiStart < 0 || uiEnd <= uiStart) throw Error('Blueprint UI placement entry could not be located.')
const setupWithUi = new Function('(' + setup.toString() + ')(); window.nativePlacementUiSource = ' + JSON.stringify(sessionSource.slice(uiStart, uiEnd)) + ';')

async function testLiveUnlockPreview() {
	// Reuse the existing render/input fixtures without editing or running its suite.
	// The complete production preview controller and planner execute here.
	const fixture = fs.readFileSync(path.join(__dirname, 'verify-3b.js'), 'utf8')
	const end = fixture.lastIndexOf('run().catch(')
	assert.ok(end > 0)
	const helpers = vm.runInNewContext(fixture.slice(0, end) + '\n;({ createRuntimeEnvironment, blueprint, record, flushMicrotasks, inputEvent })', { require, __dirname, console, setTimeout, clearTimeout })
	const env = helpers.createRuntimeEnvironment()
	const listeners = new Set()
	let state = { ready: true, creativeMode: false }
	const creative = {
		game: env.game, snapshot: () => state,
		canBypassUnlock: () => state.ready && state.creativeMode,
		subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) }
	}
	env.game.saveSlots = []; env.game.unlockedEntities = {}
	env.game.isWithinMemoryComplex = () => false
	env.game.getRealPrice = name => env.game.codex.entities[name].price
	env.sandbox[Symbol.for('cattail.world-editor.creative-mode')] = creative
	env.api.emit('afterGameInit', {}, env.game)
	const controller = env.sandbox[Symbol.for('cattail.world-editor.blueprint-preview')]
	const blueprint = helpers.blueprint([helpers.record(1, 'silo', [0, 0])])
	env.session.set({ attemptId: 1, blueprint, lastResult: { attemptId: 1, status: 'captured' } })
	await helpers.flushMicrotasks()
	assert.equal(controller.snapshot().plan.records[0].reason, 'locked')
	const setMode = creativeMode => { state = { ready: true, creativeMode }; for (const listener of listeners) listener(state) }
	setMode(true); await helpers.flushMicrotasks()
	assert.equal(controller.snapshot().plan.records[0].status, 'buildable', 'unmoved preview refreshes when creative enabled')
	setMode(false); await helpers.flushMicrotasks()
	assert.equal(controller.snapshot().plan.records[0].reason, 'locked', 'unmoved preview refreshes when creative disabled')
	env.canvas.dispatch('mousedown', helpers.inputEvent(0))
	env.game.unlockedEntities.silo = true; env.advanceTime(1000); await helpers.flushMicrotasks()
	assert.equal(controller.snapshot().plan.records[0].status, 'buildable', 'pinned preview refreshes after natural unlock')
	env.runtime.runCleanups()
	assert.equal(listeners.size, 0, 'preview removes creative subscription on runtime cleanup')
	console.log('Live preview: mode changes, pinned natural unlock and subscription cleanup passed')
}

function setup() {
	const key = name => Symbol.for('cattail.world-editor.' + name)
	Object.assign(Game.prototype, nativeEntityMethods)
	for (const name of Object.keys(nativeEntityMethods)) { const original = Game.prototype[name]; Game.prototype[name] = function () {
		if (name === 'addEntity' && faults.failCell === arguments[1]?.[0]) throw Error('injected add failure')
		if (name === 'clearCell' && faults.failClear) throw Error('injected rollback failure')
		try { return original.apply(this, arguments) } catch (error) { (faults.nativeErrors ||= []).push(error.stack); throw error }
	} }
	class Entity {
		constructor(master, misc) { this.master = master; this.position = [0, 0]; this.soi = []; this.entitySpan = 0; Object.assign(this, misc) }
		setPosition(position) { this.position = position.slice() }
		getNeighbours() { return [] }
		init() {}
		update() {}
		onmousedown() {}
	}
	window.Cube = class extends Entity { constructor(master, misc) { super(master, misc); this.name = 'cube'; this.state = 2; this.broken = 0 } }
	ModLoader.applyEntitySave = (value, entity, game) => runHookSync('entitySave', value, { entity, game })
	// Real patch lifetime is necessary for the Grow save hook.
	const register = ModLoader.register
	ModLoader.register = definition => register({ ...definition, init(api) {
		api.patch = (target, name, factory) => { const original = target[name]; target[name] = factory(original); return () => { target[name] = original } }
		definition.init(api)
	} })
	ModLoader.register({ id: 'fixture', init(api) { api.on('afterGameInit', (_, game) => {
		game.stuffMap = {}; delete game.entityAtCoordinates
		game.stats.machinesSold = 0
		game.resources = new Array(10).fill(1e12)
		game.memoryBuffer = []
		for (const name of ['silo', 'silo2', 'pinhole', 'pump', 'gradient', 'stabilizer', 'surge', 'cube', 'orbifold', 'memory', 'whitehole']) {
			const span = name === 'silo2' ? 1 : 0
			game.codex.entities[name] = { canPurchase: !['cube', 'surge', 'orbifold', 'memory', 'whitehole'].includes(name), type: 'default', price: new Array(10).fill(10), priceExponent: 1.2,
				class: name === 'cube' ? Cube : class extends Entity { constructor(master, misc) { super(master, misc); this.name = name; this.entitySpan = span } } }
			game.unlockedEntities[name] = true
		}
		game.codex.resources = Array.from({ length: 10 }, () => ({ triplet: ['#fff', '#ddd', '#aaa'] }))
		game.testSelection = { revision: 1, primaryId: 1, selections: [] }
		window[key('runtime')] = { game, addCleanup() {}, subscribe() { return () => {} }, isActive: () => true, snapshot: () => ({ active: true }) }
		window[key('selection')] = { game, snapshot: () => game.testSelection }
		window[key('blueprint')] = { game, snapshot: () => ({}), async prepareCut(plan) { return { schema: 1, cutToken: plan.signature, blueprint: {}, summary: { entityCount: plan.summary.safeCount } } },
			async publishCut(candidate) { if (faults.copyGate) await faults.copyGate; if (faults.copyFailure) throw Error('clipboard fixture failure'); return { status: 'ready', clipboard: 'ready', cutToken: candidate.cutToken } }, completeCut() {} }
		const composition = game.store.compositionUpdate.bind(game.store)
		game.store.compositionUpdate = () => { game.testRefreshes = (game.testRefreshes || 0) + 1; composition() }
	}) } })
}

async function exercise() {
	const results = []
	const get = name => window[Symbol.for('cattail.world-editor.' + name)]
	const check = (value, message) => { if (!value) throw Error(message + ' after: ' + results.join('; ') + ' native errors: ' + JSON.stringify(faults.nativeErrors)) }
	const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message)
	const ok = (result, message) => check(result?.executed, message + ': ' + JSON.stringify(result))
	const tick = () => new Promise(resolve => setTimeout(resolve, 0))
	const wait = async predicate => { for (let i = 0; i < 800; i++) { if (predicate()) return; await tick() } throw Error('wait timed out') }
	const bp = (name = 'silo', position = [0, 0], span = 0) => ({ schemaVersion: 3, mode: 'structure', sourcePlane: 0, anchor: { position: [0, 0], selectionIds: [1] }, contentBounds: { min: [position[0] - span, position[1] - span], max: [position[0] + span, position[1] + span], width: 1 + span * 2, height: 1 + span * 2 }, entities: [{ id: 1, kind: 'entity', name, position, footprint: { span, min: [position[0] - span, position[1] - span], max: [position[0] + span, position[1] + span] }, config: {}, restricted: {} }] })
	let game
	const place = (blueprint = bp(), target = [0, 0], extra = {}) => get('blueprint-placement').place({ blueprint, target, input: 'api', ...extra })
	const history = async () => { ok(await get('transactions').undo({ input: 'api' }), 'undo'); ok(await get('transactions').redo({ input: 'api' }), 'redo') }
	const select = (start, end = start) => { game.testSelection = { revision: game.testSelection.revision + 1, primaryId: 1, selections: [{ id: 1, plane: 0, range: { start, end, minU: start[0], minV: start[1], maxU: end[0], maxV: end[1] } }] } }
	const fresh = async (creative = true) => { faults.failCell = null; faults.failClear = false; game = await newWorld(creative); faults.copyFailure = false; faults.copyGate = null; check(get('transactions').snapshot().ready, 'native transactions ready'); return game }
	await runHook('afterVanillaScripts')
	await fresh(false)
	const before = game.resources.slice()
	const placed = await place(); ok(placed, 'native blueprint placement')
	check(game.resources[0] < before[0] && game.entityAtCoordinates([0, 0])?.name === 'silo', 'normal charged native entity placement')
	const physical = game.decodeSave((await readSnapshot(placed.snapshotId)).data)
	check(physical.state.modloader.otherMod.note === '保留其他模组' && physical.permanents.completions === 2, 'complete snapshot metadata and permanents')
	check(physical.state.stuff.length === 0 && physical.isProtected === false, 'snapshot precedes writes')
	ok(await get('transactions').undo({ input: 'api' }), 'normal undo'); same(game.resources, before, 'undo refunds original debit')
	ok(await get('transactions').redo({ input: 'api' }), 'normal redo')
	check(game.testRefreshes > 1, 'native and attached Store views refreshed')
	results.push('object state, complete physical snapshots, native entity placement, normal cost and history')

	await fresh(); game.resources.fill(0)
	ok(await place(), 'creative zero resource blueprint'); await history(); check(game.resources.every(v => v === 0), 'creative no cost/refund')
	select([0, 0]); const deletion = get('selection-delete')
	ok(await deletion.execute(await deletion.planSelections(), 'api'), 'native selection delete'); check(!game.stuff.length, 'deleted')
	await history(); check(!game.stuff.length && game.resources.every(v => v === 0), 'delete history no creative refund')
	results.push('creative blueprint and deletion at zero resources with Undo/Redo')

	await fresh(); ok(await place(), 'cut source'); select([0, 0])
	let cut = get('selection-cut'); let plan = await cut.plan()
	faults.copyFailure = true; check(!(await cut.execute(plan, 'api')).deleted && game.stuff.length === 1, 'failed clipboard preserves source')
	faults.copyFailure = false; plan = await cut.plan(); ok(await cut.execute(plan, 'api'), 'cut success'); await history()
	results.push('cut copies first, failed copy preserves source, successful cut and history')

	await fresh(); const stroke = get('paint-cube-stroke')
	let live = stroke.beginLiveStroke({ action: 'paint', input: 'api' }); live.sample([1, 1]); live.sample([2, 1])
	ok(await live.commit(), 'stable live stroke'); check(game.stuff.length === 2 && get('transactions').snapshot().undoCount === 1, 'one stroke history')
	await history()
	live = stroke.beginLiveStroke({ action: 'erase', input: 'api' }); live.sample([1, 1]); ok(await live.commit(), 'eraser'); await history()
	live = stroke.beginLiveStroke({ action: 'paint', cubeMode: 'grow', growDurationMs: 4000, input: 'api' }); live.sample([3, 1]); ok(await live.commit(), 'grow stroke'); await history()
	await game.saveGame(); check((await game.readFromSlot(0)).stack[0].state.stuff.some(e => e.position[0] === 3 && e.par.worldEditorPaint), 'Grow persists in native state')
	live = stroke.beginLiveStroke({ action: 'paint', input: 'api' }); live.sample([4, 1]); await wait(() => !!game.entityAtCoordinates([4, 1])); check(await live.cancel(), 'live cancellation'); check(!game.entityAtCoordinates([4, 1]), 'cancel restores own cells')
	select([10, 10], [12, 11]); const fill = await get('paint-cube-fill').plan({ cell: [10, 10], cubeMode: 'stable', recipe: get('paint-cube-state').defaultRecipe() })
	ok(await stroke.executeStroke({ source: 'bucket', fillGuard: fill.guard, targets: fill.targets, recipe: fill.guard.recipe, action: 'paint', cubeMode: 'stable', input: 'api' }), 'bucket'); await history()
	results.push('Stable/Grow live paint, erase, cancel, bucket, native save and all history')

	await fresh(); let release
	faults.snapshotGate = new Promise(resolve => { release = resolve })
	const pending = place(); await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	const writes = faults.writes; const saving = game.saveGame(); await tick(); check(faults.writes === writes && !game.stuff.length, 'save and edit wait for snapshot')
	check(!(await place(bp(), [9, 9])).executed, 'duplicate rejected')
	let modeRejected = false; try { await get('creative-mode').disable() } catch (_) { modeRejected = true } check(modeRejected, 'mode toggle mutually exclusive')
	check(get('creative-economy').isInputBlocked(), 'native input blocked while transaction active')
	release(); faults.snapshotGate = null; ok(await pending, 'gated edit completes'); await saving
	check((await game.readFromSlot(0)).stack[0].state.stuff.length === 1 && !get('transactions').isBusy(), 'queued save sees completed world')
	results.push('snapshot gate, queued autosave, duplicate input, native input and creative toggle exclusion')

	for (const fault of ['failSnapshot', 'emptySnapshotResult']) {
		await fresh(); faults[fault] = true; check(!(await place()).executed && !game.stuff.length, fault + ' blocks edits'); faults[fault] = false; ok(await place(), 'no leaked busy or save gate')
	}
	await fresh(); const foreign = await game.readFromSlot(0); foreign.stack[0].state.modloader.saveInstanceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; await game.writeToSlot(foreign, 0)
	check(!(await place()).executed && !game.stuff.length, 'foreign disk identity blocks before edits')
	results.push('snapshot failure, missing snapshot ID, foreign stored identity and retry')

	await fresh(); faults.snapshotGate = new Promise(resolve => { release = resolve }); const stale = place(); await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	const oldSave = game.saveGame(); game.saveSlots[1] = JSON.parse(JSON.stringify(game.saveSlots[0])); game.currentSlotId = 1
	const oldWrites = faults.writes; release(); faults.snapshotGate = null
	check(!(await stale).executed && !game.stuff.length, 'same identity in different slot rejected'); await oldSave; check(faults.writes === oldWrites, 'old slot queued save discarded')
	await fresh(); ok(await place(), 'history source'); game.saveSlots[0] = JSON.parse(JSON.stringify(game.saveSlots[0])); check(!(await get('transactions').undo({ input: 'api' })).executed && game.stuff.length === 1, 'same ID replaced slot rejects history')
	results.push('same identity switched/replaced slot invalidates writes, history and queued saves')

	await fresh(); live = get('paint-cube-stroke').beginLiveStroke({ action: 'paint', input: 'api' }); live.sample([0, 0]); await wait(() => game.stuff.length === 1)
	const newEntity = game.addEntity('silo', [20, 20]); runHookSync('beforeSaveLoad', { modloader: { worldEditor: { schema: 1, creativeMode: true } } }, game)
	check(live.sample([2, 2]).ok === false, 'old live stroke invalidated'); await live.cancel(); check(game.entityAtCoordinates([20, 20]) === newEntity && !game.entityAtCoordinates([2, 2]), 'old stroke does not rollback or write new world')
	results.push('load epoch invalidates live cells and cancellation without cross-world rollback')

	await fresh(); ok(await place(), 'cut switch source'); select([0, 0]); cut = get('selection-cut'); plan = await cut.plan()
	faults.copyGate = new Promise(resolve => { release = resolve }); const pendingCut = cut.execute(plan, 'api'); await wait(() => cut.snapshot().phase === 'copying')
	game.saveSlots[1] = JSON.parse(JSON.stringify(game.saveSlots[0])); game.currentSlotId = 1; release(); faults.copyGate = null
	const copied = await pendingCut; check(copied.copied && !copied.deleted && game.stuff.length === 1, 'copy-only on slot change during clipboard')
	results.push('cut clipboard wait cannot delete a different slot')

	await fresh(); const planner = get('blueprint-preview-plan')
	for (const name of ['pinhole', 'orbifold', 'memory', 'whitehole']) check((await planner.build(game, bp(name), [0, 0])).records[0].status === 'blocked', 'protected special ' + name)
	const memoryTarget = [game.memorycomplexCenter[0], game.memorycomplexCenter[1]]
	check(!(await place(bp(), memoryTarget)).executed && !game.stuff.length, 'memory build blocked')
	check(!get('paint-cube-stroke').inspectCell(memoryTarget, 'paint').eligible, 'memory paint blocked')
	const protectedEntity = game.addEntity('silo', memoryTarget); select(memoryTarget); const protectedPlan = await get('selection-delete').planSelections(); check(protectedPlan.summary.safeCount === 0, 'memory deletion protected')
	check(game.entityAtCoordinates(memoryTarget) === protectedEntity, 'protected entity preserved')
	results.push('memory region and special entity protection for build/paint/delete')

	await fresh()
	const full = { ...bp(), schemaVersion: 5, mode: 'full', emptyCells: [[2, 0]], neutralCells: [], blocks: [{ kind: 'cube', name: 'cube', position: [1, 0], state: { state: 2, broken: 0, resources: [] } }], surges: [], summary: {} }
	full.entities[0].state = { fill: 0.75 }
	full.contentBounds = { min: [0, 0], max: [2, 0], width: 3, height: 1 }
	game.addEntity('stabilizer', [0, 0]); game.addEntity('silo', [2, 0])
	ok(await place(full, [0, 0], { includeBlocks: true, replaceConflicts: true, syncEmpty: true }), 'full replace and sync')
	check(game.entityAtCoordinates([0, 0]).fill === 0.75 && game.entityAtCoordinates([1, 0]).name === 'cube' && !game.entityAtCoordinates([2, 0]), 'full state and empty mask')
	await history()
	const paintSave = get('paint-cube-state').buildStableCubeSave([0, 0], get('paint-cube-state').defaultRecipe())
	const painted = { ...full, schemaVersion: 7, entities: [], blocks: [], emptyCells: [], paintedCubes: [{ kind: 'painted-cube', name: 'cube', position: [0, 0], state: paintSave.par }] }
	ok(await place(painted, [5, 5], { includeBlocks: true }), 'painted blueprint'); await history()
	check(get('paint-cube-state').normalizePaint(game.entityAtCoordinates([5, 5])), 'paint marker restored')
	results.push('full state, replacement, synchronized empty cells and painted blueprint history')

	await fresh(); game.isWithinMemoryComplex = cell => cell[0] === 1
	check(!(await place(bp('silo2', [0, 0], 1))).executed && !game.stuff.length, 'full footprint crosses memory boundary')
	game.isWithinMemoryComplex = () => false; ok(await place(), 'history protection source')
	game.isWithinMemoryComplex = () => true; check(!(await get('transactions').undo({ input: 'api' })).executed && game.stuff.length === 1, 'history rechecks protected footprint')
	await fresh(false); game.unlockedEntities.silo = false; check(!(await place()).executed, 'normal locked blueprint rejected')
	game.unlockedEntities.silo = true; game.codex.entities.silo.onlyone = true; game.onlyones.silo = true; check(!(await place()).executed, 'unique blueprint rejected')
	await fresh(false); const normalStroke = get('paint-cube-stroke').beginLiveStroke({ action: 'paint', input: 'api' }); normalStroke.sample([0, 0]); check(!(await normalStroke.commit()).executed && !game.stuff.length, 'normal mode cannot paint')
	results.push('complete footprints, protected history, locks, unique entities and creative-only painting')

	await fresh(false); game.unlockedEntities = {}; game.resources.fill(0)
	const lockedPlan = await planner.build(game, bp(), [0, 0])
	check(lockedPlan.records[0].reason === 'locked', 'initial normal blueprint is locked')
	await get('creative-mode').enableInPlace()
	check(!planner.inspect(game, lockedPlan.guard).valid, 'mode change invalidates locked preview')
	const creativePlan = await planner.build(game, bp(), [0, 0])
	check(creativePlan.records[0].status === 'buildable', 'initial creative blueprint turns green')
	ok(await place(), 'initial locked creative blueprint placement'); await history()
	check(game.resources.every(v => v === 0), 'initial blueprint and history free')
	same(game.unlockedEntities, {}, 'blueprint and history never grant permanent unlocks')
	const freeCellPlan = await planner.build(game, bp(), [5, 5])
	await get('creative-mode').disable()
	check(!planner.inspect(game, freeCellPlan.guard).valid, 'leaving creative invalidates green preview')
	check(!(await place(bp(), [5, 5])).executed && game.entityAtCoordinates([0, 0]), 'normal refuses new locked placement and keeps creative-built building')
	const progressPlan = await planner.build(game, bp(), [5, 5]); game.unlockedEntities.silo = true
	check(!planner.inspect(game, progressPlan.guard).valid, 'real unlock invalidates purple preview')
	await game.saveGame(); same((await game.readFromSlot(0)).stack[0].state.unlockedEntities, { silo: true }, 'save keeps only real progress')
	results.push('initial locked blueprint mode/progress invalidation, free placement/history and genuine saved unlocks')

	await fresh(false); faults.snapshotGate = new Promise(resolve => { release = resolve })
	const relockedPlacement = place(); await wait(() => get('transactions').snapshot().phase === 'snapshotting')
	game.unlockedEntities.silo = false; release(); faults.snapshotGate = null
	check(!(await relockedPlacement).executed && !game.stuff.length, 'lock changed while awaiting snapshot prevents actual placement')
	game.unlockedEntities.silo = true; ok(await place(), 'normal history source after unlock')
	ok(await get('transactions').undo({ input: 'api' }), 'normal history undo before relock')
	game.unlockedEntities.silo = false
	check(!(await get('transactions').redo({ input: 'api' })).executed && !game.stuff.length, 'normal redo rechecks unlock eligibility')
	results.push('post-snapshot and normal redo recheck current unlock eligibility')

	const pair = bp(); pair.entities.push({ ...bp('silo', [1, 0]).entities[0], id: 2 }); pair.contentBounds.max = [1, 0]; pair.contentBounds.width = 2
	await fresh(false); const resourcesBeforeFailure = game.resources.slice(); faults.failCell = 1
	const recovered = await place(pair); check(!recovered.executed && recovered.reason === 'rolled-back' && !game.stuff.length, 'partial placement rolled back locally')
	same(game.resources, resourcesBeforeFailure, 'failed normal placement resources restored'); faults.failCell = null; ok(await place(), 'retry after recovery')
	await fresh(); faults.failCell = 1; faults.failClear = true
	const failed = await place(pair); check(failed.error?.code === 'ROLLBACK_FAILED' && get('transactions').isWriteBlocked(), 'uncertain rollback blocks editing')
	check((await readSnapshot(failed.snapshotId)).data, 'failed recovery keeps physical snapshot')
	const blockedWrites = faults.writes; await game.saveGame(); check(faults.writes === blockedWrites, 'uncertain world cannot autosave')
	check(!(await place()).executed, 'uncertain world cannot edit again')
	runHookSync('beforeSaveLoad', { modloader: { worldEditor: { schema: 1, creativeMode: true } } }, game); check(!get('save-adapter').isSavingBlocked(game), 'reload clears old-world save block')
	results.push('partial failure local rollback, resource recovery, retained snapshot and save block until reload')

	await fresh(); faults.writeGate = new Promise(resolve => { release = resolve }); const existingSave = game.saveGame(); const waitingEdit = place()
	await tick(); check(get('transactions').snapshot().phase === 'preparing' && !game.stuff.length, 'edit waits for already-started save')
	release(); faults.writeGate = null; await existingSave; ok(await waitingEdit, 'pending native save completes before edit')
	live = get('paint-cube-stroke').beginLiveStroke({ action: 'paint', input: 'api' }); live.sample([7, 7]); await wait(() => !!game.entityAtCoordinates([7, 7]))
	const liveWrites = faults.writes; const liveSave = game.saveGame(); await tick(); check(faults.writes === liveWrites, 'autosave waits for live stroke')
	await live.cancel(); await liveSave; check(!(await game.readFromSlot(0)).stack[0].state.stuff.some(e => e.position[0] === 7), 'queued save sees cancelled stroke restored')
	results.push('pre-existing saves drain before editing; live stroke cancellation releases queued save safely')

	await fresh(); live = get('paint-cube-stroke').beginLiveStroke({ action: 'paint', cubeMode: 'grow', growDurationMs: 4000, input: 'api' }); live.sample([0, 0]); ok(await live.commit(), 'grow drift source')
	game.entityAtCoordinates([0, 0]).update(500); check(game.entityAtCoordinates([0, 0]).fill > 0, 'actual Grow update hook advanced')
	await history()
	await fresh(); live = get('paint-cube-stroke').beginLiveStroke({ action: 'paint', input: 'api' }); live.sample([0, 0]); await wait(() => game.stuff.length === 1)
	faults.failCell = 1; check(!live.sample([1, 0]).ok, 'live write failure surfaced'); check(!(await live.commit()).executed && !game.stuff.length && !get('transactions').isBusy(), 'live failure rolls back all cells and releases busy')
	faults.failCell = null; await game.saveGame()
	results.push('native Grow runtime drift retains history; failed live cell rolls back and releases saving')

	await fresh(false); for (let i = 0; i < 70; i++) game.addEntity('silo', [i, 0]); select([0, 0], [69, 0])
	const removalPlan = await get('selection-delete').planSelections()
	const clear = game.clearCell.bind(game), add = game.addEntity.bind(game)
	let cleared = 0, restoring = false, switched = false
	game.clearCell = cell => { if (++cleared === 40) { restoring = true; throw Error('injected deletion failure') } return clear(cell) }
	game.addEntity = function () {
		const result = add(...arguments)
		if (restoring && !switched) {
			switched = true
			setTimeout(() => {
				game.saveSlots[1] = JSON.parse(JSON.stringify(game.saveSlots[0])); game.currentSlotId = 1
				game.stuff = []; game.stuffMap = {}; game.entitiesInGame = {}; game.resources = new Array(10).fill(123)
				add('silo', [99, 99])
			}, 0)
		}
		return result
	}
	const interruptedRecovery = await get('selection-delete').execute(removalPlan, 'api')
	check(interruptedRecovery.error?.code === 'ROLLBACK_FAILED' && switched, 'switch during time-sliced recovery rejected')
	check(game.stuff.length === 1 && game.entityAtCoordinates([99, 99]) && game.resources.every(v => v === 123), 'old recovery never overwrites new world objects or resources')
	check((await readSnapshot(interruptedRecovery.snapshotId)).data && !get('save-adapter').isSavingBlocked(game), 'old snapshot retained without blocking unrelated new world saving')
	results.push('slot switch during asynchronous deletion rollback stops every remaining old mutation')

	await fresh(false); game.resources.fill(10000)
	const countObject = game.entitiesInGame
	ok(await place(pair), 'normal two-building price chain')
	check(game.resources[0] === (testConfig.enableFlatBuildCosts ? 9980 : 9978), 'native/Flat Costs sequential purchase prices')
	check(game.entitiesInGame === countObject && game.entitiesInGame.silo === 2, 'price quotation restores live count object')
	check(!game.codex.entities.eraser, '1.3 fixture must not invent an eraser commodity')
	const expectedRefund = game.getRealPrice('silo', true)[0]
	const balance = game.resources[0]; select([0, 0])
	ok(await get('selection-delete').execute(await get('selection-delete').planSelections(), 'api'), 'normal delete price chain')
	check(Math.abs(game.resources[0] - balance - expectedRefund) < 1e-8, 'normal deletion uses native/refund price chain')
	ok(await get('transactions').undo({ input: 'api' }), 'normal delete undo'); check(game.resources[0] === balance, 'normal delete undo reverses actual recorded delta')
	results.push('normal blueprint/deletion quote the live native and Flat Costs price chain, preserve counts and reverse exact delta')

	// Run the actual UI entry, including its caller-side lock handling. Calling
	// placement.place directly cannot catch a UI flag that rejects its own request.
	for (const creative of [false, true]) {
		await fresh(creative)
		if (creative) { game.unlockedEntities = {}; game.resources.fill(0) }
		const blueprint = bp(), target = [20, 20]
		const planner = get('blueprint-preview-plan'), placement = get('blueprint-placement')
		const plan = await planner.build(game, blueprint, target)
		check(plan.records[0].status === 'buildable', 'ordinary native target is buildable before UI placement')
		const deps = {
			placement, currentPlacement: placement.snapshot(), currentTransform: { blueprint },
			previewController: { snapshot: () => ({ plan }), async refreshNow() {} },
			blueprintPlacementAllowed: () => true, normalizePosition: cell => cell,
			currentSession: {}, creative: get('creative-mode'),
			markPlacementProbe() {}, placementVariantsProbe: value => value, placementProposalProbe: value => value,
			confirmPlacementOptions() { throw Error('unexpected options dialog') }, refreshCard() {}
		}
		const uiPlace = new Function('deps', 'const {' + Object.keys(deps).join(',') + '} = deps; ' + nativePlacementUiSource + '; return placeAtTarget;')(deps)
		ok(await uiPlace('mouse', target), 'actual blueprint UI entry in ' + (creative ? 'creative' : 'normal') + ' mode')
		check(!get('creative-mode').isInputBlocked(), 'UI must release only its own operation state')
		await history()
		get('creative-mode').setDialogOpen(true, 'real-mode-confirmation')
		const blocked = await place(bp(), [30, 30])
		check(!blocked.executed && blocked.error?.code === 'BUSY' && !game.entityAtCoordinates([30, 30]), 'unrelated real dialog still blocks placement')
		check(!blocked.error.message.toLowerCase().includes('save'), 'busy error must not claim the active save changed')
		get('creative-mode').setDialogOpen(false, 'real-mode-confirmation-closed')
	}
	results.push('real blueprint UI entry in normal/creative mode, history and unrelated confirmation exclusion')
	return results
}

const entries = ['core/editor-transactions', 'core/paint-cube-state', 'core/blueprint-painted', 'core/paint-cube-growth', 'core/blueprint-state', 'core/blueprint-preview-plan', 'core/blueprint-placement', 'core/selection-delete', 'core/selection-cut', 'core/paint-cube-stroke', 'core/paint-cube-fill']
module.exports = { setup, entries }
if (require.main === module) testLiveUnlockPreview().then(() => run({ label: 'transactions', setup: setupWithUi, exercise, entries })).catch(error => { console.error(error); process.exitCode = 1 })
