const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { SnapshotStore, SnapshotStoreError, safeMessageForCode } = require('./snapshot-store.js')
const { encodeSnapshotContainer } = require('./snapshot-container.js')
const { LibraryStore, LibraryStoreError, normalizeManifestLibraries, safeMessageForCode: safeLibraryMessageForCode } = require('./library-store.js')

const runtimeLogPath = path.join(__dirname, 'state', 'runtime.log')
function runtimeLog(...args){
  try {
    fs.mkdirSync(path.dirname(runtimeLogPath), { recursive: true })
    fs.appendFileSync(runtimeLogPath, `[${new Date().toISOString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`)
  } catch (e) {}
}

function readJsonFile(filePath, fallback){
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    return fallback
  }
}

function normalizeEnabledEntries(enabled){
  const list = Array.isArray(enabled) ? enabled : enabled?.mods || []
  return list.map(entry=>{
    if (typeof entry === 'string') return { path: entry, enabled: true }
    return {
      path: entry?.path || entry?.id,
      id: entry?.id,
      enabled: entry?.enabled !== false
    }
  }).filter(entry=>entry.enabled && entry.path)
}

function applyModloaderMainProcessManifests(){
  const modsDir = path.resolve(__dirname, '..', 'mods')
  const enabled = readJsonFile(path.join(modsDir, 'enabled.json'), { mods: [] })
  const requests = {
    forceWaveAudio: false,
    enableExclusiveAudio: false,
    trySupportedChannelLayouts: false,
    disableOutOfProcessAudioService: false,
    enableChromiumAudioLog: false,
    mods: []
  }

  for (const entry of normalizeEnabledEntries(enabled)) {
    const manifest = readJsonFile(path.join(modsDir, entry.path, 'mod.json'), null)
    const audio = manifest?.mainProcess?.audio || manifest?.audioCompatibility
    if (!audio || typeof audio !== 'object') continue
    const modId = manifest.id || entry.id || entry.path
    let requested = false
    if (audio.forceWaveAudio === true) {
      requests.forceWaveAudio = true
      requested = true
    }
    if (audio.enableExclusiveAudio === true) {
      requests.enableExclusiveAudio = true
      requested = true
    }
    if (audio.trySupportedChannelLayouts === true) {
      requests.trySupportedChannelLayouts = true
      requested = true
    }
    if (audio.disableOutOfProcessAudioService === true) {
      requests.disableOutOfProcessAudioService = true
      requested = true
    }
    if (audio.enableChromiumAudioLog === true || audio.chromiumAudioLog === true) {
      requests.enableChromiumAudioLog = true
      requested = true
    }
    if (requested) requests.mods.push(modId)
  }

  if (requests.forceWaveAudio) app.commandLine.appendSwitch('force-wave-audio')
  if (requests.enableExclusiveAudio) app.commandLine.appendSwitch('enable-exclusive-audio')
  if (requests.trySupportedChannelLayouts) app.commandLine.appendSwitch('try-supported-channel-layouts')
  if (requests.disableOutOfProcessAudioService) app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess')
  let chromiumAudioLogPath = ''
  if (requests.enableChromiumAudioLog) {
    chromiumAudioLogPath = path.join(__dirname, 'state', 'chromium-audio.log')
    app.commandLine.appendSwitch('enable-logging', 'file')
    app.commandLine.appendSwitch('log-file', chromiumAudioLogPath)
    app.commandLine.appendSwitch('log-level', '0')
    app.commandLine.appendSwitch('v', '1')
    app.commandLine.appendSwitch('vmodule', '*audio*=2,*media*=2,*wasapi*=2')
  }
  if (requests.mods.length) {
    const applied = {
      forceWaveAudio: app.commandLine.hasSwitch?.('force-wave-audio') || false,
      enableExclusiveAudio: app.commandLine.hasSwitch?.('enable-exclusive-audio') || false,
      trySupportedChannelLayouts: app.commandLine.hasSwitch?.('try-supported-channel-layouts') || false,
      disableFeatures: app.commandLine.getSwitchValue?.('disable-features') || '',
      enableLogging: app.commandLine.getSwitchValue?.('enable-logging') || '',
      logFile: app.commandLine.getSwitchValue?.('log-file') || '',
      logLevel: app.commandLine.getSwitchValue?.('log-level') || '',
      v: app.commandLine.getSwitchValue?.('v') || '',
      vmodule: app.commandLine.getSwitchValue?.('vmodule') || '',
      chromiumAudioLogPath
    }
    runtimeLog('mainProcessAudioCompatibility', { requested: requests, applied })
  }
}

