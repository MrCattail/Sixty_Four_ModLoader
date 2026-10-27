'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const CHANNEL = 'modloader:clear-view-probe'
const TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8', 'v8.execute', 'cc', 'gpu', 'viz', 'benchmark']
const PLACEMENT_TRACE_CATEGORIES = ['toplevel', 'devtools.timeline', 'blink.user_timing', 'cc', 'gpu', 'viz']

function sanitizeStartupDiagnostic(value) {
  const stages = ['main-start', 'protocol-check', 'placement-module', 'placement-setup', 'placement-start', 'comparison-start', 'recorder-start', 'observer-start']
  if (!value || value.schemaVersion !== 1 || !stages.includes(value.stage) || typeof value.cancelled !== 'boolean') throw new Error('无效的探针启动诊断。')
  const text = (v, limit) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : ''
  const error = v => ({ name: text(v?.name, 64), message: text(v?.message, 500) })
  const result = { schemaVersion: 1, stage: value.stage, cancelled: value.cancelled, error: error(value.error) }
  if (value.cleanupError) result.cleanupError = error(value.cleanupError)
  if (value.scene && typeof value.scene === 'object') {
    result.scene = {}
    for (const key of ['zoom', 'unit', 'plane', 'width', 'height', 'projectionPitch', 'projectionYaw', 'hoveredX', 'hoveredY']) result.scene[key] = Number.isFinite(value.scene[key]) ? value.scene[key] : null
    for (const key of ['item', 'hovered', 'transported', 'touch', 'mobile', 'halt', 'hidden', 'focused', 'menuOpen']) result.scene[key] = typeof value.scene[key] === 'boolean' ? value.scene[key] : null
    result.scene.itemType = text(value.scene.itemType, 64)
    result.scene.interactionMode = text(value.scene.interactionMode, 32)
  }
  if (value.configuration && typeof value.configuration === 'object') result.configuration = Object.fromEntries(
    ['enableClearViewGridBlock', 'enableClearViewGridStyle', 'enableClearViewClipBlock'].map(key => [key, typeof value.configuration[key] === 'boolean' ? value.configuration[key] : null]))
  if (value.capabilities && typeof value.capabilities === 'object') result.capabilities = Object.fromEntries(
    ['renderGrid', 'renderEntitiesAbstract'].map(name => [name, { supported: value.capabilities[name]?.supported === true,
      sha256: typeof value.capabilities[name]?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.capabilities[name].sha256) ? value.capabilities[name].sha256 : null }]))
  for (const key of ['sceneUnavailable', 'configurationUnavailable', 'capabilitiesUnavailable']) if (value[key] === true) result[key] = true
  return result
}

