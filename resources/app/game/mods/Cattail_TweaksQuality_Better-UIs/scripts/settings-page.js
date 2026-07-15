ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableSettingsPage', true) === false) return
		const pageShell = api.ui.pages

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
				menu: 'Settings', title: 'Settings', empty: 'No settings yet.',
				game: 'Game', video: 'Video', sound: 'Sound', keyboard: 'Keyboard', controller: 'Controller', mod: 'Mod',
				masterVolume: 'Master volume', keyBindings: 'Key bindings', change: 'Change', reset: 'Default', waiting: 'Press keys, then Del to save. Esc cancels.', delToSave: 'Del to save', emptyBinding: 'Press at least one key before Del.', keyInUse: '{key} is already used by {action}.',
				moveUp: 'Camera up', moveRight: 'Camera right', moveDown: 'Camera down', moveLeft: 'Camera left', zoomReset: 'Reset camera zoom', copyBuilding: 'Copy building', moveBuilding: 'Move building'
			},
			zh: {
				menu: '\u8bbe\u7f6e', title: '\u8bbe\u7f6e', empty: '\u6682\u65f6\u6ca1\u6709\u8bbe\u7f6e\u3002',
				game: '\u6e38\u620f', video: '\u753b\u9762', sound: '\u58f0\u97f3', keyboard: '\u952e\u76d8', controller: '\u624b\u67c4', mod: 'Mod',
				masterVolume: '\u4e3b\u97f3\u91cf', keyBindings: '\u6309\u952e\u4fee\u6539', change: '\u4fee\u6539', reset: '\u9ed8\u8ba4', waiting: '\u4f9d\u6b21\u6309\u4e0b\u6309\u952e\uff0c\u7136\u540e\u6309 Del \u4fdd\u5b58\u3002Esc \u53d6\u6d88\u3002', delToSave: 'Del \u4fdd\u5b58', emptyBinding: '\u6309 Del \u4fdd\u5b58\u524d\u81f3\u5c11\u6309\u4e00\u4e2a\u952e\u3002', keyInUse: '{key} \u5df2\u88ab {action} \u4f7f\u7528\u3002',
				moveUp: '\u955c\u5934\u5411\u4e0a', moveRight: '\u955c\u5934\u5411\u53f3', moveDown: '\u955c\u5934\u5411\u4e0b', moveLeft: '\u955c\u5934\u5411\u5de6', zoomReset: '\u91cd\u7f6e\u955c\u5934\u8fdc\u8fd1', copyBuilding: '\u590d\u5236\u5efa\u7b51', moveBuilding: '\u79fb\u52a8\u5efa\u7b51'
			},
			tch: {
				menu: '\u8a2d\u5b9a', title: '\u8a2d\u5b9a', empty: '\u66ab\u6642\u6c92\u6709\u8a2d\u5b9a\u3002',
				game: '\u904a\u6232', video: '\u756b\u9762', sound: '\u8072\u97f3', keyboard: '\u9375\u76e4', controller: '\u624b\u67c4', mod: 'Mod',
				masterVolume: '\u4e3b\u97f3\u91cf', keyBindings: '\u6309\u9375\u4fee\u6539', change: '\u4fee\u6539', reset: '\u9810\u8a2d', waiting: '\u4f9d\u6b21\u6309\u4e0b\u6309\u9375\uff0c\u7136\u5f8c\u6309 Del \u5132\u5b58\u3002Esc \u53d6\u6d88\u3002', delToSave: 'Del \u5132\u5b58', emptyBinding: '\u6309 Del \u5132\u5b58\u524d\u81f3\u5c11\u6309\u4e00\u500b\u9375\u3002', keyInUse: '{key} \u5df2\u88ab {action} \u4f7f\u7528\u3002',
				moveUp: '\u93e1\u982d\u5411\u4e0a', moveRight: '\u93e1\u982d\u5411\u53f3', moveDown: '\u93e1\u982d\u5411\u4e0b', moveLeft: '\u93e1\u982d\u5411\u5de6', zoomReset: '\u91cd\u8a2d\u93e1\u982d\u9060\u8fd1', copyBuilding: '\u8907\u88fd\u5efa\u7bc9', moveBuilding: '\u79fb\u52d5\u5efa\u7bc9'
			}
		}

		pageShell.register({
			id: 'settings',
			prefix: 'cattail-settings',
			width: '1120px',
			contentHeight: '560px',
			mobileContentHeight: '610px',
			contentOffset: '335px',
			mobileContentOffset: '310px',
			inertialScroll: { friction: .88, directInfluence: .30, tailInfluence: .13, maxVelocity: 34, stopThreshold: .35 },
			menuLabel(game) { return text(game, 'menu') },
			title(game) { return text(game, 'title') },
			backLabel(game) { return pageShell.originalBackLabel(game) || 'BACK' },
			onOpen(ctx) {
				activeSplash = ctx.splash
				currentGame = ctx.game
			},
			onClose() {
				activeSplash = null
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
			},
			canCloseOnEscape() { return !pendingBinding },
			renderBeforeContent(ctx) { return renderTabsAndRule(ctx) },
			renderContent(ctx) {
				activeSplash = ctx.splash
				currentGame = ctx.game
				renderTabContent(ctx)
			}
		})

		api.on('afterVanillaScripts', function () {
			if (typeof Game === 'undefined') return
			installStyles()
			window.addEventListener('keydown', handleKeyDown, true)
			window.addEventListener('keyup', handleKeyUp, true)
		})

		api.on('afterGameInit', function (payload, game) {
			currentGame = game || payload
		})

		function renderTabsAndRule(ctx) {
			const fragment = document.createDocumentFragment()
			const tabBar = document.createElement('div')
			tabBar.className = 'cattail-settings-tabs'
			pageShell.installHorizontalWheel(tabBar)
			for (const id of tabs) tabBar.append(renderTab(ctx.game, id))
			fragment.append(tabBar)
			const rule = document.createElement('div')
			rule.className = 'cattail-settings-rule'
			fragment.append(rule)
			return fragment
		}

		function renderTab(game, id) {
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
				pageShell.refresh('settings')
			}
			return button
		}

		function renderTabContent(ctx) {
			if (activeTab === 'sound') {
				ctx.content.append(renderVolumeRow(ctx.game))
				return
			}
			if (activeTab === 'keyboard') {
				ctx.content.append(renderSectionTitle(ctx.game, 'keyBindings'))
				if (bindingNotice) ctx.content.append(renderNotice(bindingNotice))
				for (const action of keyActions) ctx.content.append(renderKeyBindingRow(ctx.game, action))
				return
			}
			ctx.content.append(renderEmpty(ctx.game))
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

		function renderKeyBindingRow(game, action) {
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
				pageShell.refresh('settings')
			})
			const reset = actionButton(text(game, 'reset'), function () {
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				resetBinding(game, action.id)
				pageShell.refresh('settings')
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
			const game = currentGame || pageShell.currentGame()
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
			const game = currentGame || pageShell.currentGame()
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
			const game = activeSplash?.master || currentGame || pageShell.currentGame()
			if (event.key === 'Escape' || event.code === 'Escape') {
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				pageShell.refresh('settings')
				return true
			}
			if (event.key === 'Delete' || event.code === 'Delete' || event.keyCode === 46) {
				if (!pendingCodes.length) {
					bindingNotice = text(game, 'emptyBinding')
					pageShell.refresh('settings')
					return true
				}
				setBinding(game, pendingBinding, pendingCodes)
				pendingBinding = null
				pendingCodes = []
				bindingNotice = ''
				pageShell.refresh('settings')
				return true
			}
			const code = normalizeEventCode(event)
			if (!code) return true
			const conflict = currentActionForCode(game, code, pendingBinding)
			if (conflict) {
				bindingNotice = text(game, 'keyInUse', { key: formatCode(code), action: text(game, conflict.label) })
				pageShell.refresh('settings')
				return true
			}
			if (pendingCodes.indexOf(code) < 0) pendingCodes.push(code)
			bindingNotice = ''
			pageShell.refresh('settings')
			return true
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

		function text(game, key, values) {
			const language = game?.language || 'en'
			const group = language === 'sch' || language === 'modsch' ? labelMap.zh : (language === 'tch' ? labelMap.tch : labelMap[language] || labelMap.en)
			let value = group[key] || labelMap.en[key] || key
			return value.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] !== undefined ? values[name] : '' })
		}

		function installStyles() {
			if (document.getElementById('cattail-settings-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-settings-style'
			style.textContent = `
				.cattail-settings-tabs { display:flex; align-items:center; gap:38px; box-sizing:border-box; width:min(var(--modloader-ui-page-width,1120px),100%); min-height:48px; margin:0 auto; padding:0 0 8px; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
				.cattail-settings-tabs::-webkit-scrollbar { display:none; }
				.cattail-settings-tab { appearance:none; flex:0 0 auto; border:0; background:transparent; color:rgba(255,255,255,.64); font:22px/1.2 Montserrat,Arial,sans-serif; letter-spacing:5px; padding:7px 0 9px; cursor:pointer; transition:color .18s ease,transform .18s ease; }
				.cattail-settings-tab:hover, .cattail-settings-tab-active { color:#fff; }
				.cattail-settings-tab-active { transform:translateY(-1px); }
				.cattail-settings-rule { width:min(var(--modloader-ui-page-width,1120px),100%); height:1px; margin:0 auto 0; background:rgba(255,255,255,.72); }
				.cattail-settings-section-title, .cattail-settings-empty, .cattail-settings-notice { min-height:54px; display:flex; align-items:center; box-sizing:border-box; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,.38); font:20px/1.35 Montserrat,Arial,sans-serif; letter-spacing:3px; color:rgba(255,255,255,.72); }
				.cattail-settings-notice { color:#b56b87; }
				.cattail-settings-row { display:grid; grid-template-columns:minmax(260px,.8fr) minmax(300px,1fr) minmax(180px,.55fr); align-items:center; gap:28px; min-height:78px; box-sizing:border-box; padding:15px 18px; border-bottom:1px solid rgba(255,255,255,.38); transition:background .18s ease; }
				.cattail-settings-row:hover, .cattail-settings-key-waiting { background:rgba(255,255,255,.08); }
				.cattail-settings-row-label { min-width:0; font:600 23px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-settings-row-value { min-width:0; color:rgba(255,255,255,.66); font:18px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-settings-row-actions { display:flex; align-items:center; justify-content:flex-end; gap:11px; font:18px/1.2 Montserrat,Arial,sans-serif; letter-spacing:2px; white-space:nowrap; }
				.cattail-settings-row-actions button { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-settings-row-actions button:hover { color:#b56b87; }
				.cattail-settings-action-separator { color:rgba(255,255,255,.42); }
				.cattail-settings-volume-track { position:relative; width:100%; height:8px; background:rgba(255,255,255,.22); overflow:hidden; cursor:pointer; }
				.cattail-settings-volume-fill { position:absolute; left:0; top:0; height:100%; width:0; background:#fff; }
				.splash.mobile .cattail-settings-tabs { gap:24px; }
				.splash.mobile .cattail-settings-tab { font-size:min(5vw,19px); letter-spacing:2px; }
				.splash.mobile .cattail-settings-row { grid-template-columns:1fr; gap:10px; min-height:0; padding:14px 6px; }
				.splash.mobile .cattail-settings-row-actions { justify-content:flex-end; font-size:min(4vw,15px); letter-spacing:1px; }
				@media (max-width:860px) { .cattail-settings-row { grid-template-columns:1fr; gap:10px; } .cattail-settings-row-actions { justify-content:flex-end; } }
			`
			document.head.append(style)
		}
	}
})