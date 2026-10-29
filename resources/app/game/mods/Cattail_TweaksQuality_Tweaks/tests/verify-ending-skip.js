'use strict'

// Real desktop 1.3 Game/Pinhole methods and browser DOM/events. World, audio,
// media readiness, timers, Loader API and slot I/O are isolated fixtures.
// No player profile, Steam, enabled list or real save files are opened.
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
const entry = path.join(ROOT, 'mods/Cattail_TweaksQuality_Tweaks/scripts/ending-skip.js')
const gameSource = fs.readFileSync(path.join(ROOT, 'scripts/game.js'), 'utf8')
const stuffSource = fs.readFileSync(path.join(ROOT, 'scripts/stuff.js'), 'utf8')
const pinholeSource = stuffSource.slice(stuffSource.indexOf('class Pinhole extends Entity{'), stuffSource.indexOf('class Gradient extends Entity{'))
assert.ok(pinholeSource.includes('this.master.quickFinish()'))
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mods/Cattail_TweaksQuality_Tweaks/mod.json'), 'utf8'))

function fixture() {
	const timers = [], frames = [], handlers = {}, writes = [], resetPromises = []
	let now = 0, gate
	window.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length }
	window.requestAnimationFrame = fn => { frames.push(fn); return frames.length }
	window.cancelAnimationFrame = () => {}
	Object.defineProperty(performance, 'now', { value: () => now })
	HTMLMediaElement.prototype.play = function () { this.__playing = true; return Promise.resolve() }
	HTMLMediaElement.prototype.pause = function () { this.__playing = false }
	window.abstract_getWords = () => ({ en: { credits: Array.from({ length: 49 }, (_, i) => 'Credit ' + i) } })
	window.ModLoader = { register(def) { def.init({
		config: { get: (_key, fallback) => new URLSearchParams(location.search).has('disabled') ? false : fallback },
		on(name, fn) { (handlers[name] ||= []).push(fn) },
		patch(target, name, factory) { target[name] = factory(target[name]) }
	}) } }
	window.h = {
		timers, frames, writes, resetPromises,
		frame(dt = 16) { now += dt; frames.splice(0).forEach(fn => fn(now)) },
		timer(delay) { const index = timers.findIndex(t => t.delay === delay); if (index < 0) throw new Error('No timer ' + delay); timers.splice(index, 1)[0].fn() },
		pending(delay) { return timers.filter(t => t.delay === delay).length },
		settle(ok = true) { ok ? gate.resolve() : gate.reject(new Error('fixture write failed')) },
		skip(detail = 1) {
			const button = document.querySelector('.cattail-ending-skip-button')
			if (!button || button.classList.contains('cattail-ending-skip-hidden')) throw new Error('Skip is hidden')
			button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))
		},
		counts() { return { panels: document.querySelectorAll('.orbResetWrap').length, credits: document.querySelectorAll('.credits').length, buttons: document.querySelectorAll('.orbResetButton').length, skips: document.querySelectorAll('.cattail-ending-skip-button').length, hidden: !!document.querySelector('.cattail-ending-skip-hidden') } },
		clickReward(index = 0) { document.querySelectorAll('.orbResetButton')[index].dispatchEvent(new MouseEvent('click', { bubbles: true })) },
		key(type, options = {}) {
			const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: ' ', code: 'Space', ...options })
			;(document.activeElement || document.body).dispatchEvent(event)
			return event.defaultPrevented
		},
		top() { return game.creditPillar.getBoundingClientRect().top },
		install() { for (const fn of handlers.afterGameInit || []) fn(undefined, game) },
		create(options = {}) {
			const persisted = options.persisted ? JSON.parse(localStorage.getItem('fixture-slot'))?.stack[0]?.permanents : null
			const credits = Array.from({ length: 49 }, (_, i) => 'Credit ' + i)
			const game = Object.create(Game.prototype)
			Object.assign(game, {
				version: options.version || '1.3', isMobile: !!options.mobile, language: 'en', completions: options.completions ?? persisted?.completions ?? 0,
				orbUpgrades: options.upgrades ?? persisted?.upgrades ?? 0, maxHoles: 6, orbUpgradeMap: [2, 1, 0], currentOrbPositions: ['orb', false],
				memorycomplex: true, unlockedMemoryStages: 2, currentMemoryComplexStage: 1, achiever: { fired: [true, false] },
				currentSlotId: 1, maxSaveStack: 3, saveSlots: [{ sentinel: 'untouched other slot' }, { stack: [
					{ isProtected: false, state: { beforeEnding: true }, permanents: { memory: [] } },
					{ isProtected: true, state: { protected: true }, permanents: {} },
					{ isProtected: false, state: { oldest: true }, permanents: {} }
				] }],
				stats: { gameIsFinished: false, totalResourcesMined: Array(10).fill(1), totalPlayTime: 1000 },
				entitiesInGame: {}, stuff: [{ name: 'machine', position: [2, 3] }, { name: 'flower', position: [4, 5] }],
				codex: { entities: { machine: { canPurchase: true }, flower: { canPurchase: true } } },
				store: { vessel: document.createElement('div'), html: {} }, messenger: { element: document.createElement('div') },
				hollowSite: {}, preventSaving: true, playSound() {}, playMusic() {}, createHollowEvent() {},
				pronounce(group, key) { return group === 'credits' ? credits : key }, makeReadable: value => String(value ?? 0),
				writeToSlot(slot, id) {
					writes.push({ id, slot: JSON.parse(JSON.stringify(slot)) })
					const pending = options.holdWrite ? new Promise((resolve, reject) => { gate = { resolve, reject } }) : Promise.resolve()
					return pending.then(() => localStorage.setItem('fixture-slot', JSON.stringify(slot)))
				}
			})
			// Observe the native promise without changing its body or reload callback.
			game.reset = function (...args) {
				const result = Game.prototype.reset.apply(this, args)
				resetPromises.push(result)
				result.catch(() => {}) // Expected write-failure scenario only.
				return result
			}
			window.game = game
			return game
		},
		finish() {
			const pinhole = Object.create(Pinhole.prototype)
			Object.assign(pinhole, { master: game, happened: false })
			game.entitiesInGame.pinhole = 1
			pinhole.init()
			this.frame()
		},
		movie() {
			Object.defineProperties(game.creditImage, { duration: { configurable: true, value: 60 }, currentTime: { configurable: true, writable: true, value: 10 } })
			game.creditImage.dispatchEvent(new Event('canplay'))
		},
		stageCredits() { this.finish(); this.skip(); this.movie(); this.frame(); this.skip(); this.frame() }
	}
}

