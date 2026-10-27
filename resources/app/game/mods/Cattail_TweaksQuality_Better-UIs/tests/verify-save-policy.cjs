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
verifyEntryConfiguration();
verifyPrepareInputs().then(verifyDeferredPolicy).then(() => console.log(JSON.stringify({status:'passed',checks},null,2))).catch(error => { console.error(error); process.exitCode = 1 })

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

async function verifyDeferredPolicy() {
  const { createPolicy } = require('../scripts/save-policy.js')
  const main = { ...clone(manual), tweaksSavePolicy: { id: 'manual', headAt: 10 } }, other = { ...clone(manual), name: 'Other', tweaksSavePolicy: { id: 'other', headAt: 10 } }
  const local = new Map(), cloudFiles = new Map([['charpsMemory', JSON.stringify([main, other])]])
  const requests = [], writeLog = [], sender = {}, backend = createStore({ token: () => 'local-first-fixture' })
  let n = 100, failFile = '', abort = false, gate = null
  const cloud = { fileExists: f => cloudFiles.has(f), readFile: f => cloudFiles.get(f), writeFile(f, data) { writeLog.push(f); if (f === failFile) return false; cloudFiles.set(f, data); return true }, deleteFile: f => cloudFiles.delete(f) }
  const game = { steamId: 'synthetic', currentSlotId: 20, saveSlots: [main, other], maxSaveStack: 16,
    assembleSave: () => ({ stuff: [], resources: [++n], timestamp: n }), assemblePermanents: () => ({ completions: 4 }), savePreferences() {},
    localDatabase: { transaction() {
      const changes = new Map(), tx = { abort() { queueMicrotask(() => tx.onabort()) }, objectStore: () => ({ put(slot,key) { if (abort) { tx.abort(); throw Error('Synthetic local abort') } changes.set(key[1],clone(slot)) }, delete(key) { changes.set(key[1],null) } }) }
      queueMicrotask(() => { if (!abort) { for (const [i,slot] of changes) { if (slot) local.set(i,slot); else local.delete(i) } tx.oncomplete() } })
      return tx
    } },
    spaceport: { async invoke(channel, packet) {
      requests.push(clone(packet))
      if (packet.action === 'begin') return backend.begin(sender, packet.owner, cloud)
      if (gate) { const waiting=gate;gate=null;waiting.started();await waiting.wait }
      return backend.store(sender, packet, () => { throw Error('Unexpected full fallback') }, cloud)
    }, send(channel) { assert.equal(channel,'quit'); assert.equal(readOverlay(cloud)[20].stack[0].state.resources[0],local.get(20).stack[0].state.resources[0]);game.quitSent=true } }
  }
  game.saveSlots[20] = { name: 'Autosave', creationTimeStamp: 20, lastModified: 20, tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: 'manual' }, stack: [clone(main.stack[0])] }
  const policy = createPolicy(game);game.saveGame=()=>policy.save();policy.installFacade()
  const head=JSON.stringify(main.stack[0])
  assert.equal(await policy.save(),false)
  check('A periodic local save returns no cloud success, starts no IPC/session and writes only auto',policy.pendingCloud && requests.length===0 && writeLog.length===0 && local.size===1 && local.get(20).stack.length===1)
  game.saveStackUpdateNeeded=true;await policy.save()
  check('Four-minute local history does not submit cloud or overwrite the manual head',requests.length===0 && writeLog.length===0 && local.get(0).stack[1].state.resources[0]===102 && JSON.stringify(game.saveSlots[0].stack[0])===head)
  await policy.flush()
  check('Waiting for local queues does not implicitly submit cloud',requests.length===0 && policy.pendingCloud)
  assert.equal(await policy.submitCloud(),true)
  check('An explicit checkpoint submits accumulated history and latest auto once',!policy.pendingCloud && readOverlay(cloud)[0].stack[1].state.resources[0]===102 && readOverlay(cloud)[20].stack[0].state.resources[0]===102 && Object.keys(requests.at(-1).records).length===1)
  const originalCloud=JSON.stringify(readOverlay(cloud));failFile=INDEX
  await policy.save();assert.equal(await policy.submitCloud(),false)
  check('Explicit cloud failure retains newer local data and the previous cloud commit',policy.pendingCloud && policy.lastError==='cloud-index' && JSON.stringify(readOverlay(cloud))===originalCloud && local.get(20).stack[0].state.resources[0]===103)
  const count=requests.length;await policy.save()
  check('Later periodic saves retain failed changes without periodic cloud retries',requests.length===count && policy.lastError==='cloud-index' && local.get(20).stack[0].state.resources[0]===104)
  failFile='';assert.equal(await policy.submitCloud(),true)
  check('The next explicit checkpoint retries the latest local state',!policy.pendingCloud && !policy.lastError && readOverlay(cloud)[20].stack[0].state.resources[0]===104)
  const prior=JSON.stringify(game.saveSlots[20]);abort=true;await assert.rejects(policy.save(),/Synthetic local abort/);abort=false
  check('A local failure does not replace the accepted in-memory auto',JSON.stringify(game.saveSlots[20])===prior)
  await policy.save();let release,started;const waiting=new Promise(r=>release=r),began=new Promise(r=>started=r);gate={wait:waiting,started}
  const checkpoint=policy.submitCloud();await began
  const queued=policy.save()
  const ui=require('fs').readFileSync(require('path').join(__dirname,'../../../scripts/ui.js'),'utf8')
  const body=ui.match(/quit\.onclick = async _=>\{([\s\S]*?)\n\s*\}/)[1]
  const quit=Function('return async function(){'+body+'}')().call({master:game})
  assert(!game.quitSent);release();await checkpoint;await queued;await quit
  check('Actual native Quit waits for queued local saves and its explicit cloud checkpoint',game.quitSent && !policy.pendingCloud && readOverlay(cloud)[20].stack[0].state.resources[0]===n)
  game.saveStackUpdateNeeded=true;await policy.save();const history=n
  const next=game.saveSlots.slice();next[1]=null;await policy.persistCollection(next)
  check('Explicit collection edits include pending history and do not resurrect deleted slots',!readOverlay(cloud)[1] && readOverlay(cloud)[0].stack.some(r=>r.state.resources[0]===history) && !policy.pendingCloud)
  game.saveStackUpdateNeeded=true;await policy.save();const pendingHistory=n
  const direct={...game.saveSlots[20],stack:[record(++n)]};assert.equal(await policy.writeSlot(direct,20),true)
  check('Explicit native slot writes include earlier pending local history',!policy.pendingCloud && readOverlay(cloud)[0].stack.some(r=>r.state.resources[0]===pendingHistory) && readOverlay(cloud)[20].stack[0].state.resources[0]===n)
  const nativeSlot={name:'Native new',creationTimeStamp:1000,lastModified:1000,stack:[record(++n)]};game.saveSlots[21]=nativeSlot
  assert.equal(await policy.writeSlot(nativeSlot,21),true)
  check('A native new/imported slot persists its identity and updated layout before cloud commit',local.get(21).tweaksSavePolicy.id && local.get('cattail-policy-layout').slots[21]===local.get(21).tweaksSavePolicy.id && readOverlay(cloud)[21].tweaksSavePolicy.id===local.get(21).tweaksSavePolicy.id)
  check('Deferred policy never rewrites the native cloud baseline',cloudFiles.get('charpsMemory')===JSON.stringify([main,other]))
}


