(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableCardHoverFix'
	const installedKey = '__cattailTweaksCardHoverFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			let preview
			function enabled() {
				return preview === undefined ? api.config.get(configKey, true) !== false : preview
			}
			api.on('afterVanillaScripts', function (_payload, game) {
				if (window[installedKey] || typeof Game === 'undefined' || !supported(game)) return
				if (typeof Game.prototype.processMove !== 'function') return
				api.patch(Game.prototype, 'processMove', function (original) {
					return function (...args) {
						const observe = enabled() && supported(this) && this.mouse?.state === 2 && point(this.translation)
						const x = observe ? this.translation[0] : 0
						const y = observe ? this.translation[1] : 0
						const result = original.apply(this, args)
						if (observe && point(this.translation) && (this.translation[0] !== x || this.translation[1] !== y)) {
							refreshHover(this)
						}
						return result
					}
				})
				window[installedKey] = true
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail
					if (detail?.modId === MOD_ID && detail.key === configKey) preview = detail.value !== false
				})
			})
		}
	})

	function supported(game) {
		return game?.version === '1.3' && !game.isMobile
	}
	function point(value) {
		return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])
	}
	function refreshHover(game) {
		if (!point(game.mouse?.sxy) || typeof game.xyToUV !== 'function' || typeof game.entityAtCoordinates !== 'function') return
		try {
			// Native updatePointerState() would reset mouse.delta. Recompute only
			// the world hit after panning, retaining all buttons/movement state.
			const uv = game.xyToUV(game.mouse.sxy)
			if (!point(uv)) return
			const cell = [Math.floor(uv[0]), Math.floor(uv[1])]
			if (!cell.every(Number.isSafeInteger)) return
			const entity = game.entityAtCoordinates(cell)
			// Resolve both before publishing, so a failed lookup leaves hover intact.
			game.hoveredCell = cell
			game.hoveredEntity = entity
		} catch (_) {
			// Optional post-move refresh must not retry movement or mask its result.
		}
	}
})()
