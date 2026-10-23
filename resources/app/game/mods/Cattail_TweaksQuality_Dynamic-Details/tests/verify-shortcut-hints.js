'use strict'

// Actual Loader registry/panel and DD entries in fresh browser contexts. Game,
// entities, world and saves are synthetic; HTTP serves only explicit sources.
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
const MOD = 'Cattail_TweaksQuality_Dynamic-Details'
const ROOT = path.resolve(__dirname, '../../..')
const MOD_ROOT = process.env.DYNAMIC_DETAILS_MOD_ROOT || path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const hintSource = fs.readFileSync(path.join(MOD_ROOT, 'scripts/shortcut-hints.js'), 'utf8')
const output = process.env.DYNAMIC_DETAILS_SHORTCUT_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'dynamic-details-shortcuts-'))
fs.mkdirSync(output, { recursive: true })

function fixture() {
	window.Game = class Game {
		renderCursor() {} renderResources() {} renderDarkResources() {} renderloop() {}
		switchPlane() {} watchCredits() {} addEntity() {} updateAnalytics() {}
		createResourceTransfer() {} createLightning() {} createChasmTransfer() {}
		requestResources() {} askForResources() {}
	}
	window.Cloud = class Cloud { update() {} }
	window.Entity = class Entity { getHint() {} initHint() {} }
	window.boot = async () => {
		window.makeGame = () => Object.assign(new Game(), {
			version: '1.3', language: 'en', isMobile: false, plane: false,
			resources: Array(10).fill(1000), entitiesInGame: {}, onlyones: {}, stuff: [],
			codex: { entities: {}, resources: [] }, hoveredResource: null, hoveredEntity: null,
			hoveredCell: [0, 0], mouse: { sxy: [400, 300], xy: [400, 300], cursorVisible: true },
			canvas: document.querySelector('canvas'), ctx: document.querySelector('canvas').getContext('2d'),
			w: 1280, h: 900, screenUnit: 40, unit: 40, zoom: 1, pixelRatio: 1, translation: [0, 0],
			splash: { isShown: false }, currentHint: {}, store: { vessel: document.querySelector('.store') },
			entityAtCoordinates: () => null, uvToXYUntranslated: point => point, uvToXY: point => point,
			updatePointerState() { this.pointerCalls = (this.pointerCalls || 0) + 1 }, updateGlobalPositioning() {},
			removeHint() {}, makeReadable: value => String(value), pronounce: (_group, key) => key
		})
		window.game = makeGame()
		await ModLoader.stage('afterVanillaScripts', game)
		game.renderCursor()
		await ModLoader.stage('afterGameInit', game)
		window.ddEntries = () => Object.values(ModLoader.state.shortcutEntries).filter(e => e.modId === 'Cattail_TweaksQuality_Dynamic-Details').sort((a, b) => a.order - b.order)
		window.entryState = id => { const e = ddEntries().find(e => e.id === id); return { visible: e.visible(), active: e.active(), description: e.description(), context: e.context(), keys: e.keys } }
		window.context = kind => {
			game.hoveredEntity = kind === 'building' ? { name: 'fixture', master: game } : null
			game.hoveredResource = kind === 'resource' ? 0 : null
			game.hoveredCell = [0, 0]; game.altActive = false; game.shiftPressed = false
			game._cattailDynamicDetailsToggle = false; game._cattailDynamicDirectionPointerToggle = false
			game.renderCursor()
		}
		window.ready = true
	}
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#aaa}canvas{position:absolute;inset:0;pointer-events:none}</style><canvas width="1280" height="900"></canvas><div class="store"></div><input id="outside"><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(error=>window.bootError=error.stack)</script>'
	} else if (url.pathname === '/mods/enabled.json') { type = 'application/json'; body = JSON.stringify({ mods: [MOD] }) }
	else if (url.pathname === '/mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries: manifest.entries.filter(e => e !== 'scripts/build-countdown.js') })
	} else {
		const relative = decodeURIComponent(url.pathname.slice(1)), prefix = 'mods/' + MOD + '/'
		const target = relative.startsWith(prefix) ? path.resolve(MOD_ROOT, relative.slice(prefix.length)) : path.resolve(ROOT, relative)
		const permitted = relative === 'modloader/loader.js' || [...manifest.entries, 'locale/dynamic-details.json'].some(e => relative === prefix + e)
		if (permitted && [ROOT, MOD_ROOT].some(root => target.startsWith(root + path.sep)) && fs.existsSync(target)) { body = fs.readFileSync(target); if (target.endsWith('.json')) type = 'application/json' }
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath })
	const contexts = [], errors = [], results = []
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	const setup = async () => {
		const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(ctx)
		const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.stack))
		await ctx.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
		await page.goto(origin)
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		return page
	}
	const state = (page, id) => page.evaluate(id => entryState(id), id)
	try {
		const page = await setup()
		await check('18 complete registrations, stable order, one category and real Loader panel', async () => {
			assert.equal(await page.evaluate(() => ddEntries().length), 18)
			assert.equal(await page.evaluate(() => new Set(ddEntries().map(e => e.category.id)).size), 1)
			assert.deepEqual(await page.evaluate(() => ddEntries().map(e => e.order)), Array.from({ length: 18 }, (_, i) => i + 1))
			await page.locator('#modloader-shortcut-button').click()
			await page.waitForFunction(() => document.querySelectorAll('.modloader-shortcut-row').length === 18)
			assert.ok(await page.locator('.modloader-shortcut-context').count() > 0)
			assert.ok(await page.locator('.modloader-shortcut-row-inactive').count() > 0)
		})
		await check('all 20 locale packs have 18 descriptions and specific context text', async () => {
			const seen = new Set()
			for (const language of Object.keys(manifest.translations)) {
				const texts = await page.evaluate(language => { game.language = language; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh(); return ddEntries().map(e => [e.description(), e.context()]) }, language)
				assert.equal(texts.length, 18); assert.ok(texts.every(row => row.every(s => typeof s === 'string' && s.length > 5 && !s.includes('undefined'))))
				seen.add(texts[0][0])
			}
			assert.equal(seen.size, 19) // sch/modsch intentionally share their wording.
			await page.evaluate(() => { game.language = 'modsch'; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh() })
			await page.waitForFunction(() => document.querySelector('.modloader-shortcut-description')?.textContent.includes('按住显示建筑详情'))
			await page.screenshot({ path: path.join(output, 'shortcuts-modsch.png') })
			await page.evaluate(() => { game.language = 'unknown'; return entryState('source-profiler') })
			assert.match((await state(page, 'source-profiler')).description, /diagnostics/)
			await page.evaluate(() => { game.language = 'en' })
		})
		await check('feature off hides its entries; context inactive retains conditions', async () => {
			for (const [key, hidden] of [['enableBuildingDetails', ['building-hold', 'building-pin', 'opacity-scope']], ['enableResourceSourceDetails', ['resource-hold', 'line-preview', 'line-lock', 'source-profiler', 'resource-chart']], ['enableCoordinateOverlay', ['coordinates-hold', 'teleport-open', 'teleport-confirm', 'teleport-close']], ['enableDirectionPointers', ['directions-hold', 'directions-pin']], ['enableResourceSourceLineChart', ['resource-chart']]]) {
				await page.evaluate(key => ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').config.set(key, false), key)
				for (const id of hidden) assert.equal((await state(page, id)).visible, false)
				await page.evaluate(key => ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').config.set(key, true), key)
			}
			await page.evaluate(() => context('empty'))
			assert.equal((await state(page, 'building-hold')).visible, true); assert.equal((await state(page, 'building-hold')).active, false)
		})
		await check('building/resource/empty priority matches existing controls', async () => {
			await page.evaluate(() => context('building')); assert.equal((await state(page, 'building-pin')).active, true)
			assert.equal((await state(page, 'directions-pin')).active, false)
			await page.evaluate(() => { context('resource'); game.hoveredEntity = { name: 'fixture', master: game } })
			assert.equal((await state(page, 'resource-pin')).active, true); assert.equal((await state(page, 'building-pin')).active, false)
			await page.evaluate(() => context('empty')); assert.equal((await state(page, 'directions-pin')).active, true)
		})
		await check('context changes refresh the open panel without refreshing every unchanged frame', async () => {
			await page.evaluate(() => { context('building'); window.notifications = 0; window.stopNotifications = CattailDynamicDetails.subscribeShortcutState(() => notifications++); context('resource'); for (let i = 0; i < 10; i++) game.renderCursor() })
			await page.waitForFunction(() => !document.querySelectorAll('.modloader-shortcut-row')[4].classList.contains('modloader-shortcut-row-inactive'))
			assert.equal(await page.evaluate(() => notifications), 1)
			assert.equal(await page.locator('.modloader-shortcut-row').first().evaluate(el => el.classList.contains('modloader-shortcut-row-inactive')), true)
			await page.evaluate(() => stopNotifications())
		})
		await check('Shift preview metadata follows locked/pinned/hover conditions and 4B wording', async () => {
			await page.evaluate(() => { context('resource'); game._cattailDynamicResourceSourceLineLock = false; game._cattailDynamicResourceSourceToggle = false })
			assert.equal((await state(page, 'line-preview')).active, false)
			await page.evaluate(() => { game._cattailDynamicResourceSourceLineLock = true }); assert.equal((await state(page, 'line-preview')).active, true)
			assert.match((await state(page, 'line-preview')).description, /release to restore/)
			await page.evaluate(() => { game._cattailDynamicResourceSourceLineLock = false; game._cattailDynamicResourceSourceToggle = true })
			assert.equal((await state(page, 'line-preview')).active, true)
			assert.deepEqual((await state(page, 'line-lock')).keys, [['Mouse5']])
		})
		await check('resource chart unlock and mouse/wheel chord glyphs are accurate', async () => {
			assert.equal((await state(page, 'resource-chart')).active, false)
			await page.evaluate(() => { game.entitiesInGame.mega1b = 1 }); assert.equal((await state(page, 'resource-chart')).active, true)
			assert.deepEqual((await state(page, 'opacity-wheel')).keys, [['Z', 'WheelUp'], ['Z', 'WheelDown']])
			assert.deepEqual((await state(page, 'resource-chart')).keys, [['WheelUp'], ['WheelDown']])
			assert.ok(await page.locator('.modloader-shortcut-mouse').count() > 0)
		})
		await check('actual Ctrl+Alt and middle listeners still toggle only once', async () => {
			const result = await page.evaluate(() => {
				context('building'); game._cattailDynamicDetailsToggle = false
				window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', altKey: true, ctrlKey: true, cancelable: true }))
				const building = game._cattailDynamicDetailsToggle
				context('resource'); game._cattailDynamicResourceSourceLineLock = false
				window.dispatchEvent(new MouseEvent('mousedown', { button: 1, cancelable: true }))
				return { building, locked: game._cattailDynamicResourceSourceLineLock, resource: game._cattailDynamicResourceSourceLineResource }
			})
			assert.deepEqual(result, { building: true, locked: true, resource: 0 })
		})
		await check('coordinate input has active Enter/Escape and keeps original teleport behavior', async () => {
			await page.evaluate(() => { context('empty'); game.pointerCalls = 0; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', code: 'KeyC', altKey: true, shiftKey: true, cancelable: true })) })
			await page.waitForFunction(() => document.activeElement?.closest('.cattail-coordinate-teleport'))
			assert.equal((await state(page, 'teleport-confirm')).active, true); assert.equal((await state(page, 'teleport-close')).active, true)
			await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
			assert.equal(await page.evaluate(() => game.pointerCalls), 1)
			assert.equal((await state(page, 'teleport-confirm')).active, false)
		})
		await check('editing/HUD/splash/mobile metadata becomes inactive', async () => {
			await page.locator('#outside').focus(); assert.equal((await state(page, 'coordinates-pin')).active, false)
			await page.locator('#outside').evaluate(el => el.blur())
			for (const key of ['credits', 'pinhole', 'isMobile']) { await page.evaluate(key => { game[key] = true }, key); assert.equal((await state(page, 'source-profiler')).active, false); await page.evaluate(key => { game[key] = false }, key) }
			await page.evaluate(() => { game.splash.isShown = true }); assert.equal((await state(page, 'source-profiler')).active, false)
			await page.evaluate(() => { game.splash.isShown = false; ModLoader.ui.hud.hide() }); assert.equal((await state(page, 'source-profiler')).active, false)
			await page.evaluate(() => ModLoader.ui.hud.show())
		})
		await check('core snapshots are frozen and observation does not write persistence', async () => {
			const result = await page.evaluate(() => {
				const before = JSON.stringify(localStorage), first = CattailDynamicDetails.getShortcutState(game)
				for (let i = 0; i < 25; i++) CattailDynamicDetails.getShortcutState(game)
				return { frozen: Object.isFrozen(first), sameStorage: before === JSON.stringify(localStorage) }
			})
			assert.deepEqual(result, { frozen: true, sameStorage: true })
		})
		await check('repeated lifecycle/script replacement keeps 18 entries and cleans old handles', async () => {
			await page.evaluate(async () => { await ModLoader.stage('afterGameInit', game); await ModLoader.stage('afterGameInit', game); window.oldGame = game; game = makeGame(); await ModLoader.stage('afterGameInit', game) })
			assert.equal(await page.evaluate(() => ddEntries().length), 18)
			await page.addScriptTag({ content: hintSource })
			await page.evaluate(() => ModLoader.stage('afterGameInit', game))
			assert.equal(await page.evaluate(() => ddEntries().length), 18)
			const retained = await page.evaluate(() => { window.otherHandle = ModLoader.forMod('fixture-other').ui.shortcuts.register({ id: 'other', keys: 'F4', description: 'Other mod' }); window[Symbol.for('cattail.dynamic-details.shortcut-hints')].dispose(); return { dd: ddEntries().length, other: Object.values(ModLoader.state.shortcutEntries).filter(e => e.modId === 'fixture-other').length } })
			assert.deepEqual(retained, { dd: 0, other: 1 })
			await page.evaluate(() => { otherHandle.unregister(); return ModLoader.stage('afterGameInit', game) })
		})
		await check('old Loader without Shortcut API skips the consumer safely', async () => {
			const fallback = await setup()
			await fallback.evaluate(() => { window[Symbol.for('cattail.dynamic-details.shortcut-hints')].dispose(); window.fallbackHooks = []; window.savedLoader = ModLoader; window.ModLoader = { register(definition) { definition.init({ on: (_name, fn) => fallbackHooks.push(fn), ui: {} }) } } })
			await fallback.addScriptTag({ content: hintSource })
			await fallback.evaluate(() => { for (const fn of fallbackHooks) fn(undefined, game); window.ModLoader = savedLoader })
			assert.equal(await fallback.evaluate(() => ddEntries().length), 0)
		})
		await check('narrow panel remains scrollable and all entries persist', async () => {
			await page.setViewportSize({ width: 640, height: 700 })
			await page.evaluate(() => { game.language = 'ru'; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh() })
			if (!await page.evaluate(() => ModLoader.state.shortcutOpen)) await page.locator('#modloader-shortcut-button').click()
			await page.waitForFunction(() => {
				const panel = document.querySelector('#modloader-shortcut-panel')
				return getComputedStyle(panel).display !== 'none' && panel.querySelectorAll('.modloader-shortcut-row').length === 18 && panel.textContent.includes('Информация и диагностика')
			})
			assert.equal(await page.locator('#modloader-shortcut-panel').evaluate(el => getComputedStyle(el).overflowY), 'auto')
			const geometry = await page.locator('#modloader-shortcut-panel').evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, height: el.clientHeight, scroll: el.scrollHeight }))
			assert.ok(geometry.left >= 0 && geometry.right <= 640 && geometry.scroll > geometry.height)
			await page.screenshot({ path: path.join(output, 'shortcuts-ru-narrow.png') })
		})
		await check('Loader global/per-Mod visibility preferences still control the consumer', async () => {
			await page.evaluate(() => { ModLoader.state.shortcutSettings.mods['Cattail_TweaksQuality_Dynamic-Details'] = false; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh() })
			await page.waitForFunction(() => getComputedStyle(document.querySelector('#modloader-shortcut-button')).display === 'none')
			assert.equal(await page.evaluate(() => ddEntries().length), 18)
			await page.evaluate(() => { ModLoader.state.shortcutSettings.mods['Cattail_TweaksQuality_Dynamic-Details'] = true; ModLoader.state.shortcutSettings.enabled = false; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh() })
			await page.waitForFunction(() => getComputedStyle(document.querySelector('#modloader-shortcut-button')).display === 'none')
			await page.evaluate(() => { ModLoader.state.shortcutSettings.enabled = true; ModLoader.forMod('Cattail_TweaksQuality_Dynamic-Details').ui.shortcuts.refresh() })
			await page.waitForFunction(() => getComputedStyle(document.querySelector('#modloader-shortcut-button')).display !== 'none')
		})
		await check('no uncaught browser errors or invalid consumer diagnostics', async () => {
			assert.deepEqual(errors, [])
			const issues = await page.evaluate(() => ModLoader.state.shortcutDiagnostics.filter(d => /invalid|text-error|visible-error|active-error|category-conflict/.test(d.code)))
			assert.deepEqual(issues, [])
		})
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: results.length, results, browser: browser.version(), output }, null, 2))
		console.log(JSON.stringify({ passed: results.length, output }))
	} finally { for (const ctx of contexts) await ctx.close(); await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => server.close())
