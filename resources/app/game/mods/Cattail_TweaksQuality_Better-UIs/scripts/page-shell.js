ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		const shell = window.CattailBetterUisPages || createPageShell()
		window.CattailBetterUisPages = shell
		shell.configure(api)

		function createPageShell() {
			const pages = []
			let loaderApi = null
			let installed = false
			let currentGame = null
			let activePage = null
			let activeSplash = null

			const publicApi = {
				configure,
				register,
				open,
				close,
				refresh,
				isActive,
				currentGame() { return activeSplash?.master || currentGame },
				installHorizontalWheel,
				installTransientScrollbar,
				installInertialScroll,
				originalBackLabel,
				normalizeGameText
			}

			function configure(api) {
				if (loaderApi) return
				loaderApi = api
				api.on('afterVanillaScripts', onAfterVanillaScripts)
				api.on('afterGameInit', function (payload, game) {
					currentGame = game || payload
				})
			}

			function register(options) {
				const page = normalizePage(options)
				const index = pages.findIndex(function (item) { return item.id === page.id })
				if (index >= 0) pages[index] = page
				else pages.push(page)
				if (installed && currentGame?.splash) attachPageButton(currentGame.splash, page)
				return {
					open(splash) { open(page.id, splash) },
					close() { close(page.id) },
					refresh() { refresh(page.id) },
					isActive() { return isActive(page.id) }
				}
			}

			function normalizePage(options) {
				if (!options?.id) throw new Error('Better-UIs page registration requires an id.')
				const prefix = options.prefix || ('cattail-' + options.id)
				return Object.assign({
					prefix,
					activeClass: prefix + '-active',
					buttonClass: prefix + '-button',
					pageClass: prefix + '-page',
					contentClass: prefix + '-content',
					scrollbarVisibleClass: prefix + '-scrollbar-visible',
					brandClass: prefix + '-brand',
					logoClass: prefix + '-logo',
					logoMarkClass: prefix + '-logo-mark',
					subtitleClass: prefix + '-subtitle',
					backClass: prefix + '-back',
					width: '760px',
					contentHeight: '560px',
					mobileContentHeight: '610px',
					contentOffset: '335px',
					mobileContentOffset: '310px',
					inertialScroll: false
				}, options)
			}

			function onAfterVanillaScripts() {
				if (installed || typeof Splash === 'undefined' || typeof Game === 'undefined') return
				installed = true
				installStyles()
				patchSplash('init')
				patchSplash('initMobile')
				window.addEventListener('keydown', handleEscape, true)
				loaderApi.patch(Game.prototype, 'changeLanguage', function (original) {
					return function (id) {
						const openPageId = activePage?.id
						const scrollTop = activeSplash?.element?.querySelector('.cattail-better-ui-content')?.scrollTop || 0
						const result = original.call(this, id)
						currentGame = this
						activePage = null
						activeSplash = null
						if (openPageId) {
							const page = findPage(openPageId)
							if (page) showPage(page, this.splash, { scrollTop })
						} else attachAllPages(this.splash)
						return result
					}
				})
			}

			function patchSplash(methodName) {
				loaderApi.patch(Splash.prototype, methodName, function (original) {
					return function (...args) {
						const result = original.apply(this, args)
						currentGame = this.master
						attachAllPages(this)
						return result
					}
				})
			}

			function attachAllPages(splash) {
				if (!splash?.element) return
				for (const page of pages) attachPageButton(splash, page)
			}

			function attachPageButton(splash, page) {
				if (page.enabled && page.enabled(createContext(page, splash)) === false) return
				const existing = splash.element.querySelector('.' + page.buttonClass)
				if (existing) {
					existing.textContent = label(page.menuLabel, splash.master, page.id)
					return
				}
				const menu = splash.element.querySelector('.menu')
				if (!menu) return
				const button = document.createElement('div')
				button.classList.add('menuItem', page.buttonClass)
				button.textContent = label(page.menuLabel, splash.master, page.id)
				const anchor = page.insertBefore ? page.insertBefore(splash, menu) : menu.querySelector('.resetProgressbar')?.closest('.menuItem')
				if (anchor) menu.insertBefore(button, anchor)
				else menu.append(button)
				const openPage = function (event) {
					event?.preventDefault()
					event?.stopPropagation()
					showPage(page, splash)
				}
				button.onclick = openPage
				button.ontouchstart = openPage
				if (Array.isArray(splash.items)) {
					const anchorIndex = anchor ? splash.items.indexOf(anchor) : -1
					if (anchorIndex >= 0) splash.items.splice(anchorIndex, 0, button)
					else splash.items.push(button)
				}
			}

			function open(id, splash) {
				const page = findPage(id)
				if (page) showPage(page, splash || currentGame?.splash)
			}

			function close(id) {
				if (!activePage || (id && activePage.id !== id)) return
				hidePage(activePage, activeSplash)
			}

			function refresh(id) {
				if (activePage && (!id || activePage.id === id)) {
					renderPage(activePage, activeSplash, activeSplash?.element?.querySelector('.' + activePage.pageClass))
					return
				}
				if (currentGame?.splash) attachAllPages(currentGame.splash)
			}

			function isActive(id) {
				return !!activePage && activePage.id === id
			}

			function showPage(page, splash, options = {}) {
				if (!splash?.element) return
				if (activePage && (activePage.id !== page.id || activeSplash !== splash)) hidePage(activePage, activeSplash)
				let pageElement = splash.element.querySelector('.' + page.pageClass)
				if (!pageElement) {
					pageElement = document.createElement('div')
					pageElement.className = classNames('cattail-better-ui-page', page.pageClass)
					splash.element.append(pageElement)
				}
				activePage = page
				activeSplash = splash
				currentGame = splash.master
				splash.element.classList.add('cattail-better-ui-active', page.activeClass)
				splash.selected = false
				page.onOpen?.(createContext(page, splash, pageElement))
				renderPage(page, splash, pageElement, options)
			}

			function hidePage(page, splash) {
				page?.onClose?.(createContext(page, splash))
				if (splash?.element) {
					splash.element.classList.remove('cattail-better-ui-active', page.activeClass)
					splash.element.querySelector('.' + page.pageClass)?.remove()
				}
				if (activePage?.id === page?.id) {
					activePage = null
					activeSplash = null
				}
			}

			function renderPage(page, splash, pageElement, options = {}) {
				if (!pageElement || !splash) return
				const previousScrollTop = options.scrollTop ?? pageElement.querySelector('.cattail-better-ui-content')?.scrollTop ?? 0
				setPageVariables(page, pageElement)
				pageElement.innerHTML = ''
				pageElement.append(renderBrand(page, splash))
				const subtitle = document.createElement('div')
				subtitle.className = classNames('cattail-better-ui-subtitle', page.subtitleClass)
				subtitle.textContent = label(page.title, splash.master, page.id)
				pageElement.append(subtitle)
				appendNodes(pageElement, page.renderBeforeContent?.(createContext(page, splash, pageElement)))
				const content = document.createElement('div')
				content.className = classNames('cattail-better-ui-content', page.contentClass)
				installTransientScrollbar(content, page.scrollbarVisibleClass)
				if (page.inertialScroll) installInertialScroll(content, page.inertialScroll)
				const ctx = createContext(page, splash, pageElement, content)
				appendNodes(content, page.renderContent?.(ctx))
				pageElement.append(content)
				if (previousScrollTop > 0) content.scrollTop = previousScrollTop
				const back = document.createElement('button')
				back.type = 'button'
				back.className = classNames('cattail-better-ui-back', page.backClass)
				back.textContent = label(page.backLabel, splash.master, originalBackLabel(splash.master) || 'BACK')
				back.onclick = function (event) {
					event.preventDefault()
					event.stopPropagation()
					hidePage(page, splash)
				}
				back.ontouchstart = back.onclick
				pageElement.append(back)
				page.onAfterRender?.(ctx)
			}

			function renderBrand(page, splash) {
				const brand = document.createElement('div')
				brand.className = classNames('cattail-better-ui-brand', page.brandClass)
				const left = document.createElement('div')
				left.className = classNames('cattail-better-ui-logo', page.logoClass)
				left.textContent = 'SIXTY'
				const mark = document.createElement('div')
				mark.className = classNames('cattail-better-ui-logo-mark', page.logoMarkClass)
				mark.style.backgroundPosition = splash.sf?.style.backgroundPosition || '0 0'
				const right = document.createElement('div')
				right.className = classNames('cattail-better-ui-logo', page.logoClass)
				right.textContent = 'FOUR'
				brand.append(left, mark, right)
				return brand
			}

			function setPageVariables(page, pageElement) {
				pageElement.style.setProperty('--cattail-better-ui-page-width', page.width)
				pageElement.style.setProperty('--cattail-better-ui-content-height', page.contentHeight)
				pageElement.style.setProperty('--cattail-better-ui-mobile-content-height', page.mobileContentHeight)
				pageElement.style.setProperty('--cattail-better-ui-content-offset', page.contentOffset)
				pageElement.style.setProperty('--cattail-better-ui-mobile-content-offset', page.mobileContentOffset)
			}

			function createContext(page, splash, pageElement, content) {
				return {
					id: page.id,
					splash,
					game: splash?.master || currentGame,
					page: pageElement,
					pageElement,
					content,
					shell: publicApi,
					refresh() { refresh(page.id) },
					close() { close(page.id) }
				}
			}

			function handleEscape(event) {
				if (!activePage || event.key !== 'Escape') return
				const ctx = createContext(activePage, activeSplash, activeSplash?.element?.querySelector('.' + activePage.pageClass))
				if (activePage.canCloseOnEscape?.(ctx, event) === false) return
				event.preventDefault()
				event.stopImmediatePropagation()
				hidePage(activePage, activeSplash)
			}

			function findPage(id) {
				return pages.find(function (page) { return page.id === id })
			}

			function label(value, game, fallback) {
				try {
					if (typeof value === 'function') return value(game) || fallback
					return value || fallback
				} catch (error) {
					console.warn('[Better UIs Page Shell] Label failed.', error)
					return fallback
				}
			}

			function appendNodes(parent, value) {
				if (!value) return
				if (Array.isArray(value)) {
					for (const item of value) appendNodes(parent, item)
					return
				}
				if (value instanceof Node) parent.append(value)
			}

			function classNames(...items) {
				return items.filter(Boolean).join(' ')
			}

			function installHorizontalWheel(element) {
				element.addEventListener('wheel', function (event) {
					if (!event.cancelable) return
					const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
					if (!amount) return
					event.preventDefault()
					element.scrollLeft += amount
				}, { passive: false })
			}

			function installTransientScrollbar(list, visibleClass) {
				let timer
				const reveal = function () {
					list.classList.add('cattail-better-ui-scrollbar-visible')
					if (visibleClass) list.classList.add(visibleClass)
					clearTimeout(timer)
					timer = setTimeout(function () {
						list.classList.remove('cattail-better-ui-scrollbar-visible')
						if (visibleClass) list.classList.remove(visibleClass)
					}, 900)
				}
				list.onwheel = reveal
				list.onscroll = reveal
				list.onpointerdown = reveal
			}

			function installInertialScroll(list, options = {}) {
				if (!list) return function () {}
				if (list.__cattailBetterUiInertialScrollStop) list.__cattailBetterUiInertialScrollStop()
				const settings = options === true ? {} : options || {}
				let velocity = 0
				let frame = 0
				const friction = numericSetting(settings.friction, .88)
				const directInfluence = numericSetting(settings.directInfluence, .30)
				const tailInfluence = numericSetting(settings.tailInfluence, .13)
				const maxVelocity = numericSetting(settings.maxVelocity, 34)
				const stopThreshold = numericSetting(settings.stopThreshold, .35)

				const clamp = function (value) {
					const max = Math.max(0, list.scrollHeight - list.clientHeight)
					return Math.min(max, Math.max(0, value))
				}
				const clampVelocity = function (value) {
					return Math.min(maxVelocity, Math.max(-maxVelocity, value))
				}
				const stop = function () {
					velocity = 0
					if (frame) cancelAnimationFrame(frame)
					frame = 0
				}
				const animate = function () {
					frame = 0
					if (Math.abs(velocity) < stopThreshold) {
						velocity = 0
						return
					}
					const before = list.scrollTop
					list.scrollTop = clamp(before + velocity)
					if (list.scrollTop === before) {
						velocity = 0
						return
					}
					velocity *= friction
					frame = requestAnimationFrame(animate)
				}
				const onWheel = function (event) {
					if (!event.cancelable || event.ctrlKey) return
					const delta = normalizeWheelDelta(event, list)
					if (!delta) return
					event.preventDefault()
					const before = list.scrollTop
					list.scrollTop = clamp(before + delta * directInfluence)
					if (list.scrollTop === before) {
						velocity = 0
						return
					}
					velocity = clampVelocity(velocity + delta * tailInfluence)
					if (!frame) frame = requestAnimationFrame(animate)
				}
				list.addEventListener('wheel', onWheel, { passive: false })
				list.addEventListener('pointerdown', stop, true)
				const cleanup = function () {
					stop()
					list.removeEventListener('wheel', onWheel)
					list.removeEventListener('pointerdown', stop, true)
					if (list.__cattailBetterUiInertialScrollStop === cleanup) delete list.__cattailBetterUiInertialScrollStop
				}
				list.__cattailBetterUiInertialScrollStop = cleanup
				return cleanup
			}

			function normalizeWheelDelta(event, list) {
				if (event.deltaMode === 1) return event.deltaY * 32
				if (event.deltaMode === 2) return event.deltaY * list.clientHeight
				return event.deltaY
			}

			function numericSetting(value, fallback) {
				return Number.isFinite(value) ? value : fallback
			}
			function originalBackLabel(game) {
				try {
					return normalizeGameText(game?.pronounce?.('splash', 'deglory'))
				} catch (error) {
					return ''
				}
			}

			function normalizeGameText(value) {
				const raw = String(value || '').trim()
				if (!raw) return ''
				const box = document.createElement('div')
				box.innerHTML = raw
				return (box.textContent || box.innerText || raw).trim()
			}

			function installStyles() {
				if (document.getElementById('cattail-better-ui-page-shell-style')) return
				const style = document.createElement('style')
				style.id = 'cattail-better-ui-page-shell-style'
				style.textContent = `
					.splash.cattail-better-ui-active { background:#000000F9; color:#fff; }
					.splash.cattail-better-ui-active .menu,
					.splash.cattail-better-ui-active .credit,
					.splash.cattail-better-ui-active .publisher,
					.splash.cattail-better-ui-active .flashlight,
					.splash.cattail-better-ui-active .chill,
					.splash.cattail-better-ui-active .fullscreen,
					.splash.cattail-better-ui-active .discord,
					.splash.cattail-better-ui-active .backupVessel,
					.splash.cattail-better-ui-active .gloryButton,
					.splash.cattail-better-ui-active > .headerBox,
					.splash.cattail-better-ui-active > .sixtyFour { display:none !important; }
					.cattail-better-ui-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
					.cattail-better-ui-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
					.cattail-better-ui-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
					.cattail-better-ui-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
					.cattail-better-ui-subtitle { margin:0 auto 20px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; text-transform:uppercase; }
					.cattail-better-ui-content { box-sizing:border-box; width:min(var(--cattail-better-ui-page-width,760px),100%); height:min(var(--cattail-better-ui-content-height,560px),calc(100vh - var(--cattail-better-ui-content-offset,335px))); margin:0 auto; padding:10px 24px 14px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
					.cattail-better-ui-content:hover, .cattail-better-ui-content:active, .cattail-better-ui-content.cattail-better-ui-scrollbar-visible { scrollbar-color:#fffc #fff2; }
					.cattail-better-ui-content::-webkit-scrollbar { width:10px; }
					.cattail-better-ui-content::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
					.cattail-better-ui-content::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
					.cattail-better-ui-content:hover::-webkit-scrollbar-track, .cattail-better-ui-content:active::-webkit-scrollbar-track, .cattail-better-ui-content.cattail-better-ui-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
					.cattail-better-ui-content:hover::-webkit-scrollbar-thumb, .cattail-better-ui-content:active::-webkit-scrollbar-thumb, .cattail-better-ui-content.cattail-better-ui-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
					.cattail-better-ui-back { appearance:none; display:block; box-sizing:border-box; width:min(var(--cattail-better-ui-page-width,760px),100%); margin:22px auto 0; padding:0; border:0; background:transparent; color:inherit; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; cursor:pointer; transition:color .18s ease; }
					.cattail-better-ui-back:hover { color:#b56b87; }
					.splash.mobile .cattail-better-ui-page { padding:5vh 5vw 24px; }
					.splash.mobile .cattail-better-ui-brand { gap:4vw; }
					.splash.mobile .cattail-better-ui-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
					.splash.mobile .cattail-better-ui-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
					.splash.mobile .cattail-better-ui-subtitle { font-size:min(5vw,18px); letter-spacing:min(2vw,6px); }
					.splash.mobile .cattail-better-ui-content { height:min(var(--cattail-better-ui-mobile-content-height,610px),calc(100vh - var(--cattail-better-ui-mobile-content-offset,310px))); padding-right:14px; }
					.splash.mobile .cattail-better-ui-back { font-size:min(5vw,20px); }
					@media (max-width:860px) { .cattail-better-ui-page { padding-left:5vw; padding-right:5vw; } .cattail-better-ui-logo { font-size:34px; letter-spacing:10px; } }
				`
				document.head.append(style)
			}

			return publicApi
		}
	}
})