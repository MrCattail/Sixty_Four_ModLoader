'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const source = fs.readFileSync(loaderPath, 'utf8')
const warnings = []

function createFakeContext(canvas) {
	return {
		canvas,
		operations: [],
		save() { this.operations.push('save') },
		restore() { this.operations.push('restore') },
		setTransform() { this.operations.push('setTransform') },
		getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } },
		clearRect() { this.operations.push('clearRect') },
		fillRect() { this.operations.push('fillRect') },
		getLineDash() { return [] },
		setLineDash() {}
	}
}

function createFakeClassList(node) {
	const values = new Set()
	return {
		add(...names) {
			for (const name of names) values.add(name)
			node.className = Array.from(values).join(' ')
		},
		remove(...names) {
			for (const name of names) values.delete(name)
			node.className = Array.from(values).join(' ')
		},
		toggle(name, enabled) {
			if (enabled === undefined ? !values.has(name) : enabled) values.add(name)
			else values.delete(name)
			node.className = Array.from(values).join(' ')
			return values.has(name)
		},
		contains(name) { return values.has(name) }
	}
}

let fakeDocument

function detachFakeNode(node) {
	if (!node?.parentNode) return
	const index = node.parentNode.children.indexOf(node)
	if (index >= 0) node.parentNode.children.splice(index, 1)
	node.parentNode = null
}

function createFakeNode(tagName) {
	const node = {
		tagName: String(tagName || '').toUpperCase(),
		id: '',
		className: '',
		dataset: {},
		style: {},
		children: [],
		parentNode: null,
		width: 0,
		height: 0,
		setAttribute() {},
		appendChild(child) {
			detachFakeNode(child)
			this.children.push(child)
			child.parentNode = this
			return child
		},
		insertBefore(child, before) {
			detachFakeNode(child)
			const index = before ? this.children.indexOf(before) : -1
			if (index >= 0) this.children.splice(index, 0, child)
			else this.children.push(child)
			child.parentNode = this
			return child
		},
		remove() { detachFakeNode(this) },
		getBoundingClientRect() { return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height } }
	}
	node.classList = createFakeClassList(node)
	Object.defineProperty(node, 'isConnected', {
		get() {
			let current = node
			while (current) {
				if (current === fakeDocument?.body || current === fakeDocument?.head) return true
				current = current.parentNode
			}
			return false
		}
	})
	if (node.tagName === 'CANVAS') {
		const context = createFakeContext(node)
		node.getContext = function (type) { return type === '2d' ? context : null }
	}
	return node
}

fakeDocument = {
	body: createFakeNode('body'),
	head: createFakeNode('head'),
	addEventListener() {},
	removeEventListener() {},
	createElement: createFakeNode,
	getElementById(id) {
		const pending = [ this.head, this.body ]
		while (pending.length) {
			const node = pending.shift()
			if (node.id === id) return node
			pending.push(...node.children)
		}
		return null
	}
}

function FakeGame() {
	this.w = 320
	this.h = 180
	this.pixelRatio = 1
	this.canvas = createFakeNode('canvas')
	this.canvas.width = this.w
	this.canvas.height = this.h
	fakeDocument.body.appendChild(this.canvas)
	this.ctx = this.canvas.getContext('2d')
	this.touchMode = 0
	this.photofobia = false
	this.flashlight = null
	this.plane = 0
}

FakeGame.prototype.renderCursor = function () {
	this.ctx.operations.push('vanilla-cursor')
}
FakeGame.prototype.renderloop = function () {
	this.renderCursor()
	return 'rendered'
}
FakeGame.prototype.initScreenSize = function () {}
FakeGame.prototype.initScreenSizeMobile = function () {}

const sandbox = {
	window: {
		devicePixelRatio: 1,
		innerWidth: 320,
		innerHeight: 180,
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {}
	},
	document: fakeDocument,
	Game: FakeGame,
	CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail },
	console: {
		log() {},
		warn(...args) { warnings.push(args.join(' ')) }
	},
	performance: { now() { return 0 } },
	setTimeout,
	clearTimeout
}
sandbox.window.window = sandbox.window

