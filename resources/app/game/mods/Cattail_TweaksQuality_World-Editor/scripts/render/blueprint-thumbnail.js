ModLoader.register({
	id: 'Cattail_TweaksQuality_World-Editor',
	init(api) {
		const THUMBNAIL_KEY = Symbol.for('cattail.world-editor.blueprint-thumbnail')
		const SHARED_KEY = Symbol.for('cattail.world-editor.shared')
		const CACHE_VERSION = 'v5'
		const RESOLVED_CACHE_LIMIT = 128
		const FRAME_BUDGET_MS = 8
		const SLICE_RECORD_LIMIT = 256
		const ORDINARY_CUBE_COLORS = Object.freeze({
			top: '#a8d8ff',
			left: '#70b7ff',
			right: '#3f82c4'
		})
		const PAINTED_CUBE_FALLBACK_COLORS = Object.freeze({
			top: '#a8ffd0',
			left: '#78f0b3',
			right: '#3aa979'
		})
		const previous = globalThis[THUMBNAIL_KEY]
		previous?.dispose?.('blueprint-thumbnail-replaced')
		let disposed = false
		let generation = 0
		let game = null
		const pending = new Map()
		const resolved = new Map()
		const entityIcons = new Map()

		api?.on?.('afterGameInit', function (payload, currentGame) {
			game = currentGame || game
		})

		const service = Object.freeze({
			version: '0.5.1',
			placeholder: placeholderUrl(),
			peek(entry) {
				const key = cacheKey(entry)
				const result = key ? resolved.get(key) : null
				if (!result) return null
				resolved.delete(key)
				resolved.set(key, result)
				return result
			},
			get(handle, entry) {
				if (disposed) return Promise.resolve(null)
				const key = cacheKey(entry)
				if (!key || !entry?.envelope?.blueprint) return Promise.resolve({ url: placeholderUrl(), placeholder: true })
				const ready = service.peek(entry)
				if (ready) return Promise.resolve(ready)
				if (!pending.has(key)) {
					const task = { key, generation, promise: null }
					task.promise = loadOrCreate(handle, entry, key, task)
						.then(function (result) { return isTaskCurrent(task) ? remember(key, result) : null })
						.finally(function () { if (pending.get(key) === task) pending.delete(key) })
					pending.set(key, task)
				}
				return pending.get(key).promise
			},
			dispose() {
				if (disposed) return false
				disposed = true
				generation += 1
				pending.clear()
				resolved.clear()
				if (globalThis[THUMBNAIL_KEY] === service) delete globalThis[THUMBNAIL_KEY]
				return true
			}
		})

		Object.defineProperty(globalThis, THUMBNAIL_KEY, {
			value: service,
			configurable: true,
			writable: true
		})

		async function loadOrCreate(handle, entry, key, task) {
			try {
				const cached = await handle.read({ area: 'cache', bucket: 'thumbnails', name: key })
				assertTaskCurrent(task)
				return { key, url: await bytesToDataUrl(cached.data), cached: true, placeholder: false }
			} catch (error) {
				if (error?.code === 'CANCELLED') return null
				if (error?.code !== 'NOT_FOUND') return { key, url: placeholderUrl(), cached: false, placeholder: true, error: publicError(error) }
			}
			try {
				const bytes = await renderBytes(entry.envelope.blueprint, entry.envelope.defaultTransform, task)
				assertTaskCurrent(task)
				try {
					await handle.write({ area: 'cache', bucket: 'thumbnails', name: key, data: bytes })
				} catch (writeError) {
					if (writeError?.code !== 'NAME_CONFLICT') throw writeError
				}
				assertTaskCurrent(task)
				return { key, url: await bytesToDataUrl(bytes), cached: false, placeholder: false }
			} catch (error) {
				if (error?.code === 'CANCELLED') return null
				return { key, url: placeholderUrl(), cached: false, placeholder: true, error: publicError(error) }
			}
		}

		function remember(key, result) {
			if (!key || !result?.url || result.placeholder) return result
			resolved.delete(key)
			resolved.set(key, result)
			while (resolved.size > RESOLVED_CACHE_LIMIT) {
				resolved.delete(resolved.keys().next().value)
			}
			return result
		}

		function cacheKey(entry) {
			const id = String(entry?.envelope?.id || '').replace(/[^0-9a-f-]/gi, '').toLowerCase()
			const revision = String(entry?.revision || '').replace(/[^0-9a-f]/gi, '').toLowerCase()
			return id && revision ? CACHE_VERSION + '__' + id + '__' + revision.slice(0, 24) + '.png' : ''
		}

		async function renderBytes(blueprint, defaultTransform, task) {
			assertTaskCurrent(task)
			if (typeof document === 'undefined') throw thumbnailError('CANVAS_UNAVAILABLE')
			const canvas = document.createElement('canvas')
			canvas.width = 320
			canvas.height = 180
			const context = canvas.getContext?.('2d')
			if (!context) throw thumbnailError('CANVAS_UNAVAILABLE')
			const geometry = transformedGeometry(blueprint, defaultTransform)
			const bounds = geometry.bounds
			context.clearRect(0, 0, canvas.width, canvas.height)
			const entities = await collectRecords(blueprint.entities, function (entity, index) {
				return { name: String(entity?.name || ''), position: geometry.point(entity?.position), index }
			}, task)
			const blocks = await collectRecords(blueprint.blocks, function (cube, index) {
				return { position: geometry.point(cube?.position), painted: false, state: cube?.state, index }
			}, task)
			const paintedCubes = await collectRecords(blueprint.paintedCubes, function (cube, index) {
				return { position: geometry.point(cube?.position), painted: true, state: cube?.state, index }
			}, task)
			const surges = await collectRecords(blueprint.surges, function (surge) { return geometry.point(surge?.position) }, task)
			await processRecords(entities, function (record) {
				drawDiamond(context, project(record.position, bounds), 4.5, 'rgba(166,242,70,.48)')
			}, task)
			const cubeSize = cubeMetrics(bounds)
			const cubes = await stableSort(blocks.concat(paintedCubes), function (left, right) {
				const leftPoint = project(left.position, bounds)
				const rightPoint = project(right.position, bounds)
				return leftPoint[1] - rightPoint[1]
					|| leftPoint[0] - rightPoint[0]
					|| Number(left.painted) - Number(right.painted)
					|| left.index - right.index
			}, task)
			await processRecords(cubes, function (record) {
				const colors = record.painted ? paintedCubeColors(record.state) : ORDINARY_CUBE_COLORS
				drawIsometricCube(context, project(record.position, bounds), cubeSize, colors)
			}, task)
			await processRecords(surges, function (point) { drawDiamond(context, project(point, bounds), 4, '#ec78ff') }, task)
			const iconMap = await loadEntityIcons(entities, task)
			const iconSize = entityIconSize(bounds, entities.length)
			const sortedEntities = await stableSort(entities, function (left, right) {
				const leftPoint = project(left.position, bounds)
				const rightPoint = project(right.position, bounds)
				return leftPoint[1] - rightPoint[1] || leftPoint[0] - rightPoint[0] || left.index - right.index
			}, task)
			await processRecords(sortedEntities, function (record) {
				const point = project(record.position, bounds)
				const icon = iconMap.get(record.name)
				if (icon) drawEntityIcon(context, point, iconSize, icon)
				else drawEntityFallback(context, point, iconSize, record.name)
			}, task)
			const summary = String((blueprint.entities || []).length) + ' Buildings'
			context.font = '600 12px Montserrat, Arial, sans-serif'
			context.lineWidth = 3
			context.lineJoin = 'round'
			context.strokeStyle = 'rgba(0,0,0,.78)'
			context.strokeText(summary, 12, canvas.height - 12)
			context.fillStyle = 'rgba(255,255,255,.88)'
			context.fillText(summary, 12, canvas.height - 12)
			const blob = await new Promise(function (resolve, reject) {
				canvas.toBlob(function (value) { value ? resolve(value) : reject(thumbnailError('PNG_FAILED')) }, 'image/png')
			})
			assertTaskCurrent(task)
			return new Uint8Array(await blob.arrayBuffer())
		}

		async function collectRecords(values, convert, task) {
			const source = Array.isArray(values) ? values : []
			const result = []
			await processRecords(source, function (value, index) {
				const record = convert(value, index)
				if (record && (!Object.prototype.hasOwnProperty.call(record, 'position') || record.position)) result.push(record)
			}, task)
			return result
		}

		async function processRecords(values, process, task) {
			let sliceStarted = clockNow()
			let sliceCount = 0
			for (let index = 0; index < values.length; index += 1) {
				assertTaskCurrent(task)
				process(values[index], index)
				sliceCount += 1
				if (sliceCount >= SLICE_RECORD_LIMIT || clockNow() - sliceStarted >= FRAME_BUDGET_MS) {
					await yieldWork(task)
					sliceStarted = clockNow()
					sliceCount = 0
				}
			}
			assertTaskCurrent(task)
		}

		async function stableSort(values, compare, task) {
			if (values.length < 2) return values.slice()
			let source = values.slice()
			let target = new Array(source.length)
			for (let width = 1; width < source.length; width *= 2) {
				let operations = 0
				let sliceStarted = clockNow()
				for (let start = 0; start < source.length; start += width * 2) {
					let left = start
					let right = Math.min(start + width, source.length)
					const leftEnd = right
					const rightEnd = Math.min(start + width * 2, source.length)
					let output = start
					while (left < leftEnd || right < rightEnd) {
						target[output++] = right >= rightEnd || (left < leftEnd && compare(source[left], source[right]) <= 0)
							? source[left++]
							: source[right++]
						operations += 1
						if (operations >= SLICE_RECORD_LIMIT || clockNow() - sliceStarted >= FRAME_BUDGET_MS) {
							await yieldWork(task)
							operations = 0
							sliceStarted = clockNow()
						}
					}
				}
				const swap = source
				source = target
				target = swap
			}
			assertTaskCurrent(task)
			return source
		}

		function yieldWork(task) {
			return new Promise(function (resolve, reject) {
				const resume = function () {
					try { assertTaskCurrent(task); resolve() } catch (error) { reject(error) }
				}
				if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resume)
				else setTimeout(resume, 0)
			})
		}

		function clockNow() {
			return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
		}

		function isTaskCurrent(task) {
			return !!task && !disposed && task.generation === generation && pending.get(task.key) === task
		}

		function assertTaskCurrent(task) {
			if (!isTaskCurrent(task)) throw thumbnailError('CANCELLED')
		}

		function contentBounds(blueprint) {
			const min = position(blueprint?.contentBounds?.min)
			const max = position(blueprint?.contentBounds?.max)
			return min && max ? { min, max } : { min: [0, 0], max: [0, 0] }
		}

		function transformedGeometry(blueprint, defaultTransform) {
			const bounds = contentBounds(blueprint)
			const matrix = defaultTransformMatrix(defaultTransform)
			const center = [
				Math.ceil((bounds.min[0] + bounds.max[0]) / 2),
				Math.ceil((bounds.min[1] + bounds.max[1]) / 2)
			]
			const point = function (value) {
				const current = position(value)
				if (!current) return null
				const relativeU = current[0] - center[0]
				const relativeV = current[1] - center[1]
				return [
					center[0] + matrix[0] * relativeU + matrix[1] * relativeV,
					center[1] + matrix[2] * relativeU + matrix[3] * relativeV
				]
			}
			const corners = [
				point([bounds.min[0], bounds.min[1]]),
				point([bounds.max[0], bounds.min[1]]),
				point([bounds.max[0], bounds.max[1]]),
				point([bounds.min[0], bounds.max[1]])
			]
			return {
				point,
				bounds: {
					min: [
						Math.min.apply(null, corners.map(function (corner) { return corner[0] })),
						Math.min.apply(null, corners.map(function (corner) { return corner[1] }))
					],
					max: [
						Math.max.apply(null, corners.map(function (corner) { return corner[0] })),
						Math.max.apply(null, corners.map(function (corner) { return corner[1] }))
					]
				}
			}
		}

		function defaultTransformMatrix(value) {
			const rotation = ((Number(value?.rotation) % 360) + 360) % 360
			let result = rotation === 90
				? [0, -1, 1, 0]
				: rotation === 180
					? [-1, 0, 0, -1]
					: rotation === 270
						? [0, 1, -1, 0]
						: [1, 0, 0, 1]
			if (value?.mirrorU === true) result = multiplyMatrix([1, 0, 0, -1], result)
			if (value?.mirrorV === true) result = multiplyMatrix([-1, 0, 0, 1], result)
			return result
		}

		function multiplyMatrix(left, right) {
			return [
				left[0] * right[0] + left[1] * right[2],
				left[0] * right[1] + left[1] * right[3],
				left[2] * right[0] + left[3] * right[2],
				left[2] * right[1] + left[3] * right[3]
			]
		}

		function project(value, bounds) {
			const point = position(value) || [0, 0]
			const width = Math.max(1, bounds.max[0] - bounds.min[0] + 1)
			const height = Math.max(1, bounds.max[1] - bounds.min[1] + 1)
			const u = (point[0] - bounds.min[0] + .5) / width
			const v = (point[1] - bounds.min[1] + .5) / height
			return [28 + (u - v + 1) * 132, 18 + (u + v) * 62]
		}

		function drawDiamond(context, point, size, color) {
			context.fillStyle = color
			context.beginPath()
			context.moveTo(point[0], point[1] - size)
			context.lineTo(point[0] + size * 1.5, point[1])
			context.lineTo(point[0], point[1] + size)
			context.lineTo(point[0] - size * 1.5, point[1])
			context.closePath()
			context.fill()
		}

		function cubeMetrics(bounds) {
			const width = Math.max(1, bounds.max[0] - bounds.min[0] + 1)
			const height = Math.max(1, bounds.max[1] - bounds.min[1] + 1)
			const uSpacing = Math.hypot(132 / width, 62 / width)
			const vSpacing = Math.hypot(132 / height, 62 / height)
			const halfWidth = clamp(Math.min(uSpacing, vSpacing) * .42, .8, 14)
			return {
				halfWidth,
				halfHeight: halfWidth * (62 / 132),
				sideHeight: clamp(halfWidth * .82, .75, 11.5),
				lineWidth: clamp(halfWidth * .12, .35, 1)
			}
		}

		function drawIsometricCube(context, point, metrics, colors) {
			const x = point[0]
			const y = point[1]
			const halfWidth = metrics.halfWidth
			const halfHeight = metrics.halfHeight
			const halfSide = metrics.sideHeight / 2
			const top = [x, y - halfHeight - halfSide]
			const left = [x - halfWidth, y - halfSide]
			const center = [x, y + halfHeight - halfSide]
			const right = [x + halfWidth, y - halfSide]
			const leftBottom = [x - halfWidth, y + halfSide]
			const bottom = [x, y + halfHeight + halfSide]
			const rightBottom = [x + halfWidth, y + halfSide]
			context.save()
			try {
				context.strokeStyle = 'rgba(20, 30, 42, .42)'
				context.lineWidth = metrics.lineWidth
				context.lineJoin = 'round'
				context.lineCap = 'round'
				drawCubeFace(context, colors.left, [left, center, bottom, leftBottom])
				drawCubeFace(context, colors.right, [right, center, bottom, rightBottom])
				drawCubeFace(context, colors.top, [top, right, center, left])
			} finally {
				context.restore()
			}
		}

		function drawCubeFace(context, color, points) {
			context.fillStyle = color
			context.beginPath()
			context.moveTo(points[0][0], points[0][1])
			for (let index = 1; index < points.length; index += 1) {
				context.lineTo(points[index][0], points[index][1])
			}
			context.closePath()
			context.fill()
			context.stroke()
		}

		function paintedCubeColors(state) {
			const resource = dominantResourceId(state?.resources)
			const triplet = Number.isInteger(resource) ? game?.codex?.resources?.[resource]?.triplet : null
			if (!Array.isArray(triplet) || triplet.length < 3 || !triplet.every(isColorString)) {
				return PAINTED_CUBE_FALLBACK_COLORS
			}
			return {
				top: String(triplet[1]).trim(),
				left: String(triplet[0]).trim(),
				right: String(triplet[2]).trim()
			}
		}

		function dominantResourceId(resources) {
			const counts = new Map()
			for (const value of Array.isArray(resources) ? resources : []) {
				const resource = Number(value)
				if (!Number.isInteger(resource) || resource < 0) continue
				counts.set(resource, (counts.get(resource) || 0) + 1)
			}
			return Array.from(counts.entries()).sort(function (left, right) {
				return right[1] - left[1] || left[0] - right[0]
			})[0]?.[0] ?? null
		}

		function isColorString(value) {
			return typeof value === 'string' && value.trim().length > 0
		}

		async function loadEntityIcons(records, task) {
			assertTaskCurrent(task)
			const names = Array.from(new Set(records.map(function (record) { return record.name }).filter(Boolean)))
			await Promise.all(names.map(function (name) {
				if (!entityIcons.has(name)) entityIcons.set(name, loadEntityIcon(name))
				return entityIcons.get(name)
			}))
			assertTaskCurrent(task)
			const result = new Map()
			for (const name of names) {
				const icon = await entityIcons.get(name)
				if (icon) result.set(name, icon)
			}
			return result
		}

		async function loadEntityIcon(name) {
			const shopImage = game?.shop?.items?.find?.(function (item) { return item?.name === name })?.html?.querySelector?.('.imageVessel img')
			if (shopImage?.complete && Number(shopImage.naturalWidth) > 0) return prepareEntityIcon(shopImage)
			const shared = globalThis[SHARED_KEY]
			const source = shopImage?.currentSrc || shopImage?.src || shopImage?.getAttribute?.('src') || shared?.resolveEntityIcon?.(game, name)
			if (!source || typeof document === 'undefined') return null
			const image = document.createElement('img')
			const loaded = await new Promise(function (resolve) {
				let settled = false
				const finish = function (value) {
					if (settled) return
					settled = true
					clearTimeout(timeout)
					resolve(value)
				}
				const timeout = setTimeout(function () { finish(null) }, 1200)
				image.addEventListener('load', function () { finish(image) }, { once: true })
				image.addEventListener('error', function () { finish(null) }, { once: true })
				image.src = source
				if (image.complete && Number(image.naturalWidth) > 0) finish(image)
			})
			return loaded ? prepareEntityIcon(loaded) : null
		}

		function prepareEntityIcon(image) {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = 96
				canvas.height = 96
				const context = canvas.getContext?.('2d')
				if (!context) return image
				context.drawImage(image, 0, 0, canvas.width, canvas.height)
				const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
				for (let index = 0; index < pixels.data.length; index += 4) {
					const red = pixels.data[index]
					const green = pixels.data[index + 1]
					const blue = pixels.data[index + 2]
					const low = Math.min(red, green, blue)
					const high = Math.max(red, green, blue)
					if (low >= 246) pixels.data[index + 3] = 0
					else if (low > 226 && high - low < 24) {
						pixels.data[index + 3] = Math.round(pixels.data[index + 3] * (246 - low) / 20)
					}
				}
				context.clearRect(0, 0, canvas.width, canvas.height)
				context.putImageData(pixels, 0, 0)
				return canvas
			} catch (error) {
				return image
			}
		}

		function entityIconSize(bounds, count) {
			const width = Math.max(1, bounds.max[0] - bounds.min[0] + 1)
			const height = Math.max(1, bounds.max[1] - bounds.min[1] + 1)
			return clamp(Math.min(38, 150 / Math.max(width, height), 150 / Math.sqrt(Math.max(1, count))), 11, 34)
		}

		function drawEntityIcon(context, point, size, icon) {
			const drawSize = size * 1.7
			context.save()
			try {
				context.shadowColor = 'rgba(0,0,0,.62)'
				context.shadowBlur = Math.max(1, size * .16)
				context.shadowOffsetY = Math.max(1, size * .09)
				context.drawImage(icon, point[0] - drawSize / 2, point[1] - drawSize * .72, drawSize, drawSize)
			} finally {
				context.restore()
			}
		}

		function drawEntityFallback(context, point, size, name) {
			drawDiamond(context, point, Math.max(4.5, size * .42), '#a6f246')
			if (size < 17) return
			context.save()
			try {
				context.fillStyle = '#17200c'
				context.font = '700 ' + Math.round(Math.max(8, size * .38)) + 'px Montserrat, Arial, sans-serif'
				context.textAlign = 'center'
				context.textBaseline = 'middle'
				context.fillText(String(name || '?').slice(0, 1).toUpperCase(), point[0], point[1])
			} finally {
				context.restore()
			}
		}

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, Number(value) || min))
		}

		async function bytesToDataUrl(bytes) {
			if (typeof Blob === 'undefined' || typeof FileReader === 'undefined') return placeholderUrl()
			const blob = new Blob([bytes], { type: 'image/png' })
			return new Promise(function (resolve, reject) {
				const reader = new FileReader()
				reader.onload = function () { resolve(String(reader.result || placeholderUrl())) }
				reader.onerror = function () { reject(thumbnailError('PNG_READ_FAILED')) }
				reader.readAsDataURL(blob)
			})
		}

		function placeholderUrl() {
			return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
				'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><g stroke="#69717f" stroke-width="3" stroke-linejoin="round"><g><path d="M89 106l33-17 33 17-33 17z" fill="#8b929e"/><path d="M89 106l33 17v28l-33-17z" fill="#69717f"/><path d="M122 123l33-17v28l-33 17z" fill="#aeb4bd"/></g><g><path d="M145 106l33-17 33 17-33 17z" fill="#8b929e"/><path d="M145 106l33 17v28l-33-17z" fill="#69717f"/><path d="M178 123l33-17v28l-33 17z" fill="#aeb4bd"/></g><g><path d="M117 72l33-17 33 17-33 17z" fill="#8b929e"/><path d="M117 72l33 17v28l-33-17z" fill="#69717f"/><path d="M150 89l33-17v28l-33 17z" fill="#aeb4bd"/></g></g></svg>'
			)
		}

		function position(value) {
			if (!Array.isArray(value) || value.length < 2) return null
			const u = Number(value[0])
			const v = Number(value[1])
			return Number.isSafeInteger(u) && Number.isSafeInteger(v) ? [u, v] : null
		}

		function thumbnailError(code) {
			const error = new Error(code)
			error.code = code
			return error
		}

		function publicError(error) {
			return { code: String(error?.code || 'THUMBNAIL_FAILED'), message: String(error?.message || 'Thumbnail generation failed.') }
		}
	}
})
