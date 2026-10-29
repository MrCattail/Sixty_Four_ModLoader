'use strict';
const commandModule=require('./build-command.js');
const LABEL='cattail-p2p-native-build13-experiment-v1';
const COMMAND_KINDS=['request','commit','ack','reject','ready'].map(n=>'room-command-'+n);
const BINDING_KEYS=['kind','runId','sessionId','roomCode','hostPeerId','guestPeerId','role','generation'];
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))throw Error('ROOM_CONTROL_KEYS');}
function validateBinding(value,expected,kind='hello'){
 const command=COMMAND_KINDS.includes(kind);exact(value,command?[...BINDING_KEYS,'command']:kind==='ack'?[...BINDING_KEYS,'ack']:BINDING_KEYS);
 if((command?value.kind!==kind:kind==='ack'?value.kind!=='room-ack':!['room-hello','room-ready'].includes(value.kind))||!['host','guest'].includes(value.role)||value.role===expected.role)throw Error('ROOM_ROLE');
 for(const key of ['runId','sessionId','roomCode','hostPeerId','guestPeerId','generation'])if(value[key]!==expected[key])throw Error('ROOM_BINDING');return true;
}
function install(window,config,world,codec,options={}){
 if(!config.localOnly||!/^[a-f0-9]{32}$/.test(config.runId)||!['host','guest'].includes(config.role))throw Error('ROOM_EXPERIMENT_REQUIRED');
 const setTimer=options.setTimer||((fn,ms)=>globalThis.setTimeout(fn,ms)),clearTimer=options.clearTimer||(id=>globalThis.clearTimeout(id));
 const sessions=new Map(),expectedCount=config.role==='host'?3:1;let context=null,expectedPeers=null,sent=false,expected=null,closed=false,terminal='',lastError='',captureCount=0,encodeCount=0,holdPeerId='';
 const now=()=>window.performance?.now?.()??performance.now(),metrics={captureMs:0,framingMs:0,allAckMs:null,startedAt:0};
 let ackOptions={delayMs:0,wrongGuestPeerId:'',suppress:false};const ackFaultTimers=new Set();
 const commandWorld=world.bindCommands?.(),guestLedger=new commandModule.GuestLedger(),commandAckTimers=new Map(),commandEvents=[];
 let arbiter=null,commandReady=false,requestSequence=0,pendingRequest=null,lastRejection=null,lastReadyRevision=0;
 let commandOptions={ackDelayMs:0,suppressAck:false,wrongGuestPeerId:'',holdCommitPeerId:'',corruptGuestPeerId:''};
 const commandFaultTimers=new Set();
 const event=(type,details={})=>{commandEvents.push({type,...details});if(commandEvents.length>64)commandEvents.shift();};
 const reasonText=reason=>({INSUFFICIENT_RESOURCES:'资源不足',BUSY:'上一笔尚未确认',STALE_REVISION:'状态已更新，请重试',STATE_MISMATCH:'状态不一致',OCCUPIED:'位置已占用',ENTITY_LIMIT:'建筑数量已达上限',NOT_READY:'请先完成初始同步',REQUEST_ID_REUSE:'请求编号已使用',UNAVAILABLE:'当前不可建造',WRONG_PLANE:'当前平面不可建造',MEMORY_AREA:'此处不可建造'})[reason]||'请求被拒绝';
 function commandView(text){if(requestSequence>=64)text='本局请求次数已用完，请重新开局';commandWorld?.setView({ready:commandReady&&!closed&&!terminal&&!pendingRequest&&requestSequence<64,text});}
 function canCommand(){return !closed&&!terminal&&aggregate().ready&&sent&&aggregate().acked===3;}
 function ensureArbiter(){
  if(config.role!=='host'||!commandWorld||!expectedPeers)return null;
  if(!arbiter)arbiter=new commandModule.HostArbiter({peers:[...expectedPeers],state:()=>commandWorld.state(),ready:canCommand,prepare:value=>commandWorld.prepare(value),apply:value=>commandWorld.apply(value)});
  return arbiter;
 }
 function readyPacket(){const current=commandWorld.state();return {epoch:1,revision:current.revision,stateHash:current.stateHash};}
 function announceReady(target=null){
  if(config.role!=='host'||!commandWorld||!canCommand()||ensureArbiter()?.pending)return;
  const value=readyPacket();if(!target&&lastReadyRevision===value.revision)return;
  if(!target)lastReadyRevision=value.revision;
  if(config.role==='host')pendingRequest=null;commandReady=true;commandView(lastRejection?'拒绝：'+reasonText(lastRejection.reason):value.revision===1?'初始同步已确认3/3，可以申请建造':'本笔建造已确认3/3，可以申请下一笔');
  for(const id of target?[target]:expectedPeers)sessions.get(id).sendCommand('ready',value);
 }
 function broadcastCommit(value){
  commandReady=false;lastRejection=null;commandView('建造已提交，客机确认0/3');event('host-committed',{commandId:value.commandId,actorPeerId:value.actorPeerId,requestId:value.requestId,revision:value.revision,afterHash:value.afterHash});
  for(const id of expectedPeers){
   if(config.mode==='automated'&&id===commandOptions.holdCommitPeerId){event('test-commit-held',{peerId:id,commandId:value.commandId});continue;}
   let packet=value;
   if(config.mode==='automated'&&id===commandOptions.corruptGuestPeerId)packet={...value,afterHash:'f'.repeat(64),commitHash:'0'.repeat(64)};
   sessions.get(id).sendCommand('commit',packet);
  }
  const timer=setTimer(()=>{commandAckTimers.delete(value.commandId);if(!closed&&!terminal&&arbiter?.pending){event('command-ack-timeout',{commandId:value.commandId});fail('COMMAND_ACK_TIMEOUT');}},10000);
  commandAckTimers.set(value.commandId,timer);
 }
 function sendCommandAck(endpoint,value){
  if(config.mode==='automated'&&commandOptions.wrongGuestPeerId)endpoint.sendCommand('ack',value,{guestPeerId:commandOptions.wrongGuestPeerId});
  if(config.mode==='automated'&&commandOptions.suppressAck)return;
  const delay=config.mode==='automated'?commandOptions.ackDelayMs:0;
  if(delay){const timer=setTimer(()=>{commandFaultTimers.delete(timer);if(!closed&&!terminal&&endpoint.isReady())endpoint.sendCommand('ack',value);},delay);commandFaultTimers.add(timer);}else endpoint.sendCommand('ack',value);
 }
 function receiveCommand(endpoint,value,binding){
  validateBinding(value,{...binding,role:config.role},value.kind);
  if(!endpoint.isReady()||closed||terminal)throw Error('ROOM_NOT_READY');
  const kind=value.kind.slice('room-command-'.length),data=value.command;
  if(config.role==='host'){
   if(!['request','ack'].includes(kind))throw Error('ROOM_ROLE');
   const machine=ensureArbiter();if(!machine)throw Error('COMMAND_WORLD_UNAVAILABLE');
   if(kind==='request'){
    commandModule.request(data);
    let result;try{result=machine.receive(endpoint.peerId,data);}catch(error){fail(world.state().fatal?'WORLD_COMMAND_FAILED':'COMMAND_INTERNAL_ERROR');return;}
    event('request-'+result.kind,{peerId:endpoint.peerId,requestId:data.requestId,replay:result.replay,reason:result.value?.reason||null});
    if(result.kind==='rejected'){lastRejection=result.value;endpoint.sendCommand('reject',result.value);if(!machine.pending)announceReady(endpoint.peerId);}
    else if(result.kind==='committed'){if(result.replay)endpoint.sendCommand('commit',result.value);else broadcastCommit(result.value);}
   }else{
    const complete=machine.acknowledge(endpoint.peerId,data);event('command-ack',{peerId:endpoint.peerId,commandId:data.commandId,complete});
    if(complete){clearTimer(commandAckTimers.get(data.commandId));commandAckTimers.delete(data.commandId);announceReady();}
    else if(machine.pending)commandView('建造已提交，客机确认'+machine.pending.acks.size+'/3');
   }
   return;
  }
  if(!commandWorld||!['commit','reject','ready'].includes(kind))throw Error('ROOM_ROLE');
  if(kind==='commit'){
   const wasApplied=guestLedger.applied.has(data?.commandId),wasReady=commandReady;commandReady=false;commandView('正在校验主机建造结果');
   try{
    const ack=guestLedger.receive(data,commandWorld.state(),input=>commandWorld.applyGuest(input));
    if(pendingRequest===data.requestId&&data.actorPeerId===context.localPeerId)pendingRequest=null;
    if(wasApplied){commandReady=wasReady;event('guest-commit-replay',{commandId:ack.commandId});commandView(commandReady?'本笔建造已确认3/3，可以申请下一笔':'等待三方确认');}else{lastRejection=null;event('guest-applied',{commandId:ack.commandId,revision:ack.revision,stateHash:ack.stateHash});commandView('已应用建造，等待三方确认');}sendCommandAck(endpoint,ack);
   }catch(error){const code=world.state().fatal?'WORLD_COMMAND_FAILED':'COMMAND_RESULT_INVALID';event('commit-rejected',{reason:error.message});commandWorld.invalidate();fail(code);}
  }else if(kind==='reject'){
   const clean=commandModule.validateRejection(data);event('guest-rejected',clean);
   if(pendingRequest===clean.requestId){pendingRequest=null;lastRejection=clean;commandView('拒绝：'+reasonText(clean.reason));}
  }else{
   commandModule.exact(data,['epoch','revision','stateHash']);const current=commandWorld.state();
   if(data.epoch!==1||data.revision!==current.revision||data.stateHash!==current.stateHash)throw Error('COMMAND_READY_MISMATCH');
   lastReadyRevision=data.revision;commandReady=true;commandView(lastRejection?'拒绝：'+reasonText(lastRejection.reason):data.revision===1?'初始同步完成，可以申请建造':'本笔建造已确认3/3，可以申请下一笔');
  }
 }
 const validPeer=id=>typeof id==='string'&&(config.role==='host'?/^guest-[1-9]\d{0,8}$/.test(id):id==='host');
 function aggregate(){const peers=expectedPeers?[...expectedPeers].map(id=>sessions.get(id)):[];return {peers,ready:!closed&&!terminal&&!!expectedPeers&&peers.length===expectedCount&&peers.every(p=>p?.isReady()),acked:peers.filter(p=>!!p?.ack).length};}
 function sync(){const a=aggregate();if(sent&&a.acked===expectedCount&&metrics.allAckMs===null)metrics.allAckMs=now()-metrics.startedAt;world.setConnection(a.ready,a.ready?'':'\u7b49\u5f85\u6240\u6709\u5ba2\u673a');if(config.role==='host'&&sent)world.notice(a.acked===expectedCount?'\u5feb\u7167\u5df2\u786e\u8ba4 3/3\uff0c\u4e16\u754c\u53ea\u8bfb':'\u5feb\u7167\u5df2\u786e\u8ba4 '+a.acked+'/3');if(config.role==='host')announceReady();}
 function fail(code){if(!lastError)lastError=code;if(!terminal)terminal=code;world.setConnection(false,'\u6d4b\u8bd5\u5df2\u7ed3\u675f');world.notice(code);commandReady=false;commandView('测试已结束：'+code);}
 function makeSession(peerId){
  let channel=null,meta=null,binding=null,hello=false,remoteHello=false,remoteReady=false,pendingHello=null,ready=false,ended=false,endReason='',error='',sentHere=false,sentComplete=false,ack=null,ackTimer=null,sentBytes=0,receivedBytes=0,backpressureWaitMs=0,sendMs=0;
  let lastChannelEvent=null;let rejected=0;const rejectionCodes=[];const reject=code=>{rejected++;rejectionCodes.push(code);if(rejectionCodes.length>16)rejectionCodes.shift();};
  const receiver=new codec.Receiver(config.sessionId,value=>{if(!ready||ended||config.role!=='guest')throw Error('ROOM_NOT_READY');world.apply(value);},{setTimer:(fn,ms)=>setTimer(()=>{fn();if(receiver.state().lastRejection==='RECEIVE_TIMEOUT')sessionFail('RECEIVE_TIMEOUT');},ms),clearTimer});
  const base=kind=>({...binding,kind,role:config.role});
  function localReady(){return !closed&&!ended&&!terminal&&expectedPeers?.has(peerId)&&context&&binding&&channel?.readyState==='open'&&meta?.primaryReady===true&&meta?.direct===true&&world.state().ready&&meta.roomCode===context.roomCode&&meta.localPeerId===context.localPeerId;}
  function sendControl(value){const text=JSON.stringify(value);if(Buffer.byteLength(text)>4096)throw Error('ROOM_CONTROL_SIZE');if(ended||channel?.readyState!=='open')throw Error('ROOM_NOT_READY');channel.send(text);sentBytes+=Buffer.byteLength(text);}
  function receiveBinding(value){if(!localReady()){if(pendingHello)throw Error('ROOM_NOT_READY');pendingHello=value;return;}validateBinding(value,{...binding,role:config.role});if(value.kind==='room-hello'){if(remoteHello)throw Error('ROOM_DUPLICATE_HELLO');remoteHello=true;sendControl(base('room-ready'));}else{if(!hello||!remoteHello||remoteReady)throw Error('ROOM_READY_ORDER');remoteReady=true;}progress();}
  function progress(){if(!localReady())return;if(!hello){hello=true;sendControl(base('room-hello'));}if(pendingHello){const p=pendingHello;pendingHello=null;try{receiveBinding(p);}catch(e){reject(e.message);}}ready=hello&&remoteHello&&remoteReady;sync();}
  function sessionFail(code){if(ended||closed||terminal)return;error=code;fail(code);}
  function end(reason='ROOM_CONNECTION_ENDED'){if(ended)return true;ended=true;ready=false;endReason=reason;clearTimer(ackTimer);ackTimer=null;receiver.clear();pendingHello=null;if(channel){channel.onmessage=null;channel.onclose=null;try{channel.close();}catch(e){}}if(!terminal)terminal=reason;sync();return true;}
  async function transmit(list){if(!ready||ended||terminal||channel?.readyState!=='open')throw Error('ROOM_NOT_READY');for(const frame of list){if(ended||terminal||!ready)throw Error('ROOM_ENDED');if(channel.bufferedAmount>32768)await new Promise((resolve,rejectPromise)=>{let timer,doneOnce=false;const waitedAt=now();const done=code=>{if(doneOnce)return;doneOnce=true;backpressureWaitMs+=now()-waitedAt;clearTimer(timer);channel.removeEventListener('bufferedamountlow',low);channel.removeEventListener('close',gone);code?rejectPromise(Error(code)):resolve();};const low=()=>done(),gone=()=>done('CHANNEL_CLOSED');timer=setTimer(()=>done('BACKPRESSURE_TIMEOUT'),10000);channel.addEventListener('bufferedamountlow',low,{once:true});channel.addEventListener('close',gone,{once:true});});if(ended||terminal||!ready)throw Error('ROOM_ENDED');channel.send(frame);sentBytes+=typeof frame==='string'?Buffer.byteLength(frame):frame.byteLength;}}
  function sendAck(reply){const packet={...base('room-ack'),ack:reply};if(config.mode==='automated'&&ackOptions.wrongGuestPeerId)sendControl({...packet,guestPeerId:ackOptions.wrongGuestPeerId});if(config.mode==='automated'&&ackOptions.suppress)return;const delay=config.mode==='automated'?ackOptions.delayMs:0;if(delay){const timer=setTimer(()=>{ackFaultTimers.delete(timer);if(!closed&&!ended&&!terminal)sendControl(packet);},delay);ackFaultTimers.add(timer);}else sendControl(packet);}
  const api={peerId,get ack(){return ack;},isReady:()=>ready&&!ended&&!closed&&!terminal,
   attach(value){if(closed||ended||channel||value.label!==LABEL||value.ordered!==true||value.maxRetransmits!==null||value.maxPacketLifeTime!==null){value.close();reject('WRONG_CHANNEL');return false;}channel=value;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=8192;channel.onopen=progress;channel.onclose=()=>end();channel.onerror=event=>{lastChannelEvent={type:'error',state:channel.readyState,ended,detail:String(event.error?.errorDetail||'').slice(0,64)};if(ended||closed||terminal)return;if(['closing','closed'].includes(channel.readyState)){end();return;}sessionFail('CHANNEL_ERROR');};channel.onmessage=event=>{if(ended||closed)return;receivedBytes+=typeof event.data==='string'?Buffer.byteLength(event.data):event.data.byteLength;try{let value;if(typeof event.data==='string'){if(Buffer.byteLength(event.data)>4096)throw Error('ROOM_CONTROL_SIZE');value=JSON.parse(event.data);}if(COMMAND_KINDS.includes(value?.kind)){receiveCommand(api,value,binding);return;}if(value?.kind&&value.kind!=='room-ack'){receiveBinding(value);return;}if(!ready||terminal)throw Error('ROOM_NOT_READY');if(config.role==='guest'){if(value?.kind)throw Error('ROOM_ROLE');const reply=receiver.accept(event.data);if(reply)sendAck(reply);}else{if(typeof event.data!=='string')throw Error('ACK_FORMAT');validateBinding(value,{...binding,role:config.role},'ack');const inner=value.ack;if(Buffer.byteLength(JSON.stringify(inner))>512)throw Error('ACK_FORMAT');exact(inner,['type','sessionId','epoch','revision','bytes','sha256']);if(!sentHere||ack||inner.type!=='ack'||inner.sessionId!==config.sessionId||inner.epoch!==1||inner.revision!==1||inner.bytes!==expected?.bytes||inner.sha256!==expected?.sha256)throw Error('ACK_MISMATCH');ack=inner;clearTimer(ackTimer);ackTimer=null;sync();}}catch(e){reject(e.message);if(world.state().fatal)sessionFail('WORLD_CONSTRUCTION_FAILED');}};if(channel.readyState==='open')progress();return true;},
   update(value){if(ended||closed)return;if(value.remotePeerId!==peerId||value.role!==config.role)throw Error('PEER_META_MISMATCH');meta=value;if(!/^[A-Z0-9]{8}$/.test(value.roomCode||'')||!value.localPeerId)return;if(context&&(value.roomCode!==context.roomCode||value.localPeerId!==context.localPeerId)){end('ROOM_BINDING_CHANGED');return;}const next={runId:config.runId,sessionId:config.sessionId,roomCode:value.roomCode,hostPeerId:config.role==='host'?value.localPeerId:peerId,guestPeerId:config.role==='guest'?value.localPeerId:peerId,generation:value.generation};if(binding&&JSON.stringify(binding)!==JSON.stringify(next)){end('ROOM_BINDING_CHANGED');return;}binding=next;progress();},
   async sendPrepared(value,partial=false){if(config.role!=='host'||sentHere)throw Error('SEND_ONCE');sentHere=true;const startedAt=now();try{await transmit(partial?value.frames.slice(0,2):value.frames);sendMs=now()-startedAt;if(partial)return;sentComplete=true;if(!ack)ackTimer=setTimer(()=>{if(!ack&&!ended&&!closed)sessionFail('ACK_TIMEOUT');},10000);}catch(e){if(!ended&&!closed)sessionFail(e.message);throw e;}},
   validateContext(value){if(meta&&(meta.roomCode!==value.roomCode||meta.localPeerId!==value.localPeerId))throw Error('ROOM_CONTEXT_MISMATCH');},
   rejectChannel(){reject('WRONG_CHANNEL');},progress,end,transmit,
   state(){return {peerId,open:ready&&!ended&&!closed&&!terminal,sent:sentHere,sentComplete,ack,receiver:receiver.state(),path:{path:meta?.direct?'direct':'unknown',sameMachine:meta?.direct===true},handshake:{hello,remoteHello,remoteReady},bindingReady:ready,rejected,rejectionCodes:rejectionCodes.slice(),closed:ended,terminal:endReason,lastError:error,sentBytes,receivedBytes,sendMs,backpressureWaitMs,lastChannelEvent};},
   sendCommand(kind,value,patch={}){if(!['request','commit','ack','reject','ready'].includes(kind))throw Error('COMMAND_KIND');sendControl({...base('room-command-'+kind),command:value,...patch});},control:base
  };return api;
 }
 const api={label:LABEL,
  requestBuild(position){
   if(!commandWorld)throw Error('ROLE_DENIED');
   if(!commandReady||pendingRequest||closed||terminal||!aggregate().ready)throw Error('COMMAND_NOT_READY');
   if(requestSequence>=64)throw Error('COMMAND_REQUEST_LIMIT');
   const value=commandWorld.makeRequest(requestSequence+1,position);requestSequence++;pendingRequest=value.requestId;lastRejection=null;commandReady=false;commandView('等待主机检查与扣费');
   event(config.role==='host'?'host-requested':'guest-requested',{request:structuredClone(value)});
   if(config.role==='host'){
    let result;try{result=ensureArbiter().submitLocal(value);}catch(error){fail(world.state().fatal?'WORLD_COMMAND_FAILED':'COMMAND_INTERNAL_ERROR');throw error;}
    if(result.kind==='rejected'){pendingRequest=null;lastRejection=result.value;event('request-rejected',{peerId:'host',...result.value,replay:result.replay});commandReady=true;commandView('拒绝：'+reasonText(result.value.reason));}
    else broadcastCommit(result.value);
   }else api.forPeer('host').sendCommand('request',value);
   return value;
  },
  testLocalRequest(value){if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');const result=ensureArbiter().submitLocal(value);if(result.kind==='committed'){if(!result.replay)broadcastCommit(result.value);}else event('request-rejected',{peerId:'host',...result.value,replay:result.replay});return result;},
  setTestCommand(value){
   if(config.mode!=='automated')throw Error('TEST_MODE_ONLY');
   const allowed=['ackDelayMs','suppressAck','wrongGuestPeerId','holdCommitPeerId','corruptGuestPeerId','applyFailure'];
   if(!value||Object.keys(value).some(k=>!allowed.includes(k))||value.ackDelayMs!==undefined&&(!Number.isFinite(value.ackDelayMs)||value.ackDelayMs<0||value.ackDelayMs>3000))throw Error('BAD_TEST_COMMAND');
   for(const key of ['wrongGuestPeerId','holdCommitPeerId','corruptGuestPeerId'])if(value[key]&&!/^guest-[1-9]\d{0,8}$/.test(value[key]))throw Error('BAD_TEST_COMMAND');
   if(value.applyFailure!==undefined)commandWorld?.setTestFailure(value.applyFailure?'after-add':'');
   commandOptions={...commandOptions,...value};return true;
  },
  testRequest(value,patch={}){if(config.mode!=='automated'||config.role!=='guest')throw Error('TEST_MODE_ONLY');api.forPeer('host').sendCommand('request',value,patch);return true;},
  testReplayCommit(peerId,commandId){if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');const row=arbiter?.history.get(commandId);if(!row)throw Error('COMMAND_UNKNOWN');api.forPeer(peerId).sendCommand('commit',row.value);return true;},
  testReplayAck(){if(config.mode!=='automated'||config.role!=='guest')throw Error('TEST_MODE_ONLY');const row=[...guestLedger.applied.values()].at(-1);if(!row)throw Error('COMMAND_UNKNOWN');api.forPeer('host').sendCommand('ack',commandModule.receipt(row));return true;},
  forPeer(peerId){if(!validPeer(peerId))throw Error('UNEXPECTED_PEER');if(expectedPeers&&!expectedPeers.has(peerId))throw Error('UNEXPECTED_PEER');if(!sessions.has(peerId)){if(sessions.size>=expectedCount)throw Error('TOO_MANY_PEERS');sessions.set(peerId,makeSession(peerId));}return sessions.get(peerId);},
  configureExpected(value){exact(value,['roomCode','localPeerId','remotePeerIds']);if(context)throw Error('EXPECTED_PEERS_ALREADY_SET');if(!/^[A-Z0-9]{8}$/.test(value.roomCode||'')||!Array.isArray(value.remotePeerIds)||value.remotePeerIds.length!==expectedCount||new Set(value.remotePeerIds).size!==expectedCount||value.remotePeerIds.some(id=>!validPeer(id))||(config.role==='host'?value.localPeerId!=='host':!/^guest-[1-9]\d{0,8}$/.test(value.localPeerId)))throw Error('INVALID_EXPECTED_PEERS');if([...sessions.keys()].some(id=>!value.remotePeerIds.includes(id)))throw Error('UNEXPECTED_PEER');for(const p of sessions.values())p.validateContext(value);context={roomCode:value.roomCode,localPeerId:value.localPeerId};expectedPeers=new Set(value.remotePeerIds);ensureArbiter();for(const id of expectedPeers){const p=api.forPeer(id),s=p.state();if(s.closed)throw Error('ROOM_ENDED');p.progress();}sync();return true;},
  signal(value){if(aggregate().ready&&(!value.socketOpen||value.status!=='signaling-ready'))api.end('ROOM_SIGNAL_ENDED');},
  async send(){if(config.role!=='host')throw Error('ROLE_DENIED');if(sent)throw Error('SEND_ONCE');if(!aggregate().ready)throw Error('ROOM_NOT_READY');sent=true;metrics.startedAt=now();captureCount++;const capturedAt=now(),value=world.capture();metrics.captureMs=now()-capturedAt;encodeCount++;const encodedAt=now();expected=codec.frames(value,config.sessionId);metrics.framingMs=now()-encodedAt;const results=await Promise.allSettled([...expectedPeers].map(id=>sessions.get(id).sendPrepared(expected,id===holdPeerId)));const bad=results.find(r=>r.status==='rejected');if(bad)throw bad.reason;sync();return {bytes:expected.bytes,sha256:expected.sha256,peers:expectedCount};},
  holdTestPeer(peerId){if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');if(sent||!expectedPeers?.has(peerId))throw Error('BAD_TEST_PEER');holdPeerId=peerId;return true;},
  setTestAck(value){if(config.mode!=='automated'||config.role!=='guest')throw Error('TEST_MODE_ONLY');if(!value||Object.keys(value).some(k=>!['delayMs','wrongGuestPeerId','suppress'].includes(k))||!Number.isFinite(value.delayMs||0)||(value.delayMs||0)<0||(value.delayMs||0)>3000||value.wrongGuestPeerId&&!/^guest-[1-9]\d{0,8}$/.test(value.wrongGuestPeerId))throw Error('BAD_TEST_ACK');ackOptions={delayMs:value.delayMs||0,wrongGuestPeerId:value.wrongGuestPeerId||'',suppress:value.suppress===true};return true;},
  async testInvalid(peerId,kind){if(config.mode!=='automated'||config.role!=='host')throw Error('TEST_MODE_ONLY');const p=api.forPeer(peerId),valid=codec.frames(world.capture(),config.sessionId);let list;if(kind==='binding')list=[JSON.stringify({...p.control('room-hello'),runId:'f'.repeat(32)})];else if(kind==='role')list=[JSON.stringify({...p.control('room-hello'),role:'guest'})];else if(kind==='old-session'){const h=JSON.parse(valid.frames[0]);h.sessionId='desktop13-snapshot-999';list=[JSON.stringify(h)];}else if(kind==='missing')list=[valid.frames[0],valid.frames.at(-1)];else if(kind==='checksum'){const h=JSON.parse(valid.frames[0]);h.sha256='0'.repeat(64);list=[JSON.stringify(h),...valid.frames.slice(1)];}else if(kind==='partial')list=[valid.frames[0],valid.frames[1]];else if(kind==='duplicate')list=[valid.frames[0]];else if(['unknown','bad-fields','too-many','legacy-format','order'].includes(kind)){const data=world.capture();if(kind==='unknown')data.entities[0].name='cube';if(kind==='bad-fields')data.entities[0].fields.depth=-1;if(kind==='too-many')data.entities=Array.from({length:257},(_,i)=>({...data.entities[0],netId:i+1,position:[i%32-16,Math.floor(i/32)-4]}));if(kind==='legacy-format')data.format='p2p-snapshot13-experiment-v1';const bytes=Buffer.from(JSON.stringify(data)),count=Math.ceil(bytes.length/8192),header=JSON.parse(valid.frames[0]);header.format=data.format;header.bytes=bytes.length;header.chunks=count;header.sha256=require('crypto').createHash('sha256').update(bytes).digest('hex');const parts=[];for(let i=0;i<count;i++){const part=bytes.subarray(i*8192,(i+1)*8192),chunk=Buffer.alloc(12+part.length);chunk.writeUInt32BE(codec.MAGIC,0);chunk.writeUInt32BE(kind==='order'?i+1:i,4);chunk.writeUInt32BE(part.length,8);part.copy(chunk,12);parts.push(chunk);}list=[JSON.stringify(header),...parts,valid.frames.at(-1)];}else throw Error('UNKNOWN_NEGATIVE');await p.transmit(list);return true;},
  state(){const a=aggregate(),peers=Object.fromEntries([...sessions].map(([id,p])=>[id,p.state()])),one=config.role==='guest'?Object.values(peers)[0]:null;return {commands:{ready:commandReady,requestSequence,pendingRequest,lastRejection,lastReadyRevision,host:arbiter?.state()||null,guest:guestLedger.state(),events:commandEvents.slice(),ackTimers:commandAckTimers.size},role:config.role,instance:config.instance,open:a.ready,bindingReady:a.ready,sent,expected:expected?{bytes:expected.bytes,sha256:expected.sha256,chunks:expected.chunks,totalFrameBytes:expected.totalFrameBytes}:null,expectedPeerCount:expectedCount,expectedPeerIds:expectedPeers?[...expectedPeers]:[],readyCount:a.peers.filter(p=>p?.isReady()).length,sentCount:a.peers.filter(p=>p?.state().sentComplete).length,ackedCount:a.acked,allAcknowledged:config.role==='host'&&sent&&a.acked===expectedCount,captureCount,encodeCount,metrics:{captureMs:metrics.captureMs,framingMs:metrics.framingMs,allAckMs:metrics.allAckMs},receiver:one?.receiver||null,path:{path:a.ready?'direct':'unknown',sameMachine:a.ready},peers,closed,terminal,lastError};},
  end(reason='ROOM_CONNECTION_ENDED'){if(closed)return true;closed=true;commandReady=false;commandView('测试已结束');for(const timer of commandAckTimers.values())clearTimer(timer);commandAckTimers.clear();for(const timer of commandFaultTimers)clearTimer(timer);commandFaultTimers.clear();if(!terminal)terminal=reason;for(const timer of ackFaultTimers)clearTimer(timer);ackFaultTimers.clear();for(const p of sessions.values())p.end(reason);sync();return true;},
  close(){return api.end();}
 };Object.defineProperty(api,'sent',{get:()=>sent});world.setWire(api);window.addEventListener('beforeunload',()=>api.end(),{once:true});return Object.freeze(api);
}
module.exports={LABEL,BINDING_KEYS,validateBinding,install};