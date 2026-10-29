(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailTweaksWaypointFadeSkipInstalled'
	const configKey = 'enableWaypointFadeSkip'
	const effectDepthKey = '__cattailTweaksWaypointFadeEffectDepth'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installWaypointTeleportFadeSkip(api)
			})
		}
	})

	function installWaypointTeleportFadeSkip(api) {
		if (window[installedKey] || typeof Game === 'undefined' || typeof Waypoint === 'undefined') return
		window[installedKey] = true
		patchWaypointActivation(api, Waypoint)
		if (typeof Waypoint2 !== 'undefined') patchWaypointActivation(api, Waypoint2)
		patchHollowEventCreation(api)
	}

	function patchWaypointActivation(api, Type) {
		if (!Type?.prototype || typeof Type.prototype.onmousedown !== 'function') return
		api.patch(Type.prototype, 'onmousedown', function (original) {
			return function (...args) {
				const game = this.master
				if (!shouldSkipWaypointTeleportFade(api) || !game) return original.apply(this, args)
				game[effectDepthKey] = (game[effectDepthKey] || 0) + 1
				try {
					return original.apply(this, args)
				} finally {
					game[effectDepthKey] = Math.max(0, (game[effectDepthKey] || 1) - 1)
				}
			}
		})
	}

	function patchHollowEventCreation(api) {
		api.patch(Game.prototype, 'createHollowEvent', function (original) {
			return function (color, time, ...args) {
				if (shouldSuppressHollowEvent(this, api, color)) return
				return original.apply(this, [color, time, ...args])
			}
		})
	}

	function shouldSuppressHollowEvent(game, api, color) {
		return !!(
			shouldSkipWaypointTeleportFade(api) &&
			game &&
			game[effectDepthKey] > 0 &&
			isBlackColor(color)
		)
	}

	function shouldSkipWaypointTeleportFade(api) {
		return api.config.get(configKey, true) !== false
	}

	function isBlackColor(value) {
		const text = String(value || '').trim().toLowerCase()
		return text === '#000' || text === '#000000' || text === 'black'
	}
})()
