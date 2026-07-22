(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailCubeResourceCacheInstalled'
	const cacheKey = '__cattailCubeResourceRenderCache'
	const apiKey = 'CattailTweaksCubeResourceCache'
	const configKey = 'enableCubeResourceRenderCache'
	const damagedConfigKey = 'enableDamagedCubeResourceRenderCache'
	const visibleResourceSlots = [12, 13, 14, 3, 7, 11, 15, 28, 29, 30, 19, 23, 27, 31, 44, 45, 46, 35, 39, 43, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63]
	const cachePadding = 4
	const maxCacheSide = 1024
	const maxCachePixels = 1024 * 1024

	let previewEnabled = null
	let previewDamagedEnabled = null
	let previewDynamicCameraEnabled = null
	let previewCameraPitch = null
	let previewCameraYaw = null
	let cacheEpoch = 0
	let activeGame = null
	const stats = {
		draws: 0,
		hits: 0,
		fastAttempts: 0,
		fastHits: 0,
		fullChecks: 0,
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
			installConfigPreviewListener(api)
			api.on('afterVanillaScripts', function () {
				installCubeResourceCache(api)
			})
			api.on('afterGameInit', function (payload, game) {
				activeGame = game || activeGame
			})
		}
	})

	function installConfigPreviewListener(api) {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID) return
				if (detail.key === configKey) {
					previewEnabled = detail.value !== false
					clearAllCaches(activeGame)
				}
				if (detail.key === damagedConfigKey) {
					previewDamagedEnabled = detail.value !== false
					clearAllCaches(activeGame)
				}
				if (detail.key === 'enableDynamicCamera') {
					previewDynamicCameraEnabled = detail.value !== false
					clearAllCaches(activeGame)
				}
				if (detail.key === 'cameraPitch') {
					previewCameraPitch = Number(detail.value)
					clearAllCaches(activeGame)
				}
				if (detail.key === 'cameraYaw') {
					previewCameraYaw = Number(detail.value)
					clearAllCaches(activeGame)
				}
			}, true)
		} catch (error) {}
	}

	function installCubeResourceCache(api) {
		if (window[installedKey] || typeof Cube === 'undefined') return
		window[installedKey] = true
		installDebugApi(api)
		api.patch(Cube.prototype, 'drawResources', function (original) {
			return function (...args) {
				const fastResult = tryDrawCachedCubeResources(this, api)
				if (fastResult === true) return
				if (typeof fastResult === 'string') return runOriginalWithFallback(this, original, args, fastResult)
				stats.fullChecks++
				const reason = getCubeResourceCacheBlockReason(this, api)
				if (reason) return runOriginalWithFallback(this, original, args, reason)
				if (buildAndDrawCachedCubeResources(this, api, original)) return
				return runOriginalWithFallback(this, original, args, 'cache-build-failed')
			}
		})
		api.patch(Cube.prototype, 'swapRandomResource', function (original) {
			return function (...args) {
				delete this[cacheKey]
				return original.apply(this, args)
			}
		})
		api.patch(Cube.prototype, 'onmousedown', function (original) {
			return function (...args) {
				delete this[cacheKey]
				return original.apply(this, args)
			}
		})
		api.patch(Cube.prototype, 'onDelete', function (original) {
			return function (...args) {
				delete this[cacheKey]
				return original.apply(this, args)
			}
		})
	}

	function installDebugApi(api) {
		window[apiKey] = {
			stats() {
				const totalCached = stats.hits + stats.misses
				return Object.assign({}, stats, {
					epoch: cacheEpoch,
					activeCachedCubes: countActiveCachedCubes(activeGame),
					fallbackReasons: Object.assign({}, stats.fallbackReasons),
					cacheHitRate: totalCached ? roundNumber(stats.hits / totalCached, 4) : 0,
					fastPathHitRate: stats.fastAttempts ? roundNumber(stats.fastHits / stats.fastAttempts, 4) : 0,
					damagedCacheEnabled: isDamagedCacheEnabled(api)
				})
			},
			clear() {
				resetStats()
				clearAllCaches(activeGame)
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			},
			inspect() {
				return inspectCubes(activeGame, api)
			}
		}
	}

	function getCubeResourceCacheBlockReason(cube, api) {
		const game = cube?.master
		const damaged = isDamagedCube(cube)
		if (!isCacheEnabled(api)) return 'disabled'
		if (!cube) return 'missing-cube'
		if (!isCacheableCubeState(cube)) return 'state-' + String(cube.state)
		if (damaged && !isDamagedCacheEnabled(api)) return 'broken'
		if (!game) return 'missing-game'
		if (game.halt) return 'halted'
		if (game.plane) return 'plane-' + String(game.plane)
		if (!game.ctx || typeof game.uvToXY !== 'function') return 'missing-render-context'
		if (!hasPlainCanvasState(game.ctx)) return 'non-plain-canvas-state'
		if (!Array.isArray(cube.resources) || cube.resources.length < 64) return 'missing-resources'
		if (!Array.isArray(cube.resourceCoordinates) || cube.resourceCoordinates.length < 64) return 'missing-resource-coordinates'
		if (!hasUsableResourceShifts(cube, damaged)) return 'shifted-resources'
		return ''
	}

	function isCacheEnabled(api) {
		if (previewEnabled !== null) return previewEnabled !== false
		return api?.config?.get(configKey, true) !== false
	}

	function isDamagedCacheEnabled(api) {
		if (previewDamagedEnabled !== null) return previewDamagedEnabled !== false
		return api?.config?.get(damagedConfigKey, true) !== false
	}

	function isDamagedCube(cube) {
		return (Number(cube?.broken) || 0) > 0
	}

	function isCacheableCubeState(cube) {
		// State 1 animates only the prism overlay after drawResources; the resource image itself is stable.
		return cube?.state === 1 || cube?.state === 2
	}

	function hasUsableResourceShifts(cube, allowShifted) {
		if (!Array.isArray(cube.resourceShifts3d) || cube.resourceShifts3d.length < 64) return false
		for (let i = 0; i < visibleResourceSlots.length; i++) {
			const shift = cube.resourceShifts3d[visibleResourceSlots[i]]
			if (!Array.isArray(shift)) return false
			const sx = Number(shift[0]) || 0
			const sy = Number(shift[1]) || 0
			const sz = Number(shift[2]) || 0
			if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) return false
			if (!allowShifted && (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9 || Math.abs(sz) > 1e-9)) return false
		}
		return true
	}

	function tryDrawCachedCubeResources(cube, api) {
		// Cache construction already validates the 37 visible slots. Hits only need lifecycle and projection invariants.
		stats.fastAttempts++
		const cache = cube?.[cacheKey]
		if (!cache || cache.epoch !== cacheEpoch) return false
		const game = cube?.master
		const damaged = isDamagedCube(cube)
		if (!isCacheEnabled(api)) return 'disabled'
		if (!cube) return 'missing-cube'
		if (!isCacheableCubeState(cube)) return 'state-' + String(cube.state)
		if (damaged && !isDamagedCacheEnabled(api)) return 'broken'
		if (!game) return 'missing-game'
		if (game.halt) return 'halted'
		if (game.plane) return 'plane-' + String(game.plane)
		if (!game.ctx || typeof game.uvToXY !== 'function') return 'missing-render-context'
		if (!hasPlainCanvasState(game.ctx)) return 'non-plain-canvas-state'
		if (cache.damaged !== damaged) return false
		if (cache.projectionSignature !== getProjectionSignature(game, api)) return false
		if (cache.brokenSignature !== getCubeBrokenSignature(cube)) return false
		activeGame = game
		if (!drawCubeResourceCache(cube, cache)) {
			delete cube[cacheKey]
			return false
		}
		stats.hits++
		stats.fastHits++
		return true
	}

	function buildAndDrawCachedCubeResources(cube, api, originalDrawResources) {
		const game = cube.master
		activeGame = game
		const projectionSignature = getProjectionSignature(game, api)
		const brokenSignature = getCubeBrokenSignature(cube)
		const bounds = getCubeResourceBounds(cube)
		if (!bounds) return false
		const cache = buildCubeResourceCache(cube, bounds, {
			projectionSignature,
			brokenSignature,
			resourceSignature: getCubeResourceSignature(cube),
			spriteSignature: bounds.spriteSignature
		}, originalDrawResources)
		if (!cache) return false
		cube[cacheKey] = cache
		stats.misses++
		return drawCubeResourceCache(cube, cache)
	}

	function drawCubeResourceCache(cube, cache) {
		const game = cube.master
		const anchorXY = game.uvToXY(cache.anchorUv)
		if (!isFinitePoint(anchorXY)) return false
		const jitter = cache.damaged ? getDamagedCubeCacheJitter(cube, cache.jitterBasis) : null
		game.ctx.drawImage(cache.canvas, anchorXY[0] + cache.offsetX + (jitter?.[0] || 0), anchorXY[1] + cache.offsetY + (jitter?.[1] || 0))
		stats.draws++
		return true
	}

	function buildCubeResourceCache(cube, bounds, signature, originalDrawResources) {
		const game = cube.master
		const damaged = isDamagedCube(cube)
		const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + cachePadding * 2))
		const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + cachePadding * 2))
		if (width > maxCacheSide || height > maxCacheSide || width * height > maxCachePixels) return null
		const anchorUv = getCubeCacheAnchorUv(cube)
		if (!anchorUv) return null
		const anchorXY = game.uvToXY(anchorUv)
		if (!isFinitePoint(anchorXY)) return null
		const jitterBasis = damaged ? getCubeCacheJitterBasis(game) : null
		if (damaged && !jitterBasis) return null
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		copyCanvasState(game.ctx, ctx)
		const originX = bounds.minX - cachePadding
		const originY = bounds.minY - cachePadding
		const originalCtx = game.ctx
		const originalUvToXY = game.uvToXY
		game.ctx = ctx
		game.uvToXY = function (uv) {
			const xy = originalUvToXY.call(this, uv)
			return [xy[0] - originX, xy[1] - originY]
		}
		const originalBroken = cube.broken
		try {
			if (damaged) cube.broken = 0
			originalDrawResources.call(cube)
		} finally {
			if (damaged) cube.broken = originalBroken
			game.ctx = originalCtx
			game.uvToXY = originalUvToXY
		}
		stats.lastCacheSize = { width, height }
		return {
			canvas,
			epoch: cacheEpoch,
			projectionSignature: signature.projectionSignature,
			brokenSignature: signature.brokenSignature,
			resourceSignature: signature.resourceSignature,
			spriteSignature: signature.spriteSignature,
			damaged,
			jitterBasis,
			anchorUv,
			offsetX: originX - anchorXY[0],
			offsetY: originY - anchorXY[1]
		}
	}

	function getCubeCacheAnchorUv(cube) {
		if (Array.isArray(cube?.position)) {
			return [Number(cube.position[0]) || 0, Number(cube.position[1]) || 0]
		}
		return getStableCubeResourceUv(cube, visibleResourceSlots[0])
	}

	function copyCanvasState(from, to) {
		if (!from || !to) return
		try { to.imageSmoothingEnabled = from.imageSmoothingEnabled } catch (error) {}
		try {
			if (from.imageSmoothingQuality) to.imageSmoothingQuality = from.imageSmoothingQuality
		} catch (error) {}
	}

	function getCubeResourceBounds(cube) {
		const game = cube.master
		const sprites = game?.resourcesSprites
		if (!Array.isArray(sprites)) return null
		let minX = Infinity
		let minY = Infinity
		let maxX = -Infinity
		let maxY = -Infinity
		const spriteSignatureParts = []
		for (let id = 0; id < visibleResourceSlots.length; id++) {
			const slot = visibleResourceSlots[id]
			const resourceId = cube.resources[slot]
			const sprite = sprites[resourceId]
			const frame = getSpriteFrameInfo(game, sprite)
			if (!frame) return null
			const uv = getStableCubeResourceUv(cube, slot)
			if (!uv) return null
			const xy = game.uvToXY(uv)
			if (!isFinitePoint(xy)) return null
			const x = xy[0] - frame.origin[0] * frame.scale
			const y = xy[1] - frame.origin[1] * frame.scale
			const w = frame.mask[2] * frame.scale
			const h = frame.mask[3] * frame.scale
			minX = Math.min(minX, x)
			minY = Math.min(minY, y)
			maxX = Math.max(maxX, x + w)
			maxY = Math.max(maxY, y + h)
			spriteSignatureParts.push([
				resourceId,
				frame.frameId,
				roundNumber(frame.scale, 4),
				frame.imageSrc
			].join(':'))
		}
		if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
		return {
			minX,
			minY,
			maxX,
			maxY,
			spriteSignature: spriteSignatureParts.join(',')
		}
	}

	function getSpriteFrameInfo(game, sprite) {
		if (!sprite || !isDrawableImage(sprite.img)) return null
		const sequence = sprite.sequences?.[sprite.currentSequence] || sprite.sequences?.[0] || [0]
		const frameId = sequence[sprite.currentFrame] ?? sequence[0] ?? 0
		const mask = sprite.frames?.[frameId]
		const origin = sprite.origins?.[frameId]
		if (!Array.isArray(mask) || !Array.isArray(origin)) return null
		const maskWidth = Number(mask[2])
		if (!Number.isFinite(maskWidth) || Math.abs(maskWidth) < 1e-9) return null
		const spriteScale = Number(sprite.scale)
		const scale = (Number(game.unit) || 0) * 1.737 / maskWidth * (Number.isFinite(spriteScale) ? spriteScale : 1)
		if (!Number.isFinite(scale) || scale <= 0) return null
		return {
			frameId,
			mask,
			origin,
			scale,
			imageSrc: sprite.img?.src || ''
		}
	}

	function isDrawableImage(image) {
		if (!image) return false
		if (image.complete === false) return false
		if (image.naturalWidth !== undefined && image.naturalWidth <= 0) return false
		return true
	}

	function getStableCubeResourceUv(cube, slot) {
		const coord = cube.resourceCoordinates?.[slot]
		const shift = cube.resourceShifts3d?.[slot]
		if (!Array.isArray(coord) || !Array.isArray(shift)) return null
		const zOffset = .125
		return [
			(Number(coord[0]) || 0) + (Number(shift[0]) || 0) - zOffset - (Number(shift[2]) || 0),
			(Number(coord[1]) || 0) + (Number(shift[1]) || 0) - zOffset - (Number(shift[2]) || 0)
		]
	}

	function getCubeCacheSignature(cube, api, bounds) {
		return [
			cacheEpoch,
			getProjectionSignature(cube.master, api),
			getCubeResourceSignature(cube),
			bounds.spriteSignature
		].join('|')
	}

	function getProjectionSignature(game, api) {
		const dynamicEnabled = getDynamicCameraEnabled(api)
		const camera = dynamicEnabled ? getDynamicCameraState(game, api) : null
		return [
			roundNumber(game?.unit, 4),
			roundNumber(game?.zoom, 4),
			roundNumber(game?.pixelRatio, 4),
			dynamicEnabled ? roundNumber(camera?.pitch, 4) : 'vanilla',
			dynamicEnabled ? roundNumber(camera?.yaw, 4) : ''
		].join(':')
	}

	function getDynamicCameraEnabled(api) {
		if (previewDynamicCameraEnabled !== null) return previewDynamicCameraEnabled !== false
		return api?.config?.get('enableDynamicCamera', true) !== false
	}

	function getDynamicCameraState(game, api) {
		const state = game?.__cattailDynamicCameraState || {}
		const savedPitch = previewCameraPitch !== null ? previewCameraPitch : api?.config?.get('cameraPitch', .5)
		const savedYaw = previewCameraYaw !== null ? previewCameraYaw : api?.config?.get('cameraYaw', 0)
		const pitch = Number.isFinite(Number(state.pitch)) ? Number(state.pitch) : Number(savedPitch)
		const yaw = Number.isFinite(Number(state.yaw)) ? Number(state.yaw) : Number(savedYaw) * Math.PI / 180
		return { pitch, yaw }
	}

	function getCubeBrokenSignature(cube) {
		return roundNumber(cube?.broken, 5)
	}

	function getCubeCacheJitterBasis(game) {
		// Vanilla and Dynamic Camera projections are affine, so their translation-free axes preserve the same whole-cache jitter.
		const origin = game.uvToXY([0, 0])
		const u = game.uvToXY([1, 0])
		const v = game.uvToXY([0, 1])
		if (!isFinitePoint(origin) || !isFinitePoint(u) || !isFinitePoint(v)) return null
		return [
			[u[0] - origin[0], u[1] - origin[1]],
			[v[0] - origin[0], v[1] - origin[1]]
		]
	}

	function getDamagedCubeCacheJitter(cube, basis) {
		const amount = Math.max(0, Number(cube?.broken) || 0) * Math.max(0, Number(cube?.shakePower) || 0)
		if (!amount || !Array.isArray(basis)) return [0, 0]
		const dx = (Math.random() * 2 - 1) * amount
		const dy = (Math.random() * 2 - 1) * amount
		const dz = (Math.random() * 2 - 1) * amount
		const du = dx - dz
		const dv = dy - dz
		return [
			du * basis[0][0] + dv * basis[1][0],
			du * basis[0][1] + dv * basis[1][1]
		]
	}
	function getCubeResourceSignature(cube) {
		const parts = []
		for (let i = 0; i < visibleResourceSlots.length; i++) {
			const slot = visibleResourceSlots[i]
			const coord = cube.resourceCoordinates[slot]
			const shift = cube.resourceShifts3d[slot]
			parts.push([
				cube.resources[slot],
				roundNumber(coord?.[0], 4),
				roundNumber(coord?.[1], 4),
				roundNumber(shift?.[0], 5),
				roundNumber(shift?.[1], 5),
				roundNumber(shift?.[2], 5)
			].join(','))
		}
		return parts.join(';')
	}

	function runOriginalWithFallback(cube, original, args, reason) {
		activeGame = cube?.master || activeGame
		stats.fallbacks++
		stats.lastFallback = reason
		incrementCount(stats.fallbackReasons, reason || 'unknown')
		return original.apply(cube, args)
	}

	function resetStats() {
		stats.draws = 0
		stats.hits = 0
		stats.fastAttempts = 0
		stats.fastHits = 0
		stats.fullChecks = 0
		stats.misses = 0
		stats.fallbacks = 0
		stats.clears = 0
		stats.lastFallback = ''
		stats.lastCacheSize = null
		stats.fallbackReasons = {}
	}

	function inspectCubes(game, api) {
		const report = {
			totalCubes: 0,
			visibleCubes: 0,
			cacheableVisibleCubes: 0,
			cachedCubes: 0,
			reasons: {}
		}
		if (!game?.stuff) return report
		for (let i = 0; i < game.stuff.length; i++) {
			const entity = game.stuff[i]
			if (!entity || entity.name !== 'cube') continue
			report.totalCubes++
			let visible = true
			try {
				if (typeof game.isVisible === 'function') visible = game.isVisible(entity) !== false
			} catch (error) {
				visible = false
			}
			if (!visible) continue
			report.visibleCubes++
			const blockedReason = getCubeResourceCacheBlockReason(entity, api)
			const reason = blockedReason || (isDamagedCube(entity) ? 'cacheable-damaged' : 'cacheable')
			incrementCount(report.reasons, reason)
			if (!blockedReason) report.cacheableVisibleCubes++
			if (entity[cacheKey]) report.cachedCubes++
		}
		return report
	}
	function clearAllCaches(game) {
		cacheEpoch++
		stats.clears++
		if (!game?.stuff) return
		for (let i = 0; i < game.stuff.length; i++) {
			if (game.stuff[i]) delete game.stuff[i][cacheKey]
		}
	}

	function countActiveCachedCubes(game) {
		if (!game?.stuff) return 0
		let count = 0
		for (let i = 0; i < game.stuff.length; i++) {
			if (game.stuff[i]?.[cacheKey]) count++
		}
		return count
	}

	function incrementCount(target, key) {
		const id = String(key || 'unknown')
		target[id] = (target[id] || 0) + 1
	}
	function isFinitePoint(value) {
		return Array.isArray(value) && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
	}

	function hasPlainCanvasState(ctx) {
		const alpha = Number(ctx?.globalAlpha)
		if (Number.isFinite(alpha) && Math.abs(alpha - 1) > 1e-6) return false
		const operation = ctx?.globalCompositeOperation || 'source-over'
		if (operation !== 'source-over') return false
		const filter = ctx?.filter || 'none'
		return filter === 'none'
	}

	function roundNumber(value, digits) {
		const number = Number(value)
		if (!Number.isFinite(number)) return ''
		const scale = Math.pow(10, digits)
		return Math.round(number * scale) / scale
	}
})()
