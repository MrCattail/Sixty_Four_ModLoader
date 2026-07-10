ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableLanguageMenu', true) === false) return

		let activeSplash = null

		const fallbackLanguageLabels = {
			en: 'English',
			ru: 'Russian',
			de: 'Deutsch',
			ptbr: 'Portuguese BR',
			it: 'Italiano',
			es: 'Espanol',
			fr: 'Francais',
			nl: 'Nederlands',
			cz: 'Cestina',
			pl: 'Polski',
			jp: 'Japanese',
			kr: 'Korean',
			sch: 'Simplified Chinese',
			tch: 'Traditional Chinese',
			thai: 'Thai',
			hu: 'Magyar',
			lv: 'Latviesu',
			ro: 'Romana',
			no: 'Norsk',
			modsch: 'Simplified Chinese Plus'
		}

		api.on('afterVanillaScripts', function () {
			if (typeof Splash === 'undefined' || typeof Game === 'undefined') return

			installStyles()
			patchSplash(api, 'init')
			patchSplash(api, 'initMobile')
			window.addEventListener('keydown', handleEscape, true)

			api.patch(Game.prototype, 'changeLanguage', function (original) {
				return function (id) {
					const wasOpen = this.splash?.element?.classList.contains('cattail-language-menu-active')
					const scrollTop = wasOpen ? this.splash.element.querySelector('.cattail-language-menu-list')?.scrollTop : null
					const result = original.call(this, id)
					if (wasOpen) showLanguagePage(this.splash, { scrollTop })
					else refreshLanguageButton(this.splash)
					return result
				}
			})
		})

		function patchSplash(api, methodName) {
			api.patch(Splash.prototype, methodName, function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					attachLanguageMenu(this)
					return result
				}
			})
		}

		function attachLanguageMenu(splash) {
			const button = findLanguageButton(splash)
			if (!button) return

			button.classList.add('cattail-language-menu-button')
			button.innerHTML = splash.texts?.language || button.innerHTML

			if (button.dataset.cattailLanguageMenu === '1') return
			button.dataset.cattailLanguageMenu = '1'

			const open = function (event) {
				event?.preventDefault()
				event?.stopPropagation()
				showLanguagePage(splash)
			}

			button.onclick = open
			button.ontouchstart = open
		}

		function refreshLanguageButton(splash) {
			if (!splash?.element) return
			const button = findLanguageButton(splash)
			if (!button) return
			button.classList.add('cattail-language-menu-button')
			button.innerHTML = splash.texts?.language || button.innerHTML
			if (button.dataset.cattailLanguageMenu !== '1') attachLanguageMenu(splash)
		}

		function findLanguageButton(splash) {
			const item = Array.isArray(splash?.items) ? splash.items[2] : null
			if (item?.classList?.contains('menuItem')) return item

			const menu = splash?.element?.querySelector('.menu')
			if (!menu) return null

			const expected = normalizeText(splash.texts?.language)
			if (!expected) return null

			for (const candidate of menu.querySelectorAll('.menuItem')) {
				if (normalizeText(candidate.innerHTML) === expected) return candidate
			}
			return null
		}

		function showLanguagePage(splash, options = {}) {
			if (!splash?.element) return

			let page = splash.element.querySelector('.cattail-language-menu-page')
			if (!page) {
				page = document.createElement('div')
				page.className = 'cattail-language-menu-page'
				splash.element.append(page)
			}

			activeSplash = splash
			splash.element.classList.add('cattail-language-menu-active')
			splash.selected = false
			resetViewportScroll()
			renderLanguagePage(splash, page, options)
		}

		function hideLanguagePage(splash) {
			if (!splash?.element) return
			splash.element.classList.remove('cattail-language-menu-active')
			splash.element.querySelector('.cattail-language-menu-page')?.remove()
			resetViewportScroll()
			if (activeSplash === splash) activeSplash = null
		}

		function handleEscape(event) {
			if (!activeSplash?.element?.classList.contains('cattail-language-menu-active')) return
			if (event.key !== 'Escape' && event.keyCode !== 27) return
			event.preventDefault()
			event.stopPropagation()
			hideLanguagePage(activeSplash)
		}

		function renderLanguagePage(splash, page, options = {}) {
			const game = splash.master
			const words = readWords(game)
			const languages = Array.isArray(game?.languages) ? game.languages : []
			page.innerHTML = ''

			const brand = document.createElement('div')
			brand.className = 'cattail-language-menu-brand'
			const logoLeft = document.createElement('div')
			logoLeft.className = 'cattail-language-menu-logo'
			logoLeft.textContent = 'SIXTY'
			const logoMark = document.createElement('div')
			logoMark.className = 'cattail-language-menu-logo-mark'
			logoMark.style.backgroundPosition = splash.sf?.style.backgroundPosition || '0 0'
			const logoRight = document.createElement('div')
			logoRight.className = 'cattail-language-menu-logo'
			logoRight.textContent = 'FOUR'
			brand.append(logoLeft, logoMark, logoRight)
			page.append(brand)

			const subtitle = document.createElement('div')
			subtitle.className = 'cattail-language-menu-subtitle'
			subtitle.textContent = languageTitle(splash, words)
			page.append(subtitle)

			const list = document.createElement('div')
			list.className = 'cattail-language-menu-list'
			installTransientScrollbar(list)
			installInertialScroll(list)

			for (let index = 0; index < languages.length; index++) {
				const id = languages[index]
				if (!id) continue
				list.append(renderLanguageOption(splash, words, id, index))
			}

			page.append(list)

			const back = document.createElement('button')
			back.type = 'button'
			back.className = 'cattail-language-menu-back'
			back.textContent = backLabel(game)
			back.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				hideLanguagePage(splash)
			}
			back.ontouchstart = back.onclick
			page.append(back)

			const selected = list.querySelector('.cattail-language-menu-option-selected')
			if (typeof options.scrollTop === 'number') restoreListScroll(list, options.scrollTop)
			else centerSelectedOption(list, selected)
			resetViewportScroll()
		}

		function centerSelectedOption(list, selected) {
			if (!list || !selected) return
			const listRect = list.getBoundingClientRect()
			const selectedRect = selected.getBoundingClientRect()
			const selectedTop = selectedRect.top - listRect.top + list.scrollTop
			const target = selectedTop - (list.clientHeight - selected.offsetHeight) / 2
			const max = Math.max(0, list.scrollHeight - list.clientHeight)
			list.scrollTop = Math.min(max, Math.max(0, target))
		}

		function restoreListScroll(list, scrollTop) {
			if (!list) return
			const max = Math.max(0, list.scrollHeight - list.clientHeight)
			list.scrollTop = Math.min(max, Math.max(0, scrollTop))
		}

		function resetViewportScroll() {
			if (document?.documentElement) document.documentElement.scrollTop = 0
			if (document?.body) document.body.scrollTop = 0
			if (typeof window?.scrollTo === 'function') window.scrollTo(0, 0)
		}

		function renderLanguageOption(splash, words, id, index) {
			const game = splash.master
			const selected = index === game.languageId || id === game.language
			const option = document.createElement('button')
			option.type = 'button'
			option.className = 'cattail-language-menu-option'
			if (selected) option.classList.add('cattail-language-menu-option-selected')
			option.dataset.languageId = id
			option.setAttribute('aria-pressed', selected ? 'true' : 'false')

			const name = document.createElement('span')
			name.className = 'cattail-language-menu-option-name'
			name.textContent = languageOptionLabel(words, id)

			const code = document.createElement('span')
			code.className = 'cattail-language-menu-option-code'
			code.textContent = languageCodeLabel(id)

			option.append(name, code)

			const choose = function (event) {
				event.preventDefault()
				event.stopPropagation()
				if (index !== game.languageId) game.changeLanguage(index)
			}
			option.onclick = choose
			option.ontouchstart = choose

			return option
		}

		function readWords(game) {
			if (typeof abstract_getWords !== 'function') return {}
			try {
				const words = abstract_getWords()
				return window.ModLoader?.applyWords(words, game) || words
			} catch (error) {
				console.warn('[Language Menu] Could not read language labels.', error)
				return {}
			}
		}

		function languageTitle(splash, words) {
			const current = splash?.master?.language || 'en'
			const source = splash?.texts?.language || words?.[current]?.splash?.language
			return splitLanguageLine(source).prefix || 'LANGUAGE'
		}

		function languageOptionLabel(words, id) {
			const split = splitLanguageLine(words?.[id]?.splash?.language)
			return split.value || fallbackLanguageLabels[id] || languageCodeLabel(id)
		}

		function splitLanguageLine(value) {
			const text = normalizeText(value)
			const match = text.match(/^(.+?)\s*[:：]\s*(.+)$/)
			if (!match) return { prefix: '', value: text }
			return { prefix: match[1].trim(), value: match[2].trim() }
		}

		function normalizeText(value) {
			return String(value || '')
				.replace(/<[^>]*>/g, '')
				.replace(/&nbsp;/gi, ' ')
				.replace(/\s+/g, ' ')
				.trim()
		}

		function backLabel(game) {
			try {
				return normalizeText(game?.pronounce?.('splash', 'deglory')) || 'BACK'
			} catch (error) {
				return 'BACK'
			}
		}

		function languageCodeLabel(id) {
			return String(id || '').replace(/[^a-z0-9_-]/gi, '').toUpperCase()
		}

		function installTransientScrollbar(list) {
			let timer
			const reveal = function () {
				list.classList.add('cattail-language-menu-scrollbar-visible')
				clearTimeout(timer)
				timer = setTimeout(function () {
					list.classList.remove('cattail-language-menu-scrollbar-visible')
				}, 900)
			}
			list.onwheel = reveal
			list.onscroll = reveal
			list.onpointerdown = reveal
		}

		function installInertialScroll(list) {
			let velocity = 0
			let frame = 0
			const friction = .88
			const directInfluence = .30
			const tailInfluence = .13
			const maxVelocity = 34

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
				if (Math.abs(velocity) < .35) {
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
			list.addEventListener('wheel', function (event) {
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
			}, { passive: false })
			list.addEventListener('pointerdown', stop, true)
		}

		function normalizeWheelDelta(event, list) {
			if (event.deltaMode === 1) return event.deltaY * 32
			if (event.deltaMode === 2) return event.deltaY * list.clientHeight
			return event.deltaY
		}

		function installStyles() {
			if (document.getElementById('cattail-language-menu-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-language-menu-style'
			style.textContent = `
				.splash.cattail-language-menu-active { background:#000000F9; color:#fff; }
				.splash.cattail-language-menu-active .menu,
				.splash.cattail-language-menu-active .credit,
				.splash.cattail-language-menu-active .publisher,
				.splash.cattail-language-menu-active .flashlight,
				.splash.cattail-language-menu-active .chill,
				.splash.cattail-language-menu-active .fullscreen,
				.splash.cattail-language-menu-active .discord,
				.splash.cattail-language-menu-active .backupVessel,
				.splash.cattail-language-menu-active .gloryButton,
				.splash.cattail-language-menu-active > .headerBox,
				.splash.cattail-language-menu-active > .sixtyFour { display:none !important; }
				.cattail-language-menu-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
				.cattail-language-menu-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
				.cattail-language-menu-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
				.cattail-language-menu-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
				.cattail-language-menu-subtitle { margin:0 auto 24px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; text-transform:uppercase; }
				.cattail-language-menu-list { box-sizing:border-box; width:min(760px,100%); height:min(660px,calc(100vh - 280px)); margin:0 auto; padding:2px 24px 10px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
				.cattail-language-menu-list:hover, .cattail-language-menu-list:active, .cattail-language-menu-list.cattail-language-menu-scrollbar-visible { scrollbar-color:#fffc #fff2; }
				.cattail-language-menu-list::-webkit-scrollbar { width:10px; }
				.cattail-language-menu-list::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
				.cattail-language-menu-list::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
				.cattail-language-menu-list:hover::-webkit-scrollbar-track, .cattail-language-menu-list:active::-webkit-scrollbar-track, .cattail-language-menu-list.cattail-language-menu-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
				.cattail-language-menu-list:hover::-webkit-scrollbar-thumb, .cattail-language-menu-list:active::-webkit-scrollbar-thumb, .cattail-language-menu-list.cattail-language-menu-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
				.cattail-language-menu-option { position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:28px; box-sizing:border-box; width:100%; min-height:64px; padding:15px 20px 15px 24px; border:0; border-bottom:1px solid rgba(255,255,255,.38); background:transparent; color:inherit; font:24px/1.25 Montserrat,Arial,sans-serif; letter-spacing:3px; text-align:left; cursor:pointer; transition:background .18s ease,color .18s ease; }
				.cattail-language-menu-option:focus, .cattail-language-menu-back:focus { outline:none; }
				.cattail-language-menu-option:hover, .cattail-language-menu-option-selected { background:rgba(255,255,255,.08); }
				.cattail-language-menu-option:hover .cattail-language-menu-option-name { color:#b56b87; }
				.cattail-language-menu-option-selected:before { content:''; position:absolute; left:0; top:16px; bottom:16px; width:3px; background:#fff; }
				.cattail-language-menu-option-name { min-width:0; overflow-wrap:anywhere; transition:color .18s ease; }
				.cattail-language-menu-option-code { font:15px/1.2 Montserrat,Arial,sans-serif; letter-spacing:2px; color:rgba(255,255,255,.46); white-space:nowrap; }
				.cattail-language-menu-back { appearance:none; display:block; box-sizing:border-box; width:min(760px,100%); margin:22px auto 0; padding:0; border:0; background:transparent; color:inherit; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; cursor:pointer; transition:color .18s ease; }
				.cattail-language-menu-back:hover { color:#b56b87; }
				.splash.mobile .cattail-language-menu-page { padding:5vh 5vw 24px; }
				.splash.mobile .cattail-language-menu-brand { gap:4vw; }
				.splash.mobile .cattail-language-menu-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
				.splash.mobile .cattail-language-menu-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
				.splash.mobile .cattail-language-menu-subtitle { font-size:min(5vw,18px); letter-spacing:min(2vw,6px); }
				.splash.mobile .cattail-language-menu-list { height:min(620px,calc(100vh - 270px)); padding-right:14px; }
				.splash.mobile .cattail-language-menu-option { min-height:58px; padding:13px 10px 13px 18px; gap:14px; font-size:min(5vw,20px); letter-spacing:2px; }
				.splash.mobile .cattail-language-menu-option-code { font-size:min(3.4vw,13px); letter-spacing:1px; }
				.splash.mobile .cattail-language-menu-back { font-size:min(5vw,20px); }
				@media (max-width:860px) { .cattail-language-menu-page { padding-left:5vw; padding-right:5vw; } .cattail-language-menu-logo { font-size:34px; letter-spacing:10px; } .cattail-language-menu-option { font-size:20px; } }
			`
			document.head.append(style)
		}
	}
})
