'use strict'

// Actual desktop Game listeners/cleanup/processUp, Store, CSS, Loader and
// Better UIs/WE input/dialog consumers; synthetic world and peripheral services.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { createRequire } = require('node:module')
let playwright
try { playwright = require('playwright') } catch (_) {
	playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
}
const ROOT = process.env.SIXTY_FOUR_GAME_ROOT || path.resolve(__dirname, '../../..')
const MODROOT = path.resolve(__dirname, '..')
// Optional original 1.3 game.js/ui.js extracted outside the checkout. Other
// consumers stay current; no legacy cleanup shims are installed in the page.
const NATIVE_ROOT = process.env.ESC_ACTION_NATIVE_ROOT || ROOT
const FIX_SOURCE = process.env.ESC_ACTION_FIX_SOURCE || path.join(MODROOT, 'scripts/better-escape.js')
const MOD = 'Cattail_TweaksQuality_Tweaks', BETTER = 'Cattail_TweaksQuality_Better-UIs', WE = 'Cattail_TweaksQuality_World-Editor'
const KEY = 'enableBetterEscape', FIX = 'scripts/better-escape.js'
const manifest = JSON.parse(fs.readFileSync(path.join(MODROOT, 'mod.json'), 'utf8'))
const manifests = Object.fromEntries([BETTER, WE].map(id => [id, JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', id, 'mod.json'), 'utf8'))]))
const output = fs.mkdtempSync(path.join(process.env.ESC_ACTION_TEST_OUTPUT_ROOT || os.tmpdir(), 'tweaks-escape-'))
function fixture() {
	const q = new URLSearchParams(location.search)
	const ownKey = 'modloader:Cattail_TweaksQuality_Tweaks:config:enableBetterEscape'
	localStorage.setItem('modloader:Cattail_TweaksQuality_Better-UIs:config:shopVersion', JSON.stringify(q.get('shop') || '1.3'))
	if (q.has('accordion')) localStorage.setItem('cattailNativeShopStyle', 'accordion')
	if (q.get('shop') === '1.2.1') localStorage.setItem('cattailShopCategoriesCompressed', q.has('long') ? '0' : '1')
	if (q.has('off') && !localStorage.getItem('fixture-initialized')) localStorage.setItem(ownKey, 'false')
	localStorage.setItem('fixture-initialized', 'true')
	window.nativeCalls = { splash: 0, erase: 0, relocate: 0, clone: 0, build: 0, upgrade: 0, spend: 0, refund: 0, save: 0, orb: 0, unifiedCleanup: 0, eraseCleanup: 0, relocateCleanup: 0, release: 0 }
	window.weState = { active: false, pending: false, preview: false, count: 0, busy: false, steps: [] }
	window.cleanupCallbacks = []
	window.nativeCreative = false
	window.game = Object.assign(Object.create(Game.prototype), {
		version: q.has('old') ? '1.2.1' : '1.3', isMobile: q.has('mobile'), language: 'en', plane: 0,
		eraserType: 2, resources: [10000, 20000], onlyones: {}, unlockedEntities: { pump: true, mega3: true, waypoint2: true },
		entitiesInGame: { pump: 3, mega3: 1, waypoint: 1 }, prices: {}, stuff: [{ name: 'pump', position: [1, 2] }, { name: 'waypoint', position: [3, 4] }],
		stats: { totalPlayTime: 10 }, alfa: { currentNodes: [] }, currentHint: {}, translation: [0, 0], translationMap: [0, 0, 0, 0],
		zoom: 1, pixelRatio: 1, screenUnit: 10, resourceHomes: [], hoveredCell: [0, 0], soundSources: new Set(), selectedEntity: false, saveSlots: [],
		mouse: { sxy: [10, 10], xy: [10, 10], delta: [0, 0], state: 0, maxTimer: 600, positionChanged: false },
		codex: { entityTypes: { default: {}, tools: {} }, entities: {
			pump: { type: 'default', canPurchase: true, price: [100], priceExponent: 2,
				class: class { constructor(master) { this.master = master; this.name = 'pump' } } },
			waypoint: { price: [20], priceExponent: 1 },
			waypoint2: { type: 'default', canPurchase: true, price: [200], priceExponent: 2, isUpgradeTo: 'waypoint',
				class: class { constructor(master) { this.master = master; this.name = 'waypoint2' } } },
			mega3: { type: 'tools', canPurchase: true, price: [20], priceExponent: 1.5 }
		} },
		pronounce: (a, id, part) => part === 'description' ? 'Fixture description' : String(id),
		makeReadable: v => String(v), xyToUV: xy => [xy[0] / 64, xy[1] / 64], entityAtCoordinates: () => undefined,
		processMove() {}, canRelocate: () => true, finalizeErase() { nativeCalls.erase++ }, massRelocate() { nativeCalls.relocate++ }, massClone() { nativeCalls.clone++ },
		canPlaceEntityHere: () => true,
		addEntity() { nativeCalls.build++; throw new Error('unexpected building commit') },
		clearCell() { nativeCalls.upgrade++; throw new Error('unexpected upgrade commit') },
		requestResources() { nativeCalls.spend++; throw new Error('unexpected building cost') },
		createResourceTransfer() { nativeCalls.refund++; throw new Error('unexpected building refund') },
		closeOrbifolds() { nativeCalls.orb++; delete this.orbifoldUI },
		savePreferences() {}, saveGame() { nativeCalls.save++; throw new Error('unexpected game save') }
	})
	window.unified = typeof game.cleanupInteractionMode === 'function'
	for (const method of ['processQ', 'processE']) {
		const original = game[method]
		game[method] = function (...args) { window[method + 'Calls'] = (window[method + 'Calls'] || 0) + 1; return original.apply(this, args) }
	}
	for (const [method, key] of [['cleanupInteractionMode', 'unifiedCleanup'], ['cleanupErase', 'eraseCleanup'], ['cleanupRelocation', 'relocateCleanup']]) {
		const original = game[method]
		if (typeof original !== 'function') continue
		game[method] = function (...args) { nativeCalls[key]++; return original.apply(this, args) }
	}
	const nativeRelease = game.processUp
	game.processUp = function (...args) {
		nativeCalls.release++
		const service = window[Symbol.for('cattail.world-editor.native-tools')]
		return service?.active() ? service.release(nativeRelease, args) : nativeRelease.apply(this, args)
	}
	game.canvas = document.querySelector('canvas')
	const splashElement = document.querySelector('.splash')
	game.splash = {
		master: game, element: splashElement, selected: false, isShown: false, gameIsMute: true,
		show() { nativeCalls.splash++; this.isShown = true; splashElement.style.display = 'block' },
		close() { nativeCalls.splash++; this.isShown = false; splashElement.style.display = 'none' }
	}
	window.setFix = value => {
		ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.set('enableBetterEscape', value)
		dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key: 'enableBetterEscape', value } }))
	}
	const editable = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
	window[Symbol.for('cattail.world-editor.runtime')] = {
		game, isActive: () => weState.active, isEnabled: () => true, addCleanup: f => cleanupCallbacks.push(f),
		deactivate(reason) { weState.active = false; weState.steps.push(reason) }, toggle() { weState.active = !weState.active }
	}
	window[Symbol.for('cattail.world-editor.shared')] = {
		isEditableEvent: e => !!e.target?.closest?.(editable), isModLoaderPanelBlocking: () => !!document.querySelector('#modloader-panel:not(.modloader-panel-autohidden)'),
		isWorldEditorInputBlocked: () => weState.busy
	}
	window[Symbol.for('cattail.world-editor.selection-interaction')] = {
		cancelPending() { if (!weState.pending) return false; weState.pending = false; weState.steps.push('pending'); return true }
	}
	window[Symbol.for('cattail.world-editor.selection')] = {
		hasPreview: () => weState.preview, cancelPreview() { weState.preview = false; weState.steps.push('preview') },
		snapshot: () => ({ selectionCount: weState.count }), clear() { weState.count = 0; weState.steps.push('selection'); return true }
	}
	// Real native-tools service, with isolated eligibility/transaction/storage
	// collaborators. Any attempted committed operation fails this fixture.
	const publish = (name, value) => { window[Symbol.for('cattail.world-editor.' + name)] = { game, ...value } }
	publish('creative-mode', { snapshot: () => ({ ready: true, creativeMode: nativeCreative }), subscribe: () => () => {} })
	publish('save-adapter', { capture: () => ({ fixture: true }), isCurrent: () => true })
	publish('transactions', { registerAdapter: () => () => {}, subscribe: () => () => {}, execute: () => { throw new Error('unexpected WE transaction') } })
	publish('selection-delete', { executeNative: () => { throw new Error('unexpected WE deletion') } })
	publish('blueprint-placement', { assessEntity: () => ({ safe: true }) })
	window.openCards = () => {
		game.store.closeTypes()
		if (q.get('shop') === '1.2.1') document.querySelector('.cattail-shop-category-head').click()
		else game.store.html.types.default.button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	}
	// Dispatch the actual category/header/proxy handlers, retaining native state
	// changes so the Esc regression cannot be hidden by fixture cleanup.
	window.clickCategory = (target, entrance = 'header') => {
		if (q.get('shop') === '1.2.1') {
			const categories = [...document.querySelectorAll('.cattail-shop-category')]
			const category = categories.find(node => node.classList.contains('expanded') === (target === 'same'))
			if (!category) throw new Error('fixture category missing')
			category.querySelector('.cattail-shop-category-head').click()
		} else {
			const id = target === 'same' ? 'default' : 'tools'
			const button = entrance === 'proxy' ? document.querySelector('[data-native-proxy="' + id + '"]') : game.store.html.types[id].button
			if (!button) throw new Error('fixture category entrance missing')
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
		}
	}

	window.prepare = (mode, cards = false, area = false) => {
		document.activeElement?.blur?.()
		delete game.itemInHand; delete game.orbifoldUI; delete game.interactionMode; delete game.transportedEntity
		game.splash.isShown = false; splashElement.style.display = 'none'
		if (unified) game.cleanupInteractionMode()
		else { game.cleanupErase(); game.cleanupRelocation() }
		delete game.hoveredEntity
		game.entityAtCoordinates = () => undefined
		game.mouse.state = 0; game.mouse.positionChanged = false
		game.store.closeTypes()
		if (cards) openCards()
		if (mode) {
			game.interactionMode = mode
			game.transportedEntity = { fixture: true }
			game.canPlace = true
			if (unified) {
				game.selectionOrigin = [0, 0]; game.selectionTarget = area ? [3, 3] : [0, 0]
				game.selectionCandidateSet = new Set(game.stuff)
				if (mode !== 'erase') { game.selectionList = game.stuff.slice(); game.selectionOffsets = [[1, 2]] }
				game.totalRefund = [2, 3]; game.areaHint = { fixture: true }; game.forcedMobileAnchor = true
			} else if (mode === 'erase') {
				game.eraseOrigin = [0, 0]; game.eraseTarget = area ? [3, 3] : [0, 0]
				game.eraseList = game.stuff.slice(); game.totalRefund = [2, 3]; game.eraseHint = { fixture: true }
			} else if (mode === 'relocate') {
				game.relocationOrigin = [0, 0]; game.relocationTarget = area ? [3, 3] : [0, 0]
				game.relocationCandidatesList = game.stuff.slice(); game.relocationList = game.stuff.slice(); game.relocationOffsets = [[1, 2]]
			}
		}
		game.store.visibilityUpdate()
		for (const key of Object.keys(nativeCalls)) nativeCalls[key] = 0
	}
	// Native Store card handlers / Q / pickupItem / Cloud are exercised below;
	// entity constructors, world, and commit endpoints remain isolated fixtures.
	window.beginPlacement = (source, cards = true) => {
		prepare(null, cards)
		if (source === 'q') game.hoveredEntity = game.stuff[0]
		else game.store.html.items[source === 'upgrade' ? 'waypoint2' : 'pump'].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
	}
	window.showPlacementHint = source => {
		if (!game.itemInHand || game.interactionMode !== 'build') throw new Error('native placement not active')
		game.canPlace = true
		const hint = source === 'upgrade' ? game.itemInHandPriceAndRefundTag : game.itemInHandPriceTag
		if (!hint?.element || hint.master !== game) throw new Error('native price hint missing')
		document.body.append(hint.element); game.currentHint = { element: hint.element, entity: game.itemInHand }
		if (source === 'upgrade') game.entityAtCoordinates = () => game.stuff.find(entity => entity.name === 'waypoint')
	}
	window.sample = () => ({
		mode: game.interactionMode || null, cards: game.store.isOpen, splash: game.splash.isShown,
		calls: { ...nativeCalls }, resources: game.resources.slice(), positions: game.stuff.map(e => e.position.slice()),
		names: game.stuff.map(e => e.name), entityCounts: { ...game.entitiesInGame }, stats: { ...game.stats },
		refund: game.getRealPrice('pump', true).slice(), canPlace: game.canPlace,
		unified, selectionPreview: !!(game.selectionOrigin || game.selectionTarget || game.selectionCandidateSet || game.selectionList || game.selectionOffsets || game.totalRefund || game.areaHint || game.forcedMobileAnchor),
		erasePreview: !!(game.eraseOrigin || game.eraseTarget || game.eraseList || game.totalRefund || game.eraseHint),
		relocatePreview: !!(game.relocationOrigin || game.relocationTarget || game.relocationList || game.relocationOffsets || game.relocationCandidatesList),
		transported: !!game.transportedEntity, eraserClosed: game.store.html.eraser.classList.contains('closed'),
		relocatorClosed: game.store.html.relocator.classList.contains('closed'),
		expanded: document.querySelectorAll('.cattail-shop-category.expanded').length,
		item: game.itemInHand?.name || null, hintVisible: !!game.currentHint.element?.isConnected
	})
	window.boot = async () => {
		await ModLoader.boot()
		await ModLoader.stage('afterVanillaScripts', game)
		game.store = new DesktopStoreVersion(document.querySelector('.store'), game)
		if (q.has('mobile')) game.store.pushMenu = () => {} // Marker-only guard test still uses a desktop Store.
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		game.setListenersDesktop()
		await ModLoader.stage('afterGameInit', game)
		window.ready = true
	}
}
const allow = new Set(['scripts/game.js', 'scripts/ui.js', 'cascade.css', 'modloader/loader.js', 'modloader/translations.json',
	'mods/' + BETTER + '/scripts/classic-shop.js', 'mods/' + BETTER + '/scripts/shop-categories.js', 'mods/' + BETTER + '/scripts/native-accordion-shop.js',
	'mods/' + WE + '/scripts/core/input-controller.js', 'mods/' + WE + '/scripts/core/native-tools.js', 'mods/' + WE + '/scripts/ui/dialog.js',
	'mods/' + MOD + '/scripts/eraser-icon-fix.js', 'mods/' + MOD + '/scripts/zoom-reset-block.js'])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost'), file = decodeURIComponent(url.pathname.slice(1))
	let body, type = 'text/javascript'
	const q = new URL(req.headers.referer || 'http://localhost').searchParams
	if (!file) {
		type = 'text/html'; body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>body{background:#d8d5df}canvas{position:absolute;width:600px;height:600px}.splash{display:none}#fixture-input{position:absolute;left:20px;top:20px}</style><canvas width="600" height="600"></canvas><input id="fixture-input"><div class="store"></div><div class="splash"><div class="menu"></div></div><script src="/scripts/game.js"></script><script src="/scripts/ui.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(e=>window.bootError=e.stack)</script>'
	} else if (file === 'mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: q.has('better-first') ? [BETTER, MOD, WE] : [MOD, BETTER, WE] })
	} else if (file === 'mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries: ['scripts/eraser-icon-fix.js', FIX, 'scripts/zoom-reset-block.js'] })
	} else if (file === 'mods/' + BETTER + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifests[BETTER], entries: ['scripts/classic-shop.js', 'scripts/shop-categories.js', ...(q.has('accordion') ? ['scripts/native-accordion-shop.js'] : [])] })
	} else if (file === 'mods/' + WE + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifests[WE], entry: undefined, entries: ['scripts/core/native-tools.js', 'scripts/core/input-controller.js', 'scripts/ui/dialog.js'] })
	} else if (file === 'mods/' + MOD + '/' + FIX) body = fs.readFileSync(FIX_SOURCE)
	else if (file === 'scripts/game.js' || file === 'scripts/ui.js') body = fs.readFileSync(path.join(NATIVE_ROOT, file))
	else if (allow.has(file) || /^(img|font)\/[\w./-]+$/.test(file)) {
		const target = path.resolve(ROOT, file)
		if (target.startsWith(path.resolve(ROOT) + path.sep) && fs.existsSync(target) && fs.statSync(target).isFile()) {
			body = fs.readFileSync(target); type = ({ '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(target)] || type
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})
async function main() {
	assert.equal(manifest.config[KEY].default, true); assert.equal(manifest.config[KEY].reloadPolicy, 'hot')
	assert.equal(manifest.entries.filter(e => e === FIX).length, 1); assert.equal(manifest.version, '0.1.0')
	for (const lang of ['en', 'sch', 'modsch', 'tch']) for (const part of ['label', 'description', 'sectionLabel']) assert(manifest.config[KEY][part][lang])
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
	const executablePath = process.env.ESC_ACTION_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath }), contexts = [], errors = [], results = []
	const ready = async page => { await page.waitForFunction(() => window.ready || window.bootError); assert.equal(await page.evaluate(() => window.bootError), undefined) }
	const setup = async (query = '') => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(ctx)
		await ctx.route('**/*', route => route.request().url().startsWith(address + '/') ? route.continue() : route.abort())
		const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.stack || e.message))
		await page.goto(address + query); await ready(page); return page
	}
	const check = async (name, fn) => { await fn(); assert.deepEqual(errors, []); results.push(name); console.log('PASS ' + name) }
	const sample = page => page.evaluate(() => sample())
	const press = page => page.keyboard.press('Escape')
	const unchanged = (before, after) => {
		assert.deepEqual(after.resources, before.resources); assert.deepEqual(after.positions, before.positions); assert.deepEqual(after.refund, before.refund)
		assert.deepEqual(after.names, before.names); assert.deepEqual(after.entityCounts, before.entityCounts); assert.deepEqual(after.stats, before.stats)
		for (const key of ['erase', 'relocate', 'clone', 'build', 'upgrade', 'spend', 'refund', 'save']) assert.equal(after.calls[key], 0, key + ' must not commit')
	}
	const cleaned = (state, before) => {
		assert.equal(state.mode, null); assert.equal(state.selectionPreview, false); assert.equal(state.erasePreview, false); assert.equal(state.relocatePreview, false)
		assert.equal(state.calls.unifiedCleanup - (before?.calls.unifiedCleanup || 0), state.unified ? 1 : 0)
		assert.equal(state.calls.eraseCleanup - (before?.calls.eraseCleanup || 0), state.unified ? 0 : 1); assert.equal(state.calls.relocateCleanup - (before?.calls.relocateCleanup || 0), state.unified ? 0 : 1)
		assert.equal(state.transported, false); assert.equal(state.canPlace, false)
	}
	let passed = false
	try {
		for (const query of ['', '?accordion', '?accordion&better-first', '?shop=1.2.1', '?shop=1.2.1&better-first']) {
			const page = await setup(query)
			await check('native cleanup capability and selected consumers actually loaded ' + (query || 'native'), async () => {
				assert.equal(await page.evaluate(() => !!window[Symbol.for('cattail.world-editor.native-tools')]?.active), true)
				assert.equal(await page.evaluate(() => typeof game.cleanupInteractionMode === 'function'), (await sample(page)).unified)
				if ((await sample(page)).unified) assert.deepEqual(await page.evaluate(() => [typeof game.cleanupErase, typeof game.cleanupRelocation]), ['undefined', 'undefined'])
				if (query.includes('accordion')) assert.equal(await page.locator('.cattail-native-accordion').count(), 1)
			})
			await check('real card click then Esc collapses cards before native menu ' + (query || 'native'), async () => {
				await page.evaluate(() => prepare(null, true))
				assert.equal((await sample(page)).cards, true)
				await press(page); const first = await sample(page); assert.equal(first.cards, false); assert.equal(first.calls.splash, 0); assert.equal(first.expanded, 0)
				await press(page); assert.equal((await sample(page)).splash, true)
			})
			await check('tool then cards then menu stays layered ' + (query || 'native'), async () => {
				await page.evaluate(() => prepare('erase', true, true))
				const before = await sample(page); await press(page); const one = await sample(page)
				assert.equal(one.splash, false); cleaned(one); assert.equal(one.cards, true)
				assert.equal(one.transported, false); assert.equal(one.eraserClosed, true); unchanged(before, one)
				await press(page); const two = await sample(page); assert.equal(two.cards, false); assert.equal(two.splash, false)
				await press(page); assert.equal((await sample(page)).splash, true)
			})
			await check('native tool buttons cancel without opening menu ' + (query || 'native'), async () => {
				for (const type of ['eraser', 'relocator']) {
					await page.evaluate(type => { prepare(null); game.store.html[type].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) }, type)
					assert.equal((await sample(page)).mode, type === 'eraser' ? 'erase' : 'relocate')
					await press(page); const s = await sample(page); assert.equal(s.mode, null); assert.equal(s.splash, false)
				}
			})
			await check('actual Q and E keyboard entry cancel before menu ' + (query || 'native'), async () => {
				for (const [key, mode] of [['q', 'erase'], ['e', 'relocate']]) {
					await page.evaluate(() => prepare(null)); await page.keyboard.press(key)
					const before = await sample(page); assert.equal(before.mode, mode)
					await press(page); const after = await sample(page); cleaned(after, before); unchanged(before, after); assert.equal(after.splash, false)
				}
			})
			for (const source of ['shop', 'q', 'upgrade']) {
				await check('native ' + source + ' placement cancels before cards/menu and mouse release ' + (query || 'native'), async () => {
					for (const cards of [false, true]) {
						await page.evaluate(({ source, cards }) => beginPlacement(source, cards), { source, cards })
						if (source === 'q') await page.keyboard.press('q')
						await page.evaluate(source => showPlacementHint(source), source)
						await page.locator('canvas').dispatchEvent('mousedown', { button: 0, buttons: 1, clientX: 90, clientY: 90 })
						const before = await sample(page); assert.equal(before.mode, 'build'); assert.equal(before.hintVisible, true)
						assert.equal(before.item, source === 'upgrade' ? 'waypoint2' : 'pump')
						await press(page); const cancelled = await sample(page)
						assert.equal(cancelled.splash, false); assert.equal(cancelled.cards, before.cards); assert.equal(cancelled.item, null); assert.equal(cancelled.hintVisible, false)
						cleaned(cancelled, before); unchanged(before, cancelled)
						await page.locator('canvas').dispatchEvent('mouseup', { button: 0, buttons: 0, clientX: 90, clientY: 90 })
						const released = await sample(page); unchanged(before, released); assert.equal(released.calls.release, 1); assert.equal(released.item, null); assert.equal(released.mode, null)
						if (before.cards) { await press(page); assert.equal((await sample(page)).cards, false); assert.equal((await sample(page)).splash, false) }
						await press(page); assert.equal((await sample(page)).splash, true)
					}
				})
			}

			for (const entrance of query.includes('accordion') ? ['header', 'proxy'] : ['header']) for (const target of ['same', 'other']) {
				await check('category ' + entrance + '/' + target + ' keeps placement, cards and menu on separate Esc presses ' + (query || 'native'), async () => {
					for (const source of ['shop', 'q', 'upgrade']) {
						await page.evaluate(source => beginPlacement(source), source)
						if (source === 'q') await page.keyboard.press('q')
						await page.evaluate(source => showPlacementHint(source), source)
						await page.locator('canvas').dispatchEvent('mousedown', { button: 0, buttons: 1, clientX: 90, clientY: 90 })
						await page.evaluate(({ target, entrance }) => clickCategory(target, entrance), { target, entrance })
						const before = await sample(page)
						assert.equal(before.mode, query.includes('shop=1.2.1') ? 'build' : null) // Category behavior stays native.
						assert.equal(before.item, source === 'upgrade' ? 'waypoint2' : 'pump'); assert.equal(before.hintVisible, true)
						assert.equal(before.cards, target === 'other')
						await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.down('Escape')
						const cancelled = await sample(page)
						assert.equal(cancelled.splash, false); assert.equal(cancelled.cards, before.cards); assert.equal(cancelled.item, null); assert.equal(cancelled.hintVisible, false)
						cleaned(cancelled, before); unchanged(before, cancelled)
						await page.keyboard.up('Escape')
						await page.locator('canvas').dispatchEvent('mouseup', { button: 0, buttons: 0, clientX: 90, clientY: 90 })
						const released = await sample(page); unchanged(before, released); assert.equal(released.calls.release, 1); assert.equal(released.item, null)
						if (before.cards) { await press(page); assert.equal((await sample(page)).cards, false); assert.equal((await sample(page)).splash, false) }
						await press(page); assert.equal((await sample(page)).splash, true)
					}
				})
			}
			await check('switching categories with no held object collapses cards immediately ' + (query || 'native'), async () => {
				await page.evaluate(() => { prepare(null, true); clickCategory('other') })
				const before = await sample(page); assert.equal(before.cards, true); assert.equal(before.item, null)
				await press(page); const after = await sample(page); unchanged(before, after); assert.equal(after.cards, false); assert.equal(after.splash, false)
				await press(page); assert.equal((await sample(page)).splash, true)
			})

		}
		const page = await setup()
		await check('single/area erase and relocation cancellation prevents actual mouseup commit', async () => {
			for (const mode of ['erase', 'relocate']) for (const area of [false, true]) {
				await page.evaluate(({ mode, area }) => { prepare(mode, false, area); game.mouse.state = 1; game.mouse.positionChanged = area }, { mode, area })
				const before = await sample(page); await press(page)
				await page.locator('canvas').dispatchEvent('mouseup', { button: 0, buttons: 0, clientX: 50, clientY: 50 })
				const after = await sample(page); unchanged(before, after)
				cleaned(after)
				assert.equal(after.calls.release, 1)
			}
		})
		await check('actual WE native-tools held relocation cancels without a transaction on release', async () => {
			await page.evaluate(() => {
				prepare(null); nativeCreative = true
				const tools = window[Symbol.for('cattail.world-editor.native-tools')]
				if (!tools?.active() || !tools.start('relocate', { pickHovered: false })) throw new Error('native tools not active')
				if (unified) {
					game.selectionCandidateSet = new Set(game.stuff)
					game.pickupEntitiesForRelocation()
				} else {
					game.relocationCandidatesList = game.stuff.slice()
					tools.handle('pickupEntitiesForRelocation', [], function () { game.relocationList = game.stuff.slice(); game.relocationOffsets = [[0, 0]] })
				}
				game.mouse.state = 1; game.mouse.positionChanged = true
			})
			const before = await sample(page); assert.equal(before.mode, 'relocate'); assert.equal(before.unified ? before.selectionPreview : before.relocatePreview, true)
			await press(page); await page.locator('canvas').dispatchEvent('mouseup', { button: 0, buttons: 0, clientX: 50, clientY: 50 })
			const after = await sample(page); unchanged(before, after); cleaned(after); assert.equal(after.calls.release, 1)
			assert.equal(await page.evaluate(() => { const ok = window[Symbol.for('cattail.world-editor.native-tools')].start('relocate', { pickHovered: false }); nativeCreative = false; return ok }), true)
		})
		if ((await sample(page)).unified) {
			for (const modifier of ['Shift', 'Control']) for (const area of [false, true]) {
				await check('native ' + modifier + ' clone cancellation clears selection and survives repeat/release area=' + area, async () => {
					await page.evaluate(area => {
						prepare('relocate', true, area); game.mouse.state = 1; game.mouse.positionChanged = area
						delete game.selectionList; delete game.selectionOffsets
					}, area)
					await page.keyboard.down(modifier); assert.equal((await sample(page)).mode, 'clone')
					if (!area) await page.evaluate(() => game.pickupEntitiesForCloning())
					const before = await sample(page)
					await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.down('Escape')
					const cancelled = await sample(page); cleaned(cancelled); unchanged(before, cancelled); assert.equal(cancelled.cards, true); assert.equal(cancelled.splash, false)
					await page.keyboard.up('Escape'); await page.keyboard.up(modifier)
					await page.locator('canvas').dispatchEvent('mouseup', { button: 0, buttons: 0, clientX: 50, clientY: 50 })
					const released = await sample(page); unchanged(before, released); assert.equal(released.mode, null); assert.equal(released.calls.release, 1); assert.equal(released.splash, false)
					await press(page); assert.equal((await sample(page)).cards, false)
					await press(page); assert.equal((await sample(page)).splash, true)
				})
			}
			await check('native E picks hovered entity into unified held selection before Esc', async () => {
				await page.evaluate(() => { prepare(null); game.hoveredEntity = game.stuff[0] })
				await page.keyboard.press('e'); const before = await sample(page)
				assert.equal(before.mode, 'relocate'); assert.equal(before.selectionPreview, true)
				await press(page); const after = await sample(page); cleaned(after); unchanged(before, after); assert.equal(after.splash, false)
			})
		}
		await check('held Esc cannot cross layers; keyup and blur permit the next press', async () => {
			await page.evaluate(() => prepare('relocate', true, true))
			await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.down('Escape')
			let s = await sample(page); assert.equal(s.mode, null); assert.equal(s.cards, true); assert.equal(s.splash, false)
			await page.keyboard.up('Escape'); await press(page); assert.equal((await sample(page)).cards, false)
			await page.evaluate(() => { prepare(null, true); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true, cancelable: true })) })
			assert.equal((await sample(page)).cards, true)
			await press(page); assert.equal((await sample(page)).cards, false)
			await page.evaluate(() => { prepare(null, true); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', cancelable: true })); dispatchEvent(new Event('blur')); openCards() })
			await press(page); assert.equal((await sample(page)).cards, false)
		})
		await check('building cancellation is layered; Orbifold and idle menu stay native', async () => {
			await page.evaluate(() => { prepare(null, true); game.interactionMode = 'build'; game.itemInHand = { name: 'pump' }; game.transportedEntity = {} })
			await press(page); let s = await sample(page); cleaned(s); assert.equal(s.item, null); assert.equal(s.cards, true); assert.equal(s.splash, false)
			await page.evaluate(() => { prepare(null, true); game.orbifoldUI = {} })
			await press(page); s = await sample(page); assert.equal(s.calls.orb, 1); assert.equal(s.cards, true); assert.equal(s.splash, false)
			await page.evaluate(() => prepare(null)); await press(page); assert.equal((await sample(page)).splash, true)
			await press(page); assert.equal((await sample(page)).splash, false)
		})
		for (const source of ['shop', 'q', 'upgrade']) {
			await check('held Esc does not cross a cancelled ' + source + ' placement layer; blur permits the next layer', async () => {
				await page.evaluate(source => beginPlacement(source), source)
				if (source === 'q') await page.keyboard.press('q')
				await page.evaluate(source => showPlacementHint(source), source)
				const before = await sample(page)
				await page.keyboard.down('Escape'); await page.keyboard.down('Escape'); await page.keyboard.down('Escape')
				const after = await sample(page); cleaned(after, before); unchanged(before, after); assert.equal(after.item, null); assert.equal(after.hintVisible, false); assert.equal(after.cards, true); assert.equal(after.splash, false)
				await page.keyboard.up('Escape'); await page.evaluate(() => dispatchEvent(new Event('blur')))
				await press(page); assert.equal((await sample(page)).cards, false); assert.equal((await sample(page)).splash, false)
			})
		}
		await check('building hot toggle preserves the preview until a key and disabled mode matches native', async () => {
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop'); setFix(false) })
			assert.equal((await sample(page)).item, 'pump'); await press(page)
			let s = await sample(page); assert.equal(s.item, null); assert.equal(s.splash, s.unified)
			await page.evaluate(() => { beginPlacement('upgrade'); showPlacementHint('upgrade'); setFix(true) })
			assert.equal((await sample(page)).item, 'waypoint2'); const before = await sample(page); await press(page)
			s = await sample(page); cleaned(s, before); unchanged(before, s); assert.equal(s.splash, false); assert.equal(s.hintVisible, false)
		})
		await check('building preview yields to editable focus, Loader page, WE capture and WE dialog', async () => {
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop') })
			await page.locator('#fixture-input').focus(); await press(page)
			assert.equal((await sample(page)).splash, (await sample(page)).unified) // Guard delegates this build's native branch.
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop'); window.buildPage = ModLoader.forMod('Cattail_TweaksQuality_Tweaks').ui.pages.register({ id: 'build-fixture', title: 'Build fixture' }); buildPage.open(game.splash) })
			await press(page); assert.equal(await page.evaluate(() => buildPage.isActive()), false); assert.equal((await sample(page)).item, 'pump'); assert.equal((await sample(page)).splash, false)
			await page.evaluate(() => { Object.assign(weState, { active: true, pending: true, preview: true, count: 1, steps: [] }) })
			for (let i = 0; i < 4; i++) { await press(page); assert.equal((await sample(page)).item, 'pump'); assert.equal((await sample(page)).splash, false) }
			assert.deepEqual(await page.evaluate(() => weState.steps), ['pending', 'preview', 'selection', 'hotkey-escape'])
			await page.evaluate(() => { window.buildDialog = window[Symbol.for('cattail.world-editor.dialogs')].create({ id: 'build-dialog', title: 'Build dialog' }); buildDialog.mount() })
			await press(page); assert.equal(await page.evaluate(() => buildDialog.closed), true); assert.equal((await sample(page)).item, 'pump')
			const before = await sample(page); await press(page); const after = await sample(page); cleaned(after, before); unchanged(before, after); assert.equal(after.splash, false)
		})
		await check('unknown held objects and legacy eraser placeholders retain native behavior', async () => {
			for (const eraser of [false, true]) {
				await page.evaluate(eraser => { prepare(null, true); if (eraser) game.interactionMode = 'build'; game.itemInHand = { name: eraser ? 'eraser' : 'pump', eraser } }, eraser)
				await press(page); const s = await sample(page); assert.equal(s.item, null); assert.equal(s.cards, true); assert.equal(s.splash, s.unified)
			}
		})
		await check('orphaned preview rejects foreign, world, transported and unknown held objects', async () => {
			for (const kind of ['plain', 'foreign', 'world', 'transported', 'eraser', 'unpurchasable', 'unknown-mode', 'unknown-class']) {
				await page.evaluate(kind => {
					beginPlacement('shop'); showPlacementHint('shop'); clickCategory('other')
					if (kind === 'plain') game.itemInHand = { name: 'pump', master: game }
					if (kind === 'foreign') game.itemInHand.master = {}
					if (kind === 'world') { game.itemInHand.position = [8, 9]; game.stuff.push(game.itemInHand) }
					if (kind === 'transported') game.transportedEntity = {}
					if (kind === 'eraser') game.itemInHand.eraser = true
					if (kind === 'unpurchasable') game.codex.entities.pump.canPurchase = false
					if (kind === 'unknown-mode') game.interactionMode = 'third-party'
					if (kind === 'unknown-class') { window.savedPumpClass = game.codex.entities.pump.class; game.codex.entities.pump.class = () => {} }
				}, kind)
				const before = await sample(page); await press(page); const after = await sample(page)
				unchanged(before, after); assert.equal(after.cards, true); assert.equal(after.splash, after.unified)
				await page.evaluate(kind => {
					if (kind === 'world') game.stuff.pop()
					if (kind === 'unpurchasable') game.codex.entities.pump.canPurchase = true
					if (kind === 'unknown-class') { game.codex.entities.pump.class = savedPumpClass; delete window.savedPumpClass }
				}, kind)
			}
		})
		await check('orphaned preview consumes inherited repeat only and blur unlocks the next layer', async () => {
			await page.evaluate(() => {
				beginPlacement('shop'); showPlacementHint('shop'); clickCategory('other')
				dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true, cancelable: true }))
			})
			assert.equal((await sample(page)).item, 'pump'); assert.equal((await sample(page)).calls.splash, 0)
			await page.evaluate(() => dispatchEvent(new Event('blur')))
			await page.keyboard.down('Escape'); assert.equal((await sample(page)).item, null); assert.equal((await sample(page)).cards, true)
			// Simulate a fresh nonrepeat key after focus loss without delivering the old keyup.
			await page.evaluate(() => { dispatchEvent(new Event('blur')); dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', cancelable: true })) })
			assert.equal((await sample(page)).cards, false); assert.equal((await sample(page)).splash, false)
			await page.keyboard.up('Escape')
		})
		await check('orphaned preview hot disable delegates native and re-enable waits for Esc', async () => {
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop'); clickCategory('other'); setFix(false) })
			assert.equal((await sample(page)).item, 'pump'); await press(page)
			assert.equal((await sample(page)).cards, true); assert.equal((await sample(page)).splash, (await sample(page)).unified)
			await page.evaluate(() => { beginPlacement('upgrade'); showPlacementHint('upgrade'); clickCategory('other'); setFix(true) })
			assert.equal((await sample(page)).item, 'waypoint2'); const before = await sample(page); await press(page)
			const after = await sample(page); cleaned(after, before); unchanged(before, after); assert.equal(after.item, null); assert.equal(after.cards, true); assert.equal(after.splash, false)
		})
		await check('orphaned preview still yields to editable, Loader page, WE capture and dialog owners', async () => {
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop'); clickCategory('other') })
			await page.locator('#fixture-input').focus(); await press(page)
			assert.equal((await sample(page)).splash, (await sample(page)).unified); assert.equal((await sample(page)).cards, true)
			await page.evaluate(() => { beginPlacement('shop'); showPlacementHint('shop'); clickCategory('other'); buildPage.open(game.splash) })
			await press(page); assert.equal(await page.evaluate(() => buildPage.isActive()), false); assert.equal((await sample(page)).item, 'pump')
			await page.evaluate(() => Object.assign(weState, { active: true, pending: true, preview: true, count: 1, steps: [] }))
			for (let i = 0; i < 4; i++) { await press(page); assert.equal((await sample(page)).item, 'pump'); assert.equal((await sample(page)).splash, false) }
			assert.deepEqual(await page.evaluate(() => weState.steps), ['pending', 'preview', 'selection', 'hotkey-escape'])
			await page.evaluate(() => { window.orphanDialog = window[Symbol.for('cattail.world-editor.dialogs')].create({ id: 'orphan-dialog', title: 'Orphan dialog' }); orphanDialog.mount() })
			await press(page); assert.equal(await page.evaluate(() => orphanDialog.closed), true); assert.equal((await sample(page)).item, 'pump')
			await press(page); assert.equal((await sample(page)).item, null); assert.equal((await sample(page)).cards, true); assert.equal((await sample(page)).splash, false)
		})

		await check('non-Esc keys and original keyup movement stay native', async () => {
			await page.evaluate(() => prepare('erase'))
			await page.keyboard.down('w'); assert.equal(await page.evaluate(() => game.translationMap[0]), 1)
			await page.keyboard.up('w'); assert.equal(await page.evaluate(() => game.translationMap[0]), 0)
			const before = await page.evaluate(() => [window.processQCalls || 0, window.processECalls || 0])
			await page.keyboard.press('q'); await page.keyboard.press('e')
			assert.deepEqual(await page.evaluate(() => [processQCalls, processECalls]), before.map(n => n + 1))
			assert.equal((await sample(page)).mode, 'relocate')
		})
		await check('editable focus and visible modal guard delegate rather than taking a game layer', async () => {
			await page.evaluate(() => prepare('erase', true)); await page.locator('#fixture-input').focus(); await press(page)
			assert.equal((await sample(page)).calls.splash, 1) // Native baseline, no Tweaks interception.
			await page.evaluate(() => { prepare('erase', true); const modal = document.createElement('div'); modal.id = 'fixture-modal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.textContent = 'modal'; document.body.append(modal) })
			await press(page); assert.equal((await sample(page)).calls.splash, 1)
			await page.evaluate(() => document.querySelector('#fixture-modal').remove())
		})
		await check('a capture owner or preventDefault keeps precedence', async () => {
			await page.evaluate(() => {
				prepare('erase', true)
				window.owner = e => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation() } }
				addEventListener('keydown', owner, true)
			})
			await press(page); let s = await sample(page); assert.equal(s.mode, 'erase'); assert.equal(s.cards, true); assert.equal(s.calls.splash, 0)
			await page.evaluate(() => { removeEventListener('keydown', owner, true); window.owner = e => e.preventDefault(); addEventListener('keydown', owner, true) })
			await press(page); s = await sample(page); assert.equal(s.calls.splash, 1)
			await page.evaluate(() => removeEventListener('keydown', owner, true))
		})
		await check('actual WE capture keeps pending/preview/selection/editor cancellation order', async () => {
			await page.evaluate(() => { prepare('erase', true); Object.assign(weState, { active: true, pending: true, preview: true, count: 1, steps: [] }) })
			for (let i = 0; i < 4; i++) { await press(page); const s = await sample(page); assert.equal(s.mode, 'erase'); assert.equal(s.cards, true); assert.equal(s.calls.splash, 0) }
			assert.deepEqual(await page.evaluate(() => weState.steps), ['pending', 'preview', 'selection', 'hotkey-escape'])
			await press(page); assert.equal((await sample(page)).mode, null)
		})
		await check('actual WE shared dialog consumes Esc before native or Tweaks', async () => {
			await page.evaluate(() => { prepare('relocate', true); window.fixtureDialog = window[Symbol.for('cattail.world-editor.dialogs')].create({ id: 'fixture-dialog', title: 'Dialog' }); fixtureDialog.mount() })
			await press(page); const s = await sample(page); assert.equal(s.mode, 'relocate'); assert.equal(s.cards, true); assert.equal(s.calls.splash, 0)
			assert.equal(await page.evaluate(() => fixtureDialog.closed), true)
		})
		await check('actual Loader UI page handles Esc before game cards', async () => {
			await page.evaluate(() => { prepare(null, true); window.fixturePage = ModLoader.forMod('Cattail_TweaksQuality_Tweaks').ui.pages.register({ id: 'escape-fixture', title: 'Fixture' }); fixturePage.open(game.splash) })
			assert.equal(await page.evaluate(() => fixturePage.isActive()), true)
			await press(page); assert.equal(await page.evaluate(() => fixturePage.isActive()), false)
			const s = await sample(page); assert.equal(s.cards, true); assert.equal(s.calls.splash, 0)
		})
		await check('hot toggle changes only subsequent keys and off mode delegates native behavior', async () => {
			await page.evaluate(() => { prepare('erase', true); setFix(false) })
			assert.equal((await sample(page)).mode, 'erase'); await press(page)
			let s = await sample(page); assert.equal(s.mode, null); assert.equal(s.cards, true); assert.equal(s.splash, true)
			await page.evaluate(() => { prepare('relocate', true); setFix(true) })
			assert.equal((await sample(page)).mode, 'relocate'); await press(page); s = await sample(page); assert.equal(s.cards, true); assert.equal(s.splash, false)
		})
		await check('repeated lifecycle does not duplicate keyboard cancellation or remove captured owners', async () => {
			await page.evaluate(async () => { await ModLoader.stage('afterVanillaScripts', game); prepare('erase', true) })
			await press(page); const s = await sample(page)
			cleaned(s); assert.equal(s.cards, true); assert.equal(s.calls.splash, 0)
		})
		const long = await setup('?shop=1.2.1&long')
		await check('classic permanent long list is not auto-minimized', async () => {
			const before = await long.locator('.cattail-classic-shop').getAttribute('class')
			await press(long); assert.equal((await sample(long)).splash, true)
			assert.equal(await long.locator('.cattail-classic-shop').getAttribute('class'), before)
		})
		const menu = await setup()
		await check('actual Loader preview/cancel changes no tool immediately and restores later keys', async () => {
			await menu.evaluate(() => { prepare('erase', true); ModLoader.togglePanel() })
			await menu.locator('.modloader-mod-title').filter({ hasText: /^Tweaks|^优化和修复|^優化和修復/ }).click()
			const field = menu.locator('[data-modloader-config-key="' + KEY + '"]')
			await field.scrollIntoViewIfNeeded(); assert.equal(await field.isChecked(), true); await field.uncheck()
			assert.equal((await sample(menu)).mode, 'erase')
			await menu.screenshot({ path: path.join(output, 'settings.png') })
			await menu.locator('.modloader-cancel-button').click(); assert.equal((await sample(menu)).mode, 'erase')
			await menu.evaluate(() => ModLoader.togglePanel()); await press(menu)
			assert.equal((await sample(menu)).splash, false); assert.equal((await sample(menu)).mode, null)
		})
		const saved = await setup()
		await check('actual Loader save and reload persists the disabled setting', async () => {
			await saved.evaluate(() => ModLoader.togglePanel())
			await saved.locator('.modloader-mod-title').filter({ hasText: /^Tweaks|^优化和修复|^優化和修復/ }).click()
			const field = saved.locator('[data-modloader-config-key="' + KEY + '"]'); await field.scrollIntoViewIfNeeded(); await field.uncheck()
			await saved.locator('.modloader-save-button').click(); await saved.reload(); await ready(saved)
			await saved.evaluate(() => prepare('erase', true)); await press(saved); assert.equal((await sample(saved)).splash, true)
		})
		for (const query of ['?old', '?mobile', '?off']) {
			const guard = await setup(query)
			await check('unsupported/cold-disabled target delegates native Esc ' + query, async () => {
				await guard.evaluate(() => prepare('erase', true)); await press(guard)
				const s = await sample(guard); assert.equal(s.mode, null); assert.equal(s.cards, true); assert.equal(s.splash, true)
				if (query !== '?off') assert.equal(await guard.evaluate(() => window.__cattailTweaksBetterEscapeInstalled), undefined)
			})
		}
		const disabled = await setup()
		await check('disabling Tweaks on reload removes its listener', async () => {
			await disabled.route('**/mods/enabled.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mods: [BETTER, WE] }) }))
			await disabled.reload(); await ready(disabled)
			assert.equal(await disabled.evaluate(() => window.__cattailTweaksBetterEscapeInstalled), undefined)
			await disabled.evaluate(() => prepare('erase', true)); await press(disabled); assert.equal((await sample(disabled)).splash, true)
		})
		assert.deepEqual(errors, []); passed = true; console.log('ESC_ACTION_OK=' + results.length)
	} finally {
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed, results, errors, browser: browser.version(), nativeRoot: NATIVE_ROOT, fixSource: FIX_SOURCE, boundary: 'actual desktop Game Q/E/Store purchase/pickupItem/Cloud/keyboard/pointer/processDown/processUp/cleanup and clone pickup, Store category header/proxy changes and current CSS, Loader/menu/UI page, Better UIs native/accordion/classic/categories, Tweaks Shift-Ctrl guard and WE native-tools/input-controller/shared-dialog source; synthetic entity constructors/world/runtime/shared guards/native-tool eligibility/transactions/storage/splash/preferences/projection/scene movement, with throwing build/upgrade/cost/refund/save commit sentinels; unified preview uses native pickup without the unadapted WE legacy held-list hook; unsupported/mobile markers use desktop fixture only; old Game/UI use current CSS and consumers; no player game/profile/config/save/Steam' }, null, 2))
		console.log('Report: ' + output)
		for (const ctx of contexts) await ctx.close()
		await browser.close(); await new Promise(resolve => server.close(resolve))
	}
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
