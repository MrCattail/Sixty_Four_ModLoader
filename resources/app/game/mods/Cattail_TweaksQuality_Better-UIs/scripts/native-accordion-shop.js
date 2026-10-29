ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('shopVersion', '1.3') !== '1.3') return
		const styleKey = 'cattailNativeShopStyle'
		const descriptionKey = 'cattailNativeShopDescriptionsHidden'
		const views = new WeakMap()
		let activeView
		// Category names belong to this view, not the vanilla words/modsch catalog.
		// Order: extractors, destabilizers, resonators, converters, storage,
		// uniques, default, complete, dark, switch style, hide descriptions, tools.
		const texts = {
			en: ['Extractors', 'Destabilizers', 'Resonators', 'Converters', 'Storage', 'Unique buildings', 'Other buildings', 'Complete', 'Chasm', 'Switch shop style', 'Hide building descriptions', 'Demolish', 'Relocate'],
			sch: ['采集设备', '解稳设备', '谐振设备', '转换设备', '存储设备', '独特建筑', '其他建筑', '完成', '虚空', '切换商店样式', '隐藏建筑描述', '拆除', '搬迁'],
			modsch: ['采集', '解构', '破坏', '转换', '存储', '特殊', '其他', '完成', '虚空', '切换商店样式', '隐藏建筑描述', '拆解', '搬迁'],
			tch: ['採集設備', '解穩設備', '諧振設備', '轉換設備', '儲存設備', '獨特建築', '其他建築', '完成', '虛空', '切換商店樣式', '隱藏建築描述', '拆解', '搬遷'],
			ru: ['Добытчики', 'Дестабилизаторы', 'Резонаторы', 'Преобразователи', 'Хранилища', 'Уникальные здания', 'Другие здания', 'Завершение', 'Бездна', 'Сменить вид магазина', 'Скрыть описания зданий', 'Снос', 'Перемещение'],
			de: ['Förderanlagen', 'Destabilisatoren', 'Resonatoren', 'Umwandler', 'Lager', 'Einzigartige Gebäude', 'Weitere Gebäude', 'Abschluss', 'Abgrund', 'Shop-Ansicht wechseln', 'Gebäudebeschreibungen ausblenden', 'Abreißen', 'Versetzen'],
			ptbr: ['Extratores', 'Desestabilizadores', 'Ressonadores', 'Conversores', 'Armazenamento', 'Construções únicas', 'Outras construções', 'Conclusão', 'Abismo', 'Alternar estilo da loja', 'Ocultar descrições das construções', 'Demolir', 'Realocar'],
			it: ['Estrattori', 'Destabilizzatori', 'Risonatori', 'Convertitori', 'Depositi', 'Edifici unici', 'Altri edifici', 'Completamento', 'Abisso', 'Cambia stile del negozio', 'Nascondi descrizioni degli edifici', 'Demolisci', 'Sposta'],
			es: ['Extractores', 'Desestabilizadores', 'Resonadores', 'Conversores', 'Almacenamiento', 'Edificios únicos', 'Otros edificios', 'Finalización', 'Abismo', 'Cambiar estilo de la tienda', 'Ocultar descripciones de edificios', 'Demoler', 'Reubicar'],
			fr: ['Extracteurs', 'Déstabilisateurs', 'Résonateurs', 'Convertisseurs', 'Stockage', 'Bâtiments uniques', 'Autres bâtiments', 'Achèvement', 'Abîme', 'Changer le style de boutique', 'Masquer les descriptions des bâtiments', 'Démolir', 'Déplacer'],
			nl: ['Extractoren', 'Destabilisatoren', 'Resonatoren', 'Omzetters', 'Opslag', 'Unieke gebouwen', 'Overige gebouwen', 'Voltooiing', 'Afgrond', 'Winkelstijl wisselen', 'Gebouwbeschrijvingen verbergen', 'Slopen', 'Verplaatsen'],
			cz: ['Těžební zařízení', 'Destabilizátory', 'Rezonátory', 'Převodníky', 'Sklady', 'Jedinečné budovy', 'Ostatní budovy', 'Dokončení', 'Propast', 'Změnit vzhled obchodu', 'Skrýt popisy budov', 'Zbourat', 'Přemístit'],
			pl: ['Ekstraktory', 'Destabilizatory', 'Rezonatory', 'Konwertery', 'Magazyny', 'Unikalne budynki', 'Pozostałe budynki', 'Ukończenie', 'Otchłań', 'Zmień wygląd sklepu', 'Ukryj opisy budynków', 'Wyburz', 'Przenieś'],
			jp: ['採掘設備', '不安定化装置', '共振装置', '変換装置', '貯蔵設備', '固有の建物', 'その他の建物', '完了', '深淵', 'ショップの表示を切り替え', '建物の説明を非表示', '解体', '移設'],
			kr: ['채굴 장치', '불안정화 장치', '공명 장치', '변환 장치', '저장 시설', '고유 건물', '기타 건물', '완료', '심연', '상점 표시 전환', '건물 설명 숨기기', '철거', '이전'],
			thai: ['เครื่องสกัด', 'เครื่องทำให้ไม่เสถียร', 'เครื่องสั่นพ้อง', 'เครื่องแปลง', 'คลังเก็บ', 'สิ่งปลูกสร้างพิเศษ', 'สิ่งปลูกสร้างอื่น', 'เสร็จสิ้น', 'ห้วงลึก', 'สลับรูปแบบร้านค้า', 'ซ่อนคำอธิบายสิ่งปลูกสร้าง', 'รื้อถอน', 'ย้ายสิ่งปลูกสร้าง'],
			hu: ['Kitermelők', 'Destabilizátorok', 'Rezonátorok', 'Átalakítók', 'Tárolók', 'Egyedi épületek', 'Egyéb épületek', 'Befejezés', 'Szakadék', 'Bolt megjelenésének váltása', 'Épületleírások elrejtése', 'Bontás', 'Áthelyezés'],
			lv: ['Ieguves iekārtas', 'Destabilizatori', 'Rezonatori', 'Pārveidotāji', 'Glabātuves', 'Unikālas ēkas', 'Citas ēkas', 'Pabeigšana', 'Bezdibenis', 'Mainīt veikala izskatu', 'Slēpt ēku aprakstus', 'Nojaukt', 'Pārvietot'],
			ro: ['Extractoare', 'Destabilizatoare', 'Rezonatoare', 'Convertoare', 'Depozitare', 'Clădiri unice', 'Alte clădiri', 'Finalizare', 'Abis', 'Schimbă aspectul magazinului', 'Ascunde descrierile clădirilor', 'Demolează', 'Relochează'],
			no: ['Utvinnere', 'Destabilisatorer', 'Resonatorer', 'Omformere', 'Lagring', 'Unike bygninger', 'Andre bygninger', 'Fullføring', 'Avgrunn', 'Bytt butikkvisning', 'Skjul bygningsbeskrivelser', 'Riv', 'Flytt']
		}
		const typeIds = ['extractors', 'destabilizers', 'resonators', 'converters', 'storage', 'uniques', 'default', 'complete', 'dark']
		const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback } catch (_) { return fallback } }
		const write = (key, value) => { try { localStorage.setItem(key, value) } catch (_) {} }
		const supported = store => store?.master?.version === '1.3' && !store.master.isMobile

		api.on('afterVanillaScripts', () => {
			if (typeof DesktopStoreVersion === 'undefined') return
			api.patch(DesktopStoreVersion.prototype, 'init', original => function (...args) {
				const result = original.apply(this, args)
				if (!supported(this)) return result
				let view = views.get(this)
				if (!view) {
					activeView?.dispose(this.vessel)
					view = createView(this)
					views.set(this, view)
					activeView = view
				}
				view.rebuild()
				return result
			})
			for (const method of ['visibilityUpdate', 'closeTypes']) {
				api.patch(DesktopStoreVersion.prototype, method, original => function (...args) {
					const result = original.apply(this, args)
					views.get(this)?.sync()
					return result
				})
			}
			api.patch(DesktopStoreVersion.prototype, 'reinit', original => function (...args) {
				const state = views.get(this)?.capture()
				const result = original.apply(this, args)
				if (state) views.get(this)?.restore(state)
				return result
			})
			api.patch(DesktopStoreVersion.prototype, 'adjustWrap', original => function (wrap) {
				if (views.get(this)?.mode === 'accordion') { wrap.style.removeProperty('transform'); return }
				return original.call(this, wrap)
			})
			api.patch(DesktopStoreVersion.prototype, 'centerItem', original => function (name) {
				const view = views.get(this)
				return view?.mode === 'accordion' ? view.centerItem(name) : original.call(this, name)
			})
		})

		function createView(store) {
			installStyles()
			const root = store.vessel
			const master = store.master
			root.classList.add('cattail-native-shop')
			let disposed = false, entries = [], scroller, timer = null, frame = null, expanded = false, inside = false
			let savedScroll = 0, mode = read(styleKey, 'native') === 'accordion' ? 'accordion' : 'native'
			let descriptionsHidden = read(descriptionKey, '0') === '1'
			let navigationFrame = null, scrollFrame = null, scrollMotion = null, lastOpen = null, suppressNavigation = false
			const rail = document.createElement('div')
			rail.className = 'cattail-native-category-rail'
			root.append(rail)
			const layoutObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => scheduleNavigation()) : null
			const releases = []
			const listen = (node, event, fn, options) => { node.addEventListener(event, fn, options); releases.push(() => node.removeEventListener(event, fn, options)) }
			const tooltips = new Map()
			const clearTooltips = () => { for (const tip of tooltips.values()) tip.detach(); tooltips.clear() }
			const setTooltip = (target, text, enabled) => {
				target.removeAttribute('title')
				const previous = tooltips.get(target)
				if (enabled && previous?.text === text) return
				previous?.detach()
				tooltips.delete(target)
				if (!enabled || typeof api.ui?.settings?.tooltip?.attach !== 'function') return
				// Each control owns its root: removing a flying/hidden target must
				// tear down its active tooltip without clearing another control's.
				const detach = api.ui.settings.tooltip.attach(target, text, { root: target, ariaLabel: false, delayMs: 600, theme: 'plane' })
				if (typeof detach === 'function') tooltips.set(target, { text, detach })
			}
			const cancelScroll = () => {
				const wasMoving = scrollMotion !== null
				if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
				scrollFrame = null
				scrollMotion = null
				if (wasMoving) scheduleNavigation()
			}
			const scheduleNavigation = () => {
				if (disposed || navigationFrame !== null) return
				navigationFrame = requestAnimationFrame(() => { navigationFrame = null; view.updateNavigation() })
			}
			const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null }
			const setWide = value => { expanded = value; root.classList.toggle('cattail-native-labels-wide', value) }
			const anyOpen = () => entries.some(({ button }) => !button.classList.contains('closed') && !button.classList.contains('hidden'))
			function queueIdle() {
				if (disposed || mode !== 'accordion' || inside || anyOpen() || !expanded || timer !== null || api.ui?.hud?.isHidden?.()) return
				timer = setTimeout(() => { timer = null; if (!disposed && !inside && !anyOpen()) setWide(false) }, 2000)
			}
			function button(id, order, symbol, activate) {
				const element = document.createElement('button')
				element.type = 'button'
				element.className = 'cattail-native-shop-toggle cattail-native-' + id
				element.tabIndex = -1
				const icon = document.createElement('span')
				icon.className = 'cattail-native-toggle-icon'
				icon.textContent = symbol
				icon.setAttribute('aria-hidden', 'true')
				element.append(icon)
				element.addEventListener('mousedown', event => { event.preventDefault(); clearTooltips() })
				element.addEventListener('click', () => { clearTooltips(); activate() })
				for (const event of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) element.addEventListener(event, e => e.stopPropagation())
				releases.push(api.ui?.registerCornerButton({ id: 'native-shop-' + id, element, anchor: 'game-bottom-right', order, hideOnMobile: true }))
				if (!element.isConnected) document.body.append(element)
				return element
			}
			const styleButton = button('style', 10, '≡', () => { view.setMode(mode === 'native' ? 'accordion' : 'native'); write(styleKey, mode) })
			const descriptionButton = button('descriptions', 20, '¶', () => { descriptionsHidden = !descriptionsHidden; write(descriptionKey, descriptionsHidden ? '1' : '0'); view.sync() })
			listen(root, 'pointerenter', () => { inside = true; cancelTimer() })
			listen(root, 'pointerleave', () => { inside = false; queueIdle() })
			for (const event of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) listen(root, event, e => e.stopPropagation())
			// The public roots are the controls themselves, including docked buttons.
			// Clear this view's roots when an ancestor scrolls or a click acts.
			const resetTooltips = () => { clearTooltips(); view.syncTooltips() }
			listen(root, 'mousedown', resetTooltips, true)
			listen(root, 'wheel', resetTooltips, { capture: true, passive: true })
			listen(root, 'scroll', resetTooltips, true)
			listen(window, 'resize', () => view.measure())
			listen(document, 'keydown', event => {
				if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey || event.repeat || event.isComposing || event.defaultPrevented || !/^Digit[1-7]$/.test(event.code)) return
				const target = event.target
				if (mode !== 'accordion' || api.ui?.hud?.isHidden?.() || master.splash?.isShown || master.pinhole || master.credits || root.classList.contains('memory_faded') || getComputedStyle(root).display === 'none') return
				if (document.querySelector('[aria-modal="true"]') || [target, document.activeElement].some(node => node?.isContentEditable || node?.closest?.('input,textarea,select,[contenteditable="true"]'))) return
				const entry = entries.find(item => item.id === typeIds[Number(event.code.slice(-1)) - 1])
				if (!entry || entry.button.classList.contains('hidden')) return
				event.preventDefault()
				event.stopImmediatePropagation()
				view.activateCategory(entry, false)
			}, true)
			for (let index = 0; index < 7; index++) {
				const handle = api.ui?.shortcuts?.register({
					id: 'native-shop-category-' + typeIds[index], keys: ['Alt', String(index + 1)], order: index + 1,
					description: () => (texts[master.language] || texts.en)[index], context: '1.3',
					visible: () => !disposed && mode === 'accordion' && entries.some(entry => entry.id === typeIds[index] && !entry.button.classList.contains('hidden')),
					active: () => !api.ui?.hud?.isHidden?.() && !master.splash?.isShown && !master.pinhole && !master.credits
				})
				if (handle) releases.push(() => handle.unregister())
			}
			const view = {
				get mode() { return mode },
				rebuild() {
					clearTooltips()
					cancelTimer()
					cancelScroll()
					layoutObserver?.disconnect()
					rail.replaceChildren()
					root.append(rail)
					lastOpen = null
					if (scroller) { savedScroll = scroller.scrollTop; scroller.remove() }
					entries = Object.entries(store.html.types).map(([id, type]) => {
						const label = document.createElement('span')
						label.className = 'cattail-native-category-label'
						label.dataset.nativeType = id
						const title = document.createElement('span')
						title.className = 'cattail-native-category-title'
						const icon = document.createElement('span')
						icon.className = 'cattail-native-category-icon'
						icon.style.backgroundImage = type.button.style.backgroundImage
						label.append(title, icon)
						type.button.prepend(label)
						type.button.dataset.nativeCategory = id
						label.addEventListener('pointerenter', () => { if (mode === 'accordion') { setWide(true); cancelTimer() } })
						type.button.addEventListener('mousedown', () => view.sync())
						type.wrap.addEventListener('mousedown', event => { if (mode === 'accordion') event.stopPropagation() })
						const shortcut = document.createElement('button')
						shortcut.type = 'button'
						shortcut.className = 'cattail-native-category-shortcut'
						shortcut.dataset.nativeProxy = id
						shortcut.style.backgroundImage = type.button.style.backgroundImage
						shortcut.tabIndex = -1
						shortcut.setAttribute('aria-hidden', 'true')
						const entry = { id, ...type, title, label, shortcut, nativeTransform: type.wrap.style.transform, nativeScroll: type.wrap.scrollTop }
						shortcut.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); view.activateCategory(entry, true) })
						shortcut.addEventListener('click', event => { if (!event.detail) view.activateCategory(entry, true) })
						shortcut.addEventListener('transitionend', event => {
							if (event.propertyName !== 'transform' || shortcut.classList.contains('is-visible')) return
							shortcut.classList.remove('is-present')
							type.button.classList.remove('cattail-native-proxy-away')
						})
						rail.append(shortcut)
						return entry
					})
					scroller = document.createElement('div')
					scroller.className = 'cattail-native-shop-scroll'
					scroller.addEventListener('scroll', scheduleNavigation, { passive: true })
					for (const name of ['wheel', 'pointerdown', 'touchstart']) scroller.addEventListener(name, cancelScroll, { passive: true })
					scroller.addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'].includes(event.code)) cancelScroll() })
					view.setMode(mode, true)
					view.sync()
					document.fonts?.ready.then(() => { if (!disposed) view.measure() })
				},
				setMode(next, rebuilding = false) {
					cancelTimer()
					cancelScroll()
					layoutObserver?.disconnect()
					if (!rebuilding && next === mode) return
					clearTooltips()
					const wasAccordion = !rebuilding && mode === 'accordion'
					if (wasAccordion) savedScroll = scroller.scrollTop
					mode = next
					if (mode !== 'accordion') for (const entry of entries) {
						entry.shortcut.classList.remove('is-visible', 'is-present')
						entry.button.classList.remove('cattail-native-proxy-away')
					}
					root.classList.toggle('cattail-native-accordion', mode === 'accordion')
					if (mode === 'accordion') {
						root.prepend(scroller)
						for (const entry of entries) {
							entry.nativeTransform = entry.wrap.style.transform
							entry.nativeScroll = entry.wrap.scrollTop
							entry.wrap.style.removeProperty('transform')
							entry.inner = document.createElement('div')
							entry.inner.className = 'cattail-native-category-items'
							entry.inner.append(...entry.wrap.childNodes)
							entry.wrap.append(entry.inner)
							entry.panel = document.createElement('div')
							entry.panel.className = 'cattail-native-category-panel'
							entry.panel.append(entry.label, entry.wrap)
							entry.button.append(entry.panel)
							scroller.append(entry.button)
							layoutObserver?.observe(entry.panel)
						}
						layoutObserver?.observe(scroller)
						scroller.scrollTop = savedScroll
					} else {
						for (const entry of entries) {
							if (entry.panel) { entry.button.prepend(entry.label); entry.button.append(entry.wrap); entry.panel.remove(); delete entry.panel }
							if (entry.inner) { entry.wrap.replaceChildren(...entry.inner.childNodes); delete entry.inner }
							if (wasAccordion) root.insertBefore(entry.button, store.html.eraser)
							entry.wrap.style.transform = entry.nativeTransform
							entry.wrap.scrollTop = entry.nativeScroll
						}
						scroller.remove()
						setWide(false)
						for (const entry of entries) if (!entry.button.classList.contains('closed') && !entry.button.classList.contains('hidden')) store.adjustWrap(entry.wrap)
					}
					inside = root.matches(':hover')
					view.sync()
					view.measure()
					api.ui?.shortcuts?.refresh()
					scheduleNavigation()
				},
				sync() {
					if (disposed) return
					const labels = texts[master.language] || texts.en
					for (const entry of entries) {
						const text = labels[typeIds.indexOf(entry.id)] || entry.id
						if (entry.title.textContent !== text) entry.title.textContent = text
						entry.button.setAttribute('aria-label', text)
						entry.label.setAttribute('role', 'button')
						entry.label.setAttribute('aria-expanded', entry.button.classList.contains('closed') ? 'false' : 'true')
						entry.shortcut.setAttribute('aria-label', text)
						entry.shortcut.setAttribute('aria-pressed', String(!entry.button.classList.contains('closed')))
					}
					root.classList.toggle('cattail-native-no-descriptions', descriptionsHidden)
					for (const [element, index, pressed] of [[styleButton, 9, mode === 'accordion'], [descriptionButton, 10, descriptionsHidden]]) {
						element.setAttribute('aria-label', labels[index])
						element.setAttribute('aria-pressed', String(pressed))
						element.hidden = !!(master.pinhole || master.credits || root.style.display === 'none' || root.classList.contains('memory_faded'))
					}
					if (mode === 'accordion') {
						for (const entry of entries) if (entry.button.classList.contains('hidden')) entry.button.classList.add('closed')
						store.isOpen = anyOpen()
						root.classList.toggle('cattail-native-tools-aside', store.isOpen)
						if (store.isOpen) { setWide(true); cancelTimer() } else queueIdle()
					} else root.classList.remove('cattail-native-tools-aside')
					const openId = mode === 'accordion' ? entries.find(entry => !entry.button.classList.contains('closed') && !entry.button.classList.contains('hidden'))?.id || null : null
					if (openId !== lastOpen) {
						lastOpen = openId
						if (!suppressNavigation && mode === 'accordion') view.scrollCategory(entries.find(entry => entry.id === openId))
						scheduleNavigation()
					}
					const measureSignature = master.language + ':' + entries.map(entry => entry.button.classList.contains('hidden') ? '0' : '1').join('') + ':' + [store.html.eraser, store.html.relocator].map(button => button.classList.contains('hidden') ? '0' : '1').join('')
					if (view.measureSignature !== measureSignature) { view.measureSignature = measureSignature; view.measure(); api.ui?.shortcuts?.refresh() }
					view.syncTooltips()
				},
				syncTooltips() {
					const labels = texts[master.language] || texts.en
					const enabled = !disposed && !api.ui?.hud?.isHidden?.() && !master.pinhole && !master.credits && !root.classList.contains('memory_faded') && getComputedStyle(root).display !== 'none'
					const signature = [mode, master.language, master.plane, enabled, descriptionsHidden].join(':')
					if (view.tooltipSignature !== signature) {
						clearTooltips()
						view.tooltipSignature = signature
					}
					for (const entry of entries) {
						const index = typeIds.indexOf(entry.id)
						const text = (labels[index] || entry.id) + (index < 7 ? ' (Alt+' + (index + 1) + ')' : '')
						entry.label.setAttribute('aria-label', labels[index] || entry.id)
						const available = enabled && mode === 'accordion' && !entry.button.classList.contains('hidden')
						setTooltip(entry.label, text, available)
						setTooltip(entry.shortcut, text, available && entry.shortcut.classList.contains('is-visible'))
					}
					for (const [target, index] of [[styleButton, 9], [descriptionButton, 10], [store.html.eraser, 11], [store.html.relocator, 12]]) {
						target.setAttribute('aria-label', labels[index])
						const corner = target === styleButton || target === descriptionButton
						setTooltip(target, labels[index], enabled && !target.hidden && (corner || mode === 'accordion' && !target.classList.contains('hidden')))
					}
					const cards = new Set(Object.values(store.html.items))
					for (const target of tooltips.keys()) {
						if (target.classList.contains('item') && !cards.has(target)) setTooltip(target, '', false)
					}
					for (const card of cards) {
						const category = card.closest('[data-native-category]')
						const available = enabled && descriptionsHidden && card.isConnected && !card.hidden && !card.classList.contains('hidden') && category && !category.classList.contains('hidden') && !category.classList.contains('closed')
						// CSS hides only the description's layout; its real localized
						// text remains the source for both native and accordion cards.
						const text = available ? String(card.querySelector('.itemDescription')?.textContent || '').trim() : ''
						setTooltip(card, text, available && !!text)
					}
				},
				activateCategory(entry, toggle) {
					if (disposed || mode !== 'accordion' || entry.button.classList.contains('hidden')) return
					if (!toggle && !entry.button.classList.contains('closed')) view.scrollCategory(entry)
					else entry.button.dispatchEvent(new MouseEvent('mousedown', { bubbles: false, cancelable: true, button: 0 }))
				},
				scrollCategory(entry) {
					clearTooltips()
					// Headers cross the viewport while both cards and scrollTop move.
					// Keep the current side slots until this navigation settles; a new
					// intent inherits the displayed group without an intermediate reflow.
					const members = entry ? entries.filter(item => item === entry || item.shortcut.classList.contains('is-visible')) : null
					cancelScroll()
					if (frame !== null) cancelAnimationFrame(frame)
					frame = null
					root.classList.remove('cattail-native-shop-restoring')
					if (!scroller?.isConnected) return
					scrollMotion = { entry, members, from: scroller.scrollTop, start: null }
					// The current category is an extra entrance even before the first
					// scroll frame, and shares its existing proxy when it goes offscreen.
					view.updateNavigation()
					const step = now => {
						scrollFrame = null
						if (!scrollMotion || disposed || mode !== 'accordion') return
						if (scrollMotion.start === null) scrollMotion.start = now
						view.updateNavigation()
						const progress = Math.min(1, Math.max(0, (now - scrollMotion.start) / 240))
						const target = entry ? scroller.scrollTop + entry.label.getBoundingClientRect().top - Math.max(0, scroller.getBoundingClientRect().top) - 8 : 0
						scroller.scrollTop = scrollMotion.from + (target - scrollMotion.from) * (1 - Math.pow(1 - progress, 3))
						const settling = progress === 1 && entries.some(item => item.wrap.getAnimations().some(animation => animation.playState === 'running'))
						if (progress < 1 || settling) scrollFrame = requestAnimationFrame(step)
						else { scrollMotion = null; if (!anyOpen()) scroller.style.removeProperty('--native-shop-end'); scheduleNavigation() }
					}
					scrollFrame = requestAnimationFrame(step)
				},
				updateNavigation() {
					if (disposed || mode !== 'accordion') return
					const open = mode === 'accordion' && entries.find(entry => !entry.button.classList.contains('closed') && !entry.button.classList.contains('hidden'))
					const bounds = scroller?.getBoundingClientRect()
					const clipTop = Math.max(0, bounds?.top || 0), clipBottom = Math.min(innerHeight, bounds?.bottom || 0)
					if (open && bounds?.height) {
						const last = entries.filter(entry => !entry.button.classList.contains('hidden')).at(-1)
						const end = Math.max(0, clipBottom - clipTop - 8 - (last.button.getBoundingClientRect().bottom - open.label.getBoundingClientRect().top)) + 'px'
						if (scroller.style.getPropertyValue('--native-shop-end') !== end) scroller.style.setProperty('--native-shop-end', end)
					} else if (!scrollMotion) scroller?.style.removeProperty('--native-shop-end')
					const em = parseFloat(getComputedStyle(root).fontSize), size = em * 4, stride = em * 5
					const rootBounds = root.getBoundingClientRect()
					// HUD's will-change establishes a containing block even for fixed
					// descendants. Offset this owned layer to the real viewport instead.
					rail.style.left = -rootBounds.left + 'px'
					rail.style.top = -rootBounds.top + 'px'
					const railBounds = rail.getBoundingClientRect()
					const sideLeft = rootBounds.left - em * .7 - size - railBounds.left
					const visible = entries.filter(entry => {
						if (!open || !bounds?.height || entry.button.classList.contains('hidden')) return false
						if (entry === open) return true
						if (scrollMotion?.members) return scrollMotion.members.includes(entry)
						const rect = entry.label.getBoundingClientRect()
						return rect.bottom <= clipTop || rect.top >= clipBottom
					})
					const groupHeight = visible.length ? visible.length * size + (visible.length - 1) * em : 0
					const groupTop = (innerHeight - groupHeight) / 2
					const snap = root.classList.contains('cattail-native-shop-restoring')
					for (const entry of entries) {
						const index = visible.indexOf(entry), active = index >= 0
						const icon = entry.label.querySelector('.cattail-native-category-icon').getBoundingClientRect()
						const origin = 'translate(' + (icon.left - railBounds.left) + 'px,' + (icon.top - railBounds.top) + 'px)'
						const present = entry.shortcut.classList.contains('is-present')
						if (!present || snap || mode !== 'accordion') {
							// Commit the real icon position before starting the two-axis
							// transition. Hidden proxies never animate from a shared edge.
							entry.shortcut.style.transition = 'none'
							entry.shortcut.style.transform = origin
							if (active) { void entry.shortcut.offsetWidth; entry.shortcut.style.removeProperty('transition') }
						}
						entry.shortcut.classList.toggle('is-visible', active)
						entry.shortcut.setAttribute('aria-hidden', String(!active))
						entry.shortcut.tabIndex = active ? 0 : -1
						if (active) {
							entry.shortcut.classList.add('is-present')
							entry.button.classList.toggle('cattail-native-proxy-away', entry !== open)
							entry.shortcut.style.transform = 'translate(' + sideLeft + 'px,' + (groupTop + index * stride - railBounds.top) + 'px)'
						} else if (snap || !bounds?.height || entry.button.classList.contains('hidden') || !present) {
							entry.shortcut.classList.remove('is-present')
							entry.button.classList.remove('cattail-native-proxy-away')
						} else {
							entry.shortcut.style.transform = origin
							const current = entry.shortcut.getBoundingClientRect()
							if (Math.abs(current.left - icon.left) < .1 && Math.abs(current.top - icon.top) < .1) {
								entry.shortcut.classList.remove('is-present')
								entry.button.classList.remove('cattail-native-proxy-away')
							}
						}
					}
					const tools = ['eraser', 'relocator'].filter(name => !store.html[name].classList.contains('hidden')).map(name => ({
						name, native: parseFloat(root.style.getPropertyValue('--native-' + name + '-top')), height: store.html[name].getBoundingClientRect().height
					}))
					let positions = tools.map(tool => tool.native)
					if (visible.length) {
						const top = groupTop - rootBounds.top, bottom = top + groupHeight, limit = innerHeight - rootBounds.top - 8
						// Native positions are anchors. Move only for a category/tool
						// collision, preferring down; if it cannot fit, move the earliest
						// tools above the group while preserving their original order.
						let edge = -Infinity
						positions = tools.map(tool => {
							let y = Math.max(tool.native, edge)
							if (y < bottom + em && y + tool.height + em > top) y = bottom + em
							edge = y + tool.height + em
							return y
						})
						if (positions.some((y, i) => y + tools[i].height > limit)) {
							for (let split = 1; split <= tools.length; split++) {
								const candidate = [], upper = 8 - rootBounds.top
								let boundary = top - em, valid = true
								for (let i = split - 1; i >= 0; i--) {
									candidate[i] = Math.min(tools[i].native, boundary - tools[i].height)
									if (candidate[i] < upper) valid = false
									boundary = candidate[i] - em
								}
								boundary = bottom + em
								for (let i = split; i < tools.length; i++) {
									candidate[i] = Math.max(tools[i].native, boundary)
									if (candidate[i] + tools[i].height > limit) valid = false
									boundary = candidate[i] + tools[i].height + em
								}
								if (valid) { positions = candidate; break }
							}
						}
					}
					for (let i = 0; i < tools.length; i++) root.style.setProperty('--native-side-' + tools[i].name + '-top', positions[i] + 'px')
					view.syncTooltips()
				},
				measure() {
					if (disposed || !entries.length) return
					const em = parseFloat(getComputedStyle(root).fontSize)
					if (mode === 'accordion') {
						// A shallow, invisible copy measures the real native flex layout.
						// It contains no cards, listeners, ids or game objects. Measuring
						// only on layout changes keeps opening a category at its anchor.
						const signature = [innerWidth, innerHeight, root.clientWidth, view.measureSignature].join(':')
						if (view.positionSignature !== signature && getComputedStyle(root).display !== 'none') {
							const probe = root.cloneNode(false)
							probe.removeAttribute('id')
							probe.classList.remove('cattail-native-accordion', 'cattail-native-labels-wide', 'cattail-native-shop-restoring')
							probe.setAttribute('aria-hidden', 'true')
							Object.assign(probe.style, { visibility: 'hidden', pointerEvents: 'none', transition: 'none' })
							let first
							const tools = []
							for (const button of [...entries.map(entry => entry.button), store.html.eraser, store.html.relocator]) {
								const copy = button.cloneNode(false)
								copy.removeAttribute('id')
								probe.append(copy)
								if (button === store.html.eraser) tools.push(['eraser', copy])
								if (button === store.html.relocator) tools.push(['relocator', copy])
								if (!first && entries.some(entry => entry.button === button) && !button.classList.contains('hidden')) first = copy
							}
							try {
								root.parentNode.append(probe)
								root.style.setProperty('--native-shop-start', Math.max(0, first ? first.getBoundingClientRect().top - root.getBoundingClientRect().top : em) + 'px')
								for (const [name, copy] of tools) root.style.setProperty('--native-' + name + '-top', (copy.getBoundingClientRect().top - root.getBoundingClientRect().top) + 'px')
								view.positionSignature = signature
							} finally { probe.remove() }
							if (!anyOpen()) scroller.scrollTop = 0
						}
					}
					// Measure real glyphs with the game's font and language fallback.
					const canvas = document.createElement('canvas')
					const context = canvas.getContext('2d')
					const font = getComputedStyle(entries[0].title)
					context.font = '600 ' + (em * 1.1) + 'px ' + font.fontFamily
					const longest = Math.max(...entries.filter(entry => !entry.button.classList.contains('hidden')).map(entry => context.measureText(entry.title.textContent).width), 0)
					const width = Math.max(4 * em, scroller?.isConnected ? scroller.clientWidth - em : root.clientWidth - 14 - em)
					root.style.setProperty('--native-title-scale', String(longest ? Math.min(1, Math.max(0, width - 5.8 * em) / longest) : 1))
					scheduleNavigation()
				},
				capture() { return { scrollTop: scroller?.scrollTop || 0, wide: expanded, open: entries.find(entry => !entry.button.classList.contains('closed') && !entry.button.classList.contains('hidden'))?.id } },
				restore(state) {
					if (disposed || !state) return
					clearTooltips()
					cancelScroll()
					suppressNavigation = true
					for (const entry of entries) entry.button.classList.toggle('closed', entry.id !== state.open || entry.button.classList.contains('hidden'))
					store.isOpen = anyOpen()
					setWide(!!state.wide)
					root.classList.add('cattail-native-shop-restoring')
					view.sync()
					view.updateNavigation()
					if (scroller) { void scroller.offsetHeight; scroller.scrollTop = state.scrollTop }
					suppressNavigation = false
					scheduleNavigation()
					if (frame !== null) cancelAnimationFrame(frame)
					frame = requestAnimationFrame(() => { frame = null; root.classList.remove('cattail-native-shop-restoring') })
				},
				centerItem(name) {
					const item = store.html.items[name]
					if (!item || item.classList.contains('hidden')) return
					const type = master.codex.entities[name].type || 'default'
					clearTooltips()
					cancelScroll()
					suppressNavigation = true
					store.closeTypes()
					store.html.types[type].button.classList.remove('closed')
					store.isOpen = true
					root.classList.add('cattail-native-shop-restoring')
					view.sync()
					view.updateNavigation()
					suppressNavigation = false
					if (frame !== null) cancelAnimationFrame(frame)
					frame = requestAnimationFrame(() => {
						frame = null
						if (disposed || mode !== 'accordion' || !item.isConnected) return
						const outer = scroller.getBoundingClientRect(), inner = item.getBoundingClientRect()
						scroller.scrollTo({ top: scroller.scrollTop + inner.top - outer.top - (outer.height - inner.height) / 2, behavior: 'smooth' })
						root.classList.remove('cattail-native-shop-restoring')
					})
				},
				dispose(replacementRoot) {
					cancelTimer()
					cancelScroll()
					layoutObserver?.disconnect()
					if (navigationFrame !== null) cancelAnimationFrame(navigationFrame)
					navigationFrame = null
					if (frame !== null) cancelAnimationFrame(frame)
					frame = null
					if (frame !== null) cancelAnimationFrame(frame)
					if (replacementRoot === root) {
						// init() has already appended the replacement Store's nodes.
						// Remove only the previous Store's owned nodes, never clear root.
						for (const entry of entries) entry.button.remove()
						store.html.eraser?.remove()
						store.html.relocator?.remove()
					} else if (mode === 'accordion') view.setMode('native')
					disposed = true
					clearTooltips()
					for (const release of releases) release?.()
					for (const entry of entries) { entry.label.remove(); delete entry.button.dataset.nativeCategory; entry.button.removeAttribute('aria-label') }
					root.classList.remove('cattail-native-shop', 'cattail-native-accordion', 'cattail-native-shop-restoring', 'cattail-native-labels-wide', 'cattail-native-no-descriptions', 'cattail-native-tools-aside')
					root.style.removeProperty('--native-shop-start')
					root.style.removeProperty('--native-eraser-top')
					root.style.removeProperty('--native-relocator-top')
					root.style.removeProperty('--native-title-scale')
					root.style.removeProperty('--native-side-eraser-top')
					root.style.removeProperty('--native-side-relocator-top')
					rail.remove()
					styleButton.remove(); descriptionButton.remove(); scroller?.remove()
					views.delete(store)
				}
			}
			releases.push(api.ui?.registerHud({
				id: 'native-shop-scroll', side: 'right',
				capture: view.capture,
				restore: view.restore,
				onHide: () => { clearTooltips(); cancelTimer(); cancelScroll() },
				onShow: () => { inside = root.matches(':hover'); view.sync() }
			}))
			return view
		}

		function installStyles() {
			if (document.getElementById('cattail-native-shop-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-native-shop-style'
			style.textContent = [
				'.cattail-native-shop-toggle { width:calc(var(--unit)*2.5); height:calc(var(--unit)*2.5); border:0; border-radius:50%; background:#fff; color:#111; box-shadow:0 4px 8px #0001; cursor:pointer; font:600 calc(var(--unit)*1.55) Montserrat,sans-serif; padding:0; display:grid; place-items:center; }',
				'.cattail-native-shop-toggle[hidden] { display:none!important; }',
				'.cattail-native-shop-toggle[aria-pressed="true"] { background:#ffe978; }',
				'.cattail-native-shop-toggle:hover { box-shadow:0 4px 12px #0003; }',
				'.cattail-native-shop .cattail-native-category-label { display:none; }',
				'.cattail-native-shop.cattail-native-no-descriptions .itemDescription { display:none!important; }',
				'.store.cattail-native-shop.cattail-native-no-descriptions .element:not(.closed) .itemWrap .item.disabled { pointer-events:auto; cursor:default; }',
				'.store.cattail-native-accordion { display:block; right:8px; bottom:0; height:auto; width:calc(min(17em,calc(100vw - 7em)) + 14px); pointer-events:none; }',
				'.cattail-native-shop-scroll { height:100%; width:100%; box-sizing:border-box; padding:var(--native-shop-start,1em) .5em max(calc(var(--unit)*3.8 + 1em),var(--native-shop-end,0px)); overflow-y:scroll; overflow-x:hidden; overflow-anchor:none; overscroll-behavior:contain; pointer-events:auto; }',
				'.cattail-native-category-rail { display:none; position:absolute; left:0; top:0; width:100vw; height:100vh; overflow:hidden; z-index:2; pointer-events:none; }',
				'.cattail-native-accordion .cattail-native-category-rail { display:block; }',
				'.cattail-native-category-shortcut { position:absolute; top:0; left:0; width:4em; height:4em; padding:0; border:0; border-radius:50%; font:inherit; background:#fff center/cover; background-blend-mode:multiply; box-shadow:0 .2em .4em #0001; visibility:hidden; pointer-events:none; transition:transform 240ms ease; }',
				'.cattail-native-category-shortcut.is-present { visibility:visible; }',
				'.cattail-native-category-shortcut.is-visible { pointer-events:auto; cursor:pointer; }',
				'.cattail-native-category-shortcut.is-visible[aria-pressed="true"] { background-color:#ffe978; }',
				'.cattail-native-proxy-away .cattail-native-category-icon { visibility:hidden; }',
				'.cattail-native-shop-scroll::-webkit-scrollbar { width:14px; }',
				'.cattail-native-shop-scroll::-webkit-scrollbar-thumb { border:3px solid transparent; background:#0006; border-radius:12px; background-clip:padding-box; }',
				'.cattail-native-shop-scroll::-webkit-scrollbar-thumb:hover { background-color:#0009; }',
				'.cattail-native-accordion .cattail-native-shop-scroll > .element { width:100%; aspect-ratio:auto; padding:0; margin-bottom:1em; border-radius:0; background:none!important; box-shadow:none!important; cursor:default; pointer-events:none; }',
				'.cattail-native-accordion .cattail-native-shop-scroll > .element.hidden { display:none; }',
				'.cattail-native-category-panel { position:relative; box-sizing:border-box; width:4em; margin-left:auto; padding-top:4em; border-radius:2em; background:#fff; box-shadow:0 .2em .4em #0001; overflow:hidden; pointer-events:auto; transition:width 240ms ease; }',
				'.cattail-native-labels-wide .cattail-native-category-panel { width:100%; }',
				'.cattail-native-accordion .cattail-native-category-label { display:block; position:absolute; right:0; top:0; width:100%; height:4em; box-sizing:border-box; border-radius:0; background:#fff; pointer-events:auto; cursor:pointer; overflow:hidden; }',
				'.cattail-native-accordion .element.closed.dim .cattail-native-category-panel { box-shadow:none; }',
				'.cattail-native-accordion .cattail-native-category-icon { position:absolute; right:0; top:0; width:4em; height:4em; background-size:cover; }',
				'.cattail-native-accordion .cattail-native-category-title { position:absolute; left:1.4em; right:4.4em; height:100%; display:flex; align-items:center; font:600 calc(1.1em * var(--native-title-scale,1)) Montserrat,sans-serif; opacity:0; white-space:nowrap; transition:opacity 240ms ease; }',
				'.cattail-native-accordion.cattail-native-labels-wide .cattail-native-category-title { opacity:1; }',
				'.cattail-native-accordion .element > .dot { z-index:1; pointer-events:none; }',
				'.cattail-native-accordion .element .itemWrap { position:relative; display:grid; grid-template-rows:1fr; gap:0; left:auto; top:auto; transform:none!important; width:100%; max-height:none; padding:0; overflow:visible; border-radius:0; opacity:1; pointer-events:auto; transition:grid-template-rows 240ms ease; }',
				'.cattail-native-accordion .element.closed .itemWrap { grid-template-rows:0fr; padding-top:0; opacity:1; pointer-events:none; }',
				'.cattail-native-category-items { display:flex; flex-direction:column; gap:0; min-height:0; overflow:hidden; }',
				'.cattail-native-accordion .element .itemWrap .item { pointer-events:auto; margin:0; border-radius:0; box-shadow:none; }',
				'.cattail-native-accordion .element .itemWrap .item + .item { border-top:1px solid transparent; }',
				'.cattail-native-accordion .element .itemWrap .item + .item::before { content:""; position:absolute; top:-1px; left:1em; right:1em; border-top:1px solid #8882; pointer-events:none; }',
				'.cattail-native-accordion .element .itemWrap .item.disabled { cursor:default; }',
				'.store.cattail-native-accordion > .element.eraser, .store.cattail-native-accordion > .element.relocator { position:absolute; right:calc(14px + .5em); margin:0; z-index:3; pointer-events:auto; transition:right 240ms ease,top 240ms ease; }',
				'.store.cattail-native-accordion > .element.eraser { top:var(--native-eraser-top,50%); }',
				'.store.cattail-native-accordion > .element.relocator { top:var(--native-relocator-top,50%); }',
				'.store.cattail-native-accordion.cattail-native-tools-aside > .element.eraser, .store.cattail-native-accordion.cattail-native-tools-aside > .element.relocator { right:calc(100% + .7em); }',
				'.store.cattail-native-accordion.cattail-native-tools-aside > .element.eraser { top:var(--native-side-eraser-top,8px); }',
				'.store.cattail-native-accordion.cattail-native-tools-aside > .element.relocator { top:var(--native-side-relocator-top,8px); }',
				'.store.cattail-native-accordion.memory_faded { pointer-events:none; }',
				'.store.cattail-native-accordion.memory_faded * { pointer-events:none!important; }',
				'.cattail-native-shop-restoring .itemWrap, .cattail-native-shop-restoring .cattail-native-category-panel, .cattail-native-shop-restoring .cattail-native-category-shortcut, .cattail-native-shop-restoring > .eraser, .cattail-native-shop-restoring > .relocator { transition:none!important; }'
			].join('\n')
			document.head.append(style)
		}
	}
})
