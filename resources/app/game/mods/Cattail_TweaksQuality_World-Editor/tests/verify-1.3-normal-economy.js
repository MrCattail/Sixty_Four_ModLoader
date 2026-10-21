'use strict'

// Native 1.3 Codex metadata, pricing and demolition quote, actual cut UI entry,
// WE transactions, IndexedDB and disk snapshots. Entity constructors, selection,
// clipboard and Loader/Steam lifecycle remain isolated fixtures; no player data.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { run } = require('./verify-1.3-creative.js')
const { setup, entries } = require('./verify-1.3-transactions.js')
const codexSource = fs.readFileSync(path.resolve(__dirname, '../../../scripts/codex.js'), 'utf8')
const classNames = [...new Set([...codexSource.matchAll(/class:\s*(\w+)/g)].map(match => match[1]))]
const catalog = vm.runInNewContext(codexSource + ';abstract_getCodex()', Object.fromEntries(classNames.map(name => [name, class {}])))
for (const name of ['eraser', 'eraser2', 'eraser3']) assert.equal(Object.hasOwn(catalog.entities, name), false, '1.3 has no eraser commodity: ' + name)
const uiSource = fs.readFileSync(path.join(__dirname, '../scripts/ui/selection-cut-ui.js'), 'utf8')
const uiStart = uiSource.indexOf('function renderStatus(')
const uiEnd = uiSource.indexOf('function openConfirmation(', uiStart)
assert.ok(uiStart >= 0 && uiEnd > uiStart, 'actual cut UI entry is available')
const setupWithSources = new Function('(' + setup.toString() + ')(); window.nativeEconomyCatalog = ' + JSON.stringify(catalog) + '; window.nativeCutUiSource = ' + JSON.stringify(uiSource.slice(uiStart, uiEnd)) + '; (' + setupEconomy.toString() + ')();')

function setupEconomy() {
	window.economyTrace = []
	window.Pump = class {}
	window.Gradient = class {}
	const register = ModLoader.register
	ModLoader.register = definition => register({ ...definition, init(api) {
		const create = api.storage.snapshots.create
		api.storage.snapshots.create = function () { economyTrace.push('snapshot'); return create.apply(this, arguments) }
		definition.init(api)
	} })
	// Run after the base world fixture but before the consumer Mod hooks. Rebuild
	// the Store because the base fixture's fake products are absent in real 1.3.
	ModLoader.register({ id: 'native-economy-fixture', init(api) { api.on('afterGameInit', (_, game) => {
		game.store.visibilityUpdate = () => {}
		game.store.compositionUpdate = () => {}
		for (const [name, definition] of Object.entries(game.codex.entities)) {
			if (!nativeEconomyCatalog.entities[name]) delete game.codex.entities[name]
			else game.codex.entities[name] = { ...nativeEconomyCatalog.entities[name], class: definition.class }
		}
		game.codex.entityTypes = nativeEconomyCatalog.entityTypes
		const vessel = document.createElement('div'); document.body.append(vessel)
		game.store = new DesktopStoreVersion(vessel, game)
	}) } })
}

