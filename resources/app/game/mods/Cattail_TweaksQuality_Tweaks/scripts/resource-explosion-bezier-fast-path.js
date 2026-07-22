(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailResourceExplosionBezierFastPathInstalled'
	const preparedKey = '__cattailResourceExplosionBezierFastPathPrepared'
	const curveKey = '__cattailResourceExplosionBezierFastCurve'
	const apiKey = 'CattailTweaksResourceExplosionBezierFastPath'
	const configKey = 'enableResourceExplosionBezierFastPath'
	let previewEnabled = null
	let configuredEnabled = true
	let fastPathEnabled = true
	let directRenderEnabled = true
	let activeGame = null

	const stats = {
		explosionsPrepared: 0,
		curvesSeen: 0,
		curvesPrepared: 0,
		curveFallbacks: 0,
		directRenderCalls: 0,
		directRenderFallbacks: 0,
		directRenderFallbackReasons: {},
		fallbackReasons: {}
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installResourceExplosionBezierFastPath(api)
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
				fastPathEnabled = previewEnabled
			}, true)
		} catch (error) {}
	}

	function installResourceExplosionBezierFastPath(api) {
		if (window[installedKey] || typeof ResourceExplosion === 'undefined') return
		const prototype = ResourceExplosion.prototype
		if (!prototype || typeof prototype.render !== 'function') return
		configuredEnabled = api?.config?.get(configKey, true) !== false
		fastPathEnabled = previewEnabled !== null ? previewEnabled : configuredEnabled
		window[installedKey] = true
		installDebugApi()
		api.patch(prototype, 'render', function (original) {
			return function () {
				if (fastPathEnabled) {
					const prepared = this[preparedKey] || prepareExplosionCurves(this)
					if (directRenderEnabled && prepared.directReady) {
						const fallbackReason = renderPreparedExplosion(this, prepared)
						if (!fallbackReason) {
							stats.directRenderCalls++
							return
						}
						recordDirectRenderFallback(fallbackReason)
					}
				}
				return original.apply(this, arguments)
			}
		})
	}

	function installDebugApi() {
		window[apiKey] = {
			stats() {
				return Object.assign({}, stats, {
					enabled: fastPathEnabled,
					directRenderEnabled,
					prepareRate: stats.curvesSeen ? roundNumber(stats.curvesPrepared / stats.curvesSeen, 4) : 0,
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
			inspect(game = activeGame) {
				return inspectActiveExplosions(game)
			}
		}
	}

	function prepareExplosionCurves(effect) {
		const paths = effect?.paths
		const result = { curves: 0, prepared: 0, fallbacks: 0, directReady: false, directCurves: [] }
		if (!Array.isArray(paths)) {
			recordFallback('missing-paths')
			result.fallbacks++
			effect[preparedKey] = result
			stats.explosionsPrepared++
			return result
		}
		for (const curve of paths) {
			result.curves++
			stats.curvesSeen++
			const reason = installFastCurve(curve)
			if (reason) {
				recordFallback(reason)
				result.fallbacks++
				result.directCurves.push(null)
				continue
			}
			result.prepared++
			result.directCurves.push(curve[curveKey])
			stats.curvesPrepared++
		}
		result.directReady = result.curves > 0 && result.fallbacks === 0
		effect[preparedKey] = result
		stats.explosionsPrepared++
		return result
	}

	function installFastCurve(curve) {
		if (!curve || typeof curve.getXY !== 'function') return 'missing-getxy'
		if (curve[curveKey]) return ''
		const points = curve.points
		if (!Array.isArray(points) || points.length < 4) return 'missing-points'
		const p0 = points[0]
		const p1 = points[1]
		const p2 = points[2]
		const p3 = points[3]
		if (!isFinitePoint(p0) || !isFinitePoint(p1) || !isFinitePoint(p2) || !isFinitePoint(p3)) return 'invalid-points'
		if (p1[0] !== p2[0] || p1[1] !== p2[1] || p1[0] !== p3[0] || p1[1] !== p3[1]) return 'non-degenerate-curve'
		const startX = Number(p0[0])
		const startY = Number(p0[1])
		const deltaX = Number(p3[0]) - startX
		const deltaY = Number(p3[1]) - startY
		const original = curve.getXY
		curve[curveKey] = { original, startX, startY, deltaX, deltaY }
		curve.getXY = function (t) {
			if (!fastPathEnabled) return original.apply(this, arguments)
			const remaining = 1 - t
			const factor = 1 - remaining * remaining * remaining
			return [startX + deltaX * factor, startY + deltaY * factor]
		}
		return ''
	}

	function renderPreparedExplosion(effect, prepared) {
		const master = effect?.master
		if (!master || !effect.visibility) return 'missing-master'
		if (!effect.visibility[master.plane]) return ''
		const resources = effect.resources
		const endTimes = effect.endTimes
		const curves = prepared.directCurves
		if (!Array.isArray(resources) || !Array.isArray(endTimes) || !Array.isArray(curves)) return 'missing-render-data'
		if (resources.length !== endTimes.length || resources.length !== curves.length) return 'render-data-length-mismatch'
		const ctx = master.ctx
		const codexResources = master.codex?.resources
		if (!ctx || !codexResources) return 'missing-render-context'

		const time = effect.time
		const unit = master.unit
		for (let j = 0; j < resources.length; j++) {
			const f = (time / endTimes[j]) ** .6
			if (!(f <= 1)) continue
			const from = Math.max(0, f - .05)
			const to = Math.min(1, f + .05)
			const curve = curves[j]
			const triplet = codexResources[resources[j]].triplet

			ctx.strokeStyle = triplet[j % 3]
			ctx.lineCap = 'round'
			ctx.lineWidth = (.5 + (1 - f) * .5) * unit * .04
			ctx.beginPath()
			let remaining = 1 - from
			let factor = 1 - remaining * remaining * remaining
			ctx.moveTo(curve.startX + curve.deltaX * factor, curve.startY + curve.deltaY * factor)
			for (let sample = from + .02; sample < to; sample += .02) {
				remaining = 1 - sample
				factor = 1 - remaining * remaining * remaining
				ctx.lineTo(curve.startX + curve.deltaX * factor, curve.startY + curve.deltaY * factor)
			}
			ctx.stroke()
		}
		return ''
	}

	function inspectActiveExplosions(game) {
		const effects = Array.isArray(game?.vfx) ? game.vfx : []
		let explosions = 0
		let preparedExplosions = 0
		let curves = 0
		let preparedCurves = 0
		let fallbackCurves = 0
		let maxCurves = 0
		for (const effect of effects) {
			if (!effect || effect.constructor?.name !== 'ResourceExplosion') continue
			explosions++
			const pathCount = Array.isArray(effect.paths) ? effect.paths.length : 0
			const prepared = effect[preparedKey]
			curves += pathCount
			maxCurves = Math.max(maxCurves, pathCount)
			if (!prepared) continue
			preparedExplosions++
			preparedCurves += Number(prepared.prepared) || 0
			fallbackCurves += Number(prepared.fallbacks) || 0
		}
		return {
			explosions,
			preparedExplosions,
			curves,
			preparedCurves,
			fallbackCurves,
			avgCurvesPerExplosion: explosions ? roundNumber(curves / explosions, 3) : 0,
			maxCurves
		}
	}

	function recordFallback(reason) {
		stats.curveFallbacks++
		stats.fallbackReasons[reason] = (stats.fallbackReasons[reason] || 0) + 1
	}

	function recordDirectRenderFallback(reason) {
		stats.directRenderFallbacks++
		stats.directRenderFallbackReasons[reason] = (stats.directRenderFallbackReasons[reason] || 0) + 1
	}

	function resetStats() {
		stats.explosionsPrepared = 0
		stats.curvesSeen = 0
		stats.curvesPrepared = 0
		stats.curveFallbacks = 0
		stats.directRenderCalls = 0
		stats.directRenderFallbacks = 0
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
