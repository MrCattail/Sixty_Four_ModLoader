'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {ROOT}=require('./fixtures.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,predicate,ms=45000){
 const end=Date.now()+ms;let last;
 while(Date.now()<end){last=await fn();if(predicate(last))return last;await delay(500);}
 throw Error('CONDITION_TIMEOUT '+JSON.stringify(last,(key,value)=>['roomCode','remoteHandshake','memoryRows'].includes(key)?'[redacted]':value).slice(0,10000));
}
async function verify(source,attempt='001'){
 const run=await require('./start.cjs').start(source,attempt),[host,guest]=run.clients;
 const checks=[],evidence={attempt,status:'RUNNING',checks};
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 const save=()=>fs.writeFileSync(path.join(run.dir,'report.json'),JSON.stringify(evidence,null,2));
 try{
  for(const c of run.clients){
   const s=await until(()=>c.call('status'),s=>s.p2p?.ready&&s.guard?.ready,60000);
   check(c.role+' real game initialized',s.game.version==='1.3'&&s.game.store&&s.game.entities>0&&s.game.images>0&&s.guard.clockWorkers===1);
   check(c.role+' early prepare protected',s.guard.timeline.indexOf('preload-protection-installed')<s.guard.timeline.indexOf('before-native-prepare'));
   check(c.role+' disk has no progress',s.disk.length===0&&s.guard.audit.physicalMutation===0);
   await c.call('evaluate',"DEBUG.splash?.isShown && DEBUG.splash.close(); true");
   await c.call('evaluate',"DEBUG.addResourcesFromArray([1024,1024]);DEBUG.store.visibilityUpdate();const item=Object.keys(DEBUG.store.html.items).find(n=>!DEBUG.store.html.items[n].classList.contains('hidden'));if(item)DEBUG.store.centerItem(item);true");
   await delay(1500);
   check(c.role+' native store and resource UI rendered',await c.call('evaluate',"Object.values(DEBUG.store.html.items).some(n=>!n.classList.contains('hidden')) && DEBUG.resources[0]>0 && DEBUG.stuff.length>0 && !DEBUG.splash.isShown"));
   await c.call('screenshot','world');
  }
  const code=await host.call('create');await guest.call('join',code);
  for(const c of run.clients){
   const s=await until(()=>c.call('status'),s=>s.p2p.transport.peers.some(p=>p.channelOpen&&p.remoteHandshake&&p.sameMachine));
   const peer=s.p2p.transport.peers[0];
   check(c.role+' open actual-version handshake',peer.channelOpen&&peer.remoteHandshake.gameVersion==='1.3');
   check(c.role+' same-machine host/direct with no ICE services',peer.connectionPath==='direct'&&peer.localCandidateType==='host'&&peer.remoteCandidateType==='host'&&peer.sameMachine&&s.p2p.transport.iceServerCount===0&&s.p2p.signaling.iceServers.length===0);
   await c.call('probe');
   await until(()=>c.call('evaluate',"CattailP2PPhase2.getAuditEntries().some(e=>e.type==='binary-probe-acknowledged'&&e.details.byteLength===4096&&e.details.checksum===522263)"),Boolean,12000);
   check(c.role+' 4096 bytes acknowledged checksum 522263',true);
  }
  for(const c of run.clients){
   await until(()=>c.call('evaluate',"CattailP2PPhase2.getAuditEntries().some(e=>e.type==='binary-probe-received'&&e.details.byteLength===4096&&e.details.checksum===522263)"),Boolean);
   check(c.role+' received remote 4096 bytes',true);
   const s=await until(()=>c.call('status'),s=>s.guard.saveTimes.length>=2&&s.guard.saveResults.length>=2,30000);
   check(c.role+' two native autosaves commit to memory',s.guard.saveTimes[1]-s.guard.saveTimes[0]>=9500&&s.guard.saveResults.every(x=>x==='memory-committed')&&s.guard.memoryRows.length>0&&s.disk.length===0);
   check(c.role+' world and renderer advance',s.guard.ticks>10&&s.guard.frames>10&&s.game.playTime>0);
   const blocked=await c.call('evaluate',"(async()=>{const names=['reset','wipeSlot','deleteSlot','shiftSlots','addNewSlot','loadSaveFromSlotStack','loadSaveFromClipboard','exportSave'];return Promise.all(names.map(async n=>typeof DEBUG[n]==='function'?(await DEBUG[n](999,999))===false:true));})()");
   check(c.role+' high risk UI consumers resolve false',blocked.every(Boolean));
   const raw=await c.call('evaluate',"CattailP2PEarlySession.testRawStoreWrite()");
   check(c.role+' raw physical writes denied',raw);
   const pref=await c.call('evaluate',"(()=>{DEBUG.splash.updateMute(true);DEBUG.savePreferences();return JSON.parse(CattailP2PEarlySession.readDiskKey(CattailP2PEarlySession.prefKey)).mute===true;})()");
   check(c.role+' isolated preference persists',pref);
   const faults=await c.call('evaluate',"(async()=>{const s=CattailP2PEarlySession;const result=[];for(const f of ['database','transaction']){s.fault(f);try{await DEBUG.writeToSlot({synthetic:true},77);result.push(false)}catch(e){result.push(true)}finally{s.fault('')}}return result;})()");
   check(c.role+' native database and transaction faults reject',faults.every(Boolean));
   const errors=await c.call('evaluate',"CattailP2PEarlySession.snapshot().errors");
   check(c.role+' no unhandled errors',errors.length===0);
   await c.call('evaluate',"CattailP2PPhase2.openPage();true");
   await delay(500);
   check(c.role+' P2P page visible with role',await c.call('evaluate',"(()=>{const node=DEBUG.splash.element.querySelector('.cattail-p2p-phase2-page');return !!node&&node.isConnected&&DEBUG.splash.element.classList.contains('cattail-p2p-phase2-active')&&node.innerText.includes(CattailP2PPhase2.config.role.toUpperCase());})()"));
   // The UI renders room identifiers; redact their DOM text before screenshots.
   await c.call('evaluate',"(()=>{const code=CattailP2PPhase2.getStatus().signaling.roomCode;const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())if(n.nodeValue.includes(code))n.nodeValue=n.nodeValue.split(code).join('[redacted]');return true})()");
   await c.call('screenshot','p2p');
  }
  const before=await guest.call('evaluate','JSON.stringify({translation:DEBUG.translation,zoom:DEBUG.zoom,splash:DEBUG.splash.isShown})');
  await host.call('evaluate',"DEBUG.translation=[137,291];DEBUG.zoom=1.17;DEBUG.savePreferences();true");
  const after=await guest.call('evaluate','JSON.stringify({translation:DEBUG.translation,zoom:DEBUG.zoom,splash:DEBUG.splash.isShown})');
  check('independent camera zoom and UI',before===after);
  for(const c of run.clients){
   await c.call('evaluate',"DEBUG.writeToSlot({synthetic:true,marker:'reload-memory-only'},77).then(()=>true)");
   const ticks=(await c.call('status')).guard.ticks;
   await c.call('reload');
   const s=await until(()=>c.call('status'),s=>s.guard?.ready&&s.guard?.ticks<ticks&&s.p2p?.ready);
   check(c.role+' real reload reinstalls early protection',s.guard.timeline.includes('before-native-prepare')&&s.disk.length===0&&s.guard.audit.physicalMutation===0);
   check(c.role+' reload drops memory progress',s.guard.saveTimes.length===0&&!s.guard.memoryRows.some(row=>row.key[1]===77));
   check(c.role+' reload no unhandled errors',s.guard.errors.length===0);
   check(c.role+' Loader public context has no errors',await c.call('evaluate',"!ModLoader.state.issues.some(issue=>issue.level==='error')"));
   const summary=await c.call('summary');
   check(c.role+' isolated public Loader bridge and main',summary.pathsConfined&&!summary.officialMainLoaded&&summary.counters.realCloudCalls===0&&summary.counters.realSteamInitializations===0&&summary.counters.externalCompleted===0);
   evidence[c.role]={versions:summary.versions,counters:summary.counters,pathsConfined:summary.pathsConfined,localCandidate:'host',remoteCandidate:'host',sameMachine:true};
  }
  evidence.status='PASS';
 }catch(e){evidence.status='FAIL';evidence.error=e.message;throw e;}
 finally{
  await run.stop();save();
  await require('./signaling-local.cjs').portFree();
  evidence.cleanup={ownedMainProcessesExited:run.clients.every(c=>c.child.exitCode!==null||c.child.signalCode!==null),port8787Released:true};
  save();
 }
 return evidence;
}
module.exports={verify};
if(require.main===module)verify(process.argv[2]||process.cwd(),process.argv[3]||'001').catch(e=>{console.error(e.message);process.exitCode=1;});
