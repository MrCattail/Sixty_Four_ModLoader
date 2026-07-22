ModLoader.register({
	id: 'template-building',
	init(api) {
		api.on('afterVanillaScripts', function () {
			class TemplateBuilding extends Entity {
				constructor(master) {
					super(master)
					this.name = 'template_building'
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
			}

			api.registerEntity('template_building', TemplateBuilding, {
				price: [api.config.get('basePrice', 64)],
				priceExponent: 1.15,
				canPurchase: true,
				shopImage: 'img/shop/eye.jpg',
				shouldUnlock: function (game) {
					return game.entitiesInGame.pump > 0
				}
			})
		})
	}
})
