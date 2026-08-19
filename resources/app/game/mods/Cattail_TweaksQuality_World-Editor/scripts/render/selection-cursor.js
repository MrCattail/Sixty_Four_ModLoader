ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const BLUEPRINT_PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const CURSOR_KEY = Symbol.for('cattail.world-editor.selection-cursor')
		const RENDER_LAYER_ID = 'cursor'
		const RENDER_CALLBACK_ID = 'world-editor-selection-cursor'
		const BLUE_RISE_MS = 180
		const ORANGE_RISE_MS = 160
		const COMMIT_DRAIN_MS = 520
		const RETURN_BLUE_RISE_MS = 520
		const CANCEL_DRAIN_MS = 120
		const REDUCED_MOTION_MS = 50
		const MARKER_WIDTH_CSS = 26
		const MARKER_HEIGHT_CSS = 39
		const OUTLINE_WIDTH_CSS = .75
		const INNER_SHADOW_WIDTH_CSS = 1.1
		const INNER_SHADOW_BLUR_CSS = 2.4
		const INNER_SHADOW_OFFSET_Y_CSS = .8
		const CLEAR_RADIUS_CSS = 14
		const BLUE = '#5DD3FF'
		const ORANGE = '#FFA84E'
		const INNER_SHADOW_STROKE = 'rgba(0, 0, 0, .28)'
		const INNER_SHADOW_COLOR = 'rgba(0, 0, 0, .58)'

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const shared = globalThis[SHARED_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			const resizeHandles = globalThis[RESIZE_HANDLES_KEY]
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Selection cursor could not find the editor runtime.')
				return
			}
			if (
				!selection ||
				selection.game !== game ||
				typeof selection.snapshot !== 'function' ||
				typeof selection.subscribe !== 'function' ||
				typeof selection.selectionAt !== 'function'
			) {
				console.warn('[Cattail World Editor] Selection cursor could not find the selection state.')
				return
			}
			if (!tool || typeof tool.snapshot !== 'function' || typeof tool.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Selection cursor could not find the selection tool.')
				return
			}
			if (!canvas || typeof canvas.addEventListener !== 'function') {
				console.warn('[Cattail World Editor] Selection cursor requires the game canvas.')
				return
			}
			if (!api.render || typeof api.render.onLayer !== 'function') {
				console.warn('[Cattail World Editor] Selection cursor requires Render API v1.')
				return
			}

			const previous = globalThis[CURSOR_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('selection-cursor-replaced')

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTool = tool.snapshot()
			let pointerInside = canvasMatchesHover(canvas)
			let rightButtonDown = false
			let controlDown = false
			let disposed = false
			let phase = currentSelection?.previewKind === 'selection' ? 'orange-full' : 'empty'
			let phaseStartedAt = nowMs()
			let phaseStartLevel = phase === 'orange-full' ? 1 : 0
			let phaseDurationMs = 0
			let returnBlueRiseDurationMs = duration(BLUE_RISE_MS)

			const service = Object.freeze({
				version: '0.5.1',
				snapshot() {
					const visual = visualAt(nowMs())
					return {
						version: '0.5.1',
						phase,
						blueLevel: visual.blueLevel,
						orangeLevel: visual.orangeLevel,
						eligible: shouldReplaceCursor(game),
						pointerInside,
						rightButtonDown,
						controlDown,
						reducedMotion: prefersReducedMotion(),
						markerWidthCss: MARKER_WIDTH_CSS,
						markerHeightCss: MARKER_HEIGHT_CSS,
						durations: {
							blueRise: duration(BLUE_RISE_MS),
							orangeRise: duration(ORANGE_RISE_MS),
							commitDrain: duration(COMMIT_DRAIN_MS),
							returnBlueRise: duration(RETURN_BLUE_RISE_MS),
							cancelDrain: duration(CANCEL_DRAIN_MS)
						},
						disposed
					}
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					resetVisual(reason || 'selection-cursor-disposed')
					if (globalThis[CURSOR_KEY] === service) delete globalThis[CURSOR_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, CURSOR_KEY, {
				value: service,
				configurable: true,
				writable: true
			})

			function resetVisual() {
				phase = 'empty'
				phaseStartedAt = nowMs()
				phaseStartLevel = 0
				phaseDurationMs = 0
				returnBlueRiseDurationMs = duration(BLUE_RISE_MS)
			}

			function startBlueRise() {
				phase = 'blue-rising'
				phaseStartedAt = nowMs()
				phaseStartLevel = 0
			}

			function startOrangeRise() {
				const visual = visualAt(nowMs())
				phase = 'orange-rising'
				phaseStartedAt = nowMs()
				phaseStartLevel = visual.blueLevel
				phaseDurationMs = duration(ORANGE_RISE_MS)
			}

			function startReturnToIdle(committed) {
				const visual = visualAt(nowMs())
				phase = 'orange-draining'
				phaseStartedAt = nowMs()
				phaseStartLevel = visual.orangeLevel
				phaseDurationMs = duration(committed ? COMMIT_DRAIN_MS : CANCEL_DRAIN_MS)
				returnBlueRiseDurationMs = duration(committed ? RETURN_BLUE_RISE_MS : BLUE_RISE_MS)
			}

			function handleSelectionTransition(previousState, nextState) {
				const hadSelectionPreview = previousState?.previewKind === 'selection'
				const hasSelectionPreview = nextState?.previewKind === 'selection'
				if (!hadSelectionPreview && hasSelectionPreview) {
					startOrangeRise()
					return
				}
				if (!hadSelectionPreview || hasSelectionPreview) return
				startReturnToIdle(selectionWasCommitted(previousState, nextState))
			}

			function shouldReplaceCursor(renderGame) {
				if (disposed || renderGame !== game || !currentRuntime?.active || currentTool?.mode !== 'select') return false
				if (!game || game.halt || game.splash?.isShown || game.mouse?.cursorVisible === false) return false
				if (!pointerInside || rightButtonDown || !isCell(game.hoveredCell) || !mousePoint(game)) return false
				if (shared?.isWorldEditorInputBlocked?.() || blueprintPreviewActive()) return false
				const interaction = interactionSnapshot()
				if (interaction?.wheelLatched || isManipulationGesture(interaction?.gestureType)) return false
				if (currentSelection?.previewKind === 'move' || currentSelection?.previewKind === 'resize') return false
				if (isCompletionPhase(phase) || currentSelection?.previewKind === 'selection') return true
				if (resizeHandles?.snapshot?.().hoveredHandle) return false
				const hitId = selection.selectionAt(game.hoveredCell, game.plane)
				return controlDown || !Number.isInteger(hitId)
			}

			function blueprintPreviewActive() {
				try {
					return !!globalThis[BLUEPRINT_PREVIEW_KEY]?.snapshot?.().active
				} catch (error) {
					return false
				}
			}

			function interactionSnapshot() {
				try {
					return globalThis[INTERACTION_KEY]?.snapshot?.() || null
				} catch (error) {
					return null
				}
			}

			function handleCanvasMouseEnter(event) {
				pointerInside = true
				controlDown = !!event?.ctrlKey || controlDown
			}

			function handleCanvasMouseMove(event) {
				pointerInside = true
				controlDown = !!event?.ctrlKey || controlDown
				rightButtonDown = !!(Number(event?.buttons) & 2)
				if (rightButtonDown) resetVisual('mouse-right-drag')
			}

			function handleCanvasMouseDown(event) {
				pointerInside = true
				controlDown = !!event?.ctrlKey || controlDown
				if (event?.button !== 2) return
				rightButtonDown = true
				resetVisual('mouse-right')
			}

			function handleCanvasMouseUp(event) {
				pointerInside = true
				controlDown = !!event?.ctrlKey || controlDown
				if (event?.button === 2 || !(Number(event?.buttons) & 2)) rightButtonDown = false
			}

			function handleCanvasMouseLeave() {
				pointerInside = false
				rightButtonDown = false
				resetVisual('mouse-left-canvas')
			}

			function handleWindowKeyDown(event) {
				if (isControlKey(event)) controlDown = true
			}

			function handleWindowKeyUp(event) {
				if (isControlKey(event)) controlDown = false
			}

			function handleWindowMouseUp(event) {
				if (event?.button === 2 || !(Number(event?.buttons) & 2)) rightButtonDown = false
			}

			function handleWindowBlur() {
				pointerInside = false
				rightButtonDown = false
				controlDown = false
				resetVisual('window-blur')
			}

			const stopRendering = api.render.onLayer(RENDER_LAYER_ID, function ({ game: renderGame, ctx }) {
				if (!ctx || !shouldReplaceCursor(renderGame)) return
				drawSelectionCursor(ctx, game, visualAt(nowMs()))
			}, {
				id: RENDER_CALLBACK_ID,
				order: 100,
				space: 'screen',
				enabled({ game: renderGame }) {
					const enabled = shouldReplaceCursor(renderGame)
					if (!enabled) resetVisual('cursor-ineligible')
					else if (phase === 'empty') startBlueRise()
					return enabled
				}
			})

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state?.active) resetVisual('editor-inactive')
			})
			const stopSelectionSubscription = selection.subscribe(function (state) {
				const previousState = currentSelection
				currentSelection = state
				handleSelectionTransition(previousState, state)
			})
			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				if (state?.mode !== 'select') resetVisual('selection-tool-inactive')
			})

			canvas.addEventListener('mouseenter', handleCanvasMouseEnter, true)
			canvas.addEventListener('mousemove', handleCanvasMouseMove, true)
			canvas.addEventListener('mousedown', handleCanvasMouseDown, true)
			canvas.addEventListener('mouseup', handleCanvasMouseUp, true)
			canvas.addEventListener('mouseleave', handleCanvasMouseLeave, true)
			window.addEventListener('keydown', handleWindowKeyDown, true)
			window.addEventListener('keyup', handleWindowKeyUp, true)
			window.addEventListener('mouseup', handleWindowMouseUp, true)
			window.addEventListener('blur', handleWindowBlur, true)

			runtime.addCleanup(function () {
				canvas.removeEventListener('mouseenter', handleCanvasMouseEnter, true)
				canvas.removeEventListener('mousemove', handleCanvasMouseMove, true)
				canvas.removeEventListener('mousedown', handleCanvasMouseDown, true)
				canvas.removeEventListener('mouseup', handleCanvasMouseUp, true)
				canvas.removeEventListener('mouseleave', handleCanvasMouseLeave, true)
				window.removeEventListener('keydown', handleWindowKeyDown, true)
				window.removeEventListener('keyup', handleWindowKeyUp, true)
				window.removeEventListener('mouseup', handleWindowMouseUp, true)
				window.removeEventListener('blur', handleWindowBlur, true)
				if (typeof stopRendering === 'function') stopRendering()
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				service.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Animated selection cursor ready.')

		function visualAt(time) {
			const elapsed = Math.max(0, Number(time) - phaseStartedAt)
			if (phase === 'blue-rising' || phase === 'return-blue-rising') {
				const riseDuration = phase === 'return-blue-rising'
					? returnBlueRiseDurationMs
					: duration(BLUE_RISE_MS)
				const progress = normalizedProgress(elapsed, riseDuration)
				if (progress >= 1) {
					phase = 'blue-half'
					phaseStartLevel = .5
					return { blueLevel: .5, orangeLevel: 0 }
				}
				return { blueLevel: .5 * easeOutCubic(progress), orangeLevel: 0 }
			}
			if (phase === 'blue-half') return { blueLevel: .5, orangeLevel: 0 }
			if (phase === 'orange-rising') {
				const progress = normalizedProgress(elapsed, phaseDurationMs || duration(ORANGE_RISE_MS))
				if (progress >= 1) {
					phase = 'orange-full'
					phaseStartLevel = 1
					return { blueLevel: 0, orangeLevel: 1 }
				}
				return { blueLevel: phaseStartLevel, orangeLevel: easeOutCubic(progress) }
			}
			if (phase === 'orange-full') return { blueLevel: 0, orangeLevel: 1 }
			if (phase === 'orange-draining') {
				const drainDuration = phaseDurationMs || duration(COMMIT_DRAIN_MS)
				const progress = normalizedProgress(elapsed, drainDuration)
				if (progress >= 1) {
					phase = 'return-blue-rising'
					phaseStartedAt += drainDuration
					phaseStartLevel = 0
					phaseDurationMs = returnBlueRiseDurationMs
					return visualAt(time)
				}
				return { blueLevel: 0, orangeLevel: phaseStartLevel * (1 - easeInOutCubic(progress)) }
			}
			return { blueLevel: 0, orangeLevel: 0 }
		}

		function duration(value) {
			return prefersReducedMotion() ? REDUCED_MOTION_MS : value
		}

		function prefersReducedMotion() {
			try {
				return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
			} catch (error) {
				return false
			}
		}

		function nowMs() {
			const value = globalThis.performance?.now?.()
			return Number.isFinite(Number(value)) ? Number(value) : Date.now()
		}

		function normalizedProgress(elapsed, phaseDuration) {
			if (!Number.isFinite(Number(phaseDuration)) || Number(phaseDuration) <= 0) return 1
			return clamp(Number(elapsed) / Number(phaseDuration), 0, 1)
		}

		function easeOutCubic(value) {
			return 1 - Math.pow(1 - clamp(value, 0, 1), 3)
		}

		function easeInOutCubic(value) {
			const progress = clamp(value, 0, 1)
			return progress < .5
				? 4 * progress * progress * progress
				: 1 - Math.pow(-2 * progress + 2, 3) / 2
		}

		function selectionWasCommitted(previousState, nextState) {
			if (String(nextState?.lastReason || '').includes('second-click')) return true
			if (String(nextState?.lastReason || '').includes('selection-committed')) return true
			if (Number(nextState?.selectionCount) !== Number(previousState?.selectionCount)) return true
			return Number.isInteger(nextState?.primaryId) && nextState?.primaryId !== previousState?.primaryId
		}

		function isManipulationGesture(value) {
			return value === 'pending-move' || value === 'move' || value === 'resize' ||
				value === 'wheel-pending' || value === 'wheel-move' || value === 'wheel-resize'
		}

		function isCompletionPhase(value) {
			return value === 'orange-rising' || value === 'orange-full' ||
				value === 'orange-draining' || value === 'return-blue-rising'
		}

		function isControlKey(event) {
			return event?.key === 'Control' || event?.code === 'ControlLeft' || event?.code === 'ControlRight'
		}

		function canvasMatchesHover(canvas) {
			try {
				return !!canvas?.matches?.(':hover')
			} catch (error) {
				return false
			}
		}

		function mousePoint(game) {
			const point = game?.mouse?.xy
			if (!Array.isArray(point) || point.length < 2) return null
			const x = Number(point[0])
			const y = Number(point[1])
			return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
		}

		function isCell(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isInteger(Number(value[0])) && Number.isInteger(Number(value[1]))
		}

		function drawSelectionCursor(ctx, game, visual) {
			const point = mousePoint(game)
			if (!ctx || !point) return
			const scale = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.globalCompositeOperation = 'destination-out'
				ctx.beginPath()
				ctx.arc(point[0], point[1], CLEAR_RADIUS_CSS * scale, 0, Math.PI * 2)
				ctx.closePath()
				ctx.fill()
				ctx.globalCompositeOperation = 'source-over'
				ctx.translate(point[0], point[1])
				drawMarkerBody(ctx, scale)
				drawMarkerFill(ctx, scale, visual)
				drawInnerRimShadow(ctx, scale)
			} finally {
				ctx.restore()
			}
		}

		function drawMarkerBody(ctx, scale) {
			ctx.save()
			try {
				traceOuterMarker(ctx, scale)
				ctx.fillStyle = '#000000'
				ctx.fill()
				ctx.strokeStyle = '#FFFFFF'
				ctx.lineWidth = OUTLINE_WIDTH_CSS * scale
				ctx.lineJoin = 'round'
				ctx.stroke()
				ctx.globalCompositeOperation = 'destination-out'
				traceInnerMarker(ctx, scale)
				ctx.fill()
			} finally {
				ctx.restore()
			}
		}

		function drawMarkerFill(ctx, scale, visual) {
			const top = -35.2 * scale
			const bottom = -5.7 * scale
			const height = bottom - top
			ctx.save()
			try {
				traceInnerMarker(ctx, scale)
				ctx.clip()
				fillLevel(ctx, scale, BLUE, clamp(visual?.blueLevel, 0, .5), top, bottom, height)
				fillLevel(ctx, scale, ORANGE, clamp(visual?.orangeLevel, 0, 1), top, bottom, height)
			} finally {
				ctx.restore()
			}
		}

		function fillLevel(ctx, scale, color, level, top, bottom, height) {
			if (!(level > 0)) return
			const fillHeight = height * level
			const fillTop = bottom - fillHeight
			ctx.fillStyle = color
			ctx.fillRect(-10 * scale, fillTop, 20 * scale, fillHeight + scale)
		}

		function drawInnerRimShadow(ctx, scale) {
			ctx.save()
			try {
				traceInnerMarker(ctx, scale)
				ctx.clip()
				traceInnerMarker(ctx, scale)
				ctx.strokeStyle = INNER_SHADOW_STROKE
				ctx.lineWidth = INNER_SHADOW_WIDTH_CSS * scale
				ctx.lineJoin = 'round'
				ctx.shadowColor = INNER_SHADOW_COLOR
				ctx.shadowBlur = INNER_SHADOW_BLUR_CSS * scale
				ctx.shadowOffsetY = INNER_SHADOW_OFFSET_Y_CSS * scale
				ctx.stroke()
			} finally {
				ctx.restore()
			}
		}

		function traceOuterMarker(ctx, scale) {
			ctx.beginPath()
			ctx.moveTo(0, 0)
			ctx.bezierCurveTo(-2 * scale, 0, -3.1 * scale, -2.6 * scale, -4.2 * scale, -5.4 * scale)
			ctx.lineTo(-11.2 * scale, -21.4 * scale)
			ctx.bezierCurveTo(-12.5 * scale, -24.2 * scale, -13 * scale, -26.4 * scale, -13 * scale, -28.1 * scale)
			ctx.bezierCurveTo(-13 * scale, -34.1 * scale, -7.2 * scale, -39 * scale, 0, -39 * scale)
			ctx.bezierCurveTo(7.2 * scale, -39 * scale, 13 * scale, -34.1 * scale, 13 * scale, -28.1 * scale)
			ctx.bezierCurveTo(13 * scale, -26.4 * scale, 12.5 * scale, -24.2 * scale, 11.2 * scale, -21.4 * scale)
			ctx.lineTo(4.2 * scale, -5.4 * scale)
			ctx.bezierCurveTo(3.1 * scale, -2.6 * scale, 2 * scale, 0, 0, 0)
			ctx.closePath()
		}

		function traceInnerMarker(ctx, scale) {
			ctx.beginPath()
			ctx.moveTo(0, -5.7 * scale)
			ctx.bezierCurveTo(-.7 * scale, -5.7 * scale, -1.1 * scale, -6.2 * scale, -1.5 * scale, -6.6 * scale)
			ctx.lineTo(-8.4 * scale, -22.5 * scale)
			ctx.bezierCurveTo(-9.2 * scale, -24.4 * scale, -9.7 * scale, -26.4 * scale, -9.7 * scale, -28 * scale)
			ctx.bezierCurveTo(-9.7 * scale, -32 * scale, -5.2 * scale, -35.2 * scale, 0, -35.2 * scale)
			ctx.bezierCurveTo(5.2 * scale, -35.2 * scale, 9.7 * scale, -32 * scale, 9.7 * scale, -28 * scale)
			ctx.bezierCurveTo(9.7 * scale, -26.4 * scale, 9.2 * scale, -24.4 * scale, 8.4 * scale, -22.5 * scale)
			ctx.lineTo(1.5 * scale, -6.6 * scale)
			ctx.bezierCurveTo(1.1 * scale, -6.2 * scale, .7 * scale, -5.7 * scale, 0, -5.7 * scale)
			ctx.closePath()
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, Number(value) || 0))
		}
		})
	}
})
