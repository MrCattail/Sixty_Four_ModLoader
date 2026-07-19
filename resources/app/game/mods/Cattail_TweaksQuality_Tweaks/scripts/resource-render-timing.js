(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailResourceRenderTimingInstalled'
	const apiKey = 'CattailTweaksResourceRenderTiming'
	const defaultSampleLimit = 240
	let enabled = false
	let sampleLimit = defaultSampleLimit
	let renderCycles = 0
	const records = {}
	const measureStack = []

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installResourceRenderTiming(api)
			})
		}
	})

	function installResourceRenderTiming(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		installDebugApi()
		patchResourceRenderMethod(api, 'renderResources')
		patchResourceRenderMethod(api, 'renderDarkResources')
	}

	function patchResourceRenderMethod(api, methodName) {
		if (typeof Game.prototype[methodName] !== 'function') return
		api.patch(Game.prototype, methodName, function (original) {
			return function () {
				if (!enabled) return original.apply(this, arguments)
				renderCycles++
				return measure('total.' + methodName, () => {
					return withResourceRenderInstrumentation(this, () => original.apply(this, arguments))
				})
			}
		})
	}

	function installDebugApi() {
		window[apiKey] = {
			enable(options = {}) {
				enabled = true
				sampleLimit = normalizeSampleLimit(options.samples || options.sampleLimit || sampleLimit)
				clearRecords()
				return this.summary()
			},
			disable() {
				enabled = false
				return this.summary()
			},
			clear() {
				clearRecords()
				return this.summary()
			},
			summary() {
				return {
					enabled,
					sampleLimit,
					renderCycles,
					top: listRecords().slice(0, 8)
				}
			},
			methods(options = {}) {
				return listRecords(options)
			}
		}
	}

	function withResourceRenderInstrumentation(game, callback) {
		const restorers = []
		const seenContexts = new Set()
		try {
			wrapObjectMethod(game, 'drawResourceInScreenCoordinates', 'resourceIconHelper', restorers)
			wrapObjectMethod(game, 'makeReadable', 'game.makeReadable', restorers)
			wrapObjectMethod(game, 'makeReadableFloor', 'game.makeReadableFloor', restorers)
			wrapObjectMethod(game, 'pronounce', 'game.pronounce', restorers)
			wrapContext(game?.ctx, 'main', restorers, seenContexts)
			const graphs = game?.analytics?.graphs
			if (Array.isArray(graphs)) {
				for (const graph of graphs) wrapContext(graph?.ctx, 'graph', restorers, seenContexts)
			}
			return callback()
		} finally {
			for (let i = restorers.length - 1; i >= 0; i--) restorers[i]()
		}
	}

	function wrapContext(ctx, prefix, restorers, seenContexts) {
		if (!ctx || seenContexts.has(ctx)) return
		seenContexts.add(ctx)
		for (const methodName of Object.keys(CONTEXT_METHOD_LABELS)) {
			wrapObjectMethod(ctx, methodName, prefix + '.' + CONTEXT_METHOD_LABELS[methodName], restorers)
		}
	}

	const CONTEXT_METHOD_LABELS = {
		measureText: 'measureText',
		fillText: 'fillText',
		strokeText: 'strokeText',
		drawImage: 'drawImage',
		fill: 'fill',
		stroke: 'stroke',
		fillRect: 'fillRect',
		clearRect: 'clearRect',
		roundRect: 'path',
		arc: 'path',
		beginPath: 'path',
		closePath: 'path',
		moveTo: 'path',
		lineTo: 'path',
		createRadialGradient: 'gradient',
		save: 'state',
		restore: 'state',
		translate: 'transform',
		scale: 'transform'
	}

	function wrapObjectMethod(target, methodName, label, restorers) {
		const original = target?.[methodName]
		if (typeof original !== 'function') return
		target[methodName] = function () {
			return measure(label, () => original.apply(this, arguments))
		}
		restorers.push(function () {
			if (target[methodName] === original) return
			target[methodName] = original
		})
	}

	function measure(label, callback) {
		const startedAt = now()
		const stackFrame = { childMs: 0 }
		measureStack.push(stackFrame)
		try {
			return callback()
		} finally {
			const elapsed = Math.max(0, now() - startedAt)
			measureStack.pop()
			const selfMs = Math.max(0, elapsed - stackFrame.childMs)
			const parent = measureStack[measureStack.length - 1]
			if (parent) parent.childMs += elapsed
			record(label, elapsed, selfMs)
		}
	}

	function record(label, elapsedMs, selfMs) {
		if (!enabled) return
		const record = getRecord(label)
		const elapsed = Math.max(0, Number(elapsedMs) || 0)
		const self = Math.max(0, Number(selfMs) || 0)
		record.calls++
		record.totalMs += elapsed
		record.selfTotalMs += self
		record.samples.push({ elapsed, self })
		record.lastMs = elapsed
		record.lastSelfMs = self
		while (record.samples.length > sampleLimit) {
			const sample = record.samples.shift()
			record.totalMs -= getSampleElapsed(sample)
			record.selfTotalMs -= getSampleSelf(sample)
		}
	}

	function getRecord(label) {
		const key = String(label || 'unknown')
		if (!records[key]) records[key] = { label: key, calls: 0, totalMs: 0, selfTotalMs: 0, samples: [], lastMs: 0, lastSelfMs: 0 }
		return records[key]
	}

	function listRecords(options = {}) {
		const rows = Object.keys(records).map((label) => describeRecord(records[label]))
		const sort = options.sort || 'perRender'
		rows.sort(function (a, b) {
			if (sort === 'avg') return (b.avgMs - a.avgMs) || String(a.method).localeCompare(String(b.method))
			if (sort === 'self') return (b.selfAvgPerRenderMs - a.selfAvgPerRenderMs) || String(a.method).localeCompare(String(b.method))
			if (sort === 'total') return (b.totalMs - a.totalMs) || String(a.method).localeCompare(String(b.method))
			if (sort === 'calls') return (b.calls - a.calls) || String(a.method).localeCompare(String(b.method))
			return (b.avgPerRenderMs - a.avgPerRenderMs) || String(a.method).localeCompare(String(b.method))
		})
		return rows
	}

	function describeRecord(record) {
		const samples = record.samples || []
		let min = Infinity
		let max = 0
		for (const sample of samples) {
			const value = getSampleElapsed(sample)
			if (value < min) min = value
			if (value > max) max = value
		}
		const sampleCount = samples.length
		const totalMs = Number(record.totalMs) || 0
		const selfTotalMs = Number(record.selfTotalMs) || 0
		const callsPerRender = record.calls / Math.max(1, renderCycles)
		const avgMs = sampleCount ? totalMs / sampleCount : 0
		const selfAvgMs = sampleCount ? selfTotalMs / sampleCount : 0
		return {
			method: record.label,
			calls: record.calls,
			callsPerRender: roundNumber(callsPerRender, 3),
			sampleCount,
			avgMs: roundMs(avgMs),
			avgPerRenderMs: roundMs(avgMs * callsPerRender),
			selfAvgMs: roundMs(selfAvgMs),
			selfAvgPerRenderMs: roundMs(selfAvgMs * callsPerRender),
			lastMs: roundMs(record.lastMs || 0),
			lastSelfMs: roundMs(record.lastSelfMs || 0),
			maxMs: sampleCount ? roundMs(max) : 0,
			minMs: sampleCount ? roundMs(min) : 0,
			totalMs: roundMs(totalMs),
			selfTotalMs: roundMs(selfTotalMs)
		}
	}

	function getSampleElapsed(sample) {
		if (sample && typeof sample === 'object') return Math.max(0, Number(sample.elapsed) || 0)
		return Math.max(0, Number(sample) || 0)
	}

	function getSampleSelf(sample) {
		if (sample && typeof sample === 'object') return Math.max(0, Number(sample.self) || 0)
		return Math.max(0, Number(sample) || 0)
	}

	function clearRecords() {
		for (const key of Object.keys(records)) delete records[key]
		renderCycles = 0
	}

	function normalizeSampleLimit(value) {
		const parsed = Number(value)
		if (!Number.isFinite(parsed)) return defaultSampleLimit
		return Math.max(1, Math.min(5000, Math.floor(parsed)))
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
