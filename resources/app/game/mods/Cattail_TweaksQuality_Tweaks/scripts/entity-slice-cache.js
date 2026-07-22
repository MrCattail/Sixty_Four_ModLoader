(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailEntitySliceCacheInstalled'
	const apiKey = 'CattailTweaksEntitySliceCache'
	const configKey = 'enableEntitySliceRenderCache'
	const cachePadding = 8
	const minSliceLength = 2
	const maxSliceEntities = 48
	const maxCacheSide = 2048
	const maxCachePixels = 2048 * 2048
	const maxCacheEntries = 96
	const sliceCaches = new Map()
	let previewEnabled = null
	let activeGame = null

	const stats = {
		frames: 0,
		bypassFrames: 0,
		visibleEntities: 0,
		candidateEntities: 0,
		candidateRuns: 0,
		singletonCandidates: 0,
		descriptorFailures: 0,
		originalDraws: 0,
		sliceDraws: 0,
		slicedEntities: 0,
		hits: 0,
		misses: 0,
		fallbacks: 0,
		clears: 0,
		lastFallback: '',
		lastSliceSize: null,
		lastSliceEntities: [],
		fallbackReasons: {},
		blockReasons: {}
	}

	const spritePolicies = {
		mega1: true,
		mega1a: true,
		mega1b: true,
		mega2: true,
		mega3: true,
		eye: true,
		clicker1: true,
		clicker2: true,
		clicker3: true,
		cookie: true,
		flower: true
	}

	const statePolicies = {
		consumer(entity) {
			const maxMultiplicator = Number(entity?.maxMultiplicator) || 1
			const multiplicator = Number(entity?.multiplicator) || 1
			return (multiplicator - 1) / maxMultiplicator
		},
		preheater(entity) {
			return entity?.fill ? entity?.spriteState : 0
		},
		reflector(entity) {
			return entity?.variant
		},
		converter64(entity) {
			return entity?.fill > 0 && entity?.alone ? 1 : 0
		},
		generaldecay(entity) {
			return entity?.capacity > 0 ? 1 : 0
		},
		vessel(entity) {
			return entity?.isUsed ? 1 : 0
		},
		vessel2(entity) {
			return entity?.isUsed ? 1 : 0
		},
		vault(entity) {
			if ((Number(entity?.excitement) || 0) > 0) return null
			return 0
		},
		silo(entity) {
			return getStableDiveState(entity)
		},
		silo2(entity) {
			return getStableDiveState(entity)
		}
	}

	const idleSpritePolicies = {
		converter13: true,
		converter76: true,
		injector: true,
		destabilizer2a: true,
		auxpump2: true
	}

	const idleBackFrontPolicies = {
		auxpump: true,
		valve: true,
		converter32: true,
		destabilizer: true
	}

	const idleStateBackFrontPolicies = {
		entropic: true,
		entropic2: true,
		entropic2a: true
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installEntitySliceCache(api)
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
				clearSliceCaches()
			}, true)
		} catch (error) {}
	}

	function installEntitySliceCache(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		installDebugApi(api)
		api.patch(Game.prototype, 'renderEntities', function (original) {
			return function (dt) {
				activeGame = this || activeGame
				if (!shouldUseSliceCache(this, api)) {
					stats.bypassFrames++
					return original.apply(this, arguments)
				}
				try {
					renderRealityEntitiesWithSlices(this, dt)
					return
				} catch (error) {
					recordFallback('exception')
					try { console.warn('[Cattail Tweaks] Entity slice cache failed; falling back to vanilla renderEntities.', error) } catch (warnError) {}
					return original.apply(this, arguments)
				}
			}
		})
	}

	function installDebugApi(api) {
		window[apiKey] = {
			stats() {
				const totalCached = stats.hits + stats.misses
				const totalEntityDraws = stats.originalDraws + stats.slicedEntities
				const avoidedEntityDraws = Math.max(0, stats.slicedEntities - stats.sliceDraws)
				return Object.assign({}, stats, {
					enabled: isEnabled(api),
					cacheEntries: sliceCaches.size,
					cacheHitRate: totalCached ? roundNumber(stats.hits / totalCached, 4) : 0,
					candidateEntityRate: stats.visibleEntities ? roundNumber(stats.candidateEntities / stats.visibleEntities, 4) : 0,
					slicedEntityRate: totalEntityDraws ? roundNumber(stats.slicedEntities / totalEntityDraws, 4) : 0,
					avoidedEntityDraws,
					avoidedEntityDrawsPerFrame: stats.frames ? roundNumber(avoidedEntityDraws / stats.frames, 3) : 0,
					originalDrawsPerFrame: stats.frames ? roundNumber(stats.originalDraws / stats.frames, 3) : 0,
					sliceDrawsPerFrame: stats.frames ? roundNumber(stats.sliceDraws / stats.frames, 3) : 0,
					avgCandidatesPerRun: stats.candidateRuns ? roundNumber(stats.candidateEntities / stats.candidateRuns, 3) : 0,
					avgSlicedEntitiesPerDraw: stats.sliceDraws ? roundNumber(stats.slicedEntities / stats.sliceDraws, 3) : 0,
					lastSliceEntities: stats.lastSliceEntities.slice(),
					fallbackReasons: Object.assign({}, stats.fallbackReasons),
					blockReasons: Object.assign({}, stats.blockReasons)
				})
			},
			clear() {
				resetStats()
				clearSliceCaches()
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			},
			inspect(game = activeGame) {
				return inspectSlices(game, api)
			},
			snapshot(game = activeGame) {
				const renderTiming = window.ModLoader?.render?.timing
				return {
					sliceStats: this.stats(),
					sliceInspect: this.inspect(game),
					renderTiming: renderTiming?.summary?.() || null,
					renderMethods: renderTiming?.methods?.() || [],
					renderEntities: renderTiming?.entities?.() || [],
					spriteStats: window.CattailTweaksEntitySpriteCache?.stats?.() || null,
					cubeStats: window.CattailTweaksCubeResourceCache?.stats?.() || null,
					cubeInspect: window.CattailTweaksCubeResourceCache?.inspect?.() || null
				}
			}
		}
	}

	function shouldUseSliceCache(game, api) {
		if (!isEnabled(api)) return false
		if (!game || game.halt || game.plane) return false
		if (!Array.isArray(game.stuff) || !game.ctx || typeof game.isVisible !== 'function') return false
		if (typeof game.uvToXY !== 'function') return false
		if (!hasCompatibleCanvasState(game.ctx)) return false
		return true
	}

	function renderRealityEntitiesWithSlices(game, dt) {
		stats.frames++
		let candidates = []
		const flush = function () {
			flushCandidateRun(game, dt, candidates)
			candidates = []
		}
		for (let i = 0; i < game.stuff.length; i++) {
			const entity = game.stuff[i]
			if (!entity || entity.name === 'conductor') continue
			let visible = false
			try { visible = game.isVisible(entity) !== false } catch (error) { visible = false }
			if (!visible) continue
			stats.visibleEntities++
			const candidate = getEntityCandidate(game, entity)
			if (candidate.ok) {
				stats.candidateEntities++
				candidates.push(candidate)
				if (candidates.length >= maxSliceEntities) flush()
				continue
			}
			incrementCount(stats.blockReasons, candidate.reason)
			flush()
			drawOriginalEntity(entity, dt)
		}
		flush()
	}

	function flushCandidateRun(game, dt, candidates) {
		if (!candidates.length) return
		stats.candidateRuns++
		if (candidates.length < minSliceLength) {
			stats.singletonCandidates += candidates.length
			for (let i = 0; i < candidates.length; i++) drawOriginalEntity(candidates[i].entity, dt)
			return
		}
		let descriptors = []
		let bounds = null
		const flushDescriptors = function () {
			flushDescriptorRun(game, dt, descriptors, bounds)
			descriptors = []
			bounds = null
		}
		for (let i = 0; i < candidates.length; i++) {
			const descriptor = finalizeCandidate(game, candidates[i])
			if (!descriptor.ok) {
				stats.descriptorFailures++
				incrementCount(stats.blockReasons, descriptor.reason)
				flushDescriptors()
				drawOriginalEntity(candidates[i].entity, dt)
				continue
			}
			if (descriptors.length && !canExtendBounds(bounds, descriptor.bounds)) flushDescriptors()
			descriptors.push(descriptor)
			bounds = unionBounds(bounds, descriptor.bounds)
		}
		flushDescriptors()
	}

	function flushDescriptorRun(game, dt, descriptors, bounds) {
		if (!descriptors.length) return
		if (descriptors.length < minSliceLength) {
			stats.singletonCandidates += descriptors.length
			for (let i = 0; i < descriptors.length; i++) drawOriginalEntity(descriptors[i].entity, dt)
			return
		}
		if (!drawCachedSlice(game, descriptors, bounds)) {
			for (let i = 0; i < descriptors.length; i++) drawOriginalEntity(descriptors[i].entity, dt)
		}
	}

	function drawOriginalEntity(entity, dt) {
		if (!entity || typeof entity.render !== 'function') return
		entity.render(dt)
		stats.originalDraws++
	}

	function drawCachedSlice(game, descriptors, bounds) {
		const projectionSignature = getProjectionSignature(game)
		const sliceSignature = getSliceSignature(projectionSignature, descriptors)
		let cache = sliceCaches.get(sliceSignature)
		if (!cache) {
			cache = buildSliceCache(game, descriptors, bounds, projectionSignature)
			if (!cache) return false
			if (sliceCaches.size >= maxCacheEntries) clearSliceCaches()
			sliceCaches.set(sliceSignature, cache)
			stats.misses++
		} else {
			stats.hits++
		}
		const anchorXY = game.uvToXY(cache.anchorUv)
		if (!isFinitePoint(anchorXY)) {
			recordFallback('anchor')
			return false
		}
		game.ctx.drawImage(cache.canvas, anchorXY[0] + cache.offsetX, anchorXY[1] + cache.offsetY)
		stats.sliceDraws++
		stats.slicedEntities += cache.entityCount
		stats.lastSliceSize = { width: cache.canvas.width, height: cache.canvas.height }
		stats.lastSliceEntities = cache.names.slice()
		return true
	}

	function buildSliceCache(game, descriptors, bounds, projectionSignature) {
		if (!bounds) return null
		const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + cachePadding * 2))
		const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + cachePadding * 2))
		if (width > maxCacheSide || height > maxCacheSide || width * height > maxCachePixels) {
			recordFallback('slice-too-large')
			return null
		}
		const anchorUv = descriptors[0]?.position
		const anchorXY = game.uvToXY(anchorUv)
		if (!isFinitePoint(anchorXY)) {
			recordFallback('anchor')
			return null
		}
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const ctx = canvas.getContext('2d')
		if (!ctx) {
			recordFallback('missing-cache-context')
			return null
		}
		copyCanvasState(game.ctx, ctx)
		const originX = bounds.minX - cachePadding
		const originY = bounds.minY - cachePadding
		for (let i = 0; i < descriptors.length; i++) drawDescriptorFrame(game, ctx, descriptors[i], originX, originY)
		return {
			canvas,
			projectionSignature,
			anchorUv: [Number(anchorUv[0]) || 0, Number(anchorUv[1]) || 0],
			offsetX: originX - anchorXY[0],
			offsetY: originY - anchorXY[1],
			entityCount: descriptors.length,
			names: descriptors.map(function (entry) { return entry.entity?.name || 'unknown' })
		}
	}

	function drawDescriptorFrame(game, ctx, descriptor, originX, originY) {
		const xy = game.uvToXY(descriptor.position)
		for (let i = 0; i < descriptor.frames.length; i++) {
			const frame = descriptor.frames[i]
			ctx.drawImage(
				descriptor.sprite.img,
				frame.mask[0],
				frame.mask[1],
				frame.mask[2],
				frame.mask[3],
				xy[0] - originX - frame.origin[0] * frame.scale,
				xy[1] - originY - frame.origin[1] * frame.scale,
				frame.mask[2] * frame.scale,
				frame.mask[3] * frame.scale
			)
		}
	}

	function getEntityCandidate(game, entity) {
		if (!entity) return block('missing-entity')
		if (entity.name === 'conductor') return block('conductor')
		if (!Array.isArray(entity.position)) return block('missing-position')
		const sprite = entity.sprite
		if (!sprite) return block('missing-sprite')
		if (hasSpriteRenderPatchConflict(game, sprite)) return block('sprite-render-patched')
		if (!isDrawableImage(sprite.img)) return block('image-not-ready')
		let frameId = null
		let parts = null
		let stateSignature = ''
		const name = String(entity.name || '')
		if (spritePolicies[name]) {
			if (!isSingleFrameSprite(sprite)) return block('animated-sprite')
			frameId = getCurrentFrameId(sprite)
			parts = [{ frameId, back: false }]
			stateSignature = 'sprite'
		} else if (idleSpritePolicies[name]) {
			if (!isIdleSingleFrameEntity(entity, sprite)) return block('active-' + name)
			frameId = getCurrentFrameId(sprite)
			parts = [{ frameId, back: false }]
			stateSignature = 'idle-sprite'
		} else if (idleBackFrontPolicies[name]) {
			if (!isIdleSingleFrameEntity(entity, sprite)) return block('active-' + name)
			frameId = getCurrentFrameId(sprite)
			if (!hasBackFrame(sprite, frameId)) return block('missing-backframe')
			parts = [{ frameId, back: true }, { frameId, back: false }]
			stateSignature = 'idle-back-front'
		} else if (idleStateBackFrontPolicies[name]) {
			if (!isIdleRenderStateEntity(entity, sprite)) return block('active-' + name)
			frameId = getRenderStateFrameId(sprite, 0)
			if (!hasBackFrame(sprite, frameId)) return block('missing-backframe')
			parts = [{ frameId, back: true }, { frameId, back: false }]
			stateSignature = 'idle-state-back-front'
		} else if (statePolicies[name]) {
			const value = statePolicies[name](entity)
			if (value === null || value === undefined || value === false || !Number.isFinite(Number(value))) return block('state-changing-' + name)
			frameId = getRenderStateFrameId(sprite, value)
			parts = [{ frameId, back: false }]
			stateSignature = 'state:' + roundNumber(value, 5)
		} else {
			return block('not-whitelisted')
		}
		if (!Array.isArray(parts) || !parts.length) return block('missing-frame')
		for (let i = 0; i < parts.length; i++) {
			if (parts[i].frameId === null || parts[i].frameId === undefined) return block('missing-frame')
		}
		return {
			ok: true,
			entity,
			sprite,
			position: [Number(entity.position[0]) || 0, Number(entity.position[1]) || 0],
			parts,
			stateSignature
		}
	}

	function finalizeCandidate(game, candidate) {
		const frames = []
		let bounds = null
		for (let i = 0; i < candidate.parts.length; i++) {
			const part = candidate.parts[i]
			const frame = getSpriteFrameInfo(game, candidate.sprite, part.frameId, part.back)
			if (!frame) return block(part.back ? 'back-frame-info' : 'frame-info')
			const frameBounds = getFrameBounds(game, candidate.position, frame)
			if (!frameBounds) return block('bounds')
			frames.push(frame)
			bounds = unionBounds(bounds, frameBounds)
		}
		return {
			ok: true,
			entity: candidate.entity,
			sprite: candidate.sprite,
			position: candidate.position,
			frames,
			bounds,
			signature: getEntitySignature(candidate.entity, candidate.sprite, frames, candidate.position, candidate.stateSignature)
		}
	}

	function getEntityDescriptor(game, entity) {
		const candidate = getEntityCandidate(game, entity)
		return candidate.ok ? finalizeCandidate(game, candidate) : candidate
	}

	function block(reason) {
		return { ok: false, reason: reason || 'unknown' }
	}

	function isIdleSingleFrameEntity(entity, sprite) {
		if (!isIdleEntityState(entity, sprite)) return false
		return isSingleFrameSprite(sprite)
	}

	function isIdleRenderStateEntity(entity, sprite) {
		if (!isIdleEntityState(entity, sprite)) return false
		const sequence = getCurrentSequence(sprite)
		return Array.isArray(sequence) && sequence.length > 0
	}

	function isIdleEntityState(entity, sprite) {
		if ((Number(entity?.fill) || 0) > 0) return false
		if ((Number(entity?.conversion) || 0) > 0) return false
		if ((Number(entity?.state) || 0) === 2) return false
		if ((Number(sprite?.currentSequence) || 0) !== 0) return false
		return true
	}

	function getStableDiveState(entity) {
		const dive = Number(entity?.dive) || 0
		if (Math.abs(dive) < 1e-5) return 0
		if (Math.abs(dive - 1) < 1e-5) return 1
		return null
	}

	function isSingleFrameSprite(sprite) {
		const sequence = getCurrentSequence(sprite)
		return Array.isArray(sequence) && sequence.length === 1
	}

	function getCurrentSequence(sprite) {
		return sprite?.sequences?.[sprite.currentSequence] || sprite?.sequences?.[0]
	}

	function getCurrentFrameId(sprite) {
		const sequence = getCurrentSequence(sprite)
		if (!Array.isArray(sequence) || !sequence.length) return null
		const frameIndex = Math.max(0, Math.min(sequence.length - 1, Number(sprite.currentFrame) || 0))
		const frameId = sequence[frameIndex]
		return Number.isInteger(frameId) ? frameId : null
	}

	function hasBackFrame(sprite, frameId) {
		return Array.isArray(sprite?.backframes?.[frameId])
	}

	function getRenderStateFrameId(sprite, value) {
		const sequence = getCurrentSequence(sprite)
		if (!Array.isArray(sequence) || !sequence.length) return null
		const f = Math.max(0, Math.min(1, Number(value) || 0))
		const frameIndex = Math.min(Math.floor(sequence.length * f), sequence.length - 1)
		const frameId = sequence[frameIndex]
		return Number.isInteger(frameId) ? frameId : null
	}

	function getSpriteFrameInfo(game, sprite, frameId, back = false) {
		if (!sprite || !game || !Array.isArray(sprite.frames) || !Array.isArray(sprite.origins)) return null
		const masks = back ? sprite.backframes : sprite.frames
		if (!Array.isArray(masks)) return null
		const mask = masks[frameId]
		const origin = sprite.origins[frameId]
		if (!Array.isArray(mask) || !Array.isArray(origin)) return null
		const maskWidth = Number(mask[2])
		if (!Number.isFinite(maskWidth) || Math.abs(maskWidth) < 1e-9) return null
		const spriteScale = Number(sprite.scale)
		const scale = (Number(game.unit) || 0) * 1.737 / maskWidth * (Number.isFinite(spriteScale) ? spriteScale : 1)
		if (!Number.isFinite(scale) || scale <= 0) return null
		return { frameId, mask, origin, scale, back: !!back }
	}

	function getFrameBounds(game, position, frame) {
		const xy = game.uvToXY(position)
		if (!isFinitePoint(xy)) return null
		const x = xy[0] - frame.origin[0] * frame.scale
		const y = xy[1] - frame.origin[1] * frame.scale
		const width = frame.mask[2] * frame.scale
		const height = frame.mask[3] * frame.scale
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null
		return {
			minX: x,
			minY: y,
			maxX: x + width,
			maxY: y + height
		}
	}

	function canExtendBounds(current, next) {
		const bounds = unionBounds(current, next)
		if (!bounds) return true
		const width = bounds.maxX - bounds.minX + cachePadding * 2
		const height = bounds.maxY - bounds.minY + cachePadding * 2
		return width <= maxCacheSide && height <= maxCacheSide && width * height <= maxCachePixels
	}

	function unionBounds(a, b) {
		if (!a) return b ? Object.assign({}, b) : null
		if (!b) return Object.assign({}, a)
		return {
			minX: Math.min(a.minX, b.minX),
			minY: Math.min(a.minY, b.minY),
			maxX: Math.max(a.maxX, b.maxX),
			maxY: Math.max(a.maxY, b.maxY)
		}
	}

	function getSliceSignature(projectionSignature, descriptors) {
		return projectionSignature + '|' + descriptors.map(function (entry) { return entry.signature }).join('||')
	}

	function getEntitySignature(entity, sprite, frames, position, stateSignature) {
		const frameSignature = frames.map(function (frame) {
			return [
				frame.back ? 'back' : 'front',
				frame.frameId,
				frame.mask.join(','),
				frame.origin.join(','),
				roundNumber(frame.scale, 5)
			].join('@')
		}).join(';')
		return [
			entity?.name || '',
			roundNumber(position[0], 4) + ',' + roundNumber(position[1], 4),
			stateSignature,
			sprite.img?.src || '',
			frameSignature
		].join(':')
	}

	function getProjectionSignature(game) {
		const camera = game?.__cattailDynamicCameraState || {}
		return [
			roundNumber(game?.unit, 4),
			roundNumber(game?.zoom, 4),
			roundNumber(game?.pixelRatio, 4),
			roundNumber(camera.pitch, 4),
			roundNumber(camera.yaw, 4)
		].join(':')
	}

	function inspectSlices(game, api) {
		const report = {
			enabled: isEnabled(api),
			cacheEntries: sliceCaches.size,
			totalEntities: 0,
			visibleEntities: 0,
			candidateVisibleEntities: 0,
			sliceCandidates: 0,
			maxSliceLength: 0,
			reasons: {},
			slices: []
		}
		if (!game?.stuff || typeof game.isVisible !== 'function') return report
		let candidates = []
		const closeRun = function () {
			inspectCandidateRun(game, candidates, report)
			candidates = []
		}
		for (let i = 0; i < game.stuff.length; i++) {
			const entity = game.stuff[i]
			if (!entity || entity.name === 'conductor') continue
			report.totalEntities++
			let visible = false
			try { visible = game.isVisible(entity) !== false } catch (error) { visible = false }
			if (!visible) continue
			report.visibleEntities++
			const candidate = getEntityCandidate(game, entity)
			if (candidate.ok) {
				report.candidateVisibleEntities++
				candidates.push(candidate)
				if (candidates.length >= maxSliceEntities) closeRun()
			} else {
				incrementCount(report.reasons, candidate.reason)
				closeRun()
			}
		}
		closeRun()
		report.slices = report.slices.slice(0, 20)
		return report
	}

	function inspectCandidateRun(game, candidates, report) {
		if (candidates.length < minSliceLength) return
		let descriptors = []
		let bounds = null
		const closeDescriptors = function () {
			if (descriptors.length >= minSliceLength) {
				report.sliceCandidates++
				report.maxSliceLength = Math.max(report.maxSliceLength, descriptors.length)
				report.slices.push({
					length: descriptors.length,
					names: descriptors.map(function (entry) { return entry.entity?.name || 'unknown' }),
					width: bounds ? Math.round(bounds.maxX - bounds.minX + cachePadding * 2) : 0,
					height: bounds ? Math.round(bounds.maxY - bounds.minY + cachePadding * 2) : 0
				})
			}
			descriptors = []
			bounds = null
		}
		for (let i = 0; i < candidates.length; i++) {
			const descriptor = finalizeCandidate(game, candidates[i])
			if (!descriptor.ok) {
				incrementCount(report.reasons, descriptor.reason)
				closeDescriptors()
				continue
			}
			if (descriptors.length && !canExtendBounds(bounds, descriptor.bounds)) closeDescriptors()
			descriptors.push(descriptor)
			bounds = unionBounds(bounds, descriptor.bounds)
		}
		closeDescriptors()
	}

	function isEnabled(api) {
		if (previewEnabled !== null) return previewEnabled !== false
		return api?.config?.get(configKey, true) !== false
	}

	function clearSliceCaches() {
		sliceCaches.clear()
		stats.clears++
	}

	function resetStats() {
		stats.frames = 0
		stats.bypassFrames = 0
		stats.visibleEntities = 0
		stats.candidateEntities = 0
		stats.candidateRuns = 0
		stats.singletonCandidates = 0
		stats.descriptorFailures = 0
		stats.originalDraws = 0
		stats.sliceDraws = 0
		stats.slicedEntities = 0
		stats.hits = 0
		stats.misses = 0
		stats.fallbacks = 0
		stats.clears = 0
		stats.lastFallback = ''
		stats.lastSliceSize = null
		stats.lastSliceEntities = []
		stats.fallbackReasons = {}
		stats.blockReasons = {}
	}

	function recordFallback(reason) {
		stats.fallbacks++
		stats.lastFallback = reason
		incrementCount(stats.fallbackReasons, reason)
	}

	function copyCanvasState(from, to) {
		if (!from || !to) return
		try { to.imageSmoothingEnabled = from.imageSmoothingEnabled } catch (error) {}
		try {
			if (from.imageSmoothingQuality) to.imageSmoothingQuality = from.imageSmoothingQuality
		} catch (error) {}
	}

	function hasCompatibleCanvasState(ctx) {
		const alpha = Number(ctx?.globalAlpha)
		if (Number.isFinite(alpha) && Math.abs(alpha - 1) > 1e-6) return false
		const operation = ctx?.globalCompositeOperation || 'source-over'
		if (operation !== 'source-over') return false
		const filter = ctx?.filter || 'none'
		if (filter !== 'none') return false
		try {
			if (typeof ctx.getTransform === 'function') {
				const t = ctx.getTransform()
				if (t && (Math.abs(t.a - 1) > 1e-6 || Math.abs(t.b) > 1e-6 || Math.abs(t.c) > 1e-6 || Math.abs(t.d - 1) > 1e-6)) return false
			}
		} catch (error) {}
		return true
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
