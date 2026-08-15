ModLoader.register({
	id: 'cattail-world-editor-paint-cube-render-diagnostics',
	version: '0.6.0',
	init(api) {
		const GLOBAL_KEY = Symbol.for('cattail.world-editor.paint-cube-render-diagnostics')
		const CACHE_KEY = 'CattailTweaksCubeResourceCache'
		const DIAGNOSTICS_VERSION = 3
		const FRAME_MODE_DEFAULT_FRAMES = 600
		const DETAIL_MODE_DEFAULT_FRAMES = 120
		const previous = globalThis[GLOBAL_KEY]
		if (previous && typeof previous.dispose === 'function') previous.dispose('replaced')

		let active = false
		let installed = false
		let disposed = false
		let mode = 'frame'
		let frameLimit = FRAME_MODE_DEFAULT_FRAMES
		let activeGame = null
		let startedAt = 0
		let endedAt = 0
		let stopReason = null
		let lastFrameEndedAt = 0
		let runSerial = 0
		let permanentUnpatches = []
		let detailUnpatches = []
		let frameSamples = createFrameSamples()
		let cacheStatsStart = null
		let cacheStatsEnd = null
		let sceneFingerprintStart = null
		let sceneFingerprintEnd = null
		let performanceMarks = createEmptyPerformanceMarks()
		let metrics = createMetrics()

		function now() {
			if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') return performance.now()
			return Date.now()
		}

		function createMetrics() {
			return {
				frames: 0,
				detailFrames: 0,
				frameDtTotal: 0,
				frameDtMax: 0,
				renderLoopMsTotal: 0,
				renderLoopMsMax: 0,
				renderEntitiesCalls: 0,
				renderEntitiesMsTotal: 0,
				renderEntitiesMsMax: 0,
				renderEntitiesCubeMsTotal: 0,
				renderEntitiesCubeMsMax: 0,
				renderEntitiesIsVisibleMsTotal: 0,
				renderEntitiesIsVisibleMsMax: 0,
				renderEntitiesResidualMsTotal: 0,
				renderEntitiesResidualMsMax: 0,
				isVisibleCalls: 0,
				isVisibleMsTotal: 0,
				isVisibleMsMax: 0,
				isVisibleTrue: 0,
				isVisibleFalse: 0,
				cubeIsVisibleCalls: 0,
				cubeIsVisibleTrue: 0,
				paintedCubeIsVisibleCalls: 0,
				paintedCubeIsVisibleTrue: 0,
				nonCubeIsVisibleCalls: 0,
				nonCubeIsVisibleTrue: 0,
				cubeRenderCalls: 0,
				cubeRenderMsTotal: 0,
				cubeRenderMsMax: 0,
				paintedCubeRenderCalls: 0,
				paintedCubeRenderMsTotal: 0,
				paintedCubeRenderMsMax: 0,
				ordinaryCubeRenderCalls: 0,
				ordinaryCubeRenderMsTotal: 0,
				ordinaryCubeRenderMsMax: 0,
				drawResourcesCalls: 0,
				drawResourcesMsTotal: 0,
				drawResourcesMsMax: 0,
				paintedDrawResourcesCalls: 0,
				paintedDrawResourcesMsTotal: 0,
				paintedDrawResourcesMsMax: 0,
				ordinaryDrawResourcesCalls: 0,
				ordinaryDrawResourcesMsTotal: 0,
				ordinaryDrawResourcesMsMax: 0,
				paintedEntitiesInStuff: 0,
				cubeEntitiesInStuff: 0,
				totalStuff: 0
			}
		}

		function createFrameSamples() {
			return {
				frameDt: [],
				renderLoop: [],
				interFrameGap: [],
				outsideLoop: []
			}
		}

		function createEmptyPerformanceMarks() {
			return { start: '', end: '', measure: '' }
		}

		function normalizeMode(value) {
			return value === 'detail' ? 'detail' : 'frame'
		}

		function clampFrameLimit(value, fallback) {
			const parsed = Number(value)
			if (!Number.isFinite(parsed)) return fallback
			return Math.max(1, Math.min(3600, Math.floor(parsed)))
		}

		function markTime(totalKey, maxKey, elapsed) {
			if (!Number.isFinite(elapsed) || elapsed < 0) return
			metrics[totalKey] += elapsed
			if (elapsed > metrics[maxKey]) metrics[maxKey] = elapsed
		}

		function addSample(name, value) {
			if (!Number.isFinite(value) || value < 0 || !frameSamples[name]) return
			frameSamples[name].push(value)
		}

		function percentile(sorted, ratio) {
			if (!sorted.length) return 0
			const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1))
			return sorted[index]
		}

		function summarizeSamples(values) {
			if (!Array.isArray(values) || !values.length) {
				return { count: 0, average: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0 }
			}
			const sorted = values.slice().sort((a, b) => a - b)
			let total = 0
			for (let i = 0; i < sorted.length; i += 1) total += sorted[i]
			return {
				count: sorted.length,
				average: total / sorted.length,
				min: sorted[0],
				p50: percentile(sorted, 0.5),
				p95: percentile(sorted, 0.95),
				p99: percentile(sorted, 0.99),
				max: sorted[sorted.length - 1]
			}
		}

		function summarizeFrameSamples() {
			return {
				frameDt: summarizeSamples(frameSamples.frameDt),
				renderLoop: summarizeSamples(frameSamples.renderLoop),
				interFrameGap: summarizeSamples(frameSamples.interFrameGap),
				outsideLoop: summarizeSamples(frameSamples.outsideLoop)
			}
		}

		function isPaintedCube(entity) {
			if (!entity || entity.name !== 'cube') return false
			const marker = entity.worldEditorPaint || entity.par?.worldEditorPaint
			return marker && marker.kind === 'world-editor-painted-cube'
		}

		function readSceneFingerprint(game) {
			const stuff = Array.isArray(game?.stuff) ? game.stuff : []
			let cubes = 0
			let painted = 0
			let visibleCubes = 0
			let visiblePainted = 0
			let visibleNonCubes = 0
			for (let i = 0; i < stuff.length; i += 1) {
				const entity = stuff[i]
				const cube = entity?.name === 'cube'
				const paintedCube = cube && isPaintedCube(entity)
				if (cube) {
					cubes += 1
					if (paintedCube) painted += 1
				}
				let visible = null
				try {
					if (typeof game?.isVisible === 'function') visible = game.isVisible(entity) === true
				} catch (error) {}
				if (visible) {
					if (cube) {
						visibleCubes += 1
						if (paintedCube) visiblePainted += 1
					} else {
						visibleNonCubes += 1
					}
				}
			}
			const translation = Array.isArray(game?.translation)
				? [Number(game.translation[0]) || 0, Number(game.translation[1]) || 0]
				: null
			return {
				totalStuff: stuff.length,
				cubes,
				paintedCubes: painted,
				ordinaryCubes: cubes - painted,
				nonCubes: stuff.length - cubes,
				visibleCubes,
				visiblePaintedCubes: visiblePainted,
				visibleOrdinaryCubes: visibleCubes - visiblePainted,
				visibleNonCubes,
				plane: Number(game?.plane) || 0,
				zoom: Number(game?.zoom) || 0,
				unit: Number(game?.unit) || 0,
				translation
			}
		}

		function applyStuffMetrics(fingerprint) {
			if (!fingerprint) return
			metrics.totalStuff = fingerprint.totalStuff
			metrics.cubeEntitiesInStuff = fingerprint.cubes
			metrics.paintedEntitiesInStuff = fingerprint.paintedCubes
		}

		function readCubeCacheStats() {
			const stats = globalThis[CACHE_KEY]?.stats
			if (typeof stats !== 'function') return null
			try {
				return JSON.parse(JSON.stringify(stats()))
			} catch (error) {
				return { error: error?.message || String(error) }
			}
		}

		function diffCubeCacheStats(startStats, endStats) {
			if (!startStats || !endStats) return null
			const delta = {}
			const keys = new Set([...Object.keys(startStats), ...Object.keys(endStats)])
			for (const key of keys) {
				const startValue = startStats[key]
				const endValue = endStats[key]
				if (Number.isFinite(startValue) && Number.isFinite(endValue)) delta[key] = endValue - startValue
			}
			return delta
		}

		function readDynamicCameraStats() {
			const game = activeGame
			const state = game?.__cattailDynamicCameraState
			if (!state) return null
			return {
				enabled: state.enabled === true,
				mode: state.mode,
				scale: state.scale,
				zoom: game?.zoom,
				unit: game?.unit,
				translation: Array.isArray(game?.translation)
					? [Number(game.translation[0]) || 0, Number(game.translation[1]) || 0]
					: null
			}
		}

		function clearPerformanceEntry(kind, name) {
			try {
				const method = kind === 'measure' ? performance?.clearMeasures : performance?.clearMarks
				if (typeof method === 'function') method.call(performance, name)
			} catch (error) {}
		}

		function markPerformanceStart() {
			runSerial += 1
			const prefix = `cattail-paint-diagnostics-v3-${runSerial}-${mode}`
			performanceMarks = {
				start: `${prefix}-start`,
				end: `${prefix}-end`,
				measure: `${prefix}-measure`
			}
			clearPerformanceEntry('mark', performanceMarks.start)
			clearPerformanceEntry('mark', performanceMarks.end)
			clearPerformanceEntry('measure', performanceMarks.measure)
			try {
				if (typeof performance?.mark === 'function') performance.mark(performanceMarks.start)
			} catch (error) {}
		}

		function markPerformanceEnd() {
			try {
				if (typeof performance?.mark === 'function') performance.mark(performanceMarks.end)
				if (typeof performance?.measure === 'function') {
					performance.measure(performanceMarks.measure, performanceMarks.start, performanceMarks.end)
				}
			} catch (error) {}
		}

		function start(options = {}) {
			reset()
			mode = normalizeMode(options.mode)
			const fallbackFrames = mode === 'detail' ? DETAIL_MODE_DEFAULT_FRAMES : FRAME_MODE_DEFAULT_FRAMES
			frameLimit = clampFrameLimit(options.frames, fallbackFrames)
			cacheStatsStart = readCubeCacheStats()
			sceneFingerprintStart = activeGame ? readSceneFingerprint(activeGame) : null
			applyStuffMetrics(sceneFingerprintStart)
			if (mode === 'detail') installDetailPatches()
			markPerformanceStart()
			active = true
			startedAt = now()
			stopReason = null
			return snapshot()
		}

		function stop(reason = 'manual') {
			if (active) {
				active = false
				endedAt = now()
				stopReason = reason
				sceneFingerprintEnd = activeGame ? readSceneFingerprint(activeGame) : null
				applyStuffMetrics(sceneFingerprintEnd)
				cacheStatsEnd = readCubeCacheStats()
				markPerformanceEnd()
				uninstallDetailPatches()
			}
			return snapshot()
		}

		function reset() {
			active = false
			uninstallDetailPatches()
			metrics = createMetrics()
			frameSamples = createFrameSamples()
			mode = 'frame'
			frameLimit = FRAME_MODE_DEFAULT_FRAMES
			startedAt = 0
			endedAt = 0
			stopReason = null
			lastFrameEndedAt = 0
			cacheStatsStart = null
			cacheStatsEnd = null
			sceneFingerprintStart = null
			sceneFingerprintEnd = null
			performanceMarks = createEmptyPerformanceMarks()
			return snapshot()
		}

		function snapshot() {
			const elapsedMs = startedAt ? ((endedAt || now()) - startedAt) : 0
			const frames = metrics.frames || 0
			const distributions = summarizeFrameSamples()
			const currentCacheStats = cacheStatsEnd || readCubeCacheStats()
			return Object.assign({
				diagnosticsVersion: DIAGNOSTICS_VERSION,
				active,
				mode,
				frameLimit,
				startedAt,
				endedAt,
				elapsedMs,
				stopReason,
				averageFrameDt: frames ? metrics.frameDtTotal / frames : 0,
				averageRenderLoopMs: frames ? metrics.renderLoopMsTotal / frames : 0,
				averageInterFrameGapMs: distributions.interFrameGap.average,
				averageOutsideLoopMs: distributions.outsideLoop.average,
				averageRenderEntitiesMs: metrics.renderEntitiesCalls ? metrics.renderEntitiesMsTotal / metrics.renderEntitiesCalls : 0,
				averageRenderEntitiesCubeMs: metrics.renderEntitiesCalls ? metrics.renderEntitiesCubeMsTotal / metrics.renderEntitiesCalls : 0,
				averageRenderEntitiesIsVisibleMs: metrics.renderEntitiesCalls ? metrics.renderEntitiesIsVisibleMsTotal / metrics.renderEntitiesCalls : 0,
				averageRenderEntitiesResidualMs: metrics.renderEntitiesCalls ? metrics.renderEntitiesResidualMsTotal / metrics.renderEntitiesCalls : 0,
				averageIsVisibleMs: metrics.isVisibleCalls ? metrics.isVisibleMsTotal / metrics.isVisibleCalls : 0,
				averageCubeRenderMs: metrics.cubeRenderCalls ? metrics.cubeRenderMsTotal / metrics.cubeRenderCalls : 0,
				averagePaintedCubeRenderMs: metrics.paintedCubeRenderCalls ? metrics.paintedCubeRenderMsTotal / metrics.paintedCubeRenderCalls : 0,
				averageOrdinaryCubeRenderMs: metrics.ordinaryCubeRenderCalls ? metrics.ordinaryCubeRenderMsTotal / metrics.ordinaryCubeRenderCalls : 0,
				averageDrawResourcesMs: metrics.drawResourcesCalls ? metrics.drawResourcesMsTotal / metrics.drawResourcesCalls : 0,
				averagePaintedDrawResourcesMs: metrics.paintedDrawResourcesCalls ? metrics.paintedDrawResourcesMsTotal / metrics.paintedDrawResourcesCalls : 0,
				averageOrdinaryDrawResourcesMs: metrics.ordinaryDrawResourcesCalls ? metrics.ordinaryDrawResourcesMsTotal / metrics.ordinaryDrawResourcesCalls : 0,
				distributions,
				cacheStatsStart,
				cacheStatsEnd,
				cacheStatsDelta: diffCubeCacheStats(cacheStatsStart, cacheStatsEnd || currentCacheStats),
				cubeCacheStats: currentCacheStats,
				sceneFingerprintStart,
				sceneFingerprintEnd,
				performanceMarks: Object.assign({}, performanceMarks),
				dynamicCamera: readDynamicCameraStats()
			}, metrics)
		}

		function report() {
			return snapshot()
		}

		function installDetailPatches() {
			if (detailUnpatches.length || disposed) return

			if (typeof Game !== 'undefined' && Game?.prototype?.renderEntities) {
				detailUnpatches.push(api.patch(Game.prototype, 'renderEntities', original => function (...args) {
					if (!active || mode !== 'detail') return original.apply(this, args)
					const before = now()
					const beforeCubeMs = metrics.cubeRenderMsTotal
					const beforeIsVisibleMs = metrics.isVisibleMsTotal
					const result = original.apply(this, args)
					const elapsed = now() - before
					const cubeElapsed = Math.max(0, metrics.cubeRenderMsTotal - beforeCubeMs)
					const isVisibleElapsed = Math.max(0, metrics.isVisibleMsTotal - beforeIsVisibleMs)
					const residualElapsed = Math.max(0, elapsed - cubeElapsed - isVisibleElapsed)
					metrics.renderEntitiesCalls += 1
					markTime('renderEntitiesMsTotal', 'renderEntitiesMsMax', elapsed)
					markTime('renderEntitiesCubeMsTotal', 'renderEntitiesCubeMsMax', cubeElapsed)
					markTime('renderEntitiesIsVisibleMsTotal', 'renderEntitiesIsVisibleMsMax', isVisibleElapsed)
					markTime('renderEntitiesResidualMsTotal', 'renderEntitiesResidualMsMax', residualElapsed)
					return result
				}))
			}

			if (typeof Game !== 'undefined' && Game?.prototype?.isVisible) {
				detailUnpatches.push(api.patch(Game.prototype, 'isVisible', original => function (...args) {
					if (!active || mode !== 'detail') return original.apply(this, args)
					const entity = args[0]
					const painted = isPaintedCube(entity)
					const before = now()
					const result = original.apply(this, args)
					const elapsed = now() - before
					metrics.isVisibleCalls += 1
					markTime('isVisibleMsTotal', 'isVisibleMsMax', elapsed)
					if (result) metrics.isVisibleTrue += 1
					else metrics.isVisibleFalse += 1
					if (entity?.name === 'cube') {
						metrics.cubeIsVisibleCalls += 1
						if (result) metrics.cubeIsVisibleTrue += 1
						if (painted) {
							metrics.paintedCubeIsVisibleCalls += 1
							if (result) metrics.paintedCubeIsVisibleTrue += 1
						}
					} else {
						metrics.nonCubeIsVisibleCalls += 1
						if (result) metrics.nonCubeIsVisibleTrue += 1
					}
					return result
				}))
			}

			if (typeof Cube !== 'undefined' && Cube?.prototype?.render) {
				detailUnpatches.push(api.patch(Cube.prototype, 'render', original => function (...args) {
					if (!active || mode !== 'detail') return original.apply(this, args)
					const painted = isPaintedCube(this)
					const before = now()
					const result = original.apply(this, args)
					const elapsed = now() - before
					metrics.cubeRenderCalls += 1
					markTime('cubeRenderMsTotal', 'cubeRenderMsMax', elapsed)
					if (painted) {
						metrics.paintedCubeRenderCalls += 1
						markTime('paintedCubeRenderMsTotal', 'paintedCubeRenderMsMax', elapsed)
					} else {
						metrics.ordinaryCubeRenderCalls += 1
						markTime('ordinaryCubeRenderMsTotal', 'ordinaryCubeRenderMsMax', elapsed)
					}
					return result
				}))
			}

			if (typeof Cube !== 'undefined' && Cube?.prototype?.drawResources) {
				detailUnpatches.push(api.patch(Cube.prototype, 'drawResources', original => function (...args) {
					if (!active || mode !== 'detail') return original.apply(this, args)
					const painted = isPaintedCube(this)
					const before = now()
					const result = original.apply(this, args)
					const elapsed = now() - before
					metrics.drawResourcesCalls += 1
					markTime('drawResourcesMsTotal', 'drawResourcesMsMax', elapsed)
					if (painted) {
						metrics.paintedDrawResourcesCalls += 1
						markTime('paintedDrawResourcesMsTotal', 'paintedDrawResourcesMsMax', elapsed)
					} else {
						metrics.ordinaryDrawResourcesCalls += 1
						markTime('ordinaryDrawResourcesMsTotal', 'ordinaryDrawResourcesMsMax', elapsed)
					}
					return result
				}))
			}
		}

		function uninstallDetailPatches() {
			for (let i = detailUnpatches.length - 1; i >= 0; i -= 1) {
				try { detailUnpatches[i]() } catch (error) {}
			}
			detailUnpatches = []
		}

		function install() {
			if (installed || disposed) return
			installed = true

			if (typeof Game !== 'undefined' && Game?.prototype?.renderloop) {
				permanentUnpatches.push(api.patch(Game.prototype, 'renderloop', original => function (...args) {
					if (!active) return original.apply(this, args)
					activeGame = this
					const before = now()
					if (lastFrameEndedAt > 0) {
						const gap = Math.max(0, before - lastFrameEndedAt)
						addSample('interFrameGap', gap)
						addSample('outsideLoop', gap)
					}
					const result = original.apply(this, args)
					const after = now()
					const elapsed = Math.max(0, after - before)
					lastFrameEndedAt = after
					metrics.frames += 1
					if (mode === 'detail') metrics.detailFrames += 1
					const dt = Number(this?.renderTime?.dt)
					if (Number.isFinite(dt) && dt >= 0) {
						metrics.frameDtTotal += dt
						if (dt > metrics.frameDtMax) metrics.frameDtMax = dt
						addSample('frameDt', dt)
					}
					markTime('renderLoopMsTotal', 'renderLoopMsMax', elapsed)
					addSample('renderLoop', elapsed)
					if (metrics.frames >= frameLimit) stop('frame-limit')
					return result
				}))
			}
		}

		function dispose(reason = 'disposed') {
			if (active) stop(reason)
			disposed = true
			active = false
			stopReason = reason
			uninstallDetailPatches()
			for (const unpatch of permanentUnpatches.splice(0)) {
				try { unpatch() } catch (error) {}
			}
			if (globalThis[GLOBAL_KEY] === service) delete globalThis[GLOBAL_KEY]
			if (globalThis.CattailWorldEditorPaintCubeRenderDiagnostics === service) delete globalThis.CattailWorldEditorPaintCubeRenderDiagnostics
		}

		const service = Object.freeze({
			version: '0.6.0',
			start,
			stop,
			reset,
			snapshot,
			report,
			dispose
		})

		globalThis[GLOBAL_KEY] = service
		globalThis.CattailWorldEditorPaintCubeRenderDiagnostics = service

		api.on('afterVanillaScripts', install)
		api.on('afterGameInit', (_payload, game) => {
			activeGame = game || activeGame
		})
	}
})
