'use strict'

// Manual renderer-console helper. Not loaded by the Loader or any manifest.
module.exports = function startNativeExplosionTest(win) {
  const game = win.DEBUG
  const api = win.CattailTweaksResourceExplosionBezierFastPath
  const key = 'enableResourceExplosionBezierFastPath'
  const modId = 'Cattail_TweaksQuality_Tweaks'
  if (win.SFNativeExplosionTest?.active) throw new Error('对照已启动；fireAfter() 倒计时触发，F9 恢复。')
  if (game?.version !== '1.3' || !game.ctx || !Array.isArray(game.vfx)) throw new Error('请先进入桌面版 1.3 的存档。')
  if (!api?.stats || typeof api.stats().enabled !== 'boolean') throw new Error('未找到 Tweaks 爆炸优化的临时开关。')
  if (win.__cattailClearViewGridFixInstalled) throw new Error('请先关闭“清晰视图网格卡顿修复”并完整重启，再做对照。')
  if (win.cattailResourceSourceProfiler?.isEnabled?.()) throw new Error('Dynamic Details 资源分析器仍开启；请先执行 cattailResourceSourceProfiler.disable()。')
  const previousEnabled = api.stats().enabled
  const result = { protocol: 'manual-native-explosion-v2', previousEnabled, fired: false, nativePathConfirmed: false,
    warnings: [], note: '只生成特效；不扣除/添加资源。性能由玩家在固定窗口、镜头下观察，本脚本不测 FPS/GPU 耗时。' }
  let active = true, ownPreview = false, effect = null, effectRender = null, ownRender = null, originalDescriptor
  let testContext = null, beforeCap, width, height, timer, deadline, triggerTimer
  const now = () => win.performance.now()
  const preview = value => {
    ownPreview = true
    try { win.dispatchEvent(new win.CustomEvent('modloader:config-preview', { detail: { modId, key, value } })) }
    finally { ownPreview = false }
  }
  const snapshot = () => ({ width: game.canvas.width, height: game.canvas.height, zoom: game.zoom,
    camera: Array.isArray(game.translation) ? [...game.translation] : null, plane: game.plane, alt: !!game.altActive, cap: game.ctx.lineCap })
  function removeOurEffect() {
    if (!effect) return
    const index = game.vfx.indexOf(effect)
    if (index >= 0) game.vfx.splice(index, 1)
    if (effect.render === ownRender) {
      if (originalDescriptor) Object.defineProperty(effect, 'render', originalDescriptor)
      else delete effect.render
    }
  }
  function stop(reason = 'manual', restoreOptimization = true) {
    if (!active) return result
    active = false
    win.clearTimeout(timer); win.clearTimeout(deadline); win.clearTimeout(triggerTimer)
    win.removeEventListener('keydown', onKey, true)
    win.removeEventListener('pagehide', onPageHide)
    win.removeEventListener('modloader:config-preview', onPreview, true)
    if (win.DEBUG === game) result.sceneBeforeCleanup = snapshot()
    result.resourceProfilerEnabledAtEnd = !!win.cattailResourceSourceProfiler?.isEnabled?.()
    if (result.resourceProfilerEnabledAtEnd) result.warnings.push('资源分析器已开启，性能观察存在额外采样干扰。')
    if (result.beforeScene && result.sceneBeforeCleanup) {
      result.sceneChanged = ['width', 'height', 'zoom', 'camera', 'plane'].some(name =>
        JSON.stringify(result.beforeScene[name]) !== JSON.stringify(result.sceneBeforeCleanup[name]))
      if (result.sceneChanged) result.warnings.push('触发后窗口或镜头发生变化，不能作为固定场景性能对照。')
    }
    removeOurEffect()
    // Restore only the main context actually changed by our observed effect.
    // Never restore a whole save, resource array, VFX list or Canvas state stack.
    if (result.roundStack && beforeCap === 'butt' && win.DEBUG === game && testContext?.canvas === game.canvas &&
        testContext.canvas.width === width && testContext.canvas.height === height) {
      testContext.lineCap = beforeCap
      result.capRestored = testContext.lineCap === beforeCap
    }
    if (restoreOptimization) preview(previousEnabled)
    result.restoredEnabled = api.stats().enabled
    result.stopReason = reason
    result.finishedAtPerformanceMs = now()
    if (win.DEBUG === game) result.endScene = snapshot()
    try {
      const fs = require('fs'), path = require('path')
      const root = path.resolve(__dirname, '../state/performance-probes')
      fs.mkdirSync(root, { recursive: true })
      const prefix = new Date().toISOString().replace(/[:.]/g, '-') + '-manual-native-explosion-'
      const directory = fs.mkdtempSync(path.join(root, prefix))
      result.reportPath = path.join(directory, 'report.json')
      fs.writeFileSync(result.reportPath, JSON.stringify(result, null, 2), 'utf8')
    } catch (error) { result.warnings.push('诊断记录保存失败，结果仍在控制台：' + String(error)) }
    win.console.info('[原版爆炸对照结束]', JSON.parse(JSON.stringify(result)))
    return result
  }
  function onPreview(event) {
    if (!ownPreview && event.detail?.modId === modId && event.detail?.key === key) {
      // A newer user/menu choice wins over this helper's saved value.
      stop('optimization-setting-changed', false)
    }
  }
  function onPageHide() { stop('pagehide') }
  function fire() {
    if (!active || result.fired) throw new Error('本脚本只触发一次；请查看结果或 F9 恢复。')
    if (win.DEBUG !== game) { stop('game-changed'); throw new Error('已更换世界，对照已结束。') }
    if (game.halt || win.document.hidden || !win.document.hasFocus()) throw new Error('请关闭控制台、聚焦游戏并取消暂停，再重新安排倒计时。')
    if (game.plane !== 0 || !game.altActive) throw new Error('倒计时结束时须在普通位面按住 Alt。')
    if (win.cattailResourceSourceProfiler?.isEnabled?.()) { stop('resource-profiler-enabled'); throw new Error('资源分析器在等待期间被开启；本次未触发爆炸，请关闭它后重试。') }
    if (game.ctx?.canvas !== game.canvas || game.ctx.lineCap !== 'butt') throw new Error('主画布当前不是平端基线。请用正常的新鲜存档/完整重启后再试；脚本不会强行重置基线。')
    if (api.stats().enabled !== false) { stop('optimization-not-disabled'); throw new Error('优化未保持关闭，对照已结束。') }
    if (!Number.isFinite(game.unit) || game.unit <= 0) throw new Error('游戏画布尚未准备好。')
    win.clearTimeout(triggerTimer)
    result.fired = true
    result.triggeredAtPerformanceMs = now()
    result.beforeScene = snapshot()
    result.beforeStats = api.stats()
    const oldEffects = new Set(game.vfx), resources = JSON.stringify(game.resources)
    try {
      // This native factory only creates ResourceExplosion. The numbers specify
      // visible particles, not an inventory transaction or forced annihilation.
      game.createResourceExplosion([0, 0, 0, 0, 64, 0, 1], [game.w / 2, game.h / 2], [1])
      const added = game.vfx.filter(item => !oldEffects.has(item))
      if (added.length !== 1 || added[0]?.constructor?.name !== 'ResourceExplosion') throw new Error('爆炸入口未返回预期的单个 ResourceExplosion。')
      effect = added[0]
      result.resourcesUnchangedByCreation = JSON.stringify(game.resources) === resources
      if (!result.resourcesUnchangedByCreation) throw new Error('特效创建入口改变了库存，停止对照；未覆盖或回滚玩家资源。')
      originalDescriptor = Object.getOwnPropertyDescriptor(effect, 'render')
      effectRender = effect.render
      ownRender = function (...args) {
        if (!active || result.renderObserved) return effectRender.apply(this, args)
        result.renderObserved = true
        testContext = game.ctx
        beforeCap = testContext.lineCap
        width = testContext.canvas.width; height = testContext.canvas.height
        result.actualRender = { mainCanvas: testContext.canvas === game.canvas, beforeCap, width, height }
        if (beforeCap !== 'butt' || testContext.canvas !== game.canvas || api.stats().enabled !== false) {
          result.warnings.push('首次特效绘制前基线已变化，不能认定本次爆炸造成了主画布首次圆端。')
          stop('baseline-changed-before-render')
          return
        }
        const proto = win.CanvasRenderingContext2D.prototype
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'lineCap')
        if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) {
          stop('linecap-observation-unavailable'); return
        }
        let setter
        try {
          setter = function (value) {
            descriptor.set.call(this, value)
            if (this === testContext && !result.roundStack && descriptor.get.call(this) === 'round') {
              result.roundStack = String(new win.Error().stack || '')
              result.roundAtPerformanceMs = now()
            }
          }
          Object.defineProperty(proto, 'lineCap', { ...descriptor, set: setter })
          const returned = effectRender.apply(this, args)
          result.actualRender.afterCap = testContext.lineCap
          result.afterStats = api.stats()
          const delta = result.afterStats.directRenderCalls - result.beforeStats.directRenderCalls
          result.directRenderCallsDelta = delta
          result.nativePathConfirmed = /ResourceExplosion\.render[^\n]*scripts[\\/]game\.js/.test(result.roundStack || '') &&
            testContext.lineCap === 'round' && delta === 0 && result.afterStats.enabled === false
          win.console.info('[首次爆炸绘制]', JSON.parse(JSON.stringify(result)))
          return returned
        } catch (error) {
          result.warnings.push(String(error)); stop('render-error'); throw error
        } finally {
          const current = Object.getOwnPropertyDescriptor(proto, 'lineCap')
          if (current?.set === setter) Object.defineProperty(proto, 'lineCap', descriptor)
          else result.warnings.push('后续 Canvas 包装已保留，未覆盖。')
        }
      }
      Object.defineProperty(effect, 'render', { configurable: true, writable: true, value: ownRender })
      timer = win.setTimeout(() => stop('20-seconds-after-trigger'), 20000)
      win.console.info('[原版爆炸对照] 已创建一次爆炸。保持 Alt 和镜头，F9 可提前恢复；20 秒后自动恢复。')
    } catch (error) { result.warnings.push(String(error)); stop('create-error'); throw error }
    return result
  }
  function fireAfter(delayMs = 8000) {
    if (!active || result.fired) throw new Error('本次对照已结束或已触发。')
    if (!Number.isFinite(delayMs) || delayMs < 1000 || delayMs > 15000) throw new Error('倒计时应为 1000–15000 毫秒。')
    win.clearTimeout(triggerTimer)
    result.triggerDelayMs = delayMs
    triggerTimer = win.setTimeout(() => {
      try { fire() }
      catch (error) { result.warnings.push(String(error)); stop('countdown-trigger-rejected'); win.console.warn('[原版爆炸对照]', error.message) }
    }, delayMs)
    win.console.info('[原版爆炸对照] ' + delayMs / 1000 + ' 秒后触发。现在关闭控制台，回到游戏并按住 Alt；不要按 F8。')
    return controller
  }
  function onKey(event) {
    if (event.repeat || event.code !== 'F9') return
    event.preventDefault(); event.stopImmediatePropagation()
    try { stop('F9') }
    catch (error) { win.console.warn('[原版爆炸对照]', error.message) }
  }
  const controller = { get active() { return active }, fire, fireAfter, stop, result: () => JSON.parse(JSON.stringify(result)) }
  try {
    preview(false)
    if (api.stats().enabled !== false) throw new Error('临时关闭优化失败。')
    win.addEventListener('keydown', onKey, true)
    win.addEventListener('pagehide', onPageHide)
    win.addEventListener('modloader:config-preview', onPreview, true)
    deadline = win.setTimeout(() => stop('60-second-safety-timeout'), 60000)
    win.SFNativeExplosionTest = controller
    win.console.info('[原版爆炸对照] 优化已临时关闭。调用 fireAfter() 后关闭控制台并按住 Alt，倒计时触发一次；F9 恢复。60 秒内未完成也自动恢复。')
    return controller
  } catch (error) { stop('start-error'); throw error }
}
