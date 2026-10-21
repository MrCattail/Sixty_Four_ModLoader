'use strict'

// Read-only consumer checks. Does not start Electron or read/write player saves.
// Run with Node; optionally pass --words <vanilla-1.3-words.js> and
// --game <installed-1.3-game.js> when the game scripts are stored elsewhere.
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const modRoot = path.resolve(__dirname, '..')
const gameRoot = path.resolve(modRoot, '..', '..')
const options = {}
for (let i = 2; i < process.argv.length; i += 2) {
	const key = process.argv[i]
	assert.ok(['--words', '--game'].includes(key) && process.argv[i + 1], 'Expected --words/--game followed by a file path')
	options[key] = path.resolve(process.argv[i + 1])
}
const wordsPath = options['--words'] || path.join(gameRoot, 'scripts', 'words.js')
const gamePath = options['--game'] || path.join(gameRoot, 'scripts', 'game.js')
const readUtf8 = filename => new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename))
const wordsSource = readUtf8(wordsPath)
const vanilla = vm.runInNewContext(wordsSource + '\n;abstract_getWords()', {}, { timeout: 5000 })
const dataSource = readUtf8(path.join(modRoot, 'locale', 'trilingual-data.js'))
const loaderSource = readUtf8(path.join(modRoot, 'scripts', 'trilingual-loader.js'))
const serialize = value => JSON.stringify(value)
const clone = value => JSON.parse(serialize(value))
const dataKey = '__cattailTweaksSimplifiedChineseTrilingual'

function flatten(value, parts = [], result = new Map(), trilingual = false) {
	if ((trilingual && value && Object.hasOwn(value, 'modsch')) || typeof value === 'string') {
		const label = parts.reduce((text, part) => typeof part === 'number' ? `${text}[${part}]` : text ? `${text}.${part}` : part, '')
		result.set(label, { value, parts })
		return result
	}
	assert.ok(value && typeof value === 'object', `Invalid branch: ${parts.join('.')}`)
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) assert.ok(Object.hasOwn(value, i), `Sparse array: ${parts.join('.')}[${i}]`)
	}
	for (const key of Object.keys(value)) flatten(value[key], [...parts, Array.isArray(value) ? Number(key) : key], result, trilingual)
	return result
}

function createConsumer(source = dataSource) {
	let definition
	let hook
	const context = vm.createContext({ ModLoader: { register(value) { definition = value } } })
	vm.runInContext(source, context, { timeout: 5000 })
	for (const relative of ['vendor/opencc-js/cn2t.js', 'scripts/traditional-converter.js', 'scripts/author-export.js']) {
		vm.runInContext(readUtf8(path.join(modRoot, relative)), context, { timeout: 5000 })
	}
	vm.runInContext(loaderSource, context, { timeout: 5000 })
	assert.equal(definition?.id, 'Cattail_Tweaks_简体中文优化')
	definition.init({ on(name, handler) { assert.equal(name, 'afterWords'); hook = handler } })
	assert.equal(typeof hook, 'function')
	return { data: context[dataKey], hook }
}

const { data, hook } = createConsumer()
const leaves = flatten(data, [], new Map(), true)
const english = flatten(vanilla.en)
const chinese = flatten(vanilla.sch)
assert.equal(english.size, 751, 'Use the intended desktop 1.3 baseline')
assert.equal(chinese.size, 555, 'Re-audit new official Chinese before updating this baseline')
assert.equal(leaves.size, 752, 'All 1.3 text plus the existing exclusive credit must be present')
assert.equal(data.messages.length, 425)
assert.deepEqual(Object.keys(data.memories).sort(), ['memory0', 'memory1', 'memory2', 'memory3'])

const newPaths = new Set()
for (let i = 263; i < 425; i++) newPaths.add(`messages[${i}]`)
for (let i = 0; i < 4; i++) for (const key of ['header', 'lore']) newPaths.add(`memories.memory${i}.${key}`)
for (const key of ['slot', 'newslot', 'imported', 'importClipboard', 'wipe', 'switchslot']) newPaths.add(`splash.${key}`)
for (const key of ['whitehole', 'collapsing', 'malformed', 'oversaturated', 'expanding', 'morphing', 'intercalating']) {
	for (const field of ['name', 'description']) newPaths.add(`entities.${key}.${field}`)
}
for (const key of ['newHole', 'newUpgrade', 'lowTier', 'orificeUpgrade', 'tier', 'noorbs']) newPaths.add(`random.${key}`)
assert.equal(newPaths.size, 196)

