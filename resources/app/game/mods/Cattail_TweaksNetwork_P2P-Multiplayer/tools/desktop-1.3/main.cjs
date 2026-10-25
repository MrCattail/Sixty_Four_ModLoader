'use strict';
const {app,BrowserWindow,ipcMain,session}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),{fileURLToPath}=require('url');
const {ROOT,inside,config,preload}=require('./fixtures.cjs');
const arg=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
let launchError='';
let baseConfig;
try{baseConfig=config(arg('p2p-role'),arg('attempt')||'001');}catch(e){launchError='INVALID_ROLE_OR_ATTEMPT';baseConfig={...config('host','999'),profile:path.join(ROOT,'data/rejected')};}
const cfg={...baseConfig,localAddresses:['127.0.0.1','::1',...Object.values(os.networkInterfaces()).flat().map(x=>x.address)]};
if(path.resolve(__dirname)!==path.join(ROOT,'runtime/resources/app'))throw Error('WRONG_RUNTIME_ROOT');
for(const name of ['roaming','local','userData','sessionData','logs','crashes','temp'])fs.mkdirSync(path.join(cfg.profile,name),{recursive:true});
for(const [key,folder]of Object.entries({appData:'roaming',userData:'userData',sessionData:'sessionData',temp:'temp',crashDumps:'crashes'}))app.setPath(key,path.join(cfg.profile,folder));
app.setAppLogsPath(path.join(cfg.profile,'logs'));
if(!launchError&&(process.env.CATTAIL_P2P_DESKTOP13!=='1'||process.env.CATTAIL_P2P_SAFE_TEST!=='1'||process.env.CATTAIL_P2P_ROLE!==cfg.role||process.env.CATTAIL_P2P_SESSION!=='desktop13-'+cfg.attempt||path.resolve(process.env.CATTAIL_P2P_TEST_ROOT||'')!==ROOT))launchError='INVALID_LAUNCH_CONTEXT';
if(launchError){const out=path.join(ROOT,'reports/rejections');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,Date.now()+'-'+process.pid+'.json'),JSON.stringify({status:'REJECTED',code:launchError,browserCreated:false,pathsConfined:true}));app.exit(2);}
app.disableHardwareAcceleration();
for(const sw of ['disable-background-networking','disable-component-update','disable-domain-reliability','no-proxy-server','disable-direct-composition'])app.commandLine.appendSwitch(sw);
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
let win;
const counters={networkCanceled:0,localRequests:0,externalCompleted:0,mainDenied:0,realSteamInitializations:0,realCloudCalls:0,consoleMessages:0};
ipcMain.on('desktop13:config',event=>{event.returnValue=cfg;});
for(const channel of ['save','store','achieve','updateStat','updateAccumulatedPlaytime','reset']){
 ipcMain.on(channel,()=>counters.mainDenied++);
 ipcMain.handle(channel,()=>{counters.mainDenied++;throw Error('ISOLATED_MAIN_WRITE_DENIED');});
}
ipcMain.on('gameError',()=>{counters.consoleMessages++;});
ipcMain.on('getMyStuff',event=>event.sender.send('hereYouGoSir',preload(cfg)));
const bridge=require('./game/modloader/main-process.js');
bridge.configureSaveCloud({fileExists:()=>false,readFile:()=>'',writeFile(){counters.realCloudCalls++;throw Error('CLOUD_DISABLED');}});
bridge.configureMainWindowHost({appOptions:{fullscreen:false,windowMode:'window',width:1280,height:800},saveAppOptions:()=>false});
const commands={
 async status(){if(!win || win.webContents.isLoadingMainFrame())return {};return win.webContents.executeJavaScript("(async()=>{const g=typeof DEBUG!=='undefined'?DEBUG:null;return {guard:window.CattailP2PEarlySession?.snapshot(),p2p:window.CattailP2PPhase2?.getStatus(),game:g?{version:g.version,entities:g.stuff?.length,store:!!g.store,images:Object.keys(g.images||{}).length,resources:Object.keys(g.resources||{}).length,camera:g.translation,canvas:{width:g.canvas?.width,height:g.canvas?.height},playTime:g.stats?.totalPlayAndIdleTime}:null,disk:await window.CattailP2PEarlySession?.diskSnapshot()}})()");},
 async create(){return win.webContents.executeJavaScript("CattailP2PPhase2.createRoom().then(s=>s.roomCode)");},
 async join(code){await win.webContents.executeJavaScript("CattailP2PPhase2.joinRoom("+JSON.stringify(code)+").then(()=>true)");return true;},
 async probe(){return win.webContents.executeJavaScript("CattailP2PPhase2.sendProbeToAll()");},
 async refresh(){return win.webContents.executeJavaScript("CattailP2PPhase2.getStatus()").then(()=>win.webContents.executeJavaScript("true"));},
 async evaluate(code){return win.webContents.executeJavaScript(code);},
 async screenshot(name){if(!/^[a-z0-9-]+$/.test(name))throw Error('BAD_SCREENSHOT_NAME');const p=path.join(ROOT,'reports',cfg.attempt,cfg.role+'-'+name+'.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());return p;},
 async reload(){win.webContents.reloadIgnoringCache();return true;},
 async summary(){return {pathsConfined:['appData','userData','sessionData','temp','crashDumps'].every(k=>inside(ROOT,app.getPath(k))),versions:process.versions,counters:{...counters},officialMainLoaded:false};},
 async shutdown(){setTimeout(()=>{win?.destroy();app.quit();},50);return true;}
};
process.on('message',async m=>{try{if(!commands[m.method])throw Error('UNKNOWN_COMMAND');const result=await commands[m.method](m.value);process.send?.({id:m.id,result});}catch(e){process.send?.({id:m.id,error:String(e.message)});}});
app.whenReady().then(async()=>{
 const ses=session.defaultSession;
 ses.on('will-download',event=>event.preventDefault());
 ses.setPermissionRequestHandler((wc,p,callback)=>callback(false));
 ses.webRequest.onBeforeRequest((details,callback)=>{
  let allowed=false;
  try{const u=new URL(details.url);allowed=u.protocol==='file:'&&inside(ROOT,fileURLToPath(u))||['http:','ws:'].includes(u.protocol)&&u.hostname==='127.0.0.1'&&u.port==='8787'&&!u.username&&!u.password;
   if(allowed&&u.protocol!=='file:')counters.localRequests++;
  }catch(e){}
  if(!allowed)counters.networkCanceled++;
  callback({cancel:!allowed});
 });
 ses.webRequest.onCompleted(details=>{if(/^https?:|^wss?:/.test(details.url)&&!details.url.startsWith('http://127.0.0.1:8787/')&&!details.url.startsWith('ws://127.0.0.1:8787/'))counters.externalCompleted++;});
 const opts=bridge.getMainWindowOptions({show:false,width:1280,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false,offscreen:true,preload:path.join(__dirname,'preload.cjs')}});
 win=new BrowserWindow(opts);
 win.webContents.setFrameRate(30);
 bridge.attachWindow(win,{accountId:cfg.identity});bridge.afterMainWindowCreated(win);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file:'))e.preventDefault();});
 win.webContents.on('console-message',()=>counters.consoleMessages++);
 win.webContents.on('render-process-gone',(e,d)=>process.send?.({fatal:'RENDERER_'+d.reason}));
 await win.loadFile(path.join(__dirname,'game/index.html'));
 process.send?.({event:'loaded'});
}).catch(e=>{process.send?.({fatal:e.stack});app.exit(1);});
app.on('window-all-closed',()=>app.quit());
setTimeout(()=>app.exit(2),180000).unref();
