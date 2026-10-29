(function () {
	// Publish one canonical API and a synchronized legacy alias. Never replace a foreign root.
	const tweaksNamespace = (function () {
		let namespace = window.CattailTweaks
		if (namespace === undefined) namespace = window.CattailTweaks = {}
		if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) {
			console.warn('[Tweaks] CattailTweaks namespace is occupied; retaining legacy access')
			namespace = {}
		}
		const legacy = 'CattailTweaksScanRangePreview'
		if (namespace.kernelRangePreview === undefined && window[legacy] !== undefined) namespace.kernelRangePreview = window[legacy]
		const descriptor = Object.getOwnPropertyDescriptor(window, legacy)
		if (!descriptor || descriptor.configurable) Object.defineProperty(window, legacy, {
			configurable: true, enumerable: true,
			get() { return namespace.kernelRangePreview },
			set(value) { namespace.kernelRangePreview = value }
		})
		else console.warn('[Tweaks] Legacy API alias is not configurable: ' + legacy)
		return namespace
	})()

	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailTweaksKernelRangePreviewInstalled'
	const apiKey = 'kernelRangePreview'
	const configKey = 'enableBetterKernelRangePreview'
	const renderLayerId = 'interaction'
	const renderCallbackId = 'tweaks-kernel-range-preview'
	const scanEntityName = 'scan'
	const vanillaScanRadius = 16
	const minScanDiameter = 8
	const maxScanDiameter = 1024
	const sharedSliderDiameterKey = '__cattailScanRealitySliderDiameter'
	const sharedSliderEnabledKey = '__cattailScanRealitySliderEnabled'
	const drawModeNormal = 'normal'
	const drawModeExact = 'exact'
	const drawModeWebglExact = 'webgl-exact'
	const drawModeApproximate = 'approximate'
	const drawModeNone = 'none'
	const drawModeCenter = 'center'
	const drawModeBounds = 'bounds'
	const drawModes = [drawModeNormal, drawModeExact, drawModeWebglExact, drawModeApproximate, drawModeNone, drawModeCenter, drawModeBounds]
	const exactShapeRadiusLimit = 48
	const approximateSegmentCount = 96
	const webglShapeRadiusLimit = 512
	const webglOverlayId = 'cattail-tweaks-scan-range-webgl-preview'
	const loopProbeMethodNames = [
		'updateEntities',
		'updateResourceInteractions',
		'updateVFX',
		'updateHollowEvents',
		'updateResourcePops',
		'updateSurge',
		'updateAnalytics',
		'updateTranslation',
		'updateAutoClicker',
		'updateMusic'
	]

	let previewEnabled = null
	let cachedPreviewShape = null
	let webglPreview = null
	let webglUnavailable = false
	let probeDrawMode = drawModeNormal
	let monitorTimer = null
	let monitorRafTimer = null
	let monitorPreviousSnapshot = null
	let monitorPreviousAt = 0
	let renderCallbackRegistered = false
	const loopProbe = {
		installed: false,
		active: false,
		lastUpdateLoopAt: 0,
		methods: Object.create(null)
	}

	const stats = {
		frames: 0,
		renders: 0,
		shapeHits: 0,
		shapeBuildStarts: 0,
		shapeBuilds: 0,
		shapeBuildChunks: 0,
		shapeBuildPendingFrames: 0,
		shapeBuildCancelled: 0,
		rafFrames: 0,
		pathFills: 0,
		centerFills: 0,
		rangeDraws: 0,
		webglDraws: 0,
		webglFallbacks: 0,
		webglBuilds: 0,
		totalWebglBuildMs: 0,
		maxWebglBuildMs: 0,
		lastWebglBuildMs: 0,
		approximateDraws: 0,
		boundsDraws: 0,
		drawSkips: 0,
		skippedWhileBuilding: 0,
		overflowFrames: 0,
		insideFrames: 0,
		totalRenderMs: 0,
		maxRenderMs: 0,
		lastRenderMs: 0,
		totalShapeBuildMs: 0,
		maxShapeBuildMs: 0,
		lastShapeBuildMs: 0,
		totalShapeBuildChunkMs: 0,
		maxShapeBuildChunkMs: 0,
		lastShapeBuildChunkMs: 0,
		updateLoopCalls: 0,
		totalUpdateLoopMs: 0,
		maxUpdateLoopMs: 0,
		lastUpdateLoopMs: 0,
		lastUpdateLoopGapMs: 0,
		maxUpdateLoopGapMs: 0,
		updateCycleCalls: 0,
		silentUpdateCycleCalls: 0,
		totalUpdateCycleMs: 0,
		maxUpdateCycleMs: 0,
		lastUpdateCycleMs: 0,
		lastUpdateSpan: 0,
		maxUpdateSpan: 0,
		lastRadius: 0,
		lastCellCount: 0,
		lastKey: '',
		lastShapeBuildProgress: null,
		lastBounds: null,
		lastScreenBounds: null,
		lastViewport: null,
		lastOverflow: null
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installScanRangePreview(api)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId === MOD_ID && detail.key === configKey) previewEnabled = detail.value !== false
			})
		} catch (error) {}
	}

	function installScanRangePreview(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		installDebugApi()
		installLoopProbe(api)
		registerScanRangeRenderCallback(api)

		api.patch(Game.prototype, 'renderAvailability', function (original) {
			return function (...args) {
				if (shouldUseRenderLayerPreview(this, api)) return
				return original.apply(this, args)
			}
		})

		api.patch(Game.prototype, 'renderSOI', function (original) {
			return function (...args) {
				if (shouldSkipGenericScanSoi(this, api, args[0])) return
				return original.apply(this, args)
			}
		})

		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				try { syncWebglOverlayVisibility(null) } catch (error) {}
				return original.apply(this, args)
			}
		})
	}

	function installLoopProbe(api) {
		if (loopProbe.installed || !api || typeof api.patch !== 'function') return
		loopProbe.installed = true
		patchMeasuredMethod(api, 'updateLoop', recordUpdateLoopProbe)
		patchMeasuredMethod(api, 'updateCycle', recordUpdateCycleProbe)
		for (let i = 0; i < loopProbeMethodNames.length; i++) {
			patchMeasuredMethod(api, loopProbeMethodNames[i], function (duration) {
				recordLoopMethodProbe(loopProbeMethodNames[i], duration)
			})
		}
	}

	function patchMeasuredMethod(api, methodName, recorder) {
		if (!Game.prototype || typeof Game.prototype[methodName] !== 'function') return
		api.patch(Game.prototype, methodName, function (original) {
			return function (...args) {
				if (!loopProbe.active) return original.apply(this, args)
				const start = now()
				try {
					return original.apply(this, args)
				} finally {
					recorder(now() - start, args, start)
				}
			}
		})
	}

	function recordUpdateLoopProbe(duration, args, start) {
		const at = Number.isFinite(start) ? start : now()
		if (loopProbe.lastUpdateLoopAt) {
			const gap = at - loopProbe.lastUpdateLoopAt
			stats.lastUpdateLoopGapMs = gap
			stats.maxUpdateLoopGapMs = Math.max(stats.maxUpdateLoopGapMs, gap)
		}
		loopProbe.lastUpdateLoopAt = at
		stats.updateLoopCalls++
		stats.lastUpdateLoopMs = duration
		stats.totalUpdateLoopMs += duration
		stats.maxUpdateLoopMs = Math.max(stats.maxUpdateLoopMs, duration)
	}

	function recordUpdateCycleProbe(duration, args) {
		const span = Number(args && args.length ? args[0] : 16)
		stats.updateCycleCalls++
		if (args && args[1] === true) stats.silentUpdateCycleCalls++
		stats.lastUpdateCycleMs = duration
		stats.totalUpdateCycleMs += duration
		stats.maxUpdateCycleMs = Math.max(stats.maxUpdateCycleMs, duration)
		if (Number.isFinite(span)) {
			stats.lastUpdateSpan = span
			stats.maxUpdateSpan = Math.max(stats.maxUpdateSpan, span)
		}
	}

	function recordLoopMethodProbe(methodName, duration) {
		let entry = loopProbe.methods[methodName]
		if (!entry) {
			entry = {
				calls: 0,
				totalMs: 0,
				maxMs: 0,
				lastMs: 0
			}
			loopProbe.methods[methodName] = entry
		}
		entry.calls++
		entry.lastMs = duration
		entry.totalMs += duration
		entry.maxMs = Math.max(entry.maxMs, duration)
	}

	function installDebugApi() {
		tweaksNamespace[apiKey] = {
			stats() {
				return getStatsSnapshot()
			},
			resetStats() {
				resetStats()
				monitorPreviousSnapshot = getStatsSnapshot()
				return getStatsSnapshot()
			},
			clear() {
				resetStats()
				cachedPreviewShape = null
				monitorPreviousSnapshot = getStatsSnapshot()
				return getStatsSnapshot()
			},
			monitorStart(options) {
				return startMonitor(options)
			},
			monitorColdStart(options) {
				return startMonitor(Object.assign({}, options || {}, { reset: true, clearShape: true }))
			},
			monitorStop() {
				return stopMonitor()
			},
			monitorOnce() {
				return logMonitorSnapshot()
			},
			setDrawMode(mode) {
				probeDrawMode = normalizeDrawMode(mode)
				monitorPreviousSnapshot = getStatsSnapshot()
				return getStatsSnapshot()
			},
			getDrawMode() {
				return probeDrawMode
			}
		}
	}

	function registerScanRangeRenderCallback(api) {
		if (!api?.render || typeof api.render.onLayer !== 'function') return
		api.render.onLayer(renderLayerId, function ({ game, ctx, canvas, width, height }) {
			renderScanRangePreview(game, ctx, { canvas, width, height }, api)
		}, {
			id: renderCallbackId,
			order: 20,
			space: 'screen',
			enabled({ game }) { return shouldUseRenderLayerPreview(game, api) }
		})
		renderCallbackRegistered = true
	}

	function shouldUseRenderLayerPreview(game, api) {
		return shouldRenderScanRangePreview(game, api) && isRenderLayerPreviewAvailable(api)
	}

	function isRenderLayerPreviewAvailable(api) {
		if (!renderCallbackRegistered || !api?.render) return false
		if (typeof api.render.isEnabled === 'function') return api.render.isEnabled() !== false
		return true
	}

	function shouldRenderScanRangePreview(game, api) {
		return !!(
			isEnabled(api) &&
			game &&
			!game.halt &&
			game.canvas &&
			Array.isArray(game.hoveredCell) &&
			game.itemInHand &&
			!game.itemInHand.eraser &&
			game.itemInHand.name === scanEntityName &&
			(!game.isMobile || game.mouse?.state === 1)
		)
	}

	function isEnabled(api) {
		return previewEnabled === null ? api.config.get(configKey, true) !== false : previewEnabled !== false
	}

	function shouldSkipGenericScanSoi(game, api, target) {
		return shouldUseRenderLayerPreview(game, api) && Array.isArray(target) && sameCell(target, game.hoveredCell)
	}

	function sameCell(a, b) {
		return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1]
	}

	function renderScanRangePreview(game, ctx, layer, api) {
		if (!ctx || !shouldRenderScanRangePreview(game, api) || typeof game.uvToXY !== 'function') return
		stats.frames++
		const start = now()
		const state = getPreviewState(game, layer)
		if (!state) return

		ctx.save()
		try {
			ctx.setTransform(1, 0, 0, 1, 0, 0)
			ctx.translate(state.x, state.y)
			drawPreviewState(ctx, state)
		} finally {
			ctx.restore()
		}
		recordRenderProbe(state, now() - start)
	}

	function drawPreviewState(ctx, state) {
		if (probeDrawMode === drawModeNone) {
			stats.drawSkips++
			return
		}
		if (probeDrawMode === drawModeBounds) {
			drawPreviewBounds(ctx, state)
			stats.boundsDraws++
			return
		}
		const effectiveMode = getEffectiveDrawMode(state)
		if (effectiveMode === drawModeWebglExact) {
			if (drawWebglExactPreview(state)) {
				stats.webglDraws++
			} else {
				drawApproximatePreviewRange(ctx, state)
				stats.webglFallbacks++
			}
		} else if (effectiveMode === drawModeExact) {
			ctx.fillStyle = state.fillColor
			fillShape(ctx, state.shape.rangePath, state.shape.rangeCells)
			stats.rangeDraws++
		} else if (effectiveMode === drawModeApproximate) {
			drawApproximatePreviewRange(ctx, state)
		}
		ctx.fillStyle = state.centerColor
		fillShape(ctx, state.shape.centerPath, state.shape.centerCell ? [state.shape.centerCell] : null)
		stats.centerFills++
	}

	function drawApproximatePreviewRange(ctx, state) {
		ctx.fillStyle = state.fillColor
		fillShape(ctx, state.shape.approximatePath, state.shape.approximateCells)
		stats.approximateDraws++
	}

	function getEffectiveDrawMode(state) {
		if (probeDrawMode === drawModeExact) return drawModeExact
		if (probeDrawMode === drawModeWebglExact) return state.shape.webglRange ? drawModeWebglExact : drawModeApproximate
		if (probeDrawMode === drawModeApproximate) return drawModeApproximate
		if (state.shape.webglRange) return drawModeWebglExact
		return state.shape.exactRange ? drawModeExact : drawModeApproximate
	}

	function drawPreviewBounds(ctx, state) {
		const bounds = state.shape?.bounds
		if (!bounds) return
		ctx.strokeStyle = state.fillColor
		ctx.lineWidth = 2
		ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
	}

	function getPreviewState(game, layer) {
		const projection = getProjection(game)
		if (!projection) return null
		const scanRadius = getScanRadius()
		const shape = getCachedPreviewShape(scanRadius, projection)
		if (!shape) return null

		const originXY = game.uvToXY(game.hoveredCell)
		if (!Array.isArray(originXY)) return null

		const width = Number(layer?.width || layer?.canvas?.width || game.w) || 0
		const height = Number(layer?.height || layer?.canvas?.height || game.h) || 0
		const x = (Number(game.w2) || width / 2) + originXY[0]
		const y = (Number(game.h2) || height / 2) + originXY[1]
		const canPlace = !!game.canPlace
		const fillColor = getFillColor(game, canPlace)
		const centerColor = getCenterColor(game, canPlace)
		return { shape, projection, x, y, width, height, fillColor, centerColor, sourceCanvas: game.canvas }
	}

	function getCachedPreviewShape(scanRadius, projection) {
		const shapeMode = getShapeMode(scanRadius)
		const key = scanRadius + '|' + projection.key + '|' + shapeMode
		if (cachedPreviewShape && cachedPreviewShape.key === key) {
			stats.shapeHits++
			return cachedPreviewShape
		}
		cachedPreviewShape = buildPreviewShape(scanRadius, projection, key)
		return cachedPreviewShape
	}

	function getShapeMode(scanRadius) {
		if (probeDrawMode === drawModeExact) return drawModeExact
		if (probeDrawMode === drawModeWebglExact && shouldBuildWebglRange(scanRadius)) return drawModeWebglExact
		if (shouldBuildExactRange(scanRadius)) return drawModeExact
		if (probeDrawMode === drawModeApproximate) return drawModeApproximate
		if (shouldBuildWebglRange(scanRadius)) return drawModeWebglExact
		return drawModeApproximate
	}

	function getProjection(game) {
		try {
			const o = game.uvToXY([0, 0])
			const u = game.uvToXY([1, 0])
			const v = game.uvToXY([0, 1])
			const projection = {
				ux: u[0] - o[0],
				uy: u[1] - o[1],
				vx: v[0] - o[0],
				vy: v[1] - o[1]
			}
			projection.key = [
				formatProjectionNumber(projection.ux),
				formatProjectionNumber(projection.uy),
				formatProjectionNumber(projection.vx),
				formatProjectionNumber(projection.vy)
			].join(',')
			return projection
		} catch (error) {
			return null
		}
	}

	function formatProjectionNumber(value) {
		return Number.isFinite(value) ? value.toFixed(3) : '0'
	}

	function buildPreviewShape(scanRadius, projection, key) {
		const start = now()
		const canUsePath = typeof Path2D === 'function'
		const shapeMode = getShapeMode(scanRadius)
		const exactRange = shapeMode === drawModeExact
		const webglRange = shapeMode === drawModeWebglExact
		const rangePath = exactRange && canUsePath ? new Path2D() : null
		const centerPath = canUsePath ? new Path2D() : null
		const rangeCells = exactRange && !canUsePath ? [] : null
		const approximatePolygon = buildApproximateRangePolygon(scanRadius, projection)
		const approximatePath = canUsePath ? buildApproximateRangePath(approximatePolygon) : null
		const approximateCells = canUsePath ? null : [approximatePolygon]
		const centerCell = getRelativeCellCorners(projection, 0, 0)
		stats.shapeBuildStarts++
		const bounds = createEmptyBounds()
		let cellCount = 0

		if (exactRange) {
			const scanRadius2 = scanRadius * scanRadius
			for (let dx = -scanRadius; dx < scanRadius; dx++) {
				for (let dy = -scanRadius; dy < scanRadius; dy++) {
					const d2 = dx * dx + dy * dy
					if (d2 > scanRadius2) continue
					const cell = getRelativeCellCorners(projection, dx, dy)
					extendBounds(bounds, cell)
					cellCount++
					if (rangePath) addPolygon(rangePath, cell)
					else rangeCells.push(cell)
				}
			}
		} else if (webglRange) {
			cellCount = estimateCircleCellCount(scanRadius)
			extendBounds(bounds, approximatePolygon)
		} else {
			cellCount = estimateCircleCellCount(scanRadius)
			extendBounds(bounds, approximatePolygon)
		}
		if (centerPath) addPolygon(centerPath, centerCell)

		const duration = now() - start
		stats.shapeBuilds++
		stats.lastShapeBuildMs = duration
		stats.totalShapeBuildMs += duration
		stats.maxShapeBuildMs = Math.max(stats.maxShapeBuildMs, duration)
		stats.lastRadius = scanRadius
		stats.lastCellCount = cellCount
		stats.lastKey = key
		stats.lastShapeBuildProgress = null
		return {
			key,
			rangePath,
			centerPath,
			rangeCells,
			approximatePath,
			approximateCells,
			centerCell,
			bounds: normalizeBounds(bounds),
			cellCount,
			radius: scanRadius,
			exactRange,
			webglRange
		}
	}

	function shouldBuildExactRange(scanRadius) {
		return scanRadius <= exactShapeRadiusLimit
	}

	function shouldBuildWebglRange(scanRadius) {
		return scanRadius <= webglShapeRadiusLimit
	}

	function drawWebglExactPreview(state) {
		const renderer = getWebglPreview(state)
		if (!renderer) return false
		const gl = renderer.gl
		const shape = state.shape
		const bufferEntry = getWebglBuffer(renderer, shape, state.projection)
		if (!bufferEntry || !bufferEntry.vertexCount) return false
		syncWebglOverlayVisibility(state)

		gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		setWebglScissor(gl, renderer.canvas, state)
		gl.useProgram(renderer.program)
		gl.bindBuffer(gl.ARRAY_BUFFER, bufferEntry.buffer)
		gl.enableVertexAttribArray(renderer.aPosition)
		gl.vertexAttribPointer(renderer.aPosition, 2, gl.FLOAT, false, 0, 0)
		gl.uniform2f(renderer.uResolution, renderer.canvas.width, renderer.canvas.height)
		gl.uniform2f(renderer.uOrigin, state.x, state.y)
		setWebglInverseProjection(gl, renderer.uInverseProjection, state.projection)
		gl.uniform1f(renderer.uRadius, shape.radius)
		setWebglColor(gl, renderer.uColor, state.fillColor)
		gl.drawArrays(gl.TRIANGLES, 0, bufferEntry.vertexCount)
		gl.disable(gl.SCISSOR_TEST)
		return true
	}

	function getWebglPreview(state) {
		if (webglUnavailable) return null
		if (webglPreview && !webglPreview.lost) return webglPreview
		const canvas = getOrCreateWebglCanvas(state)
		if (!canvas) return null
		const gl = canvas.getContext('webgl2', {
			alpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false
		}) || canvas.getContext('webgl', {
			alpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false
		})
		if (!gl) {
			webglUnavailable = true
			return null
		}
		const program = createWebglProgram(gl)
		if (!program) {
			webglUnavailable = true
			return null
		}
		webglPreview = {
			canvas,
			gl,
			program,
			aPosition: gl.getAttribLocation(program, 'a_position'),
			uResolution: gl.getUniformLocation(program, 'u_resolution'),
			uOrigin: gl.getUniformLocation(program, 'u_origin'),
			uInverseProjection: gl.getUniformLocation(program, 'u_inverseProjection'),
			uRadius: gl.getUniformLocation(program, 'u_radius'),
			uColor: gl.getUniformLocation(program, 'u_color'),
			buffers: Object.create(null),
			lost: false
		}
		canvas.addEventListener('webglcontextlost', function (event) {
			try { event.preventDefault() } catch (error) {}
			webglPreview.lost = true
			stats.webglFallbacks++
		})
		canvas.addEventListener('webglcontextrestored', function () {
			if (webglPreview) webglPreview = null
		})
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
		gl.disable(gl.DEPTH_TEST)
		gl.disable(gl.CULL_FACE)
		return webglPreview
	}

	function getOrCreateWebglCanvas(state) {
		if (typeof document === 'undefined') return null
		let canvas = document.getElementById(webglOverlayId)
		if (!canvas) {
			canvas = document.createElement('canvas')
			canvas.id = webglOverlayId
			canvas.style.position = 'fixed'
			canvas.style.left = '0'
			canvas.style.top = '0'
			canvas.style.width = '100%'
			canvas.style.height = '100%'
			canvas.style.margin = '0'
			canvas.style.padding = '0'
			canvas.style.border = '0'
			canvas.style.pointerEvents = 'none'
			canvas.style.userSelect = 'none'
			canvas.style.display = 'none'
			canvas.style.zIndex = '1'
			const parent = state?.sourceCanvas?.parentNode || document.body
			parent.appendChild(canvas)
		}
		return canvas
	}

	function createWebglProgram(gl) {
		const vertexShader = compileWebglShader(gl, gl.VERTEX_SHADER, [
			'attribute vec2 a_position;',
			'void main() {',
			'	gl_Position = vec4(a_position, 0.0, 1.0);',
			'}'
		].join('\n'))
		const fragmentShader = compileWebglShader(gl, gl.FRAGMENT_SHADER, [
			'precision highp float;',
			'uniform vec2 u_resolution;',
			'uniform vec2 u_origin;',
			'uniform vec4 u_inverseProjection;',
			'uniform float u_radius;',
			'uniform vec4 u_color;',
			'void main() {',
			'	vec2 screen = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);',
			'	vec2 relative = screen - u_origin;',
			'	vec2 grid = vec2(',
			'		relative.x * u_inverseProjection.x + relative.y * u_inverseProjection.y,',
			'		relative.x * u_inverseProjection.z + relative.y * u_inverseProjection.w',
			'	);',
			'	vec2 cell = floor(grid + 0.5);',
			'	if (cell.x < -u_radius || cell.x >= u_radius || cell.y < -u_radius || cell.y >= u_radius) discard;',
			'	if (dot(cell, cell) > u_radius * u_radius) discard;',
			'	gl_FragColor = u_color;',
			'}'
		].join('\n'))
		if (!vertexShader || !fragmentShader) return null
		const program = gl.createProgram()
		gl.attachShader(program, vertexShader)
		gl.attachShader(program, fragmentShader)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
		return program
	}

	function compileWebglShader(gl, type, source) {
		const shader = gl.createShader(type)
		gl.shaderSource(shader, source)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
		return shader
	}

	function getWebglBuffer(renderer, shape, projection) {
		const key = 'fragment-mask-fullscreen'
		const existing = renderer.buffers[key]
		if (existing) return existing
		const start = now()
		const vertices = buildWebglRangeVertices()
		const buffer = renderer.gl.createBuffer()
		renderer.gl.bindBuffer(renderer.gl.ARRAY_BUFFER, buffer)
		renderer.gl.bufferData(renderer.gl.ARRAY_BUFFER, vertices, renderer.gl.STATIC_DRAW)
		const entry = { buffer, vertexCount: vertices.length / 2 }
		renderer.buffers[key] = entry
		stats.webglBuilds++
		stats.lastWebglBuildMs = now() - start
		stats.totalWebglBuildMs += stats.lastWebglBuildMs
		stats.maxWebglBuildMs = Math.max(stats.maxWebglBuildMs, stats.lastWebglBuildMs)
		return entry
	}

	function buildWebglRangeVertices() {
		return new Float32Array([
			-1, -1,
			1, -1,
			1, 1,
			-1, -1,
			1, 1,
			-1, 1
		])
	}

	function setWebglInverseProjection(gl, location, projection) {
		const det = projection.ux * projection.vy - projection.vx * projection.uy
		if (!Number.isFinite(det) || Math.abs(det) < 0.000001) {
			gl.uniform4f(location, 1, 0, 0, 1)
			return
		}
		gl.uniform4f(location, projection.vy / det, -projection.vx / det, -projection.uy / det, projection.ux / det)
	}

	function setWebglScissor(gl, canvas, state) {
		const bounds = state.shape?.bounds
		if (!bounds || !canvas?.width || !canvas?.height) {
			gl.disable(gl.SCISSOR_TEST)
			return
		}
		const minX = Math.max(0, Math.floor(state.x + bounds.minX - 2))
		const maxX = Math.min(canvas.width, Math.ceil(state.x + bounds.maxX + 2))
		const minY = Math.max(0, Math.floor(state.y + bounds.minY - 2))
		const maxY = Math.min(canvas.height, Math.ceil(state.y + bounds.maxY + 2))
		const width = maxX - minX
		const height = maxY - minY
		if (width <= 0 || height <= 0) {
			gl.disable(gl.SCISSOR_TEST)
			return
		}
		gl.enable(gl.SCISSOR_TEST)
		gl.scissor(minX, canvas.height - maxY, width, height)
	}

	function syncWebglOverlayVisibility(state) {
		const renderer = webglPreview
		const canvas = renderer?.canvas || (typeof document !== 'undefined' ? document.getElementById(webglOverlayId) : null)
		if (!canvas) return
		if (!state) {
			canvas.style.display = 'none'
			return
		}
		const source = state.sourceCanvas
		const rect = source && typeof source.getBoundingClientRect === 'function' ? source.getBoundingClientRect() : null
		canvas.width = state.width
		canvas.height = state.height
		if (rect && rect.width && rect.height) {
			canvas.style.left = rect.left + 'px'
			canvas.style.top = rect.top + 'px'
			canvas.style.width = rect.width + 'px'
			canvas.style.height = rect.height + 'px'
		} else {
			canvas.style.left = '0'
			canvas.style.top = '0'
			canvas.style.width = '100%'
			canvas.style.height = '100%'
		}
		canvas.style.display = ''
	}

	function setWebglColor(gl, location, colorText) {
		const color = parseRgbaColor(colorText)
		gl.uniform4f(location, color[0], color[1], color[2], color[3])
	}

	function parseRgbaColor(colorText) {
		const match = String(colorText || '').match(/rgba?\(([^)]+)\)/)
		if (!match) return [1, 1, 1, 0.05]
		const parts = match[1].split(',').map(function (part) { return Number(part.trim()) })
		return [
			clamp01((parts[0] || 0) / 255),
			clamp01((parts[1] || 0) / 255),
			clamp01((parts[2] || 0) / 255),
			clamp01(Number.isFinite(parts[3]) ? parts[3] : 1)
		]
	}

	function clamp01(value) {
		if (!Number.isFinite(value)) return 0
		return Math.max(0, Math.min(1, value))
	}

	function buildApproximateRangePath(points) {
		const path = new Path2D()
		addPolygon(path, points)
		return path
	}

	function buildApproximateRangePolygon(scanRadius, projection) {
		const points = []
		const radius = scanRadius + 0.5
		for (let i = 0; i < approximateSegmentCount; i++) {
			const angle = Math.PI * 2 * i / approximateSegmentCount
			points.push(projectRelative(projection, Math.cos(angle) * radius, Math.sin(angle) * radius))
		}
		return points
	}

	function estimateCircleCellCount(scanRadius) {
		return Math.round(Math.PI * scanRadius * scanRadius)
	}

	function getScanRadius() {
		const sharedDiameter = getSharedScanDiameter()
		const diameter = sharedDiameter === null ? vanillaScanRadius * 2 : sharedDiameter
		return Math.max(1, Math.round(diameter / 2))
	}

	function getSharedScanDiameter() {
		if (typeof window === 'undefined') return null
		if (window[sharedSliderEnabledKey] !== true) return null
		const diameter = Number(window[sharedSliderDiameterKey])
		if (!Number.isFinite(diameter) || diameter <= 0) return null
		return Math.max(minScanDiameter, Math.min(maxScanDiameter, diameter))
	}

	function getRelativeCellCorners(projection, u, v) {
		return [
			projectRelative(projection, u - 0.5, v - 0.5),
			projectRelative(projection, u + 0.5, v - 0.5),
			projectRelative(projection, u + 0.5, v + 0.5),
			projectRelative(projection, u - 0.5, v + 0.5)
		]
	}

	function projectRelative(projection, u, v) {
		return [
			u * projection.ux + v * projection.vx,
			u * projection.uy + v * projection.vy
		]
	}

	function createEmptyBounds() {
		return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
	}

	function extendBounds(bounds, points) {
		if (points && Object.prototype.hasOwnProperty.call(points, 'minX')) {
			if (Number.isFinite(points.minX) && points.minX < bounds.minX) bounds.minX = points.minX
			if (Number.isFinite(points.minY) && points.minY < bounds.minY) bounds.minY = points.minY
			if (Number.isFinite(points.maxX) && points.maxX > bounds.maxX) bounds.maxX = points.maxX
			if (Number.isFinite(points.maxY) && points.maxY > bounds.maxY) bounds.maxY = points.maxY
			return
		}
		for (let i = 0; i < points.length; i++) {
			const x = Number(points[i][0])
			const y = Number(points[i][1])
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue
			if (x < bounds.minX) bounds.minX = x
			if (y < bounds.minY) bounds.minY = y
			if (x > bounds.maxX) bounds.maxX = x
			if (y > bounds.maxY) bounds.maxY = y
		}
	}

	function normalizeBounds(bounds) {
		if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) return null
		return bounds
	}

	function addPolygon(path, points) {
		path.moveTo(points[0][0], points[0][1])
		for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1])
		path.closePath()
	}

	function fillShape(ctx, path, cells) {
		if (path) {
			ctx.fill(path)
			return
		}
		if (!cells) return
		for (let i = 0; i < cells.length; i++) fillPolygon(ctx, cells[i])
	}

	function fillPolygon(ctx, points) {
		ctx.beginPath()
		ctx.moveTo(points[0][0], points[0][1])
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
		ctx.closePath()
		ctx.fill()
	}

	function getFillColor(game, canPlace) {
		if (!canPlace) return 'rgba(236, 20, 1, 0.04)'
		return game.plane ? 'rgba(255, 255, 255, 0.045)' : 'rgba(9, 211, 80, 0.04)'
	}

	function getCenterColor(game, canPlace) {
		if (!canPlace) return 'rgba(236, 20, 1, 0.12)'
		return game.plane ? 'rgba(255, 255, 255, 0.1)' : 'rgba(9, 211, 80, 0.1)'
	}

	function recordRenderProbe(state, duration) {
		const screenBounds = getScreenBounds(state)
		const overflow = getOverflow(screenBounds, state.width, state.height)
		stats.renders++
		stats.pathFills++
		stats.lastRenderMs = duration
		stats.totalRenderMs += duration
		stats.maxRenderMs = Math.max(stats.maxRenderMs, duration)
		stats.lastRadius = state.shape.radius
		stats.lastCellCount = state.shape.cellCount
		stats.lastKey = state.shape.key
		stats.lastBounds = copyBounds(state.shape.bounds)
		stats.lastScreenBounds = screenBounds
		stats.lastViewport = { width: state.width, height: state.height }
		stats.lastOverflow = overflow
		if (overflow.any) stats.overflowFrames++
		else stats.insideFrames++
	}

	function getScreenBounds(state) {
		const bounds = state.shape?.bounds
		if (!bounds) return null
		return {
			minX: roundNumber(state.x + bounds.minX, 2),
			minY: roundNumber(state.y + bounds.minY, 2),
			maxX: roundNumber(state.x + bounds.maxX, 2),
			maxY: roundNumber(state.y + bounds.maxY, 2),
			width: roundNumber(bounds.maxX - bounds.minX, 2),
			height: roundNumber(bounds.maxY - bounds.minY, 2)
		}
	}

	function getOverflow(bounds, width, height) {
		if (!bounds) return { any: false }
		const left = Math.max(0, -bounds.minX)
		const top = Math.max(0, -bounds.minY)
		const right = Math.max(0, bounds.maxX - width)
		const bottom = Math.max(0, bounds.maxY - height)
		return {
			any: left > 0 || top > 0 || right > 0 || bottom > 0,
			left: roundNumber(left, 2),
			top: roundNumber(top, 2),
			right: roundNumber(right, 2),
			bottom: roundNumber(bottom, 2)
		}
	}

	function getStatsSnapshot() {
		return Object.assign({}, stats, {
			avgRenderMs: stats.renders ? roundNumber(stats.totalRenderMs / stats.renders, 4) : 0,
			avgShapeBuildMs: stats.shapeBuilds ? roundNumber(stats.totalShapeBuildMs / stats.shapeBuilds, 4) : 0,
			avgShapeBuildChunkMs: stats.shapeBuildChunks ? roundNumber(stats.totalShapeBuildChunkMs / stats.shapeBuildChunks, 4) : 0,
			avgWebglBuildMs: stats.webglBuilds ? roundNumber(stats.totalWebglBuildMs / stats.webglBuilds, 4) : 0,
			avgUpdateLoopMs: stats.updateLoopCalls ? roundNumber(stats.totalUpdateLoopMs / stats.updateLoopCalls, 4) : 0,
			avgUpdateCycleMs: stats.updateCycleCalls ? roundNumber(stats.totalUpdateCycleMs / stats.updateCycleCalls, 4) : 0,
			updateMethods: getLoopMethodSnapshot(),
			updateMethodsSummary: summarizeLoopMethods(getLoopMethodSnapshot()),
			overflowRate: stats.renders ? roundNumber(stats.overflowFrames / stats.renders, 4) : 0,
			building: false,
			monitoring: !!monitorTimer,
			drawMode: probeDrawMode,
			lastRenderMs: roundNumber(stats.lastRenderMs, 4),
			maxRenderMs: roundNumber(stats.maxRenderMs, 4),
			lastShapeBuildMs: roundNumber(stats.lastShapeBuildMs, 4),
			maxShapeBuildMs: roundNumber(stats.maxShapeBuildMs, 4),
			lastShapeBuildChunkMs: roundNumber(stats.lastShapeBuildChunkMs, 4),
			maxShapeBuildChunkMs: roundNumber(stats.maxShapeBuildChunkMs, 4),
			lastWebglBuildMs: roundNumber(stats.lastWebglBuildMs, 4),
			maxWebglBuildMs: roundNumber(stats.maxWebglBuildMs, 4),
			lastUpdateLoopMs: roundNumber(stats.lastUpdateLoopMs, 4),
			maxUpdateLoopMs: roundNumber(stats.maxUpdateLoopMs, 4),
			lastUpdateLoopGapMs: roundNumber(stats.lastUpdateLoopGapMs, 4),
			maxUpdateLoopGapMs: roundNumber(stats.maxUpdateLoopGapMs, 4),
			lastUpdateCycleMs: roundNumber(stats.lastUpdateCycleMs, 4),
			maxUpdateCycleMs: roundNumber(stats.maxUpdateCycleMs, 4),
			lastUpdateSpan: roundNumber(stats.lastUpdateSpan, 4),
			maxUpdateSpan: roundNumber(stats.maxUpdateSpan, 4)
		})
	}

	function startMonitor(options = {}) {
		const intervalMs = normalizeMonitorInterval(options)
		const shouldReset = typeof options === 'object' && options?.reset === true
		const shouldClearShape = typeof options === 'object' && options?.clearShape === true
		if (shouldReset) resetStats()
		if (shouldClearShape) cachedPreviewShape = null
		if (typeof options === 'object' && Object.prototype.hasOwnProperty.call(options, 'drawMode')) {
			probeDrawMode = normalizeDrawMode(options.drawMode)
		}
		stopMonitor({ silent: true })
		loopProbe.active = true
		monitorPreviousSnapshot = getStatsSnapshot()
		monitorPreviousAt = now()
		startRafMonitor()
		monitorTimer = setInterval(logMonitorSnapshot, intervalMs)
		return { monitoring: true, intervalMs, snapshot: monitorPreviousSnapshot }
	}

	function stopMonitor(options = {}) {
		if (monitorTimer) {
			clearInterval(monitorTimer)
			monitorTimer = null
		}
		stopRafMonitor()
		const snapshot = getStatsSnapshot()
		loopProbe.active = false
		monitorPreviousSnapshot = snapshot
		monitorPreviousAt = now()
		const result = { monitoring: false, snapshot }
		if (!options?.silent) logMonitorMessage('stopped', result)
		return result
	}

	function logMonitorSnapshot() {
		const previous = monitorPreviousSnapshot || getStatsSnapshot()
		const previousAt = monitorPreviousAt || now()
		const currentAt = now()
		const current = getStatsSnapshot()
		const delta = getMonitorDelta(previous, current, currentAt - previousAt)
		monitorPreviousSnapshot = current
		monitorPreviousAt = currentAt
		logMonitorMessage('sample', delta)
		return delta
	}

	function getMonitorDelta(previous, current, elapsedMs) {
		const rafFrames = current.rafFrames - previous.rafFrames
		const renders = current.renders - previous.renders
		const frames = current.frames - previous.frames
		const renderMs = current.totalRenderMs - previous.totalRenderMs
		const builds = current.shapeBuilds - previous.shapeBuilds
		const buildMs = current.totalShapeBuildMs - previous.totalShapeBuildMs
		const chunks = current.shapeBuildChunks - previous.shapeBuildChunks
		const chunkMs = current.totalShapeBuildChunkMs - previous.totalShapeBuildChunkMs
		const webglBuilds = current.webglBuilds - previous.webglBuilds
		const webglBuildMs = current.totalWebglBuildMs - previous.totalWebglBuildMs
		const overflowFrames = current.overflowFrames - previous.overflowFrames
		const updateLoops = current.updateLoopCalls - previous.updateLoopCalls
		const updateLoopMs = current.totalUpdateLoopMs - previous.totalUpdateLoopMs
		const updateCycles = current.updateCycleCalls - previous.updateCycleCalls
		const updateCycleMs = current.totalUpdateCycleMs - previous.totalUpdateCycleMs
		const updateMethods = getLoopMethodDelta(previous.updateMethods, current.updateMethods)
		const elapsedSeconds = Math.max(0.001, elapsedMs / 1000)
		return {
			elapsedMs: roundNumber(elapsedMs, 2),
			rafFrames,
			rafHz: roundNumber(rafFrames / elapsedSeconds, 3),
			frames,
			renders,
			renderHz: roundNumber(frames / elapsedSeconds, 3),
			callbackHz: roundNumber(renders / elapsedSeconds, 3),
			drawMode: current.drawMode,
			rangeDraws: current.rangeDraws - previous.rangeDraws,
			webglDraws: current.webglDraws - previous.webglDraws,
			webglFallbacks: current.webglFallbacks - previous.webglFallbacks,
			approximateDraws: current.approximateDraws - previous.approximateDraws,
			centerFills: current.centerFills - previous.centerFills,
			boundsDraws: current.boundsDraws - previous.boundsDraws,
			drawSkips: current.drawSkips - previous.drawSkips,
			avgRenderMs: renders ? roundNumber(renderMs / renders, 4) : 0,
			totalRenderMs: roundNumber(renderMs, 4),
			shapeBuildStarts: current.shapeBuildStarts - previous.shapeBuildStarts,
			shapeBuilds: builds,
			avgShapeBuildMs: builds ? roundNumber(buildMs / builds, 4) : 0,
			totalShapeBuildMs: roundNumber(buildMs, 4),
			maxShapeBuildMs: current.maxShapeBuildMs,
			shapeBuildChunks: chunks,
			avgShapeBuildChunkMs: chunks ? roundNumber(chunkMs / chunks, 4) : 0,
			maxShapeBuildChunkMs: current.maxShapeBuildChunkMs,
			webglBuilds,
			avgWebglBuildMs: webglBuilds ? roundNumber(webglBuildMs / webglBuilds, 4) : 0,
			totalWebglBuildMs: roundNumber(webglBuildMs, 4),
			maxWebglBuildMs: current.maxWebglBuildMs,
			updateLoopCalls: updateLoops,
			updateLoopHz: roundNumber(updateLoops / elapsedSeconds, 3),
			avgUpdateLoopMs: updateLoops ? roundNumber(updateLoopMs / updateLoops, 4) : 0,
			totalUpdateLoopMs: roundNumber(updateLoopMs, 4),
			maxUpdateLoopMs: current.maxUpdateLoopMs,
			lastUpdateLoopGapMs: current.lastUpdateLoopGapMs,
			maxUpdateLoopGapMs: current.maxUpdateLoopGapMs,
			updateCycleCalls: updateCycles,
			updateCycleHz: roundNumber(updateCycles / elapsedSeconds, 3),
			silentUpdateCycleCalls: current.silentUpdateCycleCalls - previous.silentUpdateCycleCalls,
			avgUpdateCycleMs: updateCycles ? roundNumber(updateCycleMs / updateCycles, 4) : 0,
			totalUpdateCycleMs: roundNumber(updateCycleMs, 4),
			maxUpdateCycleMs: current.maxUpdateCycleMs,
			lastUpdateSpan: current.lastUpdateSpan,
			maxUpdateSpan: current.maxUpdateSpan,
			updateMethods,
			updateMethodsSummary: summarizeLoopMethods(updateMethods),
			skippedWhileBuilding: current.skippedWhileBuilding - previous.skippedWhileBuilding,
			overflowRate: renders ? roundNumber(overflowFrames / renders, 4) : 0,
			building: current.building,
			lastRadius: current.lastRadius,
			lastCellCount: current.lastCellCount,
			lastShapeBuildProgress: current.lastShapeBuildProgress,
			lastOverflow: current.lastOverflow
		}
	}

	function getLoopMethodSnapshot() {
		const rows = []
		for (let i = 0; i < loopProbeMethodNames.length; i++) {
			const methodName = loopProbeMethodNames[i]
			const entry = loopProbe.methods[methodName]
			if (!entry) continue
			rows.push({
				method: methodName,
				calls: entry.calls,
				totalMs: roundNumber(entry.totalMs, 4),
				avgMs: entry.calls ? roundNumber(entry.totalMs / entry.calls, 4) : 0,
				maxMs: roundNumber(entry.maxMs, 4),
				lastMs: roundNumber(entry.lastMs, 4)
			})
		}
		rows.sort(function (a, b) { return b.totalMs - a.totalMs })
		return rows
	}

	function summarizeLoopMethods(rows) {
		if (!Array.isArray(rows) || !rows.length) return ''
		return rows.slice(0, 5).map(function (row) {
			return row.method + ' total=' + row.totalMs + 'ms avg=' + row.avgMs + 'ms calls=' + row.calls
		}).join(' | ')
	}

	function normalizeDrawMode(mode) {
		const value = String(mode || '').trim()
		return drawModes.indexOf(value) >= 0 ? value : drawModeNormal
	}

	function getLoopMethodDelta(previousRows, currentRows) {
		const previousByName = rowsByMethod(previousRows)
		const rows = []
		for (let i = 0; i < currentRows.length; i++) {
			const current = currentRows[i]
			const previous = previousByName[current.method] || { calls: 0, totalMs: 0 }
			const calls = current.calls - previous.calls
			const totalMs = current.totalMs - previous.totalMs
			if (!calls && !totalMs) continue
			rows.push({
				method: current.method,
				calls,
				avgMs: calls ? roundNumber(totalMs / calls, 4) : 0,
				totalMs: roundNumber(totalMs, 4),
				maxMs: current.maxMs,
				lastMs: current.lastMs
			})
		}
		rows.sort(function (a, b) { return b.totalMs - a.totalMs })
		return rows
	}

	function rowsByMethod(rows) {
		const map = Object.create(null)
		if (!Array.isArray(rows)) return map
		for (let i = 0; i < rows.length; i++) map[rows[i].method] = rows[i]
		return map
	}

	function startRafMonitor() {
		stopRafMonitor()
		if (typeof requestAnimationFrame !== 'function') return
		const tick = function () {
			stats.rafFrames++
			monitorRafTimer = requestAnimationFrame(tick)
		}
		monitorRafTimer = requestAnimationFrame(tick)
	}

	function stopRafMonitor() {
		if (!monitorRafTimer) return
		if (typeof cancelAnimationFrame === 'function') {
			try { cancelAnimationFrame(monitorRafTimer) } catch (error) {}
		}
		monitorRafTimer = null
	}

	function normalizeMonitorInterval(options) {
		const value = typeof options === 'number' ? options : options?.intervalMs
		const number = Number(value)
		if (!Number.isFinite(number) || number <= 0) return 1000
		return Math.max(250, Math.min(10000, Math.round(number)))
	}

	function logMonitorMessage(kind, payload) {
		try {
			console.info('[Tweaks] Scan range preview probe ' + kind, payload)
		} catch (error) {}
	}

	function resetStats() {
		for (const key in stats) {
			if (typeof stats[key] === 'number') stats[key] = 0
			else stats[key] = null
		}
		stats.lastKey = ''
		loopProbe.lastUpdateLoopAt = 0
		loopProbe.methods = Object.create(null)
	}

	function copyBounds(bounds) {
		if (!bounds) return null
		return {
			minX: roundNumber(bounds.minX, 2),
			minY: roundNumber(bounds.minY, 2),
			maxX: roundNumber(bounds.maxX, 2),
			maxY: roundNumber(bounds.maxY, 2)
		}
	}

	function now() {
		return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
	}

	function roundNumber(value, digits = 3) {
		if (!Number.isFinite(value)) return 0
		const factor = Math.pow(10, digits)
		return Math.round(value * factor) / factor
	}
})()
