(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const ENABLE_CONFIG_KEY = 'enableFlatBuildCosts'
	const quotes = new WeakMap()
	let active = null
	let previewEnabled = null
	let previewBaseEnabled = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail
				if (detail?.modId !== MOD_ID || detail.key !== ENABLE_CONFIG_KEY) return
				previewBaseEnabled = api.config.get(ENABLE_CONFIG_KEY, false) !== false
				previewEnabled = typeof detail.value === 'boolean' ? detail.value : null
				queueRefresh(currentState(api.state?.game || active?.game, api), api)
			})
			api.on('afterGameInit', function (_, game) {
				game = game || api.state?.game
				if (active?.frame != null) cancelAnimationFrame(active.frame)
				active = null
				queueRefresh(currentState(game, api), api)
			})
			api.on('afterVanillaScripts', function () {
				if (typeof Game === 'undefined' || !Game.prototype) return

				api.patch(Game.prototype, 'getRealPrice', function (original) {
					return function (name, sale) {
						if (!isEnabled(api)) return original.apply(this, arguments)

						const entity = this.codex?.entities?.[name]
						if (!entity || !Array.isArray(entity.price)) return original.apply(this, arguments)

						// Keep every other price consumer in the chain. The native exponent
						// becomes zero for this quote, including batch offsets and sale.
						const previous = this.entitiesInGame
						const own = Object.prototype.hasOwnProperty.call(this, 'entitiesInGame')
						const counts = Object.assign({}, previous)
						counts[name] = (sale ? 1 : 0) - (Number(arguments[2]) || 0)
						this.entitiesInGame = counts
						try {
							const price = original.apply(this, arguments)
							return Array.isArray(price) ? price.slice() : price
						} finally {
							if (own) this.entitiesInGame = previous
							else delete this.entitiesInGame
						}
					}
				})

				for (const name of ['updateEraseArea', 'updateCloneArea', 'updateClonePositioning']) {
					patch(Game.prototype, name, api, function (original, args) {
						const result = original.apply(this, args)
						rememberQuote(this, name === 'updateEraseArea' ? 'erase' : 'clone', api)
						return result
					})
				}
				for (const [name, type] of [['finalizeErase', 'erase'], ['finalizeCloning', 'clone']]) {
					patch(Game.prototype, name, api, function (original, args) {
						const quoted = quotes.get(this)?.[type]
						if (typeof quoted === 'boolean' && quoted !== isEnabled(api)) refreshToolQuote(this, type, api)
						return original.apply(this, args)
					})
				}
				if (typeof Store !== 'undefined') {
					for (const name of ['compositionUpdate', 'reinit']) patchStore(Store.prototype, name, api)
				}
				if (typeof DesktopStoreVersion !== 'undefined') {
					for (const name of ['init', 'visibilityUpdate']) patchStore(DesktopStoreVersion.prototype, name, api)
				}
				if (typeof Shop !== 'undefined') patchStore(Shop.prototype, 'check', api)
			})
		}
	})

	function patch(prototype, name, api, callback) {
		if (typeof prototype?.[name] !== 'function') return
		api.patch(prototype, name, function (original) {
			return function () { return callback.call(this, original, arguments) }
		})
	}

	function patchStore(prototype, name, api) {
		patch(prototype, name, api, function (original, args) {
			const result = original.apply(this, args)
			const game = this.master
			if (game?.store && game.store !== this) return result
			if (!game?.store && game?.shop && game.shop !== this) return result
			const state = currentState(game, api)
			if (state && !state.refreshing && (state.enabled !== isEnabled(api) || state.store !== (game.store || game.shop))) {
				queueRefresh(state, api)
			}
			return result
		})
	}

	function currentState(game, api) {
		if (!game || (api.state?.game && api.state.game !== game)) return null
		if (active?.game !== game) {
			if (active?.frame != null) cancelAnimationFrame(active.frame)
			active = { game, store: null, enabled: null, frame: null, refreshing: false }
		}
		return active
	}

	function queueRefresh(state, api) {
		if (!state || state.frame != null || state.refreshing) return
		state.frame = requestAnimationFrame(function () {
			state.frame = null
			if (active !== state || (api.state?.game && api.state.game !== state.game)) return
			const game = state.game
			state.refreshing = true
			state.enabled = isEnabled(api)
			state.store = game.store || game.shop
			try {
				if (game.store) {
					game.store.compositionUpdate?.()
					game.store.visibilityUpdate?.()
				} else {
					game.shop?.updateElements?.()
					game.shop?.check?.()
				}
				refreshHeldPrices(game)
				refreshToolQuote(game, game.interactionMode, api)
			} catch (error) {
				state.enabled = null
				console.warn('[Reality Pack] Flat build cost presentation refresh failed.', error)
			} finally {
				state.refreshing = false
			}
		})
	}

	function cloud(game) {
		let hint = new Cloud({ master: game })
		if (hint.master !== game) hint = new Cloud(game)
		return hint
	}

	function refreshHeldPrices(game) {
		// Other consumers can deliberately hide reference prices by removing the
		// hints, or share both hints to suppress a Creative upgrade refund.
		if (!game.itemInHandPriceTag || !game.itemInHand || game.itemInHand.eraser || typeof Cloud === 'undefined') return
		const name = game.itemInHand.name
		const shared = game.itemInHandPriceAndRefundTag === game.itemInHandPriceTag
		const price = game.getRealPrice(name)
		const hint = cloud(game)
		hint.addResourceList(price)
		game.itemInHandPriceTag = hint
		if (shared) game.itemInHandPriceAndRefundTag = hint
		else if (game.codex?.entities?.[name]?.isUpgradeTo) {
			const combined = cloud(game)
			combined.addResourceList(price)
			combined.addLine()
			combined.addRefundList(game.codex.entities[name].isUpgradeTo)
			game.itemInHandPriceAndRefundTag = combined
		}
	}

	function rememberQuote(game, type, api) {
		let quote = quotes.get(game)
		if (!quote) { quote = {}; quotes.set(game, quote) }
		quote[type] = isEnabled(api)
	}

	function refreshToolQuote(game, type, api) {
		if (type === 'erase' && game.selectionOrigin && game.selectionTarget && game.selectionCandidateSet?.size) {
			game.updateEraseArea?.()
		} else if (type === 'clone') {
			if (!game.selectionList) {
				if (game.selectionOrigin && game.selectionTarget && game.selectionCandidateSet?.size) game.updateCloneArea?.()
				return
			}
			const total = new Array(game.resources.length).fill(0)
			const extra = Object.create(null)
			for (const entity of game.selectionList) {
				const count = extra[entity.name] || 0
				const price = game.getRealPrice(entity.name, false, count)
				extra[entity.name] = count + 1
				for (let i = 0; i < price.length; i++) total[i] = (total[i] || 0) + (price[i] || 0)
			}
			game.totalPrice = total
			// Repricing must never turn an invalid spatial selection into a valid
			// one. Native positioning remains responsible for permitting a move.
			if (total.some((value, i) => value > (game.resources[i] || 0))) game.canPlace = false
			if (typeof Cloud !== 'undefined') {
				game.areaHint = cloud(game)
				game.areaHint.addResourceList(total)
			}
			rememberQuote(game, 'clone', api)
		}
	}

	function isEnabled(api) {
		const configured = api.config.get(ENABLE_CONFIG_KEY, false) !== false
		if (previewEnabled !== null && configured !== previewBaseEnabled) {
			previewEnabled = null
			previewBaseEnabled = null
		}
		return previewEnabled === null ? configured : previewEnabled
	}
})()
