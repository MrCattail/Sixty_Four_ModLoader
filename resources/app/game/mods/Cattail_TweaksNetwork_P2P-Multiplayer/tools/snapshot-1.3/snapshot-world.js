'use strict';
const crypto=require('crypto');
const FORMAT='p2p-snapshot13-experiment-v1',SCENE='pump-conductor-silo-v1';
const LIMITS=Object.freeze({bytes:65536,chunk:8192,chunks:8,entities:64,coordinate:64,resource:1e9});
const clone=value=>structuredClone(value);
function exact(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==keys.slice().sort().join('|'))throw Error('SCHEMA_KEYS');
}
function finite(value,min,max,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw Error('SCHEMA_NUMBER');return value;}
function validate(value,sessionId){
 exact(value,['format','sessionId','epoch','revision','sceneId','resources','entities']);
 if(value.format!==FORMAT||value.sceneId!==SCENE||!/^desktop13-snapshot-\d{3}$/.test(value.sessionId)||value.sessionId!==sessionId||value.epoch!==1||value.revision!==1)throw Error('SCHEMA_CONTEXT');
 if(!Array.isArray(value.resources)||value.resources.length!==10||!Array.isArray(value.entities)||value.entities.length>LIMITS.entities)throw Error('SCHEMA_COLLECTION');
 const ids=new Set(),positions=new Set();
 const entities=value.entities.map(entity=>{
  exact(entity,['netId','name','position','fields']);finite(entity.netId,1,64,true);
  if(ids.has(entity.netId))throw Error('DUPLICATE_ID');ids.add(entity.netId);
  if(!Array.isArray(entity.position)||entity.position.length!==2)throw Error('SCHEMA_POSITION');
  const position=entity.position.map(n=>finite(n,-64,64,true)),key=position.join(',');
  if(positions.has(key))throw Error('DUPLICATE_POSITION');positions.add(key);
  let fields;
  if(entity.name==='pump'){exact(entity.fields,['depth']);fields={depth:finite(entity.fields.depth,0,1e6)};}
  else if(entity.name==='conductor'){exact(entity.fields,[]);fields={};}
  else if(entity.name==='silo'){exact(entity.fields,['fill','state']);if(![0,2].includes(entity.fields.state))throw Error('UNSUPPORTED_ENTITY_STATE');fields={fill:finite(entity.fields.fill,0,1),state:entity.fields.state};}
  else throw Error('UNSUPPORTED_ENTITY');
  return {netId:entity.netId,name:entity.name,position,fields};
 }).sort((a,b)=>a.netId-b.netId);
 const result={format:FORMAT,sessionId:value.sessionId,epoch:1,revision:1,sceneId:SCENE,resources:value.resources.map(n=>finite(n,0,LIMITS.resource)),entities};
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>LIMITS.bytes)throw Error('SNAPSHOT_TOO_LARGE');
 return result;
}
function encode(value,sessionId){return Buffer.from(JSON.stringify(validate(value,sessionId)),'utf8');}
function decode(bytes,sessionId){const buffer=Buffer.from(bytes);if(!buffer.length||buffer.length>LIMITS.bytes)throw Error('SNAPSHOT_SIZE');const raw=buffer.toString('utf8');if(!Buffer.from(raw,'utf8').equals(buffer))throw Error('INVALID_UTF8');return validate(JSON.parse(raw),sessionId);}
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function install(window,config,Game){
 if(!Game?.prototype||!['host','guest'].includes(config.role))throw Error('WORLD_CONTEXT');
 let game=null,ready=false,constructing=false,applied=false,fatal=false,blocked=0,cycles=0,frameCount=0,idMap=new WeakMap(),send=null,connected=false,notice='等待连接',hud=null;
 const prototype=Game.prototype,original={init:prototype.init,addEntity:prototype.addEntity,renderloop:prototype.renderloop};
 const denied=()=>{blocked++;return false;};
 function safeEntity(entity){
  for(const name of ['update','updateSoul','onmousedown','onmouseup','ondarkmousedown','ondarkhover','refill','tap','activate','onDelete'])if(typeof entity[name]==='function')entity[name]=denied;
 }
 function build(target,entities){
  constructing=true;
  try{for(const row of entities){const entity=original.addEntity.call(target,row.name,row.position,undefined,{skipShopUpdate:true});if(!entity)throw Error('ENTITY_CONSTRUCTION_FAILED');Object.assign(entity,clone(row.fields));entity.init();idMap.set(entity,row.netId);safeEntity(entity);}}
  finally{constructing=false;}
 }
 function capture(){
  if(!ready||fatal)throw Error('WORLD_NOT_READY');
  const entities=game.stuff.map(entity=>({netId:idMap.get(entity),name:entity.name,position:entity.position.slice(),fields:entity.name==='pump'?{depth:entity.depth}:entity.name==='silo'?{fill:entity.fill,state:entity.state}:{}}));
  return validate({format:FORMAT,sessionId:config.sessionId,epoch:1,revision:1,sceneId:SCENE,resources:game.resources.slice(),entities},config.sessionId);
 }
 function apply(value){
  if(config.role!=='guest'||!ready||fatal||applied||game.stuff.length)throw Error('WORLD_APPLY_STATE');
  const clean=validate(value,config.sessionId);
  const canvas=game.canvas;canvas.style.visibility='hidden';
  try{
   build(game,clean.entities);game.resources=clean.resources.slice();
   if(digest(encode(capture(),config.sessionId))!==digest(encode(clean,config.sessionId)))throw Error('WORLD_ROUNDTRIP_MISMATCH');
   applied=true;canvas.style.visibility='';notice='已收到快照，世界只读';updateHud();return true;
  }catch(error){fatal=true;notice='快照构建失败';updateHud();throw Error('WORLD_CONSTRUCTION_FAILED');}
 }
 prototype.prepopulate=function(){
  if(config.role==='host'){
   build(this,[{netId:1,name:'pump',position:[0,0],fields:{depth:0}},{netId:2,name:'conductor',position:[3,0],fields:{}},{netId:3,name:'silo',position:[6,0],fields:{fill:0,state:0}}]);
   this.resources=[128,0,64,0,0,0,0,0,0,0];
  }
 };
 prototype.initOrbifolds=function(){};
 prototype.updateLoop=function(){
  const now=window.performance.now(),span=Math.min(now-this.time.lt,1000);this.time.lt=now;
  if(window.document.body.scrollTop!==0)window.document.body.scrollTop=0;
  window.CattailP2PEarlySession.noteTick();const done=this.updateCycle(span);this.clock?.postMessage(done);
 };
 prototype.updateCycle=function(span=16){
  cycles++;
  if(this.time){this.time.dt=Math.min(Math.max(Number(span)||16,0),100);this.time.realDt=this.time.dt;}
  if(ready&&!fatal&&this===game)this.updateTranslation(this.time.dt);
  return true;
 };
 prototype.renderloop=function(){frameCount++;return original.renderloop.apply(this,arguments);};
 for(const name of ['loadSave','simulateIdleTime','updateGamepad','updateAutoClicker','updateEntities','updateResourceInteractions','updateHollowEvents','updateSurge','updateAnalytics','updateAlfa','updateAlfaNodes','updateMemories','updateSlowdownEvent','processE','processQ','processClick','clearCell','relocate','finalizeErase','finalizeRelocation','finalizeCloning','pickupEntitiesForRelocation','pickupEntitiesForCloning','requestResources','triggerMemory','quickFinish'])if(typeof prototype[name]==='function')prototype[name]=denied;
 prototype.addEntity=function(){if(constructing)return original.addEntity.apply(this,arguments);return denied();};
 prototype.processDown=function(){if(this.mouse){this.mouse.originalPosition=this.mouse.xy.slice();this.mouse.positionChanged=false;}if(this.mouse?.state!==2)blocked++;};
 prototype.processUp=function(){if(this.mouse)this.mouse.originalPosition=null;blocked++;};
 prototype.processMove=function(){
  if(!this.mouse)return;
  this.mouse.positionChanged=!!this.mouse.originalPosition&&(Math.abs(this.mouse.xy[0]-this.mouse.originalPosition[0])+Math.abs(this.mouse.xy[1]-this.mouse.originalPosition[1])>1);
  if(this.mouse.state===2&&(this.mouse.delta[0]||this.mouse.delta[1])){this.translation[0]-=this.mouse.delta[0]*this.pixelRatio/this.zoom;this.translation[1]-=this.mouse.delta[1]*this.pixelRatio/this.zoom;}
 };
 for(const kind of ['keydown','keyup'])window.addEventListener(kind,event=>{
  const navigation=['Escape','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code);
  if(!navigation&&!((event.ctrlKey||event.metaKey)&&event.code==='KeyR')){blocked++;event.preventDefault();event.stopImmediatePropagation();}
 },true);
 function updateHud(){if(!hud)return;hud.info.textContent=(config.role==='host'?'主机':'客机')+' · '+notice+' · '+(game?.stuff?.length||0)+' 个实体';if(hud.button)hud.button.disabled=!connected||!!send?.sent;}
 function makeHud(){
  const box=window.document.createElement('div');box.id='snapshot13-hud';box.style.cssText='position:fixed;left:12px;top:12px;z-index:999999;background:#15202beF;color:#fff;padding:12px;border-radius:6px;font:14px sans-serif;max-width:440px';
  const info=window.document.createElement('div');box.append(info);hud={box,info};
  if(config.role==='host'){
   const button=window.document.createElement('button');button.id='snapshot13-send';button.textContent='发送一次快照';button.style.cssText='margin-top:8px;padding:6px 12px';
   button.onclick=async()=>{try{await send?.send();updateHud();}catch(error){notice=error.message;updateHud();}};hud.button=button;box.append(button);
  }
  const menu=window.document.createElement('button');menu.id='snapshot13-menu';menu.textContent='菜单';menu.style.cssText='margin-left:8px;padding:6px 12px';menu.onclick=()=>game.toggleSplash();box.append(menu);
  window.document.body.append(box);updateHud();
 }
 prototype.init=async function(){game=this;await original.init.apply(this,arguments);ready=true;if(this.splash.isShown)this.splash.close();this.splash.updateMute(true);this.mute(true);makeHud();};
 function state(){
  let snapshot=null;if(ready&&!fatal)snapshot=capture();
  return {ready,role:config.role,applied,fatal,blocked,cycles,frames:frameCount,entities:game?.stuff?.length||0,resources:game?.resources?.slice(),sha256:snapshot?digest(encode(snapshot,config.sessionId)):null,camera:game?.translation?.slice(),zoom:game?.zoom,menuOpen:!!game?.splash?.isShown,worldDigest:ready?digest(Buffer.from(JSON.stringify({snapshot,stats:game.stats,onlyones:game.onlyones,alfa:game.alfa.currentEvents,memory:game.memoryBuffer}))):null,nativeTypes:ready?game.stuff.every(e=>e instanceof game.codex.entities[e.name].class):false};
 }
 return Object.freeze({capture,apply,state,setWire(value){send=value;},setConnection(value,text){connected=value;notice=text||(value?'连接就绪，世界只读':'等待连接');updateHud();},notice(text){notice=text;updateHud();}});
}
module.exports={FORMAT,SCENE,LIMITS,validate,encode,decode,digest,install};
