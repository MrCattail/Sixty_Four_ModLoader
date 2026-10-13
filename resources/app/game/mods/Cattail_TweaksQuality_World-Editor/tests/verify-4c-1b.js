const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const CUT_SOURCE = 'scripts/core/selection-cut.js'
const CUT_UI_SOURCE = 'scripts/ui/selection-cut-ui.js'
const BLUEPRINT_SOURCE = 'scripts/blueprint-session.js'
const DELETE_SOURCE = 'scripts/core/selection-delete.js'
const PLACEMENT_SOURCE = 'scripts/core/blueprint-placement.js'
const SHARED_SOURCE = 'scripts/core/shared.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
const CUT_KEY = Symbol.for('cattail.world-editor.selection-cut')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function deletionPlan(safeCount = 1) {
	return {
		schema: 1,
		signature: 'deletion-signature-' + safeCount,
		source: {
			kind: 'selection',
			plane: 0,
			revision: 4,
			ranges: [
				{
					id: 7,
					primary: true,
					range: {
						start: [0, 0],
						end: [0, 0],
						minU: 0,
						maxU: 0,
						minV: 0,
						maxV: 0,
						width: 1,
						height: 1
					}
				}
			]
		},
		summary: {
			sourceCellCount: 1,
			safeCount,
			protectedCount: 2,
			crossBoundaryCount: 1,
			resourceDelta: [3, -2],
			creative: false,
			buildingCount: safeCount,
			attachedCubeCount: 0
		},
		removals: safeCount ? [{ name: 'silo', position: [0, 0] }] : [],
		protectedTargets: [
			{ name: 'cube', reason: 'cube', position: [1, 0] },
			{ name: 'pump', reason: 'last-extractor', position: [2, 0] }
		]
	}
}

function candidateFor(plan) {
	return {
		schema: 1,
		cutToken: plan.signature,
		blueprint: {
			schemaVersion: 7,
			mode: 'full',
			includeBlocks: true,
			sourcePlane: 0,
			anchor: { position: [0, 0], selectionIds: [7] },
			selections: [],
			emptyCells: [],
			contentBounds: { min: [0, 0], max: [0, 0], width: 1, height: 1 },
			entities: [{ kind: 'entity', name: 'silo', position: [0, 0] }],
			blocks: [{ kind: 'cube', name: 'cube', position: [1, 0] }],
			paintedCubes: [{ kind: 'painted-cube', name: 'cube', position: [2, 0] }],
			surges: [],
			production: null,
			summary: {
				selectionCount: 1,
				selectedCellCount: 1,
				entityCount: 1,
				blockCount: 1,
				crossBoundaryCount: 0,
				skippedCount: 2,
				capturedTypes: [{ name: 'silo', reason: 'captured', count: 1 }],
				skippedTypes: [
					{ name: 'cube', reason: 'cube', count: 1 },
					{ name: 'pump', reason: 'last-extractor', count: 1 }
				]
			}
		}
	}
}

