const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const BLUEPRINT_PATH = path.join(MOD_ROOT, 'scripts/blueprint-session.js')
const I18N_PATH = path.join(MOD_ROOT, 'scripts/i18n/editor-text.js')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')
const README_PATH = path.join(MOD_ROOT, 'README.md')

const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const blueprintSource = fs.readFileSync(BLUEPRINT_PATH, 'utf8')
const i18nSource = fs.readFileSync(I18N_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const readme = fs.readFileSync(README_PATH, 'utf8')

function testManifestAndLocalization() {
	assert.deepEqual(manifest.config.largeToolbarCards, {
		type: 'boolean',
		label: 'Use Large-Card Toolbar',
		default: false,
		description: 'Uses fixed large toolbar cards with horizontal inertial scrolling.',
		reloadPolicy: 'hot'
	})
	const languages = Object.keys(manifest.translations)
	assert.equal(languages.length, 20)
	for (const language of languages) {
		const translated = manifest.translations[language].config.largeToolbarCards
		assert.ok(translated?.label?.trim(), language + ' config label')
		assert.ok(translated?.description?.trim(), language + ' config description')
	}

	const definitions = []
	const sandbox = {
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	vm.runInContext(i18nSource, sandbox, { filename: I18N_PATH })
	assert.equal(definitions.length, 1)
	definitions[0].init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	const cardKeys = [
		'toolbarCardSelect',
		'toolbarCardRemove',
		'toolbarCardStructure',
		'toolbarCardFull',
		'toolbarCardCubes',
		'toolbarCardCopy',
		'toolbarCardRotateClockwise',
		'toolbarCardRotateCounterclockwise',
		'toolbarCardMirrorU',
		'toolbarCardMirrorV',
		'toolbarCardReset',
		'toolbarCardCreative'
	]
	assert.equal(i18n.languages.length, 20)
	assert.deepEqual(
		new Set(i18n.toolbarKeys),
		new Set(cardKeys.concat(['toolbarStyleCompact', 'toolbarStyleLargeCards']))
	)
	for (const language of i18n.languages) {
		for (const key of i18n.toolbarKeys) {
			const translated = i18n.t(language, key)
			assert.notEqual(translated, key, language + '.' + key)
			assert.ok(translated.trim(), language + '.' + key)
		}
	}
}

function testSourceContracts() {
	assert.match(shellSource, /shell\.dataset\.toolbarStyle\s*=\s*'compact'/)
	assert.match(shellSource, /api\.config\?\.get\?\.\(LARGE_TOOLBAR_CONFIG_KEY,\s*false\)/)
	assert.match(shellSource, /api\.config\.set\(LARGE_TOOLBAR_CONFIG_KEY,\s*value\)/)
	assert.match(shellSource, /window\.addEventListener\('modloader:config-preview',\s*handleToolbarConfigPreview\)/)
	assert.match(shellSource, /window\.removeEventListener\('modloader:config-preview',\s*handleToolbarConfigPreview\)/)
	assert.match(shellSource, /detail\?\.modId\s*!==\s*MOD_ID\s*\|\|\s*detail\?\.key\s*!==\s*LARGE_TOOLBAR_CONFIG_KEY/)
	assert.match(shellSource, /createToolbarStyleButton\('compact',\s*'≡'\)/)
	assert.match(shellSource, /createToolbarStyleButton\('cards',\s*'▦'\)/)
	assert.match(shellSource, /LARGE_TOOLBAR_CARD_WIDTH\s*=\s*120/)
	assert.match(shellSource, /LARGE_TOOLBAR_VISIBLE_LIMIT\s*=\s*8/)
	assert.match(shellSource, /LARGE_TOOLBAR_SCROLL_RESIDUAL_PROPERTY\s*=\s*'--world-editor-large-toolbar-scroll-residual'/)
	assert.doesNotMatch(shellSource, /LARGE_TOOLBAR_DECELERATION_MS/)
	assert.match(shellSource, /LARGE_TOOLBAR_SNAP_MS\s*=\s*400/)
	assert.match(shellSource, /LARGE_TOOLBAR_DECAY_PER_FRAME\s*=\s*\.94/)
	assert.match(shellSource, /LARGE_TOOLBAR_STOP_VELOCITY\s*=\s*\.01/)
	assert.match(shellSource, /Symbol\.for\('cattail\.world-editor\.toolbar-scroll-probe'\)/)
	assert.match(shellSource, /globalThis\[TOOLBAR_SCROLL_PROBE_KEY\]\s*=\s*toolbarScroller\.probe/)
	assert.match(shellSource, /refresh-interrupted-motion/)
	assert.match(shellSource, /PROBE_LIMIT\s*=\s*480/)
	assert.match(shellSource, /recordProbe\('refresh'/)
	assert.match(shellSource, /recordProbe\('hover-change'/)
	assert.match(shellSource, /actions\.addEventListener\('pointerover',\s*handlePointerOver\)/)
	assert.match(shellSource, /actions\.removeEventListener\('pointerout',\s*handlePointerOut\)/)
	assert.match(shellSource, /let layoutSignature\s*=\s*''/)
	assert.match(shellSource, /interrupted:\s*active\s*&&\s*layoutChanged/)
	assert.match(shellSource, /if\s*\(layoutChanged\)\s*\{\s*cancel\('refresh:'\s*\+\s*refreshReason\)/)
	assert.match(shellSource, /let smoothingReversal\s*=\s*false/)
	assert.match(shellSource, /let lastMotionDirection\s*=\s*0/)
	assert.match(shellSource, /Math\.sign\(velocity\)\s*\|\|\s*\(frame\s*\?\s*lastMotionDirection\s*:\s*0\)/)
	assert.match(shellSource, /const reversing\s*=\s*!!inputDirection\s*&&\s*!!motionDirection\s*&&\s*inputDirection\s*!==\s*motionDirection/)
	assert.match(shellSource, /directPositionApplied:\s*false/)
	assert.doesNotMatch(shellSource, /writePosition\(\(Number\(actions\.scrollLeft\)\s*\|\|\s*0\)\s*\+\s*delta,\s*'wheel-input'/)
	assert.match(shellSource, /let logicalPosition\s*=\s*Number\(actions\.scrollLeft\)\s*\|\|\s*0/)
	assert.match(shellSource, /function applyScrollResidual\(value\)/)
	assert.match(shellSource, /const residual\s*=\s*applyScrollResidual\(applied\s*-\s*next\)/)
	assert.match(shellSource, /const before\s*=\s*logicalPosition\s*\n\s*const next\s*=\s*clampScroll\(before\s*\+\s*velocity\s*\*\s*deltaTime\)/)
	assert.match(shellSource, /snapFrom\s*=\s*clampScroll\(logicalPosition\)/)
	assert.match(shellSource, /transform:\s*translate3d\(var\(--world-editor-large-toolbar-scroll-residual,\s*0px\),\s*0,\s*0\)/)
	assert.match(
		shellSource,
		/\[data-toolbar-style="compact"\]\s+\.cattail-world-editor-shell__group\s*\{[^}]*gap:\s*0;[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s
	)
	assert.match(
		shellSource,
		/\[data-toolbar-style="compact"\]\s+\.cattail-world-editor-shell__group:not\(\[data-world-editor-toolbar-group="selection"\]\)::before\s*\{[^}]*top:\s*5px;[^}]*bottom:\s*5px;[^}]*width:\s*1px;/s
	)
	assert.doesNotMatch(
		shellSource,
		/\[data-toolbar-style="compact"\]\s+\[data-world-editor-toolbar-card\]:not\(:first-child\)::before/,
		'compact buttons do not render within-group separators'
	)
	assert.match(
		shellSource,
		/\[data-toolbar-style="compact"\]\s+\.cattail-world-editor-shell__tool,[^}]*border:\s*0 !important;[^}]*background:\s*transparent !important;[^}]*box-shadow:\s*none !important;/s
	)
	assert.match(shellSource, /\[data-toolbar-style="compact"\]\s+\.cattail-world-editor-blueprint-modes\s*\{\s*border:\s*0;\s*border-radius:\s*0;\s*overflow:\s*visible;/)
	assert.match(shellSource, /\[data-toolbar-style="compact"\][^{]*\.cattail-world-editor-transform-button\[data-active="true"\]\s*\{[^}]*background:\s*var\(--world-editor-shell-active\) !important;/s)
	assert.match(shellSource, /toolbarBar\.dataset\.scrolling\s*=\s*'true'/)
	assert.match(shellSource, /toolbarBar\.dataset\.scrolling\s*=\s*'false'/)
	assert.match(shellSource, /lastRequestedPosition\s*=\s*next\s*\n\s*actions\.scrollLeft\s*=\s*next/)
	assert.match(shellSource, /Math\.abs\(velocity\)\s*>\s*LARGE_TOOLBAR_STOP_VELOCITY/)
	assert.match(shellSource, /Math\.abs\(velocity\)\s*<=\s*LARGE_TOOLBAR_STOP_VELOCITY\)\s*velocity\s*=\s*0/)
	assert.match(shellSource, /const eased\s*=\s*Math\.pow\(progress,\s*3\)/)
	assert.doesNotMatch(shellSource, /1\s*-\s*Math\.pow\(-2\s*\*\s*progress/)
	assert.doesNotMatch(shellSource, /actions\.scrollLeft\s*=\s*snapTarget/)
	assert.match(shellSource, /flex-wrap:\s*nowrap/)
	assert.match(shellSource, /flex:\s*0 0 120px/)
	assert.match(shellSource, /width:\s*120px !important/)
	assert.match(shellSource, /max-width:\s*120px/)
	assert.match(shellSource, /height:\s*112px !important/)
	assert.match(shellSource, /overflow-x:\s*hidden/)
	assert.match(shellSource, /box-sizing:\s*content-box/)
	assert.match(shellSource, /padding:\s*6px/)
	assert.match(shellSource, /max-width:\s*calc\(var\(--world-editor-toolbar-layout-width/)
	assert.match(shellSource, /border-radius:\s*12px/)
	assert.match(shellSource, /top:\s*8px;\s*\n\s*bottom:\s*8px/)
	assert.match(
		shellSource,
		/\[data-world-editor-toolbar-card\]:not\(:first-child\)::before\s*\{[^}]*top:\s*16px;[^}]*bottom:\s*16px;[^}]*width:\s*2px;[^}]*clip-path:\s*polygon\(50% 0,\s*100% 34%,\s*100% 66%,\s*50% 100%,\s*0 66%,\s*0 34%\);/s
	)
	assert.match(shellSource, /inset:\s*6px 4px/)
	assert.match(
		shellSource,
		/\[data-world-editor-toolbar-card\]::after\s*\{[^}]*background:\s*transparent;/s
	)
	assert.match(
		shellSource,
		/\[data-world-editor-toolbar-card\]:hover:not\(:disabled\)::after\s*\{\s*background:\s*var\(--world-editor-shell-chip\);/
	)
	assert.match(
		shellSource,
		/\[data-scrolling="true"\]\s+\[data-world-editor-toolbar-card\]:hover:not\(:disabled\):not\(\[data-active="true"\]\)::after\s*\{[^}]*background:\s*transparent;[^}]*transition:\s*none;/s
	)
	assert.match(
		shellSource,
		/\[data-world-editor-toolbar-card\]\[data-active="true"\]::after\s*\{\s*background:\s*var\(--world-editor-shell-active\);/
	)
	assert.doesNotMatch(shellSource, /border-left:\s*1px solid var\(--world-editor-shell-border\) !important/)
	assert.match(shellSource, /Math\.round\(\(Number\(value\)\s*\|\|\s*0\)\s*\/\s*LARGE_TOOLBAR_CARD_WIDTH\)/)
	assert.match(shellSource, /requestAnimationFrame/)
	assert.match(shellSource, /event\?\.preventDefault\?\.\(\)/)
	assert.match(shellSource, /event\?\.stopImmediatePropagation\?\.\(\)/)
	assert.match(shellSource, /Math\.min\(maxScroll\(\),\s*Math\.max\(0,/)
	assert.match(shellSource, /data-scroll-before="true"/)
	assert.match(shellSource, /data-scroll-after="true"/)
	assert.match(shellSource, /pointer-events:\s*none/)
	assert.match(shellSource, /toolbarScroller\.cancel\(reason\s*\|\|\s*'toolbar-style'\)/)
	assert.match(shellSource, /toolbarScroller\.refresh\('ui-scale'\)/)
	assert.match(shellSource, /toolbarScroller\.dispose\(\)/)
	assert.match(shellSource, /actions\.removeEventListener\('wheel',\s*handleWheel/)
	assert.match(shellSource, /actions\.removeEventListener\('scroll',\s*handleScroll\)/)
	assert.match(shellSource, /\[data-world-editor-large-hidden="true"\]/)
	assert.match(shellSource, /\[aria-disabled="true"\]:not\(\[data-world-editor-toolbar-busy="true"\]\)/)
	assert.match(shellSource, /group\.dataset\.largeEmpty\s*=\s*available\s*\?\s*'false'\s*:\s*'true'/)
	assert.match(shellSource, /font-size:\s*48px/)
	assert.match(shellSource, /opacity:\s*\.12 !important/)
	assert.match(shellSource, /--world-editor-shell-creative/)

	assert.match(blueprintSource, /captureEligible\s*=\s*canCapture\(currentSelection\)\s*&&\s*!!currentRuntime\.active/)
	assert.match(blueprintSource, /worldEditorLargeHidden\s*=\s*selectionAvailable\s*&&\s*!!currentRuntime\.active\s*\?\s*'false'\s*:\s*'true'/)
	assert.match(blueprintSource, /worldEditorToolbarBusy\s*=\s*state\.capturing\s*\?\s*'true'\s*:\s*'false'/)
	assert.match(blueprintSource, /action\s*===\s*'reset'\s*&&\s*!!currentTransform\.identity/)
	assert.match(blueprintSource, /root\.hidden\s*=\s*!available/)
	assert.match(blueprintSource, /full\.hidden\s*=\s*!creativeAvailable/)
	assert.match(blueprintSource, /blocks\.hidden\s*=\s*!creativeAvailable\s*\|\|\s*state\.mode\s*!==\s*'full'/)
	assert.match(blueprintSource, /location\s*===\s*'toolbar'\)\s*button\.dataset\.worldEditorToolbarCard/)
	assert.match(blueprintSource, /toolbarCardRotateCounterclockwise/)
	assert.match(blueprintSource, /cattail:world-editor-toolbar-layout/)

	assert.match(readme, /largeToolbarCards/)
	assert.match(readme, /120 × 112 CSS px/)
	assert.match(readme, /0\.01 CSS px\/ms/)
	assert.match(readme, /400 ms/)
	assert.match(readme, /ease-in/)
	assert.match(readme, /速度衰减到实现意义上的零后，下一帧才开始/)
	assert.match(readme, /不会在中途直接设为目标/)
	assert.match(readme, /整段滚轮手势统一只累加横向速度/)
	assert.match(readme, /完全静止后的第一格和后续同方向输入都从下一动画帧开始按速度移动/)
	assert.match(readme, /连续浮点逻辑位置/)
	assert.match(readme, /translate3d/)
	assert.match(readme, /约 `2\/3 CSS px`/)
	assert.match(readme, /紧凑模式的默认按钮与功能组均使用透明无框表面/)
	assert.match(readme, /组内按钮之间不使用分隔线/)
	assert.match(readme, /240 → 140/)
	assert.match(readme, /cattail\.world-editor\.toolbar-scroll-probe/)
	assert.match(readme, /最近 480 条只读样本/)
	assert.match(readme, /refresh-interrupted-motion/)
	assert.match(readme, /周期性的 `blueprint-transform` 刷新/)
	assert.match(readme, /布局签名/)
	assert.match(readme, /data-scrolling="true"/)
}

function testStyleModeIsolation() {
	const compactDisabledRule = '.cattail-world-editor-shell__tool:disabled {'
	const largeModeStart = '.cattail-world-editor-shell[data-toolbar-style="cards"] .cattail-world-editor-shell__toolbar-bar {'
	const largeCardDisplayRule = '.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card] {'
	const largeStructuralHideRule = '.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-large-hidden="true"],'
	const largeBlockedHideRule = '.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][aria-disabled="true"]:not([data-world-editor-toolbar-busy="true"]) {'
	const largeNativeHideRule = '.cattail-world-editor-shell[data-toolbar-style="cards"] [data-world-editor-toolbar-card][hidden] {'

	const compactDisabledIndex = shellSource.indexOf(compactDisabledRule)
	const largeModeIndex = shellSource.indexOf(largeModeStart)
	const largeCardDisplayIndex = shellSource.indexOf(largeCardDisplayRule)
	assert.ok(compactDisabledIndex >= 0, 'compact disabled style remains defined')
	assert.ok(largeModeIndex > compactDisabledIndex, 'large-card overrides remain separate from compact base styles')
	assert.ok(largeCardDisplayIndex > largeModeIndex, 'large-card display rule remains in the cards-only section')

	for (const selector of [largeStructuralHideRule, largeBlockedHideRule, largeNativeHideRule]) {
		const selectorIndex = shellSource.indexOf(selector)
		assert.ok(selectorIndex > largeCardDisplayIndex, selector + ' must override the earlier large-card display rule')
	}

	const visibilitySelectorTokens = [
		'[data-world-editor-large-hidden="true"]',
		'[data-world-editor-toolbar-card][aria-disabled="true"]:not([data-world-editor-toolbar-busy="true"])',
		'[data-world-editor-toolbar-card][hidden]'
	]
	const sourceLines = shellSource.split(/\r?\n/)
	for (const token of visibilitySelectorTokens) {
		const matchingLines = sourceLines.filter(line => line.includes(token))
		assert.equal(matchingLines.length, 1, token + ' must have one CSS visibility selector')
		assert.match(matchingLines[0], /data-toolbar-style="cards"/)
	}
	assert.match(
		shellSource,
		/\.cattail-world-editor-shell__tool:disabled\s*\{\s*opacity:\s*\.38;\s*cursor:\s*default;\s*\}/
	)
}

function makeElement(dataset = {}) {
	return {
		dataset,
		hidden: false,
		parentElement: null,
		attributes: {},
		getAttribute(name) {
			return this.attributes[name]
		}
	}
}

function testInertiaAndVisibility() {
	const definitions = []
	const callbacks = new Map()
	let nextFrame = 1
	let clock = 1000
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		performance: { now: () => clock },
		requestAnimationFrame(callback) {
			const id = nextFrame++
			callbacks.set(id, callback)
			return id
		},
		cancelAnimationFrame(id) {
			callbacks.delete(id)
		},
		setTimeout,
		clearTimeout,
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}
	vm.createContext(sandbox)
	const exposed = shellSource.replace(
		'function createLargeToolbarScroller(shell, toolbarBar, actions) {',
		'globalThis.__createLargeToolbarScroller = function createLargeToolbarScroller(shell, toolbarBar, actions) {'
	)
	vm.runInContext(exposed, sandbox, { filename: SHELL_PATH })
	definitions[0].init({
		id: 'Cattail_TweaksQuality_World-Editor',
		on() {},
		patch() {}
	})
	const createScroller = sandbox.__createLargeToolbarScroller
	assert.equal(typeof createScroller, 'function')

	const shell = { dataset: { toolbarStyle: 'cards' } }
	const toolbarBar = {
		dataset: {},
		style: {
			values: {},
			setProperty(key, value) {
				this.values[key] = value
			}
		}
	}
	const listeners = new Map()
	const groups = [makeElement({ worldEditorToolbarGroup: 'selection' }), makeElement({ worldEditorToolbarGroup: 'tools' })]
	const cards = Array.from({ length: 10 }, (_, index) => makeElement({ worldEditorToolbarCard: '', index: String(index) }))
	for (let index = 0; index < cards.length; index += 1) {
		cards[index].parentElement = index < 2 ? groups[0] : groups[1]
	}
	for (const group of groups) {
		group.parentElement = null
		group.querySelectorAll = selector => selector === '[data-world-editor-toolbar-card]'
			? cards.filter(card => card.parentElement === group)
			: []
	}
	const residualProperty = '--world-editor-large-toolbar-scroll-residual'
	const scrollQuantum = 2 / 3
	let nativeScrollLeft = 0
	const actions = {
		scrollWidth: 10 * 120,
		clientWidth: 8 * 120,
		style: {
			values: {},
			setProperty(key, value) {
				this.values[key] = value
			}
		},
		addEventListener(type, listener) {
			listeners.set(type, listener)
		},
		removeEventListener(type, listener) {
			if (listeners.get(type) === listener) listeners.delete(type)
		},
		querySelectorAll(selector) {
			if (selector === '[data-world-editor-toolbar-card]') return cards
			if (selector === '[data-world-editor-toolbar-group]') return groups
			return []
		}
	}
	Object.defineProperty(actions, 'scrollLeft', {
		get() {
			return nativeScrollLeft
		},
		set(value) {
			const numeric = Math.max(0, Number(value) || 0)
			nativeScrollLeft = Math.floor((numeric + 1e-9) / scrollQuantum) * scrollQuantum
		}
	})
	for (const group of groups) group.parentElement = actions

	const scroller = createScroller(shell, toolbarBar, actions)
	assert.equal(scroller.probe.version, '2')
	assert.equal(scroller.probe.enabled(), true)
	scroller.probe.clear()
	assert.equal(toolbarBar.style.values['--world-editor-large-toolbar-width'], '960px')
	assert.equal(toolbarBar.dataset.visibleCards, '10')
	assert.equal(toolbarBar.dataset.scrollBefore, 'false')
	assert.equal(toolbarBar.dataset.scrollAfter, 'true')
	assert.equal(actions.style.values[residualProperty], '0px')

	function visualPosition() {
		const residual = Number.parseFloat(actions.style.values[residualProperty]) || 0
		return actions.scrollLeft - residual
	}

	function advanceFrame(step) {
		clock = 1000 + step * 16
		const entries = Array.from(callbacks.entries())
		callbacks.clear()
		for (const [, callback] of entries) callback(clock)
	}

	const wheel = {
		deltaX: 0,
		deltaY: 70,
		deltaMode: 0,
		prevented: false,
		stopped: false,
		immediate: false,
		preventDefault() { this.prevented = true },
		stopPropagation() { this.stopped = true },
		stopImmediatePropagation() { this.immediate = true }
	}
	listeners.get('wheel')(wheel)
	assert.equal(wheel.prevented, true)
	assert.equal(wheel.stopped, true)
	assert.equal(wheel.immediate, true)
	assert.equal(actions.scrollLeft, 0, 'an idle wheel input must not move before the next animation frame')
	const idleInput = scroller.probe.snapshot().find(function (entry) {
		return entry.event === 'wheel-input'
	})
	assert.equal(idleInput?.velocityBefore, 0)
	assert.equal(idleInput?.directPositionApplied, false)
	advanceFrame(1)
	assert.ok(visualPosition() > 0, 'an idle wheel input must begin moving on the next animation frame')
	assert.notEqual(
		actions.scrollLeft,
		visualPosition(),
		'the quantized native position must be completed by a compositor residual'
	)
	const beforeContinuedInput = visualPosition()
	const continuedWheel = Object.assign({}, wheel, { deltaY: 10 })
	listeners.get('wheel')(continuedWheel)
	assert.equal(
		visualPosition(),
		beforeContinuedInput,
		'continued same-direction input must only add velocity, not raw position'
	)
	const continuedInput = scroller.probe.snapshot().filter(function (entry) {
		return entry.event === 'wheel-input'
	}).at(-1)
	assert.ok(continuedInput?.velocityBefore > 0)
	assert.equal(continuedInput?.directPositionApplied, false)
	advanceFrame(2)
	assert.ok(visualPosition() > beforeContinuedInput)

	for (let step = 3; step <= 50; step += 1) advanceFrame(step)
	const fastGlideAt800 = visualPosition()
	advanceFrame(51)
	assert.ok(
		visualPosition() > fastGlideAt800,
		'nonzero glide velocity must keep moving forward instead of entering snap'
	)

	let glidePosition = visualPosition()
	let snapStart = null
	let snapStartStep = 0
	for (let step = 52; step <= 75; step += 1) {
		advanceFrame(step)
		if (visualPosition() === glidePosition) {
			snapStart = visualPosition()
			snapStartStep = step
			break
		}
		assert.ok(
			visualPosition() > glidePosition,
			'glide must keep its original direction until velocity reaches zero'
		)
		glidePosition = visualPosition()
	}
	assert.notEqual(snapStart, null, 'snap must begin only after a zero-movement frame')
	const expectedSnapTarget = Math.min(
		actions.scrollWidth - actions.clientWidth,
		Math.max(0, Math.round(snapStart / 120) * 120)
	)
	const snapPositions = [snapStart]
	for (let step = snapStartStep + 1; step <= snapStartStep + 8; step += 1) {
		advanceFrame(step)
		snapPositions.push(visualPosition())
	}
	const snapDistance = Math.abs(expectedSnapTarget - snapStart)
	const firstSnapTravel = Math.abs(snapPositions[1] - snapStart)
	if (snapDistance > .5) {
		assert.ok(
			firstSnapTravel / snapDistance < .01,
			'the first ease-in snap frame must start slowly from rest'
		)
		assert.notEqual(
			snapPositions[1],
			expectedSnapTarget,
			'the first snap frame must not land directly on the target'
		)
		const snapSteps = snapPositions.slice(1).map((position, index) => (
			Math.abs(position - snapPositions[index])
		))
		for (let index = 1; index < snapSteps.length; index += 1) {
			assert.ok(
				snapSteps[index] > snapSteps[index - 1],
				'the ease-in snap must keep accelerating until it reaches the edge: ' + snapSteps.join(', ')
			)
		}
	}

	for (let step = snapStartStep + 9; step <= snapStartStep + 20; step += 1) advanceFrame(step)
	if (snapDistance > .5) {
		assert.notEqual(
			visualPosition(),
			expectedSnapTarget,
			'the accelerating snap must not land before its final frame'
		)
	}
	assert.equal(callbacks.size, 1, 'the velocity-gated snap must still be running before its final frame')

	for (let step = snapStartStep + 21; step <= snapStartStep + 30; step += 1) advanceFrame(step)
	assert.equal(callbacks.size, 0, 'the velocity-gated glide and snap must eventually settle')
	assert.equal(actions.scrollLeft % 120, 0)
	assert.equal(visualPosition(), actions.scrollLeft)
	assert.equal(actions.style.values[residualProperty], '0px')
	assert.ok(actions.scrollLeft >= 0)
	assert.ok(actions.scrollLeft <= actions.scrollWidth - actions.clientWidth)
	assert.equal(
		scroller.probe.analyze().suspectedCause,
		'no-anomaly-captured',
		'a normal glide and snap trajectory must not produce a probe false positive'
	)
	const quantizedGlideFrame = scroller.probe.snapshot().find(function (entry) {
		return entry.event === 'position' &&
			entry.source === 'glide-frame' &&
			entry.delta === 0 &&
			Math.abs(entry.logicalDelta) > 0
	})
	assert.ok(quantizedGlideFrame, 'the test must reproduce a native quantization stall')
	assert.equal(quantizedGlideFrame.visualPosition, quantizedGlideFrame.requested)
	assert.notEqual(quantizedGlideFrame.logicalDelta, 0)
	assert.notEqual(quantizedGlideFrame.residual, 0)
	const quantizedSnapFrame = scroller.probe.snapshot().find(function (entry) {
		return entry.event === 'position' &&
			entry.source === 'snap-frame' &&
			entry.delta === 0 &&
			Math.abs(entry.logicalDelta) > 0
	})
	assert.ok(quantizedSnapFrame, 'the test must reproduce a quantized snap frame')
	assert.equal(quantizedSnapFrame.visualPosition, quantizedSnapFrame.requested)
	assert.notEqual(quantizedSnapFrame.residual, 0)

	scroller.probe.clear()
	actions.scrollLeft = actions.scrollWidth - actions.clientWidth
	const forwardDelta = 40
	const forwardWheel = {
		deltaX: 0,
		deltaY: forwardDelta,
		deltaMode: 0,
		preventDefault() {},
		stopPropagation() {},
		stopImmediatePropagation() {}
	}
	listeners.get('wheel')(forwardWheel)
	const reversalFrameStep = snapStartStep + 31
	advanceFrame(reversalFrameStep)
	const beforeReverseInput = visualPosition()
	const reverseWheel = Object.assign({}, forwardWheel, { deltaY: -forwardDelta })
	listeners.get('wheel')(reverseWheel)
	assert.equal(
		visualPosition(),
		beforeReverseInput,
		'the first opposing wheel input must not apply its raw delta directly'
	)
	const reversalInput = scroller.probe.snapshot().find(function (entry) {
		return entry.event === 'wheel-input' && entry.reversing === true
	})
	assert.equal(reversalInput?.reversalSmoothing, true)
	assert.equal(reversalInput?.directPositionApplied, false)
	advanceFrame(reversalFrameStep + 1)
	const firstReverseFrameTravel = Math.abs(visualPosition() - beforeReverseInput)
	assert.ok(firstReverseFrameTravel > 0, 'the reversed direction must begin moving on the next animation frame')
	assert.ok(
		firstReverseFrameTravel < Math.abs(reverseWheel.deltaY),
		'the first reversed frame must be smaller than the suppressed raw wheel jump'
	)
	const beforeSecondReverseInput = visualPosition()
	listeners.get('wheel')(reverseWheel)
	assert.equal(
		visualPosition(),
		beforeSecondReverseInput,
		'continued opposing input must remain velocity-driven for the reversal gesture'
	)
	assert.equal(scroller.probe.analyze().directionReversals.length, 0)
	scroller.cancel('reversal-test')
	assert.equal(toolbarBar.dataset.scrolling, 'false')
	assert.equal(actions.style.values[residualProperty], '0px')

	cards[0].dataset.worldEditorLargeHidden = 'true'
	actions.scrollWidth = 9 * 120
	scroller.refresh('hidden-card')
	assert.equal(toolbarBar.dataset.visibleCards, '9')
	assert.equal(groups[0].dataset.largeEmpty, 'false')

	cards[1].dataset.worldEditorLargeHidden = 'true'
	actions.scrollWidth = 8 * 120
	scroller.refresh('empty-group')
	assert.equal(groups[0].dataset.largeEmpty, 'true')
	assert.equal(toolbarBar.dataset.visibleCards, '8')

	cards[2].attributes['aria-disabled'] = 'true'
	actions.scrollWidth = 7 * 120
	scroller.refresh('blocked')
	assert.equal(toolbarBar.dataset.visibleCards, '7')
	cards[2].dataset.worldEditorToolbarBusy = 'true'
	actions.scrollWidth = 8 * 120
	scroller.refresh('busy')
	assert.equal(toolbarBar.dataset.visibleCards, '8')

	cards[0].dataset.worldEditorLargeHidden = 'false'
	cards[1].dataset.worldEditorLargeHidden = 'false'
	actions.scrollWidth = 10 * 120
	scroller.refresh('probe-baseline')
	scroller.probe.clear()
	listeners.get('wheel')(wheel)
	clock += 16
	const probeFrames = Array.from(callbacks.entries())
	callbacks.clear()
	for (const [, callback] of probeFrames) callback(clock)
	assert.equal(callbacks.size, 1, 'probe reproduction must have an active glide frame')
	assert.equal(toolbarBar.dataset.scrolling, 'true')
	const beforeRedundantRefresh = visualPosition()
	const nativeBeforeRedundantRefresh = actions.scrollLeft
	const residualBeforeRedundantRefresh = actions.style.values[residualProperty]
	scroller.refresh('selection')
	let probeAnalysis = scroller.probe.analyze()
	const redundantRefresh = scroller.probe.snapshot().find(function (entry) {
		return entry.event === 'refresh' && entry.reason === 'selection'
	})
	assert.equal(redundantRefresh?.layoutChanged, false)
	assert.equal(redundantRefresh?.interrupted, false)
	assert.equal(probeAnalysis.suspectedCause, 'no-anomaly-captured')
	assert.equal(callbacks.size, 1, 'an unchanged refresh must preserve the active glide')
	assert.equal(visualPosition(), beforeRedundantRefresh, 'an unchanged refresh must not rewrite visual position')
	assert.equal(actions.scrollLeft, nativeBeforeRedundantRefresh, 'an unchanged refresh must preserve native position')
	assert.equal(actions.style.values[residualProperty], residualBeforeRedundantRefresh)
	assert.equal(toolbarBar.dataset.scrolling, 'true')

	cards[0].dataset.worldEditorLargeHidden = 'true'
	actions.scrollWidth = 9 * 120
	scroller.refresh('selection-layout-change')
	probeAnalysis = scroller.probe.analyze()
	assert.equal(probeAnalysis.suspectedCause, 'refresh-interrupted-motion')
	assert.equal(probeAnalysis.refreshInterruptions.length, 1)
	assert.equal(probeAnalysis.refreshInterruptions[0].reason, 'selection-layout-change')
	assert.equal(callbacks.size, 0, 'a real layout change must still cancel the active glide')
	assert.equal(actions.scrollLeft % 120, 0, 'a real layout change must realign to a card boundary')
	assert.equal(actions.style.values[residualProperty], '0px')
	assert.equal(toolbarBar.dataset.scrolling, 'false')

	shell.dataset.toolbarStyle = 'compact'
	actions.scrollLeft = 0
	scroller.refresh('compact')
	const compactWheel = {
		deltaY: 120,
		prevented: false,
		preventDefault() { this.prevented = true }
	}
	listeners.get('wheel')(compactWheel)
	assert.equal(compactWheel.prevented, false)
	assert.equal(actions.scrollLeft, 0)
	assert.equal(actions.style.values[residualProperty], '0px')

	assert.equal(scroller.dispose(), true)
	assert.equal(callbacks.size, 0)
	assert.equal(listeners.has('wheel'), false)
	assert.equal(listeners.has('scroll'), false)
	assert.equal(listeners.has('pointerover'), false)
	assert.equal(listeners.has('pointerout'), false)
}

testManifestAndLocalization()
testSourceContracts()
testStyleModeIsolation()
testInertiaAndVisibility()
console.log('World Editor toolbar-style verification passed: hot toggle, large cards, hidden fill, inertial snap, localization, and cleanup.')
