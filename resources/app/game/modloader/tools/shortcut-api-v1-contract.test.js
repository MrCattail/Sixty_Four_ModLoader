'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const readmePath = path.resolve(__dirname, '..', 'README.md')
const source = fs.readFileSync(loaderPath, 'utf8')
const readme = fs.readFileSync(readmePath, 'utf8')
const translations = require('./helpers/translation-contract-fixtures.js').loadTranslationFixture()

assert.match(source, /version: '0\.5\.0'/)
assert.match(source, /const SHORTCUT_API_VERSION = 1/)
assert.match(source, /shortcuts: createUiShortcutsApi\(modId\)/)
assert.match(source, /const normalizeShortcutKeys = function/)
assert.match(source, /const registerShortcut = function/)
assert.match(source, /const updateShortcut = function/)
assert.match(source, /const unregisterShortcut = function/)
assert.match(source, /const createUiShortcutsApi = function/)
assert.match(source, /allowSharedCombination/)
assert.match(source, /Potential shortcut overlap/)
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
assert.match(source, /\.modloader-shortcut-key \{[^}]*border:1px solid rgba\(0,0,0,\.2\);/)
assert.match(source, /\.modloader-shortcut-key \{[^}]*box-shadow:0 2px 0 #ffe0b5,0 3px 7px rgba\(0,0,0,\.22\);/)
assert.match(source, /\.modloader-shortcut-key-space \{[^}]*min-width:112px;/)
assert.match(source, /\.modloader-shortcut-space-mark \{[^}]*width:16px;[^}]*height:5px;[^}]*border:1\.5px solid #17181b;[^}]*border-top:0;[^}]*border-radius:0 0 3px 3px;/)
assert.match(source, /const SHORTCUT_MOUSE_VISUALS = Object\.freeze\(\{\s*Mouse1: 'left',\s*Mouse2: 'right',\s*Mouse3: 'side-forward',\s*Mouse4: 'side-back',\s*Mouse5: 'middle',\s*WheelUp: 'wheel-up',\s*WheelDown: 'wheel-down'\s*\}\)/)
assert.match(source, /const renderShortcutMouseToken = function/)
assert.match(source, /mouse\.setAttribute\('aria-hidden', 'true'\)/)
assert.match(source, /key\.setAttribute\('role', 'img'\)/)
assert.match(source, /key\.setAttribute\('aria-label', token\)/)
assert.match(source, /key\.setAttribute\('title', token\)/)
assert.match(source, /if \(mouseVisual\) key\.appendChild\(renderShortcutMouseToken\(mouseVisual\)\)/)
assert.match(source, /\.modloader-shortcut-key-mouse \{[^}]*width:34px;[^}]*height:30px;[^}]*justify-content:flex-end;[^}]*background:transparent;[^}]*box-shadow:none;/)
assert.match(source, /\.modloader-shortcut-mouse \{[^}]*width:28px;[^}]*height:30px;[^}]*border:1px solid rgba\(0,0,0,\.2\);[^}]*border-radius:10px;[^}]*background:#fff;[^}]*box-shadow:0 2px 0 #ffe0b5,0 3px 7px rgba\(0,0,0,\.22\);[^}]*overflow:visible;/)
assert.doesNotMatch(source, /\.modloader-shortcut-mouse::before/)
assert.doesNotMatch(source, /\.modloader-shortcut-mouse::after/)
assert.match(source, /\.modloader-shortcut-mouse-side \{[^}]*left:-3px;[^}]*width:3px;[^}]*height:6px;[^}]*border:1px solid rgba\(0,0,0,\.2\);[^}]*border-radius:2px 0 0 2px;[^}]*background:#fff;/)
assert.match(source, /\.modloader-shortcut-mouse-side\.modloader-shortcut-mouse-side-forward \{ top:8px; \}/)
assert.match(source, /\.modloader-shortcut-mouse-side\.modloader-shortcut-mouse-side-back \{ top:16px; \}/)
assert.doesNotMatch(source, /(?:^|\n)\s*\.modloader-shortcut-mouse-side-forward \{ top:8px; \}/)
assert.doesNotMatch(source, /(?:^|\n)\s*\.modloader-shortcut-mouse-side-back \{ top:16px; \}/)
assert.match(source, /\.modloader-shortcut-mouse-wheel \{[^}]*border:1px solid rgba\(0,0,0,\.2\);[^}]*background:#fff;/)
assert.match(source, /\.modloader-shortcut-mouse-left \.modloader-shortcut-mouse-button-left,[^}]*\.modloader-shortcut-mouse-wheel-down \.modloader-shortcut-mouse-wheel \{ background:#ffe0b5; \}/)
assert.match(source, /\.modloader-shortcut-mouse-wheel-up \.modloader-shortcut-mouse-wheel::after \{[^}]*rotate\(-135deg\);/)
assert.match(source, /\.modloader-shortcut-mouse-wheel-down \.modloader-shortcut-mouse-wheel::after \{[^}]*rotate\(45deg\);/)
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
assert.match(readme, /`Mouse1` is the left button, `Mouse2` is the right button/)
assert.match(readme, /`Mouse3` is the\s+forward side button, `Mouse4` is the rear side button/)
assert.match(readme, /`Mouse5` is the\s+clickable middle wheel/)
assert.match(readme, /`WheelUp` and `WheelDown` use the same mouse silhouette\s+with a directional wheel arrow/)
assert.match(readme, /near-square `28 x 30 px` body\s+inside a `34 x 30 px` slot/)
assert.match(readme, /two `3 x 6 px` side buttons fully outside its left edge/)
assert.match(readme, /narrow along the horizontal axis and use a `2 px 0 0 2 px` radius/)
assert.match(readme, /only the two\s+exposed left corners are rounded while the two corners touching the body remain\s+square/)
assert.match(readme, /forward button starts at\s+`8 px` and the rear button at `16 px`/)
assert.match(readme, /centered around the body midpoint with a\s+`2 px` gap/)
assert.match(readme, /Both external side buttons keep a\s+`1 px solid rgba\(0, 0, 0, \.2\)` gray outline/)
assert.match(readme, /same `1 px solid rgba\(0, 0, 0, \.2\)` outer edge as a\s+normal\s+keycap/)
assert.match(readme, /a `10 px`\s+body radius and no internal button separators/)
assert.match(readme, /wheel keeps a permanent\s+`1 px solid rgba\(0, 0, 0, \.2\)` gray outline\s+in every\s+mouse-token state/)
assert.match(readme, /Inactive main-button regions blend into the white body/)
assert.match(readme, /external side buttons remain white and outlined until `Mouse3` or\s+`Mouse4` fills\s+the corresponding button yellow/)
assert.match(readme, /Mouse interactions outside the list do not\s+close it/)
assert.match(readme, /`Esc` is not handled by the\s+shortcut list and remains available to the game without changing the list's open\s+state/)
assert.match(readme, /`allowSharedCombination: true`/)
assert.match(readme, /both registrations/)

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

const animationFrames = []
let animationFrameId = 1
const flushAnimationFrames = function () {
	while (animationFrames.length) animationFrames.shift()()
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
	requestAnimationFrame(callback) { animationFrames.push(callback); return animationFrameId++ },
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

const pointerPreview = alphaApi.register({
	id: 'pointer-preview',
	keys: [['Mouse1'], ['Mouse2'], ['Mouse3'], ['Mouse4'], ['Mouse5'], ['WheelUp'], ['WheelDown']],
	description: 'Pointer preview',
	category: { id: 'editor', label: 'Editors', order: 10 }
})
assert.deepEqual(
	Array.from(modLoader.state.shortcutEntries['alpha:pointer-preview'].keys, chord => Array.from(chord)),
	[['Mouse1'], ['Mouse2'], ['Mouse3'], ['Mouse4'], ['Mouse5'], ['WheelUp'], ['WheelDown']]
)

const betaApi = modLoader.forMod('beta').ui.shortcuts
let betaActive = false
let betaVisible = true
const duplicateCombo = betaApi.register({
	id: 'more-info',
	keys: [ 'Shift', 'Space' ],
	description: 'More information',
	visible: () => betaVisible,
	active: () => betaActive,
	source: 'game',
	category: { id: 'editor', label: 'Different category', order: 99 }
})
assert.equal(modLoader.state.shortcutEntries['beta:more-info'].source, 'mod', 'a public Mod cannot spoof a reserved source')
flushAnimationFrames()
assert.equal(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination'), false, 'inactive duplicate combinations do not warn')

betaActive = true
betaVisible = false
betaApi.refresh()
flushAnimationFrames()
assert.equal(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination'), false, 'hidden duplicate combinations do not warn')

betaVisible = true
modLoader.state.shortcutSettings.enabled = false
modLoader.state.shortcutSettings.mods.beta = false
betaApi.refresh()
flushAnimationFrames()
const activeOverlap = modLoader.state.shortcutDiagnostics.find(item => item.code === 'duplicate-combination')
assert.ok(activeOverlap, 'simultaneously visible and active combinations warn')
assert.match(activeOverlap.message, /Potential shortcut overlap/)
assert.match(activeOverlap.message, /Shift\+Space/)
assert.match(activeOverlap.message, /alpha:open-editor/)
assert.match(activeOverlap.message, /beta:more-info/)
modLoader.state.shortcutSettings.enabled = true
modLoader.state.shortcutSettings.mods.beta = true

const gammaApi = modLoader.forMod('gamma').ui.shortcuts
const deltaApi = modLoader.forMod('delta').ui.shortcuts
const partialAlternative = gammaApi.register({
	id: 'partial-alternative',
	keys: [['Ctrl', 'Y'], ['Meta', 'Y']],
	description: 'Partial alternative'
})
const reorderedChord = deltaApi.register({
	id: 'reordered-chord',
	keys: ['Y', 'Ctrl'],
	description: 'Reordered chord'
})
flushAnimationFrames()
assert.ok(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination' && item.message.includes('Ctrl+Y') && item.message.includes('gamma:partial-alternative') && item.message.includes('delta:reordered-chord')), 'individual alternatives and modifier order are compared canonically')

const sharedOne = gammaApi.register({
	id: 'shared-one',
	keys: 'F6',
	description: 'Shared one',
	allowSharedCombination: true
})
const sharedTwo = deltaApi.register({
	id: 'shared-two',
	keys: 'F6',
	description: 'Shared two',
	allowSharedCombination: true
})
const oneSidedOne = gammaApi.register({
	id: 'one-sided-one',
	keys: 'F7',
	description: 'One-sided one',
	allowSharedCombination: true
})
const oneSidedTwo = deltaApi.register({
	id: 'one-sided-two',
	keys: 'F7',
	description: 'One-sided two'
})
flushAnimationFrames()
assert.equal(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination' && item.message.includes('F6')), false, 'both registrations may explicitly allow a shared combination')
assert.ok(modLoader.state.shortcutDiagnostics.some(item => item.code === 'duplicate-combination' && item.message.includes('F7')), 'one-sided shared-combination permission does not suppress the warning')

const invalid = alphaApi.register({ id: 'unsafe', keys: '<script>', description: 'Unsafe' })
assert.equal(invalid.update({ description: 'Still inert' }), false)
assert.equal(invalid.unregister(), false)
assert.equal(modLoader.state.shortcutEntries['alpha:unsafe'], undefined)

assert.equal(duplicateCombo.unregister(), true)
assert.equal(pointerPreview.unregister(), true)
assert.equal(replacement.unregister(), true)
assert.equal(partialAlternative.unregister(), true)
assert.equal(reorderedChord.unregister(), true)
assert.equal(sharedOne.unregister(), true)
assert.equal(sharedTwo.unregister(), true)
assert.equal(oneSidedOne.unregister(), true)
assert.equal(oneSidedTwo.unregister(), true)
assert.equal(Object.keys(modLoader.state.shortcutEntries).length, 0)

console.log('Shortcut API v1 contract passed: ownership, normalization, generation-safe handles, diagnostics, UI structure, documentation, and 20 languages.')
