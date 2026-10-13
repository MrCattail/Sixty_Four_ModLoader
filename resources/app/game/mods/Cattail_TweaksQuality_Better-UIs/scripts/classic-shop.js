ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('shopVersion', '1.3') !== '1.2.1') return

		// Private to the two Better UIs entries. Keep game.store and its 1.3 data
		// contract intact; do not revive game.shop or instantiate the legacy Shop.
		const serviceKey = Symbol.for('cattail.better-uis.classic-shop')
		const views = new WeakMap()
		const listeners = new Set()
		let activeView
		window[serviceKey] = {
			subscribe(listener) {
				listeners.add(listener)
				if (activeView) listener(activeView)
				return () => listeners.delete(listener)
			}
		}

		api.on('afterVanillaScripts', function () {
			if (typeof DesktopStoreVersion === 'undefined' || typeof Store === 'undefined') return
			api.patch(DesktopStoreVersion.prototype, 'init', original => function (...args) {
				const result = original.apply(this, args)
				if (this.master.isMobile) return result
				installStyles()
				let view = views.get(this)
				if (!view) {
					activeView?.dispose()
					view = createView(this)
					views.set(this, view)
					activeView = view
					for (const listener of listeners) listener(view)
				}
				view.rebuild()
				return result
			})
			for (const [prototype, method] of [[Store.prototype, 'compositionUpdate'], [DesktopStoreVersion.prototype, 'visibilityUpdate']]) {
				api.patch(prototype, method, original => function (...args) {
					const result = original.apply(this, args)
					views.get(this)?.sync()
					return result
				})
			}
			api.patch(DesktopStoreVersion.prototype, 'centerItem', original => function (name) {
				const view = views.get(this)
				return view ? view.centerItem(name) : original.call(this, name)
			})
			api.patch(DesktopStoreVersion.prototype, 'closeTypes', original => function (...args) {
				const result = original.apply(this, args)
				views.get(this)?.closeCategories?.()
				return result
			})
		})

		function createView(store) {
			const master = store.master
			const vessel = document.createElement('div')
			vessel.className = 'shop cattail-classic-shop'
			document.body.append(vessel)
			store.vessel.classList.add('cattail-classic-native')
			const shopToggle = document.createElement('div')
			shopToggle.className = 'shopToggle cattail-classic-size-toggle'
			shopToggle.setAttribute('role', 'button')
			shopToggle.tabIndex = -1
			api.ui?.registerCornerButton({ id: 'classic-shop-size', element: shopToggle, anchor: 'game-bottom-right', order: 20, hideOnMobile: true })
			if (!shopToggle.isConnected) document.body.append(shopToggle)
			const syncListeners = new Set()
			const rebuildListeners = new Set()
			const disposeListeners = new Set()
			let disposed = false
			const view = {
				store, master, vessel, shopToggle, items: [],
				onSync(fn) { syncListeners.add(fn) },
				onRebuild(fn) { rebuildListeners.add(fn) },
				onDispose(fn) { disposeListeners.add(fn) },
				rebuild() {
					const scrollTop = vessel.scrollTop
					for (const listener of rebuildListeners) listener()
					vessel.replaceChildren()
					view.items = []
					let pack
					for (const [name, html] of Object.entries(store.html.items)) {
						const entity = master.codex.entities[name]
						const item = { name, html, priceHtml: store.html.priceContainers[name], counter: store.html.counters[name], visible: false }
						view.items.push(item)
						html.classList.add('shopItem')
						html.dataset.classicItem = name
						if (entity.merge && !pack) {
							pack = document.createElement('div')
							pack.className = 'shopPack'
							vessel.append(pack)
						}
						// Move the real Store card, retaining native purchase handlers and
						// price/counter references. No parallel price or unlock calculation.
						;(pack || vessel).append(html)
						if (!entity.merge) pack = null
					}
					view.sync()
					vessel.scrollTop = scrollTop
				},
				sync() {
					if (disposed) return
					const hidden = !!(api.ui?.isVanillaGameHudHidden?.(master) || master.pinhole || master.credits || store.vessel.style.display === 'none')
					vessel.hidden = shopToggle.hidden = hidden
					vessel.classList.toggle('memory_faded', store.vessel.classList.contains('memory_faded'))
					vessel.classList.toggle('darkShop', !!master.plane)
					shopToggle.title = ['sch', 'modsch'].includes(master.language) ? '缩小 / 展开商店' : master.language === 'tch' ? '縮小 / 展開商店' : 'Minimize / expand shop'
					shopToggle.setAttribute('aria-label', shopToggle.title)
					shopToggle.setAttribute('aria-pressed', vessel.classList.contains('minimized') ? 'true' : 'false')
					for (const item of view.items) {
						const dark = master.codex.entities[item.name].type === 'dark'
						item.visible = dark === !!master.plane && !item.html.classList.contains('hidden')
						item.html.classList.toggle('cattail-classic-hidden', !item.visible)
					}
					for (const pack of vessel.querySelectorAll(':scope > .shopPack')) {
						pack.classList.toggle('visible', !!pack.querySelector('.shopItem:not(.cattail-classic-hidden)'))
					}
					for (const listener of syncListeners) listener()
				},
				activate(name) {
					// Recheck at the moment of purchase: a compact row may be stale.
					store.visibilityUpdate()
					const item = view.items.find(entry => entry.name === name)
					if (!item?.visible || item.html.classList.contains('disabled') || vessel.hidden || api.ui?.hud?.isHidden?.()) return
					item.html.onmousedown?.(new MouseEvent('mousedown'))
				},
				centerItem(name) {
					store.visibilityUpdate()
					const item = view.items.find(entry => entry.name === name)
					if (!item?.visible) return
					if (!view.centerCategory?.(name)) view.scrollToItem(item.html)
				},
				scrollToItem(element) {
					requestAnimationFrame(() => {
						if (!element.isConnected || disposed) return
						const outer = vessel.getBoundingClientRect(), inner = element.getBoundingClientRect()
						vessel.scrollTo({ top: vessel.scrollTop + inner.top - outer.top - (outer.height - inner.height) / 2, behavior: 'smooth' })
					})
				},
				dispose() {
					if (disposed) return
					disposed = true
					for (const listener of disposeListeners) listener()
					releaseHud?.()
					api.ui?.unregisterCornerButton('classic-shop-size')
					shopToggle.remove()
					vessel.remove()
					store.vessel.classList.remove('cattail-classic-native')
					views.delete(store)
				}
			}
			const releaseHud = api.ui?.registerHud({
				id: 'classic-shop', element: vessel, side: 'right',
				capture: () => ({ scrollTop: vessel.scrollTop }),
				restore: state => { if (state) vessel.scrollTop = state.scrollTop }
			})
			// Keep store clicks and wheel gestures out of the world controls.
			for (const element of [vessel, shopToggle]) {
				for (const name of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
					element.addEventListener(name, event => event.stopPropagation())
				}
			}
			shopToggle.addEventListener('mousedown', event => event.preventDefault())
			shopToggle.onclick = () => {
				vessel.classList.toggle('minimized')
				shopToggle.classList.toggle('toggled', vessel.classList.contains('minimized'))
				view.sync()
			}
			return view
		}

		function installStyles() {
			if (document.getElementById('cattail-classic-shop-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-classic-shop-style'
			style.textContent = `
.cattail-classic-shop, .store.cattail-classic-native {
	--classic-edge-gap: 8px;
	--classic-scrollbar-width: 14px;
}
.cattail-classic-shop {
	--classic-width: min(calc(var(--unit) * 15.8), calc(100vw - var(--unit) * 5.5));
	position: absolute; z-index: 1; top: 0; right: var(--classic-edge-gap); bottom: calc(var(--unit) * 3.8);
	/* Add the gutter outside the existing card width, even before overflow. */
	box-sizing: border-box; width: calc(var(--classic-width) + var(--classic-scrollbar-width)); height: auto;
	padding: 8px 1px 8px 8px; overflow-x: hidden; overflow-y: scroll; overscroll-behavior: contain;
	font: calc(var(--unit) * .86) Montserrat, sans-serif; color: #111; transition: opacity 1s;
}
.cattail-classic-shop.minimized { font-size: calc(var(--unit) * .9); }
.cattail-classic-shop[hidden], .cattail-classic-size-toggle[hidden] { display: none !important; }
.cattail-classic-shop.memory_faded { opacity: 0; pointer-events: none; }
.cattail-classic-shop::-webkit-scrollbar { width: var(--classic-scrollbar-width); }
.cattail-classic-shop::-webkit-scrollbar-track { background: transparent; }
.cattail-classic-shop::-webkit-scrollbar-thumb { border: 3px solid transparent; background: #0006; border-radius: 12px; background-clip: padding-box; }
.cattail-classic-shop::-webkit-scrollbar-thumb:hover { background-color: #0009; }
.store.cattail-classic-native { right: calc(min(calc(var(--unit) * 16.1), calc(100vw - var(--unit) * 5.2)) + var(--classic-scrollbar-width) + var(--classic-edge-gap)); }
.store.cattail-classic-native > .element:not(.eraser):not(.relocator) { display: none !important; }
.cattail-classic-shop .shopItem { position: relative; padding: var(--unit); background: #fff; margin-bottom: var(--unit); border-radius: calc(var(--unit) * .24); box-shadow: 0 calc(var(--unit) * .24) calc(var(--unit) * .48) #0001; cursor: pointer; }
.cattail-classic-shop .shopItem.hidden, .cattail-classic-shop .cattail-classic-hidden { display: none !important; }
.cattail-classic-shop .shopItem.disabled { box-shadow: none; cursor: default; }
.cattail-classic-shop .imageVessel { position: relative; text-align: center; pointer-events: none; }
.cattail-classic-shop .imageVessel img { width: 50%; }
.cattail-classic-shop .shopItem.disabled .imageVessel { filter: grayscale(90%); opacity: .4; }
.cattail-classic-shop .upgradeFrom { position: absolute; top: calc(var(--unit) * 1.5); left: calc(var(--unit) * -.3); width: calc(var(--unit) * 3); height: calc(var(--unit) * 3); background-size: contain; background-repeat: no-repeat; opacity: .6; }
.cattail-classic-shop .upgradeFrom:after { content: ''; background: url('img/shop/upgrade.svg') center / contain no-repeat; position: absolute; width: var(--unit); height: var(--unit); right: 0; top: 50%; transform: translate(100%, -50%); }
.cattail-classic-shop .itemHeader { font-weight: 600; text-align: center; }
.cattail-classic-shop .itemDescription { font-size: calc(var(--unit) * .8); line-height: 150%; margin: 1em 0; }
.cattail-classic-shop .itemPrice { font-size: calc(var(--unit) * .8); line-height: 150%; text-align: center; }
.cattail-classic-shop .priceString { margin: 0 calc(var(--unit) * .9) 0 calc(var(--unit) * .2); }
.cattail-classic-shop .shopItem.disabled { color: #b6aeae; }
.cattail-classic-shop .shopItem.disabled .available { color: #000; }
.cattail-classic-shop .itemCounter { position: absolute; top: calc(var(--unit) * .4); right: calc(var(--unit) * .6); font-size: calc(var(--unit) * .8); color: #aab; }
.cattail-classic-shop .existed { position: absolute; top: 6px; left: 6px; background: #ffe978; color: #222; padding: 4px 6px; border-radius: 3px; font-weight: 600; }
.cattail-classic-shop.minimized .shopItem { padding: calc(var(--unit) * 2) var(--unit); }
.cattail-classic-shop.minimized .imageVessel, .cattail-classic-shop.minimized .itemDescription { display: none; }
.cattail-classic-shop.minimized .newItem .itemDescription { display: block; }
.cattail-classic-shop.minimized .itemHeader { font-size: calc(var(--unit) * .9); margin-bottom: calc(var(--unit) * .5); overflow-wrap: anywhere; }
.cattail-classic-shop .shopPack { display: none; position: relative; overflow: hidden; margin-bottom: var(--unit); border-radius: 4px; box-shadow: 0 calc(var(--unit) * .24) calc(var(--unit) * .48) #0001; }
.cattail-classic-shop .shopPack.visible { display: block; }
.cattail-classic-shop .shopPack .shopItem { margin: 0; border-radius: 0; box-shadow: none; }
.cattail-classic-shop .shopPack .shopItem + .shopItem { border-top: 1px dashed #0001; }
.cattail-classic-shop.darkShop { color: #fff; }
.cattail-classic-shop.darkShop .shopItem { background: #111114; }
.cattail-classic-shop.darkShop .shopItem.disabled { color: #5c5c5c; }
.cattail-classic-shop.darkShop .shopItem.disabled .available { color: #fff; }
`
			document.head.append(style)
		}
	}
})
