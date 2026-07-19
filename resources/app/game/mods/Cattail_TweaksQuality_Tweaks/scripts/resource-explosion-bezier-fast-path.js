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
	let activeGame = null

	const stats = {
		explosionsPrepared: 0,
		curvesSeen: 0,
		curvesPrepared: 0,
		curveFallbacks: 0,
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
				if (fastPathEnabled && !this[preparedKey]) prepareExplosionCurves(this)
				return original.apply(this, arguments)
			}
		})
	}

	function installDebugApi() {
		window[apiKey] = {
			stats() {
				return Object.assign({}, stats, {
					enabled: fastPathEnabled,
					prepareRate: stats.curvesSeen ? roundNumber(stats.curvesPrepared / stats.curvesSeen, 4) : 0,
					fallbackReasons: Object.assign({}, stats.fallbackReasons)
				})
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
		const result = { curves: 0, prepared: 0, fallbacks: 0 }
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
				continue
			}
			result.prepared++
			stats.curvesPrepared++
		}
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
		curve[curveKey] = { original }
		curve.getXY = function (t) {
			if (!fastPathEnabled) return original.apply(this, arguments)
			const remaining = 1 - t
			const factor = 1 - remaining * remaining * remaining
			return [startX + deltaX * factor, startY + deltaY * factor]
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

	function resetStats() {
		stats.explosionsPrepared = 0
		stats.curvesSeen = 0
		stats.curvesPrepared = 0
		stats.curveFallbacks = 0
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
