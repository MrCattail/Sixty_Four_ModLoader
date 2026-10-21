const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const gameRoot = path.resolve(__dirname, '../../..')
const scriptRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../scripts')
const source = ['stuff', 'codex', 'bezier', 'game'].map(name => fs.readFileSync(path.join(gameRoot, 'scripts', name + '.js'), 'utf8')).join('\n')
const punctureKey = 'enableGradientPunctureRelocationFix', penaltyKey = 'enableGradientRelocationPenaltyFix'
const results = [], failures = []
function check(name, run) {
	try { run(); results.push(name) } catch (error) { failures.push({ name, message: error.stack }); console.error('FAIL: ' + name) }
}
function fixture(puncture = true, penalty = true, reverse = false) {
	const config = { [punctureKey]: puncture, [penaltyKey]: penalty }, handlers = [], warnings = [], prices = [], transfers = [], sounds = []
	class Cloud {
		constructor() { this.percentages = [] }
		addResourcePercentageList(values) { this.percentages = Array.from(values) }
		addDescription() {} addQEString() {} addInfo() {} addRefundList() {} addResourceList() {} setDarkMode() {}
	}
	const context = vm.createContext({ console: { log() {}, warn(...args) { warnings.push(args) } }, Sprite: class {}, Cloud })
	vm.runInContext(source + '\nglobalThis.types={Game,Gradient,Puncture,Entity,Chasm};globalThis.codex=abstract_getCodex()', context)
	context.window = context
	const api = {
		config: { get: (name, fallback) => Object.hasOwn(config, name) ? config[name] : fallback },
		on: (event, fn) => { assert.equal(event, 'afterVanillaScripts'); handlers.push(fn) },
		patch(target, name, factory) { assert.equal(typeof target[name], 'function'); target[name] = factory(target[name]) }
	}
	context.ModLoader = { register: mod => mod.init(api) }
	const files = ['gradient-puncture-relocation-fix.js', 'gradient-relocation-penalty-fix.js']
	if (reverse) files.reverse()
	for (const name of files) vm.runInContext(fs.readFileSync(path.join(scriptRoot, name), 'utf8'), context, { filename: name })
	handlers.forEach(fn => fn())
	const installed = context.types.Game.prototype.massRelocate
	handlers.forEach(fn => fn())
	assert.equal(context.types.Game.prototype.massRelocate, installed, 'lifecycle registration is idempotent')
	const { Game, Gradient, Entity, Chasm } = context.types
	const g = Object.create(Game.prototype)
	Object.assign(g, {
		codex: context.codex, entitiesInGame: { mega3: 1 }, stuff: [], stuffMap: {}, vfx: [], plane: 0,
		resources: Array(10).fill(0), resourcePops: Array(10).fill(0), analytics: { frame: [] },
		stats: { timeSinceLastDelete: 77, machinesSold: 0, machinesBuild: 0, totalResourcesMined: Array(10).fill(0), absoluteResourcesCount: 0 },
		mouse: { sxy: [0, 0], xy: [0, 0], delta: [0, 0], state: 0, positionChanged: false },
		pixelRatio: 1, unit: 1, zoom: 1, punch: {}, resourceHomes: Array.from({ length: 10 }, () => [0, 0]),
		resourceNoise: { noise3_Classic: () => -1 }, resourceTransferType: 3, renderLimitOfAKind: 2,
		memorycomplexCenter: [-1000, -1000], memorycomplexRadius: 1, waypoints2: [], onlyones: {},
		store: { compositionUpdate() {} }, pronounce: () => '', xyToUV: p => p.slice(), uvToXYUntranslated: p => p.slice(),
		createExhaust() {}, createResourceExplosion() {}, createImpact() {}, playSound(...args) { sounds.push(args) },
		requestResources() { throw new Error('Relocation must not request resources') }
	})
	// Real Chasm network refresh can touch stationary entities during Gradient.init.
	g.chasm = Object.assign(Object.create(Chasm.prototype), { master: g, name: 'chasm', position: [-1, 0], soi: [[1, 0]], chasmOrder: 0, chasmNetworkKey: 1 })
	const nativePrice = g.getRealPrice, nativeTransfer = g.createResourceTransfer
	g.getRealPrice = function (name, sale, extra) { const value = nativePrice.call(this, name, sale, extra); prices.push({ name, sale, count: this.entitiesInGame[name], value: Array.from(value) }); return value }
	g.createResourceTransfer = function (...args) { transfers.push(Array.from(args[0])); return nativeTransfer.apply(this, args) }
	function add(name, position, value = 1) {
		let entity
		if (name === 'gradient' || name === 'puncture') entity = g.addEntity(name, position.slice())
		else {
			entity = Object.assign(Object.create(Entity.prototype), { master: g, name, position: position.slice(), soi: [], entitySpan: 0 })
			g.stuff.push(entity); g.stuffMap['u' + position[0] + 'v' + position[1]] = entity
			g.entitiesInGame[name] = (g.entitiesInGame[name] || 0) + 1
		}
		assert(entity)
		if (entity instanceof Gradient) { entity.penalty = value; entity.init() }
		return entity
	}
	function prepare(entities) {
		g.updatePointerState({ sxy: entities[0].position.map(n => n + .1), button: 0 })
		g.processE()
		if (entities.length > 1) { g.relocationCandidatesList = entities; g.pickupEntitiesForRelocation() }
		assert.equal(g.relocationList.length, entities.length)
	}
	function preview(destination) {
		g.updatePointerState({ sxy: destination.map(n => n + .1), button: 1 })
		g.processMove()
		return g.canPlace
	}
	function settle() {
		for (const effect of g.vfx) effect.update(2000)
		g.vfx = g.vfx.filter(effect => !effect.terminate)
	}
	return { g, config, add, prepare, preview, settle, warnings, prices, transfers, sounds, types: context.types }
}
function position(entity, expected) { assert.deepEqual(Array.from(entity.position), expected) }
function batch(h, entities, positions) { h.g.interactionMode = 'relocate'; h.g.massRelocate(entities, positions) }
function state(h) {
	const g = h.g
	return {
		stuff: g.stuff.slice(), map: { ...g.stuffMap }, counts: { ...g.entitiesInGame },
		entities: g.stuff.map(e => [e, e.position, e.penalty, e.node, e.hints, e.chasmNetwork, e.chasmPath]),
		network: g.chasm.chasmNetworkKey, stats: JSON.stringify(g.stats), resources: g.resources.slice(), effects: g.vfx.slice()
	}
}
function unchanged(h, before) {
	const after = state(h)
	assert.deepEqual(after, before)
	assert.equal(h.g.__cattailGradientPunctureRelocationActive, undefined)
}

