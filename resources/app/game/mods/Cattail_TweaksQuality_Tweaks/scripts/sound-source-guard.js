(function () {
	'use strict'

	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableEmptySoundWarningFix'
	const installedKey = '__cattailTweaksEmptySoundWarningFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			let preview
			const enabled = () => preview === undefined ? api.config.get(configKey, true) !== false : preview

			api.on('afterVanillaScripts', function (_payload, game) {
				if (window[installedKey] || !supported(game) || typeof Game === 'undefined') return
				if (typeof Game.prototype.deleteSoundSource !== 'function') return

				api.patch(Game.prototype, 'deleteSoundSource', function (original) {
					return function (...args) {
						// Native addSoundSource returns false when audio is unavailable.
						// Preserve all other inputs, including stale-object diagnostics.
						if (args[0] === false && supported(this) && enabled()) return false
						return original.apply(this, args)
					}
				})
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail
					if (detail?.modId !== MOD_ID || detail.key !== configKey) return
					preview = detail.value !== false
				})
				window[installedKey] = true
			})
		}
	})

	function supported(game) {
		return game?.version === '1.3' && !game.isMobile
	}
})()
