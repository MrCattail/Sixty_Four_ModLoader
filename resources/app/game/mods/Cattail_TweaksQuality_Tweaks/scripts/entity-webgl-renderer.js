(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailEntityWebGLRendererInstalled'
	const apiKey = 'CattailTweaksEntityWebGLRenderer'
	const configKey = 'enableExperimentalEntityWebGLRecorder'
	const defaultPreviewLimit = 80
	const defaultSampleLimit = 240
	const maxPreviewLimit = 500
	const maxSampleLimit = 5000
	const replayBatchQuadLimit = 4096
	const defaultStaticAtlasPageSize = 2048
	const staticAtlasPadding = 1
	const defaultDynamicAtlasPageSize = 2048
	const defaultDynamicAtlasMaxPages = 8
	const dynamicAtlasPadding = 1
	const dynamicEntryIdleFrameLimit = 240
	const dynamicEntrySweepInterval = 60
	const maxSourceDiagnosticEntries = 2000
	const replacementReplayOrder = 19
	const replacementReplayZIndex = 19
	const replacementSourceLayerId = 'entity-webgl-source'
	const dynamicSourceMutationMethods = [
		'clearRect',
		'drawImage',
		'fill',
		'fillRect',
		'fillText',
		'putImageData',
		'reset',
		'stroke',
		'strokeRect',
		'strokeText'
	]
	const replacementContextStateProperties = [
		'direction', 'fillStyle', 'filter', 'font', 'fontKerning', 'fontStretch', 'fontVariantCaps',
		'globalAlpha', 'globalCompositeOperation', 'imageSmoothingEnabled', 'imageSmoothingQuality',
		'letterSpacing', 'lineCap', 'lineDashOffset', 'lineJoin', 'lineWidth', 'miterLimit',
		'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'strokeStyle',
		'textAlign', 'textBaseline', 'textRendering', 'wordSpacing'
	]
	const sourceIds = new WeakMap()
	const targetIds = new WeakMap()
	const sourceTotals = new Map()
	const unsupportedTotals = new Map()
	const operationTotals = new Map()
	const targetTotals = new Map()
	const gradientMetadata = new WeakMap()
	const samples = []
	const replaySamples = []
	let sourceId = 0
	let targetId = 0
	let previewEnabled = null
	let runtimeEnabled = null
	let previewLimit = defaultPreviewLimit
	let sampleLimit = defaultSampleLimit
	let activeGame = null
	let currentFrame = null
	let lastFrame = null
	let lastReplay = null
	let replayEnabled = false
	let replayVisible = false
	let replayOpacity = 0.55
	let replayRenderer = null
	let replayFrameId = 0
	let replayStaticAtlasEnabled = true
	let replayStaticAtlasPageSize = defaultStaticAtlasPageSize
	let replayDynamicAtlasEnabled = true
	let replayDynamicTrackingEnabled = true
	let replayDynamicAtlasPageSize = defaultDynamicAtlasPageSize
	let replayDynamicAtlasMaxPages = defaultDynamicAtlasMaxPages
	let replacementRequested = false
	let replacementState = 'off'
	let replacementLastFallback = ''
	let replacementLastResize = null
	let replacementCanvas = null
	let replacementCanvasSize = null
	let replacementContext = null
	let replacementRenderScope = null
	let replacementRenderApi = null
	const replacementStats = {
		attemptedFrames: 0,
		activeFrames: 0,
		fallbacks: 0,
		resizeTransitions: 0
	}

	const stats = {
		frames: 0,
		drawImages: 0,
		supportedDrawImages: 0,
		unsupportedDrawImages: 0,
		polygonFills: 0,
		supportedPolygonFills: 0,
		pathStrokes: 0,
		supportedPathStrokes: 0,
		fillRects: 0,
		supportedFillRects: 0,
		radialGradientFillRects: 0,
		unsupportedPaints: 0,
		adjacentBatches: 0,
		atlasBatches: 0,
		textureSwitches: 0,
		forcedFlushes: 0,
		contextsWrapped: 0,
		contextsSkipped: 0,
		recordingErrors: 0,
		recordingMs: 0,
		maxRecordingMs: 0,
		lastRecordingMs: 0,
		lastFallback: '',
		fallbacks: 0,
		fallbackReasons: {}
	}

	const replayStats = {
		frames: 0,
		commands: 0,
		quads: 0,
		drawCalls: 0,
		textureBinds: 0,
		textureUploads: 0,
		staticUploads: 0,
		dynamicUploads: 0,
		atlasUploads: 0,
		dynamicAtlasUploads: 0,
		dynamicUploadSkips: 0,
		gradientDraws: 0,
		barriers: 0,
		segments: 0,
		skippedCommands: 0,
		skippedTargets: 0,
		uploadErrors: 0,
		errors: 0,
		contextLosses: 0,
		resizes: 0,
		rendererCreates: 0,
		replayMs: 0,
		lastReplayMs: 0,
		maxReplayMs: 0,
		lastError: '',
		lastCanvasSize: { width: 0, height: 0 }
	}

	const unsupportedPaintMethods = [
		'strokeRect',
		'clearRect',
		'fillText',
		'strokeText',
		'putImageData'
	]
	const unsupportedPathMethods = [
		'arcTo',
		'bezierCurveTo',
		'ellipse',
		'quadraticCurveTo',
		'rect',
		'roundRect'
	]

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installEntityCommandRecorder(api)
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
				previewEnabled = detail.value === true
			}, true)
		} catch (error) {}
	}

	function installEntityCommandRecorder(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		installDebugApi(api)
		api.patch(Game.prototype, 'renderEntities', function (original) {
			return function () {
				activeGame = this || activeGame
				if (!isEnabled(api) || currentFrame) return original.apply(this, arguments)
				let replacementFrame = null
				if (replacementRequested) {
					try { replacementFrame = beginReplacementFrame(this) }
					catch (error) { failReplacement('isolation-' + String(error?.message || error || 'unavailable')) }
				}
				const frame = createFrame(this, replacementFrame?.context, replacementFrame?.mainCanvas)
				const restorers = []
				currentFrame = frame
				try {
					wrapTargetContexts(this, frame, restorers)
					return original.apply(this, arguments)
				} catch (error) {
					frame.renderFailed = true
					recordFallback('render-exception')
					throw error
				} finally {
					for (let i = restorers.length - 1; i >= 0; i--) {
						try { restorers[i]() } catch (error) { recordFrameError(frame, 'restore') }
					}
					currentFrame = null
					if (replacementFrame) this.ctx = replacementFrame.mainContext
					let report = null
					try { report = finalizeFrame(frame, replacementFrame?.resized === true) }
					finally {
						if (replacementFrame) finalizeReplacementFrame(replacementFrame, frame, report?.replay)
					}
				}
			}
		})
	}

	function installDebugApi(api) {
		window[apiKey] = {
			enable(options = {}) {
				stopReplacement()
				runtimeEnabled = true
				replayEnabled = options.replay === true
				applyRuntimeOptions(options)
				if (!replayEnabled) destroyReplayRenderer()
				if (options.clear !== false) resetStats()
				return this.stats()
			},
			enableReplay(options = {}) {
				stopReplacement()
				runtimeEnabled = true
				replayEnabled = true
				applyRuntimeOptions(options)
				if (options.clear !== false) resetStats()
				return this.stats()
			},
			enableReplacement(options = {}) {
				stopReplacement()
				runtimeEnabled = true
				replayEnabled = true
				replacementRequested = true
				replacementState = 'warming'
				replacementLastFallback = ''
				replayVisible = false
				replayOpacity = 1
				applyRuntimeOptions(options)
				hideReplayCanvas()
				if (options.clear !== false) resetStats()
				const layerRoutingError = startReplacementLayerRouting(api)
				if (layerRoutingError) failReplacement(layerRoutingError)
				return this.stats()
			},
			disableReplacement() {
				runtimeEnabled = false
				stopReplacement()
				return this.stats()
			},
			disableReplay() {
				stopReplacement()
				return this.stats()
			},
			disable() {
				runtimeEnabled = false
				stopReplacement()
				return this.stats()
			},
			useConfig() {
				runtimeEnabled = null
				stopReplacement()
				return this.stats()
			},
			showReplay(options = {}) {
				if (replacementRequested) {
					replayVisible = replacementState === 'active'
					replayOpacity = 1
				} else {
					replayVisible = true
					const opacity = Number(options.opacity)
					if (Number.isFinite(opacity)) replayOpacity = Math.max(0, Math.min(1, opacity))
				}
				syncReplayCanvasVisibility(replayRenderer)
				return this.stats()
			},
			hideReplay() {
				if (replacementRequested) {
					runtimeEnabled = false
					stopReplacement()
				} else hideReplayCanvas()
				return this.stats()
			},
			replayCanvas() {
				return replayRenderer?.canvas || null
			},
			markSourceDirty(source) {
				return markReplaySourceDirty(source)
			},
			replaySources(options = {}) {
				return getReplaySourceStats(options.limit || options.top || 40)
			},
			destroyReplay() {
				stopReplacement()
				return this.stats()
			},
			clear() {
				resetStats()
				return this.stats()
			},
			resetStats() {
				resetStats()
				return this.stats()
			},
			stats() {
				return getStats(api)
			},
			inspect() {
				return {
					stats: getStats(api),
					lastFrame: cloneValue(lastFrame),
					lastReplay: cloneValue(lastReplay),
					topSources: listMap(sourceTotals, 'source', 20),
					topUnsupported: listMap(unsupportedTotals, 'reason', 20),
					topOperations: listMap(operationTotals, 'operation', 20),
					topTargets: listMap(targetTotals, 'target', 20),
					replaySources: getReplaySourceStats(40)
				}
			},
			snapshot() {
				const renderTiming = window.ModLoader?.render?.timing
				return {
					recorder: this.inspect(),
					renderTiming: renderTiming?.summary?.() || null,
					renderMethods: renderTiming?.methods?.() || []
				}
			}
		}
	}

	function applyRuntimeOptions(options) {
		previewLimit = normalizeLimit(options.preview || options.previewLimit, previewLimit, maxPreviewLimit)
		sampleLimit = normalizeLimit(options.samples || options.sampleLimit, sampleLimit, maxSampleLimit)
		const previousAtlasEnabled = replayStaticAtlasEnabled
		const previousAtlasPageSize = replayStaticAtlasPageSize
		const previousDynamicAtlasEnabled = replayDynamicAtlasEnabled
		const previousDynamicTrackingEnabled = replayDynamicTrackingEnabled
		const previousDynamicAtlasPageSize = replayDynamicAtlasPageSize
		const previousDynamicAtlasMaxPages = replayDynamicAtlasMaxPages
		if (Object.prototype.hasOwnProperty.call(options, 'staticAtlas')) replayStaticAtlasEnabled = options.staticAtlas !== false
		if (Object.prototype.hasOwnProperty.call(options, 'atlas')) replayStaticAtlasEnabled = options.atlas !== false
		if (Object.prototype.hasOwnProperty.call(options, 'atlasSize') || Object.prototype.hasOwnProperty.call(options, 'staticAtlasSize')) {
			replayStaticAtlasPageSize = normalizeAtlasPageSize(options.atlasSize || options.staticAtlasSize)
		}
		if (Object.prototype.hasOwnProperty.call(options, 'dynamicAtlas')) replayDynamicAtlasEnabled = options.dynamicAtlas !== false
		if (Object.prototype.hasOwnProperty.call(options, 'dynamicPages')) replayDynamicAtlasEnabled = options.dynamicPages !== false
		if (Object.prototype.hasOwnProperty.call(options, 'dynamicTracking')) replayDynamicTrackingEnabled = options.dynamicTracking !== false
		if (Object.prototype.hasOwnProperty.call(options, 'trackDynamicSources')) replayDynamicTrackingEnabled = options.trackDynamicSources !== false
		if (Object.prototype.hasOwnProperty.call(options, 'dynamicAtlasSize') || Object.prototype.hasOwnProperty.call(options, 'dynamicPageSize')) {
			replayDynamicAtlasPageSize = normalizeAtlasPageSize(options.dynamicAtlasSize || options.dynamicPageSize)
		}
		if (Object.prototype.hasOwnProperty.call(options, 'dynamicAtlasMaxPages')) {
			replayDynamicAtlasMaxPages = normalizeDynamicAtlasMaxPages(options.dynamicAtlasMaxPages)
		}
		if (replayRenderer && (
			previousAtlasEnabled !== replayStaticAtlasEnabled ||
			previousAtlasPageSize !== replayStaticAtlasPageSize ||
			previousDynamicAtlasEnabled !== replayDynamicAtlasEnabled ||
			previousDynamicTrackingEnabled !== replayDynamicTrackingEnabled ||
			previousDynamicAtlasPageSize !== replayDynamicAtlasPageSize ||
			previousDynamicAtlasMaxPages !== replayDynamicAtlasMaxPages
		)) destroyReplayRenderer()
	}

	function createFrame(game, recordingContext, replayTargetCanvas) {
		const targetContext = recordingContext || game?.ctx || null
		const replayTarget = replayTargetCanvas || game?.ctx?.canvas || null
		return {
			drawImages: 0,
			supportedDrawImages: 0,
			unsupportedDrawImages: 0,
			polygonFills: 0,
			supportedPolygonFills: 0,
			pathStrokes: 0,
			supportedPathStrokes: 0,
			fillRects: 0,
			supportedFillRects: 0,
			radialGradientFillRects: 0,
			unsupportedPaints: 0,
			unsupportedPaintDiagnostics: [],
			adjacentBatches: 0,
			atlasBatches: 0,
			textureSwitches: 0,
			forcedFlushes: 0,
			contextsWrapped: 0,
			contextsSkipped: 0,
			recordingErrors: 0,
			recordingMs: 0,
			currentBatchKey: '',
			currentSourceKey: '',
			supportedRunOpen: false,
			sources: new Set(),
			targets: new Set(),
			sourceCounts: new Map(),
			unsupportedCounts: new Map(),
			operationCounts: new Map(),
			targetCounts: new Map(),
			commands: [],
			replayCommands: replayEnabled ? [] : null,
			replayTarget,
			replayTargetKey: replayTarget && targetContext ? getTargetKey(targetContext) : '',
			replaySkippedTargets: 0,
			sourceRefs: replayEnabled ? new Map() : null
		}
	}

	function beginReplacementFrame(game) {
		const layerRoutingError = getReplacementLayerRoutingError(game)
		if (layerRoutingError) throw new Error(layerRoutingError)
		const mainContext = game?.ctx
		const mainCanvas = mainContext?.canvas
		if (!mainContext || !mainCanvas) throw new Error('main-canvas-unavailable')
		if (typeof document === 'undefined' || typeof document.createElement !== 'function') throw new Error('document-unavailable')
		const width = Math.max(1, Math.floor(Number(mainCanvas.width) || 0))
		const height = Math.max(1, Math.floor(Number(mainCanvas.height) || 0))
		const previousWidth = replacementCanvasSize?.width || 0
		const previousHeight = replacementCanvasSize?.height || 0
		const resized = !!replacementCanvasSize && (previousWidth !== width || previousHeight !== height)
		replacementCanvasSize = { width, height }
		if (!replacementCanvas) {
			replacementCanvas = document.createElement('canvas')
			replacementCanvas.dataset.cattailEntityWebglReplacement = 'true'
			replacementCanvas.setAttribute('aria-hidden', 'true')
		}
		if (replacementCanvas.width !== width) replacementCanvas.width = width
		if (replacementCanvas.height !== height) replacementCanvas.height = height
		let context = replacementCanvas.getContext('2d')
		if (!context) throw new Error('isolation-context-unavailable')
		if (typeof context.reset === 'function') context.reset()
		else {
			replacementCanvas.width = width
			replacementCanvas.height = height
			context = replacementCanvas.getContext('2d')
			if (!context) throw new Error('isolation-context-reset-failed')
		}
		replacementContext = context
		context.setTransform(1, 0, 0, 1, 0, 0)
		context.clearRect(0, 0, width, height)
		copyReplacementContextState(mainContext, context)
		const transform = mainContext.getTransform?.()
		if (!transform) throw new Error('main-transform-unavailable')
		context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
		game.ctx = context
		replacementStats.attemptedFrames++
		return {
			game,
			mainContext,
			mainCanvas,
			context,
			canvas: replacementCanvas,
			resized,
			previousSize: { width: previousWidth, height: previousHeight },
			canvasSize: { width, height }
		}
	}

	function copyReplacementContextState(source, target) {
		for (const property of replacementContextStateProperties) {
			try {
				if (property in source && property in target) target[property] = source[property]
			} catch (error) {}
		}
		try {
			if (typeof source.getLineDash === 'function' && typeof target.setLineDash === 'function') target.setLineDash(source.getLineDash())
		} catch (error) {}
	}

	function finalizeReplacementFrame(session, frame, replayReport) {
		if (session?.resized) return finalizeReplacementResizeFrame(session)
		let reason = getReplacementUnsafeReason(session, frame, replayReport)
		if (!reason) {
			try {
				replayVisible = true
				replayOpacity = 1
				syncReplayCanvasVisibility(replayRenderer)
				if (!isReplacementReplayLayerReady(session?.mainCanvas)) reason = 'replay-layer-unavailable'
				else if (!replayRenderer?.canvas?.isConnected) reason = 'replay-canvas-detached'
			} catch (error) {
				reason = 'replay-visibility-' + String(error?.message || error || 'failed')
			}
		}
		if (!reason) {
			replacementState = 'active'
			replacementStats.activeFrames++
			return true
		}
		let fallbackReason = reason
		try { compositeReplacementFrame(session) }
		catch (error) { fallbackReason += '+composite-' + String(error?.message || error || 'failed') }
		failReplacement(fallbackReason)
		return false
	}

	function finalizeReplacementResizeFrame(session) {
		let failure = ''
		try {
			hideReplayCanvas()
			if (replayRenderer) syncReplayRenderer(replayRenderer, session.mainCanvas)
			compositeReplacementFrame(session)
		} catch (error) {
			failure = String(error?.message || error || 'failed')
		}
		if (failure) {
			failReplacement('resize-transition-' + failure)
			return false
		}
		replacementState = 'warming'
		replacementStats.resizeTransitions++
		replacementLastResize = {
			from: Object.assign({}, session.previousSize),
			to: Object.assign({}, session.canvasSize)
		}
		return false
	}

	function getReplacementUnsafeReason(session, frame, replayReport) {
		if (!replacementRequested) return 'replacement-disabled'
		if (frame?.renderFailed) return 'entity-render-failed'
		if (frame?.recordingErrors) return 'recording-errors'
		if (frame?.unsupportedDrawImages) return 'unsupported-draw-image'
		if (frame?.unsupportedPaints) return 'unsupported-paint'
		if (!replayReport) return 'missing-replay-report'
		if (replayReport.errors) return replayReport.error || 'replay-error'
		if (replayReport.uploadErrors) return 'upload-error'
		if (replayReport.skippedCommands) return 'skipped-command'
		if (replayReport.skippedTargets) return 'skipped-target'
		if (!replayRenderer?.gl || replayRenderer.contextLost) return 'webgl-context-unavailable'
		if (replayReport.canvasSize?.width !== session.mainCanvas.width || replayReport.canvasSize?.height !== session.mainCanvas.height) return 'replay-size-mismatch'
		return ''
	}

	function compositeReplacementFrame(session) {
		const context = session?.mainContext
		const canvas = session?.canvas
		if (!context || !canvas) throw new Error('fallback-surface-unavailable')
		context.save()
		try {
			context.setTransform(1, 0, 0, 1, 0, 0)
			context.globalAlpha = 1
			context.globalCompositeOperation = 'source-over'
			context.filter = 'none'
			context.shadowBlur = 0
			context.shadowOffsetX = 0
			context.shadowOffsetY = 0
			context.drawImage(canvas, 0, 0)
		} finally {
			context.restore()
		}
	}

	function failReplacement(reason) {
		replacementRequested = false
		replacementState = 'fallback'
		replacementLastFallback = String(reason || 'unknown')
		replacementStats.fallbacks++
		runtimeEnabled = false
		replayEnabled = false
		stopReplacementLayerRouting()
		hideReplayCanvas()
		destroyReplayRenderer()
		destroyReplacementSurface()
		recordFallback('replacement-' + replacementLastFallback)
	}

	function stopReplacement() {
		replacementRequested = false
		replacementState = 'off'
		replayEnabled = false
		stopReplacementLayerRouting()
		hideReplayCanvas()
		destroyReplayRenderer()
		destroyReplacementSurface()
	}

	function startReplacementLayerRouting(api) {
		stopReplacementLayerRouting()
		const renderApi = api?.render || window.ModLoader?.render
		if (!renderApi || typeof renderApi.createScope !== 'function') return 'render-layer-api-unavailable'
		if (typeof renderApi.isEnabled !== 'function' || !renderApi.isEnabled()) return 'render-layer-api-disabled'
		let scope = null
		try {
			scope = renderApi.createScope()
			if (!scope || typeof scope.demandLayer !== 'function' || typeof scope.routeMethod !== 'function') {
				try { scope?.dispose?.() } catch (disposeError) {}
				return 'render-layer-scope-unavailable'
			}
			scope.demandLayer('buildings', { id: 'entity-webgl-underlay', enabled: function () { return replacementRequested } })
			scope.routeMethod('renderConductors', 'buildings')
			scope.routeMethod('renderChasmVFX', 'buildings')
			scope.routeMethod('renderEntities', replacementSourceLayerId)
			replacementRenderScope = scope
			replacementRenderApi = renderApi
			return ''
		} catch (error) {
			try { scope?.dispose?.() } catch (disposeError) {}
			return 'render-layer-setup-' + String(error?.message || error || 'failed')
		}
	}

	function stopReplacementLayerRouting() {
		const scope = replacementRenderScope
		replacementRenderScope = null
		replacementRenderApi = null
		try { scope?.dispose?.() } catch (error) { recordFallback('render-layer-cleanup') }
	}

	function getReplacementLayerRoutingError(game) {
		const renderApi = replacementRenderApi
		if (!replacementRenderScope || !renderApi) return 'render-layer-scope-unavailable'
		try {
			if (typeof renderApi.isEnabled !== 'function' || !renderApi.isEnabled()) return 'render-layer-api-disabled'
			if (renderApi.getMethodLayer?.('renderConductors') !== 'buildings') return 'render-conductors-route-changed'
			if (renderApi.getMethodLayer?.('renderChasmVFX') !== 'buildings') return 'render-chasm-vfx-route-changed'
			if (renderApi.getMethodLayer?.('renderEntities') !== replacementSourceLayerId) return 'render-entities-route-changed'
			if (!renderApi.isLayerDemanded?.('buildings')) return 'buildings-layer-not-demanded'
			if (!renderApi.isLayerDemanded?.('background')) return 'background-layer-not-demanded'
			if (game?.ctx?.canvas?.parentNode?.id !== 'modloader-render-stack') return 'render-stack-unavailable'
		} catch (error) {
			return 'render-layer-check-' + String(error?.message || error || 'failed')
		}
		return ''
	}

	function destroyReplacementSurface() {
		try {
			if (replacementCanvas) {
				replacementCanvas.width = 1
				replacementCanvas.height = 1
			}
		} catch (error) {}
		replacementCanvas = null
		replacementCanvasSize = null
		replacementContext = null
	}

	function wrapTargetContexts(game, frame, restorers) {
		const contexts = []
		const seen = new Set()
		pushContext(contexts, seen, game?.ctx)
		try {
			const canvases = typeof document !== 'undefined' && typeof document.querySelectorAll === 'function'
				? document.querySelectorAll('canvas')
				: []
			for (const canvas of canvases) {
				let ctx = null
				try { ctx = canvas?.getContext?.('2d') || null } catch (error) {}
				pushContext(contexts, seen, ctx)
			}
		} catch (error) {
			recordFrameError(frame, 'canvas-enumeration')
		}
		for (const ctx of contexts) wrapContext(ctx, frame, restorers)
	}

	function pushContext(contexts, seen, ctx) {
		if (!ctx || seen.has(ctx)) return
		seen.add(ctx)
		contexts.push(ctx)
	}

	function wrapContext(ctx, frame, restorers) {
		const meta = { clipActive: false, clipStack: [], path: null }
		let wrapped = 0
		wrapped += wrapGradientFactory(ctx, 'createLinearGradient', 'linear', restorers, frame)
		wrapped += wrapGradientFactory(ctx, 'createRadialGradient', 'radial', restorers, frame)
		wrapped += wrapContextMethod(ctx, 'drawImage', function (args) {
			recordTimed(frame, function () { recordDrawImage(frame, ctx, meta, args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'beginPath', function () {
			recordTimed(frame, function () { meta.path = { subpaths: [], current: null, unsupported: '' } })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'moveTo', function (args) {
			recordTimed(frame, function () { recordPathPoint(meta, ctx, 'moveTo', args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'lineTo', function (args) {
			recordTimed(frame, function () { recordPathPoint(meta, ctx, 'lineTo', args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'arc', function (args) {
			recordTimed(frame, function () { recordPathArc(meta, ctx, args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'closePath', function () {
			recordTimed(frame, function () { recordPathClose(meta) })
		}, restorers, frame)
		for (const methodName of unsupportedPathMethods) {
			wrapped += wrapContextMethod(ctx, methodName, function () {
				recordTimed(frame, function () { recordUnsupportedPath(meta, methodName) })
			}, restorers, frame)
		}
		wrapped += wrapContextMethod(ctx, 'fill', function (args) {
			recordTimed(frame, function () { recordPolygonFill(frame, ctx, meta, args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'stroke', function (args) {
			recordTimed(frame, function () { recordPathStroke(frame, ctx, meta, args) })
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'fillRect', function (args) {
			recordTimed(frame, function () { recordFillRect(frame, ctx, meta, args) })
		}, restorers, frame)
		for (const methodName of unsupportedPaintMethods) {
			wrapped += wrapContextMethod(ctx, methodName, function (args) {
				recordTimed(frame, function () { recordUnsupportedPaint(frame, ctx, methodName, args) })
			}, restorers, frame)
		}
		wrapped += wrapContextMethod(ctx, 'save', function () {
			meta.clipStack.push(meta.clipActive)
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'restore', function () {
			meta.clipActive = meta.clipStack.length ? meta.clipStack.pop() : false
		}, restorers, frame)
		wrapped += wrapContextMethod(ctx, 'clip', function () {
			meta.clipActive = true
			recordTimed(frame, function () { recordStateBarrier(frame, ctx, 'clip') })
		}, restorers, frame)
		if (wrapped) frame.contextsWrapped++
		else frame.contextsSkipped++
	}

	function wrapContextMethod(ctx, methodName, beforeCall, restorers, frame) {
		const original = ctx?.[methodName]
		if (typeof original !== 'function') return 0
		const wrapper = function () {
			if (currentFrame === frame) {
				try { beforeCall(Array.from(arguments)) } catch (error) { recordFrameError(frame, methodName) }
			}
			return original.apply(this, arguments)
		}
		try {
			ctx[methodName] = wrapper
		} catch (error) {
			recordFrameError(frame, 'wrap-' + methodName)
			return 0
		}
		if (ctx[methodName] !== wrapper) return 0
		restorers.push(function () {
			if (ctx[methodName] === wrapper) ctx[methodName] = original
		})
		return 1
	}

	function wrapGradientFactory(ctx, methodName, type, restorers, frame) {
		const original = ctx?.[methodName]
		if (typeof original !== 'function') return 0
		const wrapper = function () {
			const args = Array.from(arguments)
			const gradient = original.apply(this, arguments)
			if (currentFrame === frame && gradient && (typeof gradient === 'object' || typeof gradient === 'function')) {
				const metadata = {
					type,
					args: args.map(Number),
					transform: getTransform(this),
					stops: [],
					tracked: false,
					invalid: false
				}
				gradientMetadata.set(gradient, metadata)
				metadata.tracked = wrapGradientColorStops(gradient, metadata, restorers, frame)
			}
			return gradient
		}
		try { ctx[methodName] = wrapper } catch (error) {
			recordFrameError(frame, 'wrap-' + methodName)
			return 0
		}
		if (ctx[methodName] !== wrapper) return 0
		restorers.push(function () {
			if (ctx[methodName] === wrapper) ctx[methodName] = original
		})
		return 1
	}

	function wrapGradientColorStops(gradient, metadata, restorers, frame) {
		const original = gradient?.addColorStop
		if (typeof original !== 'function') return false
		const hadOwn = Object.prototype.hasOwnProperty.call(gradient, 'addColorStop')
		const wrapper = function (offset, color) {
			const result = original.apply(this, arguments)
			if (currentFrame === frame) {
				const normalizedOffset = Number(offset)
				if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0 || normalizedOffset > 1 || typeof color !== 'string') metadata.invalid = true
				else metadata.stops.push({ offset: normalizedOffset, color })
			}
			return result
		}
		try { gradient.addColorStop = wrapper } catch (error) { return false }
		if (gradient.addColorStop !== wrapper) return false
		restorers.push(function () {
			if (gradient.addColorStop !== wrapper) return
			try {
				if (hadOwn) gradient.addColorStop = original
				else delete gradient.addColorStop
			} catch (error) {
				try { gradient.addColorStop = original } catch (restoreError) {}
			}
		})
		return true
	}

	function recordTimed(frame, callback) {
		const startedAt = now()
		try {
			callback()
		} finally {
			frame.recordingMs += Math.max(0, now() - startedAt)
		}
	}

	function recordDrawImage(frame, ctx, meta, args) {
		frame.drawImages++
		incrementMap(frame.operationCounts, 'drawImage')
		const command = describeDrawImage(ctx, meta, args)
		const sourceKey = command.sourceKey || 'unknown-source'
		const targetKey = command.targetKey || 'unknown-target'
		frame.sources.add(sourceKey)
		frame.targets.add(targetKey)
		incrementMap(frame.sourceCounts, sourceKey)
		incrementMap(frame.targetCounts, targetKey)
		if (command.supported) {
			frame.supportedDrawImages++
			recordSupportedCommand(frame, command)
		} else {
			frame.unsupportedDrawImages++
			incrementMap(frame.unsupportedCounts, command.reason || 'unsupported-drawImage')
			recordBarrier(frame)
		}
		if (frame.replayCommands && command.sourceKey && args?.[0]) frame.sourceRefs.set(command.sourceKey, args[0])
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function recordPathPoint(meta, ctx, operation, args) {
		if (!meta.path) meta.path = { subpaths: [], current: null, circle: null, unsupported: '' }
		if (meta.path.unsupported) return
		if (meta.path.circle) {
			meta.path.unsupported = 'path-mixed-circle'
			return
		}
		const point = transformPathPoint(ctx, args?.[0], args?.[1])
		if (!point) {
			meta.path.unsupported = 'path-point'
			return
		}
		if (operation === 'moveTo') {
			const subpath = { points: [point], closed: false }
			meta.path.subpaths.push(subpath)
			meta.path.current = subpath
			return
		}
		if (!meta.path.current) {
			const subpath = { points: [point], closed: false }
			meta.path.subpaths.push(subpath)
			meta.path.current = subpath
			return
		}
		meta.path.current.points.push(point)
	}

	function recordPathArc(meta, ctx, args) {
		if (!meta.path) meta.path = { subpaths: [], current: null, circle: null, unsupported: '' }
		if (meta.path.unsupported) return
		if (meta.path.current || meta.path.subpaths.length || meta.path.circle) {
			meta.path.unsupported = 'path-arc-subpaths'
			return
		}
		const values = Array.from(args || []).slice(0, 5).map(Number)
		const anticlockwise = !!args?.[5]
		if (values.length !== 5 || !values.every(Number.isFinite) || values[2] <= 0) {
			meta.path.unsupported = 'path-arc-arguments'
			return
		}
		const sweep = Math.abs(values[4] - values[3])
		if (sweep < Math.PI * 2 - 0.000001) {
			meta.path.unsupported = 'path-arc-partial'
			return
		}
		const transform = getTransform(ctx)
		const scale = getUniformTransformScale(transform)
		const center = transform && transformReplayPoint(transform, values[0], values[1])
		const radius = values[2] * scale
		if (!center || !Number.isFinite(radius) || radius <= 0) {
			meta.path.unsupported = 'path-arc-transform'
			return
		}
		meta.path.circle = {
			center: center.map(function (value) { return roundNumber(value, 4) }),
			radius: roundNumber(radius, 4),
			anticlockwise,
			closed: false
		}
	}

	function recordPathClose(meta) {
		if (meta.path?.circle) {
			meta.path.circle.closed = true
			return
		}
		if (!meta.path?.current) {
			if (meta.path && !meta.path.unsupported) meta.path.unsupported = 'path-close-without-subpath'
			return
		}
		meta.path.current.closed = true
	}

	function recordUnsupportedPath(meta, operation) {
		if (!meta.path) meta.path = { subpaths: [], current: null, circle: null, unsupported: '' }
		if (!meta.path.unsupported) meta.path.unsupported = 'path-' + operation
	}

	function recordPolygonFill(frame, ctx, meta, args) {
		frame.polygonFills++
		incrementMap(frame.operationCounts, 'fill')
		const command = describePolygonFill(ctx, meta, args)
		frame.targets.add(command.targetKey)
		incrementMap(frame.targetCounts, command.targetKey)
		if (command.supported) {
			frame.supportedPolygonFills++
			if (!command.noop) recordSupportedCommand(frame, command)
		} else {
			frame.unsupportedPaints++
			incrementMap(frame.unsupportedCounts, command.reason || 'canvas-fill')
			recordUnsupportedPaintDiagnostic(frame, ctx, command, args)
			recordBarrier(frame)
		}
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function recordPathStroke(frame, ctx, meta, args) {
		frame.pathStrokes++
		incrementMap(frame.operationCounts, 'stroke')
		const command = describePathStroke(ctx, meta, args)
		frame.targets.add(command.targetKey)
		incrementMap(frame.targetCounts, command.targetKey)
		if (command.supported) {
			frame.supportedPathStrokes++
			if (!command.noop) recordSupportedCommand(frame, command)
		} else {
			frame.unsupportedPaints++
			incrementMap(frame.unsupportedCounts, command.reason || 'canvas-stroke')
			recordUnsupportedPaintDiagnostic(frame, ctx, command, args)
			recordBarrier(frame)
		}
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function describePathStroke(ctx, meta, args) {
		const targetKey = getTargetKey(ctx)
		const firstArg = args?.[0]
		const path = meta.path
		const composite = String(ctx?.globalCompositeOperation || 'source-over')
		const alpha = Number(ctx?.globalAlpha)
		const strokeStyle = typeof ctx?.strokeStyle === 'string' ? ctx.strokeStyle : ''
		const filter = String(ctx?.filter || 'none')
		const lineWidth = Number(ctx?.lineWidth)
		const lineCap = String(ctx?.lineCap || 'butt')
		const lineJoin = String(ctx?.lineJoin || 'miter')
		const miterLimit = Number(ctx?.miterLimit)
		let dash = null
		try { dash = typeof ctx?.getLineDash === 'function' ? ctx.getLineDash() : [] } catch (error) {}
		const scaledLineWidth = getUniformStrokeWidth(ctx, lineWidth)
		let noop = false
		let reason = ''
		if (firstArg) reason = 'stroke-path2d'
		else if (!path) reason = 'stroke-missing-path'
		else if (path.unsupported) reason = path.unsupported
		else if (!path.subpaths.length || path.subpaths.every(function (subpath) { return !subpath?.points || subpath.points.length < 2 })) noop = true
		else if (path.subpaths.length !== 1) reason = 'stroke-subpaths'
		else if (path.subpaths[0]?.points.length < 2) reason = 'stroke-too-short'
		else if (!isSolidColor(strokeStyle)) reason = 'stroke-style'
		else if (meta.clipActive) reason = 'clip-active'
		else if (composite !== 'source-over') reason = 'composite-' + composite
		else if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) reason = 'global-alpha'
		else if (filter && filter !== 'none') reason = 'filter-active'
		else if (hasActiveShadow(ctx)) reason = 'shadow-active'
		else if (lineCap !== 'butt' && lineCap !== 'square' && lineCap !== 'round') reason = 'stroke-line-cap-' + lineCap
		else if (lineJoin !== 'miter') reason = 'stroke-line-join-' + lineJoin
		else if (!Number.isFinite(miterLimit) || miterLimit <= 0) reason = 'stroke-miter-limit'
		else if (!Array.isArray(dash) || dash.some(function (value) { return Number(value) !== 0 })) reason = 'stroke-dash'
		else if (Number(ctx?.lineDashOffset) !== 0) reason = 'stroke-dash-offset'
		else if (!Number.isFinite(scaledLineWidth) || scaledLineWidth <= 0) reason = 'stroke-transform'
		else if (!buildReplayStrokeGeometry(path.subpaths[0].points, scaledLineWidth, lineCap, miterLimit)) reason = 'stroke-geometry'
		return {
			type: 'stroke',
			operation: 'stroke',
			supported: !reason,
			noop,
			reason,
			targetKey,
			sourceKey: 'solid-white',
			points: path?.subpaths?.[0]?.points ? path.subpaths[0].points.map(function (point) { return point.slice() }) : [],
			strokeStyle,
			lineWidth: Number.isFinite(scaledLineWidth) ? scaledLineWidth : null,
			lineCap,
			lineJoin,
			miterLimit: Number.isFinite(miterLimit) ? miterLimit : null,
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite,
			filter,
			smoothing: false
		}
	}

	function getUniformStrokeWidth(ctx, lineWidth) {
		const matrix = getTransform(ctx)
		if (!matrix || !Number.isFinite(lineWidth) || lineWidth <= 0) return null
		const scaleX = Math.hypot(matrix[0], matrix[1])
		const scaleY = Math.hypot(matrix[2], matrix[3])
		const dot = matrix[0] * matrix[2] + matrix[1] * matrix[3]
		const tolerance = Math.max(scaleX, scaleY, 1) * 0.0001
		if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null
		if (Math.abs(scaleX - scaleY) > tolerance || Math.abs(dot) > tolerance) return null
		return roundNumber(lineWidth * (scaleX + scaleY) / 2, 4)
	}

	function describePolygonFill(ctx, meta, args) {
		const targetKey = getTargetKey(ctx)
		const firstArg = args?.[0]
		const fillRule = typeof firstArg === 'string' ? firstArg : 'nonzero'
		const path = meta.path
		const composite = String(ctx?.globalCompositeOperation || 'source-over')
		const alpha = Number(ctx?.globalAlpha)
		const fillSource = ctx?.fillStyle
		const fillStyle = typeof fillSource === 'string' ? fillSource : ''
		const filter = String(ctx?.filter || 'none')
		let radial = null
		let radialRect = null
		let noop = false
		let reason = ''
		if (firstArg && typeof firstArg !== 'string') reason = 'fill-path2d'
		else if (!path) reason = 'fill-missing-path'
		else if (path.unsupported) reason = path.unsupported
		else if (path.circle) {
			const circle = path.circle
			const gradient = gradientMetadata.get(fillSource)
			if (path.subpaths.length) reason = 'path-circle-subpaths'
			else if (!(radial = describeConcentricRadialGradient(gradient))) reason = 'fill-circle-radial-gradient'
			else if (!isTransparentGradientEdge(radial)) reason = 'fill-circle-gradient-edge'
			else {
				const centerTolerance = Math.max(1, circle.radius, radial.radii[1]) * 0.0001
				if (Math.hypot(circle.center[0] - radial.center[0], circle.center[1] - radial.center[1]) > centerTolerance) reason = 'fill-circle-gradient-center'
				else if (circle.radius + centerTolerance < radial.radii[1]) reason = 'fill-circle-gradient-overflow'
				else radialRect = [circle.center[0] - circle.radius, circle.center[1] - circle.radius, circle.radius * 2, circle.radius * 2].map(function (value) { return roundNumber(value, 4) })
			}
		}
		else if (path.subpaths.length !== 1) reason = 'path-subpaths'
		else if (!path.subpaths[0]?.closed) reason = 'path-open'
		else if (path.subpaths[0].points.length < 3) reason = 'path-too-short'
		else if (!triangulateReplayPolygon(path.subpaths[0].points) && !(noop = isDegenerateReplayPolygon(path.subpaths[0].points))) reason = 'path-non-simple'
		else if (!isSolidColor(fillStyle)) reason = 'fill-style'
		else if (meta.clipActive) reason = 'clip-active'
		else if (composite !== 'source-over') reason = 'composite-' + composite
		else if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) reason = 'global-alpha'
		else if (filter && filter !== 'none') reason = 'filter-active'
		else if (hasActiveShadow(ctx)) reason = 'shadow-active'
		return {
			type: radialRect ? 'radialGradient' : 'polygon',
			operation: 'fill',
			supported: !reason,
			noop,
			reason,
			targetKey,
			sourceKey: radialRect ? 'radial-gradient' : 'solid-white',
			points: !reason && !radialRect && !noop ? path.subpaths[0].points.map(function (point) { return point.slice() }) : null,
			rect: radialRect,
			transform: radialRect ? [1, 0, 0, 1, 0, 0] : null,
			gradient: radialRect ? radial : null,
			fillStyle,
			fillRule,
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite,
			filter,
			smoothing: false
		}
	}

	function isTransparentGradientEdge(gradient) {
		const stops = Array.from(gradient?.stops || [])
		const edgeColor = stops.length ? parseReplayColor(stops[stops.length - 1]?.color, 1) : null
		return !!edgeColor && edgeColor[3] <= 0.000001
	}

	function isDegenerateReplayPolygon(points) {
		const normalized = normalizeReplayPoints(points)
		if (!normalized) return false
		const clean = []
		for (const point of normalized) {
			if (!clean.some(function (candidate) { return Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) <= 0.000001 })) clean.push(point)
		}
		if (clean.length < 3) return true
		let maxCross = 0
		for (let i = 0; i < clean.length - 2; i++) {
			for (let j = i + 1; j < clean.length - 1; j++) {
				for (let k = j + 1; k < clean.length; k++) maxCross = Math.max(maxCross, Math.abs(polygonCross(clean[i], clean[j], clean[k])))
			}
		}
		return maxCross <= 0.000001
	}

	function transformPathPoint(ctx, x, y) {
		const px = Number(x)
		const py = Number(y)
		const matrix = getTransform(ctx)
		if (!Number.isFinite(px) || !Number.isFinite(py) || !matrix) return null
		return [
			roundNumber(matrix[0] * px + matrix[2] * py + matrix[4], 4),
			roundNumber(matrix[1] * px + matrix[3] * py + matrix[5], 4)
		]
	}

	function isSolidColor(value) {
		return /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim())
	}

	function isConvexPolygon(points) {
		if (!Array.isArray(points) || points.length < 3) return false
		let direction = 0
		for (let i = 0; i < points.length; i++) {
			const a = points[i]
			const b = points[(i + 1) % points.length]
			const c = points[(i + 2) % points.length]
			const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
			if (!Number.isFinite(cross) || Math.abs(cross) < 0.000001) return false
			const sign = Math.sign(cross)
			if (!direction) direction = sign
			else if (direction !== sign) return false
		}
		return true
	}

	function triangulateReplayPolygon(points) {
		const normalized = normalizeReplayPoints(points)
		if (!normalized || normalized.length < 3) return null
		const clean = []
		for (const point of normalized) {
			const previous = clean[clean.length - 1]
			if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.000001) clean.push(point)
		}
		if (clean.length > 2 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 0.000001) clean.pop()
		if (clean.length < 3 || polygonSelfIntersects(clean)) return null
		const area = polygonSignedArea(clean)
		if (!Number.isFinite(area) || Math.abs(area) <= 0.000001) return null
		const orientation = Math.sign(area)
		const indices = clean.map(function (_, index) { return index })
		const triangles = []
		let guard = clean.length * clean.length
		while (indices.length > 3 && guard-- > 0) {
			let clipped = false
			for (let i = 0; i < indices.length; i++) {
				const previousIndex = indices[(i - 1 + indices.length) % indices.length]
				const currentIndex = indices[i]
				const nextIndex = indices[(i + 1) % indices.length]
				const a = clean[previousIndex]
				const b = clean[currentIndex]
				const c = clean[nextIndex]
				if (polygonCross(a, b, c) * orientation <= 0.000001) continue
				let containsPoint = false
				for (const candidateIndex of indices) {
					if (candidateIndex === previousIndex || candidateIndex === currentIndex || candidateIndex === nextIndex) continue
					if (pointInTriangle(clean[candidateIndex], a, b, c)) {
						containsPoint = true
						break
					}
				}
				if (containsPoint) continue
				triangles.push([a, b, c])
				indices.splice(i, 1)
				clipped = true
				break
			}
			if (!clipped) return null
		}
		if (indices.length !== 3) return null
		triangles.push([clean[indices[0]], clean[indices[1]], clean[indices[2]]])
		return triangles
	}

	function polygonSignedArea(points) {
		let area = 0
		for (let i = 0; i < points.length; i++) {
			const a = points[i]
			const b = points[(i + 1) % points.length]
			area += a[0] * b[1] - b[0] * a[1]
		}
		return area / 2
	}

	function polygonCross(a, b, c) {
		return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
	}

	function pointInTriangle(point, a, b, c) {
		const c1 = polygonCross(a, b, point)
		const c2 = polygonCross(b, c, point)
		const c3 = polygonCross(c, a, point)
		const hasNegative = c1 < -0.000001 || c2 < -0.000001 || c3 < -0.000001
		const hasPositive = c1 > 0.000001 || c2 > 0.000001 || c3 > 0.000001
		return !(hasNegative && hasPositive)
	}

	function polygonSelfIntersects(points) {
		for (let i = 0; i < points.length; i++) {
			const a = points[i]
			const b = points[(i + 1) % points.length]
			for (let j = i + 1; j < points.length; j++) {
				if (j === i || j === i + 1 || (i === 0 && j === points.length - 1)) continue
				const c = points[j]
				const d = points[(j + 1) % points.length]
				if (segmentsIntersect(a, b, c, d)) return true
			}
		}
		return false
	}

	function segmentsIntersect(a, b, c, d) {
		const abC = polygonCross(a, b, c)
		const abD = polygonCross(a, b, d)
		const cdA = polygonCross(c, d, a)
		const cdB = polygonCross(c, d, b)
		if (((abC > 0.000001 && abD < -0.000001) || (abC < -0.000001 && abD > 0.000001)) &&
			((cdA > 0.000001 && cdB < -0.000001) || (cdA < -0.000001 && cdB > 0.000001))) return true
		return (Math.abs(abC) <= 0.000001 && pointOnSegment(c, a, b)) ||
			(Math.abs(abD) <= 0.000001 && pointOnSegment(d, a, b)) ||
			(Math.abs(cdA) <= 0.000001 && pointOnSegment(a, c, d)) ||
			(Math.abs(cdB) <= 0.000001 && pointOnSegment(b, c, d))
	}

	function pointOnSegment(point, a, b) {
		return point[0] >= Math.min(a[0], b[0]) - 0.000001 && point[0] <= Math.max(a[0], b[0]) + 0.000001 &&
			point[1] >= Math.min(a[1], b[1]) - 0.000001 && point[1] <= Math.max(a[1], b[1]) + 0.000001
	}

	function recordSupportedCommand(frame, command) {
		if (!frame.supportedRunOpen) {
			frame.supportedRunOpen = true
			frame.atlasBatches++
		}
		const batchKey = [command.targetKey, command.sourceKey, command.composite, command.smoothing ? 1 : 0].join('|')
		if (frame.currentBatchKey !== batchKey) {
			if (frame.currentBatchKey && frame.currentSourceKey !== command.sourceKey) frame.textureSwitches++
			frame.adjacentBatches++
			frame.currentBatchKey = batchKey
			frame.currentSourceKey = command.sourceKey
		}
	}

	function recordFillRect(frame, ctx, meta, args) {
		frame.fillRects++
		incrementMap(frame.operationCounts, 'fillRect')
		const command = describeFillRect(ctx, meta, args)
		frame.targets.add(command.targetKey)
		incrementMap(frame.targetCounts, command.targetKey)
		if (command.supported) {
			frame.supportedFillRects++
			if (command.type === 'radialGradient') frame.radialGradientFillRects++
			recordSupportedCommand(frame, command)
		} else {
			frame.unsupportedPaints++
			incrementMap(frame.unsupportedCounts, command.reason || 'canvas-fillRect')
			recordUnsupportedPaintDiagnostic(frame, ctx, command, args)
			recordBarrier(frame)
		}
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function describeFillRect(ctx, meta, args) {
		const targetKey = getTargetKey(ctx)
		const rect = Array.from(args || []).slice(0, 4).map(Number)
		const transform = getTransform(ctx)
		const composite = String(ctx?.globalCompositeOperation || 'source-over')
		const alpha = Number(ctx?.globalAlpha)
		const filter = String(ctx?.filter || 'none')
		const gradientSource = ctx?.fillStyle
		const gradient = gradientMetadata.get(gradientSource)
		let radial = null
		let reason = ''
		if (rect.length !== 4 || !rect.every(Number.isFinite) || rect[2] === 0 || rect[3] === 0) reason = 'fill-rect-arguments'
		else if (!transform) reason = 'transform'
		else if (!gradient) reason = typeof gradientSource === 'string' ? 'fill-rect-solid' : 'fill-rect-gradient-untracked'
		else if (!gradient.tracked || gradient.invalid) reason = 'fill-rect-gradient-untracked'
		else if (gradient.type !== 'radial') reason = 'fill-rect-gradient-' + String(gradient.type || 'unknown')
		else if (!(radial = describeConcentricRadialGradient(gradient))) reason = 'fill-rect-radial-gradient'
		else if (meta.clipActive) reason = 'clip-active'
		else if (composite !== 'source-over') reason = 'composite-' + composite
		else if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) reason = 'global-alpha'
		else if (filter && filter !== 'none') reason = 'filter-active'
		else if (hasActiveShadow(ctx)) reason = 'shadow-active'
		return {
			type: radial ? 'radialGradient' : 'canvas',
			operation: 'fillRect',
			supported: !reason,
			reason,
			targetKey,
			sourceKey: 'radial-gradient',
			rect: rect.map(function (value) { return roundNumber(value, 4) }),
			transform,
			gradient: radial,
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite,
			filter,
			smoothing: false
		}
	}

	function describeConcentricRadialGradient(metadata) {
		const args = metadata?.args
		const transform = metadata?.transform
		if (!Array.isArray(args) || args.length !== 6 || !args.every(Number.isFinite)) return null
		if (!Array.isArray(transform) || transform.length !== 6 || !transform.every(Number.isFinite)) return null
		const scale = getUniformTransformScale(transform)
		if (!Number.isFinite(scale) || scale <= 0) return null
		const start = transformReplayPoint(transform, args[0], args[1])
		const end = transformReplayPoint(transform, args[3], args[4])
		const innerRadius = args[2] * scale
		const outerRadius = args[5] * scale
		if (!start || !end || innerRadius < 0 || outerRadius <= innerRadius) return null
		if (Math.hypot(start[0] - end[0], start[1] - end[1]) > Math.max(1, outerRadius) * 0.0001) return null
		const stops = Array.from(metadata.stops || []).map(function (stop) {
			return { offset: Number(stop?.offset), color: String(stop?.color || '') }
		}).sort(function (a, b) { return a.offset - b.offset })
		if (stops.length < 2 || stops.length > 4) return null
		if (!stops.every(function (stop) { return Number.isFinite(stop.offset) && stop.offset >= 0 && stop.offset <= 1 && !!parseReplayColor(stop.color, 1) })) return null
		for (let i = 1; i < stops.length; i++) {
			if (stops[i].offset <= stops[i - 1].offset) return null
		}
		return {
			center: [roundNumber(start[0], 4), roundNumber(start[1], 4)],
			radii: [roundNumber(innerRadius, 4), roundNumber(outerRadius, 4)],
			stops: stops.map(function (stop) { return { offset: roundNumber(stop.offset, 5), color: stop.color } })
		}
	}

	function getUniformTransformScale(matrix) {
		if (!Array.isArray(matrix) || matrix.length !== 6) return null
		const scaleX = Math.hypot(Number(matrix[0]), Number(matrix[1]))
		const scaleY = Math.hypot(Number(matrix[2]), Number(matrix[3]))
		const dot = Number(matrix[0]) * Number(matrix[2]) + Number(matrix[1]) * Number(matrix[3])
		const tolerance = Math.max(scaleX, scaleY, 1) * 0.0001
		if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null
		if (Math.abs(scaleX - scaleY) > tolerance || Math.abs(dot) > tolerance) return null
		return (scaleX + scaleY) / 2
	}

	function recordUnsupportedPaint(frame, ctx, methodName, args) {
		frame.unsupportedPaints++
		incrementMap(frame.operationCounts, methodName)
		incrementMap(frame.unsupportedCounts, 'canvas-' + methodName)
		const command = {
			type: 'canvas',
			operation: methodName,
			supported: false,
			reason: 'canvas-' + methodName,
			targetKey: getTargetKey(ctx)
		}
		incrementMap(frame.targetCounts, command.targetKey)
		frame.targets.add(command.targetKey)
		recordUnsupportedPaintDiagnostic(frame, ctx, command, args)
		recordBarrier(frame)
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function recordUnsupportedPaintDiagnostic(frame, ctx, command, args) {
		if (!frame || !Array.isArray(frame.unsupportedPaintDiagnostics) || frame.unsupportedPaintDiagnostics.length >= 8) return
		let stack = ''
		try { stack = String(new Error().stack || '').split('\n').slice(2, 10).join('\n') } catch (error) {}
		const alpha = Number(ctx?.globalAlpha)
		frame.unsupportedPaintDiagnostics.push({
			operation: String(command?.operation || ''),
			reason: String(command?.reason || ''),
			targetKey: String(command?.targetKey || getTargetKey(ctx)),
			fillStyle: describeDiagnosticPaint(ctx?.fillStyle),
			strokeStyle: describeDiagnosticPaint(ctx?.strokeStyle),
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite: String(ctx?.globalCompositeOperation || ''),
			filter: String(ctx?.filter || ''),
			shadowActive: hasActiveShadow(ctx),
			transform: getTransform(ctx),
			args: summarizeDiagnosticArgs(args),
			game: {
				altActive: activeGame?.altActive === true,
				plane: Number(activeGame?.plane) || 0,
				hoveredEntity: String(activeGame?.hoveredEntity?.name || ''),
				itemInHand: String(activeGame?.itemInHand?.name || '')
			},
			stack
		})
	}

	function describeDiagnosticPaint(value) {
		if (typeof value === 'string') return { kind: 'string', value }
		if (value === null) return { kind: 'null', value: '' }
		if (value === undefined) return { kind: 'undefined', value: '' }
		return { kind: String(value?.constructor?.name || typeof value), value: '' }
	}

	function summarizeDiagnosticArgs(args) {
		return Array.from(args || []).slice(0, 8).map(function (value) {
			if (typeof value === 'number') return Number.isFinite(value) ? roundNumber(value, 4) : String(value)
			if (typeof value === 'string' || typeof value === 'boolean' || value === null) return value
			return '[' + String(value?.constructor?.name || typeof value) + ']'
		})
	}

	function recordStateBarrier(frame, ctx, operation) {
		incrementMap(frame.operationCounts, operation)
		incrementMap(frame.unsupportedCounts, 'state-' + operation)
		const command = {
			type: 'state',
			operation,
			supported: false,
			reason: 'state-' + operation,
			targetKey: getTargetKey(ctx)
		}
		recordBarrier(frame)
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function pushReplayCommand(frame, command) {
		if (!frame.replayCommands) return
		if (!frame.replayTargetKey || command.targetKey !== frame.replayTargetKey) {
			frame.replaySkippedTargets++
			return
		}
		frame.replayCommands.push(command)
	}

	function recordBarrier(frame) {
		if (frame.supportedRunOpen) frame.forcedFlushes++
		frame.supportedRunOpen = false
		frame.currentBatchKey = ''
		frame.currentSourceKey = ''
	}

	function describeDrawImage(ctx, meta, args) {
		const image = args[0]
		const sourceKey = getSourceKey(image)
		const targetKey = getTargetKey(ctx)
		const rects = normalizeDrawImageRect(image, args.slice(1))
		const transform = getTransform(ctx)
		const composite = String(ctx?.globalCompositeOperation || 'source-over')
		const alpha = Number(ctx?.globalAlpha)
		const filter = String(ctx?.filter || 'none')
		const smoothing = ctx?.imageSmoothingEnabled !== false
		let reason = ''
		if (!rects) reason = 'drawImage-arguments'
		else if (!transform) reason = 'transform'
		else if (meta.clipActive) reason = 'clip-active'
		else if (composite !== 'source-over') reason = 'composite-' + composite
		else if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) reason = 'global-alpha'
		else if (filter && filter !== 'none') reason = 'filter-active'
		else if (hasActiveShadow(ctx)) reason = 'shadow-active'
		return {
			type: 'drawImage',
			supported: !reason,
			reason,
			sourceKey,
			sourceKind: getSourceKind(image),
			targetKey,
			sourceRect: rects?.source || null,
			destinationRect: rects?.destination || null,
			transform,
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite,
			filter,
			smoothing
		}
	}

	function normalizeDrawImageRect(image, args) {
		const size = getSourceSize(image)
		let source
		let destination
		if (args.length === 2 && size) {
			source = [0, 0, size[0], size[1]]
			destination = [args[0], args[1], size[0], size[1]]
		} else if (args.length === 4 && size) {
			source = [0, 0, size[0], size[1]]
			destination = [args[0], args[1], args[2], args[3]]
		} else if (args.length === 8) {
			source = args.slice(0, 4)
			destination = args.slice(4, 8)
		} else {
			return null
		}
		if (!source.concat(destination).every(function (value) { return Number.isFinite(Number(value)) })) return null
		return {
			source: source.map(function (value) { return roundNumber(value, 4) }),
			destination: destination.map(function (value) { return roundNumber(value, 4) })
		}
	}

	function getTransform(ctx) {
		if (!ctx || typeof ctx.getTransform !== 'function') return null
		try {
			const matrix = ctx.getTransform()
			const values = [matrix?.a, matrix?.b, matrix?.c, matrix?.d, matrix?.e, matrix?.f].map(Number)
			if (!values.every(Number.isFinite)) return null
			return values.map(function (value) { return roundNumber(value, 5) })
		} catch (error) {
			return null
		}
	}

	function hasActiveShadow(ctx) {
		return (Number(ctx?.shadowBlur) || 0) !== 0 ||
			(Number(ctx?.shadowOffsetX) || 0) !== 0 ||
			(Number(ctx?.shadowOffsetY) || 0) !== 0
	}

	function getSourceSize(image) {
		const width = Number(image?.naturalWidth || image?.videoWidth || image?.width)
		const height = Number(image?.naturalHeight || image?.videoHeight || image?.height)
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
		return [width, height]
	}

	function getSourceKey(image) {
		if (!image || (typeof image !== 'object' && typeof image !== 'function')) return 'missing-source'
		let id = sourceIds.get(image)
		if (!id) {
			id = ++sourceId
			sourceIds.set(image, id)
		}
		const src = String(image.currentSrc || image.src || '')
		const size = getSourceSize(image)
		const label = src ? stripSource(src) : getSourceKind(image)
		return label + '#' + id + (size ? ':' + size[0] + 'x' + size[1] : '')
	}

	function getTargetKey(ctx) {
		const canvas = ctx?.canvas
		if (!canvas || (typeof canvas !== 'object' && typeof canvas !== 'function')) return 'missing-target'
		let id = targetIds.get(canvas)
		if (!id) {
			id = ++targetId
			targetIds.set(canvas, id)
		}
		const name = canvas.id || canvas.dataset?.renderLayer || canvas.className || 'canvas'
		return String(name) + '#' + id + ':' + (Number(canvas.width) || 0) + 'x' + (Number(canvas.height) || 0)
	}

	function getSourceKind(image) {
		const tag = String(image?.tagName || '').toLowerCase()
		if (tag) return tag
		const name = String(image?.constructor?.name || '').toLowerCase()
		return name || 'object'
	}

	function stripSource(src) {
		const clean = String(src).split(/[?#]/)[0]
		const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
		return slash >= 0 ? clean.slice(slash + 1) : clean
	}

	function pushCommandPreview(frame, command) {
		if (frame.commands.length >= previewLimit) return
		frame.commands.push(command)
	}

	function finalizeFrame(frame, skipReplay = false) {
		const replayReport = replayEnabled && !skipReplay ? replayRecordedFrame(frame) : null
		const report = {
			frame: stats.frames + 1,
			drawImages: frame.drawImages,
			supportedDrawImages: frame.supportedDrawImages,
			unsupportedDrawImages: frame.unsupportedDrawImages,
			polygonFills: frame.polygonFills,
			supportedPolygonFills: frame.supportedPolygonFills,
			pathStrokes: frame.pathStrokes,
			supportedPathStrokes: frame.supportedPathStrokes,
			fillRects: frame.fillRects,
			supportedFillRects: frame.supportedFillRects,
			radialGradientFillRects: frame.radialGradientFillRects,
			unsupportedPaints: frame.unsupportedPaints,
			unsupportedPaintDiagnostics: frame.unsupportedPaintDiagnostics.slice(),
			quadCoverage: getCoverage(frame.supportedDrawImages + frame.supportedPolygonFills + frame.supportedPathStrokes + frame.supportedFillRects, frame.drawImages + frame.supportedPolygonFills + frame.supportedPathStrokes + frame.supportedFillRects + frame.unsupportedPaints),
			adjacentBatches: frame.adjacentBatches,
			atlasBatches: frame.atlasBatches,
			textureSwitches: frame.textureSwitches,
			forcedFlushes: frame.forcedFlushes,
			uniqueSources: frame.sources.size,
			uniqueTargets: frame.targets.size,
			contextsWrapped: frame.contextsWrapped,
			contextsSkipped: frame.contextsSkipped,
			recordingErrors: frame.recordingErrors,
			recordingMs: roundMs(frame.recordingMs),
			sources: listMap(frame.sourceCounts, 'source', 12),
			unsupported: listMap(frame.unsupportedCounts, 'reason', 12),
			operations: listMap(frame.operationCounts, 'operation', 12),
			targets: listMap(frame.targetCounts, 'target', 12),
			commands: frame.commands.slice(),
			replay: cloneValue(replayReport)
		}
		lastFrame = report
		stats.frames++
		stats.drawImages += frame.drawImages
		stats.supportedDrawImages += frame.supportedDrawImages
		stats.unsupportedDrawImages += frame.unsupportedDrawImages
		stats.polygonFills += frame.polygonFills
		stats.supportedPolygonFills += frame.supportedPolygonFills
		stats.pathStrokes += frame.pathStrokes
		stats.supportedPathStrokes += frame.supportedPathStrokes
		stats.fillRects += frame.fillRects
		stats.supportedFillRects += frame.supportedFillRects
		stats.radialGradientFillRects += frame.radialGradientFillRects
		stats.unsupportedPaints += frame.unsupportedPaints
		stats.adjacentBatches += frame.adjacentBatches
		stats.atlasBatches += frame.atlasBatches
		stats.textureSwitches += frame.textureSwitches
		stats.forcedFlushes += frame.forcedFlushes
		stats.contextsWrapped += frame.contextsWrapped
		stats.contextsSkipped += frame.contextsSkipped
		stats.recordingErrors += frame.recordingErrors
		stats.recordingMs += frame.recordingMs
		stats.lastRecordingMs = frame.recordingMs
		stats.maxRecordingMs = Math.max(stats.maxRecordingMs, frame.recordingMs)
		mergeMap(sourceTotals, frame.sourceCounts)
		trimMapOldest(sourceTotals, maxSourceDiagnosticEntries)
		mergeMap(unsupportedTotals, frame.unsupportedCounts)
		mergeMap(operationTotals, frame.operationCounts)
		mergeMap(targetTotals, frame.targetCounts)
		samples.push({
			drawImages: frame.drawImages,
			supportedDrawImages: frame.supportedDrawImages,
			supportedPolygonFills: frame.supportedPolygonFills,
			supportedPathStrokes: frame.supportedPathStrokes,
			supportedFillRects: frame.supportedFillRects,
			radialGradientFillRects: frame.radialGradientFillRects,
			unsupportedPaints: frame.unsupportedPaints,
			adjacentBatches: frame.adjacentBatches,
			atlasBatches: frame.atlasBatches,
			textureSwitches: frame.textureSwitches,
			forcedFlushes: frame.forcedFlushes,
			recordingMs: frame.recordingMs
		})
		while (samples.length > sampleLimit) samples.shift()
		return report
	}


	function replayRecordedFrame(frame) {
		const startedAt = now()
		const report = {
			frame: ++replayFrameId,
			commands: frame.replayCommands?.length || 0,
			quads: 0,
			drawCalls: 0,
			textureBinds: 0,
			textureUploads: 0,
			staticUploads: 0,
			dynamicUploads: 0,
			atlasUploads: 0,
			dynamicAtlasUploads: 0,
			dynamicUploadSkips: 0,
			gradientDraws: 0,
			barriers: 0,
			segments: 0,
			skippedCommands: 0,
			skippedTargets: frame.replaySkippedTargets || 0,
			uploadErrors: 0,
			errors: 0,
			replayMs: 0,
			error: '',
			canvasSize: { width: 0, height: 0 }
		}
		try {
			if (!frame.replayTarget || !frame.replayCommands) throw new Error('replay-target-unavailable')
			const renderer = getReplayRenderer(frame.replayTarget)
			syncReplayRenderer(renderer, frame.replayTarget)
			if (renderer.contextLost) throw new Error('webgl-context-lost')
			prepareReplayTextureEntries(renderer, frame)
			report.canvasSize = { width: renderer.canvas.width, height: renderer.canvas.height }
			beginReplayFrame(renderer)
			let segmentOpen = false
			for (const command of frame.replayCommands) {
				if (!command?.supported) {
					flushReplayBatch(renderer, report)
					report.barriers++
					segmentOpen = false
					continue
				}
				if (!segmentOpen) {
					report.segments++
					segmentOpen = true
				}
				let appended = false
				if (command.type === 'drawImage') appended = appendReplayDrawImage(renderer, frame, command, report)
				else if (command.type === 'polygon') appended = appendReplayPolygon(renderer, command, report)
				else if (command.type === 'stroke') appended = appendReplayStroke(renderer, command, report)
				else if (command.type === 'radialGradient') {
					flushReplayBatch(renderer, report)
					appended = drawReplayRadialGradient(renderer, command, report)
				}
				if (!appended) {
					flushReplayBatch(renderer, report)
					report.skippedCommands++
					segmentOpen = false
				}
			}
			flushReplayBatch(renderer, report)
			renderer.gl.flush()
			sweepReplayDynamicEntries(renderer)
			syncReplayCanvasVisibility(renderer)
		} catch (error) {
			report.errors++
			report.error = String(error?.message || error || 'replay-error')
		}
		report.replayMs = roundMs(Math.max(0, now() - startedAt))
		finishReplayReport(report)
		return report
	}

	function finishReplayReport(report) {
		lastReplay = report
		replayStats.frames++
		replayStats.commands += report.commands
		replayStats.quads += report.quads
		replayStats.drawCalls += report.drawCalls
		replayStats.textureBinds += report.textureBinds
		replayStats.textureUploads += report.textureUploads
		replayStats.staticUploads += report.staticUploads
		replayStats.dynamicUploads += report.dynamicUploads
		replayStats.atlasUploads += report.atlasUploads
		replayStats.dynamicAtlasUploads += report.dynamicAtlasUploads
		replayStats.dynamicUploadSkips += report.dynamicUploadSkips
		replayStats.gradientDraws += report.gradientDraws
		replayStats.barriers += report.barriers
		replayStats.segments += report.segments
		replayStats.skippedCommands += report.skippedCommands
		replayStats.skippedTargets += report.skippedTargets
		replayStats.uploadErrors += report.uploadErrors
		replayStats.errors += report.errors
		replayStats.replayMs += report.replayMs
		replayStats.lastReplayMs = report.replayMs
		replayStats.maxReplayMs = Math.max(replayStats.maxReplayMs, report.replayMs)
		if (report.error) replayStats.lastError = report.error
		replayStats.lastCanvasSize = Object.assign({}, report.canvasSize)
		replaySamples.push({
			commands: report.commands,
			quads: report.quads,
			drawCalls: report.drawCalls,
			textureBinds: report.textureBinds,
			textureUploads: report.textureUploads,
			atlasUploads: report.atlasUploads,
			dynamicAtlasUploads: report.dynamicAtlasUploads,
			dynamicUploadSkips: report.dynamicUploadSkips,
			gradientDraws: report.gradientDraws,
			barriers: report.barriers,
			segments: report.segments,
			skippedCommands: report.skippedCommands,
			replayMs: report.replayMs
		})
		while (replaySamples.length > sampleLimit) replaySamples.shift()
	}

	function getReplayRenderer(targetCanvas) {
		if (replayRenderer?.targetCanvas === targetCanvas && replayRenderer.gl && !replayRenderer.contextLost) return replayRenderer
		destroyReplayRenderer()
		if (typeof document === 'undefined' || typeof document.createElement !== 'function') throw new Error('document-unavailable')
		const canvas = document.createElement('canvas')
		canvas.dataset.cattailEntityWebglReplay = 'true'
		canvas.setAttribute('aria-hidden', 'true')
		const gl = canvas.getContext('webgl2', {
			alpha: true,
			premultipliedAlpha: false,
			antialias: false,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: true
		})
		if (!gl) throw new Error('webgl2-unavailable')
		const renderer = createReplayRenderer(gl, canvas, targetCanvas)
		canvas.addEventListener('webglcontextlost', function (event) {
			try { event.preventDefault() } catch (error) {}
			renderer.contextLost = true
			replayStats.contextLosses++
			if (replacementRequested) failReplacement('webgl-context-lost')
		}, false)
		canvas.addEventListener('webglcontextrestored', function () {
			if (replayRenderer !== renderer) return
			try { renderer.canvas.remove() } catch (error) {}
			replayRenderer = null
		}, false)
		replayRenderer = renderer
		replayStats.rendererCreates++
		return renderer
	}

	function createReplayRenderer(gl, canvas, targetCanvas) {
		const vertexSource = [
			'#version 300 es',
			'precision highp float;',
			'in vec2 a_position;',
			'in vec2 a_uv;',
			'in vec4 a_color;',
			'uniform vec2 u_resolution;',
			'out vec2 v_uv;',
			'out vec4 v_color;',
			'void main() {',
			'  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;',
			'  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
			'  v_uv = a_uv;',
			'  v_color = a_color;',
			'}'
		].join('\n')
		const fragmentSource = [
			'#version 300 es',
			'precision highp float;',
			'in vec2 v_uv;',
			'in vec4 v_color;',
			'uniform sampler2D u_texture;',
			'out vec4 outColor;',
			'void main() {',
			'  outColor = texture(u_texture, v_uv) * v_color;',
			'}'
		].join('\n')
		const program = createReplayProgram(gl, vertexSource, fragmentSource)
		const vao = gl.createVertexArray()
		const vertexBuffer = gl.createBuffer()
		const indexBuffer = gl.createBuffer()
		if (!vao || !vertexBuffer || !indexBuffer) throw new Error('webgl-buffer-create-failed')
		const floatsPerVertex = 8
		const vertices = new Float32Array(replayBatchQuadLimit * 4 * floatsPerVertex)
		const indices = new Uint16Array(replayBatchQuadLimit * 6)
		for (let i = 0; i < replayBatchQuadLimit; i++) {
			const vertex = i * 4
			const offset = i * 6
			indices[offset] = vertex
			indices[offset + 1] = vertex + 1
			indices[offset + 2] = vertex + 2
			indices[offset + 3] = vertex
			indices[offset + 4] = vertex + 2
			indices[offset + 5] = vertex + 3
		}
		gl.bindVertexArray(vao)
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW)
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
		const stride = floatsPerVertex * 4
		bindReplayAttribute(gl, program, 'a_position', 2, stride, 0)
		bindReplayAttribute(gl, program, 'a_uv', 2, stride, 2 * 4)
		bindReplayAttribute(gl, program, 'a_color', 4, stride, 4 * 4)
		const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
		const textureLocation = gl.getUniformLocation(program, 'u_texture')
		if (resolutionLocation === null || textureLocation === null) throw new Error('webgl-uniform-missing')
		const gradient = createReplayGradientResources(gl)
		const renderer = {
			gl,
			canvas,
			targetCanvas,
			program,
			vao,
			vertexBuffer,
			indexBuffer,
			vertices,
			floatsPerVertex,
			resolutionLocation,
			textureLocation,
			gradient,
			textureEntries: new WeakMap(),
			textureEntryList: [],
			whiteEntry: null,
			ownedTextures: new Set(),
			staticAtlasEnabled: replayStaticAtlasEnabled && typeof gl.texSubImage2D === 'function',
			staticAtlasPageSize: resolveReplayAtlasPageSize(gl),
			staticAtlasPadding,
			staticAtlasPages: [],
			staticAtlasEntries: 0,
			staticAtlasFallbackEntries: 0,
			dynamicAtlasEnabled: replayDynamicAtlasEnabled && typeof gl.texSubImage2D === 'function',
			dynamicTrackingEnabled: replayDynamicTrackingEnabled,
			dynamicAtlasPageSize: resolveReplayDynamicAtlasPageSize(gl),
			dynamicAtlasPadding,
			dynamicAtlasMaxPages: replayDynamicAtlasMaxPages,
			dynamicAtlasPages: [],
			dynamicAtlasEntries: 0,
			dynamicAtlasFallbackEntries: 0,
			dynamicAtlasReallocations: 0,
			dynamicEntryEvictions: 0,
			dynamicSlotReuses: 0,
			dynamicEntries: new Set(),
			dynamicSourceTrackerMap: new WeakMap(),
			dynamicSourceTrackers: new Set(),
			boundTexture: null,
			batchEntry: null,
			batchSmoothing: null,
			batchQuads: 0,
			contextLost: false
		}
		if (renderer.staticAtlasEnabled) {
			try {
				renderer.whiteEntry = createReplayAtlasWhiteEntry(renderer)
			} catch (error) {
				destroyReplayAtlasPages(renderer)
				renderer.staticAtlasEnabled = false
			}
		}
		if (!renderer.whiteEntry) renderer.whiteEntry = createReplayWhiteTexture(renderer)
		return renderer
	}

	function createReplayGradientResources(gl) {
		const vertexSource = [
			'#version 300 es',
			'precision highp float;',
			'layout(location = 0) in vec2 a_position;',
			'uniform vec2 u_resolution;',
			'void main() {',
			'  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;',
			'  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);',
			'}'
		].join('\n')
		const fragmentSource = [
			'#version 300 es',
			'precision highp float;',
			'uniform vec2 u_resolution;',
			'uniform vec2 u_center;',
			'uniform vec2 u_radii;',
			'uniform vec4 u_stop_offsets;',
			'uniform vec4 u_stop_color0;',
			'uniform vec4 u_stop_color1;',
			'uniform vec4 u_stop_color2;',
			'uniform vec4 u_stop_color3;',
			'uniform int u_stop_count;',
			'uniform float u_global_alpha;',
			'out vec4 outColor;',
			'vec4 premultipliedMix(vec4 a, vec4 b, float amount) {',
			'  vec4 pa = vec4(a.rgb * a.a, a.a);',
			'  vec4 pb = vec4(b.rgb * b.a, b.a);',
			'  vec4 mixed = mix(pa, pb, clamp(amount, 0.0, 1.0));',
			'  return mixed.a > 0.000001 ? vec4(mixed.rgb / mixed.a, mixed.a) : vec4(0.0);',
			'}',
			'vec4 sampleGradient(float amount) {',
			'  if (u_stop_count <= 1 || amount <= u_stop_offsets.x) return u_stop_color0;',
			'  if (amount <= u_stop_offsets.y) return premultipliedMix(u_stop_color0, u_stop_color1, (amount - u_stop_offsets.x) / max(0.000001, u_stop_offsets.y - u_stop_offsets.x));',
			'  if (u_stop_count == 2) return u_stop_color1;',
			'  if (amount <= u_stop_offsets.z) return premultipliedMix(u_stop_color1, u_stop_color2, (amount - u_stop_offsets.y) / max(0.000001, u_stop_offsets.z - u_stop_offsets.y));',
			'  if (u_stop_count == 3) return u_stop_color2;',
			'  if (amount <= u_stop_offsets.w) return premultipliedMix(u_stop_color2, u_stop_color3, (amount - u_stop_offsets.z) / max(0.000001, u_stop_offsets.w - u_stop_offsets.z));',
			'  return u_stop_color3;',
			'}',
			'void main() {',
			'  vec2 point = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);',
			'  float amount = (distance(point, u_center) - u_radii.x) / max(0.000001, u_radii.y - u_radii.x);',
			'  vec4 color = sampleGradient(amount);',
			'  outColor = vec4(color.rgb, color.a * u_global_alpha);',
			'}'
		].join('\n')
		const program = createReplayProgram(gl, vertexSource, fragmentSource)
		const vao = gl.createVertexArray()
		const vertexBuffer = gl.createBuffer()
		if (!vao || !vertexBuffer) throw new Error('webgl-gradient-buffer-create-failed')
		gl.bindVertexArray(vao)
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, 8 * 4, gl.DYNAMIC_DRAW)
		gl.enableVertexAttribArray(0)
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)
		const locations = {
			resolution: gl.getUniformLocation(program, 'u_resolution'),
			center: gl.getUniformLocation(program, 'u_center'),
			radii: gl.getUniformLocation(program, 'u_radii'),
			stopOffsets: gl.getUniformLocation(program, 'u_stop_offsets'),
			stopColors: [0, 1, 2, 3].map(function (index) { return gl.getUniformLocation(program, 'u_stop_color' + index) }),
			stopCount: gl.getUniformLocation(program, 'u_stop_count'),
			globalAlpha: gl.getUniformLocation(program, 'u_global_alpha')
		}
		if (locations.resolution === null || locations.center === null || locations.radii === null || locations.stopOffsets === null || locations.stopCount === null || locations.globalAlpha === null || locations.stopColors.some(function (location) { return location === null })) {
			throw new Error('webgl-gradient-uniform-missing')
		}
		return { program, vao, vertexBuffer, locations, vertices: new Float32Array(8) }
	}

	function createReplayProgram(gl, vertexSource, fragmentSource) {
		const vertexShader = compileReplayShader(gl, gl.VERTEX_SHADER, vertexSource)
		const fragmentShader = compileReplayShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
		const program = gl.createProgram()
		if (!program) throw new Error('webgl-program-create-failed')
		gl.attachShader(program, vertexShader)
		gl.attachShader(program, fragmentShader)
		gl.linkProgram(program)
		gl.deleteShader(vertexShader)
		gl.deleteShader(fragmentShader)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			const message = gl.getProgramInfoLog(program) || 'webgl-program-link-failed'
			gl.deleteProgram(program)
			throw new Error(message)
		}
		return program
	}

	function compileReplayShader(gl, type, source) {
		const shader = gl.createShader(type)
		if (!shader) throw new Error('webgl-shader-create-failed')
		gl.shaderSource(shader, source)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			const message = gl.getShaderInfoLog(shader) || 'webgl-shader-compile-failed'
			gl.deleteShader(shader)
			throw new Error(message)
		}
		return shader
	}

	function bindReplayAttribute(gl, program, name, size, stride, offset) {
		const location = gl.getAttribLocation(program, name)
		if (location < 0) throw new Error('webgl-attribute-missing-' + name)
		gl.enableVertexAttribArray(location)
		gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
	}

	function resolveReplayAtlasPageSize(gl) {
		let size = normalizeAtlasPageSize(replayStaticAtlasPageSize)
		try {
			const maximum = Number(gl?.getParameter?.(gl.MAX_TEXTURE_SIZE))
			if (Number.isFinite(maximum) && maximum > 0) size = Math.min(size, Math.floor(maximum))
		} catch (error) {}
		return Math.max(1, size)
	}

	function resolveReplayDynamicAtlasPageSize(gl) {
		let size = normalizeAtlasPageSize(replayDynamicAtlasPageSize)
		try {
			const maximum = Number(gl?.getParameter?.(gl.MAX_TEXTURE_SIZE))
			if (Number.isFinite(maximum) && maximum > 0) size = Math.min(size, Math.floor(maximum))
		} catch (error) {}
		return Math.max(1, size)
	}

	function prepareReplayTextureEntries(renderer, frame) {
		if (!renderer || !frame?.replayCommands || !frame.sourceRefs) return
		const seen = new Set()
		for (const command of frame.replayCommands) {
			if (!command?.supported || command.type !== 'drawImage') continue
			const source = frame.sourceRefs.get(command.sourceKey)
			if (!source || seen.has(source)) continue
			seen.add(source)
			const entry = getReplayTextureEntry(renderer, source)
			const size = getSourceSize(source)
			if (entry && size) ensureReplayTextureSize(renderer, entry, size)
		}
	}

	function createReplayAtlasWhiteEntry(renderer) {
		const entry = createReplayStaticAtlasEntry(renderer, null, [1, 1], true)
		if (!entry?.atlasPage) throw new Error('webgl-atlas-white-allocation-failed')
		const gl = renderer.gl
		gl.bindTexture(gl.TEXTURE_2D, entry.atlasPage.texture)
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
		gl.texSubImage2D(gl.TEXTURE_2D, 0, entry.x, entry.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
		entry.uploaded = true
		return entry
	}

	function createReplayStaticAtlasEntry(renderer, source, size, white = false) {
		const width = Math.max(1, Math.floor(Number(size?.[0]) || 0))
		const height = Math.max(1, Math.floor(Number(size?.[1]) || 0))
		const region = allocateReplayAtlasRegion(renderer, width, height)
		if (!region) return null
		if (!white) renderer.staticAtlasEntries++
		return {
			source,
			width,
			height,
			dynamic: false,
			uploaded: false,
			lastUploadFrame: -1,
			white,
			atlas: true,
			atlasKind: 'static',
			atlasPage: region.page,
			x: region.x,
			y: region.y
		}
	}

	function allocateReplayAtlasRegion(renderer, width, height) {
		for (const page of renderer.staticAtlasPages) {
			const region = tryAllocateReplayAtlasRegion(page, width, height, renderer.staticAtlasPadding)
			if (region) return region
		}
		if (width + renderer.staticAtlasPadding * 2 > renderer.staticAtlasPageSize ||
			height + renderer.staticAtlasPadding * 2 > renderer.staticAtlasPageSize) return null
		const page = createReplayAtlasPage(renderer)
		return tryAllocateReplayAtlasRegion(page, width, height, renderer.staticAtlasPadding)
	}

	function tryAllocateReplayAtlasRegion(page, width, height, padding) {
		const outerWidth = width + padding * 2
		const outerHeight = height + padding * 2
		if (outerWidth > page.width - padding * 2 || outerHeight > page.height - padding * 2) return null
		let x = page.cursorX
		let y = page.cursorY
		if (x + outerWidth > page.width - padding) {
			x = padding
			y += page.rowHeight
			page.cursorX = x
			page.cursorY = y
			page.rowHeight = 0
		}
		if (y + outerHeight > page.height - padding) return null
		page.cursorX = x + outerWidth
		page.rowHeight = Math.max(page.rowHeight, outerHeight)
		page.usedPixels += outerWidth * outerHeight
		page.entries++
		return {
			page,
			x: x + padding,
			y: y + padding,
			allocation: { x, y, width: outerWidth, height: outerHeight }
		}
	}

	function createReplayAtlasPage(renderer) {
		const gl = renderer.gl
		const texture = gl.createTexture()
		if (!texture) throw new Error('webgl-atlas-texture-create-failed')
		renderer.ownedTextures.add(texture)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, renderer.staticAtlasPageSize, renderer.staticAtlasPageSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
		const page = {
			texture,
			width: renderer.staticAtlasPageSize,
			height: renderer.staticAtlasPageSize,
			smoothing: false,
			cursorX: renderer.staticAtlasPadding,
			cursorY: renderer.staticAtlasPadding,
			rowHeight: 0,
			usedPixels: 0,
			entries: 0,
			atlasPage: true,
			atlasKind: 'static',
			index: renderer.staticAtlasPages.length
		}
		renderer.staticAtlasPages.push(page)
		return page
	}

	function destroyReplayAtlasPages(renderer) {
		if (!renderer?.staticAtlasPages) return
		for (const page of renderer.staticAtlasPages) {
			try { renderer.gl.deleteTexture(page.texture) } catch (error) {}
			renderer.ownedTextures?.delete(page.texture)
		}
		renderer.staticAtlasPages.length = 0
	}

	function createReplayDynamicAtlasEntry(renderer, source, size, tracker) {
		const width = Math.max(1, Math.floor(Number(size?.[0]) || 0))
		const height = Math.max(1, Math.floor(Number(size?.[1]) || 0))
		const region = allocateReplayDynamicAtlasRegion(renderer, width, height)
		if (!region) return null
		renderer.dynamicAtlasEntries++
		return {
			source,
			width,
			height,
			dynamic: true,
			uploaded: false,
			smoothing: null,
			lastUploadFrame: -1,
			lastSkipFrame: -1,
			lastSourceVersion: -1,
			white: false,
			atlas: true,
			atlasKind: 'dynamic',
			dynamicAtlas: true,
			atlasPage: region.page,
			allocation: region.allocation,
			x: region.x,
			y: region.y,
			tracker
		}
	}

	function allocateReplayDynamicAtlasRegion(renderer, width, height) {
		for (const page of renderer.dynamicAtlasPages) {
			const reused = tryReuseReplayDynamicAtlasRegion(page, width, height, renderer.dynamicAtlasPadding)
			if (reused) {
				renderer.dynamicSlotReuses++
				return reused
			}
			const region = tryAllocateReplayAtlasRegion(page, width, height, renderer.dynamicAtlasPadding)
			if (region) return region
		}
		if (width + renderer.dynamicAtlasPadding * 2 > renderer.dynamicAtlasPageSize ||
			height + renderer.dynamicAtlasPadding * 2 > renderer.dynamicAtlasPageSize ||
			renderer.dynamicAtlasPages.length >= renderer.dynamicAtlasMaxPages) return null
		const page = createReplayDynamicAtlasPage(renderer)
		return tryAllocateReplayAtlasRegion(page, width, height, renderer.dynamicAtlasPadding)
	}

	function tryReuseReplayDynamicAtlasRegion(page, width, height, padding) {
		const outerWidth = width + padding * 2
		const outerHeight = height + padding * 2
		let bestIndex = -1
		let bestArea = Infinity
		for (let i = 0; i < page.freeRegions.length; i++) {
			const region = page.freeRegions[i]
			if (region.width < outerWidth || region.height < outerHeight) continue
			const area = region.width * region.height
			if (area < bestArea) {
				bestArea = area
				bestIndex = i
			}
		}
		if (bestIndex < 0) return null
		const allocation = page.freeRegions.splice(bestIndex, 1)[0]
		page.usedPixels += allocation.width * allocation.height
		page.entries++
		return {
			page,
			x: allocation.x + padding,
			y: allocation.y + padding,
			allocation
		}
	}

	function createReplayDynamicAtlasPage(renderer) {
		const gl = renderer.gl
		const texture = gl.createTexture()
		if (!texture) throw new Error('webgl-dynamic-atlas-texture-create-failed')
		renderer.ownedTextures.add(texture)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, renderer.dynamicAtlasPageSize, renderer.dynamicAtlasPageSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
		const page = {
			texture,
			width: renderer.dynamicAtlasPageSize,
			height: renderer.dynamicAtlasPageSize,
			smoothing: false,
			cursorX: renderer.dynamicAtlasPadding,
			cursorY: renderer.dynamicAtlasPadding,
			rowHeight: 0,
			usedPixels: 0,
			entries: 0,
			freeRegions: [],
			atlasPage: true,
			atlasKind: 'dynamic',
			index: renderer.dynamicAtlasPages.length
		}
		renderer.dynamicAtlasPages.push(page)
		return page
	}

	function ensureReplayTextureSize(renderer, entry, size) {
		if (!entry?.dynamicAtlas || (entry.width === size[0] && entry.height === size[1])) return true
		releaseReplayDynamicAtlasSlot(entry)
		const region = allocateReplayDynamicAtlasRegion(renderer, size[0], size[1])
		if (!region) return convertReplayDynamicAtlasEntryToTexture(renderer, entry)
		entry.width = size[0]
		entry.height = size[1]
		entry.sourceKey = getSourceKey(entry.source)
		entry.atlasPage = region.page
		entry.allocation = region.allocation
		entry.x = region.x
		entry.y = region.y
		entry.uploaded = false
		entry.lastUploadFrame = -1
		entry.lastSourceVersion = -1
		renderer.dynamicAtlasReallocations++
		return true
	}

	function releaseReplayDynamicAtlasSlot(entry) {
		const page = entry?.atlasPage
		const allocation = entry?.allocation
		if (!page || !allocation || !Array.isArray(page.freeRegions)) return
		page.freeRegions.push(allocation)
		page.usedPixels = Math.max(0, page.usedPixels - allocation.width * allocation.height)
		page.entries = Math.max(0, page.entries - 1)
		entry.atlasPage = null
		entry.allocation = null
	}

	function convertReplayDynamicAtlasEntryToTexture(renderer, entry) {
		const texture = renderer.gl.createTexture()
		if (!texture) return false
		renderer.ownedTextures.add(texture)
		if (entry.dynamicAtlas) {
			releaseReplayDynamicAtlasSlot(entry)
			renderer.dynamicAtlasEntries = Math.max(0, renderer.dynamicAtlasEntries - 1)
		}
		entry.texture = texture
		entry.atlas = false
		entry.atlasKind = ''
		entry.dynamicAtlas = false
		entry.atlasPage = null
		entry.allocation = null
		entry.atlasFallback = entry.atlasFallback || 'dynamic-resize'
		entry.uploaded = false
		entry.width = 0
		entry.height = 0
		entry.lastUploadFrame = -1
		entry.lastSourceVersion = -1
		renderer.dynamicAtlasFallbackEntries++
		return true
	}

	function installReplayDynamicSourceTracker(renderer, source) {
		if (!renderer || !source || typeof source !== 'object') return null
		const existing = renderer.dynamicSourceTrackerMap.get(source)
		if (existing) return existing
		if (!getSourceKind(source).includes('canvas') || typeof source.getContext !== 'function') return null
		let context = null
		try { context = source.getContext('2d') } catch (error) {}
		if (!context) return null
		const tracker = {
			source,
			context,
			version: 0,
			mutations: 0,
			active: true,
			reliable: false,
			originals: new Map(),
			propertyRestorers: []
		}
		for (const methodName of dynamicSourceMutationMethods) {
			const original = context?.[methodName]
			if (typeof original !== 'function') continue
			const wrapper = function () {
				const result = original.apply(this, arguments)
				recordReplayDynamicMutation(tracker)
				return result
			}
			try { context[methodName] = wrapper } catch (error) { continue }
			if (context[methodName] !== wrapper) continue
			tracker.originals.set(methodName, { original, wrapper })
		}
		let trackedDimensions = 0
		for (const propertyName of ['width', 'height']) {
			if (installReplayCanvasPropertyTracker(tracker, propertyName)) trackedDimensions++
		}
		tracker.reliable = tracker.originals.size > 0 && trackedDimensions === 2
		renderer.dynamicSourceTrackerMap.set(source, tracker)
		renderer.dynamicSourceTrackers.add(tracker)
		return tracker
	}

	function installReplayCanvasPropertyTracker(tracker, propertyName) {
		const source = tracker.source
		const found = findReplayPropertyDescriptor(source, propertyName)
		const descriptor = found?.descriptor
		if (typeof descriptor?.get !== 'function' || typeof descriptor?.set !== 'function') return false
		const ownDescriptor = Object.getOwnPropertyDescriptor(source, propertyName)
		try {
			Object.defineProperty(source, propertyName, {
				configurable: true,
				enumerable: descriptor.enumerable === true,
				get() {
					return descriptor.get.call(this)
				},
				set(value) {
					descriptor.set.call(this, value)
					recordReplayDynamicMutation(tracker)
				}
			})
		} catch (error) {
			return false
		}
		tracker.propertyRestorers.push(function () {
			try {
				if (ownDescriptor) Object.defineProperty(source, propertyName, ownDescriptor)
				else delete source[propertyName]
			} catch (error) {}
		})
		return true
	}

	function findReplayPropertyDescriptor(value, propertyName) {
		let current = value
		while (current) {
			const descriptor = Object.getOwnPropertyDescriptor(current, propertyName)
			if (descriptor) return { owner: current, descriptor }
			current = Object.getPrototypeOf(current)
		}
		return null
	}

	function recordReplayDynamicMutation(tracker) {
		if (!tracker?.active) return
		tracker.version++
		tracker.mutations++
	}

	function markReplaySourceDirty(source) {
		const entry = replayRenderer?.textureEntries?.get(source)
		if (!entry?.dynamic) return false
		if (!entry.tracker) {
			entry.tracker = {
				source,
				version: 0,
				mutations: 0,
				active: true,
				reliable: true,
				manual: true,
				originals: new Map(),
				propertyRestorers: []
			}
			replayRenderer.dynamicSourceTrackerMap.set(source, entry.tracker)
			replayRenderer.dynamicSourceTrackers.add(entry.tracker)
		}
		entry.tracker.reliable = true
		recordReplayDynamicMutation(entry.tracker)
		return true
	}

	function sweepReplayDynamicEntries(renderer) {
		if (!renderer?.dynamicEntries || replayFrameId % dynamicEntrySweepInterval !== 0) return
		let evicted = false
		for (const entry of Array.from(renderer.dynamicEntries)) {
			if (replayFrameId - entry.lastUsedFrame <= dynamicEntryIdleFrameLimit) continue
			evictReplayDynamicEntry(renderer, entry)
			evicted = true
		}
		if (evicted) renderer.textureEntryList = renderer.textureEntryList.filter(function (entry) { return !entry.evicted })
	}

	function evictReplayDynamicEntry(renderer, entry) {
		if (!entry || entry.evicted) return
		entry.evicted = true
		renderer.textureEntries.delete(entry.source)
		renderer.dynamicEntries.delete(entry)
		if (entry.dynamicAtlas) {
			releaseReplayDynamicAtlasSlot(entry)
			renderer.dynamicAtlasEntries = Math.max(0, renderer.dynamicAtlasEntries - 1)
		} else if (entry.texture && renderer.ownedTextures.has(entry.texture)) {
			try { renderer.gl.deleteTexture(entry.texture) } catch (error) {}
			renderer.ownedTextures.delete(entry.texture)
		}
		if (entry.atlasFallback) renderer.dynamicAtlasFallbackEntries = Math.max(0, renderer.dynamicAtlasFallbackEntries - 1)
		if (entry.tracker) restoreReplayDynamicSourceTracker(renderer, entry.tracker)
		entry.source = null
		entry.tracker = null
		renderer.dynamicEntryEvictions++
	}

	function restoreReplayDynamicSourceTracker(renderer, tracker) {
		if (!tracker) return
		tracker.active = false
		for (const [methodName, record] of tracker.originals || []) {
			try {
				if (tracker.context?.[methodName] === record.wrapper) tracker.context[methodName] = record.original
			} catch (error) {}
		}
		for (let i = tracker.propertyRestorers.length - 1; i >= 0; i--) tracker.propertyRestorers[i]()
		if (tracker.source) renderer?.dynamicSourceTrackerMap?.delete(tracker.source)
		renderer?.dynamicSourceTrackers?.delete(tracker)
	}

	function restoreReplayDynamicSourceTrackers(renderer) {
		for (const tracker of Array.from(renderer?.dynamicSourceTrackers || [])) restoreReplayDynamicSourceTracker(renderer, tracker)
	}

	function createReplayWhiteTexture(renderer) {
		const gl = renderer.gl
		const texture = gl.createTexture()
		if (!texture) throw new Error('webgl-white-texture-create-failed')
		renderer.ownedTextures.add(texture)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
		return { texture, width: 1, height: 1, dynamic: false, uploaded: true, smoothing: false, lastUploadFrame: -1, white: true, atlas: false }
	}

	function syncReplayRenderer(renderer, targetCanvas) {
		const width = Math.max(1, Math.floor(Number(targetCanvas?.width) || 0))
		const height = Math.max(1, Math.floor(Number(targetCanvas?.height) || 0))
		if (renderer.canvas.width !== width || renderer.canvas.height !== height) {
			renderer.canvas.width = width
			renderer.canvas.height = height
			replayStats.resizes++
		}
		renderer.targetCanvas = targetCanvas
	}

	function beginReplayFrame(renderer) {
		const gl = renderer.gl
		gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
		gl.disable(gl.DEPTH_TEST)
		gl.disable(gl.CULL_FACE)
		gl.enable(gl.BLEND)
		gl.blendEquation(gl.FUNC_ADD)
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		gl.useProgram(renderer.program)
		gl.bindVertexArray(renderer.vao)
		gl.uniform2f(renderer.resolutionLocation, renderer.canvas.width, renderer.canvas.height)
		gl.activeTexture(gl.TEXTURE0)
		gl.uniform1i(renderer.textureLocation, 0)
		renderer.boundTexture = null
		renderer.batchEntry = null
		renderer.batchSmoothing = null
		renderer.batchQuads = 0
	}

	function appendReplayDrawImage(renderer, frame, command, report) {
		const source = frame.sourceRefs?.get(command.sourceKey)
		const size = getSourceSize(source)
		const clipped = normalizeReplayRects(command.sourceRect, command.destinationRect, size)
		if (!source || !size || !clipped || !Array.isArray(command.transform) || command.transform.length !== 6) return false
		const transform = command.transform.map(Number)
		if (!transform.every(Number.isFinite)) return false
		const destination = clipped.destination
		const x0 = destination[0]
		const y0 = destination[1]
		const x1 = x0 + destination[2]
		const y1 = y0 + destination[3]
		const positions = [
			transformReplayPoint(transform, x0, y0),
			transformReplayPoint(transform, x1, y0),
			transformReplayPoint(transform, x1, y1),
			transformReplayPoint(transform, x0, y1)
		]
		if (!positions.every(Boolean)) return false
		const sourceRect = clipped.source
		const smoothing = command.smoothing !== false
		const entry = getReplayTextureEntry(renderer, source)
		if (!entry || !ensureReplayTextureSize(renderer, entry, size)) return false
		const uvs = getReplayTextureUvs(entry, sourceRect, size, smoothing)
		if (!uvs) return false
		const alpha = Number(command.alpha)
		const color = [1, 1, 1, Number.isFinite(alpha) ? alpha : 1]
		const appended = appendReplayQuad(renderer, entry, smoothing, positions, uvs, color, report)
		if (appended) {
			entry.draws++
			entry.lastUsedFrame = replayFrameId
			if (entry.lastDrawFrame !== replayFrameId) {
				entry.frames++
				entry.lastDrawFrame = replayFrameId
			}
		}
		return appended
	}

	function appendReplayPolygon(renderer, command, report) {
		if (command.noop) return true
		if (!Array.isArray(command.points) || command.points.length < 3) return false
		const positions = normalizeReplayPoints(command.points)
		if (!positions) return false
		const color = parseReplayColor(command.fillStyle, command.alpha)
		const uvs = getReplayTextureUvs(renderer.whiteEntry, [0, 0, 1, 1], [1, 1], false)
		if (!color || !uvs) return false
		if (positions.length === 4 && isConvexPolygon(positions)) return appendReplayQuad(renderer, renderer.whiteEntry, false, positions, uvs, color, report)
		const triangles = triangulateReplayPolygon(positions)
		if (!triangles) return false
		for (const points of triangles) {
			const triangle = [points[0], points[1], points[2], points[2]]
			if (!appendReplayQuad(renderer, renderer.whiteEntry, false, triangle, uvs, color, report)) return false
		}
		return true
	}

	function appendReplayStroke(renderer, command, report) {
		if (command.noop) return true
		const geometry = buildReplayStrokeGeometry(command.points, Number(command.lineWidth), command.lineCap, Number(command.miterLimit))
		const color = parseReplayColor(command.strokeStyle, command.alpha)
		const uvs = getReplayTextureUvs(renderer.whiteEntry, [0, 0, 1, 1], [1, 1], false)
		if (!geometry || !color || !uvs) return false
		for (const points of geometry.triangles) {
			const triangle = [points[0], points[1], points[2], points[2]]
			if (!appendReplayQuad(renderer, renderer.whiteEntry, false, triangle, uvs, color, report)) return false
		}
		return true
	}

	function drawReplayRadialGradient(renderer, command, report) {
		const gradient = command?.gradient
		const rect = Array.from(command?.rect || []).map(Number)
		const transform = Array.from(command?.transform || []).map(Number)
		const center = Array.from(gradient?.center || []).map(Number)
		const radii = Array.from(gradient?.radii || []).map(Number)
		const stops = Array.from(gradient?.stops || [])
		const alpha = Number(command?.alpha)
		if (rect.length !== 4 || !rect.every(Number.isFinite) || transform.length !== 6 || !transform.every(Number.isFinite)) return false
		if (center.length !== 2 || !center.every(Number.isFinite) || radii.length !== 2 || !radii.every(Number.isFinite) || radii[0] < 0 || radii[1] <= radii[0]) return false
		if (stops.length < 2 || stops.length > 4 || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return false
		const x0 = rect[0]
		const y0 = rect[1]
		const x1 = x0 + rect[2]
		const y1 = y0 + rect[3]
		const positions = [
			transformReplayPoint(transform, x0, y0),
			transformReplayPoint(transform, x1, y0),
			transformReplayPoint(transform, x1, y1),
			transformReplayPoint(transform, x0, y1)
		]
		if (!positions.every(Boolean)) return false
		const offsets = stops.map(function (stop) { return Number(stop?.offset) })
		const colors = stops.map(function (stop) { return parseReplayColor(stop?.color, 1) })
		if (!offsets.every(Number.isFinite) || !colors.every(Boolean)) return false
		while (offsets.length < 4) offsets.push(offsets[offsets.length - 1])
		while (colors.length < 4) colors.push(colors[colors.length - 1])
		const resources = renderer.gradient
		if (!resources?.program || !resources?.vao || !resources?.vertexBuffer) return false
		for (let i = 0; i < positions.length; i++) {
			resources.vertices[i * 2] = positions[i][0]
			resources.vertices[i * 2 + 1] = positions[i][1]
		}
		const gl = renderer.gl
		try {
			gl.useProgram(resources.program)
			gl.bindVertexArray(resources.vao)
			gl.bindBuffer(gl.ARRAY_BUFFER, resources.vertexBuffer)
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, resources.vertices)
			gl.uniform2f(resources.locations.resolution, renderer.canvas.width, renderer.canvas.height)
			gl.uniform2f(resources.locations.center, center[0], center[1])
			gl.uniform2f(resources.locations.radii, radii[0], radii[1])
			gl.uniform4f(resources.locations.stopOffsets, offsets[0], offsets[1], offsets[2], offsets[3])
			for (let i = 0; i < 4; i++) gl.uniform4f(resources.locations.stopColors[i], colors[i][0], colors[i][1], colors[i][2], colors[i][3])
			gl.uniform1i(resources.locations.stopCount, stops.length)
			gl.uniform1f(resources.locations.globalAlpha, alpha)
			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
			report.quads++
			report.drawCalls++
			report.gradientDraws++
			return true
		} finally {
			restoreReplayTexturePipeline(renderer)
		}
	}

	function restoreReplayTexturePipeline(renderer) {
		const gl = renderer.gl
		gl.useProgram(renderer.program)
		gl.bindVertexArray(renderer.vao)
		gl.uniform2f(renderer.resolutionLocation, renderer.canvas.width, renderer.canvas.height)
		gl.activeTexture(gl.TEXTURE0)
		gl.uniform1i(renderer.textureLocation, 0)
		renderer.boundTexture = null
		renderer.batchEntry = null
		renderer.batchSmoothing = null
	}

	function buildReplayStrokeGeometry(points, lineWidth, lineCap, miterLimit) {
		const rawPoints = normalizeReplayPoints(points)
		if (!rawPoints || rawPoints.length < 2 || !Number.isFinite(lineWidth) || lineWidth <= 0) return null
		if (!Number.isFinite(miterLimit) || miterLimit <= 0) return null
		const normalized = []
		for (const point of rawPoints) {
			const previous = normalized[normalized.length - 1]
			if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.000001) normalized.push(point)
		}
		if (normalized.length < 2) return null
		const directions = []
		const normals = []
		for (let i = 0; i < normalized.length - 1; i++) {
			const dx = normalized[i + 1][0] - normalized[i][0]
			const dy = normalized[i + 1][1] - normalized[i][1]
			const length = Math.hypot(dx, dy)
			if (!Number.isFinite(length) || length <= 0.000001) return null
			const direction = [dx / length, dy / length]
			directions.push(direction)
			normals.push([-direction[1], direction[0]])
		}
		const half = lineWidth / 2
		const triangles = []
		for (let i = 0; i < normalized.length - 1; i++) {
			const direction = directions[i]
			const normal = normals[i]
			let start = normalized[i]
			let end = normalized[i + 1]
			if (lineCap === 'square' && i === 0) start = [start[0] - direction[0] * half, start[1] - direction[1] * half]
			if (lineCap === 'square' && i === normalized.length - 2) end = [end[0] + direction[0] * half, end[1] + direction[1] * half]
			const offset = [normal[0] * half, normal[1] * half]
			const segmentTriangles = triangulateReplayPolygon([
				[start[0] + offset[0], start[1] + offset[1]],
				[end[0] + offset[0], end[1] + offset[1]],
				[end[0] - offset[0], end[1] - offset[1]],
				[start[0] - offset[0], start[1] - offset[1]]
			])
			if (!segmentTriangles) return null
			triangles.push(...segmentTriangles)
		}
		for (let i = 1; i < normalized.length - 1; i++) {
			const previousDirection = directions[i - 1]
			const nextDirection = directions[i]
			const cross = previousDirection[0] * nextDirection[1] - previousDirection[1] * nextDirection[0]
			const dot = previousDirection[0] * nextDirection[0] + previousDirection[1] * nextDirection[1]
			if (Math.abs(cross) <= 0.000001) {
				if (dot < 0) return null
				continue
			}
			const center = normalized[i]
			const side = cross > 0 ? -1 : 1
			const previousOuterNormal = [normals[i - 1][0] * side, normals[i - 1][1] * side]
			const nextOuterNormal = [normals[i][0] * side, normals[i][1] * side]
			const previousOuter = [center[0] + previousOuterNormal[0] * half, center[1] + previousOuterNormal[1] * half]
			const nextOuter = [center[0] + nextOuterNormal[0] * half, center[1] + nextOuterNormal[1] * half]
			let tip = center.slice()
			const mx = previousOuterNormal[0] + nextOuterNormal[0]
			const my = previousOuterNormal[1] + nextOuterNormal[1]
			const miterLength = Math.hypot(mx, my)
			if (Number.isFinite(miterLength) && miterLength > 0.000001) {
				const miter = [mx / miterLength, my / miterLength]
				const denominator = miter[0] * nextOuterNormal[0] + miter[1] * nextOuterNormal[1]
				const ratio = Math.abs(1 / denominator)
				if (Number.isFinite(ratio) && Math.abs(denominator) > 0.000001 && ratio <= miterLimit) {
					tip = [center[0] + miter[0] * half / denominator, center[1] + miter[1] * half / denominator]
				}
			}
			triangles.push([previousOuter, tip, nextOuter])
		}
		if (lineCap === 'round') {
			triangles.push(...buildRoundCapTriangles(normalized[0], directions[0], half, true))
			triangles.push(...buildRoundCapTriangles(normalized[normalized.length - 1], directions[directions.length - 1], half, false))
		}
		return { triangles }
	}

	function buildRoundCapTriangles(center, direction, radius, start) {
		const triangles = []
		const segments = 12
		const baseAngle = Math.atan2(direction[1], direction[0])
		const firstAngle = baseAngle + (start ? -Math.PI / 2 : Math.PI / 2)
		let previous = [center[0] + Math.cos(firstAngle) * radius, center[1] + Math.sin(firstAngle) * radius]
		for (let i = 1; i <= segments; i++) {
			const angle = firstAngle - Math.PI * i / segments
			const next = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]
			triangles.push([center.slice(), previous, next])
			previous = next
		}
		return triangles
	}

	function normalizeReplayPoints(points) {
		if (!Array.isArray(points)) return null
		const normalized = points.map(function (point) {
			if (!Array.isArray(point) || point.length < 2) return null
			const x = Number(point[0])
			const y = Number(point[1])
			return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
		})
		return normalized.every(Boolean) ? normalized : null
	}

	function getReplayTextureUvs(entry, sourceRect, size, smoothing) {
		if (!entry || !Array.isArray(sourceRect) || !Array.isArray(size)) return null
		if (entry.atlas && entry.atlasPage) {
			const page = entry.atlasPage
			if (entry.white) {
				const u = (entry.x + 0.5) / page.width
				const v = (entry.y + 0.5) / page.height
				return [[u, v], [u, v], [u, v], [u, v]]
			}
			const sx = Number(sourceRect[0])
			const sy = Number(sourceRect[1])
			const sw = Number(sourceRect[2])
			const sh = Number(sourceRect[3])
			if (![sx, sy, sw, sh].every(Number.isFinite)) return null
			const insetX = smoothing ? Math.min(0.5, sw / 2) : 0
			const insetY = smoothing ? Math.min(0.5, sh / 2) : 0
			const u0 = (entry.x + sx + insetX) / page.width
			const v0 = (entry.y + sy + insetY) / page.height
			const u1 = (entry.x + sx + sw - insetX) / page.width
			const v1 = (entry.y + sy + sh - insetY) / page.height
			return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
		}
		const u0 = sourceRect[0] / size[0]
		const v0 = sourceRect[1] / size[1]
		const u1 = (sourceRect[0] + sourceRect[2]) / size[0]
		const v1 = (sourceRect[1] + sourceRect[3]) / size[1]
		return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
	}

	function normalizeReplayRects(sourceRect, destinationRect, size) {
		if (!Array.isArray(sourceRect) || !Array.isArray(destinationRect) || !Array.isArray(size)) return null
		let sx = Number(sourceRect[0])
		let sy = Number(sourceRect[1])
		let sw = Number(sourceRect[2])
		let sh = Number(sourceRect[3])
		let dx = Number(destinationRect[0])
		let dy = Number(destinationRect[1])
		let dw = Number(destinationRect[2])
		let dh = Number(destinationRect[3])
		if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return null
		const clippedLeft = Math.max(0, sx)
		const clippedTop = Math.max(0, sy)
		const clippedRight = Math.min(size[0], sx + sw)
		const clippedBottom = Math.min(size[1], sy + sh)
		if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null
		const leftRatio = (clippedLeft - sx) / sw
		const topRatio = (clippedTop - sy) / sh
		const widthRatio = (clippedRight - clippedLeft) / sw
		const heightRatio = (clippedBottom - clippedTop) / sh
		dx += dw * leftRatio
		dy += dh * topRatio
		dw *= widthRatio
		dh *= heightRatio
		return {
			source: [clippedLeft, clippedTop, clippedRight - clippedLeft, clippedBottom - clippedTop],
			destination: [dx, dy, dw, dh]
		}
	}

	function transformReplayPoint(matrix, x, y) {
		const px = matrix[0] * x + matrix[2] * y + matrix[4]
		const py = matrix[1] * x + matrix[3] * y + matrix[5]
		return Number.isFinite(px) && Number.isFinite(py) ? [px, py] : null
	}

	function parseReplayColor(value, alpha) {
		const hex = String(value || '').trim().replace(/^#/, '')
		let digits = hex
		if (digits.length === 3 || digits.length === 4) digits = digits.split('').map(function (part) { return part + part }).join('')
		if (digits.length !== 6 && digits.length !== 8) return null
		const number = Number.parseInt(digits, 16)
		if (!Number.isFinite(number)) return null
		const hasAlpha = digits.length === 8
		const red = hasAlpha ? (number >>> 24) & 255 : (number >>> 16) & 255
		const green = hasAlpha ? (number >>> 16) & 255 : (number >>> 8) & 255
		const blue = hasAlpha ? (number >>> 8) & 255 : number & 255
		const colorAlpha = hasAlpha ? (number & 255) / 255 : 1
		const globalAlpha = Number(alpha)
		return [red / 255, green / 255, blue / 255, colorAlpha * (Number.isFinite(globalAlpha) ? globalAlpha : 1)]
	}

	function getReplayTextureEntry(renderer, source) {
		let entry = renderer.textureEntries.get(source)
		if (entry) return entry
		const dynamic = isDynamicReplaySource(source)
		const size = getSourceSize(source)
		const tracker = dynamic && renderer.dynamicTrackingEnabled ? installReplayDynamicSourceTracker(renderer, source) : null
		let atlasFallback = ''
		if (renderer.dynamicAtlasEnabled && dynamic && size) {
			entry = createReplayDynamicAtlasEntry(renderer, source, size, tracker)
			if (entry) return registerReplayTextureEntry(renderer, source, entry)
			renderer.dynamicAtlasFallbackEntries++
			atlasFallback = 'dynamic'
		}
		if (renderer.staticAtlasEnabled && !dynamic && size) {
			entry = createReplayStaticAtlasEntry(renderer, source, size)
			if (entry) return registerReplayTextureEntry(renderer, source, entry)
			renderer.staticAtlasFallbackEntries++
			atlasFallback = 'static'
		}
		const texture = renderer.gl.createTexture()
		if (!texture) return null
		renderer.ownedTextures.add(texture)
		entry = {
			texture,
			source,
			width: 0,
			height: 0,
			dynamic,
			uploaded: false,
			smoothing: null,
			lastUploadFrame: -1,
			lastSkipFrame: -1,
			lastSourceVersion: -1,
			white: false,
			atlas: false,
			atlasKind: '',
			dynamicAtlas: false,
			atlasFallback,
			tracker
		}
		return registerReplayTextureEntry(renderer, source, entry)
	}

	function registerReplayTextureEntry(renderer, source, entry) {
		entry.sourceKey = getSourceKey(source)
		entry.sourceKind = getSourceKind(source)
		entry.draws = 0
		entry.frames = 0
		entry.uploads = 0
		entry.lastUsedFrame = replayFrameId
		entry.uploadSkips = 0
		entry.lastDrawFrame = -1
		renderer.textureEntries.set(source, entry)
		renderer.textureEntryList.push(entry)
		if (entry.dynamic) renderer.dynamicEntries.add(entry)
		return entry
	}

	function isDynamicReplaySource(source) {
		const kind = getSourceKind(source)
		return kind.includes('canvas') || kind.includes('video')
	}

	function appendReplayQuad(renderer, entry, smoothing, positions, uvs, color, report) {
		if (!entry) return false
		const batchEntry = entry.atlasPage || entry
		if (renderer.batchQuads && (renderer.batchEntry !== batchEntry || renderer.batchSmoothing !== smoothing)) flushReplayBatch(renderer, report)
		if (renderer.batchQuads >= replayBatchQuadLimit) flushReplayBatch(renderer, report)
		if (!prepareReplayTexture(renderer, entry, smoothing, report)) return false
		if (!renderer.batchQuads) {
			renderer.batchEntry = batchEntry
			renderer.batchSmoothing = smoothing
		}
		const base = renderer.batchQuads * 4 * renderer.floatsPerVertex
		for (let i = 0; i < 4; i++) {
			const offset = base + i * renderer.floatsPerVertex
			renderer.vertices[offset] = positions[i][0]
			renderer.vertices[offset + 1] = positions[i][1]
			renderer.vertices[offset + 2] = uvs[i][0]
			renderer.vertices[offset + 3] = uvs[i][1]
			renderer.vertices[offset + 4] = color[0]
			renderer.vertices[offset + 5] = color[1]
			renderer.vertices[offset + 6] = color[2]
			renderer.vertices[offset + 7] = color[3]
		}
		renderer.batchQuads++
		report.quads++
		return true
	}

	function prepareReplayTexture(renderer, entry, smoothing, report) {
		const gl = renderer.gl
		let source = null
		let size = null
		if (!entry.white) {
			source = entry.source
			if (!source) return false
			size = getSourceSize(source)
			if (!size) return false
			if (entry.atlas && (entry.width !== size[0] || entry.height !== size[1])) return false
		}
		const resource = entry.atlasPage || entry
		if (renderer.boundTexture !== resource.texture) {
			gl.bindTexture(gl.TEXTURE_2D, resource.texture)
			renderer.boundTexture = resource.texture
			report.textureBinds++
		}
		if (!entry.white) {
			const trackedVersion = entry.tracker?.reliable ? entry.tracker.version : null
			const dynamicDirty = entry.dynamic && (
				trackedVersion === null
					? entry.lastUploadFrame !== replayFrameId
					: entry.lastSourceVersion !== trackedVersion
			)
			const needsUpload = !entry.uploaded || entry.width !== size[0] || entry.height !== size[1] || dynamicDirty
			if (needsUpload) {
				try {
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
					gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
					if (entry.atlas) {
						gl.texSubImage2D(gl.TEXTURE_2D, 0, entry.x, entry.y, gl.RGBA, gl.UNSIGNED_BYTE, source)
						report.atlasUploads++
						if (entry.dynamicAtlas) report.dynamicAtlasUploads++
					} else {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
					}
					entry.width = size[0]
					entry.height = size[1]
					if (entry.dynamic) entry.sourceKey = getSourceKey(entry.source)
					entry.uploaded = true
					entry.lastUploadFrame = replayFrameId
					entry.lastSkipFrame = replayFrameId
					entry.lastSourceVersion = entry.tracker?.version ?? -1
					entry.uploads++
					report.textureUploads++
					if (entry.dynamic) report.dynamicUploads++
					else report.staticUploads++
				} catch (error) {
					report.uploadErrors++
					return false
				}
			} else if (entry.dynamic && trackedVersion !== null && entry.lastSkipFrame !== replayFrameId) {
				entry.lastSkipFrame = replayFrameId
				entry.uploadSkips++
				report.dynamicUploadSkips++
			}
		}
		if (resource.smoothing !== smoothing) {
			const filter = smoothing ? gl.LINEAR : gl.NEAREST
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
			resource.smoothing = smoothing
		}
		return true
	}

	function flushReplayBatch(renderer, report) {
		if (!renderer?.batchQuads) return
		const gl = renderer.gl
		const floatCount = renderer.batchQuads * 4 * renderer.floatsPerVertex
		gl.bindBuffer(gl.ARRAY_BUFFER, renderer.vertexBuffer)
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderer.vertices.subarray(0, floatCount))
		gl.drawElements(gl.TRIANGLES, renderer.batchQuads * 6, gl.UNSIGNED_SHORT, 0)
		report.drawCalls++
		renderer.batchQuads = 0
		renderer.batchEntry = null
		renderer.batchSmoothing = null
	}

	function syncReplayCanvasVisibility(renderer) {
		if (!renderer?.canvas) return
		if (!replayVisible) {
			try { renderer.canvas.remove() } catch (error) {}
			return
		}
		const target = renderer.targetCanvas
		const rect = target?.getBoundingClientRect?.()
		if (!rect || typeof document === 'undefined' || !document.body) return
		const style = renderer.canvas.style
		style.pointerEvents = 'none'
		style.opacity = String(replayOpacity)
		style.background = 'transparent'
		const parent = target?.parentNode
		if (replacementRequested && parent?.id === 'modloader-render-stack') {
			style.position = 'absolute'
			style.left = '0px'
			style.top = '0px'
			style.width = '100%'
			style.height = '100%'
			style.zIndex = String(replacementReplayZIndex)
			renderer.canvas.dataset.modloaderRenderOrder = String(replacementReplayOrder)
			const children = Array.from(parent.children)
			let before = null
			for (const child of children) {
				if (child === renderer.canvas) continue
				const order = Number(child.dataset?.modloaderRenderOrder)
				if (Number.isFinite(order) && order > replacementReplayOrder) {
					before = child
					break
				}
			}
			if (renderer.canvas.parentNode !== parent || renderer.canvas.nextSibling !== before) parent.insertBefore(renderer.canvas, before)
			return
		}
		delete renderer.canvas.dataset.modloaderRenderOrder
		style.position = 'fixed'
		style.left = rect.left + 'px'
		style.top = rect.top + 'px'
		style.width = rect.width + 'px'
		style.height = rect.height + 'px'
		const targetZIndex = typeof getComputedStyle === 'function' ? getComputedStyle(target).zIndex : target?.style?.zIndex
		style.zIndex = targetZIndex && targetZIndex !== 'auto' ? targetZIndex : ''
		if (parent && typeof parent.insertBefore === 'function') {
			if (renderer.canvas.parentNode !== parent || renderer.canvas.previousSibling !== target) parent.insertBefore(renderer.canvas, target.nextSibling)
		} else if (!renderer.canvas.isConnected) {
			document.body.appendChild(renderer.canvas)
		}
	}

	function isReplacementReplayLayerReady(mainCanvas) {
		const canvas = replayRenderer?.canvas
		const parent = mainCanvas?.parentNode
		if (!canvas || !parent || parent.id !== 'modloader-render-stack' || canvas.parentNode !== parent) return false
		if (Number(canvas.dataset?.modloaderRenderOrder) !== replacementReplayOrder) return false
		if (Number(canvas.style?.zIndex) !== replacementReplayZIndex) return false
		const children = Array.from(parent.children)
		const replayIndex = children.indexOf(canvas)
		const mainIndex = children.indexOf(mainCanvas)
		return replayIndex >= 0 && mainIndex >= 0 && replayIndex < mainIndex
	}

	function hideReplayCanvas() {
		replayVisible = false
		try { replayRenderer?.canvas?.remove() } catch (error) {}
	}

	function destroyReplayRenderer() {
		const renderer = replayRenderer
		if (!renderer) return
		try { renderer.canvas.remove() } catch (error) {}
		restoreReplayDynamicSourceTrackers(renderer)
		try {
			const gl = renderer.gl
			if (!renderer.contextLost) {
				for (const texture of renderer.ownedTextures || []) gl.deleteTexture(texture)
				gl.deleteBuffer(renderer.vertexBuffer)
				gl.deleteBuffer(renderer.indexBuffer)
				gl.deleteVertexArray(renderer.vao)
				gl.deleteProgram(renderer.program)
				gl.deleteBuffer(renderer.gradient?.vertexBuffer)
				gl.deleteVertexArray(renderer.gradient?.vao)
				gl.deleteProgram(renderer.gradient?.program)
			}
		} catch (error) {}
		replayRenderer = null
	}

	function getReplayStats() {
		return {
			enabled: replayEnabled,
			visible: replayVisible,
			opacity: replayOpacity,
			contextReady: !!replayRenderer?.gl && !replayRenderer?.contextLost,
			sampleCount: replaySamples.length,
			frames: replayStats.frames,
			commands: replayStats.commands,
			quads: replayStats.quads,
			drawCalls: replayStats.drawCalls,
			textureBinds: replayStats.textureBinds,
			textureUploads: replayStats.textureUploads,
			staticUploads: replayStats.staticUploads,
			dynamicUploads: replayStats.dynamicUploads,
			atlasUploads: replayStats.atlasUploads,
			dynamicAtlasUploads: replayStats.dynamicAtlasUploads,
			dynamicUploadSkips: replayStats.dynamicUploadSkips,
			gradientDraws: replayStats.gradientDraws,
			barriers: replayStats.barriers,
			segments: replayStats.segments,
			skippedCommands: replayStats.skippedCommands,
			skippedTargets: replayStats.skippedTargets,
			uploadErrors: replayStats.uploadErrors,
			errors: replayStats.errors,
			contextLosses: replayStats.contextLosses,
			resizes: replayStats.resizes,
			rendererCreates: replayStats.rendererCreates,
			avgCommandsPerFrame: roundNumber(getReplaySampleAverage('commands'), 3),
			avgQuadsPerFrame: roundNumber(getReplaySampleAverage('quads'), 3),
			avgDrawCallsPerFrame: roundNumber(getReplaySampleAverage('drawCalls'), 3),
			avgTextureBindsPerFrame: roundNumber(getReplaySampleAverage('textureBinds'), 3),
			avgTextureUploadsPerFrame: roundNumber(getReplaySampleAverage('textureUploads'), 3),
			avgAtlasUploadsPerFrame: roundNumber(getReplaySampleAverage('atlasUploads'), 3),
			avgDynamicAtlasUploadsPerFrame: roundNumber(getReplaySampleAverage('dynamicAtlasUploads'), 3),
			avgDynamicUploadSkipsPerFrame: roundNumber(getReplaySampleAverage('dynamicUploadSkips'), 3),
			avgGradientDrawsPerFrame: roundNumber(getReplaySampleAverage('gradientDraws'), 3),
			avgBarriersPerFrame: roundNumber(getReplaySampleAverage('barriers'), 3),
			avgSegmentsPerFrame: roundNumber(getReplaySampleAverage('segments'), 3),
			avgSkippedCommandsPerFrame: roundNumber(getReplaySampleAverage('skippedCommands'), 3),
			avgReplayMs: roundMs(getReplaySampleAverage('replayMs')),
			lastReplayMs: roundMs(replayStats.lastReplayMs),
			maxReplayMs: roundMs(replayStats.maxReplayMs),
			lastError: replayStats.lastError,
			replacement: getReplacementStats(),
			lastCanvasSize: Object.assign({}, replayStats.lastCanvasSize),
			staticAtlas: getReplayAtlasStats(),
			dynamicAtlas: getReplayDynamicAtlasStats(),
			sources: getReplaySourceStats(40)
		}
	}

	function getReplacementStats() {
		return {
			requested: replacementRequested,
			state: replacementState,
			active: replacementState === 'active',
			isolationReady: !!replacementCanvas && !!replacementContext,
			attemptedFrames: replacementStats.attemptedFrames,
			activeFrames: replacementStats.activeFrames,
			fallbacks: replacementStats.fallbacks,
			resizeTransitions: replacementStats.resizeTransitions,
			lastResize: replacementLastResize ? cloneValue(replacementLastResize) : null,
			lastFallback: replacementLastFallback,
			layerRoutingReady: !!replacementRenderScope && !!replacementRenderApi,
			replayOrder: replacementReplayOrder,
			replayZIndex: replacementReplayZIndex
		}
	}

	function getReplayAtlasStats() {
		const renderer = replayRenderer
		const pages = renderer?.staticAtlasPages || []
		let usedPixels = 0
		for (const page of pages) usedPixels += Number(page.usedPixels) || 0
		const pageSize = renderer?.staticAtlasPageSize || normalizeAtlasPageSize(replayStaticAtlasPageSize)
		const capacityPixels = pages.length * pageSize * pageSize
		return {
			configuredEnabled: replayStaticAtlasEnabled,
			enabled: renderer ? renderer.staticAtlasEnabled : replayStaticAtlasEnabled,
			pageSize,
			padding: renderer?.staticAtlasPadding ?? staticAtlasPadding,
			pages: pages.length,
			entries: renderer?.staticAtlasEntries || 0,
			fallbackEntries: renderer?.staticAtlasFallbackEntries || 0,
			usedPixels,
			capacityPixels,
			utilization: capacityPixels ? roundNumber(usedPixels / capacityPixels, 4) : 0,
			whiteInAtlas: !!renderer?.whiteEntry?.atlas
		}
	}

	function getReplayDynamicAtlasStats() {
		const renderer = replayRenderer
		const pages = renderer?.dynamicAtlasPages || []
		const trackers = Array.from(renderer?.dynamicSourceTrackers || [])
		let usedPixels = 0
		let mutations = 0
		let reliableTrackers = 0
		let freeSlots = 0
		for (const page of pages) {
			usedPixels += Number(page.usedPixels) || 0
			freeSlots += page.freeRegions?.length || 0
		}
		for (const tracker of trackers) {
			mutations += Number(tracker.mutations) || 0
			if (tracker.reliable) reliableTrackers++
		}
		const pageSize = renderer?.dynamicAtlasPageSize || normalizeAtlasPageSize(replayDynamicAtlasPageSize)
		const capacityPixels = pages.length * pageSize * pageSize
		return {
			configuredEnabled: replayDynamicAtlasEnabled,
			enabled: renderer ? renderer.dynamicAtlasEnabled : replayDynamicAtlasEnabled,
			trackingConfigured: replayDynamicTrackingEnabled,
			trackingEnabled: renderer ? renderer.dynamicTrackingEnabled : replayDynamicTrackingEnabled,
			pageSize,
			padding: renderer?.dynamicAtlasPadding ?? dynamicAtlasPadding,
			maxPages: renderer?.dynamicAtlasMaxPages || replayDynamicAtlasMaxPages,
			pages: pages.length,
			entries: renderer?.dynamicAtlasEntries || 0,
			fallbackEntries: renderer?.dynamicAtlasFallbackEntries || 0,
			reallocations: renderer?.dynamicAtlasReallocations || 0,
			activeEntries: renderer?.dynamicEntries?.size || 0,
			evictions: renderer?.dynamicEntryEvictions || 0,
			slotReuses: renderer?.dynamicSlotReuses || 0,
			freeSlots,
			idleFrameLimit: dynamicEntryIdleFrameLimit,
			sweepInterval: dynamicEntrySweepInterval,
			trackers: trackers.length,
			reliableTrackers,
			mutations,
			uploads: replayStats.dynamicAtlasUploads,
			uploadSkips: replayStats.dynamicUploadSkips,
			usedPixels,
			capacityPixels,
			utilization: capacityPixels ? roundNumber(usedPixels / capacityPixels, 4) : 0
		}
	}

	function getReplaySourceStats(limit = 40) {
		const entries = replayRenderer?.textureEntryList || []
		return entries.map(function (entry) {
			return {
				source: entry.sourceKey || 'unknown-source',
				kind: entry.sourceKind || 'unknown',
				width: Number(entry.width) || 0,
				height: Number(entry.height) || 0,
				dynamic: entry.dynamic === true,
				atlas: entry.atlasKind || 'none',
				page: entry.atlasPage?.index ?? null,
				fallback: entry.atlasFallback || '',
				tracked: !!entry.tracker,
				reliable: entry.tracker?.reliable === true,
				mutations: Number(entry.tracker?.mutations) || 0,
				draws: Number(entry.draws) || 0,
				frames: Number(entry.frames) || 0,
				uploads: Number(entry.uploads) || 0,
				uploadSkips: Number(entry.uploadSkips) || 0
			}
		}).sort(function (a, b) {
			return (b.draws - a.draws) ||
				(b.uploads - a.uploads) ||
				String(a.source).localeCompare(String(b.source))
		}).slice(0, normalizeLimit(limit, 40, 200))
	}

	function getReplaySampleAverage(key) {
		if (!replaySamples.length) return 0
		let total = 0
		for (const sample of replaySamples) total += Number(sample?.[key]) || 0
		return total / replaySamples.length
	}

	function resetReplayStats() {
		for (const key of ['frames', 'commands', 'quads', 'drawCalls', 'textureBinds', 'textureUploads', 'staticUploads', 'dynamicUploads', 'atlasUploads', 'dynamicAtlasUploads', 'dynamicUploadSkips', 'gradientDraws', 'barriers', 'segments', 'skippedCommands', 'skippedTargets', 'uploadErrors', 'errors', 'contextLosses', 'resizes', 'rendererCreates', 'replayMs', 'lastReplayMs', 'maxReplayMs']) replayStats[key] = 0
		replayStats.lastError = ''
		replayStats.lastCanvasSize = { width: 0, height: 0 }
		replaySamples.length = 0
		lastReplay = null
		replacementStats.attemptedFrames = 0
		replacementStats.activeFrames = 0
		replacementStats.fallbacks = 0
		replacementStats.resizeTransitions = 0
		replacementLastResize = null
		replacementLastFallback = ''
	}

	function getStats(api) {
		return {
			enabled: isEnabled(api),
			configuredEnabled: api?.config?.get(configKey, false) === true,
			runtimeOverride: runtimeEnabled,
			previewEnabled,
			previewLimit,
			sampleLimit,
			sampleCount: samples.length,
			sourceDiagnosticEntries: sourceTotals.size,
			frames: stats.frames,
			drawImages: stats.drawImages,
			supportedDrawImages: stats.supportedDrawImages,
			unsupportedDrawImages: stats.unsupportedDrawImages,
			polygonFills: stats.polygonFills,
			supportedPolygonFills: stats.supportedPolygonFills,
			pathStrokes: stats.pathStrokes,
			supportedPathStrokes: stats.supportedPathStrokes,
			fillRects: stats.fillRects,
			supportedFillRects: stats.supportedFillRects,
			radialGradientFillRects: stats.radialGradientFillRects,
			unsupportedPaints: stats.unsupportedPaints,
			quadCoverage: getCoverage(stats.supportedDrawImages + stats.supportedPolygonFills + stats.supportedPathStrokes + stats.supportedFillRects, stats.drawImages + stats.supportedPolygonFills + stats.supportedPathStrokes + stats.supportedFillRects + stats.unsupportedPaints),
			avgDrawImagesPerFrame: roundNumber(getSampleAverage('drawImages'), 3),
			avgSupportedDrawImagesPerFrame: roundNumber(getSampleAverage('supportedDrawImages'), 3),
			avgSupportedPolygonFillsPerFrame: roundNumber(getSampleAverage('supportedPolygonFills'), 3),
			avgSupportedPathStrokesPerFrame: roundNumber(getSampleAverage('supportedPathStrokes'), 3),
			avgSupportedFillRectsPerFrame: roundNumber(getSampleAverage('supportedFillRects'), 3),
			avgRadialGradientFillRectsPerFrame: roundNumber(getSampleAverage('radialGradientFillRects'), 3),
			avgAdjacentBatchesPerFrame: roundNumber(getSampleAverage('adjacentBatches'), 3),
			avgAtlasBatchesPerFrame: roundNumber(getSampleAverage('atlasBatches'), 3),
			avgTextureSwitchesPerFrame: roundNumber(getSampleAverage('textureSwitches'), 3),
			avgForcedFlushesPerFrame: roundNumber(getSampleAverage('forcedFlushes'), 3),
			avgRecordingMs: roundMs(getSampleAverage('recordingMs')),
			lastRecordingMs: roundMs(stats.lastRecordingMs),
			maxRecordingMs: roundMs(stats.maxRecordingMs),
			contextsWrapped: stats.contextsWrapped,
			contextsSkipped: stats.contextsSkipped,
			recordingErrors: stats.recordingErrors,
			fallbacks: stats.fallbacks,
			lastFallback: stats.lastFallback,
			fallbackReasons: Object.assign({}, stats.fallbackReasons),
			replay: getReplayStats(),
			replacement: getReplacementStats()
		}
	}

	function getSampleAverage(key) {
		if (!samples.length) return 0
		let total = 0
		for (const sample of samples) total += Number(sample?.[key]) || 0
		return total / samples.length
	}

	function resetStats() {
		stats.frames = 0
		stats.drawImages = 0
		stats.supportedDrawImages = 0
		stats.unsupportedDrawImages = 0
		stats.polygonFills = 0
		stats.supportedPolygonFills = 0
		stats.pathStrokes = 0
		stats.supportedPathStrokes = 0
		stats.fillRects = 0
		stats.supportedFillRects = 0
		stats.radialGradientFillRects = 0
		stats.unsupportedPaints = 0
		stats.adjacentBatches = 0
		stats.atlasBatches = 0
		stats.textureSwitches = 0
		stats.forcedFlushes = 0
		stats.contextsWrapped = 0
		stats.contextsSkipped = 0
		stats.recordingErrors = 0
		stats.recordingMs = 0
		stats.maxRecordingMs = 0
		stats.lastRecordingMs = 0
		stats.lastFallback = ''
		stats.fallbacks = 0
		stats.fallbackReasons = {}
		sourceTotals.clear()
		unsupportedTotals.clear()
		operationTotals.clear()
		targetTotals.clear()
		samples.length = 0
		lastFrame = null
		resetReplayStats()
	}

	function isEnabled(api) {
		if (runtimeEnabled !== null) return runtimeEnabled === true
		if (previewEnabled !== null) return previewEnabled === true
		return api?.config?.get(configKey, false) === true
	}

	function recordFrameError(frame, reason) {
		frame.recordingErrors++
		incrementMap(frame.unsupportedCounts, 'recorder-error-' + reason)
	}

	function recordFallback(reason) {
		stats.fallbacks++
		stats.lastFallback = reason || 'unknown'
		incrementCount(stats.fallbackReasons, stats.lastFallback)
	}

	function incrementMap(map, key, count = 1) {
		const name = String(key || 'unknown')
		map.set(name, (map.get(name) || 0) + count)
	}

	function mergeMap(target, source) {
		for (const [key, value] of source) incrementMap(target, key, value)
	}

	function trimMapOldest(map, maximum) {
		while (map.size > maximum) {
			const oldest = map.keys().next()
			if (oldest.done) break
			map.delete(oldest.value)
		}
	}

	function listMap(map, keyName, limit) {
		return Array.from(map.entries())
			.map(function (entry) { return { [keyName]: entry[0], calls: entry[1] } })
			.sort(function (a, b) { return (b.calls - a.calls) || String(a[keyName]).localeCompare(String(b[keyName])) })
			.slice(0, limit)
	}

	function incrementCount(target, key) {
		const name = String(key || 'unknown')
		target[name] = (target[name] || 0) + 1
	}

	function getCoverage(supported, total) {
		return total ? roundNumber(supported / total, 4) : 0
	}

	function normalizeAtlasPageSize(value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return defaultStaticAtlasPageSize
		return Math.max(256, Math.min(8192, Math.floor(number)))
	}

	function normalizeDynamicAtlasMaxPages(value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return defaultDynamicAtlasMaxPages
		return Math.max(1, Math.min(32, Math.floor(number)))
	}

	function normalizeLimit(value, fallback, maximum) {
		const number = Number(value)
		if (!Number.isFinite(number)) return fallback
		return Math.max(1, Math.min(maximum, Math.floor(number)))
	}

	function cloneValue(value) {
		if (value === null || value === undefined) return value
		try { return JSON.parse(JSON.stringify(value)) } catch (error) { return null }
	}

	function now() {
		return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
	}

	function roundMs(value) {
		return Math.round((Number(value) || 0) * 1000) / 1000
	}

	function roundNumber(value, digits) {
		const number = Number(value)
		if (!Number.isFinite(number)) return 0
		const scale = Math.pow(10, digits)
		return Math.round(number * scale) / scale
	}
})()
