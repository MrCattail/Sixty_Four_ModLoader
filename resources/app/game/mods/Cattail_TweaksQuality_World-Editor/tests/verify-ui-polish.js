const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const SHELL_PATH = path.join(MOD_ROOT, 'scripts/ui/editor-shell.js')
const DIALOG_PATH = path.join(MOD_ROOT, 'scripts/ui/dialog.js')
const CUT_PATH = path.join(MOD_ROOT, 'scripts/ui/selection-cut-ui.js')
const SESSION_PATH = path.join(MOD_ROOT, 'scripts/blueprint-session.js')
const README_PATH = path.join(MOD_ROOT, 'README.md')
const MANIFEST_PATH = path.join(MOD_ROOT, 'mod.json')

const shellSource = fs.readFileSync(SHELL_PATH, 'utf8')
const dialogSource = fs.readFileSync(DIALOG_PATH, 'utf8')
const cutSource = fs.readFileSync(CUT_PATH, 'utf8')
const sessionSource = fs.readFileSync(SESSION_PATH, 'utf8')
const readme = fs.readFileSync(README_PATH, 'utf8')
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

function extractFunction(source, name) {
	const marker = 'function ' + name + '('
	const start = source.indexOf(marker)
	assert.ok(start >= 0, name + ' function exists')
	const open = source.indexOf('{', start)
	let depth = 0
	let quote = ''
	let escaped = false
	for (let index = open; index < source.length; index += 1) {
		const character = source[index]
		if (quote) {
			if (escaped) escaped = false
			else if (character === '\\') escaped = true
			else if (character === quote) quote = ''
			continue
		}
		if (character === '\'' || character === '"' || character === '`') {
			quote = character
			continue
		}
		if (character === '{') depth += 1
		if (character === '}') {
			depth -= 1
			if (depth === 0) return source.slice(start, index + 1)
		}
	}
	throw new Error('Could not extract ' + name)
}

class EventHub {
	constructor() {
		this.listeners = new Map()
	}
	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set())
		this.listeners.get(type).add(listener)
	}
	removeEventListener(type, listener) {
		this.listeners.get(type)?.delete(listener)
	}
	dispatch(type, event = {}) {
		for (const listener of Array.from(this.listeners.get(type) || [])) listener(event)
	}
	listenerCount(type) {
		return this.listeners.get(type)?.size || 0
	}
}

