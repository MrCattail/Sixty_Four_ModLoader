'use strict'
const assert = require('assert/strict'), { createStore, readOverlay, INDEX } = require('../scripts/main/auto-save-policy-store.js')
const { PROTOCOL, clone, hash, describe, mergeSlot } = require('../scripts/save-policy-core.js')
const checks = [], check = (name, value) => { assert(value, name); checks.push(name) }
const record = n => ({ isProtected: false, state: { stuff: [], resources: [n], timestamp: n, custom: '完整🙂', modloader: { saveInstanceId: '00000000-0000-4000-8000-000000000001' } }, permanents: { completions: 4, memory: [[n]] } })
const manual = { name: 'Manual', creationTimeStamp: 1, ownerHash: 7, lastModified: 10, stack: [record(10), { ...record(5), isProtected: true }] }
const files = new Map([['charpsMemory', JSON.stringify([manual])]]), writes = []; let fail = ''
const cloud = { fileExists: f => files.has(f), readFile: f => { if (!files.has(f)) throw Error('missing'); return files.get(f) }, writeFile(f, s) { writes.push(f); if (f === fail) return false; files.set(f, s); return true }, deleteFile(f) { return files.delete(f) } }
const sender = {}, store = createStore({ token: () => 'test-token' })
let hello = store.begin(sender, 'owner', cloud)
check('Begin reads metadata without writing or seeding full collection', hello.ok && writes.length === 0)
const auto = n => ({ name: 'Autosave', creationTimeStamp: 20, ownerHash: 7, lastModified: n, tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: 'manual' }, stack: [record(n)] })
function commit(slot, index = 20, extras = {}) {
  const packet = { protocol: PROTOCOL, action: 'commit', owner: 'owner', token: hello.token, revision: hello.revision, changes: { [index]: describe(slot) }, records: Object.fromEntries(slot.stack.map(r => [hash(r), r])), ...extras }
  const reply = store.store(sender, clone(packet), () => { throw Error('No native full fallback allowed') }, cloud)
  if (reply.saved) hello.revision = reply.revision
  return reply
}
check('Autosave commit writes one record and index', commit(auto(30)).saved && writes.length === 2)
check('Legacy baseline stays byte-identical', files.get('charpsMemory') === JSON.stringify([manual]))
let read = readOverlay(cloud)
check('Reload overlays auto while preserving all manual nodes', JSON.stringify(read[0]) === JSON.stringify(manual) && read[20].stack[0].state.resources[0] === 30)
const previous = JSON.stringify(read)
fail = INDEX
check('Index failure reports cloud false', commit(auto(40)).saved === false)
check('Index failure leaves previous auto fully readable', JSON.stringify(readOverlay(cloud)) === previous)
fail = ''; check('Retry commits the changed auto only', commit(auto(40)).saved)
for (let i = 0; i < 12; i++) assert(commit(auto(50 + i)).saved)
check('Autosave data uses exactly two alternating files', [...files.keys()].filter(f => /^cattail-auto-/.test(f)).length === 2)
read = readOverlay(cloud)
check('Latest auto survives repeated alternating commits', read[20].stack[0].state.resources[0] === 61)
const source = { ...manual, lastModified: 70, tweaksSavePolicy: { id: 'manual', headAt: 10 }, stack: [manual.stack[0], record(70), manual.stack[1]] }
check('Appending source history preserves the manual head', commit(source, 0).saved && JSON.stringify(readOverlay(cloud)[0].stack[0]) === JSON.stringify(manual.stack[0]))
check('Unchanged legacy nodes are referenced without copying their data', !writes.includes('cattail-save-node-' + hash(manual.stack[0]) + '.json'))
const shared = { ...source, stack: [source.stack[0], auto(61).stack[0], ...source.stack.slice(1)] }
assert(commit(shared,0).saved)
for(let n=100;n<106;n++)assert(commit(auto(n)).saved)
check('History sharing an auto snapshot remains readable after the auto ring wraps',readOverlay(cloud)[0].stack.some(r=>r.state.timestamp===61))
const immutableFile='cattail-save-node-'+hash(auto(61).stack[0])+'.json'
fail=INDEX;assert.equal(commit(source,0).saved,false)
check('A failed prune keeps the previous referenced history file',files.has(immutableFile)&&readOverlay(cloud)[0].stack.some(r=>r.state.timestamp===61))
fail='';assert(commit(source,0).saved)
check('Garbage collection removes only unreferenced generated history after commit',!files.has(immutableFile)&&files.has('charpsMemory')&&readOverlay(cloud)[0].stack.some(r=>r.isProtected))
const old = clone(source), newer = clone(source); old.lastModified = 90; old.stack.splice(1, 0, record(90)); newer.lastModified = 80; newer.tweaksSavePolicy.headAt = 80; newer.stack[0] = record(80)
const merged = mergeSlot(old, newer)
check('Local newer history does not displace a newer cloud manual head', merged.stack[0].state.timestamp === 80 && merged.stack.some(r => r.state.timestamp === 90))
const beforeForeign = writes.length
check('Foreign sender is rejected without a write', store.store({}, { protocol: PROTOCOL, owner: 'owner', token: hello.token }, () => false, cloud).ok === false && writes.length === beforeForeign)
const missing = clone(auto(1000)); const missingPacket = { protocol: PROTOCOL, action: 'commit', owner: 'owner', token: hello.token, revision: hello.revision, changes: {20:describe(missing)}, records:{} }
check('Missing referenced records fail without publishing an index', store.store(sender,missingPacket,()=>false,cloud).reason === 'missing-record')
const latestIndex = JSON.parse(files.get(INDEX)); const currentFile = latestIndex.files[latestIndex.slots[20].stack[0]], currentData = files.get(currentFile)
files.set(currentFile, '{}'); assert.throws(()=>readOverlay(cloud)); files.set(currentFile,currentData)
check('Checksum corruption blocks loading instead of returning stale progress', true)
const changedBase = [clone(manual)]; changedBase[0].lastModified=999; files.set('charpsMemory',JSON.stringify(changedBase))
check('A later native full save supersedes the old overlay', JSON.stringify(readOverlay(cloud)) === JSON.stringify(changedBase))
verifyPrepareInputs().then(() => console.log(JSON.stringify({status:'passed',checks},null,2))).catch(error => { console.error(error); process.exitCode = 1 })

