'use strict'

// Actual Game save/load/changeLanguage, Messenger and ModLoader with fresh
// browser storage. World, words and Steam transport are synthetic fixtures.
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
const MOD = 'Cattail_Tweaks_Chat-Timestamps'
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods', MOD, 'mod.json'), 'utf8'))
const ui = fs.readFileSync(path.join(ROOT, 'scripts/ui.js'), 'utf8')
const messenger = ui.slice(ui.indexOf('class Messenger {'), ui.indexOf('class Splash {'))
assert.ok(messenger.startsWith('class Messenger {'))
const output = process.env.CHAT_TIMESTAMPS_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'chat-timestamp-cache-'))
fs.mkdirSync(output, { recursive: true })
const server = http.createServer((req, res) => {
	const pathname = new URL(req.url, 'http://localhost').pathname
	let body, type = 'text/javascript'
	if (pathname === '/') { body = '<!doctype html><meta charset="utf-8">'; type = 'text/html' }
	else if (pathname === '/mods/enabled.json') { body = JSON.stringify({ mods: [MOD] }); type = 'application/json' }
	else if (pathname === `/mods/${MOD}/mod.json`) { body = JSON.stringify(manifest); type = 'application/json' }
	else if (pathname === `/mods/${MOD}/scripts/main.js` || pathname === '/modloader/translations.json') body = fs.readFileSync(path.join(ROOT, pathname.slice(1)))
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	let browser
	try {
		browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHAT_TIMESTAMPS_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback) })
		const context = await browser.newContext()
		const page = await context.newPage()
		const errors = []
		page.on('pageerror', error => errors.push(error.message))
		await page.goto('http://127.0.0.1:' + server.address().port)
		await page.addScriptTag({ path: path.join(ROOT, 'scripts/game.js') })
		await page.addScriptTag({ content: messenger })
		await page.addScriptTag({ path: path.join(ROOT, 'modloader/loader.js') })
		const result = await page.evaluate(async () => {
			const clone = value => JSON.parse(JSON.stringify(value))
			const checks = []
			const check = (name, condition) => { if (!condition) throw new Error(name); checks.push(name) }
			const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
			window.abstract_getWords = () => ({ en: {}, de: {} })
			const makeGame = (completions = 0) => Object.assign(Object.create(Game.prototype), {
				version: '1.3', isMobile: false, steamId: 'timestamp-test', language: 'en', languages: ['en', 'de'], completions,
				currentSlotId: 0, saveSlots: [], maxSaveStack: 16, stuff: [], resources: [64, 1], stats: {}, plane: 0,
				codex: { entities: {}, messages: { events: [], postEvents: [], origins: [0, 1, 0], postOrigins: [1, 0, 1] } },
				store: { existed: {}, setExisted() {}, compositionUpdate() {}, reinit() {} }, achiever: { fired: [], setState() {} },
				splash: { gameIsMute: false, init() {} }, explainer: { next: 0 }, globalSoundVolume: 0.36,
				pronounce: (_type, id) => id === undefined ? '' : `message ${id}`, switchPlane() {}, updateEraserType() {}, cleanup() {}, simulateIdleTime() {},
				assemblePermanents() { return { completions: this.completions } }, spaceport: { invoke: async () => true }
			})
			const game = makeGame()
			await ModLoader.stage('afterVanillaScripts', game)
			game.messenger = new Messenger(game)
			game.localDatabase = await game.getDatabase()
			const oldTimes = ['01/01/01 12:00:00', '01/01/01 12:00:09']
			game.messenger.setState([], [0, 1], 1, oldTimes)
			await game.saveGame()
			const slot = await game.readFromSlot(0)
			const initial = slot.stack[0].state
			check('unchanged v1 compact format reaches native IndexedDB', same(initial.messengerMessageTimestamps, { v: 1, b: oldTimes[0], s: [0, 9] }))
			const restored = makeGame()
			restored.localDatabase = game.localDatabase
			restored.messenger = new Messenger(restored)
			check('native loadSave restores the original time sequence', restored.loadSave(clone(initial)) && same(restored.messenger.messageTimestamps, oldTimes))
			restored.messenger.initChain([2])
			const before = restored.messenger.messageTimestamps.slice()
			restored.changeLanguage(1)
			restored.changeLanguage(0)
			check('new message time survives repeated native language changes', same(restored.messenger.messageTimestamps, before))
			check('load cache was consumed', !Object.hasOwn(restored, '__chatTimestampMessageTimestamps'))
			check('bubble text retains exactly one timestamp per message', same(Array.from(restored.messenger.element.querySelectorAll('.messageTime'), node => node.textContent), before))
			await restored.saveGame()
			const savedAgain = await restored.readFromSlot(0)
			const reloaded = makeGame()
			reloaded.messenger = new Messenger(reloaded)
			check('save after language switch then reload preserves all times', reloaded.loadSave(clone(savedAgain.stack[0].state)) && same(reloaded.messenger.messageTimestamps, before))
			const legacy = clone(initial)
			legacy.messengerMessageTimestamps = oldTimes.slice()
			check('legacy arrays still restore and clear the pending cache', restored.loadSave(legacy) && same(restored.messenger.messageTimestamps, oldTimes) && !Object.hasOwn(restored, '__chatTimestampMessageTimestamps'))
			check('legacy arrays are still saved as v1 compact data', same(restored.assembleSave().messengerMessageTimestamps, initial.messengerMessageTimestamps))
			const other = clone(initial)
			other.messengerMessageTimestamps = { v: 1, b: '02/02/02 13:00:00', s: [0, 15] }
			check('loading another history replaces rather than reuses current times', restored.loadSave(other) && restored.messenger.messageTimestamps[0] === '02/02/02 13:00:00')
			check('returning to older history restores its own time sequence', restored.loadSave(clone(initial)) && same(restored.messenger.messageTimestamps, oldTimes))
			ModLoader.applyLoadedSave(clone(initial), restored)
			const explicit = ['03/03/03 14:00:00', '03/03/03 14:00:10']
			restored.messenger.setState([], [0, 1], 1, explicit)
			restored.changeLanguage(1)
			check('explicit timestamps supersede and consume pending load data', same(restored.messenger.messageTimestamps, explicit) && !Object.hasOwn(restored, '__chatTimestampMessageTimestamps'))
			const empty = clone(initial)
			delete empty.messengerMessageTimestamps
			empty.messengerShownMessages = []
			restored.messenger.__chatTimestampCursorDate = new Date(2099, 11, 31)
			check('empty history resets times and stale generation cursor', restored.loadSave(empty) && restored.messenger.messageTimestamps.length === 0 && !restored.messenger.__chatTimestampCursorDate)
			restored.messenger.initChain([0])
			check('a message after empty history is not dated using a previous history', restored.messenger.messageTimestamps[0].slice(6, 8) !== '99')
			const missing = clone(initial)
			delete missing.messengerMessageTimestamps
			check('missing old metadata is filled without importing another history', restored.loadSave(missing) && restored.messenger.messageTimestamps.length === 2 && !same(restored.messenger.messageTimestamps, oldTimes))
			const estimated = restored.messenger.messageTimestamps.slice()
			restored.changeLanguage(0)
			check('filled missing times remain stable across language refresh', same(restored.messenger.messageTimestamps, estimated))
			const post = makeGame(1)
			post.messenger = new Messenger(post)
			check('later-round Messenger can still restore saved timestamps', post.loadSave(clone(initial)) && same(post.messenger.messageTimestamps, oldTimes))
			post.messenger.initChain([2])
			const postTimes = post.messenger.messageTimestamps.slice()
			post.changeLanguage(1)
			check('later-round message time survives language refresh', same(post.messenger.messageTimestamps, postTimes))
			const encoded = game.encodeSave(JSON.stringify({ data: savedAgain.stack[0] }))
			check('native Base64 encode/decode leaves the timestamp field intact', same(game.decodeSave(encoded).data.state.messengerMessageTimestamps, savedAgain.stack[0].state.messengerMessageTimestamps))
			return { checks, beforeLanguageChange: before, savedAfterLanguageChange: savedAgain.stack[0].state.messengerMessageTimestamps }
		})
		assert.deepEqual(errors, [])
		for (const name of result.checks) console.log('PASS ' + name)
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ...result, errors, scope: 'isolated methods and IndexedDB; synthetic world, Steam and words; no full gameplay' }, null, 2))
		console.log('Report: ' + output)
	} finally {
		if (browser) await browser.close()
		await new Promise(resolve => server.close(resolve))
	}
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
