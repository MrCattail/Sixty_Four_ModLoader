'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const GAME_ROOT = path.resolve(MOD_ROOT, '../..')
const CORE_PATH = process.argv[2] || path.join(MOD_ROOT, 'scripts/core.js')
const coreSource = fs.readFileSync(CORE_PATH, 'utf8')
const entrySource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/building-details.js'), 'utf8')
const nativeSources = Object.fromEntries(['game.js', 'ui.js', 'stuff.js'].map(name => [
	name, fs.readFileSync(path.join(GAME_ROOT, 'scripts', name), 'utf8')
]))
const fixtures = [
	['Converter13', 'converter13'], ['Annihilator', 'annihilator'],
	['Converter76', 'converter76'], ['Converter32', 'converter32'],
	['Converter41', 'converter41'], ['Converter64', 'converter64']
]
let scenarios = 0
let framesChecked = 0

function createHarness(className, name, mode) {
	let now = 0
	const listeners = new Map()
	const drawOrder = []
	const document = {}
	class Element {
		constructor(tag) {
			this.tag = tag
			this.children = []
			this.parentNode = null
			this.classes = new Set()
			this.className = ''
			this.dataset = {}
			this.style = { setProperty() {} }
			this.classList = {
				add: (...values) => values.forEach(value => this.classes.add(value)),
				remove: (...values) => values.forEach(value => this.classes.delete(value)),
				contains: value => this.classes.has(value) || this.className.split(' ').includes(value),
				toggle: (value, active = !this.classList.contains(value)) => {
					if (active) this.classes.add(value)
					else this.classes.delete(value)
					return active
				}
			}
		}
		get firstChild() { return this.children[0] || null }
		get isConnected() { return !!this.parentNode && (this.parentNode === document.body || this.parentNode.isConnected) }
		append(...children) { children.forEach(child => this.appendChild(child)) }
		appendChild(child) {
			child.remove()
			this.children.push(child)
			child.parentNode = this
			return child
		}
		removeChild(child) {
			this.children = this.children.filter(value => value !== child)
			child.parentNode = null
		}
		remove() { this.parentNode?.removeChild(this) }
		insertBefore(child, reference) {
			child.remove()
			const index = this.children.indexOf(reference)
			this.children.splice(index < 0 ? this.children.length : index, 0, child)
			child.parentNode = this
		}
		insertAdjacentElement(position, child) {
			assert.equal(position, 'afterend')
			if (!this.parentNode) return
			const siblings = this.parentNode.children
			this.parentNode.insertBefore(child, siblings[siblings.indexOf(this) + 1] || null)
		}
		querySelectorAll(selector) {
			// Width measurement is outside this DOM fixture's assertions.
			const result = []
			for (const child of this.children) {
				if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) result.push(child)
				result.push(...child.querySelectorAll(selector))
			}
			return result
		}
		querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
		set innerHTML(value) {
			this.html = String(value)
			for (const child of this.children) child.parentNode = null
			this.children = []
		}
		get innerHTML() { return this.html || '' }
		getBoundingClientRect() { return { width: 200, height: 100, left: 0, top: 0 } }
		addEventListener() {}
	}
	Object.assign(document, {
		createElement: tag => new Element(tag), getElementById: () => null,
		body: new Element('body'), head: new Element('head'), documentElement: new Element('html')
	})
	const context = new Proxy({
		fillRect() { drawOrder.push('clear') },
		measureText() { return { width: 70 } }
	}, { get: (target, key) => key in target ? target[key] : () => {} })
	const hooks = []
	const api = {
		patch(target, method, wrapper) {
			assert.equal(typeof target[method], 'function', 'missing native patch target ' + method)
			target[method] = wrapper(target[method])
		},
		on(event, callback) { if (event === 'afterVanillaScripts') hooks.push(callback) },
		config: { get: key => key === 'enableBuildingDetails' && mode !== 'disabled' }
	}
	const sandbox = {
		console, document, performance: { now: () => now },
		requestAnimationFrame() {},
		localStorage: { getItem: () => null, setItem() {} },
		addEventListener(event, callback) {
			if (!listeners.has(event)) listeners.set(event, [])
			listeners.get(event).push(callback)
		},
		ModLoader: { register(definition) { definition.init(api) } }
	}
	sandbox.window = sandbox
	vm.createContext(sandbox)
	for (const [filename, source] of Object.entries(nativeSources)) vm.runInContext(source, sandbox, { filename })
	const Game = vm.runInContext('Game', sandbox)
	const EntityClass = vm.runInContext(className, sandbox)
	vm.runInContext(coreSource, sandbox, { filename: CORE_PATH })
	vm.runInContext(entrySource, sandbox, { filename: 'building-details.js' })
	for (const callback of hooks) callback()
	// Run the real frame, cursor, hint selection, Cloud and output methods.
	// Full game/entity constructors and unrelated world drawing remain isolated.
	const game = Object.assign(Object.create(Game.prototype), {
		ctx: context, solidUnit: 40, zoom: 1, renderTime: { lt: 0 }, slowdown: { state: false },
		plane: 0, w: 1280, h: 720, w2: 640, h2: 360, pixelRatio: 1,
		punch: { offset: 0 }, memoryBuffer: [], resources: Array(11).fill(1e9),
		stats: { totalPlayTime: 0 }, stuffMap: {},
		mouse: { xy: [500, 300], sxy: [500, 300], cursorVisible: true, state: 0 },
		altActive: false, shiftPressed: false, hoveredCell: [0, 0], currentHint: {},
		codex: { entities: { [name]: { canPurchase: false } } }, language: 'en',
		canRelocate: () => false, makeReadable: value => String(value),
		pronounce: (...keys) => keys[keys.length - 1]
	})
	for (const method of ['renderConductors', 'renderChasmVFX', 'renderEntities', 'renderEntitiesAbstract',
		'renderHoveredCell', 'renderVFX', 'renderHollowEvents', 'renderSlowdown', 'renderGrid', 'renderSOI', 'renderAffected']) {
		game[method] = () => {}
	}
	game.renderResources = () => { drawOrder.push('HUD') }
	const classStart = nativeSources['stuff.js'].indexOf('class ' + className + ' extends ')
	assert.ok(classStart >= 0)
	const classEnd = nativeSources['stuff.js'].indexOf('\nclass ', classStart + 1)
	const classSource = nativeSources['stuff.js'].slice(classStart, classEnd < 0 ? undefined : classEnd)
	const fuelMatch = classSource.match(/this\.fuel\s*=\s*(\[[^\]]*\])/)
	assert.ok(fuelMatch, 'native fuel definition missing for ' + className)
	const entity = Object.assign(Object.create(EntityClass.prototype), {
		master: game, name, position: [0, 0], soi: [], fuel: JSON.parse(fuelMatch[1]),
		state: 0, fill: 0, preheaters: [], baseConversionSpeed: 1e-5, reflectorCount: 0,
		canHit: () => false, render() {}
	})
	if (name !== 'annihilator') entity.conversion = 0
	entity.initHint()
	game.hoveredEntity = entity
	game.renderloop()
	function toggleLock() {
		for (const callback of listeners.get('keydown') || []) callback({
			key: 'Control', keyCode: 17, altKey: true, ctrlKey: true, repeat: false,
			preventDefault() {}, stopImmediatePropagation() {}
		})
	}
	if (mode === 'locked') {
		toggleLock()
		assert.equal(game._cattailDynamicDetailsToggle, true, 'actual Ctrl+Alt handler enables lock')
	} else if (mode === 'held') {
		game.altActive = game.shiftPressed = true
	}
	return {
		game, entity, toggleLock,
		step(state, progress, elapsed = 16) {
			entity.state = state
			entity.fill = progress
			if (entity.conversion !== undefined) entity.conversion = progress
			now += elapsed
			drawOrder.length = 0
			const resourcesBefore = game.resources.slice()
			const flagsBefore = [game.altActive, game.shiftPressed]
			assert.doesNotThrow(() => game.renderloop(), name + '/' + mode + '/state=' + state)
			assert.equal(drawOrder[0], 'clear', 'actual frame clears before cursor/hint work')
			assert.equal(drawOrder.filter(value => value === 'HUD').length, 1, 'frame reaches resource HUD exactly once')
			assert.deepEqual(game.resources, resourcesBefore, 'display must not alter inventory')
			assert.deepEqual([game.altActive, game.shiftPressed], flagsBefore, 'cursor wrapper restores input flags')
			framesChecked++
			return game.currentHint.element?.querySelector('.cattail-dynamic-top-flow') || null
		}
	}
}

