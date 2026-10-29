'use strict'

// Private native-leaf adapter. Policies belong to Tweaks, not diagnostics.
const crypto = require('crypto')
const { isProxy } = require('util').types
const KEY = '__cattailPlacementRenderHooksV1'
const HASHES = Object.freeze({
  renderEntities: '5cd80957f5990bc4cf1ee733476fd458f78d420675696c8288b819db75a82cd0',
  renderEntitiesAbstract: '4bf7952815088c219d76c296018c484239823d79444dd62e25b6efd8a7b9ed62',
  renderGrid: '6a5aca11ad870d75d600e9746d05b01077fe357d044263a7d36a50039b0ee0db'
})
const installed = new WeakMap()
const hash = fn => typeof fn === 'function' ? crypto.createHash('sha256').update(Function.prototype.toString.call(fn).replace(/\s+/g, '')).digest('hex') : null

function adapt(name, source) {
  if (name === 'renderGrid') {
    const anchor = 'for (let y = rt[1]; y < lb[1]; y++){'
    if (source.split(anchor).length !== 2) throw Error('Placement grid anchor mismatch.')
    return source.replace(anchor, 'if (!hooks.drawPlacement(this, lt, rb, rt, lb)) ' + anchor)
  }
  const header = name + '(dt){'
  if (source.split(header).length !== 2) throw Error('Placement entity header mismatch.')
  let loops = 0
  source = source.replace(/^(\t{3}for \(let i = (?:0|this\.stuff\.length - 1); i (?:< this\.stuff\.length|>= 0); i(?:\+\+|--)\)\{)/gm, line => {
    loops++
    return line + '\n\t\t\t\thooks.visit(this, this.stuff[i], __sfPlacementPass);'
  })
  if (loops !== 2) throw Error('Placement entity loop anchors mismatch.')
  source = source.replace(header, header + '\nconst __sfPlacementPass = hooks.beginPass(this); let __sfPlacementComplete = false; try {')
  const end = source.lastIndexOf('}')
  return source.slice(0, end) + '\n__sfPlacementComplete = true;\n} finally { hooks.endPass(this, __sfPlacementPass, __sfPlacementComplete); }\n' + source.slice(end)
}

function install(prototype) {
  if (!prototype || typeof prototype !== 'object') return null
  if (installed.has(prototype)) return installed.get(prototype)
  const originals = {}, variants = {}, capabilities = {}, observers = {}, wrappers = {}, descriptors = {}, lastGrid = new WeakMap()
  let provider = null
  const hooks = {
    beginPass(game) { return provider?.beginPass(game) || null },
    visit(game, entity, token) { if (token) provider?.visit(game, entity, token) },
    endPass(game, token, complete) { if (token) provider?.endPass(game, token, complete) },
    drawPlacement(game, lt, rb, rt, lb) {
      const result = provider?.draw(game, { lt, rb, rt, lb })
      lastGrid.set(game, result?.handled ? { ...result, path: 'entity-traversal-reuse' } : { path: 'native-area-scan', fallbackReason: result?.reason || 'disabled-or-unavailable', collectedCells: result?.collectedCells || 0 })
      return result?.handled === true
    }
  }
  const bridge = {
    supported: false,
    original(name) { return originals[name] },
    describe() { return Object.fromEntries(Object.entries(capabilities).map(([name, row]) => [name, { ...row }])) },
    compile(name, source, probe) {
      if (!originals[name]) throw Error('Unsupported placement native method.')
      return Function('hooks', 'probe', '"use strict"; return function ' + adapt(name, source))(hooks, probe)
    },
    observe(name, observer) {
      if (!originals[name] || observers[name]) throw Error('Placement observer already installed or unsupported.')
      observers[name] = observer
      return () => { if (observers[name] === observer) delete observers[name] }
    },
    register(policy) {
      if (!bridge.supported || provider) return false
      provider = policy
      return true
    },
    enabled(game) { return bridge.supported && provider?.enabled(game) === true },
    gridResult(game) { return lastGrid.get(game) ? { ...lastGrid.get(game) } : null },
    beginPass: hooks.beginPass, visit: hooks.visit, endPass: hooks.endPass,
    // Only frame lifetime is wrapped; no assumptions or source edits here.
    runFrame(game, draw) {
      lastGrid.delete(game)
      provider?.beginFrame(game)
      try { return draw() } finally { provider?.endFrame(game) }
    },
    plainMap(map) {
      if (!map || typeof map !== 'object' || isProxy(map)) return false
      try {
        const proto = Object.getPrototypeOf(map)
        return proto === null || (Object.getPrototypeOf(proto) === null && !Object.getOwnPropertyNames(proto).some(key => /^u.*v/.test(key)))
      } catch (_) { return false }
    }
  }
  for (const [name, expected] of Object.entries(HASHES)) {
    const original = prototype[name], descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    capabilities[name] = { sha256: hash(original), supported: hash(original) === expected && descriptor?.configurable !== false }
    if (!capabilities[name].supported) continue
    originals[name] = original
    variants[name] = bridge.compile(name, Function.prototype.toString.call(original).replace(/\r\n/g, '\n'))
    const wrapped = function (...args) {
      if (name === 'renderGrid') lastGrid.set(this, { path: 'native-area-scan', fallbackReason: 'disabled-or-unavailable' })
      const draw = bridge.enabled(this) && provider?.collecting(this) ? variants[name] : original
      return observers[name] ? observers[name](this, args, draw) : draw.apply(this, args)
    }
    wrappers[name] = wrapped; descriptors[name] = descriptor
    Object.defineProperty(prototype, name, { ...descriptor, value: wrapped, configurable: true, writable: true })
  }
  const frame = prototype.renderloop, frameDescriptor = Object.getOwnPropertyDescriptor(prototype, 'renderloop')
  bridge.supported = Object.values(capabilities).every(row => row.supported) && typeof frame === 'function' && frameDescriptor?.configurable !== false
  if (bridge.supported) {
    const wrapped = function (...args) { return bridge.runFrame(this, () => frame.apply(this, args)) }
    wrappers.renderloop = wrapped; descriptors.renderloop = frameDescriptor
    Object.defineProperty(prototype, 'renderloop', { ...frameDescriptor, value: wrapped, configurable: true, writable: true })
  }
  installed.set(prototype, bridge)
  return bridge
}

module.exports = { install, HASHES, KEY, hash }
