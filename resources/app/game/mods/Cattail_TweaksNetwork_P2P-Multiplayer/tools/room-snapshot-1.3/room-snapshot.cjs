'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const {ROOT,OLD_ROOT,POLICY,inside,config}=require('./fixtures.cjs');
const MOD=path.resolve(__dirname,'../..'),SOURCE=path.resolve(MOD,'../../../../..');
const priorController=require('../snapshot-1.3/snapshot.cjs');
const serviceModule=require('./signaling-local.cjs');
const FILES=['fixtures.cjs','main.cjs','preload.cjs','session-guard.cjs','room-snapshot.cjs','signaling-local.cjs','room-transport.js','room-wire.js'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function write(file,value){if(!inside(ROOT,file))throw Error('OUTPUT_OUTSIDE_ROOM_ROOT');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function assertProtection(){
 const baseline=read(path.join(ROOT,'baseline.json'));
 if(baseline.approval!=='20A'||baseline.root!==ROOT||baseline.scope.length!==13)throw Error('APPROVED_BASELINE_REQUIRED');
 for(const row of baseline.protected)if(hash(path.join(SOURCE,row.path))!==row.sha256)throw Error('PROTECTED_SOURCE_DRIFT');
 for(const row of [...baseline.priorFiles,...baseline.dependencies])if(hash(row.path||row.file)!==row.sha256)throw Error('PRIOR_OR_DEPENDENCY_DRIFT');
 priorController.assertGate();const accepted=read(path.join(OLD_ROOT,'reports/101/player-acceptance.json'));
 if(accepted.status!=='PASS')throw Error('PRIOR_PLAYER_REQUIRED');for(const [file,want]of Object.entries(accepted.originalEvidence.hashes))if(hash(file)!==want)throw Error('PRIOR_PLAYER_DRIFT');return true;
}
function noActive(){if(fs.existsSync(path.join(ROOT,'active-controller.json')))throw Error('ROOM_CONTROLLER_ACTIVE');}
function prepare(){
 noActive();assertProtection();if(fs.existsSync(path.join(ROOT,'runtime')))throw Error('RUNTIME_EXISTS');
 const previous=read(path.join(OLD_ROOT,'runtime-manifest.json'));if(previous.files.length!==444)throw Error('PRIOR_444_REQUIRED');const files=[];
 for(const row of previous.files){
  if(hash(row.target)!==row.sha256)throw Error('PRIOR_RUNTIME_DRIFT');const target=path.join(ROOT,path.relative(OLD_ROOT,row.target));if(!inside(path.join(ROOT,'runtime'),target))throw Error('BAD_BASELINE_PATH');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(row.target,target);files.push({source:row.target,target,baselineSha256:row.sha256,sha256:row.sha256});
 }
 for(const [name,relative]of [...['main.cjs','fixtures.cjs','preload.cjs','session-guard.cjs','room-wire.js'].map(name=>[name,'resources/app/'+name]),['room-transport.js','resources/app/game/mods/Cattail_TweaksNetwork_P2P-Multiplayer/scripts/transport.js']]){
  const source=path.join(__dirname,name),target=path.join(ROOT,'runtime',relative),old=files.find(row=>row.target===target);fs.copyFileSync(source,target);
  if(old){old.overrideSource=source;old.sha256=hash(source);}else files.push({source,target,sha256:hash(source),added:true});
 }
 write(path.join(ROOT,'runtime-manifest.json'),{approval:'20A',files});write(path.join(ROOT,'preparation.json'),{approval:'20A',root:ROOT,baseline:'18A-snapshot101-player-PASS',files:445});assertPrepared();return true;
}
function assertPrepared(){
 const manifest=read(path.join(ROOT,'runtime-manifest.json'));if(manifest.approval!=='20A'||manifest.files.length!==445)throw Error('MANIFEST_445_REQUIRED');
 for(const row of manifest.files){if(hash(row.target)!==row.sha256||row.baselineSha256&&hash(row.source)!==row.baselineSha256||row.overrideSource&&hash(row.overrideSource)!==row.sha256||row.added&&hash(row.source)!==row.sha256)throw Error('RUNTIME_DRIFT');}return true;
}
function refresh(){
 noActive();assertProtection();const manifest=read(path.join(ROOT,'runtime-manifest.json'));
 for(const row of manifest.files)if(hash(row.target)!==row.sha256||row.baselineSha256&&hash(row.source)!==row.baselineSha256)throw Error('PRE_REFRESH_DRIFT');
 for(const row of manifest.files)if(row.overrideSource||row.added){const source=row.overrideSource||row.source;fs.copyFileSync(source,row.target);row.sha256=hash(source);}
 write(path.join(ROOT,'runtime-manifest.json'),manifest);assertPrepared();
}
function inputs(){return [...FILES.map(name=>path.join(__dirname,name)),path.join(MOD,'tests/verify-room-snapshot-1.3.cjs'),...['baseline.json','runtime-manifest.json','preparation.json','verification.json'].map(name=>path.join(ROOT,name))];}
function seal(){
 noActive();assertProtection();assertPrepared();const verify=read(path.join(ROOT,'verification.json'));
 if(verify.approval!=='20A'||verify.status!=='AUTO_PASS'||verify.cases.length!==8||verify.cases.some(row=>row.status!=='PASS'||!row.cleanup.ok))throw Error('EIGHT_LIVE_CASES_REQUIRED');
 write(path.join(ROOT,'acceptance-gate.json'),{approval:'20A',status:'READY',playerFeedback:'PENDING',hashes:Object.fromEntries(inputs().map(file=>[file,hash(file)]))});
}
function assertGate(){const gate=read(path.join(ROOT,'acceptance-gate.json'));if(gate.approval!=='20A'||gate.status!=='READY')throw Error('GATE_NOT_READY');for(const file of inputs())if(hash(file)!==gate.hashes[file])throw Error('GATE_DRIFT');assertProtection();assertPrepared();return true;}
function cleanStatus(value){
 return {generation:value.generation,identity:value.identity,profile:value.profile,visible:value.visible,world:value.world,wire:value.wire,guard:value.guard,diskRows:value.diskRows,signalingErrors:value.signalingErrors,p2p:value.p2p?{signaling:{status:value.p2p.signaling.status,socketOpen:value.p2p.signaling.socketOpen,iceServerCount:value.p2p.signaling.iceServers.length,errorPresent:!!value.p2p.signaling.error},transport:value.p2p.transport}:null};
}
function assertSafe(value,role,attempt,mode,runId){
 const cfg=config(role,attempt,mode,runId);
 if(value.identity!==cfg.identity||value.profile!==cfg.profile||value.generation!==1||!value.guard?.ready||value.guard.errors.length||value.diskRows!==0||value.guard.audit.physicalMutation!==0||value.world?.fatal||value.wire?.lastError||value.signalingErrors||value.guard.pcCreated!==1||value.p2p?.transport.iceServerCount!==0||value.p2p?.signaling.iceServers.length!==0)throw Error('ROOM_ISOLATION_FAILURE');return true;
}
async function start(attempt='001',mode='automated',options={}){
 const runId=crypto.randomBytes(16).toString('hex');config('host',attempt,mode,runId);config('guest',attempt,mode,runId);noActive();assertProtection();assertPrepared();if(mode==='manual')assertGate();
 const backend=options.service||serviceModule;await backend.portFree();const dir=path.join(ROOT,'reports',attempt);if(fs.existsSync(dir))throw Error('ATTEMPT_EXISTS');fs.mkdirSync(dir,{recursive:true});
 write(path.join(ROOT,'active-controller.json'),{attempt,pid:process.pid,mode});
 const clients=[];let service=null,stopping=null,timeout=null,failure='',monitor=null,groupReady=false;
 const ctx={attempt,mode,runId,dir,clients,get failure(){return failure;},get service(){return service;},
  async states(){const values=await Promise.all(clients.map(client=>client.call('status')));return Object.fromEntries(values.map((value,index)=>[clients[index].role,value]));},
  async wait(predicate,limit=POLICY.startupMs){const end=Date.now()+limit;while(Date.now()<end){if(failure)throw Error(failure);if(clients.some(client=>client.exited||client.lifecycle.fatal||client.lifecycle.reloading))throw Error('GROUP_CLOSED');const states=await ctx.states();if(predicate(states))return states;await pause(100);}throw Error('WAIT_TIMEOUT');},
  async negotiate(){
   await ctx.wait(states=>clients.length===2&&Object.values(states).every(state=>state.guard?.ready&&state.world?.ready&&state.p2p?.ready));
   const code=await clients[0].call('create');await clients[1].call('join',code);
   const states=await ctx.wait(states=>Object.values(states).every(state=>state.wire?.open&&state.wire.path.sameMachine&&state.p2p.signaling.socketOpen&&state.p2p.signaling.status==='signaling-ready'&&state.p2p.transport.peers.length===1&&state.p2p.transport.peers[0].snapshotChannelOpen&&state.p2p.transport.peers[0].handshakeAck),POLICY.connectionMs);
   for(const role of ['host','guest'])assertSafe(states[role],role,attempt,mode,runId);groupReady=true;return states;
  },
  async stop(){
   if(stopping)return stopping;
   stopping=(async()=>{
    clearTimeout(timeout);clearInterval(monitor);
    await Promise.all(clients.filter(client=>!client.exited&&!client.lifecycle.closing).map(client=>client.call('shutdown').catch(()=>{})));
    const end=Date.now()+POLICY.shutdownMs;while(clients.some(client=>!client.exited)&&Date.now()<end)await pause(100);
    let serviceStopped=!service,serviceError=false,timer;
    if(service)try{await Promise.race([service.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SERVICE_STOP_TIMEOUT')),POLICY.shutdownMs);})]);serviceStopped=true;}catch(error){serviceError=true;}finally{clearTimeout(timer);}
    let port8787Released=false;try{await backend.portFree();port8787Released=true;}catch(error){}
    const cleanup={allExited:clients.every(client=>client.exited),forced:0,residual:clients.filter(client=>!client.exited).map(client=>({role:client.role,pid:client.child.pid})),processErrors:fs.readdirSync(dir).filter(name=>name.endsWith('main-failure.json')),exitCodes:clients.map(client=>({role:client.role,code:client.lifecycle.exitCode,signal:client.lifecycle.signal})),serviceStopped,serviceError,port8787Released,outboundRequests:service?.outbound||0,controllerFailure:failure||null};
    cleanup.ok=cleanup.allExited&&!cleanup.residual.length&&!cleanup.processErrors.length&&cleanup.exitCodes.length===2&&cleanup.exitCodes.every(row=>row.code===0&&row.signal===null)&&serviceStopped&&!serviceError&&port8787Released&&!cleanup.outboundRequests&&!failure;
    cleanup.rendererConnectionsReleased=cleanup.allExited;write(path.join(dir,'cleanup.json'),cleanup);if(cleanup.allExited&&serviceStopped)fs.unlinkSync(path.join(ROOT,'active-controller.json'));return cleanup;
   })();return stopping;
  }
 };
 if(mode==='automated')timeout=setTimeout(()=>{failure='AUTOMATIC_TIMEOUT';ctx.stop().catch(()=>{});},POLICY.automaticMs);
 try{
  for(const key of Object.keys(process.env))if(/CLOUDFLARE|CF_API|^CATTAIL_P2P_/i.test(key))delete process.env[key];
  const temp=path.join(ROOT,'temp',attempt);fs.mkdirSync(temp,{recursive:true});Object.assign(process.env,{TEMP:temp,TMP:temp,XDG_CACHE_HOME:path.join(ROOT,'cache',attempt),MINIFLARE_CACHE_DIR:path.join(ROOT,'cache',attempt,'miniflare'),CLOUDFLARE_CF_FETCH_ENABLED:'false'});
  service=await backend.start(SOURCE,attempt);
  for(const role of ['host','guest']){
   const cfg=config(role,attempt,mode,runId),env={...process.env};for(const key of Object.keys(env))if(/CLOUDFLARE|CF_API|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|^CATTAIL_P2P_/i.test(key))delete env[key];
   for(const name of ['roaming','local','temp'])fs.mkdirSync(path.join(cfg.profile,name),{recursive:true});
   Object.assign(env,{APPDATA:path.join(cfg.profile,'roaming'),LOCALAPPDATA:path.join(cfg.profile,'local'),TEMP:path.join(cfg.profile,'temp'),TMP:path.join(cfg.profile,'temp'),CATTAIL_P2P_TOOL_ROOT:ROOT,CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:role,CATTAIL_P2P_SESSION:cfg.sessionId,CATTAIL_P2P_TEST_ROOT:ROOT,CATTAIL_P2P_ROOM_RUN_ID:runId,CATTAIL_P2P_AUDIT_PATH:path.join(dir,role+'-audit.jsonl')});
   const child=(options.spawn||spawn)(path.join(ROOT,'runtime/sixtyfour.exe'),['--p2p-role='+role,'--attempt='+attempt,'--p2p-mode='+mode],{cwd:path.join(ROOT,'runtime'),env,windowsHide:mode!=='manual',stdio:['ignore','pipe','pipe','ipc']});
   const stream=fs.createWriteStream(path.join(dir,role+'-process.log'));child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.on('exit',()=>stream.end());clients.push(priorController.clientFor(child,role));
  }
  write(path.join(dir,'owned-processes.json'),clients.map(client=>({role:client.role,pid:client.child.pid})));
  // This monitor also closes the sibling after a native Quit, reload or parent IPC loss.
  let checking=false;monitor=setInterval(async()=>{
   if(checking||stopping)return;checking=true;
   try{
    if(clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.reloading)){ctx.stop().catch(()=>{});return;}
    if(groupReady){const states=await ctx.states();if(Object.values(states).some(state=>state.wire?.terminal))ctx.stop().catch(()=>{});}
   }catch(error){if(!stopping){if(!clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.reloading||!client.child.connected))failure='MONITOR_FAILED';ctx.stop().catch(()=>{});}}finally{checking=false;}
  },250);
  return ctx;
 }catch(error){await ctx.stop();throw error;}
}
async function manual(attempt='101'){
 const ctx=await start(attempt,'manual');let states=null,error=null,cleanup;
 try{
  states=await ctx.negotiate();
  while(!ctx.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.reloading)){
   if(ctx.failure)throw Error(ctx.failure);states=await ctx.states();
   for(const role of ['host','guest'])assertSafe(states[role],role,attempt,'manual',ctx.runId);
   if(Object.values(states).some(state=>state.wire.terminal))break;
   write(path.join(ctx.dir,'room-snapshot-session.json'),{approval:'20A',attempt,status:'AWAITING_PLAYER',playerFeedback:'PENDING',timeLimitMs:null,instances:Object.fromEntries(Object.entries(states).map(([role,state])=>[role,cleanStatus(state)]))});await pause(500);
  }
 }catch(reason){if(!ctx.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.reloading))error=reason.message;}
 finally{cleanup=await ctx.stop();write(path.join(ctx.dir,'room-snapshot-session.json'),{approval:'20A',attempt,status:error||!cleanup.ok?'INCOMPLETE':'CLOSED_PENDING_PLAYER_FEEDBACK',playerFeedback:'PENDING',timeLimitMs:null,error,instances:states?Object.fromEntries(Object.entries(states).map(([role,state])=>[role,cleanStatus(state)])):null,cleanup});}
}
module.exports={ROOT,OLD_ROOT,MOD,SOURCE,POLICY,hash,read,write,pause,assertProtection,prepare,assertPrepared,refresh,inputs,seal,assertGate,cleanStatus,assertSafe,start,manual};
if(require.main===module){const op=process.argv[2];Promise.resolve().then(()=>op==='--prepare'?prepare():op==='--refresh'?refresh():op==='--seal'?seal():op==='--run'?manual(process.argv[3]||'101'):Promise.reject(Error('USE_PREPARE_REFRESH_SEAL_OR_RUN'))).catch(error=>{console.error(error.message);process.exitCode=1;});}
