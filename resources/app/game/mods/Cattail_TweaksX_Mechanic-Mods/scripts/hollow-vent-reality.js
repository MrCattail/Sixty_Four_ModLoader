(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const ENABLE_CONFIG_KEY = 'enableHollowVentReality'
	const INTERVAL_CONFIG_KEY = 'ventRealityInterval'
	const AMOUNT_CONFIG_KEY = 'ventRealityAmount'
	const LARGE_MULTIPLIER_CONFIG_KEY = 'ventRealityLargeMultiplier'
	const STATE_KEY = '__cattailHollowVentRealityState'
	const RESOURCE_SOURCE_PRODUCER_KEY = '_cattailDynamicResourceSourceProducer'
	const REALITY_RESOURCE_ID = 9
	const RESOURCE_COUNT = 10
	const VOID_TRANSFER_VISIBILITY = [false, true]
	const REAL_TRANSFER_VISIBILITY = [true, false]

	const DEFAULT_INTERVAL_SECONDS = 30
	const DEFAULT_AMOUNT = 1
	const DEFAULT_LARGE_MULTIPLIER = 4

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (typeof Game === 'undefined' || typeof Entity === 'undefined' || typeof Sprite === 'undefined') return

				if (typeof Strange1 !== 'undefined') patchVentEntity(api, Strange1, { large: true })
				if (typeof Hollow !== 'undefined') patchVentEntity(api, Hollow, { large: false })
			})
		}
	})

	function patchVentEntity(api, EntityClass, options) {
		api.patch(EntityClass.prototype, 'update', function (original) {
			return function (dt) {
				const result = original.apply(this, arguments)
				updateVentReality(this, Number(dt) || 0, options, api)
				return result
			}
		})

		api.patch(EntityClass.prototype, 'darkrender', function (original) {
			return function (dt, vposition) {
				const result = original.apply(this, arguments)
				renderVentRealitySymbol(this, Number(dt) || 0, vposition, options, api)
				return result
			}
		})
	}

	function updateVentReality(entity, dt, options, api) {
		const game = entity?.master
		if (!game || dt <= 0) return

		if (!isEnabled(api)) {
			if (entity[STATE_KEY]) entity[STATE_KEY].harvesting = false
			return
		}

		const state = getVentState(entity, options, api)
		if (state.harvesting) return

		const duration = getCycleDurationMs(api)
		state.duration = duration
		state.time = Math.min(duration, state.time + dt)

		if (state.time >= duration && game.voidsculpture) {
			harvestVentReality(entity, state, options, api)
		}
	}

	function renderVentRealitySymbol(entity, dt, vposition, options, api) {
		const game = entity?.master
		if (!game || game.plane !== 1 || !isEnabled(api)) return

		const state = getVentState(entity, options, api)
		const duration = getCycleDurationMs(api)
		const progress = Math.max(0, Math.min(1, state.time / duration))
		const sprite = getSymbolSprite(entity, state)
		if (!sprite) return

		const xy = getVentSymbolXY(game, vposition || entity.position, progress, options, false)
		const alpha = 0.12 + 0.88 * Math.pow(progress, 1.35)
		const scale = (options.large ? 1.42 : 0.48) * (0.82 + 0.22 * progress)

		const ctx = game.ctx
		ctx.save()
		ctx.globalAlpha *= alpha
		if (progress > 0.72) drawSymbolGlow(game, xy, progress, options)
		sprite.renderXY(xy, dt, false, scale)
		ctx.restore()
	}

	function harvestVentReality(entity, state, options, api) {
		const game = entity?.master
		const altar = game?.voidsculpture
		if (!game || !altar || state.harvesting) return

		const amount = getVentRealityAmount(api, options)
		if (amount <= 0) return

		state.time = 0
		state.harvesting = true

		const resources = makeRealityResources(amount)
		const source = getVentSymbolXY(game, entity.position, 1, options, true)
		const voidDestination = game.uvToXYUntranslated([altar.position[0] - 1, altar.position[1] - 1])
		playVisibleSoulSound(game, source)

		if (game.plane === 1) {
			createAttributedTransfer(game, entity, resources, source, voidDestination, false, VOID_TRANSFER_VISIBILITY)
			state.harvesting = false
			return
		}

		createAttributedTransfer(game, entity, resources, source, voidDestination, function () {
			if (!game.voidsculpture) {
				state.harvesting = false
				return
			}

			if (game.plane === 0) {
				const realSource = getRealityAltarRealSource(game.voidsculpture, game)
				const realDestination = getRealityResourceHome(game)
				createAttributedTransfer(game, entity, resources, realSource, realDestination, false, REAL_TRANSFER_VISIBILITY)
			} else {
				createAttributedTransfer(game, entity, resources, voidDestination, voidDestination, false, VOID_TRANSFER_VISIBILITY)
			}
			state.harvesting = false
		}, VOID_TRANSFER_VISIBILITY)
	}

	function getVentState(entity, options, api) {
		let state = entity[STATE_KEY]
		if (!state) {
			const duration = getCycleDurationMs(api)
			state = {
				time: Math.random() * duration,
				duration,
				harvesting: false,
				symbolIndex: 1 + Math.floor(Math.random() * 5),
				sprite: null,
				large: !!options.large
			}
			entity[STATE_KEY] = state
		}
		return state
	}

	function getSymbolSprite(entity, state) {
		if (state.sprite || typeof Sprite === 'undefined') return state.sprite
		state.sprite = new Sprite({
			master: entity.master,
			src: 'img/symbol0' + state.symbolIndex + '.png',
			mask: [0, 0, 256, 256],
			frames: [[0, 0, 256, 256], [256, 0, 256, 256], [512, 0, 256, 256]],
			origins: [128, 256],
			scale: 0.7,
			sequences: [0, 1, 2],
			intervals: 80
		})
		return state.sprite
	}

	function getVentSymbolXY(game, position, progress, options, untranslated) {
		const uv = options.large
			? [position[0] + 0.5, position[1] + 0.78]
			: [position[0] + 0.5, position[1] + 0.48]
		const base = untranslated ? game.uvToXYUntranslated(uv) : game.uvToXY(uv)
		const rise = game.unit * (options.large ? 2.65 : 0.92)
		const drift = Math.sin((game.time?.lt || performance.now()) * 0.006 + position[0] * 1.7 + position[1] * 0.9) * game.unit * (options.large ? 0.08 : 0.045)
		return [base[0] + drift * Math.sin(progress * Math.PI), base[1] - rise * progress]
	}

	function drawSymbolGlow(game, xy, progress, options) {
		const glow = game.ctx.createRadialGradient(xy[0], xy[1], 0, xy[0], xy[1], game.unit * (options.large ? 1.08 : 0.42))
		const alpha = Math.min(0.42, (progress - 0.72) / 0.28 * 0.42)
		glow.addColorStop(0, 'rgba(255,255,255,' + alpha.toFixed(3) + ')')
		glow.addColorStop(1, 'rgba(255,255,255,0)')
		game.ctx.fillStyle = glow
		game.ctx.beginPath()
		game.ctx.arc(xy[0], xy[1], game.unit * (options.large ? 1.08 : 0.42), 0, Math.PI * 2)
		game.ctx.fill()
	}

	function createAttributedTransfer(game, entity, resources, source, destination, onfinish, visibility) {
		if (!game || typeof game.createResourceTransfer !== 'function') return
		const previous = game[RESOURCE_SOURCE_PRODUCER_KEY]
		game[RESOURCE_SOURCE_PRODUCER_KEY] = { kind: 'entity', entity }
		try {
			game.createResourceTransfer(resources, source, destination, onfinish, visibility)
		} finally {
			if (previous !== undefined) game[RESOURCE_SOURCE_PRODUCER_KEY] = previous
			else delete game[RESOURCE_SOURCE_PRODUCER_KEY]
		}
	}

	function getRealityAltarRealSource(altar, game) {
		return game.uvToXYUntranslated([altar.position[0], altar.position[1] - 1.8])
	}

	function getRealityResourceHome(game) {
		return game.resourceHomes?.[REALITY_RESOURCE_ID] || game.resourceHomes?.[0] || [game.screenUnit, game.screenUnit]
	}

	function makeRealityResources(amount) {
		const resources = new Array(RESOURCE_COUNT).fill(0)
		resources[REALITY_RESOURCE_ID] = amount
		return resources
	}

	function playVisibleSoulSound(game, source) {
		if (game.preventNoise || game.plane !== 1 || typeof game.playSound !== 'function') return
		const pan = game.getPanValueFromX(source[0])
		const loudness = game.getLoudnessFromXY(source)
		game.playSound('soul', pan, loudness, true)
	}

	function getVentRealityAmount(api, options) {
		const amount = getNumberConfig(api, AMOUNT_CONFIG_KEY, DEFAULT_AMOUNT, 0, 1e9)
		if (!options.large) return amount
		return amount * getNumberConfig(api, LARGE_MULTIPLIER_CONFIG_KEY, DEFAULT_LARGE_MULTIPLIER, 0, 1e9)
	}

	function getCycleDurationMs(api) {
		return getNumberConfig(api, INTERVAL_CONFIG_KEY, DEFAULT_INTERVAL_SECONDS, 1, 3600) * 1000
	}

	function getNumberConfig(api, key, fallback, min, max) {
		const value = Number(api?.config?.get(key, fallback))
		if (!Number.isFinite(value)) return fallback
		return Math.max(min, Math.min(max, value))
	}

	function isEnabled(api) {
		return api.config.get(ENABLE_CONFIG_KEY, true) !== false
	}
})()
