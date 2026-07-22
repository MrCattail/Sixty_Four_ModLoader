ModLoader.register({
	id: 'template-behavior',
	init(api) {
		api.on('afterGameInit', function (payload, game) {
			console.log('[template-behavior] game ready', game.version)
		})

		api.on('afterVanillaScripts', function () {
			api.patch(Game.prototype, 'getRealPrice', function (original) {
				return function (name, sale) {
					const price = original.call(this, name, sale)
					return price
				}
			})
		})
	}
})
