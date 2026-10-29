'use strict'

// Synthetic world only. The HTTP allowlist cannot serve saves, enabled Mods,
// player settings or profiles; Chromium uses a new disposable context.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const MOD = 'Cattail_TweaksQuality_Dynamic-Details'
const MOD_ROOT = path.resolve(__dirname, '..')
const GAME_ROOT = path.resolve(MOD_ROOT, '../..')
const OUTPUT = process.env.MINE_CHART_OUTPUT || process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mine-distribution-'))
const ENTRIES = ['scripts/core.js', 'scripts/pump-distribution-chart.js', 'scripts/building-details.js']
const CONFIG = ['enableMineDistributionChart', 'mineDistributionChartView', 'mineDistributionVisibility']
const sources = Object.fromEntries(['game.js', 'ui.js', 'stuff.js', 'codex.js'].map(name => [name, fs.readFileSync(path.join(GAME_ROOT, 'scripts', name), 'utf8')]))
const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'mod.json'), 'utf8'))
const locale = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'locale/dynamic-details.json'), 'utf8'))
const catalog = JSON.parse(fs.readFileSync(path.join(GAME_ROOT, 'modloader/translations.json'), 'utf8'))
const FULL_ENTRIES = manifest.entries.slice()
const HOT_ONLY = process.env.MINE_CHART_HOT_ONLY === '1'
const report = { checks: [], screenshots: [], blockedRequests: [], nativeDepthSamples: 0, hotScenarios: [], hotFailures: [], coldStartupFindings: [] }
fs.mkdirSync(OUTPUT, { recursive: true })
const check = async (name, callback) => { await callback(); report.checks.push(name); console.log('PASS ' + name) }
const near = (actual, expected, message, tolerance = 2e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, message + ': ' + actual + ' != ' + expected)

function missingCodexClasses() {
	const names = new Set(Object.values(sources).flatMap(source => [...source.matchAll(/\bclass\s+(\w+)/g)].map(match => match[1])))
	return [...new Set([...sources['codex.js'].matchAll(/class:\s*(\w+)/g)].map(match => match[1]))].filter(name => !names.has(name))
}
const codexSource = missingCodexClasses().map(name => 'const ' + name + ' = class {};').join('\n') + '\n' + sources['codex.js']

function nativeOracle() {
	const sandbox = { console, Math: Object.create(Math) }
	vm.createContext(sandbox)
	for (const name of ['game.js', 'ui.js', 'stuff.js']) vm.runInContext(sources[name], sandbox, { filename: name })
	vm.runInContext(codexSource, sandbox, { filename: 'codex.js' })
	const Pump = vm.runInContext('Pump', sandbox)
	const resources = vm.runInContext('abstract_getCodex().resources', sandbox)
	const entity = Object.assign(Object.create(Pump.prototype), { master: { codex: { resources } }, depth: 0 })
	return {
		resources,
		distribution(depth) {
			entity.depth = depth
			const weights = Array.from(resources, resource => Math.max(0, ...Array.from(resource.probabilities || [], segment => entity.getProbability(segment.point, segment.spread, segment.value, segment.span))))
			const total = weights.reduce((sum, value) => sum + value, 0)
			return weights.map(value => total ? value / total : 0)
		},
		draw(depth, random) { entity.depth = depth; sandbox.Math.random = () => random; return entity.getResource() }
	}
}

