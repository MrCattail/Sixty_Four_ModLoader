ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const TRANSACTIONS_KEY = Symbol.for('cattail.world-editor.transactions')
		const SERVICE_VERSION = '1.0.0'
		const ADAPTER_VERSION = '1.0.0'
		const HISTORY_LIMIT = 50
		const INPUTS = Object.freeze(['mouse', 'keyboard', 'gamepad', 'touch', 'api'])
		const DIRECTIONS = Object.freeze(['forward', 'undo', 'redo'])
		const SNAPSHOT_REASONS = Object.freeze({
			forward: 'world-editor-before-forward',
			undo: 'world-editor-before-undo',
			redo: 'world-editor-before-redo'
		})
		const KIND_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
		const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

		api.on('afterGameInit', function (payload, game) {
			const previous = globalThis[TRANSACTIONS_KEY]
			previous?.dispose?.('transaction-runtime-replaced')

			const service = createService(game)
			Object.defineProperty(globalThis, TRANSACTIONS_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			console.info('[Cattail World Editor] Transaction engine 4A-3a ready.')
		})

		function createService(game) {
			const snapshots = api.storage?.snapshots
			const listeners = new Set()
			const adapters = new Map()
			const undoStack = []
			const redoStack = []
			let disposed = false
			let disposeRequested = false
			let disposeReason = null
			let busy = false
			let applyStarted = false
			let phase = 'idle'
			let direction = null
			let activeTransactionId = null
			let activeOperationId = null
			let revision = 0
			let lastReason = 'initialized'
			let lastTransaction = null
			let error = null
			let terminalBlockedReason = null
			let operationToken = 0
			let identifierSequence = 0
			let boundSaveInstanceId = readCurrentSaveIdentity(game)

			function isReady() {
				return !!(
					!disposed &&
					!disposeRequested &&
					game &&
					typeof game.assembleSave === 'function' &&
					typeof game.decodeSave === 'function' &&
					typeof snapshots?.create === 'function' &&
					typeof snapshots?.remove === 'function' &&
					boundSaveInstanceId
				)
			}

			function snapshot() {
				const undoBlockedReason = basicBlockedReason('undo')
				const redoBlockedReason = basicBlockedReason('redo')
				return deepFreeze({
					version: SERVICE_VERSION,
					ready: isReady(),
					busy: !disposed && busy,
					phase: disposed ? 'idle' : phase,
					direction: disposed ? null : direction,
					activeTransactionId: disposed ? null : activeTransactionId,
					activeOperationId: disposed ? null : activeOperationId,
					registeredKinds: disposed ? [] : Array.from(adapters.keys()).sort(),
					undoCount: disposed ? 0 : undoStack.length,
					redoCount: disposed ? 0 : redoStack.length,
					canUndo: undoBlockedReason === null,
					canRedo: redoBlockedReason === null,
					undoBlockedReason,
					redoBlockedReason,
					terminalBlockedReason: disposed ? null : terminalBlockedReason,
					undoTop: disposed ? null : publicSummary(undoStack[undoStack.length - 1]),
					redoTop: disposed ? null : publicSummary(redoStack[redoStack.length - 1]),
					revision,
					lastReason,
					lastTransaction: disposed ? null : lastTransaction,
					error: publicError(error),
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
						console.warn('[Cattail World Editor] Transaction listener failed.', listenerError)
					}
				}
			}

			function setPhase(nextPhase, reason) {
				if (disposed) return
				phase = nextPhase
				notify(reason)
			}

			function basicBlockedReason(nextDirection) {
				if (disposed || disposeRequested) return 'NOT_READY'
				if (terminalBlockedReason) return terminalBlockedReason
				if (busy) return 'BUSY'
				const stack = nextDirection === 'undo' ? undoStack : redoStack
				const record = stack[stack.length - 1]
				if (!record) return nextDirection === 'undo' ? 'NO_UNDO' : 'NO_REDO'
				if (!adapters.has(record.kind)) return 'ADAPTER_UNAVAILABLE'
				if (normalizePlane(game?.plane) !== record.plane) return 'PLANE_CHANGED'
				if (!boundSaveInstanceId) return 'SAVE_IDENTITY_UNAVAILABLE'
				return null
			}

			function registerAdapter(kind, adapter) {
				if (disposed || disposeRequested) throw createError('NOT_READY', 'The transaction engine is not available.')
				if (busy) throw createError('BUSY', 'The transaction engine is busy.')
				const normalizedKind = normalizeKind(kind)
				validateAdapter(adapter)
				if (adapters.has(normalizedKind)) {
					throw createError('ADAPTER_EXISTS', 'A transaction adapter is already registered for ' + normalizedKind + '.')
				}
				adapters.set(normalizedKind, adapter)
				notify('transaction-adapter-registered')
				let registered = true
				return function unregisterAdapter() {
					if (!registered || disposed || disposeRequested || busy) return false
					if (adapters.get(normalizedKind) !== adapter) return false
					registered = false
					adapters.delete(normalizedKind)
					notify('transaction-adapter-unregistered')
					return true
				}
			}

			async function execute(request) {
				if (disposed || disposeRequested) {
					return rejectResult('forward', 'NOT_READY', 'The transaction engine is not available.')
				}
				if (terminalBlockedReason) {
					return rejectResult('forward', terminalBlockedReason, 'The transaction engine is blocked until reload.')
				}
				if (busy) return rejectResult('forward', 'BUSY', 'The transaction engine is busy.')

				let kind
				let input
				let inputPayload
				try {
					if (!isPlainObject(request)) throw createError('INVALID_SPEC', 'A transaction request object is required.')
					kind = normalizeKind(request.kind)
					input = normalizeInput(request.input)
					inputPayload = normalizePlain(request.payload, 'request payload')
				} catch (requestError) {
					return rejectErrorResult('forward', normalizeError(requestError, 'INVALID_SPEC'))
				}

				const adapter = adapters.get(kind)
				if (!adapter) return rejectResult('forward', 'ADAPTER_UNAVAILABLE', 'No transaction adapter is registered for ' + kind + '.')

				const saveEnvelope = readCurrentSaveEnvelope(game)
				if (!saveEnvelope) {
					return rejectResult('forward', 'SAVE_IDENTITY_UNAVAILABLE', 'The active save identity is unavailable.')
				}
				if (boundSaveInstanceId && boundSaveInstanceId !== saveEnvelope.saveInstanceId) {
					clearHistoryInternal()
					boundSaveInstanceId = saveEnvelope.saveInstanceId
					notify('transaction-save-identity-rebound')
				} else if (!boundSaveInstanceId) {
					boundSaveInstanceId = saveEnvelope.saveInstanceId
					notify('transaction-save-identity-bound')
				}

				const transactionId = createIdentifier('transaction')
				const operationId = createIdentifier('operation')
				const plane = normalizePlane(game?.plane)
				const token = beginOperation('forward', transactionId, operationId, 'preparing')
				let record = null
				let snapshotRecord = null
				let operationError = null

				try {
					const prepared = await adapter.prepare(
						createContext(token, transactionId, operationId, 'forward', input, plane, null),
						inputPayload
					)
					assertCurrent(token)
					const normalizedPrepared = normalizePrepared(prepared)
					record = createDraftRecord({
						id: transactionId,
						kind,
						input,
						saveInstanceId: boundSaveInstanceId,
						plane,
						createdAt: Date.now(),
						snapshotId: null,
						summary: normalizedPrepared.summary,
						scope: normalizedPrepared.scope,
						payload: normalizedPrepared.payload,
						before: null,
						after: null
					})

					setPhase('preflighting', 'transaction-forward-preflighting')
					await validateOperationState(token, adapter, record, 'forward', input, null)
					await requireAdapterApproval(adapter, 'preflight', token, record, 'forward', input, null)
					const before = await captureGuard(adapter, token, record, 'forward', input, null)
					record = createDraftRecord(Object.assign({}, record, { before }))

					setPhase('snapshotting', 'transaction-forward-snapshotting')
					snapshotRecord = await createPhysicalSnapshot(token, record, 'forward', input)
					record = createDraftRecord(Object.assign({}, record, { snapshotId: snapshotRecord.id }))

					setPhase('revalidating', 'transaction-forward-revalidating')
					await validateOperationState(token, adapter, record, 'forward', input, snapshotRecord.id)
					await requireAdapterApproval(adapter, 'preflight', token, record, 'forward', input, snapshotRecord.id)
					const currentBefore = await captureGuard(adapter, token, record, 'forward', input, snapshotRecord.id)
					if (!plainEqual(before, currentBefore)) {
						throw createError('EXTERNAL_CHANGE', 'The transaction target changed while the safety snapshot was being created.')
					}

					setPhase('applying', 'transaction-forward-applying')
					applyStarted = true
					const applyResult = await adapter.apply(
						createContext(token, record.id, operationId, 'forward', input, plane, snapshotRecord.id),
						record,
						'forward'
					)
					requireApplySuccess(applyResult)

					setPhase('verifying', 'transaction-forward-verifying')
					const after = await captureGuard(adapter, token, record, 'forward', input, snapshotRecord.id, true)
					record = createDraftRecord(Object.assign({}, record, { after }))
					await requireAdapterApproval(adapter, 'verify', token, record, 'forward', input, snapshotRecord.id, after)

					const finalRecord = freezeRecord(record)
					undoStack.push(finalRecord)
					trimUndoHistory()
					redoStack.length = 0
					lastTransaction = publicSummary(finalRecord)
					const result = successResult('forward', finalRecord, snapshotRecord.id)
					finishIdle('transaction-forward-complete', null)
					return result
				} catch (caughtError) {
					operationError = normalizePhaseError(caughtError, phase)
					return await recoverOperation({
						token,
						adapter,
						record,
						direction: 'forward',
						input,
						snapshotRecord,
						operationError,
						rollbackTarget: 'before'
					})
				} finally {
					finishDisposeIfRequested()
				}
			}

			async function undo(options) {
				return runHistoryOperation('undo', options)
			}

			async function redo(options) {
				return runHistoryOperation('redo', options)
			}

			async function runHistoryOperation(nextDirection, options) {
				if (disposed || disposeRequested) {
					return rejectResult(nextDirection, 'NOT_READY', 'The transaction engine is not available.')
				}
				if (terminalBlockedReason) {
					return rejectResult(nextDirection, terminalBlockedReason, 'The transaction engine is blocked until reload.')
				}
				if (busy) return rejectResult(nextDirection, 'BUSY', 'The transaction engine is busy.')

				let input
				try {
					if (options !== undefined && !isPlainObject(options)) {
						throw createError('INVALID_SPEC', 'Undo and redo options must be an object.')
					}
					input = normalizeInput(options?.input === undefined ? 'api' : options.input)
				} catch (optionsError) {
					return rejectErrorResult(nextDirection, normalizeError(optionsError, 'INVALID_SPEC'))
				}

				const stack = nextDirection === 'undo' ? undoStack : redoStack
				const record = stack[stack.length - 1]
				if (!record) {
					return rejectResult(
						nextDirection,
						nextDirection === 'undo' ? 'NO_UNDO' : 'NO_REDO',
						nextDirection === 'undo' ? 'There is no transaction to undo.' : 'There is no transaction to redo.'
					)
				}

				const adapter = adapters.get(record.kind)
				if (!adapter) {
					return rejectResult(nextDirection, 'ADAPTER_UNAVAILABLE', 'The transaction adapter is unavailable.')
				}
				if (normalizePlane(game?.plane) !== record.plane) {
					return rejectResult(nextDirection, 'PLANE_CHANGED', 'Switch back to the transaction plane before continuing.')
				}

				const currentEnvelope = readCurrentSaveEnvelope(game)
				if (!currentEnvelope) {
					return rejectResult(nextDirection, 'SAVE_IDENTITY_UNAVAILABLE', 'The active save identity is unavailable.')
				}
				if (
					currentEnvelope.saveInstanceId !== record.saveInstanceId ||
					currentEnvelope.saveInstanceId !== boundSaveInstanceId
				) {
					clearHistoryInternal()
					boundSaveInstanceId = currentEnvelope.saveInstanceId
					return rejectResult(nextDirection, 'SAVE_CHANGED', 'The active save changed, so transaction history was cleared.')
				}

				const operationId = createIdentifier('operation')
				const token = beginOperation(nextDirection, record.id, operationId, 'preflighting')
				const expectedCurrent = nextDirection === 'undo' ? record.after : record.before
				const expectedResult = nextDirection === 'undo' ? record.before : record.after
				const rollbackTarget = nextDirection === 'undo' ? 'after' : 'before'
				let snapshotRecord = null

				try {
					await validateOperationState(token, adapter, record, nextDirection, input, null)
					await requireAdapterApproval(adapter, 'preflight', token, record, nextDirection, input, null)
					const current = await captureGuard(adapter, token, record, nextDirection, input, null)
					if (!plainEqual(expectedCurrent, current)) {
						throw createError('EXTERNAL_CHANGE', 'The transaction target changed outside World Editor.')
					}

					setPhase('snapshotting', 'transaction-' + nextDirection + '-snapshotting')
					snapshotRecord = await createPhysicalSnapshot(token, record, nextDirection, input)

					setPhase('revalidating', 'transaction-' + nextDirection + '-revalidating')
					await validateOperationState(token, adapter, record, nextDirection, input, snapshotRecord.id)
					await requireAdapterApproval(adapter, 'preflight', token, record, nextDirection, input, snapshotRecord.id)
					const revalidated = await captureGuard(adapter, token, record, nextDirection, input, snapshotRecord.id)
					if (!plainEqual(expectedCurrent, revalidated)) {
						throw createError('EXTERNAL_CHANGE', 'The transaction target changed while the safety snapshot was being created.')
					}

					setPhase('applying', 'transaction-' + nextDirection + '-applying')
					applyStarted = true
					const applyResult = await adapter.apply(
						createContext(token, record.id, operationId, nextDirection, input, record.plane, snapshotRecord.id),
						record,
						nextDirection
					)
					requireApplySuccess(applyResult)

					setPhase('verifying', 'transaction-' + nextDirection + '-verifying')
					const observed = await captureGuard(
						adapter,
						token,
						record,
						nextDirection,
						input,
						snapshotRecord.id,
						true
					)
					if (!plainEqual(expectedResult, observed)) {
						throw createError('VERIFY_FAILED', 'The transaction result did not match the recorded state.')
					}
					await requireAdapterApproval(
						adapter,
						'verify',
						token,
						record,
						nextDirection,
						input,
						snapshotRecord.id,
						observed
					)

					if (nextDirection === 'undo') {
						undoStack.pop()
						redoStack.push(record)
					} else {
						redoStack.pop()
						undoStack.push(record)
						trimUndoHistory()
					}
					lastTransaction = publicSummary(record)
					const result = successResult(nextDirection, record, snapshotRecord.id)
					finishIdle('transaction-' + nextDirection + '-complete', null)
					return result
				} catch (caughtError) {
					const operationError = normalizePhaseError(caughtError, phase)
					return await recoverOperation({
						token,
						adapter,
						record,
						direction: nextDirection,
						input,
						snapshotRecord,
						operationError,
						rollbackTarget
					})
				} finally {
					finishDisposeIfRequested()
				}
			}

			async function recoverOperation(options) {
				const {
					token,
					adapter,
					record,
					direction: failedDirection,
					input,
					snapshotRecord,
					operationError,
					rollbackTarget
				} = options

				if (!applyStarted) {
					if (snapshotRecord) await removeUnusedSnapshot(snapshotRecord)
					const result = failureResult(failedDirection, operationError, snapshotRecord?.id || null, true)
					finishIdle('transaction-' + failedDirection + '-' + reasonForError(operationError), operationError)
					return result
				}

				try {
					setPhase('rolling-back', 'transaction-' + failedDirection + '-rolling-back')
					const restoreResult = await adapter.restore(
						createContext(
							token,
							record?.id || activeTransactionId,
							activeOperationId,
							failedDirection,
							input,
							record?.plane ?? normalizePlane(game?.plane),
							snapshotRecord?.id || null,
							true
						),
						record,
						rollbackTarget
					)
					requireRestoreSuccess(restoreResult)
					const restored = await captureGuard(
						adapter,
						token,
						record,
						failedDirection,
						input,
						snapshotRecord?.id || null,
						true,
						true
					)
					const expected = rollbackTarget === 'before' ? record?.before : record?.after
					if (!plainEqual(expected, restored)) {
						throw createError('ROLLBACK_FAILED', 'The transaction rollback did not restore the recorded state.')
					}
					const result = failureResult(failedDirection, operationError, snapshotRecord?.id || null, true, 'rolled-back')
					finishIdle('transaction-' + failedDirection + '-rolled-back', operationError)
					return result
				} catch (rollbackError) {
					const terminalError = createError(
						'ROLLBACK_FAILED',
						String(rollbackError?.message || 'The transaction rollback failed.')
					)
					terminalBlockedReason = 'ROLLBACK_FAILED'
					error = terminalError
					busy = false
					applyStarted = false
					direction = null
					activeTransactionId = null
					activeOperationId = null
					setPhase('blocked', 'transaction-rollback-failed')
					return failureResult(failedDirection, terminalError, snapshotRecord?.id || null, true)
				}
			}

			function beginOperation(nextDirection, transactionId, operationId, nextPhase) {
				const token = ++operationToken
				busy = true
				applyStarted = false
				direction = nextDirection
				activeTransactionId = transactionId
				activeOperationId = operationId
				error = null
				setPhase(nextPhase, 'transaction-' + nextDirection + '-' + nextPhase)
				return token
			}

			function finishIdle(reason, nextError) {
				busy = false
				applyStarted = false
				phase = 'idle'
				direction = null
				activeTransactionId = null
				activeOperationId = null
				error = nextError || null
				notify(reason)
			}

			async function validateOperationState(token, adapter, record, nextDirection, input, snapshotId) {
				assertCurrent(token)
				if (adapters.get(record.kind) !== adapter) {
					throw createError('ADAPTER_UNAVAILABLE', 'The transaction adapter changed during the operation.')
				}
				if (normalizePlane(game?.plane) !== record.plane) {
					throw createError('PLANE_CHANGED', 'The active world plane changed during the operation.')
				}
				const currentIdentity = readCurrentSaveIdentity(game)
				if (!currentIdentity) {
					throw createError('SAVE_IDENTITY_UNAVAILABLE', 'The active save identity is unavailable.')
				}
				if (
					currentIdentity !== record.saveInstanceId ||
					currentIdentity !== boundSaveInstanceId
				) {
					throw createError('SAVE_CHANGED', 'The active save changed during the operation.')
				}
				return createContext(
					token,
					record.id,
					activeOperationId,
					nextDirection,
					input,
					record.plane,
					snapshotId
				)
			}

			async function requireAdapterApproval(
				adapter,
				method,
				token,
				record,
				nextDirection,
				input,
				snapshotId,
				observed
			) {
				assertCurrent(token)
				let result
				try {
					result = await adapter[method](
						createContext(
							token,
							record.id,
							activeOperationId,
							nextDirection,
							input,
							record.plane,
							snapshotId
						),
						record,
						nextDirection,
						observed
					)
				} catch (adapterError) {
					throw createError(
						method === 'verify' ? 'VERIFY_FAILED' : 'PREFLIGHT_FAILED',
						String(adapterError?.message || ('The transaction adapter ' + method + ' step failed.'))
					)
				}
				assertCurrent(token)
				if (!isPlainObject(result) || result.ok !== true) {
					const fallback = method === 'verify' ? 'VERIFY_FAILED' : 'PREFLIGHT_FAILED'
					const code = normalizeErrorCode(result?.code, fallback)
					throw createError(code, String(result?.message || ('The transaction adapter ' + method + ' step failed.')))
				}
			}

			async function captureGuard(
				adapter,
				token,
				record,
				nextDirection,
				input,
				snapshotId,
				afterApply,
				duringRollback
			) {
				if (!duringRollback) assertCurrent(token)
				try {
					const captured = await adapter.capture(
						createContext(
							token,
							record.id,
							activeOperationId,
							nextDirection,
							input,
							record.plane,
							snapshotId,
							!!duringRollback
						),
						record
					)
					if (!duringRollback) assertCurrent(token)
					return normalizePlain(captured, 'captured guard state')
				} catch (captureError) {
					if (captureError?.code) throw captureError
					throw createError(
						duringRollback
							? 'ROLLBACK_FAILED'
							: afterApply
								? 'VERIFY_FAILED'
								: 'PREFLIGHT_FAILED',
						String(captureError?.message || 'The transaction guard state could not be captured.')
					)
				}
			}

			async function createPhysicalSnapshot(token, record, nextDirection, input) {
				assertCurrent(token)
				if (
					typeof snapshots?.create !== 'function' ||
					typeof snapshots?.remove !== 'function'
				) {
					throw createError('SNAPSHOT_UNAVAILABLE', 'Snapshot storage is unavailable.')
				}
				const envelope = readCurrentSaveEnvelope(game)
				if (!envelope) {
					throw createError('SAVE_IDENTITY_UNAVAILABLE', 'The active save payload or identity is unavailable.')
				}
				if (envelope.saveInstanceId !== record.saveInstanceId) {
					throw createError('SAVE_CHANGED', 'The active save changed before the safety snapshot.')
				}
				let created
				try {
					created = await snapshots.create({
						data: envelope.data,
						reason: SNAPSHOT_REASONS[nextDirection],
						tags: {
							schema: 1,
							feature: 'world-editor-transaction',
							direction: nextDirection,
							operationId: activeOperationId,
							transactionId: record.id,
							kind: record.kind,
							input,
							originInput: record.input,
							plane: record.plane === 1 ? 'void' : 'reality'
						}
					})
				} catch (snapshotError) {
					throw createError('SNAPSHOT_FAILED', String(snapshotError?.message || 'The safety snapshot could not be created.'))
				}
				const id = String(created?.id || '').trim()
				if (!id) throw createError('SNAPSHOT_FAILED', 'Snapshot storage did not return a snapshot ID.')
				if (!isOperationCurrent(token, false)) {
					await removeUnusedSnapshot({ id })
					throw createError('INVALIDATED', 'The transaction operation was invalidated.')
				}
				return Object.freeze({ id })
			}

			async function removeUnusedSnapshot(snapshotRecord) {
				const id = String(snapshotRecord?.id || '')
				if (!id || typeof snapshots?.remove !== 'function') return false
				try {
					await snapshots.remove({ id })
					return true
				} catch (removeError) {
					console.warn('[Cattail World Editor] Unused transaction snapshot cleanup failed.', removeError)
					return false
				}
			}

			function createContext(
				token,
				transactionId,
				operationId,
				nextDirection,
				input,
				plane,
				snapshotId,
				recovery
			) {
				return Object.freeze({
					game,
					transactionId,
					operationId,
					saveInstanceId: boundSaveInstanceId,
					plane,
					direction: nextDirection,
					input,
					snapshotId: snapshotId || null,
					isCurrent() {
						return isOperationCurrent(token, !!recovery)
					}
				})
			}

			function isOperationCurrent(token, recovery) {
				if (disposed || operationToken !== token) return false
				if (terminalBlockedReason && !recovery) return false
				if (disposeRequested && !applyStarted && !recovery) return false
				return true
			}

			function assertCurrent(token) {
				if (!isOperationCurrent(token, false)) {
					throw createError('INVALIDATED', 'The transaction operation was invalidated.')
				}
			}

			function clear(reason) {
				if (disposed || disposeRequested) {
					return clearResult(false, 'NOT_READY', 'The transaction engine is not available.')
				}
				if (busy) return clearResult(false, 'BUSY', 'The transaction engine is busy.')
				if (terminalBlockedReason) {
					return clearResult(false, terminalBlockedReason, 'Reload is required before transaction history can be cleared.')
				}
				clearHistoryInternal()
				error = null
				lastTransaction = null
				notify(reason || 'transaction-history-cleared')
				return deepFreeze({
					cleared: true,
					undoCount: 0,
					redoCount: 0,
					error: null
				})
			}

			function clearHistoryInternal() {
				undoStack.length = 0
				redoStack.length = 0
				lastTransaction = null
			}

			function trimUndoHistory() {
				while (undoStack.length > HISTORY_LIMIT) undoStack.shift()
			}

			function dispose(reason) {
				if (disposed || disposeRequested) return false
				disposeRequested = true
				disposeReason = String(reason || 'disposed')
				if (!busy) {
					finalizeDispose()
				} else if (!applyStarted) {
					operationToken += 1
				}
				return true
			}

			function finishDisposeIfRequested() {
				if (!disposeRequested || busy) return
				finalizeDispose()
			}

			function finalizeDispose() {
				if (disposed) return
				disposed = true
				busy = false
				applyStarted = false
				phase = 'idle'
				direction = null
				activeTransactionId = null
				activeOperationId = null
				clearHistoryInternal()
				adapters.clear()
				listeners.clear()
				lastTransaction = null
				error = null
				lastReason = disposeReason || 'disposed'
				if (globalThis[TRANSACTIONS_KEY] === service) delete globalThis[TRANSACTIONS_KEY]
			}

			function rejectResult(nextDirection, code, message) {
				return rejectErrorResult(nextDirection, createError(code, message))
			}

			function rejectErrorResult(nextDirection, nextError) {
				if (!disposed) {
					error = nextError
					notify('transaction-' + nextDirection + '-' + reasonForError(nextError))
				}
				return failureResult(nextDirection, nextError, null, false)
			}

			const service = Object.freeze({
				version: SERVICE_VERSION,
				game,
				snapshot,
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Transaction listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					try {
						listener(snapshot())
					} catch (listenerError) {
						console.warn('[Cattail World Editor] Transaction listener failed.', listenerError)
					}
					return function () {
						listeners.delete(listener)
					}
				},
				registerAdapter,
				execute,
				undo,
				redo,
				clear,
				isBusy() {
					return !disposed && busy
				},
				dispose
			})

			return service

			function createIdentifier(prefix) {
				identifierSequence += 1
				try {
					const uuid = globalThis.crypto?.randomUUID?.()
					if (uuid) return String(uuid)
				} catch (identifierError) {}
				return [
					prefix,
					Date.now().toString(36),
					identifierSequence.toString(36),
					Math.floor(Math.random() * 0x100000000).toString(36)
				].join('-')
			}
		}

		function normalizePrepared(value) {
			if (!isPlainObject(value)) throw createError('INVALID_SPEC', 'Adapter prepare() must return an object.')
			return {
				summary: normalizePlain(value.summary, 'transaction summary'),
				scope: normalizePlain(value.scope, 'transaction scope'),
				payload: normalizePlain(value.payload, 'transaction payload')
			}
		}

		function createDraftRecord(value) {
			return Object.assign({}, value)
		}

		function freezeRecord(value) {
			return deepFreeze(normalizePlain(value, 'transaction record'))
		}

		function publicSummary(record) {
			if (!record) return null
			return deepFreeze({
				id: record.id,
				kind: record.kind,
				input: record.input,
				plane: record.plane,
				createdAt: record.createdAt,
				snapshotId: record.snapshotId,
				summary: normalizePlain(record.summary, 'public transaction summary')
			})
		}

		function successResult(nextDirection, record, snapshotId) {
			return deepFreeze({
				accepted: true,
				executed: true,
				direction: nextDirection,
				reason: 'complete',
				transaction: publicSummary(record),
				snapshotId: snapshotId || null,
				error: null
			})
		}

		function failureResult(nextDirection, nextError, snapshotId, accepted, reason) {
			return deepFreeze({
				accepted: accepted !== false,
				executed: false,
				direction: nextDirection,
				reason: reason || reasonForError(nextError),
				transaction: null,
				snapshotId: snapshotId || null,
				error: publicError(nextError)
			})
		}

		function clearResult(cleared, code, message) {
			return deepFreeze({
				cleared: !!cleared,
				undoCount: null,
				redoCount: null,
				error: publicError(createError(code, message))
			})
		}

		function normalizeKind(value) {
			const kind = String(value || '').trim()
			if (!KIND_PATTERN.test(kind)) {
				throw createError('INVALID_SPEC', 'Transaction kind must be 1-64 lowercase kebab-case characters.')
			}
			return kind
		}

		function normalizeInput(value) {
			const input = String(value || '')
			if (!INPUTS.includes(input)) {
				throw createError('INVALID_SPEC', 'Transaction input must be mouse, keyboard, gamepad, touch, or api.')
			}
			return input
		}

		function normalizePlane(value) {
			return Number(value) === 1 ? 1 : 0
		}

		function validateAdapter(adapter) {
			if (!isPlainObject(adapter) || adapter.version !== ADAPTER_VERSION) {
				throw createError('INVALID_SPEC', 'Transaction adapters must use version ' + ADAPTER_VERSION + '.')
			}
			for (const method of ['prepare', 'preflight', 'capture', 'apply', 'verify', 'restore']) {
				if (typeof adapter[method] !== 'function') {
					throw createError('INVALID_SPEC', 'Transaction adapter is missing ' + method + '().')
				}
			}
		}

		function requireApplySuccess(value) {
			if (value === false || (isPlainObject(value) && value.ok === false)) {
				throw createError('APPLY_FAILED', String(value?.message || 'The transaction apply step failed.'))
			}
		}

		function requireRestoreSuccess(value) {
			if (value === false || (isPlainObject(value) && value.ok === false)) {
				throw createError('ROLLBACK_FAILED', String(value?.message || 'The transaction rollback failed.'))
			}
		}

		function readCurrentSaveEnvelope(game) {
			if (
				!game ||
				typeof game.assembleSave !== 'function' ||
				typeof game.decodeSave !== 'function'
			) {
				return null
			}
			try {
				const data = game.assembleSave(true)
				if (typeof data !== 'string' && !(data instanceof Uint8Array)) return null
				const decoded = game.decodeSave(data)
				const saveInstanceId = String(decoded?.modloader?.saveInstanceId || '').trim().toLowerCase()
				if (!saveInstanceId) return null
				return { data, saveInstanceId }
			} catch (readError) {
				return null
			}
		}

		function readCurrentSaveIdentity(game) {
			return readCurrentSaveEnvelope(game)?.saveInstanceId || null
		}

		function normalizePlain(value, label) {
			const seen = new Set()
			return clonePlainValue(value, String(label || 'value'), seen)
		}

		function clonePlainValue(value, label, seen) {
			if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
			if (typeof value === 'number') {
				if (!Number.isFinite(value)) throw createError('INVALID_SPEC', label + ' contains a non-finite number.')
				return value
			}
			if (typeof value !== 'object') {
				throw createError('INVALID_SPEC', label + ' must contain only JSON-compatible values.')
			}
			if (seen.has(value)) throw createError('INVALID_SPEC', label + ' contains a circular reference.')
			seen.add(value)
			try {
				if (Array.isArray(value)) {
					if (Object.getOwnPropertySymbols(value).length) {
						throw createError('INVALID_SPEC', label + ' contains symbol keys.')
					}
					const descriptors = Object.getOwnPropertyDescriptors(value)
					for (const key of Object.keys(descriptors)) {
						if (key === 'length') continue
						if (!/^(?:0|[1-9]\d*)$/.test(key)) {
							throw createError('INVALID_SPEC', label + ' contains a non-index array property.')
						}
						const descriptor = descriptors[key]
						if (!descriptor.enumerable || !('value' in descriptor)) {
							throw createError('INVALID_SPEC', label + ' contains an accessor or hidden array item.')
						}
					}
					const output = []
					for (let index = 0; index < value.length; index += 1) {
						const descriptor = descriptors[index]
						if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
							throw createError('INVALID_SPEC', label + ' contains a sparse array.')
						}
						output.push(clonePlainValue(descriptor.value, label + '[' + index + ']', seen))
					}
					return output
				}
				if (!isPlainObject(value)) throw createError('INVALID_SPEC', label + ' contains a non-plain object.')
				if (Object.getOwnPropertySymbols(value).length) {
					throw createError('INVALID_SPEC', label + ' contains symbol keys.')
				}
				const descriptors = Object.getOwnPropertyDescriptors(value)
				const output = {}
				for (const key of Object.keys(descriptors).sort()) {
					if (DANGEROUS_KEYS.has(key)) throw createError('INVALID_SPEC', label + ' contains a dangerous key.')
					const descriptor = descriptors[key]
					if (!descriptor.enumerable || !('value' in descriptor)) {
						throw createError('INVALID_SPEC', label + ' contains an accessor or hidden property.')
					}
					output[key] = clonePlainValue(descriptor.value, label + '.' + key, seen)
				}
				return output
			} finally {
				seen.delete(value)
			}
		}

		function isPlainObject(value) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) return false
			const prototype = Object.getPrototypeOf(value)
			if (prototype === null) return true
			return (
				Object.prototype.toString.call(value) === '[object Object]' &&
				Object.getPrototypeOf(prototype) === null
			)
		}

		function plainEqual(left, right) {
			return JSON.stringify(left) === JSON.stringify(right)
		}

		function deepFreeze(value) {
			if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
			for (const key of Object.keys(value)) deepFreeze(value[key])
			return Object.freeze(value)
		}

		function publicError(value) {
			if (!value) return null
			return Object.freeze({
				code: normalizeErrorCode(value.code, 'TRANSACTION_FAILED'),
				message: String(value.message || 'The transaction operation failed.')
			})
		}

		function createError(code, message) {
			const error = new Error(String(message || code || 'Transaction failed.'))
			error.code = normalizeErrorCode(code, 'TRANSACTION_FAILED')
			return error
		}

		function normalizeError(value, fallbackCode) {
			if (value instanceof Error) {
				if (!value.code) value.code = fallbackCode
				return value
			}
			return createError(fallbackCode, String(value?.message || value || 'Transaction failed.'))
		}

		function normalizePhaseError(value, currentPhase) {
			if (value?.code) return normalizeError(value, value.code)
			const fallback = currentPhase === 'applying'
				? 'APPLY_FAILED'
				: currentPhase === 'verifying'
					? 'VERIFY_FAILED'
					: currentPhase === 'snapshotting'
						? 'SNAPSHOT_FAILED'
						: 'PREFLIGHT_FAILED'
			return createError(
				fallback,
				String(value?.message || 'The transaction operation failed.')
			)
		}

		function normalizeErrorCode(value, fallback) {
			const code = String(value || '').trim().toUpperCase()
			return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : fallback
		}

		function reasonForError(value) {
			return normalizeErrorCode(value?.code, 'TRANSACTION_FAILED').toLowerCase().replace(/_/g, '-')
		}
	}
})
