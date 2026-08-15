ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init() {
		const TRANSFORM_KEY = Symbol.for('cattail.world-editor.blueprint-transform')
		const STATE_KEY = Symbol.for('cattail.world-editor.blueprint-state')
		const PAINTED_KEY = Symbol.for('cattail.world-editor.blueprint-painted')
		const IDENTITY = Object.freeze([1, 0, 0, 1])
		const ROTATE_CW = Object.freeze([0, -1, 1, 0])
		const ROTATE_CCW = Object.freeze([0, 1, -1, 0])
		const MIRROR_U = Object.freeze([1, 0, 0, -1])
		const MIRROR_V = Object.freeze([-1, 0, 0, 1])

		const previous = globalThis[TRANSFORM_KEY]
		if (previous && typeof previous.dispose === 'function') previous.dispose('transform-replaced')

		let source = null
		let baseBlueprint = null
		let blueprint = null
		let pivot = null
		let quarterTurns = 0
		let mirrorU = false
		let mirrorV = false
		let matrix = IDENTITY
		let projected = false
		let executionMode = 'structure'
		let revision = 0
		let sourceRevision = 0
		let lastCommand = null
		let disposed = false
		let transformCount = 0
		let lastTransformMs = 0
		let maxTransformMs = 0
		const listeners = new Set()

		const controller = Object.freeze({
			version: '0.5.1',
			snapshot,
			bind(nextSource, reason) {
				if (disposed || nextSource === source) return false
				source = validSource(nextSource) ? nextSource : null
				baseBlueprint = source ? executionView(source, executionMode) : null
				pivot = baseBlueprint ? transformPivot(baseBlueprint) : null
				quarterTurns = 0
				mirrorU = false
				mirrorV = false
				matrix = IDENTITY
				projected = !!(source?.mode === 'full' && baseBlueprint?.mode === 'structure')
				blueprint = baseBlueprint
				lastCommand = source ? 'bind' : 'clear'
				sourceRevision += 1
				revision += 1
				notify()
				logReason(reason)
				return true
			},
			setExecutionMode(nextMode, reason) {
				if (disposed || (nextMode !== 'structure' && nextMode !== 'full')) return false
				const resolved = nextMode === 'full' && source?.mode === 'full' ? 'full' : 'structure'
				if (executionMode === resolved && (!source || baseBlueprint?.mode === resolved)) return false
				executionMode = resolved
				baseBlueprint = source ? executionView(source, executionMode) : null
				pivot = baseBlueprint ? transformPivot(baseBlueprint) : null
				blueprint = baseBlueprint && !isIdentityState()
					? transformBlueprint(baseBlueprint, pivot, matrix)
					: baseBlueprint
				projected = !!(source?.mode === 'full' && baseBlueprint?.mode === 'structure')
				lastCommand = 'execution-mode-' + executionMode
				revision += 1
				notify()
				logReason(reason)
				return true
			},
			clear(reason) {
				if (disposed || (!source && !baseBlueprint && !blueprint)) return false
				source = null
				baseBlueprint = null
				blueprint = null
				pivot = null
				quarterTurns = 0
				mirrorU = false
				mirrorV = false
				matrix = IDENTITY
				projected = false
				executionMode = 'structure'
				lastCommand = 'clear'
				sourceRevision += 1
				revision += 1
				notify()
				logReason(reason)
				return true
			},
			rotateClockwise(reason) {
				return applyCommand('rotate-clockwise', reason)
			},
			rotateCounterclockwise(reason) {
				return applyCommand('rotate-counterclockwise', reason)
			},
			mirrorU(reason) {
				return applyCommand('mirror-u', reason)
			},
			mirrorV(reason) {
				return applyCommand('mirror-v', reason)
			},
			restore(value, reason) {
				if (disposed || !baseBlueprint || !pivot) return false
				const next = normalizeRestoredState(value)
				if (quarterTurns === next.quarterTurns && mirrorU === next.mirrorU && mirrorV === next.mirrorV) return false
				quarterTurns = next.quarterTurns
				mirrorU = next.mirrorU
				mirrorV = next.mirrorV
				matrix = stateMatrix(quarterTurns, mirrorU, mirrorV)
				const started = now()
				blueprint = isIdentityState()
					? baseBlueprint
					: transformBlueprint(baseBlueprint, pivot, matrix)
				lastTransformMs = Math.max(0, now() - started)
				maxTransformMs = Math.max(maxTransformMs, lastTransformMs)
				transformCount += 1
				lastCommand = 'restore'
				revision += 1
				notify()
				logReason(reason)
				return true
			},
			reset(reason) {
				return applyCommand('reset', reason)
			},
			subscribe(listener) {
				if (typeof listener !== 'function') throw new TypeError('World Editor transform listener must be a function.')
				if (disposed) return function () {}
				listeners.add(listener)
				listener(snapshot())
				return function () {
					listeners.delete(listener)
				}
			},
			dispose(reason) {
				if (disposed) return false
				disposed = true
				source = null
				baseBlueprint = null
				blueprint = null
				pivot = null
				listeners.clear()
				if (globalThis[TRANSFORM_KEY] === controller) delete globalThis[TRANSFORM_KEY]
				logReason(reason)
				return true
			}
		})

		Object.defineProperty(globalThis, TRANSFORM_KEY, {
			value: controller,
			configurable: true,
			writable: true
		})

		function snapshot() {
			const normalizedMatrix = Object.freeze(matrix.slice())
			const normalizedPivot = pivot ? Object.freeze(pivot.slice()) : null
			return Object.freeze({
				version: '0.5.1',
				source,
				blueprint,
				sourceMode: source?.mode || null,
				executionMode: blueprint?.mode || executionMode,
				projected,
				pivot: normalizedPivot,
				rotation: quarterTurns * 90,
				quarterTurns,
				mirrorU,
				mirrorV,
				matrix: normalizedMatrix,
				identity: isIdentityState(),
				lastCommand,
				revision,
				sourceRevision,
				performance: Object.freeze({
					transformCount,
					lastTransformMs,
					maxTransformMs
				}),
				disposed
			})
		}

		function applyCommand(command, reason) {
			if (disposed || !baseBlueprint || !pivot) return false
			if (command === 'reset' && isIdentityState()) return false
			if (command === 'rotate-clockwise') {
				const previousU = mirrorU
				mirrorU = mirrorV
				mirrorV = previousU
				quarterTurns = (quarterTurns + 1) % 4
			} else if (command === 'rotate-counterclockwise') {
				const previousU = mirrorU
				mirrorU = mirrorV
				mirrorV = previousU
				quarterTurns = (quarterTurns + 3) % 4
			} else if (command === 'mirror-u') {
				mirrorU = !mirrorU
			} else if (command === 'mirror-v') {
				mirrorV = !mirrorV
			} else if (command === 'reset') {
				quarterTurns = 0
				mirrorU = false
				mirrorV = false
			} else {
				return false
			}

			matrix = stateMatrix(quarterTurns, mirrorU, mirrorV)
			const started = now()
			blueprint = isIdentityState()
				? baseBlueprint
				: transformBlueprint(baseBlueprint, pivot, matrix)
			lastTransformMs = Math.max(0, now() - started)
			maxTransformMs = Math.max(maxTransformMs, lastTransformMs)
			transformCount += 1
			lastCommand = command
			revision += 1
			notify()
			logReason(reason)
			return true
		}

		function notify() {
			const state = snapshot()
			for (const listener of Array.from(listeners)) {
				try {
					listener(state)
				} catch (error) {
					console.warn('[Cattail World Editor] Blueprint transform listener failed.', error)
				}
			}
		}

		function logReason(reason) {
			if (!reason) return
			console.info('[Cattail World Editor] Blueprint transform ' + lastCommand + ' (' + reason + ').')
		}

		function isIdentityState() {
			return quarterTurns === 0 && !mirrorU && !mirrorV
		}

		function normalizeRestoredState(value) {
			const rawRotation = Number(value?.rotation)
			const quarterTurnsFromRotation = Number.isInteger(rawRotation) && rawRotation % 90 === 0
				? rawRotation / 90
				: 0
			const rawQuarterTurns = Number(value?.quarterTurns)
			const turns = Number.isInteger(rawQuarterTurns) ? rawQuarterTurns : quarterTurnsFromRotation
			return Object.freeze({
				quarterTurns: ((turns % 4) + 4) % 4,
				mirrorU: value?.mirrorU === true,
				mirrorV: value?.mirrorV === true
			})
		}

		function stateMatrix(turns, reflectU, reflectV) {
			let result = rotationMatrix(turns)
			if (reflectU) result = multiply(MIRROR_U, result)
			if (reflectV) result = multiply(MIRROR_V, result)
			return Object.freeze(result)
		}

		function rotationMatrix(turns) {
			const normalized = ((Number(turns) % 4) + 4) % 4
			if (normalized === 1) return ROTATE_CW
			if (normalized === 2) return Object.freeze([-1, 0, 0, -1])
			if (normalized === 3) return ROTATE_CCW
			return IDENTITY
		}

		function multiply(left, right) {
			return [
				left[0] * right[0] + left[1] * right[2],
				left[0] * right[1] + left[1] * right[3],
				left[2] * right[0] + left[3] * right[2],
				left[2] * right[1] + left[3] * right[3]
			]
		}

		function executionView(value, desiredMode) {
			if (!(desiredMode === 'structure' && value?.mode === 'full')) return value
			const stateService = globalThis[STATE_KEY]
			const normalized = typeof stateService?.normalizeBlueprint === 'function'
				? stateService.normalizeBlueprint(value)
				: value
			const effective = desiredMode === 'structure' && normalized?.mode === 'full' && typeof stateService?.projectStructure === 'function'
				? stateService.projectStructure(normalized)
				: normalized
			return freezeContainer(Object.assign({}, normalized, {
				...effective,
				entities: Object.freeze((effective.entities || []).map(freezeContainer)),
				blocks: Object.freeze((effective.blocks || []).map(freezeContainer)),
				paintedCubes: Object.freeze((effective.paintedCubes || []).map(freezeContainer)),
				surges: Object.freeze((effective.surges || []).map(freezeContainer)),
				emptyCells: Object.freeze((effective.emptyCells || []).map(function (position) {
					return Object.freeze(position.slice())
				})),
				neutralCells: Object.freeze((effective.neutralCells || []).map(function (position) {
					return Object.freeze(position.slice())
				}))
			}))
		}

		function projectedSummary(sourceSummary, entities) {
			const counts = new Map()
			for (const entity of entities) {
				const name = String(entity?.name || 'unknown')
				counts.set(name, (counts.get(name) || 0) + 1)
			}
			const capturedTypes = Array.from(counts).map(function (entry) {
				return Object.freeze({ name: entry[0], reason: 'captured', count: entry[1] })
			}).sort(function (left, right) {
				return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
			})
			const skippedTypes = Array.isArray(sourceSummary?.skippedTypes)
				? sourceSummary.skippedTypes.filter(function (entry) {
					return String(entry?.name || '') !== 'cube'
				})
				: []
			const frozenSkipped = Object.freeze(skippedTypes.slice())
			return freezeContainer({
				selectionCount: nonNegativeInteger(sourceSummary?.selectionCount, 0),
				selectedCellCount: nonNegativeInteger(sourceSummary?.selectedCellCount, 0),
				entityCount: entities.length,
				blockCount: 0,
				crossBoundaryCount: nonNegativeInteger(sourceSummary?.crossBoundaryCount, 0),
				skippedCount: skippedTypes.reduce(function (sum, entry) {
					return sum + nonNegativeInteger(entry?.count, 0)
				}, 0),
				capturedTypes: Object.freeze(capturedTypes),
				skippedTypes: frozenSkipped
			})
		}

		function transformBlueprint(value, center, transformMatrix) {
			const selections = Array.isArray(value.selections)
				? value.selections.map(function (selection) {
					const start = transformPoint(selection?.start, center, transformMatrix)
					const end = transformPoint(selection?.end, center, transformMatrix)
					const bounds = transformBounds(selection?.min, selection?.max, center, transformMatrix)
					return freezeContainer(Object.assign({}, selection, {
						start,
						end,
						min: bounds.min,
						max: bounds.max,
						width: safeDimension(bounds.min[0], bounds.max[0]),
						height: safeDimension(bounds.min[1], bounds.max[1])
					}))
				})
				: []
			const entities = value.entities.map(function (entity) {
				const footprint = transformBounds(
					entity?.footprint?.min || entity?.position,
					entity?.footprint?.max || entity?.position,
					center,
					transformMatrix
				)
				return freezeContainer(Object.assign({}, entity, {
					position: transformPoint(entity.position, center, transformMatrix),
					footprint: freezeContainer(Object.assign({}, entity.footprint, {
						min: footprint.min,
						max: footprint.max
					}))
				}))
			})
			const blocks = (value.blocks || []).map(function (block) {
				return freezeContainer(Object.assign({}, block, {
					position: transformPoint(block.position, center, transformMatrix)
				}))
			})
			const paintedService = globalThis[PAINTED_KEY]
			const paintedCubes = (value.paintedCubes || []).map(function (record) {
				const transformed = paintedService?.transformRecord?.(record, function (position) {
					return transformPoint(position, center, transformMatrix)
				})
				if (!transformed) throw new TypeError('World Editor transform requires a valid painted cube record.')
				return freezeContainer(transformed)
			})
			const surges = (value.surges || []).map(function (surge) {
				const stabilizerPosition = normalizePoint(surge?.stabilizer?.position)
				return freezeContainer(Object.assign({}, surge, {
					position: transformPoint(surge.position, center, transformMatrix),
					...(stabilizerPosition ? {
						stabilizer: freezeContainer({
							position: transformPoint(stabilizerPosition, center, transformMatrix)
						})
					} : {})
				}))
			})
			const supportsEmptyCells = (
				Number(value.schemaVersion) === 4 && value.mode === 'structure'
			) || (
				(Number(value.schemaVersion) === 5 || Number(value.schemaVersion) === 6 || Number(value.schemaVersion) === 7 || Number(value.schemaVersion) === 8) && value.mode === 'full'
			)
			const emptyCells = supportsEmptyCells && Array.isArray(value.emptyCells)
				? value.emptyCells.map(function (position) {
					return transformPoint(position, center, transformMatrix)
				}).sort(comparePositions)
				: []
			const neutralCells = Array.isArray(value.neutralCells)
				? value.neutralCells.map(function (position) {
					return transformPoint(position, center, transformMatrix)
				}).sort(comparePositions)
				: []
			const contentBounds = value.contentBounds
				? boundsWithSize(transformBounds(value.contentBounds.min, value.contentBounds.max, center, transformMatrix))
				: contentBoundsFromEntities(entities)
			return freezeContainer(Object.assign({}, value, {
				selections: Object.freeze(selections),
				emptyCells: Object.freeze(emptyCells),
				neutralCells: Object.freeze(neutralCells),
				contentBounds,
				entities: Object.freeze(entities),
				blocks: Object.freeze(blocks),
				paintedCubes: Object.freeze(paintedCubes),
				surges: Object.freeze(surges)
			}))
		}

		function transformPivot(value) {
			const bounds = selectionBounds(value.selections) || value.contentBounds || contentBoundsFromEntities(value.entities)
			const min = normalizePoint(bounds?.min)
			const max = normalizePoint(bounds?.max)
			if (!min || !max) return Object.freeze([0, 0])
			return Object.freeze([
				Math.ceil(safeIntegerAdd(Math.min(min[0], max[0]), Math.max(min[0], max[0])) / 2),
				Math.ceil(safeIntegerAdd(Math.min(min[1], max[1]), Math.max(min[1], max[1])) / 2)
			])
		}

		function selectionBounds(selections) {
			let result = null
			for (const selection of selections || []) {
				const min = normalizePoint(selection?.min)
				const max = normalizePoint(selection?.max)
				if (!min || !max) continue
				result = includeBounds(result, min, max)
			}
			return result && boundsWithSize(result)
		}

		function contentBoundsFromEntities(entities) {
			let result = null
			for (const entity of entities || []) {
				const min = normalizePoint(entity?.footprint?.min || entity?.position)
				const max = normalizePoint(entity?.footprint?.max || entity?.position)
				if (!min || !max) continue
				result = includeBounds(result, min, max)
			}
			return result ? boundsWithSize(result) : null
		}

		function includeBounds(current, min, max) {
			const minU = Math.min(min[0], max[0])
			const maxU = Math.max(min[0], max[0])
			const minV = Math.min(min[1], max[1])
			const maxV = Math.max(min[1], max[1])
			if (!current) {
				return {
					min: [minU, minV],
					max: [maxU, maxV]
				}
			}
			return {
				min: [Math.min(current.min[0], minU), Math.min(current.min[1], minV)],
				max: [Math.max(current.max[0], maxU), Math.max(current.max[1], maxV)]
			}
		}

		function transformBounds(minValue, maxValue, center, transformMatrix) {
			const min = normalizePoint(minValue)
			const max = normalizePoint(maxValue)
			if (!min || !max) throw new TypeError('World Editor transform requires integer bounds.')
			const corners = [
				transformPoint([min[0], min[1]], center, transformMatrix),
				transformPoint([max[0], min[1]], center, transformMatrix),
				transformPoint([max[0], max[1]], center, transformMatrix),
				transformPoint([min[0], max[1]], center, transformMatrix)
			]
			return freezeContainer({
				min: Object.freeze([
					Math.min.apply(null, corners.map(function (point) { return point[0] })),
					Math.min.apply(null, corners.map(function (point) { return point[1] }))
				]),
				max: Object.freeze([
					Math.max.apply(null, corners.map(function (point) { return point[0] })),
					Math.max.apply(null, corners.map(function (point) { return point[1] }))
				])
			})
		}

		function transformPoint(value, center, transformMatrix) {
			const point = normalizePoint(value)
			const normalizedCenter = normalizePoint(center)
			if (!point || !normalizedCenter) throw new TypeError('World Editor transform requires safe integer positions.')
			const relativeU = safeIntegerSubtract(point[0], normalizedCenter[0])
			const relativeV = safeIntegerSubtract(point[1], normalizedCenter[1])
			const transformedU = safeIntegerAdd(
				safeIntegerMultiply(transformMatrix[0], relativeU),
				safeIntegerMultiply(transformMatrix[1], relativeV)
			)
			const transformedV = safeIntegerAdd(
				safeIntegerMultiply(transformMatrix[2], relativeU),
				safeIntegerMultiply(transformMatrix[3], relativeV)
			)
			return Object.freeze([
				safeIntegerAdd(normalizedCenter[0], transformedU),
				safeIntegerAdd(normalizedCenter[1], transformedV)
			])
		}

		function boundsWithSize(bounds) {
			if (!bounds) return null
			return freezeContainer({
				min: Object.freeze(bounds.min.slice()),
				max: Object.freeze(bounds.max.slice()),
				width: safeDimension(bounds.min[0], bounds.max[0]),
				height: safeDimension(bounds.min[1], bounds.max[1])
			})
		}

		function normalizePoint(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function validSource(value) {
			const schemaVersion = Number(value?.schemaVersion)
			const stateService = globalThis[STATE_KEY]
			if (
				typeof stateService?.inspectStructure === 'function' &&
				stateService.inspectStructure(value)?.valid !== true
			) return false
			if (
				typeof stateService?.inspectBlueprint === 'function' &&
				stateService.inspectBlueprint(value)?.valid !== true
			) return false
			const paintedService = globalThis[PAINTED_KEY]
			const paintedRequired = schemaVersion === 7 || (
				schemaVersion === 8 && Array.isArray(value?.paintedCubes) && value.paintedCubes.length > 0
			)
			const paintedValid = !paintedRequired || (
				typeof paintedService?.normalizeLayer === 'function' &&
				Array.isArray(paintedService.normalizeLayer(value))
			)
			return !!value && paintedValid &&
				(schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3 || schemaVersion === 4 || schemaVersion === 5 || schemaVersion === 6 || schemaVersion === 7 || schemaVersion === 8) &&
				(value.mode === 'structure' || value.mode === 'full') &&
				Array.isArray(value.entities) &&
				(schemaVersion !== 4 || value.mode !== 'structure' || Array.isArray(value.emptyCells)) &&
				((schemaVersion !== 5 && schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8) || value.mode !== 'full' || Array.isArray(value.emptyCells)) &&
				((schemaVersion !== 6 && schemaVersion !== 7 && schemaVersion !== 8) || value.mode !== 'full' || Array.isArray(value.surges)) &&
				(schemaVersion !== 7 || (value.mode === 'full' && Array.isArray(value.paintedCubes) && value.paintedCubes.length > 0)) &&
				(schemaVersion !== 8 || (value.mode === 'full' && Array.isArray(value.paintedCubes)))
		}

		function safeDimension(left, right) {
			const min = Math.min(left, right)
			const max = Math.max(left, right)
			return safeIntegerAdd(safeIntegerSubtract(max, min), 1)
		}

		function safeIntegerAdd(left, right) {
			return requireSafeInteger(Number(left) + Number(right))
		}

		function safeIntegerSubtract(left, right) {
			return requireSafeInteger(Number(left) - Number(right))
		}

		function safeIntegerMultiply(left, right) {
			return requireSafeInteger(Number(left) * Number(right))
		}

		function requireSafeInteger(value) {
			if (!Number.isSafeInteger(value)) throw new TypeError('World Editor transform coordinate arithmetic overflowed.')
			return value
		}

		function nonNegativeInteger(value, fallback) {
			const number = Number(value)
			return Number.isInteger(number) && number >= 0 ? number : fallback
		}

		function comparePositions(left, right) {
			return left[1] - right[1] || left[0] - right[0]
		}

		function freezeContainer(value) {
			return Object.freeze(value)
		}

		function now() {
			return typeof performance !== 'undefined' && typeof performance.now === 'function'
				? performance.now()
				: Date.now()
		}
	}
})
