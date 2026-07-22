ModLoader.register({
	id: 'Cattail_TweaksQuality_Better-UIs',
	init(api) {
		if (api.config.get('enableSaveSlots', true) === false) return

		const manualSlotCount = 10
		const autoConfirmationIndex = 'auto'
		let activeSplash = null
		let pendingConfirmation = null
		let pendingImport = null
		const pageShell = api.ui.pages

		pageShell.register({
			id: 'saveSlots',
			prefix: 'cattail-save-slots',
			width: '1760px',
			contentClass: 'cattail-save-slots-list',
			scrollbarVisibleClass: 'cattail-save-slots-scrollbar-visible',
			contentHeight: '790px',
			mobileContentHeight: '620px',
			contentOffset: '318px',
			mobileContentOffset: '300px',
			inertialScroll: { friction: .88, directInfluence: .30, tailInfluence: .13, maxVelocity: 34, stopThreshold: .35 },
			insertBefore(splash, menu) { return menu?.querySelector('.resetProgressbar')?.closest('.menuItem') },
			menuLabel(game) { return text(game, 'menu') },
			title(game) { return text(game, 'title') },
			backLabel(game) { return text(game, 'back') },
			onOpen(ctx) {
				activeSplash = ctx.splash
				ensureAutoSave(ctx.game)
			},
			onClose() {
				pendingConfirmation = null
				pendingImport = null
				activeSplash = null
			},
			canCloseOnEscape(ctx, event) {
				return !event.target?.classList?.contains('cattail-save-slots-name-input')
			},
			renderBeforeContent(ctx) {
				return renderTransferBar(ctx.splash, ctx.page)
			},
			renderContent(ctx) {
				activeSplash = ctx.splash
				renderSlotsContent(ctx)
			}
		})

		api.on('afterVanillaScripts', function () {
			installStyles()
			if (typeof Game === 'undefined') return
			api.patch(Game.prototype, 'saveGame', function (original) {
				return function (...args) {
					const before = localStorage.getItem(autoKey(this))
					const result = original.apply(this, args)
					if (!this.preventSaving && localStorage.getItem(autoKey(this)) === before) writeAutoSave(this)
					refreshOpenSlotsPage(this)
					return result
				}
			})
		})

		function refreshOpenSlotsPage(game) {
			if (!activeSplash || activeSplash.master !== game) return
			if (!pageShell.isActive('saveSlots')) return
			const page = activeSplash.element?.querySelector('.cattail-save-slots-page')
			if (!page || page.querySelector('.cattail-save-slots-name-input') || pendingConfirmation) return
			pageShell.refresh('saveSlots')
		}

		function renderSlotsPage() {
			pageShell.refresh('saveSlots')
		}

		function renderSlotsContent(ctx) {
			const game = ctx.game
			const manualSlots = readManualSlots(game)
			const autoSlot = getAutoSlot(game)
			ctx.content.append(renderAutoSlot(ctx.splash, ctx.page, autoSlot))

			const strongRule = document.createElement('div')
			strongRule.className = 'cattail-save-slots-rule-strong'
			ctx.content.append(strongRule)

			for (let i = 0; i < manualSlotCount; i++) ctx.content.append(renderManualSlot(ctx.splash, ctx.page, manualSlots, i))
		}
		function ensureAutoSave(game) {
			writeAutoSave(game)
		}

		function writeAutoSave(game) {
			if (!game || game.preventSaving || typeof game.assembleSave !== 'function') return null
			const data = game.assembleSave()
			localStorage.setItem(autoKey(game), data)
			game.spaceport?.send('save', data)
			return data
		}

		function renderAutoSlot(splash, page, autoSlot) {
			const confirmation = pendingConfirmation?.index === autoConfirmationIndex ? pendingConfirmation : null
			const actions = []
			if (autoSlot.data && confirmation) {
				actions.push({
					key: 'load',
					confirm: true,
					ok: function () {
						pendingConfirmation = null
						loadSlot(splash.master, autoSlot.data)
					},
					cancel: function () {
						pendingConfirmation = null
						renderSlotsPage(splash, page)
					}
				})
			} else {
				actions.push({ key: 'load', disabled: !autoSlot.data, run: function () {
					pendingConfirmation = { type: 'load', index: autoConfirmationIndex }
					renderSlotsPage(splash, page)
				} })
				actions.push({ key: 'overwrite', run: function () { overwriteAutoSlot(splash.master); renderSlotsPage(splash, page) } })
				actions.push({ key: 'rename', disabled: true })
				actions.push({ key: 'delete', disabled: true })
			}
			return renderSlotRow({
				game: splash.master,
				slot: autoSlot.data ? autoSlot : null,
				isAuto: true,
				title: autoSlot.data ? text(splash.master, 'autoSlotName') : text(splash.master, 'autoEmpty'),
				time: autoSlot.timestamp,
				onPrimary: function () {
					if (!autoSlot.data) return
					pendingConfirmation = { type: 'load', index: autoConfirmationIndex }
					renderSlotsPage(splash, page)
				},
				actions
			})
		}

		function renderManualSlot(splash, page, slots, index) {
			const slot = slots[index] || null
			const actions = []
			const confirmation = pendingConfirmation?.index === index ? pendingConfirmation : null
			if (slot) {
				if (confirmation) {
					actions.push({
						key: confirmation.type,
						confirm: true,
						ok: function () {
							if (confirmation.type === 'load') {
								pendingConfirmation = null
								loadSlot(splash.master, slot.data)
								return
							}
							if (confirmation.type === 'overwrite') saveManualSlot(splash.master, slots, index, slot.name)
							if (confirmation.type === 'delete') {
								slots[index] = null
								writeManualSlots(splash.master, slots)
							}
							pendingConfirmation = null
							renderSlotsPage(splash, page)
						},
						cancel: function () {
							pendingConfirmation = null
							renderSlotsPage(splash, page)
						}
					})
				} else {
					actions.push({ key: 'load', run: function () {
						pendingConfirmation = { type: 'load', index }
						renderSlotsPage(splash, page)
					} })
					actions.push({ key: 'overwrite', run: function () {
						pendingConfirmation = { type: 'overwrite', index }
						renderSlotsPage(splash, page)
					} })
					actions.push({ key: 'rename', run: function () { renderRenameSlot(splash, page, slots, index, slot) } })
					actions.push({ key: 'delete', run: function () {
						pendingConfirmation = { type: 'delete', index }
						renderSlotsPage(splash, page)
					} })
				}
			} else {
				actions.push({ key: 'newSlot', run: function () {
					saveManualSlot(splash.master, slots, index)
					renderSlotsPage(splash, page)
				} })
			}

			return renderSlotRow({
				game: splash.master,
				slot,
				isAuto: false,
				title: slot ? slotTitle(splash.master, slot, index) : text(splash.master, 'emptySlot', { index: index + 1 }),
				time: slot?.timestamp || slot?.updatedAt,
				onPrimary: function () {
					if (slot) {
						pendingConfirmation = { type: 'load', index }
						renderSlotsPage(splash, page)
					} else {
						saveManualSlot(splash.master, slots, index)
						renderSlotsPage(splash, page)
					}
				},
				actions
			})
		}

		function renderSlotRow(options) {
			const row = document.createElement('div')
			row.className = `cattail-save-slots-row${options.isAuto ? ' cattail-save-slots-auto' : ''}${options.slot ? '' : ' cattail-save-slots-empty'}`

			const info = document.createElement('button')
			info.type = 'button'
			info.className = 'cattail-save-slots-info'
			info.onclick = options.onPrimary

			const name = document.createElement('div')
			name.className = 'cattail-save-slots-name'
			name.textContent = options.title
			const time = document.createElement('div')
			time.className = 'cattail-save-slots-time'
			time.textContent = formatTime(options.time) || text(options.game, 'noTime')
			info.append(name, time)

			const resources = document.createElement('div')
			resources.className = 'cattail-save-slots-resources'
			const decoded = options.slot?.decoded || decodeSlot(options.game, options.slot?.data)
			const resourceNodes = renderResourceSummary(options.game, decoded)
			for (const node of resourceNodes) resources.append(node)
			if (!resourceNodes.length) {
				const none = document.createElement('span')
				none.className = 'cattail-save-slots-no-resources'
				none.textContent = text(options.game, options.slot ? 'noResources' : 'emptyResourceHint')
				resources.append(none)
			}

			const actions = document.createElement('div')
			actions.className = 'cattail-save-slots-actions'
			for (let i = 0; i < options.actions.length; i++) {
				if (options.actions[i].confirm) {
					actions.append(confirmAction(options.game, options.actions[i]))
					continue
				}
				if (i) actions.append(actionSeparator())
				actions.append(actionButton(text(options.game, options.actions[i].key), !!options.actions[i].disabled, options.actions[i].run))
			}

			row.append(info, resources, actions)
			return row
		}

		function renderRenameSlot(splash, page, slots, index, slot) {
			renderSlotsPage(splash, page)
			const rows = page.querySelectorAll('.cattail-save-slots-row:not(.cattail-save-slots-auto)')
			const row = rows[index]
			if (!row) return
			row.innerHTML = ''
			row.classList.add('cattail-save-slots-editing')

			const input = document.createElement('input')
			input.className = 'cattail-save-slots-name-input'
			input.type = 'text'
			input.value = slot.name || text(splash.master, 'defaultSlotName', { index: index + 1 })
			input.maxLength = 64
			input.spellcheck = false
			input.autocomplete = 'off'
			input.autocorrect = 'off'
			input.autocapitalize = 'off'
			input.setAttribute('spellcheck', 'false')
			input.setAttribute('data-gramm', 'false')
			input.setAttribute('data-gramm_editor', 'false')
			input.setAttribute('data-enable-grammarly', 'false')

			const actions = document.createElement('div')
			actions.className = 'cattail-save-slots-actions'
			const saveName = function () {
				slot.name = input.value.trim()
				writeManualSlots(splash.master, slots)
				renderSlotsPage(splash, page)
			}
			actions.append(actionButton(text(splash.master, 'save'), false, saveName))
			actions.append(actionSeparator())
			actions.append(actionButton(text(splash.master, 'cancel'), false, function () { renderSlotsPage(splash, page) }))

			const stopTypingEvent = function (event) { event.stopPropagation() }
			const typeText = function (value) {
				if (!value) return
				const start = input.selectionStart ?? input.value.length
				const end = input.selectionEnd ?? start
				const next = input.value.slice(0, start) + value + input.value.slice(end)
				input.value = next.slice(0, input.maxLength)
				const caret = Math.min(start + value.length, input.value.length)
				input.setSelectionRange(caret, caret)
			}
			const handleTypingKey = function (event) {
				event.stopPropagation()
				if (event.key === 'Enter') {
					event.preventDefault()
					saveName()
					return
				}
				if (event.key === 'Escape') {
					event.preventDefault()
					renderSlotsPage(splash, page)
					return
				}
				if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
				if (event.key && /^[ -~]$/.test(event.key)) {
					event.preventDefault()
					typeText(event.key)
				}
			}
			input.addEventListener('keydown', handleTypingKey, true)
			input.addEventListener('keyup', stopTypingEvent, true)
			input.addEventListener('keypress', stopTypingEvent, true)
			input.addEventListener('beforeinput', stopTypingEvent, true)
			input.addEventListener('paste', function (event) {
				event.stopPropagation()
				event.preventDefault()
				typeText(event.clipboardData?.getData('text') || '')
			}, true)
			input.addEventListener('input', stopTypingEvent, true)
			input.addEventListener('compositionstart', stopTypingEvent, true)
			input.addEventListener('compositionupdate', stopTypingEvent, true)
			input.addEventListener('compositionend', stopTypingEvent, true)
			input.addEventListener('mousedown', stopTypingEvent, true)
			input.addEventListener('pointerdown', stopTypingEvent, true)
			input.addEventListener('click', stopTypingEvent, true)
			input.addEventListener('touchstart', stopTypingEvent, true)
			row.append(input, actions)
			setTimeout(function () { input.focus(); input.select() }, 0)
		}

		function renderTransferBar(splash, page) {
			const game = splash.master
			const bar = document.createElement('div')
			bar.className = 'cattail-save-slots-transfer'
			if (pendingImport) {
				const status = document.createElement('span')
				status.className = 'cattail-save-slots-transfer-status'
				status.textContent = text(game, pendingImport.auto ? 'importConfirmWithAuto' : 'importConfirm', { count: pendingImport.filledCount })
				const ok = actionButton('', false, function () {
					const shouldReload = applyImportedSlots(game, pendingImport)
					pendingImport = null
					if (shouldReload) {
						game.preventSaving = true
						setTimeout(function () { location.reload() }, 100)
						return
					}
					renderSlotsPage(splash, page)
				})
				ok.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-ok')
				ok.setAttribute('aria-label', 'Confirm')
				const cancel = actionButton('', false, function () {
					pendingImport = null
					renderSlotsPage(splash, page)
				})
				cancel.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-cancel')
				cancel.setAttribute('aria-label', 'Cancel')
				bar.append(status, ok, actionSeparator(), cancel)
				return bar
			}
			bar.append(actionButton(text(game, 'exportSlots'), false, function () { exportSlotsFile(game) }))
			bar.append(actionSeparator())
			bar.append(actionButton(text(game, 'importSlots'), false, function () { chooseImportFile(splash, page) }))
			return bar
		}

		function exportSlotsFile(game) {
			const payload = buildExportPayload(game)
			const content = encodeExportPayload(payload)
			const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = exportFileName()
			document.body.append(link)
			link.click()
			link.remove()
			setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
		}

		function chooseImportFile(splash, page) {
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = '.cattail-save-slots,.txt,.json,text/plain,application/json'
			input.style.display = 'none'
			input.onchange = function () {
				const file = input.files?.[0]
				input.remove()
				if (!file) return
				const reader = new FileReader()
				reader.onload = function () {
					const imported = parseImportedSlots(splash.master, String(reader.result || ''))
					if (!imported) {
						alert(text(splash.master, 'importInvalid'))
						return
					}
					pendingConfirmation = null
					pendingImport = imported
					renderSlotsPage(splash, page)
				}
				reader.onerror = function () { alert(text(splash.master, 'importInvalid')) }
				reader.readAsText(file)
			}
			document.body.append(input)
			input.click()
		}

		function buildExportPayload(game) {
			const autoSlot = getAutoSlot(game)
			const manualSlots = readManualSlots(game)
			return {
				type: 'Cattail_TweaksQuality_Saves-Slots',
				version: 1,
				exportedAt: new Date().toISOString(),
				steamId: String(game?.steamId || ''),
				slotCount: manualSlotCount,
				auto: sanitizeSlot(game, autoSlot.data ? { data: autoSlot.data, timestamp: autoSlot.timestamp, createdAt: autoSlot.timestamp, updatedAt: autoSlot.timestamp } : null),
				manual: emptySlots().map(function (_, index) { return sanitizeSlot(game, manualSlots[index]) })
			}
		}

		function parseImportedSlots(game, raw) {
			try {
				const payload = decodeExportPayload(raw)
				if (!payload || typeof payload !== 'object') return null
				const sourceSlots = Array.isArray(payload) ? payload : (Array.isArray(payload.manual) ? payload.manual : (Array.isArray(payload.slots) ? payload.slots : null))
				if (!sourceSlots) return null
				const manual = emptySlots().map(function (_, index) { return sanitizeSlot(game, sourceSlots[index]) })
				const auto = Array.isArray(payload) ? null : sanitizeSlot(game, payload.auto || payload.autosave)
				return { auto, manual, filledCount: manual.filter(Boolean).length }
			} catch (error) {
				console.warn('[Save Slots] Could not import save slots.', error)
				return null
			}
		}

		function applyImportedSlots(game, imported) {
			writeManualSlots(game, imported.manual)
			if (imported.auto?.data) {
				localStorage.setItem(autoKey(game), imported.auto.data)
				game.spaceport?.send('save', imported.auto.data)
				return true
			}
			return false
		}

		function sanitizeSlot(game, slot) {
			if (!slot) return null
			const data = typeof slot === 'string' ? slot : slot.data
			if (typeof data !== 'string' || !data) return null
			const decoded = decodeSlot(game, data)
			if (!decoded) return null
			return {
				name: typeof slot.name === 'string' ? slot.name.slice(0, 64) : '',
				data,
				timestamp: safeTimestamp(slot.timestamp || decoded.timestamp),
				createdAt: safeTimestamp(slot.createdAt || slot.timestamp || decoded.timestamp),
				updatedAt: safeTimestamp(slot.updatedAt || slot.timestamp || decoded.timestamp)
			}
		}

		function safeTimestamp(value) {
			const number = Number(value)
			return Number.isFinite(number) && number > 0 ? number : null
		}

		function encodeExportPayload(payload) {
			return 'CattailSaveSlots:v1\n' + encodeBase64(JSON.stringify(payload))
		}

		function decodeExportPayload(raw) {
			const content = String(raw || '').trim()
			if (!content) return null
			if (content.startsWith('CattailSaveSlots:v1')) return JSON.parse(decodeBase64(content.slice('CattailSaveSlots:v1'.length).trim()))
			return JSON.parse(content)
		}

		function encodeBase64(value) {
			const bytes = new TextEncoder().encode(value)
			let binary = ''
			for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
			return btoa(binary)
		}

		function decodeBase64(value) {
			const binary = atob(String(value || '').replace(/\s+/g, ''))
			const bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
			return new TextDecoder().decode(bytes)
		}

		function exportFileName() {
			const date = new Date()
			const pad = function (value) { return String(value).padStart(2, '0') }
			return `Cattail_SaveSlots_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.cattail-save-slots`
		}

		function confirmAction(game, action) {
			const wrap = document.createElement('span')
			wrap.className = 'cattail-save-slots-confirm-action'
			const label = document.createElement('span')
			label.className = 'cattail-save-slots-confirm-label'
			label.textContent = text(game, action.key)
			const ok = actionButton('', false, action.ok)
			ok.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-ok')
			ok.setAttribute('aria-label', 'Confirm')
			const cancel = actionButton('', false, action.cancel)
			cancel.classList.add('cattail-save-slots-confirm-icon', 'cattail-save-slots-confirm-cancel')
			cancel.setAttribute('aria-label', 'Cancel')
			wrap.append(label, ok, actionSeparator(), cancel)
			return wrap
		}
		function actionButton(label, disabled, onClick) {
			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = label
			button.disabled = disabled
			button.onclick = function (event) {
				event.preventDefault()
				event.stopPropagation()
				if (!disabled && typeof onClick === 'function') onClick()
			}
			button.ontouchstart = button.onclick
			return button
		}

		function actionSeparator() {
			const separator = document.createElement('span')
			separator.className = 'cattail-save-slots-action-separator'
			separator.textContent = '|'
			return separator
		}

		function saveManualSlot(game, slots, index, previousName) {
			if (game.preventSaving) {
				alert(game.pronounce?.('random', 'toolate') || text(game, 'cannotSave'))
				return
			}
			const data = game.assembleSave()
			const decoded = game.decodeSave(data)
			const timestamp = decoded?.timestamp || Date.now()
			slots[index] = { name: previousName || '', data, timestamp, createdAt: slots[index]?.createdAt || timestamp, updatedAt: timestamp }
			writeManualSlots(game, slots)
		}

		function overwriteAutoSlot(game) {
			if (game.preventSaving) {
				alert(game.pronounce?.('random', 'toolate') || text(game, 'cannotSave'))
				return
			}
			writeAutoSave(game)
		}

		function loadSlot(game, data) {
			if (!data) return
			game.preventSaving = true
			game.spaceport?.send('save', data)
			localStorage.setItem(autoKey(game), data)
			setTimeout(function () { location.reload() }, 100)
		}

		function getAutoSlot(game) {
			const data = localStorage.getItem(autoKey(game))
			const decoded = data ? game.decodeSave(data) : null
			return { data, decoded, timestamp: decoded?.timestamp || null }
		}

		function readManualSlots(game) {
			try {
				const raw = localStorage.getItem(slotsKey(game))
				const parsed = raw ? JSON.parse(raw) : []
				if (!Array.isArray(parsed)) return emptySlots()
				return emptySlots().map(function (_, index) {
					const slot = parsed[index]
					if (!slot?.data) return null
					const decoded = decodeSlot(game, slot.data)
					return { name: typeof slot.name === 'string' ? slot.name : '', data: slot.data, decoded, timestamp: slot.timestamp || decoded?.timestamp || null, createdAt: slot.createdAt || slot.timestamp || decoded?.timestamp || null, updatedAt: slot.updatedAt || slot.timestamp || decoded?.timestamp || null }
				})
			} catch (error) {
				console.warn('[Save Slots] Could not read save slots.', error)
				return emptySlots()
			}
		}

		function writeManualSlots(game, slots) {
			localStorage.setItem(slotsKey(game), JSON.stringify(emptySlots().map(function (_, index) { return slots[index] || null })))
		}

		function emptySlots() { return new Array(manualSlotCount).fill(null) }
		function autoKey(game) { return `abstractv03${game.steamId}` }
		function slotsKey(game) { return `abstractv03_saveSlots${game.steamId}` }
		function decodeSlot(game, data) {
			if (!data) return null
			try { return game.decodeSave(data) } catch (error) { console.warn('[Save Slots] Could not decode save preview.', error); return null }
		}
		function slotTitle(game, slot, index) { return slot.name || text(game, 'defaultSlotName', { index: index + 1 }) }

		function renderResourceSummary(game, decoded) {
			const resources = Array.isArray(decoded?.resources) ? decoded.resources : []
			const nodes = []
			for (let i = 0; i < resources.length; i++) {
				const value = resources[i]
				if (!value || value <= 0) continue
				const chunk = document.createElement('span')
				chunk.className = 'cattail-save-slots-resource'
				const icon = document.createElement('span')
				icon.className = `rico r${i}`
				const amount = document.createElement('span')
				amount.className = 'cattail-save-slots-resource-amount'
				amount.textContent = game.makeReadable ? game.makeReadable(value) : formatNumber(value)
				chunk.append(icon, amount)
				nodes.push(chunk)
			}
			return nodes
		}

		function formatNumber(value) {
			if (value >= 1000000000) return Math.floor(value / 1000000000) + 'B'
			if (value >= 1000000) return Math.floor(value / 1000000) + 'M'
			if (value >= 1000) return Math.floor(value / 1000) + 'K'
			return Math.floor(value).toString()
		}
		const LABELS = {
			en: {
				menu: 'Saves', title: 'Saves', autoSlot: 'Autosave {time}', autoEmpty: 'Autosave: empty', load: 'Load', emptySlot: 'Empty slot {index}', overwrite: 'Overwrite', overwriteConfirm: 'Overwrite slot {index}?', rename: 'Rename', delete: 'Delete', deleteConfirm: 'Delete slot {index}?', newSlot: 'New', defaultSlotName: 'Save {index}', save: 'Save', cancel: 'Cancel', cannotSave: 'Saving is not available now.'
			},
			ru: {
				menu: 'Сохранения', title: 'Сохранения', autoSlot: 'Автосохранение {time}', autoEmpty: 'Автосохранение: пусто', load: 'Загрузить', emptySlot: 'Пустой слот {index}', overwrite: 'Перезаписать', overwriteConfirm: 'Перезаписать слот {index}?', rename: 'Переименовать', delete: 'Удалить', deleteConfirm: 'Удалить слот {index}?', newSlot: 'Создать', defaultSlotName: 'Сохранение {index}', save: 'Сохранить', cancel: 'Отмена', cannotSave: 'Сейчас нельзя сохранить.'
			},
			de: {
				menu: 'Spielstände', title: 'Spielstände', autoSlot: 'Autosave {time}', autoEmpty: 'Autosave: leer', load: 'Laden', emptySlot: 'Leerer Slot {index}', overwrite: 'Überschreiben', overwriteConfirm: 'Slot {index} überschreiben?', rename: 'Umbenennen', delete: 'Löschen', deleteConfirm: 'Slot {index} löschen?', newSlot: 'Neu', defaultSlotName: 'Speicherstand {index}', save: 'Speichern', cancel: 'Abbrechen', cannotSave: 'Speichern ist jetzt nicht möglich.'
			},
			ptbr: {
				menu: 'Saves', title: 'Saves', autoSlot: 'Save automático {time}', autoEmpty: 'Save automático: vazio', load: 'Carregar', emptySlot: 'Slot vazio {index}', overwrite: 'Sobrescrever', overwriteConfirm: 'Sobrescrever slot {index}?', rename: 'Renomear', delete: 'Excluir', deleteConfirm: 'Excluir slot {index}?', newSlot: 'Novo', defaultSlotName: 'Save {index}', save: 'Salvar', cancel: 'Cancelar', cannotSave: 'Não é possível salvar agora.'
			},
			it: {
				menu: 'Salvataggi', title: 'Salvataggi', autoSlot: 'Salvataggio automatico {time}', autoEmpty: 'Salvataggio automatico: vuoto', load: 'Carica', emptySlot: 'Slot vuoto {index}', overwrite: 'Sovrascrivi', overwriteConfirm: 'Sovrascrivere lo slot {index}?', rename: 'Rinomina', delete: 'Elimina', deleteConfirm: 'Eliminare lo slot {index}?', newSlot: 'Nuovo', defaultSlotName: 'Salvataggio {index}', save: 'Salva', cancel: 'Annulla', cannotSave: 'Ora non è possibile salvare.'
			},
			es: {
				menu: 'Partidas', title: 'Partidas guardadas', autoSlot: 'Autoguardado {time}', autoEmpty: 'Autoguardado: vacío', load: 'Cargar', emptySlot: 'Ranura vacía {index}', overwrite: 'Sobrescribir', overwriteConfirm: '¿Sobrescribir ranura {index}?', rename: 'Renombrar', delete: 'Eliminar', deleteConfirm: '¿Eliminar ranura {index}?', newSlot: 'Nuevo', defaultSlotName: 'Partida {index}', save: 'Guardar', cancel: 'Cancelar', cannotSave: 'No se puede guardar ahora.'
			},
			fr: {
				menu: 'Sauvegardes', title: 'Sauvegardes', autoSlot: 'Sauvegarde auto {time}', autoEmpty: 'Sauvegarde auto : vide', load: 'Charger', emptySlot: 'Emplacement vide {index}', overwrite: 'Écraser', overwriteConfirm: 'Écraser l\'emplacement {index} ?', rename: 'Renommer', delete: 'Supprimer', deleteConfirm: 'Supprimer l\'emplacement {index} ?', newSlot: 'Nouveau', defaultSlotName: 'Sauvegarde {index}', save: 'Sauver', cancel: 'Annuler', cannotSave: 'Impossible de sauvegarder maintenant.'
			},
			nl: {
				menu: 'Opslagen', title: 'Opslagen', autoSlot: 'Automatisch opgeslagen {time}', autoEmpty: 'Automatisch opgeslagen: leeg', load: 'Laden', emptySlot: 'Leeg slot {index}', overwrite: 'Overschrijven', overwriteConfirm: 'Slot {index} overschrijven?', rename: 'Hernoemen', delete: 'Verwijderen', deleteConfirm: 'Slot {index} verwijderen?', newSlot: 'Nieuw', defaultSlotName: 'Opslag {index}', save: 'Opslaan', cancel: 'Annuleren', cannotSave: 'Opslaan is nu niet mogelijk.'
			},
			cz: {
				menu: 'Uložení', title: 'Uložení', autoSlot: 'Automatické uložení {time}', autoEmpty: 'Automatické uložení: prázdné', load: 'Načíst', emptySlot: 'Prázdný slot {index}', overwrite: 'Přepsat', overwriteConfirm: 'Přepsat slot {index}?', rename: 'Přejmenovat', delete: 'Smazat', deleteConfirm: 'Smazat slot {index}?', newSlot: 'Nový', defaultSlotName: 'Uložení {index}', save: 'Uložit', cancel: 'Zrušit', cannotSave: 'Nyní nelze uložit.'
			},
			pl: {
				menu: 'Zapisy', title: 'Zapisy', autoSlot: 'Autozapis {time}', autoEmpty: 'Autozapis: pusty', load: 'Wczytaj', emptySlot: 'Pusty slot {index}', overwrite: 'Nadpisz', overwriteConfirm: 'Nadpisać slot {index}?', rename: 'Zmień nazwę', delete: 'Usuń', deleteConfirm: 'Usunąć slot {index}?', newSlot: 'Nowy', defaultSlotName: 'Zapis {index}', save: 'Zapisz', cancel: 'Anuluj', cannotSave: 'Nie można teraz zapisać.'
			},
			jp: {
				menu: 'セーブ', title: 'セーブ', autoSlot: 'オートセーブ {time}', autoEmpty: 'オートセーブ: 空', load: '読込', emptySlot: '空スロット {index}', overwrite: '上書き', overwriteConfirm: 'スロット {index} を上書きしますか？', rename: '名前変更', delete: '削除', deleteConfirm: 'スロット {index} を削除しますか？', newSlot: '新規', defaultSlotName: 'セーブ {index}', save: '保存', cancel: 'キャンセル', cannotSave: '現在保存できません。'
			},
			kr: {
				menu: '저장', title: '저장', autoSlot: '자동 저장 {time}', autoEmpty: '자동 저장: 비어 있음', load: '불러오기', emptySlot: '빈 슬롯 {index}', overwrite: '덮어쓰기', overwriteConfirm: '슬롯 {index}을 덮어쓸까요?', rename: '이름 변경', delete: '삭제', deleteConfirm: '슬롯 {index}을 삭제할까요?', newSlot: '새로 만들기', defaultSlotName: '저장 {index}', save: '저장', cancel: '취소', cannotSave: '지금은 저장할 수 없습니다.'
			},
			sch: {
				menu: '存档', title: '存档', autoSlot: '自动存档 {time}', autoEmpty: '自动存档：空', load: '读取', emptySlot: '空存档格 {index}', overwrite: '覆盖', overwriteConfirm: '覆盖存档格 {index}？', rename: '改名', delete: '删除', deleteConfirm: '删除存档格 {index}？', newSlot: '新建', defaultSlotName: '存档{index}', save: '保存', cancel: '取消', cannotSave: '现在无法保存。'
			},
			modsch: {
				menu: '存档', title: '存档', autoSlot: '自动存档 {time}', autoEmpty: '自动存档：空', load: '读取', emptySlot: '空存档格 {index}', overwrite: '覆盖', overwriteConfirm: '覆盖存档格 {index}？', rename: '改名', delete: '删除', deleteConfirm: '删除存档格 {index}？', newSlot: '新建', defaultSlotName: '存档{index}', save: '保存', cancel: '取消', cannotSave: '现在无法保存。'
			},
			tch: {
				menu: '存檔', title: '存檔', autoSlot: '自動存檔 {time}', autoEmpty: '自動存檔：空', load: '讀取', emptySlot: '空存檔格 {index}', overwrite: '覆蓋', overwriteConfirm: '覆蓋存檔格 {index}？', rename: '改名', delete: '刪除', deleteConfirm: '刪除存檔格 {index}？', newSlot: '新增', defaultSlotName: '存檔{index}', save: '儲存', cancel: '取消', cannotSave: '現在無法存檔。'
			},
			thai: {
				menu: 'บันทึก', title: 'บันทึก', autoSlot: 'บันทึกอัตโนมัติ {time}', autoEmpty: 'บันทึกอัตโนมัติ: ว่าง', load: 'โหลด', emptySlot: 'ช่องว่าง {index}', overwrite: 'เขียนทับ', overwriteConfirm: 'เขียนทับช่อง {index}?', rename: 'เปลี่ยนชื่อ', delete: 'ลบ', deleteConfirm: 'ลบช่อง {index}?', newSlot: 'ใหม่', defaultSlotName: 'บันทึก {index}', save: 'บันทึก', cancel: 'ยกเลิก', cannotSave: 'ตอนนี้ไม่สามารถบันทึกได้'
			},
			hu: {
				menu: 'Mentések', title: 'Mentések', autoSlot: 'Automatikus mentés {time}', autoEmpty: 'Automatikus mentés: üres', load: 'Betöltés', emptySlot: 'Üres hely {index}', overwrite: 'Felülírás', overwriteConfirm: 'Felülírja a(z) {index}. helyet?', rename: 'Átnevezés', delete: 'Törlés', deleteConfirm: 'Törli a(z) {index}. helyet?', newSlot: 'Új', defaultSlotName: 'Mentés {index}', save: 'Mentés', cancel: 'Mégse', cannotSave: 'Most nem lehet menteni.'
			},
			lv: {
				menu: 'Saglabātie', title: 'Saglabātie', autoSlot: 'Automātiskais saglabājums {time}', autoEmpty: 'Automātiskais saglabājums: tukšs', load: 'Ielādēt', emptySlot: 'Tukša vieta {index}', overwrite: 'Pārrakstīt', overwriteConfirm: 'Pārrakstīt vietu {index}?', rename: 'Pārdēvēt', delete: 'Dzēst', deleteConfirm: 'Dzēst vietu {index}?', newSlot: 'Jauns', defaultSlotName: 'Saglabājums {index}', save: 'Saglabāt', cancel: 'Atcelt', cannotSave: 'Tagad nevar saglabāt.'
			},
			ro: {
				menu: 'Salvări', title: 'Salvări', autoSlot: 'Salvare automată {time}', autoEmpty: 'Salvare automată: gol', load: 'Încarcă', emptySlot: 'Slot gol {index}', overwrite: 'Suprascrie', overwriteConfirm: 'Suprascrii slotul {index}?', rename: 'Redenumește', delete: 'Șterge', deleteConfirm: 'Ștergi slotul {index}?', newSlot: 'Nou', defaultSlotName: 'Salvare {index}', save: 'Salvează', cancel: 'Anulează', cannotSave: 'Nu se poate salva acum.'
			},
			no: {
				menu: 'Lagringer', title: 'Lagringer', autoSlot: 'Autolagring {time}', autoEmpty: 'Autolagring: tom', load: 'Last inn', emptySlot: 'Tom plass {index}', overwrite: 'Overskriv', overwriteConfirm: 'Overskrive plass {index}?', rename: 'Gi nytt navn', delete: 'Slett', deleteConfirm: 'Slette plass {index}?', newSlot: 'Ny', defaultSlotName: 'Lagring {index}', save: 'Lagre', cancel: 'Avbryt', cannotSave: 'Kan ikke lagre nå.'
			}
		}

		const EXTRA_LABELS = {
			en: {back: 'Back', noTime: 'No save time', noResources: 'No resources', emptyResourceHint: 'Empty', exportSlots: 'Export all', importSlots: 'Import file', importConfirm: 'Import {count} manual slots?', importConfirmWithAuto: 'Import autosave and {count} manual slots?', importInvalid: 'This save-slot file could not be imported.'},
			sch: {back: '返回', noTime: '没有存档时间', noResources: '没有资源', emptyResourceHint: '空', exportSlots: '导出全部', importSlots: '导入文件', importConfirm: '导入 {count} 个手动存档格？', importConfirmWithAuto: '导入自动存档和 {count} 个手动存档格？', importInvalid: '无法导入这个存档格文件。'},
			modsch: {back: '返回', noTime: '没有存档时间', noResources: '没有资源', emptyResourceHint: '空', exportSlots: '导出全部', importSlots: '导入文件', importConfirm: '导入 {count} 个手动存档格？', importConfirmWithAuto: '导入自动存档和 {count} 个手动存档格？', importInvalid: '无法导入这个存档格文件。'},
			tch: {back: '返回', noTime: '沒有存檔時間', noResources: '沒有資源', emptyResourceHint: '空', exportSlots: '匯出全部', importSlots: '匯入檔案', importConfirm: '匯入 {count} 個手動存檔格？', importConfirmWithAuto: '匯入自動存檔和 {count} 個手動存檔格？', importInvalid: '無法匯入這個存檔格檔案。'}
		}

		function text(game, key, values) {
			const language = game?.language || 'en'
			const labels = LABELS[language] || LABELS.en
			const extras = EXTRA_LABELS[language] || EXTRA_LABELS.en
			let template = labels[key] || extras[key]
			if (!template && key === 'autoSlotName') template = (labels.autoSlot || LABELS.en.autoSlot).replace(/\s*\{time\}/, '').replace(/[：:]\s*$/, '').trim()
			if (!template && key === 'back') template = labels.cancel || LABELS.en.cancel
			if (!template && (key === 'noTime' || key === 'noResources' || key === 'emptyResourceHint')) template = ''
			if (!template) template = LABELS.en[key] || key
			return template.replace(/\{(\w+)\}/g, function (_, name) { return values && values[name] !== undefined ? values[name] : '' })
		}

		function formatTime(timestamp) {
			if (!timestamp) return ''
			const date = new Date(timestamp)
			if (Number.isNaN(date.getTime())) return ''
			const pad = function (value) { return String(value).padStart(2, '0') }
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
		}

		function installStyles() {
			if (document.getElementById('cattail-save-slots-style')) return
			const style = document.createElement('style')
			style.id = 'cattail-save-slots-style'
			style.textContent = `
				.splash.cattail-save-slots-active { background:#000000F9; color:#fff; }
				.splash.cattail-save-slots-active .menu,
				.splash.cattail-save-slots-active .credit,
				.splash.cattail-save-slots-active .publisher,
				.splash.cattail-save-slots-active .flashlight,
				.splash.cattail-save-slots-active .chill,
				.splash.cattail-save-slots-active .fullscreen,
				.splash.cattail-save-slots-active .discord,
				.splash.cattail-save-slots-active .backupVessel,
				.splash.cattail-save-slots-active .gloryButton,
				.splash.cattail-save-slots-active > .headerBox,
				.splash.cattail-save-slots-active > .sixtyFour { display: none !important; }
				.cattail-save-slots-page { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; box-sizing:border-box; padding:clamp(16px,3vh,36px) max(36px,5vw) 18px; color:#fff; background:transparent; font-family:Montserrat,Arial,sans-serif; overflow:hidden; }
				.cattail-save-slots-brand { display:flex; align-items:center; justify-content:center; gap:32px; margin:0 auto 14px; }
				.cattail-save-slots-logo-mark { flex:0 0 auto; width:92px; height:92px; margin:0; background:url('img/logo/sheet.png'); background-size:400% 200%; }
				.cattail-save-slots-logo { text-align:center; font:54px Montserrat,Arial,sans-serif; letter-spacing:16px; white-space:nowrap; }
				.cattail-save-slots-subtitle { margin:0 auto 12px; text-align:center; font:23px Montserrat,Arial,sans-serif; letter-spacing:9px; color:#fffc; }
				.cattail-save-slots-transfer { display:flex; align-items:center; justify-content:center; gap:14px; width:min(1760px,100%); min-height:28px; margin:0 auto 14px; color:rgba(255,255,255,.82); font:17px/1.2 Montserrat,Arial,sans-serif; letter-spacing:3px; white-space:nowrap; }
				.cattail-save-slots-transfer button { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-save-slots-transfer button:hover { color:#b56b87; }
				.cattail-save-slots-transfer-status { color:rgba(255,255,255,.66); }
				.cattail-save-slots-list { box-sizing:border-box; width:min(1760px,100%); height:min(790px,calc(100vh - 318px)); margin:0 auto; padding:2px 28px 16px 0; overflow-x:hidden; overflow-y:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; transition:scrollbar-color .28s ease; outline:none; }
				.cattail-save-slots-list:hover, .cattail-save-slots-list:active, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible { scrollbar-color:#fffc #fff2; }
				.cattail-save-slots-list::-webkit-scrollbar { width:10px; }
				.cattail-save-slots-list::-webkit-scrollbar-track { background:transparent; transition:background .28s ease; }
				.cattail-save-slots-list::-webkit-scrollbar-thumb { border:0; border-radius:0; background:transparent; transition:background .28s ease; }
				.cattail-save-slots-list:hover::-webkit-scrollbar-track, .cattail-save-slots-list:active::-webkit-scrollbar-track, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible::-webkit-scrollbar-track { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.16) 4px, rgba(255,255,255,.16) 6px, transparent 6px); }
				.cattail-save-slots-list:hover::-webkit-scrollbar-thumb, .cattail-save-slots-list:active::-webkit-scrollbar-thumb, .cattail-save-slots-list.cattail-save-slots-scrollbar-visible::-webkit-scrollbar-thumb { background:linear-gradient(to right, transparent 4px, rgba(255,255,255,.78) 4px, rgba(255,255,255,.78) 6px, transparent 6px); }
				.cattail-save-slots-row { display:grid; grid-template-columns:minmax(320px,.92fr) minmax(390px,1.14fr) minmax(340px,.86fr); align-items:center; gap:30px; min-height:106px; padding:18px; border-bottom:1px solid rgba(255,255,255,.42); transition:background .18s ease,color .18s ease; }
				.cattail-save-slots-row:hover, .cattail-save-slots-row.cattail-save-slots-editing { background:rgba(255,255,255,.08); }
				.cattail-save-slots-auto { border-bottom:0; }
				.cattail-save-slots-rule-strong { height:4px; width:calc(100% - 4px); margin:0 0 2px; background:rgba(255,255,255,.9); }
				.cattail-save-slots-info { appearance:none; border:0; background:transparent; color:inherit; font:inherit; text-align:left; padding:0; cursor:pointer; min-width:0; }
				.cattail-save-slots-name { font:600 27px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; overflow-wrap:anywhere; }
				.cattail-save-slots-time { margin-top:9px; font:16px/1.35 Montserrat,Arial,sans-serif; letter-spacing:1px; color:rgba(255,255,255,.58); }
				.cattail-save-slots-resources { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:11px 18px; min-width:0; font:17px/1.2 Montserrat,Arial,sans-serif; color:rgba(255,255,255,.85); }
				.cattail-save-slots-resource { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
				.cattail-save-slots-resource .rico { display:inline-block; flex:0 0 auto; width:20px; height:22.5px; background-image:url('img/smallresources.png'); background-size:1000% 100%; transform:none; }
				.cattail-save-slots-resource-amount { display:inline-flex; align-items:center; min-height:22.5px; line-height:22.5px; }
				.cattail-save-slots-resource .rico.r0 { background-position:0 0; } .cattail-save-slots-resource .rico.r1 { background-position:11.111111% 0; } .cattail-save-slots-resource .rico.r2 { background-position:22.222222% 0; } .cattail-save-slots-resource .rico.r3 { background-position:33.333333% 0; } .cattail-save-slots-resource .rico.r4 { background-position:44.444444% 0; } .cattail-save-slots-resource .rico.r5 { background-position:55.555556% 0; } .cattail-save-slots-resource .rico.r6 { background-position:66.666667% 0; } .cattail-save-slots-resource .rico.r7 { background-position:77.777778% 0; } .cattail-save-slots-resource .rico.r8 { background-position:88.888889% 0; } .cattail-save-slots-resource .rico.r9 { background-position:100% 0; }
				.cattail-save-slots-no-resources { color:rgba(255,255,255,.35); letter-spacing:2px; }
				.cattail-save-slots-actions { display:flex; align-items:center; justify-content:flex-end; gap:11px; min-width:0; font:18px/1.2 Montserrat,Arial,sans-serif; letter-spacing:2px; white-space:nowrap; }
				.cattail-save-slots-actions button, .cattail-save-slots-back { appearance:none; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; padding:0; cursor:pointer; transition:color .18s ease,opacity .18s ease; }
				.cattail-save-slots-actions button:hover, .cattail-save-slots-back:hover, .cattail-save-slots-info:hover .cattail-save-slots-name { color:#b56b87; }
				.cattail-save-slots-actions button:disabled { cursor:default; opacity:.3; color:inherit; }
				.cattail-save-slots-confirm-action { display:inline-flex; align-items:center; justify-content:flex-end; gap:22px; min-width:260px; }
				.cattail-save-slots-confirm-label { margin-right:36px; font-weight:600; }
				.cattail-save-slots-confirm-icon { position:relative; width:24px; height:24px; min-width:24px; letter-spacing:0; }
				.cattail-save-slots-confirm-icon:before, .cattail-save-slots-confirm-icon:after { content:''; position:absolute; display:block; height:1px; background:currentColor; transform-origin:left center; }
				.cattail-save-slots-confirm-ok:before { left:5px; top:13px; width:8px; transform:rotate(45deg); }
				.cattail-save-slots-confirm-ok:after { left:10.4px; top:18.5px; width:16px; transform:rotate(-48deg); }
				.cattail-save-slots-confirm-cancel:before, .cattail-save-slots-confirm-cancel:after { left:3px; top:12px; width:18px; transform-origin:center; }
				.cattail-save-slots-confirm-cancel:before { transform:rotate(45deg); }
				.cattail-save-slots-confirm-cancel:after { transform:rotate(-45deg); }
				.cattail-save-slots-action-separator { color:rgba(255,255,255,.42); }
				.cattail-save-slots-back { display:block; box-sizing:border-box; width:min(1760px,100%); margin:22px auto 0; text-align:right; font:23px Montserrat,Arial,sans-serif; letter-spacing:6px; }
				.cattail-save-slots-name-input { grid-column:1 / 3; box-sizing:border-box; width:100%; min-height:44px; border:0; border-bottom:1px solid rgba(255,255,255,.72); background:transparent; color:#fff; font:600 27px/1.25 Montserrat,Arial,sans-serif; letter-spacing:2px; outline:none; user-select:text !important; -webkit-user-select:text !important; cursor:text; }
				.splash.mobile .cattail-save-slots-page { padding:5vh 5vw 24px; }
				.splash.mobile .cattail-save-slots-brand { gap:4vw; }
				.splash.mobile .cattail-save-slots-logo-mark { width:16vw; height:16vw; max-width:74px; max-height:74px; }
				.splash.mobile .cattail-save-slots-logo { font-size:min(8vw,34px); letter-spacing:min(2.2vw,9px); }
				.splash.mobile .cattail-save-slots-subtitle { font-size:min(5vw,18px); }
				.splash.mobile .cattail-save-slots-transfer { font-size:min(4vw,15px); letter-spacing:1px; }
				.splash.mobile .cattail-save-slots-list { height:min(620px,calc(100vh - 300px)); padding-right:14px; }
				.splash.mobile .cattail-save-slots-row { grid-template-columns:1fr; gap:10px; min-height:0; padding:14px 6px; }
				.splash.mobile .cattail-save-slots-resources { justify-content:flex-start; }
				.splash.mobile .cattail-save-slots-actions { justify-content:flex-end; font-size:min(4vw,15px); letter-spacing:1px; }
				.splash.mobile .cattail-save-slots-back { font-size:min(5vw,20px); }
				@media (max-width:860px) { .cattail-save-slots-page { padding-left:5vw; padding-right:5vw; } .cattail-save-slots-logo { font-size:34px; letter-spacing:10px; } .cattail-save-slots-row { grid-template-columns:1fr; gap:10px; } .cattail-save-slots-resources { justify-content:flex-start; } }
			`
			document.head.append(style)
		}
	}
})
