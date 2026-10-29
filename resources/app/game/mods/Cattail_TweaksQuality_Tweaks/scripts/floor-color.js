(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailTweaksFloorColorInstalled'
	const enableConfigKey = 'enableFloorColor'
	const realityColorConfigKey = 'floorColor'
	const defaultRealityColor = '#FFFFFF'
	const legacyMigrationKey = '__cattailTweaksFloorColorLegacyMigration'
	const grayStripWidth = .2

	let previewEnabled = null
	let previewRealityColor = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			installConfigPreviewListener()
			api.on('afterVanillaScripts', function () {
				installFloorColorOverride(api)
			})
			api.on('afterGameInit', function (payload, game) {
				migrateLegacyAccessibilityConfig(api, game)
			})
		}
	})

	function installConfigPreviewListener() {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID) return
				if (detail.key === enableConfigKey) previewEnabled = detail.value === true
				if (detail.key === realityColorConfigKey) previewRealityColor = detail.value
			})
		} catch (error) {}
	}

	function installFloorColorOverride(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				const ctx = this.ctx
				if (!ctx || typeof ctx.fillRect !== 'function') return original.apply(this, args)

				const originalFillRect = ctx.fillRect
				const game = this
				let replacedBackground = false

				ctx.fillRect = function (x, y, w, h) {
					if (!replacedBackground && shouldOverrideRealityFloor(game, api) && x === 0 && y === 0 && w === game.w && h === game.h) {
						replacedBackground = true
						const previousFillStyle = this.fillStyle
						this.fillStyle = getRealityFloorColor(api)
						try {
							return originalFillRect.apply(this, arguments)
						} finally {
							this.fillStyle = previousFillStyle
						}
					}
					return originalFillRect.apply(this, arguments)
				}

				try {
					return original.apply(this, args)
				} finally {
					if (ctx.fillRect !== originalFillRect) ctx.fillRect = originalFillRect
				}
			}
		})
	}

	function shouldOverrideRealityFloor(game, api) {
		if (!game || game.halt || game.plane) return false
		return previewEnabled === null ? api.config.get(enableConfigKey, true) === true : previewEnabled === true
	}

	function getRealityFloorColor(api) {
		if (previewRealityColor !== null) return normalizeHexColor(previewRealityColor) || defaultRealityColor
		return normalizeHexColor(api.config.get(realityColorConfigKey, '')) || defaultRealityColor
	}

	function migrateLegacyAccessibilityConfig(api, game) {
		if (!game || game[legacyMigrationKey]) return
		game[legacyMigrationKey] = true
		if (!hasStoredConfig(enableConfigKey)) {
			const legacyOverride = readStorage(legacyStorageKey(game, 'floorOverride'))
			if (legacyOverride !== null) api.config.set(enableConfigKey, legacyOverride !== 'false')
		}
		if (!hasStoredConfig(realityColorConfigKey)) {
			const legacyPalette = parsePalettePosition(readStorage(legacyStorageKey(game, 'floorPalette')))
			const legacyColor = normalizeHexColor(readStorage(legacyStorageKey(game, 'floorColor')))
			const migratedColor = legacyPalette ? paletteHexColor(legacyPalette.x, legacyPalette.y) : legacyColor
			if (migratedColor) api.config.set(realityColorConfigKey, migratedColor)
		}
	}

	function hasStoredConfig(key) {
		const legacyKey = key === enableConfigKey ? 'enableFloorColorOverride' : key === realityColorConfigKey ? 'floorColorOverrideRealityColor' : key
		return readStorage('modloader:' + MOD_ID + ':config:' + key) !== null || readStorage('modloader:' + MOD_ID + ':config:' + legacyKey) !== null
	}

	function legacyStorageKey(game, key) {
		return 'cattailAccessibilityButtons:' + (game?.steamId || 'default') + ':' + key
	}

	function readStorage(key) {
		try {
			return localStorage.getItem(key)
		} catch (error) {
			return null
		}
	}

	function parsePalettePosition(value) {
		if (!value) return null
		try {
			const parsed = JSON.parse(value)
			if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null
			return { x: clamp(parsed.x, 0, 1), y: clamp(parsed.y, 0, 1) }
		} catch (error) {
			return null
		}
	}

	function paletteHexColor(x, y) {
		const normalizedX = clamp(x, 0, 1)
		const lightness = clamp(y, 0, 1)
		if (normalizedX <= grayStripWidth) {
			const channel = Math.round((1 - lightness) * 255)
			return rgbToHex(channel, channel, channel)
		}
		const hueX = (normalizedX - grayStripWidth) / (1 - grayStripWidth)
		return hslToHex(clamp(hueX, 0, 1) * 360, 1, 1 - lightness)
	}

	function hslToHex(h, s, l) {
		const c = (1 - Math.abs(2 * l - 1)) * s
		const hp = (((h % 360) + 360) % 360) / 60
		const x = c * (1 - Math.abs((hp % 2) - 1))
		let r = 0
		let g = 0
		let b = 0
		if (hp < 1) {
			r = c
			g = x
		} else if (hp < 2) {
			r = x
			g = c
		} else if (hp < 3) {
			g = c
			b = x
		} else if (hp < 4) {
			g = x
			b = c
		} else if (hp < 5) {
			r = x
			b = c
		} else {
			r = c
			b = x
		}
		const m = l - c / 2
		return rgbToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255))
	}

	function rgbToHex(r, g, b) {
		return '#' + [r, g, b].map(function (channel) {
			return clamp(channel, 0, 255).toString(16).padStart(2, '0')
		}).join('').toUpperCase()
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

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value))
	}
})()
