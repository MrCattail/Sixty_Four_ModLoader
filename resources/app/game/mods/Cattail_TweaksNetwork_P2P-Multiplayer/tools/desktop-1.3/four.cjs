'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const FOUR_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-four13-20261027');
if(process.env.CATTAIL_P2P_TOOL_ROOT&&path.resolve(process.env.CATTAIL_P2P_TOOL_ROOT)!==FOUR_ROOT)throw Error('FOUR_ROOT_REQUIRED');
process.env.CATTAIL_P2P_TOOL_ROOT=FOUR_ROOT;
const {ROOT,PLAYER_ROOT,FOUR_INSTANCES:IDS,config,inside}=require('./fixtures.cjs');
const MOD=path.resolve(__dirname,'../..'),SOURCE=path.resolve(MOD,'../../../../..');
const policy=Object.freeze({startupMs:90000,connectionMs:30000,socketCloseMs:12000,ipcMs:15000,shutdownMs:8000,automaticMs:180000});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function write(file,value){if(!inside(ROOT,file))throw Error('OUTPUT_OUTSIDE_FOUR_ROOT');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function noController(){if(fs.existsSync(path.join(ROOT,'active-controller.json')))throw Error('FOUR_CONTROLLER_ACTIVE');}
function prepare(){
 noController();if(fs.existsSync(path.join(ROOT,'runtime-manifest.json'))||fs.existsSync(path.join(ROOT,'runtime')))throw Error('FOUR_RUNTIME_EXISTS');
 if(read(path.join(ROOT,'baseline.json')).approval!=='15A')throw Error('FOUR_APPROVED_BACKUP_REQUIRED');
 const acceptance=read(path.join(PLAYER_ROOT,'reports/205/player-acceptance.json'));if(acceptance.status!=='PASS'||hash(acceptance.rawReport)!==acceptance.rawReportSha256)throw Error('ACCEPTED_205_REQUIRED');
 const frozen=read(path.join(PLAYER_ROOT,'frozen-inputs.json')),prepared=read(path.join(PLAYER_ROOT,'preparation.json')),files=[];
 for(const entry of frozen.copied){
  if(hash(entry.source)!==entry.sha256)throw Error('OLD_008_DRIFT');
  const expected=prepared.overrides.find(item=>path.resolve(item.target)===path.resolve(entry.target))?.sha256||entry.sha256;
  if(hash(entry.target)!==expected)throw Error('OLD_205_DRIFT');
  const relative=path.relative(PLAYER_ROOT,entry.target),target=path.join(ROOT,relative);
  if(!inside(path.join(ROOT,'runtime'),target))throw Error('BAD_RUNTIME_ENTRY');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(entry.target,target);
  files.push({source:entry.target,target,baselineSha256:expected,sha256:expected});
 }
 write(path.join(ROOT,'runtime-manifest.json'),{baseline:'205-on-008',files});
 write(path.join(ROOT,'preparation.json'),{approval:'15A',root:ROOT,inheritedOverrides:prepared.overrides,overrides:[]});
 refreshRuntime();return {root:ROOT,files:files.length};
}
function assertPrepared(){
 const manifest=read(path.join(ROOT,'runtime-manifest.json')),prepared=read(path.join(ROOT,'preparation.json'));
 if(prepared.approval!=='15A'||prepared.root!==ROOT||manifest.files.length!==442)throw Error('BAD_FOUR_PREPARATION');
 for(const entry of manifest.files){
  if(hash(entry.source)!==entry.baselineSha256)throw Error('OLD_205_DRIFT');
  if(hash(entry.target)!==entry.sha256)throw Error('FOUR_RUNTIME_DRIFT');
 }
 for(const entry of prepared.overrides)if(hash(entry.source)!==entry.sha256)throw Error('FOUR_TOOL_SOURCE_DRIFT');
 return true;
}
function refreshRuntime(){
 noController();const manifest=read(path.join(ROOT,'runtime-manifest.json')),prepared=read(path.join(ROOT,'preparation.json'));
 for(const entry of manifest.files)if(hash(entry.source)!==entry.baselineSha256||hash(entry.target)!==entry.sha256)throw Error('PRE_REFRESH_DRIFT');
 const overrides=[];
 for(const name of ['main.cjs','fixtures.cjs','session-guard.cjs']){
  const source=path.join(__dirname,name),target=path.join(ROOT,'runtime/resources/app',name),entry=manifest.files.find(item=>item.target===target);
  if(!entry)throw Error('OVERRIDE_NOT_FROZEN');fs.copyFileSync(source,target);entry.sha256=hash(source);overrides.push({source,target,sha256:entry.sha256,approval:'15A'});
 }
 write(path.join(ROOT,'preparation.json'),{...prepared,overrides});write(path.join(ROOT,'runtime-manifest.json'),manifest);assertPrepared();
}
function launchInputs(){
 const list=['fixtures.cjs','main.cjs','session-guard.cjs','start.cjs','preload.cjs','signaling-local.cjs','four.cjs'].map(name=>path.join(__dirname,name));
 for(const name of ['verify-four-1.3.cjs','verify-player-1.3.cjs','verify-desktop-1.3.cjs','verify-connection-path.cjs','verify-phase2.js'])list.push(path.join(MOD,'tests',name));
 const service=path.join(MOD,'services/signaling');
 for(const name of fs.readdirSync(path.join(service,'src')).filter(name=>name.endsWith('.js')).sort())list.push(path.join(service,'src',name));
 for(const name of ['package.json','package-lock.json'])list.push(path.join(service,name));
 for(const name of ['runtime-manifest.json','preparation.json','verification.json','regressions.json'])list.push(path.join(ROOT,name));
 return list;
}
function sealGate(){
 noController();assertPrepared();const verification=read(path.join(ROOT,'verification.json')),regressions=read(path.join(ROOT,'regressions.json'));
 if(verification.status!=='AUTO_PASS'||verification.cases.length!==4||verification.cases.some(row=>row.status!=='PASS'||!row.cleanup?.ok)||regressions.status!=='PASS')throw Error('FOUR_CHECKS_NOT_PASSED');
 write(path.join(ROOT,'acceptance-gate.json'),{status:'READY',approval:'15A',hashes:Object.fromEntries(launchInputs().map(file=>[file,hash(file)])),playerFeedback:'PENDING'});return true;
}
function assertLaunchApproved(){
 const gate=read(path.join(ROOT,'acceptance-gate.json'));if(gate.status!=='READY'||gate.approval!=='15A')throw Error('FOUR_GATE_NOT_READY');
 for(const file of launchInputs())if(gate.hashes[file]!==hash(file))throw Error('FOUR_GATE_INPUT_DRIFT');return true;
}
function receiptComplete(stats,mapping){
 if(!stats||!mapping||new Set(IDS.map(id=>mapping[id])).size!==4||mapping.host!=='host')return false;
 for(const id of IDS){
  const expected=id==='host'?IDS.slice(1).map(peer=>mapping[peer]):['host'],actual=Object.keys(stats[id]||{});
  if(actual.some(peer=>!expected.includes(peer)))return false;
  for(const peer of expected){const row=stats[id]?.[peer];if(!row||['sent','received','acknowledged'].some(key=>!Number.isInteger(row[key])||row[key]<1))return false;}
 }
 return true;
}
function topologyReady(states,mapping){
 return states.every((state,index)=>{
  const id=IDS[index],expected=id==='host'?IDS.slice(1).map(peer=>mapping[peer]):['host'],peers=state.p2p?.transport?.peers||[];
  return state.p2p?.signaling?.socketOpen&&state.p2p.signaling.status==='signaling-ready'&&peers.length===expected.length&&peers.every(peer=>expected.includes(peer.peerId)&&peer.channelOpen&&peer.sameMachine&&peer.connectionPath==='direct'&&peer.localCandidateType==='host'&&peer.remoteCandidateType==='host'&&peer.remoteHandshake?.gameVersion==='1.3');
 });
}
function assertIsolation(states,attempt){
 const identities=new Set(),profiles=new Set();
 for(let i=0;i<4;i++){
  const state=states[i],id=IDS[i],expected=config(i===0?'host':'guest',attempt,'manual',id),guard=state.guard;
  if(state.instance!==id||state.identity!==expected.identity||state.profile!==expected.profile||state.game?.version!=='1.3'||state.disk?.length!==0||guard?.audit.physicalMutation!==0||guard.errors.length||state.p2p.transport.iceServerCount!==0||state.p2p.signaling.iceServers.length)throw Error('FOUR_ISOLATION_FAILED');
  identities.add(state.identity);profiles.add(state.profile);
 }if(identities.size!==4||profiles.size!==4)throw Error('FOUR_IDENTITY_COLLISION');
}
const closeRoomQuery='('+async function(){
 const api=CattailP2PPhase2;if(!api.getStatus().signaling.roomCode)return false;api.openPage();
 const button=Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='Close room connection'&&!node.disabled);if(!button)throw Error('ROOM_CLOSE_BUTTON_MISSING');
 const prototype=WebSocket.prototype,rawClose=prototype.close;let closed=null;
 prototype.close=function(...args){const socket=this;closed=new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);socket.removeEventListener('close',done);resolve();};const timer=setTimeout(()=>{socket.removeEventListener('close',done);reject(Error('ROOM_SOCKET_CLOSE_TIMEOUT'));},12000);socket.addEventListener('close',done,{once:true});try{rawClose.apply(socket,args);if(socket.readyState===WebSocket.CLOSED)done();}catch(error){clearTimeout(timer);reject(error);}});};
 try{button.click();}finally{prototype.close=rawClose;}if(!closed)throw Error('ROOM_SOCKET_NOT_CLOSED');await closed;return true;
}.toString()+')()';
function probeQuery(offset){return '('+function(offset){
 const result={};for(const row of CattailP2PPhase2.getAuditEntries().slice(offset)){
  const kind=row.type?.replace('binary-probe-',''),d=row.details;if(!['sent','received','acknowledged'].includes(kind)||d?.byteLength!==4096||d.checksum!==522263)continue;
  const peer=String(d.peerId);result[peer]||={sent:0,received:0,acknowledged:0};result[peer][kind]++;
 }return result;
}.toString()+')('+JSON.stringify(offset)+')';}
function probeCursor(file){if(!inside(ROOT,file))throw Error('AUDIT_OUTSIDE_FOUR_ROOT');return {offset:fs.statSync(file).size,pending:Buffer.alloc(0),probes:{}};}
function readProbeDelta(file,cursor){
 if(!inside(ROOT,file))throw Error('AUDIT_OUTSIDE_FOUR_ROOT');const fd=fs.openSync(file,'r');
 try{
  const size=fs.fstatSync(fd).size;if(size<cursor.offset)throw Error('AUDIT_TRUNCATED');
  while(cursor.offset<size){
   const bytes=Buffer.alloc(Math.min(65536,size-cursor.offset)),count=fs.readSync(fd,bytes,0,bytes.length,cursor.offset);if(!count)throw Error('AUDIT_SHORT_READ');cursor.offset+=count;
   const joined=Buffer.concat([cursor.pending,bytes.subarray(0,count)]),end=joined.lastIndexOf(10);
   if(end<0){cursor.pending=joined;continue;}cursor.pending=joined.subarray(end+1);
   for(const line of joined.subarray(0,end).toString('utf8').split('\n')){
    if(!line.trim())continue;let row;try{row=JSON.parse(line);}catch(error){throw Error('AUDIT_JSON_INVALID');}
    const kind=row.type?.replace('binary-probe-',''),d=row.details;if(!['sent','received','acknowledged'].includes(kind)||d?.byteLength!==4096||d.checksum!==522263)continue;
    const peer=String(d.peerId);cursor.probes[peer]||={sent:0,received:0,acknowledged:0};cursor.probes[peer][kind]++;
   }
  }
 }finally{fs.closeSync(fd);}
 return Object.fromEntries(Object.entries(cursor.probes).map(([peer,value])=>[peer,{...value}]));
}
function safeState(state){
 return {instance:state.instance,generation:state.generation,visible:state.visible,gameVersion:state.game.version,diskProgressRows:state.disk.length,physicalMutations:state.guard.audit.physicalMutation,autosaves:state.guard.saveTimes.length,memoryCommits:state.guard.saveResults.filter(result=>result==='memory-committed').length,unhandledErrors:state.guard.errors.length,ticks:state.guard.ticks,frames:state.guard.frames,iceServers:state.p2p.transport.iceServerCount,peers:state.p2p.transport.peers.map(peer=>({peerId:peer.peerId,channelOpen:peer.channelOpen,path:peer.connectionPath,sameMachine:peer.sameMachine,localType:peer.localCandidateType,remoteType:peer.remoteCandidateType,gameVersion:peer.remoteHandshake?.gameVersion}))};
}
async function run(attempt='101',options={}){
 if(!/^\d{3}$/.test(attempt))throw Error('INVALID_ATTEMPT');
 noController();assertPrepared();if(!options.uiCheck)assertLaunchApproved();
 const session=await require('./start.cjs').start(SOURCE,attempt,{mode:'manual',uiCheck:!!options.uiCheck,instances:IDS});
 const output=path.join(session.dir,'four-session.json'),active=path.join(ROOT,'active-controller.json');
 write(active,{pid:process.pid,attempt});
 const report={approval:'15A',baseline:'205-on-008',attempt,mode:options.uiCheck?'automatic-four':'visible-four',status:'STARTING',playerFeedback:'PENDING',timeLimitMs:options.uiCheck?policy.automaticMs:null,epoch:0,connected:false,epochs:[],instances:{},resources:{},events:[]};
 const startedAt=Date.now(),deadline=options.uiCheck?startedAt+policy.automaticMs:Infinity,scene={},called=new Set();
 let stopRequested=false,bound='',waitingSince=startedAt,connectionSince=0,hookError=null,lastResources=0,cursors={};
 const stop=()=>{stopRequested=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 try{
  while(Date.now()<deadline&&!stopRequested){
   if(hookError)throw hookError;
   if(session.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed)){report.status='CLOSED_PENDING_PLAYER_FEEDBACK';break;}
   let states=await Promise.all(session.clients.map(client=>client.call('status')));
   if(!states.every(state=>state.guard?.ready&&state.p2p?.ready)){
    report.connected=false;if(waitingSince===null)waitingSince=Date.now();if(Date.now()-waitingSince>policy.startupMs)throw Error('FOUR_STARTUP_TIMEOUT');
   }else{
    waitingSince=null;assertIsolation(states,attempt);
    for(let i=0;i<4;i++)if(scene[IDS[i]]!==states[i].generation){
     await session.clients[i].call('evaluate',"(()=>{if(DEBUG.splash.isShown)DEBUG.splash.close();DEBUG.splash.updateMute(true);DEBUG.addResourcesFromArray([1024,1024]);DEBUG.store.visibilityUpdate();CattailP2PPhase2.openPage();return true;})()");scene[IDS[i]]=states[i].generation;
    }
    const tuple=states.map(state=>state.generation).join('/');
    if(tuple!==bound){
     report.connected=false;
     if(bound)await Promise.all(session.clients.map(client=>client.call('evaluate',closeRoomQuery)));
     const code=await session.clients[0].call('create');for(const guest of session.clients.slice(1))await guest.call('join',code);
     states=await Promise.all(session.clients.map(client=>client.call('status')));assertIsolation(states,attempt);
     const mapping=Object.fromEntries(IDS.map((id,i)=>[id,states[i].p2p.signaling.peerId]));
     if(mapping.host!=='host'||new Set(Object.values(mapping)).size!==4)throw Error('FOUR_PEER_MAPPING_FAILED');
     cursors=Object.fromEntries(session.clients.map(client=>[client.instance,probeCursor(path.join(session.dir,client.instance+'-audit.jsonl'))]));
     const offsets=Object.fromEntries(IDS.map(id=>[id,cursors[id].offset]));
     report.epoch++;report.epochs.push({epoch:report.epoch,generations:Object.fromEntries(IDS.map((id,i)=>[id,states[i].generation])),mapping,offsets,probes:{},probesComplete:false});
     report.events.push({type:'whole-room-bound',epoch:report.epoch});bound=tuple;connectionSince=Date.now();
    }
    const epoch=report.epochs.at(-1);
    for(let i=0;i<4;i++){
     const client=session.clients[i];report.instances[client.instance]=safeState(states[i]);
     epoch.probes[client.instance]=readProbeDelta(path.join(session.dir,client.instance+'-audit.jsonl'),cursors[client.instance]);
     const signalErrors=await client.call('evaluate',"CattailP2PPhase2.getAuditEntries().filter(row=>/^signaling-.*error$|^signaling-reconnect-exhausted$/.test(row.type)).length");
     if(signalErrors)throw Error('FOUR_SIGNALING_ERROR');
     if(!options.uiCheck&&!states[i].visible)throw Error('FOUR_WINDOW_NOT_VISIBLE');
    }
    epoch.probesComplete=receiptComplete(epoch.probes,epoch.mapping);report.connected=topologyReady(states,epoch.mapping);
    if(!report.connected&&Date.now()-connectionSince>policy.connectionMs)throw Error('FOUR_CONNECTION_TIMEOUT');
    if(Date.now()-lastResources>2000){
     for(const client of session.clients){
      const summary=await client.call('summary');if(!summary.pathsConfined||summary.officialMainLoaded||summary.counters.realSteamInitializations||summary.counters.realCloudCalls||summary.counters.externalCompleted)throw Error('FOUR_MAIN_ISOLATION_FAILED');
      const previous=report.resources[client.instance]||{};
      report.resources[client.instance]={peakMainRssBytes:Math.max(previous.peakMainRssBytes||0,summary.resources.mainRssBytes),latestProcesses:summary.resources.processes};
     }lastResources=Date.now();
    }
    if(report.connected){
     report.status='AWAITING_PLAYER';
     if(!called.has(report.epoch)){
      called.add(report.epoch);report.events.push({type:'star-connected',epoch:report.epoch,elapsedMs:Date.now()-connectionSince});
      console.log('FOUR_WINDOWS_READY '+attempt+' epoch='+report.epoch);
      if(options.onReady){try{Promise.resolve(options.onReady({session,report,stop})).catch(error=>{hookError=error;});}catch(error){hookError=error;}}
     }
    }
   }
   write(output,report);await pause(500);
  }
  if(hookError)throw hookError;
  if(stopRequested)report.status=options.uiCheck?'AUTOMATED_COMPLETE':'STOPPED_PENDING_PLAYER_FEEDBACK';
  else if(Date.now()>=deadline)throw Error('FOUR_AUTOMATIC_TIMEOUT');
 }catch(error){
  const closing=session.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed||!client.child.connected);
  if(closing&&/CLIENT_(CLOSED|EXITED|DISCONNECTED)|WINDOW_UNAVAILABLE/.test(error.message))report.status='CLOSED_PENDING_PLAYER_FEEDBACK';
  else{report.status='FAIL';report.error=String(error.message);}
 }finally{
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  report.cleanup=await session.stop();try{await require('./signaling-local.cjs').portFree();report.cleanup.port8787Released=true;}catch(error){report.cleanup.port8787Released=false;}
  if(!report.cleanup.ok||!report.cleanup.port8787Released){report.status='FAIL';report.error='FOUR_CLEANUP_FAILED';}
  write(output,report);fs.rmSync(active,{force:true});
 }
 return report;
}
module.exports={prepare,refreshRuntime,assertPrepared,launchInputs,sealGate,assertLaunchApproved,receiptComplete,topologyReady,assertIsolation,probeQuery,probeCursor,readProbeDelta,policy,run};
if(require.main===module){
 const op=process.argv[2],work=op==='--prepare'?Promise.resolve().then(prepare):op==='--refresh'?Promise.resolve().then(refreshRuntime):op==='--seal'?Promise.resolve().then(sealGate):op==='--run'?run(process.argv[3]||'101'):Promise.reject(Error('USE_PREPARE_REFRESH_SEAL_OR_RUN'));
 work.then(result=>{console.log(JSON.stringify(result?.status?{status:result.status,cleanup:result.cleanup}:result));if(result?.status==='FAIL')process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
