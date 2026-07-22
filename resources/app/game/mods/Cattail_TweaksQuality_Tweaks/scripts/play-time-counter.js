(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const LEGACY_MOD_ID = 'Cattail_TweaksQuality_Dynamic-Details'
	const installedKey = '__cattailPlayTimeCounterInstalled'
	const renderLayerId = 'top-effects'
	const renderCallbackId = 'tweaks-play-time-counter'
	const defaultPosition = 'bottom-right'
	const topPosition = 'top-center'
	const leftPosition = 'bottom-left'

	let renderApiRegistered = false

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			migrateLegacyPlayTimeCounterConfig(api)

			api.on('afterVanillaScripts', function () {
				installPlayTimeCounter(api)
			})
		}
	})

	function installPlayTimeCounter(api) {
		if (typeof Game === 'undefined' || window[installedKey]) return
		window[installedKey] = true
		registerPlayTimeCounterRenderApi(api)
		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				if (!shouldUsePlayTimeCounterRenderApi(api)) renderPlayTimeCounter(this, api)
				return result
			}
		})
	}

	function registerPlayTimeCounterRenderApi(api) {
		if (renderApiRegistered || !api.render || typeof api.render.onLayer !== 'function') return
		api.render.onLayer(renderLayerId, function ({ game, ctx }) {
			renderPlayTimeCounter(game, api, ctx)
		}, {
			id: renderCallbackId,
			order: 30,
			space: 'screen',
			enabled({ game }) { return shouldUsePlayTimeCounterRenderApi(api) && isPlayTimeCounterReady(game, api) }
		})
		renderApiRegistered = true
	}

	function shouldUsePlayTimeCounterRenderApi(api) {
		return !!(renderApiRegistered && api.render && (typeof api.render.isEnabled !== 'function' || api.render.isEnabled() !== false))
	}

	function renderPlayTimeCounter(game, api, ctx = game?.ctx) {
		if (!shouldShowPlayTimeCounter(game, api, ctx)) return
		const text = formatPlayTimeCounter(game.stats.totalPlayAndIdleTime)
		const pixelRatio = game.pixelRatio || 1
		const unit = game.screenUnit || game.unit || 1
		const fontSize = Math.max(10 * pixelRatio, Math.min(15 * pixelRatio, unit * 0.12))
		const textHeight = fontSize * 1.18
		const margin = Math.max(7 * pixelRatio, unit * 0.18)

		ctx.save()
		if (typeof ctx.resetTransform === 'function') ctx.resetTransform()
		ctx.font = '400 ' + fontSize + 'px Montserrat, Arial, sans-serif'
		ctx.textBaseline = 'top'
		ctx.textAlign = 'left'
		const textWidth = ctx.measureText(text).width
		const point = getPlayTimeCounterPoint(game, api, textWidth, textHeight, margin)
		ctx.shadowColor = 'rgba(255, 255, 255, 0.42)'
		ctx.shadowBlur = Math.max(1, pixelRatio * 1.45)
		ctx.fillStyle = 'rgba(36, 39, 45, 0.9)'
		ctx.fillText(text, point.x, point.y)
		ctx.restore()
	}

	function shouldShowPlayTimeCounter(game, api, ctx = game?.ctx) {
		return !!(isPlayTimeCounterReady(game, api) && ctx)
	}

	function isPlayTimeCounterReady(game, api) {
		return !!(
			api.config.get('enablePlayTimeCounter', true) !== false &&
			game &&
			!game.halt &&
			game.stats &&
			Number.isFinite(Number(game.stats.totalPlayAndIdleTime)) &&
			Number.isFinite(Number(game.w)) &&
			Number.isFinite(Number(game.h))
		)
	}

	function getPlayTimeCounterPoint(game, api, textWidth, textHeight, margin) {
		const mode = getPlayTimeCounterPositionMode(api)
		if (mode === topPosition) return getTopPlayTimeCounterPoint(game, textWidth, textHeight, margin)
		if (mode === leftPosition) return getBottomLeftPlayTimeCounterPoint(game, textWidth, textHeight, margin)
		return getBottomRightPlayTimeCounterPoint(game, textWidth, textHeight, margin)
	}

	function getPlayTimeCounterPositionMode(api) {
		const raw = readConfigWithLegacy(api, 'playTimeCounterPosition', 2)
		const normalized = normalizePlayTimeCounterPositionValue(raw)
		if (normalized === 1) return topPosition
		if (normalized === 0) return leftPosition
		return defaultPosition
	}

	function getTopPlayTimeCounterPoint(game, textWidth, textHeight, margin) {
		const unit = game.screenUnit || game.unit || 1
		return {
			x: clampNumber(game.w / 2 - textWidth / 2, margin, Math.max(margin, game.w - textWidth - margin)),
			y: clampNumber(Math.max(margin, unit * 0.42), margin, Math.max(margin, game.h - textHeight - margin))
		}
	}

	function getBottomLeftPlayTimeCounterPoint(game, textWidth, textHeight, margin) {
		const point = getBottomRightPlayTimeCounterPoint(game, textWidth, textHeight, margin)
		return {
			x: clampNumber(game.w - point.x - textWidth, margin, Math.max(margin, game.w - textWidth - margin)),
			y: point.y
		}
	}

	function getBottomRightPlayTimeCounterPoint(game, textWidth, textHeight, margin) {
		const pixelRatio = game.pixelRatio || 1
		const unit = game.screenUnit || game.unit || 1
		const gap = Math.max(7 * pixelRatio, unit * 0.22)
		const shopRect = getShopToggleCanvasRect(game)
		const targetCenterX = game.w * 0.8
		if (shopRect) {
			const maxCenterX = shopRect.x - gap - textWidth / 2
			const centerX = Math.min(targetCenterX, maxCenterX)
			return {
				x: clampNumber(centerX - textWidth / 2, margin, Math.max(margin, game.w - textWidth - margin)),
				y: clampNumber(shopRect.y + shopRect.height / 2 - textHeight / 2, margin, Math.max(margin, game.h - textHeight - margin))
			}
		}
		return {
			x: clampNumber(Math.min(targetCenterX - textWidth / 2, game.w - unit * 3 - gap - textWidth), margin, Math.max(margin, game.w - textWidth - margin)),
			y: clampNumber(game.h - unit * 1.75 - textHeight / 2, margin, Math.max(margin, game.h - textHeight - margin))
		}
	}

	function getShopToggleCanvasRect(game) {
		const element = game?.shop?.shopToggle || document.querySelector('.shopToggle')
		if (!element || !document.body.contains(element)) return null
		const style = getComputedStyle(element)
		if (style.display === 'none' || style.visibility === 'hidden') return null
		const rect = element.getBoundingClientRect?.()
		const canvasRect = game.canvas?.getBoundingClientRect?.()
		if (!rect || !canvasRect || !rect.width || !rect.height || !canvasRect.width || !canvasRect.height) return null
		const scaleX = game.w / canvasRect.width
		const scaleY = game.h / canvasRect.height
		return {
			x: (rect.left - canvasRect.left) * scaleX,
			y: (rect.top - canvasRect.top) * scaleY,
			width: rect.width * scaleX,
			height: rect.height * scaleY
		}
	}

	function formatPlayTimeCounter(ms) {
		const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000))
		const seconds = totalSeconds % 60
		const minutes = Math.floor(totalSeconds / 60) % 60
		const hours = Math.floor(totalSeconds / 3600)
		return hours + ':' + padTwoDigits(minutes) + ':' + padTwoDigits(seconds)
	}

	function padTwoDigits(value) {
		return value < 10 ? '0' + value : String(value)
	}

	function migrateLegacyPlayTimeCounterConfig(api) {
		try {
			const ownKey = configStorageKey(api.id, 'playTimeCounterPosition')
			const migratedKey = configStorageKey(api.id, 'playTimeCounterPositionOrderV2')
			const migrated = localStorage.getItem(migratedKey) === 'true'
			const ownRaw = localStorage.getItem(ownKey)
			if (ownRaw !== null) {
				const value = parseStoredConfigValue(ownRaw)
				localStorage.setItem(ownKey, JSON.stringify(normalizePlayTimeCounterPositionValue(migrated ? value : convertLegacyPlayTimeCounterPositionValue(value))))
				localStorage.setItem(migratedKey, 'true')
				return
			}
			const legacyRaw = localStorage.getItem(configStorageKey(LEGACY_MOD_ID, 'playTimeCounterPosition'))
			if (legacyRaw !== null) {
				localStorage.setItem(ownKey, JSON.stringify(normalizePlayTimeCounterPositionValue(convertLegacyPlayTimeCounterPositionValue(parseStoredConfigValue(legacyRaw)))))
				localStorage.setItem(migratedKey, 'true')
			}
		} catch (error) {}
	}

	function normalizePlayTimeCounterPositionValue(value) {
		if (value === 1 || value === true) return 1
		if (value === 2) return 2
		if (value === 0) return 0
		if (value === false) return 2
		const text = String(value ?? '').trim().toLowerCase()
		if (text === '1' || text === 'top' || text === 'top-center' || text === 'top center' || text === 'center-top') return 1
		if (text === '0' || text === 'left' || text === 'bottom-left' || text === 'bottom left' || text === 'left-bottom' || text === 'left bottom') return 0
		if (text === '2' || text === 'right' || text === 'bottom-right' || text === 'bottom right') return 2
		return 2
	}

	function convertLegacyPlayTimeCounterPositionValue(value) {
		if (value === 0 || value === false) return 2
		if (value === 2) return 0
		const text = String(value ?? '').trim().toLowerCase()
		if (text === '0') return 2
		if (text === '2') return 0
		return value
	}
	function readConfigWithLegacy(api, key, fallback) {
		try {
			const ownRaw = localStorage.getItem(configStorageKey(api.id, key))
			if (ownRaw !== null) return parseStoredConfigValue(ownRaw)
			const legacyRaw = localStorage.getItem(configStorageKey(LEGACY_MOD_ID, key))
			if (legacyRaw !== null) return parseStoredConfigValue(legacyRaw)
		} catch (error) {}
		return api.config.get(key, fallback)
	}

	function configStorageKey(modId, key) {
		return 'modloader:' + modId + ':config:' + key
	}

	function parseStoredConfigValue(raw) {
		try {
			return JSON.parse(raw)
		} catch (error) {
			return raw
		}
	}

	function clampNumber(value, min, max) {
		return Math.max(min, Math.min(max, value))
	}
})()