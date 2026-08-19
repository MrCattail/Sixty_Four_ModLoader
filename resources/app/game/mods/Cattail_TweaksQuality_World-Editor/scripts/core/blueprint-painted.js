ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const BLUEPRINT_PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
		const RECORD_KIND = 'painted-cube'
		const SCHEMA_VERSION = 7
		const previous = globalThis[BLUEPRINT_PAINTED_KEY]
		previous?.dispose?.('blueprint-painted-replaced')
		let disposed = false

		const service = Object.freeze({
			version: '1.0.0',
			schemaVersion: SCHEMA_VERSION,
			recordKind: RECORD_KIND,
			ready() {
				return paintService() !== null
			},
			capture(entity, relativePosition) {
				const paint = paintService()
				const position = normalizePosition(relativePosition)
				if (!paint || !position || safeName(entity?.name) !== 'cube') return null
				const save = paint.capturePaintedCubeSave?.(entity, position)
				if (!save) return null
				return canonicalRecord(position, save.par)
			},
			normalizeRecord,
			normalizeLayer,
			transformRecord(value, transformPosition) {
				const record = normalizeRecord(value)
				if (!record || typeof transformPosition !== 'function') return null
				const position = normalizePosition(transformPosition(record.position))
				if (!position) return null
				return normalizeRecord(canonicalRecord(position, record.state))
			},
			matchesEntity(entity, value) {
				const record = normalizeRecord(value)
				const position = normalizePosition(record?.position)
				const paint = paintService()
				if (!record || !position || !paint || safeName(entity?.name) !== 'cube') return false
				const save = paint.capturePaintedCubeSave?.(entity, normalizePosition(entity?.position))
				if (!save) return false
				return stableString(logicalState(save.par, paint)) === stableString(logicalState(record.state, paint))
			},
			captureSave(entity, positionValue) {
				const paint = paintService()
				const position = normalizePosition(positionValue) || normalizePosition(entity?.position)
				if (!paint || !position || safeName(entity?.name) !== 'cube') return null
				return paint.capturePaintedCubeSave?.(entity, position) || null
			},
			matchesMaterializedEntity(entity, saveValue) {
				const paint = paintService()
				const position = normalizePosition(entity?.position)
				const intended = saveValue?.par && typeof saveValue.par === 'object' ? saveValue.par : null
				const actualSave = paint && position ? paint.capturePaintedCubeSave?.(entity, position) : null
				if (!paint || !intended || !actualSave) return false
				const actual = actualSave.par
				const intendedPaint = paint.normalizePaint(intended)
				const actualPaint = paint.normalizePaint(actual)
				if (intendedPaint?.version !== paint.growPaintVersion) {
					return stableString(actual) === stableString(intended)
				}
				if (
					actualPaint?.version !== paint.growPaintVersion ||
					!paint.matchesGrowProgress?.(actualPaint, intendedPaint) ||
					stableString(actual.resources) !== stableString(intended.resources) ||
					Number(actual.broken) !== Number(intended.broken)
				) return false
				const intendedStable = intendedPaint.growth.phase === 'stable' && Number(intended.state) === 2
				return intendedStable
					? actualPaint.growth.phase === 'stable' && Number(actual.state) === 2
					: Number(actual.state) >= 0 && Number(actual.state) <= 2
			},
			materializeRecords(values, placementToken) {
				const records = Array.isArray(values) ? values.map(normalizeRecord) : null
				const token = String(placementToken || '')
				if (!records || records.some(function (record) { return !record }) || token.length < 8) return null
				const paint = paintService()
				if (!paint) return null
				const lineages = new Map()
				for (const record of records) {
					const marker = paint.normalizePaint?.(record.state)
					if (marker?.version !== paint.growPaintVersion) continue
					const source = marker.growth.lineage
					if (!lineages.has(source)) {
						lineages.set(source, freshLineage(token, source, lineages.size))
					}
				}
				return records.map(function (record) {
					return materializeRecord(record, lineages, paint)
				})
			},
			dispose() {
				if (disposed) return false
				disposed = true
				if (globalThis[BLUEPRINT_PAINTED_KEY] === service) delete globalThis[BLUEPRINT_PAINTED_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, BLUEPRINT_PAINTED_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		function paintService() {
			const paint = globalThis[PAINT_KEY]
			return paint && typeof paint.normalizePaint === 'function' && typeof paint.capturePaintedCubeSave === 'function'
				? paint
				: null
		}

		function normalizeRecord(value) {
			const paint = paintService()
			const position = normalizePosition(value?.position)
			if (
				!paint ||
				!value ||
				value.kind !== RECORD_KIND ||
				value.name !== 'cube' ||
				!position ||
				!value.state ||
				typeof value.state !== 'object' ||
				Array.isArray(value.state)
			) return null
			const entity = Object.assign({ name: 'cube', position }, jsonClone(value.state))
			const save = paint.capturePaintedCubeSave(entity, position)
			if (!save) return null
			const canonical = canonicalRecord(position, save.par)
			return stableString(value) === stableString(canonical) ? canonical : null
		}

		function normalizeLayer(blueprint) {
			if (
				!paintService() ||
				(Number(blueprint?.schemaVersion) !== SCHEMA_VERSION && Number(blueprint?.schemaVersion) !== 8) ||
				blueprint?.mode !== 'full' ||
				!Array.isArray(blueprint.paintedCubes) ||
				blueprint.paintedCubes.length < 1
			) return null
			const occupied = new Set()
			for (const layer of [blueprint.blocks, blueprint.surges, blueprint.emptyCells]) {
				if (!Array.isArray(layer)) return null
				for (const entry of layer) {
					const position = normalizePosition(Array.isArray(entry) ? entry : entry?.position)
					if (!position) return null
					occupied.add(cellKey(position))
				}
			}
			const seen = new Set()
			const records = []
			for (const value of blueprint.paintedCubes) {
				const record = normalizeRecord(value)
				if (!record) return null
				const key = cellKey(record.position)
				if (seen.has(key) || occupied.has(key)) return null
				seen.add(key)
				records.push(record)
			}
			return records
		}

		function materializeRecord(record, lineages, paint) {
			const state = jsonClone(record.state)
			const marker = paint.normalizePaint(state)
			if (marker?.version === paint.growPaintVersion) {
				const stable = marker.growth.phase === 'stable' && Number(state.state) === 2
				state.state = stable ? 2 : 0
				state.fill = stable ? paint.slots : 0
				state.unveilProgress = stable ? 1 : 0
				state.worldEditorPaint = Object.assign({}, marker, {
					growth: {
						version: marker.growth.version,
						lineage: lineages.get(marker.growth.lineage),
						phase: stable ? 'stable' : 'growing',
						durationMs: marker.growth.durationMs,
						elapsedMs: stable ? marker.growth.durationMs : 0
					}
				})
			}
			return normalizeRecord(canonicalRecord(record.position, state))
		}

		function logicalState(value, paint) {
			const state = jsonClone(value)
			const marker = paint.normalizePaint(state)
			if (marker?.version !== paint.growPaintVersion) return state
			const stable = marker.growth.phase === 'stable' && Number(state.state) === 2
			state.state = stable ? 2 : 0
			state.fill = stable ? paint.slots : 0
			state.unveilProgress = stable ? 1 : 0
			state.worldEditorPaint = Object.assign({}, marker, {
				growth: {
					version: marker.growth.version,
					lineage: '<placement-lineage>',
					phase: stable ? 'stable' : 'growing',
					durationMs: marker.growth.durationMs,
					elapsedMs: 0
				}
			})
			return state
		}

		function canonicalRecord(position, state) {
			return {
				kind: RECORD_KIND,
				name: 'cube',
				position: position.slice(),
				state: jsonClone(state)
			}
		}

		function freshLineage(token, source, index) {
			return 'we-grow-' + hashString(token + '|' + source + '|' + index).toString(16).padStart(8, '0') + '-' + index.toString(36)
		}

		function hashString(value) {
			let hash = 2166136261
			for (const symbol of String(value || '')) {
				hash ^= symbol.codePointAt(0)
				hash = Math.imul(hash, 16777619)
			}
			return hash >>> 0
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length !== 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function cellKey(position) {
			return position[0] + ':' + position[1]
		}

		function safeName(value) {
			return String(value || '').trim().toLowerCase()
		}

		function stableString(value) {
			if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']'
			if (!value || typeof value !== 'object') return JSON.stringify(value)
			return '{' + Object.keys(value).sort().map(function (key) {
				return JSON.stringify(key) + ':' + stableString(value[key])
			}).join(',') + '}'
		}

		function jsonClone(value) {
			if (value === undefined) return undefined
			return JSON.parse(JSON.stringify(value))
		}
	}
})
