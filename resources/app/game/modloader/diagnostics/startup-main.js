'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const CHANNEL = 'modloader:startup-probe'
const LIMITS = Object.freeze({ milliseconds: 60000, events: 4000, jsonBytes: 2 * 1024 * 1024, screenshotBytes: 8 * 1024 * 1024, captureMilliseconds: 5000 })

// This is deliberately not a general renderer-to-file API. Unknown fields,
// application payloads and error messages are never copied into the report.
function clean(value, depth = 0) {
  if (depth > 6) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value.slice(0, 320)
  if (Array.isArray(value)) return value.slice(0, 12).map(v => clean(v, depth + 1))
  if (!value || typeof value !== 'object') return null
  const out = {}
  const allowed = new Set(['kind', 'id', 'name', 'atMs', 'durationMs', 'outcome', 'detail', 'source', 'error', 'frames', 'raf', 'completed', 'failed', 'ready', 'clock', 'api', 'width', 'height', 'hidden', 'nodes', 'layers', 'tag', 'class', 'display', 'visibility', 'opacity', 'zIndex', 'transform', 'rect', 'x', 'y', 'w', 'h', 'ancestors', 'nonwhite', 'colors', 'sample', 'layer', 'page', 'reason', 'code', 'type', 'status', 'pending', 'count', 'thenable'])
  for (const key of Object.keys(value).slice(0, 40)) if (allowed.has(key)) out[key] = clean(value[key], depth + 1)
  return out
}

