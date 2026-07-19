(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailEntitySpriteCacheInstalled'
	const apiKey = 'CattailTweaksEntitySpriteCache'
	const configKey = 'enableEntitySpriteRenderCache'
	const maxCacheSide = 2048
	const maxCachePixels = 2048 * 2048
	const frameCaches = new Map()
	let previewEnabled = null
	let activeGame = null

	const stats = {
		draws: 0,
		destabilizer2aRenders: 0,
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
				installEntitySpriteCache(api)
			})
			api.on('afterGameInit', function (payload, game) {
				activeGame = game || activeGame
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID || detail.key !== configKey) return
				previewEnabled = detail.value !== false
				clearFrameCaches()
			}, true)
		} catch (error) {}
	}

	function installEntitySpriteCache(api) {
		if (window[installedKey] || typeof Sprite === 'undefined') return
		window[installedKey] = true
		installDebugApi(api)
		if (typeof Consumer !== 'undefined') {
			api.patch(Consumer.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (drawCachedConsumer(this, api, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'consumer')
				}
			})
		}
		if (typeof Silo !== 'undefined') {
			api.patch(Silo.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (this?.name !== 'silo2') return original.apply(this, arguments)
					if (drawCachedSilo2(this, api, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'silo2')
				}
			})
		}
		if (typeof Preheater !== 'undefined') {
			api.patch(Preheater.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (drawCachedPreheater(this, api, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'preheater')
				}
			})
		}
		if (typeof Doublechannel !== 'undefined') {
			api.patch(Doublechannel.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (this?.name !== 'doublechannel') return original.apply(this, arguments)
					if (drawCachedAnimatedSpriteEntity(this, api, dt, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'doublechannel')
				}
			})
		}
		if (typeof Destabilizer2a !== 'undefined') {
			api.patch(Destabilizer2a.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (drawCachedDestabilizer2a(this, api, dt, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'destabilizer2a')
				}
			})
		}
		if (typeof Mega3 !== 'undefined') {
			api.patch(Mega3.prototype, 'render', function (original) {
				return function (dt, vposition) {
					if (drawCachedSpriteEntity(this, api, vposition)) return
					return runOriginalWithFallback(this, original, arguments, 'mega3')
				}
			})
		}
	}

	function installDebugApi(api) {
		window[apiKey] = {
			stats() {
				const totalCached = stats.hits + stats.misses
				return Object.assign({}, stats, {
					enabled: isEnabled(api),
					cacheEntries: frameCaches.size,
					fallbackReasons: Object.assign({}, stats.fallbackReasons),
					cacheHitRate: totalCached ? roundNumber(stats.hits / totalCached, 4) : 0
				})
			},
			clear() {
				resetStats()
				clearFrameCaches()
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			}
		}
	}

	function drawCachedConsumer(entity, api, vposition) {
		const maxMultiplicator = Number(entity?.maxMultiplicator) || 1
		const multiplicator = Number(entity?.multiplicator) || 1
		return drawCachedRenderStateEntity(entity, api, (multiplicator - 1) / maxMultiplicator, vposition)
	}

	function drawCachedSilo2(entity, api, vposition) {
		return drawCachedRenderStateEntity(entity, api, entity?.dive, vposition)
	}

	function drawCachedPreheater(entity, api, vposition) {
		return drawCachedRenderStateEntity(entity, api, entity?.fill ? entity?.spriteState : 0, vposition)
	}

	function drawCachedRenderStateEntity(entity, api, value, vposition) {
		const sprite = entity?.sprite
		const frameId = getRenderStateFrameId(sprite, value)
		if (frameId === null) {
			recordFallback('missing-frame')
			return false
		}
		return drawCachedSpriteFrame(entity, sprite, api, vposition || entity.position, frameId)
	}

	function drawCachedAnimatedSpriteEntity(entity, api, dt, vposition) {
		const sprite = entity?.sprite
		if (!sprite || typeof sprite.update !== 'function') {
			recordFallback('missing-update')
			return false
		}
		const position = vposition || entity.position
		const currentFrameId = getCurrentFrameId(sprite)
		const reason = getCacheBlockReason(entity, sprite, api, position, currentFrameId)
		if (reason) {
			recordFallback(reason)
			return false
		}
		sprite.update(dt)
		const frameId = getCurrentFrameId(sprite)
		if (frameId === null) {
			recordFallback('missing-frame-after-update')
			return false
		}
		if (drawCachedSpriteFrame(entity, sprite, api, position, frameId)) return true
		return drawSpriteFrameWithoutAdvance(sprite, position)
	}

	function drawCachedDestabilizer2a(entity, api, dt, vposition) {
		const position = vposition || entity?.position
		if (!drawCachedAnimatedSpriteEntity(entity, api, dt, position)) return false
		drawDestabilizer2aResource(entity, position)
		stats.destabilizer2aRenders++
		return true
	}

	function drawDestabilizer2aResource(entity, position) {
		if (!entity?.fill) return
		const game = entity.master
		const screen = game.uvToXY([position[0] - .25, position[1] - .48])
		const scale = .2 + entity.fill * .8
		game.ctx.save()
		try {
			game.ctx.translate(
				screen[0] + (Math.random() * 2 - 1) * game.unit * .01 + game.translation[0] * scale * game.zoom,
				screen[1] + (Math.random() * 2 - 1) * game.unit * .01 + game.translation[1] * scale * game.zoom
			)
			game.ctx.scale(scale, scale)
			game.resourcesSprites[4].render([0, 0])
		} finally {
			game.ctx.restore()
		}
	}

	function drawCachedSpriteEntity(entity, api, vposition) {
		const sprite = entity?.sprite
		const frameId = getCurrentFrameId(sprite)
		if (frameId === null) {
			recordFallback('missing-frame')
			return false
		}
		return drawCachedSpriteFrame(entity, sprite, api, vposition || entity.position, frameId)
	}

	function drawCachedSpriteFrame(entity, sprite, api, position, frameId) {
		const game = entity?.master
		activeGame = game || activeGame
		const reason = getCacheBlockReason(entity, sprite, api, position, frameId)
		if (reason) {
			recordFallback(reason)
			return false
		}
		const frame = getSpriteFrameInfo(game, sprite, frameId)
		if (!frame) {
			recordFallback('frame-info')
			return false
		}
		const signature = getFrameCacheSignature(game, sprite, frame)
		let cache = frameCaches.get(signature)
		if (!cache) {
			cache = buildFrameCache(sprite, frame)
			if (!cache) {
				recordFallback('cache-build-failed')
				return false
			}
			frameCaches.set(signature, cache)
			stats.misses++
		} else {
			stats.hits++
		}
		const xy = game.uvToXY(position)
		if (!isFinitePoint(xy)) {
			recordFallback('position')
			return false
		}
		game.ctx.drawImage(cache.canvas, xy[0] + cache.offsetX, xy[1] + cache.offsetY)
		stats.draws++
		return true
	}

	function getCacheBlockReason(entity, sprite, api, position, frameId) {
		const game = entity?.master
		if (!isEnabled(api)) return 'disabled'
		if (!entity || !sprite) return 'missing-entity-or-sprite'
		if (hasSpriteRenderPatchConflict(game, sprite)) return 'sprite-render-patched'
		if (!game || game.halt || game.plane) return 'inactive-game'
		if (!game.ctx || typeof game.uvToXY !== 'function') return 'missing-render-context'
		if (!hasPlainCanvasState(game.ctx)) return 'non-plain-canvas-state'
		if (!Array.isArray(position)) return 'missing-position'
		if (frameId === null || frameId === undefined) return 'missing-frame'
		if (!isDrawableImage(sprite.img)) return 'image-not-ready'
		return ''
	}

	function isEnabled(api) {
		if (previewEnabled !== null) return previewEnabled !== false
		return api?.config?.get(configKey, true) !== false
	}

	function buildFrameCache(sprite, frame) {
		const width = Math.max(1, Math.ceil(frame.mask[2] * frame.scale))
		const height = Math.max(1, Math.ceil(frame.mask[3] * frame.scale))
		if (width > maxCacheSide || height > maxCacheSide || width * height > maxCachePixels) return null
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		try {
			ctx.imageSmoothingEnabled = sprite.master?.ctx?.imageSmoothingEnabled
			if (sprite.master?.ctx?.imageSmoothingQuality) ctx.imageSmoothingQuality = sprite.master.ctx.imageSmoothingQuality
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

	function getFrameCacheSignature(game, sprite, frame) {
		return [
			sprite.img?.src || '',
			frame.frameId,
			frame.mask.join(','),
			frame.origin.join(','),
			roundNumber(frame.scale, 5),
			roundNumber(game?.unit, 5)
		].join('|')
	}

	function getSpriteFrameInfo(game, sprite, frameId) {
		if (!sprite || !game || !Array.isArray(sprite.frames) || !Array.isArray(sprite.origins)) return null
		const mask = sprite.frames[frameId]
		const origin = sprite.origins[frameId]
		if (!Array.isArray(mask) || !Array.isArray(origin)) return null
		const maskWidth = Number(mask[2])
		if (!Number.isFinite(maskWidth) || Math.abs(maskWidth) < 1e-9) return null
		const spriteScale = Number(sprite.scale)
		const scale = (Number(game.unit) || 0) * 1.737 / maskWidth * (Number.isFinite(spriteScale) ? spriteScale : 1)
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

	function getRenderStateFrameId(sprite, value) {
		const sequence = sprite?.sequences?.[sprite.currentSequence] || sprite?.sequences?.[0]
		if (!Array.isArray(sequence) || !sequence.length) return null
		const f = Math.max(0, Math.min(1, Number(value) || 0))
		const frameIndex = Math.min(Math.floor(sequence.length * f), sequence.length - 1)
		const frameId = sequence[frameIndex]
		return Number.isInteger(frameId) ? frameId : null
	}

	function runOriginalWithFallback(entity, original, args, reason) {
		activeGame = entity?.master || activeGame
		return original.apply(entity, args)
	}

	function drawSpriteFrameWithoutAdvance(sprite, position) {
		if (!sprite || typeof sprite.render !== 'function') return false
		try {
			sprite.render(position, 0)
			return true
		} catch (error) {
			recordFallback('direct-render-failed')
			return false
		}
	}

	function recordFallback(reason) {
		stats.fallbacks++
		stats.lastFallback = reason
		incrementCount(stats.fallbackReasons, reason)
	}

	function clearFrameCaches() {
		frameCaches.clear()
		stats.clears++
	}

	function resetStats() {
		stats.draws = 0
		stats.destabilizer2aRenders = 0
		stats.hits = 0
		stats.misses = 0
		stats.fallbacks = 0
		stats.clears = 0
		stats.lastFallback = ''
		stats.lastCacheSize = null
		stats.fallbackReasons = {}
	}

	function hasSpriteRenderPatchConflict(game, sprite) {
		if (!sprite || sprite.__cattailSpriteCleanupSource === undefined) return false
		if (game?.__cattailAccessibilityFloorOverrideEnabled === false) return false
		try {
			if (typeof window !== 'undefined' && window.cattailAccessibilityFloorOverrideEnabled === false) return false
		} catch (error) {}
		return true
	}
	function isDrawableImage(image) {
		if (!image) return false
		if (image.complete === false) return false
		if (image.naturalWidth !== undefined && image.naturalWidth <= 0) return false
		return true
	}

	function hasPlainCanvasState(ctx) {
		const alpha = Number(ctx?.globalAlpha)
		if (Number.isFinite(alpha) && Math.abs(alpha - 1) > 1e-6) return false
		const operation = ctx?.globalCompositeOperation || 'source-over'
		if (operation !== 'source-over') return false
		const filter = ctx?.filter || 'none'
		return filter === 'none'
	}

	function isFinitePoint(value) {
		return Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
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
