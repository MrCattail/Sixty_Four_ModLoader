(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableResourceLayersAboveReducedFlashes'
	const layerId = 'reduced-flashes'
	const defaultOrder = 65
	const raisedResourceOrder = 43
	const apiOffFrameKey = '__cattailReducedFlashesLayeringApiOffFrame'
	const uiDemandCallbackId = 'reduced-flashes-layering-ui-demand'
	let lastApplied = null
	let apiOffLayeringInstalled = false
	let uiDemandRegistered = false

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			registerRaisedResourceUiDemand(api)
			applyReducedFlashesLayering(api, true)
			installApiOffReducedFlashesLayering(api)
			api.on('afterVanillaScripts', function () {
				registerRaisedResourceUiDemand(api)
				applyReducedFlashesLayering(api, true)
				installApiOffReducedFlashesLayering(api)
			})
			api.on('afterGameInit', function () {
				registerRaisedResourceUiDemand(api)
				applyReducedFlashesLayering(api, true)
				installApiOffReducedFlashesLayering(api)
			})
			window.addEventListener('modloader:render-layers-ready', function () {
				applyReducedFlashesLayering(api, true)
			})
			window.addEventListener('modloader:render-frame', function () {
				applyReducedFlashesLayering(api)
			})
		}
	})

	function registerRaisedResourceUiDemand(api) {
		if (uiDemandRegistered || !api?.render) return
		if (typeof api.render.demandLayer === 'function') {
			api.render.demandLayer('ui', {
				id: uiDemandCallbackId,
				enabled({ game }) { return shouldDemandRaisedResourceUiLayer(api, game) }
			})
		} else if (typeof api.render.onLayer === 'function') {
			api.render.onLayer('ui', function () {}, {
				id: uiDemandCallbackId,
				order: -1000,
				copyTransform: false,
				copyState: false,
				enabled({ game }) { return shouldDemandRaisedResourceUiLayer(api, game) }
			})
		} else return
		uiDemandRegistered = true
	}

	function applyReducedFlashesLayering(api, force = false) {
		if (!api?.render || typeof api.render.registerLayer !== 'function') return
		const enabled = api.config.get(configKey, false) === true
		if (!force && enabled === lastApplied) return
		lastApplied = enabled
		const order = enabled ? raisedResourceOrder : defaultOrder
		api.render.registerLayer(layerId, { order, zIndex: order, clearEachFrame: true })
		api.render.sync?.()
	}

	function installApiOffReducedFlashesLayering(api) {
		if (apiOffLayeringInstalled || typeof Game === 'undefined' || !Game.prototype) return
		if (typeof Game.prototype.renderloop !== 'function' || typeof Game.prototype.renderVFX !== 'function') return
		apiOffLayeringInstalled = true

		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				if (!shouldUseApiOffReducedFlashesLayering(api, this)) return original.apply(this, args)
				const previousPhotofobia = this.photofobia
				this[apiOffFrameKey] = { active: true, drawn: false }
				this.photofobia = false
				try {
					return original.apply(this, args)
				} finally {
					this.photofobia = previousPhotofobia
					this[apiOffFrameKey] = null
				}
			}
		})

		api.patch(Game.prototype, 'renderVFX', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				renderApiOffReducedFlashesBelowRaisedResources(this)
				return result
			}
		})
	}

	function shouldUseApiOffReducedFlashesLayering(api, game) {
		return !!(
			api?.config?.get(configKey, false) === true &&
			!isRenderApiEnabled(api) &&
			game?.photofobia &&
			game.flashlight &&
			!game.plane &&
			game.canvas &&
			game.ctx
		)
	}

	function shouldDemandRaisedResourceUiLayer(api, game) {
		return !!(
			api?.config?.get(configKey, false) === true &&
			isRenderApiEnabled(api) &&
			game?.photofobia &&
			game.flashlight &&
			!game.plane
		)
	}

	function isRenderApiEnabled(api) {
		if (!api?.render || typeof api.render.isEnabled !== 'function') return false
		return api.render.isEnabled() !== false
	}

	function renderApiOffReducedFlashesBelowRaisedResources(game) {
		const frame = game?.[apiOffFrameKey]
		if (!frame?.active || frame.drawn) return
		frame.drawn = true
		drawReducedFlashesOverlay(game)
	}

	function drawReducedFlashesOverlay(game) {
		const ctx = game?.ctx
		const width = Number(game?.w) || 0
		const height = Number(game?.h) || 0
		if (!ctx || !width || !height || !game.flashlight) return
		ctx.save()
		try {
			if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0)
			ctx.fillStyle = game.flashlight
			ctx.fillRect(0, 0, width, height)
		} finally {
			ctx.restore()
		}
	}
})()
