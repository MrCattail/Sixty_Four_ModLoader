'use strict';
const worldModule=require('./snapshot-world.js');
const {LIMITS,FORMAT,encode,decode,digest}=worldModule;
const LABEL='cattail-p2p-snapshot13-experiment-v1',MAGIC=0x53503133;
function keys(value,names){if(!value||Object.keys(value).sort().join('|')!==names.slice().sort().join('|'))throw Error('WIRE_KEYS');}
function frames(value,sessionId){
 return frameBytes(encode(value,sessionId),sessionId);
}
function frameBytes(input,sessionId){
 const bytes=Buffer.from(input);decode(bytes,sessionId);const sha256=digest(bytes),count=Math.ceil(bytes.length/LIMITS.chunk);
 const result=[JSON.stringify({type:'begin',format:FORMAT,sessionId,epoch:1,revision:1,bytes:bytes.length,chunks:count,sha256})];
 for(let index=0;index<count;index++){
  const part=bytes.subarray(index*LIMITS.chunk,(index+1)*LIMITS.chunk),buffer=Buffer.alloc(12+part.length);buffer.writeUInt32BE(MAGIC,0);buffer.writeUInt32BE(index,4);buffer.writeUInt32BE(part.length,8);part.copy(buffer,12);result.push(buffer);
 }
 result.push(JSON.stringify({type:'end',sessionId,epoch:1,revision:1}));return {frames:result,bytes:bytes.length,sha256};
}
class Receiver{
 constructor(sessionId,apply,options={}){this.sessionId=sessionId;this.apply=apply;this.setTimer=options.setTimer||((callback,ms)=>globalThis.setTimeout(callback,ms));this.clearTimer=options.clearTimer||(timer=>globalThis.clearTimeout(timer));this.pending=null;this.complete=false;this.receipt=null;this.rejected=0;this.lastRejection='';this.rejectionCodes=[];this.timer=null;}
 clear(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.pending=null;}
 reject(code){this.rejected++;this.lastRejection=code;this.rejectionCodes.push(code);if(this.rejectionCodes.length>16)this.rejectionCodes.shift();this.clear();}
 accept(message){
  try{
   if(this.complete)throw Error('ALREADY_APPLIED');
   if(typeof message==='string'){
    if(Buffer.byteLength(message)>512)throw Error('CONTROL_TOO_LARGE');
    const value=JSON.parse(message);
    if(value.type==='begin'){
     keys(value,['type','format','sessionId','epoch','revision','bytes','chunks','sha256']);
     if(this.pending||value.format!==FORMAT||value.sessionId!==this.sessionId||value.epoch!==1||value.revision!==1)throw Error('WIRE_CONTEXT');
     if(!Number.isInteger(value.bytes)||value.bytes<1||value.bytes>LIMITS.bytes||value.chunks!==Math.ceil(value.bytes/LIMITS.chunk)||value.chunks<1||value.chunks>LIMITS.chunks||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('WIRE_LIMIT');
     this.pending={...value,parts:[],received:0};this.timer=this.setTimer(()=>this.reject('RECEIVE_TIMEOUT'),10000);return null;
    }
    keys(value,['type','sessionId','epoch','revision']);
    if(value.type!=='end'||value.sessionId!==this.sessionId||value.epoch!==1||value.revision!==1||!this.pending)throw Error('WIRE_END');
    const pending=this.pending;
    if(pending.parts.length!==pending.chunks||pending.received!==pending.bytes)throw Error('MISSING_CHUNKS');
    const bytes=Buffer.concat(pending.parts);
    if(digest(bytes)!==pending.sha256)throw Error('CHECKSUM_MISMATCH');
    const clean=decode(bytes,this.sessionId);this.apply(clean);
    this.receipt={type:'ack',sessionId:this.sessionId,epoch:1,revision:1,bytes:bytes.length,sha256:pending.sha256};this.complete=true;this.clear();return this.receipt;
   }
   const bytes=Buffer.from(message instanceof ArrayBuffer?new Uint8Array(message):message),pending=this.pending;
   if(!pending||bytes.length<13||bytes.length>LIMITS.chunk+12||bytes.readUInt32BE(0)!==MAGIC||bytes.readUInt32BE(4)!==pending.parts.length)throw Error('WIRE_CHUNK');
   const size=bytes.readUInt32BE(8),expected=Math.min(LIMITS.chunk,pending.bytes-pending.received);
   if(size!==bytes.length-12||size!==expected||pending.parts.length>=pending.chunks)throw Error('WIRE_CHUNK_SIZE');
   pending.parts.push(Buffer.from(bytes.subarray(12)));pending.received+=size;return null;
  }catch(error){this.reject(error.message);throw error;}
 }
 state(){return {complete:this.complete,pendingBytes:this.pending?.received||0,rejected:this.rejected,lastRejection:this.lastRejection,rejectionCodes:this.rejectionCodes.slice(),receipt:this.receipt};}
}
function install(window,config,world){
 let pc=null,channel=null,sent=false,ack=null,expected=null,closed=false,lastError='',sentBytes=0,receivedBytes=0,rejected=0,ackTimer=null,path={path:'unknown',sameMachine:false};
 const receiver=new Receiver(config.sessionId,value=>world.apply(value));
 function error(code){lastError=String(code);world.notice(lastError);}
 async function inspect(){
  if(!pc||pc.connectionState==='closed')return;
  const stats=await pc.getStats();let pair=null;
  stats.forEach(row=>{if(row.type==='transport'&&row.selectedCandidatePairId)pair=stats.get(row.selectedCandidatePairId);});
  if(!pair)stats.forEach(row=>{if(row.type==='candidate-pair'&&row.state==='succeeded'&&(row.nominated||row.selected))pair=row;});
  const local=pair&&stats.get(pair.localCandidateId),remote=pair&&stats.get(pair.remoteCandidateId);
  if(!local?.address||!remote?.address)return;
  for(const candidate of [local,remote])window.CattailP2PEarlySession.candidateAllowed({candidate:'candidate:stats 1 udp 1 '+candidate.address+' '+candidate.port+' typ '+candidate.candidateType});
  path={path:'direct',sameMachine:true,localType:local.candidateType,remoteType:remote.candidateType};
 }
 function attach(value){
  if(channel||value.label!==LABEL||!value.ordered||value.maxRetransmits!==null||value.maxPacketLifeTime!==null){value.close();error('WRONG_CHANNEL');return;}
  channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=8192;
  channel.onopen=()=>{world.setConnection(true);inspect().catch(()=>error('PATH_CHECK_FAILED'));};
  channel.onclose=()=>world.setConnection(false,'连接已关闭');channel.onerror=()=>error('CHANNEL_ERROR');
  channel.onmessage=event=>{
   receivedBytes+=typeof event.data==='string'?Buffer.byteLength(event.data):event.data.byteLength;
   try{
    if(config.role==='guest'){const reply=receiver.accept(event.data);if(reply)channel.send(JSON.stringify(reply));}
    else{
     if(typeof event.data!=='string'||Buffer.byteLength(event.data)>512)throw Error('ACK_FORMAT');
     const value=JSON.parse(event.data);keys(value,['type','sessionId','epoch','revision','bytes','sha256']);
     if(!sent||ack||value.type!=='ack'||value.sessionId!==config.sessionId||value.epoch!==1||value.revision!==1||value.bytes!==expected.bytes||value.sha256!==expected.sha256)throw Error('ACK_MISMATCH');
     ack=value;clearTimeout(ackTimer);ackTimer=null;world.notice('快照已确认，世界只读');
    }
   }catch(reason){rejected++;if(world.state().fatal)error('WORLD_CONSTRUCTION_FAILED');}
  };
 }
 function create(){
  if(pc||closed)throw Error('PEER_STATE');window.CattailP2PEarlySession.assertReady();
  pc=new window.RTCPeerConnection({iceServers:[]});pc.ondatachannel=event=>attach(event.channel);
  pc.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(pc.connectionState))error('PEER_DISCONNECTED');};
 }
 async function gathered(){
  if(pc.iceGatheringState==='complete')return pc.localDescription.toJSON();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(Error('ICE_TIMEOUT'));},10000);
   function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve(pc.localDescription.toJSON());}}
   pc.addEventListener('icegatheringstatechange',check);check();
  });
 }
 async function transmit(list){
  if(channel?.readyState!=='open'||!world.state().ready)throw Error('CHANNEL_NOT_READY');
  for(const frame of list){
   if(channel.bufferedAmount>32768)await new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);channel.removeEventListener('bufferedamountlow',low);channel.removeEventListener('close',ended);};const low=()=>{cleanup();resolve();},ended=()=>{cleanup();reject(Error('CHANNEL_CLOSED'));};timer=setTimeout(()=>{cleanup();reject(Error('BACKPRESSURE_TIMEOUT'));},10000);channel.addEventListener('bufferedamountlow',low,{once:true});channel.addEventListener('close',ended,{once:true});});
   channel.send(frame);sentBytes+=typeof frame==='string'?Buffer.byteLength(frame):frame.byteLength;
  }
 }
 const api={
  async offer(){if(config.role!=='host')throw Error('ROLE_DENIED');create();attach(pc.createDataChannel(LABEL,{ordered:true}));await pc.setLocalDescription(await pc.createOffer());return gathered();},
  async answer(offer){if(config.role!=='guest')throw Error('ROLE_DENIED');create();await pc.setRemoteDescription(offer);await pc.setLocalDescription(await pc.createAnswer());return gathered();},
  async remote(answer){if(config.role!=='host'||!pc)throw Error('ROLE_DENIED');await pc.setRemoteDescription(answer);return true;},
  async send(){if(config.role!=='host'||sent)throw Error('SEND_ONCE');expected=frames(world.capture(),config.sessionId);sent=true;ackTimer=setTimeout(()=>{if(!ack&&!closed)error('ACK_TIMEOUT');},10000);await transmit(expected.frames);world.notice('已发送，等待确认');return {bytes:expected.bytes,sha256:expected.sha256};},
  async testInvalid(kind){
   if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');
   const data=world.capture(),valid=frames(data,config.sessionId);let list;
   if(kind==='duplicate'){list=[valid.frames[0]];}
   else if(kind==='old-session'){const header=JSON.parse(valid.frames[0]);header.sessionId='desktop13-snapshot-999';list=[JSON.stringify(header)];}
   else if(kind==='missing'){list=[valid.frames[0],valid.frames.at(-1)];}
   else if(kind==='checksum'){const header=JSON.parse(valid.frames[0]);header.sha256='0'.repeat(64);list=[JSON.stringify(header),...valid.frames.slice(1)];}
   else if(kind==='unknown'){
    data.entities[0].name='cube';const bytes=Buffer.from(JSON.stringify(data));const header=JSON.parse(valid.frames[0]);header.bytes=bytes.length;header.chunks=1;header.sha256=digest(bytes);const chunk=Buffer.alloc(12+bytes.length);chunk.writeUInt32BE(MAGIC,0);chunk.writeUInt32BE(0,4);chunk.writeUInt32BE(bytes.length,8);bytes.copy(chunk,12);list=[JSON.stringify(header),chunk,valid.frames.at(-1)];
   }else throw Error('UNKNOWN_NEGATIVE');
   await transmit(list);return true;
  },
  async state(){if(channel?.readyState==='open')await inspect();return {role:config.role,open:channel?.readyState==='open',sent,ack,expected:expected?{bytes:expected.bytes,sha256:expected.sha256}:null,receiver:receiver.state(),path,closed,lastError,sentBytes,receivedBytes};},
  close(){closed=true;clearTimeout(ackTimer);ackTimer=null;receiver.clear();if(channel){channel.onclose=null;channel.onmessage=null;channel.close();}if(pc){pc.onconnectionstatechange=null;pc.close();}world.setConnection(false,'测试已结束');return true;}
 };
 Object.defineProperty(api,'sent',{get:()=>sent});world.setWire(api);window.addEventListener('beforeunload',()=>api.close(),{once:true});return Object.freeze(api);
}
module.exports={LABEL,MAGIC,frames,frameBytes,Receiver,install};
