'use strict'

// Real installed Game.init/changeLanguage + real Loader and settings UI.
// World/Steam/word dictionaries are fixtures. Only allowlisted source files
// are served, with fresh browser storage; no player profile or enabled list.
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
const MOD = 'Cattail_TweaksQuality_Tweaks'
const ENTRY = 'scripts/remember-language.js'
const KEY = 'enableRememberLanguage'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', MOD, 'mod.json'), 'utf8'))
const gameSource = fs.readFileSync(path.join(ROOT, 'scripts/game.js'), 'utf8')
const nativeLanguages = JSON.parse(gameSource.match(/this\.languages = (\[[^\n]+\])/)[1].replace(/`/g, '"'))
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'tweaks-remember-language-'))

function fixture(nativeLanguages) {
	window.OpenSimplex2S = class {}
	window.abstract_getCodex = () => ({ entities: {} })
	window.abstract_getWords = () => Object.fromEntries(nativeLanguages.map(id => [id, { marker: id }]))
	const stop = Symbol('stop-before-world-init')
	const storageKey = 'abstractv03_preferenceslanguage-test'
	const legacyKey = 'abstractv03_languagelanguage-test'
	window.preferenceKey = storageKey
	window.createGame = async function (options = {}) {
		if (Object.hasOwn(options, 'local')) {
			localStorage.setItem(storageKey, JSON.stringify({ languageId: options.local, zoom: 1, sentinel: 'preserve' }))
			localStorage.removeItem(legacyKey)
		} else if (Object.hasOwn(options, 'legacy')) {
			localStorage.removeItem(storageKey)
			localStorage.setItem(legacyKey, String(options.legacy))
		}
		const game = Object.create(Game.prototype)
		Object.assign(game, {
			version: '1.3', isMobile: false, languages: nativeLanguages.slice(), zoomRange: [0.1, 10],
			loadScripts: async () => {}, loadStyle: async () => {}, preloadImages: () => ({}), initResources() { throw stop },
			async prepareSavedGameData() {
				this.steamId = 'language-test'
				this.preferences = this.getPreferences()
				this.currentSlotId = 0
				this.saveSlots = { 0: { stack: [{ permanents: {} }] } }
			}
		})
		try { await game.init({ languageId: Object.hasOwn(options, 'steam') ? options.steam : 0 }) }
		catch (error) { if (error !== stop) throw error }
		// Only the UI consumers of changeLanguage are stubbed, not its language
		// validation, words resolution, assemblePreferences or persistence.
		Object.assign(game, {
			splash: { gameIsMute: false, init() {} }, explainer: { next: 0 },
			store: { reinit() {} }, switchPlane() {}, messenger: { setState() {} },
			stuff: [], globalSoundVolume: 0.36, plane: 0
		})
		window.game = game
		return { id: game.languageId, language: game.language, words: game.words.marker }
	}
	window.boot = async () => {
		await ModLoader.boot()
		const options = new URLSearchParams(location.search)
		if (options.has('modlang')) {
			ModLoader.registerLanguage('modsch')
			if (options.get('modlang') !== 'missing-words') {
				// Added after Tweaks hooks, matching a locale Mod's late word merge.
				await ModLoader.loadEntries()
				ModLoader.on('afterWords', words => { words.modsch = { marker: 'modsch' } }, 'fixture-locale')
			}
		}
		await createGame()
		window.ready = true
	}
}

const allowed = new Set(['scripts/game.js', 'modloader/loader.js', 'modloader/translations.json', `mods/${MOD}/${ENTRY}`])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	const relative = decodeURIComponent(url.pathname.slice(1))
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><script src="/scripts/game.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')(' + JSON.stringify(nativeLanguages) + ');boot().catch(error=>{window.bootError=error.stack})</script>'
	} else if (relative === 'mods/enabled.json') {
		type = 'application/json'
		body = JSON.stringify({ mods: [MOD] })
	} else if (relative === `mods/${MOD}/mod.json`) {
		type = 'application/json'
		body = JSON.stringify({ ...manifest, entries: [ENTRY] })
	} else if (allowed.has(relative)) {
		body = fs.readFileSync(path.join(ROOT, relative))
		if (relative.endsWith('.json')) type = 'application/json'
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	assert.ok(manifest.entries.includes(ENTRY))
	assert.equal(manifest.config[KEY].default, true)
	assert.equal(manifest.config[KEY].reloadPolicy, 'reload')
	assert.equal(nativeLanguages.length, 19)
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.TWEAKS_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback) })
	const results = [], errors = []
	const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS ' + name) }
	const setup = async (query = '', noMod = false) => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
		if (noMod) await context.route('**/mods/enabled.json*', route => route.fulfill({ contentType: 'application/json', body: '{"mods":[]}' }))
		const page = await context.newPage()
		page.on('pageerror', error => errors.push(error.message))
		await page.goto(address + query)
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		return page
	}
	const expect = async (page, options, language) => {
		const result = await page.evaluate(options => createGame(options), options)
		assert.equal(result.language, language)
		assert.equal(result.words, language)
	}
	try {
		const page = await setup()
		await check('all 19 native choices survive a saved change and new Game.init', async () => {
			for (let id = 0; id < nativeLanguages.length; id++) {
				await page.evaluate(id => game.changeLanguage(id), id)
				assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(preferenceKey)).languageId), id)
				const raw = await page.evaluate(() => localStorage.getItem(preferenceKey))
				await expect(page, { steam: id === 0 ? 2 : 0 }, nativeLanguages[id])
				assert.equal(await page.evaluate(() => localStorage.getItem(preferenceKey)), raw, 'startup does not rewrite preferences')
			}
		})
		await check('legacy 1.2.1 preference keys, including English zero', async () => {
			await expect(page, { legacy: 12, steam: 0 }, 'sch')
			await expect(page, { legacy: 0, steam: 2 }, 'en')
		})
		await check('missing and invalid preferences retain native Steam fallback', async () => {
			for (const local of [null, -1, 99, 1.5, '12', false, {}, []]) await expect(page, { local, steam: 2 }, 'de')
			await page.evaluate(() => localStorage.clear())
			await expect(page, { steam: 2 }, 'de')
			await expect(page, { local: null, steam: null }, 'en')
			await expect(page, { local: 12, steam: null }, 'sch')
		})
		await check('later language changes and repeated data hooks are not overridden', async () => {
			await expect(page, { local: 12, steam: 0 }, 'sch')
			const result = await page.evaluate(() => {
				game.changeLanguage(2)
				const data = { sentinel: 64 }
				return { language: game.language, sameData: ModLoader.applyData(data, game) === data, after: game.language }
			})
			assert.deepEqual(result, { language: 'de', sameData: true, after: 'de' })
		})
		await check('config off restores native behavior, with no live language switch', async () => {
			await page.evaluate(([mod, key]) => ModLoader.forMod(mod).config.set(key, false), [MOD, KEY])
			assert.equal(await page.evaluate(() => game.language), 'de')
			await expect(page, { local: 12, steam: 0 }, 'en')
			await page.evaluate(([mod, key]) => ModLoader.forMod(mod).config.set(key, true), [MOD, KEY])
			await expect(page, { local: 12, steam: 0 }, 'sch')
		})
		const locale = await setup('?modlang=available')
		await check('registered modsch survives restart and late word merging', async () => {
			await locale.evaluate(() => game.changeLanguage(19))
			await expect(locale, { steam: 0 }, 'modsch')
		})
		await check('disabled locale and absent words fall back safely', async () => {
			// Tweaks itself lists modsch in manifest.languages. Without a locale
			// provider it is still registered, and native words fallback uses en.
			await expect(page, { local: 19, steam: 2 }, 'en')
			const missingWords = await setup('?modlang=missing-words')
			await expect(missingWords, { local: 19, steam: 2 }, 'en')
		})
		await check('disabling Tweaks entirely restores original startup behavior', async () => {
			const noMod = await setup('', true)
			await expect(noMod, { local: 12, steam: 0 }, 'en')
		})
		await check('actual Loader menu displays the Chinese option and saves/reloads it', async () => {
			await expect(page, { local: 12, steam: 0 }, 'sch')
			await page.evaluate(() => ModLoader.togglePanel())
			await page.locator('.modloader-mod-title').click()
			const field = page.locator('[data-modloader-config-key="enableRememberLanguage"]')
			assert.equal(await field.getAttribute('aria-label'), '记住游戏语言')
			await field.scrollIntoViewIfNeeded()
			await page.waitForTimeout(350) // Let the existing section expansion finish for the screenshot.
			await page.screenshot({ path: path.join(output, 'loader-language-config.png') })
			await field.uncheck()
			assert.equal(await page.evaluate(() => game.language), 'sch')
			await Promise.all([page.waitForEvent('load'), page.locator('.modloader-save-button').click()])
			await page.waitForFunction(() => window.ready)
			assert.equal(await page.evaluate(() => game.language), 'en')
			assert.equal(await page.evaluate(([mod, key]) => ModLoader.forMod(mod).config.get(key), [MOD, KEY]), false)
		})
		await check('menu re-enables the fix and restores the saved choice on reload', async () => {
			await page.evaluate(() => {
				// Saving can restore the panel as an edge tab. Reopen it fully.
				if (document.getElementById('modloader-panel')) ModLoader.togglePanel()
				ModLoader.togglePanel()
			})
			const field = page.locator('[data-modloader-config-key="enableRememberLanguage"]')
			if (!(await field.evaluate(el => el.closest('.modloader-mod-row').classList.contains('modloader-mod-row-expanded')))) await page.locator('.modloader-mod-title').click()
			assert.equal(await field.getAttribute('aria-label'), 'Remember game language')
			await field.check()
			assert.equal(await page.evaluate(() => game.language), 'en')
			await Promise.all([page.waitForEvent('load'), page.locator('.modloader-save-button').click()])
			await page.waitForFunction(() => window.ready)
			assert.equal(await page.evaluate(() => game.language), 'sch')
			assert.equal(await page.evaluate(([mod, key]) => ModLoader.forMod(mod).config.get(key), [MOD, KEY]), true)
		})
		assert.deepEqual(errors, [], 'no browser script errors')
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results, errors, nativeLanguages, scope: 'isolated startup and menu; synthetic world/Steam/words; no full gameplay' }, null, 2))
		console.log('Report: ' + output)
	} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
