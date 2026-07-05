ModLoader.register({
	id: 'Cattail_TweaksQuality_Dynamic-Background-Sprite-Cleanup',
	init(api) {
		const sourceKey = '__cattailSpriteCleanupSource'
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
			const src = sprite[sourceKey] || normalizeImageSrc(sprite.img)
			if (!targetImages.has(src)) return null
			if (!sprite.img || !isImageReady(sprite.img)) return null

			let entry = cache.get(src)
			if (!entry) {
				entry = { canvas: null, failed: false }
				cache.set(src, entry)
			}
			if (entry.failed) return null
			if (!entry.canvas) {
				try {
					entry.canvas = buildCleanSprite(sprite.img)
				} catch (error) {
					entry.failed = true
					console.warn('[Sprite Cleanup] Failed to process ' + src, error)
					return null
				}
			}
			return entry.canvas
		}

		function buildCleanSprite(image) {
			const width = image.naturalWidth || image.width
			const height = image.naturalHeight || image.height
			const source = document.createElement('canvas')
			source.width = width
			source.height = height
			const sourceCtx = source.getContext('2d', { willReadFrequently: true })
			sourceCtx.drawImage(image, 0, 0, width, height)

			const imageData = sourceCtx.getImageData(0, 0, width, height)
			const data = imageData.data
			const background = estimateBackground(data, width, height)
			const connected = floodConnectedBackdrop(data, width, height, background)
			const machineAdjacent = markMachineAdjacent(data, width, height, connected, background)

			for (let i = 0; i < connected.length; i++) {
				const p = i * 4
				const alpha = data[p + 3]
				if (alpha < 5) continue
				if (connected[i]) {
					if (isShadowPixel(data, p, background)) {
						const opacity = shadowOpacity(data, p, background)
						data[p] = 0
						data[p + 1] = 0
						data[p + 2] = 0
						data[p + 3] = Math.round(255 * opacity)
					} else {
						data[p + 3] = 0
					}
				} else if (machineAdjacent[i]) {
					decontaminateEdgePixel(data, p, background)
				}
			}

			const out = document.createElement('canvas')
			out.width = width
			out.height = height
			out.getContext('2d').putImageData(imageData, 0, 0)
			return out
		}

		function floodConnectedBackdrop(data, width, height, background) {
			const length = width * height
			const connected = new Uint8Array(length)
			const stack = []

			for (let x = 0; x < width; x++) {
				pushIfBackdrop(x, 0)
				pushIfBackdrop(x, height - 1)
			}
			for (let y = 1; y < height - 1; y++) {
				pushIfBackdrop(0, y)
				pushIfBackdrop(width - 1, y)
			}

			while (stack.length) {
				const i = stack.pop()
				const x = i % width
				const y = (i - x) / width
				pushIfBackdrop(x + 1, y)
				pushIfBackdrop(x - 1, y)
				pushIfBackdrop(x, y + 1)
				pushIfBackdrop(x, y - 1)
			}

			return connected

			function pushIfBackdrop(x, y) {
				if (x < 0 || y < 0 || x >= width || y >= height) return
				const i = y * width + x
				if (connected[i]) return
				const p = i * 4
				if (data[p + 3] < 5 || isBackdropPixel(data, p, background)) {
					connected[i] = 1
					stack.push(i)
				}
			}
		}

		function markMachineAdjacent(data, width, height, connected, background) {
			const adjacent = new Uint8Array(width * height)
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const i = y * width + x
					if (connected[i]) continue
					const p = i * 4
					if (data[p + 3] < 5) continue
					if (colorDistance(data, p, background) > 120) continue
					for (let yy = -1; yy <= 1; yy++) {
						for (let xx = -1; xx <= 1; xx++) {
							if (!xx && !yy) continue
							const nx = x + xx
							const ny = y + yy
							if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
							if (connected[ny * width + nx]) adjacent[i] = 1
						}
					}
				}
			}
			return adjacent
		}

		function estimateBackground(data, width, height) {
			const samples = []
			const strideX = Math.max(1, Math.floor(width / 28))
			const strideY = Math.max(1, Math.floor(height / 28))
			for (let x = 0; x < width; x += strideX) {
				sample(x, 0)
				sample(x, height - 1)
			}
			for (let y = 0; y < height; y += strideY) {
				sample(0, y)
				sample(width - 1, y)
			}
			if (!samples.length) return { r: 255, g: 255, b: 255, luma: 255 }

			samples.sort(function (a, b) { return luma(b) - luma(a) })
			const top = samples.slice(0, Math.max(4, Math.ceil(samples.length * .45)))
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
				const p = (y * width + x) * 4
				if (data[p + 3] < 5) return
				samples.push({ r: data[p], g: data[p + 1], b: data[p + 2] })
			}
		}

		function isBackdropPixel(data, p, background) {
			if (nearBackground(data, p, background)) return true
			return isShadowPixel(data, p, background)
		}

		function nearBackground(data, p, background) {
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			return lum > background.luma - 55 && colorDistance(data, p, background) < 72
		}

		function isShadowPixel(data, p, background) {
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const diff = background.luma - lum
			return diff > 8 && diff < 150 && saturation(data[p], data[p + 1], data[p + 2]) < .18 && colorDistance(data, p, background) < 190
		}

		function shadowOpacity(data, p, background) {
			const lum = rgbLuma(data[p], data[p + 1], data[p + 2])
			const diff = Math.max(0, background.luma - lum)
			return clamp(Math.pow(diff / 120, .86) * .72, .04, .62)
		}

		function decontaminateEdgePixel(data, p, background) {
			const distance = colorDistance(data, p, background)
			const alpha = clamp(distance / 105, .24, 1)
			data[p] = clampByte((data[p] - background.r * (1 - alpha)) / alpha)
			data[p + 1] = clampByte((data[p + 1] - background.g * (1 - alpha)) / alpha)
			data[p + 2] = clampByte((data[p + 2] - background.b * (1 - alpha)) / alpha)
			data[p + 3] = Math.round(data[p + 3] * alpha)
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
