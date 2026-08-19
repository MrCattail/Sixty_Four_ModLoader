ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const PLAN_KEY = Symbol.for('cattail.world-editor.blueprint-preview-plan')
		const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
		const PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
		const DEFAULT_CHUNK_SIZE = 512
		const STATUS = Object.freeze({
			BUILDABLE: 'buildable',
			SATISFIED: 'satisfied',
			CONFLICT: 'conflict',
			BLOCKED: 'blocked'
		})
		const STATUS_PRIORITY = Object.freeze({
			buildable: 0,
			satisfied: 1,
			conflict: 2,
			blocked: 3
		})

		const previous = globalThis[PLAN_KEY]
		if (previous && typeof previous.dispose === 'function') previous.dispose('preview-plan-replaced')

		let disposed = false
		const planner = Object.freeze({
			version: '0.5.1',
			status: STATUS,
			statusPriority: STATUS_PRIORITY,
			async build(game, blueprint, target, options) {
				if (disposed) throw planError('planner-disposed')
				return buildPlan(game, blueprint, target, options || {})
			},
			verify(game, guard) {
				return verifyGuard(game, guard)
			},
			inspect(game, guard) {
				return inspectGuard(game, guard)
			},
			refreshResources(game, plan) {
				if (disposed) throw planError('planner-disposed')
				return refreshPlanResources(game, plan)
			},
			async benchmark(options) {
				if (disposed) throw planError('planner-disposed')
				return runSyntheticBenchmark(options || {})
			},
			dispose() {
				if (disposed) return false
				disposed = true
				if (globalThis[PLAN_KEY] === planner) delete globalThis[PLAN_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, PLAN_KEY, {
			value: planner,
			configurable: true,
			writable: true
		})

		async function buildPlan(game, blueprint, target, options) {
			const stateService = globalThis[STATE_KEY]
			if (blueprint?.mode === 'full' && typeof stateService?.normalizeBlueprint === 'function') {
				blueprint = stateService.normalizeBlueprint(blueprint)
			}
			validateRoot(game, blueprint, target)
			const chunkSize = positiveInteger(options.chunkSize, DEFAULT_CHUNK_SIZE)
			const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : function () { return false }
			const normalizedTarget = normalizePosition(target)
			const records = []
			const emptyCells = []
			const emptyEntities = new Set()
			const guardCells = new Map()
			const relevantNames = new Set()
			let processedCells = 0

			const includeBlocks = blueprint.mode === 'full' && options.includeBlocks === true
			const includeSurges = blueprint.mode === 'full' && options.includeSurges === true
			const sourceRecords = blueprint.entities.concat(
				(includeBlocks ? blueprint.blocks || [] : []).map(function (block) {
					return Object.assign({}, block, {
						kind: 'cube',
						footprint: {
							span: 0,
							min: block.position,
							max: block.position
						},
						restricted: { onlyOne: false },
						config: {}
					})
				}),
				(includeBlocks ? blueprint.paintedCubes || [] : []).map(function (painted) {
					return Object.assign({}, painted, {
						kind: 'painted-cube',
						footprint: {
							span: 0,
							min: painted.position,
							max: painted.position
						},
						restricted: { onlyOne: false },
						config: {}
					})
				}),
				(includeSurges ? blueprint.surges || [] : []).map(function (surge) {
					return Object.assign({}, surge, {
						kind: 'surge',
						name: 'surge',
						footprint: {
							span: 0,
							min: surge.position,
							max: surge.position
						},
						restricted: { onlyOne: false },
						config: {}
					})
				})
			)
			const waypointOrders = currentWaypointOrders(game, blueprint, normalizedTarget)
			for (let index = 0; index < sourceRecords.length; index += 1) {
				if (isCancelled()) throw planError('plan-cancelled')
				const source = sourceRecords[index]
				const relativePosition = normalizePosition(source?.position)
				if (
					!source ||
					(source.kind !== 'entity' && source.kind !== 'cube' && source.kind !== 'painted-cube' && source.kind !== 'surge') ||
					!safeName(source.name) ||
					!relativePosition
				) {
					throw planError('invalid-blueprint-entity')
				}
				const name = safeName(source.name)
				const position = addPosition(normalizedTarget, relativePosition)
				const footprint = targetFootprint(source, normalizedTarget, position)
				const conflicts = new Set()
				for (let v = footprint.minV; v <= footprint.maxV; v += 1) {
					for (let u = footprint.minU; u <= footprint.maxU; u += 1) {
						if (isCancelled()) throw planError('plan-cancelled')
						const cell = [u, v]
						const includeDynamicEntity = source.kind === 'surge'
						const entity = includeDynamicEntity
							? safeEntityAt(game, cell)
							: planningEntityAt(game, cell, options)
						guardCells.set(cellKey(cell), { position: cell, entity, includeDynamicEntity })
						if (entity) conflicts.add(entity)
						processedCells += 1
						if (processedCells % chunkSize === 0) await yieldControl()
					}
				}
				relevantNames.add(name)
				const classification = classifyRecord(
					game,
					source,
					name,
					position,
					footprint,
					Array.from(conflicts),
					Object.assign({}, options, {
						blueprintMode: blueprint.mode,
						waypointOrder: waypointOrders.get(source)
					})
				)
				if (classification.status === STATUS.CONFLICT) {
					for (const entity of conflicts) {
						const conflictName = safeName(entity?.name)
						if (conflictName) relevantNames.add(conflictName)
					}
				}
				records.push({
					id: Number.isInteger(source.id) ? source.id : index + 1,
					index,
					name,
					relativePosition,
					position,
					footprint,
					config: jsonClone(source.config || {}),
					state: jsonClone(source.state || {}),
					stateMeta: jsonClone(source.stateMeta || {}),
					stabilizerPosition: source.kind === 'surge' && normalizePosition(source?.stabilizer?.position)
						? addPosition(normalizedTarget, source.stabilizer.position)
						: null,
					sourceKind: source.kind,
					restricted: jsonClone(source.restricted || {}),
					status: classification.status,
					reason: classification.reason,
					conflicts: Array.from(conflicts)
				})
			}

			if (
				(Number(blueprint.schemaVersion) === 4 && blueprint.mode === 'structure') ||
				((Number(blueprint.schemaVersion) === 5 || Number(blueprint.schemaVersion) === 6 || Number(blueprint.schemaVersion) === 7 || Number(blueprint.schemaVersion) === 8) && blueprint.mode === 'full')
			) {
				const seenEmptyCells = new Set()
				for (const relativeValue of blueprint.emptyCells || []) {
					if (isCancelled()) throw planError('plan-cancelled')
					const relative = normalizePosition(relativeValue)
					if (!relative) throw planError('invalid-blueprint-empty-cell')
					const position = addPosition(normalizedTarget, relative)
					const key = cellKey(position)
					if (seenEmptyCells.has(key)) continue
					seenEmptyCells.add(key)
					const entity = planningEntityAt(game, position, options)
					guardCells.set(key, { position, entity })
					emptyCells.push(position)
					if (entity) {
						emptyEntities.add(entity)
						const name = safeName(entity.name)
						if (name) relevantNames.add(name)
					}
					processedCells += 1
					if (processedCells % chunkSize === 0) await yieldControl()
				}
			}

			const guard = createGuard(game, guardCells, relevantNames, options)
			const statusCounts = countStatuses(records)
			const cost = simulateCost(game, records, guard)
			return {
				version: '0.5.1',
				mode: blueprint.mode,
				schemaVersion: Number(blueprint.schemaVersion),
				normalization: jsonClone(blueprint.summary || {}),
				sourcePlane: Number(blueprint.sourcePlane) ? 1 : 0,
				target: normalizedTarget,
				bounds: targetBounds(blueprint.contentBounds, normalizedTarget, records, emptyCells),
				records,
				emptyCells,
				neutralCells: translateCells(blueprint.neutralCells, normalizedTarget),
				emptyEntities: Array.from(emptyEntities),
				statusCounts,
				cost,
				guard,
				options: {
					includeBlocks,
					includeSurges
				}
			}
		}

		function validateRoot(game, blueprint, target) {
			if (!game || typeof game !== 'object') throw planError('game-unavailable')
			const stateService = globalThis[STATE_KEY]
			if (
				(typeof stateService?.inspectStructure === 'function' && stateService.inspectStructure(blueprint)?.valid !== true) ||
				(typeof stateService?.inspectBlueprint === 'function' && stateService.inspectBlueprint(blueprint)?.valid !== true)
			) throw planError('unsafe-blueprint')
			const schemaVersion = Number(blueprint?.schemaVersion)
			if (
				!blueprint ||
				(schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3 && schemaVersion !== 4 && schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8) ||
				(blueprint.mode !== 'structure' && blueprint.mode !== 'full') ||
				(blueprint.mode === 'structure' && (schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8)) ||
				(blueprint.mode === 'full' && schemaVersion !== 3 && schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8)
			) {
				throw planError('structure-blueprint-required')
			}
			if (
				!Array.isArray(blueprint.entities) ||
				(
					!blueprint.entities.length &&
					!((schemaVersion === 4 || schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && Array.isArray(blueprint.emptyCells) && blueprint.emptyCells.length) &&
					!(blueprint.mode === 'full' && Array.isArray(blueprint.blocks) && blueprint.blocks.length) &&
					!((schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && Array.isArray(blueprint.surges) && blueprint.surges.length) &&
					!((schemaVersion === 7 || schemaVersion === 8) && Array.isArray(blueprint.paintedCubes) && blueprint.paintedCubes.length)
				)
			) {
				throw planError('blueprint-empty')
			}
			if (schemaVersion === 4 && !Array.isArray(blueprint.emptyCells)) {
				throw planError('blueprint-empty-mask-missing')
			}
			if ((schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && !Array.isArray(blueprint.emptyCells)) {
				throw planError('blueprint-empty-mask-missing')
			}
			if ((schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && !Array.isArray(blueprint.surges)) throw planError('blueprint-surge-layer-missing')
			if (schemaVersion === 7 && (!Array.isArray(blueprint.paintedCubes) || !blueprint.paintedCubes.length)) {
				throw planError('blueprint-painted-layer-missing')
			}
			if (schemaVersion === 8 && !Array.isArray(blueprint.paintedCubes)) throw planError('blueprint-painted-layer-missing')
			if (!normalizePosition(target)) throw planError('target-invalid')
		}

		function classifyRecord(game, source, name, position, footprint, conflicts, options) {
			const definition = game.codex?.entities?.[name]
			const isPainted = source.kind === 'painted-cube' && name === 'cube'
			const isCube = (source.kind === 'cube' || isPainted) && name === 'cube'
			const isSurge = source.kind === 'surge' && name === 'surge'
			const isShatteredStabilizer = source.kind === 'entity' && name === 'stabilizer3' && options?.blueprintMode === 'full'
			if (isSurge) {
				const stateService = globalThis[STATE_KEY]
				if (!stateService?.surgeEligible?.(source)) return { status: STATUS.BLOCKED, reason: 'invalid-surge' }
				return conflicts.length
					? { status: STATUS.BLOCKED, reason: 'surge-occupied' }
					: { status: STATUS.BUILDABLE, reason: 'empty' }
			}
			if (!isCube && (!definition || (definition.canPurchase !== true && !isShatteredStabilizer))) {
				return { status: STATUS.BLOCKED, reason: 'unsupported' }
			}
			const exact = conflicts.length === 1 && exactBlueprintMatch(
				game,
				conflicts[0],
				source,
				name,
				position,
				footprint,
				options
			)
			if (exact) return { status: STATUS.SATISFIED, reason: 'matched' }
			if (
				isCube && !isPainted &&
				conflicts.some(function (entity) {
					return safeName(entity?.name) === 'cube' && Number(entity?.state) !== 2
				})
			) {
				return { status: STATUS.BLOCKED, reason: 'unstable-cube' }
			}
			if (
				conflicts.some(function (entity) {
					return entity?.indestructible === true ||
						(safeName(entity?.name) === 'cube' && !isCube)
				})
			) {
				return { status: STATUS.BLOCKED, reason: 'indestructible' }
			}
			if (
				conflicts.length &&
				typeof options?.canReplaceEntity === 'function' &&
				conflicts.some(function (entity) {
					try {
						const assessment = options.canReplaceEntity(entity, {
							blueprintMode: options.blueprintMode,
							sourceKind: source.kind
						})
						return assessment === false || assessment?.safe === false
					} catch (error) {
						return true
					}
				})
			) {
				return { status: STATUS.BLOCKED, reason: 'unsafe-replacement' }
			}
			if (isShatteredStabilizer || source.restricted?.onlyOne === true || definition?.onlyone === true) {
				if (game.onlyones?.[name] || Number(game.entitiesInGame?.[name]) > 0) {
					const replacesSameOnlyOne = conflicts.some(function (entity) {
						return safeName(entity?.name) === name
					})
					if (!replacesSameOnlyOne) return { status: STATUS.BLOCKED, reason: 'only-one' }
				}
			}
			if (conflicts.length) return { status: STATUS.CONFLICT, reason: 'occupied' }
			return { status: STATUS.BUILDABLE, reason: 'empty' }
		}

		function exactBlueprintMatch(game, entity, source, name, position, footprint, options) {
			if (!entity || safeName(entity.name) !== name) return false
			const existingPosition = normalizePosition(entity.position)
			if (!existingPosition || !samePosition(existingPosition, position)) return false
			const existingFootprint = entityFootprint(entity, existingPosition)
			if (
				existingFootprint.minU !== footprint.minU ||
				existingFootprint.maxU !== footprint.maxU ||
				existingFootprint.minV !== footprint.minV ||
				existingFootprint.maxV !== footprint.maxV
			) {
				return false
			}
			if (!sameConfig(source.config || {}, readStructureConfig(entity, source.config || {}))) return false
			if (options?.blueprintMode !== 'full') return true
			if (source.kind === 'painted-cube') {
				return globalThis[PAINTED_KEY]?.matchesEntity?.(entity, {
					kind: 'painted-cube',
					name: 'cube',
					position: source.position,
					state: source.state
				}) === true
			}
			const stateService = globalThis[STATE_KEY]
			const currentSave = stateService?.capture?.(game, entity)
			if (!currentSave || !stateService?.sameState?.(source.state || {}, currentSave.par || {})) return false
			if (name === 'waypoint' || name === 'waypoint2') {
				return Number(source.stateMeta?.waypointOrder) === Number(options?.waypointOrder)
			}
			return true
		}

		function currentWaypointOrders(game, blueprint, target) {
			const result = new Map()
			if (blueprint?.mode !== 'full') return result
			const matches = []
			for (const source of blueprint.entities || []) {
				if (source?.name !== 'waypoint' && source?.name !== 'waypoint2') continue
				const relative = normalizePosition(source.position)
				if (!relative) continue
				const entity = planningEntityAt(game, addPosition(target, relative))
				if (!entity || safeName(entity.name) !== safeName(source.name)) continue
				matches.push({
					source,
					timestamp: finiteOr(entity.timestamp, Number.MAX_SAFE_INTEGER)
				})
			}
			matches.sort(function (left, right) {
				return left.timestamp - right.timestamp
			}).forEach(function (entry, order) {
				result.set(entry.source, order)
			})
			return result
		}

		function readStructureConfig(entity, template) {
			const result = {}
			for (const key of Object.keys(template || {})) {
				if (Object.prototype.hasOwnProperty.call(entity || {}, key)) result[key] = entity[key]
				else if (Object.prototype.hasOwnProperty.call(entity?.config || {}, key)) result[key] = entity.config[key]
				else if (Object.prototype.hasOwnProperty.call(entity?.par || {}, key)) result[key] = entity.par[key]
				else result[key] = null
			}
			return result
		}

		function sameConfig(left, right) {
			try {
				return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
			} catch (error) {
				return false
			}
		}

		function stableValue(value) {
			if (Array.isArray(value)) return value.map(stableValue)
			if (!value || typeof value !== 'object') return value
			const result = {}
			for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key])
			return result
		}

		function createGuard(game, cells, relevantNames, options) {
			const counts = {}
			const onlyones = {}
			for (const name of relevantNames) {
				const definition = game.codex?.entities?.[name]
				if (!definition || (definition.canPurchase !== true && name !== 'stabilizer3')) continue
				counts[name] = finiteOr(game.entitiesInGame?.[name], 0)
				onlyones[name] = !!game.onlyones?.[name]
			}
			return {
				cells: Array.from(cells.values()),
				counts,
				onlyones,
				resources: numericArray(game.resources),
				includeDynamicConflicts: !!options?.includeDynamicConflicts
			}
		}

		function verifyGuard(game, guard) {
			return inspectGuard(game, guard).valid
		}

		function inspectGuard(game, guard) {
			if (!game || !guard || !Array.isArray(guard.cells)) return guardResult('invalid')
			for (const entry of guard.cells) {
				if (
					(entry.includeDynamicEntity
						? safeEntityAt(game, entry.position)
						: planningEntityAt(game, entry.position, {
							includeDynamicConflicts: !!guard.includeDynamicConflicts
						})) !== entry.entity
				) {
					return guardResult('cells')
				}
			}
			for (const name of Object.keys(guard.counts || {})) {
				if (finiteOr(game.entitiesInGame?.[name], 0) !== guard.counts[name]) return guardResult('counts')
			}
			for (const name of Object.keys(guard.onlyones || {})) {
				if (!!game.onlyones?.[name] !== guard.onlyones[name]) return guardResult('onlyones')
			}
			const resources = numericArray(game.resources)
			const expected = numericArray(guard.resources)
			const length = Math.max(resources.length, expected.length)
			for (let index = 0; index < length; index += 1) {
				if (finiteOr(resources[index], 0) !== finiteOr(expected[index], 0)) return guardResult('resources')
			}
			return guardResult('valid')
		}

		function guardResult(reason) {
			return Object.freeze({
				valid: reason === 'valid',
				reason
			})
		}

		function refreshPlanResources(game, plan) {
			if (!game || !plan?.guard || !plan?.cost) throw planError('plan-unavailable')
			const resources = numericArray(game.resources)
			return Object.assign({}, plan, {
				guard: Object.assign({}, plan.guard, {
					resources
				}),
				cost: refreshCostResources(plan.cost, resources)
			})
		}

		function refreshCostResources(cost, resources) {
			if (!cost || !Array.isArray(cost.required)) return cost
			const owned = normalizedTotals(resources)
			return Object.assign({}, cost, {
				owned,
				shortfall: normalizedTotals(subtractFloorZero(cost.required, owned))
			})
		}

		function simulateCost(game, records, guard) {
			const counts = Object.assign({}, guard.counts || {})
			const demand = []
			const errors = []
			const typeCosts = new Map()
			const builds = records.filter(function (record) {
				return record.status === STATUS.BUILDABLE && record.name !== 'cube' && record.sourceKind !== 'surge'
			}).sort(compareRecords)
			for (const record of builds) {
				let typeCost = typeCosts.get(record.name)
				if (!typeCost) {
					typeCost = { name: record.name, buildCount: 0, demand: [] }
					typeCosts.set(record.name, typeCost)
				}
				typeCost.buildCount += 1
				const price = simulatedPrice(game, counts, record.name)
				if (price) {
					addArray(demand, price)
					addArray(typeCost.demand, price)
				} else {
					errors.push({ kind: 'build', name: record.name })
				}
				counts[record.name] = finiteOr(counts[record.name], 0) + 1
			}

			const required = normalizedTotals(demand)
			const owned = numericArray(guard.resources)
			const shortfall = subtractFloorZero(required, owned)
			return {
				complete: errors.length === 0,
				buildCount: builds.length,
				demand: required,
				required,
				owned: normalizedTotals(owned),
				shortfall: normalizedTotals(shortfall),
				byType: Array.from(typeCosts.values(), function (entry) {
					return {
						name: entry.name,
						buildCount: entry.buildCount,
						demand: normalizedTotals(entry.demand)
					}
				}),
				errors
			}
		}

		function simulatedPrice(game, counts, name) {
			const definition = game.codex?.entities?.[name]
			if (!definition || !Array.isArray(definition.price)) return null
			const currentCount = Math.max(0, finiteOr(counts[name], 0))
			const exponent = finiteOr(definition.priceExponent, 1)
			const multiplier = exponent
				? exponent ** currentCount
				: 1
			return definition.price.map(function (value) {
				return finiteOr(value, 0) * multiplier
			})
		}

		function targetFootprint(source, target, position) {
			const relativeMin = normalizePosition(source.footprint?.min)
			const relativeMax = normalizePosition(source.footprint?.max)
			if (relativeMin && relativeMax) {
				return {
					span: nonNegativeSafeInteger(source.footprint?.span, 0),
					minU: safeIntegerAdd(target[0], Math.min(relativeMin[0], relativeMax[0])),
					maxU: safeIntegerAdd(target[0], Math.max(relativeMin[0], relativeMax[0])),
					minV: safeIntegerAdd(target[1], Math.min(relativeMin[1], relativeMax[1])),
					maxV: safeIntegerAdd(target[1], Math.max(relativeMin[1], relativeMax[1]))
				}
			}
			const span = nonNegativeSafeInteger(source.footprint?.span, 0)
			return {
				span,
				minU: safeIntegerSubtract(position[0], span),
				maxU: safeIntegerAdd(position[0], span),
				minV: safeIntegerSubtract(position[1], span),
				maxV: safeIntegerAdd(position[1], span)
			}
		}

		function entityFootprint(entity, position) {
			const span = nonNegativeSafeInteger(entity?.entitySpan, 0)
			return {
				span,
				minU: safeIntegerSubtract(position[0], span),
				maxU: safeIntegerAdd(position[0], span),
				minV: safeIntegerSubtract(position[1], span),
				maxV: safeIntegerAdd(position[1], span)
			}
		}

		function targetBounds(bounds, target, records, emptyCells) {
			const min = normalizePosition(bounds?.min)
			const max = normalizePosition(bounds?.max)
			const result = {
				minU: Infinity,
				maxU: -Infinity,
				minV: Infinity,
				maxV: -Infinity
			}
			if (min && max) {
				result.minU = safeIntegerAdd(target[0], Math.min(min[0], max[0]))
				result.maxU = safeIntegerAdd(target[0], Math.max(min[0], max[0]))
				result.minV = safeIntegerAdd(target[1], Math.min(min[1], max[1]))
				result.maxV = safeIntegerAdd(target[1], Math.max(min[1], max[1]))
			}
			for (const record of records) {
				result.minU = Math.min(result.minU, record.footprint.minU)
				result.maxU = Math.max(result.maxU, record.footprint.maxU)
				result.minV = Math.min(result.minV, record.footprint.minV)
				result.maxV = Math.max(result.maxV, record.footprint.maxV)
			}
			for (const position of emptyCells || []) {
				result.minU = Math.min(result.minU, position[0])
				result.maxU = Math.max(result.maxU, position[0])
				result.minV = Math.min(result.minV, position[1])
				result.maxV = Math.max(result.maxV, position[1])
			}
			return result
		}

		function countStatuses(records) {
			const counts = {
				buildable: 0,
				satisfied: 0,
				conflict: 0,
				blocked: 0
			}
			for (const record of records) counts[record.status] += 1
			return counts
		}

		function safeEntityAt(game, position) {
			try {
				if (typeof game.entityAtCoordinates === 'function') return game.entityAtCoordinates(position) || null
				return game.stuffMap?.['u' + position[0] + 'v' + position[1]] || null
			} catch (error) {
				return null
			}
		}

		function planningEntityAt(game, position) {
			const entity = safeEntityAt(game, position)
			return safeName(entity?.name) === 'surge' ? null : entity
		}

		function compareRecords(left, right) {
			return left.position[1] - right.position[1] ||
				left.position[0] - right.position[0] ||
				left.id - right.id ||
				left.index - right.index
		}

		function addArray(target, source) {
			for (let index = 0; index < source.length; index += 1) {
				target[index] = finiteOr(target[index], 0) + finiteOr(source[index], 0)
			}
		}

		function subtractFloorZero(left, right) {
			const result = []
			const length = Math.max(left.length, right.length)
			for (let index = 0; index < length; index += 1) {
				result[index] = Math.max(0, finiteOr(left[index], 0) - finiteOr(right[index], 0))
			}
			return result
		}

		function normalizedTotals(values) {
			return numericArray(values).map(function (value) {
				return Math.round(value * 1000) / 1000
			})
		}

		function numericArray(value) {
			if (!Array.isArray(value)) return []
			return value.map(function (entry) {
				return finiteOr(entry, 0)
			})
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			if (!Number.isSafeInteger(u) || !Number.isSafeInteger(v)) return null
			return [u, v]
		}

		function addPosition(left, right) {
			return [safeIntegerAdd(left[0], right[0]), safeIntegerAdd(left[1], right[1])]
		}

		function safeIntegerAdd(left, right) {
			const value = Number(left) + Number(right)
			if (!Number.isSafeInteger(value)) throw planError('coordinate-overflow')
			return value
		}

		function safeIntegerSubtract(left, right) {
			const value = Number(left) - Number(right)
			if (!Number.isSafeInteger(value)) throw planError('coordinate-overflow')
			return value
		}

		function nonNegativeSafeInteger(value, fallback) {
			const number = Number(value)
			return Number.isSafeInteger(number) && number >= 0 ? number : fallback
		}

		function translateCells(cells, target) {
			const result = []
			const seen = new Set()
			for (const value of cells || []) {
				const relative = normalizePosition(value)
				if (!relative) continue
				const position = addPosition(target, relative)
				const key = cellKey(position)
				if (seen.has(key)) continue
				seen.add(key)
				result.push(position)
			}
			return result
		}

		function samePosition(left, right) {
			return left[0] === right[0] && left[1] === right[1]
		}

		function safeName(value) {
			return typeof value === 'string' ? value.trim() : ''
		}

		function cellKey(position) {
			return position[0] + ':' + position[1]
		}

		function jsonClone(value) {
			return JSON.parse(JSON.stringify(value))
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function positiveInteger(value, fallback) {
			const number = Math.floor(Number(value))
			return Number.isFinite(number) && number > 0 ? number : fallback
		}

		function nonNegativeInteger(value, fallback) {
			const number = Math.floor(Number(value))
			return Number.isFinite(number) && number >= 0 ? number : fallback
		}

		function planError(code) {
			const error = new Error(code)
			error.code = code
			return error
		}

		function yieldControl() {
			return new Promise(function (resolve) {
				if (typeof globalThis.requestAnimationFrame === 'function') {
					globalThis.requestAnimationFrame(function () { resolve() })
					return
				}
				if (typeof globalThis.setTimeout === 'function') {
					globalThis.setTimeout(resolve, 0)
					return
				}
				resolve()
			})
		}

		async function runSyntheticBenchmark(options) {
			const sizes = Array.isArray(options.sizes) && options.sizes.length
				? options.sizes.map(function (value) { return positiveInteger(value, 100) })
				: [100, 500, 2000]
			const samples = positiveInteger(options.samples, 5)
			const clock = typeof options.now === 'function'
				? options.now
				: function () {
					return typeof performance !== 'undefined' && typeof performance.now === 'function'
						? performance.now()
						: Date.now()
				}
			const results = []
			for (const size of sizes) {
				const durations = []
				for (let sample = 0; sample < samples; sample += 1) {
					const fixture = syntheticFixture(size)
					const started = clock()
					await buildPlan(fixture.game, fixture.blueprint, [100000, 100000], {
						chunkSize: Math.max(DEFAULT_CHUNK_SIZE, size + 1)
					})
					durations.push(Math.max(0, clock() - started))
				}
				results.push({
					size,
					samples,
					medianMs: percentile(durations, .5),
					p95Ms: percentile(durations, .95)
				})
			}
			return {
				version: '0.5.1',
				kind: 'synthetic-plan',
				results
			}
		}

		function syntheticFixture(size) {
			const entities = []
			for (let index = 0; index < size; index += 1) {
				entities.push({
					kind: 'entity',
					name: 'benchmark-entity',
					position: [index % 50, Math.floor(index / 50)],
					footprint: {
						span: 0,
						min: [index % 50, Math.floor(index / 50)],
						max: [index % 50, Math.floor(index / 50)]
					},
					restricted: { onlyOne: false },
					config: {}
				})
			}
			return {
				game: {
					codex: {
						entities: {
							'benchmark-entity': {
								canPurchase: true,
								price: [1],
								priceExponent: 1.01
							}
						}
					},
					entitiesInGame: {},
					onlyones: {},
					resources: [1000000000],
					entityAtCoordinates() {
						return null
					}
				},
				blueprint: {
					schemaVersion: 1,
					mode: 'structure',
					sourcePlane: 0,
					contentBounds: {
						min: [0, 0],
						max: [Math.min(size, 50) - 1, Math.floor((size - 1) / 50)]
					},
					entities
				}
			}
		}

		function percentile(values, percentileValue) {
			const sorted = values.slice().sort(function (left, right) { return left - right })
			if (!sorted.length) return 0
			const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))
			return Math.round(sorted[index] * 1000) / 1000
		}

		console.info('[Cattail World Editor] Structure/full blueprint preview planner 5A ready.')
	}
})
