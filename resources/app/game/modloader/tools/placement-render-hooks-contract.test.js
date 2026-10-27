'use strict'

const assert = require('node:assert/strict')
const adapter = require('../placement-render-hooks')
const placement = require('../diagnostics/placement-probe')
const { fixture, native } = require('../../mods/Cattail_TweaksQuality_Tweaks/tests/verify-placement-shadow.cjs')
let count = 0
function check(name, run) { run(); count++; console.log('PASS ' + name) }
check('known native methods retain source hashes and install once before wrappers', () => {
  const f = fixture(); assert.ok(f.bridge.supported)
  for (const [name, expected] of Object.entries(adapter.HASHES)) assert.equal(adapter.hash(f.bridge.original(name)), expected)
  assert.equal(adapter.install(f.Game.prototype), f.bridge)
})
check('default delegation preserves arguments, returns, exceptions and later method wrappers', () => {
  const f = fixture(); f.add('A', 0, 0); const original = f.game.renderGrid; let visits = 0
  f.game.renderGrid = function (...args) { visits++; return original.apply(this, args) }
  f.draw(false); f.draw(true); assert.equal(visits, 2)
  const error = Error('frame sentinel'); f.game.step = () => { throw error }
  assert.throws(() => f.draw(true), e => e === error)
  f.game.step = function () { this.renderGrid() }; assert.equal(f.draw(true).path.path, 'native-area-scan')
})
check('native source guard rejects altered methods and nonconfigurable descriptors without replacing them', () => {
  const proto = { renderGrid() {}, renderloop() {}, renderEntities: native('renderEntities'), renderEntitiesAbstract: native('renderEntitiesAbstract') }
  const old = proto.renderGrid; Object.defineProperty(proto, 'renderEntities', { configurable: false })
  const bridge = adapter.install(proto); assert.equal(bridge.supported, false); assert.equal(proto.renderGrid, old)
})
check('production reuse works without the optional diagnostic observer', () => {
  const f = fixture(); f.add('conductor', 0, 0); assert.equal(f.draw(true).path.fills, 1)
})
check('diagnostic compile preserves collection, optimization and original native capabilities in every sample kind', () => {
  const f = fixture(); f.add('A', 0, 0, 1)
  const controller = placement.installNativeHooks(f.Game.prototype, f.bridge)
  const snapshot = () => ({ focused: true, hidden: false, plane: 0, item: true, itemType: 'candidate', hovered: true, configSignature: '{}' })
  const capture = placement.createPlacementCapture({ game: f.game, controller, snapshot }); capture.start()
  for (let i = 0; i < 4; i++) {
    capture.beforeFrame(); const observed = f.draw(true); const data = capture.afterFrame({ methods: { renderGrid: 1, renderEntitiesAbstract: 1 } })
    assert.equal(observed.path.path, 'entity-traversal-reuse'); assert.equal(data.placementPath.path, 'entity-traversal-reuse')
    if (data.kind !== 'raw') { assert.equal(data.grid.executedCells, 0); assert.equal(data.grid.mapLookups, 9); assert.ok(data.grid.nativeAreaCells > 9) }
  }
  capture.stop(); controller.dispose(); assert.equal(f.draw(true).path.path, 'entity-traversal-reuse')
})
check('comparison rejects enabled optimization, while disabling restores the native protocol', () => {
  const f = fixture(); f.add('A', 0, 0)
  const controller = placement.installNativeHooks(f.Game.prototype, f.bridge)
  const snapshot = () => ({ focused: true, hidden: false, plane: 0, item: true, itemType: 'candidate', hovered: true, configSignature: '{}' })
  const capture = placement.createPlacementCapture({ game: f.game, controller, snapshot, comparison: true })
  assert.throws(() => capture.start(), /复用建筑遍历/)
  f.set('enablePlacementShadowReuse', false)
  const baseline = placement.createPlacementCapture({ game: f.game, controller, snapshot, comparison: true }); baseline.start(); baseline.beforeFrame()
  assert.equal(f.draw(false).path.path, 'native-area-scan'); assert.ok(baseline.afterFrame({}).grid.executedCells > 0); baseline.stop()
})
check('a skipped entity layer falls back instead of reporting a prior frame as optimized', () => {
  const f = fixture(); f.add('A', 0, 0); f.draw(true)
  f.game.renderEntitiesAbstract = () => {}; f.draw(true); assert.equal(f.bridge.gridResult(f.game).path, 'native-area-scan')
})
console.log('PLACEMENT_RENDER_HOOKS_OK=' + count)
