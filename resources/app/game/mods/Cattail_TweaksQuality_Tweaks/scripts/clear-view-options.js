(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const gridOffKey = 'enableClearViewGridBlock'
	const clippingOffKey = 'enableClearViewClipBlock'
	const styleKey = 'enableClearViewGridStyle'
	const installedKey = '__cattailTweaksClearViewOptionsInstalled'
	const preview = Object.create(null)

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			let activeGame = null
			let gridInstalled = false
			let clippingInstalled = false
			function enabled(key) {
				return key in preview ? preview[key] : api.config.get(key, false) === true
			}
			function supported(game) {
				return game?.version === '1.3' && !game.isMobile
			}
			function inMethodLayer(game, method, draw) {
				const render = api.render
				const layer = render?.getMethodLayer?.(method)
				// Hot installation can wrap the Loader's existing route. Enter its
				// demanded layer first, so both startup orders affect the actual ctx.
				if (layer && render?.isEnabled?.() !== false && render?.layers?.isDemanded?.(layer) && typeof render.withLayer === 'function') {
					return render.withLayer(layer, draw, { game, persistent: false })
				}
				return draw()
			}
			function install() {
				if (!supported(activeGame) || typeof Game === 'undefined') return
				// Leave the native diagnostic fingerprint intact on an all-off startup.
				// Once installed, wrappers remain inert when the hot options are off.
				if (!gridInstalled && (enabled(gridOffKey) || enabled(styleKey)) && typeof Game.prototype.renderGrid === 'function') {
					api.patch(Game.prototype, 'renderGrid', function (original) {
						return function (...args) {
							if (!supported(this)) return original.apply(this, args)
							const hide = enabled(gridOffKey)
							const replace = !hide && enabled(styleKey)
							if ((!hide && !replace) || !this.ctx) return original.apply(this, args)
							return inMethodLayer(this, 'renderGrid', () => {
								if (replace && (window.CattailTweaks?.gridV1 || window.__cattailTweaksFloorGridV1)?.renderClearView(this, this.ctx) !== true) return original.apply(this, args)
								const ctx = this.ctx
								const descriptor = Object.getOwnPropertyDescriptor(ctx, 'stroke')
								// Run native renderGrid for its occupied-cell fills. Only its
								// grid strokes are suppressed; no input/world state is changed.
								ctx.stroke = function () {}
								try {
									return original.apply(this, args)
								} finally {
									if (descriptor) Object.defineProperty(ctx, 'stroke', descriptor)
									else delete ctx.stroke
								}
							})
						}
					})
					gridInstalled = true
				}
				if (!clippingInstalled && enabled(clippingOffKey) && typeof Game.prototype.renderEntitiesAbstract === 'function') {
					api.patch(Game.prototype, 'renderEntitiesAbstract', function (original) {
						return function (...args) {
							if (!supported(this) || !enabled(clippingOffKey) || this.plane || !this.ctx) return original.apply(this, args)
							return inMethodLayer(this, 'renderEntitiesAbstract', () => {
								// Mirror only the desktop 1.3 abstract entity loop, omitting
								// its outer diamond. Do not switch to renderEntities/caches,
								// or intercept clip() used inside an entity's own renderer.
								const placement = window.__cattailPlacementRenderHooksV1
								const pass = placement?.beginPass(this)
								let complete = false
								try {
									for (let i = 0; i < this.stuff.length; i++) {
										const entity = this.stuff[i]
										if (pass) placement.visit(this, entity, pass)
										if (entity.name === 'conductor' || !this.isVisible(entity)) continue
										this.ctx.save()
										try { entity.render(args[0]) } finally { this.ctx.restore() }
									}
									complete = true
								} finally { if (pass) placement.endPass(this, pass, complete) }
							})
						}
					})
					clippingInstalled = true
				}
			}
			api.on('afterVanillaScripts', function (_payload, game) {
				if (window[installedKey]) return
				window[installedKey] = true
				activeGame = game
				install()
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail || {}
					if (detail.modId !== MOD_ID || ![gridOffKey, clippingOffKey, styleKey].includes(detail.key)) return
					preview[detail.key] = detail.value === true
					install()
				})
			})
		}
	})
})()
