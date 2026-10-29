'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const CORE_PATH = process.argv[2] || path.join(MOD_ROOT, 'scripts/core.js')
const coreSource = fs.readFileSync(CORE_PATH, 'utf8')
const entrySource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/coordinate-overlay.js'), 'utf8')
const nativePath = path.resolve(MOD_ROOT, '../../scripts/game.js')
const nativeSource = fs.readFileSync(nativePath, 'utf8')
let scenarios = 0

function classList() {
	const values = new Set()
	return {
		add(value) { values.add(value) },
		remove(value) { values.delete(value) },
		contains(value) { return values.has(value) }
	}
}

function createHarness({ ratio = 1, zoom = 1, pointer = [640, 360], offset = [0, 0], enabled = true } = {}) {
	const elements = []
	const listeners = new Map()
	const hooks = []
	const frames = []
	const calls = []
	function createElement(tag) {
		const element = {
			tag, children: [], style: {}, classList: classList(),
			append(...children) { this.children.push(...children) },
			setAttribute() {},
			contains(target) { return target === this || this.children.some(child => child.contains(target)) },
			addEventListener(type, callback) { this[type] = callback },
			focus() { this.focused = true },
			select() { this.selected = true },
			getBoundingClientRect() { return { width: 146, height: 36 } }
		}
		elements.push(element)
		return element
	}
	const document = {
		createElement,
		getElementById(id) { return elements.find(element => element.id === id) },
		head: createElement('head'), body: createElement('body')
	}
	const api = {
		on(name, callback) { if (name === 'afterVanillaScripts') hooks.push(callback) },
		config: { get(key, fallback) { return key === 'enableCoordinateOverlay' ? enabled : false } },
		patch(target, method, wrapper) { target[method] = wrapper(target[method]) }
	}
	const sandbox = {
		console, document, innerWidth: 1280, innerHeight: 720,
		requestAnimationFrame(callback) { frames.push(callback) },
		addEventListener(type, callback) {
			if (!listeners.has(type)) listeners.set(type, [])
			listeners.get(type).push(callback)
		},
		ModLoader: { register(definition) { definition.init(api) } }
	}
	sandbox.window = sandbox
	vm.createContext(sandbox)
	// Execute the real desktop 1.3 class without constructing a game or drawing.
	vm.runInContext(nativeSource, sandbox, { filename: nativePath })
	const Game = vm.runInContext('Game', sandbox)
	Game.prototype.renderCursor = function () {}
	vm.runInContext(coreSource, sandbox, { filename: CORE_PATH })
	vm.runInContext(entrySource, sandbox, { filename: 'coordinate-overlay.js' })
	for (const callback of hooks) callback()
	const game = Object.assign(Object.create(Game.prototype), {
		mouse: { sxy: pointer.slice(), xy: pointer.map(value => value * ratio), state: 0 },
		pixelRatio: ratio, zoom, unit: 40 * zoom * ratio,
		w: 1280 * ratio, h: 720 * ratio, w2: 640 * ratio, h2: 360 * ratio,
		translation: [125, -250], stuffMap: {}, resourceHomes: [], screenUnit: 100,
		isMobile: false, altActive: false, hoveredEntity: null, itemInHand: null,
		canvas: { getBoundingClientRect() { return { left: offset[0], top: offset[1] } } },
		store: { vessel: { classList: classList() } },
		memoryComplexUI: { classList: classList(), style: {} },
		memorycomplex: false, memoryComplexIsVisible: false,
		soundSources: [{ position: [0, 0] }],
		updateSoundSource() { calls.push({ type: 'sound', translation: this.translation.slice() }) },
		updateMouseData() { throw new Error('obsolete input refresh used') }
	})
	game.updatePointerState = function () {
		calls.push({ type: 'pointer' })
		return Game.prototype.updatePointerState.call(this)
	}
	game.updateGlobalPositioning = function () {
		calls.push({ type: 'global' })
		return Game.prototype.updateGlobalPositioning.call(this)
	}
	game.updatePointerState()
	calls.length = 0
	game.renderCursor()
	function dispatch(type, properties = {}) {
		const event = Object.assign({
			target: document.body, key: 'C', code: 'KeyC',
			altKey: true, shiftKey: true, ctrlKey: false, repeat: false,
			preventDefault() { this.prevented = true },
			stopImmediatePropagation() { this.stopped = true },
			stopPropagation() { this.stopped = true }
		}, properties)
		for (const callback of listeners.get(type) || []) {
			callback(event)
			if (event.stopped) break
		}
		return event
	}
	return {
		game, calls, dispatch, document,
		get panel() { return elements.find(element => element.className === 'cattail-coordinate-teleport') },
		open() {
			const event = dispatch('keydown')
			while (frames.length) frames.shift()()
			return event
		},
		submit(u, v, button = false) {
			const panel = this.panel
			panel.children[0].value = String(u)
			panel.children[1].value = String(v)
			if (button) panel.children[2].click({ preventDefault() {}, stopPropagation() {} })
			else dispatch('keydown', { key: 'Enter', target: panel.children[0] })
		}
	}
}

