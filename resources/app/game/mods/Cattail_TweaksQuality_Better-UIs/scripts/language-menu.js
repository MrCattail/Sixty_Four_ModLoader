ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableLanguageMenu', true) === false) return

		let activeSplash = null
		const pageShell = api.ui.pages

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

		pageShell.register({
			id: 'languageMenu',
			prefix: 'cattail-language-menu',
			width: '760px',
			contentClass: 'cattail-language-menu-list',
			scrollbarVisibleClass: 'cattail-language-menu-scrollbar-visible',
			contentHeight: '660px',
			mobileContentHeight: '620px',
			contentOffset: '280px',
			mobileContentOffset: '270px',
			inertialScroll: { friction: .88, directInfluence: .30, tailInfluence: .13, maxVelocity: 34, stopThreshold: .35 },
			findButton(splash) { return findLanguageButton(splash) },
			updateButton(button, ctx) {
				button.innerHTML = ctx.splash?.texts?.language || button.innerHTML
			},
			title(game) { return languageTitle(game?.splash, readWords(game)) },
			backLabel(game) { return backLabel(game) },
			onOpen(ctx) {
				activeSplash = ctx.splash
				pageShell.resetViewportScroll()
			},
			onClose() {
				activeSplash = null
				pageShell.resetViewportScroll()
			},
			renderContent(ctx) {
				activeSplash = ctx.splash
				renderLanguageContent(ctx)
			},
			onAfterRender(ctx) {
				const selected = ctx.content?.querySelector('.cattail-language-menu-option-selected')
				if (typeof ctx.options?.scrollTop !== 'number') centerSelectedOption(ctx.content, selected)
				pageShell.resetViewportScroll()
			}
		})

		api.on('afterVanillaScripts', function () {
			installStyles()
		})

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

		function renderLanguageContent(ctx) {
			const game = ctx.game
			const words = readWords(game)
			const rawLanguages = Array.isArray(game?.languages) ? game.languages : []
			const languages = rawLanguages
				.map(function (id, index) { return { id, index } })
				.filter(function (entry) { return languageIsAvailable(words, entry.id) })

			for (const entry of languages) {
				ctx.content.append(renderLanguageOption(ctx.splash, words, entry.id, entry.index))
			}
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

		function languageIsAvailable(words, id) {
			if (!id) return false
			if (!words || !Object.keys(words).length) return true
			return !!words?.[id]?.splash?.language
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
