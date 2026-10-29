const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const FOUNDATION_SOURCE = 'scripts/core/foundation.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const README_SOURCE = 'README.md'
const MANIFEST_SOURCE = 'mod.json'
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

const LANGUAGES = Object.freeze([
	'en', 'ru', 'de', 'ptbr', 'it', 'es', 'fr', 'nl', 'cz', 'pl',
	'jp', 'kr', 'sch', 'tch', 'thai', 'hu', 'lv', 'ro', 'no', 'modsch'
])
const TEXT_KEYS = Object.freeze([
	'shortcutCategoryWorldEditing',
	'shortcutToggleEditor',
	'shortcutCancelLayer',
	'shortcutAddSelection',
	'shortcutRemovePrimarySelection',
	'shortcutDisassembleSelection',
	'shortcutGenerateBlueprint',
	'shortcutCutSelection',
	'shortcutPlaceBlueprint',
	'shortcutRotateClockwise',
	'shortcutRotateCounterclockwise',
	'shortcutMirrorU',
	'shortcutMirrorV',
	'shortcutTemporaryPin',
	'shortcutUndo',
	'shortcutRedo',
	'shortcutCardOpacity',
	'shortcutContextOpenEditor',
	'shortcutContextCreateSelection',
	'shortcutContextOpenBlueprint',
	'shortcutContextNothingToUndo',
	'shortcutContextNothingToRedo',
	'shortcutContextShowEditableCard'
])

const EXPECTED = Object.freeze([
	{ id: 'toggle-editor', keys: ['V'], order: 10 },
	{ id: 'cancel-layer', keys: ['Esc'], order: 20 },
	{ id: 'add-selection', keys: ['Ctrl', 'Mouse1'], order: 30 },
	{ id: 'remove-primary-selection', keys: ['Backspace'], order: 40 },
	{ id: 'disassemble-selection', keys: ['Delete'], order: 50 },
	{ id: 'generate-blueprint', keys: ['Ctrl', 'C'], order: 60 },
	{ id: 'cut-selection', keys: ['Ctrl', 'X'], order: 70 },
	{ id: 'place-blueprint', keys: ['Ctrl', 'V'], order: 80 },
	{ id: 'rotate-clockwise', keys: ['R'], order: 90 },
	{ id: 'rotate-counterclockwise', keys: ['Shift', 'R'], order: 100 },
	{ id: 'mirror-u', keys: ['M'], order: 110 },
	{ id: 'mirror-v', keys: ['Shift', 'M'], order: 120 },
	{ id: 'temporary-pin', keys: ['Alt'], order: 130 },
	{ id: 'undo', keys: ['Ctrl', 'Z'], order: 140 },
	{ id: 'redo', keys: [['Ctrl', 'Y'], ['Ctrl', 'Shift', 'Z']], order: 150 },
	{ id: 'card-opacity', keys: [['Z', 'WheelUp'], ['Z', 'WheelDown']], order: 160 }
])

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

function loadI18n() {
	let definition = null
	const sandbox = {
		console: { info() {}, warn() {} },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(I18N_SOURCE), sandbox, { filename: I18N_SOURCE })
	assert.ok(definition, 'editor i18n module should register')
	definition.init()
	return sandbox[I18N_KEY]
}

function createObservable(snapshot) {
	const listeners = new Set()
	let disposed = 0
	return {
		snapshot,
		subscribe(listener) {
			listeners.add(listener)
			listener(snapshot())
			return function () {
				disposed += 1
				listeners.delete(listener)
			}
		},
		emit() {
			for (const listener of Array.from(listeners)) listener(snapshot())
		},
		disposedCount() {
			return disposed
		}
	}
}

