'use strict'

// One-shot, observational startup diagnostics. No save payloads or drawing overrides.
const PROTOCOL = 'clear-view-origin-v1'
const MAX_EVENTS = 2048
const MAX_STACKS = 24

function createArmStore(directory, clock = Date.now) {
  const fs = require('fs'), path = require('path')
  const file = path.join(directory, 'next-start-origin.json')
  let queue = Promise.resolve()
  const run = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result }
  return {
    arm() { return run(async () => {
      await fs.promises.mkdir(directory, { recursive: true })
      const ticket = { protocol: PROTOCOL, armedAt: clock(), expiresAt: clock() + 86400000 }
      await fs.promises.writeFile(file, JSON.stringify(ticket), { mode: 0o600 })
      return ticket
    }) },
    cancel() { return run(async () => { await fs.promises.unlink(file).catch(e => { if (e.code !== 'ENOENT') throw e }); return { cancelled: true } }) },
    consume() { return run(async () => {
      let data
      try { data = await fs.promises.readFile(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e }
      // Consume before installing hooks, even for malformed/expired tickets.
      await fs.promises.unlink(file)
      try {
        const ticket = JSON.parse(data)
        return ticket.protocol === PROTOCOL && Number.isFinite(ticket.armedAt) && Number.isFinite(ticket.expiresAt) && ticket.armedAt <= clock() && ticket.expiresAt > clock() && ticket.expiresAt - ticket.armedAt <= 86400000 ? ticket : null
      } catch (_) { return null }
    }) }
  }
}

