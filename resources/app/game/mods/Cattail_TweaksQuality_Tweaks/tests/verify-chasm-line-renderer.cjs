'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mod = 'Cattail_TweaksQuality_Tweaks'
const enable = 'enableChasmLineRenderer'
const legacy = 'chasmLineRendererMode'
const distance = 'enableChasmLineDistanceOverride'
const storageKey = key => `modloader:${mod}:config:${key}`
const script = fs.readFileSync(process.env.CHASM_RENDERER_SOURCE || path.resolve(__dirname, '../scripts/chasm-line-renderer.js'), 'utf8')
const loader = fs.readFileSync(path.resolve(__dirname, '../../../modloader/loader.js'), 'utf8')
let checks = 0
function check(name, run) { run(); checks++; }
function loaderFunction(name) {
	const match = loader.match(new RegExp('\\tconst ' + name + ' = function \\([^]*?\\n\\t\\}(?=\\r?\\n)'))
	assert.ok(match, 'actual Loader function: ' + name)
	return match[0]
}
const configSource = ['storageKey', 'parseStoredConfig', 'getConfigValue', 'setConfigValue'].map(loaderFunction).join('\n')

function boot(options = {}) {
	const store = options.store || new Map()
	const fail = options.fail || {}
	const metrics = { native: 0, strokes: 0, composites: 0, gpu: 0, warnings: [], writes: [], removals: [] }
	const localStorage = {
		getItem(key) { if (fail.read && key === storageKey(legacy)) throw Error('blocked legacy read'); return store.has(key) ? store.get(key) : null },
		setItem(key, value) {
			if (fail.write && key === storageKey(enable) || fail.neutralize && key === storageKey(legacy)) throw Error('blocked write')
			store.set(key, String(value)); metrics.writes.push(key)
		},
		removeItem(key) { if (fail.remove) throw Error('blocked delete'); store.delete(key); metrics.removals.push(key) }
	}
	const state = { configs: { [mod]: { values: {} } } }
	const configContext = vm.createContext({ state, localStorage, showStatus() {}, JSON })
	vm.runInContext(configSource + '\nthis.configApi = { get: getConfigValue, set: setConfigValue, parse: parseStoredConfig };', configContext)
	for (const [key, fallback] of [[enable, true], [distance, false]]) state.configs[mod].values[key] = configContext.configApi.parse(localStorage.getItem(storageKey(key)), fallback)
	const config = {
		get(key, fallback) { return configContext.configApi.get(mod, key, fallback) },
		set(key, value) { return configContext.configApi.set(mod, key, value) }
	}
	const hooks = {}, callbacks = [], demands = []
	let renderEnabled = options.renderApi !== false
	const gl = new Proxy({}, { get(target, key) {
		if (key === 'drawArraysInstanced') return () => { if (fail.gpu) throw Error('GPU draw failed'); metrics.gpu++ }
		if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true
		if (key === 'isContextLost') return () => false
		if (key === 'getAttribLocation') return () => 0
		if (String(key).startsWith('create') || key === 'getUniformLocation') return () => ({})
		if (key === 'getShaderInfoLog' || key === 'getProgramInfoLog') return () => ''
		if (/^[A-Z_]+$/.test(String(key))) return key
		return () => {}
	} })
	const context2d = () => ({ save() {}, restore() {}, beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() { metrics.strokes++ }, drawImage() { metrics.composites++ } })
	class Game {
		constructor() {
			this.ctx = context2d(); this.w = 800; this.h = 600; this.unit = 20; this.plane = false
			this.chasm = { position: [2, 3] }; this.resources = [1]; this.resourceHomes = [[50, 60]]
			this.codex = { resources: [{ triplet: ['#778', '#889', '#99a'] }] }; this.resourcePops = [0]
			this.visible = options.visible !== false
		}
		uvToXYUntranslated(p) { return [p[0] * 20, p[1] * 10] }
		isVisible() { return this.visible }
		renderChasm() { metrics.native++ }
	}
	const api = {
		config,
		on(name, handler) { hooks[name] = handler },
		patch(target, name, wrap) { target[name] = wrap(target[name]) },
		render: options.noRenderApi ? undefined : {
			registerLayer() {}, isEnabled() { return renderEnabled },
			demandLayer(id, definition) { demands.push(definition) },
			onLayer(id, callback, definition) { callbacks.push({ callback, definition }) }
		}
	}
	const window = new EventTarget()
	const preview = vm.runInNewContext(loaderFunction('dispatchConfigPreview') + '\n dispatchConfigPreview', {
		window, CustomEvent, cloneConfigValue: value => JSON.parse(JSON.stringify(value))
	})
	vm.runInNewContext(script, { window, Game, localStorage, console: { warn(...args) { metrics.warnings.push(args.join(' ')) } }, document: { createElement() { return { width: 0, height: 0, getContext(kind) { return kind === 'webgl2' ? (options.gpuUnavailable ? null : gl) : context2d() } } } }, ModLoader: { register(definition) { definition.init(api) } } })
	hooks.afterVanillaScripts()
	const game = new Game()
	return { game, config, state, store, metrics, fail, window,
		setRenderApi(value) { renderEnabled = value },
		preview(value) { preview({ mod: { id: mod, path: mod }, item: { key: enable }, value }) },
		draw() {
			game.renderChasm()
			for (const entry of callbacks) if (entry.definition.enabled({ game })) entry.callback({ game, ctx: game.ctx })
		},
		demanded() { return demands.some(d => d.enabled({ game })) }
	}
}

