(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const DEFAULT_LONG_SILO_FILL = 100000000000

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			monitorSuperSiloToggle(api)

			api.on('beforeSaveLoad', function (save) {
				// One-time cleanup for saves made by older versions of this feature.
				// The huge runtime fill is intentionally never persisted.
				if ((!isSuperSiloEnabled(api) || !save?.modloader?.siloLongFill) && Array.isArray(save?.stuff)) {
					clampSavedSilos(save.stuff)
				}
				return save
			})

			api.on('beforeSaveWrite', function (save) {
				save.modloader = save.modloader || {}
				if (isSuperSiloEnabled(api)) {
					save.modloader.siloLongFill = 1
				} else {
					delete save.modloader.siloLongFill
				}
				if (Array.isArray(save?.stuff)) clampSavedSilos(save.stuff)
				return save
			})

			api.on('afterVanillaScripts', function () {
				if (typeof Silo === 'undefined') return

				api.patch(Silo.prototype, 'activate', function (original) {
					return function () {
						original.call(this)
						if (!isSuperSiloEnabled(api)) return
						fillSiloForLongRun(this, getLongSiloFill(api))
					}
				})
			})

			api.on('afterGameInit', function (payload, game) {
				if (!isSuperSiloEnabled(api)) return
				const silos = (game?.stuff || []).filter(isSilo)
				const fillAmount = getLongSiloFill(api)
				if (silos.length && silos.some(function (silo) { return needsFill(silo, fillAmount) })) {
					for (const silo of silos) fillSiloForLongRun(silo, fillAmount)
				}
			})
		}
	})

	function isSuperSiloEnabled(api) {
		return api.config.get('enableSuperSilo', true) !== false
	}

	function monitorSuperSiloToggle(api) {
		let wasEnabled = isSuperSiloEnabled(api)
		setInterval(function () {
			const enabled = isSuperSiloEnabled(api)
			if (wasEnabled && !enabled) clampLiveSilos(api.state?.game)
			wasEnabled = enabled
		}, 500)
	}

	function getLongSiloFill(api) {
		const value = Number(api.config.get('fillAmount', DEFAULT_LONG_SILO_FILL))
		if (!Number.isFinite(value) || value < 1) return DEFAULT_LONG_SILO_FILL
		return Math.floor(value)
	}

	function clampSavedSilos(stuff) {
		for (const item of stuff) {
			if ((item.name === 'silo' || item.name === 'silo2') && item.par?.fill > 1) item.par.fill = 1
		}
	}

	function clampLiveSilos(game) {
		for (const silo of (game?.stuff || []).filter(isSilo)) {
			if ((silo.fill || 0) > 1) silo.fill = 1
		}
	}

	function isSilo(entity) {
		return entity && (entity.name === 'silo' || entity.name === 'silo2')
	}

	function needsFill(silo, fillAmount) {
		return (silo.fill || 0) < fillAmount || silo.state !== 2
	}

	function fillSiloForLongRun(silo, fillAmount) {
		silo.fill = fillAmount
		silo.state = 2
		silo.dive = 1
		silo.freeTimer = 100
	}
})()
