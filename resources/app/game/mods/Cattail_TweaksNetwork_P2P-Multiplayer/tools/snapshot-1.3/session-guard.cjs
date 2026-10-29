'use strict';
module.exports.install=function(window,config,ipcRenderer){
const {indexedDB,IDBDatabase,IDBObjectStore,IDBKeyRange,Storage,localStorage,navigator}=window;
const rawIpc={send:ipcRenderer.send.bind(ipcRenderer),invoke:ipcRenderer.invoke.bind(ipcRenderer),sendSync:ipcRenderer.sendSync.bind(ipcRenderer)};
if(!['host','guest'].includes(config.role))throw Error('INVALID_IDENTITY');
const {ROOT,config:makeConfig}=require('./fixtures.cjs');
const expected=makeConfig(config.role,config.attempt,config.mode);
if(require('path').resolve(config.root)!==ROOT||config.identity!==expected.identity||require('path').resolve(config.profile)!==expected.profile||config.sessionId!==expected.sessionId)throw Error('INVALID_SNAPSHOT_CONTEXT');
const DB='sixtyfour_warehouse',STORE='charps_memory_slots',ID=config.identity;
const prefKey='abstractv03_preferences'+ID;
const progressKeys=new Set(['abstractv03'+ID,'abstractv03_permanents'+ID,'abstractv03_glory'+ID,'sixtyfourabsoluteslocal']);
const rawStorage={get:Storage.prototype.getItem,set:Storage.prototype.setItem,remove:Storage.prototype.removeItem,clear:Storage.prototype.clear};
const rawDb={open:indexedDB.open.bind(indexedDB),delete:indexedDB.deleteDatabase.bind(indexedDB),tx:IDBDatabase.prototype.transaction};
const rawStore={put:IDBObjectStore.prototype.put,add:IDBObjectStore.prototype.add,delete:IDBObjectStore.prototype.delete,clear:IDBObjectStore.prototype.clear};
const enabled=true;
let fault='',memory=new Map(),virtualStorage=new Map();
let audit={};
const copy=x=>x===undefined?undefined:structuredClone(x);
const keyId=x=>JSON.stringify(x);
const timeline=['preload-protection-installed'];
function resetAudit(){audit={memoryPut:0,memoryDelete:0,physicalMutation:0,rawMutationDenied:0,ipcDenied:0,ipcByChannel:{},progressKeyWrites:0,allowedPreferenceWrites:0,unknownStorageDenied:0,networkDenied:0,setupMutations:0};}
resetAudit();
function error(code){const e=new Error(code);e.code=code;return e;}
function validateIdentity(identity,version){if(identity!==ID)throw error('WRONG_SYNTHETIC_IDENTITY');if(version!=='1.3')throw error('UNSUPPORTED_GAME_VERSION');}
function memoryTransaction(names,mode){
 if(fault==='database')throw error('SIMULATED_DATABASE_FAILURE');
 const stores=typeof names==='string'?[names]:Array.from(names);
 if(stores.length!==1||stores[0]!==STORE)throw error('UNKNOWN_OBJECT_STORE');
 const tx={error:null,oncomplete:null,onerror:null,onabort:null,mode:mode||'readonly',db:{name:DB}};
 const operations=[];
 const store={name:STORE,transaction:tx};
 for(const method of ['get','getAllKeys','getAll','put','add','delete','clear']){
  store[method]=function(value,key){
   const req={onsuccess:null,onerror:null,result:undefined,error:null};
   operations.push({method,value:(method==='getAllKeys'||method==='getAll')?value:copy(value),key:copy(key),req});
   return req;
  };
 }
 tx.objectStore=name=>{if(name!==STORE)throw error('UNKNOWN_OBJECT_STORE');return store;};
 tx.abort=()=>{tx.error=error('EXPLICIT_ABORT');};
 setTimeout(()=>{
  const working=new Map(Array.from(memory,([k,v])=>[k,copy(v)]));
  try{
   if(tx.error)throw tx.error;
   for(const op of operations){
    const {method,req}=op;
    if(['put','add','delete','clear'].includes(method)&&tx.mode!=='readwrite')throw error('READONLY_TRANSACTION');
    if(method==='put'||method==='add'){
     const k=keyId(op.key);if(method==='add'&&working.has(k))throw error('CONSTRAINT');
     working.set(k,copy(op.value));audit.memoryPut++;req.result=copy(op.key);
    }else if(method==='delete'){working.delete(keyId(op.value));audit.memoryDelete++;}
    else if(method==='clear'){working.clear();audit.memoryDelete++;}
    else if(method==='get'){req.result=copy(working.get(keyId(op.value)));}
    else {
     let entries=Array.from(working,([k,v])=>[JSON.parse(k),v]).sort((a,b)=>a[0][1]-b[0][1]);
     if(op.value&&typeof op.value.contains==='function')entries=entries.filter(([k])=>op.value.contains(k));
     req.result=method==='getAllKeys'?entries.map(([k])=>copy(k)):entries.map(([,v])=>copy(v));
    }
    if(req.onsuccess)req.onsuccess({target:req});
   }
   if(fault==='transaction'&&tx.mode==='readwrite')throw error('SIMULATED_TRANSACTION_FAILURE');
   if(tx.mode==='readwrite')memory=working;
   if(tx.oncomplete)tx.oncomplete({target:tx});
  }catch(e){
   tx.error=e;
   for(const op of operations){op.req.error=e;if(op.req.onerror)op.req.onerror({target:op.req});}
   if(tx.onerror)tx.onerror({target:tx});else if(tx.onabort)tx.onabort({target:tx});
  }
 },0);
 return tx;
}
indexedDB.open=function(name,version){if(enabled&&name!==DB)throw error('UNKNOWN_DATABASE');return rawDb.open(name,version);};
indexedDB.deleteDatabase=function(name){if(enabled)throw error('DATABASE_DELETE_BLOCKED');return rawDb.delete(name);};
IDBDatabase.prototype.transaction=function(names,mode){
 if(enabled){if(this.name!==DB)throw error('UNKNOWN_DATABASE');return memoryTransaction(names,mode);}
 return rawDb.tx.apply(this,arguments);
};
for(const method of Object.keys(rawStore)){
 IDBObjectStore.prototype[method]=function(){
  if(enabled){audit.rawMutationDenied++;throw error('PHYSICAL_IDB_WRITE_BLOCKED');}
  audit.physicalMutation++;return rawStore[method].apply(this,arguments);
 };
}
Storage.prototype.getItem=function(key){
 key=String(key);if(enabled&&progressKeys.has(key))return virtualStorage.has(key)?virtualStorage.get(key):rawStorage.get.call(this,key);
 return rawStorage.get.call(this,key);
};
Storage.prototype.setItem=function(key,value){
 key=String(key);value=String(value);
 if(!enabled)return rawStorage.set.call(this,key,value);
 if(progressKeys.has(key)){virtualStorage.set(key,value);audit.progressKeyWrites++;return;}
 if(['modloader.statusCorner','modloader:panelState'].includes(key))return rawStorage.set.call(this,key,value);
 if(key===prefKey){
  const parsed=JSON.parse(value),allowed=new Set(['mute','languageId','currentSlotId','photofobia','chill','zoom','globalSoundVolume','helpIsNeeded','mobileExplainerPointer']);
  if(Object.keys(parsed).some(k=>!allowed.has(k)))throw error('PREFERENCE_SCHEMA_REJECTED');
  audit.allowedPreferenceWrites++;return rawStorage.set.call(this,key,value);
 }
 audit.unknownStorageDenied++;throw error('UNKNOWN_STORAGE_KEY');
};
Storage.prototype.removeItem=function(key){
 key=String(key);if(!enabled)return rawStorage.remove.call(this,key);
 if(progressKeys.has(key)){virtualStorage.set(key,null);audit.progressKeyWrites++;return;}
 if(key===prefKey)return rawStorage.remove.call(this,key);
 throw error('UNKNOWN_STORAGE_KEY');
};
Storage.prototype.clear=function(){if(enabled)throw error('STORAGE_CLEAR_BLOCKED');return rawStorage.clear.call(this);};
const privateChannels=new Set(['getMyStuff','gameError']);
privateChannels.add('quit');
const privateInvokes=new Set(['modloader:snapshots:activate','modloader:app-window','modloader:libraries:runtime','modloader:snapshots:runtime','modloader:clear-view-probe']);
function ipcDenied(kind,channel){audit.ipcDenied++;const key=kind+':'+channel;audit.ipcByChannel[key]=(audit.ipcByChannel[key]||0)+1;}
ipcRenderer.send=function(channel,...args){if(!privateChannels.has(channel)){ipcDenied('send',channel);return false;}return rawIpc.send(channel,...args);};
ipcRenderer.invoke=function(channel,...args){const action=args[0]?.action;const deniedAction=channel==='modloader:snapshots:runtime'&&!['capabilities','list','read'].includes(action)||channel==='modloader:libraries:runtime'&&!['capabilities','list','read'].includes(action)||channel==='modloader:app-window'&&!['get','state','capabilities'].includes(action);if(!privateInvokes.has(channel)||deniedAction){ipcDenied('invoke',channel);return Promise.resolve(false);}return rawIpc.invoke(channel,...args);};
ipcRenderer.sendSync=function(channel,...args){if(channel==='modloader:window:ping')return rawIpc.sendSync(channel,...args);ipcDenied('sync',channel);throw error('SYNC_IPC_BLOCKED');};
async function physicalDb(){
 return new Promise((resolve,reject)=>{const req=rawDb.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
async function diskSnapshot(){
 const db=await physicalDb();try{return await new Promise((resolve,reject)=>{
  const tx=rawDb.tx.call(db,STORE,'readonly'),st=tx.objectStore(STORE),keys=st.getAllKeys(),values=st.getAll();
  tx.oncomplete=()=>resolve(keys.result.map((k,i)=>({key:k,value:values.result[i]})));tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}

const addresses=new Set(config.localAddresses||[]);
function validate(options={}){
 if(config.protocol!=='p2p-desktop-13-v1'||config.expectedVersion!=='1.3'||config.localOnly!==true)throw error('INVALID_EARLY_CONTEXT');
 if(options.role&&options.role!==config.role)throw error('EARLY_ROLE_MISMATCH');
 if(options.testRoot&&require('path').resolve(options.testRoot)!==require('path').resolve(config.root))throw error('EARLY_ROOT_MISMATCH');
 if(options.sessionId&&options.sessionId!==(config.sessionId||'desktop13-'+config.attempt))throw error('EARLY_SESSION_MISMATCH');
 return true;
}
validate();
let ready=false,attached=false;
const errors=[],blocked=[],saveTimes=[],saveResults=[];
let ticks=0,frames=0,clockWorkers=0,pcCreated=0,configurationChecks=0;
function allowUrl(value,kind='fetch'){
 const u=new URL(String(value),window.location.href);
 if(kind!=='ws'&&u.protocol==='file:'&&require('./fixtures.cjs').inside(require('path').join(config.root,'runtime/resources/app/game'),require('url').fileURLToPath(u)))return true;
 if(u.username||u.password||u.hash)throw error('LOCAL_URL_DENIED');
 // This experiment has no HTTP or WebSocket signaling service.
 throw error('LOCAL_URL_DENIED');
}
function candidateAllowed(candidate){
 if(!candidate)return true;
 const line=typeof candidate==='string'?candidate:candidate.candidate;
 if(!line)return true;
 const parts=line.replace(/^a=/,'').trim().split(/\s+/);
 if(parts[6]!=='typ'||parts[7]!=='host'||!addresses.has(parts[4]))throw error('NONLOCAL_ICE_DENIED');
 return true;
}
function descriptionAllowed(description){
 for(const line of String(description?.sdp||'').split(/\r?\n/))if(line.startsWith('a=candidate:'))candidateAllowed(line);
 // Connection addresses can nominate a target before trickled candidates arrive.
 for(const line of String(description?.sdp||'').split(/\r?\n/)){
  if(line.startsWith('a=remote-candidates:')){const fields=line.slice(20).trim().split(/\s+/);for(let i=1;i<fields.length;i+=3)if(!addresses.has(fields[i]))throw error('NONLOCAL_SDP_DENIED');}
  if(line.startsWith('c=IN ')){const address=line.split(/\s+/)[2];if(!['0.0.0.0','::'].includes(address)&&!addresses.has(address))throw error('NONLOCAL_SDP_DENIED');}
 }
 return true;
}
function blockedNetwork(){audit.networkDenied++;throw error('LOCAL_NETWORK_DENIED');}
const nativeFetch=window.fetch.bind(window);
window.fetch=function(url,options){try{allowUrl(url);return nativeFetch(url,{...options,redirect:'error'});}catch(e){audit.networkDenied++;return Promise.reject(e);}};
const NativeSocket=window.WebSocket;
window.WebSocket=function(url,protocols){allowUrl(url,'ws');return protocols===undefined?new NativeSocket(url):new NativeSocket(url,protocols);};
window.WebSocket.prototype=NativeSocket.prototype;
for(const key of ['CONNECTING','OPEN','CLOSING','CLOSED'])window.WebSocket[key]=NativeSocket[key];
const xhrOpen=window.XMLHttpRequest.prototype.open;
window.XMLHttpRequest.prototype.open=function(method,url,...rest){allowUrl(url);return xhrOpen.call(this,method,url,...rest);};
const NativeWorker=window.Worker;
window.Worker=function(url,options){
 const target=new URL(String(url),window.location.href),expected=new URL('scripts/clock.js',window.location.href);
 if(target.href!==expected.href)throw error('UNKNOWN_WORKER_DENIED');
 clockWorkers++;return new NativeWorker(url,options);
};
window.Worker.prototype=NativeWorker.prototype;
window.SharedWorker=blockedNetwork;navigator.sendBeacon=blockedNetwork;
if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.reject(error('SERVICE_WORKER_DENIED'));
const NativePC=window.RTCPeerConnection;
function validateIce(value){configurationChecks++;if(!value||!Array.isArray(value.iceServers)||value.iceServers.length)throw error('NONEMPTY_ICE_DENIED');}
window.RTCPeerConnection=function(value){
 validateIce(value);pcCreated++;
 const pc=new NativePC(value),set=pc.setConfiguration.bind(pc),add=pc.addIceCandidate.bind(pc),remote=pc.setRemoteDescription.bind(pc);
 pc.setConfiguration=value=>{validateIce(value);return set(value);};
 pc.addIceCandidate=value=>{candidateAllowed(value);return add(value);};
 pc.setRemoteDescription=value=>{descriptionAllowed(value);return remote(value);};
 return pc;
};
window.RTCPeerConnection.prototype=NativePC.prototype;
for(const [name,methods]of Object.entries({http:['request','get'],https:['request','get'],net:['connect','createConnection'],tls:['connect'],dgram:['createSocket']})){
 const mod=require(name);for(const method of methods)if(typeof mod[method]==='function')mod[method]=blockedNetwork;
}
function attachGame(Game){
 if(attached)throw error('DUPLICATE_GAME_GUARD');
 if(typeof Game!=='function')throw error('MISSING_NATIVE_GAME');
 attached=true;
 const prototype=Game.prototype,prepare=prototype.prepareSavedGameData;
 prototype.prepareSavedGameData=async function(preload){
  ready=false;
  validateIdentity(preload?.steamId,this.version);
  timeline.push('before-native-prepare');
  const result=await prepare.apply(this,arguments);
  timeline.push('after-native-prepare');return result;
 };
 const asyncBlocked=new Set(['reset','loadSaveFromClipboard','importSave','restoreBackup','wipeSlot','deleteSlot','shiftSlots','addNewSlot','loadSaveFromSlotStack','exportSave']);
 for(const name of asyncBlocked){
  if(typeof prototype[name]!=='function')continue;
  prototype[name]=function(){blocked.push(name);return Promise.resolve(false);};
 }
 for(const [name,count]of [['renderloop',()=>frames++]]){
  const original=prototype[name];prototype[name]=function(){count();return original.apply(this,arguments);};
 }
 const loop=prototype.saveLoop;
 prototype.saveLoop=function(){saveTimes.push(Date.now());return loop.apply(this,arguments);};
 const save=prototype.saveGame;
 prototype.saveGame=async function(){try{const result=await save.apply(this,arguments);saveResults.push('memory-committed');return result;}catch(e){saveResults.push('rejected');throw e;}};
}
function markReady(game){
 validateIdentity(game?.steamId,game?.version);
 if(!attached||!timeline.includes('after-native-prepare'))throw error('EARLY_PROTECTION_MISSING');
 ready=true;timeline.push('afterGameInit');return true;
}
return Object.freeze({
 protocol:config.protocol,config,localOnly:true,get ready(){return ready;},validate,markReady,attachGame,allowUrl,candidateAllowed,descriptionAllowed,
 noteError:(type,message)=>errors.push({type,message:String(message)}),noteTick:()=>ticks++,
 assertReady(){if(!ready)throw error('GAME_NOT_READY');return true;},
 snapshot(){return {ready,timeline:timeline.slice(),audit:copy(audit),errors:copy(errors),blocked:blocked.slice(),saveTimes:saveTimes.slice(),saveResults:saveResults.slice(),ticks,frames,clockWorkers,pcCreated,configurationChecks,memoryRows:Array.from(memory,([key,value])=>({key:JSON.parse(key),value:copy(value)}))};},
 diskSnapshot,readDiskKey:key=>rawStorage.get.call(localStorage,key),prefKey,
 fault(value){if(!['','database','transaction'].includes(value))throw error('BAD_FAULT');fault=value;},
 async testRawStoreWrite(){const db=await physicalDb();try{return await new Promise(resolve=>{const tx=rawDb.tx.call(db,STORE,'readwrite');try{tx.objectStore(STORE).put({},[ID,77]);resolve(false);}catch(e){tx.abort();resolve(e.code==='PHYSICAL_IDB_WRITE_BLOCKED');}});}finally{db.close();}}
});

};