function loadFoundation(i18n, withShortcutApi = true) {
	let definition = null
	const hooks = new Map()
	const timers = []
	const registrations = []
	let refreshes = 0
	let unregisters = 0
	let runtimeCleanup = null
	const state = {
		enabled: true,
		active: false,
		selectionCount: 0,
		canUndo: false,
		canRedo: false,
		previewActive: false,
		blueprint: null
	}
	const runtime = createObservable(function () {
		return { enabled: state.enabled, active: state.enabled && state.active }
	})
	runtime.isEnabled = function () { return state.enabled }
	runtime.isActive = function () { return state.enabled && state.active }
	runtime.addCleanup = function (cleanup) {
		runtimeCleanup = cleanup
		return function () { runtimeCleanup = null }
	}
	const selection = createObservable(function () {
		return { selectionCount: state.selectionCount }
	})
	const transactions = createObservable(function () {
		return { canUndo: state.canUndo, canRedo: state.canRedo }
	})
	const preview = createObservable(function () {
		return { active: state.previewActive }
	})
	const blueprint = createObservable(function () {
		return { blueprint: state.blueprint }
	})
	const shortcuts = {
		version: 1,
		register(options) {
			registrations.push(options)
			return {
				unregister() {
					unregisters += 1
				}
			}
		},
		refresh() {
			refreshes += 1
		}
	}
	const sandbox = {
		console: { info() {}, warn() {} },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		setTimeout(listener) {
			timers.push(listener)
			return timers.length
		},
		clearTimeout() {},
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	sandbox[I18N_KEY] = i18n
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[TRANSACTIONS_KEY] = transactions
	sandbox[PREVIEW_KEY] = preview
	sandbox[BLUEPRINT_KEY] = blueprint
	vm.createContext(sandbox)
	vm.runInContext(source(FOUNDATION_SOURCE), sandbox, { filename: FOUNDATION_SOURCE })
	assert.ok(definition, 'foundation module should register')
	const api = {
		id: 'Cattail_TweaksQuality_World-Editor',
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		}
	}
	if (withShortcutApi) api.ui = { shortcuts }
	definition.init(api)
	const game = { language: 'sch' }
	for (const listener of hooks.get('afterGameInit') || []) listener(undefined, game)
	while (timers.length) timers.shift()()
	return {
		game,
		state,
		registrations,
		services: [runtime, selection, transactions, preview, blueprint],
		refreshes() { return refreshes },
		unregisters() { return unregisters },
		cleanup() { runtimeCleanup?.() }
	}
}

function byId(result, id) {
	const entry = result.registrations.find(function (candidate) { return candidate.id === id })
	assert.ok(entry, 'missing shortcut entry: ' + id)
	return entry
}

const manifest = JSON.parse(source(MANIFEST_SOURCE))
assert.equal(manifest.version, '0.6.0', 'consumer registration must not bump the World Editor version')
assert.equal(manifest.loaderVersion, '>=0.4.0', 'feature detection must preserve older ModLoader compatibility')
assert.equal(manifest.entry.length, 47, 'shortcut hints must not add a manifest entry')