for (const p of [false, true]) for (const keep of [false, true]) {
	for (const initial of [.5, 1]) check('single Puncture / fixes=' + p + ',' + keep + ' / penalty=' + initial, () => {
		const h = fixture(p, keep), { g } = h, source = h.add('gradient', [0, 0], initial), target = h.add('puncture', [10, 10])
		h.add('puncture', [20, 20]); h.add('puncture', [30, 30])
		source.soul = .35; source.soulPower = 7; source.customState = { token: 'preserved' }
		const custom = source.customState
		h.prepare([source]); assert.equal(h.preview([10, 10]), p); g.processUp()
		if (p) {
			position(source, [10, 10]); assert.equal(g.entityAtCoordinates([10, 10]), source)
			assert(!g.stuff.includes(target)); assert.equal(g.entitiesInGame.gradient, 1); assert.equal(g.entitiesInGame.puncture, 2)
			assert.equal(source.penalty, 1); assert.equal(source.soul, .35); assert.equal(source.soulPower, 7); assert.equal(source.customState, custom)
			assert.equal(source.hints[0].percentages[0], 2, 'actual Gradient.initHint sees full yield')
			assert.equal(source.getDiscrete(1)[0], 4096 * 0.10416666666666667)
			assert.equal(h.prices.length, 1); assert.equal(h.prices[0].count, 2); assert.equal(h.transfers[0][9], 524288)
			assert.equal(h.transfers.length, 1); assert.equal(g.resources[9], 0, 'credit is deferred to native VFX completion')
			g.processUp(); assert.equal(h.transfers.length, 1)
			h.settle(); assert.equal(g.resources[9], 524288); assert.equal(g.stats.totalResourcesMined[9], 524288); assert.equal(g.stats.absoluteResourcesCount, 524288)
			h.settle(); assert.equal(g.resources[9], 524288); assert.equal(g.resources[4], 0); assert.equal(g.stats.machinesSold, 0)
		} else { position(source, [0, 0]); assert.equal(g.entityAtCoordinates([10, 10]), target); assert.equal(source.penalty, initial); assert.equal(h.transfers.length, 0) }
		assert.equal(g.canRelocate(target), false, 'Puncture eligibility remains native')
		assert.equal(h.warnings.length, 0)
	})
	check('ordinary E / fixes=' + p + ',' + keep, () => {
		const h = fixture(p, keep), e = h.add('gradient', [0, 0])
		h.prepare([e]); assert(h.preview([10, 10])); h.g.processUp()
		position(e, [10, 10]); assert.equal(e.penalty, keep ? 1 : .5); assert.equal(h.transfers.length, 0); assert(h.g.resources.every(n => n === 0))
	})
	check('mixed batch and swap / fixes=' + p + ',' + keep, () => {
		const h = fixture(p, keep), a = h.add('gradient', [0, 0], .5), b = h.add('gradient', [2, 0]), s = h.add('silo', [4, 0]), swapped = h.add('gradient', [14, 10])
		h.add('puncture', [10, 10])
		batch(h, [a, b, s], [[10, 10], [12, 10], [14, 10]])
		if (p) { position(a, [10, 10]); position(b, [12, 10]); position(s, [14, 10]); position(swapped, [4, 0]); assert.equal(a.penalty, 1); assert.equal(b.penalty, keep ? 1 : .5); assert.equal(swapped.penalty, keep ? 1 : .5); assert.equal(h.transfers.length, 1) }
		else { position(a, [0, 0]); position(b, [2, 0]); position(s, [4, 0]); position(swapped, [14, 10]); assert.equal(h.transfers.length, 0) }
	})
}
for (const count of [2, 3, 4]) check('real batch E / Puncture count=' + count, () => {
	const h = fixture(), a = h.add('gradient', [0, 0], .5), b = h.add('gradient', [2, 0], .5)
	for (let i = 0; i < count; i++) h.add('puncture', [11 + i * 2, 10])
	h.prepare([a, b]); assert(h.preview([12, 10])); h.g.processUp()
	position(a, [11, 10]); position(b, [13, 10]); assert.equal(a.penalty, 1); assert.equal(b.penalty, 1)
	assert.deepEqual(h.prices.map(q => q.count), [count - 1, count - 2])
	assert.equal(h.transfers.length, 1); h.settle()
	assert.equal(h.g.resources[9], 8192 * (8 ** (count - 1) + 8 ** (count - 2)))
})
check('selection overlap moves same objects', () => {
	const h = fixture(), a = h.add('gradient', [0, 0]), b = h.add('silo', [-1, 0]); h.add('puncture', [1, 0])
	batch(h, [a, b], [[1, 0], [0, 0]]); position(a, [1, 0]); position(b, [0, 0]); assert.equal(h.g.entitiesInGame.gradient, 1)
})
for (const keep of [false, true]) check('ordinary swap preserves both gradients / keep=' + keep, () => {
	const h = fixture(true, keep), a = h.add('gradient', [0, 0]), b = h.add('gradient', [10, 10])
	h.prepare([a]); assert(h.preview([10, 10])); h.g.processUp()
	position(a, [10, 10]); position(b, [0, 0]); assert.equal(a.penalty, keep ? 1 : .5); assert.equal(b.penalty, keep ? 1 : .5)
})
const invalid = {
	'non-Gradient onto another Puncture': (h, e, p) => { h.add('puncture', [12, 10]); return [[e, h.add('silo', [2, 0])], [[10, 10], [12, 10]]] },
	'duplicate destination': (h, e) => [[e, h.add('silo', [2, 0])], [[10, 10], [10, 10]]],
	'duplicate source': (h, e) => [[e, e], [[10, 10], [12, 10]]],
	'protected target': (h, e, p) => { p.indestructible = true; return [[e], [[10, 10]]] },
	'protected source': (h, e) => { e.indestructible = true; return [[e], [[10, 10]]] },
	'Memory Complex target': (h, e) => { h.g.memorycomplexCenter = [10, 10]; return [[e], [[10, 10]]] },
	'Memory Complex source': (h, e) => { h.g.memorycomplexCenter = [0, 0]; return [[e], [[10, 10]]] },
	'large footprint': (h, e) => { e.entitySpan = 1; return [[e], [[10, 10]]] },
	'malformed second position': (h, e) => [[e, h.add('silo', [2, 0])], [[10, 10], null]],
	'stale source map': (h, e) => { delete h.g.stuffMap.u0v0; return [[e], [[10, 10]]] },
	'swap source already booked': (h, e) => { const s = h.add('silo', [2, 0]); h.add('silo', [12, 10]); return [[e, s, h.add('silo', [4, 0])], [[10, 10], [12, 10], [2, 0]]] },
	'cube blocks second member': (h, e) => { h.add('cube', [12, 10]); return [[e, h.add('silo', [2, 0])], [[10, 10], [12, 10]]] },
	'ending active': (h, e) => { h.g.entitiesInGame.pinhole = 1; return [[e], [[10, 10]]] },
	'void plane': (h, e) => { h.g.plane = 1; return [[e], [[10, 10]]] },
	'move unlock absent': (h, e) => { h.g.entitiesInGame.mega3 = 0; return [[e], [[10, 10]]] }
}
for (const [name, setup] of Object.entries(invalid)) check('reject whole batch: ' + name, () => {
	const h = fixture(), e = h.add('gradient', [0, 0], .5), p = h.add('puncture', [10, 10]), [entities, positions] = setup(h, e, p), before = state(h)
	batch(h, entities, positions); unchanged(h, before); assert.equal(h.transfers.length, 0); assert.equal(h.warnings.length, 0)
})
for (const failure of ['clear', 'price', 'setPosition', 'penaltyInit', 'transfer']) check('rollback injected ' + failure, () => {
	const h = fixture(), a = h.add('gradient', [0, 0], .5), b = h.add('gradient', [2, 0])
	h.add('puncture', [10, 10]); h.add('puncture', [12, 10])
	const original = h.g.clearCell, quote = h.g.getRealPrice, transfer = h.g.createResourceTransfer, set = a.setPosition, init = a.init
	let calls = 0
	if (failure === 'clear') h.g.clearCell = function (...args) { original.apply(this, args); if (++calls === 2) throw new Error('injected clear') }
	if (failure === 'price') h.g.getRealPrice = function (...args) { if (++calls === 2) throw new Error('injected price'); return quote.apply(this, args) }
	if (failure === 'setPosition') a.setPosition = function (...args) { set.apply(this, args); throw new Error('injected setPosition') }
	if (failure === 'penaltyInit') a.init = function () { init.call(this); if (this.position[0] === 10 && this.penalty === 1) throw new Error('injected penaltyInit') }
	if (failure === 'transfer') h.g.createResourceTransfer = function (...args) { transfer.apply(this, args); throw new Error('injected transfer after enqueue') }
	const before = state(h)
	batch(h, [a, b], [[10, 10], [12, 10]]); unchanged(h, before); assert.equal(h.warnings.length, 1)
	h.settle(); assert.equal(h.g.resources[9], 0, 'failed transfer cannot pay later')
})
check('hot settings and successful retry', () => {
	const h = fixture(), e = h.add('gradient', [0, 0], .5); h.add('puncture', [10, 10])
	h.prepare([e]); assert(h.preview([10, 10])); h.config[punctureKey] = false; h.g.processUp(); position(e, [0, 0]); assert.equal(h.transfers.length, 0)
	h.config[punctureKey] = true; h.config[penaltyKey] = false; h.prepare([e]); assert(h.preview([10, 10])); h.g.processUp(); assert.equal(e.penalty, 1)
	h.config[penaltyKey] = true; h.prepare([e]); assert(h.preview([20, 20])); h.g.processUp(); assert.equal(e.penalty, 1)
	h.config[penaltyKey] = false; h.prepare([e]); assert(h.preview([30, 30])); h.g.processUp(); assert.equal(e.penalty, .5)
})
check('stale preview revalidates complete batch', () => {
	const h = fixture(), a = h.add('gradient', [0, 0]), b = h.add('gradient', [2, 0])
	h.add('puncture', [11, 10]); h.add('puncture', [13, 10]); h.prepare([a, b]); assert(h.preview([12, 10]))
	h.g.clearCell([13, 10]); h.add('cube', [13, 10])
	const before = state(h); h.g.processUp(); unchanged(h, before); assert.equal(h.transfers.length, 0)
})
check('preview does not delete or quote targets', () => {
	const h = fixture(), e = h.add('gradient', [0, 0]); h.add('puncture', [10, 10]); h.prepare([e]); const before = state(h)
	assert(h.preview([10, 10])); unchanged(h, before); assert.equal(h.prices.length, 0); assert.equal(h.transfers.length, 0)
})
check('wrapper order preserves upgrade priority', () => {
	const h = fixture(true, true, true), e = h.add('gradient', [0, 0], .5); h.add('puncture', [10, 10]); h.prepare([e]); assert(h.preview([10, 10])); h.g.processUp(); assert.equal(e.penalty, 1)
})
check('ordinary refusal changes no penalty', () => {
	const h = fixture(), e = h.add('gradient', [0, 0]); h.add('cube', [10, 10]); const before = state(h)
	batch(h, [e], [[10, 10]]); unchanged(h, before)
})
check('reentrant relocation is ignored during pricing', () => {
	const h = fixture(), e = h.add('gradient', [0, 0]); h.add('puncture', [10, 10])
	const quote = h.g.getRealPrice
	h.g.getRealPrice = function (...args) { this.massRelocate([e], [[40, 40]]); position(e, [0, 0]); return quote.apply(this, args) }
	batch(h, [e], [[10, 10]]); position(e, [10, 10]); assert.equal(h.transfers.length, 1); assert.equal(h.warnings.length, 0)
})
check('silent native refusal restores consumed target', () => {
	const h = fixture(), e = h.add('gradient', [0, 0]), s = h.add('silo', [2, 0]), swapped = h.add('silo', [12, 10])
	h.add('puncture', [10, 10])
	const quote = h.g.getRealPrice, eligible = h.g.canRelocate
	h.g.getRealPrice = function (...args) { this.canRelocate = target => target === swapped ? false : eligible.call(this, target); return quote.apply(this, args) }
	const before = state(h); batch(h, [e, s], [[10, 10], [12, 10]]); unchanged(h, before)
	assert.equal(h.transfers.length, 0); assert.equal(h.warnings.length, 1)
})
check('silent removal refusal restores entire batch', () => {
	const h = fixture(), e = h.add('gradient', [0, 0]); h.add('puncture', [10, 10]); h.g.clearCell = () => {}
	const before = state(h); batch(h, [e], [[10, 10]]); unchanged(h, before); assert.equal(h.prices.length, 0); assert.equal(h.transfers.length, 0); assert.equal(h.warnings.length, 1)
})
check('failed position update can retry without duplicate refund', () => {
	const h = fixture(), e = h.add('gradient', [0, 0], .5); h.add('puncture', [10, 10])
	const set = e.setPosition; let fail = true
	e.setPosition = function (...args) { set.apply(this, args); if (fail) { fail = false; throw new Error('one-shot failure') } }
	const before = state(h); batch(h, [e], [[10, 10]]); unchanged(h, before)
	batch(h, [e], [[10, 10]]); position(e, [10, 10]); assert.equal(e.penalty, 1); assert.equal(h.transfers.length, 1); h.settle(); assert.equal(h.g.resources[9], 8192)
})
console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', scenarios: results.length + failures.length, passed: results.length, failures, nativeVersion: 'desktop 1.3', limitations: 'Node VM; actual Game E/pointer/move/up/massRelocate, entity init/setPosition/Codex/Chasm/ResourceTransfer/addResources; synthetic world, projection/noise and UI/audio/Loader API. No full startup, Electron, player save, other Mods or Steam.' }, null, 2))
if (failures.length) process.exitCode = 1
