const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
const LEGACY_VIEW_DISTANCE_MOD_ID = 'Cattail_TweaksQuality_View-Distance'
const DEFAULT_FARTHEST_ZOOM = 0.12
const DEFAULT_CLOSEST_ZOOM = 4
const DEFAULT_FALLBACK_ZOOM = 1
const ABSOLUTE_MIN_ZOOM = 0.03
const ABSOLUTE_MAX_ZOOM = 24

ModLoader.register({
	id: MOD_ID,
	init(api) {
		if (api.config.get('enableViewDistance', true) === false) return
		migrateLegacyZoomConfig(api)

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined') return

			api.patch(Game.prototype, 'zoomInOut', function (original) {
				return function (...args) {
					applyZoomRange(this, api)
					const result = original.apply(this, args)
					applyZoomRange(this, api)
					return result
				}
			})

			api.patch(Game.prototype, 'saveGame', function (original) {
				return function (...args) {
					applyZoomRange(this, api)
					return original.apply(this, args)
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			applyZoomRange(game, api, { restoreSavedZoom: true })
		})
	}
})

function applyZoomRange(game, api, options = {}) {
	if (!game) return getZoomRange(api)

	const range = getZoomRange(api)
	game.zoomRange = range

	const fallback = getFallbackZoom(api, range)
	if (options.restoreSavedZoom) {
		const storedZoom = readSavedZoom(game)
		if (storedZoom !== null) {
			game.zoom = clamp(storedZoom, range[0], range[1])
			return range
		}
	}

	const currentZoom = Number(game.zoom)
	game.zoom = Number.isFinite(currentZoom) ? clamp(currentZoom, range[0], range[1]) : fallback
	return range
}

function getZoomRange(api) {
	const farthest = readZoomConfig(api, 'farthestZoom', DEFAULT_FARTHEST_ZOOM)
	const closest = readZoomConfig(api, 'closestZoom', DEFAULT_CLOSEST_ZOOM)
	const low = Math.min(farthest, closest)
	const high = Math.max(farthest, closest)

	return [
		clamp(low, ABSOLUTE_MIN_ZOOM, ABSOLUTE_MAX_ZOOM),
		clamp(Math.max(high, low), ABSOLUTE_MIN_ZOOM, ABSOLUTE_MAX_ZOOM)
	]
}

function getFallbackZoom(api, range) {
	const fallback = readZoomConfig(api, 'fallbackZoom', DEFAULT_FALLBACK_ZOOM)
	return clamp(fallback, range[0], range[1])
}

function readZoomConfig(api, key, fallback) {
	const value = Number(readConfigWithLegacy(api, key, fallback))
	if (!Number.isFinite(value) || value <= 0) return fallback
	return value
}

function readConfigWithLegacy(api, key, fallback) {
	try {
		const ownRaw = localStorage.getItem(configStorageKey(api.id, key))
		if (ownRaw !== null) return parseStoredConfigValue(ownRaw)
		const legacyRaw = localStorage.getItem(configStorageKey(LEGACY_VIEW_DISTANCE_MOD_ID, key))
		if (legacyRaw !== null) return parseStoredConfigValue(legacyRaw)
	} catch (error) {}
	return api.config.get(key, fallback)
}

function migrateLegacyZoomConfig(api) {
	for (const key of ['farthestZoom', 'closestZoom', 'fallbackZoom']) {
		try {
			const ownKey = configStorageKey(api.id, key)
			if (localStorage.getItem(ownKey) !== null) continue
			const legacyRaw = localStorage.getItem(configStorageKey(LEGACY_VIEW_DISTANCE_MOD_ID, key))
			if (legacyRaw !== null) localStorage.setItem(ownKey, legacyRaw)
		} catch (error) {}
	}
}

function configStorageKey(modId, key) {
	return 'modloader:' + modId + ':config:' + key
}

function parseStoredConfigValue(raw) {
	try {
		return JSON.parse(raw)
	} catch (error) {
		return raw
	}
}

function readSavedZoom(game) {
	try {
		const raw = localStorage.getItem('abstractv03_zoom' + (game.steamId || ''))
		if (raw === null || raw === '') return null

		const value = Number(raw)
		return Number.isFinite(value) ? value : null
	} catch (error) {
		return null
	}
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}