const foundationSource = source(FOUNDATION_SOURCE)
assert.doesNotMatch(foundationSource, /addEventListener\s*\(\s*['"](?:keydown|keyup|wheel|mousedown|mouseup)/, 'display-only registration must not add input handlers')

const i18n = loadI18n()
assert.deepEqual(Array.from(i18n.languages).sort(), Array.from(LANGUAGES).sort(), 'all 20 private World Editor languages should remain available')
for (const language of LANGUAGES) {
	for (const key of TEXT_KEYS) {
		const value = i18n.t(language, key)
		assert.equal(typeof value, 'string', language + ' ' + key + ' should be a string')
		assert.ok(value.trim(), language + ' ' + key + ' should not be empty')
		assert.notEqual(value, key, language + ' ' + key + ' should not expose the raw key')
	}
}
assert.equal(i18n.keys.length, 268, 'Shortcut-only text should not expand the existing public UI text catalog')
for (const key of TEXT_KEYS) assert.equal(i18n.keys.includes(key), false, key + ' should remain a private Shortcut API text key')
assert.equal(i18n.t('sch', 'shortcutCategoryWorldEditing'), '世界编辑', 'Simplified Chinese category label should be localized')
assert.equal(i18n.t('en', 'shortcutCategoryWorldEditing'), 'World Editing', 'English category label should be localized')

const result = loadFoundation(i18n)
assert.equal(result.registrations.length, 16, 'World Editor should register 16 functional shortcut hints')
const sharedCombinationIds = new Set(['cancel-layer', 'temporary-pin', 'card-opacity'])
for (const expected of EXPECTED) {
	const entry = byId(result, expected.id)
	assert.deepEqual(JSON.parse(JSON.stringify(entry.keys)), expected.keys, expected.id + ' should expose the approved chord or alternatives')
	assert.equal(entry.order, expected.order, expected.id + ' should keep the approved stable order')
	assert.equal(entry.category.id, 'world-editing', expected.id + ' should share one category')
	assert.equal(entry.category.order, 20, expected.id + ' should use category order 20')
	assert.equal(entry.category.label(), '世界编辑', expected.id + ' category should follow live game language')
	assert.equal(typeof entry.description, 'function', expected.id + ' should localize at render time')
	assert.ok(entry.description().trim(), expected.id + ' should have a localized description')
	assert.equal(typeof entry.visible, 'function', expected.id + ' should use dynamic visibility')
	assert.equal(typeof entry.active, 'function', expected.id + ' should use dynamic availability')
	assert.equal(entry.allowSharedCombination, sharedCombinationIds.has(expected.id), expected.id + ' should declare only approved shared combinations')
}
result.game.language = 'en'
assert.equal(byId(result, 'toggle-editor').category.label(), 'World Editing', 'category should update when the live game language changes')
assert.equal(byId(result, 'toggle-editor').description(), 'Toggle World Editor', 'description should update when the live game language changes')
result.game.language = 'sch'

assert.equal(byId(result, 'toggle-editor').active(), true, 'V should remain available while the Mod is enabled')
assert.equal(byId(result, 'cancel-layer').active(), false, 'Esc should be inactive while the editor is closed')
assert.equal(byId(result, 'cancel-layer').context(), '请先打开世界编辑器', 'editor-only entries should explain how to become available')
assert.equal(byId(result, 'add-selection').active(), false, 'selection input should require an active editor')
assert.equal(byId(result, 'remove-primary-selection').active(), false, 'selection actions should require a selection')
assert.equal(byId(result, 'place-blueprint').active(), false, 'blueprint placement should require a preview')
assert.equal(byId(result, 'undo').active(), false, 'undo should reflect transaction state')
assert.equal(byId(result, 'redo').active(), false, 'redo should reflect transaction state')
assert.equal(byId(result, 'card-opacity').active(), false, 'card opacity should require an editable card')

result.state.active = true
assert.equal(byId(result, 'remove-primary-selection').context(), '请先创建选区', 'selection actions should explain their missing selection')
assert.equal(byId(result, 'place-blueprint').context(), '请先打开蓝图预览', 'blueprint actions should explain their missing preview')
assert.equal(byId(result, 'undo').context(), '没有可撤销的编辑', 'undo should explain empty history')
assert.equal(byId(result, 'redo').context(), '没有可重做的编辑', 'redo should explain empty history')
assert.equal(byId(result, 'card-opacity').context(), '请先显示选区或蓝图卡片', 'card opacity should explain its missing target card')
result.state.selectionCount = 2
result.state.previewActive = true
result.state.blueprint = { version: 1 }
result.state.canUndo = true
result.state.canRedo = true
assert.equal(byId(result, 'add-selection').active(), true)
assert.equal(byId(result, 'remove-primary-selection').active(), true)
assert.equal(byId(result, 'disassemble-selection').active(), true)
assert.equal(byId(result, 'generate-blueprint').active(), true)
assert.equal(byId(result, 'cut-selection').active(), true)
assert.equal(byId(result, 'place-blueprint').active(), true)
assert.equal(byId(result, 'rotate-clockwise').active(), true)
assert.equal(byId(result, 'rotate-counterclockwise').active(), true)
assert.equal(byId(result, 'mirror-u').active(), true)
assert.equal(byId(result, 'mirror-v').active(), true)
assert.equal(byId(result, 'temporary-pin').active(), true)
assert.equal(byId(result, 'undo').active(), true)
assert.equal(byId(result, 'redo').active(), true)
assert.equal(byId(result, 'card-opacity').active(), true)

result.state.enabled = false
for (const entry of result.registrations) assert.equal(entry.visible(), false, entry.id + ' should hide when the Mod is disabled')

const beforeRefresh = result.refreshes()
for (const service of result.services) service.emit()
assert.ok(result.refreshes() >= beforeRefresh + result.services.length, 'state changes should refresh the open shortcut panel')
result.cleanup()
assert.equal(result.unregisters(), 16, 'runtime cleanup should unregister every hint')
for (const service of result.services) assert.equal(service.disposedCount(), 1, 'runtime cleanup should detach state subscriptions')

assert.doesNotThrow(function () {
	const unsupported = loadFoundation(i18n, false)
	assert.equal(unsupported.registrations.length, 0)
}, 'World Editor should keep working when ModLoader has no Shortcut API')

const readme = source(README_SOURCE)
assert.match(readme, /Shortcut API/i, 'README should document Shortcut API integration')
assert.match(readme, /16/, 'README should document the 16 registered functional entries')
assert.match(readme, /display-only/i, 'README should preserve the display-only boundary')

console.info('World Editor shortcut hint contract passed: 16 localized functional shortcuts, dynamic contexts, feature detection, refresh, and cleanup.')
