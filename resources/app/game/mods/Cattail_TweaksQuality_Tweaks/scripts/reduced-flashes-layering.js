(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableResourceLayersAboveReducedFlashes'
	const layerId = 'reduced-flashes'
	const defaultOrder = 65
	const raisedResourceOrder = 43
	let lastApplied = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			applyReducedFlashesLayering(api, true)
			api.on('afterVanillaScripts', function () {
				applyReducedFlashesLayering(api, true)
			})
			api.on('afterGameInit', function () {
				applyReducedFlashesLayering(api, true)
			})
			window.addEventListener('modloader:render-layers-ready', function () {
				applyReducedFlashesLayering(api, true)
			})
			window.addEventListener('modloader:render-frame', function () {
				applyReducedFlashesLayering(api)
			})
		}
	})

	function applyReducedFlashesLayering(api, force = false) {
		if (!api?.render || typeof api.render.registerLayer !== 'function') return
		const enabled = api.config.get(configKey, false) === true
		if (!force && enabled === lastApplied) return
		lastApplied = enabled
		const order = enabled ? raisedResourceOrder : defaultOrder
		api.render.registerLayer(layerId, { order, zIndex: order, clearEachFrame: true })
		api.render.sync?.()
	}
})()
