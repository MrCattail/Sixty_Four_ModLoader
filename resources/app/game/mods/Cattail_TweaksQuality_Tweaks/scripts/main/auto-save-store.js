'use strict'

// Tweaks owns this private protocol. The Loader only supplies the host/sender bridge.
const PROTOCOL = 'tweaks-slot-store-v1'
function hasCrossSlotReferences(slots) {
  const owners = new WeakMap()
  for (let index = 0; index < slots.length; index++) {
    const pending = [slots[index]]
    while (pending.length) {
      const value = pending.pop()
      if (!value || typeof value !== 'object') continue
      if (owners.has(value)) {
        if (owners.get(value) !== index) return true
        continue
      }
      owners.set(value, index)
      for (const key of Object.keys(value)) pending.push(value[key])
    }
  }
  return false
}
function createStore({ token = () => require('crypto').randomBytes(24).toString('hex') } = {}) {
  const sessions = new WeakMap()
  const resync = (reason = 'invalid') => ({ protocol: PROTOCOL, ok: false, reason })
  function begin(sender, owner) {
    if (typeof owner !== 'string' || !owner || owner.length > 128) return resync()
    const session = { token: token(), owner, revision: 0, slots: null, slotSafe: false }
    sessions.set(sender, session)
    return { protocol: PROTOCOL, ok: true, token: session.token }
  }
  function seed(sender, request) {
    const session = sessions.get(sender)
    if (!session || request.token !== session.token || request.owner !== session.owner) return resync('session')
    if (!Array.isArray(request.slots)) return resync()
    session.slots = request.slots
    session.slotSafe = !hasCrossSlotReferences(request.slots)
    session.revision++
    return { protocol: PROTOCOL, ok: true, revision: session.revision, slotSafe: session.slotSafe }
  }
  function clear(sender) { sessions.delete(sender) }
  function store(sender, request, write) {
    const session = sessions.get(sender)
    if (Array.isArray(request)) {
      // Native and Better UIs collection operations remain authoritative. A later
      // delta must resynchronize, including when the cloud write itself fails.
      if (session) { session.slots = null; session.revision++; session.slotSafe = false }
      return write(request)
    }
    if (request?.protocol !== PROTOCOL) return write(request)
    if (!session || request.token !== session.token || request.owner !== session.owner) return resync('session')
    if (request.action === 'full') {
      if (!Array.isArray(request.slots)) return resync()
      session.slots = request.slots
      session.slotSafe = !hasCrossSlotReferences(request.slots)
    } else if (request.action === 'slot') {
      if (!session.slots || !session.slotSafe || request.revision !== session.revision ||
          !Number.isSafeInteger(request.index) || request.index < 0 || request.index >= session.slots.length ||
          !request.slot || typeof request.slot !== 'object') return resync('revision')
      const next = session.slots.slice()
      next[request.index] = request.slot
      session.slots = next
    } else return resync()
    session.revision++
    // This mirror is accepted renderer state, not a claim of cloud success.
    // Retain it on false so the next write includes all locally accepted changes.
    let saved = false
    try { saved = write(session.slots) === true } catch (_) {}
    return { protocol: PROTOCOL, ok: true, saved, revision: session.revision, slotSafe: session.slotSafe }
  }
  return { begin, seed, clear, store }
}
module.exports = { PROTOCOL, createStore, hasCrossSlotReferences }
