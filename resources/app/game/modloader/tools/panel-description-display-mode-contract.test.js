'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

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
assert.match(source, /const createSettingsFieldCore = function \(definition, options\) \{[\s\S]*?if \(description && descriptionMode === 'inline'\) text\.appendChild\(element\('span', 'modloader-config-meta modloader-config-description', description\)\)[\s\S]*?if \(description && descriptionMode !== 'inline'\) setPanelTooltipText\(text, description, \{ kind: 'description' \}\)/)
assert.match(source, /createSettingsFieldCore\(item, \{[\s\S]*?description: localizedConfigDescription,[\s\S]*?descriptionDisplayMode: inlineDescriptions \? 'inline' : 'hover'/)
assert.doesNotMatch(source, /localizedModDescription && !inlineDescriptions\) [^;\n]+\.title = localizedModDescription/)
assert.doesNotMatch(source, /localizedConfigDescription && !inlineDescriptions\) [^;\n]+\.title = localizedConfigDescription/)
assert.doesNotMatch(source, /\.title\s*=/)

assert.match(source, /\.modloader-mod-description \{[^}]*color: var\(--modloader-text-muted\)[^}]*font-size: 12px/s)
assert.match(source, /\.modloader-config-description \{ color: var\(--modloader-text-muted\); \}/)
assert.match(source, /#modloader-panel-tooltip \{[^}]*max-width: min\(var\(--modloader-panel-tooltip-max-width, 340px\), calc\(100vw - 20px\)\)[^}]*border: 1px solid rgba\(255,255,255,\.13\)[^}]*border-radius: var\(--modloader-panel-tooltip-radius, 999px\)[^}]*padding: 5px var\(--modloader-panel-tooltip-side-padding, 11px\)[^}]*background: rgba\(18, 20, 23, \.26\)[^}]*box-shadow: 0 8px 22px rgba\(0,0,0,\.24\), inset 0 1px 0 rgba\(255,255,255,\.1\)[^}]*backdrop-filter: blur\(12px\) saturate\(1\.25\)/s)
assert.match(source, /#modloader-panel-tooltip\.modloader-panel-tooltip-light \{[^}]*border-color: rgba\(18,20,22,\.12\)[^}]*background: rgba\(255,255,255,\.34\)[^}]*color: rgba\(18,20,22,\.82\)[^}]*box-shadow: 0 8px 22px rgba\(0,0,0,\.16\), inset 0 1px 0 rgba\(255,255,255,\.62\)/s)
assert.doesNotMatch(source, /modloader-panel-tooltip-surface-shadow/)
assert.doesNotMatch(source, /modloader-panel-tooltip-surface/)
assert.doesNotMatch(source, /#modloader-panel-tooltip\.modloader-panel-tooltip-continuous/)
assert.doesNotMatch(source, /classList\.add\('modloader-panel-tooltip-continuous'\)/)
assert.doesNotMatch(source, /createPanelTooltipContinuousPath/)
assert.doesNotMatch(source, /setProperty\('--modloader-panel-tooltip-(?:inner-)?clip/)
assert.match(source, /const positionPanelTooltip = function \(tooltip, target, point\) \{[\s\S]*?const anchorX = Number\.isFinite\(point\?\.x\) \? point\.x : rect\.left \+ rect\.width \/ 2[\s\S]*?let x = anchorX \+ PANEL_TOOLTIP_OFFSET[\s\S]*?if \(viewportWidth > 0 && x \+ width \+ margin > viewportWidth\) x = anchorX - width - PANEL_TOOLTIP_OFFSET/)
assert.match(source, /tooltip\.textContent = text[\s\S]*?tooltip\.classList\.add\('active'\)[\s\S]*?syncPanelTooltipLayout\(tooltip\)[\s\S]*?positionPanelTooltip\(tooltip, target, point\)/)
assert.match(source, /const resolvePanelTooltipLightTheme = function \(target, panel\) \{[\s\S]*?panel\.classList\?\.contains\('modloader-panel-theme-light'\)[\s\S]*?modloaderPanelTooltipTheme === 'global'[\s\S]*?state\.game\?\.plane[\s\S]*?plane === 0[\s\S]*?plane === 1[\s\S]*?getPanelThemeMode\(\) === 'light'/)
assert.match(source, /const tooltipLight = resolvePanelTooltipLightTheme\(target, panel\)[\s\S]*?tooltip\.classList\.toggle\('modloader-panel-tooltip-light', tooltipLight\)/)
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
assert.match(source, /const isDescription = target\?\.dataset\?\.modloaderPanelTooltipKind === 'description'[\s\S]*?const settingsSurface = target\.closest\?\.\('\.modloader-settings-surface'\)[\s\S]*?const descriptionMode = settingsSurface\?\.dataset\?\.modloaderSettingsDescriptionMode \|\| getPanelDescriptionDisplayMode\(\)[\s\S]*?if \(!text \|\| \(isDescription && descriptionMode === 'inline'\)\) return hidePanelTooltip\(\)/)

const tooltipThemeSource = source.match(/\tconst resolvePanelTooltipLightTheme = function \(target, panel\) \{[\s\S]*?\n\t\}/)
assert.ok(tooltipThemeSource, 'external tooltip theme resolver exists')
const tooltipThemes = vm.runInNewContext(`(() => {
	const state = { game: { plane: 0 } }
	let globalTheme = 'dark'
	const getPanelThemeMode = () => globalTheme
	${tooltipThemeSource?.[0]?.trim() || ''}
	const target = { dataset: { modloaderPanelTooltipTheme: 'plane' } }
	const panelLight = { classList: { contains(value) { return value === 'modloader-panel-theme-light' } } }
	const panelDark = { classList: { contains() { return false } } }
	const internalLight = resolvePanelTooltipLightTheme(target, panelLight)
	const internalDark = resolvePanelTooltipLightTheme(target, panelDark)
	const reality = resolvePanelTooltipLightTheme(target, null)
	state.game.plane = 1
	const voidTheme = resolvePanelTooltipLightTheme(target, null)
	target.dataset.modloaderPanelTooltipTheme = 'global'
	globalTheme = 'light'
	const explicitGlobalLight = resolvePanelTooltipLightTheme(target, null)
	globalTheme = 'dark'
	const explicitGlobalDark = resolvePanelTooltipLightTheme(target, null)
	target.dataset.modloaderPanelTooltipTheme = 'plane'
	state.game = null
	globalTheme = 'light'
	const missingGameFallback = resolvePanelTooltipLightTheme(target, null)
	state.game = { plane: 7 }
	globalTheme = 'dark'
	const invalidPlaneFallback = resolvePanelTooltipLightTheme(target, null)
	return { internalLight, internalDark, reality, voidTheme, explicitGlobalLight, explicitGlobalDark, missingGameFallback, invalidPlaneFallback }
})()`)
assert.equal(tooltipThemes.internalLight, true, 'internal tooltip follows its light container')
assert.equal(tooltipThemes.internalDark, false, 'internal tooltip follows its dark container')
assert.equal(tooltipThemes.reality, true, 'Reality uses the light tooltip theme')
assert.equal(tooltipThemes.voidTheme, false, 'Void uses the dark tooltip theme')
assert.equal(tooltipThemes.explicitGlobalLight, true, 'explicit global uses the current light ModLoader theme')
assert.equal(tooltipThemes.explicitGlobalDark, false, 'explicit global uses the current dark ModLoader theme')
assert.equal(tooltipThemes.missingGameFallback, true, 'missing game falls back to the global theme')
assert.equal(tooltipThemes.invalidPlaneFallback, false, 'invalid plane falls back to the global theme')

const tooltipLayoutSource = source.match(/\tconst formatPanelTooltipLayoutNumber = function \(value\) \{[\s\S]*?\n\t\}(?=\n\n\tconst positionPanelTooltip)/)
assert.ok(tooltipLayoutSource, 'capsule tooltip layout helpers exist before positioning')
assert.match(source, /const PANEL_TOOLTIP_BASE_MAX_WIDTH = 340/)
assert.match(source, /const PANEL_TOOLTIP_BASE_SIDE_PADDING = 11/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_RADIUS_START_RATIO = \.5/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_RADIUS_STEP = \.04/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_RADIUS_MIN_RATIO = \.38/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_SIDE_PADDING_MIN = 16/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_SIDE_PADDING_MAX = 48/)
assert.match(source, /const PANEL_TOOLTIP_MULTILINE_TEXT_GAP = 4/)
assert.match(source, /const syncPanelTooltipLayout = function \(tooltip\)[\s\S]*?--modloader-panel-tooltip-radius[\s\S]*?--modloader-panel-tooltip-side-padding[\s\S]*?--modloader-panel-tooltip-max-width/)
const tooltipLayout = vm.runInNewContext(`(() => {
	const PANEL_TOOLTIP_BASE_MAX_WIDTH = 340
	const PANEL_TOOLTIP_BASE_SIDE_PADDING = 11
	const PANEL_TOOLTIP_MULTILINE_RADIUS_START_RATIO = .5
	const PANEL_TOOLTIP_MULTILINE_RADIUS_STEP = .04
	const PANEL_TOOLTIP_MULTILINE_RADIUS_MIN_RATIO = .38
	const PANEL_TOOLTIP_MULTILINE_SIDE_PADDING_MIN = 16
	const PANEL_TOOLTIP_MULTILINE_SIDE_PADDING_MAX = 48
	const PANEL_TOOLTIP_MULTILINE_TEXT_GAP = 4
	${tooltipLayoutSource[0].trim()}
	return { getLayout: getPanelTooltipLayout }
})()`)

const oneLine = tooltipLayout.getLayout(1, 25, 14.52, 5, 5, 1, 1)
assert.equal(oneLine.borderRadius, '999px', 'one rendered line keeps the original capsule radius')
assert.equal(oneLine.sidePadding, 11, 'one rendered line keeps the original side padding')
assert.equal(oneLine.maxWidth, 340, 'one rendered line keeps the original maximum width')

const twoLines = tooltipLayout.getLayout(2, 39, 14.52, 5, 5, 1, 1)
assert.equal(twoLines.borderRadius, '19.5px / 50%', 'two lines start at a 0.50-height horizontal radius')
assert.equal(twoLines.sidePadding, 16, 'two lines use the minimum safe side padding')
assert.equal(twoLines.maxWidth, 350, 'two lines grow the shell without narrowing the text block')

const threeLines = tooltipLayout.getLayout(3, 54, 14.52, 5, 5, 1, 1)
assert.equal(threeLines.borderRadius, '24.84px / 50%', 'three lines reduce the relative horizontal radius to 0.46 height')
assert.equal(threeLines.sidePadding, 16, 'three lines still satisfy the ellipse boundary at minimum padding')

const fourLines = tooltipLayout.getLayout(4, 68, 14.52, 5, 5, 1, 1)
assert.equal(fourLines.borderRadius, '28.56px / 50%', 'four lines reduce the relative horizontal radius to 0.42 height')
assert.equal(fourLines.sidePadding, 16, 'four lines remain within the minimum geometric safety space')
assert.equal(fourLines.maxWidth, 350, 'four-line shell avoids unnecessary end-cap expansion')

const screenshotTooltip = tooltipLayout.getLayout(5, 82, 14.52, 5, 5, 1, 1)
assert.equal(screenshotTooltip.borderRadius, '31.16px / 50%', 'five lines reach the 0.38-height horizontal-radius floor')
assert.equal(screenshotTooltip.sidePadding, 16, 'the reported tooltip clears the flatter ellipse without oversized side padding')
assert.equal(screenshotTooltip.maxWidth, 350, 'the reported tooltip no longer expands into a protruding 374px shell')

const fiveLines = tooltipLayout.getLayout(5, 83, 14.52, 5, 5, 1, 1)
assert.equal(fiveLines.borderRadius, '31.54px / 50%', 'five-line radius tracks measured height at the 0.38 ratio')
assert.equal(fiveLines.sidePadding, 16, 'five-line safety stays at the geometric minimum')
assert.equal(fiveLines.maxWidth, 350, 'five lines preserve text width without exaggerated end caps')

const tallTooltip = tooltipLayout.getLayout(8, 123, 14.52, 5, 5, 1, 1)
assert.equal(tallTooltip.borderRadius, '46.74px / 50%', 'six or more lines retain the 0.38-height radius floor')
assert.equal(tallTooltip.sidePadding, 21.75, 'tall tooltips add only the safety required by the flatter ellipse')
assert.equal(tallTooltip.maxWidth, 361.5, 'tall shells preserve text width without the old protrusion')

const cappedTooltip = tooltipLayout.getLayout(12, 300, 14.52, 5, 5, 1, 1)
assert.equal(cappedTooltip.borderRadius, '114px / 50%', 'extreme heights retain the 0.38-height radius floor')
assert.equal(cappedTooltip.sidePadding, 48, 'extreme tooltips still stop at the geometric side-padding cap')
assert.equal(cappedTooltip.maxWidth, 414, 'the widest shell still preserves the text block width')

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
