'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const modRoot = path.resolve(__dirname, '..')
const gameRoot = path.resolve(modRoot, '../..')
const read = file => fs.readFileSync(path.join(gameRoot, file), 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, 'mod.json'), 'utf8'))
const script = fs.readFileSync(path.join(modRoot, 'scripts/unlock-pinhole.js'), 'utf8')
const loaderSource = read('modloader/loader.js')
const gameSource = read('scripts/game.js')
const uiSource = read('scripts/ui.js')
const codexSource = read('scripts/codex.js')
const json = value => JSON.parse(JSON.stringify(value))
let passed = 0
const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name) }

class Element {
	constructor() {
		this.classes = new Set()
		this.classList = {
			add: (...names) => names.forEach(name => this.classes.add(name)),
			remove: (...names) => names.forEach(name => this.classes.delete(name)),
			contains: name => this.classes.has(name),
			toggle: (name, force) => {
				const add = force === undefined ? !this.classes.has(name) : force
				if (add) this.classes.add(name); else this.classes.delete(name)
				return add
			}
		}
		this.children = []
		this.dataset = {}
		this.attributes = {}
		this.listeners = {}
		this.style = {}
		this.textContent = ''
	}
	append(...children) { this.children.push(...children) }
	appendChild(child) { this.children.push(child); return child }
	setAttribute(key, value) { this.attributes[key] = String(value) }
	addEventListener(type, handler) { this.listeners[type] = handler }
	removeEventListener(type, handler) { if (this.listeners[type] === handler) delete this.listeners[type] }
}

function nativeMethod(name) {
	const start = gameSource.indexOf('\n\t' + name + '(')
	const end = gameSource.indexOf('\n\t}\n', start)
	assert.ok(start >= 0 && end > start, 'native method exists: ' + name)
	return gameSource.slice(start, end + 4)
}

function harness(loadFeature = true) {
	const storage = new Map(), writes = [], frames = []
	const context = vm.createContext({
		window: { addEventListener() {}, removeEventListener() {} },
		document: { body: new Element(), head: new Element(), createElement: () => new Element(), getElementById: () => null, querySelector: () => null, addEventListener() {} },
		console, performance: { now: () => 0 }, setTimeout, clearTimeout,
		requestAnimationFrame(fn) { frames.push(fn); return frames.length },
		localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes.push(key); storage.set(key, value) } },
		require(id) { if (id === 'crypto') return crypto; throw new Error('Unexpected module: ' + id) }
	})
	const marker = 'window.ModLoader = api'
	assert.equal(loaderSource.split(marker).length, 2)
	vm.runInContext(loaderSource.replace(marker, marker + '; window.testInternals = { loadModConfig, createSettingsActionControlCore, getLocalizedConfigText }'), context)
	const api = context.window.ModLoader, internals = context.window.testInternals
	context.ModLoader = api
	const mod = { id: manifest.id, manifest: json(manifest) }
	api.state.mods.push(mod)
	api.state.modById[mod.id] = mod
	// Use actual Loader config registration, not a replacement settings API.
	internals.loadModConfig(mod)
	if (loadFeature) vm.runInContext(script, context, { filename: 'unlock-pinhole.js' })
	const definition = api.forMod(mod.id).config.schema().find(item => item.key === 'unlockPinhole')
	assert.equal(!!definition, loadFeature)
	vm.runInContext(uiSource.slice(uiSource.indexOf('class Store {'), uiSource.indexOf('class MobileStoreVersion extends Store')), context)
	const pinholeStart = codexSource.indexOf('\t\tpinhole: {')
	const pinholeEnd = codexSource.indexOf('\n\t\tstrange: {', pinholeStart)
	assert.ok(pinholeStart >= 0 && pinholeEnd > pinholeStart)
	vm.runInContext('class Pinhole {}\n globalThis.pinholeDefinition = ({' + codexSource.slice(pinholeStart, pinholeEnd) + '}).pinhole', context)
	const methods = vm.runInContext('({' + nativeMethod('assembleSave') + ',' + nativeMethod('loadSave') + '})', context)
	const makeGame = (language = 'sch') => {
		const game = {
			version: '1.3', language, isMobile: false, currentSlotId: 0, preventSaving: false,
			codex: { entities: { pinhole: context.pinholeDefinition, locked: { canPurchase: true, type: 'default', shouldUnlock: () => false } } },
			unlockedEntities: { pump: true }, entitiesInGame: {}, onlyones: {}, resources: Array(10).fill(0),
			stuff: [], stats: { totalPlayAndIdleTime: 0, totalPlayTime: 0 }, plane: 0,
			messenger: { shownMessages: [], firedEvents: {}, messagesShown: 0, setState() {} },
			achiever: { fired: {}, setState() {} }, getRealPrice: name => name === 'pinhole' ? context.pinholeDefinition.price : [0],
			updateEraserType() {}, cleanup() {}, simulateIdleTime() {},
			saveGame() { throw new Error('The button must not force a save') },
			pickupItem() { throw new Error('The button must not select/build an item') },
			assembleSave: methods.assembleSave, loadSave: methods.loadSave
		}
		const store = vm.runInContext('Object.create(DesktopStoreVersion.prototype)', context)
		store.master = game
		store.existed = {}
		store.html = { types: {}, items: {}, priceElements: {}, existeds: {}, eraser: new Element(), relocator: new Element() }
		for (const type of ['uniques', 'default']) {
			store.html.types[type] = { button: new Element(), dot: new Element(), wrap: new Element() }
			store.html.types[type].button.classList.add('closed', 'hidden')
		}
		for (const name of ['pinhole', 'locked']) {
			store.html.items[name] = new Element()
			store.html.items[name].classList.add('hidden')
			store.html.priceElements[name] = Array.from({ length: 10 }, () => new Element())
		}
		store.html.eraser.classList.add('hidden')
		store.html.relocator.classList.add('hidden')
		store.compositionUpdate = function () { this.visibilityUpdate() }
		store.setExisted = function (value) { this.existed = value }
		game.store = store
		return game
	}
	const ready = game => {
		api.state.game = game
		for (const hook of api.state.hooks.afterGameInit || []) hook.fn(undefined, game)
	}
	const control = () => internals.createSettingsActionControlCore(definition, { modId: mod.id })
	return { api, mod, internals, definition, control, ready, makeGame, writes, storage, context }
}

