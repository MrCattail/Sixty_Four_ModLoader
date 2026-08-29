'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const readmePath = path.resolve(__dirname, '..', 'README.md')
const translationsPath = path.resolve(__dirname, '..', 'translations.json')
const source = fs.readFileSync(loaderPath, 'utf8')
const readme = fs.readFileSync(readmePath, 'utf8')
const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'))

assert.match(source, /version: '0\.5\.0'/)
assert.match(source, /const SHORTCUT_API_VERSION = 1/)
assert.match(source, /shortcuts: createUiShortcutsApi\(modId\)/)
assert.match(source, /const normalizeShortcutKeys = function/)
assert.match(source, /const registerShortcut = function/)
assert.match(source, /const updateShortcut = function/)
assert.match(source, /const unregisterShortcut = function/)
assert.match(source, /const createUiShortcutsApi = function/)
assert.match(source, /const renderShortcutPanel = function/)
assert.match(source, /const refreshShortcutLayout = function/)
assert.match(source, /const shortcutMutationAffectsLayout = function/)
assert.match(source, /if \(shortcutMutationAffectsLayout\(records\)\) requestShortcutRefresh\(\)/)
assert.match(source, /#modloader-shortcut-panel \{[^}]*direction:rtl;/)
assert.match(source, /\.modloader-shortcut-source \{[^}]*direction:ltr;/)
assert.match(source, /#modloader-shortcut-panel \{[^}]*text-shadow:none;/)
assert.match(source, /\.modloader-shortcut-source-title \{[^}]*font-size:18px;/)
assert.match(source, /\.modloader-shortcut-description \{[^}]*font-size:15px;/)
assert.match(source, /\.modloader-shortcut-key \{[^}]*min-width:32px;[^}]*height:30px;/)
assert.match(source, /\.modloader-shortcut-key \{[^}]*box-shadow:0 2px 0 #ffe0b5,0 3px 7px rgba\(0,0,0,\.22\);/)
assert.match(source, /\.modloader-shortcut-key-space \{[^}]*min-width:112px;/)
assert.match(source, /\.modloader-shortcut-space-mark \{[^}]*width:16px;[^}]*height:5px;[^}]*border:1\.5px solid #17181b;[^}]*border-top:0;[^}]*border-radius:0 0 3px 3px;/)
assert.match(source, /\.modloader-shortcut-row \{[^}]*min-height:37px;/)
assert.match(source, /modloader-shortcut-space-mark/)
assert.match(source, /modloader-shortcut-status-offset/)
assert.match(source, /registerGameHudItem\('ModLoader', \{ id: 'shortcut-tips-button'/)
assert.match(source, /shortcutTipsEnabled/)
assert.match(source, /shortcutTipsMods/)
assert.match(readme, /## Mod Keyboard Shortcut API v1/)
assert.match(readme, /api\.ui\.shortcuts\.register/)
assert.match(readme, /WheelUp/)
assert.match(readme, /Space/)
assert.match(readme, /Mouse interactions outside the list do not\s+close it/)
assert.match(readme, /`Esc` is not handled by the\s+shortcut list and remains available to the game without changing the list's open\s+state/)

const shortcutUiLifecycleSource = source.slice(source.indexOf('const ensureShortcutUi = function'), source.indexOf('const refreshShortcutUi = function'))
assert.ok(shortcutUiLifecycleSource, 'Shortcut UI lifecycle source exists')
assert.doesNotMatch(shortcutUiLifecycleSource, /document\.addEventListener\('pointerdown'/)
assert.doesNotMatch(shortcutUiLifecycleSource, /document\.addEventListener\('keydown'/)
assert.match(shortcutUiLifecycleSource, /const opening = !state\.shortcutOpen/)
assert.match(shortcutUiLifecycleSource, /if \(activeElement === button \|\| activeElement === panel\) activeElement\.blur\?\.\(\)/)

const shortcutRefreshSource = source.slice(source.indexOf('const refreshShortcutUi = function'), source.indexOf('const requestShortcutRefresh = function'))
assert.ok(shortcutRefreshSource, 'Shortcut UI refresh source exists')
assert.match(shortcutRefreshSource, /const available = entries\.length > 0 && state\.shortcutSettings\.enabled !== false && !mobile/)
assert.match(shortcutRefreshSource, /const show = available && !state\.vanillaGameHudHidden/)
assert.match(shortcutRefreshSource, /if \(!available\) state\.shortcutOpen = false/)
assert.doesNotMatch(shortcutRefreshSource, /if \(!show\) state\.shortcutOpen = false/)

const requiredTranslations = [
	'shortcutTips',
	'shortcutTipsEnabled',
	'shortcutTipsDisabled',
	'shortcutTipsMods',
	'shortcutTipsToggle',
	'shortcutSourceGame',
	'shortcutSourceModLoader',
	'shortcutSourceMods',
	'shortcutCategoryOther',
	'shortcutContextInactive'
]
const languageIds = Object.keys(translations.languages || {})
assert.equal(languageIds.length, 20, 'the catalog keeps all 20 ModLoader languages')
for (const languageId of languageIds) {
	const modloader = translations.languages[languageId]?.modloader
	assert.ok(modloader, `${languageId} has ModLoader translations`)
	for (const key of requiredTranslations) assert.equal(typeof modloader[key], 'string', `${languageId}.${key} is translated`)
}

const fakeClassList = function () {
	return { add() {}, remove() {}, toggle() { return false }, contains() { return false } }
}

const fakeNode = function (tagName) {
	return {
		tagName: String(tagName || '').toUpperCase(),
		id: '',
		className: '',
		style: { setProperty() {} },
		dataset: {},
		children: [],
		classList: fakeClassList(),
		isConnected: true,
		appendChild(child) { this.children.push(child); child.parentNode = this; return child },
		append(...children) { for (const child of children) this.appendChild(child) },
		remove() { this.isConnected = false },
		setAttribute() {},
		addEventListener() {},
		removeEventListener() {},
		querySelector() { return null },
		closest() { return null },
		getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } }
	}
}

const fakeDocument = {
	body: fakeNode('body'),
	head: fakeNode('head'),
	addEventListener() {},
	removeEventListener() {},
	createElement: fakeNode,
	getElementById() { return null },
	querySelector() { return null }
}

const sandbox = {
	window: {
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {},
		devicePixelRatio: 1,
		innerWidth: 1280,
		innerHeight: 720,
		getComputedStyle() { return { display: 'block', getPropertyValue() { return '' } } }
	},
	document: fakeDocument,
	console: { log() {}, warn() {} },
	performance: { now() { return 0 } },
	localStorage: { getItem() { return null }, setItem() {} },
	requestAnimationFrame() { return 1 },
	cancelAnimationFrame() {},
	setTimeout,
	clearTimeout,
	setInterval() { return 1 },
	clearInterval() {},
	CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail },
	require(id) {
		if (id === 'electron') return { ipcRenderer: null }
		throw new Error(`Unexpected require: ${id}`)
	}
}
sandbox.window.window = sandbox.window

vm.runInNewContext(source, sandbox, { filename: loaderPath })

const modLoader = sandbox.window.ModLoader
assert.equal(modLoader.version, '0.5.0')
const alphaApi = modLoader.forMod('alpha').ui.shortcuts
assert.equal(alphaApi.version, 1)
assert.equal(Object.isFrozen(alphaApi), true)

const first = alphaApi.register({
	id: 'open-editor',
	keys: 'v',
	description: { en: 'Open editor', sch: '打开编辑器' },
	order: 20,
	category: { id: 'editor', label: { en: 'Editors', sch: '编辑器' }, order: 10 }
})
assert.equal(typeof first.update, 'function')
assert.equal(typeof first.unregister, 'function')
assert.equal(modLoader.state.shortcutEntries['alpha:open-editor'].source, 'mod')
assert.deepEqual(Array.from(modLoader.state.shortcutEntries['alpha:open-editor'].keys[0]), [ 'V' ])

const replacement = alphaApi.register({
	id: 'open-editor',
	keys: [[ 'control', 'v' ], [ 'Meta', 'V' ]],
	description: 'Open editor',
	category: { id: 'editor', label: 'Editors', order: 10 }
})
assert.equal(first.unregister(), false, 'an old handle cannot unregister its replacement')
assert.deepEqual(
	Array.from(modLoader.state.shortcutEntries['alpha:open-editor'].keys, chord => Array.from(chord)),
	[[ 'Ctrl', 'V' ], [ 'Meta', 'V' ]]
)
assert.equal(replacement.update({ keys: [ 'Shift', 'Space' ], order: 5 }), true)
assert.deepEqual(Array.from(modLoader.state.shortcutEntries['alpha:open-editor'].keys[0]), [ 'Shift', 'Space' ])

const betaApi = modLoader.forMod('beta').ui.shortcuts
const duplicateCombo = betaApi.register({
	id: 'more-info',
	keys: [ 'Shift', 'Space' ],
	description: 'More information',
	source: 'game',
	category: { id: 'editor', label: 'Different category', order: 99 }
})
assert.equal(modLoader.state.shortcutEntries['beta:more-info'].source, 'mod', 'a public Mod cannot spoof a reserved source')
assert.ok(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination'))

const invalid = alphaApi.register({ id: 'unsafe', keys: '<script>', description: 'Unsafe' })
assert.equal(invalid.update({ description: 'Still inert' }), false)
assert.equal(invalid.unregister(), false)
assert.equal(modLoader.state.shortcutEntries['alpha:unsafe'], undefined)

assert.equal(duplicateCombo.unregister(), true)
assert.equal(replacement.unregister(), true)
assert.equal(Object.keys(modLoader.state.shortcutEntries).length, 0)

console.log('Shortcut API v1 contract passed: ownership, normalization, generation-safe handles, diagnostics, UI structure, documentation, and 20 languages.')
