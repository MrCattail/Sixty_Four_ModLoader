'use strict';
const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process');
const {ROOT,FOUR_ROOT,FOUR_INSTANCES,config}=require('./fixtures.cjs');
function clientFor(child,role,timeoutDefault=15000){
 const pending=new Map();let seq=0,fatal='',exited=false;
 const lifecycle={closing:false,closed:false,loaded:false,timeout:false,exitCode:null,signal:null};
 function settleAll(code){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(code));}pending.clear();}
 child.on('message',m=>{
  if(m.fatal){fatal=m.fatal;settleAll('CLIENT_FATAL');}
  if(m.event==='loaded')lifecycle.loaded=true;
  if(m.event==='closing')lifecycle.closing=true;
  if(m.event==='closed'){lifecycle.closed=true;settleAll('CLIENT_CLOSED');}
  if(m.event==='manual-timeout')lifecycle.timeout=true;
  const p=pending.get(m.id);
  if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}
 });
 child.on('error',()=>{fatal='CLIENT_PROCESS_ERROR';settleAll(fatal);});
 child.on('exit',(code,signal)=>{exited=true;lifecycle.closed=true;lifecycle.exitCode=code;lifecycle.signal=signal;settleAll('CLIENT_EXITED');});
 const client={role,child,lifecycle,get exited(){return exited||child.exitCode!==null||child.signalCode!==null;},
  call(method,value,timeout=timeoutDefault){
   if(client.exited||lifecycle.closed||lifecycle.closing&&method!=='shutdown')return Promise.reject(Error('CLIENT_CLOSED'));
   if(fatal)return Promise.reject(Error('CLIENT_FATAL'));
   if(!child.connected)return Promise.reject(Error('CLIENT_DISCONNECTED'));
   return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('RPC_TIMEOUT'));},timeout);
    pending.set(id,{resolve,reject,timer});
    try{child.send({id,method,value},error=>{if(error&&pending.has(id)){clearTimeout(timer);pending.delete(id);reject(Error('CLIENT_SEND_FAILED'));}});}
    catch(error){clearTimeout(timer);pending.delete(id);reject(Error('CLIENT_SEND_FAILED'));}
   });
  }
 };
 return client;
}
async function start(source,attempt='001',options={}){
 const mode=options.mode||'automated';
 const four=ROOT===FOUR_ROOT;
 if(four&&(!Array.isArray(options.instances)||options.instances.length!==4||options.instances.some((id,index)=>id!==FOUR_INSTANCES[index])))throw Error('EXACT_FOUR_INSTANCES_REQUIRED');
 if(!four&&options.instances)throw Error('INSTANCES_REQUIRE_FOUR_ROOT');
 const specs=four?FOUR_INSTANCES.map(instance=>({instance,role:instance==='host'?'host':'guest'})):[{role:'host'},{role:'guest'}];
 for(const spec of specs)config(spec.role,attempt,mode,spec.instance);
 const dir=path.join(ROOT,'reports',attempt);
 if(fs.existsSync(dir))throw Error('ATTEMPT_EXISTS');
 const tmp=path.join(ROOT,'temp',attempt);fs.mkdirSync(tmp,{recursive:true});
 process.env.TEMP=tmp;process.env.TMP=tmp;
 process.env.XDG_CACHE_HOME=path.join(ROOT,'cache',attempt);
 process.env.MINIFLARE_CACHE_DIR=path.join(ROOT,'cache',attempt,'miniflare');
 process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';
 await require('./signaling-local.cjs').portFree();
 fs.mkdirSync(dir,{recursive:true});
 const service=await require('./signaling-local.cjs').start(source,attempt);
 const clients=[];
 let stopPromise;
 async function stop(){
  if(stopPromise)return stopPromise;
  stopPromise=(async()=>{
   for(const c of clients)if(!c.exited&&!c.lifecycle.closed){try{await c.call('shutdown',null,3000);}catch(error){}}
   const deadline=Date.now()+8000;
   while(clients.some(c=>!c.exited)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
   let forced=0;
   if(mode==='automated'&&!four)for(const c of clients)if(!c.exited){execFileSync('taskkill',['/PID',String(c.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});forced++;}
   await new Promise(resolve=>setTimeout(resolve,100));
   await service.stop();
   const result={allExited:clients.every(c=>c.exited),forced,residual:clients.filter(c=>!c.exited).map(c=>({role:c.role,instance:c.instance,pid:c.child.pid}))};
   result.processErrors=fs.readdirSync(dir).filter(name=>name.endsWith('main-failure.json'));
   result.exitCodes=clients.map(client=>({role:client.role,instance:client.instance,code:client.lifecycle.exitCode,signal:client.lifecycle.signal}));
   result.ok=result.allExited&&forced===0&&result.processErrors.length===0&&result.exitCodes.every(row=>row.code===0&&!row.signal);
   fs.writeFileSync(path.join(dir,'cleanup.json'),JSON.stringify(result,null,2));
   if(mode==='automated'&&!result.ok)throw Error('CLIENT_CLEANUP_FAILED');
   return result;
  })();
  return stopPromise;
 }
 try{
  for(const spec of specs){
   const {role,instance}=spec,key=instance||role,cfg=config(role,attempt,mode,instance),env={...process.env};
   for(const key of Object.keys(env))if(/CLOUDFLARE|CF_API|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|^CATTAIL_P2P_/i.test(key))delete env[key];
   for(const name of ['roaming','local','temp'])fs.mkdirSync(path.join(cfg.profile,name),{recursive:true});
   Object.assign(env,{APPDATA:path.join(cfg.profile,'roaming'),LOCALAPPDATA:path.join(cfg.profile,'local'),TEMP:path.join(cfg.profile,'temp'),TMP:path.join(cfg.profile,'temp'),CATTAIL_P2P_TOOL_ROOT:ROOT,CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:role,CATTAIL_P2P_TEST_ROOT:ROOT,CATTAIL_P2P_SESSION:cfg.sessionId,CATTAIL_P2P_SIGNALING_URL:cfg.signalingUrl,CATTAIL_P2P_AUDIT_PATH:path.join(dir,key+'-audit.jsonl')});
   if(instance)env.CATTAIL_P2P_INSTANCE=instance;
   const exe=path.join(ROOT,'runtime/sixtyfour.exe'),args=['--p2p-role='+role,'--attempt='+attempt,'--p2p-mode='+mode];
   if(options.uiCheck)args.push('--p2p-ui-check=1');
   if(instance)args.push('--p2p-instance='+instance);
   const child=(options.spawn||spawn)(exe,args,{cwd:path.dirname(exe),env,windowsHide:mode!=='manual'||!!options.uiCheck,stdio:['ignore','pipe','pipe','ipc']});
   const stream=fs.createWriteStream(path.join(dir,key+'-process.log'));
   child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
   child.on('exit',()=>stream.end());
   const client=clientFor(child,role);client.instance=key;clients.push(client);
  }
  fs.writeFileSync(path.join(dir,'owned-processes.json'),JSON.stringify(clients.map(c=>({role:c.role,instance:c.instance,pid:c.child.pid})),null,2));
  return {clients,dir,stop};
 }catch(error){await stop();throw error;}
}
module.exports={start,clientFor};
if(require.main===module)require('./verify.cjs').verify(process.argv[2]||process.cwd(),process.argv[3]||'001').catch(error=>{console.error(error.message);process.exitCode=1;});
