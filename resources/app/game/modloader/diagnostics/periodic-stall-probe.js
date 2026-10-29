'use strict'

// Temporary, opt-in observation. No save payloads, per-entity patches or gameplay changes.
const CHANNEL = 'modloader:periodic-stall-probe'
const METHODS = ['saveLoop', 'backupLoop', 'saveGame', 'assembleSave', 'assemblePermanents', 'writeToSlot',
  'updateLoop', 'updateCycle', 'updateEntities', 'updateResourceInteractions', 'updateVFX', 'updateAnalytics',
  'updateMemories', 'updateHollowEvents', 'updateTranslation', 'updateMusic',
  'renderloop', 'renderEntities', 'renderEntitiesAbstract', 'renderGrid', 'renderResources',
  'renderDarkResources', 'renderVFX', 'renderCursor', 'renderConductors', 'renderChasmVFX']
const SAVE_METHODS = new Set(METHODS.slice(0, 6))
function ring(limit) {
  const data = []; let next = 0, dropped = 0
  return {
    push(value) { if (data.length < limit) data.push(value); else { data[next] = value; next = (next + 1) % limit; dropped++ } },
    values() { return dropped ? data.slice(next).concat(data.slice(0, next)) : data.slice() },
    get dropped() { return dropped }
  }
}
function distribution(values) {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b)
  const p = q => a.length ? a[Math.max(0, Math.ceil(a.length * q) - 1)] : null
  return { samples: a.length, p50Ms: p(.5), p95Ms: p(.95), p99Ms: p(.99), maxMs: a.length ? a[a.length - 1] : null }
}
function createRecorder(options) {
  const { game } = options, now = options.now
  const frames = ring(30000), events = ring(10000), rows = new Map(), patches = [], listeners = []
  const seen = new WeakMap(), warnings = [], pending = new Map(), stack = []
  let active = false, used = false, started = 0, stopped = 0, lastFrame = null, lastFlags = null, sequence = 0
  const warn = message => { if (warnings.length < 20 && !warnings.includes(message)) warnings.push(message) }
  function record(name, began, elapsed, kind = 'sync', always = false, self = elapsed) {
    if (!active) return
    const row = rows.get(name) || { name, kind, calls: 0, totalMs: 0, selfMeasuredMs: 0, maxMs: 0, samples: ring(2048) }
    row.calls++; row.totalMs += elapsed; row.selfMeasuredMs += self; row.maxMs = Math.max(row.maxMs, elapsed); row.samples.push(elapsed); rows.set(name, row)
    if (always || elapsed >= 8) events.push({ name, kind, atMs: began - started, durationMs: elapsed, selfMeasuredMs: self })
  }
  function observePromise(result, name, began) {
    if (!(result instanceof (options.Promise || Promise))) return
    const id = ++sequence; pending.set(id, { name, atMs: began - started })
    const settled = failed => {
      if (!active) return
      try { record(name, began, Math.max(0, now() - began), 'async-total', true); events.push({ name: name + '.result', atMs: now() - started, failed }); pending.delete(id) } catch (_) {}
    }
    // Observe the original promise; return it unchanged. Only already-awaited IPC is observed.
    result.then(() => settled(false), () => settled(true))
  }
  function patch(target, key, label, settings = {}) {
    if (!target || typeof target[key] !== 'function') return
    let keys = seen.get(target); if (!keys) { keys = new Set(); seen.set(target, keys) }
    if (keys.has(key)) return
    const original = target[key], descriptor = Object.getOwnPropertyDescriptor(target, key)
    const wrapped = function (...args) {
      if (!active || (settings.filter && !settings.filter(args))) return original.apply(this, args)
      const began = now(), node = { children: 0 }, parent = stack[stack.length - 1]
      const name = typeof label === 'function' ? label(args) : label
      const isFrame = name === 'renderloop'
      let flags = null
      if (isFrame) { try { flags = options.flags?.() || {} } catch (_) { flags = { unavailable: true } } }
      stack.push(node)
      let result, failed = false
      try { result = original.apply(this, args); return result }
      catch (error) { failed = true; throw error }
      finally {
        const elapsed = Math.max(0, now() - began); stack.pop(); if (parent) parent.children += elapsed
        try {
          record(name, began, elapsed, 'sync', settings.always, Math.max(0, elapsed - node.children))
          if (isFrame) {
            const comparable = lastFlags && !flags.hidden && flags.focused && !flags.menu && !flags.halt && !flags.settling && !flags.resizing && !failed &&
              !lastFlags.hidden && lastFlags.focused && !lastFlags.menu && !lastFlags.halt && !lastFlags.settling && !lastFlags.resizing &&
              ['width', 'height', 'zoom', 'cameraX', 'cameraY', 'plane', 'alt', 'item', 'erase', 'relocate'].every(key => flags[key] === lastFlags[key])
            frames.push({ atMs: began - started, gapMs: lastFrame === null ? null : began - lastFrame, durationMs: elapsed, comparable: !!comparable, flags })
            lastFrame = began; lastFlags = flags
          }
          if (!failed) { settings.after?.(result, args, began); if (settings.promise) observePromise(result, name + '.settled', began) }
          if (settings.always) options.marker?.(name, began, elapsed)
        } catch (_) { warn('A timing sample or optional observer could not be installed') }
      }
    }
    try { Object.defineProperty(target, key, { configurable: true, writable: true, enumerable: descriptor?.enumerable || false, value: wrapped }); patches.push({ target, key, descriptor, wrapped }); keys.add(key) }
    catch (_) { warn('Unavailable timing point: ' + String(label)) }
  }
  function observeTransaction(tx, args, began) {
    if (tx?.mode !== 'readwrite' || !tx.objectStoreNames?.contains?.('charps_memory_slots')) return
    const id = ++sequence; pending.set(id, { name: 'local.transaction', atMs: began - started })
    const ended = event => {
      for (const type of ['complete', 'abort', 'error']) tx.removeEventListener(type, ended)
      if (active) { record('local.transaction.settled', began, Math.max(0, now() - began), 'async-total', true); events.push({ name: 'local.transaction.result', atMs: now() - started, failed: event.type !== 'complete' }); pending.delete(id) }
    }
    for (const type of ['complete', 'abort', 'error']) { tx.addEventListener(type, ended); listeners.push(() => tx.removeEventListener(type, ended)) }
    patch(tx, 'objectStore', 'local.objectStore', { after(store, args) { if (args[0] === 'charps_memory_slots') patch(store, 'put', 'local.put', { always: true }) } })
  }
  return {
    start() {
      if (used) throw new Error('Recorder already used')
      used = true; active = true; started = now()
      for (const name of METHODS) patch(game, name, name, { always: SAVE_METHODS.has(name) })
      patch(game.spaceport, 'invoke', () => 'ipc.store.invoke', { filter: args => args[0] === 'store', always: true, promise: true })
      patch(game.spaceport, 'send', args => 'ipc.' + args[0] + '.send', { filter: args => ['store', 'updateStat'].includes(args[0]), always: true })
      patch(game.localDatabase, 'transaction', 'local.transaction.open', { always: true, after: observeTransaction })
      if (!patches.some(p => p.target === game && p.key === 'renderloop')) { this.stop(); throw new Error('游戏绘制入口不可测量。') }
    },
    longTask(startEpochMs, durationMs) { if (active) events.push({ name: 'renderer.longtask', kind: 'longtask', atMs: startEpochMs - started, durationMs }) },
    stop() {
      if (!active) return
      active = false; stopped = now()
      for (const remove of listeners.splice(0)) { try { remove() } catch (_) {} }
      for (const p of patches.splice(0).reverse()) {
        try { if (p.target[p.key] !== p.wrapped) { warn('Later wrapper retained; this observer is inert until reload: ' + p.key); continue }
          if (p.descriptor) Object.defineProperty(p.target, p.key, p.descriptor); else delete p.target[p.key]
        } catch (_) { warn('Unable to restore timing point: ' + p.key) }
      }
    },
    report() {
      if (active) throw new Error('Stop before export')
      const captured = frames.values(), stable = captured.filter(f => f.comparable)
      return { schemaVersion: 1, protocol: 'periodic-stall-v1', startedEpochMs: started, durationMs: stopped - started,
        frames: captured, events: events.values(), methods: [...rows.values()].map(({ samples, ...row }) => ({ ...row, distribution: distribution(samples.values()), droppedSamples: samples.dropped })),
        frameInterval: distribution(stable.map(f => f.gapMs)), renderCall: distribution(stable.map(f => f.durationMs)),
        pendingAtStop: [...pending.values()], dropped: { frames: frames.dropped, events: events.dropped }, warnings,
        limitations: [ 'Frame gaps are render callback intervals, not display FPS or GPU hardware time.',
          'sync durations cover synchronous entry only; async functions return at their first suspension.',
          'async-total includes awaiting, IPC queues and scheduling; long waits do not prove a blocked renderer.',
          'Inclusive methods and parallel local/cloud waits overlap; do not add their durations.',
          'No save values, chat, entity contents, screenshots or pixel readback are exported.',
          'Distributions use bounded samples; aggregate call totals and maxima cover the full capture. Drops are explicit.',
          'Comparable frames exclude focus loss, hidden/menu/halt, resize, settling and changed camera/view controls.' ] }
    }
  }
}

