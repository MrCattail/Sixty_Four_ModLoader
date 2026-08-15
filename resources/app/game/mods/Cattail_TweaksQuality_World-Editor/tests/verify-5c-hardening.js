const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const LIBRARY_KEY = Symbol.for('cattail.world-editor.blueprint-library')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function createSandbox(extra = {}) {
	const definitions = []
	const sandbox = Object.assign({
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(definition) { definitions.push(definition) } },
		Symbol, Object, Array, Map, Set, WeakMap, WeakSet, Promise, JSON, Math, Number,
		String, Boolean, Date, Error, TypeError, RegExp, Uint8Array, setTimeout, clearTimeout,
		crypto: { randomUUID() { return '12345678-1234-4123-8123-123456789abc' } }
	}, extra)
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	return { sandbox, definitions }
}

function loadDefinition(environment, relativePath) {
	vm.runInContext(source(relativePath), environment.sandbox, { filename: relativePath })
	const definition = environment.definitions.shift()
	assert.ok(definition, relativePath)
	return definition
}

function createBlueprintEnvironment() {
	const environment = createSandbox()
	for (const file of [
		'scripts/core/paint-cube-state.js',
		'scripts/core/blueprint-painted.js',
		'scripts/core/blueprint-state.js',
		'scripts/core/blueprint-library-format.js',
		'scripts/core/blueprint-transform.js'
	]) {
		loadDefinition(environment, file).init({ on() {}, patch() {} })
	}
	return environment
}

function blueprintForSchema(schema, paint) {
	const structure = schema <= 4
	const blueprint = {
		schemaVersion: schema,
		mode: structure ? 'structure' : 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [] },
		selections: [],
		contentBounds: { min: [0, 0], max: [0, 0], width: 1, height: 1 },
		entities: [],
		blocks: [],
		summary: {}
	}
	if (schema >= 5) blueprint.emptyCells = []
	if (schema >= 6) blueprint.surges = []
	if (schema === 7) {
		const save = paint.buildStableCubeSave([0, 0])
		blueprint.paintedCubes = [{ kind: 'painted-cube', name: 'cube', position: [0, 0], state: plain(save.par) }]
	}
	return blueprint
}

function envelopeFor(format, blueprint) {
	return format.create({
		id: '12345678-1234-4123-8123-123456789abc',
		displayName: 'Hardening',
		createdAt: '2026-08-07T00:00:00.000Z',
		modifiedAt: '2026-08-07T00:00:00.000Z',
		blueprint
	})
}

function expectCode(operation, code) {
	assert.throws(operation, function (error) { return error?.code === code }, code)
}

function testBlueprintIngressBoundaries() {
	const env = createBlueprintEnvironment()
	const paint = env.sandbox[PAINT_KEY]
	const state = env.sandbox[STATE_KEY]
	const format = env.sandbox[FORMAT_KEY]
	const transform = env.sandbox[TRANSFORM_KEY]

	for (let schema = 1; schema <= 7; schema += 1) {
		const blueprint = blueprintForSchema(schema, paint)
		assert.equal(state.inspectBlueprint(blueprint).valid, true, 'schema ' + schema)
		const envelope = envelopeFor(format, blueprint)
		assert.equal(format.parse(format.serialize(envelope)).blueprint.schemaVersion, schema)
	}

	const safeDepth = plain(envelopeFor(format, blueprintForSchema(6, paint)))
	let current = safeDepth
	for (let depth = 0; depth < 32; depth += 1) {
		current.extra = {}
		current = current.extra
	}
	assert.equal(format.parse(safeDepth).blueprint.schemaVersion, 6, 'root depth 0 through depth 32 is accepted')
	current.extra = {}
	expectCode(function () { format.parse(safeDepth) }, 'CORRUPT')

	const serialized = format.serialize(envelopeFor(format, blueprintForSchema(6, paint)))
	for (const key of ['__proto__', 'prototype', 'constructor']) {
		const dangerous = serialized.replace('"schemaVersion": 6', JSON.stringify(key) + ': {"polluted": true},\n    "schemaVersion": 6')
		expectCode(function () { format.parse(dangerous) }, 'CORRUPT')
	}
	assert.equal({}.polluted, undefined)

	const future = plain(envelopeFor(format, blueprintForSchema(6, paint)))
	future.librarySchemaVersion = 99
	expectCode(function () { format.parse(future) }, 'INCOMPATIBLE')

	const unsafe = blueprintForSchema(6, paint)
	unsafe.anchor.position = [Number.MAX_SAFE_INTEGER + 1, 0]
	expectCode(function () { envelopeFor(format, unsafe) }, 'BLUEPRINT_INVALID')
	const derivedOverflow = blueprintForSchema(6, paint)
	derivedOverflow.contentBounds = {
		min: [Number.MAX_SAFE_INTEGER, 0],
		max: [Number.MAX_SAFE_INTEGER, 0],
		width: 1,
		height: 1
	}
	expectCode(function () { envelopeFor(format, derivedOverflow) }, 'BLUEPRINT_INVALID')
	transform.bind(derivedOverflow, 'unsafe-derived-test')
	assert.equal(transform.snapshot().blueprint, null, 'derived coordinate overflow is rejected before transform publication')
}

