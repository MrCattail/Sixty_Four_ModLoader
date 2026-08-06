const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
const I18N_KEY = Symbol.for('cattail.world-editor.i18n')

function loadModules(relativePaths, extras = {}) {
	const definitions = []
	const sandbox = Object.assign({
		console: {
			info() {},
			warn() {},
			error() {}
		},
		ModLoader: {
			register(definition) {
				definitions.push(definition)
			}
		}
	}, extras)
	vm.createContext(sandbox)
	for (const relativePath of relativePaths) {
		const filename = path.join(MOD_ROOT, relativePath)
		vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
	}
	return { definitions, sandbox }
}

function createApi() {
	const handlers = new Map()
	return {
		id: 'Cattail_TweaksQuality_World-Editor',
		on(name, listener) {
			if (!handlers.has(name)) handlers.set(name, [])
			handlers.get(name).push(listener)
		},
		patch(target, key, wrap) {
			target[key] = wrap(target[key])
		},
		emit(name, ...args) {
			for (const listener of handlers.get(name) || []) listener(...args)
		}
	}
}

function createRuntime(game) {
	const listeners = new Set()
	const cleanups = []
	let active = true
	return {
		game,
		snapshot() {
			return { active }
		},
		isActive() {
			return active
		},
		subscribe(listener) {
			listeners.add(listener)
			listener({ active })
			return () => listeners.delete(listener)
		},
		addCleanup(cleanup) {
			cleanups.push(cleanup)
		},
		deactivate() {
			active = false
			for (const listener of listeners) listener({ active: false })
		},
		runCleanups() {
			while (cleanups.length) cleanups.pop()()
		}
	}
}

function createFrameQueue() {
	let nextId = 1
	const callbacks = new Map()
	return {
		request(callback) {
			const id = nextId++
			callbacks.set(id, callback)
			return id
		},
		cancel(id) {
			callbacks.delete(id)
		},
		flushOne() {
			const entry = callbacks.entries().next().value
			if (!entry) return false
			callbacks.delete(entry[0])
			entry[1](0)
			return true
		},
		flushAll(limit = 100) {
			let count = 0
			while (this.flushOne()) {
				count += 1
				if (count > limit) throw new Error('Frame queue did not settle.')
			}
			return count
		},
		get size() {
			return callbacks.size
		}
	}
}

function plain(value) {
	return JSON.parse(JSON.stringify(value))
}

function range(start, end) {
	const minU = Math.min(start[0], end[0])
	const maxU = Math.max(start[0], end[0])
	const minV = Math.min(start[1], end[1])
	const maxV = Math.max(start[1], end[1])
	return {
		start,
		end,
		minU,
		maxU,
		minV,
		maxV,
		width: maxU - minU + 1,
		height: maxV - minV + 1
	}
}

