(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableEraserTierIconFix'
	const installedKey = '__cattailEraserTierIconFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			let activeGame = null
			let preview
			const enabled = () => preview === undefined ? api.config.get(configKey, true) !== false : preview
			function sync(store) {
				if (!enabled() || !supported(store?.master) || typeof DesktopStoreVersion === 'undefined' || !(store instanceof DesktopStoreVersion)) return
				const tier = store.master.eraserType
				const button = store.html?.eraser
				if (![0, 1, 2].includes(tier) || !button?.classList || typeof store.setEraserType !== 'function') return
				const hadII = button.classList.contains('ii')
				const hadIII = button.classList.contains('iii')
				if (hadII === (tier === 1) && hadIII === (tier === 2)) return
				try {
					// Restore the native sprite frame from the existing tier only.
					// Never call Game.updateEraserType or alter economy/save data.
					store.setEraserType(tier)
				} catch (_) {
					// Optional visual correction must not turn a successful rebuild
					// into a language-change failure or leave partial tier classes.
					button.classList.toggle('ii', hadII)
					button.classList.toggle('iii', hadIII)
				}
			}
			api.on('afterVanillaScripts', function (_payload, game) {
				if (window[installedKey] || typeof DesktopStoreVersion === 'undefined' || !supported(game)) return
				if (typeof DesktopStoreVersion.prototype.reinit !== 'function') return
				activeGame = game
				api.patch(DesktopStoreVersion.prototype, 'reinit', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						sync(this)
						return result
					}
				})
				window[installedKey] = true
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail
					if (detail?.modId !== MOD_ID || detail.key !== configKey) return
					preview = detail.value !== false
					if (preview) sync(activeGame?.store)
				})
			})
			api.on('afterGameInit', function (_payload, game) {
				activeGame = game
				if (window[installedKey]) sync(game?.store)
			})
		}
	})
	function supported(game) {
		return game?.version === '1.3' && !game.isMobile
	}
})()
