(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableOriginArrowTipAnchor'
	const installedKey = '__cattailOriginArrowTipAnchorInstalled'

	let previewEnabled = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installOriginArrowTipAnchor(api)
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

	function installOriginArrowTipAnchor(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		api.patch(Game.prototype, 'renderCursor', function (original) {
			return function (...args) {
				if (!shouldReplaceOriginArrow(this, api)) return original.apply(this, args)

				const distanceToOrigins = this.distanceToOrigins
				this.distanceToOrigins = 0
				let result
				try {
					result = original.apply(this, args)
				} finally {
					this.distanceToOrigins = distanceToOrigins
				}
				renderTipAnchoredOriginArrow(this)
				return result
			}
		})
	}

	function shouldReplaceOriginArrow(game, api) {
		return !!(
			isEnabled(api) &&
			game &&
			game.distanceToOrigins > 80 &&
			Array.isArray(game.hoveredCell) &&
			game.ctx &&
			typeof game.uvToXYUntranslated === 'function'
		)
	}

	function renderTipAnchoredOriginArrow(game) {
		const origin = game.uvToXYUntranslated([0, 0])
		const vector = [origin[0] - game.mouse.xy[0], origin[1] - game.mouse.xy[1]]
		const angle = Math.atan2(vector[1], vector[0])
		const u = game.unit / game.zoom
		const ctx = game.ctx

		ctx.save()
		ctx.translate(game.mouse.xy[0], game.mouse.xy[1])
		ctx.rotate(angle)
		ctx.fillStyle = game.plane ? '#FFF' : '#000'
		ctx.beginPath()
		ctx.moveTo(-u * .3, -u * .1)
		ctx.lineTo(0, 0)
		ctx.lineTo(-u * .3, u * .1)
		ctx.lineTo(-u * .25, 0)
		ctx.closePath()
		ctx.fill()
		ctx.restore()
	}

	function isEnabled(api) {
		return previewEnabled === null ? api.config.get(configKey, true) !== false : previewEnabled !== false
	}
})()
