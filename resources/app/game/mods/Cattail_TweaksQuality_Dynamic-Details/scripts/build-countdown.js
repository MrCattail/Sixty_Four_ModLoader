ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		api.on('afterVanillaScripts', function () {
			if (api.config.get('enableBuildCountdown', true) === false) return
			const core = window.CattailDynamicDetails
			if (!core || typeof core.installShopBuildCountdown !== 'function') return
			core.installShopBuildCountdown()
		})
	}
})
