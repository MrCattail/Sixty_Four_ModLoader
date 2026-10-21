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
let appWindowOptions = null
let saveAppWindowOptions = null
let recreateAppWindow = null
let appWindowResizeSaveTimer = null
let appWindowRecreateTimer = null
let attachedMainWindowFrameless = false
let pendingMainWindowFrameless = false
const snapshotSaveIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const LIBRARY_API_VERSION = '1.1.0'
const appWindowAspectRatios = [
  { id: '1:1', width: 1, height: 1, label: '1:1' },
  { id: '4:3', width: 4, height: 3, label: '4:3' },
  { id: '16:9', width: 16, height: 9, label: '16:9' },
  { id: '21:9', width: 21, height: 9, label: '21:9', requireDisplayAspect: true },
  { id: '32:9', width: 32, height: 9, label: '32:9', requireDisplayAspect: true }
]
const appWindowPresetSizesByAspect = {
  '1:1': [
    [720, 720],
    [900, 900],
    [1080, 1080],
    [1440, 1440],
    [2160, 2160]
  ],
  '4:3': [
    [1024, 768],
    [1280, 960],
    [1600, 1200],
    [1920, 1440],
    [2560, 1920]
  ],
  '16:9': [
    [1280, 720],
    [1366, 768],
    [1600, 900],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160]
  ],
  '21:9': [
    [1680, 720],
    [2560, 1080],
    [3440, 1440],
    [3840, 1600],
    [5120, 2160]
  ],
  '32:9': [
    [3840, 1080],
    [5120, 1440],
    [7680, 2160]
  ]
}
const appWindowPresetScaleStops = [0.5, 0.625, 0.75, 0.875, 1]
const appWindowMinDipSize = { width: 640, height: 360 }

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

function appWindowEnvelope(value){
  return { ok: true, value }
}

function appWindowErrorEnvelope(code, message){
  return { ok: false, error: { code: code || 'IO_FAILED', message: message || 'Window operation failed.' } }
}

function normalizeAppWindowSize(size, displayBounds){
  const maxWidth = Math.max(1, Math.round(Number(displayBounds?.width) || 1))
  const maxHeight = Math.max(1, Math.round(Number(displayBounds?.height) || 1))
  const width = Math.max(appWindowMinDipSize.width, Math.min(maxWidth, Math.round(Number(size?.width) || 0)))
  const height = Math.max(appWindowMinDipSize.height, Math.min(maxHeight, Math.round(Number(size?.height) || 0)))
  if (!width || !height) return null
  return { width, height }
}

function getPrimaryAppWindowDisplay(){
  const display = screen.getPrimaryDisplay()
  const bounds = display?.bounds || {}
  const workArea = display?.workArea || {}
  const scaleFactor = Number(display?.scaleFactor) > 0 ? Number(display.scaleFactor) : 1
  const dipBounds = {
    x: Math.round(Number(bounds.x) || 0),
    y: Math.round(Number(bounds.y) || 0),
    width: Math.round(Number(bounds.width) || 0),
    height: Math.round(Number(bounds.height) || 0)
  }
  const dipWorkArea = {
    x: Math.round(Number(workArea.x) || 0),
    y: Math.round(Number(workArea.y) || 0),
    width: Math.round(Number(workArea.width) || 0),
    height: Math.round(Number(workArea.height) || 0)
  }
  return {
    id: display?.id,
    scaleFactor,
    bounds: dipBounds,
    workArea: dipWorkArea,
    physicalBounds: {
      width: Math.round(dipBounds.width * scaleFactor),
      height: Math.round(dipBounds.height * scaleFactor)
    },
    physicalWorkArea: {
      width: Math.round(dipWorkArea.width * scaleFactor),
      height: Math.round(dipWorkArea.height * scaleFactor)
    }
  }
}

function getAppWindowAspectValue(aspect){
  return (Number(aspect?.width) || 1) / (Number(aspect?.height) || 1)
}

function getAppWindowAspectRatio(id){
  const requested = String(id || '').trim()
  return appWindowAspectRatios.find(aspect => aspect.id === requested) || appWindowAspectRatios.find(aspect => aspect.id === '16:9')
}

function displaySupportsAppWindowAspect(display, aspect){
  const bounds = display?.physicalBounds || display?.bounds || {}
  const width = Number(bounds.width) || 0
  const height = Number(bounds.height) || 0
  if (!width || !height) return false
  const scaleFactor = Number(display?.scaleFactor) > 0 ? Number(display.scaleFactor) : 1
  const maxSize = getMaxPhysicalSizeForAspect(bounds, aspect)
  if (maxSize.width < appWindowMinDipSize.width * scaleFactor || maxSize.height < appWindowMinDipSize.height * scaleFactor) return false
  if (!aspect?.requireDisplayAspect) return true
  return width / height >= getAppWindowAspectValue(aspect) - 0.04
}

