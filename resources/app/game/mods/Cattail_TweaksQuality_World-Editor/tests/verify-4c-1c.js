const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const {
	MOD_ROOT,
	source,
	createGame,
	blueprint,
	loadRuntime
} = require('./verify-4b-1a.js')

const TRANSFORM_SOURCE = 'scripts/core/blueprint-transform.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const PREVIEW_SOURCE = 'scripts/blueprint-preview.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const PLACEMENT_SOURCE = 'scripts/core/blueprint-placement.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')

function schema4(records, emptyCells) {
	const base = records.length
		? blueprint(records)
		: {
			schemaVersion: 4,
			mode: 'structure',
			sourcePlane: 0,
			anchor: {
				position: [0, 0],
				selectionIds: [1]
			},
			selections: [{
				id: 1,
				primary: true,
				start: [0, 0],
				end: [0, 0],
				min: [0, 0],
				max: [0, 0],
				width: 1,
				height: 1
			}],
			contentBounds: null,
			includeBlocks: false,
			entities: [],
			blocks: [],
			production: null,
			summary: {
				selectionCount: 1,
				selectedCellCount: emptyCells.length,
				entityCount: 0,
				blockCount: 0,
				crossBoundaryCount: 0,
				skippedCount: 0,
				capturedTypes: [],
				skippedTypes: []
			}
		}
	base.schemaVersion = 4
	base.emptyCells = emptyCells.map(position => position.slice())
	if (!Array.isArray(base.selections)) {
		base.selections = [{
			id: 1,
			primary: true,
			start: [0, 0],
			end: [0, 0],
			min: [0, 0],
			max: [0, 0],
			width: 1,
			height: 1
		}]
	}
	return base
}

async function buildPlacementPlan(runtime, value, target = [0, 0]) {
	return runtime.planner.build(runtime.game, value, target, {
		includeDynamicConflicts: true,
		canReplaceEntity(entity) {
			return runtime.placement.assessEntity(entity)
		}
	})
}

async function testDeleteOnlySyncUndoRedo() {
	const game = createGame()
	game.seed('silo', [2, 0], { par: { marker: 'sync-me' } })
	const runtime = loadRuntime({ game })
	const value = schema4([], [[2, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	assert.equal(plan.version, '0.5.1')
	assert.deepEqual(Array.from(plan.emptyCells[0]), [2, 0])
	assert.equal(plan.emptyEntities.length, 1)

	const analysis = runtime.placement.analyze(plan)
	assert.equal(analysis.hasConflicts, false)
	assert.equal(analysis.hasEmptyMask, true)
	assert.equal(analysis.hasEmptyTargets, true)
	assert.equal(analysis.variants['00'].summary.changeCount, 0)
	assert.equal(analysis.variants['01'].summary.buildCount, 0)
	assert.equal(analysis.variants['01'].summary.syncDeleteCount, 1)
	assert.equal(analysis.variants['01'].summary.deleteCount, 1)

	const placed = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: analysis.variants['01'].signature,
		input: 'mouse'
	})
	assert.equal(placed.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(game.entityAtCoordinates([2, 0]), null)
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 1 })
	const diagnosticEvents = runtime.placement.diagnostics().events.map(entry => entry.event)
	for (const event of [
		'analyze.complete',
		'adapter.prepare.rebuilt',
		'adapter.preflight.ready',
		'adapter.capture',
		'adapter.apply.start',
		'apply.clear.before',
		'apply.clear.after',
		'adapter.verify.ready',
		'operation.result'
	]) {
		assert.ok(diagnosticEvents.includes(event), `missing placement probe event: ${event}`)
	}

	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(game.entityAtCoordinates([2, 0]).name, 'silo')
	assert.equal(game.entityAtCoordinates([2, 0]).marker, 'sync-me')
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 0 })

	const redone = await runtime.placement.redo('keyboard')
	assert.equal(redone.executed, true)
	assert.equal(game.entityAtCoordinates([2, 0]), null)
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 1 })
	runtime.dispose()
}

