(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableRememberLanguage'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			const initializedGames = new WeakSet()
			api.on('afterData', function (_data, game) {
				if (!game || game.version !== '1.3' || game.isMobile || initializedGames.has(game)) return
				initializedGames.add(game)
				if (api.config.get(configKey, true) === false) return

				// In desktop 1.3 this hook runs after Steam's startup override and
				// language registration, but before words and the first UI are built.
				// Keep native preference loading (including the legacy fallback) and
				// saving; an unavailable preference leaves the startup choice alone.
				const id = game.preferences?.languageId
				if (!Number.isInteger(id) || id < 0 || !Array.isArray(game.languages)) return
				const language = game.languages[id]
				if (typeof language !== 'string' || !language) return
				game.languageId = id
				game.language = language
			})
		}
	})
})()
