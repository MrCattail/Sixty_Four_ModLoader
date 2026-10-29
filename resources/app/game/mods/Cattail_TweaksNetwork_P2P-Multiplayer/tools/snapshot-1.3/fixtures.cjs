'use strict';
const path = require('path');
const ROOT = path.resolve('C:/tmp/sixtyfour-p2p-snapshot13-20261027');
const OLD_ROOT = path.resolve('C:/tmp/sixtyfour-p2p-four13-20261027');
const MOD = 'Cattail_TweaksNetwork_P2P-Multiplayer';
const POLICY = Object.freeze({startupMs:90000,connectionMs:30000,receiveMs:10000,ipcMs:15000,shutdownMs:8000,automaticMs:180000});
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001',mode='automated'){
 if(process.env.CATTAIL_P2P_TOOL_ROOT&&path.resolve(process.env.CATTAIL_P2P_TOOL_ROOT)!==ROOT)throw Error('SNAPSHOT_ROOT_REQUIRED');
 if(!['host','guest'].includes(role)||!/^\d{3}$/.test(attempt)||!['automated','manual'].includes(mode))throw Error('INVALID_SNAPSHOT_CONTEXT');
 return Object.freeze({protocol:'p2p-desktop-13-v1',root:ROOT,role,attempt,mode,profile:path.join(ROOT,'data',attempt,role),sessionId:'desktop13-snapshot-'+attempt,identity:'P2P_SYNTHETIC_SNAPSHOT_'+role.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(cfg){return {steamId:cfg.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,OLD_ROOT,MOD,POLICY,inside,config,preload};