function listAppWindowAspectRatios(display){
  return appWindowAspectRatios.filter(aspect => displaySupportsAppWindowAspect(display, aspect)).map(aspect => ({
    id: aspect.id,
    label: aspect.label,
    width: aspect.width,
    height: aspect.height
  }))
}

function getMaxPhysicalSizeForAspect(physicalBounds, aspect){
  const target = getAppWindowAspectValue(aspect)
  const maxWidth = Math.max(1, Math.round(Number(physicalBounds?.width) || 1))
  const maxHeight = Math.max(1, Math.round(Number(physicalBounds?.height) || 1))
  let width = maxWidth
  let height = Math.round(width / target)
  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * target)
  }
  width = Math.max(1, Math.min(maxWidth, width - (width % 2)))
  height = Math.max(1, Math.min(maxHeight, height - (height % 2)))
  return { width, height }
}

function normalizePhysicalSizeForAspect(width, aspect, physicalBounds){
  const target = getAppWindowAspectValue(aspect)
  const maxWidth = Math.max(1, Math.round(Number(physicalBounds?.width) || 1))
  const maxHeight = Math.max(1, Math.round(Number(physicalBounds?.height) || 1))
  let nextWidth = Math.max(1, Math.min(maxWidth, Math.round(Number(width) || 0)))
  let nextHeight = Math.round(nextWidth / target)
  if (nextHeight > maxHeight) {
    nextHeight = maxHeight
    nextWidth = Math.round(nextHeight * target)
  }
  nextWidth = Math.max(1, Math.min(maxWidth, nextWidth - (nextWidth % 2)))
  nextHeight = Math.max(1, Math.min(maxHeight, nextHeight - (nextHeight % 2)))
  return { width: nextWidth, height: nextHeight }
}

function listAppWindowPresets(aspectId){
  const display = getPrimaryAppWindowDisplay()
  const bounds = display.bounds
  const physicalBounds = display.physicalBounds || bounds
  const scaleFactor = display.scaleFactor || 1
  const aspect = getAppWindowAspectRatio(aspectId || appWindowOptions?.windowAspectRatio || '16:9')
  const aspectRatios = listAppWindowAspectRatios(display)
  const presets = []
  const seen = new Set()
  const addPreset = function (id, physicalWidth, physicalHeight, label) {
    const minPhysicalWidth = Math.round(appWindowMinDipSize.width * scaleFactor)
    const minPhysicalHeight = Math.round(appWindowMinDipSize.height * scaleFactor)
    if (physicalWidth < minPhysicalWidth || physicalHeight < minPhysicalHeight) return
    const size = normalizeAppWindowSize({
      width: Math.round(physicalWidth / scaleFactor),
      height: Math.round(physicalHeight / scaleFactor)
    }, bounds)
    if (!size || seen.has(id)) return
    seen.add(id)
    presets.push({
      id,
      width: size.width,
      height: size.height,
      physicalWidth: Math.round(physicalWidth),
      physicalHeight: Math.round(physicalHeight),
      label: label || (Math.round(physicalWidth) + ' x ' + Math.round(physicalHeight))
    })
  }
  const maxAspectSize = physicalBounds.width && physicalBounds.height
    ? getMaxPhysicalSizeForAspect(physicalBounds, aspect)
    : null
  for (const preset of appWindowPresetSizesByAspect[aspect.id] || []) {
    if (preset[0] <= physicalBounds.width && preset[1] <= physicalBounds.height) addPreset(preset[0] + 'x' + preset[1], preset[0], preset[1])
  }
  if (maxAspectSize) {
    for (const scale of appWindowPresetScaleStops) {
      const size = normalizePhysicalSizeForAspect(maxAspectSize.width * scale, aspect, maxAspectSize)
      addPreset(size.width + 'x' + size.height, size.width, size.height)
    }
    addPreset(maxAspectSize.width + 'x' + maxAspectSize.height, maxAspectSize.width, maxAspectSize.height, 'Maximum ' + aspect.label + ' (' + maxAspectSize.width + ' x ' + maxAspectSize.height + ')')
  }
  presets.sort((a, b) => (a.physicalWidth * a.physicalHeight) - (b.physicalWidth * b.physicalHeight) || a.physicalWidth - b.physicalWidth)
  return { display, aspect: { id: aspect.id, label: aspect.label, width: aspect.width, height: aspect.height }, aspectRatios, presets }
}

