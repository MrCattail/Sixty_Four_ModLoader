'use strict';
const path=require('path');
const LEGACY_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-desktop13-20261024');
const PLAYER_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-player13-20261027');
const FOUR_ROOT=path.resolve('C:/tmp/sixtyfour-p2p-four13-20261027');
const FOUR_INSTANCES=Object.freeze(['host','guest1','guest2','guest3']);
function selectRoot(value){const resolved=path.resolve(value||LEGACY_ROOT);if(![LEGACY_ROOT,PLAYER_ROOT,FOUR_ROOT].includes(resolved))throw Error('UNAPPROVED_TEST_ROOT');return resolved;}
const ROOT=selectRoot(process.env.CATTAIL_P2P_TOOL_ROOT);
const MOD='Cattail_TweaksNetwork_P2P-Multiplayer';
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001',mode='automated',instance){
 if(!['host','guest'].includes(role)||!/^\d{3}$/.test(attempt))throw Error('INVALID_ROLE_OR_ATTEMPT');
 if(!['automated','manual'].includes(mode))throw Error('INVALID_LAUNCH_MODE');
 if(mode==='manual'&&![PLAYER_ROOT,FOUR_ROOT].includes(ROOT))throw Error('MANUAL_REQUIRES_PLAYER_ROOT');
 const four=ROOT===FOUR_ROOT;
 if(four&&(!FOUR_INSTANCES.includes(instance)||(instance==='host'?'host':'guest')!==role))throw Error('INVALID_FOUR_INSTANCE');
 if(!four&&instance!==undefined)throw Error('INSTANCE_REQUIRES_FOUR_ROOT');
 const profile=path.join(ROOT,'data',attempt,four?instance:role);
 return Object.freeze({protocol:'p2p-desktop-13-v1',root:ROOT,role,attempt,mode,...(four?{instance}:{}),profile,sessionId:(four?'desktop13-four-':'desktop13-')+attempt,identity:four?'P2P_SYNTHETIC_FOUR_'+instance.toUpperCase()+'_13':'P2P_SYNTHETIC_'+role.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(config){return {steamId:config.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,LEGACY_ROOT,PLAYER_ROOT,FOUR_ROOT,FOUR_INSTANCES,MOD,inside,selectRoot,config,preload};
