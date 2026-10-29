'use strict';
const path=require('path');
const ROOT=path.resolve('C:/tmp/sixtyfour-p2p-room-snapshot13-20261027');
const OLD_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-snapshot13-20261027');
const POLICY=Object.freeze({serviceMs:30000,startupMs:90000,connectionMs:30000,receiveMs:10000,ipcMs:15000,shutdownMs:8000,automaticMs:180000});
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001',mode='automated',runId=process.env.CATTAIL_P2P_ROOM_RUN_ID||''){
 if(process.env.CATTAIL_P2P_TOOL_ROOT&&path.resolve(process.env.CATTAIL_P2P_TOOL_ROOT)!==ROOT)throw Error('ROOM_ROOT_REQUIRED');
 if(!['host','guest'].includes(role)||!/^\d{3}$/.test(attempt)||!['automated','manual'].includes(mode)||!/^[a-f0-9]{32}$/.test(runId))throw Error('INVALID_ROOM_CONTEXT');
 return Object.freeze({protocol:'p2p-desktop-13-v1',root:ROOT,role,attempt,mode,runId,profile:path.join(ROOT,'data',attempt,role),sessionId:'desktop13-snapshot-'+attempt,identity:'P2P_SYNTHETIC_ROOM_SNAPSHOT_'+role.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(cfg){return {steamId:cfg.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,OLD_ROOT,POLICY,inside,config,preload};
