(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailVoidReturnFadeSkipInstalled'
	const pendingReturnKey = '__cattailVoidReturnFadeSkipPendingAt'
	const configKey = 'enableVoidReturnFadeSkip'
	const pendingWindowMs = 1200
	const minFadeTime = 10000

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installVoidReturnFadeSkip(api)
			})
		}
	})

	function installVoidReturnFadeSkip(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		patchPlaneSwitch(api)
		patchHollowEventCreation(api)
	}

	function patchPlaneSwitch(api) {
		api.patch(Game.prototype, 'switchPlane', function (original) {
			return function (...args) {
				const from = this.plane ? 1 : 0
				const to = args[0] ? 1 : 0
				const result = original.apply(this, args)
				if (isVoidReturnFadeSkipEnabled(api) && from === 1 && to === 0) {
					this[pendingReturnKey] = getNow()
				}
				return result
			}
		})
	}

	function patchHollowEventCreation(api) {
		api.patch(Game.prototype, 'createHollowEvent', function (original) {
			return function (color, time, ...args) {
				if (shouldSkipVoidReturnFade(this, api, color, time)) {
					this[pendingReturnKey] = 0
					return
				}
				return original.apply(this, [color, time, ...args])
			}
		})
	}

	function shouldSkipVoidReturnFade(game, api, color, time) {
		if (!isVoidReturnFadeSkipEnabled(api) || !game || game.plane !== 0) return false
		const pendingAt = Number(game[pendingReturnKey]) || 0
		if (!pendingAt || getNow() - pendingAt > pendingWindowMs) return false
		return isWhiteColor(color) && Number(time) >= minFadeTime
	}

	function isVoidReturnFadeSkipEnabled(api) {
		return api.config.get(configKey, true) !== false
	}

	function isWhiteColor(value) {
		const text = String(value || '').trim().toLowerCase()
		return text === '#fff' || text === '#ffffff' || text === 'white'
	}

	function getNow() {
		try {
			if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
		} catch (error) {}
		return Date.now()
	}
})()
