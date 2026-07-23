ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		api.on('afterGameInit', function () {
			console.info('[Cattail World Editor] Foundation ready.')
		})
	}
})
