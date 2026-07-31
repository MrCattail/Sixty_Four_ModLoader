const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const MOD_ROOT = path.resolve(__dirname, '..')
const ECONOMY_SOURCE = 'scripts/core/creative-economy.js'
const CREATIVE_SOURCE = 'scripts/core/creative-mode.js'
const SHARED_SOURCE = 'scripts/core/shared.js'
const SHELL_SOURCE = 'scripts/ui/editor-shell.js'
const I18N_SOURCE = 'scripts/i18n/editor-text.js'
const ECONOMY_KEY = Symbol.for('cattail.world-editor.creative-economy')
const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
const SAVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function source(relativePath) {
	return fs.readFileSync(path.join(MOD_ROOT, relativePath), 'utf8')
}

class ClassList {
	constructor() {
		this.values = new Set()
	}
	add(...values) {
		for (const value of values) this.values.add(value)
	}
	remove(...values) {
		for (const value of values) this.values.delete(value)
	}
	toggle(value, force) {
		if (force === true) this.values.add(value)
		else if (force === false) this.values.delete(value)
		else if (this.values.has(value)) this.values.delete(value)
		else this.values.add(value)
		return this.values.has(value)
	}
	contains(value) {
		return this.values.has(value)
	}
}

class FakeNode {
	constructor() {
		this.classList = new ClassList()
		this.childNodes = []
		this.children = this.childNodes
		this.dataset = {}
		this._text = ''
		this.parentNode = null
	}
	set innerHTML(value) {
		this._text = String(value)
		this.childNodes = []
		this.children = this.childNodes
	}
	get innerHTML() {
		return this._text
	}
	set textContent(value) {
		this._text = String(value)
	}
	get textContent() {
		return this._text
	}
	appendChild(node) {
		node.parentNode = this
		this.childNodes.push(node)
		return node
	}
	replaceChildren(...nodes) {
		this.childNodes = []
		this.children = this.childNodes
		this._text = ''
		for (const node of nodes) this.appendChild(node)
	}
	querySelector() {
		return null
	}
	querySelectorAll() {
		return []
	}
	cloneNode() {
		const clone = new FakeNode()
		clone._text = this._text
		return clone
	}
	remove() {
		if (!this.parentNode) return
		this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this)
		this.parentNode = null
	}
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
		this.listeners.set(type, (this.listeners.get(type) || []).filter((value) => value !== listener))
	}
	dispatchEvent(event) {
		for (const listener of (this.listeners.get(event.type) || []).slice()) listener(event)
		return true
	}
	dispatch(type, event = {}) {
		event.type = type
		event.preventDefault ||= function () {}
		event.stopImmediatePropagation ||= function () {}
		this.dispatchEvent(event)
	}
}

class FakeCanvas extends EventHub {}

class Cloud {
	constructor(master) {
		this.master = master
		this.element = new FakeNode()
		this.resources = null
		this.refundName = null
		this.qeRelocateControl = new FakeCanvas()
	}
	addResourceList(resources) {
		this.resources = Array.from(resources || [])
	}
	addLine() {}
	addRefundList(name) {
		this.refundName = name
	}
	addQEString() {
		return [new FakeCanvas(), this.qeRelocateControl]
	}
	update() {}
}

class Entity {
	constructor(master, name = 'widget') {
		this.master = master
		this.name = name
		this.position = [0, 0]
		this.sellHint = { vanilla: true }
	}
	getSellHint() {
		return this.sellHint
	}
}

class Widget extends Entity {
	constructor(master) {
		super(master, 'widget')
	}
}

class Widget2 extends Entity {
	constructor(master) {
		super(master, 'widget2')
	}
}

class Shop {
	constructor(master) {
		this.master = master
		this.items = [
			createShopItem('widget'),
			createShopItem('widget2'),
			createShopItem('eraser')
		]
		this.vessel = new FakeNode()
		this.checkCalls = 0
		this.updateCalls = 0
	}
	check() {
		this.checkCalls += 1
		for (const item of this.items) {
			const price = this.master.getRealPrice(item.name)
			item.affordable = price.every((amount, index) => amount <= (this.master.resources[index] || 0))
			item.html.classList.toggle('disabled', !item.affordable)
		}
	}
	updatePrice(item) {
		this.updateCalls += 1
		const price = this.master.getRealPrice(item.name)
		item.priceHtml.textContent = price.join(',')
		item.priceElements = [item.priceHtml]
	}
	updateElements() {
		for (const item of this.items) this.updatePrice(item)
	}
}

