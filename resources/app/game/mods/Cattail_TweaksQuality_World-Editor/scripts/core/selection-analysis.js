ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
		const SCAN_CHUNK_SIZE = 512

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			if (!runtime || runtime.game !== game || typeof runtime.addCleanup !== 'function') {
				console.warn('[Cattail World Editor] Analysis 2B could not find the editor runtime.')
				return
			}
			if (!selection || selection.game !== game || typeof selection.subscribe !== 'function') {
				console.warn('[Cattail World Editor] Analysis 2B could not find the selection state.')
				return
			}

			const previous = globalThis[ANALYSIS_KEY]
			if (previous && typeof previous.dispose === 'function') previous.dispose('analysis-replaced')

			const analysis = createAnalysis(game)
			Object.defineProperty(globalThis, ANALYSIS_KEY, {
				value: analysis,
				configurable: true,
				writable: true
			})

			const stopSelectionSubscription = selection.subscribe(function (state) {
				analysis.updateSelection(state)
			})
			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state.active) analysis.clear('editor-inactive')
			})

			runtime.addCleanup(function () {
				if (typeof stopSelectionSubscription === 'function') stopSelectionSubscription()
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				analysis.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Analysis 2B ready.')
		})

		function createAnalysis(game) {
			let current = emptySnapshot('initialized')
			let revision = 0
			let disposed = false
			let job = null
			let suspendedCommitted = null
			let currentEntities = []
			const listeners = new Set()

			function snapshot() {
				return cloneSnapshot(current, revision, disposed)
			}

			function notify() {
				const next = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(next)
					} catch (error) {
						console.warn('[Cattail World Editor] Analysis listener failed.', error)
					}
				}
			}

			function publish(next, reason, entities) {
				if (disposed) return false
				revision += 1
				current = Object.assign({}, next, {
					lastReason: String(reason || next.lastReason || 'updated')
				})
				if (Array.isArray(entities)) currentEntities = entities.slice()
				else if (current.status !== 'ready') currentEntities = []
				notify()
				return true
			}

			function updateSelection(selectionState) {
				if (disposed) return false
				const previewRange = isRange(selectionState?.previewRange) ? cloneRange(selectionState.previewRange) : null
				const selectedRange = isRange(selectionState?.selectedRange) ? cloneRange(selectionState.selectedRange) : null
				const phase = previewRange ? 'preview' : selectedRange ? 'selected' : 'none'
				const range = previewRange || selectedRange
				const plane = range ? (selectionState?.plane ? 1 : 0) : null

				if (!range) {
					suspendedCommitted = null
					return clear('selection-empty')
				}

				const key = scanKey(range, plane)
				if (
					phase === 'preview' &&
					current.phase === 'selected' &&
					(current.status === 'ready' || current.status === 'unavailable') &&
					selectedRange
				) {
					const selectedKey = scanKey(selectedRange, selectionState?.plane ? 1 : 0)
					if (current.key === selectedKey) {
						suspendedCommitted = {
							state: snapshot(),
							entities: currentEntities.slice()
						}
					}
				}

				if (job && job.key === key) {
					const phaseChanged = job.phase !== phase
					const rangeChanged = !rangesEqual(job.range, range)
					job.phase = phase
					job.range = range
					if (phase === 'selected') suspendedCommitted = null
					if (phaseChanged || rangeChanged) publish(jobSnapshot(job), phaseChanged ? 'selection-phase-changed' : 'selection-order-changed')
					return true
				}

				if (current.key === key && (current.status === 'ready' || current.status === 'unavailable')) {
					const changed = current.phase !== phase || !rangesEqual(current.range, range)
					if (phase === 'selected') suspendedCommitted = null
					if (!changed) return false
					return publish(Object.assign({}, current, {
						phase,
						range
					}), 'selection-phase-changed')
				}

				if (phase === 'selected' && suspendedCommitted?.state?.key === key) {
					cancelJob()
					const restored = Object.assign({}, suspendedCommitted.state, {
						phase: 'selected',
						range,
						lastReason: 'preview-cancelled'
					})
					const restoredEntities = suspendedCommitted.entities
					suspendedCommitted = null
					return publish(restored, 'preview-cancelled', restoredEntities)
				}

				startScan(range, plane, phase)
				return true
			}

			function startScan(range, plane, phase) {
				cancelJob()
				const total = range.width * range.height
				const key = scanKey(range, plane)
				if (typeof game.entityAtCoordinates !== 'function') {
					publish({
						version: '0.2.1',
						key,
						phase,
						status: 'unavailable',
						range,
						plane,
						progress: 1,
						processed: 0,
						total,
						occupied: null,
						empty: null,
						buildings: null,
						cubes: null
					}, 'entity-lookup-unavailable')
					return
				}

				job = {
					key,
					phase,
					range,
					plane,
					index: 0,
					processed: 0,
					total,
					occupied: 0,
					buildings: new Set(),
					cubes: new Set(),
					scheduled: null
				}
				publish(jobSnapshot(job), phase === 'preview' ? 'preview-scan-started' : 'selection-scan-started')
				scheduleJob(job)
			}

			function scheduleJob(targetJob) {
				targetJob.scheduled = scheduleFrame(function () {
					if (disposed || job !== targetJob) return
					targetJob.scheduled = null
					const stop = Math.min(targetJob.total, targetJob.index + SCAN_CHUNK_SIZE)
					while (targetJob.index < stop) {
						const offset = targetJob.index
						const u = targetJob.range.minU + (offset % targetJob.range.width)
						const v = targetJob.range.minV + Math.floor(offset / targetJob.range.width)
						let entity = null
						try {
							entity = game.entityAtCoordinates([u, v])
						} catch (error) {}
						if (entity) {
							targetJob.occupied += 1
							if (entity.name === 'cube') targetJob.cubes.add(entity)
							else targetJob.buildings.add(entity)
						}
						targetJob.index += 1
						targetJob.processed += 1
					}

					if (targetJob.processed >= targetJob.total) {
						publish(
							jobSnapshot(targetJob, true),
							targetJob.phase === 'preview' ? 'preview-scan-ready' : 'selection-scan-ready',
							Array.from(targetJob.buildings)
						)
						job = null
						return
					}

					publish(jobSnapshot(targetJob), 'selection-scan-progress')
					scheduleJob(targetJob)
				})
			}

			function jobSnapshot(targetJob, ready) {
				const complete = ready === true || targetJob.processed >= targetJob.total
				return {
					version: '0.2.1',
					key: targetJob.key,
					phase: targetJob.phase,
					status: complete ? 'ready' : 'scanning',
					range: cloneRange(targetJob.range),
					plane: targetJob.plane,
					progress: targetJob.total ? targetJob.processed / targetJob.total : 1,
					processed: targetJob.processed,
					total: targetJob.total,
					occupied: targetJob.occupied,
					empty: complete ? targetJob.total - targetJob.occupied : null,
					buildings: targetJob.buildings.size,
					cubes: targetJob.cubes.size
				}
			}

			function cancelJob() {
				if (!job) return
				if (job.scheduled) cancelFrame(job.scheduled)
				job = null
			}

			function clear(reason) {
				if (disposed) return false
				cancelJob()
				if (current.phase === 'none' && current.status === 'idle') return false
				return publish(emptySnapshot(reason || 'cleared'), reason || 'cleared')
			}

			const analysis = Object.freeze({
				version: '0.2.1',
				game,
				snapshot,
				entities() {
					return current.status === 'ready' ? currentEntities.slice() : []
				},
				updateSelection,
				clear,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('World Editor analysis listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (error) {
						console.warn('[Cattail World Editor] Analysis listener failed.', error)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				dispose(reason) {
					if (disposed) return false
					cancelJob()
					disposed = true
					current = emptySnapshot(reason || 'disposed')
					currentEntities = []
					listeners.clear()
					if (globalThis[ANALYSIS_KEY] === analysis) delete globalThis[ANALYSIS_KEY]
					return true
				}
			})

			return analysis
		}

		function emptySnapshot(reason) {
			return {
				version: '0.2.1',
				key: null,
				phase: 'none',
				status: 'idle',
				range: null,
				plane: null,
				progress: 0,
				processed: 0,
				total: 0,
				occupied: 0,
				empty: 0,
				buildings: 0,
				cubes: 0,
				lastReason: String(reason || 'idle')
			}
		}

		function cloneSnapshot(value, revision, disposed) {
			return {
				version: value.version,
				key: value.key,
				phase: value.phase,
				status: value.status,
				range: cloneRange(value.range),
				plane: value.plane,
				progress: value.progress,
				processed: value.processed,
				total: value.total,
				occupied: value.occupied,
				empty: value.empty,
				buildings: value.buildings,
				cubes: value.cubes,
				revision,
				lastReason: value.lastReason,
				disposed
			}
		}

		function scanKey(range, plane) {
			return [
				plane ? 1 : 0,
				range.minU,
				range.maxU,
				range.minV,
				range.maxV
			].join(':')
		}

		function isRange(value) {
			return !!(
				value &&
				isCell(value.start) &&
				isCell(value.end) &&
				Number.isInteger(Number(value.minU)) &&
				Number.isInteger(Number(value.maxU)) &&
				Number.isInteger(Number(value.minV)) &&
				Number.isInteger(Number(value.maxV)) &&
				Number.isInteger(Number(value.width)) &&
				Number.isInteger(Number(value.height)) &&
				Number(value.width) > 0 &&
				Number(value.height) > 0
			)
		}

		function isCell(value) {
			return Array.isArray(value) && value.length >= 2 && Number.isInteger(Number(value[0])) && Number.isInteger(Number(value[1]))
		}

		function cloneRange(range) {
			if (!isRange(range)) return null
			return {
				start: [Number(range.start[0]), Number(range.start[1])],
				end: [Number(range.end[0]), Number(range.end[1])],
				minU: Number(range.minU),
				maxU: Number(range.maxU),
				minV: Number(range.minV),
				maxV: Number(range.maxV),
				width: Number(range.width),
				height: Number(range.height)
			}
		}

		function rangesEqual(left, right) {
			return !!(
				isRange(left) &&
				isRange(right) &&
				left.start[0] === right.start[0] &&
				left.start[1] === right.start[1] &&
				left.end[0] === right.end[0] &&
				left.end[1] === right.end[1]
			)
		}

		function scheduleFrame(callback) {
			if (typeof globalThis.requestAnimationFrame === 'function') {
				return {
					type: 'frame',
					id: globalThis.requestAnimationFrame(callback)
				}
			}
			return {
				type: 'timeout',
				id: globalThis.setTimeout(callback, 0)
			}
		}

		function cancelFrame(scheduled) {
			if (!scheduled) return
			if (scheduled.type === 'frame' && typeof globalThis.cancelAnimationFrame === 'function') {
				globalThis.cancelAnimationFrame(scheduled.id)
				return
			}
			if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(scheduled.id)
		}
	}
})