function createOriginObserver(options) {
  const { game } = options
  const now = options.now || (() => performance.now())
  const main = game.ctx, events = [], stacks = [], warnings = [], patches = [], contexts = []
  const byContext = new WeakMap(), sources = new Map(), calls = Object.create(null), scope = []
  let active = false, used = false, startedAt = 0, stoppedAt = 0, dropped = 0, sequence = 0, loads = 0, ready = false, lastGrid = ''
  const warn = message => { if (warnings.length < 24 && !warnings.includes(message)) warnings.push(message) }
  function safe(fn) { try { return fn() } catch (_) { warn('An observational sample failed; original call was preserved.'); return null } }
  function emit(type, data = {}) {
    if (!active) return
    const event = { sequence: ++sequence, timeMs: now() - startedAt, type, ...data }
    if (events.length < MAX_EVENTS) events.push(event); else dropped++
    return event.sequence
  }
  function source(label) {
    // A later call in the same broad scope can have a different caller. Do not
    // falsely attach the first captured stack to subsequent unmeasured calls.
    if (sources.has(label)) return null
    if (stacks.length >= MAX_STACKS) return null
    const id = stacks.length + 1
    stacks.push({ id, label, stack: String(new Error().stack || '').slice(0, 4000) })
    sources.set(label, id)
    return id
  }
  function inventory() {
    const entities = game.entitiesInGame || {}
    return { resources: { hellGem: game.resources?.[4] ?? null, chromalit: game.resources?.[5] ?? null, celestialFoam: game.resources?.[6] ?? null },
      entityCount: game.stuff?.length ?? null, vaults: game.vaults?.size ?? null,
      annihilators: game.annihilators?.size ?? null, generaldecay: !!game.generaldecay,
      vessels: (entities.vessel || 0) + (entities.vessel2 || 0), resourceTransferType: game.resourceTransferType ?? null }
  }
  function context(ctx, reason) {
    if (!ctx || typeof ctx !== 'object') return null
    let entry = byContext.get(ctx)
    if (!entry) {
      if (contexts.length >= 8) { warn('Context limit reached; later contexts are not attributed.'); return null }
      entry = { id: 'canvas-' + (contexts.length + 1), role: ctx === main ? 'initial-main' : 'runtime-grid-or-effect',
        firstSeenMs: now() - startedAt, initialCap: ctx.lineCap, cap: ctx.lineCap,
        width: ctx.canvas?.width, height: ctx.canvas?.height, setterCalls: 0, transitions: 0 }
      byContext.set(ctx, entry); contexts.push(entry)
      emit('context-first-seen', { contextId: entry.id, reason, cap: ctx.lineCap, width: entry.width, height: entry.height })
      if (ctx.lineCap === 'round') warn(entry.id + ' was already round when first observed; its initial writer is unknown.')
    } else if (entry.cap !== ctx.lineCap || entry.width !== ctx.canvas?.width || entry.height !== ctx.canvas?.height) {
      emit('context-state-observed', { contextId: entry.id, reason, previousCap: entry.cap, cap: ctx.lineCap,
        width: ctx.canvas?.width, height: ctx.canvas?.height, note: 'May be restore/resize or an unobserved write; no setter attribution.' })
      entry.cap = ctx.lineCap; entry.width = ctx.canvas?.width; entry.height = ctx.canvas?.height
    }
    return entry
  }
  function wrap(name, before, after) {
    const original = game[name], descriptor = Object.getOwnPropertyDescriptor(game, name)
    if (typeof original !== 'function') { warn('Missing method: ' + name); return }
    const wrapped = function (...args) {
      if (!active || this !== game) return original.apply(this, args)
      calls[name] = (calls[name] || 0) + 1
      scope.push(name)
      safe(() => before?.(args))
      let ok = false
      try { const result = original.apply(this, args); ok = true; return result }
      finally { safe(() => after?.(ok)); scope.pop(); if (!ok) safe(() => options.onError?.(name)) }
    }
    try {
      Object.defineProperty(game, name, { configurable: true, writable: true, enumerable: descriptor?.enumerable || false, value: wrapped })
      patches.push(() => {
        if (game[name] !== wrapped) { warn('Later wrapper retained for ' + name + '; this observer is inert until reload.'); return }
        if (descriptor) Object.defineProperty(game, name, descriptor); else delete game[name]
      })
    } catch (_) { warn('Cannot observe method: ' + name) }
  }
  function installCap() {
    const proto = options.contextPrototype
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'lineCap')
    if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) { warn('Canvas lineCap descriptor unavailable; first-writer attribution is incomplete.'); return }
    const wrapped = function (value) {
      const tracked = active && (this === main || this === game.ctx || byContext.has(this))
      const entry = tracked ? safe(() => context(this, 'lineCap-write')) : null
      const before = entry ? descriptor.get.call(this) : null
      // Original setter receives exactly the supplied value, including invalid values.
      descriptor.set.call(this, value)
      if (entry) safe(() => {
        const cap = descriptor.get.call(this)
        entry.setterCalls++
        if (before !== cap) {
          entry.transitions++
          emit('lineCap-change', { contextId: entry.id, before, cap, scope: scope.slice(),
            sourceId: source('cap:' + entry.id + ':' + cap + ':' + scope.join('/')) })
        }
        entry.cap = cap
      })
    }
    Object.defineProperty(proto, 'lineCap', { ...descriptor, set: wrapped })
    patches.push(() => {
      const current = Object.getOwnPropertyDescriptor(proto, 'lineCap')
      if (current?.set === wrapped && current?.get === descriptor.get) Object.defineProperty(proto, 'lineCap', descriptor)
      else warn('Later Canvas descriptor retained; this observer is inert until reload.')
    })
  }
  return {
    start() {
      if (used) throw new Error('Origin observer already used')
      used = true; active = true; startedAt = now()
      safe(() => context(main, 'before-load'))
      try {
        installCap()
        wrap('loadSave', () => {
          loads++; emit('load-begin', { loadNumber: loads })
          if (loads > 1) { warn('Another load occurred during capture.'); options.onChanged?.() }
        }, ok => emit('load-end', { loadNumber: loads, returnedNormally: ok, inventory: inventory() }))
        wrap('updateResourceInteractions', null, () => {})
        wrap('createResourceExplosion', args => {
          if (calls.createResourceExplosion <= 16) emit('explosion-create', { inventory: inventory(),
            resources: { hellGem: args[0]?.[4] || 0, chromalit: args[0]?.[5] || 0, celestialFoam: args[0]?.[6] || 0 },
            scope: scope.slice(), sourceId: source('explosion:' + scope.join('/')) })
        })
        wrap('renderVFX', () => context(game.ctx, 'renderVFX-before'), () => context(game.ctx, 'renderVFX-after'))
        emit('observer-installed', { inventory: inventory() })
      } catch (error) { this.stop('install-failed'); throw error }
    },
    gridEntry(g) {
      if (!active || g !== game) return
      safe(() => {
        const ctx = g.ctx, entry = context(ctx, 'grid-entry')
        if (!entry) return
        calls.gridEntry = (calls.gridEntry || 0) + 1
        const transform = ctx.getTransform?.()
        const data = { contextId: entry.id, cap: ctx.lineCap, entryLineWidth: ctx.lineWidth,
          nativeRequestedWidth: g.pixelRatio, canvasWidth: ctx.canvas?.width, canvasHeight: ctx.canvas?.height,
          transform: transform ? [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f] : null,
          zoom: g.zoom, plane: g.plane, alt: !!g.altActive, item: !!g.itemInHand, interactionMode: String(g.interactionMode || '').slice(0, 32) }
        const key = JSON.stringify(data)
        if (key !== lastGrid) { emit('grid-entry', data); lastGrid = key }
      })
    },
    ready() { if (active && !ready) { ready = true; emit('game-ready', { inventory: inventory() }) } },
    stop(reason = 'manual') {
      if (!active) return
      emit('observer-stopping', { reason, inventory: safe(inventory) }); stoppedAt = now(); active = false
      for (const restore of patches.splice(0).reverse()) { try { restore() } catch (_) { warn('A hook could not be restored; restart to remove it.') } }
    },
    report() {
      if (active) throw new Error('Stop origin observer before export')
      return { protocol: PROTOCOL, startedAtPerformanceMs: startedAt, durationMs: stoppedAt - startedAt,
        ready, loads, events, stacks, contexts, calls, droppedEvents: dropped, warnings,
        limits: { events: MAX_EVENTS, stacks: MAX_STACKS, contexts: 8, explosionEvents: 16 },
        limitations: ['Grid metadata is sampled at the Loader draw entry, before the captured grid implementation. entryLineWidth is inherited, nativeRequestedWidth is the original requested DPR; neither is a per-stroke measurement.',
          'Canvas save/restore and resize can change state without a JS setter; observed changes without setters are explicitly unattributed.',
          'Only initial main, current game.ctx and previously seen contexts are attributed. Offscreen/non-game canvases are outside coverage.',
          'Bounded stacks add observer overhead. A round initial state, missing hooks, dropped events or later wrappers prevent a claim of complete first-writer coverage.'] }
    }
  }
}

module.exports = { PROTOCOL, MAX_EVENTS, MAX_STACKS, createArmStore, createOriginObserver }
