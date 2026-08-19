ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const FORMAT_KEY = Symbol.for('cattail.world-editor.blueprint-library-format')
		const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
		const GAME_ID = 'sixty-four'
		const FILE_EXTENSION = '.64schem'
		const LEGACY_FILE_EXTENSION = '.cattail-blueprint.json'
		const FILE_EXTENSIONS = Object.freeze([FILE_EXTENSION, LEGACY_FILE_EXTENSION])
		const LIBRARY_SCHEMA_VERSION = 2
		const LEGACY_LIBRARY_SCHEMA_VERSION = 1
		const MAX_STRUCTURE_DEPTH = 32
		const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
		const previous = globalThis[FORMAT_KEY]
		previous?.dispose?.('blueprint-library-format-replaced')
		let disposed = false

		const service = Object.freeze({
			version: '0.5.1',
			librarySchemaVersion: LIBRARY_SCHEMA_VERSION,
			fileExtension: FILE_EXTENSION,
			legacyFileExtension: LEGACY_FILE_EXTENSION,
			fileExtensions: FILE_EXTENSIONS,
			create,
			parse,
			serialize,
			metadata,
			fileName,
			isFileName,
			utf8Length,
			normalizeDisplayName,
			newId,
			dispose(reason) {
				if (disposed) return false
				disposed = true
				if (globalThis[FORMAT_KEY] === service) delete globalThis[FORMAT_KEY]
				if (reason) console.info('[Cattail World Editor] Blueprint library format disposed (' + reason + ').')
				return true
			}
		})

		Object.defineProperty(globalThis, FORMAT_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		function create(options) {
			const blueprint = normalizeBlueprint(options?.blueprint, 'BLUEPRINT_INVALID')
			if (!validBlueprint(blueprint)) throw formatError('BLUEPRINT_INVALID', 'The blueprint payload is invalid or unsupported.')
			const now = isoTime(options?.modifiedAt || options?.updatedAt || Date.now())
			const createdAt = isoTime(options?.createdAt || now)
			const id = normalizeId(options?.id) || newId()
			return freeze({
				librarySchemaVersion: LIBRARY_SCHEMA_VERSION,
				gameId: GAME_ID,
				id,
				displayName: normalizeDisplayName(options?.displayName),
				createdAt,
				modifiedAt: now,
				defaultTransform: normalizeDefaultTransform(options?.defaultTransform),
				blueprint
			})
		}

		function parse(value) {
			let parsed = value
			if (typeof value === 'string') {
				try {
					parsed = JSON.parse(value)
				} catch (error) {
					throw formatError('CORRUPT', 'The blueprint file is not valid JSON.')
				}
			}
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw formatError('CORRUPT', 'The blueprint file root must be an object.')
			}
			assertSafeStructure(parsed, 'CORRUPT')
			const librarySchemaVersion = Number(parsed.librarySchemaVersion)
			if (![LEGACY_LIBRARY_SCHEMA_VERSION, LIBRARY_SCHEMA_VERSION].includes(librarySchemaVersion)) {
				throw formatError('INCOMPATIBLE', 'The blueprint library file version is not supported.')
			}
			if (String(parsed.gameId || '') !== GAME_ID) {
				throw formatError('INCOMPATIBLE', 'The blueprint belongs to a different game.')
			}
			const id = normalizeId(parsed.id)
			if (!id) throw formatError('CORRUPT', 'The blueprint file has no valid stable ID.')
			const blueprint = normalizeBlueprint(parsed.blueprint, 'CORRUPT')
			if (!validBlueprint(blueprint)) throw formatError('INCOMPATIBLE', 'The blueprint payload schema is not supported.')
			return freeze({
				librarySchemaVersion,
				gameId: GAME_ID,
				id,
				displayName: normalizeDisplayName(parsed.displayName),
				createdAt: isoTime(parsed.createdAt),
				modifiedAt: isoTime(parsed.modifiedAt),
				defaultTransform: librarySchemaVersion >= 2
					? normalizeDefaultTransform(parsed.defaultTransform)
					: normalizeDefaultTransform(null),
				blueprint
			})
		}

		function serialize(value) {
			const envelope = Number(value?.librarySchemaVersion) === LIBRARY_SCHEMA_VERSION
				? parse(value)
				: create(value)
			return JSON.stringify(envelope, null, 2)
		}

		function metadata(value) {
			const envelope = parse(value)
			const blueprint = envelope.blueprint || {}
			const bounds = blueprint.contentBounds || {}
			const min = normalizePosition(bounds.min)
			const max = normalizePosition(bounds.max)
			const defaultTransform = normalizeDefaultTransform(envelope.defaultTransform)
			const sourceWidth = min && max ? Math.max(0, max[0] - min[0] + 1) : 0
			const sourceHeight = min && max ? Math.max(0, max[1] - min[1] + 1) : 0
			const swapDimensions = defaultTransform.rotation === 90 || defaultTransform.rotation === 270
			return freeze({
				id: envelope.id,
				displayName: envelope.displayName,
				createdAt: envelope.createdAt,
				modifiedAt: envelope.modifiedAt,
				schemaVersion: Number(blueprint.schemaVersion) || 0,
				mode: String(blueprint.mode || ''),
				width: swapDimensions ? sourceHeight : sourceWidth,
				height: swapDimensions ? sourceWidth : sourceHeight,
				defaultTransform,
				entityCount: Array.isArray(blueprint.entities) ? blueprint.entities.length : 0,
				blockCount: Array.isArray(blueprint.blocks) ? blueprint.blocks.length : 0,
				paintedCubeCount: Array.isArray(blueprint.paintedCubes) ? blueprint.paintedCubes.length : 0,
				paintedCompatible: Number(blueprint.schemaVersion) === 7 || Number(blueprint.schemaVersion) === 8,
				surgeCount: Array.isArray(blueprint.surges) ? blueprint.surges.length : 0,
				emptyCellCount: Array.isArray(blueprint.emptyCells) ? blueprint.emptyCells.length : 0
			})
		}

		function fileName(displayNameValue, idValue) {
			const displayName = normalizeDisplayName(displayNameValue)
			const id = normalizeId(idValue) || newId()
			const suffix = '__' + id.replace(/-/g, '') + FILE_EXTENSION
			const safe = truncateUtf8(displayName
				.normalize('NFKC')
				.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
				.replace(/[. ]+$/g, '')
				.replace(/\s+/g, ' ')
				.trim(), 240 - utf8Length(suffix)) || 'Blueprint'
			return safe + suffix
		}

		function isFileName(value) {
			const name = String(value || '').toLowerCase()
			return FILE_EXTENSIONS.some(function (extension) { return name.endsWith(extension) })
		}

		function truncateUtf8(value, maxBytes) {
			let result = ''
			let size = 0
			for (const symbol of String(value || '')) {
				const nextSize = utf8Length(symbol)
				if (size + nextSize > maxBytes) break
				result += symbol
				size += nextSize
			}
			return result.replace(/[. ]+$/g, '')
		}

		function utf8Length(value) {
			let size = 0
			for (const symbol of String(value || '')) {
				const code = symbol.codePointAt(0)
				size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
			}
			return size
		}

		function normalizeDisplayName(value) {
			const text = String(value || '').normalize('NFKC').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
			return text.slice(0, 160) || 'Untitled blueprint'
		}

		function normalizeDefaultTransform(value) {
			const rawRotation = Number(value?.rotation)
			const rotation = Number.isInteger(rawRotation) && rawRotation % 90 === 0
				? ((rawRotation % 360) + 360) % 360
				: 0
			return freeze({
				rotation,
				mirrorU: value?.mirrorU === true,
				mirrorV: value?.mirrorV === true
			})
		}

		function newId() {
			try {
				if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID().toLowerCase()
			} catch (error) {}
			const bytes = new Uint8Array(16)
			try {
				globalThis.crypto?.getRandomValues?.(bytes)
			} catch (error) {
				for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
			}
			bytes[6] = (bytes[6] & 15) | 64
			bytes[8] = (bytes[8] & 63) | 128
			const hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0') }).join('')
			return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
		}

		function normalizeBlueprint(value, errorCode) {
			const state = globalThis[STATE_KEY]
			assertSafeStructure(value, errorCode || 'BLUEPRINT_INVALID')
			const geometry = typeof state?.inspectBlueprint === 'function'
				? state.inspectBlueprint(value)
				: inspectBlueprintGeometry(value)
			if (geometry?.valid !== true) {
				throw formatError(errorCode || 'BLUEPRINT_INVALID', 'The blueprint contains unsafe coordinate geometry.')
			}
			const cloned = clone(value)
			return typeof state?.normalizeBlueprint === 'function' ? state.normalizeBlueprint(cloned) : cloned
		}

		function assertSafeStructure(value, code) {
			const state = globalThis[STATE_KEY]
			const result = typeof state?.inspectStructure === 'function'
				? state.inspectStructure(value)
				: inspectStructure(value)
			if (result?.valid === true) return
			throw formatError(code || 'CORRUPT', 'The blueprint contains an unsafe object structure.')
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
				if (entry.depth > MAX_STRUCTURE_DEPTH || ancestors.has(current)) return { valid: false }
				ancestors.add(current)
				stack.push({ value: current, depth: entry.depth, exit: true })
				for (const key of Object.keys(current)) {
					if (DANGEROUS_KEYS.has(key)) return { valid: false }
					const child = current[key]
					if (child && typeof child === 'object') stack.push({ value: child, depth: entry.depth + 1, exit: false })
				}
			}
			return { valid: true }
		}

		function inspectBlueprintGeometry(value) {
			if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false }
			const schema = Number(value.schemaVersion)
			const supported = value.mode === 'structure'
				? schema >= 1 && schema <= 4
				: value.mode === 'full' && [3, 5, 6, 7, 8].includes(schema)
			if (!supported) return { valid: true }
			const pairs = []
			if (value.anchor?.position !== undefined) pairs.push(value.anchor.position)
			for (const selection of Array.isArray(value.selections) ? value.selections : []) {
				for (const key of ['start', 'end', 'min', 'max']) if (selection?.[key] !== undefined) pairs.push(selection[key])
				if (!optionalSafeInteger(selection?.width, true) || !optionalSafeInteger(selection?.height, true)) return { valid: false }
				if (!safeBounds(selection?.min, selection?.max)) return { valid: false }
			}
			if (value.contentBounds !== null && value.contentBounds !== undefined) {
				pairs.push(value.contentBounds?.min, value.contentBounds?.max)
				if (!optionalSafeInteger(value.contentBounds?.width, true) || !optionalSafeInteger(value.contentBounds?.height, true)) return { valid: false }
				if (!safeBounds(value.contentBounds?.min, value.contentBounds?.max)) return { valid: false }
			}
			for (const record of Array.isArray(value.entities) ? value.entities : []) {
				pairs.push(record?.position)
				if (record?.footprint?.min !== undefined) pairs.push(record.footprint.min)
				if (record?.footprint?.max !== undefined) pairs.push(record.footprint.max)
				if (!optionalSafeInteger(record?.footprint?.span, true)) return { valid: false }
				if (!safeBounds(record?.footprint?.min, record?.footprint?.max)) return { valid: false }
				if (record?.footprint?.span !== undefined) {
					const position = normalizePosition(record?.position)
					const span = Number(record.footprint.span)
					if (!position || !safeArithmetic(position[0] - span) || !safeArithmetic(position[0] + span) || !safeArithmetic(position[1] - span) || !safeArithmetic(position[1] + span)) return { valid: false }
				}
			}
			for (const name of ['blocks', 'surges', 'paintedCubes']) {
				for (const record of Array.isArray(value[name]) ? value[name] : []) {
					pairs.push(record?.position)
					if (name === 'surges') pairs.push(record?.stabilizer?.position)
				}
			}
			for (const name of ['emptyCells', 'neutralCells']) {
				for (const position of Array.isArray(value[name]) ? value[name] : []) pairs.push(position)
			}
			return { valid: pairs.every(function (pair) { return normalizePosition(pair) !== null }) }
		}

		function safeBounds(minValue, maxValue) {
			if (minValue === undefined && maxValue === undefined) return true
			const min = normalizePosition(minValue)
			const max = normalizePosition(maxValue)
			if (!min || !max) return false
			for (let axis = 0; axis < 2; axis += 1) {
				const lower = Math.min(min[axis], max[axis])
				const upper = Math.max(min[axis], max[axis])
				if (!safeArithmetic(min[axis] + max[axis])) return false
				if (!safeArithmetic(upper - lower) || !safeArithmetic(upper - lower + 1)) return false
			}
			return true
		}

		function optionalSafeInteger(value, nonNegative) {
			if (value === undefined || value === null) return true
			const number = Number(value)
			return Number.isSafeInteger(number) && (!nonNegative || number >= 0)
		}

		function safeArithmetic(value) {
			return Number.isSafeInteger(value)
		}

		function validBlueprint(value) {
			const schema = Number(value?.schemaVersion)
			if (!value || !Array.isArray(value.entities)) return false
			if (value.mode === 'structure') return schema >= 1 && schema <= 4
			if (value.mode !== 'full' || ![3, 5, 6, 7, 8].includes(schema)) return false
			if (schema >= 5 && !Array.isArray(value.emptyCells)) return false
			if (!Array.isArray(value.blocks)) return false
			if ((schema === 6 || schema === 7 || schema === 8) && !Array.isArray(value.surges)) return false
			if (schema === 7) return Array.isArray(value.paintedCubes) && value.paintedCubes.length > 0
			return schema !== 8 || Array.isArray(value.paintedCubes)
		}

		function normalizeId(value) {
			const text = String(value || '').trim().toLowerCase()
			return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)
				? text
				: ''
		}

		function isoTime(value) {
			const date = new Date(value || Date.now())
			if (!Number.isFinite(date.getTime())) return new Date().toISOString()
			return date.toISOString()
		}

		function normalizePosition(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function formatError(code, message) {
			const error = new Error(message)
			error.name = 'WorldEditorBlueprintFormatError'
			error.code = code
			return error
		}

		function clone(value) {
			if (value === undefined) return undefined
			return JSON.parse(JSON.stringify(value))
		}

		function freeze(value) {
			if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
			for (const entry of Object.values(value)) freeze(entry)
			return Object.freeze(value)
		}
	}
})
