const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { MemoryLibraryHandle, clone, waitFor } = require('./helpers/library-api-harness')

const MOD_ROOT = path.resolve(__dirname, '..')
const STATE_SOURCE = 'scripts/core/blueprint-state.js'
const FORMAT_SOURCE = 'scripts/core/blueprint-library-format.js'
const LIBRARY_SOURCE = 'scripts/core/blueprint-library.js'
const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
const LIBRARY_KEY = Symbol.for('cattail.world-editor.blueprint-library')
const SESSION_KEY = Symbol.for('cattail.world-editor.blueprint')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function fullBlueprint(marker = 'one') {
	return {
		schemaVersion: 6,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [{ id: 1, min: [0, 0], max: [2, 0] }],
		contentBounds: { min: [0, 0], max: [2, 0], width: 3, height: 1 },
		includeBlocks: true,
		entities: [{ id: 1, kind: 'entity', name: 'pump', position: [0, 0], footprint: { span: 0, min: [0, 0], max: [0, 0] }, state: { depth: 2, marker } }],
		blocks: [{ kind: 'cube', name: 'cube', position: [1, 0], state: { state: 2, fill: 64, resources: [1, 2] } }],
		surges: [{ kind: 'surge', name: 'surge', position: [2, 0], state: { resources: [3], rayNumber: 2, grade: 1, colors: ['#fff'], type: 0, maxLife: 100, life: 90 } }],
		emptyCells: [],
		production: null,
		summary: { entityCount: 1, blockCount: 1, surgeCount: 1, marker }
	}
}

function createSession(blueprint = fullBlueprint()) {
	let state = {
		sourceBlueprint: clone(blueprint),
		dirty: true,
		origin: null
	}
	const calls = []
	return {
		calls,
		snapshot() { return state },
		markSaved(origin, reason) {
			state = Object.assign({}, state, { dirty: false, origin: clone(origin) })
			calls.push({ kind: 'saved', origin: clone(origin), reason })
			return true
		},
		loadSource(next, origin, reason) {
			state = { sourceBlueprint: clone(next), dirty: false, origin: clone(origin) }
			calls.push({ kind: 'loaded', origin: clone(origin), reason })
			return state
		},
		setSource(next, dirty = true) {
			state = Object.assign({}, state, { sourceBlueprint: clone(next), dirty: !!dirty })
		},
		setDirty(dirty) {
			state = Object.assign({}, state, { dirty: !!dirty })
		}
	}
}