async function settle(predicate) {
	for (let index = 0; index < 20; index += 1) {
		if (predicate()) return
		await new Promise(resolve => setImmediate(resolve))
	}
	assert.fail('asynchronous test state did not settle')
}

async function testLibraryProblemsImportAndWriteLock() {
	const env = createBlueprintEnvironment()
	const format = env.sandbox[FORMAT_KEY]
	const paint = env.sandbox[PAINT_KEY]
	const goodData = format.serialize(envelopeFor(format, blueprintForSchema(6, paint)))
	const badData = goodData.replace('"schemaVersion": 6', '"constructor": {},\n    "schemaVersion": 6')
	const writes = []
	const mutations = []
	const infos = [
		{ name: 'good.64schem', revision: 'good-revision', modifiedAt: 2 },
		{ name: 'bad.64schem', revision: 'bad-revision', modifiedAt: 1 }
	]
	const handle = {
		async capabilities() { return { maxFileBytes: 16 * 1024 * 1024 } },
		async list(options) { return options.area === 'active' ? infos : options.area === 'trash' ? [infos[1]] : [] },
		async read(options) {
			const info = infos.find(value => value.name === options.name) || infos[0]
			return { info, data: options.name === 'bad.64schem' ? badData : goodData }
		},
		async watch() { const error = new Error('no watch'); error.code = 'WATCH_UNAVAILABLE'; throw error },
		async write(options) { writes.push(options); return { info: infos[0] } },
		async rename(options) { mutations.push(['rename', options]); return infos[0] },
		async trash(options) { mutations.push(['trash', options]); return {} },
		async restore(options) { mutations.push(['restore', options]); return {} },
		async quarantine(options) { mutations.push(['quarantine', options]); return {} },
		async remove(options) { mutations.push(['remove', options]); return {} },
		async exportItem(options) { return { fileName: options.suggestedName } },
		async pickImport() { return { canceled: true } },
		async openFolder() { return true }
	}
	const game = {}
	const sessionState = { sourceBlueprint: blueprintForSchema(6, paint), origin: null }
	env.sandbox[Symbol.for('cattail.world-editor.blueprint')] = {
		snapshot() { return sessionState },
		markSaved() {},
		loadSource() {}
	}
	env.sandbox[Symbol.for('cattail.world-editor.runtime')] = { addCleanup() {} }
	env.sandbox[TRANSACTIONS_KEY] = {
		game,
		writeBlockedReason() { return 'ROLLBACK_FAILED' },
		snapshot() { return { terminalBlockedReason: 'ROLLBACK_FAILED' } }
	}
	const events = new Map()
	const definition = loadDefinition(env, 'scripts/core/blueprint-library.js')
	definition.init({
		on(name, listener) { events.set(name, listener) },
		storage: { libraries: { version: '1.1.0', open() { return handle } } }
	})
	events.get('afterGameInit')({}, game)
	const library = env.sandbox[LIBRARY_KEY]
	await settle(function () { return library.snapshot().ready && !library.snapshot().busy })
	assert.equal(library.snapshot().problems.length, 2, 'invalid active and trash files are both listed under Problems')
	assert.equal(library.snapshot().problems[0].error.code, 'CORRUPT')
	assert.equal(writes.length, 0, 'invalid existing files are listed without rewrite')

	await assert.rejects(library.prepareImportText(badData), error => error?.code === 'CORRUPT')
	await assert.rejects(library.prepareImportText('x'.repeat(16 * 1024 * 1024 + 1)), error => error?.code === 'TOO_LARGE')
	assert.equal(writes.length, 0, 'invalid imports are rejected before write')

	const good = library.snapshot().active.find(entry => entry.name === 'good.64schem')
	assert.ok(good)
	assert.equal((await library.load(good)).blueprint.schemaVersion, 6)
	assert.ok((await library.exportItem(good)).fileName.endsWith('.64schem'))
	assert.ok((await library.shareText(good)).text.includes('"librarySchemaVersion"'))
	assert.equal((await library.pickImport()).canceled, true)
	await library.quarantine(library.snapshot().problems[0])
	assert.equal(mutations[0][0], 'quarantine', 'manual quarantine remains available under the write lock')

	const lockedCalls = [
		function () { return library.saveCurrent({ displayName: 'x' }) },
		function () { return library.rename(good, 'x') },
		function () { return library.duplicate(good, 'x') },
		function () { return library.commitImport({ envelope: good.envelope }, 'import') },
		function () { return library.trash(good) },
		function () { return library.restore({ name: 'x' }) },
		function () { return library.remove({ name: 'x' }) }
	]
	for (const operation of lockedCalls) {
		await assert.rejects(operation(), error => error?.code === 'ROLLBACK_FAILED')
	}
	assert.equal(writes.length, 0)
}

