(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableClearViewGridFix'
	const installedKey = '__cattailClearViewGridFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function (_payload, game) {
				if (window[installedKey] || typeof Game === 'undefined') return
				if (game?.version !== '1.3' || game.isMobile || api.config.get(configKey, true) === false) return
				if (typeof Game.prototype.renderGrid !== 'function') return

				api.patch(Game.prototype, 'renderGrid', function (original) {
					return function (...args) {
						const ctx = this.ctx
						if (this.version !== '1.3' || this.isMobile || !ctx) return original.apply(this, args)
						const previousCap = ctx.lineCap
						try {
							// Native 1.3 sets width/color itself. Thick round strokes can
							// trigger Skia's costly software-mask path in clear view.
							ctx.lineCap = 'butt'
							return original.apply(this, args)
						} finally {
							ctx.lineCap = previousCap
						}
					}
				})
				// Install only at startup: disabling and reloading leaves the
				// original method intact for source-guarded diagnostic comparisons.
				window[installedKey] = true
			})
		}
	})
})()
