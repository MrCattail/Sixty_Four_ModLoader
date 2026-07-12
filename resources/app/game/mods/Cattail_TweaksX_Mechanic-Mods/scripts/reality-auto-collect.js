(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (typeof Entity === 'undefined') return

				api.patch(Entity.prototype, 'updateSoul', function (original) {
					return function (dt) {
						const wasReady = this.soul === 1
						original.call(this, dt)
						if (!isRealityAutoCollectEnabled(api)) {
							this.autoSoulReadyTimer = 0
							return
						}

						if (
							this.master?.plane === 1 &&
							!this.master.preventNoise &&
							this.soulPower > 0 &&
							this.soul === 1 &&
							wasReady &&
							typeof this.ondarkhover === 'function'
						) {
							this.autoSoulReadyTimer = (this.autoSoulReadyTimer || 0) + dt
							if (this.autoSoulReadyTimer >= 0) {
								this.autoSoulReadyTimer = 0
								this.ondarkhover()
							}
						} else {
							this.autoSoulReadyTimer = 0
						}
					}
				})
			})
		}
	})

	function isRealityAutoCollectEnabled(api) {
		return api.config.get('enableRealityAutoCollect', true) !== false
	}
})()
