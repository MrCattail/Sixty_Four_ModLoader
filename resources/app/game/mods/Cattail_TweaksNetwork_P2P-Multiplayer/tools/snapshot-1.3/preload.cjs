'use strict';
const {ipcRenderer}=require('electron');
const config=ipcRenderer.sendSync('snapshot13:config');
const guard=require('./session-guard.cjs').install(window,config,ipcRenderer);
Object.defineProperty(window,'CattailP2PEarlySession',{value:guard,writable:false,configurable:false});
window.addEventListener('error',event=>guard.noteError('error',event.error?.message||event.message));
window.addEventListener('unhandledrejection',event=>guard.noteError('unhandledrejection',event.reason?.message||String(event.reason)));
document.addEventListener('DOMContentLoaded',()=>{
 try{
  const Game=window.eval('Game');guard.attachGame(Game);
  const world=require('./snapshot-world.js').install(window,config,Game);
  const wire=require('./snapshot-wire.js').install(window,config,world);
  Object.defineProperty(window,'Snapshot13',{value:Object.freeze({world,wire}),writable:false,configurable:false});
 }catch(error){guard.noteError('attach',error.message);}
},{once:true});
