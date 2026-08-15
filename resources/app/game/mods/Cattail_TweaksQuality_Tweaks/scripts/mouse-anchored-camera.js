(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailMouseAnchoredCameraInstalled'
	const mouseAnchoredZoomConfigKey = 'enableMouseAnchoredZoom'
	const mouseAnchoredWaypointConfigKey = 'enableMouseAnchoredWaypointTeleport'
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
				restoreMousePivot(this, pivot)
				refreshMouseData(this, pivot)
				return result
			}
		})
	}

	function patchMouseAnchoredWaypointTeleport(api) {
		api.patch(Game.prototype, 'useWaypoint', function (original) {
			return function (waypoint, ...args) {
				const target = isMouseAnchoredWaypointTeleportEnabled(api) ? getNextWaypoint(this, waypoint) : null
				const result = original.apply(this, [waypoint, ...args])
				if (target) {
					alignWorldPositionToMouse(this, target.position)
					refreshMouseData(this)
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
			if (!game?.mouse || !Array.isArray(game.mouse.offsetxy) || typeof game.xyToUV !== 'function') return null
			const xy = [Number(game.mouse.offsetxy[0]), Number(game.mouse.offsetxy[1])]
			if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null
			const uv = game.xyToUV(xy)
			if (!Array.isArray(uv) || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) return null
			return { xy, uv: [uv[0], uv[1]] }
		} catch (error) {
			return null
		}
	}

	function restoreMousePivot(game, pivot) {
		if (!pivot) return
		alignWorldPointToScreenPoint(game, pivot.uv, pivot.xy)
	}

	function alignWorldPositionToMouse(game, uv) {
		if (!game?.mouse || !Array.isArray(game.mouse.offsetxy)) return
		alignRenderedPositionToScreenPoint(game, uv, game.mouse.offsetxy)
	}

	function alignWorldPointToScreenPoint(game, uv, xy) {
		alignWorldPositionToScreenPoint(game, uv, xy, getProjectionOriginOffset(game))
	}

	function alignRenderedPositionToScreenPoint(game, uv, xy) {
		alignWorldPositionToScreenPoint(game, uv, xy, null)
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

	function refreshMouseData(game, pivot) {
		try {
			const xy = pivot?.xy || game?.mouse?.offsetxy
			if (!Array.isArray(xy) || typeof game?.updateMouseData !== 'function') return
			game.updateMouseData(Number(xy[0]), Number(xy[1]))
		} catch (error) {}
	}

	function isMouseAnchoredZoomEnabled(api) {
		return api.config.get(mouseAnchoredZoomConfigKey, true) !== false
	}

	function isMouseAnchoredWaypointTeleportEnabled(api) {
		return api.config.get(mouseAnchoredWaypointConfigKey, true) !== false
	}
})()