function collectLibraryDeclarations(){
  const modsDir = path.resolve(__dirname, '..', 'mods')
  const enabled = readJsonFile(path.join(modsDir, 'enabled.json'), { mods: [] })
  const declarations = []
  for (const entry of normalizeEnabledEntries(enabled)) {
    const manifest = readJsonFile(path.join(modsDir, entry.path, 'mod.json'), null)
    if (!manifest || typeof manifest !== 'object') continue
    const modId = String(manifest.id || entry.id || entry.path || '').trim()
    declarations.push(...normalizeManifestLibraries(modId, manifest.libraries))
  }
  return declarations
}

applyModloaderMainProcessManifests()
const modloaderWindows = new Map()
const snapshotContexts = new Map()
const librarySubscriptions = new Map()
let modloaderParentWindowState = null
const modloaderWindowMargin = 12
let win = null
let snapshotStore = null
let snapshotAccountScope = ''
let libraryStore = null
const snapshotSaveIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

function snapshotEnvelope(value){
  return { ok: true, value }
}

function snapshotErrorEnvelope(error){
  const allowed = new Set(['UNAVAILABLE', 'NO_ACTIVE_SAVE', 'INVALID_PAYLOAD', 'TOO_LARGE', 'NOT_FOUND', 'CORRUPT', 'QUOTA', 'IO'])
  const code = allowed.has(error?.code) ? error.code : 'IO'
  runtimeLog('snapshotRequestFailed', { code, internalCode: error?.code || '', message: error?.message || String(error) })
  return { ok: false, error: { code, message: safeMessageForCode(code) } }
}

function libraryEnvelope(value){
  return { ok: true, value }
}

function libraryErrorEnvelope(error){
  const allowed = new Set(['NOT_READY', 'PERMISSION_DENIED', 'PATH_INVALID', 'NAME_CONFLICT', 'REVISION_CONFLICT', 'TOO_LARGE', 'QUOTA_EXCEEDED', 'CORRUPT', 'NOT_FOUND', 'IO_FAILED', 'WATCH_UNAVAILABLE'])
  const code = allowed.has(error?.code) ? error.code : 'IO_FAILED'
  runtimeLog('libraryRequestFailed', { code, internalCode: error?.code || '', message: error?.message || String(error) })
  return { ok: false, error: { code, message: safeLibraryMessageForCode(code) } }
}

function installationIdentity(){
  const directory = path.join(app.getPath('userData'), 'modloader')
  const identityPath = path.join(directory, 'identity.json')
  const existingIdentity = fs.existsSync(identityPath)
  try {
    const parsed = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
    if (parsed?.version === 1 && snapshotSaveIdPattern.test(String(parsed.id || ''))) return parsed.id
  } catch (error) {}
  const id = crypto.randomUUID()
  const temporaryPath = identityPath + `.tmp-${process.pid}-${Date.now()}`
  let corruptPath = ''
  fs.mkdirSync(directory, { recursive: true })
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, id }, null, 2), { encoding: 'utf8', flag: 'wx' })
    if (existingIdentity) {
      corruptPath = identityPath + `.corrupt-${Date.now()}`
      fs.renameSync(identityPath, corruptPath)
      runtimeLog('snapshotInstallationIdentityReset', { reason: 'invalid-identity' })
    }
    fs.renameSync(temporaryPath, identityPath)
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }) } catch (cleanupError) {}
    if (corruptPath && !fs.existsSync(identityPath)) {
      try { fs.renameSync(corruptPath, identityPath) } catch (restoreError) {}
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(identityPath, 'utf8'))
      if (parsed?.version === 1 && snapshotSaveIdPattern.test(String(parsed.id || ''))) return parsed.id
    } catch (readError) {}
    throw error
  }
  return id
}

