ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const I18N_KEY = Symbol.for('cattail.world-editor.i18n')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const CARD_ID = 'cattail-world-editor-preview-card'
		const STYLE_ID = 'cattail-world-editor-preview-style'
		const SELECTION_CARD_ID = 'cattail-world-editor-selection-card'
		const BLUEPRINT_CARD_ID = 'cattail-world-editor-blueprint-card'
		const RENDER_LAYER_ID = 'world-editor-blueprint-preview'
		const RENDER_CALLBACK_ID = 'world-editor-blueprint-preview'
		const FOLLOW_PLAN_IDLE_MS = 100
		const PENDING_PREVIEW_FILTER = 'saturate(.7)'
		const PENDING_PREVIEW_OPACITY = '.85'
		const PENDING_PREVIEW_TRANSITION = 'filter 80ms linear, opacity 80ms linear'
		const INTEGRITY_INTERVAL_MS = 500
		const WARNING_VISIBLE_MS = 3000
		const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
		const COLORS = Object.freeze({
			buildable: {
				tint: '#09D35066',
				stroke: '#2BE888',
				fill: 'rgba(9, 211, 80, .10)',
				symbol: 'check'
			},
			satisfied: {
				tint: '#F2C94C66',
				stroke: '#F2C94C',
				fill: 'rgba(242, 201, 76, .10)',
				symbol: 'equal'
			},
			conflict: {
				tint: '#EC4A4A77',
				stroke: '#FF6868',
				fill: 'rgba(236, 74, 74, .12)',
				symbol: 'warning'
			},
			blocked: {
				tint: '#9B6CFF88',
				stroke: '#B38CFF',
				fill: 'rgba(155, 108, 255, .14)',
				symbol: 'blocked'
			}
		})
		let refreshMountedText = null

		api.on('afterWords', function (words, game) {
			if (typeof refreshMountedText === 'function') refreshMountedText(game)
		})

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const i18n = globalThis[I18N_KEY]
			const session = globalThis[BLUEPRINT_KEY]
			const planner = globalThis[PLAN_KEY]
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.snapshot !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the selection state.')
				return
			}
			if (!i18n || typeof i18n.t !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find editor translations.')
				return
			}
			if (!session || session.game !== game || typeof session.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the blueprint session.')
				return
			}
			if (!planner || typeof planner.build !== 'function' || typeof planner.verify !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the preview planner.')
				return
			}
			if (!canvas || typeof canvas.addEventListener !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B requires the game canvas.')
				return
			}
			if (
				!api.render ||
				typeof api.render.onLayer !== 'function' ||
				typeof api.render.onFrame !== 'function' ||
				typeof api.render.registerLayer !== 'function' ||
				typeof api.render.markDirty !== 'function'
			) {
				console.warn('[Cattail World Editor] Blueprint preview 3B requires cached Render API v1 layers.')
				return
			}

			const previous = globalThis[PREVIEW_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('preview-replaced')

			let currentRuntime = runtime.snapshot()
			let currentSession = session.snapshot()
			let active = false
			let pinned = false
			let paused = false
			let target = null
			let blueprint = null
			let plan = null
			let calculating = false
			let warning = null
			let warningTimer = null
			let selectedCost = 'safe'
			let planToken = 0
			let planRetry = 0
			let planRevision = 0
			let revision = 0
			let disposed = false
			let handledAttemptId = Number(currentSession?.attemptId) || 0
			let integrityTimer = null
			let followPlanTimer = null
			let pendingFollowPlan = null
			let ui = null
			let uiRefreshPending = false
			let textRevision = 0
			let renderedResourceKey = null
			let gameHudHidden = false
			let vanillaHudHidden = false
			let renderFallbacks = new Set()
			let orderedRecords = []
			let renderViewSignature = null
			let renderLayerCanvas = null
			let visualFollowSignature = null
			const instances = new Map()
			const listeners = new Set()
			const metrics = {
				targetChanges: 0,
				followSchedules: 0,
				planRequests: 0,
				planCompletions: 0,
				planCancellations: 0,
				layerDirtyMarks: 0,
				layerRedraws: 0,
				visualFollowUpdates: 0,
				uiRefreshes: 0,
				resourceRebuilds: 0
			}

			const controller = Object.freeze({
				version: '0.3.1',
				game,
				snapshot,
				exit,
				setPinned(next, reason) {
					return setPinned(!!next, reason || 'api')
				},
				async benchmark(options) {
					const settings = options || {}
					const planning = await planner.benchmark(settings)
					const rendering = await benchmarkRendering(settings)
					const result = {
						version: '0.3.1',
						planning,
						rendering,
						runtime: performanceSnapshot()
					}
					console.info('[Cattail World Editor] Blueprint preview benchmark complete.', result)
					return result
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor preview listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				dispose(reason) {
					if (disposed) return false
					exit(reason || 'disposed')
					disposed = true
					clearWarning()
					clearIntegrityTimer()
					clearFollowPlan()
					listeners.clear()
					if (globalThis[PREVIEW_KEY] === controller) delete globalThis[PREVIEW_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, PREVIEW_KEY, {
				value: controller,
				configurable: true,
				writable: true
			})

			if (canMountUi()) {
				gameHudHidden = !!api.ui?.hud?.isHidden?.()
				vanillaHudHidden = !!api.ui?.isVanillaGameHudHidden?.(game)
				ui = mountUi()
			}

			const stopRenderLayer = api.render.registerLayer(RENDER_LAYER_ID, {
				order: 39,
				zIndex: 39,
				cache: true,
				clearEachFrame: false
			})
			const stopRendering = api.render.onLayer(RENDER_LAYER_ID, function (context) {
				renderPreview(context?.game || game, context?.ctx)
			}, {
				id: RENDER_CALLBACK_ID,
				order: 0,
				space: 'screen',
				enabled(context) {
					return shouldRender(context?.game || game)
				}
			})
			const stopRenderFrame = api.render.onFrame(function (context) {
				syncPlane()
				syncFollowingTarget()
				syncRenderView(context?.game || game)
				syncVisualFollow(context?.game || game)
				if (!flushUiRefresh()) syncCardPosition(context?.game || game)
			})

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state.active) exit('editor-inactive')
				requestUiRefresh(true)
			})
			const stopSessionSubscription = session.subscribe(function (state) {
				const previousBlueprint = currentSession?.blueprint
				currentSession = state
				if (!state.blueprint && !state.lastResult) {
					exit('blueprint-cleared')
					clearWarning()
					return
				}
				const result = state.lastResult
				const attemptId = Number(result?.attemptId) || 0
				if (result?.status === 'captured' && attemptId > handledAttemptId && state.blueprint !== previousBlueprint) {
					handledAttemptId = attemptId
					if (state.blueprint?.mode === 'structure') {
						enter(state.blueprint, 'structure-captured')
					} else {
						exit('full-blueprint-captured')
						showWarning('full-unavailable', state.blueprint)
					}
				}
				requestUiRefresh(true)
			})

			const handleMouseMove = function (event) {
				if (!active || pinned || paused || !shouldOwnInput()) return
				if (Number(event?.buttons) & 2) return
				refreshHoveredCell(event)
				setTarget(game.hoveredCell, 'mouse-follow')
			}
			const handleMouseDown = function (event) {
				if (event?.button !== 0 || !active || paused || !shouldOwnInput() || isEditableEvent(event)) return
				refreshHoveredCell(event)
				if (pinned) {
					setPinned(false, 'map-unpin')
					setTarget(game.hoveredCell, 'map-unpin-follow')
				} else {
					setTarget(game.hoveredCell, 'map-pin-target')
					flushFollowPlan('map-pin-target')
					if (target) setPinned(true, 'map-pin')
				}
				consume(event)
			}
			const consumeLeft = function (event) {
				if (event?.button === 0 && active && !paused && shouldOwnInput()) consume(event)
			}
			const handleWindowBlur = function () {
				if (active && !pinned) exit('window-blur')
			}
			const handleGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				gameHudHidden = !!event?.detail?.hidden
				requestUiRefresh(true)
			}
			const handleVanillaGameHud = function (event) {
				if (event?.detail?.game && event.detail.game !== game) return
				vanillaHudHidden = !!event?.detail?.hidden
				requestUiRefresh(true)
			}

			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mouseup', consumeLeft, true)
			canvas.addEventListener('click', consumeLeft, true)
			canvas.addEventListener('dblclick', consumeLeft, true)
			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('blur', handleWindowBlur, true)
				window.addEventListener('modloader:game-hud', handleGameHud)
				window.addEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
			}

			refreshMountedText = function () {
				refreshText()
				requestUiRefresh(true)
			}
			refreshText()
			requestUiRefresh(true)
			scheduleIntegrityCheck()

			runtime.addCleanup(function () {
				if (refreshMountedText) refreshMountedText = null
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mouseup', consumeLeft, true)
				canvas.removeEventListener('click', consumeLeft, true)
				canvas.removeEventListener('dblclick', consumeLeft, true)
				if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
					window.removeEventListener('blur', handleWindowBlur, true)
					window.removeEventListener('modloader:game-hud', handleGameHud)
					window.removeEventListener('modloader:vanilla-game-hud', handleVanillaGameHud)
				}
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSessionSubscription === 'function') stopSessionSubscription()
				if (typeof stopRendering === 'function') stopRendering()
				if (typeof stopRenderLayer === 'function') stopRenderLayer()
				if (typeof stopRenderFrame === 'function') stopRenderFrame()
				if (ui) unmountUi()
				controller.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Read-only blueprint preview 3B ready.')

			function snapshot() {
				return Object.freeze({
					version: '0.3.1',
					active,
					pinned,
					paused,
					target: clonePosition(target),
					blueprint,
					plan,
					calculating,
					warning: warning?.code || null,
					selectedCost,
					renderFallbackCount: renderFallbacks.size,
					performance: performanceSnapshot(),
					revision,
					disposed
				})
			}

			function performanceSnapshot() {
				return Object.freeze({
					followPlanIdleMs: FOLLOW_PLAN_IDLE_MS,
					pendingFollowPlan: !!pendingFollowPlan,
					targetChanges: metrics.targetChanges,
					followSchedules: metrics.followSchedules,
					planRequests: metrics.planRequests,
					planCompletions: metrics.planCompletions,
					planCancellations: metrics.planCancellations,
					layerDirtyMarks: metrics.layerDirtyMarks,
					layerRedraws: metrics.layerRedraws,
					visualFollowUpdates: metrics.visualFollowUpdates,
					uiRefreshes: metrics.uiRefreshes,
					resourceRebuilds: metrics.resourceRebuilds
				})
			}

			function notify(immediateUi, refreshUiState) {
				revision += 1
				const state = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(state)
					} catch (error) {
						console.warn('[Cattail World Editor] Blueprint preview listener failed.', error)
					}
				}
				if (refreshUiState !== false) requestUiRefresh(immediateUi === true)
			}

			function enter(nextBlueprint, reason) {
				if (disposed || nextBlueprint?.mode !== 'structure' || !Array.isArray(nextBlueprint.entities)) return false
				clearWarning()
				clearFollowPlan()
				planToken += 1
				active = true
				pinned = false
				paused = Number(nextBlueprint.sourcePlane) !== (game.plane ? 1 : 0)
				target = null
				blueprint = nextBlueprint
				plan = null
				planRevision += 1
				calculating = false
				selectedCost = 'safe'
				renderFallbacks = new Set()
				orderedRecords = []
				renderViewSignature = null
				resetVisualFollow()
				renderedResourceKey = null
				instances.clear()
				if (!paused) setTarget(game.hoveredCell, reason || 'preview-entered')
				notify(true)
				return true
			}

			function exit(reason) {
				const changed = active || pinned || paused || target || plan || calculating
				clearFollowPlan()
				planToken += 1
				active = false
				pinned = false
				paused = false
				target = null
				blueprint = null
				plan = null
				planRevision += 1
				calculating = false
				planRetry = 0
				selectedCost = 'safe'
				renderFallbacks = new Set()
				orderedRecords = []
				renderViewSignature = null
				resetVisualFollow()
				renderedResourceKey = null
				instances.clear()
				if (changed) {
					notify(true)
					if (reason) console.info('[Cattail World Editor] Blueprint preview exited (' + reason + ').')
				}
				return changed
			}

			function setPinned(next, reason) {
				if (!active || paused || !target || pinned === next) return false
				if (next) flushFollowPlan('pin-target')
				pinned = next
				if (!pinned) syncFollowingTarget()
				notify(true)
				if (reason) console.info('[Cattail World Editor] Blueprint preview ' + (next ? 'pinned' : 'following') + ' (' + reason + ').')
				return true
			}

			function setTarget(value, reason) {
				const next = normalizePosition(value)
				if (!active || paused || pinned || !next || samePosition(next, target)) return false
				target = next
				metrics.targetChanges += 1
				planToken += 1
				const planReason = reason || 'target-changed'
				if (isFollowPlanReason(planReason)) scheduleFollowPlan(planReason, 1)
				else requestPlan(planReason, 1)
				notify(false, false)
				return true
			}

			function requestPlan(reason, retries) {
				if (!active || paused || !target || blueprint?.mode !== 'structure') return false
				clearFollowPlan()
				const token = ++planToken
				const requestTarget = target.slice()
				const requestBlueprint = blueprint
				planRetry = Math.max(0, Number(retries) || 0)
				calculating = true
				metrics.planRequests += 1
				requestUiRefresh()
				Promise.resolve().then(async function () {
					const candidate = await planner.build(game, requestBlueprint, requestTarget, {
						chunkSize: 512,
						isCancelled() {
							return disposed || token !== planToken || !active
						}
					})
					if (disposed || token !== planToken || !active) return
					if (!planner.verify(game, candidate.guard)) {
						if (planRetry > 0) {
							calculating = false
							requestPlan('world-changed-retry', planRetry - 1)
							return
						}
						throw previewError('world-changed')
					}
					plan = candidate
					planRevision += 1
					calculating = false
					planRetry = 0
					renderFallbacks = new Set()
					orderedRecords = candidate.records.slice().sort(compareProjectedDepth)
					renderViewSignature = createRenderViewSignature(game)
					rebuildInstances(candidate)
					metrics.planCompletions += 1
					markPreviewDirty()
					notify()
					if (reason && !isFollowPlanReason(reason)) {
						console.info('[Cattail World Editor] Blueprint preview planned (' + reason + ').')
					}
				}).catch(function (error) {
					if (disposed || token !== planToken || error?.code === 'plan-cancelled') {
						if (error?.code === 'plan-cancelled') metrics.planCancellations += 1
						return
					}
					calculating = false
					showWarning('plan-failed', blueprint, error)
					notify()
				})
				return true
			}

			function scheduleFollowPlan(reason, retries) {
				if (!active || paused || !target || blueprint?.mode !== 'structure') return false
				metrics.followSchedules += 1
				pendingFollowPlan = {
					reason: reason || 'mouse-follow',
					retries: Math.max(0, Number(retries) || 0)
				}
				const wasCalculating = calculating
				calculating = true
				if (!wasCalculating) requestUiRefresh()
				if (followPlanTimer !== null && typeof globalThis.clearTimeout === 'function') {
					globalThis.clearTimeout(followPlanTimer)
				}
				followPlanTimer = null
				if (typeof globalThis.setTimeout !== 'function') return flushFollowPlan()
				followPlanTimer = globalThis.setTimeout(function () {
					followPlanTimer = null
					flushFollowPlan()
				}, FOLLOW_PLAN_IDLE_MS)
				return true
			}

			function flushFollowPlan(reason) {
				if (!pendingFollowPlan) return false
				const pending = pendingFollowPlan
				if (followPlanTimer !== null && typeof globalThis.clearTimeout === 'function') {
					globalThis.clearTimeout(followPlanTimer)
				}
				followPlanTimer = null
				pendingFollowPlan = null
				return requestPlan(reason || pending.reason, pending.retries)
			}

			function clearFollowPlan() {
				if (followPlanTimer !== null && typeof globalThis.clearTimeout === 'function') {
					globalThis.clearTimeout(followPlanTimer)
				}
				followPlanTimer = null
				pendingFollowPlan = null
			}

			function isFollowPlanReason(reason) {
				return reason === 'mouse-follow' || reason === 'frame-follow' || reason === 'map-unpin-follow'
			}

			function syncPlane() {
				if (!active || !blueprint) return
				const shouldPause = Number(blueprint.sourcePlane) !== (game.plane ? 1 : 0)
				if (shouldPause === paused) return
				paused = shouldPause
				clearFollowPlan()
				planToken += 1
				calculating = false
				renderViewSignature = null
				resetVisualFollow()
				if (!paused && !pinned) {
					target = null
					setTarget(game.hoveredCell, 'source-plane-restored')
				} else {
					notify(true)
				}
			}

			function syncFollowingTarget() {
				if (!active || paused || pinned || !currentRuntime.active || game.halt || game.splash?.isShown) return
				setTarget(game.hoveredCell, 'frame-follow')
			}

			function scheduleIntegrityCheck() {
				clearIntegrityTimer()
				if (disposed || typeof globalThis.setTimeout !== 'function') return
				integrityTimer = globalThis.setTimeout(function checkIntegrity() {
					integrityTimer = null
					if (
						active &&
						pinned &&
						!paused &&
						!calculating &&
						plan &&
						!planner.verify(game, plan.guard)
					) {
						requestPlan('integrity-refresh', 1)
					}
					scheduleIntegrityCheck()
				}, INTEGRITY_INTERVAL_MS)
			}

			function clearIntegrityTimer() {
				if (integrityTimer === null) return
				if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(integrityTimer)
				integrityTimer = null
			}

			function showWarning(code, warningBlueprint, error) {
				clearWarning()
				warning = {
					code,
					sourcePlane: Number(warningBlueprint?.sourcePlane) ? 1 : 0,
					anchor: normalizePosition(warningBlueprint?.anchor?.position),
					error: error ? String(error?.code || error?.message || error) : ''
				}
				if (typeof globalThis.setTimeout === 'function') {
					warningTimer = globalThis.setTimeout(function () {
						warningTimer = null
						warning = null
						requestUiRefresh(true)
					}, WARNING_VISIBLE_MS)
				}
				requestUiRefresh(true)
			}

			function clearWarning() {
				if (warningTimer !== null && typeof globalThis.clearTimeout === 'function') {
					globalThis.clearTimeout(warningTimer)
				}
				warningTimer = null
				warning = null
			}

			function rebuildInstances(candidate) {
				const activeKeys = new Set()
				for (const record of candidate.records) {
					const key = instanceKey(record)
					activeKeys.add(key)
					if (instances.has(key)) continue
					instances.set(key, createPreviewInstance(record))
				}
				for (const key of Array.from(instances.keys())) {
					if (!activeKeys.has(key)) instances.delete(key)
				}
			}

			function createPreviewInstance(record) {
				try {
					const EntityClass = game.codex?.entities?.[record.name]?.class
					if (typeof EntityClass !== 'function') return { entity: null, error: 'class-unavailable' }
					const entity = new EntityClass(game)
					for (const key of Object.keys(record.config || {})) {
						entity[key] = jsonClone(record.config[key])
					}
					return { entity, error: null }
				} catch (error) {
					return { entity: null, error: String(error?.message || error) }
				}
			}

			function shouldRender(renderGame) {
				return !!(
					active &&
					!paused &&
					plan &&
					renderGame === game &&
					currentRuntime.active &&
					!game.halt &&
					!game.splash?.isShown &&
					Number(blueprint?.sourcePlane) === (game.plane ? 1 : 0)
				)
			}

			function renderPreview(renderGame, ctx) {
				if (!ctx || !shouldRender(renderGame)) return
				metrics.layerRedraws += 1
				renderLayerCanvas = ctx.canvas || renderLayerCanvas
				resetVisualFollow(true)
				const width = positive(ctx.canvas?.width, positive(game.w, 0))
				const height = positive(ctx.canvas?.height, positive(game.h, 0))
				const centerX = finiteOr(game.w2, width / 2)
				const centerY = finiteOr(game.h2, height / 2)
				ctx.save()
				try {
					if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0)
					ctx.clearRect?.(0, 0, width, height)
					if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, centerX, centerY)
					else ctx.translate?.(centerX, centerY)
					const newFallbacks = new Set(renderFallbacks)
					for (const record of orderedRecords) {
						const instance = instances.get(instanceKey(record))
						const entity = instance?.entity
						const colors = COLORS[record.status] || COLORS.blocked
						if (!entity || !renderEntity(entity, record, colors.tint)) newFallbacks.add(record.index)
					}
					for (const record of orderedRecords) drawRecordOverlay(ctx, record, newFallbacks.has(record.index))
					if (newFallbacks.size !== renderFallbacks.size) {
						renderFallbacks = newFallbacks
						requestUiRefresh()
					}
				} finally {
					ctx.restore()
				}
			}

			function markPreviewDirty() {
				metrics.layerDirtyMarks += 1
				api.render.markDirty(RENDER_LAYER_ID, game)
			}

			function syncRenderView(renderGame) {
				if (!plan || !shouldRender(renderGame)) return
				const next = createRenderViewSignature(renderGame)
				if (next === renderViewSignature) return
				renderViewSignature = next
				markPreviewDirty()
			}

			function syncVisualFollow(renderGame) {
				if (!renderLayerCanvas?.style || !plan || !target || !shouldRender(renderGame)) {
					resetVisualFollow()
					return
				}
				let sourcePoint
				let targetPoint
				try {
					sourcePoint = renderGame.uvToXY?.(plan.target)
					targetPoint = renderGame.uvToXY?.(target)
				} catch (error) {
					resetVisualFollow()
					return
				}
				if (!Array.isArray(sourcePoint) || !Array.isArray(targetPoint)) {
					resetVisualFollow()
					return
				}
				const rect = renderLayerCanvas.getBoundingClientRect?.()
				const scaleX = positive(rect?.width, positive(renderLayerCanvas.width, 1)) / positive(renderLayerCanvas.width, 1)
				const scaleY = positive(rect?.height, positive(renderLayerCanvas.height, 1)) / positive(renderLayerCanvas.height, 1)
				const offsetX = roundCss((finiteOr(targetPoint[0], 0) - finiteOr(sourcePoint[0], 0)) * scaleX)
				const offsetY = roundCss((finiteOr(targetPoint[1], 0) - finiteOr(sourcePoint[1], 0)) * scaleY)
				const provisional = calculating || !!pendingFollowPlan || !samePosition(plan.target, target)
				const signature = [offsetX, offsetY, provisional ? 1 : 0].join(':')
				if (signature === visualFollowSignature) return
				visualFollowSignature = signature
				const style = renderLayerCanvas.style
				style.transformOrigin = '0 0'
				style.transform = offsetX || offsetY ? 'translate3d(' + offsetX + 'px, ' + offsetY + 'px, 0)' : ''
				style.filter = provisional ? PENDING_PREVIEW_FILTER : ''
				style.opacity = provisional ? PENDING_PREVIEW_OPACITY : ''
				style.transition = PENDING_PREVIEW_TRANSITION
				style.willChange = provisional ? 'transform, filter, opacity' : ''
				metrics.visualFollowUpdates += 1
			}

			function resetVisualFollow(preserveTransition) {
				visualFollowSignature = null
				if (!renderLayerCanvas?.style) return
				renderLayerCanvas.style.transformOrigin = ''
				renderLayerCanvas.style.transform = ''
				renderLayerCanvas.style.filter = ''
				renderLayerCanvas.style.opacity = ''
				renderLayerCanvas.style.transition = preserveTransition ? PENDING_PREVIEW_TRANSITION : ''
				renderLayerCanvas.style.willChange = ''
			}

			function createRenderViewSignature(renderGame) {
				if (!renderGame || !plan) return null
				let projectedX = 0
				let projectedY = 0
				try {
					const projected = renderGame.uvToXY?.(plan.target)
					projectedX = finiteOr(projected?.[0], 0)
					projectedY = finiteOr(projected?.[1], 0)
				} catch (error) {}
				return [
					positive(renderGame.canvas?.width, positive(renderGame.w, 0)),
					positive(renderGame.canvas?.height, positive(renderGame.h, 0)),
					finiteOr(renderGame.w2, 0),
					finiteOr(renderGame.h2, 0),
					finiteOr(renderGame.unit, 0),
					finiteOr(renderGame.zoom, 0),
					renderGame.plane ? 1 : 0,
					projectedX,
					projectedY
				].join(':')
			}

			function roundCss(value) {
				return Math.round(finiteOr(value, 0) * 1000) / 1000
			}

			function renderEntity(entity, record, color) {
				const method = game.plane ? entity.darkrenderColored : entity.renderColored
				if (typeof method !== 'function') return false
				const ctx = game.ctx
				ctx?.save?.()
				try {
					entity.position = record.position.slice()
					method.call(entity, 0, record.position, color)
					return true
				} catch (error) {
					return false
				} finally {
					ctx?.restore?.()
				}
			}

			function compareProjectedDepth(left, right) {
				let leftY = left.position[1]
				let rightY = right.position[1]
				try {
					leftY = finiteOr(game.uvToXY(left.position)?.[1], leftY)
					rightY = finiteOr(game.uvToXY(right.position)?.[1], rightY)
				} catch (error) {}
				return leftY - rightY || left.position[0] - right.position[0] || left.index - right.index
			}

			function drawRecordOverlay(ctx, record, fallback) {
				const colors = COLORS[record.status] || COLORS.blocked
				const corners = projectFootprint(record.footprint)
				if (!corners) return
				const unit = Math.max(1, finiteOr(game.unit, 1))
				const lineWidth = clamp(Math.sqrt(Math.max(0.01, finiteOr(game.zoom, 1))) * 1.4, .7, 3.2)
				ctx.save()
				try {
					ctx.beginPath()
					ctx.moveTo(corners[0][0], corners[0][1])
					for (let index = 1; index < corners.length; index += 1) ctx.lineTo(corners[index][0], corners[index][1])
					ctx.closePath()
					ctx.fillStyle = fallback ? colors.fill.replace(/[\d.]+\)$/, '.24)') : colors.fill
					ctx.fill()
					ctx.strokeStyle = colors.stroke
					ctx.lineWidth = fallback ? lineWidth * 1.8 : lineWidth
					ctx.lineJoin = 'round'
					ctx.setLineDash(record.status === 'satisfied'
						? [unit * .16, unit * .10]
						: record.status === 'conflict'
							? [unit * .08, unit * .06]
							: [])
					ctx.stroke()
					if (record.status === 'conflict') {
						ctx.lineWidth = Math.max(.5, lineWidth * .45)
						ctx.setLineDash([])
						ctx.stroke()
					}
					if (finiteOr(game.zoom, 1) >= .28) drawStatusSymbol(ctx, record, colors)
				} finally {
					ctx.restore()
				}
			}

			function projectFootprint(footprint) {
				if (typeof game.uvToXY !== 'function') return null
				try {
					return [
						[footprint.minU - .5, footprint.minV - .5],
						[footprint.maxU + .5, footprint.minV - .5],
						[footprint.maxU + .5, footprint.maxV + .5],
						[footprint.minU - .5, footprint.maxV + .5]
					].map(function (point) {
						const projected = game.uvToXY(point)
						return [Number(projected[0]), Number(projected[1])]
					})
				} catch (error) {
					return null
				}
			}

			function drawStatusSymbol(ctx, record, colors) {
				let point
				try {
					point = game.uvToXY(record.position)
				} catch (error) {
					return
				}
				if (!Array.isArray(point)) return
				const size = clamp(finiteOr(game.unit, 24) * .16, 4, 14)
				const x = Number(point[0])
				const y = Number(point[1]) - size * .25
				ctx.strokeStyle = colors.stroke
				ctx.fillStyle = 'rgba(12, 15, 20, .72)'
				ctx.lineWidth = clamp(size * .18, 1.4, 3)
				ctx.lineCap = 'round'
				ctx.lineJoin = 'round'
				ctx.beginPath()
				if (colors.symbol === 'check') {
					ctx.moveTo(x - size * .55, y)
					ctx.lineTo(x - size * .12, y + size * .42)
					ctx.lineTo(x + size * .62, y - size * .5)
				} else if (colors.symbol === 'equal') {
					ctx.moveTo(x - size * .55, y - size * .22)
					ctx.lineTo(x + size * .55, y - size * .22)
					ctx.moveTo(x - size * .55, y + size * .28)
					ctx.lineTo(x + size * .55, y + size * .28)
				} else if (colors.symbol === 'warning') {
					ctx.moveTo(x, y - size * .62)
					ctx.lineTo(x, y + size * .16)
					ctx.moveTo(x, y + size * .58)
					ctx.lineTo(x, y + size * .6)
				} else {
					ctx.moveTo(x - size * .52, y - size * .52)
					ctx.lineTo(x + size * .52, y + size * .52)
					ctx.moveTo(x + size * .52, y - size * .52)
					ctx.lineTo(x - size * .52, y + size * .52)
				}
				ctx.stroke()
			}

			function mountUi() {
				document.getElementById(CARD_ID)?.remove()
				const style = ensureStyle()
				const card = document.createElement('section')
				card.id = CARD_ID
				card.dataset.visible = 'false'
				card.dataset.positionVisible = 'false'
				card.dataset.interactive = 'false'
				card.dataset.theme = game.plane ? 'void' : 'reality'
				card.setAttribute('aria-live', 'polite')
				card.setAttribute('aria-hidden', 'true')

				const header = document.createElement('div')
				header.className = 'cattail-world-editor-preview-card__header'
				const title = document.createElement('strong')
				const state = document.createElement('span')
				state.className = 'cattail-world-editor-preview-card__state'
				header.append(title, state)

				const warningText = document.createElement('div')
				warningText.className = 'cattail-world-editor-preview-card__warning'

				const statuses = document.createElement('div')
				statuses.className = 'cattail-world-editor-preview-card__statuses'
				const statusItems = {}
				for (const status of ['buildable', 'satisfied', 'conflict', 'blocked']) {
					const item = document.createElement('div')
					item.className = 'cattail-world-editor-preview-card__status'
					item.dataset.status = status
					const symbol = document.createElement('span')
					symbol.className = 'cattail-world-editor-preview-card__symbol'
					symbol.textContent = statusSymbol(status)
					const label = document.createElement('span')
					const count = document.createElement('strong')
					item.append(symbol, label, count)
					statuses.append(item)
					statusItems[status] = { item, label, count }
				}

				const tabs = document.createElement('div')
				tabs.className = 'cattail-world-editor-preview-card__tabs'
				tabs.setAttribute('role', 'tablist')
				const safeTab = createTab('safe')
				const overwriteTab = createTab('overwrite')
				tabs.append(safeTab, overwriteTab)

				const resourceList = document.createElement('div')
				resourceList.className = 'cattail-world-editor-preview-card__resources'
				const hint = document.createElement('div')
				hint.className = 'cattail-world-editor-preview-card__hint'

				card.append(header, warningText, statuses, tabs, resourceList, hint)
				document.body.append(card)

				function createTab(mode) {
					const button = document.createElement('button')
					button.type = 'button'
					button.dataset.costMode = mode
					button.setAttribute('role', 'tab')
					button.addEventListener('mousedown', stopUiEvent)
					button.addEventListener('click', function (event) {
						stopUiEvent(event)
						if (!pinned || selectedCost === mode) return
						selectedCost = mode
						notify(true)
					})
					return button
				}

				card.addEventListener('mousedown', function (event) {
					if (pinned) stopUiEvent(event)
				})
				card.addEventListener('click', function (event) {
					if (pinned) event.stopPropagation()
				})

				return {
					style,
					card,
					title,
					state,
					warningText,
					statuses,
					statusItems,
					tabs,
					safeTab,
					overwriteTab,
					resourceList,
					hint,
					positionVisible: false
				}
			}

			function unmountUi() {
				if (!ui) return
				ui.card.remove()
				ui.style?.remove()
				ui = null
			}

			function requestUiRefresh(immediate) {
				uiRefreshPending = true
				if (immediate === true) flushUiRefresh()
			}

			function flushUiRefresh() {
				if (!uiRefreshPending) return false
				uiRefreshPending = false
				refreshUi()
				return true
			}

			function refreshText() {
				if (!ui) return
				textRevision += 1
				renderedResourceKey = null
				ui.title.textContent = i18n.t(game, 'previewCardTitle')
				ui.statusItems.buildable.label.textContent = i18n.t(game, 'previewBuildable')
				ui.statusItems.satisfied.label.textContent = i18n.t(game, 'previewSatisfied')
				ui.statusItems.conflict.label.textContent = i18n.t(game, 'previewConflict')
				ui.statusItems.blocked.label.textContent = i18n.t(game, 'previewBlocked')
				ui.safeTab.textContent = i18n.t(game, 'previewSafePlan')
				ui.overwriteTab.textContent = i18n.t(game, 'previewOverwritePlan')
				ui.safeTab.setAttribute('aria-label', i18n.t(game, 'previewSafePlan'))
				ui.overwriteTab.setAttribute('aria-label', i18n.t(game, 'previewOverwritePlan'))
				ui.card.setAttribute('aria-label', i18n.t(game, 'previewCardTitle'))
			}

			function refreshUi() {
				if (!ui) return
				metrics.uiRefreshes += 1
				ui.card.dataset.theme = game.plane ? 'void' : 'reality'
				ui.card.dataset.interactive = active && pinned && !paused ? 'true' : 'false'
				const warningCode = warning?.code
				const warningMessage = warningCode === 'full-unavailable'
					? i18n.t(game, 'previewFullUnavailable')
					: warningCode === 'plan-failed'
						? i18n.t(game, 'previewPlanFailed')
						: ''
				ui.warningText.textContent = warningMessage
				ui.warningText.dataset.visible = warningMessage ? 'true' : 'false'
				ui.state.textContent = calculating
					? i18n.t(game, 'previewCalculating')
					: active
						? pinned
							? i18n.t(game, 'previewPinned')
							: target
								? i18n.t(game, 'previewFollowing')
								: i18n.t(game, 'previewWaitingTarget')
						: warningMessage
				const counts = plan?.statusCounts || {}
				for (const status of Object.keys(ui.statusItems)) {
					ui.statusItems[status].count.textContent = String(Number(counts[status]) || 0)
				}
				ui.statuses.hidden = !plan
				ui.tabs.hidden = !plan
				ui.resourceList.hidden = !plan
				ui.safeTab.dataset.active = selectedCost === 'safe' ? 'true' : 'false'
				ui.overwriteTab.dataset.active = selectedCost === 'overwrite' ? 'true' : 'false'
				ui.safeTab.setAttribute('aria-selected', selectedCost === 'safe' ? 'true' : 'false')
				ui.overwriteTab.setAttribute('aria-selected', selectedCost === 'overwrite' ? 'true' : 'false')
				renderResources()
				const hints = []
				if (renderFallbacks.size) hints.push(i18n.t(game, 'previewRenderFallback'))
				const cost = plan?.cost?.[selectedCost]
				if (cost && !cost.complete) hints.push(i18n.t(game, 'previewCostIncomplete'))
				if (active) hints.push(i18n.t(game, 'previewExitHint'))
				ui.hint.textContent = hints.join(' · ')
				syncCardPosition(game)
			}

			function renderResources() {
				if (!ui) return
				const resourceKey = plan ? planRevision + ':' + selectedCost + ':' + textRevision : 'none:' + textRevision
				if (renderedResourceKey === resourceKey) return
				renderedResourceKey = resourceKey
				metrics.resourceRebuilds += 1
				ui.resourceList.replaceChildren()
				const cost = plan?.cost?.[selectedCost]
				if (!cost) return
				const length = Math.max(
					cost.required?.length || 0,
					cost.owned?.length || 0,
					cost.refunds?.length || 0,
					cost.shortfall?.length || 0
				)
				let rows = 0
				for (let index = 0; index < length; index += 1) {
					const required = finiteOr(cost.required?.[index], 0)
					const owned = finiteOr(cost.owned?.[index], 0)
					const refund = finiteOr(cost.refunds?.[index], 0)
					const shortfall = finiteOr(cost.shortfall?.[index], 0)
					if (!required && !refund && !shortfall) continue
					const row = document.createElement('div')
					row.className = 'cattail-world-editor-preview-card__resource'
					const swatch = document.createElement('span')
					swatch.className = 'cattail-world-editor-preview-card__resource-swatch'
					swatch.style.background = resourceColor(index)
					const name = document.createElement('span')
					name.className = 'cattail-world-editor-preview-card__resource-name'
					name.textContent = localizedResourceName(index)
					const values = document.createElement('span')
					values.className = 'cattail-world-editor-preview-card__resource-values'
					values.textContent = [
						i18n.t(game, 'previewRequired') + ' ' + formatNumber(required),
						i18n.t(game, 'previewOwned') + ' ' + formatNumber(owned),
						refund ? i18n.t(game, 'previewRefund') + ' ' + formatNumber(refund) : '',
						shortfall ? i18n.t(game, 'previewShortfall') + ' ' + formatNumber(shortfall) : ''
					].filter(Boolean).join(' · ')
					if (shortfall) row.dataset.shortfall = 'true'
					row.append(swatch, name, values)
					ui.resourceList.append(row)
					rows += 1
				}
				if (!rows) {
					const empty = document.createElement('div')
					empty.className = 'cattail-world-editor-preview-card__empty'
					empty.textContent = i18n.t(game, 'previewNoCost')
					ui.resourceList.append(empty)
				}
			}

			function refreshCardVisibility() {
				if (!ui) return
				const warningVisible = !!warning && Number(warning.sourcePlane) === (game.plane ? 1 : 0)
				const visible = !!(
					currentRuntime.active &&
					!game.halt &&
					!game.splash?.isShown &&
					!vanillaHudHidden &&
					((active && !paused && (plan || calculating || target)) || warningVisible)
				)
				ui.card.dataset.visible = visible ? 'true' : 'false'
				ui.card.dataset.positionVisible = ui.positionVisible ? 'true' : 'false'
				ui.card.setAttribute('aria-hidden', visible && ui.positionVisible && !gameHudHidden ? 'false' : 'true')
			}

			function syncCardPosition(frameGame) {
				if (!ui || frameGame !== game) return
				const bounds = plan?.bounds
					? projectBounds(translatePlanBounds(plan.bounds, plan.target, target))
					: warning?.anchor
						? projectBounds({
							minU: warning.anchor[0],
							maxU: warning.anchor[0],
							minV: warning.anchor[1],
							maxV: warning.anchor[1]
						})
						: target
							? projectBounds({
								minU: target[0],
								maxU: target[0],
								minV: target[1],
								maxV: target[1]
							})
							: null
				if (!bounds) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				const viewportWidth = finiteOr(window.innerWidth, document.documentElement?.clientWidth || 0)
				const viewportHeight = finiteOr(window.innerHeight, document.documentElement?.clientHeight || 0)
				if (
					viewportWidth <= 0 ||
					viewportHeight <= 0 ||
					bounds.maxX < 0 ||
					bounds.minX > viewportWidth ||
					bounds.maxY < 0 ||
					bounds.minY > viewportHeight
				) {
					ui.positionVisible = false
					refreshCardVisibility()
					return
				}
				const rect = ui.card.getBoundingClientRect()
				const width = positive(rect.width, positive(ui.card.offsetWidth, 360))
				const height = positive(rect.height, positive(ui.card.offsetHeight, 260))
				const margin = 10
				const gap = 28
				const centerX = (bounds.minX + bounds.maxX) / 2
				const candidates = [
					{ left: centerX - width / 2, top: bounds.maxY + gap, placement: 'below' },
					{ left: centerX - width / 2, top: bounds.minY - gap - height, placement: 'above' },
					{ left: bounds.maxX + gap, top: (bounds.minY + bounds.maxY - height) / 2, placement: 'right' },
					{ left: bounds.minX - gap - width, top: (bounds.minY + bounds.maxY - height) / 2, placement: 'left' }
				]
				const obstacles = [
					visibleRect(document.getElementById(SELECTION_CARD_ID)),
					visibleRect(document.getElementById(BLUEPRINT_CARD_ID))
				].filter(Boolean)
				let chosen = null
				for (const candidate of candidates) {
					const normalized = normalizeCardCandidate(candidate, width, height, viewportWidth, viewportHeight, margin)
					if (!obstacles.some(function (obstacle) { return rectanglesOverlap(normalized, obstacle, 8) })) {
						chosen = normalized
						break
					}
				}
				chosen = chosen || normalizeCardCandidate(candidates[0], width, height, viewportWidth, viewportHeight, margin)
				ui.card.style.left = chosen.left + 'px'
				ui.card.style.top = chosen.top + 'px'
				ui.card.dataset.placement = chosen.placement
				ui.positionVisible = true
				refreshCardVisibility()
			}

			function translatePlanBounds(bounds, sourceTarget, nextTarget) {
				const source = normalizePosition(sourceTarget)
				const next = normalizePosition(nextTarget)
				if (!bounds || !source || !next) return bounds
				const du = next[0] - source[0]
				const dv = next[1] - source[1]
				if (!du && !dv) return bounds
				return {
					minU: finiteOr(bounds.minU, 0) + du,
					maxU: finiteOr(bounds.maxU, 0) + du,
					minV: finiteOr(bounds.minV, 0) + dv,
					maxV: finiteOr(bounds.maxV, 0) + dv
				}
			}

			function projectBounds(bounds) {
				if (!game.canvas || typeof game.uvToXY !== 'function') return null
				const points = []
				try {
					for (const point of [
						[bounds.minU - .5, bounds.minV - .5],
						[bounds.maxU + .5, bounds.minV - .5],
						[bounds.maxU + .5, bounds.maxV + .5],
						[bounds.minU - .5, bounds.maxV + .5]
					]) {
						const projected = game.uvToXY(point)
						points.push(projectedCanvasToClient(projected))
					}
				} catch (error) {
					return null
				}
				if (points.some(function (point) { return !point })) return null
				return {
					minX: Math.min(...points.map(function (point) { return point[0] })),
					maxX: Math.max(...points.map(function (point) { return point[0] })),
					minY: Math.min(...points.map(function (point) { return point[1] })),
					maxY: Math.max(...points.map(function (point) { return point[1] }))
				}
			}

			function projectedCanvasToClient(point) {
				if (!Array.isArray(point) || point.length < 2) return null
				const rect = game.canvas.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 }
				const internalWidth = positive(game.canvas.width, positive(game.w, 1))
				const internalHeight = positive(game.canvas.height, positive(game.h, 1))
				const scaleX = positive(rect.width, 0) ? rect.width / internalWidth : 1
				const scaleY = positive(rect.height, 0) ? rect.height / internalHeight : 1
				return [
					finiteOr(rect.left, 0) + (finiteOr(game.w2, internalWidth / 2) + Number(point[0])) * scaleX,
					finiteOr(rect.top, 0) + (finiteOr(game.h2, internalHeight / 2) + Number(point[1])) * scaleY
				]
			}

			function ensureStyle() {
				document.getElementById(STYLE_ID)?.remove()
				const style = document.createElement('style')
				style.id = STYLE_ID
				style.textContent = `
					#${CARD_ID} {
						position: fixed;
						z-index: 2147483624;
						display: grid;
						grid-template-columns: minmax(0, 1fr);
						gap: 8px;
						width: min(372px, calc(100vw - 20px));
						max-height: min(430px, calc(100vh - 20px));
						overflow: hidden;
						padding: 12px;
						border: 1px solid rgba(38, 48, 59, .30);
						border-radius: 6px;
						box-sizing: border-box;
						background: rgba(250, 252, 255, .94);
						box-shadow: 0 10px 28px rgba(18, 24, 31, .22);
						color: #18212a;
						font-family: Montserrat, sans-serif;
						font-size: 12px;
						line-height: 1.4;
						letter-spacing: 0;
						opacity: 0;
						visibility: hidden;
						pointer-events: none;
						transition: opacity 100ms linear;
					}
					#${CARD_ID}[data-theme="void"] {
						border-color: rgba(221, 229, 242, .24);
						background: rgba(22, 27, 36, .94);
						box-shadow: 0 10px 28px rgba(0, 0, 0, .38);
						color: #f2f5fa;
					}
					#${CARD_ID}[data-visible="true"][data-position-visible="true"] {
						opacity: 1;
						visibility: visible;
					}
					#${CARD_ID}[data-interactive="true"] {
						pointer-events: auto;
					}
					.cattail-world-editor-preview-card__header {
						display: flex;
						align-items: baseline;
						justify-content: space-between;
						gap: 12px;
						min-width: 0;
					}
					.cattail-world-editor-preview-card__header strong {
						min-width: 0;
						font-size: 13px;
						font-weight: 700;
					}
					.cattail-world-editor-preview-card__state {
						flex: 0 1 auto;
						color: #5c6975;
						font-size: 11px;
						text-align: right;
					}
					#${CARD_ID}[data-theme="void"] .cattail-world-editor-preview-card__state {
						color: #b9c4d2;
					}
					.cattail-world-editor-preview-card__warning {
						display: none;
						padding: 7px 8px;
						border-left: 3px solid #b38cff;
						background: rgba(155, 108, 255, .10);
					}
					.cattail-world-editor-preview-card__warning[data-visible="true"] {
						display: block;
					}
					.cattail-world-editor-preview-card__statuses {
						display: grid;
						grid-template-columns: repeat(2, minmax(0, 1fr));
						gap: 4px 10px;
					}
					.cattail-world-editor-preview-card__status {
						display: grid;
						grid-template-columns: 16px minmax(0, 1fr) auto;
						align-items: center;
						gap: 5px;
						min-width: 0;
					}
					.cattail-world-editor-preview-card__symbol {
						font-size: 14px;
						font-weight: 700;
						text-align: center;
					}
					.cattail-world-editor-preview-card__status[data-status="buildable"] .cattail-world-editor-preview-card__symbol { color: #09a943; }
					.cattail-world-editor-preview-card__status[data-status="satisfied"] .cattail-world-editor-preview-card__symbol { color: #bd8c00; }
					.cattail-world-editor-preview-card__status[data-status="conflict"] .cattail-world-editor-preview-card__symbol { color: #d63d3d; }
					.cattail-world-editor-preview-card__status[data-status="blocked"] .cattail-world-editor-preview-card__symbol { color: #8554e8; }
					.cattail-world-editor-preview-card__tabs {
						display: grid;
						grid-template-columns: repeat(2, minmax(0, 1fr));
						min-height: 30px;
						border: 1px solid rgba(50, 61, 72, .24);
						border-radius: 5px;
						overflow: hidden;
					}
					.cattail-world-editor-preview-card__tabs button {
						min-width: 0;
						border: 0;
						border-right: 1px solid rgba(50, 61, 72, .18);
						border-radius: 0;
						background: transparent;
						color: inherit;
						font: inherit;
						font-weight: 600;
						cursor: pointer;
					}
					.cattail-world-editor-preview-card__tabs button:last-child { border-right: 0; }
					.cattail-world-editor-preview-card__tabs button[data-active="true"] {
						background: rgba(34, 185, 99, .16);
						box-shadow: inset 0 -2px #22b963;
					}
					.cattail-world-editor-preview-card__resources {
						display: grid;
						gap: 5px;
						max-height: 190px;
						overflow-y: auto;
						overscroll-behavior: contain;
					}
					.cattail-world-editor-preview-card__resource {
						display: grid;
						grid-template-columns: 12px minmax(68px, auto) minmax(0, 1fr);
						align-items: center;
						gap: 6px;
						min-width: 0;
					}
					.cattail-world-editor-preview-card__resource[data-shortfall="true"] {
						color: #cf3838;
					}
					.cattail-world-editor-preview-card__resource-swatch {
						width: 10px;
						height: 10px;
						border: 1px solid rgba(20, 26, 32, .35);
						border-radius: 2px;
					}
					.cattail-world-editor-preview-card__resource-name {
						overflow: hidden;
						font-weight: 600;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
					.cattail-world-editor-preview-card__resource-values {
						min-width: 0;
						color: #5c6975;
						font-size: 10px;
						text-align: right;
						overflow-wrap: anywhere;
					}
					#${CARD_ID}[data-theme="void"] .cattail-world-editor-preview-card__resource-values {
						color: #b9c4d2;
					}
					.cattail-world-editor-preview-card__empty,
					.cattail-world-editor-preview-card__hint {
						color: #687581;
						font-size: 10px;
					}
					#${CARD_ID}[data-theme="void"] .cattail-world-editor-preview-card__empty,
					#${CARD_ID}[data-theme="void"] .cattail-world-editor-preview-card__hint {
						color: #aeb9c7;
					}
				`
				document.head.append(style)
				return style
			}

			function normalizeCardCandidate(candidate, width, height, viewportWidth, viewportHeight, margin) {
				return {
					left: clamp(candidate.left, margin, Math.max(margin, viewportWidth - margin - width)),
					top: clamp(candidate.top, margin, Math.max(margin, viewportHeight - margin - height)),
					width,
					height,
					placement: candidate.placement
				}
			}

			function visibleRect(element) {
				if (!element || element.dataset?.visible !== 'true' || element.dataset?.positionVisible !== 'true') return null
				const rect = element.getBoundingClientRect?.()
				if (!rect || !positive(rect.width, 0) || !positive(rect.height, 0)) return null
				return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
			}

			function rectanglesOverlap(left, right, gap) {
				return !(
					left.left + left.width + gap <= right.left ||
					right.left + right.width + gap <= left.left ||
					left.top + left.height + gap <= right.top ||
					right.top + right.height + gap <= left.top
				)
			}

			function localizedResourceName(index) {
				const resource = game.codex?.resources?.[index]
				const name = resource?.name || resource?.id || String(index)
				try {
					const pronounced = game.pronounce?.('resources', name, 'name')
					if (pronounced && pronounced !== name) return String(pronounced)
				} catch (error) {}
				return String(name)
			}

			function resourceColor(index) {
				const triplet = game.codex?.resources?.[index]?.triplet
				return Array.isArray(triplet) && triplet.length ? String(triplet[1] || triplet[0]) : '#8a96a3'
			}

			function formatNumber(value) {
				try {
					if (typeof game.makeReadable === 'function') return String(game.makeReadable(value))
				} catch (error) {}
				return Math.round(finiteOr(value, 0) * 100) / 100 + ''
			}

			function refreshHoveredCell(event) {
				const x = Number(event?.offsetX)
				const y = Number(event?.offsetY)
				if (Number.isFinite(x) && Number.isFinite(y) && typeof game.updateMouseData === 'function') {
					game.updateMouseData(x, y)
				}
			}

			function shouldOwnInput() {
				return !!(
					currentRuntime.active &&
					!game.halt &&
					!game.splash?.isShown &&
					!isModLoaderPanelBlocking()
				)
			}

			function isEditableEvent(event) {
				const nodes = typeof event?.composedPath === 'function' ? event.composedPath() : [event?.target]
				if (typeof document !== 'undefined') nodes.push(document.activeElement)
				return nodes.some(function (node) {
					return !!(node && node.nodeType === 1 && typeof node.closest === 'function' && node.closest(EDITABLE_SELECTOR))
				})
			}

			function isModLoaderPanelBlocking() {
				if (typeof document === 'undefined') return false
				const panel = document.getElementById('modloader-panel')
				return !!(panel && !panel.classList.contains('modloader-panel-autohidden'))
			}

			async function benchmarkRendering(options) {
				const sizes = Array.isArray(options.sizes) && options.sizes.length ? options.sizes : [100, 500, 2000]
				const samples = Math.max(1, Math.floor(Number(options.samples) || 5))
				const sourceBlueprint = currentSession?.blueprint?.mode === 'structure' ? currentSession.blueprint : blueprint
				const sourceRecord = sourceBlueprint?.entities?.[0]
				const definition = sourceRecord ? game.codex?.entities?.[sourceRecord.name] : null
				if (!sourceRecord || typeof definition?.class !== 'function' || typeof document === 'undefined') {
					return { kind: 'offscreen-render', unavailable: true, reason: 'structure-blueprint-required', results: [] }
				}
				const offscreen = document.createElement('canvas')
				offscreen.width = positive(game.canvas?.width, positive(game.w, 1280))
				offscreen.height = positive(game.canvas?.height, positive(game.h, 720))
				const context = offscreen.getContext?.('2d')
				if (!context) return { kind: 'offscreen-render', unavailable: true, reason: 'canvas-unavailable', results: [] }
				let entity
				try {
					entity = new definition.class(game)
				} catch (error) {
					return { kind: 'offscreen-render', unavailable: true, reason: 'entity-constructor-failed', results: [] }
				}
				const method = game.plane ? entity.darkrenderColored : entity.renderColored
				if (typeof method !== 'function') {
					return { kind: 'offscreen-render', unavailable: true, reason: 'colored-render-unavailable', results: [] }
				}
				const results = []
				const originalContext = game.ctx
				try {
					game.ctx = context
					for (const rawSize of sizes) {
						const size = Math.max(1, Math.floor(Number(rawSize) || 1))
						const durations = []
						for (let sample = 0; sample < samples; sample += 1) {
							context.setTransform(1, 0, 0, 1, finiteOr(game.w2, offscreen.width / 2), finiteOr(game.h2, offscreen.height / 2))
							context.clearRect(-offscreen.width, -offscreen.height, offscreen.width * 2, offscreen.height * 2)
							const started = now()
							for (let index = 0; index < size; index += 1) {
								const position = [100000 + index % 50, 100000 + Math.floor(index / 50)]
								method.call(entity, 0, position, COLORS.buildable.tint)
							}
							durations.push(Math.max(0, now() - started))
						}
						results.push({
							size,
							samples,
							medianMs: percentile(durations, .5),
							p95Ms: percentile(durations, .95)
						})
					}
				} catch (error) {
					return { kind: 'offscreen-render', unavailable: true, reason: String(error?.message || error), results }
				} finally {
					game.ctx = originalContext
				}
				return { kind: 'offscreen-render', unavailable: false, results }
			}

			function now() {
				return typeof performance !== 'undefined' && typeof performance.now === 'function'
					? performance.now()
					: Date.now()
			}

			function percentile(values, percentileValue) {
				const sorted = values.slice().sort(function (left, right) { return left - right })
				if (!sorted.length) return 0
				const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))
				return Math.round(sorted[index] * 1000) / 1000
			}

			function instanceKey(record) {
				return record.index + ':' + record.name
			}

			function statusSymbol(status) {
				return status === 'buildable' ? '✓' : status === 'satisfied' ? '=' : status === 'conflict' ? '!' : '×'
			}

			function normalizePosition(value) {
				if (!Array.isArray(value) || value.length < 2) return null
				const u = Number(value[0])
				const v = Number(value[1])
				return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
			}

			function clonePosition(value) {
				return normalizePosition(value)
			}

			function samePosition(left, right) {
				return !!left && !!right && left[0] === right[0] && left[1] === right[1]
			}

			function canMountUi() {
				return !!(
					typeof document !== 'undefined' &&
					document.body &&
					document.head &&
					typeof document.createElement === 'function'
				)
			}

			function consume(event) {
				event?.preventDefault?.()
				event?.stopImmediatePropagation?.()
			}

			function stopUiEvent(event) {
				event?.preventDefault?.()
				event?.stopPropagation?.()
				event?.stopImmediatePropagation?.()
			}

			function jsonClone(value) {
				return JSON.parse(JSON.stringify(value))
			}

			function previewError(code) {
				const error = new Error(code)
				error.code = code
				return error
			}

			function finiteOr(value, fallback) {
				const number = Number(value)
				return Number.isFinite(number) ? number : fallback
			}

			function positive(value, fallback) {
				const number = Number(value)
				return Number.isFinite(number) && number > 0 ? number : fallback
			}

			function clamp(value, minimum, maximum) {
				return Math.min(maximum, Math.max(minimum, Number(value) || 0))
			}
		})
	}
})
