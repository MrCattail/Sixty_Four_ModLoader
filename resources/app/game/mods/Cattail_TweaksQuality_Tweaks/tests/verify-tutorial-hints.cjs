const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const ui = fs.readFileSync(path.resolve(root, '../../scripts/ui.js'), 'utf8')
const native = ui.slice(ui.indexOf('class DesktopExplainer {'), ui.indexOf('class MobileExplainer {'))
const script = fs.readFileSync(path.join(root, 'scripts/explainer-toggle.js'), 'utf8')
const storage = new Map()
let progress = -1
function boot(value) {
	let registration
	const events = {}
	const body = { append(el) { el.isConnected = true } }
	const ctx = vm.createContext({
		ModLoader: { register(r) { registration = r } },
		localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
		document: { body, createElement() { return { style: {}, hidden: false, innerHTML: '', classList: { add() {} }, remove() { this.isConnected = false } } } }
	})
	vm.runInContext(native + ';globalThis.Type = DesktopExplainer', ctx)
	vm.runInContext(script, ctx)
	registration.init({ config: { get: () => value }, on: (k, fn) => events[k] = fn,
		patch(target, key, wrapper) { target[key] = wrapper(target[key]) } })
	events.afterVanillaScripts()
	const game = { steamId: 'synthetic', splash: { isShown: false }, entitiesInGame: { cube: 0 }, resources: [0],
		messenger: { firedEvents: [] }, translation: [0, 0], pronounce: (_, i) => 'lesson ' + i,
		savePreferences() { progress = this.explainer.finished ? -1 : this.explainer.next } }
	game.explainer = new ctx.Type(game, progress)
	events.afterGameInit(null, game)
	return game
}
let game = boot(0)
game.explainer.update(40000)
assert.equal(game.explainer.finished, true)
assert.equal(game.explainer.element.hidden, true)
assert.equal(game.explainer.element.style.display, 'none')
assert.equal(progress, -1, 'disabled must not overwrite native progress')
game = boot(1)
assert.equal(progress, 0, 'enabling restores completed guide from first lesson')
game.explainer.update(30001)
assert.equal(game.explainer.element.innerHTML, 'lesson 0')
game.entitiesInGame.cube = 1
game.explainer.update(1)
assert.equal(progress, 1)
game = boot(1)
assert.equal(game.explainer.next, 1, 'ordinary restart resumes')
game = boot(0)
game.explainer.update(50000)
assert.equal(progress, 1)
assert.equal(game.explainer.timer, 0, 'disabled pauses timer')
game = boot(1)
assert.equal(progress, 0, 'off/on restarts')
game.explainer.next = 6
game.messenger.firedEvents[10] = true
game.translation[0] = 1
game.explainer.update(1)
assert.equal(game.explainer.finished, true)
assert.equal(progress, -1)
game = boot(1)
assert.equal(game.explainer.finished, true, 'completed remains stopped across restart')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json'), 'utf8'))
assert.equal(manifest.config.enableExplainer.default, 0)
assert.equal(manifest.config.enableExplainer.step, 1)
assert.equal(manifest.config.enableExplainer.reloadPolicy, 'reload')
assert.equal(manifest.entries.filter(x => x === 'scripts/explainer-toggle.js').length, 1)
for (const language of manifest.languages) {
	assert.ok(manifest.config.enableExplainer.label[language], language)
	assert.ok(manifest.config.enableExplainer.description[language], language)
	assert.ok(manifest.config.enableExplainer.valueLabels['0'][language], language)
	assert.ok(manifest.config.enableExplainer.valueLabels['1'][language], language)
}
console.log('Tutorial hints: native lifecycle, pause/restart/resume/completion and 20-language configuration passed.')
