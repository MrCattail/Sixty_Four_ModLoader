(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailGradientLightningFlashDisableInstalled'
	const configKey = 'disableGradientLightningFlash'
	const effectDepthKey = '__cattailGradientLightningEffectDepth'
	const suppressLightningFlashKey = '__cattailSuppressScreenFlash'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installGradientLightningFlashDisable(api)
			})
		}
	})

	function installGradientLightningFlashDisable(api) {
		if (window[installedKey] || typeof Gradient === 'undefined') return
		if (typeof Game === 'undefined' || typeof Lightning === 'undefined') return
		window[installedKey] = true

		patchGradientUpdate(api)
		patchGradientLightningCreation(api)
		patchLightningScreenFlash(api)
	}

	function patchGradientUpdate(api) {
		api.patch(Gradient.prototype, 'update', function (original) {
			return function (...args) {
				const game = this.master
				if (!shouldSuppressGradientLightningScreenFlash(this, api) || !game) {
					return original.apply(this, args)
				}
				game[effectDepthKey] = (game[effectDepthKey] || 0) + 1
				try {
					return original.apply(this, args)
				} finally {
					game[effectDepthKey] = Math.max(0, (game[effectDepthKey] || 1) - 1)
				}
			}
		})
	}

	function patchGradientLightningCreation(api) {
		api.patch(Game.prototype, 'createLightning', function (original) {
			return function (...args) {
				const before = Array.isArray(this.vfx) ? this.vfx.length : -1
				const result = original.apply(this, args)
				if (shouldMarkGradientLightning(this, api) && Array.isArray(this.vfx)) {
					for (let i = Math.max(0, before); i < this.vfx.length; i++) {
						if (isLightningVfx(this.vfx[i])) this.vfx[i][suppressLightningFlashKey] = true
					}
				}
				return result
			}
		})
	}

	function patchLightningScreenFlash(api) {
		api.patch(Lightning.prototype, 'render', function (original) {
			return function (...args) {
				if (!this[suppressLightningFlashKey]) return original.apply(this, args)
				return renderLightningWithoutScreenFill(this, original, args)
			}
		})
	}

	function shouldSuppressGradientLightningScreenFlash(gradient, api) {
		return !!(
			api.config.get(configKey, true) !== false &&
			gradient &&
			gradient.master?.plane === 1
		)
	}

	function shouldMarkGradientLightning(game, api) {
		return !!(
			api.config.get(configKey, true) !== false &&
			game &&
			game.plane === 1 &&
			game[effectDepthKey] > 0
		)
	}

	function isLightningVfx(vfx) {
		return !!(vfx && (vfx instanceof Lightning || vfx.constructor?.name === 'Lightning'))
	}

	function renderLightningWithoutScreenFill(lightning, original, args) {
		const ctx = lightning.master?.ctx
		if (!ctx || typeof ctx.fillRect !== 'function') return original.apply(lightning, args)
		const originalFillRect = ctx.fillRect
		ctx.fillRect = function (x, y, width, height) {
			if (isFullScreenFill(lightning.master, x, y, width, height)) return
			return originalFillRect.apply(this, arguments)
		}
		try {
			return original.apply(lightning, args)
		} finally {
			ctx.fillRect = originalFillRect
		}
	}

	function isFullScreenFill(game, x, y, width, height) {
		if (!game) return false
		return Number(x) === 0 && Number(y) === 0 && Number(width) === Number(game.w) && Number(height) === Number(game.h)
	}

})()
