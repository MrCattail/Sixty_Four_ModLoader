(function () {
	const MOD_ID = 'Cattail_TweaksX_Reality-Pack'
	const ENABLE_CONFIG_KEY = 'enableScanRealitySlider'
	const STORAGE_DIAMETER_KEY = 'cattailScanRealityDiameter'
	const ACTIVE_SCAN_KEY = '__cattailScanRealitySliderActiveScan'
	const SCAN_RADIUS_KEY = '__cattailScanRealitySliderRadius'
	const SCAN_REALITY_KEY = '__cattailScanRealitySliderReality'
	const HELD_PRICE_SIGNATURE_KEY = '__cattailScanRealitySliderHeldPriceSignature'
	const SHARED_DIAMETER_KEY = '__cattailScanRealitySliderDiameter'
	const SHARED_ENABLED_KEY = '__cattailScanRealitySliderEnabled'
	const STYLE_ID = 'cattail-scan-reality-slider-style'
	const SCANNER_WEBGL_OVERLAY_ID = 'cattail-scan-reality-slider-scanner-webgl'

	const VANILLA_DIAMETER = 32
	const VANILLA_RADIUS = 16
	const VANILLA_REALITY = 256
	const MIN_DIAMETER = 8
	const MAX_DIAMETER = 1024
	const DIAMETER_STEP = 8
	const DIAMETER_PER_REALITY_DOUBLE = 8
	const SCANNER_INITIAL_BUILD_BUDGET_MS = 2.5
	const SCANNER_FRAME_BUILD_BUDGET_MS = 4
	const SCANNER_BUILD_TIME_CHECK_INTERVAL = 128

	let previewDiameter = null
	let scannerWebgl = null
	let scannerWebglUnavailable = false
	let pendingShopRefresh = null
	let pendingShopRefreshTimer = null

	const UI_TEXT = {
		en: {
			diameter: 'Range diameter',
			diameterShort: 'Diameter',
			reality: 'Reality infusion',
			realityShort: 'Infusion',
			reset: 'Reset',
			title: 'Supercritical kernel tuning'
		},
		ru: {
			diameter: 'Диаметр области',
			diameterShort: 'Диаметр',
			reality: 'Вливание Reality',
			realityShort: 'Reality',
			reset: 'Сброс',
			title: 'Настройка сверхкритического ядра'
		},
		de: {
			diameter: 'Reichweitendurchmesser',
			diameterShort: 'Durchmesser',
			reality: 'Reality-Infusion',
			realityShort: 'Infusion',
			reset: 'Zurücksetzen',
			title: 'Abstimmung des superkritischen Kerns'
		},
		ptbr: {
			diameter: 'Diâmetro do alcance',
			diameterShort: 'Diâmetro',
			reality: 'Infusão de Reality',
			realityShort: 'Infusão',
			reset: 'Redefinir',
			title: 'Ajuste do núcleo supercrítico'
		},
		it: {
			diameter: 'Diametro raggio',
			diameterShort: 'Diametro',
			reality: 'Infusione Reality',
			realityShort: 'Infusione',
			reset: 'Ripristina',
			title: 'Regolazione nucleo supercritico'
		},
		es: {
			diameter: 'Diámetro de alcance',
			diameterShort: 'Diámetro',
			reality: 'Inyección de Reality',
			realityShort: 'Inyección',
			reset: 'Restablecer',
			title: 'Ajuste del núcleo supercrítico'
		},
		fr: {
			diameter: 'Diamètre de portée',
			diameterShort: 'Diamètre',
			reality: 'Injection de Reality',
			realityShort: 'Injection',
			reset: 'Réinitialiser',
			title: 'Réglage du noyau supercritique'
		},
		nl: {
			diameter: 'Bereikdiameter',
			diameterShort: 'Diameter',
			reality: 'Reality-injectie',
			realityShort: 'Injectie',
			reset: 'Reset',
			title: 'Afstelling superkritische kern'
		},
		cz: {
			diameter: 'Průměr dosahu',
			diameterShort: 'Průměr',
			reality: 'Vložení Reality',
			realityShort: 'Reality',
			reset: 'Reset',
			title: 'Ladění superkritického jádra'
		},
		pl: {
			diameter: 'Średnica zasięgu',
			diameterShort: 'Średnica',
			reality: 'Wlew Reality',
			realityShort: 'Reality',
			reset: 'Reset',
			title: 'Strojenie superkrytycznego jądra'
		},
		jp: {
			diameter: '範囲直径',
			diameterShort: '範囲直径',
			reality: 'Reality注入',
			realityShort: 'Reality',
			reset: 'リセット',
			title: '超臨界コア調整'
		},
		kr: {
			diameter: '범위 지름',
			diameterShort: '지름',
			reality: 'Reality 주입',
			realityShort: 'Reality',
			reset: '초기화',
			title: '초임계 핵 조정'
		},
		sch: {
			diameter: '\u8303\u56f4\u76f4\u5f84',
			diameterShort: '\u76f4\u5f84',
			reality: '\u73b0\u5b9e\u6ce8\u5165',
			realityShort: '\u6ce8\u5165',
			reset: '\u91cd\u7f6e',
			title: '\u8d85\u4e34\u754c\u5185\u6838\u8c03\u6574'
		},
		tch: {
			diameter: '\u7bc4\u570d\u76f4\u5f91',
			diameterShort: '\u76f4\u5f91',
			reality: '\u73fe\u5be6\u6ce8\u5165',
			realityShort: '\u6ce8\u5165',
			reset: '\u91cd\u7f6e',
			title: '\u8d85\u81e8\u754c\u6838\u5fc3\u8abf\u6574'
		},
		thai: {
			diameter: 'เส้นผ่านศูนย์กลางระยะ',
			diameterShort: 'ระยะ',
			reality: 'เติม Reality',
			realityShort: 'Reality',
			reset: 'รีเซ็ต',
			title: 'ปรับแกนเหนือวิกฤต'
		},
		hu: {
			diameter: 'Hatótáv átmérő',
			diameterShort: 'Átmérő',
			reality: 'Reality-betöltés',
			realityShort: 'Reality',
			reset: 'Visszaállítás',
			title: 'Szuperkritikus mag hangolása'
		},
		lv: {
			diameter: 'Diapazona diametrs',
			diameterShort: 'Diametrs',
			reality: 'Reality ieplūde',
			realityShort: 'Reality',
			reset: 'Atiestatīt',
			title: 'Superkritiskā kodola regulēšana'
		},
		ro: {
			diameter: 'Diametru rază',
			diameterShort: 'Diametru',
			reality: 'Infuzie Reality',
			realityShort: 'Infuzie',
			reset: 'Resetare',
			title: 'Reglaj nucleu supercritic'
		},
		no: {
			diameter: 'Rekkeviddediameter',
			diameterShort: 'Diameter',
			reality: 'Reality-infusjon',
			realityShort: 'Infusjon',
			reset: 'Tilbakestill',
			title: 'Justering av superkritisk kjerne'
		}
	}
	UI_TEXT.modsch = UI_TEXT.sch

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				if (typeof Game === 'undefined' || typeof Shop === 'undefined' || typeof Scan === 'undefined') return

				publishSharedScanTuning(api)
				installStyles()
				patchScanPrice(api)
				patchScanPlacement(api)
				patchScanUpdate(api)
				patchScanCreation(api)
				patchScannerWebglOverlay(api)
				patchShop(api)
			})
		}
	})

	function isFeatureEnabled(api) {
		return api.config.get(ENABLE_CONFIG_KEY, true) !== false
	}

	function patchScanPrice(api) {
		api.patch(Game.prototype, 'getRealPrice', function (original) {
			return function (name, sale) {
				const price = original.apply(this, arguments)
				if (!isFeatureEnabled(api) || sale || name !== 'scan') return price

				const tuned = Array.isArray(price) ? price.slice() : []
				while (tuned.length <= 9) tuned.push(0)
				tuned[9] = getCurrentTuning().reality
				return tuned
			}
		})
	}

	function patchScanPlacement(api) {
		api.patch(Scan.prototype, 'setPosition', function (original) {
			return function (...args) {
				if (isFeatureEnabled(api)) applyTuningToScan(this)
				return original.apply(this, args)
			}
		})
	}

	function patchScanUpdate(api) {
		api.patch(Scan.prototype, 'update', function (original) {
			return function (...args) {
				const game = this.master
				if (!isFeatureEnabled(api) || !game) return original.apply(this, args)

				game[ACTIVE_SCAN_KEY] = this
				try {
					return original.apply(this, args)
				} finally {
					if (game[ACTIVE_SCAN_KEY] === this) delete game[ACTIVE_SCAN_KEY]
				}
			}
		})
	}

	function patchScanCreation(api) {
		api.patch(Game.prototype, 'createScan', function (original) {
			return function (...args) {
				if (!isFeatureEnabled(api)) return original.apply(this, args)
				const scan = this[ACTIVE_SCAN_KEY]
				const radius = Number(scan?.[SCAN_RADIUS_KEY])
				if (!Number.isFinite(radius) || radius === VANILLA_RADIUS || typeof VFX === 'undefined') {
					return original.apply(this, args)
				}

				this.vfx.push(new CattailScaledScannerMap(this, { source: args[0], radius: radius }))
				return undefined
			}
		})
	}

	function patchScannerWebglOverlay(api) {
		api.patch(Game.prototype, 'renderloop', function (original) {
			return function (...args) {
				hideScannerWebgl()
				return original.apply(this, args)
			}
		})
	}

	function patchShop(api) {
		api.patch(Shop.prototype, 'addItem', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				attachScanControls(this, api)
				return result
			}
		})

		api.patch(Shop.prototype, 'updateElements', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				attachScanControls(this, api)
				syncScanControls(this, api)
				return result
			}
		})

		api.patch(Shop.prototype, 'check', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				attachScanControls(this, api)
				syncScanControls(this, api)
				return result
			}
		})

		api.patch(Shop.prototype, 'switchPlane', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				attachScanControls(this, api)
				syncScanControls(this, api)
				return result
			}
		})

		if (typeof Game !== 'undefined') {
			api.patch(Game.prototype, 'changeLanguage', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					if (this.shop) syncScanControls(this.shop, api)
					return result
				}
			})
		}
	}

	function attachScanControls(shop, api) {
		if (!shop?.vessel) return
		if (!isFeatureEnabled(api)) {
			removeScanControls(shop)
			return
		}

		const item = findScanItem(shop)
		if (item?.html) attachVanillaScanControl(shop, item, api)
		attachCategorizedScanControl(shop, api)
	}

	function attachVanillaScanControl(shop, item, api) {
		if (item.html.querySelector('.cattail-scan-reality-slider[data-context="shop"]')) return
		const control = createScanControl(shop, api, 'shop')
		const before = item.counter || item.existed || null
		item.html.insertBefore(control, before)
	}

	function attachCategorizedScanControl(shop, api) {
		const row = shop.vessel.querySelector('.cattail-shop-category-item[data-shop-item="scan"]')
		if (!row?.parentNode) return

		const next = row.nextElementSibling
		if (next?.classList?.contains('cattail-scan-category-control')) return

		const control = createScanControl(shop, api, 'category')
		row.parentNode.insertBefore(control, row.nextSibling)
	}

	function createScanControl(shop, api, context) {
		const root = document.createElement('div')
		root.className = 'cattail-scan-reality-slider cattail-scan-reality-slider-' + context
		root.dataset.context = context
		if (context === 'category') root.classList.add('cattail-scan-category-control')

		const diameter = document.createElement('div')
		diameter.className = 'cattail-scan-slider-value cattail-scan-slider-diameter'

		const range = document.createElement('input')
		range.className = 'cattail-scan-slider-input'
		range.type = 'range'
		range.min = String(MIN_DIAMETER)
		range.max = String(MAX_DIAMETER)
		range.step = String(DIAMETER_STEP)

		const reality = document.createElement('div')
		reality.className = 'cattail-scan-slider-value cattail-scan-slider-reality'

		const reset = document.createElement('button')
		reset.className = 'cattail-scan-slider-reset'
		reset.type = 'button'

		root.append(diameter, range, reality, reset)
		stopShopActivation(root)

		range.addEventListener('pointerdown', function (event) {
			root.dataset.dragging = 'true'
			if (typeof range.setPointerCapture === 'function' && event.pointerId !== undefined) {
				try {
					range.setPointerCapture(event.pointerId)
				} catch (error) {}
			}
		})
		for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
			range.addEventListener(eventName, function () {
				if (root.dataset.dragging === 'true') finishSliderDrag(shop, api)
				root.dataset.dragging = 'false'
			})
		}
		range.addEventListener('input', function () {
			setCurrentDiameter(range.value, shop, api, { light: true })
		})
		range.addEventListener('change', function () {
			finishSliderDrag(shop, api)
		})
		reset.addEventListener('click', function (event) {
			event.preventDefault()
			event.stopPropagation()
			setCurrentDiameter(VANILLA_DIAMETER, shop, api)
		})

		syncOneControl(root, shop?.master)
		return root
	}

	function stopShopActivation(root) {
		for (const eventName of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
			root.addEventListener(eventName, function (event) {
				event.stopPropagation()
			})
		}
	}

	function setCurrentDiameter(value, shop, api, options = {}) {
		const diameter = clampDiameter(value)
		if (options.light) {
			previewDiameter = diameter
			publishSharedDiameter(diameter, true)
			syncScanControls(shop, api)
			return
		}

		previewDiameter = null
		writeStoredDiameter(diameter)
		publishSharedScanTuning(api, diameter)
		syncScanControls(shop, api, { skipPrice: true })
		scheduleShopRefresh(shop)
	}

	function finishSliderDrag(shop, api) {
		if (previewDiameter === null) return

		const diameter = clampDiameter(previewDiameter)
		previewDiameter = null
		writeStoredDiameter(diameter)
		publishSharedScanTuning(api, diameter)
		syncScanControls(shop, api, { skipPrice: true })
		scheduleShopRefresh(shop)
	}

	function refreshShopPrices(shop) {
		if (!shop) return
		if (typeof shop.updateElements === 'function') shop.updateElements()
		if (typeof shop.check === 'function') shop.check()
		refreshHeldScanPrice(shop.master)
	}

	function scheduleShopRefresh(shop) {
		if (!shop) return
		pendingShopRefresh = shop
		if (pendingShopRefreshTimer) return
		const run = function () {
			const nextShop = pendingShopRefresh
			pendingShopRefresh = null
			pendingShopRefreshTimer = null
			refreshShopPrices(nextShop)
		}
		if (typeof requestAnimationFrame === 'function') {
			pendingShopRefreshTimer = requestAnimationFrame(function () {
				setTimeout(run, 0)
			})
		} else {
			pendingShopRefreshTimer = setTimeout(run, 0)
		}
	}

	function syncScanControls(shop, api, options = {}) {
		if (!shop?.vessel) return
		if (!isFeatureEnabled(api)) {
			publishSharedScanTuning(api, null, false)
			removeScanControls(shop)
			return
		}

		const isDraggingPreview = previewDiameter !== null
		if (!isDraggingPreview) publishSharedScanTuning(api)
		for (const control of shop.vessel.querySelectorAll('.cattail-scan-reality-slider')) {
			syncOneControl(control, shop.master)
		}
		if (!isDraggingPreview && options.skipPrice !== true) refreshHeldScanPrice(shop.master)
	}

	function syncOneControl(control, game) {
		const tuning = getCurrentTuning(previewDiameter)
		const text = getUiText(game)
		const range = control.querySelector('.cattail-scan-slider-input')
		const diameter = control.querySelector('.cattail-scan-slider-diameter')
		const reality = control.querySelector('.cattail-scan-slider-reality')
		const reset = control.querySelector('.cattail-scan-slider-reset')
		const visualDiameter = previewDiameter === null ? tuning.diameter : clampVisualDiameter(previewDiameter)
		const progress = ((visualDiameter - MIN_DIAMETER) / (MAX_DIAMETER - MIN_DIAMETER)) * 100
		const progressText = progress.toFixed(2) + '%'
		const labelShift = progress <= 4 ? '0' : progress >= 96 ? '-100%' : '-50%'
		const labelAlign = progress <= 4 ? 'left' : progress >= 96 ? 'right' : 'center'
		const labelMaxWidth = progress <= 4 ? (100 - progress).toFixed(2) + '%' : progress >= 96 ? progress.toFixed(2) + '%' : '92%'

		control.style.setProperty('--cattail-scan-slider-progress', progressText)
		control.style.setProperty('--cattail-scan-slider-label-shift', labelShift)
		control.style.setProperty('--cattail-scan-slider-label-align', labelAlign)
		control.style.setProperty('--cattail-scan-slider-label-max-width', labelMaxWidth)

		if (range) {
			range.value = String(visualDiameter)
			range.title = text.title
			range.setAttribute('aria-label', text.title)
			range.style.setProperty('--cattail-scan-slider-progress', progressText)
		}
		if (diameter) setSliderValueText(diameter, text.diameterShort || text.diameter, formatNumber(game, tuning.diameter), text.diameter)
		if (reality) setSliderValueText(reality, text.realityShort || text.reality, formatNumber(game, tuning.reality), text.reality)
		if (reset) {
			reset.textContent = text.reset
			reset.title = text.reset
			reset.setAttribute('aria-label', text.reset)
		}
	}

	function setSliderValueText(element, label, value, fullLabel) {
		let labelNode = element.querySelector('.cattail-scan-slider-value-label')
		let valueNode = element.querySelector('.cattail-scan-slider-value-number')
		if (!labelNode || !valueNode) {
			labelNode = document.createElement('span')
			labelNode.className = 'cattail-scan-slider-value-label'
			valueNode = document.createElement('span')
			valueNode.className = 'cattail-scan-slider-value-number'
			element.replaceChildren(labelNode, valueNode)
		}
		labelNode.textContent = label
		valueNode.textContent = value
		element.title = (fullLabel || label) + ' ' + value
		element.setAttribute('aria-label', (fullLabel || label) + ' ' + value)
	}

	function removeScanControls(shop) {
		shop?.vessel?.querySelectorAll('.cattail-scan-reality-slider').forEach(function (control) {
			control.remove()
		})
	}

	function refreshHeldScanPrice(game) {
		if (!game || game.itemInHand?.name !== 'scan' || typeof Cloud === 'undefined') {
			if (game) delete game[HELD_PRICE_SIGNATURE_KEY]
			return
		}
		const price = game.getRealPrice('scan')
		const signature = price.join(',')
		if (game[HELD_PRICE_SIGNATURE_KEY] === signature) return
		game[HELD_PRICE_SIGNATURE_KEY] = signature
		game.itemInHandPriceTag = new Cloud(game)
		game.itemInHandPriceTag.addResourceList(price)
	}

	function findScanItem(shop) {
		return Array.isArray(shop?.items) ? shop.items.find(function (item) { return item?.name === 'scan' }) : null
	}

	function applyTuningToScan(scan) {
		const tuning = getCurrentTuning()
		publishSharedDiameter(tuning.diameter, true)
		warmScannerWebgl(scan.master)
		scan[SCAN_RADIUS_KEY] = tuning.radius
		scan[SCAN_REALITY_KEY] = tuning.reality
	}

	function getCurrentTuning(diameterOverride = null) {
		const diameter = diameterOverride === null ? readStoredDiameter() : clampDiameter(diameterOverride)
		return {
			diameter,
			radius: diameter / 2,
			reality: getRealityForDiameter(diameter)
		}
	}

	function readStoredDiameter() {
		if (typeof localStorage === 'undefined') return VANILLA_DIAMETER
		return clampDiameter(localStorage.getItem(STORAGE_DIAMETER_KEY))
	}

	function writeStoredDiameter(diameter) {
		if (typeof localStorage === 'undefined') return
		localStorage.setItem(STORAGE_DIAMETER_KEY, String(clampDiameter(diameter)))
	}

	function publishSharedScanTuning(api, diameterOverride = null, enabledOverride = null) {
		const enabled = enabledOverride === null ? isFeatureEnabled(api) : enabledOverride === true
		const diameter = diameterOverride === null ? readStoredDiameter() : clampVisualDiameter(diameterOverride)
		publishSharedDiameter(diameter, enabled)
	}

	function publishSharedDiameter(diameter, enabled) {
		if (typeof window === 'undefined') return
		window[SHARED_ENABLED_KEY] = enabled === true
		if (enabled === true) window[SHARED_DIAMETER_KEY] = clampVisualDiameter(diameter)
		else delete window[SHARED_DIAMETER_KEY]
	}

	function clampDiameter(value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return VANILLA_DIAMETER
		const stepped = Math.round(number / DIAMETER_STEP) * DIAMETER_STEP
		return Math.max(MIN_DIAMETER, Math.min(MAX_DIAMETER, stepped))
	}

	function clampVisualDiameter(value) {
		const number = Number(value)
		if (!Number.isFinite(number)) return VANILLA_DIAMETER
		return Math.max(MIN_DIAMETER, Math.min(MAX_DIAMETER, number))
	}

	function getRealityForDiameter(diameter) {
		const exponent = (diameter - VANILLA_DIAMETER) / DIAMETER_PER_REALITY_DOUBLE
		return Math.max(1, Math.ceil(VANILLA_REALITY * Math.pow(2, exponent)))
	}

	function getUiText(game) {
		const language = game?.language || 'en'
		return UI_TEXT[language] || UI_TEXT.en
	}

	function formatNumber(game, value) {
		return typeof game?.makeReadable === 'function' ? game.makeReadable(value) : String(value)
	}

	class CattailScaledScannerMap extends VFX {
		constructor(master, payload) {
			super(master, payload)
			this.radius = Math.max(1, Math.round(Number(payload?.radius) || VANILLA_RADIUS))
			this.radius2 = this.radius ** 2
			this.cells = []
			this.webglVertexData = new Float32Array(0)
			this.webglVertexFloats = 0
			this.webglUploadedFloats = 0
			this.webglBuffer = null
			this.webglBufferCapacityFloats = 0
			this.webglMetricsCache = Object.create(null)
			this.source = payload.source
			this.buildRing = 0
			this.buildPhase = 0
			this.buildOffset = 0
			this.buildDone = false

			this.maxEndTime = 20000
			this.time = 0
			processScannerBuildBudget(this, SCANNER_INITIAL_BUILD_BUDGET_MS)
		}

		update(dt) {
			super.update(dt)
			if (!this.terminate) processScannerBuildBudget(this, SCANNER_FRAME_BUILD_BUDGET_MS)
			if (this.terminate) hideScannerWebgl()
		}

		render() {
			if (renderScannerMapWebgl(this)) return
			const ctx = this.master.ctx
			const f = this.time / (this.maxEndTime * .12)
			const opacity = 1 - this.time / this.maxEndTime

			ctx.save()
			ctx.globalAlpha = opacity
			for (let i = 0; i < this.cells.length; i++) {
				const xy = this.master.uvToXYUntranslated(this.cells[i].p)
				let rmult = this.cells[i].f2 < f ? 1 : 0
				const edge = Math.abs(f - this.cells[i].f2)
				if (edge < .2) rmult += (.2 - edge) * 5
				const noise = Math.random() * .02

				for (let j = 0; j < this.cells[i].values.length; j++) {
					const m = this.cells[i].values[j]
					if (m.rid === 0) continue

					this.master.resourcesSprites[m.rid].scale = .6 * m.v * rmult + noise
					this.master.resourcesSprites[m.rid].renderXY(xy)
					this.master.resourcesSprites[m.rid].scale = .25
				}
			}
			ctx.restore()
		}
	}

	function processScannerBuildBudget(scanner, budgetMs) {
		if (!scanner || scanner.buildDone) return
		const start = now()
		let iterations = 0
		while (!scanner.buildDone) {
			const relative = getNextScannerBuildCell(scanner)
			if (!relative) break
			addScannerMapCell(scanner, relative[0], relative[1])
			iterations++
			if (iterations % SCANNER_BUILD_TIME_CHECK_INTERVAL === 0 && now() - start >= budgetMs) break
		}
	}

	function getNextScannerBuildCell(scanner) {
		while (!scanner.buildDone) {
			const ring = scanner.buildRing
			if (ring > scanner.radius) {
				scanner.buildDone = true
				return null
			}
			if (ring === 0) {
				scanner.buildRing = 1
				scanner.buildPhase = 0
				scanner.buildOffset = 0
				return [0, 0]
			}

			const phaseLength = getScannerRingPhaseLength(ring, scanner.buildPhase)
			if (phaseLength <= 0 || scanner.buildOffset >= phaseLength) {
				scanner.buildPhase++
				scanner.buildOffset = 0
				if (scanner.buildPhase > 3) {
					scanner.buildRing++
					scanner.buildPhase = 0
				}
				continue
			}

			const cell = getScannerRingPhaseCell(ring, scanner.buildPhase, scanner.buildOffset)
			scanner.buildOffset++
			if (cell[0] < -scanner.radius || cell[0] >= scanner.radius || cell[1] < -scanner.radius || cell[1] >= scanner.radius) continue
			return cell
		}
		return null
	}

	function getScannerRingPhaseLength(ring, phase) {
		if (phase === 0 || phase === 1) return ring * 2 + 1
		return Math.max(0, ring * 2 - 1)
	}

	function getScannerRingPhaseCell(ring, phase, offset) {
		if (phase === 0) return [-ring + offset, -ring]
		if (phase === 1) return [-ring + offset, ring]
		if (phase === 2) return [-ring, -ring + 1 + offset]
		return [ring, -ring + 1 + offset]
	}

	function addScannerMapCell(scanner, dx, dy) {
		const d2 = dx ** 2 + dy ** 2
		if (d2 > scanner.radius2) return
		const p = [dx + scanner.source[0], dy + scanner.source[1]]
		const e = scanner.master.entityAtCoordinates(p)
		if (e) e.ondarkhover()
		const map = scanner.master.getResourceNodeValues(p[0], p[1])
		if (!hasDrawableResourceNodeValue(map)) return
		const cell = {
			p,
			values: map,
			f2: d2 / scanner.radius2
		}
		scanner.cells.push(cell)
		appendScannerWebglEntries(scanner, cell)
	}

	function hasDrawableResourceNodeValue(map) {
		if (!Array.isArray(map)) return false
		for (let i = 0; i < map.length; i++) {
			if (map[i]?.rid !== 0) return true
		}
		return false
	}

	function appendScannerWebglEntries(scanner, cell) {
		for (let i = 0; i < cell.values.length; i++) {
			const value = cell.values[i]
			if (!value || value.rid === 0) continue
			appendScannerWebglEntry(scanner, {
				uv: [cell.p[0] - scanner.source[0], cell.p[1] - scanner.source[1]],
				resourceId: value.rid,
				f2: cell.f2,
				value: Number(value.v) || 0,
				noise: deterministicNoise(cell.p[0], cell.p[1], value.rid) * .02
			})
		}
	}

	function renderScannerMapWebgl(scanner) {
		if (!scanner?.webglVertexFloats) {
			hideScannerWebgl()
			return false
		}
		const renderer = getScannerWebgl(scanner.master)
		if (!renderer) {
			hideScannerWebgl()
			return false
		}
		const bufferEntry = getScannerWebglBuffer(renderer, scanner)
		if (!bufferEntry?.vertexCount) {
			hideScannerWebgl()
			return false
		}

		const gl = renderer.gl
		syncScannerWebglCanvas(scanner.master, renderer.canvas)
		gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.COLOR_BUFFER_BIT)
		gl.useProgram(renderer.program)
		gl.bindBuffer(gl.ARRAY_BUFFER, bufferEntry.buffer)
		gl.enableVertexAttribArray(renderer.aUv)
		gl.vertexAttribPointer(renderer.aUv, 2, gl.FLOAT, false, renderer.stride, 0)
		gl.enableVertexAttribArray(renderer.aLocal)
		gl.vertexAttribPointer(renderer.aLocal, 2, gl.FLOAT, false, renderer.stride, 8)
		gl.enableVertexAttribArray(renderer.aTexcoord)
		gl.vertexAttribPointer(renderer.aTexcoord, 2, gl.FLOAT, false, renderer.stride, 16)
		gl.enableVertexAttribArray(renderer.aMeta)
		gl.vertexAttribPointer(renderer.aMeta, 4, gl.FLOAT, false, renderer.stride, 24)
		const texture = getScannerWebglTexture(renderer, scanner.master)
		if (!texture) {
			hideScannerWebgl()
			return false
		}
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.uniform1i(renderer.uImage, 0)
		const sourceXY = scanner.master.uvToXYUntranslated(scanner.source)
		gl.uniform2f(renderer.uResolution, renderer.canvas.width, renderer.canvas.height)
		gl.uniform2f(renderer.uSourceScreen, sourceXY[0], sourceXY[1])
		gl.uniform1f(renderer.uUnit, scanner.master.unit)
		gl.uniform1f(renderer.uReveal, scanner.time / (scanner.maxEndTime * .12))
		gl.uniform1f(renderer.uOpacity, Math.max(0, 1 - scanner.time / scanner.maxEndTime))
		gl.drawArrays(gl.TRIANGLES, 0, bufferEntry.vertexCount)
		return true
	}

	function getScannerWebgl(master) {
		if (scannerWebglUnavailable) return null
		if (scannerWebgl && !scannerWebgl.lost) return scannerWebgl
		const canvas = getOrCreateScannerWebglCanvas(master)
		if (!canvas) return null
		const gl = canvas.getContext('webgl2', getScannerWebglOptions()) || canvas.getContext('webgl', getScannerWebglOptions())
		if (!gl) {
			scannerWebglUnavailable = true
			return null
		}
		const program = createScannerWebglProgram(gl)
		if (!program) {
			scannerWebglUnavailable = true
			return null
		}
		scannerWebgl = {
			canvas,
			gl,
			program,
			stride: 10 * 4,
			buffers: Object.create(null),
			textures: Object.create(null),
			lost: false,
			aUv: gl.getAttribLocation(program, 'a_uv'),
			aLocal: gl.getAttribLocation(program, 'a_local'),
			aTexcoord: gl.getAttribLocation(program, 'a_texcoord'),
			aMeta: gl.getAttribLocation(program, 'a_meta'),
			uResolution: gl.getUniformLocation(program, 'u_resolution'),
			uSourceScreen: gl.getUniformLocation(program, 'u_sourceScreen'),
			uUnit: gl.getUniformLocation(program, 'u_unit'),
			uReveal: gl.getUniformLocation(program, 'u_reveal'),
			uOpacity: gl.getUniformLocation(program, 'u_opacity'),
			uImage: gl.getUniformLocation(program, 'u_image')
		}
		canvas.addEventListener('webglcontextlost', function (event) {
			try { event.preventDefault() } catch (error) {}
			if (scannerWebgl) scannerWebgl.lost = true
		})
		canvas.addEventListener('webglcontextrestored', function () {
			scannerWebgl = null
			scannerWebglUnavailable = false
		})
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
		gl.disable(gl.DEPTH_TEST)
		gl.disable(gl.CULL_FACE)
		return scannerWebgl
	}

	function warmScannerWebgl(master) {
		if (!master || scannerWebglUnavailable) return
		const renderer = getScannerWebgl(master)
		if (!renderer) return
		getScannerWebglTexture(renderer, master)
	}

	function getScannerWebglOptions() {
		return {
			alpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false
		}
	}

	function getOrCreateScannerWebglCanvas(master) {
		if (typeof document === 'undefined') return null
		let canvas = document.getElementById(SCANNER_WEBGL_OVERLAY_ID)
		if (!canvas) {
			canvas = document.createElement('canvas')
			canvas.id = SCANNER_WEBGL_OVERLAY_ID
			canvas.style.position = 'fixed'
			canvas.style.left = '0'
			canvas.style.top = '0'
			canvas.style.width = '100%'
			canvas.style.height = '100%'
			canvas.style.margin = '0'
			canvas.style.padding = '0'
			canvas.style.border = '0'
			canvas.style.pointerEvents = 'none'
			canvas.style.userSelect = 'none'
			canvas.style.display = 'none'
			canvas.style.zIndex = '1'
			const parent = master?.canvas?.parentNode || document.body
			parent.appendChild(canvas)
		}
		return canvas
	}

	function createScannerWebglProgram(gl) {
		const vertexShader = compileScannerWebglShader(gl, gl.VERTEX_SHADER, [
			'precision highp float;',
			'attribute vec2 a_uv;',
			'attribute vec2 a_local;',
			'attribute vec2 a_texcoord;',
			'attribute vec4 a_meta;',
			'uniform vec2 u_resolution;',
			'uniform vec2 u_sourceScreen;',
			'uniform float u_unit;',
			'uniform float u_reveal;',
			'uniform float u_opacity;',
			'varying vec2 v_texcoord;',
			'varying float v_alpha;',
			'void main() {',
			'	float f2 = a_meta.x;',
			'	float value = a_meta.y;',
			'	float noise = a_meta.z;',
			'	float maskWidth = a_meta.w;',
			'	float rmult = f2 < u_reveal ? 1.0 : 0.0;',
			'	float edge = abs(u_reveal - f2);',
			'	if (edge < 0.2) rmult += (0.2 - edge) * 5.0;',
			'	float scale = u_unit * 1.737 / maskWidth * (0.6 * value * rmult + noise);',
			'	vec2 projected = u_sourceScreen + vec2((a_uv.x * 0.866 - a_uv.y * 0.866) * u_unit, (a_uv.x * 0.5 + a_uv.y * 0.5) * u_unit);',
			'	vec2 screen = projected + a_local * scale;',
			'	vec2 clip = screen / u_resolution * 2.0 - 1.0;',
			'	gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);',
			'	v_texcoord = a_texcoord;',
			'	v_alpha = u_opacity;',
			'}'
		].join('\n'))
		const fragmentShader = compileScannerWebglShader(gl, gl.FRAGMENT_SHADER, [
			'precision mediump float;',
			'varying vec2 v_texcoord;',
			'varying float v_alpha;',
			'uniform sampler2D u_image;',
			'void main() {',
			'	vec4 color = texture2D(u_image, v_texcoord);',
			'	gl_FragColor = vec4(color.rgb, color.a * v_alpha);',
			'}'
		].join('\n'))
		if (!vertexShader || !fragmentShader) return null
		const program = gl.createProgram()
		gl.attachShader(program, vertexShader)
		gl.attachShader(program, fragmentShader)
		gl.linkProgram(program)
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
		return program
	}

	function compileScannerWebglShader(gl, type, source) {
		const shader = gl.createShader(type)
		gl.shaderSource(shader, source)
		gl.compileShader(shader)
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null
		return shader
	}

	function getScannerWebglBuffer(renderer, scanner) {
		if (!scanner.webglVertexFloats) return null
		const gl = renderer.gl
		if (!scanner.webglBuffer) {
			scanner.webglBuffer = gl.createBuffer()
			scanner.webglBufferCapacityFloats = 0
			scanner.webglUploadedFloats = 0
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, scanner.webglBuffer)
		if (scanner.webglVertexData.length > scanner.webglBufferCapacityFloats) {
			gl.bufferData(gl.ARRAY_BUFFER, scanner.webglVertexData, gl.DYNAMIC_DRAW)
			scanner.webglBufferCapacityFloats = scanner.webglVertexData.length
			scanner.webglUploadedFloats = scanner.webglVertexFloats
		} else if (scanner.webglUploadedFloats < scanner.webglVertexFloats) {
			gl.bufferSubData(gl.ARRAY_BUFFER, scanner.webglUploadedFloats * 4, scanner.webglVertexData.subarray(scanner.webglUploadedFloats, scanner.webglVertexFloats))
			scanner.webglUploadedFloats = scanner.webglVertexFloats
		}
		return { buffer: scanner.webglBuffer, vertexCount: scanner.webglVertexFloats / 10 }
	}

	function appendScannerWebglEntry(scanner, entry) {
		const corners = [
			[0, 0], [1, 0], [1, 1],
			[0, 0], [1, 1], [0, 1]
		]
		const floatsPerEntry = corners.length * 10
		ensureScannerVertexCapacity(scanner, scanner.webglVertexFloats + floatsPerEntry)
		const metrics = scanner.webglMetricsCache[entry.resourceId] || (scanner.webglMetricsCache[entry.resourceId] = getScannerSpriteMetrics(entry.resourceId))
		for (let j = 0; j < corners.length; j++) {
			const corner = corners[j]
			scanner.webglVertexData[scanner.webglVertexFloats++] = entry.uv[0]
			scanner.webglVertexData[scanner.webglVertexFloats++] = entry.uv[1]
			scanner.webglVertexData[scanner.webglVertexFloats++] = corner[0] * metrics.mask[2] - metrics.origin[0]
			scanner.webglVertexData[scanner.webglVertexFloats++] = corner[1] * metrics.mask[3] - metrics.origin[1]
			scanner.webglVertexData[scanner.webglVertexFloats++] = metrics.u0 + (metrics.u1 - metrics.u0) * corner[0]
			scanner.webglVertexData[scanner.webglVertexFloats++] = metrics.v0 + (metrics.v1 - metrics.v0) * corner[1]
			scanner.webglVertexData[scanner.webglVertexFloats++] = entry.f2
			scanner.webglVertexData[scanner.webglVertexFloats++] = entry.value
			scanner.webglVertexData[scanner.webglVertexFloats++] = entry.noise
			scanner.webglVertexData[scanner.webglVertexFloats++] = metrics.mask[2]
		}
	}

	function ensureScannerVertexCapacity(scanner, neededFloats) {
		if (scanner.webglVertexData.length >= neededFloats) return
		const nextCapacity = Math.max(neededFloats, Math.max(1024, scanner.webglVertexData.length * 2))
		const next = new Float32Array(nextCapacity)
		next.set(scanner.webglVertexData.subarray(0, scanner.webglVertexFloats))
		scanner.webglVertexData = next
		scanner.webglBufferCapacityFloats = 0
	}

	function getScannerWebglTexture(renderer, master) {
		const sprite = master?.resourcesSprites?.[1] || master?.resourcesSprites?.[0]
		const image = sprite?.img
		if (!image) return null
		const key = image.src || 'resources'
		const existing = renderer.textures[key]
		if (existing) return existing
		const gl = renderer.gl
		const texture = gl.createTexture()
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]))
		renderer.textures[key] = texture
		if (isImageReady(image)) uploadScannerWebglTexture(gl, texture, image)
		else {
			image.addEventListener('load', function () {
				uploadScannerWebglTexture(gl, texture, image)
			}, { once: true })
		}
		return texture
	}

	function uploadScannerWebglTexture(gl, texture, image) {
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	}

	function isImageReady(image) {
		return image.complete && (image.naturalWidth || image.width) && (image.naturalHeight || image.height)
	}

	function getScannerSpriteMetrics(resourceId) {
		const fallbackWidth = 1080
		const fallbackHeight = 120
		const sprite = window.game?.resourcesSprites?.[resourceId]
		const frameId = sprite?.sequences?.[sprite.currentSequence || 0]?.[sprite.currentFrame || 0] || 0
		const mask = sprite?.frames?.[frameId] || [resourceId * 108, 0, 104, 120]
		const origin = sprite?.origins?.[frameId] || [52, 60]
		const image = sprite?.img
		const imageWidth = Number(image?.naturalWidth || image?.width || fallbackWidth) || fallbackWidth
		const imageHeight = Number(image?.naturalHeight || image?.height || fallbackHeight) || fallbackHeight
		return {
			mask,
			origin,
			u0: mask[0] / imageWidth,
			v0: mask[1] / imageHeight,
			u1: (mask[0] + mask[2]) / imageWidth,
			v1: (mask[1] + mask[3]) / imageHeight
		}
	}

	function syncScannerWebglCanvas(master, canvas) {
		if (!canvas || !master) return
		canvas.width = master.w
		canvas.height = master.h
		const rect = master.canvas && typeof master.canvas.getBoundingClientRect === 'function' ? master.canvas.getBoundingClientRect() : null
		if (rect && rect.width && rect.height) {
			canvas.style.left = rect.left + 'px'
			canvas.style.top = rect.top + 'px'
			canvas.style.width = rect.width + 'px'
			canvas.style.height = rect.height + 'px'
		}
		canvas.style.display = ''
	}

	function hideScannerWebgl() {
		const canvas = scannerWebgl?.canvas || (typeof document !== 'undefined' ? document.getElementById(SCANNER_WEBGL_OVERLAY_ID) : null)
		if (!canvas) return
		canvas.style.display = 'none'
	}

	function deterministicNoise(u, v, resourceId) {
		const value = Math.sin((u * 127.1 + v * 311.7 + resourceId * 74.7) * 12.9898) * 43758.5453
		return value - Math.floor(value)
	}

	function now() {
		return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
	}

	function installStyles() {
		if (document.getElementById(STYLE_ID)) return
		const style = document.createElement('style')
		style.id = STYLE_ID
		style.textContent = `
.cattail-scan-reality-slider {
	box-sizing: border-box;
	position: relative;
	width: 90%;
	margin: calc(var(--unit) * .3) auto calc(var(--unit) * .26);
	padding: calc(var(--unit) * 1.3) 0 calc(var(--unit) * .24);
	color: #111;
	font: inherit;
	user-select: none;
	-webkit-user-select: none;
}
.cattail-scan-reality-slider-category {
	margin-top: calc(var(--unit) * .18);
	margin-bottom: calc(var(--unit) * .3);
	padding-top: calc(var(--unit) * 1.3);
}
.cattail-scan-slider-value {
	position: absolute;
	left: var(--cattail-scan-slider-progress, 10%);
	display: flex;
	align-items: baseline;
	justify-content: center;
	gap: calc(var(--unit) * .16);
	max-width: var(--cattail-scan-slider-label-max-width, 92%);
	min-height: calc(var(--unit) * .18);
	color: #b6aeae;
	font: inherit;
	font-size: calc(var(--unit) * .54);
	font-weight: 400;
	line-height: 1.05;
	text-align: var(--cattail-scan-slider-label-align, center);
	letter-spacing: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: clip;
	pointer-events: none;
	transform: translateX(var(--cattail-scan-slider-label-shift, -50%));
}
.cattail-scan-slider-value-label {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: clip;
	white-space: nowrap;
}
.cattail-scan-slider-value-number {
	flex: 0 0 auto;
	white-space: nowrap;
}
.cattail-scan-slider-diameter {
	top: calc(var(--unit) * .08);
}
.cattail-scan-slider-reality {
	top: calc(var(--unit) * 1.92);
}
.cattail-scan-slider-input {
	appearance: none;
	-webkit-appearance: none;
	display: block;
	width: 100%;
	height: calc(var(--unit) * .22);
	min-height: 4px;
	margin: 0 auto calc(var(--unit) * 1.56);
	border: 0;
	border-radius: 999px;
	background:
		linear-gradient(to right, #343434 0 var(--cattail-scan-slider-progress, 10%), #5f5f5f var(--cattail-scan-slider-progress, 10%) 100%);
	box-shadow:
		inset 0 calc(var(--unit) * .1) calc(var(--unit) * .2) rgba(0,0,0,.64),
		inset 0 calc(var(--unit) * -.045) calc(var(--unit) * .09) rgba(255,255,255,.3);
	cursor: pointer;
}
.cattail-scan-slider-input:focus {
	outline: none;
}
.cattail-scan-slider-input:focus-visible {
	box-shadow:
		0 0 0 calc(var(--unit) * .08) rgba(119,179,121,.28),
		inset 0 calc(var(--unit) * .1) calc(var(--unit) * .2) rgba(0,0,0,.64),
		inset 0 calc(var(--unit) * -.045) calc(var(--unit) * .09) rgba(255,255,255,.3);
}
.cattail-scan-slider-input::-webkit-slider-thumb {
	appearance: none;
	-webkit-appearance: none;
	width: calc(var(--unit) * .68);
	height: calc(var(--unit) * .68);
	border: 0;
	border-radius: 50%;
	background: #f9f9f4;
	box-shadow:
		0 calc(var(--unit) * .18) calc(var(--unit) * .3) rgba(0,0,0,.38),
		0 calc(var(--unit) * .04) calc(var(--unit) * .07) rgba(0,0,0,.54),
		inset 0 calc(var(--unit) * .085) calc(var(--unit) * .065) rgba(255,255,255,.97),
		inset 0 calc(var(--unit) * -.095) calc(var(--unit) * .12) rgba(0,0,0,.2);
}
.cattail-scan-slider-reset {
	appearance: none;
	-webkit-appearance: none;
	display: block;
	min-width: calc(var(--unit) * 1.24);
	min-height: calc(var(--unit) * .42);
	margin: calc(var(--unit) * .24) auto 0;
	padding: 0 calc(var(--unit) * .3);
	border: 0;
	border-radius: 999px;
	background: #f3f3ed;
	color: #b6aeae;
	box-shadow:
		0 calc(var(--unit) * .12) calc(var(--unit) * .22) rgba(0,0,0,.18),
		0 calc(var(--unit) * .025) calc(var(--unit) * .04) rgba(0,0,0,.18),
		inset 0 calc(var(--unit) * .045) calc(var(--unit) * .045) rgba(255,255,255,.9),
		inset 0 calc(var(--unit) * -.055) calc(var(--unit) * .075) rgba(0,0,0,.16);
	font: inherit;
	font-size: calc(var(--unit) * .58);
	font-weight: 600;
	line-height: 1.2;
	letter-spacing: 0;
	text-align: center;
	cursor: pointer;
	transition: transform .12s ease, box-shadow .12s ease, color .12s ease;
}
.cattail-scan-slider-reset:hover {
	color: #b6aeae;
	box-shadow:
		0 calc(var(--unit) * .15) calc(var(--unit) * .24) rgba(0,0,0,.2),
		0 calc(var(--unit) * .025) calc(var(--unit) * .04) rgba(0,0,0,.2),
		inset 0 calc(var(--unit) * .045) calc(var(--unit) * .045) rgba(255,255,255,.92),
		inset 0 calc(var(--unit) * -.055) calc(var(--unit) * .075) rgba(0,0,0,.15);
}
.cattail-scan-slider-reset:active {
	transform: translateY(calc(var(--unit) * .025));
	box-shadow:
		0 calc(var(--unit) * .06) calc(var(--unit) * .14) rgba(0,0,0,.18),
		inset 0 calc(var(--unit) * .035) calc(var(--unit) * .055) rgba(0,0,0,.18),
		inset 0 calc(var(--unit) * -.035) calc(var(--unit) * .05) rgba(255,255,255,.75);
}
.shop .shopItem.disabled .cattail-scan-reality-slider,
.shop .shopItem.disabled .cattail-scan-slider-input,
.shop .shopItem.disabled .cattail-scan-slider-reset {
	pointer-events: auto;
}
.shop .shopItem.disabled .cattail-scan-slider-value {
	pointer-events: none;
}
.shop.darkShop .cattail-scan-reality-slider {
	color: #fff;
}
.shop.darkShop .cattail-scan-slider-value {
	color: #5c5c5c;
}
.shop.darkShop .cattail-scan-slider-input {
	background:
		linear-gradient(to right, #d9d9d6 0 var(--cattail-scan-slider-progress, 10%), #4d4d4d var(--cattail-scan-slider-progress, 10%) 100%);
	box-shadow:
		inset 0 calc(var(--unit) * .1) calc(var(--unit) * .22) rgba(0,0,0,.78),
		inset 0 calc(var(--unit) * -.045) calc(var(--unit) * .09) rgba(255,255,255,.2);
}
.shop.darkShop .cattail-scan-slider-input::-webkit-slider-thumb {
	background: #fbfbf6;
	box-shadow:
		0 calc(var(--unit) * .18) calc(var(--unit) * .3) rgba(0,0,0,.56),
		0 calc(var(--unit) * .04) calc(var(--unit) * .07) rgba(0,0,0,.58),
		inset 0 calc(var(--unit) * .085) calc(var(--unit) * .065) rgba(255,255,255,.97),
		inset 0 calc(var(--unit) * -.095) calc(var(--unit) * .12) rgba(0,0,0,.22);
}
.shop.darkShop .cattail-scan-slider-reset {
	background: #111114;
	color: #5c5c5c;
	box-shadow:
		0 calc(var(--unit) * .12) calc(var(--unit) * .22) rgba(0,0,0,.36),
		0 calc(var(--unit) * .025) calc(var(--unit) * .04) rgba(0,0,0,.42),
		inset 0 calc(var(--unit) * .045) calc(var(--unit) * .045) rgba(255,255,255,.11),
		inset 0 calc(var(--unit) * -.055) calc(var(--unit) * .075) rgba(0,0,0,.58);
}
.shop.darkShop .cattail-scan-slider-reset:hover {
	color: #5c5c5c;
}
`
		document.head.append(style)
	}
})()
