'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const nodeUrl = require('node:url')

const gameRoot = path.resolve(__dirname, '..', '..')
const modRoot = path.join(gameRoot, 'mods', 'Cattail_Tweaks_简体中文优化')
const scriptPath = path.join(modRoot, 'scripts', 'trilingual-loader.js')
const manifestPath = path.join(modRoot, 'mod.json')
const source = fs.readFileSync(scriptPath, 'utf8')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const languageIds = [ 'en', 'sch', 'modsch', 'ru', 'de', 'ptbr', 'it', 'es', 'fr', 'nl', 'cz', 'pl', 'jp', 'kr', 'tch', 'thai', 'hu', 'lv', 'ro', 'no' ]
const OPEN_MODE_KEY = 'translationFileOpenMode'
const OPEN_ACTION_KEY = 'openTranslationFile'

assert.equal(manifest.version, '0.2.0')
assert.deepEqual(Object.keys(manifest.translations).sort(), languageIds.slice().sort())
for (const languageId of languageIds) {
	const config = manifest.translations[languageId]?.config
	assert.ok(config, `${languageId} has config translations`)
	for (const key of [ OPEN_MODE_KEY, OPEN_ACTION_KEY ]) {
		assert.equal(typeof config[key]?.label, 'string', `${languageId}.${key}.label`)
		assert.ok(config[key].label.trim(), `${languageId}.${key}.label is not empty`)
		assert.equal(typeof config[key]?.description, 'string', `${languageId}.${key}.description`)
		assert.ok(config[key].description.trim(), `${languageId}.${key}.description is not empty`)
	}
	assert.equal(typeof config[OPEN_MODE_KEY].valueLabels?.reveal, 'string', `${languageId} reveal label`)
	assert.equal(typeof config[OPEN_MODE_KEY].valueLabels?.system, 'string', `${languageId} system label`)
	assert.match(config[OPEN_MODE_KEY].valueLabels.system, /\.js/i, `${languageId} system label keeps the .js warning`)
	assert.equal(typeof config[OPEN_MODE_KEY].sectionLabel, 'string', `${languageId}.${OPEN_MODE_KEY}.sectionLabel`)
	for (const key of [ 'sectionLabel', 'buttonLabel', 'pendingText', 'successText', 'errorText' ]) {
		assert.equal(typeof config[OPEN_ACTION_KEY][key], 'string', `${languageId}.${OPEN_ACTION_KEY}.${key}`)
		assert.ok(config[OPEN_ACTION_KEY][key].trim(), `${languageId}.${OPEN_ACTION_KEY}.${key} is not empty`)
	}
	assert.match(config[OPEN_ACTION_KEY].errorText, /\{value\}/, `${languageId} error text preserves the error placeholder`)
}

assert.match(source, /settings\.types\.includes\('action'\)/)
assert.match(source, /type: 'select'[\s\S]*?default: 'reveal'[\s\S]*?persist: 'change'/)
assert.match(source, /type: 'action'[\s\S]*?onAction/)
assert.match(source, /api\.asset\('locale\/trilingual-data\.js'\)/)
assert.match(source, /showItemInFolder/)
assert.match(source, /openPath/)

;(async function () {
const registrations = []
const hooks = {}
const shellCalls = []
let openPathResult = ''
let registeredMod = null
const values = new Map()
const trilingualData = { sample: { en: 'Sample', sch: '示例', modsch: '范例' } }
const sandbox = {
	console,
	URL,
	Promise,
	globalThis: null,
	window: { location: { href: 'file:///D:/Steam/steamapps/common/Sixty%20Four/win-unpacked/resources/app/game/index.html' } },
	__cattailTweaksSimplifiedChineseTrilingual: trilingualData,
	require(id) {
		if (id === 'electron') return {
			shell: {
				showItemInFolder(target) { shellCalls.push({ method: 'showItemInFolder', target }) },
				async openPath(target) { shellCalls.push({ method: 'openPath', target }); return openPathResult }
			}
		}
		if (id === 'url') return nodeUrl
		throw new Error(`Unexpected module: ${id}`)
	},
	ModLoader: {
		register(mod) { registeredMod = mod }
	}
}
sandbox.globalThis = sandbox
for (const relative of ['vendor/opencc-js/cn2t.js', 'scripts/traditional-converter.js', 'scripts/author-export.js']) {
	vm.runInNewContext(fs.readFileSync(path.join(modRoot, relative), 'utf8'), sandbox, { filename: relative })
}
vm.runInNewContext(source, sandbox, { filename: scriptPath })
assert.ok(registeredMod, 'mod registers')

const createApi = actionCapable => ({
	on(name, handler) { hooks[name] = handler },
	asset(relativePath) { return `mods/Cattail_Tweaks_简体中文优化/${relativePath}` },
	config: {
		get(key, fallback) { return values.has(key) ? values.get(key) : fallback },
		set(key, value) { values.set(key, value); return value }
	},
	ui: {
		settings: {
			types: actionCapable ? [ 'select', 'action' ] : [ 'select' ],
			register(definitions) { registrations.push(definitions); return () => {} }
		}
	}
})

registeredMod.init(createApi(false))
assert.equal(typeof hooks.afterWords, 'function', 'locale hook works without the action API')
assert.equal(registrations.length, 0, 'older loaders do not receive unsupported settings')

registeredMod.init(createApi(true))
assert.equal(registrations.length, 1)
const definitions = registrations[0]
assert.equal(definitions.length, 3)
const mode = definitions.find(item => item.key === OPEN_MODE_KEY)
const action = definitions.find(item => item.key === OPEN_ACTION_KEY)
assert.equal(mode.type, 'select')
assert.equal(mode.default, 'reveal')
assert.equal(mode.persist, 'change')
assert.deepEqual(Array.from(mode.options, option => option.value), [ 'reveal', 'system' ])
assert.equal(action.type, 'action')
assert.equal(typeof action.onAction, 'function')

values.set(OPEN_MODE_KEY, 'reveal')
await action.onAction()
assert.equal(shellCalls.at(-1).method, 'showItemInFolder')
assert.match(shellCalls.at(-1).target.replace(/\\/g, '/'), /\/mods\/Cattail_Tweaks_简体中文优化\/locale\/trilingual-data\.js$/)

values.set(OPEN_MODE_KEY, 'system')
await action.onAction()
assert.equal(shellCalls.at(-1).method, 'openPath')
assert.match(shellCalls.at(-1).target.replace(/\\/g, '/'), /\/mods\/Cattail_Tweaks_简体中文优化\/locale\/trilingual-data\.js$/)

openPathResult = 'No application is associated with the specified file.'
await assert.rejects(action.onAction(), /No application is associated/)

console.log('Chinese Optimization open-translation contract passed: 20 languages, feature detection, immediate select, Explorer reveal, and default association.')
})().catch(function (error) {
	console.error(error)
	process.exitCode = 1
})