function getAppWindowPreset(id, aspectId){
  const data = listAppWindowPresets(aspectId)
  const preset = data.presets.find(item => item.id === id)
  if (preset) return { preset, display: data.display }
  const match = String(id || '').match(/^(\d{3,5})x(\d{3,5})$/)
  if (!match) return { preset: null, display: data.display }
  const scaleFactor = data.display.scaleFactor || 1
  const physicalWidth = Math.round(Number(match[1]) || 0)
  const physicalHeight = Math.round(Number(match[2]) || 0)
  const physicalBounds = data.display.physicalBounds || data.display.bounds
  if (physicalWidth > physicalBounds.width || physicalHeight > physicalBounds.height) return { preset: null, display: data.display }
  const size = normalizeAppWindowSize({
    width: Math.round(physicalWidth / scaleFactor),
    height: Math.round(physicalHeight / scaleFactor)
  }, data.display.bounds)
  if (!size) return { preset: null, display: data.display }
  return {
    preset: {
      id: physicalWidth + 'x' + physicalHeight,
      width: size.width,
      height: size.height,
      physicalWidth,
      physicalHeight,
      label: physicalWidth + ' x ' + physicalHeight
    },
    display: data.display
  }
}

function getLargestAppWindowPreset(aspectId){
  const presets = listAppWindowPresets(aspectId).presets
  return presets.length ? presets[presets.length - 1] : null
}

function getFallbackAppWindowPreset(presets){
  if (!Array.isArray(presets) || !presets.length) return null
  return presets.find(preset => preset.id === '1920x1080') || presets.find(preset => preset.id === '1280x720') || presets[0]
}

function isUntrustedMinimumAppWindowPreset(aspectId){
  if (appWindowOptions?.windowPresetUserSelected === true) return false
  if (appWindowOptions?.windowPreset !== '1280x720') return false
  const data = listAppWindowPresets(aspectId || appWindowOptions?.windowAspectRatio)
  const first = data.presets?.[0]
  return !!first && first.id === '1280x720'
}

function getTrustedStoredAppWindowPresetId(aspectId){
  const presetId = appWindowOptions?.windowPreset
  if (!presetId) return ''
  if (isUntrustedMinimumAppWindowPreset(aspectId)) {
    runtimeLog('appWindowPresetIgnored', {
      preset: presetId,
      reason: 'untrusted-minimum',
      aspect: aspectId || appWindowOptions?.windowAspectRatio || '16:9'
    })
    return ''
  }
  const resolved = getAppWindowPreset(presetId, aspectId)
  const preset = resolved.preset
  if (!preset) return ''
  const bounds = appWindowOptions?.windowBounds
  const width = Math.round(Number(bounds?.width) || 0)
  const height = Math.round(Number(bounds?.height) || 0)
  if (width && height && (width !== preset.width || height !== preset.height)) {
    runtimeLog('appWindowPresetIgnored', {
      preset: presetId,
      presetSize: { width: preset.width, height: preset.height },
      savedBounds: { width, height },
      aspect: aspectId || appWindowOptions?.windowAspectRatio || '16:9'
    })
    return ''
  }
  return preset.id
}

function getAppWindowSizeForStoredPreset(aspectId){
  const presetId = getTrustedStoredAppWindowPresetId(aspectId)
  if (presetId) {
    const resolved = getAppWindowPreset(presetId, aspectId)
  if (resolved.preset) return resolved.preset
  }
  const savedPresetId = isUntrustedMinimumAppWindowPreset(aspectId) ? '' : getAppWindowPresetIdForSize(appWindowOptions?.windowBounds, aspectId)
  if (savedPresetId) {
    const resolved = getAppWindowPreset(savedPresetId, aspectId)
    if (resolved.preset) return resolved.preset
  }
  return getFallbackAppWindowPreset(listAppWindowPresets(aspectId).presets) || getLargestAppWindowPreset(aspectId)
}

function getCenteredAppWindowBounds(size, display){
  const displayBounds = display?.bounds || {}
  const width = Math.max(1, Math.round(Number(size?.width) || 1))
  const height = Math.max(1, Math.round(Number(size?.height) || 1))
  const x = Math.round((Number(displayBounds.x) || 0) + ((Number(displayBounds.width) || width) - width) / 2)
  const y = Math.round((Number(displayBounds.y) || 0) + ((Number(displayBounds.height) || height) - height) / 2)
  return { x, y, width, height }
}

function getAppWindowPresetIdForSize(size, aspectId){
  const width = Math.round(Number(size?.width) || 0)
  const height = Math.round(Number(size?.height) || 0)
  if (!width || !height) return ''
  const data = listAppWindowPresets(aspectId || appWindowOptions?.windowAspectRatio)
  const match = data.presets.find(preset => preset.width === width && preset.height === height)
  return match?.id || ''
}

