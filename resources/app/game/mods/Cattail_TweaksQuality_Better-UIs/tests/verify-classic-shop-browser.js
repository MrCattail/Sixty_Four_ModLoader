'use strict'

// Actual 1.3 Store + ModLoader UI in a fresh browser context, with a synthetic
// world. The HTTP allowlist never serves enabled.json or any player profile.
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
const ROOT = process.env.BETTER_UI_GAME_ROOT || path.resolve(__dirname, '../../..')
const MOD = 'Cattail_TweaksQuality_Better-UIs'
const MOD_ROOT = process.env.BETTER_UI_MOD_ROOT || path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const source = fs.readFileSync(path.join(ROOT, 'scripts/ui.js'), 'utf8')
const storeSource = source.slice(source.indexOf('class Store {'), source.indexOf('class Shop {'))
const codexSource = fs.readFileSync(path.join(ROOT, 'scripts/codex.js'), 'utf8')
const classes = [...new Set([...codexSource.matchAll(/class:\s*(\w+)/g)].map(match => match[1]))]
const output = process.env.BETTER_UI_SHOP_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'better-ui-classic-shop-'))
fs.mkdirSync(output, { recursive: true })

function fixture() {
	const options = new URLSearchParams(location.search)
	const configKey = key => 'modloader:Cattail_TweaksQuality_Better-UIs:config:' + key
	if (options.has('version')) localStorage.setItem(configKey('shopVersion'), JSON.stringify(options.get('version')))
	if (options.has('categories')) localStorage.setItem(configKey('enableShopCategories'), options.get('categories'))
	window.boot = async () => {
		window.game = {
			version: '1.3', language: 'en', isMobile: false, plane: false,
			codex: abstract_getCodex(), unlockedEntities: {}, entitiesInGame: { mega3: 1 }, onlyones: {}, resources: Array(10).fill(10000),
			prices: {}, picks: [], worldClicks: 0,
			getRealPrice(name) { return this.prices[name] || [2, 3] }, makeReadable: value => String(value),
			pronounce(group, id, part) { return part === 'description' ? this.language + ': Description for ' + id : part === 'name' ? this.language + ': ' + id : 'NEW' },
			pickupItem(name) { this.picks.push(name); this.interactionMode = 'build'; this.itemInHand = { name } },
			pickupEraser() { this.interactionMode = 'erase' }, cleanupErase() {}, cleanupRelocation() {}
		}
		for (const [id, entity] of Object.entries(game.codex.entities)) {
			if (entity.canPurchase) game.unlockedEntities[id] = true
			entity.shouldUnlock = () => false
		}
		await ModLoader.stage('afterVanillaScripts', game)
		window.nativeInit = DesktopStoreVersion.prototype.init
		game.store = new DesktopStoreVersion(document.querySelector('.store'), game)
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		document.body.addEventListener('mousedown', () => game.worldClicks++)
		window.ready = true
	}
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>@font-face{font-family:Montserrat;src:url(/font/Montserrat-Regular.woff2)}body{background:#b9b9c0}.fixture{position:absolute;left:30px;top:30px;font:18px Montserrat;color:#444;pointer-events:none}</style><div class="fixture">Isolated 1.3 Store test</div><div class="store"></div><script src="/codex.js"></script><script src="/store.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(error=>{window.bootError=error.stack})</script>'
	} else if (url.pathname === '/mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: [MOD] })
	} else if (url.pathname === '/mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries: manifest.entries.filter(entry => ['scripts/classic-shop.js', 'scripts/shop-categories.js', 'scripts/native-accordion-shop.js'].includes(entry)) })
	} else if (url.pathname === '/store.js') body = storeSource
	else if (url.pathname === '/codex.js') body = classes.map(name => 'const ' + name + ' = class {};').join('\n') + '\n' + codexSource
	else {
		const relative = decodeURIComponent(url.pathname.slice(1))
		const target = relative.startsWith('mods/' + MOD + '/') ? path.resolve(MOD_ROOT, relative.slice(('mods/' + MOD + '/').length)) : path.resolve(ROOT, relative)
		const permitted = ['cascade.css', 'modloader/loader.js', `mods/${MOD}/scripts/classic-shop.js`, `mods/${MOD}/scripts/shop-categories.js`, `mods/${MOD}/scripts/native-accordion-shop.js`].includes(relative) || /^(img|font)\/[\w./-]+$/.test(relative)
		if (permitted && (target.startsWith(ROOT + path.sep) || target.startsWith(MOD_ROOT + path.sep)) && fs.existsSync(target) && fs.statSync(target).isFile()) {
			body = fs.readFileSync(target)
			type = ({ '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(target)] || type
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	assert.equal(manifest.config.shopVersion.default, '1.3')
	assert.deepEqual(manifest.config.shopVersion.options, ['1.2.1', '1.3'])
	assert.equal(manifest.reloadOnConfigChange, true)
	assert.equal(manifest.entries[0], 'scripts/classic-shop.js')
	assert.equal(Object.keys(manifest.translations).length, 20)
	for (const tr of Object.values(manifest.translations)) for (const value of ['1.2.1', '1.3']) assert.ok(tr.config.shopVersion.valueLabels[value])
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	// Headless Chromium normally hides scrollbars; keep them for real gutter
	// measurements so expanded categories cannot silently shrink the cards.
	const browser = await playwright.chromium.launch({ headless: true, executablePath, ignoreDefaultArgs: ['--hide-scrollbars'] })
	const contexts = [], errors = [], results = []
	const setup = async (query = '', viewport = { width: 1440, height: 900 }) => {
		const context = await browser.newContext({ viewport }); contexts.push(context)
		const page = await context.newPage()
		page.on('pageerror', error => errors.push(error.message))
		await page.goto(address + query)
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		return page
	}
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	const state = page => page.evaluate(() => ({ classic: document.querySelectorAll('.cattail-classic-shop').length, size: document.querySelectorAll('.cattail-classic-size-toggle').length, compact: document.querySelectorAll('.cattail-shop-compact-toggle').length, alias: !!game.shop }))
	try {
		const native = await setup()
		await check('default 1.3 leaves native Store and category controls untouched', async () => {
			assert.deepEqual(await state(native), { classic: 0, size: 0, compact: 0, alias: false })
			assert.equal(await native.locator('.cattail-native-shop-toggle').count(), 2)
			assert.ok(await native.locator('.store > .element:not(.hidden):not(.eraser):not(.relocator)').count())
			assert.equal(await native.locator('#cattail-classic-shop-style, #cattail-shop-categories-style').count(), 0)
		})
		const page = await setup('?version=1.2.1')
		await check('classic uses real Store cards and native price/counter references', async () => {
			assert.deepEqual(await state(page), { classic: 1, size: 1, compact: 1, alias: false })
			assert.equal(await page.locator('.cattail-native-shop-toggle').count(), 0)
			assert.equal(await page.evaluate(() => Object.entries(game.store.html.items).every(([id, el]) => el === document.querySelector('[data-classic-item="' + id + '"]'))), true)
			await page.evaluate(() => { game.prices.pump = [27, 13]; game.entitiesInGame.pump = 4; game.store.compositionUpdate(); game.store.visibilityUpdate() })
			assert.equal(await page.locator('[data-classic-item="pump"] .itemCounter').textContent(), '4')
			assert.deepEqual(await page.locator('[data-classic-item="pump"] .priceString').allTextContents(), ['27', '13'])
			assert.equal(await page.locator('[data-classic-item="pump"]').evaluate(el => el.classList.contains('newItem')), false)
		})
		await check('native purchase handler; world mouse events are isolated', async () => {
			await page.locator('[data-classic-item="pump"]').click()
			assert.deepEqual(await page.evaluate(() => ({ picks: game.picks, world: game.worldClicks })), { picks: ['pump'], world: 0 })
		})
		await check('classic minimize and shared corner dock', async () => {
			await page.locator('.cattail-classic-size-toggle').click()
			assert.equal(await page.locator('.cattail-classic-shop').evaluate(el => el.classList.contains('minimized')), true)
			assert.equal(await page.locator('[data-classic-item="pump"] .imageVessel').isVisible(), false)
			assert.equal(await page.locator('.modloader-ui-dock .cattail-classic-size-toggle').count(), 1)
			await page.locator('.cattail-classic-size-toggle').click()
		})
		await check('compact eight-category toggle and native controls stay separate', async () => {
			await page.locator('.cattail-shop-compact-toggle').click()
			// Other is intentionally absent until an unassigned item is visible.
			assert.deepEqual(await page.locator('.cattail-shop-category').evaluateAll(nodes => nodes.map(node => node.dataset.categoryId)), ['main', 'mines', 'breaking', 'efficiency', 'conversion', 'storage', 'tools'])
			assert.equal(await page.locator('[data-classic-item="pump"]').isVisible(), false)
			await page.locator('[data-category-id="mines"] .cattail-shop-category-head').click()
			assert.equal(await page.evaluate(() => game.store.isOpen), true)
			await page.locator('[data-shop-item="pump"]').click()
			assert.deepEqual(await page.evaluate(() => game.picks), ['pump', 'pump'])
		})
		await check('unaffordable rows remain inspectable and cannot purchase', async () => {
			await page.evaluate(() => { game.resources = Array(10).fill(0); game.store.visibilityUpdate() })
			const row = page.locator('[data-shop-item="pump"]')
			assert.equal(await row.getAttribute('aria-disabled'), 'true')
			await row.dispatchEvent('click'); assert.equal(await page.evaluate(() => game.picks.length), 2)
			await row.hover(); await page.waitForTimeout(720)
			assert.equal(await page.locator('#modloader-panel-tooltip.active').textContent(), 'en: Description for pump')
			await page.evaluate(() => { game.resources[0] = 100; game.store.visibilityUpdate() })
			assert.equal(await row.locator('.available').count(), 1)
		})
		await check('centerItem and closeTypes control compact expansion without world scrolling', async () => {
			await page.evaluate(() => game.store.centerItem('silo'))
			assert.equal(await page.locator('[data-category-id="storage"]').evaluate(el => el.classList.contains('expanded')), true)
			assert.equal(await page.evaluate(() => window.scrollY), 0)
			await page.evaluate(() => game.store.closeTypes())
			assert.equal(await page.locator('.cattail-shop-category.expanded').count(), 0)
			assert.equal(await page.evaluate(() => game.store.isOpen), false)
		})
		await check('only-one and locked items hidden; realm changes retain native tool visibility', async () => {
			await page.evaluate(() => { game.onlyones.pump = true; game.store.visibilityUpdate() })
			assert.equal(await page.locator('[data-shop-item="pump"]').count(), 0)
			await page.evaluate(() => { game.onlyones.pump = false; game.unlockedEntities.pump = false; game.store.reinit() })
			assert.equal(await page.locator('[data-shop-item="pump"]').count(), 0)
			await page.evaluate(() => { game.unlockedEntities.pump = true; game.plane = true; game.store.visibilityUpdate() })
			assert.equal(await page.locator('[data-shop-item="pump"]').count(), 0)
			assert.equal(await page.locator('.store .eraser').isVisible(), false)
			assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-shop-item]')].every(el => game.codex.entities[el.dataset.shopItem].type === 'dark')), true)
			assert.ok(await page.locator('[data-shop-item]').count())
			await page.evaluate(() => { game.plane = false; game.store.visibilityUpdate() })
		})
		await check('native erase and relocate handlers still enter and exit modes', async () => {
			await page.locator('.store .eraser').click()
			assert.equal(await page.evaluate(() => game.interactionMode), 'erase')
			await page.locator('.store .eraser').click()
			assert.equal(await page.evaluate(() => game.interactionMode), undefined)
			await page.locator('.store .relocator').click()
			assert.equal(await page.evaluate(() => game.interactionMode), 'relocate')
			await page.locator('.store .relocator').click()
			assert.equal(await page.evaluate(() => game.interactionMode), undefined)
		})
		await check('language/reinit preserves view state and avoids duplicate buttons/tooltips', async () => {
			await page.evaluate(() => { game.language = 'sch'; game.store.reinit(); game.store.reinit(); game.resources.fill(10000); game.store.visibilityUpdate() })
			assert.deepEqual(await state(page), { classic: 1, size: 1, compact: 1, alias: false })
			assert.equal(await page.locator('[data-category-id="mines"] .cattail-shop-category-title').textContent(), '矿井')
			await page.locator('[data-category-id="mines"] .cattail-shop-category-head').click()
			assert.equal(await page.locator('[data-shop-item="pump"] .cattail-shop-category-item-name').textContent(), 'sch: pump')
			assert.ok(await page.locator('#modloader-panel-tooltip').count() <= 1)
		})
		await check('shared HUD hide/show retains classic category and scroll state', async () => {
			await page.evaluate(() => { document.querySelector('.cattail-classic-shop').scrollTop = 123; ModLoader.ui.hud.hide() })
			assert.equal(await page.locator('.cattail-classic-shop').evaluate(el => getComputedStyle(el).pointerEvents), 'none')
			await page.evaluate(() => ModLoader.ui.hud.show())
			assert.equal(await page.locator('[data-category-id="mines"]').evaluate(el => el.classList.contains('expanded')), true)
			await page.evaluate(() => { game.pinhole = true; game.store.visibilityUpdate() })
			assert.equal(await page.locator('.cattail-classic-shop').isVisible(), false)
			await page.evaluate(() => { game.pinhole = false; game.store.visibilityUpdate() })
			await page.evaluate(() => { game.credits = true; game.store.visibilityUpdate() })
			assert.equal(await page.locator('.cattail-classic-shop').isVisible(), false)
			await page.evaluate(() => { game.credits = false; game.store.vessel.classList.add('memory_faded'); game.store.visibilityUpdate() })
			assert.equal(await page.locator('.cattail-classic-shop').evaluate(el => getComputedStyle(el).pointerEvents), 'none')
			await page.evaluate(() => { game.store.vessel.classList.remove('memory_faded'); game.store.visibilityUpdate() })
		})
		await check('new or uncatalogued buildings fall back to Other', async () => {
			await page.evaluate(() => { game.codex.entities.testExtra = { canPurchase: true }; game.unlockedEntities.testExtra = true; game.store.reinit() })
			assert.equal(await page.locator('[data-category-id="other"] [data-shop-item="testExtra"]').count(), 1)
		})
		await check('classic reserves a stable scrollbar gutter and window margin before expansion', async () => {
			await page.evaluate(() => { delete game.codex.entities.testExtra; game.store.reinit() })
			const measure = () => {
				const shop = document.querySelector('.cattail-classic-shop')
				const card = shop.querySelector('.cattail-shop-category-head')
				const rect = shop.getBoundingClientRect(), cardRect = card.getBoundingClientRect()
				const toolRect = game.store.html.eraser.getBoundingClientRect()
				return { cardWidth: cardRect.width, cardLeft: cardRect.left, edge: innerWidth - rect.right,
					gutter: shop.offsetWidth - shop.clientWidth, overflowing: shop.scrollHeight > shop.clientHeight,
					toolsClear: toolRect.left >= 0 && toolRect.right <= rect.left, rightSpace: rect.right - cardRect.right }
			}
			for (const [width, height] of [[1440, 900], [1000, 700], [640, 720]]) {
				await page.setViewportSize({ width, height })
				await page.evaluate(() => { game.store.closeTypes(); document.querySelector('.cattail-classic-shop').scrollTop = 0 })
				await page.waitForTimeout(300)
				const collapsed = await page.evaluate(measure)
				assert.equal(collapsed.overflowing, false)
				assert.equal(collapsed.gutter, 14)
				assert.equal(collapsed.edge, 8)
				assert.ok(collapsed.toolsClear && collapsed.rightSpace >= 14)
				await page.screenshot({ path: path.join(output, `gutter-collapsed-${width}.png`) })
				await page.locator('[data-category-id="tools"] .cattail-shop-category-head').click()
				await page.waitForTimeout(300)
				const expanded = await page.evaluate(measure)
				assert.equal(expanded.overflowing, true)
				assert.ok(Math.abs(collapsed.cardWidth - expanded.cardWidth) < .1)
				assert.ok(Math.abs(collapsed.cardLeft - expanded.cardLeft) < .1)
				assert.equal(expanded.gutter, 14)
				assert.equal(expanded.edge, 8)
				assert.ok(expanded.toolsClear)
				await page.screenshot({ path: path.join(output, `gutter-expanded-${width}.png`) })
			}
		})
		await check('long compact groups have no fixed height clipping; viewport and toolbar layout', async () => {
			await page.evaluate(() => { game.store.centerItem('pump'); delete game.codex.entities.testExtra; game.store.reinit() })
			for (const [width, height] of [[1440, 900], [1000, 700], [640, 720]]) {
				await page.setViewportSize({ width, height })
				await page.evaluate(() => { game.store.centerItem('pump'); document.querySelector('.cattail-classic-shop').scrollTop = 0 })
				await page.waitForTimeout(350)
				const bounds = await page.locator('.cattail-classic-shop').boundingBox()
				const toolbar = await page.locator('.store .eraser').boundingBox()
				assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height)
				assert.ok(toolbar.x >= 0 && toolbar.x + toolbar.width <= bounds.x)
				assert.equal(await page.locator('.cattail-shop-category.expanded .cattail-shop-category-body').evaluate(el => getComputedStyle(el).maxHeight), 'none')
				await page.screenshot({ path: path.join(output, `compact-${width}.png`) })
			}
			await page.setViewportSize({ width: 1440, height: 900 })
			await page.locator('.cattail-shop-compact-toggle').click()
			await page.screenshot({ path: path.join(output, 'classic-list.png') })
			await page.locator('.cattail-classic-size-toggle').click()
			await page.screenshot({ path: path.join(output, 'classic-minimized.png') })
		})
		await check('categories disabled retains classic list; no native mode override', async () => {
			const disabled = await setup('?version=1.2.1&categories=false')
			assert.deepEqual(await state(disabled), { classic: 1, size: 1, compact: 0, alias: false })
		})
		await check('saved Loader configuration applies only on reload in both directions', async () => {
			await native.evaluate(id => ModLoader.forMod(id).config.set('shopVersion', '1.2.1'), MOD)
			assert.equal((await state(native)).classic, 0)
			await native.reload(); await native.waitForFunction(() => window.ready)
			assert.equal((await state(native)).classic, 1)
			await native.evaluate(id => ModLoader.forMod(id).config.set('shopVersion', '1.3'), MOD)
			assert.equal((await state(native)).classic, 1)
			await native.reload(); await native.waitForFunction(() => window.ready)
			assert.equal((await state(native)).classic, 0)
			await native.screenshot({ path: path.join(output, 'native-1.3.png') })
		})
		await check('real Loader menu labels and Save/reload switch to classic', async () => {
			await native.evaluate(() => { game.language = 'sch'; ModLoader.togglePanel() })
			await native.locator('.modloader-mod-title').click()
			const field = native.locator('[data-modloader-config-key="shopVersion"]')
			assert.equal(await field.locator('.modloader-select-value').textContent(), '1.3 商店')
			await field.locator('.modloader-select-button').click()
			await native.getByRole('option', { name: '1.2.1 商店', exact: true }).click()
			assert.equal((await state(native)).classic, 0)
			await native.screenshot({ path: path.join(output, 'loader-shop-config.png') })
			await Promise.all([native.waitForEvent('load'), native.locator('.modloader-save-button').click()])
			await native.waitForFunction(() => window.ready)
			assert.equal((await state(native)).classic, 1)
			assert.equal(await native.evaluate(id => ModLoader.forMod(id).config.get('shopVersion'), MOD), '1.2.1')
		})
		await check('no uncaught browser errors', async () => assert.deepEqual(errors, []))
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: results.length, results, output }, null, 2))
		console.log(JSON.stringify({ passed: results.length, output }))
	} finally {
		for (const context of contexts) await context.close()
		await browser.close()
	}
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
