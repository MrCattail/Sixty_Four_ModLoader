'use strict'

// Temporary diagnostics. Only the explicitly selected ablation mode changes drawing.
const CHANNEL = 'modloader:clear-view-probe'
const METHODS = [
  'renderloop', 'updateCycle', 'updateEntities', 'updateResourceInteractions', 'updateVFX', 'updateAnalytics',
  'renderEntities', 'renderEntitiesAbstract', 'renderConductors', 'renderChasmVFX', 'renderGrid',
  'renderCursor', 'renderResources', 'renderDarkResources', 'renderVFX', 'renderAvailability',
  'renderSOI', 'renderHoveredCell', 'renderAffected', 'renderHollowEvents', 'renderDarkHollowEvents', 'renderSlowdown'
]

function ring(limit) {
  const data = new Array(limit)
  let size = 0, next = 0, dropped = 0
  return {
    push(value) { if (size === limit) dropped++; else size++; data[next] = value; next = (next + 1) % limit },
    values() { return Array.from({ length: size }, (_, i) => data[(next - size + i + limit) % limit]) },
    get dropped() { return dropped }
  }
}

function distribution(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y)
  const percentile = q => a.length ? a[Math.max(0, Math.ceil(a.length * q) - 1)] : null
  return { samples: a.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: a.length ? a[a.length - 1] : null }
}

