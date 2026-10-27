'use strict';
const path=require('path');
const LEGACY_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-desktop13-20261024');
const PLAYER_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-player13-20261027');
function selectRoot(value){const resolved=path.resolve(value||LEGACY_ROOT);if(![LEGACY_ROOT,PLAYER_ROOT].includes(resolved))throw Error('UNAPPROVED_TEST_ROOT');return resolved;}
const ROOT=selectRoot(process.env.CATTAIL_P2P_TOOL_ROOT);
const MOD='Cattail_TweaksNetwork_P2P-Multiplayer';
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001',mode='automated'){
 if(!['host','guest'].includes(role)||!/^\d{3}$/.test(attempt))throw Error('INVALID_ROLE_OR_ATTEMPT');
 if(!['automated','manual'].includes(mode))throw Error('INVALID_LAUNCH_MODE');
 if(mode==='manual'&&ROOT!==PLAYER_ROOT)throw Error('MANUAL_REQUIRES_PLAYER_ROOT');
 const profile=path.join(ROOT,'data',attempt,role);
 return Object.freeze({protocol:'p2p-desktop-13-v1',root:ROOT,role,attempt,mode,profile,identity:'P2P_SYNTHETIC_'+role.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(config){return {steamId:config.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,LEGACY_ROOT,PLAYER_ROOT,MOD,inside,selectRoot,config,preload};
