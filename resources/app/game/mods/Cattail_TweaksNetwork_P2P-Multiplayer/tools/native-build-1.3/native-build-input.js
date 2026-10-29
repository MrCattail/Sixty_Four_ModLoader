'use strict';
// Local selection/preview only. The callback submits a validated request, never a world mutation.
function install(window, game, view, request, notice) {
 const doc=window.document,canvas=game.canvas,store=game.store;
 if(!canvas?.addEventListener||!store?.html?.items?.pump||game.isMobile)throw Error('NATIVE_DESKTOP_INPUT_REQUIRED');
 const pickup=game.pickupItem,cleanup=game.cleanupInteractionMode;
 let gesture=null,selectedRevision=null,lastRevision=view().revision;
 const metrics={selections:0,cancellations:0,submitted:0,ignored:0,trustedDowns:0,lastPosition:null,lastCancel:'',lastRequest:null};
 const menuOpen=()=>!!game.splash?.isShown||!!doc.getElementById('modloader-panel');
 function cancel(reason='cancel') {
  if(selectedRevision!==null||game.itemInHand){metrics.cancellations++;metrics.lastCancel=reason;}
  selectedRevision=null;gesture=null;cleanup.call(game);delete game.itemInHandPriceTag;game.canPlace=false;
  if(game.mouse){game.mouse.originalPosition=null;game.mouse.positionChanged=false;game.mouse.state=0;}
 }
 function available(){
  if(!view().ready||menuOpen()||game.plane||game.stuff.length>=256)return false;
  const price=game.getRealPrice('pump');return price.every((n,i)=>!n||game.resources[i]>=n);
 }
 function restrict(){
  for(const [name,card]of Object.entries(store.html.items)){
   const allowed=name==='pump'&&available();
   if(!allowed)card.classList.add('disabled');
   card.setAttribute('aria-disabled',String(!allowed));
   if(name!=='pump')card.title='本次测试仅支持普通泵';
  }
  for(const name of ['eraser','relocator'])if(store.html[name]){store.html[name].classList.add('disabled');store.html[name].setAttribute('aria-disabled','true');}
 }
 function sync(){
  const revision=view().revision;
  if(revision!==lastRevision){lastRevision=revision;cancel('world-updated');}
  if(menuOpen()&&(selectedRevision!==null||gesture))cancel('menu');
  restrict();
 }
 game.pickupItem=function(name){
  sync();if(name!=='pump'||!available()){metrics.ignored++;notice(name==='pump'?'请等待同步完成，并确认资源足够':'本次测试仅支持普通泵');return false;}
  cancel('reselect');pickup.call(game,'pump');selectedRevision=view().revision;metrics.selections++;game.canPlace=false;return true;
 };
 const visibility=store.visibilityUpdate;
 store.visibilityUpdate=function(){const result=visibility.apply(this,arguments);sync();return result;};
 const toggle=game.toggleSplash;game.toggleSplash=function(){cancel('menu');return toggle.apply(this,arguments);};
 const show=game.splash.show;game.splash.show=function(){cancel('menu');return show.apply(this,arguments);};
 game.processMouseout=function(){cancel('leave');this.mouse.cursorVisible=false;this.selectedEntity=false;this.removeHint();};
 const pointer=event=>{const r=canvas.getBoundingClientRect();game.updatePointerState({sxy:[event.clientX-r.left,event.clientY-r.top],button:event.buttons});};
 const swallow=event=>{event.preventDefault();event.stopImmediatePropagation();};
 canvas.addEventListener('mousedown',event=>{
  swallow(event);sync();pointer(event);game.mouse.cursorVisible=true;
  if(!event.isTrusted||![0,2].includes(event.button)||menuOpen()){gesture=null;metrics.ignored++;return;}
  gesture={button:event.button,x:event.clientX,y:event.clientY,dragged:false,revision:view().revision};metrics.trustedDowns++;
 },true);
 canvas.addEventListener('mousemove',event=>{
  swallow(event);pointer(event);sync();
  if(gesture&&(Math.abs(event.clientX-gesture.x)+Math.abs(event.clientY-gesture.y)>1))gesture.dragged=true;
  if(gesture?.button===2&&(event.buttons&2)){
   game.translation[0]-=game.mouse.delta[0]*game.pixelRatio/game.zoom;
   game.translation[1]-=game.mouse.delta[1]*game.pixelRatio/game.zoom;
  }
  const p=game.hoveredCell;
  game.canPlace=selectedRevision!==null&&available()&&p.every(n=>Number.isInteger(n)&&Math.abs(n)<=64)&&!game.entityAtCoordinates(p)&&!game.isWithinMemoryComplex?.(p);
 },true);
 canvas.addEventListener('mouseup',event=>{
  swallow(event);pointer(event);sync();const g=gesture;gesture=null;game.mouse.state=0;
  if(!event.isTrusted||!g||g.button!==event.button){metrics.ignored++;return;}
  if(g.button===2){if(!g.dragged)cancel('right-click');return;}
  const dragged=g.dragged||Math.abs(event.clientX-g.x)+Math.abs(event.clientY-g.y)>1;
  if(dragged){cancel('drag');return;}
  if(selectedRevision===null||selectedRevision!==g.revision||selectedRevision!==view().revision||!available()){metrics.ignored++;return;}
  const position=game.hoveredCell.slice();
  if(position.some(n=>!Number.isInteger(n)||Math.abs(n)>64)){notice('位置超出本次测试范围');cancel('position');return;}
  if(game.entityAtCoordinates(position)||game.isWithinMemoryComplex?.(position)){notice('此处不可建造');cancel('position');return;}
  cancel('submitted');
  try{const value=request(position);metrics.submitted++;metrics.lastPosition=position;metrics.lastRequest=value;}
  catch(error){notice(error.message==='WORLD_COMMAND_FAILED'?'建造失败，测试已结束':error.message==='COMMAND_REQUEST_LIMIT'?'本局请求次数已用完，请重新开局':'请等待本轮同步确认');}
  sync();
 },true);
 doc.addEventListener('mousedown',event=>{if(event.target!==canvas)cancel('outside');},true);
 doc.addEventListener('mouseup',event=>{if(event.target!==canvas&&gesture)cancel('outside-release');},true);
 window.addEventListener('blur',()=>cancel('blur'),true);
 window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&selectedRevision!==null){swallow(event);cancel('escape');}
 },true);
 for(const name of ['eraser','relocator'])store.html[name]?.addEventListener('mousedown',event=>{swallow(event);cancel('unsupported-tool');notice('本次测试仅支持普通泵');},true);
 const observer=new window.MutationObserver(()=>{if(menuOpen()&&(selectedRevision!==null||gesture))cancel('menu');});
 observer.observe(doc.body,{childList:true,subtree:true});
 sync();
 return Object.freeze({sync,state(){return {...metrics,selected:selectedRevision!==null,selectedRevision,gesture:gesture?{...gesture}:null,pumpDisabled:store.html.items.pump.classList.contains('disabled'),menuOpen:menuOpen()};}});
}
module.exports={install};