function createShopItem(name) {
	return {
		name,
		price: [4, 0, 0, 0, 0],
		priceHtml: new FakeNode(),
		priceElements: [],
		html: new FakeNode()
	}
}

class Game {
	constructor() {
		this.resources = [10, 0, 0, 0, 0]
		this.codex = {
			entities: {
				widget: { class: Widget, canPurchase: true, onlyone: false },
				widget2: { class: Widget2, canPurchase: true, onlyone: false, isUpgradeTo: 'widget' },
				eraser: { canPurchase: true },
				eventThing: { canPurchase: false }
			}
		}
		this.onlyones = {}
		this.entitiesInGame = { mega3: 1, pump: 1, pump2: 0, gradient: 1 }
		this.stats = { machinesBuild: 0, machinesSold: 0, timeSinceLastDelete: 1 }
		this.hoveredCell = [1, 2]
		this.hoveredEntity = null
		this.itemInHand = new Widget(this)
		this.transportedEntity = null
		this.plane = 0
		this.builds = []
		this.clears = []
		this.relocations = []
		this.transfers = []
		this.canvas = new FakeCanvas()
		this.mouse = { currentAction: null, state: 0, timer: 0, maxTimer: 10, positionChanged: false }
		this.ctx = { closePath() {}, fill() {} }
		this.shop = new Shop(this)
		this.saveInstanceId = SAVE_ID
	}
	getRealPrice(name, sale) {
		if (name === 'eventThing') return [9, 0, 0, 0, 0]
		if (sale) return [2, 0, 0, 0, 0]
		if (name === 'eraser') return [1, 0, 0, 0, 0]
		if (name === 'widget2') return [6, 0, 0, 0, 0]
		return [4, 0, 0, 0, 0]
	}
	canAfford(name) {
		const price = this.getRealPrice(name)
		return price.every((amount, index) => amount <= (this.resources[index] || 0))
	}
	pickupItem(name) {
		if (/^eraser/.test(name)) this.itemInHand = { name, eraser: true }
		else this.itemInHand = new this.codex.entities[name].class(this)
		delete this.transportedEntity
		if (!this.itemInHand.eraser) {
			this.itemInHandPriceTag = new Cloud(this)
			this.itemInHandPriceTag.addResourceList(this.getRealPrice(name))
			if (this.codex.entities[name].isUpgradeTo) {
				this.itemInHandPriceAndRefundTag = new Cloud(this)
				this.itemInHandPriceAndRefundTag.addResourceList(this.getRealPrice(name))
				this.itemInHandPriceAndRefundTag.addRefundList(this.codex.entities[name].isUpgradeTo)
			}
		}
	}
	requestResources(resources) {
		if (!resources.every((amount, index) => amount <= (this.resources[index] || 0))) return false
		for (let index = 0; index < resources.length; index += 1) {
			this.resources[index] = (this.resources[index] || 0) - (resources[index] || 0)
		}
		this.createResourceTransfer(resources)
		return true
	}
	createResourceTransfer(resources) {
		this.transfers.push(Array.from(resources || []))
	}
	addEntity(name, cell) {
		this.builds.push({ name, cell: Array.from(cell) })
		return new this.codex.entities[name].class(this)
	}
	clearCell(cell) {
		this.clears.push(Array.from(cell))
	}
	processClick() {
		if (this.transportedEntity && this.hoveredCell && this.resources[4] >= 1) {
			this.requestResources([0, 0, 0, 0, 1])
			this.relocate(this.transportedEntity, this.hoveredCell)
			delete this.transportedEntity
			delete this.itemInHand
			return
		}
		const item = this.itemInHand
		if (!item || !this.hoveredCell || !this.canAfford(item.name)) return
		if (!this.hoveredEntity && !item.eraser) {
			this.requestResources(this.getRealPrice(item.name))
			this.addEntity(item.name, this.hoveredCell)
			this.stats.machinesBuild += 1
			this.pickupItem(item.name)
		} else if (this.hoveredEntity && item.eraser && !this.hoveredEntity.indestructible) {
			this.createResourceTransfer(this.getRealPrice(this.hoveredEntity.name, true))
			this.requestResources(this.getRealPrice(item.name))
			this.clearCell(this.hoveredCell)
			this.stats.machinesSold += 1
			this.hoveredEntity = null
		} else if (
			this.hoveredEntity &&
			!item.eraser &&
			this.codex.entities[item.name]?.isUpgradeTo === this.hoveredEntity.name
		) {
			const position = Array.from(this.hoveredEntity.position)
			this.clearCell(this.hoveredCell)
			this.createResourceTransfer(this.getRealPrice(this.hoveredEntity.name))
			this.requestResources(this.getRealPrice(item.name))
			this.addEntity(item.name, position)
			this.stats.machinesBuild += 1
			this.pickupItem(item.name)
		}
	}
	processE() {
		if (this.resources[4] >= 1 && this.hoveredEntity && this.canRelocate(this.hoveredEntity)) {
			this.transportedEntity = this.hoveredEntity
			this.itemInHand = new this.codex.entities[this.hoveredEntity.name].class(this)
		}
	}
	canRelocate(entity) {
		return !!entity && entity.name !== 'eraser'
	}
	entityAtCoordinates() {
		return this.hoveredEntity
	}
	relocate(entity, cell) {
		this.relocations.push({ entity, cell: Array.from(cell) })
		entity.position = Array.from(cell)
	}
	updateGamepad() {
		this.processClick()
	}
	setListeners() {}
	setListenersTouch() {
		this.canvas.addEventListener('touchend', () => {
			if (this.mouse.positionChanged) return
			if (this.mouse.currentAction === 'build') {
				const price = this.getRealPrice(this.itemInHand.name)
				this.requestResources(price)
				this.addEntity(this.itemInHand.name, this.hoveredCell)
				this.stats.machinesBuild += 1
			} else if (this.mouse.currentAction === 'relocate') {
				this.requestResources([0, 0, 0, 0, 1])
				this.relocate(this.transportedEntity, this.hoveredCell)
				delete this.transportedEntity
				delete this.itemInHand
			}
		})
	}
	assembleSave() {
		return JSON.stringify({
			modloader: { saveInstanceId: this.saveInstanceId },
			resources: this.resources,
			buildCount: this.builds.length
		})
	}
	decodeSave(data) {
		return JSON.parse(data)
	}
}

