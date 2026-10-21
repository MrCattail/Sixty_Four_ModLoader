// Real IndexedDB in a fresh headless browser profile. No Game construction,
// player data, installed Mod execution, or Steam connection.
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
const GAME_ROOT = path.resolve(__dirname, '../../..')
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../scripts/save-slots.js'), 'utf8')
const native = fs.readFileSync(path.join(GAME_ROOT, 'scripts/game.js'), 'utf8')
const NATIVE_GAME = native.slice(native.indexOf('class Game {'))
const OUTPUT = process.env.BETTER_UI_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'better-ui-1.3-checks-'))
fs.mkdirSync(OUTPUT, { recursive: true })
const encode = value => Buffer.from(JSON.stringify(value), 'binary').toString('base64')
const bundle = (version, value) => `CattailSaveSlots:v${version}\n` + Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
const identity = '11111111-1111-4111-8111-111111111111'
const world = (timestamp = 1000) => ({ stuff: [], resources: [64, 8, 4], timestamp, modloader: { saveInstanceId: identity, extension: { keep: true } } })
const permanents = { glory: [1, 0, 1], completions: 3, upgrades: 7, orbUpgradeMap: [2], memory: { keep: true } }
const record = timestamp => ({ state: world(timestamp), permanents: structuredClone(permanents), isProtected: false, extra: 'record metadata' })
const slot = (name = 'Main', times = [3000, 1000, 2000]) => ({ name, ownerHash: 42, creationTimeStamp: 1, lastModified: 3000, extra: 'slot metadata', stack: times.map(record) })

function fixture(options) {
	window.clone = value => JSON.parse(JSON.stringify(value))
	window.hooks = new Map(); window.cloud = []; window.reloads = []; window.clipboardValue = ''
	window.saving = 0; window.maxSaving = 0; window.cloudMode = 'success'; window.cloudDelay = 0
	window.abortIndex = null; window.failPreferences = 0
	const timeout = window.setTimeout.bind(window)
	window.setTimeout = (callback, delay, ...args) => {
		if (delay === 100 && String(callback).includes('location.reload')) { reloads.push(callback); return 0 }
		return timeout(callback, delay, ...args)
	}
	Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => clipboardValue } })
	window.stage = async (name, payload, game) => { for (const fn of hooks.get(name) || []) await fn(payload, game) }
	window.pageDefinition = null
	window.splash = { element: document.querySelector('.splash'), master: null }
	window.renderPage = () => {
		const shell = document.querySelector('.cattail-save-slots-page')
		const top = shell.querySelector('.cattail-save-slots-list')?.scrollTop || 0
		shell.replaceChildren()
		const heading = document.createElement('div'); heading.className = 'cattail-save-slots-logo'; heading.textContent = 'SIXTY FOUR'
		const title = document.createElement('div'); title.className = 'cattail-save-slots-subtitle'; title.textContent = pageDefinition.title(game)
		const content = document.createElement('div'); content.className = 'cattail-save-slots-list'
		const ctx = { game, splash, page: shell, content }
		shell.append(heading, title, pageDefinition.renderBeforeContent(ctx), content)
		pageDefinition.renderContent(ctx); content.scrollTop = top
	}
	window.ModLoader = { register(definition) {
		definition.init({ id: definition.id, config: { get: () => options.enabled !== false },
			ui: { pages: { register(value) { pageDefinition = value }, isActive: () => true, refresh: () => renderPage() } },
			on(name, fn) { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn) },
			patch(target, name, wrapper) { target[name] = wrapper(target[name]) }
		})
	} }
	window.boot = async () => {
		window.game = Object.assign(Object.create(Game.prototype), {
			version: '1.3', steamId: 'synthetic-player', language: options.language || 'en', currentSlotId: options.currentSlotId || 0,
			saveSlots: clone(options.slots || []), maxSaveStack: 16, preventSaving: false, preventCloud: false,
			assembleSave() { return { ...clone(this.liveState), timestamp: Date.now() } },
			assemblePermanents() { return clone(this.livePermanents) },
			savePreferences() {
				if (failPreferences > 0) { failPreferences--; throw new Error('synthetic preferences failure') }
				localStorage.setItem('abstractv03_preferences' + this.steamId, JSON.stringify({ currentSlotId: this.currentSlotId }))
			},
			spaceport: { invoke: async (channel, value) => {
				if (channel !== 'store') throw new Error('Unexpected IPC: ' + channel)
				saving++; maxSaving = Math.max(maxSaving, saving); cloud.push(clone(value))
				try { if (cloudDelay) await new Promise(resolve => timeout(resolve, cloudDelay)); if (cloudMode === 'throw') throw new Error('cloud outage'); return cloudMode === 'success' }
				finally { saving-- }
			} }
		})
		const db = await game.getDatabase()
		if (options.restore) {
			game.localDatabase = db; game.saveSlots = []
			for (const id of await game.getSlotList()) game.saveSlots[id] = await game.readFromSlot(id)
			game.currentSlotId = JSON.parse(localStorage.getItem('abstractv03_preferencessynthetic-player') || '{}').currentSlotId || 0
		} else {
			await new Promise((resolve, reject) => {
				const tx = db.transaction('charps_memory_slots', 'readwrite'); const store = tx.objectStore('charps_memory_slots')
				store.clear(); game.saveSlots.forEach((value, i) => store.put(value, [game.steamId, i]))
				tx.oncomplete = resolve; tx.onerror = reject
			})
			for (const [key, value] of Object.entries(options.storage || {})) localStorage.setItem(key, value)
		}
		game.localDatabase = { transaction(...args) {
			const tx = db.transaction(...args); const getStore = tx.objectStore.bind(tx)
			tx.objectStore = name => {
				const store = getStore(name); const put = store.put.bind(store)
				store.put = (value, key) => {
					if (abortIndex !== null && key[1] === abortIndex) { abortIndex = null; tx.abort(); throw new Error('synthetic IndexedDB abort') }
					return put(value, key)
				}; return store
			}; return tx
		} }
		game.liveState = clone(game.saveSlots[game.currentSlotId]?.stack[0].state || { stuff: [], resources: [], timestamp: 1 })
		game.livePermanents = clone(game.saveSlots[game.currentSlotId]?.stack[0].permanents || {})
		splash.master = game
		await stage('afterVanillaScripts'); await stage('afterGameInit', null, game)
		window.service = window[Symbol.for('cattail.better-uis.save-slots')]
		if (pageDefinition) renderPage()
	}
}

