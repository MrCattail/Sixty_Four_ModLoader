ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Details',
	init(api) {
		api.on('afterVanillaScripts', function () {
			if (api.config.get('enableDirectionPointers', true) === false) return
			const core = window.CattailDynamicDetails
			if (!core || typeof core.installDirectionPointers !== 'function') return
			core.installDirectionPointers()
		})
	}
})
