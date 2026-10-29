'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const PLAYER_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-player13-20261027');
if(process.env.CATTAIL_P2P_TOOL_ROOT&&path.resolve(process.env.CATTAIL_P2P_TOOL_ROOT)!==PLAYER_ROOT)throw Error('PLAYER_ROOT_REQUIRED');
process.env.CATTAIL_P2P_TOOL_ROOT=PLAYER_ROOT;
const {ROOT,LEGACY_ROOT,inside}=require('./fixtures.cjs');
const MOD=path.resolve(__dirname,'../..'),SOURCE=path.resolve(MOD,'../../../../..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assertLocal(file){if(!inside(ROOT,file))throw Error('OUTPUT_OUTSIDE_PLAYER_ROOT');}
function write(file,value){assertLocal(file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function prepare(){
 if(fs.existsSync(ROOT))throw Error('PLAYER_ROOT_EXISTS');
 const manifest=JSON.parse(fs.readFileSync(path.join(LEGACY_ROOT,'source-manifest.json'),'utf8'));
 for(const entry of manifest.copied)if(hash(entry.target)!==entry.sha256)throw Error('FROZEN_008_DRIFT');
 const editable=['tools/desktop-1.3/fixtures.cjs','tools/desktop-1.3/main.cjs','tools/desktop-1.3/start.cjs','README.md','tools/README.md'].map(p=>path.join(MOD,p)).concat([path.join(SOURCE,'Codex-md/progress_p2pmod.md'),path.join(SOURCE,'Codex-md/progress_ModLoader.md')]);
 fs.mkdirSync(ROOT,{recursive:true});
 for(const file of editable){const dest=path.join(ROOT,'before',path.relative(SOURCE,file));assertLocal(dest);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}
 write(path.join(ROOT,'baseline.json'),{authorized:'8A9A',root:ROOT,old:LEGACY_ROOT,editable});
 const copied=[];
 for(const entry of manifest.copied){
  const target=path.join(ROOT,path.relative(LEGACY_ROOT,entry.target));assertLocal(target);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(entry.target,target);copied.push({source:entry.target,target,sha256:entry.sha256});
 }
 for(const relative of ['runtime/resources/app/package.json','runtime/resources/app/node_modules/@playsaurus-inc/sdk/index.js','runtime/resources/app/game/mods/enabled.json']){
  const source=path.join(LEGACY_ROOT,relative),target=path.join(ROOT,relative);assertLocal(target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);copied.push({source,target,sha256:hash(source)});
 }
 write(path.join(ROOT,'frozen-inputs.json'),{baseline:'008',copied});
 return refreshRuntime();
}
function refreshRuntime(){
 const baseline=JSON.parse(fs.readFileSync(path.join(ROOT,'baseline.json'),'utf8'));
 if(baseline.authorized!=='8A9A')throw Error('APPROVED_BACKUP_REQUIRED');
 const prior=fs.existsSync(path.join(ROOT,'preparation.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'preparation.json'),'utf8')):null;
 if(fs.existsSync(path.join(ROOT,'active-controller.json'))){
  const active=JSON.parse(fs.readFileSync(path.join(ROOT,'active-controller.json'),'utf8'));
  try{process.kill(active.pid,0);throw Error('PLAYER_CONTROLLER_ACTIVE');}catch(error){if(error.message==='PLAYER_CONTROLLER_ACTIVE')throw error;if(error.code!=='ESRCH')throw error;}
 }
 const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,'frozen-inputs.json'),'utf8'));
 for(const entry of frozen.copied){
  if(hash(entry.source)!==entry.sha256)throw Error('FROZEN_008_DRIFT');
  const expected=prior?.overrides?.find(item=>item.target===entry.target)?.sha256||entry.sha256;
  if(hash(entry.target)!==expected)throw Error('PLAYER_COPY_DRIFT');
 }
 if(prior)write(path.join(ROOT,'preparations',Date.now()+'-prior.json'),prior);
 const overrides=(prior?.overrides||[]).filter(entry=>!['main.cjs','fixtures.cjs'].includes(path.basename(entry.target)));
 for(const name of ['main.cjs','fixtures.cjs']){
  const source=path.join(__dirname,name),target=path.join(ROOT,'runtime/resources/app',name);
  fs.copyFileSync(source,target);overrides.push({source,target,sha256:hash(source)});
 }
 const record={authorized:'8A9A',baseline:'008',root:ROOT,frozenInputs:frozen.copied.length,overrides};
 write(path.join(ROOT,'preparation.json'),record);return record;
}
function assertPrepared(){
 const prepared=JSON.parse(fs.readFileSync(path.join(ROOT,'preparation.json'),'utf8'));
 if(prepared.root!==ROOT||prepared.baseline!=='008')throw Error('UNAPPROVED_PLAYER_BASELINE');
 const frozen=JSON.parse(fs.readFileSync(path.join(ROOT,'frozen-inputs.json'),'utf8'));
 for(const entry of frozen.copied){
  if(hash(entry.source)!==entry.sha256)throw Error('FROZEN_008_DRIFT');
  const expected=prepared.overrides.find(item=>item.target===entry.target)?.sha256||entry.sha256;
  if(hash(entry.target)!==expected)throw Error('PLAYER_COPY_DRIFT');
 }
 return true;
}
function launchInputs(){return ['fixtures.cjs','main.cjs','start.cjs','player.cjs','session-guard.cjs'].map(name=>path.join(__dirname,name)).concat([path.join(MOD,'tests/verify-player-1.3.cjs'),path.join(MOD,'tests/verify-connection-path.cjs'),path.join(MOD,'scripts/transport.js'),path.join(ROOT,'preparation.json')]);}
function assertLaunchApproved(){
 const file=path.join(ROOT,'acceptance-gate.json');
 if(!fs.existsSync(file))throw Error('PLAYER_GATE_NOT_READY');
 const gate=JSON.parse(fs.readFileSync(file,'utf8'));
 if(gate.status!=='READY'||!gate.checksPassed)throw Error('PLAYER_GATE_NOT_READY');
 for(const input of launchInputs())if(gate.hashes?.[input]!==hash(input))throw Error('PLAYER_GATE_INPUT_DRIFT');
 return true;
}
function summarize(status,probes){
 const guard=status?.guard,transport=status?.p2p?.transport,signaling=status?.p2p?.signaling;
 return {generation:status?.generation,ready:!!status?.p2p?.ready,visible:!!status?.visible,gameVersion:status?.game?.version,
  diskProgressRows:status?.disk?.length,physicalProgressMutations:guard?.audit.physicalMutation,autosaves:guard?.saveTimes.length,
  memoryCommits:guard?.saveResults.filter(value=>value==='memory-committed').length,unhandledErrors:guard?.errors.length,
  ticks:guard?.ticks,frames:guard?.frames,iceServers:transport?.iceServerCount,signaling:signaling?.status,
  peers:(transport?.peers||[]).map(peer=>({role:peer.role,channelOpen:peer.channelOpen,sameMachine:peer.sameMachine,path:peer.connectionPath,localType:peer.localCandidateType,remoteType:peer.remoteCandidateType,gameVersion:peer.remoteHandshake?.gameVersion,lastProbe:peer.lastProbe?{byteLength:peer.lastProbe.byteLength,checksum:peer.lastProbe.checksum}:null})),probes};
}
const closePreviousRoomQuery='('+async function(){
 const api=window.CattailP2PPhase2;
 if(!api.getStatus().signaling.roomCode)return false;
 api.openPage();
 const button=Array.from(document.querySelectorAll('button')).find(node=>node.textContent==='Close room connection'&&!node.disabled);
 if(!button)throw Error('PREVIOUS_ROOM_CLOSE_BUTTON_MISSING');
 const prototype=WebSocket.prototype,nativeClose=prototype.close;
 let closed=null;
 prototype.close=function(...args){
  const socket=this;
  closed=new Promise((resolve,reject)=>{
   const done=()=>{clearTimeout(timer);socket.removeEventListener('close',done);resolve();};
   const timer=setTimeout(()=>{socket.removeEventListener('close',done);reject(Error('PREVIOUS_ROOM_CLOSE_TIMEOUT'));},12000);
   socket.addEventListener('close',done,{once:true});
   try{nativeClose.apply(socket,args);if(socket.readyState===WebSocket.CLOSED)done();}catch(error){clearTimeout(timer);reject(error);}
  });
 };
 try{button.click();}finally{prototype.close=nativeClose;}
 if(!closed)throw Error('PREVIOUS_ROOM_SOCKET_NOT_CLOSED');
 await closed;return true;
}.toString()+')()';
async function run(attempt='201',options={}){
 if(!/^\d{3}$/.test(attempt))throw Error('INVALID_ATTEMPT');
 const durationMs=options.durationMs??(options.uiCheck?15*60*1000:null);
 if(durationMs!==null&&(!Number.isFinite(durationMs)||durationMs<=0))throw Error('INVALID_PLAYER_DURATION');
 if(!options.uiCheck)assertLaunchApproved();
 assertPrepared();
 const {start}=require('./start.cjs'),session=await start(SOURCE,attempt,{mode:'manual',uiCheck:!!options.uiCheck});
 const [host,guest]=session.clients;
 const report={baseline:'008',mode:options.uiCheck?'manual-lifecycle-check':'visible-player',status:'STARTING',timeLimitMs:durationMs,playerFeedback:'PENDING',events:[],roles:{},generations:{host:{},guest:{}}};
 const output=path.join(session.dir,'player-session.json');
 write(path.join(ROOT,'active-controller.json'),{pid:process.pid,attempt});
 write(path.join(session.dir,'controller.json'),{pid:process.pid,attempt});
 let stopRequested=false,boundPair='',sceneGenerations={host:-1,guest:-1},connectedAt=0,visibleSnapshotsTaken=false;
 const startedAt=Date.now(),deadline=durationMs===null?Infinity:startedAt+durationMs;
 const save=()=>write(output,report);
 const endSignal=()=>{stopRequested=true;};
 process.on('SIGTERM',endSignal);process.on('SIGINT',endSignal);
 const probeQuery="(()=>{const rows=CattailP2PPhase2.getAuditEntries();return Object.fromEntries(['sent','received','acknowledged'].map(kind=>[kind,rows.filter(row=>row.type==='binary-probe-'+kind&&row.details.byteLength===4096&&row.details.checksum===522263).length]));})()";
 try{
  while(Date.now()<deadline&&!stopRequested){
   if(session.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed)){
    report.status='CLOSED_PENDING_PLAYER_FEEDBACK';break;
   }
   let states;
   try{states=await Promise.all(session.clients.map(client=>client.call('status')));}
   catch(error){if(session.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed)){report.status='CLOSED_PENDING_PLAYER_FEEDBACK';break;}throw error;}
   if(states.every(status=>status.p2p?.ready&&status.guard?.ready)){
    for(let i=0;i<2;i++){
     const client=session.clients[i],state=states[i];
     if(sceneGenerations[client.role]!==state.generation){
      await client.call('evaluate',"(()=>{if(DEBUG.splash.isShown)DEBUG.splash.close();DEBUG.splash.updateMute(true);DEBUG.addResourcesFromArray([1024,1024]);DEBUG.store.visibilityUpdate();const n=Object.keys(DEBUG.store.html.items).find(key=>!DEBUG.store.html.items[key].classList.contains('hidden'));if(n)DEBUG.store.centerItem(n);CattailP2PPhase2.openPage();return true;})()");
      sceneGenerations[client.role]=state.generation;
     }
    }
    const pair=states.map(state=>state.generation).join('/');
    if(pair!==boundPair){
     if(boundPair){
      for(const client of session.clients)await client.call('evaluate',closePreviousRoomQuery);
      report.events.push({type:'previous-room-sockets-closed',generationPair:pair});
     }
     const code=await host.call('create');await guest.call('join',code);
     boundPair=pair;connectedAt=Date.now();
     report.events.push({type:'room-created-and-joined',generationPair:pair});
     if(options.autoProbe){await pause(800);await host.call('probe');await guest.call('probe');}
    }
    for(let i=0;i<2;i++){
     const client=session.clients[i],state=states[i],probes=await client.call('evaluate',probeQuery);
     const value=summarize(state,probes);
     value.signalingErrors=await client.call('evaluate',"CattailP2PPhase2.getAuditEntries().filter(row=>/^signaling-.*error$|^signaling-reconnect-exhausted$/.test(row.type)).length");
     if(!options.uiCheck&&!value.visible)throw Error('PLAYER_WINDOW_NOT_VISIBLE');
     report.roles[client.role]=value;report.generations[client.role][String(state.generation)]=value;
     if(value.physicalProgressMutations!==0||value.diskProgressRows!==0||value.unhandledErrors!==0||value.iceServers!==0||value.signalingErrors!==0)throw Error('PLAYER_ISOLATION_CHECK_FAILED');
    }
    if(states.every(state=>state.p2p.signaling.status==='signaling-ready'&&state.p2p.signaling.socketOpen&&state.p2p.transport.peers.some(peer=>peer.channelOpen&&peer.sameMachine&&peer.connectionPath==='direct'&&peer.remoteHandshake?.gameVersion==='1.3'))){
     const newlyConnected=report.status!=='AWAITING_PLAYER'||report.lastConnectedPair!==pair;
     if(newlyConnected)console.log('PLAYER_WINDOWS_READY '+attempt);
     report.lastConnectedPair=pair;
     report.status='AWAITING_PLAYER';
     if(!visibleSnapshotsTaken){
      await pause(300);
      for(const client of session.clients)await client.call('screenshot','player-ready');
      visibleSnapshotsTaken=true;
     }
     if(newlyConnected&&options.onConnected)options.onConnected({clients:session.clients,report});
    }else if(Date.now()-connectedAt>15000)throw Error('PLAYER_CONNECTION_TIMEOUT');
   }else if(!boundPair&&Date.now()-startedAt>60000)throw Error('PLAYER_STARTUP_TIMEOUT');
   save();await pause(500);
  }
  if(report.status==='AWAITING_PLAYER'||report.status==='STARTING'){
   report.status=options.uiCheck?'LIFECYCLE_CHECK_FINISHED':'TIMED_OUT_PENDING_PLAYER_FEEDBACK';
  }
  if(stopRequested)report.status='STOPPED_PENDING_PLAYER_FEEDBACK';
 }catch(error){
  if(session.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed)&&/CLIENT_CLOSED|CLIENT_EXITED|WINDOW_UNAVAILABLE/.test(error.message))report.status='CLOSED_PENDING_PLAYER_FEEDBACK';
  else{report.status='FAIL';report.error=String(error.message);throw error;}
 }finally{
  process.removeListener('SIGTERM',endSignal);process.removeListener('SIGINT',endSignal);
  report.cleanup=await session.stop();
  try{await require('./signaling-local.cjs').portFree();report.cleanup.port8787Released=true;}catch(error){report.cleanup.port8787Released=false;}
  if(!report.cleanup.ok||!report.cleanup.allExited||report.cleanup.forced||!report.cleanup.port8787Released){report.status='FAIL';report.error='CLEANUP_INCOMPLETE';}
  save();
  fs.rmSync(path.join(ROOT,'active-controller.json'),{force:true});
 }
 return report;
}
module.exports={prepare,refreshRuntime,assertPrepared,assertLaunchApproved,launchInputs,summarize,run};
if(require.main===module){
 const operation=process.argv[2];
 const work=operation==='--prepare'?Promise.resolve().then(prepare):operation==='--run'?run(process.argv[3]||'201'):Promise.reject(Error('USE_PREPARE_OR_RUN'));
 work.then(result=>{console.log(JSON.stringify({status:result.status||'PREPARED',attempt:process.argv[3],cleanup:result.cleanup}));if(result.status==='FAIL')process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
