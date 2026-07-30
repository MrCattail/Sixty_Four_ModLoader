ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
		const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
		const TRANSACTION_KIND = 'selection-delete'
		const SERVICE_VERSION = '1.0.0'
		const ADAPTER_VERSION = '1.0.0'
		const PLAN_SCHEMA = 1
		const TRANSACTION_SCHEMA = 1
		const SCAN_CHUNK_SIZE = 512
		const APPLY_CHUNK_SIZE = 32
		const PROBE_EVENT_LIMIT = 160
		const EPSILON = 1e-7
		const EXTRACTOR_NAMES = new Set(['pump', 'pump2', 'gradient'])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const selection = globalThis[SELECTION_KEY]
			const placement = globalThis[PLACEMENT_KEY]
			const creative = globalThis[CREATIVE_KEY]
			const previous = globalThis[DELETE_KEY]
			previous?.dispose?.('selection-delete-replaced')

			if (
				!runtime ||
				runtime.game !== game ||
				!transactions ||
				transactions.game !== game ||
				typeof transactions.registerAdapter !== 'function' ||
				typeof transactions.execute !== 'function' ||
				!selection ||
				selection.game !== game ||
				typeof selection.snapshot !== 'function' ||
				!placement ||
				placement.game !== game ||
				typeof placement.assessEntity !== 'function'
			) {
				console.warn('[Cattail World Editor] Selection deletion 4C-1a could not find its core services.')
				return
			}

			const service = createService(game, runtime, transactions, selection, placement, creative)
			Object.defineProperty(globalThis, DELETE_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Safe selection deletion 4C-1a ready.')
		})

		function createService(game, runtime, transactions, selection, placement, creative) {
			const listeners = new Set()
			const identityByEntity = new WeakMap()
			const transactionData = new Map()
			const operations = new Map()
			const probeEvents = []
			let identitySequence = 0
			let probeSequence = 0
			let planningToken = 0
			let disposed = false
			let planning = false
			let busy = false
			let phase = 'idle'
			let revision = 0
			let lastReason = 'initialized'
			let lastPlan = null
			let lastResult = null
			let error = null
			let refreshWarning = null

			const adapter = {
				version: ADAPTER_VERSION,
				async prepare(context, request) {
					traceProbe('adapter.prepare.start', {
						operationId: context?.operationId,
						direction: context?.direction
					})
					requireCurrent(context)
					const requested = normalizePlanRequest(request?.plan)
					const rebuilt = await rebuildPlan(requested.source, function () {
						return !context.isCurrent()
					})
					requireCurrent(context)
					traceProbe('adapter.prepare.rebuilt', {
						signatureMatch: rebuilt.signature === requested.signature,
						safeCount: rebuilt.summary.safeCount,
						protectedCount: rebuilt.summary.protectedCount,
						crossBoundaryCount: rebuilt.summary.crossBoundaryCount,
						signatureDifference: comparePlanFingerprints(
							requested.fingerprints,
							rebuilt.fingerprints
						)
					})
					if (rebuilt.signature !== requested.signature) {
						throw deletionError('TARGET_CHANGED', 'The selected deletion target changed after confirmation.')
					}
					if (!rebuilt.removals.length) {
						throw deletionError('NOTHING_SAFE', 'The selection contains no safely deletable buildings.')
					}
					traceProbe('adapter.prepare.ready', {
						safeCount: rebuilt.summary.safeCount,
						sourceCellCount: rebuilt.summary.sourceCellCount
					})
					return {
						summary: {
							label: 'Selection contents deletion',
							deleteCount: rebuilt.summary.safeCount,
							protectedCount: rebuilt.summary.protectedCount,
							crossBoundaryCount: rebuilt.summary.crossBoundaryCount
						},
						scope: {
							sourceKind: rebuilt.source.kind,
							sourceCellCount: rebuilt.summary.sourceCellCount,
							cells: rebuilt.scopeCells,
							deleteCount: rebuilt.summary.safeCount
						},
						payload: {
							schema: TRANSACTION_SCHEMA,
							source: rebuilt.source,
							planSignature: rebuilt.signature,
							removals: rebuilt.removals,
							scopeCells: rebuilt.scopeCells,
							onlyOneKeys: rebuilt.onlyOneKeys,
							onlyonesBefore: rebuilt.onlyonesBefore,
							onlyonesAfter: rebuilt.onlyonesAfter,
							economy: rebuilt.economy,
							statsDelta: {
								machinesSold: rebuilt.removals.length
							}
						}
					}
				},
				async preflight(context, record, direction) {
					traceProbe('adapter.preflight.start', {
						operationId: context?.operationId,
						direction,
						hasSnapshot: !!context?.snapshotId
					})
					requireCurrent(context)
					validateRecord(record)
					requireGameMethods(game)
					const payload = record.payload
					if (creativeActive(creative, game) !== payload.economy.creative) {
						return denied('ECONOMY_MODE_CHANGED', 'Creative mode changed after deletion was prepared.')
					}

					if (direction === 'forward') {
						try {
							const rebuilt = await rebuildPlan(payload.source, function () {
								return !context.isCurrent()
							})
							requireCurrent(context)
							if (rebuilt.signature !== payload.planSignature) {
								return denied('TARGET_CHANGED', 'The selected deletion target changed after confirmation.')
							}
						} catch (targetError) {
							return denied(
								targetError?.code || 'TARGET_CHANGED',
								targetError?.message || 'The selected deletion target changed after confirmation.'
							)
						}
					} else {
						const targetState = inspectRecordedTargets(payload, direction)
						if (!targetState.ok) return targetState
						if (direction === 'redo') {
							try {
								const economy = simulateEconomy(game, payload.removals, payload.economy.creative)
								if (!sameEconomy(economy, payload.economy)) {
									return denied('PRICE_CHANGED', 'Building or eraser prices changed before deletion.')
								}
							} catch (economyError) {
								return denied(
									economyError?.code || 'PREFLIGHT_FAILED',
									economyError?.message || 'The deletion economy could not be revalidated.'
								)
							}
						}
					}

					const affordability = inspectAffordability(game.resources, payload.economy, direction)
					if (!affordability.ok) {
						traceProbe('adapter.preflight.denied', {
							direction,
							code: affordability.code
						})
						return affordability
					}
					traceProbe('adapter.preflight.ready', {
						direction,
						hasSnapshot: !!context?.snapshotId,
						deleteCount: payload.removals.length
					})
					return approved()
				},
				async capture(context, record) {
					if (!context.isCurrent()) throw deletionError('INVALIDATED', 'The deletion operation was invalidated.')
					validateRecord(record)
					const captured = captureScope(record.payload)
					traceProbe('adapter.capture', {
						direction: context?.direction,
						hasSnapshot: !!context?.snapshotId,
						cellCount: captured.cells.length,
						entityCount: captured.entities.length
					})
					return captured
				},
				async apply(context, record, direction) {
					traceProbe('adapter.apply.start', {
						operationId: context?.operationId,
						direction,
						deleteCount: record?.payload?.removals?.length || 0
					})
					requireCurrent(context)
					validateRecord(record)
					const state = {
						recordId: record.id,
						direction,
						mutations: [],
						resourcesBefore: numericArray(game.resources),
						statsBefore: captureStats(game),
						resourceDelta: [],
						statsAfter: null,
						removedSaves: new Map()
					}
					operations.set(context.operationId, state)
					if (direction === 'undo') await applyUndo(context, record, state)
					else await applyForward(context, record, state)
					refreshWorld(game)
					traceProbe('adapter.apply.complete', {
						operationId: context?.operationId,
						direction,
						mutationCount: state.mutations.length,
						removedCount: state.removedSaves.size
					})
					return { ok: true }
				},
				async verify(context, record, direction) {
					traceProbe('adapter.verify.start', {
						operationId: context?.operationId,
						direction
					})
					requireCurrent(context)
					const state = operations.get(context.operationId)
					if (!state) {
						traceProbe('adapter.verify.denied', {
							direction,
							code: 'VERIFY_FAILED',
							reason: 'operation-state-missing'
						})
						return denied('VERIFY_FAILED', 'The deletion operation state is unavailable.')
					}
					const expectedAfter = direction !== 'undo'
					const verification = verifyAppliedState(record.payload, state, expectedAfter)
					if (!verification.ok) {
						traceProbe('adapter.verify.denied', {
							direction,
							code: verification.code
						})
						return verification
					}

					if (expectedAfter && !transactionData.has(record.id)) {
						transactionData.set(record.id, {
							removalSaves: new Map(state.removedSaves),
							timeSinceLastDelete: state.statsBefore.timeSinceLastDelete
						})
					}
					if (expectedAfter) playRecycleSound(record.payload.removals)
					operations.delete(context.operationId)
					refreshSelectionAnalysis('selection-delete-' + direction + '-verified')
					traceProbe('adapter.verify.complete', {
						direction,
						deleteCount: record.payload.removals.length
					})
					return approved()
				},
				async restore(context, record) {
					const state = operations.get(context.operationId)
					traceProbe('adapter.restore.start', {
						operationId: context?.operationId,
						direction: context?.direction,
						hasState: !!state
					})
					if (!state) return denied('ROLLBACK_FAILED', 'The deletion rollback state is unavailable.')
					try {
						rollbackMutations(state)
						refreshWorld(game)
						operations.delete(context.operationId)
						traceProbe('adapter.restore.complete', {
							operationId: context?.operationId,
							direction: context?.direction
						})
						return { ok: true }
					} catch (rollbackError) {
						traceProbe('adapter.restore.failed', {
							operationId: context?.operationId,
							direction: context?.direction,
							code: rollbackError?.code,
							message: rollbackError?.message
						})
						console.error('[Cattail World Editor] Selection deletion rollback failed.', rollbackError)
						return denied('ROLLBACK_FAILED', rollbackError?.message || 'The deletion rollback failed.')
					}
				}
			}

			const unregisterAdapter = transactions.registerAdapter(TRANSACTION_KIND, adapter)
			const stopRuntimeSubscription = runtime.subscribe(function (state) {
				if (!state?.active) {
					planningToken += 1
					if (planning) {
						planning = false
						phase = 'idle'
						notify('selection-delete-planning-cancelled')
					}
				}
			})
			traceProbe('service.ready', {
				adapterVersion: ADAPTER_VERSION,
				serviceVersion: SERVICE_VERSION
			})

			function snapshot() {
				const transactionSnapshot = transactions.snapshot?.() || null
				return deepFreeze({
					version: SERVICE_VERSION,
					ready: !disposed && !!transactionSnapshot?.ready,
					planning: !disposed && planning,
					busy: !disposed && busy,
					phase: disposed ? 'idle' : phase,
					revision,
					lastReason,
					lastPlan: lastPlan ? publicPlanSummary(lastPlan) : null,
					lastResult,
					error: publicError(error),
					refreshWarning: publicError(refreshWarning),
					terminalBlockedReason: transactionSnapshot?.terminalBlockedReason || null,
					disposed
				})
			}

			function notify(reason) {
				if (disposed) return
				if (reason) lastReason = String(reason)
				revision += 1
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (listenerError) {
						console.warn('[Cattail World Editor] Selection deletion listener failed.', listenerError)
					}
				}
			}

			function traceProbe(event, details) {
				const entry = deepFreeze({
					sequence: ++probeSequence,
					timestamp: Date.now(),
					event: String(event || 'unknown'),
					details: probeDetails(details)
				})
				probeEvents.push(entry)
				if (probeEvents.length > PROBE_EVENT_LIMIT) {
					probeEvents.splice(0, probeEvents.length - PROBE_EVENT_LIMIT)
				}
				return entry
			}

			function probeSnapshot() {
				const selectionState = selection.snapshot?.() || null
				const transactionState = transactions.snapshot?.() || null
				return deepFreeze({
					version: 1,
					generatedAt: Date.now(),
					service: {
						ready: !disposed,
						planning,
						busy,
						phase,
						lastReason,
						error: publicError(error),
						refreshWarning: publicError(refreshWarning)
					},
					selection: {
						revision: finiteInteger(selectionState?.revision, -1),
						selectionCount: nonNegativeInteger(selectionState?.selectionCount, 0),
						previewActive: !!selectionState?.previewRange,
						moving: !!selection.isMoving?.(),
						resizing: !!selection.isResizing?.()
					},
					transaction: {
						ready: !!transactionState?.ready,
						busy: !!transactionState?.busy,
						phase: String(transactionState?.phase || ''),
						undoCount: nonNegativeInteger(transactionState?.undoCount, 0),
						redoCount: nonNegativeInteger(transactionState?.redoCount, 0),
						terminalBlockedReason: transactionState?.terminalBlockedReason || null,
						error: publicError(transactionState?.error)
					},
					events: probeEvents.map(function (entry) {
						return {
							sequence: entry.sequence,
							timestamp: entry.timestamp,
							event: entry.event,
							details: probeDetails(entry.details)
						}
					})
				})
			}

			async function plan(sourceFactory, options) {
				if (disposed) throw deletionError('NOT_READY', 'Selection deletion is unavailable.')
				if (planning || busy || transactions.isBusy?.()) {
					throw deletionError('BUSY', 'Another World Editor transaction is running.')
				}
				const token = ++planningToken
				const settings = options || {}
				planning = true
				phase = 'planning'
				error = null
				refreshWarning = null
				traceProbe('plan.start', {
					token,
					requestedKind: String(options?.sourceKind || 'selection')
				})
				notify('selection-delete-planning-started')
				try {
					const source = sourceFactory()
					const result = await buildPlan(source, function () {
						return (
							disposed ||
							token !== planningToken ||
							settings.isCancelled?.() === true
						)
					})
					if (disposed || token !== planningToken) {
						throw deletionError('INVALIDATED', 'Deletion planning was cancelled.')
					}
					lastPlan = result
					phase = result.removals.length ? 'planned' : 'nothing'
					traceProbe('plan.complete', {
						token,
						sourceKind: result.source.kind,
						sourceCellCount: result.summary.sourceCellCount,
						safeCount: result.summary.safeCount,
						protectedCount: result.summary.protectedCount,
						crossBoundaryCount: result.summary.crossBoundaryCount,
						creative: result.summary.creative
					})
					return result
				} catch (planError) {
					error = publicError(planError)
					phase = planError?.code === 'INVALIDATED' ? 'cancelled' : 'failed'
					traceProbe('plan.failed', {
						token,
						code: planError?.code,
						message: planError?.message
					})
					throw planError
				} finally {
					if (token === planningToken) {
						planning = false
						notify('selection-delete-planning-' + phase)
					}
				}
			}

			async function executePlan(planValue, input) {
				traceProbe('execute.requested', {
					input: normalizeInput(input),
					safeCount: nonNegativeInteger(planValue?.summary?.safeCount, 0),
					protectedCount: nonNegativeInteger(planValue?.summary?.protectedCount, 0)
				})
				if (disposed) return rejectedResult('NOT_READY', 'Selection deletion is unavailable.')
				if (planning || busy || transactions.isBusy?.()) {
					return rejectedResult('BUSY', 'Another World Editor transaction is running.')
				}
				let request
				try {
					request = normalizePlanRequest(planValue)
				} catch (requestError) {
					return rejectedResult(requestError?.code || 'INVALID_PLAN', requestError?.message)
				}
				if (!Number(planValue?.summary?.safeCount)) {
					return rejectedResult('NOTHING_SAFE', 'The selection contains no safely deletable buildings.')
				}
				busy = true
				phase = 'deleting'
				error = null
				refreshWarning = null
				notify('selection-delete-execution-started')
				try {
					const result = await transactions.execute({
						kind: TRANSACTION_KIND,
						input: normalizeInput(input),
						payload: {
							plan: request
						}
					})
					lastResult = result || null
					error = result?.error || null
					traceProbe('execute.result', {
						accepted: result?.accepted === true,
						executed: result?.executed === true,
						reason: result?.reason,
						errorCode: result?.error?.code,
						errorMessage: result?.error?.message,
						snapshotCreated: !!result?.snapshotId
					})
					if (result?.executed === true) {
						phase = 'success'
						await refreshBlueprintPreview('selection-delete-forward-complete')
					} else {
						phase = transactions.snapshot?.().terminalBlockedReason
							? 'blocked'
							: result?.reason === 'rolled-back'
								? 'rolled-back'
								: 'failed'
					}
					return result
				} catch (executionError) {
					error = publicError(executionError)
					phase = transactions.snapshot?.().terminalBlockedReason ? 'blocked' : 'failed'
					lastResult = rejectedResult(error.code, error.message)
					traceProbe('execute.threw', {
						code: executionError?.code,
						message: executionError?.message
					})
					return lastResult
				} finally {
					busy = false
					notify('selection-delete-execution-' + phase)
				}
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
				planSchema: PLAN_SCHEMA,
				game,
				snapshot,
				diagnostics() {
					return probeSnapshot()
				},
				clearDiagnostics() {
					probeEvents.length = 0
					traceProbe('diagnostics.cleared')
					return true
				},
				markProbe(event, details) {
					if (disposed) return false
					traceProbe('ui.' + String(event || 'unknown'), details)
					return true
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Selection deletion listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				planSelections(options) {
					return plan(createSelectionSource, options)
				},
				planRanges(ranges, options) {
					return plan(function () {
						return createRangesSource(ranges, options)
					}, options)
				},
				planCells(cells, options) {
					return plan(function () {
						return createCellsSource(cells, options)
					}, options)
				},
				execute(planValue, input) {
					return executePlan(planValue, input)
				},
				isInputBlocked() {
					return !disposed && (planning || busy || !!transactions.isBusy?.())
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					planningToken += 1
					try {
						unregisterAdapter?.()
					} catch (unregisterError) {}
					try {
						stopRuntimeSubscription?.()
					} catch (subscriptionError) {}
					listeners.clear()
					operations.clear()
					transactionData.clear()
					lastReason = String(reason || 'disposed')
					if (globalThis[DELETE_KEY] === service) delete globalThis[DELETE_KEY]
					return true
				}
			})
			return service

			function createSelectionSource() {
				const state = selection.snapshot()
				if (
					state?.previewRange ||
					selection.hasPreview?.() ||
					selection.isMoving?.() ||
					selection.isResizing?.()
				) {
					throw deletionError('SELECTION_BUSY', 'Finish or cancel the selection preview before deleting.')
				}
				const plane = normalizePlane(game.plane)
				const selections = Array.isArray(state?.selections) ? state.selections : []
				if (!selections.length) throw deletionError('NO_SELECTION', 'There is no committed selection.')
				const ranges = selections.map(function (entry) {
					if (normalizePlane(entry?.plane) !== plane) {
						throw deletionError('PLANE_CHANGED', 'Every deletion selection must be on the active plane.')
					}
					return {
						id: finiteInteger(entry?.id, 0),
						range: normalizeRange(entry?.range)
					}
				})
				return {
					kind: 'selection',
					plane,
					revision: finiteInteger(state?.revision, 0),
					ranges
				}
			}

			function createRangesSource(ranges, options) {
				if (!Array.isArray(ranges) || !ranges.length) {
					throw deletionError('INVALID_PLAN', 'At least one deletion range is required.')
				}
				return {
					kind: 'ranges',
					plane: normalizeRequestedPlane(options?.plane, game.plane),
					ranges: ranges.map(function (range, index) {
						return {
							id: index + 1,
							range: normalizeRange(range)
						}
					})
				}
			}

			function createCellsSource(cells, options) {
				if (!Array.isArray(cells) || !cells.length) {
					throw deletionError('INVALID_PLAN', 'At least one deletion cell is required.')
				}
				const normalized = new Map()
				for (const value of cells) {
					const cell = normalizePosition(value)
					if (!cell) throw deletionError('INVALID_PLAN', 'A deletion mask cell is invalid.')
					normalized.set(cellKey(cell[0], cell[1]), cell)
				}
				return {
					kind: 'cells',
					plane: normalizeRequestedPlane(options?.plane, game.plane),
					cells: Array.from(normalized.values()).sort(comparePositions)
				}
			}

			async function rebuildPlan(sourceValue, isCancelled) {
				const source = normalizeSource(sourceValue)
				if (source.kind === 'selection') {
					const current = createSelectionSource()
					if (!samePlain(current, source)) {
						throw deletionError('TARGET_CHANGED', 'The committed selections changed after confirmation.')
					}
				}
				return buildPlan(source, isCancelled)
			}

			async function buildPlan(sourceValue, isCancelled) {
				const source = normalizeSource(sourceValue)
				if (source.plane !== normalizePlane(game.plane)) {
					throw deletionError('PLANE_CHANGED', 'Switch back to the deletion plane before continuing.')
				}
				requireGameMethods(game)
				const cells = await collectSourceCells(source, isCancelled)
				const cellKeys = new Set(cells.map(function (position) {
					return cellKey(position[0], position[1])
				}))
				const entities = new Set()
				for (let index = 0; index < cells.length; index += 1) {
					cancelIfNeeded(isCancelled)
					const entity = entityAt(game, cells[index])
					if (entity) entities.add(entity)
					if ((index + 1) % SCAN_CHUNK_SIZE === 0) await yieldTurn(isCancelled)
				}

				const safe = []
				const protectedTargets = []
				for (const entity of entities) {
					cancelIfNeeded(isCancelled)
					const assessment = placement.assessEntity(entity)
					const position = normalizePosition(entity?.position)
					const footprint = position ? entityFootprint(entity, position) : null
					const crossBoundary = !!footprint && footprintCrossesMask(footprint, cellKeys)
					if (assessment?.safe) {
						try {
							safe.push(captureRestorableEntity(entity, crossBoundary))
						} catch (captureError) {
							protectedTargets.push(captureProtectedEntity(entity, 'save-unavailable', crossBoundary))
						}
					} else {
						protectedTargets.push(captureProtectedEntity(
							entity,
							protectedReason(entity, assessment?.reason),
							crossBoundary
						))
					}
				}
				safe.sort(compareDescriptors)
				protectedTargets.sort(compareDescriptors)
				enforceExtractorInvariant(safe, protectedTargets)
				safe.sort(compareDescriptors)
				protectedTargets.sort(compareDescriptors)

				const onlyOneKeys = collectOnlyOneKeys(game, safe)
				const onlyonesBefore = captureOnlyones(game, onlyOneKeys)
				const onlyonesAfter = simulateOnlyones(game, onlyonesBefore, onlyOneKeys, safe)
				const economy = simulateEconomy(game, safe, creativeActive(creative, game))
				const scopeCells = collectScopeCells(safe)
				const crossBoundaryCount = safe.concat(protectedTargets).filter(function (entry) {
					return entry.crossBoundary
				}).length
				const summary = {
					sourceCellCount: cells.length,
					safeCount: safe.length,
					protectedCount: protectedTargets.length,
					crossBoundaryCount,
					resourceDelta: economy.delta.slice(),
					creative: economy.creative
				}
				const signatureValue = {
					source,
					removals: safe.map(signatureDescriptor),
					protectedTargets: protectedTargets.map(signatureDescriptor),
					onlyOneKeys,
					onlyonesBefore,
					onlyonesAfter,
					economy
				}
				const signature = planSignature(signatureValue)
				const fingerprints = createPlanFingerprints(signatureValue)
				return deepFreeze({
					schema: PLAN_SCHEMA,
					source,
					summary,
					removals: safe,
					protectedTargets,
					scopeCells,
					onlyOneKeys,
					onlyonesBefore,
					onlyonesAfter,
					economy,
					signature,
					fingerprints
				})
			}

			async function collectSourceCells(source, isCancelled) {
				if (source.kind === 'cells') return source.cells.map(clonePosition)
				const result = new Map()
				let processed = 0
				for (const entry of source.ranges) {
					const range = entry.range
					for (let v = range.minV; v <= range.maxV; v += 1) {
						for (let u = range.minU; u <= range.maxU; u += 1) {
							cancelIfNeeded(isCancelled)
							result.set(cellKey(u, v), [u, v])
							processed += 1
							if (processed % SCAN_CHUNK_SIZE === 0) await yieldTurn(isCancelled)
						}
					}
				}
				return Array.from(result.values()).sort(comparePositions)
			}

			function captureRestorableEntity(entity, crossBoundary) {
				const save = captureEntitySave(game, entity)
				const position = normalizePosition(entity?.position)
				if (!position || !save) {
					throw deletionError('SAVE_UNAVAILABLE', 'A deletion target could not be captured safely.')
				}
				return {
					identity: ensureIdentity(entity),
					name: safeName(entity.name),
					position,
					footprint: entityFootprint(entity, position),
					save,
					crossBoundary: crossBoundary === true
				}
			}

			function captureProtectedEntity(entity, reason, crossBoundary) {
				const position = normalizePosition(entity?.position) || [0, 0]
				let save = null
				try {
					save = captureEntitySave(game, entity)
				} catch (saveError) {}
				return {
					identity: ensureIdentity(entity),
					name: safeName(entity?.name),
					position,
					footprint: entityFootprint(entity, position),
					save,
					reason: String(reason || 'protected'),
					crossBoundary: crossBoundary === true
				}
			}

			function enforceExtractorInvariant(safe, protectedTargets) {
				const candidates = safe.filter(function (entry) {
					return EXTRACTOR_NAMES.has(entry.name)
				})
				const allowed = Math.max(0, pumpFamilyCount(game) - 1)
				if (candidates.length <= allowed) return
				const protectedIdentities = new Set(candidates.slice(allowed).map(function (entry) {
					return entry.identity
				}))
				for (let index = safe.length - 1; index >= 0; index -= 1) {
					const descriptor = safe[index]
					if (!protectedIdentities.has(descriptor.identity)) continue
					safe.splice(index, 1)
					protectedTargets.push(Object.assign({}, descriptor, {
						reason: 'last-extractor'
					}))
				}
			}

			function inspectRecordedTargets(payload, direction) {
				if (direction === 'undo') {
					for (const descriptor of payload.removals) {
						for (const position of footprintCells(descriptor.footprint)) {
							if (entityAt(game, position)) {
								return denied('EXTERNAL_CHANGE', 'A deleted building footprint changed outside World Editor.')
							}
						}
					}
					return approved()
				}

				for (const descriptor of payload.removals) {
					const entity = entityAt(game, descriptor.position)
					if (
						!entity ||
						ensureIdentity(entity) !== descriptor.identity ||
						safeName(entity.name) !== descriptor.name
					) {
						return denied('EXTERNAL_CHANGE', 'A deletion target changed outside World Editor.')
					}
					const assessment = placement.assessEntity(entity)
					if (!assessment?.safe && assessment?.reason !== 'last-extractor') {
						return denied('UNSAFE_DELETION', 'A deletion target is no longer safe to restore.')
					}
					try {
						if (!sameDeletionSave(captureEntitySave(game, entity), descriptor.save)) {
							return denied('EXTERNAL_CHANGE', 'A deletion target state changed outside World Editor.')
						}
					} catch (saveError) {
						return denied('UNSAFE_DELETION', 'A deletion target can no longer be serialized safely.')
					}
				}
				const extractorDeletes = payload.removals.filter(function (entry) {
					return EXTRACTOR_NAMES.has(entry.name)
				}).length
				if (extractorDeletes > 0 && pumpFamilyCount(game) - extractorDeletes < 1) {
					return denied('LAST_EXTRACTOR', 'At least one Pump or Gradient must remain.')
				}
				return approved()
			}

			function captureScope(payload) {
				const entities = new Map()
				const cells = []
				for (const position of payload.scopeCells) {
					const entity = entityAt(game, position)
					const identity = entity ? ensureIdentity(entity) : null
					cells.push({
						u: position[0],
						v: position[1],
						identity
					})
					if (entity && !entities.has(identity)) {
						entities.set(identity, {
							identity,
							name: safeName(entity.name),
							position: normalizePosition(entity.position),
							span: nonNegativeInteger(entity.entitySpan, 0)
						})
					}
				}
				return {
					cells,
					entities: Array.from(entities.values()).sort(function (left, right) {
						return left.identity.localeCompare(right.identity)
					}),
					onlyones: captureOnlyones(game, payload.onlyOneKeys)
				}
			}

			async function applyForward(context, record, state) {
				const payload = record.payload
				const resourceDelta = payload.economy.creative ? [] : payload.economy.delta
				applyResourceMutation(state, resourceDelta)
				for (let index = 0; index < payload.removals.length; index += 1) {
					requireCurrent(context)
					const removal = payload.removals[index]
					const removed = removeExpectedEntity(removal)
					state.removedSaves.set(removal.identity, removed.save)
					state.mutations.push({ kind: 'removed', descriptor: removed })
					if ((index + 1) % APPLY_CHUNK_SIZE === 0) await yieldOperation(context)
				}
				applyStatsMutation(state, {
					machinesSold: state.statsBefore.machinesSold + payload.statsDelta.machinesSold,
					timeSinceLastDelete: 0
				})
				applyOnlyoneMutation(state, payload.onlyOneKeys, payload.onlyonesAfter)
			}

			async function applyUndo(context, record, state) {
				const payload = record.payload
				const resourceDelta = payload.economy.creative ? [] : negateArray(payload.economy.delta)
				applyResourceMutation(state, resourceDelta)
				const saved = transactionData.get(record.id)
				for (let index = 0; index < payload.removals.length; index += 1) {
					requireCurrent(context)
					const removal = payload.removals[index]
					const descriptor = Object.assign({}, removal, {
						save: jsonClone(saved?.removalSaves?.get(removal.identity) || removal.save)
					})
					addExpectedEntity(descriptor)
					state.mutations.push({ kind: 'created', descriptor })
					if ((index + 1) % APPLY_CHUNK_SIZE === 0) await yieldOperation(context)
				}
				applyStatsMutation(state, {
					machinesSold: state.statsBefore.machinesSold - payload.statsDelta.machinesSold,
					timeSinceLastDelete: saved?.timeSinceLastDelete ?? state.statsBefore.timeSinceLastDelete
				})
				applyOnlyoneMutation(state, payload.onlyOneKeys, payload.onlyonesBefore)
			}

			function applyResourceMutation(state, delta) {
				const normalized = numericArray(delta)
				if (!normalized.some(function (value) { return Math.abs(value) > EPSILON })) return
				applyResourceDelta(game, normalized, false)
				state.resourceDelta = normalized
				state.mutations.push({ kind: 'resources', delta: normalized })
			}

			function applyStatsMutation(state, desired) {
				game.stats = game.stats || {}
				const previous = captureStats(game)
				game.stats.machinesSold = finiteOr(desired?.machinesSold, previous.machinesSold)
				game.stats.timeSinceLastDelete = desired?.timeSinceLastDelete
				state.statsAfter = captureStats(game)
				state.mutations.push({ kind: 'stats', values: previous })
			}

			function applyOnlyoneMutation(state, keys, desired) {
				const previous = captureOnlyones(game, keys)
				writeOnlyones(game, keys, desired)
				state.mutations.push({ kind: 'onlyones', keys: keys.slice(), values: previous })
			}

			function removeExpectedEntity(descriptor) {
				const entity = entityAt(game, descriptor.position)
				traceProbe('apply.clear.before', {
					name: descriptor.name,
					position: descriptor.position,
					identityMatch: !!entity && ensureIdentity(entity) === descriptor.identity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				if (!entity || ensureIdentity(entity) !== descriptor.identity) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion target entity changed.')
				}
				const save = captureEntitySave(game, entity)
				if (!sameDeletionSave(save, descriptor.save)) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion target state changed.')
				}
				const removed = Object.assign({}, descriptor, {
					name: safeName(entity.name),
					position: clonePosition(entity.position),
					footprint: entityFootprint(entity, entity.position),
					save
				})
				try {
					game.clearCell(entity.position)
				} catch (clearError) {
					traceProbe('apply.clear.threw', {
						name: descriptor.name,
						position: descriptor.position,
						code: clearError?.code,
						message: clearError?.message
					})
					throw clearError
				}
				const remaining = entityAt(game, descriptor.position)
				traceProbe('apply.clear.after', {
					name: descriptor.name,
					position: descriptor.position,
					remaining: !!remaining,
					remainingName: safeName(remaining?.name),
					sameEntityRemaining: remaining === entity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				return removed
			}

			function addExpectedEntity(descriptor) {
				assertFootprintEmpty(game, descriptor.footprint)
				const entity = restoreEntitySave(game, descriptor.save)
				if (!entity) throw deletionError('APPLY_FAILED', 'A deleted building could not be restored.')
				assignIdentity(entity, descriptor.identity)
				return entity
			}

			function rollbackMutations(state) {
				for (let index = state.mutations.length - 1; index >= 0; index -= 1) {
					const mutation = state.mutations[index]
					if (mutation.kind === 'created') {
						const entity = entityAt(game, mutation.descriptor.position)
						if (!entity || ensureIdentity(entity) !== mutation.descriptor.identity) {
							throw deletionError('ROLLBACK_FAILED', 'A restored entity could not be removed during rollback.')
						}
						game.clearCell(entity.position)
					} else if (mutation.kind === 'removed') {
						addExpectedEntity(mutation.descriptor)
					} else if (mutation.kind === 'resources') {
						applyResourceDelta(game, negateArray(mutation.delta), true)
					} else if (mutation.kind === 'stats') {
						game.stats = game.stats || {}
						game.stats.machinesSold = mutation.values.machinesSold
						game.stats.timeSinceLastDelete = mutation.values.timeSinceLastDelete
					} else if (mutation.kind === 'onlyones') {
						writeOnlyones(game, mutation.keys, mutation.values)
					}
				}
			}

			function verifyAppliedState(payload, state, expectedAfter) {
				for (const descriptor of payload.removals) {
					const entity = entityAt(game, descriptor.position)
					if (expectedAfter) {
						for (const position of footprintCells(descriptor.footprint)) {
							if (entityAt(game, position)) {
								return denied('VERIFY_FAILED', 'A deleted building is still present.')
							}
						}
					} else if (
						!entity ||
						ensureIdentity(entity) !== descriptor.identity ||
						safeName(entity.name) !== descriptor.name
					) {
						return denied('VERIFY_FAILED', 'A deleted building was not restored exactly.')
					}
				}
				const expectedResources = addArrays(state.resourcesBefore, state.resourceDelta)
				if (!sameNumericArray(game.resources, expectedResources)) {
					return denied('VERIFY_FAILED', 'Resource totals did not match the deletion transaction.')
				}
				const observedStats = captureStats(game)
				if (
					observedStats.machinesSold !== state.statsAfter?.machinesSold ||
					!sameTimer(observedStats.timeSinceLastDelete, state.statsAfter?.timeSinceLastDelete)
				) {
					return denied('VERIFY_FAILED', 'World statistics did not match the deletion transaction.')
				}
				const desiredOnlyones = expectedAfter ? payload.onlyonesAfter : payload.onlyonesBefore
				if (!samePlain(captureOnlyones(game, payload.onlyOneKeys), desiredOnlyones)) {
					return denied('VERIFY_FAILED', 'Only-one state did not match the deletion transaction.')
				}
				return approved()
			}

			function ensureIdentity(entity) {
				if (!entity || typeof entity !== 'object') return ''
				let identity = identityByEntity.get(entity)
				if (!identity) {
					identity = createIdentity('entity')
					identityByEntity.set(entity, identity)
				}
				return identity
			}

			function assignIdentity(entity, identity) {
				if (!entity || !identity) throw deletionError('APPLY_FAILED', 'An entity identity could not be assigned.')
				identityByEntity.set(entity, identity)
			}

			function createIdentity(kind) {
				identitySequence += 1
				return [
					'world-editor-delete',
					kind,
					Date.now().toString(36),
					identitySequence.toString(36)
				].join('-')
			}

			function refreshSelectionAnalysis(reason) {
				try {
					const analysis = globalThis[ANALYSIS_KEY]
					if (!analysis || analysis.game !== game || typeof analysis.refresh !== 'function') {
						throw deletionError('VIEW_REFRESH_FAILED', 'Selection statistics refresh is unavailable.')
					}
					const refreshed = analysis.refresh(reason)
					if (refreshed === false && selection.snapshot()?.selectionCount > 0) {
						throw deletionError('VIEW_REFRESH_FAILED', 'Selection statistics did not refresh.')
					}
				} catch (refreshError) {
					refreshWarning = publicError(refreshError)
					console.warn('[Cattail World Editor] Selection deletion statistics refresh failed.', refreshError)
					scheduleNotify('selection-delete-refresh-warning')
				}
			}

			async function refreshBlueprintPreview(reason) {
				try {
					const preview = globalThis[PREVIEW_KEY]
					const previewState = typeof preview?.snapshot === 'function' ? preview.snapshot() : null
					if (!previewState?.active) return true
					if (typeof preview?.refreshNow !== 'function') {
						throw deletionError('VIEW_REFRESH_FAILED', 'Blueprint preview refresh is unavailable.')
					}
					const result = await preview.refreshNow(reason)
					if (!result || result?.ok === false || result?.success === false || result?.error) {
						throw deletionError('VIEW_REFRESH_FAILED', 'Blueprint preview did not refresh.')
					}
					return true
				} catch (previewError) {
					refreshWarning = publicError(previewError)
					console.warn('[Cattail World Editor] Selection deletion preview refresh failed.', previewError)
					return false
				}
			}

			function scheduleNotify(reason) {
				if (disposed) return
				Promise.resolve().then(function () {
					if (!disposed) notify(reason)
				})
			}

			function playRecycleSound(removals) {
				if (!removals.length || typeof game.playSound !== 'function') return
				let pan = 0
				try {
					const position = removals[0].position
					const xy = game.uvToXYUntranslated?.(position)
					if (Array.isArray(xy) && typeof game.getPanValueFromX === 'function') {
						pan = game.getPanValueFromX(xy[0])
					}
				} catch (soundError) {}
				try {
					game.playSound('recycle', pan)
				} catch (soundError) {}
			}
		}

		function normalizePlanRequest(value) {
			if (
				!value ||
				Number(value.schema) !== PLAN_SCHEMA ||
				typeof value.signature !== 'string' ||
				!value.signature
			) {
				throw deletionError('INVALID_PLAN', 'A valid deletion plan is required.')
			}
			return {
				schema: PLAN_SCHEMA,
				source: normalizeSource(value.source),
				signature: String(value.signature),
				fingerprints: normalizePlanFingerprints(value.fingerprints)
			}
		}

		function normalizeSource(value) {
			const kind = String(value?.kind || '')
			const plane = normalizePlane(value?.plane)
			if (kind === 'cells') {
				if (!Array.isArray(value?.cells) || !value.cells.length) {
					throw deletionError('INVALID_PLAN', 'A deletion cell mask is required.')
				}
				const cells = new Map()
				for (const entry of value.cells) {
					const position = normalizePosition(entry)
					if (!position) throw deletionError('INVALID_PLAN', 'A deletion mask cell is invalid.')
					cells.set(cellKey(position[0], position[1]), position)
				}
				return {
					kind,
					plane,
					cells: Array.from(cells.values()).sort(comparePositions)
				}
			}
			if (kind !== 'selection' && kind !== 'ranges') {
				throw deletionError('INVALID_PLAN', 'The deletion plan source is invalid.')
			}
			if (!Array.isArray(value?.ranges) || !value.ranges.length) {
				throw deletionError('INVALID_PLAN', 'At least one deletion range is required.')
			}
			const source = {
				kind,
				plane,
				ranges: value.ranges.map(function (entry, index) {
					return {
						id: finiteInteger(entry?.id, index + 1),
						range: normalizeRange(entry?.range)
					}
				})
			}
			if (kind === 'selection') source.revision = finiteInteger(value?.revision, -1)
			return source
		}

		function normalizeRange(value) {
			const minU = finiteInteger(value?.minU, NaN)
			const maxU = finiteInteger(value?.maxU, NaN)
			const minV = finiteInteger(value?.minV, NaN)
			const maxV = finiteInteger(value?.maxV, NaN)
			if (
				![minU, maxU, minV, maxV].every(Number.isFinite) ||
				minU > maxU ||
				minV > maxV
			) {
				throw deletionError('INVALID_PLAN', 'A deletion range is invalid.')
			}
			const start = normalizePosition(value?.start) || [minU, minV]
			const end = normalizePosition(value?.end) || [maxU, maxV]
			return {
				start,
				end,
				minU,
				maxU,
				minV,
				maxV,
				width: maxU - minU + 1,
				height: maxV - minV + 1
			}
		}

		function protectedReason(entity, reason) {
			if (safeName(entity?.name) === 'cube') return 'cube'
			return String(reason || 'protected')
		}

		function footprintCrossesMask(footprint, mask) {
			for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
				for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
					if (!mask.has(cellKey(u, v))) return true
				}
			}
			return false
		}

		function collectScopeCells(removals) {
			const cells = new Map()
			for (const descriptor of removals) {
				for (const position of footprintCells(descriptor.footprint)) {
					cells.set(cellKey(position[0], position[1]), position)
				}
			}
			return Array.from(cells.values()).sort(comparePositions)
		}

		function footprintCells(footprint) {
			const cells = []
			for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
				for (let u = footprint.minU; u <= footprint.maxU; u += 1) cells.push([u, v])
			}
			return cells
		}

		function collectOnlyOneKeys(game, removals) {
			const keys = new Set()
			for (const descriptor of removals) {
				const name = descriptor.name
				let current = name
				const visited = new Set()
				while (current && !visited.has(current)) {
					visited.add(current)
					keys.add(current)
					current = safeName(game.codex?.entities?.[current]?.isUpgradeTo)
				}
				for (const candidate of Object.keys(game.codex?.entities || {})) {
					if (upgradeChainContains(game, candidate, name)) keys.add(candidate)
				}
			}
			return Array.from(keys).sort()
		}

		function upgradeChainContains(game, start, target) {
			let current = safeName(start)
			const visited = new Set()
			while (current && !visited.has(current)) {
				if (current === target) return true
				visited.add(current)
				current = safeName(game.codex?.entities?.[current]?.isUpgradeTo)
			}
			return false
		}

		function simulateOnlyones(game, before, keys, removals) {
			const result = Object.assign({}, before)
			for (const removal of removals) clearOnlyoneChainInMap(game, result, removal.name)
			for (const key of keys) result[key] = !!result[key]
			return result
		}

		function clearOnlyoneChainInMap(game, values, name) {
			for (const key of Object.keys(values)) {
				if (upgradeChainContains(game, key, name) || upgradeChainContains(game, name, key)) values[key] = false
			}
		}

		function clearOnlyoneChain(game, name) {
			const keys = Object.keys(game.onlyones || {})
			for (const key of keys) {
				if (upgradeChainContains(game, key, name) || upgradeChainContains(game, name, key)) {
					delete game.onlyones[key]
				}
			}
		}

		function captureOnlyones(game, keys) {
			const result = {}
			for (const key of keys || []) result[key] = !!game.onlyones?.[key]
			return result
		}

		function writeOnlyones(game, keys, values) {
			game.onlyones = game.onlyones || {}
			for (const key of keys || []) {
				if (values?.[key]) game.onlyones[key] = true
				else delete game.onlyones[key]
			}
		}

		function simulateEconomy(game, removals, creative) {
			if (creative) {
				return {
					creative: true,
					eraserName: null,
					steps: [],
					delta: []
				}
			}
			const counts = Object.assign({}, game.entitiesInGame || {})
			const resources = numericArray(game.resources)
			const steps = []
			const eraserName = Number(game.eraserType) === 2
				? 'eraser3'
				: Number(game.eraserType) === 1
					? 'eraser2'
					: 'eraser'
			for (const removal of removals) {
				const eraserCost = priceFor(game, counts, eraserName, false)
				pushEconomyStep(resources, steps, 'eraser-cost', eraserName, negateArray(eraserCost))
				const refund = priceFor(game, counts, removal.name, true)
				pushEconomyStep(resources, steps, 'refund', removal.name, refund)
				counts[removal.name] = Math.max(0, finiteOr(counts[removal.name], 0) - 1)
			}
			return {
				creative: false,
				eraserName,
				steps,
				delta: steps.reduce(function (total, step) {
					return addArrays(total, step.delta)
				}, [])
			}
		}

		function pushEconomyStep(resources, steps, kind, name, delta) {
			const normalized = numericArray(delta)
			applyShadowDelta(resources, normalized)
			steps.push({ kind, name, delta: normalized })
		}

		function priceFor(game, counts, name, sale) {
			const definition = game.codex?.entities?.[name]
			if (!definition || !Array.isArray(definition.price)) {
				throw deletionError('PRICE_UNAVAILABLE', 'A required building price is unavailable.')
			}
			const count = Math.max(0, finiteOr(counts[name], 0) - (sale ? 1 : 0))
			const exponent = finiteOr(definition.priceExponent, 0)
			const multiplier = exponent ? exponent ** count : 1
			const saleMultiplier = sale
				? Number(game.eraserType) === 2
					? 1
					: Number(game.eraserType) === 1
						? .9
						: .5
				: 1
			return definition.price.map(function (value) {
				return finiteOr(value, 0) * multiplier * saleMultiplier
			})
		}

		function inspectAffordability(currentResources, economy, direction) {
			if (economy.creative) return approved()
			const shadow = numericArray(currentResources)
			try {
				if (direction === 'undo') {
					applyShadowDelta(shadow, negateArray(economy.delta))
				} else {
					for (const step of economy.steps || []) applyShadowDelta(shadow, step.delta)
				}
				return approved()
			} catch (affordabilityError) {
				return denied('INSUFFICIENT_RESOURCES', 'Current resources cannot safely complete this transaction.')
			}
		}

		function sameEconomy(left, right) {
			if (
				!!left?.creative !== !!right?.creative ||
				String(left?.eraserName || '') !== String(right?.eraserName || '') ||
				!sameNumericArray(left?.delta, right?.delta)
			) {
				return false
			}
			const leftSteps = Array.isArray(left?.steps) ? left.steps : []
			const rightSteps = Array.isArray(right?.steps) ? right.steps : []
			if (leftSteps.length !== rightSteps.length) return false
			for (let index = 0; index < leftSteps.length; index += 1) {
				if (
					String(leftSteps[index]?.kind || '') !== String(rightSteps[index]?.kind || '') ||
					String(leftSteps[index]?.name || '') !== String(rightSteps[index]?.name || '') ||
					!sameNumericArray(leftSteps[index]?.delta, rightSteps[index]?.delta)
				) {
					return false
				}
			}
			return true
		}

		function applyShadowDelta(resources, delta) {
			const length = Math.max(resources.length, delta.length)
			for (let index = 0; index < length; index += 1) {
				const next = finiteOr(resources[index], 0) + finiteOr(delta[index], 0)
				if (next < -EPSILON) throw deletionError('INSUFFICIENT_RESOURCES', 'Insufficient resources.')
				resources[index] = Math.abs(next) <= EPSILON ? 0 : next
			}
		}

		function applyResourceDelta(game, delta, rollback) {
			const resources = numericArray(game.resources)
			const length = Math.max(resources.length, delta.length)
			for (let index = 0; index < length; index += 1) {
				const next = finiteOr(resources[index], 0) + finiteOr(delta[index], 0)
				if (!rollback && next < -EPSILON) {
					throw deletionError('INSUFFICIENT_RESOURCES', 'Current resources cannot complete the deletion.')
				}
				resources[index] = Math.abs(next) <= EPSILON ? 0 : next
			}
			game.resources.length = resources.length
			for (let index = 0; index < resources.length; index += 1) game.resources[index] = resources[index]
		}

		function captureEntitySave(game, entity) {
			if (typeof game.getEntityString !== 'function') {
				throw deletionError('SAVE_UNAVAILABLE', 'Entity save capture is unavailable.')
			}
			const save = jsonClone(game.getEntityString(entity))
			if (
				!save ||
				safeName(save.name) !== safeName(entity?.name) ||
				!normalizePosition(save.position) ||
				!save.par ||
				typeof save.par !== 'object'
			) {
				throw deletionError('SAVE_UNAVAILABLE', 'Entity state could not be serialized.')
			}
			return save
		}

		function signatureDescriptor(entry) {
			return Object.assign({}, entry, {
				save: comparableDeletionSave(entry?.save)
			})
		}

		function comparableDeletionSave(value) {
			const save = jsonClone(value)
			if (save?.par && typeof save.par === 'object') delete save.par.soul
			return save
		}

		function sameDeletionSave(left, right) {
			return samePlain(
				comparableDeletionSave(left),
				comparableDeletionSave(right)
			)
		}

		function restoreEntitySave(game, saved) {
			const save = jsonClone(saved)
			const position = normalizePosition(save?.position)
			if (!position || !game.codex?.entities?.[save.name]) return null
			const misc = restoreMisc(save)
			const entity = game.addEntity(save.name, position, misc, { skipShopUpdate: true })
			if (!entity) return null
			for (const key of Object.keys(save.par || {})) entity[key] = jsonClone(save.par[key])
			entity.position = position
			entity.init?.()
			return entity
		}

		function restoreMisc(save) {
			const par = save.par || {}
			if (save.name === 'surge') {
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
			if (save.name === 'waypoint' || save.name === 'waypoint2') return { timestamp: par.timestamp }
			return undefined
		}

		function assertFootprintEmpty(game, footprint) {
			for (const position of footprintCells(footprint)) {
				if (entityAt(game, position)) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion footprint is no longer empty.')
				}
			}
		}

		function entityAt(game, position) {
			try {
				if (typeof game.entityAtCoordinates === 'function') return game.entityAtCoordinates(position) || null
				return game.stuffMap?.['u' + position[0] + 'v' + position[1]] || null
			} catch (error) {
				return null
			}
		}

		function entityFootprint(entity, position) {
			const center = normalizePosition(position)
			const span = nonNegativeInteger(entity?.entitySpan, 0)
			return {
				span,
				minU: center[0] - span,
				maxU: center[0] + span,
				minV: center[1] - span,
				maxV: center[1] + span
			}
		}

		function pumpFamilyCount(game) {
			return (
				finiteOr(game.entitiesInGame?.pump, 0) +
				finiteOr(game.entitiesInGame?.pump2, 0) +
				finiteOr(game.entitiesInGame?.gradient, 0)
			)
		}

		function creativeActive(creative, game) {
			return !!(
				creative &&
				creative.game === game &&
				creative.snapshot?.().ready &&
				creative.snapshot?.().creativeMode
			)
		}

		function requireGameMethods(game) {
			for (const method of ['addEntity', 'clearCell', 'entityAtCoordinates', 'getEntityString']) {
				if (typeof game?.[method] !== 'function') {
					throw deletionError('NOT_READY', 'The game is missing ' + method + '().')
				}
			}
			if (!Array.isArray(game.resources)) throw deletionError('NOT_READY', 'Game resources are unavailable.')
		}

		function validateRecord(record) {
			if (
				!record ||
				record.kind !== TRANSACTION_KIND ||
				record.payload?.schema !== TRANSACTION_SCHEMA ||
				!Array.isArray(record.payload.removals) ||
				!record.payload.removals.length ||
				!Array.isArray(record.payload.scopeCells) ||
				!Array.isArray(record.payload.onlyOneKeys) ||
				!record.payload.economy
			) {
				throw deletionError('INVALID_SPEC', 'The selection deletion transaction record is invalid.')
			}
		}

		function requireCurrent(context) {
			if (!context?.isCurrent?.()) throw deletionError('INVALIDATED', 'The deletion operation was invalidated.')
		}

		function refreshWorld(game) {
			try {
				game.stuff?.sort?.(function (left, right) {
					return finiteOr(left?.position?.[0], 0) +
						finiteOr(left?.position?.[1], 0) -
						finiteOr(right?.position?.[0], 0) -
						finiteOr(right?.position?.[1], 0)
				})
				game.shop?.updateElements?.()
				game.shop?.check?.()
				game.processMousemove2?.()
			} catch (refreshError) {
				console.warn('[Cattail World Editor] Selection deletion world refresh failed.', refreshError)
			}
		}

		function captureStats(game) {
			return {
				machinesSold: finiteOr(game.stats?.machinesSold, 0),
				timeSinceLastDelete: game.stats?.timeSinceLastDelete
			}
		}

		function planSignature(value) {
			return JSON.stringify(stableValue(value))
		}

		function createPlanFingerprints(value) {
			const removals = Array.isArray(value?.removals) ? value.removals : []
			const protectedTargets = Array.isArray(value?.protectedTargets) ? value.protectedTargets : []
			return {
				version: 1,
				components: {
					source: fingerprint(value?.source),
					removalTargets: fingerprint(removals.map(fingerprintTarget)),
					removalSaves: fingerprint(removals.map(function (entry) {
						return fingerprint(entry?.save)
					})),
					protectedTargets: fingerprint(protectedTargets.map(fingerprintTarget)),
					protectedSaves: fingerprint(protectedTargets.map(function (entry) {
						return fingerprint(entry?.save)
					})),
					onlyOneKeys: fingerprint(value?.onlyOneKeys),
					onlyonesBefore: fingerprint(value?.onlyonesBefore),
					onlyonesAfter: fingerprint(value?.onlyonesAfter),
					economy: fingerprint(value?.economy)
				},
				removalSaves: removals.map(function (entry) {
					return {
						name: safeName(entry?.name),
						position: normalizePosition(entry?.position) || [0, 0],
						fingerprint: fingerprint(entry?.save)
					}
				})
			}
		}

		function normalizePlanFingerprints(value) {
			if (Number(value?.version) !== 1 || !value?.components) return null
			const names = [
				'source',
				'removalTargets',
				'removalSaves',
				'protectedTargets',
				'protectedSaves',
				'onlyOneKeys',
				'onlyonesBefore',
				'onlyonesAfter',
				'economy'
			]
			const components = {}
			for (const name of names) components[name] = String(value.components[name] || '')
			const removalSaves = Array.isArray(value.removalSaves)
				? value.removalSaves.map(function (entry) {
					return {
						name: safeName(entry?.name),
						position: normalizePosition(entry?.position) || [0, 0],
						fingerprint: String(entry?.fingerprint || '')
					}
				})
				: []
			return {
				version: 1,
				components,
				removalSaves
			}
		}

		function comparePlanFingerprints(beforeValue, afterValue) {
			const before = normalizePlanFingerprints(beforeValue)
			const after = normalizePlanFingerprints(afterValue)
			if (!before || !after) {
				return {
					available: false,
					changedComponents: ['unknown'],
					changedRemovalSaves: []
				}
			}
			const changedComponents = []
			for (const name of Object.keys(after.components)) {
				if (before.components[name] !== after.components[name]) changedComponents.push(name)
			}
			const beforeSaves = new Map(before.removalSaves.map(function (entry) {
				return [probeTargetKey(entry), entry]
			}))
			const afterSaves = new Map(after.removalSaves.map(function (entry) {
				return [probeTargetKey(entry), entry]
			}))
			const changedRemovalSaves = []
			for (const key of Array.from(new Set(
				Array.from(beforeSaves.keys()).concat(Array.from(afterSaves.keys()))
			)).sort()) {
				const oldEntry = beforeSaves.get(key)
				const newEntry = afterSaves.get(key)
				if (oldEntry?.fingerprint === newEntry?.fingerprint) continue
				const entry = newEntry || oldEntry
				changedRemovalSaves.push({
					name: entry.name,
					position: entry.position,
					change: !oldEntry ? 'added' : !newEntry ? 'removed' : 'changed'
				})
			}
			return {
				available: true,
				changedComponents,
				changedRemovalSaves
			}
		}

		function fingerprintTarget(entry) {
			return {
				identity: String(entry?.identity || ''),
				name: safeName(entry?.name),
				position: normalizePosition(entry?.position) || [0, 0],
				footprint: entry?.footprint || null,
				reason: entry?.reason ? String(entry.reason) : '',
				crossBoundary: entry?.crossBoundary === true
			}
		}

		function probeTargetKey(entry) {
			const position = normalizePosition(entry?.position) || [0, 0]
			return safeName(entry?.name) + '@' + cellKey(position[0], position[1])
		}

		function fingerprint(value) {
			const encoded = JSON.stringify(stableValue(value))
			const text = encoded === undefined ? 'undefined' : encoded
			let hash = 2166136261
			for (let index = 0; index < text.length; index += 1) {
				hash ^= text.charCodeAt(index)
				hash = Math.imul(hash, 16777619)
			}
			return text.length + ':' + (hash >>> 0).toString(16).padStart(8, '0')
		}

		function publicPlanSummary(plan) {
			return {
				schema: plan.schema,
				sourceKind: plan.source.kind,
				summary: plan.summary,
				signature: plan.signature
			}
		}

		function approved() {
			return { ok: true }
		}

		function denied(code, message) {
			return {
				ok: false,
				code: String(code || 'PREFLIGHT_FAILED'),
				message: String(message || 'Selection deletion was rejected.')
			}
		}

		function rejectedResult(code, message) {
			return deepFreeze({
				accepted: false,
				executed: false,
				direction: 'forward',
				reason: String(code || 'DELETION_FAILED').toLowerCase().replace(/_/g, '-'),
				transaction: null,
				snapshotId: null,
				error: {
					code: String(code || 'DELETION_FAILED'),
					message: String(message || 'Selection deletion failed.')
				}
			})
		}

		function publicError(value) {
			if (!value) return null
			return {
				code: String(value.code || 'DELETION_FAILED'),
				message: String(value.message || 'Selection deletion failed.')
			}
		}

		function probeDetails(value) {
			try {
				const serialized = JSON.stringify(stableValue(value || {}))
				return serialized ? JSON.parse(serialized) : {}
			} catch (probeError) {
				return {
					unavailable: true,
					message: String(probeError?.message || 'Probe details could not be serialized.')
				}
			}
		}

		function deletionError(code, message) {
			const error = new Error(String(message || code || 'Selection deletion failed.'))
			error.code = String(code || 'DELETION_FAILED')
			return error
		}

		function normalizeInput(value) {
			const input = String(value || 'api')
			return ['mouse', 'keyboard', 'gamepad', 'touch', 'api'].includes(input) ? input : 'api'
		}

		function normalizeRequestedPlane(value, fallback) {
			if (value === undefined || value === null) return normalizePlane(fallback)
			return normalizePlane(value)
		}

		function normalizePlane(value) {
			return Number(value) === 1 ? 1 : 0
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
		}

		function clonePosition(value) {
			const position = normalizePosition(value)
			if (!position) throw deletionError('INVALID_POSITION', 'An entity position is invalid.')
			return position
		}

		function compareDescriptors(left, right) {
			return comparePositions(left.position, right.position) ||
				left.name.localeCompare(right.name) ||
				left.identity.localeCompare(right.identity)
		}

		function comparePositions(left, right) {
			return left[1] - right[1] || left[0] - right[0]
		}

		function numericArray(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return finiteOr(entry, 0)
			})
		}

		function negateArray(value) {
			return numericArray(value).map(function (entry) { return -entry })
		}

		function addArrays(left, right) {
			const length = Math.max(left?.length || 0, right?.length || 0)
			const result = []
			for (let index = 0; index < length; index += 1) {
				result[index] = finiteOr(left?.[index], 0) + finiteOr(right?.[index], 0)
			}
			return result
		}

		function subtractArrays(left, right) {
			return addArrays(left, negateArray(right))
		}

		function sameNumericArray(left, right) {
			const length = Math.max(left?.length || 0, right?.length || 0)
			for (let index = 0; index < length; index += 1) {
				if (Math.abs(finiteOr(left?.[index], 0) - finiteOr(right?.[index], 0)) > EPSILON) return false
			}
			return true
		}

		function sameTimer(left, right) {
			if (left === right) return true
			return Number.isFinite(Number(left)) &&
				Number.isFinite(Number(right)) &&
				Math.abs(Number(left) - Number(right)) <= EPSILON
		}

		function samePlain(left, right) {
			return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
		}

		function stableValue(value) {
			if (Array.isArray(value)) return value.map(stableValue)
			if (!value || typeof value !== 'object') return value
			const result = {}
			for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key])
			return result
		}

		function safeName(value) {
			return typeof value === 'string' ? value.trim() : ''
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function finiteInteger(value, fallback) {
			const number = Number(value)
			return Number.isInteger(number) ? number : fallback
		}

		function nonNegativeInteger(value, fallback) {
			const number = Math.floor(Number(value))
			return Number.isFinite(number) && number >= 0 ? number : fallback
		}

		function cellKey(u, v) {
			return u + ':' + v
		}

		function cancelIfNeeded(isCancelled) {
			if (isCancelled?.()) throw deletionError('INVALIDATED', 'Deletion planning was cancelled.')
		}

		async function yieldTurn(isCancelled) {
			cancelIfNeeded(isCancelled)
			await new Promise(function (resolve) {
				if (typeof globalThis.requestAnimationFrame === 'function') {
					globalThis.requestAnimationFrame(function () { resolve() })
				} else {
					globalThis.setTimeout(resolve, 0)
				}
			})
			cancelIfNeeded(isCancelled)
		}

		async function yieldOperation(context) {
			await yieldTurn(function () {
				return !context?.isCurrent?.()
			})
		}

		function jsonClone(value) {
			if (value === undefined) return null
			return JSON.parse(JSON.stringify(value))
		}

		function deepFreeze(value) {
			if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
			for (const key of Object.keys(value)) deepFreeze(value[key])
			return Object.freeze(value)
		}
	}
})
