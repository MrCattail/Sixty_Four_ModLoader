'use strict';
const path=require('path');
const ROOT=path.resolve('C:/tmp/sixtyfour-p2p-build-command13-20261028'),OLD_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-state-coverage13-20261027');
const INSTANCES=Object.freeze(['host','guest1','guest2','guest3']);
const POLICY=Object.freeze({serviceMs:30000,startupMs:90000,connectionMs:30000,receiveMs:10000,ipcMs:15000,shutdownMs:8000,automaticMs:180000});
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001',mode='automated',runId=process.env.CATTAIL_P2P_ROOM_RUN_ID||'',instance=process.env.CATTAIL_P2P_INSTANCE){
 if(process.env.CATTAIL_P2P_TOOL_ROOT&&path.resolve(process.env.CATTAIL_P2P_TOOL_ROOT)!==ROOT)throw Error('FOUR_ROOT_REQUIRED');
 if(!INSTANCES.includes(instance)||(instance==='host'?'host':'guest')!==role||!/^\d{3}$/.test(attempt)||!['automated','manual'].includes(mode)||!/^[a-f0-9]{32}$/.test(runId))throw Error('INVALID_FOUR_CONTEXT');
 const sceneSize=Number(process.env.CATTAIL_P2P_SCENE_SIZE??24),sceneOrder=process.env.CATTAIL_P2P_SCENE_ORDER||'canonical';if(![0,24,64,128,256].includes(sceneSize)||!['canonical','reverse'].includes(sceneOrder))throw Error('INVALID_SCENE_CONTEXT');
 return Object.freeze({sceneSize,sceneOrder,protocol:'p2p-desktop-13-v1',root:ROOT,role,instance,attempt,mode,runId,profile:path.join(ROOT,'data',attempt,instance),sessionId:'desktop13-snapshot-'+attempt,identity:'P2P_SYNTHETIC_BUILD_COMMAND_'+instance.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(cfg){return {steamId:cfg.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,OLD_ROOT,INSTANCES,POLICY,inside,config,preload};