function summarize(report, record) {
  const number = n => Number.isFinite(n) ? n.toFixed(2) : '未测得'
  const lines = ['# 清晰视图探针记录', '', `- 采集方式：${record.mode}`, `- 结束状态：${record.status}`,
    `- 记录目录：${record.directory}`, `- 浏览器时间线：${record.trace.status}`,
    '- 方法数值为同步调用墙钟耗时，包含当前模组包装及原生调用等待；不等于 GPU 硬件耗时。',
    '- 方法 inclusive 会重叠，禁止直接相加；self 只扣除已测量子方法。',
    '- 底层轨道是否足够定位 GPU／栅格化／合成，必须查看底层时间线文件；缺失不能推算。', '']
  if (record.trace.fileName) lines.push(`- 底层文件：${record.trace.fileName}；格式：${record.trace.format}。Perfetto原生流不伪装成JSON；覆盖和丢失仍需离线核对。`, '')
  if (record.trace.categoryDiscoveryIncomplete) lines.push('- 当前类别枚举不完整，已请求固定白名单；请求分类不等于实际轨道存在，须核对原始时间线。', '')
  if (record.rendererStartup) {
    const d = record.rendererStartup
    lines.push('## 采集未开始', '', `- 启动结果：${d.cancelled ? '启动期间取消' : '渲染进程启动失败'}；阶段：${d.stage}。`,
      `- 错误：${d.error.name}：${d.error.message}`,
      '- 本记录没有完成有效采样，不能用于性能归因。白名单场景、三项冲突设置与原生方法能力见 session.json 的 rendererStartup。')
    if (d.cleanupError) lines.push(`- 清理错误：${d.cleanupError.name}：${d.cleanupError.message}`)
    lines.push('')
  }
  if (record.startError) lines.push('- 主进程启动错误：' + record.startError, '')
  if (report) {
    if (report.placement) {
      const p = report.placement, groups = new Map()
      const median = values => { const a = values.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.ceil(a.length / 2) - 1] : null }
      for (const frame of report.frames) {
        const d = frame?.placement
        if (!d) continue
        const key = [d.phase, 'zoom=' + frame.scene?.zoom, frame.observedView, frame.scene?.item ? frame.scene.itemType : '无手持', d.kind].join(' / ')
        const row = groups.get(key) || { key, count: 0, stable: 0, setup: [], lines: [], scan: [], cells: [], entities: [], masks: [], call: [], overhead: [] }
        row.count++; if (frame.comparable) row.stable++
        // Block timings retain raw samples; comparable frame intervals are in the general table.
        if (d.grid) { row.setup.push(d.grid.setupMs); row.lines.push(d.grid.linesMs); row.scan.push(d.grid.placementMs); row.cells.push(d.grid.executedCells) }
        if (d.detail) { row.entities.push(d.detail.entityMs); row.masks.push(d.detail.maskMs) }
        row.call.push(frame.durationMs); row.overhead.push(d.callbackOverheadMs)
        groups.set(key, row)
      }
      lines.push('## 新版放置细分', '', `- 完整协议：${p.completed ? '是' : '否'}；停止原因：${p.stopReason}；详细采样每${p.detailEvery}帧一次。`,
        '- 原样/raw直接调用捕获的原方法；timed含分块计时；detail含稀疏逐实体/遮罩计时。原样、普通计时和详细采样开销必须分别判断。',
        '- 下表是各类原始同步耗时中位数（不是GPU时间）；detail及相邻间隔已从稳定帧统计排除。空白代表未测得，不代表零成本。',
        '- 扫描格数从实际原生循环边界计算；描边次数是原生层尝试/发出的调用，外层已有Mod可能再抑制；不等于实际像素。', '',
        '| 组/缩放/视图/手持/采样 | 样本/稳定帧 | 网格准备 ms | 网格线 ms | 放置扫描+阴影 ms | 执行格数 | 建筑render ms | 白色mask ms | 外层帧调用 ms | 已计入几何记录开销 ms |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
      for (const row of groups.values()) lines.push(`| ${row.key} | ${row.count}/${row.stable} | ${number(median(row.setup))} | ${number(median(row.lines))} | ${number(median(row.scan))} | ${number(median(row.cells))} | ${number(median(row.entities))} | ${number(median(row.masks))} | ${number(median(row.call))} | ${number(median(row.overhead))} |`)
      if (p.comparison) {
        lines.push('', '| 对照组 | 开始/结束 ms | 帧数 | 原生网格/抽象入口次数 |', '| --- | --- | ---: | ---: |')
        for (const phase of p.phases) lines.push(`| ${phase.label} | ${number(phase.startMs)}/${number(phase.endMs)} | ${phase.frames} | ${phase.gridCalls}/${phase.abstractCalls} |`)
        lines.push('', '- 仅对照期间按组省略指定绘制；结束恢复。首尾漂移、有效帧和实体数范围另见通用统计，不把合成检查当成现场因果证明。')
      }
      lines.push('', ...p.warnings.map(w => '- ' + w), ...p.limitations.map(w => '- ' + w), '')
    }
    if (report.origin) {
      const o = report.origin
      lines.push('## 启动来源观测', '', `- 游戏完成初始化：${o.ready ? '是' : '否'}；loadSave 调用数：${o.loads}；停止原因：${report.stopReason}`,
        `- 丢弃事件：${o.droppedEvents}；有界调用栈：${o.stacks?.length || 0}。原始事件、画布身份和调用栈见 frames.json 的 origin。`,
        '- 记录从读档前开始，初始化完成后观察 30 秒；不更改资源、线端或绘图命令。先核对上下文身份及事件时间，再判断因果。', '',
        '| 时间 ms | 事件 | 画布 | 线端 | 来源栈 |', '| --- | --- | --- | --- | --- |')
      for (const e of (o.events || []).filter(e => ['load-begin', 'load-end', 'game-ready', 'lineCap-change', 'explosion-create', 'grid-entry'].includes(e.type)).slice(0, 80)) {
        lines.push(`| ${number(e.timeMs)} | ${e.type} | ${e.contextId || ''} | ${e.before ? e.before + ' → ' : ''}${e.cap || ''} | ${e.sourceId || ''} |`)
      }
      lines.push('', ...(o.warnings || []).map(x => '- ' + x), ...(o.limitations || []).map(x => '- ' + x), '')
    }
    if (['clear-view-grid-stroke-v1', 'clear-view-grid-threshold-v1'].includes(report.ablation?.protocol)) {
      const a = report.ablation
      const threshold = a.protocol === 'clear-view-grid-threshold-v1'
      lines.push(threshold ? '## 线宽阈值／线端对照' : '## 网格内部对照', '',
        `- 协议完成：${a.completed ? '是' : '否（提前结束或未到最后一组）'}；停止原因：${a.stopReason}`,
        `- ${threshold ? '八' : '六'}组各 12 秒；前 3 秒、跨组间隔、元数据采集帧及相邻间隔排除。保持动态世界，不是冻结场景基准。`,
        '- 原样组实际调用原生方法，其线数来自元数据推算；其余组记录构造线数和实际发出的／省略的 stroke 调用数。',
        '- 颜色自身透明度与 globalAlpha 分开记录；宽度是绘图坐标单位，实际变换见元数据。少于 3 个有效帧的组不足以定量比较。', '',
        '| 组别 | 开始 / 结束 ms | 原生 / 变体调用 | 构造线数 | 发出 / 省略描边 |', '| --- | --- | --- | --- | --- |')
      for (const p of a.phases || []) lines.push(`| ${p.label} | ${number(p.startMs)} / ${number(p.endMs)} | ${p.nativeCalls} / ${p.variantCalls} | ${p.native ? '原生未拦截' : p.constructedLines} | ${p.native ? '原生未拦截' : p.issuedStrokes + ' / ' + p.omittedStrokes} |`)
      lines.push('', '| 组别 | 请求线宽 / 颜色 | 目标画布 | 每次预计线数 | 采样最长线长 |', '| --- | --- | --- | --- | --- |')
      for (const p of a.phases || []) {
        const m = p.metadata?.find(x => x.stage === 'stable') || p.metadata?.[0]
        lines.push(`| ${p.label} | ${number(m?.requested?.lineWidth)} / ${m?.requested?.strokeStyle || '未知'} | ${m?.context?.canvas?.token || '未知'} | ${m?.geometry?.lineCount ?? '未知'} | ${number(m?.geometry?.lengthMax)} |`)
      }
      if (threshold) {
        lines.push('', '| 组别 | 请求线端 | 实测生效线宽 / 线端（变体） | 与此前参考上下文相符 |', '| --- | --- | --- | --- |')
        for (const p of a.phases || []) {
          const m = p.metadata?.find(x => x.stage === 'stable') || p.metadata?.[0]
          const effective = p.native ? '原生未拦截，见源码契约' : `${number(m?.effective?.lineWidth)} / ${m?.effective?.lineCap || '未测得'}`
          lines.push(`| ${p.label} | ${m?.requested?.lineCap || '未知'} | ${effective} | ${m?.matchesPreviousReference === true ? '是（采样时点）' : m?.matchesPreviousReference === false ? '否，请核对变换／原生宽度／继承线端／画布' : '未知'} |`)
        }
        lines.push('', '- 原生组的 lineCap 继承自 context.properties；变体 effective 在赋值后读取。非单位变换下不得将请求宽度 1.0 直接解释为设备像素阈值。')
      }
      lines.push('', '- 完整画布状态、变换、投影指纹和有界线段样本见 frames.json 的 ablation.phases[].metadata。',
        ...(a.limitations || []).map(x => '- ' + x), ...(a.warnings || []).map(x => '- ' + x), '')
    } else if (report.ablation) {
      lines.push('## 自动裁剪／网格对照', '',
        `- 协议完成：${report.ablation.completed ? '是' : '否（提前结束或未到最后一组）'}；停止原因：${report.ablation.stopReason}`,
        '- 每组 12 秒，切换后前 3 秒和跨组帧间隔排除；首尾均为 Alt 原样复测。',
        '- 数据来自实际运行世界；实体数量可波动，必须结合范围和首尾原样漂移判断。样本少于 3 帧的组不足以定量比较。', '',
        '| 组别 | 实际开始 / 结束 ms | 抽象绘制 / 去裁剪 / 跳过网格调用数 |', '| --- | --- | --- |')
      for (const p of report.ablation.phases || []) lines.push(`| ${p.label} | ${number(p.startMs)} / ${number(p.endMs)} | ${p.abstractCalls} / ${p.noClipCalls} / ${p.gridOmissions} |`)
      lines.push('', ...(report.ablation.warnings || []).map(x => '- ' + x), '')
    }
    lines.push(`- 采样帧：${report.frameCount}；时长：${number(report.durationMs)} ms`, '',
      '| 场景 | 可比较帧 | 帧间隔 P50 / P95 / P99 ms | 绘制调用 P95 ms |', '| --- | ---: | --- | ---: |')
    for (const g of report.groups || []) lines.push(`| ${String(g.key).replace(/\|/g, ' / ')} | ${g.frames - g.excluded} | ${number(g.frameInterval.p50Ms)} / ${number(g.frameInterval.p95Ms)} / ${number(g.frameInterval.p99Ms)} | ${number(g.renderCall.p95Ms)} |`)
    if (report.comparisonPolicy) {
      lines.push('', '- 稳定控制条件统计允许动态实体数变化；严格同实体数样本另列，原始帧保留。', '', '| 场景 | 实体数范围（全部记录帧） | 严格同场景可比较帧 |', '| --- | --- | --- |')
      for (const g of report.groups || []) lines.push(`| ${String(g.key).replace(/\|/g, ' / ')} | ${g.entitiesMin}–${g.entitiesMax} | ${g.strictFrames} |`)
    }
    lines.push('', '| 方法 | 调用数 | P50 / P95 ms | 累计 self ms |', '| --- | ---: | --- | ---: |')
    for (const r of [...report.methods].sort((a, b) => b.selfMeasuredMs - a.selfMeasuredMs)) lines.push(`| ${r.method} | ${r.calls} | ${number(r.p50Ms)} / ${number(r.p95Ms)} | ${number(r.selfMeasuredMs)} |`)
    lines.push('', '## 局限', '', ...(report.limitations || []).map(x => '- ' + x), ...(report.warnings || []).map(x => '- ' + x))
  } else lines.push('渲染进程未返回计时数据。已保留主进程记录及可用时间线，不能将此记录当作完整采集。')
  if (record.trace.error) lines.push('', '- 时间线错误：' + record.trace.error)
  return lines.join('\n') + '\n'
}