class CreativeController {
	constructor(game) {
		this.game = game
		this.active = true
		this.listeners = new Set()
	}
	snapshot() {
		return {
			version: '1.0.0',
			ready: true,
			creativeMode: this.active,
			busy: false,
			disposed: false
		}
	}
	subscribe(listener) {
		this.listeners.add(listener)
		listener(this.snapshot())
		return () => this.listeners.delete(listener)
	}
	setActive(active) {
		this.active = !!active
		for (const listener of this.listeners) listener(this.snapshot())
	}
}

class SnapshotStore {
	constructor() {
		this.created = []
		this.removed = []
		this.mode = 'immediate'
		this.failCode = 'SNAPSHOT_IO_FAILED'
		this.removeMode = 'immediate'
		this.pending = []
	}
	create(options) {
		this.created.push(options)
		if (this.mode === 'fail') {
			const error = new Error('snapshot failed')
			error.code = this.failCode
			return Promise.reject(error)
		}
		if (this.mode === 'deferred') {
			return new Promise((resolve, reject) => this.pending.push({ resolve, reject, options }))
		}
		return Promise.resolve({ id: 'snapshot-' + this.created.length })
	}
	remove({ id }) {
		this.removed.push(id)
		if (this.removeMode === 'fail') {
			const error = new Error('snapshot cleanup failed')
			error.code = 'SNAPSHOT_CLEANUP_FAILED'
			return Promise.reject(error)
		}
		return Promise.resolve({ id, removed: true })
	}
	resolveNext() {
		const pending = this.pending.shift()
		pending.resolve({ id: 'snapshot-' + this.created.length })
	}
}

