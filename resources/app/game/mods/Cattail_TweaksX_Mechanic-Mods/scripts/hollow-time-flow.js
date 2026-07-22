(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const CONFIG_KEY = 'hollowTimeFlowMode'
	const INSTALLED_KEY = '__cattailHollowTimeFlowInstalled'
	const ACTIVE_MODE_KEY = '__cattailHollowTimeFlowActiveMode'
	const RANDOM_MULTIPLIER_KEY = '__cattailHollowTimeFlowRandomMultiplier'
	const FORCED_TOTAL_TIME = 20000
	const MODE_SLOW = -1
	const MODE_NORMAL = 0
	const MODE_FAST = 1
	const MODE_RANDOM = 2
	const VANILLA_FAST_MULTIPLIER = 2
	const VANILLA_SLOW_MULTIPLIER = 0.1

	let previewMode = null
	let activeGame = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener(api)
			api.on('afterVanillaScripts', function () {
				installHollowTimeFlow(api)
			})
		}
	})

	function installConfigPreviewListener(api) {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID || detail.key !== CONFIG_KEY) return
				previewMode = readMode(detail.value)
				syncTimeFlowMode(activeGame || window.game, api)
			})
		} catch (error) {}
	}

	function installHollowTimeFlow(api) {
		if (window[INSTALLED_KEY] || typeof Game === 'undefined') return
		window[INSTALLED_KEY] = true

		api.patch(Game.prototype, 'initiateSlowdown', function (original) {
			return function (time, multiplier) {
				activeGame = this
				const adjustedMultiplier = getMultiplierForMode(getMode(api), this, multiplier)
				return original.call(this, time, adjustedMultiplier)
			}
		})

		api.patch(Game.prototype, 'updateSlowdownEvent', function (original) {
			return function (...args) {
				activeGame = this
				const mode = getMode(api)
				if (mode === MODE_NORMAL) {
					clearTimeFlowMode(this)
					return undefined
				}

				ensureTimeFlowMode(this, mode)
				const result = original.apply(this, args)
				ensureTimeFlowMode(this, mode)
				return result
			}
		})
	}

	function syncTimeFlowMode(game, api) {
		if (!game?.slowdown) return
		const mode = getMode(api)
		if (mode === MODE_NORMAL) {
			clearTimeFlowMode(game)
			return
		}
		ensureTimeFlowMode(game, mode)
	}

	function ensureTimeFlowMode(game, mode) {
		if (!game?.slowdown) return
		if (game.plane) {
			clearTimeFlowMode(game)
			return
		}

		const previousMode = readMode(game[ACTIVE_MODE_KEY])
		if (previousMode !== mode) {
			if (mode !== MODE_RANDOM) delete game[RANDOM_MULTIPLIER_KEY]
			game[ACTIVE_MODE_KEY] = mode
			game.initiateSlowdown(FORCED_TOTAL_TIME, getMultiplierForMode(mode, game, undefined))
		}

		refreshSlowdown(game, getMultiplierForMode(mode, game, game.slowdown.multiplyer))
	}

	function refreshSlowdown(game, multiplier) {
		game.slowdown.state = true
		game.slowdown.timer = FORCED_TOTAL_TIME * 0.5
		game.slowdown.totalTime = FORCED_TOTAL_TIME
		game.slowdown.multiplyer = multiplier
		game.slowdown.f = 1
		game.slowdown.cooldown = 0
	}

	function clearTimeFlowMode(game) {
		if (!game?.slowdown) return
		game.slowdown.state = false
		game.slowdown.timer = 0
		game.slowdown.totalTime = 0
		game.slowdown.f = 0
		game.slowdown.cooldown = 0
		delete game[ACTIVE_MODE_KEY]
		delete game[RANDOM_MULTIPLIER_KEY]
	}

	function getMultiplierForMode(mode, game, fallback) {
		if (mode === MODE_SLOW) return VANILLA_SLOW_MULTIPLIER
		if (mode === MODE_FAST) return VANILLA_FAST_MULTIPLIER
		if (mode === MODE_RANDOM) return getRandomModeMultiplier(game, fallback)
		return 1
	}

	function getRandomModeMultiplier(game, fallback) {
		const stored = readMultiplier(game?.[RANDOM_MULTIPLIER_KEY])
		if (stored !== null) return stored
		const existing = readMultiplier(fallback)
		const multiplier = existing !== null ? existing : rollVanillaMultiplier(game)
		if (game) game[RANDOM_MULTIPLIER_KEY] = multiplier
		return multiplier
	}

	function rollVanillaMultiplier(game) {
		const hollows = Math.floor(Number(game?.entitiesInGame?.hollow) || 0)
		const dice = Math.random()
		return (dice < 0.1 && hollows > 8) ? 0.02 : dice < 0.3 ? 0.1 : dice < 0.7 ? 0.5 : 2
	}

	function getMode(api) {
		if (previewMode !== null) return previewMode
		return readMode(api?.config?.get(CONFIG_KEY, MODE_NORMAL))
	}

	function readMode(value) {
		const number = Math.round(Number(value))
		if (!Number.isFinite(number)) return MODE_NORMAL
		return Math.max(MODE_SLOW, Math.min(MODE_RANDOM, number))
	}

	function readMultiplier(value) {
		const number = Number(value)
		return Number.isFinite(number) && number > 0 ? number : null
	}
})()