function configureSnapshotStore(options){
  const accountId = String(options?.accountId || '').trim()
  try {
    snapshotAccountScope = accountId ? `steam:${accountId}` : `installation:${installationIdentity()}`
    snapshotStore = new SnapshotStore({
      rootDir: path.join(app.getPath('userData'), 'modloader', 'snapshots'),
      log(event, details) { runtimeLog(event, details) }
    })
    snapshotStore.initialize().catch(error=>{
      runtimeLog('snapshotStoreInitializationFailed', { code: error?.code || 'IO', message: error?.message || String(error) })
    })
  } catch (error) {
    snapshotAccountScope = ''
    snapshotStore = null
    runtimeLog('snapshotStoreConfigurationFailed', { code: error?.code || 'IO', message: error?.message || String(error) })
  }
}

function configureLibraryStore(options){
  try {
    for (const record of librarySubscriptions.values()) {
      try { record.handle?.close() } catch (error) {}
    }
    librarySubscriptions.clear()
    libraryStore?.dispose()
    libraryStore = new LibraryStore({
      installationRoot: path.resolve(options?.installationRoot || path.resolve(__dirname, '..', '..', '..', '..')),
      declarations: collectLibraryDeclarations(),
      log(event, details) { runtimeLog(event, details) }
    })
  } catch (error) {
    libraryStore = null
    runtimeLog('libraryStoreConfigurationFailed', { code: error?.code || 'NOT_READY', message: error?.message || String(error) })
  }
}

function libraryRuntimeContext(payload){
  const modId = String(payload?.modId || '').trim()
  const libraryId = String(payload?.libraryId || '').trim().toLowerCase()
  if (!modId || !libraryId) throw new LibraryStoreError('PATH_INVALID', safeLibraryMessageForCode('PATH_INVALID'))
  return { modId, libraryId }
}

function clearLibrarySubscriptions(sender){
  const senderKey = typeof sender === 'string' || typeof sender === 'number' ? String(sender) : snapshotSenderKey(sender)
  if (!senderKey) return
  for (const [id, record] of librarySubscriptions) {
    if (record.senderKey !== senderKey) continue
    try { record.handle?.close() } catch (error) {}
    librarySubscriptions.delete(id)
  }
}

function snapshotSenderKey(sender){
  return String(sender?.id ?? '')
}

function clearSnapshotContext(sender){
  const key = typeof sender === 'string' || typeof sender === 'number' ? String(sender) : snapshotSenderKey(sender)
  if (key) snapshotContexts.delete(key)
}

function activeSnapshotContext(event, token){
  const key = snapshotSenderKey(event?.sender)
  const context = key ? snapshotContexts.get(key) : null
  if (!context || context.token !== String(token || '')) {
    throw new SnapshotStoreError('NO_ACTIVE_SAVE', 'No active save is available.')
  }
  return context
}

function snapshotRuntimeContext(event, payload){
  const active = activeSnapshotContext(event, payload?.token)
  const modId = String(payload?.modId || '').trim()
  if (!modId) throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot Mod identity is invalid.')
  return {
    modId,
    saveInstanceId: active.saveInstanceId,
    accountScope: snapshotAccountScope
  }
}

function sanitizeSnapshotFilePart(value, fallback){
  const safe = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return safe || fallback
}

function snapshotExportFileName(record){
  const item = record?.item || {}
  const date = new Date(Number(item.createdAt) || Date.now())
  const pad = value=>String(value).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  const mod = sanitizeSnapshotFilePart(item.modId, 'mod')
  const id = sanitizeSnapshotFilePart(item.id, 'snapshot').slice(-20)
  return `${mod}_${stamp}_${id}.modloader-snapshot`
}

function snapshotContainerMetadata(record){
  const metadata = record?.metadata || {}
  return {
    exportedAt: Date.now(),
    snapshot: {
      id: metadata.id || record?.item?.id || '',
      createdAt: Number(metadata.createdAt || record?.item?.createdAt || 0),
      modId: metadata.modId || record?.item?.modId || '',
      saveInstanceId: metadata.saveInstanceId || '',
      namespace: record?.item?.namespace || '',
      bytes: Number(metadata.bytes || record?.payload?.length || 0),
      sha256: metadata.sha256 || '',
      apiVersion: metadata.apiVersion || '1.0.0',
      payloadType: metadata.payloadType === 'utf8' ? 'utf8' : 'bytes',
      reason: metadata.reason || '',
      tags: metadata.tags
    },
    integrity: record?.integrity || { status: 'unknown' }
  }
}
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
  const script = path.join(__dirname, 'tools', 'modifier-watch.ps1')
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

