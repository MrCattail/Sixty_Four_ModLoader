(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailChasmTransferPathIndexInstalled'
	const indexKey = '__cattailChasmTransferPathIndex'
	const apiKey = 'CattailTweaksChasmTransferPathIndex'
	const configKey = 'enableChasmTransferPathIndex'
	let previewEnabled = null
	let configuredEnabled = true
	let directRenderEnabled = true
	let activeGame = null

	const stats = {
		lookups: 0,
		indexedLookups: 0,
		indexBuilds: 0,
		indexClears: 0,
		fallbacks: 0,
		linearSegmentChecks: 0,
		binarySearchSteps: 0,
		totalIndexedSegments: 0,
		maxIndexedSegments: 0,
		directRenderCalls: 0,
		directRenderFallbacks: 0,
		directSamples: 0,
		directBinarySearchSteps: 0,
		directRenderFallbackReasons: {},
		fallbackReasons: {}
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installChasmTransferPathIndex(api)
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
			}, true)
		} catch (error) {}
	}

	function installChasmTransferPathIndex(api) {
		if (window[installedKey] || typeof ChasmTransfer === 'undefined') return
		const prototype = ChasmTransfer.prototype
		if (!prototype || typeof prototype.getPointAtLength !== 'function') return
		configuredEnabled = api?.config?.get(configKey, true) !== false
		window[installedKey] = true
		installDebugApi(api)
		api.patch(prototype, 'getPointAtLength', function (original) {
			return function (length) {
				stats.lookups++
				if (!isEnabled(api)) return original.apply(this, arguments)
				const numericLength = Number(length)
				if (!Number.isFinite(numericLength)) return runOriginalWithFallback(this, original, arguments, 'invalid-length')
				const index = getOrBuildPathIndex(this)
				if (!index) return runOriginalWithFallback(this, original, arguments, 'invalid-path')
				const point = getIndexedPointAtLength(this, index, numericLength)
				if (!point) return runOriginalWithFallback(this, original, arguments, 'lookup-failed')
				return point
			}
		})
		if (typeof prototype.render === 'function') {
			api.patch(prototype, 'render', function (original) {
				return function () {
					if (isEnabled(api) && directRenderEnabled) {
						const fallbackReason = renderIndexedTransfer(this)
						if (!fallbackReason) {
							stats.directRenderCalls++
							return
						}
						recordDirectRenderFallback(fallbackReason)
					}
					return original.apply(this, arguments)
				}
			})
		}
	}

	function installDebugApi(api) {
		window[apiKey] = {
			stats() {
				const avoidedSegmentChecks = Math.max(0, stats.linearSegmentChecks - stats.binarySearchSteps)
				return Object.assign({}, stats, {
					enabled: isEnabled(api),
					directRenderEnabled,
					hitRate: stats.lookups ? roundNumber(stats.indexedLookups / stats.lookups, 4) : 0,
					avgIndexedSegments: stats.indexBuilds ? roundNumber(stats.totalIndexedSegments / stats.indexBuilds, 3) : 0,
					avgLinearSegmentChecks: stats.indexedLookups ? roundNumber(stats.linearSegmentChecks / stats.indexedLookups, 3) : 0,
					avgBinarySearchSteps: stats.indexedLookups ? roundNumber(stats.binarySearchSteps / stats.indexedLookups, 3) : 0,
					avoidedSegmentChecks,
					directRenderFallbackReasons: Object.assign({}, stats.directRenderFallbackReasons),
					fallbackReasons: Object.assign({}, stats.fallbackReasons)
				})
			},
			setDirectRenderEnabled(enabled) {
				directRenderEnabled = enabled !== false
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			},
			clear(game = activeGame) {
				resetStats()
				stats.indexClears = clearActiveIndexes(game)
				return this.stats()
			},
			inspect(game = activeGame) {
				return inspectActiveTransfers(game)
			}
		}
	}

	function isEnabled() {
		if (previewEnabled !== null) return previewEnabled !== false
		return configuredEnabled
	}

	function getOrBuildPathIndex(effect) {
		const current = effect?.[indexKey]
		// ChasmTransfer paths are immutable for the effect's short lifetime.
		if (current) return current
		const index = buildPathIndex(effect)
		if (!index) return null
		effect[indexKey] = index
		stats.indexBuilds++
		stats.totalIndexedSegments += index.segments.length
		stats.maxIndexedSegments = Math.max(stats.maxIndexedSegments, index.segments.length)
		return index
	}

	function buildPathIndex(effect) {
		const path = effect?.path
		const pathLengths = effect?.pathLengths
		const totalPathLength = Number(effect?.totalPathLength)
		if (!Array.isArray(path) || path.length < 2) return null
		if (!Array.isArray(pathLengths) || pathLengths.length < path.length - 1) return null
		if (!Number.isFinite(totalPathLength) || totalPathLength < 0) return null
		const segments = []
		let cursor = 0
		for (let pathIndex = 0; pathIndex < path.length - 1; pathIndex++) {
			const segmentLength = Number(pathLengths[pathIndex])
			if (!Number.isFinite(segmentLength) || segmentLength < 0) return null
			if (effect.skipIndex !== undefined && effect.skipIndex === pathIndex) continue
			if (segmentLength <= 0) continue
			const p1 = path[pathIndex]
			const p2 = path[pathIndex + 1]
			if (!isFinitePoint(p1) || !isFinitePoint(p2)) return null
			segments.push({
				pathIndex,
				start: cursor,
				end: cursor + segmentLength,
				length: segmentLength
			})
			cursor += segmentLength
		}
		const tolerance = Math.max(1e-9, Math.abs(totalPathLength) * 1e-9)
		if (Math.abs(cursor - totalPathLength) > tolerance) return null
		return {
			path,
			totalPathLength,
			segments,
			samples: new Float64Array(18)
		}
	}

	function renderIndexedTransfer(effect) {
		const master = effect?.master
		const path = effect?.path
		const visibility = effect?.visibility
		if (!master || !visibility || !Array.isArray(path)) return 'missing-render-data'
		if (!visibility[master.plane] || path.length < 2) return ''
		const resources = effect.resources
		const ctx = master.ctx
		const codexResources = master.codex?.resources
		const translation = master.translation
		if (!Array.isArray(resources) || !ctx || !codexResources || !Array.isArray(translation)) return 'missing-render-context'
		if (typeof ctx.beginPath !== 'function' || typeof ctx.lineTo !== 'function' || typeof ctx.stroke !== 'function') return 'unsupported-render-context'
		const time = effect.time
		const maxEndTime = effect.maxEndTime
		const unit = master.unit
		const zoom = master.zoom
		const w2 = master.w2
		const h2 = master.h2
		if (![time, maxEndTime, unit, zoom, w2, h2, translation[0], translation[1]].every(Number.isFinite) || maxEndTime === 0) return 'invalid-render-numbers'
		for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex++) {
			if (!resources[resourceIndex]) continue
			if (!Array.isArray(codexResources[resourceIndex]?.triplet)) return 'missing-resource-color'
		}
		const index = getOrBuildPathIndex(effect)
		if (!index) return 'invalid-path'

		const beauty = 8
		const step = .9 / beauty
		const threshold = 2
		const start = time / maxEndTime * index.totalPathLength
		const translationX = translation[0]
		const translationY = translation[1]
		const samples = index.samples
		for (let sampleIndex = 0; sampleIndex <= beauty; sampleIndex++) {
			const length = start - sampleIndex * step
			if (!writeIndexedPoint(index, length, samples, sampleIndex * 2)) return 'sample-failed'
		}
		ctx.lineWidth = unit * .02
		for (let resourceIndex = 0; resourceIndex < resources.length; resourceIndex++) {
			if (!resources[resourceIndex]) continue
			const deviation = (resourceIndex - 2.6) * unit * .03
			ctx.strokeStyle = codexResources[resourceIndex].triplet[0]
			ctx.beginPath()
			let hasLast = false
			let lastU = 0
			let lastV = 0
			for (let sampleIndex = 0; sampleIndex <= beauty; sampleIndex++) {
				const sampleOffset = sampleIndex * 2
				const u = samples[sampleOffset]
				const v = samples[sampleOffset + 1]
				if (hasLast && Math.max(Math.abs(u - lastU), Math.abs(v - lastV)) > threshold) {
					ctx.stroke()
					ctx.beginPath()
				}
				hasLast = true
				lastU = u
				lastV = v
				const x = (u * .866 - v * .866) * unit - translationX * zoom + w2
				const y = (u * .5 + v * .5) * unit - translationY * zoom + h2 - deviation
				ctx.lineTo(x, y)
			}
			ctx.stroke()
		}
		return ''
	}

	function writeIndexedPoint(index, length, samples, sampleOffset) {
		const path = index.path
		if (length <= 0) {
			samples[sampleOffset] = path[0][0]
			samples[sampleOffset + 1] = path[0][1]
			stats.directSamples++
			return true
		}
		if (length >= index.totalPathLength) {
			const point = path[path.length - 1]
			samples[sampleOffset] = point[0]
			samples[sampleOffset + 1] = point[1]
			stats.directSamples++
			return true
		}
		let low = 0
		let high = index.segments.length - 1
		let binarySearchSteps = 0
		while (low <= high) {
			binarySearchSteps++
			const middle = (low + high) >> 1
			const segment = index.segments[middle]
			if (length < segment.start) {
				high = middle - 1
				continue
			}
			if (length >= segment.end) {
				low = middle + 1
				continue
			}
			const p1 = path[segment.pathIndex]
			const p2 = path[segment.pathIndex + 1]
			const factor = (length - segment.start) / segment.length
			samples[sampleOffset] = p1[0] + (p2[0] - p1[0]) * factor
			samples[sampleOffset + 1] = p1[1] + (p2[1] - p1[1]) * factor
			stats.directSamples++
			stats.directBinarySearchSteps += binarySearchSteps
			return true
		}
		return false
	}

	function getIndexedPointAtLength(effect, index, length) {
		const path = effect.path
		if (length <= 0) {
			stats.indexedLookups++
			return path[0].slice()
		}
		if (length >= index.totalPathLength) {
			stats.indexedLookups++
			return path[path.length - 1].slice()
		}
		let low = 0
		let high = index.segments.length - 1
		let binarySearchSteps = 0
		while (low <= high) {
			binarySearchSteps++
			const middle = (low + high) >> 1
			const segment = index.segments[middle]
			if (length < segment.start) {
				high = middle - 1
				continue
			}
			if (length >= segment.end) {
				low = middle + 1
				continue
			}
			const p1 = path[segment.pathIndex]
			const p2 = path[segment.pathIndex + 1]
			const factor = (length - segment.start) / segment.length
			stats.indexedLookups++
			stats.linearSegmentChecks += segment.pathIndex + 1
			stats.binarySearchSteps += binarySearchSteps
			return [p1[0] + (p2[0] - p1[0]) * factor, p1[1] + (p2[1] - p1[1]) * factor]
		}
		return null
	}

	function inspectActiveTransfers(game) {
		const effects = Array.isArray(game?.chasmVfx) ? game.chasmVfx : []
		let transfers = 0
		let totalPathSegments = 0
		let maxPathSegments = 0
		let totalActiveResources = 0
		let maxActiveResources = 0
		for (const effect of effects) {
			if (!effect || effect.constructor?.name !== 'ChasmTransfer') continue
			transfers++
			const pathSegments = Math.max(0, (Array.isArray(effect.path) ? effect.path.length : 0) - 1)
			const activeResources = Array.isArray(effect.resources) ? effect.resources.reduce((count, value) => count + (value ? 1 : 0), 0) : 0
			totalPathSegments += pathSegments
			maxPathSegments = Math.max(maxPathSegments, pathSegments)
			totalActiveResources += activeResources
			maxActiveResources = Math.max(maxActiveResources, activeResources)
		}
		return {
			transfers,
			avgPathSegments: transfers ? roundNumber(totalPathSegments / transfers, 3) : 0,
			maxPathSegments,
			avgActiveResources: transfers ? roundNumber(totalActiveResources / transfers, 3) : 0,
			maxActiveResources
		}
	}

	function clearActiveIndexes(game) {
		const effects = Array.isArray(game?.chasmVfx) ? game.chasmVfx : []
		let cleared = 0
		for (const effect of effects) {
			if (!effect || !effect[indexKey]) continue
			delete effect[indexKey]
			cleared++
		}
		return cleared
	}

	function runOriginalWithFallback(effect, original, args, reason) {
		stats.fallbacks++
		stats.fallbackReasons[reason] = (stats.fallbackReasons[reason] || 0) + 1
		return original.apply(effect, args)
	}

	function recordDirectRenderFallback(reason) {
		stats.directRenderFallbacks++
		stats.directRenderFallbackReasons[reason] = (stats.directRenderFallbackReasons[reason] || 0) + 1
	}

	function resetStats() {
		stats.lookups = 0
		stats.indexedLookups = 0
		stats.indexBuilds = 0
		stats.indexClears = 0
		stats.fallbacks = 0
		stats.linearSegmentChecks = 0
		stats.binarySearchSteps = 0
		stats.totalIndexedSegments = 0
		stats.maxIndexedSegments = 0
		stats.directRenderCalls = 0
		stats.directRenderFallbacks = 0
		stats.directSamples = 0
		stats.directBinarySearchSteps = 0
		stats.directRenderFallbackReasons = {}
		stats.fallbackReasons = {}
	}

	function isFinitePoint(point) {
		return Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
	}

	function roundNumber(value, digits) {
		const number = Number(value)
		if (!Number.isFinite(number)) return 0
		const scale = Math.pow(10, digits)
		return Math.round(number * scale) / scale
	}
})()
