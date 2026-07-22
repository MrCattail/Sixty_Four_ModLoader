(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const LEGACY_MOD_ID = 'Cattail_TweaksQuality_Dynamic-Camera'
	const installedKey = '__cattailDynamicCameraInstalled'
	const stateKey = 'modloader:' + MOD_ID + ':state'
	const legacyStateKey = 'modloader:' + LEGACY_MOD_ID + ':state'
	const pitchConfigKey = 'cameraPitch'
	const yawConfigKey = 'cameraYaw'
	const legacyPitchConfigKey = 'defaultPitch'
	const legacyYawConfigKey = 'defaultYaw'

	let previewEnabled = null

	const isoX = 0.866
	const vanillaPitch = 0.5
	const minPitch = 0.18
	const maxPitch = 1.15
	const minDeterminant = 0.0001

	const keys = {
		tiltWheel: false,
		rotateWheel: false,
		pitchDown: false,
		pitchUp: false,
		yawLeft: false,
		yawRight: false
	}

	let activeGame = null

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			migrateLegacyDynamicCameraConfig(api)
			api.on('afterVanillaScripts', function () {
				installDynamicCamera(api)
			})
			api.on('afterGameInit', function (payload, game) {
				activeGame = game || activeGame
				resetStartupCameraState(activeGame, api)
			})
		}
	})

	function installDynamicCamera(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		installConfigPreviewListener(api)
		installInputHandlers(api)

		api.patch(Game.prototype, 'uvToXY', function (original) {
			return function (uv) {
				if (!isEnabled(api)) return original.apply(this, arguments)
				const matrix = getMatrix(this, api)
				if (!matrix) return original.apply(this, arguments)
				return [
					(uv[0] * matrix.ux + uv[1] * matrix.vx) * this.unit - this.translation[0] * this.zoom,
					(uv[0] * matrix.uy + uv[1] * matrix.vy) * this.unit - this.translation[1] * this.zoom
				]
			}
		})

		api.patch(Game.prototype, 'xyToUV', function (original) {
			return function (xy) {
				if (!isEnabled(api)) return original.apply(this, arguments)
				const matrix = getMatrix(this, api)
				if (!matrix) return original.apply(this, arguments)
				const centered = [
					xy[0] * this.pixelRatio - this.w2 + this.translation[0] * this.zoom,
					xy[1] * this.pixelRatio - this.h2 + this.translation[1] * this.zoom
				]
				return screenToUv(centered, matrix, this.unit)
			}
		})

		api.patch(Game.prototype, 'xyToUVUntranslated', function (original) {
			return function (xy) {
				if (!isEnabled(api)) return original.apply(this, arguments)
				const matrix = getMatrix(this, api)
				if (!matrix) return original.apply(this, arguments)
				xy = xy || [0, 0]
				const centered = [
					xy[0] * this.pixelRatio + this.translation[0] * this.zoom,
					xy[1] * this.pixelRatio + this.translation[1] * this.zoom
				]
				return screenToUv(centered, matrix, this.unit)
			}
		})

		api.patch(Game.prototype, 'renderloop', function (original) {
			return function () {
				activeGame = this
				updateHeldCameraControls(this, api)
				return original.apply(this, arguments)
			}
		})

		api.patch(Game.prototype, 'renderAvailability', function (original) {
			return function () {
				if (!isEnabled(api)) return original.apply(this, arguments)
				return renderDynamicAvailability(this, original, arguments)
			}
		})

		api.patch(Game.prototype, 'renderHoveredCell', function (original) {
			return function () {
				if (!isEnabled(api)) return original.apply(this, arguments)
				return renderDynamicHoveredCell(this, original, arguments)
			}
		})

		api.patch(Game.prototype, 'renderSOI', function (original) {
			return function (entity) {
				if (!isEnabled(api)) return original.apply(this, arguments)
				return renderDynamicSOI(this, entity, original, arguments)
			}
		})

		api.patch(Game.prototype, 'drawPrism', function (original) {
			return function (position, size, height, triplet) {
				if (!isEnabled(api)) return original.apply(this, arguments)
				return drawDynamicPrism(this, position, size, height, triplet, original, arguments)
			}
		})

		if (typeof Puncture !== 'undefined') {
			api.patch(Puncture.prototype, 'ondarkmousedown', function (original) {
				return function () {
					const game = this.master
					const before = game?.translation ? [game.translation[0], game.translation[1]] : null
					const result = original.apply(this, arguments)
					if (isEnabled(api) && game?.voidsculpture && before && game.translation && (before[0] !== game.translation[0] || before[1] !== game.translation[1])) {
						const origin = game.uvToXY(game.voidsculpture.position)
						game.translation[0] = (origin[0] + game.translation[0] * game.zoom) / game.zoom
						game.translation[1] = (origin[1] + game.translation[1] * game.zoom) / game.zoom
					}
					return result
				}
			})
		}
	}

	function installConfigPreviewListener(api) {
		window.addEventListener('modloader:config-preview', function (event) {
			const detail = event?.detail || {}
			if (detail.modId !== MOD_ID) return
			if (detail.key === 'enableDynamicCamera') previewEnabled = detail.value !== false
			if (detail.key !== pitchConfigKey && detail.key !== yawConfigKey) return
			const game = activeGame
			if (!game) return
			const state = ensureState(game, api)
			const pivot = captureMousePivot(game)
			if (detail.key === pitchConfigKey) state.pitch = clamp(Number(detail.value), minPitch, maxPitch)
			if (detail.key === yawConfigKey) state.yaw = normalizeRadians(Number(detail.value) * Math.PI / 180)
			restoreMousePivot(game, pivot)
			state.lastInput = performance.now()
			game.processMousemove2?.()
		}, true)
	}

	function installInputHandlers(api) {
		window.addEventListener('keydown', function (event) {
			if (!shouldHandleKeyEvent(event, api)) return
			const code = event.code || ''
			if (code === 'KeyC') {
				keys.tiltWheel = true
				event.preventDefault()
			} else if (code === 'KeyV') {
				keys.rotateWheel = true
				event.preventDefault()
			} else if (code === 'BracketLeft') {
				keys.pitchDown = true
				event.preventDefault()
			} else if (code === 'BracketRight') {
				keys.pitchUp = true
				event.preventDefault()
			} else if (code === 'Comma') {
				keys.yawLeft = true
				event.preventDefault()
			} else if (code === 'Period') {
				keys.yawRight = true
				event.preventDefault()
			} else if (code === 'KeyB') {
				toggleCameraReset(activeGame, api)
				event.preventDefault()
			}
		}, true)

		window.addEventListener('keyup', function (event) {
			const code = event.code || ''
			if (code === 'KeyC') keys.tiltWheel = false
			if (code === 'KeyV') keys.rotateWheel = false
			if (code === 'BracketLeft') keys.pitchDown = false
			if (code === 'BracketRight') keys.pitchUp = false
			if (code === 'Comma') keys.yawLeft = false
			if (code === 'Period') keys.yawRight = false
		}, true)

		window.addEventListener('wheel', function (event) {
			if (!isEnabled(api) || isEditableTarget(event.target)) return
			if (!keys.tiltWheel && !keys.rotateWheel) return
			const game = activeGame
			if (!game) return
			const state = ensureState(game, api)
			const pivot = captureMousePivot(game)
			const direction = normalizeWheelDirection(event)
			if (keys.tiltWheel) state.pitch = clamp(state.pitch - direction * 0.035, minPitch, maxPitch)
			if (keys.rotateWheel) state.yaw = normalizeRadians(state.yaw + direction * Math.PI / 72)
			restoreMousePivot(game, pivot)
			state.lastInput = performance.now()
			persistCameraConfig(api, state)
			game.processMousemove2?.()
			event.preventDefault()
			event.stopImmediatePropagation()
		}, true)

		window.addEventListener('blur', function () {
			for (const key in keys) keys[key] = false
		})
	}

	function shouldHandleKeyEvent(event, api) {
		if (!activeGame || !isEnabled(api)) return false
		if (event.altKey || event.ctrlKey || event.metaKey) return false
		return !isEditableTarget(event.target)
	}

	function isEditableTarget(target) {
		const tagName = String(target?.tagName || '').toLowerCase()
		return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable
	}

	function normalizeWheelDirection(event) {
		const value = Number(event.deltaY || -event.wheelDeltaY || event.wheelDelta || 0)
		if (!Number.isFinite(value) || value === 0) return 0
		return value > 0 ? 1 : -1
	}

	function updateHeldCameraControls(game, api) {
		if (!isEnabled(api) || !game) return
		const state = ensureState(game, api)
		const now = performance.now()
		const last = state.lastFrameTime || now
		const dt = Math.min(80, Math.max(0, now - last))
		state.lastFrameTime = now
		if (!dt) return

		let changed = false
		const pitchDirection = (keys.pitchUp ? 1 : 0) - (keys.pitchDown ? 1 : 0)
		const yawDirection = (keys.yawRight ? 1 : 0) - (keys.yawLeft ? 1 : 0)
		const pivot = (pitchDirection || yawDirection) ? captureMousePivot(game) : null
		if (pitchDirection) {
			state.pitch = clamp(state.pitch + pitchDirection * dt * 0.00045, minPitch, maxPitch)
			changed = true
		}
		if (yawDirection) {
			state.yaw = normalizeRadians(state.yaw + yawDirection * dt * 0.0022)
			changed = true
		}
		if (changed) {
			restoreMousePivot(game, pivot)
			state.lastInput = now
			persistCameraConfigThrottled(api, state)
			game.processMousemove2?.()
		}
	}

	function getMatrix(game, api) {
		const state = api ? ensureState(game, api) : (game?.__cattailDynamicCameraState || { pitch: vanillaPitch, yaw: 0 })
		const pitch = clamp(Number(state.pitch), minPitch, maxPitch)
		const yaw = Number(state.yaw) || 0
		const cos = Math.cos(yaw)
		const sin = Math.sin(yaw)
		const ux = isoX * cos - pitch * sin
		const uy = isoX * sin + pitch * cos
		const vx = -isoX * cos - pitch * sin
		const vy = -isoX * sin + pitch * cos
		const det = ux * vy - uy * vx
		if (!Number.isFinite(det) || Math.abs(det) < minDeterminant) return null
		return { ux: ux, uy: uy, vx: vx, vy: vy, det: det }
	}

	function screenToUv(centered, matrix, unit) {
		const scale = Number(unit)
		if (!Number.isFinite(scale) || Math.abs(scale) < minDeterminant) return [0.5, 0.5]
		const x = centered[0] / scale
		const y = centered[1] / scale
		return [
			(x * matrix.vy - y * matrix.vx) / matrix.det + 0.5,
			(matrix.ux * y - matrix.uy * x) / matrix.det + 0.5
		]
	}

	function ensureState(game, api) {
		if (!game) return createDefaultState(api)
		if (!game.__cattailDynamicCameraState) {
			game.__cattailDynamicCameraState = readSavedState(api)
		}
		return game.__cattailDynamicCameraState
	}

	function resetStartupCameraState(game, api) {
		if (!game) return
		game.__cattailDynamicCameraState = createDefaultState(api)
	}

	function readSavedState(api) {
		return createDefaultState(api)
	}

	function createDefaultState(api) {
		const state = {
			pitch: vanillaPitch,
			yaw: 0,
			lastFrameTime: 0,
			lastSavedAt: 0,
			lastInput: 0
		}
		const saved = readSavedCameraSnapshot(api)
		if (isValidCameraSnapshot(saved) && !isVanillaCameraState(saved)) state.restoreState = saved
		return state
	}

	function toggleCameraReset(game, api) {
		if (!game || !isEnabled(api)) return
		const state = ensureState(game, api)
		const restoreState = state.restoreState
		const restoreAvailable = isValidCameraSnapshot(restoreState)
		const isReset = isVanillaCameraState(state)
		const now = performance.now()
		const pivot = captureMousePivot(game)
		let shouldPersist = false

		if (restoreAvailable && isReset) {
			game.__cattailDynamicCameraState = {
				pitch: clamp(Number(restoreState.pitch), minPitch, maxPitch),
				yaw: normalizeRadians(Number(restoreState.yaw) || 0),
				lastFrameTime: 0,
				lastSavedAt: 0,
				lastInput: now
			}
			shouldPersist = true
		} else {
			game.__cattailDynamicCameraState = {
				pitch: vanillaPitch,
				yaw: 0,
				lastFrameTime: 0,
				lastSavedAt: 0,
				lastInput: now,
				restoreState: {
					pitch: clamp(Number(state.pitch), minPitch, maxPitch),
					yaw: normalizeRadians(Number(state.yaw) || 0)
				}
			}
		}
		restoreMousePivot(game, pivot)
		if (shouldPersist) persistCameraConfig(api, game.__cattailDynamicCameraState)
		game.processMousemove2?.()
	}

	function captureMousePivot(game) {
		try {
			if (!game?.mouse || !Array.isArray(game.mouse.offsetxy) || typeof game.xyToUV !== 'function') return null
			const xy = [Number(game.mouse.offsetxy[0]), Number(game.mouse.offsetxy[1])]
			if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return null
			const uv = game.xyToUV(xy)
			if (!Array.isArray(uv) || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) return null
			return { xy: xy, uv: [uv[0], uv[1]] }
		} catch (error) {
			return null
		}
	}

	function restoreMousePivot(game, pivot) {
		try {
			if (!pivot || !game?.translation || typeof game.uvToXY !== 'function') return
			const projected = game.uvToXY(pivot.uv)
			if (!Array.isArray(projected) || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return
			const pixelRatio = Number(game.pixelRatio) || 1
			const zoom = Number(game.zoom) || 1
			if (!Number.isFinite(pixelRatio) || !Number.isFinite(zoom) || Math.abs(zoom) < minDeterminant) return
			const target = [
				pivot.xy[0] * pixelRatio - (Number(game.w2) || 0),
				pivot.xy[1] * pixelRatio - (Number(game.h2) || 0)
			]
			game.translation[0] += (projected[0] - target[0]) / zoom
			game.translation[1] += (projected[1] - target[1]) / zoom
		} catch (error) {}
	}

	function isVanillaCameraState(state) {
		return Math.abs(clamp(Number(state?.pitch), minPitch, maxPitch) - vanillaPitch) < 0.0001 &&
			Math.abs(normalizeRadians(Number(state?.yaw) || 0)) < 0.0001
	}

	function isValidCameraSnapshot(snapshot) {
		return !!(
			snapshot &&
			Number.isFinite(Number(snapshot.pitch)) &&
			Number.isFinite(Number(snapshot.yaw))
		)
	}

	function persistCameraConfigThrottled(api, state) {
		const now = performance.now()
		if (now - (state.lastSavedAt || 0) < 250) return
		state.lastSavedAt = now
		persistCameraConfig(api, state)
	}

	function persistCameraConfig(api, state) {
		const pitch = roundNumber(clamp(Number(state.pitch), minPitch, maxPitch), 2)
		const yaw = roundNumber(normalizeRadians(Number(state.yaw) || 0) * 180 / Math.PI, 1)
		api.config.set(pitchConfigKey, pitch)
		api.config.set(yawConfigKey, yaw)
		try {
			localStorage.setItem(stateKey, JSON.stringify({ pitch: pitch, yaw: normalizeRadians(Number(state.yaw) || 0) }))
		} catch (error) {}
	}

	function renderDynamicAvailability(game, original, args) {
		if (!game.hoveredCell) return original.apply(game, args)
		const good = game.plane ? '#FFF6' : '#0F06'
		const bad = game.getColorWave([236, 20, 1, .5], [220, 220, 220, .9])
		game.ctx.fillStyle = game.canPlace ? good : bad
		drawCellPolygon(game.ctx, getCellCorners(game, game.hoveredCell, 1))
	}

	function renderDynamicHoveredCell(game, original, args) {
		if (!game.hoveredEntity) return original.apply(game, args)
		const target = game.hoveredEntity?.position || game.hoveredCell
		const mult = game.hoveredEntity?.entitySpan === 1 ? 3 : 1.1
		const corners = getCellCorners(game, target, mult)
		game.ctx.save()
		game.ctx.strokeStyle = game.hoveredEntity ? '#112' : '#D0D4D8'
		game.ctx.lineWidth = game.unit * (game.hoveredEntity ? .02 : .01)
		drawCornerBrackets(game.ctx, corners, game.hoveredEntity ? 0 : 1)
		game.ctx.restore()
	}

	function renderDynamicSOI(game, entity, original, args) {
		const target = entity?.position || entity
		if (!target) return original.apply(game, args)
		const corners = getCellCorners(game, target, 3)
		game.ctx.save()
		game.ctx.fillStyle = '#11112208'
		drawCellPolygon(game.ctx, corners)
		game.ctx.strokeStyle = '#A5A5B4'
		game.ctx.lineWidth = game.unit * .02
		drawCornerBrackets(game.ctx, corners, 1)
		game.ctx.restore()
	}

	function drawDynamicPrism(game, position, size, height, triplet, original, args) {
		const colors = triplet ? triplet : ['#FFC759', '#FFE86F', '#FF8F60']
		const prismHeight = Number(height) || 0
		const corners = getCellCorners(game, position, Number(size) || 1)
		if (!corners) return original.apply(game, args)
		const hy = prismHeight * game.unit
		const top = corners.map(function (point) {
			return [point[0], point[1] - hy]
		})

		game.ctx.save()
		if (prismHeight) drawVisibleSides(game, corners, top, colors)
		game.ctx.fillStyle = colors[1]
		drawCellPolygon(game.ctx, top)
		game.ctx.restore()
	}

	function getCellCorners(game, position, size) {
		const center = game.uvToXY(position)
		const half = size / 2
		const offsets = [
			[-half, -half],
			[half, -half],
			[half, half],
			[-half, half]
		]
		return offsets.map(function (offset) {
			const p = projectRelative(game, offset)
			return [center[0] + p[0], center[1] + p[1]]
		})
	}

	function projectRelative(game, uv) {
		const matrix = getMatrix(game)
		if (!matrix) return [(uv[0] * isoX - uv[1] * isoX) * game.unit, (uv[0] * vanillaPitch + uv[1] * vanillaPitch) * game.unit]
		return [
			(uv[0] * matrix.ux + uv[1] * matrix.vx) * game.unit,
			(uv[0] * matrix.uy + uv[1] * matrix.vy) * game.unit
		]
	}

	function drawCellPolygon(ctx, points) {
		ctx.beginPath()
		ctx.moveTo(points[0][0], points[0][1])
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
		ctx.closePath()
		ctx.fill()
	}

	function drawCornerBrackets(ctx, corners, drawTop) {
		const edgeFraction = drawTop ? .1 : .2
		for (let i = 0; i < corners.length; i++) {
			if (!drawTop && i === 0) continue
			const previous = corners[(i + corners.length - 1) % corners.length]
			const current = corners[i]
			const next = corners[(i + 1) % corners.length]
			ctx.beginPath()
			ctx.moveTo(lerp(current[0], previous[0], edgeFraction), lerp(current[1], previous[1], edgeFraction))
			ctx.lineTo(current[0], current[1])
			ctx.lineTo(lerp(current[0], next[0], edgeFraction), lerp(current[1], next[1], edgeFraction))
			ctx.stroke()
		}
	}

	function drawVisibleSides(game, bottom, top, colors) {
		const centerX = bottom.reduce(function (sum, point) { return sum + point[0] }, 0) / bottom.length
		const centerY = bottom.reduce(function (sum, point) { return sum + point[1] }, 0) / bottom.length
		const edges = []
		for (let i = 0; i < bottom.length; i++) {
			const next = (i + 1) % bottom.length
			const midY = (bottom[i][1] + bottom[next][1]) / 2
			const midX = (bottom[i][0] + bottom[next][0]) / 2
			if (midY >= centerY - 0.001) edges.push({ from: i, to: next, midY: midY, midX: midX })
		}
		edges.sort(function (a, b) { return a.midY === b.midY ? a.midX - b.midX : b.midY - a.midY })
		for (let i = 0; i < Math.min(2, edges.length); i++) {
			const edge = edges[i]
			game.ctx.fillStyle = edge.midX < centerX ? colors[0] : colors[2]
			game.ctx.beginPath()
			game.ctx.moveTo(top[edge.from][0], top[edge.from][1])
			game.ctx.lineTo(top[edge.to][0], top[edge.to][1])
			game.ctx.lineTo(bottom[edge.to][0], bottom[edge.to][1])
			game.ctx.lineTo(bottom[edge.from][0], bottom[edge.from][1])
			game.ctx.closePath()
			game.ctx.fill()
		}
	}

	function readSavedCameraSnapshot(api) {
		const pitch = readSavedCameraNumberConfig(pitchConfigKey, legacyPitchConfigKey, NaN)
		const yawDegrees = readSavedCameraNumberConfig(yawConfigKey, legacyYawConfigKey, NaN)
		if (Number.isFinite(pitch) || Number.isFinite(yawDegrees)) {
			return {
				pitch: clamp(Number.isFinite(pitch) ? pitch : vanillaPitch, minPitch, maxPitch),
				yaw: normalizeRadians((Number.isFinite(yawDegrees) ? yawDegrees : 0) * Math.PI / 180)
			}
		}
		return readStoredCameraState(stateKey) || readStoredCameraState(legacyStateKey)
	}

	function readSavedCameraNumberConfig(key, legacyKey, fallback) {
		if (hasStoredConfig(key)) return readStoredConfigNumber(MOD_ID, key, fallback)
		if (hasStoredConfig(legacyKey)) return readStoredConfigNumber(MOD_ID, legacyKey, fallback)
		if (hasLegacyStoredConfig(key)) return readStoredConfigNumber(LEGACY_MOD_ID, key, fallback)
		if (hasLegacyStoredConfig(legacyKey)) return readStoredConfigNumber(LEGACY_MOD_ID, legacyKey, fallback)
		return fallback
	}

	function readStoredCameraState(key) {
		try {
			const parsed = JSON.parse(localStorage.getItem(key) || 'null')
			if (!parsed || typeof parsed !== 'object') return null
			const pitch = Number(parsed.pitch)
			const yaw = Number(parsed.yaw)
			if (!Number.isFinite(pitch) || !Number.isFinite(yaw)) return null
			return {
				pitch: clamp(pitch, minPitch, maxPitch),
				yaw: normalizeRadians(yaw)
			}
		} catch (error) {
			return null
		}
	}

	function migrateLegacyDynamicCameraConfig(api) {
		try {
			migrateLegacyConfigValue('enableDynamicCamera', ['enableDynamicCamera'])
			migrateLegacyConfigValue(pitchConfigKey, [pitchConfigKey, legacyPitchConfigKey])
			migrateLegacyConfigValue(yawConfigKey, [yawConfigKey, legacyYawConfigKey])
			if (localStorage.getItem(stateKey) === null) {
				const legacyState = localStorage.getItem(legacyStateKey)
				if (legacyState !== null) localStorage.setItem(stateKey, legacyState)
			}
		} catch (error) {}
	}

	function migrateLegacyConfigValue(targetKey, legacyKeys) {
		if (localStorage.getItem(configStorageKey(MOD_ID, targetKey)) !== null) return
		for (let i = 0; i < legacyKeys.length; i++) {
			const legacyRaw = localStorage.getItem(configStorageKey(LEGACY_MOD_ID, legacyKeys[i]))
			if (legacyRaw !== null) {
				localStorage.setItem(configStorageKey(MOD_ID, targetKey), legacyRaw)
				return
			}
		}
	}


	function hasStoredConfig(key) {
		try {
			return localStorage.getItem(configStorageKey(MOD_ID, key)) !== null
		} catch (error) {
			return false
		}
	}

	function hasLegacyStoredConfig(key) {
		try {
			return localStorage.getItem(configStorageKey(LEGACY_MOD_ID, key)) !== null
		} catch (error) {
			return false
		}
	}

	function readStoredConfigNumber(modId, key, fallback) {
		try {
			const raw = localStorage.getItem(configStorageKey(modId, key))
			const value = raw === null ? fallback : Number(JSON.parse(raw))
			return Number.isFinite(value) ? value : fallback
		} catch (error) {
			return fallback
		}
	}


	function configStorageKey(modId, key) {
		return 'modloader:' + modId + ':config:' + key
	}

	function isEnabled(api) {
		if (previewEnabled !== null) return previewEnabled
		return api?.config?.get('enableDynamicCamera', true) !== false
	}

	function clamp(value, min, max) {
		if (!Number.isFinite(value)) return min
		return Math.min(max, Math.max(min, value))
	}

	function roundNumber(value, digits) {
		const scale = Math.pow(10, digits)
		return Math.round(value * scale) / scale
	}

	function normalizeRadians(value) {
		if (!Number.isFinite(value)) return 0
		const full = Math.PI * 2
		while (value > Math.PI) value -= full
		while (value < -Math.PI) value += full
		return value
	}

	function lerp(a, b, f) {
		return a + (b - a) * f
	}
})()
