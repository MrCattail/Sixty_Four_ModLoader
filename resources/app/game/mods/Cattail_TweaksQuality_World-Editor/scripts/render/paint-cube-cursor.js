ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const PAINT_UI_KEY = Symbol.for('cattail.world-editor.paint-cube-ui')
		const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
		const INPUT_KEY = Symbol.for('cattail.world-editor.paint-cube-input')
		const BLUEPRINT_PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const CURSOR_KEY = Symbol.for('cattail.world-editor.paint-cube-cursor')
		const GHOST_LAYER_ID = 'interaction'
		const CURSOR_LAYER_ID = 'cursor'
		const GHOST_CALLBACK_ID = 'world-editor-paint-cube-ghost'
		const CURSOR_CALLBACK_ID = 'world-editor-paint-cube-crosshair'
		const BRUSH_COLOR = 'rgba(117, 220, 255, .96)'
		const BUCKET_COLOR = 'rgba(104, 238, 190, .98)'
		const ERASER_COLOR = 'rgba(255, 157, 86, .98)'
		const INVALID_COLOR = 'rgba(255, 104, 112, .96)'
		const OUTER_COLOR = 'rgba(14, 22, 31, .76)'
		const CLEAR_RADIUS_CSS = 15
		const CROSSHAIR_RADIUS_CSS = 7

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const shared = globalThis[SHARED_KEY]
			const tool = globalThis[TOOL_KEY]
			const paintUi = globalThis[PAINT_UI_KEY]
			const stroke = globalThis[STROKE_KEY]
			const canvas = game?.canvas
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost could not find the editor runtime.')
				return
			}
			if (!tool || typeof tool.snapshot !== 'function' || typeof tool.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost could not find the tool state.')
				return
			}
			if (!paintUi || paintUi.game !== game || typeof paintUi.snapshot !== 'function' || typeof paintUi.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost could not find Brush/Eraser state.')
				return
			}
			if (!stroke || stroke.game !== game || typeof stroke.inspectCell !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost could not find stroke inspection.')
				return
			}
			if (!canvas || typeof canvas.addEventListener !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost requires the game canvas.')
				return
			}
			if (!api.render || typeof api.render.onLayer !== 'function') {
				console.warn('[Cattail World Editor] Paint ghost requires Render API v1.')
				return
			}

			const previous = globalThis[CURSOR_KEY]
			previous?.dispose?.('paint-ghost-replaced')
			let currentRuntime = runtime.snapshot()
			let currentTool = tool.snapshot()
			let currentPaintUi = paintUi.snapshot()
			let pointerInside = canvasMatchesHover(canvas)
			let rightButtonDown = false
			let disposed = false

			const service = Object.freeze({
				version: '0.6.0',
				snapshot() {
					const visual = visualState(game)
					return {
						version: '0.6.0',
						visible: visual.visible,
						cell: visual.cell ? visual.cell.slice() : null,
						valid: visual.valid,
						occupied: visual.occupied,
						painted: visual.painted,
						operation: visual.operation,
						action: visual.action,
						subtool: visual.subtool,
						recipe: clonePlain(visual.recipe),
						pendingCells: visual.pendingCells.map(function (cell) { return cell.slice() }),
						plane: game?.plane ? 1 : 0,
						pointerInside,
						rightButtonDown,
						disposed
					}
				},
				dispose() {
					if (disposed) return false
					disposed = true
					pointerInside = false
					rightButtonDown = false
					if (globalThis[CURSOR_KEY] === service) delete globalThis[CURSOR_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, CURSOR_KEY, {
				value: service,
				configurable: true,
				writable: true
			})

			function visualState(renderGame) {
				const hidden = {
					visible: false,
					cell: null,
					valid: false,
					occupied: false,
					painted: false,
					operation: null,
					action: actionForSubtool(currentPaintUi?.subtool),
					subtool: normalizeSubtool(currentPaintUi?.subtool),
					recipe: clonePlain(currentPaintUi?.recipe),
					pendingCells: []
				}
				if (disposed || renderGame !== game || !currentRuntime?.active || currentTool?.mode !== 'draw') return hidden
				if (!game || game.halt || game.splash?.isShown || game.plane) return hidden
				if (!pointerInside || rightButtonDown || game.mouse?.cursorVisible === false) return hidden
				if (!isCell(game.hoveredCell) || !mousePoint(game)) return hidden
				if (!Number.isFinite(Number(game.unit)) || Number(game.unit) <= 0 || typeof game.uvToXY !== 'function') return hidden
				if (shared?.isWorldEditorInputBlocked?.() || blueprintPreviewActive()) return hidden
				if (currentPaintUi?.paletteOpen === true) return hidden
				const action = actionForSubtool(currentPaintUi?.subtool)
				const subtool = normalizeSubtool(currentPaintUi?.subtool)
				const cell = [Number(game.hoveredCell[0]), Number(game.hoveredCell[1])]
				const inspection = stroke.inspectCell(cell, action)
				const inputState = readInputState()
				const pendingCells = inputState?.active && inputState.action === action
					? normalizeCells(inputState.cells)
					: []
				const recipe = inputState?.active ? inputState.recipe : currentPaintUi?.recipe
				return {
					visible: true,
					cell,
					valid: inspection?.eligible === true,
					occupied: inspection?.occupied === true,
					painted: inspection?.painted === true,
					operation: inspection?.operation || null,
					action,
					subtool,
					recipe: clonePlain(recipe),
					pendingCells
				}
			}

			function readInputState() {
				try {
					return globalThis[INPUT_KEY]?.snapshot?.() || null
				} catch (error) {
					return null
				}
			}

			function blueprintPreviewActive() {
				try {
					return !!globalThis[BLUEPRINT_PREVIEW_KEY]?.snapshot?.().active
				} catch (error) {
					return false
				}
			}

			function handleMouseEnter() {
				pointerInside = true
			}

			function handleMouseMove(event) {
				pointerInside = true
				rightButtonDown = !!((Number(event?.buttons) || 0) & 2)
			}

			function handleMouseDown(event) {
				pointerInside = true
				if (event?.button === 2) rightButtonDown = true
			}

			function handleMouseUp(event) {
				pointerInside = true
				if (event?.button === 2 || !((Number(event?.buttons) || 0) & 2)) rightButtonDown = false
			}

			function handleMouseLeave() {
				pointerInside = false
				rightButtonDown = false
			}

			function handleWindowMouseUp(event) {
				if (event?.button === 2 || !((Number(event?.buttons) || 0) & 2)) rightButtonDown = false
			}

			function handleWindowBlur() {
				pointerInside = false
				rightButtonDown = false
			}

			const stopGhostRendering = api.render.onLayer(GHOST_LAYER_ID, function ({ game: renderGame, ctx, width, height }) {
				const visual = visualState(renderGame)
				if (!ctx || !visual.visible) return
				const pendingKeys = new Set()
				for (const cell of visual.pendingCells) {
					pendingKeys.add(cellKey(cell))
						drawGhost(ctx, game, {
							cell,
							valid: true,
							action: visual.action,
							recipe: visual.recipe,
							pending: true
					}, width, height)
				}
				if (!pendingKeys.has(cellKey(visual.cell)) || !visual.valid) {
					drawGhost(ctx, game, visual, width, height)
				}
			}, {
				id: GHOST_CALLBACK_ID,
				order: 70,
				space: 'screen',
				enabled({ game: renderGame }) {
					return visualState(renderGame).visible
				}
			})
			const stopCursorRendering = api.render.onLayer(CURSOR_LAYER_ID, function ({ game: renderGame, ctx }) {
				const visual = visualState(renderGame)
				if (!ctx || !visual.visible) return
				drawCrosshair(ctx, game, visual.valid, visual.action, visual.recipe, visual.subtool)
			}, {
				id: CURSOR_CALLBACK_ID,
				order: 110,
				space: 'screen',
				enabled({ game: renderGame }) {
					return visualState(renderGame).visible
				}
			})

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!state?.active) rightButtonDown = false
			})
			const stopToolSubscription = tool.subscribe(function (state) {
				currentTool = state
				if (state?.mode !== 'draw') rightButtonDown = false
			})
			const stopPaintUiSubscription = paintUi.subscribe(function (state) {
				currentPaintUi = state
			})

			canvas.addEventListener('mouseenter', handleMouseEnter, true)
			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mouseup', handleMouseUp, true)
			canvas.addEventListener('mouseleave', handleMouseLeave, true)
			window.addEventListener('mouseup', handleWindowMouseUp, true)
			window.addEventListener('blur', handleWindowBlur, true)

			runtime.addCleanup(function () {
				canvas.removeEventListener('mouseenter', handleMouseEnter, true)
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mouseup', handleMouseUp, true)
				canvas.removeEventListener('mouseleave', handleMouseLeave, true)
				window.removeEventListener('mouseup', handleWindowMouseUp, true)
				window.removeEventListener('blur', handleWindowBlur, true)
				if (typeof stopGhostRendering === 'function') stopGhostRendering()
				if (typeof stopCursorRendering === 'function') stopCursorRendering()
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopPaintUiSubscription === 'function') stopPaintUiSubscription()
				service.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Pending Brush/Eraser stroke ghost 5C-4 ready.')
		})

		function drawGhost(ctx, game, visual, width, height) {
			const prism = projectPrism(game, visual.cell, width, height)
			if (!prism) return
			const valid = visual.valid === true
			const erasing = visual.action === 'erase'
			const bucket = visual.subtool === 'bucket'
			const palette = recipeColors(game, visual.recipe)
			const accent = valid ? erasing ? ERASER_COLOR : bucket ? BUCKET_COLOR : palette.accent : INVALID_COLOR
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const solidUnit = Number(game.solidUnit)
			const fallbackZoom = Number.isFinite(solidUnit) && solidUnit > 0 ? Number(game.unit) / solidUnit : 1
			const zoom = Math.max(0, finiteOr(game.zoom, fallbackZoom))
			const strokeScale = Math.sqrt(zoom)
			const outerWidth = clamp(pixelRatio * 2.4 * strokeScale, pixelRatio * .7, pixelRatio * 4)
			const innerWidth = clamp(pixelRatio * 1.2 * strokeScale, pixelRatio * .35, pixelRatio * 2)

			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				if (valid && erasing) {
					fillFace(ctx, prism.left, 'rgba(255, 116, 76, .08)')
					fillFace(ctx, prism.right, 'rgba(255, 157, 86, .10)')
					fillFace(ctx, prism.top, 'rgba(255, 181, 105, .14)')
				} else {
					fillFace(ctx, prism.left, valid ? rgba(palette.triplet[0], .16) : 'rgba(255, 82, 92, .13)')
					fillFace(ctx, prism.right, valid ? rgba(palette.triplet[1], .18) : 'rgba(255, 116, 92, .11)')
					fillFace(ctx, prism.top, valid ? rgba(palette.triplet[2], .24) : 'rgba(255, 104, 112, .18)')
				}
				tracePrismEdges(ctx, prism)
				ctx.lineJoin = 'round'
				ctx.lineCap = 'round'
				ctx.strokeStyle = OUTER_COLOR
				ctx.lineWidth = outerWidth
				ctx.stroke()
				tracePrismEdges(ctx, prism)
				ctx.strokeStyle = accent
				ctx.lineWidth = innerWidth
				ctx.stroke()
				if (!valid) drawInvalidMark(ctx, prism, pixelRatio)
				else if (erasing) drawEraseMark(ctx, prism, pixelRatio)
				else if (bucket) drawBucketMark(ctx, prism, pixelRatio)
			} finally {
				ctx.restore()
			}
		}

		function projectPrism(game, cell, width, height) {
			let center
			try {
				center = game.uvToXY(cell)
			} catch (error) {
				return null
			}
			if (!isPoint(center)) return null
			const unit = Number(game.unit)
			if (!Number.isFinite(unit) || unit <= 0) return null
			const canvasWidth = Number(width) || Number(game.w) || 0
			const canvasHeight = Number(height) || Number(game.h) || 0
			const cx = finiteOr(game.w2, canvasWidth / 2) + Number(center[0])
			const cy = finiteOr(game.h2, canvasHeight / 2) + Number(center[1])
			const dx = .866 * unit
			const dy = .5 * unit
			const hy = unit
			const top = [
				[cx, cy - hy - dy],
				[cx + dx, cy - hy],
				[cx, cy + dy - hy],
				[cx - dx, cy - hy]
			]
			const base = [
				[cx, cy - dy],
				[cx + dx, cy],
				[cx, cy + dy],
				[cx - dx, cy]
			]
			return {
				top,
				base,
				left: [top[3], top[2], base[2], base[3]],
				right: [top[1], base[1], base[2], top[2]]
			}
		}

		function fillFace(ctx, points, color) {
			tracePolygon(ctx, points)
			ctx.fillStyle = color
			ctx.fill()
		}

		function tracePrismEdges(ctx, prism) {
			ctx.beginPath()
			traceOpenPolygon(ctx, prism.top, true)
			ctx.moveTo(prism.top[1][0], prism.top[1][1])
			ctx.lineTo(prism.base[1][0], prism.base[1][1])
			ctx.lineTo(prism.base[2][0], prism.base[2][1])
			ctx.lineTo(prism.base[3][0], prism.base[3][1])
			ctx.lineTo(prism.top[3][0], prism.top[3][1])
			ctx.moveTo(prism.top[2][0], prism.top[2][1])
			ctx.lineTo(prism.base[2][0], prism.base[2][1])
		}

		function drawInvalidMark(ctx, prism, scale) {
			ctx.beginPath()
			ctx.moveTo(prism.top[0][0], prism.top[0][1])
			ctx.lineTo(prism.top[2][0], prism.top[2][1])
			ctx.moveTo(prism.top[1][0], prism.top[1][1])
			ctx.lineTo(prism.top[3][0], prism.top[3][1])
			ctx.strokeStyle = INVALID_COLOR
			ctx.lineWidth = Math.max(1, 1.5 * scale)
			ctx.stroke()
		}

		function drawEraseMark(ctx, prism, scale) {
			const centerX = prism.top[2][0]
			const centerY = prism.top[2][1] - Math.abs(prism.top[2][1] - prism.top[0][1]) * .45
			const radius = Math.max(3 * scale, Math.abs(prism.top[1][0] - prism.top[3][0]) * .18)
			ctx.beginPath()
			ctx.moveTo(centerX - radius, centerY)
			ctx.lineTo(centerX + radius, centerY)
			ctx.strokeStyle = ERASER_COLOR
			ctx.lineCap = 'round'
			ctx.lineWidth = Math.max(1, 1.7 * scale)
			ctx.stroke()
		}

		function drawBucketMark(ctx, prism, scale) {
			const centerX = prism.top[2][0]
			const centerY = prism.top[2][1] - Math.abs(prism.top[2][1] - prism.top[0][1]) * .48
			const radius = Math.max(2.5 * scale, Math.abs(prism.top[1][0] - prism.top[3][0]) * .12)
			ctx.beginPath()
			ctx.moveTo(centerX, centerY - radius * 1.4)
			ctx.bezierCurveTo(centerX + radius * 1.2, centerY, centerX + radius, centerY + radius, centerX, centerY + radius)
			ctx.bezierCurveTo(centerX - radius, centerY + radius, centerX - radius * 1.2, centerY, centerX, centerY - radius * 1.4)
			ctx.fillStyle = BUCKET_COLOR
			ctx.fill()
		}

		function drawCrosshair(ctx, game, valid, action, recipe, subtool) {
			const point = mousePoint(game)
			if (!ctx || !point) return
			const scale = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const accent = valid
				? action === 'erase' ? ERASER_COLOR : subtool === 'bucket' ? BUCKET_COLOR : recipeColors(game, recipe).accent
				: INVALID_COLOR
			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.globalCompositeOperation = 'destination-out'
				ctx.beginPath()
				ctx.arc(point[0], point[1], CLEAR_RADIUS_CSS * scale, 0, Math.PI * 2)
				ctx.fill()
				ctx.globalCompositeOperation = 'source-over'
				ctx.translate(point[0], point[1])
				traceCursor(ctx, CROSSHAIR_RADIUS_CSS * scale, subtool)
				ctx.lineCap = 'round'
				ctx.strokeStyle = '#000000'
				ctx.lineWidth = 3.2 * scale
				ctx.stroke()
				traceCursor(ctx, CROSSHAIR_RADIUS_CSS * scale, subtool)
				ctx.strokeStyle = accent
				ctx.lineWidth = 1.35 * scale
				ctx.stroke()
			} finally {
				ctx.restore()
			}
		}

		function traceCrosshair(ctx, radius) {
			const gap = radius * .35
			ctx.beginPath()
			ctx.moveTo(-radius, 0)
			ctx.lineTo(-gap, 0)
			ctx.moveTo(gap, 0)
			ctx.lineTo(radius, 0)
			ctx.moveTo(0, -radius)
			ctx.lineTo(0, -gap)
			ctx.moveTo(0, gap)
			ctx.lineTo(0, radius)
		}

		function traceCursor(ctx, radius, subtool) {
			if (subtool !== 'bucket') return traceCrosshair(ctx, radius)
			ctx.beginPath()
			ctx.moveTo(0, -radius)
			ctx.bezierCurveTo(radius * .8, -radius * .15, radius * .7, radius * .8, 0, radius)
			ctx.bezierCurveTo(-radius * .7, radius * .8, -radius * .8, -radius * .15, 0, -radius)
		}

		function tracePolygon(ctx, points) {
			ctx.beginPath()
			traceOpenPolygon(ctx, points, true)
		}

		function traceOpenPolygon(ctx, points, close) {
			ctx.moveTo(points[0][0], points[0][1])
			for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1])
			if (close) ctx.closePath()
		}

		function normalizeCells(value) {
			if (!Array.isArray(value)) return []
			const result = []
			const seen = new Set()
			for (const entry of value) {
				if (!isCell(entry)) continue
				const cell = [Number(entry[0]), Number(entry[1])]
				const key = cellKey(cell)
				if (seen.has(key)) continue
				seen.add(key)
				result.push(cell)
			}
			return result
		}

		function recipeColors(game, recipe) {
			const weights = Array.isArray(recipe?.weights) ? recipe.weights : []
			const valid = weights.map(function (entry) {
				return {
					resource: Number(entry?.resource),
					weight: Number(entry?.weight),
					triplet: game?.codex?.resources?.[Number(entry?.resource)]?.triplet
				}
			}).filter(function (entry) {
				return Number.isInteger(entry.resource) && entry.weight > 0 && Array.isArray(entry.triplet)
			})
			const total = valid.reduce(function (sum, entry) { return sum + entry.weight }, 0)
			if (!valid.length || !total) {
				return { triplet: [[67, 180, 255], [84, 205, 170], [117, 220, 255]], accent: BRUSH_COLOR }
			}
			const blended = [0, 1, 2].map(function (face) {
				const sum = valid.reduce(function (result, entry) {
					const rgb = parseColor(entry.triplet[face]) || parseColor(entry.triplet[0]) || [117, 220, 255]
					return [
						result[0] + rgb[0] * entry.weight,
						result[1] + rgb[1] * entry.weight,
						result[2] + rgb[2] * entry.weight
					]
				}, [0, 0, 0])
				return sum.map(function (channel) { return Math.round(channel / total) })
			})
			const dominant = valid.slice().sort(function (left, right) {
				return right.weight - left.weight || left.resource - right.resource
			})[0]
			const accent = parseColor(dominant?.triplet?.[2]) || blended[2]
			return { triplet: blended, accent: rgba(accent, .96) }
		}

		function parseColor(value) {
			const text = String(value || '').trim()
			let match = /^#([0-9a-f]{3})$/i.exec(text)
			if (match) return match[1].split('').map(function (digit) { return Number.parseInt(digit + digit, 16) })
			match = /^#([0-9a-f]{6})$/i.exec(text)
			if (match) return [0, 2, 4].map(function (index) { return Number.parseInt(match[1].slice(index, index + 2), 16) })
			match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(text)
			return match ? [Number(match[1]), Number(match[2]), Number(match[3])].map(function (channel) {
				return clamp(Math.round(channel), 0, 255)
			}) : null
		}

		function rgba(rgb, alpha) {
			return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + alpha + ')'
		}

		function actionForSubtool(value) {
			return value === 'eraser' ? 'erase' : 'paint'
		}

		function normalizeSubtool(value) {
			return value === 'eraser' ? 'eraser' : value === 'bucket' ? 'bucket' : 'brush'
		}

		function cellKey(cell) {
			return cell[0] + ':' + cell[1]
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

		function clonePlain(value) {
			if (value === undefined) return null
			try {
				return JSON.parse(JSON.stringify(value))
			} catch (error) {
				return null
			}
		}
	}
})
