ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const key = name => Symbol.for('cattail.world-editor.' + name)
		const get = (game, name) => {
			const value = globalThis[key(name)]
			return value?.game === game ? value : null
		}
		const KIND = 'native-relocation'
		let installed = false
		api.on('beforeSaveLoad', function (save, game) {
			get(game, 'native-tools')?.dispose()
			return save
		})
		api.on('afterGameInit', function (_, game) {
			globalThis[key('native-tools')]?.dispose?.()
			if (!Array.isArray(game?.saveSlots) || game.isMobile) return
			const transactions = get(game, 'transactions')
			const deletion = get(game, 'selection-delete')
			const placement = get(game, 'blueprint-placement')
			if (!transactions || !deletion?.executeNative || !placement) return
			const service = createService(game, transactions, deletion, placement)
			globalThis[key('native-tools')] = service
			service.attach()
			get(game, 'runtime')?.addCleanup?.(() => service.dispose())
			game.store?.visibilityUpdate?.()
		})
		api.on('afterVanillaScripts', function () {
			if (installed || typeof Game === 'undefined') return
			installed = true
			for (const [method, operation] of [['canEraseEntity', 'erase'], ['canRelocate', 'relocate']]) {
				api.patch(Game.prototype, method, original => function (entity) {
					if (!original.apply(this, arguments)) return false
					const service = get(this, 'native-tools')
					return !service?.active() || service.safe(entity, operation)
				})
			}
			api.patch(Game.prototype, 'processMove', original => function () {
				const result = original.apply(this, arguments)
				const service = get(this, 'native-tools')
				if (service?.active() && !get(this, 'creative-economy')?.isInputBlocked()) service.preview()
				return result
			})
			api.patch(Game.prototype, 'updateEraseArea', original => function () {
				const result = original.apply(this, arguments)
				const service = get(this, 'native-tools')
				if (service?.active()) {
					this.totalRefund = new Array(this.resources.length).fill(0)
					if (this.eraseHint?.element) this.eraseHint.element.textContent = service.text('nativeEraseHint')
				}
				return result
			})
		})
		function createService(game, transactions, deletion, placement) {
			const mode = get(game, 'creative-mode')
			const saveAdapter = globalThis[key('save-adapter')]
			const bound = saveAdapter.capture(game)
			const identities = new WeakMap()
			const restorationAliases = new Map()
			const requests = new Map()
			const operations = new Map()
			let sequence = 0
			let disposed = false
			let held = null
			let lastOperation = Promise.resolve(null)
			let stopMode
			let stopTransactions
			const active = () => !disposed && mode.snapshot().ready && mode.snapshot().creativeMode && saveAdapter.isCurrent(game, bound)
			const text = name => globalThis[key('i18n')]?.t(game, name) || name
			const failure = (code, message) => Object.assign(new Error(message || text('nativeToolProtected')), { code })
			const assertCurrent = context => {
				if (!context.isCurrent() || !saveAdapter.isCurrent(game, bound)) throw failure('SAVE_CONTEXT_CHANGED')
			}
			const allowedPlane = () => Number(game.plane || 0) === 0 && !game.entitiesInGame?.pinhole
			function identity(entity) {
				if (!entity) return null
				if (!identities.has(entity)) identities.set(entity, 'native-' + (++sequence))
				return identities.get(entity)
			}
			function safe(entity, operation) {
				return allowedPlane() && placement.assessEntity(entity, { blueprintMode: 'full', operation }).safe
			}
			function cells(entity, position) {
				const span = Number(entity.entitySpan || 0)
				if (!validPosition(position) || !Number.isSafeInteger(span) || span < 0 || span > 64) throw failure('INVALID_TARGET')
				if (![position[0] - span, position[0] + span, position[1] - span, position[1] + span].every(Number.isSafeInteger)) throw failure('INVALID_TARGET')
				const result = []
				for (let u = position[0] - span; u <= position[0] + span; u++) {
					for (let v = position[1] - span; v <= position[1] + span; v++) result.push([u, v])
				}
				return result
			}
			function currentEntities() {
				return new Map((game.stuff || []).map(entity => [identity(entity), entity]))
			}
			function requireCreative() {
				if (!active()) throw failure('ECONOMY_MODE_CHANGED', text('nativeToolCreativeOnly'))
				if (!allowedPlane()) throw failure('PROTECTED_TARGET')
			}
			function report(result) {
				if (!disposed && saveAdapter.isCurrent(game, bound)) get(game, 'creative-economy')?.reportToolResult(result)
				return result
			}
			function reject(error) {
				return report({ executed: false, error: { code: error.code || 'INVALID_TARGET', message: error.message } })
			}
			function run(action) {
				try {
					requireCreative()
					if (get(game, 'creative-economy')?.isInputBlocked()) throw failure('BUSY', text('nativeToolBusy'))
					// The transaction acquires its own lease synchronously. Do not set
					// an economy busy flag here: that would reject our own transaction.
					lastOperation = Promise.resolve(action()).then(report, reject)
				} catch (error) { lastOperation = Promise.resolve(reject(error)) }
				return lastOperation
			}
			function cancel() {
				held = null
				if (['erase', 'relocate'].includes(game.interactionMode)) {
					delete game.interactionMode
					game.cleanupErase?.()
					game.cleanupRelocation?.()
					delete game.transportedEntity
					game.canPlace = false
				}
			}
			function start(operation, options) {
				try {
					requireCreative()
					if (get(game, 'creative-economy')?.isInputBlocked()) throw failure('BUSY', text('nativeToolBusy'))
					if (game.interactionMode === operation) { cancel(); return true }
					cancel()
					delete game.itemInHand
					delete game.transportedEntity
					game.interactionMode = operation
					game.store?.closeTypes?.()
					if (operation === 'relocate' && options?.pickHovered !== false && game.hoveredEntity) {
						if (!game.canRelocate(game.hoveredEntity)) throw failure('PROTECTED_TARGET')
						game.relocationCandidatesList = [game.hoveredEntity]
						game.pickupEntitiesForRelocation()
					}
					game.store?.visibilityUpdate?.()
					return true
				} catch (error) { cancel(); reject(error); return false }
			}
			function checkHeld(list) {
				if (!held || list.length !== held.length || list.some((e, i) => e !== held[i].entity || !samePosition(e.position, held[i].position))) {
					throw failure('TARGET_CHANGED', text('nativeToolChanged'))
				}
			}
			function buildMoves(list, positions) {
				requireCreative()
				if (!Array.isArray(list) || !list.length || list.length !== positions?.length || new Set(list).size !== list.length) throw failure('INVALID_TARGET')
				const live = new Set(game.stuff)
				const selected = new Set(list)
				const moves = list.map((e, i) => {
					if (!live.has(e) || !game.canRelocate(e) || !validPosition(positions[i])) throw failure('PROTECTED_TARGET')
					return { id: identity(e), name: e.name, span: Number(e.entitySpan || 0), from: e.position.slice(), to: positions[i].slice() }
				})
				const swapped = new Set()
				for (let i = 0; i < list.length; i++) {
					for (const cell of cells(list[i], positions[i])) {
						const occupant = game.entityAtCoordinates(cell)
						if (!occupant || selected.has(occupant)) continue
						if (moves[i].span || occupant.entitySpan || !game.canRelocate(occupant) || swapped.has(occupant)) throw failure('UNSAFE_SWAP', text('nativeToolSwap'))
						swapped.add(occupant)
						moves.push({ id: identity(occupant), name: occupant.name, span: 0, from: occupant.position.slice(), to: moves[i].from.slice() })
					}
				}
				validateMoves(moves, false)
				return moves
			}
			function validateMoves(moves, reverse) {
				requireCreative()
				const live = currentEntities()
				const moving = new Set(moves.map(m => m.id))
				const targets = new Set()
				for (const move of moves) {
					const entity = live.get(move.id)
					const source = reverse ? move.to : move.from
					const target = reverse ? move.from : move.to
					if (!entity || entity.name !== move.name || Number(entity.entitySpan || 0) !== move.span || !samePosition(entity.position, source)) throw failure('TARGET_CHANGED', text('nativeToolChanged'))
					if (!game.canRelocate(entity) || !safe(entity, 'relocate')) throw failure('PROTECTED_TARGET')
					for (const position of [source, target]) {
						for (const cell of cells(entity, position)) {
							if (game.isWithinMemoryComplex?.(cell)) throw failure('PROTECTED_TARGET')
							const occupant = game.entityAtCoordinates(cell)
							if (occupant && !moving.has(identity(occupant))) throw failure('TARGET_CHANGED', text('nativeToolChanged'))
							if (position === target) {
								const k = cell.join(':')
								if (targets.has(k)) throw failure('TARGET_OVERLAP', text('nativeToolChanged'))
								targets.add(k)
							}
						}
					}
				}
			}
			function scope(moves) {
				const result = new Map()
				for (const m of moves) for (const p of [m.from, m.to]) for (const c of cells({ entitySpan: m.span }, p)) result.set(c.join(':'), c)
				return Array.from(result.values()).sort((a, b) => a[0] - b[0] || a[1] - b[1])
			}
			function capture(record) {
				const live = currentEntities()
				return {
					entities: record.payload.moves.map(m => {
						const e = live.get(m.id)
						return { id: m.id, name: e?.name || null, position: e?.position?.slice() || null, span: e?.entitySpan || 0 }
					}),
					cells: record.scope.cells.map(p => ({ position: p, id: identity(game.entityAtCoordinates(p)) }))
				}
			}
			function writePositions(context, entries) {
				assertCurrent(context)
				const entities = new Set(entries.map(e => e.entity))
				const neighbours = new Set()
				for (const { entity } of entries) {
					for (const n of entity.getNeighbours?.() || []) if (n && !entities.has(n)) neighbours.add(n)
				}
				// Rebuild complete footprints as a group so swaps cannot overwrite
				// one another and wide entities leave no stale cells on rollback.
				for (const [k, entity] of Object.entries(game.stuffMap)) if (entities.has(entity)) delete game.stuffMap[k]
				for (const entry of entries) { assertCurrent(context); entry.entity.position = entry.position.slice() }
				for (const { entity } of entries) {
					assertCurrent(context)
					for (const cell of cells(entity, entity.position)) {
						const k = 'u' + cell[0] + 'v' + cell[1]
						if (game.stuffMap[k] && game.stuffMap[k] !== entity) throw failure('TARGET_CHANGED')
						game.stuffMap[k] = entity
					}
				}
				for (const { entity } of entries) {
					assertCurrent(context)
					entity.setPosition(entity.position.slice())
					for (const n of entity.getNeighbours?.() || []) if (n && !entities.has(n)) neighbours.add(n)
				}
				for (const n of neighbours) { assertCurrent(context); n.init?.() }
				game.stuff.sort((a, b) => a.position[0] + a.position[1] - b.position[0] - b.position[1])
				game.store?.compositionUpdate?.()
			}
			const adapter = {
				version: '1.0.0',
				prepare(context, request) {
					assertCurrent(context)
					const moves = requests.get(request.token)
					if (!moves) throw failure('TARGET_CHANGED')
					validateMoves(moves, false)
					return { summary: { label: text('nativeRelocation'), moveCount: moves.length }, scope: { cells: scope(moves) }, payload: { moves } }
				},
				preflight(context, record, direction) {
					try {
						assertCurrent(context)
						validateMoves(record.payload.moves, direction === 'undo')
						return { ok: true }
					} catch (error) { return { ok: false, code: error.code, message: error.message } }
				},
				capture(context, record) { assertCurrent(context); return capture(record) },
				apply(context, record, direction) {
					assertCurrent(context)
					validateMoves(record.payload.moves, direction === 'undo')
					const live = currentEntities()
					const before = record.payload.moves.map(m => ({ entity: live.get(m.id), position: live.get(m.id).position.slice() }))
					operations.set(context.operationId, before)
					writePositions(context, record.payload.moves.map(m => ({ entity: live.get(m.id), position: direction === 'undo' ? m.from : m.to })))
					return { ok: true }
				},
				verify(context, record, direction) {
					assertCurrent(context)
					validateMoves(record.payload.moves, direction !== 'undo')
					operations.delete(context.operationId)
					try { game.playSound?.('place') } catch (_) {}
					return { ok: true }
				},
				restore(context) {
					assertCurrent(context)
					const before = operations.get(context.operationId)
					if (!before) throw failure('ROLLBACK_FAILED')
					// Never replace a new occupant or resurrect an externally removed
					// entity while recovering a failed operation.
					const owned = new Set(before.map(e => e.entity))
					for (const entry of before) {
						if (!game.stuff.includes(entry.entity)) throw failure('ROLLBACK_FAILED')
						for (const p of cells(entry.entity, entry.position)) {
							if (game.isWithinMemoryComplex?.(p)) throw failure('ROLLBACK_FAILED')
							const occupant = game.entityAtCoordinates(p)
							if (occupant && !owned.has(occupant)) throw failure('ROLLBACK_FAILED')
						}
					}
					writePositions(context, before)
					operations.delete(context.operationId)
					return { ok: true }
				}
			}
			const unregister = transactions.registerAdapter(KIND, adapter)
			function preview() {
				if (game.interactionMode !== 'relocate' || !game.relocationList) return
				try {
					checkHeld(game.relocationList)
					buildMoves(game.relocationList, game.relocationOffsets.map(p => [p[0] + game.hoveredCell[0], p[1] + game.hoveredCell[1]]))
					game.canPlace = true
				} catch (_) { game.canPlace = false }
			}
			const service = {
				game, active, text, safe, preview, start,
				// Called only by the editor's existing restoration adapters. A
				// same-type replacement from normal gameplay receives a new identity.
				rememberRestoration(owner, token, entity) {
					if (!disposed && entity) restorationAliases.set(owner + ':' + token, identity(entity))
				},
				restoreIdentity(owner, token, entity) {
					const id = restorationAliases.get(owner + ':' + token)
					if (!disposed && id && entity) identities.set(entity, id)
				},
				whenIdle: () => lastOperation,
				release(original, args) {
					if (game.mouse?.state !== 2 && game.mouse?.state !== 3 && game.interactionMode === 'relocate' && game.relocationList && !game.canPlace) {
						const list = game.relocationList.slice()
						const positions = (game.relocationOffsets || []).map(p => [p[0] + game.hoveredCell[0], p[1] + game.hoveredCell[1]])
						const result = service.handle('massRelocate', [list, positions])
						cancel()
						return result
					}
					return original.apply(game, args)
				},
				handle(name, args, original) {
					if (name === 'pickupEraser') return start('erase')
					if (name === 'pickupEntitiesForRelocation') {
						game.relocationCandidatesList = Array.from(new Set(game.relocationCandidatesList || [])).filter(e => game.canRelocate(e))
						if (!game.relocationCandidatesList.length) { cancel(); reject(failure('PROTECTED_TARGET')); return }
						const result = original.apply(game, args)
						held = game.relocationList.map(entity => ({ entity, position: entity.position.slice() }))
						preview()
						return result
					}
					if (name === 'finalizeErase') {
						const targets = Array.from(new Set(game.eraseList || []))
						cancel()
						return run(() => deletion.executeNative(targets, 'mouse'))
					}
					if (name === 'massRelocate') return run(() => {
						if (held) checkHeld(args[0])
						const moves = buildMoves(args[0], args[1])
						if (moves.every(m => samePosition(m.from, m.to))) throw failure('NOTHING_TO_MOVE', text('nativeToolNoMove'))
						cancel()
						const token = 'request-' + (++sequence)
						requests.set(token, moves)
						return transactions.execute({ kind: KIND, input: 'mouse', payload: { token } }).finally(() => requests.delete(token))
					})
				},
				attach() {
					let wasActive = active()
					stopMode = mode.subscribe(() => {
						const now = active()
						if (wasActive && !now) {
							cancel()
							for (const [name, unlocked] of [['eraser', game.unlockedEntities?.pump], ['relocator', game.entitiesInGame?.mega3]]) {
								game.store?.html?.[name]?.classList.toggle('hidden', !unlocked || !!game.plane)
							}
						}
						wasActive = now
					})
					stopTransactions = transactions.subscribe(state => {
						if (state.busy) cancel()
					})
				},
				dispose() {
					if (disposed) return
					cancel(); disposed = true
					stopMode?.(); stopTransactions?.(); unregister()
					requests.clear(); operations.clear(); restorationAliases.clear()
					if (globalThis[key('native-tools')] === service) delete globalThis[key('native-tools')]
				}
			}
			return service
		}
		function validPosition(p) { return Array.isArray(p) && p.length === 2 && p.every(Number.isSafeInteger) }
		function samePosition(a, b) { return validPosition(a) && validPosition(b) && a[0] === b[0] && a[1] === b[1] }
	}
})
