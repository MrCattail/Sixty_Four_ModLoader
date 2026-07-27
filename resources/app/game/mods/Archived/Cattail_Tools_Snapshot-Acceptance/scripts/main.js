ModLoader.register({
	id: 'Cattail_Tools_Snapshot-Acceptance',
	init(api) {
		const MOD_ID = 'Cattail_Tools_Snapshot-Acceptance'
		const STYLE_ID = 'cattail-snapshot-acceptance-style'
		const TOGGLE_ID = 'cattail-snapshot-acceptance-toggle'
		const PANEL_ID = 'cattail-snapshot-acceptance-panel'
		const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
		const state = {
			game: null,
			panel: null,
			toggle: null,
			list: [],
			log: [],
			busy: false,
			capabilities: null,
			releaseToggle: null,
			releasePanelHud: null
		}

		const TEXT = {
			en: {
				toggle: 'Snapshot API acceptance',
				title: 'Snapshot API Acceptance',
				temporary: 'TEMPORARY TEST MOD — only this Mod/current-save snapshot namespace is touched.',
				close: 'Close',
				capabilities: 'Capabilities',
				tests: 'Contract tests',
				manual: 'Manual operations',
				runAll: 'Run all',
				basic: 'Basic',
				rotation: 'Rotation',
				errors: 'Errors',
				createText: 'Create text',
				createBytes: 'Create bytes',
				refresh: 'Refresh',
				prune: 'Prune',
				readLatest: 'Read latest',
				deleteLatest: 'Delete latest',
				deleteAll: 'Delete all',
				snapshots: 'Own current-save snapshots',
				noSnapshots: 'No snapshots.',
				log: 'Result log',
				ready: 'Ready.',
				running: 'Running {name}...',
				passed: 'PASS {name}',
				failed: 'FAIL {name}: {message}',
				created: 'Created {type}: {id}',
				read: 'Read {id}: {preview}',
				deleted: 'Deleted {id}.',
				deletedAll: 'Deleted {count} snapshot(s).',
				confirmDeleteAll: 'Delete every snapshot in this temporary Mod/current-save namespace?',
				basicName: 'basic contract',
				rotationName: '10-item rotation',
				errorsName: 'stable errors',
				allName: 'all tests'
			},
			zh: {
				toggle: '快照 API 验收',
				title: '快照 API 验收',
				temporary: '临时测试 Mod——只会操作本 Mod／当前存档的快照命名空间。',
				close: '关闭',
				capabilities: '能力',
				tests: '合同测试',
				manual: '手动操作',
				runAll: '运行全部',
				basic: '基础测试',
				rotation: '轮转测试',
				errors: '错误测试',
				createText: '创建文本',
				createBytes: '创建字节',
				refresh: '刷新',
				prune: '执行轮转',
				readLatest: '读取最新',
				deleteLatest: '删除最新',
				deleteAll: '删除全部',
				snapshots: '本 Mod／当前存档快照',
				noSnapshots: '没有快照。',
				log: '结果日志',
				ready: '已就绪。',
				running: '正在运行{name}……',
				passed: '通过：{name}',
				failed: '失败：{name}：{message}',
				created: '已创建{type}：{id}',
				read: '已读取 {id}：{preview}',
				deleted: '已删除 {id}。',
				deletedAll: '已删除 {count} 个快照。',
				confirmDeleteAll: '删除这个临时 Mod／当前存档命名空间中的全部快照？',
				basicName: '基础合同',
				rotationName: '10 项轮转',
				errorsName: '稳定错误',
				allName: '全部测试'
			}
		}

		function languageGroup() {
			return ['sch', 'modsch', 'tch'].includes(String(state.game?.language || '').toLowerCase()) ? TEXT.zh : TEXT.en
		}

		function text(key, values) {
			const source = languageGroup()[key] || TEXT.en[key] || key
			return source.replace(/\{(\w+)\}/g, function (match, name) {
				return values && values[name] !== undefined ? String(values[name]) : match
			})
		}

		function installStyle() {
			if (document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				#${TOGGLE_ID} {
					box-sizing: border-box;
					width: 56px;
					height: 32px;
					border: 1px solid rgba(227,253,67,.8);
					border-radius: 7px;
					background: linear-gradient(135deg, rgba(227,253,67,.96), rgba(76,185,107,.94));
					color: #102016;
					box-shadow: 0 0 16px rgba(166,242,70,.48);
					font: 800 10px/1 Montserrat, Arial, sans-serif;
					letter-spacing: .5px;
					cursor: pointer;
					outline: none;
				}
				#${TOGGLE_ID}:hover { filter: brightness(1.08); }
				#${PANEL_ID} {
					position: fixed;
					z-index: 10004;
					top: 72px;
					right: 72px;
					box-sizing: border-box;
					display: none;
					width: min(620px, calc(100vw - 32px));
					max-height: calc(100vh - 110px);
					overflow: auto;
					border: 1px solid rgba(227,253,67,.55);
					border-radius: 10px;
					padding: 14px;
					background: rgba(18,21,24,.94);
					color: rgba(255,255,255,.9);
					box-shadow: 0 18px 52px rgba(0,0,0,.58), 0 0 28px rgba(166,242,70,.18);
					backdrop-filter: blur(14px);
					font: 12px/1.45 Montserrat, Arial, sans-serif;
					scrollbar-width: thin;
					scrollbar-color: rgba(210,210,210,.62) transparent;
				}
				#${PANEL_ID}.active { display: grid; gap: 10px; }
				#${PANEL_ID}::-webkit-scrollbar, #${PANEL_ID} .snapshot-acceptance-list::-webkit-scrollbar { width: 4px; }
				#${PANEL_ID}::-webkit-scrollbar-track, #${PANEL_ID} .snapshot-acceptance-list::-webkit-scrollbar-track { background: transparent; }
				#${PANEL_ID}::-webkit-scrollbar-thumb, #${PANEL_ID} .snapshot-acceptance-list::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(210,210,210,.62); }
				#${PANEL_ID} button { outline: none; }
				#${PANEL_ID} .snapshot-acceptance-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
				#${PANEL_ID} h2, #${PANEL_ID} h3 { margin: 0; }
				#${PANEL_ID} h2 { color: #e3fd43; font-size: 16px; }
				#${PANEL_ID} h3 { color: rgba(255,255,255,.84); font-size: 12px; }
				#${PANEL_ID} .snapshot-acceptance-warning { border-radius: 6px; padding: 7px 9px; background: rgba(227,253,67,.1); color: #e3fd43; }
				#${PANEL_ID} .snapshot-acceptance-section { display: grid; gap: 6px; border-top: 1px solid rgba(255,255,255,.12); padding-top: 9px; }
				#${PANEL_ID} .snapshot-acceptance-actions { display: flex; flex-wrap: wrap; gap: 6px; }
				#${PANEL_ID} .snapshot-acceptance-button {
					border: 1px solid rgba(255,255,255,.18);
					border-radius: 6px;
					padding: 6px 9px;
					background: rgba(255,255,255,.08);
					color: rgba(255,255,255,.9);
					cursor: pointer;
				}
				#${PANEL_ID} .snapshot-acceptance-button:hover:not(:disabled) { border-color: rgba(227,253,67,.55); background: rgba(227,253,67,.1); }
				#${PANEL_ID} .snapshot-acceptance-button.primary { border-color: transparent; background: linear-gradient(135deg, #e3fd43, #4cb96b); color: #102016; font-weight: 700; }
				#${PANEL_ID} .snapshot-acceptance-button.danger { border-color: rgba(255,96,96,.35); color: #ffaaaa; }
				#${PANEL_ID} .snapshot-acceptance-button:disabled { cursor: default; opacity: .42; }
				#${PANEL_ID} .snapshot-acceptance-status { min-height: 18px; color: rgba(255,255,255,.74); }
				#${PANEL_ID} .snapshot-acceptance-status[data-tone=pass] { color: #a6f246; }
				#${PANEL_ID} .snapshot-acceptance-status[data-tone=fail] { color: #ff9c9c; }
				#${PANEL_ID} .snapshot-acceptance-capabilities, #${PANEL_ID} .snapshot-acceptance-log {
					margin: 0;
					border-radius: 6px;
					padding: 8px;
					background: rgba(0,0,0,.24);
					color: rgba(255,255,255,.76);
					font: 11px/1.45 Consolas, monospace;
					white-space: pre-wrap;
					overflow-wrap: anywhere;
				}
				#${PANEL_ID} .snapshot-acceptance-list { display: grid; gap: 4px; max-height: 190px; overflow: auto; padding-right: 4px; }
				#${PANEL_ID} .snapshot-acceptance-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 8px; border-radius: 5px; padding: 6px 8px; background: rgba(255,255,255,.055); }
				#${PANEL_ID} .snapshot-acceptance-row-id { min-width: 0; overflow: hidden; color: rgba(255,255,255,.84); text-overflow: ellipsis; white-space: nowrap; }
				#${PANEL_ID} .snapshot-acceptance-row-meta { color: rgba(255,255,255,.5); white-space: nowrap; }
				@media (max-width: 720px) {
					#${PANEL_ID} { top: 52px; right: 16px; }
					#${PANEL_ID} .snapshot-acceptance-row { grid-template-columns: 1fr; }
				}
			`
			document.head.appendChild(style)
		}

		function createElement(tag, className, content) {
			const node = document.createElement(tag)
			if (className) node.className = className
			if (content !== undefined) node.textContent = content
			return node
		}

		function stopGameInput(event) {
			event.preventDefault()
			event.stopPropagation()
		}

		function stopGamePropagation(event) {
			event.stopPropagation()
		}

		function addButton(container, labelKey, action, options) {
			const button = createElement('button', 'snapshot-acceptance-button' + (options?.primary ? ' primary' : '') + (options?.danger ? ' danger' : ''), text(labelKey))
			button.type = 'button'
			button.tabIndex = -1
			button.dataset.action = labelKey
			button.addEventListener('mousedown', stopGameInput, true)
			button.addEventListener('click', function (event) {
				stopGameInput(event)
				action()
			}, true)
			container.appendChild(button)
			return button
		}

		function setStatus(message, tone) {
			if (!state.panel) return
			const status = state.panel.querySelector('.snapshot-acceptance-status')
			if (!status) return
			status.textContent = message
			status.dataset.tone = tone || ''
		}

		function addLog(message, tone) {
			state.log.unshift(`${new Date().toLocaleTimeString()} ${tone === 'pass' ? 'PASS' : tone === 'fail' ? 'FAIL' : 'INFO'} ${message}`)
			state.log = state.log.slice(0, 40)
			const target = state.panel?.querySelector('.snapshot-acceptance-log')
			if (target) target.textContent = state.log.join('\n')
		}

		function updateBusy() {
			if (!state.panel) return
			for (const button of state.panel.querySelectorAll('button[data-action]')) button.disabled = state.busy
		}

		function assertContract(condition, message) {
			if (!condition) throw new Error(message)
		}

		function formatBytes(value) {
			const bytes = Math.max(0, Number(value) || 0)
			if (bytes < 1024) return `${bytes} B`
			return `${(bytes / 1024).toFixed(bytes >= 10240 ? 1 : 2)} KiB`
		}

		function renderCapabilities() {
			const target = state.panel?.querySelector('.snapshot-acceptance-capabilities')
			if (!target) return
			target.textContent = state.capabilities ? JSON.stringify(state.capabilities, null, 2) : '-'
		}

		function renderList() {
			const target = state.panel?.querySelector('.snapshot-acceptance-list')
			if (!target) return
			target.innerHTML = ''
			if (!state.list.length) {
				target.appendChild(createElement('div', 'snapshot-acceptance-row-meta', text('noSnapshots')))
				return
			}
			for (const item of state.list) {
				const row = createElement('div', 'snapshot-acceptance-row')
				row.appendChild(createElement('span', 'snapshot-acceptance-row-id', item.id))
				row.appendChild(createElement('span', 'snapshot-acceptance-row-meta', item.payloadType))
				row.appendChild(createElement('span', 'snapshot-acceptance-row-meta', formatBytes(item.bytes)))
				target.appendChild(row)
			}
		}

		async function refreshList() {
			state.list = await api.storage.snapshots.list()
			renderList()
			return state.list
		}

		function payloadPreview(data) {
			if (typeof data === 'string') return data.length > 90 ? data.slice(0, 90) + '…' : data
			if (data instanceof Uint8Array) return `[${Array.from(data.slice(0, 20)).join(', ')}${data.length > 20 ? ', …' : ''}]`
			return String(data)
		}

		async function expectError(label, expectedCode, operation) {
			try {
				await operation()
			} catch (error) {
				assertContract(error?.name === 'ModLoaderSnapshotError', `${label}: expected ModLoaderSnapshotError`)
				assertContract(error.code === expectedCode, `${label}: expected ${expectedCode}, got ${error.code || 'none'}`)
				addLog(`${label} -> ${expectedCode}`, 'pass')
				return
			}
			throw new Error(`${label}: expected ${expectedCode}, operation succeeded`)
		}

		async function basicContractTest() {
			const snapshots = api.storage.snapshots
			const capabilities = await snapshots.capabilities()
			state.capabilities = capabilities
			renderCapabilities()
			assertContract(api.storage.version === '1.0.0', `storage version ${api.storage.version}`)
			assertContract(capabilities.apiVersion === '1.0.0', `API version ${capabilities.apiVersion}`)
			assertContract(capabilities.activeSave === true, 'active save context is false')
			assertContract(capabilities.maxPayloadBytes === MAX_PAYLOAD_BYTES, 'unexpected payload limit')
			assertContract(capabilities.maxSnapshotsPerNamespace === 10, 'unexpected snapshot limit')

			const marker = `snapshot-acceptance-text-${Date.now()}`
			const textInfo = await snapshots.create({
				data: marker,
				reason: 'acceptance-basic-text',
				tags: { suite: 'acceptance', type: 'utf8' }
			})
			const textRead = await snapshots.read({ id: textInfo.id })
			assertContract(textInfo.payloadType === 'utf8', 'text create type was not utf8')
			assertContract(textRead.info.id === textInfo.id, 'text read id mismatch')
			assertContract(textRead.data === marker, 'text payload mismatch')

			const bytePayload = Uint8Array.from([0, 1, 2, 127, 128, 254, 255])
			const byteInfo = await snapshots.create({
				data: bytePayload,
				reason: 'acceptance-basic-bytes',
				tags: { suite: 'acceptance', type: 'bytes' }
			})
			const byteRead = await snapshots.read({ id: byteInfo.id })
			assertContract(byteInfo.payloadType === 'bytes', 'byte create type was not bytes')
			assertContract(byteRead.data instanceof Uint8Array, 'byte read was not Uint8Array')
			assertContract(Array.from(byteRead.data).join(',') === Array.from(bytePayload).join(','), 'byte payload mismatch')

			const list = await refreshList()
			assertContract(list.some(item => item.id === textInfo.id), 'text snapshot missing from list')
			assertContract(list.some(item => item.id === byteInfo.id), 'byte snapshot missing from list')
			assertContract(list.every((item, index) => index === 0 || list[index - 1].createdAt >= item.createdAt), 'list is not newest first')
			const pruned = await snapshots.prune()
			assertContract(Array.isArray(pruned.removedIds), 'prune removedIds is not an array')
			assertContract(pruned.remainingCount <= 10, 'prune remainingCount exceeded 10')
			addLog(`${text('basicName')}: ${textInfo.id}, ${byteInfo.id}`, 'pass')
		}

		async function rotationContractTest() {
			const created = []
			for (let index = 0; index < 12; index++) {
				created.push(await api.storage.snapshots.create({
					data: `rotation-${index}-${Date.now()}`,
					reason: 'acceptance-rotation',
					tags: { suite: 'rotation', index }
				}))
				await new Promise(resolve => setTimeout(resolve, 2))
			}
			const list = await refreshList()
			const ids = new Set(list.map(item => item.id))
			assertContract(list.length === 10, `expected 10 snapshots, got ${list.length}`)
			assertContract(!ids.has(created[0].id) && !ids.has(created[1].id), 'oldest rotation records were not pruned')
			assertContract(ids.has(created[created.length - 1].id), 'newest rotation record is missing')
			assertContract(list.every((item, index) => index === 0 || list[index - 1].createdAt >= item.createdAt), 'rotation list is not newest first')
			addLog(`${text('rotationName')}: 12 -> ${list.length}`, 'pass')
		}

		async function errorContractTest() {
			const snapshots = api.storage.snapshots
			await expectError('missing reason', 'INVALID_PAYLOAD', function () {
				return snapshots.create({ data: 'invalid', reason: '' })
			})
			await expectError('invalid data', 'INVALID_PAYLOAD', function () {
				return snapshots.create({ data: { invalid: true }, reason: 'invalid-data' })
			})
			const badTags = { constructor: 'blocked' }
			await expectError('prototype key', 'INVALID_PAYLOAD', function () {
				return snapshots.create({ data: 'invalid', reason: 'invalid-tags', tags: badTags })
			})
			await expectError('oversized payload', 'TOO_LARGE', function () {
				return snapshots.create({ data: new Uint8Array(MAX_PAYLOAD_BYTES + 1), reason: 'oversized' })
			})
			await expectError('missing id', 'NOT_FOUND', function () {
				return snapshots.read({ id: 'missing-snapshot-000000000000000000000000' })
			})
			addLog(text('errorsName'), 'pass')
		}

		async function runNamed(nameKey, operation) {
			if (state.busy) return
			state.busy = true
			updateBusy()
			const name = text(nameKey)
			setStatus(text('running', { name }), '')
			try {
				await operation()
				setStatus(text('passed', { name }), 'pass')
			} catch (error) {
				const message = `${error?.code ? error.code + ' ' : ''}${error?.message || String(error)}`
				setStatus(text('failed', { name, message }), 'fail')
				addLog(`${name}: ${message}`, 'fail')
			} finally {
				state.busy = false
				updateBusy()
			}
		}

		async function runAllTests() {
			await basicContractTest()
			await rotationContractTest()
			await errorContractTest()
		}

		async function createManual(type) {
			const bytes = type === 'bytes'
			const data = bytes
				? Uint8Array.from([0, 16, 32, 64, 128, 192, 255])
				: `manual-text-${new Date().toISOString()}`
			const info = await api.storage.snapshots.create({
				data,
				reason: bytes ? 'acceptance-manual-bytes' : 'acceptance-manual-text',
				tags: { suite: 'manual', type }
			})
			addLog(text('created', { type, id: info.id }), 'pass')
			await refreshList()
		}

		async function readLatest() {
			const list = await refreshList()
			assertContract(list.length > 0, text('noSnapshots'))
			const record = await api.storage.snapshots.read({ id: list[0].id })
			addLog(text('read', { id: record.info.id, preview: payloadPreview(record.data) }), 'pass')
		}

		async function deleteLatest() {
			const list = await refreshList()
			assertContract(list.length > 0, text('noSnapshots'))
			await api.storage.snapshots.remove({ id: list[0].id })
			addLog(text('deleted', { id: list[0].id }), 'pass')
			await refreshList()
		}

		async function pruneManual() {
			const result = await api.storage.snapshots.prune()
			addLog(`prune: removed ${result.removedIds.length}, remaining ${result.remainingCount}`, 'pass')
			await refreshList()
		}

		async function deleteAll() {
			const list = await refreshList()
			if (!list.length) return
			if (!window.confirm(text('confirmDeleteAll'))) return
			let count = 0
			for (const item of list) {
				await api.storage.snapshots.remove({ id: item.id })
				count++
			}
			addLog(text('deletedAll', { count }), 'pass')
			await refreshList()
		}

		function buildSection(titleKey) {
			const section = createElement('section', 'snapshot-acceptance-section')
			section.appendChild(createElement('h3', '', text(titleKey)))
			const actions = createElement('div', 'snapshot-acceptance-actions')
			section.appendChild(actions)
			return { section, actions }
		}

		function buildPanel() {
			document.getElementById(PANEL_ID)?.remove()
			const panel = createElement('aside')
			panel.id = PANEL_ID
			panel.setAttribute('aria-label', text('title'))
			panel.tabIndex = -1
			for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel']) {
				panel.addEventListener(type, stopGamePropagation)
			}
			panel.addEventListener('contextmenu', stopGameInput)

			const header = createElement('div', 'snapshot-acceptance-header')
			header.appendChild(createElement('h2', '', text('title')))
			const close = createElement('button', 'snapshot-acceptance-button', text('close'))
			close.type = 'button'
			close.tabIndex = -1
			close.addEventListener('mousedown', stopGameInput, true)
			close.addEventListener('click', function (event) {
				stopGameInput(event)
				setPanelOpen(false)
			}, true)
			header.appendChild(close)
			panel.appendChild(header)
			panel.appendChild(createElement('div', 'snapshot-acceptance-warning', text('temporary')))

			const capabilitySection = createElement('section', 'snapshot-acceptance-section')
			capabilitySection.appendChild(createElement('h3', '', text('capabilities')))
			capabilitySection.appendChild(createElement('pre', 'snapshot-acceptance-capabilities', '-'))
			panel.appendChild(capabilitySection)

			const tests = buildSection('tests')
			addButton(tests.actions, 'runAll', function () { runNamed('allName', runAllTests) }, { primary: true })
			addButton(tests.actions, 'basic', function () { runNamed('basicName', basicContractTest) })
			addButton(tests.actions, 'rotation', function () { runNamed('rotationName', rotationContractTest) })
			addButton(tests.actions, 'errors', function () { runNamed('errorsName', errorContractTest) })
			panel.appendChild(tests.section)

			const manual = buildSection('manual')
			addButton(manual.actions, 'createText', function () { runNamed('createText', function () { return createManual('utf8') }) })
			addButton(manual.actions, 'createBytes', function () { runNamed('createBytes', function () { return createManual('bytes') }) })
			addButton(manual.actions, 'refresh', function () { runNamed('refresh', refreshList) })
			addButton(manual.actions, 'prune', function () { runNamed('prune', pruneManual) })
			addButton(manual.actions, 'readLatest', function () { runNamed('readLatest', readLatest) })
			addButton(manual.actions, 'deleteLatest', function () { runNamed('deleteLatest', deleteLatest) }, { danger: true })
			addButton(manual.actions, 'deleteAll', function () { runNamed('deleteAll', deleteAll) }, { danger: true })
			panel.appendChild(manual.section)

			const listSection = createElement('section', 'snapshot-acceptance-section')
			listSection.appendChild(createElement('h3', '', text('snapshots')))
			listSection.appendChild(createElement('div', 'snapshot-acceptance-list'))
			panel.appendChild(listSection)

			const logSection = createElement('section', 'snapshot-acceptance-section')
			logSection.appendChild(createElement('h3', '', text('log')))
			logSection.appendChild(createElement('pre', 'snapshot-acceptance-log', ''))
			panel.appendChild(logSection)
			panel.appendChild(createElement('div', 'snapshot-acceptance-status', text('ready')))
			document.body.appendChild(panel)
			state.panel = panel
			state.releasePanelHud = api.ui?.hud?.register?.({ id: 'snapshot-acceptance-panel', element: panel, side: 'right' })
			renderCapabilities()
			renderList()
			return panel
		}

		function setPanelOpen(open) {
			if (!state.panel?.isConnected) buildPanel()
			state.panel.classList.toggle('active', !!open)
			state.toggle?.classList.toggle('active', !!open)
			if (open) {
				api.storage.snapshots.capabilities().then(function (capabilities) {
					state.capabilities = capabilities
					renderCapabilities()
				}).catch(function (error) {
					setStatus(text('failed', { name: text('capabilities'), message: error.message }), 'fail')
				})
				refreshList().catch(function (error) {
					setStatus(text('failed', { name: text('refresh'), message: error.message }), 'fail')
				})
			}
		}

		function buildToggle() {
			document.getElementById(TOGGLE_ID)?.remove()
			const toggle = createElement('button', '', 'SNAP')
			toggle.id = TOGGLE_ID
			toggle.type = 'button'
			toggle.tabIndex = -1
			toggle.title = text('toggle')
			toggle.setAttribute('aria-label', text('toggle'))
			toggle.addEventListener('mousedown', stopGameInput, true)
			toggle.addEventListener('click', function (event) {
				stopGameInput(event)
				setPanelOpen(!state.panel?.classList.contains('active'))
			}, true)
			state.releaseToggle = api.ui?.registerCornerButton?.({
				id: 'snapshot-acceptance',
				element: toggle,
				anchor: 'game-bottom-right',
				order: 99,
				hideOnMobile: false
			})
			if (!toggle.isConnected) document.body.appendChild(toggle)
			state.toggle = toggle
		}

		function install(game) {
			state.game = game
			installStyle()
			buildPanel()
			buildToggle()
			setStatus(text('ready'), '')
		}

		api.on('afterGameInit', function (payload, game) {
			install(game)
		})

		api.on('afterWords', function (words, game) {
			if (game) state.game = game
			return words
		})
	}
})
