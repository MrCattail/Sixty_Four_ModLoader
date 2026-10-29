'use strict';
const {ipcRenderer}=require('electron');
const config=ipcRenderer.sendSync('desktop13:config');
const guard=require('./session-guard.cjs').install(window,config,ipcRenderer);
Object.defineProperty(window,'CattailP2PEarlySession',{value:guard,writable:false,configurable:false});
window.addEventListener('error',event=>guard.noteError('error',event.error?.message||event.message));
window.addEventListener('unhandledrejection',event=>guard.noteError('unhandledrejection',event.reason?.message||String(event.reason)));
document.addEventListener('DOMContentLoaded',()=>{
 try {guard.attachGame(window.eval('Game'));}catch(e){guard.noteError('attach',e.message);}
},{once:true});