function createSchedulers() {
	let nextId = 1
	let clock = 0
	const timers = new Map()
	const frames = new Map()
	return {
		performance: { now: () => clock },
		setTimeout(callback) {
			const id = nextId++
			timers.set(id, callback)
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		requestAnimationFrame(callback) {
			const id = nextId++
			frames.set(id, callback)
			return id
		},
		cancelAnimationFrame(id) {
			frames.delete(id)
		},
		flushTimers() {
			const callbacks = Array.from(timers.values())
			timers.clear()
			for (const callback of callbacks) callback()
		},
		stepFrame(time) {
			clock = time
			const callbacks = Array.from(frames.values())
			frames.clear()
			for (const callback of callbacks) callback(time)
		},
		get clock() {
			return clock
		}
	}
}

function loadPolishHelpers(overrides = {}) {
	const names = [
		'createResourceThemeProperties',
		'resourceTriplet',
		'createShellPassThroughController',
		'createResourceHudController',
		'resourceHudViewport',
		'cloneResourceHomes',
		'identityResourceTransform',
		'cloneResourceTransform',
		'isIdentityResourceTransform',
		'resourceTransformsClose',
		'interpolateNumber',
		'resourceAnimationNow',
		'finitePositive'
	]
	const declarations = names.map(name => extractFunction(shellSource, name)).join('\n')
	const sandbox = Object.assign({
		console: { info() {}, warn() {}, error() {} },
		window: new EventHub(),
		document: { activeElement: null },
		performance: { now: () => 0 },
		setTimeout,
		clearTimeout
	}, overrides)
	vm.createContext(sandbox)
	const helpers = vm.runInContext(`
		(function () {
			const BLUEPRINT_PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
			const UI_SCALE_BASE_WIDTH = 1600
			const UI_SCALE_BASE_HEIGHT = 1000
			const RESOURCE_HUD_ANIMATION_MS = 180
			const RESOURCE_HUD_MIN_SCALE = .48
			const RESOURCE_HUD_MAX_SCALE = .64
			const RESOURCE_HUD_LEFT_MARGIN_CSS = 20
			const RESOURCE_HUD_TOP_MARGIN_CSS = 16
			${declarations}
			return {
				createResourceThemeProperties,
				createShellPassThroughController,
				createResourceHudController
			}
		})()
	`, sandbox)
	return { helpers, sandbox }
}

function testPassThroughOrFocusAndCleanup() {
	const schedulers = createSchedulers()
	const windowHub = new EventHub()
	const focus = { blurred: 0, blur() { this.blurred += 1 } }
	const canvas = {}
	const shell = {
		dataset: {},
		contains(node) { return node === focus }
	}
	const { helpers, sandbox } = loadPolishHelpers({
		window: windowHub,
		document: { activeElement: focus },
		performance: schedulers.performance,
		setTimeout: schedulers.setTimeout,
		clearTimeout: schedulers.clearTimeout
	})
	let previewListener = null
	sandbox[Symbol.for('cattail.world-editor.blueprint-preview')] = {
		game: { canvas },
		subscribe(listener) {
			previewListener = listener
			listener({ active: false, effectivePinned: false })
			return function () { previewListener = null }
		}
	}
	const game = sandbox[Symbol.for('cattail.world-editor.blueprint-preview')].game
	const controller = helpers.createShellPassThroughController(game, shell)
	schedulers.flushTimers()
	assert.equal(shell.dataset.inputPassThrough, 'false')

	windowHub.dispatch('mousedown', { button: 2, target: canvas })
	assert.equal(shell.dataset.inputPassThrough, 'true')
	assert.equal(shell.dataset.passThroughReason, 'world-drag')
	assert.equal(focus.blurred, 1)
	previewListener({ active: true, effectivePinned: false })
	assert.equal(shell.dataset.passThroughReason, 'world-drag+blueprint-follow')
	windowHub.dispatch('mouseup', { button: 2 })
	assert.equal(shell.dataset.inputPassThrough, 'true', 'unpinned preview keeps OR condition active')
	previewListener({ active: true, effectivePinned: true })
	assert.equal(shell.dataset.inputPassThrough, 'false')
	windowHub.dispatch('mousedown', { button: 2, target: {} })
	assert.equal(shell.dataset.inputPassThrough, 'false', 'right drag must start on game canvas')
	windowHub.dispatch('mousedown', { button: 2, target: canvas })
	windowHub.dispatch('blur')
	assert.equal(shell.dataset.inputPassThrough, 'false')

	assert.equal(controller.dispose(), true)
	assert.equal(windowHub.listenerCount('mousedown'), 0)
	assert.equal(windowHub.listenerCount('mouseup'), 0)
	assert.equal(windowHub.listenerCount('blur'), 0)
	assert.equal(previewListener, null)
	assert.equal('inputPassThrough' in shell.dataset, false)
}

function testNativeResourceColorsAndFallbacks() {
	const { helpers } = loadPolishHelpers()
	const custom = helpers.createResourceThemeProperties({
		codex: { resources: [null, { triplet: ['#111111', '#222222', '#333333'] }, null, { triplet: ['#777777', '#888888', '#999999'] }, { triplet: ['#444444', '#555555', '#666666'] }] }
	})
	assert.equal(custom['--world-editor-elmerine-1'], '#111111')
	assert.equal(custom['--world-editor-elmerine-3'], '#333333')
	assert.equal(custom['--world-editor-beta-pylene-1'], '#777777')
	assert.equal(custom['--world-editor-beta-pylene-3'], '#999999')
	assert.equal(custom['--world-editor-hell-gem-1'], '#444444')
	assert.equal(custom['--world-editor-hell-gem-3'], '#666666')
	const fallback = helpers.createResourceThemeProperties({ codex: { resources: [] } })
	assert.deepEqual(JSON.parse(JSON.stringify(fallback)), {
		'--world-editor-elmerine-1': '#FFC759',
		'--world-editor-elmerine-2': '#FFE86F',
		'--world-editor-elmerine-3': '#FF8F60',
		'--world-editor-beta-pylene-1': '#F26F67',
		'--world-editor-beta-pylene-2': '#FFB68C',
		'--world-editor-beta-pylene-3': '#C02E63',
		'--world-editor-hell-gem-1': '#A6F246',
		'--world-editor-hell-gem-2': '#E3FD43',
		'--world-editor-hell-gem-3': '#4CB96B'
	})
}

function testResourceHudGeometryRenderingHoverAndRestore() {
	const schedulers = createSchedulers()
	const contextOperations = []
	const ctx = {
		save() { contextOperations.push(['save']) },
		restore() { contextOperations.push(['restore']) },
		translate(x, y) { contextOperations.push(['translate', x, y]) },
		scale(x, y) { contextOperations.push(['scale', x, y]) }
	}
	let canvasWidth = 1600
	let canvasHeight = 1000
	const canvas = {
		get width() { return canvasWidth },
		get height() { return canvasHeight },
		getBoundingClientRect() { return { left: 0, top: 0, width: canvasWidth, height: canvasHeight } }
	}
	class Game {
		setResourceHomes() {
			this.resourceHomes = this.resources.map((value, index) => [this.screenUnit * (index + 1) * .8, this.screenUnit])
		}
		setResourceHomesMobile() {
			this.resourceHomes = this.resources.map((value, index) => [50 + index * 100, this.screenUnit * 1.4])
		}
		renderResources() {
			this.renderHomesSeen = this.resourceHomes.map(home => home.slice())
			if (this.throwRender) throw new Error('render-failed')
			return 'reality-rendered'
		}
		renderDarkResources() {
			this.darkHomesSeen = this.resourceHomes.map(home => home.slice())
			return 'void-rendered'
		}
		updateMouseData() {
			this.hoveredResource = 'vanilla'
		}
		processMousemove2() {
			this.hoveredResource = 'vanilla-2'
		}
	}

	const game = new Game()
	game.canvas = canvas
	game.w = canvasWidth
	game.h = canvasHeight
	game.ctx = ctx
	game.screenUnit = 100
	game.resources = new Array(10).fill(1)
	game.mouse = { xy: [0, 0] }
	game.resourceHomes = game.resources.map((value, index) => [80 * (index + 1), 100])
	const initialHomesDescriptor = Object.getOwnPropertyDescriptor(game, 'resourceHomes')
	const originalRender = game.renderResources

	const { helpers } = loadPolishHelpers({
		window: { innerWidth: 1600, innerHeight: 1000 },
		document: { activeElement: null },
		performance: schedulers.performance,
		setTimeout: schedulers.setTimeout,
		clearTimeout: schedulers.clearTimeout,
		requestAnimationFrame: schedulers.requestAnimationFrame,
		cancelAnimationFrame: schedulers.cancelAnimationFrame
	})
	const controller = helpers.createResourceHudController(game)
	assert.notEqual(game.renderResources, originalRender)
	assert.equal(controller.setActive(true, 'test-enter'), true)
	let target = controller.probe.snapshot()
	assert.equal(target.belowShell, false)
	assert.equal(target.target.scale, .64)
	schedulers.stepFrame(90)
	const mid = controller.probe.snapshot()
	assert.ok(mid.current.scale < 1 && mid.current.scale > .64)
	schedulers.stepFrame(180)
	let state = controller.probe.snapshot()
	assert.equal(state.current.scale, .64)
	assert.ok(Math.abs(state.visualHomes[0][0] - 40 * .64 - 20) < .001, '20 CSS px left margin')
	assert.ok(Math.abs(state.visualHomes[0][1] - 40 * .64 - 16) < .001, 'resources stay at the 16 CSS px top margin')
	for (let index = 1; index < state.visualHomes.length; index += 1) {
		assert.ok(state.visualHomes[index][0] > state.visualHomes[index - 1][0], 'left-to-right order stays stable')
	}

	assert.equal(game.renderResources(), 'reality-rendered')
	assert.deepEqual(game.renderHomesSeen, state.baseHomes)
	assert.ok(contextOperations.some(operation => operation[0] === 'translate'))
	assert.ok(contextOperations.some(operation => operation[0] === 'scale' && operation[1] === .64))
	assert.equal(game.renderDarkResources(), 'void-rendered')
	assert.deepEqual(game.darkHomesSeen, state.baseHomes)

	const visualBeforeFailure = game.resourceHomes.map(home => home.slice())
	game.throwRender = true
	assert.throws(() => game.renderResources(), /render-failed/)
	assert.deepEqual(game.resourceHomes, visualBeforeFailure, 'render failure restores visual homes')
	assert.equal(contextOperations.at(-1)[0], 'restore')
	game.throwRender = false

	game.mouse.xy = game.resourceHomes[3].slice()
	game.updateMouseData()
	assert.equal(game.hoveredResource, 3)
	game.mouse.xy = game.resourceHomes[6].slice()
	game.processMousemove2()
	assert.equal(game.hoveredResource, 6)

	canvasWidth = 420
	game.w = canvasWidth
	assert.equal(controller.refreshLayout('test-resize'), true)
	target = controller.probe.snapshot()
	assert.equal(target.belowShell, false)
	assert.equal(target.target.scale, .48)
	schedulers.stepFrame(360)
	state = controller.probe.snapshot()
	assert.ok(Math.abs(state.visualHomes[0][1] - 40 * state.current.scale - 16) < .001, 'top margin is 16 CSS px')

	game.screenUnit = 90
	game.setResourceHomes()
	schedulers.stepFrame(540)
	state = controller.probe.snapshot()
	assert.equal(state.baseHomes[0][0], 72)
	assert.notDeepEqual(state.visualHomes, state.baseHomes)

	assert.equal(controller.setActive(false, 'test-exit'), true)
	schedulers.stepFrame(720)
	state = controller.probe.snapshot()
	assert.deepEqual(JSON.parse(JSON.stringify(state.current)), { scale: 1, offsetX: 0, offsetY: 0 })
	assert.deepEqual(game.resourceHomes, state.baseHomes)
	const baseAtDispose = state.baseHomes.map(home => home.slice())
	assert.equal(controller.dispose(), true)
	assert.equal(Object.hasOwn(game, 'renderResources'), false)
	assert.equal(game.renderResources, Game.prototype.renderResources)
	assert.deepEqual(game.resourceHomes, baseAtDispose)
	const restoredDescriptor = Object.getOwnPropertyDescriptor(game, 'resourceHomes')
	assert.equal(restoredDescriptor.enumerable, initialHomesDescriptor.enumerable)
	assert.equal(restoredDescriptor.configurable, initialHomesDescriptor.configurable)
	assert.equal(restoredDescriptor.writable, initialHomesDescriptor.writable)
}

function testSourceStyleScopeAndDocumentation() {
	assert.equal(manifest.version, '0.6.0')
	assert.equal(manifest.entry.length, 47)
	assert.equal(manifest.entry.includes('scripts/ui/resource-hud.js'), false)
	assert.match(shellSource, /resourceTriplet\(game, 1, \['#FFC759', '#FFE86F', '#FF8F60'\]\)/)
	assert.match(shellSource, /resourceTriplet\(game, 3, \['#F26F67', '#FFB68C', '#C02E63'\]\)/)
	assert.match(shellSource, /resourceTriplet\(game, 4, \['#A6F246', '#E3FD43', '#4CB96B'\]\)/)
	assert.match(shellSource, /rightDragFromCanvas \|\| previewFollowing/)
	assert.match(shellSource, /event\.target === game\?\.canvas/)
	assert.match(shellSource, /!!state\?\.active && !state\.effectivePinned/)
	assert.match(shellSource, /focused && shell\.contains\?\.\(focused\)/)
	assert.match(shellSource, /data-input-pass-through="true"] \*/)
	assert.match(shellSource, /pointer-events: none !important/)
	assert.match(dialogSource, /pointer-events: auto/)
	const dialogBaseStyle = dialogSource.match(/\.cattail-world-editor-dialog \{([^}]*)\}/)?.[1] || ''
	const dialogPrimaryStyle = dialogSource.match(/\.cattail-world-editor-dialog__button--primary \{([^}]*)\}/)?.[1] || ''
	assert.doesNotMatch(dialogBaseStyle, /--world-editor-dialog-primary-glass:/)
	assert.match(dialogPrimaryStyle, /--world-editor-dialog-primary-glass:/)
	assert.match(dialogPrimaryStyle, /--world-editor-dialog-primary-glass-shadow-pressed:/)
	assert.match(dialogSource, /data-kind\^="creative-"/)
	assert.match(dialogSource, /button\[data-glass-theme="elmerine"\]/)
	assert.match(dialogSource, /button--danger \{[\s\S]*--world-editor-dialog-primary-1: var\(--world-editor-beta-pylene-1\)/)
	assert.doesNotMatch(dialogSource, /--world-editor-dialog-accent: #d55a50/)
	assert.doesNotMatch(cutSource, /--world-editor-cut-accent/)
	assert.doesNotMatch(cutSource, /world-editor-elmerine-glass/)
	assert.match(cutSource, /selection-cut__layer-option\[data-active="true"\]/)
	assert.match(sessionSource, /blueprint-action="blocks"\]\[data-active="true"\]/)
	assert.match(sessionSource, /blueprint-action="surges"\]\[data-active="true"\]/)
	assert.match(sessionSource, /blueprint-card__place:hover:not\(:disabled\)/)
	assert.match(sessionSource, /blueprint-placement-option--active:not\(:disabled\)/)
	assert.match(shellSource, /data-toolbar-style="cards"[\s\S]*tool--creative[\s\S]*::after/)
	assert.doesNotMatch(cutSource, /selection-cut__button::after/)
	assert.match(sessionSource, /data-toolbar-style="cards"[\s\S]*blueprint-action="blocks"[\s\S]*::after/)
	assert.match(dialogSource, /--world-editor-dialog-primary-glass:[\s\S]*radial-gradient\(ellipse 92% 72% at 50% -18%[\s\S]*linear-gradient\(180deg[\s\S]*linear-gradient\(112deg/)
	assert.match(dialogSource, /background-blend-mode:\s*screen, screen, screen, normal;[\s\S]*backdrop-filter:\s*var\(--world-editor-dialog-glass-backdrop\)/)
	assert.match(dialogSource, /--world-editor-dialog-primary-glass-shadow:[\s\S]*inset 0 0 0 1px rgba\(255, 255, 255, \.62\)[\s\S]*inset 0 -1px 1px rgba\(255, 255, 255, \.68\)[\s\S]*0 5px 12px rgba\(10, 16, 24, \.16\)[\s\S]*0 0 26px/)
	assert.match(shellSource, /--world-editor-hell-gem-glass-hover:[\s\S]*radial-gradient\(ellipse 96% 78% at 50% -18%/)
	assert.match(shellSource, /tool--creative\[data-creative="true"\]:hover[\s\S]*background:\s*var\(--world-editor-hell-gem-glass-hover\)[\s\S]*box-shadow:\s*var\(--world-editor-hell-gem-glass-shadow-hover\)/)
	assert.match(sessionSource, /background: var\(--world-editor-hell-gem-glass-hover\)/)
	assert.match(sessionSource, /blueprint-card__place\s*\{[\s\S]*background:\s*var\(--world-editor-hell-gem-glass\);[\s\S]*box-shadow:\s*var\(--world-editor-hell-gem-glass-shadow\);/)
	assert.match(dialogSource, /opacity: \.38[\s\S]*box-shadow: none/)
	assert.match(readme, /Beta-Pylene/)
	assert.match(sessionSource, /preview-status\[data-status="buildable"\][^{]*\{ color: #09a943; \}/)
	assert.match(sessionSource, /preview-status\[data-status="satisfied"\][^{]*\{ color: #bd8c00; \}/)
	assert.match(cutSource, /status\[data-kind="warning"\][^{]*\{[^}]*--world-editor-local-status-accent:\s*var\(--world-editor-history-warning\);[^}]*--world-editor-local-status-color:\s*color-mix\(in srgb,\s*var\(--world-editor-history-warning\) 78%,\s*var\(--world-editor-shell-text\)\);/s)
	assert.doesNotMatch(cutSource, /status\[data-kind="warning"\][^{]*\{[^}]*color:\s*#f2cc60/s)
	assert.match(shellSource, /'setResourceHomesMobile'/)
	assert.match(shellSource, /'renderDarkResources'/)
	assert.match(shellSource, /'updateMouseData'/)
	assert.match(shellSource, /'processMousemove2'/)
	assert.match(shellSource, /RESOURCE_HUD_ANIMATION_MS = 180/)
	assert.match(shellSource, /RESOURCE_HUD_MIN_SCALE = \.48/)
	assert.match(shellSource, /RESOURCE_HUD_MAX_SCALE = \.64/)
	assert.match(shellSource, /RESOURCE_HUD_LEFT_MARGIN_CSS = 20/)
	assert.match(shellSource, /RESOURCE_HUD_TOP_MARGIN_CSS = 16/)
	assert.doesNotMatch(shellSource, /RESOURCE_HUD_SHELL_GAP_CSS/)
	assert.doesNotMatch(shellSource, /resourceHudShellRect/)
	assert.match(shellSource, /1 - Math\.pow\(1 - progress, 3\)/)
	assert.match(shellSource, /Object\.getOwnPropertyDescriptor\(game, 'resourceHomes'\)/)
	assert.match(shellSource, /restoreMethodsAndHomes/)
	assert.match(readme, /界面打磨：穿透、资源色玻璃按钮与左上资源 HUD/)
}

function run() {
	testPassThroughOrFocusAndCleanup()
	testNativeResourceColorsAndFallbacks()
	testResourceHudGeometryRenderingHoverAndRestore()
	testSourceStyleScopeAndDocumentation()
	console.log('World Editor UI polish verification passed: pass-through OR/focus/cleanup, native resource glass themes, HUD geometry/animation/render/hover/restore, scope, and documentation.')
}

run()