function createRuntime() {
	const hooks = new Map()
	const snapshots = new SnapshotStore()
	const windowHub = new EventHub()
	let definition = null
	let showCosts = false
	const sandbox = {
		console: { info() {}, warn() {}, error() {} },
		Symbol,
		Object,
		Array,
		Map,
		Set,
		WeakMap,
		Promise,
		JSON,
		Date,
		Math,
		Error,
		TypeError,
		Number,
		String,
		Boolean,
		RegExp,
		Uint8Array,
		setTimeout,
		clearTimeout,
		window: windowHub,
		Game,
		Shop,
		Entity,
		Cloud,
		CustomEvent: class CustomEvent {
			constructor(type, options) {
				this.type = type
				this.detail = options?.detail
			}
		},
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(ECONOMY_SOURCE), sandbox, { filename: ECONOMY_SOURCE })
	assert.ok(definition)
	const api = {
		id: 'Cattail_TweaksQuality_World-Editor',
		on(name, listener) {
			if (!hooks.has(name)) hooks.set(name, [])
			hooks.get(name).push(listener)
		},
		patch(target, name, wrapper) {
			const original = target[name]
			const replacement = wrapper(original)
			target[name] = replacement
			return () => {
				if (target[name] === replacement) target[name] = original
			}
		},
		config: {
			get(key, fallback) {
				return key === 'showCreativePurchaseCosts' ? showCosts : fallback
			}
		},
		storage: { snapshots }
	}
	definition.init(api)
	return {
		sandbox,
		hooks,
		snapshots,
		windowHub,
		setShowCosts(value) {
			showCosts = !!value
			windowHub.dispatchEvent(new sandbox.CustomEvent('modloader:config-preview', {
				detail: {
					modId: 'Cattail_TweaksQuality_World-Editor',
					key: 'showCreativePurchaseCosts',
					value: showCosts
				}
			}))
		},
		run(name, payload, game) {
			let result = payload
			for (const listener of hooks.get(name) || []) {
				const next = listener(result, game)
				if (next !== undefined) result = next
			}
			return result
		}
	}
}

function waitForAsyncWork() {
	return new Promise((resolve) => setImmediate(resolve))
}

