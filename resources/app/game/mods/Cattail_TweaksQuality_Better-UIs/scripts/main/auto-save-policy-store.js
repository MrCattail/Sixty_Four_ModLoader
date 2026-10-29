'use strict'
const { PROTOCOL, INDEX, clone, hash, describe, isAuto } = require('../save-policy-core.js')
const fail = reason => ({ protocol: PROTOCOL, ok: false, saved: false, reason })
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function readBase(cloud) {
  if (!cloud?.fileExists?.('charpsMemory')) return []
  const slots = JSON.parse(String(cloud.readFile('charpsMemory')))
  if (!slots || typeof slots !== 'object') throw new Error('Invalid legacy save collection')
  return slots
}
function load(cloud, suppliedBase) {
  const base = suppliedBase === undefined ? readBase(cloud) : suppliedBase
  const baseline = hash(base), records = new Map(), slots = {}
  for (const [index, slot] of Object.entries(base)) if (slot) {
    slots[index] = describe(slot)
    for (const record of slot.stack) records.set(hash(record), record)
  }
  let catalog = { schema: 2, baseline, revision: 0, slots, files: {} }
  if (cloud?.fileExists?.(INDEX)) {
    const saved = JSON.parse(String(cloud.readFile(INDEX)))
    if (saved.schema !== 2 || !Number.isSafeInteger(saved.revision) || !saved.slots || !saved.files) throw new Error('Invalid save delta index')
    // A native full save supersedes the overlay; never replay stale deltas.
    if (saved.baseline === baseline) catalog = saved
  }
  const collection = []
  for (const [index, descriptor] of Object.entries(catalog.slots)) {
    if (!/^\d+$/.test(index) || +index > 10000 || !descriptor?.meta || !Array.isArray(descriptor.stack) || !descriptor.stack.length) throw new Error('Invalid slot descriptor')
    const stack = descriptor.stack.map(id => {
      if (!validHash(id)) throw new Error('Invalid record reference')
      if (!records.has(id)) {
        const file = catalog.files[id]
        if (typeof file !== 'string' || !/^cattail-(save-node-[a-f0-9]{64}|auto-[ab])\.json$/.test(file)) throw new Error('Missing save record')
        const record = JSON.parse(String(cloud.readFile(file)))
        if (hash(record) !== id) throw new Error('Save record checksum mismatch')
        records.set(id, record)
      }
      return clone(records.get(id))
    })
    collection[index] = { ...clone(descriptor.meta), stack }
  }
  Object.defineProperty(collection, 'policyLayout', { value: { at: catalog.layoutAt || 0, slots: Object.fromEntries(Object.entries(catalog.slots).map(([index, d]) => [index, d.meta.tweaksSavePolicy?.id || 'slot-' + hash([d.meta.creationTimeStamp, d.meta.ownerHash, Number(index)]).slice(0, 32)])) } })
  return { catalog, records, collection }
}
function createStore({ token = () => require('crypto').randomBytes(24).toString('hex'), measure = (_name, work) => work() } = {}) {
  const sessions = new WeakMap()
  function begin(sender, owner, cloud) {
    if (typeof owner !== 'string' || !owner || owner.length > 128) return fail('owner')
    try {
      const state = load(cloud)
      const session = { token: token(), owner, ...state }
      sessions.set(sender, session)
      return { protocol: PROTOCOL, ok: true, token: session.token, revision: state.catalog.revision, slots: clone(state.catalog.slots) }
    } catch (_) { return fail('read') }
  }
  function store(sender, request, write, cloud) {
    if (request?.protocol !== PROTOCOL) { sessions.delete(sender); return write(request) }
    const session = sessions.get(sender)
    if (!session || request.token !== session.token || request.owner !== session.owner) return fail('session')
    if (request.action !== 'commit') return fail('action')
    if (request.revision !== session.catalog.revision) return fail('revision')
    try {
      if (cloud?.fileExists?.(INDEX)) {
        const disk = JSON.parse(String(cloud.readFile(INDEX)))
        if (disk.baseline === session.catalog.baseline && disk.revision !== session.catalog.revision) return fail('revision')
      }
      if (!request.changes || typeof request.changes !== 'object' || !request.records || typeof request.records !== 'object') return fail('packet')
      const next = clone(session.catalog), records = new Map(session.records)
      for (const [id, record] of Object.entries(request.records)) {
        if (!validHash(id) || hash(record) !== id || !record?.permanents || !(record.state === null || typeof record.state === 'object')) return fail('record')
        records.set(id, record)
      }
      for (const [index, descriptor] of Object.entries(request.changes)) {
        if (!/^\d+$/.test(index) || +index > 10000) return fail('index')
        if (descriptor === null) { delete next.slots[index]; continue }
        if (!descriptor.meta || !Array.isArray(descriptor.stack) || !descriptor.stack.length || !descriptor.stack.every(id => validHash(id) && records.has(id))) return fail('missing-record')
        if (isAuto(descriptor.meta) && descriptor.stack.length !== 1) return fail('auto-history')
        next.slots[index] = clone(descriptor)
      }
      if (Object.values(next.slots).filter(d => isAuto(d.meta)).length > 1) return fail('duplicate-auto')
      const live = new Set(Object.values(next.slots).flatMap(d => d.stack))
      const oldAutoFiles = Object.values(session.catalog.slots).filter(d => isAuto(d.meta)).flatMap(d => d.stack.map(id => session.catalog.files[id]))
      for (const id of live) {
        const manual = Object.values(next.slots).some(d => !isAuto(d.meta) && d.stack.includes(id))
        if (session.records.has(id) && !(manual && /^cattail-auto-/.test(next.files[id] || ''))) continue
        const auto = !manual && Object.values(next.slots).some(d => isAuto(d.meta) && d.stack.includes(id))
        const file = auto ? (oldAutoFiles.includes('cattail-auto-a.json') ? 'cattail-auto-b.json' : 'cattail-auto-a.json') : `cattail-save-node-${id}.json`
        const data = measure('cloud.serializeSlots', () => JSON.stringify(records.get(id)))
        if (measure('cloud.writeFile', () => cloud?.writeFile?.(file, data)) !== true) return { ...fail('cloud-record'), ok: true, revision: session.catalog.revision }
        next.files[id] = file
      }
      for (const id of Object.keys(next.files)) if (!live.has(id)) delete next.files[id]
      const liveFiles = new Set(Object.values(next.files))
      next.garbage = [...new Set([...(next.garbage || []), ...Object.values(session.catalog.files)])].filter(file => /^cattail-save-node-[a-f0-9]{64}\.json$/.test(file) && !liveFiles.has(file) && cloud?.fileExists?.(file))
      next.revision++
      next.layoutAt = Math.max(next.layoutAt || 0, Number(request.layoutAt) || 0)
      // Publish last. A failed record/index write leaves the previous commit readable.
      const indexData = measure('cloud.serializeSlots', () => JSON.stringify(next))
      if (measure('cloud.writeFile', () => cloud?.writeFile?.(INDEX, indexData)) !== true) return { ...fail('cloud-index'), ok: true, revision: session.catalog.revision }
      session.catalog = next
      session.records = new Map([...records].filter(([id]) => live.has(id)))
      // Only unreferenced files created by this policy; never delete the legacy baseline.
      if (typeof cloud?.deleteFile === 'function') for (const file of next.garbage) { try { cloud.deleteFile(file) } catch (_) {} }
      return { protocol: PROTOCOL, ok: true, saved: true, revision: next.revision }
    } catch (_) { return fail('cloud-exception') }
  }
  return { begin, store, clear(sender) { sessions.delete(sender) } }
}
module.exports = { PROTOCOL, INDEX, createStore, readOverlay(cloud, base) { return load(cloud, base).collection }, hasOverlay(cloud) { return cloud?.fileExists?.(INDEX) === true } }
