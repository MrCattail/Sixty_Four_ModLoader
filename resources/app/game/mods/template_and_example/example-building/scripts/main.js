ModLoader.register({
	id: 'example-building',
	init(api) {
		api.replaceAsset('img/eye.png', '../../img/voidsculpture.png')
		api.replaceAsset('img/shop/eye.jpg', '../../img/shop/voidsculpture.jpg')

		api.on('afterVanillaScripts', function () {
			class ModSoulLamp extends Entity {
				constructor(master) {
					super(master)
					this.name = 'mod_soul_lamp'
					this.soulPower = 1

					this.sprite = new Sprite({
						master: this.master,
						src: 'img/eye.png',
						frames: [[0, 0, 455, 343]],
						origins: [226, 212],
						scale: .7,
						sequences: [0],
						intervals: 100
					})

					this.initHint()
					this.initSellHint()
				}

				render(dt, vposition) {
					this.sprite.render(vposition ? vposition : this.position, dt)
				}

				renderColored(dt, vposition, color) {
					this.sprite.renderWithOverlay(vposition ? vposition : this.position, dt, undefined, undefined, color)
				}
			}

			api.registerEntity('mod_soul_lamp', ModSoulLamp, {
				price: [api.config.get('basePrice', 64)],
				priceExponent: api.config.get('priceExponent', 1.15),
				canPurchase: api.config.get('enabledInShop', true),
				shopImage: 'img/shop/eye.jpg',
				shouldUnlock: function (game) {
					return game.resources[0] >= api.config.get('basePrice', 64) || game.entitiesInGame.pump > 0
				}
			})
		})
	}
})