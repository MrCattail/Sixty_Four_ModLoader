//HID
// const HID = require('node-hid')
// const device = new HID.HID("/dev/hidraw3")
// const devices = HID.devices()

// TRACKJS
const { TrackJS } = require ('trackjs-node')
TrackJS.install({
  token: "672a75e2963a46b19c7e9e726ded8d4f",
  application: "sixtyfour"
})

// ELECTRON TOOLS
const { app, BrowserWindow, Tray, ipcMain, Menu, shell, globalShortcut, screen } = require('electron')
app.allowRendererProcessReuse = false

//App options
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const runtimeLogPath = path.join(__dirname, 'game', 'modloader', 'state', 'runtime.log')
function runtimeLog(...args){
  try {
    fs.mkdirSync(path.dirname(runtimeLogPath), { recursive: true })
    fs.appendFileSync(runtimeLogPath, `[${new Date().toISOString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`)
  } catch (e) {}
}
const optpath = path.join(app.getPath('userData'), 'appSettings.json')
let options = {
  fullscreen: true
}
try {
  options = JSON.parse(fs.readFileSync(optpath))
} catch (e){
  console.log(e)
}

// greenworks = require('greenworks')
// if (greenworks.init()) console.log(`LANGUAGE: ` + greenworks.getCurrentGameLanguage())

// DEFAULT SETUP
let win, STEAMLANGUAGE = `english`, STEAMID = ``, client = {}
let DEBUG = ``
const modloaderWindows = new Map()
let modloaderParentWindowState = null
const modloaderWindowMargin = 12

// STEAMWORKS INIT
// let DEBUG_C = `Undefined string`
try {
  const steamworks = require('steamworks.js')
  client = steamworks.init(2659900)
  STEAMLANGUAGE = client.apps.currentGameLanguage()
  STEAMID = client.apps.appOwner().accountId
  
} catch (e) {
  DEBUG = e
  console.log(`No Steam today: ${e}`)
}

// LANGUAGE CODES
const languages = {
  "english" : 0,
  "russian" : 1,
  "german" : 2,
  "brazilian" : 3,
  "portuguese" : 3,
  "italian" : 4,
  "spanish" : 5,
  "french" : 6,
  "dutch" : 7,
  "czech" : 8,
  "polish" : 9,
  "japanese" : 10,
  "koreana" : 11,
  "schinese" : 12,
  "tchinese" : 13,
  "thai" : 14,
  "hungarian" : 15,
  "latvian" : 16,
  "romanian" : 17,
  "norwegian": 18
}

// RENDERER COMMUNICATION
ipcMain.on(`getMyStuff`, (e,d)=>{
  if (d !== `please`) {
    win.webContents.send(`hereYouGoSir`, null); 
    return
  }
  const stuff = {
    steamId: STEAMID,
    languageId: languages[STEAMLANGUAGE] === undefined ? null : languages[STEAMLANGUAGE],
    save: getCloudSave(),
    steamAchievements: getSteamAchievements(),
    accumulatedPlayTime: getAccumulatedPlayTime(),
    debug: DEBUG
  }
  win.webContents.send(`hereYouGoSir`, stuff)
})

ipcMain.on(`achieve`, (e,d)=>{
  client.achievement?.activate(d)
})

ipcMain.on(`save`, (e,d)=>{
  const load = client.cloud?.writeFile(`SFSaveFile`, d)
})

ipcMain.on(`updateAccumulatedPlaytime`, (e,d)=>{
  const apt = client.cloud?.writeFile(`SFApt`, d+'')
})

ipcMain.on(`reset`, (e,d)=>{
  client.cloud?.deleteFile(`SFSaveFile`)
})

ipcMain.on(`quit`, (e,d)=>{
  app.quit()
})

ipcMain.on(`updateStat`, (e,d)=>{
  for (let i = 0; i < d.length; i++){
    client.stats?.setInt(d[i].id, d[i].value)
  }
})
ipcMain.on(`gameError`, (e,d)=>{
  runtimeLog('gameError', d && (d.stack || d.message || d.toString ? d.toString() : d))
  TrackJS?.track(d)
})
ipcMain.on(`toggleFullscreen`, (e,d)=>{
  options.fullscreen = !win.fullScreen
  win.setFullScreen(!win.fullScreen)
  fs.writeFileSync(optpath, JSON.stringify(options))
})
ipcMain.on(`openDiscord`, (e,d)=>{
  shell.openExternal(`https://discord.gg/7YXd3tScqS`)
})

