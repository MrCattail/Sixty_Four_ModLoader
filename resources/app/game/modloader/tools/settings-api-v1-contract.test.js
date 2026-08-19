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
assert.match(source, /const setPanelTooltipText = function \(target, text, options\) \{[\s\S]*?modloaderPanelTooltipDelayMs[\s\S]*?Number\.isFinite\(delayMs\)[\s\S]*?delete target\.dataset\.modloaderPanelTooltipDelayMs/)
assert.match(source, /const setPanelTooltipText = function \(target, text, options\) \{[\s\S]*?target\.dataset\.modloaderPanelTooltipTheme = options\?\.theme === 'global' \? 'global' : 'plane'[\s\S]*?delete target\.dataset\.modloaderPanelTooltipTheme/)
assert.match(source, /const getPanelTooltipDelayMs = function \(target\) \{[\s\S]*?modloaderPanelTooltipDelayMs[\s\S]*?Math\.min\(10000, Math\.max\(0, Math\.round\(value\)\)\)/)
assert.match(source, /const installPanelTooltips = function \(root, addCleanup\) \{[\s\S]*?return cleanup/)
assert.match(source, /let delayTimer = 0[\s\S]*?const clearDelay = function \(\) \{[\s\S]*?clearTimeout\(delayTimer\)[\s\S]*?delayTimer = 0/)
assert.match(source, /const beginReveal = function \(target, delayMs\) \{[\s\S]*?const reveal = function[\s\S]*?activeTarget !== target[\s\S]*?ready = true[\s\S]*?setTimeout\(reveal, delayMs\)/)
assert.match(source, /const activate = function \(event\) \{[\s\S]*?event\.type === 'focusin' && !ready[\s\S]*?event\.type === 'focusin' \? 0 : getPanelTooltipDelayMs\(target\)[\s\S]*?beginReveal\(target, delayMs\)/)
assert.match(source, /const clear = function \(\) \{[\s\S]*?ready = false[\s\S]*?clearDelay\(\)[\s\S]*?clearFrame\(\)[\s\S]*?hidePanelTooltip\(\)/)
assert.match(source, /const settingsSurface = target\.closest\?\.\('\.modloader-settings-surface'\)[\s\S]*?const descriptionMode = settingsSurface\?\.dataset\?\.modloaderSettingsDescriptionMode \|\| getPanelDescriptionDisplayMode\(\)[\s\S]*?const panel = settingsSurface \|\| target\.closest\?\.\('#modloader-panel'\)/)
assert.match(source, /const tooltipLight = resolvePanelTooltipLightTheme\(target, panel\)[\s\S]*?modloader-panel-tooltip-light', tooltipLight/)
assert.match(readme, /### Scroll surfaces[\s\S]*?scroll: true[\s\S]*?api\.ui\.settings\.scroll\.attach\(container,[\s\S]*?detachScroll\(\)/)
assert.match(readme, /theme: 'global'/)
assert.match(readme, /outside a Settings surface or the ModLoader\s+panel[\s\S]*?light tooltip in Reality[\s\S]*?dark tooltip in the Void[\s\S]*?falls back\s+to the current ModLoader theme/i)
assert.match(readme, /delayMs: 600/)
assert.match(readme, /pointer delay[\s\S]*?keyboard focus remains immediate/i)

const extractConstFunction = function (name, nextName) {
	const pattern = new RegExp(`\\tconst ${name} = function \\([\\s\\S]*?(?=\\n\\tconst ${nextName} =)`, 'm')
	const match = source.match(pattern)
	assert.ok(match, `${name} source is present`)
	return match[0].trim()
}

const tooltipMetadata = vm.runInNewContext(`(() => {
	${extractConstFunction('setPanelTooltipText', 'getPanelTooltipDelayMs')}
	const target = { dataset: {} }
	setPanelTooltipText(target, 'Default')
	const defaultTheme = target.dataset.modloaderPanelTooltipTheme
	setPanelTooltipText(target, 'Global', { theme: 'global' })
	const globalTheme = target.dataset.modloaderPanelTooltipTheme
	setPanelTooltipText(target, 'Plane', { theme: 'plane' })
	const planeTheme = target.dataset.modloaderPanelTooltipTheme
	setPanelTooltipText(target, 'Invalid', { theme: 'light' })
	const invalidTheme = target.dataset.modloaderPanelTooltipTheme
	setPanelTooltipText(target, '')
	return { defaultTheme, globalTheme, planeTheme, invalidTheme, cleaned: !('modloaderPanelTooltipTheme' in target.dataset) }
})()`)

assert.equal(tooltipMetadata.defaultTheme, 'plane')
assert.equal(tooltipMetadata.globalTheme, 'global')
assert.equal(tooltipMetadata.planeTheme, 'plane')
assert.equal(tooltipMetadata.invalidTheme, 'plane')
assert.equal(tooltipMetadata.cleaned, true)

const tooltipTiming = vm.runInNewContext(`(() => {
	let now = 0
	let nextTimer = 1
	let nextFrame = 1
	const timers = new Map()
	const frames = new Map()
	const shown = []
	let hidden = 0
	const target = { dataset: { modloaderPanelTooltipDelayMs: '600' } }
	const root = {
		handlers: {},
		contains(node) { return node === target },
		addEventListener(type, handler) { this.handlers[type] = handler },
		removeEventListener(type, handler) { if (this.handlers[type] === handler) delete this.handlers[type] }
	}
	const window = {
		handlers: {},
		addEventListener(type, handler) { this.handlers[type] = handler },
		removeEventListener(type, handler) { if (this.handlers[type] === handler) delete this.handlers[type] }
	}
	const setTimeout = function (callback, delay) {
		const id = nextTimer++
		timers.set(id, { at: now + delay, callback })
		return id
	}
	const clearTimeout = function (id) { timers.delete(id) }
	const requestAnimationFrame = function (callback) {
		const id = nextFrame++
		frames.set(id, callback)
		return id
	}
	const cancelAnimationFrame = function (id) { frames.delete(id) }
	const flushFrames = function () {
		const pending = Array.from(frames.values())
		frames.clear()
		for (const callback of pending) callback()
	}
	const advance = function (duration) {
		now += duration
		while (true) {
			const due = Array.from(timers.entries()).filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)
			if (!due.length) return
			const [id, timer] = due[0]
			timers.delete(id)
			timer.callback()
		}
	}
	const getPanelTooltipTarget = function (node, scope) { return node === target && scope === root ? target : null }
	const hidePanelTooltip = function () { hidden++ }
	const showPanelTooltip = function (node, point) { shown.push({ node, point: point ? { x: point.x, y: point.y } : null }) }
	${extractConstFunction('getPanelTooltipDelayMs', 'panelRow')}
	${extractConstFunction('installPanelTooltips', 'applyPanelHiddenPosition')}
	const cleanup = installPanelTooltips(root)
	const emit = function (type, properties) { root.handlers[type](Object.assign({ type, target }, properties || {})) }

	emit('pointerover', { clientX: 10, clientY: 20 })
	flushFrames()
	const beforeDelay = shown.length
	emit('pointermove', { clientX: 12, clientY: 22 })
	advance(599)
	flushFrames()
	const after599 = shown.length
	advance(1)
	flushFrames()
	const after600 = shown.length
	const delayedPointX = shown[shown.length - 1]?.point?.x
	emit('pointermove', { clientX: 16, clientY: 26 })
	flushFrames()
	const afterReadyMove = shown.length
	emit('pointerout', { relatedTarget: null })

	emit('focusin')
	flushFrames()
	const afterFocus = shown.length
	emit('focusout', { relatedTarget: null })

	delete target.dataset.modloaderPanelTooltipDelayMs
	emit('pointerover', { clientX: 30, clientY: 40 })
	flushFrames()
	const afterDefault = shown.length
	emit('pointerout', { relatedTarget: null })

	target.dataset.modloaderPanelTooltipDelayMs = '600'
	emit('pointerover', { clientX: 50, clientY: 60 })
	cleanup()
	advance(600)
	flushFrames()
	return { beforeDelay, after599, after600, delayedPointX, afterReadyMove, afterFocus, afterDefault, afterCleanup: shown.length, hidden }
})()`)

assert.equal(tooltipTiming.beforeDelay, 0)
assert.equal(tooltipTiming.after599, 0)
assert.equal(tooltipTiming.after600, 1)
assert.equal(tooltipTiming.delayedPointX, 12)
assert.equal(tooltipTiming.afterReadyMove, 2)
assert.equal(tooltipTiming.afterFocus, 3)
assert.equal(tooltipTiming.afterDefault, 4)
assert.equal(tooltipTiming.afterCleanup, 4)
assert.ok(tooltipTiming.hidden >= 4)

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