function getFallbackAppWindowPresetId(presets){
  return getFallbackAppWindowPreset(presets)?.id || ''
}

function getValidAppWindowPresetId(id, presets){
  const requested = String(id || '')
  if (requested && Array.isArray(presets) && presets.some(preset => preset.id === requested)) return requested
  return ''
}

function persistAppWindowOptions(){
  if (typeof saveAppWindowOptions !== 'function') return
  try { saveAppWindowOptions() } catch (error) { runtimeLog('appWindowSaveFailed', error?.message || String(error)) }
}

function appWindowModeNeedsFrameless(mode){
  return normalizeAppWindowMode(mode) === 'borderless'
}

function appWindowFrameMatchesMode(mode){
  return attachedMainWindowFrameless === appWindowModeNeedsFrameless(mode)
}

function getSavedAppWindowBounds(){
  const bounds = appWindowOptions && appWindowOptions.windowBounds
  const width = Math.round(Number(bounds?.width) || 0)
  const height = Math.round(Number(bounds?.height) || 0)
  if (width < 320 || height < 240) return null
  return { width, height }
}

function hasAppWindowCreationState(){
  if (!appWindowOptions) return false
  return !!(
    normalizeAppWindowMode(appWindowOptions.windowMode)
    || appWindowOptions.fullscreen === false
    || appWindowOptions.windowBounds
    || appWindowOptions.windowPreset
    || appWindowOptions.windowAspectRatio
  )
}

function getInitialAppWindowBounds(){
  const size = getAppWindowSizeForStoredPreset(appWindowOptions?.windowAspectRatio)
  if (size) return size
  const saved = getSavedAppWindowBounds()
  if (!saved) return null
  const display = getPrimaryAppWindowDisplay()
  return normalizeAppWindowSize(saved, display.bounds)
}

function getMainWindowOptions(baseOptions){
  const options = Object.assign({}, baseOptions || {})
  if (!hasAppWindowCreationState()) {
    pendingMainWindowFrameless = options.frame === false
    return options
  }
  const mode = getStoredAppWindowMode()
  const bounds = getInitialAppWindowBounds()
  if (mode !== 'fullscreen') {
    options.fullscreen = false
    if (bounds) {
      options.width = bounds.width
      options.height = bounds.height
    }
  } else {
    options.fullscreen = true
  }
  if (mode === 'borderless') options.frame = false
  if (mode === 'borderless' || appWindowOptions.windowPreset || appWindowOptions.windowBounds || appWindowOptions.windowAspectRatio) {
    options.minWidth = appWindowMinDipSize.width
    options.minHeight = appWindowMinDipSize.height
  }
  pendingMainWindowFrameless = options.frame === false
  return options
}

function afterMainWindowCreated(){
  attachedMainWindowFrameless = pendingMainWindowFrameless === true
  pendingMainWindowFrameless = false
  return applyStoredAppWindowMode()
}

function scheduleAppWindowRecreate(reason){
  if (typeof recreateAppWindow !== 'function') return false
  if (appWindowRecreateTimer) return true
  runtimeLog('appWindowRecreate', reason || 'frame-change')
  appWindowRecreateTimer = setTimeout(()=>{
    appWindowRecreateTimer = null
    try { recreateAppWindow() } catch (error) { runtimeLog('appWindowRecreateFailed', error?.message || String(error)) }
  }, 20)
  return true
}

function getMainWindowBounds(){
  try {
    const bounds = win?.getBounds?.()
    if (!bounds) return null
    return {
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width: Math.round(Number(bounds.width) || 0),
      height: Math.round(Number(bounds.height) || 0)
    }
  } catch (error) {
    return null
  }
}

function saveMainWindowBounds(){
  if (!win || win.isDestroyed?.() || !appWindowOptions) return
  try {
    if (win.isFullScreen?.() || win.isMaximized?.()) return
    if (getStoredAppWindowMode() === 'borderless') return
    const bounds = getMainWindowBounds()
    if (!bounds || bounds.width < 320 || bounds.height < 240) return
    appWindowOptions.windowBounds = { width: bounds.width, height: bounds.height }
    appWindowOptions.windowPreset = getAppWindowPresetIdForSize(bounds)
    persistAppWindowOptions()
  } catch (error) {
    runtimeLog('appWindowBoundsSaveFailed', error?.message || String(error))
  }
}

function scheduleMainWindowBoundsSave(){
  if (appWindowResizeSaveTimer) clearTimeout(appWindowResizeSaveTimer)
  appWindowResizeSaveTimer = setTimeout(()=>{
    appWindowResizeSaveTimer = null
    saveMainWindowBounds()
  }, 250)
}

