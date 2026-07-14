(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const DEFAULT_SURGE_COUNT = 8
	const DEFAULT_SURGE_RADIUS = 8
	const MAX_SURGE_COUNT = 64
	const MAX_SURGE_RADIUS = 64
	const RESOURCE_COUNT = 10
	const SCAN_RADIUS_KEY = '__cattailScanRealitySliderRadius'
	const SCAN_REALITY_KEY = '__cattailScanRealitySliderReality'
	const VANILLA_DIAMETER = 32
	const VANILLA_REALITY = 256
	const MIN_DIAMETER = 8
	const MAX_DIAMETER = 256
	const DIAMETER_STEP = 8
	const DIAMETER_PER_REALITY_DOUBLE = 8

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (typeof Scan === 'undefined' || typeof Surge === 'undefined') return

				const processedScans = new WeakSet()

				api.patch(Scan.prototype, 'update', function (original) {
					return function (dt) {
						const game = this.master
						const position = Array.isArray(this.position) ? [this.position[0], this.position[1]] : null
						const beforeLifeTime = this.lifeTime
						const result = original.call(this, dt)

						if (!isScanRealitySurgesEnabled(api)) return result
						if (
							game &&
							position &&
							beforeLifeTime > 0 &&
							this.lifeTime <= 0 &&
							!processedScans.has(this)
						) {
							processedScans.add(this)
							spawnSurgesAround(game, position, api, this)
						}

						return result
					}
				})
			})
		}
	})

	function isScanRealitySurgesEnabled(api) {
		return api.config.get('enableScanRealitySurges', true) !== false
	}

	function isSliderStrengthEnabled(api) {
		return api.config.get('enableScanRealitySurgesSliderStrength', true) !== false
	}

	function spawnSurgesAround(game, origin, api, scan) {
		if (!game || typeof game.addEntity !== 'function' || !game.codex?.entities?.surge) return

		const tuning = getSurgeTuning(api, scan)
		const surgeCount = tuning.count
		const surgeRadius = tuning.radius
		const candidates = getEmptyCellsInRadius(game, origin, surgeRadius)
		shuffle(candidates)

		let placed = 0
		for (let i = 0; i < candidates.length && placed < surgeCount; i++) {
			const surge = game.addEntity('surge', candidates[i], createRandomSurgeArgs(game), { skipShopUpdate: true })
			if (surge) placed++
		}

		if (placed && typeof game.shop?.updateElements === 'function') game.shop.updateElements()
	}

	function getSurgeTuning(api, scan) {
		if (isSliderStrengthEnabled(api)) {
			const linked = getSliderLinkedSurgeTuning(scan)
			if (linked) return linked
		}

		return {
			count: getConfiguredInteger(api, 'surgeCount', DEFAULT_SURGE_COUNT, 1, MAX_SURGE_COUNT),
			radius: getConfiguredInteger(api, 'surgeRadius', DEFAULT_SURGE_RADIUS, 1, MAX_SURGE_RADIUS)
		}
	}

	function getSliderLinkedSurgeTuning(scan) {
		const diameter = getSliderDiameter(scan)
		if (!Number.isFinite(diameter)) return null

		// Vanilla 256 Reality / 32 diameter maps to the old 8 surges in an 8-cell radius.
		const strength = Math.round(clampDiameter(diameter) / 4)
		return {
			count: Math.max(1, Math.min(MAX_SURGE_COUNT, strength)),
			radius: Math.max(1, Math.min(MAX_SURGE_RADIUS, strength))
		}
	}

	function getSliderDiameter(scan) {
		const reality = Number(scan?.[SCAN_REALITY_KEY])
		if (Number.isFinite(reality) && reality > 0) {
			const exponent = Math.log2(Math.max(1, reality) / VANILLA_REALITY)
			return VANILLA_DIAMETER + exponent * DIAMETER_PER_REALITY_DOUBLE
		}

		const radius = Number(scan?.[SCAN_RADIUS_KEY])
		return Number.isFinite(radius) && radius > 0 ? radius * 2 : NaN
	}

	function clampDiameter(value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return VANILLA_DIAMETER
		const stepped = Math.round(number / DIAMETER_STEP) * DIAMETER_STEP
		return Math.max(MIN_DIAMETER, Math.min(MAX_DIAMETER, stepped))
	}

	function getEmptyCellsInRadius(game, origin, radius) {
		const cells = []
		const center = [Math.floor(origin[0]), Math.floor(origin[1])]
		const radiusSquared = radius * radius

		for (let du = -radius; du <= radius; du++) {
			for (let dv = -radius; dv <= radius; dv++) {
				if (du * du + dv * dv > radiusSquared) continue
				const cell = [center[0] + du, center[1] + dv]
				if (!game.entityAtCoordinates(cell)) cells.push(cell)
			}
		}

		return cells
	}

	function getConfiguredInteger(api, key, fallback, min, max) {
		const value = Number(api?.config?.get(key, fallback))
		if (!Number.isFinite(value)) return fallback
		return Math.max(min, Math.min(max, Math.floor(value)))
	}

	function createRandomSurgeArgs(game) {
		const type = Math.floor(Math.random() * RESOURCE_COUNT)
		const grade = Math.floor(Math.random() * 3)
		const resources = new Array(RESOURCE_COUNT).fill(0)
		resources[type] = getSurgeAmount(game, type, grade)

		return {
			resources,
			rayNumber: getRayNumberForGrade(grade),
			grade,
			colors: getSurgeColors(game, type),
			type
		}
	}

	function getSurgeAmount(game, type, grade) {
		const multiplier = grade === 0 ? 0.1 : grade === 1 ? 0.3 : 0.5
		const sourceLimit = type > 6 ? 512 : type === 5 ? 16384 : 262144
		const current = Math.max(1, Number(game.resources?.[type]) || 0)
		const source = Math.min(current, sourceLimit)
		const mined = Number(game.stats?.totalResourcesMined?.[type]) || 0
		const base = mined > 2048 ? 512 + multiplier * source : multiplier * source

		return Math.max(1, Math.floor(base + source * multiplier * Math.random()))
	}

	function getRayNumberForGrade(grade) {
		if (grade === 0) return 1 + Math.floor(Math.random() * 4)
		if (grade === 1) return 5 + Math.floor(Math.random() * 5)
		return 10 + Math.floor(Math.random() * 7)
	}

	function getSurgeColors(game, type) {
		const resource = game.codex?.resources?.[type]
		return resource?.surgeTriplet || resource?.triplet || ['#FFC759', '#FFE86F', '#FF8F60']
	}

	function shuffle(items) {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			const tmp = items[i]
			items[i] = items[j]
			items[j] = tmp
		}
		return items
	}
})()
