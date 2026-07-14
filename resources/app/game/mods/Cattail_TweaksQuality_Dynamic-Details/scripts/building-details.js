ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		api.on('afterVanillaScripts', function () {
			if (api.config.get('enableBuildingDetails', true) === false) return
			const core = window.CattailDynamicDetails
			if (!core || typeof core.installBuildingDetails !== 'function') return
			core.installBuildingDetails()
		})
	}
})
