'use strict';
const {app,BrowserWindow,ipcMain,session,screen,Menu}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),{fileURLToPath}=require('url');
const {ROOT,inside,config,preload}=require('./fixtures.cjs');
const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
let launchError='',baseConfig;
try{baseConfig=config(arg('p2p-role'),arg('attempt')||'001',arg('p2p-mode')||'automated');}
catch(error){launchError='INVALID_ROLE_ATTEMPT_OR_MODE';baseConfig={...config('host','999'),profile:path.join(ROOT,'data/rejected')};}
const cfg={...baseConfig,localAddresses:['127.0.0.1','::1',...Object.values(os.networkInterfaces()).flat().map(item=>item.address)]};
if(path.resolve(__dirname)!==path.join(ROOT,'runtime/resources/app'))throw Error('WRONG_RUNTIME_ROOT');
for(const folder of ['roaming','local','userData','sessionData','logs','crashes','temp'])fs.mkdirSync(path.join(cfg.profile,folder),{recursive:true});
for(const [key,folder]of Object.entries({appData:'roaming',userData:'userData',sessionData:'sessionData',temp:'temp',crashDumps:'crashes'}))app.setPath(key,path.join(cfg.profile,folder));
app.setAppLogsPath(path.join(cfg.profile,'logs'));
if(!launchError&&(process.env.CATTAIL_P2P_DESKTOP13!=='1'||process.env.CATTAIL_P2P_SAFE_TEST!=='1'||process.env.CATTAIL_P2P_ROLE!==cfg.role||process.env.CATTAIL_P2P_SESSION!=='desktop13-'+cfg.attempt||path.resolve(process.env.CATTAIL_P2P_TEST_ROOT||'')!==ROOT))launchError='INVALID_LAUNCH_CONTEXT';
function safeSend(message){if(!process.connected)return;try{process.send(message,()=>{});}catch(error){}}
function fatal(code,error){const out=path.join(ROOT,'reports',cfg.attempt);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,cfg.role+'-main-failure.json'),JSON.stringify({status:'FAIL',code,role:cfg.role,errorName:error?.name,knownMessage:/^(Cannot read properties of (null|undefined)|Object has been destroyed|Invalid value)/.test(String(error?.message))?error.message:undefined,sourceFrames:String(error?.stack||'').split('\n').slice(1).filter(line=>line.includes('main.cjs')||line.includes('main-process.js')||error?.message==='Object has been destroyed').slice(0,5)}));safeSend({fatal:code});app.exit(1);}
process.on('uncaughtException',error=>fatal('UNCAUGHT_MAIN_ERROR',error));
process.on('unhandledRejection',error=>fatal('UNHANDLED_MAIN_REJECTION',error));
if(launchError){const out=path.join(ROOT,'reports/rejections');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,Date.now()+'-'+process.pid+'.json'),JSON.stringify({status:'REJECTED',code:launchError,browserCreated:false,pathsConfined:true}));app.exit(2);}
const manual=cfg.mode==='manual',visible=manual&&arg('p2p-ui-check')!=='1';
app.disableHardwareAcceleration();
for(const sw of ['disable-background-networking','disable-component-update','disable-domain-reliability','no-proxy-server','disable-direct-composition'])app.commandLine.appendSwitch(sw);
app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost');
let win=null,generation=0,closing=false,shuttingDown=false;
const counters={networkCanceled:0,localRequests:0,externalCompleted:0,mainDenied:0,realSteamInitializations:0,realCloudCalls:0,consoleMessages:0};
ipcMain.on('desktop13:config',event=>{event.returnValue=cfg;});
for(const channel of ['save','store','achieve','updateStat','updateAccumulatedPlaytime','reset']){
 ipcMain.on(channel,()=>counters.mainDenied++);
 ipcMain.handle(channel,()=>{counters.mainDenied++;throw Error('ISOLATED_MAIN_WRITE_DENIED');});
}
ipcMain.on('gameError',()=>counters.consoleMessages++);
ipcMain.on('getMyStuff',event=>{if(!event.sender.isDestroyed())event.sender.send('hereYouGoSir',preload(cfg));});
const bridge=require('./game/modloader/main-process.js');
bridge.configureSaveCloud({fileExists:()=>false,readFile:()=>'',writeFile(){counters.realCloudCalls++;throw Error('CLOUD_DISABLED');}});
bridge.configureMainWindowHost({appOptions:{fullscreen:false,windowMode:'window',width:1280,height:800},saveAppOptions:()=>false});
function live(){return !!win&&!closing&&!win.isDestroyed()&&!win.webContents.isDestroyed();}
async function evaluate(code){
 if(!live())throw Error('WINDOW_UNAVAILABLE');
 const contents=win.webContents;
 try{return await contents.executeJavaScript(code);}
 catch(error){if(!live()||contents.isDestroyed())throw Error('WINDOW_UNAVAILABLE');throw error;}
}
function shutdown(){
 if(shuttingDown)return;shuttingDown=true;
 if(live()){if(manual)win.close();else win.destroy();}
 app.quit();
}
const commands={
 async status(){
  if(!live())return {lifecycle:'closed',generation};
  if(win.webContents.isLoadingMainFrame())return {lifecycle:'loading',generation};
  const result=await evaluate("(async()=>{const g=typeof DEBUG!=='undefined'?DEBUG:null;return {guard:window.CattailP2PEarlySession?.snapshot(),p2p:window.CattailP2PPhase2?.getStatus(),game:g?{version:g.version,entities:g.stuff?.length,store:!!g.store,images:Object.keys(g.images||{}).length,resources:Object.keys(g.resources||{}).length,camera:g.translation,canvas:{width:g.canvas?.width,height:g.canvas?.height},playTime:g.stats?.totalPlayAndIdleTime}:null,disk:await window.CattailP2PEarlySession?.diskSnapshot()}})()");
  return {...result,generation,mode:cfg.mode,visible};
 },
 async create(){return evaluate("CattailP2PPhase2.createRoom().then(s=>s.roomCode)");},
 async join(code){await evaluate("CattailP2PPhase2.joinRoom("+JSON.stringify(code)+").then(()=>true)");return true;},
 async probe(){return evaluate("CattailP2PPhase2.sendProbeToAll()");},
 async refresh(){return evaluate("CattailP2PPhase2.getStatus()");},
 evaluate,
 async screenshot(name){
  if(!/^[a-z0-9-]+$/.test(name))throw Error('BAD_SCREENSHOT_NAME');
  if(!live())throw Error('WINDOW_UNAVAILABLE');
  const contents=win.webContents,p=path.join(ROOT,'reports',cfg.attempt,cfg.role+'-'+name+'.png');
  const capture=await contents.capturePage();
  if(!live())throw Error('WINDOW_UNAVAILABLE');
  fs.writeFileSync(p,capture.toPNG());return p;
 },
 async reload(){if(!live())throw Error('WINDOW_UNAVAILABLE');win.webContents.reloadIgnoringCache();return true;},
 async summary(){return {pathsConfined:['appData','userData','sessionData','temp','crashDumps'].every(key=>inside(ROOT,app.getPath(key))),versions:process.versions,counters:{...counters},officialMainLoaded:false,mode:cfg.mode,visible,generation};},
 async shutdown(){setTimeout(shutdown,100);return true;}
};
process.on('message',async message=>{
 try{if(!Object.hasOwn(commands,message.method))throw Error('UNKNOWN_COMMAND');safeSend({id:message.id,result:await commands[message.method](message.value)});}
 catch(error){safeSend({id:message.id,error:String(error.message)});}
});
process.on('disconnect',()=>{if(manual)shutdown();});
app.whenReady().then(async()=>{
 const ses=session.defaultSession;
 ses.on('will-download',event=>event.preventDefault());
 ses.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
 ses.webRequest.onBeforeRequest((details,callback)=>{
  let allowed=false;
  try{const url=new URL(details.url);allowed=url.protocol==='file:'&&inside(ROOT,fileURLToPath(url))||['http:','ws:'].includes(url.protocol)&&url.hostname==='127.0.0.1'&&url.port==='8787'&&!url.username&&!url.password;
   if(allowed&&url.protocol!=='file:')counters.localRequests++;
  }catch(error){}
  if(!allowed)counters.networkCanceled++;
  callback({cancel:!allowed});
 });
 ses.webRequest.onCompleted(details=>{if(/^https?:|^wss?:/.test(details.url)&&!details.url.startsWith('http://127.0.0.1:8787/')&&!details.url.startsWith('ws://127.0.0.1:8787/'))counters.externalCompleted++;});
 let bounds={width:1280,height:800};
 if(visible){
  const area=screen.getPrimaryDisplay().workArea,parallel=area.width>=1440;
  const width=Math.min(parallel?Math.floor(area.width/2):1050,area.width),height=Math.min(800,area.height);
  bounds={width,height,x:area.x+(cfg.role==='guest'?(parallel?width:Math.min(80,Math.max(0,area.width-width))):0),y:area.y};
 }
 const opts=bridge.getMainWindowOptions({...bounds,show:visible,title:'Sixty Four P2P — '+cfg.role.toUpperCase()+' [008 local test]',webPreferences:{nodeIntegration:true,contextIsolation:false,sandbox:false,backgroundThrottling:false,offscreen:!manual,preload:path.join(__dirname,'preload.cjs')}});
 win=new BrowserWindow(opts);
 if(!manual)win.webContents.setFrameRate(30);
 bridge.attachWindow(win,{accountId:cfg.identity});bridge.afterMainWindowCreated(win);
 win.on('close',()=>{closing=true;safeSend({event:'closing',role:cfg.role});});
 win.on('closed',()=>{win=null;safeSend({event:'closed',role:cfg.role});});
 if(visible){
  win.on('page-title-updated',event=>event.preventDefault());
  win.setMenu(Menu.buildFromTemplate([{label:'测试',submenu:[{label:'重载此测试窗口',accelerator:'CmdOrCtrl+R',click(){if(live())win.webContents.reloadIgnoringCache();}},{label:'关闭此测试窗口',role:'close'}]}]));
 }
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file:'))event.preventDefault();});
 win.webContents.on('did-start-loading',()=>{generation++;safeSend({event:'loading',generation});});
 win.webContents.on('console-message',()=>counters.consoleMessages++);
 win.webContents.on('render-process-gone',()=>fatal('RENDERER_GONE'));
 await win.loadFile(path.join(__dirname,'game/index.html'));
 safeSend({event:'loaded',role:cfg.role});
}).catch(()=>fatal('MAIN_STARTUP_FAILED'));
app.on('window-all-closed',()=>app.quit());
setTimeout(()=>{
 if(manual){safeSend({event:'manual-timeout'});shutdown();}
 else app.exit(2);
},manual?15*60*1000:180000).unref();