function createEnvironment(options = {}) {
	const definitions = []
	const handlers = new Map()
	const cleanups = []
	const order = []
	const completeCalls = []
	const deleteCalls = []
	const planCalls = []
	const publishCalls = []
	const game = {}
	let planValue = options.plan || deletionPlan()
	let deletionBlocked = false
	let existingBlueprint = options.existingBlueprint !== false
	let deletionResult = options.deletionResult || {
		accepted: true,
		executed: true,
		reason: 'success',
		transaction: { kind: 'selection-delete', payload: { origin: 'cut' } },
		snapshotId: 'snapshot-1',
		error: null
	}
	let publishResult = options.publishResult || null
	const runtime = {
		game,
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		}
	}
	const deletion = {
		game,
		async planSelections(planOptions) {
			order.push('plan-deletion')
			planCalls.push(clone(planOptions || {}))
			return planValue
		},
		async execute(plan, input, executionOptions) {
			order.push('delete-world')
			deleteCalls.push({ plan, input, options: executionOptions })
			return deletionResult
		},
		isInputBlocked() {
			return deletionBlocked
		}
	}
	const blueprint = {
		game,
		snapshot() {
			return { blueprint: existingBlueprint ? { schemaVersion: 3 } : null }
		},
		prepareCut(plan) {
			order.push('prepare-blueprint')
			return candidateFor(plan)
		},
		async publishCut(candidate) {
			order.push('publish-clipboard')
			publishCalls.push(candidate)
			if (publishResult) return publishResult
			existingBlueprint = true
			return {
				status: 'ready',
				cutToken: candidate.cutToken,
				clipboard: 'ready',
				blueprint: candidate.blueprint
			}
		},
		completeCut(token, outcome, reason) {
			order.push('complete-' + outcome.status)
			completeCalls.push({ token, outcome: clone(outcome), reason })
			return true
		}
	}
	const sandbox = {
		console: {
			info() {},
			warn() {},
			error() {}
		},
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	const filename = path.join(MOD_ROOT, CUT_SOURCE)
	vm.runInContext(source(CUT_SOURCE), sandbox, { filename })
	assert.equal(definitions.length, 1)
	const api = {
		on(name, listener) {
			if (!handlers.has(name)) handlers.set(name, [])
			handlers.get(name).push(listener)
		}
	}
	definitions[0].init(api)
	sandbox[RUNTIME_KEY] = runtime
	sandbox[DELETE_KEY] = deletion
	sandbox[BLUEPRINT_KEY] = blueprint
	for (const listener of handlers.get('afterGameInit') || []) listener({}, game)
	const cut = sandbox[CUT_KEY]
	assert.ok(cut)
	return {
		sandbox,
		game,
		cut,
		order,
		completeCalls,
		deleteCalls,
		planCalls,
		publishCalls,
		setPlan(next) {
			planValue = next
		},
		setDeletionResult(next) {
			deletionResult = next
		},
		setPublishResult(next) {
			publishResult = next
		},
		setDeletionBlocked(next) {
			deletionBlocked = !!next
		},
		runCleanups() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

async function testPlanningUsesOneDeletionPlan() {
	const env = createEnvironment()
	const result = await env.cut.plan()
	assert.equal(result.schema, 1)
	assert.equal(result.replacesBlueprint, true)
	assert.equal(result.summary.safeCount, 1)
	assert.equal(result.summary.protectedCount, 2)
	assert.equal(result.summary.crossBoundaryCount, 1)
	assert.equal(result.summary.ordinaryCubeCount, 1)
	assert.equal(result.summary.paintedCubeCount, 1)
	assert.equal(result.summary.cubeCount, 2)
	assert.deepEqual(clone(result.summary.resourceDelta), [3, -2])
	assert.equal(result.candidate.cutToken, result.deletionPlan.signature)
	assert.deepEqual(env.order, ['plan-deletion', 'prepare-blueprint'])
	assert.deepEqual(env.planCalls, [{
		removeCubes: false,
		removePaintedCubes: false,
		removeSurges: false
	}])
	assert.equal(env.cut.snapshot().phase, 'planned')
	assert.equal(env.cut.snapshot().lastPlan.signature, result.deletionPlan.signature)

	const empty = createEnvironment({ plan: deletionPlan(0), existingBlueprint: false })
	const emptyPlan = await empty.cut.plan()
	assert.equal(emptyPlan.summary.safeCount, 0)
	assert.ok(emptyPlan.candidate)
	assert.equal(emptyPlan.replacesBlueprint, false)
	assert.deepEqual(empty.order, ['plan-deletion', 'prepare-blueprint'])
	const emptyResult = await empty.cut.execute(emptyPlan, 'keyboard')
	assert.equal(emptyResult.executed, true)
	assert.equal(emptyResult.copied, true)
	assert.equal(emptyResult.deleted, false)
	assert.equal(emptyResult.reason, 'success-retained-layers')
	assert.equal(empty.deleteCalls.length, 0)
}

async function testSharedCubeToggleMapsToOrdinaryAndPainted() {
	const creativePlan = deletionPlan()
	creativePlan.summary.creative = true
	const enabled = createEnvironment({ plan: creativePlan })
	const enabledPlan = await enabled.cut.plan({ removeCubes: true, removeSurges: true })
	assert.deepEqual(enabled.planCalls, [{
		removeCubes: true,
		removePaintedCubes: true,
		removeSurges: true
	}])
	assert.equal(enabledPlan.options.removeCubes, true)
	assert.equal(enabledPlan.options.removeSurges, true)

	const disabled = createEnvironment()
	const disabledPlan = await disabled.cut.plan({ removeCubes: false, removeSurges: false })
	assert.deepEqual(disabled.planCalls, [{
		removeCubes: false,
		removePaintedCubes: false,
		removeSurges: false
	}])
	assert.equal(disabledPlan.options.removeCubes, false)
	assert.equal(disabledPlan.options.removeSurges, false)
}

async function testExecuteReplansWhenSurgeRemovalIsEnabled() {
	const initialDeletionPlan = deletionPlan()
	initialDeletionPlan.summary.creative = true
	const env = createEnvironment({ plan: initialDeletionPlan })
	const initialCutPlan = await env.cut.plan()
	assert.equal(initialCutPlan.options.removeSurges, false)

	const replannedDeletion = clone(initialDeletionPlan)
	replannedDeletion.signature = 'deletion-signature-with-surge'
	replannedDeletion.summary.safeCount = 2
	replannedDeletion.summary.surgeCount = 1
	replannedDeletion.removals.push({ name: 'surge', layer: 'surge', position: [1, 0] })
	env.setPlan(replannedDeletion)
	const result = await env.cut.execute(initialCutPlan, 'mouse', {
		removeCubes: false,
		removeSurges: true
	})

	assert.equal(result.executed, true, JSON.stringify(result))
	assert.equal(result.deleted, true)
	assert.deepEqual(env.planCalls, [
		{ removeCubes: false, removePaintedCubes: false, removeSurges: false },
		{ removeCubes: false, removePaintedCubes: false, removeSurges: true }
	])
	assert.equal(env.deleteCalls.length, 1)
	assert.equal(env.deleteCalls[0].plan, replannedDeletion)
	assert.equal(env.deleteCalls[0].options.origin, 'cut')
}

async function testClipboardBeforeSingleDeletionTransaction() {
	const env = createEnvironment()
	const plan = await env.cut.plan()
	const result = await env.cut.execute(plan, 'keyboard')
	assert.equal(result.executed, true)
	assert.equal(result.copied, true)
	assert.equal(result.deleted, true)
	assert.equal(result.transaction.kind, 'selection-delete')
	assert.equal(result.retainedCubeCount, 2)
	assert.deepEqual(env.order, [
		'plan-deletion',
		'prepare-blueprint',
		'plan-deletion',
		'prepare-blueprint',
		'publish-clipboard',
		'delete-world',
		'complete-success'
	])
	assert.equal(env.deleteCalls.length, 1)
	assert.strictEqual(env.deleteCalls[0].plan, plan.deletionPlan)
	assert.equal(env.deleteCalls[0].input, 'keyboard')
	assert.deepEqual(clone(env.deleteCalls[0].options), { origin: 'cut' })
	assert.equal(env.completeCalls.length, 1)
	assert.equal(env.completeCalls[0].outcome.status, 'success')
	assert.equal(env.cut.snapshot().phase, 'success')
}

async function testExecuteAlwaysReplansAtFinalConfirmation() {
	const env = createEnvironment()
	const initial = await env.cut.plan()
	const latest = deletionPlan(2)
	latest.signature = 'deletion-signature-final-confirmation'
	latest.summary.protectedCount = 1
	latest.summary.attachedCubeCount = 1
	latest.removals.push({
		name: 'cube',
		layer: 'attached-cube',
		position: [1, 0]
	})
	env.setPlan(latest)
	const result = await env.cut.execute(initial, 'mouse')
	assert.equal(result.executed, true, JSON.stringify(result))
	assert.deepEqual(env.planCalls, [
		{ removeCubes: false, removePaintedCubes: false, removeSurges: false },
		{ removeCubes: false, removePaintedCubes: false, removeSurges: false }
	])
	assert.strictEqual(env.deleteCalls[0].plan, latest)
	assert.equal(env.publishCalls[0].cutToken, latest.signature)
	assert.equal(env.cut.snapshot().lastPlan.signature, latest.signature)
}

async function testClipboardFailureIsZeroWorldWrite() {
	const env = createEnvironment({
		publishResult: {
			status: 'clipboard-failed',
			error: { code: 'CLIPBOARD_FAILED', message: 'denied' }
		}
	})
	const plan = await env.cut.plan()
	const result = await env.cut.execute(plan, 'mouse')
	assert.equal(result.executed, false)
	assert.equal(result.copied, false)
	assert.equal(result.deleted, false)
	assert.equal(result.error.code, 'CLIPBOARD_FAILED')
	assert.equal(env.deleteCalls.length, 0)
	assert.equal(env.completeCalls.length, 0)
	assert.deepEqual(env.order, [
		'plan-deletion',
		'prepare-blueprint',
		'plan-deletion',
		'prepare-blueprint',
		'publish-clipboard'
	])

	const disposedAfterCopy = createEnvironment({
		publishResult: {
			status: 'cancelled',
			clipboard: 'ready',
			error: { code: 'SESSION_DISPOSED', message: 'session ended' }
		}
	})
	const disposedPlan = await disposedAfterCopy.cut.plan()
	const disposedResult = await disposedAfterCopy.cut.execute(disposedPlan, 'mouse')
	assert.equal(disposedResult.executed, false)
	assert.equal(disposedResult.copied, true)
	assert.equal(disposedResult.deleted, false)
	assert.equal(disposedResult.reason, 'copied-only')
	assert.equal(disposedResult.error.code, 'SESSION_DISPOSED')
	assert.equal(disposedAfterCopy.deleteCalls.length, 0)
	assert.equal(disposedAfterCopy.completeCalls.length, 0)
}

async function testTargetChangeAndRollbackFailureKeepCopy() {
	const changed = createEnvironment({
		deletionResult: {
			accepted: true,
			executed: false,
			reason: 'target-changed',
			transaction: null,
			snapshotId: null,
			error: { code: 'TARGET_CHANGED', message: 'changed' }
		}
	})
	const changedPlan = await changed.cut.plan()
	const changedResult = await changed.cut.execute(changedPlan, 'mouse')
	assert.equal(changedResult.executed, false)
	assert.equal(changedResult.copied, true)
	assert.equal(changedResult.deleted, false)
	assert.equal(changedResult.reason, 'copied-only')
	assert.equal(changedResult.error.code, 'TARGET_CHANGED')
	assert.equal(changed.completeCalls[0].outcome.status, 'copied-only')

	const rollback = createEnvironment({
		deletionResult: {
			accepted: true,
			executed: false,
			reason: 'rolled-back',
			transaction: null,
			snapshotId: 'snapshot-2',
			error: { code: 'ROLLBACK_FAILED', message: 'reload' }
		}
	})
	const rollbackPlan = await rollback.cut.plan()
	const rollbackResult = await rollback.cut.execute(rollbackPlan, 'mouse')
	assert.equal(rollbackResult.copied, true)
	assert.equal(rollbackResult.reason, 'failed')
	assert.equal(rollback.cut.snapshot().phase, 'blocked')
	assert.equal(rollback.completeCalls[0].outcome.status, 'failed')
}

async function testBusyAndLifecycle() {
	const env = createEnvironment()
	assert.equal(env.cut.setDialogOpen(true, 'test-dialog'), true)
	assert.equal(env.cut.isInputBlocked(), true)
	await assert.rejects(env.cut.plan(), error => error.code === 'BUSY')
	assert.equal(env.cut.setDialogOpen(false, 'test-dialog-closed'), true)
	env.setDeletionBlocked(true)
	await assert.rejects(env.cut.plan(), error => error.code === 'BUSY')
	env.setDeletionBlocked(false)
	const plan = await env.cut.plan()
	assert.equal(env.cut.isInputBlocked(), false)
	env.runCleanups()
	assert.equal(env.cut.snapshot().disposed, true)
	assert.equal(env.sandbox[CUT_KEY], undefined)
	const result = await env.cut.execute(plan, 'keyboard')
	assert.equal(result.error.code, 'NOT_READY')
}

function testPlanningStatusLifecycleContract() {
	const ui = source(CUT_UI_SOURCE)
	assert.match(ui, /clearStatus\(true\)\s*openConfirmation\(plan, input\)/)
	assert.match(ui, /onClose\(reason, handle\)\s*\{\s*clearStatus\(true\)\s*cut\.setDialogOpen\(false/)
}

function testI18nManifestUiAndBoundaries() {
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
	vm.runInContext(source(I18N_SOURCE), sandbox, { filename })
	definitions[0].init()
	const i18n = sandbox[I18N_KEY]
	const keys = [
		'cutSelectionContents',
		'toolbarCardCut',
		'cutConfirmTitle',
		'cutConfirmMessage',
		'cutReplaceWarning',
		'cutConfirmAction',
		'cutPlanning',
		'cutCopying',
		'cutDeleting',
		'cutSuccess',
		'cutNothing',
		'cutTargetChanged',
		'cutTargetChangedCopied',
		'cutClipboardFailed',
		'cutCopiedOnly',
		'cutBusy',
		'cutFailed',
		'cutReloadRequired',
		'cutPreviewRefreshFailed',
		'blueprintCutPending',
		'blueprintCutSuccess',
		'blueprintCutCopiedOnly',
		'blueprintCutFailed',
		'cutLayerMessage',
		'cutCubeOption',
		'cutSurgeOption',
		'cutCubeSourceRemove',
		'cutCubeSourceRetain',
		'cutSuccessRetainedCubes',
		'attachedCubeRemovalNotice'
	]
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 268)
	for (const language of i18n.languages) {
		for (const key of keys) {
			const value = i18n.t(language, key)
			assert.notEqual(value, key, language + '.' + key)
			assert.ok(value.trim(), language + '.' + key)
		}
	}

	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.entry.length, 47)
	for (const entry of [CUT_SOURCE, CUT_UI_SOURCE]) assert.ok(manifest.entry.includes(entry))
	const blueprintIndex = manifest.entry.indexOf(BLUEPRINT_SOURCE)
	const cutIndex = manifest.entry.indexOf(CUT_SOURCE)
	const cutUiIndex = manifest.entry.indexOf(CUT_UI_SOURCE)
	const previewIndex = manifest.entry.indexOf('scripts/blueprint-preview.js')
	assert.ok(blueprintIndex < cutIndex && cutIndex < cutUiIndex && cutUiIndex < previewIndex)

	const core = source(CUT_SOURCE)
	const ui = source(CUT_UI_SOURCE)
	const blueprint = source(BLUEPRINT_SOURCE)
	const deletion = source(DELETE_SOURCE)
	const placement = source(PLACEMENT_SOURCE)
	const shared = source(SHARED_SOURCE)
	const readme = source('README.md')
	assert.match(core, /deletion\.planSelections\(deletionOptionsForCut\(requestedOptions\)\)/)
	assert.match(core, /removePaintedCubes:\s*options\.removeCubes/)
	assert.match(core, /blueprint\.prepareCut\(deletionPlan\)/)
	assert.match(core, /blueprint\.publishCut\(planRequest\.candidate/)
	assert.match(core, /\{\s*origin:\s*'cut'\s*\}/)
	assert.match(core, /completeCut/)
	assert.doesNotMatch(core, /registerAdapter/)
	assert.doesNotMatch(core, /\bclearCell\s*\(|\baddEntity\s*\(|\brequestResources\s*\(/)
	assert.match(blueprint, /function buildCutCandidate/)
	assert.match(blueprint, /function prepareCut/)
	assert.match(blueprint, /async function publishCut/)
	assert.match(blueprint, /function completeCut/)
	assert.match(deletion, /normalizeOrigin/)
	assert.match(deletion, /origin === 'cut'/)
	assert.match(deletion, /dynamicCubeSignature/)
	assert.match(deletion, /apply\.dynamic-cube-skipped/)
	assert.match(placement, /const includeBlocks = blueprint\.mode === 'full' && request\?\.includeBlocks === true/)
	assert.match(placement, /if \(details\?\.blueprintMode !== 'full'\) return assessment\(false, 'protected-cube'\)/)
	assert.match(shared, /cattail\.world-editor\.selection-cut/)
	assert.match(ui, /event\?\.code === 'KeyX'/)
	assert.match(ui, /event\?\.ctrlKey \|\| event\?\.metaKey/)
	assert.match(ui, /shared\.isEditableEvent\(event\)/)
	assert.match(ui, /primary:\s*true,\s*danger:\s*true/)
	assert.match(ui, /cutReplaceWarning/)
	assert.match(ui, /cut\.setDialogOpen\(true/)
	assert.match(ui, /cut\.setDialogOpen\(false/)
	assert.match(ui, /cutTargetChangedCopied/)
	assert.match(ui, /cutCubeSourceRemove/)
	assert.match(ui, /cutCubeSourceRetain/)
	assert.match(ui, /cutSuccessRetainedCubes/)
	assert.match(ui, /attachedCubeRemovalNotice/)
	assert.doesNotMatch(ui, /sync[- ]?empty/i)
	assert.match(readme, /4C-1b/)
	assert.match(readme, /Ctrl\+X/)
	assert.match(readme, /只复制|copied only/i)
}

async function run() {
	await testPlanningUsesOneDeletionPlan()
	await testSharedCubeToggleMapsToOrdinaryAndPainted()
	await testExecuteReplansWhenSurgeRemovalIsEnabled()
	await testClipboardBeforeSingleDeletionTransaction()
	await testExecuteAlwaysReplansAtFinalConfirmation()
	await testClipboardFailureIsZeroWorldWrite()
	await testTargetChangeAndRollbackFailureKeepCopy()
	await testBusyAndLifecycle()
	testPlanningStatusLifecycleContract()
	testI18nManifestUiAndBoundaries()
	console.log('World Editor 4C-1b verification passed: exact cut planning, execution-time Surge replanning, clipboard-first safety, single deletion transaction, copied-only failures, lifecycle, Ctrl+X UI, 20 languages, manifest, and scope boundaries.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