function createRecorder(options) {
  const game = options.game
  const now = options.now || (() => performance.now())
  const snapshot = options.snapshot || (() => ({}))
  const marker = options.marker || (() => {})
  const frames = ring(options.ablation ? 24000 : 12000), roots = ring(options.ablation ? 48000 : 12000), events = ring(256)
  const rows = Object.create(null), patches = [], stack = [], warnings = []
  let active = false, used = false, frame = null, lastFrameAt = null, startedAt = 0, stoppedAt = 0, lastMode = ''
  const warn = text => { if (warnings.length < 16 && !warnings.includes(text)) warnings.push(text) }
  const safeSnapshot = () => { try { return snapshot() } catch (_) { warn('Scene metadata unavailable'); return {} } }

  function install(name) {
    const original = game[name]
    if (typeof original !== 'function') return
    const descriptor = Object.getOwnPropertyDescriptor(game, name)
    const wrapped = function (...args) {
      if (!active) return original.apply(this, args)
      const ownFrame = name === 'renderloop' && !frame
      if (ownFrame) options.beforeFrame?.()
      const began = now(), node = { children: 0 }, parent = stack[stack.length - 1]
      if (ownFrame) {
        const scene = safeSnapshot()
        frame = { startMs: began - startedAt, gapMs: lastFrameAt === null ? null : began - lastFrameAt, scene, observedView: 'none', methods: {} }
        lastFrameAt = began
        const mode = [scene.alt, scene.item, scene.relocate, scene.erase, scene.touch, scene.hidden, scene.focused, scene.menuOpen, scene.width, scene.height, scene.zoom].join('|')
        if (mode !== lastMode) { lastMode = mode; marker('mode:' + mode) }
      }
      if (frame && name === 'renderEntitiesAbstract') frame.observedView = 'clear'
      if (frame && name === 'renderEntities') frame.observedView = frame.observedView === 'clear' ? 'mixed' : 'ordinary'
      stack.push(node)
      try { return original.apply(this, args) }
      catch (error) { if (ownFrame) options.onFrameError?.(error); throw error }
      finally {
        const elapsed = Math.max(0, now() - began)
        stack.pop()
        if (parent) parent.children += elapsed
        try {
          const row = rows[name] || (rows[name] = { calls: 0, totalMs: 0, selfMs: 0, samples: ring(4096) })
          row.calls++; row.totalMs += elapsed; row.selfMs += Math.max(0, elapsed - node.children); row.samples.push(elapsed)
          if (frame) frame.methods[name] = (frame.methods[name] || 0) + elapsed
          if (!parent) roots.push({ method: name, startMs: began - startedAt, durationMs: elapsed, selfMs: Math.max(0, elapsed - node.children) })
          if (ownFrame) { frame.durationMs = elapsed; options.afterFrame?.(frame); frames.push(frame) }
        } catch (_) { warn('A timing sample could not be stored') }
        finally { if (ownFrame) frame = null }
      }
    }
    try {
      Object.defineProperty(game, name, { configurable: true, writable: true, enumerable: descriptor?.enumerable || false, value: wrapped })
      patches.push({ name, original, descriptor, wrapped })
    } catch (_) { warn('Method unavailable for instrumentation: ' + name) }
  }

  return {
    start() {
      if (used) throw new Error('Recorder already used')
      used = true; startedAt = now(); active = true
      for (const name of METHODS) install(name)
      if (!patches.some(p => p.name === 'renderloop')) { this.stop(); throw new Error('Game renderloop unavailable') }
      marker('capture-start')
    },
    addEvent(type, start, duration = 0) { if (active) events.push({ type, startMs: start - startedAt, durationMs: duration }) },
    stop() {
      if (!active) return
      active = false; stoppedAt = now(); marker('capture-stop')
      for (const p of patches.splice(0).reverse()) {
        if (game[p.name] !== p.wrapped) { warn('Another wrapper replaced ' + p.name + '; retained inert probe under that wrapper until reload'); continue }
        if (p.descriptor) Object.defineProperty(game, p.name, p.descriptor)
        else delete game[p.name]
      }
    },
    report() {
      if (active) throw new Error('Stop sampling before exporting')
      const captured = frames.values(), groups = Object.create(null)
      for (const [index, f] of captured.entries()) {
        const s = f.scene
        // A frame interval spans TWO entries; exclude transitions and interrupted frames.
        const prev = index > 0 ? captured[index - 1] : null
        const controls = scene => { const { entities, ...rest } = scene; return rest }
        const stable = prev && JSON.stringify(controls(prev.scene)) === JSON.stringify(controls(s)) && prev.observedView === f.observedView
        const interrupted = scene => scene.hidden || scene.focused === false || scene.menuOpen || scene.halt || scene.resizing || scene.settling || scene.ablationSettling || scene.ablationActive === false || scene.placementDetailed || scene.placementSettling || scene.placementActive === false
        const invalid = interrupted(s) || !prev || interrupted(prev.scene) || !stable
        f.comparable = !invalid
        f.strictlyComparable = f.comparable && JSON.stringify(prev.scene) === JSON.stringify(s)
        const key = [f.observedView, s.alt ? 'alt' : '', s.item ? 'item=' + s.itemType : '', s.relocate ? 'relocate' : '', s.erase ? 'erase' : '', s.touch ? 'touch' : '', s.width + 'x' + s.height, 'dpr=' + s.dpr, 'zoom=' + s.zoom, 'plane=' + s.plane, 'camera=' + s.cameraX + ',' + s.cameraY, 'ablation=' + (s.ablationPhase || 'off'), ...(s.placementPhase ? ['placement=' + s.placementPhase, 'sample=' + (s.placementDetailed ? 'detail' : s.placementRaw ? 'raw' : 'timed')] : [])].join('|')
        const g = groups[key] || (groups[key] = { key, frames: 0, excluded: 0, strictFrames: 0, entitiesMin: Infinity, entitiesMax: -Infinity, gaps: [], cpu: [] })
        g.frames++
        if (f.strictlyComparable) g.strictFrames++
        if (Number.isFinite(s.entities)) { g.entitiesMin = Math.min(g.entitiesMin, s.entities); g.entitiesMax = Math.max(g.entitiesMax, s.entities) }
        if (invalid) g.excluded++; else { g.gaps.push(f.gapMs); g.cpu.push(f.durationMs) }
      }
      return {
        schemaVersion: 1, comparisonPolicy: 'stable-controls-entity-count-range-v2', startedAtPerformanceMs: startedAt, durationMs: stoppedAt - startedAt,
        frameCount: captured.length, dropped: { frames: frames.dropped, roots: roots.dropped, events: events.dropped },
        methods: Object.entries(rows).map(([method, r]) => ({ method, calls: r.calls, totalInclusiveMs: r.totalMs, selfMeasuredMs: r.selfMs, ...distribution(r.samples.values()), droppedSamples: r.samples.dropped })),
        groups: Object.values(groups).map(g => ({ key: g.key, frames: g.frames, excluded: g.excluded, strictFrames: g.strictFrames,
          entitiesMin: Number.isFinite(g.entitiesMin) ? g.entitiesMin : null, entitiesMax: Number.isFinite(g.entitiesMax) ? g.entitiesMax : null,
          frameInterval: distribution(g.gaps), renderCall: distribution(g.cpu) })),
        frames: captured, roots: roots.values(), events: events.values(), warnings,
        limitations: [
          'Synchronous elapsed wall time includes native calls and waits; it is not CPU utilization or GPU hardware time.',
          'Methods include the active mod wrapper chain. Inclusive rows overlap; self time subtracts only measured child methods.',
          'Frame intervals are renderloop callback intervals, not display presentation timestamps. Never subtract script duration to infer GPU time.',
          'Transitions, resizing, focus loss, hidden pages and open menus are excluded from comparable group statistics.',
          'Comparable groups allow dynamic entity counts; count ranges and strictlyComparable samples are retained. This is not a frozen-world benchmark.',
          'No individual entity timings, Canvas call interception, pixel readback, save or chat export.'
        ]
      }
    }
  }
}

