'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const {ROOT,OLD_ROOT,POLICY,inside,config}=require('./fixtures.cjs');
const MOD=path.resolve(__dirname,'../..'),SOURCE=path.resolve(MOD,'../../../../..');
const FILES=['fixtures.cjs','main.cjs','preload.cjs','session-guard.cjs','snapshot.cjs','snapshot-world.js','snapshot-wire.js'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function write(file,value){if(!inside(ROOT,file))throw Error('OUTPUT_OUTSIDE_SNAPSHOT_ROOT');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function prior(){
 const gate=read(path.join(OLD_ROOT,'acceptance-gate.json'));
 for(const [file,expected]of Object.entries(gate.hashes))if(hash(file)!==expected)throw Error('PRIOR_GATE_DRIFT');
 const accepted=read(path.join(OLD_ROOT,'reports/101/player-acceptance.json'));
 if(accepted.status!=='PASS'||hash(accepted.rawReport)!==accepted.rawReportSha256||hash(accepted.rawCleanup)!==accepted.rawCleanupSha256)throw Error('PRIOR_ACCEPTANCE_DRIFT');
 const manifest=read(path.join(OLD_ROOT,'runtime-manifest.json'));
 if(manifest.files.length!==442)throw Error('PRIOR_MANIFEST_SIZE');
 for(const entry of manifest.files)if(hash(entry.target)!==entry.sha256)throw Error('PRIOR_RUNTIME_DRIFT');return manifest;
}
function noActive(){if(fs.existsSync(path.join(ROOT,'active-controller.json')))throw Error('SNAPSHOT_CONTROLLER_ACTIVE');}
function prepare(){
 noActive();if(fs.existsSync(path.join(ROOT,'runtime')))throw Error('SNAPSHOT_RUNTIME_EXISTS');
 const baseline=read(path.join(ROOT,'baseline.json'));if(baseline.approval!=='18A'||baseline.root!==ROOT||baseline.scope.length!==12)throw Error('APPROVED_BASELINE_REQUIRED');
 const old=prior(),files=[];
 for(const entry of old.files){const target=path.join(ROOT,path.relative(OLD_ROOT,entry.target));if(!inside(path.join(ROOT,'runtime'),target))throw Error('BAD_BASELINE_ENTRY');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(entry.target,target);files.push({source:entry.target,target,baselineSha256:entry.sha256,sha256:entry.sha256});}
 for(const name of ['main.cjs','fixtures.cjs','preload.cjs','session-guard.cjs','snapshot-world.js','snapshot-wire.js']){
  const source=path.join(__dirname,name),target=path.join(ROOT,'runtime/resources/app',name),existing=files.find(entry=>entry.target===target);
  fs.copyFileSync(source,target);if(existing){existing.overrideSource=source;existing.sha256=hash(source);}else files.push({source,target,sha256:hash(source),added:true});
 }
 write(path.join(ROOT,'runtime-manifest.json'),{approval:'18A',files});write(path.join(ROOT,'preparation.json'),{approval:'18A',root:ROOT,baseline:'101-four-on-205',files:444});assertPrepared();return true;
}
function assertPrepared(){
 const manifest=read(path.join(ROOT,'runtime-manifest.json'));
 if(manifest.approval!=='18A'||manifest.files.length!==444)throw Error('SNAPSHOT_MANIFEST_INVALID');
 for(const entry of manifest.files){if(hash(entry.target)!==entry.sha256)throw Error('SNAPSHOT_RUNTIME_DRIFT');if(entry.baselineSha256&&hash(entry.source)!==entry.baselineSha256)throw Error('PRIOR_RUNTIME_DRIFT');if(entry.overrideSource&&hash(entry.overrideSource)!==entry.sha256||entry.added&&hash(entry.source)!==entry.sha256)throw Error('SNAPSHOT_SOURCE_DRIFT');}
 return true;
}
function refresh(){
 noActive();const manifest=read(path.join(ROOT,'runtime-manifest.json'));
 for(const entry of manifest.files){if(hash(entry.target)!==entry.sha256||entry.baselineSha256&&hash(entry.source)!==entry.baselineSha256)throw Error('PRE_REFRESH_DRIFT');}
 for(const entry of manifest.files)if(entry.overrideSource||entry.added){const source=entry.overrideSource||entry.source;fs.copyFileSync(source,entry.target);entry.sha256=hash(source);}
 write(path.join(ROOT,'runtime-manifest.json'),manifest);assertPrepared();
}
function inputs(){return [...FILES.map(file=>path.join(__dirname,file)),path.join(MOD,'tests/verify-snapshot-1.3.cjs'),...['runtime-manifest.json','preparation.json','verification.json'].map(file=>path.join(ROOT,file))];}
function assertProtection(){const baseline=read(path.join(ROOT,'baseline.json'));for(const entry of baseline.protected)if(hash(path.join(SOURCE,entry.path))!==entry.sha256)throw Error('PROTECTED_INPUT_DRIFT');return true;}
function seal(){
 noActive();assertPrepared();prior();assertProtection();const verification=read(path.join(ROOT,'verification.json'));
 if(verification.status!=='AUTO_PASS'||verification.cases.length!==7||verification.cases.some(row=>row.status!=='PASS'||!row.cleanup.ok))throw Error('CHECKS_REQUIRED');
 write(path.join(ROOT,'acceptance-gate.json'),{status:'READY',approval:'18A',hashes:Object.fromEntries(inputs().map(file=>[file,hash(file)])),playerFeedback:'PENDING'});
}
function assertGate(){const gate=read(path.join(ROOT,'acceptance-gate.json'));if(gate.status!=='READY'||gate.approval!=='18A')throw Error('GATE_NOT_READY');for(const file of inputs())if(hash(file)!==gate.hashes[file])throw Error('GATE_INPUT_DRIFT');assertPrepared();prior();assertProtection();return true;}
function clientFor(child,role){
 let seq=0,exited=false;const pending=new Map(),lifecycle={closing:false,closed:false,reloading:false,exitCode:null,signal:null};
 function rejectAll(){for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('CLIENT_CLOSED'));}pending.clear();}
 child.on('message',message=>{if(['closing','closed','reloading'].includes(message.event))lifecycle[message.event]=true;if(message.fatal){lifecycle.fatal=message.fatal;rejectAll();}const waiter=pending.get(message.id);if(waiter){clearTimeout(waiter.timer);pending.delete(message.id);message.error?waiter.reject(Error(message.error)):waiter.resolve(message.result);}});
 child.on('error',()=>{lifecycle.fatal='PROCESS_ERROR';rejectAll();});
 child.on('exit',(code,signal)=>{exited=true;lifecycle.closed=true;lifecycle.exitCode=code;lifecycle.signal=signal;rejectAll();});
 return {role,child,lifecycle,get exited(){return exited||child.exitCode!==null||child.signalCode!==null;},call(method,value){if(exited||!child.connected)return Promise.reject(Error('CLIENT_CLOSED'));return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('IPC_TIMEOUT'));},POLICY.ipcMs);pending.set(id,{resolve,reject,timer});child.send({id,method,value},error=>{if(error&&pending.has(id)){clearTimeout(timer);pending.delete(id);reject(Error('IPC_SEND_ERROR'));}});});}};
}
function cleanStatus(value){return {generation:value.generation,identity:value.identity,profile:value.profile,visible:value.visible,world:value.world,wire:value.wire,guard:value.guard,diskRows:value.diskRows};}
function assertSafe(status,role,attempt,mode){const cfg=config(role,attempt,mode);if(status.identity!==cfg.identity||status.profile!==cfg.profile||status.generation!==1||!status.guard?.ready||status.guard.errors.length||status.diskRows!==0||status.guard.audit.physicalMutation!==0||status.world?.fatal||status.wire?.lastError)throw Error('ISOLATION_OR_WORLD_FAILURE');return true;}
async function start(attempt='001',mode='automated',options={}){
 config('host',attempt,mode);config('guest',attempt,mode);noActive();assertPrepared();if(mode==='manual')assertGate();
 const dir=path.join(ROOT,'reports',attempt);if(fs.existsSync(dir))throw Error('ATTEMPT_EXISTS');fs.mkdirSync(dir,{recursive:true});
 write(path.join(ROOT,'active-controller.json'),{attempt,pid:process.pid,mode});
 const clients=[],spawnChild=options.spawn||spawn;let stopping=null,timeout=null,failure='';
 const ctx={attempt,mode,dir,clients,get failure(){return failure;},async states(){const values=await Promise.all(clients.map(client=>client.call('status')));return Object.fromEntries(values.map((value,index)=>[clients[index].role,value]));},async wait(predicate,limit=POLICY.startupMs){const end=Date.now()+limit;while(Date.now()<end){if(failure)throw Error(failure);if(clients.some(client=>client.exited||client.lifecycle.fatal||client.lifecycle.reloading))throw Error('GROUP_CLOSED');const states=await ctx.states();if(predicate(states))return states;await pause(100);}throw Error('WAIT_TIMEOUT');},
  async negotiate(){await ctx.wait(states=>clients.length===2&&Object.values(states).every(state=>state.guard?.ready&&state.world?.ready));const offer=await clients[0].call('evaluate','Snapshot13.wire.offer()');const answer=await clients[1].call('evaluate','Snapshot13.wire.answer('+JSON.stringify(offer)+')');await clients[0].call('evaluate','Snapshot13.wire.remote('+JSON.stringify(answer)+')');return ctx.wait(states=>Object.values(states).every(state=>state.wire?.open&&state.wire.path.sameMachine),POLICY.connectionMs);},
  async stop(){
   if(stopping)return stopping;stopping=(async()=>{
    clearTimeout(timeout);
    await Promise.all(clients.filter(client=>!client.exited&&!client.lifecycle.closing).map(client=>client.call('shutdown').catch(()=>{})));
    const end=Date.now()+POLICY.shutdownMs;while(clients.some(client=>!client.exited)&&Date.now()<end)await pause(100);
    const cleanup={allExited:clients.every(client=>client.exited),forced:0,residual:clients.filter(client=>!client.exited).map(client=>({role:client.role,pid:client.child.pid})),processErrors:fs.readdirSync(dir).filter(name=>name.endsWith('main-failure.json')),exitCodes:clients.map(client=>({role:client.role,code:client.lifecycle.exitCode,signal:client.lifecycle.signal}))};
    cleanup.ok=cleanup.allExited&&!cleanup.residual.length&&!cleanup.processErrors.length&&cleanup.exitCodes.length===2&&cleanup.exitCodes.every(row=>row.code===0&&row.signal===null)&&!failure;
    cleanup.rendererConnectionsReleased=cleanup.allExited;write(path.join(dir,'cleanup.json'),cleanup);if(cleanup.allExited)fs.unlinkSync(path.join(ROOT,'active-controller.json'));return cleanup;
   })();return stopping;
  }
 };
 if(mode==='automated')timeout=setTimeout(()=>{failure='AUTOMATIC_TIMEOUT';ctx.stop().catch(()=>{});},POLICY.automaticMs);
 try{
  for(const role of ['host','guest']){
   const cfg=config(role,attempt,mode),env={...process.env};for(const key of Object.keys(env))if(/CLOUDFLARE|CF_API|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|^CATTAIL_P2P_/i.test(key))delete env[key];
   for(const name of ['roaming','local','temp'])fs.mkdirSync(path.join(cfg.profile,name),{recursive:true});
   Object.assign(env,{APPDATA:path.join(cfg.profile,'roaming'),LOCALAPPDATA:path.join(cfg.profile,'local'),TEMP:path.join(cfg.profile,'temp'),TMP:path.join(cfg.profile,'temp'),CATTAIL_P2P_TOOL_ROOT:ROOT,CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:role,CATTAIL_P2P_SESSION:cfg.sessionId,CATTAIL_P2P_TEST_ROOT:ROOT,CATTAIL_P2P_AUDIT_PATH:path.join(dir,role+'-audit.jsonl')});
   const child=spawnChild(path.join(ROOT,'runtime/sixtyfour.exe'),['--p2p-role='+role,'--attempt='+attempt,'--p2p-mode='+mode],{cwd:path.join(ROOT,'runtime'),env,windowsHide:mode!=='manual',stdio:['ignore','pipe','pipe','ipc']});
   const stream=fs.createWriteStream(path.join(dir,role+'-process.log'));child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});child.on('exit',()=>stream.end());
   clients.push(clientFor(child,role));
  }
  write(path.join(dir,'owned-processes.json'),clients.map(client=>({role:client.role,pid:client.child.pid})));return ctx;
 }catch(error){await ctx.stop();throw error;}
}
async function manual(attempt='101'){
 const ctx=await start(attempt,'manual');let states=null,cleanup=null,error='';
 try{
  states=await ctx.negotiate();
  while(!ctx.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.closed||client.lifecycle.reloading)){
   states=await ctx.states();for(const role of ['host','guest'])assertSafe(states[role],role,attempt,'manual');
   write(path.join(ctx.dir,'snapshot-session.json'),{approval:'18A',attempt,status:'AWAITING_PLAYER',playerFeedback:'PENDING',timeLimitMs:null,instances:Object.fromEntries(Object.entries(states).map(([role,state])=>[role,cleanStatus(state)]))});await pause(500);
  }
 }catch(reason){if(!ctx.clients.some(client=>client.exited||client.lifecycle.closing||client.lifecycle.reloading))error=reason.message;}
 finally{cleanup=await ctx.stop();write(path.join(ctx.dir,'snapshot-session.json'),{approval:'18A',attempt,status:error||!cleanup.ok?'INCOMPLETE':'CLOSED_PENDING_PLAYER_FEEDBACK',playerFeedback:'PENDING',timeLimitMs:null,error:error||null,instances:states?Object.fromEntries(Object.entries(states).map(([role,state])=>[role,cleanStatus(state)])):null,cleanup});}
}
module.exports={ROOT,OLD_ROOT,MOD,SOURCE,POLICY,hash,read,write,prior,prepare,assertPrepared,refresh,inputs,seal,assertGate,assertProtection,clientFor,cleanStatus,assertSafe,start,manual,pause};
if(require.main===module){const operation=process.argv[2];Promise.resolve().then(()=>operation==='--prepare'?prepare():operation==='--refresh'?refresh():operation==='--seal'?seal():operation==='--run'?manual(process.argv[3]||'101'):Promise.reject(Error('USE_PREPARE_REFRESH_SEAL_OR_RUN'))).catch(error=>{console.error(error.message);process.exitCode=1;});}
