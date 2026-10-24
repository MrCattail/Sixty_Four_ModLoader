'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { EventEmitter } = require('node:events')
const hooksModule = require('../../../modloader/placement-render-hooks')
const modRoot = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.resolve(modRoot, '../../scripts/game.js'), 'utf8')
function native(name) {
  const match = source.match(new RegExp('^\\t' + name + '\\([^\\r\\n]*\\)\\{[\\s\\S]*?^\\t\\}', 'm'))
  assert.ok(match, name)
  return vm.runInNewContext('({' + match[0] + '})')[name]
}
const methodNames = ['renderEntities', 'renderEntitiesAbstract', 'renderGrid', 'xyToUV', 'uvToXY', 'uvToXYUntranslated']
function fixture(options = {}) {
  const events = new EventEmitter(), log = [], stack = [], state = { fillStyle: 'initial', strokeStyle: 'initial', lineCap: 'round', lineWidth: 1 }
  const ctx = {}
  for (const key of Object.keys(state)) Object.defineProperty(ctx, key, { get: () => state[key], set(v) { state[key] = v; log.push(['set', key, v]) } })
  for (const key of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke']) ctx[key] = (...args) => log.push([key, ...args])
  ctx.save = () => { stack.push({ ...state }); log.push(['save']) }
  ctx.restore = () => { Object.assign(state, stack.pop()); log.push(['restore']) }
  function Game() {}
  Object.assign(Game.prototype, Object.fromEntries(methodNames.map(name => [name, native(name)])), {
    renderloop() { this.step() }
  })
  if (options.unknown) Game.prototype.renderGrid = function () { log.push(['unknown-grid']) }
  const bridge = options.noBridge ? null : hooksModule.install(Game.prototype)
  const game = Object.assign(Object.create(Game.prototype), { version: '1.3', isMobile: false, stuff: [], stuffMap: {}, ctx,
    w: 1280, h: 720, w2: 640, h2: 360, unit: 72 * (options.zoom || .03), zoom: options.zoom || .03,
    pixelRatio: 1, translation: [0, 0], plane: 0, itemInHand: { name: 'candidate' }, hoveredCell: [0, 0],
    codex: { entities: { candidate: {} } }, isVisible: entity => !entity.hidden,
    step() {
      this[options.normal ? 'renderEntities' : 'renderEntitiesAbstract'](17)
      options.between?.(this)
      this.renderGrid()
    } })
  function add(name, u, v, span = 0, hidden = false) {
    const entity = { name, position: [u, v], entitySpan: span, hidden,
      render(dt) { log.push(['entity', this.name, dt]); options.render?.(this) }, darkrender(dt) { log.push(['dark', this.name, dt]) } }
    game.stuff.push(entity)
    for (let y = v - span; y <= v + span; y++) for (let x = u - span; x <= u + span; x++) game.stuffMap['u' + x + 'v' + y] = entity
    return entity
  }
  function rebuild() {
    game.stuffMap = {}
    for (const entity of game.stuff) for (let y = entity.position[1] - entity.entitySpan; y <= entity.position[1] + entity.entitySpan; y++) for (let x = entity.position[0] - entity.entitySpan; x <= entity.position[0] + entity.entitySpan; x++) game.stuffMap['u' + x + 'v' + y] = entity
  }
  const config = { enablePlacementShadowTraversalReuse: true, ...options.config }, stages = []
  const api = {
    config: { get(key, fallback) { return key in config ? config[key] : fallback } },
    on(name, fn) { if (name === 'afterVanillaScripts') stages.push(fn) },
    patch(object, name, wrap) { object[name] = wrap(object[name]) }, render: null
  }
  const win = { addEventListener: (name, fn) => events.on(name, fn), __cattailPlacementRenderHooksV1: bridge,
    __cattailTweaksFloorGridV1: { renderClearView(g) { log.push(['tweaks-floor', g === game]); return true } } }
  const context = vm.createContext({ window: win, Game, ModLoader: { register(entry) { entry.init(api) } } })
  for (const file of ['placement-shadow.js', 'clear-view-options.js']) vm.runInContext(fs.readFileSync(path.join(modRoot, 'scripts', file), 'utf8'), context, { filename: file })
  for (const run of stages) run({}, game)
  function set(key, value) { config[key] = value; events.emit('modloader:config-preview', { detail: { modId: 'Cattail_TweaksQuality_Tweaks', key, value } }) }
  function draw(on) {
    if (on !== undefined) set('enablePlacementShadowTraversalReuse', on)
    log.length = 0; game.renderloop()
    assert.equal(stack.length, 0)
    return { commands: JSON.stringify(log), state: JSON.stringify(state), path: bridge?.gridResult(game) }
  }
  return { game, add, rebuild, draw, set, bridge, config, ctx, log, Game, native }
}

async function main() {
  let count = 0
  const check = (name, run) => { run(); count++; console.log('PASS ' + name) }
  const equivalent = f => { const before = f.draw(false), after = f.draw(true); assert.equal(after.commands, before.commands); assert.equal(after.state, before.state); return after }
  check('real native Canvas command order/state matches at near, middle and far zoom with multi-cell, hidden and conductor footprints', () => {
    for (const zoom of [2, .3, .03]) for (const normal of [false, true]) {
      const f = fixture({ zoom, normal }); f.add('building', 0, 0, 1); f.add('conductor', -2, 0); f.add('hidden', 3, -1, 1, true)
      assert.equal(equivalent(f).path.path, 'entity-traversal-reuse')
    }
  })
  check('all eight existing grid/clipping combinations preserve exactly the same commands, including current three true settings', () => {
    for (let bits = 0; bits < 8; bits++) {
      const f = fixture({ config: { disableClearViewGrid: !!(bits & 1), useTweaksClearViewGridStyle: !!(bits & 2), disableClearViewBuildingClipping: !!(bits & 4) } })
      f.add('A', 0, 0, 2); f.add('conductor', -4, 1); f.add('hidden', -2, -3, 1, true); assert.equal(equivalent(f).path.path, 'entity-traversal-reuse')
    }
  })
  check('upgrade exclusions, duplicate footprints, negative coordinates and empty/null-prototype maps retain native shading', () => {
    const f = fixture(); f.add('base', -2, -1, 1); f.add('other', 0, 0, 1); f.game.codex.entities.candidate.isUpgradeTo = 'base'; equivalent(f)
    f.game.stuffMap = Object.assign(Object.create(null), f.game.stuffMap); equivalent(f)
    f.game.stuff.length = 0; f.game.stuffMap = {}; delete f.game.codex.entities.candidate; equivalent(f)
  })
  check('erasers, transported objects, no hand, mobile and other plane delegate without stale candidates', () => {
    for (const mutate of [g => { g.itemInHand = null }, ...['eraser', 'eraser2', 'eraser3'].map(name => g => { g.itemInHand = { name } }), g => { g.transportedEntity = {} }, g => { g.plane = 1 }, g => { g.isMobile = true }]) {
      const f = fixture(); f.add('A', 0, 0); mutate(f.game); equivalent(f)
      assert.equal(f.draw(true).path.path, 'native-area-scan')
    }
  })
  check('projection functions and view bounds are used as supplied, including reversed bounds', () => {
    const f = fixture(); f.add('A', 0, 0, 1)
    const original = f.game.xyToUV
    f.game.xyToUV = function (p) { const uv = original.call(this, p); return [-uv[0], uv[1]] }
    equivalent(f)
  })
  check('a million-cell baseline becomes only known footprint lookups without losing fills', () => {
    const f = fixture(); f.add('A', 0, 0, 1); f.add('conductor', -3, 0); f.add('hidden', 4, 2, 1, true)
    f.game.w = 3360; f.game.h = 1890; f.game.w2 = 1680; f.game.h2 = 945; f.game.unit = 5.67; f.game.pixelRatio = 1.5
    let queries = 0; const map = f.game.stuffMap
    f.game.stuffMap = new Proxy(map, { get(target, key) { queries++; return target[key] } }); const before = f.draw(false)
    f.game.stuffMap = map; const after = f.draw(true)
    assert.ok(queries > 1000000); assert.equal(after.path.mapLookups, 19); assert.equal(after.path.fills, 19)
    assert.equal(after.commands, before.commands); console.log(JSON.stringify({ baselineMapQueries: queries, optimizedMapLookups: after.path.mapLookups, preservedFills: after.path.fills }))
  })
  check('build, upgrade, removal, single/batch movement and reloaded maps reflect the next frame', () => {
    const f = fixture(); const a = f.add('base', 0, 0), b = f.add('B', -2, -3, 1); equivalent(f)
    f.add('new', 5, -3, 1); equivalent(f); a.name = 'upgraded'; equivalent(f)
    f.game.stuff.splice(f.game.stuff.indexOf(a), 1); f.rebuild(); equivalent(f)
    b.position = [7, -8]; f.rebuild(); equivalent(f)
    for (const entity of f.game.stuff) entity.position = [entity.position[0] - 9, entity.position[1] + 4]
    f.rebuild(); equivalent(f); f.game.stuff = f.game.stuff.slice(); f.rebuild(); equivalent(f)
  })
  check('skipped, repeated and exceptional passes fall back and never reuse the last complete frame', () => {
    const f = fixture(); f.add('A', 0, 0); assert.equal(f.draw(true).path.path, 'entity-traversal-reuse')
    const old = f.game.renderEntitiesAbstract; f.game.renderEntitiesAbstract = () => {}
    assert.equal(f.draw(true).path.path, 'native-area-scan'); f.game.renderEntitiesAbstract = old
    f.game.step = function () { this.renderEntitiesAbstract(17); this.renderEntitiesAbstract(17); this.renderGrid() }
    assert.equal(f.draw(true).path.path, 'native-area-scan')
    const boom = Error('entity sentinel'), e = f.game.stuff[0]; e.render = () => { throw boom }
    assert.throws(() => f.draw(true), error => error === boom); e.render = () => {}
    f.game.step = function () { this.renderGrid() }; assert.equal(f.draw(true).path.path, 'native-area-scan')
  })
  check('mid-frame position, array length or map changes select native before any optimized fill', () => {
    for (const between of [g => { g.stuff[0].position[0]++ }, g => { g.stuff.push(g.stuff[0]) }, g => { g.stuffMap = { ...g.stuffMap } }]) {
      const f = fixture({ between }); f.add('A', 0, 0); assert.equal(f.draw(true).path.path, 'native-area-scan')
    }
  })
  check('dense close views, oversized footprints, Proxy and accessor occupancy select native', () => {
    const f = fixture({ zoom: 2 }); f.game.w = f.game.h = 10; f.add('A', 0, 0, 3)
    const close = equivalent(f); assert.equal(close.path.fallbackReason, 'native-area-no-larger-than-entity-count'); assert.equal(close.path.collectedCells, 0)
    const large = fixture(); large.add('A', 0, 0, 158); assert.equal(large.draw(true).path.path, 'native-area-scan')
    const proxy = fixture(); proxy.add('A', 0, 0); proxy.game.stuffMap = new Proxy(proxy.game.stuffMap, {}); equivalent(proxy); assert.equal(proxy.draw(true).path.path, 'native-area-scan')
    const getter = fixture(); const a = getter.add('A', 0, 0); Object.defineProperty(getter.game.stuffMap, 'u0v0', { get: () => a }); assert.equal(equivalent(getter).path.fallbackReason, 'accessor-occupancy')
  })
  check('partial Canvas exceptions propagate by identity without repeating native shadows', () => {
    const f = fixture({ normal: true }); f.add('A', 0, 0); const boom = Error('fill sentinel'); let fills = 0
    f.ctx.fill = () => { fills++; throw boom }; assert.throws(() => f.draw(true), error => error === boom); assert.equal(fills, 1)
  })
  check('unknown native source or absent private adapter leaves original behavior available', () => {
    const unknown = fixture({ unknown: true }); unknown.add('A', 0, 0); assert.equal(unknown.bridge.supported, false); equivalent(unknown)
    const missing = fixture({ noBridge: true }); missing.add('A', 0, 0); equivalent(missing)
  })
  check('default true, hot off/on/cancel and original manifest entries/settings remain consistent', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, 'mod.json'), 'utf8'))
    assert.equal(manifest.entries.length, 41); assert.equal(Object.keys(manifest.config).length, 58)
    assert.equal(manifest.config.enablePlacementShadowTraversalReuse.default, true); assert.equal(manifest.config.enablePlacementShadowTraversalReuse.reloadPolicy, 'hot')
    const f = fixture(); f.add('A', 0, 0); assert.equal(f.draw().path.path, 'entity-traversal-reuse')
    assert.equal(f.draw(false).path.path, 'native-area-scan'); assert.equal(f.draw(true).path.path, 'entity-traversal-reuse')
  })
  console.log('PLACEMENT_SHADOW_OK=' + count)
}
module.exports = { fixture, native, methodNames, main }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
