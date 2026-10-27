'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),cp=require('child_process'),Module=require('module'),{EventEmitter}=require('events');
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
(async()=>{
 await check('legacy root remains default without player environment',()=>{
  const env={...process.env};delete env.CATTAIL_P2P_TOOL_ROOT;
  const r=cp.spawnSync(process.execPath,['-e','process.stdout.write(require('+JSON.stringify(path.join(tools,'fixtures.cjs'))+').ROOT)'],{env,encoding:'utf8'});
  assert.equal(r.status,0);assert.equal(r.stdout,fixtures.LEGACY_ROOT);
 });
 await check('only two approved roots and two explicit modes admitted',()=>{
  assert.equal(fixtures.selectRoot(fixtures.PLAYER_ROOT),fixtures.PLAYER_ROOT);
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
 const liveBase=Number(process.argv.find(value=>value.startsWith('--base='))?.slice(7)||910);
 if(!Number.isInteger(liveBase)||liveBase<100||liveBase>998)throw Error('INVALID_LIVE_TEST_BASE');
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
 }
 console.log('PLAYER_13_VERIFY='+checks+'/'+checks);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