function createOriginCapture(options) {
  const { window: win, game, invoke } = options
  const now = () => win.performance.now()
  const { createOriginObserver } = require('./clear-view-origin')
  let phase = 'recording', session = null, timer = null, ready = false, pending = null, finishing = null, readySent = false
  let lastResult = null, startError = null
  const notify = message => options.notify?.(message)
  const change = () => options.onChange?.()
  const laterFinish = reason => { void Promise.resolve().then(() => finish(reason)).catch(() => {}) }
  const origin = createOriginObserver({ game, now, contextPrototype: win.CanvasRenderingContext2D?.prototype, onChanged: () => laterFinish('another-load'), onError: name => laterFinish('exception-' + name) })
  const recorder = createRecorder({ game, now, snapshot: options.snapshot, onFrameError: () => laterFinish('frame-exception') })
  function clean(reason) {
    win.clearTimeout(timer); timer = null
    try { recorder.stop() } finally { origin.stop(reason) }
  }
  function report(reason) {
    if (pending) return pending
    const measured = recorder.report()
    pending = { ...measured, origin: origin.report(), metadata: options.metadata?.() || {}, stopReason: reason,
      rendererTimeOrigin: win.performance.timeOrigin,
      limitations: measured.limitations.filter(x => !x.includes('Canvas call interception')).concat([
        'Startup origin mode observes Canvas lineCap setters and bounded call stacks; no pixel readback, complete save or chat export.' ]) }
    return pending
  }
  function sendReady() {
    if (!ready || !session || readySent || phase !== 'recording') return
    readySent = true
    void invoke('origin-ready', { id: session.id }).catch(error => { notify('启动观测计时同步失败，将保存已有记录：' + error.message); laterFinish('ready-sync-failed') })
  }
  // Hooks are installed synchronously before asking the main process for metadata.
  // Slow IPC/GPU information never postpones the first observed resource update.
  try { origin.start(); recorder.start() } catch (error) { clean('install-failed'); throw error }
  timer = win.setTimeout(() => laterFinish('load-timeout'), 120000)
  const startup = invoke('start', { mode: 'origin', seconds: 30 }).then(result => {
    session = result; sendReady(); return result
  }, error => {
    startError = error; clean('start-failed'); report('start-failed'); phase = 'export-failed'
    notify('启动观测已停止，主进程未能开始记录：' + error.message); change(); return null
  })
  async function finish(reason = 'manual') {
    if (finishing) return finishing
    if (phase === 'idle') return lastResult
    clean(reason); report(reason); phase = 'exporting'; change()
    finishing = (async () => {
      try {
        await startup
        if (!session) {
          pending.warnings.push('Main-process session was unavailable at capture start; export metadata was collected later: ' + String(startError?.message || 'unknown').slice(0, 200))
          session = await invoke('start', { mode: 'origin', seconds: 30 })
        }
        lastResult = await invoke('finish', { id: session.id, report: pending })
        phase = 'idle'; notify('启动来源记录已保存：' + lastResult.directory)
        return lastResult
      } catch (error) { phase = 'export-failed'; notify('启动记录导出失败，可重试“停止并导出”：' + error.message); throw error }
      finally { finishing = null; change() }
    })()
    return finishing
  }
  return {
    status: () => ({ phase, mode: 'origin', lastResult }),
    gridEntry: g => origin.gridEntry(g),
    ready(g) {
      if (phase !== 'recording' || ready || g !== game) return
      ready = true; origin.ready(); win.clearTimeout(timer)
      timer = win.setTimeout(() => laterFinish('duration'), 30000); sendReady()
      notify('启动来源正在记录：普通视图约 5 秒 → Alt 约 5 秒 → 松开；30 秒后自动导出。')
    },
    deadline(id) { if (session?.id === id) laterFinish('main-deadline') },
    dispose() { clean('navigation'); phase = 'idle' },
    finish
  }
}