for (const [label, { value }] of leaves) {
	assert.deepEqual(Object.keys(value).sort(), ['en', 'modsch', 'sch'], `${label}: exact three-language schema`)
	assert.equal(value.en, english.get(label)?.value ?? null, `${label}: exact native English reference`)
	assert.equal(value.sch, chinese.get(label)?.value ?? null, `${label}: exact native Chinese reference or null`)
	assert.equal(typeof value.modsch, 'string', label)
	assert.ok(value.modsch.trim(), `${label}: empty translation`)
	if (newPaths.has(label)) {
		assert.equal(value.sch, null, `${label}: unofficial translation must not populate sch`)
		assert.match(value.modsch, /\p{Script=Han}/u, `${label}: untranslated new text`)
		assert.ok(!/[<>]|\{\w+\}|\$\{/.test(value.en), `${label}: review new markup/placeholders explicitly`)
		assert.ok(!/[<>]|\{\w+\}|\$\{/.test(value.modsch), `${label}: unexpected markup/placeholders`)
	}
}
for (const label of english.keys()) assert.ok(leaves.has(label), `${label}: missing translation`)
for (const label of newPaths) assert.ok(leaves.has(label), `${label}: missing 1.3 addition`)
assert.deepEqual([...leaves.keys()].filter(label => !english.has(label)), ['credits[49]'])
assert.equal(data.credits[49].en, null)
assert.equal(data.credits[49].sch, null)

// Snapshot of the user-maintained Simplified text at modtch approval (2026-10-16).
// The prior pre-review hash was stale before this change; do not restore old dialogue.
const unchangedRows = [...leaves].filter(([label]) => !newPaths.has(label) && label !== 'achievements[15].description')
	.map(([label, { value }]) => [label, value.modsch])
	.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
assert.equal(unchangedRows.length, 555)
assert.equal(crypto.createHash('sha256').update(serialize(unchangedRows)).digest('hex'), 'fb57302a4ac9ca103fdbc5b50b1cabc08126dd3000da2874dfe80154588465c6', 'Unexpected change to preserved optimized text')
assert.match(data.achievements[15].description.modsch, /同一轮游戏/)
assert.match(data.achievements[15].description.modsch, /64 小时/)
assert.ok(data.messages[287].modsch.includes('二级解构加速器'), 'Spell dialogue uses the approved spoken machine name')
assert.ok(data.messages[393].modsch.includes(data.entities.converter41.name.modsch), 'Rooftop dialogue uses current oxidizer name')
assert.ok(data.messages[393].modsch.includes(data.entities.doublechannel2.name.modsch), 'Rooftop dialogue uses current cooler name')
assert.ok(data.entities.intercalating.description.modsch.includes(data.entities.gradient.name.modsch), 'Orbifold uses current Gradient Well name')
assert.ok(!/渐变井|现实石|工业去稳定器|贝塔派伦氧化塔|主动式通道冷却器/.test([...newPaths].map(p => leaves.get(p).value.modsch).join('\n')), 'Old glossary leaked into new text')

// Execute the actual native lookup methods without constructing Game or accessing a save.
const gameSource = readUtf8(gamePath)
const methodStart = gameSource.indexOf('\n\tpronounce(')
const methodEnd = gameSource.indexOf('\n\tgetResourceNodeValues(', methodStart)
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'Native resolver boundary changed; inspect before adapting')
const Resolver = vm.runInNewContext('(class Resolver {' + gameSource.slice(methodStart, methodEnd) + '})', {}, { timeout: 5000 })
const englishBefore = serialize(vanilla.en)
const chineseBefore = serialize(vanilla.sch)
const words = clone(vanilla)
const external = { name: '外部词条', nested: { description: '嵌套外部词条' } }
const previousMessages = ['old']
words.modsch = { externalNamespace: external, splash: { save: 'old', externalLabel: '额外标签' }, messages: previousMessages }
assert.equal(hook(words), words)
assert.equal(words.modsch.externalNamespace, external)
assert.equal(words.modsch.splash.externalLabel, '额外标签')
assert.equal(words.modsch.splash.save, data.splash.save.modsch)
assert.notEqual(words.modsch.messages, previousMessages)
assert.notEqual(words.modsch.messages, data.messages)
assert.equal(words.modsch.messages.length, 425)
assert.equal(serialize(words.en), englishBefore)
assert.equal(serialize(words.sch), chineseBefore)
const firstApply = serialize(words.modsch)
hook(words)
assert.equal(serialize(words.modsch), firstApply, 'Second afterWords application must be stable')

const model = new Resolver()
model.words_en = words.en
for (const language of ['modsch', 'en', 'sch', 'modsch']) {
	model.language = language
	model.words = words[language]
	for (const [label, { value, parts }] of english) {
		const expected = language === 'modsch' ? leaves.get(label).value.modsch : language === 'sch' ? chinese.get(label)?.value ?? value : value
		assert.equal(model.pronounce(...parts), expected, `${language}: ${label}`)
	}
}
delete words.modsch.messages[424]
delete words.modsch.memories.memory3.lore
assert.equal(model.pronounce('messages', 424), words.en.messages[424], 'Missing array entry still falls back to English')
assert.equal(model.pronounce('memories', 'memory3', 'lore'), words.en.memories.memory3.lore, 'Missing nested entry still falls back to English')
hook(words)
assert.equal(model.pronounce('messages', 424), data.messages[424].modsch)
assert.equal(model.pronounce('memories', 'memory3', 'lore'), data.memories.memory3.lore.modsch)
const freshWords = clone(vanilla)
hook(freshWords)
assert.equal(freshWords.modsch.messages[424], data.messages[424].modsch, 'Fresh language load includes final new dialogue')

// A damaged language leaf must still fail with a useful path at initialization.
const damaged = clone(data)
delete damaged.messages[424].sch
assert.throws(() => createConsumer(`globalThis.${dataKey} = ${serialize(damaged)}`), /missing sch at messages\[424\]/)

console.log(JSON.stringify({
	result: 'PASS', trilingualLeaves: leaves.size, newEntriesWithNullSch: newPaths.size,
	preservedOptimizedEntries: unchangedRows.length, updatedAchievementDescriptions: 1,
	messages: data.messages.length, memoryEntries: 8, referencePairsChecked: english.size,
	languageResolutionChecks: english.size * 4, fallbackChecks: 2,
	externalNamespaceAndArrays: 'PASS', repeatedAndFreshApply: 'PASS', malformedLeafRejection: 'PASS',
	boundary: 'Consumer VM and native lookup only; no full Loader integration, game UI, or player-save acceptance'
}, null, 2))
