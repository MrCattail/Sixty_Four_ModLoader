'use strict'

// Real desktop Store, Game resource mutations, Loader and Better UIs shop entries.
// World data/actions are synthetic; an allowlisted HTTP server and fresh browser
// contexts never serve the installed enabled list, player profiles or save APIs.
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
const ROOT = path.resolve(__dirname, '../../..')
const MOD_ROOT = process.env.DYNAMIC_DETAILS_MOD_ROOT || path.resolve(__dirname, '..')
const UI_ROOT = process.env.BETTER_UI_MOD_ROOT || path.join(ROOT, 'mods/Cattail_TweaksQuality_Better-UIs')
const DD = 'Cattail_TweaksQuality_Dynamic-Details'
const UI = 'Cattail_TweaksQuality_Better-UIs'
const ddEntries = ['scripts/core.js', 'scripts/build-countdown.js']
const uiEntries = ['scripts/classic-shop.js', 'scripts/shop-categories.js', 'scripts/native-accordion-shop.js']
const ddManifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const uiManifest = JSON.parse(fs.readFileSync(path.join(UI_ROOT, 'mod.json'), 'utf8'))
const uiSource = fs.readFileSync(path.join(ROOT, 'scripts/ui.js'), 'utf8')
const storeSource = uiSource.slice(uiSource.indexOf('class Store {'), uiSource.indexOf('class Shop {'))
const codexSource = fs.readFileSync(path.join(ROOT, 'scripts/codex.js'), 'utf8')
const classes = [...new Set([...codexSource.matchAll(/class:\s*(\w+)/g)].map(match => match[1]))]
const output = process.env.DYNAMIC_DETAILS_SHOP_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-details-shop-'))
fs.mkdirSync(output, { recursive: true })

