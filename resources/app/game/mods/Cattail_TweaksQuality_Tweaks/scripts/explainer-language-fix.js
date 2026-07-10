ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		if (api.config.get('enableExplainerLanguageFix', true) === false) return

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined' || typeof Explainer === 'undefined') return

			Explainer.prototype.refreshLanguage = function () {
				if (!this.state || this.finished || !this.stuff?.[this.next]) return
				this.element.innerHTML = this.master.pronounce('explainer', this.next)
			}

			api.patch(Game.prototype, 'changeLanguage', function (original) {
				return function (id) {
					const result = original.call(this, id)
					this.explainer?.refreshLanguage?.()
					return result
				}
			})
		})
	}
})