function close(actual, expected, message) {
	assert.ok(Math.abs(actual - expected) < 1e-7, message + ': ' + actual + ' vs ' + expected)
}

function assertTarget(harness, target) {
	const { game, calls } = harness
	const projected = game.uvToXY(target)
	close(projected[0] + game.w2, game.mouse.sxy[0] * game.pixelRatio, 'target X at pointer')
	close(projected[1] + game.h2, game.mouse.sxy[1] * game.pixelRatio, 'target Y at pointer')
	assert.deepEqual(Array.from(game.hoveredCell), target, 'real 1.3 hover follows translation')
	assert.deepEqual(calls.map(call => call.type), ['pointer', 'global', 'sound'])
	assert.deepEqual(calls[2].translation, game.translation, 'sound uses final camera translation')
	assert.equal(harness.panel.classList.contains('visible'), false)
}

for (const ratio of [1, 1.5, 2]) {
	for (const zoom of [0.1, 1, 3]) {
		for (const pointer of [[0, 0], [640, 360], [1000, 600], [1279, 719]]) {
			for (const offset of [[0, 0], [35, 19]]) {
				const harness = createHarness({ ratio, zoom, pointer, offset })
				const initialCell = Array.from(harness.game.hoveredCell)
				// A leftover old field must not override the native 1.3 pointer.
				harness.game.mouse.offsetxy = [7, 11]
				assert.equal(harness.open().prevented, true)
				const panel = harness.panel
				assert.deepEqual(panel.children.slice(0, 2).map(input => input.value), initialCell.map(String))
				assert.equal(panel.children[0].focused && panel.children[0].selected, true)
				const expectedX = Math.min(Math.max(pointer[0] + offset[0] + 24, 8), 1280 - 146 - 8)
				const expectedY = Math.min(Math.max(pointer[1] + offset[1] - 18, 8), 720 - 36 - 8)
				assert.equal(panel.style.left, expectedX + 'px', 'panel follows CSS pointer X')
				assert.equal(panel.style.top, expectedY + 'px', 'panel follows CSS pointer Y')
				harness.submit('20.4', '-37.2')
				assertTarget(harness, [20, -37])
				harness.calls.length = 0
				harness.open()
				harness.submit('-12.6', '42.7', true)
				assertTarget(harness, [-13, 43])
				scenarios++
			}
		}
	}
}

// Real 1.3 global refresh also updates proximity-dependent story UI and Store.
{
	const harness = createHarness()
	const entity = { position: [20, 30] }
	harness.game.stuffMap.u20v30 = entity
	harness.game.resourceHomes = [[640, 360]]
	harness.open()
	harness.submit(20, 30)
	assertTarget(harness, [20, 30])
	assert.equal(harness.game.hoveredEntity, entity, 'native hit detection follows the target cell')
	assert.equal(harness.game.hoveredResource, 0, 'native resource hover is refreshed')
	scenarios++
}

