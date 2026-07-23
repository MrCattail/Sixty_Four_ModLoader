ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const RENDER_LAYER_ID = 'interaction'
		const RENDER_CALLBACK_ID = 'world-editor-selected-cell'

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Selection overlay 2A could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Selection overlay 2A could not find the selection state.')
				return
			}
			if (!api.render || typeof api.render.onLayer !== 'function') {
				console.warn('[Cattail World Editor] Selection overlay 2A requires Render API v1.')
				return
			}

			let currentSelection = selection.snapshot()
			const stopSelectionSubscription = selection.subscribe(function (state) {
				currentSelection = state
			})

			const stopRendering = api.render.onLayer(RENDER_LAYER_ID, function ({ game: renderGame, ctx, width, height }) {
				drawSelection(runtime, currentSelection, renderGame, ctx, width, height)
			}, {
				id: RENDER_CALLBACK_ID,
				order: 50,
				space: 'screen',
				enabled({ game: renderGame }) {
					return shouldRender(runtime, currentSelection, renderGame)
				}
			})

			runtime.addCleanup(function () {
				if (typeof stopRendering === 'function') stopRendering()
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
			})
			console.info('[Cattail World Editor] Selection overlay 2A ready.')
		})

		function shouldRender(runtime, selection, game) {
			if (!runtime || runtime.game !== game || !runtime.isActive()) return false
			if (!game || game.halt || game.splash?.isShown || !game.canvas || typeof game.uvToXY !== 'function') return false
			if (!selection || selection.plane !== (game.plane ? 1 : 0)) return false
			if (!isRange(selection.previewRange) && !isRange(selection.selectedRange)) return false
			return Number.isFinite(Number(game.unit)) && Number(game.unit) > 0
		}

		function drawSelection(runtime, selection, game, ctx, width, height) {
			if (!ctx || !shouldRender(runtime, selection, game)) return

			const unit = Number(game.unit)
			const pixelRatio = Math.max(1, finiteOr(game.pixelRatio, finiteOr(globalThis.devicePixelRatio, 1)))
			const solidUnit = Number(game.solidUnit)
			const fallbackZoom = Number.isFinite(solidUnit) && solidUnit > 0 ? unit / solidUnit : 1
			const zoom = Math.max(0, finiteOr(game.zoom, fallbackZoom))
			const strokeScale = Math.sqrt(zoom)
			const outerWidth = clamp(pixelRatio * 2 * strokeScale, pixelRatio * .4, pixelRatio * 3.2)
			const innerWidth = clamp(pixelRatio * strokeScale, pixelRatio * .2, pixelRatio * 1.6)
			const canvasWidth = Number(width) || Number(game.w) || 0
			const canvasHeight = Number(height) || Number(game.h) || 0
			const screenOffsetX = finiteOr(game.w2, canvasWidth / 2)
			const screenOffsetY = finiteOr(game.h2, canvasHeight / 2)
			const preview = isRange(selection.previewRange) ? selection.previewRange : null
			const range = preview || selection.selectedRange

			let rangeCorners
			let startCorners
			let endCorners
			try {
				rangeCorners = projectRangeCorners(game, range, screenOffsetX, screenOffsetY)
				startCorners = projectCellCorners(game, range.start, screenOffsetX, screenOffsetY)
				if (!sameCell(range.start, range.end)) {
					endCorners = projectCellCorners(game, range.end, screenOffsetX, screenOffsetY)
				} else if (!preview) {
					endCorners = projectCellCorners(game, range.end, screenOffsetX, screenOffsetY, .16)
				}
			} catch (error) {
				return
			}
			if (!rangeCorners || !startCorners) return

			ctx.save()
			try {
				ctx.setTransform(1, 0, 0, 1, 0, 0)
				ctx.lineJoin = 'round'
				drawPolygon(ctx, rangeCorners, getRangeColors(game, !!preview), outerWidth, innerWidth)
				drawPolygon(ctx, startCorners, {
					fill: game.plane ? 'rgba(93, 211, 255, .28)' : 'rgba(67, 180, 255, .24)',
					outer: 'rgba(14, 22, 31, .72)',
					inner: 'rgba(93, 211, 255, .98)'
				}, outerWidth, innerWidth)
				if (endCorners) {
					const sameCommittedCell = !preview && sameCell(range.start, range.end)
					drawPolygon(ctx, endCorners, {
						fill: sameCommittedCell
							? 'rgba(255, 168, 78, .08)'
							: game.plane ? 'rgba(255, 174, 82, .30)' : 'rgba(255, 152, 61, .26)',
						outer: sameCommittedCell ? 'rgba(35, 22, 12, .58)' : 'rgba(35, 22, 12, .74)',
						inner: 'rgba(255, 168, 78, .98)'
					}, sameCommittedCell ? outerWidth * .8 : outerWidth, sameCommittedCell ? innerWidth * .8 : innerWidth)
				}
			} finally {
				ctx.restore()
			}
		}

		function getRangeColors(game, preview) {
			if (game.plane) {
				return preview
					? {
						fill: 'rgba(198, 175, 241, .12)',
						outer: 'rgba(18, 12, 27, .72)',
						inner: 'rgba(211, 190, 250, .88)'
					}
					: {
						fill: 'rgba(198, 175, 241, .18)',
						outer: 'rgba(18, 12, 27, .80)',
						inner: 'rgba(218, 201, 252, .96)'
					}
			}
			return preview
				? {
					fill: 'rgba(170, 137, 220, .11)',
					outer: 'rgba(54, 40, 72, .66)',
					inner: 'rgba(183, 151, 229, .86)'
				}
				: {
					fill: 'rgba(170, 137, 220, .16)',
					outer: 'rgba(54, 40, 72, .74)',
					inner: 'rgba(189, 159, 233, .95)'
				}
		}

		function drawPolygon(ctx, corners, colors, outerWidth, innerWidth) {
			ctx.beginPath()
			ctx.moveTo(corners[0][0], corners[0][1])
			ctx.lineTo(corners[1][0], corners[1][1])
			ctx.lineTo(corners[2][0], corners[2][1])
			ctx.lineTo(corners[3][0], corners[3][1])
			ctx.closePath()
			ctx.fillStyle = colors.fill
			ctx.fill()
			ctx.strokeStyle = colors.outer
			ctx.lineWidth = outerWidth
			ctx.stroke()
			ctx.strokeStyle = colors.inner
			ctx.lineWidth = innerWidth
			ctx.stroke()
		}

		function projectRangeCorners(game, range, screenOffsetX, screenOffsetY) {
			const uvCorners = [
				[range.minU - .5, range.minV - .5],
				[range.maxU + .5, range.minV - .5],
				[range.maxU + .5, range.maxV + .5],
				[range.minU - .5, range.maxV + .5]
			]
			return projectCorners(game, uvCorners, screenOffsetX, screenOffsetY)
		}

		function projectCellCorners(game, cell, screenOffsetX, screenOffsetY, inset) {
			const u = Number(cell[0])
			const v = Number(cell[1])
			const halfSize = .5 - clamp(finiteOr(inset, 0), 0, .45)
			const uvCorners = [
				[u - halfSize, v - halfSize],
				[u + halfSize, v - halfSize],
				[u + halfSize, v + halfSize],
				[u - halfSize, v + halfSize]
			]
			return projectCorners(game, uvCorners, screenOffsetX, screenOffsetY)
		}

		function projectCorners(game, uvCorners, screenOffsetX, screenOffsetY) {
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

		function sameCell(left, right) {
			return isCell(left) && isCell(right) && Number(left[0]) === Number(right[0]) && Number(left[1]) === Number(right[1])
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
