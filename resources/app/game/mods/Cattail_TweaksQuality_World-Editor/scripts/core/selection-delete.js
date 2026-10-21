ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const ANALYSIS_KEY = Symbol.for('cattail.world-editor.analysis')
		const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
		const BLUEPRINT_STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
		const PAINT_CUBE_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const PREVIEW_KEY = Symbol.for('cattail.world-editor.blueprint-preview')
		const DELETE_KEY = Symbol.for('cattail.world-editor.selection-delete')
		const TRANSACTION_KIND = 'selection-delete'
		const SERVICE_VERSION = '1.1.0'
		const ADAPTER_VERSION = '1.0.0'
		const IMPLEMENTATION = 'operating-targets-r21'
		const PLAN_SCHEMA = 1
		const TRANSACTION_SCHEMA = 1
		const SCAN_CHUNK_SIZE = 512
		const APPLY_CHUNK_SIZE = 32
		const PROBE_EVENT_LIMIT = 160
		const EPSILON = 1e-7
		const EXTRACTOR_NAMES = new Set(['pump', 'pump2', 'gradient'])
		const BUILDING_RUNTIME_SAVE_FIELDS = new Set([
			'fill',
			'state',
			'conversion',
			'resources',
			'resourceCount'
		])
		const ATTACHED_CUBE_RUNTIME_SAVE_FIELDS = new Set([
			'fill',
			'state',
			'reverseTimer',
			'unveilProgress',
			'broken'
		])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const selection = globalThis[SELECTION_KEY]
			const placement = globalThis[PLACEMENT_KEY]
			const blueprintState = globalThis[BLUEPRINT_STATE_KEY]
			const paintCubeState = globalThis[PAINT_CUBE_STATE_KEY]
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

			const service = createService(
				game,
				runtime,
				transactions,
				selection,
				placement,
				creative,
				blueprintState,
				paintCubeState
			)
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

		function createService(game, runtime, transactions, selection, placement, creative, blueprintState, paintCubeState) {
			const listeners = new Set()
			const identityByEntity = new WeakMap()
			const transactionData = new Map()
			const operationPayloads = new Map()
			const operations = new Map()
			const probeEvents = []
			let identitySequence = 0
			let probeSequence = 0
			let planningToken = 0
			let disposed = false
			const nativeRequests = new Map()
			let nativeSequence = 0
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
					const origin = normalizeOrigin(request?.origin)
					traceProbe('adapter.prepare.start', {
						operationId: context?.operationId,
						direction: context?.direction,
						origin
					})
					requireCurrent(context)
					let nativeRequest = null
					if (origin === 'native') {
						if (!creativeActive(creative, game)) throw deletionError('ECONOMY_MODE_CHANGED', 'Creative mode is required for this deletion.')
						nativeRequest = nativeRequests.get(request.nativeToken)
						if (!nativeRequest) throw deletionError('TARGET_CHANGED', 'The native deletion target expired.')
						validateNativeTargets(nativeRequest)
						request = { ...request, plan: await rebuildPlan(createCellsSource(nativeRequest.cells), () => !context.isCurrent()) }
						validateNativeTargets(nativeRequest)
					}
					const requested = normalizePlanRequest(request?.plan)
					const rebuilt = await rebuildPlan(requested.source, function () {
						return !context.isCurrent()
					})
					requireCurrent(context)
					const allowCutRetainedCubeRebase = cutRetainedCubeRebaseAllowed(
						origin,
						requested.source,
						'forward'
					)
					const cutRetainedCubeMatch = allowCutRetainedCubeRebase &&
						rebuilt.cutRetainedCubeSignature === requested.cutRetainedCubeSignature
					traceProbe('adapter.prepare.rebuilt', {
						signatureMatch: rebuilt.signature === requested.signature,
						compatibilityMatch: rebuilt.compatibilitySignature === requested.compatibilitySignature,
						dynamicCubeMatch: rebuilt.dynamicCubeSignature === requested.dynamicCubeSignature,
						pumpDependencyMatch: rebuilt.pumpDependencySignature === requested.pumpDependencySignature,
						dynamicSurgeMatch: rebuilt.dynamicSurgeSignature === requested.dynamicSurgeSignature,
						cutRetainedCubeMatch,
						cutRetainedCubeDifference: allowCutRetainedCubeRebase && !cutRetainedCubeMatch
							? comparePlanSignatures(
								requested.cutRetainedCubeSignature,
								rebuilt.cutRetainedCubeSignature
							)
							: null,
						safeCount: rebuilt.summary.safeCount,
						protectedCount: rebuilt.summary.protectedCount,
						crossBoundaryCount: rebuilt.summary.crossBoundaryCount,
						signatureDifference: comparePlanFingerprints(
							requested.fingerprints,
							rebuilt.fingerprints
						)
					})
					const matches = plansMatch(
						requested,
						rebuilt,
						paintCubeState,
						currentPumpCubeState,
						currentOrdinaryCubeState,
						{ allowCutRetainedCubeRebase }
					)
					if (!matches) {
						tracePlanMismatch(requested, rebuilt, 'forward', false, {
							allowCutRetainedCubeRebase
						})
						throw deletionError('TARGET_CHANGED', 'The selected deletion target changed after confirmation.')
					}
					if (nativeRequest) {
						validateNativeTargets(nativeRequest)
						const allowed = new Set(nativeRequest.targets.map(t => ensureIdentity(t.entity)))
						if (rebuilt.removals.some(e => !allowed.has(e.identity))) throw deletionError('PROTECTED_TARGET', 'Native deletion would include an unselected related object.')
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
							label: origin === 'native' ? 'Native creative deletion' : origin === 'cut' ? 'Selection cut' : 'Selection contents deletion',
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
						payload: createTransactionPayload(rebuilt, origin)
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
					if (!context?.snapshotId) operationPayloads.clear()
					let payload = operationPayload(context, record)
					for (const target of payload.removals) {
						const protection = globalThis[Symbol.for('cattail.world-editor.blueprint-preview-plan')]?.protectionReason?.(game, target.name, target.footprint)
						if (protection) return denied('PROTECTED_TARGET', 'The target is protected: ' + protection)
					}
					if (creativeActive(creative, game) !== payload.economy.creative) {
						return denied('ECONOMY_MODE_CHANGED', 'Creative mode changed after deletion was prepared.')
					}

					if (
						direction === 'forward' ||
						(direction === 'redo' && (
							hasPumpRemoval(payload) ||
							payload.source?.removeSurges === true
						))
					) {
						try {
							const isCancelled = function () {
								return !context.isCurrent()
							}
							const rebuilt = direction === 'redo'
								? await buildPlan(payload.source, isCancelled)
								: await rebuildPlan(payload.source, isCancelled)
							requireCurrent(context)
							const allowCutRetainedCubeRebase = cutRetainedCubeRebaseAllowed(
								payload.origin,
								payload.source,
								direction
							)
							const cutRetainedCubeMatch = allowCutRetainedCubeRebase &&
								rebuilt.cutRetainedCubeSignature === payload.cutRetainedCubeSignature
							const matches = plansMatch(
								payload,
								rebuilt,
								paintCubeState,
								currentPumpCubeState,
								currentOrdinaryCubeState,
								{
									allowDynamicStandaloneSurges: direction === 'redo',
									allowCutRetainedCubeRebase
								}
							)
							traceProbe('adapter.preflight.rebuilt', {
								hasSnapshot: !!context?.snapshotId,
								direction,
								signatureMatch: rebuilt.signature === payload.planSignature,
								compatibilityMatch: rebuilt.compatibilitySignature === payload.compatibilitySignature,
								dynamicCubeMatch: rebuilt.dynamicCubeSignature === payload.dynamicCubeSignature,
								pumpDependencyMatch: rebuilt.pumpDependencySignature === payload.pumpDependencySignature,
								dynamicSurgeMatch: rebuilt.dynamicSurgeSignature === payload.dynamicSurgeSignature,
								cutRetainedCubeMatch,
								cutRetainedCubeDifference: allowCutRetainedCubeRebase && !cutRetainedCubeMatch
									? comparePlanSignatures(
										payload.cutRetainedCubeSignature,
										rebuilt.cutRetainedCubeSignature
									)
									: null,
								accepted: matches,
								signatureDifference: comparePlanFingerprints(payload.fingerprints, rebuilt.fingerprints)
							})
							if (!matches) {
								tracePlanMismatch(payload, rebuilt, direction, !!context?.snapshotId, {
									allowDynamicStandaloneSurges: direction === 'redo',
									allowCutRetainedCubeRebase
								})
								return denied('TARGET_CHANGED', 'The selected deletion target changed after confirmation.')
							}
							const rebound = createTransactionPayload(rebuilt, payload.origin)
							if (
								cutRetainedCubeMatch &&
								rebuilt.signature !== payload.planSignature
							) {
								traceProbe('contract.forward.cut-retained-cubes-rebased', {
									beforeAttachedCount: countRemovalLayer(payload.removals, 'attached-cube'),
									afterAttachedCount: countRemovalLayer(rebound.removals, 'attached-cube'),
									removeCubes: payload.source?.removeCubes === true,
									removePaintedCubes: payload.source?.removePaintedCubes === true
								})
							}
							payload = direction === 'redo'
								? retainRecordedOrdinaryCubeRemovals(payload, rebound)
								: rebound
							operationPayloads.set(context.operationId, payload)
						} catch (targetError) {
							return denied(
								targetError?.code || 'TARGET_CHANGED',
								targetError?.message || 'The selected deletion target changed after confirmation.'
							)
						}
					}

					if (direction !== 'forward') {
						const targetState = inspectRecordedTargets(payload, direction, record.id, record.payload)
						if (!targetState.ok) return targetState
						if (direction === 'redo') {
							try {
								const economy = simulateEconomy(game, payload.removals.filter(isBuildingRemoval), payload.economy.creative)
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
					const payload = operationPayload(context, record)
					const captured = captureScope(payload, context?.direction, record.payload)
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
						deleteCount: operationPayload(context, record)?.removals?.length || 0
					})
					requireCurrent(context)
					validateRecord(record)
					const payload = operationPayload(context, record)
					const state = {
						recordId: record.id,
						direction,
						payload,
						mutations: [],
						resourcesBefore: numericArray(game.resources),
						statsBefore: captureStats(game),
						resourceDelta: [],
						statsAfter: null,
						removedSaves: new Map(),
						pendingRemovals: new Map(),
						rollingExpectedSaves: new Map(),
						ownedOriginalSaves: new Map(),
						ownedRebasedIdentities: new Set(),
						removedPumpOwners: new Map(),
						recreatedRelationSurges: new Set(),
						contract: createOperationContract(payload),
						relations: payload.relations
					}
					operations.set(context.operationId, state)
					const restoreBatchedWrites = beginBatchedWorldWrites(game)
					try {
						if (direction === 'undo') {
							await applyUndo(context, record, state)
						}
						else await applyForward(context, record, state)
						state.contract.commitManifest = createDynamicCommitManifest(state)
					} finally {
						restoreBatchedWrites()
					}
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
					const verification = verifyAppliedState(state.payload, state, expectedAfter)
					if (!verification.ok) {
						traceProbe('adapter.verify.denied', {
							direction,
							code: verification.code
						})
						return verification
					}

					const previousData = transactionData.get(record.id)
					transactionData.set(record.id, {
						removalSaves: expectedAfter
							? new Map(state.removedSaves)
							: new Map(state.payload.removals.map(function (descriptor) {
								return [descriptor.identity, jsonClone(descriptor.save)]
							})),
						payload: state.payload,
						timeSinceLastDelete: previousData?.timeSinceLastDelete ?? state.statsBefore.timeSinceLastDelete
					})
					if (expectedAfter) playRecycleSound(state.payload.removals)
					operations.delete(context.operationId)
					operationPayloads.delete(context.operationId)
					refreshSelectionAnalysis('selection-delete-' + direction + '-verified')
					traceProbe('adapter.verify.complete', {
						direction,
						deleteCount: state.payload.removals.length
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
						const restoreBatchedWrites = beginBatchedWorldWrites(game)
						try {
							await rollbackMutations(context, state)
							requireCurrent(context)
							if (context?.direction !== 'undo') restoreRecordedRelations(state.payload.relations)
						} finally {
							restoreBatchedWrites()
						}
						refreshWorld(game)
						operations.delete(context.operationId)
						operationPayloads.delete(context.operationId)
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

			function createTransactionPayload(planValue, originValue) {
				return deepFreeze({
					schema: TRANSACTION_SCHEMA,
					origin: normalizeOrigin(originValue),
					source: planValue.source,
					planSignature: planValue.signature,
					compatibilitySignature: planValue.compatibilitySignature,
					dynamicCubeSignature: planValue.dynamicCubeSignature,
					pumpDependencySignature: planValue.pumpDependencySignature,
					dynamicSurgeSignature: planValue.dynamicSurgeSignature,
					cutRetainedCubeSignature: planValue.cutRetainedCubeSignature,
					ordinaryCubeStates: planValue.ordinaryCubeStates,
					pumpCubeStates: planValue.pumpCubeStates,
					growStates: planValue.growStates,
					paintedStates: planValue.paintedStates,
					surgeStates: planValue.surgeStates,
					strictSurgeStates: planValue.strictSurgeStates,
					fingerprints: planValue.fingerprints,
					removals: planValue.removals,
					relations: planValue.relations,
					scopeCells: planValue.scopeCells,
					onlyOneKeys: planValue.onlyOneKeys,
					onlyonesBefore: planValue.onlyonesBefore,
					onlyonesAfter: planValue.onlyonesAfter,
					economy: planValue.economy,
					statsDelta: {
						machinesSold: planValue.removals.filter(isBuildingRemoval).length
					}
				})
			}

			function retainRecordedOrdinaryCubeRemovals(recorded, rebound) {
				const recordedDynamic = (recorded?.removals || []).filter(function (entry) {
					return isDynamicOrdinaryStableCubeDescriptor(entry, paintCubeState)
				})
				const strictRebound = (rebound?.removals || []).filter(function (entry) {
					return !isDynamicOrdinaryStableCubeDescriptor(entry, paintCubeState)
				})
				const removals = strictRebound.concat(recordedDynamic).sort(compareDescriptors)
				const payload = deepFreeze(Object.assign({}, rebound, {
					removals,
					ordinaryCubeStates: createOrdinaryCubeRuntimeStates({ removals: recordedDynamic }, paintCubeState),
					statsDelta: {
						machinesSold: removals.filter(isBuildingRemoval).length
					}
				}))
				traceProbe('adapter.redo.dynamic-cubes-retained', {
					recordedCount: recordedDynamic.length,
					currentCount: (rebound?.removals || []).filter(function (entry) {
						return isDynamicOrdinaryStableCubeDescriptor(entry, paintCubeState)
					}).length
				})
				traceDynamicStandaloneSurgeRebase(recorded, payload)
				return payload
			}

			function traceDynamicStandaloneSurgeRebase(beforeValue, afterValue) {
				const before = standaloneSurgeDescriptors(beforeValue)
				const after = standaloneSurgeDescriptors(afterValue)
				const beforeIdentities = new Set(before.map(function (entry) { return entry.identity }))
				const afterIdentities = new Set(after.map(function (entry) { return entry.identity }))
				const added = after.filter(function (entry) { return !beforeIdentities.has(entry.identity) })
				const removed = before.filter(function (entry) { return !afterIdentities.has(entry.identity) })
				if (!added.length && !removed.length) return
				traceProbe('contract.redo.dynamic-surge-rebased', {
					removeSurges: afterValue?.source?.removeSurges === true,
					beforeCount: before.length,
					afterCount: after.length,
					added: added.map(function (entry) { return clonePosition(entry.position) }),
					removed: removed.map(function (entry) { return clonePosition(entry.position) })
				})
			}

			function standaloneSurgeDescriptors(value) {
				const relationSurges = relationSurgeIdentities(value?.relations)
				return (value?.removals || []).filter(function (entry) {
					return isDynamicStandaloneSurgeDescriptor(entry, relationSurges, 'removal')
				}).slice().sort(compareDescriptors)
			}

			function countRemovalLayer(removals, layer) {
				return (removals || []).filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) === layer
				}).length
			}

			function operationPayload(context, record) {
				const pending = operationPayloads.get(context?.operationId)
				if (pending) return pending
				if (context?.direction === 'undo' || context?.direction === 'redo') {
					return transactionData.get(record?.id)?.payload || record.payload
				}
				return record.payload
			}

			function currentPumpCubeState(identity) {
				const expectedIdentity = String(identity || '')
				if (!expectedIdentity) return null
				for (const cube of game.stuff || []) {
					if (safeName(cube?.name) !== 'cube' || ensureIdentity(cube) !== expectedIdentity) continue
					return capturePumpCubeState(cube, ensureIdentity, paintCubeState)
				}
				return null
			}

			function currentOrdinaryCubeState(identity) {
				const expectedIdentity = String(identity || '')
				if (!expectedIdentity) return null
				for (const entity of game.stuff || []) {
					if (ensureIdentity(entity) !== expectedIdentity) continue
					let save = null
					try { save = captureDeletionEntitySave(entity, 'cube') } catch (error) {}
					return createOrdinaryCubeRuntimeState({
						identity: expectedIdentity,
						layer: 'cube',
						name: safeName(entity?.name),
						position: normalizePosition(entity?.position),
						save
					}, paintCubeState) || {
						identity: expectedIdentity,
						position: normalizePosition(entity?.position) || [0, 0],
						valid: false,
						save: null
					}
				}
				return null
			}

			function hasPumpRemoval(payload) {
				return (payload?.removals || []).some(function (descriptor) {
					return normalizeRemovalLayer(descriptor?.layer, descriptor) === 'building' &&
						(safeName(descriptor?.name) === 'pump' || safeName(descriptor?.name) === 'pump2')
				})
			}

			function tracePlanMismatch(beforeValue, afterValue, direction, hasSnapshot, options) {
				try {
					const selectedPumps = diagnosticSelectedPumps(beforeValue, afterValue)
					const vicinity = selectedPumpVicinity(selectedPumps)
					const selectedPumpSet = new Set(selectedPumps)
					traceProbe('diagnostic.plan-mismatch', Object.assign(
						{
							direction,
							hasSnapshot,
							targets: diagnosticPlanTargetDifferences(beforeValue, afterValue, function (descriptor) {
								if (safeName(descriptor?.name || descriptor?.save?.name) !== 'cube') return null
								const live = diagnosticEntity(descriptor)
								if (safeName(live?.name) !== 'cube') return { liveCube: null }
								const owner = isPumpEntity(live?.pump) ? live.pump : null
								const position = normalizePosition(live?.position)
								return {
									liveCube: Object.assign({}, liveVanillaCubeClassification(live, paintCubeState), {
										identity: ensureIdentity(live),
										position,
										ownerIdentity: owner ? ensureIdentity(owner) : null,
										ownerName: owner ? safeName(owner.name) : null,
										ownerPosition: owner ? normalizePosition(owner.position) : null,
										ownerInSelectedPumps: owner ? selectedPumpSet.has(owner) : false,
										inSelectedPumpVicinity: !!position && vicinity.has(cellKey(position[0], position[1]))
									})
								}
							})
						},
						diagnosePlansMatch(
							beforeValue,
							afterValue,
							paintCubeState,
							currentPumpCubeState,
							currentOrdinaryCubeState,
							options
						)
					))
				} catch (diagnosticError) {
					try {
						traceProbe('diagnostic.plan-mismatch-failed', {
							direction,
							hasSnapshot,
							message: String(diagnosticError?.message || diagnosticError || 'Unknown diagnostic failure.')
						})
					} catch (ignored) {}
				}
			}

			function diagnosticSelectedPumps(beforeValue, afterValue) {
				const result = new Set()
				for (const descriptor of [].concat(
					diagnosticTargetEntries(beforeValue, 'removal'),
					diagnosticTargetEntries(beforeValue, 'protected'),
					diagnosticTargetEntries(afterValue, 'removal'),
					diagnosticTargetEntries(afterValue, 'protected')
				)) {
					if (!isPumpEntity(descriptor)) continue
					const entity = diagnosticEntity(descriptor)
					if (isPumpEntity(entity)) result.add(entity)
				}
				return Array.from(result)
			}

			function diagnosticEntity(descriptor) {
				const identityMatch = findEntityByIdentity(descriptor?.identity)
				if (identityMatch) return identityMatch
				const position = normalizePosition(descriptor?.position)
				if (!position) return null
				const occupant = entityAt(game, position)
				return safeName(occupant?.name) === safeName(descriptor?.name || descriptor?.save?.name)
					? occupant
					: null
			}

			function selectedPumpVicinity(pumps) {
				return selectedPumpVicinityCells(pumps)
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
				serviceVersion: SERVICE_VERSION,
				implementation: IMPLEMENTATION
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
					version: 3,
					implementation: IMPLEMENTATION,
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

			async function executePlan(planValue, input, options) {
				const origin = normalizeOrigin(options?.origin)
				traceProbe('execute.requested', {
					input: normalizeInput(input),
					origin,
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
							plan: request,
							origin
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
						origin,
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
				executeNative(entities, input) {
					const targets = Array.from(new Set(entities || [])).map(entity => ({ entity, position: entity.position.slice() }))
					validateNativeTargets({ targets })
					const cells = []
					for (const { entity } of targets) {
						const footprint = entityFootprint(entity, entity.position)
						for (let u = footprint.minU; u <= footprint.maxU; u++) for (let v = footprint.minV; v <= footprint.maxV; v++) cells.push([u, v])
					}
					const nativeToken = ++nativeSequence
					nativeRequests.set(nativeToken, { targets, cells })
					return transactions.execute({ kind: TRANSACTION_KIND, input: normalizeInput(input), payload: { origin: 'native', nativeToken } }).finally(() => nativeRequests.delete(nativeToken))
				},
				planSelections(options) {
					return plan(function () {
						return createSelectionSource(options)
					}, options)
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
				execute(planValue, input, options) {
					return executePlan(planValue, input, options)
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
					operationPayloads.clear()
					transactionData.clear()
					lastReason = String(reason || 'disposed')
					if (globalThis[DELETE_KEY] === service) delete globalThis[DELETE_KEY]
					return true
				}
			})
			return service

			function createSelectionSource(options) {
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
						primary: entry?.id === state?.primaryId || entry?.primary === true,
						range: normalizeRange(entry?.range)
					}
				})
				const source = {
					kind: 'selection',
					plane,
					revision: finiteInteger(state?.revision, 0),
					ranges
				}
				if (creativeActive(creative, game) && options?.removeCubes === true) source.removeCubes = true
				if (options?.removePaintedCubes === true) source.removePaintedCubes = true
				if (creativeActive(creative, game) && options?.removeSurges === true) source.removeSurges = true
				return source
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
							primary: index === ranges.length - 1,
							range: normalizeRange(range)
						}
					})
				}
			}

			function validateNativeTargets(request) {
				if (!request.targets.length) throw deletionError('NOTHING_SAFE', 'No safely deletable building is selected.')
				for (const target of request.targets) {
					if (entityAt(game, target.position) !== target.entity || !samePlain(target.entity.position, target.position) || !game.canEraseEntity(target.entity)) {
						throw deletionError('TARGET_CHANGED', 'The native deletion target changed after selection.')
					}
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
					const current = createSelectionSource({
						removeCubes: source.removeCubes === true,
						removePaintedCubes: source.removePaintedCubes === true,
						removeSurges: source.removeSurges === true
					})
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
				for (const entity of game.stuff || []) {
					const name = safeName(entity?.name)
					const position = normalizePosition(entity?.position)
					if (
						(name === 'cube' || name === 'surge') &&
						position &&
						cellKeys.has(cellKey(position[0], position[1]))
					) entities.add(entity)
				}
				const selectedPumps = Array.from(entities).filter(isPumpEntity)
				const selectedPumpSet = new Set(selectedPumps)
				const selectedPumpVicinityCellsSet = selectedPumpVicinityCells(selectedPumps)
				const pumpCubeStates = createPumpCubeStates(game, selectedPumps, ensureIdentity, paintCubeState)
				const attachedCubeOwners = collectSelectedPumpAttachments(
					game,
					selectedPumps,
					paintCubeState,
					source.removeCubes === true
				)
				for (const cube of attachedCubeOwners.keys()) entities.add(cube)

				const safe = []
				const protectedTargets = []
				const activeRelations = new Map()
				for (const entity of entities) {
					cancelIfNeeded(isCancelled)
					const name = safeName(entity?.name)
					const position = normalizePosition(entity?.position)
					const footprint = position ? entityFootprint(entity, position) : null
					const crossBoundary = !!footprint && footprintCrossesMask(footprint, cellKeys)
					const protection = globalThis[Symbol.for('cattail.world-editor.blueprint-preview-plan')]?.protectionReason?.(game, name, footprint)
					if (protection) {
						protectedTargets.push(captureProtectedEntity(entity, protection, crossBoundary, attachedCubeOwners.has(entity) ? 'attached-cube' : name === 'cube' || name === 'surge' ? name : 'building'))
						continue
					}
					const activeRelation = captureActiveStabilizerRelation(entity, entities)
					if (activeRelation) activeRelations.set(relationKey(activeRelation), activeRelation)
					if (name === 'cube') {
						if (ignorableSelectedPumpTerminalCube(
							entity,
							selectedPumpSet,
							selectedPumpVicinityCellsSet,
							paintCubeState
						)) continue
						const attachedPump = attachedCubeOwners.get(entity)
						if (attachedPump) {
							if (attachedCubeRemovalSafe(entity, attachedPump, paintCubeState)) {
								try {
									safe.push(captureRestorableEntity(entity, crossBoundary, 'attached-cube'))
								} catch (captureError) {
									protectedTargets.push(captureProtectedEntity(
										entity,
										'save-unavailable',
										crossBoundary,
										'attached-cube'
									))
								}
							} else {
								protectedTargets.push(captureProtectedEntity(
									entity,
									'unsafe-attached-cube',
									crossBoundary,
									'attached-cube'
								))
							}
							continue
						}
						const paintedKind = classifyPaintedCube(entity, paintCubeState)
						const requestedLayer = paintedKind === 'strict'
							? source.removePaintedCubes === true
							: paintedKind === 'ordinary' && source.removeCubes === true
						const safeLayer = paintedKind === 'strict'
							? paintedRemovalSafe(game, entity, paintCubeState)
							: paintedKind === 'ordinary' && transientRemovalSafe(game, entity, name, blueprintState)
						if (requestedLayer && safeLayer) {
							try {
								safe.push(captureRestorableEntity(
									entity,
									crossBoundary,
									paintedKind === 'strict' ? 'painted' : 'cube'
								))
							} catch (captureError) {
								protectedTargets.push(captureProtectedEntity(
									entity,
									'save-unavailable',
									crossBoundary,
									paintedKind === 'strict' ? 'painted' : 'cube'
								))
							}
						} else {
							protectedTargets.push(captureProtectedEntity(
								entity,
								paintedProtectionReason(paintedKind, requestedLayer),
								crossBoundary,
								paintedKind === 'strict' ? 'painted' : 'cube'
							))
						}
						continue
					}
					if (name === 'surge') {
						const requestedLayer = source.removeSurges === true
						const standaloneSafe = !activeRelation && !!captureReplaceableStandaloneSurge(entity)
						const connectedSafe = !!activeRelation && transientRemovalSafe(game, entity, name, blueprintState)
						if (requestedLayer && (standaloneSafe || connectedSafe)) {
							try {
								safe.push(captureRestorableEntity(entity, crossBoundary, name))
							} catch (captureError) {
								protectedTargets.push(captureProtectedEntity(entity, 'save-unavailable', crossBoundary, name))
							}
						} else {
							const protectedDescriptor = captureProtectedEntity(
								entity,
								requestedLayer ? 'unsafe-' + name : name,
								crossBoundary,
								name
							)
							if (!requestedLayer && standaloneSafe) protectedDescriptor.dynamicStandaloneSurge = true
							protectedTargets.push(protectedDescriptor)
						}
						continue
					}
					const assessment = placement.assessEntity(entity, {
						allowShatteredStabilizer: creativeActive(creative, game),
						allowAttachedCube: pumpAttachmentsSafe(game, entity, attachedCubeOwners, paintCubeState)
					})
					const connectedStabilizerSafe =
						isStabilizerName(name) &&
						assessment?.reason === 'attached-surge' &&
						!!activeRelation
					if (assessment?.safe || connectedStabilizerSafe) {
						try {
							safe.push(captureRestorableEntity(entity, crossBoundary, 'building'))
						} catch (captureError) {
							protectedTargets.push(captureProtectedEntity(entity, 'save-unavailable', crossBoundary, 'building'))
						}
					} else {
						protectedTargets.push(captureProtectedEntity(
							entity,
							protectedReason(entity, assessment?.reason),
							crossBoundary,
							'building'
						))
					}
				}
				enforceConnectedPairAtomicity(activeRelations, safe, protectedTargets, source.removeSurges === true)
				safe.sort(compareDescriptors)
				protectedTargets.sort(compareDescriptors)
				enforceExtractorInvariant(safe, protectedTargets)
				enforceAttachedCubeAtomicity(safe, protectedTargets)
				safe.sort(compareDescriptors)
				protectedTargets.sort(compareDescriptors)
				const relations = createRemovalRelations(activeRelations, safe)

				const buildingRemovals = safe.filter(isBuildingRemoval)
				const onlyOneKeys = collectOnlyOneKeys(game, buildingRemovals)
				const onlyonesBefore = captureOnlyones(game, onlyOneKeys)
				const onlyonesAfter = simulateOnlyones(game, onlyonesBefore, onlyOneKeys, buildingRemovals)
				const economy = simulateEconomy(game, buildingRemovals, creativeActive(creative, game))
				const scopeCells = collectScopeCells(safe, relations)
				const crossBoundaryCount = safe.concat(protectedTargets).filter(function (entry) {
					return entry.crossBoundary
				}).length
				const summary = {
					sourceCellCount: cells.length,
					safeCount: safe.length,
					protectedCount: protectedTargets.length,
					crossBoundaryCount,
					resourceDelta: economy.delta.slice(),
					creative: economy.creative,
					buildingCount: buildingRemovals.length,
					cubeCount: safe.filter(function (entry) { return entry.layer === 'cube' }).length,
					paintedCubeCount: safe.filter(function (entry) { return entry.layer === 'painted' }).length,
					attachedCubeCount: safe.filter(function (entry) { return entry.layer === 'attached-cube' }).length,
					surgeCount: safe.filter(function (entry) { return entry.layer === 'surge' }).length
				}
				const signatureValue = {
					source,
					removals: safe.map(signatureDescriptor),
					relations,
					protectedTargets: protectedTargets.map(function (entry) {
						return signatureProtectedDescriptor(entry, paintCubeState)
					}),
					onlyOneKeys,
					onlyonesBefore,
					onlyonesAfter,
					economy
				}
				const signature = planSignature(signatureValue)
				const compatibilitySignature = planSignature(planCompatibilityValue(signatureValue, paintCubeState))
				const dynamicCubeSignature = planSignature(
					dynamicCubeCompatibilityValue(signatureValue, paintCubeState)
				)
				const pumpDependencySignature = planSignature(
					pumpDependencyCompatibilityValue(signatureValue, paintCubeState)
				)
				const dynamicSurgeSignature = planSignature(
					dynamicStandaloneSurgeCompatibilityValue(signatureValue, paintCubeState)
				)
				const cutRetainedCubeSignature = planSignature(
					cutRetainedCubeCompatibilityValue(signatureValue, paintCubeState)
				)
				const ordinaryCubeStates = createOrdinaryCubeRuntimeStates({
					removals: safe,
					protectedTargets
				}, paintCubeState)
				const growStates = createGrowStates(signatureValue, paintCubeState)
				const paintedStates = createPaintedRuntimeStates(signatureValue, paintCubeState)
				const surgeStates = createSurgeRuntimeStates(signatureValue)
				const strictSurgeStates = createStrictSurgeRuntimeStates(signatureValue)
				const fingerprints = createPlanFingerprints(signatureValue)
				return deepFreeze({
					schema: PLAN_SCHEMA,
					source,
					summary,
					removals: safe,
					relations,
					protectedTargets,
					scopeCells,
					onlyOneKeys,
					onlyonesBefore,
					onlyonesAfter,
					economy,
					signature,
					compatibilitySignature,
					dynamicCubeSignature,
					pumpDependencySignature,
					dynamicSurgeSignature,
					cutRetainedCubeSignature,
					pumpCubeStates,
					ordinaryCubeStates,
					growStates,
					paintedStates,
					surgeStates,
					strictSurgeStates,
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

			function captureRestorableEntity(entity, crossBoundary, layer) {
				const normalizedLayer = normalizeRemovalLayer(layer, entity)
				const save = captureDeletionEntitySave(entity, normalizedLayer)
				const position = normalizePosition(entity?.position)
				if (!position || !save) {
					throw deletionError('SAVE_UNAVAILABLE', 'A deletion target could not be captured safely.')
				}
				const descriptor = {
					identity: ensureIdentity(entity),
					layer: normalizedLayer,
					name: safeName(entity.name),
					position,
					footprint: entityFootprint(entity, position),
					save,
					crossBoundary: crossBoundary === true
				}
				if (normalizedLayer === 'attached-cube') descriptor.pump = captureAttachedPump(entity)
				return descriptor
			}

			function captureActiveStabilizerRelation(entity, selectedEntities) {
				const name = safeName(entity?.name)
				const stabilizer = isStabilizerName(name) ? entity : name === 'surge' ? entity?.stabilizer : null
				const surge = name === 'surge' ? entity : isStabilizerName(name) ? entity?.surge : null
				if (
					!stabilizer ||
					!surge ||
					!isStabilizerName(safeName(stabilizer.name)) ||
					safeName(surge.name) !== 'surge' ||
					stabilizer.surge !== surge ||
					surge.stabilizer !== stabilizer
				) return null
				const stabilizerPosition = normalizePosition(stabilizer.position)
				const surgePosition = normalizePosition(surge.position)
				if (!stabilizerPosition || !surgePosition) return null
				let surgeSave = null
				if (safeName(stabilizer.name) === 'stabilizer3') {
					try {
						if (transientRemovalSafe(game, surge, 'surge', blueprintState)) {
							surgeSave = captureEntitySave(game, surge)
							surgeSave.par.stabilizerPosition = clonePosition(stabilizerPosition)
						}
					} catch (saveError) {}
				}
				return {
					stabilizer: {
						identity: ensureIdentity(stabilizer),
						name: safeName(stabilizer.name),
						position: stabilizerPosition
					},
					surge: {
						identity: ensureIdentity(surge),
						name: 'surge',
						position: surgePosition
					},
					surgeSave,
					selectedStabilizer: selectedEntities?.has?.(stabilizer) === true,
					selectedSurge: selectedEntities?.has?.(surge) === true
				}
			}

			function enforceConnectedPairAtomicity(activeRelations, removals, protectedTargets, removeSurges) {
				if (!removeSurges) return
				const removalIdentities = new Set(removals.map(function (entry) { return entry.identity }))
				for (const relation of activeRelations.values()) {
					if (!relation.selectedStabilizer || !relation.selectedSurge) continue
					const stabilizerSafe = removalIdentities.has(relation.stabilizer.identity)
					const surgeSafe = removalIdentities.has(relation.surge.identity)
					if (stabilizerSafe === surgeSafe) continue
					const blockedIdentity = stabilizerSafe ? relation.stabilizer.identity : relation.surge.identity
					const index = removals.findIndex(function (entry) { return entry.identity === blockedIdentity })
					if (index < 0) continue
					const descriptor = removals.splice(index, 1)[0]
					removalIdentities.delete(blockedIdentity)
					protectedTargets.push(Object.assign({}, descriptor, { reason: 'unsafe-connected-pair' }))
				}
			}

			function createRemovalRelations(activeRelations, removals) {
				const removalIdentities = new Set((removals || []).map(function (entry) { return entry.identity }))
				return Array.from(activeRelations.values()).map(function (relation) {
					const removeStabilizer = removalIdentities.has(relation.stabilizer.identity)
					const removeSurge = removalIdentities.has(relation.surge.identity)
					if (!removeStabilizer && !removeSurge) return null
					const result = {
						stabilizer: relation.stabilizer,
						surge: relation.surge,
						removeStabilizer,
						removeSurge
					}
					if (requiresRelationSurgeRecovery(result)) {
						const surgeSave = normalizeRelationSurgeSave(relation.surgeSave, result)
						if (!surgeSave) {
							throw deletionError('SAVE_UNAVAILABLE', 'The shattered stabilizer Surge could not be captured safely.')
						}
						result.surgeSave = surgeSave
					}
					return result
				}).filter(Boolean).sort(compareRelations)
			}

			function captureProtectedEntity(entity, reason, crossBoundary, layer) {
				const position = normalizePosition(entity?.position) || [0, 0]
				const normalizedLayer = normalizeRemovalLayer(layer, entity)
				let save = null
				try {
					save = captureDeletionEntitySave(entity, normalizedLayer)
				} catch (saveError) {}
				const descriptor = {
					identity: ensureIdentity(entity),
					layer: normalizedLayer,
					name: safeName(entity?.name),
					position,
					footprint: entityFootprint(entity, position),
					save,
					reason: String(reason || 'protected'),
					crossBoundary: crossBoundary === true
				}
				if (normalizedLayer === 'attached-cube') descriptor.pump = captureAttachedPump(entity)
				if (
					normalizedLayer !== 'attached-cube' &&
					cutRetainableLiveCubeEntity(entity, paintCubeState)
				) descriptor.cutRetainableCube = true
				return descriptor
			}

			function captureDeletionEntitySave(entity, layer) {
				const normalizedLayer = normalizeRemovalLayer(layer, entity)
				if (normalizedLayer === 'attached-cube') return captureAttachedCubeSave(entity)
				if (normalizedLayer !== 'painted') return captureEntitySave(game, entity)
				const position = normalizePosition(entity?.position)
				const save = paintCubeState?.capturePaintedCubeSave?.(entity, position)
				if (
					!position ||
					!save ||
					safeName(save.name) !== 'cube' ||
					!paintCubeState?.normalizePaint?.(save)
				) throw deletionError('SAVE_UNAVAILABLE', 'A painted Cube state could not be serialized.')
				return jsonClone(save)
			}

			function captureAttachedPump(entity) {
				const pump = entity?.pump
				const position = normalizePosition(pump?.position)
				const name = safeName(pump?.name)
				if (!position || (name !== 'pump' && name !== 'pump2')) {
					throw deletionError('SAVE_UNAVAILABLE', 'An attached Cube owner could not be captured safely.')
				}
				return {
					identity: ensureIdentity(pump),
					name,
					position
				}
			}

			function captureAttachedCubeSave(entity) {
				if (!attachedCubeRemovalSafe(entity, entity?.pump, paintCubeState)) {
					throw deletionError('SAVE_UNAVAILABLE', 'An attached unfinished Cube could not be serialized.')
				}
				const fields = [
					'state',
					'fill',
					'maxFill',
					'reversePause',
					'reverseTimer',
					'reverseSpeed',
					'unveilSpeed',
					'unveilProgress',
					'broken',
					'baseBreakPower',
					'breakPower',
					'shakePower'
				]
				const par = { resources: jsonClone(entity.resources) }
				for (const field of fields) par[field] = Number(entity[field])
				return {
					name: 'cube',
					position: clonePosition(entity.position),
					par
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

			function enforceAttachedCubeAtomicity(safe, protectedTargets) {
				const blockedPumps = new Set(protectedTargets.filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) === 'attached-cube'
				}).map(function (entry) {
					return String(entry?.pump?.identity || '')
				}).filter(Boolean))
				for (let index = safe.length - 1; index >= 0; index -= 1) {
					const descriptor = safe[index]
					if (!blockedPumps.has(descriptor.identity)) continue
					safe.splice(index, 1)
					protectedTargets.push(Object.assign({}, descriptor, { reason: 'attached-cube' }))
				}
				const safeIdentities = new Set(safe.map(function (entry) { return entry.identity }))
				for (let index = safe.length - 1; index >= 0; index -= 1) {
					const descriptor = safe[index]
					if (
						normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'attached-cube' ||
						safeIdentities.has(descriptor?.pump?.identity)
					) continue
					safe.splice(index, 1)
					protectedTargets.push(Object.assign({}, descriptor, { reason: 'attached-pump-protected' }))
				}
			}

			function inspectRecordedTargets(payload, direction, recordId, originalPayload) {
				const shatteredRemovals = payload.removals.filter(function (entry) {
					return safeName(entry?.name) === 'stabilizer3'
				}).length
				if (shatteredRemovals) {
					const expected = direction === 'undo' ? 0 : shatteredRemovals
					if (shatteredStabilizerCount(game) !== expected) {
						return denied('EXTERNAL_CHANGE', 'The shattered stabilizer count changed outside World Editor.')
					}
				}
				if (direction === 'undo') {
					for (const descriptor of payload.removals) {
						for (const position of footprintCells(descriptor.footprint)) {
							const entity = entityAt(game, position)
							if (!entity) continue
							if (
								allowsStandaloneSurgeReplacement(descriptor) &&
								captureReplaceableStandaloneSurge(entity)
							) continue
							if (undoOwnerBoundOrphanAllowed(payload, descriptor, entity)) {
								traceProbe('contract.undo.owner-bound-orphan-accepted', {
									direction: 'undo',
									origin: normalizeOrigin(payload?.origin),
									descriptor: describeRemovalDescriptor(descriptor),
									occupant: describeContractOccupant(entity),
									liveCube: liveCubeProbeDetails(entity)
								})
								continue
							}
							if (!isBuildingRemoval(descriptor)) {
								traceProbe(
									'contract.undo.transient-occupant-denied',
									undoTransientOccupantProbeDetails(
										payload,
										originalPayload,
										descriptor,
										entity
									)
								)
							}
							return denied(
								'EXTERNAL_CHANGE',
								isBuildingRemoval(descriptor)
									? 'A deleted building footprint changed outside World Editor.'
									: 'A deleted transient layer changed outside World Editor.'
							)
						}
					}
					return inspectRecordedRelations(payload, direction)
				}

				const pendingIdentityBindings = []
				const resolvedEntities = new Set()
				for (const descriptor of payload.removals) {
					const dynamicOrdinaryCube = isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState)
					let entity = findExpectedEntity(descriptor)
					let rebindIdentity = false
					if (!entity && dynamicOrdinaryCube) {
						const resolution = resolveRedoDynamicCubeAbsence(descriptor)
						if (direction === 'redo') {
							traceProbe(
								resolution.allowed
									? 'contract.redo.dynamic-cube-skipped'
									: 'contract.redo.dynamic-cube-denied',
								redoDynamicCubeProbeDetails(descriptor, resolution)
							)
							if (!resolution.allowed) {
								return denied('EXTERNAL_CHANGE', 'A recorded dynamic Cube historical cell has a strict occupant.')
							}
							continue
						}
						if (resolution.relocated || !resolution.allowed) {
							return denied('EXTERNAL_CHANGE', 'A recorded dynamic Cube changed beyond its live removal contract.')
						}
						continue
					}
					if (!entity) {
						entity = findIdentityRebindCandidate(descriptor)
						rebindIdentity = !!entity
					}
					if (!entity || resolvedEntities.has(entity)) {
						return denied('EXTERNAL_CHANGE', 'A deletion target changed outside World Editor.')
					}
					resolvedEntities.add(entity)
					const layer = normalizeRemovalLayer(descriptor.layer, descriptor)
					const safeNow = isBuildingRemoval(descriptor)
						? (function () {
							const assessment = placement.assessEntity(entity, {
								allowShatteredStabilizer: creativeActive(creative, game),
								allowAttachedCube: recordedPumpAttachmentsSafe(payload, descriptor, entity)
							})
							return assessment?.safe ||
								assessment?.reason === 'last-extractor' ||
								connectedStabilizerRemovalAllowed(payload, descriptor, entity)
						})()
						: layer === 'attached-cube'
							? recordedAttachedCubeSafe(descriptor, entity)
							: layer === 'painted'
							? paintedRemovalSafe(game, entity, paintCubeState)
							: layer === 'surge'
								? recordedSurgeRemovalSafe(payload, descriptor, entity)
								: transientRemovalSafe(game, entity, layer, blueprintState)
					if (!safeNow) {
						return denied('UNSAFE_DELETION', 'A deletion target is no longer safe to restore.')
					}
					try {
						const expectedSave = expectedRecordedTargetSave(recordId, descriptor, direction)
						const currentSave = captureDeletionEntitySave(entity, descriptor.layer)
						const saveMatches = dynamicOrdinaryCube
							? isDynamicOrdinaryStableCubeEntity(entity, paintCubeState) &&
								samePlain(
									dynamicOrdinaryCubeComparableSave(currentSave, descriptor),
									dynamicOrdinaryCubeComparableSave(expectedSave, descriptor)
								)
							: matchesDeletionSave(currentSave, expectedSave, descriptor, paintCubeState)
						if (!saveMatches) {
							traceProbe('contract.history.recorded-target-state-denied', {
								direction,
								descriptor: describeRemovalDescriptor(descriptor),
								changedFields: changedSaveFields(
									saveFieldFingerprints(expectedSave),
									saveFieldFingerprints(currentSave)
								),
								liveCube: safeName(entity?.name) === 'cube' ? liveCubeProbeDetails(entity) : null
							})
							return denied('EXTERNAL_CHANGE', 'A deletion target state changed outside World Editor.')
						}
					} catch (saveError) {
						return denied('UNSAFE_DELETION', 'A deletion target can no longer be serialized safely.')
					}
					if (rebindIdentity) pendingIdentityBindings.push({ entity, identity: descriptor.identity })
				}
				const extractorDeletes = payload.removals.filter(function (entry) {
					return EXTRACTOR_NAMES.has(entry.name)
				}).length
				if (extractorDeletes > 0 && pumpFamilyCount(game) - extractorDeletes < 1) {
					return denied('LAST_EXTRACTOR', 'At least one Pump or Gradient must remain.')
				}
				for (const binding of pendingIdentityBindings) assignIdentity(binding.entity, binding.identity)
				return inspectRecordedRelations(payload, direction)
			}

			function connectedStabilizerRemovalAllowed(payload, descriptor, entity) {
				if (!isStabilizerName(descriptor?.name) || !isStabilizerName(entity?.name)) return false
				const relation = (payload?.relations || []).find(function (entry) {
					return entry?.removeStabilizer === true && entry?.stabilizer?.identity === descriptor?.identity
				})
				if (!relation) return false
				const surge = entityAt(game, relation.surge.position)
				return !!surge && entity.surge === surge && surge.stabilizer === entity
			}

			function recordedSurgeRemovalSafe(payload, descriptor, entity) {
				if (safeName(entity?.name) !== 'surge') return false
				const relation = (payload?.relations || []).find(function (entry) {
					return entry?.removeSurge === true && entry?.surge?.identity === descriptor?.identity
				})
				if (!relation) return !!captureReplaceableStandaloneSurge(entity)
				const stabilizer = findExpectedEntity(relation.stabilizer)
				return !!stabilizer &&
					stabilizer.surge === entity &&
					entity.stabilizer === stabilizer &&
					transientRemovalSafe(game, entity, 'surge', blueprintState)
			}

			function recordedPumpAttachmentsSafe(payload, descriptor, entity) {
				if (safeName(entity?.name) !== 'pump' && safeName(entity?.name) !== 'pump2') return false
				const attached = (payload?.removals || []).filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) === 'attached-cube' &&
						entry?.pump?.identity === descriptor?.identity
				})
				if (!attached.length) return false
				return attached.every(function (entry) {
					const cube = findExpectedEntity(entry)
					return !!cube && cube.pump === entity && attachedCubeRemovalSafe(cube, entity, paintCubeState)
				})
			}

			function recordedAttachedCubeSafe(descriptor, entity) {
				const pump = findExpectedEntity(descriptor?.pump)
				return !!pump && entity?.pump === pump && attachedCubeRemovalSafe(entity, pump, paintCubeState)
			}

			function inspectRecordedRelations(payload, direction) {
				for (const relation of payload?.relations || []) {
					if (direction === 'undo') {
						if (!relation.removeStabilizer) {
							const stabilizer = findExpectedEntity(relation.stabilizer)
							if (!stabilizer || hasActiveSurgeStabilizer(stabilizer.surge)) {
								return denied('EXTERNAL_CHANGE', 'A surviving stabilizer changed outside World Editor.')
							}
						}
						if (!relation.removeSurge) {
							const surge = findExpectedEntity(relation.surge)
							if (!surge && recoverableMissingRelationSurge(relation)) continue
							if (
								!surge ||
								hasActiveSurgeStabilizer(surge.stabilizer) ||
								hasSurgeStabilizerReservation(surge.stabilizerPosition)
							) return denied('EXTERNAL_CHANGE', 'A surviving Surge changed outside World Editor.')
						}
						continue
					}
					const stabilizer = findExpectedEntity(relation.stabilizer)
					const surge = findExpectedEntity(relation.surge)
					if (!stabilizer || !surge || stabilizer.surge !== surge || surge.stabilizer !== stabilizer) {
						return denied('EXTERNAL_CHANGE', 'A stabilizer relationship changed outside World Editor.')
					}
				}
				return approved()
			}

			function captureScope(payload, direction, anchorPayload) {
				const entities = new Map()
				const cells = []
				const stablePayload = anchorPayload || payload
				const ignoredAttachmentCells = new Set()
				const ignoredStandaloneSurgeCells = new Set()
				const selectedPumpIdentities = new Set()
				const liveSuccessorCells = new Set()
				const currentRemovalIdentities = new Set((payload?.removals || []).map(function (descriptor) {
					return String(descriptor?.identity || '')
				}))
				for (const descriptor of stablePayload?.removals || []) {
					if (!isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState)) continue
					const retainedByCurrentPayload = !currentRemovalIdentities.has(String(descriptor?.identity || ''))
					if (direction !== 'redo' && !(direction === 'undo' && retainedByCurrentPayload)) continue
					for (const position of footprintCells(descriptor.footprint)) {
						liveSuccessorCells.add(cellKey(position[0], position[1]))
					}
				}
				for (const source of [stablePayload, payload]) {
					for (const descriptor of standaloneSurgeDescriptors(source)) {
						for (const position of footprintCells(descriptor.footprint)) {
							ignoredStandaloneSurgeCells.add(cellKey(position[0], position[1]))
						}
					}
					for (const descriptor of source?.removals || []) {
						const layer = normalizeRemovalLayer(descriptor?.layer, descriptor)
						if (layer === 'attached-cube') {
							const position = normalizePosition(descriptor?.position)
							if (position) ignoredAttachmentCells.add(cellKey(position[0], position[1]))
						}
						if (
							layer === 'building' &&
							(safeName(descriptor?.name) === 'pump' || safeName(descriptor?.name) === 'pump2')
						) selectedPumpIdentities.add(String(descriptor?.identity || ''))
					}
				}
				const recoverableRelations = direction === 'undo'
					? recoverableMissingRelationSurges(payload.relations)
					: new Map()
				const replacementCells = direction === 'undo'
					? standaloneSurgeReplacementCells(payload.removals)
					: null
				for (const position of stablePayload.scopeCells) {
					const entity = entityAt(game, position)
					const ignoredAttachment = ignoredAttachmentCells.has(cellKey(position[0], position[1])) || (
						isPumpOwnedVanillaCube(entity, entity?.pump, paintCubeState) &&
						selectedPumpIdentities.has(String(entity?.pump ? ensureIdentity(entity.pump) : ''))
					)
					const ignoredDynamicCube = isDynamicOrdinaryStableCubeEntity(entity, paintCubeState) || (
						liveSuccessorCells.has(cellKey(position[0], position[1])) &&
						isRetainableLiveVanillaCubeEntity(entity, paintCubeState)
					)
					const ignoredStandaloneSurge = ignoredStandaloneSurgeCells.has(cellKey(position[0], position[1])) &&
						(!entity || !!captureReplaceableStandaloneSurge(entity))
					const ignoredTransient = ignoredAttachment || ignoredDynamicCube || ignoredStandaloneSurge
					const replaceableSurge = !!entity &&
						replacementCells?.has(cellKey(position[0], position[1])) &&
						!!captureReplaceableStandaloneSurge(entity)
					const recoverableRelation = !entity && !ignoredTransient
						? recoverableRelations.get(cellKey(position[0], position[1]))
						: null
					const identity = entity && !replaceableSurge && !ignoredTransient
						? ensureIdentity(entity)
						: recoverableRelation?.surge?.identity || null
					cells.push({
						u: position[0],
						v: position[1],
						identity
					})
					if (entity && !replaceableSurge && !ignoredTransient && !entities.has(identity)) {
						entities.set(identity, {
							identity,
							name: safeName(entity.name),
							position: normalizePosition(entity.position),
							span: nonNegativeInteger(entity.entitySpan, 0)
						})
					}
					if (recoverableRelation && !entities.has(identity)) {
						entities.set(identity, {
							identity,
							name: 'surge',
							position: clonePosition(recoverableRelation.surge.position),
							span: 0
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

			function createOperationContract(payload) {
				const baseline = new Map()
				for (const position of payload?.scopeCells || []) {
					baseline.set(
						cellKey(position[0], position[1]),
						describeContractOccupant(entityAt(game, position))
					)
				}
				return {
					baseline,
					journal: [],
					createdCells: new Set(),
					vacatedCells: new Set(),
					commitManifest: null
				}
			}

			function describeContractOccupant(entity) {
				if (!entity) return null
				const layer = contractEntityLayer(entity)
				const result = {
					identity: ensureIdentity(entity),
					name: safeName(entity.name),
					layer,
					position: normalizePosition(entity.position)
				}
				if (layer === 'attached-cube' && entity.pump) {
					result.pumpIdentity = ensureIdentity(entity.pump)
				}
				return result
			}

			function contractEntityLayer(entity) {
				const name = safeName(entity?.name)
				if (name === 'surge') return 'surge'
				if (name !== 'cube') return 'building'
				if (
					Object.prototype.hasOwnProperty.call(entity || {}, 'worldEditorPaint') ||
					(function () {
						try { return !!paintCubeState?.normalizePaint?.(entity) } catch (error) { return true }
					})()
				) return 'painted'
				if (isPumpOwnedVanillaCube(entity, entity?.pump, paintCubeState)) return 'attached-cube'
				return 'cube'
			}

			function recordContractMutation(state, kind, descriptor) {
				if (!state?.contract || !descriptor) return
				const cells = footprintCells(descriptor.footprint).map(function (position) {
					return cellKey(position[0], position[1])
				})
				if (kind === 'created') {
					for (const key of cells) state.contract.createdCells.add(key)
				} else if (kind === 'removed') {
					for (const key of cells) state.contract.vacatedCells.add(key)
				}
				state.contract.journal.push({
					kind,
					identity: String(descriptor.identity || ''),
					layer: normalizeRemovalLayer(descriptor.layer, descriptor),
					position: normalizePosition(descriptor.position),
					cells
				})
			}

			function contractBaseline(state, descriptor) {
				const position = normalizePosition(descriptor?.position)
				if (!position) return null
				return state?.contract?.baseline?.get?.(cellKey(position[0], position[1])) || null
			}

			function contractProbeDetails(state, descriptor, current, reason) {
				return {
					descriptor: {
						identity: String(descriptor?.identity || ''),
						name: safeName(descriptor?.name)
					},
					layer: normalizeRemovalLayer(descriptor?.layer, descriptor),
					position: normalizePosition(descriptor?.position),
					baselineOccupant: contractBaseline(state, descriptor),
					currentOccupant: describeContractOccupant(current),
					reason: String(reason || 'unknown')
				}
			}

			function resolveRedoDynamicCubeAbsence(descriptor) {
				const relocated = findEntityByIdentity(descriptor?.identity)
				const occupant = entityAt(game, descriptor?.position)
				const strictOccupant = !!occupant &&
					!isRetainableLiveVanillaCubeEntity(occupant, paintCubeState)
				return {
					allowed: !strictOccupant,
					relocated,
					occupant,
					reason: strictOccupant
						? 'strict-occupant'
						: relocated
							? 'relocated-recorded-cube'
							: occupant
								? 'dynamic-successor-retained'
								: 'disappeared'
				}
			}

			function redoDynamicCubeProbeDetails(descriptor, resolution) {
				const current = resolution?.relocated || resolution?.occupant || null
				return {
					descriptor: {
						identity: String(descriptor?.identity || ''),
						name: safeName(descriptor?.name)
					},
					layer: normalizeRemovalLayer(descriptor?.layer, descriptor),
					historicalPosition: normalizePosition(descriptor?.position),
					currentPosition: normalizePosition(current?.position),
					currentOccupant: describeContractOccupant(resolution?.occupant),
					liveCube: liveCubeProbeDetails(resolution?.occupant),
					relocatedEntity: resolution?.relocated && resolution.relocated !== resolution.occupant
						? describeContractOccupant(resolution.relocated)
						: null,
					relocatedCube: resolution?.relocated && resolution.relocated !== resolution.occupant
						? liveCubeProbeDetails(resolution.relocated)
						: null,
					reason: String(resolution?.reason || 'unknown')
				}
			}

			function liveCubeProbeDetails(entity) {
				if (!entity) return null
				const result = liveVanillaCubeClassification(entity, paintCubeState)
				result.pump = entity?.pump
					? {
						identity: ensureIdentity(entity.pump),
						name: safeName(entity.pump.name),
						position: normalizePosition(entity.pump.position),
						state: Number.isFinite(Number(entity.pump.state)) ? Number(entity.pump.state) : null
					}
					: null
				return result
			}

			function undoTransientOccupantProbeDetails(payload, originalPayload, descriptor, occupant) {
				const occupantIdentity = ensureIdentity(occupant)
				const actualRemovalIdentities = new Set((payload?.removals || []).map(function (entry) {
					return String(entry?.identity || '')
				}))
				const originalRemovalIdentities = new Set((originalPayload?.removals || []).map(function (entry) {
					return String(entry?.identity || '')
				}))
				return {
					direction: 'undo',
					origin: normalizeOrigin(payload?.origin),
					descriptor: {
						identity: String(descriptor?.identity || ''),
						name: safeName(descriptor?.name),
						layer: normalizeRemovalLayer(descriptor?.layer, descriptor),
						position: normalizePosition(descriptor?.position),
						footprint: jsonClone(descriptor?.footprint)
					},
					occupant: {
						identity: occupantIdentity,
						name: safeName(occupant?.name),
						layer: contractEntityLayer(occupant),
						position: normalizePosition(occupant?.position),
						state: Number.isFinite(Number(occupant?.state)) ? Number(occupant.state) : null,
						killme: occupant?.killme === true,
						pumpIdentity: occupant?.pump ? ensureIdentity(occupant.pump) : null
					},
					sameIdentity: occupantIdentity === String(descriptor?.identity || ''),
					occupantInActualRemovals: actualRemovalIdentities.has(occupantIdentity),
					occupantInOriginalRemovals: originalRemovalIdentities.has(occupantIdentity),
					liveCube: liveCubeProbeDetails(occupant)
				}
			}

			function undoOwnerBoundOrphanAllowed(payload, descriptor, entity) {
				if (normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'attached-cube') return false
				const pumpIdentity = String(descriptor?.pump?.identity || '')
				const ownerDescriptor = recordedPumpRemoval(payload, pumpIdentity)
				if (!ownerDescriptor || findExpectedEntity(ownerDescriptor)) return false
				const staleOwner = entity?.pump
				if (
					!isPumpEntity(staleOwner) ||
					game.stuff?.includes?.(staleOwner) ||
					ensureIdentity(staleOwner) !== pumpIdentity
				) return false
				return eligibleLateAttachedCube(entity, staleOwner)
			}

			function isDynamicRestorationDescriptor(descriptor) {
				return isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState) ||
					normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube'
			}

			function isVanillaLifecycleCubeEntity(entity) {
				const live = liveVanillaCubeClassification(entity, paintCubeState)
				return live.name === 'cube' &&
					(live.state === 0 || live.state === 1 || live.state === 2 || live.state === 3) &&
					live.resourcesValid &&
					!live.hasWorldEditorPaint &&
					!live.paint &&
					!live.paintError
			}

			function isTerminalVanillaCube(entity) {
				return entity?.killme === true || Number(entity?.state) === 3
			}

			function commitComparableSave(value) {
				const save = jsonClone(value)
				if (save?.par && typeof save.par === 'object') delete save.par.soul
				return save
			}

			function dynamicDescriptorMatchesCommit(entity, descriptor) {
				if (
					!entity ||
					ensureIdentity(entity) !== descriptor?.identity ||
					safeName(entity.name) !== safeName(descriptor?.name)
				) return false
				if (normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube') {
					const pump = findExpectedEntity(descriptor.pump)
					if (!pump || entity.pump !== pump) return false
				}
				try {
					return samePlain(
						commitComparableSave(captureDeletionEntitySave(entity, descriptor.layer)),
						commitComparableSave(descriptor.save)
					)
				} catch (error) {
					return false
				}
			}

			function dynamicReconciliationAuthorized(state, descriptor) {
				const baseline = contractBaseline(state, descriptor)
				return !baseline || baseline.layer === 'surge'
			}

			function transactionCreatedPump(state, pump) {
				if (!isPumpEntity(pump)) return false
				const identity = ensureIdentity(pump)
				return state.mutations.some(function (mutation) {
					return mutation.kind === 'created' &&
						mutation.descriptor?.identity === identity &&
						isPumpEntity(mutation.descriptor)
				})
			}

			function ownerBoundDynamicSuccessorAllowed(state, descriptor, entity) {
				if (
					normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'attached-cube' ||
					!isVanillaLifecycleCubeEntity(entity)
				) return false
				const pump = findExpectedEntity(descriptor.pump)
				return !!pump && entity?.pump === pump && transactionCreatedPump(state, pump)
			}

			function clearProvenanceDynamicEntity(state, descriptor, entity, event, reason) {
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(descriptor, state.relations)
				try {
					game.clearCell(entity.position)
				} finally {
					restoreTemporaryRelationGuards()
				}
				if (game.stuff?.includes?.(entity) || entityAt(game, entity.position) === entity) {
					throw deletionError('APPLY_FAILED', 'A dynamic Cube could not be cleared safely.')
				}
				state.contract.journal.push({
					kind: event,
					identity: ensureIdentity(entity),
					position: normalizePosition(descriptor.position),
					reason
				})
				traceProbe(event, contractProbeDetails(state, descriptor, entity, reason))
			}

			function resolveDynamicRestoration(state, mutation) {
				const descriptor = mutation.contractDescriptor || mutation.descriptor
				const current = entityAt(game, descriptor.position)
				const directExact = current && ensureIdentity(current) === descriptor.identity
					? current
					: null
				const exact = directExact || findEntityByIdentity(descriptor.identity)
				if (exact && exact !== current) {
					return { allowed: false, descriptor, current, reason: 'relocated-recorded-cube' }
				}
				if (exact) {
					return {
						allowed: isVanillaLifecycleCubeEntity(exact),
						descriptor,
						current: exact,
						exact: true,
						reason: isVanillaLifecycleCubeEntity(exact)
							? dynamicDescriptorMatchesCommit(exact, mutation.descriptor)
								? 'historical-exact'
								: 'dynamic-state-drift'
							: 'strict-occupant'
					}
				}
				if (!current) {
					return { allowed: true, descriptor, current: null, terminal: true, reason: 'natural-disappearance' }
				}
				const successorAllowed = dynamicReconciliationAuthorized(state, descriptor) &&
					ownerBoundDynamicSuccessorAllowed(state, descriptor, current)
				return {
					allowed: successorAllowed,
					descriptor,
					current,
					successor: successorAllowed,
					reason: successorAllowed ? 'owner-bound-successor' : 'strict-occupant'
				}
			}

			function captureCommittedDynamicDescriptor(descriptor, entity) {
				const expectedPump = normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube'
					? findExpectedEntity(descriptor.pump)
					: null
				const layer = expectedPump && entity?.pump === expectedPump
					? 'attached-cube'
					: 'cube'
				if (layer === 'cube' && Number(entity?.state) !== 2) return null
				const committed = Object.assign({}, descriptor, {
					layer,
					name: 'cube',
					position: clonePosition(entity.position),
					footprint: entityFootprint(entity, entity.position),
					save: captureDeletionEntitySave(entity, layer)
				})
				if (layer === 'attached-cube') committed.pump = captureAttachedPump(entity)
				else delete committed.pump
				return committed
			}

			function reconcileDynamicRestorations(state, mutations) {
				const targets = mutations || state.mutations.filter(function (mutation) {
					return mutation.kind === 'created' &&
						isDynamicRestorationDescriptor(mutation.contractDescriptor || mutation.descriptor)
				})
				for (const mutation of targets) {
					const resolution = resolveDynamicRestoration(state, mutation)
					if (!resolution.allowed) {
						traceProbe('contract.dynamic.denied', contractProbeDetails(
							state,
							resolution.descriptor,
							resolution.current,
							resolution.reason
						))
						throw deletionError('EXTERNAL_CHANGE', 'A dynamic Cube changed beyond the deletion contract.')
					}

					if (
						resolution.terminal ||
						isTerminalVanillaCube(resolution.current) ||
						(resolution.current && !captureCommittedDynamicDescriptor(resolution.descriptor, resolution.current))
					) {
						if (resolution.current) {
							clearProvenanceDynamicEntity(
								state,
								resolution.descriptor,
								resolution.current,
								'contract.dynamic.committed',
								'lifecycle-terminal'
							)
						} else {
							traceProbe('contract.dynamic.committed', contractProbeDetails(
								state,
								resolution.descriptor,
								null,
								resolution.reason
							))
						}
						mutation.committedDescriptor = null
						continue
					}

					if (resolution.successor) assignIdentity(resolution.current, resolution.descriptor.identity)
					const committed = captureCommittedDynamicDescriptor(resolution.descriptor, resolution.current)
					mutation.descriptor = committed
					mutation.committedDescriptor = committed
					if (resolution.reason !== 'historical-exact') {
						traceProbe('contract.dynamic.committed', contractProbeDetails(
							state,
							committed,
							resolution.current,
							resolution.reason
						))
					}
				}
			}

			function finalizeDynamicRestorationPayload(state) {
				const committedByIdentity = new Map()
				for (const mutation of state.mutations) {
					const contractDescriptor = mutation.contractDescriptor || mutation.descriptor
					if (mutation.kind !== 'created' || !isDynamicRestorationDescriptor(contractDescriptor)) continue
					committedByIdentity.set(contractDescriptor.identity, mutation.committedDescriptor || null)
				}
				const removals = []
				for (const descriptor of state.payload.removals) {
					if (!committedByIdentity.has(descriptor.identity)) removals.push(descriptor)
					else if (committedByIdentity.get(descriptor.identity)) removals.push(committedByIdentity.get(descriptor.identity))
				}
				state.payload = payloadWithActualRemovals(state.payload, removals)
				state.payload = payloadWithRestoredPumpCubeBaseline(state.payload)
				state.relations = state.payload.relations
			}

			function payloadWithRestoredPumpCubeBaseline(payload) {
				const pumpDescriptors = (payload?.removals || []).filter(function (descriptor) {
					return normalizeRemovalLayer(descriptor?.layer, descriptor) === 'building' &&
						(safeName(descriptor?.name) === 'pump' || safeName(descriptor?.name) === 'pump2')
				})
				if (!pumpDescriptors.length) return payload
				const restoredPumps = new Map()
				for (const descriptor of pumpDescriptors) {
					const pump = findExpectedEntity(descriptor)
					if (!isPumpEntity(pump)) continue
					restoredPumps.set(ensureIdentity(pump), pump)
				}
				const pumpCubeStates = createPumpCubeStates(game, restoredPumps.values(), ensureIdentity, paintCubeState)
				traceProbe('contract.undo.pump-cube-baseline-refreshed', {
					origin: normalizeOrigin(payload?.origin),
					expectedPumpCount: pumpDescriptors.length,
					restoredPumpCount: restoredPumps.size,
					beforeCount: normalizePumpCubeStates(payload?.pumpCubeStates).length,
					afterCount: pumpCubeStates.length
				})
				return deepFreeze(Object.assign({}, payload, { pumpCubeStates }))
			}

			function createDynamicCommitManifest(state) {
				const entries = new Map()
				if (state.direction === 'undo') {
					for (const mutation of state.mutations) {
						const contractDescriptor = mutation.contractDescriptor || mutation.descriptor
						if (mutation.kind !== 'created' || !isDynamicRestorationDescriptor(contractDescriptor)) continue
						const descriptor = mutation.committedDescriptor
						if (!descriptor) continue
						const entity = findExpectedEntity(descriptor)
						if (!entity || !dynamicDescriptorMatchesCommit(entity, descriptor)) {
							traceProbe('contract.verify.denied', contractProbeDetails(
								state,
								descriptor,
								entityAt(game, descriptor.position),
								'commit-manifest-mismatch'
							))
							throw deletionError('VERIFY_FAILED', 'A dynamic Cube could not be committed exactly.')
						}
						entries.set(descriptor.identity, {
							identity: descriptor.identity,
							name: safeName(entity.name),
							layer: normalizeRemovalLayer(descriptor.layer, descriptor),
							position: normalizePosition(entity.position),
							save: commitComparableSave(captureDeletionEntitySave(entity, descriptor.layer)),
							pumpIdentity: entity.pump ? ensureIdentity(entity.pump) : null
						})
					}
				}
				traceProbe('contract.commit-manifest.created', {
					direction: state.direction,
					dynamicCount: entries.size,
					journalCount: state.contract.journal.length
				})
				return { direction: state.direction, entries }
			}

			function verifyDynamicCommitManifest(state) {
				const manifest = state?.contract?.commitManifest
				if (!manifest || manifest.direction !== state.direction) {
					return denied('VERIFY_FAILED', 'The dynamic Cube commit manifest is unavailable.')
				}
				for (const expected of manifest.entries.values()) {
					const descriptor = expected
					const entity = findExpectedEntity(descriptor)
					let observedSave = null
					try {
						observedSave = entity
							? commitComparableSave(captureDeletionEntitySave(entity, descriptor.layer))
							: null
					} catch (error) {}
					const pumpIdentity = entity?.pump ? ensureIdentity(entity.pump) : null
					if (
						!entity ||
						ensureIdentity(entity) !== expected.identity ||
						safeName(entity.name) !== expected.name ||
						!samePlain(normalizePosition(entity.position), expected.position) ||
						!samePlain(observedSave, expected.save) ||
						pumpIdentity !== expected.pumpIdentity
					) {
						traceProbe('contract.verify.denied', contractProbeDetails(
							state,
							descriptor,
							entityAt(game, descriptor.position),
							'commit-manifest-changed'
						))
						return denied('VERIFY_FAILED', 'A dynamic Cube changed after deletion reconciliation.')
					}
				}
				return approved()
			}

			async function applyForward(context, record, state) {
				const payload = state.payload
				const resourceDelta = payload.economy.creative ? [] : payload.economy.delta
				const removals = removalApplyOrder(payload.removals, payload.relations)
				const actualRemovals = []
				state.pendingRemovals = new Map(removals.map(function (entry) {
					return [entry.identity, entry]
				}))
				for (let index = 0; index < removals.length; index += 1) {
					requireCurrent(context)
					const removal = removals[index]
					const outcome = removeExpectedEntity(removal, record.id, payload.relations, state)
					state.pendingRemovals.delete(removal.identity)
					if (outcome.skipped === true) {
						if ((index + 1) % APPLY_CHUNK_SIZE === 0) await yieldOperation(context)
						continue
					}
					const removed = outcome.removed
					actualRemovals.push(removed)
					state.removedSaves.set(removal.identity, removed.save)
					state.mutations.push({ kind: 'removed', descriptor: removed })
					recordContractMutation(state, 'removed', removed)
					rebasePendingConductorNeighbours(outcome.pendingConductorNeighbours, state)
					if ((index + 1) % APPLY_CHUNK_SIZE === 0) await yieldOperation(context)
				}
				reconcileLateAttachedCubeRemovals(state, actualRemovals)
				state.resourcesBefore = numericArray(game.resources)
				applyResourceMutation(state, resourceDelta)
				if (payload.statsDelta.machinesSold > 0) {
					applyStatsMutation(state, {
						machinesSold: state.statsBefore.machinesSold + payload.statsDelta.machinesSold,
						timeSinceLastDelete: 0
					})
				} else {
					state.statsAfter = captureStats(game)
				}
				applyOnlyoneMutation(state, payload.onlyOneKeys, payload.onlyonesAfter)
				state.payload = payloadWithActualRemovals(payload, actualRemovals)
				state.relations = state.payload.relations
			}

			function payloadWithActualRemovals(payload, removals) {
				return deepFreeze(Object.assign({}, payload, {
					removals: removals.slice().sort(compareDescriptors),
					scopeCells: mergeScopeCells(
						payload.scopeCells,
						collectScopeCells(removals, payload.relations)
					),
					ordinaryCubeStates: createOrdinaryCubeRuntimeStates({ removals }, paintCubeState),
					statsDelta: {
						machinesSold: removals.filter(isBuildingRemoval).length
					}
				}))
			}

			function mergeScopeCells(left, right) {
				const cells = new Map()
				for (const position of [].concat(left || [], right || [])) {
					const normalized = normalizePosition(position)
					if (!normalized) continue
					cells.set(cellKey(normalized[0], normalized[1]), normalized)
				}
				return Array.from(cells.values()).sort(comparePositions)
			}

			function describeRemovalDescriptor(descriptor) {
				return {
					identity: String(descriptor?.identity || ''),
					name: safeName(descriptor?.name),
					layer: normalizeRemovalLayer(descriptor?.layer, descriptor),
					position: normalizePosition(descriptor?.position),
					footprint: jsonClone(descriptor?.footprint),
					pumpIdentity: String(descriptor?.pump?.identity || '') || null
				}
			}

			function recordedPumpRemoval(payload, identity) {
				const expectedIdentity = String(identity || '')
				if (!expectedIdentity) return null
				return (payload?.removals || []).find(function (descriptor) {
					return isBuildingRemoval(descriptor) &&
						isPumpEntity(descriptor) &&
						String(descriptor?.identity || '') === expectedIdentity
				}) || null
			}

			function eligibleLateAttachedCube(entity, owner) {
				return isUnfinishedPumpCube(entity, owner) &&
					attachedCubeRemovalSafe(entity, owner, paintCubeState)
			}

			function sameOwnerCubeDisposition(entity, owner) {
				if (safeName(entity?.name) !== 'cube' || entity?.pump !== owner) return 'unrelated'
				if (ignorableSelectedPumpTerminalCube(
					entity,
					new Set([owner]),
					selectedPumpVicinityCells([owner]),
					paintCubeState
				)) return 'terminal'
				if (
					Number(entity?.state) === 2 &&
					entity?.killme !== true &&
					isRetainableLiveVanillaCubeEntity(entity, paintCubeState)
				) return 'retained-stable'
				return eligibleLateAttachedCube(entity, owner) ? 'eligible' : 'strict'
			}

			function attachedDescriptorAtPosition(removals, pumpIdentity, position) {
				return (removals || []).find(function (descriptor) {
					return normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube' &&
						String(descriptor?.pump?.identity || '') === String(pumpIdentity || '') &&
						footprintCells(descriptor.footprint).some(function (cell) {
							return sameCellPosition(cell, position)
						})
				}) || null
			}

			function ordinaryStableDescriptorAtPosition(removals, position) {
				return (removals || []).find(function (descriptor) {
					return isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState) &&
						footprintCells(descriptor.footprint).some(function (cell) {
							return sameCellPosition(cell, position)
						})
				}) || null
			}

			function removedMutation(state, identity) {
				return state.mutations.find(function (mutation) {
					return mutation.kind === 'removed' && mutation.descriptor?.identity === identity
				}) || null
			}

			function insertLateRemovalBeforeOwner(state, descriptor, ownerIdentity) {
				const ownerIndex = state.mutations.findIndex(function (mutation) {
					return mutation.kind === 'removed' &&
						mutation.descriptor?.identity === ownerIdentity &&
						isPumpEntity(mutation.descriptor)
				})
				if (ownerIndex < 0) {
					throw deletionError('APPLY_FAILED', 'A late attached Cube owner mutation was unavailable.')
				}
				state.mutations.splice(ownerIndex, 0, { kind: 'removed', descriptor })
				recordContractMutation(state, 'removed', descriptor)
			}

			function clearLateAttachedCube(state, descriptor, entity) {
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(descriptor, state.relations)
				try {
					game.clearCell(entity.position)
				} finally {
					restoreTemporaryRelationGuards()
				}
				if (game.stuff?.includes?.(entity) || entityAt(game, entity.position) === entity) {
					throw deletionError('APPLY_FAILED', 'A late attached Cube could not be cleared safely.')
				}
			}

			function reconcileLateAttachedCubeRemovals(state, actualRemovals) {
				for (const ownerEntry of state.removedPumpOwners.values()) {
					const candidates = (game.stuff || []).filter(function (entity) {
						return entity?.pump === ownerEntry.entity
					})
					for (const entity of candidates) {
						const disposition = sameOwnerCubeDisposition(entity, ownerEntry.entity)
						if (
							disposition === 'terminal' ||
							disposition === 'retained-stable' ||
							disposition === 'unrelated'
						) continue
						if (disposition !== 'eligible') {
							traceProbe('contract.forward.late-attached-cube-denied', {
								direction: state.direction,
								origin: normalizeOrigin(state.payload?.origin),
								owner: describeRemovalDescriptor(ownerEntry.descriptor),
								occupant: describeContractOccupant(entity),
								liveCube: liveCubeProbeDetails(entity)
							})
							throw deletionError('EXTERNAL_CHANGE', 'A late attached Cube is outside the live removal contract.')
						}

						const captured = captureRestorableEntity(entity, false, 'attached-cube')
						const historicalOrdinary = ordinaryStableDescriptorAtPosition(
							actualRemovals,
							captured.position
						)
						if (historicalOrdinary) {
							state.mutations.push({
								kind: 'discarded-transaction-vacancy-successor',
								descriptor: captured
							})
							clearLateAttachedCube(state, captured, entity)
							state.contract.journal.push({
								kind: 'transaction-vacancy-successor-suppressed',
								identity: captured.identity,
								ownerIdentity: ownerEntry.identity,
								position: clonePosition(captured.position),
								historicalIdentity: historicalOrdinary.identity
							})
							traceProbe('contract.forward.transaction-vacancy-cube-suppressed', {
								direction: state.direction,
								origin: normalizeOrigin(state.payload?.origin),
								position: clonePosition(captured.position),
								ownerIdentity: ownerEntry.identity,
								historical: describeRemovalDescriptor(historicalOrdinary),
								successor: describeRemovalDescriptor(captured),
								liveCube: liveCubeProbeDetails(entity)
							})
							continue
						}
						const historical = attachedDescriptorAtPosition(
							actualRemovals,
							ownerEntry.identity,
							captured.position
						)
						let committed = captured
						let event = 'contract.forward.late-attached-cube-added'
						if (historical) {
							committed = Object.assign({}, captured, {
								identity: historical.identity,
								pump: historical.pump,
								crossBoundary: historical.crossBoundary === true
							})
							const mutation = removedMutation(state, historical.identity)
							if (!mutation) {
								throw deletionError('APPLY_FAILED', 'A historical attached Cube mutation was unavailable.')
							}
							mutation.descriptor = committed
							const index = actualRemovals.indexOf(historical)
							if (index >= 0) actualRemovals[index] = committed
							event = 'contract.forward.late-attached-cube-rebased'
						} else {
							insertLateRemovalBeforeOwner(state, committed, ownerEntry.identity)
							actualRemovals.push(committed)
						}
						state.removedSaves.set(committed.identity, jsonClone(committed.save))
						clearLateAttachedCube(state, committed, entity)
						traceProbe(event, {
							direction: state.direction,
							origin: normalizeOrigin(state.payload?.origin),
							identity: committed.identity,
							ownerIdentity: ownerEntry.identity,
							position: clonePosition(committed.position),
							state: Number(entity.state),
							liveCube: liveCubeProbeDetails(entity)
						})
					}
				}
			}

			function removalApplyOrder(removals, relations) {
				const result = (removals || []).slice().sort(function (left, right) {
					const leftAttached = normalizeRemovalLayer(left?.layer, left) === 'attached-cube'
					const rightAttached = normalizeRemovalLayer(right?.layer, right) === 'attached-cube'
					return leftAttached === rightAttached ? 0 : leftAttached ? -1 : 1
				})
				for (const relation of relations || []) {
					if (!relation.removeStabilizer || !relation.removeSurge) continue
					const stabilizerIndex = result.findIndex(function (entry) {
						return entry.identity === relation.stabilizer.identity
					})
					const surgeIndex = result.findIndex(function (entry) {
						return entry.identity === relation.surge.identity
					})
					if (stabilizerIndex < 0 || surgeIndex < 0 || surgeIndex < stabilizerIndex) continue
					const surge = result.splice(surgeIndex, 1)[0]
					result.splice(stabilizerIndex, 0, surge)
				}
				return result
			}

			function captureUndoOwnerBoundOrphan(payload, descriptor, state) {
				if (normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'attached-cube') return null
				const entity = entityAt(game, descriptor.position)
				if (!entity || safeName(entity.name) !== 'cube') return null
				const pumpIdentity = String(descriptor?.pump?.identity || '')
				const ownerDescriptor = recordedPumpRemoval(payload, pumpIdentity)
				const restoredOwner = findExpectedEntity(descriptor.pump)
				const entityOwner = entity?.pump
				if (
					!ownerDescriptor ||
					!restoredOwner ||
					!transactionCreatedPump(state, restoredOwner) ||
					!isPumpEntity(entityOwner) ||
					ensureIdentity(entityOwner) !== pumpIdentity ||
					!eligibleLateAttachedCube(entity, entityOwner)
				) {
					return null
				}
				const displaced = captureRestorableEntity(entity, false, 'attached-cube')
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(displaced, state.relations)
				try {
					game.clearCell(entity.position)
				} finally {
					restoreTemporaryRelationGuards()
				}
				if (game.stuff?.includes?.(entity) || entityAt(game, entity.position) === entity) {
					throw deletionError('APPLY_FAILED', 'An owner-bound orphan Cube could not be displaced.')
				}
				state.mutations.push({ kind: 'displaced-attached-cube', descriptor: displaced })
				traceProbe('contract.undo.owner-bound-orphan-rebased', {
					direction: 'undo',
					origin: normalizeOrigin(payload?.origin),
					descriptor: describeRemovalDescriptor(descriptor),
					occupant: describeRemovalDescriptor(displaced),
					liveCube: liveCubeProbeDetails(entity)
				})
				return displaced.save
			}

			function clearUndoTransactionPumpSuccessor(payload, descriptor, state) {
				if (!isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState)) return false
				const entity = entityAt(game, descriptor.position)
				if (!entity || findEntityByIdentity(descriptor.identity)) return false
				const pump = entity?.pump
				const pumpIdentity = isPumpEntity(pump) ? ensureIdentity(pump) : ''
				const pumpDescriptor = recordedPumpRemoval(payload, pumpIdentity)
				if (
					!pumpDescriptor ||
					findExpectedEntity(pumpDescriptor) !== pump ||
					!transactionCreatedPump(state, pump) ||
					!eligibleLateAttachedCube(entity, pump) ||
					!dynamicReconciliationAuthorized(state, descriptor)
				) return false

				const identity = ensureIdentity(entity)
				if ((payload?.removals || []).some(function (removal) {
					return removal?.identity === identity
				})) return false

				const displaced = captureRestorableEntity(entity, false, 'attached-cube')
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(displaced, state.relations)
				let clearError = null
				try {
					game.clearCell(entity.position)
				} catch (error) {
					clearError = error
				} finally {
					restoreTemporaryRelationGuards()
				}
				const stillPresent = game.stuff?.includes?.(entity) || entityAt(game, entity.position) === entity
				if (clearError) throw clearError
				if (stillPresent) {
					throw deletionError('APPLY_FAILED', 'A transaction-created Pump Cube could not be cleared for restoration.')
				}

				state.contract.journal.push({
					kind: 'undo-owner-bound-successor-rebased',
					identity,
					ownerIdentity: pumpIdentity,
					position: normalizePosition(entity.position)
				})
				traceProbe('contract.undo.owner-bound-successor-rebased', {
					direction: 'undo',
					origin: normalizeOrigin(payload?.origin),
					descriptor: describeRemovalDescriptor(descriptor),
					occupant: describeRemovalDescriptor(displaced),
					baselineOccupant: contractBaseline(state, descriptor),
					owner: describeRemovalDescriptor(pumpDescriptor),
					liveCube: liveCubeProbeDetails(entity)
				})
				return true
			}

			function undoTransactionPumpSuccessorDenialDetails(payload, descriptor, state, entity) {
				const historicalIdentityOccupant = findEntityByIdentity(descriptor?.identity)
				const owner = entity?.pump
				const ownerIsPump = isPumpEntity(owner)
				const ownerIdentity = ownerIsPump ? ensureIdentity(owner) : ''
				const ownerDescriptor = recordedPumpRemoval(payload, ownerIdentity)
				const expectedOwner = ownerDescriptor ? findExpectedEntity(ownerDescriptor) : null
				const occupantIdentity = entity ? ensureIdentity(entity) : ''
				const occupantInRemovals = !!occupantIdentity && (payload?.removals || []).some(function (removal) {
					return String(removal?.identity || '') === occupantIdentity
				})
				const gates = {
					historicalTargetEligible: isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState),
					occupantPresent: !!entity,
					historicalIdentityAbsent: !historicalIdentityOccupant,
					ownerIsPump,
					ownerRecorded: !!ownerDescriptor,
					ownerAtHistoricalPosition: !!ownerDescriptor && expectedOwner === owner,
					ownerCreatedByTransaction: transactionCreatedPump(state, owner),
					occupantUnfinished: isUnfinishedPumpCube(entity, owner),
					occupantRemovalSafe: attachedCubeRemovalSafe(entity, owner, paintCubeState),
					baselineAuthorized: dynamicReconciliationAuthorized(state, descriptor),
					occupantNotInRemovals: !occupantInRemovals
				}
				const failedGates = Object.keys(gates).filter(function (gate) {
					return gates[gate] !== true
				})
				return {
					direction: String(state?.direction || 'undo'),
					origin: normalizeOrigin(payload?.origin),
					descriptor: describeRemovalDescriptor(descriptor),
					occupant: describeContractOccupant(entity),
					liveCube: liveCubeProbeDetails(entity),
					baselineOccupant: contractBaseline(state, descriptor),
					identityProvenance: {
						historicalIdentity: String(descriptor?.identity || ''),
						historicalIdentityOccupant: describeContractOccupant(historicalIdentityOccupant),
						occupantIdentity,
						occupantInRemovals
					},
					owner: {
						live: describeContractOccupant(owner),
						recorded: ownerDescriptor ? describeRemovalDescriptor(ownerDescriptor) : null,
						expected: describeContractOccupant(expectedOwner)
					},
					gates,
					failedGates,
					removalCount: (payload?.removals || []).length,
					priorOwnerBoundRebaseCount: (state?.contract?.journal || []).filter(function (entry) {
						return entry?.kind === 'undo-owner-bound-successor-rebased'
					}).length
				}
			}

			async function applyUndo(context, record, state) {
				const payload = state.payload
				const resourceDelta = payload.economy.creative ? [] : negateArray(payload.economy.delta)
				const saved = transactionData.get(record.id)
				restoreMissingRelationSurges(payload.relations, state)
				const removals = restorationApplyOrder(payload.removals)
				const dynamicBatch = []
				let strictProcessed = 0
				let relationsRestored = false
				for (let index = 0; index < removals.length; index += 1) {
					requireCurrent(context)
					const removal = removals[index]
					const dynamic = isDynamicRestorationDescriptor(removal)
					if (dynamic && !relationsRestored) {
						restoreRecordedRelations(payload.relations)
						relationsRestored = true
					}
					const ownerBoundOrphanSave = captureUndoOwnerBoundOrphan(payload, removal, state)
					clearUndoTransactionPumpSuccessor(payload, removal, state)
					displaceStandaloneSurges(removal, state)
					const descriptor = Object.assign({}, removal, {
						save: jsonClone(
							ownerBoundOrphanSave ||
							saved?.removalSaves?.get(removal.identity) ||
							removal.save
						)
					})
					addExpectedEntity(descriptor, payload.relations, state)
					const mutation = {
						kind: 'created',
						descriptor,
						contractDescriptor: descriptor,
						committedDescriptor: dynamic ? descriptor : undefined
					}
					state.mutations.push(mutation)
					recordContractMutation(state, 'created', descriptor)
					if (dynamic) {
						dynamicBatch.push(mutation)
						if (dynamicBatch.length >= APPLY_CHUNK_SIZE) {
							reconcileDynamicRestorations(state, dynamicBatch)
							dynamicBatch.length = 0
							await yieldOperation(context)
						}
					} else {
						strictProcessed += 1
						if (strictProcessed % APPLY_CHUNK_SIZE === 0) await yieldOperation(context)
					}
				}
				if (!relationsRestored) restoreRecordedRelations(payload.relations)
				if (dynamicBatch.length) reconcileDynamicRestorations(state, dynamicBatch)
				reconcileDynamicRestorations(state)
				finalizeDynamicRestorationPayload(state)
				state.resourcesBefore = numericArray(game.resources)
				applyResourceMutation(state, resourceDelta)
				if (payload.statsDelta.machinesSold > 0) {
					applyStatsMutation(state, {
						machinesSold: state.statsBefore.machinesSold - payload.statsDelta.machinesSold,
						timeSinceLastDelete: saved?.timeSinceLastDelete ?? state.statsBefore.timeSinceLastDelete
					})
				} else {
					state.statsAfter = captureStats(game)
				}
				applyOnlyoneMutation(state, payload.onlyOneKeys, payload.onlyonesBefore)
			}

			function restorationApplyOrder(removals) {
				const result = (removals || []).slice()
				const strict = result.filter(function (descriptor) {
					return !isDynamicRestorationDescriptor(descriptor)
				})
				const dynamic = result.filter(isDynamicRestorationDescriptor)
				return strict.concat(dynamic)
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

			function removeExpectedEntity(descriptor, recordId, relations, state) {
				const entity = findExpectedEntity(descriptor)
				const dynamicOrdinaryCube = isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState)
				traceProbe('apply.clear.before', {
					name: descriptor.name,
					position: descriptor.position,
					identityMatch: !!entity && ensureIdentity(entity) === descriptor.identity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				if (!entity && dynamicOrdinaryCube) {
					const resolution = resolveRedoDynamicCubeAbsence(descriptor)
					if (state.direction === 'redo') {
						traceProbe(
							resolution.allowed
								? 'contract.redo.dynamic-cube-skipped'
								: 'contract.redo.dynamic-cube-denied',
							redoDynamicCubeProbeDetails(descriptor, resolution)
						)
						if (!resolution.allowed) {
							throw deletionError('EXTERNAL_CHANGE', 'A dynamic Cube historical cell has a strict occupant.')
						}
						return { skipped: true, removed: null, pendingConductorNeighbours: [] }
					}
					if (resolution.relocated || !resolution.allowed) {
						throw deletionError('EXTERNAL_CHANGE', 'A dynamic Cube changed beyond its live removal contract.')
					}
					traceProbe('apply.dynamic-cube-skipped', {
						name: descriptor.name,
						position: descriptor.position,
						reason: resolution.occupant ? 'replaced-by-dynamic-cube' : 'disappeared'
					})
					return { skipped: true, removed: null, pendingConductorNeighbours: [] }
				}
				if (!entity || ensureIdentity(entity) !== descriptor.identity) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion target entity changed.')
				}
				if (
					normalizeRemovalLayer(descriptor?.layer, descriptor) === 'surge' &&
					!recordedSurgeRemovalSafe({ relations }, descriptor, entity)
				) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion Surge became unsafe before removal.')
				}
				const save = captureDeletionEntitySave(entity, descriptor.layer)
				const redoAttachedCube = state.direction === 'redo' &&
					normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube'
				const expectedSave = redoAttachedCube
					? descriptor?.save
					: expectedRemovalSave(recordId, descriptor, state)
				const saveMatches = redoAttachedCube
					? recordedAttachedCubeSafe(descriptor, entity)
					: dynamicOrdinaryCube
					? isDynamicOrdinaryStableCubeEntity(entity, paintCubeState) &&
						samePlain(
							dynamicOrdinaryCubeComparableSave(save, descriptor),
							dynamicOrdinaryCubeComparableSave(expectedSave, descriptor)
						)
					: matchesDeletionSave(save, expectedSave, descriptor, paintCubeState)
				if (!saveMatches) {
					throw deletionError('EXTERNAL_CHANGE', 'A deletion target state changed.')
				}
				const pendingConductorNeighbours = capturePendingConductorNeighbours(
					entity,
					recordId,
					state
				)
				const removalSave = state?.ownedRebasedIdentities?.has?.(descriptor.identity)
					? state.ownedOriginalSaves.get(descriptor.identity) || save
					: save
				const removed = Object.assign({}, descriptor, {
					name: safeName(entity.name),
					position: clonePosition(entity.position),
					footprint: entityFootprint(entity, entity.position),
					save: jsonClone(removalSave)
				})
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(descriptor, relations)
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
				} finally {
					restoreTemporaryRelationGuards()
				}
				const remaining = findExpectedEntity(descriptor)
				traceProbe('apply.clear.after', {
					name: descriptor.name,
					position: descriptor.position,
					remaining: !!remaining,
					remainingName: safeName(remaining?.name),
					sameEntityRemaining: remaining === entity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				if (isBuildingRemoval(descriptor) && isPumpEntity(entity)) {
					state.removedPumpOwners.set(descriptor.identity, {
						identity: descriptor.identity,
						entity,
						descriptor: removed
					})
				}
				return { removed, pendingConductorNeighbours }
			}

			function capturePendingConductorNeighbours(entity, recordId, state) {
				if (!state?.pendingRemovals || typeof entity?.getNeighbours !== 'function') return []
				const result = []
				const seen = new Set()
				for (const candidate of entity.getNeighbours() || []) {
					if (!candidate || safeName(candidate.name) !== 'conductor') continue
					const identity = ensureIdentity(candidate)
					if (seen.has(identity)) continue
					seen.add(identity)
					const descriptor = state.pendingRemovals.get(identity)
					if (!descriptor || safeName(descriptor.name) !== 'conductor') continue
					if (findExpectedEntity(descriptor) !== candidate) {
						throw deletionError('EXTERNAL_CHANGE', 'A pending Conductor changed before neighbour refresh.')
					}
					const beforeSave = captureDeletionEntitySave(candidate, descriptor.layer)
					const expectedSave = expectedRemovalSave(recordId, descriptor, state)
					if (!matchesDeletionSave(beforeSave, expectedSave, descriptor, paintCubeState)) {
						throw deletionError('EXTERNAL_CHANGE', 'A pending Conductor state changed before neighbour refresh.')
					}
					if (!state.ownedOriginalSaves.has(identity)) {
						state.ownedOriginalSaves.set(identity, jsonClone(beforeSave))
					}
					result.push({ descriptor, entity: candidate, beforeSave })
				}
				return result
			}

			function rebasePendingConductorNeighbours(entries, state) {
				for (const entry of entries || []) {
					const descriptor = entry.descriptor
					const current = findExpectedEntity(descriptor)
					if (current !== entry.entity) {
						throw deletionError('EXTERNAL_CHANGE', 'A pending Conductor changed during neighbour refresh.')
					}
					const afterSave = captureDeletionEntitySave(current, descriptor.layer)
					const comparison = compareOwnedConductorVariantChange(entry.beforeSave, afterSave, descriptor)
					if (!comparison.ok) {
						throw deletionError('EXTERNAL_CHANGE', 'A pending Conductor changed beyond its derived variant.')
					}
					state.rollingExpectedSaves.set(descriptor.identity, jsonClone(afterSave))
					if (!comparison.changed) continue
					state.ownedRebasedIdentities.add(descriptor.identity)
					traceProbe('apply.conductor-variant-rebased', {
						name: descriptor.name,
						position: descriptor.position,
						before: entry.beforeSave?.par?.variant,
						after: afterSave?.par?.variant
					})
				}
			}

			function compareOwnedConductorVariantChange(before, after, descriptor) {
				if (sameDeletionSave(before, after, descriptor)) return { ok: true, changed: false }
				if (
					safeName(descriptor?.name) !== 'conductor' ||
					normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'building' ||
					!before?.par ||
					!after?.par ||
					!Object.prototype.hasOwnProperty.call(before.par, 'variant') ||
					!Object.prototype.hasOwnProperty.call(after.par, 'variant') ||
					typeof before.par.variant !== 'number' ||
					typeof after.par.variant !== 'number'
				) return { ok: false, changed: false }
				const beforeVariant = before.par.variant
				const afterVariant = after.par.variant
				if (
					!Number.isFinite(beforeVariant) ||
					!Number.isFinite(afterVariant) ||
					beforeVariant < 0 ||
					beforeVariant > 1 ||
					afterVariant < 0 ||
					afterVariant > 1
				) return { ok: false, changed: false }
				const comparableBefore = comparableDeletionSave(before, descriptor)
				const comparableAfter = comparableDeletionSave(after, descriptor)
				comparableBefore.par.variant = 'owned-conductor-variant'
				comparableAfter.par.variant = 'owned-conductor-variant'
				return {
					ok: samePlain(comparableBefore, comparableAfter),
					changed: beforeVariant !== afterVariant
				}
			}

			function prepareRelationRemovalGuards(descriptor, relations) {
				const relation = (relations || []).find(function (entry) {
					if (isStabilizerName(descriptor?.name)) {
						return entry?.removeStabilizer === true &&
							entry?.stabilizer?.identity === descriptor?.identity
					}
					return safeName(descriptor?.name) === 'surge' &&
						entry?.removeSurge === true &&
						entry?.surge?.identity === descriptor?.identity
				})
				if (!relation || relation.removeStabilizer === relation.removeSurge) return function () {}
				const stabilizer = findExpectedEntity(relation.stabilizer)
				const surge = findExpectedEntity(relation.surge)
				if (
					!stabilizer ||
					!surge ||
					stabilizer.surge !== surge ||
					surge.stabilizer !== stabilizer
				) {
					throw deletionError('EXTERNAL_CHANGE', 'A stabilizer relationship changed outside World Editor.')
				}
				if (relation.removeStabilizer) {
					return reserveSurgeDuringRelationChange(
						surge,
						relation.stabilizer.position,
						stabilizer,
						'A stabilizer relationship changed outside World Editor.'
					)
				}
				return shieldCompetingSurges(stabilizer, surge, relation.surge.position)
			}

			function reserveSurgeDuringRelationChange(surge, position, allowedStabilizer, message, options) {
				const expectedReservation = options?.allowExpectedReservation === true &&
					hasExpectedSurgeReservation(surge, position)
				if (
					!surge ||
					(hasActiveSurgeStabilizer(surge.stabilizer) && surge.stabilizer !== allowedStabilizer) ||
					(hasSurgeStabilizerReservation(surge.stabilizerPosition) && !expectedReservation)
				) throw deletionError('EXTERNAL_CHANGE', message)
				surge.stabilizerPosition = clonePosition(position)
				let released = false
				return function () {
					if (released) return
					released = true
					if (hasExpectedSurgeReservation(surge, position)) delete surge.stabilizerPosition
				}
			}

			function shieldCompetingSurges(stabilizer, removedSurge, shieldPosition) {
				const neighbours = typeof stabilizer?.getNeighbours === 'function'
					? stabilizer.getNeighbours()
					: []
				const held = []
				const seen = new Set()
				for (const candidate of Array.isArray(neighbours) ? neighbours : []) {
					if (
						!candidate ||
						candidate === removedSurge ||
						seen.has(candidate) ||
						safeName(candidate.name) !== 'surge' ||
						hasActiveSurgeStabilizer(candidate.stabilizer) ||
						candidate.harvestProgression
					) continue
					seen.add(candidate)
					const reservation = normalizePosition(candidate.stabilizerPosition)
					if (
						candidate.stabilizerPosition &&
						(!reservation || !sameCellPosition(reservation, stabilizer.position))
					) continue
					held.push({
						entity: candidate,
						hadOwn: Object.prototype.hasOwnProperty.call(candidate, 'stabilizerPosition'),
						value: jsonClone(candidate.stabilizerPosition)
					})
					candidate.stabilizerPosition = clonePosition(shieldPosition)
				}
				let restored = false
				return function () {
					if (restored) return
					restored = true
					for (let index = held.length - 1; index >= 0; index -= 1) {
						const entry = held[index]
						if (entry.hadOwn) entry.entity.stabilizerPosition = entry.value
						else delete entry.entity.stabilizerPosition
					}
				}
			}

			function expectedRemovalSave(recordId, descriptor, state) {
				return state?.rollingExpectedSaves?.get?.(descriptor?.identity) ||
					transactionData.get(recordId)?.removalSaves?.get(descriptor?.identity) ||
					descriptor?.save
			}

			function expectedRecordedTargetSave(recordId, descriptor, direction) {
				if (
					direction === 'redo' &&
					normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube'
				) return descriptor?.save
				return expectedRemovalSave(recordId, descriptor)
			}

			function addExpectedEntity(descriptor, relations, state) {
				const layer = normalizeRemovalLayer(descriptor?.layer, descriptor)
				if (isBuildingRemoval(descriptor) || layer === 'attached-cube') {
					assertFootprintEmpty(game, descriptor.footprint)
				}
				else if (findExpectedEntity(descriptor)) {
					throw deletionError('EXTERNAL_CHANGE', 'A transient deletion target is no longer empty.')
				}
				if (safeName(descriptor?.name) === 'stabilizer3' && shatteredStabilizerCount(game) > 0) {
					throw deletionError('EXTERNAL_CHANGE', 'Another shattered stabilizer already exists.')
				}
				const restoreTemporaryRelationGuards = prepareRelationRestoreGuards(descriptor, relations, state)
				let entity
				try {
					if (layer === 'attached-cube') {
						const pump = findExpectedEntity(descriptor.pump)
						if (!pump) throw deletionError('EXTERNAL_CHANGE', 'An attached Cube owner was not restored.')
						entity = restoreAttachedCubeSave(game, descriptor.save, pump)
					} else {
						entity = restoreEntitySave(game, descriptor.save)
					}
				} finally {
					restoreTemporaryRelationGuards()
				}
				if (!entity) throw deletionError('APPLY_FAILED', 'A deleted building could not be restored.')
				assignIdentity(entity, descriptor.identity)
				return entity
			}

			function prepareRelationRestoreGuards(descriptor, relations, state) {
				if (isStabilizerName(descriptor?.name)) {
					const relation = (relations || []).find(function (entry) {
						return entry?.removeStabilizer === true &&
							entry?.removeSurge !== true &&
							entry?.stabilizer?.identity === descriptor?.identity
					})
					if (!relation) return function () {}
					const surge = findExpectedEntity(relation.surge)
					return reserveSurgeDuringRelationChange(
						surge,
						relation.stabilizer.position,
						null,
						'A surviving Surge changed outside World Editor.',
						{
							allowExpectedReservation: state?.recreatedRelationSurges?.has?.(
								relation.surge.identity
							) === true
						}
					)
				}
				if (safeName(descriptor?.name) !== 'surge') return function () {}
				const relation = (relations || []).find(function (entry) {
					return entry?.removeSurge === true &&
						entry?.removeStabilizer !== true &&
						entry?.surge?.identity === descriptor?.identity
				})
				if (!relation) return function () {}
				const stabilizer = findExpectedEntity(relation.stabilizer)
				if (!stabilizer || hasActiveSurgeStabilizer(stabilizer.surge)) {
					throw deletionError('EXTERNAL_CHANGE', 'A surviving stabilizer changed outside World Editor.')
				}
				return shieldCompetingSurges(stabilizer, null, relation.surge.position)
			}

			function restoreRecordedRelations(relations) {
				for (const relation of relations || []) {
					const stabilizer = findExpectedEntity(relation.stabilizer)
					const surge = findExpectedEntity(relation.surge)
					if (!stabilizer || !surge) {
						throw deletionError('EXTERNAL_CHANGE', 'A stabilizer relationship endpoint changed outside World Editor.')
					}
					if (
						(hasActiveSurgeStabilizer(stabilizer.surge) && stabilizer.surge !== surge) ||
						(hasActiveSurgeStabilizer(surge.stabilizer) && surge.stabilizer !== stabilizer)
					) throw deletionError('EXTERNAL_CHANGE', 'A stabilizer relationship endpoint was connected elsewhere.')
					stabilizer.surge = surge
					surge.stabilizer = stabilizer
					if (Object.prototype.hasOwnProperty.call(surge, 'stabilizerPosition')) delete surge.stabilizerPosition
					stabilizer.initSurgePower?.()
				}
			}

			function restoreMissingRelationSurges(relations, state) {
				for (const relation of relations || []) {
					if (!recoverableMissingRelationSurge(relation)) continue
					const descriptor = {
						identity: relation.surge.identity,
						layer: 'surge',
						name: 'surge',
						position: clonePosition(relation.surge.position),
						footprint: {
							span: 0,
							minU: relation.surge.position[0],
							maxU: relation.surge.position[0],
							minV: relation.surge.position[1],
							maxV: relation.surge.position[1]
						},
						save: jsonClone(relation.surgeSave)
					}
					addExpectedEntity(descriptor, relations, state)
					state.mutations.push({ kind: 'created', descriptor })
					state.recreatedRelationSurges.add(relation.surge.identity)
				}
			}

			function allowsStandaloneSurgeReplacement(descriptor) {
				const layer = normalizeRemovalLayer(descriptor?.layer, descriptor)
				return layer === 'building' || layer === 'cube' || layer === 'painted' || layer === 'attached-cube'
			}

			function standaloneSurgeReplacementCells(removals) {
				const cells = new Set()
				for (const descriptor of removals || []) {
					if (!allowsStandaloneSurgeReplacement(descriptor)) continue
					for (const position of footprintCells(descriptor.footprint)) {
						cells.add(cellKey(position[0], position[1]))
					}
				}
				return cells
			}

			function captureReplaceableStandaloneSurge(entity) {
				if (
					safeName(entity?.name) !== 'surge' ||
					nonNegativeInteger(entity?.entitySpan, 0) !== 0 ||
					hasActiveSurgeStabilizer(entity?.stabilizer) ||
					hasSurgeStabilizerReservation(entity?.stabilizerPosition) ||
					!transientRemovalSafe(game, entity, 'surge', blueprintState)
				) return null
				try {
					const save = captureEntitySave(game, entity)
					if (hasSurgeStabilizerReservation(save?.par?.stabilizerPosition)) return null
					return save
				} catch (error) {
					return null
				}
			}

			function hasActiveSurgeStabilizer(value) {
				return value !== undefined && value !== null && value !== false
			}

			function hasSurgeStabilizerReservation(value) {
				return value !== undefined && value !== null
			}

			function hasExpectedSurgeReservation(surge, position) {
				const reservation = normalizePosition(surge?.stabilizerPosition)
				return !!reservation && sameCellPosition(reservation, position)
			}

			function sameCellPosition(left, right) {
				const normalizedLeft = normalizePosition(left)
				const normalizedRight = normalizePosition(right)
				return !!normalizedLeft && !!normalizedRight &&
					normalizedLeft[0] === normalizedRight[0] &&
					normalizedLeft[1] === normalizedRight[1]
			}

			function displaceStandaloneSurges(descriptor, state) {
				if (!allowsStandaloneSurgeReplacement(descriptor)) return
				for (const position of footprintCells(descriptor.footprint)) {
					const entity = entityAt(game, position)
					if (!entity) continue
					const save = captureReplaceableStandaloneSurge(entity)
					if (!save) {
						traceProbe(
							'contract.undo.restoration-occupant-denied',
							undoTransactionPumpSuccessorDenialDetails(state.payload, descriptor, state, entity)
						)
						throw deletionError('EXTERNAL_CHANGE', 'A deletion restoration target changed outside World Editor.')
					}
					const displaced = {
						identity: ensureIdentity(entity),
						layer: 'surge',
						name: 'surge',
						position: clonePosition(entity.position),
						footprint: entityFootprint(entity, entity.position),
						save
					}
					let clearError = null
					try {
						game.clearCell(entity.position)
					} catch (error) {
						clearError = error
					}
					const stillPresent = game.stuff?.includes?.(entity) ||
						footprintCells(displaced.footprint).some(function (cell) {
							return entityAt(game, cell) === entity
						})
					if (!stillPresent) state.mutations.push({ kind: 'displaced-surge', descriptor: displaced })
					if (clearError) throw clearError
					if (stillPresent) {
						throw deletionError('APPLY_FAILED', 'A standalone Surge could not be cleared for restoration.')
					}
				}
			}

			function restoreDisplacedSurge(descriptor) {
				assertFootprintEmpty(game, descriptor.footprint)
				const entity = restoreEntitySave(game, descriptor.save)
				if (!entity || safeName(entity.name) !== 'surge') {
					throw deletionError('ROLLBACK_FAILED', 'A displaced standalone Surge could not be restored.')
				}
				assignIdentity(entity, descriptor.identity)
			}

			function restoreDisplacedAttachedCube(descriptor, state) {
				if (findExpectedEntity(descriptor)) return
				addExpectedEntity(descriptor, state.relations, state)
			}

			function rollbackDiscardedTransactionVacancySuccessor(state, descriptor) {
				const exact = findEntityByIdentity(descriptor?.identity)
				if (!exact) return
				const ownerIdentity = String(descriptor?.pump?.identity || '')
				if (
					!isVanillaLifecycleCubeEntity(exact) ||
					entityAt(game, exact.position) !== exact ||
					!isPumpEntity(exact.pump) ||
					ensureIdentity(exact.pump) !== ownerIdentity
				) {
					traceProbe('contract.rollback.transaction-vacancy-cube-denied', {
						direction: state.direction,
						descriptor: describeRemovalDescriptor(descriptor),
						occupant: describeContractOccupant(exact),
						liveCube: liveCubeProbeDetails(exact)
					})
					throw deletionError('ROLLBACK_FAILED', 'A transaction-vacancy Cube changed before rollback.')
				}
				const currentDescriptor = Object.assign({}, descriptor, {
					position: clonePosition(exact.position),
					footprint: entityFootprint(exact, exact.position)
				})
				const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(
					currentDescriptor,
					state.relations
				)
				try {
					game.clearCell(exact.position)
				} finally {
					restoreTemporaryRelationGuards()
				}
				if (game.stuff?.includes?.(exact) || entityAt(game, exact.position) === exact) {
					throw deletionError('ROLLBACK_FAILED', 'A transaction-vacancy Cube could not be cleared during rollback.')
				}
				traceProbe('contract.rollback.transaction-vacancy-cube-cleared', {
					direction: state.direction,
					descriptor: describeRemovalDescriptor(descriptor),
					position: clonePosition(exact.position)
				})
			}

			function rollbackPumpOwnedByTransaction(state, pump) {
				if (!isPumpEntity(pump)) return false
				const identity = ensureIdentity(pump)
				return state.mutations.some(function (mutation) {
					return (mutation.kind === 'created' || mutation.kind === 'removed') &&
						mutation.descriptor?.identity === identity &&
						isPumpEntity(mutation.descriptor)
				})
			}

			function rollbackOwnerBoundOccupant(state, descriptor, entity) {
				if (
					normalizeRemovalLayer(descriptor?.layer, descriptor) !== 'attached-cube' ||
					safeName(entity?.name) !== 'cube'
				) return false
				const position = normalizePosition(entity?.position)
				if (!position || !footprintCells(descriptor.footprint).some(function (cell) {
					return sameCellPosition(cell, position)
				})) return false
				const restoredPump = findExpectedEntity(descriptor.pump)
				const stalePump = entity?.pump
				if (
					!restoredPump ||
					!rollbackPumpOwnedByTransaction(state, restoredPump) ||
					!isPumpEntity(stalePump) ||
					ensureIdentity(stalePump) !== String(descriptor?.pump?.identity || '')
				) return false
				if (entity.pump !== restoredPump) entity.pump = restoredPump
				traceProbe('contract.rollback.owner-bound-orphan-rebound', {
					direction: state.direction,
					descriptor: describeRemovalDescriptor(descriptor),
					occupant: describeContractOccupant(entity)
				})
				return true
			}

			function rollbackDynamicEntityAllowed(state, descriptor, entity) {
				if (!isVanillaLifecycleCubeEntity(entity)) return false
				const position = normalizePosition(entity?.position)
				if (!position || !footprintCells(descriptor?.footprint).some(function (cell) {
					return cell[0] === position[0] && cell[1] === position[1]
				})) return false
				if (!isDynamicRestorationDescriptor(descriptor)) return true
				if (ensureIdentity(entity) === descriptor?.identity) return true
				return !findEntityByIdentity(descriptor?.identity) &&
					ownerBoundDynamicSuccessorAllowed(state, descriptor, entity)
			}

			function clearRollbackDynamicEntity(state, descriptor, entity, reason) {
				if (!rollbackDynamicEntityAllowed(state, descriptor, entity)) {
					traceProbe('contract.rollback.denied', contractProbeDetails(
						state,
						descriptor,
						entity,
						'strict-occupant'
					))
					throw deletionError('ROLLBACK_FAILED', 'A rollback target was occupied by a strict entity.')
				}
				game.clearCell(entity.position)
				if (game.stuff?.includes?.(entity) || entityAt(game, entity.position) === entity) {
					throw deletionError('ROLLBACK_FAILED', 'A live Cube could not be removed during rollback.')
				}
				state.contract.journal.push({
					kind: 'rollback-dynamic-compensation',
					identity: ensureIdentity(entity),
					position: normalizePosition(entity.position),
					reason
				})
				traceProbe(
					'contract.rollback.dynamic-compensated',
					contractProbeDetails(state, descriptor, entity, reason)
				)
			}

			function rollbackCellAuthorized(state, descriptor, position, kind) {
				const key = cellKey(position[0], position[1])
				const baseline = state.contract.baseline.get(key) || null
				if (kind === 'created') {
					return state.contract.createdCells.has(key) && (!baseline || baseline.layer === 'surge')
				}
				return state.contract.vacatedCells.has(key) && baseline?.identity === descriptor?.identity
			}

			function rollbackCreatedMutation(state, mutation) {
				const descriptor = mutation.descriptor
				const contractDescriptor = mutation.contractDescriptor || descriptor
				const expected = findExpectedEntity(descriptor)
				if (expected) {
					if (
						isDynamicRestorationDescriptor(contractDescriptor) &&
						!rollbackDynamicEntityAllowed(state, contractDescriptor, expected)
					) {
						traceProbe('contract.rollback.denied', contractProbeDetails(
							state,
							contractDescriptor,
							expected,
							'strict-layer-transition'
						))
						throw deletionError('ROLLBACK_FAILED', 'A restored dynamic Cube entered a strict layer.')
					}
					const restoreTemporaryRelationGuards = prepareRelationRemovalGuards(contractDescriptor, state.relations)
					try {
						game.clearCell(expected.position)
					} finally {
						restoreTemporaryRelationGuards()
					}
					if (game.stuff?.includes?.(expected) || entityAt(game, expected.position) === expected) {
						throw deletionError('ROLLBACK_FAILED', 'A restored entity could not be removed during rollback.')
					}
					if (isDynamicRestorationDescriptor(contractDescriptor)) {
						state.contract.journal.push({
							kind: 'rollback-dynamic-compensation',
							identity: ensureIdentity(expected),
							position: normalizePosition(expected.position),
							reason: 'exact-identity-provenance'
						})
						traceProbe(
							'contract.rollback.dynamic-compensated',
							contractProbeDetails(
								state,
								contractDescriptor,
								expected,
								'exact-identity-provenance'
							)
						)
					}
					return
				}
				if (findEntityByIdentity(contractDescriptor.identity)) {
					throw deletionError('ROLLBACK_FAILED', 'A restored entity moved outside its rollback footprint.')
				}
				const occupants = new Set()
				for (const position of footprintCells(contractDescriptor.footprint)) {
					const current = entityAt(game, position)
					if (!current) continue
					const baseline = state.contract.baseline.get(cellKey(position[0], position[1])) || null
					if (baseline && ensureIdentity(current) === baseline.identity) continue
					if (!rollbackCellAuthorized(state, contractDescriptor, position, 'created')) {
						traceProbe('contract.rollback.denied', contractProbeDetails(
							state,
							contractDescriptor,
							current,
							'outside-created-provenance'
						))
						throw deletionError('ROLLBACK_FAILED', 'A restored entity footprint changed during rollback.')
					}
					occupants.add(current)
				}
				for (const current of occupants) {
					clearRollbackDynamicEntity(state, contractDescriptor, current, 'dynamic-successor')
				}
			}

			function rollbackRemovedMutation(state, descriptor) {
				const expected = findExpectedEntity(descriptor)
				if (expected) {
					if (
						normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube' &&
						expected.pump !== findExpectedEntity(descriptor.pump) &&
						!rollbackOwnerBoundOccupant(state, descriptor, expected)
					) {
						throw deletionError('ROLLBACK_FAILED', 'A restored attached Cube owner changed during rollback.')
					}
					return
				}
				if (findEntityByIdentity(descriptor.identity)) {
					throw deletionError('ROLLBACK_FAILED', 'A removed entity moved outside its rollback footprint.')
				}
				const ownerBoundOccupant = entityAt(game, descriptor.position)
				if (rollbackOwnerBoundOccupant(state, descriptor, ownerBoundOccupant)) return
				const occupants = new Set()
				for (const position of footprintCells(descriptor.footprint)) {
					const current = entityAt(game, position)
					if (!current) continue
					if (!rollbackCellAuthorized(state, descriptor, position, 'removed')) {
						traceProbe('contract.rollback.denied', contractProbeDetails(
							state,
							descriptor,
							current,
							'outside-vacated-provenance'
						))
						throw deletionError('ROLLBACK_FAILED', 'A deletion footprint is no longer recoverable.')
					}
					occupants.add(current)
				}
				for (const current of occupants) {
					clearRollbackDynamicEntity(state, descriptor, current, 'transaction-vacancy-successor')
				}
				addExpectedEntity(descriptor, state.relations)
			}

			function reconcileRollbackBaseline(state) {
				const descriptorsByCell = new Map()
				for (const mutation of state.mutations) {
					if (mutation.kind !== 'created') continue
					for (const position of footprintCells(mutation.descriptor.footprint)) {
						descriptorsByCell.set(cellKey(position[0], position[1]), mutation.descriptor)
					}
				}
				for (const key of state.contract.createdCells) {
					const descriptor = descriptorsByCell.get(key)
					if (!descriptor) continue
					const position = key.split(':').map(Number)
					const baseline = state.contract.baseline.get(key) || null
					const current = entityAt(game, position)
					if (!current || (baseline && ensureIdentity(current) === baseline.identity)) continue
					if (!rollbackCellAuthorized(state, descriptor, position, 'created')) {
						throw deletionError('ROLLBACK_FAILED', 'A rollback baseline changed outside World Editor.')
					}
					clearRollbackDynamicEntity(state, descriptor, current, 'late-dynamic-successor')
				}
			}

			async function rollbackMutations(context, state) {
				let processed = 0
				for (let index = state.mutations.length - 1; index >= 0; index -= 1) {
					requireCurrent(context)
					const mutation = state.mutations[index]
					if (mutation.kind === 'created') {
						rollbackCreatedMutation(state, mutation)
					} else if (mutation.kind === 'displaced-surge') {
						restoreDisplacedSurge(mutation.descriptor)
					} else if (mutation.kind === 'displaced-attached-cube') {
						restoreDisplacedAttachedCube(mutation.descriptor, state)
					} else if (mutation.kind === 'discarded-transaction-vacancy-successor') {
						rollbackDiscardedTransactionVacancySuccessor(state, mutation.descriptor)
					} else if (mutation.kind === 'removed') {
						rollbackRemovedMutation(state, mutation.descriptor)
					} else if (mutation.kind === 'resources') {
						applyResourceDelta(game, negateArray(mutation.delta), true)
					} else if (mutation.kind === 'stats') {
						game.stats = game.stats || {}
						game.stats.machinesSold = mutation.values.machinesSold
						game.stats.timeSinceLastDelete = mutation.values.timeSinceLastDelete
					} else if (mutation.kind === 'onlyones') {
						writeOnlyones(game, mutation.keys, mutation.values)
					}
					processed += 1
					if (processed % APPLY_CHUNK_SIZE === 0) await yieldTurn()
				}
				requireCurrent(context)
				if (state.direction === 'undo') reconcileRollbackBaseline(state)
			}

			function verifyAppliedState(payload, state, expectedAfter) {
				if (!expectedAfter) {
					const manifestState = verifyDynamicCommitManifest(state)
					if (!manifestState.ok) return manifestState
				}
				for (const descriptor of payload.removals) {
					const entity = findExpectedEntity(descriptor)
					if (expectedAfter) {
						if (!isBuildingRemoval(descriptor)) {
							if (entity) return denied('VERIFY_FAILED', 'A deleted transient layer is still present.')
							continue
						}
						for (const position of footprintCells(descriptor.footprint)) {
							if (entityAt(game, position)) {
								return denied('VERIFY_FAILED', 'A deleted building is still present.')
							}
						}
					} else if (isDynamicRestorationDescriptor(descriptor)) {
						continue
					} else if (
						!entity ||
						ensureIdentity(entity) !== descriptor.identity ||
						safeName(entity.name) !== descriptor.name
					) {
						return denied('VERIFY_FAILED', 'A deleted building was not restored exactly.')
					}
					if (!expectedAfter && normalizeRemovalLayer(descriptor?.layer, descriptor) === 'attached-cube') {
						const pump = findExpectedEntity(descriptor.pump)
						if (!pump || entity.pump !== pump) {
							return denied('VERIFY_FAILED', 'An attached Cube was not restored to its extractor.')
						}
					}
				}
				const relationState = inspectRecordedRelations(payload, expectedAfter ? 'undo' : 'redo')
				if (!relationState.ok) return denied('VERIFY_FAILED', relationState.message)
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

			function findExpectedEntity(descriptor) {
				const direct = entityAt(game, descriptor?.position)
				if (
					direct &&
					ensureIdentity(direct) === descriptor?.identity &&
					safeName(direct.name) === safeName(descriptor?.name)
				) return direct
				for (const entity of game.stuff || []) {
					if (
						ensureIdentity(entity) === descriptor?.identity &&
						safeName(entity?.name) === safeName(descriptor?.name) &&
						samePlain(normalizePosition(entity?.position), normalizePosition(descriptor?.position))
					) return entity
				}
				return null
			}

			function findIdentityRebindCandidate(descriptor) {
				const position = normalizePosition(descriptor?.position)
				const identity = String(descriptor?.identity || '')
				const name = safeName(descriptor?.name)
				if (!position || !identity || !name) return null
				const candidate = entityAt(game, position)
				if (
					!candidate ||
					safeName(candidate.name) !== name ||
					!samePlain(normalizePosition(candidate.position), position)
				) return null
				for (const entity of game.stuff || []) {
					if (entity !== candidate && identityByEntity.get(entity) === identity) return null
				}
				return candidate
			}

			function ensureIdentity(entity) {
				if (!entity || typeof entity !== 'object') return ''
				let identity = identityByEntity.get(entity)
				if (!identity) {
					identity = createIdentity('entity')
					identityByEntity.set(entity, identity)
				}
				const native = globalThis[Symbol.for('cattail.world-editor.native-tools')]
				if (native?.game === game) native.rememberRestoration('delete', identity, entity)
				return identity
			}

			function assignIdentity(entity, identity) {
				if (!entity || !identity) throw deletionError('APPLY_FAILED', 'An entity identity could not be assigned.')
				identityByEntity.set(entity, identity)
				const native = globalThis[Symbol.for('cattail.world-editor.native-tools')]
				if (native?.game === game) native.restoreIdentity('delete', identity, entity)
			}

			function recoverableMissingRelationSurge(relation) {
				if (!requiresRelationSurgeRecovery(relation) || !relation?.surgeSave) return false
				if (findExpectedEntity(relation.surge) || entityAt(game, relation.surge.position)) return false
				return !findEntityByIdentity(relation.surge.identity)
			}

			function recoverableMissingRelationSurges(relations) {
				const result = new Map()
				for (const relation of relations || []) {
					if (!recoverableMissingRelationSurge(relation)) continue
					result.set(cellKey(relation.surge.position[0], relation.surge.position[1]), relation)
				}
				return result
			}

			function findEntityByIdentity(identity) {
				const expected = String(identity || '')
				if (!expected) return null
				for (const entity of game.stuff || []) {
					if (identityByEntity.get(entity) === expected) return entity
				}
				return null
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
				compatibilitySignature: String(value.compatibilitySignature || ''),
				dynamicCubeSignature: String(value.dynamicCubeSignature || ''),
				pumpDependencySignature: String(value.pumpDependencySignature || ''),
				dynamicSurgeSignature: String(value.dynamicSurgeSignature || ''),
				cutRetainedCubeSignature: String(value.cutRetainedCubeSignature || ''),
				pumpCubeStates: normalizePumpCubeStates(value.pumpCubeStates),
				ordinaryCubeStates: normalizeOrdinaryCubeRuntimeStates(value.ordinaryCubeStates),
				growStates: normalizeGrowStates(value.growStates),
				paintedStates: normalizePaintedRuntimeStates(value.paintedStates),
				surgeStates: normalizeSurgeRuntimeStates(value.surgeStates),
				strictSurgeStates: normalizeSurgeRuntimeStates(value.strictSurgeStates),
				relations: normalizeRelations(value.relations),
				fingerprints: normalizePlanFingerprints(value.fingerprints),
				diagnosticTargets: normalizeDiagnosticTargets(value)
			}
		}

		function normalizeDiagnosticTargets(value) {
			return {
				removal: normalizeDiagnosticTargetSummaries(
					Array.isArray(value?.removals) ? value.removals : value?.diagnosticTargets?.removal
				),
				protected: normalizeDiagnosticTargetSummaries(
					Array.isArray(value?.protectedTargets) ? value.protectedTargets : value?.diagnosticTargets?.protected
				)
			}
		}

		function normalizeDiagnosticTargetSummaries(value) {
			if (!Array.isArray(value)) return []
			return value.map(diagnosticTargetSummary).sort(function (left, right) {
				return diagnosticTargetKey(left).localeCompare(diagnosticTargetKey(right))
			})
		}

		function normalizeRelations(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (relation) {
				const stabilizerPosition = normalizePosition(relation?.stabilizer?.position)
				const surgePosition = normalizePosition(relation?.surge?.position)
				const stabilizerName = safeName(relation?.stabilizer?.name)
				if (
					!stabilizerPosition ||
					!surgePosition ||
					!isStabilizerName(stabilizerName) ||
					safeName(relation?.surge?.name) !== 'surge' ||
					!relation?.stabilizer?.identity ||
					!relation?.surge?.identity ||
					(relation?.removeStabilizer !== true && relation?.removeSurge !== true)
				) throw deletionError('INVALID_PLAN', 'A stabilizer relationship is invalid.')
				const normalized = {
					stabilizer: {
						identity: String(relation.stabilizer.identity),
						name: stabilizerName,
						position: stabilizerPosition
					},
					surge: {
						identity: String(relation.surge.identity),
						name: 'surge',
						position: surgePosition
					},
					removeStabilizer: relation.removeStabilizer === true,
					removeSurge: relation.removeSurge === true
				}
				if (requiresRelationSurgeRecovery(normalized)) {
					const surgeSave = normalizeRelationSurgeSave(relation.surgeSave, normalized)
					if (!surgeSave) {
						throw deletionError('INVALID_PLAN', 'A shattered stabilizer relationship save is invalid.')
					}
					normalized.surgeSave = surgeSave
				}
				return normalized
			}).sort(compareRelations)
		}

		function normalizeGrowStates(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					identity: String(entry?.identity || ''),
					disposition: String(entry?.disposition || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					paint: jsonClone(entry?.paint)
				}
			}).sort(compareGrowStates)
		}

		function normalizePumpCubeStates(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					state: finiteInteger(entry?.state, -1),
					resources: String(entry?.resources || ''),
					killme: entry?.killme === true,
					resourcesValid: entry?.resourcesValid === true,
					paintFree: entry?.paintFree === true,
					selectedOwner: entry?.selectedOwner === true,
					inSelectedPumpVicinity: entry?.inSelectedPumpVicinity === true,
					pump: entry?.pump ? {
						identity: String(entry.pump.identity || ''),
						name: safeName(entry.pump.name),
						position: normalizePosition(entry.pump.position) || [0, 0]
					} : null
				}
			}).sort(comparePumpCubeStates)
		}

		function normalizeOrdinaryCubeRuntimeStates(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					valid: entry?.valid === true,
					save: jsonClone(entry?.save)
				}
			}).sort(compareOrdinaryCubeRuntimeStates)
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
						primary: entry?.primary === true,
						range: normalizeRange(entry?.range)
					}
				})
			}
			if (kind === 'selection') {
				source.revision = finiteInteger(value?.revision, -1)
				if (value?.removeCubes === true) source.removeCubes = true
				if (value?.removePaintedCubes === true) source.removePaintedCubes = true
				if (value?.removeSurges === true) source.removeSurges = true
			}
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

		function isStabilizerName(value) {
			const name = safeName(value)
			return name === 'stabilizer' || name === 'stabilizer2' || name === 'stabilizer3'
		}

		function shatteredStabilizerCount(game) {
			const tracked = Math.max(0, finiteOr(game?.entitiesInGame?.stabilizer3, 0))
			const live = Array.isArray(game?.stuff)
				? game.stuff.filter(function (entity) { return safeName(entity?.name) === 'stabilizer3' }).length
				: 0
			return Math.max(tracked, live)
		}

		function normalizeRemovalLayer(value, entity) {
			const layer = String(value || '').toLowerCase()
			if (layer === 'cube' || layer === 'painted' || layer === 'surge' || layer === 'attached-cube') return layer
			const name = safeName(entity?.name)
			return name === 'cube' || name === 'surge' ? name : 'building'
		}

		function isBuildingRemoval(value) {
			return normalizeRemovalLayer(value?.layer, value) === 'building'
		}

		function classifyPaintedCube(entity, paintCubeState) {
			if (safeName(entity?.name) !== 'cube') return 'ordinary'
			try {
				if (paintCubeState?.normalizePaint?.(entity)) return 'strict'
			} catch (error) {}
			return Object.prototype.hasOwnProperty.call(entity || {}, 'worldEditorPaint')
				? 'invalid'
				: 'ordinary'
		}

		function paintedProtectionReason(kind, requested) {
			if (kind === 'invalid') return 'invalid-painted-cube'
			if (kind === 'strict') return requested ? 'unsafe-painted-cube' : 'painted-cube'
			return requested ? 'unsafe-cube' : 'cube'
		}

		function cutRetainableLiveCubeEntity(entity, paintCubeState) {
			const kind = classifyPaintedCube(entity, paintCubeState)
			if (kind === 'strict') return paintedRemovalSafe(null, entity, paintCubeState)
			if (kind !== 'ordinary') return false
			return isRetainableLiveVanillaCubeEntity(entity, paintCubeState)
		}

		function paintedRemovalSafe(game, entity, paintCubeState) {
			if (
				safeName(entity?.name) !== 'cube' ||
				entity?.killme === true ||
				typeof paintCubeState?.normalizePaint !== 'function'
			) return false
			try {
				const paint = paintCubeState.normalizePaint(entity)
				if (
					paint?.version !== paintCubeState?.growPaintVersion &&
					(Number(entity?.state) !== 2 || Number(entity?.fill) !== 64)
				) return false
				const saved = paintCubeState.capturePaintedCubeSave?.(entity, entity?.position)
				return !!paint && !!saved && !!paintCubeState.normalizePaint(saved)
			} catch (error) {
				return false
			}
		}

		function transientRemovalSafe(game, entity, layerValue, blueprintState) {
			const layer = normalizeRemovalLayer(layerValue, entity)
			if (layer === 'cube') {
				return safeName(entity?.name) === 'cube' && Number(entity?.state) === 2 && entity?.killme !== true
			}
			if (layer !== 'surge' || safeName(entity?.name) !== 'surge' || entity?.killme === true) return false
			if (Number(entity?.harvestProgression) > 0 || Number(entity?.lifeTimer) <= 0) return false
			try {
				const saved = game?.getEntityString?.(entity)
				if (typeof blueprintState?.surgeEligible === 'function') {
					return blueprintState.surgeEligible(entity, saved)
				}
				return !!saved && Number(saved?.par?.life) > 0 && Number(saved?.par?.maxLife) > 0
			} catch (error) {
				return false
			}
		}

		function isDynamicOrdinaryStableCubeDescriptor(value, paintCubeState) {
			if (
				normalizeRemovalLayer(value?.layer, value) !== 'cube' ||
				safeName(value?.name || value?.save?.name) !== 'cube' ||
				Number(value?.save?.par?.state) !== 2 ||
				value?.save?.par?.killme === true ||
				!validOrdinaryCubeResources(value?.save?.par?.resources) ||
				Object.prototype.hasOwnProperty.call(value?.save?.par || {}, 'worldEditorPaint')
			) return false
			try {
				if (paintCubeState?.normalizePaint?.(value.save)) return false
			} catch (error) {
				return false
			}
			return true
		}

		function isDynamicOrdinaryStableCubeEntity(entity, paintCubeState) {
			if (
				safeName(entity?.name) !== 'cube' ||
				Number(entity?.state) !== 2 ||
				entity?.killme === true ||
				!validOrdinaryCubeResources(entity?.resources) ||
				Object.prototype.hasOwnProperty.call(entity || {}, 'worldEditorPaint')
			) return false
			try {
				return !paintCubeState?.normalizePaint?.(entity)
			} catch (error) {
				return false
			}
		}

		function liveVanillaCubeClassification(entity, paintCubeState) {
			const name = safeName(entity?.name)
			const state = Number.isFinite(Number(entity?.state)) ? Number(entity.state) : null
			const killme = entity?.killme === true
			const resourcesLength = Array.isArray(entity?.resources) ? entity.resources.length : null
			const resourcesValid = validOrdinaryCubeResources(entity?.resources)
			const hasWorldEditorPaint = Object.prototype.hasOwnProperty.call(entity || {}, 'worldEditorPaint')
			let normalizedPaint = null
			let paintError = null
			try {
				normalizedPaint = paintCubeState?.normalizePaint?.(entity) || null
			} catch (error) {
				paintError = String(error?.message || error || 'Paint state could not be normalized.')
			}
			const paint = normalizedPaint
				? {
					version: Number.isFinite(Number(normalizedPaint.version)) ? Number(normalizedPaint.version) : null,
					kind: String(normalizedPaint.kind || ''),
					mode: String(normalizedPaint.mode || ''),
					growthPhase: normalizedPaint.growth?.phase
						? String(normalizedPaint.growth.phase)
						: null
				}
				: null
			return {
				name,
				state,
				killme,
				resourcesLength,
				resourcesValid,
				hasWorldEditorPaint,
				paint,
				paintError,
				retainable: name === 'cube' &&
					(state === 0 || state === 1 || state === 2) &&
					!killme &&
					resourcesValid &&
					!hasWorldEditorPaint &&
					!normalizedPaint &&
					!paintError
			}
		}

		function isRetainableLiveVanillaCubeEntity(entity, paintCubeState) {
			return liveVanillaCubeClassification(entity, paintCubeState).retainable
		}

		function validOrdinaryCubeResources(value) {
			return Array.isArray(value) && value.length === 64 && value.every(function (resource) {
				return Number.isInteger(resource) && resource >= 0
			})
		}

		function dynamicOrdinaryCubeComparableSave(value, descriptor) {
			const save = comparableDeletionSave(value, descriptor || { layer: 'cube', name: 'cube' })
			if (!save?.par || typeof save.par !== 'object') return save
			save.par.resources = 'ordinary-cube-runtime'
			save.par.broken = 'ordinary-cube-runtime'
			return save
		}

		function createOrdinaryCubeRuntimeState(descriptor, paintCubeState) {
			if (!isDynamicOrdinaryStableCubeDescriptor(descriptor, paintCubeState)) return null
			return {
				identity: String(descriptor?.identity || ''),
				position: normalizePosition(descriptor?.position) || [0, 0],
				valid: true,
				save: dynamicOrdinaryCubeComparableSave(descriptor.save, descriptor)
			}
		}

		function createOrdinaryCubeRuntimeStates(value, paintCubeState) {
			const result = []
			for (const entry of [].concat(value?.removals || [], value?.protectedTargets || [])) {
				const state = createOrdinaryCubeRuntimeState(entry, paintCubeState)
				if (state) result.push(state)
			}
			return result.sort(compareOrdinaryCubeRuntimeStates)
		}

		function compatibleOrdinaryCubeRuntimeStates(beforeValue, afterValue, resolveCurrent) {
			const before = normalizeOrdinaryCubeRuntimeStates(beforeValue)
			const after = normalizeOrdinaryCubeRuntimeStates(afterValue)
			const afterByIdentity = new Map(after.map(function (entry) {
				return [entry.identity, entry]
			}))
			for (const oldEntry of before) {
				const newEntry = afterByIdentity.get(oldEntry.identity) ||
					(typeof resolveCurrent === 'function' ? resolveCurrent(oldEntry.identity) : null)
				if (!newEntry) continue
				if (
					oldEntry.valid !== true ||
					newEntry.valid !== true ||
					comparePositions(oldEntry.position, newEntry.position) !== 0 ||
					!samePlain(oldEntry.save, newEntry.save)
				) return false
			}
			return true
		}

		function compareOrdinaryCubeRuntimeStates(left, right) {
			const leftPosition = normalizePosition(left?.position) || [0, 0]
			const rightPosition = normalizePosition(right?.position) || [0, 0]
			return (
				String(left?.identity || '').localeCompare(String(right?.identity || '')) ||
				comparePositions(leftPosition, rightPosition)
			)
		}

		function isPumpEntity(entity) {
			const name = safeName(entity?.name)
			return name === 'pump' || name === 'pump2'
		}

		function isUnfinishedPumpCube(entity, pump) {
			return safeName(entity?.name) === 'cube' &&
				(entity?.state === 0 || entity?.state === 1) &&
				entity?.killme !== true &&
				entity?.pump === pump
		}

		function isPumpOwnedVanillaCube(entity, pump, paintCubeState) {
			return isPumpEntity(pump) &&
				entity?.pump === pump &&
				isRetainableLiveVanillaCubeEntity(entity, paintCubeState)
		}

		function collectSelectedPumpAttachments(game, pumps, paintCubeState, includeStable) {
			const result = new Map()
			for (const pump of Array.from(pumps || [])) {
				if (!isPumpEntity(pump)) continue
				for (const candidate of game.stuff || []) {
					if (
						isUnfinishedPumpCube(candidate, pump) ||
						(includeStable === true && isPumpOwnedVanillaCube(candidate, pump, paintCubeState))
					) {
						result.set(candidate, pump)
					}
				}
			}
			return result
		}

		function createPumpCubeStates(game, pumps, identityFor, paintCubeState) {
			const selected = new Set(Array.from(pumps || []).filter(isPumpEntity))
			if (!selected.size) return []
			const vicinity = selectedPumpVicinityCells(selected)
			const result = []
			for (const cube of game?.stuff || []) {
				if (safeName(cube?.name) !== 'cube') continue
				const position = normalizePosition(cube?.position)
				if (!position || (!selected.has(cube?.pump) && !vicinity.has(cellKey(position[0], position[1])))) continue
				result.push(capturePumpCubeState(cube, identityFor, paintCubeState, {
					selectedOwner: selected.has(cube?.pump),
					inSelectedPumpVicinity: vicinity.has(cellKey(position[0], position[1]))
				}))
			}
			return result.sort(comparePumpCubeStates)
		}

		function selectedPumpVicinityCells(pumps) {
			const result = new Set()
			for (const pump of pumps || []) {
				const origin = normalizePosition(pump?.position)
				if (!origin) continue
				for (const offset of [].concat(pump?.soi || [], pump?.soe || [])) {
					const du = Number(offset?.[0])
					const dv = Number(offset?.[1])
					if (!Number.isInteger(du) || !Number.isInteger(dv)) continue
					result.add(cellKey(origin[0] + du, origin[1] + dv))
				}
			}
			return result
		}

		function ignorableSelectedPumpTerminalCube(entity, selectedPumps, vicinity, paintCubeState) {
			const position = normalizePosition(entity?.position)
			const owner = entity?.pump
			if (
				!position ||
				!selectedPumps?.has?.(owner) ||
				!vicinity?.has?.(cellKey(position[0], position[1]))
			) return false
			const live = liveVanillaCubeClassification(entity, paintCubeState)
			return live.name === 'cube' &&
				live.state === 3 &&
				live.killme === true &&
				live.resourcesValid === true &&
				live.hasWorldEditorPaint === false &&
				live.paint === null &&
				live.paintError === null
		}

		function capturePumpCubeState(cube, identityFor, paintCubeState, context) {
			const owner = cube?.pump
			const live = liveVanillaCubeClassification(cube, paintCubeState)
			return {
				identity: String(identityFor(cube) || ''),
				position: normalizePosition(cube?.position) || [0, 0],
				state: finiteInteger(cube?.state, -1),
				resources: fingerprint(Array.isArray(cube?.resources) ? cube.resources : null),
				killme: live.killme === true,
				resourcesValid: live.resourcesValid === true,
				paintFree: live.hasWorldEditorPaint === false && live.paint === null && live.paintError === null,
				selectedOwner: context?.selectedOwner === true,
				inSelectedPumpVicinity: context?.inSelectedPumpVicinity === true,
				pump: isPumpEntity(owner) ? {
					identity: String(identityFor(owner) || ''),
					name: safeName(owner.name),
					position: normalizePosition(owner.position) || [0, 0]
				} : null
			}
		}

		function pumpAttachmentsSafe(game, entity, attachedCubeOwners, paintCubeState) {
			const attached = []
			for (const pair of attachedCubeOwners || []) {
				if (pair[1] === entity) attached.push(pair[0])
			}
			return attached.length > 0 && attached.every(function (cube) {
				return attachedCubeRemovalSafe(cube, entity, paintCubeState)
			})
		}

		function attachedCubeRemovalSafe(entity, pump, paintCubeState) {
			const numericFields = [
				'fill',
				'maxFill',
				'reversePause',
				'reverseTimer',
				'reverseSpeed',
				'unveilSpeed',
				'unveilProgress',
				'broken',
				'baseBreakPower',
				'breakPower',
				'shakePower'
			]
			return isPumpOwnedVanillaCube(entity, pump, paintCubeState) &&
				(safeName(pump?.name) === 'pump' || safeName(pump?.name) === 'pump2') &&
				!!normalizePosition(entity?.position) &&
				!!normalizePosition(pump?.position) &&
				numericFields.every(function (field) { return Number.isFinite(Number(entity?.[field])) }) &&
				Array.isArray(entity?.resources) &&
				entity.resources.length === 64 &&
				entity.resources.every(function (resource) {
					return Number.isInteger(resource) && resource >= 0
				})
		}

		function footprintCrossesMask(footprint, mask) {
			for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
				for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
					if (!mask.has(cellKey(u, v))) return true
				}
			}
			return false
		}

		function collectScopeCells(removals, relations) {
			const cells = new Map()
			for (const descriptor of removals) {
				for (const position of footprintCells(descriptor.footprint)) {
					cells.set(cellKey(position[0], position[1]), position)
				}
			}
			for (const relation of relations || []) {
				for (const endpoint of [relation?.stabilizer, relation?.surge]) {
					const position = normalizePosition(endpoint?.position)
					if (position) cells.set(cellKey(position[0], position[1]), position)
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
			// Native 1.3 demolition refunds buildings without an eraser commodity
			// fee. Use the same native-save boundary as priceFor; only the legacy
			// economy still quotes those products. eraserType still affects refunds.
			const eraserName = Array.isArray(game?.saveSlots)
				? null
				: Number(game.eraserType) === 2
					? 'eraser3'
					: Number(game.eraserType) === 1
						? 'eraser2'
						: 'eraser'
			for (const removal of removals) {
				if (eraserName) {
					const eraserCost = priceFor(game, counts, eraserName, false)
					pushEconomyStep(resources, steps, 'eraser-cost', eraserName, negateArray(eraserCost))
				}
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
			if (Array.isArray(game?.saveSlots)) return globalThis[Symbol.for('cattail.world-editor.blueprint-preview-plan')].quotePrice(game, counts, name, sale)
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
				save: comparableDeletionSave(entry?.save, entry)
			})
		}

		function signatureProtectedDescriptor(entry, paintCubeState) {
			const descriptor = signatureDescriptor(entry)
			if (isDynamicOrdinaryStableCubeDescriptor(entry)) {
				descriptor.dynamicOrdinaryCube = true
			}
			if (cutRetainedCubeDescriptor(entry, paintCubeState, 'protected')) {
				descriptor.cutRetainableCube = true
			}
			delete descriptor.save
			return descriptor
		}

		function comparableDeletionSave(value, descriptor) {
			const save = jsonClone(value)
			if (!save?.par || typeof save.par !== 'object') return save
			delete save.par.soul
			const layer = descriptor ? normalizeRemovalLayer(descriptor?.layer, descriptor) : ''
			if (layer === 'building') {
				for (const field of BUILDING_RUNTIME_SAVE_FIELDS) {
					if (Object.prototype.hasOwnProperty.call(save.par, field)) save.par[field] = 'building-runtime'
				}
				const name = safeName(descriptor?.name || save?.name)
				if ((name === 'pump' || name === 'pump2') && Object.prototype.hasOwnProperty.call(save.par, 'depth')) {
					save.par.depth = 'building-runtime'
				}
			} else if (layer === 'attached-cube') {
				for (const field of ATTACHED_CUBE_RUNTIME_SAVE_FIELDS) {
					if (Object.prototype.hasOwnProperty.call(save.par, field)) save.par[field] = 'attached-cube-runtime'
				}
			}
			return save
		}

		function sameDeletionSave(left, right, descriptor) {
			return samePlain(
				comparableDeletionSave(left, descriptor),
				comparableDeletionSave(right, descriptor)
			)
		}

		function matchesDeletionSave(actual, expected, descriptor, paintCubeState) {
			if (sameDeletionSave(actual, expected, descriptor)) return true
			const layer = normalizeRemovalLayer(descriptor?.layer, descriptor)
			if (layer === 'surge') return matchesSurgeDeletionSave(actual, expected)
			if (layer !== 'painted') return false
			try {
				const actualRuntime = paintedRuntimeState(actual, paintCubeState)
				const expectedRuntime = paintedRuntimeState(expected, paintCubeState)
				if (
					!actualRuntime ||
					!expectedRuntime ||
					actualRuntime.broken + EPSILON < expectedRuntime.broken ||
					!sameDeletionSave(
						compatibilitySave(actual, paintCubeState, descriptor),
						compatibilitySave(expected, paintCubeState, descriptor)
					)
				) return false
				const actualPaint = actualRuntime.paint
				const expectedPaint = expectedRuntime.paint
				if (
					actualPaint.version !== paintCubeState?.growPaintVersion ||
					expectedPaint.version !== paintCubeState?.growPaintVersion
				) return actualPaint.version === expectedPaint.version
				if (
					!paintCubeState.sameGrowIdentity?.(actualPaint, expectedPaint) ||
					!paintCubeState.matchesGrowProgress?.(actualPaint, expectedPaint)
				) return false
				return growPhaseOrder(actualPaint.growth?.phase) >= growPhaseOrder(expectedPaint.growth?.phase)
			} catch (error) {
				return false
			}
		}

		function matchesSurgeDeletionSave(actual, expected) {
			const actualLife = surgeSaveLife(actual)
			const expectedLife = surgeSaveLife(expected)
			if (
				!Number.isFinite(actualLife) ||
				!Number.isFinite(expectedLife) ||
				actualLife <= 0 ||
				expectedLife <= 0 ||
				actualLife > expectedLife + EPSILON
			) return false
			return sameDeletionSave(
				surgeSaveWithoutRuntimeState(actual),
				surgeSaveWithoutRuntimeState(expected)
			)
		}

		function surgeSaveLife(value) {
			return Number(value?.par?.life)
		}

		function surgeSaveWithoutRuntimeState(value) {
			const save = jsonClone(value)
			if (save?.par && typeof save.par === 'object') {
				save.par.life = 'surge-runtime'
				delete save.par.soul
			}
			return save
		}

		function restoreEntitySave(game, saved) {
			const save = jsonClone(saved)
			const position = normalizePosition(save?.position)
			if (!position || !game.codex?.entities?.[save.name]) return null
			const misc = restoreMisc(save)
			const entity = game.addEntity(save.name, position, misc, { skipShopUpdate: true })
			if (!entity) return null
			for (const key of Object.keys(save.par || {})) entity[key] = jsonClone(save.par[key])
			if (save.name === 'surge') {
				if (Number.isFinite(Number(save.par?.life))) entity.lifeTimer = Number(save.par.life)
				if (Number.isFinite(Number(save.par?.maxLife))) entity.maxLifeTimer = Number(save.par.maxLife)
			}
			entity.position = position
			entity.init?.()
			return entity
		}

		function restoreAttachedCubeSave(game, saved, pump) {
			const save = jsonClone(saved)
			const position = normalizePosition(save?.position)
			if (
				!position ||
				safeName(save?.name) !== 'cube' ||
				!save?.par ||
				!Array.isArray(save.par.resources) ||
				save.par.resources.length !== 64
			) return null
			const entity = game.addEntity('cube', position, {
				pump,
				resources: jsonClone(save.par.resources)
			}, { skipShopUpdate: true })
			if (!entity) return null
			for (const key of Object.keys(save.par)) entity[key] = jsonClone(save.par[key])
			entity.pump = pump
			entity.position = position
			entity.init?.()
			return entity
		}

		function restoreMisc(save) {
			const par = save.par || {}
			if (save.name === 'cube') {
				return {
					pump: false,
					resources: jsonClone(par.resources || [])
				}
			}
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
				!Array.isArray(record.payload.relations) ||
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
				game.store?.compositionUpdate?.()
				game.shop?.updateElements?.()
				game.shop?.check?.()
				const refreshPointer = Array.isArray(game.saveSlots) ? game.processMove : game.processMousemove2
				refreshPointer?.call(game)
			} catch (refreshError) {
				console.warn('[Cattail World Editor] Selection deletion world refresh failed.', refreshError)
			}
		}

		function beginBatchedWorldWrites(game) {
			const restoreShopUpdates = deferMethod(game?.shop, 'updateElements')
			const restoreStore = deferMethod(game?.store, 'compositionUpdate')
			const restoreStuffSort = deferSort(game?.stuff)
			let restored = false
			return function restoreBatchedWorldWrites() {
				if (restored) return
				restored = true
				try {
					restoreShopUpdates()
					restoreStore()
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

		function captureStats(game) {
			return {
				machinesSold: finiteOr(game.stats?.machinesSold, 0),
				timeSinceLastDelete: game.stats?.timeSinceLastDelete
			}
		}

		function planCompatibilityValue(value, paintCubeState) {
			return Object.assign({}, value, {
				removals: (value?.removals || []).map(function (entry) {
					return compatibilityDescriptor(entry, paintCubeState)
				}),
				protectedTargets: (value?.protectedTargets || []).map(function (entry) {
					return compatibilityDescriptor(entry, paintCubeState)
				}),
				relations: (value?.relations || []).map(function (relation) {
					if (!relation?.surgeSave) return relation
					return Object.assign({}, relation, {
						surgeSave: surgeSaveWithoutRuntimeState(relation.surgeSave)
					})
				})
			})
		}

		function dynamicCubeCompatibilityValue(value, paintCubeState) {
			const compatible = planCompatibilityValue(value, paintCubeState)
			return Object.assign({}, compatible, {
				removals: (compatible.removals || []).filter(function (entry) {
					return !isDynamicOrdinaryStableCubeDescriptor(entry)
				}),
				protectedTargets: (compatible.protectedTargets || []).filter(function (entry) {
					return entry?.dynamicOrdinaryCube !== true
				})
			})
		}

		function pumpDependencyCompatibilityValue(value, paintCubeState) {
			const compatible = dynamicCubeCompatibilityValue(value, paintCubeState)
			return Object.assign({}, compatible, {
				removals: (compatible.removals || []).filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) !== 'attached-cube'
				}),
				protectedTargets: (compatible.protectedTargets || []).filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) !== 'attached-cube'
				})
			})
		}

		function dynamicStandaloneSurgeCompatibilityValue(value, paintCubeState) {
			const compatible = pumpDependencyCompatibilityValue(value, paintCubeState)
			const relationSurges = relationSurgeIdentities(compatible.relations)
			return Object.assign({}, compatible, {
				removals: (compatible.removals || []).filter(function (entry) {
					return !isDynamicStandaloneSurgeDescriptor(entry, relationSurges, 'removal')
				}),
				protectedTargets: (compatible.protectedTargets || []).filter(function (entry) {
					return !isDynamicStandaloneSurgeDescriptor(entry, relationSurges, 'protected')
				})
			})
		}

		function cutRetainedCubeCompatibilityValue(value, paintCubeState) {
			const filtered = Object.assign({}, value, {
				removals: (value?.removals || []).filter(function (entry) {
					return !cutRetainedCubeDescriptor(entry, paintCubeState, 'removal')
				}),
				protectedTargets: (value?.protectedTargets || []).filter(function (entry) {
					return !cutRetainedCubeDescriptor(entry, paintCubeState, 'protected')
				})
			})
			return planCompatibilityValue(filtered, paintCubeState)
		}

		function cutRetainedCubeDescriptor(value, paintCubeState, disposition) {
			if (safeName(value?.name || value?.save?.name) !== 'cube') return false
			const layer = normalizeRemovalLayer(value?.layer, value)
			if (layer === 'attached-cube') return disposition === 'removal'
			if (disposition === 'protected' && value?.cutRetainableCube === true) return true
			const fields = value?.save?.par
			if (!fields || typeof fields !== 'object' || fields.killme === true) return false
			const state = Number(fields.state)
			if (
				(state !== 0 && state !== 1 && state !== 2) ||
				!validOrdinaryCubeResources(fields.resources)
			) return false
			let paint = null
			try { paint = paintCubeState?.normalizePaint?.(value.save) || null } catch (error) {}
			if (paint) {
				return paint.version === paintCubeState?.growPaintVersion ||
					(state === 2 && Number(fields.fill) === 64)
			}
			return !Object.prototype.hasOwnProperty.call(fields, 'worldEditorPaint') && layer === 'cube'
		}

		function relationSurgeIdentities(relations) {
			return new Set((relations || []).map(function (relation) {
				return String(relation?.surge?.identity || '')
			}).filter(Boolean))
		}

		function isDynamicStandaloneSurgeDescriptor(value, relationSurges, disposition) {
			if (
				normalizeRemovalLayer(value?.layer, value) !== 'surge' ||
				relationSurges?.has?.(String(value?.identity || ''))
			) return false
			return disposition === 'removal' || value?.dynamicStandaloneSurge === true
		}

		function compatibilityDescriptor(value, paintCubeState) {
			return Object.assign({}, value, {
				save: compatibilitySave(value?.save, paintCubeState, value)
			})
		}

		function compatibilitySave(value, paintCubeState, descriptor) {
			const layer = descriptor ? normalizeRemovalLayer(descriptor?.layer, descriptor) : ''
			if (layer === 'building' || layer === 'attached-cube') {
				return comparableDeletionSave(value, descriptor)
			}
			if (
				layer === 'surge' &&
				Number.isFinite(surgeSaveLife(value)) &&
				surgeSaveLife(value) > 0
			) return surgeSaveWithoutRuntimeState(value)
			const runtime = paintedRuntimeState(value, paintCubeState)
			if (!runtime) return value
			const save = jsonClone(value)
			if (!save?.par || typeof save.par !== 'object') return value
			save.par.broken = 'painted-runtime'
			save.par.resources = 'painted-runtime'
			if (runtime.paint.version !== paintCubeState?.growPaintVersion) return save
			if (Object.prototype.hasOwnProperty.call(save.par, 'state')) save.par.state = 'grow-progress'
			if (Object.prototype.hasOwnProperty.call(save.par, 'fill')) save.par.fill = 'grow-progress'
			if (Object.prototype.hasOwnProperty.call(save.par, 'unveilProgress')) save.par.unveilProgress = 'grow-progress'
			if (save.par.worldEditorPaint?.growth) {
				save.par.worldEditorPaint.growth.phase = 'grow-progress'
				save.par.worldEditorPaint.growth.elapsedMs = 'grow-progress'
			}
			return save
		}

		function paintedRuntimeState(value, paintCubeState) {
			let paint = null
			try { paint = paintCubeState?.normalizePaint?.(value) || null } catch (error) {}
			const broken = Number(value?.par?.broken)
			const resources = value?.par?.resources
			if (
				!paint ||
				!Number.isFinite(broken) ||
				broken < 0 ||
				broken > 1 ||
				!Array.isArray(resources) ||
				resources.length !== 64 ||
				!resources.every(function (resource) {
					return Number.isInteger(resource) && resource >= 0
				})
			) return null
			return { paint, broken }
		}

		function createPaintedRuntimeStates(value, paintCubeState) {
			const result = []
			for (const entry of value?.removals || []) {
				if (normalizeRemovalLayer(entry?.layer, entry) !== 'painted') continue
				const runtime = paintedRuntimeState(entry?.save, paintCubeState)
				if (!runtime) continue
				result.push({
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					broken: runtime.broken
				})
			}
			return result.sort(comparePaintedRuntimeStates)
		}

		function normalizePaintedRuntimeStates(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					broken: Number(entry?.broken)
				}
			}).sort(comparePaintedRuntimeStates)
		}

		function createSurgeRuntimeStates(value) {
			const result = []
			for (const entry of value?.removals || []) {
				if (normalizeRemovalLayer(entry?.layer, entry) !== 'surge') continue
				result.push({
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					life: surgeSaveLife(entry?.save)
				})
			}
			for (const relation of value?.relations || []) {
				if (!requiresRelationSurgeRecovery(relation) || !relation.surgeSave) continue
				result.push({
					identity: String(relation.surge.identity || ''),
					position: normalizePosition(relation.surge.position) || [0, 0],
					life: surgeSaveLife(relation.surgeSave)
				})
			}
			return result.sort(compareSurgeRuntimeStates)
		}

		function createStrictSurgeRuntimeStates(value) {
			const relationSurges = relationSurgeIdentities(value?.relations)
			const strict = Object.assign({}, value, {
				removals: (value?.removals || []).filter(function (entry) {
					return normalizeRemovalLayer(entry?.layer, entry) !== 'surge' ||
						relationSurges.has(String(entry?.identity || ''))
				})
			})
			return createSurgeRuntimeStates(strict)
		}

		function normalizeSurgeRuntimeStates(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					identity: String(entry?.identity || ''),
					position: normalizePosition(entry?.position) || [0, 0],
					life: Number(entry?.life)
				}
			}).sort(compareSurgeRuntimeStates)
		}

		function createGrowStates(value, paintCubeState) {
			const result = []
			for (const pair of [
				['removal', value?.removals || []],
				['protected', value?.protectedTargets || []]
			]) {
				for (const entry of pair[1]) {
					let paint = null
					try { paint = paintCubeState?.normalizePaint?.(entry?.save) || null } catch (error) {}
					if (!paint || paint.version !== paintCubeState?.growPaintVersion) continue
					result.push({
						identity: String(entry?.identity || ''),
						disposition: pair[0],
						position: normalizePosition(entry?.position) || [0, 0],
						paint: jsonClone(paint)
					})
				}
			}
			return result.sort(compareGrowStates)
		}

		function plansMatch(
			beforeValue,
			afterValue,
			paintCubeState,
			resolvePumpCubeState,
			resolveOrdinaryCubeState,
			options
		) {
			const beforeSignature = String(beforeValue?.planSignature || beforeValue?.signature || '')
			const afterSignature = String(afterValue?.signature || '')
			if (beforeSignature && beforeSignature === afterSignature) return true
			const standardCompatibility = !!beforeValue?.compatibilitySignature &&
				beforeValue.compatibilitySignature === afterValue?.compatibilitySignature
			const dynamicCubeCompatibility = !!beforeValue?.dynamicCubeSignature &&
				beforeValue.dynamicCubeSignature === afterValue?.dynamicCubeSignature &&
				compatibleOrdinaryCubeRuntimeStates(
					beforeValue.ordinaryCubeStates,
					afterValue?.ordinaryCubeStates,
					resolveOrdinaryCubeState
				)
			const pumpDependencyCompatibility = !!beforeValue?.pumpDependencySignature &&
				beforeValue.pumpDependencySignature === afterValue?.pumpDependencySignature &&
				compatiblePumpCubeStates(beforeValue, afterValue, resolvePumpCubeState) &&
				compatibleOrdinaryCubeRuntimeStates(
					beforeValue.ordinaryCubeStates,
					afterValue?.ordinaryCubeStates,
					resolveOrdinaryCubeState
				)
			const dynamicSurgeCompatibility = options?.allowDynamicStandaloneSurges === true &&
				!!beforeValue?.dynamicSurgeSignature &&
				beforeValue.dynamicSurgeSignature === afterValue?.dynamicSurgeSignature &&
				compatiblePumpCubeStates(beforeValue, afterValue, resolvePumpCubeState) &&
				compatibleOrdinaryCubeRuntimeStates(
					beforeValue.ordinaryCubeStates,
					afterValue?.ordinaryCubeStates,
					resolveOrdinaryCubeState
				)
			const cutRetainedCubeCompatibility = options?.allowCutRetainedCubeRebase === true &&
				!!beforeValue?.cutRetainedCubeSignature &&
				beforeValue.cutRetainedCubeSignature === afterValue?.cutRetainedCubeSignature
			if (
				!standardCompatibility &&
				!dynamicCubeCompatibility &&
				!pumpDependencyCompatibility &&
				!dynamicSurgeCompatibility &&
				!cutRetainedCubeCompatibility
			) return false
			if (
				!cutRetainedCubeCompatibility &&
				!monotonicPaintedRuntimeStates(beforeValue.paintedStates, afterValue?.paintedStates)
			) return false
			if (!monotonicSurgeRuntimeStates(
				dynamicSurgeCompatibility ? beforeValue.strictSurgeStates : beforeValue.surgeStates,
				dynamicSurgeCompatibility ? afterValue?.strictSurgeStates : afterValue?.surgeStates
			)) return false
			if (cutRetainedCubeCompatibility) return true
			const beforeGrow = normalizeGrowStates(beforeValue.growStates)
			const afterGrow = normalizeGrowStates(afterValue?.growStates)
			if (!beforeGrow.length && !afterGrow.length) return true
			return monotonicGrowStates(beforeGrow, afterGrow, paintCubeState)
		}

		function diagnosePlansMatch(
			beforeValue,
			afterValue,
			paintCubeState,
			resolvePumpCubeState,
			resolveOrdinaryCubeState,
			options
		) {
			const beforeSignature = String(beforeValue?.planSignature || beforeValue?.signature || '')
			const afterSignature = String(afterValue?.signature || '')
			const signatureMatch = !!beforeSignature && beforeSignature === afterSignature
			const ordinaryRuntimeMatch = compatibleOrdinaryCubeRuntimeStates(
				beforeValue?.ordinaryCubeStates,
				afterValue?.ordinaryCubeStates,
				resolveOrdinaryCubeState
			)
			const pumpRuntimeMatch = compatiblePumpCubeStates(beforeValue, afterValue, resolvePumpCubeState)
			const branches = {
				standard: {
					signatureMatch: !!beforeValue?.compatibilitySignature &&
						beforeValue.compatibilitySignature === afterValue?.compatibilitySignature
				},
				dynamicCube: {
					signatureMatch: !!beforeValue?.dynamicCubeSignature &&
						beforeValue.dynamicCubeSignature === afterValue?.dynamicCubeSignature,
					ordinaryRuntimeMatch
				},
				pumpDependency: {
					signatureMatch: !!beforeValue?.pumpDependencySignature &&
						beforeValue.pumpDependencySignature === afterValue?.pumpDependencySignature,
					pumpRuntimeMatch,
					ordinaryRuntimeMatch
				},
				dynamicSurge: {
					enabled: options?.allowDynamicStandaloneSurges === true,
					signatureMatch: !!beforeValue?.dynamicSurgeSignature &&
						beforeValue.dynamicSurgeSignature === afterValue?.dynamicSurgeSignature,
					pumpRuntimeMatch,
					ordinaryRuntimeMatch
				},
				cutRetainedCube: {
					enabled: options?.allowCutRetainedCubeRebase === true,
					signatureMatch: !!beforeValue?.cutRetainedCubeSignature &&
						beforeValue.cutRetainedCubeSignature === afterValue?.cutRetainedCubeSignature
				}
			}
			branches.standard.accepted = branches.standard.signatureMatch
			branches.dynamicCube.accepted = branches.dynamicCube.signatureMatch && ordinaryRuntimeMatch
			branches.pumpDependency.accepted = branches.pumpDependency.signatureMatch &&
				pumpRuntimeMatch && ordinaryRuntimeMatch
			branches.dynamicSurge.accepted = branches.dynamicSurge.enabled &&
				branches.dynamicSurge.signatureMatch && pumpRuntimeMatch && ordinaryRuntimeMatch
			branches.cutRetainedCube.accepted = branches.cutRetainedCube.enabled &&
				branches.cutRetainedCube.signatureMatch
			const compatibilityAccepted = Object.keys(branches).some(function (name) {
				return branches[name].accepted === true
			})
			const paintedRuntimeMatch = monotonicPaintedRuntimeStates(
				beforeValue?.paintedStates,
				afterValue?.paintedStates
			)
			const surgeRuntimeMatch = monotonicSurgeRuntimeStates(
				branches.dynamicSurge.accepted ? beforeValue?.strictSurgeStates : beforeValue?.surgeStates,
				branches.dynamicSurge.accepted ? afterValue?.strictSurgeStates : afterValue?.surgeStates
			)
			const beforeGrow = normalizeGrowStates(beforeValue?.growStates)
			const afterGrow = normalizeGrowStates(afterValue?.growStates)
			const growRuntimeMatch = (!beforeGrow.length && !afterGrow.length) ||
				monotonicGrowStates(beforeGrow, afterGrow, paintCubeState)
			let stage = 'accepted'
			if (!signatureMatch) {
				if (!compatibilityAccepted) stage = 'compatibility-branches'
				else if (!branches.cutRetainedCube.accepted && !paintedRuntimeMatch) stage = 'painted-runtime'
				else if (!surgeRuntimeMatch) stage = 'surge-runtime'
				else if (!branches.cutRetainedCube.accepted && !growRuntimeMatch) stage = 'grow-runtime'
			}
			return {
				stage,
				signatureMatch,
				compatibilityAccepted,
				compatibilityBranches: branches,
				runtimeChecks: {
					ordinaryCube: ordinaryRuntimeMatch,
					pumpCube: pumpRuntimeMatch,
					painted: paintedRuntimeMatch,
					surge: surgeRuntimeMatch,
					grow: growRuntimeMatch
				}
			}
		}

		function diagnosticPlanTargetDifferences(beforeValue, afterValue, enrich) {
			return {
				removal: diagnosticTargetSetDifference(
					diagnosticTargetEntries(beforeValue, 'removal'),
					diagnosticTargetEntries(afterValue, 'removal'),
					enrich
				),
				protected: diagnosticTargetSetDifference(
					diagnosticTargetEntries(beforeValue, 'protected'),
					diagnosticTargetEntries(afterValue, 'protected'),
					enrich
				)
			}
		}

		function diagnosticTargetEntries(value, kind) {
			if (kind === 'removal' && Array.isArray(value?.removals)) return value.removals
			if (kind === 'protected' && Array.isArray(value?.protectedTargets)) return value.protectedTargets
			return Array.isArray(value?.diagnosticTargets?.[kind]) ? value.diagnosticTargets[kind] : []
		}

		function diagnosticTargetSetDifference(beforeValue, afterValue, enrich) {
			const before = new Map((beforeValue || []).map(function (entry) {
				return [diagnosticTargetKey(entry), entry]
			}))
			const after = new Map((afterValue || []).map(function (entry) {
				return [diagnosticTargetKey(entry), entry]
			}))
			const result = { added: [], removed: [], changed: [] }
			for (const key of Array.from(new Set(
				Array.from(before.keys()).concat(Array.from(after.keys()))
			)).sort()) {
				const oldEntry = before.get(key) || null
				const newEntry = after.get(key) || null
				const oldSummary = oldEntry ? diagnosticTargetSummary(oldEntry) : null
				const newSummary = newEntry ? diagnosticTargetSummary(newEntry) : null
				if (oldEntry && newEntry && samePlain(oldSummary, newSummary)) continue
				const difference = { before: oldSummary, after: newSummary }
				const extra = typeof enrich === 'function' ? enrich(newEntry || oldEntry) : null
				if (extra && typeof extra === 'object') Object.assign(difference, extra)
				if (!oldEntry) result.added.push(difference)
				else if (!newEntry) result.removed.push(difference)
				else result.changed.push(difference)
			}
			return result
		}

		function diagnosticTargetKey(entry) {
			const identity = String(entry?.identity || '')
			if (identity) return 'identity:' + identity
			const position = normalizePosition(entry?.position) || [0, 0]
			return [
				'name:' + safeName(entry?.name || entry?.save?.name),
				'position:' + position[0] + ',' + position[1]
			].join('|')
		}

		function diagnosticTargetSummary(entry) {
			const savedState = Number(entry?.save?.par?.state)
			const directState = entry?.state === null || entry?.state === undefined
				? NaN
				: Number(entry.state)
			const pumpIdentity = entry?.pump
				? String(entry.pump.identity || '') || null
				: String(entry?.pumpIdentity || '') || null
			const pumpName = entry?.pump ? safeName(entry.pump.name) : safeName(entry?.pumpName)
			const pumpPosition = entry?.pump
				? normalizePosition(entry.pump.position)
				: normalizePosition(entry?.pumpPosition)
			return {
				identity: String(entry?.identity || ''),
				name: safeName(entry?.name || entry?.save?.name),
				layer: normalizeRemovalLayer(entry?.layer, entry),
				position: normalizePosition(entry?.position),
				reason: String(entry?.reason || ''),
				state: Number.isFinite(savedState)
					? savedState
					: Number.isFinite(directState) ? directState : null,
				pumpIdentity,
				pumpName: pumpName || null,
				pumpPosition
			}
		}

		function compatiblePumpCubeStates(beforeValue, afterValue, resolvePumpCubeState) {
			const before = normalizePumpCubeStates(beforeValue?.pumpCubeStates)
			const after = normalizePumpCubeStates(afterValue?.pumpCubeStates)
			const afterByIdentity = new Map(after.map(function (entry) {
				return [entry.identity, entry]
			}))
			for (const oldEntry of before) {
				if (oldEntry.state !== 0 && oldEntry.state !== 1) continue
				const newEntry = afterByIdentity.get(oldEntry.identity) ||
					(typeof resolvePumpCubeState === 'function' ? resolvePumpCubeState(oldEntry.identity) : null)
				if (!newEntry || newEntry.state === 2) continue
				if (qualifiedPumpCubeTerminalTransition(oldEntry, newEntry)) continue
				if (
					(newEntry.state !== 0 && newEntry.state !== 1) ||
					!samePumpCubeAnchor(oldEntry, newEntry) ||
					newEntry.state < oldEntry.state
				) return false
			}
			return true
		}

		function qualifiedPumpCubeTerminalTransition(before, after) {
			return (before?.state === 0 || before?.state === 1) &&
				before?.killme !== true &&
				before?.resourcesValid === true &&
				before?.paintFree === true &&
				before?.selectedOwner === true &&
				before?.inSelectedPumpVicinity === true &&
				after?.state === 3 &&
				after?.killme === true &&
				after?.resourcesValid === true &&
				after?.paintFree === true &&
				after?.selectedOwner === true &&
				after?.inSelectedPumpVicinity === true &&
				samePumpCubeAnchor(before, after)
		}

		function samePumpCubeAnchor(before, after) {
			return comparePositions(before?.position, after?.position) === 0 &&
				String(before?.pump?.identity || '') === String(after?.pump?.identity || '') &&
				safeName(before?.pump?.name) === safeName(after?.pump?.name) &&
				comparePositions(before?.pump?.position || [0, 0], after?.pump?.position || [0, 0]) === 0
		}

		function monotonicPaintedRuntimeStates(beforeValue, afterValue) {
			const before = normalizePaintedRuntimeStates(beforeValue)
			const after = normalizePaintedRuntimeStates(afterValue)
			if (before.length !== after.length) return false
			for (let index = 0; index < before.length; index += 1) {
				if (
					comparePaintedRuntimeStates(before[index], after[index]) !== 0 ||
					!Number.isFinite(before[index].broken) ||
					!Number.isFinite(after[index].broken) ||
					before[index].broken < 0 ||
					before[index].broken > 1 ||
					after[index].broken < 0 ||
					after[index].broken > 1 ||
					after[index].broken + EPSILON < before[index].broken
				) return false
			}
			return true
		}

		function comparePaintedRuntimeStates(left, right) {
			const leftPosition = normalizePosition(left?.position) || [0, 0]
			const rightPosition = normalizePosition(right?.position) || [0, 0]
			return (
				String(left?.identity || '').localeCompare(String(right?.identity || '')) ||
				comparePositions(leftPosition, rightPosition)
			)
		}

		function monotonicSurgeRuntimeStates(beforeValue, afterValue) {
			const before = normalizeSurgeRuntimeStates(beforeValue)
			const after = normalizeSurgeRuntimeStates(afterValue)
			if (before.length !== after.length) return false
			for (let index = 0; index < before.length; index += 1) {
				if (
					compareSurgeRuntimeStates(before[index], after[index]) !== 0 ||
					!Number.isFinite(before[index].life) ||
					!Number.isFinite(after[index].life) ||
					before[index].life <= 0 ||
					after[index].life <= 0 ||
					after[index].life > before[index].life + EPSILON
				) return false
			}
			return true
		}

		function compareSurgeRuntimeStates(left, right) {
			const leftPosition = normalizePosition(left?.position) || [0, 0]
			const rightPosition = normalizePosition(right?.position) || [0, 0]
			return (
				String(left?.identity || '').localeCompare(String(right?.identity || '')) ||
				comparePositions(leftPosition, rightPosition)
			)
		}

		function monotonicGrowStates(beforeValue, afterValue, paintCubeState) {
			const before = normalizeGrowStates(beforeValue)
			const after = normalizeGrowStates(afterValue)
			if (!before.length || before.length !== after.length) return false
			for (let index = 0; index < before.length; index += 1) {
				const oldEntry = before[index]
				const newEntry = after[index]
				if (
					compareGrowStates(oldEntry, newEntry) !== 0 ||
					typeof paintCubeState?.sameGrowIdentity !== 'function' ||
					!paintCubeState.sameGrowIdentity(oldEntry.paint, newEntry.paint) ||
					!paintCubeState.matchesGrowProgress?.(newEntry.paint, oldEntry.paint) ||
					growPhaseOrder(newEntry.paint?.growth?.phase) < growPhaseOrder(oldEntry.paint?.growth?.phase)
				) return false
			}
			return true
		}

		function compareGrowStates(left, right) {
			const leftPosition = normalizePosition(left?.position) || [0, 0]
			const rightPosition = normalizePosition(right?.position) || [0, 0]
			return (
				String(left?.disposition || '').localeCompare(String(right?.disposition || '')) ||
				String(left?.identity || '').localeCompare(String(right?.identity || '')) ||
				comparePositions(leftPosition, rightPosition)
			)
		}

		function comparePumpCubeStates(left, right) {
			const leftPosition = normalizePosition(left?.position) || [0, 0]
			const rightPosition = normalizePosition(right?.position) || [0, 0]
			return (
				String(left?.identity || '').localeCompare(String(right?.identity || '')) ||
				comparePositions(leftPosition, rightPosition)
			)
		}

		function growPhaseOrder(value) {
			return ({ growing: 0, revealing: 1, stable: 2 })[String(value || '')] ?? -1
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
					relations: fingerprint(value?.relations),
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
						fingerprint: fingerprint(entry?.save),
						fields: saveFieldFingerprints(entry?.save)
					}
				})
			}
		}

		function comparePlanSignatures(beforeSignature, afterSignature) {
			try {
				const before = JSON.parse(String(beforeSignature || ''))
				const after = JSON.parse(String(afterSignature || ''))
				const difference = comparePlanFingerprints(
					createPlanFingerprints(before),
					createPlanFingerprints(after)
				)
				if (difference.changedComponents.includes('protectedTargets')) {
					difference.beforeProtected = signatureTargetSummary(before.protectedTargets)
					difference.afterProtected = signatureTargetSummary(after.protectedTargets)
				}
				return difference
			} catch (error) {
				return {
					available: false,
					changedComponents: ['unknown'],
					changedRemovalSaves: []
				}
			}
		}

		function signatureTargetSummary(value) {
			return (value || []).map(function (entry) {
				return {
					name: safeName(entry?.name || entry?.save?.name),
					layer: normalizeRemovalLayer(entry?.layer, entry),
					position: normalizePosition(entry?.position),
					reason: String(entry?.reason || '')
				}
			})
		}

		function normalizePlanFingerprints(value) {
			if (Number(value?.version) !== 1 || !value?.components) return null
			const names = [
				'source',
				'removalTargets',
				'removalSaves',
				'relations',
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
						fingerprint: String(entry?.fingerprint || ''),
						fields: normalizeFieldFingerprints(entry?.fields)
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
					change: !oldEntry ? 'added' : !newEntry ? 'removed' : 'changed',
					fields: changedSaveFields(oldEntry?.fields, newEntry?.fields)
				})
			}
			return {
				available: true,
				changedComponents,
				changedRemovalSaves
			}
		}

		function saveFieldFingerprints(value) {
			const fields = value?.par && typeof value.par === 'object' ? value.par : {}
			return Object.keys(fields).sort().map(function (name) {
				return { name, fingerprint: fingerprint(fields[name]) }
			})
		}

		function normalizeFieldFingerprints(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return {
					name: String(entry?.name || ''),
					fingerprint: String(entry?.fingerprint || '')
				}
			}).filter(function (entry) { return !!entry.name }).sort(function (left, right) {
				return left.name.localeCompare(right.name)
			})
		}

		function changedSaveFields(beforeValue, afterValue) {
			const before = new Map(normalizeFieldFingerprints(beforeValue).map(function (entry) {
				return [entry.name, entry.fingerprint]
			}))
			const after = new Map(normalizeFieldFingerprints(afterValue).map(function (entry) {
				return [entry.name, entry.fingerprint]
			}))
			return Array.from(new Set(Array.from(before.keys()).concat(Array.from(after.keys())))).sort().filter(function (name) {
				return before.get(name) !== after.get(name)
			})
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

		function normalizeOrigin(value) {
			return value === 'native' ? 'native' : String(value || '') === 'cut' ? 'cut' : 'delete'
		}

		function cutRetainedCubeRebaseAllowed(origin, source, direction) {
			return direction === 'forward' &&
				normalizeOrigin(origin) === 'cut' &&
				source?.removeCubes !== true &&
				source?.removePaintedCubes !== true
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

		function relationKey(relation) {
			return String(relation?.stabilizer?.identity || '') + '|' + String(relation?.surge?.identity || '')
		}

		function requiresRelationSurgeRecovery(relation) {
			return safeName(relation?.stabilizer?.name) === 'stabilizer3' &&
				relation?.removeStabilizer === true &&
				relation?.removeSurge !== true
		}

		function normalizeRelationSurgeSave(value, relation) {
			const save = jsonClone(value)
			const position = normalizePosition(save?.position)
			const expectedPosition = normalizePosition(relation?.surge?.position)
			const stabilizerPosition = normalizePosition(relation?.stabilizer?.position)
			if (
				safeName(save?.name) !== 'surge' ||
				!position ||
				!expectedPosition ||
				position[0] !== expectedPosition[0] ||
				position[1] !== expectedPosition[1] ||
				!stabilizerPosition ||
				!save.par ||
				typeof save.par !== 'object' ||
				!Array.isArray(save.par.resources) ||
				!Number.isFinite(Number(save.par.life)) ||
				Number(save.par.life) <= 0 ||
				!Number.isFinite(Number(save.par.maxLife)) ||
				Number(save.par.maxLife) <= 0
			) return null
			save.position = expectedPosition
			save.par.stabilizerPosition = stabilizerPosition
			return save
		}

		function compareRelations(left, right) {
			return comparePositions(left.stabilizer.position, right.stabilizer.position) ||
				comparePositions(left.surge.position, right.surge.position) ||
				relationKey(left).localeCompare(relationKey(right))
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
