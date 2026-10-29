'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const protocol=require('../scripts/protocol.js');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/transport.js'),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
let checks=0;
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
function stats(options={}){
 const rows=new Map([
  ['transport',{type:'transport',selectedCandidatePairId:options.fallback?undefined:'selected'}],
  ['selected',{id:'selected',type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'local',remoteCandidateId:'remote'}],
  ['local',{candidateType:'host',address:'127.0.0.1',port:40001}],
  ['remote',{candidateType:'host',address:'127.0.0.1',port:40002,...options.remote}]
 ]);
 if(options.incomplete)rows.delete('remote');
 if(options.otherNominated){
  rows.set('other',{id:'other',type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'local',remoteCandidateId:'other-remote'});
  rows.set('other-remote',{candidateType:'prflx',port:40003});
 }
 return rows;
}
async function fixture(readStats){
 const timers=new Map(),pcs=[],events=[],guardCalls=[];let next=0,signalListener;
 const module={exports:{}};
 vm.runInNewContext(source,{module,setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},ArrayBuffer,Uint8Array,console});
 const signalState={socketOpen:true,roomCode:'ABCDEFGH',role:'host',iceServers:[],peers:[{peerId:'guest-1',role:'guest',slot:1}]};
 const signaling={getState:()=>signalState,send(){},subscribe(fn){fn(signalState);return()=>{};},onSignal(fn){signalListener=fn;return()=>{};}};
 class PC{
  constructor(configuration){assert.equal(configuration.iceServers.length,0);this.connectionState='new';this.calls=0;pcs.push(this);}
  createDataChannel(){return {readyState:'connecting',close(){},send(){}};}
  async createOffer(){return {type:'offer',sdp:'v=0\r\n'};}
  async setLocalDescription(value){this.localDescription=value;}
  getStats(){this.calls++;return Promise.resolve(readStats(this.calls,this));}
  setConfiguration(){}
  close(){this.connectionState='closed';}
 }
 const context={validate:()=>true,assertReady:()=>true,candidateAllowed(value){
  const parts=value.candidate.split(/\s+/);guardCalls.push(value.candidate);
  if(parts[7]!=='host'||!['127.0.0.1','::1'].includes(parts[4]))throw Error('STRICT_LOCAL_GUARD_REJECTED');
 }};
 const transport=module.exports.create({protocol,signaling,config:{role:'host',localOnly:true,desktop13:true},context,RTCPeerConnection:PC,audit:{record(type,details){events.push({type,details});}},getHandshake:()=>({gameVersion:'1.3'})});
 await flush();
 return {transport,pcs,events,timers,guardCalls,
  async connect(){pcs[0].connectionState='connected';pcs[0].onconnectionstatechange();await flush();},
  async retry(){const entry=Array.from(timers).find(([,timer])=>timer.ms===250);assert.ok(entry,'a bounded statistics retry must be scheduled');timers.delete(entry[0]);entry[1].fn();await flush();},
  async replace(){signalListener(protocol.makeSignalMessage(protocol.SIGNAL_TYPES.PEER_JOINED,{peerId:'guest-1',role:'guest',slot:1}));await flush();},
  peer(){return transport.getState().peers[0];},
  close(){transport.close();assert.equal(timers.size,0,'close must cancel all owned timers');}
 };
}
(async()=>{
 await check('actual selected pair outranks another nominated pair',async()=>{
  const f=await fixture(()=>stats({otherNominated:true}));try{await f.connect();assert.equal(f.peer().sameMachine,true);assert.equal(f.peer().connectionPath,'direct');assert.equal(f.guardCalls.length,2);}finally{f.close();}
 });
 await check('incomplete selected candidate statistics retry then validate',async()=>{
  const f=await fixture(call=>stats({incomplete:call===1}));try{await f.connect();assert.equal(f.peer().sameMachine,false);assert.equal(f.guardCalls.length,0);await f.retry();assert.equal(f.pcs[0].calls,2);assert.equal(f.peer().sameMachine,true);assert.equal(f.timers.size,1);}finally{f.close();}
 });
 await check('nominated fallback remains available without an explicit selected pair',async()=>{
  const f=await fixture(()=>stats({fallback:true}));try{await f.connect();assert.equal(f.peer().sameMachine,true);assert.equal(f.peer().remoteCandidateType,'host');}finally{f.close();}
 });
 await check('incomplete statistics exhaust bounded retries without claiming local success',async()=>{
  const f=await fixture(()=>stats({incomplete:true}));try{await f.connect();for(let i=0;i<19;i++)await f.retry();assert.equal(f.pcs[0].calls,20);assert.equal(f.peer().sameMachine,false);assert.equal(f.peer().connectionPath,'unknown');assert.equal(Array.from(f.timers.values()).some(timer=>timer.ms===250),false);assert.ok(f.events.some(row=>row.type==='connection-path-unavailable'));assert.equal(f.guardCalls.length,0);}finally{f.close();}
 });
 for(const [name,remote]of [['nonlocal host',{address:'203.0.113.7'}],['peer-reflexive',{candidateType:'prflx'}],['relay',{candidateType:'relay'}]]){
  await check(name+' selected candidate still goes through the strict guard',async()=>{
   const f=await fixture(()=>stats({remote}));try{await f.connect();assert.equal(f.peer().sameMachine,false);assert.equal(f.peer().connectionPath,'unknown');assert.ok(f.events.some(row=>row.details.message==='STRICT_LOCAL_GUARD_REJECTED'));assert.equal(f.guardCalls.length,2);}finally{f.close();}
  });
 }
 await check('closing a connection while statistics are pending cannot publish stale success',async()=>{
  let resolve;const pending=new Promise(done=>{resolve=done;});const f=await fixture(()=>pending);
  await f.connect();f.close();const before=f.events.length;resolve(stats());await flush();assert.equal(f.events.length,before);assert.equal(f.guardCalls.length,0);assert.equal(f.transport.getState().status,'closed');
 });
 await check('replacing a peer while old statistics are pending keeps the new path unknown',async()=>{
  let resolve;const pending=new Promise(done=>{resolve=done;});const f=await fixture(()=>pending);
  try{await f.connect();await f.replace();assert.equal(f.pcs.length,2);resolve(stats());await flush();assert.equal(f.peer().sameMachine,false);assert.equal(f.peer().connectionPath,'unknown');assert.equal(f.guardCalls.length,0);assert.equal(f.events.filter(row=>row.type==='connection-path-detected').length,0);}finally{f.close();}
 });
 console.log('CONNECTION_PATH_VERIFY='+checks+'/'+checks);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
