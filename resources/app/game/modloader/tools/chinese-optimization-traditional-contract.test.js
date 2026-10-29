'use strict'

// Isolated real Loader/Mod/native lookup execution. No game boot, saves or network.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { performance } = require('node:perf_hooks')
const gameRoot = path.resolve(__dirname, '../..')
const modRoot = path.join(gameRoot, 'mods/Cattail_Tweaks_简体中文优化')
const read = file => fs.readFileSync(file, 'utf8')
const json = value => JSON.stringify(value)
const clone = value => JSON.parse(json(value))
const manifest = JSON.parse(read(path.join(modRoot, 'mod.json')))
const checks = []
function check(name, run) { run(); checks.push(name) }
function flatten(value, prefix = '', out = new Map()) {
	if (typeof value === 'string') out.set(prefix, value)
	else if (value && typeof value === 'object') for (const key of Object.keys(value)) flatten(value[key], prefix ? prefix + '.' + key : key, out)
	return out
}
const node = () => ({ style: { setProperty() {} }, dataset: {}, children: [],
	classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
	appendChild(child) { this.children.push(child); return child }, addEventListener() {}, removeEventListener() {},
	setAttribute() {}, querySelector() { return null }, getBoundingClientRect() { return { width: 0, height: 0 } } })
const context = vm.createContext({ console, performance,
	document: { head: node(), body: node(), createElement: node, getElementById() { return null }, addEventListener() {} },
	window: { addEventListener() {}, devicePixelRatio: 1 },
	localStorage: { getItem() { return null }, setItem() { throw Error('Unexpected preferences write') } },
	requestAnimationFrame() { return 1 }, cancelAnimationFrame() {}, setTimeout() { return 1 }, clearTimeout() {},
	setInterval() { return 1 }, clearInterval() {},
	require() { throw Error('No disk, Electron or network access in the runtime fixture') },
	exports: { sentinel: 'host' }, module: { exports: { sentinel: 'host' } },
	OpenCC: { sentinel: 'other Mod' }, define() { throw Error('AMD must not run') }
})
context.define.amd = true
const originalLoader = read(path.join(gameRoot, 'modloader/loader.js'))
assert.equal(originalLoader.split('window.ModLoader = api').length, 2)
vm.runInContext(originalLoader.replace('window.ModLoader = api', `window.__localeTest = {
	t, PANEL_TEXT, getLocaleCandidates, getLocalizedManifestText, getLocalizedConfigText,
	getLocalizedConfigValueLabels, getSelectConfigOptions, getInlineLocalizedText,
	applyTranslationCatalogToManifest, installLanguageBridge
}; window.ModLoader = api`), context)
context.ModLoader = context.window.ModLoader
const loader = context.ModLoader
const ui = context.window.__localeTest
const started = performance.now()
for (const file of manifest.entries) vm.runInContext(read(path.join(modRoot, file)), context, { filename: file, timeout: 5000 })
const initMs = performance.now() - started
const converter = context.__cattailChineseTraditional
const source = context.__cattailTweaksSimplifiedChineseTrilingual
const sourceBefore = json(source)
const vanillaSource = read(path.join(gameRoot, 'scripts/words.js'))
vm.runInContext(vanillaSource, context)
const getWords = () => vm.runInContext('abstract_getWords()', context)
for (const id of manifest.languages) loader.registerLanguage(id)

