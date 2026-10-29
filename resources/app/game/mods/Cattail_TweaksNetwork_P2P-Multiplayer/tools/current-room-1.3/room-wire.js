'use strict';
const LABEL='cattail-p2p-room-snapshot13-experiment-v1';
const BINDING_KEYS=['kind','runId','sessionId','roomCode','hostPeerId','guestPeerId','role','generation'];
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))throw Error('ROOM_CONTROL_KEYS');}
function validateBinding(value,expected){
 exact(value,BINDING_KEYS);
 if(!['room-hello','room-ready'].includes(value.kind)||!['host','guest'].includes(value.role)||value.role===expected.role)throw Error('ROOM_ROLE');
 for(const key of ['runId','sessionId','roomCode','hostPeerId','guestPeerId','generation'])if(value[key]!==expected[key])throw Error('ROOM_BINDING');
 return true;
}
function install(window,config,world,codec,options={}){
 if(!config.localOnly||!/^[a-f0-9]{32}$/.test(config.runId))throw Error('ROOM_EXPERIMENT_REQUIRED');
 const setTimer=options.setTimer||((fn,ms)=>globalThis.setTimeout(fn,ms)),clearTimer=options.clearTimer||(id=>globalThis.clearTimeout(id));
 let channel=null,meta=null,binding=null,hello=false,remoteHello=false,remoteReady=false,pendingHello=null,ready=false,everReady=false,closed=false,terminal='',lastError='',sent=false,ack=null,expected=null,ackTimer=null,sentBytes=0,receivedBytes=0;
 const rejectionCodes=[];let rejected=0;
 const receiver=new codec.Receiver(config.sessionId,value=>{if(!ready||closed)throw Error('ROOM_NOT_READY');world.apply(value);},{setTimer,clearTimer});
 const reject=code=>{rejected++;rejectionCodes.push(code);if(rejectionCodes.length>16)rejectionCodes.shift();};
 function fail(code){lastError=code;world.notice(code);}
 function localReady(){return !closed&&channel?.readyState==='open'&&meta?.primaryReady===true&&meta?.direct===true&&world.state().ready&&!!binding;}
 function control(kind){return {...binding,kind,role:config.role};}
 function sendControl(value){const text=JSON.stringify(value);if(Buffer.byteLength(text)>1024)throw Error('ROOM_CONTROL_SIZE');channel.send(text);sentBytes+=Buffer.byteLength(text);}
 function receiveBinding(value){
  if(!localReady()){if(pendingHello)throw Error('ROOM_NOT_READY');pendingHello=value;return;}
  validateBinding(value,{...binding,role:config.role});
  if(value.kind==='room-hello'){if(remoteHello)throw Error('ROOM_DUPLICATE_HELLO');remoteHello=true;sendControl(control('room-ready'));}
  else {if(!hello||!remoteHello||remoteReady)throw Error('ROOM_READY_ORDER');remoteReady=true;}
  progress();
 }
 function progress(){
  if(!localReady())return;
  if(!hello){hello=true;sendControl(control('room-hello'));}
  if(pendingHello){const value=pendingHello;pendingHello=null;try{receiveBinding(value);}catch(error){reject(error.message);}}
  ready=hello&&remoteHello&&remoteReady;
  if(ready){everReady=true;world.setConnection(true);}
 }
 function end(reason='ROOM_CONNECTION_ENDED'){
  if(closed)return true;closed=true;ready=false;terminal=reason;clearTimer(ackTimer);ackTimer=null;receiver.clear();pendingHello=null;
  if(channel){channel.onmessage=null;channel.onclose=null;try{channel.close();}catch(error){}}
  world.setConnection(false,'\u6d4b\u8bd5\u5df2\u7ed3\u675f');return true;
 }
 async function transmit(list){
  if(!ready||closed||channel?.readyState!=='open')throw Error('ROOM_NOT_READY');
  for(const frame of list){
   if(closed||!ready)throw Error('ROOM_ENDED');
   if(channel.bufferedAmount>32768)await new Promise((resolve,rejectPromise)=>{
    let timer;const done=error=>{clearTimer(timer);channel.removeEventListener('bufferedamountlow',low);channel.removeEventListener('close',ended);error?rejectPromise(Error(error)):resolve();};
    const low=()=>done(),ended=()=>done('CHANNEL_CLOSED');timer=setTimer(()=>done('BACKPRESSURE_TIMEOUT'),10000);channel.addEventListener('bufferedamountlow',low,{once:true});channel.addEventListener('close',ended,{once:true});
   });
   if(closed||!ready)throw Error('ROOM_ENDED');channel.send(frame);sentBytes+=typeof frame==='string'?Buffer.byteLength(frame):frame.byteLength;
  }
 }
 const api={label:LABEL,
  attach(value){
   if(closed||channel||value.label!==LABEL||value.ordered!==true||value.maxRetransmits!==null||value.maxPacketLifeTime!==null){value.close();reject('WRONG_CHANNEL');return false;}
   channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=8192;
   channel.onopen=progress;channel.onclose=()=>end();channel.onerror=()=>fail('CHANNEL_ERROR');
   channel.onmessage=event=>{
    if(closed)return;receivedBytes+=typeof event.data==='string'?Buffer.byteLength(event.data):event.data.byteLength;
    try{
     let value;if(typeof event.data==='string'){if(Buffer.byteLength(event.data)>1024)throw Error('ROOM_CONTROL_SIZE');value=JSON.parse(event.data);}
     if(value?.kind){receiveBinding(value);return;}
     if(!ready)throw Error('ROOM_NOT_READY');
     if(config.role==='guest'){const reply=receiver.accept(event.data);if(reply)sendControl(reply);}
     else{
      if(typeof event.data!=='string'||Buffer.byteLength(event.data)>512)throw Error('ACK_FORMAT');exact(value,['type','sessionId','epoch','revision','bytes','sha256']);
      if(!sent||ack||value.type!=='ack'||value.sessionId!==config.sessionId||value.epoch!==1||value.revision!==1||value.bytes!==expected.bytes||value.sha256!==expected.sha256)throw Error('ACK_MISMATCH');
      ack=value;clearTimer(ackTimer);ackTimer=null;world.notice('\u5feb\u7167\u5df2\u786e\u8ba4\uff0c\u4e16\u754c\u53ea\u8bfb');
     }
    }catch(error){reject(error.message);if(world.state().fatal)fail('WORLD_CONSTRUCTION_FAILED');}
   };
   if(channel.readyState==='open')progress();return true;
  },
  update(value){
   if(closed)return;
   meta=value;
   if(!/^[A-Z0-9]{8}$/.test(value.roomCode||'')||!value.localPeerId||!value.remotePeerId)return;
   const next={runId:config.runId,sessionId:config.sessionId,roomCode:value.roomCode,hostPeerId:config.role==='host'?value.localPeerId:value.remotePeerId,guestPeerId:config.role==='guest'?value.localPeerId:value.remotePeerId,generation:value.generation};
   if(binding&&JSON.stringify(binding)!==JSON.stringify(next)){end('ROOM_BINDING_CHANGED');return;}
   binding=next;progress();
  },
  signal(value){if(everReady&&(!value.socketOpen||value.status!=='signaling-ready'))end('ROOM_SIGNAL_ENDED');},
  rejectChannel(){reject('WRONG_CHANNEL');},
  async send(){
   if(config.role!=='host')throw Error('ROLE_DENIED');if(sent)throw Error('SEND_ONCE');if(!ready||closed)throw Error('ROOM_NOT_READY');
   expected=codec.frames(world.capture(),config.sessionId);sent=true;ackTimer=setTimer(()=>{if(!ack&&!closed)fail('ACK_TIMEOUT');},10000);
   try{await transmit(expected.frames);}catch(error){if(!closed)fail(error.message);throw error;}
   world.notice('\u5df2\u53d1\u9001\uff0c\u7b49\u5f85\u786e\u8ba4');return {bytes:expected.bytes,sha256:expected.sha256};
  },
  async testInvalid(kind){
   if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');
   const valid=codec.frames(world.capture(),config.sessionId);let list;
   if(kind==='binding'){list=[JSON.stringify({...control('room-hello'),runId:'f'.repeat(32)})];}
   else if(kind==='old-session'){const header=JSON.parse(valid.frames[0]);header.sessionId='desktop13-snapshot-999';list=[JSON.stringify(header)];}
   else if(kind==='missing')list=[valid.frames[0],valid.frames.at(-1)];
   else if(kind==='checksum'){const header=JSON.parse(valid.frames[0]);header.sha256='0'.repeat(64);list=[JSON.stringify(header),...valid.frames.slice(1)];}
   else if(kind==='duplicate')list=[valid.frames[0]];
   else if(kind==='partial')list=[valid.frames[0],valid.frames[1]];
   else if(kind==='unknown'){
    const data=world.capture();data.entities[0].name='cube';const bytes=Buffer.from(JSON.stringify(data)),header=JSON.parse(valid.frames[0]);header.bytes=bytes.length;header.chunks=1;header.sha256=require('crypto').createHash('sha256').update(bytes).digest('hex');
    const chunk=Buffer.alloc(12+bytes.length);chunk.writeUInt32BE(codec.MAGIC,0);chunk.writeUInt32BE(0,4);chunk.writeUInt32BE(bytes.length,8);bytes.copy(chunk,12);list=[JSON.stringify(header),chunk,valid.frames.at(-1)];
   }else throw Error('UNKNOWN_NEGATIVE');
   await transmit(list);return true;
  },
  state(){return {role:config.role,open:ready&&!closed,sent,ack,expected:expected?{bytes:expected.bytes,sha256:expected.sha256}:null,receiver:receiver.state(),path:{path:meta?.direct?'direct':'unknown',sameMachine:meta?.direct===true},bindingReady:ready,handshake:{hello,remoteHello,remoteReady},rejected,rejectionCodes:rejectionCodes.slice(),closed,terminal,lastError,sentBytes,receivedBytes};},
  end,close:end
 };
 Object.defineProperty(api,'sent',{get:()=>sent});world.setWire(api);window.addEventListener('beforeunload',()=>end(),{once:true});return Object.freeze(api);
}
module.exports={LABEL,BINDING_KEYS,validateBinding,install};
