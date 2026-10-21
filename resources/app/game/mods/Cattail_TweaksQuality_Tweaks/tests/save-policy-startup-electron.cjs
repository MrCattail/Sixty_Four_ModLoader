'use strict'
// Actual index.html, Game constructor/init, native preferences, scripts and DOM.
// Separate executable/resources/profile; synthetic saves and fake Steam only.
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const MOD = 'Cattail_TweaksQuality_Tweaks', BETTER = 'Cattail_TweaksQuality_Better-UIs'
function launch(root) {
  const i = process.argv.indexOf('--lab'); assert(i >= 0 && process.argv[i + 1], 'Explicit new --lab is required')
  const lab = path.resolve(process.argv[i + 1]), runtime = path.join(lab, 'runtime')
  assert(!fs.existsSync(lab), 'Use a new lab')
  assert(!runtime.startsWith(path.resolve(root) + path.sep), 'Keep runtime outside production')
  fs.mkdirSync(runtime, { recursive: true })
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isFile() && /\.(exe|dll|pak|dat|bin)$/i.test(e.name)) fs.copyFileSync(path.join(root,e.name),path.join(runtime,e.name))
  fs.cpSync(path.join(root,'locales'),path.join(runtime,'locales'),{recursive:true})
  const app=path.join(runtime,'resources/app'), game=path.join(app,'game'), source=path.join(root,'resources/app/game')
  fs.mkdirSync(game,{recursive:true})
  for(const name of ['scripts','img','font','modloader']) fs.cpSync(path.join(source,name),path.join(game,name),{recursive:true,filter:f=>name!=='modloader'||!/^(state|backups|tools)(\/|$)/.test(path.relative(path.join(source,name),f).replaceAll('\\','/'))})
  for(const e of fs.readdirSync(source,{withFileTypes:true})) if(e.isFile())fs.copyFileSync(path.join(source,e.name),path.join(game,e.name))
  for(const id of [MOD,BETTER])fs.cpSync(path.join(source,'mods',id),path.join(game,'mods',id),{recursive:true})
  fs.writeFileSync(path.join(game,'mods/enabled.json'),JSON.stringify({mods:[MOD,BETTER]}))
  fs.copyFileSync(path.join(root,'resources/app/main.js'),path.join(app,'native-main.txt'))
  fs.copyFileSync(__filename,path.join(app,'bootstrap.cjs'))
  fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'sf-native-startup-lab',version:'1.0.0',main:'bootstrap.cjs'}))
  fs.writeFileSync(path.join(app,'fixture-config.json'),JSON.stringify({lab}))
  const env={...process.env}
  for(const key of Object.keys(env))if(['appdata','localappdata','temp','tmp','electron_run_as_node','node_options'].includes(key.toLowerCase()))delete env[key]
  for(const [k,v]of[['APPDATA','appData'],['LOCALAPPDATA','localAppData'],['TEMP','temp'],['TMP','temp']]){env[k]=path.join(lab,'profile',v);fs.mkdirSync(env[k],{recursive:true})}
  const log=fs.openSync(path.join(lab,'process.log'),'a'),exe=path.join(runtime,'sixtyfour.exe')
  assert.notEqual(exe,path.join(root,'sixtyfour.exe'))
  const child=require('child_process').spawn(exe,[],{cwd:app,env,windowsHide:true,stdio:['ignore',log,log]})
  const timer=setTimeout(()=>child.kill(),110000)
  child.on('exit',code=>{clearTimeout(timer);fs.closeSync(log);const p=path.join(lab,'result.json'),result=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{status:'missing',code};console.log(JSON.stringify({...result,lab},null,2));process.exitCode=code===0&&result.status==='passed'?0:1})
  console.log('Native constructor startup lab: '+lab)
}
if(!process.versions.electron){module.exports={launch};if(require.main===module){const i=process.argv.indexOf('--root');assert(i>=0);launch(process.argv[i+1])}}
else{
  const {app,BrowserWindow,ipcMain,session}=require('electron'),{lab}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-config.json')))
  app.setPath('userData',path.join(lab,'profile/userData'));app.setPath('sessionData',path.join(lab,'profile/sessionData'));app.commandLine.appendSwitch('disable-background-networking')
  const result={status:'running',checks:[],errors:[],network:[],cases:[]},files=new Map(),writes=[];let win,bridge
  const check=(name,value)=>{assert(value,name);result.checks.push(name)}
  const record=n=>({isProtected:n===1,state:{stuff:[],resources:[64,8,4,0,0,0,0,0,0,0],timestamp:Date.now()-n*1000,unlockedEntities:{},modloader:{saveInstanceId:'11111111-1111-4111-8111-111111111111'}},permanents:{glory:[],completions:0,upgrades:0,orbUpgradeMap:[],memory:[],lastOrbPositions:new Array(6).fill(false)}})
  const baseline=[{name:'Existing manual',ownerHash:7,creationTimeStamp:100,lastModified:Date.now(),stack:[record(0),record(1)]}]
  files.set('charpsMemory',JSON.stringify(baseline))
  const cloud={fileExists:f=>files.has(f),readFile:f=>{if(!files.has(f))throw Error('Missing '+f);return files.get(f)},writeFile(f,data){files.set(f,data);writes.push(f);return true},deleteFile:f=>files.delete(f)}
  app.whenReady().then(async()=>{
    try{
      session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const ok=/^(file|devtools|data|about):/.test(d.url);if(!ok)result.network.push(d.url);done({cancel:!ok})})
      bridge=require('./game/modloader/main-process.js');bridge.configureSaveCloud(cloud)
      win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}})
      bridge.attachWindow(win,{accountId:'startup-synthetic-owner'})
      win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)result.errors.push(message)})
      const nativeMain=fs.readFileSync(path.join(__dirname,'native-main.txt'),'utf8'),store=nativeMain.slice(nativeMain.indexOf('ipcMain.on(`store`'),nativeMain.indexOf('ipcMain.on(`updateAccumulatedPlaytime`'))
      require('vm').runInNewContext(store,{ipcMain,ModLoaderMainProcess:bridge,client:{cloud},win,console})
      ipcMain.on('getMyStuff',e=>{bridge.clearTweaksSlotStore(e.sender);bridge.clearSnapshotContext(e.sender);const slots=bridge.readSaveOverlay(cloud,JSON.parse(files.get('charpsMemory')||'[]'));e.sender.send('hereYouGoSir',{steamId:'startup-synthetic-owner',slots,savePolicyLayout:slots.policyLayout,languageId:0,steamAchievements:[]})})
      fs.writeFileSync(path.join(__dirname,'game/fixture-startup.js'),String.raw`
        window.fixtureStartup={ready:false,error:null,nativePreferenceCalls:[],earlyPreference:null};
        const originalPreferences=Game.prototype.savePreferences;
        Game.prototype.savePreferences=function(...args){fixtureStartup.nativePreferenceCalls.push({splash:!!this.splash,explainer:!!this.explainer});return originalPreferences.apply(this,args)};
        const originalStage=ModLoader.stage.bind(ModLoader);
        ModLoader.stage=async function(name,game,payload){if(name==='afterVanillaScripts')fixtureStartup.earlyPreference=JSON.parse(localStorage.getItem('abstractv03_preferencesstartup-synthetic-owner')||'{}');return originalStage(name,game,payload)};
        const originalInit=Game.prototype.init;
        Game.prototype.init=function(...args){const p=originalInit.apply(this,args);p.then(()=>fixtureStartup.ready=true,e=>fixtureStartup.error=e.stack);return p};
        if(!localStorage.getItem('abstractv03_preferencesstartup-synthetic-owner'))localStorage.setItem('abstractv03_preferencesstartup-synthetic-owner',JSON.stringify({mute:true,languageId:0,currentSlotId:0,photofobia:false,chill:false,zoom:1,globalSoundVolume:.6,helpIsNeeded:-1,mobileExplainerPointer:-1,fixtureSentinel:{keep:true}}));
      `)
      const index=path.join(__dirname,'game/index.html');fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</head>','<script src="fixture-startup.js"></script></head>'))
      const evaluate=s=>win.webContents.executeJavaScript(s)
      async function load(name){
        await win.loadFile(index)
        for(let i=0;i<250;i++){if(await evaluate('!!(window.fixtureStartup?.ready||window.fixtureStartup?.error)'))break;await new Promise(r=>setTimeout(r,40))}
        const state=await evaluate('JSON.parse(JSON.stringify(fixtureStartup))');result.cases.push({name,...state});assert(state.ready,state.error||'Native Game.init did not finish')
      }
      await load('existing manual cold startup')
      check('Actual constructor/init reaches the menu without reading UI during save preparation',await evaluate('!!DEBUG.splash&&!!DEBUG.explainer&&fixtureStartup.nativePreferenceCalls.every(c=>c.splash&&c.explainer)'))
      check('Early selection update preserves mute, zoom and unrelated stored preference fields',await evaluate('fixtureStartup.earlyPreference.currentSlotId===20&&fixtureStartup.earlyPreference.mute===true&&fixtureStartup.earlyPreference.zoom===1&&fixtureStartup.earlyPreference.fixtureSentinel.keep'))
      check('The existing manual point and its protected history survive native initialization',await evaluate(`JSON.stringify(DEBUG.saveSlots[0].stack)===${JSON.stringify(JSON.stringify(baseline[0].stack))}`))
      check('Native menu and store DOM are present after the original rotating title is removed',await evaluate('!document.querySelector(".loading")&&!!document.querySelector(".splash")&&document.querySelector(".store").children.length>0'))
      await evaluate('DEBUG.resources[0]=777;DEBUG.saveGame()')
      check('Native savePreferences works after UI creation and persists active auto selection',await evaluate('JSON.parse(localStorage.getItem("abstractv03_preferencesstartup-synthetic-owner")).currentSlotId===20&&fixtureStartup.nativePreferenceCalls.length>0'))
      fs.writeFileSync(path.join(lab,'existing-startup.png'),(await win.webContents.capturePage()).toPNG())
      await load('auto resume on real reload')
      check('Reload continues the persisted auto through native Game.init',await evaluate('DEBUG.currentSlotId===20&&DEBUG.resources[0]===777&&DEBUG[Symbol.for("cattail.tweaks.save-policy")].sourceIndex()===0'))
      await evaluate(`ModLoader.forMod('${MOD}').config.set('enableAutoSaveStutterFix',false)`);await load('disabled policy cold initialization')
      check('Disabled policy keeps native initialization operational',await evaluate('!DEBUG[Symbol.for("cattail.tweaks.save-policy")]&&!!DEBUG.splash'))
      await evaluate(`ModLoader.forMod('${MOD}').config.set('enableAutoSaveStutterFix',true)`)
      files.clear();files.set('charpsMemory','[]')
      await evaluate('(async()=>{await new Promise((r,j)=>{const t=DEBUG.localDatabase.transaction("charps_memory_slots","readwrite");t.objectStore("charps_memory_slots").clear();t.oncomplete=r;t.onerror=j});localStorage.clear()})()')
      await load('new world cold initialization')
      check('Fresh native prepopulation starts with one auto and no invented manual point',await evaluate('DEBUG.currentSlotId===20&&DEBUG.saveSlots.filter(Boolean).length===1&&DEBUG[Symbol.for("cattail.tweaks.save-policy")].sourceIndex()===-1&&DEBUG.stuff.length>0'))
      check('No renderer error or network request',result.errors.length===0&&result.network.length===0)
      result.versions={electron:process.versions.electron,chrome:process.versions.chrome};result.status='passed'
    }catch(error){result.status='failed';result.error=error.stack}
    finally{result.writes=writes;fs.writeFileSync(path.join(lab,'result.json'),JSON.stringify(result,null,2));app.exit(result.status==='passed'?0:1)}
  })
}