function createClient(options) {
  const { window: win, document: doc, ipc } = options
  const now = () => win.performance.timeOrigin + win.performance.now()
  let phase = 'idle', timer = null, countdown = null, session = null, recorder = null, observer = null, report = null, ending = null, cancelled = false, resizedAt = -Infinity, started = 0, tracing = false
  const change = () => options.onChange?.()
  const notice = message => { options.notify?.(message); change() }
  const invoke = async (action, payload = {}) => { const r = await ipc.invoke(CHANNEL, { action, ...payload }); if (!r?.ok) throw new Error(r?.error || '探针通信失败，请完整重启游戏。'); return r.result }
  const resize = () => { resizedAt = now() }
  const mark = label => { try { const name = 'SFStall:' + label; win.performance.mark(name); win.performance.clearMarks(name) } catch (_) {} }
  function clean() {
    if (tracing) { mark('capture-stop'); tracing = false }
    win.clearTimeout(timer); win.clearTimeout(countdown); timer = countdown = null
    observer?.disconnect(); observer = null; recorder?.stop(); win.removeEventListener('resize', resize)
  }
  function finish(reason = 'manual') {
    if (ending) return ending
    if (phase === 'idle') return Promise.resolve()
    if (phase === 'arming') { clean(); phase = 'idle'; notice('探针已关闭。'); return Promise.resolve() }
    if (phase === 'starting') { cancelled = true; notice('正在取消探针启动…'); return Promise.resolve() }
    phase = 'stopping'; clean(); change()
    ending = (async () => {
      try {
        if (!report) report = { ...recorder.report(), stopReason: reason }
        const result = await invoke('finish', { id: session.id, report })
        phase = 'idle'; session = null; report = null; notice('探针已关闭，记录已保存：' + result.directory)
        return result
      } catch (error) { phase = 'export-failed'; notice('探针已停止，导出失败，可重试：' + error.message); throw error }
      finally { ending = null; change() }
    })()
    return ending
  }
  ipc.on(CHANNEL, (_event, payload) => { if (payload?.action === 'stop' && payload.id === session?.id) void finish('main-deadline').catch(() => {}) })
  win.addEventListener('pagehide', () => { clean(); if (session) ipc.send(CHANNEL + ':abandon', { id: session.id }) })
  return {
    status: () => ({ phase }), finish,
    async start(settings = {}) {
      if (phase !== 'idle') throw new Error('请先关闭当前探针或重试导出。')
      const game = options.getGame(); if (!game?.canvas) throw new Error('请先进入游戏场景。')
      if (options.isOtherBusy?.()) throw new Error('请先结束清晰视图探针。')
      if (win.cattailResourceSourceProfiler?.isEnabled?.()) throw new Error('请先关闭资源分析器。')
      const deep = settings.deep === true, seconds = deep ? 20 : settings.seconds === 300 ? 300 : 120
      phase = 'arming'; session = null; report = null; recorder = null; cancelled = false; change(); options.closeMenu?.()
      notice(`3 秒后开始${deep ? '深入' : '轻量'}记录，${seconds} 秒后自动关闭；保持普通视图观察卡顿。`)
      countdown = win.setTimeout(async () => {
        countdown = null; phase = 'starting'; change()
        try {
          session = await invoke('start', { seconds, deep, metadata: options.metadata?.() })
          if (cancelled || options.getGame() !== game) throw new Error('启动已取消或游戏场景已更换。')
          const before = now(), clock = await invoke('clock', { id: session.id }), after = now()
          if (cancelled) throw new Error('启动已取消。')
          started = now(); resizedAt = -Infinity
          recorder = createRecorder({ game, now, Promise: win.Promise,
            flags: () => ({ hidden: !!doc.hidden, focused: !!doc.hasFocus(), menu: !!options.isMenuOpen?.(), halt: !!game.halt,
              settling: now() - started < 3000, resizing: now() - resizedAt < 500, width: win.innerWidth, height: win.innerHeight,
              zoom: game.zoom, cameraX: game.translation?.[0], cameraY: game.translation?.[1], plane: game.plane,
              alt: !!game.altActive, item: !!game.itemInHand, erase: game.interactionMode === 'erase', relocate: game.interactionMode === 'relocate' }),
            marker: deep ? (name => { const label = 'SFStall:' + name; win.performance.mark(label); win.performance.clearMarks(label) }) : null })
          recorder.start(); tracing = deep; if (tracing) mark('capture-start'); win.addEventListener('resize', resize)
          if (win.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
            observer = new win.PerformanceObserver(list => { for (const e of list.getEntries()) recorder?.longTask(win.performance.timeOrigin + e.startTime, e.duration) }); observer.observe({ type: 'longtask' })
          }
          const baseReport = recorder.report.bind(recorder)
          recorder.report = () => ({ ...baseReport(), timeSync: { beforeEpochMs: before, afterEpochMs: after, mainEpochMs: clock.epochMs, uncertaintyMs: (after - before) / 2 } })
          phase = 'recording'; notice(`正在记录；${seconds} 秒后自动关闭并导出。`)
          timer = win.setTimeout(() => { void finish('duration').catch(() => {}) }, seconds * 1000)
        } catch (error) {
          clean(); if (session) { try { await invoke('abort', { id: session.id }) } catch (_) {} }
          session = null; phase = 'idle'; notice('探针未启动：' + error.message)
        }
      }, 3000)
    },
    openFolder: () => invoke('open-folder')
  }
}
module.exports = { CHANNEL, METHODS, createRecorder, createClient, ring, distribution }
