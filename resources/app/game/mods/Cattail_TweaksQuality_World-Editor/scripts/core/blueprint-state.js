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
			version: '0.4.5',
			normalizePar,
			normalizeSave,
			normalizeSaveDetailed,
			normalizeBlueprint,
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
				(schemaVersion !== 3 && schemaVersion !== 5) ||
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
			if (schemaVersion === 5 && !Array.isArray(blueprint.emptyCells)) blueprint.emptyCells = []
			blueprint.summary = Object.assign({}, blueprint.summary, {
				normalizedCount: Math.max(
					nonNegativeInteger(blueprint.summary?.normalizedCount, 0),
					normalizedCount
				)
			})
			return blueprint
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
	}
})
