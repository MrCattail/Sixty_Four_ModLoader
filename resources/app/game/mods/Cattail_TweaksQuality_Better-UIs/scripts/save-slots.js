ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		const SERVICE_KEY = Symbol.for('cattail.better-uis.save-slots')
		if (api.config.get('enableSaveSlots', true) === false) {
			if (globalThis[SERVICE_KEY]?.owner === api.id) delete globalThis[SERVICE_KEY]
			return
		}
		const serviceVersion = 1
		const manualSlotCount = 20
		const maxNameLength = 64
		const pageShell = api.ui.pages
		const contexts = new WeakMap()
		let activeGame = null
		let activeSplash = null
		let pendingConfirmation = null
		let pendingImport = null
		let statusKey = ''
		let statusDetail = ''
		let baseSave = null

		class SaveSlotsServiceError extends Error {
			constructor(code, message) { super(message); this.name = 'SaveSlotsServiceError'; this.code = code }
		}
		function fail(code, message) { throw new SaveSlotsServiceError(code, message) }
		function clone(value) { return JSON.parse(JSON.stringify(value)) }
		function context(game) {
			if (!contexts.has(game)) contexts.set(game, { queue: Promise.resolve(), busy: 0, activating: false, error: null, cloudSaved: null, persistedIdentity: '' })
			return contexts.get(game)
		}
		function enqueue(game, work) {
			if (!game) return Promise.reject(new SaveSlotsServiceError('NOT_READY', 'Save slots are not ready.'))
			const ctx = context(game)
			ctx.busy++
			const result = ctx.queue.catch(() => {}).then(work)
			ctx.queue = result.catch(() => {})
			return result.finally(() => { ctx.busy--; refreshOpenSlotsPage(game) })
		}
		function requireWritable(game) {
			if (game?.version !== '1.3' || !Array.isArray(game.saveSlots) || !game.localDatabase) fail('NOT_READY', 'Native 1.3 slots are not ready.')
			if (context(game).error) throw context(game).error
			if (context(game).activating) fail('TRANSACTION_ACTIVE', 'A save is being activated.')
			if (game.preventSaving || game.preventCloud) fail('SAVING_BLOCKED', 'Saving is currently blocked.')
		}
		function mutate(game, work) {
			return enqueue(game, async () => { requireWritable(game); return work() }).catch(error => {
				throw error instanceof SaveSlotsServiceError ? error : new SaveSlotsServiceError('WRITE_FAILED', String(error?.message || error))
			})
		}
		async function saveCurrent(game) {
			requireWritable(game)
			await (baseSave || game.saveGame).call(game)
		}
		function nativeSlots(game) { return Array.isArray(game?.saveSlots) ? game.saveSlots : [] }
		function source(game) {
			const slot = nativeSlots(game)[game.currentSlotId]
			const id = normalizeSaveInstanceId(slot?.stack?.[0]?.state?.modloader?.saveInstanceId)
			return slot && id && context(game).persistedIdentity === id ? { index: game.currentSlotId, name: slotTitle(game, slot, game.currentSlotId), saveInstanceId: id } : null
		}
		function serviceSnapshot() {
			const game = activeGame
			const ctx = game ? context(game) : null
			const slots = nativeSlots(game)
			const length = Math.max(manualSlotCount, slots.length)
			const emptyIndices = game ? availableIndices(game) : []
			const summaries = Array.from({ length }, (_, index) => {
				const slot = slots[index]
				return Object.freeze({ index, occupied: !!slot, name: String(slot?.name || ''), timestamp: recordTime(slot?.stack?.[0], slot), pendingActivation: !!ctx?.activating })
			})
			return Object.freeze({ version: serviceVersion, ready: !!game && game.version === '1.3' && !!game.localDatabase && !ctx.busy && !ctx.activating && !ctx.error && !game.preventSaving,
				manualSlotCount, maxNameLength, emptyCount: game ? emptyIndices.length : 0,
				emptyIndices: Object.freeze(game ? emptyIndices : []), slots: Object.freeze(game ? summaries : []),
				source: game && source(game) ? Object.freeze(source(game)) : null, pendingActivation: !!ctx?.activating,
				error: ctx?.error ? Object.freeze({ code: ctx.error.code, message: ctx.error.message }) : null })
		}
		const service = Object.freeze({
			owner: api.id, version: serviceVersion,
			capabilities() { return Object.freeze({ version: serviceVersion, ready: serviceSnapshot().ready, manualSlotCount, maxNameLength,
				atomicBatch: true, atomicBatchScope: 'local-indexeddb', verifiedSource: true, lineageFinalization: true, createAndActivate: true, storage: 'native-1.3' }) },
			snapshot: serviceSnapshot,
			settle(options) { return settleService(options?.game || activeGame) },
			createAndActivate
		})
		Object.defineProperty(globalThis, SERVICE_KEY, { value: service, configurable: true, writable: true })

		pageShell.register({
			id: 'saveSlots', prefix: 'cattail-save-slots', width: '1760px', contentClass: 'cattail-save-slots-list',
			scrollbarVisibleClass: 'cattail-save-slots-scrollbar-visible', contentHeight: '790px', mobileContentHeight: '620px',
			contentOffset: '318px', mobileContentOffset: '300px',
			inertialScroll: { friction: .88, directInfluence: .30, tailInfluence: .13, maxVelocity: 34, stopThreshold: .35 },
			insertBefore(splash, menu) { return menu?.querySelector('.resetProgressbar')?.closest('.menuItem') },
			menuLabel(game) { return text(game, 'menu') }, title(game) { return text(game, 'title') }, backLabel(game) { return text(game, 'back') },
			onOpen(ctx) { activeSplash = ctx.splash; activeGame = ctx.game; runUI(() => mutate(ctx.game, () => saveCurrent(ctx.game))) },
			onClose() { pendingConfirmation = null; pendingImport = null; activeSplash = null },
			canCloseOnEscape(ctx, event) { return !event.target?.classList?.contains('cattail-save-slots-name-input') },
			renderBeforeContent(ctx) { return renderTransferBar(ctx.splash, ctx.page) },
			renderContent(ctx) { activeSplash = ctx.splash; activeGame = ctx.game; renderSlotsContent(ctx) }
		})
		api.on('afterVanillaScripts', () => {
			installStyles()
			if (typeof Game === 'undefined') return
			api.patch(Game.prototype, 'saveGame', original => {
				baseSave = original
				return function (...args) {
					return enqueue(this, async () => {
						if (context(this).activating || context(this).error) return
						return original.apply(this, args)
					}).catch(error => { showError(error); throw error })
				}
			})
			api.patch(Game.prototype, 'writeToSlot', original => async function (...args) {
				const result = await original.apply(this, args)
				context(this).cloudSaved = result === true
				if (args[1] === this.currentSlotId && args[0] === this.saveSlots[this.currentSlotId]) context(this).persistedIdentity = normalizeSaveInstanceId(args[0]?.stack?.[0]?.state?.modloader?.saveInstanceId)
				if (result !== true) statusKey = 'localOnly'
				else if (statusKey === 'localOnly') statusKey = 'saved'
				return result
			})
		})
		api.on('afterGameInit', async (payload, game) => {
			try { await settleService(game) } catch (error) { showError(error) }
		})

		async function settleService(game) {
			if (!game) return serviceSnapshot()
			activeGame = game
			return enqueue(game, async () => {
				const ctx = context(game)
				if (ctx.activating) return serviceSnapshot()
				try {
					const raw = localStorage.getItem(activationKey(game))
					const slot = nativeSlots(game)[game.currentSlotId]
					const saved = await game.readFromSlot(game.currentSlotId)
					const savedId = normalizeSaveInstanceId(saved?.stack?.[0]?.state?.modloader?.saveInstanceId)
					ctx.persistedIdentity = savedId && savedId === normalizeSaveInstanceId(slot?.stack?.[0]?.state?.modloader?.saveInstanceId) ? savedId : ''
					if (raw) {
						const marker = JSON.parse(raw)
						if (marker.schema !== 2 || marker.index !== game.currentSlotId || marker.steamId !== String(game.steamId || '') ||
							!marker.saveInstanceId || slot?.stack?.[0]?.state?.modloader?.saveInstanceId !== marker.saveInstanceId ||
							saved?.stack?.[0]?.state?.modloader?.saveInstanceId !== marker.saveInstanceId) {
							fail('VERIFY_FAILED', 'The activated save does not match its persisted identity.')
						}
						localStorage.removeItem(activationKey(game))
					}
					ctx.error = null
				} catch (error) {
					ctx.error = error instanceof SaveSlotsServiceError ? error : new SaveSlotsServiceError('VERIFY_FAILED', String(error?.message || error))
					throw ctx.error
				}
			}).then(() => serviceSnapshot())
		}

		// Commit the changed native records in one local transaction. Cloud failure never
		// discards successfully persisted local data. The original timers remain intact.
		function writeLocalCollection(game, previous, next) {
			return new Promise((resolve, reject) => {
				const tx = game.localDatabase.transaction('charps_memory_slots', 'readwrite')
				const store = tx.objectStore('charps_memory_slots')
				tx.oncomplete = resolve
				tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed.'))
				tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'))
				try {
					for (let i = 0; i < Math.max(previous.length, next.length); i++) {
						if (previous[i] === next[i]) continue
						if (next[i]) store.put(next[i], [game.steamId, i])
						else store.delete([game.steamId, i])
					}
				} catch (error) { tx.abort(); reject(error) }
			})
		}
		async function persistCollection(game, next, activeIndex = game.currentSlotId) {
			const previous = game.saveSlots
			const previousIndex = game.currentSlotId
			await writeLocalCollection(game, previous, next)
			game.saveSlots = next
			if (activeIndex !== previousIndex) {
				try { game.currentSlotId = activeIndex; game.savePreferences() }
				catch (error) {
					game.currentSlotId = previousIndex
					try {
						await writeLocalCollection(game, next, previous)
						game.saveSlots = previous
						game.savePreferences()
					} catch (rollbackError) {
						game.preventSaving = true
						context(game).error = new SaveSlotsServiceError('ROLLBACK_FAILED', 'Could not restore the previous slot selection. Restart before continuing.')
						throw context(game).error
					}
					throw error
				}
			}
			context(game).persistedIdentity = normalizeSaveInstanceId(next[activeIndex]?.stack?.[0]?.state?.modloader?.saveInstanceId)
			let cloudSaved = false
			try { cloudSaved = await game.spaceport?.invoke?.('store', game.saveSlots) === true }
			catch (error) { console.warn('[Save Slots] Cloud write failed; local records are retained.', error) }
			context(game).cloudSaved = cloudSaved
			statusKey = cloudSaved ? 'saved' : 'localOnly'
			statusDetail = ''
			return cloudSaved
		}
		function availableIndices(game) {
			const slots = nativeSlots(game)
			if (slots.filter(Boolean).length >= manualSlotCount) return []
			return Array.from({ length: manualSlotCount }, (_, i) => i).filter(i => !slots[i])
		}
		function checkCapacity(game, count) {
			const indices = availableIndices(game)
			if (!count || count > indices.length) fail('INSUFFICIENT_EMPTY_SLOTS', text(game, 'full'))
			return indices
		}
		function normalName(value, allowEmpty = false) {
			if (typeof value !== 'string') fail('INVALID_NAME', 'The save name must be text.')
			const name = value.trim()
			if ((!allowEmpty && !name) || name.length > maxNameLength || /[\u0000-\u001f\u007f]/.test(name)) fail('INVALID_NAME', 'The save name is invalid.')
			return name
		}
		function normalizeSaveInstanceId(value) { return /^[0-9a-f-]{16,128}$/i.test(String(value || '')) ? String(value).toLowerCase() : '' }
		function newIdentity() {
			if (!globalThis.crypto?.getRandomValues) fail('NOT_READY', 'Secure save identity generation is unavailable.')
			if (crypto.randomUUID) return crypto.randomUUID()
			return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
		}
		function forkSlot(slot) {
			const copy = clone(slot)
			const identities = new Map()
			for (const record of copy.stack) {
				if (!record.state) continue
				const oldId = normalizeSaveInstanceId(record.state.modloader?.saveInstanceId)
				if (!identities.has(oldId)) identities.set(oldId, newIdentity())
				record.state.modloader = { ...(record.state.modloader || {}), saveInstanceId: identities.get(oldId) }
			}
			copy.lastModified = Date.now()
			return copy
		}
		function validWorld(value) { return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.stuff) && Array.isArray(value.resources) }
		function validRecord(value) {
			return value && typeof value === 'object' && !Array.isArray(value) && (value.state === null || validWorld(value.state)) &&
				value.permanents && typeof value.permanents === 'object' && !Array.isArray(value.permanents)
		}
		function decodeInput(game, raw) {
			if (typeof raw !== 'string') {
				if (!raw || typeof raw !== 'object') fail('INVALID_SAVE', text(game, 'importInvalid'))
				return clone(raw)
			}
			const content = raw.trim()
			if (!content) fail('INVALID_SAVE', text(game, 'importInvalid'))
			const header = /^CattailSaveSlots:v([12])\s*\n/.exec(content)
			if (header) {
				const value = JSON.parse(decodeBase64(content.slice(header[0].length)))
				if (value?.version !== Number(header[1])) fail('INVALID_SAVE', 'Backup header and version disagree.')
				return value
			}
			try { return JSON.parse(content) } catch (_) {}
			const value = game.decodeSave(content)
			if (!value || typeof value !== 'object') fail('INVALID_SAVE', text(game, 'importInvalid'))
			return clone(value)
		}
		function normalizeSlot(game, input) {
			const value = decodeInput(game, input)
			let slot
			if (Array.isArray(value?.stack)) {
				if (!value.stack.length || !value.stack.every(validRecord)) fail('INVALID_SAVE', text(game, 'importInvalid'))
				slot = clone(value)
			} else if (validRecord(value?.data)) {
				slot = { name: value.name || '', ownerHash: value.ownerHash, creationTimeStamp: value.creationTimeStamp, lastModified: value.lastModified, stack: [clone(value.data)] }
			} else if (typeof value?.data === 'string') {
				if (value.pendingActivation) fail('INVALID_SAVE', 'An unfinished legacy activation must be resolved before migration.')
				slot = normalizeSlot(game, value.data)
				slot.name = typeof value.name === 'string' ? value.name : ''
				slot.creationTimeStamp = safeTimestamp(value.createdAt) || slot.creationTimeStamp
			} else if (validWorld(value)) {
				slot = { name: '', ownerHash: 64, creationTimeStamp: Date.now(), lastModified: Date.now(), stack: [{ isProtected: false,
					state: clone(value), permanents: clone(value.permanents || { glory: value.glory || null, completions: 0, upgrades: 0, orbUpgradeMap: [] }) }] }
			} else fail('INVALID_SAVE', text(game, 'importInvalid'))
			if (!slot.stack.every(validRecord)) fail('INVALID_SAVE', text(game, 'importInvalid'))
			slot.name = normalName(typeof slot.name === 'string' ? slot.name : '', true)
			slot.ownerHash = Number.isFinite(slot.ownerHash) ? slot.ownerHash : 64
			slot.creationTimeStamp = safeTimestamp(slot.creationTimeStamp) || Date.now()
			slot.lastModified = safeTimestamp(slot.lastModified) || slot.creationTimeStamp
			return slot
		}
		function parseImportedSlots(game, raw) {
			const payload = decodeInput(game, raw)
			let values
			if (Array.isArray(payload)) values = payload.filter(value => value != null)
			else if (payload?.type === 'Cattail_TweaksQuality_Saves-Slots' && payload.version === 2) {
				if (!Array.isArray(payload.slots)) fail('INVALID_SAVE', text(game, 'importInvalid'))
				values = payload.slots.filter(value => value != null)
			} else if (Array.isArray(payload?.manual) || Array.isArray(payload?.slots)) {
				if (payload.version !== undefined && payload.version !== 1) fail('INVALID_SAVE', 'Unsupported backup version.')
				values = (payload.manual || payload.slots).filter(value => value != null)
				const auto = payload.auto || payload.autosave
				if (auto) values.unshift(auto)
			} else values = [payload]
			if (!values.length) fail('INVALID_SAVE', text(game, 'importInvalid'))
			return { slots: values.map(value => normalizeSlot(game, value)) }
		}
		async function appendSlots(game, slots, activateEntry = null) {
			const indices = checkCapacity(game, slots.length)
			const next = game.saveSlots.slice()
			const receipts = slots.map((slot, i) => {
				const copy = forkSlot(slot)
				copy.name ||= text(game, 'defaultSlotName', { index: indices[i] + 1 })
				next[indices[i]] = copy
				return { index: indices[i], name: copy.name, timestamp: recordTime(copy.stack[0], copy) }
			})
			if (activateEntry !== null) {
				await activateCollection(game, next, receipts[activateEntry].index)
			} else await persistCollection(game, next)
			return receipts
		}
		async function createAndActivate(options) {
			const game = activeGame
			if (!game) fail('NOT_READY', 'Save slots are not ready.')
			if (context(game).busy || context(game).activating) fail('TRANSACTION_ACTIVE', 'A save-slot transaction is already active.')
			return mutate(game, async () => {
				const entries = options?.entries
				const index = options?.activateEntry
				if (!Array.isArray(entries) || !entries.length || !Number.isInteger(index) || index < 0 || index >= entries.length) fail('INVALID_ARGUMENT', 'Invalid activation batch.')
				checkCapacity(game, entries.length)
				const names = game.saveSlots.filter(Boolean).map(slot => String(slot.name || '').trim())
				const slots = entries.map(entry => {
					const name = normalName(entry?.name)
					if (!['allow', 'reject'].includes(entry.nameConflict)) fail('INVALID_ARGUMENT', 'nameConflict must be allow or reject.')
					if (entry.nameConflict === 'reject' && names.includes(name)) fail('NAME_CONFLICT', 'A save slot already uses this name.')
					names.push(name)
					const decoded = decodeInput(game, entry.data)
					const slot = normalizeSlot(game, decoded)
					// The legacy service passes a world-only creative fork of the current
					// game. Carry its current NG+ state unless a complete record was supplied.
					if (validWorld(decoded) && !decoded.permanents) {
						slot.stack[0].permanents = clone(game.assemblePermanents())
						slot.ownerHash = game.saveSlots[game.currentSlotId]?.ownerHash ?? game.hash53(game.steamId)
					}
					slot.name = name
					return slot
				})
				await saveCurrent(game)
				const receipts = await appendSlots(game, slots, index)
				return Object.freeze({ activated: true, entries: Object.freeze(receipts.map(Object.freeze)), activeIndex: receipts[index].index, reloadScheduled: true })
			})
		}
		function activationKey(game) { return `abstractv03_saveSlotsNativeActivation${game.steamId}` }
		async function activateCollection(game, next, index) {
			const identity = normalizeSaveInstanceId(next[index]?.stack?.[0]?.state?.modloader?.saveInstanceId)
			const oldMarker = localStorage.getItem(activationKey(game))
			// Identity-bearing activations are verified against IndexedDB after reload.
			if (identity) localStorage.setItem(activationKey(game), JSON.stringify({ schema: 2, steamId: String(game.steamId || ''), index, saveInstanceId: identity }))
			const ctx = context(game)
			const blocked = game.preventSaving
			game.preventSaving = true
			ctx.activating = true
			try {
				await persistCollection(game, next, index)
			} catch (error) {
				ctx.activating = false
				if (!ctx.error) game.preventSaving = blocked
				if (oldMarker === null) localStorage.removeItem(activationKey(game))
				else localStorage.setItem(activationKey(game), oldMarker)
				throw error
			}
			setTimeout(() => globalThis.location.reload(), 100)
		}
		function activateRecord(game, slot, record) {
			return mutate(game, async () => {
				const index = game.saveSlots.indexOf(slot)
				if (index < 0 || !slot.stack.includes(record)) fail('STALE_SAVE', text(game, 'changed'))
				const selected = clone(record)
				await saveCurrent(game)
				const next = game.saveSlots.slice()
				const copy = clone(slot)
				const position = slot.stack.indexOf(record)
				if (position >= 0) copy.stack.splice(position, 1)
				copy.stack.unshift(selected)
				if (position < 0) trimHistory(game, copy.stack)
				copy.lastModified = Date.now()
				next[index] = copy
				await activateCollection(game, next, index)
			})
		}
		function copyCurrent(game, targetSlot = null) {
			return mutate(game, async () => {
				const targetIndex = targetSlot === null ? null : game.saveSlots.indexOf(targetSlot)
				if (targetIndex === -1) fail('STALE_SAVE', text(game, 'changed'))
				if (targetSlot === null) checkCapacity(game, 1)
				await saveCurrent(game)
				const current = game.saveSlots[game.currentSlotId]
				if (targetIndex === null) return appendSlots(game, [{ ...clone(current), name: '', stack: [clone(current.stack[0])], creationTimeStamp: Date.now() }])
				if (targetIndex === game.currentSlotId) return
				const target = game.saveSlots[targetIndex]
				if (!target) fail('STALE_SAVE', text(game, 'changed'))
				const next = game.saveSlots.slice()
				const copy = clone(target)
				copy.stack.unshift(forkSlot({ stack: [current.stack[0]] }).stack[0])
				trimHistory(game, copy.stack)
				copy.ownerHash = current.ownerHash
				copy.lastModified = Date.now()
				next[targetIndex] = copy
				return persistCollection(game, next)
			})
		}
		function trimHistory(game, stack) {
			if (stack.length <= (game.maxSaveStack || 16)) return
			for (let i = stack.length - 1; i > 0; i--) if (!stack[i].isProtected) { stack.splice(i, 1); break }
		}
		function changeSlot(game, slot, action, value) {
			return mutate(game, async () => {
				const index = game.saveSlots.indexOf(slot)
				if (index < 0) fail('STALE_SAVE', text(game, 'changed'))
				if (action === 'copy') {
					checkCapacity(game, 1)
					await saveCurrent(game)
					const suffix = ' — ' + text(game, 'copy')
					return appendSlots(game, [{ ...clone(slot), name: slotTitle(game, slot, index).slice(0, maxNameLength - suffix.length) + suffix }])
				}
				if (action === 'delete' && index === game.currentSlotId) fail('ACTIVE_SLOT', text(game, 'activeDelete'))
				await saveCurrent(game)
				const next = game.saveSlots.slice()
				let activeIndex = game.currentSlotId
				if (action === 'delete') { next.splice(index, 1); if (activeIndex > index) activeIndex-- }
				else if (action === 'rename') next[index] = { ...slot, name: normalName(value, true), lastModified: Date.now() }
				else fail('INVALID_ARGUMENT', 'Unknown slot operation.')
				return persistCollection(game, next, activeIndex)
			})
		}
		async function legacyPreview(game) {
			const raw = localStorage.getItem(slotsKey(game))
			if (!raw) fail('INVALID_SAVE', text(game, 'noLegacy'))
			const values = JSON.parse(raw)
			if (!Array.isArray(values)) fail('INVALID_SAVE', text(game, 'importInvalid'))
			const slots = []
			for (let i = 0; i < values.length; i++) {
				if (!values[i]) continue
				const bytes = new TextEncoder().encode(String(game.steamId || '') + ':' + i + ':' + JSON.stringify(values[i]))
				const digest = await crypto.subtle.digest('SHA-256', bytes)
				const key = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
				if (game.saveSlots.some(slot => slot?.betterUIs?.legacyImportKey === key)) continue
				const slot = normalizeSlot(game, values[i])
				slot.betterUIs = { ...(slot.betterUIs || {}), legacyImportKey: key }
				slots.push(slot)
			}
			if (!slots.length) fail('INVALID_SAVE', text(game, 'noLegacy'))
			return { slots, legacyRaw: raw }
		}
		function applyImportedSlots(game, imported) {
			return mutate(game, async () => {
				if (imported.legacyRaw !== undefined && localStorage.getItem(slotsKey(game)) !== imported.legacyRaw) fail('STALE_SAVE', text(game, 'changed'))
				if (imported.slots.some(slot => slot.betterUIs?.legacyImportKey && game.saveSlots.some(existing => existing?.betterUIs?.legacyImportKey === slot.betterUIs.legacyImportKey))) fail('STALE_SAVE', text(game, 'changed'))
				checkCapacity(game, imported.slots.length)
				await saveCurrent(game)
				return appendSlots(game, imported.slots)
			})
		}
		function buildExportPayload(game) {
			return { type: 'Cattail_TweaksQuality_Saves-Slots', version: 2, exportedAt: new Date().toISOString(),
				steamId: String(game.steamId || ''), slotCount: manualSlotCount, currentSlotId: game.currentSlotId, slots: clone(game.saveSlots) }
		}
		function safeTimestamp(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null }
		function recordTime(record, slot) { return safeTimestamp(record?.state?.timestamp) || (record === slot?.stack?.[0] ? safeTimestamp(slot?.lastModified) : null) }
		function slotsKey(game) { return `abstractv03_saveSlots${game.steamId}` }
		function slotTitle(game, slot, index) { return slot?.name || text(game, 'defaultSlotName', { index: index + 1 }) }
		function showError(error) {
			console.warn('[Save Slots]', error)
			statusKey = 'operationFailed'
			statusDetail = String(error?.message || error)
			if (activeGame) refreshOpenSlotsPage(activeGame, true)
		}
		async function runUI(work) { try { return await work() } catch (error) { showError(error) } }
		function refreshOpenSlotsPage(game, force = false) {
			if (!activeSplash || activeSplash.master !== game || !pageShell.isActive('saveSlots')) return
			const page = activeSplash.element?.querySelector('.cattail-save-slots-page')
			if (!force && (pendingConfirmation || pendingImport || page?.querySelector('.cattail-save-slots-name-input'))) return
			const list = page?.querySelector('.cattail-save-slots-list')
			const top = list?.scrollTop || 0
			pageShell.refresh('saveSlots')
			const next = activeSplash.element?.querySelector('.cattail-save-slots-list')
			if (next) next.scrollTop = top
		}
		function renderSlotsPage() { if (activeGame) refreshOpenSlotsPage(activeGame, true) }

		function renderSlotsContent(ctx) {
			const game = ctx.game
			const slots = nativeSlots(game)
			ctx.content.append(renderNativeRow(game, slots[game.currentSlotId], game.currentSlotId, true))
			const rule = document.createElement('div')
			rule.className = 'cattail-save-slots-rule-strong'
			ctx.content.append(rule)
			for (let index = 0; index < Math.max(manualSlotCount, slots.length); index++) ctx.content.append(renderNativeRow(game, slots[index], index))
		}
		function renderNativeRow(game, slot, index, isAuto = false) {
			const row = document.createElement('div')
			row.className = `cattail-save-slots-row${isAuto ? ' cattail-save-slots-auto' : ''}${slot ? '' : ' cattail-save-slots-empty'}`
			row.dataset.slotIndex = String(index)
			const title = isAuto ? text(game, 'autoSlotName') : slot ? slotTitle(game, slot, index) : text(game, 'emptySlot', { index: index + 1 })
			const rowKey = isAuto ? 'auto' : index
			const select = type => { pendingConfirmation = { index: rowKey, type, slot, record: slot?.stack?.[0] }; renderSlotsPage() }
			const info = actionButton('', false, () => slot ? select('load') : copyCurrent(game))
			info.className = 'cattail-save-slots-info'
			const name = document.createElement('div')
			name.className = 'cattail-save-slots-name'
			name.textContent = title
			const time = document.createElement('div')
			time.className = 'cattail-save-slots-time'
			time.textContent = (slot ? formatTime(recordTime(slot.stack?.[0], slot)) : '') + (!isAuto && slot && index === game.currentSlotId ? ' · ' + text(game, 'current') : '')
			info.append(name, time)
			const resources = document.createElement('div')
			resources.className = 'cattail-save-slots-resources'
			for (const node of renderResourceSummary(game, slot?.stack?.[0]?.state)) resources.append(node)
			const resourceArea = document.createElement('div')
			resourceArea.className = 'cattail-save-slots-resource-area'
			resourceArea.append(resources)
			if (slot?.stack?.length) resourceArea.append(renderTimeline(game, slot))
			const actions = document.createElement('div')
			actions.className = 'cattail-save-slots-actions'
			const confirmation = pendingConfirmation?.index === rowKey ? pendingConfirmation : null
			if (confirmation) {
				actions.append(confirmAction(game, { key: confirmation.type,
					ok: async () => {
						pendingConfirmation = null
						if (confirmation.type === 'load') await activateRecord(game, confirmation.slot, confirmation.record)
						if (confirmation.type === 'delete') await changeSlot(game, confirmation.slot, 'delete')
						if (confirmation.type === 'overwrite') {
							await copyCurrent(game, confirmation.slot)
						}
						renderSlotsPage()
					}, cancel: () => { pendingConfirmation = null; renderSlotsPage() } }))
			} else {
				const add = (key, disabled, work) => { if (actions.childNodes.length) actions.append(actionSeparator()); actions.append(actionButton(text(game, key), disabled, work)) }
				if (!slot) add('newSlot', !availableIndices(game).length, () => copyCurrent(game))
				else if (isAuto) { add('save', false, () => mutate(game, () => saveCurrent(game))); add('load', false, () => select('load')) }
				else {
					add('load', false, () => select('load'))
					add('overwrite', false, () => select('overwrite'))
					add('copy', !availableIndices(game).length, () => changeSlot(game, slot, 'copy'))
					add('rename', false, () => renderRenameSlot(game, row, slot))
					add('delete', index === game.currentSlotId, () => select('delete'))
				}
			}
			row.append(info, resourceArea, actions)
			return row
		}
		function renderTimeline(game, slot) {
			const timeline = document.createElement('div')
			timeline.className = 'cattail-save-slots-timeline'
			timeline.setAttribute('aria-label', text(game, 'history'))
			const entries = slot.stack.map((record, index) => ({ record, index, time: recordTime(record, slot) }))
			entries.sort((a, b) => (a.time || 0) - (b.time || 0) || b.index - a.index)
			timeline.style.setProperty('--node-count', entries.length)
			// Container breakpoints choose a balanced subset of labels. All dots remain.
			// Minimum track widths account for the two 32px side margins.
			const labelSets = [[2, 0], [3, 176], [5, 296], [7, 416], [10, 596], [16, 956]].map(([capacity, width]) => {
				let count = Math.min(entries.length, capacity)
				while (count > 2 && Math.floor((entries.length - 1) / (count - 1)) * width / (entries.length - 1) < 60) count--
				const positions = new Set(Array.from({ length: count }, (_, i) => count === 1 ? 0 : Math.round(i * (entries.length - 1) / (count - 1))))
				return { capacity, positions }
			})
			const track = document.createElement('div')
			track.className = 'cattail-save-slots-timeline-track'
			timeline.append(track)
			entries.forEach(({ record, index, time }, position) => {
				const button = actionButton('', false, () => activateRecord(game, slot, record))
				button.className = 'cattail-save-slots-timeline-node' + (index === 0 ? ' is-current' : '')
				button.style.setProperty('--position', entries.length === 1 ? .5 : position / (entries.length - 1))
				for (const { capacity, positions } of labelSets) button.style.setProperty(`--label-${capacity}`, positions.has(position) ? 'visible' : 'hidden')
				const timestamp = time ? formatTime(time) : text(game, 'noTime')
				button.title = timestamp + (index === 0 ? ' · ' + text(game, 'latest') : '')
				button.setAttribute('aria-label', text(game, 'load') + ': ' + button.title)
				const dot = document.createElement('span')
				dot.className = 'cattail-save-slots-timeline-dot'
				const label = document.createElement('span')
				label.className = 'cattail-save-slots-timeline-label'
				label.textContent = time ? timestamp.slice(5).replace(' ', '\n') : text(game, 'noTime')
				button.append(dot, label)
				timeline.append(button)
			})
			return timeline
		}
		function renderRenameSlot(game, row, slot) {
			row.replaceChildren()
			row.classList.add('cattail-save-slots-editing')
			const input = document.createElement('input')
			input.className = 'cattail-save-slots-name-input'
			input.type = 'text'
			input.value = slot.name || ''
			input.maxLength = maxNameLength
			input.spellcheck = false
			input.autocomplete = 'off'
			const saveName = async () => { await changeSlot(game, slot, 'rename', input.value); renderSlotsPage() }
			const actions = document.createElement('div')
			actions.className = 'cattail-save-slots-actions'
			actions.append(actionButton(text(game, 'save'), false, saveName), actionSeparator(), actionButton(text(game, 'cancel'), false, renderSlotsPage))
			for (const name of ['keyup', 'keypress', 'beforeinput', 'paste', 'input', 'compositionstart', 'compositionupdate', 'compositionend', 'mousedown', 'pointerdown', 'click', 'touchstart']) input.addEventListener(name, event => event.stopPropagation(), true)
			input.addEventListener('keydown', event => {
				event.stopPropagation()
				if (event.isComposing) return
				if (event.key === 'Enter') { event.preventDefault(); runUI(saveName) }
				if (event.key === 'Escape') { event.preventDefault(); renderSlotsPage() }
			}, true)
			row.append(input, actions)
			setTimeout(() => { input.focus(); input.select() }, 0)
		}
		function renderTransferBar(splash) {
			const game = splash.master
			const bar = document.createElement('div')
			bar.className = 'cattail-save-slots-transfer'
			if (pendingImport) {
				const imported = pendingImport
				const preview = document.createElement('span')
				preview.className = 'cattail-save-slots-transfer-status'
				preview.textContent = text(game, 'importConfirm', { count: imported.slots.length }) + ' ' + imported.slots.map((slot, i) => slot.name || text(game, 'defaultSlotName', { index: i + 1 })).join(' · ')
				bar.append(preview, actionButton(text(game, 'confirmImport'), false, async () => {
					await applyImportedSlots(game, imported)
					pendingImport = null
					renderSlotsPage()
				}), actionSeparator(), actionButton(text(game, 'cancel'), false, () => { pendingImport = null; renderSlotsPage() }))
			} else {
				bar.append(actionButton(text(game, 'exportSlots'), false, () => exportSlotsFile(game)), actionSeparator(),
					actionButton(text(game, 'importSlots'), false, () => chooseImportFile(game)), actionSeparator(),
					actionButton(text(game, 'importClipboard'), false, async () => { setImportPreview(game, await navigator.clipboard.readText()) }))
				if (localStorage.getItem(slotsKey(game))) bar.append(actionSeparator(), actionButton(text(game, 'migrateLegacy'), false, async () => {
					pendingImport = await legacyPreview(game)
					pendingConfirmation = null
					renderSlotsPage()
				}))
			}
			if (statusKey) {
				const status = document.createElement('span')
				status.className = 'cattail-save-slots-operation-status'
				status.setAttribute('role', 'status')
				status.textContent = text(game, statusKey) + (statusDetail ? ' ' + statusDetail : '')
				bar.append(status)
			}
			return bar
		}
		function setImportPreview(game, content) {
			pendingImport = parseImportedSlots(game, content)
			pendingConfirmation = null
			statusKey = ''
			statusDetail = ''
			renderSlotsPage()
		}
		function chooseImportFile(game) {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.cattail-save-slots,.txt,.json,text/plain,application/json'
			input.style.display = 'none'
			input.onchange = () => {
				const file = input.files?.[0]
				input.remove()
				if (!file) return
				const reader = new FileReader()
				reader.onload = () => runUI(() => setImportPreview(game, String(reader.result || '')))
				reader.onerror = () => showError(new Error(text(game, 'importInvalid')))
				reader.readAsText(file)
			}
			input.oncancel = () => input.remove()
			document.body.append(input)
			input.click()
		}
		function exportSlotsFile(game) {
			return mutate(game, async () => {
				await saveCurrent(game)
				const content = 'CattailSaveSlots:v2\n' + encodeBase64(JSON.stringify(buildExportPayload(game)))
				const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
				const link = document.createElement('a')
				link.href = url
				link.download = exportFileName()
				document.body.append(link)
				link.click()
				link.remove()
				setTimeout(() => URL.revokeObjectURL(url), 1000)
			})
		}
		function confirmAction(game, action) {
			const wrap = document.createElement('span')
			wrap.className = 'cattail-save-slots-confirm-action'
			const label = document.createElement('span')
			label.className = 'cattail-save-slots-confirm-label'
			label.textContent = text(game, action.key)
			const ok = actionButton('', false, action.ok)
			ok.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-ok')
			ok.setAttribute('aria-label', text(game, 'save'))
			const cancel = actionButton('', false, action.cancel)
			cancel.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-cancel')
			cancel.setAttribute('aria-label', text(game, 'cancel'))
			wrap.append(label, ok, actionSeparator(), cancel)
			return wrap
		}
		function actionButton(label, disabled, onClick) {
			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = label
			button.disabled = disabled || !!(activeGame && context(activeGame).activating)
			button.onclick = async event => {
				event.preventDefault()
				event.stopPropagation()
				if (button.disabled || typeof onClick !== 'function') return
				button.disabled = true
				try { await runUI(onClick) } finally { button.disabled = disabled || !!(activeGame && context(activeGame).activating) }
			}
			return button
		}
		function actionSeparator() {
			const separator = document.createElement('span')
			separator.className = 'cattail-save-slots-action-separator'
			separator.textContent = '|'
			return separator
		}

		function encodeBase64(value) {
			const bytes = new TextEncoder().encode(value)
			let binary = ''
			for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
			return btoa(binary)
		}

		function decodeBase64(value) {
			const binary = atob(String(value || '').replace(/\s+/g, ''))
			const bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
			return new TextDecoder().decode(bytes)
		}

		function exportFileName() {
			const date = new Date()
			const pad = function (value) { return String(value).padStart(2, '0') }
			return `Cattail_SaveSlots_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.cattail-save-slots`
		}

		function renderResourceSummary(game, decoded) {
			const resources = Array.isArray(decoded?.resources) ? decoded.resources : []
			const nodes = []
			for (let i = 0; i < resources.length; i++) {
				const value = resources[i]
				if (!value || value <= 0) continue
				const chunk = document.createElement('span')
				chunk.className = 'cattail-save-slots-resource'
				const icon = document.createElement('span')
				icon.className = `rico r${i}`
				const amount = document.createElement('span')
				amount.className = 'cattail-save-slots-resource-amount'
				amount.textContent = game.makeReadable ? game.makeReadable(value) : formatNumber(value)
				chunk.append(icon, amount)
				nodes.push(chunk)
			}
			return nodes
		}

		function formatNumber(value) {
			if (value >= 1000000000) return Math.floor(value / 1000000000) + 'B'
			if (value >= 1000000) return Math.floor(value / 1000000) + 'M'
			if (value >= 1000) return Math.floor(value / 1000) + 'K'
			return Math.floor(value).toString()
		}
		const LABELS = {
			en: {
				menu: 'Saves', title: 'Saves', autoSlot: 'Autosave {time}', autoEmpty: 'Autosave: empty', load: 'Load', emptySlot: 'Empty slot {index}', overwrite: 'Overwrite', overwriteConfirm: 'Overwrite slot {index}?', rename: 'Rename', delete: 'Delete', deleteConfirm: 'Delete slot {index}?', newSlot: 'New', defaultSlotName: 'Save {index}', save: 'Save', cancel: 'Cancel', cannotSave: 'Saving is not available now.'
			},
			ru: {
				menu: 'Сохранения', title: 'Сохранения', autoSlot: 'Автосохранение {time}', autoEmpty: 'Автосохранение: пусто', load: 'Загрузить', emptySlot: 'Пустой слот {index}', overwrite: 'Перезаписать', overwriteConfirm: 'Перезаписать слот {index}?', rename: 'Переименовать', delete: 'Удалить', deleteConfirm: 'Удалить слот {index}?', newSlot: 'Создать', defaultSlotName: 'Сохранение {index}', save: 'Сохранить', cancel: 'Отмена', cannotSave: 'Сейчас нельзя сохранить.'
			},
			de: {
				menu: 'Spielstände', title: 'Spielstände', autoSlot: 'Autosave {time}', autoEmpty: 'Autosave: leer', load: 'Laden', emptySlot: 'Leerer Slot {index}', overwrite: 'Überschreiben', overwriteConfirm: 'Slot {index} überschreiben?', rename: 'Umbenennen', delete: 'Löschen', deleteConfirm: 'Slot {index} löschen?', newSlot: 'Neu', defaultSlotName: 'Speicherstand {index}', save: 'Speichern', cancel: 'Abbrechen', cannotSave: 'Speichern ist jetzt nicht möglich.'
			},
			ptbr: {
				menu: 'Saves', title: 'Saves', autoSlot: 'Save automático {time}', autoEmpty: 'Save automático: vazio', load: 'Carregar', emptySlot: 'Slot vazio {index}', overwrite: 'Sobrescrever', overwriteConfirm: 'Sobrescrever slot {index}?', rename: 'Renomear', delete: 'Excluir', deleteConfirm: 'Excluir slot {index}?', newSlot: 'Novo', defaultSlotName: 'Save {index}', save: 'Salvar', cancel: 'Cancelar', cannotSave: 'Não é possível salvar agora.'
			},
			it: {
				menu: 'Salvataggi', title: 'Salvataggi', autoSlot: 'Salvataggio automatico {time}', autoEmpty: 'Salvataggio automatico: vuoto', load: 'Carica', emptySlot: 'Slot vuoto {index}', overwrite: 'Sovrascrivi', overwriteConfirm: 'Sovrascrivere lo slot {index}?', rename: 'Rinomina', delete: 'Elimina', deleteConfirm: 'Eliminare lo slot {index}?', newSlot: 'Nuovo', defaultSlotName: 'Salvataggio {index}', save: 'Salva', cancel: 'Annulla', cannotSave: 'Ora non è possibile salvare.'
			},
			es: {
				menu: 'Partidas', title: 'Partidas guardadas', autoSlot: 'Autoguardado {time}', autoEmpty: 'Autoguardado: vacío', load: 'Cargar', emptySlot: 'Ranura vacía {index}', overwrite: 'Sobrescribir', overwriteConfirm: '¿Sobrescribir ranura {index}?', rename: 'Renombrar', delete: 'Eliminar', deleteConfirm: '¿Eliminar ranura {index}?', newSlot: 'Nuevo', defaultSlotName: 'Partida {index}', save: 'Guardar', cancel: 'Cancelar', cannotSave: 'No se puede guardar ahora.'
			},
			fr: {
				menu: 'Sauvegardes', title: 'Sauvegardes', autoSlot: 'Sauvegarde auto {time}', autoEmpty: 'Sauvegarde auto : vide', load: 'Charger', emptySlot: 'Emplacement vide {index}', overwrite: 'Écraser', overwriteConfirm: 'Écraser l\'emplacement {index} ?', rename: 'Renommer', delete: 'Supprimer', deleteConfirm: 'Supprimer l\'emplacement {index} ?', newSlot: 'Nouveau', defaultSlotName: 'Sauvegarde {index}', save: 'Sauver', cancel: 'Annuler', cannotSave: 'Impossible de sauvegarder maintenant.'
			},
			nl: {
				menu: 'Opslagen', title: 'Opslagen', autoSlot: 'Automatisch opgeslagen {time}', autoEmpty: 'Automatisch opgeslagen: leeg', load: 'Laden', emptySlot: 'Leeg slot {index}', overwrite: 'Overschrijven', overwriteConfirm: 'Slot {index} overschrijven?', rename: 'Hernoemen', delete: 'Verwijderen', deleteConfirm: 'Slot {index} verwijderen?', newSlot: 'Nieuw', defaultSlotName: 'Opslag {index}', save: 'Opslaan', cancel: 'Annuleren', cannotSave: 'Opslaan is nu niet mogelijk.'
			},
			cz: {
				menu: 'Uložení', title: 'Uložení', autoSlot: 'Automatické uložení {time}', autoEmpty: 'Automatické uložení: prázdné', load: 'Načíst', emptySlot: 'Prázdný slot {index}', overwrite: 'Přepsat', overwriteConfirm: 'Přepsat slot {index}?', rename: 'Přejmenovat', delete: 'Smazat', deleteConfirm: 'Smazat slot {index}?', newSlot: 'Nový', defaultSlotName: 'Uložení {index}', save: 'Uložit', cancel: 'Zrušit', cannotSave: 'Nyní nelze uložit.'
			},
			pl: {
				menu: 'Zapisy', title: 'Zapisy', autoSlot: 'Autozapis {time}', autoEmpty: 'Autozapis: pusty', load: 'Wczytaj', emptySlot: 'Pusty slot {index}', overwrite: 'Nadpisz', overwriteConfirm: 'Nadpisać slot {index}?', rename: 'Zmień nazwę', delete: 'Usuń', deleteConfirm: 'Usunąć slot {index}?', newSlot: 'Nowy', defaultSlotName: 'Zapis {index}', save: 'Zapisz', cancel: 'Anuluj', cannotSave: 'Nie można teraz zapisać.'
			},
			jp: {
				menu: 'セーブ', title: 'セーブ', autoSlot: 'オートセーブ {time}', autoEmpty: 'オートセーブ: 空', load: '読込', emptySlot: '空スロット {index}', overwrite: '上書き', overwriteConfirm: 'スロット {index} を上書きしますか？', rename: '名前変更', delete: '削除', deleteConfirm: 'スロット {index} を削除しますか？', newSlot: '新規', defaultSlotName: 'セーブ {index}', save: '保存', cancel: 'キャンセル', cannotSave: '現在保存できません。'
			},
			kr: {
				menu: '저장', title: '저장', autoSlot: '자동 저장 {time}', autoEmpty: '자동 저장: 비어 있음', load: '불러오기', emptySlot: '빈 슬롯 {index}', overwrite: '덮어쓰기', overwriteConfirm: '슬롯 {index}을 덮어쓸까요?', rename: '이름 변경', delete: '삭제', deleteConfirm: '슬롯 {index}을 삭제할까요?', newSlot: '새로 만들기', defaultSlotName: '저장 {index}', save: '저장', cancel: '취소', cannotSave: '지금은 저장할 수 없습니다.'
			},
			sch: {
				menu: '存档', title: '存档', autoSlot: '自动存档 {time}', autoEmpty: '自动存档：空', load: '读取', emptySlot: '空存档格 {index}', overwrite: '覆盖', overwriteConfirm: '覆盖存档格 {index}？', rename: '改名', delete: '删除', deleteConfirm: '删除存档格 {index}？', newSlot: '新建', defaultSlotName: '存档{index}', save: '保存', cancel: '取消', cannotSave: '现在无法保存。'
			},
			modsch: {
				menu: '存档', title: '存档', autoSlot: '自动存档 {time}', autoEmpty: '自动存档：空', load: '读取', emptySlot: '空存档格 {index}', overwrite: '覆盖', overwriteConfirm: '覆盖存档格 {index}？', rename: '改名', delete: '删除', deleteConfirm: '删除存档格 {index}？', newSlot: '新建', defaultSlotName: '存档{index}', save: '保存', cancel: '取消', cannotSave: '现在无法保存。'
			},
			tch: {
				menu: '存檔', title: '存檔', autoSlot: '自動存檔 {time}', autoEmpty: '自動存檔：空', load: '讀取', emptySlot: '空存檔格 {index}', overwrite: '覆蓋', overwriteConfirm: '覆蓋存檔格 {index}？', rename: '改名', delete: '刪除', deleteConfirm: '刪除存檔格 {index}？', newSlot: '新增', defaultSlotName: '存檔{index}', save: '儲存', cancel: '取消', cannotSave: '現在無法存檔。'
			},
			thai: {
				menu: 'บันทึก', title: 'บันทึก', autoSlot: 'บันทึกอัตโนมัติ {time}', autoEmpty: 'บันทึกอัตโนมัติ: ว่าง', load: 'โหลด', emptySlot: 'ช่องว่าง {index}', overwrite: 'เขียนทับ', overwriteConfirm: 'เขียนทับช่อง {index}?', rename: 'เปลี่ยนชื่อ', delete: 'ลบ', deleteConfirm: 'ลบช่อง {index}?', newSlot: 'ใหม่', defaultSlotName: 'บันทึก {index}', save: 'บันทึก', cancel: 'ยกเลิก', cannotSave: 'ตอนนี้ไม่สามารถบันทึกได้'
			},
			hu: {
				menu: 'Mentések', title: 'Mentések', autoSlot: 'Automatikus mentés {time}', autoEmpty: 'Automatikus mentés: üres', load: 'Betöltés', emptySlot: 'Üres hely {index}', overwrite: 'Felülírás', overwriteConfirm: 'Felülírja a(z) {index}. helyet?', rename: 'Átnevezés', delete: 'Törlés', deleteConfirm: 'Törli a(z) {index}. helyet?', newSlot: 'Új', defaultSlotName: 'Mentés {index}', save: 'Mentés', cancel: 'Mégse', cannotSave: 'Most nem lehet menteni.'
			},
			lv: {
				menu: 'Saglabātie', title: 'Saglabātie', autoSlot: 'Automātiskais saglabājums {time}', autoEmpty: 'Automātiskais saglabājums: tukšs', load: 'Ielādēt', emptySlot: 'Tukša vieta {index}', overwrite: 'Pārrakstīt', overwriteConfirm: 'Pārrakstīt vietu {index}?', rename: 'Pārdēvēt', delete: 'Dzēst', deleteConfirm: 'Dzēst vietu {index}?', newSlot: 'Jauns', defaultSlotName: 'Saglabājums {index}', save: 'Saglabāt', cancel: 'Atcelt', cannotSave: 'Tagad nevar saglabāt.'
			},
			ro: {
				menu: 'Salvări', title: 'Salvări', autoSlot: 'Salvare automată {time}', autoEmpty: 'Salvare automată: gol', load: 'Încarcă', emptySlot: 'Slot gol {index}', overwrite: 'Suprascrie', overwriteConfirm: 'Suprascrii slotul {index}?', rename: 'Redenumește', delete: 'Șterge', deleteConfirm: 'Ștergi slotul {index}?', newSlot: 'Nou', defaultSlotName: 'Salvare {index}', save: 'Salvează', cancel: 'Anulează', cannotSave: 'Nu se poate salva acum.'
			},
			no: {
				menu: 'Lagringer', title: 'Lagringer', autoSlot: 'Autolagring {time}', autoEmpty: 'Autolagring: tom', load: 'Last inn', emptySlot: 'Tom plass {index}', overwrite: 'Overskriv', overwriteConfirm: 'Overskrive plass {index}?', rename: 'Gi nytt navn', delete: 'Slett', deleteConfirm: 'Slette plass {index}?', newSlot: 'Ny', defaultSlotName: 'Lagring {index}', save: 'Lagre', cancel: 'Avbryt', cannotSave: 'Kan ikke lagre nå.'
			}
		}

		const EXTRA_LABELS = {
			en: {back: 'Back', noTime: 'No save time', noResources: 'No resources', emptyResourceHint: 'Empty', exportSlots: 'Export all', importSlots: 'Import file', importConfirm: 'Import {count} manual slots?', importConfirmWithAuto: 'Import autosave and {count} manual slots?', importInvalid: 'This save-slot file could not be imported.', finalizing: 'Finalizing'},
			sch: {back: '返回', noTime: '没有存档时间', noResources: '没有资源', emptyResourceHint: '空', exportSlots: '导出全部', importSlots: '导入文件', importConfirm: '导入 {count} 个手动存档格？', importConfirmWithAuto: '导入自动存档和 {count} 个手动存档格？', importInvalid: '无法导入这个存档格文件。', finalizing: '正在完成'},
			modsch: {back: '返回', noTime: '没有存档时间', noResources: '没有资源', emptyResourceHint: '空', exportSlots: '导出全部', importSlots: '导入文件', importConfirm: '导入 {count} 个手动存档格？', importConfirmWithAuto: '导入自动存档和 {count} 个手动存档格？', importInvalid: '无法导入这个存档格文件。', finalizing: '正在完成'},
			tch: {back: '返回', noTime: '沒有存檔時間', noResources: '沒有資源', emptyResourceHint: '空', exportSlots: '匯出全部', importSlots: '匯入檔案', importConfirm: '匯入 {count} 個手動存檔格？', importConfirmWithAuto: '匯入自動存檔和 {count} 個手動存檔格？', importInvalid: '無法匯入這個存檔格檔案。', finalizing: '正在完成'}
		}

		const NATIVE_LABELS = {
			en: { importClipboard: 'Import from clipboard', migrateLegacy: 'Migrate old slots', confirmImport: 'Add slots', importConfirm: 'Add {count} new slots without switching?', copy: 'Copy', current: 'Playing', latest: 'Latest save', history: 'Save history', saved: 'Saved', localOnly: 'Saved locally. Steam cloud saving did not succeed.', operationFailed: 'Operation failed:', full: 'Not enough empty slots (20 slots maximum). Existing slots were kept.', changed: 'This save changed. Refresh and select it again.', activeDelete: 'Switch to another slot before deleting this slot.', noLegacy: 'No unmigrated old slots were found.' },
			sch: { importClipboard: '从剪贴板导入', migrateLegacy: '迁入旧槽位', confirmImport: '添加槽位', importConfirm: '新增 {count} 个槽位，不切换当前游戏？', copy: '复制', current: '正在游玩', latest: '最新保存', history: '存档历史', saved: '已保存', localOnly: '已保存在本地，Steam 云保存未成功。', operationFailed: '操作失败：', full: '空槽不足（最多 20 个普通槽）；已有存档全部保留。', changed: '存档已变化，请刷新后重新选择。', activeDelete: '请先切换到其他槽，再删除此槽。', noLegacy: '没有尚未迁入的旧槽位。' },
			tch: { importClipboard: '從剪貼簿匯入', migrateLegacy: '遷入舊槽位', confirmImport: '新增槽位', importConfirm: '新增 {count} 個槽位，不切換目前遊戲？', copy: '複製', current: '正在遊玩', latest: '最新儲存', history: '存檔歷史', saved: '已儲存', localOnly: '已儲存在本機，Steam 雲端儲存未成功。', operationFailed: '操作失敗：', full: '空槽不足（最多 20 個普通槽）；現有存檔全部保留。', changed: '存檔已變更，請重新整理後再選擇。', activeDelete: '請先切換到其他槽，再刪除此槽。', noLegacy: '沒有尚未遷入的舊槽位。' }
		}
		NATIVE_LABELS.modsch = NATIVE_LABELS.sch

		function text(game, key, values) {
			const language = game?.language || 'en'
			const labels = LABELS[language] || LABELS.en
			const extras = EXTRA_LABELS[language] || EXTRA_LABELS.en
			let template = NATIVE_LABELS[language]?.[key] || NATIVE_LABELS.en[key] || labels[key] || extras[key]
			if (!template && key === 'autoSlotName') template = (labels.autoSlot || LABELS.en.autoSlot).replace(/\s*\{time\}/, '').replace(/[：:]\s*$/, '').trim()
			if (!template && key === 'back') template = labels.cancel || LABELS.en.cancel
			if (!template && (key === 'noTime' || key === 'noResources' || key === 'emptyResourceHint')) template = ''
			if (!template) template = LABELS.en[key] || key
			return template.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] !== undefined ? values[name] : '' })
		}

		function formatTime(timestamp) {
			if (!timestamp) return ''
			const date = new Date(timestamp)
			if (Number.isNaN(date.getTime())) return ''
			const pad = function (value) { return String(value).padStart(2, '0') }
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
		}

		function installStyles() {
			if (document.getElementById('cattail-save-slots-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-save-slots-style'
			style.textContent = `
				.splash.cattail-save-slots-active { background:#000000F9; color:#fff; }
				.splash.cattail-save-slots-active .menu,
				.splash.cattail-save-slots-active .credit,
				.splash.cattail-save-slots-active .publisher,
				.splash.cattail-save-slots-active .flashlight,
				.splash.cattail-save-slots-active .chill,
				.splash.cattail-save-slots-active .fullscreen,
				.splash.cattail-save-slots-active .discord,
				.splash.cattail-save-slots-active .backupVessel,
				.splash.cattail-save-slots-active .gloryButton,
				.splash.cattail-save-slots-active > .headerBox,
				.splash.cattail-save-slots-active > .sixtyFour { display: none !important; }
				.cattail-save-slots-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
				.cattail-save-slots-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
				.cattail-save-slots-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
				.cattail-save-slots-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
				.cattail-save-slots-subtitle { margin:0 auto 12px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; }
				.cattail-save-slots-transfer { display:flex; align-items:center; justify-content:center; gap:14px; width:min(1760px,100%); min-height:28px; margin:0 auto 14px; color:rgba(255,255,255,.82); font:17px/1.2 Montserrat,Arial,sans-serif; letter-spacing:3px; white-space:nowrap; }
				.cattail-save-slots-transfer button { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-save-slots-transfer button:hover { color:#b56b87; }
				.cattail-save-slots-transfer-status { color:rgba(255,255,255,.66); }
				.cattail-save-slots-list { box-sizing:border-box; width:min(1760px,100%); height:min(790px,calc(100vh - 318px)); margin:0 auto; padding:2px 28px 16px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
				.cattail-save-slots-list:hover, .cattail-save-slots-list:active, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible { scrollbar-color:#fffc #fff2; }
				.cattail-save-slots-list::-webkit-scrollbar { width:10px; }
				.cattail-save-slots-list::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
				.cattail-save-slots-list::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
				.cattail-save-slots-list:hover::-webkit-scrollbar-track, .cattail-save-slots-list:active::-webkit-scrollbar-track, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
				.cattail-save-slots-list:hover::-webkit-scrollbar-thumb, .cattail-save-slots-list:active::-webkit-scrollbar-thumb, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
				.cattail-save-slots-row { display:grid; grid-template-columns:minmax(320px,.92fr) minmax(390px,1.14fr) minmax(340px,.86fr); align-items:center; gap:30px; min-height:106px; padding:18px; border-bottom:1px solid rgba(255,255,255,.42); transition:background .18s ease,color .18s ease; }
				.cattail-save-slots-row:hover, .cattail-save-slots-row.cattail-save-slots-editing { background:rgba(255,255,255,.08); }
				.cattail-save-slots-auto { border-bottom:0; }
				.cattail-save-slots-rule-strong { height:4px; width:calc(100% - 4px); margin:0 0 2px; background:rgba(255,255,255,.9); }
				.cattail-save-slots-info { appearance:none; border:0; background:transparent; color:inherit; font:inherit; text-align:left; padding:0; cursor:pointer; min-width:0; }
				.cattail-save-slots-name { font:600 27px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-save-slots-time { margin-top:9px; font:16px/1.35 Montserrat,Arial,sans-serif; letter-spacing:1px; color:rgba(255,255,255,.58); }
				.cattail-save-slots-resources { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:11px 18px; min-width:0; font:17px/1.2 Montserrat,Arial,sans-serif; color:rgba(255,255,255,.85); }
				.cattail-save-slots-resource { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
				.cattail-save-slots-resource .rico { display:inline-block; flex:0 0 auto; width:20px; height:22.5px; background-image:url('img/smallresources.png'); background-size:1000% 100%; transform:none; }
				.cattail-save-slots-resource-amount { display:inline-flex; align-items:center; min-height:22.5px; line-height:22.5px; }
				.cattail-save-slots-resource .rico.r0 { background-position:0 0; } .cattail-save-slots-resource .rico.r1 { background-position:11.111111% 0; } .cattail-save-slots-resource .rico.r2 { background-position:22.222222% 0; } .cattail-save-slots-resource .rico.r3 { background-position:33.333333% 0; } .cattail-save-slots-resource .rico.r4 { background-position:44.444444% 0; } .cattail-save-slots-resource .rico.r5 { background-position:55.555556% 0; } .cattail-save-slots-resource .rico.r6 { background-position:66.666667% 0; } .cattail-save-slots-resource .rico.r7 { background-position:77.777778% 0; } .cattail-save-slots-resource .rico.r8 { background-position:88.888889% 0; } .cattail-save-slots-resource .rico.r9 { background-position:100% 0; }
				.cattail-save-slots-no-resources { color:rgba(255,255,255,.35); letter-spacing:2px; }
				.cattail-save-slots-actions { display:flex; align-items:center; justify-content:flex-end; gap:11px; min-width:0; font:18px/1.2 Montserrat,Arial,sans-serif; letter-spacing:2px; white-space:nowrap; }
				.cattail-save-slots-actions button, .cattail-save-slots-back { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-save-slots-actions button:hover, .cattail-save-slots-back:hover, .cattail-save-slots-info:hover .cattail-save-slots-name { color:#b56b87; }
				.cattail-save-slots-actions button:disabled { cursor:default; opacity:.3; color:inherit; }
				.cattail-save-slots-confirm-action { display:inline-flex; align-items:center; justify-content:flex-end; gap:22px; min-width:260px; }
				.cattail-save-slots-confirm-label { margin-right:36px; font-weight:600; }
				.cattail-save-slots-confirm-icon { position:relative; width:24px; height:24px; min-width:24px; letter-spacing:0; }
				.cattail-save-slots-confirm-icon:before, .cattail-save-slots-confirm-icon:after { content:''; position:absolute; display:block; height:1px; background:currentColor; transform-origin:left center; }
				.cattail-save-slots-confirm-ok:before { left:5px; top:13px; width:8px; transform:rotate(45deg); }
				.cattail-save-slots-confirm-ok:after { left:10.4px; top:18.5px; width:16px; transform:rotate(-48deg); }
				.cattail-save-slots-confirm-cancel:before, .cattail-save-slots-confirm-cancel:after { left:3px; top:12px; width:18px; transform-origin:center; }
				.cattail-save-slots-confirm-cancel:before { transform:rotate(45deg); }
				.cattail-save-slots-confirm-cancel:after { transform:rotate(-45deg); }
				.cattail-save-slots-action-separator { color:rgba(255,255,255,.42); }
				.cattail-save-slots-back { display:block; box-sizing:border-box; width:min(1760px,100%); margin:22px auto 0; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; }
				.cattail-save-slots-name-input { grid-column:1 / 3; box-sizing:border-box; width:100%; min-height:44px; border:0; border-bottom:1px solid rgba(255,255,255,.72); background:transparent; color:#fff; font:600 27px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; outline:none; user-select:text !important; -webkit-user-select:text !important; cursor:text; }
				.splash.mobile .cattail-save-slots-page { padding:5vh 5vw 24px; }
				.splash.mobile .cattail-save-slots-brand { gap:4vw; }
				.splash.mobile .cattail-save-slots-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
				.splash.mobile .cattail-save-slots-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
				.splash.mobile .cattail-save-slots-subtitle { font-size:min(5vw,18px); }
				.splash.mobile .cattail-save-slots-transfer { font-size:min(4vw,15px); letter-spacing:1px; }
				.splash.mobile .cattail-save-slots-list { height:min(620px,calc(100vh - 300px)); padding-right:14px; }
				.splash.mobile .cattail-save-slots-row { grid-template-columns:1fr; gap:10px; min-height:0; padding:14px 6px; }
				.splash.mobile .cattail-save-slots-resources { justify-content:flex-start; }
				.splash.mobile .cattail-save-slots-actions { justify-content:flex-end; font-size:min(4vw,15px); letter-spacing:1px; }
				.splash.mobile .cattail-save-slots-back { font-size:min(5vw,20px); }
				@media (max-width:860px) { .cattail-save-slots-page { padding-left:5vw; padding-right:5vw; } .cattail-save-slots-logo { font-size:34px; letter-spacing:10px; } .cattail-save-slots-row { grid-template-columns:1fr; gap:10px; } .cattail-save-slots-resources { justify-content:flex-start; } }
				.cattail-save-slots-transfer { flex-wrap:wrap; white-space:normal; flex-shrink:0; letter-spacing:1px; }
				.cattail-save-slots-transfer-status { max-width:100%; overflow-wrap:anywhere; }
				.cattail-save-slots-operation-status { flex-basis:100%; text-align:center; font-size:14px; line-height:1.4; letter-spacing:0; overflow-wrap:anywhere; }
				.cattail-save-slots-list { min-height:0; flex-shrink:1; }
				.cattail-save-slots-row { grid-template-columns:minmax(180px,.85fr) minmax(240px,1.1fr) minmax(280px,1fr); column-gap:18px; row-gap:14px; }
				.cattail-save-slots-actions { flex-wrap:wrap; font-size:15px; letter-spacing:0; }
				.cattail-save-slots-confirm-action { min-width:0; gap:14px; }
				.cattail-save-slots-confirm-label { margin-right:10px; }
				.cattail-save-slots-resource-area { min-width:0; container:cattail-save-resources / inline-size; }
				.cattail-save-slots-timeline { position:relative; min-width:0; margin:18px 32px 0; height:68px; }
				.cattail-save-slots-timeline-track { position:absolute; top:10px; left:0; right:-14px; height:1px; background:#fff7; pointer-events:none; }
				.cattail-save-slots-timeline-track:after { content:''; position:absolute; right:0; top:-3px; width:6px; height:6px; border-top:1px solid #fffb; border-right:1px solid #fffb; transform:rotate(45deg); }
				.cattail-save-slots-timeline-node { --label-visibility:var(--label-2); position:absolute; left:calc(var(--position) * 100%); top:0; width:22px; height:22px; transform:translateX(-50%); appearance:none; border:0; padding:0; background:transparent; color:#fffb; cursor:pointer; }
				.cattail-save-slots-timeline-dot { position:absolute; top:7px; left:8px; width:7px; height:7px; border-radius:50%; background:currentColor; }
				.cattail-save-slots-timeline-label { position:absolute; top:25px; left:50%; transform:translateX(-50%); width:56px; visibility:var(--label-visibility); white-space:pre-line; font:11px/1.35 Montserrat,Arial,sans-serif; letter-spacing:0; text-align:center; pointer-events:none; }
				.cattail-save-slots-timeline-node.is-current { color:#fff; }
				.cattail-save-slots-timeline-node.is-current .cattail-save-slots-timeline-dot { outline:1px solid #fff7; outline-offset:3px; }
				.cattail-save-slots-timeline-node:hover, .cattail-save-slots-timeline-node:focus-visible { color:#db91ad; outline:1px solid currentColor; outline-offset:2px; border-radius:50%; }
				.cattail-save-slots-timeline-node:disabled { cursor:default; opacity:.4; }
				@container cattail-save-resources (min-width:240px) { .cattail-save-slots-timeline-node { --label-visibility:var(--label-3); } }
				@container cattail-save-resources (min-width:360px) { .cattail-save-slots-timeline-node { --label-visibility:var(--label-5); } }
				@container cattail-save-resources (min-width:480px) { .cattail-save-slots-timeline-node { --label-visibility:var(--label-7); } }
				@container cattail-save-resources (min-width:660px) { .cattail-save-slots-timeline-node { --label-visibility:var(--label-10); } }
				@container cattail-save-resources (min-width:1020px) { .cattail-save-slots-timeline-node { --label-visibility:var(--label-16); } }
				@media (max-width:860px) { .cattail-save-slots-row { grid-template-columns:1fr; } .cattail-save-slots-timeline { margin-left:28px; margin-right:28px; } .cattail-save-slots-name-input { grid-column:1; } .cattail-save-slots-transfer { font-size:14px; } }
			`
			document.head.append(style)
		}
	}
})