// Run exactly the installed native Cloud, Entity, Pump and Game frame methods.
// Constructors/world actions are not invoked; the fixture supplies inert data.
function fixture(options = {}) {
	window.fixtureNow = 10000
	// Explicit existing UI preference in this disposable profile. A missing value
	// currently triggers the unrelated legacy core opacity fallback of 0.25.
	localStorage.setItem('cattailDynamicDetailsHintOpacity', '1')
	document.body.classList.add('altHolded')
	Object.defineProperty(performance, 'now', { value: () => window.fixtureNow })
	const browserRaf = requestAnimationFrame.bind(window)
	window.requestAnimationFrame = () => 0
	if (options.hot) {
		window.hotTrace = []
		window.hotApis = []
		window.hotPhase = 'bootstrap'
		window.hotRecord = (kind, data = {}) => hotTrace.push({ sequence: hotTrace.length, phase: hotPhase, kind, ...data })
		localStorage.setItem('modloader:Cattail_TweaksQuality_Dynamic-Details:config:enableBuildingDetails', JSON.stringify(!options.cold))
		if (options.disk) {
			// Read-only virtual files: no Node require, native IPC, real files or saves.
			const root = '/fixture/game', files = new Map([
				[root + '/mods/Cattail_TweaksQuality_Dynamic-Details/mod.json', JSON.stringify(options.manifest)],
				[root + '/modloader/translations.json', JSON.stringify(options.catalog)]
			])
			const normalize = value => String(value).replace(/\\/g, '/').replace(/\/+/g, '/')
			const deny = (operation, target) => { hotRecord('file-denied', { operation, target: String(target) }); throw new Error('Fixture denies ' + operation + ': ' + target) }
			const virtualFs = {
				existsSync(target) { const name = normalize(target); hotRecord('file-exists', { target: name }); return files.has(name) || name === root + '/mods' },
				readFileSync(target) { const name = normalize(target); hotRecord('file-read', { target: name }); if (!files.has(name)) return deny('read', name); return files.get(name) },
				readdirSync(target) { const name = normalize(target); hotRecord('file-list', { target: name }); if (name !== root + '/mods') return deny('list', name); return [{ name: 'Cattail_TweaksQuality_Dynamic-Details', isDirectory: () => true, isFile: () => false }] },
				statSync(target) { if (!files.has(normalize(target))) return deny('stat', target); return { mtimeMs: 1, mtime: new Date(0), isFile: () => true, isDirectory: () => false } },
				watch(target) { if (!files.has(normalize(target))) return deny('watch', target); hotRecord('virtual-watch', { target: normalize(target) }); return { close() {} } }
			}
			for (const operation of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync', 'cpSync', 'copyFileSync', 'mkdtempSync']) virtualFs[operation] = target => deny(operation, target)
			ModLoader.state.modFileTools = { fs: virtualFs, path: { join: (...parts) => normalize(parts.join('/')), dirname: value => normalize(value).split('/').slice(0, -1).join('/'), basename: value => normalize(value).split('/').at(-1) }, gameRoot: root, modsDir: root + '/mods', enabledPath: root + '/mods/enabled.json', shell: null, clipboard: null, ipcRenderer: null, dialog: null, childProcess: null, os: { homedir: () => '/fixture/home', EOL: '\n' } }
		}
		const originalRegister = ModLoader.register
		ModLoader.register = function (definition) {
			const source = document.currentScript?.src?.split('/').at(-1) || 'unknown'
			const originalInit = definition.init
			return originalRegister.call(this, { ...definition, init(api) {
				hotApis.push({ source, api })
				const originalGet = api.config.get
				api.config.get = function (key, fallback) { const value = originalGet.call(this, key, fallback); if (key === 'enableBuildingDetails' || /MineDistribution|mineDistribution/.test(key)) hotRecord('bound-get', { source, key, value, valueType: typeof value }); return value }
				hotRecord('entry-init', { source, modId: api.id })
				return originalInit?.call(definition, api)
			} })
		}
		const originalStage = ModLoader.stage
		ModLoader.stage = async function (name, ...args) { hotRecord('stage-start', { name }); const result = await originalStage.call(this, name, ...args); hotRecord('stage-end', { name }); return result }
		const originalSet = Storage.prototype.setItem
		Storage.prototype.setItem = function (key, value) { if (String(key).startsWith('modloader:Cattail_TweaksQuality_Dynamic-Details:config:')) hotRecord('storage-set', { key, value: String(value), argumentType: typeof value }); return originalSet.call(this, key, value) }
		addEventListener('modloader:config-preview', event => hotRecord('config-preview', { detail: event.detail }))
		document.addEventListener('change', event => { const input = event.target; if (input?.dataset?.modloaderConfigKey) hotRecord('control-change', { key: input.dataset.modloaderConfigKey, checked: input.checked, value: input.value, trusted: event.isTrusted }) }, true)
	}
	window.boot = async () => {
		const ctx = new Proxy({ measureText: () => ({ width: 70 }) }, { get: (target, key) => key in target ? target[key] : () => {} })
		window.game = Object.assign(Object.create(Game.prototype), {
			version: '1.3', isMobile: false, language: 'en', ctx,
			solidUnit: 40, zoom: 1, renderTime: { lt: 0 }, slowdown: { state: false },
			plane: 0, w: innerWidth, h: innerHeight, w2: innerWidth / 2, h2: innerHeight / 2, pixelRatio: 1,
			punch: { offset: 0 }, memoryBuffer: [], alfa: { currentNodes: [] },
			codex: abstract_getCodex(), resources: Array(10).fill(100), stuffMap: {}, stuff: [],
			stats: { totalPlayTime: 0, totalResourcesMined: [100, 100, 0, 0, 0, 0, 0, 0, 0, 0] },
			mouse: { xy: [innerWidth - 20, innerHeight / 2], sxy: [innerWidth - 20, innerHeight / 2], cursorVisible: true, state: 0 },
			altActive: true, shiftPressed: true, hoveredCell: [0, 0], currentHint: {}, entitiesInGame: {},
			preventSaving: true, preventCloud: true,
			canRelocate: () => false, canAfford: () => true, makeReadable: value => String(Math.round(value * 100) / 100),
			pronounce(...keys) {
				let value = this.words?.[this.language]
				for (const key of keys) value = value?.[key]
				if (typeof value === 'string') return value
				if (keys[0] === 'resources' && keys[2] === 'name') return this.codex.resources[keys[1]]?.name || String(keys[1])
				if (keys[0] === 'entities') return keys[2] === 'name' ? (keys[1] === 'pump' ? 'Excavating Channel' : 'Industrial Excavating Channel') : 'Draws mineral cubes from the depths. Synthetic world for isolated display checks.'
				return keys[keys.length - 1]
			}
		})
		for (const method of ['renderConductors', 'renderChasmVFX', 'renderEntities', 'renderEntitiesAbstract', 'renderHoveredCell', 'renderVFX', 'renderHollowEvents', 'renderSlowdown', 'renderGrid', 'renderSOI', 'renderAffected', 'renderResources']) game[method] = () => {}
		if (options.hot) {
			await ModLoader.stage('beforeGamePrepare', game, [])
			await ModLoader.stage('beforeVanillaScripts', game)
		}
		await ModLoader.stage('afterVanillaScripts', game)
		if (options.hot) game.codex = ModLoader.applyData(abstract_getCodex(), game)
		game.words = ModLoader.applyWords(abstract_getWords(), game)
		window.pumps = ['pump', 'pump2'].map((name, index) => {
			const entity = Object.assign(Object.create(index ? Pump2.prototype : Pump.prototype), {
				master: game, name, position: [index, 0], soi: [[0, 1]], soe: [[0, 1]], depth: index ? 600000 : 16,
				state: 0, active: true, spoolup: 1, basePumpSpeed: .04, pumpSpeed: .04, digSpeed: .01,
				surgeBoost: 0, canHit: () => false, render() {}
			})
			entity.initHint()
			return entity
		})
		game.stuff = pumps
		window.step = (index = 0, depth, elapsed = 100) => {
			if (depth !== undefined) pumps[index].depth = depth
			game.hoveredEntity = pumps[index]
			game.hoveredCell = [index, 0]
			fixtureNow += elapsed
			game.w = innerWidth; game.h = innerHeight; game.w2 = innerWidth / 2; game.h2 = innerHeight / 2
			window.runFrame()
			return pumps[index].hint._cattailDynamicDetails
		}
		window.runFrame = () => {
			const previous = requestAnimationFrame
			window.requestAnimationFrame = () => 0
			try { game.renderloop() } finally { window.requestAnimationFrame = previous }
		}
		window.setConfig = (key, value) => ModLoader.setConfigValue('Cattail_TweaksQuality_Dynamic-Details', key, value)
		window.snapshotWorld = () => JSON.stringify({ resources: game.resources, stats: game.stats, depths: pumps.map(pump => pump.depth) })
		if (options.hot) await ModLoader.stage('afterGameInit', game)
		step()
		if (options.hot) {
			window.hotOldPanel = pumps[0].hint._cattailDynamicDetails
			window.hotSnapshot = (key, expected, phase) => {
				window.hotPhase = phase
				const publicValue = ModLoader.getConfigValue('Cattail_TweaksQuality_Dynamic-Details', key, '__missing__')
				const closureValues = hotApis.map(({ source, api }) => ({ source, value: api.config.get(key, '__missing__') }))
				const raw = localStorage.getItem('modloader:Cattail_TweaksQuality_Dynamic-Details:config:' + key)
				let parsed; try { parsed = raw === null ? null : JSON.parse(raw) } catch (_) { parsed = raw }
				const input = document.querySelector('[data-modloader-config-key="' + key + '"]')
				const panel = pumps[0].hint._cattailDynamicDetails, root = panel?.chartRoot, state = panel?.mineDistributionState
				const data = { key, expected, publicValue, publicType: typeof publicValue, closureValues, rawStorage: raw, parsedStorage: parsed, parsedType: typeof parsed, control: input ? { checked: input.checked, value: input.value, tag: input.tagName, type: input.type } : null, buildingInstalled: !!CattailDynamicDetails.buildingDetailsInstalled, oldPanelSame: panel === hotOldPanel, chart: { exists: !!root, hidden: root?.hidden, connected: !!root?.isConnected, view: root?.dataset.view, visibility: root?.dataset.visibility, geometryBuilds: state?.geometryBuilds, geometryView: state?.geometry?.view, resourceIds: root ? [...root.querySelectorAll('.cattail-mine-legend-item[data-resource-id]')].map(row => Number(row.dataset.resourceId)) : [], anonymous: root?.querySelectorAll('.cattail-mine-unknown-icon').length || 0 }, menuOpen: !!document.getElementById('modloader-panel'), world: snapshotWorld(), issues: ModLoader.state.issues }
				hotRecord('snapshot', data); return data
			}
			hotRecord('ready', { entries: hotApis.map(item => item.source), stageNames: hotTrace.filter(event => event.kind === 'stage-end').map(event => event.name), disk: !!options.disk, cold: !!options.cold })
		}
		window.requestAnimationFrame = browserRaf
		window.ready = true
	}
}

const allowlist = new Map([
	['/cascade.css', path.join(GAME_ROOT, 'cascade.css')],
	['/modloader/loader.js', path.join(GAME_ROOT, 'modloader/loader.js')],
	['/modloader/translations.json', path.join(GAME_ROOT, 'modloader/translations.json')],
	['/scripts/words.js', path.join(GAME_ROOT, 'scripts/words.js')],
	['/font/Montserrat-Regular.woff2', path.join(GAME_ROOT, 'font/Montserrat-Regular.woff2')],
	['/img/resources.png', path.join(GAME_ROOT, 'img/resources.png')],
	['/mods/' + MOD + '/img/zopacityhint.svg', path.join(MOD_ROOT, 'img/zopacityhint.svg')],
	...['game.js', 'ui.js', 'stuff.js'].map(name => ['/scripts/' + name, path.join(GAME_ROOT, 'scripts', name)]),
	...FULL_ENTRIES.map(name => ['/mods/' + MOD + '/' + name, path.join(MOD_ROOT, name)]),
	['/mods/' + MOD + '/locale/dynamic-details.json', path.join(MOD_ROOT, 'locale/dynamic-details.json')]
])
const server = http.createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost')
	let body, type = 'text/javascript'
	if (url.pathname === '/' || url.pathname === '/hot') {
		type = 'text/html'
		const options = url.pathname === '/hot' ? { hot: true, disk: url.searchParams.get('files') === 'disk', cold: url.searchParams.get('cold') === '1', manifest, catalog } : {}
		body = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/cascade.css"><style>@font-face{font-family:Montserrat;src:url(/font/Montserrat-Regular.woff2)}body{background:#b9b9c0}</style><body>' +
			['game.js', 'ui.js', 'stuff.js'].map(name => '<script src="/scripts/' + name + '"></script>').join('') +
			'<script src="/scripts/words.js"></script><script src="/codex.js"></script><script src="/modloader/loader.js"></script><script>(' + fixture.toString() + ')(' + JSON.stringify(options).replace(/</g, '\\u003c') + ');boot().catch(error=>window.bootError=error.stack)</script>'
	} else if (url.pathname === '/mods/enabled.json') {
		type = 'application/json'; body = JSON.stringify({ mods: [MOD] })
	} else if (url.pathname === '/mods/' + MOD + '/mod.json') {
		type = 'application/json'; body = JSON.stringify(url.searchParams.get('full') === '1' ? manifest : { ...manifest, entries: ENTRIES })
	} else if (url.pathname === '/codex.js') body = codexSource
	else if (allowlist.has(url.pathname)) {
		const target = allowlist.get(url.pathname)
		body = fs.readFileSync(target)
			type = ({ '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(target)] || type
	} else {
		// Font/image resources are optional; no broad filesystem/static path access.
		report.blockedRequests.push(url.pathname)
	}
	if (body === undefined) { res.writeHead(404); res.end(); return }
	res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body)
})

