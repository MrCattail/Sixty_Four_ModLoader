ModLoader.register({
	id: 'Cattail_TweaksQuality_Custom-Background-Color',
	init(api) {
		const sourceKey = '__cattailSpriteCleanupSource'
		const floorOverrideSharedStateKey = '__cattailAccessibilityFloorOverrideEnabled'
		const floorOverrideWindowStateKey = 'cattailAccessibilityFloorOverrideEnabled'
		const defaultTuning = Object.freeze({ enabled: true, matte: 1, shadow: 1, edge: 1, frames: {} })
		const targetImages = new Set([
			'img/annihilator.png',
			'img/auxpump.png',
			'img/auxpump1.png',
			'img/c1-3.png',
			'img/c31-2.png',
			'img/c4-1.png',
			'img/c7-6.png',
			'img/channel.png',
			'img/channel2.png',
			'img/chasm.png',
			'img/clicker1.png',
			'img/clicker2.png',
			'img/clicker3.png',
			'img/conductor.png',
			'img/consumer.png',
			'img/cookie.png',
			'img/des.png',
			'img/des2.png',
			'img/des2a.png',
			'img/double2.png',
			'img/double_spr.png',
			'img/entropy.png',
			'img/entropy2.png',
			'img/entropy2a.png',
			'img/entropy3.png',
			'img/eye.png',
			'img/flower.png',
			'img/fruit.png',
			'img/generaldecay.png',
			'img/gradient.png',
			'img/hollow.png',
			'img/injector.png',
			'img/mega1.png',
			'img/mega1a.png',
			'img/mega1b.png',
			'img/pinhole.png',
			'img/preheater.png',
			'img/puncture.png',
			'img/reactor.png',
			'img/recycler.png',
			'img/recycler2.png',
			'img/reflector.png',
			'img/silo.png',
			'img/silo2.png',
			'img/stabilizer.png',
			'img/stabilizer2.png',
			'img/stabilizer3.png',
			'img/strange.png',
			'img/strange1.png',
			'img/strange2.png',
			'img/strange3.png',
			'img/valve.png',
			'img/vault.png',
			'img/vessel.png',
			'img/vessel2.png',
			'img/voidsculpture.png',
			'img/waypoint.png',
			'img/waypoint2.png'
		])
		const cache = new Map()
		let lastConfigSignature = ''

		api.on('afterVanillaScripts', function () {
			if (typeof Sprite === 'undefined') return

			const OriginalSprite = Sprite
			Sprite = class CattailSpriteCleanupSprite extends OriginalSprite {
				constructor(args) {
					super(args)
					this[sourceKey] = normalizeSrc(args?.src)
				}
			}

			patchRenderMethods()
		})

		function patchRenderMethods() {
			api.patch(Sprite.prototype, 'render', function (original) {
				return function (uv, dt, back = false, scaleMult = 1) {
					const img = getRenderableImage(this)
					if (!img) return original.apply(this, arguments)

					this.update(dt)
					const p = this.master.uvToXY(uv)
					const index = this.sequences[this.currentSequence][this.currentFrame]
					const mask = back ? this.backframes[index] : this.frames[index]
					const origin = this.origins[index]
					const scale = this.master.unit * 1.737 / mask[2] * this.scale * scaleMult
					this.master.ctx.drawImage(img, mask[0], mask[1], mask[2], mask[3], p[0] - origin[0] * scale, p[1] - origin[1] * scale, mask[2] * scale, mask[3] * scale)
				}
			})

			api.patch(Sprite.prototype, 'renderState', function (original) {
				return function (uv, f, back, scaleMult = 1) {
					const img = getRenderableImage(this)
					if (!img) return original.apply(this, arguments)

					const p = this.master.uvToXY(uv)
					const frame = Math.min(Math.floor(this.sequences[this.currentSequence].length * f), this.sequences[this.currentSequence].length - 1)
					const index = this.sequences[this.currentSequence][frame]
					const mask = back ? this.backframes[index] : this.frames[index]
					const origin = this.origins[index]
					const scale = this.master.unit * 1.737 / mask[2] * this.scale * scaleMult
					this.master.ctx.drawImage(img, mask[0], mask[1], mask[2], mask[3], p[0] - origin[0] * scale, p[1] - origin[1] * scale, mask[2] * scale, mask[3] * scale)
				}
			})

			api.patch(Sprite.prototype, 'renderXY', function (original) {
				return function (xy, dt, back, forcedScale) {
					const img = getRenderableImage(this)
					if (!img) return original.apply(this, arguments)

					this.update(dt)
					const p = xy
					const index = this.sequences[this.currentSequence][this.currentFrame]
					const mask = back ? this.backframes[index] : this.frames[index]
					const origin = this.origins[index]
					const scale = this.master.unit * 1.737 / mask[2] * (forcedScale || this.scale)
					this.master.ctx.drawImage(img, mask[0], mask[1], mask[2], mask[3], p[0] - origin[0] * scale, p[1] - origin[1] * scale, mask[2] * scale, mask[3] * scale)
				}
			})

			api.patch(Sprite.prototype, 'renderWithOverlay', function (original) {
				return function (uv, dt, back = false, scaleMult = 1, c) {
					const img = getRenderableImage(this)
					if (!img) return original.apply(this, arguments)

					this.update(dt)
					const p = this.master.uvToXY(uv)
					const index = this.sequences[this.currentSequence][this.currentFrame]
					const mask = back ? this.backframes[index] : this.frames[index]
					const origin = this.origins[index]
					const scale = this.master.unit * 1.737 / mask[2] * this.scale * scaleMult

					this.bcanvas.width = mask[2] * scale
					this.bcanvas.height = mask[3] * scale
					this.bctx.fillStyle = c
					this.bctx.fillRect(0, 0, this.bcanvas.width, this.bcanvas.height)
					this.bctx.globalCompositeOperation = 'destination-atop'
					this.bctx.drawImage(img, mask[0], mask[1], mask[2], mask[3], 0, 0, mask[2] * scale, mask[3] * scale)
					this.bctx.globalCompositeOperation = 'source-over'
					this.master.ctx.drawImage(this.bcanvas, p[0] - origin[0] * scale, p[1] - origin[1] * scale)
				}
			})

			api.patch(Sprite.prototype, 'renderStateWithOverlay', function (original) {
				return function (uv, f, back, scaleMult = 1, c) {
					const img = getRenderableImage(this)
					if (!img) return original.apply(this, arguments)

					const p = this.master.uvToXY(uv)
					const frame = Math.min(Math.floor(this.sequences[this.currentSequence].length * f), this.sequences[this.currentSequence].length - 1)
					const index = this.sequences[this.currentSequence][frame]
					const mask = back ? this.backframes[index] : this.frames[index]
					const origin = this.origins[index]
					const scale = this.master.unit * 1.737 / mask[2] * this.scale * scaleMult

					this.bcanvas.width = mask[2] * scale
					this.bcanvas.height = mask[3] * scale
					this.bctx.fillStyle = c
					this.bctx.fillRect(0, 0, this.bcanvas.width, this.bcanvas.height)
					this.bctx.globalCompositeOperation = 'destination-atop'
					this.bctx.drawImage(img, mask[0], mask[1], mask[2], mask[3], 0, 0, mask[2] * scale, mask[3] * scale)
					this.bctx.globalCompositeOperation = 'source-over'
					this.master.ctx.drawImage(this.bcanvas, p[0] - origin[0] * scale, p[1] - origin[1] * scale)
				}
			})
		}

		function getRenderableImage(sprite) {
			if (!sprite?.master || sprite.master.plane) return null
			if (isRealityFloorCleanupDisabled(sprite.master)) return null
			const src = sprite[sourceKey] || normalizeImageSrc(sprite.img)
			if (!targetImages.has(src)) return null
			if (!sprite.img || !isImageReady(sprite.img)) return null

			refreshConfigCache()
			const tuning = getSpriteTuning(src)
			if (tuning.enabled === false) return null

			let entry = cache.get(src)
			if (!entry) {
				entry = { canvas: null, failed: false }
				cache.set(src, entry)
			}
			if (entry.failed) return null
			if (!entry.canvas) {
				try {
					entry.canvas = buildCleanSprite(sprite, tuning)
				} catch (error) {
					entry.failed = true
					console.warn('[Sprite Cleanup] Failed to process ' + src, error)
					return null
				}
			}
			return entry.canvas
		}

		function isRealityFloorCleanupDisabled(game) {
			if (game?.[floorOverrideSharedStateKey] === false) return true
			try {
				if (typeof window !== 'undefined' && window[floorOverrideWindowStateKey] === false) return true
			} catch (error) {}
			return false
		}

		function buildCleanSprite(sprite, tuning) {
			const image = sprite.img
			const width = image.naturalWidth || image.width
			const height = image.naturalHeight || image.height
			const source = document.createElement('canvas')
			source.width = width
			source.height = height
			const sourceCtx = source.getContext('2d', { willReadFrequently: true })
			sourceCtx.drawImage(image, 0, 0, width, height)

			const imageData = sourceCtx.getImageData(0, 0, width, height)
			const data = imageData.data
			const masks = getSpriteMasks(sprite, width, height)
			for (const mask of masks) processFrame(data, width, height, mask, getFrameTuning(tuning, mask.index))

			const out = document.createElement('canvas')
			out.width = width
			out.height = height
			out.getContext('2d').putImageData(imageData, 0, 0)
			return out
		}

		function getSpriteMasks(sprite, width, height) {
			const masks = []
			const seen = new Set()
			const add = function (frame, index) {
				if (!Array.isArray(frame) || frame.length < 4) return
				const x = Math.max(0, Math.floor(frame[0]))
				const y = Math.max(0, Math.floor(frame[1]))
				const w = Math.min(width - x, Math.max(0, Math.floor(frame[2])))
				const h = Math.min(height - y, Math.max(0, Math.floor(frame[3])))
				if (!w || !h) return
				const key = x + ',' + y + ',' + w + ',' + h
				if (seen.has(key)) return
				seen.add(key)
				masks.push({ x, y, w, h, index })
			}

			if (Array.isArray(sprite.frames)) sprite.frames.forEach(function (frame, index) { add(frame, index) })
			if (Array.isArray(sprite.backframes)) sprite.backframes.forEach(function (frame, index) { add(frame, index) })
			if (!masks.length) add([0, 0, width, height], 0)
			return masks
		}

		function processFrame(data, width, height, frame, tuning) {
			if (tuning.enabled === false) return
			const background = estimateBackground(data, width, height, frame)
			const length = frame.w * frame.h
			const matte = tuning.matte > 0 ? floodConnectedMatte(data, width, height, frame, background, tuning) : new Uint8Array(length)
			const shadow = tuning.shadow > 0 ? floodConnectedShadow(data, width, height, frame, background, matte, tuning) : new Uint8Array(length)
			const edge = tuning.edge > 0 ? markEdgeDecontamination(data, width, height, frame, background, matte, shadow, tuning) : new Uint8Array(length)

			for (let i = 0; i < length; i++) {
				const p = framePixelOffset(i, width, frame)
				if (data[p + 3] < 5) continue
				if (matte[i]) {
					data[p + 3] = 0
				} else if (shadow[i]) {
					const opacity = shadowOpacity(data, p, background, tuning)
					data[p] = 0
					data[p + 1] = 0
					data[p + 2] = 0
					data[p + 3] = Math.round(255 * opacity)
				} else if (edge[i]) {
					decontaminateEdgePixel(data, p, background, tuning)
				}
			}
		}

		function floodConnectedMatte(data, width, height, frame, background, tuning) {
			const length = frame.w * frame.h
			const matte = new Uint8Array(length)
			const stack = []

			for (let x = 0; x < frame.w; x++) {
				pushIfMatte(x, 0)
				pushIfMatte(x, frame.h - 1)
			}
			for (let y = 1; y < frame.h - 1; y++) {
				pushIfMatte(0, y)
				pushIfMatte(frame.w - 1, y)
			}
			for (const seed of getMatteSeeds(tuning)) pushMatteSeed(seed)

			while (stack.length) {
				const i = stack.pop()
				const x = i % frame.w
				const y = (i - x) / frame.w
				pushIfMatte(x + 1, y)
				pushIfMatte(x - 1, y)
				pushIfMatte(x, y + 1)
				pushIfMatte(x, y - 1)
			}

			return matte

			function pushMatteSeed(seed) {
				if (!Array.isArray(seed) || seed.length < 2) return
				const sx = Number(seed[0])
				const sy = Number(seed[1])
				if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
				const x = Math.round(Math.abs(sx) <= 1 ? sx * (frame.w - 1) : sx)
				const y = Math.round(Math.abs(sy) <= 1 ? sy * (frame.h - 1) : sy)
				pushIfMatte(x, y, true)
			}

			function pushIfMatte(x, y, force) {
				if (x < 0 || y < 0 || x >= frame.w || y >= frame.h) return
				const i = y * frame.w + x
				if (matte[i]) return
				const p = framePixelOffset(i, width, frame)
				if (data[p + 3] < 5 || force || isMattePixel(data, p, background, tuning)) {
					matte[i] = 1
					stack.push(i)
				}
			}
		}

		function floodConnectedShadow(data, width, height, frame, background, matte, tuning) {
			const shadow = new Uint8Array(frame.w * frame.h)
			const distance = new Uint16Array(frame.w * frame.h)
			const stack = []
			const maxDistance = Math.max(12, Math.min(72, Math.round(frame.h * .16 * tuning.shadow)))

			for (let y = 0; y < frame.h; y++) {
				for (let x = 0; x < frame.w; x++) {
					const i = y * frame.w + x
					if (!matte[i]) continue
					pushIfShadow(x + 1, y, 1)
					pushIfShadow(x - 1, y, 1)
					pushIfShadow(x, y + 1, 1)
					pushIfShadow(x, y - 1, 1)
				}
			}

			while (stack.length) {
				const i = stack.pop()
				const x = i % frame.w
				const y = (i - x) / frame.w
				const nextDistance = distance[i] + 1
				if (nextDistance > maxDistance) continue
				pushIfShadow(x + 1, y, nextDistance)
				pushIfShadow(x - 1, y, nextDistance)
				pushIfShadow(x, y + 1, nextDistance)
				pushIfShadow(x, y - 1, nextDistance)
			}

			return shadow

			function pushIfShadow(x, y, d) {
				if (x < 0 || y < 0 || x >= frame.w || y >= frame.h) return
				const i = y * frame.w + x
				if (matte[i] || shadow[i]) return
				const p = framePixelOffset(i, width, frame)
				if (!isShadowPixel(data, p, background, y / frame.h, tuning)) return
				shadow[i] = 1
				distance[i] = d
				stack.push(i)
			}
		}

		function markEdgeDecontamination(data, width, height, frame, background, matte, shadow, tuning) {
			const edge = new Uint8Array(frame.w * frame.h)
			for (let y = 0; y < frame.h; y++) {
				for (let x = 0; x < frame.w; x++) {
					const i = y * frame.w + x
					if (matte[i] || shadow[i]) continue
					const p = framePixelOffset(i, width, frame)
					if (data[p + 3] < 5 || !shouldDecontaminatePixel(data, p, background, tuning)) continue
					for (let yy = -1; yy <= 1; yy++) {
						for (let xx = -1; xx <= 1; xx++) {
							if (!xx && !yy) continue
							const nx = x + xx
							const ny = y + yy
							if (nx < 0 || ny < 0 || nx >= frame.w || ny >= frame.h) continue
							if (matte[ny * frame.w + nx]) edge[i] = 1
						}
					}
				}
			}
			return edge
		}

		function estimateBackground(data, width, height, frame) {
			const samples = []
			const strideX = Math.max(1, Math.floor(frame.w / 28))
			const strideY = Math.max(1, Math.floor(frame.h / 28))
			for (let x = 0; x < frame.w; x += strideX) {
				sample(x, 0)
				sample(x, frame.h - 1)
			}
			for (let y = 0; y < frame.h; y += strideY) {
				sample(0, y)
				sample(frame.w - 1, y)
			}
			if (!samples.length) return { r: 255, g: 255, b: 255, luma: 255 }

			samples.sort(function (a, b) { return luma(b) - luma(a) })
			const top = samples.slice(0, Math.max(4, Math.ceil(samples.length * .6)))
			const color = top.reduce(function (out, item) {
				out.r += item.r
				out.g += item.g
				out.b += item.b
				return out
			}, { r: 0, g: 0, b: 0 })
			color.r /= top.length
			color.g /= top.length
			color.b /= top.length
			color.luma = rgbLuma(color.r, color.g, color.b)
			return color

			function sample(x, y) {
				const p = ((frame.y + y) * width + frame.x + x) * 4
				if (data[p + 3] < 5) return
				samples.push({ r: data[p], g: data[p + 1], b: data[p + 2] })
			}
		}

		function isMattePixel(data, p, background, tuning) {
			const matte = tuning.matte
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const lumaTolerance = getNumber(tuning.matteLuma, 24 * matte)
			const distanceMax = getNumber(tuning.matteDistance, 34 * matte)
			const satLimit = getNumber(tuning.matteSaturation, clamp(.1 * (1 + (matte - 1) * .25), .04, .18))
			return lum > background.luma - lumaTolerance && colorDistance(data, p, background) < distanceMax && saturation(data[p], data[p + 1], data[p + 2]) < satLimit
		}

		function isShadowPixel(data, p, background, yRatio, tuning) {
			const shadow = tuning.shadow
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const diff = background.luma - lum
			const yMin = clamp(.38 - (shadow - 1) * .1, .18, .58)
			const lumMin = 126 - (shadow - 1) * 24
			const diffMin = Math.max(3, 7 / Math.max(.25, shadow))
			const diffMax = 118 * shadow
			const satMax = clamp(.13 * (1 + (shadow - 1) * .45), .05, .3)
			const distanceMax = 152 * shadow
			return yRatio > yMin && lum > lumMin && diff > diffMin && diff < diffMax && saturation(data[p], data[p + 1], data[p + 2]) < satMax && colorDistance(data, p, background) < distanceMax
		}

		function shadowOpacity(data, p, background, tuning) {
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const diff = Math.max(0, background.luma - lum)
			return clamp(Math.pow(diff / 128, .9) * .56 * Math.sqrt(tuning.shadow), .025, .62)
		}

		function shouldDecontaminatePixel(data, p, background, tuning) {
			const edge = tuning.edge
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const diff = background.luma - lum
			const sat = saturation(data[p], data[p + 1], data[p + 2])
			const distance = colorDistance(data, p, background)
			const floor = Math.max(.25, edge)
			return diff > 18 / floor && diff < 126 * edge && distance > 30 / floor && distance < 148 * edge && sat > .08 / floor
		}

		function decontaminateEdgePixel(data, p, background, tuning) {
			const edge = Math.max(.25, tuning.edge)
			const distance = colorDistance(data, p, background)
			const minAlpha = clamp(.62 / Math.sqrt(edge), .32, .94)
			const alpha = clamp(distance / (130 * edge), minAlpha, 1)
			data[p] = clampByte((data[p] - background.r * (1 - alpha)) / alpha)
			data[p + 1] = clampByte((data[p + 1] - background.g * (1 - alpha)) / alpha)
			data[p + 2] = clampByte((data[p + 2] - background.b * (1 - alpha)) / alpha)
			data[p + 3] = Math.round(data[p + 3] * alpha)
		}

		function framePixelOffset(i, width, frame) {
			const x = i % frame.w
			const y = (i - x) / frame.w
			return ((frame.y + y) * width + frame.x + x) * 4
		}

		function refreshConfigCache() {
			const signature = JSON.stringify({
				globalThresholds: api.config.get('globalThresholds', {}),
				spriteThresholds: api.config.get('spriteThresholds', {})
			})
			if (signature === lastConfigSignature) return
			lastConfigSignature = signature
			cache.clear()
		}

		function getSpriteTuning(src) {
			const global = normalizeTuning(api.config.get('globalThresholds', {}))
			const spriteThresholds = readObject(api.config.get('spriteThresholds', {}))
			const shortName = src.replace(/^img\//, '')
			const specific = normalizeTuning(spriteThresholds[src] !== undefined ? spriteThresholds[src] : spriteThresholds[shortName])
			return Object.assign({}, defaultTuning, global, specific, { frames: mergeFrameTuning(global.frames, specific.frames) })
		}

		function getFrameTuning(spriteTuning, index) {
			const frames = readObject(spriteTuning.frames)
			const oneBased = index + 1
			const value = frames[String(oneBased)] ?? frames['frame' + oneBased] ?? frames['index' + index]
			if (value === undefined) return spriteTuning
			return Object.assign({}, spriteTuning, normalizeTuning(value), { frames })
		}

		function normalizeTuning(value) {
			const tuning = {}
			if (value === false) {
				tuning.enabled = false
				return tuning
			}
			if (typeof value === 'number') {
				tuning.matte = normalizeFactor(value, 1)
				return tuning
			}
			if (!isPlainObject(value)) return tuning

			if (value.enabled === false) tuning.enabled = false
			if (value.enabled === true) tuning.enabled = true
			applyTuningValue(tuning, 'matte', value.matte ?? value.white ?? value.whiteMatte ?? value.removeWhite)
			applyTuningValue(tuning, 'shadow', value.shadow ?? value.shadowMatte)
			applyTuningValue(tuning, 'edge', value.edge ?? value.dewhite ?? value.dewhiteEdge)
			applyTuningValue(tuning, 'matteDistance', value.matteDistance ?? value.whiteDistance)
			applyTuningValue(tuning, 'matteLuma', value.matteLuma ?? value.whiteLuma)
			applyTuningValue(tuning, 'matteSaturation', value.matteSaturation ?? value.whiteSaturation)
			if (Array.isArray(value.matteSeeds)) tuning.matteSeeds = value.matteSeeds
			else if (Array.isArray(value.seeds)) tuning.matteSeeds = value.seeds
			if (isPlainObject(value.frames)) tuning.frames = value.frames
			else if (isPlainObject(value.frameThresholds)) tuning.frames = value.frameThresholds
			return tuning
		}

		function mergeFrameTuning(globalFrames, specificFrames) {
			return Object.assign({}, readObject(globalFrames), readObject(specificFrames))
		}

		function getMatteSeeds(tuning) {
			return Array.isArray(tuning.matteSeeds) ? tuning.matteSeeds : []
		}

		function applyTuningValue(tuning, key, value) {
			if (value === undefined) return
			const max = key === 'matteDistance' || key === 'matteLuma' ? 1024 : key === 'matteSaturation' ? 1 : 3
			tuning[key] = normalizeFactor(value, tuning[key] ?? 1, max)
		}

		function normalizeFactor(value, fallback, max = 3) {
			const number = Number(value)
			return Number.isFinite(number) ? clamp(number, 0, max) : fallback
		}

		function getNumber(value, fallback) {
			const number = Number(value)
			return Number.isFinite(number) ? number : fallback
		}

		function readObject(value) {
			return isPlainObject(value) ? value : {}
		}

		function isPlainObject(value) {
			return !!value && typeof value === 'object' && !Array.isArray(value)
		}

		function normalizeImageSrc(img) {
			if (!img) return ''
			return normalizeSrc(img.getAttribute?.('src') || img.src || '')
		}

		function normalizeSrc(src) {
			if (!src) return ''
			const value = String(src).replace(/\\/g, '/').split('?')[0].split('#')[0]
			const marker = '/img/'
			const markerIndex = value.lastIndexOf(marker)
			if (markerIndex >= 0) return 'img/' + value.slice(markerIndex + marker.length)
			const plainIndex = value.lastIndexOf('img/')
			return plainIndex >= 0 ? value.slice(plainIndex) : value
		}

		function isImageReady(img) {
			return img instanceof HTMLCanvasElement || (img.complete && (img.naturalWidth || img.width) && (img.naturalHeight || img.height))
		}

		function colorDistance(data, p, background) {
			const dr = data[p] - background.r
			const dg = data[p + 1] - background.g
			const db = data[p + 2] - background.b
			return Math.sqrt(dr * dr + dg * dg + db * db)
		}

		function luma(color) {
			return rgbLuma(color.r, color.g, color.b)
		}

		function rgbLuma(r, g, b) {
			return .2126 * r + .7152 * g + .0722 * b
		}

		function saturation(r, g, b) {
			const max = Math.max(r, g, b)
			const min = Math.min(r, g, b)
			return max ? (max - min) / max : 0
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value))
		}

		function clampByte(value) {
			return Math.round(clamp(value, 0, 255))
		}
	}
})
