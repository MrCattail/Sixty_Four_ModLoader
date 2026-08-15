ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const GROWTH_KEY = Symbol.for('cattail.world-editor.paint-cube-growth')
		const SERVICE_VERSION = '0.6.0'
		const STATUS_EVENT = 'cattail:world-editor-paint-status'
		const SAVE_FAILURE_CODE = 'PAINT_GROW_SAVE_FAILED'
		const previous = globalThis[GROWTH_KEY]
		previous?.dispose?.('paint-cube-growth-replaced')

		let disposed = false
		let installed = false
		let game = null
		let unpatchUpdate = null
		const validated = new WeakMap()
		const pendingRefresh = new WeakSet()

		const service = Object.freeze({
			version: SERVICE_VERSION,
			get game() { return game },
			get ready() { return installed && !disposed },
			isReady() { return installed && !disposed },
			dispose() {
				if (disposed) return false
				disposed = true
				installed = false
				if (typeof unpatchUpdate === 'function') unpatchUpdate()
				unpatchUpdate = null
				game = null
				if (globalThis[GROWTH_KEY] === service) delete globalThis[GROWTH_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, GROWTH_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		api.on('afterVanillaScripts', function () {
			if (disposed) return
			const paintState = globalThis[PAINT_STATE_KEY]
			if (
				typeof Cube === 'undefined' ||
				!Cube.prototype ||
				typeof Cube.prototype.update !== 'function' ||
				!paintState ||
				typeof paintState.normalizePaint !== 'function' ||
				typeof paintState.capturePaintedCubeSave !== 'function'
			) {
				console.warn('[Cattail World Editor] Grow is unavailable because its strict Cube services were not found.')
				return
			}
			unpatchUpdate = api.patch(Cube.prototype, 'update', function (original) {
				return function (dt) {
					if (disposed) return original.apply(this, arguments)
					const paint = strictPaint(this, paintState)
					if (!paint || paint.version !== paintState.growPaintVersion) return original.apply(this, arguments)
					if (this.master?.preventNoise === true) return undefined
					if (this.state === 0) return updateGrowingCube(this, dt, paint, paintState, original, arguments)
					if (this.state === 1) return updateRevealingCube(this, dt, paint, paintState, original, arguments)
					if (this.state === 2) {
						setProgress(this, paint, 'stable', paint.growth.durationMs, paintState)
						return original.apply(this, arguments)
					}
					return original.apply(this, arguments)
				}
			})
			installed = typeof unpatchUpdate === 'function'
			if (installed) console.info('[Cattail World Editor] Strict no-pump painted Cube growth 5C-6 ready.')
		})

		api.on('afterGameInit', function (payload, nextGame) {
			game = nextGame || payload?.game || null
		})

		api.on('beforeSaveWrite', function (save, hookGame) {
			if (disposed || !installed || !save || !Array.isArray(save.stuff)) return save
			const targetGame = hookGame || game
			const paintState = globalThis[PAINT_STATE_KEY]
			if (!targetGame || !Array.isArray(targetGame.stuff) || !paintState) return save
			const occupied = new Set(save.stuff.map(function (entry) { return cellKey(entry?.position) }).filter(Boolean))
			const additions = []
			for (const entity of targetGame.stuff) {
				if (String(entity?.name || '').toLowerCase() !== 'cube' || (entity.state !== 0 && entity.state !== 1)) continue
				let paint
				try { paint = strictPaint(entity, paintState) } catch (markerError) { continue }
				if (!paint || paint.version !== paintState.growPaintVersion) continue
				const key = cellKey(entity.position)
				if (occupied.has(key)) continue
				let saved
				try {
					if (!key) throw saveFailure('invalid-cell', entity.position)
					saved = paintState.capturePaintedCubeSave(entity, entity.position)
					if (!saved) throw saveFailure('capture-returned-null', entity.position)
				} catch (captureError) {
					return abortSave(save, key || printableCell(entity.position), captureError)
				}
				occupied.add(key)
				additions.push(saved)
			}
			if (!additions.length) return save
			additions.sort(function (left, right) {
				return left.position[0] - right.position[0] || left.position[1] - right.position[1]
			})
			return Object.assign({}, save, { stuff: save.stuff.concat(additions) })
		})

		function abortSave(save, cell, cause) {
			const error = saveFailure('capture-failed', cell, cause)
			publishSaveFailure(error)
			const aborted = Object.assign({}, save)
			Object.defineProperty(aborted, 'toJSON', {
				configurable: true,
				enumerable: false,
				value() { throw error }
			})
			return aborted
		}

		function saveFailure(reason, cell, cause) {
			const error = new Error('Grow painted Cube save capture failed at ' + printableCell(cell) + ' (' + String(reason || 'unknown') + ').')
			error.name = 'WorldEditorPaintGrowSaveError'
			error.code = SAVE_FAILURE_CODE
			error.cell = printableCell(cell)
			if (cause) error.cause = cause
			return error
		}

		function publishSaveFailure(error) {
			const detail = {
				key: 'paintGrowSaveFailed',
				kind: 'terminal',
				duration: 0,
				persistent: true,
				values: { cell: String(error?.cell || '?'), code: SAVE_FAILURE_CODE }
			}
			try {
				if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
					globalThis.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail }))
				}
			} catch (statusError) {}
			const log = typeof console.error === 'function' ? console.error : console.warn
			log.call(console, '[Cattail World Editor] ' + SAVE_FAILURE_CODE, { code: SAVE_FAILURE_CODE, cell: detail.values.cell })
		}

		function strictPaint(entity, paintState) {
			const field = paintState.field
			const candidate = entity?.[field]
			const cached = validated.get(entity)
			if (cached && cached.marker === candidate) {
				if (cached.mode === 'stable') return candidate
				if (cached.mode === 'grow' && quickGrowInvariant(candidate, cached)) return candidate
			}
			const normalized = paintState.normalizePaint(entity)
			if (!normalized) {
				validated.delete(entity)
				return null
			}
			if (normalized.version !== paintState.growPaintVersion) {
				freezeStablePaint(normalized)
				entity[field] = normalized
				validated.set(entity, { mode: 'stable', marker: normalized })
				return normalized
			}
			sealGrowPaint(normalized)
			entity[field] = normalized
			validated.set(entity, {
				mode: 'grow',
				marker: normalized,
				growth: normalized.growth,
				generated: normalized.generated,
				recipeObject: normalized.recipe,
				durationMs: normalized.growth.durationMs,
				revealMs: paintState.growRevealMs,
				lineage: normalized.growth.lineage,
				seed: normalized.generated.seed,
				recipe: JSON.stringify(normalized.recipe)
			})
			return normalized
		}

		function freezeStablePaint(paint) {
			for (const entry of paint.recipe.weights) Object.freeze(entry)
			Object.freeze(paint.recipe.weights)
			Object.freeze(paint.recipe)
			Object.freeze(paint.generated)
			Object.freeze(paint)
		}

		function sealGrowPaint(paint) {
			for (const entry of paint.recipe.weights) Object.seal(entry)
			Object.seal(paint.recipe.weights)
			Object.seal(paint.recipe)
			Object.seal(paint.generated)
			Object.seal(paint.growth)
			Object.seal(paint)
		}

		function quickGrowInvariant(paint, cached) {
			if (!paint || !cached) return false
			const phase = paint?.growth?.phase
			const elapsedMs = paint?.growth?.elapsedMs
			const fillDurationMs = cached.durationMs - cached.revealMs
			const validProgress = Number.isInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= cached.durationMs && (
				(phase === 'growing' && elapsedMs <= fillDurationMs) ||
				(phase === 'revealing' && elapsedMs >= fillDurationMs) ||
				(phase === 'stable' && elapsedMs === cached.durationMs)
			)
			return !!paint &&
				paint.version === 3 &&
				paint.kind === 'world-editor-painted-cube' &&
				paint.reward === 'none' &&
				paint.mode === 'grow' &&
				paint.growth === cached.growth &&
				paint.generated === cached.generated &&
				paint.recipe === cached.recipeObject &&
				paint.growth?.version === 1 &&
				validProgress &&
				paint.growth.durationMs === cached.durationMs &&
				paint.growth.lineage === cached.lineage &&
				paint.generated?.algorithm === 'largest-remainder-shuffle-v2' &&
				paint.generated?.slots === 64 &&
				paint.generated?.seed === cached.seed &&
				JSON.stringify(paint.recipe) === cached.recipe
		}

		function updateGrowingCube(entity, dtValue, paint, paintState, original, args) {
			const durationMs = paint.growth.durationMs
			const fillDurationMs = Math.max(0, durationMs - paintState.growRevealMs)
			const dt = finiteDelta(dtValue)
			const startElapsedMs = paint.growth.elapsedMs
			const elapsedMs = Math.min(fillDurationMs, startElapsedMs + dt)
			entity.pump = false
			entity.unveilProgress = 0
			entity.fill = fillDurationMs ? paintState.slots * elapsedMs / fillDurationMs : paintState.slots
			if (elapsedMs >= fillDurationMs) {
				entity.fill = paintState.slots
				entity.state = 1
				setProgress(entity, paint, 'revealing', fillDurationMs, paintState)
				const revealDt = Math.max(0, startElapsedMs + dt - fillDurationMs)
				if (revealDt > 0) {
					const revealArgs = Array.prototype.slice.call(args)
					revealArgs[0] = revealDt
					return updateRevealingCube(entity, revealDt, paint, paintState, original, revealArgs)
				}
				return
			}
			setProgress(entity, paint, 'growing', elapsedMs, paintState)
		}

		function updateRevealingCube(entity, dtValue, paint, paintState, original, args) {
			const beforeState = entity.state
			const master = entity.master
			const previousSoi = entity.soi
			const previousRefresh = master?.processMousemove2
			entity.pump = false
			entity.fill = paintState.slots
			entity.soi = []
			if (typeof previousRefresh === 'function') master.processMousemove2 = function () {}
			let result
			try {
				result = original.apply(entity, args)
			} finally {
				entity.soi = previousSoi
				if (typeof previousRefresh === 'function' && master?.processMousemove2 !== previousRefresh) {
					master.processMousemove2 = previousRefresh
				}
			}
			if (entity.state === 2) {
				entity.unveilProgress = 1
				setProgress(entity, paint, 'stable', paint.growth.durationMs, paintState)
				if (beforeState !== 2) requestWorldRefresh(master, previousRefresh)
				return result
			}
			const fillDurationMs = Math.max(0, paint.growth.durationMs - paintState.growRevealMs)
			const reveal = Math.min(1, Math.max(0, Number(entity.unveilProgress) || 0))
			setProgress(entity, paint, 'revealing', Math.round(fillDurationMs + reveal * paintState.growRevealMs), paintState)
			return result
		}

		function setProgress(entity, paint, phase, elapsedMs, paintState) {
			paint.growth.phase = phase
			paint.growth.elapsedMs = Math.min(paint.growth.durationMs, Math.max(0, Math.round(elapsedMs)))
			entity[paintState.field] = paint
			return true
		}

		function requestWorldRefresh(targetGame, refresh) {
			if (!targetGame || typeof refresh !== 'function' || pendingRefresh.has(targetGame)) return
			pendingRefresh.add(targetGame)
			const run = function () {
				pendingRefresh.delete(targetGame)
				if (!disposed && targetGame.processMousemove2 === refresh) refresh.call(targetGame)
			}
			if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
			else Promise.resolve().then(run)
		}

		function finiteDelta(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? Math.min(1000, number) : 0
		}

		function cellKey(value) {
			if (!Array.isArray(value) || value.length < 2) return ''
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? u + ':' + v : ''
		}

		function printableCell(value) {
			if (typeof value === 'string' && value) return value
			if (!Array.isArray(value) || value.length < 2) return '?'
			return String(value[0]) + ':' + String(value[1])
		}
	}
})