function createService(options) {
  const { app, ipcMain, contentTracing, screen, shell } = options.electron
  const outputRoot = path.resolve(options.outputRoot)
  const timers = options.timers || { setTimeout, clearTimeout }
  const bound = new WeakSet()
  let active = null, last = null, traceStopUncertain = false, armStore = null
  const arms = () => armStore || (armStore = require('./clear-view-origin').createArmStore(outputRoot))
  const reply = (ok, data) => ok ? { ok: true, result: data } : { ok: false, error: data }
  const safeError = e => String(e?.message || e).slice(0, 500)

  function requireOwner(event) {
    const win = options.getWindow()
    if (!win || win.isDestroyed?.() || event?.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('探针仅接受游戏主窗口请求。')
    return win
  }
  function save(record, report = null) {
    if (report) record.savedReport = report
    record.savePromise = (record.savePromise || Promise.resolve()).catch(() => {}).then(async () => {
      const metadata = Object.fromEntries(['id', 'mode', 'seconds', 'directory', 'status', 'startedAtUtc', 'originReadyAtUtc', 'finishedAtUtc', 'startError', 'rendererStartup', 'versions', 'trace', 'window', 'gpuFeatures', 'gpuDevices', 'gpuInfoError'].map(key => [key, record[key]]))
      await fs.promises.writeFile(path.join(record.directory, 'session.json'), JSON.stringify(metadata, null, 2))
      if (record.savedReport) await fs.promises.writeFile(path.join(record.directory, 'frames.json'), JSON.stringify(record.savedReport))
      await fs.promises.writeFile(path.join(record.directory, 'summary.md'), summarize(record.savedReport, record))
    })
    return record.savePromise
  }
  function stopTrace(record) {
    if (record.stopPromise) return record.stopPromise
    if (record.trace.status !== 'recording') return Promise.resolve()
    record.stopPromise = (async () => {
      // Electron 28 crashes in this API's native async callback (upstream #50556).
      // A JS try/catch cannot protect the game; never query getTraceBufferUsage.
      record.trace.bufferUsage = 'not-queried: Electron 28 native HandleScope crash'
      try {
        await contentTracing.stopRecording(path.join(record.directory, 'trace.json'))
        // New shipped runtimes export Perfetto protobuf, even with a .json path.
        // Inspect a bounded header; preserve the native stream without conversion.
        const file = path.join(record.directory, 'trace.json'), header = Buffer.alloc(64)
        const handle = await fs.promises.open(file, 'r')
        let bytesRead
        try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)) } finally { await handle.close() }
        if (!bytesRead) throw new Error('底层追踪文件为空。')
        const json = /^\s*\{\s*"/.test(header.subarray(0, bytesRead).toString('utf8'))
        record.trace.format = json ? 'chrome-json' : 'perfetto-protobuf'
        record.trace.fileName = json ? 'trace.json' : 'trace.pftrace'
        if (!json) await fs.promises.rename(file, path.join(record.directory, record.trace.fileName))
        record.trace.status = 'saved'
      } catch (error) { record.trace.status = 'failed'; record.trace.error = safeError(error); traceStopUncertain = true }
      record.trace.stoppedAtUtc = new Date().toISOString()
    })()
    return record.stopPromise
  }
  async function abandon(record, reason) {
    record.cancelled = true
    await record.setupDone
    if (record.finishPromise) { await record.finishPromise; return }
    timers.clearTimeout(record.timer); timers.clearTimeout(record.grace)
    await stopTrace(record)
    if (record.status === 'complete') return
    record.status = reason
    await save(record)
    last = record
    if (active === record) active = null
  }
  function attachWindow(win) {
    const sender = win?.webContents
    if (!sender || bound.has(sender)) return
    bound.add(sender)
    const abort = reason => {
      const record = active
      if (record?.sender === sender) void abandon(record, reason).catch(() => {})
    }
    sender.on('render-process-gone', () => abort('renderer-gone'))
    sender.on('destroyed', () => abort('window-destroyed'))
    sender.on('did-start-navigation', (_e, _url, _inPlace, mainFrame) => { if (mainFrame) abort('navigation') })
  }
  function setDeadline(record, milliseconds) {
    timers.clearTimeout(record.timer)
    record.timer = timers.setTimeout(() => {
      void (async () => {
        await stopTrace(record)
        if (record.finishPromise || record.cancelled || record.status === 'complete') return
        record.status = 'awaiting-renderer'
        await save(record)
        if (record.finishPromise || record.cancelled || record.status === 'complete') return
        if (!record.sender.isDestroyed()) record.sender.send(CHANNEL + ':deadline', { id: record.id })
        record.grace = timers.setTimeout(() => { void abandon(record, 'renderer-timeout').catch(() => {}) }, 30000)
      })().catch(() => {})
    }, milliseconds)
  }
  async function start(win, payload) {
    if (active || options.isOtherBusy?.()) throw new Error('已有探针采集正在运行。')
    if (traceStopUncertain) throw new Error('上次底层追踪未能正常停止，请完整重启游戏后再采集。')
    if (!['light', 'deep', 'ablation', 'grid-ablation', 'grid-threshold', 'origin', 'placement-light', 'placement-deep', 'placement-ablation'].includes(payload.mode)) throw new Error('未知采集方式。')
    const deep = payload.mode === 'deep' || payload.mode === 'placement-deep'
    if (deep && (win.webContents.isDevToolsOpened?.() || win.webContents.debugger?.isAttached?.())) throw new Error('深入记录前请关闭开发者工具或调试连接，再重试。')
    const seconds = payload.mode === 'origin' ? 30 : payload.mode === 'grid-threshold' ? 96 : payload.mode === 'grid-ablation' ? 72 : payload.mode === 'ablation' || payload.mode === 'placement-ablation' ? 60 : payload.mode.startsWith('placement-') ? 20 : Math.min(30, Math.max(5, Number(payload.seconds) || 20))
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex')
    const record = { id, mode: payload.mode, seconds, directory: path.join(outputRoot, id), sender: win.webContents,
      status: 'starting', startedAtUtc: new Date().toISOString(), versions: options.versions || process.versions,
      trace: { status: deep ? 'pending' : 'not-requested', hardwareGpuTime: 'not-measured' } }
    let setupComplete
    record.setupDone = new Promise(resolve => { setupComplete = resolve })
    active = record
    try {
      await fs.promises.mkdir(record.directory, { recursive: true })
      const bounds = win.getBounds()
      const display = screen.getDisplayMatching(bounds)
      record.window = { bounds, contentBounds: win.getContentBounds(), scaleFactor: display.scaleFactor, refreshRate: display.displayFrequency, fullscreen: win.isFullScreen() }
      record.gpuFeatures = app.getGPUFeatureStatus()
      try {
        const gpu = await app.getGPUInfo('basic')
        record.gpuDevices = gpu.gpuDevice?.map(d => ({ vendorId: d.vendorId, deviceId: d.deviceId, active: d.active })) || []
      } catch (error) { record.gpuInfoError = safeError(error) }
      if (record.cancelled) throw new Error('窗口已关闭或重新加载。')
      if (deep) {
        const available = await contentTracing.getCategories()
        if (record.cancelled) throw new Error('窗口已关闭或重新加载。')
        const requested = payload.mode === 'placement-deep' ? PLACEMENT_TRACE_CATEGORIES : TRACE_CATEGORIES
        let selected = requested.filter(c => available.includes(c))
        if (!selected.includes('devtools.timeline')) {
          if (payload.mode !== 'placement-deep') throw new Error('当前运行时没有所需的时间线分类。')
          // Discovery can be incomplete until a code path runs. Request only our
          // fixed allowlist and let marker/event coverage establish availability.
          selected = [...requested]; record.trace.categoryDiscoveryIncomplete = true
        }
        record.trace.categories = selected
        record.trace.missingCategories = requested.filter(c => !available.includes(c))
        record.trace.bufferLimitKB = 32768
        // The argument-filter flag also crashes this shipped Electron 28 at flush.
        // Verified with a minimal isolated A/B. Keep the category allowlist instead.
        record.trace.argumentFilter = 'disabled: reproduced native crash in Electron 28'
        record.trace.completeness = 'buffer bounded; inspect capture markers and event coverage before attribution'
        await contentTracing.startRecording({ recording_mode: 'record-until-full', trace_buffer_size_in_kb: record.trace.bufferLimitKB, included_categories: selected, excluded_categories: ['*'], enable_argument_filter: false })
        record.trace.status = 'recording'
        record.trace.startedAtUtc = new Date().toISOString()
      }
      if (record.cancelled || active !== record || win.isDestroyed?.()) throw new Error('窗口已关闭或重新加载。')
      record.status = 'recording'
      await save(record)
      setupComplete()
      // Give the placement renderer time to emit capture-stop before the safety
      // watchdog flushes tracing. Hung renderers still have a bounded deadline.
      if (payload.mode === 'placement-deep') record.trace.watchdogGraceMs = 1000
      setDeadline(record, (payload.mode === 'origin' ? 120 : seconds) * 1000 + (payload.mode === 'placement-deep' ? 1000 : 0))
      return { id, seconds }
    } catch (error) {
      record.startError = safeError(error)
      setupComplete()
      await abandon(record, 'start-failed').catch(() => {})
      throw error
    }
  }
  async function finish(record, report) {
    if (record.finishPromise) return record.finishPromise
    const comparison = record.mode === 'ablation' || record.mode === 'grid-ablation' || record.mode === 'grid-threshold' || record.mode === 'placement-ablation'
    const frameLimit = comparison ? 24000 : 12000
    if (!report || report.schemaVersion !== 1 || !Array.isArray(report.frames) || report.frames.length > frameLimit || !Array.isArray(report.methods) || report.methods.length > 64 || !Array.isArray(report.groups) || report.groups.length > frameLimit) throw new Error('无效或过大的探针报告。')
    if (record.mode === 'origin' && (report.origin?.protocol !== 'clear-view-origin-v1' || !Array.isArray(report.origin.events) || report.origin.events.length > 2048 || !Array.isArray(report.origin.stacks) || report.origin.stacks.length > 24 || !Array.isArray(report.origin.contexts) || report.origin.contexts.length > 8)) throw new Error('无效或过大的启动来源报告。')
    if (record.mode.startsWith('placement-') && (report.placement?.protocol !== 'placement-v1' || !Array.isArray(report.placement.phases) || report.placement.phases.length > 5 || !Array.isArray(report.placement.warnings) || report.placement.warnings.length > 24 || !Array.isArray(report.placement.limitations) || report.placement.limitations.length > 16)) throw new Error('无效或过大的放置细分报告。')
    if (report.placement?.completed && (!report.frames.length || report.placement.phases.length !== (comparison ? 5 : 1))) throw new Error('放置细分缺少完整采样组或有效帧，不能标记完成。')
    if (Buffer.byteLength(JSON.stringify(report)) > (comparison ? 64 : 24) * 1024 * 1024) throw new Error('探针报告超过大小上限。')
    timers.clearTimeout(record.timer); timers.clearTimeout(record.grace)
    record.finishPromise = (async () => {
      await stopTrace(record)
      record.status = report.placement && !report.placement.completed ? 'incomplete' : 'complete'; record.finishedAtUtc = new Date().toISOString()
      await save(record, report)
      last = record
      if (active === record) active = null
      return { directory: record.directory, traceStatus: record.trace.status, status: record.status }
    })()
    try { return await record.finishPromise }
    catch (error) { record.finishPromise = null; record.status = 'export-failed'; throw error }
  }
  async function handle(event, payload) {
    try {
      const win = requireOwner(event)
      if (!payload || typeof payload !== 'object') throw new Error('无效请求。')
      if (payload.action === 'arm-origin') {
        if (active) throw new Error('请先结束当前采集。')
        return reply(true, await arms().arm())
      }
      if (payload.action === 'cancel-origin') return reply(true, await arms().cancel())
      if (payload.action === 'consume-origin') return reply(true, active ? null : await arms().consume())
      if (payload.action === 'start') return reply(true, await start(win, payload))
      if (payload.action === 'open-folder') {
        if (!last) throw new Error('尚无探针记录。')
        const result = await shell.openPath(last.directory)
        if (result) throw new Error(result)
        return reply(true, { directory: last.directory })
      }
      const record = active?.id === payload.id ? active : last?.id === payload.id ? last : null
      if (!record || record.sender !== event.sender) throw new Error('找不到当前采集。')
      if (payload.action === 'origin-ready') {
        if (record.mode !== 'origin' || record.status !== 'recording' || record.cancelled || record.finishPromise) throw new Error('启动来源采集未运行。')
        if (!record.originReadyAtUtc) { record.originReadyAtUtc = new Date().toISOString(); setDeadline(record, 30000); await save(record) }
        return reply(true, { seconds: 30 })
      }
      if (payload.action === 'finish') return reply(true, await finish(record, payload.report))
      if (payload.action === 'abort') {
        let status = 'cancelled'
        if (payload.startup !== undefined) {
          if (record !== active || record.cancelled || record.finishPromise || record.status !== 'recording') throw new Error('当前会话不能接收启动失败诊断。')
          record.rendererStartup = sanitizeStartupDiagnostic(payload.startup)
          status = record.rendererStartup.cancelled ? 'startup-cancelled' : 'renderer-start-failed'
          record.finishedAtUtc = new Date().toISOString()
        }
        await abandon(record, status)
        return reply(true, { status: record.status, directory: record.directory, traceStatus: record.trace.status })
      }
      throw new Error('未知探针操作。')
    } catch (error) { return reply(false, safeError(error)) }
  }
  ipcMain.handle(CHANNEL, handle)
  return { attachWindow, handle, isBusy: () => !!active }
}

module.exports = { CHANNEL, TRACE_CATEGORIES, createService, summarize }
