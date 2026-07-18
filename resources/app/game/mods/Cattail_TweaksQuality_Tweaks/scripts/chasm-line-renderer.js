(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const installedKey = '__cattailChasmLineRendererInstalled'
	const rendererKey = '__cattailChasmLineRenderer'
	const rendererFailedKey = '__cattailChasmLineRendererFailed'
	const enableConfigKey = 'enableChasmLineRenderer'
	const modeConfigKey = 'chasmLineRendererMode'
	const ignoreDistanceConfigKey = 'enableChasmLineDistanceOverride'
	const modeCanvas = 0
	const modeWebgl = 1
	const renderLayerId = 'chasm-lines'
	const renderCallbackId = 'chasm-line-renderer-lines'
	const uiDemandCallbackId = 'chasm-line-renderer-ui-demand'
	const curveSegments = 64
	let renderApiRegistered = false

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installChasmLineRenderer(api)
			})
		}
	})

	function installChasmLineRenderer(api) {
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true
		registerChasmLineRenderApi(api)
		api.patch(Game.prototype, 'renderChasm', function (original) {
			return function (...args) {
				const ignoreDistance = shouldIgnoreChasmLineDistance(this, api)
				const rendererEnabled = isChasmLineRendererEnabled(api)
				const mode = normalizeChasmLineMode(api.config.get(modeConfigKey, modeWebgl))
				if (!rendererEnabled && !ignoreDistance) return original.apply(this, args)
				const segments = collectChasmLineSegments(this, { ignoreDistance })
				if (!segments) return original.apply(this, args)
				if (shouldUseChasmLineRenderApi(api, this) && shouldReplaceChasmLines(rendererEnabled, ignoreDistance, mode)) return
				if (rendererEnabled && mode === modeWebgl && renderChasmLineSegmentsWebgl(this, segments)) return
				if (ignoreDistance) {
					drawChasmLineSegmentsCanvas(this, segments)
					return
				}
				return original.apply(this, args)
			}
		})
	}

	function registerChasmLineRenderApi(api) {
		if (renderApiRegistered || !api?.render || typeof api.render.onLayer !== 'function') return
		if (typeof api.render.registerLayer === 'function') {
			api.render.registerLayer(renderLayerId, { order: 44, zIndex: 44, clearEachFrame: true })
		}
		if (typeof api.render.demandLayer === 'function') {
			api.render.demandLayer('ui', {
				id: uiDemandCallbackId,
				enabled({ game }) { return shouldDemandChasmLineRenderApi(api, game) }
			})
		} else {
			api.render.onLayer('ui', function () {}, {
				id: uiDemandCallbackId,
				order: -1000,
				copyTransform: false,
				copyState: false,
				enabled({ game }) { return shouldDemandChasmLineRenderApi(api, game) }
			})
		}
		api.render.onLayer(renderLayerId, function ({ game, ctx }) {
			renderChasmLinesForRenderApi(api, game, ctx)
		}, {
			id: renderCallbackId,
			order: 20,
			space: 'screen',
			enabled({ game }) { return shouldDemandChasmLineRenderApi(api, game) }
		})
		renderApiRegistered = true
	}

	function shouldUseChasmLineRenderApi(api, game) {
		return !!(
			game &&
			renderApiRegistered &&
			api?.render &&
			(typeof api.render.isEnabled !== 'function' || api.render.isEnabled() !== false)
		)
	}

	function shouldDemandChasmLineRenderApi(api, game) {
		if (!shouldUseChasmLineRenderApi(api, game) || game.plane || !game.chasm) return false
		const ignoreDistance = shouldIgnoreChasmLineDistance(game, api)
		const rendererEnabled = isChasmLineRendererEnabled(api)
		const mode = normalizeChasmLineMode(api.config.get(modeConfigKey, modeWebgl))
		return shouldReplaceChasmLines(rendererEnabled, ignoreDistance, mode)
	}

	function renderChasmLinesForRenderApi(api, game, ctx) {
		if (!game || !ctx || game.plane) return
		const ignoreDistance = shouldIgnoreChasmLineDistance(game, api)
		const rendererEnabled = isChasmLineRendererEnabled(api)
		const mode = normalizeChasmLineMode(api.config.get(modeConfigKey, modeWebgl))
		if (!shouldReplaceChasmLines(rendererEnabled, ignoreDistance, mode)) return
		const segments = collectChasmLineSegments(game, { ignoreDistance })
		if (!segments) return
		if (rendererEnabled && mode === modeWebgl && renderChasmLineSegmentsWebgl(game, segments, ctx)) return
		if (ignoreDistance || rendererEnabled) drawChasmLineSegmentsCanvas(game, segments, ctx)
	}

	function shouldReplaceChasmLines(rendererEnabled, ignoreDistance, mode) {
		return !!(ignoreDistance || (rendererEnabled && mode === modeWebgl))
	}

	function isChasmLineRendererEnabled(api) {
		return api.config.get(enableConfigKey, true) !== false
	}

	function shouldIgnoreChasmLineDistance(game, api) {
		return !!game && api.config.get(ignoreDistanceConfigKey, false) === true
	}

	function normalizeChasmLineMode(value) {
		const text = String(value ?? '').trim().toLowerCase()
		if (text === '0' || text === 'canvas' || text === 'canvas2d' || text === 'canvas 2d' || text === 'vanilla') return modeCanvas
		if (text === '1' || text === 'webgl' || text === 'gpu') return modeWebgl
		const number = Number(value)
		return Number.isFinite(number) && number <= 0 ? modeCanvas : modeWebgl
	}

	function collectChasmLineSegments(game, options = {}) {
		if (!game?.chasm || !game.ctx || typeof game.uvToXYUntranslated !== 'function') return null
		const ignoreDistance = options.ignoreDistance === true
		if (!ignoreDistance && typeof game.isVisible === 'function' && !game.isVisible(game.chasm)) return []
		if (!Array.isArray(game.resources) || !Array.isArray(game.resourceHomes)) return null

		const unit = game.unit || 1
		const cp = game.uvToXYUntranslated(game.chasm.position)
		if (!Array.isArray(cp)) return null
		const deltas = getChasmLineDeltas(unit)
		const segments = []

		for (let i = 0; i < game.resources.length; i++) {
			if (!game.resources[i]) continue
			const rp = game.resourceHomes[i]
			if (!Array.isArray(rp)) continue
			const delta = deltas[i] || [0, 0]
			const target = [cp[0] + delta[0], cp[1] + delta[1]]
			const tilt = i < 5 ? -unit * 0.4 : unit
			const cy = rp[1] + (target[1] - rp[1]) * 0.7
			const color = game.codex?.resources?.[i]?.triplet?.[0] || '#778'
			const pop = Number(game.resourcePops?.[i]) || 0
			segments.push({
				p0: [rp[0], rp[1]],
				p1: [rp[0], cy],
				p2: [target[0] + tilt, cy],
				p3: target,
				color,
				width: unit * (0.02 + 0.1 * pop)
			})
		}

		return segments
	}

	function drawChasmLineSegmentsCanvas(game, segments, ctx = game?.ctx) {
		if (!ctx) return false
		ctx.save()
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]
			ctx.strokeStyle = segment.color
			ctx.lineWidth = Math.max(0.5, Number(segment.width) || 1)
			ctx.beginPath()
			ctx.moveTo(segment.p0[0], segment.p0[1])
			ctx.bezierCurveTo(segment.p1[0], segment.p1[1], segment.p2[0], segment.p2[1], segment.p3[0], segment.p3[1])
			ctx.stroke()
		}
		ctx.restore()
		return true
	}

	function getChasmLineDeltas(unit) {
		return [
			[-unit * 0.3, -unit * 1.38],
			[-unit * 0.19, -unit * 1.45],
			[-unit * 0.085, -unit * 1.51],
			[unit * 0.025, -unit * 1.57],
			[unit * 0.13, -unit * 1.64],
			[-unit * 0.13, -unit * 1.29],
			[-unit * 0.02, -unit * 1.35],
			[unit * 0.085, -unit * 1.41],
			[unit * 0.195, -unit * 1.47],
			[unit * 0.3, -unit * 1.54]
		]
	}

	function renderChasmLineSegmentsWebgl(game, segments, ctx = game?.ctx) {
		if (!ctx || game?.[rendererFailedKey]) return false
		const renderer = getChasmLineRenderer(game)
		if (!renderer) return false
		try {
			syncChasmLineRenderer(renderer, game)
			const gl = renderer.gl
			gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
			gl.clearColor(0, 0, 0, 0)
			gl.clear(gl.COLOR_BUFFER_BIT)
			if (segments.length) {
				const data = buildChasmLineData(segments)
				gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer)
				gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
				gl.disable(gl.DEPTH_TEST)
				gl.enable(gl.BLEND)
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
				gl.useProgram(renderer.program)
				gl.uniform2f(renderer.uniforms.resolution, renderer.canvas.width, renderer.canvas.height)
				bindChasmLineAttributes(gl, renderer.program, renderer.buffer)
				gl.drawArraysInstanced(gl.TRIANGLES, 0, curveSegments * 6, segments.length)
			}
			ctx.drawImage(renderer.canvas, 0, 0)
			return true
		} catch (error) {
			destroyChasmLineRenderer(game)
			game[rendererFailedKey] = true
			return false
		}
	}

	function buildChasmLineData(segments) {
		const stride = 13
		const data = new Float32Array(segments.length * stride)
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i]
			const color = parseColor(segment.color)
			const offset = i * stride
			data[offset] = segment.p0[0]
			data[offset + 1] = segment.p0[1]
			data[offset + 2] = segment.p1[0]
			data[offset + 3] = segment.p1[1]
			data[offset + 4] = segment.p2[0]
			data[offset + 5] = segment.p2[1]
			data[offset + 6] = segment.p3[0]
			data[offset + 7] = segment.p3[1]
			data[offset + 8] = color[0]
			data[offset + 9] = color[1]
			data[offset + 10] = color[2]
			data[offset + 11] = color[3]
			data[offset + 12] = Math.max(0.5, Number(segment.width) || 1)
		}
		return data
	}

	function getChasmLineRenderer(game) {
		if (!game) return null
		const existing = game[rendererKey]
		if (existing?.gl && !existing.gl.isContextLost?.()) return existing

		const canvas = document.createElement('canvas')
		const gl = canvas.getContext('webgl2', {
			alpha: true,
			premultipliedAlpha: false,
			antialias: true,
			preserveDrawingBuffer: true
		})
		if (!gl) {
			game[rendererFailedKey] = true
			return null
		}

		try {
			const program = createProgram(gl, getChasmLineVertexShader(), getChasmLineFragmentShader())
			const renderer = {
				canvas,
				gl,
				program,
				buffer: gl.createBuffer(),
				uniforms: {
					resolution: gl.getUniformLocation(program, 'u_resolution')
				}
			}
			game[rendererKey] = renderer
			return renderer
		} catch (error) {
			game[rendererFailedKey] = true
			return null
		}
	}

	function syncChasmLineRenderer(renderer, game) {
		if (renderer.canvas.width !== game.w) renderer.canvas.width = game.w
		if (renderer.canvas.height !== game.h) renderer.canvas.height = game.h
	}

	function destroyChasmLineRenderer(game) {
		const renderer = game?.[rendererKey]
		if (!renderer) return
		try {
			const gl = renderer.gl
			if (renderer.buffer) gl.deleteBuffer(renderer.buffer)
			if (renderer.program) gl.deleteProgram(renderer.program)
		} catch (error) {}
		delete game[rendererKey]
	}

	function bindChasmLineAttributes(gl, program, buffer) {
		const stride = 13 * 4
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
		bindAttribute(gl, program, 'a_p0', 2, stride, 0)
		bindAttribute(gl, program, 'a_p1', 2, stride, 2 * 4)
		bindAttribute(gl, program, 'a_p2', 2, stride, 4 * 4)
		bindAttribute(gl, program, 'a_p3', 2, stride, 6 * 4)
		bindAttribute(gl, program, 'a_color', 4, stride, 8 * 4)
		bindAttribute(gl, program, 'a_width', 1, stride, 12 * 4)
	}

	function bindAttribute(gl, program, name, size, stride, offset) {
		const location = gl.getAttribLocation(program, name)
		if (location < 0) return
		gl.enableVertexAttribArray(location)
		gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
		gl.vertexAttribDivisor(location, 1)
	}

	function createProgram(gl, vertexSource, fragmentSource) {
		const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource)
		const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
		const program = gl.createProgram()
		gl.attachShader(program, vertex)
		gl.attachShader(program, fragment)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Chasm line WebGL link failed')
		gl.deleteShader(vertex)
		gl.deleteShader(fragment)
		return program
	}

	function createShader(gl, type, source) {
		const shader = gl.createShader(type)
		gl.shaderSource(shader, source)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Chasm line WebGL compile failed')
		return shader
	}

	function getChasmLineVertexShader() {
		return `#version 300 es
			in vec2 a_p0;
			in vec2 a_p1;
			in vec2 a_p2;
			in vec2 a_p3;
			in vec4 a_color;
			in float a_width;
			uniform vec2 u_resolution;
			out vec4 v_color;
			const int SEGMENTS = ${curveSegments};
			vec2 cubicPoint(float t) {
				float nt = 1.0 - t;
				return nt * nt * nt * a_p0 + 3.0 * nt * nt * t * a_p1 + 3.0 * nt * t * t * a_p2 + t * t * t * a_p3;
			}
			vec2 cubicDerivative(float t) {
				float nt = 1.0 - t;
				return 3.0 * nt * nt * (a_p1 - a_p0) + 6.0 * nt * t * (a_p2 - a_p1) + 3.0 * t * t * (a_p3 - a_p2);
			}
			void main() {
				int localVertex = gl_VertexID % 6;
				int segmentId = gl_VertexID / 6;
				float t0 = float(segmentId) / float(SEGMENTS);
				float t1 = float(segmentId + 1) / float(SEGMENTS);
				float t = (localVertex == 0 || localVertex == 1 || localVertex == 4) ? t0 : t1;
				float side = (localVertex == 0 || localVertex == 2 || localVertex == 3) ? -1.0 : 1.0;
				vec2 tangent = normalize(cubicDerivative(t));
				vec2 normal = vec2(-tangent.y, tangent.x);
				vec2 point = cubicPoint(t) + normal * side * a_width * 0.5;
				vec2 clip = point / u_resolution * 2.0 - 1.0;
				gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
				v_color = a_color;
			}`
	}

	function getChasmLineFragmentShader() {
		return `#version 300 es
			precision mediump float;
			in vec4 v_color;
			out vec4 outColor;
			void main() {
				outColor = v_color;
			}`
	}

	function parseColor(color, alpha = 1) {
		const text = String(color || '').trim()
		const hex = text[0] === '#' ? text.slice(1) : text
		if (hex.length === 3 || hex.length === 4) {
			return [
				parseInt(hex[0] + hex[0], 16) / 255,
				parseInt(hex[1] + hex[1], 16) / 255,
				parseInt(hex[2] + hex[2], 16) / 255,
				hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : alpha
			]
		}
		if (hex.length === 6 || hex.length === 8) {
			return [
				parseInt(hex.slice(0, 2), 16) / 255,
				parseInt(hex.slice(2, 4), 16) / 255,
				parseInt(hex.slice(4, 6), 16) / 255,
				hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : alpha
			]
		}
		return [0.47, 0.47, 0.53, alpha]
	}
})()