function getModloaderWindowWorkArea(bounds){
  try {
    const baseBounds = bounds || win?.getBounds?.()
    const display = baseBounds ? screen.getDisplayMatching(baseBounds) : screen.getPrimaryDisplay()
    if (display?.workArea) return display.workArea
  } catch (e) {}
  return { x: 0, y: 0, width: 360, height: 360 }
}

function getModloaderWindowSide(bounds, area){
  const width = Math.max(1, Math.round(bounds?.width || 1))
  const x = Math.round(Number(bounds?.x) || area.x)
  return x + width / 2 < area.x + area.width / 2 ? 'left' : 'right'
}

function clampModloaderWindowY(y, height, area, margin){
  const minY = area.y + margin
  const maxY = Math.max(minY, area.y + area.height - height - margin)
  return Math.max(minY, Math.min(maxY, Math.round(Number(y) || minY)))
}

function clampModloaderWindowX(x, width, area, margin){
  const minX = area.x + margin
  const maxX = Math.max(minX, area.x + area.width - width - margin)
  return Math.max(minX, Math.min(maxX, Math.round(Number(x) || minX)))
}

function getModloaderWindowBounds(size, options, manualBounds, moving){
  const width = Math.max(options?.minWidth || 80, Math.round(size?.width || options?.width || 240))
  const height = Math.max(options?.minHeight || 60, Math.round(size?.height || options?.height || 160))
  const margin = Math.max(0, Math.round(options?.margin ?? modloaderWindowMargin))
  const area = getModloaderWindowWorkArea(manualBounds)
  if (manualBounds) {
    const side = manualBounds.side === 'left' || manualBounds.side === 'right' ? manualBounds.side : getModloaderWindowSide(manualBounds, area)
    return {
      x: moving ? clampModloaderWindowX(manualBounds.x, width, area, margin) : side === 'left' ? area.x + margin : area.x + area.width - width - margin,
      y: clampModloaderWindowY(manualBounds.y, height, area, margin),
      width,
      height,
      side
    }
  }
  const anchor = options?.anchor || 'bottom-right'
  let x = area.x + area.width - width - margin
  let y = area.y + area.height - height - margin
  if (anchor.indexOf('left') !== -1) x = area.x + margin
  if (anchor.indexOf('top') !== -1) y = area.y + margin
  if (anchor === 'center') {
    x = area.x + Math.round((area.width - width) / 2)
    y = area.y + Math.round((area.height - height) / 2)
  }
  return { x, y, width, height, side: getModloaderWindowSide({ x, width }, area) }
}

function applyModloaderWindowBounds(record, bounds, remember){
  if (!record?.window || record.window.isDestroyed()) return null
  const clean = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(record.options?.minWidth || 80, Math.round(bounds.width || 0)),
    height: Math.max(record.options?.minHeight || 60, Math.round(bounds.height || 0)),
    side: bounds.side === 'left' ? 'left' : 'right'
  }
  if (remember) record.manualBounds = clean
  try { record.window.setBounds({ x: clean.x, y: clean.y, width: clean.width, height: clean.height }, false) } catch (e) {}
  return clean
}

function stopModloaderWindowSnapAnimation(record){
  if (!record?.snapAnimation) return
  clearTimeout(record.snapAnimation)
  record.snapAnimation = null
}

function animateModloaderWindowSnap(record, bounds){
  if (!record?.window || record.window.isDestroyed()) return null
  stopModloaderWindowSnapAnimation(record)
  const start = record.window.getBounds?.() || bounds
  const target = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(record.options?.minWidth || 80, Math.round(bounds.width || 0)),
    height: Math.max(record.options?.minHeight || 60, Math.round(bounds.height || 0)),
    side: bounds.side === 'left' ? 'left' : 'right'
  }
  record.manualBounds = target
  const startedAt = Date.now()
  const duration = 160
  const tick = function () {
    if (!record.window || record.window.isDestroyed()) {
      record.snapAnimation = null
      return
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    applyModloaderWindowBounds(record, {
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
      width: target.width,
      height: target.height,
      side: target.side
    }, false)
    if (progress < 1) record.snapAnimation = setTimeout(tick, 16)
    else record.snapAnimation = null
  }
  tick()
  return target
}