function getModloaderDialogParent(event){
  try {
    const senderWindow = BrowserWindow.fromWebContents(event?.sender)
    if (senderWindow && !senderWindow.isDestroyed()) return senderWindow
  } catch (e) {}
  if (win && !win.isDestroyed?.()) return win
  return null
}

function normalizeModloaderDialogOptions(options){
  return options && typeof options === 'object' ? options : {}
}

ipcMain.handle(`modloader:snapshots:activate`, async (event, payload)=>{
  try {
    if (!snapshotStore || !snapshotAccountScope) throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot storage is unavailable.')
    const saveInstanceId = String(payload?.saveInstanceId || '').trim().toLowerCase()
    if (!snapshotSaveIdPattern.test(saveInstanceId)) throw new SnapshotStoreError('NO_ACTIVE_SAVE', 'No active save is available.')
    await snapshotStore.initialize()
    const key = snapshotSenderKey(event?.sender)
    if (!key) throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot storage is unavailable.')
    const token = crypto.randomUUID()
    snapshotContexts.set(key, { saveInstanceId, token })
    if (event?.sender?.once) event.sender.once('destroyed', ()=>clearSnapshotContext(key))
    return snapshotEnvelope({
      token,
      saveInstanceId,
      capabilities: Object.assign({}, snapshotStore.capabilities(), { activeSave: true })
    })
  } catch (error) {
    return snapshotErrorEnvelope(error)
  }
})

ipcMain.handle(`modloader:snapshots:runtime`, async (event, payload)=>{
  try {
    if (!snapshotStore) throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot storage is unavailable.')
    const action = String(payload?.action || '')
    if (action === 'capabilities') {
      const key = snapshotSenderKey(event?.sender)
      const active = key ? snapshotContexts.get(key) : null
      return snapshotEnvelope(Object.assign({}, snapshotStore.capabilities(), {
        activeSave: !!active,
        available: true
      }))
    }
    const context = snapshotRuntimeContext(event, payload)
    let result
    if (action === 'create') result = await snapshotStore.create(context, payload?.request)
    else if (action === 'list') result = await snapshotStore.list(context)
    else if (action === 'read') {
      const record = await snapshotStore.read(context, payload?.request)
      result = {
        info: record.info,
        data: record.info.payloadType === 'utf8' ? record.payload.toString('utf8') : Uint8Array.from(record.payload)
      }
    } else if (action === 'remove') result = await snapshotStore.remove(context, payload?.request)
    else if (action === 'prune') result = await snapshotStore.prune(context)
    else throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot request is invalid.')
    return snapshotEnvelope(result)
  } catch (error) {
    return snapshotErrorEnvelope(error)
  }
})

