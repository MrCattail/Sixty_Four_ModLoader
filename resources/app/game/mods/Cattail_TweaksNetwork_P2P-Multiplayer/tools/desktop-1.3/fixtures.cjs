'use strict';
const path=require('path');
const ROOT=path.resolve('C:/tmp/sixtyfour-p2p-desktop13-20261024');
const MOD='Cattail_TweaksNetwork_P2P-Multiplayer';
function inside(base,file){const rel=path.relative(path.resolve(base),path.resolve(file));return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function config(role,attempt='001'){
 if(!['host','guest'].includes(role)||!/^\d{3}$/.test(attempt))throw Error('INVALID_ROLE_OR_ATTEMPT');
 const profile=path.join(ROOT,'data',attempt,role);
 return Object.freeze({protocol:'p2p-desktop-13-v1',root:ROOT,role,attempt,profile,identity:'P2P_SYNTHETIC_'+role.toUpperCase()+'_13',expectedVersion:'1.3',localOnly:true,signalingUrl:'http://127.0.0.1:8787'});
}
function preload(config){return {steamId:config.identity,slots:{},languageId:0,steamAchievements:[],synthetic:true};}
module.exports={ROOT,MOD,inside,config,preload};
