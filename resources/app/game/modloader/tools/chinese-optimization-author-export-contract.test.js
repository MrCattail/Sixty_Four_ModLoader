'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const gameRoot = path.resolve(__dirname, '../..')
const modRoot = path.join(gameRoot, 'mods/Cattail_Tweaks_简体中文优化')
const read = file => fs.readFileSync(file, 'utf8')
const json = value => JSON.stringify(value)
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const evaluate = source => vm.runInNewContext(source + '\n;abstract_getWords()', {}, { timeout: 5000 })
const flatten = (value, prefix = '', out = {}) => {
	if (typeof value === 'string') out[prefix] = value
	else for (const key of Object.keys(value)) flatten(value[key], prefix ? prefix + '.' + key : key, out)
	return out
}
const extract = value => typeof value?.modsch === 'string' ? value.modsch : Array.isArray(value)
	? value.map(extract) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extract(item)]))

;(async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sixtyfour-author-contract-'))
	const appRoot = path.join(directory, 'app'), fixtureGame = path.join(appRoot, 'game')
	const fixtureMod = path.join(fixtureGame, 'mods/chinese'), dataPath = path.join(fixtureMod, 'locale/trilingual-data.js')
	const wordsPath = path.join(fixtureGame, 'scripts/words.js'), target = path.join(directory, 'words.js')
	fs.mkdirSync(path.dirname(dataPath), { recursive: true })
	fs.mkdirSync(path.dirname(wordsPath), { recursive: true })
	fs.copyFileSync(path.join(modRoot, 'locale/trilingual-data.js'), dataPath)
	fs.copyFileSync(path.join(gameRoot, 'scripts/words.js'), wordsPath)
	const vanillaSource = read(wordsPath), dataSource = read(dataPath), native = evaluate(vanillaSource)
	const originals = [path.join(gameRoot, 'scripts/words.js'), path.join(modRoot, 'locale/trilingual-data.js')].map(file => [file, hash(file)])
	const manifest = JSON.parse(read(path.join(modRoot, 'mod.json')))
	let definition, selection = { canceled: false, filePath: target }, dialogCalls = 0
	const revealed = [], settings = [], hooks = {}, checks = []
	const api = {
		asset: relative => pathToFileURL(path.join(fixtureMod, relative)).href,
		on(name, callback) { hooks[name] = callback }, state: { game: { language: 'modsch' } },
		ui: { settings: { types: ['select', 'action'], register(items) { settings.push(...items) } } }
	}
	const electron = {
		ipcRenderer: { async invoke(channel, options) {
			assert.equal(channel, 'modloader:dialog:save')
			assert.equal(options.defaultPath, 'words.js')
			assert.ok(options.properties.includes('showOverwriteConfirmation'))
			dialogCalls++; return selection
		} }, shell: { showItemInFolder(file) { revealed.push(file) } }
	}
	const context = vm.createContext({ console, URL, Buffer,
		window: { location: { href: pathToFileURL(path.join(fixtureGame, 'index.html')).href } },
		require: id => id === 'electron' ? electron : require(id),
		ModLoader: { register(mod) { definition = mod } }
	})
	for (const entry of manifest.entries) vm.runInContext(read(path.join(modRoot, entry)), context, { filename: entry })
	definition.init(api)
	const exporter = context.__cattailChineseAuthorExport, converter = context.__cattailChineseTraditional
	const action = settings.find(item => item.key === 'exportAuthorWords')
	assert.equal(action.type, 'action'); assert.equal(manifest.version, '0.2.0')
	for (const translation of Object.values(manifest.translations)) assert.ok(translation.config.exportAuthorWords.buttonLabel)
	const run = () => action.onAction({ definition: manifest.translations.modsch.config.exportAuthorWords })
	await run()
	assert.deepEqual(revealed, [target]); assert.equal(dialogCalls, 1)
	const copySource = read(target), copy = evaluate(copySource), simplified = extract(context.__cattailTweaksSimplifiedChineseTrilingual)
	simplified.splash.language = '语言：简体中文'
	const traditional = converter.convertWords(simplified); traditional.splash.language = '語言：繁體中文'
	assert.equal(json(copy.sch), json(simplified)); assert.equal(json(copy.tch), json(traditional))
	assert.equal(Object.keys(flatten(copy.sch)).length, 756); assert.equal(Object.keys(flatten(copy.tch)).length, 756)
	assert.equal(copy.sch.messages.length, 425); assert.equal(copy.tch.messages.length, 425)
	assert.equal(copy.sch.credits.length, 50); assert.equal(copy.tch.credits.length, 50)
	assert.equal(copy.sch.credits[42], '简体中文：空灵灵(Cattail), Daisy Chan, kevinlee7, YuLun')
	assert.equal(copy.sch.credits[43], '繁體中文：空灵灵(Cattail), Daisy Chan, kevinlee7')
	assert.equal(copy.sch.credits[49], '')

	assert.equal(copy.sch.random.eraserHint, '点击并拖动框选范围，可批量删除建筑')
	assert.equal(copy.sch.random.relocatorHint, '点击并拖动框选范围，可批量移动建筑。按住<div class="key">Shift</div> 可复制')
	assert.equal(copy.sch.random.relocate, '移动'); assert.equal(copy.sch.random.clone, '复制')
	assert.ok(copy.tch.random.relocatorHint.includes('<div class="key">Shift</div>'))
	checks.push('real Settings action exports all 756 fields, 425 messages and 50 credits per Chinese locale')
	assert.equal(json(Object.keys(copy)), json(Object.keys(native)))
	for (const key of Object.keys(native)) if (key !== 'sch' && key !== 'tch') assert.equal(json(copy[key]), json(native[key]), key)
	const exterior = source => {
		const ranges = exporter.locateLocales(source)
		for (const range of [ranges.sch, ranges.tch].sort((a, b) => b.start - a.start)) source = source.slice(0, range.start) + '<CHINESE>' + source.slice(range.end)
		return source
	}
	assert.equal(exterior(copySource), exterior(vanillaSource))
	assert.equal(copy.modsch, undefined); assert.equal(copy.modtch, undefined)
	checks.push('17 other languages and every byte outside the two replaced objects are preserved; standalone output')
	const modified = dataSource + '\n;globalThis.__cattailTweaksSimplifiedChineseTrilingual.messages[0].modsch = "刚保存的新译文！";'
	fs.writeFileSync(dataPath, modified)
	await run()
	assert.equal(evaluate(read(target)).sch.messages[0], '刚保存的新译文！')
	assert.equal(evaluate(read(target)).tch.messages[0], '剛保存的新譯文！')
	checks.push('each click reads saved source afresh, independent of loaded runtime words')
	const saved = read(target)
	selection = { canceled: true }
	assert.equal(await run(), '已取消导出。'); assert.equal(read(target), saved)
	assert.equal(revealed.length, 2)
	checks.push('cancel reports cancellation without writing or revealing a file')
	selection = { canceled: false, filePath: target }
	for (const bad of ['this is invalid JS', dataSource + '\ndelete globalThis.' + '__cattailTweaksSimplifiedChineseTrilingual.messages[1].modsch;']) {
		fs.writeFileSync(dataPath, bad); await assert.rejects(run()); assert.equal(read(target), saved)
	}
	fs.writeFileSync(dataPath, dataSource)
	fs.writeFileSync(wordsPath, vanillaSource.replace('function abstract_getWords()', 'function renamedWords()'))
	await assert.rejects(run(), /unique vanilla/); assert.equal(read(target), saved)
	fs.writeFileSync(wordsPath, vanillaSource)
	checks.push('invalid translation/source data fails before replacing an existing copy')
	for (const forbidden of [wordsPath, dataPath, path.join(appRoot, 'main.js')]) {
		selection = { canceled: false, filePath: forbidden }; await assert.rejects(run(), /outside resources\/app/)
	}
	const junction = path.join(directory, 'linked-app')
	fs.symlinkSync(appRoot, junction, process.platform === 'win32' ? 'junction' : 'dir')
	assert.throws(() => exporter.assertSafeTarget(fs, path, path.join(junction, 'game/scripts/words.js'), appRoot), /outside resources\/app/)
	const hardlink = path.join(directory, 'hardlinked.js'); fs.linkSync(wordsPath, hardlink)
	assert.throws(() => exporter.assertSafeTarget(fs, path, hardlink, appRoot), /linked file/)
	checks.push('active application paths, junction aliases and hardlinked source files are protected')
	const beforeNames = fs.readdirSync(directory).sort()
	const denied = new Proxy(fs, { get(object, key) { return key === 'renameSync' ? () => { throw Error('simulated rename failure') } : object[key] } })
	assert.throws(() => exporter.writeCopy(denied, path, crypto, target, 'replacement'), /rename failure/)
	assert.equal(read(target), saved); assert.deepEqual(fs.readdirSync(directory).sort(), beforeNames)
	checks.push('failed replacement keeps the previous file and removes only its own temporary file')
	const unusual = '/* comment with } */\nfunction abstract_getWords(){return {en:{splash:{language:`x`},messages:[`quote \\` } //`],credits:["a"]}, sch:{}, tch:{}}}'
	const smallData = 'globalThis.' + '__cattailTweaksSimplifiedChineseTrilingual=' + JSON.stringify({ splash: { language: { en: 'x', sch: 'x', modsch: '简体' } }, messages: [{ en: 'x', sch: 'x', modsch: '引号"与反斜杠\\和换行\n{value}<b>测试</b>' }], credits: [{ en: 'a', sch: 'a', modsch: '甲' }, { en: null, sch: null, modsch: '乙' }] })
	for (const source of [unusual, unusual.replace(/\n/g, '\r\n'), '\uFEFF' + unusual]) {
		const output = exporter.build(source, smallData, extract, converter, vm)
		assert.equal(exterior(output), exterior(source)); assert.equal(evaluate(output).sch.credits.length, 2)
	}
	assert.throws(() => exporter.locateLocales('function abstract_getWords(){return {en:{text:`${1}`},sch:{},tch:{}}}'), /Template expressions/)
	checks.push('scanner handles escaped quotes, braces, comments, LF/CRLF and BOM; rejects template expressions')
	for (const [file, before] of originals) assert.equal(hash(file), before, file)
	assert.equal(read(wordsPath), vanillaSource); assert.equal(read(dataPath), dataSource)
	checks.push('real game words and translator source remain unchanged')
	fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ passed: checks.length, checks }, null, 2))
	console.log('Chinese Optimization author-export contract passed: ' + checks.length + ' groups. ' + directory)
})().catch(error => { console.error(error); process.exitCode = 1 })