async function testEmptyMaskWithoutCoveredTargetSkipsOptions() {
	const runtime = loadRuntime()
	const value = schema4([{ name: 'silo', position: [0, 0] }], [[2, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const analysis = runtime.placement.analyze(plan)
	assert.equal(analysis.hasConflicts, false)
	assert.equal(analysis.hasEmptyMask, true)
	assert.equal(analysis.hasEmptyTargets, false)
	assert.equal(analysis.variants['00'].summary.buildCount, 1)
	assert.equal(analysis.variants['01'].summary.syncDeleteCount, 0)
	runtime.dispose()
}

async function testSnapshotGapResourceDriftUsesLatestAffordableBalance() {
	const game = createGame()
	game.seed('silo', [0, 0], { par: { marker: 'snapshot-gap' } })
	const runtime = loadRuntime({ game })
	const value = schema4([], [[0, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const proposal = runtime.placement.analyze(plan).variants['01']
	const resourcesAtConfirmation = game.resources.slice()
	const snapshotGain = 7
	runtime.snapshotStore.onCreate = function () {
		game.resources[0] += snapshotGain
	}

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: proposal.signature,
		input: 'mouse'
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(game.entityAtCoordinates([0, 0]), null)
	assert.deepEqual(
		game.resources,
		resourcesAtConfirmation.map(function (entry, index) {
			return entry + (index === 0 ? snapshotGain : 0) + Number(proposal.summary.resourceDelta[index] || 0)
		})
	)
	const diagnosticEvents = runtime.placement.diagnostics().events.map(entry => entry.event)
	assert.equal(
		diagnosticEvents.filter(event => event === 'adapter.preflight.ready').length,
		2
	)
	assert.ok(diagnosticEvents.includes('adapter.preflight.resources-rebased'))
	assert.ok(diagnosticEvents.includes('apply.clear.after'))
	runtime.dispose()
}

async function testPrepareGapResourceDriftUsesLatestAffordableBalance() {
	const game = createGame()
	game.seed('silo', [0, 0], { par: { marker: 'prepare-gap' } })
	const runtime = loadRuntime({ game })
	const value = schema4([], [[0, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const proposal = runtime.placement.analyze(plan).variants['01']
	const resourcesAtConfirmation = game.resources.slice()
	const prepareGapGain = 5
	const assembleSave = game.assembleSave
	let assembleCount = 0
	game.assembleSave = function () {
		assembleCount += 1
		if (assembleCount === 1) this.resources[0] += prepareGapGain
		return assembleSave.apply(this, arguments)
	}

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: proposal.signature,
		input: 'mouse'
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(game.entityAtCoordinates([0, 0]), null)
	assert.deepEqual(
		game.resources,
		resourcesAtConfirmation.map(function (entry, index) {
			return entry + (index === 0 ? prepareGapGain : 0) + Number(proposal.summary.resourceDelta[index] || 0)
		})
	)
	const resourceRebases = runtime.placement.diagnostics().events.filter(function (entry) {
		return entry.event === 'adapter.preflight.resources-rebased'
	})
	assert.deepEqual(
		Array.from(resourceRebases, function (entry) { return entry.details.stage }),
		['pre-snapshot', 'post-snapshot']
	)
	runtime.dispose()
}

async function testUnaffordablePrepareGapIsZeroWrite() {
	const game = createGame()
	const runtime = loadRuntime({ game })
	const value = schema4([{ name: 'silo', position: [0, 0] }], [])
	const plan = await buildPlacementPlan(runtime, value)
	const proposal = runtime.placement.analyze(plan).variants['00']
	const assembleSave = game.assembleSave
	let assembleCount = 0
	game.assembleSave = function () {
		assembleCount += 1
		if (assembleCount === 1) this.resources.splice(0, this.resources.length, 0, 0)
		return assembleSave.apply(this, arguments)
	}

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		confirmedSignature: proposal.signature,
		input: 'mouse'
	})
	assert.equal(result.executed, false)
	assert.equal(result.error.code, 'INSUFFICIENT_RESOURCES')
	assert.equal(runtime.snapshotStore.created.length, 0)
	assert.equal(game.entityAtCoordinates([0, 0]), null)
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 0 })
	assert.equal(runtime.placement.snapshot().canUndo, false)
	const denied = runtime.placement.diagnostics().events.find(function (entry) {
		return entry.event === 'adapter.preflight.denied'
	})
	assert.equal(denied.details.stage, 'affordability')
	runtime.dispose()
}

async function testConflictAndSyncDeduplicateInOneTransaction() {
	const game = createGame()
	game.codex.entities.silo.entitySpan = 1
	game.seed('silo', [1, 0], { par: { marker: 'dedupe-me' } })
	const runtime = loadRuntime({ game })
	const value = schema4([{ name: 'pinhole', position: [0, 0] }], [[2, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	assert.equal(plan.records[0].status, 'conflict')

	const proposal = runtime.placement.analyze(plan).variants['11']
	const variants = runtime.placement.analyze(plan).variants
	assert.deepEqual(Object.keys(variants).sort(), ['00', '01', '10', '11'])
	assert.deepEqual(
		Object.keys(variants).sort().map(key => [
			key,
			variants[key].options.replaceConflicts,
			variants[key].options.syncEmpty
		]),
		[
			['00', false, false],
			['01', false, true],
			['10', true, false],
			['11', true, true]
		]
	)
	assert.equal(proposal.summary.buildCount, 1)
	assert.equal(proposal.summary.replaceCount, 1)
	assert.equal(proposal.summary.syncDeleteCount, 1)
	assert.equal(proposal.summary.deleteCount, 1)
	assert.equal(proposal.removals.length, 1)
	assert.equal(proposal.removals[0].sourceConflict, true)
	assert.equal(proposal.removals[0].sourceSync, true)
	assert.equal(proposal.removals[0].crossBoundary, true)

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		replaceConflicts: true,
		syncEmpty: true,
		confirmedSignature: proposal.signature
	})
	assert.equal(result.executed, true)
	assert.equal(runtime.snapshotStore.created.length, 1)
	assert.equal(game.entityAtCoordinates([0, 0]).name, 'pinhole')
	assert.deepEqual(game.stats, { machinesBuild: 1, machinesSold: 1 })

	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(game.entityAtCoordinates([1, 0]).name, 'silo')
	assert.equal(game.entityAtCoordinates([1, 0]).marker, 'dedupe-me')
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 0 })
	runtime.dispose()
}

async function testCreativeSyncHasNoEconomy() {
	const game = createGame({ resources: [7, 3] })
	game.seed('silo', [0, 0])
	const runtime = loadRuntime({ game, creative: true })
	const value = schema4([], [[0, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const proposal = runtime.placement.analyze(plan).variants['01']
	assert.equal(proposal.summary.creative, true)
	assert.deepEqual(Array.from(proposal.summary.resourceDelta), [])
	const resourcesBefore = game.resources.slice()
	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: proposal.signature
	})
	assert.equal(result.executed, true)
	assert.deepEqual(game.resources, resourcesBefore)
	assert.deepEqual(game.stats, { machinesBuild: 0, machinesSold: 1 })
	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.deepEqual(game.resources, resourcesBefore)
	assert.equal(game.entityAtCoordinates([0, 0]).name, 'silo')
	runtime.dispose()
}

async function testProtectedTargetsAreZeroWriteAndSafeDriftRebases() {
	const protectedGame = createGame()
	protectedGame.seed('cube', [0, 0])
	const protectedRuntime = loadRuntime({ game: protectedGame })
	const protectedBlueprint = schema4([], [[0, 0]])
	const protectedPlan = await buildPlacementPlan(protectedRuntime, protectedBlueprint)
	const protectedProposal = protectedRuntime.placement.analyze(protectedPlan).variants['01']
	assert.equal(protectedProposal.summary.syncDeleteCount, 0)
	assert.equal(protectedProposal.summary.protectedCount, 1)
	assert.equal(protectedProposal.summary.changeCount, 0)
	const protectedResult = await protectedRuntime.placement.place({
		blueprint: protectedBlueprint,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: protectedProposal.signature
	})
	assert.equal(protectedResult.executed, false)
	assert.equal(protectedResult.error.code, 'NOTHING_TO_CHANGE')
	assert.equal(protectedRuntime.snapshotStore.created.length, 0)
	assert.equal(protectedGame.entityAtCoordinates([0, 0]).name, 'cube')
	protectedRuntime.dispose()

	for (const kind of ['entity', 'resources']) {
		const game = createGame()
		const target = game.seed('silo', [0, 0], { par: { marker: 'before' } })
		const runtime = loadRuntime({ game })
		const value = schema4([], [[0, 0]])
		const plan = await buildPlacementPlan(runtime, value)
		const proposal = runtime.placement.analyze(plan).variants['01']
		if (kind === 'entity') target.par.marker = 'after'
		else game.resources[0] += 1
		const result = await runtime.placement.place({
			blueprint: value,
			target: [0, 0],
			syncEmpty: true,
			confirmedSignature: proposal.signature
		})
		assert.equal(result.executed, true)
		assert.equal(runtime.snapshotStore.created.length, 1)
		assert.equal(game.entityAtCoordinates([0, 0]), null)
		const undone = await runtime.placement.undo('keyboard')
		assert.equal(undone.executed, true)
		assert.equal(
			game.entityAtCoordinates([0, 0]).marker,
			kind === 'entity' ? 'after' : 'before'
		)
		runtime.dispose()
	}

	const volatileGame = createGame()
	const volatileTarget = volatileGame.seed('silo', [0, 0], {
		par: { marker: 'stable', soul: 1 }
	})
	const volatileRuntime = loadRuntime({ game: volatileGame })
	const volatileBlueprint = schema4([], [[0, 0]])
	const volatilePlan = await buildPlacementPlan(volatileRuntime, volatileBlueprint)
	const volatileProposal = volatileRuntime.placement.analyze(volatilePlan).variants['01']
	volatileTarget.par.soul = 2
	const volatileResult = await volatileRuntime.placement.place({
		blueprint: volatileBlueprint,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: volatileProposal.signature
	})
	assert.equal(volatileResult.executed, true)
	assert.equal(volatileGame.entityAtCoordinates([0, 0]), null)
	volatileRuntime.dispose()
}

async function testResourceAndRemovalStateDriftUseStableConfirmation() {
	const game = createGame({ resources: [1e12, 1e12] })
	const target = game.seed('silo', [0, 0], { par: { marker: 'before-refresh' } })
	const runtime = loadRuntime({ game })
	const value = schema4([], [[0, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const displayedProposal = runtime.placement.analyze(plan).variants['01']
	game.resources[0] += 123
	const refreshedProposal = runtime.placement.analyze(plan).variants['01']
	assert.equal(refreshedProposal.signature, displayedProposal.signature)
	assert.deepEqual(refreshedProposal.summary.resourceDelta, displayedProposal.summary.resourceDelta)
	target.par.marker = 'after-refresh'
	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: displayedProposal.signature
	})
	assert.equal(result.executed, true)
	assert.equal(game.entityAtCoordinates([0, 0]), null)
	assert.ok(runtime.placement.diagnostics().events.some(function (entry) {
		return entry.event === 'adapter.prepare.state-rebased'
	}))
	const undone = await runtime.placement.undo('keyboard')
	assert.equal(undone.executed, true)
	assert.equal(game.entityAtCoordinates([0, 0]).marker, 'after-refresh')
	runtime.dispose()
}

async function testExtractorInvariantKeepsOneTarget() {
	const game = createGame()
	game.seed('pump', [0, 0])
	game.seed('pump2', [2, 0])
	const runtime = loadRuntime({ game })
	const value = schema4([], [[0, 0], [2, 0]])
	const plan = await buildPlacementPlan(runtime, value)
	const proposal = runtime.placement.analyze(plan).variants['01']
	assert.equal(proposal.summary.syncDeleteCount, 1)
	assert.equal(proposal.summary.protectedCount, 1)
	assert.equal(proposal.summary.deleteCount, 1)
	assert.equal(proposal.protectedTargets[0].reason, 'last-extractor')

	const result = await runtime.placement.place({
		blueprint: value,
		target: [0, 0],
		syncEmpty: true,
		confirmedSignature: proposal.signature
	})
	assert.equal(result.executed, true)
	assert.equal(game.stuff.filter(entity => ['pump', 'pump2', 'gradient'].includes(entity.name)).length, 1)
	assert.ok(game.entityAtCoordinates(proposal.protectedTargets[0].position))
	runtime.dispose()
}

async function testLegacySchemaHasNoEmptySync() {
	const runtime = loadRuntime()
	const value = blueprint([{ name: 'silo', position: [0, 0] }])
	const plan = await buildPlacementPlan(runtime, value)
	assert.equal(value.schemaVersion, 3)
	assert.deepEqual(Array.from(plan.emptyCells), [])
	assert.deepEqual(Array.from(plan.emptyEntities), [])
	assert.equal(runtime.placement.analyze(plan).hasEmptyMask, false)
	assert.equal(runtime.placement.analyze(plan).hasEmptyTargets, false)
	runtime.dispose()
}

function loadTransformController() {
	const definitions = []
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		Symbol,
		Object,
		Array,
		Set,
		Map,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Error,
		TypeError,
		performance: { now: () => 0 },
		ModLoader: {
			register(value) {
				definitions.push(value)
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(TRANSFORM_SOURCE), sandbox, { filename: TRANSFORM_SOURCE })
	assert.equal(definitions.length, 1)
	definitions[0].init()
	return sandbox[TRANSFORM_KEY]
}

function testD4EmptyMaskTransformAndExactRestore() {
	const controller = loadTransformController()
	const value = schema4([{ name: 'silo', position: [0, 0] }], [
		[-1, 0],
		[0, 1],
		[1, -1]
	])
	value.selections = [{
		id: 1,
		primary: true,
		start: [-1, -1],
		end: [1, 1],
		min: [-1, -1],
		max: [1, 1],
		width: 3,
		height: 3
	}]
	controller.bind(value, '4c-1c-test')
	controller.rotateClockwise('4c-1c-test')
	assert.deepEqual(
		JSON.parse(JSON.stringify(controller.snapshot().blueprint.emptyCells)),
		[[0, -1], [-1, 0], [1, 1]]
	)
	controller.rotateClockwise('4c-1c-test')
	controller.rotateClockwise('4c-1c-test')
	controller.rotateClockwise('4c-1c-test')
	assert.deepEqual(
		JSON.parse(JSON.stringify(controller.snapshot().blueprint.emptyCells)),
		value.emptyCells
	)
	controller.mirrorU('4c-1c-test')
	assert.deepEqual(
		JSON.parse(JSON.stringify(controller.snapshot().blueprint.emptyCells)),
		[[0, -1], [-1, 0], [1, 1]]
	)
}

function testUiLocalizationDocumentationAndManifestContracts() {
	const sessionSource = source(SESSION_SOURCE)
	const previewSource = source(PREVIEW_SOURCE)
	const planSource = source(PLAN_SOURCE)
	const placementSource = source(PLACEMENT_SOURCE)
	const i18nSource = source(I18N_SOURCE)
	const readme = fs.readFileSync(path.join(MOD_ROOT, 'README.md'), 'utf8')
	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))

	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.entry.length, 47)
	assert.match(sessionSource, /const schemaVersion = stabilizerLinkCount \? 8 : paintedRecords\.length \? 7 : 6/)
	assert.match(sessionSource, /emptyCells/)
	assert.match(sessionSource, /confirmPlacementOptions/)
	assert.match(sessionSource, /let replaceConflicts = false/)
	assert.match(sessionSource, /let syncEmpty = false/)
	assert.match(sessionSource, /setSyncEmpty\(next, reason\)/)
	assert.match(sessionSource, /currentSession\.syncEmpty === true/)
	assert.match(sessionSource, /syncEmptyPlacementOverlay/)
	assert.doesNotMatch(sessionSource, /options\.sync-toggled/)
	assert.match(sessionSource, /aria-pressed/)
	assert.match(sessionSource, /--world-editor-hell-gem-1, #A6F246/i)
	assert.match(sessionSource, /--world-editor-hell-gem-2, #E3FD43/i)
	assert.match(sessionSource, /--world-editor-blueprint-option-green-highlight/)
	assert.match(sessionSource, /var\(--world-editor-hell-gem-glass\)/)
	assert.match(sessionSource, /cattail-world-editor-blueprint-placement-option--active/)
	assert.match(sessionSource, /placementOptionsSummary/)
	assert.match(sessionSource, /confirmedSignature/)
	assert.match(sessionSource, /if \(analysis\.hasConflicts\)/)
	assert.doesNotMatch(sessionSource, /analysis\.hasConflicts\s*\|\|\s*analysis\.hasEmptyMask/)
	assert.match(sessionSource, /markPlacementProbe\('options\.skipped'/)
	assert.match(sessionSource, /confirmPlacementOptions\(analysis,\s*controller,\s*plan,\s*syncEmpty\)/)
	assert.match(sessionSource, /await controller\?\.refreshNow\?\.\('placement-options-confirm'\)/)
	assert.match(sessionSource, /refreshedAnalysis\s*=\s*placement\.analyze\(refreshedPlan\)/)
	assert.match(sessionSource, /placementConfirmationFingerprint/)
	assert.match(sessionSource, /options\.reconfirmation-required/)
	assert.match(previewSource, /setPlacementOverlay/)
	assert.match(previewSource, /drawPlacementEmptyMask/)
	assert.match(previewSource, /drawPlacementTargets/)
	assert.match(planSource, /emptyEntities/)
	assert.match(planSource, /schemaVersion !== 6/)
	assert.match(placementSource, /sourceConflict/)
	assert.match(placementSource, /sourceSync/)
	assert.match(placementSource, /proposalSignature/)
	assert.match(placementSource, /payload:\s*proposal\.payload/)
	assert.match(placementSource, /resourcesBefore/)
	assert.match(placementSource, /diagnostics\(\)/)
	assert.doesNotMatch(placementSource, /\[Cattail World Editor\]\[4C-1c Probe\]/)
	assert.match(placementSource, /apply\.clear\.before/)
	assert.match(placementSource, /apply\.clear\.after/)
	assert.match(placementSource, /signatureDifference:\s*compareSignaturePayloads/)
	assert.match(placementSource, /adapter\.preflight\.resources-rebased/)
	for (const key of [
		'placementOptionsTitle',
		'placementOptionsMessage',
		'placementReplaceOption',
		'placementSyncEmptyOption',
		'placementOptionsSummary',
		'placementConfirmAction'
	]) {
		assert.match(i18nSource, new RegExp('\\b' + key + '\\b'))
	}
	assert.match(readme, /## 4C-1c 结构蓝图同步空地/)
	assert.match(readme, /schema 4/)
	assert.match(readme, /#A6F246/)
	assert.match(readme, /#E3FD43/)
	assert.match(readme, /一份 Snapshot、一条事务和一条 history/)
}

async function run() {
	await testDeleteOnlySyncUndoRedo()
	await testEmptyMaskWithoutCoveredTargetSkipsOptions()
	await testSnapshotGapResourceDriftUsesLatestAffordableBalance()
	await testPrepareGapResourceDriftUsesLatestAffordableBalance()
	await testUnaffordablePrepareGapIsZeroWrite()
	await testConflictAndSyncDeduplicateInOneTransaction()
	await testCreativeSyncHasNoEconomy()
	await testProtectedTargetsAreZeroWriteAndSafeDriftRebases()
	await testResourceAndRemovalStateDriftUseStableConfirmation()
	await testExtractorInvariantKeepsOneTarget()
	await testLegacySchemaHasNoEmptySync()
	testD4EmptyMaskTransformAndExactRestore()
	testUiLocalizationDocumentationAndManifestContracts()
	console.log(
		'World Editor 4C-1c verification passed: schema-4 empty masks, target-aware dialog gating, D4 transforms, four placement choices, delete-only sync, probes, deduplication, protection, target drift, single transactions, undo/redo, UI toggles, localization, and manifest.'
	)
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
