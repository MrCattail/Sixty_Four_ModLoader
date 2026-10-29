'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const mod = 'Cattail_TweaksQuality_Tweaks'
const enable = 'enableChasmLineWebGL'
const legacy = 'chasmLineRendererMode'
const distance = 'enableChasmLineAlwaysVisible'
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
const { fixture } = require('../../../modloader/tools/config-identifier-compatibility-contract.test.js')
const oldEnable = 'enableChasmLineRenderer'

function boot(options = {}) {
	const store = options.store || new Map()
	const fail = options.fail || {}
	const metrics = { native: 0, strokes: 0, composites: 0, gpu: 0, warnings: [], writes: [], removals: [] }
	const configFixture = fixture(store, { fail: { read: fail.read ? storageKey(legacy) : undefined, write: fail.write ? storageKey(enable) : undefined } })
	const state = configFixture.state
	// Disable the independent distance override in this synthetic world unless a scenario enables it.
	if (!store.has(storageKey(distance))) state.configs[mod].values[distance] = false
	metrics.writes = configFixture.writes
	const localStorage = { getItem: key => store.has(key) ? store.get(key) : null }
	const config = {
		get(key, fallback) { return configFixture.get(mod, key, fallback) },
		set(key, value) { return configFixture.set(mod, key, value) }
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
for (const flag of [false, true]) for (const [mode, webgl] of modes) check(`read old configuration ${flag}/${JSON.stringify(mode)}`, () => {
	const store = new Map([[storageKey(oldEnable), JSON.stringify(flag)], [storageKey(legacy), JSON.stringify(mode)], ['unrelated', 'preserve']])
	const r = boot({ store })
	assert.equal(r.config.get(enable), flag && webgl)
	assert.equal(store.has(storageKey(enable)), false)
	assert.equal(store.get(storageKey(legacy)), JSON.stringify(mode))
	assert.equal(store.get('unrelated'), 'preserve')
	assert.equal(r.metrics.writes.length, 0)
	assert.equal(r.metrics.removals.length, 0)
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
check('startup never writes or deletes legacy settings; failed canonical save can be retried', () => {
	const store = new Map([[storageKey(legacy), '0']]); const r = boot({ store, fail: { write: true } })
	r.draw(); assert.equal(r.metrics.gpu, 0); assert.equal(r.metrics.native, 1)
	assert.equal(r.metrics.writes.length, 0); assert.equal(r.metrics.removals.length, 0)
	assert.throws(() => r.config.set(enable, true), /injected write failure/)
	assert.equal(store.has(storageKey(enable)), false); assert.equal(store.get(storageKey(legacy)), '0')
	const retry = boot({ store }); assert.equal(retry.config.get(enable), false)
	retry.config.set(enable, true); assert.equal(boot({ store }).config.get(enable), true)
	assert.equal(store.get(storageKey(legacy)), '0')
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
check('actual Loader resolves the retired mode without changing stored bytes', () => {
	const store = new Map([[storageKey(legacy), '0']]); const f = fixture(store)
	assert.equal(f.state.configs[mod].schema.length, 55)
	assert.equal(f.state.configs[mod].values[legacy], undefined)
	assert.equal(f.state.configs[mod].values[enable], false)
	assert.equal(store.get(storageKey(legacy)), '0'); assert.equal(f.writes.length, 0)
	assert.equal(f.mod.manifest.config[enable].type, 'boolean')
	assert.equal(f.mod.manifest.config[enable].reloadPolicy, 'hot')
})
console.log(`Chasm line renderer: ${checks} isolated migration and rendering checks passed (actual script and Loader config functions; synthetic world, Canvas and WebGL).`)