function restoreMainWindowBounds(){
  if (!win || win.isDestroyed?.() || !appWindowOptions) return false
  const size = getAppWindowSizeForStoredPreset(appWindowOptions?.windowAspectRatio)
  if (!size) return false
  try {
    win.setSize(size.width, size.height)
    try { win.center() } catch (error) {}
    return true
  } catch (error) {
    runtimeLog('appWindowBoundsRestoreFailed', error?.message || String(error))
    return false
  }
}

function normalizeAppWindowMode(mode){
  const value = String(mode || '').trim().toLowerCase()
  return value === 'fullscreen' || value === 'borderless' || value === 'window' ? value : ''
}

function getStoredAppWindowMode(){
  return normalizeAppWindowMode(appWindowOptions?.windowMode) || (appWindowOptions?.fullscreen === false ? 'window' : 'fullscreen')
}

function applyBorderlessMainWindow(){
  if (!win || win.isDestroyed?.()) return false
  const display = getPrimaryAppWindowDisplay()
  const size = getAppWindowSizeForStoredPreset(appWindowOptions?.windowAspectRatio)
  const bounds = getCenteredAppWindowBounds(size || display.bounds, display)
  try {
    if (win.isFullScreen?.()) win.setFullScreen(false)
    win.setResizable?.(false)
    win.setMovable?.(true)
    win.setBounds(bounds)
    try { win.setMenuBarVisibility(false) } catch (error) {}
    return true
  } catch (error) {
    runtimeLog('appWindowBorderlessApplyFailed', error?.message || String(error))
    return false
  }
}

function applyAppWindowMode(mode){
  if (!win || win.isDestroyed?.()) throw new Error('Main window is unavailable.')
  const nextMode = normalizeAppWindowMode(mode) || 'fullscreen'
  const currentMode = getStoredAppWindowMode()
  if (appWindowOptions && currentMode === 'window' && nextMode !== 'window' && !win.isFullScreen?.() && !win.isMaximized?.()) {
    const bounds = getMainWindowBounds()
    if (bounds && bounds.width >= 320 && bounds.height >= 240) {
      appWindowOptions.windowBounds = { width: bounds.width, height: bounds.height }
      appWindowOptions.windowPreset = getAppWindowPresetIdForSize(bounds)
    }
  }
  if (appWindowOptions) {
    appWindowOptions.windowMode = nextMode
    appWindowOptions.fullscreen = nextMode === 'fullscreen'
  }
  if (nextMode === 'fullscreen') {
    try { win.setResizable?.(true) } catch (error) {}
    try { win.setMovable?.(true) } catch (error) {}
    win.setFullScreen(true)
  } else if (nextMode === 'borderless') {
    if (appWindowFrameMatchesMode(nextMode)) applyBorderlessMainWindow()
    else scheduleAppWindowRecreate('borderless-frame')
  } else {
    if (!appWindowFrameMatchesMode(nextMode) && scheduleAppWindowRecreate('window-frame')) {
      persistAppWindowOptions()
      return getAppWindowState()
    }
    if (win.isFullScreen?.()) win.setFullScreen(false)
    try { win.setResizable?.(true) } catch (error) {}
    try { win.setMovable?.(true) } catch (error) {}
    restoreMainWindowBounds()
  }
  persistAppWindowOptions()
  return getAppWindowState()
}

function applyStoredAppWindowMode(){
  const mode = getStoredAppWindowMode()
  if (!appWindowFrameMatchesMode(mode) && mode !== 'fullscreen') return scheduleAppWindowRecreate('stored-frame')
  if (mode === 'borderless') return applyBorderlessMainWindow()
  if (mode === 'window') return restoreMainWindowBounds()
  return false
}

function toggleMainWindowFullscreen(){
  if (!win || win.isDestroyed?.()) return null
  if (win.isFullScreen?.()) {
    const nextMode = normalizeAppWindowMode(appWindowOptions?.previousWindowMode) || 'window'
    return applyAppWindowMode(nextMode === 'fullscreen' ? 'window' : nextMode)
  }
  if (appWindowOptions) appWindowOptions.previousWindowMode = getStoredAppWindowMode() === 'fullscreen' ? 'window' : getStoredAppWindowMode()
  return applyAppWindowMode('fullscreen')
}

