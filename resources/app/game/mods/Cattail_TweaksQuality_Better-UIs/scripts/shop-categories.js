ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableShopCategories', true) === false) return

		const storageKey = 'cattailShopCategoriesCompressed'
		const expandedKey = '_cattailShopCategoryExpanded'
		const panelKey = '_cattailShopCategoryPanel'
		const toggleKey = '_cattailShopCategoryToggle'
		const compressedKey = '_cattailShopCategoryCompressed'
		const signatureKey = '_cattailShopCategorySignature'

		const categories = [
			{
				id: 'main',
				title: '重要',
				description: '进入下个阶段的关键的建筑',
				items: ['strange', 'strange1', 'strange2', 'strange3', 'voidsculpture', 'chasm', 'pinhole']
			},
			{
				id: 'mines',
				title: '矿井',
				description: '一切的源头',
				items: ['pump', 'pump2', 'gradient', 'puncture', 'scan']
			},
			{
				id: 'breaking',
				title: '开采',
				description: '半自动采集的基本配备',
				items: ['destabilizer', 'destabilizer2', 'destabilizer2a', 'injector', 'entropic', 'entropic2', 'entropic2a', 'entropic3', 'flower', 'fruit']
			},
			{
				id: 'efficiency',
				title: '效率',
				description: '提升采集效率',
				items: ['doublechannel', 'doublechannel2', 'valve', 'auxpump', 'auxpump2']
			},
			{
				id: 'conversion',
				title: '转换',
				description: '提供置换反应',
				items: ['converter32', 'converter13', 'converter41', 'converter76', 'converter64', 'reflector', 'preheater', 'consumer', 'generaldecay', 'annihilator']
			},
			{
				id: 'storage',
				title: '存储',
				description: '提供存储，补给与物流',
				items: ['conductor', 'silo', 'silo2', 'vault', 'vessel', 'vessel2', 'chasm']
			},
			{
				id: 'tools',
				title: '工具',
				description: '获得增强和优化',
				items: ['stabilizer', 'stabilizer2', 'stabilizer3', 'waypoint', 'waypoint2', 'clicker1', 'clicker2', 'clicker3', 'mega1', 'mega1a', 'mega1b', 'mega2', 'mega3', 'eye', 'eraser', 'eraser2', 'eraser3']
			},
			{
				id: 'other',
				title: '其他',
				description: '',
				items: ['voidsculpture']
			}
		]

		const categoryTranslations = {
			en: {
				main: ['Important', 'Key buildings for entering the next stage'],
				mines: ['Mines', 'The source of everything'],
				breaking: ['Extraction', 'Basic setup for semi-automatic gathering'],
				efficiency: ['Efficiency', 'Improves gathering efficiency'],
				conversion: ['Conversion', 'Provides conversion reactions'],
				storage: ['Storage', 'Storage, supply, and logistics'],
				tools: ['Tools', 'Enhancements and optimization'],
				other: ['Other', '']
			},
			ru: {
				main: ['Важное', 'Ключевые постройки для перехода на следующий этап'],
				mines: ['Шахты', 'Источник всего'],
				breaking: ['Добыча', 'Базовый набор для полуавтоматического сбора'],
				efficiency: ['Эффективность', 'Повышает эффективность сбора'],
				conversion: ['Преобразование', 'Обеспечивает реакции преобразования'],
				storage: ['Хранилище', 'Хранение, снабжение и логистика'],
				tools: ['Инструменты', 'Усиления и оптимизация'],
				other: ['Другое', '']
			},
			de: {
				main: ['Wichtig', 'Schlüsselbauten für die nächste Stufe'],
				mines: ['Minen', 'Der Ursprung von allem'],
				breaking: ['Abbau', 'Grundausstattung für halbautomatische Sammlung'],
				efficiency: ['Effizienz', 'Verbessert die Sammelleistung'],
				conversion: ['Umwandlung', 'Ermöglicht Umwandlungsreaktionen'],
				storage: ['Lagerung', 'Lagerung, Versorgung und Logistik'],
				tools: ['Werkzeuge', 'Verbesserungen und Optimierung'],
				other: ['Sonstiges', '']
			},
			ptbr: {
				main: ['Importante', 'Construções-chave para avançar de estágio'],
				mines: ['Minas', 'A origem de tudo'],
				breaking: ['Extração', 'Base para coleta semiautomática'],
				efficiency: ['Eficiência', 'Melhora a eficiência da coleta'],
				conversion: ['Conversão', 'Fornece reações de conversão'],
				storage: ['Armazenamento', 'Armazenamento, suprimento e logística'],
				tools: ['Ferramentas', 'Aprimoramentos e otimização'],
				other: ['Outros', '']
			},
			it: {
				main: ['Importante', 'Edifici chiave per la fase successiva'],
				mines: ['Miniere', 'L’origine di tutto'],
				breaking: ['Estrazione', 'Base per la raccolta semiautomatica'],
				efficiency: ['Efficienza', 'Migliora l’efficienza di raccolta'],
				conversion: ['Conversione', 'Fornisce reazioni di conversione'],
				storage: ['Deposito', 'Deposito, rifornimento e logistica'],
				tools: ['Strumenti', 'Potenziamenti e ottimizzazione'],
				other: ['Altro', '']
			},
			es: {
				main: ['Importante', 'Construcciones clave para avanzar de fase'],
				mines: ['Minas', 'El origen de todo'],
				breaking: ['Extracción', 'Base para recolección semiautomática'],
				efficiency: ['Eficiencia', 'Mejora la eficiencia de recolección'],
				conversion: ['Conversión', 'Proporciona reacciones de conversión'],
				storage: ['Almacenamiento', 'Almacenamiento, suministro y logística'],
				tools: ['Herramientas', 'Mejoras y optimización'],
				other: ['Otros', '']
			},
			fr: {
				main: ['Important', 'Bâtiments clés pour passer à l’étape suivante'],
				mines: ['Mines', 'La source de tout'],
				breaking: ['Extraction', 'Base pour une collecte semi-automatique'],
				efficiency: ['Efficacité', 'Améliore l’efficacité de collecte'],
				conversion: ['Conversion', 'Fournit des réactions de conversion'],
				storage: ['Stockage', 'Stockage, ravitaillement et logistique'],
				tools: ['Outils', 'Améliorations et optimisation'],
				other: ['Autre', '']
			},
			nl: {
				main: ['Belangrijk', 'Belangrijke gebouwen voor de volgende fase'],
				mines: ['Mijnen', 'De bron van alles'],
				breaking: ['Winning', 'Basis voor halfautomatische verzameling'],
				efficiency: ['Efficiëntie', 'Verbetert de verzamelefficiëntie'],
				conversion: ['Omzetting', 'Levert omzettingsreacties'],
				storage: ['Opslag', 'Opslag, bevoorrading en logistiek'],
				tools: ['Gereedschap', 'Verbeteringen en optimalisatie'],
				other: ['Overig', '']
			},
			cz: {
				main: ['Důležité', 'Klíčové budovy pro další fázi'],
				mines: ['Doly', 'Zdroj všeho'],
				breaking: ['Těžba', 'Základ pro poloautomatický sběr'],
				efficiency: ['Účinnost', 'Zvyšuje účinnost sběru'],
				conversion: ['Přeměna', 'Zajišťuje přeměnné reakce'],
				storage: ['Skladování', 'Skladování, zásobování a logistika'],
				tools: ['Nástroje', 'Vylepšení a optimalizace'],
				other: ['Ostatní', '']
			},
			pl: {
				main: ['Ważne', 'Kluczowe budowle do przejścia dalej'],
				mines: ['Kopalnie', 'Źródło wszystkiego'],
				breaking: ['Wydobycie', 'Podstawa półautomatycznego zbierania'],
				efficiency: ['Wydajność', 'Zwiększa wydajność zbierania'],
				conversion: ['Konwersja', 'Zapewnia reakcje konwersji'],
				storage: ['Magazyn', 'Magazynowanie, zaopatrzenie i logistyka'],
				tools: ['Narzędzia', 'Ulepszenia i optymalizacja'],
				other: ['Inne', '']
			},
			jp: {
				main: ['重要', '次の段階へ進むための重要な建物'],
				mines: ['鉱井', 'すべての源'],
				breaking: ['採掘', '半自動収集の基本装備'],
				efficiency: ['効率', '収集効率を高める'],
				conversion: ['変換', '変換反応を提供する'],
				storage: ['保管', '保管、補給、物流'],
				tools: ['ツール', '強化と最適化'],
				other: ['その他', '']
			},
			kr: {
				main: ['중요', '다음 단계로 가기 위한 핵심 건물'],
				mines: ['광산', '모든 것의 근원'],
				breaking: ['채굴', '반자동 수집의 기본 장비'],
				efficiency: ['효율', '수집 효율 향상'],
				conversion: ['변환', '변환 반응 제공'],
				storage: ['저장', '저장, 보급, 물류'],
				tools: ['도구', '강화와 최적화'],
				other: ['기타', '']
			},
			tch: {
				main: ['重要', '進入下個階段的關鍵建築'],
				mines: ['礦井', '一切的源頭'],
				breaking: ['開採', '半自動採集的基本配備'],
				efficiency: ['效率', '提升採集效率'],
				conversion: ['轉換', '提供置換反應'],
				storage: ['存儲', '提供存儲、補給與物流'],
				tools: ['工具', '獲得增強和優化'],
				other: ['其他', '']
			},
			thai: {
				main: ['สำคัญ', 'สิ่งปลูกสร้างหลักสำหรับไปสู่ขั้นถัดไป'],
				mines: ['เหมือง', 'ต้นกำเนิดของทุกอย่าง'],
				breaking: ['การขุด', 'พื้นฐานสำหรับการเก็บกึ่งอัตโนมัติ'],
				efficiency: ['ประสิทธิภาพ', 'เพิ่มประสิทธิภาพการเก็บ'],
				conversion: ['การแปลง', 'ให้ปฏิกิริยาการแปลง'],
				storage: ['การจัดเก็บ', 'การจัดเก็บ เสบียง และโลจิสติกส์'],
				tools: ['เครื่องมือ', 'การเสริมและปรับแต่ง'],
				other: ['อื่นๆ', '']
			},
			hu: {
				main: ['Fontos', 'Kulcsépületek a következő szakaszhoz'],
				mines: ['Bányák', 'Minden forrása'],
				breaking: ['Kitermelés', 'Alap fél-automata gyűjtéshez'],
				efficiency: ['Hatékonyság', 'Növeli a gyűjtés hatékonyságát'],
				conversion: ['Átalakítás', 'Átalakító reakciókat biztosít'],
				storage: ['Tárolás', 'Tárolás, ellátás és logisztika'],
				tools: ['Eszközök', 'Fejlesztések és optimalizálás'],
				other: ['Egyéb', '']
			},
			lv: {
				main: ['Svarīgi', 'Galvenās būves nākamajam posmam'],
				mines: ['Raktuves', 'Visa sākums'],
				breaking: ['Ieguve', 'Pamats pusautomātiskai vākšanai'],
				efficiency: ['Efektivitāte', 'Uzlabo vākšanas efektivitāti'],
				conversion: ['Pārveide', 'Nodrošina pārveides reakcijas'],
				storage: ['Krātuve', 'Krātuve, apgāde un loģistika'],
				tools: ['Rīki', 'Uzlabojumi un optimizācija'],
				other: ['Citi', '']
			},
			ro: {
				main: ['Important', 'Clădiri-cheie pentru etapa următoare'],
				mines: ['Mine', 'Sursa tuturor lucrurilor'],
				breaking: ['Extracție', 'Bază pentru colectare semiautomată'],
				efficiency: ['Eficiență', 'Crește eficiența colectării'],
				conversion: ['Conversie', 'Oferă reacții de conversie'],
				storage: ['Depozitare', 'Depozitare, aprovizionare și logistică'],
				tools: ['Unelte', 'Îmbunătățiri și optimizare'],
				other: ['Altele', '']
			},
			no: {
				main: ['Viktig', 'Nøkkelbygg for neste fase'],
				mines: ['Gruver', 'Kilden til alt'],
				breaking: ['Utvinning', 'Grunnlag for halvautomatisk innsamling'],
				efficiency: ['Effektivitet', 'Forbedrer innsamlingseffektivitet'],
				conversion: ['Konvertering', 'Gir konverteringsreaksjoner'],
				storage: ['Lagring', 'Lagring, forsyning og logistikk'],
				tools: ['Verktøy', 'Forbedringer og optimalisering'],
				other: ['Annet', '']
			}
		}

		api.on('afterVanillaScripts', function () {
			if (typeof Shop === 'undefined') return

			installStyles()

			api.patch(Shop.prototype, 'init', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					attachToggle(this)
					syncToggleVisibility(this)
					resetPanel(this)
					setCompressed(this, readCompressedState(this), { silent: true, skipStorage: true })
					return result
				}
			})

			api.patch(Shop.prototype, 'check', function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					attachToggle(this)
					syncToggleVisibility(this)
					if (isCompressed(this)) renderCompressedShop(this)
					return result
				}
			})

			api.patch(Shop.prototype, 'centerItem', function (original) {
				return function (name) {
					if (!isCompressed(this)) return original.call(this, name)
					const category = findCategoryForItem(this, name)
					if (!category) return original.call(this, name)
					this[expandedKey] = category.id
					renderCompressedShop(this, true)
					const row = this[panelKey]?.querySelector('[data-shop-item="' + cssEscape(name) + '"]')
					if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
					return undefined
				}
			})


			if (typeof Game !== 'undefined') {
				api.patch(Game.prototype, 'changeLanguage', function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						refreshShopLanguage(this.shop)
						return result
					}
				})
			}
		})

		function attachToggle(shop) {
			if (!shop?.vessel || !shop.shopToggle) return
			if (shop[toggleKey]) {
				updateToggleLabel(shop)
				syncToggleVisibility(shop)
				return
			}

			const toggle = document.createElement('div')
			toggle.className = 'cattail-shop-compact-toggle'
			toggle.setAttribute('role', 'button')
			keepControlUnfocused(toggle)
			api.ui?.registerCornerButton({ id: 'shop-categories', element: toggle, anchor: 'game-bottom-right', order: 10, hideOnMobile: true })
			if (!toggle.isConnected) document.body.append(toggle)
			shop[toggleKey] = toggle
			updateToggleLabel(shop)
			syncToggleVisibility(shop)

			const activate = function (event) {
				event?.preventDefault()
				event?.stopPropagation()
				setCompressed(shop, !isCompressed(shop))
			}
			toggle.onclick = activate
			toggle.onkeydown = function (event) {
				if (event.key !== 'Enter' && event.key !== ' ') return
				activate(event)
			}

			setCompressed(shop, readCompressedState(shop), { silent: true, skipStorage: true })
		}

		function readCompressedState(shop) {
			if (typeof shop?.[compressedKey] === 'boolean') return shop[compressedKey]
			return localStorage.getItem(storageKey) === '1'
		}

		function isCompressed(shop) {
			return !!shop?.[compressedKey]
		}

		function setCompressed(shop, value, options = {}) {
			if (!shop?.vessel) return
			const next = !!value
			shop[compressedKey] = next
			shop.vessel.classList.toggle('cattail-shop-compressed', next)
			shop[toggleKey]?.classList.toggle('cattail-shop-compact-active', next)
			shop[toggleKey]?.setAttribute('aria-pressed', next ? 'true' : 'false')
			syncToggleVisibility(shop)
			if (!options.skipStorage) localStorage.setItem(storageKey, next ? '1' : '0')
			if (next) renderCompressedShop(shop, true)
			else if (shop[panelKey]) shop[panelKey].classList.add('cattail-shop-category-panel-hidden')
			if (!options.silent) shop.vessel.scrollTop = 0
		}

		function resetPanel(shop) {
			if (shop[panelKey]) shop[panelKey].remove()
			shop[panelKey] = null
			shop[signatureKey] = ''
		}

		function renderCompressedShop(shop, force = false) {
			if (!shop?.vessel || !Array.isArray(shop.items)) return
			const visibleCategories = collectVisibleCategories(shop)
			const signature = buildSignature(shop, visibleCategories)
			let panel = shop[panelKey]
			if (!force && panel && signature === shop[signatureKey]) {
				updateExpandedState(shop)
				return
			}

			if (!panel) {
				panel = document.createElement('div')
				panel.className = 'cattail-shop-category-panel'
				shop.vessel.append(panel)
				shop[panelKey] = panel
			}

			panel.classList.remove('cattail-shop-category-panel-hidden')
			panel.innerHTML = ''

			for (const category of visibleCategories) {
				panel.append(renderCategory(shop, category))
			}

			shop[signatureKey] = signature
			updateExpandedState(shop)
		}

		function collectVisibleCategories(shop) {
			const byName = new Map()
			for (const item of shop.items) {
				if (!item?.name || !item.html || item.html.classList.contains('hidden')) continue
				byName.set(item.name, item)
			}

			const assigned = new Set()
			const result = []

			for (const category of categories) {
				const items = []
				for (const id of category.items) {
					if (assigned.has(id)) continue
					const item = byName.get(id)
					if (!item) continue
					items.push(item)
					assigned.add(id)
				}
				if (items.length) result.push({ ...category, items })
			}

			let other = result.find((category) => category.id === 'other')
			for (const item of shop.items) {
				if (!item?.name || assigned.has(item.name) || item.html.classList.contains('hidden')) continue
				if (other) other.items.push(item)
				else {
					other = { id: 'other', title: '其他', description: '', items: [item] }
					result.push(other)
				}
				assigned.add(item.name)
			}

			return result.filter((category) => category.items.length)
		}

		function buildSignature(shop, visibleCategories) {
			return 'language:' + (shop?.master?.language || 'en') + '|' + visibleCategories.map((category) => {
				const items = category.items.map((item) => {
					const disabled = item.html.classList.contains('disabled') ? 'd' : 'a'
					const price = item.priceHtml?.textContent || ''
					const count = item.counter?.textContent || ''
					const isNew = item.html.classList.contains('newItem') ? 'n' : 'o'
					return item.name + ':' + disabled + ':' + isNew + ':' + price + ':' + count
				}).join(',')
				return category.id + '=' + items
			}).join('|')
		}

		function renderCategory(shop, category) {
			const block = document.createElement('div')
			block.className = 'cattail-shop-category'
			block.dataset.categoryId = category.id

			const header = document.createElement('button')
			header.type = 'button'
			header.className = 'cattail-shop-category-head'
			keepControlUnfocused(header)
			header.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				shop[expandedKey] = shop[expandedKey] === category.id ? '' : category.id
				updateExpandedState(shop)
			}

			const icon = document.createElement('span')
			icon.className = 'cattail-shop-category-icon'
			icon.append(createIcon(category.items[0]))
			const title = document.createElement('span')
			title.className = 'cattail-shop-category-title'
			title.textContent = localizedCategoryText(shop, category, 'title')
			const marker = document.createElement('span')
			marker.className = 'cattail-shop-category-marker'
			header.append(icon, title, marker)
			block.append(header)

			const body = document.createElement('div')
			body.className = 'cattail-shop-category-body'
			const bodyInner = document.createElement('div')
			bodyInner.className = 'cattail-shop-category-body-inner'
			const descriptionText = localizedCategoryText(shop, category, 'description')
			if (descriptionText) {
				const description = document.createElement('div')
				description.className = 'cattail-shop-category-desc'
				description.textContent = descriptionText
				bodyInner.append(description)
			}

			for (const item of category.items) {
				bodyInner.append(renderItem(shop, item))
			}

			body.append(bodyInner)
			block.append(body)
			return block
		}

		function renderItem(shop, item) {
			const row = document.createElement('button')
			row.type = 'button'
			row.className = 'cattail-shop-category-item'
			keepControlUnfocused(row)
			row.dataset.shopItem = item.name
			const disabled = item.html.classList.contains('disabled')
			const isNew = item.html.classList.contains('newItem')
			if (disabled) {
				row.classList.add('disabled')
				row.disabled = true
			}
			if (isNew) row.classList.add('newItem')

			const icon = document.createElement('span')
			icon.className = 'cattail-shop-category-item-icon'
			icon.append(createIcon(item))

			const text = document.createElement('span')
			text.className = 'cattail-shop-category-item-text'
			const name = document.createElement('span')
			name.className = 'cattail-shop-category-item-name'
			name.textContent = item.html.querySelector('.itemHeader')?.textContent || item.name
			text.append(name)

			const meta = document.createElement('span')
			meta.className = 'cattail-shop-category-item-meta'
			const price = item.priceHtml?.cloneNode(true)
			if (price) meta.append(price)
			let counter = null
			const counterText = item.counter?.textContent
			if (counterText) {
				counter = document.createElement('span')
				counter.className = 'cattail-shop-category-item-counter'
				counter.textContent = counterText
			}
			text.append(meta)

			row.append(icon, text)
			if (counter) row.append(counter)
			row.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				activateItem(shop, item)
			}
			return row
		}

		function activateItem(shop, item) {
			if (!item?.name || item.html.classList.contains('disabled') || item.html.classList.contains('hidden')) return
			shop.master.pickupItem(item.name)
			shop.master.processMousemove2()
			if (shop.master.isMobile) shop.vessel.classList.toggle('visible')
		}

		function createIcon(item) {
			const source = item?.html?.querySelector('.imageVessel img')
			const img = document.createElement('img')
			img.alt = ''
			img.src = source?.currentSrc || source?.src || source?.getAttribute('src') || ''
			return img
		}

		function updateExpandedState(shop) {
			const panel = shop?.[panelKey]
			if (!panel) return
			const current = shop[expandedKey] || ''
			for (const block of panel.querySelectorAll('.cattail-shop-category')) {
				const expanded = block.dataset.categoryId === current
				block.classList.toggle('expanded', expanded)
				block.querySelector('.cattail-shop-category-head')?.setAttribute('aria-expanded', expanded ? 'true' : 'false')
			}
		}

		function findCategoryForItem(shop, name) {
			const visibleCategories = collectVisibleCategories(shop)
			return visibleCategories.find((category) => category.items.some((item) => item.name === name))
		}


		function refreshShopLanguage(shop) {
			if (!shop) return
			updateToggleLabel(shop)
			shop[signatureKey] = ''
			if (isCompressed(shop)) renderCompressedShop(shop, true)
		}

		function updateToggleLabel(shop) {
			const toggle = shop?.[toggleKey]
			if (!toggle) return
			const label = localizedToggleText(shop)
			toggle.title = label
			toggle.setAttribute('aria-label', label)
		}

		function syncToggleVisibility(shop) {
			const toggle = shop?.[toggleKey]
			if (!toggle) return
			toggle.style.display = ''
			const hidden = !!api.ui?.isVanillaGameHudHidden?.(shop?.master)
			toggle.setAttribute('aria-hidden', hidden ? 'true' : 'false')
		}

		function localizedToggleText(shop) {
			const language = shop?.master?.language || 'en'
			if (language === 'sch' || language === 'modsch') return '切换分类商店'
			if (language === 'tch') return '切換分類商店'
			return 'Toggle categorized shop'
		}

		function localizedCategoryText(shop, category, field) {
			const language = shop?.master?.language || 'en'
			if (language === 'sch' || language === 'modsch') return category[field] || ''
			const labels = categoryTranslations[language] || categoryTranslations.en
			const value = labels[category.id]
			if (!value) return category[field] || ''
			return field === 'title' ? value[0] : value[1]
		}

		function keepControlUnfocused(control) {
			control.tabIndex = -1
			control.addEventListener('mousedown', function (event) {
				event.preventDefault()
			})
			control.addEventListener('focus', function () {
				control.blur()
			})
		}

		function cssEscape(value) {
			if (window.CSS?.escape) return window.CSS.escape(value)
			return String(value).replace(/"/g, '\\"')
		}

		function installStyles() {
			if (document.getElementById('cattail-shop-categories-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-shop-categories-style'
			style.textContent = `
.cattail-shop-compact-toggle {
	background: #fff;
	width: calc(var(--unit) * 2.5);
	height: calc(var(--unit) * 2.5);
	position: absolute;
	right: calc(var(--unit) * 3.35);
	bottom: calc(var(--unit) * .5);
	cursor: pointer;
	border-radius: 50%;
	box-shadow: 0 4px 8px #0001;
	z-index: 1;
	transition: box-shadow .18s ease, transform .18s ease;
}
.cattail-shop-compact-toggle:hover {
	box-shadow: 0 5px 10px #0002;
}
.cattail-shop-compact-toggle:active {
	transform: scale(.94);
}
.cattail-shop-compact-toggle:focus,
.cattail-shop-compact-toggle:focus-visible,
.cattail-shop-category-head:focus,
.cattail-shop-category-head:focus-visible,
.cattail-shop-category-item:focus,
.cattail-shop-category-item:focus-visible {
	outline: none;
}
.cattail-shop-compact-toggle:before,
.cattail-shop-compact-toggle:after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	width: 42%;
	height: calc(var(--unit) * .13);
	background: #111;
	border-radius: 999px;
	transform: translate(-50%, -50%);
	transition: width .2s ease, height .2s ease, box-shadow .2s ease, border-radius .2s ease, opacity .2s ease;
}
.cattail-shop-compact-toggle:before {
	box-shadow: 0 calc(var(--unit) * -.42) 0 #111, 0 calc(var(--unit) * .42) 0 #111;
}
.cattail-shop-compact-toggle:after {
	opacity: 0;
}
.cattail-shop-compact-toggle.cattail-shop-compact-active:before {
	width: 38%;
	height: 38%;
	border-radius: calc(var(--unit) * .08);
	box-shadow: none;
}
.cattail-shop-compact-toggle.cattail-shop-compact-active:after {
	opacity: 0;
}
.mobile .cattail-shop-compact-toggle {
	display: none !important;
}
.shop.cattail-shop-compressed > .shopItem,
.shop.cattail-shop-compressed > .shopPack {
	display: none !important;
}
.cattail-shop-category-panel {
	display: block;
}
.cattail-shop-category-panel-hidden,
.shop:not(.cattail-shop-compressed) .cattail-shop-category-panel {
	display: none !important;
}
.cattail-shop-category {
	position: relative;
	margin: 0 0 var(--unit) 0;
	border-radius: calc(var(--unit) * .24);
	color: #111;
	background: #fff;
	box-shadow: 0 calc(var(--unit) * .24) calc(var(--unit) * .48) #0001;
	overflow: visible;
}
.cattail-shop-category-head {
	position: relative;
	width: 100%;
	min-height: calc(var(--unit) * 3.35);
	display: grid;
	grid-template-columns: calc(var(--unit) * 2.75) 1fr calc(var(--unit) * 1.35);
	align-items: center;
	gap: calc(var(--unit) * .45);
	padding: calc(var(--unit) * .46) calc(var(--unit) * .58);
	border: 0;
	border-radius: calc(var(--unit) * .24);
	background: #fff;
	color: #111;
	font: 600 calc(var(--unit) * .9) 'Montserrat';
	text-align: left;
	cursor: pointer;
	transition: background .18s ease, box-shadow .18s ease;
}
.cattail-shop-category-head:hover {
	background: #f5f5f2;
}
.cattail-shop-category.expanded .cattail-shop-category-head {
	position: sticky;
	top: 0;
	z-index: 3;
	box-shadow: 0 calc(var(--unit) * .18) calc(var(--unit) * .36) #0001;
}
.cattail-shop-category-icon,
.cattail-shop-category-item-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	pointer-events: none;
}
.cattail-shop-category-icon img {
	width: calc(var(--unit) * 2.2);
	max-height: calc(var(--unit) * 2.2);
	object-fit: contain;
}
.cattail-shop-category-title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.cattail-shop-category-marker {
	position: relative;
	width: calc(var(--unit) * 1.05);
	height: calc(var(--unit) * 1.05);
	justify-self: end;
}
.cattail-shop-category-marker:before,
.cattail-shop-category-marker:after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	width: 70%;
	height: calc(var(--unit) * .16);
	background: #111;
	border-radius: 999px;
	transform: translate(-50%, -50%);
	transition: transform .22s ease, opacity .22s ease;
}
.cattail-shop-category-marker:after {
	transform: translate(-50%, -50%) rotate(90deg);
}
.cattail-shop-category.expanded .cattail-shop-category-marker:after {
	opacity: 0;
	transform: translate(-50%, -50%) rotate(90deg) scaleX(.15);
}
.cattail-shop-category-body {
	max-height: 0;
	opacity: 0;
	overflow: hidden;
	transform: translateY(calc(var(--unit) * -.4));
	transition: max-height .26s ease, opacity .2s ease, transform .26s ease;
}
.cattail-shop-category.expanded .cattail-shop-category-body {
	max-height: calc(var(--unit) * 80);
	opacity: 1;
	transform: translateY(0);
}
.cattail-shop-category-body-inner {
	padding: calc(var(--unit) * .42) calc(var(--unit) * .72) calc(var(--unit) * .78);
}
.cattail-shop-category-desc {
	display: flex;
	align-items: center;
	min-height: calc(var(--unit) * 1.6);
	box-sizing: border-box;
	color: #85858e;
	font-size: calc(var(--unit) * .72);
	line-height: 1.35;
	margin: 0 0 calc(var(--unit) * .5);
	padding: calc(var(--unit) * .15) calc(var(--unit) * .2) calc(var(--unit) * .5);
}
.shop.minimized .cattail-shop-category-desc {
	display: none;
}
.cattail-shop-category-item {
	position: relative;
	width: 100%;
	display: grid;
	grid-template-columns: calc(var(--unit) * 2.45) 1fr;
	align-items: center;
	gap: calc(var(--unit) * .5);
	padding: calc(var(--unit) * .48) calc(var(--unit) * 1.75) calc(var(--unit) * .48) calc(var(--unit) * .18);
	border: 0;
	border-top: 1px dashed #1122;
	background: transparent;
	color: #111;
	font: calc(var(--unit) * .78) 'Montserrat';
	text-align: left;
	cursor: pointer;
	transition: background .16s ease, opacity .16s ease;
}
.cattail-shop-category-item:hover {
	background: #f4f4f1;
}
.cattail-shop-category-item.disabled {
	color: #b6aeae;
	cursor: default;
	opacity: .97;
}
.cattail-shop-category-item.disabled .available {
	color: #111;
}
.cattail-shop-category-item-icon img {
	width: calc(var(--unit) * 2.05);
	max-height: calc(var(--unit) * 2.05);
	object-fit: contain;
}
.cattail-shop-category-item.disabled .cattail-shop-category-item-icon {
	filter: grayscale(90%);
	opacity: .45;
}
.cattail-shop-category-item-text {
	display: grid;
	gap: calc(var(--unit) * .15);
	min-width: 0;
}
.cattail-shop-category-item-name {
	font-weight: 600;
	line-height: 1.2;
	word-break: break-word;
}
.cattail-shop-category-item-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: calc(var(--unit) * .25);
	font-size: calc(var(--unit) * .72);
	line-height: 1.35;
}
.cattail-shop-category-item-meta .itemPrice {
	text-align: left;
}
.cattail-shop-category-item-meta .itemPrice nobr {
	margin-right: calc(var(--unit) * .35);
}
.cattail-shop-category-item-meta .itemPrice .priceString {
	margin: 0 calc(var(--unit) * .45) 0 calc(var(--unit) * .2);
}
.cattail-shop-category-item-counter {
	position: absolute;
	top: calc(var(--unit) * .42);
	right: calc(var(--unit) * .48);
	color: #99a;
	font-size: calc(var(--unit) * .68);
	line-height: 1;
}
.shop.minimized .cattail-shop-category-item-meta {
	display: none;
}
.shop.minimized .cattail-shop-category-item-text {
	gap: 0;
}
.shop.minimized .cattail-shop-category-item {
	padding-top: calc(var(--unit) * .45);
	padding-bottom: calc(var(--unit) * .45);
}
.shop.darkShop .cattail-shop-category,
.shop.darkShop .cattail-shop-category-head {
	background: #111114;
	color: #fff;
}
.shop.darkShop .cattail-shop-category-head:hover,
.shop.darkShop .cattail-shop-category-item:hover {
	background: #1a1a20;
}
.shop.darkShop .cattail-shop-category-marker:before,
.shop.darkShop .cattail-shop-category-marker:after {
	background: #fff;
}
.shop.darkShop .cattail-shop-category-item {
	border-top-color: #fff2;
	color: #fff;
}
.shop.darkShop .cattail-shop-category-desc,
.shop.darkShop .cattail-shop-category-item-counter {
	color: #9a9aa3;
}
.shop.darkShop .cattail-shop-category-item.disabled {
	color: #5c5c5c;
}
.shop.darkShop .cattail-shop-category-item.disabled .itemPrice {
	color: #5c5c5c;
}
.shop.darkShop .cattail-shop-category-item.disabled .available {
	color: #fff;
}
.cattail-shop-category-item.newItem .cattail-shop-category-item-name:after {
	content: '';
	display: inline-block;
	width: calc(var(--unit) * .48);
	height: calc(var(--unit) * .48);
	margin-left: calc(var(--unit) * .35);
	border-radius: 50%;
	background: #ffe978;
	vertical-align: middle;
}
`
			document.head.append(style)
		}
	}
})
