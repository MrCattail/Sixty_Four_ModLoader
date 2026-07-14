(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailScanRangePreviewInstalled'
	const overlayKey = '__cattailScanRangePreviewOverlay'
	const configKey = 'enableScanRangePreview'
	const scanEntityName = 'scan'
	const vanillaScanRadius = 16
	const minScanDiameter = 8
	const maxScanDiameter = 256
	const sharedSliderDiameterKey = '__cattailScanRealitySliderDiameter'
	const sharedSliderEnabledKey = '__cattailScanRealitySliderEnabled'

	let previewEnabled = null
	let cachedPreviewShape = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installScanRangePreview(api)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId === MOD_ID && detail.key === configKey) previewEnabled = detail.value !== false
			})
		} catch (error) {}
	}

	function installScanRangePreview(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				if (!shouldRenderScanRangePreview(this, api)) clearScanRangeOverlay(this)
				return result
			}
		})

		api.patch(Game.prototype, 'renderAvailability', function (original) {
			return function (...args) {
				if (!shouldRenderScanRangePreview(this, api)) {
					clearScanRangeOverlay(this)
					return original.apply(this, args)
				}
				renderScanRangePreview(this)
			}
		})

		api.patch(Game.prototype, 'renderSOI', function (original) {
			return function (...args) {
				if (shouldSkipGenericScanSoi(this, api, args[0])) return
				return original.apply(this, args)
			}
		})
	}

	function shouldRenderScanRangePreview(game, api) {
		return !!(
			isEnabled(api) &&
			game &&
			!game.halt &&
			game.canvas &&
			Array.isArray(game.hoveredCell) &&
			game.itemInHand &&
			!game.itemInHand.eraser &&
			game.itemInHand.name === scanEntityName &&
			(!game.isMobile || game.mouse?.state === 1)
		)
	}

	function isEnabled(api) {
		return previewEnabled === null ? api.config.get(configKey, true) !== false : previewEnabled !== false
	}

	function shouldSkipGenericScanSoi(game, api, target) {
		return shouldRenderScanRangePreview(game, api) && Array.isArray(target) && sameCell(target, game.hoveredCell)
	}

	function sameCell(a, b) {
		return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1]
	}

	function renderScanRangePreview(game) {
		if (typeof document === 'undefined' || typeof game.uvToXY !== 'function') return
		const overlay = ensureScanRangeOverlay(game)
		if (!overlay || !syncOverlayCanvas(game, overlay)) {
			clearScanRangeOverlay(game)
			return
		}

		const state = getPreviewState(game, overlay)
		if (!state) {
			clearScanRangeOverlay(game)
			return
		}

		overlay.canvas.style.display = 'block'
		if (overlay.lastKey === state.key) return
		overlay.lastKey = state.key

		const ctx = overlay.ctx
		ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height)
		ctx.save()
		ctx.translate(state.x, state.y)
		ctx.fillStyle = state.fillColor
		fillShape(ctx, state.shape.rangePath, state.shape.rangeCells)
		ctx.fillStyle = state.centerColor
		fillShape(ctx, state.shape.centerPath, state.shape.centerCell ? [state.shape.centerCell] : null)
		ctx.restore()
	}

	function ensureScanRangeOverlay(game) {
		if (!game || !game.canvas) return null
		const existing = game[overlayKey]
		if (existing && existing.canvas && existing.canvas.isConnected) return existing

		const canvas = document.createElement('canvas')
		canvas.className = 'cattail-scan-range-overlay'
		canvas.setAttribute('aria-hidden', 'true')
		canvas.style.position = 'fixed'
		canvas.style.left = '0px'
		canvas.style.top = '0px'
		canvas.style.width = '0px'
		canvas.style.height = '0px'
		canvas.style.margin = '0'
		canvas.style.padding = '0'
		canvas.style.border = '0'
		canvas.style.pointerEvents = 'none'
		canvas.style.display = 'none'

		const parent = game.canvas.parentNode || document.body
		if (game.canvas.parentNode) parent.insertBefore(canvas, game.canvas.nextSibling)
		else parent.appendChild(canvas)

		const overlay = {
			canvas,
			ctx: canvas.getContext('2d'),
			lastKey: ''
		}
		game[overlayKey] = overlay
		return overlay.ctx ? overlay : null
	}

	function syncOverlayCanvas(game, overlay) {
		const source = game.canvas
		if (!source || !source.isConnected) return false
		const rect = source.getBoundingClientRect()
		if (!rect.width || !rect.height) return false

		const style = overlay.canvas.style
		const left = rect.left + 'px'
		const top = rect.top + 'px'
		const widthCss = rect.width + 'px'
		const heightCss = rect.height + 'px'
		if (style.left !== left) style.left = left
		if (style.top !== top) style.top = top
		if (style.width !== widthCss) style.width = widthCss
		if (style.height !== heightCss) style.height = heightCss

		const backingWidth = getBackingWidth(game, rect)
		const backingHeight = getBackingHeight(game, rect)
		if (overlay.canvas.width !== backingWidth) {
			overlay.canvas.width = backingWidth
			overlay.lastKey = ''
		}
		if (overlay.canvas.height !== backingHeight) {
			overlay.canvas.height = backingHeight
			overlay.lastKey = ''
		}
		return true
	}

	function getBackingWidth(game, rect) {
		const ratio = getPixelRatio(game)
		return Math.max(1, Math.round(Number(game.w) || game.canvas.width || rect.width * ratio))
	}

	function getBackingHeight(game, rect) {
		const ratio = getPixelRatio(game)
		return Math.max(1, Math.round(Number(game.h) || game.canvas.height || rect.height * ratio))
	}

	function getPixelRatio(game) {
		const ratio = Number(game.pixelRatio) || Number(window.devicePixelRatio) || 1
		return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
	}

	function getPreviewState(game, overlay) {
		const projection = getProjection(game)
		if (!projection) return null
		const scanRadius = getScanRadius()
		const shape = getCachedPreviewShape(scanRadius, projection)
		if (!shape) return null

		const originXY = game.uvToXY(game.hoveredCell)
		if (!Array.isArray(originXY)) return null

		const x = (Number(game.w2) || overlay.canvas.width / 2) + originXY[0]
		const y = (Number(game.h2) || overlay.canvas.height / 2) + originXY[1]
		const canPlace = !!game.canPlace
		const fillColor = getFillColor(game, canPlace)
		const centerColor = getCenterColor(game, canPlace)
		const key = [
			shape.key,
			formatProjectionNumber(x),
			formatProjectionNumber(y),
			canPlace ? '1' : '0',
			game.plane ? '1' : '0',
			overlay.canvas.width,
			overlay.canvas.height
		].join('|')

		return { key, shape, x, y, fillColor, centerColor }
	}

	function clearScanRangeOverlay(game) {
		const overlay = game && game[overlayKey]
		if (!overlay || !overlay.ctx || !overlay.canvas) return
		if (overlay.canvas.style.display !== 'none') overlay.canvas.style.display = 'none'
		if (overlay.lastKey === '') return
		overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height)
		overlay.lastKey = ''
	}

	function getCachedPreviewShape(scanRadius, projection) {
		const key = scanRadius + '|' + projection.key
		if (cachedPreviewShape && cachedPreviewShape.key === key) return cachedPreviewShape
		cachedPreviewShape = buildPreviewShape(scanRadius, projection, key)
		return cachedPreviewShape
	}

	function getProjection(game) {
		try {
			const o = game.uvToXY([0, 0])
			const u = game.uvToXY([1, 0])
			const v = game.uvToXY([0, 1])
			const projection = {
				ux: u[0] - o[0],
				uy: u[1] - o[1],
				vx: v[0] - o[0],
				vy: v[1] - o[1]
			}
			projection.key = [
				formatProjectionNumber(projection.ux),
				formatProjectionNumber(projection.uy),
				formatProjectionNumber(projection.vx),
				formatProjectionNumber(projection.vy)
			].join(',')
			return projection
		} catch (error) {
			return null
		}
	}

	function formatProjectionNumber(value) {
		return Number.isFinite(value) ? value.toFixed(3) : '0'
	}

	function buildPreviewShape(scanRadius, projection, key) {
		const canUsePath = typeof Path2D === 'function'
		const rangePath = canUsePath ? new Path2D() : null
		const centerPath = canUsePath ? new Path2D() : null
		const rangeCells = canUsePath ? null : []
		const centerCell = getRelativeCellCorners(projection, 0, 0)
		const scanRadius2 = scanRadius * scanRadius

		for (let dx = -scanRadius; dx < scanRadius; dx++) {
			for (let dy = -scanRadius; dy < scanRadius; dy++) {
				const d2 = dx * dx + dy * dy
				if (d2 > scanRadius2) continue
				const cell = getRelativeCellCorners(projection, dx, dy)
				if (rangePath) addPolygon(rangePath, cell)
				else rangeCells.push(cell)
			}
		}
		if (centerPath) addPolygon(centerPath, centerCell)

		return { key, rangePath, centerPath, rangeCells, centerCell }
	}

	function getScanRadius() {
		const sharedDiameter = getSharedScanDiameter()
		const diameter = sharedDiameter === null ? vanillaScanRadius * 2 : sharedDiameter
		return Math.max(1, Math.round(diameter / 2))
	}

	function getSharedScanDiameter() {
		if (typeof window === 'undefined') return null
		if (window[sharedSliderEnabledKey] !== true) return null
		const diameter = Number(window[sharedSliderDiameterKey])
		if (!Number.isFinite(diameter) || diameter <= 0) return null
		return Math.max(minScanDiameter, Math.min(maxScanDiameter, diameter))
	}

	function getRelativeCellCorners(projection, u, v) {
		return [
			projectRelative(projection, u - 0.5, v - 0.5),
			projectRelative(projection, u + 0.5, v - 0.5),
			projectRelative(projection, u + 0.5, v + 0.5),
			projectRelative(projection, u - 0.5, v + 0.5)
		]
	}

	function projectRelative(projection, u, v) {
		return [
			u * projection.ux + v * projection.vx,
			u * projection.uy + v * projection.vy
		]
	}

	function addPolygon(path, points) {
		path.moveTo(points[0][0], points[0][1])
		for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1])
		path.closePath()
	}

	function fillShape(ctx, path, cells) {
		if (path) {
			ctx.fill(path)
			return
		}
		if (!cells) return
		for (let i = 0; i < cells.length; i++) fillPolygon(ctx, cells[i])
	}

	function fillPolygon(ctx, points) {
		ctx.beginPath()
		ctx.moveTo(points[0][0], points[0][1])
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
		ctx.closePath()
		ctx.fill()
	}

	function getFillColor(game, canPlace) {
		if (!canPlace) return 'rgba(236, 20, 1, 0.04)'
		return game.plane ? 'rgba(255, 255, 255, 0.045)' : 'rgba(9, 211, 80, 0.04)'
	}

	function getCenterColor(game, canPlace) {
		if (!canPlace) return 'rgba(236, 20, 1, 0.12)'
		return game.plane ? 'rgba(255, 255, 255, 0.1)' : 'rgba(9, 211, 80, 0.1)'
	}
})()