vm.runInNewContext(source, sandbox, { filename: loaderPath })

const modLoader = sandbox.window.ModLoader
const render = modLoader.render

assert.equal(render.version, '1.0.0')
assert.equal(render.apiVersion, '1.0.0')
assert.equal(render.stability, 'stable')
assert.equal(render.supports('canvas2dLayers'), true)
assert.equal(render.supports('conflictDiagnostics'), true)
assert.equal(render.supports('webgl2Layers'), false)
assert.equal(render.supports('methodEmitters'), false)
assert.equal(Object.isFrozen(render.capabilities), true)

const contract = JSON.parse(JSON.stringify(render.contract()))
assert.equal(contract.version, '1.0.0')
assert.equal(contract.major, 1)
assert.equal(contract.versioning, 'semver')
assert.equal(contract.backend, 'canvas2d')
assert.equal(contract.conflictResolution, 'last-registration-wins')
assert.deepEqual(contract.layerContextTypes, [ '2d' ])
assert.equal(contract.capabilities.canvas2dLayers, true)
assert.equal(contract.capabilities.webgl2Layers, false)

render.clearConflicts()
const renderA = modLoader.forMod('render-contract-a').render
const renderB = modLoader.forMod('render-contract-b').render
const builtInOverrideScope = renderA.scope()
builtInOverrideScope.defineLayer('reduced-flashes', { order: 43, zIndex: 43 })
builtInOverrideScope.routeMethod('renderCursor', 'ui')
assert.equal(render.conflicts().length, 0)
assert.equal(builtInOverrideScope.dispose(), true)
assert.equal(render.describeLayer('reduced-flashes').definitionOwner, 'ModLoader')
assert.equal(render.getMethodLayer('renderCursor'), 'cursor')

const scopeA = renderA.scope()
const scopeB = renderB.scope()

scopeA.defineLayer('contract-shared', { order: 101, cache: true })
let layer = render.describeLayer('contract-shared')
assert.equal(layer.definitionOwner, 'render-contract-a')
assert.equal(layer.order, 101)
assert.equal(layer.cached, true)

scopeB.defineLayer('contract-shared', { order: 202, cache: false })
layer = render.describeLayer('contract-shared')
assert.equal(layer.definitionOwner, 'render-contract-b')
assert.equal(layer.order, 202)
assert.equal(layer.cached, false)

let conflicts = render.conflicts({ type: 'layer-definition' })
assert.equal(conflicts.length, 1)
assert.equal(conflicts[0].key, 'contract-shared')
assert.equal(conflicts[0].existingOwner, 'render-contract-a')
assert.equal(conflicts[0].incomingOwner, 'render-contract-b')
assert.equal(conflicts[0].resolution, 'last-registration-wins')
conflicts[0].previous.order = -1
assert.equal(render.conflicts({ type: 'layer-definition' })[0].previous.order, 101)

scopeA.routeMethod('renderContractProbe', 'ui')
scopeB.routeMethod('renderContractProbe', 'effects')
let route = render.routedMethods({ all: true }).find(function (entry) { return entry.method === 'renderContractProbe' })
assert.equal(route.layer, 'effects')
assert.equal(route.owner, 'render-contract-b')

conflicts = render.conflicts({ type: 'method-route' })
assert.equal(conflicts.length, 1)
assert.equal(conflicts[0].key, 'renderContractProbe')
assert.equal(conflicts[0].previous, 'ui')
assert.equal(conflicts[0].incoming, 'effects')

assert.equal(scopeB.dispose(), true)
assert.equal(scopeB.dispose(), false)
layer = render.describeLayer('contract-shared')
assert.equal(layer.definitionOwner, 'render-contract-a')
assert.equal(layer.order, 101)
route = render.routedMethods({ all: true }).find(function (entry) { return entry.method === 'renderContractProbe' })
assert.equal(route.layer, 'ui')
assert.equal(route.owner, 'render-contract-a')