async function verifyRuntimeContract() {
	const runtime = createRuntime()
	const baseCanAfford = Game.prototype.canAfford
	Game.prototype.canAfford = function (name) {
		if (this.blockedByExistingAffordabilityPatch === name) return false
		return baseCanAfford.apply(this, arguments)
	}
	runtime.run('afterVanillaScripts')
	const game = new Game()
	const creative = new CreativeController(game)
	runtime.sandbox[CREATIVE_KEY] = creative
	runtime.run('afterGameInit', null, game)
	const economy = runtime.sandbox[ECONOMY_KEY]
	assert.ok(economy)
	assert.equal(Object.isFrozen(economy), true)
	assert.equal(economy.snapshot().version, '1.0.0')
	assert.equal(economy.snapshot().active, true)
	assert.equal(economy.showPurchaseCosts(), false)
	assert.equal(Object.isFrozen(economy.snapshot()), true)

	game.resources[0] = 0
	game.blockedByExistingAffordabilityPatch = 'widget2'
	assert.equal(game.canAfford('widget2'), false)
	delete game.blockedByExistingAffordabilityPatch
	assert.equal(game.canAfford('eventThing'), false)
	game.shop.check()
	assert.equal(game.shop.items[0].affordable, true)
	game.shop.updatePrice(game.shop.items[0])
	assert.equal(game.shop.items[0].priceHtml.textContent, '')

	runtime.setShowCosts(true)
	assert.equal(economy.showPurchaseCosts(), true)
	assert.equal(game.shop.items[0].priceHtml.textContent, '4,0,0,0,0')
	game.pickupItem('widget2')
	assert.deepEqual(game.itemInHandPriceTag.resources, [6, 0, 0, 0, 0])
	assert.equal(game.itemInHandPriceAndRefundTag, game.itemInHandPriceTag)
	game.pickupItem('eraser')
	const sellHint = new Entity(game, 'widget').getSellHint()
	assert.deepEqual(sellHint.resources, [1, 0, 0, 0, 0])
	assert.equal(sellHint.refundName, null)

	game.resources[0] = 10
	game.pickupItem('widget')
	game.onlyones.widget = true
	const createsBeforeOnlyOne = runtime.snapshots.created.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforeOnlyOne)
	delete game.onlyones.widget

	game.blockedByExistingAffordabilityPatch = 'widget'
	game.pickupItem('widget')
	const createsBeforePatchedRestriction = runtime.snapshots.created.length
	const buildsBeforePatchedRestriction = game.builds.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforePatchedRestriction)
	assert.equal(game.builds.length, buildsBeforePatchedRestriction)
	delete game.blockedByExistingAffordabilityPatch

	game.resources[0] = 10
	game.pickupItem('widget')
	game.hoveredCell = [1, 2]
	game.hoveredEntity = null
	const beforeData = game.assembleSave(true)
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, 1)
	assert.equal(runtime.snapshots.created[0].data, beforeData)
	assert.equal(runtime.snapshots.created[0].reason, 'creative-shop-before-build')
	assert.equal(JSON.stringify(runtime.snapshots.created[0].tags.target), JSON.stringify({ u: 1, v: 2 }))
	assert.equal(runtime.snapshots.created[0].tags.input, 'mouse')
	assert.equal(game.resources[0], 10)
	assert.equal(game.builds.length, 1)
	assert.equal(economy.snapshot().phase, 'success')

	game.resources[0] = 3
	const beforeMachine = game.resources[0]
	game.requestResources([2, 0, 0, 0, 0])
	assert.equal(game.resources[0], beforeMachine - 2)
	assert.deepEqual(game.getRealPrice('eventThing'), [9, 0, 0, 0, 0])

	creative.setActive(false)
	game.resources[0] = 10
	game.pickupItem('widget')
	const snapshotsBeforeNormal = runtime.snapshots.created.length
	game.processClick()
	assert.equal(game.resources[0], 6)
	assert.equal(game.builds.length, 2)
	assert.equal(runtime.snapshots.created.length, snapshotsBeforeNormal)
	creative.setActive(true)

	runtime.snapshots.create = null
	game.resources[0] = 10
	game.hoveredCell = [2, 3]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const createsBeforeUnavailable = runtime.snapshots.created.length
	const buildsBeforeUnavailable = game.builds.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforeUnavailable)
	assert.equal(game.builds.length, buildsBeforeUnavailable)
	assert.equal(economy.snapshot().error.code, 'SNAPSHOT_UNAVAILABLE')
	delete runtime.snapshots.create

	runtime.snapshots.mode = 'fail'
	game.resources[0] = 10
	game.pickupItem('widget')
	const buildsBeforeFailure = game.builds.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeFailure)
	assert.equal(game.resources[0], 10)
	assert.equal(economy.snapshot().phase, 'failed')
	assert.equal(economy.snapshot().busy, false)

	runtime.snapshots.mode = 'deferred'
	game.pickupItem('widget')
	const createsBeforeDuplicate = runtime.snapshots.created.length
	game.processClick()
	game.processClick()
	assert.equal(runtime.snapshots.created.length, createsBeforeDuplicate + 1)
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeFailure + 1)

	game.pickupItem('widget')
	game.hoveredCell = [4, 5]
	const buildsBeforeChangedTarget = game.builds.length
	game.processClick()
	game.hoveredCell = [6, 7]
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeChangedTarget)
	assert.equal(runtime.snapshots.removed.length, 1)
	assert.equal(economy.snapshot().phase, 'cancelled')

	game.hoveredCell = [20, 21]
	game.hoveredEntity = new Widget(game)
	game.hoveredEntity.position = [20, 21]
	game.itemInHand = new Widget2(game)
	const buildsBeforeEntityChange = game.builds.length
	game.processClick()
	game.hoveredEntity = new Widget(game)
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeEntityChange)
	assert.equal(economy.snapshot().phase, 'cancelled')

	game.hoveredCell = [22, 23]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforePlaneChange = game.builds.length
	game.processClick()
	game.plane = 1
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforePlaneChange)
	assert.equal(economy.snapshot().phase, 'cancelled')
	game.plane = 0

	game.hoveredCell = [24, 25]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforeIdentityChange = game.builds.length
	game.processClick()
	game.saveInstanceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeIdentityChange)
	assert.equal(economy.snapshot().phase, 'cancelled')
	game.saveInstanceId = SAVE_ID

	game.hoveredCell = [26, 27]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforeCreativeChange = game.builds.length
	game.processClick()
	creative.setActive(false)
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeCreativeChange)
	assert.equal(economy.snapshot().phase, 'cancelled')
	creative.setActive(true)

	runtime.snapshots.removeMode = 'fail'
	game.hoveredCell = [28, 29]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforeCleanupFailure = game.builds.length
	game.processClick()
	game.hoveredCell = [30, 31]
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeCleanupFailure)
	assert.equal(economy.snapshot().phase, 'cancelled')
	runtime.snapshots.removeMode = 'immediate'

	runtime.snapshots.mode = 'immediate'
	game.hoveredCell = [8, 9]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const createsBeforeGamepad = runtime.snapshots.created.length
	game.updateGamepad()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforeGamepad + 1)
	assert.equal(runtime.snapshots.created.at(-1).tags.input, 'gamepad')

	game.hoveredCell = [10, 11]
	game.hoveredEntity = null
	game.pickupItem('widget')
	game.mouse.currentAction = 'build'
	game.mouse.positionChanged = false
	game.setListenersTouch()
	const createsBeforeTouch = runtime.snapshots.created.length
	game.canvas.dispatch('touchend', { target: game.canvas })
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforeTouch + 1)
	assert.equal(runtime.snapshots.created.at(-1).tags.input, 'touch')
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-build')

	game.resources = [10, 0, 0, 0, 0]
	game.hoveredCell = [12, 13]
	game.hoveredEntity = new Widget(game)
	game.hoveredEntity.position = [12, 13]
	game.itemInHand = new Widget2(game)
	const transfersBeforeUpgrade = game.transfers.length
	const buildsBeforeUpgrade = game.builds.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-upgrade')
	assert.equal(game.resources[0], 10)
	assert.equal(game.builds.length, buildsBeforeUpgrade + 1)
	assert.equal(game.transfers.length, transfersBeforeUpgrade)

	game.hoveredCell = [14, 15]
	game.hoveredEntity = new Widget(game)
	game.itemInHand = { name: 'eraser', eraser: true }
	const transfersBeforeErase = game.transfers.length
	const clearsBeforeErase = game.clears.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-erase')
	assert.equal(game.resources[0], 10)
	assert.equal(game.clears.length, clearsBeforeErase + 1)
	assert.equal(game.transfers.length, transfersBeforeErase)

	game.resources[4] = 0
	game.hoveredCell = [16, 17]
	game.hoveredEntity = null
	game.transportedEntity = new Widget(game)
	game.itemInHand = new Widget(game)
	const relocationsBefore = game.relocations.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-relocate')
	assert.equal(game.resources[4], 0)
	assert.equal(game.relocations.length, relocationsBefore + 1)

	game.resources[4] = 0
	game.hoveredCell = [18, 19]
	game.hoveredEntity = { name: 'eraser' }
	game.transportedEntity = new Widget(game)
	game.itemInHand = new Widget(game)
	game.canPlace = true
	const relocationsBeforePatchedTarget = game.relocations.length
	game.processClick()
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-relocate')
	assert.equal(game.relocations.length, relocationsBeforePatchedTarget + 1)
	delete game.canPlace

	game.resources[4] = 0
	game.hoveredCell = [32, 33]
	game.hoveredEntity = null
	game.transportedEntity = new Widget(game)
	game.itemInHand = new Widget(game)
	game.mouse.currentAction = 'relocate'
	game.mouse.positionChanged = false
	const relocationsBeforeTouch = game.relocations.length
	const createsBeforeTouchRelocation = runtime.snapshots.created.length
	game.canvas.dispatch('touchend', { target: game.canvas })
	await waitForAsyncWork()
	assert.equal(runtime.snapshots.created.length, createsBeforeTouchRelocation + 1)
	assert.equal(runtime.snapshots.created.at(-1).tags.input, 'touch')
	assert.equal(runtime.snapshots.created.at(-1).reason, 'creative-shop-before-relocate')
	assert.equal(game.resources[4], 0)
	assert.equal(game.relocations.length, relocationsBeforeTouch + 1)

	const qeEntity = new Widget(game)
	const qeHint = new Cloud(game)
	const qeControls = qeHint.addQEString(true, true, qeEntity)
	const createsBeforeQePickup = runtime.snapshots.created.length
	game.resources[4] = 0
	game.hoveredEntity = qeEntity
	qeControls[1].dispatch('touchstart', { target: qeControls[1] })
	assert.equal(game.transportedEntity, qeEntity)
	assert.equal(game.itemInHand.name, 'widget')
	assert.equal(runtime.snapshots.created.length, createsBeforeQePickup)
	delete game.transportedEntity
	delete game.itemInHand

	game.hoveredCell = [34, 35]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforeExecutionFailure = game.builds.length
	const removesBeforeExecutionFailure = runtime.snapshots.removed.length
	game.addEntity = function () {
		throw new Error('simulated execution failure')
	}
	game.processClick()
	await waitForAsyncWork()
	assert.equal(game.builds.length, buildsBeforeExecutionFailure)
	assert.equal(economy.snapshot().phase, 'failed')
	assert.equal(economy.snapshot().error.code, 'EXECUTION_FAILED')
	assert.equal(runtime.snapshots.removed.length, removesBeforeExecutionFailure)
	delete game.addEntity

	const previous = economy
	runtime.snapshots.mode = 'deferred'
	game.hoveredCell = [36, 37]
	game.hoveredEntity = null
	game.pickupItem('widget')
	const buildsBeforeRuntimeReplacement = game.builds.length
	game.processClick()
	const replacementGame = new Game()
	const replacementCreative = new CreativeController(replacementGame)
	runtime.sandbox[CREATIVE_KEY] = replacementCreative
	runtime.run('afterGameInit', null, replacementGame)
	runtime.snapshots.resolveNext()
	await waitForAsyncWork()
	assert.equal(previous.snapshot().disposed, true)
	assert.equal(game.builds.length, buildsBeforeRuntimeReplacement)
	assert.equal(runtime.sandbox[ECONOMY_KEY].game, replacementGame)
}