function applyAppWindowPreset(id, aspectId, mode, options){
  if (!win || win.isDestroyed?.()) throw new Error('Main window is unavailable.')
  const resolved = getAppWindowPreset(id, aspectId)
  const preset = resolved.preset
  if (!preset) throw new Error('Window preset is unavailable on this display.')
  const nextMode = normalizeAppWindowMode(mode) || 'window'
  const display = resolved.display || getPrimaryAppWindowDisplay()
  const bounds = getCenteredAppWindowBounds(preset, display)
  if (appWindowOptions) {
    appWindowOptions.fullscreen = false
    appWindowOptions.windowMode = nextMode === 'borderless' ? 'borderless' : 'window'
    appWindowOptions.windowAspectRatio = String(aspectId || appWindowOptions.windowAspectRatio || '16:9')
    appWindowOptions.windowBounds = { width: preset.width, height: preset.height }
    appWindowOptions.windowPreset = preset.id
    if (options?.userInitiated === true) appWindowOptions.windowPresetUserSelected = true
    persistAppWindowOptions()
  }
  if (!appWindowFrameMatchesMode(nextMode) && scheduleAppWindowRecreate(nextMode === 'borderless' ? 'preset-borderless-frame' : 'preset-window-frame')) return getAppWindowState()
  if (win.isFullScreen?.()) win.setFullScreen(false)
  try { win.setResizable?.(nextMode !== 'borderless') } catch (error) {}
  try { win.setMovable?.(true) } catch (error) {}
  win.setBounds(bounds)
  try { win.setMenuBarVisibility(false) } catch (error) {}
  return getAppWindowState()
}

function setAppWindowFullscreen(fullscreen){
  if (!win || win.isDestroyed?.()) throw new Error('Main window is unavailable.')
  const enabled = fullscreen !== false
  if (appWindowOptions) {
    appWindowOptions.fullscreen = enabled
    appWindowOptions.windowMode = enabled ? 'fullscreen' : 'window'
    if (!enabled) {
      const bounds = getMainWindowBounds()
      if (bounds) appWindowOptions.windowBounds = { width: bounds.width, height: bounds.height }
    }
    persistAppWindowOptions()
  }
  win.setFullScreen(enabled)
  if (!enabled) restoreMainWindowBounds()
  return getAppWindowState()
}