assert.equal(scopeA.dispose(), true)
layer = render.describeLayer('contract-shared')
assert.equal(layer.definitionOwner, null)
assert.equal(layer.custom, false)
assert.equal(render.getMethodLayer('renderContractProbe'), null)

const summary = render.summary()
assert.equal(summary.version, '1.0.0')
assert.equal(summary.stability, 'stable')
assert.equal(summary.conflictCount, 2)
assert.equal(summary.conflicts, 2)
assert.equal(render.diagnostics.conflicts().length, 2)
assert.equal(warnings.length, 2)

assert.equal(render.setEnabled(false), false)
assert.equal(render.summary().enabled, false)
assert.equal(render.setEnabled(true), true)
assert.equal(render.clearConflicts(), 2)
assert.equal(render.conflicts().length, 0)

const frameCalls = []
const lifecycleCalls = []
const runtimeScopeA = renderA.scope()
const runtimeScopeB = renderB.scope()
runtimeScopeA.onReady(function () { lifecycleCalls.push('ready') })
runtimeScopeA.onFrameStart(function () { lifecycleCalls.push('frameStart') })
runtimeScopeA.onFrame(function () { lifecycleCalls.push('frame') })
runtimeScopeA.demandLayer('ui', { id: 'runtime-ui-demand' })
runtimeScopeA.onLayer('interaction', function () {
	frameCalls.push('a-error')
	throw new Error('expected callback isolation probe')
}, { id: 'runtime-error', order: 1, space: 'screen' })
runtimeScopeB.onLayer('interaction', function () {
	frameCalls.push('b-ok')
}, { id: 'runtime-success', order: 2, space: 'screen' })

const game = new FakeGame()
render.install(game)
assert.deepEqual(lifecycleCalls, [ 'ready' ])
assert.equal(game.renderloop(), 'rendered')
assert.deepEqual(frameCalls, [ 'a-error', 'b-ok' ])
assert.deepEqual(lifecycleCalls, [ 'ready', 'frameStart', 'frame' ])
assert.equal(warnings.length, 3)
assert.equal(render.demandedLayers().includes('ui'), true)
assert.equal(render.demandedLayers().includes('cursor'), true)

const manager = game.__modloaderRenderLayerManager
assert.ok(manager)
assert.equal(manager.layers.cursor.canvas.width, 320)
assert.equal(manager.layers.cursor.canvas.height, 180)
assert.equal(manager.layers.cursor.ctx.operations.includes('vanilla-cursor'), true)
assert.equal(game.canvas.getContext('2d').operations.includes('vanilla-cursor'), false)
assert.equal(manager.layers.interaction.canvas.style.display, '')

const frameCallCount = frameCalls.length
const mainCursorCount = game.canvas.getContext('2d').operations.filter(function (entry) { return entry === 'vanilla-cursor' }).length
assert.equal(render.setEnabled(false), false)
assert.equal(manager.layers.cursor.canvas.style.display, 'none')
assert.equal(manager.layers.interaction.canvas.style.display, 'none')
assert.equal(game.renderloop(), 'rendered')
assert.equal(frameCalls.length, frameCallCount)
assert.equal(game.canvas.getContext('2d').operations.filter(function (entry) { return entry === 'vanilla-cursor' }).length, mainCursorCount + 1)

assert.equal(render.setEnabled(true), true)
game.w = 640
game.h = 360
game.initScreenSize()
assert.equal(manager.layers.cursor.canvas.width, 640)
assert.equal(manager.layers.cursor.canvas.height, 360)
assert.equal(manager.layers.interaction.canvas.width, 640)
assert.equal(manager.layers.interaction.canvas.height, 360)

assert.equal(runtimeScopeB.dispose(), true)
assert.equal(runtimeScopeA.dispose(), true)
assert.equal(game.renderloop(), 'rendered')
assert.equal(frameCalls.length, frameCallCount)
assert.equal(manager.layers.cursor.canvas.style.display, 'none')
assert.equal(manager.layers.interaction.canvas.style.display, 'none')

console.log('Render API v1 contract test passed.')