async function createEnvironment(options = {}) {
	const definitions = []
	const hooks = new Map()
	const cleanups = []
	const handle = new MemoryLibraryHandle({
		extensions: ['.64schem', '.cattail-blueprint.json'],
		watchEnabled: options.watchEnabled !== false
	})
	let uuidSequence = 0
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		ModLoader: { register(value) { definitions.push(value) } },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Date,
		Error,
		TypeError,
		Uint8Array,
		setTimeout,
		clearTimeout,
		crypto: {
			randomUUID() {
				uuidSequence += 1
				return '10000000-0000-4000-8000-' + String(uuidSequence).padStart(12, '0')
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	for (const relativePath of [STATE_SOURCE, FORMAT_SOURCE, LIBRARY_SOURCE]) {
		vm.runInContext(source(relativePath), sandbox, { filename: relativePath })
	}
	const api = {
		storage: {
			libraries: {
				version: '1.1.0',
				open(id) {
					assert.equal(id, 'blueprints')
					return handle
				}
			}
		},
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	}
	for (const definition of definitions) definition.init(api)
	const session = createSession(options.blueprint)
	let transformState = Object.assign({ rotation: 0, mirrorU: false, mirrorV: false }, options.defaultTransform)
	const transformCalls = []
	const transform = {
		calls: transformCalls,
		snapshot() { return clone(transformState) },
		restore(value, reason) {
			transformState = Object.assign({ rotation: 0, mirrorU: false, mirrorV: false }, clone(value))
			transformCalls.push({ value: clone(transformState), reason })
			return true
		},
		set(value) { transformState = Object.assign({ rotation: 0, mirrorU: false, mirrorV: false }, clone(value)) }
	}
	const game = { id: 'test-game' }
	sandbox[SESSION_KEY] = session
	sandbox[TRANSFORM_KEY] = transform
	sandbox[RUNTIME_KEY] = {
		game,
		addCleanup(callback) { cleanups.push(callback) }
	}
	for (const listener of hooks.get('afterGameInit') || []) listener({}, game)
	const controller = await waitFor(
		() => sandbox[LIBRARY_KEY]?.snapshot().ready && sandbox[LIBRARY_KEY],
		'Blueprint library controller did not initialize.'
	)
	return {
		sandbox,
		format: sandbox[FORMAT_KEY],
		stateService: sandbox[STATE_KEY],
		controller,
		handle,
		session,
		transform,
		dispose() {
			for (const cleanup of cleanups.splice(0).reverse()) cleanup()
			controller.dispose('test-complete')
		}
	}
}

async function expectCode(code, operation) {
	await assert.rejects(operation, error => error?.code === code)
}

async function testFormatAndExplicitSave() {
	const env = await createEnvironment({ defaultTransform: { rotation: 90, mirrorU: true, mirrorV: false } })
	assert.equal(env.controller.version, '0.5.1')
	assert.equal(env.format.librarySchemaVersion, 2)
	assert.equal(env.controller.snapshot().active.length, 0)
	assert.equal(env.handle.operations.length, 0, 'capture/session creation must not write a library file')
	assert.equal(env.controller.snapshot().capabilities.pathsExposed, false)
	assert.equal(env.controller.snapshot().watchAvailable, true)

	const saved = await env.controller.saveCurrent({ displayName: 'Pump / Cube : Surge' })
	assert.equal(saved.envelope.blueprint.schemaVersion, 6)
	assert.equal(saved.envelope.blueprint.mode, 'full')
	assert.equal(saved.envelope.librarySchemaVersion, 2)
	assert.deepEqual(clone(saved.envelope.defaultTransform), { rotation: 90, mirrorU: true, mirrorV: false })
	assert.equal(saved.metadata.entityCount, 1)
	assert.equal(saved.metadata.blockCount, 1)
	assert.equal(saved.metadata.surgeCount, 1)
	assert.equal(saved.metadata.width, 1)
	assert.equal(saved.metadata.height, 3)
	assert.deepEqual(clone(saved.metadata.defaultTransform), { rotation: 90, mirrorU: true, mirrorV: false })
	assert.match(saved.name, /^Pump Cube Surge__[0-9a-f]{32}\.64schem$/)
	assert.equal(env.session.snapshot().dirty, false)
	assert.equal(env.session.snapshot().origin.id, saved.envelope.id)
	assert.equal(env.handle.operations.filter(entry => entry.kind === 'write').length, 1)

	const raw = env.handle.record('active', saved.name).data
	const parsed = env.format.parse(raw)
	assert.equal(parsed.id, saved.envelope.id)
	assert.equal(parsed.gameId, 'sixty-four')
	assert.deepEqual(clone(parsed.defaultTransform), { rotation: 90, mirrorU: true, mirrorV: false })
	assert.ok(Object.isFrozen(parsed))
	assert.ok(Object.isFrozen(parsed.defaultTransform))
	const legacy = clone(parsed)
	legacy.librarySchemaVersion = 1
	delete legacy.defaultTransform
	const parsedLegacy = env.format.parse(legacy)
	assert.equal(parsedLegacy.librarySchemaVersion, 1)
	assert.deepEqual(clone(parsedLegacy.defaultTransform), { rotation: 0, mirrorU: false, mirrorV: false })
	assert.equal(JSON.parse(env.format.serialize(parsedLegacy)).librarySchemaVersion, 2)
	assert.throws(() => env.format.parse(Object.assign({}, legacy, { librarySchemaVersion: 3 })), error => error?.code === 'INCOMPATIBLE')
	assert.throws(() => env.format.parse(Object.assign({}, clone(parsed), { gameId: 'another-game' })), error => error?.code === 'INCOMPATIBLE')
	assert.throws(() => env.format.create({ displayName: 'bad', blueprint: Object.assign(fullBlueprint(), { surges: undefined }) }), error => error?.code === 'BLUEPRINT_INVALID')
	env.dispose()
}

async function testLifecycleConflictsProblemsAndOverwriteLoad() {
	const env = await createEnvironment()
	const first = await env.controller.saveCurrent({ displayName: 'Shared name' })
	const duplicate = await env.controller.duplicate(first, 'Shared name')
	assert.notEqual(duplicate.envelope.id, first.envelope.id)
	assert.notEqual(duplicate.name, first.name)
	assert.deepEqual(clone(duplicate.envelope.defaultTransform), clone(first.envelope.defaultTransform))

	const firstId = first.envelope.id
	const renamed = await env.controller.rename(first, 'Renamed blueprint')
	assert.equal(renamed.envelope.id, firstId)
	assert.match(renamed.name, /^Renamed blueprint__/)
	assert.deepEqual(clone(renamed.envelope.defaultTransform), clone(first.envelope.defaultTransform))
	assert.ok(env.controller.snapshot().trash.length >= 1, 'rename replacement should leave a recoverable backup')

	env.transform.set({ rotation: 270, mirrorU: false, mirrorV: true })
	env.session.setSource(fullBlueprint('replacement'))
	const replaced = await env.controller.saveCurrent({ replace: true, entry: renamed })
	assert.equal(replaced.envelope.id, firstId)
	assert.equal(replaced.envelope.blueprint.summary.marker, 'replacement')
	assert.deepEqual(clone(replaced.envelope.defaultTransform), { rotation: 270, mirrorU: false, mirrorV: true })
	assert.ok(env.controller.snapshot().trash.length >= 2, 'replacement should preserve the previous revision in trash')

	const stale = replaced
	const externallyChanged = env.format.create({
		id: stale.envelope.id,
		displayName: stale.envelope.displayName,
		createdAt: stale.envelope.createdAt,
		blueprint: fullBlueprint('external')
	})
	env.handle.externalWrite(stale.name, env.format.serialize(externallyChanged))
	await expectCode('REVISION_CONFLICT', () => env.controller.rename(stale, 'Must conflict'))
	await env.controller.refresh('after-conflict')
	assert.equal(env.controller.snapshot().active.find(entry => entry.envelope?.id === firstId).envelope.blueprint.summary.marker, 'external')

	const corruptName = 'External corrupt__deadbeef.cattail-blueprint.json'
	env.handle.externalWrite(corruptName, '{broken json')
	await waitFor(() => env.controller.snapshot().problems.some(entry => entry.name === corruptName), 'External corruption was not surfaced.')
	const problem = env.controller.snapshot().problems.find(entry => entry.name === corruptName)
	assert.equal(problem.error.code, 'CORRUPT')
	await env.controller.retry(problem)
	const quarantined = await env.controller.quarantine(problem)
	assert.equal(quarantined.area, 'quarantine')
	const quarantineEntry = env.controller.snapshot().quarantine.find(entry => entry.name === corruptName)
	assert.ok(quarantineEntry)
	await env.controller.remove(quarantineEntry)
	assert.equal(env.controller.snapshot().quarantine.length, 0)

	const activeDuplicate = env.controller.snapshot().active.find(entry => entry.envelope?.id === duplicate.envelope.id)
	await env.controller.trash(activeDuplicate)
	const trashedDuplicate = env.controller.snapshot().trash.find(entry => entry.envelope?.id === duplicate.envelope.id)
	assert.ok(trashedDuplicate)
	await env.controller.restore(trashedDuplicate)
	assert.ok(env.controller.snapshot().active.some(entry => entry.envelope?.id === duplicate.envelope.id))

	env.session.setDirty(true)
	const loadTarget = env.controller.snapshot().active.find(entry => entry.envelope?.id === duplicate.envelope.id)
	const loaded = await env.controller.load(loadTarget)
	assert.equal(loaded.id, duplicate.envelope.id)
	assert.equal(env.session.calls.at(-1).kind, 'loaded')
	assert.equal(env.session.snapshot().dirty, false)
	assert.deepEqual(env.transform.calls.at(-1), {
		value: clone(duplicate.envelope.defaultTransform),
		reason: 'library-load-default-transform'
	})

	await env.controller.openFolder({ area: 'active' })
	assert.deepEqual(env.handle.openFolderCalls.at(-1), { area: 'active' })
	env.dispose()
}

async function testManualRefreshFallback() {
	const env = await createEnvironment({ watchEnabled: false })
	assert.equal(env.controller.snapshot().watchAvailable, false)
	const envelope = env.format.create({ displayName: 'Manual refresh', blueprint: fullBlueprint('manual') })
	const name = env.format.fileName(envelope.displayName, envelope.id)
	env.handle.externalWrite(name, env.format.serialize(envelope))
	await new Promise(resolve => setTimeout(resolve, 0))
	assert.equal(env.controller.snapshot().active.length, 0)
	await env.controller.refresh('manual-refresh-test')
	assert.equal(env.controller.snapshot().active.length, 1)
	assert.equal(env.controller.snapshot().active[0].envelope.id, envelope.id)
	env.dispose()
}

async function run() {
	await testFormatAndExplicitSave()
	await testLifecycleConflictsProblemsAndOverwriteLoad()
	await testManualRefreshFallback()
	console.log('World Editor 5A library verification passed: explicit saves, schema-6 envelopes, library schema-2 default transforms with schema-1 compatibility, stable IDs, revisions/backups, rename/duplicate, trash/restore, quarantine/remove, overwrite loads, watcher refresh, and manual fallback.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
