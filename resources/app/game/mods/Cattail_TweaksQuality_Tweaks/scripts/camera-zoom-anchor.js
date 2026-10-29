(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailTweaksCameraZoomAnchorInstalled'
	const mouseAnchoredZoomConfigKey = 'enableCameraZoomAnchor'
	const mouseAnchoredWaypointConfigKey = 'enableCameraWaypointAnchor'
	const minZoom = 0.000001

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installMouseAnchoredCamera(api)
			})
		}
	})

	function installMouseAnchoredCamera(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		patchMouseAnchoredZoom(api)
		patchMouseAnchoredWaypointTeleport(api)
	}

	function patchMouseAnchoredZoom(api) {
		api.patch(Game.prototype, 'zoomInOut', function (original) {
			return function (...args) {
				if (!isMouseAnchoredZoomEnabled(api)) return original.apply(this, args)
				const pivot = captureMousePivot(this)
				const result = original.apply(this, args)
				syncZoomUnit(this)
				if (restoreMousePivot(this, pivot)) refreshCameraState(this)
				return result
			}
		})
	}

	function patchMouseAnchoredWaypointTeleport(api) {
		api.patch(Game.prototype, 'useWaypoint', function (original) {
			return function (waypoint, ...args) {
				const target = isMouseAnchoredWaypointTeleportEnabled(api) ? getNextWaypoint(this, waypoint) : null
				const xy = target ? getMouseScreenPoint(this) : null
				const result = original.apply(this, [waypoint, ...args])
				if (target && xy && alignRenderedPositionToScreenPoint(this, target.position, xy)) {
					refreshCameraState(this)
				}
				return result
			}
		})
	}

	function getNextWaypoint(game, waypoint) {
		const list = Array.isArray(game?.waypointList) ? game.waypointList : null
		if (!list?.length || !waypoint) return null
		for (let index = 0; index < list.length; index++) {
			if (list[index] === waypoint) return list[(index + 1) % list.length] || null
		}
		return null
	}

	function captureMousePivot(game) {
		try {
			const xy = getMouseScreenPoint(game)
			if (!xy || typeof game.xyToUV !== 'function') return null
			const uv = game.xyToUV(xy)
			if (!Array.isArray(uv) || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) return null
			return { xy, uv: [uv[0], uv[1]] }
		} catch (error) {
			return null
		}
	}

	function restoreMousePivot(game, pivot) {
		if (!pivot) return
		return alignWorldPointToScreenPoint(game, pivot.uv, pivot.xy)
	}

	function getMouseScreenPoint(game) {
		// Desktop 1.3 stores unscaled pointer coordinates in sxy, not xy.
		const point = game?.mouse?.sxy
		if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null
		return [point[0], point[1]]
	}

	function alignWorldPointToScreenPoint(game, uv, xy) {
		return alignWorldPositionToScreenPoint(game, uv, xy, getProjectionOriginOffset(game))
	}

	function alignRenderedPositionToScreenPoint(game, uv, xy) {
		return alignWorldPositionToScreenPoint(game, uv, xy, null)
	}

	function alignWorldPositionToScreenPoint(game, uv, xy, projectionOffset) {
		try {
			if (!game?.translation || typeof game.uvToXY !== 'function') return
			if (!Array.isArray(uv) || !Array.isArray(xy)) return
			const projected = game.uvToXY(uv)
			if (!Array.isArray(projected) || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return
			const target = getCenteredScreenPoint(game, xy)
			if (!target) return
			if (projectionOffset) {
				target[0] += projectionOffset[0]
				target[1] += projectionOffset[1]
			}
			const zoom = Number(game.zoom)
			if (!Number.isFinite(zoom) || Math.abs(zoom) < minZoom) return
			game.translation[0] += (projected[0] - target[0]) / zoom
			game.translation[1] += (projected[1] - target[1]) / zoom
			return true
		} catch (error) {}
	}

	function getCenteredScreenPoint(game, xy) {
		const pixelRatio = Number(game?.pixelRatio) || 1
		const w2 = Number(game?.w2) || 0
		const h2 = Number(game?.h2) || 0
		const x = Number(xy?.[0])
		const y = Number(xy?.[1])
		if (!Number.isFinite(x) || !Number.isFinite(y)) return null
		return [x * pixelRatio - w2, y * pixelRatio - h2]
	}

	function getProjectionOriginOffset(game) {
		try {
			if (!game?.translation || typeof game.uvToXY !== 'function') return null
			const origin = game.uvToXY([0.5, 0.5])
			const zoom = Number(game.zoom)
			if (!Array.isArray(origin) || !Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) return null
			if (!Number.isFinite(zoom)) return null
			return [
				origin[0] + game.translation[0] * zoom,
				origin[1] + game.translation[1] * zoom
			]
		} catch (error) {
			return null
		}
	}

	function syncZoomUnit(game) {
		try {
			const solidUnit = Number(game?.solidUnit)
			const zoom = Number(game?.zoom)
			if (Number.isFinite(solidUnit) && Number.isFinite(zoom)) game.unit = solidUnit * zoom
		} catch (error) {}
	}

	function refreshCameraState(game) {
		// Recompute hover without fabricating mouse movement or changing buttons.
		try {
			game.updatePointerState?.()
		} catch (error) {}
		// Native teleport refreshed these before our final camera adjustment.
		try {
			game.updateGlobalPositioning?.()
		} catch (error) {}
	}

	function isMouseAnchoredZoomEnabled(api) {
		return api.config.get(mouseAnchoredZoomConfigKey, true) !== false
	}

	function isMouseAnchoredWaypointTeleportEnabled(api) {
		return api.config.get(mouseAnchoredWaypointConfigKey, true) !== false
	}
})()
