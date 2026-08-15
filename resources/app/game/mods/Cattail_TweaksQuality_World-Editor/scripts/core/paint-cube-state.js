ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const PAINT_KEY = Symbol.for('cattail.world-editor.paint-cube-state')
		const PAINT_FIELD = 'worldEditorPaint'
		const SERVICE_VERSION = '0.6.0'
		const LEGACY_PAINT_VERSION = 1
		const PAINT_VERSION = 2
		const GROW_PAINT_VERSION = 3
		const RECIPE_VERSION = 1
		const GROWTH_VERSION = 1
		const RESOURCE_SLOTS = 64
		const RESOURCE_COUNT = 10
		const RESOURCE_ID = 0
		const MAX_WEIGHT = 100
		const PAINT_KIND = 'world-editor-painted-cube'
		const REWARD_MODE = 'none'
		const CUBE_MODE = 'stable'
		const GROW_MODE = 'grow'
		const GROW_PHASE = Object.freeze({ growing: 'growing', revealing: 'revealing', stable: 'stable' })
		const DEFAULT_GROW_DURATION_MS = 4000
		const MIN_GROW_DURATION_MS = 1000
		const MAX_GROW_DURATION_MS = 20000
		const GROW_DURATION_STEP_MS = 500
		const GROW_REVEAL_MS = 250
		const LEGACY_GENERATION_ALGORITHM = 'fixed-slots-v1'
		const GENERATION_ALGORITHM = 'largest-remainder-shuffle-v2'

		const previous = globalThis[PAINT_KEY]
		previous?.dispose?.('paint-cube-state-replaced')
		let disposed = false
		let unpatchNoReward = null

		api.on('afterVanillaScripts', function () {
			if (!disposed) installNoRewardPatch()
		})

		api.on('entitySave', function (save, payload) {
			const entity = payload?.entity
			if (disposed || !save || safeName(save.name) !== 'cube' || !entity) return save
			const paint = normalizePaint(entity)
			if (!paint) return save
			const cell = normalizeCell(entity.position) || normalizeCell(save.position)
			return capturePaintedCubeSave(entity, cell, save)
		})

		const service = Object.freeze({
			version: SERVICE_VERSION,
			field: PAINT_FIELD,
			paintVersion: PAINT_VERSION,
			growPaintVersion: GROW_PAINT_VERSION,
			recipeVersion: RECIPE_VERSION,
			growthVersion: GROWTH_VERSION,
			slots: RESOURCE_SLOTS,
			resourceCount: RESOURCE_COUNT,
			resourceId: RESOURCE_ID,
			maxWeight: MAX_WEIGHT,
			defaultGrowDurationMs: DEFAULT_GROW_DURATION_MS,
			minGrowDurationMs: MIN_GROW_DURATION_MS,
			maxGrowDurationMs: MAX_GROW_DURATION_MS,
			growDurationStepMs: GROW_DURATION_STEP_MS,
			growRevealMs: GROW_REVEAL_MS,
			defaultRecipe,
			normalizeRecipe,
			validateRecipe,
			allocateSlots,
			buildResources,
			normalizePaint,
			normalizeGrowDurationMs,
			normalizeGrowLineage,
			isGrowPaint(value) {
				return normalizePaint(value)?.version === GROW_PAINT_VERSION
			},
			sameGrowIdentity,
			matchesGrowProgress,
			updateGrowProgress,
			isPainted(value) {
				return !!normalizePaint(value)
			},
			buildStableCubeState(brokenValue, recipeValue, cellValue) {
				const recipe = normalizeRecipe(recipeValue) || defaultRecipe()
				const cell = normalizeCell(cellValue) || [0, 0]
				return buildStableCubeState(brokenValue, recipe, cell)
			},
			buildStableCubeSave(cellValue, recipeValue) {
				const position = normalizeCell(cellValue)
				const recipe = recipeValue === undefined ? defaultRecipe() : normalizeRecipe(recipeValue)
				if (!position || !recipe) return null
				return {
					name: 'cube',
					position,
					par: buildStableCubeState(0, recipe, position)
				}
			},
			buildGrowCubeState(brokenValue, recipeValue, cellValue, durationValue, lineageValue) {
				const recipe = normalizeRecipe(recipeValue) || defaultRecipe()
				const cell = normalizeCell(cellValue) || [0, 0]
				const durationMs = normalizeGrowDurationMs(durationValue)
				const lineage = normalizeGrowLineage(lineageValue)
				if (!durationMs || !lineage) return null
				return buildGrowCubeState(brokenValue, recipe, cell, durationMs, lineage)
			},
			buildGrowCubeSave(cellValue, recipeValue, durationValue, lineageValue) {
				const position = normalizeCell(cellValue)
				const recipe = recipeValue === undefined ? defaultRecipe() : normalizeRecipe(recipeValue)
				const durationMs = normalizeGrowDurationMs(durationValue)
				const lineage = normalizeGrowLineage(lineageValue)
				if (!position || !recipe || !durationMs || !lineage) return null
				return {
					name: 'cube',
					position,
					par: buildGrowCubeState(0, recipe, position, durationMs, lineage)
				}
			},
			capturePaintedCubeSave(entity, cellValue) {
				return capturePaintedCubeSave(entity, normalizeCell(cellValue) || normalizeCell(entity?.position), null)
			},
			dispose() {
				if (disposed) return false
				disposed = true
				if (typeof unpatchNoReward === 'function') unpatchNoReward()
				unpatchNoReward = null
				if (globalThis[PAINT_KEY] === service) delete globalThis[PAINT_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, PAINT_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		function installNoRewardPatch() {
			try {
				if (typeof Cube === 'undefined' || !Cube.prototype || typeof Cube.prototype.onmousedown !== 'function') {
					console.warn('[Cattail World Editor] Painted cube no-reward patch could not find Cube.onmousedown().')
					return
				}
				if (typeof unpatchNoReward === 'function') unpatchNoReward()
				unpatchNoReward = api.patch(Cube.prototype, 'onmousedown', function (original) {
					return function (...args) {
						if (disposed) return original.apply(this, args)
						if (!normalizePaint(this)) return original.apply(this, args)
						const entity = this
						const master = entity.master
						const previousResources = entity.resources
						const previousCoordinates = entity.resourceCoordinates
						const previousComposition = entity.composition
						const previousConsumers = entity.consumers
						const previousTransfer = master?.createResourceTransfer
						const previousSpark = master?.createResourceSpark
						const suppressTransfer = function () {}
						const suppressSpark = function () {}

						entity.resources = []
						entity.resourceCoordinates = []
						entity.composition = []
						entity.consumers = []
						if (master && typeof previousTransfer === 'function') master.createResourceTransfer = suppressTransfer
						if (master && typeof previousSpark === 'function') master.createResourceSpark = suppressSpark

						try {
							return original.apply(entity, args)
						} finally {
							if (master?.createResourceTransfer === suppressTransfer) master.createResourceTransfer = previousTransfer
							if (master?.createResourceSpark === suppressSpark) master.createResourceSpark = previousSpark
							if (entity.state !== 3 && !entity.killme) {
								entity.resources = previousResources
								entity.resourceCoordinates = previousCoordinates
								entity.composition = previousComposition
								entity.consumers = previousConsumers
							}
						}
					}
				})
			} catch (error) {
				console.warn('[Cattail World Editor] Painted cube no-reward patch could not be installed.', error)
			}
		}

		function buildStableCubeState(brokenValue, recipe, cell) {
			return {
				state: 2,
				fill: RESOURCE_SLOTS,
				broken: normalizeBroken(brokenValue),
				resources: buildResources(recipe, cell),
				[PAINT_FIELD]: canonicalPaint(recipe, cell)
			}
		}

		function buildGrowCubeState(brokenValue, recipe, cell, durationMs, lineage) {
			return {
				state: 0,
				fill: 0,
				unveilProgress: 0,
				broken: normalizeBroken(brokenValue),
				resources: buildResources(recipe, cell),
				[PAINT_FIELD]: canonicalGrowPaint(recipe, cell, {
					version: GROWTH_VERSION,
					lineage,
					phase: GROW_PHASE.growing,
					durationMs,
					elapsedMs: 0
				})
			}
		}

		function capturePaintedCubeSave(entity, cellValue, baseSave) {
			const cell = normalizeCell(cellValue)
			const paint = normalizePaint(entity)
			if (!entity || !cell || !paint) return null
			const resources = normalizeResources(entity.resources) || resourcesForPaint(paint, cell)
			if (!resources) return null
			if (paint.version !== GROW_PAINT_VERSION) {
				return Object.assign({}, baseSave || {}, {
					name: 'cube',
					position: cell,
					par: Object.assign({}, baseSave?.par, {
						state: 2,
						fill: RESOURCE_SLOTS,
						broken: normalizeBroken(entity.broken),
						resources,
						[PAINT_FIELD]: paint
					})
				})
			}
			const state = normalizeGrowState(entity.state)
			if (state === null) return null
			const durationMs = paint.growth.durationMs
			const fillDurationMs = Math.max(0, durationMs - GROW_REVEAL_MS)
			let phase = GROW_PHASE.growing
			let elapsedMs = normalizeElapsedMs(paint.growth.elapsedMs, durationMs)
			let fill = normalizeFill(entity.fill)
			let unveilProgress = normalizeUnveilProgress(entity.unveilProgress)
			if (state === 0) {
				phase = GROW_PHASE.growing
				elapsedMs = Math.min(fillDurationMs, elapsedMs)
				fill = Math.min(RESOURCE_SLOTS, Math.max(fill, fillDurationMs ? RESOURCE_SLOTS * elapsedMs / fillDurationMs : RESOURCE_SLOTS))
				unveilProgress = 0
			} else if (state === 1) {
				phase = GROW_PHASE.revealing
				fill = RESOURCE_SLOTS
				elapsedMs = Math.min(durationMs, Math.max(fillDurationMs, Math.round(fillDurationMs + unveilProgress * GROW_REVEAL_MS)))
			} else {
				phase = GROW_PHASE.stable
				fill = RESOURCE_SLOTS
				unveilProgress = 1
				elapsedMs = durationMs
			}
			const nextPaint = canonicalGrowPaint(paint.recipe, paint.generated.seed, {
				version: GROWTH_VERSION,
				lineage: paint.growth.lineage,
				phase,
				durationMs,
				elapsedMs
			})
			return Object.assign({}, baseSave || {}, {
				name: 'cube',
				position: cell,
				par: Object.assign({}, baseSave?.par, {
					state,
					fill,
					unveilProgress,
					broken: normalizeBroken(entity.broken),
					resources,
					[PAINT_FIELD]: nextPaint
				})
			})
		}

		function defaultRecipe() {
			return {
				version: RECIPE_VERSION,
				weights: [{ resource: RESOURCE_ID, weight: MAX_WEIGHT }],
				totalWeight: MAX_WEIGHT
			}
		}

		function normalizeRecipe(value) {
			const candidate = value?.recipe && !Array.isArray(value?.weights) ? value.recipe : value
			const weights = Array.isArray(candidate) ? candidate : candidate?.weights
			if (!Array.isArray(weights)) return null
			const byResource = new Map()
			for (let index = 0; index < weights.length; index += 1) {
				const entry = typeof weights[index] === 'number'
					? { resource: index, weight: weights[index] }
					: weights[index]
				const resource = Number(entry?.resource)
				const weight = Number(entry?.weight)
				if (
					!Number.isInteger(resource) ||
					resource < 0 ||
					resource >= RESOURCE_COUNT ||
					!Number.isInteger(weight) ||
					weight < 0 ||
					weight > MAX_WEIGHT ||
					byResource.has(resource)
				) return null
				byResource.set(resource, weight)
			}
			const normalized = Array.from(byResource.entries())
				.filter(function (entry) { return entry[1] > 0 })
				.sort(function (left, right) { return left[0] - right[0] })
				.map(function (entry) { return { resource: entry[0], weight: entry[1] } })
			if (!normalized.length) return null
			return {
				version: RECIPE_VERSION,
				weights: normalized,
				totalWeight: normalized.reduce(function (sum, entry) { return sum + entry.weight }, 0)
			}
		}

		function validateRecipe(value) {
			if (!value || value.version !== RECIPE_VERSION) return null
			const normalized = normalizeRecipe(value)
			if (!normalized || stableString(value) !== stableString(normalized)) return null
			return normalized
		}

		function allocateSlots(recipeValue) {
			const recipe = normalizeRecipe(recipeValue)
			if (!recipe) return null
			const counts = new Array(RESOURCE_COUNT).fill(0)
			const remainders = recipe.weights.map(function (entry) {
				const numerator = entry.weight * RESOURCE_SLOTS
				const slots = Math.floor(numerator / recipe.totalWeight)
				counts[entry.resource] = slots
				return { resource: entry.resource, remainder: numerator % recipe.totalWeight }
			})
			let remaining = RESOURCE_SLOTS - counts.reduce(function (sum, count) { return sum + count }, 0)
			remainders.sort(function (left, right) {
				return right.remainder - left.remainder || left.resource - right.resource
			})
			for (let index = 0; index < remaining; index += 1) {
				counts[remainders[index].resource] += 1
			}
			return counts
		}

		function buildResources(recipeValue, cellValue) {
			const recipe = normalizeRecipe(recipeValue)
			const cell = normalizeCell(cellValue)
			if (!recipe || !cell) return null
			const counts = allocateSlots(recipe)
			const resources = []
			for (let resource = 0; resource < counts.length; resource += 1) {
				for (let index = 0; index < counts[resource]; index += 1) resources.push(resource)
			}
			const random = seededRandom(cellSeed(cell, recipe))
			for (let index = resources.length - 1; index > 0; index -= 1) {
				const swap = Math.floor(random() * (index + 1))
				const held = resources[index]
				resources[index] = resources[swap]
				resources[swap] = held
			}
			return resources
		}

		function normalizePaint(value) {
			const candidate = paintCandidate(value)
			if (!candidate || typeof candidate !== 'object') return null
			if (
				candidate.kind !== PAINT_KIND ||
				candidate.reward !== REWARD_MODE
			) return null
			if (candidate.version === LEGACY_PAINT_VERSION) {
				if (candidate.mode !== CUBE_MODE) return null
				const legacy = canonicalLegacyPaint()
				return stableString(candidate) === stableString(legacy) ? legacy : null
			}
			if (candidate.version !== PAINT_VERSION && candidate.version !== GROW_PAINT_VERSION) return null
			const recipe = validateRecipe(candidate.recipe)
			const seed = normalizeSeed(candidate.generated?.seed)
			if (!recipe || !seed) return null
			if (candidate.version === GROW_PAINT_VERSION) {
				if (candidate.mode !== GROW_MODE) return null
				const growth = normalizeGrowth(candidate.growth)
				if (!growth) return null
				const canonical = canonicalGrowPaint(recipe, seed, growth)
				return stableString(candidate) === stableString(canonical) ? canonical : null
			}
			if (candidate.mode !== CUBE_MODE) return null
			const canonical = canonicalPaint(recipe, seed)
			return stableString(candidate) === stableString(canonical) ? canonical : null
		}

		function paintCandidate(value) {
			if (!value || typeof value !== 'object') return null
			if (value.kind === PAINT_KIND) return value
			return value[PAINT_FIELD] || value.par?.[PAINT_FIELD] || value.state?.[PAINT_FIELD] || null
		}

		function canonicalLegacyPaint() {
			return {
				version: LEGACY_PAINT_VERSION,
				kind: PAINT_KIND,
				reward: REWARD_MODE,
				mode: CUBE_MODE,
				recipe: {
					version: RECIPE_VERSION,
					weights: [{ resource: RESOURCE_ID, weight: 1 }],
					totalWeight: 1
				},
				generated: {
					algorithm: LEGACY_GENERATION_ALGORITHM,
					slots: RESOURCE_SLOTS
				}
			}
		}

		function canonicalPaint(recipeValue, cellValue) {
			const recipe = validateRecipe(recipeValue) || normalizeRecipe(recipeValue) || defaultRecipe()
			const seed = normalizeSeed(cellValue) || cellSeed(normalizeCell(cellValue) || [0, 0])
			return {
				version: PAINT_VERSION,
				kind: PAINT_KIND,
				reward: REWARD_MODE,
				mode: CUBE_MODE,
				recipe,
				generated: {
					algorithm: GENERATION_ALGORITHM,
					seed,
					slots: RESOURCE_SLOTS
				}
			}
		}

		function canonicalGrowPaint(recipeValue, cellValue, growthValue) {
			const recipe = validateRecipe(recipeValue) || normalizeRecipe(recipeValue) || defaultRecipe()
			const seed = normalizeSeed(cellValue) || cellSeed(normalizeCell(cellValue) || [0, 0])
			const growth = normalizeGrowth(growthValue) || {
				version: GROWTH_VERSION,
				lineage: 'grow-default',
				phase: GROW_PHASE.growing,
				durationMs: DEFAULT_GROW_DURATION_MS,
				elapsedMs: 0
			}
			return {
				version: GROW_PAINT_VERSION,
				kind: PAINT_KIND,
				reward: REWARD_MODE,
				mode: GROW_MODE,
				recipe,
				generated: {
					algorithm: GENERATION_ALGORITHM,
					seed,
					slots: RESOURCE_SLOTS
				},
				growth
			}
		}

		function normalizeGrowth(value) {
			if (!value || typeof value !== 'object' || value.version !== GROWTH_VERSION) return null
			const lineage = normalizeGrowLineage(value.lineage)
			const durationMs = normalizeGrowDurationMs(value.durationMs)
			const elapsedMs = normalizeElapsedMs(value.elapsedMs, durationMs)
			const phase = String(value.phase || '')
			if (!lineage || !durationMs || elapsedMs === null || !Object.values(GROW_PHASE).includes(phase)) return null
			const fillDurationMs = Math.max(0, durationMs - GROW_REVEAL_MS)
			if (phase === GROW_PHASE.growing && elapsedMs > fillDurationMs) return null
			if (phase === GROW_PHASE.revealing && (elapsedMs < fillDurationMs || elapsedMs > durationMs)) return null
			if (phase === GROW_PHASE.stable && elapsedMs !== durationMs) return null
			const canonical = { version: GROWTH_VERSION, lineage, phase, durationMs, elapsedMs }
			return stableString(value) === stableString(canonical) ? canonical : null
		}

		function normalizeGrowDurationMs(value) {
			const number = Number(value)
			if (
				!Number.isInteger(number) ||
				number < MIN_GROW_DURATION_MS ||
				number > MAX_GROW_DURATION_MS ||
				(number - MIN_GROW_DURATION_MS) % GROW_DURATION_STEP_MS !== 0
			) return null
			return number
		}

		function normalizeGrowLineage(value) {
			const lineage = String(value || '')
			return /^[a-z0-9][a-z0-9._:-]{7,95}$/i.test(lineage) ? lineage : null
		}

		function normalizeElapsedMs(value, durationValue) {
			const durationMs = Number(durationValue)
			const number = Number(value)
			if (!Number.isInteger(durationMs) || !Number.isFinite(number)) return null
			const elapsedMs = Math.round(number)
			return elapsedMs >= 0 && elapsedMs <= durationMs ? elapsedMs : null
		}

		function updateGrowProgress(value, phaseValue, elapsedValue) {
			const paint = normalizePaint(value)
			if (!paint || paint.version !== GROW_PAINT_VERSION) return null
			const growth = normalizeGrowth({
				version: GROWTH_VERSION,
				lineage: paint.growth.lineage,
				phase: String(phaseValue || ''),
				durationMs: paint.growth.durationMs,
				elapsedMs: Math.round(Number(elapsedValue))
			})
			return growth ? canonicalGrowPaint(paint.recipe, paint.generated.seed, growth) : null
		}

		function sameGrowIdentity(leftValue, rightValue) {
			const left = normalizePaint(leftValue)
			const right = normalizePaint(rightValue)
			if (left?.version !== GROW_PAINT_VERSION || right?.version !== GROW_PAINT_VERSION) return false
			return stableString(growIdentity(left)) === stableString(growIdentity(right))
		}

		function matchesGrowProgress(actualValue, intendedValue) {
			const actual = normalizePaint(actualValue)
			const intended = normalizePaint(intendedValue)
			return !!actual && !!intended && sameGrowIdentity(actual, intended) && actual.growth.elapsedMs >= intended.growth.elapsedMs
		}

		function growIdentity(paint) {
			return {
				version: paint.version,
				kind: paint.kind,
				reward: paint.reward,
				mode: paint.mode,
				recipe: paint.recipe,
				generated: paint.generated,
				growth: {
					version: paint.growth.version,
					lineage: paint.growth.lineage,
					durationMs: paint.growth.durationMs
				}
			}
		}

		function resourcesForPaint(paint, cellValue) {
			if (paint.version === LEGACY_PAINT_VERSION) return new Array(RESOURCE_SLOTS).fill(RESOURCE_ID)
			const cell = normalizeCell(cellValue) || seedCell(paint.generated?.seed)
			return buildResources(paint.recipe, cell || [0, 0])
		}

		function normalizeResources(value) {
			if (!Array.isArray(value) || value.length !== RESOURCE_SLOTS) return null
			const resources = value.map(Number)
			return resources.every(function (resource) {
				return Number.isInteger(resource) && resource >= 0 && resource < RESOURCE_COUNT
			}) ? resources : null
		}

		function cellSeed(cellValue, recipeValue) {
			const cell = normalizeCell(cellValue)
			if (!cell) return null
			if (recipeValue) return cell[0] + ':' + cell[1] + '|' + stableString(normalizeRecipe(recipeValue))
			return cell[0] + ':' + cell[1]
		}

		function normalizeSeed(value) {
			if (Array.isArray(value)) return cellSeed(value)
			const seed = String(value || '')
			return /^-?\d+:-?\d+$/.test(seed) ? seed : null
		}

		function seedCell(value) {
			const match = /^(-?\d+):(-?\d+)$/.exec(String(value || ''))
			return match ? [Number(match[1]), Number(match[2])] : null
		}

		function seededRandom(seedValue) {
			let state = hashString(seedValue) || 0x6d2b79f5
			return function () {
				state ^= state << 13
				state ^= state >>> 17
				state ^= state << 5
				return (state >>> 0) / 4294967296
			}
		}

		function hashString(value) {
			const text = String(value || '')
			let hash = 2166136261
			for (let index = 0; index < text.length; index += 1) {
				hash ^= text.charCodeAt(index)
				hash = Math.imul(hash, 16777619)
			}
			return hash >>> 0
		}

		function stableString(value) {
			if (Array.isArray(value)) return '[' + value.map(stableString).join(',') + ']'
			if (!value || typeof value !== 'object') return JSON.stringify(value)
			return '{' + Object.keys(value).sort().map(function (key) {
				return JSON.stringify(key) + ':' + stableString(value[key])
			}).join(',') + '}'
		}

		function normalizeBroken(value) {
			const number = Number(value)
			return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0
		}

		function normalizeGrowState(value) {
			const state = Number(value)
			return Number.isInteger(state) && state >= 0 && state <= 2 ? state : null
		}

		function normalizeFill(value) {
			const number = Number(value)
			return Number.isFinite(number) ? Math.min(RESOURCE_SLOTS, Math.max(0, number)) : 0
		}

		function normalizeUnveilProgress(value) {
			const number = Number(value)
			return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0
		}

		function normalizeCell(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function safeName(value) {
			return String(value || '').trim().toLowerCase()
		}
	}
})
