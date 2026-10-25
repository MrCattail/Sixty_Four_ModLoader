'use strict';
const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process');
const {ROOT,config}=require('./fixtures.cjs');
async function start(source,attempt='001'){
 const dir=path.join(ROOT,'reports',attempt);
 if(fs.existsSync(dir))throw Error('ATTEMPT_EXISTS');
 fs.mkdirSync(dir,{recursive:true});
 const tmp=path.join(ROOT,'temp',attempt);fs.mkdirSync(tmp,{recursive:true});
 process.env.TEMP=tmp;process.env.TMP=tmp;process.env.XDG_CACHE_HOME=path.join(ROOT,'cache',attempt);process.env.MINIFLARE_CACHE_DIR=path.join(ROOT,'cache',attempt,'miniflare');process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';
 const service=await require('./signaling-local.cjs').start(source,attempt);
 const clients=[];
 try{
  for(const role of ['host','guest']){
   const cfg=config(role,attempt),env={...process.env};
   for(const key of Object.keys(env))if(/CLOUDFLARE|CF_API|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|^CATTAIL_P2P_/i.test(key))delete env[key];
   for(const name of ['roaming','local','temp'])fs.mkdirSync(path.join(cfg.profile,name),{recursive:true});
   Object.assign(env,{APPDATA:path.join(cfg.profile,'roaming'),LOCALAPPDATA:path.join(cfg.profile,'local'),TEMP:path.join(cfg.profile,'temp'),TMP:path.join(cfg.profile,'temp'),CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:role,CATTAIL_P2P_TEST_ROOT:ROOT,CATTAIL_P2P_SESSION:'desktop13-'+attempt,CATTAIL_P2P_SIGNALING_URL:cfg.signalingUrl,CATTAIL_P2P_AUDIT_PATH:path.join(dir,role+'-audit.jsonl')});
   const exe=path.join(ROOT,'runtime/sixtyfour.exe');
   const child=spawn(exe,['--p2p-role='+role,'--attempt='+attempt],{cwd:path.dirname(exe),env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
   const stream=fs.createWriteStream(path.join(dir,role+'-process.log'));
   child.stdout.pipe(stream,{end:false});child.stderr.pipe(stream,{end:false});
   const pending=new Map();let seq=0,fatal='';
   child.on('message',m=>{if(m.fatal)fatal=m.fatal;const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
   child.on('exit',(code)=>{stream.end();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CHILD_EXIT_'+code));}pending.clear();});
   clients.push({role,child,call(method,value,timeout=15000){if(fatal)return Promise.reject(Error(fatal));return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('RPC_TIMEOUT_'+role+'_'+method));},timeout);pending.set(id,{resolve,reject,timer});child.send({id,method,value},err=>{if(err){clearTimeout(timer);pending.delete(id);reject(err);}});});}});
  }
  fs.writeFileSync(path.join(dir,'owned-processes.json'),JSON.stringify(clients.map(x=>({role:x.role,pid:x.child.pid})),null,2));
  return {clients,dir,async stop(){
   for(const client of clients){try{await client.call('shutdown');}catch(e){}}
   const exited=c=>c.child.exitCode!==null||c.child.signalCode!==null;
   const end=Date.now()+8000;
   while(clients.some(c=>!exited(c))&&Date.now()<end)await new Promise(r=>setTimeout(r,100));
   for(const client of clients)if(!exited(client)){execFileSync('taskkill',['/PID',String(client.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
   await new Promise(r=>setTimeout(r,200));
   await service.stop();
  }};
 }catch(e){for(const c of clients)c.child.kill();await service.stop();throw e;}
}
module.exports={start};
if(require.main===module)require('./verify.cjs').verify(process.argv[2]||process.cwd(),process.argv[3]||'001').catch(e=>{console.error(e.message);process.exitCode=1;});
