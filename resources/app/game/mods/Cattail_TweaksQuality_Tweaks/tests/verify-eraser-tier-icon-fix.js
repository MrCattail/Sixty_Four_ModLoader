'use strict'

// Actual Game language/load/price methods, native Store/CSS/SVG and Mega2/3
// lifecycle methods plus Loader and Better UIs; synthetic world and outer UI.
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
const MOD = 'Cattail_TweaksQuality_Tweaks'
const BETTER = 'Cattail_TweaksQuality_Better-UIs'
const KEY = 'enableEraserIconFix', FIX = 'scripts/eraser-icon-fix.js'
const manifest = JSON.parse(fs.readFileSync(path.join(MODROOT, 'mod.json'), 'utf8'))
const betterManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', BETTER, 'mod.json'), 'utf8'))
const output = fs.mkdtempSync(path.join(process.env.ERASER_ICON_TEST_OUTPUT_ROOT || os.tmpdir(), 'tweaks-eraser-icon-'))
const stuff = fs.readFileSync(path.join(ROOT, 'scripts/stuff.js'), 'utf8')
const towers = 'class Entity {}\n' + stuff.slice(stuff.indexOf('class Mega2 extends Entity'), stuff.indexOf('class Eye extends Entity'))
const ui = fs.readFileSync(path.join(ROOT, 'scripts/ui.js'), 'utf8')
const languageHandler = ui.match(/language\.onclick = _=>\{[\s\S]*?this\.master\.changeLanguage\([\s\S]*?\n\s*\}/)[0]
const handlerSource = 'window.bindLanguage = function(language){' + languageHandler + '};'

function fixture() {
	const query = new URLSearchParams(location.search)
	const ownKey = key => 'modloader:Cattail_TweaksQuality_Tweaks:config:' + key
	localStorage.setItem('modloader:Cattail_TweaksQuality_Better-UIs:config:shopVersion', JSON.stringify(query.get('shop') || '1.3'))
	if (query.has('off')) localStorage.setItem(ownKey('enableEraserIconFix'), 'false')
	window.writes = 0
	window.abstract_getWords = () => ({
		en: { marker: 'English' }, sch: { marker: 'Chinese' }, tch: { marker: 'Traditional' }
	})
	window.nativeRebuilds = 0
	window.returnToken = {}
	const nativeReinit = DesktopStoreVersion.prototype.reinit
	DesktopStoreVersion.prototype.reinit = function (...args) {
		nativeRebuilds++
		const result = nativeReinit.apply(this, args)
		this.html.eraser.classList.add('fixture-marker')
		return args[0] === 'return-token' ? returnToken : result
	}
	window.game = Object.assign(Object.create(Game.prototype), {
		version: query.has('old') ? '1.2.1' : '1.3', isMobile: query.has('mobile'), language: 'en', languageId: 0,
		languages: ['en', 'sch', 'tch'], plane: 0, eraserType: 0, resources: [10000, 20000], onlyones: {},
		unlockedEntities: { pump: true, mega2: true, mega3: true },
		entitiesInGame: { pump: 3, mega2: 1, mega3: 1 }, prices: {}, stuff: [], soundSources: new Set(),
		stats: { totalPlayTime: 10, totalPlayAndIdleTime: 10, darkVisited: 0 }, currentHint: {},
		memoryComplexIsVisible: false, memoryComplexUI: document.createElement('div'),
		codex: { entityTypes: { default: {}, tools: {} }, entities: {
			pump: { type: 'default', canPurchase: true, price: [100], priceExponent: 2 },
			mega2: { type: 'tools', canPurchase: true, price: [10] },
			mega3: { type: 'tools', canPurchase: true, price: [20] }
		} },
		splash: { selected: false, init() { document.querySelector('#language').textContent = 'Language: ' + game.language } },
		messenger: { firedEvents: {}, shownMessages: [], messagesShown: 0, setState() {} },
		makeReadable: v => String(v), pronounce: (a, id, part) => part === 'description' ? 'Fixture description' : String(id),
		savePreferences() { writes++ }, cleanup() {}, cleanupErase() {}, cleanupRelocation() {},
		pickupItem(name) { this.interactionMode = 'build'; this.itemInHand = { name } },
		pickupEraser() { this.interactionMode = 'erase' }
	})
	game.splash.master = game
	bindLanguage.call(game.splash, document.querySelector('#language'))
	window.setFix = function (value) {
		ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.set('enableEraserIconFix', value)
		dispatchEvent(new CustomEvent('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key: 'enableEraserIconFix', value } }))
	}
	window.sample = function () {
		const e = game.store.html.eraser
		return {
			tier: game.eraserType, ii: e.classList.contains('ii'), iii: e.classList.contains('iii'),
			position: getComputedStyle(e).backgroundPositionX, classes: e.className,
			refund: game.getRealPrice('pump', true).slice(), resources: game.resources.slice(),
			classic: document.querySelectorAll('.cattail-classic-shop').length, builds: nativeRebuilds,
			mode: game.interactionMode || null
		}
	}
	window.boot = async function () {
		await ModLoader.boot()
		await ModLoader.stage('afterVanillaScripts', game)
		// Mobile guard uses a desktop fixture store, without claiming mobile UI support.
		game.store = new DesktopStoreVersion(document.querySelector('.store'), game)
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		await ModLoader.stage('afterGameInit', game)
		window.ready = true
	}
}
const allow = new Set(['scripts/game.js', 'scripts/ui.js', 'cascade.css', 'modloader/loader.js', 'modloader/translations.json', 'mods/' + BETTER + '/scripts/classic-shop.js', 'mods/' + BETTER + '/scripts/shop-categories.js'])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost'), file = decodeURIComponent(url.pathname.slice(1))
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>body{background:#d8d5df}#language{position:absolute;left:20px;top:20px}</style><button id="language">Language</button><div class="store"></div><script src="/scripts/game.js"></script><script src="/scripts/ui.js"></script><script src="/towers.js"></script><script src="/language.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(e=>window.bootError=e.stack)</script>'
	} else if (file === 'mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: url.searchParams.has('unused') ? [] : (new URL(req.headers.referer || 'http://localhost').searchParams.has('better-first') ? [BETTER, MOD] : [MOD, BETTER]) })
	} else if (file === 'mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries: [FIX] })
	} else if (file === 'mods/' + BETTER + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...betterManifest, entries: ['scripts/classic-shop.js', 'scripts/shop-categories.js'] })
	} else if (file === 'mods/' + MOD + '/' + FIX) body = fs.readFileSync(path.join(MODROOT, FIX), 'utf8')
	else if (file === 'towers.js') body = towers
	else if (file === 'language.js') body = handlerSource
	else if (allow.has(file) || /^(img|font)\/[\w./-]+$/.test(file)) {
		const target = path.resolve(ROOT, file)
		if (target.startsWith(path.resolve(ROOT) + path.sep) && fs.existsSync(target) && fs.statSync(target).isFile()) {
			body = fs.readFileSync(target)
			type = ({ '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(target)] || type
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})
async function main() {
	assert.equal(manifest.config[KEY].default, true)
	assert.equal(manifest.config[KEY].reloadPolicy, 'hot')
	assert.equal(manifest.entries.filter(e => e === FIX).length, 1)
	for (const lang of ['en', 'sch', 'modsch', 'tch']) assert(manifest.config[KEY].label[lang] && manifest.config[KEY].description[lang])
	assert.equal(manifest.version, '0.1.0')
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)
	const executablePath = process.env.ERASER_ICON_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath })
	const contexts = [], errors = [], results = []
	const setup = async (query = '') => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(context)
		await context.route('**/*', route => route.request().url().startsWith(address + '/') ? route.continue() : route.abort())
		const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
		await page.goto(address + query); await ready(page)
		return page
	}
	const ready = async page => { await page.waitForFunction(() => window.ready || window.bootError); assert.equal(await page.evaluate(() => window.bootError), undefined) }
	const check = async (name, f) => { await f(); results.push(name); console.log('PASS ' + name) }
	const state = page => page.evaluate(() => sample())
	const tier = (s, t) => { assert.equal(s.tier, t); assert.equal(s.ii, t === 1); assert.equal(s.iii, t === 2); assert.equal(parseFloat(s.position), t * 50) }
	let passed = false
	try {
		for (const query of ['', '?shop=1.2.1', '?shop=1.2.1&better-first']) {
			const page = await setup(query)
			await check('three tiers survive native language clicks and repeated rebuilds ' + (query || 'native'), async () => {
				for (const t of [0, 1, 2]) {
					await page.evaluate(t => game.updateEraserType(t), t)
					const before = await state(page)
					for (let i = 0; i < 3; i++) {
						await page.locator('#language').click()
						const after = await state(page); tier(after, t)
						assert.deepEqual(after.resources, before.resources); assert.deepEqual(after.refund, before.refund)
						assert.equal(after.classic, query.includes('1.2.1') ? 1 : 0)
					}
				}
			})
			await check('hover and selected erase mode keep tier classes and native callbacks ' + (query || 'native'), async () => {
				await page.evaluate(() => { game.updateEraserType(2); game.store.visibilityUpdate() })
				await page.locator('.store .eraser').hover()
				tier(await state(page), 2)
				await page.locator('.store .eraser').dispatchEvent('mousedown')
				await page.locator('#language').click()
				const s = await state(page); tier(s, 2); assert.equal(s.mode, 'erase'); assert(!s.classes.split(' ').includes('closed'))
				await page.locator('.store .eraser').screenshot({ path: path.join(output, (query ? query.includes('better-first') ? 'classic-better-first' : 'classic' : 'native') + '-tier2.png') })
			})
		}
		const page = await setup()
		await check('disabled baseline reproduces wrong frame while tier/resources/refund stay intact', async () => {
			await page.evaluate(() => { setFix(false); game.updateEraserType(2) })
			const before = await state(page); await page.locator('#language').click()
			const after = await state(page)
			assert.equal(after.tier, 2); assert(!after.ii && !after.iii); assert.equal(parseFloat(after.position), 0)
			assert.deepEqual(after.refund, before.refund); assert.deepEqual(after.resources, before.resources)
			await page.evaluate(() => game.store.visibilityUpdate()); assert.equal(parseFloat((await state(page)).position), 0)
		})
		await check('hot enable repairs current DOM, disable retains it until native rebuild', async () => {
			await page.evaluate(() => setFix(true)); tier(await state(page), 2)
			const before = await state(page)
			await page.evaluate(() => setFix(false)); tier(await state(page), 2)
			await page.locator('#language').click(); const after = await state(page)
			assert.equal(after.tier, 2); assert.equal(parseFloat(after.position), 0); assert.deepEqual(after.resources, before.resources); assert.deepEqual(after.refund, before.refund)
			await page.evaluate(() => setFix(true)); tier(await state(page), 2)
		})
		await check('real tower init/deletion and actual loadSave preserve native ownership of tiers', async () => {
			for (const name of ['Mega2', 'Mega3']) {
				assert.equal(await page.evaluate(name => {
					const C = name === 'Mega2' ? Mega2 : Mega3, tower = Object.assign(Object.create(C.prototype), { master: game })
					tower.init(); game.store.reinit()
					const good = game.eraserType === (name === 'Mega2' ? 1 : 2)
					tower.onDelete(); return good && game.eraserType === 0
				}, name), true)
				tier(await state(page), 0)
			}
			for (const t of [0, 1, 2]) {
				const result = await page.evaluate(t => game.loadSave({ eraserType: t, resources: [10000, 20000], stuff: [], onlyones: {} }), t)
				assert.equal(result, true); tier(await state(page), t)
				await page.locator('#language').click(); tier(await state(page), t)
			}
		})
		await check('native reinit runs once, preserves return value and unrelated classes', async () => {
			const s = await page.evaluate(() => { nativeRebuilds = 0; const returned = game.store.reinit('return-token') === returnToken; return { returned, builds: nativeRebuilds, marker: game.store.html.eraser.classList.contains('fixture-marker') } })
			assert.deepEqual(s, { returned: true, builds: 1, marker: true }); tier(await state(page), 2)
		})
		await check('failed optional sync restores partial tier classes without failing a successful rebuild', async () => {
			const result = await page.evaluate(() => {
				const store = game.store, method = store.setEraserType
				store.setEraserType = function () { this.html.eraser.classList.add('ii'); throw new Error('expected optional sync') }
				const returned = store.reinit('return-token') === returnToken
				const clean = !store.html.eraser.classList.contains('ii') && !store.html.eraser.classList.contains('iii') && store.html.eraser.classList.contains('fixture-marker')
				store.setEraserType = method; setFix(true)
				return returned && clean
			})
			assert.equal(result, true); tier(await state(page), 2)
		})
		await check('original rebuild exception identity is preserved without retry', async () => {
			const result = await page.evaluate(() => {
				const store = game.store, init = store.init, sentinel = new Error('expected native rebuild')
				let count = 0, same = false
				store.init = () => { count++; throw sentinel }
				try { store.reinit() } catch (error) { same = error === sentinel }
				store.init = init; store.reinit(); return { same, count }
			})
			assert.deepEqual(result, { same: true, count: 1 })
		})
		await check('invalid tier and missing button are safe and do not normalize game state', async () => {
			const result = await page.evaluate(() => {
				game.eraserType = 99; game.store.reinit(); const unchanged = game.eraserType === 99 && !game.store.html.eraser.classList.contains('iii')
				const element = game.store.html.eraser; delete game.store.html.eraser; setFix(true); game.store.html.eraser = element
				game.updateEraserType(2); return unchanged
			})
			assert.equal(result, true)
		})
		await check('repeated lifecycle keeps exactly one reinit wrapper', async () => {
			assert.equal(await page.evaluate(async () => { const method = DesktopStoreVersion.prototype.reinit; await ModLoader.stage('afterVanillaScripts', game); return method === DesktopStoreVersion.prototype.reinit }), true)
		})
		const menu = await setup()
		await check('actual Loader menu preview/cancel restores correction of current broken icon', async () => {
			await menu.evaluate(() => { game.updateEraserType(2); ModLoader.togglePanel() })
			await menu.locator('.modloader-mod-title').filter({ hasText: /^Tweaks|^优化和修复|^優化和修復/ }).click()
			const field = menu.locator('[data-modloader-config-key="' + KEY + '"]')
			await field.scrollIntoViewIfNeeded(); assert.equal(await field.isChecked(), true); await field.uncheck()
			await menu.evaluate(() => game.store.reinit())
			assert.equal(parseFloat((await state(menu)).position), 0)
			await menu.screenshot({ path: path.join(output, 'settings.png') })
			await menu.locator('.modloader-cancel-button').click(); tier(await state(menu), 2)
		})
		const save = await setup()
		await check('actual menu save/reload persists disabled behavior; hot reenable is visual only', async () => {
			await save.evaluate(() => ModLoader.togglePanel())
			await save.locator('.modloader-mod-title').filter({ hasText: /^Tweaks|^优化和修复|^優化和修復/ }).click()
			const field = save.locator('[data-modloader-config-key="' + KEY + '"]')
			await field.scrollIntoViewIfNeeded(); await field.uncheck(); await save.locator('.modloader-save-button').click()
			await save.reload(); await ready(save)
			await save.evaluate(() => { game.updateEraserType(2); game.changeLanguage(1) })
			assert.equal(parseFloat((await state(save)).position), 0)
			const before = await state(save); await save.evaluate(() => setFix(true)); const after = await state(save)
			tier(after, 2); assert.deepEqual(after.resources, before.resources); assert.deepEqual(after.refund, before.refund)
		})
		for (const query of ['?old', '?mobile', '?off']) {
			const guard = await setup(query)
			await check('unsupported or cold-disabled target stays native ' + query, async () => {
				await guard.evaluate(() => { game.updateEraserType(2); game.store.reinit() })
				const s = await state(guard); assert.equal(s.tier, 2); assert.equal(parseFloat(s.position), 0)
				if (query !== '?off') assert.equal(await guard.evaluate(() => window.__cattailTweaksEraserIconFixInstalled), undefined)
			})
		}
		const disabled = await setup('?off')
		await check('disabling Tweaks on reload removes its entry and visual correction', async () => {
			await disabled.route('**/mods/enabled.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ mods: [BETTER] }) }))
			await disabled.reload(); await ready(disabled)
			assert.equal(await disabled.evaluate(() => window.__cattailTweaksEraserIconFixInstalled), undefined)
			await disabled.evaluate(() => { game.updateEraserType(2); game.store.reinit() })
			assert.equal(parseFloat((await state(disabled)).position), 0)
		})
		assert.deepEqual(errors, []); passed = true
		console.log('ERASER_TIER_ICON_OK=' + results.length)
	} finally {
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed, results, errors, browser: browser.version(), boundary: 'actual native UI/Game changeLanguage/loadSave/prices/Mega2/3 lifecycle, CSS/delete.svg, Loader/menu and Better UIs classic/categories; synthetic world/words/splash/messenger/preference IO/cleanup; desktop store for unsupported guard only, no player profile, actual game, save file or Steam access' }, null, 2))
		console.log('Report: ' + output)
		for (const context of contexts) await context.close()
		await browser.close()
	}
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
