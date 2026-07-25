ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const BLUEPRINT_KEY = Symbol.for('cattail.world-editor.blueprint')
		const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
		const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const RENDER_LAYER_ID = 'world-editor-blueprint-preview'
		const RENDER_CALLBACK_ID = 'world-editor-blueprint-preview'
		const GUIDE_LAYER_ID = 'world-editor-blueprint-transform-guide'
		const GUIDE_CALLBACK_ID = 'world-editor-blueprint-transform-guide'
		const FOLLOW_PLAN_IDLE_MS = 100
		const PENDING_PREVIEW_OPACITY = '.85'
		const PENDING_PREVIEW_TRANSITION = 'opacity 80ms linear'
		const ROTATION_TRANSITION_MS = 160
		const ROTATION_OVERLAY_ID = 'cattail-world-editor-blueprint-rotation-transition'
		const GUIDE_TRANSITION_MS = 100
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
		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const session = globalThis[BLUEPRINT_KEY]
			const transform = globalThis[TRANSFORM_KEY]
			const planner = globalThis[PLAN_KEY]
			const transformAvailable = !!(
				transform &&
				typeof transform.subscribe === 'function' &&
				typeof transform.snapshot === 'function'
			)
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.snapshot !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the selection state.')
				return
			}
			if (!session || session.game !== game || typeof session.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Blueprint preview 3B could not find the blueprint session.')
				return
			}
			if (
				!planner ||
				typeof planner.build !== 'function' ||
				typeof planner.verify !== 'function' ||
				typeof planner.inspect !== 'function' ||
				typeof planner.refreshResources !== 'function'
			) {
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
			let currentTransform = transformAvailable
				? transform.snapshot()
				: Object.freeze({
					source: currentSession.blueprint || null,
					blueprint: currentSession.blueprint?.mode === 'structure' ? currentSession.blueprint : null,
					sourceRevision: 0,
					revision: 0,
					identity: true
				})
			let active = false
			let pinned = false
			let temporaryPinned = false
			const temporaryAltKeys = new Set()
			let paused = false
			let target = null
			let blueprint = null
			let plan = null
			let calculating = false
			let warning = null
			let warningTimer = null
			let planToken = 0
			let planRetry = 0
			let revision = 0
			let disposed = false
			let handledAttemptId = Number(currentSession?.attemptId) || 0
			let integrityTimer = null
			let followPlanTimer = null
			let pendingFollowPlan = null
			let renderFallbacks = new Set()
			let orderedRecords = []
			let renderViewSignature = null
			let renderLayerCanvas = null
			let renderLayerScale = null
			let renderedPlanPoint = null
			let guideLayerCanvas = null
			let guideLayerScale = null
			let guideRenderedPlanPoint = null
			let guideAction = null
			let visualFollowSignature = null
			let cameraDragging = false
			let rotationOverlay = null
			let rotationOverlayTimer = null
			let rotationOverlayAnimation = null
			let rotationOverlayKeyframes = null
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
				resourceRebuilds: 0,
				transformChanges: 0,
				integrityChecks: 0,
				integrityGuardCells: 0,
				integrityGuardCellChecks: 0,
				lastIntegrityMs: 0,
				maxIntegrityMs: 0,
				integrityRefreshes: 0,
				resourceRefreshes: 0,
				lastIntegrityReason: 'none'
			}

			const controller = Object.freeze({
				version: '0.3.4',
				game,
				snapshot,
				exit,
				setPinned(next, reason) {
					return setPinned(!!next, reason || 'api')
				},
				rotateClockwise(reason) {
					return transformAvailable && transform.rotateClockwise(reason || 'preview-api')
				},
				rotateCounterclockwise(reason) {
					return transformAvailable && transform.rotateCounterclockwise(reason || 'preview-api')
				},
				mirrorU(reason) {
					return transformAvailable && transform.mirrorU(reason || 'preview-api')
				},
				mirrorV(reason) {
					return transformAvailable && transform.mirrorV(reason || 'preview-api')
				},
				resetTransform(reason) {
					return transformAvailable && transform.reset(reason || 'preview-api')
				},
				setTransformGuide(action, reason) {
					return setTransformGuide(action, reason || 'preview-api')
				},
				async benchmark(options) {
					const settings = options || {}
					const planning = await planner.benchmark(settings)
					const rendering = await benchmarkRendering(settings)
					const result = {
						version: '0.3.4',
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
			const stopGuideLayer = api.render.registerLayer(GUIDE_LAYER_ID, {
				order: 41,
				zIndex: 41,
				cache: true,
				clearEachFrame: false
			})
			const stopGuideRendering = api.render.onLayer(GUIDE_LAYER_ID, function (context) {
				renderTransformGuide(context?.game || game, context?.ctx)
			}, {
				id: GUIDE_CALLBACK_ID,
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
			})

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state.active) exit('editor-inactive')
			})
			const stopSessionSubscription = session.subscribe(function (state) {
				const previousBlueprint = currentSession?.blueprint
				currentSession = state
				if (!state.blueprint && !state.lastResult) {
					exit('blueprint-cleared')
					clearWarning()
					return
				}
				const attemptId = Number(state.lastResult?.attemptId) || 0
				if (
					!transformAvailable &&
					state.lastResult?.status === 'captured' &&
					attemptId > handledAttemptId &&
					state.blueprint !== previousBlueprint
				) {
					handledAttemptId = attemptId
					if (state.blueprint?.mode === 'structure') {
						enter(state.blueprint, 'structure-captured')
					} else {
						exit('full-blueprint-captured')
						showWarning('full-unavailable', state.blueprint)
					}
				} else {
					handledAttemptId = Math.max(handledAttemptId, attemptId)
				}
			})
			const stopTransformSubscription = transformAvailable ? transform.subscribe(function (state) {
				const previousTransform = currentTransform
				currentTransform = state
				if (!state.source) {
					exit('transform-source-cleared')
					clearWarning()
					return
				}
				if (!state.blueprint) {
					exit('transform-structure-empty')
					clearWarning()
					return
				}
				if (!active || state.sourceRevision !== previousTransform.sourceRevision) {
					enter(state.blueprint, state.projected ? 'structure-projected' : 'structure-captured')
					return
				}
				if (state.blueprint !== blueprint) {
					if (shouldAnimateRotation(previousTransform, state)) prepareRotationTransition(previousTransform, state)
					applyTransformedBlueprint(state.blueprint, state.lastCommand || 'transform-changed')
				}
			}) : null

			const handleMouseMove = function (event) {
				if (!active || isTargetPinned() || paused || !shouldOwnInput()) return
				if (Number(event?.buttons) & 2) return
				refreshHoveredCell(event)
				setTarget(game.hoveredCell, 'mouse-follow')
			}
			const handleMouseDown = function (event) {
				if (event?.button === 2) {
					cameraDragging = true
					return
				}
				if (event?.button !== 0 || !active || paused || !shouldOwnInput() || isEditableEvent(event)) return
				refreshHoveredCell(event)
				if (temporaryPinned) {
					setPinned(true, 'map-alt-promote')
				} else if (pinned) {
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
				finishCameraDrag()
				setTransformGuide(null, 'window-blur')
				releaseTemporaryPin('window-blur', false)
				if (active && !pinned) exit('window-blur')
			}
			const handleWindowMouseUp = function (event) {
				if (event?.button === 2) finishCameraDrag()
			}
			const handleWindowResize = function () {
				if (!active || !renderLayerCanvas) return
				refreshRenderLayerScale()
				refreshGuideLayerScale()
				visualFollowSignature = null
			}
			const handleTransformKeydown = function (event) {
				const code = String(event?.code || '')
				const key = String(event?.key || '').toLowerCase()
				const rotate = code === 'KeyR' || key === 'r'
				const mirror = code === 'KeyM' || key === 'm'
				if (
					(!rotate && !mirror) ||
					event?.ctrlKey ||
					event?.altKey ||
					event?.metaKey ||
					event?.repeat ||
					event?.isComposing ||
					event?.keyCode === 229 ||
					isEditableEvent(event) ||
					!active ||
					paused ||
					blueprint?.mode !== 'structure' ||
					!transformAvailable ||
					!shouldOwnInput()
				) {
					return
				}
				const changed = rotate
					? event?.shiftKey
						? transform.rotateCounterclockwise('hotkey-shift-r')
						: transform.rotateClockwise('hotkey-r')
					: event?.shiftKey
						? transform.mirrorV('hotkey-shift-m')
						: transform.mirrorU('hotkey-m')
				if (changed) consume(event)
			}
			const handleTemporaryPinKeydown = function (event) {
				const keyId = altKeyId(event)
				if (
					!keyId ||
					pinned ||
					!active ||
					paused ||
					!target ||
					!shouldOwnInput() ||
					isEditableEvent(event)
				) {
					return
				}
				temporaryAltKeys.add(keyId)
				if (!temporaryPinned) {
					temporaryPinned = true
					if (!flushFollowPlan('alt-temporary-pin') && (!plan || !samePosition(plan.target, target))) {
						requestPlan('alt-temporary-pin', 1)
					}
					notify()
				}
				consume(event)
			}
			const handleTemporaryPinKeyup = function (event) {
				const keyId = altKeyId(event)
				if (!keyId || !temporaryAltKeys.has(keyId)) return
				temporaryAltKeys.delete(keyId)
				if (temporaryAltKeys.size || !temporaryPinned) return
				releaseTemporaryPin('alt-release', true)
				consume(event)
			}
			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mouseup', consumeLeft, true)
			canvas.addEventListener('click', consumeLeft, true)
			canvas.addEventListener('dblclick', consumeLeft, true)
			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('blur', handleWindowBlur, true)
				window.addEventListener('mouseup', handleWindowMouseUp, true)
				window.addEventListener('resize', handleWindowResize)
				window.addEventListener('keydown', handleTemporaryPinKeydown, true)
				window.addEventListener('keydown', handleTransformKeydown, true)
				window.addEventListener('keyup', handleTemporaryPinKeyup, true)
			}

			scheduleIntegrityCheck()

			runtime.addCleanup(function () {
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mouseup', consumeLeft, true)
				canvas.removeEventListener('click', consumeLeft, true)
				canvas.removeEventListener('dblclick', consumeLeft, true)
				if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
					window.removeEventListener('blur', handleWindowBlur, true)
					window.removeEventListener('mouseup', handleWindowMouseUp, true)
					window.removeEventListener('resize', handleWindowResize)
					window.removeEventListener('keydown', handleTemporaryPinKeydown, true)
					window.removeEventListener('keydown', handleTransformKeydown, true)
					window.removeEventListener('keyup', handleTemporaryPinKeyup, true)
				}
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSessionSubscription === 'function') stopSessionSubscription()
				if (typeof stopTransformSubscription === 'function') stopTransformSubscription()
				if (typeof stopRendering === 'function') stopRendering()
				if (typeof stopRenderLayer === 'function') stopRenderLayer()
				if (typeof stopGuideRendering === 'function') stopGuideRendering()
				if (typeof stopGuideLayer === 'function') stopGuideLayer()
				if (typeof stopRenderFrame === 'function') stopRenderFrame()
				controller.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Read-only blueprint preview 3B ready.')

			function snapshot() {
				return Object.freeze({
					version: '0.3.4',
					active,
					pinned,
					temporaryPinned,
					effectivePinned: isTargetPinned(),
					paused,
					target: clonePosition(target),
					blueprint,
					transform: currentTransform,
					plan,
					calculating,
					warning: warning?.code || null,
					renderFallbackCount: renderFallbacks.size,
					guideAction,
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
					resourceRebuilds: metrics.resourceRebuilds,
					transformChanges: metrics.transformChanges,
					integrityIntervalMs: INTEGRITY_INTERVAL_MS,
					integrityChecks: metrics.integrityChecks,
					integrityGuardCells: metrics.integrityGuardCells,
					integrityGuardCellChecks: metrics.integrityGuardCellChecks,
					lastIntegrityMs: metrics.lastIntegrityMs,
					maxIntegrityMs: metrics.maxIntegrityMs,
					integrityRefreshes: metrics.integrityRefreshes,
					resourceRefreshes: metrics.resourceRefreshes,
					lastIntegrityReason: metrics.lastIntegrityReason
				})
			}

			function notify() {
				revision += 1
				const state = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(state)
					} catch (error) {
						console.warn('[Cattail World Editor] Blueprint preview listener failed.', error)
					}
				}
			}

			function enter(nextBlueprint, reason) {
				if (disposed || nextBlueprint?.mode !== 'structure' || !Array.isArray(nextBlueprint.entities)) return false
				setTransformGuide(null, 'preview-entered')
				clearWarning()
				clearFollowPlan()
				planToken += 1
				active = true
				pinned = false
				temporaryPinned = false
				temporaryAltKeys.clear()
				paused = Number(nextBlueprint.sourcePlane) !== (game.plane ? 1 : 0)
				target = null
				blueprint = nextBlueprint
				plan = null
				calculating = false
				renderFallbacks = new Set()
				orderedRecords = []
				renderViewSignature = null
				renderedPlanPoint = null
				guideRenderedPlanPoint = null
				resetVisualFollow()
				clearRotationTransition()
				instances.clear()
				if (!paused) setTarget(game.hoveredCell, reason || 'preview-entered')
				notify()
				return true
			}

			function exit(reason) {
				const changed = active || pinned || temporaryPinned || paused || target || plan || calculating
				setTransformGuide(null, reason || 'preview-exited')
				clearFollowPlan()
				planToken += 1
				active = false
				pinned = false
				temporaryPinned = false
				temporaryAltKeys.clear()
				paused = false
				target = null
				blueprint = null
				plan = null
				calculating = false
				planRetry = 0
				renderFallbacks = new Set()
				orderedRecords = []
				renderViewSignature = null
				renderedPlanPoint = null
				guideRenderedPlanPoint = null
				resetVisualFollow()
				clearRotationTransition()
				instances.clear()
				if (changed) {
					notify()
					if (reason) console.info('[Cattail World Editor] Blueprint preview exited (' + reason + ').')
				}
				return changed
			}

			function applyTransformedBlueprint(nextBlueprint, reason) {
				if (!active || nextBlueprint?.mode !== 'structure') return false
				clearFollowPlan()
				planToken += 1
				blueprint = nextBlueprint
				metrics.transformChanges += 1
				let scheduled = false
				if (target) {
					if (isTargetPinned()) scheduled = requestPlan(reason || 'transform-pinned', 1)
					else scheduled = scheduleFollowPlan(reason || 'transform-following', 1)
				}
				if (!scheduled) {
					calculating = false
					clearRotationTransition()
				}
				notify()
				return true
			}

			function setPinned(next, reason) {
				if (!active || paused || !target) return false
				if (next && temporaryPinned) {
					temporaryPinned = false
					temporaryAltKeys.clear()
				}
				if (pinned === next) return false
				if (next) flushFollowPlan('pin-target')
				pinned = next
				if (!isTargetPinned()) syncFollowingTarget()
				notify()
				if (reason) console.info('[Cattail World Editor] Blueprint preview ' + (next ? 'pinned' : 'following') + ' (' + reason + ').')
				return true
			}

			function isTargetPinned() {
				return pinned || temporaryPinned
			}

			function releaseTemporaryPin(reason, resumeFollowing) {
				if (!temporaryPinned && !temporaryAltKeys.size) return false
				temporaryPinned = false
				temporaryAltKeys.clear()
				let moved = false
				if (resumeFollowing && active && !pinned && !paused) {
					moved = setTarget(game.hoveredCell, reason || 'temporary-pin-released')
				}
				if (!moved) notify()
				return true
			}

			function altKeyId(event) {
				const code = String(event?.code || '')
				if (code === 'AltLeft' || code === 'AltRight') return code
				if (String(event?.key || '').toLowerCase() !== 'alt') return ''
				return Number(event?.location) === 2 ? 'AltRight' : 'AltLeft'
			}

			function setTarget(value, reason) {
				const next = normalizePosition(value)
				if (!active || paused || isTargetPinned() || !next || samePosition(next, target)) return false
				target = next
				metrics.targetChanges += 1
				planToken += 1
				const planReason = reason || 'target-changed'
				if (isFollowPlanReason(planReason)) scheduleFollowPlan(planReason, 1)
				else requestPlan(planReason, 1)
				notify()
				return true
			}

			function requestPlan(reason, retries) {
				if (!active || paused || !target || blueprint?.mode !== 'structure') return false
				clearFollowPlan()
				const token = ++planToken
				const requestTarget = target.slice()
				const requestBlueprint = blueprint
				planRetry = Math.max(0, Number(retries) || 0)
				const wasCalculating = calculating
				calculating = true
				metrics.planRequests += 1
				if (!wasCalculating) notify()
				Promise.resolve().then(async function () {
					let candidate = await planner.build(game, requestBlueprint, requestTarget, {
						chunkSize: 512,
						isCancelled() {
							return disposed || token !== planToken || !active
						}
					})
					if (disposed || token !== planToken || !active) return
					const verification = planner.inspect(game, candidate.guard)
					if (!verification.valid && verification.reason === 'resources') {
						candidate = planner.refreshResources(game, candidate)
						metrics.resourceRefreshes += 1
					} else if (!verification.valid) {
						if (planRetry > 0) {
							calculating = false
							requestPlan('world-changed-retry', planRetry - 1)
							return
						}
						throw previewError('world-changed')
					}
					plan = candidate
					calculating = false
					planRetry = 0
					renderFallbacks = new Set()
					orderedRecords = candidate.records.slice().sort(compareProjectedDepth)
					renderViewSignature = createRenderViewSignature(game)
					rebuildInstances(candidate)
					metrics.planCompletions += 1
					markPreviewDirty()
					if (guideAction) markGuideDirty()
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
					clearRotationTransition()
					showWarning('plan-failed', blueprint, error)
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
				if (!wasCalculating) notify()
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
				if (paused) setTransformGuide(null, 'source-plane-paused')
				clearFollowPlan()
				planToken += 1
				calculating = false
				renderViewSignature = null
				renderedPlanPoint = null
				guideRenderedPlanPoint = null
				resetVisualFollow()
				if (!paused && !isTargetPinned()) {
					target = null
					setTarget(game.hoveredCell, 'source-plane-restored')
				} else {
					notify()
				}
			}

			function syncFollowingTarget() {
				if (!active || paused || isTargetPinned() || !currentRuntime.active || game.halt || game.splash?.isShown) return
				setTarget(game.hoveredCell, 'frame-follow')
			}

			function scheduleIntegrityCheck() {
				clearIntegrityTimer()
				if (disposed || typeof globalThis.setTimeout !== 'function') return
				integrityTimer = globalThis.setTimeout(function checkIntegrity() {
					integrityTimer = null
					if (
						active &&
						isTargetPinned() &&
						!paused &&
						!calculating &&
						plan
					) {
						const guardCells = Array.isArray(plan.guard.cells) ? plan.guard.cells.length : 0
						const started = now()
						const verification = planner.inspect(game, plan.guard)
						const elapsed = roundTiming(Math.max(0, now() - started))
						metrics.integrityChecks += 1
						metrics.integrityGuardCells = guardCells
						metrics.integrityGuardCellChecks += guardCells
						metrics.lastIntegrityMs = elapsed
						metrics.maxIntegrityMs = Math.max(metrics.maxIntegrityMs, elapsed)
						metrics.lastIntegrityReason = verification.reason
						if (!verification.valid && verification.reason === 'resources') {
							plan = planner.refreshResources(game, plan)
							metrics.resourceRefreshes += 1
							notify()
						} else if (!verification.valid) {
							metrics.integrityRefreshes += 1
							requestPlan('integrity-refresh', 1)
						}
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
						notify()
					}, WARNING_VISIBLE_MS)
				}
				notify()
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
				setRenderLayerCanvas(ctx.canvas || renderLayerCanvas)
				refreshRenderLayerScale()
				renderedPlanPoint = projectPosition(renderGame, plan.target)
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
						notify()
					}
				} finally {
					ctx.restore()
				}
				startRotationTransition()
			}

			function shouldAnimateRotation(previousState, nextState) {
				if (!active || !renderLayerCanvas || !previousState || !nextState) return false
				if (Number(previousState.rotation) === Number(nextState.rotation)) return false
				const command = String(nextState.lastCommand || '')
				return command === 'rotate-clockwise' || command === 'rotate-counterclockwise' || command === 'reset'
			}

			function prepareRotationTransition(previousState, nextState) {
				clearRotationTransition()
				if (
					typeof document === 'undefined' ||
					!document.body ||
					typeof document.createElement !== 'function' ||
					!renderLayerCanvas
				) {
					return false
				}
				const overlay = document.createElement('canvas')
				const context = overlay.getContext?.('2d')
				if (!context) return false
				const width = positive(renderLayerCanvas.width, 0)
				const height = positive(renderLayerCanvas.height, 0)
				if (!width || !height) return false
				overlay.id = ROTATION_OVERLAY_ID
				overlay.width = width
				overlay.height = height
				try {
					context.drawImage(renderLayerCanvas, 0, 0)
				} catch (error) {
					return false
				}
				const rect = renderLayerCanvas.getBoundingClientRect?.() || {
					left: 0,
					top: 0,
					width,
					height
				}
				const style = overlay.style
				style.position = 'fixed'
				style.left = finiteOr(rect.left, 0) + 'px'
				style.top = finiteOr(rect.top, 0) + 'px'
				style.width = positive(rect.width, width) + 'px'
				style.height = positive(rect.height, height) + 'px'
				style.zIndex = '40'
				style.opacity = String(renderLayerCanvas.style?.opacity || '1')
				style.pointerEvents = 'none'
				style.transition = 'none'
				const transition = projectedRotationTransition(previousState, nextState, rect)
				if (!transition) return false
				style.transformOrigin = transition.originX + 'px ' + transition.originY + 'px'
				style.transform = 'matrix(1, 0, 0, 1, 0, 0)'
				style.willChange = 'transform, opacity'
				overlay.dataset.targetTransform = transition.transform
				document.body.append(overlay)
				rotationOverlay = overlay
				rotationOverlayKeyframes = transition.keyframes
				return true
			}

			function startRotationTransition() {
				const overlay = rotationOverlay
				if (!overlay || overlay.dataset?.started === 'true') return false
				if (overlay.dataset) overlay.dataset.started = 'true'
				const begin = function () {
					if (rotationOverlay !== overlay || !overlay.style) return
					const initialOpacity = Math.max(0, Math.min(1, finiteOr(Number(overlay.style.opacity), 1)))
					const keyframes = (rotationOverlayKeyframes || []).map(function (keyframe) {
						return {
							offset: keyframe.offset,
							transform: keyframe.transform,
							opacity: String(initialOpacity * (1 - keyframe.offset))
						}
					})
					if (typeof overlay.animate === 'function' && keyframes.length > 1) {
						rotationOverlayAnimation = overlay.animate(keyframes, {
							duration: ROTATION_TRANSITION_MS,
							easing: 'linear',
							fill: 'forwards'
						})
					} else {
						overlay.style.transition =
							'transform ' + ROTATION_TRANSITION_MS + 'ms linear, ' +
							'opacity ' + ROTATION_TRANSITION_MS + 'ms linear'
						overlay.style.transform = overlay.dataset?.targetTransform || 'matrix(1, 0, 0, 1, 0, 0)'
						overlay.style.opacity = '0'
					}
				}
				if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(begin)
				else globalThis.setTimeout?.(begin, 0)
				if (typeof globalThis.setTimeout === 'function') {
					rotationOverlayTimer = globalThis.setTimeout(function () {
						if (rotationOverlay === overlay) clearRotationTransition()
					}, ROTATION_TRANSITION_MS + 40)
				}
				return true
			}

			function projectedRotationTransition(previousState, nextState, rect) {
				if (!plan || !previousState?.pivot) return null
				const angle = logicalRotationAngle(previousState, nextState)
				if (!angle) return null
				const origin = projectPosition(game, plan.target)
				const uPoint = projectPosition(game, [plan.target[0] + 1, plan.target[1]])
				const vPoint = projectPosition(game, [plan.target[0], plan.target[1] + 1])
				if (!origin || !uPoint || !vPoint) return null
				const scaleX = positive(rect?.width, positive(renderLayerCanvas?.width, 1)) /
					positive(renderLayerCanvas?.width, 1)
				const scaleY = positive(rect?.height, positive(renderLayerCanvas?.height, 1)) /
					positive(renderLayerCanvas?.height, 1)
				const basis = [
					(uPoint[0] - origin[0]) * scaleX,
					(vPoint[0] - origin[0]) * scaleX,
					(uPoint[1] - origin[1]) * scaleY,
					(vPoint[1] - origin[1]) * scaleY
				]
				const inverseBasis = inverseMatrix(basis)
				if (!inverseBasis) return null
				const steps = Math.max(8, Math.round(Math.abs(angle) / (Math.PI / 2) * 8))
				const keyframes = []
				for (let index = 0; index <= steps; index += 1) {
					const offset = index / steps
					const logical = rotationMatrixAt(angle * offset)
					const screen = multiplyMatrix(multiplyMatrix(basis, logical), inverseBasis)
					keyframes.push({
						offset,
						transform: cssMatrix(screen)
					})
				}
				const pivotWorld = [
					plan.target[0] + finiteOr(previousState.pivot[0], 0),
					plan.target[1] + finiteOr(previousState.pivot[1], 0)
				]
				const pivotPoint = projectPosition(game, pivotWorld)
				if (!pivotPoint) return null
				const width = positive(renderLayerCanvas?.width, 1)
				const height = positive(renderLayerCanvas?.height, 1)
				const centerX = finiteOr(game.w2, width / 2)
				const centerY = finiteOr(game.h2, height / 2)
				return {
					originX: (centerX + pivotPoint[0]) * scaleX,
					originY: (centerY + pivotPoint[1]) * scaleY,
					transform: keyframes[keyframes.length - 1].transform,
					keyframes
				}
			}

			function logicalRotationAngle(previousState, nextState) {
				const command = String(nextState?.lastCommand || '')
				if (command === 'rotate-clockwise') return Math.PI / 2
				if (command === 'rotate-counterclockwise') return -Math.PI / 2
				if (command !== 'reset') return null
				let turns = -Math.round(finiteOr(previousState?.quarterTurns, 0))
				while (turns > 2) turns -= 4
				while (turns < -2) turns += 4
				return turns ? turns * Math.PI / 2 : null
			}

			function rotationMatrixAt(angle) {
				const cosine = Math.cos(angle)
				const sine = Math.sin(angle)
				return [cosine, -sine, sine, cosine]
			}

			function cssMatrix(screen) {
				return 'matrix(' + [
					roundCss(screen[0]),
					roundCss(screen[2]),
					roundCss(screen[1]),
					roundCss(screen[3]),
					0,
					0
				].join(', ') + ')'
			}

			function multiplyMatrix(left, right) {
				return [
					left[0] * right[0] + left[1] * right[2],
					left[0] * right[1] + left[1] * right[3],
					left[2] * right[0] + left[3] * right[2],
					left[2] * right[1] + left[3] * right[3]
				]
			}

			function inverseMatrix(value) {
				const determinant = value[0] * value[3] - value[1] * value[2]
				if (!Number.isFinite(determinant) || Math.abs(determinant) < .000001) return null
				return [
					value[3] / determinant,
					-value[1] / determinant,
					-value[2] / determinant,
					value[0] / determinant
				]
			}

			function clearRotationTransition() {
				if (rotationOverlayTimer !== null && typeof globalThis.clearTimeout === 'function') {
					globalThis.clearTimeout(rotationOverlayTimer)
				}
				rotationOverlayTimer = null
				rotationOverlayAnimation?.cancel?.()
				rotationOverlayAnimation = null
				rotationOverlay?.remove?.()
				rotationOverlay = null
				rotationOverlayKeyframes = null
			}

			function setTransformGuide(action, reason) {
				const normalized = normalizeGuideAction(action)
				if (normalized && (!active || paused || !plan || !shouldRender(game))) return false
				if (guideAction === normalized) return false
				guideAction = normalized
				if (guideLayerCanvas?.style) {
					setStyleValue(guideLayerCanvas.style, 'transition', 'opacity ' + GUIDE_TRANSITION_MS + 'ms ease-out')
					setStyleValue(guideLayerCanvas.style, 'opacity', normalized ? '0' : '0')
				}
				markGuideDirty()
				notify()
				return true
			}

			function normalizeGuideAction(action) {
				const value = String(action || '')
				return [
					'rotate-clockwise',
					'rotate-counterclockwise',
					'mirror-u',
					'mirror-v',
					'reset'
				].includes(value) ? value : null
			}

			function renderTransformGuide(renderGame, ctx) {
				if (!ctx) return
				setGuideLayerCanvas(ctx.canvas || guideLayerCanvas)
				refreshGuideLayerScale()
				const width = positive(ctx.canvas?.width, positive(game.w, 0))
				const height = positive(ctx.canvas?.height, positive(game.h, 0))
				const centerX = finiteOr(game.w2, width / 2)
				const centerY = finiteOr(game.h2, height / 2)
				if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.clearRect?.(0, 0, width, height)
				if (!guideAction || !plan || !shouldRender(renderGame)) {
					guideRenderedPlanPoint = null
					return
				}
				guideRenderedPlanPoint = projectPosition(renderGame, plan.target)
				const points = projectedBoundsPoints(renderGame, plan.bounds)
				if (points.length !== 4) return
				ctx.save()
				try {
					if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, centerX, centerY)
					else ctx.translate?.(centerX, centerY)
					const scale = (positive(guideLayerScale?.x, 1) + positive(guideLayerScale?.y, 1)) / 2
					const visual = guideVisualStyle(renderGame, scale)
					const direction = resolvedGuideAction(guideAction)
					if (direction === 'rotate-clockwise' || direction === 'rotate-counterclockwise') {
						drawRotationGuide(ctx, points, direction === 'rotate-clockwise' ? 1 : -1, visual)
					} else if (direction === 'mirror-u' || direction === 'mirror-v') {
						drawMirrorGuide(ctx, renderGame, points, direction === 'mirror-u' ? 'v' : 'u', visual)
					} else if (direction === 'mirror-both') {
						drawMirrorGuide(ctx, renderGame, points, 'v', visual)
						drawMirrorGuide(ctx, renderGame, points, 'u', visual)
					}
				} finally {
					ctx.restore()
				}
				showGuideLayer()
			}

			function projectedBoundsPoints(renderGame, bounds) {
				if (!bounds) return []
				return [
					[bounds.minU - .5, bounds.minV - .5],
					[bounds.maxU + .5, bounds.minV - .5],
					[bounds.maxU + .5, bounds.maxV + .5],
					[bounds.minU - .5, bounds.maxV + .5]
				].map(function (position) {
					return projectPosition(renderGame, position)
				}).filter(Boolean)
			}

			function resolvedGuideAction(action) {
				if (action !== 'reset') return action
				const turns = Math.round(finiteOr(currentTransform?.quarterTurns, 0))
				if (turns === 1 || turns === 2) return 'rotate-counterclockwise'
				if (turns === 3) return 'rotate-clockwise'
				if (currentTransform?.mirrorU && currentTransform?.mirrorV) return 'mirror-both'
				if (currentTransform?.mirrorU) return 'mirror-u'
				if (currentTransform?.mirrorV) return 'mirror-v'
				return null
			}

			function guideVisualStyle(renderGame, scale) {
				return {
					main: '#889',
					outline: renderGame?.plane ? 'rgba(5, 7, 10, .64)' : 'rgba(255, 255, 255, .72)',
					lineWidth: 1.25 / positive(scale, 1),
					outlineWidth: 3.25 / positive(scale, 1),
					arrowSize: 6 / positive(scale, 1),
					offset: 12 / positive(scale, 1)
				}
			}

			function drawRotationGuide(ctx, points, direction, visual) {
				const bounds = pointBounds(points)
				const centerX = (bounds.minX + bounds.maxX) / 2
				const centerY = (bounds.minY + bounds.maxY) / 2
				const radiusX = Math.max(18, (bounds.maxX - bounds.minX) / 2 + visual.offset)
				const radiusY = Math.max(18, (bounds.maxY - bounds.minY) / 2 + visual.offset)
				drawRotationGuidePass(ctx, centerX, centerY, radiusX, radiusY, direction, visual.outline, visual.outlineWidth, visual.arrowSize + visual.outlineWidth)
				drawRotationGuidePass(ctx, centerX, centerY, radiusX, radiusY, direction, visual.main, visual.lineWidth, visual.arrowSize)
			}

			function drawRotationGuidePass(ctx, centerX, centerY, radiusX, radiusY, direction, color, lineWidth, arrowSize) {
				const sweep = direction * Math.PI * 5 / 6
				for (const start of [-Math.PI * 5 / 12, Math.PI * 7 / 12]) {
					const end = start + sweep
					ctx.beginPath?.()
					if (typeof ctx.ellipse === 'function') {
						ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, start, end, direction < 0)
					} else {
						ctx.arc?.(centerX, centerY, Math.max(radiusX, radiusY), start, end, direction < 0)
					}
					ctx.strokeStyle = color
					ctx.lineWidth = lineWidth
					ctx.lineCap = 'round'
					ctx.stroke?.()
					const point = [
						centerX + radiusX * Math.cos(end),
						centerY + radiusY * Math.sin(end)
					]
					const tangent = normalizeVector([
						-radiusX * Math.sin(end) * direction,
						radiusY * Math.cos(end) * direction
					])
					drawArrowhead(ctx, point, tangent, arrowSize, color)
				}
			}

			function drawMirrorGuide(ctx, renderGame, points, axis, visual) {
				const origin = projectPosition(renderGame, plan.target)
				const basisPoint = projectPosition(
					renderGame,
					axis === 'u'
						? [plan.target[0] + 1, plan.target[1]]
						: [plan.target[0], plan.target[1] + 1]
				)
				if (!origin || !basisPoint) return
				const direction = normalizeVector([basisPoint[0] - origin[0], basisPoint[1] - origin[1]])
				const normal = [-direction[1], direction[0]]
				const center = points.reduce(function (value, point) {
					value[0] += point[0] / points.length
					value[1] += point[1] / points.length
					return value
				}, [0, 0])
				const extents = projectedExtents(points, center, direction, normal)
				for (const side of [extents.minNormal - visual.offset, extents.maxNormal + visual.offset]) {
					const start = addVectors(center, scaleVector(direction, extents.minDirection), scaleVector(normal, side))
					const end = addVectors(center, scaleVector(direction, extents.maxDirection), scaleVector(normal, side))
					drawDoubleArrowPass(ctx, start, end, visual.outline, visual.outlineWidth, visual.arrowSize + visual.outlineWidth)
					drawDoubleArrowPass(ctx, start, end, visual.main, visual.lineWidth, visual.arrowSize)
				}
			}

			function drawDoubleArrowPass(ctx, start, end, color, lineWidth, arrowSize) {
				const direction = normalizeVector([end[0] - start[0], end[1] - start[1]])
				ctx.beginPath?.()
				ctx.moveTo?.(start[0], start[1])
				ctx.lineTo?.(end[0], end[1])
				ctx.strokeStyle = color
				ctx.lineWidth = lineWidth
				ctx.lineCap = 'round'
				ctx.stroke?.()
				drawArrowhead(ctx, end, direction, arrowSize, color)
				drawArrowhead(ctx, start, [-direction[0], -direction[1]], arrowSize, color)
			}

			function drawArrowhead(ctx, point, direction, size, color) {
				const normal = [-direction[1], direction[0]]
				const base = [point[0] - direction[0] * size, point[1] - direction[1] * size]
				ctx.beginPath?.()
				ctx.moveTo?.(point[0], point[1])
				ctx.lineTo?.(base[0] + normal[0] * size * .55, base[1] + normal[1] * size * .55)
				ctx.lineTo?.(base[0] - normal[0] * size * .55, base[1] - normal[1] * size * .55)
				ctx.closePath?.()
				ctx.fillStyle = color
				ctx.fill?.()
			}

			function pointBounds(points) {
				return points.reduce(function (bounds, point) {
					bounds.minX = Math.min(bounds.minX, point[0])
					bounds.maxX = Math.max(bounds.maxX, point[0])
					bounds.minY = Math.min(bounds.minY, point[1])
					bounds.maxY = Math.max(bounds.maxY, point[1])
					return bounds
				}, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
			}

			function projectedExtents(points, center, direction, normal) {
				const result = {
					minDirection: Infinity,
					maxDirection: -Infinity,
					minNormal: Infinity,
					maxNormal: -Infinity
				}
				for (const point of points) {
					const relative = [point[0] - center[0], point[1] - center[1]]
					const along = relative[0] * direction[0] + relative[1] * direction[1]
					const across = relative[0] * normal[0] + relative[1] * normal[1]
					result.minDirection = Math.min(result.minDirection, along)
					result.maxDirection = Math.max(result.maxDirection, along)
					result.minNormal = Math.min(result.minNormal, across)
					result.maxNormal = Math.max(result.maxNormal, across)
				}
				return result
			}

			function normalizeVector(value) {
				const length = Math.hypot(value[0], value[1]) || 1
				return [value[0] / length, value[1] / length]
			}

			function scaleVector(value, scale) {
				return [value[0] * scale, value[1] * scale]
			}

			function addVectors() {
				const result = [0, 0]
				for (const value of arguments) {
					result[0] += value[0]
					result[1] += value[1]
				}
				return result
			}

			function showGuideLayer() {
				const canvas = guideLayerCanvas
				if (!canvas?.style || !guideAction) return
				setStyleValue(canvas.style, 'transition', 'opacity ' + GUIDE_TRANSITION_MS + 'ms ease-out')
				const show = function () {
					if (guideLayerCanvas === canvas && guideAction) setStyleValue(canvas.style, 'opacity', '1')
				}
				if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(show)
				else globalThis.setTimeout?.(show, 0)
			}

			function markPreviewDirty() {
				metrics.layerDirtyMarks += 1
				api.render.markDirty(RENDER_LAYER_ID, game)
			}

			function markGuideDirty() {
				api.render.markDirty(GUIDE_LAYER_ID, game)
			}

			function syncRenderView(renderGame) {
				if (!plan || !shouldRender(renderGame)) return
				const next = createRenderViewSignature(renderGame)
				if (next === renderViewSignature) return
				renderViewSignature = next
				renderedPlanPoint = null
				guideRenderedPlanPoint = null
				resetVisualFollow()
				markPreviewDirty()
				if (guideAction) markGuideDirty()
			}

			function syncVisualFollow(renderGame) {
				if (!renderLayerCanvas?.style || !renderedPlanPoint || !plan || !target || !shouldRender(renderGame)) {
					resetVisualFollow()
					return
				}
				const targetPoint = projectPosition(renderGame, target)
				if (!targetPoint) {
					resetVisualFollow()
					return
				}
				const scaleX = positive(renderLayerScale?.x, 1)
				const scaleY = positive(renderLayerScale?.y, 1)
				const offsetX = roundCss((targetPoint[0] - renderedPlanPoint[0]) * scaleX)
				const offsetY = roundCss((targetPoint[1] - renderedPlanPoint[1]) * scaleY)
				const provisional = calculating || !!pendingFollowPlan || !samePosition(plan.target, target)
				const signature = [offsetX, offsetY, provisional ? 1 : 0].join(':')
				syncGuideVisualFollow(renderGame, targetPoint)
				if (signature === visualFollowSignature) return
				visualFollowSignature = signature
				const style = renderLayerCanvas.style
				const transformValue = offsetX || offsetY ? 'translate3d(' + offsetX + 'px, ' + offsetY + 'px, 0)' : ''
				if (style.transform !== transformValue) {
					style.transform = offsetX || offsetY ? 'translate3d(' + offsetX + 'px, ' + offsetY + 'px, 0)' : ''
				}
				applyVisualFollowStyles(provisional, true)
				metrics.visualFollowUpdates += 1
			}

			function resetVisualFollow(preserveTransition) {
				visualFollowSignature = null
				if (renderLayerCanvas?.style) {
					const layerReady = active && !paused && !!blueprint
					setStyleValue(renderLayerCanvas.style, 'transform', '')
					applyVisualFollowStyles(false, layerReady || preserveTransition === true)
				}
				if (guideLayerCanvas?.style) setStyleValue(guideLayerCanvas.style, 'transform', '')
			}

			function setRenderLayerCanvas(nextCanvas) {
				if (!nextCanvas || nextCanvas === renderLayerCanvas) return
				clearVisualFollowStyles(renderLayerCanvas)
				renderLayerCanvas = nextCanvas
				renderLayerScale = null
				visualFollowSignature = null
			}

			function setGuideLayerCanvas(nextCanvas) {
				if (!nextCanvas || nextCanvas === guideLayerCanvas) return
				clearGuideLayerStyles(guideLayerCanvas)
				guideLayerCanvas = nextCanvas
				guideLayerScale = null
				const style = guideLayerCanvas.style
				if (style) {
					setStyleValue(style, 'pointerEvents', 'none')
					setStyleValue(style, 'transformOrigin', '0 0')
					setStyleValue(style, 'opacity', '0')
					setStyleValue(style, 'transition', 'opacity ' + GUIDE_TRANSITION_MS + 'ms ease-out')
					setStyleValue(style, 'willChange', 'transform, opacity')
				}
			}

			function refreshRenderLayerScale() {
				if (!renderLayerCanvas) {
					renderLayerScale = null
					return
				}
				const width = positive(renderLayerCanvas.width, 1)
				const height = positive(renderLayerCanvas.height, 1)
				const rect = renderLayerCanvas.getBoundingClientRect?.()
				renderLayerScale = Object.freeze({
					x: positive(rect?.width, width) / width,
					y: positive(rect?.height, height) / height
				})
			}

			function refreshGuideLayerScale() {
				if (!guideLayerCanvas) {
					guideLayerScale = null
					return
				}
				const width = positive(guideLayerCanvas.width, 1)
				const height = positive(guideLayerCanvas.height, 1)
				const rect = guideLayerCanvas.getBoundingClientRect?.()
				guideLayerScale = Object.freeze({
					x: positive(rect?.width, width) / width,
					y: positive(rect?.height, height) / height
				})
			}

			function syncGuideVisualFollow(renderGame, targetPoint) {
				if (!guideAction || !guideLayerCanvas?.style || !guideRenderedPlanPoint || !targetPoint) {
					if (guideLayerCanvas?.style) setStyleValue(guideLayerCanvas.style, 'transform', '')
					return
				}
				const scaleX = positive(guideLayerScale?.x, 1)
				const scaleY = positive(guideLayerScale?.y, 1)
				const offsetX = roundCss((targetPoint[0] - guideRenderedPlanPoint[0]) * scaleX)
				const offsetY = roundCss((targetPoint[1] - guideRenderedPlanPoint[1]) * scaleY)
				setStyleValue(
					guideLayerCanvas.style,
					'transform',
					offsetX || offsetY ? 'translate3d(' + offsetX + 'px, ' + offsetY + 'px, 0)' : ''
				)
			}

			function applyVisualFollowStyles(provisional, layerReady) {
				const style = renderLayerCanvas?.style
				if (!style) return
				setStyleValue(style, 'transformOrigin', layerReady ? '0 0' : '')
				setStyleValue(style, 'filter', '')
				setStyleValue(style, 'opacity', layerReady ? (provisional ? PENDING_PREVIEW_OPACITY : '1') : '')
				setStyleValue(style, 'transition', layerReady ? PENDING_PREVIEW_TRANSITION : '')
				setStyleValue(style, 'willChange', layerReady ? 'transform' : '')
			}

			function clearVisualFollowStyles(layerCanvas) {
				const style = layerCanvas?.style
				if (!style) return
				setStyleValue(style, 'transformOrigin', '')
				setStyleValue(style, 'transform', '')
				setStyleValue(style, 'filter', '')
				setStyleValue(style, 'opacity', '')
				setStyleValue(style, 'transition', '')
				setStyleValue(style, 'willChange', '')
			}

			function clearGuideLayerStyles(layerCanvas) {
				const style = layerCanvas?.style
				if (!style) return
				setStyleValue(style, 'transformOrigin', '')
				setStyleValue(style, 'transform', '')
				setStyleValue(style, 'opacity', '')
				setStyleValue(style, 'transition', '')
				setStyleValue(style, 'willChange', '')
				setStyleValue(style, 'pointerEvents', '')
			}

			function setStyleValue(style, property, value) {
				if (style[property] === value) return
				style[property] = value
			}

			function createRenderViewSignature(renderGame) {
				if (!renderGame || !plan) return null
				const origin = projectPosition(renderGame, plan.target)
				const uBasis = projectPosition(renderGame, [plan.target[0] + 1, plan.target[1]])
				const vBasis = projectPosition(renderGame, [plan.target[0], plan.target[1] + 1])
				return [
					positive(renderGame.canvas?.width, positive(renderGame.w, 0)),
					positive(renderGame.canvas?.height, positive(renderGame.h, 0)),
					finiteOr(renderGame.w2, 0),
					finiteOr(renderGame.h2, 0),
					finiteOr(renderGame.unit, 0),
					finiteOr(renderGame.zoom, 0),
					renderGame.plane ? 1 : 0,
					origin && uBasis ? roundCss(uBasis[0] - origin[0]) : 'u-x',
					origin && uBasis ? roundCss(uBasis[1] - origin[1]) : 'u-y',
					origin && vBasis ? roundCss(vBasis[0] - origin[0]) : 'v-x',
					origin && vBasis ? roundCss(vBasis[1] - origin[1]) : 'v-y'
				].join(':')
			}

			function projectPosition(renderGame, position) {
				try {
					const projected = renderGame?.uvToXY?.(position)
					const x = Number(projected?.[0])
					const y = Number(projected?.[1])
					return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
				} catch (error) {
					return null
				}
			}

			function finishCameraDrag() {
				if (!cameraDragging) return false
				cameraDragging = false
				if (!plan || !renderedPlanPoint || !shouldRender(game)) return false
				const currentPlanPoint = projectPosition(game, plan.target)
				if (
					!currentPlanPoint ||
					(
						roundCss(currentPlanPoint[0] - renderedPlanPoint[0]) === 0 &&
						roundCss(currentPlanPoint[1] - renderedPlanPoint[1]) === 0
					)
				) {
					return false
				}
				renderViewSignature = createRenderViewSignature(game)
				markPreviewDirty()
				if (guideAction) markGuideDirty()
				return true
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

			function roundTiming(value) {
				return Math.round(Math.max(0, Number(value) || 0) * 1000) / 1000
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

			function consume(event) {
				event?.preventDefault?.()
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
