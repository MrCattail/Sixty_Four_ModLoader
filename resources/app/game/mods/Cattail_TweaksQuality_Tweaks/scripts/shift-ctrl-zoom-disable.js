(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'disableShiftCtrlZoomShortcut'
	const installedKey = '__cattailShiftCtrlZoomDisableInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterGameInit', function (payload, game) {
				installShiftCtrlZoomDisable(api, game)
			})
		}
	})

	function installShiftCtrlZoomDisable(api, game) {
		if (!game || window[installedKey]) return
		window[installedKey] = true
		window.addEventListener('keyup', function (event) {
			if (!shouldDisableShiftCtrlZoom(api, game, event)) return
			game.thereWasZoomAction = true
		}, true)
	}

	function shouldDisableShiftCtrlZoom(api, game, event) {
		return !!(
			api.config.get(configKey, true) !== false &&
			game &&
			(event?.keyCode === 16 || event?.keyCode === 17)
		)
	}
})()