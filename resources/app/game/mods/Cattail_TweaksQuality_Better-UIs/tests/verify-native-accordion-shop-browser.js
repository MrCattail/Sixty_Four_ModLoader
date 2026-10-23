'use strict'

// Real Store, Loader and the two existing Tweaks consumers; only world data,
// preference I/O and native menu/game actions are synthetic. No player profile.
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
const MOD_ROOT = process.env.BETTER_UI_MOD_ROOT || path.resolve(__dirname, '..')
const MOD = 'Cattail_TweaksQuality_Better-UIs'
const TWEAKS = 'Cattail_TweaksQuality_Tweaks'
const entries = ['scripts/classic-shop.js', 'scripts/shop-categories.js', 'scripts/native-accordion-shop.js']
const tweaksEntries = ['scripts/escape-action-fix.js', 'scripts/eraser-tier-icon-fix.js']
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const source = fs.readFileSync(path.join(ROOT, 'scripts/ui.js'), 'utf8')
const storeSource = source.slice(source.indexOf('class Store {'), source.indexOf('class Shop {'))
const codexSource = fs.readFileSync(path.join(ROOT, 'scripts/codex.js'), 'utf8')
const classes = [...new Set([...codexSource.matchAll(/class:\s*(\w+)/g)].map(match => match[1]))]
const output = process.env.BETTER_UI_NATIVE_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'better-ui-native-shop-'))
fs.mkdirSync(output, { recursive: true })