function setModloaderWindowBounds(record, size){
  if (!record?.window || record.window.isDestroyed()) return null
  const bounds = getModloaderWindowBounds(size, record.options, record.manualBounds, record.moving)
  return applyModloaderWindowBounds(record, bounds, !!record.manualBounds)
}

function sendModloaderWindowGeometry(record, bounds){
  if (!record || !bounds) return
  const payload = {
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    side: bounds.side
  }
  try { record.window?.webContents?.send(`modloader:window:geometry`, payload) } catch (e) {}
  try { if (win && !win.isDestroyed?.()) win.webContents.send(`modloader:window:message`, { id: record.id, type: 'geometry', payload }) } catch (e) {}
}

function setModloaderWindowManualBounds(record, bounds, snap, animate){
  if (!record?.window || record.window.isDestroyed()) return null
  const current = record.window.getBounds?.() || {}
  const width = Math.max(record.options?.minWidth || 80, Math.round(bounds?.width || current.width || 240))
  const height = Math.max(record.options?.minHeight || 60, Math.round(bounds?.height || current.height || 160))
  const margin = Math.max(0, Math.round(record.options?.margin ?? modloaderWindowMargin))
  const rawBounds = {
    x: Number.isFinite(Number(bounds?.x)) ? Number(bounds.x) : current.x,
    y: Number.isFinite(Number(bounds?.y)) ? Number(bounds.y) : current.y,
    width,
    height
  }
  const area = getModloaderWindowWorkArea(rawBounds)
  const side = bounds?.side === 'left' || bounds?.side === 'right' ? bounds.side : getModloaderWindowSide(rawBounds, area)
  const target = {
    x: snap === false ? clampModloaderWindowX(rawBounds.x, width, area, margin) : side === 'left' ? area.x + margin : area.x + area.width - width - margin,
    y: clampModloaderWindowY(rawBounds.y, height, area, margin),
    width,
    height,
    side: snap === false && record.manualBounds?.side ? record.manualBounds.side : side
  }
  const previousSide = record.manualBounds?.side
  record.moving = snap === false
  if (snap === false || !animate) stopModloaderWindowSnapAnimation(record)
  const applied = snap !== false && animate ? animateModloaderWindowSnap(record, target) : applyModloaderWindowBounds(record, target, true)
  if (applied && snap !== false && previousSide !== applied.side) sendModloaderWindowGeometry(record, applied)
  return applied
}

function hideModloaderParentWindow(){
  if (!win || win.isDestroyed?.() || modloaderParentWindowState) return
  modloaderParentWindowState = {
    opacity: typeof win.getOpacity === 'function' ? win.getOpacity() : 1,
    skipTaskbar: typeof win.isSkipTaskbar === 'function' ? win.isSkipTaskbar() : false
  }
  try { win.setSkipTaskbar(true) } catch (e) {}
  try { win.setIgnoreMouseEvents(true, { forward: true }) } catch (e) {}
  try { win.setOpacity(0) } catch (e) {}
  try { win.blur() } catch (e) {}
}

function restoreModloaderParentWindowIfIdle(){
  if (!win || win.isDestroyed?.() || !modloaderParentWindowState) return
  for (const record of modloaderWindows.values()) {
    if (record?.options?.hideParent) return
  }
  const saved = modloaderParentWindowState
  modloaderParentWindowState = null
  try { win.setIgnoreMouseEvents(false) } catch (e) {}
  try { win.setOpacity(saved.opacity === undefined ? 1 : saved.opacity) } catch (e) {}
  try { win.setSkipTaskbar(!!saved.skipTaskbar) } catch (e) {}
  try { win.show() } catch (e) {}
  try { win.focus() } catch (e) {}
}

function sendModloaderWindowPayload(record){
  if (!record?.ready || !record.window || record.window.isDestroyed() || record.pendingPayload === undefined) return
  try { record.window.webContents.send(`modloader:window:update`, record.pendingPayload) } catch (e) {}
}

function sendModloaderWindowMessage(record, type, payload){
  if (!record || !win || win.isDestroyed?.()) return
  try { win.webContents.send(`modloader:window:message`, { id: record.id, type, payload }) } catch (e) {}
}

