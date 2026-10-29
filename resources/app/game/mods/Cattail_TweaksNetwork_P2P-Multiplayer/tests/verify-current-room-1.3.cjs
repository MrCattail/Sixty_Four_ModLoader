'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{EventEmitter}=require('events'),{PassThrough}=require('stream');
const dir=path.resolve(__dirname,'../tools/current-room-1.3'),controller=require(path.join(dir,'current-room.cjs')),fixtures=require(path.join(dir,'fixtures.cjs')),room=require(path.join(dir,'room-wire.js'));
const world=require('../tools/snapshot-1.3/snapshot-world.js'),codec=require('../tools/snapshot-1.3/snapshot-wire.js');
const {ROOT,write,read,pause}=controller,runId='1'.repeat(32);
function sample(sessionId='desktop13-snapshot-001'){return {format:world.FORMAT,sessionId,epoch:1,revision:1,sceneId:world.SCENE,resources:[128,0,64,0,0,0,0,0,0,0],entities:[{netId:1,name:'pump',position:[0,0],fields:{depth:0}},{netId:2,name:'conductor',position:[3,0],fields:{}},{netId:3,name:'silo',position:[6,0],fields:{fill:0,state:0}}]};}
function pair(options={}){
 const applied=[],timers=[];
 function local(role){return {state:()=>({ready:true,fatal:false}),capture:()=>sample(),apply:value=>applied.push(structuredClone(value)),setWire(){},setConnection(){},notice(){}};}
 const host=room.install({addEventListener(){}},fixtures.config('host','001','automated',runId),local('host'),codec,options),guest=room.install({addEventListener(){}},fixtures.config('guest','001','automated',runId),local('guest'),codec,options);
 function channel(){const events=new EventEmitter();return {label:room.LABEL,ordered:true,maxRetransmits:null,maxPacketLifeTime:null,readyState:'open',bufferedAmount:0,close(){this.readyState='closed';},addEventListener:(...args)=>events.on(...args),removeEventListener:(...args)=>events.off(...args)};}
 const left=channel(),right=channel();left.send=data=>setImmediate(()=>right.onmessage?.({data}));right.send=data=>setImmediate(()=>left.onmessage?.({data}));host.attach(left);guest.attach(right);
 function bind(){host.update({role:'host',roomCode:'ABCD2345',localPeerId:'host',remotePeerId:'guest-1',generation:0,primaryReady:true,direct:true});guest.update({role:'guest',roomCode:'ABCD2345',localPeerId:'guest-1',remotePeerId:'host',generation:0,primaryReady:true,direct:true});}
 return {host,guest,left,right,applied,timers,bind,close(){host.close();guest.close();}};
}
async function ready(p){p.bind();for(let i=0;i<10&&!p.host.state().open;i++)await pause(2);assert.equal(p.host.state().open,true);assert.equal(p.guest.state().open,true);}
function loaderContracts(){
 const names=['panel-search-recent-log-contract.test.js','panel-config-layout-contract.test.js'];
 let attempt=1;while(fs.existsSync(path.join(ROOT,'reports/loader-contracts',String(attempt).padStart(3,'0'))))attempt++;
 const output=path.join(ROOT,'reports/loader-contracts',String(attempt).padStart(3,'0'));
 return names.map(name=>{
  const file=path.join(ROOT,'runtime/resources/app/game/modloader/tools',name),env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
  const result=require('child_process').spawnSync(process.execPath,[file],{cwd:path.dirname(file),env,windowsHide:true,encoding:'utf8',timeout:30000});
  const report=path.join(output,name+'.json');write(report,{name,status:result.status===0&&!result.error?'PASS':'FAIL',exitCode:result.status,signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr});
  assert.equal(result.status,0,'copied Loader contract '+name+': '+result.stderr);assert.equal(result.signal,null);console.log('PASS copied Loader '+name);return {name,status:'PASS',report,sha256:controller.hash(report)};
 });
}
const loaderProofCode='('+async function(){
 const api=ModLoader,guard=CattailP2PEarlySession;const before=guard.snapshot(),rawSet=Storage.prototype.setItem,writes=[];
 Storage.prototype.setItem=function(key,value){const result=rawSet.call(this,key,value);writes.push(String(key));return result;};
 try{
  if(document.getElementById('modloader-panel'))document.querySelector('.modloader-panel-close').click();
  const blockedBefore=Snapshot13.world.state().blocked;
  const menuKey=repeat=>new KeyboardEvent('keydown',{key:'m',code:'KeyM',ctrlKey:true,bubbles:true,cancelable:true,repeat});
  const first=menuKey(false);document.dispatchEvent(first);
  if(!first.defaultPrevented)throw Error('MENU_KEY_NOT_CONSUMED');
  document.dispatchEvent(new KeyboardEvent('keyup',{key:'m',code:'KeyM',ctrlKey:true,bubbles:true,cancelable:true}));
  if(Snapshot13.world.state().blocked!==blockedBefore)throw Error('MENU_KEY_REACHED_WORLD');
  const panel=document.getElementById('modloader-panel');if(!panel)throw Error('CTRL_M_PANEL_MISSING');
  document.dispatchEvent(menuKey(true));if(!document.getElementById('modloader-panel'))throw Error('REPEAT_TOGGLED_MENU');
  document.dispatchEvent(menuKey(false));if(document.getElementById('modloader-panel'))throw Error('CTRL_M_CLOSE_FAILED');
  document.dispatchEvent(menuKey(false));
  const beforeOther=Snapshot13.world.state().blocked;document.dispatchEvent(new KeyboardEvent('keydown',{key:'M',code:'KeyM',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));if(Snapshot13.world.state().blocked<=beforeOther)throw Error('OTHER_COMBINATION_WAS_RELEASED');
  const activePanel=document.getElementById('modloader-panel'),input=activePanel.querySelector('.modloader-search-input');if(!input)throw Error('CURRENT_SEARCH_MISSING');
  input.value='P2P';input.dispatchEvent(new Event('input',{bubbles:true}));
  const results=activePanel.querySelectorAll('.modloader-search-result');if(!results.length||results.length>5)throw Error('CURRENT_SEARCH_RESULTS');
  const resultCount=results.length;results[0].click();
  const originalTheme=api.state.panelSettings.theme;document.querySelector('.modloader-panel-theme-toggle').click();
  const saved=JSON.parse(localStorage.getItem('modloader:panelState')||'{}');
  if(api.state.panelSettings.theme===originalTheme||saved.settings?.theme!==api.state.panelSettings.theme||!saved.configLayout)throw Error('CURRENT_PANEL_STATE_NOT_SAVED');
  document.querySelector('.modloader-panel-theme-toggle').click();
  const prefKey='abstractv03_preferences'+guard.config.identity,previous=localStorage.getItem(prefKey),pref=JSON.parse(previous||'{}');
  pref.mute=!pref.mute;localStorage.setItem(prefKey,JSON.stringify(pref));const preferenceSaved=JSON.parse(localStorage.getItem(prefKey)).mute===pref.mute;
  if(previous===null)localStorage.removeItem(prefKey);else localStorage.setItem(prefKey,previous);
  let unknownDenied=false;try{localStorage.setItem('current-baseline-unknown-key','x');}catch(error){unknownDenied=true;}
  const channel='modloader:tweaks-slot-store',sendDenied=DEBUG.spaceport.send(channel,{action:'begin'})===false,invokeDenied=await DEBUG.spaceport.invoke(channel,{action:'begin'})===false;
  const allowed=new Set(['modloader:panelState','modloader.statusCorner',prefKey]);const physicalKeys=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i));
  document.querySelector('.modloader-panel-close')?.click();
  const after=guard.snapshot();return {version:api.version,mods:api.state.mods.map(m=>({id:m.id,loaded:m.loaded})),ctrlM:true,keyConsumed:true,repeatIgnored:true,otherKeysStillBlocked:true,resultCount,panelSaved:writes.includes('modloader:panelState'),layoutSaved:!!saved.configLayout,themeRestored:api.state.panelSettings.theme===originalTheme,preferenceSaved,preferenceWrites:after.audit.allowedPreferenceWrites-before.audit.allowedPreferenceWrites,unknownDenied,unknownDelta:after.audit.unknownStorageDenied-before.audit.unknownStorageDenied,sendDenied,invokeDenied,backendInvokeDelta:(after.audit.ipcByChannel['invoke:'+channel]||0)-(before.audit.ipcByChannel['invoke:'+channel]||0),physicalKeysAllowed:physicalKeys.every(k=>allowed.has(k)),diskRows:(await guard.diskSnapshot()).length,errors:after.errors.length,physicalMutation:after.audit.physicalMutation};
 }finally{Storage.prototype.setItem=rawSet;document.querySelector('.modloader-panel-close')?.click();}
}.toString()+')()';
async function pure(){let count=0;async function check(name,run){await run();count++;console.log('PASS '+name);}
 await check('fixed identities and roots reject invalid input',()=>{assert.throws(()=>fixtures.config('third','001','automated',runId));assert.throws(()=>fixtures.config('host','../x','automated',runId));assert.throws(()=>fixtures.config('host','001','manual','bad'));assert.notEqual(fixtures.config('host','001','manual',runId).profile,fixtures.config('guest','001','manual',runId).profile);});
 await check('current baseline explicitly protects three parallel changes and 63 Loader inputs',()=>{controller.assertProtection();controller.assertPrepared();const b=read(path.join(ROOT,'baseline.json'));assert.equal(b.scope.length,14);assert.equal(b.sourceDrift.length,3);assert.equal(b.loaderInputs.length,63);assert.equal(b.loaderChanges.changed.length,17);assert.equal(b.loaderChanges.added.length,3);});
 await check('new runtime has exactly 448 programs and only the synthetic P2P consumer',()=>{const m=read(path.join(ROOT,'runtime-manifest.json'));assert.equal(m.files.length,448);assert.deepEqual(read(path.join(ROOT,'runtime/resources/app/game/mods/enabled.json')).mods,['Cattail_TweaksNetwork_P2P-Multiplayer']);for(const name of ['Cattail_TweaksQuality_Tweaks','Cattail_TweaksQuality_Better-UIs','Cattail_TweaksQuality_Dynamic-Details'])assert.equal(fs.existsSync(path.join(ROOT,'runtime/resources/app/game/mods',name)),false);assert.equal(fs.existsSync(path.join(ROOT,'runtime/resources/app/game/modloader/state/install-backups')),false);});
 await check('25B preload routes only Ctrl or Meta M without releasing keys to the world',()=>{
  const listeners={},context={window:{addEventListener(kind,fn){listeners[kind]=fn;}},document:{addEventListener(){}},require(name){if(name==='electron')return {ipcRenderer:{sendSync:()=>({})}};if(name==='./session-guard.cjs')return {install:()=>({noteError(){}})};throw Error('UNEXPECTED_PRELOAD_IMPORT');}};
  let toggles=0;context.window.ModLoader={togglePanel(){toggles++;}};require('vm').runInNewContext(fs.readFileSync(path.join(dir,'preload.cjs'),'utf8'),context);
  function event(kind,fields){let prevented=0,stopped=0;listeners[kind]({code:'KeyM',ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,repeat:false,preventDefault(){prevented++;},stopImmediatePropagation(){stopped++;},...fields});return {prevented,stopped};}
  assert.deepEqual(event('keydown',{}),{prevented:1,stopped:1});assert.equal(toggles,1);assert.deepEqual(event('keydown',{repeat:true}),{prevented:1,stopped:1});assert.equal(toggles,1);assert.deepEqual(event('keyup',{}),{prevented:1,stopped:1});assert.equal(toggles,1);
  assert.deepEqual(event('keydown',{ctrlKey:false,metaKey:true}),{prevented:1,stopped:1});assert.equal(toggles,2);
  for(const fields of [{ctrlKey:false},{code:'KeyE'},{code:'KeyQ'},{code:'KeyR'},{altKey:true},{shiftKey:true}])assert.deepEqual(event('keydown',fields),{prevented:0,stopped:0});assert.equal(toggles,2);
 });
 await check('early guard remains byte-identical to accepted single guest protection',()=>{assert.equal(controller.hash(path.join(dir,'session-guard.cjs')),controller.hash(path.join(dir,'../room-snapshot-1.3/session-guard.cjs')));});
 const binding={kind:'room-hello',runId,sessionId:'desktop13-snapshot-001',roomCode:'ABCD2345',hostPeerId:'host',guestPeerId:'guest-1',role:'guest',generation:0};
 for(const key of ['runId','sessionId','roomCode','hostPeerId','guestPeerId','generation'])await check('reject changed binding '+key,()=>assert.throws(()=>room.validateBinding({...binding,[key]:key==='generation'?1:'old'},{...binding,role:'host'}),/ROOM_BINDING/));
 await check('reject sender role and unknown control keys',()=>{assert.throws(()=>room.validateBinding(binding,binding),/ROOM_ROLE/);assert.throws(()=>room.validateBinding({...binding,extra:1},{...binding,role:'host'}),/ROOM_CONTROL_KEYS/);});
 await check('duplicate peer announcements create exactly one connection',async()=>{
  let made=0,signalCallback;const endpoint={label:room.LABEL,update(){},signal(){},attach(){},end(){},rejectChannel(){}};
  class Peer{constructor(){made++;this.connectionState='new';}createDataChannel(label){return {label,readyState:'connecting',close(){}};}async createOffer(){return {type:'offer',sdp:''};}async setLocalDescription(value){this.localDescription=value;}setConfiguration(){}close(){this.connectionState='closed';}}
  const protocol=require('../scripts/protocol.js'),signal={getState:()=>({roomCode:'ABCD2345',peerId:'host'}),onSignal(fn){signalCallback=fn;return ()=>{};},subscribe(fn){fn({socketOpen:true,iceServers:[],peers:[{role:'guest',peerId:'guest-1'}]});return ()=>{};},send(){}};
  const sandbox={window:{Snapshot13:{wire:endpoint}},module:{exports:{}},setTimeout,clearTimeout,console};require('vm').runInNewContext(fs.readFileSync(path.join(dir,'room-transport.js'),'utf8'),sandbox);
  const transport=sandbox.module.exports.create({protocol,signaling:signal,config:{role:'host',localOnly:true,desktop13:true},context:{validate:()=>true,assertReady(){},config:{runId}},RTCPeerConnection:Peer,getHandshake:()=>({})});
  try{signalCallback({type:protocol.SIGNAL_TYPES.PEER_JOINED,payload:{role:'guest',peerId:'guest-1'}});await pause(5);assert.equal(made,1);}finally{transport.close();}
 });
 await check('send requires a ready room and host role',async()=>{const p=pair();try{await assert.rejects(()=>p.host.send(),/ROOM_NOT_READY/);await assert.rejects(()=>p.guest.send(),/ROLE_DENIED/);}finally{p.close();}});
 await check('unknown or duplicate channel leaves the accepted channel intact',async()=>{const p=pair();try{const bad={...p.left,label:'unknown',close(){this.rejected=true;}};assert.equal(p.host.attach(bad),false);assert.equal(bad.rejected,true);assert.equal(p.host.attach({...bad,label:room.LABEL}),false);await ready(p);}finally{p.close();}});
 await check('bound room transfer matches original codec bytes and SHA ACK',async()=>{const p=pair();try{await ready(p);const sent=await p.host.send();await pause(20);assert.equal(sent.bytes,383);assert.equal(p.host.state().ack.sha256,sent.sha256);assert.equal(p.applied.length,1);assert.deepEqual(p.applied[0],sample());await assert.rejects(()=>p.host.send(),/SEND_ONCE/);}finally{p.close();}});
 await check('partial transfer and closed binding never apply later frames',async()=>{const p=pair();try{await ready(p);await p.host.testInvalid('partial');await pause(10);assert.equal(p.guest.state().receiver.pendingBytes,383);p.guest.end();assert.equal(p.guest.state().receiver.pendingBytes,0);assert.equal(p.applied.length,0);await assert.rejects(()=>p.guest.send(),/ROLE_DENIED/);}finally{p.close();}});
 await check('connection generation change ends the snapshot session',async()=>{const p=pair();try{await ready(p);p.host.update({role:'host',roomCode:'ABCD2345',localPeerId:'host',remotePeerId:'guest-1',generation:1,primaryReady:true,direct:true});assert.equal(p.host.state().terminal,'ROOM_BINDING_CHANGED');await assert.rejects(()=>p.host.send(),/ROOM_NOT_READY/);}finally{p.close();}});
 await check('loss of authenticated signaling closes a ready snapshot session',async()=>{const p=pair();try{await ready(p);p.host.signal({socketOpen:false,status:'closed'});assert.equal(p.host.state().terminal,'ROOM_SIGNAL_ENDED');}finally{p.close();}});
 await check('missing ACK has an active bounded timer',async()=>{const timers=[];const p=pair({setTimer(fn,ms){const token={fn,ms};timers.push(token);return token;},clearTimer(){}});try{await ready(p);p.right.send=()=>{};await p.host.send();await pause(10);const ackTimer=timers.find(t=>t.ms===10000);assert.ok(ackTimer);ackTimer.fn();assert.equal(p.host.state().lastError,'ACK_TIMEOUT');}finally{p.close();}});
 await check('backpressure has a bounded reject path',async()=>{const timers=[];const p=pair({setTimer(fn,ms){const token={fn,ms};timers.push(token);return token;},clearTimer(){}});try{await ready(p);p.left.bufferedAmount=40000;const sent=p.host.send();await pause(2);timers.at(-1).fn();await assert.rejects(()=>sent,/BACKPRESSURE_TIMEOUT/);}finally{p.close();}});
 await check('Receiver timeout clears a partial snapshot without applying',()=>{let expire,applied=0;const r=new codec.Receiver('desktop13-snapshot-001',()=>applied++,{setTimer(fn){expire=fn;return 1;},clearTimer(){}});r.accept(codec.frames(sample(),'desktop13-snapshot-001').frames[0]);expire();assert.equal(r.state().pendingBytes,0);assert.equal(r.state().lastRejection,'RECEIVE_TIMEOUT');assert.equal(applied,0);});
 await check('half startup disposes only its owned service and child',async()=>{
  let attempt=890;while(fs.existsSync(path.join(ROOT,'reports',String(attempt))))attempt++;if(attempt>899)throw Error('NO_MOCK_ATTEMPT');let calls=0,stops=0;
  await assert.rejects(()=>controller.start(String(attempt),'automated',{service:{portFree:async()=>{},start:async()=>({outbound:0,stop:async()=>stops++})},spawn(){if(++calls===2)throw Error('INJECTED_SPAWN_FAILURE');const child=new EventEmitter();Object.assign(child,{stdout:new PassThrough(),stderr:new PassThrough(),connected:true,exitCode:null,signalCode:null,pid:-1});child.send=message=>{if(message.method==='shutdown')setImmediate(()=>{child.emit('message',{id:message.id,result:true});child.exitCode=0;child.emit('exit',0,null);});};return child;}}),/INJECTED_SPAWN_FAILURE/);
  const cleanup=read(path.join(ROOT,'reports',String(attempt),'cleanup.json'));assert.equal(stops,1);assert.equal(cleanup.allExited,true);assert.equal(cleanup.serviceStopped,true);assert.equal(cleanup.forced,0);assert.deepEqual(cleanup.residual,[]);
 });
 return count;
}
const quitCode=proofFile=>'('+function(proofFile){
 const splash=DEBUG.splash;if(!splash.isShown)splash.show();const nodes=Array.from(splash.element.querySelectorAll('.menuItem')).filter(node=>node.textContent.trim()===splash.say('quit'));if(nodes.length!==1)throw Error('QUIT_BUTTON_NOT_FOUND');
 const guard=CattailP2PEarlySession,before=guard.snapshot(),space=DEBUG.spaceport,send=space.send;
 space.send=function(channel,...args){if(channel==='quit'){space.send=send;const after=guard.snapshot();require('fs').writeFileSync(proofFile,JSON.stringify({nativeButton:true,memoryBefore:before.saveResults.length,memoryAfter:after.saveResults.length,storeBefore:before.audit.ipcByChannel['invoke:store']||0,storeAfter:after.audit.ipcByChannel['invoke:store']||0,physicalMutation:after.audit.physicalMutation,errors:after.errors.length,quitDenied:after.audit.ipcByChannel['send:quit']||0}));}return send.call(this,channel,...args);};setTimeout(()=>nodes[0].click(),100);return true;
}.toString()+')('+JSON.stringify(proofFile)+')';
async function liveCase(attempt,index){const ctx=await controller.start(attempt);let result={attempt,case:index,status:'FAIL'},states,cleanup;
 try{
  states=await ctx.negotiate();
  if(index===7){
   const proof=path.join(ctx.dir,'guest-end-proof.json');await ctx.clients[1].call('evaluate',`window.addEventListener('beforeunload',()=>require('fs').writeFileSync(${JSON.stringify(proof)},JSON.stringify({world:Snapshot13.world.state(),wire:Snapshot13.wire.state()})),{once:true});true`);
   await ctx.clients[0].call('evaluate','Snapshot13.wire.testInvalid("partial")');await pause(100);states=await ctx.states();assert.equal(states.guest.world.entities,0);assert.equal(states.guest.wire.receiver.pendingBytes,383);
   await ctx.clients[0].call('evaluate',`(()=>{CattailP2PPhase2.openPage();const node=Array.from(document.querySelectorAll('button')).find(n=>n.textContent.trim()==='Close room connection');if(!node)throw Error('CLOSE_ROOM_BUTTON_MISSING');node.click();return true;})()`);
   cleanup=await ctx.stop();const ended=read(proof);assert.equal(ended.world.entities,0);assert.equal(ended.world.applied,false);assert.equal(ended.wire.receiver.pendingBytes,0);
  }else{
   if(index===2){
    const before=states.guest.world.worldDigest;for(const kind of ['binding','old-session','missing','checksum','unknown']){await ctx.clients[0].call('evaluate','Snapshot13.wire.testInvalid('+JSON.stringify(kind)+')');await pause(100);}
    states=await ctx.states();assert.equal(states.guest.world.applied,false);assert.equal(states.guest.world.worldDigest,before);assert.ok(states.guest.wire.rejectionCodes.includes('ROOM_BINDING'));
    for(const code of ['WIRE_CONTEXT','MISSING_CHUNKS','CHECKSUM_MISMATCH','UNSUPPORTED_ENTITY'])assert.ok(states.guest.wire.receiver.rejectionCodes.includes(code));
   }
   if(index===1){for(const client of ctx.clients)await client.call('probe');await pause(400);states=await ctx.states();const proof={};for(const client of ctx.clients){proof[client.role]=await client.call('evaluate',`CattailP2PPhase2.getAuditEntries().filter(row=>/^binary-probe-(sent|received|acknowledged)$/.test(row.type)).map(row=>({type:row.type,bytes:row.details.byteLength,checksum:row.details.checksum}))`);for(const type of ['binary-probe-sent','binary-probe-received','binary-probe-acknowledged'])assert.ok(proof[client.role].some(row=>row.type===type&&row.bytes===4096&&row.checksum===522263));}write(path.join(ctx.dir,'probe-proof.json'),proof);}
   await ctx.clients[0].call('evaluate','document.getElementById("snapshot13-send").click();true');states=await ctx.wait(value=>value.host.wire.ack&&value.guest.world.applied,10000);
   assert.equal(states.host.world.sha256,states.guest.world.sha256);assert.equal(states.host.wire.ack.bytes,383);assert.equal(states.host.wire.ack.sha256,states.guest.world.sha256);
   for(const role of ['host','guest']){controller.assertSafe(states[role],role,attempt,'automated',ctx.runId);assert.equal(states[role].world.entities,3);assert.equal(states[role].world.nativeTypes,true);assert.equal(states[role].p2p.transport.peers[0].sameConnectionChannels,true);}
   if(index===1){const before=states,started=Date.now();while(Date.now()-started<20500||Object.values(states).some(state=>state.guard.saveTimes.length<2)){await pause(500);states=await ctx.states();if(Date.now()-started>32000)throw Error('AUTOSAVE_PROOF_TIMEOUT');}for(const role of ['host','guest']){assert.equal(states[role].world.worldDigest,before[role].world.worldDigest);assert.ok(states[role].world.frames>before[role].world.frames+20);assert.ok(states[role].world.cycles>before[role].world.cycles);assert.ok(states[role].guard.saveTimes[1]-states[role].guard.saveTimes[0]>=9500);assert.ok(states[role].guard.audit.memoryPut>=2);}for(const client of ctx.clients)await client.call('screenshot','room-snapshot');}
   if(index===2){const before=states.guest.world.worldDigest;await ctx.clients[0].call('evaluate','Snapshot13.wire.testInvalid("duplicate")');await pause(100);states=await ctx.states();assert.equal(states.guest.world.worldDigest,before);assert.ok(states.guest.wire.receiver.rejectionCodes.includes('ALREADY_APPLIED'));}
   if(index===3){
    const loaderProof={};for(const client of ctx.clients){const proof=await client.call('evaluate',loaderProofCode);loaderProof[client.role]=proof;assert.equal(proof.version,'0.5.0');assert.equal(proof.mods.length,1);assert.equal(proof.mods[0].id,'cattail.p2p-multiplayer');assert.equal(proof.mods[0].loaded,true);assert.ok(proof.resultCount>0&&proof.resultCount<=5);for(const key of ['ctrlM','panelSaved','layoutSaved','themeRestored','preferenceSaved','unknownDenied','sendDenied','invokeDenied','physicalKeysAllowed'])assert.equal(proof[key],true,key);assert.ok(proof.preferenceWrites>=1);assert.equal(proof.unknownDelta,1);assert.equal(proof.backendInvokeDelta,1);assert.equal(proof.diskRows,0);assert.equal(proof.errors,0);assert.equal(proof.physicalMutation,0);const summary=await client.call('summary');assert.equal(summary.optionalBackendLoaded,false);}write(path.join(ctx.dir,'current-loader-proof.json'),loaderProof);
    const before=states;await ctx.clients[1].call('evaluate',`(()=>{const g=DEBUG;g.processE();g.processQ();g.processClick();g.addEntity('pump',[10,10]);g.clearCell([0,0]);g.relocate(g.stuff[0],[10,10]);g.simulateIdleTime(800000);g.updateGamepad(16);g.mouse.state=1;g.hoveredEntity=g.stuff.find(e=>e.name==='silo');g.processDown();g.processMove();g.processUp();g.hoveredEntity.refill();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));return true;})()`);
    await pause(250);await ctx.clients[1].call('evaluate',`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}));document.getElementById('snapshot13-menu').click();true`);states=await ctx.states();assert.notDeepEqual(states.guest.world.camera,before.guest.world.camera);assert.deepEqual(states.host.world.camera,before.host.world.camera);assert.equal(states.guest.world.menuOpen,true);assert.equal(states.host.world.menuOpen,false);assert.equal(states.guest.world.worldDigest,before.guest.world.worldDigest);
    const proof=await ctx.clients[1].call('evaluate',`(async()=>{const c=CattailP2PEarlySession,g=DEBUG;const raw=await c.testRawStoreWrite();let denied=0;for(const channel of ['save','store','achieve','updateStat','updateAccumulatedPlaytime','reset']){if(g.spaceport.send(channel,{})===false)denied++;if(await g.spaceport.invoke(channel,{})===false)denied++;}try{localStorage.setItem('outside-room-schema','x');}catch(e){denied++;}let network=0;for(const [url,kind]of [['https://example.invalid/','fetch'],['http://192.0.2.1:8787/','fetch'],['ws://127.0.0.1:8788/','ws'],['http://user@127.0.0.1:8787/','fetch']])try{c.allowUrl(url,kind);}catch(e){network++;}return {raw,denied,network};})()`);assert.deepEqual(proof,{raw:true,denied:13,network:4});await ctx.clients[1].call('evaluate',`document.getElementById('snapshot13-menu').click();true`);
   }
   if(index===4||index===5){const client=ctx.clients[index===4?0:1],file=path.join(ctx.dir,client.role+'-native-quit.json');await client.call('evaluate',quitCode(file));const end=Date.now()+8000;while(!fs.existsSync(file)&&Date.now()<end)await pause(50);const native=read(file);assert.ok(native.memoryAfter>native.memoryBefore);assert.ok(native.storeAfter>native.storeBefore);assert.equal(native.quitDenied,0);assert.equal(native.errors,0);assert.equal(native.physicalMutation,0);}
   if(index===6){await ctx.clients[1].call('reload').catch(()=>{});const end=Date.now()+8000;while(!ctx.clients[1].exited&&Date.now()<end)await pause(100);assert.equal(ctx.clients[1].lifecycle.reloading,true);assert.equal(ctx.clients[1].exited,true);}
   if(index===8){for(const client of ctx.clients)client.child.disconnect();const end=Date.now()+8000;while(ctx.clients.some(client=>!client.exited)&&Date.now()<end)await pause(100);assert.ok(ctx.clients.every(client=>client.exited));}
   if(index<4)states=await ctx.states();
  }
  for(const role of ['host','guest'])controller.assertSafe(states[role],role,attempt,'automated',ctx.runId);
  for(const client of ctx.clients)if(!client.exited&&!client.lifecycle.closing){const summary=await client.call('summary');assert.equal(summary.pathsConfined,true);for(const key of ['realCloudCalls','realSteamInitializations','externalCompleted'])assert.equal(summary.counters[key],0);}
  result={attempt,case:index,status:'PASS',instances:Object.fromEntries(Object.entries(states).map(([role,state])=>[role,controller.cleanStatus(state)]))};
 }catch(error){result.error=error.message;try{result.failureInstances=Object.fromEntries(Object.entries(await ctx.states()).map(([role,state])=>[role,controller.cleanStatus(state)]));}catch(ignored){}throw error;}
 finally{cleanup=await ctx.stop();result.cleanup=cleanup;write(path.join(ctx.dir,'automated-case.json'),result);}
 assert.equal(cleanup.ok,true);return result;
}
async function run(){const contracts=loaderContracts(),pureCount=await pure(),cases=[];
 if(process.argv.includes('--live')){for(let index=1;index<=8;index++){const attempt=String(Number(process.env.CURRENT_ROOM_CASE_START||1)+index-1).padStart(3,'0');console.log('START live '+attempt+' case '+index);const result=await liveCase(attempt,index);cases.push({attempt,case:index,status:'PASS',cleanup:result.cleanup});console.log('PASS live '+attempt+' case '+index);}controller.assertProtection();controller.assertPrepared();write(path.join(ROOT,'verification.json'),{approval:'24A',status:'AUTO_PASS',pureCount,loaderContracts:contracts,loaderContractCount:contracts.length,liveCount:cases.length,total:pureCount+contracts.length+cases.length,cases,playerFeedback:'PENDING'});}
 console.log('CURRENT_ROOM_VERIFY='+pureCount+' pure + '+contracts.length+' Loader + '+cases.length+' live');return {pureCount,cases};
}
module.exports={sample,pair,pure,liveCase,run};if(require.main===module)run().catch(error=>{console.error(error.stack);write(path.join(ROOT,'reports/verification-failures',Date.now()+'.json'),{approval:'24A',status:'FAIL',error:error.message,stack:error.stack});process.exitCode=1;});
