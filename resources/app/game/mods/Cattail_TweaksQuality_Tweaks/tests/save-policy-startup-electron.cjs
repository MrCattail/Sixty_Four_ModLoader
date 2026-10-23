'use strict'
// Actual candidate main/index/SDK/IndexedDB; explicit isolated runtime only.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),cp=require('child_process'),crypto=require('crypto')
const MOD='Cattail_TweaksQuality_Tweaks',OWNER='startup-synthetic-owner'
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex')
async function run(){
 const arg=n=>{const i=process.argv.indexOf(n);assert(i>=0&&process.argv[i+1],'Explicit '+n+' required');return path.resolve(process.argv[i+1])}
 assert(process.argv.includes('--run'),'Explicit --run required')
 const lab=arg('--lab'),binary=arg('--runtime'),root=path.resolve(__dirname,'../../../../../..'),runtime=path.join(lab,'runtime'),appDir=path.join(runtime,'resources/app'),exe=path.join(runtime,'sixtyfour.exe')
 assert(!fs.existsSync(lab),'Use a new lab');assert(!lab.toLowerCase().startsWith(root.toLowerCase()+path.sep));assert.notEqual(binary.toLowerCase(),root.toLowerCase())
 fs.mkdirSync(appDir,{recursive:true})
 for(const e of fs.readdirSync(binary,{withFileTypes:true}))if(e.isFile()&&/\.(exe|dll|pak|dat|bin)$/i.test(e.name))fs.copyFileSync(path.join(binary,e.name),path.join(runtime,e.name))
 fs.cpSync(path.join(binary,'locales'),path.join(runtime,'locales'),{recursive:true})
 fs.cpSync(path.join(root,'resources/app'),appDir,{recursive:true,filter:f=>!/(^|\/)(state|backups)(\/|$)/.test(path.relative(path.join(root,'resources/app'),f).replaceAll('\\','/'))})
 fs.cpSync(path.join(binary,'resources/app/node_modules'),path.join(appDir,'node_modules'),{recursive:true})
 fs.copyFileSync(__filename,path.join(appDir,'bootstrap.cjs'))
 fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({name:'save-wiring-candidate-only',version:'1.0.0',main:'bootstrap.cjs'}))
 fs.writeFileSync(path.join(appDir,'fixture-config.json'),JSON.stringify({lab}))
 const seed=[
 "window.fixtureStartup={ready:false,error:null,frames:0,errors:[]};window.addEventListener('error',e=>{if(e.error)fixtureStartup.errors.push(e.error.name)});",
 "const nativeInit=Game.prototype.init;Game.prototype.init=function(...args){const p=nativeInit.apply(this,args);p.then(()=>fixtureStartup.ready=true,e=>fixtureStartup.error={name:e.name,code:e.code||'',message:e.message});return p};",
 "const nativeStage=ModLoader.stage.bind(ModLoader);ModLoader.stage=async function(name,game,payload){if(name==='afterVanillaScripts')fixtureStartup.earlyPrefs=JSON.parse(localStorage.getItem('abstractv03_preferences'+game.steamId)||'{}');return nativeStage(name,game,payload)};",
 "const nativeFrame=Game.prototype.renderloop;Game.prototype.renderloop=function(...args){const r=nativeFrame.apply(this,args);fixtureStartup.frames++;return r};",
 "if(!localStorage.getItem('abstractv03_preferences"+OWNER+"'))localStorage.setItem('abstractv03_preferences"+OWNER+"',JSON.stringify({mute:true,languageId:0,currentSlotId:0,photofobia:false,chill:false,zoom:1,globalSoundVolume:.6,helpIsNeeded:-1,mobileExplainerPointer:-1,fixtureSentinel:{keep:true}}));",
 "localStorage.setItem('modloader:panelState',JSON.stringify({settings:{renderApiEnabled:process.env.SF41_API==='1'}}));",
 "localStorage.setItem('abstractv03_language','0');localStorage.setItem('modloader:Cattail_TweaksQuality_Better-UIs:config:shopVersion',JSON.stringify('1.3'));"
 ].join('\n')
 fs.writeFileSync(path.join(appDir,'game/fixture-startup.js'),seed)
 const index=path.join(appDir,'game/index.html');fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</head>','<script src="fixture-startup.js"></script></head>'))
 const pw=require('module').createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/_test.cjs'))('playwright')
 const report={status:'running',checks:[],cases:[],lab,source:root,runtime,network:'blocked; fake Steam/TrackJS; synthetic data only'}
 let electron,page,stage='',profile,cloudFile,writeFile
 const check=(name,ok)=>{assert(ok,name);report.checks.push({name,ok:true})}
 const cloud=()=>JSON.parse(fs.readFileSync(cloudFile))
 const writes=()=>fs.existsSync(writeFile)?fs.readFileSync(writeFile,'utf8').trim().split(/\r?\n/).filter(Boolean).length:0
 const record=n=>({isProtected:n===1,state:{stuff:[],resources:[64,8,4,0,0,0,0,0,0,0],timestamp:100-n,unlockedEntities:{},modloader:{saveInstanceId:'11111111-1111-4111-8111-111111111111'}},permanents:{glory:[],completions:0,upgrades:0,orbUpgradeMap:[],memory:[],lastOrbPositions:new Array(6).fill(false)}})
 const manual={name:'Synthetic manual',ownerHash:7,creationTimeStamp:100,lastModified:100,stack:[record(0),record(1)]}
 const local=()=>page.evaluate(async()=>{
  const db=await new Promise((r,j)=>{const q=indexedDB.open('sixtyfour_warehouse',1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
  const v=await new Promise((r,j)=>{const q=db.transaction('charps_memory_slots','readonly').objectStore('charps_memory_slots').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
  db.close();return v
 })
 async function close(){
  if(!electron)return
  const instance=electron;electron=null;const pid=await instance.evaluate(()=>process.pid).catch(()=>instance.process().pid)
  await instance.evaluate(({app,session})=>{session.defaultSession.flushStorageData();setTimeout(()=>app.quit(),200)}).catch(()=>{})
  await Promise.race([instance.waitForEvent('close',{timeout:3500}).catch(()=>{}),new Promise(r=>setTimeout(r,3500))])
  const command="@(Get-CimInstance Win32_Process -Filter \"ProcessId="+pid+"\" | Where-Object { $_.ExecutablePath -eq '"+exe.replace(/'/g,"''")+"' }).Count"
  const found=cp.spawnSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true})
  if(Number(found.stdout.trim())===1)cp.spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true})
  await Promise.race([instance.close().catch(()=>{}),new Promise(r=>setTimeout(r,1000))])
 }
 async function launch(name,api,errorCode){
  await close();stage=name
  const env={...process.env}
  for(const k of Object.keys(env))if(['appdata','localappdata','temp','tmp','electron_run_as_node','node_options','psmodulepath'].includes(k.toLowerCase()))delete env[k]
  for(const [k,v]of[['APPDATA','appData'],['LOCALAPPDATA','localAppData'],['TEMP','temp'],['TMP','temp']]){env[k]=path.join(profile,v);fs.mkdirSync(env[k],{recursive:true})}
  Object.assign(env,{SF41_PROFILE:profile,SF41_CLOUD:cloudFile,SF41_WRITES:writeFile,SF41_STAGE:name,SF41_API:String(+api)})
  electron=await pw._electron.launch({executablePath:exe,cwd:appDir,env,timeout:20000});page=await electron.firstWindow({timeout:15000})
  await page.waitForFunction(()=>window.fixtureStartup?.ready||window.fixtureStartup?.error,{},{timeout:20000})
  const state=await page.evaluate(()=>fixtureStartup);report.cases.push({name,state,pid:electron.process().pid,runtime:await page.evaluate(()=>({policy:!!DEBUG?.[Symbol.for('cattail.tweaks.save-policy')],slot:DEBUG?.currentSlotId,resource:DEBUG?.resources?.[0],config:ModLoader.forMod('Cattail_TweaksQuality_Tweaks').config.get('enableAutoSaveStutterFix')}))})
  check(name+' actual local SDK initialized',await page.evaluate(()=>require('@playsaurus-inc/sdk').isInitialized===true))
  if(errorCode)check(name+' controlled rejection',state.error?.code===errorCode&&!state.ready&&state.frames===0)
  else{
   check(name+' completes actual Game.init',state.ready&&!state.error)
   await page.waitForFunction(()=>fixtureStartup.frames>=3,{},{timeout:10000})
   check(name+' visible menu and initialized canvas',await page.evaluate(()=>!!DEBUG.splash&&!!document.querySelector('.splash')&&document.querySelector('.canvas').width>300&&!fixtureStartup.errors.length))
   check(name+' actual Render API state matches requested case',await page.evaluate(()=>ModLoader.render.isEnabled())===api)
   const png=await electron.evaluate(async()=>(await global.fixtureDiagnostics.window.webContents.capturePage()).toPNG().toString('base64'));fs.writeFileSync(path.join(lab,name+'.png'),Buffer.from(png,'base64'))
  }
  const isolation=await electron.evaluate(({app})=>({paths:Object.fromEntries(['appData','userData','sessionData','temp','logs','crashDumps'].map(n=>[n,app.getPath(n)])),versions:{electron:process.versions.electron,chrome:process.versions.chrome},network:global.fixtureDiagnostics.network.length}))
  check(name+' isolated paths',Object.values(isolation.paths).every(p=>p.toLowerCase().startsWith(profile.toLowerCase()+path.sep)))
  report.cases.at(-1).isolation=isolation;fs.writeFileSync(path.join(lab,'result.json'),JSON.stringify(report,null,2))
 }
 try{
  for(const api of [false,true]){
   const group='api'+Number(api);profile=path.join(lab,'profiles',group);fs.mkdirSync(profile,{recursive:true})
   cloudFile=path.join(lab,group+'-cloud.json');writeFile=path.join(lab,group+'-writes.jsonl');fs.writeFileSync(cloudFile,JSON.stringify({charpsMemory:JSON.stringify([manual])}))
   await launch(group+'-existing',api)
   check(group+' manual protected history survives',await page.evaluate(x=>JSON.stringify(DEBUG.saveSlots[0].stack)===x,JSON.stringify(manual.stack)))
   check(group+' independent auto and early preserved prefs',await page.evaluate(()=>DEBUG.currentSlotId===20&&DEBUG[Symbol.for('cattail.tweaks.save-policy')].sourceIndex()===0&&fixtureStartup.earlyPrefs.fixtureSentinel.keep))
   await page.evaluate(async()=>{DEBUG.resources[0]=777;await DEBUG.saveGame();await DEBUG[Symbol.for('cattail.tweaks.save-policy')].flush()})
   check(group+' delta save preserves original baseline',cloud().charpsMemory===JSON.stringify([manual])&&!!cloud()['cattail-save-policy-v2.json'])
   await launch(group+'-cold-resume',api)
   check(group+' full restart resumes latest auto',await page.evaluate(()=>DEBUG.resources[0]===777&&DEBUG.currentSlotId===20&&DEBUG[Symbol.for('cattail.tweaks.save-policy')].sourceIndex()===0))
   await page.evaluate(id=>ModLoader.forMod(id).config.set('enableAutoSaveStutterFix',false),MOD)
   await launch(group+'-disabled',api)
   check(group+' disabled policy still reads overlay',await page.evaluate(()=>!DEBUG[Symbol.for('cattail.tweaks.save-policy')]&&DEBUG.resources[0]===777))
   check(group+' native invoke full save succeeds',await page.evaluate(()=>DEBUG.spaceport.invoke('store',DEBUG.saveSlots))===true)
   check(group+' native baseline is a slot array',Array.isArray(JSON.parse(cloud().charpsMemory)))
   await page.evaluate(id=>ModLoader.forMod(id).config.set('enableAutoSaveStutterFix',true),MOD)
   await launch(group+'-reenabled',api)
   check(group+' reenable supersedes stale overlay safely',await page.evaluate(()=>!!DEBUG[Symbol.for('cattail.tweaks.save-policy')]&&DEBUG.resources[0]===777))
   if(api){
    const hashLocal=sha(await local());await close();const files=cloud();files.charpsMemory=JSON.stringify({protocol:'tweaks-save-policy-v2',action:'commit',changes:{},records:{}});fs.writeFileSync(cloudFile,JSON.stringify(files));const beforeWrites=writes(),beforeCloud=sha(fs.readFileSync(cloudFile,'utf8'))
    await launch(group+'-bad-baseline',api,'TWEAKS_SAVE_LOAD_FAILED')
    check('bad baseline preserves independent local records',sha(await local())===hashLocal)
    check('bad baseline creates no cloud write or fresh save',writes()===beforeWrites&&sha(fs.readFileSync(cloudFile,'utf8'))===beforeCloud)
    report.recoveryObservation={syntheticLocalRecordCount:(await local()).length,localSnapshotHash:hashLocal,automaticRecovery:false,realDataRead:false}
    await close();delete files.charpsMemory;fs.writeFileSync(cloudFile,JSON.stringify(files));const beforeMissing=writes()
    await launch(group+'-missing-baseline',api,'TWEAKS_SAVE_LOAD_FAILED')
    check('orphan overlay preserves locals and cloud',sha(await local())===hashLocal&&writes()===beforeMissing)
   }
  }
  profile=path.join(lab,'profiles/fresh');fs.mkdirSync(profile,{recursive:true});cloudFile=path.join(lab,'fresh-cloud.json');writeFile=path.join(lab,'fresh-writes.jsonl');fs.writeFileSync(cloudFile,JSON.stringify({charpsMemory:'[]'}))
  await launch('fresh-world',true)
  check('fresh world has one auto with no invented source',await page.evaluate(()=>DEBUG.saveSlots.filter(Boolean).length===1&&DEBUG[Symbol.for('cattail.tweaks.save-policy')].sourceIndex()===-1&&DEBUG.stuff.length>0))
  report.status='passed'
 }catch(e){report.status='failed';report.error={stage,message:e.message,stack:e.stack};throw e}
 finally{await close();fs.writeFileSync(path.join(lab,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,checks:report.checks.length,lab,error:report.error},null,2))}
}
function bootstrap(){
 const electron=require('electron'),{app,BrowserWindow:Original}=electron,Module=require('module'),{lab}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-config.json')))
 const profile=path.resolve(process.env.SF41_PROFILE),cloudFile=path.resolve(process.env.SF41_CLOUD),writeFile=path.resolve(process.env.SF41_WRITES)
 assert(profile.toLowerCase().startsWith(path.resolve(lab).toLowerCase()+path.sep))
 for(const n of ['appData','userData','sessionData','temp','logs','crashDumps']){const d=path.join(profile,n);fs.mkdirSync(d,{recursive:true});app.setPath(n,d)}
 fs.writeFileSync(path.join(app.getPath('userData'),'appSettings.json'),JSON.stringify({fullscreen:false,windowMode:'window'}))
 global.fixtureDiagnostics={network:[]};const publish=files=>fs.writeFileSync(cloudFile,JSON.stringify(files))
 const cloud={fileExists:f=>Object.hasOwn(JSON.parse(fs.readFileSync(cloudFile)),f),readFile:f=>{const data=JSON.parse(fs.readFileSync(cloudFile));if(!Object.hasOwn(data,f))throw Error('Synthetic missing file');return data[f]},writeFile(f,data){const files=JSON.parse(fs.readFileSync(cloudFile));files[f]=data;publish(files);fs.appendFileSync(writeFile,JSON.stringify({stage:process.env.SF41_STAGE,file:f,bytes:Buffer.byteLength(data)})+'\n');return true},deleteFile(f){const files=JSON.parse(fs.readFileSync(cloudFile));delete files[f];publish(files);return true}}
 const load=Module._load
 class HiddenWindow extends Original{constructor(options){super({...options,show:false,fullscreen:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});fixtureDiagnostics.window=this;this.show=()=>{};this.setFullScreen=()=>{};this.webContents.setBackgroundThrottling(false)}}
 Module._load=function(request){if(request==='electron')return {...electron,BrowserWindow:HiddenWindow};if(request==='steamworks.js')return {init(){return {apps:{currentGameLanguage:()=> 'english',appOwner:()=>({accountId:OWNER})},cloud}}};if(request==='trackjs-node')return {TrackJS:{install(){},track(){}}};return load.apply(this,arguments)}
 app.on('session-created',s=>s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(d,done)=>{fixtureDiagnostics.network.push(d.url);done({cancel:true})}))
 process.chdir(__dirname);require('./main.js')
}
if(process.versions.electron)bootstrap();else run().catch(e=>{console.error(e);process.exitCode=1})
