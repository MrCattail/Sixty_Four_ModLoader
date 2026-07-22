(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableGradientRelocationPenaltyFix'
	const installedKey = '__cattailGradientRelocationPenaltyFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installGradientRelocationPenaltyFix(api)
			})
		}
	})

	function installGradientRelocationPenaltyFix(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		api.patch(Game.prototype, 'processClick', function (original) {
			return function () {
				const snapshot = captureGradientRelocation(this, api)
				const result = original.apply(this, arguments)
				restoreGradientPenalty(this, snapshot)
				return result
			}
		})
	}

	function captureGradientRelocation(game, api) {
		if (!isEnabled(api)) return null
		const gradient = game?.transportedEntity
		if (!gradient || gradient.name !== 'gradient') return null
		if (!game.hoveredCell || !game.itemInHand || game.itemInHand.name !== 'gradient') return null
		if (!Array.isArray(game.resources) || game.resources[4] < 1) return null
		return {
			gradient: gradient,
			penalty: Number.isFinite(Number(gradient.penalty)) ? Number(gradient.penalty) : 1
		}
	}

	function restoreGradientPenalty(game, snapshot) {
		const gradient = snapshot?.gradient
		if (!gradient || !Array.isArray(game?.stuff) || !game.stuff.includes(gradient)) return
		if (Number(gradient.penalty) === snapshot.penalty) return
		gradient.penalty = snapshot.penalty
		if (typeof gradient.init === 'function') gradient.init()
	}

	function isEnabled(api) {
		return api?.config?.get(configKey, true) !== false
	}
})()