function verifyStaticIntegration() {
	const manifest = JSON.parse(source('mod.json'))
	assert.equal(manifest.version, '0.4.5')
	assert.equal(manifest.config.showCreativePurchaseCosts.type, 'boolean')
	assert.equal(manifest.config.showCreativePurchaseCosts.default, false)
	assert.equal(manifest.config.showCreativePurchaseCosts.reloadPolicy, 'hot')
	assert.equal(
		manifest.entry.indexOf(ECONOMY_SOURCE),
		manifest.entry.indexOf(CREATIVE_SOURCE) + 1
	)
	assert.equal(Object.keys(manifest.translations).length, 20)
	for (const translation of Object.values(manifest.translations)) {
		assert.ok(translation.config.showCreativePurchaseCosts?.label)
		assert.ok(translation.config.showCreativePurchaseCosts?.description)
	}

	const economy = source(ECONOMY_SOURCE)
	const creative = source(CREATIVE_SOURCE)
	const shared = source(SHARED_SOURCE)
	const shell = source(SHELL_SOURCE)
	const i18n = source(I18N_SOURCE)
	for (const text of [
		"Symbol.for('cattail.world-editor.creative-economy')",
		'creative-shop-before-build',
		'creative-shop-before-upgrade',
		'creative-shop-before-erase',
		'creative-shop-before-relocate',
		'game.assembleSave(true)',
		"snapshots.remove({ id })",
		"patchListenerRegistration('setListenersTouch', true)",
		"withInputSource('gamepad'",
		"withInputSource('touch'"
	]) {
		assert.ok(economy.includes(text), text)
	}
	assert.ok(shared.includes('globalThis[CREATIVE_ECONOMY_KEY]?.isInputBlocked?.()'))
	assert.ok(creative.includes('isEconomyBusy(game)'))
	assert.ok(shell.includes('world-editor-creative-economy-status'))
	assert.ok(shell.includes('currentCreativeEconomy?.busy'))
	assert.ok(i18n.includes('creativeEconomySnapshotting'))
	assert.ok(i18n.includes('creativeEconomyFailed'))
	assert.ok(i18n.includes('creativeEconomyExecutionFailed'))
}

