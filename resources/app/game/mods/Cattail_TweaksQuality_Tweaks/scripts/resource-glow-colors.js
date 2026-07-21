ModLoader.register({
	id: 'Cattail_TweaksQuality_Tweaks',
	init(api) {
		let previewEnabled = null
		let previewColors = null
		let defaultGlowColors = null
		const rgbaStopsCache = new Map()

		const shareText = {
	"en": {
		"export": "Export",
		"exportTitle": "Copy all resource glow colors to the clipboard",
		"import": "Import",
		"importTitle": "Import resource glow colors from the clipboard",
		"copied": "Copied all colors.",
		"imported": "Imported {count} colors.",
		"exportFailed": "Export failed.",
		"importFailed": "Import failed.",
		"invalidColors": "Imported color data contains invalid colors."
	},
	"ru": {
		"export": "Экспорт",
		"exportTitle": "Скопировать все цвета свечения ресурсов в буфер обмена",
		"import": "Импорт",
		"importTitle": "Импортировать цвета свечения ресурсов из буфера обмена",
		"copied": "Все цвета скопированы.",
		"imported": "Импортировано цветов: {count}.",
		"exportFailed": "Ошибка экспорта.",
		"importFailed": "Ошибка импорта.",
		"invalidColors": "Импортированные данные содержат недопустимые цвета."
	},
	"de": {
		"export": "Export",
		"exportTitle": "Alle Ressourcen-Leuchtfarben in die Zwischenablage kopieren",
		"import": "Import",
		"importTitle": "Ressourcen-Leuchtfarben aus der Zwischenablage importieren",
		"copied": "Alle Farben kopiert.",
		"imported": "{count} Farben importiert.",
		"exportFailed": "Export fehlgeschlagen.",
		"importFailed": "Import fehlgeschlagen.",
		"invalidColors": "Importierte Farbdaten enthalten ungültige Farben."
	},
	"ptbr": {
		"export": "Exportar",
		"exportTitle": "Copiar todas as cores de brilho dos recursos para a área de transferência",
		"import": "Importar",
		"importTitle": "Importar cores de brilho dos recursos da área de transferência",
		"copied": "Todas as cores foram copiadas.",
		"imported": "{count} cores importadas.",
		"exportFailed": "Falha ao exportar.",
		"importFailed": "Falha ao importar.",
		"invalidColors": "Os dados importados contêm cores inválidas."
	},
	"it": {
		"export": "Esporta",
		"exportTitle": "Copia tutti i colori bagliore risorse negli appunti",
		"import": "Importa",
		"importTitle": "Importa i colori bagliore risorse dagli appunti",
		"copied": "Tutti i colori copiati.",
		"imported": "{count} colori importati.",
		"exportFailed": "Esportazione non riuscita.",
		"importFailed": "Importazione non riuscita.",
		"invalidColors": "I dati colore importati contengono colori non validi."
	},
	"es": {
		"export": "Exportar",
		"exportTitle": "Copiar todos los colores de brillo de recursos al portapapeles",
		"import": "Importar",
		"importTitle": "Importar colores de brillo de recursos desde el portapapeles",
		"copied": "Todos los colores copiados.",
		"imported": "{count} colores importados.",
		"exportFailed": "Error al exportar.",
		"importFailed": "Error al importar.",
		"invalidColors": "Los datos importados contienen colores no válidos."
	},
	"fr": {
		"export": "Exporter",
		"exportTitle": "Copier toutes les couleurs de halo des ressources dans le presse-papiers",
		"import": "Importer",
		"importTitle": "Importer les couleurs de halo des ressources depuis le presse-papiers",
		"copied": "Toutes les couleurs sont copiées.",
		"imported": "{count} couleurs importées.",
		"exportFailed": "Échec de l’export.",
		"importFailed": "Échec de l’import.",
		"invalidColors": "Les données importées contiennent des couleurs invalides."
	},
	"nl": {
		"export": "Exporteren",
		"exportTitle": "Kopieer alle gloedkleuren van grondstoffen naar het klembord",
		"import": "Importeren",
		"importTitle": "Importeer gloedkleuren van grondstoffen vanaf het klembord",
		"copied": "Alle kleuren gekopieerd.",
		"imported": "{count} kleuren geïmporteerd.",
		"exportFailed": "Export mislukt.",
		"importFailed": "Import mislukt.",
		"invalidColors": "Geïmporteerde kleurgegevens bevatten ongeldige kleuren."
	},
	"cz": {
		"export": "Export",
		"exportTitle": "Zkopírovat všechny barvy záře surovin do schránky",
		"import": "Import",
		"importTitle": "Importovat barvy záře surovin ze schránky",
		"copied": "Všechny barvy zkopírovány.",
		"imported": "Importováno {count} barev.",
		"exportFailed": "Export selhal.",
		"importFailed": "Import selhal.",
		"invalidColors": "Importovaná data barev obsahují neplatné barvy."
	},
	"pl": {
		"export": "Eksport",
		"exportTitle": "Skopiuj wszystkie kolory poświaty zasobów do schowka",
		"import": "Import",
		"importTitle": "Importuj kolory poświaty zasobów ze schowka",
		"copied": "Skopiowano wszystkie kolory.",
		"imported": "Zaimportowano kolory: {count}.",
		"exportFailed": "Eksport nie powiódł się.",
		"importFailed": "Import nie powiódł się.",
		"invalidColors": "Importowane dane zawierają nieprawidłowe kolory."
	},
	"jp": {
		"export": "エクスポート",
		"exportTitle": "すべての資源の光輪色をクリップボードへコピー",
		"import": "インポート",
		"importTitle": "クリップボードから資源の光輪色をインポート",
		"copied": "すべての色をコピーしました。",
		"imported": "{count} 色をインポートしました。",
		"exportFailed": "エクスポートに失敗しました。",
		"importFailed": "インポートに失敗しました。",
		"invalidColors": "インポートした色データに無効な色があります。"
	},
	"kr": {
		"export": "내보내기",
		"exportTitle": "모든 자원 발광 색상을 클립보드에 복사",
		"import": "가져오기",
		"importTitle": "클립보드에서 자원 발광 색상 가져오기",
		"copied": "모든 색상을 복사했습니다.",
		"imported": "{count}개 색상을 가져왔습니다.",
		"exportFailed": "내보내기에 실패했습니다.",
		"importFailed": "가져오기에 실패했습니다.",
		"invalidColors": "가져온 색상 데이터에 잘못된 색상이 있습니다."
	},
	"sch": {
		"export": "导出",
		"exportTitle": "复制全部资源光圈颜色到剪贴板",
		"import": "导入",
		"importTitle": "从剪贴板导入资源光圈颜色",
		"copied": "已复制全部颜色。",
		"imported": "已导入 {count} 个颜色。",
		"exportFailed": "导出失败。",
		"importFailed": "导入失败。",
		"invalidColors": "导入的颜色数据包含无效颜色。"
	},
	"tch": {
		"export": "匯出",
		"exportTitle": "複製全部資源光圈顏色到剪貼簿",
		"import": "匯入",
		"importTitle": "從剪貼簿匯入資源光圈顏色",
		"copied": "已複製全部顏色。",
		"imported": "已匯入 {count} 個顏色。",
		"exportFailed": "匯出失敗。",
		"importFailed": "匯入失敗。",
		"invalidColors": "匯入的顏色資料包含無效顏色。"
	},
	"thai": {
		"export": "ส่งออก",
		"exportTitle": "คัดลอกสีเรืองแสงทรัพยากรทั้งหมดไปยังคลิปบอร์ด",
		"import": "นำเข้า",
		"importTitle": "นำเข้าสีเรืองแสงทรัพยากรจากคลิปบอร์ด",
		"copied": "คัดลอกสีทั้งหมดแล้ว",
		"imported": "นำเข้า {count} สีแล้ว",
		"exportFailed": "ส่งออกไม่สำเร็จ",
		"importFailed": "นำเข้าไม่สำเร็จ",
		"invalidColors": "ข้อมูลสีที่นำเข้ามีสีไม่ถูกต้อง"
	},
	"hu": {
		"export": "Export",
		"exportTitle": "Minden erőforrás-fény színének másolása a vágólapra",
		"import": "Import",
		"importTitle": "Erőforrás-fény színek importálása a vágólapról",
		"copied": "Minden szín másolva.",
		"imported": "{count} szín importálva.",
		"exportFailed": "Export sikertelen.",
		"importFailed": "Import sikertelen.",
		"invalidColors": "Az importált színadatok érvénytelen színeket tartalmaznak."
	},
	"lv": {
		"export": "Eksportēt",
		"exportTitle": "Kopēt visas resursu spīduma krāsas starpliktuvē",
		"import": "Importēt",
		"importTitle": "Importēt resursu spīduma krāsas no starpliktuves",
		"copied": "Visas krāsas nokopētas.",
		"imported": "Importētas {count} krāsas.",
		"exportFailed": "Eksports neizdevās.",
		"importFailed": "Imports neizdevās.",
		"invalidColors": "Importētajos krāsu datos ir nederīgas krāsas."
	},
	"ro": {
		"export": "Export",
		"exportTitle": "Copiază toate culorile halou ale resurselor în clipboard",
		"import": "Import",
		"importTitle": "Importă culorile halou ale resurselor din clipboard",
		"copied": "Toate culorile au fost copiate.",
		"imported": "S-au importat {count} culori.",
		"exportFailed": "Export eșuat.",
		"importFailed": "Import eșuat.",
		"invalidColors": "Datele de culoare importate conțin culori nevalide."
	},
	"no": {
		"export": "Eksporter",
		"exportTitle": "Kopier alle glødefarger for ressurser til utklippstavlen",
		"import": "Importer",
		"importTitle": "Importer glødefarger for ressurser fra utklippstavlen",
		"copied": "Alle farger kopiert.",
		"imported": "Importerte {count} farger.",
		"exportFailed": "Eksport mislyktes.",
		"importFailed": "Import mislyktes.",
		"invalidColors": "Importerte fargedata inneholder ugyldige farger."
	},
	"modsch": {
		"export": "导出",
		"exportTitle": "复制全部资源光圈颜色到剪贴板",
		"import": "导入",
		"importTitle": "从剪贴板导入资源光圈颜色",
		"copied": "已复制全部颜色。",
		"imported": "已导入 {count} 个颜色。",
		"exportFailed": "导出失败。",
		"importFailed": "导入失败。",
		"invalidColors": "导入的颜色数据包含无效颜色。"
	}
}

		installConfigPreviewListener()
		installResourceGlowSharingPanel()

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined') return
			patchResourceGlow(api)
		})

		function getShareLanguage() {
			const raw = String(api.state?.game?.language || '').trim().toLowerCase()
			if (shareText[raw]) return raw
			if (raw === 'zh-cn' || raw === 'zh') return 'sch'
			if (raw === 'zh-tw') return 'tch'
			return 'en'
		}

		function tShare(key, values) {
			const language = getShareLanguage()
			const table = shareText[language] || shareText.en
			let text = table[key] || shareText.en[key] || key
			if (!values) return text
			return text.replace(/\{(\w+)\}/g, function (match, name) {
				return values[name] === undefined ? match : String(values[name])
			})
		}

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
			exportButton.textContent = tShare('export')
			exportButton.title = tShare('exportTitle')
			const importButton = document.createElement('button')
			importButton.type = 'button'
			importButton.className = 'cattail-resource-glow-share-button'
			importButton.textContent = tShare('import')
			importButton.title = tShare('importTitle')
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
					setSharingStatus(status, tShare('copied'), 'ok')
				} catch (error) {
					setSharingStatus(status, error.message || tShare('exportFailed'), 'error')
				}
			})
			importButton.addEventListener('click', async function (event) {
				event.preventDefault()
				event.stopPropagation()
				try {
					const colors = parseResourceGlowShareText(await readClipboardText())
					const count = applyResourceGlowColors(root, colors)
					setSharingStatus(status, tShare('imported', { count }), 'ok')
				} catch (error) {
					setSharingStatus(status, error.message || tShare('importFailed'), 'error')
				}
			})
		}

		function ensureResourceGlowSharingStyle() {
			if (document.getElementById('cattail-resource-glow-sharing-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-resource-glow-sharing-style'
			style.textContent = `
				#modloader-panel .cattail-resource-glow-share-tools { display: flex; align-items: center; gap: 7px; min-width: 0; margin-bottom: 2px; }
				#modloader-panel .cattail-resource-glow-share-button { border: 1px solid var(--modloader-control-border); border-radius: 5px; padding: 5px 7px; background: var(--modloader-control-bg); color: var(--modloader-control-text); cursor: pointer; }
				#modloader-panel .cattail-resource-glow-share-button:hover:not(:disabled) { background: var(--modloader-control-bg-hover); border-color: var(--modloader-control-border-hover); color: var(--modloader-control-text-hover); }
				#modloader-panel .cattail-resource-glow-share-button:disabled { cursor: default; opacity: .45; }
				#modloader-panel .cattail-resource-glow-share-status { min-width: 0; color: var(--modloader-text-subtle); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				#modloader-panel .cattail-resource-glow-share-status[data-tone="ok"] { color: var(--modloader-ok-text); }
				#modloader-panel .cattail-resource-glow-share-status[data-tone="error"] { color: var(--modloader-error-text); }
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
				if (id && !color) throw new Error(tShare('invalidColors'))
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
				if (!normalized) throw new Error(tShare('invalidColors'))
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
			const glowOverrides = getResourceGlowOverrides()

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
					this.fillStyle = createResourceGlow(game, resourceId, glowOverrides)
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

		function createResourceGlow(game, resourceId, glowOverrides) {
			const radius = (game?.screenUnit || 1) * .4
			const color = getResourceGlowColor(game, resourceId, glowOverrides)
			const stops = getResourceGlowStops(color)
			const glow = game.ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
			glow.addColorStop(.46, stops[0])
			glow.addColorStop(.74, stops[1])
			glow.addColorStop(1, stops[2])
			return glow
		}

		function getResourceGlowOverrides() {
			return mergeObjects(getResourceGlowDefaultColors(), previewColors === null ? readObject(api.config.get('resourceGlowColors', {})) : previewColors)
		}

		function getResourceGlowColor(game, resourceId, glowOverrides) {
			const overrides = readObject(glowOverrides)
			const override = overrides[resourceId] ?? overrides[String(resourceId)] ?? overrides['r' + resourceId]
			return normalizeHexColor(override) || getDefaultResourceColor(game, resourceId) || '#FFFFFF'
		}

		function getResourceGlowStops(color) {
			const normalized = normalizeHexColor(color) || '#FFFFFF'
			const cached = rgbaStopsCache.get(normalized)
			if (cached) return cached
			const stops = [hexToRgba(normalized, .95), hexToRgba(normalized, .42), hexToRgba(normalized, 0)]
			if (rgbaStopsCache.size > 128) rgbaStopsCache.clear()
			rgbaStopsCache.set(normalized, stops)
			return stops
		}

		function getDefaultResourceColor(game, resourceId) {
			const resource = game?.codex?.resources?.[resourceId]
			return normalizeHexColor(resource?.triplet?.[2]) || normalizeHexColor(resource?.triplet?.[1]) || normalizeHexColor(resource?.triplet?.[0])
		}

		function readObject(value) {
			return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
		}

		function getResourceGlowDefaultColors() {
			if (defaultGlowColors) return defaultGlowColors
			const schema = typeof api.config.schema === 'function' ? api.config.schema() : []
			const item = Array.isArray(schema) ? schema.find(function (entry) { return entry?.key === 'resourceGlowColors' }) : null
			defaultGlowColors = readObject(item?.default)
			return defaultGlowColors
		}

		function mergeObjects(base, override) {
			return Object.assign({}, readObject(base), readObject(override))
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