ipcMain.handle(`modloader:snapshots:admin`, async (event, payload)=>{
  try {
    if (!snapshotStore) throw new SnapshotStoreError('UNAVAILABLE', 'Snapshot storage is unavailable.')
    const action = String(payload?.action || '')
    let result
    if (action === 'list') result = await snapshotStore.adminList()
    else if (action === 'validate') result = await snapshotStore.adminValidate(payload?.locator)
    else if (action === 'remove') result = await snapshotStore.adminRemove(payload?.locator)
    else if (action === 'export') {
      const record = await snapshotStore.adminExportData(payload?.locator)
      const container = encodeSnapshotContainer({
        metadata: snapshotContainerMetadata(record),
        payload: record.payload
      })
      const parent = getModloaderDialogParent(event)
      const defaultPath = snapshotExportFileName(record)
      const dialogOptions = {
        title: 'Export ModLoader Snapshot',
        defaultPath,
        filters: [
          { name: 'ModLoader Snapshot', extensions: ['modloader-snapshot'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }
      const selected = parent ? await dialog.showSaveDialog(parent, dialogOptions) : await dialog.showSaveDialog(dialogOptions)
      if (selected?.canceled || !selected?.filePath) return snapshotEnvelope({ canceled: true })
      await fs.promises.writeFile(selected.filePath, container)
      runtimeLog('snapshotExported', {
        status: record.status,
        id: record.item?.id || '',
        bytes: container.length,
        fileName: path.basename(selected.filePath)
      })
      result = { canceled: false, fileName: path.basename(selected.filePath), bytes: container.length }
    } else throw new SnapshotStoreError('INVALID_PAYLOAD', 'Snapshot request is invalid.')
    return snapshotEnvelope(result)
  } catch (error) {
    return snapshotErrorEnvelope(error)
  }
})

ipcMain.handle(`modloader:libraries:runtime`, async (event, payload)=>{
  try {
    if (!libraryStore) throw new LibraryStoreError('NOT_READY', safeLibraryMessageForCode('NOT_READY'))
    const action = String(payload?.action || '')
    const context = libraryRuntimeContext(payload)
    const request = payload?.request
    let result
    if (action === 'capabilities') result = await libraryStore.capabilities(context)
    else if (action === 'list') result = await libraryStore.list(context, request)
    else if (action === 'read') {
      const record = await libraryStore.read(context, request)
      result = {
        info: record.info,
        data: record.payloadType === 'utf8' ? record.payload.toString('utf8') : Uint8Array.from(record.payload)
      }
    } else if (action === 'write') result = await libraryStore.write(context, request)
    else if (action === 'rename') result = await libraryStore.rename(context, request)
    else if (action === 'trash') result = await libraryStore.trash(context, request)
    else if (action === 'restore') result = await libraryStore.restore(context, request)
    else if (action === 'quarantine') result = await libraryStore.quarantine(context, request)
    else if (action === 'remove') result = await libraryStore.remove(context, request)
    else if (action === 'openFolder') {
      const directory = await libraryStore.folder(context, request)
      const openError = await shell.openPath(directory)
      if (openError) throw new LibraryStoreError('IO_FAILED', openError)
      result = { opened: true, area: String(request?.area || 'active'), bucket: request?.bucket || undefined }
    } else if (action === 'watch') {
      const sender = event?.sender
      const senderKey = snapshotSenderKey(sender)
      if (!senderKey || !sender?.send) throw new LibraryStoreError('WATCH_UNAVAILABLE', safeLibraryMessageForCode('WATCH_UNAVAILABLE'))
      const handle = await libraryStore.watch(context, watchEvent=>{
        try {
          if (!sender.isDestroyed?.()) sender.send('modloader:libraries:event', { subscriptionId: handle.id, event: watchEvent })
        } catch (error) {
          runtimeLog('libraryWatchDeliveryFailed', { subscriptionId: handle.id, message: error?.message || String(error) })
        }
      })
      librarySubscriptions.set(handle.id, { handle, senderKey, modId: context.modId, libraryId: context.libraryId })
      sender.once?.('destroyed', ()=>clearLibrarySubscriptions(senderKey))
      result = { subscriptionId: handle.id }
    } else if (action === 'unwatch') {
      const subscriptionId = String(request?.subscriptionId || '')
      const record = librarySubscriptions.get(subscriptionId)
      if (!record || record.senderKey !== snapshotSenderKey(event?.sender) || record.modId !== context.modId || record.libraryId !== context.libraryId) {
        throw new LibraryStoreError('PERMISSION_DENIED', safeLibraryMessageForCode('PERMISSION_DENIED'))
      }
      record.handle.close()
      librarySubscriptions.delete(subscriptionId)
      result = { subscriptionId, closed: true }
    } else throw new LibraryStoreError('PATH_INVALID', safeLibraryMessageForCode('PATH_INVALID'))
    return libraryEnvelope(result)
  } catch (error) {
    return libraryErrorEnvelope(error)
  }
})

ipcMain.handle(`modloader:dialog:save`, async (event, options)=>{
  const parent = getModloaderDialogParent(event)
  const dialogOptions = normalizeModloaderDialogOptions(options)
  return parent ? dialog.showSaveDialog(parent, dialogOptions) : dialog.showSaveDialog(dialogOptions)
})

ipcMain.handle(`modloader:dialog:open`, async (event, options)=>{
  const parent = getModloaderDialogParent(event)
  const dialogOptions = normalizeModloaderDialogOptions(options)
  return parent ? dialog.showOpenDialog(parent, dialogOptions) : dialog.showOpenDialog(dialogOptions)
})

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
function attachWindow(parentWindow, options){
  win = parentWindow
  configureSnapshotStore(options)
  configureLibraryStore(options)
  const sender = win?.webContents
  if (sender?.once) sender.once('destroyed', ()=>{
    clearSnapshotContext(sender)
    clearLibrarySubscriptions(sender)
  })
}

module.exports = {
  attachWindow,
  clearSnapshotContext,
  clearLibrarySubscriptions,
  collectLibraryDeclarations,
  runtimeLog
}
