'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const translationsPath = path.resolve(__dirname, '..', 'translations.json')
const source = fs.readFileSync(loaderPath, 'utf8')
const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'))

assert.match(source, /panelSettings: \{[^}]*descriptionDisplayMode: 'hover'[^}]*\}/)
assert.match(source, /const isValidPanelDescriptionDisplayMode = function \(value\) \{[\s\S]*?return value === 'hover' \|\| value === 'inline'[\s\S]*?\}/)
assert.match(source, /const shouldShowPanelDescriptionsInline = function \(\) \{[\s\S]*?return getPanelDescriptionDisplayMode\(\) === 'inline'[\s\S]*?\}/)
assert.match(source, /if \(isValidPanelDescriptionDisplayMode\(stored\.settings\.descriptionDisplayMode\)\) state\.panelSettings\.descriptionDisplayMode = stored\.settings\.descriptionDisplayMode/)
assert.match(source, /panel\.classList\.toggle\('modloader-panel-description-inline', shouldShowPanelDescriptionsInline\(\)\)/)
assert.match(source, /addSettingsRow\(t\('descriptionDisplayMode'\), \[[\s\S]*?\{ value: 'hover', label: t\('descriptionDisplayHover'\) \}[\s\S]*?\{ value: 'inline', label: t\('descriptionDisplayInline'\) \}[\s\S]*?\], getPanelDescriptionDisplayMode\(\)/)

assert.match(source, /const inlineDescriptions = shouldShowPanelDescriptionsInline\(\)/)
assert.match(source, /const setPanelTooltipText = function \(target, text, options\) \{[\s\S]*?target\.dataset\.modloaderPanelTooltip = value[\s\S]*?target\.dataset\.modloaderPanelTooltipKind = String\(options\.kind\)/)
assert.match(source, /if \(localizedModDescription && !inlineDescriptions\) setPanelTooltipText\(title, localizedModDescription, \{ kind: 'description' \}\)/)
assert.match(source, /if \(localizedModDescription && inlineDescriptions\) main\.appendChild\(element\('div', 'modloader-mod-description', localizedModDescription\)\)/)
assert.match(source, /if \(localizedConfigDescription && inlineDescriptions\) text\.appendChild\(element\('span', 'modloader-config-meta modloader-config-description', localizedConfigDescription\)\)/)
assert.match(source, /if \(localizedConfigDescription && !inlineDescriptions\) setPanelTooltipText\(text, localizedConfigDescription, \{ kind: 'description' \}\)/)
assert.doesNotMatch(source, /localizedModDescription && !inlineDescriptions\) [^;\n]+\.title = localizedModDescription/)
assert.doesNotMatch(source, /localizedConfigDescription && !inlineDescriptions\) [^;\n]+\.title = localizedConfigDescription/)
assert.doesNotMatch(source, /\.title\s*=/)

assert.match(source, /\.modloader-mod-description \{[^}]*color: var\(--modloader-text-muted\)[^}]*font-size: 12px/s)
assert.match(source, /\.modloader-config-description \{ color: var\(--modloader-text-muted\); \}/)
assert.match(source, /#modloader-panel-tooltip \{[^}]*border-radius: 999px[^}]*padding: 5px 11px[^}]*background: rgba\(18, 20, 23, \.26\)[^}]*font: 11px\/1\.32 Montserrat, Arial, sans-serif[^}]*backdrop-filter: blur\(12px\) saturate\(1\.25\)[^}]*-webkit-backdrop-filter: blur\(12px\) saturate\(1\.25\)/s)
assert.match(source, /#modloader-panel-tooltip\.modloader-panel-tooltip-light \{[^}]*background: rgba\(255,255,255,\.34\)[^}]*color: rgba\(18,20,22,\.82\)/s)
assert.match(source, /const positionPanelTooltip = function \(tooltip, target, point\) \{[\s\S]*?const anchorX = Number\.isFinite\(point\?\.x\) \? point\.x : rect\.left \+ rect\.width \/ 2[\s\S]*?let x = anchorX \+ PANEL_TOOLTIP_OFFSET[\s\S]*?if \(viewportWidth > 0 && x \+ width \+ margin > viewportWidth\) x = anchorX - width - PANEL_TOOLTIP_OFFSET/)
assert.match(source, /tooltip\.classList\.toggle\('modloader-panel-tooltip-light', !!panel\?\.classList\?\.contains\('modloader-panel-theme-light'\)\)/)
assert.match(source, /const installPanelTooltips = function \(root, addCleanup\)/)
assert.match(source, /root\.addEventListener\('pointerover', activate\)/)
assert.match(source, /root\.addEventListener\('pointermove', move\)/)
assert.match(source, /root\.addEventListener\('focusin', activate\)/)
assert.match(source, /root\.addEventListener\('scroll', clear, true\)/)
assert.match(source, /const clear = function \(\) \{[\s\S]*?hidePanelTooltip\(\)[\s\S]*?\}/)
assert.match(source, /installPanelTooltips\(panel, addCleanup\)/)
assert.match(source, /installPanelTooltips\(el\)/)
assert.match(source, /setPanelTooltipText\(button, title \|\| label\)/)
assert.match(source, /setPanelTooltipText\(tab, t\('showFromEdge'\)\)/)
assert.match(source, /setPanelTooltipText\(deleteButton, t\('deleteMod'\)\)/)
assert.match(source, /const isDescription = target\?\.dataset\?\.modloaderPanelTooltipKind === 'description'[\s\S]*?if \(!text \|\| \(isDescription && shouldShowPanelDescriptionsInline\(\)\)\) return hidePanelTooltip\(\)/)

const requiredKeys = [
	'descriptionDisplayMode',
	'descriptionDisplayHover',
	'descriptionDisplayInline'
]
const languages = Object.keys(translations.languages || {})
assert.ok(languages.length >= 20, 'expected all ModLoader translation languages')
for (const language of languages) {
	const modloader = translations.languages[language]?.modloader
	assert.ok(modloader && typeof modloader === 'object' && !Array.isArray(modloader), `${language} modloader translation group exists`)
	for (const key of requiredKeys) {
		assert.equal(typeof modloader[key], 'string', `${language}.${key} is translated`)
		assert.ok(modloader[key].trim(), `${language}.${key} is not empty`)
		assert.ok(!modloader[key].includes('?'), `${language}.${key} has no replacement question marks`)
	}
}

console.log('Panel description display mode contract passed: hover default, inline descriptions, and translated settings.')