function stopModloaderModifierMonitor(record){
  const monitor = record?.modifierMonitor
  if (record) record.modifierMonitor = null
  try { if (monitor && !monitor.killed) monitor.kill() } catch (e) {}
}

function startModloaderModifierMonitor(record){
  if (!record?.options?.globalModifierKeys || record.modifierMonitor) return
  const script = path.join(__dirname, 'game', 'modloader', 'tools', 'modifier-watch.ps1')
  if (!fs.existsSync(script)) return runtimeLog('modifierMonitorMissing', script)
  try {
    const monitor = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    record.modifierMonitor = monitor
    let pending = ''
    monitor.stdout.setEncoding('utf8')
    monitor.stdout.on('data', chunk=>{
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) {
        const parts = line.trim().split('|')
        if (parts.length !== 7) continue
        sendModloaderWindowMessage(record, 'key', {
          eventType: parts[0],
          key: parts[1],
          code: parts[2],
          keyCode: Number(parts[3]) || 0,
          altKey: parts[4] === '1',
          ctrlKey: parts[5] === '1',
          shiftKey: parts[6] === '1',
          repeat: false
        })
      }
    })
    monitor.on('exit', ()=>{ if (record.modifierMonitor === monitor) record.modifierMonitor = null })
    monitor.on('error', error=>runtimeLog('modifierMonitorError', error?.message || String(error)))
  } catch (error) {
    runtimeLog('modifierMonitorStartFailed', error?.message || String(error))
  }
}

function normalizeModloaderWindowOptions(options){
  options = options || {}
  return {
    anchor: typeof options.anchor === 'string' ? options.anchor : 'bottom-right',
    margin: Number.isFinite(Number(options.margin)) ? Number(options.margin) : modloaderWindowMargin,
    hideParent: !!options.hideParent,
    transparent: options.transparent !== false,
    frame: !!options.frame,
    resizable: !!options.resizable,
    movable: !!options.movable,
    globalModifierKeys: !!options.globalModifierKeys,
    alwaysOnTop: options.alwaysOnTop !== false,
    skipTaskbar: options.skipTaskbar !== false,
    showInactive: options.showInactive !== false,
    visibleOnAllWorkspaces: options.visibleOnAllWorkspaces !== false,
    backgroundColor: typeof options.backgroundColor === 'string' ? options.backgroundColor : '#00000000',
    minWidth: Math.max(1, Math.round(options.minWidth || 80)),
    minHeight: Math.max(1, Math.round(options.minHeight || 60))
  }
}

function getModloaderWindowBySender(sender){
  for (const record of modloaderWindows.values()) {
    if (record?.window?.webContents === sender) return record
  }
  return null
}

function closeModloaderWindow(id){
  const record = modloaderWindows.get(id)
  if (!record) return
  modloaderWindows.delete(id)
  stopModloaderModifierMonitor(record)
  try { if (record.window && !record.window.isDestroyed()) record.window.close() } catch (e) {}
  restoreModloaderParentWindowIfIdle()
}

ipcMain.on(`modloader:window:ping`, (event)=>{
  event.returnValue = 'ok'
})

