(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailFloorGridLinesInstalled'
	const enableConfigKey = 'enableFloorGridLines'
	const realityColorConfigKey = 'floorGridLineRealityColor'
	const voidColorConfigKey = 'floorGridLineVoidColor'
	const defaultRealityColor = '#1D232B'
	const defaultVoidColor = '#FFFFFF'
	const maxGridLines = 1200
	const renderLayerId = 'background'
	const renderCallbackId = 'tweaks-floor-grid-lines'

	let previewEnabled = null
	let previewRealityColor = null
	let previewVoidColor = null
	let renderApiRegistered = false

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installFloorGridLines(api)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID) return
				if (detail.key === enableConfigKey) previewEnabled = detail.value === true
				if (detail.key === realityColorConfigKey) previewRealityColor = detail.value
				if (detail.key === voidColorConfigKey) previewVoidColor = detail.value
			})
		} catch (error) {}
	}

	function installFloorGridLines(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		registerFloorGridLinesRenderApi(api)
		api.patch(Game.prototype, 'renderConductors', function (original) {
			return function (...args) {
				if (!shouldUseFloorGridLinesRenderApi(api, this)) renderFloorGridLines(this, api)
				return original.apply(this, args)
			}
		})
	}

	function registerFloorGridLinesRenderApi(api) {
		if (renderApiRegistered || !api?.render || typeof api.render.onLayer !== 'function') return
		api.render.onLayer(renderLayerId, function ({ game, ctx }) {
			renderFloorGridLines(game, api, ctx, { screenSpace: true })
		}, {
			id: renderCallbackId,
			order: 10,
			space: 'screen',
			enabled({ game }) { return shouldUseFloorGridLinesRenderApi(api, game) }
		})
		renderApiRegistered = true
	}

	function shouldUseFloorGridLinesRenderApi(api, game) {
		return !!(
			renderApiRegistered &&
			api?.render &&
			(typeof api.render.isEnabled !== 'function' || api.render.isEnabled() !== false) &&
			shouldShowFloorGridLines(game, api)
		)
	}

	function renderFloorGridLines(game, api, ctx = game?.ctx, options = {}) {
		if (!shouldShowFloorGridLines(game, api)) return
		if (!ctx || typeof game.xyToUV !== 'function') return
		const toXY = options.screenSpace === true ? game.uvToXYUntranslated : game.uvToXY
		if (typeof toXY !== 'function') return
		const bounds = getVisibleUvBounds(game)
		if (!bounds) return
		const step = getGridStep(bounds)
		const color = getFloorGridLineColor(game, api)
		const width = Math.max(0.5, Math.min((game.pixelRatio || 1) * 0.9, (game.unit || 1) * 0.015))

		ctx.save()
		ctx.strokeStyle = color
		ctx.lineWidth = width
		ctx.lineCap = 'butt'
		ctx.lineJoin = 'miter'
		for (let y = bounds.y0; y <= bounds.y1; y += step) {
			const xy0 = toXY.call(game, [bounds.x0, y])
			const xy1 = toXY.call(game, [bounds.x1, y])
			drawGridLine(ctx, xy0, xy1)
		}
		for (let x = bounds.x0; x <= bounds.x1; x += step) {
			const xy0 = toXY.call(game, [x, bounds.y0])
			const xy1 = toXY.call(game, [x, bounds.y1])
			drawGridLine(ctx, xy0, xy1)
		}
		ctx.restore()
	}

	function shouldShowFloorGridLines(game, api) {
		if (!game || game.halt) return false
		return previewEnabled === null ? api.config.get(enableConfigKey, false) === true : previewEnabled === true
	}

	function getVisibleUvBounds(game) {
		try {
			const lt = normalizeGridUv(game.xyToUV([0, 0]))
			const rb = normalizeGridUv(game.xyToUV([game.w, game.h]))
			const rt = normalizeGridUv(game.xyToUV([game.w, 0]))
			const lb = normalizeGridUv(game.xyToUV([0, game.h]))
			return {
				x0: Math.min(lt[0], rb[0]),
				x1: Math.max(lt[0], rb[0]),
				y0: Math.min(rt[1], lb[1]),
				y1: Math.max(rt[1], lb[1])
			}
		} catch (error) {
			return null
		}
	}

	function normalizeGridUv(uv) {
		return [Math.floor(Number(uv?.[0]) || 0) + 0.5, Math.floor(Number(uv?.[1]) || 0) + 0.5]
	}

	function getGridStep(bounds) {
		const xCount = Math.max(0, Math.floor(bounds.x1 - bounds.x0) + 1)
		const yCount = Math.max(0, Math.floor(bounds.y1 - bounds.y0) + 1)
		return Math.max(1, Math.ceil((xCount + yCount) / maxGridLines))
	}

	function drawGridLine(ctx, xy0, xy1) {
		ctx.beginPath()
		ctx.moveTo(xy0[0], xy0[1])
		ctx.lineTo(xy1[0], xy1[1])
		ctx.stroke()
	}

	function getFloorGridLineColor(game, api) {
		const preview = game.plane ? previewVoidColor : previewRealityColor
		if (preview !== null) return normalizeHexColor(preview) || getAutomaticFloorGridLineColor(game)
		const key = game.plane ? voidColorConfigKey : realityColorConfigKey
		const configured = normalizeHexColor(api.config.get(key, ''))
		if (configured) return configured
		return getAutomaticFloorGridLineColor(game)
	}

	function getAutomaticFloorGridLineColor(game) {
		return game.plane ? defaultVoidColor : defaultRealityColor
	}

	function normalizeHexColor(value) {
		if (value === undefined || value === null) return ''
		const text = String(value).trim()
		const shortMatch = text.match(/^#?([0-9a-f]{3})$/i)
		if (shortMatch) {
			return '#' + shortMatch[1].split('').map(function (part) { return part + part }).join('').toUpperCase()
		}
		const fullMatch = text.match(/^#?([0-9a-f]{6})$/i)
		return fullMatch ? '#' + fullMatch[1].toUpperCase() : ''
	}
})()