{
	const harness = createHarness()
	Object.assign(harness.game, { memorycomplex: true, memorycomplexCenter: [1000, 1000], memorycomplexRadius: 5 })
	harness.open()
	harness.submit(1000, 1000)
	assertTarget(harness, [1000, 1000])
	assert.equal(harness.game.memoryComplexIsVisible, true)
	assert.equal(harness.game.store.vessel.classList.contains('memory_faded'), true)
	assert.equal(harness.game.memoryComplexUI.classList.contains('active'), true)
	assert.ok(harness.game.memoryComplexUI.style.opacity > 0)
	harness.calls.length = 0
	harness.open()
	harness.submit(0, 0)
	assertTarget(harness, [0, 0])
	assert.equal(harness.game.memoryComplexIsVisible, false)
	assert.equal(harness.game.store.vessel.classList.contains('memory_faded'), false)
	assert.equal(harness.game.memoryComplexUI.classList.contains('active'), false)
	scenarios++
}

for (const event of [{ altKey: false }, { shiftKey: false }, { ctrlKey: true }, { repeat: true }, { key: 'D', code: 'KeyD' }]) {
	const harness = createHarness()
	harness.dispatch('keydown', event)
	assert.equal(harness.panel, undefined)
	scenarios++
}
for (const state of [{ hoveredEntity: {} }, { itemInHand: {} }, { hoveredCell: null }]) {
	const harness = createHarness()
	Object.assign(harness.game, state)
	harness.dispatch('keydown')
	assert.equal(harness.panel, undefined)
	scenarios++
}
{
	const harness = createHarness({ enabled: false })
	harness.open()
	assert.equal(harness.panel, undefined)
	scenarios++
}

for (const key of ['Escape', 'outside']) {
	const harness = createHarness()
	harness.open()
	const original = harness.game.translation.slice()
	if (key === 'Escape') harness.dispatch('keydown', { key, target: harness.panel.children[0] })
	else harness.dispatch('mousedown')
	assert.equal(harness.panel.classList.contains('visible'), false)
	assert.deepEqual(harness.game.translation, original)
	assert.deepEqual(harness.calls, [])
	scenarios++
}

for (const value of ['NaN', 'Infinity', 'invalid']) {
	const harness = createHarness()
	harness.open()
	const original = harness.game.translation.slice()
	harness.submit(value, 1)
	assert.deepEqual(harness.game.translation, original)
	assert.equal(harness.panel.classList.contains('visible'), true)
	assert.deepEqual(harness.calls, [])
	scenarios++
}

for (const invalid of [undefined, [NaN, 10], [10, Infinity]]) {
	const harness = createHarness()
	harness.game.mouse.sxy = invalid
	harness.game.mouse.offsetxy = [600, 300]
	harness.open()
	assert.equal(harness.panel, undefined, 'invalid native pointer must not fall back to zero or old field')
	scenarios++
}

for (const invalidate of [
	game => { game.mouse.sxy = [NaN, 0] },
	game => { game.zoom = 0 },
	game => { game.pixelRatio = Infinity },
	game => { game.uvToXY = () => [NaN, 0] },
	game => { game.updateGlobalPositioning = undefined }
]) {
	const harness = createHarness()
	harness.open()
	const original = harness.game.translation.slice()
	invalidate(harness.game)
	harness.submit(100, 200)
	assert.deepEqual(harness.game.translation, original)
	assert.equal(harness.panel.classList.contains('visible'), true)
	assert.deepEqual(harness.calls, [])
	scenarios++
}

console.log('PASS coordinate teleport: ' + scenarios + ' scenarios; real desktop 1.3 projection, pointer and global positioning methods; DOM fixture only, no player acceptance.')
