ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		let previewEnabled = null
		let previewColors = null

		installConfigPreviewListener()
		installResourceGlowSharingPanel()

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
		function installResourceGlowSharingPanel() {
			ensureResourceGlowSharingStyle()
			const enhance = function () {
				const panel = document.getElementById('modloader-panel')
				if (!panel) return
				panel.querySelectorAll('.modloader-resource-colors').forEach(function (root) {
					if (root.dataset.cattailGlowSharing === 'true') return
					if (!isResourceGlowConfigRoot(root)) return
					root.dataset.cattailGlowSharing = 'true'
					insertResourceGlowSharingTools(root)
				})
			}
			const start = function () {
				if (!document.body) {
					setTimeout(start, 100)
					return
				}
				enhance()
				const observer = new MutationObserver(enhance)
				observer.observe(document.body, { childList: true, subtree: true })
			}
			start()
		}

		function isResourceGlowConfigRoot(root) {
			const field = root.closest('.modloader-config-field')
			const row = root.closest('.modloader-mod-row')
			const meta = field?.querySelector('.modloader-config-meta')?.textContent || ''
			const rowText = row?.textContent || ''
			return meta.includes('resourceGlowColors') && rowText.includes('Cattail_TweaksQuality_Tweaks')
		}

		function insertResourceGlowSharingTools(root) {
			const tools = document.createElement('div')
			tools.className = 'cattail-resource-glow-share-tools'
			const exportButton = document.createElement('button')
			exportButton.type = 'button'
			exportButton.className = 'cattail-resource-glow-share-button'
			exportButton.textContent = 'Export'
			exportButton.title = 'Copy all resource glow colors to the clipboard'
			const importButton = document.createElement('button')
			importButton.type = 'button'
			importButton.className = 'cattail-resource-glow-share-button'
			importButton.textContent = 'Import'
			importButton.title = 'Import resource glow colors from the clipboard'
			const status = document.createElement('span')
			status.className = 'cattail-resource-glow-share-status'
			const disabled = root.dataset.disabled === 'true'
			exportButton.disabled = disabled
			importButton.disabled = disabled
			tools.append(exportButton, importButton, status)
			root.insertBefore(tools, root.firstChild)

			exportButton.addEventListener('click', async function (event) {
				event.preventDefault()
				event.stopPropagation()
				try {
					await writeClipboardText(createResourceGlowShareText(root))
					setSharingStatus(status, 'Copied all colors.', 'ok')
				} catch (error) {
					setSharingStatus(status, error.message || 'Export failed.', 'error')
				}
			})
			importButton.addEventListener('click', async function (event) {
				event.preventDefault()
				event.stopPropagation()
				try {
					const colors = parseResourceGlowShareText(await readClipboardText())
					const count = applyResourceGlowColors(root, colors)
					setSharingStatus(status, 'Imported ' + count + ' colors.', 'ok')
				} catch (error) {
					setSharingStatus(status, error.message || 'Import failed.', 'error')
				}
			})
		}

		function ensureResourceGlowSharingStyle() {
			if (document.getElementById('cattail-resource-glow-sharing-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-resource-glow-sharing-style'
			style.textContent = `
				#modloader-panel .cattail-resource-glow-share-tools { display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 2px; }
				#modloader-panel .cattail-resource-glow-share-button { border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 5px 7px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.78); cursor: pointer; }
				#modloader-panel .cattail-resource-glow-share-button:hover { background: rgba(255,255,255,.14); color: rgba(255,255,255,.94); }
				#modloader-panel .cattail-resource-glow-share-button:disabled { cursor: default; opacity: .45; }
				#modloader-panel .cattail-resource-glow-share-status { min-width: 0; color: rgba(255,255,255,.5); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				#modloader-panel .cattail-resource-glow-share-status[data-tone="ok"] { color: #cfe9ff; }
				#modloader-panel .cattail-resource-glow-share-status[data-tone="error"] { color: #ffb0b0; }
				#modloader-panel.modloader-panel-theme-light .cattail-resource-glow-share-button { background: rgba(0,0,0,.055); border-color: rgba(0,0,0,.12); color: rgba(18,20,22,.78); }
			`
			document.head.appendChild(style)
		}

		function setSharingStatus(status, message, tone) {
			if (!status) return
			status.textContent = message || ''
			status.dataset.tone = tone || ''
			if (status.__cattailTimer) clearTimeout(status.__cattailTimer)
			status.__cattailTimer = null
			if (!message) return
			status.__cattailTimer = setTimeout(function () {
				status.textContent = ''
				status.dataset.tone = ''
				status.__cattailTimer = null
			}, 2400)
		}

		function createResourceGlowShareText(root) {
			return JSON.stringify({
				type: 'CattailResourceGlowColors',
				version: 1,
				colors: readResourceGlowColors(root, true)
			}, null, 2)
		}

		function readResourceGlowColors(root, includeDefaults) {
			const out = {}
			root.querySelectorAll('.modloader-resource-color-row').forEach(function (row) {
				const textInput = row.querySelector('.modloader-resource-color-text')
				const color = normalizeHexColor(textInput?.value)
				if (!color) throw new Error('Enter colors as #RRGGBB.')
				if (includeDefaults || color !== row.dataset.defaultColor) out[row.dataset.resourceId] = color
			})
			return out
		}

		function parseResourceGlowShareText(text) {
			const source = String(text || '').trim()
			if (!source) throw new Error('Clipboard is empty.')
			if (/^[\[{]/.test(source)) {
				try {
					return normalizeResourceGlowImportData(JSON.parse(source))
				} catch (error) {
					throw new Error('Clipboard does not contain valid color data.')
				}
			}
			return parseResourceGlowColorLines(source)
		}

		function normalizeResourceGlowImportData(data) {
			const source = data && (data.colors !== undefined ? data.colors : (data.resourceGlowColors !== undefined ? data.resourceGlowColors : data))
			const out = {}
			const add = function (key, value) {
				const id = normalizeResourceGlowImportKey(key)
				const raw = value && typeof value === 'object' && !Array.isArray(value) && value.color !== undefined ? value.color : value
				const color = normalizeHexColor(raw)
				if (!id && color) return
				if (id && !color) throw new Error('Imported color data contains invalid colors.')
				if (id && color) out[id] = color
			}
			if (Array.isArray(source)) {
				source.forEach(function (value, index) {
					const key = value && typeof value === 'object' && !Array.isArray(value) && value.id !== undefined ? value.id : index
					add(key, value)
				})
			} else if (source && typeof source === 'object') {
				Object.keys(source).forEach(function (key) { add(key, source[key]) })
			} else {
				throw new Error('Clipboard does not contain color data.')
			}
			if (!Object.keys(out).length) throw new Error('Clipboard does not contain color data.')
			return out
		}

		function parseResourceGlowColorLines(text) {
			const out = {}
			let nextId = 0
			String(text || '').split(/[\r\n,;]+/).map(function (part) { return part.trim() }).filter(Boolean).forEach(function (part) {
				const match = part.match(/^(?:r?(\d+)\s*[:=]\s*)?(#?[0-9a-f]{3}(?:[0-9a-f]{3})?)$/i)
				if (!match) throw new Error('Clipboard does not contain valid color data.')
				const color = normalizeHexColor(match[2])
				if (!color) throw new Error('Clipboard does not contain valid color data.')
				const id = match[1] !== undefined ? String(Number(match[1])) : String(nextId++)
				out[id] = color
			})
			if (!Object.keys(out).length) throw new Error('Clipboard is empty.')
			return out
		}

		function normalizeResourceGlowImportKey(key) {
			const match = String(key).trim().match(/^r?(\d+)$/i)
			return match ? String(Number(match[1])) : ''
		}

		function applyResourceGlowColors(root, colors) {
			let applied = 0
			root.querySelectorAll('.modloader-resource-color-row').forEach(function (row) {
				const color = colors[row.dataset.resourceId]
				if (color === undefined) return
				const normalized = normalizeHexColor(color)
				if (!normalized) throw new Error('Imported color data contains invalid colors.')
				const picker = row.querySelector('.modloader-resource-color-picker')
				const textInput = row.querySelector('.modloader-resource-color-text')
				if (picker) picker.value = normalized
				if (textInput) textInput.value = normalized
				applied++
			})
			if (!applied) throw new Error('No matching resource colors were found.')
			root.dispatchEvent(new Event('input', { bubbles: true }))
			return applied
		}

		async function readClipboardText() {
			try {
				if (window.navigator?.clipboard?.readText) {
					const text = await window.navigator.clipboard.readText()
					if (text !== undefined && text !== null) return String(text)
				}
			} catch (error) {}
			const clipboard = getElectronClipboard()
			if (clipboard?.readText) return String(clipboard.readText() || '')
			throw new Error('Clipboard is not available.')
		}

		async function writeClipboardText(text) {
			try {
				if (window.navigator?.clipboard?.writeText) {
					await window.navigator.clipboard.writeText(text)
					return
				}
			} catch (error) {}
			const clipboard = getElectronClipboard()
			if (clipboard?.writeText) {
				clipboard.writeText(text)
				return
			}
			throw new Error('Clipboard is not available.')
		}

		function getElectronClipboard() {
			try {
				if (typeof require === 'function') return require('electron')?.clipboard || null
			} catch (error) {}
			return null
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