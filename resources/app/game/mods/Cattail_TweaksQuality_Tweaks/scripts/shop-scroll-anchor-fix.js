(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const configKey = 'enableShopScrollAnchorFix'
	const installedKey = '__cattailShopScrollAnchorFixInstalled'
	const shopItemSelector = '.shopItem, .cattail-shop-category-item'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installShopScrollAnchorFix(api)
			})
		}
	})

	function installShopScrollAnchorFix(api) {
		if (window[installedKey] || typeof Element === 'undefined') return
		window[installedKey] = true

		api.patch(Element.prototype, 'scrollIntoView', function (original) {
			return function () {
				if (!isEnabled(api)) return original.apply(this, arguments)
				const target = getShopScrollTarget(this)
				if (!target) return original.apply(this, arguments)
				scrollInsideShop(target.shop, target.item, arguments[0])
				return undefined
			}
		})
	}

	function getShopScrollTarget(element) {
		if (!element || typeof element.closest !== 'function') return null
		const shop = element.closest('.shop')
		if (!shop) return null
		const item = element.matches?.(shopItemSelector) ? element : element.closest(shopItemSelector)
		if (!item || !shop.contains(item)) return null
		return { shop: shop, item: item }
	}

	function scrollInsideShop(shop, item, options) {
		const current = Number(shop.scrollTop) || 0
		const target = calculateScrollTop(shop, item, options)
		if (!Number.isFinite(target)) return

		const clamped = clamp(target, 0, Math.max(0, shop.scrollHeight - shop.clientHeight))
		const behavior = getScrollBehavior(options)
		if (Math.abs(current - clamped) > 0.5) {
			try {
				shop.scrollTo({ top: clamped, behavior: behavior })
			} catch (error) {
				shop.scrollTop = clamped
			}
		}
		resetViewportScrollSoon()
	}

	function calculateScrollTop(shop, item, options) {
		const block = getScrollBlock(options)
		const shopRect = shop.getBoundingClientRect()
		const itemRect = item.getBoundingClientRect()
		const current = Number(shop.scrollTop) || 0
		const itemTop = current + itemRect.top - shopRect.top
		const itemBottom = itemTop + itemRect.height
		const viewTop = current
		const viewBottom = current + shop.clientHeight

		if (block === 'nearest') {
			if (itemTop < viewTop) return itemTop
			if (itemBottom > viewBottom) return itemBottom - shop.clientHeight
			return current
		}
		if (block === 'end') return itemBottom - shop.clientHeight
		if (block === 'start') return itemTop
		return itemTop - (shop.clientHeight - itemRect.height) / 2
	}

	function getScrollBlock(options) {
		if (options && typeof options === 'object' && typeof options.block === 'string') return options.block
		if (options === false) return 'end'
		if (options === true) return 'start'
		return 'start'
	}

	function getScrollBehavior(options) {
		if (options && typeof options === 'object' && typeof options.behavior === 'string') return options.behavior
		return 'auto'
	}

	function resetViewportScrollSoon() {
		resetViewportScroll()
		requestAnimationFrame(resetViewportScroll)
		setTimeout(resetViewportScroll, 80)
		setTimeout(resetViewportScroll, 260)
	}

	function resetViewportScroll() {
		try {
			if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
			if (document.documentElement) {
				document.documentElement.scrollLeft = 0
				document.documentElement.scrollTop = 0
			}
			if (document.body) {
				document.body.scrollLeft = 0
				document.body.scrollTop = 0
			}
		} catch (error) {}
	}

	function isEnabled(api) {
		return api?.config?.get(configKey, true) !== false
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value))
	}
})()