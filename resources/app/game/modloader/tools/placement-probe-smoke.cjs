'use strict'

// Opt in: node placement-probe-smoke.cjs --run --lab ABSOLUTE_NEW_DIRECTORY.
// Copies only runtime/code, uses synthetic entities and an isolated profile;
// the Game constructor, player profile, saves and Steam are never used.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const MOD = 'Cattail_TweaksQuality_Tweaks'
const ENTRIES = ['scripts/clear-view-grid-fix.js', 'scripts/floor-grid-lines.js', 'scripts/placement-shadow.js', 'scripts/clear-view-options.js', 'scripts/dynamic-camera.js']
if (!process.versions.electron) {
  assert.ok(process.argv.includes('--run'), 'Supply --run and --lab ABSOLUTE_NEW_DIRECTORY.')
  const flag = process.argv.indexOf('--lab'); assert.ok(flag >= 0 && path.isAbsolute(process.argv[flag + 1] || ''))
  const lab = path.resolve(process.argv[flag + 1]), root = path.resolve(__dirname, '../../../../..')
  assert.ok(!fs.existsSync(lab), 'The isolated test directory must not exist.')
  const runtime = path.join(lab, 'runtime'), appRoot = path.join(runtime, 'resources/app'), gameRoot = path.join(appRoot, 'game')
  fs.mkdirSync(gameRoot, { recursive: true })
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isFile() && /\.(exe|dll|pak|dat|bin)$/i.test(entry.name)) fs.copyFileSync(path.join(root, entry.name), path.join(runtime, entry.name))
  fs.cpSync(path.join(root, 'locales'), path.join(runtime, 'locales'), { recursive: true })
  const loaderRoot = path.join(root, 'resources/app/game/modloader')
  fs.cpSync(loaderRoot, path.join(gameRoot, 'modloader'), { recursive: true, filter: file => !/^(state|backups|tools)(\/|$)/.test(path.relative(loaderRoot, file).replaceAll('\\', '/')) })
  let loader = fs.readFileSync(path.join(gameRoot, 'modloader/loader.js'), 'utf8')
  loader = loader.replace('window.ModLoader = api', 'window.testProbeClient = () => getClearViewProbe(); window.testPlacementController = () => placementProbeController; window.ModLoader = api')
  fs.writeFileSync(path.join(gameRoot, 'modloader/loader.js'), loader)
  fs.mkdirSync(path.join(gameRoot, 'scripts'), { recursive: true })
  fs.copyFileSync(path.join(root, 'resources/app/game/scripts/game.js'), path.join(gameRoot, 'scripts/game.js'))
  const modRoot = path.join(gameRoot, 'mods', MOD); fs.mkdirSync(path.join(modRoot, 'scripts'), { recursive: true })
  for (const entry of ENTRIES) fs.copyFileSync(path.join(root, 'resources/app/game/mods', MOD, entry), path.join(modRoot, entry))
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'resources/app/game/mods', MOD, 'mod.json'), 'utf8'))
  fs.writeFileSync(path.join(modRoot, 'mod.json'), JSON.stringify({ ...manifest, entries: ENTRIES }))
  fs.writeFileSync(path.join(gameRoot, 'mods/enabled.json'), JSON.stringify({ mods: [MOD] }))
  fs.copyFileSync(__filename, path.join(appRoot, 'bootstrap.cjs'))
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'sf-placement-isolated-test', version: '1.0.0', main: 'bootstrap.cjs' }))
  fs.writeFileSync(path.join(appRoot, 'fixture-config.json'), JSON.stringify({ lab, deepOnly: process.argv.includes('--deep-only'), startupOnly: process.argv.includes('--startup-only'), shadowOnly: process.argv.includes('--shadow-only') }))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (['appdata', 'localappdata', 'temp', 'tmp', 'electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) { env[key] = path.join(lab, 'profile', key); fs.mkdirSync(env[key], { recursive: true }) }
  const log = fs.openSync(path.join(lab, 'process.log'), 'a')
  const child = require('node:child_process').spawn(path.join(runtime, 'sixtyfour.exe'), [], { cwd: appRoot, env, windowsHide: true, stdio: ['ignore', log, log] })
  const timeout = setTimeout(() => child.kill(), 240000)
  console.log('Placement isolated test: ' + lab)
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { clearTimeout(timeout); fs.closeSync(log); const file = path.join(lab, 'result.json'); const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null; console.log(JSON.stringify(result || { status: 'failed', error: 'No test result' })); process.exitCode = code === 0 && result?.status === 'passed' ? 0 : 1 })
} else {
  const { app, BrowserWindow, session, ipcMain } = require('electron')
  const { lab, deepOnly, startupOnly, shadowOnly } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-config.json')))
  assert.equal(path.resolve(__dirname, '../../..'), path.resolve(lab))
  for (const key of ['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps']) { const dir = path.join(lab, 'profile', key); fs.mkdirSync(dir, { recursive: true }); app.setPath(key, dir) }
  app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-renderer-backgrounding')
  const result = { status: 'running', subset: shadowOnly ? 'shadow-only' : startupOnly ? 'startup-only' : deepOnly ? 'deep-only' : 'full', checks: [], errors: [], warnings: [], network: [], versions: process.versions,
    limitations: ['Actual shipped Electron, Loader/menu, Canvas, IPC, trace and selected five Tweaks consumers; synthetic outer frame/world/entities.',
      'Independent profile; focus is simulated for the hidden offscreen window. No player data, Game constructor or Steam.',
      'Test-only Canvas contexts request willReadFrequently so readback does not switch raster backends mid-comparison.',
      'Pixel/command checks and synthetic observer costs do not establish player performance or full Mod acceptance.'] }
  const write = () => fs.writeFileSync(path.join(lab, 'result.json'), JSON.stringify(result, null, 2))
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  const check = (name, value) => { assert.ok(value, name); result.checks.push(name); write() }
  let win
  app.whenReady().then(async () => {
    write()
    session.defaultSession.webRequest.onBeforeRequest((request, callback) => { const allowed = /^(file|data):/.test(request.url); if (!allowed) result.network.push(request.url); callback({ cancel: !allowed }) })
    try {
      win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } })
      const service = require('./game/modloader/diagnostics/clear-view-main').createService({ electron: require('electron'), outputRoot: path.join(lab, 'reports'), getWindow: () => win })
      service.attachWindow(win)
      for (const channel of ['modloader:snapshots:admin', 'modloader:snapshots:activate', 'modloader:libraries:runtime']) ipcMain.handle(channel, () => ({ ok: false, error: 'isolated-fixture: no save context' }))
      win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        if (level >= 2 && result.warnings.length < 24) result.warnings.push(message)
        if (String(message).startsWith('Uncaught')) result.errors.push(message + ' at ' + sourceId + ':' + line)
      })
      win.webContents.on('render-process-gone', (_event, details) => result.errors.push(details.reason))
      const fixture = String.raw`
        const fixtureErrors = window.fixtureErrors = [];
        window.addEventListener('error', event => fixtureErrors.push(event.message));
        window.addEventListener('unhandledrejection', event => fixtureErrors.push(String(event.reason)));
        window.setup = async function(){
          document.hasFocus = () => true;
          const originalGetContext=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(kind,options){return originalGetContext.call(this,kind,kind==='2d'?{...(options||{}),willReadFrequently:true}:options)};
          const canvas=document.querySelector('canvas');canvas.width=640;canvas.height=360;
          window.nativeGrid=Game.prototype.renderGrid;window.nativeAbstract=Game.prototype.renderEntitiesAbstract;
          const condition=Game.prototype.renderloop.toString().match(/const clearView = ([^\r\n]+)/)[1];
          const clearView=new Function('showItemInHand','return ('+condition+')');
          Game.prototype.renderloop=function(){
            this.ctx.fillStyle='#fff';this.ctx.fillRect(0,0,this.w,this.h);
            this.ctx.save();this.ctx.translate(this.w2,this.h2);
            try {if(clearView.call(this,this.itemInHand&&this.hoveredCell))this.renderEntitiesAbstract(16);else this.renderEntities(16)} finally{this.ctx.restore()}
            if(clearView.call(this,this.itemInHand&&this.hoveredCell))this.renderGrid();
          };
          const g=window.game=Object.assign(Object.create(Game.prototype),{canvas,ctx:canvas.getContext('2d',{willReadFrequently:true}),version:'1.3',isMobile:false,
            language:'sch',languageId:12,w:640,h:360,w2:320,h2:180,pixelRatio:1,solidUnit:36,unit:10.8,zoom:.3,translation:[0,0],plane:0,halt:false,
            stats:{totalPlayTime:0},renderTime:{dt:16},time:{realDt:16},mouse:{cursorVisible:true,xy:[320,180],sxy:[320,180]},
            itemInHand:{name:'candidate'},hoveredCell:[0,0],interactionMode:'build',touchMode:0,altActive:false,
            conductors:new Set(),vfx:[],chasmVfx:[],stuffMap:{u0v0:{name:'occupied'}},codex:{entities:{candidate:{}}}});
          g.stuff=[['A',[0,0],1],['B',[3,1],0],['conductor',[-2,1],0],['hidden',[0,-3],1]].map(([name,position,entitySpan])=>({name,position,entitySpan,entityHeight:2,
            render(dt){const xy=g.uvToXY(this.position),ctx=g.ctx;ctx.save();ctx.beginPath();ctx.rect(xy[0]-12,xy[1]-36,24,40);ctx.clip();
              ctx.fillStyle=this.name==='A'?'#ef3344':'#2456dd';ctx.fillRect(xy[0]-12,xy[1]-36,24,40);ctx.restore()},darkrender(){}}));
          g.isVisible=e=>e.name!=='hidden';
          // Hover/input processing is outside this synthetic rendering fixture.
          g.processMousemove2=()=>{};
          g.stuffMap={};for(const e of g.stuff)for(let y=e.position[1]-e.entitySpan;y<=e.position[1]+e.entitySpan;y++)for(let x=e.position[0]-e.entitySpan;x<=e.position[0]+e.entitySpan;x++)g.stuffMap['u'+x+'v'+y]=e;
          for(const key of ['saveGame','build','upgrade','massRelocate'])g[key]=()=>{throw Error('Forbidden fixture world endpoint '+key)};
          await ModLoader.boot();ModLoader.state.game=g;
          const api=ModLoader.forMod('Cattail_TweaksQuality_Tweaks');
          for(const key of ['enablePlacementShadowTraversalReuse','enableFloorGridLines','enableDynamicCamera','disableClearViewGrid','disableClearViewBuildingClipping','useTweaksClearViewGridStyle'])api.config.set(key,false);
          if(localStorage.getItem('fixture-early-render'))ModLoader.render.install(g);
          await ModLoader.stage('afterVanillaScripts',g);
          for(const layer of ['background','interaction','buildings'])api.render.onLayer(layer,()=>{},{id:'placement-fixture-'+layer});
          window.setOption=(key,value)=>{api.config.set(key,value);window.dispatchEvent(new CustomEvent('modloader:config-preview',{detail:{modId:'Cattail_TweaksQuality_Tweaks',key,value}}))};
          const modulePath=require('path').join(require('path').dirname(require('url').fileURLToPath(location.href)),'modloader/diagnostics/placement-probe.js');
          if(require('fs').existsSync(modulePath)){
            const p=require(modulePath),create=p.createPlacementCapture;
            p.createPlacementCapture=options=>{window.lastPlacement=create(options);return window.lastPlacement};
          }
          window.hashPixels=()=>{
            const crypto=require('crypto'),rows=[];
            for(const [id,ctx] of [['main',g.ctx],...['background','interaction','buildings'].map(id=>[id,api.render.context(id,g)])]){
              if(ctx)rows.push([id,crypto.createHash('sha256').update(Buffer.from(ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data)).digest('hex')]);
            }
            return rows;
          };
          window.measureIdle=()=>{const list=[];for(let i=0;i<80;i++){const at=performance.now();g.renderloop();list.push(performance.now()-at)}list.sort((a,b)=>a-b);return {samples:list.length,medianMs:list[Math.floor(list.length/2)],p95Ms:list[Math.ceil(list.length*.95)-1]}};
          window.frameTimer=setInterval(()=>{try{g.unit=g.solidUnit*g.zoom;g.renderloop()}catch(e){fixtureErrors.push(e.stack);clearInterval(frameTimer)}},16);
          window.ready=true;
        };setup().catch(error=>window.bootError=error.stack);
      `
      fs.writeFileSync(path.join(__dirname, 'game/fixture.js'), fixture)
      fs.writeFileSync(path.join(__dirname, 'game/index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#eee"><canvas></canvas><script src="scripts/game.js"></script><script src="modloader/loader.js"></script><script src="fixture.js"></script></body></html>')
      const evaluate = code => win.webContents.executeJavaScript(code)
      const waitFor = async (code, seconds = 12) => { const end = Date.now() + seconds * 1000; while (Date.now() < end) { const value = await evaluate(code); if (value) return value; await delay(50) } throw new Error('Timed out: ' + code + '\n' + await evaluate('window.bootError || JSON.stringify({errors:window.fixtureErrors,message:window.ModLoader?.state.clearViewProbeMessage,status:window.testProbeClient?.().status()})')) }
      const load = async () => { await win.loadFile(path.join(__dirname, 'game/index.html')); await waitFor('window.ready || window.bootError'); check('fixture initialized without constructor/Steam', await evaluate('!!window.ready && !window.bootError')) }
      const menu = async () => evaluate('ModLoader.state.panelSettingsOpen=true;ModLoader.state.panelHidden=false;ModLoader.renderPanel();document.getElementById("modloader-clear-view-probe").scrollIntoView()')
      const click = async text => { await menu(); await evaluate('Array.from(document.querySelectorAll("#modloader-clear-view-probe button")).find(b=>b.textContent.includes(' + JSON.stringify(text) + ')).click()') }
      const idle = () => waitFor('window.testProbeClient().status().phase === "idle"', 85)
      const recording = () => waitFor('window.testProbeClient().status().phase === "recording"', 15)
      const lastReport = () => {
        const dirs = fs.readdirSync(path.join(lab, 'reports')).map(name => path.join(lab, 'reports', name)).filter(dir => fs.existsSync(path.join(dir, 'frames.json'))).sort()
        const dir = dirs.at(-1); assert.ok(dir, 'exported report'); return { dir, report: JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'))), session: JSON.parse(fs.readFileSync(path.join(dir, 'session.json'))) }
      }
      const traceMarkers = record => {
        const file = path.join(record.dir, record.session.trace.fileName || 'trace.json'), buffer = fs.readFileSync(file)
        if (record.session.trace.format === 'perfetto-protobuf') {
          assert.equal(buffer[0], 10, 'Perfetto Trace.packet field')
          return ['SFProbe:capture-start', 'SFProbe:capture-stop'].filter(name => buffer.includes(Buffer.from(name)))
        }
        return JSON.parse(buffer).traceEvents.map(event => event.name).filter(name => String(name).startsWith('SFProbe:'))
      }
      await load(); await menu()
      check('three explicit placement buttons and default idle state', await evaluate('document.getElementById("modloader-clear-view-probe").textContent.includes("放置分项对照（60秒）") && testProbeClient().status().phase === "idle"'))
      if (shadowOnly) {
        result.pixelMatrices = []
        for (const early of [false, true]) {
          if (early) { await evaluate('localStorage.setItem("fixture-early-render","1")'); await load() }
          const matrix = await evaluate(`(() => {
            clearInterval(frameTimer); const results=[];
            for(const apiEnabled of [false,true])for(const dynamic of [false,true])for(const zoom of [2,.3,.03])for(let bits=0;bits<8;bits++){
              ModLoader.render.setEnabled(apiEnabled);setOption('enableDynamicCamera',dynamic);setOption('cameraPitch',.87);setOption('cameraYaw',35);
              setOption('disableClearViewGrid',!!(bits&1));setOption('useTweaksClearViewGridStyle',!!(bits&2));setOption('disableClearViewBuildingClipping',!!(bits&4));
              game.zoom=zoom;game.unit=game.solidUnit*zoom;
              setOption('enablePlacementShadowTraversalReuse',false);game.renderloop();const before=JSON.stringify(hashPixels());
              setOption('enablePlacementShadowTraversalReuse',true);game.renderloop();const after=JSON.stringify(hashPixels());
              results.push({apiEnabled,dynamic,zoom,bits,equal:before===after,path:window.__cattailPlacementRenderHooksV1.gridResult(game),camera:game.__cattailDynamicCameraState});
            }return results;
          })()`)
          result.pixelMatrices.push({ early, cases: matrix })
          check('96 actual Canvas/layer pixel comparisons including full configuration matrix, order=' + (early ? 'early' : 'late'), matrix.length === 96 && matrix.every(row => row.equal))
          check('optimized path reaches original grid leaf with complete multi-cell/conductor/hidden collection, order=' + early,
            matrix.some(row => row.path?.path === 'entity-traversal-reuse' && row.path.fills > 0) && matrix.filter(row => row.zoom === .03 && !row.dynamic).every(row => row.path?.path === 'entity-traversal-reuse'))
        }
        await evaluate('setOption("enableDynamicCamera",false);setOption("disableClearViewGrid",true);setOption("useTweaksClearViewGridStyle",true);setOption("disableClearViewBuildingClipping",true);game.zoom=.03;game.unit=game.solidUnit*game.zoom;setOption("enablePlacementShadowTraversalReuse",true);frameTimer=setInterval(()=>game.renderloop(),16);true')
        await click('放置细分记录'); await recording(); await delay(500); await evaluate('testProbeClient().finish()'); await idle()
        let record = lastReport(); result.optimizedDirectory = record.dir
        check('real short observation preserves optimization and exports truthful footprint counts for timed/detail/raw frames',
          ['raw','timed','detail'].every(kind => record.report.frames.some(f => f.placement?.kind === kind && f.placement.placementPath?.path === 'entity-traversal-reuse')) &&
          record.report.frames.filter(f => f.placement?.grid?.path === 'entity-traversal-reuse').every(f => f.placement.grid.executedCells === 0 && f.placement.grid.mapLookups > 0) &&
          record.report.placement.warnings.some(text => text.includes('复用路径')))
        await click('放置分项对照'); await idle()
        const dirs = fs.readdirSync(path.join(lab, 'reports')).sort(), rejected = JSON.parse(fs.readFileSync(path.join(lab, 'reports', dirs.at(-1), 'session.json')))
        check('original comparison rejects optimization without changing any setting and saves the reason', rejected.status === 'renderer-start-failed' && rejected.rendererStartup.error.message.includes('复用建筑遍历') && await evaluate('ModLoader.forMod("Cattail_TweaksQuality_Tweaks").config.get("enablePlacementShadowTraversalReuse") === true'))
        const toggle = await evaluate(`(() => {
          clearInterval(frameTimer);setOption('enablePlacementShadowTraversalReuse',false);game.renderloop();const before=JSON.stringify(hashPixels()),off=__cattailPlacementRenderHooksV1.gridResult(game);
          setOption('enablePlacementShadowTraversalReuse',true);game.renderloop();return {equal:before===JSON.stringify(hashPixels()),off,on:__cattailPlacementRenderHooksV1.gridResult(game)};
        })()`)
        check('hot off restores native immediately; on restores reuse with identical actual pixels', toggle.equal && toggle.off.path === 'native-area-scan' && toggle.on.path === 'entity-traversal-reuse')
        const optional = path.join(__dirname, 'game/modloader/diagnostics/placement-probe.js')
        fs.renameSync(optional, optional + '.disabled'); await load(); await evaluate('setOption("enablePlacementShadowTraversalReuse",true);game.renderloop()')
        check('production optimization remains available when optional diagnostic module is absent', await evaluate('__cattailPlacementRenderHooksV1.gridResult(game).path === "entity-traversal-reuse"'))
        result.errors.push(...await evaluate('window.fixtureErrors'))
        check('shadow subset has no external requests or renderer exceptions', result.network.length === 0 && result.errors.length === 0)
        result.status = 'passed'; return
      }
      if (startupOnly) {
        const lastAttempt = () => {
          const names = fs.readdirSync(path.join(lab, 'reports')).sort(), dir = path.join(lab, 'reports', names.at(-1))
          return { dir, session: JSON.parse(fs.readFileSync(path.join(dir, 'session.json'))), summary: fs.readFileSync(path.join(dir, 'summary.md'), 'utf8') }
        }
        result.startupDirectories = []
        for (const kind of ['configuration', 'capabilities', 'handheld']) {
          if (kind === 'configuration') await evaluate('setOption("disableClearViewGrid",true)')
          if (kind === 'capabilities') await evaluate('window.fixtureDescribe=testPlacementController().describe;testPlacementController().describe=()=>({renderGrid:{supported:false},renderEntitiesAbstract:{supported:false}});true')
          if (kind === 'handheld') await evaluate('window.fixtureHand=game.itemInHand;delete game.itemInHand')
          await click('放置分项对照'); await idle()
          const record = lastAttempt(), d = record.session.rendererStartup, message = await evaluate('ModLoader.state.clearViewProbeMessage')
          check('real menu startup rejection saves exact reason and diagnostic directory: ' + kind,
            record.session.status === 'renderer-start-failed' && d.stage === 'placement-start' && d.cancelled === false &&
            (kind === 'configuration' ? d.configuration.disableClearViewGrid === true && d.error.message.includes('设置') :
              kind === 'capabilities' ? d.capabilities.renderGrid.supported === false && d.error.message.includes('原生入口') : d.scene.item === false && d.error.message.includes('放置对照需要')) &&
            message.includes('未开始采集') && message.includes(record.dir) && record.summary.includes(d.error.message) && !fs.existsSync(path.join(record.dir, 'frames.json')))
          check('failed menu startup leaves placement intervention inactive: ' + kind, await evaluate('lastPlacement.state().placementActive === false'))
          result.startupDirectories.push(record.dir)
          if (kind === 'configuration') await evaluate('setOption("disableClearViewGrid",false)')
          if (kind === 'capabilities') await evaluate('testPlacementController().describe=window.fixtureDescribe;true')
          if (kind === 'handheld') await evaluate('game.itemInHand=window.fixtureHand')
        }
        await evaluate('ModLoader.state.panelHidden=true;ModLoader.renderPanel()'); await delay(100)
        const baseline = await evaluate('hashPixels()')
        await click('放置分项对照'); await recording(); await delay(120)
        check('real menu successful first group shows live recording notice and original pixels',
          await evaluate('ModLoader.state.clearViewProbeMessage.includes("已开始采集，第1/5组：原样") && document.getElementById("modloader-probe-notice").textContent.includes("第1/5组")') &&
          JSON.stringify(await evaluate('hashPixels()')) === JSON.stringify(baseline))
        fs.writeFileSync(path.join(lab, 'startup-recording.png'), (await win.webContents.capturePage()).toPNG())
        await evaluate('testProbeClient().finish()'); await idle()
        const short = lastReport(); result.shortDirectory = short.dir
        check('manual short test exports real frames as incomplete and restores native drawing', short.session.status === 'incomplete' && short.report.frames.length > 0 &&
          !short.report.placement.completed && JSON.stringify(await evaluate('hashPixels()')) === JSON.stringify(baseline) && await evaluate('lastPlacement.state().placementActive === false'))
        await click('放置分项对照'); await evaluate('testProbeClient().finish()'); await idle()
        check('menu countdown cancellation creates no new attempt and stays idle', lastAttempt().dir === short.dir && await evaluate('ModLoader.state.clearViewProbeMessage.includes("已取消采集")'))
        result.errors.push(...await evaluate('window.fixtureErrors'))
        check('startup subset has no external requests or renderer exceptions', result.network.length === 0 && result.errors.length === 0)
        result.status = 'passed'; return
      }
      if (deepOnly) {
        await click('放置深入记录'); await recording(); await idle()
        const record = lastReport(), markers = traceMarkers(record)
        check('isolated deep capture saved native timeline with both markers', record.session.trace.status === 'saved' && markers.includes('SFProbe:capture-start') && markers.includes('SFProbe:capture-stop'))
        result.deepDirectory = record.dir; result.status = 'passed'; return
      }
      fs.writeFileSync(path.join(lab, 'menu.png'), (await win.webContents.capturePage()).toPNG())
      await evaluate('ModLoader.state.panelHidden=true;ModLoader.renderPanel()'); await delay(100)
      const idleCostBefore = await evaluate('measureIdle()')
      const base = await evaluate('hashPixels()')
      fs.writeFileSync(path.join(lab, 'before-observe.png'), (await win.webContents.capturePage()).toPNG())
      await click('放置细分记录'); await recording(); await delay(180)
      const observedPixels = await evaluate('hashPixels()')
      result.firstPixelComparison = { before: base, after: observedPixels, scene: await evaluate('({unit:game.unit,zoom:game.zoom,errors:fixtureErrors,config:ModLoader.state.clearViewProbeMessage})') }
      fs.writeFileSync(path.join(lab, 'during-observe.png'), (await win.webContents.capturePage()).toPNG())
      check('observation preserves actual Canvas/layer pixels with Tweaks wrappers', JSON.stringify(observedPixels) === JSON.stringify(base))
      await idle()
      let record = lastReport(); check('20 second light capture auto exports complete protocol and raw/timed/detail frames', record.session.status === 'complete' && record.session.seconds === 20 && ['raw', 'timed', 'detail'].every(kind => record.report.frames.some(f => f.placement?.kind === kind)))
      check('detail and neighboring frame intervals excluded', record.report.frames.every((f, i, a) => !f.scene.placementDetailed && !a[i - 1]?.scene.placementDetailed || !f.comparable))
      result.lightDirectory = record.dir
      result.syntheticObserverCosts = Object.fromEntries(['raw', 'timed', 'detail'].map(kind => { const list = record.report.frames.filter(f => f.placement?.kind === kind).map(f => f.durationMs).sort((a, b) => a - b); return [kind, { samples: list.length, medianMs: list[Math.floor(list.length / 2)] }] }))
      result.syntheticObserverCosts.idleBefore = idleCostBefore
      result.syntheticObserverCosts.idleAfter = await evaluate('measureIdle()')
      await click('放置分项对照'); await recording()
      const hashes = []
      for (const phase of ['placement-before', 'placement-no-scan', 'placement-no-stroke', 'placement-no-mask', 'placement-after']) {
        await waitFor('window.lastPlacement?.state().placementPhase === ' + JSON.stringify(phase), 18); await delay(150); hashes.push(await evaluate('hashPixels()'))
      }
      await idle(); record = lastReport(); result.comparisonDirectory = record.dir
      check('real 60 second five-phase protocol completes with native leaves reached', record.session.status === 'complete' && record.session.seconds === 60 && record.report.placement.completed && record.report.placement.phases.every(p => p.gridCalls > 0 && p.abstractCalls > 0))
      check('first/last Canvas pixels restored; targeted interventions visibly change output', JSON.stringify(hashes[0]) === JSON.stringify(hashes[4]) && [1, 2, 3].every(i => JSON.stringify(hashes[i]) !== JSON.stringify(hashes[0])))
      check('comparison does not sneak raw frames into intervened phases', !record.report.frames.some(f => f.placement?.kind === 'raw'))
      await click('放置深入记录'); await recording(); await idle(); record = lastReport(); result.deepDirectory = record.dir
      const markers = traceMarkers(record)
      check('real shipped runtime deep tracing exports bounded categories and capture markers', record.session.trace.status === 'saved' && markers.includes('SFProbe:capture-start') && markers.includes('SFProbe:capture-stop'))
      result.traceBytes = fs.statSync(path.join(record.dir, record.session.trace.fileName || 'trace.json')).size
      for (const apiEnabled of [false, true]) for (const dynamic of [false, true]) {
        await evaluate('ModLoader.render.setEnabled(' + apiEnabled + ');setOption("enableDynamicCamera",' + dynamic + ')'); await delay(100)
        const before = await evaluate('hashPixels()')
        await click('放置细分记录'); await recording(); await delay(100)
        check('Canvas equivalence API=' + apiEnabled + ' dynamic=' + dynamic, JSON.stringify(before) === JSON.stringify(await evaluate('hashPixels()')))
        await evaluate('testProbeClient().finish()'); await idle()
      }
      for (const key of ['disableClearViewGrid', 'useTweaksClearViewGridStyle', 'disableClearViewBuildingClipping']) {
        await evaluate('setOption(' + JSON.stringify(key) + ',true)'); await click('放置分项对照'); await idle()
        check('conflicting setting rejects intervention without writeback: ' + key, await evaluate('ModLoader.state.clearViewProbeMessage.includes("设置")'))
        await evaluate('setOption(' + JSON.stringify(key) + ',false)')
      }
      await click('放置细分记录'); await recording(); await evaluate('window.dispatchEvent(new Event("blur"))'); await idle(); record = lastReport()
      check('focus loss auto-stops and exports incomplete while hooks return to delegation', record.session.status === 'incomplete' && record.report.placement.stopReason === 'blur')
      await evaluate('localStorage.setItem("fixture-early-render","1")'); await load()
      check('early Loader Render API installation preserves native hook guards', await evaluate('Object.values(testPlacementController().describe()).every(v=>v.supported)'))
      await click('放置细分记录'); await recording(); await evaluate('testProbeClient().finish()'); await idle()
      const optional = path.join(__dirname, 'game/modloader/diagnostics/placement-probe.js')
      fs.renameSync(optional, optional + '.disabled'); await load(); await menu()
      check('missing optional module leaves normal Loader and old probe usable; hides new controls', await evaluate('!document.getElementById("modloader-clear-view-probe").textContent.includes("放置分项对照") && typeof Game.prototype.renderGrid === "function"'))
      await evaluate('testProbeClient().start("light")'); await recording(); await evaluate('testProbeClient().finish()'); await idle()
      result.errors.push(...await evaluate('window.fixtureErrors'))
      check('no external requests or renderer exceptions', result.network.length === 0 && result.errors.length === 0)
      result.status = 'passed'
    } catch (error) { result.status = 'failed'; result.error = error.stack }
    finally { write(); if (win && !win.isDestroyed()) win.destroy(); app.exit(result.status === 'passed' ? 0 : 1) }
  })
}
