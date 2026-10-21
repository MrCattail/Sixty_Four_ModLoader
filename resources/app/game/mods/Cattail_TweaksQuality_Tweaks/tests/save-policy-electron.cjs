'use strict'
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const MOD = 'Cattail_TweaksQuality_Tweaks', BETTER = 'Cattail_TweaksQuality_Better-UIs', WE = 'Cattail_TweaksQuality_World-Editor'
function launch(root, sources = root, options = {}) {
  const i = process.argv.indexOf('--lab'); assert(i >= 0 && process.argv[i + 1], 'Explicit fresh --lab required')
  const lab = path.resolve(process.argv[i + 1]), runtime = path.join(lab, 'runtime')
  assert(!fs.existsSync(lab), 'Do not overwrite a prior lab')
  assert(!runtime.startsWith(path.resolve(root) + path.sep), 'Runtime must be outside the production checkout')
  fs.mkdirSync(runtime, { recursive: true })
  for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isFile() && /\.(exe|dll|pak|dat|bin)$/i.test(e.name)) fs.copyFileSync(path.join(root,e.name),path.join(runtime,e.name))
  fs.cpSync(path.join(root,'locales'),path.join(runtime,'locales'),{recursive:true})
  const app=path.join(runtime,'resources/app'), game=path.join(app,'game'), original=path.join(root,'resources/app/game'), source=path.join(sources,'resources/app/game')
  fs.mkdirSync(path.join(game,'mods'),{recursive:true})
  fs.cpSync(path.join(original,'modloader'),path.join(game,'modloader'),{recursive:true,filter:f=>!/^(state|backups|tools)(\/|$)/.test(path.relative(path.join(original,'modloader'),f).replaceAll('\\','/'))})
  for (const f of ['loader.js','main-process.js']) fs.copyFileSync(path.join(source,'modloader',f),path.join(game,'modloader',f))
  for (const [id, entries] of [[MOD,['scripts/auto-save-stutter-fix.js']],[BETTER,['scripts/save-slots.js']],[WE,['scripts/core/save-adapter.js','scripts/core/creative-mode.js',...(options.scenario?['scripts/i18n/editor-text.js']:[])]]]) {
    const base=fs.existsSync(path.join(source,'mods',id,'mod.json'))?source:original, dest=path.join(game,'mods',id)
    const manifest=JSON.parse(fs.readFileSync(path.join(base,'mods',id,'mod.json')));delete manifest.entry;manifest.entries=entries
    fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'mod.json'),JSON.stringify(manifest))
    for (const f of entries.concat(id===MOD?['scripts/save-policy.js','scripts/save-policy-core.js','scripts/main/auto-save-policy-store.js']:[])) {fs.mkdirSync(path.dirname(path.join(dest,f)),{recursive:true});fs.copyFileSync(path.join(base,'mods',id,f),path.join(dest,f))}
  }
  fs.writeFileSync(path.join(game,'mods/enabled.json'),JSON.stringify({mods:[MOD,BETTER,WE]}))
  fs.copyFileSync(path.join(original,'scripts/game.js'),path.join(game,'native-game.js'))
  fs.copyFileSync(path.join(sources,'resources/app/main.js'),path.join(app,'native-main.txt'))
  fs.copyFileSync(__filename,path.join(app,'bootstrap.cjs'))
  fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'sf-save-policy-lab',version:'1.0.0',main:'bootstrap.cjs'}))
  if(options.scenario){fs.copyFileSync(options.scenario,path.join(app,'scenario.cjs'));fs.copyFileSync(path.join(source,'mods',WE,'scripts/ui/editor-shell.js'),path.join(app,'creative-shell.txt'))}
  fs.writeFileSync(path.join(app,'fixture-config.json'),JSON.stringify({lab,scenario:!!options.scenario}))
  const env={...process.env}
  for(const k of Object.keys(env))if(['appdata','localappdata','temp','tmp','electron_run_as_node','node_options'].includes(k.toLowerCase()))delete env[k]
  for(const [k,v] of [['APPDATA','appData'],['LOCALAPPDATA','localAppData'],['TEMP','temp'],['TMP','temp']]){env[k]=path.join(lab,'profile',v);fs.mkdirSync(env[k],{recursive:true})}
  const log=fs.openSync(path.join(lab,'process.log'),'a'),exe=path.join(runtime,'sixtyfour.exe')
  assert.notEqual(exe,path.join(root,'sixtyfour.exe'))
  const child=require('child_process').spawn(exe,[],{cwd:app,env,windowsHide:true,stdio:['ignore',log,log]})
  const timer=setTimeout(()=>child.kill(),options.scenario?240000:110000)
  child.on('exit',code=>{clearTimeout(timer);fs.closeSync(log);const p=path.join(lab,'result.json');const result=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{status:'missing',code};console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error,errors:result.errors,benchmark:result.benchmark,lab},null,2));process.exitCode=code===0&&result.status==='passed'?0:1})
  console.log('Isolated save policy lab: '+lab)
}
if (!process.versions.electron) {
  module.exports={launch}
  if(require.main===module){const args=process.argv;launch(args[args.indexOf('--root')+1],args.includes('--source')?args[args.indexOf('--source')+1]:undefined)}
} else {
  const {app,BrowserWindow,ipcMain,session}=require('electron'),{lab,scenario}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-config.json')))
  app.setPath('userData',path.join(lab,'profile/userData'));app.setPath('sessionData',path.join(lab,'profile/sessionData'));app.commandLine.appendSwitch('disable-background-networking')
  const result={status:'running',checks:[],errors:[],network:[]},packets=[],writes=[],files=new Map();let win,failFile=''
  const check=(name,value)=>{assert(value,name);result.checks.push(name)}
  const slot=n=>({name:'槽 '+n,ownerHash:7,creationTimeStamp:n+1,lastModified:100+n,stack:Array.from({length:n===1?5:10},(_,j)=>({isProtected:j===2,state:{stuff:[],resources:[n+1,j+1],timestamp:100-j,onlyones:{keep:true},unlockedEntities:{pinhole:true},memory:[[n,j]],messengerMessageTimestamps:{b:1,s:[2]},modloader:{saveInstanceId:'00000000-0000-4000-8000-'+String(n+1).padStart(12,'0'),worldEditor:{mode:'normal'},siloLongFill:1}},permanents:{glory:[],completions:4,upgrades:3,orbUpgradeMap:[1],memory:[[n,j]],lastOrbPositions:[[1,2]]}}))})
  const baseline=Array.from({length:15},(_,i)=>slot(i)),baselineText=JSON.stringify(baseline);files.set('charpsMemory',baselineText)
  const cloud={fileExists:f=>files.has(f),readFile:f=>{if(!files.has(f))throw Error('Missing '+f);return files.get(f)},writeFile(f,s){writes.push({file:f,bytes:Buffer.byteLength(s)});if(f===failFile)return false;files.set(f,s);return true}}
  app.whenReady().then(async()=>{
    try{
      session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const allowed=/^(file|devtools):/.test(d.url);if(!allowed)result.network.push(d.url);done({cancel:!allowed})})
      const bridge=require('./game/modloader/main-process.js');bridge.configureSaveCloud(cloud)
      const dispatch=bridge.dispatchSaveStore;bridge.dispatchSaveStore=(e,p,w)=>{packets.push({action:Array.isArray(p)?'native':p.action,indices:Object.keys(p.changes||{}),records:Object.keys(p.records||{}).length,bytes:Buffer.byteLength(JSON.stringify(p))});return dispatch(e,p,w)}
      win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{nodeIntegration:true,contextIsolation:false,offscreen:true,backgroundThrottling:false}})
      bridge.attachWindow(win,{accountId:'synthetic-owner'})
      win.webContents.on('console-message',(_e,level,msg)=>{if(level>=3)result.errors.push(msg)})
      const main=fs.readFileSync(path.join(__dirname,'native-main.txt'),'utf8'),code=main.slice(main.indexOf('ipcMain.on(`store`'),main.indexOf('ipcMain.on(`updateAccumulatedPlaytime`'))
      require('vm').runInNewContext(code,{ipcMain,ModLoaderMainProcess:bridge,client:{cloud},win,console})
      ipcMain.handle('fixture:preload',()=>{const slots=bridge.readSaveOverlay(cloud,JSON.parse(files.get('charpsMemory')||'[]'));return{steamId:'synthetic-owner',slots,savePolicyLayout:slots.policyLayout}})
      ipcMain.handle('fixture:bench',()=>true)
      fs.writeFileSync(path.join(__dirname,'game/fixture.js'),String.raw`
        const timeout=window.setTimeout.bind(window);window.reloadRequests=[];
        window.setTimeout=(fn,delay,...args)=>{if([100,400].includes(delay)&&String(fn).includes('reload')){reloadRequests.push(String(fn));return 0}return timeout(fn,delay,...args)};
        window.setup=async()=>{
          const canvas=document.querySelector('canvas'),g=window.game=Object.assign(Object.create(Game.prototype),{
            canvas,ctx:canvas.getContext('2d'),spaceport:require('electron').ipcRenderer,steamId:'synthetic-owner',version:'1.3',language:'sch',languageId:12,languages:['en'],
            zoom:1,translation:[0,0],plane:0,isMobile:false,currentSlotId:1,saveSlots:[],maxSaveStack:16,saveStackUpdateNeeded:false,
            stats:{totalPlayAndIdleTime:0},entitiesInGame:{},achiever:{fired:[],setState(){}},messenger:{shownMessages:[],firedEvents:[],messagesShown:[],setState(){}},
            store:{existed:[],setExisted(){},compositionUpdate(){}},resources:new Array(10).fill(0),unlockedEntities:{},onlyones:{},memoryBuffer:[],stuff:[],codex:{entities:{keep:{onlyone:true}}},
            updateEraserType(){},cleanup(){},simulateIdleTime(){},savePreferences(){localStorage.setItem('abstractv03_preferences'+this.steamId,JSON.stringify({currentSlotId:this.currentSlotId}))}
          });
          const preload=await g.spaceport.invoke('fixture:preload');
          if(!localStorage.getItem('abstractv03_preferences'+g.steamId)&&!preload.savePolicyLayout?.at)localStorage.setItem('abstractv03_preferences'+g.steamId,JSON.stringify({currentSlotId:1}));
          const oldForMod=ModLoader.forMod.bind(ModLoader);ModLoader.forMod=id=>{const api=oldForMod(id);if(id==='Cattail_TweaksQuality_Better-UIs'){const reg=api.ui.pages.register;api.ui.pages.register=d=>{window.definition=d;return reg(d)}}return api};
          const casePath=require('path').join(__dirname,'../case.json');
          if(require('fs').existsSync(casePath)){const options=JSON.parse(require('fs').readFileSync(casePath));for(const [id,key,value] of options.config||[])ModLoader.forMod(id).config.set(key,value)}
          await ModLoader.stage('beforeGamePrepare',g,preload);await g.prepareSavedGameData(preload);
          await ModLoader.stage('afterVanillaScripts',g);
          const record=g.saveSlots[g.currentSlotId].stack[0];g.completions=record.permanents.completions;g.orbUpgrades=record.permanents.upgrades;g.orbUpgradeMap=structuredClone(record.permanents.orbUpgradeMap);g.currentOrbPositions=[];
          if(record.state&&!g.loadSave(record.state))throw Error('Native load failed');
          await ModLoader.stage('afterGameInit',g);
          window.policy=g[Symbol.for('cattail.tweaks.save-policy')];window.service=globalThis[Symbol.for('cattail.better-uis.save-slots')];window.adapter=globalThis[Symbol.for('cattail.world-editor.save-adapter')];
          window.render=()=>{const root=document.querySelector('#slots');root.replaceChildren();window.splash={master:g,element:document.body};definition.renderContent({game:g,splash,content:root});};
          window.tap=async(index,label)=>{render();const row=document.querySelector('.cattail-save-slots-row[data-slot-index="'+index+'"]');const button=[...row.querySelectorAll('button')].find(b=>b.textContent===label);if(!button)throw Error('Missing button '+label);await button.onclick({preventDefault(){},stopPropagation(){}})};
          window.ready=true;
        };setup().catch(e=>window.bootError=e.stack);
      `)
      fs.writeFileSync(path.join(__dirname,'game/index.html'),'<!doctype html><meta charset="utf-8"><canvas></canvas><div id="slots"></div><script src="native-game.js"></script><script src="modloader/loader.js"></script><script src="fixture.js"></script>')
      const evaluate=s=>win.webContents.executeJavaScript(s)
      const load=async()=>{await win.loadFile(path.join(__dirname,'game/index.html'));for(let i=0;i<120;i++){if(await evaluate('!!(window.ready||window.bootError)'))break;await new Promise(r=>setTimeout(r,40))}assert(await evaluate('!!window.ready'),await evaluate('window.bootError||JSON.stringify(ModLoader.state.issues)'))}
      await load()
      if(scenario){await require('./scenario.cjs')({check,evaluate,load,win,files,packets,writes,bridge,lab,baseline,appDir:__dirname,setCloudFailure:value=>{failFile=value}})}else{
      check('Actual Loader prepares an independent global autosave without touching the old 15 slots',await evaluate('policy.autoIndex===20&&game.currentSlotId===20&&game.saveSlots[20].stack.length===1&&game.saveSlots[1].name==="槽 1"'))
      check('Verified service source uses the working slot identity and the played manual slot name',await evaluate('service.snapshot().source.index===20&&service.snapshot().source.name==="槽 1"'))
      check('Initial manual records and all histories remain byte-identical',await evaluate(`JSON.stringify(game.saveSlots.slice(0,15).map(s=>{const copy={...s};delete copy.tweaksSavePolicy;return copy}))===${JSON.stringify(baselineText)}`))
      await evaluate('game.unlockedEntities.extra=true;game.onlyones.keep=false;game.orbUpgradeMap.push(99);game.memoryBuffer.push([99]);game.resources[0]=123;game.saveGame()')
      check('Native runtime mutations do not alias the manual save point',await evaluate('!game.saveSlots[1].stack[0].state.unlockedEntities.extra&&game.saveSlots[1].stack[0].state.onlyones.keep===true&&game.saveSlots[1].stack[0].permanents.orbUpgradeMap.length===1'))
      check('A steady save transmits only one current record',packets.at(-1).action==='commit'&&packets.at(-1).records===1&&JSON.stringify(packets.at(-1).indices)==='["20"]')
      check('No policy commit writes the full legacy collection',files.get('charpsMemory')===baselineText&&!packets.some(p=>p.action==='native'))
      check('Real IndexedDB stores the latest auto after transaction completion',await evaluate('game.readFromSlot(20).then(s=>s.stack[0].state.resources[0]===123&&s.stack.length===1)'))
      const manualBefore=await evaluate('JSON.stringify(game.saveSlots[1].stack[0])'),otherBefore=await evaluate('JSON.stringify(game.saveSlots[2])')
      await evaluate('game.saveStackUpdateNeeded=true;game.resources[0]=124;game.saveGame()')
      check('Four-minute history appends only to the source, preserving its manual head and protected node',await evaluate(`JSON.stringify(game.saveSlots[1].stack[0])===${JSON.stringify(manualBefore)}&&game.saveSlots[1].stack[1].state.resources[0]===124&&game.saveSlots[1].stack.some(n=>n.isProtected)`))
      check('History IPC contains the shared new node once, without old history data',packets.at(-1).records===1&&JSON.stringify(packets.at(-1).indices)==='["1","20"]'&&await evaluate(`JSON.stringify(game.saveSlots[2])===${JSON.stringify(otherBefore)}`))
      await evaluate('(async()=>{for(let n=0;n<20;n++){game.resources[0]=1000+n;game.saveStackUpdateNeeded=true;await game.saveGame()}})()')
      check('History retention trims unprotected nodes while preserving the manual point and protected history',await evaluate(`game.saveSlots[1].stack.length===16&&JSON.stringify(game.saveSlots[1].stack[0])===${JSON.stringify(manualBefore)}&&game.saveSlots[1].stack.some(r=>r.isProtected)`))
      await evaluate('game.saveSlots[1].stack.slice(1).forEach(r=>r.isProtected=true);game.resources[0]=1020;game.saveStackUpdateNeeded=true;game.saveGame()')
      check('All-protected old history permits one extra latest history without dropping it or the manual head',await evaluate(`game.saveSlots[1].stack.length===17&&game.saveSlots[1].stack[1].state.resources[0]===1020&&game.saveSlots[1].stack.slice(2).every(r=>r.isProtected)&&JSON.stringify(game.saveSlots[1].stack[0])===${JSON.stringify(manualBefore)}`))
      failFile='cattail-save-policy-v2.json';await evaluate('game.saveStackUpdateNeeded=true;game.resources[0]=124.5;game.saveGame()');failFile='';await evaluate('game.resources[0]=124.75;game.saveGame()')
      check('The next automatic save retries a failed source-history commit',bridge.readSaveOverlay(cloud,JSON.parse(baselineText))[1].stack.some(r=>r.state.resources[0]===124.5)&&packets.at(-1).indices.includes('1'))
      const cloudBefore=JSON.stringify(bridge.readSaveOverlay(cloud,JSON.parse(baselineText)));failFile='cattail-save-policy-v2.json'
      await evaluate('game.resources[0]=125;game.saveGame()')
      check('Cloud index failure preserves old cloud state and reports a local-only save',JSON.stringify(bridge.readSaveOverlay(cloud,JSON.parse(baselineText)))===cloudBefore&&await evaluate('policy.lastError==="cloud-index"&&game.readFromSlot(20).then(s=>s.stack[0].state.resources[0]===125)'))
      failFile='';await evaluate('game.saveGame()')
      check('Cloud retry recovers the latest auto without a native fallback',bridge.readSaveOverlay(cloud,JSON.parse(baselineText))[20].stack[0].state.resources[0]===125&&!packets.some(p=>p.action==='native'))
      check('World Editor can verify its real persisted identity and release a save lease',await evaluate('(async()=>{const c=adapter.capture(game);const lease=await adapter.acquireEdit(game,c);const r=await adapter.readVerified(game,c);lease.release();return r.state.modloader.saveInstanceId===c.saveId})()'))
      await evaluate('game.resources[0]=126;const p=game.saveGame();game.preventSaving=true;window.checkpoint=p;checkpoint');await evaluate('game.preventSaving=false')
      check('A pre-Pinhole save captures synchronously before saving is blocked',await evaluate('game.readFromSlot(20).then(s=>s.stack[0].state.resources[0]===126)'))
      await evaluate('render()')
      check('Better UIs shows one auto row and keeps it out of ordinary capacity',await evaluate('document.querySelectorAll(".cattail-save-slots-auto").length===1&&[...document.querySelectorAll(".cattail-save-slots-row")].filter(r=>r.dataset.slotIndex==="20").length===1&&service.snapshot().emptyCount===5'))
      await evaluate('tap(15,"新建")')
      check('Explicit New creates a manual point and assigns it as the played source',await evaluate('!!game.saveSlots[15]&&policy.sourceIndex()===15&&game.saveSlots[15].tweaksSavePolicy.role!=="auto"'))
      await evaluate('game.resources[0]=127;game.saveStackUpdateNeeded=true;game.saveGame()')
      check('History follows the new source without changing its manual point',await evaluate('game.saveSlots[15].stack[0].state.resources[0]===126&&game.saveSlots[15].stack[1].state.resources[0]===127'))
      await evaluate('game.resources[0]=128;tap(15,"覆盖");');await evaluate('render();document.querySelector(".cattail-save-slots-confirm-ok").onclick({preventDefault(){},stopPropagation(){}})')
      check('Explicit overwrite updates the manual point and retains its older point in history',await evaluate('game.saveSlots[15].stack[0].state.resources[0]===128&&game.saveSlots[15].stack.some(r=>r.state.resources[0]===126)'))
      await evaluate('policy.activate(2,game.saveSlots[2].stack[3])')
      check('Loading a historical record copies it to auto without reordering the original stack',await evaluate('game.currentSlotId===20&&policy.sourceIndex()===2&&game.saveSlots[2].stack[3].state.resources[1]===4&&game.saveSlots[2].stack[0].state.resources[1]===1'))
      await load()
      check('A real renderer reload continues the auto and restores its manual source',await evaluate('game.currentSlotId===20&&policy.sourceIndex()===2&&game.resources[1]===4&&service.snapshot().ready'))
      await evaluate('game.wipeSlot(0)');await load()
      check('Deletion shifts ordinary indices while preserving source identity and all 20 manual positions',await evaluate('game.currentSlotId===20&&policy.sourceIndex()===1&&game.saveSlots[0].name==="槽 1"&&service.snapshot().slots.every(s=>s.index!==20)'))
      await evaluate('(async()=>{await new Promise((resolve,reject)=>{const tx=game.localDatabase.transaction("charps_memory_slots","readwrite");tx.objectStore("charps_memory_slots").clear();tx.oncomplete=resolve;tx.onerror=reject});localStorage.clear()})()');await load()
      check('Cloud-only restore reconstructs the delta layout without resurrecting a deleted slot',await evaluate('game.currentSlotId===20&&policy.sourceIndex()===1&&game.saveSlots[0].name==="槽 1"&&game.resources[1]===4'))
      const savedSlot=await evaluate('JSON.stringify(game.saveSlots[20])')
      const abort=await evaluate(`(async()=>{const db=game.localDatabase;game.localDatabase={transaction(...a){const tx=db.transaction(...a),get=tx.objectStore.bind(tx);tx.objectStore=n=>{const store=get(n);store.put=()=>{tx.abort();throw Error('Synthetic IDB abort')};return store};return tx}};game.resources[0]=777;try{await policy.save();return false}catch(e){return true}finally{game.localDatabase=db}})()`)
      check('Local transaction abort rejects saving and leaves the previous in-memory auto intact',abort&&await evaluate(`JSON.stringify(game.saveSlots[20])===${JSON.stringify(savedSlot)}`))
      await evaluate('game.preventSaving=false;service.createAndActivate({entries:[{name:"Creative fork",nameConflict:"allow",data:{...game.assembleSave(),resources:[888],modloader:{...game.assembleSave().modloader,worldEditor:{version:1,creativeMode:true}}}}],activateEntry:0})');await load()
      check('Save Slots atomic create-and-activate verifies the fork through the working auto on reload',await evaluate('game.resources[0]===888&&service.snapshot().ready&&game.saveSlots[policy.sourceIndex()].name==="Creative fork"'))
      await evaluate('game.preventSaving=false;globalThis[Symbol.for("cattail.world-editor.creative-mode")].enableInPlace()')
      check('Actual Creative controller can save through its verified save lease',await evaluate('game.saveSlots[20].stack[0].state.modloader.worldEditor.creativeMode===true'))
      await evaluate('game.preventSaving=false;game.resources[0]=200;game.saveGame();');await evaluate('game.reset(true)')
      check('Native reset writes only a fresh auto while retaining ordinary manual heads',await evaluate('game.readFromSlot(20).then(s=>s.stack.length===1&&s.stack[0].state===null&&s.stack[0].permanents.completions===4)'))
      await load()
      check('Fresh-run auto reload retains native permanent progress',await evaluate('game.currentSlotId===20&&game.completions===4&&game.saveSlots[20].stack[0].permanents.completions===4'))
      check('Creative mode survives reset via the native permanents carrier',await evaluate('game.saveSlots[20].stack[0].state.modloader.worldEditor.creativeMode===true'))
      await evaluate(`ModLoader.state.panelHidden=false;ModLoader.renderPanel()`)
      check('Loader exposes the same default-on settings key with the new behavior description',await evaluate(`ModLoader.forMod('${MOD}').config.schema().some(s=>s.key==='enableAutoSaveStutterFix'&&s.default===true)`))
      await evaluate(`ModLoader.forMod('${MOD}').config.set('enableAutoSaveStutterFix',false)`);const beforeDisable=packets.length
      await load();await evaluate('game.saveGame()')
      check('Disabling and reloading restores native full-array saves',packets.slice(beforeDisable).some(p=>p.action==='native')&&await evaluate('!policy'))
      await evaluate('game.resources[0]=999;game.saveStackUpdateNeeded=true;game.saveGame()')
      await evaluate('game.resources[0]=1000;game.saveStackUpdateNeeded=true;game.saveGame()')
      const nativeAutoHistory=await evaluate('game.readFromSlot(20).then(s=>s.stack.slice(1).map(r=>JSON.stringify(r)))')
      await evaluate(`ModLoader.forMod('${MOD}').config.set('enableAutoSaveStutterFix',true)`)
      fs.writeFileSync(path.join(__dirname,'game/mods/enabled.json'),JSON.stringify({mods:[WE,BETTER,MOD]}));await load();await evaluate('game.saveGame()')
      check('Re-enable with reversed Mod order preserves the policy and save services',packets.at(-1).action==='commit'&&await evaluate('!!policy&&service.snapshot().ready'))
      check('Re-enable moves native auto history to the existing source without overwriting its manual point',await evaluate(`game.saveSlots[20].stack.length===1&&game.saveSlots[policy.sourceIndex()].stack[0].state.resources[0]===888&&${JSON.stringify(nativeAutoHistory)}.every(old=>game.saveSlots[policy.sourceIndex()].stack.some(r=>JSON.stringify(r)===old))`))
      const other=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}});await other.loadURL('about:blank');const foreign=await other.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke('modloader:tweaks-slot-store',{protocol:'tweaks-save-policy-v2',action:'begin',owner:'synthetic-owner',gameVersion:'1.3'})`);other.destroy()
      check('A foreign renderer cannot acquire the private save session',foreign.ok===false)
      result.benchmark=await evaluate(`(async()=>{
        const raw=require('electron').ipcRenderer;
        const node=n=>({isProtected:false,state:{stuff:Array.from({length:600},(_,k)=>({name:'fixture',position:[k,n],par:{resources:[k,1,2,3,4,5],description:'synthetic workload '+'.'.repeat(100)}})),resources:[64],timestamp:n},permanents:{completions:4,memory:[[n]]}});
        const collection=Array.from({length:15},(_,i)=>({name:'fixture '+i,creationTimeStamp:i,lastModified:100,stack:Array.from({length:i===1?5:10},(_,j)=>node(i*10+j))}));
        const full=[],slot=[],modern=[];const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
        for(let n=0;n<7;n++){let t=performance.now();const p=raw.invoke('fixture:bench',collection);full.push(performance.now()-t);await p;t=performance.now();const q=raw.invoke('fixture:bench',collection[2]);slot.push(performance.now()-t);await q}
        game.stuff=node(1).state.stuff;game.getEntityString=e=>e;
        for(let n=0;n<7;n++){await game.saveGame();modern.push(policy.timing)}
        return {slots:15,nodes:145,entitiesPerNode:600,fullCollectionIpcMedianMs:median(full.slice(2)),wholeSlotIpcMedianMs:median(slot.slice(2)),policyPhaseSumMedianMs:median(modern.slice(2).map(t=>Object.values(t).reduce((a,b)=>a+b,0))),policyIpcMedianMs:median(modern.slice(2).map(t=>t.ipcSubmitMs)),samples:{full,slot,modern},limits:'Synthetic fixture, sum of policy synchronous phases excludes Mod queue overhead and is not an in-game frame measurement.'}
      })()`)
      check('Large synthetic history does not change the one-record periodic payload',packets.slice(-7).every(p=>p.action==='commit'&&p.records===1&&p.indices.length===1))
      fs.writeFileSync(path.join(__dirname,'game/mods/enabled.json'),JSON.stringify({mods:[MOD]}));await load();await evaluate('game.saveGame()')
      check('Tweaks works without Better UIs or World Editor enabled',await evaluate('!!policy&&!service')&&packets.at(-1).action==='commit')
      files.clear();files.set('charpsMemory','[]');await evaluate('(async()=>{await new Promise((r,j)=>{const t=game.localDatabase.transaction("charps_memory_slots","readwrite");t.objectStore("charps_memory_slots").clear();t.oncomplete=r;t.onerror=j});localStorage.clear()})()');await load();await evaluate('game.saveGame()')
      check('A new world without a manual save has only the global auto and no source',await evaluate('game.saveSlots.filter(Boolean).length===1&&policy.sourceIndex()===-1&&game.currentSlotId===20')&&bridge.readSaveOverlay(cloud,[]).filter(Boolean).length===1)
      }
      result.status='passed';result.versions=process.versions
    }catch(e){result.status='failed';result.error=e.stack}
    finally{result.packets=packets;result.writes=writes;fs.writeFileSync(path.join(lab,'result.json'),JSON.stringify(result,null,2));if(win&&!win.isDestroyed())win.destroy();app.exit(result.status==='passed'?0:1)}
  })
}
