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

	const VANILLA_DIAMETER = 32
	const VANILLA_RADIUS = 16
	const VANILLA_REALITY = 256
	const MIN_DIAMETER = 8
	const MAX_DIAMETER = 256
	const DIAMETER_STEP = 8
	const DIAMETER_PER_REALITY_DOUBLE = 8

	let previewDiameter = null

	const UI_TEXT = {
		en: {
			diameter: 'Range diameter',
			reality: 'Reality infusion',
			reset: 'Reset',
			title: 'Supercritical kernel tuning'
		},
		ru: {
			diameter: 'Диаметр области',
			reality: 'Вливание Reality',
			reset: 'Сброс',
			title: 'Настройка сверхкритического ядра'
		},
		de: {
			diameter: 'Reichweitendurchmesser',
			reality: 'Reality-Infusion',
			reset: 'Zurücksetzen',
			title: 'Abstimmung des superkritischen Kerns'
		},
		ptbr: {
			diameter: 'Diâmetro do alcance',
			reality: 'Infusão de Reality',
			reset: 'Redefinir',
			title: 'Ajuste do núcleo supercrítico'
		},
		it: {
			diameter: 'Diametro raggio',
			reality: 'Infusione Reality',
			reset: 'Ripristina',
			title: 'Regolazione nucleo supercritico'
		},
		es: {
			diameter: 'Diámetro de alcance',
			reality: 'Inyección de Reality',
			reset: 'Restablecer',
			title: 'Ajuste del núcleo supercrítico'
		},
		fr: {
			diameter: 'Diamètre de portée',
			reality: 'Injection de Reality',
			reset: 'Réinitialiser',
			title: 'Réglage du noyau supercritique'
		},
		nl: {
			diameter: 'Bereikdiameter',
			reality: 'Reality-injectie',
			reset: 'Reset',
			title: 'Afstelling superkritische kern'
		},
		cz: {
			diameter: 'Průměr dosahu',
			reality: 'Vložení Reality',
			reset: 'Reset',
			title: 'Ladění superkritického jádra'
		},
		pl: {
			diameter: 'Średnica zasięgu',
			reality: 'Wlew Reality',
			reset: 'Reset',
			title: 'Strojenie superkrytycznego jądra'
		},
		jp: {
			diameter: '範囲直径',
			reality: 'Reality注入',
			reset: 'リセット',
			title: '超臨界コア調整'
		},
		kr: {
			diameter: '범위 지름',
			reality: 'Reality 주입',
			reset: '초기화',
			title: '초임계 핵 조정'
		},
		sch: {
			diameter: '\u8303\u56f4\u76f4\u5f84',
			reality: '\u73b0\u5b9e\u6ce8\u5165',
			reset: '\u91cd\u7f6e',
			title: '\u8d85\u4e34\u754c\u5185\u6838\u8c03\u6574'
		},
		tch: {
			diameter: '\u7bc4\u570d\u76f4\u5f91',
			reality: '\u73fe\u5be6\u6ce8\u5165',
			reset: '\u91cd\u7f6e',
			title: '\u8d85\u81e8\u754c\u6838\u5fc3\u8abf\u6574'
		},
		thai: {
			diameter: 'เส้นผ่านศูนย์กลางระยะ',
			reality: 'เติม Reality',
			reset: 'รีเซ็ต',
			title: 'ปรับแกนเหนือวิกฤต'
		},
		hu: {
			diameter: 'Hatótáv átmérő',
			reality: 'Reality-betöltés',
			reset: 'Visszaállítás',
			title: 'Szuperkritikus mag hangolása'
		},
		lv: {
			diameter: 'Diapazona diametrs',
			reality: 'Reality ieplūde',
			reset: 'Atiestatīt',
			title: 'Superkritiskā kodola regulēšana'
		},
		ro: {
			diameter: 'Diametru rază',
			reality: 'Infuzie Reality',
			reset: 'Resetare',
			title: 'Reglaj nucleu supercritic'
		},
		no: {
			diameter: 'Rekkeviddediameter',
			reality: 'Reality-infusjon',
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
		range.step = '1'

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
		const diameter = options.light ? clampVisualDiameter(value) : clampDiameter(value)
		if (options.light) {
			previewDiameter = diameter
			syncScanControls(shop, api)
			return
		}

		previewDiameter = null
		writeStoredDiameter(diameter)
		publishSharedScanTuning(api, diameter)
		syncScanControls(shop, api)
		refreshShopPrices(shop)
	}

	function finishSliderDrag(shop, api) {
		if (previewDiameter === null) return

		const diameter = clampDiameter(previewDiameter)
		previewDiameter = null
		writeStoredDiameter(diameter)
		publishSharedScanTuning(api, diameter)
		syncScanControls(shop, api)
		refreshShopPrices(shop)
	}

	function refreshShopPrices(shop) {
		if (!shop) return
		if (typeof shop.updateElements === 'function') shop.updateElements()
		if (typeof shop.check === 'function') shop.check()
		refreshHeldScanPrice(shop.master)
	}


	function syncScanControls(shop, api) {
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
		if (!isDraggingPreview) refreshHeldScanPrice(shop.master)
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

		control.style.setProperty('--cattail-scan-slider-progress', progressText)
		control.style.setProperty('--cattail-scan-slider-label-shift', labelShift)
		control.style.setProperty('--cattail-scan-slider-label-align', labelAlign)

		if (range) {
			range.value = String(visualDiameter)
			range.title = text.title
			range.setAttribute('aria-label', text.title)
			range.style.setProperty('--cattail-scan-slider-progress', progressText)
		}
		if (diameter) diameter.textContent = text.diameter + ' ' + formatNumber(game, tuning.diameter)
		if (reality) reality.textContent = text.reality + ' ' + formatNumber(game, tuning.reality)
		if (reset) {
			reset.textContent = text.reset
			reset.title = text.reset
			reset.setAttribute('aria-label', text.reset)
		}
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
			this.source = payload.source

			for (let dx = -this.radius; dx < this.radius; dx++) {
				for (let dy = -this.radius; dy < this.radius; dy++) {
					const p = [dx + this.source[0], dy + this.source[1]]
					const e = this.master.entityAtCoordinates(p)
					if (e) e.ondarkhover()

					const d2 = dx ** 2 + dy ** 2
					if (d2 > this.radius2) continue
					const map = this.master.getResourceNodeValues(p[0], p[1])
					if (!map.length) continue
					this.cells.push({
						p,
						values: map,
						f2: d2 / this.radius2
					})
				}
			}

			this.maxEndTime = 20000
			this.time = 0
		}

		render() {
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
	padding: calc(var(--unit) * 1.2) 0 calc(var(--unit) * .24);
	color: #111;
	font: inherit;
	user-select: none;
	-webkit-user-select: none;
}
.cattail-scan-reality-slider-category {
	margin-top: calc(var(--unit) * .18);
	margin-bottom: calc(var(--unit) * .3);
	padding-top: calc(var(--unit) * 1.16);
}
.cattail-scan-slider-value {
	position: absolute;
	left: var(--cattail-scan-slider-progress, 10%);
	max-width: 46%;
	min-height: calc(var(--unit) * .18);
	color: #b6aeae;
	font: inherit;
	font-size: calc(var(--unit) * .54);
	font-weight: 400;
	line-height: 1.1;
	text-align: var(--cattail-scan-slider-label-align, center);
	letter-spacing: 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	pointer-events: none;
	transform: translateX(var(--cattail-scan-slider-label-shift, -50%));
}
.cattail-scan-slider-diameter {
	top: calc(var(--unit) * .08);
}
.cattail-scan-slider-reality {
	top: calc(var(--unit) * 1.86);
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
