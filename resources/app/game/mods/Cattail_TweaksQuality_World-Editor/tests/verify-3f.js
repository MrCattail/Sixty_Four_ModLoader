const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHARED_SOURCE = 'scripts/core/shared.js'
const PRODUCTION_SOURCE = 'scripts/core/production-state.js'
const ANALYSIS_SOURCE = 'scripts/core/selection-analysis.js'
const TRANSFORM_SOURCE = 'scripts/core/blueprint-transform.js'
const PLAN_SOURCE = 'scripts/core/blueprint-preview-plan.js'
const SESSION_SOURCE = 'scripts/blueprint-session.js'
const CARDS_SOURCE = 'scripts/ui/production-cards.js'
const OPACITY_SOURCE = 'scripts/ui/card-opacity.js'
const SELECTION_CARD_SOURCE = 'scripts/ui/selection-card.js'
const SHELL_SOURCE = 'scripts/ui/editor-shell.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const PRODUCTION_KEY = Symbol.for('cattail.world-editor.production')
const TELEMETRY_KEY = Symbol.for('cattail.dynamic-details.production-telemetry')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function productionSnapshot(options = {}) {
	const theoretical = options.theoretical !== false
	const supplemental = options.supplemental !== false
	return Object.freeze({
		ready: true,
		reason: null,
		schemaVersion: 1,
		sampledAt: 123456,
		canonicalUnit: 'perSecond',
		sampleWindowMs: 30000,
		quality: theoretical ? 'complete' : 'collecting',
		sampleDuration: Object.freeze({
			minMs: theoretical ? 30000 : 12000,
			maxMs: 30000,
			collectingEntities: theoretical ? 0 : 1
		}),
		entities: Object.freeze({
			included: 2,
			unsupported: Object.freeze({
				theoretical: 1,
				actualOutput: 2,
				actualConsume: 3
			})
		}),
		events: Object.freeze({
			dropped: theoretical ? 7 : 0,
			truncated: theoretical
		}),
		totals: Object.freeze({
			theoretical: Object.freeze({
				output: Object.freeze(theoretical ? [2, 0] : [0, 0]),
				consume: Object.freeze(theoretical ? [0, 1] : [0, 0]),
				net: Object.freeze(theoretical ? [2, -1] : [0, 0])
			}),
			actual: Object.freeze({
				output: Object.freeze([1.5, 0]),
				consume: Object.freeze([0, .5]),
				net: Object.freeze([1.5, -.5])
			})
		}),
		byType: Object.freeze([
			Object.freeze({
				name: 'pump',
				count: 2,
				support: Object.freeze({
					theoretical: Object.freeze({
						supported: theoretical,
						partial: false,
						supportedEntities: theoretical ? 2 : 0,
						unsupportedEntities: 0,
						reasons: Object.freeze(theoretical ? [] : ['not-requested'])
					}),
					actualOutput: Object.freeze({
						supported: true,
						partial: true,
						supportedEntities: 1,
						unsupportedEntities: 1,
						reasons: Object.freeze(['partial'])
					}),
					actualConsume: Object.freeze({
						supported: true,
						partial: false,
						supportedEntities: 2,
						unsupportedEntities: 0,
						reasons: Object.freeze([])
					})
				}),
				theoretical: Object.freeze({
					output: Object.freeze(theoretical ? [2, 0] : [0, 0]),
					consume: Object.freeze(theoretical ? [0, 1] : [0, 0]),
					net: Object.freeze(theoretical ? [2, -1] : [0, 0])
				}),
				actual: Object.freeze({
					output: Object.freeze([1.5, 0]),
					consume: Object.freeze([0, .5]),
					net: Object.freeze([1.5, -.5])
				}),
				sampleDuration: Object.freeze({
					minMs: 30000,
					maxMs: 30000,
					collectingEntities: 0
				}),
				supplemental: Object.freeze(supplemental ? [
					Object.freeze({
						id: 'pumpMining',
						basis: 'instantaneous',
						resources: Object.freeze([2, 0])
					})
				] : [])
			})
		])
	})
}

function createTelemetry(calls) {
	return Object.freeze({
		apiVersion: 1,
		snapshotSchemaVersion: 1,
		canonicalUnit: 'perSecond',
		status() {
			return Object.freeze({ ready: true, disposed: false })
		},
		snapshotEntities(entities, options) {
			calls.push({
				entities: Array.from(entities || []),
				options: options ? Object.assign({}, options) : undefined
			})
			return productionSnapshot(options)
		}
	})
}

