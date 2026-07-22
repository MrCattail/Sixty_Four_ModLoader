ModLoader.register({
	id: 'example-asset-replace',
	init(api) {
		api.replaceAsset('img/eye.png', '../../img/voidsculpture.png')
		api.replaceAsset('img/shop/eye.jpg', '../../img/shop/voidsculpture.jpg')
	}
})