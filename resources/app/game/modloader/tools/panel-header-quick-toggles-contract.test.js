'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')
const translations = require('./helpers/translation-contract-fixtures.js').loadTranslationFixture()

const quickToggleHelpers = source.match(/\tconst getPanelThemeQuickToggle = function \(\) \{[\s\S]*?\n\t\}(?=\n\n\tconst clearPanelAutoHideTimer)/)
assert.ok(quickToggleHelpers, 'panel quick-toggle state helpers exist before auto-hide timer management')

const models = vm.runInNewContext(`(() => {
	const state = { panelSettings: { theme: 'dark', hideMode: 'auto' } }
	const getPanelThemeMode = () => state.panelSettings.theme === 'light' ? 'light' : 'dark'
	const isPanelAutoHideEnabled = () => state.panelSettings.hideMode !== 'manual'
	${quickToggleHelpers?.[0]?.trim() || ''}
	const darkTheme = getPanelThemeQuickToggle()
	const autoHide = getPanelHideModeQuickToggle()
	state.panelSettings.theme = 'light'
	state.panelSettings.hideMode = 'manual'
	const lightTheme = getPanelThemeQuickToggle()
	const manualHide = getPanelHideModeQuickToggle()
	return { darkTheme, lightTheme, autoHide, manualHide }
})()`)

assert.deepEqual(
	JSON.parse(JSON.stringify(models.darkTheme)),
	{ current: 'dark', target: 'light', icon: 'sun', labelKey: 'lightMode' },
	'dark mode shows the sun action for switching to light mode'
)
assert.deepEqual(
	JSON.parse(JSON.stringify(models.lightTheme)),
	{ current: 'light', target: 'dark', icon: 'moon', labelKey: 'darkMode' },
	'light mode shows the moon action for switching to dark mode'
)
assert.deepEqual(
	JSON.parse(JSON.stringify(models.autoHide)),
	{ current: 'auto', target: 'manual', icon: 'pin-tilted', labelKey: 'manualHide' },
	'auto-hide mode shows the tilted pin while targeting manual mode'
)
assert.deepEqual(
	JSON.parse(JSON.stringify(models.manualHide)),
	{ current: 'manual', target: 'auto', icon: 'pin-upright', labelKey: 'autoHide' },
	'manual mode shows the upright pin while targeting auto-hide mode'
)

assert.match(source, /const themeToggle = element\('button', 'modloader-panel-theme-toggle'\)/)
assert.match(source, /const hideModeToggle = element\('button', 'modloader-panel-hide-toggle'\)/)
assert.match(source, /themeToggle\.appendChild\(element\('span', 'modloader-panel-quick-icon modloader-panel-quick-icon-' \+ themeToggleState\.icon\)\)/)
assert.match(source, /hideModeToggle\.appendChild\(element\('span', 'modloader-panel-quick-icon modloader-panel-quick-icon-' \+ hideModeToggleState\.icon\)\)/)
assert.match(source, /controls\.append\(settings, themeToggle, hideModeToggle, hide, close\)/)

assert.match(source, /setPanelTooltipText\(themeToggle, t\(themeToggleState\.labelKey\)\)/)
assert.match(source, /themeToggle\.setAttribute\('aria-label', t\(themeToggleState\.labelKey\)\)/)
assert.match(source, /state\.panelSettings\.theme = themeToggleState\.target[\s\S]*?savePanelState\(\)[\s\S]*?renderPanel\(\)/)
assert.match(source, /setPanelTooltipText\(hideModeToggle, t\(hideModeToggleState\.labelKey\)\)/)
assert.match(source, /hideModeToggle\.setAttribute\('aria-label', t\(hideModeToggleState\.labelKey\)\)/)
assert.match(source, /state\.panelSettings\.hideMode = hideModeToggleState\.target[\s\S]*?if \(hideModeToggleState\.target === 'manual'\) clearPanelAutoHideTimer\(\)[\s\S]*?savePanelState\(\)[\s\S]*?renderPanel\(\)/)

