ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const RENDER_LAYER_ID = 'interaction'
		const RENDER_CALLBACK_ID = 'world-editor-hover-cell'

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Hover 1C could not find the editor runtime.')
				return
			}
			if (!api.render || typeof api.render.onLayer !== 'function') {
				console.warn('[Cattail World Editor] Hover 1C requires Render API v1.')
				return
			}

			let currentSelection = selection && typeof selection.snapshot === 'function' ? selection.snapshot() : null
			let currentTool = tool && typeof tool.snapshot === 'function' ? tool.snapshot() : { mode: 'select' }
			const stopSelectionSubscription = selection && typeof selection.subscribe === 'function'
				? selection.subscribe(function (state) {
					currentSelection = state
				})
				: null
			const stopToolSubscription = tool && typeof tool.subscribe === 'function'
				? tool.subscribe(function (state) {
					currentTool = state
				})
				: null
			const hoverLock = installRightPanHoverLock(runtime, game)
			const stopRendering = api.render.onLayer(RENDER_LAYER_ID, function ({ game: renderGame, ctx, width, height }) {
				const hoveredCell = hoverLock.getCell(renderGame)
				drawHoveredCell(runtime, currentSelection, currentTool, renderGame, hoveredCell, ctx, width, height)
			}, {
				id: RENDER_CALLBACK_ID,
				order: 40,
				space: 'screen',
				enabled({ game: renderGame }) {
					return shouldRender(runtime, currentSelection, currentTool, renderGame, hoverLock.getCell(renderGame))
				}
			})

			if (typeof stopRendering === 'function') runtime.addCleanup(stopRendering)
			if (typeof stopSelectionSubscription === 'function') runtime.addCleanup(stopSelectionSubscription)
			if (typeof stopToolSubscription === 'function') runtime.addCleanup(stopToolSubscription)
			console.info('[Cattail World Editor] Unified hover 2E ready.')
		})

		function shouldRender(runtime, selectionState, toolState, game, hoveredCell) {
			if (!runtime || runtime.game !== game || !runtime.isActive()) return false
			if (!game || game.halt || game.splash?.isShown || !game.canvas) return false
			if (game.mouse?.cursorVisible === false || typeof game.uvToXY !== 'function') return false
			if (selectionState?.previewRange) return false
			if (!isCell(hoveredCell)) return false
			return Number.isFinite(Number(game.unit)) && Number(game.unit) > 0
		}

		function drawHoveredCell(runtime, selectionState, toolState, game, hoveredCell, ctx, width, height) {
			if (!ctx || !shouldRender(runtime, selectionState, toolState, game, hoveredCell)) return

			const canvasWidth = Number(width) || Number(game.w) || 0
			const canvasHeight = Number(height) || Number(game.h) || 0
			const screenOffsetX = finiteOr(game.w2, canvasWidth / 2)
			const screenOffsetY = finiteOr(game.h2, canvasHeight / 2)
			let corners
			try {
				corners = projectCellCorners(game, hoveredCell, screenOffsetX, screenOffsetY)
			} catch (error) {
				return
			}
			if (!corners) return

			const unit = Number(game.unit)
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const solidUnit = Number(game.solidUnit)
			const fallbackZoom = Number.isFinite(solidUnit) && solidUnit > 0 ? unit / solidUnit : 1
			const zoom = Math.max(0, finiteOr(game.zoom, fallbackZoom))
			const strokeScale = Math.sqrt(zoom)
			const outerWidth = clamp(pixelRatio * 2 * strokeScale, pixelRatio * .4, pixelRatio * 3.2)
			const innerWidth = clamp(pixelRatio * strokeScale, pixelRatio * .2, pixelRatio * 1.6)

			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.beginPath()
				ctx.moveTo(corners[0][0], corners[0][1])
				ctx.lineTo(corners[1][0], corners[1][1])
				ctx.lineTo(corners[2][0], corners[2][1])
				ctx.lineTo(corners[3][0], corners[3][1])
				ctx.closePath()

				ctx.fillStyle = game.plane ? 'rgba(93, 211, 255, .22)' : 'rgba(67, 180, 255, .16)'
				ctx.fill()

				ctx.lineJoin = 'round'
				ctx.strokeStyle = 'rgba(14, 22, 31, .68)'
				ctx.lineWidth = outerWidth
				ctx.stroke()

				ctx.strokeStyle = 'rgba(117, 220, 255, .96)'
				ctx.lineWidth = innerWidth
				ctx.stroke()
			} finally {
				ctx.restore()
			}
		}

		function installRightPanHoverLock(runtime, game) {
			const canvas = game?.canvas
			let rightButtonDown = false
			let lockedCell = null
			let lockedPlane = null

			function clear() {
				rightButtonDown = false
				lockedCell = null
				lockedPlane = null
			}

			function lockCurrentCell() {
				if (!runtime.isActive() || !isCell(game.hoveredCell)) {
					clear()
					return
				}
				rightButtonDown = true
				lockedCell = [Number(game.hoveredCell[0]), Number(game.hoveredCell[1])]
				lockedPlane = game.plane ? 1 : 0
			}

			function handleMouseDown(event) {
				if (event?.button === 2) lockCurrentCell()
			}

			function handleMouseMove(event) {
				if (Number(event?.buttons) & 2) {
					if (!rightButtonDown) lockCurrentCell()
				} else if (rightButtonDown) {
					clear()
				}
			}

			function handleMouseUp(event) {
				if (event?.button === 2 || !(Number(event?.buttons) & 2)) clear()
			}

			let stopRuntimeSubscription
			if (runtime && typeof runtime.subscribe === 'function') {
				stopRuntimeSubscription = runtime.subscribe(function (state) {
					if (!state.active) clear()
				})
			}

			if (canvas && typeof canvas.addEventListener === 'function') {
				canvas.addEventListener('mousedown', handleMouseDown)
				canvas.addEventListener('mousemove', handleMouseMove)
				canvas.addEventListener('mouseup', handleMouseUp)
				canvas.addEventListener('mouseleave', clear)
			}
			if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
				window.addEventListener('blur', clear)
			}

			runtime.addCleanup(function () {
				clear()
				if (canvas && typeof canvas.removeEventListener === 'function') {
					canvas.removeEventListener('mousedown', handleMouseDown)
					canvas.removeEventListener('mousemove', handleMouseMove)
					canvas.removeEventListener('mouseup', handleMouseUp)
					canvas.removeEventListener('mouseleave', clear)
				}
				if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
					window.removeEventListener('blur', clear)
				}
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
			})

			return Object.freeze({
				getCell(renderGame) {
					if (renderGame !== game || !rightButtonDown || !isCell(lockedCell)) return renderGame?.hoveredCell
					if (lockedPlane !== (renderGame.plane ? 1 : 0)) {
						clear()
						return renderGame.hoveredCell
					}
					return lockedCell
				}
			})
		}

		function projectCellCorners(game, cell, screenOffsetX, screenOffsetY) {
			const u = Number(cell[0])
			const v = Number(cell[1])
			const uvCorners = [
				[u - .5, v - .5],
				[u + .5, v - .5],
				[u + .5, v + .5],
				[u - .5, v + .5]
			]
			const corners = []
			for (let i = 0; i < uvCorners.length; i++) {
				const projected = game.uvToXY(uvCorners[i])
				if (!isPoint(projected)) return null
				corners.push([
					screenOffsetX + Number(projected[0]),
					screenOffsetY + Number(projected[1])
				])
			}
			return corners
		}

		function isCell(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
		}

		function isPoint(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, value))
		}
	}
})
