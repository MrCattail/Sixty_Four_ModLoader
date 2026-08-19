const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const FILES = [
	'scripts/core/paint-cube-state.js',
	'scripts/core/blueprint-painted.js',
	'scripts/core/blueprint-state.js',
	'scripts/core/blueprint-library-format.js',
	'scripts/core/blueprint-transform.js'
]
const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
const PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function environment(files = FILES) {
	const definitions = []
	const sandbox = {
		console: { info() {}, warn() {} },
		ModLoader: { register(definition) { definitions.push(definition) } }
	}
	vm.createContext(sandbox)
	for (const relative of files) {
		vm.runInContext(fs.readFileSync(path.join(MOD_ROOT, relative), 'utf8'), sandbox, { filename: relative })
		const definition = definitions.shift()
		assert.ok(definition, relative)
		definition.init({ on() {}, patch() {} })
	}
	return sandbox
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function record(save, position = save.position) {
	return { kind: 'painted-cube', name: 'cube', position: plain(position), state: plain(save.par) }
}

function blueprint(records) {
	return {
		schemaVersion: 7,
		mode: 'full',
		sourcePlane: 0,
		anchor: { position: [0, 0], selectionIds: [1] },
		selections: [],
		emptyCells: [],
		contentBounds: { min: [0, 0], max: [8, 8], width: 9, height: 9 },
		includeBlocks: true,
		entities: [],
		blocks: [],
		paintedCubes: records,
		surges: [],
		production: null,
		summary: {}
	}
}

function testSchemaSevenRoundTripAndTransform() {
	const env = environment()
	const paint = env[PAINT_KEY]
	const adapter = env[PAINTED_KEY]
	const state = env[STATE_KEY]
	const format = env[FORMAT_KEY]
	const transform = env[TRANSFORM_KEY]
	const recipe = { weights: [{ resource: 0, weight: 2 }, { resource: 4, weight: 3 }] }
	const stable = record(paint.buildStableCubeSave([2, 3], recipe))
	const grow = record(paint.buildGrowCubeSave([4, 5], recipe, 4000, 'source-lineage-01'))
	const legacy = record({
		name: 'cube',
		position: [6, 7],
		par: {
			state: 2,
			fill: 64,
			broken: 0,
			resources: new Array(64).fill(0),
			worldEditorPaint: {
				version: 1,
				kind: 'world-editor-painted-cube',
				reward: 'none',
				mode: 'stable',
				recipe: { version: 1, weights: [{ resource: 0, weight: 1 }], totalWeight: 1 },
				generated: { algorithm: 'fixed-slots-v1', slots: 64 }
			}
		}
	})
	const source = blueprint([legacy, stable, grow])
	for (const expected of source.paintedCubes) {
		const entity = Object.assign({ name: 'cube', position: plain(expected.position) }, plain(expected.state))
		assert.deepEqual(plain(adapter.capture(entity, expected.position)), plain(expected))
	}
	const normalized = state.normalizeBlueprint(source)
	assert.equal(normalized.schemaVersion, 7)
	assert.equal(normalized.paintedCubes.length, 3)
	assert.equal(normalized.blocks.length, 0)
	assert.equal(normalized.summary.paintedCubeCount, 3)
	assert.deepEqual(plain(normalized.paintedCubes.map(function (entry) {
		return entry.state.worldEditorPaint.version
	})), [1, 2, 3])

	const envelope = format.create({
		id: '12345678-1234-4123-8123-123456789abc',
		displayName: 'Painted round trip',
		createdAt: '2026-08-07T00:00:00.000Z',
		modifiedAt: '2026-08-07T00:00:00.000Z',
		blueprint: source
	})
	const parsed = format.parse(format.serialize(envelope))
	assert.deepEqual(plain(parsed.blueprint.paintedCubes), plain(normalized.paintedCubes))
	assert.equal(format.metadata(parsed).paintedCubeCount, 3)
	assert.equal(format.metadata(parsed).paintedCompatible, true)

	transform.bind(parsed.blueprint, 'schema7-test')
	transform.setExecutionMode('full', 'schema7-test')
	transform.rotateClockwise('schema7-test')
	const rotated = plain(transform.snapshot().blueprint.paintedCubes)
	assert.equal(rotated.length, 3)
	assert.notDeepEqual(rotated.map(function (entry) { return entry.position }), source.paintedCubes.map(function (entry) { return entry.position }))
	assert.deepEqual(rotated.map(function (entry) { return entry.state }), source.paintedCubes.map(function (entry) { return entry.state }))
}

function testStrictFailuresAndSchemaSixBoundary() {
	const env = environment()
	const paint = env[PAINT_KEY]
	const adapter = env[PAINTED_KEY]
	const state = env[STATE_KEY]
	const format = env[FORMAT_KEY]
	const valid = record(paint.buildStableCubeSave([1, 1]))
	assert.ok(adapter.normalizeRecord(valid))

	const future = plain(valid)
	future.state.worldEditorPaint.version = 99
	assert.equal(adapter.normalizeRecord(future), null)
	const extra = plain(valid)
	extra.state.unexpected = true
	assert.equal(adapter.normalizeRecord(extra), null)
	assert.equal(state.normalizeBlueprint(blueprint([valid, plain(valid)])), null)
	const overlap = blueprint([valid])
	overlap.blocks.push({ kind: 'cube', name: 'cube', position: [1, 1], state: { state: 2, resources: [] } })
	assert.equal(state.normalizeBlueprint(overlap), null)
	const smuggledBlock = blueprint([valid])
	smuggledBlock.blocks.push({ kind: 'cube', name: 'cube', position: [2, 2], state: plain(valid.state) })
	assert.equal(state.normalizeBlueprint(smuggledBlock), null)
	assert.throws(function () { format.create({ blueprint: blueprint([future]) }) }, /invalid|unsupported/i)

	const schemaSix = blueprint([])
	schemaSix.schemaVersion = 6
	delete schemaSix.paintedCubes
	assert.equal(state.normalizeBlueprint(schemaSix).schemaVersion, 6)
	const smuggled = plain(schemaSix)
	smuggled.paintedCubes = [valid]
	assert.equal(state.normalizeBlueprint(smuggled), null)

	const missingDependency = environment([
		'scripts/core/blueprint-painted.js',
		'scripts/core/blueprint-state.js'
	])
	assert.equal(missingDependency[PAINTED_KEY].ready(), false)
	assert.equal(missingDependency[STATE_KEY].normalizeBlueprint(blueprint([valid])), null)
}

function testTwentyLanguageUiContract() {
	const env = environment(['scripts/i18n/editor-text.js'])
	const i18n = env[I18N_KEY]
	assert.equal(i18n.languages.length, 20)
	for (const language of i18n.languages) {
		assert.ok(i18n.t(language, 'blueprintPaintedCount').includes('{count}'), language)
		assert.ok(i18n.t(language, 'blueprintPaintedCompatibility').trim(), language)
	}
	const libraryUi = fs.readFileSync(path.join(MOD_ROOT, 'scripts/ui/blueprint-library-ui.js'), 'utf8')
	const session = fs.readFileSync(path.join(MOD_ROOT, 'scripts/blueprint-session.js'), 'utf8')
	assert.match(libraryUi, /paintedCubeCount/)
	assert.match(libraryUi, /paintedCompatibility/)
	assert.match(session, /placementOptionsTitle[\s\S]*blueprintPaintedCompatibility/)
	assert.match(session, /function hasCubeLayer\(value\)[\s\S]*value\?\.blocks[\s\S]*value\?\.paintedCubes/)
	assert.match(session, /includeBlocks:\s*hasCubeLayer\(normalized\)/)
	assert.match(session, /setIncludeBlocks\(next, reason\)[\s\S]*!hasCubeLayer\(sourceBlueprint\)/)
	assert.match(session, /blocksAvailable\s*=\s*creativeAvailable\s*&&\s*state\.mode\s*===\s*'full'\s*&&\s*hasCubeLayer\(state\.sourceBlueprint\)/)
}

function testNoHiddenRecordCap() {
	const env = environment()
	const paint = env[PAINT_KEY]
	const state = env[STATE_KEY]
	const template = record(paint.buildStableCubeSave([0, 0]))
	const records = []
	for (let index = 0; index < 31000; index += 1) {
		const next = plain(template)
		next.position = [index, 0]
		records.push(next)
	}
	const largeBlueprint = blueprint(records)
	const encodedBytes = Buffer.byteLength(JSON.stringify(largeBlueprint), 'utf8')
	assert.ok(encodedBytes > 14 * 1024 * 1024)
	assert.ok(encodedBytes < 16 * 1024 * 1024)
	assert.equal(state.normalizeBlueprint(largeBlueprint).paintedCubes.length, 31000)
	const source = fs.readFileSync(path.join(MOD_ROOT, 'scripts/core/blueprint-painted.js'), 'utf8')
	assert.doesNotMatch(source, /4096|16384|65536|MAX_(?:PAINTED|RECORD)/)
}

testSchemaSevenRoundTripAndTransform()
testStrictFailuresAndSchemaSixBoundary()
testNoHiddenRecordCap()
testTwentyLanguageUiContract()
console.log('World Editor 5C-7 painted blueprint format/security verification passed.')
