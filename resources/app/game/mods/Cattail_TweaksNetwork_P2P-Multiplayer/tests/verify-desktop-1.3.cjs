'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const mod=path.resolve(__dirname,'..'),tool=path.join(mod,'tools/desktop-1.3');
const fixtures=require(path.join(tool,'fixtures.cjs')),installer=require(path.join(tool,'session-guard.cjs'));
const protocol=require(path.join(mod,'scripts/protocol.js')),signaling=require(path.join(mod,'scripts/signaling.js')),transport=require(path.join(mod,'scripts/transport.js'));
const cfg={...fixtures.config('host'),localAddresses:['127.0.0.1','::1','192.168.1.2']};
class Storage{constructor(){this.values=new Map();}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}clear(){this.values.clear();}}
class Store{put(){}add(){}delete(){}clear(){}}
class Database{
 constructor(){this.name='sixtyfour_warehouse';this.objectStoreNames={contains:()=>true};}
 transaction(){return {objectStore:()=>({getAllKeys:()=>({result:[]}),getAll:()=>({result:[]})})};}
 close(){}
}
class Socket{static OPEN=1;constructor(){setTimeout(()=>{this.readyState=1;this.onopen?.();},0);}send(raw){const msg=JSON.parse(raw);if(msg.type===protocol.SIGNAL_TYPES.AUTH)setTimeout(()=>this.onmessage?.({data:JSON.stringify(protocol.makeSignalMessage(protocol.SIGNAL_TYPES.AUTH_OK,{peerId:'host',role:'host',slot:0,resumeToken:'rotated-fake',peers:[]}))}),0);}close(){this.readyState=3;}}
class PC{constructor(c){this.c=c;}setConfiguration(c){this.c=c;}addIceCandidate(){return Promise.resolve();}setRemoteDescription(){return Promise.resolve();}close(){}}
const fake={
 indexedDB:{open(){const req={result:new Database()};setTimeout(()=>req.onsuccess?.(),0);return req;},deleteDatabase(){}},
 IDBDatabase:Database,IDBObjectStore:Store,IDBKeyRange:{bound:(a,b)=>({contains:key=>key[0]===a[0]&&key[1]>=a[1]&&key[1]<=b[1]})},
 Storage,localStorage:new Storage(),navigator:{},location:{href:'file:///'+fixtures.ROOT.replaceAll('\\','/')+'/runtime/resources/app/game/index.html'},
 fetch:async()=>({}),WebSocket:Socket,XMLHttpRequest:class{open(){}},Worker:class{},RTCPeerConnection:PC
};
const ipc={send(){},sendSync(){},invoke:async()=>true};
const guard=installer.install(fake,cfg,ipc);
let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name);}
(async()=>{
 await check('invalid role, root, context and identity refuse startup',()=>{
  assert.throws(()=>installer.install({}, {...cfg,role:'none'},ipc),/IDENTITY/);
  assert.throws(()=>installer.install({}, {...cfg,root:'C:/outside'},ipc),/ROOT/);
  assert.throws(()=>guard.validate({role:'guest'}),/ROLE/);
  assert.throws(()=>guard.validate({testRoot:'C:/outside'}),/ROOT/);
  assert.throws(()=>guard.assertReady(),/NOT_READY/);
 });
 await check('URL rules allow only clone files and fixed loopback',()=>{
  guard.allowUrl('http://127.0.0.1:8787/v2/rooms');guard.allowUrl('ws://127.0.0.1:8787/socket','ws');
  guard.allowUrl('scripts/clock.js');
  for(const url of ['https://example.invalid','http://127.0.0.1:9999','http://localhost:8787','http://user@127.0.0.1:8787','file:///C:/outside/game.js'])assert.throws(()=>guard.allowUrl(url),/DENIED/);
 });
 await check('ICE and SDP reject remote host, srflx, relay and mDNS',()=>{
  guard.candidateAllowed('candidate:1 1 udp 1 192.168.1.2 5000 typ host');
  for(const candidate of ['candidate:1 1 udp 1 192.168.1.3 5000 typ host','candidate:1 1 udp 1 127.0.0.1 5000 typ relay','candidate:1 1 udp 1 127.0.0.1 5000 typ srflx','candidate:1 1 udp 1 fake.local 5000 typ host'])assert.throws(()=>guard.candidateAllowed(candidate),/DENIED/);
  assert.throws(()=>guard.descriptionAllowed({sdp:'c=IN IP4 192.168.1.3'}),/DENIED/);
 });
 await check('RTCPeerConnection config cannot acquire STUN or TURN',()=>{
  assert.throws(()=>new fake.RTCPeerConnection({iceServers:[{urls:'stun:example.invalid'}]}),/ICE_DENIED/);
  const pc=new fake.RTCPeerConnection({iceServers:[]});assert.throws(()=>pc.setConfiguration({iceServers:[{}]}),/ICE_DENIED/);
 });
 await check('only the native clock worker is admitted',()=>{
  new fake.Worker('scripts/clock.js');assert.throws(()=>new fake.Worker('scripts/other.js'),/WORKER_DENIED/);
 });
 await check('HTTP redirect policy is forced to error',async()=>{
  await assert.rejects(fake.fetch('https://example.invalid'),/DENIED/);
 });
 const source=fs.readFileSync(path.resolve(mod,'../../scripts/game.js'),'utf8');
 const Native=new Function('window','localStorage','indexedDB','IDBKeyRange',source+'\nreturn Game;')(fake,fake.localStorage,fake.indexedDB,fake.IDBKeyRange);
 const game=Object.create(Native.prototype);
 Object.assign(game,{version:'1.3',steamId:cfg.identity,saveSlots:[],preferences:{}});
 guard.attachGame(Native);
 await check('actual native prepare and IDB list/read/write use memory',async()=>{
  await game.prepareSavedGameData({steamId:cfg.identity,slots:{},languageId:0});
  assert.deepEqual(await game.getSlotList(),[0]);
  await game.writeToSlot({name:'native-put'},2);
  assert.equal((await game.readFromSlot(2)).name,'native-put');
  assert.equal(guard.snapshot().audit.physicalMutation,0);
 });
 await check('actual legacy conversion goes to memory',async()=>{
  const legacy=btoa(JSON.stringify({marker:'synthetic-legacy',stuff:[]}));
  await game.prepareSavedGameData({steamId:cfg.identity,save:legacy,languageId:0,steamAchievements:[]});
  assert.equal(game.saveSlots[0].stack[0].state.marker,'synthetic-legacy');
 });
 await check('native local newer slot wins over synthetic preload',async()=>{
  const row={...game.saveSlots[0],name:'local-newer',lastModified:500};
  await game.writeToSlot(row,0);
  await game.prepareSavedGameData({steamId:cfg.identity,slots:{0:{...row,name:'older',lastModified:100}}});
  assert.equal(game.saveSlots[0].name,'local-newer');
 });
 await check('native newer preload merges to memory',async()=>{
  const row={...game.saveSlots[0],name:'preload-newer',lastModified:600};
  await game.prepareSavedGameData({steamId:cfg.identity,slots:{0:row}});
  assert.equal((await game.readFromSlot(0)).name,'preload-newer');
 });
 await check('native wrong identity/version fails before prepare',async()=>{
  await assert.rejects(game.prepareSavedGameData({steamId:'wrong',slots:{}}),/IDENTITY/);
  game.version='1.2';await assert.rejects(game.prepareSavedGameData({steamId:cfg.identity,slots:{}}),/VERSION/);game.version='1.3';
 });
 await check('native transaction fault does not commit partial memory',async()=>{
  const before=guard.snapshot().memoryRows;guard.fault('transaction');
  await assert.rejects(game.writeToSlot({name:'bad'},99),/TRANSACTION_FAILURE/);
  guard.fault('');assert.deepEqual(guard.snapshot().memoryRows,before);
 });
 await check('high-risk promises resolve false without slot mutation',async()=>{
  const before=JSON.stringify(game.saveSlots);
  for(const name of ['reset','deleteSlot','shiftSlots','wipeSlot','addNewSlot','loadSaveFromClipboard','loadSaveFromSlotStack','exportSave'])assert.equal(await game[name](0),false);
  assert.equal(JSON.stringify(game.saveSlots),before);
 });
 await check('progress keys virtual; only isolated preference schema persists',()=>{
  fake.localStorage.setItem('abstractv03'+cfg.identity,'memory');
  assert.equal(guard.readDiskKey('abstractv03'+cfg.identity),null);
  fake.localStorage.setItem(guard.prefKey,JSON.stringify({mute:true,zoom:1}));
  assert.equal(JSON.parse(guard.readDiskKey(guard.prefKey)).mute,true);
  assert.throws(()=>fake.localStorage.setItem(guard.prefKey,JSON.stringify({state:'forbidden'})),/SCHEMA/);
  assert.throws(()=>fake.localStorage.clear(),/BLOCKED/);
 });
 guard.markReady(game);
 await check('local signaling create/join/refresh discards every service ICE server',async()=>{
  const c={safeTest:true,desktop13:true,localOnly:true,role:'host',testRoot:cfg.root,sessionId:'desktop13-001',signalingUrl:cfg.signalingUrl};
  const fetch=async(url,options)=>{assert.equal(options.redirect,'error');const value=url.endsWith('/turn')?{mode:'stun-turn',iceServers:[{urls:'turn:forbidden.invalid'}]}:{protocolVersion:2,role:'host',peerId:'host',roomCode:'ABCDEFGH',participantToken:'fake',resumeToken:'fake',iceServers:[{urls:'stun:forbidden.invalid'}]};return {ok:true,json:async()=>value};};
  const signal=signaling.create({protocol,config:c,context:guard,fetch,WebSocket:Socket});
  try{await signal.createRoom();assert.deepEqual(signal.getState().iceServers,[]);await signal.joinRoom('ABCDEFGH');assert.deepEqual(await signal.refreshIceServers(),[]);assert.equal(signal.getState().iceMode,'local-host-only');}finally{signal.close();}
 });
 await check('local transport never adopts services and empty list clears normal mode',()=>{
  const fakeSignal={getState:()=>({}),subscribe:fn=>{fn({});return ()=>{};},onSignal:()=>()=>{}};
  const local=transport.create({protocol,config:{localOnly:true,desktop13:true},context:guard,signaling:fakeSignal,RTCPeerConnection:PC});
  local.setIceServers([{urls:'stun:forbidden.invalid'}]);assert.equal(local.getState().iceServerCount,0);local.close();
  const normal=transport.create({protocol,config:{},signaling:fakeSignal,RTCPeerConnection:PC});
  assert.equal(normal.getState().iceServerCount,1);normal.setIceServers([]);assert.equal(normal.getState().iceServerCount,0);normal.close();
 });
 console.log('DESKTOP_13_UNIT_VERIFY='+checks+'/'+checks);
})().catch(e=>{console.error(e);process.exitCode=1;});