ipcMain.on(`modloader:window:open`, (event, payload)=>{
  if (!win || win.isDestroyed?.()) return
  const id = String(payload?.id || '').trim()
  if (!id) return
  closeModloaderWindow(id)
  const options = normalizeModloaderWindowOptions(payload?.options)
  const size = payload?.size || { width: 240, height: 160 }
  const child = new BrowserWindow({
    width: Math.max(options.minWidth, Math.round(size.width || 240)),
    height: Math.max(options.minHeight, Math.round(size.height || 160)),
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    frame: options.frame,
    transparent: options.transparent,
    resizable: options.resizable,
    movable: options.movable,
    fullscreenable: false,
    alwaysOnTop: options.alwaysOnTop,
    skipTaskbar: options.skipTaskbar,
    show: false,
    backgroundColor: options.backgroundColor,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  })
  const record = { id, window: child, options, ready: false, pendingPayload: payload?.payload }
  modloaderWindows.set(id, record)
  if (!options.globalModifierKeys) child.webContents.on('before-input-event', (event, input)=>{
    const key = String(input?.key || '')
    const keyCode = key === 'Shift' ? 16 : key === 'Control' ? 17 : key === 'Alt' ? 18 : 0
    if (!keyCode || !win || win.isDestroyed?.()) return
    win.webContents.send(`modloader:window:message`, {
      id: record.id,
      type: 'key',
      payload: {
        eventType: input.type === 'keyUp' ? 'keyup' : 'keydown',
        key,
        code: input.code || '',
        keyCode,
        altKey: !!input.alt,
        ctrlKey: !!input.control,
        shiftKey: !!input.shift,
        repeat: !!input.isAutoRepeat
      }
    })
  })
  startModloaderModifierMonitor(record)
  try { if (options.alwaysOnTop) child.setAlwaysOnTop(true, 'screen-saver') } catch (e) {}
  try { if (options.visibleOnAllWorkspaces) child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) } catch (e) {}
  child.on('closed', ()=>{
    stopModloaderModifierMonitor(record)
    if (modloaderWindows.get(id) === record) modloaderWindows.delete(id)
    restoreModloaderParentWindowIfIdle()
    if (win && !win.isDestroyed?.()) win.webContents.send(`modloader:window:closed`, { id })
  })
  child.webContents.on('did-finish-load', ()=>{
    record.ready = true
    setModloaderWindowBounds(record, size)
    try { options.showInactive && child.showInactive ? child.showInactive() : child.show() } catch (e) {}
    if (options.hideParent) hideModloaderParentWindow()
    sendModloaderWindowPayload(record)
  })
  setModloaderWindowBounds(record, size)
  child.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(payload?.html || '<!doctype html><body></body>'))
})

ipcMain.on(`modloader:window:update`, (event, payload)=>{
  const record = modloaderWindows.get(String(payload?.id || ''))
  if (!record) return
  if (payload?.size) setModloaderWindowBounds(record, payload.size)
  if ('payload' in (payload || {})) record.pendingPayload = payload.payload
  sendModloaderWindowPayload(record)
})

ipcMain.on(`modloader:window:resize`, (event, payload)=>{
  const record = getModloaderWindowBySender(event.sender)
  if (!record) return
  const size = payload?.size || {}
  const width = Math.max(record.options?.minWidth || 80, Math.round(size.width || 0))
  const height = Math.max(record.options?.minHeight || 60, Math.round(size.height || 0))
  setModloaderWindowBounds(record, { width, height })
})

ipcMain.on(`modloader:window:move`, (event, payload)=>{
  const record = getModloaderWindowBySender(event.sender)
  if (!record) return
  setModloaderWindowManualBounds(record, payload?.bounds || payload, payload?.snap !== false, payload?.animate === true)
})

ipcMain.on(`modloader:window:focus`, (event)=>{
  const record = getModloaderWindowBySender(event.sender)
  if (!record?.window || record.window.isDestroyed()) return
  try { record.window.focus() } catch (e) {}
})

ipcMain.on(`modloader:window:shape`, (event, payload)=>{
  const record = getModloaderWindowBySender(event.sender)
  if (!record?.window || record.window.isDestroyed() || typeof record.window.setShape !== 'function') return
  const bounds = record.window.getContentBounds?.() || record.window.getBounds?.() || {}
  const width = Math.max(1, Math.round(bounds.width || 1))
  const height = Math.max(1, Math.round(bounds.height || 1))
  const rects = (Array.isArray(payload?.rects) ? payload.rects : []).map(rect=>{
    const x = Math.max(0, Math.min(width - 1, Math.round(Number(rect?.x) || 0)))
    const y = Math.max(0, Math.min(height - 1, Math.round(Number(rect?.y) || 0)))
    return {
      x,
      y,
      width: Math.max(1, Math.min(width - x, Math.round(Number(rect?.width) || 1))),
      height: Math.max(1, Math.min(height - y, Math.round(Number(rect?.height) || 1)))
    }
  })
  try { record.window.setShape(rects.length ? rects : [{ x: 0, y: 0, width, height }]) } catch (e) {}
})

ipcMain.on(`modloader:window:message`, (event, payload)=>{
  const record = getModloaderWindowBySender(event.sender)
  if (!record || !win || win.isDestroyed?.()) return
  win.webContents.send(`modloader:window:message`, {
    id: record.id,
    type: payload?.type || 'message',
    payload: payload?.payload
  })
})

