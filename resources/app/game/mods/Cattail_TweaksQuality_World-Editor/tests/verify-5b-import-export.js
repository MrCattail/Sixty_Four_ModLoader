const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { MemoryLibraryHandle, clone, waitFor } = require('./helpers/library-api-harness')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_SOURCE = 'scripts/core/blueprint-state.js'
const FORMAT_SOURCE = 'scripts/core/blueprint-library-format.js'
const LIBRARY_SOURCE = 'scripts/core/blueprint-library.js'
const UI_SOURCE = 'scripts/ui/blueprint-library-ui.js'
const TEXT_SOURCE = 'scripts/i18n/editor-text.js'
const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
const LIBRARY_KEY = Symbol.for('cattail.world-editor.blueprint-library')
const SESSION_KEY = Symbol.for('cattail.world-editor.blueprint')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function fullBlueprint(marker = 'source') {
	return {
		schemaVersion: 6,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [{ id: 1, min: [0, 0], max: [2, 0] }],
		contentBounds: { min: [0, 0], max: [2, 0], width: 3, height: 1 },
		includeBlocks: true,
		entities: [{ id: 1, kind: 'entity', name: 'pump', position: [0, 0], footprint: { span: 0, min: [0, 0], max: [0, 0] }, state: { marker } }],
		blocks: [{ kind: 'cube', name: 'cube', position: [1, 0], state: { fill: 64 } }],
		surges: [{
			kind: 'surge',
			name: 'surge',
			position: [2, 0],
			state: {
				resources: [3],
				grade: 1,
				type: 1,
				rayNumber: 4,
				colors: ['#ffffff'],
				maxLife: 100,
				life: 90
			}
		}],
		emptyCells: [],
		production: null,
		summary: { entityCount: 1, blockCount: 1, surgeCount: 1, marker }
	}
}

function linkedBlueprint() {
	return {
		schemaVersion: 8,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [{ id: 1, min: [0, 0], max: [1, 0] }],
		contentBounds: { min: [0, 0], max: [1, 0], width: 2, height: 1 },
		includeBlocks: true,
		entities: [{
			id: 1,
			kind: 'entity',
			name: 'stabilizer',
			position: [0, 0],
			footprint: { span: 0, min: [0, 0], max: [0, 0] },
			state: {}
		}],
		blocks: [],
		paintedCubes: [],
		surges: [{
			kind: 'surge',
			name: 'surge',
			position: [1, 0],
			stabilizer: { position: [0, 0] },
			state: {
				resources: [0, 10],
				grade: 1,
				type: 1,
				rayNumber: 4,
				colors: ['#ffffff'],
				maxLife: 100,
				life: 90
			}
		}],
		emptyCells: [],
		production: null,
		summary: { entityCount: 1, blockCount: 0, surgeCount: 1, paintedCubeCount: 0 }
	}
}

function createSession() {
	let state = { sourceBlueprint: clone(fullBlueprint()), dirty: true, origin: null }
	return {
		snapshot() { return state },
		markSaved(origin) { state = Object.assign({}, state, { dirty: false, origin: clone(origin) }) },
		loadSource(blueprint, origin) { state = { sourceBlueprint: clone(blueprint), dirty: false, origin: clone(origin) } }
	}
}

