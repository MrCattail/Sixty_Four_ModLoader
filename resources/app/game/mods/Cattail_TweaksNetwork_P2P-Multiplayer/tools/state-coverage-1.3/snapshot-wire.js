'use strict';
const worldModule=require('./snapshot-world.js');
const {LIMITS,FORMAT,encode,decode,digest}=worldModule;
const MAGIC=0x53433133;
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
 result.push(JSON.stringify({type:'end',sessionId,epoch:1,revision:1}));return {frames:result,bytes:bytes.length,sha256,chunks:count,totalFrameBytes:result.reduce((n,f)=>n+(typeof f==='string'?Buffer.byteLength(f):f.length),0)};
}
class Receiver{
 constructor(sessionId,apply,options={}){this.sessionId=sessionId;this.apply=apply;this.setTimer=options.setTimer||((callback,ms)=>globalThis.setTimeout(callback,ms));this.clearTimer=options.clearTimer||(timer=>globalThis.clearTimeout(timer));this.pending=null;this.complete=false;this.receipt=null;this.rejected=0;this.lastRejection='';this.rejectionCodes=[];this.timer=null;this.now=options.now||(()=>performance.now());this.started=0;this.metrics={decodeMs:0,applyMs:0,elapsedMs:0,chunks:0,bytes:0};}
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
     this.started=this.now();this.pending={...value,parts:[],received:0};this.timer=this.setTimer(()=>this.reject('RECEIVE_TIMEOUT'),10000);return null;
    }
    keys(value,['type','sessionId','epoch','revision']);
    if(value.type!=='end'||value.sessionId!==this.sessionId||value.epoch!==1||value.revision!==1||!this.pending)throw Error('WIRE_END');
    const pending=this.pending;
    if(pending.parts.length!==pending.chunks||pending.received!==pending.bytes)throw Error('MISSING_CHUNKS');
    const bytes=Buffer.concat(pending.parts);
    if(digest(bytes)!==pending.sha256)throw Error('CHECKSUM_MISMATCH');
    const decodedAt=this.now(),clean=decode(bytes,this.sessionId);this.metrics.decodeMs=this.now()-decodedAt;const appliedAt=this.now();this.apply(clean);this.metrics.applyMs=this.now()-appliedAt;this.metrics.elapsedMs=this.now()-this.started;this.metrics.chunks=pending.chunks;this.metrics.bytes=bytes.length;
    this.receipt={type:'ack',sessionId:this.sessionId,epoch:1,revision:1,bytes:bytes.length,sha256:pending.sha256};this.complete=true;this.clear();return this.receipt;
   }
   const bytes=Buffer.from(message instanceof ArrayBuffer?new Uint8Array(message):message),pending=this.pending;
   if(!pending||bytes.length<13||bytes.length>LIMITS.chunk+12||bytes.readUInt32BE(0)!==MAGIC||bytes.readUInt32BE(4)!==pending.parts.length)throw Error('WIRE_CHUNK');
   const size=bytes.readUInt32BE(8),expected=Math.min(LIMITS.chunk,pending.bytes-pending.received);
   if(size!==bytes.length-12||size!==expected||pending.parts.length>=pending.chunks)throw Error('WIRE_CHUNK_SIZE');
   pending.parts.push(Buffer.from(bytes.subarray(12)));pending.received+=size;return null;
  }catch(error){this.reject(error.message);throw error;}
 }
 state(){return {complete:this.complete,pendingBytes:this.pending?.received||0,rejected:this.rejected,lastRejection:this.lastRejection,rejectionCodes:this.rejectionCodes.slice(),receipt:this.receipt,metrics:{...this.metrics}};}
}
module.exports={MAGIC,LIMITS,FORMAT,frames,frameBytes,Receiver};