const source = fs.readFileSync(entry, 'utf8')
const server = http.createServer((req, res) => {
	if (req.url.split('?')[0] !== '/') { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
	res.end('<!doctype html><meta charset="utf-8"><style>' + fs.readFileSync(path.join(ROOT, 'cascade.css'), 'utf8') + '</style>')
})
async function main() {
	assert.ok(manifest.entries.includes('scripts/ending-skip.js'))
	assert.equal(manifest.config.enableEndingSkip.default, true)
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.TWEAKS_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback) })
	let passed = 0
	const setup = async (options = {}, install = true) => {
		const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
		const page = await context.newPage()
		page.errors = []
		page.on('pageerror', e => page.errors.push(e.message))
		await page.goto(address + (options.disabled ? '/?disabled' : '/'))
		await page.addScriptTag({ content: gameSource })
		await page.addScriptTag({ content: 'class Entity {}\n' + pinholeSource })
		await page.evaluate(fixture)
		await page.addScriptTag({ content: source })
		await page.evaluate(options => { h.create(options); if (options.install) h.install() }, { ...options, install })
		return page
	}
	const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name) }
	const close = async page => { assert.deepEqual(page.errors, []); await page.context().close() }
	try {
		await check('animation and movie skip expose return without changing growth or reward timing', async () => {
			const page = await setup()
			await page.evaluate(() => h.stageCredits())
			assert.deepEqual(await page.evaluate(() => h.counts()), { panels: 0, credits: 1, buttons: 0, skips: 1, hidden: false })
			assert.equal(await page.getByRole('button', { name: 'Return to this run' }).count(), 1)
			assert.deepEqual(await page.evaluate(() => [game.completions, game.orbUpgrades, h.writes.length, game.halt, game.credits.style.visibility, h.pending(50000)]), [0, 0, 0, true, '', 1])
			await close(page)
		})
		await check('normal play is untouched and a double-click does not skip an extra stage', async () => {
			const page = await setup()
			assert.deepEqual(await page.evaluate(() => [h.counts().hidden, game.credits, h.counts().panels, h.writes.length]), [true, undefined, 0, 0])
			await page.evaluate(() => { h.finish(); h.skip(); h.skip(2); h.frame() })
			assert.equal(await page.getByRole('button', { name: 'Skip movie' }).count(), 1)
			assert.deepEqual(await page.evaluate(() => [game.creditImage.style.display, h.counts().panels]), ['', 0])
			await close(page)
		})
		await check('real mouse clicks reach skip and native reward through the actual CSS layers', async () => {
			const page = await setup({ holdWrite: true })
			await page.evaluate(() => h.finish())
			const clickCenter = async selector => {
				const point = await page.locator(selector).evaluate(element => {
					const b = element.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2
					if (!element.contains(document.elementFromPoint(x, y))) throw new Error('Control is covered')
					return { x, y }
				})
				await page.mouse.click(point.x, point.y)
			}
			await clickCenter('.cattail-ending-skip-button')
			await page.evaluate(() => { h.movie(); h.frame() })
			await clickCenter('.cattail-ending-skip-button')
			await page.evaluate(() => { h.timer(50000); h.frame() })
			assert.equal(await page.locator('.cattail-ending-skip-button').isVisible(), true)
			await clickCenter('.orbResetButton')
			assert.equal(await page.locator('.cattail-ending-skip-button').isVisible(), false)
			assert.deepEqual(await page.evaluate(() => [game.completions, h.writes.length, h.pending(400)]), [1, 1, 0])
			await page.evaluate(async () => { h.settle(); await Promise.all(h.resetPromises) })
			await close(page)
		})
		await check('a naturally ended movie exposes return while native rewards coexist', async () => {
			const page = await setup()
			await page.evaluate(() => {
				h.finish(); h.skip(); h.movie()
				Object.defineProperty(game.creditImage, 'ended', { value: true })
				game.creditImage.dispatchEvent(new Event('ended')); h.timer(50000); h.frame()
			})
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().hidden, game.completions, h.writes.length]), [1, false, 0, 0])
			assert.equal(await page.getByRole('button', { name: 'Return to this run' }).count(), 1)
			await close(page)
		})
		await check('native first-run choice persists growth/memory to current slot before actual reload', async () => {
			const page = await setup({ holdWrite: true })
			await page.evaluate(() => { h.stageCredits(); h.timer(50000); h.clickReward(); h.clickReward() })
			const result = await page.evaluate(() => ({ completions: game.completions, writes: h.writes, reloads: h.pending(400), other: game.saveSlots[0] }))
			assert.equal(result.completions, 1)
			assert.equal(result.reloads, 0)
			assert.equal(result.writes.length, 1)
			assert.equal(result.writes[0].id, 1)
			assert.deepEqual(result.other, { sentinel: 'untouched other slot' })
			const stack = result.writes[0].slot.stack
			assert.equal(stack.length, 3)
			assert.equal(stack[0].state, null)
			assert.equal(stack[2].isProtected, true)
			assert.deepEqual(stack[0].permanents, { glory: [true, false], completions: 1, upgrades: 0, orbUpgradeMap: [2, 1, 0], memorycomplex: true, memory: [{ entityName: 'machine', position: [2, 3] }], lastOrbPositions: ['orb', false], unlockedMemoryStages: 2, currentMemoryComplexStage: 1 })
			await page.evaluate(async () => { h.settle(); await Promise.all(h.resetPromises) })
			assert.equal(await page.evaluate(() => h.pending(400)), 1)
			await Promise.all([page.waitForEvent('load'), page.evaluate(() => h.timer(400))])
			assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-slot')).stack[0].permanents.completions), 1)
			await close(page)
		})
		for (const [count, upgrades, button, expected] of [[1, 0, 0, [2, 0]], [1, 0, 1, [2, 1]], [6, 0, 0, [7, 1]], [6, 1, 0, [7, 1]]]) {
			await check(`native later-run reward count=${count} upgrades=${upgrades} choice=${button}`, async () => {
				const page = await setup({ completions: count, upgrades, holdWrite: true })
				await page.evaluate(() => h.finish())
				assert.equal(await page.evaluate(() => h.counts().buttons), count + 1 - upgrades <= 6 ? 2 : 1)
				assert.equal(await page.evaluate(() => h.counts().hidden), true)
				await page.evaluate(button => { h.clickReward(button); h.clickReward(0); game.deployOrbElement(true); game.watchCredits(); h.frame() }, button)
				assert.deepEqual(await page.evaluate(() => [game.completions, game.orbUpgrades]), expected)
				assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().credits, h.writes.length, h.pending(400)]), [1, 0, 1, 0])
				await page.evaluate(async () => { h.settle(); await Promise.all(h.resetPromises) })
				await close(page)
			})
		}
		await check('early skip and native 20/50-second callbacks cannot duplicate rewards', async () => {
			const page = await setup()
			await page.evaluate(() => { h.stageCredits(); h.timer(20000); h.timer(50000); game.deployOrbElement(); game.watchCredits(); h.frame() })
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().credits, game.lastDialogue, h.writes.length]), [1, 1, true, 0])
			await close(page)
		})
		await check('natural credits retain native timing and keep skip when rewards appear', async () => {
			const page = await setup()
			await page.evaluate(() => { h.finish(); game.watchCredits(); h.movie(); h.frame(); h.timer(20000) })
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, game.lastDialogue]), [0, true])
			await page.evaluate(() => { h.timer(50000); h.frame() })
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().hidden, game.credits.style.visibility, game.completions]), [1, false, '', 0])
			await close(page)
		})
		await check('reward panel created before afterGameInit is adopted, including native startup quickFinish', async () => {
			const page = await setup({ completions: 3, holdWrite: true }, false)
			await page.evaluate(() => { h.finish(); h.install(); h.install(); game.quickFinish(); game.watchCredits(); h.frame(); h.clickReward(1); h.clickReward(0) })
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().credits, h.counts().skips, h.counts().hidden, game.completions, game.orbUpgrades, h.writes.length]), [1, 0, 1, true, 4, 1, 1])
			await page.evaluate(async () => { h.settle(); await Promise.all(h.resetPromises) })
			await close(page)
		})
		await check('slow/unknown media and late canplay cannot restart a skipped movie', async () => {
			const page = await setup()
			await page.evaluate(() => { h.finish(); h.skip(); h.frame(); h.skip(); game.creditImage.dispatchEvent(new Event('canplay')); h.frame() })
			assert.deepEqual(await page.evaluate(() => [game.creditImage.__playing, game.creditImage.style.display, h.counts().panels]), [false, 'none', 0])
			await page.evaluate(() => { h.timer(50000); game.creditImage.dispatchEvent(new Event('canplay')); h.frame() })
			assert.equal(await page.evaluate(() => game.creditImage.__playing), false)
			await close(page)
		})
		await check('failed native write cannot trigger reload or a second reward mutation', async () => {
			const page = await setup({ completions: 2, holdWrite: true })
			await page.evaluate(async () => { h.finish(); h.clickReward(1); h.settle(false); await Promise.allSettled(h.resetPromises); h.clickReward(0); game.deployOrbElement(true) })
			assert.deepEqual(await page.evaluate(() => [game.completions, game.orbUpgrades, h.writes.length, h.pending(400), h.counts().panels, localStorage.getItem('fixture-slot')]), [3, 1, 1, 0, 1, null])
			await close(page)
		})
		for (const rewardVisible of [false, true]) {
			await check('return actually reloads the existing save without settlement; rewards=' + rewardVisible, async () => {
				const count = rewardVisible ? 3 : 0
				const page = await setup({ completions: count, upgrades: rewardVisible ? 1 : 0 })
				await page.evaluate(rewardVisible => {
					game.saveSlots[1].stack[0].permanents = { completions: game.completions, upgrades: game.orbUpgrades, marker: 'existing growth' }
					localStorage.setItem('fixture-slot', JSON.stringify(game.saveSlots[1]))
					sessionStorage.setItem('return-before', JSON.stringify(game.saveSlots))
					// Replay credits directly for the existing-growth case. Normal
					// later-run Pinhole/quickFinish remains separately covered above.
					game.watchCredits(); h.movie(); h.frame(); h.skip(); h.frame()
					if (rewardVisible) h.timer(50000)
				}, rewardVisible)
				await Promise.all([page.waitForEvent('load'), page.evaluate(() => {
					const button = document.querySelector('.cattail-ending-skip-button')
					h.skip()
					if (h.counts().panels) h.clickReward()
					button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
					game.deployOrbElement(); game.watchCredits()
					sessionStorage.setItem('return-observed', JSON.stringify({ slots: game.saveSlots, count: game.completions, upgrades: game.orbUpgrades, writes: h.writes.length, reset: h.resetPromises.length, reloadTimers: h.pending(400), panels: h.counts().panels }))
				})])
				const data = await page.evaluate(() => ({ before: JSON.parse(sessionStorage.getItem('return-before')), observed: JSON.parse(sessionStorage.getItem('return-observed')), saved: JSON.parse(localStorage.getItem('fixture-slot')) }))
				assert.deepEqual(data.observed.slots, data.before)
				assert.deepEqual(data.saved, data.before[1])
				assert.deepEqual([data.observed.count, data.observed.upgrades, data.observed.writes, data.observed.reset, data.observed.reloadTimers, data.observed.panels], [count, rewardVisible ? 1 : 0, 0, 0, 0, rewardVisible ? 1 : 0])
				await close(page)
			})
		}
		await check('native reward write locks return immediately and stays locked on failure', async () => {
			const page = await setup({ holdWrite: true })
			await page.evaluate(() => {
				h.stageCredits(); h.timer(50000); h.key('keydown'); h.clickReward()
				document.querySelector('.cattail-ending-skip-button').click()
				h.frame(100)
			})
			assert.deepEqual(await page.evaluate(() => [game.completions, h.writes.length, h.pending(400), h.counts().hidden]), [1, 1, 0, true])
			await page.evaluate(async () => {
				h.settle(false); await Promise.allSettled(h.resetPromises)
				document.querySelector('.cattail-ending-skip-button').click(); h.clickReward()
			})
			assert.deepEqual(await page.evaluate(() => [game.completions, h.writes.length, h.pending(400), localStorage.getItem('fixture-slot')]), [1, 1, 0, null])
			await close(page)
		})
		await check('holding Space moves credits exactly 10x; repeat does not stack and release restores 1x', async () => {
			const page = await setup()
			await page.evaluate(() => h.stageCredits())
			await page.locator('.cattail-ending-skip-button').focus()
			const move = async () => page.evaluate(() => { const before = h.top(); h.frame(100); return before - h.top() })
			assert.ok(Math.abs(await move() - 2) < .05)
			await page.keyboard.down('Space')
			assert.ok(Math.abs(await move() - 20) < .05)
			await page.keyboard.down('Space')
			assert.ok(Math.abs(await move() - 20) < .05)
			await page.keyboard.up('Space')
			assert.ok(Math.abs(await move() - 2) < .05)
			assert.deepEqual(await page.evaluate(() => [game.creditImage.currentTime, h.pending(20000), h.pending(50000), h.counts().panels, h.writes.length, game.lastDialogue ?? false]), [60, 1, 1, 0, 0, false])
			await close(page)
		})
		await check('fast scrolling before movie skip adds to its offset and never speeds the movie', async () => {
			const page = await setup()
			const movement = await page.evaluate(() => {
				h.finish(); h.skip(); h.movie(); h.frame()
				const start = h.top()
				h.key('keydown'); h.frame(100); h.key('keyup')
				const accelerated = h.top(), movieTime = game.creditImage.currentTime
				h.skip()
				return [start - accelerated, accelerated - h.top(), movieTime, document.querySelectorAll('.cattail-ending-skip-credit-offset').length]
			})
			assert.ok(Math.abs(movement[0] - 20) < .05)
			assert.ok(Math.abs(movement[1] - 1000) < .05)
			assert.deepEqual(movement.slice(2), [10, 1])
			await close(page)
		})
		for (const boundary of ['blur', 'hidden', 'input', 'editable', 'modifier']) {
			await check('Space acceleration clears on ' + boundary, async () => {
				const page = await setup()
				const result = await page.evaluate(boundary => {
					h.stageCredits(); h.key('keydown'); h.frame(100)
					if (boundary === 'blur') window.dispatchEvent(new Event('blur'))
					if (boundary === 'hidden') {
						Object.defineProperty(document, 'hidden', { configurable: true, value: true })
						document.dispatchEvent(new Event('visibilitychange'))
						Object.defineProperty(document, 'hidden', { configurable: true, value: false })
						document.dispatchEvent(new Event('visibilitychange'))
					}
					if (boundary === 'input' || boundary === 'editable') {
						const input = document.createElement(boundary === 'input' ? 'input' : 'div')
						if (boundary === 'editable') input.contentEditable = 'true'
						document.body.append(input); input.focus()
					}
					if (boundary === 'modifier') h.key('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true })
					h.key('keydown', { repeat: true }) // Held keys must not rearm after focus returns.
					const before = h.top(); h.frame(100)
					return before - h.top()
				}, boundary)
				assert.ok(Math.abs(result - 2) < .05, 'expected native speed after ' + boundary + ', got ' + result)
				await close(page)
			})
		}
		await check('editable text and modifier shortcuts keep their Space key and do not accelerate', async () => {
			const page = await setup()
			const results = await page.evaluate(() => {
				h.stageCredits()
				const values = []
				for (const tag of ['input', 'textarea', 'select', 'editable', 'textbox']) {
					const input = document.createElement(['editable', 'textbox'].includes(tag) ? 'div' : tag)
					if (tag === 'editable') input.contentEditable = 'true'
					if (tag === 'textbox') { input.setAttribute('role', 'textbox'); input.tabIndex = 0 }
					document.body.append(input); input.focus()
					const before = h.top(), prevented = h.key('keydown'); h.frame(100)
					values.push([prevented, h.key('keyup'), before - h.top()]); input.remove()
				}
				for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing']) {
					const before = h.top(), prevented = h.key('keydown', { [modifier]: true }); h.frame(100)
					values.push([prevented, h.key('keyup', { [modifier]: true }), before - h.top()])
				}
				return values
			})
			for (const [down, up, distance] of results) { assert.equal(down, false); assert.equal(up, false); assert.ok(Math.abs(distance - 2) < .05) }
			await close(page)
		})
		await check('real Space typing is preserved in an input during credits', async () => {
			const page = await setup()
			await page.evaluate(() => { h.stageCredits(); const input = document.createElement('input'); input.id = 'typing'; document.body.append(input); input.focus() })
			await page.keyboard.type('a b')
			assert.equal(await page.locator('#typing').inputValue(), 'a b')
			await close(page)
		})
		await check('accelerated credits finish without auto-return or early rewards; return stays clickable', async () => {
			const page = await setup()
			await page.evaluate(() => {
				h.stageCredits(); game.language = 'modsch'; h.frame(); h.key('keydown')
				for (let i = 0; i < 100 && game.creditPillar.getBoundingClientRect().bottom >= 0; i++) h.frame(1000)
				h.key('keyup'); h.frame()
			})
			assert.equal(await page.getByRole('button', { name: '返回本周目' }).isVisible(), true)
			assert.deepEqual(await page.evaluate(() => [game.creditPillar.getBoundingClientRect().bottom < 0, h.counts().panels, h.writes.length, h.pending(50000)]), [true, 0, 0, 1])
			await page.evaluate(() => { h.timer(50000); h.frame() })
			assert.deepEqual(await page.evaluate(() => [h.counts().panels, h.counts().hidden, game.completions, h.writes.length]), [1, false, 0, 0])
			await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '返回本周目' }).click()])
			await close(page)
		})
		await check('ordinary play and credits removal release Space ownership', async () => {
			const page = await setup()
			assert.deepEqual(await page.evaluate(() => [h.key('keydown'), h.key('keyup')]), [false, false])
			await page.evaluate(() => { h.stageCredits(); h.key('keydown'); game.credits.remove(); h.frame(100); h.key('keyup') })
			assert.deepEqual(await page.evaluate(() => [h.key('keydown'), h.key('keyup')]), [false, false])
			await page.evaluate(() => { document.querySelector('.cattail-ending-skip-button').remove(); h.frame() })
			assert.deepEqual(await page.evaluate(() => [h.key('keydown'), h.key('keyup')]), [false, false])
			await close(page)
		})
		await check('disabled setting leaves native methods and UI untouched', async () => {
			const page = await setup({ disabled: true })
			assert.equal(await page.evaluate(() => game.deployOrbElement === Game.prototype.deployOrbElement && game.watchCredits === Game.prototype.watchCredits), true)
			await page.evaluate(() => h.finish())
			assert.deepEqual(await page.evaluate(() => [h.counts().skips, h.counts().panels, game.stats.gameIsFinished]), [0, 0, true])
			await close(page)
		})
		for (const options of [{ version: '1.2.1' }, { mobile: true }]) {
			await check('unsupported game keeps native flow: ' + JSON.stringify(options), async () => {
				const page = await setup(options)
				assert.equal(await page.evaluate(() => h.counts().skips), 0)
				assert.equal(await page.evaluate(() => game.deployOrbElement === Game.prototype.deployOrbElement), true)
				await close(page)
			})
		}
		console.log('ENDING_SKIP_OK=' + passed)
	} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1 })