function testAnalysisState() {
	class Game {
		constructor() {
			this.plane = false
		}

		switchPlane() {}
	}

	const frames = createFrameQueue()
	const { definitions, sandbox } = loadModules([
		'scripts/core/selection-state.js',
		'scripts/core/selection-analysis.js'
	], {
		Game,
		requestAnimationFrame: callback => frames.request(callback),
		cancelAnimationFrame: id => frames.cancel(id),
		setTimeout,
		clearTimeout
	})
	const api = createApi()
	for (const definition of definitions) definition.init(api)
	api.emit('afterVanillaScripts')

	const building = { name: 'pump' }
	const cube = { name: 'cube' }
	const entities = new Map([
		['0:0', building],
		['1:0', building],
		['0:1', cube]
	])
	let lookupCount = 0
	const game = new Game()
	game.entityAtCoordinates = function (cell) {
		lookupCount += 1
		return entities.get(cell[0] + ':' + cell[1]) || null
	}
	const runtime = createRuntime(game)
	sandbox[RUNTIME_KEY] = runtime
	api.emit('afterGameInit', {}, game)

	const selection = sandbox[SELECTION_KEY]
	const analysis = sandbox[ANALYSIS_KEY]
	assert.equal(analysis.version, '0.2.1')
	assert.equal(analysis.snapshot().status, 'idle')

	selection.begin([0, 0], 0, 'test-start')
	assert.equal(analysis.snapshot().phase, 'preview')
	assert.equal(analysis.snapshot().status, 'scanning')
	assert.equal(analysis.snapshot().total, 1)
	frames.flushAll()
	assert.equal(analysis.snapshot().status, 'ready')
	assert.equal(analysis.snapshot().occupied, 1)
	assert.equal(analysis.snapshot().buildings, 1)

	selection.updatePreview([1, 1], 0, 'test-preview')
	assert.equal(analysis.snapshot().total, 4)
	frames.flushAll()
	assert.deepEqual(plain({
		phase: analysis.snapshot().phase,
		status: analysis.snapshot().status,
		total: analysis.snapshot().total,
		occupied: analysis.snapshot().occupied,
		empty: analysis.snapshot().empty,
		buildings: analysis.snapshot().buildings,
		cubes: analysis.snapshot().cubes
	}), {
		phase: 'preview',
		status: 'ready',
		total: 4,
		occupied: 3,
		empty: 1,
		buildings: 1,
		cubes: 1
	})

	const lookupsBeforeCommit = lookupCount
	selection.commit([1, 1], 0, 'test-commit')
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.equal(analysis.snapshot().status, 'ready')
	assert.equal(lookupCount, lookupsBeforeCommit)

	selection.begin([20, 20], 0, 'replacement-preview')
	frames.flushAll()
	assert.equal(analysis.snapshot().range.minU, 20)
	selection.cancelPreview('restore-old')
	assert.equal(analysis.snapshot().phase, 'selected')
	assert.deepEqual(plain(analysis.snapshot().range), range([0, 0], [1, 1]))
	assert.equal(analysis.snapshot().occupied, 3)

	selection.begin([0, 0], 0, 'large-preview')
	selection.updatePreview([599, 0], 0, 'large-preview')
	assert.equal(analysis.snapshot().total, 600)
	frames.flushOne()
	assert.equal(analysis.snapshot().status, 'scanning')
	assert.equal(analysis.snapshot().processed, 512)
	assert.ok(analysis.snapshot().progress > .8 && analysis.snapshot().progress < 1)
	selection.updatePreview([2, 0], 0, 'cancel-large-preview')
	assert.equal(analysis.snapshot().total, 3)
	frames.flushAll()
	assert.equal(analysis.snapshot().status, 'ready')
	assert.equal(frames.size, 0)

	game.plane = true
	game.switchPlane()
	assert.equal(analysis.snapshot().status, 'idle')
	assert.equal(analysis.snapshot().range, null)
	runtime.runCleanups()
	assert.equal(sandbox[ANALYSIS_KEY], undefined)
}

class EventHub {
	constructor() {
		this.listeners = new Map()
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, event = {}) {
		for (const listener of (this.listeners.get(type) || []).slice()) listener(event)
	}
}

class MiniElement {
	constructor(tagName, ownerDocument) {
		this.tagName = String(tagName).toUpperCase()
		this.ownerDocument = ownerDocument
		this.children = []
		this.parentNode = null
		this.dataset = {}
		this.attributes = {}
		this.className = ''
		this.id = ''
		this.textContent = ''
		this.style = {}
		this.listeners = new Map()
		this.offsetWidth = 288
		this.offsetHeight = 178
	}

	append(...nodes) {
		for (const node of nodes) {
			node.parentNode = this
			this.children.push(node)
		}
	}

	remove() {
		if (!this.parentNode) return
		const index = this.parentNode.children.indexOf(this)
		if (index >= 0) this.parentNode.children.splice(index, 1)
		this.parentNode = null
	}

	setAttribute(name, value) {
		this.attributes[name] = String(value)
	}

