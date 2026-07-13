(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const ENABLE_CONFIG_KEY = 'enableFlatBuildCosts'
	const SHOP_STATE_KEY = '__cattailFlatBuildCostsEnabled'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (typeof Game === 'undefined' || !Game.prototype) return

				api.patch(Game.prototype, 'getRealPrice', function (original) {
					return function (name, sale) {
						if (!isEnabled(api)) return original.apply(this, arguments)

						const entity = this.codex?.entities?.[name]
						if (!entity || !Array.isArray(entity.price)) return original.apply(this, arguments)

						return entity.price
					}
				})

				if (typeof Shop !== 'undefined' && Shop.prototype?.check) {
					api.patch(Shop.prototype, 'check', function (original) {
						return function () {
							const result = original.apply(this, arguments)
							syncShopPrices(this.master, api)
							return result
						}
					})
				}
			})
		}
	})

	function syncShopPrices(game, api) {
		if (!game?.shop || typeof game.shop.updateElements !== 'function') return
		const enabled = isEnabled(api)
		if (game[SHOP_STATE_KEY] === enabled) return
		game[SHOP_STATE_KEY] = enabled
		game.shop.updateElements()
	}

	function isEnabled(api) {
		return api.config.get(ENABLE_CONFIG_KEY, true) !== false
	}
})()