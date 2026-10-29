ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const KEY = Symbol.for('cattail.world-editor.save-adapter')
		const runtimes = new WeakMap()
		let saveOriginal = null

		function runtime(game) {
			if (!runtimes.has(game)) runtimes.set(game, { epoch: 0, pending: new Set(), gate: null, edits: new Set(), blocked: null })
			return runtimes.get(game)
		}

		function isNative(game) {
			return !!game && (Array.isArray(game.saveSlots) || typeof game.assemblePermanents === 'function')
		}

		function fail(code, message) {
			const error = new Error(message)
			error.code = code
			return error
		}

		function identity(state) {
			const id = String(state?.modloader?.saveInstanceId || '').trim().toLowerCase()
			if (!/^[0-9a-f-]{16,128}$/.test(id)) throw fail('VERIFY_FAILED', 'The active save identity could not be verified.')
			return id
		}

		function capture(game) {
			const slotId = game?.currentSlotId
			const slot = game?.saveSlots?.[slotId]
			if (!Number.isInteger(slotId) || slotId < 0 || !Array.isArray(slot?.stack) ||
				typeof game.readFromSlot !== 'function' || typeof game.assemblePermanents !== 'function') {
				throw fail('SAVE_UNAVAILABLE', 'The active 1.3 save slot is unavailable.')
			}
			const state = game.assembleSave()
			return Object.freeze({ slotId, slot, saveId: identity(state), epoch: runtime(game).epoch, owner: game.steamId })
		}

		// Cheap enough to check before each live brush cell. Identity is checked
		// against assembled state at operation boundaries, in addition to this tuple.
		function isCurrent(game, context) {
			return !!context && game.currentSlotId === context.slotId && game.saveSlots?.[context.slotId] === context.slot &&
				game.steamId === context.owner && runtime(game).epoch === context.epoch
		}

		function assertCurrent(game, context) {
			if (!isCurrent(game, context) || identity(game.assembleSave()) !== context.saveId) {
				throw fail('SAVE_CONTEXT_CHANGED', 'The active save changed. Reload before trying again.')
			}
		}

		function isSavingBlocked(game) {
			return isCurrent(game, runtime(game).blocked)
		}

		async function acquireEdit(game, context) {
			const state = runtime(game)
			const previous = state.gate
			let resolveGate
			let released = false
			const gate = state.gate = new Promise(function (resolve) { resolveGate = resolve })
			const lease = Object.freeze({ release() {
				if (released) return
				released = true
				state.edits.delete(lease)
				if (state.gate === gate) state.gate = null
				resolveGate()
			} })
			state.edits.add(lease)
			try {
				if (previous) await previous
				await Promise.allSettled(Array.from(state.pending))
				assertCurrent(game, context)
				if (released || isSavingBlocked(game) || game.preventSaving || game.preventCloud) {
					throw fail('SAVING_BLOCKED', 'Editing is blocked until the active save is available. Reload if recovery failed.')
				}
				await readVerified(game, context)
				return lease
			} catch (error) {
				lease.release()
				throw error
			}
		}

		async function readVerified(game, context) {
			assertCurrent(game, context)
			const stored = await game.readFromSlot(context.slotId)
			assertCurrent(game, context)
			const record = stored?.stack?.[0]
			if (!record?.state || identity(record.state) !== context.saveId) {
				throw fail('VERIFY_FAILED', 'The active save identity could not be verified.')
			}
			return record
		}

		function trackSave(game, action) {
			const state = runtime(game)
			// Preserve the native synchronous pre-await capture, including the
			// normal Pinhole checkpoint immediately before preventSaving is set.
			let result
			try { result = Promise.resolve(action()) } catch (error) { result = Promise.reject(error) }
			state.pending.add(result)
			const settled = function () { state.pending.delete(result) }
			result.then(settled, settled)
			return result
		}

		async function exclusive(game, action) {
			const state = runtime(game)
			const previous = state.gate
			let release
			const gate = state.gate = new Promise(function (resolve) { release = resolve })
			try {
				if (previous) await previous
				await Promise.allSettled(Array.from(state.pending))
				return await action()
			} finally {
				if (state.gate === gate) state.gate = null
				release()
			}
		}

		api.on('beforeSaveLoad', function (save, game) {
			if (game) {
				const state = runtime(game)
				state.epoch += 1
				state.blocked = null
				for (const lease of Array.from(state.edits)) lease.release()
			}
			return save
		})

		api.on('afterVanillaScripts', function () {
			if (saveOriginal || typeof Game === 'undefined' || typeof Game.prototype.saveGame !== 'function') return
			api.patch(Game.prototype, 'saveGame', function (original) {
				saveOriginal = original
				return function () {
					if (!isNative(this)) return original.apply(this, arguments)
					const game = this
					const args = Array.from(arguments)
					const slotId = game.currentSlotId
					const slot = game.saveSlots?.[slotId]
					const epoch = runtime(game).epoch
					const owner = game.steamId
					const save = function () {
						// A queued autosave from a previous world must never save the new one.
						if (game.currentSlotId !== slotId || game.saveSlots?.[slotId] !== slot || runtime(game).epoch !== epoch || game.steamId !== owner || isSavingBlocked(game)) return
						return trackSave(game, function () { return original.apply(game, args) })
					}
					if (!runtime(game).gate) return save()
					return (async function () {
						while (runtime(game).gate) await runtime(game).gate
						return save()
					})()
				}
			})
		})

		Object.defineProperty(globalThis, KEY, {
			configurable: true,
			value: Object.freeze({
				isNative,
				capture,
				isCurrent,
				assertCurrent,
				readVerified,
				acquireEdit,
				isSavingBlocked,
				blockSaving(game, context) {
					if (isCurrent(game, context)) runtime(game).blocked = context
				},
				withSaveLock(game, context, action) {
					return exclusive(game, async function () {
						assertCurrent(game, context)
						if (!saveOriginal) throw fail('SAVE_UNAVAILABLE', 'The 1.3 save adapter is not ready.')
						return action(async function () {
							assertCurrent(game, context)
							if (game.preventSaving || game.preventCloud || isSavingBlocked(game)) throw fail('SAVING_BLOCKED', 'Saving is currently blocked.')
							await saveOriginal.call(game)
							assertCurrent(game, context)
						})
					})
				},
				encodeSnapshot(game, context) {
					assertCurrent(game, context)
					const record = { isProtected: false, state: game.assembleSave(), permanents: game.assemblePermanents() }
					if (identity(record.state) !== context.saveId) throw fail('VERIFY_FAILED', 'Snapshot identity changed.')
					// Native encodeSave uses btoa. Escape Unicode without losing mod metadata.
					const json = JSON.stringify(record).replace(/[\u007f-\uffff]/g, function (character) {
						return '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')
					})
					const data = game.encodeSave(json)
					const decoded = typeof data === 'string' && game.decodeSave(data)
					if (!data || JSON.stringify(decoded) !== JSON.stringify(record)) {
						throw fail('SAVE_UNAVAILABLE', 'The complete 1.3 snapshot could not be encoded.')
					}
					return data
				}
			})
		})
	}
})
