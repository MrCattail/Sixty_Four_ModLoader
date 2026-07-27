ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const CREATIVE_KEY = Symbol.for('cattail.world-editor.creative-mode')
		const SAVE_SLOTS_KEY = Symbol.for('cattail.better-uis.save-slots')
		const SAVE_ID_PATTERN = /^[0-9a-f-]{16,128}$/i
		const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
		const CREATIVE_SUFFIX = '创造模式'
		const ORIGINAL_NAME_MAX_LENGTH = 60
		const loadedStates = new WeakMap()
		let activeController = null

		api.on('beforeSaveLoad', function (save, game) {
			if (game && (typeof game === 'object' || typeof game === 'function')) {
				loadedStates.set(game, normalizePersistedState(save?.modloader?.worldEditor))
			}
			return save
		})

		api.on('beforeSaveWrite', function (save, game) {
			if (!save || typeof save !== 'object' || Array.isArray(save)) return save
			if (!save.modloader || typeof save.modloader !== 'object' || Array.isArray(save.modloader)) save.modloader = {}
			const state = activeController?.game === game
				? activeController.persistedState()
				: loadedStates.get(game) || defaultPersistedState()
			save.modloader.worldEditor = serializePersistedState(state)
			return save
		})

		api.on('afterGameInit', async function (payload, game) {
			const previous = globalThis[CREATIVE_KEY]
			previous?.dispose?.('creative-runtime-replaced')
			let finalizationError = null
			const saveSlots = globalThis[SAVE_SLOTS_KEY]
			if (saveSlots?.version === 1 && typeof saveSlots.settle === 'function') {
				try {
					await saveSlots.settle({ game })
				} catch (error) {
					finalizationError = normalizeError(error, 'FORK_FINALIZATION_FAILED')
				}
			}
			const controller = createController(game, loadedStates.get(game) || defaultPersistedState(), finalizationError)
			activeController = controller
			Object.defineProperty(globalThis, CREATIVE_KEY, {
				value: controller,
				configurable: true,
				writable: true
			})
			console.info('[Cattail World Editor] Creative mode 4A-2a ready.')
		})

		function createController(game, initialState, finalizationError) {
			let persisted = normalizePersistedState(initialState)
			let pendingPersisted = null
			let ready = !finalizationError
			let pendingForkFinalization = !!finalizationError
			let busy = false
			let dialogOpen = false
			let disposed = false
			let revision = 0
			let lastReason = finalizationError ? 'fork-finalization-failed' : 'initialized'
			let error = finalizationError
			const listeners = new Set()

			function snapshot() {
				return Object.freeze({
					version: '1.0.0',
					ready: !disposed && ready,
					creativeMode: !disposed && ready && !!persisted.creativeMode,
					entryMode: persisted.entryMode,
					createdAt: persisted.createdAt,
					busy: !disposed && busy,
					dialogOpen: !disposed && dialogOpen,
					pendingForkFinalization: !disposed && pendingForkFinalization,
					revision,
					lastReason,
					error: publicError(error),
					disposed
				})
			}

			function notify(reason) {
				if (reason) lastReason = String(reason)
				revision += 1
				const current = snapshot()
				for (const listener of Array.from(listeners)) {
					try {
						listener(current)
					} catch (listenerError) {
						console.warn('[Cattail World Editor] Creative state listener failed.', listenerError)
					}
				}
			}

			async function persistMode(nextCreativeMode, entryMode, reason) {
				if (disposed) throw createError('NOT_READY', 'Creative mode is not available.')
				if (!ready) throw error || createError('NOT_READY', 'Creative mode is not ready.')
				if (busy) throw createError('BUSY', 'A creative-mode operation is already active.')
				if (!game || typeof game.saveGame !== 'function' || typeof game.decodeSave !== 'function') {
					throw createError('NOT_READY', 'Saving is not available.')
				}
				if (game.preventSaving || game.preventCloud) throw createError('SAVING_BLOCKED', 'Saving is currently blocked.')

				const previous = persisted
				const previousAuto = readActiveEncodedSave(game)
				const previousDecoded = decodeSave(game, previousAuto)
				const previousId = normalizeSaveId(previousDecoded?.modloader?.saveInstanceId)
				if (!previousAuto || !previousDecoded || !previousId) {
					throw createError('VERIFY_FAILED', 'The active save identity could not be verified.')
				}

				const target = Object.freeze({
					schema: 1,
					creativeMode: !!nextCreativeMode,
					entryMode: entryMode === 'forked' ? 'forked' : 'in-place',
					createdAt: nextCreativeMode
						? previous.creativeMode && previous.createdAt
							? previous.createdAt
							: Date.now()
						: previous.createdAt
				})
				busy = true
				error = null
				pendingPersisted = target
				notify(reason + '-saving')
				try {
					game.saveGame()
					const encoded = readActiveEncodedSave(game)
					const decoded = decodeSave(game, encoded)
					const saved = normalizePersistedState(decoded?.modloader?.worldEditor)
					const savedId = normalizeSaveId(decoded?.modloader?.saveInstanceId)
					if (
						!encoded ||
						!decoded ||
						saved.creativeMode !== target.creativeMode ||
						saved.entryMode !== target.entryMode ||
						saved.createdAt !== target.createdAt ||
						savedId !== previousId
					) {
						throw createError('VERIFY_FAILED', 'The creative-mode state could not be verified.')
					}
					persisted = target
					loadedStates.set(game, target)
					pendingPersisted = null
					busy = false
					dialogOpen = false
					notify(reason + '-complete')
					return snapshot()
				} catch (operationError) {
					pendingPersisted = null
					persisted = previous
					busy = false
					error = normalizeError(operationError, 'SAVE_FAILED')
					try {
						restoreActiveEncodedSave(game, previousAuto)
					} catch (restoreError) {
						ready = false
						error = createError('ROLLBACK_FAILED', 'The previous active save could not be restored.')
					}
					notify(reason + '-failed')
					throw error
				}
			}

			async function createFork(options) {
				if (disposed || !ready) throw error || createError('NOT_READY', 'Creative mode is not ready.')
				if (busy) throw createError('BUSY', 'A creative-mode operation is already active.')
				if (persisted.creativeMode) throw createError('INVALID_STATE', 'Creative mode is already enabled.')
				if (game.preventSaving || game.preventCloud) throw createError('SAVING_BLOCKED', 'Saving is currently blocked.')
				const originalName = normalizeOriginalName(options?.originalName)
				const creativeName = originalName + CREATIVE_SUFFIX
				const saveSlots = globalThis[SAVE_SLOTS_KEY]
				if (
					saveSlots?.version !== 1 ||
					typeof saveSlots.snapshot !== 'function' ||
					typeof saveSlots.createAndActivate !== 'function'
				) {
					throw createError('SAVE_SLOTS_UNAVAILABLE', 'Better UIs save slots are unavailable.')
				}
				const slotsState = saveSlots.snapshot()
				if (!slotsState?.ready) throw createError('SAVE_SLOTS_UNAVAILABLE', 'Better UIs save slots are not ready.')
				if (Number(slotsState.emptyCount) < 2) throw createError('INSUFFICIENT_EMPTY_SLOTS', 'Two empty manual save slots are required.')
				if (slotsState.slots?.some?.(function (slot) { return slot?.occupied && slot.name === creativeName })) {
					throw createError('NAME_CONFLICT', 'A creative copy already uses this name.')
				}
				if (
					typeof game.assembleSave !== 'function' ||
					typeof game.decodeSave !== 'function' ||
					typeof game.encodeSave !== 'function'
				) {
					throw createError('NOT_READY', 'Save encoding is unavailable.')
				}

				busy = true
				error = null
				notify('fork-preparing')
				try {
					const originalData = game.assembleSave()
					const originalDecoded = decodeSave(game, originalData)
					const originalId = normalizeSaveId(originalDecoded?.modloader?.saveInstanceId)
					if (!originalData || !originalDecoded || !originalId) {
						throw createError('VERIFY_FAILED', 'The current save could not be verified.')
					}
					const creativeSave = JSON.parse(JSON.stringify(originalDecoded))
					if (!creativeSave.modloader || typeof creativeSave.modloader !== 'object' || Array.isArray(creativeSave.modloader)) {
						creativeSave.modloader = {}
					}
					const createdAt = Date.now()
					creativeSave.modloader.worldEditor = {
						schema: 1,
						creativeMode: true,
						entryMode: 'forked',
						createdAt
					}
					delete creativeSave.modloader.saveInstanceId
					const creativeData = game.encodeSave(JSON.stringify(creativeSave))
					const creativeDecoded = decodeSave(game, creativeData)
					const creativeState = normalizePersistedState(creativeDecoded?.modloader?.worldEditor)
					if (
						typeof creativeData !== 'string' ||
						!creativeData ||
						!creativeDecoded ||
						!creativeState.creativeMode ||
						creativeState.entryMode !== 'forked' ||
						normalizeSaveId(creativeDecoded?.modloader?.saveInstanceId)
					) {
						throw createError('VERIFY_FAILED', 'The creative copy could not be verified.')
					}
					const result = await saveSlots.createAndActivate({
						entries: [
							{ name: originalName, data: originalData, nameConflict: 'allow' },
							{ name: creativeName, data: creativeData, nameConflict: 'reject' }
						],
						activateEntry: 1
					})
					if (!result?.activated || !result?.reloadScheduled) {
						throw createError('ACTIVATE_FAILED', 'The creative copy was not activated.')
					}
					lastReason = 'fork-reload-scheduled'
					revision += 1
					return result
				} catch (operationError) {
					busy = false
					error = normalizeError(operationError, 'FORK_FAILED')
					notify('fork-failed')
					throw error
				}
			}

			const controller = Object.freeze({
				version: '1.0.0',
				game,
				snapshot,
				persistedState() {
					return pendingPersisted || persisted
				},
				subscribe(listener) {
					if (typeof listener !== 'function') throw new TypeError('Creative state listener must be a function.')
					if (disposed) return function () {}
					listeners.add(listener)
					listener(snapshot())
					return function () {
						listeners.delete(listener)
					}
				},
				setDialogOpen(open, reason) {
					if (disposed || (busy && !open)) return false
					const next = !!open
					if (dialogOpen === next) return false
					dialogOpen = next
					notify(reason || (next ? 'dialog-opened' : 'dialog-closed'))
					return true
				},
				enableInPlace(reason) {
					return persistMode(true, 'in-place', String(reason || 'enable-in-place'))
				},
				createFork,
				disable(reason) {
					return persistMode(false, persisted.entryMode || 'in-place', String(reason || 'disable'))
				},
				isInputBlocked() {
					return !disposed && (dialogOpen || busy || pendingForkFinalization)
				},
				dispose(reason) {
					if (disposed) return false
					disposed = true
					dialogOpen = false
					busy = false
					listeners.clear()
					lastReason = String(reason || 'disposed')
					if (activeController === controller) activeController = null
					if (globalThis[CREATIVE_KEY] === controller) delete globalThis[CREATIVE_KEY]
					return true
				}
			})
			return controller
		}

		function normalizePersistedState(value) {
			if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 1) {
				return defaultPersistedState()
			}
			return Object.freeze({
				schema: 1,
				creativeMode: value.creativeMode === true,
				entryMode: value.entryMode === 'forked' ? 'forked' : value.entryMode === 'in-place' ? 'in-place' : null,
				createdAt: finiteTimestamp(value.createdAt)
			})
		}

		function defaultPersistedState() {
			return Object.freeze({ schema: 1, creativeMode: false, entryMode: null, createdAt: 0 })
		}

		function serializePersistedState(value) {
			const state = normalizePersistedState(value)
			return {
				schema: 1,
				creativeMode: state.creativeMode,
				entryMode: state.entryMode,
				createdAt: state.createdAt
			}
		}

		function normalizeOriginalName(value) {
			if (typeof value !== 'string') throw createError('INVALID_NAME', 'The original save name is required.')
			const name = value.trim()
			if (!name || name.length > ORIGINAL_NAME_MAX_LENGTH || CONTROL_CHARACTER_PATTERN.test(name)) {
				throw createError('INVALID_NAME', 'The original save name must contain 1 to 60 valid characters.')
			}
			return name
		}

		function readActiveEncodedSave(game) {
			return localStorage.getItem(`abstractv03${game?.steamId || ''}`)
		}

		function restoreActiveEncodedSave(game, value) {
			if (!value) throw createError('ROLLBACK_FAILED', 'There is no previous active save.')
			localStorage.setItem(`abstractv03${game?.steamId || ''}`, value)
			if (localStorage.getItem(`abstractv03${game?.steamId || ''}`) !== value) {
				throw createError('ROLLBACK_FAILED', 'The previous active save could not be restored.')
			}
			game.spaceport?.send?.('save', value)
		}

		function decodeSave(game, value) {
			if (!value || typeof game?.decodeSave !== 'function') return null
			try {
				const decoded = game.decodeSave(value)
				return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded : null
			} catch (error) {
				return null
			}
		}

		function normalizeSaveId(value) {
			const id = String(value || '').trim().toLowerCase()
			return SAVE_ID_PATTERN.test(id) ? id : ''
		}

		function finiteTimestamp(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : 0
		}

		function createError(code, message) {
			const error = new Error(message)
			error.name = 'WorldEditorCreativeError'
			error.code = code
			return error
		}

		function normalizeError(error, fallbackCode) {
			if (error?.name === 'WorldEditorCreativeError') return error
			return createError(String(error?.code || fallbackCode || 'FAILED'), String(error?.message || 'Creative-mode operation failed.'))
		}

		function publicError(error) {
			if (!error) return null
			return Object.freeze({
				code: String(error.code || 'FAILED'),
				message: String(error.message || 'Creative-mode operation failed.')
			})
		}
	}
})
