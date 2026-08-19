ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
		const FILL_KEY = Symbol.for('cattail.world-editor.paint-cube-fill')
		const TRANSACTION_KIND = 'paint-cube-stroke'
		const SERVICE_VERSION = '0.6.0'
		const ADAPTER_VERSION = '1.0.0'
		const MAX_CELLS = 512
		const BUCKET_MAX_CELLS = 4096
		const YIELD_EVERY = 256
		let lineageCounter = 0

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const paintState = globalThis[PAINT_STATE_KEY]
			const previous = globalThis[STROKE_KEY]
			previous?.dispose?.('paint-cube-stroke-replaced')
			if (
				!runtime ||
				runtime.game !== game ||
				typeof runtime.addCleanup !== 'function' ||
				!transactions ||
				transactions.game !== game ||
				typeof transactions.registerAdapter !== 'function' ||
				typeof transactions.execute !== 'function' ||
				typeof transactions.beginApplied !== 'function' ||
				!paintState ||
				typeof paintState.buildStableCubeSave !== 'function' ||
				typeof paintState.buildGrowCubeSave !== 'function' ||
				typeof paintState.defaultRecipe !== 'function' ||
				typeof paintState.normalizeRecipe !== 'function' ||
				typeof paintState.normalizeGrowDurationMs !== 'function' ||
				typeof paintState.normalizeGrowLineage !== 'function' ||
				typeof paintState.isPainted !== 'function'
			) {
				console.warn('[Cattail World Editor] Multi-cell paint transaction could not find its core services.')
				return
			}

			const service = createService(game, transactions, paintState)
			if (!service) {
				console.warn('[Cattail World Editor] Multi-cell paint transaction adapter could not be registered.')
				return
			}
			Object.defineProperty(globalThis, STROKE_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Atomic Brush/Eraser stroke transaction 5C-4 ready.')
		})

		function createService(game, transactions, paintState) {
			let disposed = false
			let transientIdentitySequence = 0
			const operations = new Map()
			const transactionData = new Map()
			const transientIdentityByEntity = new WeakMap()
			const adapter = {
				version: ADAPTER_VERSION,
				async prepare(context, request) {
					requireCurrent(context)
					requireReality(context, game)
					const source = normalizeSource(request?.source)
					const strictTargets = source === 'bucket' || request?.strictTargets === true
					let fillGuard = source === 'bucket' ? jsonClone(request?.fillGuard) : null
					let targetInput = request?.targets || request?.cells
					if (source === 'bucket') {
						const validation = await requireFillValidation(context, fillGuard)
						targetInput = validation.plan.targets
						fillGuard = jsonClone(validation.plan.guard)
					}
					const action = normalizeAction(request?.action)
					const cubeMode = normalizeCubeMode(request?.cubeMode)
					const recipe = request?.recipe === undefined
						? paintState.defaultRecipe()
						: paintState.normalizeRecipe(request.recipe)
					if (!recipe) throw paintError('INVALID_SPEC', 'A valid paint recipe is required.')
					const growDurationMs = cubeMode === 'grow' ? paintState.normalizeGrowDurationMs(request?.growDurationMs) : null
					const growLineage = cubeMode === 'grow' ? paintState.normalizeGrowLineage(request?.growLineage) : null
					if (cubeMode === 'grow' && (!growDurationMs || !growLineage)) {
						throw paintError('INVALID_SPEC', 'A valid Grow duration and lineage are required.')
					}
					const normalized = normalizeTargets(targetInput, source === 'bucket' ? BUCKET_MAX_CELLS : MAX_CELLS)
					const initialSkipped = normalizeCount(request?.initialSkipped) + normalized.overflow
					const limitReached = request?.limitReached === true || normalized.overflow > 0
					const changes = []
					let skippedCount = initialSkipped
					let paintedCount = 0
					let replacedCount = 0
					let erasedCount = 0

					for (let targetIndex = 0; targetIndex < normalized.targets.length; targetIndex += 1) {
						const target = normalized.targets[targetIndex]
						requireCurrent(context)
						const before = captureCell(target.cell)
						if (source !== 'bucket' && target.hasBefore && !sameRuntimeTransactionSave(before, target.before)) {
							if (strictTargets) {
								throw paintError('EXTERNAL_CHANGE', 'A Paint Bucket target changed before the transaction was prepared.')
							}
							skippedCount += 1
							continue
						}
						const painted = !!before && paintState.isPainted(before)
						const transientSurge = isTransientSurgeSave(before)
						if (action === 'erase') {
							if (!painted) {
								skippedCount += 1
								continue
							}
							changes.push({ cell: target.cell.slice(), operation: 'erase', before, after: null })
							erasedCount += 1
							continue
						}
						if (before && !painted && !transientSurge) {
							skippedCount += 1
							continue
						}
						const after = normalizeSave(cubeMode === 'grow'
							? paintState.buildGrowCubeSave(target.cell, recipe, growDurationMs, growLineage)
							: paintState.buildStableCubeSave(target.cell, recipe))
						if (!after) throw paintError('INVALID_SPEC', 'A valid painted cube state is required.')
						const operation = before ? 'replace' : 'paint'
						changes.push({ cell: target.cell.slice(), operation, before, after })
						if (operation === 'replace') replacedCount += 1
						else paintedCount += 1
						if (source === 'bucket' && (targetIndex + 1) % YIELD_EVERY === 0) await yieldWork(context)
					}

					if (!changes.length) {
						throw paintError('NOTHING_TO_CHANGE', 'The stroke no longer has any eligible cells.')
					}
					return {
						summary: {
							label: source === 'bucket'
								? 'Fill painted cube region'
								: action === 'erase' ? 'Erase painted cube stroke' : 'Paint configured cube stroke',
							action,
							cellCount: changes.length,
							paintedCount,
							replacedCount,
							erasedCount,
							skippedCount,
							limitReached
						},
						scope: { cells: changes.map(function (change) { return change.cell.slice() }) },
						payload: {
							schema: 4,
							source,
							strictTargets,
							fillGuard,
							action,
							cubeMode,
							growDurationMs,
							growLineage,
							recipe,
							changes
						}
					}
				},
				async preflight(context, record, direction) {
					requireCurrent(context)
					requireReality(context, game)
					if (direction === 'forward' && record?.payload?.source === 'bucket') {
						try {
							const validation = await requireFillValidation(context, record.payload.fillGuard)
							if (!sameFillTargets(validation.plan.targets, record.payload.changes)) {
								return denied('EXTERNAL_CHANGE', 'A Paint Bucket target changed outside World Editor.')
							}
							return approved()
						} catch (error) {
							return denied(error?.code || 'EXTERNAL_CHANGE', error?.message || 'The Paint Bucket target region changed.')
						}
					}
					const bucket = record?.payload?.source === 'bucket'
					const current = bucket
						? await captureStateAsync(context, record)
						: await captureRawStateAsync(context, record)
					const expected = bucket ? expectedState(record, direction) : expectedPayloadState(record, direction)
					return (bucket ? sameTransactionState(current, expected) : sameRuntimeTransactionState(current, expected, direction === 'undo'))
						? approved()
						: denied('EXTERNAL_CHANGE', 'A painted cube stroke target changed outside World Editor.')
				},
				async capture(context, record) {
					requireCurrent(context)
					return captureStateAsync(context, record)
				},
				async apply(context, record, direction) {
					requireCurrent(context)
					requireReality(context, game)
					const bucket = record?.payload?.source === 'bucket'
					const current = bucket
						? await captureStateAsync(context, record)
						: await captureRawStateAsync(context, record)
					const expected = bucket ? expectedState(record, direction) : expectedPayloadState(record, direction)
					if (!(bucket ? sameTransactionState(current, expected) : sameRuntimeTransactionState(current, expected, direction === 'undo'))) {
						throw paintError('EXTERNAL_CHANGE', 'A painted cube stroke target changed before apply.')
					}
					const operation = { direction, surgeSaves: new Map() }
					operations.set(context.operationId, operation)
					const targetSide = direction === 'undo' ? 'before' : 'after'
					await writeChanges(context, record, function (change) {
						if (targetSide === 'before' && isTransientSurgeSave(change.before)) {
							return restorableSurgeSave(record, change, operation)
						}
						return change[targetSide]
					}, operation)
					refreshWorld()
					return approved()
				},
				async verify(context, record, direction, observed) {
					requireCurrent(context)
					const current = observed || await captureStateAsync(context, record)
					const verified = direction === 'forward'
						? record?.payload?.source === 'bucket'
							? matchesBucketForwardResult(current, record)
							: matchesForwardResult(current, record)
						: sameTransactionState(current, stateForSide(record, direction === 'undo' ? 'before' : 'after'))
					if (!verified) {
						return denied('VERIFY_FAILED', 'A painted cube stroke target did not match the requested result.')
					}
					const operation = operations.get(context.operationId)
					if (direction !== 'undo' && operation?.surgeSaves?.size) {
						transactionData.set(record.id, { surgeSaves: cloneSaveMap(operation.surgeSaves) })
					}
					operations.delete(context.operationId)
					return approved()
				},
				async restore(context, record, target) {
					if (!operations.has(context.operationId)) return approved()
					const targetSide = target === 'after' ? 'after' : 'before'
					const otherSide = targetSide === 'after' ? 'before' : 'after'
					const current = await captureStateAsync(context, record)
					const targetState = stateForSide(record, targetSide)
					const otherState = stateForSide(record, otherSide)
					const targetRecorded = !!record?.[targetSide]
					const otherRecorded = !!record?.[otherSide]
					for (let index = 0; index < current.cells.length; index += 1) {
						const currentCell = current.cells[index]
						const change = record.payload.changes[index]
						if (
							!matchesSide(currentCell, targetState.cells[index], change, targetSide, targetRecorded, record) &&
							!matchesSide(currentCell, otherState.cells[index], change, otherSide, otherRecorded, record)
						) {
							throw paintError('ROLLBACK_FAILED', 'A painted cube stroke target changed during recovery.')
						}
					}
					const operation = operations.get(context.operationId)
					await writeChanges(context, record, function (change, index) {
						return matchesSide(current.cells[index], targetState.cells[index], change, targetSide, targetRecorded, record)
							? SKIP_WRITE
							: targetSide === 'before' && isTransientSurgeSave(change.before)
								? restorableSurgeSave(record, change, operation)
								: normalizeSave(change[targetSide])
					}, operation)
					refreshWorld()
					operations.delete(context.operationId)
					return approved()
				}
			}

			let unregister
			try {
				unregister = transactions.registerAdapter(TRANSACTION_KIND, adapter)
			} catch (error) {
				console.warn('[Cattail World Editor] Atomic paint stroke adapter registration failed.', error)
				return null
			}
			const diagnostics = {
				liveBatches: 0,
				liveCellsRequested: 0,
				liveCellsChanged: 0,
				liveRefreshes: 0,
				liveWriteMs: 0,
				liveRefreshMs: 0,
				liveMaxBatchMs: 0
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
				kind: TRANSACTION_KIND,
				game,
				maxCells: MAX_CELLS,
				bucketMaxCells: BUCKET_MAX_CELLS,
				inspectCell(cell, action) {
					if (disposed) return unavailableInspection(cell, action)
					try {
						return inspectTarget(cell, action)
					} catch (error) {
						return unavailableInspection(cell, action)
					}
				},
				executeStroke(request) {
					if (disposed) return Promise.resolve(rejectedResult('NOT_READY'))
					const source = normalizeSource(request?.source)
					const normalized = normalizeTargets(
						request?.targets || request?.cells,
						source === 'bucket' ? BUCKET_MAX_CELLS : MAX_CELLS
					)
					if (!normalized.targets.length) return Promise.resolve(rejectedResult('NOTHING_TO_CHANGE'))
					const recipe = request?.recipe === undefined
						? paintState.defaultRecipe()
						: paintState.normalizeRecipe(request.recipe)
					if (!recipe) return Promise.resolve(rejectedResult('INVALID_SPEC'))
					const cubeMode = normalizeCubeMode(request?.cubeMode)
					const growDurationMs = cubeMode === 'grow'
						? paintState.normalizeGrowDurationMs(request?.growDurationMs)
						: null
					if (cubeMode === 'grow' && !growDurationMs) return Promise.resolve(rejectedResult('INVALID_SPEC'))
					const growLineage = cubeMode === 'grow' ? createGrowLineage() : null
					return transactions.execute({
						kind: TRANSACTION_KIND,
						input: normalizeInput(request?.input),
						payload: {
							action: normalizeAction(request?.action),
							source,
							strictTargets: source === 'bucket' || request?.strictTargets === true,
							fillGuard: source === 'bucket' ? jsonClone(request?.fillGuard) : null,
							cubeMode,
							growDurationMs,
							growLineage,
							recipe,
							targets: normalized.targets,
							initialSkipped: normalizeCount(request?.initialSkipped),
							limitReached: request?.limitReached === true || normalized.overflow > 0
						}
					})
				},
				beginLiveStroke(request) {
					if (disposed) return createRejectedLiveStroke('NOT_READY')
					const action = normalizeAction(request?.action)
					const cubeMode = normalizeCubeMode(request?.cubeMode)
					const recipe = request?.recipe === undefined
						? paintState.defaultRecipe()
						: paintState.normalizeRecipe(request.recipe)
					if (!recipe) return createRejectedLiveStroke('INVALID_SPEC')
					const growDurationMs = cubeMode === 'grow'
						? paintState.normalizeGrowDurationMs(request?.growDurationMs)
						: null
					if (cubeMode === 'grow' && !growDurationMs) return createRejectedLiveStroke('INVALID_SPEC')
					return createLiveStroke({
						action,
						cubeMode,
						growDurationMs,
						growLineage: cubeMode === 'grow' ? createGrowLineage() : null,
						recipe,
						input: normalizeInput(request?.input),
						initialSkipped: normalizeCount(request?.initialSkipped),
						limitReached: request?.limitReached === true
					})
				},
				executeCell(cell, input) {
					const inspection = service.inspectCell(cell, 'paint')
					if (!inspection.eligible) return Promise.resolve(rejectedResult(inspection.known ? 'CELL_OCCUPIED' : 'NOT_READY'))
					return service.executeStroke({
						action: 'paint',
						cubeMode: 'stable',
						recipe: paintState.defaultRecipe(),
						targets: [inspectionTarget(inspection)],
						input
					})
				},
				diagnostics() {
					return jsonClone(diagnostics)
				},
				dispose() {
					if (disposed) return false
					disposed = true
					operations.clear()
					transactionData.clear()
					if (typeof unregister === 'function') unregister()
					if (globalThis[STROKE_KEY] === service) delete globalThis[STROKE_KEY]
					return true
				}
			})
			return service

			function createLiveStroke(options) {
				const pendingCells = []
				const changes = []
				const visited = new Set()
				let skippedCount = options.initialSkipped
				let limitReached = options.limitReached
				let paintedCount = 0
				let replacedCount = 0
				let erasedCount = 0
				let closed = false
				let cancelled = false
				let ready = false
				let failedResult = null
				let transaction = null
				let refreshNeeded = false
				const beginPromise = Promise.resolve(transactions.beginApplied({
					kind: TRANSACTION_KIND,
					input: options.input
				})).then(function (result) {
					if (!result?.begun || typeof result.commit !== 'function' || typeof result.cancel !== 'function') {
						failedResult = result?.executed === false
							? result
							: rejectedResult(result?.error?.code || result?.reason || 'NOT_READY')
						closed = true
						return null
					}
					transaction = result
					ready = true
					if (cancelled) return result.cancel('cancelled-before-ready')
					applyLiveCells(pendingCells.splice(0))
					return result
				}).catch(function (error) {
					failedResult = failureResult(error)
					closed = true
					return null
				})

				return Object.freeze({
					ready: beginPromise,
					sample(cellValue) {
						if (closed || cancelled || failedResult) return { ok: false, reason: failedResult?.error?.code || 'CLOSED' }
						const cell = normalizeCell(cellValue)
						if (!cell) return { ok: false, reason: 'INVALID_SPEC' }
						if (!ready) {
							pendingCells.push(cell)
							return { ok: true, queued: true }
						}
						return applyLiveCell(cell)
					},
					sampleMany(cellValues) {
						if (closed || cancelled || failedResult) return { ok: false, reason: failedResult?.error?.code || 'CLOSED' }
						if (!Array.isArray(cellValues)) return { ok: false, reason: 'INVALID_SPEC' }
						const cells = []
						for (const cellValue of cellValues) {
							const cell = normalizeCell(cellValue)
							if (!cell) return { ok: false, reason: 'INVALID_SPEC' }
							cells.push(cell)
						}
						if (!ready) {
							for (const cell of cells) pendingCells.push(cell)
							return { ok: true, queued: true }
						}
						return applyLiveCells(cells)
					},
					async commit() {
						await beginPromise
						if (failedResult) return failedResult
						if (!transaction || closed) return rejectedResult('INVALIDATED')
						closed = true
						if (!changes.length) {
							await transaction.cancel('nothing-to-change')
							return rejectedResult('NOTHING_TO_CHANGE')
						}
						const result = await transaction.commit({
							summary: liveSummary(),
							scope: { cells: changes.map(function (change) { return change.cell.slice() }) },
							payload: {
								schema: 4,
								source: 'stroke',
								strictTargets: false,
								fillGuard: null,
								action: options.action,
								cubeMode: options.cubeMode,
								growDurationMs: options.growDurationMs,
								growLineage: options.growLineage,
								recipe: options.recipe,
								changes
							},
							before: transactionStateForSide(changes, 'before')
						})
						if (result?.executed === true) flushLiveRefresh()
						return result
					},
					async cancel(reason) {
						cancelled = true
						await beginPromise
						if (!transaction || closed) return false
						closed = true
						try {
							rollbackLiveChanges(changes)
						} catch (error) {
							failedResult = transaction.blockRollback?.(error?.message || 'The live stroke rollback failed.') || rejectedResult('ROLLBACK_FAILED')
							return false
						}
						await transaction.cancel(reason || 'cancelled')
						return true
					},
					snapshot() {
						return {
							ready,
							closed,
							cancelled,
							changes: changes.map(function (change) { return jsonClone(change) }),
							skippedCount,
							limitReached,
							error: jsonClone(failedResult?.error)
						}
					}
				})

				function applyLiveCells(cells) {
					if (!cells.length) return { ok: true }
					let changed = false
					let changedCount = 0
					let limit = false
					let queued = false
					let skipped = false
					let duplicate = false
					let lastChange = null
					let failure = null
					const startedAt = nowMs()
					withBatchedWorldWrites(function () {
						for (const cell of cells) {
							const result = applyLiveCell(cell, true, true)
							if (result?.ok === false) {
								failure = result
								return
							}
							if (result?.change) {
								changed = true
								changedCount += 1
								lastChange = result.change
							}
							if (result?.limitReached) limit = true
							if (result?.queued) queued = true
							if (result?.skipped) skipped = true
							if (result?.duplicate) duplicate = true
						}
					})
					const writeMs = nowMs() - startedAt
					if (failure) return failure
					diagnostics.liveBatches += 1
					diagnostics.liveCellsRequested += cells.length
					diagnostics.liveCellsChanged += changedCount
					diagnostics.liveWriteMs += writeMs
					if (writeMs > diagnostics.liveMaxBatchMs) diagnostics.liveMaxBatchMs = writeMs
					if (changed) refreshNeeded = true
					return { ok: true, change: lastChange, limitReached: limit, queued, skipped, duplicate }
				}

				function applyLiveCell(cellValue, deferRefresh, alreadyBatched) {
					if (closed || cancelled || failedResult) return { ok: false, reason: failedResult?.error?.code || 'CLOSED' }
					const cell = requireCell(cellValue)
					const key = cellKey(cell)
					if (visited.has(key)) return { ok: true, duplicate: true }
					visited.add(key)
					let inspection
					try {
						inspection = inspectTarget(cell, options.action)
					} catch (error) {
						failedResult = failureResult(error)
						return { ok: false, reason: failedResult.error.code }
					}
					if (!inspection?.eligible) {
						skippedCount += 1
						return { ok: true, skipped: true }
					}
					if (changes.length >= MAX_CELLS) {
						skippedCount += 1
						limitReached = true
						return { ok: true, skipped: true, limitReached: true }
					}
					const before = normalizeSave(inspection.before)
					const after = options.action === 'erase'
						? null
						: normalizeSave(options.cubeMode === 'grow'
							? paintState.buildGrowCubeSave(cell, options.recipe, options.growDurationMs, options.growLineage)
							: paintState.buildStableCubeSave(cell, options.recipe))
					if (options.action === 'paint' && !after) {
						failedResult = rejectedResult('INVALID_SPEC')
						return { ok: false, reason: 'INVALID_SPEC' }
					}
					const change = {
						cell: cell.slice(),
						operation: options.action === 'erase' ? 'erase' : before ? 'replace' : 'paint',
						before,
						after
					}
					try {
						const write = function () {
							const current = captureCell(cell)
							if (!sameRuntimeTransactionSave(current, before)) {
								throw paintError('EXTERNAL_CHANGE', 'A live painted cube target changed before write.')
							}
							writeCell(cell, after, { forceReplace: change.operation === 'replace' })
						}
						const startedAt = nowMs()
						if (alreadyBatched) write()
						else withBatchedWorldWrites(write)
						const writeMs = nowMs() - startedAt
						if (!deferRefresh) {
							diagnostics.liveBatches += 1
							diagnostics.liveCellsRequested += 1
							diagnostics.liveCellsChanged += 1
							diagnostics.liveWriteMs += writeMs
							if (writeMs > diagnostics.liveMaxBatchMs) diagnostics.liveMaxBatchMs = writeMs
							refreshNeeded = true
						}
					} catch (error) {
						try {
							rollbackLiveChanges(changes)
							transaction?.cancel?.('live-write-failed')
						} catch (rollbackError) {
							transaction?.blockRollback?.(rollbackError?.message || 'The live stroke rollback failed.')
						}
						failedResult = failureResult(error)
						closed = true
						return { ok: false, reason: failedResult.error.code }
					}
					changes.push(change)
					if (change.operation === 'erase') erasedCount += 1
					else if (change.operation === 'replace') replacedCount += 1
					else paintedCount += 1
					return { ok: true, change: jsonClone(change), limitReached }
				}

				function flushLiveRefresh() {
					if (!refreshNeeded) return false
					refreshNeeded = false
					const refreshStartedAt = nowMs()
					try {
						refreshWorld()
					} catch (error) {
						console.warn('[Cattail World Editor] Live paint refresh failed after commit.', error)
						return false
					} finally {
						diagnostics.liveRefreshes += 1
						diagnostics.liveRefreshMs += nowMs() - refreshStartedAt
					}
					return true
				}

				function liveSummary() {
					return {
						label: options.action === 'erase' ? 'Erase painted cube stroke' : 'Paint configured cube stroke',
						action: options.action,
						cellCount: changes.length,
						paintedCount,
						replacedCount,
						erasedCount,
						skippedCount,
						limitReached
					}
				}
			}

			function rollbackLiveChanges(changes) {
				for (let index = changes.length - 1; index >= 0; index -= 1) {
					const change = changes[index]
					const current = captureCell(change.cell)
					if (!sameRuntimeTransactionSave(current, change.after, true)) {
						throw paintError('ROLLBACK_FAILED', 'A live painted cube stroke target changed before rollback.')
					}
					withBatchedWorldWrites(function () {
						writeCell(change.cell, change.before, { forceReplace: true })
					})
				}
				refreshWorld()
			}

			function transactionStateForSide(changes, side) {
				return {
					cells: changes.map(function (change) {
						return { cell: change.cell.slice(), save: historyGuardSave(change[side]) }
					})
				}
			}

			function createRejectedLiveStroke(code) {
				const result = rejectedResult(code)
				return Object.freeze({
					ready: Promise.resolve(null),
					sample() { return { ok: false, reason: result.error.code } },
					commit() { return Promise.resolve(result) },
					cancel() { return Promise.resolve(false) },
					snapshot() {
						return { ready: false, closed: true, cancelled: false, changes: [], skippedCount: 0, limitReached: false, error: result.error }
					}
				})
			}

			function inspectTarget(cellValue, actionValue) {
				const cell = requireCell(cellValue)
				const action = normalizeAction(actionValue)
				const occupancy = inspectOccupancy(game, cell)
				if (!occupancy.known) return unavailableInspection(cell, action)
				const before = occupancy.entity ? captureEntity(occupancy.entity, cell) : null
				const painted = !!before && paintState.isPainted(before)
				const transientSurge = isTransientSurgeSave(before)
				const eligible = action === 'erase' ? painted : !before || painted || transientSurge
				return {
					cell: cell.slice(),
					action,
					known: true,
					eligible,
					occupied: !!before,
					painted,
					operation: !eligible ? null : action === 'erase' ? 'erase' : before ? 'replace' : 'paint',
					before: jsonClone(before)
				}
			}

			function normalizeTargets(value, limitValue) {
				if (!Array.isArray(value)) return { targets: [], overflow: 0 }
				const limit = limitValue === BUCKET_MAX_CELLS ? BUCKET_MAX_CELLS : MAX_CELLS
				const targets = []
				const seen = new Set()
				let overflow = 0
				for (const entry of value) {
					const cell = normalizeCell(Array.isArray(entry) ? entry : entry?.cell)
					if (!cell) continue
					const key = cellKey(cell)
					if (seen.has(key)) continue
					seen.add(key)
					if (targets.length >= limit) {
						overflow += 1
						continue
					}
					const hasBefore = !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry || {}, 'before')
					const target = { cell: cell.slice(), hasBefore }
					if (hasBefore) target.before = normalizeSave(entry.before)
					targets.push(target)
				}
				return { targets, overflow }
			}

			function captureRawState(record) {
				return {
					cells: record.payload.changes.map(function (change) {
						return { cell: change.cell.slice(), save: captureCell(change.cell) }
					})
				}
			}

			async function captureRawStateAsync(context, record) {
				if (record?.payload?.source !== 'bucket') return captureRawState(record)
				const cells = []
				for (let index = 0; index < record.payload.changes.length; index += 1) {
					requireCurrent(context)
					const change = record.payload.changes[index]
					cells.push({ cell: change.cell.slice(), save: captureCell(change.cell) })
					if ((index + 1) % YIELD_EVERY === 0) await yieldWork(context)
				}
				return { cells }
			}

			async function captureStateAsync(context, record) {
				const raw = await captureRawStateAsync(context, record)
				return {
					cells: raw.cells.map(function (entry) {
						return {
							cell: entry.cell.slice(),
							save: guardSaveForRecord(entry.save, record)
						}
					})
				}
			}

			function guardSaveForRecord(saveValue, record) {
				return record?.payload?.source === 'bucket'
					? bucketGuardSave(saveValue, record)
					: historyGuardSave(saveValue)
			}

			function historyGuardSave(saveValue) {
				const save = normalizeSave(saveValue)
				if (!save) return null
				if (isTransientSurgeSave(save)) return transientSurgeGuard(save)
				const runtime = paintedRuntimeState(save)
				if (!runtime) return save
				const guard = jsonClone(save)
				guard.par.broken = 'painted-runtime'
				guard.par.resources = 'painted-runtime'
				if (Object.prototype.hasOwnProperty.call(guard.par, 'soul')) guard.par.soul = 'painted-runtime'
				if (runtime.paint.version !== paintState.growPaintVersion) return guard
				if (Object.prototype.hasOwnProperty.call(guard.par, 'state')) guard.par.state = 'grow-progress'
				if (Object.prototype.hasOwnProperty.call(guard.par, 'fill')) guard.par.fill = 'grow-progress'
				if (Object.prototype.hasOwnProperty.call(guard.par, 'unveilProgress')) guard.par.unveilProgress = 'grow-progress'
				if (guard.par[paintState.field]?.growth) {
					guard.par[paintState.field].growth.phase = 'grow-progress'
					guard.par[paintState.field].growth.elapsedMs = 'grow-progress'
				}
				return guard
			}

			function paintedRuntimeState(saveValue) {
				const save = normalizeSave(saveValue)
				const paint = paintState.normalizePaint(save)
				const broken = Number(save?.par?.broken)
				const resources = save?.par?.resources
				const hasSoul = Object.prototype.hasOwnProperty.call(save?.par || {}, 'soul')
				const soul = hasSoul ? Number(save.par.soul) : null
				if (
					!paint ||
					!Number.isFinite(broken) ||
					broken < 0 ||
					broken > 1 ||
					!Array.isArray(resources) ||
					resources.length !== paintState.slots ||
					!resources.every(function (resource) {
						return Number.isInteger(resource) && resource >= 0
					}) ||
					(hasSoul && (!Number.isFinite(soul) || soul < 0 || soul > 1))
				) return null
				return { paint, broken, soul }
			}

			function bucketGuardSave(saveValue, record) {
				const save = normalizeSave(saveValue)
				if (!save) return null
				if (isTransientSurgeSave(save)) return transientSurgeGuard(save)
				const paint = paintState.normalizePaint(save)
				if (!paint) {
					return {
						name: save.name,
						position: save.position.slice(),
						par: { worldEditorBucketGuard: { kind: 'blocked' } }
					}
				}
				const mode = paint.version === paintState.growPaintVersion ? 'grow' : 'stable'
				const targetMode = normalizeCubeMode(record?.payload?.cubeMode)
				const targetRecipe = paintState.normalizeRecipe(record?.payload?.recipe)
				const targetDuration = targetMode === 'grow'
					? paintState.normalizeGrowDurationMs(record?.payload?.growDurationMs)
					: null
				const noOp = mode === targetMode && sameValue(paint.recipe, targetRecipe) && (
					targetMode !== 'grow' || paint.growth?.durationMs === targetDuration
				)
				return {
					name: 'cube',
					position: save.position.slice(),
					par: {
						worldEditorBucketGuard: {
							kind: 'painted',
							mode,
							recipe: jsonClone(paint.recipe),
							noOp
						}
					}
				}
			}

			function expectedState(record, direction) {
				if (direction === 'undo') return record.after || payloadState(record, 'after')
				if (direction === 'redo') return record.before || payloadState(record, 'before')
				return record.before || payloadState(record, 'before')
			}

			function expectedPayloadState(record, direction) {
				if (direction === 'undo') return payloadState(record, 'after')
				return payloadState(record, 'before')
			}

			function payloadState(record, side) {
				return {
					cells: record.payload.changes.map(function (change) {
						return { cell: change.cell.slice(), save: normalizeSave(change[side]) }
					})
				}
			}

			function stateForSide(record, side) {
				return record?.[side] || payloadState(record, side)
			}

			function matchesForwardResult(current, record) {
				if (!Array.isArray(current?.cells) || current.cells.length !== record.payload.changes.length) return false
				for (let index = 0; index < record.payload.changes.length; index += 1) {
					const change = record.payload.changes[index]
					if (!sameValue(current.cells[index]?.cell, change.cell)) return false
					if (!matchesGuardedAfter(current.cells[index]?.save, change.after, record)) return false
				}
				return true
			}

			function matchesBucketForwardResult(current, record) {
				if (!Array.isArray(current?.cells) || current.cells.length !== record.payload.changes.length) return false
				for (let index = 0; index < record.payload.changes.length; index += 1) {
					const change = record.payload.changes[index]
					const expected = { cell: change.cell.slice(), save: bucketGuardSave(change.after, record) }
					if (!sameValue(current.cells[index], expected)) return false
				}
				return true
			}

			function matchesSide(currentCell, expectedCell, change, side, recorded, record) {
				if (sameTransactionCell(currentCell, expectedCell)) return true
				if (side !== 'after' || recorded) return false
				return sameValue(currentCell?.cell, change.cell) && matchesGuardedAfter(currentCell?.save, change.after, record)
			}

			function matchesGuardedAfter(actualValue, intendedValue, record) {
				if (!intendedValue) return actualValue === null
				if (record?.payload?.source === 'bucket') {
					return sameValue(actualValue, bucketGuardSave(intendedValue, record))
				}
				const actual = normalizeSave(actualValue)
				const intended = historyGuardSave(intendedValue)
				if (!actual || !intended || actual.name !== 'cube' || intended.name !== 'cube') return false
				if (!sameValue(actual.position, intended.position)) return false
				for (const key of ['broken', 'resources', 'state', 'fill', 'unveilProgress', paintState.field]) {
					const actualHas = Object.prototype.hasOwnProperty.call(actual.par || {}, key)
					const intendedHas = Object.prototype.hasOwnProperty.call(intended.par || {}, key)
					if (actualHas !== intendedHas || (actualHas && !sameValue(actual.par[key], intended.par[key]))) return false
				}
				return true
			}

			function sameTransactionState(actual, intended) {
				if (sameValue(actual, intended)) return true
				if (!Array.isArray(actual?.cells) || !Array.isArray(intended?.cells) || actual.cells.length !== intended.cells.length) return false
				for (let index = 0; index < actual.cells.length; index += 1) {
					if (!sameTransactionCell(actual.cells[index], intended.cells[index])) return false
				}
				return true
			}

			function sameRuntimeTransactionState(actual, intended, allowGeneratedAfter) {
				if (sameValue(actual, intended)) return true
				if (!Array.isArray(actual?.cells) || !Array.isArray(intended?.cells) || actual.cells.length !== intended.cells.length) return false
				for (let index = 0; index < actual.cells.length; index += 1) {
					if (!sameValue(actual.cells[index]?.cell, intended.cells[index]?.cell)) return false
					if (!sameRuntimeTransactionSave(actual.cells[index]?.save, intended.cells[index]?.save, allowGeneratedAfter)) return false
				}
				return true
			}

			function sameRuntimeTransactionSave(actualValue, intendedValue, allowGeneratedAfter) {
				if (sameValue(actualValue, intendedValue)) return true
				const actual = normalizeSave(actualValue)
				const intended = normalizeSave(intendedValue)
				const actualSurge = transientSurgeState(actual)
				const intendedSurge = transientSurgeState(intended)
				if (actualSurge || intendedSurge) {
					return !!actualSurge && !!intendedSurge && sameValue(actualSurge, intendedSurge)
				}
				const actualRuntime = paintedRuntimeState(actual)
				const intendedRuntime = paintedRuntimeState(intended)
				if (!actualRuntime || !intendedRuntime) return false
				if (
					!sameValue(historyGuardSave(actual), historyGuardSave(intended)) &&
					!(allowGeneratedAfter === true && sameGeneratedRuntimeIdentity(actual, intended))
				) return false
				if (actualRuntime.broken < intendedRuntime.broken) return false
				if (actualRuntime.paint.version !== paintState.growPaintVersion) return true
				if (!paintState.matchesGrowProgress(actual, intended)) return false
				const actualState = Number(actual.par?.state)
				const intendedState = Number(intended.par?.state)
				if (!Number.isInteger(actualState) || !Number.isInteger(intendedState) || actualState < intendedState) return false
				if (actualState === intendedState && actualState === 0 && Number(actual.par?.fill) < Number(intended.par?.fill)) return false
				if (actualState === intendedState && actualState === 1 && Number(actual.par?.unveilProgress) < Number(intended.par?.unveilProgress)) return false
				return growPhaseOrder(actualRuntime.paint.growth?.phase) >= growPhaseOrder(intendedRuntime.paint.growth?.phase)
			}

			function sameGeneratedRuntimeIdentity(actualValue, intendedValue) {
				const actual = historyGuardSave(actualValue)
				const intended = historyGuardSave(intendedValue)
				if (!actual || !intended || actual.name !== 'cube' || intended.name !== 'cube') return false
				if (!sameValue(actual.position, intended.position)) return false
				for (const key of ['state', 'fill', 'unveilProgress', paintState.field]) {
					const actualHas = Object.prototype.hasOwnProperty.call(actual.par || {}, key)
					const intendedHas = Object.prototype.hasOwnProperty.call(intended.par || {}, key)
					if (actualHas !== intendedHas || (actualHas && !sameValue(actual.par[key], intended.par[key]))) return false
				}
				return true
			}

			function growPhaseOrder(value) {
				if (value === 'growing') return 0
				if (value === 'revealing') return 1
				if (value === 'stable') return 2
				return -1
			}

			function sameTransactionCell(actual, intended) {
				if (sameValue(actual, intended)) return true
				if (!sameValue(actual?.cell, intended?.cell)) return false
				return sameTransactionSave(actual?.save, intended?.save)
			}

			function sameTransactionSave(actualValue, intendedValue) {
				if (sameValue(actualValue, intendedValue)) return true
				const actual = normalizeSave(actualValue)
				const intended = normalizeSave(intendedValue)
				if (!actual || !intended || actual.name !== 'cube' || intended.name !== 'cube') return false
				if (!sameValue(actual.position, intended.position)) return false
				if (!paintState.isGrowPaint(actual) || !paintState.isGrowPaint(intended)) return false
				if (!sameValue(actual.par?.resources, intended.par?.resources)) return false
				if (!sameValue(actual.par?.broken, intended.par?.broken)) return false
				const actualState = Number(actual.par?.state)
				const intendedState = Number(intended.par?.state)
				if (!Number.isInteger(actualState) || !Number.isInteger(intendedState) || actualState < intendedState) return false
				if (actualState === intendedState && actualState === 0 && Number(actual.par?.fill) < Number(intended.par?.fill)) return false
				if (actualState === intendedState && actualState === 1 && Number(actual.par?.unveilProgress) < Number(intended.par?.unveilProgress)) return false
				return paintState.matchesGrowProgress(actual, intended)
			}

			function captureCell(cellValue) {
				const cell = requireCell(cellValue)
				const occupancy = inspectOccupancy(game, cell)
				if (!occupancy.known) throw paintError('NOT_READY', 'The target cell could not be inspected.')
				return occupancy.entity ? captureEntity(occupancy.entity, cell) : null
			}

			function captureEntity(entity, cell) {
				const transientIdentity = safeName(entity?.name) === 'surge'
					? ensureTransientIdentity(entity)
					: null
				let saved = null
				if (typeof game.getEntityString === 'function') {
					try {
						saved = game.getEntityString(entity) || null
					} catch (error) {}
				}
				if (!saved) {
					saved = { name: entity.name, position: entity.position || cell, par: capturePar(entity) }
				} else if (paintState.isPainted(entity)) {
					saved = Object.assign({}, saved, {
						par: Object.assign({}, saved.par, { [paintState.field]: paintState.normalizePaint(entity) })
					})
				}
				const normalized = normalizeSave(saved)
				if (normalized && transientIdentity) normalized.transientIdentity = transientIdentity
				return normalized
			}

			function capturePar(entity) {
				const par = {}
				for (const key of [
					'state', 'fill', 'unveilProgress', 'broken', 'soul', 'resources', paintState.field,
					'rayNumber', 'grade', 'colors', 'type', 'maxLife', 'life'
				]) {
					if (Object.prototype.hasOwnProperty.call(entity, key)) par[key] = jsonClone(entity[key])
				}
				return par
			}

			function normalizeSave(value) {
				if (value === null || value === undefined) return null
				const name = safeName(value?.name)
				const position = normalizeCell(value?.position)
				if (!name || !position || !value?.par || typeof value.par !== 'object') return null
				const par = jsonClone(value.par)
				if (name === 'cube') {
					const paint = paintState.normalizePaint({ par })
					if (paint) par[paintState.field] = paint
				}
				const save = { name, position, par }
				const transientIdentity = normalizeTransientIdentity(value?.transientIdentity)
				if (name === 'surge' && transientIdentity) save.transientIdentity = transientIdentity
				return save
			}

			function writeCell(cellValue, saveValue, options) {
				const cell = requireCell(cellValue)
				const save = normalizeSave(saveValue)
				const occupancy = inspectOccupancy(game, cell)
				if (!occupancy.known) throw paintError('NOT_READY', 'The target cell could not be inspected.')
				if (!save) {
					if (occupancy.entity) game.clearCell(occupancy.entity.position || cell)
					return null
				}
				if (save.name !== 'surge' && (save.name !== 'cube' || !paintState.isPainted(save))) {
					throw paintError('APPLY_FAILED', 'Only a strict painted cube or a captured transient Surge can be written by this adapter.')
				}
				if (occupancy.entity) {
					const current = captureEntity(occupancy.entity, cell)
					if (options?.forceReplace !== true && sameSave(current, save)) return occupancy.entity
					game.clearCell(occupancy.entity.position || cell)
				}
				const misc = save.name === 'surge'
					? restoreSurgeMisc(save)
					: { pump: false, resources: jsonClone(save.par.resources || []) }
				const entity = game.addEntity(save.name, save.position || cell, misc, { skipShopUpdate: true })
				if (!entity) {
					throw paintError('APPLY_FAILED', save.name === 'surge'
						? 'The replaced Surge could not be restored.'
						: 'The painted cube could not be created.')
				}
				for (const key of Object.keys(save.par)) {
					if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue
					entity[key] = jsonClone(save.par[key])
				}
				entity.position = (save.position || cell).slice()
				entity.init?.()
				if (save.name === 'surge') assignTransientIdentity(entity, save.transientIdentity)
				return entity
			}

			function restoreSurgeMisc(save) {
				const par = save?.par || {}
				return {
					resources: jsonClone(par.resources),
					rayNumber: par.rayNumber,
					grade: par.grade,
					colors: jsonClone(par.colors),
					type: par.type,
					maxLife: par.maxLife,
					life: par.life
				}
			}

			function isTransientSurgeSave(value) {
				return safeName(value?.name) === 'surge' &&
					!!normalizeCell(value?.position) &&
					!!value?.par &&
					typeof value.par === 'object'
			}

			function transientSurgeState(saveValue) {
				const save = normalizeSave(saveValue)
				const transientIdentity = normalizeTransientIdentity(save?.transientIdentity)
				if (!isTransientSurgeSave(save) || !transientIdentity) return null
				return {
					name: 'surge',
					position: save.position.slice(),
					transientIdentity
				}
			}

			function transientSurgeGuard(saveValue) {
				const state = transientSurgeState(saveValue)
				if (!state) return normalizeSave(saveValue)
				return {
					name: 'surge',
					position: state.position.slice(),
					transientIdentity: state.transientIdentity,
					par: { worldEditorTransientSurge: true }
				}
			}

			function sameTransientSurgeIdentity(left, right) {
				const leftState = transientSurgeState(left)
				const rightState = transientSurgeState(right)
				return !!leftState && !!rightState && sameValue(leftState, rightState)
			}

			function ensureTransientIdentity(entity) {
				let identity = transientIdentityByEntity.get(entity)
				if (identity) return identity
				transientIdentitySequence += 1
				identity = 'paint-surge-' + Date.now().toString(36) + '-' + transientIdentitySequence.toString(36)
				transientIdentityByEntity.set(entity, identity)
				return identity
			}

			function assignTransientIdentity(entity, value) {
				const identity = normalizeTransientIdentity(value)
				if (!entity || !identity) return null
				transientIdentityByEntity.set(entity, identity)
				return identity
			}

			function normalizeTransientIdentity(value) {
				const identity = String(value || '').trim()
				return identity && identity.length <= 160 ? identity : null
			}

			function restorableSurgeSave(record, change, operation) {
				const key = cellKey(change.cell)
				return normalizeSave(
					operation?.surgeSaves?.get(key) ||
					transactionData.get(record.id)?.surgeSaves?.get(key) ||
					change.before
				)
			}

			function cloneSaveMap(value) {
				const result = new Map()
				for (const [key, save] of value || []) result.set(key, normalizeSave(save))
				return result
			}

			function withBatchedWorldWrites(callback) {
				const restoreShopUpdates = deferMethod(game?.shop, 'updateElements')
				const restoreStuffSort = deferSort(game?.stuff)
				try {
					return callback()
				} finally {
					try {
						restoreShopUpdates()
					} finally {
						restoreStuffSort()
					}
				}
			}

			function deferMethod(target, name) {
				if (!target || typeof target[name] !== 'function') return function () {}
				const hadOwn = Object.prototype.hasOwnProperty.call(target, name)
				const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(target, name) : null
				const deferred = function () {}
				try {
					Object.defineProperty(target, name, {
						value: deferred,
						configurable: true,
						writable: true
					})
				} catch (error) {
					return function () {}
				}
				if (target[name] !== deferred) {
					if (hadOwn) Object.defineProperty(target, name, descriptor)
					else delete target[name]
					return function () {}
				}
				return function restoreDeferredMethod() {
					if (hadOwn) Object.defineProperty(target, name, descriptor)
					else delete target[name]
				}
			}

			function deferSort(stuff) {
				if (!Array.isArray(stuff) || typeof stuff.sort !== 'function') return function () {}
				const originalSort = stuff.sort
				const hadOwn = Object.prototype.hasOwnProperty.call(stuff, 'sort')
				const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(stuff, 'sort') : null
				let requested = false
				let comparator
				const deferred = function (nextComparator) {
					requested = true
					comparator = nextComparator
					return this
				}
				try {
					Object.defineProperty(stuff, 'sort', {
						value: deferred,
						configurable: true,
						writable: true
					})
				} catch (error) {
					return function () {}
				}
				if (stuff.sort !== deferred) {
					if (hadOwn) Object.defineProperty(stuff, 'sort', descriptor)
					else delete stuff.sort
					return function () {}
				}
				return function restoreDeferredSort() {
					if (hadOwn) Object.defineProperty(stuff, 'sort', descriptor)
					else delete stuff.sort
					if (requested) originalSort.call(stuff, comparator)
				}
			}

			function refreshWorld() {
				game.shop?.updateElements?.()
				game.shop?.check?.()
				game.processMousemove2?.()
			}

			async function writeChanges(context, record, saveForChange, operation) {
				const changes = record.payload.changes
				const timeSliced = record.payload.source === 'bucket'
				const chunkSize = timeSliced ? YIELD_EVERY : Math.max(1, changes.length)
				for (let start = 0; start < changes.length; start += chunkSize) {
					const end = Math.min(changes.length, start + chunkSize)
					withBatchedWorldWrites(function () {
						for (let index = start; index < end; index += 1) {
							requireCurrent(context)
							const change = changes[index]
							if (
								operation &&
								operation.direction !== 'undo' &&
								isTransientSurgeSave(change.before) &&
								!operation.surgeSaves.has(cellKey(change.cell))
							) {
								const current = captureCell(change.cell)
								if (!sameTransientSurgeIdentity(current, change.before)) {
									throw paintError('EXTERNAL_CHANGE', 'A transient Surge target changed before replacement.')
								}
								operation.surgeSaves.set(cellKey(change.cell), normalizeSave(current))
							}
							const save = saveForChange(change, index)
							if (save === SKIP_WRITE) continue
							writeCell(change.cell, save, { forceReplace: change.operation === 'replace' })
						}
					})
					if (end < changes.length) await yieldWork(context)
				}
			}

			function sameFillTargets(targets, changes) {
				if (!Array.isArray(targets) || targets.length !== changes.length) return false
				const byCell = new Set(targets.map(function (target) { return cellKey(target.cell) }))
				for (const change of changes) {
					if (!byCell.has(cellKey(change.cell))) return false
				}
				return true
			}

			async function requireFillValidation(context, guard) {
				const fill = globalThis[FILL_KEY]
				if (!fill || fill.game !== game || typeof fill.validatePlan !== 'function') {
					throw paintError('NOT_READY', 'The Paint Bucket planner is unavailable.')
				}
				return fill.validatePlan(guard, {
					isCancelled() {
						return !!(context && typeof context.isCurrent === 'function' && !context.isCurrent())
					}
				})
			}

			async function yieldWork(context) {
				requireCurrent(context)
				if (typeof setTimeout === 'function') {
					await new Promise(function (resolve) { setTimeout(resolve, 0) })
				} else if (typeof requestAnimationFrame === 'function') {
					await new Promise(function (resolve) { requestAnimationFrame(function () { resolve() }) })
				} else {
					await Promise.resolve()
				}
				requireCurrent(context)
			}
		}

		function inspectionTarget(inspection) {
			return { cell: inspection.cell.slice(), before: jsonClone(inspection.before) }
		}

		function unavailableInspection(cellValue, actionValue) {
			return {
				cell: normalizeCell(cellValue),
				action: normalizeAction(actionValue),
				known: false,
				eligible: false,
				occupied: false,
				painted: false,
				operation: null,
				before: null
			}
		}

		function inspectOccupancy(game, cell) {
			try {
				if (typeof game?.entityAtCoordinates === 'function') {
					return { known: true, entity: game.entityAtCoordinates(cell) || null }
				}
				if (game?.stuffMap && typeof game.stuffMap === 'object') {
					return { known: true, entity: game.stuffMap['u' + cell[0] + 'v' + cell[1]] || null }
				}
			} catch (error) {
				return { known: false, entity: null }
			}
			return { known: false, entity: null }
		}

		function requireReality(context, game) {
			if (Number(context?.plane) !== 0 || !!game?.plane) {
				throw paintError('PLANE_CHANGED', 'Painted cubes can only be edited on the reality plane.')
			}
		}

		function requireCurrent(context) {
			if (context && typeof context.isCurrent === 'function' && !context.isCurrent()) {
				throw paintError('INVALIDATED', 'The painted cube operation was invalidated.')
			}
		}

		function requireCell(value) {
			const cell = normalizeCell(value)
			if (!cell) throw paintError('INVALID_SPEC', 'A valid paint cell is required.')
			return cell
		}

		function normalizeCell(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
		}

		function normalizeAction(value) {
			return value === 'erase' || value === 'eraser' ? 'erase' : 'paint'
		}

		function normalizeCubeMode(value) {
			return value === 'grow' ? 'grow' : 'stable'
		}

		function normalizeSource(value) {
			return value === 'bucket' ? 'bucket' : 'stroke'
		}

		const SKIP_WRITE = Symbol('paint-cube-skip-write')

		function createGrowLineage() {
			lineageCounter = (lineageCounter + 1) % 1679616
			return 'grow-' + Date.now().toString(36) + '-' + lineageCounter.toString(36).padStart(4, '0')
		}

		function normalizeInput(value) {
			return ['mouse', 'keyboard', 'gamepad', 'touch', 'api'].includes(value) ? value : 'api'
		}

		function normalizeCount(value) {
			const number = Number(value)
			return Number.isInteger(number) && number > 0 ? Math.min(1000000, number) : 0
		}

		function cellKey(cell) {
			return cell[0] + ':' + cell[1]
		}

		function safeName(value) {
			return String(value || '').trim().toLowerCase()
		}

		function sameSave(left, right) {
			return sameValue(left, right)
		}

		function sameValue(left, right) {
			return stableString(left) === stableString(right)
		}

		function stableString(value) {
			if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']'
			if (!value || typeof value !== 'object') return JSON.stringify(value)
			return '{' + Object.keys(value).sort().map(function (key) {
				return JSON.stringify(key) + ':' + stableString(value[key])
			}).join(',') + '}'
		}

		function jsonClone(value) {
			return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
		}

		function nowMs() {
			try {
				if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
			} catch (error) {}
			return Date.now()
		}

		function approved() {
			return { ok: true }
		}

		function denied(code, message) {
			return { ok: false, code, message }
		}

		function paintError(code, message) {
			const error = new Error(message)
			error.code = code
			return error
		}

		function rejectedResult(code) {
			return {
				accepted: false,
				executed: false,
				reason: String(code || 'NOT_READY'),
				error: { code: String(code || 'NOT_READY'), message: 'The painted cube operation is unavailable.' }
			}
		}
	}
})
