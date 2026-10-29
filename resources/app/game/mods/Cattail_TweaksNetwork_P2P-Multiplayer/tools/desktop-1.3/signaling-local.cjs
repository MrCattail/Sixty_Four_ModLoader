'use strict';
const fs=require('fs'),path=require('path'),net=require('net');
const {ROOT,inside}=require('./fixtures.cjs');
async function portFree(){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('LOOPBACK_PORT_OCCUPIED')));s.listen(8787,'127.0.0.1',()=>s.close(resolve));});}
async function start(source,attempt){
 await portFree();
 const service=path.join(source,'resources/app/game/mods/Cattail_TweaksNetwork_P2P-Multiplayer/services/signaling');
 const output=path.join(ROOT,'service',attempt);fs.mkdirSync(output,{recursive:true});
 const esbuild=require(require.resolve('esbuild',{paths:[service]}));
 const bundle=path.join(output,'worker.mjs');
 await esbuild.build({entryPoints:[path.join(service,'src/index.js')],outfile:bundle,bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],logLevel:'silent'});
 const {Miniflare,Log,LogLevel}=require(require.resolve('miniflare',{paths:[service]}));
 const log=new Log(LogLevel.ERROR);
 const mf=new Miniflare({
  cf:false,host:'127.0.0.1',port:8787,scriptPath:bundle,modules:true,compatibilityDate:'2026-08-04',
  durableObjects:{ROOMS:{className:'P2PRoom',useSQLite:true},ADMISSION:{className:'P2PAdmission',useSQLite:true}},
  durableObjectsPersist:path.join(output,'durable'),cachePersist:path.join(output,'cache'),kvPersist:path.join(output,'kv'),
  bindings:{ALLOWED_ORIGINS:'null,file://,http://127.0.0.1:8787',ALLOW_MISSING_ORIGIN:'true',ALLOW_INSECURE_LOCAL_INTERNAL_AUTH:'true',SERVICE_DISABLED:'false',ALPHA_INVITE_REQUIRED:'false',ROOM_CREATIONS_PER_DAY:'20',TURN_GRANTS_PER_DAY:'32',TURN_DISABLED:'true',TURN_TTL_SECONDS:'900',TURN_REFRESH_AFTER_SECONDS:'600',TURN_GRANTS_PER_ROOM_PER_DAY:'16'},
  outboundService:()=>new Response('LOCAL_OUTBOUND_DENIED',{status:403}),log
 });
 try{await mf.ready;}catch(e){await mf.dispose();throw e;}
 return {stop:()=>mf.dispose(),origin:'http://127.0.0.1:8787'};
}
module.exports={start,portFree};
