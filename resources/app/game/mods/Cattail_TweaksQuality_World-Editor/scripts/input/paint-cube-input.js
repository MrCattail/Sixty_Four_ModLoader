ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const TOOL_KEY = Symbol.for('cattail.world-editor.tool')
		const PAINT_UI_KEY = Symbol.for('cattail.world-editor.paint-cube-ui')
		const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
		const FILL_KEY = Symbol.for('cattail.world-editor.paint-cube-fill')
		const INPUT_KEY = Symbol.for('cattail.world-editor.paint-cube-input')
		const INPUT_MODULE_KEY = Symbol.for('cattail.world-editor.paint-cube-input-module')
		const BLUEPRINT_PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const STATUS_EVENT = 'cattail:world-editor-paint-status'
		const FAILURE_MS = 6000
		const CANCEL_MS = 3000
		let cancelMountedStroke = null
		let unpatchSwitchPlane = null
		let moduleDisposed = false
		const previousModule = globalThis[INPUT_MODULE_KEY]
		previousModule?.dispose?.('paint-cube-input-module-replaced')
		const moduleService = Object.freeze({
			dispose(reason) {
				if (moduleDisposed) return false
				moduleDisposed = true
				cancelMountedStroke = null
				if (typeof unpatchSwitchPlane === 'function') unpatchSwitchPlane()
				unpatchSwitchPlane = null
				globalThis[INPUT_KEY]?.dispose?.(reason || 'paint-cube-input-module-disposed')
				if (globalThis[INPUT_MODULE_KEY] === moduleService) delete globalThis[INPUT_MODULE_KEY]
				return true
			}
		})
		Object.defineProperty(globalThis, INPUT_MODULE_KEY, {
			value: moduleService,
			configurable: true,
			writable: true
		})

		api.on('afterVanillaScripts', function () {
			if (moduleDisposed || typeof Game === 'undefined' || !Game.prototype || typeof Game.prototype.switchPlane !== 'function') return
			if (typeof unpatchSwitchPlane === 'function') unpatchSwitchPlane()
			unpatchSwitchPlane = api.patch(Game.prototype, 'switchPlane', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (!moduleDisposed && typeof cancelMountedStroke === 'function') cancelMountedStroke(this)
					return result
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			if (moduleDisposed) return
			const runtime = globalThis[RUNTIME_KEY]
			const shared = globalThis[SHARED_KEY]
			const tool = globalThis[TOOL_KEY]
			const paintUi = globalThis[PAINT_UI_KEY]
			const stroke = globalThis[STROKE_KEY]
			const fill = globalThis[FILL_KEY]
			const canvas = game?.canvas
			const previous = globalThis[INPUT_KEY]
			previous?.dispose?.('paint-cube-input-replaced')
			if (
				!runtime ||
				runtime.game !== game ||
				typeof runtime.addCleanup !== 'function' ||
				typeof runtime.isActive !== 'function' ||
				typeof runtime.subscribe !== 'function' ||
				!tool ||
				typeof tool.snapshot !== 'function' ||
				!paintUi ||
				paintUi.game !== game ||
				typeof paintUi.snapshot !== 'function' ||
				typeof paintUi.subscribe !== 'function' ||
				!stroke ||
				stroke.game !== game ||
				typeof stroke.executeStroke !== 'function' ||
				typeof stroke.beginLiveStroke !== 'function' ||
				typeof stroke.inspectCell !== 'function' ||
				!canvas ||
				typeof canvas.addEventListener !== 'function'
			) {
				console.warn('[Cattail World Editor] Atomic paint input is unavailable; the Draw safety blocker remains active.')
				return
			}

			const maxCells = Math.max(1, Number(stroke.maxCells) || 512)
			const initialPaintUi = paintUi.snapshot()
			let currentSubtool = normalizeSubtool(initialPaintUi?.subtool)
			let currentCubeMode = normalizeCubeMode(initialPaintUi?.cubeMode)
			let currentRecipe = clonePlain(initialPaintUi?.recipe)
			let paletteOpen = initialPaintUi?.paletteOpen === true
			let activeStroke = null
			let bucketPlanning = null
			let transactionPending = false
			let lastResult = null
			let disposed = false
			let generation = 0
			let pendingSampleCells = []
			let sampleFramePending = false

			const service = Object.freeze({
				version: '0.6.0',
				maxCells,
				snapshot() {
					return {
						version: '0.6.0',
						active: !!activeStroke || !!bucketPlanning,
						planning: !!bucketPlanning,
						action: activeStroke?.action || actionForSubtool(currentSubtool),
						subtool: currentSubtool,
						cubeMode: activeStroke?.cubeMode || currentCubeMode,
						growDurationMs: activeStroke?.growDurationMs || null,
						recipe: clonePlain(activeStroke?.recipe || currentRecipe),
						committedRecipe: clonePlain(currentRecipe),
						paletteOpen,
						cells: activeStroke ? liveSnapshot(activeStroke).changes.map(function (change) { return change.cell.slice() }) : [],
						lastCell: activeStroke?.lastCell ? activeStroke.lastCell.slice() : bucketPlanning?.cell?.slice() || null,
						visitedCount: activeStroke?.visited.size || 0,
						skippedCount: activeStroke ? liveSnapshot(activeStroke).skippedCount : 0,
						limitReached: activeStroke ? liveSnapshot(activeStroke).limitReached === true : false,
						pending: transactionPending || !!bucketPlanning,
						lastResult: clonePlain(lastResult),
						disposed
					}
				},
				dispose() {
					if (disposed) return false
					disposed = true
					generation += 1
					transactionPending = false
					activeStroke = null
					bucketPlanning = null
					pendingSampleCells = []
					sampleFramePending = false
					if (globalThis[INPUT_KEY] === service) delete globalThis[INPUT_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, INPUT_KEY, {
				value: service,
				configurable: true,
				writable: true
			})

			function shouldOwn() {
				return ownershipBlockedReason(false) === null
			}

			function activeStrokeBlockedReason() {
				return ownershipBlockedReason(true)
			}

			function ownershipBlockedReason(active) {
				if (disposed) return 'disposed'
				if (paletteOpen) return 'palette-opened'
				if (!runtime.isActive()) return 'editor-inactive'
				if (tool.snapshot()?.mode !== 'draw') return 'draw-mode-left'
				if (game.halt || game.splash?.isShown) return 'game-unavailable'
				if (game.plane) return 'plane-changed'
				if (!active && game.mouse?.cursorVisible === false) return 'cursor-hidden'
				if (!active && shared?.isWorldEditorInputBlocked?.()) return 'input-blocked'
				if (!active && blueprintPreviewActive()) return 'blueprint-preview-active'
				return null
			}

			function handleMouseDown(event) {
				if (event?.button === 2) {
					cancelStroke('right-button', true)
					cancelBucket('right-button', true)
					return
				}
				if (event?.button !== 0 || !shouldOwn()) return
				consume(event)
				if (transactionPending || bucketPlanning) {
					publishStatus('historyBusy', 'busy', 0, false)
					return
				}
				refreshHoveredCell(game, event)
				const cell = normalizeCell(game.hoveredCell)
				if (!cell) return
				const latestPaintUi = paintUi.snapshot()
				if (currentSubtool === 'bucket') {
					startBucket(cell, latestPaintUi)
					return
				}
				const action = actionForSubtool(currentSubtool)
				const cubeMode = action === 'erase' ? 'stable' : normalizeCubeMode(latestPaintUi?.cubeMode)
				const growDurationMs = cubeMode === 'grow' ? Number(latestPaintUi?.growDurationMs) : null
				if (cubeMode === 'grow' && (latestPaintUi?.growAvailable !== true || !Number.isInteger(growDurationMs))) {
					publishStatus('historyNotReady', 'warning', FAILURE_MS, false)
					return
				}
				activeStroke = {
					action,
					cubeMode,
					growDurationMs,
					recipe: clonePlain(currentRecipe),
					session: stroke.beginLiveStroke({
						action,
						cubeMode,
						growDurationMs,
						recipe: clonePlain(currentRecipe),
						input: 'mouse'
					}),
					visited: new Set(),
					lastCell: null,
					skippedCount: 0,
					limitReached: false
				}
				sampleTo(cell)
			}

			function handleMouseMove(event) {
				const leftDown = !!((Number(event?.buttons) || 0) & 1)
				if (!activeStroke) {
					if (leftDown && shouldOwn()) consume(event)
					return
				}
				if (!leftDown) {
					consume(event)
					return
				}
				const blockedReason = activeStrokeBlockedReason()
				if (blockedReason) {
					cancelStroke(blockedReason, true)
					return
				}
				consume(event)
				refreshHoveredCell(game, event)
				const cell = normalizeCell(game.hoveredCell)
				if (cell) queueSampleTo(cell)
			}

			function handleMouseUp(event) {
				if (event?.button !== 0 || !activeStroke) return
				const blockedReason = activeStrokeBlockedReason()
				if (blockedReason) {
					cancelStroke(blockedReason, true)
					return
				}
				consume(event)
				refreshHoveredCell(game, event)
				const cell = normalizeCell(game.hoveredCell)
				if (cell) pendingSampleCells.push(cell)
				flushQueuedSamples()
				finishStroke()
			}

			function handleClick(event) {
				if (event?.button === 0 && shouldOwn()) consume(event)
			}

			function handleMouseLeave() {
				cancelStroke('canvas-leave', true)
			}

			function handleWindowBlur() {
				cancelStroke('window-blur', true)
			}

			function handleEscape(event) {
				if ((!activeStroke && !bucketPlanning) || String(event?.key || '') !== 'Escape') return
				consume(event)
				cancelStroke('escape', true)
				cancelBucket('escape', true)
			}

			function startBucket(cell, latestPaintUi) {
				if (!fill || fill.game !== game || typeof fill.plan !== 'function' || typeof fill.validatePlan !== 'function') {
					publishStatus('historyNotReady', 'warning', FAILURE_MS, false)
					return
				}
				const cubeMode = normalizeCubeMode(latestPaintUi?.cubeMode)
				const growDurationMs = cubeMode === 'grow' ? Number(latestPaintUi?.growDurationMs) : null
				if (cubeMode === 'grow' && (latestPaintUi?.growAvailable !== true || !Number.isInteger(growDurationMs))) {
					publishStatus('historyNotReady', 'warning', FAILURE_MS, false)
					return
				}
				const requestGeneration = ++generation
				bucketPlanning = {
					cell: cell.slice(),
					cubeMode,
					growDurationMs,
					recipe: clonePlain(currentRecipe),
					generation: requestGeneration
				}
				publishStatus('paintBucketPlanning', 'busy', 0, false)
				void executeBucket(bucketPlanning)
			}

			async function executeBucket(operation) {
				const isCancelled = function () {
					return !bucketPlanning ||
						disposed ||
						operation.generation !== generation ||
						operation.generation !== bucketPlanning.generation ||
						!bucketConfigurationCurrent(operation)
				}
				try {
					const firstPlan = await fill.plan({
						cell: operation.cell,
						cubeMode: operation.cubeMode,
						growDurationMs: operation.growDurationMs,
						recipe: operation.recipe,
						isCancelled
					})
					if (isCancelled()) throw cancelledError()
					bucketPlanning = null
					transactionPending = true
					const result = await stroke.executeStroke({
						action: 'paint',
						source: 'bucket',
						strictTargets: true,
						fillGuard: firstPlan.guard,
						cubeMode: operation.cubeMode,
						growDurationMs: operation.growDurationMs,
						recipe: operation.recipe,
						targets: firstPlan.targets,
						input: 'mouse'
					})
					if (disposed || operation.generation !== generation) return
					lastResult = clonePlain(result)
					if (result?.executed === true) {
						showBucketSummary(result?.transaction?.summary, firstPlan)
						return
					}
					showFailure(result)
				} catch (error) {
					if (disposed || operation.generation !== generation || error?.code === 'CANCELLED') return
					lastResult = failureResult(error)
					showFailure(lastResult)
				} finally {
					if (!disposed && operation.generation === generation) {
						bucketPlanning = null
						transactionPending = false
					}
				}
			}

			function bucketConfigurationCurrent(operation) {
				if (!runtime.isActive() || tool.snapshot()?.mode !== 'draw' || game.plane) return false
				const latest = paintUi.snapshot()
				if (latest?.paletteOpen === true || normalizeSubtool(latest?.subtool) !== 'bucket') return false
				if (normalizeCubeMode(latest?.cubeMode) !== operation.cubeMode) return false
				if (!samePlain(latest?.recipe, operation.recipe)) return false
				return operation.cubeMode !== 'grow' || Number(latest?.growDurationMs) === operation.growDurationMs
			}

			function sampleTo(cellValue) {
				if (!activeStroke) return false
				const cell = normalizeCell(cellValue)
				if (!cell) return false
				const path = activeStroke.lastCell ? interpolateCells(activeStroke.lastCell, cell) : [cell]
				sampleCells(path)
				activeStroke.lastCell = cell.slice()
				return true
			}

			function queueSampleTo(cellValue) {
				if (!activeStroke) return false
				const cell = normalizeCell(cellValue)
				if (!cell) return false
				pendingSampleCells.push(cell)
				scheduleSampleFlush()
				return true
			}

			function scheduleSampleFlush() {
				if (sampleFramePending) return
				if (typeof window?.requestAnimationFrame === 'function') {
					sampleFramePending = true
					window.requestAnimationFrame(function () {
						sampleFramePending = false
						flushQueuedSamples()
					})
					return
				}
				flushQueuedSamples()
			}

			function flushQueuedSamples() {
				if (!activeStroke || !pendingSampleCells.length) {
					pendingSampleCells = []
					return false
				}
				const queued = pendingSampleCells.splice(0)
				const path = []
				for (const cell of queued) {
					const segment = activeStroke.lastCell ? interpolateCells(activeStroke.lastCell, cell) : [cell]
					for (const candidate of segment) path.push(candidate)
					activeStroke.lastCell = cell.slice()
				}
				return sampleCells(path)
			}

			function sampleCells(cells) {
				if (!activeStroke || !Array.isArray(cells)) return false
				const candidates = []
				for (const cell of cells) {
					const key = cellKey(cell)
					if (activeStroke.visited.has(key)) continue
					activeStroke.visited.add(key)
					candidates.push(cell.slice())
				}
				if (!candidates.length) return false
				if (typeof activeStroke.session?.sampleMany === 'function') {
					return handleSampleResult(activeStroke.session.sampleMany(candidates))
				}
				for (const candidate of candidates) {
					if (!handleSampleResult(activeStroke.session?.sample?.(candidate))) return false
				}
				return true
			}

			function handleSampleResult(result) {
				const live = liveSnapshot(activeStroke)
				activeStroke.skippedCount = live.skippedCount
				if (live.limitReached && !activeStroke.limitReached) {
					activeStroke.limitReached = true
					publishStatus('paintStrokeLimit', 'warning', FAILURE_MS, false, { limit: maxCells })
				}
				if (result?.ok === false) {
					const failed = activeStroke
					activeStroke = null
					lastResult = {
						executed: false,
						error: { code: result.reason || live.error?.code || 'UNKNOWN' }
					}
					showFailure(lastResult)
					failed.session?.cancel?.('live-sample-failed')
					return false
				}
				return result?.ok === true
			}

			function finishStroke() {
				const finished = activeStroke
				activeStroke = null
				transactionPending = true
				const requestGeneration = ++generation
				let request
				try {
					request = finished?.session?.commit?.()
				} catch (error) {
					if (disposed || requestGeneration !== generation) return
					transactionPending = false
					lastResult = failureResult(error)
					showFailure(lastResult)
					return
				}
				void Promise.resolve(request).then(function (result) {
					if (disposed || requestGeneration !== generation) return
					lastResult = clonePlain(result)
					if (result?.executed === true) {
						showSummary(result?.transaction?.summary)
						return
					}
					showFailure(result)
				}).catch(function (error) {
					if (disposed || requestGeneration !== generation) return
					lastResult = failureResult(error)
					showFailure(lastResult)
				}).finally(function () {
					if (!disposed && requestGeneration === generation) transactionPending = false
				})
			}

			function cancelStroke(reason, notify) {
				if (!activeStroke) return false
				const cancelled = activeStroke
				activeStroke = null
				pendingSampleCells = []
				const cancelRequest = cancelled.session?.cancel?.(String(reason || 'cancelled'))
				void Promise.resolve(cancelRequest).then(function (ok) {
					if (disposed || ok !== false) return
					const live = liveSnapshot(cancelled)
					lastResult = {
						executed: false,
						error: { code: live.error?.code || 'ROLLBACK_FAILED' }
					}
					showFailure(lastResult)
				})
				const live = liveSnapshot(cancelled)
				if (notify) {
					publishStatus('paintStrokeCancelled', 'warning', CANCEL_MS, false, {
						painted: 0,
						replaced: 0,
						erased: 0,
						skipped: live.skippedCount,
						reason: String(reason || 'cancelled')
					})
				}
				return true
			}

			function cancelBucket(reason, notify) {
				if (!bucketPlanning) return false
				bucketPlanning = null
				generation += 1
				if (notify) publishStatus('paintBucketCancelled', 'warning', CANCEL_MS, false, { reason: String(reason || 'cancelled') })
				return true
			}

			const cancelForPlaneChange = function (changedGame) {
				if (changedGame === game) {
					cancelStroke('plane-changed', true)
					cancelBucket('plane-changed', true)
				}
			}
			cancelMountedStroke = cancelForPlaneChange

			function showSummary(summary) {
				const values = {
					painted: normalizeCount(summary?.paintedCount),
					replaced: normalizeCount(summary?.replacedCount),
					erased: normalizeCount(summary?.erasedCount),
					skipped: normalizeCount(summary?.skippedCount),
					limit: maxCells
				}
				if (values.replaced > 0 || values.skipped > 0 || summary?.limitReached === true) {
					publishStatus('paintStrokeSummary', 'neutral', FAILURE_MS, false, values)
				}
			}

			function showBucketSummary(summary, plan) {
				publishStatus('paintBucketSummary', 'neutral', FAILURE_MS, false, {
					painted: normalizeCount(summary?.paintedCount),
					replaced: normalizeCount(summary?.replacedCount),
					skipped: normalizeCount(summary?.skippedCount),
					count: normalizeCount(summary?.cellCount),
					region: normalizeCount(plan?.componentCount),
					limit: Number(fill?.maxCells) || 4096
				})
			}

			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state?.active) {
					cancelStroke('editor-inactive', true)
					cancelBucket('editor-inactive', true)
				}
			})
			const stopToolSubscription = typeof tool.subscribe === 'function'
				? tool.subscribe(function (state) {
					if (state?.mode !== 'draw') {
						cancelStroke('draw-mode-left', true)
						cancelBucket('draw-mode-left', true)
					}
				})
				: null
			const stopPaintUiSubscription = paintUi.subscribe(function (state) {
				const next = normalizeSubtool(state?.subtool)
				const nextCubeMode = normalizeCubeMode(state?.cubeMode)
				const nextRecipe = clonePlain(state?.recipe)
				const nextPaletteOpen = state?.paletteOpen === true
				if (activeStroke) {
					if (nextPaletteOpen) cancelStroke('palette-opened', true)
					else if (actionForSubtool(next) !== activeStroke.action) cancelStroke('subtool-changed', true)
					else if (activeStroke.action === 'paint' && nextCubeMode !== activeStroke.cubeMode) cancelStroke('cube-mode-changed', true)
					else if (!samePlain(nextRecipe, activeStroke.recipe)) cancelStroke('recipe-changed', true)
				}
				if (bucketPlanning) {
					if (nextPaletteOpen) cancelBucket('palette-opened', true)
					else if (next !== 'bucket') cancelBucket('subtool-changed', true)
					else if (nextCubeMode !== bucketPlanning.cubeMode) cancelBucket('cube-mode-changed', true)
					else if (!samePlain(nextRecipe, bucketPlanning.recipe)) cancelBucket('recipe-changed', true)
				}
				currentSubtool = next
				currentCubeMode = nextCubeMode
				currentRecipe = nextRecipe
				paletteOpen = nextPaletteOpen
			})

			canvas.addEventListener('mousedown', handleMouseDown, true)
			canvas.addEventListener('mousemove', handleMouseMove, true)
			canvas.addEventListener('mouseup', handleMouseUp, true)
			canvas.addEventListener('click', handleClick, true)
			canvas.addEventListener('dblclick', handleClick, true)
			canvas.addEventListener('mouseleave', handleMouseLeave, true)
			window.addEventListener('mouseup', handleMouseUp, true)
			window.addEventListener('blur', handleWindowBlur, true)
			window.addEventListener('keydown', handleEscape, true)

			runtime.addCleanup(function () {
				canvas.removeEventListener('mousedown', handleMouseDown, true)
				canvas.removeEventListener('mousemove', handleMouseMove, true)
				canvas.removeEventListener('mouseup', handleMouseUp, true)
				canvas.removeEventListener('click', handleClick, true)
				canvas.removeEventListener('dblclick', handleClick, true)
				canvas.removeEventListener('mouseleave', handleMouseLeave, true)
				window.removeEventListener('mouseup', handleMouseUp, true)
				window.removeEventListener('blur', handleWindowBlur, true)
				window.removeEventListener('keydown', handleEscape, true)
				if (typeof stopRuntimeSubscription === 'function') stopRuntimeSubscription()
				if (typeof stopToolSubscription === 'function') stopToolSubscription()
				if (typeof stopPaintUiSubscription === 'function') stopPaintUiSubscription()
				if (cancelMountedStroke === cancelForPlaneChange) cancelMountedStroke = null
				service.dispose('runtime-disposed')
			})

			console.info('[Cattail World Editor] Continuous atomic Brush/Eraser input 5C-4 ready.')
		})

		function showFailure(result) {
			const code = String(result?.error?.code || result?.reason || 'UNKNOWN').toUpperCase()
			if (code === 'CELL_OCCUPIED') return publishStatus('paintCellOccupied', 'warning', FAILURE_MS, false)
			if (code === 'NOTHING_TO_CHANGE') return publishStatus('paintNoChanges', 'warning', FAILURE_MS, false)
			if (code === 'OPEN_OR_TOO_LARGE') return publishStatus('paintBucketOpenOrTooLarge', 'warning', FAILURE_MS, false, { limit: 4096 })
			if (code === 'BUSY') return publishStatus('historyBusy', 'busy', 0, false)
			if (code === 'NOT_READY') return publishStatus('historyNotReady', 'warning', FAILURE_MS, false)
			if (code === 'ADAPTER_UNAVAILABLE') return publishStatus('historyUnavailable', 'warning', FAILURE_MS, false)
			if (code === 'PLANE_CHANGED') return publishStatus('historyPlaneChanged', 'warning', FAILURE_MS, false)
			if (code === 'SAVE_CHANGED' || code === 'SAVE_IDENTITY_UNAVAILABLE') {
				return publishStatus('historySaveChanged', 'warning', FAILURE_MS, false)
			}
			if (code === 'ROLLBACK_FAILED') return publishStatus('historyReloadRequired', 'terminal', 0, true)
			if (result?.reason === 'rolled-back') return publishStatus('historyRolledBack', 'error', FAILURE_MS, false)
			if (code === 'EXTERNAL_CHANGE' || code === 'INVALIDATED' || code === 'PREFLIGHT_FAILED') {
				return publishStatus('historyExternalChange', 'warning', FAILURE_MS, false)
			}
			return publishStatus('historyFailed', 'error', FAILURE_MS, false)
		}

		function publishStatus(key, kind, duration, persistent, values) {
			try {
				window.dispatchEvent(new CustomEvent(STATUS_EVENT, {
					detail: { key, kind, duration, persistent: persistent === true, values: clonePlain(values) || {} }
				}))
				return true
			} catch (error) {
				console.warn('[Cattail World Editor] Paint status could not be published.', error)
				return false
			}
		}

		function blueprintPreviewActive() {
			try {
				return !!globalThis[BLUEPRINT_PREVIEW_KEY]?.snapshot?.().active
			} catch (error) {
				return false
			}
		}

		function refreshHoveredCell(game, event) {
			const x = Number(event?.offsetX)
			const y = Number(event?.offsetY)
			if (Number.isFinite(x) && Number.isFinite(y) && typeof game.updateMouseData === 'function') {
				game.updateMouseData(x, y)
			}
		}

		function interpolateCells(fromValue, toValue) {
			const from = normalizeCell(fromValue)
			const to = normalizeCell(toValue)
			if (!from || !to) return []
			const cells = [[from[0], from[1]]]
			let u = from[0]
			let v = from[1]
			const du = Math.abs(to[0] - from[0])
			const dv = Math.abs(to[1] - from[1])
			const stepU = Math.sign(to[0] - from[0])
			const stepV = Math.sign(to[1] - from[1])
			let movedU = 0
			let movedV = 0
			while (movedU < du || movedV < dv) {
				const decision = (1 + 2 * movedU) * dv - (1 + 2 * movedV) * du
				if (decision === 0) {
					u += stepU
					v += stepV
					movedU += 1
					movedV += 1
				} else if (decision < 0) {
					u += stepU
					movedU += 1
				} else {
					v += stepV
					movedV += 1
				}
				cells.push([u, v])
			}
			return cells
		}

		function normalizeCell(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function cellKey(cell) {
			return cell[0] + ':' + cell[1]
		}

		function normalizeSubtool(value) {
			return value === 'eraser' ? 'eraser' : value === 'bucket' ? 'bucket' : 'brush'
		}

		function normalizeCubeMode(value) {
			return value === 'grow' ? 'grow' : 'stable'
		}

		function actionForSubtool(value) {
			return normalizeSubtool(value) === 'eraser' ? 'erase' : 'paint'
		}

		function normalizeCount(value) {
			const number = Number(value)
			return Number.isInteger(number) && number > 0 ? number : 0
		}

		function liveSnapshot(strokeState) {
			try {
				const snapshot = strokeState?.session?.snapshot?.()
				return {
					changes: Array.isArray(snapshot?.changes) ? snapshot.changes : [],
					skippedCount: normalizeCount(snapshot?.skippedCount),
					limitReached: snapshot?.limitReached === true,
					error: snapshot?.error || null
				}
			} catch (error) {
				return { changes: [], skippedCount: 0, limitReached: false, error: null }
			}
		}

		function failureResult(error) {
			return {
				executed: false,
				error: { code: error?.code || 'UNKNOWN', message: error?.message || String(error) }
			}
		}

		function cancelledError() {
			const error = new Error('Paint Bucket planning was cancelled.')
			error.code = 'CANCELLED'
			return error
		}

		function consume(event) {
			event?.preventDefault?.()
			event?.stopPropagation?.()
			event?.stopImmediatePropagation?.()
		}

		function clonePlain(value) {
			if (value === undefined) return null
			try {
				return JSON.parse(JSON.stringify(value))
			} catch (error) {
				return null
			}
		}

		function samePlain(left, right) {
			try {
				return JSON.stringify(left) === JSON.stringify(right)
			} catch (error) {
				return false
			}
		}
	}
})
