ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const RESIZE_HANDLES_KEY = Symbol.for('cattail.world-editor.resize-handles')
		const RENDER_LAYER_ID = 'interaction'
		const RENDER_CALLBACK_ID = 'world-editor-resize-handles'
		const HANDLE_DEFINITIONS = Object.freeze([
			Object.freeze({ id: 'minU-minV', u: 'min', v: 'min', corner: true }),
			Object.freeze({ id: 'midU-minV', u: 'mid', v: 'min', corner: false }),
			Object.freeze({ id: 'maxU-minV', u: 'max', v: 'min', corner: true }),
			Object.freeze({ id: 'maxU-midV', u: 'max', v: 'mid', corner: false }),
			Object.freeze({ id: 'maxU-maxV', u: 'max', v: 'max', corner: true }),
			Object.freeze({ id: 'midU-maxV', u: 'mid', v: 'max', corner: false }),
			Object.freeze({ id: 'minU-maxV', u: 'min', v: 'max', corner: true }),
			Object.freeze({ id: 'minU-midV', u: 'min', v: 'mid', corner: false })
		])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const tool = globalThis[TOOL_KEY]
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Resize handles 2F could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Resize handles 2F could not find the selection state.')
				return
			}
			if (!tool || typeof tool.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Resize handles 2F could not find the tool state.')
				return
			}
			if (!canvas || typeof canvas.addEventListener !== 'function') {
				console.warn('[Cattail World Editor] Resize handles 2F require the game canvas.')
				return
			}
			if (!api.render || typeof api.render.onLayer !== 'function') {
				console.warn('[Cattail World Editor] Resize handles 2F require Render API v1.')
				return
			}

			const previous = globalThis[RESIZE_HANDLES_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('resize-handles-replaced')

			let currentRuntime = runtime.snapshot()
			let currentSelection = selection.snapshot()
			let currentTool = tool.snapshot()
			let hoveredHandle = null
			let pointerBlocked = false
			let cursorApplied = false
			let previousCursor = ''
			let disposed = false

			const service = Object.freeze({
				version: '0.2.5',
				handles: Object.freeze(HANDLE_DEFINITIONS.map(function (definition) {
					return definition.id
				})),
				snapshot() {
					return {
						version: '0.2.5',
						hoveredHandle,
						activeHandle: currentSelection?.previewKind === 'resize' ? currentSelection.resizeHandle : null,
						visible: shouldShowHandles()
					}
				},
				hitTest(event) {
					const x = Number(event?.offsetX)
					const y = Number(event?.offsetY)
					if (!Number.isFinite(x) || !Number.isFinite(y)) return null
					return findHandleAtPoint(x, y)
				},
				hitTestPoint(x, y) {
					return findHandleAtPoint(x, y)
				},
				clearPointer() {
					setHoveredHandle(null)
				},
				dispose() {
					if (disposed) return false
					disposed = true
					setHoveredHandle(null)
					restoreCursor()
					if (globalThis[RESIZE_HANDLES_KEY] === service) delete globalThis[RESIZE_HANDLES_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, RESIZE_HANDLES_KEY, {
				value: service,
				configurable: true,
				writable: true
			})

			function activeRange() {
				if (currentSelection?.previewKind === 'resize' && isRange(currentSelection.previewRange)) {
					return currentSelection.previewRange
				}
				if (!currentSelection?.previewRange && isRange(currentSelection?.selectedRange)) {
					return currentSelection.selectedRange
				}
				return null
			}

			function shouldShowHandles() {
				if (disposed || !currentRuntime?.active || currentTool?.mode !== 'select') return false
				if (!game || game.halt || game.splash?.isShown || game.mouse?.cursorVisible === false) return false
				if (currentSelection?.plane !== (game.plane ? 1 : 0) || !activeRange()) return false
				if (typeof game.uvToXY !== 'function' || !Number.isFinite(Number(game.unit)) || Number(game.unit) <= 0) return false
				if (typeof api.render.isEnabled === 'function' && !api.render.isEnabled()) return false
				return true
			}

			function findHandleAtPoint(cssX, cssY) {
				if (!shouldShowHandles() || currentSelection?.previewRange) return null
				const geometry = createGeometry(game, activeRange())
				if (!geometry) return null
				const pixelRatio = geometry.pixelRatio
				const x = Number(cssX) * pixelRatio
				const y = Number(cssY) * pixelRatio
				const candidates = []
				for (const handle of geometry.handles) {
					const dx = x - handle.x
					const dy = y - handle.y
					const distanceSquared = dx * dx + dy * dy
					if (distanceSquared <= handle.hitRadius * handle.hitRadius) {
						candidates.push({ handle, distanceSquared })
					}
				}
				candidates.sort(function (left, right) {
					const distance = left.distanceSquared - right.distanceSquared
					if (Math.abs(distance) > .01) return distance
					if (left.handle.corner !== right.handle.corner) return left.handle.corner ? -1 : 1
					return left.handle.index - right.handle.index
				})
				return candidates.length ? candidates[0].handle.id : null
			}

			function setHoveredHandle(handle) {
				const next = shouldShowHandles() && !currentSelection?.previewRange ? handle : null
				if (next === hoveredHandle) {
					refreshCursor()
					return
				}
				hoveredHandle = next
				refreshCursor()
			}

			function refreshCursor() {
				const nextCursor = desiredCursor()
				if (!nextCursor) return restoreCursor()
				if (!cursorApplied) {
					previousCursor = canvas.style?.cursor || ''
					cursorApplied = true
				}
				if (canvas.style) canvas.style.cursor = nextCursor
			}

			function desiredCursor() {
				if (
					disposed ||
					pointerBlocked ||
					!currentRuntime?.active ||
					currentTool?.mode !== 'select' ||
					!game ||
					game.halt ||
					game.splash?.isShown ||
					game.mouse?.cursorVisible === false
				) {
					return null
				}
				if (currentSelection?.previewKind === 'move') return 'grabbing'
				const handleId = currentSelection?.previewKind === 'resize'
					? currentSelection.resizeHandle
					: hoveredHandle
				if (handleId && shouldShowHandles()) {
					const geometry = createGeometry(game, activeRange())
					const handle = geometry?.handles.find(function (candidate) {
						return candidate.id === handleId
					})
					if (handle) return cursorForVector(handle.x - geometry.center[0], handle.y - geometry.center[1])
				}
				if (
					!currentSelection?.previewRange &&
					currentSelection?.plane === (game.plane ? 1 : 0) &&
					rangeContains(currentSelection?.selectedRange, game.hoveredCell)
				) {
					return 'move'
				}
				return null
			}

			function restoreCursor() {
				if (!cursorApplied) return
				if (canvas.style) canvas.style.cursor = previousCursor
				cursorApplied = false
				previousCursor = ''
			}

			function handleMouseMove(event) {
				if (Number(event?.buttons) & 2) {
					pointerBlocked = true
					setHoveredHandle(null)
					return
				}
				pointerBlocked = false
				refreshHoveredCell(game, event)
				if (currentSelection?.previewKind === 'resize') {
					refreshCursor()
					return
				}
				setHoveredHandle(service.hitTest(event))
			}

			function handleMouseDown(event) {
				if (event?.button !== 2) return
				pointerBlocked = true
				setHoveredHandle(null)
			}

			function handleMouseUp(event) {
				if (event?.button !== 2) return
				pointerBlocked = false
				refreshHoveredCell(game, event)
				setHoveredHandle(service.hitTest(event))
			}

			function clearPointer() {
				pointerBlocked = true
				setHoveredHandle(null)
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state.active) hoveredHandle = null
				refreshCursor()
			})
			const stopSelectionSubscription = selection.subscribe(function (state) {
				const wasResizing = currentSelection?.previewKind === 'resize'
				currentSelection = state
				if (wasResizing && state?.previewKind !== 'resize') hoveredHandle = null
				if (!activeRange()) hoveredHandle = null
				refreshCursor()
			})
			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				if (state.mode !== 'select') hoveredHandle = null
				refreshCursor()
			})
			const stopRendering = api.render.onLayer(RENDER_LAYER_ID, function ({ game: renderGame, ctx }) {
				drawHandles(renderGame, ctx)
			}, {
				id: RENDER_CALLBACK_ID,
				order: 60,
				space: 'screen',
				enabled({ game: renderGame }) {
					return renderGame === game && shouldShowHandles()
				}
			})

			function drawHandles(renderGame, ctx) {
				if (renderGame !== game || !ctx || !shouldShowHandles()) return
				const geometry = createGeometry(renderGame, activeRange())
				if (!geometry) return
				const activeHandle = currentSelection?.previewKind === 'resize' ? currentSelection.resizeHandle : null
				const palette = getPalette(renderGame)
				ctx.save()
				try {
					ctx.setTransform(1, 0, 0, 1, 0, 0)
					for (const handle of geometry.handles) {
						const active = handle.id === activeHandle
						const hovered = !active && handle.id === hoveredHandle
						const radius = handle.visualRadius * (active ? 1.28 : hovered ? 1.15 : 1)
						ctx.beginPath()
						ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2)
						ctx.fillStyle = active ? palette.activeFill : hovered ? palette.hoverFill : palette.fill
						ctx.fill()
						ctx.strokeStyle = palette.outer
						ctx.lineWidth = Math.max(geometry.pixelRatio * .75, radius * .34)
						ctx.stroke()
						ctx.beginPath()
						ctx.arc(handle.x, handle.y, Math.max(geometry.pixelRatio, radius * .55), 0, Math.PI * 2)
						ctx.strokeStyle = active ? palette.activeInner : palette.inner
						ctx.lineWidth = Math.max(geometry.pixelRatio * .65, radius * .18)
						ctx.stroke()
					}
				} finally {
					ctx.restore()
				}
			}

			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mouseup', handleMouseUp, true)
			canvas.addEventListener('mouseleave', clearPointer, true)
			window.addEventListener('blur', clearPointer, true)

			runtime.addCleanup(function () {
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mouseup', handleMouseUp, true)
				canvas.removeEventListener('mouseleave', clearPointer, true)
				window.removeEventListener('blur', clearPointer, true)
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopRendering === 'function') stopRendering()
				service.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Unified resize handles 2F ready.')
		})

		function createGeometry(game, range) {
			if (!isRange(range) || typeof game?.uvToXY !== 'function') return null
			const canvasWidth = Number(game.w) || Number(game.canvas?.width) || 0
			const canvasHeight = Number(game.h) || Number(game.canvas?.height) || 0
			const offsetX = finiteOr(game.w2, canvasWidth / 2)
			const offsetY = finiteOr(game.h2, canvasHeight / 2)
			const minU = Number(range.minU) - .5
			const maxU = Number(range.maxU) + .5
			const minV = Number(range.minV) - .5
			const maxV = Number(range.maxV) + .5
			const midU = (minU + maxU) / 2
			const midV = (minV + maxV) / 2
			const values = {
				minU,
				midU,
				maxU,
				minV,
				midV,
				maxV
			}
			const center = projectPoint(game, [midU, midV], offsetX, offsetY)
			if (!center) return null
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const solidUnit = Number(game.solidUnit)
			const unit = Number(game.unit)
			const fallbackZoom = Number.isFinite(solidUnit) && solidUnit > 0 && Number.isFinite(unit) ? unit / solidUnit : 1
			const zoom = Math.max(0, finiteOr(game.zoom, fallbackZoom))
			const visualCssRadius = clamp(4.4 * Math.sqrt(zoom), 2.4, 6)
			const visualRadius = visualCssRadius * pixelRatio
			const hitRadius = Math.max(9.5, visualCssRadius + 4.5) * pixelRatio
			const handles = []
			for (let index = 0; index < HANDLE_DEFINITIONS.length; index++) {
				const definition = HANDLE_DEFINITIONS[index]
				const point = projectPoint(game, [values[definition.u + 'U'], values[definition.v + 'V']], offsetX, offsetY)
				if (!point) return null
				handles.push({
					id: definition.id,
					index,
					corner: definition.corner,
					x: point[0],
					y: point[1],
					visualRadius,
					hitRadius
				})
			}
			return {
				center,
				handles,
				pixelRatio
			}
		}

		function projectPoint(game, uv, offsetX, offsetY) {
			let projected
			try {
				projected = game.uvToXY(uv)
			} catch (error) {
				return null
			}
			if (!isPoint(projected)) return null
			return [offsetX + Number(projected[0]), offsetY + Number(projected[1])]
		}

		function cursorForVector(dx, dy) {
			let angle = Math.atan2(dy, dx) * 180 / Math.PI
			angle = (angle % 180 + 180) % 180
			if (angle < 22.5 || angle >= 157.5) return 'ew-resize'
			if (angle < 67.5) return 'nwse-resize'
			if (angle < 112.5) return 'ns-resize'
			return 'nesw-resize'
		}

		function getPalette(game) {
			if (game?.plane) {
				return {
					fill: 'rgba(55, 43, 76, .94)',
					hoverFill: 'rgba(113, 91, 151, .98)',
					activeFill: 'rgba(213, 194, 248, .98)',
					outer: 'rgba(16, 11, 24, .88)',
					inner: 'rgba(219, 202, 250, .94)',
					activeInner: 'rgba(255, 255, 255, .98)'
				}
			}
			return {
				fill: 'rgba(239, 232, 249, .96)',
				hoverFill: 'rgba(207, 190, 235, .98)',
				activeFill: 'rgba(170, 137, 220, .98)',
				outer: 'rgba(54, 40, 72, .82)',
				inner: 'rgba(126, 92, 176, .92)',
				activeInner: 'rgba(255, 255, 255, .98)'
			}
		}

		function isRange(value) {
			return !!(
				value &&
				isCell(value.start) &&
				isCell(value.end) &&
				Number.isInteger(Number(value.minU)) &&
				Number.isInteger(Number(value.maxU)) &&
				Number.isInteger(Number(value.minV)) &&
				Number.isInteger(Number(value.maxV)) &&
				Number(value.minU) <= Number(value.maxU) &&
				Number(value.minV) <= Number(value.maxV)
			)
		}

		function rangeContains(range, cell) {
			return !!(
				isRange(range) &&
				isCell(cell) &&
				Number(cell[0]) >= Number(range.minU) &&
				Number(cell[0]) <= Number(range.maxU) &&
				Number(cell[1]) >= Number(range.minV) &&
				Number(cell[1]) <= Number(range.maxV)
			)
		}

		function refreshHoveredCell(game, event) {
			const x = Number(event?.offsetX)
			const y = Number(event?.offsetY)
			if (!Number.isFinite(x) || !Number.isFinite(y) || typeof game?.updateMouseData !== 'function') return
			game.updateMouseData(x, y)
		}

		function isCell(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isInteger(Number(value[0])) && Number.isInteger(Number(value[1]))
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