function createProductionHarness(options = {}) {
	const game = { id: 'game' }
	const selectedEntities = [{ name: 'pump' }, { name: 'pump' }]
	const calls = []
	const cleanups = []
	const timers = new Map()
	let timerSequence = 0
	let runtimeListener = null
	let analysisListener = null
	let runtimeUnsubscribed = 0
	let analysisUnsubscribed = 0
	let runtimeState = { active: options.active !== false }
	let analysisState = options.analysis || {
		phase: 'selected',
		status: 'ready',
		key: '0:1:0:0:1:1'
	}
	let afterGameInit = null
	const runtime = {
		game,
		snapshot() {
			return Object.assign({}, runtimeState)
		},
		subscribe(listener) {
			runtimeListener = listener
			listener(this.snapshot())
			return function () {
				runtimeUnsubscribed += 1
				runtimeListener = null
			}
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		}
	}
	const analysis = {
		game,
		snapshot() {
			return Object.assign({}, analysisState)
		},
		entities() {
			return selectedEntities.slice()
		},
		subscribe(listener) {
			analysisListener = listener
			listener(this.snapshot())
			return function () {
				analysisUnsubscribed += 1
				analysisListener = null
			}
		}
	}
	const sandbox = {
		console,
		Date,
		setTimeout(callback, delay) {
			const id = ++timerSequence
			timers.set(id, { callback, delay })
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		ModLoader: {
			register(definition) {
				definition.init({
					on(name, listener) {
						if (name === 'afterGameInit') afterGameInit = listener
					}
				})
			}
		}
	}
	sandbox.globalThis = sandbox
	sandbox[Symbol.for('cattail.world-editor.runtime')] = runtime
	sandbox[Symbol.for('cattail.world-editor.analysis')] = analysis
	if (options.telemetry !== false) sandbox[TELEMETRY_KEY] = createTelemetry(calls)
	vm.createContext(sandbox)
	vm.runInContext(
		fs.readFileSync(path.join(MOD_ROOT, PRODUCTION_SOURCE), 'utf8'),
		sandbox,
		{ filename: PRODUCTION_SOURCE }
	)
	assert.equal(typeof afterGameInit, 'function')
	afterGameInit(null, game)
	return {
		sandbox,
		game,
		runtime,
		analysis,
		selectedEntities,
		calls,
		cleanups,
		timers,
		controller: sandbox[PRODUCTION_KEY],
		runNextTimer() {
			const next = timers.entries().next()
			if (next.done) return null
			const [id, timer] = next.value
			timers.delete(id)
			timer.callback()
			return timer.delay
		},
		setTelemetry(value) {
			sandbox[TELEMETRY_KEY] = value
		},
		emitRuntime(next) {
			runtimeState = Object.assign({}, next)
			runtimeListener?.(runtime.snapshot())
		},
		emitAnalysis(next) {
			analysisState = Object.assign({}, next)
			analysisListener?.(analysis.snapshot())
		},
		unsubscribeCounts() {
			return { runtimeUnsubscribed, analysisUnsubscribed }
		}
	}
}

function testLiveSelectionRefreshAndCapture() {
	const env = createProductionHarness()
	assert.ok(env.controller)
	assert.equal(env.controller.version, '0.3.5')
	assert.equal(env.controller.refreshMs, 1000)
	assert.equal(env.calls.length, 1)
	for (const call of env.calls) {
		assert.deepEqual(call.entities, env.selectedEntities)
		assert.deepEqual(call.options, { theoretical: false, supplemental: true })
	}
	assert.equal(env.controller.snapshot().status, 'ready')
	assert.deepEqual(plain(env.controller.snapshot().telemetry.totals.actual.output), [2, 0])
	assert.equal(env.timers.size, 1)

	env.calls.length = 0
	assert.equal(env.runNextTimer(), 1000)
	assert.equal(env.calls.length, 1)
	assert.deepEqual(env.calls[0].options, { theoretical: false, supplemental: true })
	assert.equal(env.timers.size, 1)

	const captured = env.controller.captureEntities(env.selectedEntities)
	assert.equal(env.calls.at(-1).options, undefined)
	assert.equal(captured.status, 'ready')
	assert.equal(captured.source, 'cattail.dynamic-details.production-telemetry')
	assert.equal(captured.apiVersion, 1)
	assert.equal(captured.snapshotSchemaVersion, 1)
	assert.equal(captured.canonicalUnit, 'perSecond')
	assert.equal(captured.sampleWindowMs, 30000)
	assert.equal(captured.quality, 'complete')
	assert.deepEqual(plain(captured.sampleDuration), {
		minMs: 30000,
		maxMs: 30000,
		collectingEntities: 0
	})
	assert.deepEqual(plain(captured.entities.unsupported), {
		theoretical: 1,
		actualOutput: 2,
		actualConsume: 3
	})
	assert.deepEqual(plain(captured.events), { dropped: 7, truncated: true })
	assert.deepEqual(plain(captured.totals.theoretical.net), [2, -1])
	assert.deepEqual(plain(captured.totals.actual.net), [2, -.5])
	assert.equal(captured.byType[0].name, 'pump')
	assert.equal(captured.byType[0].count, 2)
	assert.equal(captured.byType[0].supplemental[0].id, 'pumpMining')
	assert.equal(captured.byType[0].supplemental[0].resources[0], 2)
	assert.equal(Object.isFrozen(captured), true)
	assert.equal(Object.isFrozen(captured.byType[0].supplemental[0].resources), true)
	captured.totals.actual.output[0] = 999
	assert.equal(captured.totals.actual.output[0], 2)

	env.emitAnalysis({ phase: 'selected', status: 'scanning', key: 'scan' })
	assert.equal(env.controller.snapshot().status, 'scanning')
	assert.equal(env.timers.size, 0)
	env.emitRuntime({ active: false })
	assert.equal(env.controller.snapshot().status, 'idle')
	assert.equal(env.timers.size, 0)

	assert.equal(env.cleanups.length, 1)
	env.cleanups[0]()
	assert.equal(env.controller.snapshot().disposed, true)
	assert.equal(env.sandbox[PRODUCTION_KEY], undefined)
	assert.deepEqual(env.unsubscribeCounts(), {
		runtimeUnsubscribed: 1,
		analysisUnsubscribed: 1
	})
}

function testSoftDependencyRecoveryAndInactiveIdle() {
	const unavailable = createProductionHarness({ telemetry: false })
	assert.equal(unavailable.controller.snapshot().status, 'unavailable')
	assert.equal(unavailable.controller.snapshot().reason, 'telemetry-unavailable')
	assert.equal(unavailable.timers.size, 1)
	const telemetry = createTelemetry(unavailable.calls)
	unavailable.setTelemetry(telemetry)
	assert.equal(unavailable.runNextTimer(), 1000)
	assert.equal(unavailable.controller.snapshot().status, 'ready')
	assert.equal(unavailable.calls.length, 1)
	assert.deepEqual(unavailable.calls[0].options, {
		theoretical: false,
		supplemental: true
	})
	unavailable.controller.dispose('test')

	const inactive = createProductionHarness({ active: false })
	assert.equal(inactive.controller.snapshot().status, 'idle')
	assert.equal(inactive.calls.length, 0)
	assert.equal(inactive.timers.size, 0)
	inactive.controller.dispose('test')
}

function loadTransform() {
	const sandbox = {
		console,
		performance: { now: () => 1 },
		ModLoader: {
			register(definition) {
				definition.init()
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(
		fs.readFileSync(path.join(MOD_ROOT, TRANSFORM_SOURCE), 'utf8'),
		sandbox,
		{ filename: TRANSFORM_SOURCE }
	)
	return sandbox[TRANSFORM_KEY]
}

function testSchemaThreeProductionPreservation() {
	const production = Object.freeze({ status: 'ready', marker: Object.freeze([1, 2, 3]) })
	const blueprint = Object.freeze({
		schemaVersion: 3,
		mode: 'full',
		sourcePlane: 0,
		anchor: Object.freeze({
			position: Object.freeze([0, 0]),
			selectionIds: Object.freeze([1])
		}),
		selections: Object.freeze([
			Object.freeze({
				id: 1,
				primary: true,
				start: Object.freeze([0, 0]),
				end: Object.freeze([0, 0]),
				min: Object.freeze([0, 0]),
				max: Object.freeze([0, 0]),
				width: 1,
				height: 1
			})
		]),
		contentBounds: Object.freeze({
			min: Object.freeze([0, 0]),
			max: Object.freeze([0, 0]),
			width: 1,
			height: 1
		}),
		includeBlocks: true,
		entities: Object.freeze([
			Object.freeze({
				kind: 'entity',
				name: 'pump',
				position: Object.freeze([0, 0]),
				footprint: Object.freeze({
					span: 0,
					min: Object.freeze([0, 0]),
					max: Object.freeze([0, 0])
				}),
				restricted: Object.freeze({ onlyOne: false }),
				config: Object.freeze({}),
				state: Object.freeze({ active: true })
			})
		]),
		blocks: Object.freeze([]),
		summary: Object.freeze({
			selectionCount: 1,
			selectedCellCount: 1,
			entityCount: 1,
			blockCount: 0,
			crossBoundaryCount: 0,
			skippedCount: 0,
			capturedTypes: Object.freeze([
				Object.freeze({ name: 'pump', reason: 'captured', count: 1 })
			]),
			skippedTypes: Object.freeze([])
		}),
		production
	})
	const transform = loadTransform()
	assert.equal(transform.bind(blueprint, '3f-test'), true)
	assert.equal(transform.snapshot().source, blueprint)
	assert.equal(transform.snapshot().blueprint.production, production)
	assert.equal(transform.snapshot().projected, false)
	assert.equal(transform.snapshot().blueprint.mode, 'full')
	assert.equal(transform.rotateClockwise('3f-test'), true)
	assert.equal(transform.snapshot().blueprint.production, production)
	transform.dispose('3f-test')
}

function loadI18n() {
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
	vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	definitions[0].init()
	return sandbox[I18N_KEY]
}

function testManifestLocalizationUiAndReadOnlyContracts() {
	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.5.1')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 35)
	assert.equal(
		manifest.entry.indexOf(SHARED_SOURCE),
		manifest.entry.indexOf('scripts/core/foundation.js') + 1
	)
	assert.equal(
		manifest.entry.indexOf(PRODUCTION_SOURCE),
		manifest.entry.indexOf(ANALYSIS_SOURCE) + 1
	)
	assert.equal(
		manifest.entry.indexOf(CARDS_SOURCE),
		manifest.entry.indexOf('scripts/ui/selection-card.js') + 1
	)

	const i18n = loadI18n()
	const productionKeys = [
		'productionTitle',
		'productionActual',
		'productionTheoretical',
		'productionCapturedActual',
		'productionUnavailable',
		'productionNoFlow',
		'productionOutput',
		'productionConsume',
		'productionNet',
		'productionByType',
		'productionUnsupported',
		'productionCollecting',
		'productionTruncated',
		'productionShow',
		'productionHide',
		'productionPumpMining'
	]
	assert.equal(i18n.version, '0.5.1')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 252)
	for (const language of i18n.languages) {
		for (const key of productionKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key)
			assert.ok(translated.trim())
		}
	}

	const productionSource = fs.readFileSync(path.join(MOD_ROOT, PRODUCTION_SOURCE), 'utf8')
	const sharedSource = fs.readFileSync(path.join(MOD_ROOT, SHARED_SOURCE), 'utf8')
	const analysisSource = fs.readFileSync(path.join(MOD_ROOT, ANALYSIS_SOURCE), 'utf8')
	const transformSource = fs.readFileSync(path.join(MOD_ROOT, TRANSFORM_SOURCE), 'utf8')
	const plannerSource = fs.readFileSync(path.join(MOD_ROOT, PLAN_SOURCE), 'utf8')
	const sessionSource = fs.readFileSync(path.join(MOD_ROOT, SESSION_SOURCE), 'utf8')
	const cardsSource = fs.readFileSync(path.join(MOD_ROOT, CARDS_SOURCE), 'utf8')
	const opacitySource = fs.readFileSync(path.join(MOD_ROOT, OPACITY_SOURCE), 'utf8')
	const selectionCardSource = fs.readFileSync(path.join(MOD_ROOT, SELECTION_CARD_SOURCE), 'utf8')
	const shellSource = fs.readFileSync(path.join(MOD_ROOT, SHELL_SOURCE), 'utf8')

	assert.match(productionSource, /\{\s*theoretical:\s*false,\s*supplemental:\s*true\s*\}/)
	assert.match(productionSource, /entry\?\.id === 'pumpMining' && entry\?\.basis === 'instantaneous'/)
	assert.match(productionSource, /applyInstantaneousPumpActual/)
	assert.match(productionSource, /const REFRESH_MS = 1000/)
	assert.match(productionSource, /deepFreeze/)
	assert.match(analysisSource, /entities\(\)\s*\{\s*return current\.status === 'ready' \? currentEntities\.slice\(\) : \[\]/)
	assert.match(sessionSource, /schemaVersion:\s*6/)
	assert.match(sessionSource, /productionState\.captureEntities\(capturedEntities\)/)
	assert.match(sessionSource, /production,\s*\n/)
	assert.match(transformSource, /return freezeContainer\(Object\.assign\(\{\}, normalized/)
	assert.match(transformSource, /schemaVersion\) === 6/)
	assert.match(plannerSource, /schemaVersion !== 6/)
	assert.match(cardsSource, /UNIT_NAMES = Object\.freeze\(\['s', 'min', 'hr'\]\)/)
	assert.match(cardsSource, /UNIT_FACTORS = Object\.freeze\(\[1, 60, 3600\]\)/)
	assert.match(cardsSource, /game\.resourcesSprites/)
	assert.match(cardsSource, /img\/resources\.png/)
	assert.match(sharedSource, /img\/shop\//)
	assert.match(cardsSource, /font-family:\s*Montserrat/)
	assert.match(cardsSource, /SELECTION_PRODUCTION_CARD_ID = 'cattail-world-editor-selection-production-card'/)
	assert.match(cardsSource, /group:\s*'selection-production'/)
	assert.match(cardsSource, /group:\s*'blueprint-production'/)
	assert.match(selectionCardSource, /group:\s*'selection-production'/)
	assert.match(cardsSource, /data-columns/)
	assert.match(cardsSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
	assert.match(cardsSource, /const shouldTryColumns = \(/)
	assert.match(cardsSource, /if \(!fitsBeside && !fitsStacked\) \{[\s\S]*card\.dataset\.columns = '1'[\s\S]*applyTypeColumns\(card, 1\)/)
	assert.match(cardsSource, /function applyTypeColumns\(card, count\)/)
	assert.match(cardsSource, /const targetIndex = totals\[0\] <= totals\[1\] \? 0 : 1/)
	assert.match(cardsSource, /data-production-type-layout/)
	assert.match(cardsSource, /compareProductionTypes/)
	assert.match(cardsSource, /right\.output !== left\.output/)
	assert.match(cardsSource, /right\.consume !== left\.consume/)
	assert.match(cardsSource, /localizedName\.localeCompare/)
	assert.match(cardsSource, /const noFlowStates = \{[\s\S]*selectionActual:\s*disclosureState\(false,\s*44,\s*\.35\)/)
	assert.match(cardsSource, /productionNoFlow'\) \+ ' \(' \+ count \+ '\)'/)
	assert.match(cardsSource, /syncProductionSectionState\(noFlowSection, noFlowStates\[viewKey\]\.expanded\)/)
	assert.match(cardsSource, /function renderTypes\(target, types, mode, unit, viewKey, onNestedLayoutChange\)/)
	assert.match(cardsSource, /createNoFlowSection\(noFlow, unit, viewKey, onNestedLayoutChange\)/)
	assert.match(cardsSource, /function createNoFlowSection\(entries, unit, viewKey, onNestedLayoutChange\)/)
	assert.match(cardsSource, /mounted\.disclosure = mountProductionDisclosure\([\s\S]*noFlowStates\[viewKey\]/)
	assert.match(sharedSource, /entityName === 'stabilizer3'[\s\S]*'img\/stabilizer3\.png'/)
	assert.match(sharedSource, /entityName === 'surge'[\s\S]*\? ''/)
	assert.match(sharedSource, /entity\?\.isDark \? entityName \+ '_dark' : entityName/)
	assert.match(cardsSource, /const source = shared\.resolveEntityIcon\(game, name\)[\s\S]*if \(!source\) \{[\s\S]*wrapper\.textContent = '·'[\s\S]*return wrapper/)
	assert.doesNotMatch(cardsSource, /function resolveEntityIcon\(/)
	assert.match(cardsSource, /markCompanionLayoutDirty\(card\)[\s\S]*syncBlueprintCompanion\(\)[\s\S]*onNestedLayoutChange\(mounted, detail\.state\.expanded\)/)
	assert.match(cardsSource, /function renderTypesSection\([\s\S]*viewKey,\s*function \(nestedSection, nestedExpanded\) \{\s*projectNestedProductionSectionHeight\(section, nestedSection, nestedExpanded\)\s*\}/)
	assert.doesNotMatch(cardsSource, /'selectionActual',\s*function \(\)/)
	assert.match(cardsSource, /function measureProductionSection\(section\)/)
	assert.match(cardsSource, /function projectNestedProductionSectionHeight\(section, nestedSection, expanded\)/)
	assert.match(cardsSource, /const currentOuterHeight = finitePositive\(outerBody\.scrollHeight, 0\)/)
	assert.match(cardsSource, /const currentNestedHeight = finitePositive\([\s\S]*nestedRect\?\.height,[\s\S]*nestedBody\.clientHeight/)
	assert.match(cardsSource, /const baseHeight = Math\.max\(1, currentOuterHeight - currentNestedHeight\)/)
	assert.match(sharedSource, /state\.effectiveHeight = effectiveHeight/)
	assert.match(cardsSource, /const targetNestedHeight = expanded[\s\S]*nestedSection\?\.disclosure\?\.state\?\.effectiveHeight,[\s\S]*measureProductionSectionHeight\(nestedSection\)/)
	assert.match(cardsSource, /Math\.ceil\(baseHeight \+ targetNestedHeight\)/)
	assert.match(cardsSource, /function setProductionSectionHeight\(section, height\)/)
	assert.match(cardsSource, /function estimateTypeLayoutHeight\(layout\)/)
	assert.match(cardsSource, /function queueProductionSectionMeasurement\(section\)/)
	assert.match(cardsSource, /requestAnimationFrame\(function \(\) \{[\s\S]*measureProductionSection\(section\)/)
	assert.doesNotMatch(cardsSource, /_worldEditorProductionMeasureMinimum|queuedMinimum/)
	assert.match(cardsSource, /max-height:\s*var\(--world-editor-production-section-height/)
	assert.match(cardsSource, /transition:\s*max-height \.16s ease-out,\s*opacity \.16s ease-out/)
	assert.doesNotMatch(cardsSource, /data-expanded="false"] > \.cattail-world-editor-production__body \{\s*display:\s*none/)
	assert.match(sharedSource, /\[data-world-editor-disclosure-toggle\][\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) 14px[\s\S]*min-height:\s*24px[\s\S]*color:\s*inherit/)
	assert.match(sharedSource, /\[data-world-editor-disclosure-chevron\][\s\S]*flex:\s*0 0 12px[\s\S]*transition:\s*transform \.16s ease-out/)
	assert.match(sharedSource, /\[data-world-editor-disclosure-chevron\]::before[\s\S]*top:\s*6px/)
	assert.ok((sharedSource.match(/transform:\s*rotate\((?:-)?38deg\)/g) || []).length >= 2)
	assert.doesNotMatch(cardsSource, /\.cattail-world-editor-production__section-toggle\s*\{[\s\S]*display:/)
	assert.doesNotMatch(sessionSource, /\.cattail-world-editor-blueprint-card__section-toggle\s*\{[\s\S]*display:/)
	assert.match(cardsSource, /const host = blueprintTheorySummaryState\.expanded[\s\S]*blueprintSummary\.captured\.body/)
	assert.match(cardsSource, /host\.insertBefore\(blueprintSummary\.unit\.root/)
	assert.match(cardsSource, /insertBefore\(blueprintSummary\.section, blueprintCosts\)/)
	assert.match(cardsSource, /insertBefore\(blueprintCaptured, blueprintCosts\)/)
	assert.match(cardsSource, /const blueprintClear = blueprintCard\.querySelector\('\[data-world-editor-blueprint-action="clear"\]'\)/)
	assert.match(cardsSource, /if \(blueprintClear\) blueprintClear\.before\(blueprintToggle\)/)
	assert.match(sharedSource, /function handleWorldRightMouseDown\(event\)/)
	assert.match(sharedSource, /event\?\.button !== 2/)
	assert.match(sharedSource, /event\.target === group\.game\?\.canvas/)
	assert.match(sharedSource, /dataset\.worldDragPassThrough/)
	assert.match(sharedSource, /data-world-drag-pass-through="true"/)
	assert.match(sharedSource, /function createDisclosureController\(options\)/)
	assert.match(sharedSource, /state\.expanded = state\.expanded !== false/)
	assert.match(sharedSource, /state\.preferredHeight = clamp\(/)
	assert.match(sharedSource, /window\.addEventListener\('pointermove', handleResizeMove, true\)/)
	assert.match(sharedSource, /window\.addEventListener\('pointercancel', handleResizeCancel, true\)/)
	assert.match(cardsSource, /mountProductionDisclosure\(selectionSummary,\s*selectionSummaryState/)
	assert.match(cardsSource, /mountProductionDisclosure\(blueprintSummary\.theory,\s*blueprintTheorySummaryState/)
	assert.match(cardsSource, /mountProductionDisclosure\(blueprintProductionCard\.captured,\s*blueprintCapturedTypesState/)
	assert.match(cardsSource, /heightProperty:\s*'--world-editor-production-section-height'/)
	assert.match(sessionSource, /heightProperty:\s*'--blueprint-section-max-height'/)
	assert.doesNotMatch(cardsSource, /function handleSelectionSummaryToggle\(|function handleBlueprintTheoryTypesToggle\(/)
	assert.doesNotMatch(sessionSource, /function handleSectionToggle\(|function handleSectionResizeStart\(/)
	assert.match(cardsSource, /shared\.registerWorldDragCard\(game,\s*selectionProductionCard\.card\)/)
	assert.match(cardsSource, /shared\.registerWorldDragCard\(game,\s*blueprintProductionCard\.card\)/)
	assert.match(selectionCardSource, /shared\.registerWorldDragCard\(game,\s*card\)/)
	assert.match(sessionSource, /shared\.registerWorldDragCard\(game,\s*card\)/)
	assert.doesNotMatch(cardsSource, /function handleWorldRightMouseDown\(|setWorldRightDragPassThrough/)
	assert.match(sessionSource, /shared\.isCardControlEvent\(event,\s*'\[data-world-editor-disclosure-resize\]'\)/)
	assert.match(cardsSource, /createSelectionSummary/)
	assert.match(cardsSource, /createBlueprintSummary/)
	assert.match(cardsSource, /createSelectionProductionCard/)
	assert.match(cardsSource, /cattail-world-editor-production__type-header/)
	assert.doesNotMatch(cardsSource, /createElement\('details'\)|createElement\('summary'\)/)
	assert.match(cardsSource, /input\.step = 'any'/)
	assert.match(cardsSource, /const duration = 160/)
	assert.match(cardsSource, /window\.requestAnimationFrame\(tick\)/)
	assert.match(cardsSource, /addEventListener\('input', handleSelectionUnitInput\)/)
	assert.match(cardsSource, /addEventListener\('change', handleSelectionUnitChange\)/)
	assert.match(cardsSource, /addEventListener\('keydown', handleSelectionUnitKeydown\)/)
	assert.match(cardsSource, /addEventListener\('input', handleBlueprintUnitInput\)/)
	assert.match(cardsSource, /addEventListener\('change', handleBlueprintUnitChange\)/)
	assert.match(cardsSource, /addEventListener\('keydown', handleBlueprintUnitKeydown\)/)
	assert.match(selectionCardSource, /const AUTO_HIDE_TRANSITION_MS = 160/)
	assert.match(selectionCardSource, /function \(\) \{\s*autoHideTimer = null\s*setAutoHiding\(false\)/)
	assert.match(selectionCardSource, /data-auto-hiding="true"/)
	assert.match(sessionSource, /const AUTO_HIDE_TRANSITION_MS = 160/)
	assert.match(sessionSource, /reason === 'preview-exited' && cardCurrentlyVisible\(\)/)
	assert.match(sessionSource, /function startCardAutoHide\(onComplete\)/)
	assert.match(sessionSource, /data-auto-hiding="true"/)
	assert.match(cardsSource, /card\.dataset\.autoHiding = mainCard\.dataset\.autoHiding \|\| 'false'/)
	assert.match(cardsSource, /data-visible="false"]\[data-auto-hiding="true"\]/)
	const focusStyle = sharedSource.match(
		/button\[class\*="cattail-world-editor-"\]:focus,([\s\S]*?)\n\s*\}/
	)
	assert.ok(focusStyle)
	assert.match(focusStyle[0], /input\[class\*="cattail-world-editor-"\]:focus/)
	assert.match(focusStyle[0], /\[tabindex\]\[class\*="cattail-world-editor-"\]:focus/)
	assert.match(focusStyle[0], /\[data-world-editor-card-control\]:focus/)
	assert.match(focusStyle[0], /\[data-world-editor-disclosure-toggle\]:focus/)
	assert.match(focusStyle[1], /outline:\s*none !important/)
	assert.match(focusStyle[1], /outline-offset:\s*0 !important/)
	for (const source of [sharedSource, shellSource, sessionSource, selectionCardSource, cardsSource]) {
		assert.doesNotMatch(source, /:focus-visible\s*\{[\s\S]*?outline:/)
	}
	const scrollbarStyle = sharedSource.match(
		/\[data-world-editor-scrollbar\]\s*\{([\s\S]*?)\n\s*\}/
	)
	assert.ok(scrollbarStyle)
	assert.match(scrollbarStyle[1], /--world-editor-scrollbar-size:\s*4px/)
	assert.match(scrollbarStyle[1], /--world-editor-scrollbar-thumb:\s*rgba\(185,\s*185,\s*185,\s*\.48\)/)
	assert.match(scrollbarStyle[1], /scrollbar-width:\s*thin/)
	assert.match(sharedSource, /\[data-world-editor-scrollbar\]::-webkit-scrollbar-thumb:hover/)
	assert.match(sharedSource, /body\.dataset\.worldEditorScrollbar = ''/)
	assert.match(selectionCardSource, /card\.dataset\.worldEditorScrollbar = ''/)
	assert.match(sessionSource, /card\.dataset\.worldEditorScrollbar = ''/)
	assert.ok((sessionSource.match(/\.dataset\.worldEditorScrollbar = ''/g) || []).length >= 4)
	assert.match(cardsSource, /card\.dataset\.worldEditorScrollbar = ''/)
	for (const source of [sessionSource, selectionCardSource, cardsSource]) {
		assert.doesNotMatch(source, /scrollbar-width:\s*thin|scrollbar-color:|::-webkit-scrollbar/)
	}
	assert.match(opacitySource, /const groups = new Map\(\)/)
	assert.match(opacitySource, /applySharedState/)
	assert.doesNotMatch(cardsSource, /\blocalStorage\b|\bsessionStorage\b/)
	const pinnedStyle = sharedSource.match(
		/\[data-world-editor-pinnable="true"\]\[data-pinned="true"\]\s*\{([\s\S]*?)\n\s*\}/
	)
	assert.ok(pinnedStyle)
	assert.match(pinnedStyle[1], /border-color:\s*color-mix/)
	assert.match(pinnedStyle[1], /0 0 16px/)
	assert.doesNotMatch(pinnedStyle[1], /\bbackground\s*:/)
	assert.match(selectionCardSource, /card\.dataset\.worldEditorPinnable = 'true'/)
	assert.match(sessionSource, /card\.dataset\.worldEditorPinnable = 'true'/)
	assert.match(sharedSource, /--world-editor-card-pinned-border-color:\s*rgba\(166,\s*242,\s*70,\s*\.82\)/)
	assert.match(sharedSource, /--world-editor-card-pinned-glow-color:\s*rgba\(166,\s*242,\s*70,\s*\.36\)/)
	assert.match(sharedSource, /--world-editor-card-pinned-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.24\)/)
	assert.match(selectionCardSource, /--world-editor-card-pinned-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.20\)/)
	assert.match(selectionCardSource, /data-theme="void"[\s\S]*--world-editor-card-pinned-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.38\)/)
	assert.match(selectionCardSource, /--world-editor-card-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.18\)/)
	const voidSelectionThemeStyle = selectionCardSource.match(
		/\.cattail-world-editor-selection-card\[data-theme="void"\]\s*\{([\s\S]*?)\n\s*\}/
	)
	assert.ok(voidSelectionThemeStyle)
	assert.match(voidSelectionThemeStyle[1], /--world-editor-card-base-shadow:\s*rgba\(0,\s*0,\s*0,\s*\.36\)/)
	assert.doesNotMatch(voidSelectionThemeStyle[1], /\bbox-shadow\s*:/)
	assert.doesNotMatch(sessionSource, /--world-editor-card-pinned-(?:border-color|glow-color|base-shadow)\s*:/)
	assert.doesNotMatch(selectionCardSource, /\.cattail-world-editor-selection-card\[data-pinned="true"\]/)
	assert.doesNotMatch(sessionSource, /\.cattail-world-editor-blueprint-card\[data-pinned="true"\]/)

	const readOnlySources = [sharedSource, productionSource, analysisSource, transformSource, plannerSource, sessionSource, cardsSource, selectionCardSource]
	for (const source of readOnlySources) {
		assert.doesNotMatch(source, /\bgame\.(?:addEntity|clearCell|deleteEntity|removeEntity|placeEntity)\s*\(/)
		assert.doesNotMatch(source, /\brequestResources\s*\(/)
	}
}

function run() {
	testLiveSelectionRefreshAndCapture()
	testSoftDependencyRecoveryAndInactiveIdle()
	testSchemaThreeProductionPreservation()
	testManifestLocalizationUiAndReadOnlyContracts()
	console.log('World Editor 3F verification passed: production consumer, persistent type rows, snapping unit sliders, selection pin styling, schema persistence, localization, and read-only boundary.')
}

run()
