(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailResourceIconCacheInstalled'
	const apiKey = 'CattailTweaksResourceIconCache'
	const configKey = 'enableResourceIconRenderCache'
	const maxCacheSide = 512
	const maxCachePixels = 512 * 512
	const maxCacheEntries = 128
	const iconCaches = new Map()
	let previewEnabled = null

	const stats = {
		draws: 0,
		hits: 0,
		misses: 0,
		fallbacks: 0,
		clears: 0,
		lastFallback: '',
		lastCacheSize: null,
		fallbackReasons: {}
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installResourceIconCache(api)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID || detail.key !== configKey) return
				previewEnabled = detail.value !== false
				clearIconCaches()
			}, true)
		} catch (error) {}
	}

	function installResourceIconCache(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		installDebugApi(api)
		api.patch(Game.prototype, 'drawResourceInScreenCoordinates', function (original) {
			return function (id, position) {
				if (drawCachedResourceIcon(this, api, id, position)) return
				return original.apply(this, arguments)
			}
		})
	}

	function installDebugApi(api) {
		window[apiKey] = {
			stats() {
				const totalCached = stats.hits + stats.misses
				return Object.assign({}, stats, {
					enabled: isEnabled(api),
					cacheEntries: iconCaches.size,
					fallbackReasons: Object.assign({}, stats.fallbackReasons),
					cacheHitRate: totalCached ? roundNumber(stats.hits / totalCached, 4) : 0
				})
			},
			clear() {
				resetStats()
				clearIconCaches()
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			}
		}
	}

	function drawCachedResourceIcon(game, api, id, position) {
		const resourceId = Number(id)
		const sprite = game?.resourcesSprites?.[resourceId]
		const reason = getCacheBlockReason(game, api, resourceId, sprite, position)
		if (reason) {
			recordFallback(reason)
			return false
		}
		const frameId = getCurrentFrameId(sprite)
		if (frameId === null) {
			recordFallback('missing-frame')
			return false
		}
		const frame = getSpriteFrameInfo(game, sprite, frameId)
		if (!frame) {
			recordFallback('frame-info')
			return false
		}
		const signature = getFrameCacheSignature(sprite, frame)
		let cache = iconCaches.get(signature)
		if (!cache) {
			if (iconCaches.size >= maxCacheEntries) clearIconCaches()
			cache = buildFrameCache(game, sprite, frame)
			if (!cache) {
				recordFallback('cache-build-failed')
				return false
			}
			iconCaches.set(signature, cache)
			stats.misses++
		} else {
			stats.hits++
		}
		try {
			game.ctx.drawImage(cache.canvas, position[0] + cache.offsetX, position[1] + cache.offsetY)
			stats.draws++
			return true
		} finally {
			sprite.scale = .25
		}
	}

	function getCacheBlockReason(game, api, resourceId, sprite, position) {
		if (!isEnabled(api)) return 'disabled'
		if (!game || !game.ctx) return 'missing-render-context'
		if (!Number.isInteger(resourceId) || resourceId < 0) return 'invalid-resource'
		if (!sprite) return 'missing-sprite'
		if (!Array.isArray(position) || !Number.isFinite(Number(position[0])) || !Number.isFinite(Number(position[1]))) return 'invalid-position'
		if (!Number.isFinite(Number(game.unit)) || Number(game.unit) <= 0) return 'invalid-unit'
		if (!Number.isFinite(Number(game.zoom)) || Number(game.zoom) <= 0) return 'invalid-zoom'
		if (!isDrawableImage(sprite.img)) return 'image-not-ready'
		return ''
	}

	function isEnabled(api) {
		if (previewEnabled !== null) return previewEnabled !== false
		return api?.config?.get(configKey, true) !== false
	}

	function buildFrameCache(game, sprite, frame) {
		const width = Math.max(1, Math.ceil(frame.mask[2] * frame.scale))
		const height = Math.max(1, Math.ceil(frame.mask[3] * frame.scale))
		if (width > maxCacheSide || height > maxCacheSide || width * height > maxCachePixels) return null
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		try {
			ctx.imageSmoothingEnabled = game.ctx?.imageSmoothingEnabled
			if (game.ctx?.imageSmoothingQuality) ctx.imageSmoothingQuality = game.ctx.imageSmoothingQuality
		} catch (error) {}
		ctx.drawImage(
			sprite.img,
			frame.mask[0],
			frame.mask[1],
			frame.mask[2],
			frame.mask[3],
			0,
			0,
			width,
			height
		)
		stats.lastCacheSize = { width, height }
		return {
			canvas,
			offsetX: -frame.origin[0] * frame.scale,
			offsetY: -frame.origin[1] * frame.scale
		}
	}

	function getFrameCacheSignature(sprite, frame) {
		return [
			sprite.img?.src || '',
			frame.frameId,
			frame.mask.join(','),
			frame.origin.join(','),
			roundNumber(frame.scale, 5)
		].join('|')
	}

	function getSpriteFrameInfo(game, sprite, frameId) {
		if (!sprite || !game || !Array.isArray(sprite.frames) || !Array.isArray(sprite.origins)) return null
		const mask = sprite.frames[frameId]
		const origin = sprite.origins[frameId]
		if (!Array.isArray(mask) || !Array.isArray(origin)) return null
		const maskWidth = Number(mask[2])
		if (!Number.isFinite(maskWidth) || Math.abs(maskWidth) < 1e-9) return null
		const scale = Number(game.unit) * 1.737 / maskWidth * (.25 / Number(game.zoom))
		if (!Number.isFinite(scale) || scale <= 0) return null
		return { frameId, mask, origin, scale }
	}

	function getCurrentFrameId(sprite) {
		const sequence = sprite?.sequences?.[sprite.currentSequence] || sprite?.sequences?.[0]
		if (!Array.isArray(sequence) || !sequence.length) return null
		const frameIndex = Math.max(0, Math.min(sequence.length - 1, Number(sprite.currentFrame) || 0))
		const frameId = sequence[frameIndex]
		return Number.isInteger(frameId) ? frameId : null
	}

	function clearIconCaches() {
		iconCaches.clear()
		stats.clears++
	}

	function resetStats() {
		stats.draws = 0
		stats.hits = 0
		stats.misses = 0
		stats.fallbacks = 0
		stats.clears = 0
		stats.lastFallback = ''
		stats.lastCacheSize = null
		stats.fallbackReasons = {}
	}

	function recordFallback(reason) {
		stats.fallbacks++
		stats.lastFallback = reason
		incrementCount(stats.fallbackReasons, reason)
	}

	function isDrawableImage(image) {
		if (!image) return false
		if (image.complete === false) return false
		if (image.naturalWidth !== undefined && image.naturalWidth <= 0) return false
		return true
	}

	function incrementCount(target, key) {
		const id = String(key || 'unknown')
		target[id] = (target[id] || 0) + 1
	}

	function roundNumber(value, digits) {
		const number = Number(value)
		if (!Number.isFinite(number)) return ''
		const scale = Math.pow(10, digits)
		return Math.round(number * scale) / scale
	}
})()