async function runHotTrace(browser, origin) {
	const scenarios = [
		{ name: 'loaded-only-existing-card', disk: false, cold: false },
		{ name: 'readonly-disk-existing-card', disk: true, cold: false },
		{ name: 'loaded-only-cold-building-disabled', disk: false, cold: true },
		{ name: 'readonly-disk-cold-building-disabled', disk: true, cold: true }
	]
	for (const scenario of scenarios) {
		const result = { ...scenario, steps: [], expectations: [], errors: [], consoleWarnings: [], trace: [] }
		report.hotScenarios.push(result)
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
		await context.route('**/*', route => {
			const requestUrl = route.request().url()
			if (!requestUrl.startsWith(origin + '/')) return route.abort()
			if (requestUrl === origin + '/mods/' + MOD + '/mod.json') return route.continue({ url: requestUrl + '?full=1' })
			return route.continue()
		})
		const page = await context.newPage()
		page.on('pageerror', error => result.errors.push(error.stack))
		page.on('console', message => { if (['warning', 'error'].includes(message.type())) result.consoleWarnings.push(message.text()) })
		const expect = (name, actual, expected, category = 'existing-card') => {
			let passed = false
			try { assert.deepEqual(actual, expected); passed = true } catch (_) {}
			const entry = { name, actual, expected, passed, category }
			result.expectations.push(entry)
			if (!passed && category === 'cold-startup') report.coldStartupFindings.push({ scenario: scenario.name, ...entry })
			else if (!passed) report.hotFailures.push({ scenario: scenario.name, ...entry })
		}
		const snap = async (key, value, phase) => {
			const valueSnapshot = await page.evaluate(({ key, value, phase }) => hotSnapshot(key, value, phase), { key, value, phase })
			result.steps.push({ phase, ...valueSnapshot })
			return valueSnapshot
		}
		const openMenu = async () => {
			await page.keyboard.press('Control+m')
			await page.locator('#modloader-panel').waitFor({ state: 'visible' })
			const row = page.locator('.modloader-mod-row').first()
			if (!(await row.getAttribute('class')).includes('modloader-mod-row-expanded')) await row.locator('.modloader-mod-title').click()
		}
		const closeAndHover = async () => {
			await page.keyboard.press('Control+m')
			await page.locator('#modloader-panel').waitFor({ state: 'detached' })
			await page.mouse.move(1000, 500)
			await page.evaluate(() => { game.mouse.xy = game.mouse.sxy = [1000, 500]; step(0) })
		}
		const checkSnapshot = (data, value, label, category = 'existing-card') => {
			expect(label + ' public getter', data.publicValue, value, category)
			expect(label + ' all nine init(api) closure getters', data.closureValues.map(item => item.value), FULL_ENTRIES.map(() => value), category)
			expect(label + ' raw localStorage encoding', data.rawStorage, JSON.stringify(value), category)
			expect(label + ' parsed localStorage type', data.parsedType, typeof value, category)
			expect(label + ' parsed localStorage value', data.parsedStorage, value, category)
		}
		try {
			await page.goto(origin + '/hot?files=' + (scenario.disk ? 'disk' : 'loaded') + '&cold=' + Number(scenario.cold))
			await page.waitForFunction(() => window.ready || window.bootError, null, { polling: 100, timeout: 15000 })
			const bootError = await page.evaluate(() => window.bootError)
			expect('complete bootstrap succeeds', bootError, undefined)
			if (bootError) throw new Error(bootError)
			const ready = await page.evaluate(() => hotTrace.find(item => item.kind === 'ready'))
			expect('all actual manifest entries initialize in their declared order', ready.entries, FULL_ENTRIES.map(entry => entry.split('/').at(-1)))
			expect('all Loader lifecycle stages complete', ready.stageNames, ['beforeGamePrepare', 'beforeVanillaScripts', 'afterVanillaScripts', 'afterGameInit'])
			await snap('enableMineDistributionChart', true, 'initial-card')
			if (scenario.cold) {
				await openMenu()
				const input = page.locator('[data-modloader-config-key="enableBuildingDetails"]')
				expect('cold checkbox initially false', await input.isChecked(), false)
				await input.click()
				await snap('enableBuildingDetails', true, 'cold-ui-before-save')
				await page.locator('.modloader-save-button').click()
				await snap('enableBuildingDetails', true, 'cold-ui-after-save')
				await closeAndHover()
				const after = await snap('enableBuildingDetails', true, 'cold-closed-rehover')
				checkSnapshot(after, true, 'cold persisted total switch')
				expect('cold hot-enable installs building details', after.buildingInstalled, true, 'cold-startup')
				expect('cold hot-enable displays chart', after.chart.exists && !after.chart.hidden && after.chart.connected, true, 'cold-startup')
			} else {
				for (const [key, value] of [['enableMineDistributionChart', false], ['enableMineDistributionChart', true], ['mineDistributionChartView', 'bands'], ['mineDistributionChartView', 'stacked'], ['mineDistributionVisibility', 'all'], ['mineDistributionVisibility', 'anonymous'], ['mineDistributionVisibility', 'discovered']]) {
					await openMenu()
					const label = key + '=' + String(value)
					await snap(key, value, label + ':before-click')
					const control = page.locator('[data-modloader-config-key="' + key + '"]')
					if (typeof value === 'boolean') await control.click()
					else {
						await control.locator('.modloader-select-button').click()
						await page.locator('.modloader-select-menu:visible .modloader-select-option[data-value-key="string:' + value + '"]').click()
					}
					const clicked = await snap(key, value, label + ':after-click-before-close')
					checkSnapshot(clicked, value, label + ' immediately after real click')
					await closeAndHover()
					const after = await snap(key, value, label + ':closed-rehover')
					checkSnapshot(after, value, label + ' after closing menu and hovering')
					expect(label + ' updates the existing panel', after.oldPanelSame, true)
					expect(label + ' menu is closed', after.menuOpen, false)
					if (key === 'enableMineDistributionChart') expect(label + ' actual existing chart visibility', after.chart.exists && !after.chart.hidden && after.chart.connected, value)
					else if (key === 'mineDistributionChartView') expect(label + ' actual existing chart geometry', after.chart.view, value)
					else {
						expect(label + ' actual existing chart disclosure', after.chart.visibility, value)
						expect(label + ' actual legend resource ids', after.chart.resourceIds, value === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1])
						expect(label + ' anonymous count', after.chart.anonymous, value === 'anonymous' ? 6 : 0)
					}
					console.log('TRACE ' + scenario.name + ' ' + label + ': public=' + JSON.stringify(after.publicValue) + ', raw=' + after.rawStorage + ', chart=' + JSON.stringify(after.chart))
				}
			}
			expect('no page exceptions', result.errors, [])
			console.log('TRACE complete ' + scenario.name + ': ' + result.expectations.filter(item => item.passed).length + '/' + result.expectations.length + ' expectations')
		} catch (error) {
			result.runnerError = error.stack
			report.hotFailures.push({ scenario: scenario.name, name: 'runner completes', error: error.stack })
			console.error('TRACE runner ' + scenario.name + ': ' + error.message)
		} finally {
			result.trace = await page.evaluate(() => window.hotTrace || []).catch(() => [])
			await page.screenshot({ path: path.join(OUTPUT, 'hot-' + scenario.name + '.png') }).catch(() => {})
			fs.writeFileSync(path.join(OUTPUT, 'hot-' + scenario.name + '.json'), JSON.stringify(result, null, 2) + '\n')
			await context.close()
		}
	}
}