function createClient(options) {
  const { window: win, document: doc, ipc, getGame } = options
  let phase = 'idle', mode = '', recorder = null, session = null, timer = null, countdown = null
  let observer = null, resizedAt = -Infinity, captureAt = 0, lastResult = null, pendingReport = null, stopPromise = null
  let ablation = null, placement = null, startCancelled = false, originCapture = null
  const originBusy = () => originCapture && originCapture.status().phase !== 'idle'
  const isGrid = () => mode === 'grid-ablation' || mode === 'grid-threshold'
  const isPlacement = () => mode.startsWith('placement-')
  const isComparison = () => mode === 'ablation' || isGrid() || mode === 'placement-ablation'
  const notify = message => options.notify?.(message)
  const invoke = async (action, payload = {}) => {
    const response = await ipc.invoke(CHANNEL, { action, ...payload })
    if (!response?.ok) throw new Error(response?.error || '探针通信失败，请完整重启游戏。')
    return response.result
  }
  const change = () => options.onChange?.()
  const resize = () => { resizedAt = win.performance.now() }
  const marker = label => {
    if (mode !== 'deep' && mode !== 'placement-deep') return
    const name = 'SFProbe:' + label
    try { win.performance.mark(name); win.performance.clearMarks(name) } catch (_) {}
  }
  const scheduleFinish = reason => { void Promise.resolve().then(() => finish(reason)).catch(() => {}) }
  const interrupted = event => {
    if (isPlacement()) {
      if (event.type === 'keyup') return
      if (event.type === 'visibilitychange' && !doc.hidden) return
      placement?.abort(event.type); return
    }
    if (!isComparison()) return
    if (event.type === 'keyup' && event.key !== 'Alt') return
    if (event.type === 'visibilitychange' && !doc.hidden) return
    ablation?.abort(event.type === 'keyup' ? 'alt-released' : event.type)
  }
  function clean(reason = 'cancelled') {
    if (timer) win.clearTimeout(timer)
    if (countdown) win.clearTimeout(countdown)
    timer = countdown = null
    observer?.disconnect(); observer = null
    win.removeEventListener('resize', resize)
    for (const event of ['blur', 'keyup', 'resize']) win.removeEventListener(event, interrupted)
    doc.removeEventListener('visibilitychange', interrupted)
    win.removeEventListener('modloader:config-preview', interrupted)
    win.removeEventListener('modloader:config-changed', interrupted)
    // Deactivate interventions even if a changed descriptor prevents unwrapping.
    try { recorder?.stop() }
    finally { ablation?.stop(reason); placement?.stop(reason) }
  }
  function baseScene() {
    const g = getGame()
    return {
      width: g.canvas?.width, height: g.canvas?.height, windowWidth: win.innerWidth, windowHeight: win.innerHeight,
      dpr: win.devicePixelRatio, gamePixelRatio: g.pixelRatio, zoom: g.zoom, unit: g.unit, plane: g.plane,
      cameraX: g.translation?.[0], cameraY: g.translation?.[1], itemType: String(g.itemInHand?.name || '').slice(0, 64),
      ...(isGrid() || isPlacement() ? { projectionPitch: g.__cattailDynamicCameraState?.pitch ?? null, projectionYaw: g.__cattailDynamicCameraState?.yaw ?? null } : {}),
      ...(isPlacement() ? { hoveredX: g.hoveredCell?.[0] ?? null, hoveredY: g.hoveredCell?.[1] ?? null, interactionMode: g.interactionMode || null,
        configSignature: JSON.stringify(options.placementConfiguration?.() || {}) } : {}),
      entities: g.stuff?.length || 0, alt: !!g.altActive, item: !!g.itemInHand, transported: !!g.transportedEntity, hovered: !!g.hoveredCell,
      relocate: g.interactionMode === 'relocate', erase: g.interactionMode === 'erase', touch: !!g.touchMode,
      halt: !!g.halt, hidden: doc.hidden, focused: doc.hasFocus(), menuOpen: !!options.isMenuOpen?.(),
      resizing: win.performance.now() - resizedAt < 500, settling: win.performance.now() - captureAt < 2500
    }
  }
  function scene() { return { ...baseScene(), ...(ablation?.state() || {}), ...(placement?.state() || {}) } }
  function diagnosticText(value, limit = 500) {
    try { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) } catch (_) { return 'Unavailable' }
  }
  function startupError(value) {
    try { return { name: diagnosticText(value?.name || 'Error', 64), message: diagnosticText(value?.message || value) } }
    catch (_) { return { name: 'Error', message: '错误信息不可读' } }
  }
  function startupDiagnostic(stage, error) {
    const result = { schemaVersion: 1, stage, cancelled: startCancelled, error: startupError(error) }
    // Read only a fixed diagnostic allowlist, never the full scene/config/save.
    try {
      const g = getGame(), number = value => Number.isFinite(value) ? value : null
      result.scene = {
        zoom: number(g?.zoom), unit: number(g?.unit), plane: number(g?.plane),
        width: number(g?.canvas?.width), height: number(g?.canvas?.height),
        projectionPitch: number(g?.__cattailDynamicCameraState?.pitch), projectionYaw: number(g?.__cattailDynamicCameraState?.yaw),
        item: !!g?.itemInHand, itemType: diagnosticText(g?.itemInHand?.name, 64),
        hovered: !!g?.hoveredCell, hoveredX: number(g?.hoveredCell?.[0]), hoveredY: number(g?.hoveredCell?.[1]),
        transported: !!g?.transportedEntity, interactionMode: diagnosticText(g?.interactionMode, 32),
        touch: !!g?.touchMode, mobile: !!g?.isMobile, halt: !!g?.halt,
        hidden: !!doc.hidden, focused: !!doc.hasFocus(), menuOpen: !!options.isMenuOpen?.()
      }
    } catch (_) { result.sceneUnavailable = true }
    if (isPlacement()) {
      try {
        const config = options.placementConfiguration?.() || {}
        result.configuration = Object.fromEntries(['enablePlacementShadowTraversalReuse', 'disableClearViewGrid', 'useTweaksClearViewGridStyle', 'disableClearViewBuildingClipping'].map(key => [key, typeof config[key] === 'boolean' ? config[key] : null]))
        // The existing main-process schema keeps three structured booleans.
        // Preserve this new state in its already bounded error-text field too.
        if (typeof config.enablePlacementShadowTraversalReuse === 'boolean') result.error.message = diagnosticText('[enablePlacementShadowTraversalReuse=' + config.enablePlacementShadowTraversalReuse + '] ' + result.error.message)
      } catch (_) { result.configurationUnavailable = true }
      try {
        const capabilities = options.getPlacementController?.()?.describe() || {}
        result.capabilities = Object.fromEntries(['renderGrid', 'renderEntitiesAbstract'].map(name => [name, {
          supported: capabilities[name]?.supported === true,
          sha256: /^[a-f0-9]{64}$/.test(capabilities[name]?.sha256) ? capabilities[name].sha256 : null
        }]))
      } catch (_) { result.capabilitiesUnavailable = true }
    }
    return result
  }
  async function finish(reason = 'manual') {
    if (originBusy()) return originCapture.finish(reason)
    if (stopPromise) return stopPromise
    if (phase === 'arming') { clean(); phase = 'idle'; change(); notify('已取消采集。'); return }
    if (phase === 'starting' || phase === 'cancelling') { startCancelled = true; phase = 'cancelling'; change(); return }
    if (!session) return
    phase = 'exporting'; clean(reason); change()
    pendingReport ||= { ...recorder.report(), metadata: options.metadata?.() || {}, stopReason: reason, rendererTimeOrigin: win.performance.timeOrigin,
      ...(ablation ? { ablation: ablation.report() } : {}), ...(placement ? { placement: placement.report() } : {}) }
    stopPromise = (async () => {
      try {
        lastResult = await invoke('finish', { id: session.id, report: pendingReport })
        const endedEarly = pendingReport.ablation && !pendingReport.ablation.completed || pendingReport.placement && !pendingReport.placement.completed
        phase = 'idle'; session = null; pendingReport = null
        notify((endedEarly ? '采集提前结束，已恢复原样并保存已有记录：' : isComparison() ? '对照结束，已恢复原样。记录：' : lastResult.traceStatus === 'failed' ? '计时已保存，但底层追踪失败，请查看报告并重启游戏：' : '探针记录已保存：') + lastResult.directory)
        return lastResult
      } catch (error) {
        phase = 'export-failed'; notify('导出失败，可点“停止并导出”重试：' + error.message); throw error
      } finally { stopPromise = null; change() }
    })()
    return stopPromise
  }
  ipc.on(CHANNEL + ':deadline', (_event, payload) => {
    originCapture?.deadline(payload?.id)
    if (session?.id === payload?.id) void finish('main-deadline').catch(() => {})
  })
  win.addEventListener('beforeunload', () => { startCancelled = true; clean('navigation'); originCapture?.dispose() })
  return {
    status() { return originBusy() ? originCapture.status() : { phase, mode, lastResult: mode === 'origin' ? originCapture?.status().lastResult : lastResult } },
    observeGrid(game) { originCapture?.gridEntry(game) },
    gameReady(game) { originCapture?.ready(game) },
    async armOrigin() {
      if (phase !== 'idle' || originBusy()) throw new Error('请先停止并导出当前记录。')
      await invoke('arm-origin'); notify('已预备下次启动来源记录。请完整退出并重启游戏；只生效一次，24 小时后过期。')
    },
    async cancelOrigin() { await invoke('cancel-origin'); notify('已取消下次启动记录。') },
    startOrigin(game) {
      if (phase !== 'idle' || originBusy()) throw new Error('已有采集正在运行。')
      mode = 'origin'; captureAt = win.performance.now(); resizedAt = -Infinity
      originCapture = createOriginCapture({ window: win, game, invoke, snapshot: baseScene, metadata: options.metadata, notify, onChange: change })
      change()
    },
    skipGrid(game, original) { return ablation?.skipGrid?.(game, original) || false },
    interceptGrid(game, original, args) { return ablation?.interceptGrid?.(game, original, args) || false },
    start(nextMode) {
      if (phase !== 'idle' || originBusy()) throw new Error('已有采集或待导出的记录，请先停止并导出。')
      if (!getGame()?.canvas) throw new Error('请先进入需要测试的游戏场景。')
      mode = ['grid-threshold', 'grid-ablation', 'ablation', 'deep', 'placement-light', 'placement-deep', 'placement-ablation'].includes(nextMode) ? nextMode : 'light'
      recorder = null; ablation = null; placement = null; pendingReport = null; startCancelled = false; lastResult = null
      phase = 'arming'; change()
      options.closeMenu?.()
      const seconds = mode === 'grid-threshold' ? 96 : mode === 'grid-ablation' ? 72 : mode === 'ablation' || mode === 'placement-ablation' ? 60 : 20
      notify(isPlacement() ? isComparison() ? '3秒后开始放置分项对照：保持手持建筑、目标格和镜头不动，不点击放置；60秒后恢复。' : '3秒后观察20秒：可比较普通、Alt与手持建筑；不点击放置，保持游戏前台。' : isComparison() ? `3 秒后开始自动对照：现在按住 Alt，保持窗口和镜头不动，约 ${seconds} 秒后自动恢复。松开 Alt 可提前结束。` : '3 秒后采集 20 秒：普通 5 秒 → Alt 5 秒 → 松开恢复。')
      countdown = win.setTimeout(async () => {
        countdown = null; phase = 'starting'; change()
        let startupStage = 'main-start'
        try {
          session = await invoke('start', { mode, seconds })
          if (startCancelled) throw new Error('已取消启动。')
          startupStage = 'protocol-check'
          if (isComparison() && session.seconds !== seconds) throw new Error(`主进程尚未支持 ${seconds} 秒对照，请完整退出并重启游戏。`)
          const game = getGame()
          resizedAt = -Infinity
          captureAt = win.performance.now()
          if (isPlacement()) {
            startupStage = 'placement-module'
            const module = require('./placement-probe')
            startupStage = 'placement-setup'
            placement = module.createPlacementCapture({ game, controller: options.getPlacementController?.(), comparison: isComparison(),
              now: () => win.performance.now(), snapshot: baseScene, isCurrent: () => getGame() === game,
              onAbort: why => scheduleFinish('placement-' + why), onComplete: () => scheduleFinish('duration'),
              onPhase: (entry, index) => notify(`采集中，第${index + 1}/5组：${entry.label}。保持手持建筑、目标格和镜头不动。`) })
            startupStage = 'placement-start'
            placement.start()
            for (const event of ['blur', 'resize', 'modloader:config-preview', 'modloader:config-changed']) win.addEventListener(event, interrupted)
            doc.addEventListener('visibilitychange', interrupted)
          } else if (isComparison()) {
            startupStage = 'comparison-start'
            const module = require(isGrid() ? './clear-view-grid' : './clear-view-ablation')
            const create = mode === 'grid-threshold' ? module.createGridThreshold : module.createGridAblation || module.createAblation
            const phases = mode === 'grid-threshold' ? module.THRESHOLD_PHASES : module.PHASES
            ablation = create({ game, now: () => win.performance.now(), snapshot: baseScene, getNativeGrid: options.getNativeGrid, isCurrent: () => getGame() === game,
              onAbort: why => scheduleFinish('ablation-' + why), onComplete: () => scheduleFinish('duration'),
              onPhase: (entry, index) => notify(`自动对照 ${index + 1}/${phases.length}：${entry.label}。请继续按住 Alt，保持镜头不动。`) })
            ablation.start()
            for (const event of ['blur', 'keyup', 'resize']) win.addEventListener(event, interrupted)
            doc.addEventListener('visibilitychange', interrupted)
          }
          startupStage = 'recorder-start'
          recorder = createRecorder({ game, now: () => win.performance.now(), snapshot: scene, marker, ablation: isComparison(),
            beforeFrame: () => { ablation?.beforeFrame(); placement?.beforeFrame() },
            afterFrame: frame => { if (placement) frame.placement = placement.afterFrame(frame) },
            onFrameError: () => { ablation?.abort('frame-exception'); placement?.abort('frame-exception') } })
          win.addEventListener('resize', resize)
          recorder.start()
          startupStage = 'observer-start'
          if (win.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
            observer = new win.PerformanceObserver(list => { for (const e of list.getEntries()) recorder?.addEvent('longtask', e.startTime, e.duration) })
            observer.observe({ type: 'longtask' })
          }
          phase = 'recording'; change()
          if (mode === 'placement-ablation') notify('已开始采集，第1/5组：原样。保持手持建筑、目标格和镜头不动；60秒后恢复并导出。')
          else if (!isComparison()) notify('已开始采集；20 秒后自动停止并导出。')
          timer = win.setTimeout(() => { void finish('duration').catch(() => {}) }, seconds * 1000)
        } catch (error) {
          const diagnostic = startupDiagnostic(startupStage, error)
          try { clean('startup-failed') } catch (cleanupError) { diagnostic.cleanupError = startupError(cleanupError) }
          let exportError = null
          if (session) {
            try { lastResult = await invoke('abort', { id: session.id, startup: diagnostic }) }
            catch (failure) { exportError = startupError(failure).message }
          }
          session = null; phase = 'idle'
          notify((diagnostic.cancelled ? '未开始采集：启动期间已取消。' : '未开始采集：' + diagnostic.error.message + '。') +
            (lastResult?.directory ? '诊断已保存：' + lastResult.directory : '启动诊断未保存' + (exportError ? '：' + exportError : '（主进程未返回采集会话）') + '。'))
          change()
        }
      }, 3000)
    },
    finish,
    async openFolder() { return invoke('open-folder') }
  }
}

module.exports = { CHANNEL, METHODS, createRecorder, createClient, createOriginCapture, distribution }