function fixture() {
	const q = new URLSearchParams(location.search)
	localStorage.setItem('modloader:Cattail_TweaksQuality_Better-UIs:config:shopVersion', JSON.stringify(q.get('shop') || '1.3'))
	window.boot = async () => {
		window.game = {
			version: q.has('old') ? '1.2.1' : '1.3', language: 'en', isMobile: q.has('mobile'), plane: false,
			codex: abstract_getCodex(), unlockedEntities: {}, entitiesInGame: { mega3: 1 }, onlyones: {}, resources: Array(10).fill(10000),
			prices: {}, picks: [], worldClicks: 0, menuCalls: 0, eraserType: 2, splash: { isShown: false },
			getRealPrice(name) { return this.prices[name] || [2, 3] }, makeReadable: value => String(value),
			pronounce(group, id, part) { return part === 'description' ? this.language + ': Description for ' + id : part === 'name' ? this.language + ': ' + id : 'NEW' },
			pickupItem(name) { this.picks.push(name); this.interactionMode = 'build'; this.itemInHand = { name } },
			pickupEraser() { this.interactionMode = 'erase' }, cleanupErase() {}, cleanupRelocation() {}
		}
		for (const [id, entity] of Object.entries(game.codex.entities)) { if (entity.canPurchase) game.unlockedEntities[id] = true; entity.shouldUnlock = () => false }
		await ModLoader.stage('afterVanillaScripts', game)
		window.addEventListener('keydown', event => { if (event.key === 'Escape') game.menuCalls++ })
		game.store = new DesktopStoreVersion(document.querySelector('.store'), game)
		game.store.compositionUpdate(); game.store.visibilityUpdate()
		await ModLoader.stage('afterGameInit', game)
		document.body.addEventListener('mousedown', () => game.worldClicks++)
		window.ready = true
	}
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	let body, type = 'text/javascript'
	if (url.pathname === '/') {
		type = 'text/html'
		body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>@font-face{font-family:Montserrat;src:url(/font/Montserrat-Regular.woff2)}body{background:#b9b9c0}</style><div class="store"></div><script src="/codex.js"></script><script src="/store.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')();boot().catch(error=>{window.bootError=error.stack})</script>'
	} else if (url.pathname === '/mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: url.searchParams.get('order') === 'tweaks-first' ? [TWEAKS, MOD] : [MOD, TWEAKS] })
	} else if (url.pathname === '/mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ ...manifest, entries })
	} else if (url.pathname === '/mods/' + TWEAKS + '/mod.json') {
		type = 'application/json'; body = JSON.stringify({ id: TWEAKS, name: 'Isolated Tweaks consumers', version: '0.1.0', entries: tweaksEntries, config: {} })
	} else if (url.pathname === '/store.js') body = storeSource
	else if (url.pathname === '/codex.js') body = classes.map(name => 'const ' + name + ' = class {};').join('\n') + '\n' + codexSource
	else {
		const relative = decodeURIComponent(url.pathname.slice(1))
		const prefix = 'mods/' + MOD + '/'
		const target = relative.startsWith(prefix) ? path.resolve(MOD_ROOT, relative.slice(prefix.length)) : path.resolve(ROOT, relative)
		const permitted = ['cascade.css', 'modloader/loader.js', ...entries.map(e => prefix + e), ...tweaksEntries.map(e => 'mods/' + TWEAKS + '/' + e)].includes(relative) || /^(img|font)\/[\w./-]+$/.test(relative)
		if (permitted && (target.startsWith(ROOT + path.sep) || target.startsWith(MOD_ROOT + path.sep)) && fs.existsSync(target) && fs.statSync(target).isFile()) {
			body = fs.readFileSync(target)
			type = ({ '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(target)] || type
		}
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type }); res.end(body)
})

async function main() {
	assert.ok(manifest.entries.includes('scripts/native-accordion-shop.js'))
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const executablePath = process.env.BETTER_UI_BROWSER || (fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback)
	const browser = await playwright.chromium.launch({ headless: true, executablePath, ignoreDefaultArgs: ['--hide-scrollbars'] })
	const contexts = [], errors = [], results = []
	const filter = process.env.BETTER_UI_NATIVE_TEST_FILTER ? new RegExp(process.env.BETTER_UI_NATIVE_TEST_FILTER) : null
	const check = async (name, fn) => { if(filter&&!filter.test(name))return; await fn(); results.push(name); console.log('PASS ' + name) }
	const setup = async (query = '') => {
		const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context)
		const page = await context.newPage()
		page.on('pageerror', error => errors.push(error.stack))
		await context.route('**/*', route => {
			if (!route.request().url().startsWith(origin + '/')) return route.abort()
			if (route.request().url().endsWith('/mods/enabled.json') && query.includes('tweaks-first')) return route.continue({ url: origin + '/mods/enabled.json?order=tweaks-first' })
			return route.continue()
		})
		await page.goto(origin + query)
		await page.waitForFunction(() => window.ready || window.bootError)
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		return page
	}
	const header = (page, id) => page.locator('[data-native-type="' + id + '"]')
	const settle = async page => {
		await page.waitForTimeout(300)
		// Automatic positioning settles before side entries start their flight.
		await page.waitForFunction(() => [...document.querySelectorAll('.cattail-native-category-shortcut')].every(node => node.getAnimations().every(a => a.playState !== 'running')))
	}
	try {
		const page = await setup()
		await check('default native layout and two registered corner controls', async () => {
			assert.equal(await page.locator('.cattail-native-shop-toggle').count(), 2)
			assert.equal(await page.locator('.modloader-ui-dock .cattail-native-shop-toggle').count(), 2)
			assert.equal(await page.locator('.cattail-native-accordion').count(), 0)
			assert.equal(await page.locator('.store > .element').count(), 11)
			await page.evaluate(() => { window.originalCards = { ...game.store.html.items }; window.originalHandlers = Object.fromEntries(Object.entries(originalCards).map(([id, card]) => [id, card.onmousedown])) })
		})
		await check('live style switch retains real cards, purchase handlers and icon geometry', async () => {
			await page.locator('.cattail-native-style').click()
			assert.equal(await page.locator('.cattail-native-shop-scroll > .element').count(), 9)
			assert.equal(await page.evaluate(() => Object.entries(game.store.html.items).every(([id, card]) => card === originalCards[id] && card.onmousedown === originalHandlers[id])), true)
			const before = await header(page, 'extractors').boundingBox()
			await header(page, 'extractors').hover(); await settle(page)
			const after = await header(page, 'extractors').boundingBox()
			assert.ok(after.width > before.width * 2)
			assert.ok(Math.abs(after.x + after.width - before.x - before.width) < 1)
			const pills = await page.locator('.cattail-native-category-label:visible').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(), s = getComputedStyle(node.closest('.cattail-native-category-panel')), i = node.querySelector('.cattail-native-category-icon').getBoundingClientRect(); return { w:r.width,h:r.height,radius:parseFloat(s.borderRadius),iw:i.width,ih:i.height } }))
			assert.ok(pills.length > 1 && pills.every(p => p.w > p.h && Math.abs(p.radius - p.h / 2) < .1 && p.iw === p.ih && Math.abs(p.iw - p.h) < .1))
			await page.screenshot({ path:path.join(output, 'all-capsules.png') })
		})
		await check('category clicks expand downward, once at a time, with one outer scroller', async () => {
			await header(page, 'extractors').click(); await settle(page)
			assert.ok(Math.abs((await header(page,'extractors').boundingBox()).y-8)<1,'opening aligns the header with an eight-pixel top gap')
			assert.equal(await page.evaluate(() => game.store.isOpen), true)
			assert.equal(await page.locator('.cattail-native-shop-scroll > .element:not(.closed)').count(), 1)
			assert.equal(await page.evaluate(() => getComputedStyle(game.store.html.types.extractors.wrap).overflowY), 'visible')
			const layout = await page.evaluate(() => { const s = document.querySelector('.cattail-native-shop-scroll'), h = document.querySelector('[data-native-type="extractors"]').getBoundingClientRect(), c = game.store.html.items.pump.getBoundingClientRect(); return { gutter:s.offsetWidth-s.clientWidth, overflow:s.scrollHeight>s.clientHeight, below:c.top>=h.bottom, right:innerWidth-s.getBoundingClientRect().right } })
			assert.deepEqual(layout, { gutter:14,overflow:true,below:true,right:8 })
		})
		await check('expanded header and real cards form one connected panel with a shared width',async()=>{
			const panel=await page.evaluate(()=>{
				const t=game.store.html.types.extractors,h=t.button.querySelector('.cattail-native-category-label'),hr=h.getBoundingClientRect(),hs=getComputedStyle(h)
				const cards=[...t.wrap.querySelectorAll('.item:not(.hidden)')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {top:r.top,bottom:r.bottom,width:r.width,left:r.left,radius:s.borderRadius,shadow:s.boxShadow}})
				return {header:{top:hr.top,bottom:hr.bottom,width:hr.width,left:hr.left},bottomLeft:parseFloat(hs.borderBottomLeftRadius),bottomRight:parseFloat(hs.borderBottomRightRadius),cards,font:parseFloat(getComputedStyle(h.querySelector('.cattail-native-category-title')).fontSize),base:parseFloat(getComputedStyle(game.store.vessel).fontSize)}
			})
			assert.ok(panel.cards.length>2)
			assert.ok(Math.abs(panel.cards[0].top-panel.header.bottom)<.1)
			assert.equal(panel.bottomLeft,0);assert.equal(panel.bottomRight,0)
			for(let i=0;i<panel.cards.length;i++){
				const c=panel.cards[i];assert.ok(Math.abs(c.width-panel.header.width)<.1&&Math.abs(c.left-panel.header.left)<.1)
				assert.equal(c.radius,'0px');assert.equal(c.shadow,'none')
				if(i)assert.ok(Math.abs(c.top-panel.cards[i-1].bottom)<.1,'no gaps between real cards')
			}
			assert.ok(Math.abs(panel.font/panel.base-1.1)<.01,'category labels grow by ten percent when space permits')
		})
		await check('whole column wheels and scrollbar drags; tools stay in their side column and dock stays fixed', async () => {
			const toolBefore = await page.locator('.store > .eraser').boundingBox(), dockBefore = await page.locator('.cattail-native-style').boundingBox()
			const headerBefore = await header(page,'extractors').boundingBox()
			await header(page, 'extractors').hover(); await page.mouse.wheel(0, 550); await settle(page)
			assert.ok(await page.locator('.cattail-native-shop-scroll').evaluate(el => el.scrollTop) > 100)
			assert.ok((await header(page,'extractors').boundingBox()).y < headerBefore.y - 100)
			const toolAfter=await page.locator('.store > .eraser').boundingBox()
			assert.equal(toolAfter.x,toolBefore.x);assert.equal(toolAfter.width,toolBefore.width)
			assert.deepEqual(await page.locator('.cattail-native-style').boundingBox(), dockBefore)
			const box = await page.locator('.cattail-native-shop-scroll').boundingBox()
			const thumb = await page.locator('.cattail-native-shop-scroll').evaluate(el => ({ y:el.scrollTop * el.clientHeight / el.scrollHeight, height:el.clientHeight * el.clientHeight / el.scrollHeight, scroll:el.scrollTop }))
			const start = box.y + thumb.y + thumb.height / 2
			await page.mouse.move(box.x + box.width - 7, start); await page.mouse.down(); await page.mouse.move(box.x + box.width - 7, start + 90, { steps:8 }); await page.mouse.up()
			assert.ok(await page.locator('.cattail-native-shop-scroll').evaluate(el => el.scrollTop) > thumb.scroll + 100)
		})
		await check('native card purchase, prices/counters, disabled guard and world input isolation', async () => {
			await page.evaluate(() => game.store.centerItem('pump')); await settle(page)
			await page.locator('.cattail-native-shop-scroll .item').filter({ hasText:'en: pump' }).first().click()
			assert.deepEqual(await page.evaluate(() => ({ picks:game.picks,world:game.worldClicks })), { picks:['pump'],world:0 })
			await page.evaluate(() => { delete game.itemInHand; delete game.interactionMode; game.prices.pump=[27,13]; game.entitiesInGame.pump=4; game.store.compositionUpdate(); game.store.visibilityUpdate() })
			assert.equal(await page.evaluate(() => game.store.html.counters.pump.textContent), '4')
			assert.deepEqual(await page.evaluate(() => [...game.store.html.priceContainers.pump.querySelectorAll('.priceString')].map(el=>el.textContent)), ['27','13'])
			await page.evaluate(() => { game.resources.fill(0); game.store.visibilityUpdate() })
			await page.evaluate(() => game.store.html.items.pump.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})))
			assert.deepEqual(await page.evaluate(() => ({ picks:game.picks.length,world:game.worldClicks,open:game.store.isOpen })), { picks:1,world:0,open:true })
			await page.evaluate(() => { game.resources.fill(10000); game.store.visibilityUpdate() })
		})
		await check('description toggle includes new items; persists with style on reload and in native layout', async () => {
			await page.locator('.cattail-native-descriptions').click()
			assert.equal(await page.evaluate(() => Object.values(game.store.html.items).filter(card=>card.classList.contains('newItem')).every(card=>getComputedStyle(card.querySelector('.itemDescription')).display==='none')), true)
			await page.reload(); await page.waitForFunction(()=>window.ready)
			assert.equal(await page.locator('.cattail-native-accordion').count(), 1)
			assert.equal(await page.locator('.cattail-native-descriptions').getAttribute('aria-pressed'), 'true')
			await page.locator('.cattail-native-style').click()
			assert.equal(await page.locator('.store > .element').count(), 11)
			assert.equal(await page.evaluate(() => Object.values(game.store.html.items).every(card=>getComputedStyle(card.querySelector('.itemDescription')).display==='none')), true)
			await page.locator('.cattail-native-descriptions').click()
			assert.equal(await page.evaluate(() => Object.values(game.store.html.items).every(card=>getComputedStyle(card.querySelector('.itemDescription')).display!=='none')), true)
			await page.locator('.cattail-native-style').click()
		})
		await check('2 seconds requires closed categories AND no hover; re-entry resets the full delay', async () => {
			// Keep RPC/rendering time from consuming the final millisecond.
			await page.clock.install({time:new Date('2026-10-21T00:00:00Z')})
			await page.clock.pauseAt(new Date('2026-10-21T00:00:01Z'))
			await header(page,'extractors').dispatchEvent('pointerenter');await page.locator('.store').dispatchEvent('pointerenter');await page.locator('.store').dispatchEvent('pointerleave')
			await page.clock.fastForward(1999)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),1)
			await header(page,'extractors').dispatchEvent('pointerenter'); await page.locator('.store').dispatchEvent('pointerenter')
			await page.clock.fastForward(40000)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),1)
			await page.locator('.store').dispatchEvent('pointerleave'); await page.clock.fastForward(1999)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),1)
			await page.clock.fastForward(1)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),0)
			await page.evaluate(()=>game.store.centerItem('pump')); await page.clock.fastForward(100)
			await page.locator('.store').dispatchEvent('pointerleave'); await page.clock.fastForward(60000)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),1)
			await page.evaluate(()=>game.store.closeTypes()); await page.clock.fastForward(2000)
			assert.equal(await page.locator('.cattail-native-labels-wide').count(),0)
			await page.clock.resume()
		})
		await check('20 language rebuilds retain open category/scroll and regenerate titles/buttons without duplicates', async () => {
			await page.evaluate(()=>game.store.centerItem('pump')); await settle(page)
			const languages = Object.keys(manifest.translations)
			assert.equal(languages.length,20)
			const titles=[]
			for(const language of languages) {
				await page.evaluate(language=>{ game.language=language; game.store.reinit() },language)
				await page.waitForTimeout(40)
				assert.equal(await page.locator('.cattail-native-shop-toggle').count(),2)
				assert.equal(await page.locator('.cattail-native-category-label').count(),9)
				assert.equal(await page.locator('.store > .cattail-native-category-rail').count(),1)
				assert.equal(await page.locator('.cattail-native-category-shortcut').count(),9)
				assert.equal(await page.evaluate(()=>game.store.isOpen),true)
				assert.equal(await page.locator('.store > .eraser').evaluate(el=>el.classList.contains('iii')),true)
				const label=await header(page,'extractors').getAttribute('aria-expanded'); assert.equal(label,'true')
				titles.push(await header(page,'extractors').textContent())
				assert.ok(await page.locator('.cattail-native-style').getAttribute('aria-label'))
			}
			assert.ok(new Set(titles).size>=15)
		})
		await check('visible categories, locked/onlyone items and reality/chasm follow native updates', async () => {
			await page.evaluate(()=>{ game.language='en'; game.plane=true; game.store.visibilityUpdate() }); await settle(page)
			assert.deepEqual(await page.locator('.cattail-native-category-label:visible').evaluateAll(nodes=>nodes.map(n=>n.dataset.nativeType)),['dark'])
			await header(page,'dark').click(); await settle(page)
			assert.equal(await page.evaluate(()=>game.store.html.items.scan.getClientRects().length>0),true)
			await page.evaluate(()=>{ game.plane=false; game.onlyones.pump=true; game.store.visibilityUpdate() })
			assert.equal(await page.evaluate(()=>game.store.html.items.pump.classList.contains('hidden')),true)
			await page.evaluate(()=>{ delete game.onlyones.pump; delete game.unlockedEntities.pump; game.store.reinit() })
			assert.equal(await page.evaluate(()=>game.store.html.items.pump.classList.contains('hidden')),true)
			await page.evaluate(()=>{ game.unlockedEntities.pump=true; game.store.visibilityUpdate() })
		})
		await check('HUD capture/restoration survives hidden language rebuild, including whole-column scroll', async () => {
			await page.evaluate(()=>game.store.centerItem('pump')); await settle(page)
			await page.evaluate(()=>{ document.querySelector('.cattail-native-shop-scroll').scrollTop=190; ModLoader.ui.hud.hide(); game.language='sch'; game.store.reinit() })
			assert.equal(await page.locator('.store').evaluate(el=>getComputedStyle(el).pointerEvents),'none')
			await page.evaluate(()=>ModLoader.ui.hud.show()); await settle(page)
			assert.equal(await page.evaluate(()=>game.store.isOpen),true)
			assert.equal(await page.locator('.cattail-native-shop-scroll').evaluate(el=>Math.round(el.scrollTop)),190)
			for(const key of ['pinhole','credits']) { await page.evaluate(key=>{game[key]=true;game.store.visibilityUpdate()},key); assert.equal(await page.locator('.cattail-native-style').isVisible(),false); await page.evaluate(key=>{delete game[key];game.store.visibilityUpdate()},key) }
		})
		await check('real Tweaks Esc consumer keeps tool/category/menu layers and eraser tier after reinit', async () => {
			await page.evaluate(()=>{ delete game.itemInHand; game.interactionMode='erase' })
			await page.keyboard.press('Escape')
			assert.deepEqual(await page.evaluate(()=>({mode:game.interactionMode||null,open:game.store.isOpen,menus:game.menuCalls})),{mode:null,open:true,menus:0})
			await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>game.store.isOpen),false)
			await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>game.menuCalls),1)
		})
		await check('viewport/long-label layout has stable cards/gutter and preserves capsule ends', async () => {
			for(const [width,height,language] of [[1440,900,'en'],[1440,900,'sch'],[1000,700,'ru'],[640,720,'thai']]) {
				await page.setViewportSize({width,height})
				await page.evaluate(language=>{game.language=language;game.store.reinit();game.store.closeTypes()},language)
				const collapsed=await header(page,'extractors').boundingBox()
				await header(page,'extractors').click(); await settle(page)
				const measure=await page.evaluate(()=>{const s=document.querySelector('.cattail-native-shop-scroll'),r=s.getBoundingClientRect(),h=document.querySelector('[data-native-type="extractors"]'),hr=h.getBoundingClientRect(),t=h.querySelector('.cattail-native-category-title'),tr=t.getBoundingClientRect(),ir=h.querySelector('.cattail-native-category-icon').getBoundingClientRect(),tool=game.store.html.eraser.getBoundingClientRect();return {left:r.left,right:r.right,gutter:s.offsetWidth-s.clientWidth,headerRight:hr.right,titleRight:tr.left+t.scrollWidth,iconLeft:ir.left,toolLeft:tool.left,toolRight:tool.right,body:document.documentElement.scrollLeft}})
				assert.ok(measure.left>=0&&measure.right<=width&&measure.toolLeft>=0&&measure.toolRight<=measure.left)
				assert.ok(Math.abs(measure.headerRight-collapsed.x-collapsed.width)<1)
				assert.equal(measure.gutter,14); assert.equal(measure.body,0)
				assert.ok(measure.titleRight<=measure.iconLeft+2,JSON.stringify(measure))
				await page.screenshot({path:path.join(output,'accordion-'+width+'-'+language+'.png')})
			}
		})
		await check('switch back restores direct native DOM, panel geometry and original purchase handler',async()=>{
			await page.locator('.cattail-native-style').click()
			assert.equal(await page.locator('.store > .element').count(),11)
			assert.equal(await page.locator('.cattail-native-shop-scroll').count(),0)
			assert.equal(await page.locator('.cattail-native-category-items').count(),0)
			await page.evaluate(()=>game.store.centerItem('pump')); await settle(page)
			assert.equal(await page.evaluate(()=>getComputedStyle(game.store.html.types.extractors.wrap).overflowY),'auto')
		})
		await check('opposite consumer load order, repeated reinit and Store replacement clean up controls',async()=>{
			const other=await setup('?tweaks-first=1')
			await other.locator('.cattail-native-style').click()
			await other.evaluate(()=>{ for(let i=0;i<5;i++)game.store.reinit();game.store=new DesktopStoreVersion(document.querySelector('.store'),game);game.store.compositionUpdate();game.store.visibilityUpdate() })
			assert.equal(await other.locator('.cattail-native-shop-toggle').count(),2)
			assert.equal(await other.locator('.cattail-native-category-label').count(),9)
			assert.equal(await other.locator('.store > .cattail-native-category-rail').count(),1)
			assert.equal(await other.locator('.cattail-native-category-shortcut').count(),9)
			assert.equal(await other.locator('.store .element').count(),11)
			await other.evaluate(()=>{game.store.reinit();game.store.centerItem('pump')}); await settle(other)
			assert.equal(await other.locator('.store > .eraser').evaluate(el=>el.classList.contains('iii')),true)
			await other.keyboard.press('Escape'); assert.equal(await other.evaluate(()=>game.store.isOpen),false)
		})
		await check('classic, mobile and unsupported versions do not acquire the new view',async()=>{
			for(const query of ['?shop=1.2.1','?mobile=1','?old=1']) { const off=await setup(query); assert.equal(await off.locator('.cattail-native-shop-toggle,#cattail-native-shop-style').count(),0) }
		})
		await check('closed category rows match native vertical coordinates across progress, plane and viewport changes',async()=>{
			const aligned=await setup()
			await aligned.evaluate(()=>{window.allUnlocks={...game.unlockedEntities}})
			for(const [width,height,world]of [[1440,900,'all'],[1000,700,'early'],[640,720,'dark']]){
				await aligned.setViewportSize({width,height})
				await aligned.evaluate(world=>{game.plane=world==='dark';game.unlockedEntities=world==='early'?{pump:true}:{...allUnlocks};game.entitiesInGame.mega3=world==='early'?0:1;game.store.reinit();game.store.closeTypes()},world)
				const native=await aligned.evaluate(()=>Object.fromEntries([...Object.entries(game.store.html.types).filter(([,t])=>!t.button.classList.contains('hidden')).map(([id,t])=>[id,t.button.getBoundingClientRect().top]),...['eraser','relocator'].filter(id=>!game.store.html[id].classList.contains('hidden')).map(id=>[id,game.store.html[id].getBoundingClientRect().top])]))
				await aligned.locator('.cattail-native-style').click();await settle(aligned)
				const custom=await aligned.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.cattail-native-category-label')].filter(n=>n.getClientRects().length&&!n.closest('.hidden')).map(n=>[n.dataset.nativeType,n.getBoundingClientRect().top]).concat(['eraser','relocator'].filter(id=>!game.store.html[id].classList.contains('hidden')).map(id=>[id,game.store.html[id].getBoundingClientRect().top]))))
				assert.deepEqual(Object.keys(custom),Object.keys(native))
				for(const id of Object.keys(native))assert.ok(Math.abs(native[id]-custom[id])<.6,JSON.stringify({world,id,native:native[id],custom:custom[id]}))
				await aligned.screenshot({path:path.join(output,'native-aligned-'+width+'-'+world+'.png')})
				await aligned.locator('.cattail-native-style').click()
			}
		})
		let morphSamples
		await check('one rounded shell extends its bottom cap down and retracts it without fading',async()=>{
			const morph=await setup()
			// One visible card keeps the moving bottom cap on screen in every
			// screenshot; both native tool controls remain available in this fixture.
			await morph.evaluate(()=>{game.unlockedEntities={pump:true};game.store.reinit()})
			await morph.locator('.cattail-native-style').click()
			await header(morph,'extractors').hover();await settle(morph)
			const sample=()=>{
				const t=game.store.html.types.extractors,p=t.button.querySelector('.cattail-native-category-panel'),h=t.button.querySelector('.cattail-native-category-label'),i=h.querySelector('.cattail-native-category-icon'),pr=p.getBoundingClientRect(),hr=h.getBoundingClientRect(),ir=i.getBoundingClientRect(),s=getComputedStyle(p)
				return {top:pr.top,bottom:pr.bottom,height:pr.height,header:hr.top,icon:ir.top,radius:parseFloat(s.borderBottomLeftRadius),topRadius:parseFloat(s.borderTopLeftRadius),opacity:getComputedStyle(t.wrap).opacity,gap:parseFloat(getComputedStyle(game.store.vessel).fontSize),side:[...document.querySelectorAll('.cattail-native-category-shortcut.is-visible')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}),tool:Object.fromEntries(['eraser','relocator'].map(id=>{const r=game.store.html[id].getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))}
			}
			const closed=await morph.evaluate(sample)
			const record=async(direction)=>{
				// Isolate the cap animation from the separately verified scroll motion.
				await morph.evaluate(()=>{game.store.html.types.extractors.button.dispatchEvent(new MouseEvent('mousedown'));document.querySelector('.cattail-native-shop-scroll').dispatchEvent(new WheelEvent('wheel'))})
				await morph.evaluate(()=>{void game.store.html.types.extractors.wrap.offsetHeight;window.morphAnimations=document.getAnimations();morphAnimations.forEach(a=>a.pause())})
				const samples=[]
				for(const time of [0,60,120,180,240]){
					await morph.evaluate(time=>morphAnimations.forEach(a=>{a.currentTime=time}),time)
					const current=await morph.evaluate(sample);samples.push(current)
					assert.ok(Math.abs(current.top-closed.top)<.1&&Math.abs(current.header-closed.header)<.1&&Math.abs(current.icon-closed.icon)<.1,JSON.stringify({direction,time,current,closed}))
					assert.ok(Math.abs(current.radius-closed.height/2)<.1&&Math.abs(current.topRadius-current.radius)<.1)
					assert.equal(current.opacity,'1')
					await morph.screenshot({path:path.join(output,'morph-'+direction+'-'+time+'.png')})
				}
				await morph.evaluate(()=>morphAnimations.forEach(a=>a.finish()))
				return samples
			}
			const opening=await record('open'),closing=await record('close')
			assert.ok(Math.abs(opening[0].height-closed.height)<1)
			for(let i=1;i<5;i++){assert.ok(opening[i].bottom>opening[i-1].bottom);assert.ok(closing[i].bottom<closing[i-1].bottom)}
			assert.ok(opening[4].height>closed.height*3)
			assert.ok(Math.abs(closing[4].height-closed.height)<1)
			morphSamples={closed,opening,closing}
		})
		await check('tools move left with opening and return to the original category column on close',async()=>{
			for(const id of ['eraser','relocator']){
				const {closed,opening,closing}=morphSamples
				const end=opening[4],tool=end.tool[id],top=Math.min(...end.side.map(r=>r.top)),bottom=Math.max(...end.side.map(r=>r.bottom))
				assert.equal(end.side.length,1,'the current category supplies one centered side entrance')
				assert.ok(tool.y+tool.height+end.gap<=top+.6||tool.y>=bottom+end.gap-.6,'the tool must clear the persistent current entrance')
				if(Math.abs(tool.y-closed.tool[id].y)>.6)assert.ok(closed.tool[id].y<bottom+end.gap&&closed.tool[id].y+tool.height+end.gap>top||id==='relocator','vertical movement requires category or preceding-tool pressure')
				assert.ok(opening[4].tool[id].x+opening[4].tool[id].width<opening[0].tool[id].x)
				for(let n=1;n<5;n++){assert.ok(opening[n].tool[id].x<opening[n-1].tool[id].x);assert.ok(closing[n].tool[id].x>closing[n-1].tool[id].x)}
				assert.ok(Math.abs(closing[4].tool[id].x-closed.tool[id].x)<.1)
				assert.ok(Math.abs(closing[4].tool[id].y-closed.tool[id].y)<.1)
			}
		})
		await check('every available category including the last short list aligns at eight pixels and closing restores native rows',async()=>{
			const nav=await setup()
			const native=await nav.evaluate(()=>Object.fromEntries(Object.entries(game.store.html.types).filter(([,t])=>!t.button.classList.contains('hidden')).map(([id,t])=>[id,t.button.getBoundingClientRect().top])))
			await nav.locator('.cattail-native-style').click()
			for(const id of Object.keys(native)){
				await header(nav,id).dispatchEvent('mousedown');await settle(nav)
				assert.ok(Math.abs((await header(nav,id).boundingBox()).y-8)<1,id+' must align even when the remaining list is short')
				assert.equal(await nav.evaluate(()=>document.scrollingElement.scrollTop),0)
			}
			await nav.evaluate(()=>game.store.closeTypes());await settle(nav)
			for(const [id,y]of Object.entries(native))assert.ok(Math.abs((await header(nav,id).boundingBox()).y-y)<.6)
			assert.equal(await nav.locator('.cattail-native-category-shortcut.is-visible').count(),0)
		})
		await check('smooth category positioning is interruptible by the user and is not a sticky header',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click()
			const before=(await header(nav,'extractors').boundingBox()).y
			await header(nav,'extractors').dispatchEvent('mousedown');await nav.waitForTimeout(60)
			const during=(await header(nav,'extractors').boundingBox()).y
			assert.ok(during<before&&during>8)
			await nav.locator('.cattail-native-shop-scroll').dispatchEvent('wheel')
			const interrupted=await nav.locator('.cattail-native-shop-scroll').evaluate(s=>{s.scrollTop+=90;return s.scrollTop})
			await settle(nav)
			assert.ok(Math.abs(await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop)-interrupted)<1)
			assert.ok(Math.abs((await header(nav,'extractors').boundingBox()).y-8)>5)
		})
		await check('Alt one to seven has a fixed mapping, preserves actual native Alt handling and ignores repeat or blocked contexts',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click()
			const gameSource=fs.readFileSync(path.join(ROOT,'scripts/game.js'),'utf8'),start=gameSource.indexOf('//Keyboard events',gameSource.indexOf('setListenersDesktop(){')),end=gameSource.indexOf('//Wheel events',start)
			assert.ok(start>0&&end>start)
			await nav.evaluate(code=>new Function(code).call(game),gameSource.slice(start,end))
			const ids=['extractors','destabilizers','resonators','converters','storage','uniques','default']
			for(let i=0;i<7;i++){
				await nav.keyboard.down('Alt');assert.equal(await nav.evaluate(()=>game.altActive),true)
				await nav.keyboard.press('Digit'+(i+1));await nav.keyboard.up('Alt');await settle(nav)
				assert.equal(await nav.evaluate(()=>game.altActive),false)
				assert.equal(await header(nav,ids[i]).getAttribute('aria-expanded'),'true')
				const top=(await header(nav,ids[i]).boundingBox()).y
				assert.ok(Math.abs(top-8)<1,JSON.stringify({id:ids[i],top}))
			}
			await nav.keyboard.press('Alt+Digit7');await settle(nav)
			assert.equal(await header(nav,'default').getAttribute('aria-expanded'),'true','an already open shortcut repositions without closing')
			await nav.evaluate(()=>{game.store.closeTypes();window.savedUnlocks={...game.unlockedEntities};game.unlockedEntities={pump:true};game.entitiesInGame.mega3=0;game.store.reinit()});await settle(nav)
			await nav.keyboard.press('Alt+Digit2');assert.equal(await nav.evaluate(()=>game.store.isOpen),false)
			await nav.keyboard.press('Alt+Digit1');await settle(nav);assert.equal(await header(nav,'extractors').getAttribute('aria-expanded'),'true')
			await nav.evaluate(()=>{game.unlockedEntities={...savedUnlocks};game.entitiesInGame.mega3=1;game.store.reinit();game.store.closeTypes()});await settle(nav)
			for(const state of ['input','editable','menu','modal','hud','native','chasm']){
				await nav.evaluate(state=>{
					if(state==='input'||state==='editable'){const e=document.createElement(state==='input'?'input':'div');e.id='key-target';if(state==='editable')e.contentEditable='true';document.body.append(e);e.focus()}
					if(state==='menu')game.splash.isShown=true
					if(state==='modal'){const e=document.createElement('div');e.id='key-target';e.setAttribute('aria-modal','true');document.body.append(e)}
					if(state==='hud')ModLoader.ui.hud.hide()
					if(state==='chasm'){game.plane=true;game.store.visibilityUpdate()}
				},state)
				if(state==='native')await nav.locator('.cattail-native-style').click()
				await nav.keyboard.press('Alt+Digit1');assert.equal(await nav.evaluate(()=>game.store.isOpen),false,state)
				await nav.evaluate(()=>{document.getElementById('key-target')?.remove();game.splash.isShown=false;ModLoader.ui.hud.show();game.plane=false;game.store.visibilityUpdate()})
				if(state==='native')await nav.locator('.cattail-native-style').click()
			}
			for(const options of [{repeat:true},{shiftKey:true},{ctrlKey:true},{metaKey:true},{isComposing:true}])await nav.evaluate(options=>document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,code:'Digit1',key:'1',altKey:true,...options})),options)
			assert.equal(await nav.evaluate(()=>game.store.isOpen),false)
		})
		await check('side entries match the current category plus offscreen headers, only the selected circle is yellow, and category titles stay white',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click();await header(nav,'extractors').click();await settle(nav)
			const verify=async()=>{
				const state=await nav.evaluate(()=>{const bounds=document.querySelector('.cattail-native-shop-scroll').getBoundingClientRect();return {expected:Object.entries(game.store.html.types).filter(([,t])=>{const r=t.button.querySelector('.cattail-native-category-label').getBoundingClientRect();return !t.button.classList.contains('hidden')&&(!t.button.classList.contains('closed')||r.bottom<=bounds.top||r.top>=bounds.bottom)}).map(([id])=>id),actual:[...document.querySelectorAll('.cattail-native-category-shortcut.is-visible')].map(e=>e.dataset.nativeProxy)}})
				assert.deepEqual(state.actual,state.expected);return state.actual
			}
			assert.ok((await verify()).length>1)
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90);await settle(nav)
			assert.ok((await verify()).includes('extractors'))
			assert.equal(await nav.locator('[data-native-proxy="extractors"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 233, 120)')
			assert.equal(await header(nav,'extractors').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)')
			const goldPoint=await nav.locator('[data-native-proxy="extractors"]').evaluate(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x+4),y:Math.round(r.y+r.height/2)}})
			const goldShot=await nav.screenshot({path:path.join(output,'only-side-circle-yellow.png')})
			assert.deepEqual(await nav.evaluate(async({data,p})=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(p.x,p.y,1,1).data]},{data:goldShot.toString('base64'),p:goldPoint}),[255,233,120,255])
			const target=(await verify()).find(id=>id!=='extractors')
			await nav.locator('[data-native-proxy="'+target+'"]').click();await settle(nav)
			assert.equal(await header(nav,target).getAttribute('aria-expanded'),'true');assert.ok(Math.abs((await header(nav,target).boundingBox()).y-8)<1)
			assert.deepEqual(await nav.evaluate(()=>({picks:game.picks,world:game.worldClicks})),{picks:[],world:0})
			await verify()
			assert.equal(await nav.locator('[data-native-proxy="'+target+'"].is-visible').count(),1,'the selected category stays on the left when its title is visible')
			const sample=await nav.locator('[data-native-type="'+target+'"] .cattail-native-category-icon').evaluate(e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x+4),y:Math.round(r.y+r.height/2)}})
			const shot=await nav.screenshot({path:path.join(output,'navigation-side-selection.png')})
			const pixel=await nav.evaluate(async({data,p})=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(p.x,p.y,1,1).data]},{data:shot.toString('base64'),p:sample})
			assert.deepEqual(pixel,[255,255,255,255],'the original category icon and title remain white')
		})
		await check('navigation survives rapid switching, twenty locale rebuilds, HUD restoration and Store replacement without stale rail or shortcut hints',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click()
			await nav.locator('#modloader-shortcut-button').click()
			await nav.waitForFunction(()=>document.querySelectorAll('.modloader-shortcut-row').length===7)
			assert.equal(await nav.locator('.modloader-shortcut-row').count(),7)
			for(const language of Object.keys(manifest.translations)){
				await nav.evaluate(language=>{game.language=language;game.store.reinit()},language)
				await nav.keyboard.press('Alt+Digit1');await settle(nav)
				assert.ok(Math.abs((await header(nav,'extractors').boundingBox()).y-8)<1)
				assert.equal(await nav.locator('.store > .cattail-native-category-rail').count(),1)
				assert.ok(await nav.locator('.cattail-native-category-shortcut.is-visible').count()>0)
				assert.equal(await nav.locator('.modloader-shortcut-row').count(),7)
				assert.equal(await nav.locator('.modloader-shortcut-description').first().textContent(),await header(nav,'extractors').textContent())
			}
			await nav.keyboard.press('Alt+Digit1');await nav.keyboard.press('Alt+Digit2');await nav.keyboard.press('Alt+Digit5');await settle(nav)
			assert.equal(await header(nav,'storage').getAttribute('aria-expanded'),'true');assert.ok(Math.abs((await header(nav,'storage').boundingBox()).y-8)<1)
			await nav.evaluate(()=>{game.store.centerItem('pump');document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'5',code:'Digit5',altKey:true}))});await settle(nav)
			assert.equal(await header(nav,'storage').getAttribute('aria-expanded'),'true');assert.ok(Math.abs((await header(nav,'storage').boundingBox()).y-8)<1,'new category intent wins over a pending native item focus')
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=80);await settle(nav)
			const saved=await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop)
			await nav.evaluate(()=>{ModLoader.ui.hud.hide();game.language='modsch';game.store.reinit();ModLoader.ui.hud.show()});await settle(nav)
			assert.ok(Math.abs(await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop)-saved)<1)
			await nav.evaluate(()=>{game.store=new DesktopStoreVersion(document.querySelector('.store'),game);game.store.compositionUpdate();game.store.visibilityUpdate()});await nav.keyboard.press('Alt+Digit1');await settle(nav)
			assert.equal(await nav.locator('.store > .cattail-native-category-rail').count(),1);assert.equal(await nav.locator('.cattail-native-category-shortcut').count(),9)
			assert.equal(await nav.locator('.modloader-shortcut-row').count(),7)
			await nav.locator('.cattail-native-style').click();await settle(nav)
			assert.equal(await nav.locator('.modloader-shortcut-row:visible').count(),0)
		})
		const prepareInactiveFlight=async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click();await header(nav,'storage').click();await settle(nav)
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=document.querySelector('[data-native-type="extractors"]').getBoundingClientRect().top-8);await settle(nav)
			return nav
		}
		await check('side entries travel in two axes from their own title icon to the centered slot and back to the icon',async()=>{
			const nav=await prepareInactiveFlight()
			const existing=await nav.locator('.cattail-native-category-shortcut.is-visible').first().getAttribute('data-native-proxy')
			const selector='[data-native-proxy="'+existing+'"]',before=await nav.locator(selector).boundingBox()
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90)
			await nav.waitForFunction(()=>document.querySelector('[data-native-proxy="extractors"]').classList.contains('is-visible'))
			const capture=async direction=>{
				await nav.evaluate(()=>{window.sideAnimations=document.getAnimations().filter(a=>a.effect.target.matches('.cattail-native-category-shortcut,.store > .eraser,.store > .relocator'));sideAnimations.forEach(a=>a.pause())})
				const points=[]
				for(const time of [0,120,240]){await nav.evaluate(time=>sideAnimations.forEach(a=>{a.currentTime=time}),time);points.push({proxy:await nav.locator('[data-native-proxy="extractors"]').boundingBox(),icon:await nav.locator('[data-native-type="extractors"] .cattail-native-category-icon').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y}}),other:await nav.locator(selector).boundingBox()});await nav.screenshot({path:path.join(output,'side-'+direction+'-'+time+'.png')})}
				await nav.evaluate(()=>sideAnimations.forEach(a=>a.finish()));return points
			}
			const entering=await capture('enter')
			assert.ok(Math.abs(entering[0].proxy.x-entering[0].icon.x)<1&&Math.abs(entering[0].proxy.y-entering[0].icon.y)<1)
			assert.ok(entering[2].proxy.x<entering[0].proxy.x-40&&entering[1].proxy.x<entering[0].proxy.x&&entering[1].proxy.x>entering[2].proxy.x)
			assert.ok(entering[1].proxy.y>entering[0].proxy.y&&entering[1].proxy.y<entering[2].proxy.y)
			assert.ok(entering[2].other.y>before.y+before.height*.45,'inserting at the top moves existing entries by half a slot to retain the group center')
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop-=90)
			await nav.waitForFunction(()=>!document.querySelector('[data-native-proxy="extractors"]').classList.contains('is-visible'))
			const exiting=await capture('exit')
			assert.ok(Math.abs(exiting[2].proxy.x-exiting[2].icon.x)<1&&Math.abs(exiting[2].proxy.y-exiting[2].icon.y)<1)
			assert.ok(exiting[1].proxy.x>exiting[0].proxy.x&&exiting[1].proxy.y<exiting[0].proxy.y)
			assert.ok(Math.abs(exiting[2].other.y-before.y)<1)
			await nav.waitForTimeout(30)
			assert.equal(await nav.locator('[data-native-proxy="extractors"]').evaluate(e=>getComputedStyle(e).visibility),'hidden')
			assert.equal(await nav.locator('[data-native-type="extractors"] .cattail-native-category-icon').evaluate(e=>getComputedStyle(e).visibility),'visible')
		})
		await check('category buttons remain vertically centered as membership changes, while tools move only for collisions and then recover',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click();await header(nav,'extractors').click();await nav.waitForTimeout(550)
			const inspect=()=>{
				const group=[...document.querySelectorAll('.cattail-native-category-shortcut.is-visible')].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left}}),root=document.querySelector('.store'),r=root.getBoundingClientRect()
				return {height:innerHeight,top:Math.min(...group.map(e=>e.top)),bottom:Math.max(...group.map(e=>e.bottom)),group,em:parseFloat(getComputedStyle(root).fontSize),tools:['eraser','relocator'].map(id=>{const b=game.store.html[id].getBoundingClientRect();return {id,top:b.top,bottom:b.bottom,native:parseFloat(root.style.getPropertyValue('--native-'+id+'-top'))+r.top}})}
			}
			for(const amount of [0,90,-90]){
				if(amount)await nav.locator('.cattail-native-shop-scroll').evaluate((s,n)=>s.scrollTop+=n,amount)
				await nav.waitForTimeout(350)
				const s=await nav.evaluate(inspect);assert.ok(s.group.length>2);assert.ok(Math.abs((s.top+s.bottom)/2-s.height/2)<1)
				for(const t of s.tools){assert.ok(t.bottom+s.em<=s.top+.6||t.top>=s.bottom+s.em-.6);assert.ok(t.top>=0&&t.bottom<=s.height);if(Math.abs(t.top-t.native)>.6)assert.ok(t.native<s.bottom+s.em&&t.native+(t.bottom-t.top)+s.em>s.top||t.id==='relocator')}
				assert.ok(s.tools[0].bottom+s.em<=s.tools[1].top+.6)
			}
			await nav.evaluate(()=>{game.unlockedEntities={pump:true};game.store.reinit();game.store.closeTypes()});await settle(nav)
			const native=await nav.evaluate(()=>Object.fromEntries(['eraser','relocator'].map(id=>[id,game.store.html[id].getBoundingClientRect().top])))
			await header(nav,'extractors').click();await nav.waitForTimeout(550)
			assert.equal(await nav.locator('.cattail-native-category-shortcut.is-visible').count(),1)
			const single=await nav.evaluate(inspect);assert.ok(Math.abs((single.top+single.bottom)/2-single.height/2)<1)
			for(const tool of single.tools)assert.ok(tool.bottom+single.em<=single.top+.6||tool.top>=single.bottom+single.em-.6)
			await nav.locator('[data-native-proxy="extractors"]').click();await settle(nav)
			assert.equal(await nav.locator('.cattail-native-category-shortcut.is-visible').count(),0)
			for(const id of ['eraser','relocator'])assert.ok(Math.abs((await nav.locator('.store > .'+id).boundingBox()).y-native[id])<.6)
		})
		await check('insufficient room below the centered group moves earlier tools above it without overlap or changing tool order',async()=>{
			const nav=await setup();await nav.setViewportSize({width:1000,height:640});await nav.locator('.cattail-native-style').click();await header(nav,'extractors').click();await settle(nav)
			assert.ok(Math.abs((await header(nav,'extractors').boundingBox()).y-8)<1,'top gap refers to the screen even below native CSS min-height')
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90);await nav.waitForTimeout(550)
			const s=await nav.evaluate(()=>{const rects=[...document.querySelectorAll('.cattail-native-category-shortcut.is-visible')].map(e=>e.getBoundingClientRect());const e=game.store.html.eraser.getBoundingClientRect(),r=game.store.html.relocator.getBoundingClientRect();return {top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom)),eraser:{top:e.top,bottom:e.bottom},relocator:{top:r.top,bottom:r.bottom},height:innerHeight}})
			assert.ok(Math.abs((s.top+s.bottom)/2-320)<1)
			assert.ok(s.eraser.bottom<s.top&&s.relocator.top>s.bottom,JSON.stringify(s));assert.ok(s.eraser.top>=8&&s.relocator.bottom<=s.height-8)
			await nav.screenshot({path:path.join(output,'centered-upward-fallback.png')})
			await nav.evaluate(()=>game.store.closeTypes());await nav.waitForTimeout(550)
			const recovered=await nav.evaluate(()=>['eraser','relocator'].map(id=>({id,actual:game.store.html[id].getBoundingClientRect().top,native:parseFloat(game.store.vessel.style.getPropertyValue('--native-'+id+'-top'))+game.store.vessel.getBoundingClientRect().top})))
			assert.ok(recovered.every(t=>Math.abs(t.actual-t.native)<.6),JSON.stringify(recovered))
		})
		await check('reversing a proxy flight continues from its current position and ends at the moving title icon',async()=>{
			const nav=await prepareInactiveFlight()
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90)
			await nav.waitForFunction(()=>document.querySelector('[data-native-proxy="extractors"]').classList.contains('is-visible'))
			const middle=await nav.locator('[data-native-proxy="extractors"]').evaluate(e=>{window.flight=e.getAnimations()[0];flight.pause();flight.currentTime=120;const r=e.getBoundingClientRect();return {x:r.x,y:r.y}})
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop-=90)
			await nav.waitForFunction(()=>!document.querySelector('[data-native-proxy="extractors"]').classList.contains('is-visible'))
			const restart=await nav.locator('[data-native-proxy="extractors"]').evaluate(e=>{window.flight=e.getAnimations()[0];flight.pause();flight.currentTime=0;const r=e.getBoundingClientRect();return {x:r.x,y:r.y}})
			assert.ok(Math.abs(restart.x-middle.x)<1&&Math.abs(restart.y-middle.y)<1,JSON.stringify({middle,restart}))
			await nav.evaluate(()=>{flight.currentTime=60;flight.play()})
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=15)
			await nav.waitForTimeout(400)
			const end=await nav.evaluate(()=>{const p=document.querySelector('[data-native-proxy="extractors"]'),i=document.querySelector('[data-native-type="extractors"] .cattail-native-category-icon'),a=p.getBoundingClientRect(),b=i.getBoundingClientRect();return {x:a.x-b.x,y:a.y-b.y,proxy:getComputedStyle(p).visibility,icon:getComputedStyle(i).visibility}})
			assert.ok(Math.abs(end.x)<1&&Math.abs(end.y)<1,JSON.stringify(end));assert.equal(end.proxy,'hidden');assert.equal(end.icon,'visible')
		})
		await check('cards render behind the transparent corner dock while buttons stay clickable above them',async()=>{
			const under=await setup();await under.locator('.cattail-native-style').click();await header(under,'extractors').click();await settle(under)
			const points=await under.evaluate(()=>{
				const a=document.querySelector('.cattail-native-descriptions').getBoundingClientRect(),b=document.querySelector('.cattail-native-style').getBoundingClientRect(),x=(a.right+b.left)/2,points=[]
				for(let y=a.top+5;y<a.bottom-3;y+=3)points.push({x:Math.floor(x),y:Math.floor(y),card:!!document.elementFromPoint(x,y)?.closest('.item')})
				const s=document.querySelector('.cattail-native-shop-scroll').getBoundingClientRect()
				return {points,bottom:s.bottom,height:innerHeight,buttons:[a,b].map(r=>document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.cattail-native-shop-toggle')!==null)}
			})
			assert.equal(points.bottom,points.height);assert.ok(points.buttons.every(Boolean));assert.ok(points.points.some(p=>p.card))
			const shot=await under.screenshot({path:path.join(output,'cards-behind-corner-dock.png')})
			const hasVisiblePixel=await under.evaluate(async({data,points})=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return points.filter(p=>p.card).some(p=>{const v=ctx.getImageData(p.x,p.y,1,1).data;return v[0]>235&&v[1]>235&&v[2]>235})},{data:shot.toString('base64'),points:points.points})
			assert.equal(hasVisiblePixel,true,'visible white card pixels must continue in the dock gap')
			await under.evaluate(()=>{game.store.centerItem('stabilizer2')});await settle(under)
			await under.evaluate(()=>{const s=document.querySelector('.cattail-native-shop-scroll');s.scrollTop=s.scrollHeight})
			assert.equal(await under.evaluate(()=>{const cards=[...game.store.html.types.default.wrap.querySelectorAll('.item:not(.hidden)')];return cards.at(-1).getBoundingClientRect().bottom<document.querySelector('.cattail-native-style').getBoundingClientRect().top}),true)
		})
		await check('approved modsch seven names are exact and sch/unlisted type labels stay intact',async()=>{
			const names=await setup();await names.locator('.cattail-native-style').click()
			const labels=async language=>{await names.evaluate(language=>{game.language=language;game.store.reinit()},language);return names.locator('.cattail-native-category-title').allTextContents()}
			assert.deepEqual(await labels('modsch'),['采集','解构','破坏','转换','存储','特殊','其他','完成','虚空'])
			assert.deepEqual(await labels('sch'),['采集设备','解稳设备','谐振设备','转换设备','存储设备','独特建筑','其他建筑','完成','虚空'])
			await names.evaluate(()=>{game.language='modsch';game.store.reinit();game.store.centerItem('pump')});await settle(names)
			await names.screenshot({path:path.join(output,'accordion-modsch.png')})
		})
		const navigationState = () => {
			const root=document.querySelector('.store'),scroller=document.querySelector('.cattail-native-shop-scroll'),bounds=scroller.getBoundingClientRect()
			const top=Math.max(0,bounds.top),bottom=Math.min(innerHeight,bounds.bottom),open=document.querySelector('.cattail-native-shop-scroll > .element:not(.closed):not(.hidden)')?.dataset.nativeCategory
			return {scroll:scroller.scrollTop,open,
				offscreen:Object.entries(game.store.html.types).filter(([,type])=>{const r=type.button.querySelector('.cattail-native-category-label').getBoundingClientRect();return !type.button.classList.contains('hidden')&&(r.bottom<=top||r.top>=bottom)}).map(([id])=>id),
				expected:open?Object.entries(game.store.html.types).filter(([,type])=>{const r=type.button.querySelector('.cattail-native-category-label').getBoundingClientRect();return !type.button.classList.contains('hidden')&&(!type.button.classList.contains('closed')||r.bottom<=top||r.top>=bottom)}).map(([id])=>id):[],
				buttons:[...document.querySelectorAll('[data-native-proxy]')].map(p=>{const r=p.getBoundingClientRect();return {id:p.dataset.nativeProxy,side:p.classList.contains('is-visible'),present:p.classList.contains('is-present'),goal:p.style.transform,x:r.x,y:r.y,selected:p.getAttribute('aria-pressed')==='true',color:getComputedStyle(p).backgroundColor}}),
				tools:['eraser','relocator'].map(id=>root.style.getPropertyValue('--native-side-'+id+'-top'))}
		}
		const sideIds=s=>s.buttons.filter(b=>b.side).map(b=>b.id)
		const prepareSide=async(viewport={width:1440,height:900},from='extractors')=>{
			const nav=await setup();await nav.setViewportSize(viewport);await nav.locator('.cattail-native-style').click()
			await nav.keyboard.press('Alt+Digit'+(from==='extractors'?'1':'5'));await settle(nav)
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90);await settle(nav)
			return nav
		}
		const startRecording=async nav=>nav.evaluate(read=>{
			window.readNavigation=new Function('return ('+read+')')();window.navigationTrace={frames:[],clicks:[]}
			document.addEventListener('mousedown',e=>{if(e.target.matches('[data-native-proxy]'))navigationTrace.clicks.push({t:performance.now(),id:e.target.dataset.nativeProxy})},true)
			const start=performance.now(),sample=now=>{
				navigationTrace.frames.push({t:now,...readNavigation()})
				if(now-start<850)requestAnimationFrame(sample);else window.navigationTraceDone=true
			};requestAnimationFrame(sample)
		},navigationState.toString())
		const clickSide=async(nav,id)=>{
			const r=await nav.locator('[data-native-proxy="'+id+'"]').boundingBox()
			await nav.mouse.click(r.x+r.width/2,r.y+r.height/2)
		}
		const finishRecording=async nav=>{
			await nav.waitForFunction(()=>window.navigationTraceDone)
			return nav.evaluate(()=>navigationTrace)
		}
		await check('real side clicks hold membership and tool slots through automatic positioning, then reconcile once without transient returns in eight window/category cases',async()=>{
			const reports=[]
			for(const viewport of [{width:1440,height:900},{width:1000,height:640}])for(const from of ['extractors','storage'])for(const choice of ['first','last']){
				const nav=await prepareSide(viewport,from),before=await nav.evaluate(navigationState),ids=sideIds(before).filter(id=>id!==from),target=choice==='first'?ids[0]:ids.at(-1)
				await startRecording(nav);await clickSide(nav,target);const trace=await finishRecording(nav),click=trace.clicks[0]
				assert.deepEqual(trace.clicks.map(e=>e.id),[target],'one real mouse press opens one category')
				const held=trace.frames.filter(f=>f.t>=click.t&&f.t-click.t<=220)
				assert.ok(held.length>3)
				assert.ok(held.some(f=>JSON.stringify(f.offscreen)!==JSON.stringify(before.offscreen)),'headers must actually cross the viewport during this capture')
				for(const f of held){
					assert.deepEqual(sideIds(f),sideIds(before),JSON.stringify({viewport,from,target,elapsed:f.t-click.t}))
					assert.deepEqual(f.tools,before.tools,'tools retain the same occupied category slots during positioning')
					for(const b of f.buttons.filter(b=>b.side)){
						const previous=before.buttons.find(p=>p.id===b.id)
						assert.equal(b.goal,previous.goal)
						assert.ok(Math.abs(b.x-previous.x)<1&&Math.abs(b.y-previous.y)<1,'settled side entries must not twitch during the hold')
					}
					const selected=f.buttons.find(b=>b.id===target);assert.equal(selected.selected,true);assert.equal(selected.color,'rgb(255, 233, 120)')
				}
				for(const id of sideIds(before)){
					const states=trace.frames.filter(f=>f.t>=click.t).map(f=>f.buttons.find(b=>b.id===id).side)
					assert.ok(states.filter((v,i)=>i&&v!==states[i-1]).length<=1,'an entry must not return and re-enter during automatic positioning: '+id)
				}
				const final=await nav.evaluate(navigationState);assert.equal(final.open,target);assert.deepEqual(sideIds(final),final.expected)
				assert.ok(Math.abs((await header(nav,target).boundingBox()).y-8)<1)
				assert.equal(final.buttons.find(b=>b.id===target).present,true,'the current target stays on the left after positioning')
				assert.equal(await header(nav,target).locator('.cattail-native-category-icon').evaluate(e=>getComputedStyle(e).visibility),'visible')
				reports.push({viewport,from,target,before,trace,final});await nav.context().close()
			}
			fs.writeFileSync(path.join(output,'automatic-side-click-frames.json'),JSON.stringify(reports,null,2))
		})
		await check('wheel, pointer, touch and scroll-key interruption release held side members on the next frame and never resume automatic positioning',async()=>{
			for(const event of ['wheel','pointerdown','touchstart','keydown']){
				const nav=await prepareSide()
				const result=await nav.evaluate(async({read,event})=>{
					const inspect=new Function('return ('+read+')')(),s=document.querySelector('.cattail-native-shop-scroll'),tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
					const initial=inspect();document.querySelector('[data-native-proxy="default"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}))
					await tick()
					const held=inspect()
					s.dispatchEvent(event==='keydown'?new KeyboardEvent(event,{bubbles:true,code:'ArrowDown',key:'ArrowDown'}):new Event(event,{bubbles:true}))
					// Finish only native height transitions so the remaining scroll
					// position is a stable observable of the user interruption.
					for(const type of Object.values(game.store.html.types))type.wrap.getAnimations().forEach(a=>a.finish())
					const label=document.querySelector('[data-native-type="default"]')
					s.scrollTop+=label.getBoundingClientRect().top-250
					await tick();return {initial,held,released:inspect()}
				},{read:navigationState.toString(),event})
				assert.deepEqual(sideIds(result.held),sideIds(result.initial))
				assert.deepEqual(sideIds(result.released),result.released.expected,event)
				assert.notDeepEqual(sideIds(result.released),sideIds(result.held),'the event must release the hold without another scroll event')
				assert.ok(Math.abs((await header(nav,'default').boundingBox()).y-250)<1)
				await settle(nav)
				assert.ok(Math.abs((await header(nav,'default').boundingBox()).y-250)<1,'cancelled automatic positioning must stay cancelled')
				await nav.context().close()
			}
		})
		await check('rapid side re-selection inherits the held slots and close, mode, reinit, HUD and Store replacement release them without stale state',async()=>{
			const nav=await prepareSide(),before=await nav.evaluate(navigationState)
			await startRecording(nav);await clickSide(nav,'default');await nav.waitForTimeout(55);await clickSide(nav,'destabilizers')
			const trace=await finishRecording(nav);assert.deepEqual(trace.clicks.map(e=>e.id),['default','destabilizers'])
			for(const f of trace.frames.filter(f=>f.t>=trace.clicks[0].t&&f.t<=trace.clicks[1].t+220))assert.deepEqual(sideIds(f),sideIds(before),'new intent must inherit displayed slots')
			const final=await nav.evaluate(navigationState);assert.equal(final.open,'destabilizers');assert.deepEqual(sideIds(final),final.expected);assert.ok(Math.abs((await header(nav,'destabilizers').boundingBox()).y-8)<1)
			fs.writeFileSync(path.join(output,'rapid-side-click-frames.json'),JSON.stringify({before,trace,final},null,2))
			await nav.context().close()
			for(const action of ['close','mode','reinit','hud','replace']){
				const nav=await prepareSide()
				await nav.evaluate(async action=>{
					document.querySelector('[data-native-proxy="default"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}))
					await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
					if(action==='close')game.store.closeTypes()
					if(action==='mode')document.querySelector('.cattail-native-style').click()
					if(action==='reinit')game.store.reinit()
					if(action==='hud'){ModLoader.ui.hud.hide();ModLoader.ui.hud.show()}
					if(action==='replace'){const root=game.store.vessel;game.store=new DesktopStoreVersion(root,game);game.store.compositionUpdate();game.store.visibilityUpdate()}
				},action)
				await settle(nav)
				if(action==='mode'){assert.equal(await nav.locator('.cattail-native-category-shortcut.is-present').count(),0);await nav.locator('.cattail-native-style').click();await settle(nav)}
				const state=await nav.evaluate(navigationState);assert.deepEqual(sideIds(state),state.expected,action)
				assert.equal(await nav.locator('.cattail-native-category-rail').count(),1)
				await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=80);await settle(nav)
				const scrolled=await nav.evaluate(navigationState);assert.deepEqual(sideIds(scrolled),scrolled.expected,'manual navigation after '+action+' has no old hold')
				await nav.context().close()
			}
		})
		const tooltipActive=page=>page.evaluate(()=>!!document.querySelector('#modloader-panel-tooltip.active'))
		const focusTooltip=async(page,selector)=>{
			await page.mouse.move(10,10)
			await page.evaluate(()=>document.activeElement?.blur())
			await page.locator(selector).focus()
			await page.waitForFunction(selector=>{const target=document.querySelector(selector),tip=document.querySelector('#modloader-panel-tooltip.active');return tip&&tip.textContent===target.dataset.modloaderPanelTooltip},selector)
		}
		const hoverTooltip=async(page,selector)=>{
			await page.mouse.move(10,10);await page.evaluate(()=>document.activeElement?.blur())
			await page.locator(selector).hover()
			await page.waitForFunction(selector=>{const target=document.querySelector(selector),tip=document.querySelector('#modloader-panel-tooltip.active');return tip&&tip.textContent===target.dataset.modloaderPanelTooltip},selector)
		}
		await check('Tooltip API covers only approved controls, removes native titles, and keeps real cards and native category/tool targets free of inherited tips',async()=>{
			const nav=await setup()
			for(const selector of ['.cattail-native-style','.cattail-native-descriptions']){
				const state=await nav.locator(selector).evaluate(e=>({text:e.dataset.modloaderPanelTooltip,label:e.getAttribute('aria-label'),delay:e.dataset.modloaderPanelTooltipDelayMs,theme:e.dataset.modloaderPanelTooltipTheme,title:e.hasAttribute('title')}))
				assert.deepEqual(state,{text:state.label,label:state.label,delay:'600',theme:'plane',title:false})
				assert.ok(state.text)
			}
			assert.equal(await nav.locator('.store [data-modloader-panel-tooltip]').count(),0)
			await nav.locator('.cattail-native-style').click();await settle(nav)
			const state=await nav.evaluate(()=>Object.entries(game.store.html.types).filter(([,t])=>!t.button.classList.contains('hidden')).map(([id,t])=>({id,text:t.button.querySelector('.cattail-native-category-label').dataset.modloaderPanelTooltip,parent:t.button.hasAttribute('data-modloader-panel-tooltip')})))
			assert.ok(state.length>1);assert.equal(state[0].text,'Extractors (Alt+1)');assert.ok(state.every(t=>!t.parent))
			for(const selector of ['.store > .eraser','.store > .relocator'])assert.ok(await nav.locator(selector).getAttribute('data-modloader-panel-tooltip'))
			await header(nav,'extractors').click();await settle(nav)
			assert.ok(await nav.locator('.cattail-native-category-shortcut.is-visible[data-modloader-panel-tooltip]').count()>1)
			assert.equal(await nav.locator('.cattail-native-category-shortcut[title],.cattail-native-shop-toggle[title]').count(),0)
			assert.equal(await nav.evaluate(()=>Object.values(game.store.html.items).some(card=>card.closest('[data-modloader-panel-tooltip]'))),false)
			await hoverTooltip(nav,'[data-native-type="extractors"]')
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'Extractors (Alt+1)')
			await nav.locator('.cattail-native-style').click();await settle(nav)
			assert.equal(await nav.locator('.store [data-modloader-panel-tooltip]').count(),0)
			assert.equal(await nav.locator('.cattail-native-shop-toggle[data-modloader-panel-tooltip]').count(),2)
			await nav.context().close()
		})
		await check('Tooltip pointer delay is exactly six hundred milliseconds across repeated native sync, with immediate focus, pointer following and edge flipping',async()=>{
			const nav=await setup();await settle(nav)
			await nav.clock.install({time:new Date('2026-10-22T00:00:00Z')});await nav.clock.pauseAt(new Date('2026-10-22T00:00:01Z'))
			await nav.evaluate(()=>{const e=document.querySelector('.cattail-native-descriptions'),r=e.getBoundingClientRect();window.tipPoint={x:r.x+r.width/2,y:r.y+r.height/2};e.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:tipPoint.x,clientY:tipPoint.y}))})
			await nav.clock.fastForward(599)
			await nav.evaluate(()=>{for(let i=0;i<8;i++)game.store.visibilityUpdate()})
			assert.equal(await tooltipActive(nav),false)
			await nav.clock.fastForward(1);await nav.clock.fastForward(17)
			assert.equal(await tooltipActive(nav),true,'native sync must not reattach and reset the pending reveal')
			const before=await nav.locator('#modloader-panel-tooltip').boundingBox()
			await nav.evaluate(()=>document.querySelector('.cattail-native-descriptions').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:tipPoint.x-4,clientY:tipPoint.y-3})))
			await nav.clock.fastForward(17)
			const after=await nav.locator('#modloader-panel-tooltip').boundingBox()
			assert.ok(Math.abs(after.x-before.x+4)<1&&Math.abs(after.y-before.y+3)<1)
			assert.ok(after.x>=10&&after.y>=10&&after.x+after.width<=1430&&after.y+after.height<=890)
			await nav.evaluate(()=>document.querySelector('.cattail-native-descriptions').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:document.body})))
			assert.equal(await tooltipActive(nav),false)
			await nav.evaluate(()=>document.querySelector('.cattail-native-style').focus());await nav.clock.fastForward(17)
			assert.equal(await tooltipActive(nav),true,'keyboard focus must not wait six hundred milliseconds')
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'Switch shop style')
			await nav.evaluate(()=>document.activeElement.blur());assert.equal(await tooltipActive(nav),false)
			await nav.evaluate(()=>{const e=document.querySelector('.cattail-native-descriptions'),r=e.getBoundingClientRect();e.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}))})
			await nav.clock.fastForward(300);await nav.evaluate(()=>ModLoader.ui.hud.hide());await nav.clock.fastForward(1000)
			assert.equal(await tooltipActive(nav),false,'HUD teardown must cancel a pending pointer reveal')
			await nav.evaluate(()=>ModLoader.ui.hud.show())
			await nav.clock.resume();await nav.context().close()
		})
		await check('Tooltip text renders all twenty locales and Alt labels, with Reality light, Void dark and global fallback themes',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click();const toolTexts=[]
			for(const language of Object.keys(manifest.translations)){
				await nav.evaluate(language=>{game.language=language;game.plane=0;game.store.reinit()},language)
				const state=await nav.evaluate(()=>({label:document.querySelector('[data-native-type="extractors"]').getAttribute('aria-label'),tip:document.querySelector('[data-native-type="extractors"]').dataset.modloaderPanelTooltip,tools:['eraser','relocator'].map(id=>game.store.html[id].dataset.modloaderPanelTooltip)}))
				assert.equal(state.tip,state.label+' (Alt+1)');assert.ok(state.tools.every(text=>text&&text!=='undefined'))
				if(language==='modsch')assert.deepEqual(state.tools,['拆解','搬迁'])
				toolTexts.push(state.tools.join('/'))
				await focusTooltip(nav,'.cattail-native-descriptions')
				assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),await nav.locator('.cattail-native-descriptions').getAttribute('aria-label'))
				assert.equal(await nav.locator('#modloader-panel-tooltip').evaluate(e=>e.classList.contains('modloader-panel-tooltip-light')),true)
			}
			assert.ok(new Set(toolTexts).size>=17)
			await nav.evaluate(()=>{game.language='unlisted';game.store.reinit()});await focusTooltip(nav,'.cattail-native-descriptions')
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'Hide building descriptions')
			for(const plane of [0,1,2]){
				await nav.evaluate(plane=>{game.language='modsch';game.plane=plane;game.store.visibilityUpdate()},plane)
				assert.equal(await tooltipActive(nav),false,'changing plane without reinit must clear the old visible theme')
				await focusTooltip(nav,'.cattail-native-style')
				const light=await nav.locator('#modloader-panel-tooltip').evaluate(e=>e.classList.contains('modloader-panel-tooltip-light'))
				assert.equal(light,plane===0?true:plane===1?false:await nav.evaluate(()=>ModLoader.ui.theme.mode()==='light'))
				if(plane<2)await nav.screenshot({path:path.join(output,'tooltip-plane-'+plane+'.png')})
			}
			await nav.context().close()
		})
		await check('real hover displays header, side-category and both tool tips without showing card descriptions, including a narrow viewport',async()=>{
			const nav=await prepareSide({width:1000,height:640})
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop-=90);await settle(nav)
			await hoverTooltip(nav,'[data-native-type="extractors"]')
			await nav.screenshot({path:path.join(output,'tooltip-header-narrow.png')})
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90);await settle(nav)
			for(const selector of ['[data-native-proxy="extractors"]','.store > .eraser','.store > .relocator']){
				await hoverTooltip(nav,selector)
				const tip=await nav.locator('#modloader-panel-tooltip').boundingBox()
				assert.ok(tip.x>=10&&tip.y>=10&&tip.x+tip.width<=990&&tip.y+tip.height<=630)
			}
			await nav.mouse.move(10,10);await nav.evaluate(()=>document.activeElement?.blur())
			await nav.locator('.cattail-native-shop-scroll .item').filter({hasText:'en: pump'}).first().hover()
			await nav.waitForTimeout(650);assert.equal(await tooltipActive(nav),false,'cards must not inherit a category or building-description tip')
			await nav.context().close()
		})
		await check('Tooltip ownership is released on click, returning proxy, scroll, wheel, HUD, mode, rebuild, realm, hidden game state and Store replacement',async()=>{
			for(const action of ['click','return','scroll','wheel','hud','mode','reinit','realm','credits','replace']){
				const nav=await prepareSide()
				if(action==='return'){await nav.keyboard.press('Alt+Digit5');await settle(nav)}
				await focusTooltip(nav,'[data-native-proxy="extractors"]')
				await nav.evaluate(action=>{
					window.oldTipTarget=document.querySelector('[data-native-proxy="extractors"]')
					const s=document.querySelector('.cattail-native-shop-scroll')
					if(action==='click')oldTipTarget.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}))
					if(action==='return')s.scrollTop+=document.querySelector('[data-native-type="extractors"]').getBoundingClientRect().top-8
					if(action==='scroll')s.scrollTop+=10
					if(action==='wheel')s.dispatchEvent(new Event('wheel',{bubbles:true}))
					if(action==='hud')ModLoader.ui.hud.hide()
					if(action==='mode')document.querySelector('.cattail-native-style').click()
					if(action==='reinit')game.store.reinit()
					if(action==='realm'){game.plane=1;game.store.visibilityUpdate()}
					if(action==='credits'){game.credits=true;game.store.visibilityUpdate()}
					if(action==='replace'){const root=game.store.vessel;game.store=new DesktopStoreVersion(root,game);game.store.compositionUpdate();game.store.visibilityUpdate()}
				},action)
				await nav.waitForFunction(()=>!document.querySelector('#modloader-panel-tooltip.active'))
				if(['return','hud','mode','reinit','realm','credits','replace'].includes(action))assert.equal(await nav.evaluate(()=>oldTipTarget.hasAttribute('data-modloader-panel-tooltip')),false,action)
				if(['reinit','replace'].includes(action)){
					await nav.evaluate(()=>oldTipTarget.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:100,clientY:100})))
					await nav.waitForTimeout(650);assert.equal(await tooltipActive(nav),false,'removed roots must not reveal an old tooltip')
				}
				await nav.context().close()
			}
		})
		await check('Tooltip teardown does not hide another public root owner and rebuilds leave one binding per current target',async()=>{
			const nav=await prepareSide()
			await focusTooltip(nav,'[data-native-proxy="extractors"]')
			await nav.evaluate(()=>{
				const other=document.createElement('button');other.id='other-tip-root';other.textContent='Other';document.body.append(other)
				window.detachOtherTip=ModLoader.ui.settings.tooltip.attach(other,'Other owner',{root:other,delayMs:0})
				other.focus()
			})
			await nav.waitForFunction(()=>document.querySelector('#modloader-panel-tooltip.active')?.textContent==='Other owner')
			await nav.evaluate(()=>game.store.reinit())
			assert.equal(await nav.locator('#modloader-panel-tooltip.active').textContent(),'Other owner')
			await nav.evaluate(()=>{detachOtherTip();document.getElementById('other-tip-root').remove()})
			assert.equal(await tooltipActive(nav),false)
			for(let i=0;i<5;i++)await nav.evaluate(()=>game.store.reinit())
			await settle(nav)
			await hoverTooltip(nav,'.cattail-native-style')
			assert.equal(await nav.locator('#modloader-panel-tooltip').count(),1)
			assert.equal(await nav.locator('.cattail-native-shop-toggle[data-modloader-panel-tooltip]').count(),2)
			assert.equal(await nav.locator('.cattail-native-category-rail').count(),1)
			await nav.context().close()
		})
		const tagDescriptionCards=page=>page.evaluate(()=>Object.entries(game.store.html.items).forEach(([id,card])=>card.dataset.testCard=id))
		const descriptionCard=id=>'[data-test-card="'+id+'"]'
		const openDescriptionCards=async page=>{
			await page.evaluate(()=>{const button=game.store.html.types.extractors.button;if(button.classList.contains('closed'))button.dispatchEvent(new MouseEvent('mousedown',{bubbles:false,cancelable:true,button:0}))})
			await settle(page)
		}
		const prepareDescriptionCards=async style=>{
			const page=await setup()
			if(style==='accordion')await page.locator('.cattail-native-style').click()
			await page.evaluate(()=>{game.plane=0;game.store.visibilityUpdate()})
			await tagDescriptionCards(page);await openDescriptionCards(page);return page
		}
		await check('hidden card descriptions use the real localized text only while hidden in both 1.3 styles, including new disabled cards and unchanged purchase handlers',async()=>{
			for(const style of ['native','accordion']){
				const nav=await prepareDescriptionCards(style),selector=descriptionCard('pump')
				await nav.evaluate(()=>{window.savedCard=game.store.html.items.pump;window.savedPurchase=savedCard.onmousedown})
				assert.equal(await nav.locator(selector).getAttribute('data-modloader-panel-tooltip'),null)
				await nav.locator('.cattail-native-descriptions').click()
				const text=await nav.locator(selector+' .itemDescription').textContent()
				assert.equal(await nav.locator(selector).getAttribute('data-modloader-panel-tooltip'),text.trim(),style)
				assert.equal(await nav.locator(selector+' .itemDescription').evaluate(e=>getComputedStyle(e).display),'none')
				await hoverTooltip(nav,selector)
				assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),text.trim())
				await nav.waitForTimeout(150);await nav.screenshot({path:path.join(output,'hidden-card-description-'+style+'.png')})
				await nav.evaluate(()=>{game.resources.fill(0);game.store.visibilityUpdate()})
				assert.equal(await nav.locator(selector).evaluate(e=>e.classList.contains('disabled')&&e.classList.contains('newItem')),true)
				await hoverTooltip(nav,selector)
				assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),text.trim())
				await nav.locator(selector).click()
				assert.deepEqual(await nav.evaluate(()=>game.picks),[])
				await nav.evaluate(()=>{game.resources.fill(10000);game.store.visibilityUpdate()});await openDescriptionCards(nav)
				await nav.locator(selector).click()
				assert.deepEqual(await nav.evaluate(()=>({picks:game.picks,world:game.worldClicks,same:game.store.html.items.pump===savedCard&&savedCard.onmousedown===savedPurchase})),{picks:['pump'],world:0,same:true})
				assert.equal(await tooltipActive(nav),false,'buying must clear the active tooltip')
				await nav.locator('.cattail-native-descriptions').click()
				assert.equal(await nav.locator(selector).getAttribute('data-modloader-panel-tooltip'),null)
				assert.notEqual(await nav.locator(selector+' .itemDescription').evaluate(e=>getComputedStyle(e).display),'none')
				await openDescriptionCards(nav);await nav.mouse.move(10,10);await nav.locator(selector).hover();await nav.waitForTimeout(650)
				assert.equal(await tooltipActive(nav),false,'showing inline descriptions must disable card tooltips')
				await nav.context().close()
			}
		})
		await check('hidden card descriptions keep the six hundred millisecond delay across native refresh and cancel pending or visible tips when hiding is disabled',async()=>{
			for(const style of ['native','accordion']){
				const nav=await prepareDescriptionCards(style);await nav.locator('.cattail-native-descriptions').click()
				await nav.clock.install({time:new Date('2026-10-22T00:00:00Z')});await nav.clock.pauseAt(new Date('2026-10-22T00:00:01Z'))
				await nav.evaluate(()=>{const card=game.store.html.items.pump,r=card.getBoundingClientRect();card.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}))})
				await nav.clock.fastForward(599);await nav.evaluate(()=>{for(let i=0;i<8;i++)game.store.visibilityUpdate()})
				assert.equal(await tooltipActive(nav),false)
				await nav.clock.fastForward(1);await nav.clock.fastForward(17)
				assert.equal(await tooltipActive(nav),true)
				assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),await nav.locator(descriptionCard('pump')+' .itemDescription').textContent())
				await nav.evaluate(()=>document.querySelector('.cattail-native-descriptions').click())
				assert.equal(await tooltipActive(nav),false)
				await nav.evaluate(()=>document.querySelector('.cattail-native-descriptions').click())
				await nav.evaluate(()=>game.store.html.items.pump.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:900,clientY:150})))
				await nav.clock.fastForward(300);await nav.evaluate(()=>document.querySelector('.cattail-native-descriptions').click());await nav.clock.fastForward(1000)
				assert.equal(await tooltipActive(nav),false,'an old pending description must not appear after the option is off')
				assert.equal(await nav.locator('.item[data-modloader-panel-tooltip]').count(),0)
				await nav.clock.resume();await nav.context().close()
			}
		})
		await check('hidden card descriptions render twenty runtime locales and survive unlocks, same-view card replacement and empty descriptions without stale roots',async()=>{
			const nav=await prepareDescriptionCards('accordion');await nav.locator('.cattail-native-descriptions').click()
			for(const language of Object.keys(manifest.translations)){
				await nav.evaluate(language=>{game.language=language;game.store.reinit()},language)
				await tagDescriptionCards(nav);await openDescriptionCards(nav)
				await hoverTooltip(nav,descriptionCard('pump'))
				assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),await nav.locator(descriptionCard('pump')+' .itemDescription').textContent(),language)
			}
			await nav.evaluate(()=>{game.language='en';game.unlockedEntities.pump2=false;game.store.reinit()})
			await tagDescriptionCards(nav);await openDescriptionCards(nav)
			assert.equal(await nav.locator(descriptionCard('pump2')).getAttribute('data-modloader-panel-tooltip'),null)
			await nav.evaluate(()=>{game.unlockedEntities.pump2=true;game.store.visibilityUpdate()})
			await hoverTooltip(nav,descriptionCard('pump2'))
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'en: Description for pump2')
			await hoverTooltip(nav,descriptionCard('pump'))
			await nav.evaluate(()=>{
				window.retiredCard=game.store.html.items.pump
				const pack=game.store.createEntityCard('pump');pack.card.onmousedown=retiredCard.onmousedown;pack.card.dataset.testCard='pump'
				retiredCard.replaceWith(pack.card);game.store.html.items.pump=pack.card
				game.store.html.priceContainers.pump=pack.price;game.store.html.counters.pump=pack.counter;game.store.html.existeds.pump=pack.existed
				game.store.compositionUpdate();game.store.visibilityUpdate()
			})
			assert.equal(await tooltipActive(nav),false)
			assert.equal(await nav.evaluate(()=>retiredCard.hasAttribute('data-modloader-panel-tooltip')),false)
			await nav.mouse.move(10,10) // Replacing under a stationary pointer may enter the new live card.
			await nav.evaluate(()=>retiredCard.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:900,clientY:150})))
			await nav.waitForTimeout(650);assert.equal(await tooltipActive(nav),false,'retired card roots must not reveal descriptions')
			await hoverTooltip(nav,descriptionCard('pump'))
			await nav.evaluate(()=>{game.store.html.items.pump.querySelector('.itemDescription').textContent=' \n ';game.store.visibilityUpdate()})
			assert.equal(await tooltipActive(nav),false)
			assert.equal(await nav.locator(descriptionCard('pump')).getAttribute('data-modloader-panel-tooltip'),null)
			await nav.evaluate(()=>{game.store.html.items.pump.querySelector('.itemDescription').textContent='完整的运行时建筑描述。第二句保留原文。';game.store.visibilityUpdate()})
			await hoverTooltip(nav,descriptionCard('pump'))
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'完整的运行时建筑描述。第二句保留原文。')
			await nav.context().close()
		})
		await check('hidden card descriptions release on category close, scroll, wheel, HUD, mode, realm, hidden card, rebuild and Store replacement in both 1.3 styles',async()=>{
			for(const style of ['native','accordion'])for(const action of ['close','scroll','wheel','hud','mode','realm','hidden','reinit','replace']){
				const nav=await prepareDescriptionCards(style);await nav.locator('.cattail-native-descriptions').click()
				await hoverTooltip(nav,descriptionCard('pump'))
				await nav.evaluate(action=>{
					window.retiredCard=game.store.html.items.pump
					if(action==='close')game.store.closeTypes()
					if(action==='scroll'){const root=document.querySelector('.cattail-native-shop-scroll')||game.store.html.types.extractors.wrap;root.dispatchEvent(new Event('scroll'))}
					if(action==='wheel')game.store.vessel.dispatchEvent(new Event('wheel',{bubbles:true}))
					if(action==='hud')ModLoader.ui.hud.hide()
					if(action==='mode')document.querySelector('.cattail-native-style').click()
					if(action==='realm'){game.plane=1;game.store.visibilityUpdate()}
					if(action==='hidden'){game.onlyones.pump=true;game.store.visibilityUpdate()}
					if(action==='reinit')game.store.reinit()
					if(action==='replace'){const root=game.store.vessel;game.store=new DesktopStoreVersion(root,game);game.store.compositionUpdate();game.store.visibilityUpdate()}
				},action)
				await nav.waitForFunction(()=>!document.querySelector('#modloader-panel-tooltip.active'))
				if(!['scroll','wheel','mode'].includes(action))assert.equal(await nav.evaluate(()=>retiredCard.hasAttribute('data-modloader-panel-tooltip')),false,style+': '+action)
				if(['scroll','wheel'].includes(action)){
					// No 100ms refresh or pointer movement is allowed between clearing
					// and entering another card: its root must already be registered.
					const enabled=await nav.evaluate(()=>!!game.store.html.items.pump2.dataset.modloaderPanelTooltip)
					assert.equal(enabled,true)
					await hoverTooltip(nav,descriptionCard('pump2'))
				}
				if(action==='hud'){await nav.evaluate(()=>ModLoader.ui.hud.show());await settle(nav);await hoverTooltip(nav,descriptionCard('pump'))}
				await nav.context().close()
			}
		})
		await check('persistent current category shares one side target across visible and offscreen titles while preserving its original icon',async()=>{
			for(const viewport of [{width:1440,height:900},{width:1000,height:640}]){
				const nav=await setup();await nav.setViewportSize(viewport);await nav.locator('.cattail-native-style').click()
				await nav.evaluate(()=>window.originalSideTargets=[...document.querySelectorAll('[data-native-proxy]')])
				for(const [id,key]of [['extractors','1'],['storage','5'],['default','7']]){
					await nav.keyboard.press('Alt+Digit'+key);await settle(nav)
					const selector='[data-native-proxy="'+id+'"]'
					for(const amount of [0,90,-90]){
						if(amount){await nav.locator('.cattail-native-shop-scroll').evaluate((s,n)=>s.scrollTop+=n,amount);await settle(nav)}
						const state=await nav.evaluate(id=>{
							const p=document.querySelector('[data-native-proxy="'+id+'"]'),i=game.store.html.types[id].button.querySelector('.cattail-native-category-icon'),group=[...document.querySelectorAll('.cattail-native-category-shortcut.is-visible')].map(e=>e.getBoundingClientRect())
							return {visible:p.classList.contains('is-visible'),selected:p.getAttribute('aria-pressed'),color:getComputedStyle(p).backgroundColor,icon:getComputedStyle(i).visibility,count:document.querySelectorAll('[data-native-proxy="'+id+'"]').length,same:originalSideTargets.every(e=>e.isConnected)&&originalSideTargets.length===document.querySelectorAll('[data-native-proxy]').length,center:(Math.min(...group.map(r=>r.top))+Math.max(...group.map(r=>r.bottom)))/2,height:innerHeight}
						},id)
						assert.equal(state.visible,true,id+' must remain on the left even with its title visible');assert.equal(state.selected,'true');assert.equal(state.color,'rgb(255, 233, 120)');assert.equal(state.icon,'visible');assert.equal(state.count,1);assert.equal(state.same,true);assert.ok(Math.abs(state.center-state.height/2)<1)
						if(viewport.width===1440&&id==='extractors'&&amount>=0)await nav.screenshot({path:path.join(output,'persistent-current-'+(amount?'offscreen':'visible')+'.png')})
					}
					await nav.locator(selector).click();await settle(nav)
					assert.equal(await nav.locator('.cattail-native-category-shortcut.is-visible').count(),0,'clicking the current side target closes the category and clears the rail')
				}
				assert.deepEqual(await nav.evaluate(()=>({picks:game.picks,world:game.worldClicks})),{picks:[],world:0});await nav.context().close()
			}
		})
		await check('persistent current target retains shared tooltips and survives language HUD rebuild and replacement without leaking into native mode or hidden categories',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click();await nav.keyboard.press('Alt+Digit1');await settle(nav)
			const selector='[data-native-proxy="extractors"]'
			await hoverTooltip(nav,selector)
			assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'Extractors (Alt+1)')
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop+=90);await nav.waitForFunction(()=>!document.querySelector('#modloader-panel-tooltip.active'));await settle(nav);await hoverTooltip(nav,selector)
			await nav.locator('.cattail-native-shop-scroll').evaluate(s=>s.scrollTop-=90);await settle(nav);await hoverTooltip(nav,selector)
			for(const action of ['language','hud','reinit','replace']){
				await nav.evaluate(action=>{
					if(action==='language'){game.language='modsch';game.store.reinit()}
					if(action==='hud'){ModLoader.ui.hud.hide();ModLoader.ui.hud.show()}
					if(action==='reinit')game.store.reinit()
					if(action==='replace'){game.store=new DesktopStoreVersion(game.store.vessel,game);game.store.compositionUpdate();game.store.visibilityUpdate();document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,altKey:true,code:'Digit1',key:'1'}))}
				},action)
				assert.equal(await tooltipActive(nav),false,action);await nav.mouse.move(10,10);await settle(nav)
				assert.equal(await nav.locator(selector+'.is-visible').count(),1,action)
				assert.equal(await nav.locator('[data-native-type="extractors"] .cattail-native-category-icon').evaluate(e=>getComputedStyle(e).visibility),'visible')
				await hoverTooltip(nav,selector);assert.equal(await nav.locator('#modloader-panel-tooltip').textContent(),'采集 (Alt+1)')
			}
			await nav.locator('.cattail-native-style').click();await settle(nav);assert.equal(await nav.locator('.cattail-native-category-shortcut.is-present').count(),0);assert.equal(await tooltipActive(nav),false)
			await nav.locator('.cattail-native-style').click();await nav.keyboard.press('Alt+Digit1');await settle(nav)
			await nav.evaluate(()=>{game.plane=1;game.store.visibilityUpdate()});await settle(nav)
			assert.equal(await nav.locator(selector+'.is-visible').count(),0,'a realm-hidden category must not stay pinned');assert.equal(await nav.locator(selector).getAttribute('data-modloader-panel-tooltip'),null)
			await nav.context().close()
		})
		await check('persistent current membership is present from first opening and throughout rapid keyboard changes while intermediate headers cross the viewport',async()=>{
			const nav=await setup();await nav.locator('.cattail-native-style').click()
			await nav.evaluate(()=>{
				window.pinFrames=[];const start=performance.now(),sample=now=>{
					const open=document.querySelector('.cattail-native-shop-scroll > .element:not(.closed):not(.hidden)'),id=open?.dataset.nativeCategory,p=id&&document.querySelector('[data-native-proxy="'+id+'"]')
					pinFrames.push({t:now,id,visible:p?.classList.contains('is-visible'),selected:p?.getAttribute('aria-pressed'),icon:open&&getComputedStyle(open.querySelector('.cattail-native-category-icon')).visibility,count:[...document.querySelectorAll('[data-native-proxy]')].length})
					if(now-start<850)requestAnimationFrame(sample);else window.pinFramesDone=true
				};requestAnimationFrame(sample)
			})
			await nav.keyboard.press('Alt+Digit1');await nav.waitForTimeout(45);await nav.keyboard.press('Alt+Digit5');await nav.waitForTimeout(45);await nav.keyboard.press('Alt+Digit2')
			await nav.waitForFunction(()=>window.pinFramesDone);const frames=await nav.evaluate(()=>pinFrames)
			assert.deepEqual([...new Set(frames.map(f=>f.id).filter(Boolean))],['extractors','storage','destabilizers'])
			for(const f of frames.filter(f=>f.id)){assert.equal(f.visible,true,JSON.stringify(f));assert.equal(f.selected,'true');assert.equal(f.icon,'visible');assert.equal(f.count,9)}
			await settle(nav);assert.equal(await nav.locator('[data-native-proxy="destabilizers"].is-visible').count(),1);assert.ok(Math.abs((await header(nav,'destabilizers').boundingBox()).y-8)<1)
			fs.writeFileSync(path.join(output,'persistent-current-rapid-frames.json'),JSON.stringify(frames,null,2));await nav.context().close()
		})
		await check('no uncaught browser errors',async()=>assert.deepEqual(errors,[]))
		fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:results.length,results,browser:browser.version(),scope:'actual Store/Loader/selected consumers; synthetic world, no player profile',output},null,2))
		console.log(JSON.stringify({passed:results.length,output}))
	} finally { for(const context of contexts)await context.close(); await browser.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>server.close())
