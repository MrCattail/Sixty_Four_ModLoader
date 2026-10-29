'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),Module=require('module'),{EventEmitter}=require('events');
const tool=path.resolve(__dirname,'../tools/desktop-1.3');process.env.CATTAIL_P2P_TOOL_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-four13-20261027');
const fixtures=require(path.join(tool,'fixtures.cjs')),four=require(path.join(tool,'four.cjs')),IDS=fixtures.FOUR_INSTANCES,ROOT=fixtures.ROOT;
let checks=0;const cases=[];
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,predicate,ms=30000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(predicate(value))return value;await pause(250);}throw Error('FOUR_TEST_CONDITION_TIMEOUT');}
const mapping={host:'host',guest1:'guest-1',guest2:'guest-2',guest3:'guest-3'};
function receipts(){return Object.fromEntries(IDS.map(id=>[id,Object.fromEntries((id==='host'?Object.values(mapping).slice(1):['host']).map(peer=>[peer,{sent:1,received:1,acknowledged:1}]))]));}
function states(attempt='999'){
 return IDS.map((id,i)=>{const cfg=fixtures.config(i?'guest':'host',attempt,'manual',id);return {instance:id,identity:cfg.identity,profile:cfg.profile,generation:1,visible:true,game:{version:'1.3'},disk:[],guard:{ready:true,audit:{physicalMutation:0},errors:[],saveTimes:[0,10000],saveResults:['memory-committed','memory-committed'],ticks:20,frames:20},p2p:{ready:true,signaling:{peerId:mapping[id],iceServers:[],status:'signaling-ready',socketOpen:true},transport:{iceServerCount:0,peers:(id==='host'?Object.values(mapping).slice(1):['host']).map(peerId=>({peerId,channelOpen:true,sameMachine:true,connectionPath:'direct',localCandidateType:'host',remoteCandidateType:'host',remoteHandshake:{gameVersion:'1.3'}}))}}};});
}
function guardFixture(id,overrides={}){
 class Storage{constructor(){this.values=new Map();}getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}clear(){this.values.clear();}}
 class Store{put(){}add(){}delete(){}clear(){}}class Database{transaction(){}}
 const isolated={exports:{}},sent=[],invoked=[];
 const requireLocal=name=>['http','https','net','tls','dgram'].includes(name)?{}:name==='./fixtures.cjs'?fixtures:require(name);
 vm.runInNewContext(fs.readFileSync(path.join(tool,'session-guard.cjs'),'utf8'),{module:isolated,require:requireLocal,structuredClone,URL,setTimeout});
 const ipc={send(...args){sent.push(args);return true;},invoke:async(...args)=>{invoked.push(args);return true;},sendSync(){}};
 const fake={indexedDB:{open(){},deleteDatabase(){}},IDBDatabase:Database,IDBObjectStore:Store,Storage,localStorage:new Storage(),navigator:{},location:{href:'file:///'+ROOT.replaceAll('\\','/')+'/runtime/resources/app/game/index.html'},fetch:async()=>({}),WebSocket:class{},XMLHttpRequest:class{open(){}},Worker:class{},RTCPeerConnection:class{}};
 const cfg={...fixtures.config(id==='host'?'host':'guest','999','manual',id),...overrides};
 return {guard:isolated.exports.install(fake,cfg,ipc),ipc,sent,invoked,fake};
}
function mainFixture(instance='guest1',role='guest',envInstance=instance){
 const proc=new EventEmitter(),app=new EventEmitter(),ipcMain=new EventEmitter(),exits=[],writes=[];let quits=0,closes=0,destroyed=false;
 Object.assign(proc,{pid:1,argv:['electron','--p2p-role='+role,'--attempt=999','--p2p-mode=manual','--p2p-instance='+instance],versions:process.versions,connected:true,send(){},env:{CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:role,CATTAIL_P2P_INSTANCE:envInstance,CATTAIL_P2P_SESSION:'desktop13-four-999',CATTAIL_P2P_TEST_ROOT:ROOT}});
 Object.assign(app,{setPath(){},setAppLogsPath(){},disableHardwareAcceleration(){},commandLine:{appendSwitch(){}},whenReady:()=>new Promise(()=>{}),exit(code){exits.push(code);},quit(){quits++;}});ipcMain.handle=()=>{};
 const requireLocal=name=>name==='electron'?{app,ipcMain}:name==='./fixtures.cjs'?fixtures:name==='./game/modloader/main-process.js'?{configureSaveCloud(){},configureMainWindowHost(){}}:name==='os'?{networkInterfaces:()=>({})}:name==='fs'?{mkdirSync(){},writeFileSync(file,value){writes.push({file,value:JSON.parse(value)});}}:require(name);
 const context=vm.createContext({require:requireLocal,__dirname:path.join(ROOT,'runtime/resources/app'),process:proc,console,setTimeout(){return {unref(){}};}});vm.runInContext(fs.readFileSync(path.join(tool,'main.cjs'),'utf8'),context);
 const win={isDestroyed:()=>destroyed,webContents:{isDestroyed:()=>destroyed},close(){destroyed=true;closes++;}};
 return {exits,writes,proc,win,get quits(){return quits;},get closes(){return closes;},attach(){context.testWindow=win;vm.runInContext('win=testWindow',context);},quit(sender){ipcMain.emit('quit',{sender});}};
}
function clockFixture(settings={}){
 let now=0,stops=0;const times=[],writes=new Map(),snapshot=states(),clients=[];class ClockDate extends Date{static now(){return now;}}
 for(let i=0;i<4;i++)clients.push({instance:IDS[i],role:i?'guest':'host',exited:false,child:{connected:true},lifecycle:{},async call(method,value){
  if(method==='status'){times.push(now);if(settings.closeAfterMs!==undefined&&now>=settings.closeAfterMs)clients[0].lifecycle.closed=true;const state=structuredClone(snapshot[i]);if(settings.notReady)state.guard.ready=false;if(settings.noConnection)state.p2p.transport.peers=[];return state;}
  if(method==='create')return 'ABCDEFGH';if(method==='summary')return {pathsConfined:true,officialMainLoaded:false,counters:{},resources:{mainRssBytes:1,processes:[]}};
  if(method==='evaluate'&&value==='CattailP2PPhase2.getAuditEntries().length')return 0;
  if(method==='evaluate'&&value.includes('.slice(offset)'))return {};
  if(method==='evaluate'&&value.includes('signaling-reconnect-exhausted'))return 0;return true;
 }});
 const session={clients,dir:path.join(ROOT,'reports/clock-fixture'),async stop(){stops++;return {ok:true,allExited:true,forced:0,residual:[],exitCodes:IDS.map(id=>({instance:id,code:0,signal:null}))};}};
 const filename=path.join(tool,'four.cjs'),isolated={exports:{}},actualRequire=Module.createRequire(filename),proc=new EventEmitter();Object.assign(proc,{pid:1,env:{...process.env}});
 const placeholders=[path.join(ROOT,'verification.json'),path.join(ROOT,'regressions.json')],bytes=file=>placeholders.includes(path.resolve(file))?Buffer.from('{}'):fs.readFileSync(file);
 const ready={status:'READY',approval:'15A',hashes:Object.fromEntries(four.launchInputs().map(file=>[file,require('crypto').createHash('sha256').update(bytes(file)).digest('hex')]))};
 const fakeFs={...fs,statSync(file){return String(file).endsWith('-audit.jsonl')?{size:0}:fs.statSync(file);},openSync(file,...args){return String(file).endsWith('-audit.jsonl')?1000000:fs.openSync(file,...args);},fstatSync(fd){return fd===1000000?{size:0}:fs.fstatSync(fd);},closeSync(fd){if(fd!==1000000)fs.closeSync(fd);},existsSync(file){if(path.resolve(file)===path.join(ROOT,'active-controller.json'))return false;return fs.existsSync(file);},readFileSync(file,...args){if(path.resolve(file)===path.join(ROOT,'acceptance-gate.json'))return JSON.stringify(ready);if(placeholders.includes(path.resolve(file)))return args[0]==='utf8'?'{}':Buffer.from('{}');return fs.readFileSync(file,...args);},mkdirSync(){},writeFileSync(file,value){writes.set(file,JSON.parse(value));},rmSync(){}};
 const requireLocal=name=>name==='fs'?fakeFs:name==='./start.cjs'?{start:async()=>session}:name==='./signaling-local.cjs'?{portFree:async()=>{}}:actualRequire(name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:isolated,require:requireLocal,__dirname:tool,process:proc,Date:ClockDate,Buffer,console:{log(){}},setTimeout(fn,ms){now+=ms===500?(settings.stepMs||900001):ms;queueMicrotask(fn);}});
 return {run:()=>isolated.exports.run('999',{uiCheck:!!settings.uiCheck}),times,get stops(){return stops;}};
}
function nativeQuit(proofFile){
 const splash=DEBUG.splash,back=splash.element.querySelector('.cattail-p2p-phase2-back');if(back)back.click();if(!splash.isShown)splash.show();
 const nodes=Array.from(splash.element.querySelectorAll('.menuItem')).filter(node=>node.textContent.trim()===splash.say('quit'));if(nodes.length!==1||!nodes[0].getClientRects().length)throw Error('FOUR_NATIVE_QUIT_NOT_VISIBLE');
 const guard=CattailP2PEarlySession,before=guard.snapshot(),space=DEBUG.spaceport,send=space.send;
 space.send=function(channel,...args){if(channel==='quit'){space.send=send;const after=guard.snapshot();require('fs').writeFileSync(proofFile,JSON.stringify({nativeButton:true,memoryBefore:before.saveResults.length,memoryAfter:after.saveResults.length,storeBefore:before.audit.ipcByChannel['invoke:store']||0,storeAfter:after.audit.ipcByChannel['invoke:store']||0,physicalMutation:after.audit.physicalMutation,errors:after.errors.length,quitDenied:after.audit.ipcByChannel['send:quit']||0}));}return send.call(this,channel,...args);};
 setTimeout(()=>nodes[0].click(),150);return true;
}
async function probeEpoch(session,report){const epoch=report.epoch;for(const client of session.clients)await client.call('probe');await until(async()=>report.epochs.find(row=>row.epoch===epoch)?.probesComplete,Boolean);}
async function memoryStatus(client){return client.call('evaluate',"(()=>{const s=CattailP2PEarlySession;return {has77:s.snapshot().memoryRows.some(row=>row.key[1]===77),camera:DEBUG.translation,zoom:DEBUG.zoom,preferenceZoom:JSON.parse(s.readDiskKey(s.prefKey)).zoom};})()");}
(async()=>{
 await check('fixed four root and four distinct synthetic identities and profiles',()=>{
  assert.equal(fixtures.selectRoot(ROOT),fixtures.FOUR_ROOT);const configs=IDS.map((id,i)=>fixtures.config(i?'guest':'host','001','manual',id));assert.equal(new Set(configs.map(cfg=>cfg.identity)).size,4);assert.equal(new Set(configs.map(cfg=>cfg.profile)).size,4);assert.ok(configs.every(cfg=>fixtures.inside(ROOT,cfg.profile)&&cfg.sessionId==='desktop13-four-001'));
 });
 await check('missing fifth wrong-role traversal and bad-mode instances reject',()=>{
  for(const id of [undefined,'guest4','../guest1','host'])assert.throws(()=>fixtures.config('guest','001','manual',id),/INSTANCE/);
  assert.throws(()=>fixtures.config('host','../','manual','host'),/ATTEMPT/);assert.throws(()=>fixtures.config('host','001','bad','host'),/MODE/);assert.throws(()=>fixtures.selectRoot('C:/outside'),/ROOT/);
 });
 await check('four guards bind identity profile and session before use',()=>{
  for(const id of IDS){assert.equal(guardFixture(id).guard.validate({role:id==='host'?'host':'guest',sessionId:'desktop13-four-999'}),true);}
  assert.throws(()=>guardFixture('guest1',{identity:'P2P_SYNTHETIC_FOUR_GUEST2_13'}),/IDENTITY/);assert.throws(()=>guardFixture('guest1',{profile:'C:/outside'}),/CONTEXT/);assert.throws(()=>guardFixture('guest1',{sessionId:'desktop13-999'}),/CONTEXT/);
 });
 await check('all four native Quit permissions preserve every denied write channel',async()=>{
  for(const id of IDS){const f=guardFixture(id);assert.equal(f.ipc.send('quit',''),true);for(const channel of ['store','save','achieve','updateStat','updateAccumulatedPlaytime','reset']){assert.equal(f.ipc.send(channel,{}),false);assert.equal(await f.ipc.invoke(channel,{}),false);}assert.equal(f.sent.length,1);assert.equal(f.invoked.length,0);assert.equal(f.guard.snapshot().audit.physicalMutation,0);}
  const auto=guardFixture('guest1',{mode:'automated'});assert.equal(auto.ipc.send('quit',''),false);
 });
 await check('four preference stores and memory progress cannot share physical storage',()=>{
  const all=IDS.map(id=>guardFixture(id));all.forEach((f,i)=>{f.fake.localStorage.setItem(f.guard.prefKey,JSON.stringify({zoom:1+i/10}));f.fake.localStorage.setItem('abstractv03'+'P2P_SYNTHETIC_FOUR_'+IDS[i].toUpperCase()+'_13','synthetic');assert.equal(f.guard.snapshot().audit.physicalMutation,0);});assert.equal(new Set(all.map(f=>f.guard.prefKey)).size,4);all.forEach((f,i)=>assert.equal(JSON.parse(f.guard.readDiskKey(f.guard.prefKey)).zoom,1+i/10));
 });
 await check('invalid native instance role or environment refuses launch before a window',()=>{
  for(const args of [['guest4','guest','guest4'],['guest1','host','guest1'],['guest1','guest','guest2']]){const f=mainFixture(...args);assert.equal(f.exits[0],2);assert.equal(f.writes[0].value.browserCreated,false);assert.ok(f.writes[0].file.startsWith(ROOT));}
 });
 await check('four native own-window Quit closes once; foreign sender stays denied',()=>{
  const f=mainFixture();f.attach();f.quit({});assert.equal(f.quits,0);f.quit(f.win.webContents);f.proc.emit('disconnect');assert.equal(f.quits,1);assert.equal(f.closes,1);
 });
 await check('partial four-process launch failure closes the started client and service',async()=>{
  const isolated={exports:{}},writes=[];let spawned=0,serviceStops=0;
  const fakeFs={existsSync:()=>false,readdirSync:()=>[],mkdirSync(){},writeFileSync(file,value){writes.push({file,value:JSON.parse(value)});},createWriteStream:()=>({end(){}})};
  const service={portFree:async()=>{},start:async()=>({stop:async()=>{serviceStops++;}})};
  const requireLocal=name=>name==='fs'?fakeFs:name==='./fixtures.cjs'?fixtures:name==='./signaling-local.cjs'?service:require(name);
  vm.runInNewContext(fs.readFileSync(path.join(tool,'start.cjs'),'utf8'),{module:isolated,require:requireLocal,__dirname:tool,process:{env:{}},setTimeout,clearTimeout,Date});
  const spawn=()=>{if(++spawned===2)throw Error('INJECTED_PARTIAL_START');const child=new EventEmitter();Object.assign(child,{pid:123,connected:true,exitCode:null,signalCode:null,stdout:{pipe(){}},stderr:{pipe(){}},send(message,done){done?.();queueMicrotask(()=>{child.emit('message',{id:message.id,result:true});if(message.method==='shutdown'){child.exitCode=0;child.emit('exit',0,null);}});}});return child;};
  await assert.rejects(isolated.exports.start(process.cwd(),'998',{mode:'manual',uiCheck:true,instances:IDS,spawn}),/INJECTED/);assert.equal(serviceStops,1);assert.equal(writes.find(row=>row.file.endsWith('cleanup.json')).value.ok,true);
 });
 await check('duplicate and fifth process lists reject before service startup',async()=>{
  const start=require(path.join(tool,'start.cjs')).start;for(const instances of [['host','guest1','guest1','guest3'],[...IDS,'guest4'],undefined])await assert.rejects(start(process.cwd(),'997',{mode:'manual',instances}),/EXACT_FOUR/);assert.equal(fs.existsSync(path.join(ROOT,'reports/997')),false);
 });
 await check('six directed receipts require every peer ACK and reject extra peers',()=>{
  assert.equal(four.receiptComplete(receipts(),mapping),true);const missing=receipts();missing.host['guest-3'].acknowledged=0;assert.equal(four.receiptComplete(missing,mapping),false);const extra=receipts();extra.guest1['guest-2']={sent:1,received:1,acknowledged:1};assert.equal(four.receiptComplete(extra,mapping),false);assert.equal(four.receiptComplete(receipts(),{...mapping,guest2:'guest-1'}),false);
 });
 await check('epoch offsets discard old ACKs and wrong checksums',()=>{
  const rows=['sent','received','acknowledged'].map(kind=>({type:'binary-probe-'+kind,details:{peerId:'host',byteLength:4096,checksum:522263}}));
  const run=offset=>vm.runInNewContext(four.probeQuery(offset),{CattailP2PPhase2:{getAuditEntries:()=>rows}});
  assert.equal(run(0).host.acknowledged,1);assert.equal(Object.keys(run(3)).length,0);rows.push({type:'binary-probe-acknowledged',details:{peerId:'host',byteLength:4096,checksum:1}});assert.equal(Object.keys(run(3)).length,0);
 });
 await check('file cursors survive a full rolling audit and preserve split UTF8 lines',()=>{
  fs.mkdirSync(path.join(ROOT,'temp'),{recursive:true});const dir=fs.mkdtempSync(path.join(ROOT,'temp/probe-cursor-')),file=path.join(dir,'synthetic-audit.jsonl');
  const row=kind=>JSON.stringify({type:'binary-probe-'+kind,details:{peerId:'host',byteLength:4096,checksum:522263,note:'测试'}})+'\n';
  fs.writeFileSync(file,Array.from({length:1000},()=>row('acknowledged')).join(''));const cursor=four.probeCursor(file);assert.equal(Object.keys(four.readProbeDelta(file,cursor)).length,0);
  fs.appendFileSync(file,row('sent')+row('received'));const ack=Buffer.from(row('acknowledged')),cut=ack.indexOf(Buffer.from('测'))+1;fs.appendFileSync(file,ack.subarray(0,cut));assert.equal(four.readProbeDelta(file,cursor).host.acknowledged,0);
  fs.appendFileSync(file,ack.subarray(cut));const proof=four.readProbeDelta(file,cursor);assert.equal(proof.host.sent,1);assert.equal(proof.host.received,1);assert.equal(proof.host.acknowledged,1);assert.equal(four.readProbeDelta(file,cursor).host.acknowledged,1);
 });
 await check('star readiness rejects missing links guest-to-guest paths and relay',()=>{
  assert.equal(four.topologyReady(states(),mapping),true);for(const mutate of [s=>s[0].p2p.transport.peers.pop(),s=>s[1].p2p.transport.peers[0].peerId='guest-2',s=>s[2].p2p.transport.peers[0].connectionPath='relay']){const s=states();mutate(s);assert.equal(four.topologyReady(s,mapping),false);}
 });
 await check('isolation checks reject physical progress shared identities wrong profiles and ICE',()=>{
  four.assertIsolation(states(),'999');for(const mutate of [s=>s[1].identity=s[2].identity,s=>s[2].profile='C:/outside',s=>s[3].guard.audit.physicalMutation=1,s=>s[1].p2p.signaling.iceServers=[{urls:'stun:invalid'}]]){const s=states();mutate(s);assert.throws(()=>four.assertIsolation(s,'999'),/ISOLATION/);}
 });
 await check('preparation refuses overwrite and visible entry fails closed before READY',async()=>{
  const before=fs.statSync(path.join(ROOT,'runtime-manifest.json')).mtimeMs;assert.throws(()=>four.prepare(),/RUNTIME_EXISTS/);assert.equal(fs.statSync(path.join(ROOT,'runtime-manifest.json')).mtimeMs,before);
  const filename=path.join(tool,'four.cjs'),isolated=new Module(filename,module),gate=path.join(ROOT,'acceptance-gate.json');isolated.filename=filename;isolated.paths=Module._nodeModulePaths(tool);const actual=isolated.require.bind(isolated);
  isolated.require=name=>name==='fs'?{...fs,readFileSync(file,...args){if(path.resolve(file)===gate)return JSON.stringify({status:'BLOCKED_TEST_FIXTURE',approval:'15A'});return fs.readFileSync(file,...args);}}:actual(name);isolated._compile(fs.readFileSync(filename,'utf8'),filename);
  await assert.rejects(isolated.exports.run('996'),/GATE/);assert.equal(fs.existsSync(path.join(ROOT,'reports/996')),false);
 });
 await check('manual four-controller crosses fifteen minutes and waits for close',async()=>{
  const f=clockFixture({closeAfterMs:1800000}),report=await f.run();assert.equal(report.timeLimitMs,null);assert.equal(report.status,'CLOSED_PENDING_PLAYER_FEEDBACK');assert.ok(f.times.some(time=>time>900000));assert.equal(f.stops,1);
 });
 await check('automatic four-controller retains its finite deadline',async()=>{
  const f=clockFixture({uiCheck:true,stepMs:180001}),report=await f.run();assert.equal(report.status,'FAIL');assert.equal(report.error,'FOUR_AUTOMATIC_TIMEOUT');assert.equal(f.stops,1);
 });
 await check('startup and connection deadlines survive unbounded manual mode',async()=>{
  for(const [settings,error]of [[{notReady:true,stepMs:90001},'FOUR_STARTUP_TIMEOUT'],[{noConnection:true,stepMs:30001},'FOUR_CONNECTION_TIMEOUT']]){const f=clockFixture(settings),report=await f.run();assert.equal(report.error,error);assert.equal(f.stops,1);}
 });
 if(process.argv.includes('--live')){
  const base=Number(process.argv.find(arg=>arg.startsWith('--base='))?.slice(7)||1);if(!Number.isInteger(base)||base<1||base>995)throw Error('INVALID_LIVE_BASE');
  const attempt=n=>String(base+n).padStart(3,'0');
  await check('four actual games keep memory isolated through Guest and Host whole-room reloads',async()=>{
   let started=false,work,proof={};
   const report=await four.run(attempt(0),{uiCheck:true,onReady:({session,report,stop})=>{
    if(started)return;started=true;work=(async()=>{
     for(const client of session.clients){const state=await until(()=>client.call('status'),s=>s.guard.saveTimes.length>=2);assert.ok(state.game.entities>0&&state.game.images>0&&state.game.store);assert.ok(state.guard.ticks>10&&state.guard.frames>10);assert.ok(state.guard.saveTimes[1]-state.guard.saveTimes[0]>=9500);assert.ok(state.guard.saveResults.every(row=>row==='memory-committed'));}
     for(let i=0;i<4;i++)await session.clients[i].call('evaluate',"(async()=>{DEBUG.translation="+JSON.stringify([i*31,i*47])+";DEBUG.zoom="+(1+i/10)+";DEBUG.savePreferences();await DEBUG.writeToSlot({synthetic:true,marker:"+JSON.stringify(IDS[i])+"},77);return true;})()");
     let before=await Promise.all(session.clients.map(memoryStatus));assert.ok(before.every(row=>row.has77));assert.equal(new Set(before.map(row=>row.preferenceZoom)).size,4);await probeEpoch(session,report);
     let next=report.epoch+1;await session.clients[1].call('reload');await until(async()=>report.epoch>=next&&report.connected,Boolean);await probeEpoch(session,report);
     let after=await Promise.all(session.clients.map(memoryStatus));assert.equal(after[1].has77,false);for(const i of [0,2,3])assert.deepEqual(after[i],before[i]);assert.equal(after[1].preferenceZoom,before[1].preferenceZoom);
     proof.guestReload={epoch:report.epoch,otherWindowsRetained:true,reloadedMemoryDropped:true,preferencesKept:true};before=after;
     next=report.epoch+1;await session.clients[0].call('reload');await until(async()=>report.epoch>=next&&report.connected,Boolean);await probeEpoch(session,report);
     after=await Promise.all(session.clients.map(memoryStatus));assert.equal(after[0].has77,false);for(const i of [1,2,3])assert.deepEqual(after[i],before[i]);assert.equal(after[0].preferenceZoom,before[0].preferenceZoom);
     proof.hostReload={epoch:report.epoch,otherWindowsRetained:true,reloadedMemoryDropped:true,preferencesKept:true};fs.writeFileSync(path.join(session.dir,'independence-proof.json'),JSON.stringify(proof,null,2));stop();
    })();return work;
   }});await work;assert.equal(report.status,'AUTOMATED_COMPLETE');assert.equal(report.epochs.length,3);assert.ok(report.epochs.every(epoch=>epoch.probesComplete));assert.equal(report.cleanup.ok,true);assert.equal(report.cleanup.port8787Released,true);cases.push({attempt:attempt(0),status:'PASS',cleanup:report.cleanup});
  });
  for(const [index,id]of ['guest3','host'].entries())await check('actual '+id+' native Quit saves only to memory and normally ends four windows',async()=>{
   let started=false,work;const name=attempt(index+1),proofFile=path.join(ROOT,'reports',name,id+'-native-quit.json');
   const report=await four.run(name,{uiCheck:true,onReady:({session})=>{if(started)return;started=true;work=session.clients.find(client=>client.instance===id).call('evaluate','('+nativeQuit.toString()+')('+JSON.stringify(proofFile)+')');return work;}});await work;
   assert.equal(report.status,'CLOSED_PENDING_PLAYER_FEEDBACK');const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));assert.ok(proof.memoryAfter>proof.memoryBefore);assert.ok(proof.storeAfter>proof.storeBefore);assert.equal(proof.physicalMutation,0);assert.equal(proof.quitDenied,0);assert.equal(proof.errors,0);assert.equal(report.cleanup.ok,true);assert.equal(report.cleanup.port8787Released,true);assert.equal(report.cleanup.exitCodes.length,4);cases.push({attempt:name,status:'PASS',cleanup:report.cleanup});
  });
  await check('all four native windows close cleanly on parent IPC disconnection',async()=>{
   let done=false;const name=attempt(3),report=await four.run(name,{uiCheck:true,onReady:({session})=>{if(done)return;done=true;for(const client of session.clients)client.child.disconnect();}});assert.equal(report.status,'CLOSED_PENDING_PLAYER_FEEDBACK');assert.equal(report.cleanup.ok,true);assert.equal(report.cleanup.port8787Released,true);assert.equal(report.cleanup.exitCodes.length,4);cases.push({attempt:name,status:'PASS',cleanup:report.cleanup});
  });
  fs.writeFileSync(path.join(ROOT,'verification.json'),JSON.stringify({status:'AUTO_PASS',checks,cases,manualFeedback:'PENDING'},null,2));
 }
 console.log('FOUR_13_VERIFY='+checks+'/'+checks);
})().catch(error=>{if(process.argv.includes('--live'))fs.writeFileSync(path.join(ROOT,'verification.json'),JSON.stringify({status:'FAIL',checks,cases,error:error.message},null,2));console.error(error.stack);process.exitCode=1;});
