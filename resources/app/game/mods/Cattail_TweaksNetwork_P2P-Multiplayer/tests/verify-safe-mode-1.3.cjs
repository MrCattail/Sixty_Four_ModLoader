'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const mod=path.resolve(__dirname,'..'),safe=require(path.join(mod,'scripts/safe-mode.js'));
let checks=0;
function check(name,run){run();checks++;console.log('PASS '+name);}
check('ordinary mode never patches consumers',()=>{
 const ipc={send(){}},send=ipc.send,Game=function(){};
 const result=safe.install({config:{safeTest:false},audit:{record(){}},ipcRenderer:ipc,GameClass:Game});
 assert.equal(ipc.send,send);assert.equal(result.ipc.installed,false);
});
check('legacy safe mode keeps existing write blocking',()=>{
 const ipc={send:()=>true};const s=safe.installIpcGuard(ipc,{safeTest:true},{record(){}});
 assert.equal(ipc.send('save'),false);assert.equal(ipc.send('getMyStuff'),true);s.restore();assert.equal(ipc.send('save'),true);
});
check('desktop config is opt-in and roles are parsed',()=>{
 const c=safe.readLaunchConfig([],{CATTAIL_P2P_DESKTOP13:'1',CATTAIL_P2P_SAFE_TEST:'1',CATTAIL_P2P_ROLE:'guest'});
 assert.equal(c.desktop13,true);assert.equal(c.localOnly,true);assert.equal(c.role,'guest');
 assert.equal(safe.readLaunchConfig([],{}).desktop13,false);
});
check('desktop refuses absent early guard',()=>assert.throws(()=>safe.install({config:{safeTest:true,desktop13:true},audit:{record(){}}}),/early/));
check('desktop reuses context without disposing early protection',()=>{
 let validated=0;
 global.CattailP2PEarlySession={protocol:'p2p-desktop-13-v1',localOnly:true,validate(){validated++;}};
 const s=safe.install({config:{safeTest:true,desktop13:true},audit:{record(){}}});
 s.dispose();assert.equal(validated,1);assert.equal(s.context,global.CattailP2PEarlySession);
 delete global.CattailP2PEarlySession;
});
check('handshake has no guessed game version and room UI waits for readiness',()=>{
 const main=fs.readFileSync(path.join(mod,'scripts/main.js'),'utf8'),ui=fs.readFileSync(path.join(mod,'scripts/ui.js'),'utf8');
 assert.ok(main.includes('gameVersion: runtime.game.version'));assert.ok(!main.includes("'1.2.1'"));
 assert.ok(ui.includes('runtime.config.safeTest && ready'));assert.ok(main.includes('safety.context.markReady(game)'));
});
console.log('SAFE_MODE_13_VERIFY='+checks+'/'+checks);
