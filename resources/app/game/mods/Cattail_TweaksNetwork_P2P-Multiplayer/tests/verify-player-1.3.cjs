'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),cp=require('child_process'),Module=require('module'),vm=require('vm'),crypto=require('crypto'),{EventEmitter}=require('events');
const tools=path.resolve(__dirname,'../tools/desktop-1.3');
process.env.CATTAIL_P2P_TOOL_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-player13-20261027');
const fixtures=require(path.join(tools,'fixtures.cjs')),player=require(path.join(tools,'player.cjs')),{clientFor}=require(path.join(tools,'start.cjs'));
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,predicate,timeout=60000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){const value=await fn();if(predicate(value))return value;await delay(250);}
 throw Error('PLAYER_TEST_CONDITION_TIMEOUT');
}
function fakeChild(){const child=new EventEmitter();Object.assign(child,{connected:true,exitCode:null,signalCode:null,sent:[],send(message,callback){this.sent.push(message);callback?.();}});return child;}
function mainTimerFixture(mode){
 const proc=new EventEmitter(),app=new EventEmitter(),ipcMain=new EventEmitter(),timers=[],exits=[];let quits=0,closes=0,destroyed=false;
 Object.assign(proc,{argv:['electron','--p2p-role=host','--attempt=999','--p2p-mode='+mode],connected:true,send(){},versions:process.versions,env:{CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:'host',CATTAIL_P2P_SESSION:'desktop13-999',CATTAIL_P2P_TEST_ROOT:fixtures.ROOT}});
 Object.assign(app,{setPath(){},setAppLogsPath(){},disableHardwareAcceleration(){},commandLine:{appendSwitch(){}},whenReady:()=>new Promise(()=>{}),exit(code){exits.push(code);},quit(){quits++;}});
 const bridge={configureSaveCloud(){},configureMainWindowHost(){}};
 ipcMain.handle=()=>{};
 const requireLocal=name=>name==='electron'?{app,ipcMain}:name==='./fixtures.cjs'?fixtures:name==='./game/modloader/main-process.js'?bridge:name==='os'?{networkInterfaces:()=>({})}:name==='fs'?{mkdirSync(){},writeFileSync(){throw Error('UNEXPECTED_MAIN_FIXTURE_WRITE');}}:require(name);
 const context=vm.createContext({require:requireLocal,__dirname:path.join(fixtures.ROOT,'runtime/resources/app'),process:proc,console,setTimeout(fn,ms){const timer={fn,ms,done:false,unref(){}};timers.push(timer);return timer;}});
 vm.runInContext(fs.readFileSync(path.join(tools,'main.cjs'),'utf8'),context);
 const ownedWindow={isDestroyed:()=>destroyed,webContents:{isDestroyed:()=>destroyed},close(){closes++;destroyed=true;}};
 return {proc,timers,exits,ownedWindow,get quits(){return quits;},get closes(){return closes;},get denied(){return vm.runInContext('counters.mainDenied',context);},attachWindow(){context.fixtureWindow=ownedWindow;vm.runInContext('win=fixtureWindow',context);},destroyWindow(){destroyed=true;},quit(sender){ipcMain.emit('quit',{sender});},advance(ms){for(const timer of timers)if(!timer.done&&timer.ms<=ms){timer.done=true;timer.fn();}}};
}
function guardIpcFixture(mode,legacy=false){
 class Storage{getItem(){return null;}setItem(){}removeItem(){}clear(){}}
 class Store{put(){}add(){}delete(){}clear(){}}
 class Database{transaction(){}}
 const selected={...fixtures,ROOT:legacy?fixtures.LEGACY_ROOT:fixtures.ROOT},sent=[],invoked=[],isolated={exports:{}};
 const requireLocal=name=>name==='./fixtures.cjs'?selected:['http','https','net','tls','dgram'].includes(name)?{}:require(name);
 vm.runInNewContext(fs.readFileSync(path.join(tools,'session-guard.cjs'),'utf8'),{module:isolated,require:requireLocal,structuredClone,URL,setTimeout});
 const ipc={send(...args){sent.push(args);return true;},invoke:async(...args)=>{invoked.push(args);return true;},sendSync(){}};
 const fake={indexedDB:{open(){},deleteDatabase(){}},IDBDatabase:Database,IDBObjectStore:Store,Storage,localStorage:new Storage(),navigator:{},location:{href:'file:///'+selected.ROOT.replaceAll('\\','/')+'/runtime/resources/app/game/index.html'},fetch:async()=>({}),WebSocket:class{},XMLHttpRequest:class{open(){}},Worker:class{},RTCPeerConnection:class{}};
 const config={...fixtures.config('host','999','automated'),root:selected.ROOT,mode};
 const guard=isolated.exports.install(fake,config,ipc);return {guard,ipc,sent,invoked};
}
function nativeQuitClick(proofFile){
 const splash=DEBUG.splash,back=splash.element.querySelector('.cattail-p2p-phase2-back');
 if(back)back.click();
 if(!splash.isShown)splash.show();
 const buttons=Array.from(splash.element.querySelectorAll('.menuItem')).filter(node=>node.textContent.trim()===splash.say('quit'));
 if(buttons.length!==1||!buttons[0].getClientRects().length||getComputedStyle(buttons[0]).display==='none')throw Error('NATIVE_QUIT_BUTTON_UNAVAILABLE');
 const guard=CattailP2PEarlySession,before=guard.snapshot(),space=DEBUG.spaceport,send=space.send;
 space.send=function(channel,...args){
  if(channel==='quit'){
   space.send=send;const after=guard.snapshot();
   require('fs').writeFileSync(proofFile,JSON.stringify({nativeButton:true,memoryCommitsBefore:before.saveResults.length,memoryCommitsAfter:after.saveResults.length,storeDeniedBefore:before.audit.ipcByChannel['invoke:store']||0,storeDeniedAfter:after.audit.ipcByChannel['invoke:store']||0,quitDenied:after.audit.ipcByChannel['send:quit']||0,physicalMutation:after.audit.physicalMutation,errors:after.errors.length}));
  }
  return send.call(this,channel,...args);
 };
 setTimeout(()=>buttons[0].click(),150);return true;
}
function controllerClockFixture(settings={}){
 let now=0,starts=0,stops=0;const statusTimes=[],writes=new Map(),clients=[];
 const proc=new EventEmitter();proc.env={...process.env,CATTAIL_P2P_TOOL_ROOT:fixtures.ROOT};
 class ClockDate extends Date{static now(){return now;}}
 const peer={role:'guest',channelOpen:true,sameMachine:true,connectionPath:'direct',localCandidateType:'host',remoteCandidateType:'host',remoteHandshake:{gameVersion:'1.3'}};
 for(const role of ['host','guest'])clients.push({role,exited:false,lifecycle:{},async call(method,value){
  if(method==='status'){
   statusTimes.push(now);if(role==='host'&&settings.closeAfterMs!==undefined&&now>=settings.closeAfterMs)this.lifecycle.closed=true;
   return {generation:1,visible:!settings.uiCheck,game:{version:'1.3'},disk:[],guard:{ready:!settings.notReady,audit:{physicalMutation:0},errors:[],saveTimes:[1,2],saveResults:['memory-committed'],ticks:10,frames:10},p2p:{ready:!settings.notReady,signaling:{status:'signaling-ready',socketOpen:true},transport:{iceServerCount:0,peers:settings.noConnection?[]:[peer]}}};
  }
  if(method==='create')return 'ABCDEFGH';
  if(method==='evaluate'&&value.includes("['sent','received','acknowledged']"))return {sent:1,received:1,acknowledged:1};
  if(method==='evaluate'&&value.includes('signaling-reconnect-exhausted'))return 0;
  return true;
 }});
 const session={clients,dir:path.join(fixtures.ROOT,'reports/unit-clock'),async stop(){stops++;return {ok:true,allExited:true,forced:0,residual:[],exitCodes:[{code:0},{code:0}]};}};
 const ready={status:'READY',checksPassed:true,hashes:Object.fromEntries(player.launchInputs().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
 const mockedFs={...fs,mkdirSync(){},rmSync(){},writeFileSync(file,value){writes.set(file,JSON.parse(value));},readFileSync(file,...args){if(path.resolve(file)===path.join(fixtures.ROOT,'acceptance-gate.json'))return JSON.stringify(ready);return fs.readFileSync(file,...args);}};
 const filename=path.join(tools,'player.cjs'),actualRequire=Module.createRequire(filename),isolated={exports:{}};
 const requireLocal=name=>name==='fs'?mockedFs:name==='./start.cjs'?{async start(){starts++;return session;}}:name==='./signaling-local.cjs'?{async portFree(){}}:actualRequire(name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module:isolated,require:requireLocal,__dirname:tools,__filename:filename,process:proc,Date:ClockDate,console:{...console,log(){}},setTimeout(fn,ms){now+=ms===500?(settings.stepMs||900001):ms;queueMicrotask(fn);return {unref(){}};},clearTimeout(){}});
 return {run:options=>isolated.exports.run('999',{uiCheck:!!settings.uiCheck,...options}),statusTimes,writes,get starts(){return starts;},get stops(){return stops;}};
}
(async()=>{
 await check('legacy root remains default without player environment',()=>{
  const env={...process.env};delete env.CATTAIL_P2P_TOOL_ROOT;
  const r=cp.spawnSync(process.execPath,['-e','process.stdout.write(require('+JSON.stringify(path.join(tools,'fixtures.cjs'))+').ROOT)'],{env,encoding:'utf8'});
  assert.equal(r.status,0);assert.equal(r.stdout,fixtures.LEGACY_ROOT);
 });
 await check('three approved roots retain explicit instance and mode contracts',()=>{
  assert.equal(fixtures.selectRoot(fixtures.PLAYER_ROOT),fixtures.PLAYER_ROOT);
  assert.equal(fixtures.selectRoot(fixtures.FOUR_ROOT),fixtures.FOUR_ROOT);
  assert.throws(()=>fixtures.config('guest','100','manual','guest1'),/FOUR_ROOT/);
  assert.throws(()=>fixtures.selectRoot('C:/outside'),/UNAPPROVED/);
  assert.throws(()=>fixtures.config('host','100','unknown'),/MODE/);
  assert.throws(()=>fixtures.config('none','100','manual'),/ROLE/);
  assert.throws(()=>fixtures.config('host','../escape','manual'),/ROLE/);
 });
 await check('player preparation refuses existing root before writes',()=>{
  const before=fs.statSync(path.join(fixtures.ROOT,'baseline.json')).mtimeMs;
  assert.throws(()=>player.prepare(),/ROOT_EXISTS/);
  assert.equal(fs.statSync(path.join(fixtures.ROOT,'baseline.json')).mtimeMs,before);
 });
 await check('dead client rejects without sending IPC',async()=>{
  const child=fakeChild(),client=clientFor(child,'host');child.emit('exit',0,null);
  await assert.rejects(client.call('evaluate','throw Error()'),/CLOSED/);assert.equal(child.sent.length,0);
 });
 await check('window close cancels pending work and blocks later evaluation',async()=>{
  const child=fakeChild(),client=clientFor(child,'host'),request=client.call('status');
  child.emit('message',{event:'closed'});await assert.rejects(request,/CLOSED/);
  await assert.rejects(client.call('evaluate','1'),/CLOSED/);assert.equal(child.sent.length,1);
 });
 await check('IPC disconnect and send failure return handled errors',async()=>{
  const child=fakeChild(),client=clientFor(child,'host');child.connected=false;
  await assert.rejects(client.call('status'),/DISCONNECTED/);
  child.connected=true;child.send=()=>{throw Error('fake send failure');};
  await assert.rejects(client.call('status'),/SEND_FAILED/);
 });
 await check('pending IPC has bounded timeout and process failure rejects it',async()=>{
  const child=fakeChild(),client=clientFor(child,'guest');
  await assert.rejects(client.call('status',null,10),/TIMEOUT/);
  const request=client.call('status');child.emit('error',Error('fake process failure'));await assert.rejects(request,/PROCESS_ERROR/);
 });
 await check('public diagnostics strip room, candidate and save contents',()=>{
  const result=player.summarize({generation:1,disk:[],guard:{audit:{physicalMutation:0},saveTimes:[],saveResults:[],errors:[]},p2p:{ready:true,signaling:{status:'ready',roomCode:'PRIVATE_CODE'},transport:{iceServerCount:0,peers:[{role:'host',remoteHandshake:{gameVersion:'1.3',roomCode:'PRIVATE_CODE'},candidate:'PRIVATE_ADDRESS'}]}}},{sent:1});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CODE|PRIVATE_ADDRESS|remoteHandshake/);
 });
 await check('visible entry refuses launch until acceptance gate is ready',async()=>{
  const filename=path.join(tools,'player.cjs'),isolated=new Module(filename,module);
  isolated.filename=filename;isolated.paths=Module._nodeModulePaths(path.dirname(filename));
  const requireActual=isolated.require.bind(isolated),gate=path.join(fixtures.ROOT,'acceptance-gate.json');
  isolated.require=name=>name==='fs'?{...fs,readFileSync(file,...args){
   if(path.resolve(file)===gate)return JSON.stringify({status:'BLOCKED_TEST_FIXTURE',checksPassed:false});
   return fs.readFileSync(file,...args);
  }}:requireActual(name);
  isolated._compile(fs.readFileSync(filename,'utf8'),filename);
  await assert.rejects(isolated.exports.run('999'),/PLAYER_GATE_NOT_READY/);
 });
 await check('manual main stays open beyond fifteen minutes and closes on parent disconnect',()=>{
  const f=mainTimerFixture('manual');f.advance(16*60*1000);assert.equal(f.quits,0);assert.equal(f.exits.length,0);assert.equal(f.timers.length,0);
  f.proc.emit('disconnect');assert.equal(f.quits,1);
 });
 await check('automated main retains its three minute deadline',()=>{
  const f=mainTimerFixture('automated');f.advance(179999);assert.equal(f.exits.length,0);f.advance(180000);assert.equal(f.exits[0],2);
 });
 await check('only the manual player root admits quit through the guard',()=>{
  const f=guardIpcFixture('manual');assert.equal(f.ipc.send('quit',''),true);assert.equal(f.sent[0][0],'quit');assert.equal(f.guard.snapshot().audit.ipcDenied,0);
  for(const [mode,legacy]of [['automated',false],[undefined,false],['manual',true]]){const denied=guardIpcFixture(mode,legacy);assert.equal(denied.ipc.send('quit',''),false);assert.equal(denied.sent.length,0);assert.equal(denied.guard.snapshot().audit.ipcByChannel['send:quit'],1);}
 });
 await check('manual quit permission retains store save cloud and statistics denials',async()=>{
  const f=guardIpcFixture('manual');
  for(const channel of ['store','save','achieve','updateStat','updateAccumulatedPlaytime','reset']){assert.equal(f.ipc.send(channel,{}),false);assert.equal(await f.ipc.invoke(channel,{}),false);}
  assert.equal(f.sent.length,0);assert.equal(f.invoked.length,0);assert.equal(f.guard.snapshot().audit.ipcDenied,12);assert.equal(f.guard.snapshot().audit.physicalMutation,0);
 });
 await check('manual main rejects missing foreign and destroyed quit senders',()=>{
  const f=mainTimerFixture('manual');f.quit({});f.attachWindow();f.quit({});f.destroyWindow();f.quit(f.ownedWindow.webContents);assert.equal(f.quits,0);assert.equal(f.closes,0);assert.equal(f.denied,3);
 });
 await check('manual own-window quit closes once and remains idempotent',()=>{
  const f=mainTimerFixture('manual');f.attachWindow();f.quit(f.ownedWindow.webContents);f.quit(f.ownedWindow.webContents);f.proc.emit('disconnect');assert.equal(f.quits,1);assert.equal(f.closes,1);
 });
 await check('automated main denies quit even from its own window',()=>{
  const f=mainTimerFixture('automated');f.attachWindow();f.quit(f.ownedWindow.webContents);assert.equal(f.quits,0);assert.equal(f.closes,0);assert.equal(f.denied,1);
 });
 await check('launch approval binds the guard source as its ninth input',()=>{
  const inputs=player.launchInputs();assert.equal(inputs.length,9);assert.ok(inputs.includes(path.join(tools,'session-guard.cjs')));
 });
 await check('manual controller crosses fifteen minutes and waits for window close',async()=>{
  const f=controllerClockFixture({closeAfterMs:900000}),report=await f.run();assert.equal(report.status,'CLOSED_PENDING_PLAYER_FEEDBACK');assert.equal(report.timeLimitMs,null);assert.ok(f.statusTimes.some(time=>time>900000));assert.equal(f.stops,1);
 });
 await check('hidden controller checks retain a bounded default duration',async()=>{
  const f=controllerClockFixture({uiCheck:true}),report=await f.run();assert.equal(report.status,'LIFECYCLE_CHECK_FINISHED');assert.equal(report.timeLimitMs,900000);assert.equal(f.stops,1);
 });
 await check('explicit fifty five second checks still finish on their deadline',async()=>{
  const f=controllerClockFixture({uiCheck:true,stepMs:60000}),report=await f.run({durationMs:55000});assert.equal(report.status,'LIFECYCLE_CHECK_FINISHED');assert.equal(report.timeLimitMs,55000);assert.equal(f.stops,1);
 });
 await check('invalid test durations reject before starting any process',async()=>{
  const f=controllerClockFixture();for(const durationMs of [0,-1,Infinity,NaN])await assert.rejects(f.run({durationMs}),/INVALID_PLAYER_DURATION/);assert.equal(f.starts,0);
 });
 await check('unbounded manual startup still fails after sixty seconds',async()=>{
  const f=controllerClockFixture({notReady:true,stepMs:61000});await assert.rejects(f.run(),/PLAYER_STARTUP_TIMEOUT/);assert.equal(f.stops,1);
 });
 await check('unbounded manual connection still fails after fifteen seconds',async()=>{
  const f=controllerClockFixture({noConnection:true,stepMs:16000});await assert.rejects(f.run(),/PLAYER_CONNECTION_TIMEOUT/);assert.equal(f.stops,1);
 });
 const liveBase=Number(process.argv.find(value=>value.startsWith('--base='))?.slice(7)||910);
 if(!Number.isInteger(liveBase)||liveBase<100||liveBase>995)throw Error('INVALID_LIVE_TEST_BASE');
 if(process.argv.includes('--live')){
  await check('real manual lifecycle closes one window without post-destroy errors',async()=>{
   player.assertPrepared();
   const run=await require(path.join(tools,'start.cjs')).start(path.resolve(tools,'../../../../../../..'),String(liveBase),{mode:'manual',uiCheck:true});
   try{
    for(const client of run.clients)await until(()=>client.call('status'),state=>state.guard?.ready);
    await run.clients[0].call('shutdown');
    await until(async()=>run.clients[0].exited,Boolean,12000);
    assert.equal(run.clients[0].lifecycle.exitCode,0);
    await assert.rejects(run.clients[0].call('evaluate','1'),/CLOSED/);
    assert.equal((await run.clients[1].call('status')).guard.ready,true);
   }finally{
    const cleanup=await run.stop();assert.equal(cleanup.allExited,true);assert.equal(cleanup.forced,0);
    await require(path.join(tools,'signaling-local.cjs')).portFree();
    assert.equal(fs.readdirSync(run.dir).some(name=>name.endsWith('main-failure.json')),false);
   }
  });
  await check('real manual controller reconnects after reload and preserves isolation',async()=>{
   let reloaded=false,callbackError='';
   const report=await player.run(String(liveBase+1),{uiCheck:true,durationMs:55000,autoProbe:true,onConnected:({clients})=>{
    if(reloaded)return;reloaded=true;
    setTimeout(()=>clients[0].call('reload').catch(error=>{callbackError=error.message;}),4000);
   }});
   assert.equal(callbackError,'');assert.equal(report.status,'LIFECYCLE_CHECK_FINISHED');assert.equal(report.playerFeedback,'PENDING');
   assert.ok(report.events.filter(event=>event.type==='room-created-and-joined').length>=2);
   assert.ok(Object.keys(report.generations.host).length>=2);
   for(const role of ['host','guest']){
    const state=report.roles[role];assert.equal(state.diskProgressRows,0);assert.equal(state.physicalProgressMutations,0);assert.equal(state.unhandledErrors,0);
    assert.equal(state.signaling,'signaling-ready');assert.equal(state.signalingErrors,0);
    assert.ok(state.autosaves>=2);assert.ok(state.probes.sent>=1&&state.probes.received>=1&&state.probes.acknowledged>=1);
    assert.ok(state.peers.some(peer=>peer.sameMachine&&peer.path==='direct'));
   }
   assert.equal(report.cleanup.allExited,true);assert.equal(report.cleanup.forced,0);assert.equal(report.cleanup.port8787Released,true);
  });
  await check('real manual client closes normally when its parent IPC disconnects',async()=>{
   const run=await require(path.join(tools,'start.cjs')).start(path.resolve(tools,'../../../../../../..'),String(liveBase+2),{mode:'manual',uiCheck:true});
   try{
    for(const client of run.clients)await until(()=>client.call('status'),state=>state.guard?.ready);
    run.clients[0].child.disconnect();await until(async()=>run.clients[0].exited,Boolean,12000);
    assert.equal(run.clients[0].lifecycle.exitCode,0);assert.equal((await run.clients[1].call('status')).guard.ready,true);
   }finally{
    const cleanup=await run.stop();assert.equal(cleanup.ok,true);assert.equal(cleanup.forced,0);await require(path.join(tools,'signaling-local.cjs')).portFree();
   }
  });
  for(const [index,role]of ['host','guest'].entries())await check('real native '+role+' Quit saves to memory and closes both controller-owned windows',async()=>{
   const attempt=String(liveBase+3+index),proofFile=path.join(fixtures.ROOT,'reports',attempt,role+'-native-quit.json');let clicked=false,callbackError='',clickWork;
   const report=await player.run(attempt,{uiCheck:true,durationMs:25000,onConnected:({clients})=>{
    if(clicked)return;clicked=true;clickWork=clients[index].call('evaluate','('+nativeQuitClick.toString()+')('+JSON.stringify(proofFile)+')').catch(error=>{callbackError=error.message;});
   }});
   await clickWork;assert.equal(callbackError,'');assert.equal(clicked,true);assert.equal(report.status,'CLOSED_PENDING_PLAYER_FEEDBACK');
   const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));assert.equal(proof.nativeButton,true);assert.ok(proof.memoryCommitsAfter>proof.memoryCommitsBefore);assert.ok(proof.storeDeniedAfter>proof.storeDeniedBefore);assert.equal(proof.quitDenied,0);assert.equal(proof.physicalMutation,0);assert.equal(proof.errors,0);
   assert.equal(report.cleanup.ok,true);assert.equal(report.cleanup.forced,0);assert.equal(report.cleanup.residual.length,0);assert.equal(report.cleanup.port8787Released,true);
   assert.ok(report.cleanup.exitCodes.every(row=>row.code===0&&!row.signal));
   for(const state of Object.values(report.roles)){assert.equal(state.diskProgressRows,0);assert.equal(state.physicalProgressMutations,0);assert.equal(state.unhandledErrors,0);}
  });
 }
 console.log('PLAYER_13_VERIFY='+checks+'/'+checks);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