async function main() {
	const server = http.createServer((req, res) => {
		if (/^\/(font|img)\/[a-zA-Z0-9_./-]+$/.test(req.url) && !req.url.includes('..')) {
			const file = path.join(GAME_ROOT, req.url)
			if (fs.existsSync(file) && fs.statSync(file).isFile()) { res.end(fs.readFileSync(file)); return }
			res.writeHead(404); res.end(); return
		}
		res.setHeader('Content-Type', 'text/html; charset=utf-8')
		res.end('<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Montserrat;src:url(/font/Montserrat-Regular.woff2)}html,body{margin:0;height:100%;background:black}.splash{position:fixed;inset:0}</style><div class="splash cattail-save-slots-active"><div class="cattail-save-slots-page"></div></div>')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = `http://127.0.0.1:${server.address().port}`
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	let browser
	const contexts = []; let passed = 0
	try {
		browser = await playwright.chromium.launch({ headless: true, executablePath })
		const setup = async (options = {}, existingContext = null) => {
			const ctx = existingContext || await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
			if (!existingContext) contexts.push(ctx)
			const page = await ctx.newPage(); await page.goto(address)
			await page.addScriptTag({ content: NATIVE_GAME }); await page.evaluate(fixture, { slots: [slot()], ...options })
			await page.addScriptTag({ content: SOURCE }); await page.evaluate(() => boot()); return page
		}
		const test = async (name, work) => { await work(); passed++; console.log('PASS', name) }
		const press = locator => locator.evaluate(el => el.onclick(new MouseEvent('click', { bubbles: true, cancelable: true })))
		const button = (page, name) => page.getByRole('button', { name, exact: true })
		const preview = async (page, value) => { await page.evaluate(text => { clipboardValue = text }, value); await press(button(page, 'Import from clipboard')); await button(page, 'Add slots').waitFor() }
		const confirm = page => press(button(page, 'Add slots'))
		const protectedFork = page => page.evaluate(async () => {
			const record = { state: game.assembleSave(), permanents: game.assemblePermanents(), isProtected: false }
			try { return await service.createAndActivate({ entries: [{ name: 'protected copy', data: record, nameConflict: 'reject' }], activateEntry: 0,
				preserveSource: { record, name: 'original', sourceIndex: 0, saveInstanceId: record.state.modloader.saveInstanceId, assertCurrent() {} } }) }
			catch (error) { return { code: error.code } }
		})
		await test('protected fork writes original checkpoint and copy, then verifies both after reload', async () => {
			const page = await setup(), before = await page.evaluate(() => clone(game.saveSlots[0]))
			const result = await protectedFork(page); assert.equal(result.activated, true); assert.equal(result.entries[0].index, 1)
			const original = await page.evaluate(() => game.readFromSlot(0))
			assert.deepEqual([original.stack[0], ...original.stack.slice(2)], before.stack)
			assert.equal(original.stack[1].isProtected, true)
			const restored = await setup({ restore: true }, page.context())
			assert.equal(await restored.evaluate(() => service.snapshot().ready), true)
			assert.equal(await restored.evaluate(() => game.saveSlots[1].stack.length), 1)
		})
		for (const fault of ['write', 'read', 'preferences']) await test('protected fork ' + fault + ' failure restores database and selection', async () => {
			const page = await setup(), before = await page.evaluate(() => clone(game.saveSlots))
			await page.evaluate(fault => {
				if (fault === 'write') abortIndex = 1
				if (fault === 'preferences') failPreferences = 1
				if (fault === 'read') { const read = game.readFromSlot.bind(game); game.readFromSlot = async i => { const s = await read(i); if (i === 1 && s) return { ...s, name: 'incorrect' }; return s } }
			}, fault)
			assert.ok((await protectedFork(page)).code)
			assert.deepEqual(await page.evaluate(() => game.saveSlots), before)
			assert.deepEqual(await page.evaluate(() => game.getSlotList()), [0])
			assert.deepEqual(await page.evaluate(() => game.readFromSlot(0)), before[0])
			assert.equal(await page.evaluate(() => game.currentSlotId === 0 && !game.preventSaving && reloads.length === 0), true)
		})
		await test('protected fork cloud warning persists in the rendered save page after reload', async () => {
			const page = await setup(); await page.evaluate(() => { cloudMode = 'false' })
			assert.equal((await protectedFork(page)).cloudSaved, false)
			const restored = await setup({ restore: true }, page.context())
			assert.equal(await restored.evaluate(() => service.snapshot().activationNotice.cloudSaved), false)
			assert.match(await restored.locator('[role=status]').innerText(), /Saved locally/)
		})
		await test('cloud recovery emits one game-scoped status event; repeated failures retain the notice', async () => {
			const page = await setup(); await page.evaluate(() => { cloudMode = 'false' })
			assert.equal((await protectedFork(page)).cloudSaved, false)
			const restored = await setup({ restore: true }, page.context())
			await restored.evaluate(() => {
				window.notices = []
				window.addEventListener('cattail:better-uis-save-status', e => notices.push({ ownGame: e.detail.game === game, notice: service.snapshot().activationNotice }))
				cloudMode = 'false'
			})
			await restored.evaluate(() => game.saveGame())
			assert.equal(await restored.evaluate(() => notices.length), 0)
			assert.equal(await restored.evaluate(() => service.snapshot().activationNotice.cloudSaved), false)
			await restored.evaluate(() => { cloudMode = 'success' }); await restored.evaluate(() => game.saveGame())
			assert.deepEqual(await restored.evaluate(() => notices), [{ ownGame: true, notice: null }])
			assert.equal(await restored.evaluate(() => localStorage.getItem('abstractv03_saveSlotsForkNoticesynthetic-player')), null)
			await restored.evaluate(() => game.saveGame())
			assert.equal(await restored.evaluate(() => notices.length), 1)
		})
		await test('missing original protection point prevents activation settlement and later saves', async () => {
			const page = await setup(); assert.equal((await protectedFork(page)).activated, true)
			await page.evaluate(async () => { game.saveSlots[0].stack.splice(1, 1); await game.writeToSlot(game.saveSlots[0], 0) })
			const restored = await setup({ restore: true }, page.context())
			assert.equal(await restored.evaluate(() => service.snapshot().error.code), 'VERIFY_FAILED')
			const before = await restored.evaluate(() => JSON.stringify(game.saveSlots))
			await restored.evaluate(() => game.saveGame())
			assert.equal(await restored.evaluate(() => JSON.stringify(game.saveSlots)), before)
			assert.ok(await restored.evaluate(() => localStorage.getItem('abstractv03_saveSlotsNativeActivationsynthetic-player')))
		})
		await test('v1 service, 20 ordinary slots and current-slot alias', async () => {
			const page = await setup(); const state = await page.evaluate(() => service.snapshot())
			assert.equal(state.version, 1); assert.equal(state.ready, true); assert.equal(state.emptyCount, 19)
			assert.equal(state.slots.length, 20); assert.equal(state.source.index, 0)
			assert.equal(await page.locator('.cattail-save-slots-row').count(), 21)
			assert.equal(state.slots.some(value => 'data' in value), false)
		})
		await test('legacy native import appends, preserves old storage, no activation', async () => {
			const storage = { 'abstractv03synthetic-player': 'old-auto', 'abstractv03_saveSlotssynthetic-player': 'old-manual' }
			const page = await setup({ storage }); await preview(page, encode(world(99)))
			assert.equal(await page.evaluate(() => game.saveSlots.length), 1); await confirm(page)
			const data = await page.evaluate(async () => ({ saved: await game.readFromSlot(1), current: game.currentSlotId, reloads: reloads.length, storage: { ...localStorage } }))
			assert.equal(data.current, 0); assert.equal(data.reloads, 0); assert.equal(data.saved.stack[0].state.timestamp, 99)
			assert.notEqual(data.saved.stack[0].state.modloader.saveInstanceId, identity)
			assert.equal(data.saved.stack[0].state.modloader.extension.keep, true); assert.equal(data.saved.stack[0].permanents.completions, 0)
			for (const [key, value] of Object.entries(storage)) assert.equal(data.storage[key], value)
		})
		await test('1.3 envelope, old raw JSON and invalid data validation', async () => {
			const page = await setup(); await preview(page, encode({ data: record(500), ownerHash: 73, creationTimeStamp: 30, lastModified: 500 })); await confirm(page)
			const data = await page.evaluate(() => game.saveSlots[1]); assert.deepEqual(data.stack[0].permanents, permanents)
			assert.equal(data.ownerHash, 73); assert.equal(data.stack[0].extra, 'record metadata')
			await preview(page, JSON.stringify(world(700))); await confirm(page)
			await page.evaluate(() => { clipboardValue = '{"data":{"state":{"oops":true},"permanents":{}}}' }); await press(button(page, 'Import from clipboard'))
			assert.equal(await page.evaluate(() => game.saveSlots.length), 3); assert.match(await page.locator('[role=status]').innerText(), /failed/)
		})
		await test('v2 file import and export retain all histories and unicode', async () => {
			const page = await setup(); const payload = { type: 'Cattail_TweaksQuality_Saves-Slots', version: 2, slots: [slot('中文世界'), slot('second')] }
			const chooser = page.waitForEvent('filechooser')
			await press(button(page, 'Import file'))
			await (await chooser).setFiles({ name: 'backup.cattail-save-slots', mimeType: 'text/plain', buffer: Buffer.from(bundle(2, payload)) })
			await button(page, 'Add slots').waitFor(); await confirm(page)
			const downloadPromise = page.waitForEvent('download'); await press(button(page, 'Export all'))
			const file = path.join(OUTPUT, 'synthetic-roundtrip.cattail-save-slots'); await (await downloadPromise).saveAs(file)
			const raw = fs.readFileSync(file, 'utf8'); assert.ok(raw.startsWith('CattailSaveSlots:v2\n'))
			const data = JSON.parse(Buffer.from(raw.split('\n')[1], 'base64').toString('utf8'))
			assert.equal(data.slots.length, 3); assert.equal(data.slots[1].name, '中文世界'); assert.equal(data.slots[1].stack.length, 3)
			assert.deepEqual(data.slots[1].stack[2].permanents, permanents); assert.equal(data.slots[1].extra, 'slot metadata')
		})
		await test('1.2.1 native and v1 backup files import as native slots and export as v2', async () => {
			const page = await setup()
			const legacy = { ...world(1210), version: '1.2.1' }
			for (const file of [
				{ name: 'legacy-1.2.1.txt', content: encode(legacy) },
				{ name: 'legacy-v1.cattail-save-slots', content: bundle(1, { version: 1, manual: [{ name: '旧版文件', data: encode(legacy) }] }) }
			]) {
				const chooser = page.waitForEvent('filechooser')
				await press(button(page, 'Import file'))
				await (await chooser).setFiles({ name: file.name, mimeType: 'text/plain', buffer: Buffer.from(file.content) })
				await button(page, 'Add slots').waitFor(); await confirm(page)
			}
			assert.equal(await page.evaluate(() => game.saveSlots.length), 3)
			assert.equal(await page.evaluate(() => game.currentSlotId), 0)
			assert.equal(await page.evaluate(() => reloads.length), 0)
			const downloaded = page.waitForEvent('download'); await press(button(page, 'Export all'))
			const file = path.join(OUTPUT, 'legacy-file-roundtrip.cattail-save-slots'); await (await downloaded).saveAs(file)
			const raw = fs.readFileSync(file, 'utf8'); assert.ok(raw.startsWith('CattailSaveSlots:v2\n'))
			const result = JSON.parse(Buffer.from(raw.split('\n')[1], 'base64').toString('utf8'))
			assert.equal(result.slots.length, 3); assert.equal(result.slots[2].name, '旧版文件')
			for (const slot of result.slots.slice(1)) {
				assert.equal(slot.stack.length, 1)
				assert.deepEqual(slot.stack[0].state.resources, legacy.resources)
				assert.deepEqual(slot.stack[0].state.modloader.extension, legacy.modloader.extension)
				assert.notEqual(slot.stack[0].state.modloader.saveInstanceId, identity)
				assert.equal(slot.stack[0].state.timestamp, 1210)
				assert.equal(slot.stack[0].permanents.completions, 0)
			}
		})
		await test('v1 batch auto and manual records import additively', async () => {
			const page = await setup(); await preview(page, bundle(1, { version: 1, auto: { data: encode(world(50)) }, manual: [null, { name: '旧槽', data: encode(world(60)) }] })); await confirm(page)
			assert.deepEqual(await page.evaluate(() => game.saveSlots.slice(1).map(s => s.stack[0].state.timestamp)), [50, 60]); assert.equal(await page.evaluate(() => game.currentSlotId), 0)
		})
		await test('legacy preview migration retains source and prevents duplicate migration', async () => {
			const key = 'abstractv03_saveSlotssynthetic-player'; const raw = JSON.stringify([{ name: 'legacy', data: encode(world(20)) }, null])
			const page = await setup({ storage: { [key]: raw } }); await press(button(page, 'Migrate old slots'))
			assert.equal(await page.evaluate(() => game.saveSlots.length), 1); await confirm(page)
			assert.equal(await page.evaluate(key => localStorage.getItem(key), key), raw); await press(button(page, 'Migrate old slots'))
			assert.equal(await page.evaluate(() => game.saveSlots.length), 2); assert.match(await page.locator('[role=status]').innerText(), /No unmigrated/)
		})
		await test('20-slot limit and complete cloud payload; oversized existing collections preserved', async () => {
			const page = await setup({ slots: Array.from({ length: 19 }, (_, i) => slot('slot ' + i)) }); await preview(page, encode(world(64))); await confirm(page)
			const data = await page.evaluate(() => cloud.at(-1)); assert.equal(data.length, 20); assert.equal(data[18].stack.length, 3)
			await preview(page, encode(world(128))); await confirm(page); assert.equal(await page.evaluate(() => game.saveSlots.length), 20)
			assert.match(await page.locator('[role=status]').innerText(), /20 slots/)
			const large = await setup({ slots: Array.from({ length: 22 }, (_, i) => slot('slot ' + i)) })
			assert.equal(await large.locator('.cattail-save-slots-row').count(), 23); assert.equal(await large.evaluate(() => service.snapshot().emptyCount), 0)
		})
		await test('aborted IndexedDB batch has no partial new slots', async () => {
			const page = await setup(); await preview(page, bundle(2, { type: 'Cattail_TweaksQuality_Saves-Slots', version: 2, slots: [slot('a'), slot('b')] }))
			await page.evaluate(() => { abortIndex = 2 }); await confirm(page)
			assert.deepEqual(await page.evaluate(() => game.getSlotList()), [0]); assert.equal(await page.evaluate(() => game.saveSlots.length), 1)
			assert.match(await page.locator('[role=status]').innerText(), /abort/)
		})
		await test('cloud failure preserves committed local data and reports local-only result', async () => {
			const page = await setup(); await page.evaluate(() => { cloudMode = 'false' }); await preview(page, encode(world(22))); await confirm(page)
			assert.equal(await page.evaluate(async () => (await game.readFromSlot(1)).stack[0].state.timestamp), 22)
			assert.match(await page.locator('[role=status]').innerText(), /Saved locally/); assert.equal(await page.evaluate(() => game.currentSlotId), 0)
		})
		await test('timeline equal spacing, chronological view and correct historical activation', async () => {
			const page = await setup({ slots: [slot('timeline', [9000, 1000, 4000])] }); const nodes = page.locator('.cattail-save-slots-auto .cattail-save-slots-timeline-node')
			const xs = await nodes.evaluateAll(es => es.map(el => el.getBoundingClientRect().x)); assert.ok(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1])) < 1)
			assert.deepEqual(await page.evaluate(() => game.saveSlots[0].stack.map(r => r.state.timestamp)), [9000, 1000, 4000])
			await press(nodes.nth(1)); assert.equal(await page.evaluate(() => reloads.length), 1)
			assert.equal(await page.evaluate(async () => (await game.readFromSlot(0)).stack[0].state.timestamp), 4000)
			assert.deepEqual(await page.evaluate(() => game.saveSlots[0].stack[0].permanents), permanents)
			await page.evaluate(() => game.saveGame()); assert.equal(await page.evaluate(async () => (await game.readFromSlot(0)).stack[0].state.timestamp), 4000)
		})
		await test('stale head confirmation refuses to load after autosave replaces it', async () => {
			const page = await setup(); const auto = page.locator('.cattail-save-slots-auto')
			await press(auto.getByRole('button', { name: 'Load', exact: true })); await page.evaluate(() => game.saveGame())
			await press(auto.locator('.cattail-save-slots-confirm-ok')); assert.equal(await page.evaluate(() => reloads.length), 0)
			assert.match(await page.locator('[role=status]').innerText(), /changed/)
		})
		await test('service activation verified from persisted identity after reload; names conflict', async () => {
			const page = await setup(); const args = { entries: [{ name: 'created', data: encode(world(400)), nameConflict: 'reject' }], activateEntry: 0 }
			const result = await page.evaluate(args => service.createAndActivate(args), args); assert.equal(result.activated, true); assert.equal(result.activeIndex, 1)
			const restored = await setup({ restore: true }, page.context()); assert.equal(await restored.evaluate(() => service.snapshot().ready), true)
			assert.equal(await restored.evaluate(() => localStorage.getItem('abstractv03_saveSlotsNativeActivationsynthetic-player')), null)
			const code = await restored.evaluate(async args => { try { await service.createAndActivate(args) } catch (e) { return e.code } }, args); assert.equal(code, 'NAME_CONFLICT')
		})
		await test('failed preferences write restores database, active slot and activation marker', async () => {
			const page = await setup(); await page.evaluate(() => { failPreferences = 1 })
			const message = await page.evaluate(async args => { try { await service.createAndActivate(args) } catch (e) { return e.message } }, { entries: [{ name: 'created', data: encode(world()), nameConflict: 'reject' }], activateEntry: 0 })
			assert.match(message, /preferences failure/); assert.deepEqual(await page.evaluate(() => game.getSlotList()), [0])
			assert.equal(await page.evaluate(() => game.currentSlotId), 0); assert.equal(await page.evaluate(() => game.preventSaving), false)
			assert.equal(await page.evaluate(() => localStorage.getItem('abstractv03_saveSlotsNativeActivationsynthetic-player')), null)
		})
		await test('rename/delete update native keys and retain the active world', async () => {
			const page = await setup({ slots: [slot('first'), slot('second'), slot('active')], currentSlotId: 2 }); const first = page.locator('.cattail-save-slots-row:not(.cattail-save-slots-auto)').first()
			await press(first.getByRole('button', { name: 'Rename', exact: true })); await first.locator('input').fill('renamed'); await press(first.getByRole('button', { name: 'Save', exact: true }))
			assert.equal(await page.evaluate(() => game.saveSlots[0].name), 'renamed')
			await press(first.getByRole('button', { name: 'Delete', exact: true })); await press(first.locator('.cattail-save-slots-confirm-ok'))
			assert.equal(await page.evaluate(() => game.currentSlotId), 1); assert.deepEqual(await page.evaluate(() => game.getSlotList()), [0, 1])
			assert.equal(await page.evaluate(async () => (await game.readFromSlot(1)).name), 'active')
		})
		await test('queued saves and import do not overlap their cloud writes', async () => {
			const page = await setup(); await preview(page, encode(world())); await page.evaluate(() => { cloudDelay = 40; window.backgroundSave = game.saveGame() })
			await confirm(page); await page.evaluate(() => backgroundSave); assert.equal(await page.evaluate(() => maxSaving), 1)
		})
		await test('disabled service remains unavailable', async () => { const page = await setup({ enabled: false }); assert.equal(await page.evaluate(() => !!service), false) })
		await test('new/copy/overwrite preserve NG+ and create independent identities', async () => {
			const page = await setup({ slots: [slot('x'.repeat(64))] })
			await press(page.locator('.cattail-save-slots-row:not(.cattail-save-slots-auto)').nth(1).getByRole('button', { name: 'New', exact: true }))
			assert.equal(await page.evaluate(() => game.saveSlots.length), 2)
			assert.deepEqual(await page.evaluate(() => game.saveSlots[1].stack[0].permanents), permanents)
			const first = page.locator('.cattail-save-slots-row:not(.cattail-save-slots-auto)').first()
			await press(first.getByRole('button', { name: 'Copy', exact: true }))
			const copies = await page.evaluate(() => game.saveSlots)
			assert.equal(copies[2].stack.length, 3); assert.ok(copies[2].name.length <= 64)
			assert.notEqual(copies[2].stack[0].state.modloader.saveInstanceId, copies[1].stack[0].state.modloader.saveInstanceId)
			const second = page.locator('.cattail-save-slots-row:not(.cattail-save-slots-auto)').nth(1)
			const old = copies[1].stack[0].state.modloader.saveInstanceId
			await press(second.getByRole('button', { name: 'Overwrite', exact: true })); await press(second.locator('.cattail-save-slots-confirm-ok'))
			assert.equal(await page.evaluate(() => game.saveSlots[1].stack.length), 2)
			assert.notEqual(await page.evaluate(() => game.saveSlots[1].stack[0].state.modloader.saveInstanceId), old)
			assert.equal(await page.evaluate(() => game.currentSlotId), 0)
		})
		await test('world-only v1 service forks carry current NG+ state', async () => {
			const page = await setup()
			await page.evaluate(args => service.createAndActivate(args), { entries: [{ name: 'creative', data: encode(world()), nameConflict: 'reject' }], activateEntry: 0 })
			assert.deepEqual(await page.evaluate(() => game.saveSlots[1].stack[0].permanents), permanents)
			assert.equal(await page.evaluate(() => game.saveSlots[1].ownerHash), 42)
		})
		await test('wrong active slot refuses pending activation finalization', async () => {
			const key = 'abstractv03_saveSlotsNativeActivationsynthetic-player'
			const marker = JSON.stringify({ schema: 2, steamId: 'synthetic-player', index: 1, saveInstanceId: identity })
			const page = await setup({ storage: { [key]: marker } })
			const snapshot = await page.evaluate(() => service.snapshot())
			assert.equal(snapshot.ready, false); assert.equal(snapshot.error.code, 'VERIFY_FAILED')
			assert.equal(await page.evaluate(key => localStorage.getItem(key), key), marker)
			const original = await page.evaluate(() => game.saveSlots[0].stack[0].state.timestamp)
			await page.evaluate(() => game.saveGame()); assert.equal(await page.evaluate(() => game.saveSlots[0].stack[0].state.timestamp), original)
		})
		await test('new-game null state and protected histories survive import', async () => {
			const page = await setup(); const data = slot('new cycle')
			data.stack[0].state = null; data.stack[1].isProtected = true
			await preview(page, bundle(2, { type: 'Cattail_TweaksQuality_Saves-Slots', version: 2, slots: [data] })); await confirm(page)
			assert.equal(await page.evaluate(() => game.saveSlots[1].stack[0].state), null)
			assert.equal(await page.evaluate(() => game.saveSlots[1].stack[1].isProtected), true)
			assert.deepEqual(await page.evaluate(() => game.saveSlots[1].stack[0].permanents), permanents)
		})
		await test('copy history keeps separate lineage groups independent from the source', async () => {
			const data = slot('lineages'); data.stack[2].state.modloader.saveInstanceId = '22222222-2222-4222-8222-222222222222'
			const page = await setup(); await preview(page, bundle(2, { type: 'Cattail_TweaksQuality_Saves-Slots', version: 2, slots: [data] })); await confirm(page)
			const ids = await page.evaluate(() => game.saveSlots[1].stack.map(r => r.state.modloader.saveInstanceId))
			assert.equal(ids[0], ids[1]); assert.notEqual(ids[0], ids[2]); assert.notEqual(ids[0], identity)
		})
		await test('resource-column timeline, balanced single-tier labels and equal node spacing', async () => {
			const times = Array.from({ length: 16 }, (_, i) => Date.UTC(2026, 9, 5, 12) - i * 240000)
			const page = await setup({ slots: [slot('历史时间轴', times)], language: 'sch' })
			for (const width of [1440, 1000, 600]) {
				await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready)
				const result = await page.locator('.cattail-save-slots-auto').evaluate(row => {
					const line = row.querySelector('.cattail-save-slots-timeline')
					const area = row.querySelector('.cattail-save-slots-resource-area')
					const resources = row.querySelector('.cattail-save-slots-resources')
					const bounds = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }
					const dots = [...line.querySelectorAll('.cattail-save-slots-timeline-node')].map(n => n.getBoundingClientRect().x)
					const labelNodes = [...line.querySelectorAll('.cattail-save-slots-timeline-label')]
					const labels = labelNodes.map((n, index) => ({ ...bounds(n), index, visible: getComputedStyle(n).visibility !== 'hidden' })).filter(n => n.visible)
					return { dots, labels, bottom: row.getBoundingClientRect().bottom, grouped: line.parentElement === area && resources.parentElement === area && row.children[1] === area,
						allNodesLabeled: labelNodes.every(n => n.parentElement.title && n.parentElement.getAttribute('aria-label')),
						area: bounds(area), line: bounds(line), resources: bounds(resources), info: bounds(row.querySelector('.cattail-save-slots-info')), actions: bounds(row.querySelector('.cattail-save-slots-actions')) }
				})
				assert.ok(result.grouped, 'Timeline and resources must share the middle column')
				assert.ok(result.line.top >= result.resources.bottom && result.line.left >= result.area.left && result.line.right <= result.area.right)
				if (width > 860) assert.ok(result.info.right <= result.area.left && result.actions.left >= result.area.right, 'Name and actions must stay beside the resource area')
				else assert.ok(result.line.bottom <= result.actions.top, 'Timeline must precede actions in the stacked layout')
				assert.equal(result.dots.length, 16); assert.ok(result.allNodesLabeled)
				assert.ok(result.labels.length >= 2 && result.labels.length < result.dots.length)
				assert.equal(result.labels[0].index, 0); assert.equal(result.labels.at(-1).index, 15)
				const intervals = result.labels.slice(1).map((label, i) => label.index - result.labels[i].index)
				assert.ok(Math.max(...intervals) - Math.min(...intervals) <= 1, 'Visible labels must be evenly sampled')
				for (let i = 2; i < result.dots.length; i++) assert.ok(Math.abs(result.dots[i] - result.dots[i - 1] - (result.dots[1] - result.dots[0])) < 1)
				for (let i = 0; i < result.labels.length; i++) {
					const a = result.labels[i]; assert.ok(a.left >= result.area.left && a.right <= result.area.right && a.bottom <= result.area.bottom && a.bottom < result.bottom + 1)
					assert.ok(Math.abs(a.top - result.labels[0].top) < 1, 'Time labels must stay on one tier')
					for (const b of result.labels.slice(i + 1)) assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `Labels overlap at ${width}px`)
				}
				await page.screenshot({ path: path.join(OUTPUT, `timeline-${width}.png`) })
			}
			const hiddenLabelNode = page.locator('.cattail-save-slots-auto .cattail-save-slots-timeline-node').nth(1)
			assert.equal(await hiddenLabelNode.locator('.cattail-save-slots-timeline-label').evaluate(el => getComputedStyle(el).visibility), 'hidden')
			await press(hiddenLabelNode)
			assert.equal(await page.evaluate(() => game.saveSlots[0].stack[0].state.timestamp), times.at(-2))
			assert.equal(await page.evaluate(() => reloads.length), 1)
		})
		console.log(`${passed} checks passed. Artifacts: ${OUTPUT}`)
	} finally {
		for (const ctx of contexts) await ctx.close()
		await browser?.close(); await new Promise(resolve => server.close(resolve))
	}
}
main().catch(error => { console.error(error); process.exitCode = 1 })
