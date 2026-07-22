(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailIdleSplashDisableInstalled'
	const configKey = 'disableIdleSplash'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installIdleSplashDisable(api)
			})
			api.on('afterGameInit', function (payload, game) {
				if (shouldDisableIdleSplash(api)) closeExistingIdleSplash(game)
			})
		}
	})

	function installIdleSplashDisable(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		patchSimulateIdleTime(api)
		window.addEventListener('modloader:config-preview', function (event) {
			const detail = event?.detail || {}
			if (detail.modId !== MOD_ID || detail.key !== configKey) return
			if (detail.value !== false) closeExistingIdleSplash(window.game)
		})
	}

	function patchSimulateIdleTime(api) {
		api.patch(Game.prototype, 'simulateIdleTime', function (original) {
			return function (...args) {
				if (!shouldDisableIdleSplash(api)) return original.apply(this, args)
				closeExistingIdleSplash(this)
				delete this.preventNoise
				return undefined
			}
		})
	}

	function shouldDisableIdleSplash(api) {
		return api.config.get(configKey, true) !== false
	}

	function closeExistingIdleSplash(game) {
		const cover = document.querySelector('.idleCover')
		if (!cover) return
		const cancel = cover.querySelector('.cancelIdle')
		if (cancel) {
			cancel.click()
			return
		}
		if (cover.parentNode) cover.parentNode.removeChild(cover)
		if (game) delete game.preventNoise
	}

})()