function verifyEconomyTranslations() {
	let definition = null
	const sandbox = {
		console: { info() {}, warn() {} },
		Symbol,
		Object,
		Array,
		ModLoader: {
			register(value) {
				definition = value
			}
		}
	}
	sandbox.globalThis = sandbox
	vm.createContext(sandbox)
	vm.runInContext(source(I18N_SOURCE), sandbox, { filename: I18N_SOURCE })
	assert.ok(definition)
	definition.init({})
	const i18n = sandbox[Symbol.for('cattail.world-editor.i18n')]
	assert.equal(i18n.languages.length, 20)
	for (const language of i18n.languages) {
		for (const key of [
			'creativeEconomySnapshotting',
			'creativeEconomyRevalidating',
			'creativeEconomyExecuting',
			'creativeEconomySuccess',
			'creativeEconomyCancelled',
			'creativeEconomyFailed',
			'creativeEconomyExecutionFailed'
		]) {
			assert.notEqual(i18n.t(language, key), key, language + '.' + key)
			assert.ok(i18n.t(language, key).trim(), language + '.' + key)
		}
	}
}

verifyStaticIntegration()
verifyEconomyTranslations()
verifyRuntimeContract().then(() => {
	console.log('World Editor 4A-2b verification passed.')
}).catch((error) => {
	console.error(error)
	process.exitCode = 1
})