async function verifyPrepareInputs() {
  const { createPolicy } = require('../scripts/save-policy.js')
  const good = { name: 'Synthetic local', creationTimeStamp: 1, ownerHash: 1, lastModified: 1, stack: [{ state: null, permanents: {} }] }
  for (const [name, slots] of [
    ['protocol packet', { protocol: PROTOCOL, changes: {}, records: {} }], ['string', 'bad'],
    ['primitive slot', { 0: 'bad' }], ['empty stack', { 0: { stack: [] } }],
    ['non-numeric key', { named: good }], ['array state', { 0: { stack: [{ state: [], permanents: {} }] } }],
    ['missing permanents', { 0: { stack: [{ state: null }] } }]
  ]) {
    let opens = 0, originals = 0
    const game = { getDatabase() { opens++; throw Error('No database access expected') }, readFromSlot() {}, getSlotList() {}, getPreferences() {} }
    await assert.rejects(createPolicy(game).prepare(() => { originals++ }, { slots }), { code: 'TWEAKS_SAVE_INPUT_INVALID' })
    check('Preparation rejects ' + name + ' before database/native writes', opens === 0 && originals === 0 && game.preventSaving === true)
  }
  let opens = 0, originals = 0
  const unavailable = { getDatabase() { opens++; throw Error('No database access expected') }, readFromSlot() {}, getSlotList() {}, getPreferences() {} }
  await assert.rejects(createPolicy(unavailable).prepare(() => { originals++ }, { noSave: true, slots: false }), { code: 'TWEAKS_SAVE_LOAD_FAILED' })
  check('Failed cloud read blocks initialization rather than inventing a fresh save', opens === 0 && originals === 0 && unavailable.preventSaving === true)
  let closed = 0, writes = 0
  const game = { async getDatabase() { return { close() { closed++ }, transaction() { writes++; throw Error('No write expected') } } }, async getSlotList() { return [0] }, async readFromSlot(index) { return index === 0 ? 'synthetic-invalid-local-slot' : undefined }, getPreferences() { return {} } }
  const methods = { read: game.readFromSlot, list: game.getSlotList, preferences: game.getPreferences }
  await assert.rejects(createPolicy(game).prepare(() => { originals++ }, { slots: [] }), { code: 'TWEAKS_SAVE_INPUT_INVALID' })
  check('Invalid local slot also blocks before original/native writes', writes === 0 && originals === 0 && closed === 1 && game.preventSaving)
  check('Input rejection restores the original read/list/preferences methods', game.readFromSlot === methods.read && game.getSlotList === methods.list && game.getPreferences === methods.preferences)
  for (const slots of [[], {}, { 0: good }, [null, false, good]]) {
    const stop = new Error('SYNTHETIC_STOP_BEFORE_NATIVE_WRITES')
    const valid = { async getDatabase() { return { close() {} } }, async getSlotList() { return [] }, async readFromSlot() { return undefined }, getPreferences() { return {} } }
    let reached = false
    await assert.rejects(createPolicy(valid).prepare(() => { reached = true; throw stop }, { slots }), error => error === stop)
    assert(reached)
  }
  check('Valid empty/sparse/native slot collections reach original preparation unchanged', true)
}