async function main() {
	let playwright
	try { playwright = require('playwright') } catch (_) {
		playwright = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'), '_resolve.cjs'))('playwright')
	}
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = 'http://127.0.0.1:' + server.address().port
	const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync)
	const browser = await playwright.chromium.launch({ headless: true, executablePath: fs.existsSync(playwright.chromium.executablePath()) ? undefined : fallback })
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
	const errors = []
	context.on('page', page => page.on('pageerror', error => errors.push(error.stack)))
	await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
	const page = await context.newPage()
	try {
		await runHotTrace(browser, origin)
		if (HOT_ONLY) {
			report.status = report.hotFailures.length ? 'failed' : report.coldStartupFindings.length ? 'passed-with-separate-cold-startup-findings' : 'passed'
			if (report.hotFailures.length) process.exitCode = 1
			console.log('TRACE summary: ' + report.hotScenarios.length + ' scenarios, ' + report.hotFailures.length + ' existing-card failures, ' + report.coldStartupFindings.length + ' separate cold-startup findings; ' + OUTPUT)
			return
		}
		await page.goto(origin + '/')
		await page.waitForFunction(() => window.ready || window.bootError, null, { polling: 100, timeout: 15000 })
		assert.equal(await page.evaluate(() => window.bootError), undefined)
		await check('real Loader loads the isolated chart module and native frame/Cloud path', async () => {
			assert.equal(await page.evaluate(() => !!CattailDynamicDetails.pumpDistributionChart && !!pumps[0].hint._cattailDynamicDetails.chartRoot?.querySelector('svg')), true)
			assert.equal(await page.evaluate(() => ModLoader.state.mods.length), 1)
		})
		await check('native MAX segment weights, normalization and original random-selection oracle', async () => {
			const oracle = nativeOracle()
			const depths = new Set([0, 1, 16, 34, 75, 80, 130, 400, 550, 600, 700, 800, 1700, 1800, 1900, 2100, 102400, 600000, 1000000])
			for (let i = 0; i <= 600; i++) depths.add(i * 1000000 / 600)
			for (const resource of oracle.resources) for (const segment of resource.probabilities || []) for (const boundary of [segment.point - segment.spread, segment.point, segment.point + segment.span, segment.point + segment.span + segment.spread]) {
				if (Number.isFinite(boundary) && boundary >= 0) for (const delta of [-1e-5, 0, 1e-5]) if (boundary + delta >= 0) depths.add(boundary + delta)
			}
			const values = await page.evaluate(depths => depths.map(depth => CattailDynamicDetails.pumpDistributionChart.distributionAt(game.codex.resources, depth)), [...depths])
			let sample = 0
			for (const depth of depths) {
				const expected = oracle.distribution(depth)
				values[sample].forEach((value, id) => near(value, expected[id], 'depth ' + depth + ' resource ' + id))
				near(values[sample].reduce((sum, value) => sum + value, 0), 1, 'normalized at ' + depth)
				let cumulative = 0
				expected.forEach((value, id) => { if (value > 1e-12) assert.equal(oracle.draw(depth, cumulative + value / 2), id, 'actual native random draw'); cumulative += value })
				sample++
			}
			report.nativeDepthSamples = sample
			const rare = oracle.distribution(700)[5]
			assert.ok(rare > 0 && rare < .01)
			assert.ok(1 - (1 - rare) ** 64 > rare * 50, 'unit probability differs materially from a 64-draw block containing the resource')
		})
		await check('continuous log1p depth mapping starts at zero and full resource range expands', async () => {
			const result = await page.evaluate(() => {
				const c = CattailDynamicDetails.pumpDistributionChart
				return { ratios: [0, 1, 10, 100, 1000, 100000, 10000000].map(value => c.depthRatio(value, 10000000)), max: c.getMaxDepth(game.codex.resources, 0), expanded: c.getMaxDepth(game.codex.resources, 24000000), samples: c.sampleDepths(game.codex.resources, 10000000) }
			})
			assert.equal(result.ratios[0], 0); near(result.ratios.at(-1), 1, 'max maps to 1')
			result.ratios.slice(1).forEach((value, i) => assert.ok(value > result.ratios[i], 'strictly increasing'))
			assert.equal(result.max, 10000000); assert.ok(result.expanded >= 24000000)
			assert.ok(result.samples.includes(160) && result.samples.includes(5500), 'key mineral depths sampled')
		})
		await check('two native mines track their own depth with white axis dot and perpendicular line', async () => {
			for (const view of ['stacked', 'bands']) for (let index = 0; index < 2; index++) {
				const result = await page.evaluate(({ view, index }) => {
					setConfig('mineDistributionChartView', view); setConfig('mineDistributionVisibility', 'all'); const panel = step(index)
					const dot = panel.chartRoot.querySelector('.cattail-mine-current-dot'), line = panel.chartRoot.querySelector('.cattail-mine-current-line'), axis = panel.chartRoot.querySelector('.cattail-mine-depth-axis')
					const geometry = panel.mineDistributionState.geometry
					return { dot: ['cx', 'cy', 'fill'].map(key => dot.getAttribute(key)), line: ['x1', 'y1', 'x2', 'y2'].map(key => Number(line.getAttribute(key))), axis: ['x1', 'y1', 'x2', 'y2'].map(key => Number(axis.getAttribute(key))), white: getComputedStyle(dot).fill, depth: pumps[index].depth, marker: Number(dot.dataset.depthMeters), geometry: { left: geometry.left, top: geometry.top, plotWidth: geometry.plotWidth, plotHeight: geometry.plotHeight, maxMeters: geometry.maxMeters } }
				}, { view, index })
				const [x, y] = result.dot.map(Number), [x1, y1, x2, y2] = result.line
				assert.ok(['white', '#fff', '#ffffff', 'rgb(255, 255, 255)'].includes(result.dot[2]) || result.white === 'rgb(255, 255, 255)', 'white current dot')
				if (view === 'stacked') { near(x, x1, 'dot x=line x'); near(x1, x2, 'vertical line'); near(y, result.axis[1], 'dot on horizontal depth axis'); assert.notEqual(y1, y2) }
				else { near(y, y1, 'dot y=line y'); near(y1, y2, 'horizontal line'); near(x, result.axis[0], 'dot on vertical depth axis'); assert.notEqual(x1, x2) }
				assert.equal(result.depth, index ? 600000 : 16)
				assert.equal(result.marker, result.depth * 10, 'marker tracks the viewed mine, including the metres conversion')
				const ratio = Math.log1p(result.marker / 100) / Math.log1p(result.geometry.maxMeters / 100)
				near(view === 'stacked' ? x : y, view === 'stacked' ? result.geometry.left + ratio * result.geometry.plotWidth : result.geometry.top + ratio * result.geometry.plotHeight, 'current depth is at its actual log-mapped position')
			}
		})
		await check('dynamic marker changes retain SVG/path identity and preserve inventory, depth and stats', async () => {
			const result = await page.evaluate(() => {
				setConfig('mineDistributionChartView', 'stacked'); step(0, 16)
				const root = pumps[0].hint._cattailDynamicDetails.chartRoot, svg = root.querySelector('svg'), paths = [...root.querySelectorAll('.cattail-mine-area')], old = root.querySelector('.cattail-mine-current-dot').getAttribute('cx')
				const before = snapshotWorld()
				for (let i = 0; i < 120; i++) step(0, undefined, 40)
				const immutable = before === snapshotWorld()
				step(0, 17)
				const point = root.querySelector('.cattail-mine-current-dot'), beforeThrottle = point.getAttribute('cx')
				step(0, 17.1, 1); const throttled = beforeThrottle === point.getAttribute('cx'); step(0, 17.1, 40)
				return { immutable, same: root.querySelector('svg') === svg && paths.every((node, i) => node === root.querySelectorAll('.cattail-mine-area')[i]), moved: old !== point.getAttribute('cx'), throttled }
			})
			assert.deepEqual(result, { immutable: true, same: true, moved: true, throttled: true })
		})
		await check('both views honor all/anonymous/discovered, never renormalize hidden probabilities', async () => {
			for (const view of ['stacked', 'bands']) for (const visibility of ['all', 'anonymous', 'discovered']) {
				const result = await page.evaluate(({ view, visibility }) => {
					game.stats.totalResourcesMined = [100, 100, 0, 0, 0, 0, 0, 0, 0, 0]; game.resources.fill(0)
					setConfig('mineDistributionChartView', view); setConfig('mineDistributionVisibility', visibility); const panel = step(0, 16), root = panel.chartRoot
					return { text: root.textContent, paths: [...root.querySelectorAll('.cattail-mine-area')].map(path => ({ id: path.dataset.resourceId, fill: path.getAttribute('fill') })), values: [...root.querySelectorAll('.cattail-mine-current-value')].map(value => value.textContent), probabilities: CattailDynamicDetails.pumpDistributionChart.distributionAt(game.codex.resources, 16) }
				}, { view, visibility })
				assert.ok(result.text.includes('Charonite') && result.text.includes('Elmerine'), 'cumulative discovery survives zero inventory')
				if (visibility === 'all') assert.ok(result.text.includes('Qanetite') && result.text.includes('Hollow stone'))
				else {
					assert.ok(!result.text.includes('Qanetite') && !result.text.includes('Hollow stone'), 'undiscovered names hidden')
					assert.ok(result.paths.every(item => item.id === undefined || Number(item.id) < 2), 'no undiscovered resource id')
					const hiddenColors = nativeOracle().resources.slice(2).flatMap(resource => Array.from(resource.triplet || [], color => color.toLowerCase()))
					assert.ok(result.paths.every(item => !item.fill || !hiddenColors.includes(item.fill.toLowerCase())), 'unknown paths use neutral colors')
				}
				const elmerine = result.probabilities[1] * 100
				assert.ok(result.values.some(value => Math.abs(Number(value.replace(/[^\d.eE+-]/g, '')) - elmerine) < .01), 'precise unit probability remains unrenormalized')
			}
			await page.evaluate(() => { game.stats.totalResourcesMined[2] = 1; step(0) })
			assert.ok((await page.locator('.cattail-mine-distribution').textContent()).includes('Qanetite'), 'new discovery is immediate')
		})
		await check('zero discoveries keep blank mass and a growing mine expands the rendered depth axis', async () => {
			const result = await page.evaluate(() => {
				game.stats.totalResourcesMined.fill(0); game.resources.fill(1e9); setConfig('mineDistributionVisibility', 'discovered')
				let panel = step(0, 34)
				const empty = { paths: panel.chartRoot.querySelectorAll('.cattail-mine-area').length, note: panel.chartRoot.querySelector('.cattail-mine-hidden')?.textContent, text: panel.chartRoot.textContent }
				const before = panel.mineDistributionState.geometry.maxMeters
				panel = step(0, 2400000)
				const geometry = panel.mineDistributionState.geometry, marker = Number(geometry.currentDot.dataset.depthMeters)
				game.stats.totalResourcesMined.fill(100); setConfig('mineDistributionVisibility', 'all'); step(0, 16)
				return { empty, before, expanded: geometry.maxMeters, marker }
			})
			assert.equal(result.empty.paths, 0, 'inventory cannot reveal a mineral without cumulative acquisition')
			assert.ok(result.empty.note.includes('100%') && result.empty.text.includes(locale.en.cattailMineDistribution.empty))
			assert.equal(result.before, 10000000); assert.ok(result.expanded >= 24000000); assert.equal(result.marker, 24000000)
		})
		await check('real Loader schema/catalog have 20-language hot persistent settings', async () => {
			const languages = Object.keys(catalog.languages)
			assert.equal(languages.length, 20)
			for (const key of CONFIG) {
				const item = manifest.config[key]
				assert.equal(item.reloadPolicy, 'hot'); assert.equal(item.persist, 'change')
				for (const language of languages) {
					for (const field of ['label', 'description']) assert.equal(catalog.languages[language].mods[MOD].config[key][field], item[field][language], key + '/' + language + '/' + field)
					for (const option of item.options || []) assert.equal(catalog.languages[language].mods[MOD].config[key].valueLabels[option], item.valueLabels[option][language], key + '/' + language + '/' + option)
				}
			}
			assert.equal(manifest.config.mineDistributionVisibility.default, 'discovered')
			const loaded = await page.evaluate(() => Object.fromEntries(['enableMineDistributionChart', 'mineDistributionChartView', 'mineDistributionVisibility'].map(key => [key, ModLoader.state.mods[0].manifest.config[key]])))
			for (const key of CONFIG) assert.deepEqual(loaded[key].label, manifest.config[key].label)
		})
		await check('settings selection saves immediately, reload keeps both selections and feature switches work', async () => {
			await page.evaluate(() => ModLoader.renderPanel())
			for (const [key, value] of [['mineDistributionChartView', 'bands'], ['mineDistributionVisibility', 'anonymous']]) {
				await page.locator('[data-modloader-config-key="' + key + '"]').evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })) }, value)
				assert.equal(await page.evaluate(({ key }) => localStorage.getItem('modloader:Cattail_TweaksQuality_Dynamic-Details:config:' + key), { key }), JSON.stringify(value))
			}
			await page.reload(); await page.waitForFunction(() => window.ready || window.bootError, null, { polling: 100, timeout: 15000 }); assert.equal(await page.evaluate(() => window.bootError), undefined)
			assert.deepEqual(await page.evaluate(() => ['mineDistributionChartView', 'mineDistributionVisibility'].map(key => ModLoader.getConfigValue('Cattail_TweaksQuality_Dynamic-Details', key))), ['bands', 'anonymous'])
			for (const key of ['enableMineDistributionChart', 'enableBuildingDetails']) {
				await page.evaluate(key => { setConfig(key, false); step() }, key)
				assert.equal(await page.locator('.cattail-mine-distribution:visible').count(), 0, key + ' disables immediately')
				await page.evaluate(key => { setConfig(key, true); step() }, key)
				assert.equal(await page.locator('.cattail-mine-distribution:visible').count(), 1)
			}
		})
		await check('all 20 runtime languages resolve chart text and unknown language falls back to English', async () => {
			const languages = Object.keys(catalog.languages)
			const namespace = Object.keys(locale.en).find(key => /mine|distribution/i.test(key))
			assert.ok(namespace, 'separate chart runtime namespace')
			for (const language of languages) {
				assert.deepEqual(Object.keys(locale[language][namespace]).sort(), Object.keys(locale.en[namespace]).sort(), language + ' has every new chart key')
				const text = await page.evaluate(language => { game.language = language; step(); return document.querySelector('.cattail-mine-distribution').textContent }, language)
				assert.ok(text.includes(locale[language][namespace].title), language + ' runtime title')
			}
			const fallbackText = await page.evaluate(() => { game.language = 'unknown-language'; step(); return document.querySelector('.cattail-mine-distribution').textContent })
			assert.ok(fallbackText.includes(locale.en[namespace].title))
		})
		await check('both views remove the three requested text fragments in all 20 languages', async () => {
			for (const view of ['stacked', 'bands']) for (const language of Object.keys(catalog.languages)) {
				const result = await page.evaluate(({ view, language }) => {
					game.language = language; setConfig('mineDistributionChartView', view)
					const panel = step(), root = panel.chartRoot
					return { subtitle: root.querySelector('.cattail-mine-subtitle').textContent, current: root.querySelector('.cattail-mine-current').textContent, text: root.textContent }
				}, { view, language })
				const words = locale[language].cattailMineDistribution
				assert.equal(result.subtitle, words.nonlinear, view + '/' + language + ': no appended depth label')
				assert.ok(result.current.startsWith(words.current + ': ') && /\d/.test(result.current), view + '/' + language + ': current depth retained')
				assert.ok(!result.current.includes(' · ' + words.probability), view + '/' + language + ': no appended probability label')
				assert.ok(!result.text.includes(words.unitNote), view + '/' + language + ': resource randomness note removed')
			}
		})
		await check('both legend views use correctly sliced native 16px resource icons and anonymous entries reveal none', async () => {
			for (const view of ['stacked', 'bands']) {
				const result = await page.evaluate(async view => {
					game.language = 'en'; game.stats.totalResourcesMined.fill(100)
					setConfig('mineDistributionChartView', view); setConfig('mineDistributionVisibility', 'all')
					let panel = step(), root = panel.chartRoot
					const atlas = new Image(); atlas.src = '/img/resources.png'; await atlas.decode()
					const icons = [...root.querySelectorAll('.cattail-mine-legend-item')].map(row => {
						const wrapper = row.querySelector('.cattail-mine-resource-icon'), icon = wrapper?.querySelector('.hintResourceIcon')
						if (!wrapper || !icon) return { id: row.dataset.resourceId, missing: true }
						const native = document.createElement('span'); native.className = 'hintResourceIcon r' + row.dataset.resourceId; document.body.append(native)
						const actual = getComputedStyle(icon), expected = getComputedStyle(native), shell = getComputedStyle(wrapper)
						const value = { id: Number(row.dataset.resourceId), classes: icon.className, shell: { width: parseFloat(shell.width), height: parseFloat(shell.height), overflow: shell.overflow, position: shell.position }, actual: { width: actual.width, height: actual.height, image: actual.backgroundImage, position: actual.backgroundPosition, size: actual.backgroundSize, left: actual.left, top: actual.top, positionType: actual.position, margin: actual.margin, transform: actual.transform, origin: actual.transformOrigin }, expected: { width: expected.width, height: expected.height, image: expected.backgroundImage, position: expected.backgroundPosition, size: expected.backgroundSize } }
						native.remove(); return value
					})
					game.stats.totalResourcesMined = [100, 100, 0, 0, 0, 0, 0, 0, 0, 0]
					setConfig('mineDistributionVisibility', 'anonymous'); panel = step(); root = panel.chartRoot
					const anonymous = [...root.querySelectorAll('.cattail-mine-legend-item')].filter(row => row.dataset.resourceId === undefined).map(row => ({ text: row.querySelector('.cattail-mine-unknown-icon')?.textContent, resourceIcons: row.querySelectorAll('.hintResourceIcon,[data-resource-id],[class*=" r"]').length, background: getComputedStyle(row.querySelector('.cattail-mine-unknown-icon')).backgroundImage }))
					return { icons, anonymous, atlasLoaded: atlas.naturalWidth > 0 && atlas.naturalHeight > 0, alignment: getComputedStyle(root.querySelector('.cattail-mine-legend-item')).alignItems }
				}, view)
				assert.equal(result.atlasLoaded, true, 'real native atlas decodes')
				assert.equal(result.alignment, 'center')
				assert.deepEqual(result.icons.map(icon => icon.id), [0, 1, 2, 3, 4, 5, 6, 7], view + ': all public resources map to the corresponding native icon')
				for (const icon of result.icons) {
					assert.equal(icon.missing, undefined)
					assert.match(icon.classes, new RegExp('(?:^| )r' + icon.id + '(?: |$)'))
					near(icon.shell.width, 26 * 16 / 30, '16px icon wrapper width', .01); near(icon.shell.height, 16, '16px icon wrapper height', .01)
					assert.equal(icon.shell.overflow, 'hidden'); assert.equal(icon.shell.position, 'relative')
					for (const field of ['width', 'height', 'image', 'position', 'size']) assert.equal(icon.actual[field], icon.expected[field], view + '/' + icon.id + ': native atlas ' + field)
					assert.equal(icon.actual.position, (icon.id ? -27 * icon.id + 'px' : '0px') + ' 0px', 'correct native atlas slice')
					assert.ok(icon.actual.image.includes('/img/resources.png'))
					assert.equal(icon.actual.width, '26px'); assert.equal(icon.actual.height, '30px')
					assert.equal(icon.actual.positionType, 'absolute'); assert.equal(icon.actual.left, '0px'); assert.equal(icon.actual.top, '0px'); assert.equal(icon.actual.margin, '0px'); assert.equal(icon.actual.origin, '0px 0px')
					const matrix = icon.actual.transform.match(/^matrix\(([^)]+)\)$/)[1].split(',').map(Number)
					near(matrix[0], 16 / 30, 'horizontal icon scale', .000001); near(matrix[3], 16 / 30, 'vertical icon scale', .000001)
					for (const index of [1, 2, 4, 5]) assert.equal(matrix[index], 0)
				}
				assert.equal(result.anonymous.length, 6, 'only two discovered resources have true icons')
				for (const anonymous of result.anonymous) assert.deepEqual(anonymous, { text: '?', resourceIcons: 0, background: 'none' }, view + ': anonymous item has a neutral question mark and no native resource identity')
			}
		})
		await check('native post-Cloud left/top writes retain complete cards inside wide/narrow/short/tiny viewports', async () => {
			for (const [width, height, language] of [[1440, 1000, 'en'], [640, 700, 'sch'], [800, 500, 'de'], [320, 260, 'ru']]) for (const view of ['stacked', 'bands']) {
				await page.setViewportSize({ width, height })
				const rect = await page.evaluate(({ view, language, width, height }) => {
					game.language = language; setConfig('mineDistributionChartView', view); setConfig('mineDistributionVisibility', 'all')
					game.mouse.xy = game.mouse.sxy = [width - 6, height - 6]
					step(0, view === 'stacked' ? 700 : 600000); step(0)
					const hint = game.currentHint.element, r = hint.getBoundingClientRect()
					const state = pumps[0].hint._cattailDynamicDetails.mineDistributionState
					const overflow = [...hint.querySelectorAll('*')].map(element => {
						const rect = element.getBoundingClientRect()
						if (!element.getClientRects().length || !rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') return null
						if (rect.left >= Math.max(-1, r.left - 1) && rect.top >= Math.max(-1, r.top - 1) && rect.right <= Math.min(width + 1, r.right + 1) && rect.bottom <= Math.min(height + 1, r.bottom + 1)) return null
						return { tag: element.tagName, className: element.getAttribute('class'), text: element.textContent.slice(0, 50), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
					}).filter(Boolean)
					return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, written: [hint.style.left, hint.style.top], overflow, diagnostics: { width: state.width, height: state.height, nextMeasure: state.nextMeasure, offsetWidth: hint.offsetWidth, offsetHeight: hint.offsetHeight, scrollWidth: hint.scrollWidth, transform: hint.style.transform, animation: getComputedStyle(hint).animation, transition: getComputedStyle(hint).transition } }
				}, { view, language, width, height })
				assert.deepEqual(rect.written, [width - 6 + 'px', height - 6 + 'px'], 'native frame owns left/top')
				assert.ok(rect.left >= -1 && rect.top >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1, JSON.stringify({ width, height, view, rect }))
				assert.deepEqual(rect.overflow, [], JSON.stringify({ width, height, view, rect }))
				await page.evaluate(() => document.fonts.ready)
				await page.evaluate(() => step(0))
				const filename = width + 'x' + height + '-' + language + '-' + view + '.png'
				await page.screenshot({ path: path.join(OUTPUT, filename) }); report.screenshots.push(filename)
			}
			await page.setViewportSize({ width: 1440, height: 1000 })
			for (const view of ['stacked', 'bands']) {
				await page.evaluate(view => { game.language = 'sch'; game.stats.totalResourcesMined.fill(100); game.mouse.xy = game.mouse.sxy = [900, 500]; setConfig('mineDistributionChartView', view); setConfig('mineDistributionVisibility', 'discovered'); pumps[0].initHint(); step(0, view === 'stacked' ? 550 : 1900) }, view)
				await page.evaluate(() => document.fonts.ready); await page.evaluate(() => step())
				const filename = 'card-sch-' + view + '.png'
				await page.locator('.hintBubble').screenshot({ path: path.join(OUTPUT, filename) }); report.screenshots.push(filename)
			}
		})
		await check('turning detail off and leaving a native hint clean up chart/layout without mutating world', async () => {
			const result = await page.evaluate(() => {
				game.altActive = game.shiftPressed = true; step(); const before = snapshotWorld(), panel = pumps[0].hint._cattailDynamicDetails
				game.altActive = game.shiftPressed = false; step()
				const inactive = !panel.chartRoot?.isConnected || getComputedStyle(panel.chartRoot).display === 'none'
				const transitionRestored = panel.hintElement.style.transition === ''
				const layoutClassRestored = !panel.hintElement.classList.contains('cattail-mine-distribution-card')
				game.altActive = game.shiftPressed = true; step()
				const detached = panel.chartRoot
				game.hoveredEntity = null; game.hoveredCell = null; fixtureNow += 100; runFrame()
				return { inactive, transitionRestored, layoutClassRestored, left: !game.currentHint.element && !detached?.isConnected, same: snapshotWorld() === before }
			})
			assert.deepEqual(result, { inactive: true, transitionRestored: true, layoutClassRestored: true, left: true, same: true })
		})
		assert.deepEqual(errors, [], 'zero browser page exceptions')
		report.status = report.hotFailures.length ? 'failed' : report.coldStartupFindings.length ? 'passed-with-separate-cold-startup-findings' : 'passed'
		if (report.hotFailures.length) process.exitCode = 1
	} finally {
		report.browserErrors = errors
		await browser.close()
		await new Promise(resolve => server.close(resolve))
		fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2) + '\n')
	}
	console.log('PASS mine distribution: ' + report.checks.length + ' checks; ' + report.nativeDepthSamples + ' native depth samples; ' + report.screenshots.length + ' screenshots. ' + OUTPUT)
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; server.close() })
