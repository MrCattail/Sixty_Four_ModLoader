ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
		const PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
		const MAX_STRUCTURE_DEPTH = 32
		const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
		const DURABLE_FIELDS = Object.freeze([
			'depth',
			'timeStamp',
			'fill',
			'state',
			'conversion',
			'resources',
			'resourceCount',
			'spawnedHollows',
			'variant',
			'order',
			'soul',
			'grade',
			'type',
			'rayNumber',
			'colors',
			'maxLife',
			'life',
			'penalty',
			'broken'
		])
		const previous = globalThis[STATE_KEY]
		previous?.dispose?.('blueprint-state-replaced')
		let disposed = false

		const service = Object.freeze({
			version: '0.5.1',
			maxStructureDepth: MAX_STRUCTURE_DEPTH,
			inspectStructure,
			inspectBlueprint,
			isSafePosition(value) {
				return normalizePosition(value) !== null
			},
			normalizePar,
			normalizeSave,
			normalizeSaveDetailed,
			normalizeBlueprint,
			normalizeSurge,
			projectStructure,
			surgeEligible,
			capture(game, entity) {
				if (!game || typeof game.getEntityString !== 'function') return null
				let saved
				try {
					saved = game.getEntityString(entity)
				} catch (error) {
					return null
				}
				return normalizeSave(saved)
			},
			sameState(left, right) {
				return stableString(normalizeStateValue(left)) === stableString(normalizeStateValue(right))
			},
			stateToken(game, entity) {
				return stableString(normalizeSave(game?.getEntityString?.(entity)))
			},
			materializeSave(saved, options) {
				const save = normalizeSave(saved)
				if (!save) return null
				const timestamp = Number(options?.waypointTimestamp)
				if (
					(save.name === 'waypoint' || save.name === 'waypoint2') &&
					Number.isFinite(timestamp)
				) {
					save.par.timestamp = timestamp
				}
				return save
			},
			dispose() {
				if (disposed) return false
				disposed = true
				if (globalThis[STATE_KEY] === service) delete globalThis[STATE_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, STATE_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		function normalizeBlueprint(value) {
			if (!inspectStructure(value).valid || !inspectBlueprint(value).valid) return null
			const blueprint = jsonClone(value)
			const schemaVersion = Number(blueprint?.schemaVersion)
			if (
				!blueprint ||
				blueprint.mode !== 'full' ||
				(schemaVersion !== 3 && schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8) ||
				!Array.isArray(blueprint.entities)
			) {
				return blueprint
			}
			if (schemaVersion !== 7 && schemaVersion !== 8 && Object.prototype.hasOwnProperty.call(blueprint, 'paintedCubes')) return null
			if (
				(schemaVersion === 7 || schemaVersion === 8) &&
				[].concat(blueprint.entities || [], blueprint.blocks || [], blueprint.surges || []).some(function (record) {
					return Object.prototype.hasOwnProperty.call(record?.state || {}, 'worldEditorPaint')
				})
			) return null
			const waypointEntries = []
			let normalizedCount = 0
			let shatteredStabilizerCount = 0
			blueprint.entities = blueprint.entities.map(function (record, index) {
				const next = Object.assign({}, record)
				if (safeName(record?.name) === 'stabilizer3') {
					shatteredStabilizerCount += 1
					if (next.restricted?.onlyOne !== true) normalizedCount += 1
					next.restricted = Object.assign({}, next.restricted, { onlyOne: true })
				}
				const originalState = jsonClone(record?.state || {})
				const detail = normalizeSaveDetailed({
					name: record?.name,
					position: record?.position,
					par: originalState
				})
				next.state = detail.save?.par || {}
				if (detail.changed) normalizedCount += 1
				if (record?.stateMeta && typeof record.stateMeta === 'object') {
					next.stateMeta = jsonClone(record.stateMeta)
				}
				if (record?.name === 'waypoint' || record?.name === 'waypoint2') {
					const existingOrder = Number(next.stateMeta?.waypointOrder)
					waypointEntries.push({
						index,
						order: Number.isInteger(existingOrder) && existingOrder >= 0 ? existingOrder : null,
						timestamp: finiteOr(originalState?.timestamp, Number.MAX_SAFE_INTEGER)
					})
				}
				return next
			})
			if (shatteredStabilizerCount > 1) return null
			blueprint.blocks = Array.isArray(blueprint.blocks)
				? blueprint.blocks.map(function (record) {
					const next = Object.assign({}, record)
					const detail = normalizeSaveDetailed({
						name: record?.name,
						position: record?.position,
						par: record?.state
					})
					next.state = detail.save?.par || {}
					if (detail.changed) normalizedCount += 1
					return next
				})
				: []
			if ((schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && Array.isArray(blueprint.surges)) {
				const normalizedSurges = []
				for (const record of blueprint.surges) {
					const normalized = normalizeSurge(record, { allowStabilizer: schemaVersion === 8 })
					if (!normalized) return null
					normalizedSurges.push(normalized)
				}
				blueprint.surges = normalizedSurges
			} else if (schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8) {
				blueprint.surges = []
			}
			if (schemaVersion === 7 || schemaVersion === 8) {
				const painted = globalThis[PAINTED_KEY]
				if (!Array.isArray(blueprint.paintedCubes)) return null
				if (blueprint.paintedCubes.length) {
					const records = typeof painted?.normalizeLayer === 'function'
						? painted.normalizeLayer(blueprint)
						: null
					if (!records) return null
					blueprint.paintedCubes = records
				} else if (schemaVersion === 7) {
					return null
				}
			}
			let stabilizerLinkCount = 0
			if (schemaVersion === 8) {
				const stabilizers = new Map()
				for (const record of blueprint.entities) {
					if (!isStabilizerName(record?.name)) continue
					const position = normalizePosition(record.position)
					if (position) stabilizers.set(positionKey(position), record)
				}
				const linkedStabilizers = new Set()
				for (const surge of blueprint.surges) {
					const position = normalizePosition(surge?.stabilizer?.position)
					if (!position) continue
					const key = position && positionKey(position)
					if (!stabilizers.has(key) || linkedStabilizers.has(key)) return null
					linkedStabilizers.add(key)
					stabilizerLinkCount += 1
				}
				if (!stabilizerLinkCount) return null
			}
			const ordered = waypointEntries.slice().sort(function (left, right) {
				if (left.order !== null || right.order !== null) {
					return finiteOr(left.order, Number.MAX_SAFE_INTEGER) -
						finiteOr(right.order, Number.MAX_SAFE_INTEGER) ||
						left.index - right.index
				}
				return left.timestamp - right.timestamp || left.index - right.index
			})
			ordered.forEach(function (entry, order) {
				const record = blueprint.entities[entry.index]
				record.stateMeta = Object.assign({}, record.stateMeta, { waypointOrder: order })
			})
			if ((schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) && !Array.isArray(blueprint.emptyCells)) blueprint.emptyCells = []
			blueprint.summary = Object.assign({}, blueprint.summary, {
				surgeCount: Array.isArray(blueprint.surges) ? blueprint.surges.length : 0,
				paintedCubeCount: Array.isArray(blueprint.paintedCubes) ? blueprint.paintedCubes.length : 0,
				stabilizerLinkCount,
				normalizedCount: Math.max(
					nonNegativeInteger(blueprint.summary?.normalizedCount, 0),
					normalizedCount
				)
			})
			return blueprint
		}

		function normalizeSurge(value, options) {
			const position = normalizePosition(value?.position)
			const detail = normalizeSaveDetailed({
				name: 'surge',
				position,
				par: value?.state || value?.par
			})
			const state = detail.save?.par
			if (
				!position ||
				!state ||
				!Array.isArray(state.resources) ||
				!Array.isArray(state.colors) ||
				positiveNumber(state.life) <= 0 ||
				positiveNumber(state.maxLife) <= 0 ||
				positiveInteger(state.rayNumber) <= 0
			) return null
			const result = {
				kind: 'surge',
				name: 'surge',
				position,
				state
			}
			if (options?.allowStabilizer === true) {
				const stabilizerPosition = normalizePosition(value?.stabilizer?.position)
				if (value?.stabilizer !== undefined && !stabilizerPosition) return null
				if (stabilizerPosition) result.stabilizer = { position: stabilizerPosition }
			}
			return result
		}

		function surgeEligible(entity, saved) {
			if (safeName(entity?.name) !== 'surge' || entity?.killme) return false
			if (positiveNumber(entity?.harvestProgression) > 0) return false
			const normalized = normalizeSurge({
				position: entity?.position,
				state: saved?.par || saved?.state || saved || entity?.state || entity?.par
			})
			return !!normalized && positiveNumber(entity?.lifeTimer ?? normalized.state.life) > 0
		}

		function projectStructure(value) {
			const source = normalizeBlueprint(value)
			if (!source || typeof source !== 'object') return source
			if (source.mode === 'structure') return source
			const entities = (source.entities || []).map(function (record) {
				const next = jsonClone(record)
				delete next.state
				delete next.stateMeta
				return next
			})
			const neutral = new Map()
			for (const record of [].concat(source.blocks || [], source.paintedCubes || [], source.surges || [])) {
				const position = normalizePosition(record?.position)
				if (position) neutral.set(position[0] + ':' + position[1], position)
			}
			const emptyCells = (source.emptyCells || []).map(normalizePosition).filter(Boolean).filter(function (position) {
				return !neutral.has(position[0] + ':' + position[1])
			})
			const capturedTypes = typeCounts(entities)
			const skippedTypes = Array.isArray(source.summary?.skippedTypes)
				? jsonClone(source.summary.skippedTypes).filter(function (entry) {
					return safeName(entry?.name) !== 'cube' && safeName(entry?.name) !== 'surge'
				})
				: []
			return {
				schemaVersion: 4,
				mode: 'structure',
				sourceSchemaVersion: Number(source.schemaVersion) || 0,
				sourceMode: source.mode,
				sourcePlane: Number(source.sourcePlane) ? 1 : 0,
				anchor: jsonClone(source.anchor),
				selections: jsonClone(source.selections || []),
				emptyCells: emptyCells.sort(comparePositions),
				neutralCells: Array.from(neutral.values()).sort(comparePositions),
				contentBounds: jsonClone(source.contentBounds),
				includeBlocks: false,
				entities,
				blocks: [],
				paintedCubes: [],
				surges: [],
				production: jsonClone(source.production),
				summary: Object.assign({}, jsonClone(source.summary || {}), {
					entityCount: entities.length,
					blockCount: 0,
					paintedCubeCount: 0,
					surgeCount: 0,
					neutralCellCount: neutral.size,
					capturedTypes,
					skippedTypes
				})
			}
		}

		function normalizeSave(value) {
			return normalizeSaveDetailed(value).save
		}

		function normalizeSaveDetailed(value) {
			const name = safeName(value?.name)
			const position = normalizePosition(value?.position)
			if (!name || !position || !value?.par || typeof value.par !== 'object') {
				return { save: null, changed: false, removedFields: [] }
			}
			const par = normalizePar(name, value.par)
			const removedFields = Object.keys(value.par).filter(function (key) {
				return !Object.prototype.hasOwnProperty.call(par, key)
			})
			const save = { name, position, par }
			return {
				save,
				changed: removedFields.length > 0 || stableString(value.par) !== stableString(par),
				removedFields
			}
		}

		function normalizePar(nameValue, value) {
			const name = safeName(nameValue)
			const source = value && typeof value === 'object' ? value : {}
			const result = {}
			for (const key of DURABLE_FIELDS) {
				if (!Object.prototype.hasOwnProperty.call(source, key)) continue
				const cloned = jsonClone(source[key])
				if (cloned !== undefined) result[key] = cloned
			}
			if (name === 'pump2' && Object.prototype.hasOwnProperty.call(result, 'timeStamp')) {
				result.timeStamp = 0
			}
			if (Object.prototype.hasOwnProperty.call(result, 'spawnedHollows')) {
				result.spawnedHollows = 0
			}
			if (name === 'waypoint' || name === 'waypoint2') delete result.timestamp
			if (name === 'cube') {
				if (!Object.prototype.hasOwnProperty.call(result, 'state')) result.state = 0
				if (!Array.isArray(result.resources)) result.resources = []
			}
			return result
		}

		function normalizeStateValue(value) {
			if (!value || typeof value !== 'object') return value
			if (Object.prototype.hasOwnProperty.call(value, 'name') && Object.prototype.hasOwnProperty.call(value, 'par')) {
				return normalizeSave(value)
			}
			return jsonClone(value)
		}

		function inspectStructure(value) {
			const stack = [{ value, depth: 0, exit: false }]
			const ancestors = new WeakSet()
			while (stack.length) {
				const entry = stack.pop()
				const current = entry.value
				if (!current || typeof current !== 'object') continue
				if (entry.exit) {
					ancestors.delete(current)
					continue
				}
				if (entry.depth > MAX_STRUCTURE_DEPTH) return inspection(false, 'depth')
				if (ancestors.has(current)) return inspection(false, 'cycle')
				ancestors.add(current)
				stack.push({ value: current, depth: entry.depth, exit: true })
				const keys = Object.keys(current)
				for (let index = keys.length - 1; index >= 0; index -= 1) {
					const key = keys[index]
					if (DANGEROUS_KEYS.has(key)) return inspection(false, 'dangerous-key', key)
					const child = current[key]
					if (child && typeof child === 'object') {
						stack.push({ value: child, depth: entry.depth + 1, exit: false })
					}
				}
			}
			return inspection(true, null)
		}

		function inspectBlueprint(value) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) return inspection(false, 'root')
			const schema = Number(value.schemaVersion)
			const supported = value.mode === 'structure'
				? schema >= 1 && schema <= 4
				: value.mode === 'full' && [3, 5, 6, 7, 8].includes(schema)
			if (!supported) return inspection(true, null)

			if (!inspectOptionalPosition(value.anchor?.position)) return inspection(false, 'anchor-position')
			for (const selection of arrayOrEmpty(value.selections)) {
				for (const key of ['start', 'end', 'min', 'max']) {
					if (!inspectOptionalPosition(selection?.[key])) return inspection(false, 'selection-' + key)
				}
				if (!inspectOptionalSafeInteger(selection?.width, true) || !inspectOptionalSafeInteger(selection?.height, true)) {
					return inspection(false, 'selection-size')
				}
				if (!inspectBounds(selection?.min, selection?.max)) return inspection(false, 'selection-bounds')
			}

			if (value.contentBounds !== null && value.contentBounds !== undefined) {
				if (!normalizePosition(value.contentBounds?.min) || !normalizePosition(value.contentBounds?.max)) {
					return inspection(false, 'content-bounds-position')
				}
				if (!inspectOptionalSafeInteger(value.contentBounds?.width, true) || !inspectOptionalSafeInteger(value.contentBounds?.height, true)) {
					return inspection(false, 'content-bounds-size')
				}
				if (!inspectBounds(value.contentBounds.min, value.contentBounds.max)) return inspection(false, 'content-bounds-derived')
			}

			for (const record of arrayOrEmpty(value.entities)) {
				const position = normalizePosition(record?.position)
				if (!position) return inspection(false, 'entity-position')
				const footprint = record?.footprint
				if (footprint && typeof footprint === 'object') {
					if (!inspectOptionalPosition(footprint.min) || !inspectOptionalPosition(footprint.max)) {
						return inspection(false, 'entity-footprint-position')
					}
					if (!inspectOptionalSafeInteger(footprint.span, true)) return inspection(false, 'entity-footprint-span')
					if (!inspectBounds(footprint.min, footprint.max)) return inspection(false, 'entity-footprint-bounds')
					if (footprint.span !== undefined) {
						const span = Number(footprint.span)
						if (!safeSubtract(position[0], span) || !safeAdd(position[0], span) || !safeSubtract(position[1], span) || !safeAdd(position[1], span)) {
							return inspection(false, 'entity-footprint-derived')
						}
					}
				}
			}

			for (const layerName of ['blocks', 'surges', 'paintedCubes']) {
				for (const record of arrayOrEmpty(value[layerName])) {
					if (!normalizePosition(record?.position)) return inspection(false, layerName + '-position')
				}
			}
			if (schema === 8) {
				if (!Array.isArray(value.surges) || !Array.isArray(value.paintedCubes)) return inspection(false, 'schema-8-layers')
				const stabilizers = new Set(arrayOrEmpty(value.entities).filter(function (record) {
					return isStabilizerName(record?.name)
				}).map(function (record) {
					const position = normalizePosition(record?.position)
					return position && positionKey(position)
				}).filter(Boolean))
				const linked = new Set()
				for (const surge of value.surges) {
					const position = normalizePosition(surge?.stabilizer?.position)
					if (!position) continue
					const key = position && positionKey(position)
					if (!stabilizers.has(key) || linked.has(key)) return inspection(false, 'surge-stabilizer')
					linked.add(key)
				}
				if (!linked.size) return inspection(false, 'surge-stabilizer-missing')
			}
			for (const layerName of ['emptyCells', 'neutralCells']) {
				for (const position of arrayOrEmpty(value[layerName])) {
					if (!normalizePosition(position)) return inspection(false, layerName + '-position')
				}
			}
			return inspection(true, null)
		}

		function inspectBounds(minValue, maxValue) {
			if (minValue === undefined && maxValue === undefined) return true
			const min = normalizePosition(minValue)
			const max = normalizePosition(maxValue)
			if (!min || !max) return false
			for (let axis = 0; axis < 2; axis += 1) {
				const lower = Math.min(min[axis], max[axis])
				const upper = Math.max(min[axis], max[axis])
				if (!safeAdd(min[axis], max[axis])) return false
				const difference = upper - lower
				if (!Number.isSafeInteger(difference) || !Number.isSafeInteger(difference + 1)) return false
			}
			return true
		}

		function inspectOptionalPosition(value) {
			return value === undefined || value === null || normalizePosition(value) !== null
		}

		function positionKey(position) {
			return position[0] + ':' + position[1]
		}

		function inspectOptionalSafeInteger(value, nonNegative) {
			if (value === undefined || value === null) return true
			const number = Number(value)
			return Number.isSafeInteger(number) && (!nonNegative || number >= 0)
		}

		function safeAdd(left, right) {
			return Number.isSafeInteger(Number(left) + Number(right))
		}

		function safeSubtract(left, right) {
			return Number.isSafeInteger(Number(left) - Number(right))
		}

		function arrayOrEmpty(value) {
			return Array.isArray(value) ? value : []
		}

		function inspection(valid, reason, key) {
			return Object.freeze({ valid: valid === true, reason: reason || null, key: key || null })
		}

		function stableString(value) {
			try {
				return JSON.stringify(stableValue(value))
			} catch (error) {
				return ''
			}
		}

		function stableValue(value) {
			if (Array.isArray(value)) return value.map(stableValue)
			if (!value || typeof value !== 'object') return value
			const result = {}
			for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key])
			return result
		}

		function jsonClone(value) {
			if (value === undefined) return undefined
			return JSON.parse(JSON.stringify(value))
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function safeName(value) {
			return typeof value === 'string' ? value.trim() : ''
		}

		function isStabilizerName(value) {
			const name = safeName(value)
			return name === 'stabilizer' || name === 'stabilizer2' || name === 'stabilizer3'
		}

		function finiteOr(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function nonNegativeInteger(value, fallback) {
			const number = Math.floor(Number(value))
			return Number.isFinite(number) && number >= 0 ? number : fallback
		}

		function positiveInteger(value) {
			const number = Math.floor(Number(value))
			return Number.isFinite(number) && number > 0 ? number : 0
		}

		function positiveNumber(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : 0
		}

		function comparePositions(left, right) {
			return Number(left?.[1]) - Number(right?.[1]) || Number(left?.[0]) - Number(right?.[0])
		}

		function typeCounts(entities) {
			const counts = new Map()
			for (const entity of entities || []) {
				const name = safeName(entity?.name) || 'unknown'
				counts.set(name, (counts.get(name) || 0) + 1)
			}
			return Array.from(counts, function (entry) {
				return { name: entry[0], reason: 'captured', count: entry[1] }
			}).sort(function (left, right) {
				return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
			})
		}
	}
})