	getAttribute(name) {
		return this.attributes[name]
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, [])
		this.listeners.get(type).push(listener)
	}

	removeEventListener(type, listener) {
		const entries = this.listeners.get(type) || []
		this.listeners.set(type, entries.filter(entry => entry !== listener))
	}

	dispatch(type, event = {}) {
		for (const listener of (this.listeners.get(type) || []).slice()) listener(event)
		return event
	}

	querySelector(selector) {
		const textMatch = selector.match(/^\[data-world-editor-text="([^"]+)"\]$/)
		if (textMatch) return this.find(node => node.dataset.worldEditorText === textMatch[1])
		if (selector === '[data-world-editor-progress-fill]') {
			return this.find(node => Object.prototype.hasOwnProperty.call(node.dataset, 'worldEditorProgressFill'))
		}
		return null
	}

	find(predicate) {
		for (const child of this.children) {
			if (predicate(child)) return child
			const nested = child.find(predicate)
			if (nested) return nested
		}
		return null
	}

	getBoundingClientRect() {
		return {
			left: Number.parseFloat(this.style.left) || 0,
			top: Number.parseFloat(this.style.top) || 0,
			width: this.offsetWidth,
			height: this.offsetHeight
		}
	}

	get isConnected() {
		let node = this
		while (node) {
			if (node === this.ownerDocument.body || node === this.ownerDocument.head) return true
			node = node.parentNode
		}
		return false
	}
}

function createMiniDocument() {
	const document = {}
	document.createElement = tagName => new MiniElement(tagName, document)
	document.body = document.createElement('body')
	document.head = document.createElement('head')
	document.documentElement = { clientWidth: 1000, clientHeight: 800 }
	document.getElementById = id => (
		document.body.find(node => node.id === id) ||
		document.head.find(node => node.id === id)
	)
	return document
}

function createFeed(initialState) {
	let state = initialState
	const listeners = new Set()
	return {
		game: null,
		snapshot() {
			return state
		},
		subscribe(listener) {
			listeners.add(listener)
			listener(state)
			return () => listeners.delete(listener)
		},
		emit(nextState) {
			state = nextState
			for (const listener of listeners) listener(state)
		}
	}
}