check('private offline bundle works with Electron CommonJS and AMD globals', () => {
	assert.equal(context.exports.sentinel, 'host')
	assert.equal(context.module.exports.sentinel, 'host')
	assert.equal(context.OpenCC.sentinel, 'other Mod')
	assert.equal(manifest.version, '0.2.0')
	assert.deepEqual(manifest.languages, ['modsch', 'modtch'])
})
check('phrase disambiguation, Taiwan forms, original vocabulary and punctuation', () => {
	assert.equal(converter.convertText('头发发展，后面皇后，干燥干活，面条表面，里面一公里，软件保存。'),
		'頭髮發展，後面皇后，乾燥幹活，麵條表面，裡面一公里，軟件保存。')
	assert.equal(converter.convertText('维恩，夏普！畸变轨形、插层轨形……'), '維恩，夏普！畸變軌形、插層軌形……')
	assert.equal(converter.convertText('“电脑鼠标和软件”...保存！'), '“電腦鼠標和軟件”...保存！')
})
check('HTML attributes, placeholders, literal paths and URLs are preserved', () => {
	const text = '<span data-name="简体">继续</span>{文件} {{value}} [Q] Alt https://example.test/简体 <b>设置</b>'
	assert.equal(converter.convertText(text), '<span data-name="简体">繼續</span>{文件} {{value}} [Q] Alt https://example.test/简体 <b>設置</b>')
	assert.equal(converter.convertText('打开 D:\\我的文件\\简体.js，选择文件。'), '打開 D:\\我的文件\\简体.js，選擇文件。')
	assert.equal(converter.convertText('打开 mods/简体中文/locale.js。设置'), '打開 mods/简体中文/locale.js。設置')
})
let words, firstMs, repeatMs
check('all 756 fields and 425 messages derive without changing native languages or source', () => {
	words = getWords()
	const nativeBefore = json(words)
	const begin = performance.now(); loader.applyWords(words); firstMs = performance.now() - begin
	const simplified = flatten(words.modsch), traditional = flatten(words.modtch)
	assert.equal(simplified.size, 756); assert.equal(traditional.size, 756)
	assert.equal(words.modtch.messages.length, 425)
	assert.equal(words.modtch.random.eraserHint, '點擊並拖動框選範圍，可批量刪除建築')
	assert.equal(words.modtch.random.relocatorHint, '點擊並拖動框選範圍，可批量移動建築。按住<div class="key">Shift</div> 可複製')
	assert.equal(words.modtch.random.relocate, '移動'); assert.equal(words.modtch.random.clone, '複製')
	assert.equal(words.modtch.splash.language, '語言：繁體中文[優化]')
	for (const [key, value] of simplified) if (key !== 'splash.language') assert.equal(traditional.get(key), converter.convertText(value), key)
	const nativeAfter = { ...words }; delete nativeAfter.modsch; delete nativeAfter.modtch
	assert.equal(json(nativeAfter), nativeBefore)
	assert.equal(json(source), sourceBefore)
	const before = json(words)
	const begin2 = performance.now(); loader.applyWords(words); repeatMs = performance.now() - begin2
	assert.equal(json(words), before)
})
check('late Mod hooks, namespace preservation, fresh source edits and array replacement', () => {
	const marker = { text: '独立繁体命名空间' }
	words.modtch.foreignTraditional = marker
	loader.on('afterWords', value => { value.modsch.lateMod = { name: '后加载的机器', values: ['头发'] }; return value }, 'fixture')
	const original = source.messages[0].modsch
	source.messages[0].modsch = '修改后重新加载。'
	loader.applyWords(words)
	assert.equal(words.modtch.foreignTraditional, marker)
	assert.equal(words.modtch.lateMod.name, '後加載的機器')
	assert.equal(words.modtch.messages[0], '修改後重新加載。')
	assert.notEqual(words.modtch.messages, words.modsch.messages)
	source.messages[0].modsch = original
	loader.applyWords(words)
	assert.equal(words.modtch.messages[0], converter.convertText(original))
})
const game = { language: 'modtch' }
loader.state.game = game
check('Loader built-ins and catalog prefer modsch, per-key fallback, then convert templates', () => {
	assert.equal(ui.t('close'), '關閉')
	assert.deepEqual(Array.from(ui.getLocaleCandidates()), ['modtch', 'modsch', 'sch', 'zh-cn', 'zh', 'en'])
	loader.state.translationCatalog = { languages: {
		modtch: { modloader: { close: '关闭窗口' } },
		modsch: { modloader: { save: '保存修改：{name}' } },
		sch: { modloader: { cancel: '取消设置', save: '不得采用这个版本' } },
		en: { modloader: { menuSettings: 'English must not mask built-in Chinese' } }
	} }
	assert.equal(ui.t('close'), '關閉窗口')
	assert.equal(ui.t('save', { name: '用户简体文件' }), '保存修改：用户简体文件')
	assert.equal(ui.t('cancel'), '取消設置')
	assert.equal(ui.t('menuSettings'), converter.convertText(ui.PANEL_TEXT.sch.menuSettings))
})
check('manifest names, settings/action messages, select labels convert; values do not', () => {
	const m = { name: 'Fallback', translations: {
		modsch: { name: '机器优化', config: { setting: { label: '打开设置', description: '选择文件',
			errorText: '无法打开：{value}', valueLabels: { '原始值': '显示头发' } } } },
		sch: { name: '不采用' }, tch: { name: '也不採用' }
	} }
	const before = json(m), item = { key: 'setting', type: 'select', options: [{ value: '原始值', label: '默认设置' }] }
	assert.equal(ui.getLocalizedManifestText(m, 'name'), '機器優化')
	assert.equal(ui.getLocalizedConfigText(m, item, 'label'), '打開設置')
	assert.equal(ui.getLocalizedConfigText(m, item, 'description'), '選擇文件')
	assert.equal(ui.getInlineLocalizedText(ui.getLocalizedConfigText(m, item, 'errorText'), { value: '简体路径' }), '無法打開：简体路径')
	item.valueLabels = ui.getLocalizedConfigValueLabels(m, item)
	const options = ui.getSelectConfigOptions(item, '原始值')
	assert.equal(options[0].value, '原始值'); assert.equal(options[0].label, '顯示頭髮')
	assert.equal(Object.keys(item.valueLabels)[0], '原始值')
	assert.equal(json(m), before)
	game.language = 'modsch'; assert.equal(ui.getLocalizedManifestText(m, 'name'), '机器优化')
	game.language = 'tch'; assert.equal(ui.getLocalizedManifestText(m, 'name'), '也不採用')
	game.language = 'en'; assert.equal(ui.getLocalizedManifestText(m, 'name'), 'Fallback')
	game.language = 'modtch'
})
check('all current catalog panel and manifest/settings strings use source wording', () => {
	const catalog = JSON.parse(read(path.join(gameRoot, 'modloader/translations.json')))
	loader.state.translationCatalog = catalog
	const group = catalog.languages.modsch || catalog.languages.sch
	for (const [key, value] of Object.entries(group.modloader)) if (typeof value === 'string') assert.equal(ui.t(key), converter.convertText(value), key)
	for (const key of Object.keys(ui.PANEL_TEXT.en)) {
		game.language = 'modsch'; const sch = ui.t(key)
		game.language = 'modtch'; assert.equal(ui.t(key), converter.convertText(sch), key)
	}
	for (const dir of fs.readdirSync(path.join(gameRoot, 'mods'), { withFileTypes: true }).filter(d => d.isDirectory())) {
		const file = path.join(gameRoot, 'mods', dir.name, 'mod.json')
		if (!fs.existsSync(file)) continue
		const base = JSON.parse(read(file)), m = ui.applyTranslationCatalogToManifest(clone(base), base.id, dir.name)
		for (const key of ['name', 'description']) {
			game.language = 'modsch'; const sch = ui.getLocalizedManifestText(m, key)
			game.language = 'modtch'; assert.equal(ui.getLocalizedManifestText(m, key), converter.convertText(sch), dir.name + '.' + key)
		}
		const config = m.translations?.modsch?.config || m.translations?.sch?.config || {}
		for (const [key, fields] of Object.entries(config)) for (const prop of Object.keys(fields)) {
			if (typeof fields[prop] !== 'string') continue
			game.language = 'modsch'; const sch = ui.getLocalizedConfigText(m, { key }, prop)
			game.language = 'modtch'; assert.equal(ui.getLocalizedConfigText(m, { key }, prop), converter.convertText(sch), dir.name + '.' + key + '.' + prop)
		}
	}
})
check('native language switching/lookup and preference id work without real saves', () => {
	const native = read(path.join(gameRoot, 'scripts/game.js'))
	const start = native.indexOf('\n\tchangeLanguage(id)'), end = native.indexOf('\n\tinitScreenSize()', start)
	const pStart = native.indexOf('\n\tpronounce('), pEnd = native.indexOf('\n\tgetResourceNodeValues(', pStart)
	assert.ok(start >= 0 && end > start && pEnd > pStart)
	vm.runInContext('globalThis.LanguageFixture = class {' + native.slice(start, end) + native.slice(pStart, pEnd) + '}', context)
	const g = new context.LanguageFixture()
	let preferences = 0
	Object.assign(g, { languages: loader.applyLanguages(['en', 'sch', 'tch']), language: 'en', plane: 0, stuff: [],
		splash: { init() {} }, switchPlane() {}, store: { reinit() {} }, messenger: { setState() {} }, savePreferences() { preferences++ } })
	loader.state.game = g
	for (const id of ['modtch', 'modsch', 'tch', 'en', 'modtch']) {
		g.changeLanguage(g.languages.indexOf(id)); assert.equal(g.language, id)
		if (id === 'modtch') assert.equal(g.pronounce('messages', 424), converter.convertText(source.messages[424].modsch))
		if (id === 'modsch') assert.equal(g.pronounce('messages', 424), source.messages[424].modsch)
	}
	assert.equal(preferences, 5)
	const savedIndex = g.languageId
	assert.equal(loader.applyLanguages(['en', 'sch', 'tch'])[savedIndex], 'modtch')
	delete g.words.messages[424]
	assert.equal(g.pronounce('messages', 424), g.words_en.messages[424])
	assert.equal(json(source), sourceBefore)
})
check('variant validation rejects self-reference and chained variants', () => {
	assert.throws(() => loader.registerLanguage('bad', { sourceLanguage: 'bad', transformText: String }), /different sourceLanguage/)
	assert.throws(() => loader.registerLanguage('bad', { sourceLanguage: 'modtch', transformText: String }), /base language/)
})
check('native language menu receives names without re-running afterWords', () => {
	let hooks = 0
	loader.on('afterWords', () => { hooks++ }, 'menu-fixture')
	loader.applyWords(getWords())
	const before = hooks
	context.window.abstract_getWords = getWords
	ui.installLanguageBridge()
	const menuWords = context.window.abstract_getWords()
	for (const id of loader.applyLanguages(['en', 'sch', 'tch'])) assert.equal(typeof menuWords[id]?.splash?.language, 'string', id)
	assert.equal(menuWords.modtch.splash.language, '語言：繁體中文[優化]')
	assert.equal(menuWords.modsch.splash.language, source.splash.language.modsch)
	assert.equal(hooks, before)
	assert.equal(menuWords.modtch.messages, undefined, 'Menu bridge supplies only labels')
})
console.log(JSON.stringify({ result: 'PASS', groups: checks.length, checks, fields: 756, messages: 425,
	initMs: +initMs.toFixed(2), firstWordsMs: +firstMs.toFixed(2), cachedWordsMs: +repeatMs.toFixed(2),
	boundary: 'Real source in isolated VM; DOM/side effects are fixtures, no player-game acceptance' }, null, 2))
