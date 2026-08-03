ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		api.on('afterVanillaScripts', function () {
			const core = window.CattailDynamicDetails
			if (!core || typeof core.installProductionTelemetry !== 'function') return
			core.installProductionTelemetry()
		})
	}
})