function createService(options) {
  if (!options?.enabled) return null
  const { app, ipcMain } = options.electron
  const timers = options.timers || { setInterval, clearInterval, setTimeout, clearTimeout }
  const now = options.now || Date.now
  const limits = { ...LIMITS, ...options.limits }
  limits.events = Math.max(2, Math.min(LIMITS.events, Number(limits.events) || LIMITS.events))
  limits.jsonBytes = Math.max(8192, Math.min(LIMITS.jsonBytes, Number(limits.jsonBytes) || LIMITS.jsonBytes))
  const started = now()
  const runId = new Date(started).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex')
  const root = options.outputRoot
  const directory = path.join(root, runId)
  fs.mkdirSync(directory, { recursive: true })
  const timeline = path.join(directory, 'timeline.jsonl')
  const reserve = Math.min(100 * 1024, Math.floor(limits.jsonBytes / 2))
  const timelineBudget = Math.max(0, limits.jsonBytes - reserve - 1024)
  let active = true, attached = null, serial = 0, bytes = 0, events = 0, dropped = 0
  let mainTicks = 0, rendererAt = null, heartbeat = null, snapshot = null, lastCompleted = null, lastCompletedStage = null, lastError = null
  let image = { status: 'not-requested' }, ipcSpan = null, stopPromise = null, stopReason = null, stopAt = null
  let heartbeatTimer, deadlineTimer
  const pending = new Map(), listeners = [], globalListeners = []
  function listen(target, event, fn, list = listeners) { if (target?.on) { target.on(event, fn); list.push(() => target.removeListener?.(event, fn)) } }
  function state() {
    return { version: 1, runId, status: active ? 'recording' : stopReason, elapsedMs: (stopAt || now()) - started, events, dropped, mainTicks,
      rendererHeartbeatAgeMs: rendererAt === null ? null : now() - rendererAt,
      lastCompleted, lastCompletedStage, pending: [...pending.values()].slice(-16), lastError, heartbeat, snapshot, screenshot: image,
      limits, note: 'Pending is an observation, not proof of deadlock. No preference/save/IPC content is collected. Main-thread blocking can prevent its own watchdog.' }
  }
  function summary() {
    const value = state()
    let json = JSON.stringify(value, null, 2)
    if (Buffer.byteLength(json) > reserve * .7) { value.snapshot = null; value.pending = value.pending.slice(-3); json = JSON.stringify(value, null, 2) }
    if (Buffer.byteLength(json) > reserve * .7) json = JSON.stringify({ version: 1, runId, status: value.status, events, dropped, truncated: true })
    const text = ['Sixty Four 启动分层探针', `状态：${value.status}；事件 ${events}；丢弃 ${dropped}`,
      `最后完成阶段：${lastCompletedStage?.name || '尚无'}`, `最后完成调用：${lastCompleted?.name || '尚无'}`, `渲染心跳距今：${value.rendererHeartbeatAgeMs ?? '未收到'} ms`,
      `游戏帧成功/失败：${heartbeat?.completed ?? 0}/${heartbeat?.failed ?? 0}；RAF ${heartbeat?.raf ?? 0}`,
      '尚未返回（并行异步不等于阻塞）：', ...value.pending.map(v => `- ${v.name}`),
      `最近异常位置：${lastError?.name || '未记录'}`, `窗口截图：${image.status}`,
      '查看 timeline.jsonl 的 begin/end/error 配对。脚本心跳不等于画面可见；GPU或主线程异常需结合后续证据。',
      '探针不增加或取消游戏保存；玩家正常运行游戏的读写行为保持。'].join('\n') + '\n'
    try {
    fs.writeFileSync(path.join(directory, 'summary.json'), json)
    fs.writeFileSync(path.join(directory, 'summary.txt'), Buffer.from(text).subarray(0, Math.max(0, reserve - Buffer.byteLength(json))))
    fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify({ runId, directory: runId, status: value.status }))
    } catch (_) { /* Disk failure must not escape into game callbacks. */ }
  }
  function append(event) {
    if (!active) return false
    const row = { atMs: now() - started, ...clean(event) }
    const line = JSON.stringify(row) + '\n'
    if (events >= limits.events || bytes + Buffer.byteLength(line) > timelineBudget) { dropped++; void stop('limit'); return false }
    try { fs.appendFileSync(timeline, line) } catch (_) { dropped++; void stop('io-error'); return false }
    bytes += Buffer.byteLength(line); events++
    if (row.kind === 'begin') pending.set(row.id, { id: row.id, name: row.name, atMs: row.atMs, source: row.source })
    if (row.kind === 'end') {
      const begin = pending.get(row.id)
      pending.delete(row.id)
      if (row.outcome === 'error') lastError = { name: begin?.name || row.name, error: row.error, atMs: row.atMs }
      else {
        lastCompleted = { name: begin?.name || row.name, atMs: row.atMs }
        if (lastCompleted.name?.startsWith('stage:')) lastCompletedStage = lastCompleted
      }
    }
    if (row.kind === 'error') lastError = { name: row.name, error: row.error, atMs: row.atMs }
    return true
  }
  function mark(name, detail) { return append({ kind: 'mark', name, detail, source: 'main' }) }
  function begin(name) { const id = 'm' + ++serial; append({ kind: 'begin', id, name, source: 'main' }); return id }
  function end(id, outcome = 'ok') { append({ kind: 'end', id, outcome, source: 'main' }) }
  function sendStop(window) { try { if (!window?.isDestroyed?.()) window?.webContents?.send(CHANNEL, { type: 'stop' }) } catch (_) {} }
  async function capture(window) {
    if (!window || window.isDestroyed?.() || typeof window.webContents?.capturePage !== 'function') { image = { status: 'unavailable' }; return }
    image = { status: 'pending' }
    let timer
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => window.webContents.capturePage()).then(value => ({ value }), () => ({ failed: true })),
        new Promise(resolve => { timer = timers.setTimeout(() => resolve({ timeout: true }), limits.captureMilliseconds) })
      ])
      if (result.timeout) image = { status: 'timeout' }
      else if (result.failed || !result.value) image = { status: 'failed' }
      else {
        const png = result.value.toPNG()
        if (png.length > limits.screenshotBytes) image = { status: 'size-limit' }
        else { fs.writeFileSync(path.join(directory, 'window.png'), png); image = { status: 'saved', bytes: png.length } }
      }
    } catch (_) { image = { status: 'failed' } }
    finally { if (timer) timers.clearTimeout(timer) }
  }
  function stop(reason = 'manual') {
    if (stopPromise) return stopPromise
    active = false; stopReason = reason; stopAt = now()
    timers.clearInterval(heartbeatTimer); timers.clearTimeout(deadlineTimer)
    sendStop(attached)
    for (const dispose of listeners.splice(0).concat(globalListeners.splice(0))) { try { dispose() } catch (_) {} }
    summary() // Partial evidence remains available even if capturePage never answers.
    stopPromise = (reason === 'closed' || reason === 'limit' ? Promise.resolve() : capture(attached)).then(() => { summary(); return state() })
    return stopPromise
  }
  function validSender(event) { return active && attached && event.sender === attached.webContents && (!event.senderFrame || event.senderFrame === attached.webContents.mainFrame) }
  function receive(event, message) {
    if (!validSender(event) || !message || typeof message !== 'object') return
    if (message.type === 'event') {
      const row = clean(message.event)
      if (!row || !['begin', 'end', 'mark', 'error'].includes(row.kind) || (row.kind === 'begin' && typeof row.name !== 'string')) return
      if (typeof row.id === 'string') row.id = 'r:' + row.id
      row.source = 'renderer'; append(row)
      if (row.name === 'preload-enter') {
        for (const [id] of pending) if (id.startsWith('r:')) pending.delete(id)
        rendererAt = now()
      }
    } else if (message.type === 'heartbeat') { rendererAt = now(); heartbeat = clean(message.detail) }
    else if (message.type === 'stop') { void stop('requested') }
    else if (message.type === 'snapshot') { snapshot = clean(message.detail); append({ kind: 'mark', name: 'visible-output-sample', source: 'renderer', detail: snapshot }) }
  }
  listen(ipcMain, CHANNEL, receive, globalListeners)
  listen(ipcMain, 'getMyStuff', event => { if (validSender(event)) ipcSpan = begin('ipc:getMyStuff') }, globalListeners)
  listen(app, 'child-process-gone', (_event, detail) => mark('child-process-gone', { type: detail?.type, reason: detail?.reason, code: detail?.exitCode }), globalListeners)
  listen(app, 'ready', () => mark('app-ready'), globalListeners)
  function prepareWindowOptions(base) {
    if (!active) return base
    const preferences = base.webPreferences || {}
    if (preferences.preload) { mark('preload-conflict'); return base }
    return { ...base, webPreferences: { ...preferences, preload: path.join(__dirname, 'startup-preload.js') } }
  }
  function attachWindow(window) {
    if (!active) return
    const previous = attached
    for (const dispose of listeners.splice(0)) { try { dispose() } catch (_) {} }
    if (previous && previous !== window) sendStop(previous)
    for (const [id] of pending) if (id.startsWith('r:')) pending.delete(id)
    attached = window; rendererAt = null; heartbeat = null; snapshot = null
    mark('window-created')
    const contents = window.webContents
    listen(contents, 'did-start-loading', () => mark('navigation-start'))
    listen(contents, 'dom-ready', () => mark('navigation-dom-ready'))
    listen(contents, 'did-finish-load', () => mark('navigation-end'))
    listen(contents, 'did-fail-load', (_e, code) => mark('navigation-failed', { code }))
    listen(contents, 'render-process-gone', (_e, detail) => mark('renderer-gone', { reason: detail?.reason, code: detail?.exitCode }))
    listen(window, 'unresponsive', () => mark('window-unresponsive'))
    listen(window, 'closed', () => { if (attached === window) void stop('closed') })
    const originalSend = contents.send
    function observedSend(channel, ...args) {
      if (active && channel === 'hereYouGoSir' && ipcSpan) { end(ipcSpan); ipcSpan = null }
      return originalSend.call(this, channel, ...args)
    }
    contents.send = observedSend
    listeners.push(() => { if (contents.send === observedSend) contents.send = originalSend })
    summary()
  }
  mark('main-bridge-enter', { name: 'Electron ' + (process.versions.electron || 'test') })
  heartbeatTimer = timers.setInterval(() => { if (active) { mainTicks++; mark('main-heartbeat', { count: mainTicks }); summary() } }, 1000)
  deadlineTimer = timers.setTimeout(() => { void stop('time-limit') }, limits.milliseconds)
  heartbeatTimer?.unref?.(); deadlineTimer?.unref?.()
  summary()
  return { prepareWindowOptions, attachWindow, mark, begin, end, stop, state, directory }
}

module.exports = { createService, CHANNEL, LIMITS, clean }
