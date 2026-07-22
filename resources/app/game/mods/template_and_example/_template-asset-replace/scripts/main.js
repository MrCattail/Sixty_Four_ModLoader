ModLoader.register({
	id: 'template-asset-replace',
	init(api) {
		api.replaceAsset('img/eye.png', 'img/custom-eye.png')
		api.replaceAsset('img/shop/eye.jpg', 'img/custom-eye-shop.jpg')
		api.replaceAsset('sfx/tap.mp3?v5', 'sfx/custom-tap.mp3')
		api.registerSound('my_sound', 'sfx/my-sound.mp3', { volume: .5 })
		api.registerMusic('my_music', 'music/my-music.mp3')
	}
})