async function exercise() {
	const results = []
	const get = name => window[Symbol.for('cattail.world-editor.' + name)]
	const check = (value, message) => { if (!value) throw Error(message) }
	const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message + ': ' + JSON.stringify({ actual: a, expected: b }))
	const vector = (a, b, message) => {
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			const actual = a[i] ?? 0, expected = b[i] ?? 0
			check(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-12), message + ' resource ' + i + ': ' + actual + ' != ' + expected)
		}
	}
	const add = (a, b, sign = 1) => Array.from({ length: 10 }, (_, i) => (a[i] || 0) + sign * (b[i] || 0))
	const ok = (result, message) => check(result?.executed, message + ': ' + JSON.stringify(result))
	const bp = (name = 'silo', positions = [[0, 0]]) => ({ schemaVersion: 3, mode: 'structure', sourcePlane: 0, anchor: { position: [0, 0], selectionIds: [1] }, contentBounds: { min: [0, 0], max: positions.at(-1), width: positions.at(-1)[0] + 1, height: 1 }, entities: positions.map((position, i) => ({ id: i + 1, kind: 'entity', name, position, footprint: { span: 0, min: position, max: position }, config: {}, restricted: {} })) })
	let game, quotes
	const select = (start = [0, 0], end = start) => { game.testSelection = { revision: game.testSelection.revision + 1, primaryId: 1, selections: [{ id: 1, plane: 0, range: { start, end, minU: start[0], minV: start[1], maxU: end[0], maxV: end[1] } }] } }
	const state = () => ({ entities: game.stuff.map(entity => game.getEntityString(entity)), resources: game.resources.slice(), counts: { ...game.entitiesInGame }, undoCount: get('transactions').snapshot().undoCount })
	async function fresh(creative = false, eraserType = 0, count = 1) {
		faults.failCell = null; faults.failClear = false; faults.copyFailure = false; faults.copyGate = null
		game = await newWorld(creative); game.eraserType = eraserType
		for (let i = 0; i < count; i++) game.addEntity('silo', [i, 0])
		game.resources.fill(0); select([0, 0], [Math.max(0, count - 1), 0])
		quotes = []; window.economyTrace = []
		const price = game.getRealPrice
		game.getRealPrice = function (name) {
			quotes.push(name)
			check(!/^eraser(?:2|3)?$/.test(name), '1.3 must never query removed commodity ' + name)
			return price.apply(this, arguments)
		}
		const blueprint = get('blueprint'), publish = blueprint.publishCut
		blueprint.publishCut = async function () { economyTrace.push('copy-start'); const result = await publish.apply(this, arguments); economyTrace.push('copy-ready'); return result }
		const clear = game.clearCell
		game.clearCell = function () { economyTrace.push('clear'); return clear.apply(this, arguments) }
	}
	function nativeRefund(start = [0, 0], end = start) {
		game.eraseOrigin = start; game.eraseTarget = end
		// Actual 1.3 rectangle scan uses getRealPrice(name, true, -extra), not
		// a duplicated formula from the World Editor implementation.
		game.updateEraseArea()
		const result = game.totalRefund.slice()
		game.cleanupErase()
		return result
	}
	async function uiCut() {
		const status = document.createElement('div'); document.body.append(status)
		let plan
		const deps = { game, status, i18n: get('i18n'), cut: get('selection-cut'), blueprint: get('blueprint'), deletion: get('selection-delete'), shared: {}, dialogs: { snapshot: () => ({ openCount: 0 }) }, selectionBusy: () => false, renderButton() {}, openConfirmation(value) { plan = value }, FAILURE_MS: 0, SUCCESS_MS: 0 }
		const start = new Function('deps', 'const {' + Object.keys(deps).join(',') + '} = deps; let disposed=false,uiBusy=false,currentDialog=null,currentRuntime={active:true},currentBlueprint={},currentCut=null,statusState=null,statusTimer=0; ' + nativeCutUiSource + '; return startCut;')(deps)
		await start('api')
		const detail = { text: status.textContent, title: status.title, kind: status.dataset.kind }; status.remove()
		check(plan?.candidate && detail.kind !== 'error', 'actual cut UI must reach confirmation: ' + JSON.stringify(detail))
		return plan
	}
	async function history(before, after) {
		ok(await get('transactions').undo({ input: 'api' }), 'undo')
		vector(game.resources, before, 'undo resource balance')
		ok(await get('transactions').redo({ input: 'api' }), 'redo')
		vector(game.resources, after, 'redo resource balance')
	}
	const place = (blueprint, target, extra = {}) => get('blueprint-placement').place({ blueprint, target, input: 'api', ...extra })
	await runHook('afterVanillaScripts')

	for (const eraserType of [0, 1, 2]) {
		for (const count of [1, 3]) {
			await fresh(false, eraserType, count)
			const before = game.resources.slice(), countObject = game.entitiesInGame
			const refund = nativeRefund([0, 0], [count - 1, 0])
			if (count === 1 && !testConfig.enableFlatBuildCosts) vector(refund, nativeEconomyCatalog.entities.silo.price, 'native mult=1 returns base price without multiplying sale ratio')
			const plan = await uiCut()
			const cutResult = await get('selection-cut').execute(plan, 'api')
			ok(cutResult, 'normal cut')
			check(!game.stuff.length && game.entitiesInGame === countObject, 'cut deletes sources and retains live count object')
			vector(game.resources, add(before, refund), 'cut matches native demolition refund')
			check(economyTrace.indexOf('copy-ready') < economyTrace.indexOf('snapshot') && economyTrace.indexOf('snapshot') < economyTrace.indexOf('clear'), 'copy completes before snapshot and removal')
			const checkpoint = game.decodeSave((await readSnapshot(cutResult.snapshotId)).data)
			check(checkpoint.state.stuff.length === count && checkpoint.permanents.completions === 2, 'native cut snapshot contains pre-removal world and permanent progress')
			vector(checkpoint.state.resources, before, 'cut snapshot contains pre-refund resources')
			await history(before, add(before, refund))
			check(!game.stuff.length, 'cut redo deletes restored sources')
			results.push('normal cut via actual UI, native refund and history: eraserType=' + eraserType + ', count=' + count)
		}
	}

	await fresh(false, 1, 3)
	const deletionRefund = nativeRefund([0, 0], [2, 0]), beforeDelete = game.resources.slice()
	ok(await get('selection-delete').execute(await get('selection-delete').planSelections(), 'api'), 'standalone normal deletion')
	vector(game.resources, deletionRefund, 'standalone deletion native refund'); await history(beforeDelete, deletionRefund)
	results.push('standalone normal deletion and history match native refund')

	for (const eraserType of [0, 1, 2]) {
		await fresh(false, eraserType, 2); game.resources.fill(1e8)
		const before = game.resources.slice(), refund = nativeRefund(), cost = game.getRealPrice('stabilizer', false).slice()
		ok(await place(bp('stabilizer'), [0, 0], { replaceConflicts: true }), 'replace existing building')
		const expected = add(add(before, refund), cost, -1)
		vector(game.resources, expected, 'replacement refunds old building and charges native new price'); await history(before, expected)
		check(game.entityAtCoordinates([0, 0])?.name === 'stabilizer', 'replacement history restores correct target')
		results.push('normal replacement refund/build cost/history: eraserType=' + eraserType)
	}

	await fresh(false, 0, 0); game.resources.fill(1e8)
	// Native extra offsets require a numeric base count (undefined + extra is
	// NaN); successive real purchases establish that count after the first build.
	game.entitiesInGame.silo = 0
	const beforeBuild = game.resources.slice(), firstCost = game.getRealPrice('silo', false, 0).slice(), secondCost = game.getRealPrice('silo', false, 1).slice()
	ok(await place(bp('silo', [[0, 0], [1, 0]]), [0, 0]), 'two native sequential builds')
	const afterBuild = add(add(beforeBuild, firstCost, -1), secondCost, -1)
	vector(game.resources, afterBuild, 'sequential build costs'); await history(beforeBuild, afterBuild)
	results.push('normal empty-ground sequential native build costs and history')

	await fresh(false, 2, 2)
	const full = { ...bp('stabilizer'), schemaVersion: 5, mode: 'full', emptyCells: [[1, 0]], neutralCells: [], blocks: [], surges: [], summary: {}, contentBounds: { min: [0, 0], max: [1, 0], width: 2, height: 1 } }
	full.entities[0].state = {}
	game.resources.fill(1e8)
	const beforeSync = game.resources.slice(), syncRefund = nativeRefund([0, 0], [1, 0]), syncCost = game.getRealPrice('stabilizer').slice()
	ok(await place(full, [0, 0], { replaceConflicts: true, syncEmpty: true }), 'replacement plus empty mask')
	const afterSync = add(add(beforeSync, syncRefund), syncCost, -1)
	vector(game.resources, afterSync, 'synchronized deletion refund and replacement cost'); await history(beforeSync, afterSync)
	check(!game.entityAtCoordinates([1, 0]), 'empty mask is restored on redo')
	results.push('normal replacement and synchronized empty cells refund each removed building once')

	await fresh(false, 0, 0)
	const beforePoor = state(), poor = await place(bp(), [0, 0])
	check(!poor.executed, 'normal build cannot bypass resource requirement'); same(state(), beforePoor, 'unaffordable build unchanged')
	await fresh(false, 0, 0); game.resources.fill(1e8); game.unlockedEntities.silo = false
	check(!(await place(bp(), [0, 0])).executed && !game.stuff.length, 'normal locked building remains blocked')
	results.push('normal resource and unlock restrictions remain enforced')

	await fresh(); ok(await get('selection-cut').execute(await uiCut(), 'api'), 'cut before spending refund')
	game.resources.fill(0)
	const beforeSpentUndo = state(), spentUndo = await get('transactions').undo({ input: 'api' })
	check(!spentUndo.executed, 'undo must not recreate a building when its refund was spent'); same(state(), beforeSpentUndo, 'denied undo leaves world and history unchanged')
	results.push('normal undo requires enough resources to reverse the recorded refund')

	await fresh(false, 0, 0); game.resources.fill(1e8); faults.failCell = 1
	const beforePartial = state(), partial = await place(bp('silo', [[0, 0], [1, 0]]), [0, 0])
	check(!partial.executed && partial.reason === 'rolled-back' && !game.stuff.length, 'partial normal build rolls back')
	vector(game.resources, beforePartial.resources, 'partial native-priced build restores resource balance')
	check(get('transactions').snapshot().undoCount === 0 && !get('transactions').isWriteBlocked(), 'successful rollback leaves no history or terminal write block')
	results.push('partial native-priced placement failure restores the world and resource balance')

	await fresh(); const copyPlan = await uiCut(), beforeCopyFailure = state(); faults.copyFailure = true
	const copyFailure = await get('selection-cut').execute(copyPlan, 'api')
	check(!copyFailure.executed && !copyFailure.copied && !economyTrace.includes('snapshot'), 'clipboard failure prevents snapshot/removal'); same(state(), beforeCopyFailure, 'clipboard failure unchanged')
	await fresh(); const snapshotPlan = await uiCut(), beforeSnapshotFailure = state(); faults.failSnapshot = true
	const snapshotFailure = await get('selection-cut').execute(snapshotPlan, 'api')
	check(!snapshotFailure.executed && snapshotFailure.copied && !snapshotFailure.deleted, 'snapshot failure is copied-only'); same(state(), beforeSnapshotFailure, 'snapshot failure unchanged')
	results.push('normal cut copy-first and copied-only guarantees under clipboard/snapshot failures')

	for (const change of ['slot', 'target']) {
		await fresh(); const plan = await uiCut(), before = game.resources.slice(); let release
		faults.copyGate = new Promise(resolve => { release = resolve })
		const pending = get('selection-cut').execute(plan, 'api')
		for (let i = 0; i < 400 && !economyTrace.includes('copy-start'); i++) await new Promise(resolve => setTimeout(resolve, 0))
		check(economyTrace.includes('copy-start'), 'cut reached clipboard gate')
		if (change === 'slot') { game.saveSlots[1] = JSON.parse(JSON.stringify(game.saveSlots[0])); game.currentSlotId = 1 }
		else { game.clearCell([0, 0]); game.addEntity('silo', [0, 0]) }
		const retained = game.entityAtCoordinates([0, 0]); release(); faults.copyGate = null
		const denied = await pending
		check(!denied.executed && denied.copied && !denied.deleted && game.entityAtCoordinates([0, 0]) === retained, 'change while copying must retain target: ' + change)
		vector(game.resources, before, 'change while copying no refund')
		results.push('normal cut rechecks ' + change + ' after asynchronous clipboard completion')
	}

	await fresh(); const snapshotSource = game.entityAtCoordinates([0, 0]); game.isWithinMemoryComplex = () => true
	const protectedPlan = await get('selection-delete').planSelections()
	check(protectedPlan.summary.safeCount === 0 && game.entityAtCoordinates([0, 0]) === snapshotSource, 'Memory Complex deletion remains protected')
	await fresh(); const originalPrice = game.getRealPrice
	game.getRealPrice = function (name, sale) { return name === 'silo' && sale ? [NaN] : originalPrice.apply(this, arguments) }
	let invalidPrice
	try { await get('selection-cut').plan() } catch (error) { invalidPrice = error }
	check(invalidPrice && game.stuff.length === 1 && !economyTrace.includes('snapshot'), 'invalid ordinary refund price is rejected rather than made free')
	results.push('memory protection and invalid ordinary prices remain fail-closed')

	await fresh(true, 2, 2); const zero = game.resources.slice()
	ok(await get('selection-cut').execute(await uiCut(), 'api'), 'creative cut'); await history(zero, zero)
	ok(await place(bp(), [0, 0]), 'creative empty-ground build')
	ok(await place(bp('stabilizer'), [0, 0], { replaceConflicts: true }), 'creative replacement'); await history(zero, zero)
	vector(game.resources, zero, 'creative cut/build/replacement/history stay free')
	results.push('creative zero-resource cut, build, replacement and history remain zero cost/refund')
	return results
}

if (require.main === module) run({ label: 'normal-economy', setup: setupWithSources, exercise, entries }).catch(error => { console.error(error); process.exitCode = 1 })