function getAppWindowState(){
  const data = listAppWindowPresets(appWindowOptions?.windowAspectRatio)
  const bounds = getMainWindowBounds()
  const savedBounds = appWindowOptions?.windowBounds || null
  const fullscreen = !!win?.isFullScreen?.()
  const presetsByAspect = {}
  for (const aspect of data.aspectRatios || []) {
    presetsByAspect[aspect.id] = listAppWindowPresets(aspect.id).presets
  }
  const selectedPreset = getValidAppWindowPresetId(getTrustedStoredAppWindowPresetId(data.aspect?.id), data.presets)
    || getValidAppWindowPresetId(isUntrustedMinimumAppWindowPreset(data.aspect?.id) ? '' : getAppWindowPresetIdForSize(savedBounds || bounds, data.aspect?.id), data.presets)
    || getFallbackAppWindowPresetId(data.presets)
  if (appWindowOptions && selectedPreset && appWindowOptions.windowPreset !== selectedPreset) {
    const normalizedPreset = data.presets.find(preset => preset.id === selectedPreset)
    runtimeLog('appWindowPresetNormalized', {
      from: appWindowOptions.windowPreset || '',
      to: selectedPreset,
      aspect: appWindowOptions.windowAspectRatio || data.aspect?.id || '16:9'
    })
    appWindowOptions.windowPreset = selectedPreset
    if (normalizedPreset) appWindowOptions.windowBounds = { width: normalizedPreset.width, height: normalizedPreset.height }
    persistAppWindowOptions()
  }
  const state = {
    fullscreen,
    windowMode: fullscreen ? 'fullscreen' : getStoredAppWindowMode(),
    bounds,
    savedBounds,
    selectedAspectRatio: appWindowOptions?.windowAspectRatio || data.aspect?.id || '16:9',
    selectedPreset,
    display: data.display,
    aspectRatios: data.aspectRatios,
    aspect: data.aspect,
    presetsByAspect,
    presets: data.presets
  }
  try {
    const presetCounts = {}
    for (const aspectId in presetsByAspect) presetCounts[aspectId] = Array.isArray(presetsByAspect[aspectId]) ? presetsByAspect[aspectId].length : 0
    runtimeLog('appWindowPresetProbe', {
      mode: state.windowMode,
      aspect: state.selectedAspectRatio,
      selectedPreset: state.selectedPreset,
      display: {
        scaleFactor: data.display?.scaleFactor,
        bounds: data.display?.bounds,
        physicalBounds: data.display?.physicalBounds
      },
      presetCounts,
      currentPresets: data.presets.map(preset => preset.id)
    })
  } catch (error) {}
  return state
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
    if (action === 'capabilities') result = Object.assign({}, await libraryStore.capabilities(context), { apiVersion: LIBRARY_API_VERSION })
    else if (action === 'list') result = await libraryStore.list(context, request)
    else if (action === 'read') {
      const record = await libraryStore.read(context, request)
      result = {
        info: record.info,
        data: record.payloadType === 'utf8' ? record.payload.toString('utf8') : Uint8Array.from(record.payload)
      }
    } else if (action === 'pickImport') {
      const picked = await libraryStore.pickImport(context, request, async options=>{
        const parent = getModloaderDialogParent(event)
        return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)
      })
      result = picked.canceled ? picked : {
        canceled: false,
        fileName: picked.fileName,
        bytes: picked.bytes,
        data: request?.encoding === 'utf8' ? picked.data.toString('utf8') : Uint8Array.from(picked.data)
      }
    } else if (action === 'exportItem') {
      result = await libraryStore.exportItem(context, request, async options=>{
        const parent = getModloaderDialogParent(event)
        return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
      })
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

ipcMain.handle(`modloader:app-window`, async (event, payload)=>{
  if (!win || event?.sender !== win.webContents) return appWindowErrorEnvelope('PERMISSION_DENIED', 'Window control is unavailable.')
  try {
    const action = String(payload?.action || 'state')
    if (action === 'state' || action === 'list') return appWindowEnvelope(getAppWindowState())
    if (action === 'applyPreset') return appWindowEnvelope(applyAppWindowPreset(payload?.preset || payload?.id, payload?.aspectRatio, payload?.mode, { userInitiated: payload?.userInitiated === true }))
    if (action === 'setMode') return appWindowEnvelope(applyAppWindowMode(payload?.mode))
    if (action === 'setFullscreen') return appWindowEnvelope(setAppWindowFullscreen(payload?.fullscreen !== false))
    return appWindowErrorEnvelope('INVALID_PAYLOAD', 'Unknown window action.')
  } catch (error) {
    runtimeLog('appWindowRequestFailed', { action: payload?.action, message: error?.message || String(error) })
    return appWindowErrorEnvelope('IO_FAILED', error?.message || 'Window operation failed.')
  }
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
  // Temporary probe: optional module; no recording until explicitly requested.
  if (fs.existsSync(path.join(__dirname, 'diagnostics', 'clear-view-main.js'))) {
    try {
      if (!clearViewProbeService) clearViewProbeService = require('./diagnostics/clear-view-main.js').createService({
        electron: require('electron'), getWindow: () => win,
        outputRoot: path.join(__dirname, 'state', 'performance-probes'),
        isOtherBusy: () => !!periodicStallProbeService?.isBusy()
      })
      clearViewProbeService.attachWindow(win)
    } catch (error) { runtimeLog('clearViewProbeUnavailable', error.message) }
  }
  if (fs.existsSync(path.join(__dirname, 'diagnostics', 'periodic-stall-main.js'))) {
    try {
      if (!periodicStallProbeService) periodicStallProbeService = require('./diagnostics/periodic-stall-main.js').createService({
        electron: require('electron'), getWindow: () => win,
        outputRoot: path.join(__dirname, 'state', 'periodic-stall-probes'),
        isOtherBusy: () => !!clearViewProbeService?.isBusy()
      })
      periodicStallProbeService.attachWindow(win)
    } catch (error) { runtimeLog('periodicStallProbeUnavailable', error.message) }
  }
  configureSnapshotStore(options)
  configureLibraryStore(options)
  if (win?.on) {
    win.on('enter-full-screen', ()=>{
      if (appWindowOptions) {
        appWindowOptions.fullscreen = true
        appWindowOptions.windowMode = 'fullscreen'
        persistAppWindowOptions()
      }
    })
    win.on('leave-full-screen', ()=>{
      if (appWindowOptions) {
        appWindowOptions.fullscreen = false
        appWindowOptions.windowMode = normalizeAppWindowMode(appWindowOptions.previousWindowMode) || 'window'
        if (!appWindowFrameMatchesMode(appWindowOptions.windowMode)) scheduleAppWindowRecreate('leave-fullscreen-frame')
        else if (appWindowOptions.windowMode === 'borderless') applyBorderlessMainWindow()
        else restoreMainWindowBounds()
        const bounds = getMainWindowBounds()
        if (bounds) appWindowOptions.windowPreset = getAppWindowPresetIdForSize(bounds)
        persistAppWindowOptions()
      }
    })
    win.on('resize', scheduleMainWindowBoundsSave)
    win.on('move', scheduleMainWindowBoundsSave)
  }
  const sender = win?.webContents
  if (sender?.once) sender.once('destroyed', ()=>{
    clearTweaksSlotStore(sender)
    clearSnapshotContext(sender)
    clearLibrarySubscriptions(sender)
  })
}

function setMainWindowFrameless(frameless){
  attachedMainWindowFrameless = frameless === true
}

function configureMainWindowHost(options){
  appWindowOptions = options?.appOptions || null
  saveAppWindowOptions = typeof options?.saveAppOptions === 'function' ? options.saveAppOptions : null
  recreateAppWindow = typeof options?.recreateWindow === 'function' ? options.recreateWindow : null
  if (appWindowOptions && !normalizeAppWindowMode(appWindowOptions.windowMode)) {
    appWindowOptions.windowMode = appWindowOptions.fullscreen === false ? 'window' : 'fullscreen'
  }
}

function configureAppWindowOptions(options, saveOptions, recreateWindow){
  configureMainWindowHost({ appOptions: options, saveAppOptions: saveOptions, recreateWindow })
}

let clearViewProbeService = null
let periodicStallProbeService = null
let tweaksSlotStore = null
const tweaksSlotStoreProtocol = 'tweaks-save-policy-v2'
let savePolicyCloud = null
function configureSaveCloud(cloud) { savePolicyCloud = cloud }
function savePolicyBackend() { return require('../mods/Cattail_TweaksQuality_Tweaks/scripts/main/auto-save-policy-store.js') }
function hasSaveOverlay(cloud) { return cloud?.fileExists?.('cattail-save-policy-v2.json') === true }
function readSaveOverlay(cloud, base) { return hasSaveOverlay(cloud) ? savePolicyBackend().readOverlay(cloud, base) : base }
function clearTweaksSlotStore(sender) { tweaksSlotStore?.clear(sender) }
function isMainSaveSender(event) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents &&
    (!event.senderFrame || event.senderFrame === event.sender.mainFrame)
}
// No arbitrary main-process Mod entries: this private bridge loads only Tweaks'
// fixed save backend, and only after its enabled renderer asks to start a session.
ipcMain.handle('modloader:tweaks-slot-store', (event, request) => {
  const unavailable = { protocol: tweaksSlotStoreProtocol, ok: false }
  if (!isMainSaveSender(event) || request?.protocol !== tweaksSlotStoreProtocol) return unavailable
  if (request.action === 'begin') {
    if (request.gameVersion !== '1.3') return unavailable
    const id = 'Cattail_TweaksQuality_Tweaks', modsDir = path.resolve(__dirname, '..', 'mods')
    const enabled = normalizeEnabledEntries(readJsonFile(path.join(modsDir, 'enabled.json'), { mods: [] }))
    if (!enabled.some(entry => entry.path === id)) return unavailable
    const manifest = readJsonFile(path.join(modsDir, id, 'mod.json'), null)
    if (manifest?.id !== id || !manifest.entries?.includes('scripts/auto-save-stutter-fix.js')) return unavailable
    try {
      if (!tweaksSlotStore) tweaksSlotStore = savePolicyBackend().createStore({ measure: measureDiagnostic })
      return tweaksSlotStore.begin(event.sender, request.owner, savePolicyCloud)
    } catch (error) { runtimeLog('tweaksSlotStoreUnavailable', error.message); return unavailable }
  }
  return unavailable
})
function dispatchSaveStore(event, slots, write) {
  if (typeof slots?.protocol === 'string' && slots.protocol.startsWith('tweaks-') && slots.protocol !== tweaksSlotStoreProtocol) return { ok: false, reason: 'protocol' }
  if (slots?.protocol === tweaksSlotStoreProtocol && (!isMainSaveSender(event) || !tweaksSlotStore)) {
    return { protocol: tweaksSlotStoreProtocol, ok: false, reason: 'resync' }
  }
  return tweaksSlotStore ? tweaksSlotStore.store(event.sender, slots, write, savePolicyCloud) : write(slots)
}
// The optional temporary collector owns all timing; original calls always run.
function measureDiagnostic(name, run) {
  return periodicStallProbeService ? periodicStallProbeService.measure(name, run) : run()
}

module.exports = {
  configureSaveCloud,
  hasSaveOverlay,
  readSaveOverlay,
  dispatchSaveStore,
  clearTweaksSlotStore,
  measureDiagnostic,
  attachWindow,
  getMainWindowOptions,
  afterMainWindowCreated,
  setMainWindowFrameless,
  clearSnapshotContext,
  clearLibrarySubscriptions,
  configureMainWindowHost,
  configureAppWindowOptions,
  collectLibraryDeclarations,
  applyStoredAppWindowMode,
  restoreMainWindowBounds,
  toggleMainWindowFullscreen,
  runtimeLog
}
