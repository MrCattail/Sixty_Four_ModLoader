ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
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
			const blueprint = jsonClone(value)
			const schemaVersion = Number(blueprint?.schemaVersion)
			if (
				!blueprint ||
				blueprint.mode !== 'full' ||
				(schemaVersion !== 3 && schemaVersion !== 5 && schemaVersion !== 6) ||
				!Array.isArray(blueprint.entities)
			) {
				return blueprint
			}
			const waypointEntries = []
			let normalizedCount = 0
			blueprint.entities = blueprint.entities.map(function (record, index) {
				const next = Object.assign({}, record)
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
			if (schemaVersion === 6 && Array.isArray(blueprint.surges)) {
				blueprint.surges = blueprint.surges.map(normalizeSurge).filter(Boolean)
			} else if (schemaVersion !== 6) {
				blueprint.surges = []
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
			if ((schemaVersion === 5 || schemaVersion === 6) && !Array.isArray(blueprint.emptyCells)) blueprint.emptyCells = []
			blueprint.summary = Object.assign({}, blueprint.summary, {
				surgeCount: Array.isArray(blueprint.surges) ? blueprint.surges.length : 0,
				normalizedCount: Math.max(
					nonNegativeInteger(blueprint.summary?.normalizedCount, 0),
					normalizedCount
				)
			})
			return blueprint
		}

		function normalizeSurge(value) {
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
			return {
				kind: 'surge',
				name: 'surge',
				position,
				state
			}
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
			for (const record of [].concat(source.blocks || [], source.surges || [])) {
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
				surges: [],
				production: jsonClone(source.production),
				summary: Object.assign({}, jsonClone(source.summary || {}), {
					entityCount: entities.length,
					blockCount: 0,
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
			return Number.isInteger(u) && Number.isInteger(v) ? [u, v] : null
		}

		function safeName(value) {
			return typeof value === 'string' ? value.trim() : ''
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
