(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableGradientPunctureRelocationFix'
	const installedKey = '__cattailGradientPunctureRelocationFixInstalled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installGradientPunctureRelocationFix(api)
			})
		}
	})

	function installGradientPunctureRelocationFix(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		api.patch(Game.prototype, 'processMousemove2', function (original) {
			return function () {
				const result = original.apply(this, arguments)
				if (isEnabled(api) && isGradientToPunctureRelocation(this, this.transportedEntity, this.hoveredCell, this.hoveredEntity)) {
					this.canPlace = true
				}
				return result
			}
		})

		api.patch(Game.prototype, 'relocate', function (original) {
			return function (entity, position) {
				const targetEntity = this.entityAtCoordinates?.(position)
				if (isEnabled(api) && isGradientToPunctureRelocation(this, entity, position, targetEntity)) {
					return upgradePunctureWithRelocatedGradient(this, entity, targetEntity, position)
				}
				return original.apply(this, arguments)
			}
		})
	}

	function upgradePunctureWithRelocatedGradient(game, gradient, puncture, position) {
		const targetPosition = [position[0], position[1]]
		const sourcePosition = Array.isArray(gradient.position) ? [gradient.position[0], gradient.position[1]] : null
		const refund = typeof game.getRealPrice === 'function' ? game.getRealPrice(puncture.name) : null
		const source = typeof game.uvToXYUntranslated === 'function' ? game.uvToXYUntranslated(targetPosition) : undefined

		game.clearCell(targetPosition)
		if (sourcePosition) game.clearCell(sourcePosition)
		if (game.stats) game.stats.timeSinceLastDelete = 0
		if (Array.isArray(refund) && typeof game.createResourceTransfer === 'function') {
			game.createResourceTransfer(refund, source, undefined, undefined, undefined, true)
		}

		const upgraded = game.addEntity?.('gradient', targetPosition)
		if (gradient) gradient.init = function () {}
		playPlaceSound(game, targetPosition)
		return upgraded
	}

	function playPlaceSound(game, position) {
		if (typeof game.uvToXYUntranslated !== 'function' || typeof game.getPanValueFromX !== 'function' || typeof game.playSound !== 'function') return
		const screenxy = game.uvToXYUntranslated(position)
		game.playSound('place', game.getPanValueFromX(screenxy[0]))
	}

	function isGradientToPunctureRelocation(game, entity, position, targetEntity) {
		return !!(
			game &&
			Array.isArray(position) &&
			entity?.name === 'gradient' &&
			targetEntity?.name === 'puncture' &&
			!targetEntity.span &&
			game.canRelocate?.(entity)
		)
	}

	function isEnabled(api) {
		return api?.config?.get(configKey, true) !== false
	}
})()