function fixture() {
	const q = new URLSearchParams(location.search), mode = q.get('mode') || 'native'
	localStorage.setItem('modloader:Cattail_TweaksQuality_Better-UIs:config:shopVersion', JSON.stringify(['classic', 'compact'].includes(mode) ? '1.2.1' : '1.3'))
	localStorage.setItem('modloader:Cattail_TweaksQuality_Dynamic-Details:config:enableBuildCountdown', q.has('disabled') ? 'false' : 'true')
	localStorage.setItem('cattailShopCategoriesCompressed', mode === 'compact' ? '1' : '0')
	localStorage.setItem('cattailNativeShopStyle', mode === 'capsule' ? 'accordion' : 'native')
	window.fixtureNow = 10000
	Object.defineProperty(performance, 'now', { value: () => window.fixtureNow })
	window.boot = async () => {
		window.game = Object.assign(Object.create(Game.prototype), {
			version: '1.3', language: 'en', isMobile: false, plane: false,
			codex: abstract_getCodex(), unlockedEntities: {}, entitiesInGame: { mega3: 1 }, onlyones: {}, resources: Array(10).fill(0),
			analytics: { frame: Array.from({ length: 10 }, () => [0, 0]) }, resourcePops: [],
			stats: { totalResourcesMined: Array(10).fill(0), absoluteResourcesCount: 0 }, vaults: new Set(), stuff: [],
			prices: {}, picks: [], worldClicks: 0, splash: { isShown: false },
			getRealPrice(name) { return this.prices[name] || [10000, 10000] }, makeReadable: value => String(value),
			pronounce(group, id, part) {
				if (group === 'cattailBuildCountdown') return this.words?.[this.language]?.[group]?.[id] || id
				return part === 'description' ? this.language + ': Description for ' + id : part === 'name' ? this.language + ': ' + id : 'NEW'
			},
			pickupItem(name) { this.picks.push(name); this.interactionMode = 'build'; this.itemInHand = { name } },
			pickupEraser() { this.interactionMode = 'erase' }, cleanupErase() {}, cleanupRelocation() {}, removeHint() {}
		})
		for (const [id, entity] of Object.entries(game.codex.entities)) {
			if (entity.canPurchase) game.unlockedEntities[id] = true
			entity.shouldUnlock = () => false
		}
		await ModLoader.stage('afterVanillaScripts', game)
		game.words = ModLoader.applyWords({ en: {}, sch: {}, modsch: {}, tch: {} }, game)
		game.store = new DesktopStoreVersion(document.querySelector('.store'), game)
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		await ModLoader.stage('afterGameInit', game)
		window.originalCards = { ...game.store.html.items }
		window.originalHandlers = Object.fromEntries(Object.entries(originalCards).map(([id, card]) => [id, card.onmousedown]))
		window.countdownText = (id = 'pump') => game.store.html.priceContainers[id].querySelector('.cattail-build-countdown')?.textContent
		window.warmFlow = (income = [10, 20], outflow = []) => {
			delete game._cattailShopBuildCountdownState
			game.resources.fill(0); game.prices = {}; window.fixtureNow += 1000
			game.store.compositionUpdate(); game.store.visibilityUpdate()
			for (let i = 0; i < 40; i++) {
				window.fixtureNow += 1000
				game.addResourcesFromArray(income)
				game.substractResourcesFromArray(outflow)
				game.store.visibilityUpdate()
			}
		}
		document.body.addEventListener('mousedown', () => game.worldClicks++)
		window.ready = true
	}
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>@font-face{font-family:Montserrat;src:url(/font/Montserrat-Regular.woff2)}body{background:#b9b9c0}</style><div class="store"></div><script src="/scripts/game.js"></script><script src="/codex.js"></script><script src="/store.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(error=>{window.bootError=error.stack})</script>'
	} else if (url.pathname === '/mods/enabled.json') {
		const mods = url.searchParams.get('mode') === 'native' ? [DD] : url.searchParams.get('order') === 'dd-first' ? [DD, UI] : [UI, DD]
		type = 'application/json'; body = JSON.stringify({ mods })
	} else if (url.pathname === '/mods/' + DD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...ddManifest, entries: ddEntries })
	} else if (url.pathname === '/mods/' + UI + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...uiManifest, entries: uiEntries })
	} else if (url.pathname === '/store.js') body = storeSource
	else if (url.pathname === '/codex.js') body = classes.map(name => 'const ' + name + ' = class {};').join('\n') + '\n' + codexSource
	else {
		const relative = decodeURIComponent(url.pathname.slice(1)), ddPrefix = 'mods/' + DD + '/', uiPrefix = 'mods/' + UI + '/'
		const target = relative.startsWith(ddPrefix) ? path.resolve(MOD_ROOT, relative.slice(ddPrefix.length)) : relative.startsWith(uiPrefix) ? path.resolve(UI_ROOT, relative.slice(uiPrefix.length)) : path.resolve(ROOT, relative)
		const permitted = ['cascade.css', 'scripts/game.js', 'modloader/loader.js', ...ddEntries.map(e => ddPrefix + e), ddPrefix + 'locale/dynamic-details.json', ...uiEntries.map(e => uiPrefix + e)].includes(relative) || /^(img|font)\/[\w./-]+$/.test(relative)
		if (permitted && [ROOT, MOD_ROOT, UI_ROOT].some(root => target.startsWith(root + path.sep)) && fs.existsSync(target) && fs.statSync(target).isFile()) {
			body = fs.readFileSync(target)
			type = ({ '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(target)] || type
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

function duration(text) {
	assert.match(text, /^Buildable: (?:\d+ h )?(?:\d+ m )?\d+ s$/)
	return [...text.matchAll(/(\d+) ([hms])/g)].reduce((sum, match) => sum + Number(match[1]) * ({ h: 3600, m: 60, s: 1 })[match[2]], 0)
}

async function main() {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath, ignoreDefaultArgs: ['--hide-scrollbars'] })
	const contexts = [], errors = [], results = []
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	const setup = async (mode, order = 'ui-first', disabled = false) => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context)
		const page = await context.newPage()
		page.on('pageerror', error => errors.push(error.stack))
		await context.route('**/*', route => {
			const url = route.request().url()
			if (!url.startsWith(origin + '/')) return route.abort()
			if (url.endsWith('/mods/enabled.json')) return route.continue({ url: origin + '/mods/enabled.json?mode=' + mode + '&order=' + order })
			return route.continue()
		})
		await page.goto(origin + '/?mode=' + mode + (disabled ? '&disabled=1' : ''))
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		return page
	}
	const viewText = (page, mode, id = 'pump') => page.evaluate(({ mode, id }) => {
		const price = mode === 'compact' ? document.querySelector('[data-shop-item="' + id + '"] .itemPrice') : game.store.html.priceContainers[id]
		return price?.querySelector('.cattail-build-countdown')?.textContent
	}, { mode, id })
	try {
		for (const mode of ['native', 'better-native', 'classic', 'compact', 'capsule']) for (const order of mode === 'native' ? ['ui-first'] : ['ui-first', 'dd-first']) {
			const page = await setup(mode, order), prefix = mode + '/' + order + ': '
			await check(prefix + 'missing resources show unknown, with one node per real price', async () => {
				assert.equal(await viewText(page, mode), 'Buildable: --')
				assert.equal(await page.evaluate(() => Object.values(game.store.html.priceContainers).every(price => price.querySelectorAll('.cattail-build-countdown').length === 1)), true)
				assert.equal(await page.evaluate(() => Boolean(game.shop)), false)
			})
			await check(prefix + 'net income and multi-resource bottleneck use real Game events', async () => {
				await page.evaluate(() => { warmFlow([15, 30], [5, 10]); game.prices.pump = [500, 2000]; game.store.compositionUpdate(); game.store.visibilityUpdate() })
				const seconds = duration(await viewText(page, mode))
				assert.ok(seconds >= 58 && seconds <= 62, 'expected about 60 s, got ' + seconds)
				assert.deepEqual(await page.evaluate(() => game.resources.slice(0, 2)), [400, 800])
			})
			await check(prefix + 'ceiling, hour formatting and one-second refresh', async () => {
				await page.evaluate(() => { game.prices.pump = [40401, 1]; game.store.compositionUpdate(); game.store.visibilityUpdate() })
				assert.match(await viewText(page, mode), /^Buildable: 1 h \d+ m \d+ s$/)
				await page.evaluate(() => { window.beforeText = countdownText(); fixtureNow += 100; game.addResourcesFromArray([10, 20]); game.store.visibilityUpdate() })
				assert.equal(await viewText(page, mode), await page.evaluate(() => beforeText))
				await page.evaluate(() => { fixtureNow += 1100; game.store.visibilityUpdate() })
				assert.notEqual(await viewText(page, mode), await page.evaluate(() => beforeText))
				await page.evaluate(() => { game.prices.pump = [400.01, 1]; game.resources[0] = 400; game.store.compositionUpdate(); game.store.visibilityUpdate() })
				assert.equal(await viewText(page, mode), 'Buildable: 1 s')
			})
			await check(prefix + 'affordable hides immediately; loss and nonpositive flow return unknown', async () => {
				await page.evaluate(() => { game.resources.fill(100000); game.store.visibilityUpdate() })
				assert.equal(await viewText(page, mode), '')
				assert.equal(await page.evaluate(() => getComputedStyle(game.store.html.priceContainers.pump.querySelector('.cattail-build-countdown')).display), 'none')
				await page.evaluate(() => { warmFlow([10, 10], [20, 20]); game.store.compositionUpdate(); game.store.visibilityUpdate() })
				assert.equal(await viewText(page, mode), 'Buildable: --')
			})
			await check(prefix + 'composition recreates countdown after native price clearing', async () => {
				await page.evaluate(() => { window.oldCountdown = game.store.html.priceContainers.pump.querySelector('.cattail-build-countdown'); game.prices.pump = [71, 92]; game.entitiesInGame.pump = 4; game.store.compositionUpdate(); game.store.visibilityUpdate() })
				assert.deepEqual(await page.evaluate(() => [...game.store.html.priceContainers.pump.querySelectorAll('.priceString')].map(el => el.textContent)), ['71', '92'])
				assert.equal(await page.evaluate(() => game.store.html.counters.pump.textContent), '4')
				assert.equal(await page.evaluate(() => oldCountdown.isConnected), false)
				assert.equal(await viewText(page, mode), 'Buildable: --')
			})
			await check(prefix + 'locked, onlyone and wrong-plane items have no active countdown', async () => {
				await page.evaluate(() => { game.onlyones.pump = true; game.store.visibilityUpdate() })
				assert.equal(await page.evaluate(() => countdownText()), '')
				await page.evaluate(() => { game.onlyones.pump = false; game.unlockedEntities.pump = false; game.store.reinit() })
				assert.equal(await page.evaluate(() => countdownText()), '')
				await page.evaluate(() => { game.unlockedEntities.pump = true; game.plane = true; game.store.visibilityUpdate() })
				assert.equal(await page.evaluate(() => countdownText()), '')
				assert.equal(await viewText(page, mode, 'scan'), 'Buildable: --')
				await page.evaluate(() => { game.plane = false; game.store.visibilityUpdate() })
				assert.equal(await viewText(page, mode), 'Buildable: --')
			})
			await check(prefix + 'locale/reinit drops old nodes and preserves native handlers', async () => {
				await page.evaluate(() => { window.oldPrices = Object.values(game.store.html.priceContainers); game.language = 'modsch'; game.store.reinit() })
				assert.equal(await viewText(page, mode), '可建造: --')
				assert.equal(await page.evaluate(() => oldPrices.every(price => !price.querySelector('.cattail-build-countdown'))), true)
				await page.evaluate(() => { game.language = 'en'; game.store.reinit(); window.originalCards = { ...game.store.html.items }; window.originalHandlers = Object.fromEntries(Object.entries(originalCards).map(([id, card]) => [id, card.onmousedown])) })
				assert.equal(await page.evaluate(() => Object.entries(game.store.html.items).every(([id, card]) => card === originalCards[id] && card.onmousedown === originalHandlers[id])), true)
			})
			await check(prefix + 'purchase guard, real card activation and stock are unchanged by display', async () => {
				await page.evaluate(() => { game.picks = []; game.store.html.items.pump.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
				assert.deepEqual(await page.evaluate(() => game.picks), [])
				await page.evaluate(() => { game.resources.fill(100000); game.store.visibilityUpdate(); window.beforeStock = game.resources.slice(); game.store.html.items.pump.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
				assert.deepEqual(await page.evaluate(() => ({ picks: game.picks, stockSame: JSON.stringify(beforeStock) === JSON.stringify(game.resources) })), { picks: ['pump'], stockSame: true })
				await page.evaluate(() => { delete game.itemInHand; delete game.interactionMode; game.resources.fill(0); game.store.visibilityUpdate() })
			})
			if (mode === 'compact') await check(prefix + 'countdown-only ticks retain rows, tooltip targets and expansion', async () => {
				await page.evaluate(() => { warmFlow(); game.prices.pump = [500, 2000]; game.store.compositionUpdate(); game.store.visibilityUpdate() })
				await page.locator('.cattail-shop-category').filter({ has: page.locator('[data-shop-item="pump"]') }).locator('.cattail-shop-category-head').click()
				await page.evaluate(() => { window.savedRow = document.querySelector('[data-shop-item="pump"]'); window.savedText = savedRow.querySelector('.cattail-build-countdown').textContent; window.rowChanges = 0; window.rowObserver = new MutationObserver(records => { rowChanges += records.filter(record => [...record.removedNodes].some(node => node === savedRow || node.contains?.(savedRow))).length }); rowObserver.observe(document.querySelector('.cattail-shop-category-panel'), { childList: true, subtree: true }); for (let i = 0; i < 5; i++) { fixtureNow += 1100; game.addResourcesFromArray([11, 22]); game.store.visibilityUpdate() } })
				assert.equal(await page.evaluate(() => savedRow === document.querySelector('[data-shop-item="pump"]') && rowChanges === 0 && savedRow.closest('.cattail-shop-category').classList.contains('expanded')), true)
				assert.notEqual(await viewText(page, mode), await page.evaluate(() => savedText))
				await page.locator('[data-shop-item="pump"]').hover(); await page.waitForTimeout(650)
				assert.equal(await page.locator('#modloader-panel-tooltip.active').textContent(), 'en: Description for pump')
			})
			await check(prefix + 'layout switches retain countdowns and node/handler identity', async () => {
				await page.evaluate(() => { game.resources.fill(0); game.store.visibilityUpdate(); window.cardsBeforeSwitch = { ...game.store.html.items }; window.handlersBeforeSwitch = Object.fromEntries(Object.entries(cardsBeforeSwitch).map(([id, card]) => [id, card.onmousedown])) })
				if (['classic', 'compact'].includes(mode)) { await page.locator('.cattail-shop-compact-toggle').click(); await page.locator('.cattail-shop-compact-toggle').click() }
				if (['capsule', 'better-native'].includes(mode)) { await page.locator('.cattail-native-style').click(); await page.locator('.cattail-native-style').click() }
				assert.equal(await page.evaluate(() => Object.entries(game.store.html.items).every(([id, card]) => card === cardsBeforeSwitch[id] && card.onmousedown === handlersBeforeSwitch[id])), true)
				assert.match(await viewText(page, mode), /^Buildable: /)
			})
			await check(prefix + 'HUD hiding/restoring does not duplicate countdowns', async () => {
				await page.evaluate(() => ModLoader.ui.hud.hide())
				assert.equal(await page.evaluate(() => Object.values(game.store.html.priceContainers).every(price => getComputedStyle(price.closest('.cattail-classic-shop') || game.store.vessel).pointerEvents === 'none')), true)
				await page.evaluate(() => { ModLoader.ui.hud.show(); game.store.visibilityUpdate() })
				assert.equal(await page.evaluate(() => Object.values(game.store.html.priceContainers).every(price => price.querySelectorAll('.cattail-build-countdown').length === 1)), true)
			})
			await check(prefix + 'visible price placement in wide and narrow windows', async () => {
				await page.evaluate(() => { warmFlow(); game.prices.pump = [500, 2000]; game.store.compositionUpdate(); game.store.visibilityUpdate(); game.store.centerItem('pump') })
				for (const width of [1440, 640]) {
					await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(350)
					await page.evaluate(() => game.store.centerItem('pump')); await page.waitForTimeout(350)
					const geometry = await page.evaluate(mode => {
						const price = mode === 'compact' ? document.querySelector('[data-shop-item="pump"] .itemPrice') : game.store.html.priceContainers.pump
						const node = price.querySelector('.cattail-build-countdown'), rect = node.getBoundingClientRect(), outer = price.getBoundingClientRect()
						return { display: getComputedStyle(node).display, width: rect.width, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, inside: rect.top >= outer.top && rect.bottom <= outer.bottom + 1, afterPrice: [...price.querySelectorAll('nobr')].every(el => el.getBoundingClientRect().bottom <= rect.top + 1) }
					}, mode)
					assert.equal(geometry.display, 'block'); assert.ok(geometry.width > 0 && geometry.left >= 0 && geometry.right <= width + 1 && geometry.top >= 0 && geometry.bottom <= 900 && geometry.inside && geometry.afterPrice, JSON.stringify(geometry))
					await page.screenshot({ path: path.join(output, mode + '-' + order + '-' + width + '.png') })
				}
				await page.setViewportSize({ width: 1440, height: 900 })
			})
			await check(prefix + 'Store replacement cleans stale nodes and old callbacks stay inactive', async () => {
				await page.evaluate(() => { window.oldStore = game.store; window.oldPriceNodes = Object.values(oldStore.html.priceContainers); game.store = new DesktopStoreVersion(document.querySelector('.store'), game); game.store.compositionUpdate(); game.store.visibilityUpdate(); oldStore.visibilityUpdate(); for (let i = 0; i < 3; i++) game.store.reinit() })
				assert.equal(await page.evaluate(() => oldPriceNodes.every(price => !price.querySelector('.cattail-build-countdown'))), true)
				assert.equal(await page.evaluate(() => Object.values(game.store.html.priceContainers).every(price => price.querySelectorAll('.cattail-build-countdown').length === 1)), true)
			})
			await page.close()
		}
		await check('disabled feature installs no countdown nodes, stylesheet or resource sampler', async () => {
			const page = await setup('compact', 'dd-first', true)
			await page.evaluate(() => { warmFlow(); game.store.reinit() })
			assert.equal(await page.locator('.cattail-build-countdown, #cattail-dynamic-build-countdown-style').count(), 0)
			assert.equal(await page.evaluate(() => Object.hasOwn(game, '_cattailShopBuildCountdownState')), false)
		})
		await check('storage-cap oscillation retains unknown rather than a false finite estimate', async () => {
			const page = await setup('native')
			for (const resource of [4, 5]) {
				await page.evaluate(resource => {
					delete game._cattailShopBuildCountdownState; game.resources.fill(0); game.prices.pump = Array(7).fill(0); game.prices.pump[resource] = 2000
					game.vaults = new Set([{}]); game.stuff = [{ name: 'vessel', state: 2, capacity: 1024 }]; game.resources[6] = 1; game.resources[resource] = 1020
					fixtureNow += 1000; game.store.compositionUpdate(); game.store.visibilityUpdate()
					for (let i = 0; i < 8; i++) { fixtureNow += 1000; if (i % 2) game.substractResourcesFromArray(Array.from({ length: 7 }, (_, j) => j === resource ? 4 : 0)); else game.addResourcesFromArray(Array.from({ length: 7 }, (_, j) => j === resource ? 4 : 0)); game.store.visibilityUpdate() }
				}, resource)
				assert.equal(await page.evaluate(() => countdownText()), 'Buildable: --')
			}
		})
		await check('no uncaught browser errors', async () => assert.deepEqual(errors, []))
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: results.length, results, browser: browser.version(), output }, null, 2))
		console.log(JSON.stringify({ passed: results.length, output }))
	} finally {
		for (const context of contexts) await context.close()
		await browser.close()
	}
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
