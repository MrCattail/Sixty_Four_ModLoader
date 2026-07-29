const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHARED_SOURCE = 'scripts/core/shared.js'
const BLUEPRINT_SOURCE = 'scripts/blueprint-session.js'
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')

function range(start, end) {
	const minU = Math.min(start[0], end[0])
	const maxU = Math.max(start[0], end[0])
	const minV = Math.min(start[1], end[1])
	const maxV = Math.max(start[1], end[1])
	return {
		start: start.slice(),
		end: end.slice(),
		minU,
		maxU,
		minV,
		maxV,
		width: maxU - minU + 1,
		height: maxV - minV + 1
	}
}

function selectionState(entries, primaryId) {
	return {
		version: '0.2.6',
		selections: entries,
		primaryId,
		selectionCount: entries.length,
		selectedRange: entries.find(entry => entry.id === primaryId)?.range || null,
		previewRange: null,
		plane: entries.find(entry => entry.id === primaryId)?.plane ?? null
	}
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function createWindow(clipboard) {
	const listeners = new Map()
	return {
		navigator: {
			clipboard
		},
		addEventListener(type, listener, capture = false) {
			if (!listeners.has(type)) listeners.set(type, [])
			listeners.get(type).push({ listener, capture })
		},
		removeEventListener(type, listener, capture = false) {
			const current = listeners.get(type) || []
			listeners.set(type, current.filter(entry => entry.listener !== listener || entry.capture !== capture))
		},
		dispatch(type, event) {
			for (const entry of (listeners.get(type) || []).slice()) entry.listener(event)
		},
		listenerCount(type) {
			return (listeners.get(type) || []).length
		}
	}
}

function createRuntime(game) {
	let active = true
	const listeners = new Set()
	const cleanups = []
	return {
		game,
		snapshot() {
			return { active }
		},
		isActive() {
			return active
		},
		subscribe(listener) {
			listeners.add(listener)
			listener({ active })
			return () => listeners.delete(listener)
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		setActive(next) {
			active = !!next
			for (const listener of Array.from(listeners)) listener({ active })
		},
		runCleanups() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

function createSelection(game, initial) {
	let current = initial
	const listeners = new Set()
	return {
		game,
		snapshot() {
			return plain(current)
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(plain(current))
			return () => listeners.delete(listener)
		},
		set(next) {
			current = next
			for (const listener of Array.from(listeners)) listener(plain(current))
		}
	}
}

function createGame() {
	const cells = new Map()
	const game = {
		plane: 0,
		splash: { isShown: false },
		codex: {
			entities: {
				silo: { canPurchase: true },
				strange1: { canPurchase: true, onlyone: true },
				pump: { canPurchase: true },
				bad: { canPurchase: true },
				hollow: { canPurchase: false },
				modtower: { canPurchase: true }
			},
			resources: [
				{ triplet: ['#334455', '#668899', '#bbddff'] },
				{ triplet: ['#553322', '#996644', '#ffbb77'] }
			]
		},
		entityAtCoordinates(position) {
			return cells.get(position[0] + ':' + position[1]) || null
		},
		uvToXY(position) {
			return [(position[0] - position[1]) * 10, (position[0] + position[1]) * 5]
		},
		getEntityString(entity) {
			if (entity.throwSave) throw new Error('save failed')
			return {
				name: entity.name,
				position: entity.position.slice(),
				par: plain(entity.par || {})
			}
		},
		pronounce(section, name) {
			return section === 'entities' ? name.toUpperCase() : name
		}
	}
	game.setCell = function (u, v, entity) {
		cells.set(u + ':' + v, entity)
	}
	return game
}

function createEnvironment(options = {}) {
	const definitions = []
	const handlers = new Map()
	const writes = []
	let clipboardFailure = false
	const frameQueue = []
	const clipboard = {
		async writeText(value) {
			if (clipboardFailure) throw new Error('clipboard failed')
			writes.push(String(value))
		}
	}
	const game = options.game || createGame()
	const initialSelection = options.selection || selectionState([
		{ id: 1, primary: true, plane: 0, range: range([0, 0], [0, 0]) }
	], 1)
	const selection = createSelection(game, initialSelection)
	const runtime = createRuntime(game)
	const window = createWindow(clipboard)
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
		},
		window,
		setTimeout,
		clearTimeout,
		requestAnimationFrame(callback) {
			frameQueue.push(callback)
			return frameQueue.length
		}
	}
	vm.createContext(sandbox)
	for (const source of [SHARED_SOURCE, BLUEPRINT_SOURCE]) {
		const filename = path.join(MOD_ROOT, source)
		vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	}
	assert.equal(definitions.length, 2)

	const api = {
		state: {
			entityPatches: {
				modtower: { modId: 'example-mod' }
			}
		},
		on(name, listener) {
			if (!handlers.has(name)) handlers.set(name, [])
			handlers.get(name).push(listener)
		},
		emit(name, ...args) {
			for (const listener of handlers.get(name) || []) listener(...args)
		}
	}
	definitions[0].init(api)
	definitions[1].init(api)
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[INTERACTION_KEY] = {
		snapshot() {
			return { gestureType: null }
		}
	}
	sandbox[I18N_KEY] = {
		t(languageOrGame, key) {
			return key
		}
	}
	api.emit('afterGameInit', {}, game)
	const session = sandbox[BLUEPRINT_KEY]
	assert.ok(session)
	return {
		api,
		sandbox,
		game,
		selection,
		runtime,
		session,
		window,
		writes,
		setClipboardFailure(next) {
			clipboardFailure = !!next
		},
		async flushFrames() {
			while (frameQueue.length) {
				frameQueue.shift()()
				await Promise.resolve()
			}
		}
	}
}

async function testStructureCaptureAndImmutability() {
	const state = selectionState([
		{ id: 1, primary: true, plane: 0, range: range([0, 0], [1, 1]) },
		{ id: 2, primary: false, plane: 0, range: range([1, 1], [1, 1]) }
	], 1)
	const env = createEnvironment({ selection: state })
	const silo = { name: 'silo', position: [0, 0], entitySpan: 0, par: { fill: 12 } }
	const hollow = { name: 'hollow', position: [1, 0], entitySpan: 0 }
	const modtower = { name: 'modtower', position: [0, 1], entitySpan: 0 }
	const wide = { name: 'strange1', position: [2, 2], entitySpan: 1, par: { state: 4 } }
	env.game.setCell(0, 0, silo)
	env.game.setCell(1, 0, hollow)
	env.game.setCell(0, 1, modtower)
	env.game.setCell(1, 1, wide)

	const result = await env.session.capture('test-structure')
	assert.equal(result.status, 'captured')
	assert.equal(result.clipboard, 'ready')
	assert.equal(env.writes.length, 1)
	assert.match(env.writes[0], /\n  "schemaVersion": 3,/)

	const blueprint = env.session.snapshot().blueprint
	assert.equal(env.session.version, '0.4.1')
	assert.equal(env.session.schemaVersion, 3)
	assert.equal(env.session.snapshot().version, '0.4.1')
	assert.equal(blueprint.schemaVersion, 3)
	assert.equal(blueprint.mode, 'structure')
	assert.equal(blueprint.sourcePlane, 0)
	assert.deepEqual(plain(blueprint.anchor), { position: [1, 1], selectionIds: [1, 2] })
	assert.equal(blueprint.selections.length, 2)
	assert.deepEqual(plain(blueprint.selections[0].min), [-1, -1])
	assert.deepEqual(plain(blueprint.selections[0].max), [0, 0])
	assert.deepEqual(plain(blueprint.selections[1].min), [0, 0])
	assert.equal(blueprint.summary.selectedCellCount, 4)
	assert.equal(blueprint.summary.entityCount, 2)
	assert.equal(blueprint.summary.blockCount, 0)
	assert.equal(blueprint.summary.crossBoundaryCount, 1)
	assert.equal(blueprint.summary.skippedCount, 2)
	assert.deepEqual(plain(blueprint.entities.map(entity => entity.name)), ['silo', 'strange1'])
	assert.deepEqual(plain(blueprint.entities[0].position), [-1, -1])
	assert.deepEqual(plain(blueprint.entities[1].position), [1, 1])
	assert.deepEqual(plain(blueprint.entities[1].footprint), {
		span: 1,
		min: [0, 0],
		max: [2, 2]
	})
	assert.equal(blueprint.entities[1].restricted.onlyOne, true)
	assert.equal(Object.hasOwn(blueprint.entities[0], 'state'), false)
	assert.deepEqual(plain(blueprint.contentBounds), {
		min: [-1, -1],
		max: [2, 2],
		width: 4,
		height: 4
	})
	assert.deepEqual(
		plain(blueprint.summary.skippedTypes.map(type => [type.name, type.reason, type.count])),
		[
			['hollow', 'unsupported', 1],
			['modtower', 'mod', 1]
		]
	)
	assert.equal(Object.isFrozen(blueprint), true)
	assert.equal(Object.isFrozen(blueprint.entities), true)
	assert.equal(Object.isFrozen(blueprint.entities[1].footprint), true)
	assert.equal(env.session.exportJSON(), env.writes[0])
}

async function testVisualRightAnchorProjectionAndFallbacks() {
	const disjointState = selectionState([
		{ id: 9, primary: true, plane: 0, range: range([4, 0], [4, 0]) },
		{ id: 3, primary: false, plane: 0, range: range([0, 4], [0, 4]) }
	], 9)
	const disjoint = createEnvironment({ selection: disjointState })
	disjoint.game.setCell(4, 0, { name: 'silo', position: [4, 0], entitySpan: 0 })
	disjoint.game.setCell(0, 4, { name: 'pump', position: [0, 4], entitySpan: 0 })
	const disjointResult = await disjoint.session.capture('test-disjoint-visual-right')
	assert.equal(disjointResult.status, 'captured')
	const disjointBlueprint = disjoint.session.snapshot().blueprint
	assert.deepEqual(plain(disjointBlueprint.anchor), {
		position: [4, 4],
		selectionIds: [3, 9]
	})
	assert.deepEqual(plain(disjointBlueprint.entities.map(entry => entry.position)), [
		[0, -4],
		[-4, 0]
	])
	disjoint.game.uvToXY = position => [position[1] * 100, position[0] * 100]
	assert.deepEqual(plain(disjoint.session.snapshot().blueprint.anchor.position), [4, 4])

	const tieGame = createGame()
	tieGame.uvToXY = position => [position[0] - position[1] * 0.2, position[1]]
	const tieState = selectionState([
		{ id: 6, primary: true, plane: 0, range: range([1, 2], [4, 6]) }
	], 6)
	const tie = createEnvironment({ game: tieGame, selection: tieState })
	tie.game.setCell(1, 2, { name: 'silo', position: [1, 2], entitySpan: 0 })
	assert.equal((await tie.session.capture('test-projection-tie')).status, 'captured')
	assert.deepEqual(plain(tie.session.snapshot().blueprint.anchor.position), [4, 6])

	const fallbacks = [
		game => {
			delete game.uvToXY
		},
		game => {
			game.uvToXY = function () {
				throw new Error('projection failed')
			}
		},
		game => {
			game.uvToXY = function () {
				return [Number.NaN, 0]
			}
		}
	]
	for (const configure of fallbacks) {
		const fallbackGame = createGame()
		configure(fallbackGame)
		const fallback = createEnvironment({ game: fallbackGame, selection: tieState })
		fallback.game.setCell(1, 2, { name: 'silo', position: [1, 2], entitySpan: 0 })
		assert.equal((await fallback.session.capture('test-projection-fallback')).status, 'captured')
		assert.deepEqual(plain(fallback.session.snapshot().blueprint.anchor.position), [4, 6])
	}
}

async function testFullCaptureCubeRulesAndFailureRetention() {
	const state = selectionState([
		{ id: 10, primary: true, plane: 0, range: range([5, 5], [7, 5]) }
	], 10)
	const env = createEnvironment({ selection: state })
	const pump = { name: 'pump', position: [5, 5], entitySpan: 0, par: { depth: 2, fill: 42 } }
	const stableCube = {
		name: 'cube',
		position: [6, 5],
		entitySpan: 0,
		state: 2,
		par: { resources: new Array(64).fill(0), fill: 64, state: 2, broken: 0.25 }
	}
	const unstableCube = {
		name: 'cube',
		position: [7, 5],
		entitySpan: 0,
		state: 1,
		par: { resources: new Array(64).fill(1), fill: 64, state: 1 }
	}
	env.game.setCell(5, 5, pump)
	env.game.setCell(6, 5, stableCube)
	env.game.setCell(7, 5, unstableCube)
	assert.equal(env.session.setMode('full', 'test'), true)
	assert.equal(env.session.setIncludeBlocks(true, 'test'), true)

	const fullResult = await env.session.capture('test-full')
	assert.equal(fullResult.status, 'captured')
	const fullBlueprint = env.session.snapshot().blueprint
	assert.equal(fullBlueprint.mode, 'full')
	assert.equal(fullBlueprint.includeBlocks, true)
	assert.equal(fullBlueprint.entities.length, 1)
	assert.deepEqual(plain(fullBlueprint.entities[0].state), { depth: 2, fill: 42 })
	assert.equal(fullBlueprint.blocks.length, 1)
	assert.equal(fullBlueprint.blocks[0].state.resources.length, 64)
	assert.equal(fullBlueprint.blocks[0].state.broken, 0.25)
	assert.equal(fullBlueprint.summary.skippedTypes[0].reason, 'unstable')

	env.selection.set(selectionState([
		{ id: 11, primary: true, plane: 0, range: range([6, 5], [6, 5]) }
	], 11))
	assert.equal(env.session.setMode('structure', 'test'), true)
	assert.equal(env.session.snapshot().includeBlocks, false)
	const writesBeforeEmpty = env.writes.length
	const emptyResult = await env.session.capture('test-structure-cube')
	assert.equal(emptyResult.status, 'empty')
	assert.strictEqual(env.session.snapshot().blueprint, fullBlueprint)
	assert.equal(env.writes.length, writesBeforeEmpty)

	env.selection.set(selectionState([
		{ id: 12, primary: true, plane: 0, range: range([8, 5], [8, 5]) }
	], 12))
	const bad = { name: 'bad', position: [8, 5], entitySpan: 1, throwSave: true }
	env.game.setCell(8, 5, bad)
	assert.equal(env.session.setMode('full', 'test'), true)
	const badResult = await env.session.capture('test-save-failure')
	assert.equal(badResult.status, 'empty')
	assert.strictEqual(env.session.snapshot().blueprint, fullBlueprint)
	assert.equal(badResult.skippedTypes[0].reason, 'unserializable')

	env.selection.set(selectionState([
		{ id: 13, primary: true, plane: 0, range: range([5, 5], [5, 5]) }
	], 13))
	env.setClipboardFailure(true)
	const failedClipboard = await env.session.capture('test-clipboard-failure')
	assert.equal(failedClipboard.status, 'captured')
	assert.equal(failedClipboard.clipboard, 'failed')
	assert.notStrictEqual(env.session.snapshot().blueprint, fullBlueprint)
	assert.equal(env.session.snapshot().blueprint.entities[0].name, 'pump')
}

async function testChunkCancellationHotkeyAndLifecycle() {
	const largeState = selectionState([
		{ id: 20, primary: true, plane: 0, range: range([0, 0], [1024, 0]) }
	], 20)
	const cancelledEnv = createEnvironment({ selection: largeState })
	const pending = cancelledEnv.session.capture('test-large')
	assert.equal(cancelledEnv.session.snapshot().capturing, true)
	assert.equal(cancelledEnv.session.cancelCapture('test-cancel'), true)
	await cancelledEnv.flushFrames()
	const cancelled = await pending
	assert.equal(cancelled.status, 'cancelled')
	assert.equal(cancelledEnv.session.snapshot().blueprint, null)

	const state = selectionState([
		{ id: 21, primary: true, plane: 0, range: range([2, 3], [2, 3]) }
	], 21)
	const env = createEnvironment({ selection: state })
	const silo = { name: 'silo', position: [2, 3], entitySpan: 0, par: { fill: 7 } }
	env.game.setCell(2, 3, silo)
	const event = {
		key: 'c',
		code: 'KeyC',
		ctrlKey: true,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		repeat: false,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true
		},
		stopImmediatePropagation() {},
		composedPath() {
			return []
		}
	}
	env.window.dispatch('keydown', event)
	await new Promise(resolve => setTimeout(resolve, 0))
	assert.equal(event.defaultPrevented, true)
	assert.equal(env.writes.length, 1)
	const blueprint = env.session.snapshot().blueprint
	assert.ok(blueprint)
	env.runtime.setActive(false)
	assert.strictEqual(env.session.snapshot().blueprint, blueprint)
	env.runtime.setActive(true)
	assert.strictEqual(env.session.snapshot().blueprint, blueprint)
	assert.equal(env.window.listenerCount('keydown'), 1)
	env.runtime.runCleanups()
	assert.equal(env.session.snapshot().disposed, true)
	assert.equal(env.sandbox[BLUEPRINT_KEY], undefined)
	assert.equal(env.window.listenerCount('keydown'), 0)
}

function testLanguagesManifestUiAndReadOnlyBoundary() {
	const i18nDefinitions = []
	const i18nSandbox = {
		ModLoader: {
			register(definition) {
				i18nDefinitions.push(definition)
			}
		}
	}
	vm.createContext(i18nSandbox)
	const i18nFilename = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
	vm.runInContext(fs.readFileSync(i18nFilename, 'utf8'), i18nSandbox, { filename: i18nFilename })
	i18nDefinitions[0].init()
	const i18n = i18nSandbox[I18N_KEY]
	assert.equal(i18n.version, '0.4.1')
	assert.equal(i18n.languages.length, 20)
	assert.equal(i18n.keys.length, 130)
	const blueprintKeys = [
		'blueprintModeStructure',
		'blueprintModeFull',
		'blueprintIncludeBlocks',
		'blueprintCopy',
		'blueprintCardTitle',
		'blueprintClear',
		'blueprintSourceReality',
		'blueprintSourceVoid',
		'blueprintCapturedTypes',
		'blueprintSkippedTypes',
		'blueprintCapturing',
		'blueprintClipboardWriting',
		'blueprintClipboardReady',
		'blueprintClipboardFailed',
		'blueprintNothingCaptured',
		'blueprintSelectionCount',
		'blueprintCrossBoundaryCount',
		'blueprintCrossBoundary',
		'blueprintCube'
	]
	for (const language of i18n.languages) {
		for (const key of blueprintKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key)
			assert.ok(translated.trim())
		}
	}

	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.4.1')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.equal(manifest.entry.length, 26)
	assert.ok(manifest.entry.includes(BLUEPRINT_SOURCE))
	assert.ok(
		manifest.entry.indexOf('scripts/ui/editor-shell.js') <
		manifest.entry.indexOf(BLUEPRINT_SOURCE)
	)

	const source = fs.readFileSync(path.join(MOD_ROOT, BLUEPRINT_SOURCE), 'utf8')
	const sharedSource = fs.readFileSync(path.join(MOD_ROOT, SHARED_SOURCE), 'utf8')
	assert.match(source, /schemaVersion:\s*3/)
	assert.match(source, /version:\s*'0\.4\.1'/)
	assert.match(source, /selectionIds:\s*source\.selectionIds/)
	assert.match(source, /typeof game\.uvToXY !== 'function'/)
	assert.match(source, /Object\.freeze/)
	assert.match(source, /JSON\.stringify\(normalized,\s*null,\s*2\)/)
	assert.match(source, /navigator\?\.clipboard\?\.writeText/)
	assert.match(source, /entityPatches/)
	assert.match(source, /definition\.canPurchase !== true/)
	assert.match(source, /name === 'cube'/)
	assert.match(source, /Number\(entity\.state\) !== 2/)
	assert.match(source, /SCAN_CHUNK_SIZE = 1024/)
	assert.match(source, /max-height:\s*min\(68vh,\s*calc\(100vh - 20px\)\)/)
	assert.match(source, /font:[^;]*Montserrat/)
	assert.match(source, /data-input-pass-through/)
	assert.match(source, /drawCubeThumbnail/)
	assert.match(sharedSource, /img\/shop\//)
	assert.match(source, /shared\.resolveEntityIcon\(game, name\)/)
	assert.doesNotMatch(source, /\baddEntity\s*\(/)
	assert.doesNotMatch(source, /\bclearCell\s*\(/)
	assert.doesNotMatch(source, /\brequestResources\s*\(/)
	assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b/)
	assert.doesNotMatch(source, /\brequire\s*\(\s*['"](?:fs|node:fs)['"]\s*\)/)
}

async function run() {
	await testStructureCaptureAndImmutability()
	await testVisualRightAnchorProjectionAndFallbacks()
	await testFullCaptureCubeRulesAndFailureRetention()
	await testChunkCancellationHotkeyAndLifecycle()
	testLanguagesManifestUiAndReadOnlyBoundary()
	console.log('3A/3C verification passed: immutable schema-3 session, projected outer-bounds visual-right anchor, sorted selection IDs, deterministic projection fallback, structure/full capture, multi-selection union, cross-boundary footprints, Mod and transient skips, stable Cube gating, clipboard success/failure, empty retention, chunk cancellation, lifecycle, 20-language UI, original-font card contract, manifest, and read-only boundary.')
}

run().catch(error => {
	console.error(error)
	process.exitCode = 1
})