function testSelectionCard() {
	const document = createMiniDocument()
	const windowHub = new EventHub()
	windowHub.innerWidth = 1000
	windowHub.innerHeight = 800
	windowHub.setInterval = () => 1
	windowHub.clearInterval = () => {}

	const { definitions, sandbox } = loadModules([
		'scripts/core/shared.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/selection-card.js'
	], {
		document,
		window: windowHub,
		devicePixelRatio: 1
	})
	const api = createApi()
	let frameCallback = null
	let renderEnabled = true
	let releasedHud = false
	api.render = {
		onFrame(callback) {
			frameCallback = callback
			return () => {
				frameCallback = null
			}
		},
		isEnabled() {
			return renderEnabled
		}
	}
	api.ui = {
		hud: {
			isHidden() {
				return false
			},
			register() {
				return () => {
					releasedHud = true
				}
			}
		},
		isVanillaGameHudHidden() {
			return false
		}
	}
	for (const definition of definitions) definition.init(api)

	const canvas = {
		width: 800,
		height: 600,
		getBoundingClientRect() {
			return { left: 100, top: 50, width: 800, height: 600 }
		}
	}
	const game = {
		language: 'sch',
		plane: false,
		halt: false,
		splash: { isShown: false },
		canvas,
		w: 800,
		h: 600,
		w2: 400,
		h2: 300,
		pixelRatio: 1,
		uvToXY(uv) {
			return [uv[0] * 20, uv[1] * 10]
		}
	}
	const runtime = createRuntime(game)
	const selectionRange = range([0, 0], [1, 1])
	const selection = createFeed({ plane: 0, previewRange: selectionRange, selectedRange: null })
	selection.game = game
	const analysis = createFeed({
		version: '0.2.1',
		key: '0:0:1:0:1',
		phase: 'preview',
		status: 'scanning',
		range: selectionRange,
		plane: 0,
		progress: .5,
		processed: 2,
		total: 4,
		occupied: 1,
		empty: null,
		buildings: 1,
		cubes: 0
	})
	analysis.game = game
	sandbox[RUNTIME_KEY] = runtime
	sandbox[SELECTION_KEY] = selection
	sandbox[ANALYSIS_KEY] = analysis
	assert.equal(sandbox[I18N_KEY].keys.length, 249)
	api.emit('afterGameInit', {}, game)

	const card = document.getElementById('cattail-world-editor-selection-card')
	assert.ok(card)
	assert.equal(card.dataset.worldEditorScrollbar, '')
	assert.ok(frameCallback)
	frameCallback({ game })
	assert.equal(card.dataset.visible, 'true')
	assert.equal(card.dataset.positionVisible, 'true')
	assert.equal(card.dataset.placement, 'right')
	assert.equal(card.style.left, '558px')
	assert.equal(card.style.top, '266px')
	const blueprintObstacle = document.createElement('div')
	blueprintObstacle.id = 'cattail-world-editor-blueprint-card'
	blueprintObstacle.dataset.visible = 'true'
	blueprintObstacle.dataset.positionVisible = 'true'
	blueprintObstacle.setAttribute('aria-hidden', 'false')
	blueprintObstacle.style.left = '558px'
	blueprintObstacle.style.top = '266px'
	document.body.append(blueprintObstacle)
	frameCallback({ game })
	assert.equal(card.dataset.placement, 'left')
	assert.equal(card.style.left, '174px')
	blueprintObstacle.remove()
	frameCallback({ game })
	assert.equal(card.dataset.placement, 'right')
	assert.equal(card.querySelector('[data-world-editor-text="title"]').textContent, '选区预览')
	assert.equal(card.querySelector('[data-world-editor-text="coordinates"]').textContent, 'u 0→1  v 0→1')
	assert.equal(card.querySelector('[data-world-editor-text="size-value"]').textContent, '2×2')
	assert.equal(card.querySelector('[data-world-editor-text="u-length-label"]').textContent, 'U 长度')
	assert.equal(card.querySelector('[data-world-editor-text="u-length-value"]').textContent, '2')
	assert.equal(card.querySelector('[data-world-editor-text="v-length-label"]').textContent, 'V 长度')
	assert.equal(card.querySelector('[data-world-editor-text="v-length-value"]').textContent, '2')
	assert.equal(card.querySelector('[data-world-editor-text="tiles-value"]').textContent, '4')
	assert.equal(card.querySelector('[data-world-editor-text="occupied-value"]').textContent, '≥1')
	assert.equal(card.querySelector('[data-world-editor-text="analysis-status"]').textContent, '正在统计 50%')
	assert.equal(card.querySelector('[data-world-editor-text="hint"]').textContent, '点击终点 / Esc 取消')
	assert.equal(card.querySelector('[data-world-editor-progress-fill]').style.width, '50%')

	const nonSquareRange = range([0, 0], [2, 4])
	selection.emit({ plane: 0, previewRange: nonSquareRange, selectedRange: selectionRange })
	assert.equal(card.querySelector('[data-world-editor-text="size-value"]').textContent, '3×5')
	assert.equal(card.querySelector('[data-world-editor-text="u-length-value"]').textContent, '3')
	assert.equal(card.querySelector('[data-world-editor-text="v-length-value"]').textContent, '5')

	selection.emit({ plane: 0, previewRange: selectionRange, selectedRange: selectionRange, previewKind: 'move' })
	assert.equal(card.querySelector('[data-world-editor-text="title"]').textContent, '移动预览')
	assert.equal(card.querySelector('[data-world-editor-text="hint"]').textContent, '松开完成移动 / Esc 取消')
	selection.emit({ plane: 0, previewRange: selectionRange, selectedRange: selectionRange, previewKind: 'resize' })
	assert.equal(card.querySelector('[data-world-editor-text="title"]').textContent, '缩放预览')
	assert.equal(card.querySelector('[data-world-editor-text="hint"]').textContent, '松开以缩放 / Esc 取消')
	selection.emit({ plane: 0, previewRange: selectionRange, selectedRange: null, previewKind: 'selection' })

	analysis.emit({
		version: '0.2.1',
		key: '0:0:1:0:1',
		phase: 'selected',
		status: 'ready',
		range: selectionRange,
		plane: 0,
		progress: 1,
		processed: 4,
		total: 4,
		occupied: 3,
		empty: 1,
		buildings: 1,
		cubes: 1
	})
	selection.emit({ plane: 0, previewRange: null, selectedRange: selectionRange })
	assert.equal(card.querySelector('[data-world-editor-text="title"]').textContent, '已选区域')
	assert.equal(card.querySelector('[data-world-editor-text="occupied-value"]').textContent, '3')
	assert.equal(card.querySelector('[data-world-editor-text="empty-value"]').textContent, '1')
	assert.equal(card.querySelector('[data-world-editor-text="buildings-value"]').textContent, '1')
	assert.equal(card.querySelector('[data-world-editor-text="cubes-value"]').textContent, '1')
	assert.equal(card.querySelector('[data-world-editor-text="hint"]').textContent, '')

	game.language = 'en'
	api.emit('afterWords', {}, game)
	assert.equal(card.querySelector('[data-world-editor-text="title"]').textContent, 'Selection')
	assert.equal(card.querySelector('[data-world-editor-text="occupied-label"]').textContent, 'Occupied')

	game.uvToXY = uv => [400 + uv[0] * 20, uv[1] * 10]
	frameCallback({ game })
	assert.equal(card.dataset.placement, 'left')
	assert.equal(card.style.left, '574px')

	windowHub.innerWidth = 600
	game.uvToXY = uv => [-200 + uv[0] * 20, uv[1] * 10]
	frameCallback({ game })
	assert.equal(card.dataset.placement, 'below')
	assert.equal(card.style.left, '166px')
	assert.equal(card.style.top, '393px')

	game.uvToXY = uv => [-200 + uv[0] * 20, 300 + uv[1] * 10]
	frameCallback({ game })
	assert.equal(card.dataset.placement, 'above')
	assert.equal(card.style.top, '439px')

	windowHub.innerWidth = 1000
	game.uvToXY = uv => [1000 + uv[0], 1000 + uv[1]]
	frameCallback({ game })
	assert.equal(card.dataset.positionVisible, 'false')

	renderEnabled = false
	game.uvToXY = uv => [uv[0] * 20, uv[1] * 10]
	frameCallback({ game })
	assert.equal(card.dataset.positionVisible, 'false')

	renderEnabled = true
	frameCallback({ game })
	assert.equal(card.dataset.positionVisible, 'true')
	windowHub.dispatch('modloader:game-hud', { detail: { game, hidden: true } })
	assert.equal(card.getAttribute('aria-hidden'), 'true')

	runtime.runCleanups()
	assert.equal(document.getElementById('cattail-world-editor-selection-card'), null)
	assert.equal(releasedHud, true)
	assert.equal(frameCallback, null)
}

