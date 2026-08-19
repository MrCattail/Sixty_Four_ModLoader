ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const RUNTIME_KEY = Symbol.for('cattail.world-editor.runtime')
		const SELECTION_KEY = Symbol.for('cattail.world-editor.selection')
		const PAINT_STATE_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const STROKE_KEY = Symbol.for('cattail.world-editor.paint-cube-stroke')
		const FILL_KEY = Symbol.for('cattail.world-editor.paint-cube-fill')
		const SERVICE_VERSION = '0.6.0'
		const GUARD_SCHEMA = 1
		const MAX_CELLS = 4096
		const YIELD_EVERY = 256
		const NEIGHBORS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]])

		api.on('afterGameInit', function (payload, game) {
			const runtime = globalThis[RUNTIME_KEY]
			const selection = globalThis[SELECTION_KEY]
			const paintState = globalThis[PAINT_STATE_KEY]
			const stroke = globalThis[STROKE_KEY]
			const previous = globalThis[FILL_KEY]
			previous?.dispose?.('paint-cube-fill-replaced')
			if (
				!runtime ||
				runtime.game !== game ||
				typeof runtime.addCleanup !== 'function' ||
				!selection ||
				selection.game !== game ||
				typeof selection.snapshot !== 'function' ||
				!paintState ||
				typeof paintState.normalizePaint !== 'function' ||
				typeof paintState.normalizeRecipe !== 'function' ||
				typeof paintState.normalizeGrowDurationMs !== 'function' ||
				!stroke ||
				stroke.game !== game ||
				typeof stroke.inspectCell !== 'function'
			) {
				console.warn('[Cattail World Editor] Paint Bucket planner could not find its read-only services.')
				return
			}

			let disposed = false
			const service = Object.freeze({
				version: SERVICE_VERSION,
				game,
				maxCells: MAX_CELLS,
				plan(request) {
					if (disposed) return Promise.reject(fillError('NOT_READY', 'The Paint Bucket planner is unavailable.'))
					return planFill(request)
				},
				async validatePlan(guardValue, options) {
					if (disposed) throw fillError('NOT_READY', 'The Paint Bucket planner is unavailable.')
					const guard = normalizeGuard(guardValue)
					if (!guard) throw fillError('EXTERNAL_CHANGE', 'The Paint Bucket plan is no longer valid.')
					try {
						const plan = await planFill({
							cell: guard.seed,
							cubeMode: guard.cubeMode,
							growDurationMs: guard.growDurationMs,
							recipe: guard.recipe,
							isCancelled: options?.isCancelled
						})
						if (!sameGuard(plan.guard, guard)) {
							throw fillError('EXTERNAL_CHANGE', 'The Paint Bucket target region changed before it could be applied.')
						}
						return { ok: true, plan }
					} catch (error) {
						if (error?.code === 'CANCELLED' || error?.code === 'NOT_READY') throw error
						if (error?.code === 'EXTERNAL_CHANGE') throw error
						throw fillError('EXTERNAL_CHANGE', 'The Paint Bucket target region changed before it could be applied.')
					}
				},
				dispose() {
					if (disposed) return false
					disposed = true
					if (globalThis[FILL_KEY] === service) delete globalThis[FILL_KEY]
					return true
				}
			})

			Object.defineProperty(globalThis, FILL_KEY, {
				value: service,
				configurable: true,
				writable: true
			})
			runtime.addCleanup(function () {
				service.dispose('runtime-disposed')
			})
			console.info('[Cattail World Editor] Read-only professional Paint Bucket planner 5C-9 ready.')

			async function planFill(request) {
				const seed = requireCell(request?.cell)
				const plane = normalizePlane(game?.plane)
				if (plane !== 0) throw fillError('PLANE_CHANGED', 'Paint Bucket is available only on the Reality plane.')
				const cubeMode = normalizeCubeMode(request?.cubeMode)
				const recipe = paintState.normalizeRecipe(request?.recipe)
				if (!recipe) throw fillError('INVALID_SPEC', 'A valid Paint Bucket recipe is required.')
				const growDurationMs = cubeMode === 'grow'
					? paintState.normalizeGrowDurationMs(request?.growDurationMs)
					: null
				if (cubeMode === 'grow' && !growDurationMs) {
					throw fillError('INVALID_SPEC', 'A valid Paint Bucket Grow duration is required.')
				}
				const selectionState = readSelectionSnapshot()
				const selectionRevision = normalizeRevision(selectionState?.revision)
				const ranges = currentPlaneRanges(selectionState, plane)
				const masked = ranges.some(function (range) { return rangeContains(range, seed) })
				const isCancelled = typeof request?.isCancelled === 'function' ? request.isCancelled : function () { return false }
				const sourceInspection = inspect(seed)
				const source = sourceForInspection(sourceInspection)
				if (!source) {
					throw fillError(sourceInspection.before ? 'CELL_OCCUPIED' : 'NOT_READY', 'The clicked cell cannot seed a Paint Bucket region.')
				}

				const queue = [seed]
				const queued = new Set([cellKey(seed)])
				const componentCells = []
				const targets = []
				let cursor = 0
				await yieldPlanning(isCancelled)
				while (cursor < queue.length) {
					assertPlanningCurrent(isCancelled, selectionRevision, plane)
					const cell = queue[cursor++]
					const inspection = inspect(cell)
					if (!matchesSource(inspection, source)) continue
					componentCells.push(cell.slice())
					if (componentCells.length > MAX_CELLS) {
						throw fillError('OPEN_OR_TOO_LARGE', 'The Paint Bucket area is open or exceeds 4096 cells.')
					}
					if (!isTargetNoOp(inspection, cubeMode, recipe, growDurationMs)) {
						targets.push({ cell: cell.slice(), before: clonePlain(inspection.before) })
					}
					for (const offset of NEIGHBORS) {
						const neighbor = offsetCell(cell, offset)
						if (!neighbor) throw fillError('OPEN_OR_TOO_LARGE', 'The Paint Bucket area is open or exceeds 4096 cells.')
						if (masked && !ranges.some(function (range) { return rangeContains(range, neighbor) })) continue
						const key = cellKey(neighbor)
						if (queued.has(key)) continue
						queued.add(key)
						queue.push(neighbor)
					}
					if (componentCells.length % YIELD_EVERY === 0) await yieldPlanning(isCancelled)
				}
				assertPlanningCurrent(isCancelled, selectionRevision, plane)
				if (!targets.length) throw fillError('NOTHING_TO_CHANGE', 'The Paint Bucket region already matches the selected paint.')
				const guard = createGuard({
					seed,
					plane,
					selectionRevision,
					masked,
					cubeMode,
					growDurationMs,
					recipe,
					source,
					componentCells,
					targets
				})
				return {
					version: SERVICE_VERSION,
					seed: seed.slice(),
					plane,
					selectionRevision,
					masked,
					source: clonePlain(source),
					componentCells: componentCells.map(function (cell) { return cell.slice() }),
					targets: targets.map(function (target) { return { cell: target.cell.slice(), before: clonePlain(target.before) } }),
					componentCount: componentCells.length,
					targetCount: targets.length,
					guard
				}
			}

			function inspect(cell) {
				const inspection = stroke.inspectCell(cell, 'paint')
				if (!inspection?.known) throw fillError('NOT_READY', 'A Paint Bucket cell could not be inspected.')
				return {
					cell: requireCell(inspection.cell || cell),
					before: clonePlain(inspection.before),
					paint: paintState.normalizePaint(inspection.before)
				}
			}

			function sourceForInspection(inspection) {
				if (!inspection.before || isTransientSurge(inspection.before)) return { kind: 'empty' }
				if (!inspection.paint) return null
				return {
					kind: 'painted',
					mode: inspection.paint.version === paintState.growPaintVersion ? 'grow' : 'stable',
					recipe: clonePlain(inspection.paint.recipe)
				}
			}

			function matchesSource(inspection, source) {
				if (source.kind === 'empty') return !inspection.before || isTransientSurge(inspection.before)
				if (!inspection.paint) return false
				const mode = inspection.paint.version === paintState.growPaintVersion ? 'grow' : 'stable'
				return mode === source.mode && samePlain(inspection.paint.recipe, source.recipe)
			}

			function isTargetNoOp(inspection, cubeMode, recipe, growDurationMs) {
				if (!inspection.paint) return false
				const mode = inspection.paint.version === paintState.growPaintVersion ? 'grow' : 'stable'
				if (mode !== cubeMode || !samePlain(inspection.paint.recipe, recipe)) return false
				if (cubeMode !== 'grow') return true
				return inspection.paint.growth?.durationMs === growDurationMs
			}

			function isTransientSurge(value) {
				return String(value?.name || '').trim().toLowerCase() === 'surge'
			}

			function readSelectionSnapshot() {
				try {
					return selection.snapshot()
				} catch (error) {
					throw fillError('NOT_READY', 'The current selection could not be inspected.')
				}
			}

			function assertPlanningCurrent(isCancelled, selectionRevision, plane) {
				if (disposed || isCancelled()) throw fillError('CANCELLED', 'Paint Bucket planning was cancelled.')
				if (normalizePlane(game?.plane) !== plane) throw fillError('PLANE_CHANGED', 'The active plane changed during Paint Bucket planning.')
				if (normalizeRevision(readSelectionSnapshot()?.revision) !== selectionRevision) {
					throw fillError('EXTERNAL_CHANGE', 'The selection changed during Paint Bucket planning.')
				}
			}

			function createGuard(value) {
				return {
					schema: GUARD_SCHEMA,
					seed: value.seed.slice(),
					plane: value.plane,
					selectionRevision: value.selectionRevision,
					masked: value.masked,
					cubeMode: value.cubeMode,
					growDurationMs: value.growDurationMs,
					recipe: clonePlain(value.recipe),
					source: clonePlain(value.source),
					componentKeys: sortedCellKeys(value.componentCells),
					targetKeys: sortedCellKeys(value.targets.map(function (target) { return target.cell }))
				}
			}

			function normalizeGuard(value) {
				if (!value || value.schema !== GUARD_SCHEMA) return null
				const seed = normalizeCell(value.seed)
				const plane = normalizePlane(value.plane)
				const selectionRevision = normalizeRevision(value.selectionRevision)
				const cubeMode = normalizeCubeMode(value.cubeMode)
				const recipe = paintState.normalizeRecipe(value.recipe)
				const growDurationMs = cubeMode === 'grow'
					? paintState.normalizeGrowDurationMs(value.growDurationMs)
					: null
				if (!seed || plane !== 0 || !recipe || (cubeMode === 'grow' && !growDurationMs)) return null
				if (!Array.isArray(value.componentKeys) || !Array.isArray(value.targetKeys)) return null
				return {
					schema: GUARD_SCHEMA,
					seed,
					plane,
					selectionRevision,
					masked: value.masked === true,
					cubeMode,
					growDurationMs,
					recipe,
					source: clonePlain(value.source),
					componentKeys: value.componentKeys.map(String).slice().sort(),
					targetKeys: value.targetKeys.map(String).slice().sort()
				}
			}

			function sameGuard(left, right) {
				return samePlain(normalizeGuard(left), normalizeGuard(right))
			}

			function currentPlaneRanges(snapshot, plane) {
				if (!Array.isArray(snapshot?.selections)) return []
				return snapshot.selections.filter(function (entry) {
					return normalizePlane(entry?.plane) === plane && normalizeRange(entry?.range)
				}).map(function (entry) { return normalizeRange(entry.range) })
			}
		})

		function normalizeRange(value) {
			const start = normalizeCell(value?.start)
			const end = normalizeCell(value?.end)
			const minU = Number(value?.minU)
			const maxU = Number(value?.maxU)
			const minV = Number(value?.minV)
			const maxV = Number(value?.maxV)
			if (start && end) {
				return {
					minU: Math.min(start[0], end[0]),
					maxU: Math.max(start[0], end[0]),
					minV: Math.min(start[1], end[1]),
					maxV: Math.max(start[1], end[1])
				}
			}
			if (![minU, maxU, minV, maxV].every(Number.isSafeInteger)) return null
			return { minU, maxU, minV, maxV }
		}

		function rangeContains(range, cell) {
			return cell[0] >= range.minU && cell[0] <= range.maxU && cell[1] >= range.minV && cell[1] <= range.maxV
		}

		function offsetCell(cell, offset) {
			return normalizeCell([cell[0] + offset[0], cell[1] + offset[1]])
		}

		function normalizeCell(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function requireCell(value) {
			const cell = normalizeCell(value)
			if (!cell) throw fillError('INVALID_SPEC', 'A valid Paint Bucket cell is required.')
			return cell
		}

		function normalizePlane(value) {
			return value ? 1 : 0
		}

		function normalizeRevision(value) {
			const number = Number(value)
			return Number.isSafeInteger(number) && number >= 0 ? number : 0
		}

		function normalizeCubeMode(value) {
			return value === 'grow' ? 'grow' : 'stable'
		}

		function sortedCellKeys(cells) {
			return cells.map(cellKey).sort()
		}

		function cellKey(cell) {
			return cell[0] + ':' + cell[1]
		}

		async function yieldPlanning(isCancelled) {
			if (isCancelled()) throw fillError('CANCELLED', 'Paint Bucket planning was cancelled.')
			await yieldFrame()
			if (isCancelled()) throw fillError('CANCELLED', 'Paint Bucket planning was cancelled.')
		}

		function yieldFrame() {
			if (typeof setTimeout === 'function') {
				return new Promise(function (resolve) { setTimeout(resolve, 0) })
			}
			if (typeof requestAnimationFrame === 'function') {
				return new Promise(function (resolve) { requestAnimationFrame(function () { resolve() }) })
			}
			return Promise.resolve()
		}

		function fillError(code, message) {
			const error = new Error(message)
			error.code = code
			return error
		}

		function clonePlain(value) {
			if (value === undefined) return undefined
			try {
				return JSON.parse(JSON.stringify(value))
			} catch (error) {
				return null
			}
		}

		function samePlain(left, right) {
			try {
				return stablePlainString(left) === stablePlainString(right)
			} catch (error) {
				return false
			}
		}

		function stablePlainString(value) {
			if (value === null || typeof value !== 'object') return JSON.stringify(value)
			if (Array.isArray(value)) {
				return '[' + value.map(stablePlainString).join(',') + ']'
			}
			return '{' + Object.keys(value).sort().map(function (key) {
				return JSON.stringify(key) + ':' + stablePlainString(value[key])
			}).join(',') + '}'
		}
	}
})