async function main() {
	await check('manifest loads the new entry once and keeps 14 value settings', () => {
		assert.equal(manifest.entries.filter(entry => entry === 'scripts/unlock-pinhole.js').length, 1)
		assert.equal(Object.keys(manifest.config).length, 14)
		assert.equal(manifest.version, '0.1.0')
	})
	const h = harness(), game = h.makeGame()
	await check('registration has no automatic unlock, persisted action value, or forced reload', () => {
		assert.equal(h.definition.type, 'action')
		assert.equal(h.api.forMod(manifest.id).config.schema().length, 15)
		assert.equal(Object.hasOwn(h.api.forMod(manifest.id).config.all(), 'unlockPinhole'), false)
		assert.equal(game.unlockedEntities.pinhole, undefined)
		assert.deepEqual(h.writes, [])
	})
	await check('no world and a not-yet-ready world fail without mutation', async () => {
		await assert.rejects(h.control().run(), /Enter a loaded game/)
		h.api.state.game = game
		await assert.rejects(h.control().run(), /加载完成/)
		assert.equal(game.unlockedEntities.pinhole, undefined)
	})
	h.ready(game)
	await check('one real Settings button click immediately reveals the native 1.3 shop card', async () => {
		assert.equal(game.codex.entities.pinhole.shouldUnlock(game), false)
		game.store.visibilityUpdate()
		assert.equal(game.store.html.items.pinhole.classList.contains('hidden'), true)
		const before = json({ resources: game.resources, stats: game.stats, entities: game.entitiesInGame, onlyones: game.onlyones })
		const control = h.control()
		assert.equal(control.input.textContent, '立即解锁 ? 建筑')
		control.input.listeners.click({ preventDefault() {}, stopPropagation() {} })
		assert.equal(control.pending, true)
		assert.equal(control.input.disabled, true)
		await new Promise(setImmediate)
		assert.equal(control.status, 'success')
		assert.match(control.element.children[1].textContent, /当前存档已解锁/)
		assert.equal(game.unlockedEntities.pinhole, true)
		assert.equal(game.store.html.items.pinhole.classList.contains('hidden'), false)
		assert.equal(game.store.html.types.uniques.button.classList.contains('hidden'), false)
		assert.equal(game.store.html.items.pinhole.classList.contains('disabled'), true, 'insufficient resources still block purchase')
		assert.equal(game.store.html.items.locked.classList.contains('hidden'), true)
		assert.equal(game.unlockedEntities.locked, undefined)
		assert.deepEqual(json({ resources: game.resources, stats: game.stats, entities: game.entitiesInGame, onlyones: game.onlyones }), before)
		assert.equal(game.codex.entities.pinhole.isUpgradeTo, 'chasm')
		assert.equal(game.preventSaving, false)
		assert.deepEqual(h.writes, [])
	})
	await check('repeated clicks are harmless and report already unlocked', async () => {
		const before = json(game.unlockedEntities)
		assert.match(await h.control().run(), /当前存档已解锁 \?。/)
		assert.deepEqual(json(game.unlockedEntities), before)
	})
	await check('native resource, plane, and unique-building visibility rules remain effective', () => {
		game.resources = Array(10).fill(1e12)
		game.store.visibilityUpdate()
		assert.equal(game.store.html.items.pinhole.classList.contains('disabled'), false)
		game.plane = 1
		game.store.visibilityUpdate()
		assert.equal(game.store.html.types.uniques.button.classList.contains('hidden'), true)
		game.plane = 0
		game.onlyones.pinhole = true
		game.store.visibilityUpdate()
		assert.equal(game.store.html.items.pinhole.classList.contains('hidden'), true)
		delete game.onlyones.pinhole
		game.store.visibilityUpdate()
	})
	await check('native assembleSave/loadSave retain the unlock without the feature on reload', () => {
		const saved = json(game.assembleSave())
		assert.equal(saved.unlockedEntities.pinhole, true)
		const restored = harness(false).makeGame()
		assert.equal(restored.loadSave(saved), true)
		assert.equal(restored.unlockedEntities.pinhole, true)
		assert.equal(restored.store.html.items.pinhole.classList.contains('hidden'), false)
		assert.deepEqual(json(restored.resources), json(game.resources))
		assert.equal(restored.preventSaving, false)
	})
	await check('a different active world requires readiness and a separate click', async () => {
		const other = h.makeGame()
		h.api.state.game = other
		await assert.rejects(h.control().run(), /加载完成/)
		assert.equal(other.unlockedEntities.pinhole, undefined)
		h.ready(other)
		assert.equal(other.unlockedEntities.pinhole, undefined)
		await h.control().run()
		assert.equal(other.unlockedEntities.pinhole, true)
		assert.equal(game.unlockedEntities.pinhole, true)
	})
	for (const [name, change] of [
		['saving disabled', world => { world.preventSaving = true }],
		['wrong game version', world => { world.version = '1.2.1' }],
		['missing shop', world => { world.store = null }],
		['missing purchase definition', world => { world.codex = null }]
	]) await check(name + ' rejects the action without unlocking', async () => {
		const world = h.makeGame()
		change(world); h.ready(world)
		const control = h.control()
		await assert.rejects(control.run())
		assert.equal(control.status, 'error')
		assert.equal(world.unlockedEntities.pinhole, undefined)
	})
	for (const previous of [undefined, false, true]) await check('shop refresh failure preserves the previous unlock: ' + previous, async () => {
		const world = h.makeGame()
		if (previous !== undefined) world.unlockedEntities.pinhole = previous
		world.store.visibilityUpdate = () => { throw new Error('simulated shop failure') }
		h.ready(world)
		await assert.rejects(h.control().run(), /刷新失败/)
		assert.equal(world.unlockedEntities.pinhole, previous)
		assert.equal(Object.hasOwn(world.unlockedEntities, 'pinhole'), previous !== undefined)
	})
	for (const [language, expected] of [['en', 'Unlock ? building now'], ['sch', '立即解锁 ? 建筑'], ['modsch', '立即解锁 ? 建筑'], ['tch', '立即解鎖 ? 建築'], ['de', 'Unlock ? building now']]) {
		await check(language + ' menu label and action result localize with English fallback', async () => {
			const world = h.makeGame(language); h.ready(world)
			assert.equal(h.internals.getLocalizedConfigText(manifest, h.definition, 'label', ''), expected)
			const control = h.control()
			assert.equal(control.input.textContent, expected)
			const message = await control.run()
			assert.match(message, language === 'tch' ? /已解鎖/ : ['sch', 'modsch'].includes(language) ? /已解锁/ : /is unlocked/)
		})
	}
	await check('missing action API is safely skipped for older Loader installations', () => {
		vm.runInNewContext(script, { ModLoader: { register(mod) { mod.init({ ui: {} }) } } })
	})
	console.log(`Unlock Pinhole: ${passed}/${passed} scenario groups passed. Actual Loader/Settings, native 1.3 shop visibility and save methods; synthetic DOM/world only, no player saves or Steam.`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