function testManifest() {
	const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
	assert.equal(manifest.version, '0.5.1')
	assert.equal(manifest.languageSupport.gameLanguage, true)
	assert.deepEqual(manifest.entry, [
		'scripts/core/foundation.js',
		'scripts/core/shared.js',
		'scripts/core/editor-state.js',
		'scripts/core/creative-mode.js',
		'scripts/core/creative-economy.js',
		'scripts/core/editor-transactions.js',
		'scripts/core/selection-state.js',
		'scripts/core/tool-state.js',
		'scripts/core/selection-analysis.js',
		'scripts/core/production-state.js',
		'scripts/core/blueprint-state.js',
		'scripts/core/blueprint-library-format.js',
		'scripts/core/blueprint-transform.js',
		'scripts/core/blueprint-preview-plan.js',
		'scripts/core/blueprint-placement.js',
		'scripts/core/selection-delete.js',
		'scripts/core/input-controller.js',
		'scripts/render/resize-handles.js',
		'scripts/input/selection-controller.js',
		'scripts/render/hover-overlay.js',
		'scripts/render/selected-overlay.js',
		'scripts/i18n/editor-text.js',
		'scripts/ui/card-opacity.js',
		'scripts/ui/dialog.js',
		'scripts/ui/editor-shell.js',
		'scripts/ui/selection-delete-ui.js',
		'scripts/blueprint-session.js',
		'scripts/core/blueprint-library.js',
		'scripts/core/selection-cut.js',
		'scripts/ui/selection-cut-ui.js',
		'scripts/blueprint-preview.js',
		'scripts/render/selection-cursor.js',
		'scripts/render/blueprint-thumbnail.js',
		'scripts/ui/blueprint-library-ui.js',
		'scripts/ui/selection-card.js',
		'scripts/ui/production-cards.js'
	])
}

testAnalysisState()
testSelectionCard()
testManifest()
console.log('2B verification passed: analysis, cancellation, snapshot reuse, card positioning, HUD lifecycle, i18n, and manifest.')