function verifyEntryConfiguration() {
  const fs=require('fs'),path=require('path'),vm=require('vm')
  const entry=fs.readFileSync(path.join(__dirname,'../scripts/independent-auto-save.js'),'utf8')
  const oldKey='modloader:Cattail_TweaksQuality_Tweaks:config:enableAutoSaveStutterFix'
  const newKey='modloader:Cattail_TweaksQuality_Better-UIs:config:enableIndependentAutoSave'
  function boot(saved=new Map(),parent=true) {
    let registrations=0,installs=0,sets=0
    const hooks=[],values={enableSaveSlots:parent,enableIndependentAutoSave:saved.has(newKey)?JSON.parse(saved.get(newKey)):true}
    const ctx={__dirname:'fixture',Game:function(){},localStorage:{getItem:key=>saved.has(key)?saved.get(key):null},
      require:name=>name==='path'?path:{install(){installs++}},
      ModLoader:{register(def){registrations++;assert.equal(def.id,'Cattail_TweaksQuality_Better-UIs');def.init({
        config:{get:(key,fallback)=>values[key]??fallback,set(key,value){sets++;values[key]=value;saved.set(newKey,JSON.stringify(value))}},
        on(name,fn){assert.equal(name,'beforeGamePrepare');hooks.push(fn)}
      })}}}
    vm.createContext(ctx);vm.runInContext(entry,ctx);vm.runInContext(entry,ctx)
    assert.equal(installs,0);hooks.forEach(fn=>{fn();fn()})
    return {registrations,installs,sets,value:values.enableIndependentAutoSave,saved}
  }
  const fresh=boot();check('New Save option defaults on and registers/installs once before native preparation',fresh.value===true&&fresh.registrations===1&&fresh.installs===1&&fresh.sets===1)
  fresh.saved.set(oldKey,'false');const freshAgain=boot(fresh.saved)
  check('The initial default is sealed against legacy values introduced later',freshAgain.value===true&&freshAgain.sets===0)
  for(const legacy of [false,true]) {
    const saved=new Map([[oldKey,JSON.stringify(legacy)]]),r=boot(saved)
    check('Saved legacy '+legacy+' is inherited without deleting the old choice',r.value===legacy&&r.installs===Number(legacy)&&r.sets===1&&saved.get(oldKey)===JSON.stringify(legacy))
    saved.set(oldKey,JSON.stringify(!legacy));const again=boot(saved)
    check('Subsequent launches preserve the new '+legacy+' choice',again.value===legacy&&again.sets===0)
  }
  for(const choice of [false,true]) {
    const r=boot(new Map([[oldKey,JSON.stringify(!choice)],[newKey,JSON.stringify(choice)]]))
    check('An explicit new '+choice+' setting wins over the opposite legacy value',r.value===choice&&r.sets===0&&r.installs===Number(choice))
  }
  const parentOff=boot(new Map([[oldKey,'true']]),false)
  check('Save slots disabled prevents policy installation while retaining its migrated preference',parentOff.value===true&&parentOff.installs===0&&parentOff.sets===1)
  for(const raw of ['not-json','"false"','null','0']) {
    const r=boot(new Map([[oldKey,raw]]))
    check('A non-boolean legacy value '+raw+' does not migrate',r.value===true&&r.installs===1&&r.sets===1)
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../mod.json'),'utf8'))
  const tweaks=JSON.parse(fs.readFileSync(path.join(__dirname,'../../Cattail_TweaksQuality_Tweaks/mod.json'),'utf8'))
  const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../modloader/translations.json'),'utf8'))
  check('Only Better UIs owns the early entry and settings schema',manifest.entries.includes('scripts/independent-auto-save.js')&&manifest.config.enableIndependentAutoSave.section==='saveSlots'&&manifest.config.enableIndependentAutoSave.default===true&&!tweaks.entries.includes('scripts/auto-save-stutter-fix.js')&&!tweaks.config.enableAutoSaveStutterFix)
  for(const [language,locale] of Object.entries(manifest.translations)) {
    const text=locale.config.enableIndependentAutoSave,override=catalog.languages[language].mods
    assert(text.label&&text.description)
    assert.deepEqual(override[manifest.id].config.enableIndependentAutoSave,text)
    assert(!override[tweaks.id].config.enableAutoSaveStutterFix)
  }
  check('All 20 feature translations and overrides belong to Better UIs',Object.keys(manifest.translations).length===20)
}
