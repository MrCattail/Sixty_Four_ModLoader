const DEFAULT_LONG_SILO_FILL = 100000000000

ModLoader.register({
	id: 'Cattail_TweaksX_Super-Silo',
	init(api) {
		api.on('beforeSaveLoad', function (save) {
			// One-time cleanup for saves made by older versions of this mod.
			// With the current version, the huge runtime fill is never persisted.
			if (!save?.modloader?.siloLongFill && Array.isArray(save?.stuff)) {
				clampSavedSilos(save.stuff)
			}
			return save
		})

		api.on('beforeSaveWrite', function (save) {
			save.modloader = save.modloader || {}
			save.modloader.siloLongFill = 1
			if (Array.isArray(save?.stuff)) clampSavedSilos(save.stuff)
			return save
		})

		api.on('afterVanillaScripts', function () {
			if (typeof Silo === 'undefined') return

			api.patch(Silo.prototype, 'activate', function (original) {
				return function () {
					original.call(this)
					fillSiloForLongRun(this, getLongSiloFill(api))
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			const silos = (game?.stuff || []).filter(isSilo)
			const fillAmount = getLongSiloFill(api)
			if (silos.length && silos.some(function (silo) { return needsFill(silo, fillAmount) })) {
				for (const silo of silos) fillSiloForLongRun(silo, fillAmount)
			}
		})
	}
})

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