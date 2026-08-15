'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const readmePath = path.resolve(__dirname, '..', 'README.md')
const source = fs.readFileSync(loaderPath, 'utf8')
const readme = fs.readFileSync(readmePath, 'utf8')

assert.match(source, /version: '0\.4\.0'/)
assert.match(source, /const SETTINGS_API_VERSION = 1/)
assert.match(source, /const SETTINGS_API_TYPES = Object\.freeze\(\[ 'boolean', 'select', 'number', 'slider', 'color', 'string', 'array', 'object', 'resourceColors' \]\)/)
assert.match(source, /settings: createUiSettingsApi\(modId\)/)
assert.match(source, /const createUiSettingsApi = function \(modId\) \{[\s\S]*?version: SETTINGS_API_VERSION[\s\S]*?register\(definitions\)[\s\S]*?createControl\(definition, options\)[\s\S]*?createField\(definition, options\)[\s\S]*?createForm\(options\)[\s\S]*?scroll: Object\.freeze\(\{[\s\S]*?attach\(target, options\)[\s\S]*?tooltip: Object\.freeze\(\{[\s\S]*?attach\(target, value, options\)[\s\S]*?detach\(target\)/)

assert.match(source, /const normalizeSettingsDefinition = function \(definition, options\) \{[\s\S]*?item\.settingsApiVersion = SETTINGS_API_VERSION[\s\S]*?item\.preserveOptionTypes = true/)
assert.match(source, /return type === 'colorpalette' \|\| type === 'color-palette' \|\| type === 'resourcecolors' \|\| type === 'resource-colors'/)
assert.match(source, /const registerSettingsDefinitions = function \(modId, definitions\) \{[\s\S]*?if \(existing\.has\(item\.key\)\) throw new Error\('Duplicate settings key: '[\s\S]*?config\.schema\.push\(item\)[\s\S]*?requestAnimationFrame\(refreshOpenPanel\)[\s\S]*?config\.schema = config\.schema\.filter[\s\S]*?requestAnimationFrame\(refreshOpenPanel\)/)
assert.match(source, /config\.values\[item\.key\] = parseStoredConfig\(localStorage\.getItem\(storageKey\(modId, item\.key\)\), cloneConfigValue\(item\.default\)\)/)

assert.match(source, /const createSettingsControlCore = function \(definition, options\) \{[\s\S]*?getValue\(\)[\s\S]*?setValue\(value, config\)[\s\S]*?reset\(config\)[\s\S]*?setDisabled\(disabled\)[\s\S]*?validate\(\)[\s\S]*?destroy\(\)/)
assert.match(source, /const createSettingsForm = function \(modId, options\) \{[\s\S]*?const persist = config\.persist === 'change' \? 'change' : 'manual'[\s\S]*?if \(bindConfig && kind === 'input'\) dispatchConfigPreview[\s\S]*?if \(bindConfig && kind === 'change' && persist === 'change'\)[\s\S]*?save\(\)[\s\S]*?setConfigValue\(modId, item\.key, value\)[\s\S]*?get dirty\(\)/)
assert.match(source, /if \(item\.dividerBefore \|\| item\.separatorBefore \|\| sectionId !== currentSectionId\) \{[\s\S]*?currentSection = null[\s\S]*?currentSectionId = sectionId/)
assert.match(source, /const validateSettingsConfigValue = function \(item, value\) \{[\s\S]*?Choose one of the available options[\s\S]*?typeof item\.validate === 'function'[\s\S]*?result\.valid === false/)
assert.match(source, /readNumberConfigValue\(item, input\.value, type, \{ enforceRange: true, min: item\.min, max: item\.max \}\)/)
assert.match(source, /if \(item\?\.settingsApiVersion === SETTINGS_API_VERSION\) \{[\s\S]*?throw new Error\('Invalid select value: '/)

assert.match(source, /const createSettingsFieldCore = function \(definition, options\)/)
assert.match(source, /configScroll = element\('div', 'modloader-mod-config-scroll'\)/)
assert.doesNotMatch(source, /configScroll = element\('div', '[^']*modloader-settings-surface/)
assert.match(source, /const fieldHandle = createSettingsFieldCore\(item, \{[\s\S]*?apiV1: false[\s\S]*?descriptionDisplayMode: inlineDescriptions \? 'inline' : 'hover'/)
assert.match(source, /const ensureSettingsSurfaceStyle = function \(panelStyle\) \{[\s\S]*?\.modloader-settings-surface[\s\S]*?modloader-settings-surface-style/)
assert.match(source, /\.modloader-settings-scroll \{[^}]*scrollbar-gutter: stable[^}]*scrollbar-width: thin[^}]*scrollbar-color: var\(--modloader-settings-scroll-thumb\) transparent/)
assert.match(source, /\.modloader-settings-scroll\.modloader-settings-scroll-light \{[^}]*--modloader-settings-scroll-thumb:/)
assert.match(source, /\.modloader-settings-scroll::-webkit-scrollbar \{ width: 4px; height: 4px; \}/)
assert.doesNotMatch(source, /attachShadow\s*\(/)

assert.match(source, /const initializeSettingsSurface = function \(surface, options\) \{[\s\S]*?settingsSurfaceRegistry\.set[\s\S]*?retainSettingsTooltipRoot\(surface\)[\s\S]*?settingsSurfaceRegistry\.delete\(surface\)/)
assert.match(source, /const syncSettingsSurfaceTheme = function \(surface\) \{[\s\S]*?record\.theme === 'auto' \? getPanelThemeMode\(\) : record\.theme[\s\S]*?modloader-panel-theme-light/)
assert.match(source, /surface\.dataset\.modloaderSettingsDescriptionMode = descriptionMode/)
assert.match(source, /const attachSettingsScroll = function \(target, options\) \{[\s\S]*?data-modloader-scroll-axis[\s\S]*?installTransientScrollbar\(target, 'modloader-settings-scrollbar-visible'\)[\s\S]*?installInertialScroll\(target, inertiaOptions\)[\s\S]*?settingsScrollRegistry\.delete\(target\)[\s\S]*?return cleanup/)
assert.match(source, /const releaseScroll = config\.scroll[\s\S]*?attachSettingsScroll\(root, config\.scroll === true \? \{ maxHeight: 'min\(60vh, 560px\)' \} : config\.scroll\)[\s\S]*?if \(releaseScroll\) releaseScroll\(\)/)
assert.match(source, /const shouldDeferInertialScroll = function \(list, event, delta\) \{[\s\S]*?textarea, select, \[contenteditable="true"\], \[data-modloader-scroll-native\][\s\S]*?canScrollUp[\s\S]*?canScrollDown/)
assert.match(source, /const installTransientScrollbar = function \(list, visibleClass\) \{[\s\S]*?addEventListener\('wheel', reveal[\s\S]*?removeEventListener\('wheel', reveal\)[\s\S]*?return cleanup/)
assert.match(source, /const onWheel = function \(event\) \{[\s\S]*?shouldDeferInertialScroll\(list, event, delta\)[\s\S]*?if \(next === before\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?list\.scrollTop = next/)
assert.match(source, /const attachSettingsTooltip = function \(target, value, options\) \{[\s\S]*?setPanelTooltipText\(target, value, options\)[\s\S]*?retainSettingsTooltipRoot\(root\)[\s\S]*?settingsTooltipTargetRegistry\.set\(target, detach\)/)
assert.match(source, /const installPanelTooltips = function \(root, addCleanup\) \{[\s\S]*?return cleanup/)
assert.match(source, /const settingsSurface = target\.closest\?\.\('\.modloader-settings-surface'\)[\s\S]*?const descriptionMode = settingsSurface\?\.dataset\?\.modloaderSettingsDescriptionMode \|\| getPanelDescriptionDisplayMode\(\)[\s\S]*?const panel = settingsSurface \|\| target\.closest\?\.\('#modloader-panel'\)/)
assert.match(readme, /### Scroll surfaces[\s\S]*?scroll: true[\s\S]*?api\.ui\.settings\.scroll\.attach\(container,[\s\S]*?detachScroll\(\)/)

const extractConstFunction = function (name, nextName) {
	const pattern = new RegExp(`\\tconst ${name} = function \\([\\s\\S]*?(?=\\n\\tconst ${nextName} =)`, 'm')
	const match = source.match(pattern)
	assert.ok(match, `${name} source is present`)
	return match[0].trim()
}

const selectHelpers = vm.runInNewContext(`(() => {
	const SETTINGS_API_VERSION = 1
	const isObject = value => value && typeof value === 'object' && !Array.isArray(value)
	const pickLocalizedText = value => typeof value === 'string' ? value : ''
	const getLocaleCandidates = () => [ 'en' ]
	${extractConstFunction('shouldPreserveSelectValueType', 'coerceSelectConfigValue')}
	${extractConstFunction('coerceSelectConfigValue', 'getSelectConfigValueKey')}
	${extractConstFunction('getSelectConfigValueKey', 'getSelectConfigOptions')}
	${extractConstFunction('getSelectConfigOptions', 'createSelectConfigInput')}
	return { coerceSelectConfigValue, getSelectConfigValueKey, getSelectConfigOptions }
})()`)

const legacy = { type: 'select', options: [ { value: 0, label: 'Zero' }, { value: false, label: 'False' } ] }
assert.deepEqual(Array.from(selectHelpers.getSelectConfigOptions(legacy, undefined, { includeCurrent: false }), option => option.value), [ '0', 'false' ])

const typed = { type: 'select', settingsApiVersion: 1, options: [ { value: 0, label: 'Zero' }, { value: false, label: 'False' }, { value: '0', label: 'Text zero' } ] }
const typedOptions = selectHelpers.getSelectConfigOptions(typed, undefined, { includeCurrent: false })
assert.deepEqual(Array.from(typedOptions, option => option.value), [ 0, false, '0' ])
assert.notEqual(selectHelpers.getSelectConfigValueKey(0), selectHelpers.getSelectConfigValueKey('0'))
assert.equal(selectHelpers.coerceSelectConfigValue({ settingsApiVersion: 1, valueType: 'boolean' }, 'false'), false)
assert.equal(selectHelpers.coerceSelectConfigValue({ settingsApiVersion: 1, valueType: 'number' }, '2.5'), 2.5)
assert.throws(() => selectHelpers.coerceSelectConfigValue({ settingsApiVersion: 1 }, { id: 1 }), /strings, numbers, or booleans/)

const deferInertialScroll = vm.runInNewContext(`(() => {
	const window = { getComputedStyle(node) { return node.computedStyle || { overflowY: 'visible' } } }
	${extractConstFunction('shouldDeferInertialScroll', 'installInertialScroll')}
	return shouldDeferInertialScroll
})()`)
const list = { contains() { return true } }
const textarea = { closest(selector) { return selector.includes('textarea') ? this : null }, parentElement: list }
assert.equal(deferInertialScroll(list, { target: textarea }, 20), true)
const nested = { style: {}, computedStyle: { overflowY: 'auto' }, scrollTop: 10, clientHeight: 50, scrollHeight: 120, closest() { return null }, parentElement: list }
assert.equal(deferInertialScroll(list, { target: nested }, 20), true)
const plain = { style: {}, computedStyle: { overflowY: 'visible' }, closest() { return null }, parentElement: list }
assert.equal(deferInertialScroll(list, { target: plain }, 20), false)

console.log('Settings API v1 contract passed: registration, shared renderer, typed values, validation, persistence, themes, scrolling, tooltips, and cleanup.')