function assertFlow(harness, flow) {
	assert.ok(flow, 'active detail flow is present')
	const vessels = flow.querySelectorAll('.converterOutputVessel')
	assert.equal(vessels.length, 1, 'one complete native flow, without duplicates')
	const input = vessels[0].querySelector('.converterInput')
	const output = vessels[0].querySelector('.converterOutput')
	const expectedOutput = harness.entity.name === 'annihilator'
		? [0, 0, 0, 0, 0, 0, 0, 0, 1] : Array.from(harness.entity.getConversionOutput())
	for (const [element, resources] of [[input, harness.entity.fuel], [output, expectedOutput]]) {
		const ids = resources.flatMap((amount, id) => amount ? [id] : [])
		const icons = element.querySelectorAll('.hintResourceIcon')
		assert.equal(icons.length, ids.length, 'input/output icons are populated')
		ids.forEach((id, index) => assert.equal(icons[index].classList.contains('r' + id), true))
		assert.deepEqual(element.querySelectorAll('.hintResourceString').map(value => value.innerHTML),
			ids.map(id => String(resources[id])), 'native checks update displayed amounts')
	}
	return input
}

for (const [className, name] of fixtures) {
	for (const mode of ['plain', 'locked', 'held', 'disabled']) {
		const harness = createHarness(className, name, mode)
		const active = mode === 'locked' || mode === 'held'
		for (const [state, progress, elapsed] of [
			[0, 0, 16], [1, 0, 16], [2, 0.25, 16], [2, 0.25, 16],
			[2, 0.25, 2100], [2, 0.26, 16], [3, 0.26, 16], [0, 0, 16]
		]) {
			const flow = harness.step(state, progress, elapsed)
			if (active && state === 2) assertFlow(harness, flow)
			else assert.equal(flow, null, 'top flow follows detail activation and native state')
		}
		if (active) {
			harness.game.resources.fill(0)
			const input = assertFlow(harness, harness.step(2, 0.5, 2100))
			for (const chunk of input.children) assert.equal(chunk.style.opacity, 0.3, 'native affordability remains intact')
			if (mode === 'locked') {
				harness.toggleLock()
				assert.equal(harness.game._cattailDynamicDetailsToggle, false)
			} else harness.game.altActive = harness.game.shiftPressed = false
			assert.equal(harness.step(2, 0.51), null, 'turning off detail removes added flow')
		}
		harness.game.hoveredEntity = null
		harness.game.hoveredCell = null
		harness.step(0, 0)
		assert.equal(harness.game.currentHint.element, undefined, 'leaving building removes the hint')
		scenarios++
	}
}

console.log('PASS building detail flow: ' + scenarios + ' scenarios, ' + framesChecked + ' frames; six native entity types, Ctrl+Alt/Alt+Shift/off/disabled, state transitions, recipe icons and HUD continuation. VM DOM/Canvas fixtures only; no player acceptance.')