assert.match(source, /\.modloader-panel-theme-toggle, #modloader-panel \.modloader-panel-hide-toggle \{[^}]*width: 24px;[^}]*height: 24px;[^}]*color: var\(--modloader-control-text\)/s)
assert.match(source, /\.modloader-panel-theme-toggle:hover, #modloader-panel \.modloader-panel-hide-toggle:hover/)
assert.match(source, /\.modloader-panel-theme-toggle:focus-visible, #modloader-panel \.modloader-panel-hide-toggle:focus-visible/)
assert.match(source, /\.modloader-panel-quick-icon-sun:before \{[^}]*border: 1\.5px solid currentColor[^}]*border-radius: 50%/s)
assert.match(source, /\.modloader-panel-quick-icon-sun:after \{[^}]*box-shadow:[^}]*currentColor/s)
assert.match(source, /\.modloader-panel-quick-icon-moon:before \{[^}]*border-radius: 50%[^}]*background: currentColor[^}]*mask: radial-gradient/s)
assert.match(source, /\.modloader-panel-quick-icon-pin-upright:before, #modloader-panel \.modloader-panel-quick-icon-pin-tilted:before/)
assert.match(source, /\.modloader-panel-quick-icon-pin-tilted \{ transform: rotate\(-35deg\); \}/)
assert.match(source, /modloader-panel-theme-light \.modloader-panel-theme-toggle, #modloader-panel\.modloader-panel-theme-light \.modloader-panel-hide-toggle/)

assert.doesNotMatch(source, /hide\.disabled = !isPanelAutoHideEnabled\(\)/)
assert.doesNotMatch(source, /if \(!isPanelAutoHideEnabled\(\)\) return\s*\n\s*hidePanelToEdge\(panel, true\)/)
assert.doesNotMatch(source, /const hidePanelToEdge = function \(panel, useStoredTab\) \{\s*\n\s*if \(!isPanelAutoHideEnabled\(\)\) return/)
assert.doesNotMatch(source, /const applyPanelHiddenPosition = function \(panel\) \{\s*\n\s*if \(!isPanelAutoHideEnabled\(\)\)/)
assert.match(source, /const schedulePanelAutoHide = function \(panel\) \{[\s\S]*?if \(!isPanelAutoHideEnabled\(\) \|\| state\.panelHidden\) return/)
assert.match(source, /const restoreAutomatically = stored\.restoreAsTab === true && isPanelAutoHideEnabled\(\)[\s\S]*?state\.panelHidden = stored\.hidden === true \|\| restoreAutomatically/)

const requiredKeys = [ 'darkMode', 'lightMode', 'autoHide', 'manualHide' ]
const languages = Object.keys(translations.languages || {})
assert.ok(languages.length >= 20, 'expected all ModLoader translation languages')
assert.match(source, /const t = function \(key, values\) \{[\s\S]*?getCatalogPanelText\(language, key\) \|\| PANEL_TEXT\[language\]\?\.\[key\] \|\| PANEL_TEXT\.en\[key\] \|\| key/)
for (const key of requiredKeys) {
	assert.match(source, new RegExp(`en: \\{[\\s\\S]*?${key}: '[^']+'`), `English ${key} fallback exists`)
	assert.match(source, new RegExp(`sch: \\{[\\s\\S]*?${key}: '[^']+'`), `Simplified Chinese ${key} fallback exists`)
}
let translatedLanguageCount = 0
for (const language of languages) {
	const modloader = translations.languages[language]?.modloader
	assert.ok(modloader && typeof modloader === 'object' && !Array.isArray(modloader), `${language} modloader translation group exists`)
	const translated = requiredKeys.filter((key) => typeof modloader[key] === 'string')
	if (translated.length) translatedLanguageCount++
	for (const key of requiredKeys) {
		if (modloader[key] === undefined) continue
		assert.equal(typeof modloader[key], 'string', `${language}.${key} is a string when translated`)
		assert.ok(modloader[key].trim(), `${language}.${key} is not empty when translated`)
		assert.ok(!modloader[key].includes('?'), `${language}.${key} has no replacement question marks`)
	}
}
assert.ok(translatedLanguageCount >= 4, 'existing catalog translations remain available while other languages use the built-in fallback')

console.log('Panel header quick toggles contract passed: order, icons, persistence, themes, manual edge hiding, and translations.')
