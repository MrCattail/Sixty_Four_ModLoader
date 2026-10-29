'use strict';
const crypto=require('crypto');
const commands=require('./build-command.js');
const FORMAT='p2p-build-command13-experiment-v1',SCENE='eight-basic-build-v1';
const TYPES=Object.freeze(['pump','pump2','conductor','silo','silo2','auxpump','consumer','preheater']);
const LIMITS=Object.freeze({bytes:65536,chunk:8192,chunks:8,entities:256,coordinate:64,resource:1e9});
const AUTHORITY=Object.freeze(['update','updateSoul','onmousedown','onmouseup','ondarkmousedown','ondarkhover','refill','tap','activate','onDelete','consume','release','boost','pumpTo','accept']);
const clone=value=>structuredClone(value),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))throw Error('SCHEMA_KEYS');}
function finite(value,min,max,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw Error('SCHEMA_NUMBER');return value;}
function validate(value,sessionId){
 exact(value,['format','sessionId','epoch','revision','sceneId','machinesBuild','resources','entities']);
 if(value.format!==FORMAT||value.sceneId!==SCENE||!/^desktop13-snapshot-\d{3}$/.test(value.sessionId)||value.sessionId!==sessionId||value.epoch!==1||!Number.isSafeInteger(value.machinesBuild)||value.machinesBuild<0||value.machinesBuild>255||value.revision!==value.machinesBuild+1)throw Error('SCHEMA_CONTEXT');
 if(!Array.isArray(value.resources)||value.resources.length!==10||!Array.isArray(value.entities)||value.entities.length>LIMITS.entities)throw Error('SCHEMA_COLLECTION');
 const ids=new Set(),positions=new Set();
 const entities=value.entities.map(row=>{
  exact(row,['netId','name','position','fields']);finite(row.netId,1,256,true);if(ids.has(row.netId))throw Error('DUPLICATE_ID');ids.add(row.netId);
  if(!TYPES.includes(row.name))throw Error('UNSUPPORTED_ENTITY');if(!Array.isArray(row.position)||row.position.length!==2)throw Error('SCHEMA_POSITION');
  const position=row.position.map(n=>finite(n,-64,64,true));if(positions.has(position.join(',')))throw Error('DUPLICATE_POSITION');positions.add(position.join(','));
  const keys=['soul'];if(['pump','pump2'].includes(row.name))keys.push('depth','spoolup');else if(row.name!=='conductor'){keys.push('fill','state');if(['silo','silo2'].includes(row.name))keys.push('dive','freeTimer');if(row.name==='consumer')keys.push('resources','resourceCount','timer','multiplicator');}
  exact(row.fields,keys);const f=row.fields,fields={soul:finite(f.soul,0,1)};
  if(['pump','pump2'].includes(row.name)){fields.depth=finite(f.depth,0,1e6);fields.spoolup=finite(f.spoolup,0,1);}
  else if(row.name!=='conductor'){
   fields.fill=finite(f.fill,0,1);if(![0,2].includes(f.state))throw Error('UNSUPPORTED_ENTITY_STATE');fields.state=f.state;
   if((f.state===0)!==(f.fill===0))throw Error('INCONSISTENT_ENTITY_STATE');
   if(['silo','silo2'].includes(row.name)){fields.dive=finite(f.dive,0,1);fields.freeTimer=finite(f.freeTimer,0,200);if(f.dive!==(f.state===2?1:0))throw Error('INCONSISTENT_ENTITY_STATE');}
   if(row.name==='consumer'){
    if(!Array.isArray(f.resources)||f.resources.length!==10)throw Error('SCHEMA_COLLECTION');fields.resources=f.resources.map(n=>finite(n,0,1023,true));fields.resourceCount=finite(f.resourceCount,0,1023,true);fields.timer=finite(f.timer,0,16000);fields.multiplicator=finite(f.multiplicator,1,9,true);
    if(fields.resources.reduce((a,b)=>a+b,0)!==fields.resourceCount||fields.timer===0&&fields.multiplicator!==1)throw Error('INCONSISTENT_ENTITY_STATE');
   }
  }
  return {netId:row.netId,name:row.name,position,fields};
 }).sort((a,b)=>a.netId-b.netId);
 const clean={format:FORMAT,sessionId:value.sessionId,epoch:1,revision:value.revision,sceneId:SCENE,machinesBuild:value.machinesBuild,resources:value.resources.map(n=>finite(n,0,LIMITS.resource)),entities};
 if(Buffer.byteLength(JSON.stringify(clean),'utf8')>LIMITS.bytes)throw Error('SNAPSHOT_TOO_LARGE');return clean;
}
function encode(value,sessionId){return Buffer.from(JSON.stringify(validate(value,sessionId)),'utf8');}
function decode(bytes,sessionId){const b=Buffer.from(bytes);if(!b.length||b.length>LIMITS.bytes)throw Error('SNAPSHOT_SIZE');const text=b.toString('utf8');if(!Buffer.from(text,'utf8').equals(b))throw Error('INVALID_UTF8');return validate(JSON.parse(text),sessionId);}
function sample(sessionId='desktop13-snapshot-001',count=24,order='canonical'){
 if(![0,24,64,128,256].includes(count)||!['canonical','reverse'].includes(order))throw Error('INVALID_SCENE_CONTEXT');
 const offsets={pump:[0,0],pump2:[0,1],conductor:[2,3],silo:[1,1],silo2:[2,2],auxpump:[1,0],consumer:[1,2],preheater:[2,1]};
 const entities=Array.from({length:count},(_,i)=>{const name=TYPES[i%8],group=Math.floor(i/8),stage=group%3,fill=[0,.5,1][stage],fields={soul:[0,.5,1][stage]};
  if(['pump','pump2'].includes(name))Object.assign(fields,{depth:[0,12.125,640][stage],spoolup:fill});
  else if(name!=='conductor'){Object.assign(fields,{fill,state:stage?2:0});if(['silo','silo2'].includes(name))Object.assign(fields,{dive:stage?1:0,freeTimer:[0,100,200][stage]});if(name==='consumer')Object.assign(fields,{resources:stage?[2*stage,0,4*stage,0,0,0,0,0,0,0]:new Array(10).fill(0),resourceCount:6*stage,timer:stage===0?0:stage===1?4000:16000,multiplicator:[1,3,9][stage]});}
  const base=[(group%8)*5-(count<=24?5:18),Math.floor(group/8)*6-(count<=24?1:9)],off=offsets[name];return {netId:i+1,name,position:[base[0]+off[0],base[1]+off[1]],fields};});
 if(order==='reverse')entities.reverse();return {format:FORMAT,sessionId,epoch:1,revision:1,sceneId:SCENE,machinesBuild:0,resources:[128,0,16384,0,0,0,0,0,0,0],entities};
}
function install(window,config,Game){
 if(!Game?.prototype||!['host','guest'].includes(config.role))throw Error('WORLD_CONTEXT');
 let game=null,ready=false,constructing=false,applied=false,fatal=false,blocked=0,cycles=0,frameCount=0,idMap=new WeakMap(),send=null,connected=false,notice='等待连接',hud=null;
 let commandBound=false,revision=1,commandFault='',initialReferences=new Map(),commandView={ready:false,text:''};
 const commandMetrics={nativeCreates:0,applies:0,rejectedDirectBindings:0};
 const now=()=>window.performance.now(),metrics={captures:0,diagnosticCaptures:0,lastCaptureMs:0,constructionMs:0,auditMs:0,applyMs:0};
 const prototype=Game.prototype,original={init:prototype.init,addEntity:prototype.addEntity,renderloop:prototype.renderloop};
 const denied=()=>{blocked++;return false;};
 function fieldsOf(e){const fields={soul:e.soul};if(['pump','pump2'].includes(e.name)){fields.depth=e.depth;fields.spoolup=e.spoolup;}else if(e.name!=='conductor'){fields.fill=e.fill;fields.state=e.state;if(['silo','silo2'].includes(e.name)){fields.dive=e.dive;fields.freeTimer=e.freeTimer;}if(e.name==='consumer')for(const k of ['resources','resourceCount','timer','multiplicator'])fields[k]=clone(e[k]);}return fields;}
 function capture(diagnostic=false){
  const started=now();if(!ready||fatal)throw Error('WORLD_NOT_READY');
  const entities=game.stuff.map(e=>({netId:idMap.get(e),name:e.name,position:e.position.slice(),fields:fieldsOf(e)}));
  const clean=validate({format:FORMAT,sessionId:config.sessionId,epoch:1,revision,sceneId:SCENE,machinesBuild:game.stats.machinesBuild??0,resources:game.resources.slice(),entities},config.sessionId);
  if(diagnostic)metrics.diagnosticCaptures++;else{metrics.captures++;metrics.lastCaptureMs=now()-started;}return clean;
 }
 function audit(){
  const started=now(),items=game.stuff,counts=Object.fromEntries(TYPES.map(n=>[n,0])),seen=new Set(),rows=[];
  const fail=()=>{throw Error('WORLD_GRAPH_MISMATCH');};
  function id(e){const v=idMap.get(e);if(!items.includes(e)||!Number.isInteger(v)||v<1||v>256)fail();return v;}
  if(Object.keys(game.stuffMap).length!==items.length)fail();
  const nearby=e=>e.soi.map(p=>game.entityAtCoordinates([e.position[0]+p[0],e.position[1]+p[1]])).filter(Boolean);
  for(const e of items){const netId=id(e);if(seen.has(netId)||!TYPES.includes(e.name)||!(e instanceof game.codex.entities[e.name].class)||game.stuffMap['u'+e.position[0]+'v'+e.position[1]]!==e)fail();seen.add(netId);counts[e.name]++;
   const row={netId,name:e.name},neighbors=nearby(e),silo=neighbors.some(n=>['silo','silo2'].includes(n.name));
   if(['pump','pump2'].includes(e.name)){const auxes=(e.auxes||[]).map(id).sort((a,b)=>a-b),expected=neighbors.filter(n=>n.name==='auxpump').map(id).sort((a,b)=>a-b);if(JSON.stringify(auxes)!==JSON.stringify(expected)||e.active!==false||e.hold!==false||e.surgeTimer||e.surgeBoost||e.conditionless)fail();row.auxes=auxes;row.pumpSpeed=e.pumpSpeed;}
   if(['auxpump','consumer','preheater'].includes(e.name)){if(e.isNextToSilo!==silo)fail();row.isNextToSilo=silo;}
   if(e.name==='preheater'){if(e.convertersNearby!==0||e.multiplicator!==.5||e.spriteState!==.25)fail();Object.assign(row,{convertersNearby:0,multiplicator:e.multiplicator,spriteState:e.spriteState});}
   if(e.name==='conductor'){const map=e.soi.filter((_,i)=>i%2===0).map(p=>{const n=game.entityAtCoordinates([e.position[0]+p[0],e.position[1]+p[1]]);return n&&['conductor','silo2'].includes(n.name)?'a':'b';}).join('');if(e.variant!==(e.variantMap[map]||0))fail();row.variant=e.variant;}
   if(e.chasmNetwork)fail();rows.push(row);
  }
  for(const [n,nCount]of Object.entries(game.entitiesInGame))if(nCount!==(counts[n]||0))fail();for(const n of TYPES)if((game.entitiesInGame[n]||0)!==counts[n])fail();
  const setIds=(set,names)=>{const result=[...set].map(e=>{if(!names.includes(e.name))fail();return id(e);}).sort((a,b)=>a-b);const want=items.filter(e=>names.includes(e.name)).map(id).sort((a,b)=>a-b);if(JSON.stringify(result)!==JSON.stringify(want))fail();return result;};
  const flags={perpetum:!!game.perpetum,gameIsLocked:!!game.gameIsLocked,excavatorWasBuilt:game.stats.excavatorWasBuilt};
  const expectedPerpetum=items.some(e=>['silo','silo2'].includes(e.name)&&nearby(e).some(n=>['silo','silo2'].includes(n.name))),expectedLocked=items.some(e=>e.name==='pump'&&nearby(e).length===8&&game.stats.totalResourcesMined[2]<1);
  if(flags.perpetum!==expectedPerpetum||flags.gameIsLocked!==expectedLocked||flags.excavatorWasBuilt!==(counts.pump2>0))fail();
  const graph={counts,pumps:setIds(game.pumps,['pump','pump2']),conductors:setIds(game.conductors,['conductor']),rows:rows.sort((a,b)=>a.netId-b.netId),flags};metrics.auditMs=now()-started;return graph;
 }
 function resetDerived(target){target.perpetum=false;target.gameIsLocked=false;target.stats.excavatorWasBuilt=false;}
 function build(target,entities){
  const started=now();constructing=true;resetDerived(target);
  try{
   const built=[];for(const row of entities){const e=original.addEntity.call(target,row.name,row.position,undefined,{skipShopUpdate:true});if(!e)throw Error('ENTITY_CONSTRUCTION_FAILED');idMap.set(e,row.netId);built.push([e,row]);}
   resetDerived(target);for(const [e]of built)e.init();for(const [e,row]of built)Object.assign(e,clone(row.fields));
   for(const [e]of built){for(const name of AUTHORITY)if(typeof e[name]==='function')e[name]=denied;const init=e.init;e.init=function(){if(!constructing)return denied();return init.apply(this,arguments);};}
  }finally{constructing=false;metrics.constructionMs=now()-started;}
 }
 function apply(value){
  if(config.role!=='guest'||!ready||fatal||applied||game.stuff.length)throw Error('WORLD_APPLY_STATE');const clean=validate(value,config.sessionId),started=now();if(clean.revision!==1||clean.machinesBuild!==0)throw Error('INITIAL_REVISION_REQUIRED');game.canvas.style.visibility='hidden';
  try{build(game,clean.entities);game.resources=clean.resources.slice();game.stats.machinesBuild=0;initialReferences=new Map(game.stuff.map(e=>[idMap.get(e),e]));audit();if(digest(encode(capture(true),config.sessionId))!==digest(encode(clean,config.sessionId)))throw Error('WORLD_ROUNDTRIP_MISMATCH');applied=true;game.canvas.style.visibility='';notice='已收到快照，世界只读';metrics.applyMs=now()-started;updateHud();return true;}
  catch(error){fatal=true;notice='快照构建失败';updateHud();throw Error('WORLD_CONSTRUCTION_FAILED');}
 }
 function commandState(){
  if(!ready||fatal)throw Error('WORLD_NOT_READY');
  const snapshot=capture(true),graph=audit();return {revision,stateHash:digest(Buffer.from(JSON.stringify({snapshot,graph})))};
 }
 function quote(request){
  commands.request(request);if(!ready||fatal)throw Error('NOT_READY');
  const snapshot=capture(true),maxId=Math.max(0,...snapshot.entities.map(e=>e.netId));
  if(snapshot.entities.length>=LIMITS.entities||maxId>=256)throw Error('ENTITY_LIMIT');
  const c=game.codex.entities.pump;
  if(!c?.canPurchase||c.isUpgradeTo||game.onlyones?.pump||!(game.unlockedEntities?.pump||c.shouldUnlock?.(game)))throw Error('UNAVAILABLE');
  if(game.plane)throw Error('WRONG_PLANE');
  if(game.isWithinMemoryComplex?.(request.position))throw Error('MEMORY_AREA');
  if(game.entityAtCoordinates(request.position))throw Error('OCCUPIED');
  const native=game.getRealPrice('pump'),price=Array.from({length:10},(_,i)=>native[i]||0);
  if(price.some(n=>!Number.isSafeInteger(n)||n<0)||price[2]!==256*2**(game.entitiesInGame.pump||0)||price.some((n,i)=>i!==2&&n!==0))throw Error('COMMAND_NATIVE_PRICE');
  if(price.some((n,i)=>game.resources[i]<n))throw Error('INSUFFICIENT_RESOURCES');
  return {entity:{netId:maxId+1,name:'pump',position:request.position.slice(),fields:{soul:1,depth:0,spoolup:0}},price,resourcesAfter:game.resources.map((n,i)=>n-price[i]),machinesBuildAfter:(game.stats.machinesBuild??0)+1};
 }
 function execute(plan,expected){
  if(!ready||fatal||constructing)throw Error('WORLD_COMMAND_STATE');
  const old=capture(true),references=new Map(game.stuff.map(e=>[idMap.get(e),e]));
  game.canvas.style.visibility='hidden';constructing=true;
  try{
   const e=original.addEntity.call(game,'pump',plan.entity.position.slice(),undefined,{skipShopUpdate:true});
   if(!e)throw Error('COMMAND_NATIVE_CONSTRUCTION');idMap.set(e,plan.entity.netId);commandMetrics.nativeCreates++;
   if(commandFault==='after-add')throw Error('INJECTED_COMMAND_APPLY_FAILURE');
   resetDerived(game);for(const item of game.stuff)item.init();
   for(const row of old.entities){const item=references.get(row.netId);if(!game.stuff.includes(item)||idMap.get(item)!==row.netId)throw Error('COMMAND_REFERENCE_CHANGED');Object.assign(item,clone(row.fields));}
   Object.assign(e,clone(plan.entity.fields));
   for(const name of AUTHORITY)if(typeof e[name]==='function')e[name]=denied;
   const init=e.init;e.init=function(){if(!constructing)return denied();return init.apply(this,arguments);};
   game.resources=plan.resourcesAfter.slice();game.stats.machinesBuild=plan.machinesBuildAfter;revision=old.revision+1;
   const after=capture(true);for(const row of old.entities){const actual=after.entities.find(item=>item.netId===row.netId);if(JSON.stringify(actual)!==JSON.stringify(row))throw Error('COMMAND_OLD_ENTITY_CHANGED');}
   const state=commandState();if(expected&&(state.revision!==expected.revision||state.stateHash!==expected.afterHash))throw Error('COMMAND_RESULT_STATE');
   commandMetrics.applies++;game.store?.compositionUpdate?.();game.canvas.style.visibility='';updateHud();return state;
  }catch(error){fatal=true;notice='建造应用失败，测试已结束';updateHud();throw Error('WORLD_COMMAND_FAILED');}
  finally{constructing=false;}
 }
 function bindCommands(){
  if(commandBound){commandMetrics.rejectedDirectBindings++;throw Error('COMMAND_CAPABILITY_ALREADY_BOUND');}commandBound=true;
  return Object.freeze({state:commandState,
   prepare(request){if(config.role!=='host')throw Error('COMMAND_ROLE');return quote(request);},
   apply(plan){if(config.role!=='host')throw Error('COMMAND_ROLE');return execute(plan);},
   applyGuest(value){
    if(config.role!=='guest'||!applied)throw Error('COMMAND_ROLE');
    const clean=commands.commit(value),before=commandState();if(clean.prevRevision!==before.revision||clean.beforeHash!==before.stateHash)throw Error('COMMAND_STATE_ORDER');
    const request={requestId:clean.requestId,epoch:1,baseRevision:before.revision,baseStateHash:before.stateHash,name:'pump',position:clean.entity.position};
    const plan=quote(request);
    for(const key of ['entity','price','resourcesAfter','machinesBuildAfter'])if(JSON.stringify(plan[key])!==JSON.stringify(clean[key]))throw Error('COMMAND_PLAN_MISMATCH');
    return execute(plan,clean);
   },
   makeRequest(requestId){if(config.role!=='guest')throw Error('COMMAND_ROLE');const state=commandState();return commands.request({requestId,epoch:1,baseRevision:state.revision,baseStateHash:state.stateHash,name:'pump',position:[...commands.TARGETS[Math.min(game.stats.machinesBuild??0,3)]]});},
   setView(value){commandView={ready:value.ready===true,text:String(value.text||'')};updateHud();},
   invalidate(){fatal=true;game.canvas.style.visibility='hidden';commandView.ready=false;notice='建造结果校验失败，测试已结束';updateHud();},
   setTestFailure(value){if(config.mode!=='automated'||!['','after-add'].includes(value))throw Error('TEST_MODE_ONLY');commandFault=value;}
  });
 }
 prototype.prepopulate=function(){this.stats.machinesBuild=0;if(config.role==='host'){const value=sample(config.sessionId,config.sceneSize,config.sceneOrder);build(this,value.entities);this.resources=value.resources.slice();initialReferences=new Map(this.stuff.map(e=>[idMap.get(e),e]));}else resetDerived(this);};
 prototype.initOrbifolds=function(){};
 prototype.updateLoop=function(){const t=now(),span=Math.min(t-this.time.lt,1000);this.time.lt=t;if(window.document.body.scrollTop!==0)window.document.body.scrollTop=0;window.CattailP2PEarlySession.noteTick();const done=this.updateCycle(span);this.clock?.postMessage(done);};
 prototype.updateCycle=function(span=16){cycles++;if(this.time){this.time.dt=Math.min(Math.max(Number(span)||16,0),100);this.time.realDt=this.time.dt;}if(ready&&!fatal&&this===game)this.updateTranslation(this.time.dt);return true;};
 prototype.renderloop=function(){frameCount++;return original.renderloop.apply(this,arguments);};
 for(const name of ['loadSave','simulateIdleTime','updateGamepad','updateAutoClicker','updateEntities','updateResourceInteractions','updateHollowEvents','updateSurge','updateAnalytics','updateAlfa','updateAlfaNodes','updateMemories','updateSlowdownEvent','processE','processQ','processClick','clearCell','relocate','finalizeErase','finalizeRelocation','finalizeCloning','pickupEntitiesForRelocation','pickupEntitiesForCloning','requestResources','triggerMemory','quickFinish'])if(typeof prototype[name]==='function')prototype[name]=denied;
 prototype.addEntity=function(){if(constructing)return original.addEntity.apply(this,arguments);return denied();};
 prototype.processDown=function(){if(this.mouse){this.mouse.originalPosition=this.mouse.xy.slice();this.mouse.positionChanged=false;}if(this.mouse?.state!==2)blocked++;};
 prototype.processUp=function(){if(this.mouse)this.mouse.originalPosition=null;blocked++;};
 prototype.processMove=function(){if(!this.mouse)return;this.mouse.positionChanged=!!this.mouse.originalPosition&&(Math.abs(this.mouse.xy[0]-this.mouse.originalPosition[0])+Math.abs(this.mouse.xy[1]-this.mouse.originalPosition[1])>1);if(this.mouse.state===2&&(this.mouse.delta[0]||this.mouse.delta[1])){this.translation[0]-=this.mouse.delta[0]*this.pixelRatio/this.zoom;this.translation[1]-=this.mouse.delta[1]*this.pixelRatio/this.zoom;}};
 for(const kind of ['keydown','keyup'])window.addEventListener(kind,event=>{const navigation=['Escape','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code);if(!navigation&&!((event.ctrlKey||event.metaKey)&&event.code==='KeyR')){blocked++;event.preventDefault();event.stopImmediatePropagation();}},true);
 function updateHud(){if(!hud)return;hud.info.textContent=(config.role==='host'?'主机':'客机')+' · '+(commandView.text||notice)+' · '+(game?.stuff?.length||0)+' 个建筑 / '+(new Set(game?.stuff?.map(e=>e.name)||[]).size)+' 类 · 建造资源 '+(game?.resources?.[2]??0)+' · 本轮建造 '+(game?.stats?.machinesBuild??0);if(hud.button)hud.button.disabled=!connected||!!send?.sent;if(hud.build)hud.build.disabled=!commandView.ready;}
 function makeHud(){const box=window.document.createElement('div');box.id='snapshot13-hud';box.style.cssText='position:fixed;left:12px;top:12px;z-index:999999;background:#15202bef;color:#fff;padding:12px;border-radius:6px;font:14px sans-serif;max-width:520px';const info=window.document.createElement('div');box.append(info);hud={box,info};if(config.role==='host'){const button=window.document.createElement('button');button.id='snapshot13-send';button.textContent='发送一次快照';button.style.cssText='margin-top:8px;padding:6px 12px';button.onclick=async()=>{try{await send?.send();updateHud();}catch(error){notice=error.message;updateHud();}};hud.button=button;box.append(button);}else{const button=window.document.createElement('button');button.id='build-command-request';button.textContent='申请建造泵';button.style.cssText='margin-top:8px;padding:6px 12px';button.onclick=()=>{try{send.requestBuild();}catch(error){notice='请等待连接和本轮确认';updateHud();}};hud.build=button;box.append(button);}const menu=window.document.createElement('button');menu.id='snapshot13-menu';menu.textContent='菜单';menu.style.cssText='margin-left:8px;padding:6px 12px';menu.onclick=()=>game.toggleSplash();box.append(menu);window.document.body.append(box);updateHud();}
 prototype.init=async function(){game=this;await original.init.apply(this,arguments);ready=true;audit();if(this.splash.isShown)this.splash.close();this.splash.updateMute(true);this.mute(true);makeHud();};
 function state(){let snapshot=null,graph=null;if(ready&&!fatal){snapshot=capture(true);graph=audit();}const graphSha256=graph?digest(Buffer.from(JSON.stringify(graph))):null;return {revision,machinesBuild:game?.stats?.machinesBuild??0,commandReady:commandView.ready,commandText:commandView.text,commandMetrics:{...commandMetrics},commandStateHash:snapshot?digest(Buffer.from(JSON.stringify({snapshot,graph}))):null,entityRows:snapshot?.entities||null,initialIdentityPreserved:[...initialReferences].every(([id,e])=>game?.stuff.includes(e)&&idMap.get(e)===id),ready,role:config.role,applied,fatal,blocked,cycles,frames:frameCount,entities:game?.stuff?.length||0,typeCount:graph?Object.values(graph.counts).filter(Boolean).length:0,resources:game?.resources?.slice(),sha256:snapshot?digest(encode(snapshot,config.sessionId)):null,camera:game?.translation?.slice(),zoom:game?.zoom,menuOpen:!!game?.splash?.isShown,graphSha256,graph,worldDigest:ready&&!fatal?digest(Buffer.from(JSON.stringify({snapshot,graph,stats:game.stats,onlyones:game.onlyones,alfa:game.alfa.currentEvents,memory:game.memoryBuffer}))):null,nativeTypes:ready?game.stuff.every(e=>e instanceof game.codex.entities[e.name].class):false,metrics:{...metrics},canvasVisible:game?.canvas?.style.visibility!=='hidden'};}
 return Object.freeze({capture,apply,state,bindCommands,setWire(value){send=value;},setConnection(value,text){connected=value;notice=text||(value?'连接就绪，世界只读':'等待连接');updateHud();},notice(text){notice=text;updateHud();}});
}
module.exports={FORMAT,SCENE,TYPES,LIMITS,AUTHORITY,validate,encode,decode,digest,sample,install};
