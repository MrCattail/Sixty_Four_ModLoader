'use strict'
const { PROTOCOL, clone, hash, info, isAuto, describe, mergeSlot } = require('./save-policy-core.js')
const KEY = Symbol.for('cattail.tweaks.save-policy')
const CONTROL = 'modloader:tweaks-slot-store'
function createPolicy(game) {
  let loading = false, localQueue = Promise.resolve(), cloudQueue = Promise.resolve(), session = null
  let cloudSlots = {}, lastError = '', autoIndex = -1, layoutAt = 0, dirty = {}, lastTiming = null
  const now = () => performance.now()
  const captures = new WeakSet()
  const recordHash = hash
  const descriptor = slot => { if (!slot) return null; const { stack, ...meta } = slot; return { meta: clone(meta), stack: stack.map(recordHash) } }
  const serial = work => { const task = localQueue.catch(() => {}).then(work); localQueue = task; return task }
  const idFor = (slot, index) => info(slot).id || 'slot-' + hash([slot.creationTimeStamp, slot.ownerHash, index]).slice(0, 32)
  const sourceIndex = () => game.saveSlots.findIndex(slot => slot && !isAuto(slot) && info(slot).id === info(game.saveSlots[game.currentSlotId]).sourceId)
  function ensureIds() {
    game.saveSlots.forEach((slot, index) => {
      if (slot && !isAuto(slot) && !info(slot).id) slot.tweaksSavePolicy = { id: idFor(slot, index), headAt: slot.lastModified }
    })
  }
  function localWrite(changes, layout = null, timing = null, owner = game.steamId) {
    const started = now()
    return new Promise((resolve, reject) => {
      const tx = game.localDatabase.transaction('charps_memory_slots', 'readwrite'), store = tx.objectStore('charps_memory_slots')
      tx.oncomplete = resolve
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local save transaction failed'))
      try {
        for (const [index, slot] of Object.entries(changes)) {
          if (slot) store.put(slot, [owner, Number(index)])
          else store.delete([owner, Number(index)])
        }
        if (layout) store.put(layout, [owner, 'cattail-policy-layout'])
        if (timing) timing.localSubmitMs = now() - started
      } catch (error) { tx.abort(); reject(error) }
    })
  }
  async function begin() {
    const reply = await game.spaceport.invoke(CONTROL, { protocol: PROTOCOL, action: 'begin', gameVersion: '1.3', owner: String(game.steamId || '') })
    if (!reply?.ok || reply.protocol !== PROTOCOL) throw new Error('Incremental cloud session unavailable: ' + (reply?.reason || 'bridge'))
    session = reply; cloudSlots = reply.slots
  }
  function cloudWrite(changes, timing = null) {
    // Freeze only changed records before the first await; queued writes never read a later world.
    const started = now()
    const pending = Object.fromEntries(Object.entries(changes).map(([index, slot]) => [index, slot ? { descriptor: descriptor(slot), records: slot.stack.slice() } : null]))
    if (timing) timing.cloudDescribeMs = now() - started
    const pendingLayoutAt = layoutAt
    const task = cloudQueue.catch(() => {}).then(async () => {
      Object.assign(dirty, pending)
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!session) await begin()
          const buildStart = now()
          const known = new Set(Object.values(cloudSlots).flatMap(d => d.stack)), packet = { protocol: PROTOCOL, action: 'commit', owner: String(game.steamId || ''), token: session.token, revision: session.revision, layoutAt: pendingLayoutAt, changes: {}, records: {} }
          for (const [index, value] of Object.entries(dirty)) {
            if (JSON.stringify(value?.descriptor || null) === JSON.stringify(cloudSlots[index] || null)) continue
            packet.changes[index] = value?.descriptor || null
            if (value) value.records.forEach((record, i) => { const id = value.descriptor.stack[i]; if (!known.has(id)) packet.records[id] = record })
          }
          if (!Object.keys(packet.changes).length) { dirty = {}; lastError = ''; return true }
          if (timing) timing.cloudPacketMs = now() - buildStart
          const submitStart = now(), response = game.spaceport.invoke('store', packet)
          if (timing) timing.ipcSubmitMs = now() - submitStart
          const reply = await response
          if (!reply?.ok && ['session', 'revision'].includes(reply?.reason)) { session = null; continue }
          if (!reply?.ok || !reply.saved) { lastError = reply?.reason || 'cloud'; return false }
          session.revision = reply.revision
          for (const [index, value] of Object.entries(packet.changes)) { if (value) cloudSlots[index] = value; else delete cloudSlots[index] }
          dirty = {}; lastError = ''; return true
        }
        lastError = 'cloud-session'; return false
      } catch (error) { session = null; lastError = String(error.message || error); return false }
    })
    cloudQueue = task
    return task
  }
  function capture() {
    if (game.preventSaving || game.preventCloud || loading) return null
    const started = now()
    const value = { record: clone({ isProtected: false, state: game.assembleSave(), permanents: game.assemblePermanents() }), index: game.currentSlotId,
      slot: game.saveSlots[game.currentSlotId], history: !!game.saveStackUpdateNeeded, timing: null }
    value.timing = { captureMs: now() - started }
    captures.add(value)
    return value
  }
  function addHistory(changes, record) {
    const index = sourceIndex(), source = game.saveSlots[index]
    if (!source) return
    const copy = { ...source, tweaksSavePolicy: { ...info(source) }, stack: source.stack.slice() }
    const id = recordHash(record)
    if (!copy.stack.some(node => recordHash(node) === id)) copy.stack.splice(1, 0, record)
    while (copy.stack.length > (game.maxSaveStack || 16)) {
      let remove = copy.stack.length - 1
      while (remove > 1 && copy.stack[remove].isProtected) remove--
      // The manual head and just-added history survive even when every older node is protected.
      if (remove <= 1) break
      copy.tweaksSavePolicy.removed = [...new Set([...(info(copy).removed || []), recordHash(copy.stack[remove])])]
      copy.stack.splice(remove, 1)
    }
    copy.lastModified = Date.now(); changes[index] = copy
  }
  async function save(captured) {
    const value = captured && captures.has(captured) ? captured : capture()
    if (!value) return false
    return serial(async () => {
      if (value.index !== game.currentSlotId || value.slot !== game.saveSlots[value.index]) return false
      const auto = game.saveSlots[game.currentSlotId]
      if (!isAuto(auto)) throw new Error('The working autosave is unavailable. Reload before saving.')
      const started = now(), timing = lastTiming = value.timing
      const next = { ...auto, stack: [value.record], lastModified: Date.now() }, changes = { [game.currentSlotId]: next }
      if (value.history) addHistory(changes, value.record)
      timing.prepareMs = now() - started
      await localWrite(changes, null, timing)
      const acceptStart = now()
      // Keep the working slot object stable for World Editor's identity lease.
      Object.assign(auto, next)
      for (const [index, slot] of Object.entries(changes)) if (+index !== game.currentSlotId) game.saveSlots[index] = slot
      if (value.history) game.saveStackUpdateNeeded = false
      game.savePreferences()
      timing.acceptMs = now() - acceptStart
      return cloudWrite(changes, timing)
    })
  }
  async function prepare(original, preload) {
    loading = true
    const read = game.readFromSlot, list = game.getSlotList, preferences = game.getPreferences
    let localIds = [], combined = null
    try {
      if (!preload?.slots) {
        game.steamId = preload?.steamId || ''
        game.localDatabase = await game.getDatabase()
        localIds = await list.call(game)
        const localLayout = await read.call(game, 'cattail-policy-layout')
        layoutAt = localLayout?.at || 0
        game.localDatabase.close()
      }
      if (preload?.slots) {
        game.steamId = preload.steamId || ''
        game.localDatabase = await game.getDatabase()
        localIds = await list.call(game)
        const locals = {}, remotes = clone(preload.slots), byId = new Map()
        const localLayout = await read.call(game, 'cattail-policy-layout'), remoteLayout = preload.savePolicyLayout
        layoutAt = Math.max(localLayout?.at || 0, remoteLayout?.at || 0)
        for (const index of localIds) locals[index] = await read.call(game, index)
        game.localDatabase.close()
        for (const slots of [locals, remotes]) for (const [index, slot] of Object.entries(slots)) if (slot) {
          if (!info(slot).id) slot.tweaksSavePolicy = { id: idFor(slot, Number(index)), headAt: slot.lastModified }
          const id = info(slot).id; byId.set(id, mergeSlot(byId.get(id), slot))
        }
        let positions = {}
        if (remoteLayout?.at > (localLayout?.at || 0)) positions = remoteLayout.slots
        else if (localLayout?.at) positions = localLayout.slots
        else for (const slots of [locals, remotes]) for (const [index, slot] of Object.entries(slots)) if (slot) positions[index] = info(slot).id
        combined = Object.fromEntries(Object.entries(positions).filter(([, id]) => byId.has(id)).map(([index, id]) => [index, byId.get(id)]))
        if (!Object.keys(combined).length) combined = null
        if (combined) {
          game.getSlotList = async () => Object.keys(combined).map(Number)
          game.readFromSlot = async index => combined[index]
          game.getPreferences = function () {
            const prefs = preferences.call(this), ids = Object.keys(combined)
            if (!combined[prefs.currentSlotId]) prefs.currentSlotId = Number(ids.find(i => isAuto(combined[i])) ?? ids[0])
            return prefs
          }
          preload = { ...preload, slots: combined }
        }
      }
      await original.call(game, preload)
      ensureIds()
      const selected = game.saveSlots[game.currentSlotId]
      if (game.saveSlots.filter(isAuto).length > 1) throw new Error('Multiple global autosaves were found. Saving is blocked.')
      const emptyStart = !localIds.length && !Object.values(preload?.slots || {}).some(Boolean) && selected.stack[0].state === null
      const recoveredHistory = {}
      if (isAuto(selected) && selected.stack.length > 1) {
        const index = game.saveSlots.findIndex(slot => slot && !isAuto(slot) && info(slot).id === info(selected).sourceId)
        if (index >= 0) {
          const source = game.saveSlots[index], seen = new Set(source.stack.map(recordHash))
          const extra = selected.stack.slice(1).filter(record => { const id = recordHash(record); if (seen.has(id)) return false; seen.add(id); return true })
          if (extra.length) recoveredHistory[index] = { ...source, lastModified: Date.now(), stack: [source.stack[0], ...extra.map(clone), ...source.stack.slice(1)] }
        }
      }
      autoIndex = game.saveSlots.findIndex(isAuto)
      if (autoIndex < 0) { autoIndex = Math.max(20, game.saveSlots.length); layoutAt = Date.now() }
      const auto = isAuto(selected) ? clone(selected) : { name: 'Autosave', ownerHash: selected.ownerHash, creationTimeStamp: Date.now(), lastModified: Date.now(),
        stack: [clone(selected.stack[0])], tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: emptyStart ? null : info(selected).id } }
      auto.stack = [clone(auto.stack[0])]
      game.saveSlots[autoIndex] = auto
      if (emptyStart && !isAuto(selected)) delete game.saveSlots[game.currentSlotId]
      game.currentSlotId = autoIndex
      if (!game.preventSaving) {
        const changes = { ...recoveredHistory, [autoIndex]: auto }
        if (emptyStart) changes[0] = null
        if (combined) for (const id of localIds) if (!combined[id] && id !== autoIndex) changes[id] = null
        await localWrite(changes, makeLayout(game.saveSlots))
        // Native assemblePreferences reads Splash/Explainer, which do not exist yet.
        // Preparation changes only the slot selection and keeps every loaded preference.
        game.preferences = { ...game.preferences, currentSlotId: autoIndex }
        localStorage.setItem(`abstractv03_preferences${game.steamId}`, JSON.stringify(game.preferences))
        for (const [index, slot] of Object.entries(recoveredHistory)) {
          game.saveSlots[index] = slot
          dirty[index] = { descriptor: descriptor(slot), records: slot.stack.slice() }
        }
      }
    } finally { game.readFromSlot = read; game.getSlotList = list; game.getPreferences = preferences; loading = false }
  }
  function writeSlot(data, index) {
    if (loading) return localWrite({ [index]: data }).then(() => false)
    const copy = clone(data)
    if (isAuto(copy)) copy.stack = copy.stack.slice(0, 1)
    return serial(async () => {
      await localWrite({ [index]: copy })
      if (isAuto(game.saveSlots[index])) Object.assign(game.saveSlots[index], copy)
      return cloudWrite({ [index]: copy })
    })
  }
  async function persistCollection(next, activeIndex = game.currentSlotId) {
    const misplaced = next.findIndex(isAuto)
    if (misplaced >= 0 && misplaced < 20) {
      let target = 20; while (next[target]) target++
      next[target] = next[misplaced]; delete next[misplaced]
      if (activeIndex === misplaced) activeIndex = target
    }
    const previous = game.saveSlots, previousIndex = game.currentSlotId, previousLayoutAt = layoutAt, changes = {}
    next.forEach((slot, index) => { if (slot && !isAuto(slot) && !info(slot).id) slot.tweaksSavePolicy = { id: idFor(slot, index), headAt: slot.lastModified } })
    for (let index = 0; index < Math.max(previous.length, next.length); index++) if (previous[index] !== next[index]) changes[index] = next[index] || null
    layoutAt = Date.now()
    await localWrite(changes, makeLayout(next))
    try { game.currentSlotId = activeIndex; game.savePreferences() }
    catch (error) {
      game.currentSlotId = previousIndex; layoutAt = previousLayoutAt
      try {
        await localWrite(Object.fromEntries(Object.keys(changes).map(i => [i, previous[i] || null])), makeLayout(previous))
        game.savePreferences()
      } catch (_) { game.preventSaving = true; throw new Error('Save selection rollback failed. Restart before continuing.') }
      throw error
    }
    const oldAuto = previous[game.currentSlotId], newAuto = next[activeIndex]
    if (isAuto(oldAuto) && isAuto(newAuto) && oldAuto !== newAuto && oldAuto.stack === newAuto.stack) { Object.assign(oldAuto, newAuto); next[activeIndex] = oldAuto }
    game.saveSlots = next; autoIndex = next.findIndex(isAuto)
    return cloudWrite(changes)
  }
  function makeLayout(slots) { return { at: layoutAt, slots: Object.fromEntries(slots.flatMap((slot, index) => slot ? [[index, info(slot).id || idFor(slot, index)]] : [])) } }
  async function activate(index, record) {
    const slot = game.saveSlots[index]
    if (!slot || !slot.stack.includes(record)) throw new Error('The selected save changed')
    const selected = clone(record), sourceId = isAuto(slot) ? info(slot).sourceId : info(slot).id
    await save()
    const current = game.saveSlots[game.currentSlotId]
    const nextAuto = { ...current, ownerHash: slot.ownerHash, lastModified: Date.now(), stack: [selected],
      tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId } }
    const next = game.saveSlots.slice(); next[autoIndex] = nextAuto
    await persistCollection(next, autoIndex)
    game.preventSaving = true
    return true
  }
  async function setSource(index) {
    ensureIds()
    const auto = game.saveSlots[game.currentSlotId], source = game.saveSlots[index]
    if (!source || isAuto(source)) throw new Error('Manual source is unavailable')
    const next = game.saveSlots.slice()
    next[game.currentSlotId] = { ...auto, tweaksSavePolicy: { ...info(auto), sourceId: info(source).id }, lastModified: Date.now() }
    return persistCollection(next)
  }
  async function activateCollection(next, index) {
    const slot = next[index]
    if (!info(slot).id) slot.tweaksSavePolicy = { id: idFor(slot, index), headAt: slot.lastModified }
    const current = game.saveSlots[game.currentSlotId]
    next[autoIndex] = { ...current, ownerHash: slot.ownerHash, stack: [clone(slot.stack[0])], lastModified: Date.now(),
      tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: info(slot).id } }
    await persistCollection(next, autoIndex)
    game.preventSaving = true
    return autoIndex
  }
  // One explicit fork transaction; periodic save/history rules remain unchanged.
  function commitFork(next, index, hooks) {
    return serial(async () => {
      hooks.assertCurrent()
      const previous = game.saveSlots, previousLayoutAt = layoutAt, owner = game.steamId
      const activeIndex = autoIndex, current = previous[activeIndex], copy = next[index]
      if (!isAuto(current) || !copy?.stack?.[0]?.state) throw new Error('The working autosave or fork is unavailable.')
      next.forEach((slot, i) => { if (slot && !isAuto(slot) && !info(slot).id) next[i] = { ...slot, tweaksSavePolicy: { id: idFor(slot, i), headAt: slot.lastModified } } })
      next[activeIndex] = { ...current, ownerHash: copy.ownerHash, stack: [clone(copy.stack[0])], lastModified: Date.now(),
        tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: info(next[index]).id } }
      const changes = {}, rollback = {}
      for (let i = 0; i < Math.max(previous.length, next.length); i++) if (previous[i] !== next[i]) { changes[i] = next[i] || null; rollback[i] = previous[i] || null }
      layoutAt = Date.now()
      let wrote = false
      try {
        hooks.assertCurrent()
        await localWrite(changes, makeLayout(next), null, owner); wrote = true
        await hooks.verify(next)
        hooks.publish(next, activeIndex)
      } catch (error) {
        layoutAt = previousLayoutAt
        try { if (wrote) await localWrite(rollback, makeLayout(previous), null, owner); hooks.restore() }
        catch (_) { game.preventSaving = true; const failure = new Error('Fork recovery failed. Reload before continuing.'); failure.code = 'ROLLBACK_FAILED'; throw failure }
        throw error
      }
      game.saveSlots = next; autoIndex = activeIndex
      return { activeIndex, cloudSaved: await cloudWrite(changes) }
    })
  }
  return { enabled: true, capture, save, prepare, writeSlot, persistCollection, activate, activateCollection, commitFork, setSource, sourceIndex, isAuto,
    get autoIndex() { return game.saveSlots.findIndex(isAuto) }, get lastError() { return lastError },
    get timing() { return lastTiming && { ...lastTiming } },
    async flush() { await localQueue; await cloudQueue },
    async wipe(index) { if (!game.saveSlots[index] || isAuto(game.saveSlots[index]) || index === sourceIndex()) return false; const next = game.saveSlots.slice(); next.splice(index, 1); const active = game.currentSlotId > index ? game.currentSlotId - 1 : game.currentSlotId; await persistCollection(next, active); return true },
    async storeCollection(slots) { const changes = {}; const length = Math.max(slots.length, ...Object.keys(cloudSlots).map(i => Number(i) + 1)); for (let i = 0; i < length; i++) changes[i] = slots[i] || null; layoutAt = Date.now(); await localWrite({}, makeLayout(slots)); return cloudWrite(changes) },
    async beforeReset() { const changes = {}; const record = clone(game.saveSlots[game.currentSlotId]?.stack?.[0]); if (record?.state) { addHistory(changes, record); if (Object.keys(changes).length) { await localWrite(changes); for (const [i, slot] of Object.entries(changes)) game.saveSlots[i] = slot; await cloudWrite(changes) } } },
    installFacade() {
      const port = game.spaceport
      if (!port?.invoke || port.__tweaksSavePolicy) return
      const facade = Object.create(port)
      for (const name of ['send', 'sendSync', 'on', 'once', 'addListener', 'removeListener', 'removeAllListeners', 'off', 'postMessage', 'sendToHost']) if (typeof port[name] === 'function') facade[name] = port[name].bind(port)
      facade.invoke = (channel, payload, ...args) => channel === 'store' && Array.isArray(payload) ? this.storeCollection(payload) : port.invoke(channel, payload, ...args)
      facade.__tweaksSavePolicy = true; game.spaceport = facade
    }
  }
}
function install(api, Game) {
  const policies = new WeakMap()
  const policy = game => { if (!policies.has(game)) { const value = createPolicy(game); policies.set(game, value); Object.defineProperty(game, KEY, { value, configurable: true }) } return policies.get(game) }
  api.patch(Game.prototype, 'prepareSavedGameData', original => function (preload) { return policy(this).prepare(original, preload) })
  api.patch(Game.prototype, 'loadSave', original => function (save, ...args) { return original.call(this, clone(save), ...args) })
  api.patch(Game.prototype, 'saveGame', _original => function (captured) { return policy(this).save(captured) })
  api.patch(Game.prototype, 'writeToSlot', _original => function (slot, index) { return policy(this).writeSlot(slot, index) })
  api.patch(Game.prototype, 'reset', original => async function (...args) { await policy(this).flush(); await policy(this).beforeReset(); return original.apply(this, args) })
  api.patch(Game.prototype, 'loadSaveFromSlotStack', _original => async function (index, position) { const record = this.saveSlots[index]?.stack?.[position]; if (!record) return false; await policy(this).activate(index, record); globalThis.location.reload(); return true })
  api.patch(Game.prototype, 'wipeSlot', _original => function (index) { return policy(this).wipe(index) })
  api.on('afterGameInit', (_payload, game) => { policy(game).installFacade() })
  return policy
}
module.exports = { KEY, CONTROL, PROTOCOL, createPolicy, install }
