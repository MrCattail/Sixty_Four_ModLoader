(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailScanRangePreviewInstalled'
	const configKey = 'enableScanRangePreview'
	const renderLayerId = 'interaction'
	const renderCallbackId = 'scan-range-preview'
	const scanEntityName = 'scan'
	const vanillaScanRadius = 16
	const minScanDiameter = 8
	const maxScanDiameter = 256
	const sharedSliderDiameterKey = '__cattailScanRealitySliderDiameter'
	const sharedSliderEnabledKey = '__cattailScanRealitySliderEnabled'

	let previewEnabled = null
	let cachedPreviewShape = null
	let renderCallbackRegistered = false

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

		registerScanRangeRenderCallback(api)

		api.patch(Game.prototype, 'renderAvailability', function (original) {
			return function (...args) {
				if (shouldUseRenderLayerPreview(this, api)) return
				return original.apply(this, args)
			}
		})

		api.patch(Game.prototype, 'renderSOI', function (original) {
			return function (...args) {
				if (shouldSkipGenericScanSoi(this, api, args[0])) return
				return original.apply(this, args)
			}
		})
	}

	function registerScanRangeRenderCallback(api) {
		if (!api?.render || typeof api.render.onLayer !== 'function') return
		api.render.onLayer(renderLayerId, function ({ game, ctx, canvas, width, height }) {
			renderScanRangePreview(game, ctx, { canvas, width, height }, api)
		}, {
			id: renderCallbackId,
			order: 20,
			space: 'screen',
			enabled({ game }) { return shouldUseRenderLayerPreview(game, api) }
		})
		renderCallbackRegistered = true
	}

	function shouldUseRenderLayerPreview(game, api) {
		return shouldRenderScanRangePreview(game, api) && isRenderLayerPreviewAvailable(api)
	}

	function isRenderLayerPreviewAvailable(api) {
		if (!renderCallbackRegistered || !api?.render) return false
		if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
		return true
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
		return shouldUseRenderLayerPreview(game, api) && Array.isArray(target) && sameCell(target, game.hoveredCell)
	}

	function sameCell(a, b) {
		return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1]
	}

	function renderScanRangePreview(game, ctx, layer, api) {
		if (!ctx || !shouldRenderScanRangePreview(game, api) || typeof game.uvToXY !== 'function') return
		const state = getPreviewState(game, layer)
		if (!state) return

		ctx.save()
		try {
			ctx.setTransform(1, 0, 0, 1, 0, 0)
			ctx.translate(state.x, state.y)
			ctx.fillStyle = state.fillColor
			fillShape(ctx, state.shape.rangePath, state.shape.rangeCells)
			ctx.fillStyle = state.centerColor
			fillShape(ctx, state.shape.centerPath, state.shape.centerCell ? [state.shape.centerCell] : null)
		} finally {
			ctx.restore()
		}
	}

	function getPreviewState(game, layer) {
		const projection = getProjection(game)
		if (!projection) return null
		const scanRadius = getScanRadius()
		const shape = getCachedPreviewShape(scanRadius, projection)
		if (!shape) return null

		const originXY = game.uvToXY(game.hoveredCell)
		if (!Array.isArray(originXY)) return null

		const width = Number(layer?.width || layer?.canvas?.width || game.w) || 0
		const height = Number(layer?.height || layer?.canvas?.height || game.h) || 0
		const x = (Number(game.w2) || width / 2) + originXY[0]
		const y = (Number(game.h2) || height / 2) + originXY[1]
		const canPlace = !!game.canPlace
		const fillColor = getFillColor(game, canPlace)
		const centerColor = getCenterColor(game, canPlace)
		return { shape, x, y, fillColor, centerColor }
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