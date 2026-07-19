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
	const sourceIds = new WeakMap()
	const targetIds = new WeakMap()
	const sourceTotals = new Map()
	const unsupportedTotals = new Map()
	const operationTotals = new Map()
	const targetTotals = new Map()
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

	const stats = {
		frames: 0,
		drawImages: 0,
		supportedDrawImages: 0,
		unsupportedDrawImages: 0,
		polygonFills: 0,
		supportedPolygonFills: 0,
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
		'stroke',
		'fillRect',
		'strokeRect',
		'clearRect',
		'fillText',
		'strokeText',
		'putImageData'
	]
	const unsupportedPathMethods = [
		'arc',
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
				const frame = createFrame(this)
				const restorers = []
				currentFrame = frame
				try {
					wrapTargetContexts(this, frame, restorers)
					return original.apply(this, arguments)
				} catch (error) {
					recordFallback('render-exception')
					throw error
				} finally {
					for (let i = restorers.length - 1; i >= 0; i--) {
						try { restorers[i]() } catch (error) { recordFrameError(frame, 'restore') }
					}
					currentFrame = null
					finalizeFrame(frame)
				}
			}
		})
	}

	function installDebugApi(api) {
		window[apiKey] = {
			enable(options = {}) {
				runtimeEnabled = true
				replayEnabled = options.replay === true
				applyRuntimeOptions(options)
				if (options.clear !== false) resetStats()
				return this.stats()
			},
			enableReplay(options = {}) {
				runtimeEnabled = true
				replayEnabled = true
				applyRuntimeOptions(options)
				if (options.clear !== false) resetStats()
				return this.stats()
			},
			disableReplay() {
				replayEnabled = false
				hideReplayCanvas()
				return this.stats()
			},
			disable() {
				runtimeEnabled = false
				replayEnabled = false
				hideReplayCanvas()
				return this.stats()
			},
			useConfig() {
				runtimeEnabled = null
				replayEnabled = false
				hideReplayCanvas()
				return this.stats()
			},
			showReplay(options = {}) {
				replayVisible = true
				const opacity = Number(options.opacity)
				if (Number.isFinite(opacity)) replayOpacity = Math.max(0, Math.min(1, opacity))
				syncReplayCanvasVisibility(replayRenderer)
				return this.stats()
			},
			hideReplay() {
				hideReplayCanvas()
				return this.stats()
			},
			replayCanvas() {
				return replayRenderer?.canvas || null
			},
			destroyReplay() {
				replayEnabled = false
				destroyReplayRenderer()
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
					topTargets: listMap(targetTotals, 'target', 20)
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
		if (Object.prototype.hasOwnProperty.call(options, 'staticAtlas')) replayStaticAtlasEnabled = options.staticAtlas !== false
		if (Object.prototype.hasOwnProperty.call(options, 'atlas')) replayStaticAtlasEnabled = options.atlas !== false
		if (Object.prototype.hasOwnProperty.call(options, 'atlasSize') || Object.prototype.hasOwnProperty.call(options, 'staticAtlasSize')) {
			replayStaticAtlasPageSize = normalizeAtlasPageSize(options.atlasSize || options.staticAtlasSize)
		}
		if (replayRenderer && (previousAtlasEnabled !== replayStaticAtlasEnabled || previousAtlasPageSize !== replayStaticAtlasPageSize)) destroyReplayRenderer()
	}

	function createFrame(game) {
		const replayTarget = game?.ctx?.canvas || null
		return {
			drawImages: 0,
			supportedDrawImages: 0,
			unsupportedDrawImages: 0,
			polygonFills: 0,
			supportedPolygonFills: 0,
			unsupportedPaints: 0,
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
			replayTargetKey: replayTarget ? getTargetKey(game?.ctx) : '',
			replaySkippedTargets: 0,
			sourceRefs: replayEnabled ? new Map() : null
		}
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
		for (const methodName of unsupportedPaintMethods) {
			wrapped += wrapContextMethod(ctx, methodName, function () {
				recordTimed(frame, function () { recordUnsupportedPaint(frame, ctx, methodName) })
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
		if (!meta.path) meta.path = { subpaths: [], current: null, unsupported: '' }
		if (meta.path.unsupported) return
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
			meta.path.unsupported = 'path-line-without-move'
			return
		}
		meta.path.current.points.push(point)
	}

	function recordPathClose(meta) {
		if (!meta.path?.current) {
			if (meta.path) meta.path.unsupported = 'path-close-without-subpath'
			return
		}
		meta.path.current.closed = true
	}

	function recordUnsupportedPath(meta, operation) {
		if (!meta.path) meta.path = { subpaths: [], current: null, unsupported: '' }
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
			recordSupportedCommand(frame, command)
		} else {
			frame.unsupportedPaints++
			incrementMap(frame.unsupportedCounts, command.reason || 'canvas-fill')
			recordBarrier(frame)
		}
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
	}

	function describePolygonFill(ctx, meta, args) {
		const targetKey = getTargetKey(ctx)
		const firstArg = args?.[0]
		const fillRule = typeof firstArg === 'string' ? firstArg : 'nonzero'
		const path = meta.path
		const composite = String(ctx?.globalCompositeOperation || 'source-over')
		const alpha = Number(ctx?.globalAlpha)
		const fillStyle = typeof ctx?.fillStyle === 'string' ? ctx.fillStyle : ''
		const filter = String(ctx?.filter || 'none')
		let reason = ''
		if (firstArg && typeof firstArg !== 'string') reason = 'fill-path2d'
		else if (!path) reason = 'fill-missing-path'
		else if (path.unsupported) reason = path.unsupported
		else if (path.subpaths.length !== 1) reason = 'path-subpaths'
		else if (!path.subpaths[0]?.closed) reason = 'path-open'
		else if (path.subpaths[0].points.length !== 4) reason = 'path-not-quad'
		else if (!isConvexQuad(path.subpaths[0].points)) reason = 'path-nonconvex'
		else if (!isSolidColor(fillStyle)) reason = 'fill-style'
		else if (meta.clipActive) reason = 'clip-active'
		else if (composite !== 'source-over') reason = 'composite-' + composite
		else if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) reason = 'global-alpha'
		else if (filter && filter !== 'none') reason = 'filter-active'
		else if (hasActiveShadow(ctx)) reason = 'shadow-active'
		return {
			type: 'polygon',
			operation: 'fill',
			supported: !reason,
			reason,
			targetKey,
			sourceKey: 'solid-white',
			points: !reason ? path.subpaths[0].points.map(function (point) { return point.slice() }) : null,
			fillStyle,
			fillRule,
			alpha: Number.isFinite(alpha) ? roundNumber(alpha, 4) : null,
			composite,
			filter,
			smoothing: false
		}
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

	function isConvexQuad(points) {
		if (!Array.isArray(points) || points.length !== 4) return false
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

	function recordUnsupportedPaint(frame, ctx, methodName) {
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
		recordBarrier(frame)
		pushReplayCommand(frame, command)
		pushCommandPreview(frame, command)
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

	function finalizeFrame(frame) {
		const replayReport = replayEnabled ? replayRecordedFrame(frame) : null
		const report = {
			frame: stats.frames + 1,
			drawImages: frame.drawImages,
			supportedDrawImages: frame.supportedDrawImages,
			unsupportedDrawImages: frame.unsupportedDrawImages,
			polygonFills: frame.polygonFills,
			supportedPolygonFills: frame.supportedPolygonFills,
			unsupportedPaints: frame.unsupportedPaints,
			quadCoverage: getCoverage(frame.supportedDrawImages + frame.supportedPolygonFills, frame.drawImages + frame.supportedPolygonFills + frame.unsupportedPaints),
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
		mergeMap(unsupportedTotals, frame.unsupportedCounts)
		mergeMap(operationTotals, frame.operationCounts)
		mergeMap(targetTotals, frame.targetCounts)
		samples.push({
			drawImages: frame.drawImages,
			supportedDrawImages: frame.supportedDrawImages,
			supportedPolygonFills: frame.supportedPolygonFills,
			unsupportedPaints: frame.unsupportedPaints,
			adjacentBatches: frame.adjacentBatches,
			atlasBatches: frame.atlasBatches,
			textureSwitches: frame.textureSwitches,
			forcedFlushes: frame.forcedFlushes,
			recordingMs: frame.recordingMs
		})
		while (samples.length > sampleLimit) samples.shift()
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
			prepareReplayStaticAtlas(renderer, frame)
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
				if (!appended) {
					flushReplayBatch(renderer, report)
					report.skippedCommands++
					segmentOpen = false
				}
			}
			flushReplayBatch(renderer, report)
			renderer.gl.flush()
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
			textureEntries: new WeakMap(),
			whiteEntry: null,
			ownedTextures: new Set(),
			staticAtlasEnabled: replayStaticAtlasEnabled && typeof gl.texSubImage2D === 'function',
			staticAtlasPageSize: resolveReplayAtlasPageSize(gl),
			staticAtlasPadding,
			staticAtlasPages: [],
			staticAtlasEntries: 0,
			staticAtlasFallbackEntries: 0,
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

	function prepareReplayStaticAtlas(renderer, frame) {
		if (!renderer?.staticAtlasEnabled || !frame?.replayCommands || !frame.sourceRefs) return
		const seen = new Set()
		for (const command of frame.replayCommands) {
			if (!command?.supported || command.type !== 'drawImage') continue
			const source = frame.sourceRefs.get(command.sourceKey)
			if (!source || seen.has(source) || isDynamicReplaySource(source)) continue
			seen.add(source)
			getReplayTextureEntry(renderer, source)
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
		return { page, x: x + padding, y: y + padding }
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
			atlasPage: true
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
		const uvs = getReplayTextureUvs(entry, sourceRect, size, smoothing)
		if (!uvs) return false
		const alpha = Number(command.alpha)
		const color = [1, 1, 1, Number.isFinite(alpha) ? alpha : 1]
		return appendReplayQuad(renderer, entry, smoothing, positions, uvs, color, report)
	}

	function appendReplayPolygon(renderer, command, report) {
		if (!Array.isArray(command.points) || command.points.length !== 4) return false
		const positions = command.points.map(function (point) {
			if (!Array.isArray(point) || point.length < 2) return null
			const x = Number(point[0])
			const y = Number(point[1])
			return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
		})
		if (!positions.every(Boolean)) return false
		const color = parseReplayColor(command.fillStyle, command.alpha)
		const uvs = getReplayTextureUvs(renderer.whiteEntry, [0, 0, 1, 1], [1, 1], false)
		if (!color || !uvs) return false
		return appendReplayQuad(renderer, renderer.whiteEntry, false, positions, uvs, color, report)
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
		if (renderer.staticAtlasEnabled && !dynamic && size) {
			entry = createReplayStaticAtlasEntry(renderer, source, size)
			if (entry) {
				renderer.textureEntries.set(source, entry)
				return entry
			}
			renderer.staticAtlasFallbackEntries++
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
			white: false,
			atlas: false
		}
		renderer.textureEntries.set(source, entry)
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
		const resource = entry.atlasPage || entry
		if (renderer.boundTexture !== resource.texture) {
			gl.bindTexture(gl.TEXTURE_2D, resource.texture)
			renderer.boundTexture = resource.texture
			report.textureBinds++
		}
		if (!entry.white) {
			const source = entry.source
			if (!source) return false
			const size = getSourceSize(source)
			if (!size) return false
			if (entry.atlas && (entry.width !== size[0] || entry.height !== size[1])) return false
			const needsUpload = !entry.uploaded || entry.width !== size[0] || entry.height !== size[1] || (entry.dynamic && entry.lastUploadFrame !== replayFrameId)
			if (needsUpload) {
				try {
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
					gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
					if (entry.atlas) {
						gl.texSubImage2D(gl.TEXTURE_2D, 0, entry.x, entry.y, gl.RGBA, gl.UNSIGNED_BYTE, source)
						report.atlasUploads++
					} else {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
					}
					entry.width = size[0]
					entry.height = size[1]
					entry.uploaded = true
					entry.lastUploadFrame = replayFrameId
					report.textureUploads++
					if (entry.dynamic) report.dynamicUploads++
					else report.staticUploads++
				} catch (error) {
					report.uploadErrors++
					return false
				}
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
		style.position = 'fixed'
		style.left = rect.left + 'px'
		style.top = rect.top + 'px'
		style.width = rect.width + 'px'
		style.height = rect.height + 'px'
		style.pointerEvents = 'none'
		style.zIndex = '2147483646'
		style.opacity = String(replayOpacity)
		style.background = 'transparent'
		if (!renderer.canvas.isConnected) document.body.appendChild(renderer.canvas)
	}

	function hideReplayCanvas() {
		replayVisible = false
		try { replayRenderer?.canvas?.remove() } catch (error) {}
	}

	function destroyReplayRenderer() {
		const renderer = replayRenderer
		if (!renderer) return
		try { renderer.canvas.remove() } catch (error) {}
		try {
			const gl = renderer.gl
			if (!renderer.contextLost) {
				for (const texture of renderer.ownedTextures || []) gl.deleteTexture(texture)
				gl.deleteBuffer(renderer.vertexBuffer)
				gl.deleteBuffer(renderer.indexBuffer)
				gl.deleteVertexArray(renderer.vao)
				gl.deleteProgram(renderer.program)
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
			avgBarriersPerFrame: roundNumber(getReplaySampleAverage('barriers'), 3),
			avgSegmentsPerFrame: roundNumber(getReplaySampleAverage('segments'), 3),
			avgSkippedCommandsPerFrame: roundNumber(getReplaySampleAverage('skippedCommands'), 3),
			avgReplayMs: roundMs(getReplaySampleAverage('replayMs')),
			lastReplayMs: roundMs(replayStats.lastReplayMs),
			maxReplayMs: roundMs(replayStats.maxReplayMs),
			lastError: replayStats.lastError,
			lastCanvasSize: Object.assign({}, replayStats.lastCanvasSize),
			staticAtlas: getReplayAtlasStats()
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

	function getReplaySampleAverage(key) {
		if (!replaySamples.length) return 0
		let total = 0
		for (const sample of replaySamples) total += Number(sample?.[key]) || 0
		return total / replaySamples.length
	}

	function resetReplayStats() {
		for (const key of ['frames', 'commands', 'quads', 'drawCalls', 'textureBinds', 'textureUploads', 'staticUploads', 'dynamicUploads', 'atlasUploads', 'barriers', 'segments', 'skippedCommands', 'skippedTargets', 'uploadErrors', 'errors', 'contextLosses', 'resizes', 'rendererCreates', 'replayMs', 'lastReplayMs', 'maxReplayMs']) replayStats[key] = 0
		replayStats.lastError = ''
		replayStats.lastCanvasSize = { width: 0, height: 0 }
		replaySamples.length = 0
		lastReplay = null
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
			frames: stats.frames,
			drawImages: stats.drawImages,
			supportedDrawImages: stats.supportedDrawImages,
			unsupportedDrawImages: stats.unsupportedDrawImages,
			polygonFills: stats.polygonFills,
			supportedPolygonFills: stats.supportedPolygonFills,
			unsupportedPaints: stats.unsupportedPaints,
			quadCoverage: getCoverage(stats.supportedDrawImages + stats.supportedPolygonFills, stats.drawImages + stats.supportedPolygonFills + stats.unsupportedPaints),
			avgDrawImagesPerFrame: roundNumber(getSampleAverage('drawImages'), 3),
			avgSupportedDrawImagesPerFrame: roundNumber(getSampleAverage('supportedDrawImages'), 3),
			avgSupportedPolygonFillsPerFrame: roundNumber(getSampleAverage('supportedPolygonFills'), 3),
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
			replay: getReplayStats()
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
