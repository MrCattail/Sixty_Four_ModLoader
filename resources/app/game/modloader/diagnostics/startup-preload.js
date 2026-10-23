'use strict'

const CHANNEL = 'modloader:startup-probe'
const METHOD_NAMES = ['prepareSavedGameData', 'loadScripts', 'loadScript', 'loadStyle', 'preloadImages', 'getAbsolutes', 'initAlfa', 'initResources', 'initScreenSize', 'loadSave', 'prepopulate', 'initOrbifolds', 'renderloop', 'renderEntities', 'renderEntitiesAbstract', 'renderGrid', 'renderResources', 'renderVFX', 'renderChasmVFX']
const DRAW = new Set(METHOD_NAMES.filter(name => name.startsWith('render')))
function relativeSource(value) {
  const text = String(value || '').replace(/\\/g, '/').split(/[?#]/)[0]
  const game = text.lastIndexOf('/game/')
  if (game >= 0) return text.slice(game + 6, game + 326)
  if (/^(scripts|mods|modloader|img|font)\//.test(text)) return text.slice(0, 320)
  return text.includes('://') || text.startsWith('data:') ? 'external-or-inline' : text.split('/').slice(-2).join('/').slice(0, 160)
}
function errorPosition(error) {
  // Error messages can contain JSON/save/config fragments. Retain only type
  // and source frames, never message, cause, arguments or arbitrary properties.
  let name = 'Error', frames = []
  try {
    if (/^[A-Za-z]+Error$/.test(error?.name || '')) name = error.name
    frames = String(error?.stack || '').split('\n').slice(1, 7).filter(line => /:\d+:\d+/.test(line)).map(line => {
      const match = line.match(/((?:file:\/\/\/|[A-Za-z]:[\\/])[^()]+:\d+:\d+)/)
      return match ? relativeSource(match[1]) : line.trim().replace(/https?:\/\/\S+/g, 'external').slice(0, 200)
    })
  } catch (_) {}
  return { name, source: frames }
}

function createClient(options) {
  const win = options.window, ipc = options.ipcRenderer, Module = options.Module
  const timers = options.timers || Object.fromEntries(['setInterval','clearInterval','setTimeout','clearTimeout'].map(name => [name, win[name].bind(win)]))
  const now = options.now || Date.now, started = now(), deadline = started + (options.milliseconds || 60000)
  const prefix = started.toString(36) + '-'
  let active = true, sequence = 0, game = null, rafId = null, interval, timeout, lastSample = 0
  let raf = 0, frames = 0, completed = 0, failed = 0, errorCount = 0, eventCount = 0
  const cleanup = [], images = new Set(), observed = new WeakSet()
  function send(message) { if (active) { try { ipc.send(CHANNEL, message) } catch (_) {} } }
  function event(row) { if (eventCount++ < 4000) send({ type: 'event', event: row }) }
  function mark(name, detail) { event({ kind: 'mark', name, detail }) }
  function begin(name, detail) {
    if (!active) return null
    const token = { id: prefix + ++sequence, name, start: now() }
    event({ kind: 'begin', id: token.id, name, detail }); return token
  }
  function end(token, error, thenable) {
    if (active && token) event({ kind: 'end', id: token.id, name: token.name, outcome: error ? 'error' : 'ok', durationMs: now() - token.start, error: error ? errorPosition(error) : undefined, detail: thenable ? { thenable: true } : undefined })
  }
  function failure(name, error) { if (errorCount++ < 12) event({ kind: 'error', name, error: errorPosition(error) }) }
  function observe(name, run, detail) {
    if (!active) return run()
    const token = begin(name, detail)
    try {
      const result = run()
      const PromiseType = win.Promise || Promise
      if (result instanceof PromiseType || result instanceof Promise) {
        // Observe settlement but return the very same Promise. No new await is
        // introduced into synchronous Loader init/hooks or native callers.
        result.then(() => end(token, null, true), error => end(token, error, true))
      } else end(token)
      return result
    } catch (error) { end(token, error); throw error }
  }
  function on(target, name, handler, capture = false) {
    if (!target?.addEventListener) return
    target.addEventListener(name, handler, capture)
    cleanup.push(() => target.removeEventListener(name, handler, capture))
  }
  function attachGame(value) {
    if (!active || !value || observed.has(value)) return
    observed.add(value); game = value; mark('engine-context')
    for (const name of METHOD_NAMES) {
      const own = Object.getOwnPropertyDescriptor(value, name)
      if (own && (typeof own.value !== 'function' || !own.configurable)) continue
      if (!own && typeof Object.getPrototypeOf(value)?.[name] !== 'function') continue
      function observedMethod(...args) {
        const receiver = this
        // Prototype patches installed after this observation remain in force.
        const current = own ? own.value : Reflect.get(Object.getPrototypeOf(value), name, receiver)
        const run = () => Reflect.apply(current, receiver, args)
        if (!active || now() >= deadline) return run()
        if (name === 'renderloop') {
          frames++
          try { const result = frames <= 3 ? observe('game:' + name, run) : run(); completed++; return result }
          catch (error) { failed++; if (frames > 3) failure('game:renderloop', error); throw error }
        }
        if (DRAW.has(name) && frames > 3) return run()
        const detail = name === 'loadScript' || name === 'loadStyle' ? { source: relativeSource(args[0]) } : undefined
        return observe('game:' + name, run, detail)
      }
      try {
        Object.defineProperty(value, name, { configurable: true, writable: true, enumerable: own?.enumerable || false, value: observedMethod })
        cleanup.push(() => { if (value[name] === observedMethod) { if (own) Object.defineProperty(value, name, own); else delete value[name] } })
      } catch (_) { mark('method-observer-unavailable', { name }) }
    }
  }
  function nodeState(element) {
    if (!element) return null
    const style = win.getComputedStyle(element), rect = element.getBoundingClientRect()
    return { tag: element.tagName, class: String(element.className || '').slice(0, 160), display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex, transform: style.transform,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } }
  }
  function sample() {
    if (!active) return
    const sampleSpan = begin('probe:visible-output-sample')
    try {
      const doc = win.document
      if (!doc?.querySelectorAll || !win.getComputedStyle) return
      const layers = []
      for (const canvas of [...doc.querySelectorAll('canvas')].slice(0, 20)) {
        const layer = nodeState(canvas)
        layer.width = canvas.width; layer.height = canvas.height; layer.ancestors = []
        let parent = canvas.parentElement, visible = layer.rect.w > 0 && layer.rect.h > 0
        for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) layer.ancestors.push(nodeState(parent))
        visible = visible && [layer, ...layer.ancestors].every(e => e.display !== 'none' && e.visibility !== 'hidden' && Number(e.opacity) > 0)
        // Auxiliary icon canvases must not satisfy the real scene-pixel check.
        if (completed > 0 && visible && /(^|\s)canvas(\s|$)|modloader-render-layer/.test(layer.class)) {
          try {
            const readback = begin('probe:canvas-readback', { layer: layer.class })
            try {
            const scratch = doc.createElement('canvas'); scratch.width = 64; scratch.height = 40
            const ctx = scratch.getContext('2d'); ctx.drawImage(canvas, 0, 0, 64, 40)
            const data = ctx.getImageData(0, 0, 64, 40).data, colors = new Set(); let nonwhite = 0
            for (let i = 0; i < data.length; i += 4) { if (data[i + 3] && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) nonwhite++; colors.add([data[i], data[i + 1], data[i + 2], data[i + 3]].join(',')) }
            layer.sample = { nonwhite, colors: colors.size }
            } catch (error) { end(readback, error); throw error }
            end(readback)
          } catch (_) { layer.sample = { status: 'unavailable' } }
        }
        layers.push(layer)
      }
      send({ type: 'snapshot', detail: { width: win.innerWidth, height: win.innerHeight, hidden: !!doc.hidden, layers,
        nodes: [doc.body, doc.querySelector('.splash'), doc.querySelector('.store'), doc.querySelector('#modloader-render-stack')].filter(Boolean).map(nodeState),
        pending: [...images].slice(0, 12).map(image => ({ name: relativeSource(image.currentSrc || image.src || 'await-image-source') })) } })
    } catch (error) { failure('visible-output-sample', error) }
    finally { end(sampleSpan) }
  }
  function tick() {
    if (!active) return
    send({ type: 'heartbeat', detail: { raf, frames, completed, failed, clock: !!game?.clock, ready: !!win.ModLoader?.state?.snapshotContextReady, api: win.ModLoader?.render?.isEnabled?.() } })
    if (now() - lastSample >= 5000) { lastSample = now(); sample() }
  }
  function stop() {
    if (!active) return
    mark('renderer-observers-stopped'); active = false
    timers.clearInterval(interval); timers.clearTimeout(timeout)
    if (rafId !== null) win.cancelAnimationFrame?.(rafId)
    for (const dispose of cleanup.splice(0).reverse()) { try { dispose() } catch (_) {} }
    images.clear(); game = null
  }
  const stopMessage = (_event, message) => { if (message?.type === 'stop') stop() }
  ipc.on?.(CHANNEL, stopMessage); cleanup.push(() => ipc.removeListener?.(CHANNEL, stopMessage))
  on(win, 'error', event => {
    if (event.error) failure('window-error', event.error)
    else event && mark('resource-error', { source: relativeSource(event.filename || event.target?.src || event.target?.href) })
  }, true)
  on(win, 'unhandledrejection', event => failure('unhandled-rejection', event.reason))
  on(win.document, 'DOMContentLoaded', () => mark('page-dom-ready'))
  on(win, 'load', () => { mark('page-load'); sample() })
  if (Module?._load) {
    const originalLoad = Module._load
    function observedLoad(request, ...args) {
      if (!active || request !== '@playsaurus-inc/sdk') return originalLoad.call(this, request, ...args)
      const sdk = observe('sdk:require', () => originalLoad.call(this, request, ...args))
      const descriptor = Object.getOwnPropertyDescriptor(sdk || {}, 'initialize')
      if (descriptor?.writable && typeof descriptor.value === 'function') {
        const original = descriptor.value
        function initialize(...values) { return observe('sdk:initialize', () => original.apply(this, values)) }
        Object.defineProperty(sdk, 'initialize', { ...descriptor, value: initialize })
        cleanup.push(() => { if (sdk.initialize === initialize) Object.defineProperty(sdk, 'initialize', descriptor) })
      }
      return sdk
    }
    Module._load = observedLoad; cleanup.push(() => { if (Module._load === observedLoad) Module._load = originalLoad })
  }
  if (typeof win.Image === 'function') {
    const OriginalImage = win.Image
    const observedImage = new Proxy(OriginalImage, { construct(target, args, newTarget) {
      const image = Reflect.construct(target, args, newTarget); if (!active || cleanup.length >= 4000) return image; images.add(image)
      function done(event) { images.delete(image); mark(event.type === 'error' ? 'image-error' : 'image-loaded', { source: relativeSource(image.currentSrc || image.src) }); image.removeEventListener('load', done); image.removeEventListener('error', done) }
      image.addEventListener('load', done); image.addEventListener('error', done)
      cleanup.push(() => { image.removeEventListener('load', done); image.removeEventListener('error', done) })
      return image
    } })
    win.Image = observedImage; cleanup.push(() => { if (win.Image === observedImage) win.Image = OriginalImage })
  }
  function countFrame() { if (active) { raf++; rafId = win.requestAnimationFrame(countFrame) } }
  if (win.requestAnimationFrame) rafId = win.requestAnimationFrame(countFrame)
  interval = timers.setInterval(tick, 1000)
  timeout = timers.setTimeout(stop, options.milliseconds || 60000)
  mark('preload-enter')
  return Object.freeze({ mark, begin, end, observe, attachGame, stop, sample, status: () => ({ active, raf, frames, completed, failed, pendingImages: images.size }) })
}

module.exports = { createClient, relativeSource, errorPosition, CHANNEL }
if (process.versions.electron && typeof window !== 'undefined') {
  try {
    const client = createClient({ window, ipcRenderer: require('electron').ipcRenderer, Module: require('module') })
    Object.defineProperty(window, '__modloaderStartupProbe', { configurable: true, value: client })
  } catch (error) { try { require('electron').ipcRenderer.send(CHANNEL, {type:'event',event:{kind:'error',name:'probe-install-error',error:errorPosition(error)}}) } catch (_) {} }
}
