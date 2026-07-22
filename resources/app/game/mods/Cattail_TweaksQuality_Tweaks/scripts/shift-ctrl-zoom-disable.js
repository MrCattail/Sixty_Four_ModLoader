(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'disableShiftCtrlZoomShortcut'
	const installedKey = '__cattailShiftCtrlZoomDisableInstalled'
	const patchInstalledKey = '__cattailShiftCtrlZoomDisablePatchInstalled'
	const guardKey = '__cattailShiftCtrlZoomGuard'

	let activeGame = null
	let previewEnabled = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installShiftCtrlZoomDisable(api)
			})
			api.on('afterGameInit', function (payload, game) {
				activeGame = game || activeGame
				installShiftCtrlZoomDisable(api)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId === MOD_ID && detail.key === configKey) previewEnabled = detail.value !== false
			})
		} catch (error) {}
	}

	function installShiftCtrlZoomDisable(api) {
		installGameTracker(api)
		if (window[installedKey]) return
		window[installedKey] = true

		window.addEventListener('keydown', function (event) {
			const game = getActiveGame()
			if (!shouldHandleShiftCtrl(api, game, event)) return
			if (!game[guardKey]) {
				game[guardKey] = {
					zoom: Number(game.zoom),
					hadWheelAction: false
				}
			}
		}, true)

		window.addEventListener('wheel', function (event) {
			const game = getActiveGame()
			if (!game || !game[guardKey]) return
			if (event.shiftKey || event.ctrlKey || game.shiftPressed) game[guardKey].hadWheelAction = true
		}, true)

		window.addEventListener('keyup', function (event) {
			const game = getActiveGame()
			if (!shouldHandleShiftCtrl(api, game, event)) return
			const guard = game[guardKey]
			game.thereWasZoomAction = true
			setTimeout(function () {
				restoreZoomIfVanillaReset(api, game, guard)
			}, 0)
		}, true)
	}

	function installGameTracker(api) {
		if (window[patchInstalledKey] || typeof Game === 'undefined') return
		window[patchInstalledKey] = true
		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				activeGame = this
				return original.apply(this, args)
			}
		})
	}

	function getActiveGame() {
		return activeGame || null
	}

	function restoreZoomIfVanillaReset(api, game, guard) {
		if (!game || !guard || !isEnabled(api)) return
		if (game[guardKey] !== guard) return
		delete game[guardKey]
		if (guard.hadWheelAction) return
		if (!Number.isFinite(guard.zoom)) return
		if (Math.abs(Number(game.zoom) - 1) > 0.0001) return
		if (Math.abs(guard.zoom - 1) <= 0.0001) return
		game.zoom = guard.zoom
		game.processMousemove2?.()
	}

	function shouldHandleShiftCtrl(api, game, event) {
		return !!(
			isEnabled(api) &&
			game &&
			isShiftCtrlKey(event)
		)
	}

	function isShiftCtrlKey(event) {
		return !!(
			event &&
			(event.keyCode === 16 || event.keyCode === 17 || event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'ControlLeft' || event.code === 'ControlRight')
		)
	}

	function isEnabled(api) {
		return previewEnabled === null ? api.config.get(configKey, true) !== false : previewEnabled !== false
	}
})()
