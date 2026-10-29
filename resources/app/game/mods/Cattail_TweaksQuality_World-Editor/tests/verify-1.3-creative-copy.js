'use strict'

// Real native 1.3 save methods, Loader, Better UIs, Tweaks, IndexedDB and renderer
// reloads in a copied Electron runtime. World/UI surroundings and Steam are fixtures.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
if (!process.versions.electron) {
  const root = path.resolve(__dirname, '../../../../../..')
  if (!process.argv.includes('--lab')) process.argv.push('--lab', path.join(path.dirname(root), 'Mod-Development-Backups', 'WE31-Copy-Test-' + Date.now()))
  require('../../Cattail_TweaksQuality_Better-UIs/tests/save-policy-electron.cjs').launch(root, root, { scenario: __filename })
} else module.exports = async function ({ check, evaluate, load, files, baseline, appDir, setCloudFailure }) {
  const MOD = 'Cattail_TweaksQuality_Tweaks', BETTER = 'Cattail_TweaksQuality_Better-UIs', WE = 'Cattail_TweaksQuality_World-Editor'
  const clone = value => JSON.parse(JSON.stringify(value))
  const init = () => evaluate('window.mode=()=>globalThis[Symbol.for("cattail.world-editor.creative-mode")];window.clone=v=>JSON.parse(JSON.stringify(v));void 0')
  async function reset(options = {}) {
    setCloudFailure('')
    await evaluate('(async()=>{if(policy)await policy.flush().catch(()=>{});await new Promise((r,j)=>{const t=game.localDatabase.transaction("charps_memory_slots","readwrite");t.objectStore("charps_memory_slots").clear();t.oncomplete=r;t.onerror=j});localStorage.clear()})()')
    const count = options.count ?? 3
    const slots = Array.from({ length: count }, (_, i) => { const s = clone(baseline[i % baseline.length]); s.name = '槽 ' + i; s.creationTimeStamp = i + 1; return s })
    files.clear(); files.set('charpsMemory', JSON.stringify(slots))
    fs.writeFileSync(path.join(appDir, 'case.json'), JSON.stringify({ config: [[BETTER, 'enableIndependentAutoSave', options.policy !== false], [BETTER, 'enableSaveSlots', options.better !== false]] }))
    fs.writeFileSync(path.join(appDir, 'game/mods/enabled.json'), JSON.stringify({ mods: options.reverse ? [WE, BETTER, MOD] : [MOD, BETTER, WE] }))
    await load(); await init()
    const actualSlots = await evaluate('game.saveSlots.filter(s=>s&&s.tweaksSavePolicy?.role!=="auto").map(s=>s.name)')
    assert.equal(actualSlots.length, count, 'Fixture reset must not retain earlier cases: ' + JSON.stringify(actualSlots))
    if (options.noSource && count) await evaluate('(async()=>{const next=game.saveSlots.slice(),a=game.currentSlotId;next[a]={...next[a],tweaksSavePolicy:{...next[a].tweaksSavePolicy,sourceId:null}};await policy.persistCollection(next);await service.settle({game})})()')
    await evaluate('window.beforeSlots=JSON.stringify(game.saveSlots);window.beforePreferences=localStorage.getItem("abstractv03_preferencessynthetic-owner");window.beforeIndex=game.currentSlotId;window.originalId=game.assembleSave().modloader.saveInstanceId;void 0')
  }
  const fork = name => evaluate('(async()=>{try{return await mode().createFork({originalName:' + JSON.stringify(name) + '})}catch(e){return {code:e.code,message:e.message}}})()')
  async function rejects(name, code, label) {
    const r = await fork(name); assert.equal(r.code, code, label + ': ' + JSON.stringify(r))
    check(label, await evaluate('JSON.stringify(game.saveSlots)===beforeSlots&&reloadRequests.length===0'))
  }
  const unchangedOnDisk = () => evaluate('(async()=>{const previous=JSON.parse(beforeSlots);for(let i=0;i<Math.max(game.saveSlots.length,21);i++){const stored=await game.readFromSlot(i);if(JSON.stringify(stored||null)!==JSON.stringify(previous[i]||null))return false}return true})()')

  for (const policyEnabled of [true, false]) {
    await reset({ policy: policyEnabled })
    await evaluate('window.sourceIndex=service.snapshot().fork.sourceIndex;window.oldSource=JSON.stringify(game.saveSlots[sourceIndex]);game.resources=game.resources.slice();game.resources[0]=734;game.orbUpgradeMap=[1,7,9];game.completions=8;game.memoryBuffer=[[7,4]];ModLoader.on("beforeSaveWrite",save=>{save.modloader.fixtureUnicode="保留🙂";return save},"creative-copy-fixture");void 0')
    const r = await fork('分叉🙂')
    assert.equal(r.activated, true, JSON.stringify(r))
    check('Policy ' + policyEnabled + ': full native fork commits and schedules one reload', r.reloadScheduled && r.cloudSaved && await evaluate('reloadRequests.length===1'))
    await evaluate('window.receipt=' + JSON.stringify(r) + ';void 0')
    check('Policy ' + policyEnabled + ': original manual head and every existing history record remain unchanged', await evaluate('(()=>{const old=JSON.parse(oldSource),now=game.saveSlots[sourceIndex];return JSON.stringify(now.stack[0])===JSON.stringify(old.stack[0])&&JSON.stringify(now.stack.slice(2))===JSON.stringify(old.stack.slice(1))})()'))
    check('Policy ' + policyEnabled + ': ordinary checkpoint and creative copy share one complete capture with independent identities', await evaluate('(()=>{const o=game.saveSlots[sourceIndex].stack[1],c=game.saveSlots[receipt.entries[0].index].stack[0];if(!o.isProtected||o.state.modloader.saveInstanceId!==originalId||o.state.modloader.worldEditor.creativeMode||c.state.modloader.saveInstanceId===originalId||!c.state.modloader.worldEditor.creativeMode||!c.permanents.modloader.worldEditor.creativeMode||c.state.resources[0]!==734||c.permanents.completions!==8||c.state.modloader.fixtureUnicode!=="保留🙂")return false;const clean=r=>{const v=clone(r);delete v.isProtected;delete v.state.modloader.saveInstanceId;delete v.state.modloader.worldEditor;delete v.permanents.modloader.worldEditor;return JSON.stringify(v)};return clean(o)===clean(c)&&game.saveSlots[receipt.entries[0].index].stack.length===1})()'))
    const ordinary = await evaluate('JSON.stringify(game.saveSlots[sourceIndex])')
    const originalIndex = r.sourceIndex, copyIndex = r.entries[0].index
    await load(); await init()
    check('Policy ' + policyEnabled + ': actual reload verifies new identity, mode and cumulative progress', await evaluate('mode().snapshot().ready&&mode().snapshot().creativeMode&&game.resources[0]===734&&game.completions===8&&service.snapshot().ready&&!localStorage.getItem("abstractv03_saveSlotsNativeActivationsynthetic-owner")'))
    await evaluate('game.resources=game.resources.slice();game.resources[0]=735;game.saveStackUpdateNeeded=true;game.saveGame()')
    const restoredOriginal = await evaluate('game.saveSlots[' + originalIndex + ']')
    fs.writeFileSync(path.join(appDir, 'ordinary-branch.json'), JSON.stringify({ expected: JSON.parse(ordinary), actual: restoredOriginal }, null, 2))
    const expectedOriginal = JSON.parse(ordinary)
    // Existing cloud merge normalizes an absent tombstone list to []; records are exact.
    if (policyEnabled) expectedOriginal.tweaksSavePolicy.removed ||= []
    assert.deepEqual(restoredOriginal, expectedOriginal, 'Ordinary branch after reload and save')
    check('Policy ' + policyEnabled + ': later saves leave the ordinary branch unchanged', true)
    check('Policy ' + policyEnabled + ': later history belongs to the copy', await evaluate(policyEnabled ? 'policy.sourceIndex()===' + copyIndex + '&&game.saveSlots[' + copyIndex + '].stack.some(r=>r.state.resources[0]===735)' : 'game.currentSlotId===' + copyIndex + '&&game.saveSlots[' + copyIndex + '].stack[0].state.resources[0]===735'))
    // Select the newest protected point through the actual rendered history button.
    await evaluate('render();document.querySelector(".cattail-save-slots-row[data-slot-index=\\"' + originalIndex + '\\"] .cattail-save-slots-timeline").querySelectorAll("button").item(game.saveSlots[' + originalIndex + '].stack.length-1).onclick({preventDefault(){},stopPropagation(){}})')
    await load(); await init()
    check('Policy ' + policyEnabled + ': ordinary checkpoint restores the split-time world without Creative', await evaluate('mode().snapshot().ready&&!mode().snapshot().creativeMode&&game.resources[0]===734&&game.completions===8'))
  }

  await reset({ count: 0 })
  check('New world: UI summary requires two empty positions', await evaluate('service.snapshot().fork.requiredSlots===2&&service.snapshot().fork.sourceIndex===-1'))
  const fresh = await fork('起点'); assert.equal(fresh.activated, true, JSON.stringify(fresh))
  await evaluate('window.receipt=' + JSON.stringify(fresh) + ';void 0')
  check('New world: one ordinary save and one single-record creative save, no duplicate lineage', await evaluate('(()=>{const s=game.saveSlots[receipt.sourceIndex],c=game.saveSlots[receipt.entries[0].index];return game.saveSlots.filter(s=>s&&s.tweaksSavePolicy?.role!=="auto").length===2&&s.name==="起点"&&c.name==="起点创造模式"&&s.stack.length===1&&s.stack[0].isProtected&&!s.stack[0].state.modloader.worldEditor.creativeMode&&c.stack.length===1&&s.stack[0].state.modloader.saveInstanceId!==c.stack[0].state.modloader.saveInstanceId})()'))
  await load(); await init()
  check('New world: reload verifies the two-slot fork', await evaluate('service.snapshot().ready&&mode().snapshot().creativeMode'))

  await reset({ count: 20 }); await rejects('无空位', 'INSUFFICIENT_EMPTY_SLOTS', 'Full slots reject before mutation')
  await reset({ count: 19 }); const one = await fork('一空位'); check('Existing ordinary source needs only the one remaining free position', one.activated === true && one.entries[0].index === 19)
  await reset({ count: 19, noSource: true }); await rejects('仅一空位', 'INSUFFICIENT_EMPTY_SLOTS', 'Missing ordinary source requires two free slots')
  await reset({ count: 18, noSource: true }); const two = await fork('两空位'); check('Missing source with exactly two free slots succeeds', two.activated === true)
  await reset({ noSource: true }); await rejects('槽 0', 'NAME_CONFLICT', 'New ordinary name cannot overwrite an occupied slot')
  await reset(); await evaluate('game.saveSlots[0].name="重复创造模式";beforeSlots=JSON.stringify(game.saveSlots);void 0')
  await rejects('重复', 'NAME_CONFLICT', 'Creative name conflicts are rejected')
  for (const name of ['', 'a'.repeat(61), 'bad\nname']) { await reset(); await rejects(name, 'INVALID_NAME', 'Invalid base name ' + JSON.stringify(name)) }
  await reset({ better: false }); await rejects('缺服务', 'SAVE_SLOTS_UNAVAILABLE', 'Disabled Better UIs rejects the fork')
  await reset(); await evaluate('window.realService=service;globalThis[Symbol.for("cattail.better-uis.save-slots")]={...service,capabilities:()=>({createAndActivate:true})};void 0')
  await rejects('旧服务', 'SAVE_SLOTS_UNAVAILABLE', 'Old service cannot silently ignore source protection')
  await reset(); await evaluate('game.preventSaving=true'); await rejects('禁写', 'SAVING_BLOCKED', 'Ending/save prohibition is respected')
  await reset(); await evaluate('globalThis[Symbol.for("cattail.world-editor.transactions")]={game,isBusy:()=>true};void 0')
  await rejects('编辑忙', 'BUSY', 'Another editor transaction blocks the fork')

  for (const policyEnabled of [true, false]) {
    for (const fault of ['write', 'read', 'preferences', 'marker']) {
      await reset({ policy: policyEnabled })
      await evaluate('window.fault=' + JSON.stringify(fault) + ';void 0')
      await evaluate('(function(){const db=game.localDatabase,read=game.readFromSlot.bind(game),save=game.savePreferences.bind(game),set=Storage.prototype.setItem;let used=false;game.localDatabase={transaction(...a){const tx=db.transaction(...a);if(fault==="write"&&a[1]==="readwrite"&&!used){const get=tx.objectStore.bind(tx);tx.objectStore=n=>{const s=get(n),put=s.put.bind(s);s.put=(...v)=>{if(!used&&v[1][1]===3){used=true;tx.abort();throw Error("Injected fork write failure")}return put(...v)};return s}}return tx}};game.readFromSlot=async function(i){const v=await read(i);if(fault==="read"&&game.preventSaving&&!used&&i===3){used=true;return {...v,name:"wrong readback"}}return v};game.savePreferences=function(){if(fault==="preferences"&&!used){used=true;throw Error("Injected preference failure")}return save()};Storage.prototype.setItem=function(k,v){if(fault==="marker"&&!used&&k.includes("saveSlotsNativeActivation")){used=true;throw Error("Injected activation marker failure")}return set.call(this,k,v)};window.restoreFault=()=>{game.localDatabase=db;game.readFromSlot=read;game.savePreferences=save;Storage.prototype.setItem=set}})();void 0')
      const failure = await fork('失败重试')
      assert.ok(failure.code, JSON.stringify(failure)); assert.notEqual(failure.code, 'ROLLBACK_FAILED', JSON.stringify(failure))
      await evaluate('restoreFault();void 0')
      check('Policy ' + policyEnabled + ': ' + fault + ' failure restores memory, selection and prevents reload', await evaluate('JSON.stringify(game.saveSlots)===beforeSlots&&game.currentSlotId===beforeIndex&&!game.preventSaving&&reloadRequests.length===0&&localStorage.getItem("abstractv03_preferencessynthetic-owner")===beforePreferences'))
      check('Policy ' + policyEnabled + ': ' + fault + ' failure restores IndexedDB', await unchangedOnDisk())
      const retried = await fork('失败重试')
      check('Policy ' + policyEnabled + ': ' + fault + ' failure permits one clean retry', retried.activated === true && retried.entries.length === 1)
    }
  }

  await reset()
  await evaluate('window.realRead=game.readFromSlot.bind(game);window.readGate=new Promise(r=>window.releaseRead=r);window.waiting=false;game.readFromSlot=async i=>{waiting=true;await readGate;return realRead(i)};window.first=mode().createFork({originalName:"并行"}).catch(e=>({code:e.code}));void 0')
  await rejects('重复点击', 'BUSY', 'Repeated click cannot create a second copy')
  await evaluate('window.queuedSave=game.saveGame();releaseRead();void 0')
  const concurrent = await evaluate('Promise.race([Promise.all([first,queuedSave]).then(v=>v[0]),new Promise(r=>setTimeout(()=>r({code:"TIMEOUT"}),3000))])')
  check('Queued autosave and protected fork finish without circular waits', concurrent.activated === true)

  await reset()
  await evaluate('window.realRead=game.readFromSlot.bind(game);window.readGate=new Promise(r=>window.releaseRead=r);game.readFromSlot=async i=>{await readGate;return realRead(i)};window.first=mode().createFork({originalName:"过期"}).catch(e=>({code:e.code}));void 0')
  await evaluate('game.currentSlotId=2;releaseRead();void 0')
  const stale = await evaluate('first')
  check('Changing the active slot during verification rejects before writing', stale.code === 'SAVE_CONTEXT_CHANGED' && await evaluate('JSON.stringify(game.saveSlots)===beforeSlots&&game.currentSlotId===2&&reloadRequests.length===0'))

  await reset()
  await evaluate('(function(){const db=game.localDatabase,read=game.readFromSlot.bind(game);let writes=0;game.localDatabase={transaction(...a){const tx=db.transaction(...a);if(a[1]==="readwrite"&&++writes===2){const get=tx.objectStore.bind(tx);tx.objectStore=n=>{const s=get(n);s.put=()=>{tx.abort();throw Error("Injected rollback failure")};return s}}return tx}};game.readFromSlot=async i=>{const v=await read(i);return game.preventSaving&&i===3?{...v,name:"wrong"}:v};window.restoreFault=()=>{game.localDatabase=db;game.readFromSlot=read}})();void 0')
  const recovery = await fork('恢复失败')
  check('Uncertain recovery blocks later saves and editor writes', recovery.code === 'ROLLBACK_FAILED' && await evaluate('game.preventSaving&&!mode().snapshot().ready&&reloadRequests.length===0'))
  await evaluate('restoreFault();void 0')

  for (const policyEnabled of [true, false]) {
    await reset({ policy: policyEnabled }); setCloudFailure(policyEnabled ? 'cattail-save-policy-v2.json' : 'charpsMemory')
    const local = await fork('仅本地')
    check('Policy ' + policyEnabled + ': cloud failure preserves a successful local fork and schedules entry', local.activated === true && local.cloudSaved === false)
    await load(); await init()
    check('Policy ' + policyEnabled + ': local-only notice survives actual reload with verified Creative mode', await evaluate('mode().snapshot().creativeMode&&service.snapshot().ready&&service.snapshot().activationNotice?.cloudSaved===false'))
    setCloudFailure(''); await evaluate('game.saveGame()')
    check('Policy ' + policyEnabled + ': local autosave retains the cloud warning', await evaluate('service.snapshot().activationNotice?.cloudSaved===false'))
    await evaluate('tap(game.currentSlotId,"保存")')
    check('Policy ' + policyEnabled + ': explicit Save clears the warning', await evaluate('service.snapshot().activationNotice===null&&!localStorage.getItem("abstractv03_saveSlotsForkNoticesynthetic-owner")'))
  }

  await reset(); const corrupt = await fork('损坏标记'); assert.equal(corrupt.activated, true)
  await evaluate('(()=>{const key="abstractv03_saveSlotsNativeActivationsynthetic-owner",m=JSON.parse(localStorage.getItem(key));m.fork.sourceId="unrelated";localStorage.setItem(key,JSON.stringify(m))})()')
  await load(); await init()
  const beforeBlockedSave = await evaluate('JSON.stringify(game.saveSlots)')
  await evaluate('game.saveGame()')
  check('Mismatched source identity on actual reload leaves activation pending and prevents later saving', await evaluate('!service.snapshot().ready&&service.snapshot().error.code==="VERIFY_FAILED"&&!!localStorage.getItem("abstractv03_saveSlotsNativeActivationsynthetic-owner")') && await evaluate('JSON.stringify(game.saveSlots)') === beforeBlockedSave)

  await reset()
  await evaluate('window.realRead=game.readFromSlot.bind(game);game.readFromSlot=async i=>{const s=await realRead(i);if(game.preventSaving&&i===3)game.currentSlotId=2;return s};void 0')
  const switched = await fork('提交时切换')
  check('A foreign selection during commit is not overwritten by recovery and further writes are blocked', switched.code === 'ROLLBACK_FAILED' && await evaluate('game.currentSlotId===2&&game.preventSaving&&!mode().snapshot().ready&&reloadRequests.length===0'))
  await evaluate('game.readFromSlot=realRead;void 0')
  check('The interrupted fork restores its own local records', await unchangedOnDisk())

  await reset({ reverse: true }); const reverse = await fork('倒序')
  check('Reversed Mod order supports the same protected fork', reverse.activated === true)

  await reset()
  await evaluate('(async()=>{const s=game.saveSlots[1];while(s.stack.length<20)s.stack.push(clone(s.stack[1]));s.stack.slice(1).forEach(r=>r.isProtected=true);await game.writeToSlot(s,1);window.oldHistory=JSON.stringify(s.stack)})()')
  const history = await fork('历史已满')
  check('Explicit split preserves every prior history point even above the soft limit', history.activated === true && await evaluate('game.saveSlots[1].stack.length===21&&JSON.stringify([game.saveSlots[1].stack[0],...game.saveSlots[1].stack.slice(2)])===oldHistory'))

  // Execute the actual two dialog functions with minimal surrounding dialog widgets.
  const shell = fs.readFileSync(path.join(appDir, 'creative-shell.txt'), 'utf8').replace(/\r\n/g, '\n')
  const start = shell.indexOf('\t\t\tfunction openEnableCreativeDialog()'), end = shell.indexOf('\t\t\tfunction openDisableCreativeDialog()', start)
  assert.ok(start >= 0 && end > start)
  const dialogs = shell.slice(start, end)
  const uiFactory = 'const game=window.game,creative=mode(),i18n=globalThis[Symbol.for("cattail.world-editor.i18n")],SAVE_SLOTS_KEY=Symbol.for("cattail.better-uis.save-slots");let creativeDialog=null;' +
    'const formatTemplate=(s,v)=>s.replace(/\\{(\\w+)\\}/g,(_,k)=>String(v[k]??""));' +
    'function closeCreativeDialog(){creativeDialog?.element.remove();creativeDialog=null}' +
    'function createCreativeDialog(kind){const element=document.createElement("section"),content=document.createElement("div"),actions=document.createElement("div");element.append(content,actions);return{kind,element,content,actions}}' +
    'function createDialogButton(d,key){const b=document.createElement("button");b.textContent=i18n.t(game,key);return b}' +
    'function finishCreativeDialogMount(d){document.body.append(d.element);for(const n of d.element.querySelectorAll("[data-creative-text]"))n.textContent=i18n.t(game,n.dataset.creativeText)}' +
    'function setCreativeDialogBusy(d,value){d.busy=value}function showCreativeDialogError(d,e){d.copyStatus.textContent=e.message;d.error=e.code}' +
    dialogs + ';return{open:openEnableCreativeDialog,dialog:()=>creativeDialog}'
  async function installUI() { await evaluate('window.copyUI=(new Function(' + JSON.stringify(uiFactory) + '))();copyUI.open();void 0') }
  await reset(); await installUI()
  check('Actual first dialog enables the native copy button with a capable service', await evaluate('!copyUI.dialog().createCopy.disabled'))
  await evaluate('copyUI.dialog().createCopy.click();void 0')
  check('Actual second dialog explains the protected original history point', await evaluate('copyUI.dialog().copyStatus.textContent.includes("受保护历史点")&&!copyUI.dialog().createCopy.disabled'))
  await evaluate('copyUI.dialog().input.value="界面分叉";copyUI.dialog().input.dispatchEvent(new Event("input"));copyUI.dialog().createCopy.click();void 0')
  await evaluate('(async()=>{for(let i=0;i<100&&!reloadRequests.length&&!copyUI.dialog().error;i++)await new Promise(r=>setTimeout(r,20))})()')
  check('Actual dialog click invokes the real controller/service and reports successful creation', await evaluate('reloadRequests.length===1&&copyUI.dialog().copyStatus.textContent.includes("正在重新加载")'))
  await reset({ count: 0 }); await installUI(); await evaluate('copyUI.dialog().createCopy.click();void 0')
  check('New-world dialog previews the ordinary save name and two slots', await evaluate('copyUI.dialog().copyStatus.textContent.includes("普通存档")&&copyUI.dialog().copyStatus.textContent.includes("2")'))
  await reset({ better: false }); await installUI()
  check('Missing dependency is explained in the first dialog', await evaluate('copyUI.dialog().createCopy.disabled&&copyUI.dialog().content.textContent.includes("Better UIs")'))
  await reset(); await evaluate('window.i18n=globalThis[Symbol.for("cattail.world-editor.i18n")];void 0')
  check('All twenty locales provide the native protection, capacity and cloud notice text', await evaluate('i18n.languages.length===20&&i18n.languages.every(l=>["creativeCopyNeedsSlots","creativeCopyReady","creativeCopyReadyNew","creativeCopyUnavailable","creativeCopyLocalOnly"].every(k=>i18n.t(l,k)!==k))'))
  check('Private dialog variants preserve the existing public translation catalog', await evaluate('i18n.keys.length===268&&!i18n.keys.includes("creativeCopyReadyNew")'))

  const statusStart = shell.indexOf('const refreshEconomyStatus = function'), statusEnd = shell.indexOf('const refreshVisibility = function', statusStart)
  assert.ok(statusStart >= 0 && statusEnd > statusStart)
  const listenerStart = shell.indexOf('const handleSaveSlotsStatus = function'), listenerEnd = shell.indexOf('const handleGameHud = function', listenerStart)
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart)
  const registration = shell.match(/window\.addEventListener\(SAVE_SLOTS_STATUS_EVENT, handleSaveSlotsStatus\)/)?.[0]
  const cleanup = shell.match(/window\.removeEventListener\(SAVE_SLOTS_STATUS_EVENT, handleSaveSlotsStatus\)/)?.[0]
  assert.ok(registration && cleanup)
  const statusUI = 'const game=window.game,i18n=globalThis[Symbol.for("cattail.world-editor.i18n")],SAVE_SLOTS_KEY=Symbol.for("cattail.better-uis.save-slots"),SAVE_SLOTS_STATUS_EVENT="cattail:better-uis-save-status",economyStatus=document.createElement("div"),refreshVisibility=()=>{};let currentCreativeEconomy={phase:"idle"};' +
    shell.slice(statusStart, statusEnd) + shell.slice(listenerStart, listenerEnd) + registration + ';refreshEconomyStatus();return{element:economyStatus,cleanup:()=>{' + cleanup + '},fail:()=>{currentCreativeEconomy={phase:"failed"};refreshEconomyStatus()}}'
  for (const policyEnabled of [true, false]) {
    await reset({ policy: policyEnabled }); setCloudFailure(policyEnabled ? 'cattail-save-policy-v2.json' : 'charpsMemory')
    assert.equal((await fork('提示重载')).cloudSaved, false)
    await load(); await init()
    await evaluate('window.copyNotice=(new Function(' + JSON.stringify(statusUI) + '))();void 0')
    check('Policy ' + policyEnabled + ': editor displays the persisted local-only notice after reload', await evaluate('copyNotice.element.dataset.active==="true"&&copyNotice.element.textContent.includes("云同步未完成")&&copyNotice.element.getAttribute("role")==="status"'))
    await evaluate('game.saveGame()')
    check('Policy ' + policyEnabled + ': local autosave retains the visible cloud notice', await evaluate('service.snapshot().activationNotice?.cloudSaved===false&&copyNotice.element.textContent.includes("云同步未完成")'))
    await evaluate('tap(game.currentSlotId,"保存")')
    check('Policy ' + policyEnabled + ': another explicit failed Save retains the visible notice', await evaluate('service.snapshot().activationNotice?.cloudSaved===false&&copyNotice.element.textContent.includes("云同步未完成")'))
    setCloudFailure(''); await evaluate('game.saveGame()')
    check('Policy ' + policyEnabled + ': later local saves do not claim cloud recovery', await evaluate('service.snapshot().activationNotice?.cloudSaved===false'))
    await evaluate('tap(game.currentSlotId,"保存")')
    // No manual refresh: use the real explicit Save event and actual shell listener.
    check('Policy ' + policyEnabled + ': explicit successful Save clears the idle banner', await evaluate('service.snapshot().activationNotice===null&&copyNotice.element.dataset.active==="false"&&copyNotice.element.textContent===""'))
    await evaluate('copyNotice.element.textContent="sentinel";window.dispatchEvent(new CustomEvent("cattail:better-uis-save-status",{detail:{game:{}}}));void 0')
    check('Policy ' + policyEnabled + ': unrelated game notifications cannot update this banner', await evaluate('copyNotice.element.textContent==="sentinel"'))
    await evaluate('copyNotice.fail();window.beforeFailureText=copyNotice.element.textContent;window.dispatchEvent(new CustomEvent("cattail:better-uis-save-status",{detail:{game}}));void 0')
    check('Policy ' + policyEnabled + ': status notifications retain editor failure priority', await evaluate('!!beforeFailureText&&copyNotice.element.textContent===beforeFailureText&&copyNotice.element.getAttribute("role")==="alert"'))
    await evaluate('copyNotice.cleanup();copyNotice.element.textContent="disposed";window.dispatchEvent(new CustomEvent("cattail:better-uis-save-status",{detail:{game}}));void 0')
    check('Policy ' + policyEnabled + ': shell cleanup detaches the status listener', await evaluate('copyNotice.element.textContent==="disposed"'))
  }
}