const modes = [[0, false], [1, true], [-2, false], [2, true], ['canvas', false], ['Canvas2D', false], ['canvas 2d', false], ['vanilla', false], ['webgl', true], ['gpu', true], ['1', true], ['0', false], [null, false], [false, false], [true, true], ['unexpected', true], [{}, true]]
for (const flag of [false, true]) for (const [mode, webgl] of modes) check(`migrate ${flag}/${JSON.stringify(mode)}`, () => {
	const store = new Map([[storageKey(enable), JSON.stringify(flag)], [storageKey(legacy), JSON.stringify(mode)], ['unrelated', 'preserve']])
	const r = boot({ store })
	assert.equal(r.config.get(enable), flag && webgl)
	assert.equal(JSON.parse(store.get(storageKey(enable))), flag && webgl)
	assert.equal(store.has(storageKey(legacy)), false)
	assert.equal(store.get('unrelated'), 'preserve')
	assert.ok(r.metrics.writes.every(key => key === storageKey(enable)))
	assert.ok(r.metrics.removals.every(key => key === storageKey(legacy)))
	r.config.set(enable, !(flag && webgl))
	assert.equal(boot({ store }).config.get(enable), !(flag && webgl), 'later choice survives reload')
})
for (const flag of [undefined, false, true]) check('missing legacy mode/' + flag, () => {
	const store = flag === undefined ? new Map() : new Map([[storageKey(enable), JSON.stringify(flag)]])
	const r = boot({ store }); assert.equal(r.config.get(enable), flag !== false); assert.equal(r.metrics.writes.length, 0)
})
check('legacy mode without boolean', () => {
	const r = boot({ store: new Map([[storageKey(legacy), '0']]) }); assert.equal(r.config.get(enable), false)
})
check('raw legacy alias follows Loader parsing semantics', () => {
	const r = boot({ store: new Map([[storageKey(legacy), 'canvas']]) }); assert.equal(r.config.get(enable), false)
})
check('write failure preserves legacy choice and retries on restart', () => {
	const store = new Map([[storageKey(legacy), '0']]); const r = boot({ store, fail: { write: true } })
	r.draw(); assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.native, 1); assert.equal(store.get(storageKey(legacy)), '0'); assert.ok(r.metrics.warnings.length)
	const retry = boot({ store }); assert.equal(retry.config.get(enable), false); assert.equal(store.has(storageKey(legacy)), false)
	retry.config.set(enable, true); assert.equal(boot({ store }).config.get(enable), true)
})
check('failed deletion neutralizes mode before a later saved choice', () => {
	const store = new Map([[storageKey(legacy), '0']]); const r = boot({ store, fail: { remove: true } })
	assert.equal(r.config.get(enable), false); assert.equal(store.get(storageKey(legacy)), '1'); assert.ok(r.metrics.warnings.length)
	r.config.set(enable, true); const again = boot({ store }); assert.equal(again.config.get(enable), true); assert.equal(store.has(storageKey(legacy)), false)
})
check('failed cleanup and neutralization retain old data for retry', () => {
	const store = new Map([[storageKey(legacy), '0']]); const r = boot({ store, fail: { remove: true, neutralize: true } })
	r.draw(); assert.equal(r.metrics.gpu, 0); assert.equal(store.get(storageKey(legacy)), '0'); assert.ok(r.metrics.warnings.length)
	const retry = boot({ store }); assert.equal(retry.config.get(enable), false); assert.equal(store.has(storageKey(legacy)), false)
	retry.config.set(enable, true); assert.equal(boot({ store }).config.get(enable), true)
})
check('unreadable legacy storage stays conservative without writes', () => {
	const r = boot({ fail: { read: true } }); r.draw(); assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.native, 1); assert.equal(r.metrics.writes.length, 0)
})
for (const noRenderApi of [false, true]) for (const flag of [false, true]) for (const far of [false, true]) check(`render routes api=${!noRenderApi}/enabled=${flag}/distance=${far}`, () => {
	const r = boot({ noRenderApi, store: new Map([[storageKey(enable), JSON.stringify(flag)], [storageKey(distance), JSON.stringify(far)]]) })
	r.draw()
	assert.equal(r.metrics.gpu, flag ? 1 : 0)
	assert.equal(r.metrics.strokes, !flag && far ? 1 : 0)
	assert.equal(r.metrics.native, !flag && !far ? 1 : 0)
	if (!noRenderApi) assert.equal(r.demanded(), flag || far)
})
for (const renderApi of [true, false]) for (const far of [false, true]) check(`unavailable WebGL fallback/api=${renderApi}/distance=${far}`, () => {
	const r = boot({ renderApi, gpuUnavailable: true, store: new Map([[storageKey(distance), JSON.stringify(far)]]) }); r.draw()
	assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.strokes + r.metrics.native, 1)
})
check('WebGL draw failure falls back and stays off for that renderer', () => {
	const r = boot({ fail: { gpu: true } }); r.draw(); r.fail.gpu = false; r.draw()
	assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.strokes, 2)
})
check('distance override remains independent when optimization is off', () => {
	const r = boot({ visible: false, store: new Map([[storageKey(enable), 'false'], [storageKey(distance), 'true']]) }); r.draw(); assert.equal(r.metrics.strokes, 1); assert.equal(r.metrics.gpu, 0)
})
check('far lines remain filtered without distance override', () => {
	const r = boot({ visible: false }); r.draw(); assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.strokes, 0)
})
check('saved toggle changes route and survives reload; staged changes do not persist', () => {
	const r = boot(); r.draw(); assert.equal(r.metrics.gpu, 1)
	const before = new Map(r.store)
	r.preview(false); assert.deepEqual(r.store, before); r.draw(); assert.equal(r.metrics.gpu, 2)
	r.preview(true); assert.deepEqual(r.store, before); assert.equal(r.config.get(enable), true)
	r.config.set(enable, false); r.draw(); assert.equal(r.metrics.native, 1); assert.equal(boot({ store: r.store }).config.get(enable), false)
	r.config.set(enable, true); r.draw(); assert.equal(r.metrics.gpu, 3)
	r.setRenderApi(false); r.draw(); assert.equal(r.metrics.gpu, 4)
})
check('actual Loader loads the current manifest schema but leaves the retired mode in legacy storage', () => {
	const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../mod.json'), 'utf8'))
	const store = new Map([[storageKey(legacy), '0']])
	const state = { configs: {} }
	const context = vm.createContext({ state, localStorage: { getItem: key => store.has(key) ? store.get(key) : null } })
	const names = ['isObject', 'clone', 'cloneConfigValue', 'cloneConfigSchemaItem', 'normalizeConfigSchema', 'inferConfigType', 'parseStoredConfig', 'storageKey', 'loadModConfig']
	vm.runInContext(names.map(loaderFunction).join('\n') + '\nthis.load = loadModConfig;', context)
	context.load({ id: mod, manifest })
	assert.equal(state.configs[mod].schema.length, Object.keys(manifest.config).length)
	assert.equal(state.configs[mod].values[legacy], undefined)
	assert.equal(store.get(storageKey(legacy)), '0')
	assert.equal(state.configs[mod].values[enable], true)
	assert.equal(manifest.config[enable].type, 'boolean')
	assert.equal(manifest.config[enable].reloadPolicy, 'hot')
})
console.log(`Chasm line renderer: ${checks} isolated migration and rendering checks passed (actual script and Loader config functions; synthetic world, Canvas and WebGL).`)
