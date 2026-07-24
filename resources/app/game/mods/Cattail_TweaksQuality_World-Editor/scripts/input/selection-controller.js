ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
		const INTERACTION_KEY = Symbol.for('cattail.world-editor.selection-interaction')
		const LONG_PRESS_MS = 220
		const MOVE_SLOP_PX = 6
		const WHEEL_COMMIT_MS = 1250
		const WHEEL_PIXEL_THRESHOLD = 100
		const WHEEL_MAX_STEPS = 4
		const WHEEL_EDGE_CORNER_PX = 16
		const WHEEL_EDGE_OPPOSITE_GUARD_PX = 4
		const WHEEL_BOTTOM_TIE_PX = 1
		const WHEEL_EDGE_SIDE_EPSILON_PX = .01
		const WHEEL_UNLOCK_SLOP_PX = 6

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			const resizeHandles = globalThis[RESIZE_HANDLES_KEY]
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Selection input 2G could not find the editor runtime.')
				return
			}
			if (
				!selection ||
				selection.game !== game ||
				typeof selection.snapshot !== 'function' ||
				typeof selection.subscribe !== 'function' ||
				typeof selection.begin !== 'function' ||
				typeof selection.updatePreview !== 'function' ||
				typeof selection.commit !== 'function' ||
				typeof selection.beginMove !== 'function' ||
				typeof selection.updateMove !== 'function' ||
				typeof selection.commitMove !== 'function' ||
				typeof selection.beginResize !== 'function' ||
				typeof selection.updateResize !== 'function' ||
					typeof selection.commitResize !== 'function' ||
					typeof selection.cancelPreview !== 'function' ||
					typeof selection.hasPreview !== 'function' ||
					typeof selection.selectionAt !== 'function' ||
					typeof selection.setPrimary !== 'function' ||
					typeof selection.isPrimarySelected !== 'function'
				) {
					console.warn('[Cattail World Editor] Selection input 2G could not find the selection state.')
					return
				}
			if (!tool || typeof tool.snapshot !== 'function' || tool.snapshot().mode !== 'select') {
				console.warn('[Cattail World Editor] Selection input 2G requires the unified selection tool.')
				return
			}
			if (!resizeHandles || typeof resizeHandles.hitTest !== 'function') {
				console.warn('[Cattail World Editor] Selection input 2G could not find the resize handle service.')
			}
			if (!canvas || typeof canvas.addEventListener !== 'function') {
				console.warn('[Cattail World Editor] Selection input 2G requires the game canvas.')
				return
			}

			const previousInteraction = globalThis[INTERACTION_KEY]
			if (previousInteraction && typeof previousInteraction.dispose === 'function') {
				previousInteraction.dispose('selection-interaction-replaced')
			}

			let gesture = null
			let wheelLatch = null
			let longPressTimer = null
			let wheelCommitTimer = null
			let disposed = false

			const interaction = Object.freeze({
				version: '0.2.6',
				longPressMs: LONG_PRESS_MS,
				moveSlopPx: MOVE_SLOP_PX,
				wheelCommitMs: WHEEL_COMMIT_MS,
				wheelPixelThreshold: WHEEL_PIXEL_THRESHOLD,
				wheelMaxSteps: WHEEL_MAX_STEPS,
				wheelEdgeCornerPx: WHEEL_EDGE_CORNER_PX,
				wheelEdgeOppositeGuardPx: WHEEL_EDGE_OPPOSITE_GUARD_PX,
				wheelBottomTiePx: WHEEL_BOTTOM_TIE_PX,
				wheelEdgeSideEpsilonPx: WHEEL_EDGE_SIDE_EPSILON_PX,
				wheelUnlockSlopPx: WHEEL_UNLOCK_SLOP_PX,
				snapshot() {
					return {
						version: '0.2.6',
						gestureType: gesture?.type || null,
						gestureSelectionId: gesture?.selectionId || null,
						gestureAdditive: !!gesture?.additive,
						wheelTarget: isWheelGesture(gesture) ? gesture.target : wheelLatch?.target || null,
						wheelSelectionId: isWheelGesture(gesture) ? gesture.selectionId : wheelLatch?.selectionId || null,
						wheelAxis: isWheelGesture(gesture) ? gesture.wheelAxis : null,
						wheelLatched: !!wheelLatch,
						wheelLatchHandle: wheelLatch?.target === 'resize' ? wheelLatch.handle : null,
						wheelLatchDirection: wheelLatch?.target === 'move' ? wheelLatch.direction.slice() : null,
						wheelLatchEdges: wheelLatch?.target === 'move' ? wheelLatch.edges.slice() : null,
						wheelLatchCorner: wheelLatch?.target === 'move' ? wheelLatch.corner : null,
						wheelLatchVisualCorner: wheelLatch?.target === 'move' ? wheelLatch.visualCorner : null,
						wheelLatchVisualSide: wheelLatch?.target === 'move' ? wheelLatch.visualSide : null,
						longPressMs: LONG_PRESS_MS,
						moveSlopPx: MOVE_SLOP_PX,
						wheelCommitMs: WHEEL_COMMIT_MS,
						wheelPixelThreshold: WHEEL_PIXEL_THRESHOLD,
						wheelMaxSteps: WHEEL_MAX_STEPS,
						wheelEdgeCornerPx: WHEEL_EDGE_CORNER_PX,
						wheelEdgeOppositeGuardPx: WHEEL_EDGE_OPPOSITE_GUARD_PX,
						wheelBottomTiePx: WHEEL_BOTTOM_TIE_PX,
						wheelEdgeSideEpsilonPx: WHEEL_EDGE_SIDE_EPSILON_PX,
						wheelUnlockSlopPx: WHEEL_UNLOCK_SLOP_PX,
						disposed
					}
				},
				cancelPending(reason) {
					return cancelInteraction(reason || 'interaction-cancelled')
				},
				dispose(reason) {
					if (disposed) return false
					cancelInteraction(reason || 'interaction-disposed')
					disposed = true
					if (globalThis[INTERACTION_KEY] === interaction) delete globalThis[INTERACTION_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, INTERACTION_KEY, {
				value: interaction,
				configurable: true,
				writable: true
			})

			function clearLongPressTimer() {
				if (longPressTimer === null) return
				const clear = typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout : null
				if (clear) clear(longPressTimer)
				longPressTimer = null
			}

			function clearWheelCommitTimer() {
				if (wheelCommitTimer === null) return
				const clear = typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout : null
				if (clear) clear(wheelCommitTimer)
				wheelCommitTimer = null
			}

			function clearGesture() {
				clearLongPressTimer()
				clearWheelCommitTimer()
				gesture = null
			}

			function clearWheelLatch() {
				wheelLatch = null
			}

			function cancelInteraction(reason) {
				if (disposed) return false
				const hadGesture = !!gesture
				const hadWheelLatch = !!wheelLatch
				clearGesture()
				clearWheelLatch()
				const cancelledPreview = selection.hasPreview()
					? selection.cancelPreview(String(reason || 'interaction-cancelled'))
					: false
				return hadGesture || hadWheelLatch || cancelledPreview
			}

			function scheduleLongPress() {
				clearLongPressTimer()
				const schedule = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null
				if (!schedule) return
				longPressTimer = schedule(function () {
					longPressTimer = null
					startMove('mouse-long-press')
				}, LONG_PRESS_MS)
			}

			function scheduleWheelCommit() {
				clearWheelCommitTimer()
				const schedule = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout : null
				if (!schedule) return
				wheelCommitTimer = schedule(function () {
					wheelCommitTimer = null
					settleWheel('wheel-idle-commit')
				}, WHEEL_COMMIT_MS)
			}

			function settleWheel(reason) {
				if (!isWheelGesture(gesture)) return false
				const completed = gesture
				if (completed.target === 'resize' && wheelLatch?.target === 'resize') {
					const activeHandle = selection.snapshot()?.resizeHandle
					if (activeHandle) wheelLatch.handle = activeHandle
				}
				clearGesture()
				if (completed.type === 'wheel-pending') return true
				const commit = completed.target === 'resize'
					? selection.commitResize(completed.currentCell, completed.plane, reason || 'wheel-resize-commit')
					: selection.commitMove(completed.currentCell, completed.plane, reason || 'wheel-move-commit')
				if (!commit && selection.hasPreview()) {
					selection.cancelPreview('wheel-commit-failed')
				}
				if (!commit) clearWheelLatch()
				return commit
			}

			function startMove(reason) {
				if (
					disposed ||
					gesture?.type !== 'pending-move' ||
					!runtime.isActive() ||
					game.halt ||
					game.splash?.isShown ||
					gesture.plane !== (game.plane ? 1 : 0)
				) {
					clearGesture()
					return false
				}
				const pending = gesture
				clearLongPressTimer()
				if (!selection.beginMove(pending.cell, pending.plane, reason || 'mouse-move-start')) {
					gesture = null
					return false
				}
				gesture = Object.assign({}, pending, { type: 'move' })
				if (isCell(game.hoveredCell)) {
					selection.updateMove(game.hoveredCell, game.plane, 'mouse-move-preview')
				}
				return true
			}

			function performClick(cell, plane, completed) {
				if (!isCell(cell) || plane !== (game.plane ? 1 : 0)) return false
				const current = selection.snapshot()
				if (current?.previewKind === 'selection') {
					return selection.commit(cell, plane, 'mouse-second-click')
				}
				if (selection.hasPreview()) return false
				if (completed?.activatedPrimary) return true
				if (completed?.insideSelection && Number(current?.selectionCount) > 1) return true
				return selection.begin(cell, plane, 'mouse-first-click', {
					additive: !!completed?.additive
				})
			}

			function releaseWheelLatchOnPointerMove(event) {
				if (!wheelLatch) return false
				const pointer = pointerPosition(event)
				if (!pointer) return false
				const dx = pointer[0] - wheelLatch.pointer[0]
				const dy = pointer[1] - wheelLatch.pointer[1]
				if (dx * dx + dy * dy < WHEEL_UNLOCK_SLOP_PX * WHEEL_UNLOCK_SLOP_PX) return false
				if (isWheelGesture(gesture)) settleWheel('wheel-pointer-move-commit')
				clearWheelLatch()
				return true
			}

			function createWheelGestureFromLatch() {
				if (!wheelLatch || selection.hasPreview()) return null
				const current = selection.snapshot()
				const selected = current?.selectedRange
				if (
					!selected ||
					current.primaryId !== wheelLatch.selectionId ||
					current.plane !== wheelLatch.plane ||
					wheelLatch.plane !== (game.plane ? 1 : 0)
				) {
					clearWheelLatch()
					return null
				}
				const cell = cloneCell(selected.start)
				if (!cell) {
					clearWheelLatch()
					return null
				}
				return {
					type: 'wheel-pending',
					target: wheelLatch.target,
					handle: wheelLatch.target === 'resize' ? wheelLatch.handle : null,
					direction: wheelLatch.target === 'move' ? wheelLatch.direction.slice() : null,
					outward: wheelLatch.target === 'resize' ? wheelLatch.outward.slice() : null,
					cell,
					currentCell: cell.slice(),
					selectionId: wheelLatch.selectionId,
					plane: wheelLatch.plane,
					wheelAxis: null,
					accumulator: 0
				}
			}

			function acquireWheelGesture(event, input) {
				if (
					disposed ||
					!runtime.isActive() ||
					game.halt ||
					game.splash?.isShown ||
					hasWheelModifier(event) ||
					input.axis !== 'vertical' ||
					selection.hasPreview()
				) {
					return null
				}
				refreshHoveredCell(game, event)
				const cell = cloneCell(game.hoveredCell)
				if (!cell) return null
				const plane = game.plane ? 1 : 0
				const pointer = pointerPosition(event)
				if (!pointer) return null
				const current = selection.snapshot()
				if (!Number.isInteger(current?.primaryId)) return null
				const handle = typeof resizeHandles?.hitTest === 'function' ? resizeHandles.hitTest(event) : null
				if (handle) {
					wheelLatch = {
						target: 'resize',
						selectionId: current.primaryId,
						handle,
						outward: handleOutwardVector(handle),
						pointer,
						plane,
						edges: null
					}
					return createWheelGestureFromLatch()
				}
				if (!selection.isPrimarySelected(cell, plane)) return null
				const nearest = nearestSelectionDirection(game, current?.selectedRange, pointer)
				if (!nearest) return null
				wheelLatch = {
					target: 'move',
					selectionId: current.primaryId,
					direction: nearest.direction,
					edges: nearest.edges,
					corner: nearest.corner,
					visualCorner: nearest.visualCorner,
					visualSide: nearest.visualSide,
					pointer,
					plane,
				}
				return createWheelGestureFromLatch()
			}

			function beginWheelPreview() {
				if (gesture?.type !== 'wheel-pending') return false
				const started = gesture.target === 'resize'
					? selection.beginResize(gesture.handle, gesture.cell, gesture.plane, 'wheel-resize-start', 'wheel')
					: selection.beginMove(gesture.cell, gesture.plane, 'wheel-move-start', 'wheel')
				if (!started) {
					clearGesture()
					clearWheelLatch()
					return false
				}
				gesture.type = gesture.target === 'resize' ? 'wheel-resize' : 'wheel-move'
				return true
			}

			function applyWheelSteps(stepCount) {
				if (!isWheelGesture(gesture) || !stepCount) return false
				if (gesture.type === 'wheel-pending' && !beginWheelPreview()) return false
				if (!isWheelGesture(gesture)) return false

				const outward = gesture.target === 'resize' ? gesture.outward : gesture.direction
				const direction = stepCount < 0 ? 1 : -1
				gesture.currentCell = [
					gesture.currentCell[0] + outward[0] * direction * Math.abs(stepCount),
					gesture.currentCell[1] + outward[1] * direction * Math.abs(stepCount)
				]
				if (gesture.target === 'resize') {
					selection.updateResize(gesture.currentCell, gesture.plane, 'wheel-resize-preview')
					return true
				}

				selection.updateMove(gesture.currentCell, gesture.plane, 'wheel-move-preview')
				return true
			}

			const handleWheel = function (event) {
				if (
					disposed ||
					!runtime.isActive() ||
					game.halt ||
					game.splash?.isShown ||
					hasWheelModifier(event) ||
					(gesture && !isWheelGesture(gesture))
				) {
					return
				}

				const input = normalizeWheelInput(event, canvas)
				if (!input || input.axis !== 'vertical') return
				if (!gesture) {
					gesture = wheelLatch ? createWheelGestureFromLatch() : acquireWheelGesture(event, input)
					if (!gesture && !wheelLatch) gesture = acquireWheelGesture(event, input)
					if (!gesture) return
				}
				if (!isWheelGesture(gesture)) return

				if (gesture.wheelAxis !== input.axis) {
					gesture.wheelAxis = input.axis
					gesture.accumulator = 0
				}
				gesture.accumulator += input.amount
				const rawSteps = Math.trunc(gesture.accumulator / WHEEL_PIXEL_THRESHOLD)
				if (rawSteps) {
					const appliedSteps = clampInteger(rawSteps, -WHEEL_MAX_STEPS, WHEEL_MAX_STEPS)
					gesture.accumulator -= rawSteps * WHEEL_PIXEL_THRESHOLD
					if (applyWheelSteps(appliedSteps) && wheelLatch) {
						const pointer = pointerPosition(event)
						if (pointer) wheelLatch.pointer = pointer
					}
				}
				if (isWheelGesture(gesture)) scheduleWheelCommit()
				consume(event)
			}

			const handleMouseDown = function (event) {
				if (event?.button === 2) {
					if (runtime.isActive()) cancelInteraction('mouse-right')
					return
				}
				if (!shouldCaptureLeft(runtime, game, event)) return
				if (isWheelGesture(gesture)) {
					settleWheel('wheel-left-click-commit')
					consume(event)
					return
				}
				if (wheelLatch) clearWheelLatch()
				refreshHoveredCell(game, event)
				const cell = cloneCell(game.hoveredCell)
				const plane = game.plane ? 1 : 0
				const x = finiteOr(event?.offsetX, 0)
				const y = finiteOr(event?.offsetY, 0)

				clearGesture()
				const handle = typeof resizeHandles?.hitTest === 'function' ? resizeHandles.hitTest(event) : null
				if (handle && cell && !selection.hasPreview()) {
					if (selection.beginResize(handle, cell, plane, 'mouse-resize-start')) {
						gesture = { type: 'resize', cell, plane, x, y }
					}
					consume(event)
					return
				}

				const current = selection.snapshot()
				if (cell && !selection.hasPreview() && event?.ctrlKey) {
					gesture = { type: 'click', cell, plane, x, y, additive: true }
					consume(event)
					return
				}

				const hitId = cell && !selection.hasPreview()
					? selection.selectionAt(cell, plane)
					: null
				if (Number.isInteger(hitId)) {
					const activatedPrimary = current?.primaryId !== hitId
					if (activatedPrimary) selection.setPrimary(hitId, 'mouse-primary-activated')
					gesture = {
						type: 'pending-move',
						cell,
						plane,
						x,
						y,
						selectionId: hitId,
						insideSelection: true,
						activatedPrimary
					}
					scheduleLongPress()
					consume(event)
					return
				}

				if (cell) gesture = { type: 'click', cell, plane, x, y, additive: false }
				consume(event)
			}

			const handleMouseMove = function (event) {
				if (!runtime.isActive() || game.halt || game.splash?.isShown) return
				const buttons = Number(event?.buttons) || 0
				if (buttons & 2) return
				releaseWheelLatchOnPointerMove(event)
				refreshHoveredCell(game, event)

				if (gesture?.type === 'pending-move' && (buttons & 1)) {
					const dx = finiteOr(event?.offsetX, gesture.x) - gesture.x
					const dy = finiteOr(event?.offsetY, gesture.y) - gesture.y
					if (dx * dx + dy * dy >= MOVE_SLOP_PX * MOVE_SLOP_PX) {
						startMove('mouse-drag-threshold')
					}
				}

				if (gesture?.type === 'resize' && (buttons & 1) && isCell(game.hoveredCell)) {
					selection.updateResize(game.hoveredCell, game.plane, 'mouse-resize-preview')
				} else if (gesture?.type === 'move' && (buttons & 1) && isCell(game.hoveredCell)) {
					selection.updateMove(game.hoveredCell, game.plane, 'mouse-move-preview')
				} else if (selection.snapshot()?.previewKind === 'selection' && isCell(game.hoveredCell)) {
					selection.updatePreview(game.hoveredCell, game.plane, 'mouse-preview')
				}
				if (buttons & 1) consume(event)
			}

			const handleMouseUp = function (event) {
				if (event?.button !== 0) return
				if (!runtime.isActive() || game.halt || game.splash?.isShown) {
					cancelInteraction('mouse-up-inactive')
					return
				}
				refreshHoveredCell(game, event)
				const completed = gesture
				clearGesture()

				if (completed?.type === 'resize' && isCell(game.hoveredCell)) {
					selection.commitResize(game.hoveredCell, game.plane, 'mouse-resize-commit')
				} else if (completed?.type === 'move' && isCell(game.hoveredCell)) {
					selection.commitMove(game.hoveredCell, game.plane, 'mouse-move-commit')
				} else if (completed?.type === 'pending-move' || completed?.type === 'click') {
					performClick(completed.cell, completed.plane, completed)
				}
				consume(event)
			}

			const handleClick = function (event) {
				if (!shouldCaptureLeft(runtime, game, event)) return
				consume(event)
			}

			const handleMouseLeave = function () {
				if (runtime.isActive()) cancelInteraction('mouse-left-canvas')
			}

			const handleWindowBlur = function () {
				cancelInteraction('window-blur')
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state.active) cancelInteraction('editor-inactive')
			})
			const stopSelectionSubscription = selection.subscribe(function (state) {
				if (
					wheelLatch &&
					!state?.previewRange &&
					(
						!state?.selectedRange ||
						state.primaryId !== wheelLatch.selectionId ||
						state.plane !== wheelLatch.plane
					)
				) {
					clearGesture()
					clearWheelLatch()
				}
			})

			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mouseup', handleMouseUp, true)
			canvas.addEventListener('click', handleClick, true)
			canvas.addEventListener('dblclick', handleClick, true)
			canvas.addEventListener('wheel', handleWheel, { capture: true, passive: false })
			canvas.addEventListener('mouseleave', handleMouseLeave, true)
			window.addEventListener('blur', handleWindowBlur, true)

			runtime.addCleanup(function () {
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mouseup', handleMouseUp, true)
				canvas.removeEventListener('click', handleClick, true)
				canvas.removeEventListener('dblclick', handleClick, true)
				canvas.removeEventListener('wheel', handleWheel, true)
				canvas.removeEventListener('mouseleave', handleMouseLeave, true)
				window.removeEventListener('blur', handleWindowBlur, true)
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				interaction.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Unified selection input 2G ready.')
		})

		function shouldCaptureLeft(runtime, game, event) {
			return event?.button === 0 && runtime.isActive() && !game.halt && !game.splash?.isShown
		}

		function refreshHoveredCell(game, event) {
			const x = Number(event?.offsetX)
			const y = Number(event?.offsetY)
			if (!Number.isFinite(x) || !Number.isFinite(y) || typeof game.updateMouseData !== 'function') return
			game.updateMouseData(x, y)
		}

		function cloneCell(value) {
			if (!isCell(value)) return null
			return [Number(value[0]), Number(value[1])]
		}

		function isCell(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isInteger(Number(value[0])) && Number.isInteger(Number(value[1]))
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function pointerPosition(event) {
			const x = Number(event?.offsetX)
			const y = Number(event?.offsetY)
			return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
		}

		function isWheelGesture(value) {
			return !!value && (
				value.type === 'wheel-pending' ||
				value.type === 'wheel-move' ||
				value.type === 'wheel-resize'
			)
		}

		function hasWheelModifier(event) {
			return !!(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey)
		}

		function normalizeWheelInput(event, canvas) {
			let deltaX = wheelComponent(event, 'deltaX', 'wheelDeltaX')
			let deltaY = wheelComponent(event, 'deltaY', 'wheelDeltaY')
			if (!deltaY && !deltaX) {
				const legacy = Number(event?.wheelDelta)
				if (Number.isFinite(legacy)) deltaY = -legacy
			}
			const mode = Number(event?.deltaMode) || 0
			if (mode === 1) {
				deltaX *= 40
				deltaY *= 40
			} else if (mode === 2) {
				deltaX *= finitePositive(canvas?.clientWidth, finitePositive(canvas?.width, 800))
				deltaY *= finitePositive(canvas?.clientHeight, finitePositive(canvas?.height, 600))
			}
			if (!deltaX && !deltaY) return null
			return Math.abs(deltaX) > Math.abs(deltaY)
				? { axis: 'horizontal', amount: deltaX }
				: { axis: 'vertical', amount: deltaY }
		}

		function wheelComponent(event, standardKey, legacyKey) {
			const standard = Number(event?.[standardKey])
			if (Number.isFinite(standard) && standard) return standard
			const legacy = Number(event?.[legacyKey])
			return Number.isFinite(legacy) ? -legacy : 0
		}

		function handleOutwardVector(handle) {
			const parts = String(handle || '').split('-')
			return [
				parts[0] === 'minU' ? -1 : parts[0] === 'maxU' ? 1 : 0,
				parts[1] === 'minV' ? -1 : parts[1] === 'maxV' ? 1 : 0
			]
		}

		function nearestSelectionDirection(game, range, pointer) {
			const geometry = projectRangeGeometry(game, range)
			if (!geometry || !isPoint(pointer)) return null
			const edges = geometry.edges
			for (const edge of edges) {
				edge.distance = pointToSegmentDistance(pointer, edge.start, edge.end)
			}
			const uEdges = edges.filter(edge => edge.axis === 'u').sort(compareEdgeDistance)
			const vEdges = edges.filter(edge => edge.axis === 'v').sort(compareEdgeDistance)
			if (uEdges.length !== 2 || vEdges.length !== 2) return null

			const nearestU = uEdges[0]
			const nearestV = vEdges[0]
			const uIsDistinct = uEdges[1].distance - nearestU.distance > WHEEL_EDGE_OPPOSITE_GUARD_PX
			const vIsDistinct = vEdges[1].distance - nearestV.distance > WHEEL_EDGE_OPPOSITE_GUARD_PX
			if (
				uIsDistinct &&
				vIsDistinct &&
				Math.abs(nearestU.distance - nearestV.distance) <= WHEEL_EDGE_CORNER_PX
			) {
				const corner = cornerForEdges(geometry.corners, nearestU.id, nearestV.id)
				let direction = [
					nearestU.outward[0] + nearestV.outward[0],
					nearestU.outward[1] + nearestV.outward[1]
				]
				const maxY = Math.max(...geometry.corners.map(value => value.point[1]))
				const visualBottom = !!corner && maxY - corner.point[1] <= WHEEL_BOTTOM_TIE_PX
				if (visualBottom) direction = [-direction[0], -direction[1]]
				return {
					direction,
					edges: [nearestU.id, nearestV.id],
					corner: corner?.id || null,
					visualCorner: visualBottom ? 'bottom' : null,
					visualSide: null
				}
			}

			const nearest = nearestU.distance <= nearestV.distance ? nearestU : nearestV
			const visualSide = visualEdgeSide(geometry, nearest)
			const direction = nearest.outward.slice()
			if (visualSide === 'lower') {
				direction[0] = -direction[0]
				direction[1] = -direction[1]
			}
			return {
				direction,
				edges: [nearest.id],
				corner: null,
				visualCorner: null,
				visualSide
			}
		}

		function projectRangeGeometry(game, range) {
			if (!game?.canvas || typeof game.uvToXY !== 'function' || !isRange(range)) return null
			const canvas = game.canvas
			const internalWidth = finitePositive(canvas.width, finitePositive(game.w, 0))
			const internalHeight = finitePositive(canvas.height, finitePositive(game.h, 0))
			const rect = typeof canvas.getBoundingClientRect === 'function'
				? canvas.getBoundingClientRect()
				: null
			const cssWidth = finitePositive(rect?.width, finitePositive(canvas.clientWidth, 0))
			const cssHeight = finitePositive(rect?.height, finitePositive(canvas.clientHeight, 0))
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const scaleX = internalWidth && cssWidth ? cssWidth / internalWidth : 1 / pixelRatio
			const scaleY = internalHeight && cssHeight ? cssHeight / internalHeight : 1 / pixelRatio
			const offsetX = finiteOr(game.w2, internalWidth / 2)
			const offsetY = finiteOr(game.h2, internalHeight / 2)
			const uvCorners = [
				[range.minU - .5, range.minV - .5],
				[range.maxU + .5, range.minV - .5],
				[range.maxU + .5, range.maxV + .5],
				[range.minU - .5, range.maxV + .5]
			]
			const corners = []
			try {
				for (const uv of uvCorners) {
					const projected = game.uvToXY(uv)
					if (!isPoint(projected)) return null
					corners.push([
						(offsetX + Number(projected[0])) * scaleX,
						(offsetY + Number(projected[1])) * scaleY
					])
				}
			} catch (error) {
				return null
			}
			return {
				corners: [
					{ id: 'minU-minV', point: corners[0], edges: ['minU', 'minV'] },
					{ id: 'maxU-minV', point: corners[1], edges: ['maxU', 'minV'] },
					{ id: 'maxU-maxV', point: corners[2], edges: ['maxU', 'maxV'] },
					{ id: 'minU-maxV', point: corners[3], edges: ['minU', 'maxV'] }
				],
				edges: [
					{ id: 'minV', axis: 'v', outward: [0, -1], start: corners[0], end: corners[1] },
					{ id: 'maxU', axis: 'u', outward: [1, 0], start: corners[1], end: corners[2] },
					{ id: 'maxV', axis: 'v', outward: [0, 1], start: corners[2], end: corners[3] },
					{ id: 'minU', axis: 'u', outward: [-1, 0], start: corners[3], end: corners[0] }
				]
			}
		}

		function cornerForEdges(corners, uEdge, vEdge) {
			return corners.find(corner => corner.edges.includes(uEdge) && corner.edges.includes(vEdge)) || null
		}

		function visualEdgeSide(geometry, edge) {
			const centerY = geometry.corners.reduce(function (sum, corner) {
				return sum + corner.point[1]
			}, 0) / geometry.corners.length
			const edgeY = (edge.start[1] + edge.end[1]) / 2
			if (edgeY > centerY + WHEEL_EDGE_SIDE_EPSILON_PX) return 'lower'
			if (edgeY < centerY - WHEEL_EDGE_SIDE_EPSILON_PX) return 'upper'
			return 'middle'
		}

		function pointToSegmentDistance(point, start, end) {
			const dx = end[0] - start[0]
			const dy = end[1] - start[1]
			const lengthSquared = dx * dx + dy * dy
			if (!lengthSquared) return Math.hypot(point[0] - start[0], point[1] - start[1])
			const t = Math.max(0, Math.min(1, (
				(point[0] - start[0]) * dx +
				(point[1] - start[1]) * dy
			) / lengthSquared))
			return Math.hypot(
				point[0] - (start[0] + dx * t),
				point[1] - (start[1] + dy * t)
			)
		}

		function compareEdgeDistance(left, right) {
			const distance = left.distance - right.distance
			return Math.abs(distance) > .001 ? distance : left.id.localeCompare(right.id)
		}

		function isRange(value) {
			return !!(
				value &&
				Number.isFinite(Number(value.minU)) &&
				Number.isFinite(Number(value.maxU)) &&
				Number.isFinite(Number(value.minV)) &&
				Number.isFinite(Number(value.maxV))
			)
		}

		function isPoint(value) {
			return Array.isArray(value) &&
				value.length >= 2 &&
				Number.isFinite(Number(value[0])) &&
				Number.isFinite(Number(value[1]))
		}

		function finitePositive(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : fallback
		}

		function clampInteger(value, min, max) {
			return Math.min(max, Math.max(min, Math.trunc(value)))
		}

		function consume(event) {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
	}
})
