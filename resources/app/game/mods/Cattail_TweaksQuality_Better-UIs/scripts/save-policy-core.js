'use strict'
const crypto = require('crypto')
const PROTOCOL = 'tweaks-save-policy-v2'
const INDEX = 'cattail-save-policy-v2.json'
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const info = slot => slot?.tweaksSavePolicy || {}
const isAuto = slot => info(slot).role === 'auto'
function describe(slot) {
  if (!slot) return null
  const { stack, ...meta } = slot
  return { meta: clone(meta), stack: stack.map(hash) }
}
function mergeSlot(local, remote) {
  if (!local) return clone(remote)
  if (!remote) return local
  const a = info(local), b = info(remote)
  if (a.id !== b.id || !a.id || isAuto(local) || isAuto(remote)) return remote.lastModified >= local.lastModified ? clone(remote) : local
  const newest = remote.lastModified >= local.lastModified ? remote : local
  const head = (b.headAt ?? remote.lastModified) >= (a.headAt ?? local.lastModified) ? remote : local
  const removed = new Set([...(a.removed || []), ...(b.removed || [])])
  const records = new Map()
  for (const slot of [local, remote]) for (const record of slot.stack.slice(1)) {
    const id = hash(record)
    if (!removed.has(id)) records.set(id, record)
  }
  records.delete(hash(head.stack[0]))
  return { ...clone(newest), tweaksSavePolicy: { ...clone(info(newest)), headAt: info(head).headAt ?? head.lastModified, removed: [...removed] },
    stack: [clone(head.stack[0]), ...[...records.values()].sort((x, y) => (y.state?.timestamp || 0) - (x.state?.timestamp || 0)).map(clone)] }
}
module.exports = { PROTOCOL, INDEX, clone, hash, info, isAuto, describe, mergeSlot }
