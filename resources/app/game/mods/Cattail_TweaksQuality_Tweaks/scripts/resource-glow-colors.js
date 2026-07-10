ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		let previewEnabled = null
		let previewColors = null

		installConfigPreviewListener()

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined') return
			patchResourceGlow(api)
		})

		function installConfigPreviewListener() {
			try {
				window.addEventListener('modloader:config-preview', function (event) {
					const detail = event?.detail || {}
					if (detail.modId !== 'Cattail_TweaksQuality_Tweaks') return
					if (detail.key === 'enableResourceGlowColors') previewEnabled = detail.value !== false
					if (detail.key === 'resourceGlowColors') previewColors = readObject(detail.value)
				})
			} catch (error) {}
		}
		function patchResourceGlow(api) {
			api.patch(Game.prototype, 'renderResources', function (original) {
				return function (...args) {
					const enabled = previewEnabled === null ? api.config.get('enableResourceGlowColors', true) : previewEnabled
					if (enabled === false) return original.apply(this, args)
					return renderResourcesWithColoredGlow(this, original, args)
				}
			})
		}

		function renderResourcesWithColoredGlow(game, original, args) {
			const ctx = game?.ctx
			if (!ctx || typeof ctx.arc !== 'function' || typeof ctx.fill !== 'function') return original.apply(game, args)

			const originalTranslate = ctx.translate
			const originalArc = ctx.arc
			const originalFill = ctx.fill
			const originalRestore = ctx.restore
			let activeResource = null
			let pendingGlowResource = null

			ctx.translate = function (x, y) {
				const result = originalTranslate.apply(this, arguments)
				const resourceId = matchResourceHome(game, x, y)
				if (Number.isInteger(resourceId)) activeResource = resourceId
				return result
			}

			ctx.arc = function (x, y, radius) {
				if (Number.isInteger(activeResource) && isResourceGlowArc(game, x, y, radius)) {
					pendingGlowResource = activeResource
				}
				return originalArc.apply(this, arguments)
			}

			ctx.fill = function () {
				if (Number.isInteger(pendingGlowResource)) {
					const resourceId = pendingGlowResource
					pendingGlowResource = null
					const previousFillStyle = this.fillStyle
					this.fillStyle = createResourceGlow(game, resourceId)
					try {
						return originalFill.apply(this, arguments)
					} finally {
						this.fillStyle = previousFillStyle
					}
				}
				return originalFill.apply(this, arguments)
			}

			ctx.restore = function () {
				const result = originalRestore.apply(this, arguments)
				activeResource = null
				pendingGlowResource = null
				return result
			}

			try {
				return original.apply(game, args)
			} finally {
				ctx.translate = originalTranslate
				ctx.arc = originalArc
				ctx.fill = originalFill
				ctx.restore = originalRestore
			}
		}

		function matchResourceHome(game, x, y) {
			const homes = game?.resourceHomes || []
			const resources = game?.resources || []
			const tolerance = Math.max(1, game?.pixelRatio || 1, (game?.screenUnit || 0) * .02)
			for (let i = 0; i < homes.length; i++) {
				if (!resources[i] || !Array.isArray(homes[i])) continue
				if (Math.abs(Number(x) - homes[i][0]) <= tolerance && Math.abs(Number(y) - homes[i][1]) <= tolerance) return i
			}
			return null
		}

		function isResourceGlowArc(game, x, y, radius) {
			const expectedRadius = (game?.screenUnit || 0) * .4
			const tolerance = Math.max(1, (game?.pixelRatio || 1) * 2)
			return Math.abs(Number(x) || 0) <= tolerance && Math.abs(Number(y) || 0) <= tolerance && Math.abs(Number(radius) - expectedRadius) <= tolerance
		}

		function createResourceGlow(game, resourceId) {
			const radius = (game?.screenUnit || 1) * .4
			const color = getResourceGlowColor(game, resourceId)
			const glow = game.ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
			glow.addColorStop(.46, hexToRgba(color, .95))
			glow.addColorStop(.74, hexToRgba(color, .42))
			glow.addColorStop(1, hexToRgba(color, 0))
			return glow
		}

		function getResourceGlowColor(game, resourceId) {
			const overrides = previewColors === null ? readObject(api.config.get('resourceGlowColors', {})) : previewColors
			const override = overrides[resourceId] ?? overrides[String(resourceId)] ?? overrides['r' + resourceId]
			return normalizeHexColor(override) || getDefaultResourceColor(game, resourceId) || '#FFFFFF'
		}

		function getDefaultResourceColor(game, resourceId) {
			const resource = game?.codex?.resources?.[resourceId]
			return normalizeHexColor(resource?.triplet?.[2]) || normalizeHexColor(resource?.triplet?.[1]) || normalizeHexColor(resource?.triplet?.[0])
		}

		function readObject(value) {
			return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
		}

		function normalizeHexColor(value) {
			if (value === undefined || value === null) return ''
			const text = String(value).trim()
			const shortMatch = text.match(/^#?([0-9a-f]{3})$/i)
			if (shortMatch) {
				return '#' + shortMatch[1].split('').map(function (part) { return part + part }).join('').toUpperCase()
			}
			const fullMatch = text.match(/^#?([0-9a-f]{6})$/i)
			return fullMatch ? '#' + fullMatch[1].toUpperCase() : ''
		}

		function hexToRgba(value, alpha) {
			const color = normalizeHexColor(value) || '#FFFFFF'
			const number = parseInt(color.slice(1), 16)
			const r = (number >> 16) & 255
			const g = (number >> 8) & 255
			const b = number & 255
			return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
		}
	}
})