async function createEnvironment(options = {}) {
	const definitions = []
	const hooks = new Map()
	const handle = new MemoryLibraryHandle({
		extensions: ['.64schem', '.cattail-blueprint.json'],
		maxFileBytes: options.maxFileBytes || 16 * 1024 * 1024
	})
	let uuidSequence = 0
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(value) { definitions.push(value) } },
		Symbol, Object, Array, Map, Set, WeakMap, Promise, JSON, Math, Number, String, Boolean, Date, Error, TypeError, Uint8Array,
		setTimeout, clearTimeout,
		crypto: {
			randomUUID() {
				uuidSequence += 1
				return '20000000-0000-4000-8000-' + String(uuidSequence).padStart(12, '0')
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	for (const relativePath of [STATE_SOURCE, FORMAT_SOURCE, LIBRARY_SOURCE]) {
		vm.runInContext(source(relativePath), sandbox, { filename: relativePath })
	}
	const api = {
		storage: { libraries: { version: '1.1.0', open() { return handle } } },
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	}
	for (const definition of definitions) definition.init(api)
	sandbox[SESSION_KEY] = createSession()
	sandbox[TRANSFORM_KEY] = { snapshot() { return { rotation: 0, mirrorU: false, mirrorV: false } }, restore() {} }
	sandbox[RUNTIME_KEY] = { addCleanup() {} }
	for (const listener of hooks.get('afterGameInit') || []) listener({}, {})
	const controller = await waitFor(() => sandbox[LIBRARY_KEY]?.snapshot().ready && sandbox[LIBRARY_KEY], '5B controller did not initialize.')
	return { sandbox, format: sandbox[FORMAT_KEY], controller, handle }
}

async function expectCode(code, operation) {
	await assert.rejects(operation, error => error?.code === code)
}

function marker(entry) {
	return entry.envelope.blueprint.summary.marker
}

async function testDoubleReadSingleWriteAndValidation() {
	const env = await createEnvironment({ maxFileBytes: 4096 })
	assert.equal(env.controller.version, '0.5.1')
	assert.equal(env.format.fileExtension, '.64schem')
	assert.equal(env.format.legacyFileExtension, '.cattail-blueprint.json')
	assert.deepEqual(Array.from(env.format.fileExtensions), ['.64schem', '.cattail-blueprint.json'])
	assert.equal(env.format.isFileName('one.64schem'), true)
	assert.equal(env.format.isFileName('one.cattail-blueprint.json'), true)
	assert.equal(env.format.isFileName('one.json'), false)
	assert.deepEqual(env.controller.snapshot().capabilities.extensions, ['.64schem', '.cattail-blueprint.json'])

	const imported = env.format.create({
		id: '30000000-0000-4000-8000-000000000001',
		displayName: 'Imported v2',
		createdAt: '2024-01-02T03:04:05.000Z',
		modifiedAt: '2024-02-03T04:05:06.000Z',
		defaultTransform: { rotation: 90, mirrorU: true, mirrorV: false },
		blueprint: fullBlueprint('v2')
	})
	env.handle.queueImport({ canceled: false, fileName: 'incoming.64schem', data: env.format.serialize(imported) })
	const candidate = await env.controller.pickImport({ title: 'Choose' })
	assert.equal(candidate.fileName, 'incoming.64schem')
	assert.equal(candidate.conflict, null)
	assert.equal('path' in candidate, false)
	const committed = await env.controller.commitImport(candidate, 'import')
	assert.equal(committed.entry.envelope.id, imported.id)
	assert.equal(committed.entry.envelope.createdAt, imported.createdAt)
	assert.equal(committed.entry.envelope.modifiedAt, imported.modifiedAt)
	assert.deepEqual(clone(committed.entry.envelope.defaultTransform), clone(imported.defaultTransform))
	assert.equal(marker(committed.entry), 'v2')
	assert.match(committed.entry.name, /\.64schem$/)
	assert.equal(JSON.parse(env.handle.record('active', committed.entry.name).data).librarySchemaVersion, 2)

	const legacy = clone(env.format.create({
		id: '30000000-0000-4000-8000-000000000002',
		displayName: 'Legacy import',
		blueprint: fullBlueprint('v1')
	}))
	legacy.librarySchemaVersion = 1
	delete legacy.defaultTransform
	env.handle.queueImport({ canceled: false, fileName: 'legacy.cattail-blueprint.json', data: JSON.stringify(legacy) })
	const legacyResult = await env.controller.commitImport(await env.controller.pickImport(), 'import')
	assert.match(legacyResult.entry.name, /\.64schem$/)
	assert.equal(JSON.parse(env.handle.record('active', legacyResult.entry.name).data).librarySchemaVersion, 2)
	assert.deepEqual(clone(legacyResult.entry.envelope.defaultTransform), { rotation: 0, mirrorU: false, mirrorV: false })

	assert.deepEqual(clone(await env.controller.pickImport()), { canceled: true })
	await expectCode('CORRUPT', () => env.controller.prepareImportText('   '))
	await expectCode('INCOMPATIBLE', () => env.controller.prepareImportText(JSON.stringify(fullBlueprint('naked'))))
	await expectCode('INCOMPATIBLE', () => env.controller.prepareImportText(JSON.stringify(Object.assign({}, clone(imported), { gameId: 'other-game' }))))
	await expectCode('TOO_LARGE', () => env.controller.prepareImportText(' '.repeat(4097)))
}

async function testConflictCopyReplaceCancelAndRevision() {
	const env = await createEnvironment()
	const original = await env.controller.saveCurrent({ displayName: 'Original' })
	const incoming = env.format.create({
		id: original.envelope.id,
		displayName: 'Incoming replacement',
		createdAt: '2020-01-01T00:00:00.000Z',
		modifiedAt: '2020-02-01T00:00:00.000Z',
		defaultTransform: { rotation: 270, mirrorU: false, mirrorV: true },
		blueprint: fullBlueprint('incoming')
	})
	const text = env.format.serialize(incoming)

	const cancelCandidate = await env.controller.prepareImportText(text)
	const operationsBeforeCancel = env.handle.operations.length
	assert.ok(cancelCandidate.conflict)
	assert.deepEqual(clone(await env.controller.commitImport(cancelCandidate, 'cancel')), { canceled: true })
	assert.equal(env.handle.operations.length, operationsBeforeCancel)

	const copied = await env.controller.commitImport(await env.controller.prepareImportText(text), 'copy')
	assert.equal(copied.replaced, false)
	assert.notEqual(copied.entry.envelope.id, original.envelope.id)
	assert.notEqual(copied.entry.envelope.createdAt, incoming.createdAt)
	assert.equal(marker(copied.entry), 'incoming')
	assert.match(copied.entry.name, /\.64schem$/)

	const replaceCandidate = await env.controller.prepareImportText(text)
	const replaced = await env.controller.commitImport(replaceCandidate, 'replace')
	assert.equal(replaced.replaced, true)
	assert.equal(replaced.entry.envelope.id, original.envelope.id)
	assert.equal(replaced.entry.envelope.createdAt, original.envelope.createdAt)
	assert.notEqual(replaced.entry.envelope.modifiedAt, incoming.modifiedAt)
	assert.equal(replaced.entry.envelope.displayName, incoming.displayName)
	assert.deepEqual(clone(replaced.entry.envelope.defaultTransform), clone(incoming.defaultTransform))
	assert.equal(marker(replaced.entry), 'incoming')
	assert.ok(env.controller.snapshot().trash.some(entry => entry.envelope?.id === original.envelope.id))

	const staleCandidate = await env.controller.prepareImportText(env.format.serialize(env.format.create({
		id: replaced.entry.envelope.id,
		displayName: 'Must not win',
		blueprint: fullBlueprint('stale')
	})))
	const external = env.format.create({
		id: replaced.entry.envelope.id,
		displayName: replaced.entry.envelope.displayName,
		createdAt: replaced.entry.envelope.createdAt,
		blueprint: fullBlueprint('external')
	})
	env.handle.externalWrite(replaced.entry.name, env.format.serialize(external))
	await expectCode('REVISION_CONFLICT', () => env.controller.commitImport(staleCandidate, 'replace'))
	assert.equal(marker(env.controller.snapshot().active.find(entry => entry.envelope?.id === original.envelope.id)), 'external')
}

async function testHistoricalIdentitySuffixTransitionsExportAndShare() {
	const env = await createEnvironment()
	const legacyEnvelope = env.format.create({
		id: '40000000-0000-4000-8000-000000000001',
		displayName: 'Legacy resident',
		blueprint: fullBlueprint('legacy-resident')
	})
	const legacyRaw = clone(legacyEnvelope)
	legacyRaw.librarySchemaVersion = 1
	delete legacyRaw.defaultTransform
	const legacyName = 'Legacy resident__40000000000040008000000000000001.cattail-blueprint.json'
	env.handle.externalWrite(legacyName, JSON.stringify(legacyRaw))
	await env.controller.refresh('legacy-added')
	const legacyEntry = env.controller.snapshot().active.find(entry => entry.name === legacyName)
	assert.ok(legacyEntry)

	const shared = await env.controller.shareText(legacyEntry)
	assert.equal(JSON.parse(shared.text).librarySchemaVersion, 2)
	assert.match(shared.fileName, /\.64schem$/)
	assert.equal(env.handle.record('active', legacyName).data, JSON.stringify(legacyRaw), 'sharing must not rewrite the resident legacy file')

	const legacyRevision = legacyEntry.revision
	env.handle.queueExport({ canceled: false, fileName: 'legacy-canonical.64schem' })
	const legacyExport = await env.controller.exportItem(legacyEntry, { title: 'Export legacy canonically' })
	assert.equal(legacyExport.fileName, 'legacy-canonical.64schem')
	assert.equal(JSON.parse(env.handle.exportedFiles.at(-1).data).librarySchemaVersion, 2)
	assert.equal(env.handle.exportedFiles.at(-1).sourceData, JSON.stringify(legacyRaw))
	assert.equal(env.handle.record('active', legacyName).data, JSON.stringify(legacyRaw), 'canonical export must not rewrite the resident legacy file')
	assert.equal(env.handle.record('active', legacyName).info.revision, legacyRevision, 'canonical export must not change the resident revision')
	assert.equal(env.controller.snapshot().trash.length, 0, 'canonical export must not create a resident backup')

	await env.controller.trash(legacyEntry)
	const historical = env.controller.snapshot().trash.find(entry => entry.name === legacyName)
	assert.ok(historical)
	await env.controller.restore(historical)
	assert.ok(env.controller.snapshot().active.some(entry => entry.name === legacyName), 'restoring legacy trash keeps the legacy suffix')

	const renamed = await env.controller.rename(env.controller.snapshot().active.find(entry => entry.name === legacyName), 'Converted explicitly')
	assert.match(renamed.name, /\.64schem$/)
	assert.ok(env.controller.snapshot().trash.some(entry => entry.name.endsWith('.cattail-blueprint.json')), 'the previous legacy revision remains recoverable')

	env.handle.queueExport({ canceled: false, fileName: 'exported.64schem' })
	const exported = await env.controller.exportItem(renamed, { title: 'Export' })
	assert.deepEqual(clone(exported), { canceled: false, fileName: 'exported.64schem', bytes: env.handle.exportedFiles.at(-1).bytes })
	assert.equal(JSON.parse(env.handle.exportedFiles.at(-1).data).librarySchemaVersion, 2)
	assert.equal('path' in exported, false)
	const revisionBeforeCancel = renamed.revision
	env.handle.queueExport({ canceled: true })
	assert.deepEqual(clone(await env.controller.exportItem(renamed)), { canceled: true })
	assert.equal(env.controller.snapshot().active.find(entry => entry.envelope?.id === renamed.envelope.id).revision, revisionBeforeCancel)

	const trashedId = renamed.envelope.id
	await env.controller.trash(renamed)
	const candidateWithoutActiveConflict = await env.controller.prepareImportText(env.format.serialize(env.format.create({
		id: trashedId,
		displayName: 'History does not conflict',
		blueprint: fullBlueprint('history')
	})))
	assert.equal(candidateWithoutActiveConflict.conflict, null)
}

async function testSchemaEightRelationshipImportExportRoundTrip() {
	const env = await createEnvironment()
	const envelope = env.format.create({
		displayName: 'Linked stabilizer',
		blueprint: linkedBlueprint()
	})
	assert.equal(envelope.blueprint.schemaVersion, 8)
	assert.deepEqual(clone(envelope.blueprint.surges[0].stabilizer), { position: [0, 0] })
	const parsed = env.format.parse(env.format.serialize(envelope))
	assert.equal(parsed.blueprint.schemaVersion, 8)
	assert.deepEqual(clone(parsed.blueprint.surges[0].stabilizer), { position: [0, 0] })
	assert.equal(env.format.metadata(parsed).paintedCompatible, true)
}

function testI18nUiAndManifestContracts() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.loaderVersion, '>=0.4.0')
	assert.deepEqual(manifest.libraries.blueprints.extensions, ['.64schem', '.cattail-blueprint.json'])

	const definitions = []
	const sandbox = { ModLoader: { register(value) { definitions.push(value) } }, Symbol, Object, Array, Map, Set, JSON, String }
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(TEXT_SOURCE), sandbox, { filename: TEXT_SOURCE })
	definitions[0].init()
	const i18n = sandbox[I18N_KEY]
	assert.equal(i18n.version, '0.6.0')
	assert.equal(i18n.languages.length, 20)
	const keys = [
		'blueprintLibraryImport', 'blueprintLibraryChooseFile', 'blueprintLibraryPasteShareText', 'blueprintLibraryExportFile',
		'blueprintLibraryCopyShareText', 'blueprintLibraryConflictTitle', 'blueprintLibraryImportAsCopy', 'blueprintLibraryImportReplace',
		'blueprintLibraryImportSuccess', 'blueprintLibraryReplaceSuccess', 'blueprintLibraryExportSuccess', 'blueprintLibraryShareSuccess',
		'blueprintLibraryClipboardReadFailed', 'blueprintLibraryClipboardWriteFailed', 'blueprintLibraryStatusDismiss'
	]
	for (const language of i18n.languages) {
		for (const key of keys) assert.ok(i18n.t(language, key), language + ' is missing ' + key)
	}
	assert.equal(i18n.t('sch', 'blueprintLibraryImport'), '导入')
	assert.equal(i18n.t('ru', 'blueprintLibraryImport'), 'Import')

	const ui = source(UI_SOURCE)
	assert.match(ui, /renderView\('page'/)
	assert.match(ui, /renderView\('modal'/)
	assert.match(ui, /function requestImportSource\(\)/)
	assert.match(ui, /function resolveImportConflict\(candidate\)/)
	assert.match(ui, /dialog\.mount\(copy\)/)
	assert.match(ui, /statusMessage\?\.kind === 'error' \? 'assertive' : 'polite'/)
	assert.match(ui, /globalThis\.navigator\.clipboard\.readText\(\)/)
	assert.match(ui, /globalThis\.navigator\.clipboard\.writeText\(shared\.text\)/)
}

async function run() {
	await testDoubleReadSingleWriteAndValidation()
	await testConflictCopyReplaceCancelAndRevision()
	await testHistoricalIdentitySuffixTransitionsExportAndShare()
	await testSchemaEightRelationshipImportExportRoundTrip()
	testI18nUiAndManifestContracts()
	console.log('World Editor 5B verification passed: .64schem double-read/single-write, v1/v2 validation, conflict copy/replace/cancel with revision checks, legacy suffix transitions, active export/share, 20-language keys, and shared Pages/modal UI contracts.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
