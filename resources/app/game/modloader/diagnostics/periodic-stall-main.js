'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { performance } = require('perf_hooks')
const { CHANNEL, ring, distribution } = require('./periodic-stall-probe')
const CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8', 'v8.execute',
  'disabled-by-default-v8.gc', 'cc', 'gpu', 'viz', 'benchmark']
const OPERATIONS = new Set(['cloud.serializeSlots', 'cloud.writeFile', 'steam.updateStat'])
const safeError = error => String(error?.message || error).slice(0, 400)
function summarize(report, session) {
  const n = x => Number.isFinite(x) ? x.toFixed(2) : '未测得'
  const lines = ['# 周期卡顿探针', '', `- 状态：${session.status}；模式：${session.deep ? '深入' : '轻量'}；计划 ${session.seconds} 秒。`,
    '- 本记录只观察；没有跳过保存、云写入、Steam 统计或绘制。',
    '- sync 是同步墙钟时间；async-total 是请求开始至完成的总等待，不能当作阻塞时间。',
    '- 同步父子调用和异步并行操作存在重叠，不能直接加总；帧间隔也不能减去脚本时间作为 GPU 耗时。', '',
    '## 游戏线程', '', '| 方法 | 类型 | 次数 | P50 / P95 / 全程最大 ms | 累计 ms |', '| --- | --- | ---: | --- | ---: |']
  for (const row of (report?.methods || []).slice().sort((a, b) => b.maxMs - a.maxMs)) lines.push(`| ${row.name} | ${row.kind} | ${row.calls} | ${n(row.distribution.p50Ms)} / ${n(row.distribution.p95Ms)} / ${n(row.maxMs)} | ${n(row.totalMs)} |`)
  if (report) {
    const saves = report.events.filter(e => e.name === 'saveLoop' && e.kind === 'sync').map(e => e.atMs)
    const periods = distribution(saves.slice(1).map((at, i) => at - saves[i]))
    lines.push('', `- 可比较绘制回调间隔 P50/P95/P99：${n(report.frameInterval.p50Ms)} / ${n(report.frameInterval.p95Ms)} / ${n(report.frameInterval.p99Ms)} ms。`,
      `- 实际 saveLoop 相邻调用间隔 P50/P95：${n(periods.p50Ms)} / ${n(periods.p95Ms)} ms（${periods.samples} 个间隔）。`,
      `- 原始帧 ${report.frames.length}；丢弃帧 ${report.dropped.frames}；丢弃事件 ${report.dropped.events}；结束时未完成异步观察 ${report.pendingAtStop.length}。`, '',
      '## 长帧与保存链的时间对应', '', '- 以下只列同一长帧区间相交的操作，是相关证据，不自动判定因果。主进程跨进程对齐带有 timeSync 记录的误差。', '',
      '| 长帧结束 ms | 回调间隔 ms | 相交的同步操作（名称 / ms） |', '| ---: | ---: | --- |')
    for (const f of report.frames.filter(f => f.comparable && f.gapMs >= 50).slice(-80)) {
      const start = f.atMs - f.gapMs
      const related = report.events.filter(e => e.kind === 'sync' && e.atMs < f.atMs && e.atMs + e.durationMs > start && e.durationMs >= 2).sort((a, b) => b.durationMs - a.durationMs).slice(0, 6)
      const main = session.main.events.filter(e => e.kind === 'sync' && e.atEpochMs - report.startedEpochMs < f.atMs && e.atEpochMs - report.startedEpochMs + e.durationMs > start && e.durationMs >= 2)
      lines.push(`| ${n(f.atMs)} | ${n(f.gapMs)} | ${related.map(e => e.name + ' / ' + n(e.durationMs)).concat(main.map(e => 'main.' + e.name + ' / ' + n(e.durationMs))).join('; ') || '本探针同步计时未覆盖，需结合深入时间线'} |`)
    }
  } else lines.push('', '- 渲染进程未返回报告，本次为不完整采集。')
  lines.push('', '## 主进程', '', '| 操作 | 次数 | P50 / P95 / 最大 ms |', '| --- | ---: | --- |')
  for (const row of session.main.methods) lines.push(`| ${row.name} | ${row.calls} | ${n(row.distribution.p50Ms)} / ${n(row.distribution.p95Ms)} / ${n(row.maxMs)} |`)
  lines.push('', `- 100 ms 主进程心跳：${session.main.heartbeatTicks} 次，超过 20 ms 的额外延迟 ${session.main.lateTicks} 次；最大额外延迟 ${n(session.main.maxLagMs)} ms。`,
    `- 主进程事件丢弃 ${session.main.droppedEvents}；时间线状态 ${session.trace.status}。`, '', '## 测量边界', '',
    ...(report?.limitations || []).map(x => '- ' + x), ...(report?.warnings || []).map(x => '- ' + x),
    '- 两进程都正常但仍有长帧时，检查 trace.json 的 GC、绘制、合成及 GPU 服务轨道；缺失轨道保持未测得。',
    '- 深入记录使用有上限的时间线缓冲；分析前核对 SFStall 起止标记和事件覆盖。GPU 进程事件不等于 GPU 硬件执行时间。')
  if (session.trace.error) lines.push('- 时间线错误：' + session.trace.error)
  return lines.join('\n') + '\n'
}
function createService(options) {
  const { ipcMain, contentTracing, app, shell } = options.electron
  const timers = options.timers || { setTimeout, clearTimeout, setInterval, clearInterval }
  const now = options.now || (() => performance.timeOrigin + performance.now())
  const bound = new WeakSet(); let active = null, last = null, traceUncertain = false
  function owner(event) {
    const win = options.getWindow()
    if (!win || win.isDestroyed?.() || event.sender !== win.webContents || (win.webContents.mainFrame && event.senderFrame !== win.webContents.mainFrame)) throw new Error('只允许游戏主窗口主页面使用探针。')
    return win
  }
  function sessionData(record) {
    return { protocol: 'periodic-stall-v1', id: record.id, status: record.status, seconds: record.seconds, deep: record.deep,
      startedEpochMs: record.started, finishedEpochMs: record.finished, reason: record.reason, versions: process.versions,
      metadata: record.metadata, gpuFeatures: record.gpuFeatures, trace: record.trace,
      main: { events: record.events.values(), droppedEvents: record.events.dropped,
        methods: [...record.rows.values()].map(({ samples, ...row }) => ({ ...row, distribution: distribution(samples.values()), droppedSamples: samples.dropped })),
        heartbeatTicks: record.ticks, lateTicks: record.lateTicks, maxLagMs: record.maxLag } }
  }
  async function save(record) {
    const session = sessionData(record)
    await fs.promises.mkdir(record.directory, { recursive: true })
    if (record.report) await fs.promises.writeFile(path.join(record.directory, 'frames.json'), JSON.stringify(record.report))
    await fs.promises.writeFile(path.join(record.directory, 'session.json'), JSON.stringify(session, null, 2))
    await fs.promises.writeFile(path.join(record.directory, 'summary.md'), summarize(record.report, session))
  }
  function stopSampling(record) {
    record.accepting = false; timers.clearTimeout(record.deadline); timers.clearInterval(record.heartbeat)
  }
  async function stopTrace(record) {
    if (record.traceStop) return record.traceStop
    record.traceStop = (async () => {
      if (record.trace.status !== 'recording') return
      try { await contentTracing.stopRecording(path.join(record.directory, 'trace.json')); record.trace.status = 'saved' }
      catch (error) { record.trace.status = 'failed'; record.trace.error = safeError(error); traceUncertain = true }
    })()
    return record.traceStop
  }
  async function abandon(record, reason) {
    record.cancelled = true
    if (record.abandoning) return record.abandoning
    record.abandoning = (async () => {
      await record.setupDone
      if (record.finishing) { try { await record.finishing; return } catch (_) {} }
      stopSampling(record); timers.clearTimeout(record.grace); await stopTrace(record)
      record.status = 'incomplete'; record.reason = reason; record.finished = now()
      try { await save(record); last = record } finally { if (active === record) active = null }
    })()
    return record.abandoning
  }
  function requestStop(record) {
    if (active !== record || record.finishing || record.cancelled) return
    stopSampling(record); void stopTrace(record)
    record.grace = timers.setTimeout(() => { void abandon(record, 'renderer-timeout').catch(() => {}) }, 15000)
    try { record.sender.send(CHANNEL, { action: 'stop', id: record.id }) } catch (_) { void abandon(record, 'renderer-unavailable').catch(() => {}) }
  }
  async function start(win, payload) {
    if (active || options.isOtherBusy?.()) throw new Error('已有探针正在运行或等待导出。')
    if (traceUncertain) throw new Error('上次时间线未正常停止，请完整重启游戏。')
    const deep = payload.deep === true, seconds = deep ? 20 : payload.seconds === 300 ? 300 : 120
    if (deep && (win.webContents.isDevToolsOpened?.() || win.webContents.debugger?.isAttached?.())) throw new Error('深入记录前请关闭开发者工具或调试连接。')
    const metadata = payload.metadata || {}
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex')
    const record = { id, seconds, deep, started: now(), directory: path.resolve(options.outputRoot, id), sender: win.webContents,
      status: 'starting', accepting: false, events: ring(2000), rows: new Map(), ticks: 0, lateTicks: 0, maxLag: 0,
      metadata: { loaderVersion: String(metadata.loaderVersion || '').slice(0, 30), renderApiEnabled: !!metadata.renderApiEnabled,
        existingRenderTimingEnabled: !!metadata.existingRenderTimingEnabled, entityCount: Number(metadata.entityCount) || 0,
        slotCount: Number(metadata.slotCount) || 0, historyEntryCount: Number(metadata.historyEntryCount) || 0,
        mods: (Array.isArray(metadata.mods) ? metadata.mods : []).slice(0, 64).map(m => ({ id: String(m.id).slice(0, 120), version: String(m.version).slice(0, 30) })) },
      trace: { status: deep ? 'pending' : 'not-requested', hardwareGpuTime: 'not-measured' } }
    record.setupDone = new Promise(resolve => { record.setupComplete = resolve }); active = record
    try {
      await fs.promises.mkdir(record.directory, { recursive: true })
      record.gpuFeatures = app.getGPUFeatureStatus()
      if (deep) {
        const available = await contentTracing.getCategories()
        if (record.cancelled) throw new Error('启动已取消。')
        record.trace.categories = CATEGORIES.filter(c => available.includes(c)); record.trace.missingCategories = CATEGORIES.filter(c => !available.includes(c))
        if (!record.trace.categories.includes('devtools.timeline')) throw new Error('当前运行时缺少所需时间线分类。')
        // Do not query getTraceBufferUsage or enable argument filtering: both have
        // native crash history in the shipped Electron 28 (see clear-view probe).
        record.trace.bufferLimitKB = 32768
        await contentTracing.startRecording({ recording_mode: 'record-until-full', trace_buffer_size_in_kb: 32768, included_categories: record.trace.categories, excluded_categories: ['*'], enable_argument_filter: false })
        record.trace.status = 'recording'
      }
      if (record.cancelled) throw new Error('启动已取消。')
      record.status = 'recording'; record.accepting = true
      let previous = now()
      record.heartbeat = timers.setInterval(() => {
        if (!record.accepting) return
        const at = now(), lag = Math.max(0, at - previous - 100); previous = at; record.ticks++; record.maxLag = Math.max(record.maxLag, lag)
        if (lag >= 20) { record.lateTicks++; record.events.push({ name: 'main.heartbeat', kind: 'lag', atEpochMs: at, durationMs: lag }) }
      }, 100)
      record.deadline = timers.setTimeout(() => requestStop(record), seconds * 1000)
      record.setupComplete()
      return { id, seconds }
    } catch (error) { record.setupComplete(); await abandon(record, 'start-failed'); throw error }
  }
  function validate(report) {
    if (!report || report.schemaVersion !== 1 || report.protocol !== 'periodic-stall-v1' || !Number.isFinite(report.startedEpochMs) ||
      !Array.isArray(report.frames) || report.frames.length > 30000 || !Array.isArray(report.events) || report.events.length > 10000 ||
      !Array.isArray(report.methods) || report.methods.length > 96 || !Array.isArray(report.pendingAtStop) || report.pendingAtStop.length > 1000 ||
      !report.frameInterval || !report.dropped || !Array.isArray(report.warnings) || !Array.isArray(report.limitations)) throw new Error('无效或过大的探针报告。')
    if (Buffer.byteLength(JSON.stringify(report)) > 32 * 1024 * 1024) throw new Error('探针报告超过 32 MiB 上限。')
  }
  async function finish(record, report) {
    if (record.finishing) return record.finishing
    validate(report); record.report = report
    stopSampling(record); timers.clearTimeout(record.grace)
    record.finishing = (async () => {
      await stopTrace(record); record.status = 'complete'; record.finished = now(); await save(record)
      last = record; if (active === record) active = null
      return { directory: record.directory }
    })()
    try { return await record.finishing } catch (error) { record.finishing = null; record.status = 'export-failed'; throw error }
  }
  async function handle(event, payload) {
    try {
      const win = owner(event)
      if (payload?.action === 'start') return { ok: true, result: await start(win, payload) }
      if (payload?.action === 'open-folder') { if (!last) throw new Error('尚无记录。'); const error = await shell.openPath(last.directory); if (error) throw new Error(error); return { ok: true, result: { directory: last.directory } } }
      const record = active?.id === payload?.id ? active : last?.id === payload?.id ? last : null
      if (!record || record.sender !== event.sender) throw new Error('找不到当前探针采集。')
      if (payload.action === 'clock') return { ok: true, result: { epochMs: now() } }
      if (payload.action === 'abort') { await abandon(record, 'cancelled'); return { ok: true } }
      if (payload.action === 'finish') return { ok: true, result: await finish(record, payload.report) }
      throw new Error('未知探针操作。')
    } catch (error) { return { ok: false, error: safeError(error) } }
  }
  ipcMain.handle(CHANNEL, handle)
  ipcMain.on(CHANNEL + ':abandon', (event, payload) => { try { owner(event); if (active?.id === payload?.id) void abandon(active, 'pagehide').catch(() => {}) } catch (_) {} })
  return {
    handle, isBusy: () => !!active,
    measure(name, run) {
      const record = active
      if (!record?.accepting || !OPERATIONS.has(name)) return run()
      const began = now()
      try { return run() }
      finally {
        try { const elapsed = Math.max(0, now() - began), row = record.rows.get(name) || { name, calls: 0, totalMs: 0, maxMs: 0, samples: ring(256) }
          row.calls++; row.totalMs += elapsed; row.maxMs = Math.max(row.maxMs, elapsed); row.samples.push(elapsed); record.rows.set(name, row)
          record.events.push({ name, kind: 'sync', atEpochMs: began, durationMs: elapsed })
        } catch (_) {}
      }
    },
    attachWindow(win) {
      if (bound.has(win)) return
      bound.add(win)
      const abandonCurrent = reason => { if (active?.sender === win.webContents) void abandon(active, reason).catch(() => {}) }
      win.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) abandonCurrent('navigation') })
      win.webContents.on('render-process-gone', () => abandonCurrent('renderer-gone'))
      win.on('closed', () => abandonCurrent('window-closed'))
    }
  }
}
module.exports = { CHANNEL, CATEGORIES, createService, summarize }
