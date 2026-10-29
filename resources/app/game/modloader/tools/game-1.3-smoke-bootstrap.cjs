'use strict'

// Copied to the owned offline app only. This is not a production Loader entry.
const fs = require('fs')
const path = require('path')
const Module = require('module')
const assert = require('assert/strict')
const { app, session, BrowserWindow } = require('electron')
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'smoke-config.json'), 'utf8'))
const lab = path.resolve(__dirname, '../../..')
assert.equal(path.resolve(config.lab), lab)
assert.equal(JSON.parse(fs.readFileSync(path.join(lab, 'lab.json'), 'utf8')).kind, 'sixtyfour-offline-smoke-1.3')
function within(dir) { return path.resolve(dir).startsWith(lab + path.sep) }
assert.ok(within(config.profile) && within(config.evidence))
for (const name of ['appData', 'userData', 'sessionData', 'temp']) {
    const dir = path.join(config.profile, name)
    fs.mkdirSync(dir, { recursive: true })
    app.setPath(name, dir)
}
for (const name of ['crashDumps', 'logs']) {
    const dir = path.join(config.profile, name)
    fs.mkdirSync(dir, { recursive: true })
    app.setPath(name, dir)
}
const result = { status: 'running', versions: process.versions, checks: [], console: [], blockedNetwork: [], isolation: {} }
const writeResult = () => fs.writeFileSync(path.join(config.evidence, 'result.json'), JSON.stringify(result, null, 2))
for (const name of ['appData', 'userData', 'sessionData', 'temp', 'crashDumps', 'logs']) {
    result.isolation[name] = app.getPath(name)
    assert.ok(within(app.getPath(name)))
}
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
    if (request === 'steamworks.js') {
        result.isolation.steamBlocked = true
        result.isolation.cloudFixture = 'empty slots; writes return false; no native Steam module'
        // Returning the 1.3 slots envelope avoids vanilla's absent-Steam legacy
        // conversion manufacturing a new cloud slot on every local reload.
        return { init() { return {
            apps: { currentGameLanguage: () => 'english', appOwner: () => ({ accountId: '' }) },
            cloud: { fileExists: name => name === 'charpsMemory', readFile: () => '{}', writeFile: () => false }
        } } }
    }
    if (request === 'trackjs-node') return { TrackJS: { install() { result.isolation.telemetryBlocked = true }, track(error) { result.console.push({ type: 'gameError', message: String(error?.stack || error) }) } } }
    return originalLoad.apply(this, arguments)
}
app.on('session-created', s => s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, done) => {
    if (result.blockedNetwork.length < 50) result.blockedNetwork.push(details.url)
    done({ cancel: true })
}))
let mainWindow
app.on('browser-window-created', (_, win) => {
    if (mainWindow) return
    mainWindow = win
    win.setTitle('Sixty Four — Offline ModLoader 1.3 Test')
    win.webContents.setBackgroundThrottling(false)
    win.once('ready-to-show', () => { win.show(); win.focus() })
    win.webContents.on('console-message', (_, level, message, line, sourceId) => {
        if (result.console.length < 120) result.console.push({ level, message, line, sourceId })
    })
    win.webContents.on('render-process-gone', (_, details) => { result.rendererGone = details; writeResult() })
})
process.chdir(__dirname)
require('./main.js')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const js = async code => mainWindow.webContents.executeJavaScript(code, true)
async function waitFor(code, label, timeout = 35000) {
    const end = Date.now() + timeout
    while (Date.now() < end) {
        try { if (mainWindow && !mainWindow.isDestroyed() && await js('!!(' + code + ')')) return } catch (_) {}
        await delay(250)
    }
    throw new Error('Timed out: ' + label)
}
async function check(name, code) {
    const value = await js(code)
    assert.ok(value?.ok, name + ': ' + JSON.stringify(value))
    result.checks.push({ name, ...value })
    writeResult()
    return value
}
async function screenshot(name) {
    mainWindow.show()
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
    await delay(500)
    const pixels = await mainWindow.webContents.capturePage()
    assert.ok(!pixels.isEmpty(), 'Screenshot must contain pixels: ' + name)
    fs.writeFileSync(path.join(config.evidence, name + '.png'), pixels.toPNG())
}
async function smoke() {
    await waitFor('window.ModLoader?.state.snapshotContextReady && typeof DEBUG !== "undefined" && DEBUG.store && DEBUG.splash', 'game and snapshot initialization')
    await check('isolated desktop 1.3 startup', `(() => ({ok: DEBUG.version === '1.3' && DEBUG.steamId === '' && ModLoader.state.mods.length === 0, version:DEBUG.version, steamId:DEBUG.steamId, mods:ModLoader.state.mods.length, store:DEBUG.store.constructor.name, issues:ModLoader.state.issues}))()`)
    assert.equal(result.isolation.steamBlocked, true)
    assert.equal(result.isolation.telemetryBlocked, true)
    result.window = { visible: mainWindow.isVisible(), minimized: mainWindow.isMinimized(), bounds: mainWindow.getContentBounds() }
    await screenshot('01-startup')
    mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'M', modifiers: ['control'] })
    mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'M', modifiers: ['control'] })
    await waitFor('!!document.getElementById("modloader-panel")', 'Ctrl+M panel', 3000)
    await check('Ctrl+M panel', `({ok: !!document.getElementById('modloader-panel'), text:document.getElementById('modloader-panel').textContent.slice(0,250)})`)
    await screenshot('02-panel')
    await js(`ModLoader.togglePanel(); if(DEBUG.splash.isShown) DEBUG.splash.close(); DEBUG.mute(true)`)
    await delay(700)
    await check('native Store and object save', `(() => {const state=DEBUG.assembleSave(); const store=document.querySelector('.store'); return {ok:DEBUG.store.constructor.name==='DesktopStoreVersion' && !!store && typeof state==='object' && !Array.isArray(state) && !!state.modloader.saveInstanceId, cards:store.querySelectorAll('img').length, saveId:state.modloader.saveInstanceId, stateKeys:Object.keys(state)}})()`)
    await check('native category and asset resolver', `(() => {const id=Object.keys(DEBUG.store.html.items).find(id=>!DEBUG.onlyones[id] && DEBUG.codex.entities[id].type!=='dark'); const type=DEBUG.codex.entities[id].type??'default'; window.__smokeStore={id,type}; DEBUG.unlockedEntities[id]=true;DEBUG.store.compositionUpdate();DEBUG.store.visibilityUpdate();const tab=DEBUG.store.html.types[type];if(tab.button.classList.contains('closed')) tab.button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); const original=DEBUG.store.createEntityCard(id).card.querySelector('img').getAttribute('src');ModLoader.replaceAsset(original,'img/shop/hollow.jpg','modloader-offline-smoke'); const resolved=DEBUG.store.createEntityCard(id).card.querySelector('img').getAttribute('src');ModLoader.replaceAsset(original,original,'modloader-offline-smoke');return {ok:!tab.button.classList.contains('closed') && !tab.button.classList.contains('hidden') && resolved==='img/shop/hollow.jpg',id,type,resolved}})()`)
    await check('Window API main-process bridge', `(async () => {const state=await ModLoader.appWindow.getState();return {ok:ModLoader.appWindow.isAvailable() && !!state.windowMode,mode:state.windowMode}})()`)
    await screenshot('03-game-hud')
    await js('ModLoader.hideGameHud()')
    await delay(400)
    await check('Store hidden and non-interactive', `(() => {const s=document.querySelector('.store'), child=s.querySelector('*');return {ok:ModLoader.isGameHudHidden() && getComputedStyle(s).visibility==='hidden' && (!child || getComputedStyle(child).pointerEvents==='none'), visibility:getComputedStyle(s).visibility}})()`)
    await screenshot('04-hud-hidden')
    await js('DEBUG.store.reinit(); ModLoader.showGameHud()')
    await delay(400)
    await check('Store rebuild and HUD restore', `({ok:!ModLoader.isGameHudHidden() && getComputedStyle(document.querySelector('.store')).visibility!=='hidden' && !DEBUG.store.html.types[__smokeStore.type].button.classList.contains('closed'), open:DEBUG.store.isOpen, category:__smokeStore.type})`)
    await screenshot('04b-hud-restored')
    const saved = await check('asynchronous save and IndexedDB readback', `(async () => {await DEBUG.saveGame(); const slot=await DEBUG.readFromSlot(DEBUG.currentSlotId);return {ok:slot.stack[0].state.modloader.saveInstanceId===ModLoader.state.snapshotSaveInstanceId, saveId:slot.stack[0].state.modloader.saveInstanceId, slotId:DEBUG.currentSlotId, entityCount:slot.stack[0].state.stuff.length, oldToken:ModLoader.state.snapshotContextToken}})()`)
    const snapshot = await check('Snapshot IPC create/read/list', `(async () => {const api=ModLoader.forMod('modloader-offline-smoke').storage.snapshots;const item=await api.create({data:'isolated 1.3 smoke payload',reason:'offline smoke'});const read=await api.read({id:item.id});const list=await api.list();return {ok:read.data==='isolated 1.3 smoke payload' && list.some(x=>x.id===item.id), id:item.id, count:list.length}})()`)
    await js('location.reload()')
    await waitFor('window.ModLoader?.state.snapshotContextReady && typeof DEBUG !== "undefined" && DEBUG.store', 'reload and snapshot reactivation')
    await check('reload preserves identity and snapshot', `(async () => {const api=ModLoader.forMod('modloader-offline-smoke').storage.snapshots;const value=await api.read({id:${JSON.stringify(snapshot.id)}}); const stale=await require('electron').ipcRenderer.invoke('modloader:snapshots:runtime',{action:'list',modId:'modloader-offline-smoke',token:${JSON.stringify(saved.oldToken)}}); return {ok:ModLoader.state.snapshotSaveInstanceId===${JSON.stringify(saved.saveId)} && value.data==='isolated 1.3 smoke payload' && !stale.ok && stale.error.code==='NO_ACTIVE_SAVE', saveId:ModLoader.state.snapshotSaveInstanceId, slotId:DEBUG.currentSlotId, staleTokenRejected:!stale.ok}})()`)
    await js(`ModLoader.forMod('modloader-offline-smoke').storage.snapshots.remove({id:${JSON.stringify(snapshot.id)}})`)
    await screenshot('05-reloaded')
    result.status = 'passed'
}
if (!config.manual) {
    app.whenReady().then(async () => {
        try { await smoke() }
        catch (error) {
            result.status = 'failed'
            result.failure = error.stack
            try { result.diagnostics = await js(`({url:location.href, loader:!!window.ModLoader, ready:window.ModLoader?.state.snapshotContextReady, issues:window.ModLoader?.state.issues, logs:window.ModLoader?.state.log?.slice(-12), game:typeof DEBUG!=='undefined'?{version:DEBUG?.version,store:!!DEBUG?.store,slot:DEBUG?.currentSlotId}:null})`); await screenshot('failure') } catch (_) {}
        }
        writeResult()
        app.exit(result.status === 'passed' ? 0 : 1)
    })
} else {
    result.status = 'manual-session'
    app.on('before-quit', writeResult)
    writeResult()
}