function testPatchReplacementLifecycle() {
	let activePatches = 0
	const patch = function (target, name, wrap) {
		const original = target[name]
		const replacement = wrap(original)
		target[name] = replacement
		activePatches += 1
		let active = true
		return function () {
			if (!active) return false
			active = false
			if (target[name] === replacement) target[name] = original
			activePatches -= 1
			return true
		}
	}

	const stateEnv = createSandbox({ Cube: class Cube { onmousedown() { return 'vanilla' } } })
	const stateHooks = []
	for (let run = 0; run < 2; run += 1) {
		loadDefinition(stateEnv, 'scripts/core/paint-cube-state.js').init({
			on(name, listener) { if (name === 'afterVanillaScripts') stateHooks.push(listener) }, patch
		})
		stateHooks.at(-1)()
		assert.equal(activePatches, 1, 'Cube.onmousedown replacement never stacks')
	}

	activePatches = 0
	const inputEnv = createSandbox({ Game: class Game { switchPlane() { return 'vanilla' } } })
	const inputHooks = []
	for (let run = 0; run < 2; run += 1) {
		loadDefinition(inputEnv, 'scripts/input/paint-cube-input.js').init({
			on(name, listener) { if (name === 'afterVanillaScripts') inputHooks.push(listener) }, patch
		})
		inputHooks.at(-1)()
		assert.equal(activePatches, 1, 'Game.switchPlane replacement never stacks')
	}
}

async function testCreativeEntryHonorsWriteLock() {
	class Game {
		processE() { return 'write' }
		processClick() { return 'write' }
	}
	const listeners = new Map()
	const windowStub = { addEventListener() {}, removeEventListener() {} }
	const env = createSandbox({ Game, window: windowStub })
	const game = new Game()
	env.sandbox[Symbol.for('cattail.world-editor.creative-mode')] = {
		game,
		snapshot() { return { ready: true, creativeMode: true, disposed: false } },
		subscribe() { return function () {} }
	}
	env.sandbox[TRANSACTIONS_KEY] = {
		game,
		writeBlockedReason() { return 'ROLLBACK_FAILED' },
		snapshot() { return { terminalBlockedReason: 'ROLLBACK_FAILED' } }
	}
	loadDefinition(env, 'scripts/core/creative-economy.js').init({
		config: { get() { return false } },
		storage: { snapshots: { create() { throw new Error('must not snapshot') } } },
		on(name, listener) { listeners.set(name, listener) },
		patch(target, name, wrap) {
			const original = target[name]
			target[name] = wrap(original)
			return function () { target[name] = original }
		}
	})
	listeners.get('afterVanillaScripts')()
	listeners.get('afterGameInit')({}, game)
	const economy = env.sandbox[ECONOMY_KEY]
	const result = await economy.requestOperation({ operation: 'build' }, function () { throw new Error('must not execute') })
	assert.equal(result.reason, 'ROLLBACK_FAILED')
	assert.equal(result.executed, false)
	assert.equal(economy.isInputBlocked(), true)
	assert.equal(economy.snapshot().writeBlockedReason, 'ROLLBACK_FAILED')
}

async function run() {
	testBlueprintIngressBoundaries()
	await testLibraryProblemsImportAndWriteLock()
	testPatchReplacementLifecycle()
	await testCreativeEntryHonorsWriteLock()
	console.log('World Editor 5C-8 hardening verification passed: schema 1-7 safe ingress, depth/dangerous-key/overflow rejection, Problems and no-write imports, replacement-safe patches, and cross-entry rollback lock.')
}

run().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
