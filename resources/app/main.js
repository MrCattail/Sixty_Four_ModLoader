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
const { app, BrowserWindow, Tray, ipcMain, Menu, shell, globalShortcut } = require('electron')
app.allowRendererProcessReuse = false

//App options
const fs = require('fs')
const path = require('path')
const ModLoaderMainProcess = require('./game/modloader/main-process.js')
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
  ModLoaderMainProcess.runtimeLog('gameError', d && (d.stack || d.message || d.toString ? d.toString() : d))
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
  ModLoaderMainProcess.attachWindow(win)

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
    ModLoaderMainProcess.runtimeLog('console', level, message, `${sourceId}:${line}`)
  })
  win.webContents.on('render-process-gone', (event, details)=>{
    ModLoaderMainProcess.runtimeLog('render-process-gone', details)
  })
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL)=>{
    ModLoaderMainProcess.runtimeLog('did-fail-load', errorCode, errorDescription, validatedURL)
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