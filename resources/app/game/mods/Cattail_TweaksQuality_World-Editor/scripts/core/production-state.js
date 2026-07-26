ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
		const PRODUCTION_KEY = Symbol.for('cattail.world-editor.production')
		const TELEMETRY_KEY = Symbol.for('cattail.dynamic-details.production-telemetry')
		const REFRESH_MS = 1000

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const analysis = globalThis[ANALYSIS_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Production 3F could not find the editor runtime.')
				return
			}
			if (!analysis || analysis.game !== game || typeof analysis.subscribe !== 'function' || typeof analysis.entities !== 'function') {
				console.warn('[Cattail World Editor] Production 3F could not find selection analysis.')
				return
			}

			const previous = globalThis[PRODUCTION_KEY]
			previous?.dispose?.('production-replaced')
			const controller = createProductionController(game, runtime, analysis)
			Object.defineProperty(globalThis, PRODUCTION_KEY, {
				value: controller,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				controller.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Production state 3F ready.')
		})

		function createProductionController(game, runtime, analysis) {
			let currentRuntime = runtime.snapshot()
			let currentAnalysis = analysis.snapshot()
			let current = emptyState('initialized')
			let revision = 0
			let timer = null
			let disposed = false
			let stopRuntimeSubscription = null
			let stopAnalysisSubscription = null
			let initializing = true
			const listeners = new Set()

			function snapshot() {
				return Object.freeze({
					version: '0.3.5',
					status: current.status,
					reason: current.reason,
					selectionKey: current.selectionKey,
					telemetry: current.telemetry,
					updatedAt: current.updatedAt,
					revision,
					disposed
				})
			}

			function notify() {
				const next = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(next)
					} catch (error) {
						console.warn('[Cattail World Editor] Production listener failed.', error)
					}
				}
			}

			function publish(next) {
				if (disposed) return false
				current = next
				revision += 1
				notify()
				return true
			}

			function clearTimer() {
				if (timer === null) return
				globalThis.clearTimeout?.(timer)
				timer = null
			}

			function scheduleRefresh() {
				clearTimer()
				if (disposed || !selectionReady()) return
				timer = globalThis.setTimeout?.(function () {
					timer = null
					refreshSelection('interval')
				}, REFRESH_MS) ?? null
			}

			function selectionReady() {
				return !!(
					currentRuntime?.active &&
					currentAnalysis?.phase === 'selected' &&
					currentAnalysis?.status === 'ready' &&
					currentAnalysis?.key
				)
			}

			function sync(reason) {
				clearTimer()
				if (!currentRuntime?.active) {
					publish(emptyState('editor-inactive'))
					return
				}
				if (currentAnalysis?.phase === 'selected' && currentAnalysis?.status === 'scanning') {
					publish({
						status: 'scanning',
						reason: String(reason || 'selection-scanning'),
						selectionKey: currentAnalysis.key || null,
						telemetry: null,
						updatedAt: Date.now()
					})
					return
				}
				if (!selectionReady()) {
					publish(emptyState(reason || 'selection-unavailable'))
					return
				}
				refreshSelection(reason || 'selection-ready')
			}

			function refreshSelection(reason) {
				if (!selectionReady() || disposed) return false
				const telemetry = getTelemetryApi()
				if (!telemetry) {
					publish({
						status: 'unavailable',
						reason: 'telemetry-unavailable',
						selectionKey: currentAnalysis.key,
						telemetry: null,
						updatedAt: Date.now()
					})
					scheduleRefresh()
					return false
				}
				let productionSnapshot
				try {
					productionSnapshot = applyInstantaneousPumpActual(telemetry.snapshotEntities(
						analysis.entities(),
						{ theoretical: false, supplemental: true }
					))
				} catch (error) {
					publish({
						status: 'unavailable',
						reason: 'telemetry-error',
						selectionKey: currentAnalysis.key,
						telemetry: null,
						updatedAt: Date.now()
					})
					scheduleRefresh()
					return false
				}
				publish({
					status: productionSnapshot?.ready ? 'ready' : 'unavailable',
					reason: productionSnapshot?.ready ? String(reason || 'updated') : String(productionSnapshot?.reason || 'telemetry-unavailable'),
					selectionKey: currentAnalysis.key,
					telemetry: productionSnapshot || null,
					updatedAt: Date.now()
				})
				scheduleRefresh()
				return productionSnapshot?.ready === true
			}

			function captureEntities(entities) {
				const telemetry = getTelemetryApi()
				if (!telemetry) return unavailableCapture('telemetry-unavailable')
				let productionSnapshot
				try {
					productionSnapshot = applyInstantaneousPumpActual(
						telemetry.snapshotEntities(Array.isArray(entities) ? entities : [])
					)
				} catch (error) {
					return unavailableCapture('telemetry-error')
				}
				return normalizeCapturedProduction(telemetry, productionSnapshot)
			}

			function getTelemetryApi() {
				const telemetry = globalThis[TELEMETRY_KEY]
				if (
					!telemetry ||
					Number(telemetry.apiVersion) < 1 ||
					Number(telemetry.snapshotSchemaVersion) < 1 ||
					typeof telemetry.status !== 'function' ||
					typeof telemetry.snapshotEntities !== 'function'
				) {
					return null
				}
				try {
					const status = telemetry.status()
					if (!status?.ready || status.disposed) return null
				} catch (error) {
					return null
				}
				return telemetry
			}

			const controller = Object.freeze({
				version: '0.3.5',
				game,
				refreshMs: REFRESH_MS,
				snapshot,
				captureEntities,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor production listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (error) {
						console.warn('[Cattail World Editor] Production listener failed.', error)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					clearTimer()
					stopRuntimeSubscription?.()
					stopAnalysisSubscription?.()
					current = emptyState(reason || 'disposed')
					listeners.clear()
					if (globalThis[PRODUCTION_KEY] === controller) delete globalThis[PRODUCTION_KEY]
					return true
				}
			})

			stopRuntimeSubscription = runtime.subscribe(function (state) {
				currentRuntime = state
				if (!initializing) sync('runtime-updated')
			})
			stopAnalysisSubscription = analysis.subscribe(function (state) {
				currentAnalysis = state
				if (!initializing) sync('analysis-updated')
			})
			initializing = false
			sync('initialized')
			return controller
		}

		function emptyState(reason) {
			return {
				status: 'idle',
				reason: String(reason || 'idle'),
				selectionKey: null,
				telemetry: null,
				updatedAt: Date.now()
			}
		}

		function normalizeCapturedProduction(telemetry, value) {
			if (!value?.ready) return unavailableCapture(value?.reason || 'telemetry-unavailable')
			return deepFreeze({
				status: 'ready',
				reason: null,
				source: 'cattail.dynamic-details.production-telemetry',
				apiVersion: Number(telemetry.apiVersion) || 1,
				snapshotSchemaVersion: Number(value.schemaVersion) || Number(telemetry.snapshotSchemaVersion) || 1,
				capturedAt: Number(value.sampledAt) || Date.now(),
				canonicalUnit: String(value.canonicalUnit || telemetry.canonicalUnit || 'perSecond'),
				sampleWindowMs: finiteNonNegative(value.sampleWindowMs),
				quality: String(value.quality || 'collecting'),
				sampleDuration: cloneSampleDuration(value.sampleDuration),
				entities: {
					included: finiteNonNegative(value.entities?.included),
					unsupported: {
						theoretical: finiteNonNegative(value.entities?.unsupported?.theoretical),
						actualOutput: finiteNonNegative(value.entities?.unsupported?.actualOutput),
						actualConsume: finiteNonNegative(value.entities?.unsupported?.actualConsume)
					}
				},
				events: {
					dropped: finiteNonNegative(value.events?.dropped),
					truncated: value.events?.truncated === true
				},
				totals: {
					theoretical: cloneFlow(value.totals?.theoretical),
					actual: cloneFlow(value.totals?.actual)
				},
				byType: Array.isArray(value.byType) ? value.byType.map(cloneTypeProduction) : []
			})
		}

		function applyInstantaneousPumpActual(value) {
			if (!value?.ready || !Array.isArray(value.byType)) return value
			let changed = false
			const byType = value.byType.map(function (type) {
				if (type?.name !== 'pump' && type?.name !== 'pump2') return type
				const mining = (Array.isArray(type.supplemental) ? type.supplemental : []).find(function (entry) {
					return entry?.id === 'pumpMining' && entry?.basis === 'instantaneous'
				})
				if (!mining) return type
				changed = true
				return Object.assign({}, type, {
					actual: flowFromOutputAndConsume(mining.resources, type.actual?.consume)
				})
			})
			if (!changed) return value
			return deepFreeze(Object.assign({}, value, {
				totals: Object.assign({}, value.totals, {
					actual: sumActualFlows(byType)
				}),
				byType
			}))
		}

		function sumActualFlows(types) {
			let size = 0
			for (const type of types) {
				size = Math.max(
					size,
					Array.isArray(type?.actual?.output) ? type.actual.output.length : 0,
					Array.isArray(type?.actual?.consume) ? type.actual.consume.length : 0
				)
			}
			const output = new Array(size).fill(0)
			const consume = new Array(size).fill(0)
			for (const type of types) {
				for (let index = 0; index < size; index += 1) {
					output[index] += finiteNonNegative(type?.actual?.output?.[index])
					consume[index] += finiteNonNegative(type?.actual?.consume?.[index])
				}
			}
			return flowFromOutputAndConsume(output, consume)
		}

		function flowFromOutputAndConsume(outputValue, consumeValue) {
			const size = Math.max(
				Array.isArray(outputValue) ? outputValue.length : 0,
				Array.isArray(consumeValue) ? consumeValue.length : 0
			)
			const output = new Array(size)
			const consume = new Array(size)
			const net = new Array(size)
			for (let index = 0; index < size; index += 1) {
				output[index] = finiteNonNegative(outputValue?.[index])
				consume[index] = finiteNonNegative(consumeValue?.[index])
				net[index] = output[index] - consume[index]
			}
			return { output, consume, net }
		}

		function unavailableCapture(reason) {
			return deepFreeze({
				status: 'unavailable',
				reason: String(reason || 'telemetry-unavailable'),
				source: 'cattail.dynamic-details.production-telemetry',
				apiVersion: 1,
				snapshotSchemaVersion: 1,
				capturedAt: Date.now(),
				canonicalUnit: 'perSecond',
				sampleWindowMs: 30000,
				quality: 'unavailable',
				sampleDuration: cloneSampleDuration(null),
				entities: {
					included: 0,
					unsupported: { theoretical: 0, actualOutput: 0, actualConsume: 0 }
				},
				events: { dropped: 0, truncated: false },
				totals: {
					theoretical: cloneFlow(null),
					actual: cloneFlow(null)
				},
				byType: []
			})
		}

		function cloneTypeProduction(value) {
			return {
				name: String(value?.name || 'unknown'),
				count: finiteNonNegative(value?.count),
				support: {
					theoretical: cloneSupport(value?.support?.theoretical),
					actualOutput: cloneSupport(value?.support?.actualOutput),
					actualConsume: cloneSupport(value?.support?.actualConsume)
				},
				theoretical: cloneFlow(value?.theoretical),
				actual: cloneFlow(value?.actual),
				sampleDuration: cloneSampleDuration(value?.sampleDuration),
				supplemental: Array.isArray(value?.supplemental)
					? value.supplemental.map(function (entry) {
						return {
							id: String(entry?.id || 'unknown'),
							basis: String(entry?.basis || 'unknown'),
							resources: cloneVector(entry?.resources)
						}
					})
					: []
			}
		}

		function cloneSupport(value) {
			return {
				supported: value?.supported === true,
				partial: value?.partial === true,
				supportedEntities: finiteNonNegative(value?.supportedEntities),
				unsupportedEntities: finiteNonNegative(value?.unsupportedEntities),
				reasons: Array.isArray(value?.reasons) ? value.reasons.map(String) : []
			}
		}

		function cloneFlow(value) {
			return {
				output: cloneVector(value?.output),
				consume: cloneVector(value?.consume),
				net: cloneSignedVector(value?.net)
			}
		}

		function cloneVector(value) {
			return Array.isArray(value) ? value.map(finiteNonNegative) : []
		}

		function cloneSignedVector(value) {
			return Array.isArray(value) ? value.map(function (entry) {
				const number = Number(entry)
				return Number.isFinite(number) && !Object.is(number, -0) ? number : 0
			}) : []
		}

		function cloneSampleDuration(value) {
			return {
				minMs: finiteNonNegative(value?.minMs),
				maxMs: finiteNonNegative(value?.maxMs),
				collectingEntities: finiteNonNegative(value?.collectingEntities)
			}
		}

		function finiteNonNegative(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : 0
		}

		function deepFreeze(value, seen = new Set()) {
			if (!value || typeof value !== 'object' || seen.has(value)) return value
			seen.add(value)
			for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen)
			return Object.freeze(value)
		}
	}
})
