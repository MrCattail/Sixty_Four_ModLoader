ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const PLACEMENT_KEY = Symbol.for('cattail.world-editor.blueprint-placement')
		const TRANSACTION_KIND = 'blueprint-placement'
		const SERVICE_VERSION = '1.1.0'
		const ADAPTER_VERSION = '1.0.0'
		const PROBE_EVENT_LIMIT = 200
		const EPSILON = 1e-7
		const RESTORABLE_NAMES = new Set([
			'pinhole',
			'strange1',
			'strange2',
			'strange3',
			'voidsculpture',
			'chasm',
			'gradient',
			'waypoint2',
			'conductor',
			'vault',
			'pump',
			'pump2',
			'destabilizer',
			'destabilizer2',
			'destabilizer2a',
			'injector',
			'doublechannel',
			'doublechannel2',
			'valve',
			'auxpump',
			'auxpump2',
			'entropic',
			'entropic2',
			'entropic2a',
			'entropic3',
			'converter32',
			'converter13',
			'converter41',
			'converter76',
			'converter64',
			'reflector',
			'preheater',
			'mega1',
			'mega1a',
			'mega1b',
			'mega2',
			'mega3',
			'eye',
			'silo',
			'silo2',
			'vessel',
			'vessel2',
			'consumer',
			'generaldecay',
			'waypoint',
			'annihilator',
			'flower',
			'fruit',
			'clicker1',
			'clicker2',
			'clicker3',
			'stabilizer',
			'stabilizer2'
		])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const transactions = globalThis[TRANSACTIONS_KEY]
			const planner = globalThis[PLAN_KEY]
			const creative = globalThis[CREATIVE_KEY]
			const previous = globalThis[PLACEMENT_KEY]
			previous?.dispose?.('blueprint-placement-replaced')

			if (
				!runtime ||
				runtime.game !== game ||
				!transactions ||
				transactions.game !== game ||
				typeof transactions.registerAdapter !== 'function' ||
				typeof transactions.execute !== 'function' ||
				!planner ||
				typeof planner.build !== 'function'
			) {
				console.warn('[Cattail World Editor] Blueprint placement 4C-1c could not find its core services.')
				return
			}

			const service = createService(game, transactions, planner, creative)
			Object.defineProperty(globalThis, PLACEMENT_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Safe structure blueprint placement and empty sync 4C-1c ready.')
		})

		function createService(game, transactions, planner, creative) {
			const listeners = new Set()
			const identityByEntity = new WeakMap()
			const transactionData = new Map()
			const operations = new Map()
			const probeEvents = []
			let identitySequence = 0
			let probeSequence = 0
			let disposed = false
			let busy = false
			let phase = 'idle'
			let revision = 0
			let lastReason = 'initialized'
			let lastResult = null
			let error = null

			const adapter = {
				version: ADAPTER_VERSION,
				async prepare(context, request) {
					requireCurrent(context)
					const blueprint = cloneBlueprint(request?.blueprint)
					const target = normalizePosition(request?.target)
					const replaceConflicts = request?.replaceConflicts === true
					const syncEmpty = request?.syncEmpty === true
					traceProbe('adapter.prepare.start', {
						operationId: context?.operationId,
						direction: context?.direction,
						target,
						replaceConflicts,
						syncEmpty,
						confirmedSignature: signatureProbe(request?.confirmedSignature)
					})
					if (!target) throw placementError('INVALID_TARGET', 'A valid blueprint placement target is required.')
					const plan = await planner.build(game, blueprint, target, {
						chunkSize: 512,
						includeDynamicConflicts: true,
						isCancelled() {
							return !context.isCurrent()
						},
						canReplaceEntity(entity) {
							return assessEntity(entity)
						}
					})
					requireCurrent(context)
					const proposal = createPlacementProposal(plan, {
						replaceConflicts,
						syncEmpty,
						transactionBuilds: true
					})
					const confirmedSignature = String(request?.confirmedSignature || '')
					traceProbe('adapter.prepare.rebuilt', {
						plan: planProbeDetails(plan),
						proposal: proposalProbeDetails(proposal),
						confirmedSignature: signatureProbe(confirmedSignature),
						rebuiltSignature: signatureProbe(proposal.signature),
						signatureMatch: !confirmedSignature || proposal.signature === confirmedSignature,
						signatureDifference: compareSignaturePayloads(confirmedSignature, proposal.signature)
					})
					if (confirmedSignature && proposal.signature !== confirmedSignature) {
						throw placementError('TARGET_CHANGED', 'The confirmed blueprint placement target changed.')
					}
					if (!proposal.summary.changeCount) {
						throw placementError('NOTHING_TO_CHANGE', 'The blueprint placement would not change the world.')
					}
					return {
						summary: proposal.transactionSummary,
						scope: proposal.scope,
						payload: proposal.payload
					}
				},
				async preflight(context, record, direction) {
					requireCurrent(context)
					validateRecord(record)
					requireGameMethods(game)
					const payload = record.payload
					traceProbe('adapter.preflight.start', {
						operationId: context?.operationId,
						direction,
						hasSnapshot: !!context?.snapshotId,
						payload: payloadProbeDetails(payload)
					})
					if (creativeActive(creative, game) !== payload.economy.creative) {
						return traceDenied(
							'adapter.preflight.denied',
							denied('ECONOMY_MODE_CHANGED', 'Creative mode changed after this placement was prepared.'),
							{ direction, stage: 'economy-mode' }
						)
					}
					if (direction === 'forward') {
						const resourcesChanged = !sameNumericArray(game.resources, payload.resourcesBefore)
						if (resourcesChanged) {
							if (!context?.snapshotId) {
								return traceDenied(
									'adapter.preflight.denied',
									denied('RESOURCES_CHANGED', 'Resources changed after this placement was prepared.'),
									{ direction, stage: 'resources' }
								)
							}
							traceProbe('adapter.preflight.resources-rebased', {
								direction,
								stage: 'post-snapshot',
								resourcesBefore: numericArray(payload.resourcesBefore),
								resourcesCurrent: numericArray(game.resources)
							})
						}
						if (!samePlain(captureStats(game), payload.statsBefore)) {
							return traceDenied(
								'adapter.preflight.denied',
								denied('STATS_CHANGED', 'World statistics changed after this placement was prepared.'),
								{ direction, stage: 'stats' }
							)
						}
						if (!samePlain(captureOnlyones(game, payload.onlyOneKeys), payload.onlyonesBefore)) {
							return traceDenied(
								'adapter.preflight.denied',
								denied('ONLYONE_CHANGED', 'Only-one state changed after this placement was prepared.'),
								{ direction, stage: 'onlyone' }
							)
						}
					}
					const targetState = inspectTargetState(payload, direction)
					if (!targetState.ok) {
						return traceDenied('adapter.preflight.denied', targetState, {
							direction,
							stage: 'target-state'
						})
					}
					if (direction !== 'undo') {
						try {
							const currentEconomy = simulateEconomy(
								game,
								payload.builds,
								payload.removals,
								payload.economy.creative
							)
							if (!sameEconomy(currentEconomy, payload.economy)) {
								return traceDenied(
									'adapter.preflight.denied',
									denied('PRICE_CHANGED', 'Building or eraser prices changed before placement.'),
									{ direction, stage: 'economy' }
								)
							}
						} catch (economyError) {
							return traceDenied(
								'adapter.preflight.denied',
								denied(
									economyError?.code || 'PREFLIGHT_FAILED',
									economyError?.message || 'The placement economy could not be revalidated.'
								),
								{ direction, stage: 'economy-exception' }
							)
						}
					}
					const affordability = inspectAffordability(game.resources, payload.economy, direction)
					if (!affordability.ok) {
						return traceDenied('adapter.preflight.denied', affordability, {
							direction,
							stage: 'affordability'
						})
					}
					traceProbe('adapter.preflight.ready', {
						direction,
						hasSnapshot: !!context?.snapshotId,
						deleteCount: payload.removals.length,
						buildCount: payload.builds.length
					})
					return approved()
				},
				async capture(context, record) {
					if (!context.isCurrent()) throw placementError('INVALIDATED', 'The placement operation was invalidated.')
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
					requireCurrent(context)
					validateRecord(record)
					traceProbe('adapter.apply.start', {
						operationId: context?.operationId,
						direction,
						payload: payloadProbeDetails(record.payload)
					})
					const state = {
						recordId: record.id,
						direction,
						mutations: [],
						resourcesBefore: numericArray(game.resources),
						statsBefore: captureStats(game),
						resourceDelta: [],
						statsDelta: { machinesBuild: 0, machinesSold: 0 },
						removedSaves: new Map()
					}
					operations.set(context.operationId, state)
					if (direction === 'undo') applyUndo(context, record, state)
					else applyForward(context, record, state)
					refreshWorld(game)
					traceProbe('adapter.apply.complete', {
						operationId: context?.operationId,
						direction,
						mutationCount: state.mutations.length,
						removedSaveCount: state.removedSaves.size
					})
					return { ok: true }
				},
				async verify(context, record, direction) {
					requireCurrent(context)
					const state = operations.get(context.operationId)
					traceProbe('adapter.verify.start', {
						operationId: context?.operationId,
						direction,
						hasOperationState: !!state
					})
					if (!state) {
						return traceDenied(
							'adapter.verify.denied',
							denied('VERIFY_FAILED', 'The placement operation state is unavailable.'),
							{ direction, stage: 'operation-state' }
						)
					}
					const expectedAfter = direction !== 'undo'
					const verification = verifyAppliedState(record.payload, state, expectedAfter)
					if (!verification.ok) {
						return traceDenied('adapter.verify.denied', verification, {
							direction,
							stage: 'applied-state'
						})
					}
					if (expectedAfter && state.removedSaves.size) {
						transactionData.set(record.id, {
							removalSaves: new Map(state.removedSaves)
						})
					}
					operations.delete(context.operationId)
					traceProbe('adapter.verify.ready', {
						operationId: context?.operationId,
						direction,
						deleteCount: record.payload.removals.length,
						buildCount: record.payload.builds.length
					})
					return approved()
				},
				async restore(context, record) {
					const state = operations.get(context.operationId)
					traceProbe('adapter.restore.start', {
						operationId: context?.operationId,
						direction: context?.direction,
						hasOperationState: !!state
					})
					if (!state) {
						return traceDenied(
							'adapter.restore.denied',
							denied('ROLLBACK_FAILED', 'The placement rollback state is unavailable.'),
							{ stage: 'operation-state' }
						)
					}
					try {
						rollbackMutations(state)
						refreshWorld(game)
						operations.delete(context.operationId)
						traceProbe('adapter.restore.complete', {
							operationId: context?.operationId,
							mutationCount: state.mutations.length
						})
						return { ok: true }
					} catch (rollbackError) {
						console.error('[Cattail World Editor] Blueprint placement rollback failed.', rollbackError)
						return traceDenied(
							'adapter.restore.denied',
							denied('ROLLBACK_FAILED', rollbackError?.message || 'The placement rollback failed.'),
							{ stage: 'rollback-exception' }
						)
					}
				}
			}

			const unregisterAdapter = transactions.registerAdapter(TRANSACTION_KIND, adapter)

			function snapshot() {
				const transactionSnapshot = transactions.snapshot?.() || null
				return Object.freeze({
					version: SERVICE_VERSION,
					ready: !disposed && !!transactionSnapshot?.ready,
					busy: !disposed && busy,
					phase: disposed ? 'idle' : phase,
					revision,
					lastReason,
					lastResult,
					error: publicError(error),
					terminalBlockedReason: transactionSnapshot?.terminalBlockedReason || null,
					canUndo: !!transactionSnapshot?.canUndo,
					canRedo: !!transactionSnapshot?.canRedo,
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
						console.warn('[Cattail World Editor] Blueprint placement listener failed.', listenerError)
					}
				}
			}

			function traceProbe(event, details) {
				const normalizedDetails = probeDetails(details)
				const entry = Object.freeze({
					sequence: ++probeSequence,
					timestamp: Date.now(),
					event: String(event || 'unknown'),
					details: normalizedDetails
				})
				probeEvents.push(entry)
				if (probeEvents.length > PROBE_EVENT_LIMIT) {
					probeEvents.splice(0, probeEvents.length - PROBE_EVENT_LIMIT)
				}
				return entry
			}

			function probeSnapshot() {
				const transactionState = transactions.snapshot?.() || null
				return Object.freeze({
					version: 1,
					generatedAt: Date.now(),
					service: {
						ready: !disposed,
						busy,
						phase,
						lastReason,
						error: publicError(error)
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

			function traceDenied(event, result, details) {
				traceProbe(event, Object.assign({}, details || {}, {
					code: result?.code,
					message: result?.message
				}))
				return result
			}

			async function runOperation(kind, callback) {
				if (disposed) return rejectedResult('NOT_READY', 'Blueprint placement is unavailable.')
				if (busy || transactions.isBusy?.()) return rejectedResult('BUSY', 'Another World Editor transaction is running.')
				busy = true
				phase = kind === 'place' ? 'placing' : kind
				error = null
				traceProbe('operation.start', {
					kind,
					transactionBusy: !!transactions.isBusy?.()
				})
				notify('blueprint-placement-' + kind + '-started')
				try {
					const result = await callback()
					lastResult = result || null
					error = result?.error || null
					const transactionSnapshot = transactions.snapshot?.()
					phase = transactionSnapshot?.terminalBlockedReason
						? 'blocked'
						: result?.executed
							? 'success'
							: result?.reason === 'cancelled'
								? 'cancelled'
								: 'failed'
					traceProbe('operation.result', {
						kind,
						accepted: result?.accepted === true,
						executed: result?.executed === true,
						reason: result?.reason,
						errorCode: result?.error?.code,
						errorMessage: result?.error?.message,
						snapshotCreated: !!result?.snapshotId
					})
					return result
				} catch (operationError) {
					error = publicError(operationError)
					phase = transactions.snapshot?.().terminalBlockedReason ? 'blocked' : 'failed'
					const result = rejectedResult(error.code, error.message)
					lastResult = result
					traceProbe('operation.threw', {
						kind,
						code: operationError?.code,
						message: operationError?.message
					})
					return result
				} finally {
					busy = false
					traceProbe('operation.complete', { kind, phase })
					notify('blueprint-placement-' + kind + '-' + phase)
				}
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
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
					if (typeof listener !== 'function') throw new TypeError('Blueprint placement listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				assessEntity,
				canReplaceEntity(entity) {
					return assessEntity(entity).safe
				},
				analyze(plan) {
					if (disposed) throw placementError('NOT_READY', 'Blueprint placement is unavailable.')
					if (!plan || !Array.isArray(plan.records) || !normalizePosition(plan.target)) {
						throw placementError('INVALID_PLAN', 'A current blueprint preview plan is required.')
					}
					const guard = planner.inspect?.(game, plan.guard)
					if (guard && guard.valid === false) {
						if (guard.reason === 'resources' && typeof planner.refreshResources === 'function') {
							plan = planner.refreshResources(game, plan)
							traceProbe('analyze.resources-refreshed', {
								target: plan.target,
								resourceCount: Array.isArray(plan.guard?.resources) ? plan.guard.resources.length : 0
							})
						} else {
							throw placementError('TARGET_CHANGED', 'The blueprint placement target changed while options were prepared.')
						}
					}
					const variants = {}
					for (const replaceConflicts of [false, true]) {
						for (const syncEmpty of [false, true]) {
							const key = optionKey(replaceConflicts, syncEmpty)
							variants[key] = createPlacementProposal(plan, {
								replaceConflicts,
								syncEmpty,
								transactionBuilds: false
							})
						}
					}
					const syncVariant = variants['01']
					const hasEmptyTargets = (
						Number(syncVariant?.summary?.syncDeleteCount) +
						Number(syncVariant?.summary?.protectedCount)
					) > 0
					const analysis = Object.freeze({
						version: SERVICE_VERSION,
						target: clonePosition(plan.target),
						hasConflicts: Number(plan.statusCounts?.conflict) > 0,
						hasEmptyMask: Array.isArray(plan.emptyCells) && plan.emptyCells.length > 0,
						hasEmptyTargets,
						variants: Object.freeze(variants)
					})
					traceProbe('analyze.complete', {
						plan: planProbeDetails(plan),
						hasConflicts: analysis.hasConflicts,
						hasEmptyMask: analysis.hasEmptyMask,
						hasEmptyTargets: analysis.hasEmptyTargets,
						variants: proposalVariantsProbeDetails(analysis.variants)
					})
					return analysis
				},
				place(options) {
					const request = options || {}
					return runOperation('place', function () {
						return transactions.execute({
							kind: TRANSACTION_KIND,
							input: normalizeInput(request.input),
							payload: {
								blueprint: cloneBlueprint(request.blueprint),
								target: normalizePosition(request.target),
								replaceConflicts: request.replaceConflicts === true,
								syncEmpty: request.syncEmpty === true,
								confirmedSignature: String(request.confirmedSignature || '')
							}
						})
					})
				},
				undo(input) {
					return runOperation('undo', function () {
						return transactions.undo({ input: normalizeInput(input) })
					})
				},
				redo(input) {
					return runOperation('redo', function () {
						return transactions.redo({ input: normalizeInput(input) })
					})
				},
				isInputBlocked() {
					return !disposed && (busy || !!transactions.isBusy?.())
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					try {
						unregisterAdapter?.()
					} catch (unregisterError) {}
					listeners.clear()
					operations.clear()
					transactionData.clear()
					lastReason = String(reason || 'disposed')
					if (globalThis[PLACEMENT_KEY] === service) delete globalThis[PLACEMENT_KEY]
					return true
				}
			})
			return service

			function createPlacementProposal(plan, options) {
				const replaceConflicts = options?.replaceConflicts === true
				const syncEmpty = options?.syncEmpty === true
				let buildRecords = (plan.records || []).filter(function (record) {
					return record.status === 'buildable' || (replaceConflicts && record.status === 'conflict')
				})
				const emptyMask = new Set((plan.emptyCells || []).map(cellKey))
				const syncEntities = syncEmpty ? Array.from(new Set(plan.emptyEntities || [])) : []
				const blockedEntities = new Set()
				const blockedSources = new Map()

				for (let pass = 0; pass < 32; pass += 1) {
					const sources = collectRemovalSources(buildRecords, syncEntities)
					const safeExtractorEntries = Array.from(sources.values()).filter(function (entry) {
						return (
							!blockedEntities.has(entry.entity) &&
							isExtractorName(entry.name) &&
							assessEntity(entry.entity).safe
						)
					})
					const buildExtractorCount = buildRecords.filter(function (record) {
						return isExtractorName(record.name)
					}).length
					const finalExtractorCount = pumpFamilyCount(game) + buildExtractorCount - safeExtractorEntries.length
					if (finalExtractorCount >= 1 || !safeExtractorEntries.length) break
					safeExtractorEntries.sort(function (left, right) {
						const leftPriority = left.sync && !left.conflict ? 0 : left.sync ? 1 : 2
						const rightPriority = right.sync && !right.conflict ? 0 : right.sync ? 1 : 2
						return leftPriority - rightPriority || compareEntities(left.entity, right.entity)
					})
					const protectedEntry = safeExtractorEntries[0]
					blockedEntities.add(protectedEntry.entity)
					blockedSources.set(protectedEntry.identity, Object.assign({}, protectedEntry))
					if (protectedEntry.conflict) {
						buildRecords = buildRecords.filter(function (record) {
							return !(record.conflicts || []).includes(protectedEntry.entity)
						})
					}
				}

				const sources = collectRemovalSources(buildRecords, syncEntities)
				for (const blockedEntry of blockedSources.values()) {
					const existing = sources.get(blockedEntry.identity)
					if (existing) {
						existing.conflict = existing.conflict || blockedEntry.conflict
						existing.sync = existing.sync || blockedEntry.sync
					} else {
						sources.set(blockedEntry.identity, blockedEntry)
					}
				}
				const removals = []
				const protectedTargets = []
				for (const entry of sources.values()) {
					const assessment = blockedEntities.has(entry.entity)
						? assessmentResult(false, 'last-extractor')
						: assessEntity(entry.entity)
					const footprint = entityFootprint(entry.entity, entry.entity.position)
					const crossBoundary = entry.sync && footprintCrossesCellMask(footprint, emptyMask)
					if (assessment.safe) {
						removals.push(Object.assign(captureRestorableEntity(entry.entity), {
							sourceConflict: entry.conflict,
							sourceSync: entry.sync,
							crossBoundary
						}))
					} else if (entry.sync || entry.conflict) {
						protectedTargets.push(captureProtectedEntity(
							entry.entity,
							assessment.reason,
							entry.conflict,
							entry.sync,
							crossBoundary
						))
					}
				}
				removals.sort(compareDescriptors)
				protectedTargets.sort(compareDescriptors)

				const builds = buildRecords.map(function (record) {
					return {
						identity: options?.transactionBuilds
							? createIdentity('built')
							: 'preview-built-' + finiteInteger(record.id, record.index + 1),
						id: finiteInteger(record.id, record.index + 1),
						name: safeName(record.name),
						position: clonePosition(record.position),
						footprint: cloneFootprint(record.footprint),
						config: jsonClone(record.config || {})
					}
				}).sort(compareDescriptors)
				const removalIdentities = new Set(removals.map(function (entry) { return entry.identity }))
				const transients = collectTransientSurges(builds).filter(function (entry) {
					return !removalIdentities.has(entry.identity)
				})
				const scopeCells = collectScopeCells(plan.records, removals.concat(transients))
				const onlyOneKeys = collectOnlyOneKeys(game, builds, removals)
				const onlyonesBefore = captureOnlyones(game, onlyOneKeys)
				const onlyonesAfter = simulateOnlyones(game, onlyonesBefore, onlyOneKeys, builds, removals)
				const economy = simulateEconomy(game, builds, removals, creativeActive(creative, game))
				const resourcesBefore = numericArray(game.resources)
				const statsBefore = captureStats(game)
				const statsDelta = {
					machinesBuild: builds.length,
					machinesSold: removals.length
				}
				const replaceCount = removals.filter(function (entry) { return entry.sourceConflict }).length
				const syncDeleteCount = removals.filter(function (entry) { return entry.sourceSync }).length
				const protectedCount = protectedTargets.length
				const crossBoundaryCount = removals.concat(protectedTargets).filter(function (entry) {
					return entry.crossBoundary
				}).length
				const changeCount = builds.length + removals.length
				const summary = {
					buildCount: builds.length,
					replaceCount,
					syncDeleteCount,
					deleteCount: removals.length,
					protectedCount,
					crossBoundaryCount,
					transientCount: transients.length,
					skippedConflictCount: replaceConflicts
						? Math.max(0, Number(plan.statusCounts?.conflict) - buildRecords.filter(function (record) {
							return record.status === 'conflict'
						}).length)
						: Number(plan.statusCounts?.conflict) || 0,
					blockedCount: Number(plan.statusCounts?.blocked) || 0,
					changeCount,
					creative: economy.creative,
					resourceDelta: economy.delta.slice()
				}
				const signature = proposalSignature({
					target: plan.target,
					replaceConflicts,
					syncEmpty,
					builds,
					removals,
					protectedTargets,
					transients,
					economy,
					resourcesBefore,
					statsBefore,
					statsDelta,
					onlyonesBefore,
					onlyonesAfter
				})
				const transactionSummary = {
					label: 'Structure blueprint placement',
					buildCount: builds.length,
					replaceCount,
					syncDeleteCount,
					deleteCount: removals.length,
					protectedCount,
					crossBoundaryCount,
					transientCount: transients.length,
					skippedConflictCount: summary.skippedConflictCount,
					blockedCount: summary.blockedCount
				}
				const scope = {
					target: clonePosition(plan.target),
					cells: scopeCells,
					buildCount: builds.length,
					replaceCount,
					syncDeleteCount,
					deleteCount: removals.length,
					transientCount: transients.length
				}
				const payload = {
					schema: 2,
					target: clonePosition(plan.target),
					replaceConflicts,
					syncEmpty,
					confirmedSignature: signature,
					builds,
					removals,
					protectedTargets,
					transients,
					emptyCells: (plan.emptyCells || []).map(clonePosition),
					scopeCells,
					onlyOneKeys,
					onlyonesBefore,
					onlyonesAfter,
					economy,
					resourcesBefore,
					statsBefore,
					statsDelta
				}
				return Object.freeze({
					signature,
					options: Object.freeze({ replaceConflicts, syncEmpty }),
					summary: Object.freeze(summary),
					transactionSummary: Object.freeze(transactionSummary),
					scope: Object.freeze(scope),
					payload: Object.freeze(payload),
					removals: Object.freeze(removals),
					protectedTargets: Object.freeze(protectedTargets),
					emptyCells: Object.freeze((plan.emptyCells || []).map(clonePosition))
				})
			}

			function collectRemovalSources(buildRecords, syncEntities) {
				const sources = new Map()
				function add(entity, kind) {
					if (!entity || typeof entity !== 'object') return
					const identity = ensureIdentity(entity)
					let entry = sources.get(identity)
					if (!entry) {
						entry = {
							identity,
							entity,
							name: safeName(entity.name),
							conflict: false,
							sync: false
						}
						sources.set(identity, entry)
					}
					entry[kind] = true
				}
				for (const record of buildRecords || []) {
					if (record.status !== 'conflict') continue
					for (const entity of record.conflicts || []) add(entity, 'conflict')
				}
				for (const entity of syncEntities || []) add(entity, 'sync')
				return sources
			}

			function captureProtectedEntity(entity, reason, sourceConflict, sourceSync, crossBoundary) {
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
					sourceConflict: sourceConflict === true,
					sourceSync: sourceSync === true,
					crossBoundary: crossBoundary === true
				}
			}

			function compareEntities(left, right) {
				const leftPosition = normalizePosition(left?.position) || [0, 0]
				const rightPosition = normalizePosition(right?.position) || [0, 0]
				return leftPosition[1] - rightPosition[1] ||
					leftPosition[0] - rightPosition[0] ||
					safeName(left?.name).localeCompare(safeName(right?.name))
			}

			function isExtractorName(name) {
				return name === 'pump' || name === 'pump2' || name === 'gradient'
			}

			function footprintCrossesCellMask(footprint, mask) {
				for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
					for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
						if (!mask.has(u + ':' + v)) return true
					}
				}
				return false
			}

			function assessmentResult(safe, reason) {
				return { safe: safe === true, reason: String(reason || '') }
			}

			function assessEntity(entity) {
				if (!entity || typeof entity !== 'object') return assessment(false, 'missing')
				const name = safeName(entity.name)
				if (!RESTORABLE_NAMES.has(name)) return assessment(false, 'unsupported-type')
				const definition = game.codex?.entities?.[name]
				if (!definition || definition.canPurchase !== true) return assessment(false, 'not-purchasable')
				if (entity.indestructible === true) return assessment(false, 'indestructible')
				if (game.transportedEntity === entity) return assessment(false, 'being-relocated')
				if ((name === 'pump' || name === 'pump2') && hasAttachedCube(game, entity)) {
					return assessment(false, 'attached-cube')
				}
				if ((name === 'stabilizer' || name === 'stabilizer2') && entity.surge) {
					return assessment(false, 'attached-surge')
				}
				if (
					(name === 'pump' || name === 'pump2' || name === 'gradient') &&
					pumpFamilyCount(game) < 2
				) {
					return assessment(false, 'last-extractor')
				}
				try {
					const save = captureEntitySave(game, entity)
					if (!save || save.name !== name || !samePosition(save.position, entity.position)) {
						return assessment(false, 'save-unavailable')
					}
				} catch (saveError) {
					return assessment(false, 'save-unavailable')
				}
				return assessment(true, 'restorable')
			}

			function captureRestorableEntity(entity) {
				const save = captureEntitySave(game, entity)
				const position = normalizePosition(entity.position)
				if (!position || !save) throw placementError('UNSAFE_REPLACEMENT', 'A conflict could not be captured safely.')
				return {
					identity: ensureIdentity(entity),
					name: safeName(entity.name),
					position,
					footprint: entityFootprint(entity, position),
					save
				}
			}

			function collectTransientSurges(builds) {
				const seen = new Set()
				const transients = []
				for (const build of builds || []) {
					for (let v = build.footprint.minV; v <= build.footprint.maxV; v += 1) {
						for (let u = build.footprint.minU; u <= build.footprint.maxU; u += 1) {
							const entity = entityAt(game, [u, v])
							if (safeName(entity?.name) !== 'surge' || seen.has(entity)) continue
							seen.add(entity)
							transients.push(captureRestorableEntity(entity))
						}
					}
				}
				return transients.sort(compareDescriptors)
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

			function inspectTargetState(payload, direction) {
				if (direction === 'undo') {
					for (const build of payload.builds) {
						const entity = entityAt(game, build.position)
						if (
							!entity ||
							ensureIdentity(entity) !== build.identity ||
							safeName(entity.name) !== build.name
						) {
							return denied('EXTERNAL_CHANGE', 'A placed blueprint building changed outside World Editor.')
						}
					}
					return approved()
				}
				const removableIdentities = new Set(payload.removals.concat(payload.transients).map(function (entry) {
					return entry.identity
				}))
				for (const removal of payload.removals) {
					const entity = entityAt(game, removal.position)
					if (
						!entity ||
						ensureIdentity(entity) !== removal.identity ||
						safeName(entity.name) !== removal.name
					) {
						return denied('EXTERNAL_CHANGE', 'A replacement target changed outside World Editor.')
					}
					const assessment = assessEntity(entity)
					if (!assessment.safe) {
						return denied('UNSAFE_REPLACEMENT', 'A replacement target is no longer safe to restore.')
					}
					try {
						if (!samePlacementSave(captureEntitySave(game, entity), removal.save)) {
							return denied('EXTERNAL_CHANGE', 'A replacement target state changed outside World Editor.')
						}
					} catch (saveError) {
						return denied('UNSAFE_REPLACEMENT', 'A replacement target can no longer be serialized safely.')
					}
				}
				for (const transient of payload.transients) {
					const entity = entityAt(game, transient.position)
					if (
						!entity ||
						ensureIdentity(entity) !== transient.identity ||
						safeName(entity.name) !== 'surge'
					) {
						return denied('EXTERNAL_CHANGE', 'A transient surge changed outside World Editor.')
					}
					try {
						const currentSave = captureEntitySave(game, entity)
						if (
							safeName(currentSave?.name) !== 'surge' ||
							!samePosition(currentSave?.position, transient.position)
						) {
							return denied('EXTERNAL_CHANGE', 'A transient surge identity changed outside World Editor.')
						}
					} catch (saveError) {
						return denied('UNSAFE_REPLACEMENT', 'A transient surge can no longer be serialized safely.')
					}
				}
				for (const protectedTarget of payload.protectedTargets) {
					const entity = entityAt(game, protectedTarget.position)
					if (
						!entity ||
						ensureIdentity(entity) !== protectedTarget.identity ||
						safeName(entity.name) !== protectedTarget.name ||
						!samePlain(entityFootprint(entity, entity.position), protectedTarget.footprint)
					) {
						return denied('EXTERNAL_CHANGE', 'A protected placement target changed outside World Editor.')
					}
					if (protectedTarget.save) {
						try {
							if (!samePlacementSave(captureEntitySave(game, entity), protectedTarget.save)) {
								return denied('EXTERNAL_CHANGE', 'A protected placement target state changed outside World Editor.')
							}
						} catch (saveError) {
							return denied('EXTERNAL_CHANGE', 'A protected placement target can no longer be inspected safely.')
						}
					}
					const assessment = assessEntity(entity)
					if (protectedTarget.reason === 'last-extractor') {
						const buildExtractorCount = payload.builds.filter(function (entry) {
							return isExtractorName(entry.name)
						}).length
						const removalExtractorCount = payload.removals.filter(function (entry) {
							return isExtractorName(entry.name)
						}).length
						const wouldRemain = (
							pumpFamilyCount(game) +
							buildExtractorCount -
							removalExtractorCount -
							1
						)
						if (assessment.reason !== 'last-extractor' && wouldRemain >= 1) {
							return denied('EXTERNAL_CHANGE', 'The last-extractor protection result changed outside World Editor.')
						}
					} else if (assessment.safe || assessment.reason !== protectedTarget.reason) {
						return denied('EXTERNAL_CHANGE', 'A protected placement target safety result changed outside World Editor.')
					}
				}
				for (const build of payload.builds) {
					for (let v = build.footprint.minV; v <= build.footprint.maxV; v += 1) {
						for (let u = build.footprint.minU; u <= build.footprint.maxU; u += 1) {
							const entity = entityAt(game, [u, v])
							if (entity && !removableIdentities.has(ensureIdentity(entity))) {
								return denied('EXTERNAL_CHANGE', 'A blueprint placement footprint changed outside World Editor.')
							}
						}
					}
				}
				return approved()
			}

			function applyForward(context, record, state) {
				const payload = record.payload
				const resourceDelta = payload.economy.creative ? [] : payload.economy.delta
				applyResourceMutation(state, resourceDelta)
				for (const removal of payload.removals) {
					requireCurrent(context)
					const removed = removeExpectedEntity(removal)
					state.removedSaves.set(removal.identity, removed.save)
					state.mutations.push({ kind: 'removed', descriptor: removed })
				}
				for (const transient of payload.transients) {
					requireCurrent(context)
					const removed = removeExpectedEntity(transient)
					state.removedSaves.set(transient.identity, removed.save)
					state.mutations.push({ kind: 'removed', descriptor: removed })
				}
				for (const build of payload.builds) {
					requireCurrent(context)
					addExpectedEntity(build)
					state.mutations.push({ kind: 'created', descriptor: build })
				}
				applyStatsMutation(state, payload.statsDelta)
				applyOnlyoneMutation(state, payload.onlyOneKeys, payload.onlyonesAfter)
			}

			function applyUndo(context, record, state) {
				const payload = record.payload
				const resourceDelta = payload.economy.creative ? [] : negateArray(payload.economy.delta)
				applyResourceMutation(state, resourceDelta)
				for (const build of payload.builds.slice().reverse()) {
					requireCurrent(context)
					const removed = removeExpectedEntity(build)
					state.mutations.push({ kind: 'removed', descriptor: removed })
				}
				const saved = transactionData.get(record.id)?.removalSaves
				for (const removal of payload.removals) {
					requireCurrent(context)
					const descriptor = Object.assign({}, removal, {
						save: jsonClone(saved?.get(removal.identity) || removal.save)
					})
					addExpectedEntity(descriptor)
					state.mutations.push({ kind: 'created', descriptor })
				}
				for (const transient of payload.transients) {
					requireCurrent(context)
					const descriptor = Object.assign({}, transient, {
						save: jsonClone(saved?.get(transient.identity) || transient.save)
					})
					addExpectedEntity(descriptor)
					state.mutations.push({ kind: 'created', descriptor })
				}
				applyStatsMutation(state, {
					machinesBuild: -payload.statsDelta.machinesBuild,
					machinesSold: -payload.statsDelta.machinesSold
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

			function applyStatsMutation(state, delta) {
				const normalized = {
					machinesBuild: finiteOr(delta?.machinesBuild, 0),
					machinesSold: finiteOr(delta?.machinesSold, 0)
				}
				if (!normalized.machinesBuild && !normalized.machinesSold) return
				game.stats = game.stats || {}
				game.stats.machinesBuild = finiteOr(game.stats.machinesBuild, 0) + normalized.machinesBuild
				game.stats.machinesSold = finiteOr(game.stats.machinesSold, 0) + normalized.machinesSold
				state.statsDelta = normalized
				state.mutations.push({ kind: 'stats', delta: normalized })
			}

			function applyOnlyoneMutation(state, keys, desired) {
				const previous = captureOnlyones(game, keys)
				writeOnlyones(game, keys, desired)
				state.mutations.push({ kind: 'onlyones', keys: keys.slice(), values: previous })
			}

			function removeExpectedEntity(descriptor) {
				const entity = entityAt(game, descriptor.position)
				traceProbe('apply.clear.before', {
					descriptor: descriptorProbeDetails(descriptor),
					found: !!entity,
					foundName: safeName(entity?.name),
					foundPosition: normalizePosition(entity?.position),
					identityMatch: !!entity && ensureIdentity(entity) === descriptor.identity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				if (!entity || ensureIdentity(entity) !== descriptor.identity) {
					throw placementError('EXTERNAL_CHANGE', 'A placement target entity changed.')
				}
				const save = captureEntitySave(game, entity)
				const removed = Object.assign({}, descriptor, {
					name: safeName(entity.name),
					position: clonePosition(entity.position),
					footprint: entityFootprint(entity, entity.position),
					save
				})
				clearOnlyoneChain(game, entity.name)
				try {
					game.clearCell(entity.position)
				} catch (clearError) {
					traceProbe('apply.clear.threw', {
						descriptor: descriptorProbeDetails(descriptor),
						code: clearError?.code,
						message: clearError?.message
					})
					throw clearError
				}
				const remaining = entityAt(game, descriptor.position)
				traceProbe('apply.clear.after', {
					descriptor: descriptorProbeDetails(descriptor),
					remaining: !!remaining,
					remainingName: safeName(remaining?.name),
					remainingPosition: normalizePosition(remaining?.position),
					sameEntityRemaining: remaining === entity,
					stuffCount: Array.isArray(game.stuff) ? game.stuff.length : null,
					entityCount: finiteOr(game.entitiesInGame?.[descriptor.name], null)
				})
				return removed
			}

			function addExpectedEntity(descriptor) {
				assertFootprintEmpty(game, descriptor.footprint)
				let entity
				if (descriptor.save) {
					entity = restoreEntitySave(game, descriptor.save)
				} else {
					entity = game.addEntity(descriptor.name, descriptor.position, undefined, { skipShopUpdate: true })
					if (entity) {
						applyStructureConfig(entity, descriptor.config)
						if (descriptor.name === 'gradient' && !Object.hasOwn(descriptor.config || {}, 'penalty')) {
							entity.penalty = .5
						}
						entity.init?.()
					}
				}
				if (!entity) throw placementError('APPLY_FAILED', 'A blueprint building could not be created.')
				assignIdentity(entity, descriptor.identity)
				return entity
			}

			function rollbackMutations(state) {
				for (let index = state.mutations.length - 1; index >= 0; index -= 1) {
					const mutation = state.mutations[index]
					if (mutation.kind === 'created') {
						const entity = entityAt(game, mutation.descriptor.position)
						if (!entity || ensureIdentity(entity) !== mutation.descriptor.identity) {
							throw placementError('ROLLBACK_FAILED', 'A created entity could not be removed during rollback.')
						}
						clearOnlyoneChain(game, entity.name)
						game.clearCell(entity.position)
					} else if (mutation.kind === 'removed') {
						addExpectedEntity(mutation.descriptor)
					} else if (mutation.kind === 'resources') {
						applyResourceDelta(game, negateArray(mutation.delta), true)
					} else if (mutation.kind === 'stats') {
						game.stats = game.stats || {}
						game.stats.machinesBuild = finiteOr(game.stats.machinesBuild, 0) - mutation.delta.machinesBuild
						game.stats.machinesSold = finiteOr(game.stats.machinesSold, 0) - mutation.delta.machinesSold
					} else if (mutation.kind === 'onlyones') {
						writeOnlyones(game, mutation.keys, mutation.values)
					}
				}
			}

			function verifyAppliedState(payload, state, expectedAfter) {
				const removed = payload.removals.concat(payload.transients)
				const present = expectedAfter ? payload.builds : removed
				const absent = expectedAfter ? removed : payload.builds
				for (const descriptor of present) {
					const entity = entityAt(game, descriptor.position)
					if (
						!entity ||
						ensureIdentity(entity) !== descriptor.identity ||
						safeName(entity.name) !== descriptor.name
					) {
						return denied('VERIFY_FAILED', 'A placed entity did not match the transaction result.')
					}
				}
				for (const descriptor of absent) {
					if (scopeContainsIdentity(payload.scopeCells, descriptor.identity)) {
						return denied('VERIFY_FAILED', 'A removed entity is still present in the transaction scope.')
					}
				}
				const expectedResources = addArrays(state.resourcesBefore, state.resourceDelta)
				if (!sameNumericArray(game.resources, expectedResources)) {
					return denied('VERIFY_FAILED', 'Resource totals did not match the placement transaction.')
				}
				const expectedStats = {
					machinesBuild: state.statsBefore.machinesBuild + state.statsDelta.machinesBuild,
					machinesSold: state.statsBefore.machinesSold + state.statsDelta.machinesSold
				}
				const observedStats = captureStats(game)
				if (
					observedStats.machinesBuild !== expectedStats.machinesBuild ||
					observedStats.machinesSold !== expectedStats.machinesSold
				) {
					return denied('VERIFY_FAILED', 'World statistics did not match the placement transaction.')
				}
				const desiredOnlyones = expectedAfter ? payload.onlyonesAfter : payload.onlyonesBefore
				if (!samePlain(captureOnlyones(game, payload.onlyOneKeys), desiredOnlyones)) {
					return denied('VERIFY_FAILED', 'Only-one state did not match the placement transaction.')
				}
				return approved()
			}

			function scopeContainsIdentity(cells, identity) {
				for (const position of cells) {
					const entity = entityAt(game, position)
					if (entity && ensureIdentity(entity) === identity) return true
				}
				return false
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
				if (!entity || !identity) throw placementError('APPLY_FAILED', 'An entity identity could not be assigned.')
				identityByEntity.set(entity, identity)
			}

			function createIdentity(kind) {
				identitySequence += 1
				return [
					'world-editor',
					kind,
					Date.now().toString(36),
					identitySequence.toString(36)
				].join('-')
			}
		}

		function cloneBlueprint(value) {
			const blueprint = jsonClone(value)
			if (
				!blueprint ||
				blueprint.mode !== 'structure' ||
				![1, 2, 3, 4].includes(Number(blueprint.schemaVersion)) ||
				!Array.isArray(blueprint.entities) ||
				(
					!blueprint.entities.length &&
					!(
						Number(blueprint.schemaVersion) === 4 &&
						Array.isArray(blueprint.emptyCells) &&
						blueprint.emptyCells.length
					)
				) ||
				(Number(blueprint.schemaVersion) === 4 && !Array.isArray(blueprint.emptyCells))
			) {
				throw placementError('STRUCTURE_BLUEPRINT_REQUIRED', 'A valid structure blueprint is required.')
			}
			return blueprint
		}

		function collectScopeCells(records, removals) {
			const cells = new Map()
			for (const record of records || []) addFootprintCells(cells, record.footprint)
			for (const removal of removals || []) addFootprintCells(cells, removal.footprint)
			return Array.from(cells.values()).sort(comparePositions)
		}

		function addFootprintCells(target, footprint) {
			for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
				for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
					target.set(u + ':' + v, [u, v])
				}
			}
		}

		function collectOnlyOneKeys(game, builds, removals) {
			const keys = new Set()
			const names = new Set()
			for (const descriptor of builds.concat(removals)) names.add(descriptor.name)
			for (const name of names) {
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

		function simulateOnlyones(game, before, keys, builds, removals) {
			const result = Object.assign({}, before)
			for (const removal of removals) clearOnlyoneChainInMap(game, result, removal.name)
			for (const build of builds) {
				if (game.codex?.entities?.[build.name]?.onlyone === true) result[build.name] = true
			}
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

		function simulateEconomy(game, builds, removals, creative) {
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
			for (const build of builds) {
				const cost = priceFor(game, counts, build.name, false)
				pushEconomyStep(resources, steps, 'build-cost', build.name, negateArray(cost))
				counts[build.name] = finiteOr(counts[build.name], 0) + 1
			}
			const initial = numericArray(game.resources)
			return {
				creative: false,
				eraserName,
				steps,
				delta: subtractArrays(resources, initial)
			}
		}

		function pushEconomyStep(resources, steps, kind, name, delta) {
			const normalized = numericArray(delta)
			applyShadowDelta(resources, normalized, true)
			steps.push({ kind, name, delta: normalized })
		}

		function priceFor(game, counts, name, sale) {
			const definition = game.codex?.entities?.[name]
			if (!definition || !Array.isArray(definition.price)) {
				throw placementError('PRICE_UNAVAILABLE', 'A required building price is unavailable.')
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

		function applyShadowDelta(resources, delta, allowNegative) {
			const length = Math.max(resources.length, delta.length)
			for (let index = 0; index < length; index += 1) {
				const next = finiteOr(resources[index], 0) + finiteOr(delta[index], 0)
				if (!allowNegative && next < -EPSILON) {
					throw placementError('INSUFFICIENT_RESOURCES', 'Insufficient resources.')
				}
				resources[index] = Math.abs(next) <= EPSILON ? 0 : next
			}
		}

		function applyResourceDelta(game, delta, rollback) {
			const resources = numericArray(game.resources)
			const length = Math.max(resources.length, delta.length)
			for (let index = 0; index < length; index += 1) {
				const next = finiteOr(resources[index], 0) + finiteOr(delta[index], 0)
				if (!rollback && next < -EPSILON) {
					throw placementError('INSUFFICIENT_RESOURCES', 'Current resources cannot complete the placement.')
				}
				resources[index] = Math.abs(next) <= EPSILON ? 0 : next
			}
			game.resources.length = resources.length
			for (let index = 0; index < resources.length; index += 1) game.resources[index] = resources[index]
		}

		function captureEntitySave(game, entity) {
			if (typeof game.getEntityString !== 'function') {
				throw placementError('SAVE_UNAVAILABLE', 'Entity save capture is unavailable.')
			}
			const save = jsonClone(game.getEntityString(entity))
			if (
				!save ||
				safeName(save.name) !== safeName(entity?.name) ||
				!normalizePosition(save.position) ||
				!save.par ||
				typeof save.par !== 'object'
			) {
				throw placementError('SAVE_UNAVAILABLE', 'Entity state could not be serialized.')
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

		function applyStructureConfig(entity, config) {
			for (const key of Object.keys(config || {})) entity[key] = jsonClone(config[key])
		}

		function assertFootprintEmpty(game, footprint) {
			for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
				for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
					if (entityAt(game, [u, v])) {
						throw placementError('EXTERNAL_CHANGE', 'A placement footprint is no longer empty.')
					}
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

		function cloneFootprint(value) {
			const minU = finiteInteger(value?.minU, NaN)
			const maxU = finiteInteger(value?.maxU, NaN)
			const minV = finiteInteger(value?.minV, NaN)
			const maxV = finiteInteger(value?.maxV, NaN)
			if (![minU, maxU, minV, maxV].every(Number.isFinite)) {
				throw placementError('INVALID_BLUEPRINT', 'A blueprint footprint is invalid.')
			}
			return {
				span: nonNegativeInteger(value?.span, 0),
				minU,
				maxU,
				minV,
				maxV
			}
		}

		function hasAttachedCube(game, entity) {
			for (const candidate of game.stuff || []) {
				if (safeName(candidate?.name) === 'cube' && candidate.pump === entity) return true
			}
			return false
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
					throw placementError('NOT_READY', 'The game is missing ' + method + '().')
				}
			}
			if (!Array.isArray(game.resources)) throw placementError('NOT_READY', 'Game resources are unavailable.')
		}

		function validateRecord(record) {
			if (
				!record ||
				record.kind !== TRANSACTION_KIND ||
				record.payload?.schema !== 2 ||
				!Array.isArray(record.payload.builds) ||
				!Array.isArray(record.payload.removals) ||
				!Array.isArray(record.payload.protectedTargets) ||
				!Array.isArray(record.payload.transients) ||
				!Array.isArray(record.payload.scopeCells) ||
				(!record.payload.builds.length && !record.payload.removals.length)
			) {
				throw placementError('INVALID_SPEC', 'The blueprint placement transaction record is invalid.')
			}
		}

		function requireCurrent(context) {
			if (!context?.isCurrent?.()) throw placementError('INVALIDATED', 'The placement operation was invalidated.')
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
				console.warn('[Cattail World Editor] Placement refresh failed.', refreshError)
			}
		}

		function captureStats(game) {
			return {
				machinesBuild: finiteOr(game.stats?.machinesBuild, 0),
				machinesSold: finiteOr(game.stats?.machinesSold, 0)
			}
		}

		function assessment(safe, reason) {
			return Object.freeze({ safe: !!safe, reason: String(reason || '') })
		}

		function approved() {
			return { ok: true }
		}

		function denied(code, message) {
			return {
				ok: false,
				code: String(code || 'PREFLIGHT_FAILED'),
				message: String(message || 'Blueprint placement was rejected.')
			}
		}

		function rejectedResult(code, message) {
			return Object.freeze({
				accepted: false,
				executed: false,
				direction: 'forward',
				reason: String(code || 'PLACEMENT_FAILED').toLowerCase().replace(/_/g, '-'),
				transaction: null,
				snapshotId: null,
				error: Object.freeze({
					code: String(code || 'PLACEMENT_FAILED'),
					message: String(message || 'Blueprint placement failed.')
				})
			})
		}

		function publicError(value) {
			if (!value) return null
			return Object.freeze({
				code: String(value.code || 'PLACEMENT_FAILED'),
				message: String(value.message || 'Blueprint placement failed.')
			})
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

		function signatureProbe(value) {
			const text = String(value || '')
			let hash = 2166136261
			for (let index = 0; index < text.length; index += 1) {
				hash ^= text.charCodeAt(index)
				hash = Math.imul(hash, 16777619)
			}
			return {
				length: text.length,
				hash: (hash >>> 0).toString(16).padStart(8, '0')
			}
		}

		function compareSignaturePayloads(confirmedValue, rebuiltValue) {
			const confirmedText = String(confirmedValue || '')
			const rebuiltText = String(rebuiltValue || '')
			if (!confirmedText || confirmedText === rebuiltText) return null
			let confirmed
			let rebuilt
			try {
				confirmed = JSON.parse(confirmedText)
				rebuilt = JSON.parse(rebuiltText)
			} catch (parseError) {
				return {
					parseFailed: true,
					message: String(parseError?.message || 'Signature details could not be compared.')
				}
			}
			const differences = []
			let differenceCount = 0
			compareNode(confirmed, rebuilt, '$')
			return {
				differenceCount,
				truncated: differenceCount > differences.length,
				differences
			}

			function compareNode(left, right, path) {
				if (samePlain(left, right)) return
				const leftObject = !!left && typeof left === 'object'
				const rightObject = !!right && typeof right === 'object'
				if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
					addDifference(path, left, right)
					return
				}
				if (Array.isArray(left)) {
					if (left.length !== right.length) {
						addDifference(path + '.length', left.length, right.length)
					}
					const length = Math.max(left.length, right.length)
					for (let index = 0; index < length; index += 1) {
						compareNode(left[index], right[index], path + '[' + index + ']')
					}
					return
				}
				const keys = Array.from(new Set(Object.keys(left).concat(Object.keys(right)))).sort()
				for (const key of keys) compareNode(left[key], right[key], path + '.' + key)
			}

			function addDifference(path, confirmedEntry, rebuiltEntry) {
				differenceCount += 1
				if (differences.length >= 24) return
				differences.push({
					path,
					confirmed: probeDetails({ value: confirmedEntry }).value,
					rebuilt: probeDetails({ value: rebuiltEntry }).value
				})
			}
		}

		function planProbeDetails(plan) {
			return {
				target: normalizePosition(plan?.target),
				recordCount: Array.isArray(plan?.records) ? plan.records.length : 0,
				statusCounts: plan?.statusCounts || {},
				emptyCellCount: Array.isArray(plan?.emptyCells) ? plan.emptyCells.length : 0,
				emptyCells: (plan?.emptyCells || []).slice(0, 64).map(normalizePosition),
				emptyEntityCount: Array.isArray(plan?.emptyEntities) ? plan.emptyEntities.length : 0,
				emptyEntities: (plan?.emptyEntities || []).slice(0, 32).map(function (entity) {
					return {
						name: safeName(entity?.name),
						position: normalizePosition(entity?.position),
						span: nonNegativeInteger(entity?.entitySpan, 0)
					}
				})
			}
		}

		function descriptorProbeDetails(entry) {
			return {
				identity: String(entry?.identity || ''),
				name: safeName(entry?.name),
				position: normalizePosition(entry?.position),
				footprint: entry?.footprint || null,
				sourceConflict: entry?.sourceConflict === true,
				sourceSync: entry?.sourceSync === true,
				crossBoundary: entry?.crossBoundary === true,
				reason: String(entry?.reason || '')
			}
		}

		function payloadProbeDetails(payload) {
			return {
				target: normalizePosition(payload?.target),
				replaceConflicts: payload?.replaceConflicts === true,
				syncEmpty: payload?.syncEmpty === true,
				buildCount: Array.isArray(payload?.builds) ? payload.builds.length : 0,
				deleteCount: Array.isArray(payload?.removals) ? payload.removals.length : 0,
				protectedCount: Array.isArray(payload?.protectedTargets) ? payload.protectedTargets.length : 0,
				transientCount: Array.isArray(payload?.transients) ? payload.transients.length : 0,
				builds: (payload?.builds || []).map(descriptorProbeDetails),
				removals: (payload?.removals || []).map(descriptorProbeDetails),
				protectedTargets: (payload?.protectedTargets || []).map(descriptorProbeDetails),
				transients: (payload?.transients || []).map(descriptorProbeDetails),
				creative: payload?.economy?.creative === true,
				resourceDelta: numericArray(payload?.economy?.delta)
			}
		}

		function proposalProbeDetails(proposal) {
			return Object.assign({
				signature: signatureProbe(proposal?.signature),
				summary: proposal?.summary || {}
			}, payloadProbeDetails(proposal?.payload || proposal))
		}

		function proposalVariantsProbeDetails(variants) {
			const result = {}
			for (const key of ['00', '01', '10', '11']) {
				result[key] = proposalProbeDetails(variants?.[key])
			}
			return result
		}

		function placementError(code, message) {
			const error = new Error(String(message || code || 'Blueprint placement failed.'))
			error.code = String(code || 'PLACEMENT_FAILED')
			return error
		}

		function normalizeInput(value) {
			const input = String(value || 'api')
			return ['mouse', 'keyboard', 'gamepad', 'touch', 'api'].includes(input) ? input : 'api'
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
		}

		function clonePosition(value) {
			const position = normalizePosition(value)
			if (!position) throw placementError('INVALID_POSITION', 'An entity position is invalid.')
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

		function cellKey(position) {
			return position[0] + ':' + position[1]
		}

		function optionKey(replaceConflicts, syncEmpty) {
			return (replaceConflicts ? '1' : '0') + (syncEmpty ? '1' : '0')
		}

		function proposalSignature(value) {
			return JSON.stringify(stableValue({
				target: value?.target,
				replaceConflicts: value?.replaceConflicts === true,
				syncEmpty: value?.syncEmpty === true,
				builds: (value?.builds || []).map(function (entry) {
					return {
						id: entry.id,
						name: entry.name,
						position: entry.position,
						footprint: entry.footprint,
						config: entry.config
					}
				}),
				removals: (value?.removals || []).map(function (entry) {
					return {
						identity: entry.identity,
						name: entry.name,
						position: entry.position,
						footprint: entry.footprint,
						save: comparablePlacementSave(entry.save),
						sourceConflict: entry.sourceConflict === true,
						sourceSync: entry.sourceSync === true,
						crossBoundary: entry.crossBoundary === true
					}
				}),
				protectedTargets: (value?.protectedTargets || []).map(function (entry) {
					return {
						identity: entry.identity,
						name: entry.name,
						position: entry.position,
						footprint: entry.footprint,
						save: comparablePlacementSave(entry.save),
						reason: entry.reason,
						sourceConflict: entry.sourceConflict === true,
						sourceSync: entry.sourceSync === true,
						crossBoundary: entry.crossBoundary === true
					}
				}),
				transients: (value?.transients || []).map(function (entry) {
					return {
						identity: entry.identity,
						name: entry.name,
						position: entry.position,
						footprint: entry.footprint,
						save: comparablePlacementSave(entry.save)
					}
				}),
				economy: value?.economy,
				resourcesBefore: value?.resourcesBefore,
				statsBefore: value?.statsBefore,
				statsDelta: value?.statsDelta,
				onlyonesBefore: value?.onlyonesBefore,
				onlyonesAfter: value?.onlyonesAfter
			}))
		}

		function samePosition(left, right) {
			const a = normalizePosition(left)
			const b = normalizePosition(right)
			return !!a && !!b && a[0] === b[0] && a[1] === b[1]
		}

		function comparablePlacementSave(value) {
			const save = jsonClone(value)
			if (save?.par && typeof save.par === 'object') delete save.par.soul
			return save
		}

		function samePlacementSave(left, right) {
			return samePlain(
				comparablePlacementSave(left),
				comparablePlacementSave(right)
			)
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

		function jsonClone(value) {
			if (value === undefined) return null
			return JSON.parse(JSON.stringify(value))
		}
	}
})
