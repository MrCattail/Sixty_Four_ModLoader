ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableSettingsPage', true) === false) return

		let activeSplash = null
		let currentGame = null
		let activeTab = 'game'
		let pendingBinding = null
		let pendingCodes = []
		let bindingNotice = ''
		const pressedByAction = {}

		const tabs = ['game', 'video', 'sound', 'keyboard', 'controller', 'mod']
		const storagePrefix = 'cattailBetterUisSettingsBindings'

		const keyActions = [
			{ id: 'moveUp', label: 'moveUp', defaultCodes: ['KeyW', 'ArrowUp'], kind: 'movement', mapIndex: 0 },
			{ id: 'moveRight', label: 'moveRight', defaultCodes: ['KeyD', 'ArrowRight'], kind: 'movement', mapIndex: 1 },
			{ id: 'moveDown', label: 'moveDown', defaultCodes: ['KeyS', 'ArrowDown'], kind: 'movement', mapIndex: 2 },
			{ id: 'moveLeft', label: 'moveLeft', defaultCodes: ['KeyA', 'ArrowLeft'], kind: 'movement', mapIndex: 3 },
			{ id: 'zoomReset', label: 'zoomReset', defaultCodes: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'], kind: 'zoomReset' },
			{ id: 'copyBuilding', label: 'copyBuilding', defaultCodes: ['KeyQ'], kind: 'method', method: 'processQ' },
			{ id: 'moveBuilding', label: 'moveBuilding', defaultCodes: ['KeyE'], kind: 'method', method: 'processE' }
		]

		const codeLabels = {
			ArrowUp: 'Up',
			ArrowRight: 'Right',
			ArrowDown: 'Down',
			ArrowLeft: 'Left',
			ControlLeft: 'L Ctrl',
			ControlRight: 'R Ctrl',
			ShiftLeft: 'L Shift',
			ShiftRight: 'R Shift',
			AltLeft: 'L Alt',
			AltRight: 'R Alt',
			MetaLeft: 'L Meta',
			MetaRight: 'R Meta',
			Space: 'Space',
			Escape: 'Esc',
			Enter: 'Enter',
			Backspace: 'Backspace',
			Tab: 'Tab'
		}
		const labelMap = {
			en: {
				menu: 'Settings', title: 'Settings', back: 'Back', empty: 'No settings yet.',
				game: 'Game', video: 'Video', sound: 'Sound', keyboard: 'Keyboard', controller: 'Controller', mod: 'Mod',
				masterVolume: 'Master volume', keyBindings: 'Key bindings', change: 'Change', reset: 'Default', waiting: 'Press keys, then Del to save. Esc cancels.', delToSave: 'Del to save', emptyBinding: 'Press at least one key before Del.', keyInUse: '{key} is already used by {action}.',
				moveUp: 'Camera up', moveRight: 'Camera right', moveDown: 'Camera down', moveLeft: 'Camera left', zoomReset: 'Reset camera zoom', copyBuilding: 'Copy building', moveBuilding: 'Move building'
			},
			zh: {
				menu: '\u8bbe\u7f6e', title: '\u8bbe\u7f6e', back: '\u8fd4\u56de', empty: '\u6682\u65f6\u6ca1\u6709\u8bbe\u7f6e\u3002',
				game: '\u6e38\u620f', video: '\u753b\u9762', sound: '\u58f0\u97f3', keyboard: '\u952e\u76d8', controller: '\u624b\u67c4', mod: 'Mod',
				masterVolume: '\u4e3b\u97f3\u91cf', keyBindings: '\u6309\u952e\u4fee\u6539', change: '\u4fee\u6539', reset: '\u9ed8\u8ba4', waiting: '\u4f9d\u6b21\u6309\u4e0b\u6309\u952e\uff0c\u7136\u540e\u6309 Del \u4fdd\u5b58\u3002Esc \u53d6\u6d88\u3002', delToSave: 'Del \u4fdd\u5b58', emptyBinding: '\u6309 Del \u4fdd\u5b58\u524d\u81f3\u5c11\u6309\u4e00\u4e2a\u952e\u3002', keyInUse: '{key} \u5df2\u88ab {action} \u4f7f\u7528\u3002',
				moveUp: '\u955c\u5934\u5411\u4e0a', moveRight: '\u955c\u5934\u5411\u53f3', moveDown: '\u955c\u5934\u5411\u4e0b', moveLeft: '\u955c\u5934\u5411\u5de6', zoomReset: '\u91cd\u7f6e\u955c\u5934\u8fdc\u8fd1', copyBuilding: '\u590d\u5236\u5efa\u7b51', moveBuilding: '\u79fb\u52a8\u5efa\u7b51'
			},
			tch: {
				menu: '\u8a2d\u5b9a', title: '\u8a2d\u5b9a', back: '\u8fd4\u56de', empty: '\u66ab\u6642\u6c92\u6709\u8a2d\u5b9a\u3002',
				game: '\u904a\u6232', video: '\u756b\u9762', sound: '\u8072\u97f3', keyboard: '\u9375\u76e4', controller: '\u624b\u67c4', mod: 'Mod',
				masterVolume: '\u4e3b\u97f3\u91cf', keyBindings: '\u6309\u9375\u4fee\u6539', change: '\u4fee\u6539', reset: '\u9810\u8a2d', waiting: '\u4f9d\u6b21\u6309\u4e0b\u6309\u9375\uff0c\u7136\u5f8c\u6309 Del \u5132\u5b58\u3002Esc \u53d6\u6d88\u3002', delToSave: 'Del \u5132\u5b58', emptyBinding: '\u6309 Del \u5132\u5b58\u524d\u81f3\u5c11\u6309\u4e00\u500b\u9375\u3002', keyInUse: '{key} \u5df2\u88ab {action} \u4f7f\u7528\u3002',
				moveUp: '\u93e1\u982d\u5411\u4e0a', moveRight: '\u93e1\u982d\u5411\u53f3', moveDown: '\u93e1\u982d\u5411\u4e0b', moveLeft: '\u93e1\u982d\u5411\u5de6', zoomReset: '\u91cd\u8a2d\u93e1\u982d\u9060\u8fd1', copyBuilding: '\u8907\u88fd\u5efa\u7bc9', moveBuilding: '\u79fb\u52d5\u5efa\u7bc9'
			}
		}

		api.on('afterVanillaScripts', function () {
			if (typeof Splash === 'undefined' || typeof Game === 'undefined') return

			installStyles()
			patchSplash(api, 'init')
			patchSplash(api, 'initMobile')
			window.addEventListener('keydown', handleKeyDown, true)
			window.addEventListener('keyup', handleKeyUp, true)

			api.patch(Game.prototype, 'changeLanguage', function (original) {
				return function (id) {
					const wasOpen = this.splash?.element?.classList.contains('cattail-settings-active')
					const result = original.call(this, id)
					if (wasOpen) showSettingsPage(this.splash)
					else refreshSettingsButton(this.splash)
					return result
				}
			})
		})

		api.on('afterGameInit', function (payload, game) {
			currentGame = game || payload
		})

		function patchSplash(api, methodName) {
			api.patch(Splash.prototype, methodName, function (original) {
				return function (...args) {
					const result = original.apply(this, args)
					currentGame = this.master
					attachSettingsMenu(this)
					return result
				}
			})
		}

		function attachSettingsMenu(splash) {
			if (!splash?.element) return
			const existing = splash.element.querySelector('.cattail-settings-button')
			if (existing) {
				refreshSettingsButton(splash)
				return
			}
			const menu = splash.element.querySelector('.menu')
			if (!menu) return

			const button = document.createElement('div')
			button.classList.add('menuItem', 'cattail-settings-button')
			button.textContent = text(splash.master, 'menu')

			const reset = menu.querySelector('.resetProgressbar')?.closest('.menuItem')
			if (reset) menu.insertBefore(button, reset)
			else menu.append(button)

			const open = function (event) {
				event?.preventDefault()
				event?.stopPropagation()
				showSettingsPage(splash)
			}
			button.onclick = open
			button.ontouchstart = open

			if (Array.isArray(splash.items)) {
				const resetIndex = reset ? splash.items.indexOf(reset) : -1
				if (resetIndex >= 0) splash.items.splice(resetIndex, 0, button)
				else splash.items.push(button)
			}
		}

		function refreshSettingsButton(splash) {
			const button = splash?.element?.querySelector('.cattail-settings-button')
			if (button) button.textContent = text(splash.master, 'menu')
			const page = splash?.element?.querySelector('.cattail-settings-page')
			if (page) renderSettingsPage(splash, page)
		}

		function showSettingsPage(splash) {
			if (!splash?.element) return
			let page = splash.element.querySelector('.cattail-settings-page')
			if (!page) {
				page = document.createElement('div')
				page.className = 'cattail-settings-page'
				splash.element.append(page)
			}
			activeSplash = splash
			currentGame = splash.master
			splash.element.classList.add('cattail-settings-active')
			splash.selected = false
			renderSettingsPage(splash, page)
		}

		function hideSettingsPage(splash) {
			pendingBinding = null
			pendingCodes = []
			bindingNotice = ''
			if (!splash?.element) return
			splash.element.classList.remove('cattail-settings-active')
			splash.element.querySelector('.cattail-settings-page')?.remove()
			if (activeSplash === splash) activeSplash = null
		}

		function renderSettingsPage(splash, page) {
			const game = splash.master
			const previousScrollTop = page.querySelector('.cattail-settings-content')?.scrollTop || 0
			page.innerHTML = ''

			page.append(renderBrand(splash))
			const subtitle = document.createElement('div')
			subtitle.className = 'cattail-settings-subtitle'
			subtitle.textContent = text(game, 'title')
			page.append(subtitle)

			const tabBar = document.createElement('div')
			tabBar.className = 'cattail-settings-tabs'
			installHorizontalWheel(tabBar)
			for (const id of tabs) tabBar.append(renderTab(game, id, page, splash))
			page.append(tabBar)

			const rule = document.createElement('div')
			rule.className = 'cattail-settings-rule'
			page.append(rule)

			const content = document.createElement('div')
			content.className = 'cattail-settings-content'
			installTransientScrollbar(content)
			renderTabContent(splash, page, content)
			page.append(content)
			if (previousScrollTop > 0) content.scrollTop = previousScrollTop

			const back = document.createElement('button')
			back.type = 'button'
			back.className = 'cattail-settings-back'
			back.textContent = text(game, 'back')
			back.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				hideSettingsPage(splash)
			}
			back.ontouchstart = back.onclick
			page.append(back)
		}

		function renderBrand(splash) {
			const brand = document.createElement('div')
			brand.className = 'cattail-settings-brand'
			const left = document.createElement('div')
			left.className = 'cattail-settings-logo'
			left.textContent = 'SIXTY'
			const mark = document.createElement('div')
			mark.className = 'cattail-settings-logo-mark'
			mark.style.backgroundPosition = splash.sf?.style.backgroundPosition || '0 0'
			const right = document.createElement('div')
			right.className = 'cattail-settings-logo'
			right.textContent = 'FOUR'
			brand.append(left, mark, right)
			return brand
		}

		function renderTab(game, id, page, splash) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'cattail-settings-tab'
			button.classList.toggle('cattail-settings-tab-active', activeTab === id)
			button.textContent = text(game, id)
			button.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				activeTab = id
				bindingNotice = ''
				pendingBinding = null
				pendingCodes = []
				renderSettingsPage(splash, page)
			}
			return button
		}

		function renderTabContent(splash, page, content) {
			if (activeTab === 'sound') {
				content.append(renderVolumeRow(splash.master))
				return
			}
			if (activeTab === 'keyboard') {
				content.append(renderSectionTitle(splash.master, 'keyBindings'))
				if (bindingNotice) content.append(renderNotice(bindingNotice))
				for (const action of keyActions) content.append(renderKeyBindingRow(splash, page, action))
				return
			}
			content.append(renderEmpty(splash.master))
		}

		function renderSectionTitle(game, key) {
			const title = document.createElement('div')
			title.className = 'cattail-settings-section-title'
			title.textContent = text(game, key)
			return title
		}

		function renderEmpty(game) {
			const empty = document.createElement('div')
			empty.className = 'cattail-settings-empty'
			empty.textContent = text(game, 'empty')
			return empty
		}

		function renderNotice(message) {
			const notice = document.createElement('div')
			notice.className = 'cattail-settings-notice'
			notice.textContent = message
			return notice
		}

		function renderVolumeRow(game) {
			const row = document.createElement('div')
			row.className = 'cattail-settings-row cattail-settings-volume-row'
			const label = document.createElement('div')
			label.className = 'cattail-settings-row-label'
			label.textContent = text(game, 'masterVolume')
			const value = document.createElement('div')
			value.className = 'cattail-settings-row-value'
			const track = document.createElement('div')
			track.className = 'soundBar cattail-settings-volume-track'
			const fill = document.createElement('div')
			fill.className = 'soundSlider cattail-settings-volume-fill'
			track.append(fill)
			const syncVolume = function (v) {
				fill.style.width = 100 * v + '%'
				value.textContent = Math.round(v * 100) + '%'
			}

			const setVolume = function (raw) {
				const v = Math.max(0, Math.min(1, raw))
				game.updateGlobalVolume(v)
				syncVolume(v)
			}
			const applyPointer = function (event) {
				const rect = track.getBoundingClientRect()
				setVolume((event.clientX - rect.left) / rect.width)
			}
			track.addEventListener('pointerdown', function (event) {
				event.preventDefault()
				event.stopPropagation()
				track.setPointerCapture?.(event.pointerId)
				applyPointer(event)
				const move = function (moveEvent) { applyPointer(moveEvent) }
				const up = function () {
					window.removeEventListener('pointermove', move, true)
					window.removeEventListener('pointerup', up, true)
				}
				window.addEventListener('pointermove', move, true)
				window.addEventListener('pointerup', up, true)
			}, true)
			const initial = Math.sqrt(Math.max(0, Math.min(1, game.globalSoundVolume ?? .36)))
			syncVolume(initial)
			row.append(label, track, value)
			return row
		}

		function renderKeyBindingRow(splash, page, action) {
			const game = splash.master
			const bindings = readBindings(game)
			const row = document.createElement('div')
			row.className = 'cattail-settings-row cattail-settings-key-row'
			if (pendingBinding === action.id) row.classList.add('cattail-settings-key-waiting')
			const label = document.createElement('div')
			label.className = 'cattail-settings-row-label'
			label.textContent = text(game, action.label)
			const value = document.createElement('div')
			value.className = 'cattail-settings-row-value cattail-settings-key-value'
			value.textContent = pendingBinding === action.id ? recordingBindingText(game) : formatBinding(bindings[action.id])
			const actions = document.createElement('div')
			actions.className = 'cattail-settings-row-actions'
			const change = actionButton(text(game, 'change'), function () {
				pendingBinding = action.id
				pendingCodes = []
				bindingNotice = ''
				renderSettingsPage(splash, page)
			})
			const reset = actionButton(text(game, 'reset'), function () {
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				resetBinding(game, action.id)
				renderSettingsPage(splash, page)
			})
			actions.append(change, actionSeparator(), reset)
			row.append(label, value, actions)
			return row
		}

		function recordingBindingText(game) {
			if (!pendingCodes.length) return text(game, 'waiting')
			return formatBinding(pendingCodes) + ' | ' + text(game, 'delToSave')
		}
		function actionButton(label, run) {
			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = label
			button.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				run()
			}
			button.ontouchstart = button.onclick
			return button
		}

		function actionSeparator() {
			const separator = document.createElement('span')
			separator.className = 'cattail-settings-action-separator'
			separator.textContent = '|'
			return separator
		}

		function handleKeyDown(event) {
			if (captureBindingKey(event)) return
			if (activeSplash?.element?.classList.contains('cattail-settings-active') && (event.key === 'Escape' || event.keyCode === 27)) {
				event.preventDefault()
				event.stopImmediatePropagation()
				hideSettingsPage(activeSplash)
				return
			}
			const game = currentGame
			if (!shouldHandleGameplayKey(game, event)) return
			const action = currentActionForCode(game, event.code)
			if (action) {
				event.preventDefault()
				event.stopImmediatePropagation()
				runActionDown(game, action, event)
				return
			}
			if (shouldSuppressVanilla(game, event.code)) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
		}

		function handleKeyUp(event) {
			const game = currentGame
			if (!shouldHandleGameplayKey(game, event)) return
			const action = currentActionForCode(game, event.code)
			if (action) {
				event.preventDefault()
				event.stopImmediatePropagation()
				runActionUp(game, action, event)
				return
			}
			if (shouldSuppressVanilla(game, event.code)) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
		}

		function captureBindingKey(event) {
			if (!pendingBinding) return false
			event.preventDefault()
			event.stopImmediatePropagation()
			const game = activeSplash?.master || currentGame
			if (event.key === 'Escape' || event.code === 'Escape') {
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				refreshOpenSettingsPage()
				return true
			}
			if (event.key === 'Delete' || event.code === 'Delete' || event.keyCode === 46) {
				if (!pendingCodes.length) {
					bindingNotice = text(game, 'emptyBinding')
					refreshOpenSettingsPage()
					return true
				}
				setBinding(game, pendingBinding, pendingCodes)
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				refreshOpenSettingsPage()
				return true
			}
			const code = normalizeEventCode(event)
			if (!code) return true
			const conflict = currentActionForCode(game, code, pendingBinding)
			if (conflict) {
				bindingNotice = text(game, 'keyInUse', { key: formatCode(code), action: text(game, conflict.label) })
				refreshOpenSettingsPage()
				return true
			}
			if (pendingCodes.indexOf(code) < 0) pendingCodes.push(code)
			bindingNotice = ''
			refreshOpenSettingsPage()
			return true
		}

		function refreshOpenSettingsPage() {
			if (!activeSplash?.element?.classList.contains('cattail-settings-active')) return
			const page = activeSplash.element.querySelector('.cattail-settings-page')
			if (page) renderSettingsPage(activeSplash, page)
		}

		function shouldHandleGameplayKey(game, event) {
			if (!game || game.splash?.isShown || event.isComposing || event.altKey || event.metaKey) return false
			const target = event.target
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || '')) return false
			return true
		}

		function runActionDown(game, action, event) {
			game.gamepadControl = false
			game.thereWasZoomAction = true
			if (action.kind === 'movement') {
				pressedSet(action.id).add(event.code)
				game.translationMap[action.mapIndex] = 1
				return
			}
			if (action.kind === 'zoomReset') {
				pressedSet(action.id).add(event.code)
				if (!game.zoomWhenShiftPressed) {
					game.zoomWhenShiftPressed = game.zoom
					delete game.thereWasZoomAction
				}
				game.shiftPressed = true
				return
			}
			if (action.kind === 'method' && !event.repeat && typeof game[action.method] === 'function') game[action.method]()
		}

		function runActionUp(game, action, event) {
			if (action.kind === 'movement') {
				pressedSet(action.id).delete(event.code)
				game.translationMap[action.mapIndex] = pressedSet(action.id).size ? 1 : 0
				return
			}
			if (action.kind === 'zoomReset') {
				pressedSet(action.id).delete(event.code)
				if (pressedSet(action.id).size) return
				game.shiftPressed = false
				if (!game.thereWasZoomAction) game.zoom = 1
				delete game.zoomWhenShiftPressed
			}
		}

		function pressedSet(actionId) {
			pressedByAction[actionId] = pressedByAction[actionId] || new Set()
			return pressedByAction[actionId]
		}

		function readBindings(game) {
			let parsed = null
			try { parsed = JSON.parse(localStorage.getItem(bindingStorageKey(game)) || '{}') } catch (error) { parsed = {} }
			const result = {}
			for (const action of keyActions) {
				const stored = Array.isArray(parsed?.[action.id]) ? parsed[action.id].filter(Boolean) : null
				result[action.id] = stored && stored.length ? stored : action.defaultCodes.slice()
			}
			return result
		}

		function writeBindings(game, bindings) {
			localStorage.setItem(bindingStorageKey(game), JSON.stringify(bindings))
		}

		function setBinding(game, actionId, codes) {
			const bindings = readBindings(game)
			bindings[actionId] = codes.slice()
			writeBindings(game, bindings)
		}

		function resetBinding(game, actionId) {
			const bindings = readBindings(game)
			const action = keyActions.find(function (item) { return item.id === actionId })
			if (!action) return
			bindings[actionId] = action.defaultCodes.slice()
			writeBindings(game, bindings)
		}

		function bindingStorageKey(game) {
			return storagePrefix + (game?.steamId || '')
		}

		function currentActionForCode(game, code, exceptActionId) {
			if (!code) return null
			const bindings = readBindings(game)
			for (const action of keyActions) {
				if (action.id === exceptActionId) continue
				if (bindings[action.id]?.indexOf(code) >= 0) return action
			}
			return null
		}

		function defaultActionForCode(code) {
			for (const action of keyActions) if (action.defaultCodes.indexOf(code) >= 0) return action
			return null
		}

		function shouldSuppressVanilla(game, code) {
			const defaultAction = defaultActionForCode(code)
			if (!defaultAction) return false
			const currentAction = currentActionForCode(game, code)
			return !currentAction || currentAction.id !== defaultAction.id
		}

		function normalizeEventCode(event) {
			if (event.code) return event.code
			if (event.key && event.key.length === 1) return 'Key' + event.key.toUpperCase()
			return ''
		}

		function formatBinding(codes) {
			return (codes || []).map(formatCode).join(' / ') || '-'
		}

		function formatCode(code) {
			if (codeLabels[code]) return codeLabels[code]
			if (/^Key[A-Z]$/.test(code)) return code.slice(3)
			if (/^Digit[0-9]$/.test(code)) return code.slice(5)
			return String(code || '').replace(/Left$/, '').replace(/Right$/, '')
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

		function installTransientScrollbar(list) {
			let timer
			const reveal = function () {
				list.classList.add('cattail-settings-scrollbar-visible')
				clearTimeout(timer)
				timer = setTimeout(function () { list.classList.remove('cattail-settings-scrollbar-visible') }, 900)
			}
			list.onwheel = reveal
			list.onscroll = reveal
			list.onpointerdown = reveal
		}

		function text(game, key, values) {
			if (key === 'back') {
				const back = originalBackLabel(game)
				if (back) return back
			}
			const language = game?.language || 'en'
			const group = language === 'sch' || language === 'modsch' ? labelMap.zh : (language === 'tch' ? labelMap.tch : labelMap[language] || labelMap.en)
			let value = group[key] || labelMap.en[key] || key
			return value.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] !== undefined ? values[name] : '' })
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
			if (document.getElementById('cattail-settings-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-settings-style'
			style.textContent = `
				.splash.cattail-settings-active { background:#000000F9; color:#fff; }
				.splash.cattail-settings-active .menu,
				.splash.cattail-settings-active .credit,
				.splash.cattail-settings-active .publisher,
				.splash.cattail-settings-active .flashlight,
				.splash.cattail-settings-active .chill,
				.splash.cattail-settings-active .fullscreen,
				.splash.cattail-settings-active .discord,
				.splash.cattail-settings-active .backupVessel,
				.splash.cattail-settings-active .gloryButton,
				.splash.cattail-settings-active > .headerBox,
				.splash.cattail-settings-active > .sixtyFour { display:none !important; }
				.cattail-settings-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
				.cattail-settings-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
				.cattail-settings-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
				.cattail-settings-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
				.cattail-settings-subtitle { margin:0 auto 20px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; text-transform:uppercase; }
				.cattail-settings-tabs { display:flex; align-items:center; gap:38px; box-sizing:border-box; width:min(1120px,100%); min-height:48px; margin:0 auto; padding:0 0 8px; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
				.cattail-settings-tabs::-webkit-scrollbar { display:none; }
				.cattail-settings-tab { appearance:none; flex:0 0 auto; border:0; background:transparent; color:rgba(255,255,255,.64); font:22px/1.2 Montserrat,Arial,sans-serif; letter-spacing:5px; padding:7px 0 9px; cursor:pointer; transition:color .18s ease,transform .18s ease; }
				.cattail-settings-tab:hover, .cattail-settings-tab-active { color:#fff; }
				.cattail-settings-tab-active { transform:translateY(-1px); }
				.cattail-settings-rule { width:min(1120px,100%); height:1px; margin:0 auto 0; background:rgba(255,255,255,.72); }
				.cattail-settings-content { box-sizing:border-box; width:min(1120px,100%); height:min(560px,calc(100vh - 335px)); margin:0 auto; padding:10px 24px 14px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
				.cattail-settings-content:hover, .cattail-settings-content:active, .cattail-settings-content.cattail-settings-scrollbar-visible { scrollbar-color:#fffc #fff2; }
				.cattail-settings-content::-webkit-scrollbar { width:10px; }
				.cattail-settings-content::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
				.cattail-settings-content::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
				.cattail-settings-content:hover::-webkit-scrollbar-track, .cattail-settings-content:active::-webkit-scrollbar-track, .cattail-settings-content.cattail-settings-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
				.cattail-settings-content:hover::-webkit-scrollbar-thumb, .cattail-settings-content:active::-webkit-scrollbar-thumb, .cattail-settings-content.cattail-settings-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
				.cattail-settings-section-title, .cattail-settings-empty, .cattail-settings-notice { min-height:54px; display:flex; align-items:center; box-sizing:border-box; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,.38); font:20px/1.35 Montserrat,Arial,sans-serif; letter-spacing:3px; color:rgba(255,255,255,.72); }
				.cattail-settings-notice { color:#b56b87; }
				.cattail-settings-row { display:grid; grid-template-columns:minmax(260px,.8fr) minmax(300px,1fr) minmax(180px,.55fr); align-items:center; gap:28px; min-height:78px; box-sizing:border-box; padding:15px 18px; border-bottom:1px solid rgba(255,255,255,.38); transition:background .18s ease; }
				.cattail-settings-row:hover, .cattail-settings-key-waiting { background:rgba(255,255,255,.08); }
				.cattail-settings-row-label { min-width:0; font:600 23px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-settings-row-value { min-width:0; color:rgba(255,255,255,.66); font:18px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-settings-row-actions { display:flex; align-items:center; justify-content:flex-end; gap:11px; font:18px/1.2 Montserrat,Arial,sans-serif; letter-spacing:2px; white-space:nowrap; }
				.cattail-settings-row-actions button, .cattail-settings-back { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-settings-row-actions button:hover, .cattail-settings-back:hover { color:#b56b87; }
				.cattail-settings-action-separator { color:rgba(255,255,255,.42); }
				.cattail-settings-volume-track { position:relative; width:100%; height:8px; background:rgba(255,255,255,.22); overflow:hidden; cursor:pointer; }
				.cattail-settings-volume-fill { position:absolute; left:0; top:0; height:100%; width:0; background:#fff; }
				.cattail-settings-back { display:block; box-sizing:border-box; width:min(1120px,100%); margin:22px auto 0; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; }
				.splash.mobile .cattail-settings-page { padding:5vh 5vw 24px; }
				.splash.mobile .cattail-settings-brand { gap:4vw; }
				.splash.mobile .cattail-settings-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
				.splash.mobile .cattail-settings-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
				.splash.mobile .cattail-settings-subtitle { font-size:min(5vw,18px); letter-spacing:min(2vw,6px); }
				.splash.mobile .cattail-settings-tabs { gap:24px; }
				.splash.mobile .cattail-settings-tab { font-size:min(5vw,19px); letter-spacing:2px; }
				.splash.mobile .cattail-settings-content { height:min(610px,calc(100vh - 310px)); padding-right:14px; }
				.splash.mobile .cattail-settings-row { grid-template-columns:1fr; gap:10px; min-height:0; padding:14px 6px; }
				.splash.mobile .cattail-settings-row-actions { justify-content:flex-end; font-size:min(4vw,15px); letter-spacing:1px; }
				.splash.mobile .cattail-settings-back { font-size:min(5vw,20px); }
				@media (max-width:860px) { .cattail-settings-page { padding-left:5vw; padding-right:5vw; } .cattail-settings-logo { font-size:34px; letter-spacing:10px; } .cattail-settings-row { grid-template-columns:1fr; gap:10px; } .cattail-settings-row-actions { justify-content:flex-end; } }
			`
			document.head.append(style)
		}
	}
})