ipcMain.on(`modloader:window:close`, (event, payload)=>{
  const record = getModloaderWindowBySender(event.sender)
  const id = record?.id || String(payload?.id || '')
  if (id) closeModloaderWindow(id)
})
//1111111111111111
// ipcMain.on(`getDebugInfo`, (e,d)=>{
//   win.webContents.send(`console`, `=START=`)
//   client.input.init()
//   win.webContents.send(`console`, client.input.getControllers())
// })

function getCloudSave(){
  if (client.cloud?.fileExists(`SFSaveFile`)){
    try {
      const save = client.cloud.readFile(`SFSaveFile`)
      return save
    } catch(e){
      console.log(`Couldn't read the save file.`)
      return false
    }
  } else {
    return false
  }
}
function getAccumulatedPlayTime(){
  if (client.cloud?.fileExists(`SFApt`)){
    try {
      const v = client.cloud.readFile(`SFApt`)
      return +v
    } catch(e){
      console.log(`Couldn't read the file.`)
      return 0
    }
  } else {
    return 0
  }
}

function getSteamAchievements(){
  const list = [`FOOLSGOLD`, `DEEPPURPLE`, `BLOODOFTHELAND`, `GREENENERGY`, `HOTGLASS`, `HOLYCONCRETE`, `CANITDODISHES`, `WHERETHESUNDOESNTSHINE`, `WHOYOUGONNACALL`, `NIETZSCHE`, `64K`, `64M`, `64B`, `YOUMAYRESETNOW`, `PERPETUMSHMOBILE`, `NEEDABREAK`, `MUSTDESTROY`, `ARCHITECT`, `DESTROYER`, `HELLRAISER`, `ENDBEGINNING`, `COOKIECLICKER`, `DRUNKENSAILOR`, `MRMINE`, `ISTHEREALIMIT`, `SETHBRUNDLE`, `REDBLUEROCK`, `STRAIGHTTOHELL`, `SCRATCHTHESURFACE`, `ISITHOT`, `TOODEEP`, `SIXTYFOURDOWN`, `NEOPHOBIA`, `JACKPOT`]
  const map = []
  for (let i = 0; i < list.length; i++){
    map.push((client.achievement?.isActivated(list[i])) ? 1 : 0)
  }
  return map
}

// MAIN APP
const createWindow = _=> {
  win = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 1024,
    minHeight: 800,
    icon: `appicon.png`,
    autoHideMenuBar: true,
    // titleBarStyle: 'hidden',
    fullscreen: true,
    webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
    }
  })

  if (!options.fullscreen) win.setFullScreen(false)

  const isMac = process.platform === 'darwin'
  const temp = [
    {
      label: app.name,
      submenu: [{role: 'about'},{role: isMac ? 'quit' : 'close'}]
    },
    {
      label: 'View',
      submenu: [
        {role: 'togglefullscreen'},
        {role: 'toggleDevTools'}
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(temp)
  Menu.setApplicationMenu(menu)

  globalShortcut.register('CommandOrControl+Shift+I', _=>{
    win.webContents.toggleDevTools()
  })
  globalShortcut.register('F12', _=>{
    win.webContents.toggleDevTools()
  })

  win.webContents.on('console-message', (event, level, message, line, sourceId)=>{
    runtimeLog('console', level, message, `${sourceId}:${line}`)
  })
  win.webContents.on('render-process-gone', (event, details)=>{
    runtimeLog('render-process-gone', details)
  })
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL)=>{
    runtimeLog('did-fail-load', errorCode, errorDescription, validatedURL)
  })

  //LOAD
  win.loadFile('./game/index.html')

  win.on('blur', ()=>{
    // win.blur()
    // win.webContents.send(`windowState`, `blur`)
  })
  win.on('focus', ()=>{
    // win.focus()
    // win.webContents.send(`windowState`, `focus`)
  })
  // win.webContents.openDevTools()//1111111111111111

}

app.whenReady().then(() => {

  createWindow()
  // if (process.platform !== 'darwin') globalShortcut.register("CommandOrControl+W", _=>{})
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('browser-window-focus', _=>{
    globalShortcut.register("CommandOrControl+W", _=>{})
})
app.on('browser-window-blur', function () {
    globalShortcut.unregister("CommandOrControl+W")
})

// require('steamworks.js').electronEnableSteamOverlay()