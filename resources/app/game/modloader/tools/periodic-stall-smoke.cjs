'use strict'
// Explicit opt-in only: node this-file --run --lab ABSOLUTE_NEW_DIRECTORY.
// A fresh runtime copy, isolated profile, synthetic scene and fake Steam calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
if (!process.versions.electron) {
  assert.ok(process.argv.includes('--run'), 'This Electron test is opt-in; supply --run and --lab.')
  const index = process.argv.indexOf('--lab'); assert.ok(index >= 0 && process.argv[index + 1])
  const lab = path.resolve(process.argv[index + 1]), source = path.resolve(__dirname, '../../../../..'), runtime = path.join(lab, 'runtime')
  assert.ok(!fs.existsSync(lab), 'Use a new test directory; existing data will not be overwritten.')
  fs.mkdirSync(runtime, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile() && /\.(exe|dll|pak|dat|bin)$/i.test(entry.name)) fs.copyFileSync(path.join(source, entry.name), path.join(runtime, entry.name))
  }
  fs.cpSync(path.join(source, 'locales'), path.join(runtime, 'locales'), { recursive: true })
  const appRoot = path.join(runtime, 'resources/app'), gameRoot = path.join(appRoot, 'game')
  fs.mkdirSync(path.join(gameRoot, 'mods'), { recursive: true }); fs.writeFileSync(path.join(gameRoot, 'mods/enabled.json'), '{"mods":[]}')
  fs.cpSync(path.join(source, 'resources/app/game/modloader'), path.join(gameRoot, 'modloader'), { recursive: true,
    filter: file => !/^(state|backups|tools)(\/|$)/.test(path.relative(path.join(source, 'resources/app/game/modloader'), file).replaceAll('\\', '/')) })
  fs.copyFileSync(path.join(source, 'resources/app/game/scripts/game.js'), path.join(gameRoot, 'native-game.js'))
  fs.copyFileSync(path.join(source, 'resources/app/main.js'), path.join(appRoot, 'native-main.txt'))
  fs.copyFileSync(__filename, path.join(appRoot, 'bootstrap.cjs'))
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'sf-periodic-stall-isolated-test', version: '1.0.0', main: 'bootstrap.cjs' }))
  fs.writeFileSync(path.join(appRoot, 'test-config.json'), JSON.stringify({ lab, quick: process.argv.includes('--quick') }))
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (['appdata', 'localappdata', 'temp', 'tmp', 'electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
  for (const [key, name] of [['APPDATA', 'appData'], ['LOCALAPPDATA', 'localAppData'], ['TEMP', 'temp'], ['TMP', 'temp']]) { env[key] = path.join(lab, 'profile', name); fs.mkdirSync(env[key], { recursive: true }) }
  const log = fs.openSync(path.join(lab, 'process.log'), 'a')
  const child = require('node:child_process').spawn(path.join(runtime, 'sixtyfour.exe'), [], { cwd: appRoot, env, windowsHide: true, stdio: ['ignore', log, log] })
  const timeout = setTimeout(() => child.kill(), 230000)
  console.log('Isolated Electron test: ' + lab)
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', code => { clearTimeout(timeout); fs.closeSync(log); const file = path.join(lab, 'result.json'); const result = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; console.log(result || 'No test result'); process.exitCode = code === 0 && result && JSON.parse(result).status === 'passed' ? 0 : 1 })
} else {
  const { app, BrowserWindow, session, ipcMain } = require('electron'), vm = require('node:vm')
  const { lab, quick } = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-config.json'), 'utf8'))
  assert.equal(path.resolve(__dirname, '../../..'), path.resolve(lab))
  for (const key of ['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps']) { const dir = path.join(lab, 'profile', key); fs.mkdirSync(dir, { recursive: true }); app.setPath(key, dir) }
  app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-renderer-backgrounding')
  const output = { status: 'running', checks: [], errors: [], network: [], versions: process.versions,
    limitations: ['Actual Loader UI, main bridge, original save methods and IndexedDB; synthetic rendering/world.', 'Steam cloud and statistics are fixtures; no player saves, profile or real Steam connection. Offscreen focus is simulated.', 'This does not measure the reported player stutter or prove in-game acceptance.'] }
  const write = () => fs.writeFileSync(path.join(lab, 'result.json'), JSON.stringify(output, null, 2))
  const check = (name, value) => { assert.ok(value, name); output.checks.push(name); write() }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  let win
  app.whenReady().then(async () => {
    write()
    session.defaultSession.webRequest.onBeforeRequest((request, callback) => { const allowed = /^(file|data):/.test(request.url); if (!allowed) output.network.push(request.url); callback({ cancel: !allowed }) })
    try {
      const bridge = require('./game/modloader/main-process.js')
      const source = fs.readFileSync(path.join(__dirname, 'native-main.txt'), 'utf8')
      const storeHandlers = source.slice(source.indexOf('ipcMain.on(`store`'), source.indexOf('ipcMain.on(`updateAccumulatedPlaytime`'))
      const statHandler = source.slice(source.indexOf('ipcMain.on(`updateStat`'), source.indexOf('ipcMain.on(`gameError`'))
      const cloudCalls = [], statCalls = []
      const client = { cloud: { writeFile(name, data) { const began = Date.now(); while (Date.now() - began < 25) {} cloudCalls.push({ name, bytes: data.length }); return true } }, stats: { setInt(id, value) { statCalls.push({ id, value }) } } }
      vm.runInNewContext(storeHandlers + statHandler, { ipcMain, client, ModLoaderMainProcess: bridge, console })
      win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } })
      bridge.attachWindow(win, { accountId: 'isolated-periodic-test' })
      win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) output.errors.push(message) })
      const fixture = String.raw`
        window.setup = async () => {
          document.hasFocus = () => true;
          const canvas = document.querySelector('canvas'); canvas.width=1280; canvas.height=700;
          const g = window.game = Object.create(Game.prototype);
          Object.assign(g, {canvas,ctx:canvas.getContext('2d'),spaceport:require('electron').ipcRenderer,steamId:'isolated-fixture',version:'1.3',
            language:'english',zoom:1,translation:[0,0],plane:0,halt:false,currentSlotId:0,maxSaveStack:20,saveStackUpdateNeeded:false,
            stats:{totalPlayAndIdleTime:0},entitiesInGame:{},achiever:{fired:[]},messenger:{shownMessages:[],firedEvents:[],messagesShown:[]},
            store:{existed:[]},resources:new Array(10).fill(0),unlockedEntities:{},memoryBuffer:[],saveSlots:[{ownerHash:1,stack:[{permanents:{memory:[]}}]}],
            stuff:Array.from({length:1200},(_,i)=>({name:'fixture-entity',position:[i,0],state:1}))});
          g.localDatabase = await g.getDatabase();
          g.updateCycle = function(){return true};
          g.renderloop = function(){this.ctx.fillStyle='#e4e8eb';this.ctx.fillRect(0,0,1280,700);this.ctx.fillStyle='#254658';this.ctx.fillRect(40,40,200,80);this.updateCycle()};
          window.originalRenderloop = g.renderloop;
          await ModLoader.boot(); ModLoader.state.game = g;
          window.frameTimer=setInterval(()=>g.renderloop(),16);
          window.ready=true;
        };
        setup().catch(error=>window.bootError=error.stack);
      `
      fs.writeFileSync(path.join(__dirname, 'game/fixture.js'), fixture)
      fs.writeFileSync(path.join(__dirname, 'game/index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#e4e8eb"><canvas></canvas><script src="native-game.js"></script><script src="modloader/loader.js"></script><script src="fixture.js"></script></body></html>')
      await win.loadFile(path.join(__dirname, 'game/index.html'))
      const evaluate = code => win.webContents.executeJavaScript(code)
      for (let i = 0; i < 100; i++) { if (await evaluate('Boolean(window.ready || window.bootError)')) break; await delay(50) }
      check('actual Loader with native save methods initialized', await evaluate('!!window.ready && !window.bootError'))
      const menu = async () => { await evaluate('ModLoader.state.panelSettingsOpen=true;ModLoader.state.panelHidden=false;ModLoader.renderPanel();document.getElementById("modloader-periodic-stall-probe").scrollIntoView()') }
      await menu()
      check('menu switch defaults off, with 2 minute, 5 minute and deep modes', await evaluate('(()=>{const r=document.getElementById("modloader-periodic-stall-probe");return !r.querySelector("input").checked && r.querySelector("select").options.length===3 && r.querySelector("[data-stall-retry]").hidden})()'))
      if (quick) check('retry button visually hidden while idle', await evaluate('getComputedStyle(document.querySelector("[data-stall-retry]")).display === "none"'))
      await delay(120); fs.writeFileSync(path.join(lab, 'menu.png'), (await win.webContents.capturePage()).toPNG())
      const toggle = async (mode = '120') => evaluate(`(()=>{const r=document.getElementById('modloader-periodic-stall-probe');r.querySelector('select').value=${JSON.stringify(mode)};r.querySelector('input').click()})()`)
      await toggle(quick ? '300' : '120'); check('switch starts countdown and closes menu', await evaluate('!document.getElementById("modloader-panel")'))
      await delay(3500)
      await evaluate('game.saveLoop()')
      check('recording wraps native saveGame and IndexedDB entry', await evaluate('Object.hasOwn(game,"saveGame") && Object.hasOwn(game.localDatabase,"transaction")'))
      const reports = path.join(__dirname, 'game/modloader/state/periodic-stall-probes')
      if (quick) { await delay(5500); await menu(); await evaluate('document.querySelector("[data-stall-toggle]").click()'); await delay(1500) }
      else await delay(121000)
      let dirs = fs.readdirSync(reports).map(name => path.join(reports, name))
      const light = dirs.find(dir => fs.existsSync(path.join(dir, 'session.json')) && !JSON.parse(fs.readFileSync(path.join(dir, 'session.json'))).deep)
      const report = JSON.parse(fs.readFileSync(path.join(light, 'frames.json'))), sessionInfo = JSON.parse(fs.readFileSync(path.join(light, 'session.json')))
      check(quick ? '5 minute mode accepts manual switch off and exports' : '2 minute light capture automatically stops and exports', sessionInfo.status === 'complete' && (quick ? sessionInfo.seconds === 300 && report.durationMs >= 5000 : report.durationMs >= 118000))
      check(quick ? 'actual save cycle observed before manual stop' : 'at least twelve actual 10 second save cycles observed', report.methods.find(row => row.name === 'saveLoop').calls >= (quick ? 1 : 12))
      check('native assembly, actual IDB put and async completion measured', ['assembleSave', 'local.put', 'local.transaction.settled', 'ipc.store.invoke.settled'].every(name => report.methods.some(row => row.name === name && row.calls >= (quick ? 1 : 12))))
      check('native main serialization, cloud call and statistics are split', ['cloud.serializeSlots', 'cloud.writeFile', 'steam.updateStat'].every(name => sessionInfo.main.methods.some(row => row.name === name && row.calls >= (quick ? 1 : 12))))
      check('native cloud wait stays separate from synchronous invoke timing', report.methods.find(row => row.name === 'ipc.store.invoke.settled').maxMs >= 25)
      check('capture restores original methods and IndexedDB descriptors', await evaluate('!Object.hasOwn(game,"saveGame") && !Object.hasOwn(game.localDatabase,"transaction") && game.renderloop===originalRenderloop'))
      check('real IDB data remains readable', await evaluate('(async()=>{const slot=await game.readFromSlot(0);return slot.stack[0].state.stuff.length===1200})()'))
      await menu(); check('menu switch returns off after automatic stop', await evaluate('!document.querySelector("[data-stall-toggle]").checked'))
      await toggle('deep')
      let deep
      // Tracing startup and flush take time outside the 20 second capture.
      // Wait for the exported report, not a guessed fixed wall-clock deadline.
      for (let i = 0; i < 160; i++) {
        await delay(250)
        dirs = fs.readdirSync(reports).map(name => path.join(reports, name))
        deep = dirs.find(dir => fs.existsSync(path.join(dir, 'session.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'session.json'))).deep)
        if (deep) break
      }
      assert.ok(deep, 'Deep capture did not export: ' + await evaluate('ModLoader.state.periodicStallProbeMessage'))
      const deepSession = JSON.parse(fs.readFileSync(path.join(deep, 'session.json'))), trace = JSON.parse(fs.readFileSync(path.join(deep, 'trace.json')))
      check('20 second deep capture exports using shipped Electron', deepSession.status === 'complete' && deepSession.trace.status === 'saved')
      const markers = trace.traceEvents.filter(event => String(event.name).startsWith('SFStall:')).map(event => event.name)
      check('trace includes capture start and stop for coverage validation', markers.includes('SFStall:capture-start') && markers.includes('SFStall:capture-stop'))
      check('no external network requests or renderer errors', output.network.length === 0 && output.errors.length === 0)
      output.lightDirectory = light; output.deepDirectory = deep; output.traceBytes = fs.statSync(path.join(deep, 'trace.json')).size
      output.traceCategories = [...new Set(trace.traceEvents.map(event => event.cat).filter(Boolean))]
      output.fixtureCloudCalls = cloudCalls.length; output.fixtureStatCalls = statCalls.length; output.status = 'passed'
    } catch (error) { output.status = 'failed'; output.error = error.stack }
    finally { write(); if (win && !win.isDestroyed()) win.destroy(); app.exit(output.status === 'passed' ? 0 : 1) }
  })
}
