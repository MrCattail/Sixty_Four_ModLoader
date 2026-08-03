ModLoader.register({
	id: 'Cattail_Tools_Library-Acceptance',
	init(api) {
		const STYLE_ID = 'cattail-library-acceptance-style'
		const TOGGLE_ID = 'cattail-library-acceptance-toggle'
		const PANEL_ID = 'cattail-library-acceptance-panel'
		const EXTENSION = '.cattail-library-test.json'
		const CACHE_BUCKET = 'thumbnails'
		const RUN_TAG = Date.now().toString(36)
		const library = api.storage.libraries.open('acceptance')
		const state = {
			game: null,
			panel: null,
			toggle: null,
			busy: false,
			capabilities: null,
			counts: { active: 0, trash: 0, quarantine: 0, cache: 0 },
			log: [],
			releaseToggle: null,
			releasePanelHud: null
		}

		const TEXT = {
			en: {
				toggle: 'Library API acceptance',
				title: 'Library API Acceptance',
				temporary: 'TEMPORARY TEST MOD — only library-api-acceptance/ is used; world and save data are untouched. A full game restart is required after enabling.',
				close: 'Close',
				capabilities: 'Capabilities',
				counts: 'Managed items',
				tests: 'Automated in-game tests',
				manual: 'Manual acceptance',
				runAll: 'Run all',
				basic: 'Basic I/O',
				errors: 'Errors & quota',
				lifecycle: 'Lifecycle',
				cache: 'Cache LRU',
				watcher: 'Watcher',
				refresh: 'Refresh',
				openFolder: 'Open folder',
				externalWatch: 'External watcher',
				clean: 'Clean test data',
				log: 'Result log',
				ready: 'Ready. Run all automated tests first.',
				running: 'Running {name}...',
				passed: 'PASS {name}',
				failed: 'FAIL {name}: {message}',
				allName: 'all automated tests',
				basicName: 'basic I/O and replacement',
				errorsName: 'stable errors and quota',
				lifecycleName: 'trash, restore, quarantine, remove',
				cacheName: 'cache LRU',
				watcherName: 'native watcher',
				externalName: 'external filesystem watcher',
				cleanName: 'test-data cleanup',
				externalInstruction: 'Explorer is open. Delete {name} within 30 seconds (or rename it while preserving the test suffix).',
				externalTimeout: 'No stable external filesystem event arrived within 30 seconds.',
				folderOpened: 'The managed folder was requested from the main process.'
			},
			zh: {
				toggle: '蓝图库 API 验收',
				title: '蓝图库 API 验收',
				temporary: '临时测试 Mod——只使用 library-api-acceptance/；不会修改世界或存档数据。启用后必须完整重启游戏。',
				close: '关闭',
				capabilities: '能力',
				counts: '受管项目',
				tests: '游戏内自动测试',
				manual: '手动验收',
				runAll: '运行全部',
				basic: '基础读写',
				errors: '错误与配额',
				lifecycle: '文件生命周期',
				cache: '缓存 LRU',
				watcher: 'Watcher',
				refresh: '刷新',
				openFolder: '打开文件夹',
				externalWatch: '外部变更监听',
				clean: '清理测试数据',
				log: '结果日志',
				ready: '已就绪。请先运行全部自动测试。',
				running: '正在运行{name}……',
				passed: '通过：{name}',
				failed: '失败：{name}：{message}',
				allName: '全部自动测试',
				basicName: '基础读写与替换',
				errorsName: '稳定错误与配额',
				lifecycleName: '垃圾区、恢复、隔离和永久删除',
				cacheName: '缓存 LRU',
				watcherName: '原生 Watcher',
				externalName: '外部文件系统监听',
				cleanName: '测试数据清理',
				externalInstruction: '文件夹已打开。请在 30 秒内删除 {name}（或在保留测试后缀的前提下重命名）。',
				externalTimeout: '30 秒内没有收到稳定的外部文件事件。',
				folderOpened: '已请求主进程打开受管文件夹。'
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

		function fileName(label) {
			return `${label}-${RUN_TAG}${EXTENSION}`
		}

		function assertContract(condition, message) {
			if (!condition) throw new Error(message)
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

		function setStatus(message, tone) {
			const target = state.panel?.querySelector('.library-acceptance-status')
			if (!target) return
			target.textContent = message
			target.dataset.tone = tone || ''
		}

		function addLog(message, tone) {
			state.log.unshift(`${new Date().toLocaleTimeString()} ${tone === 'pass' ? 'PASS' : tone === 'fail' ? 'FAIL' : 'INFO'} ${message}`)
			state.log = state.log.slice(0, 60)
			const target = state.panel?.querySelector('.library-acceptance-log')
			if (target) target.textContent = state.log.join('\n')
		}

		function updateBusy() {
			if (!state.panel) return
			for (const button of state.panel.querySelectorAll('button[data-action]')) button.disabled = state.busy
		}

		function renderCapabilities() {
			const target = state.panel?.querySelector('.library-acceptance-capabilities')
			if (target) target.textContent = state.capabilities ? JSON.stringify(state.capabilities, null, 2) : '-'
		}

		function renderCounts() {
			const target = state.panel?.querySelector('.library-acceptance-counts')
			if (!target) return
			target.textContent = `active=${state.counts.active} | trash=${state.counts.trash} | quarantine=${state.counts.quarantine} | cache=${state.counts.cache}`
		}

		async function listArea(area, bucket) {
			return library.list(bucket ? { area, bucket } : { area })
		}

		async function refreshState() {
			const [active, trash, quarantine, cache] = await Promise.all([
				listArea('active'),
				listArea('trash'),
				listArea('quarantine'),
				listArea('cache', CACHE_BUCKET)
			])
			state.counts = { active: active.length, trash: trash.length, quarantine: quarantine.length, cache: cache.length }
			renderCounts()
			return { active, trash, quarantine, cache }
		}

		async function cleanupLibrary() {
			const active = await listArea('active')
			for (const item of active) await library.trash({ name: item.name, expectedRevision: item.revision })
			for (const area of ['trash', 'quarantine']) {
				const items = await listArea(area)
				for (const item of items) await library.remove({ area, name: item.name, expectedRevision: item.revision })
			}
			const cache = await listArea('cache', CACHE_BUCKET)
			for (const item of cache) await library.remove({ area: 'cache', bucket: CACHE_BUCKET, name: item.name, expectedRevision: item.revision })
			await refreshState()
		}

		async function expectError(label, expectedCode, operation) {
			try {
				await operation()
			} catch (error) {
				assertContract(error?.name === 'ModLoaderLibraryError', `${label}: expected ModLoaderLibraryError`)
				assertContract(error.code === expectedCode, `${label}: expected ${expectedCode}, got ${error.code || 'none'}`)
				addLog(`${label} -> ${expectedCode}`, 'pass')
				return
			}
			throw new Error(`${label}: expected ${expectedCode}, operation succeeded`)
		}

		async function capabilitiesTest() {
			const capabilities = await library.capabilities()
			state.capabilities = capabilities
			renderCapabilities()
			assertContract(api.state?.version === '0.3.0', `Loader version ${api.state?.version}`)
			assertContract(api.storage.libraries.version === '1.0.0', `Library API ${api.storage.libraries.version}`)
			assertContract(capabilities.apiVersion === '1.0.0', `capability API ${capabilities.apiVersion}`)
			assertContract(capabilities.libraryId === 'acceptance', `library id ${capabilities.libraryId}`)
			assertContract(capabilities.maxFileBytes === 1024, `file limit ${capabilities.maxFileBytes}`)
			assertContract(capabilities.maxTotalBytes === 8192, `total limit ${capabilities.maxTotalBytes}`)
			assertContract(capabilities.maxEntries === 6, `entry limit ${capabilities.maxEntries}`)
			assertContract(capabilities.cache?.maxBytes === 64, `cache limit ${capabilities.cache?.maxBytes}`)
			assertContract(capabilities.pathsExposed === false, 'capabilities exposed a path')
			assertContract(!('directory' in capabilities), 'capabilities returned a directory')
		}

		async function basicTest() {
			await cleanupLibrary()
			await capabilitiesTest()
			const textPayload = JSON.stringify({ type: 'utf8', marker: RUN_TAG })
			const textCreated = await library.write({ name: fileName('basic-text'), data: textPayload })
			const textRead = await library.read({ name: textCreated.info.name, expectedRevision: textCreated.info.revision, encoding: 'utf8' })
			assertContract(textRead.data === textPayload, 'UTF-8 payload mismatch')
			const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255])
			const bytesCreated = await library.write({ name: fileName('basic-bytes'), data: bytes })
			const bytesRead = await library.read({ name: bytesCreated.info.name, expectedRevision: bytesCreated.info.revision })
			assertContract(bytesRead.data instanceof Uint8Array, 'binary read was not Uint8Array')
			assertContract(Array.from(bytesRead.data).join(',') === Array.from(bytes).join(','), 'binary payload mismatch')
			const first = await library.write({ name: fileName('replacement'), data: '{"version":1}' })
			const replacement = await library.write({ name: first.info.name, data: '{"version":2}', expectedRevision: first.info.revision })
			assertContract(replacement.backup?.revision === first.info.revision, 'replacement backup is missing')
			const trash = await listArea('trash')
			assertContract(trash.some(item => item.name === replacement.backup.name), 'replacement backup is not in trash')
			await expectError('stale replacement revision', 'REVISION_CONFLICT', function () {
				return library.rename({ name: replacement.info.name, newName: fileName('stale-rename'), expectedRevision: first.info.revision })
			})
			const restored = await library.restore({ name: replacement.backup.name, newName: fileName('replacement-restored'), expectedRevision: replacement.backup.revision })
			const restoredRead = await library.read({ name: restored.name, expectedRevision: restored.revision, encoding: 'utf8' })
			assertContract(restoredRead.data === '{"version":1}', 'replacement backup payload mismatch')
			await cleanupLibrary()
		}

		async function errorsTest() {
			await cleanupLibrary()
			const duplicate = await library.write({ name: fileName('duplicate'), data: '{}' })
			await expectError('duplicate name', 'NAME_CONFLICT', function () {
				return library.write({ name: duplicate.info.name, data: '{}' })
			})
			await expectError('active permanent delete', 'PERMISSION_DENIED', function () {
				return library.remove({ area: 'active', name: duplicate.info.name, expectedRevision: duplicate.info.revision })
			})
			await expectError('path escape', 'PATH_INVALID', function () {
				return library.write({ name: `../escape${EXTENSION}`, data: '{}' })
			})
			await expectError('wrong extension', 'PATH_INVALID', function () {
				return library.write({ name: 'wrong.json', data: '{}' })
			})
			await expectError('oversized item', 'TOO_LARGE', function () {
				return library.write({ name: fileName('oversized'), data: new Uint8Array(1025) })
			})
			await expectError('missing item', 'NOT_FOUND', function () {
				return library.read({ name: fileName('missing') })
			})
			await expectError('undeclared library', 'PERMISSION_DENIED', function () {
				return api.storage.libraries.open('undeclared').capabilities()
			})
			await cleanupLibrary()
			for (let index = 0; index < 6; index++) {
				await library.write({ name: fileName(`quota-${index}`), data: '{}' })
			}
			await expectError('entry quota', 'QUOTA_EXCEEDED', function () {
				return library.write({ name: fileName('quota-overflow'), data: '{}' })
			})
			await cleanupLibrary()
		}

		async function lifecycleTest() {
			await cleanupLibrary()
			const created = await library.write({ name: fileName('lifecycle'), data: '{"lifecycle":true}' })
			const trashed = await library.trash({ name: created.info.name, expectedRevision: created.info.revision })
			assertContract((await listArea('active')).length === 0, 'trash left an active item')
			const restored = await library.restore({ name: trashed.name, expectedRevision: trashed.revision })
			assertContract(restored.area === 'active', 'restore did not return an active item')
			const quarantined = await library.quarantine({ name: restored.name, expectedRevision: restored.revision })
			assertContract(quarantined.area === 'quarantine', 'quarantine area mismatch')
			const removed = await library.remove({ area: 'quarantine', name: quarantined.name, expectedRevision: quarantined.revision })
			assertContract(removed.removed === true, 'quarantine remove did not confirm removal')
			await refreshState()
			assertContract(state.counts.active + state.counts.trash + state.counts.quarantine === 0, 'lifecycle left managed documents')
		}

		async function cacheTest() {
			await cleanupLibrary()
			const first = await library.write({ area: 'cache', bucket: CACHE_BUCKET, name: `cache-one-${RUN_TAG}.png`, data: new Uint8Array(40) })
			assertContract(first.pruned.length === 0, 'first cache write pruned an item')
			const second = await library.write({ area: 'cache', bucket: CACHE_BUCKET, name: `cache-two-${RUN_TAG}.png`, data: new Uint8Array(40) })
			assertContract(second.pruned.some(item => item.name === first.info.name), 'second cache write did not LRU-prune the first')
			const items = await listArea('cache', CACHE_BUCKET)
			assertContract(items.length === 1 && items[0].name === second.info.name, 'cache contents do not match the LRU result')
			await cleanupLibrary()
		}

		async function watcherTest() {
			await cleanupLibrary()
			const events = []
			const watcher = await library.watch(event => events.push(event))
			try {
				await library.write({ name: fileName('watcher'), data: '{"watch":true}' })
				const deadline = Date.now() + 5000
				while (Date.now() < deadline && !events.some(event => event?.type === 'changed' && event.names?.includes(fileName('watcher')))) {
					await new Promise(resolve => setTimeout(resolve, 100))
				}
				assertContract(events.some(event => event?.type === 'changed' && event.names?.includes(fileName('watcher'))), 'watcher did not report the stable active file')
			} finally {
				await watcher.close()
				await cleanupLibrary()
			}
		}

		async function runAllTests() {
			try {
				for (const [nameKey, operation] of [
					['basicName', basicTest],
					['errorsName', errorsTest],
					['lifecycleName', lifecycleTest],
					['cacheName', cacheTest],
					['watcherName', watcherTest]
				]) {
					await operation()
					addLog(text(nameKey), 'pass')
				}
			} finally {
				await cleanupLibrary()
			}
		}

		async function externalWatcherTest() {
			await cleanupLibrary()
			const sampleName = fileName('external-watch')
			await library.write({ name: sampleName, data: '{"editOrDeleteMe":true}' })
			let resolveEvent
			const eventPromise = new Promise(resolve => { resolveEvent = resolve })
			const watcher = await library.watch(event => {
				if (event?.type === 'changed' && (event.full || event.names?.includes(sampleName))) resolveEvent(event)
			})
			try {
				await library.openFolder({ area: 'active' })
				setStatus(text('externalInstruction', { name: sampleName }), '')
				const timeout = new Promise(resolve => setTimeout(() => resolve(null), 30000))
				const event = await Promise.race([eventPromise, timeout])
				if (!event) throw new Error(text('externalTimeout'))
				addLog(`external watcher: ${JSON.stringify(event)}`, 'pass')
			} finally {
				await watcher.close()
				await cleanupLibrary()
			}
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
				addLog(name, 'pass')
			} catch (error) {
				const message = `${error?.code ? error.code + ' ' : ''}${error?.message || String(error)}`
				setStatus(text('failed', { name, message }), 'fail')
				addLog(`${name}: ${message}`, 'fail')
			} finally {
				state.busy = false
				updateBusy()
			}
		}

		function addButton(container, labelKey, action, options) {
			const button = createElement('button', 'library-acceptance-button' + (options?.primary ? ' primary' : '') + (options?.danger ? ' danger' : ''), text(labelKey))
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

		function buildSection(titleKey) {
			const section = createElement('section', 'library-acceptance-section')
			section.appendChild(createElement('h3', '', text(titleKey)))
			const actions = createElement('div', 'library-acceptance-actions')
			section.appendChild(actions)
			return { section, actions }
		}

		function installStyle() {
			if (document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				#${TOGGLE_ID} { box-sizing: border-box; width: 56px; height: 32px; border: 1px solid rgba(227,253,67,.8); border-radius: 7px; background: linear-gradient(135deg, rgba(227,253,67,.96), rgba(76,185,107,.94)); color: #102016; box-shadow: 0 0 16px rgba(166,242,70,.48); font: 800 10px/1 Montserrat, Arial, sans-serif; letter-spacing: .5px; cursor: pointer; outline: none; }
				#${TOGGLE_ID}:hover { filter: brightness(1.08); }
				#${PANEL_ID} { position: fixed; z-index: 10004; top: 64px; right: 72px; box-sizing: border-box; display: none; width: min(650px, calc(100vw - 32px)); max-height: calc(100vh - 100px); overflow: auto; border: 1px solid rgba(227,253,67,.55); border-radius: 10px; padding: 14px; background: rgba(18,21,24,.95); color: rgba(255,255,255,.9); box-shadow: 0 18px 52px rgba(0,0,0,.58), 0 0 28px rgba(166,242,70,.18); backdrop-filter: blur(14px); font: 12px/1.45 Montserrat, Arial, sans-serif; scrollbar-width: thin; }
				#${PANEL_ID}.active { display: grid; gap: 10px; }
				#${PANEL_ID} button { outline: none; }
				#${PANEL_ID} .library-acceptance-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
				#${PANEL_ID} h2, #${PANEL_ID} h3 { margin: 0; }
				#${PANEL_ID} h2 { color: #e3fd43; font-size: 16px; }
				#${PANEL_ID} h3 { color: rgba(255,255,255,.84); font-size: 12px; }
				#${PANEL_ID} .library-acceptance-warning { border-radius: 6px; padding: 7px 9px; background: rgba(227,253,67,.1); color: #e3fd43; }
				#${PANEL_ID} .library-acceptance-section { display: grid; gap: 6px; border-top: 1px solid rgba(255,255,255,.12); padding-top: 9px; }
				#${PANEL_ID} .library-acceptance-actions { display: flex; flex-wrap: wrap; gap: 6px; }
				#${PANEL_ID} .library-acceptance-button { border: 1px solid rgba(255,255,255,.18); border-radius: 6px; padding: 6px 9px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.9); cursor: pointer; }
				#${PANEL_ID} .library-acceptance-button:hover:not(:disabled) { border-color: rgba(227,253,67,.55); background: rgba(227,253,67,.1); }
				#${PANEL_ID} .library-acceptance-button.primary { border-color: transparent; background: linear-gradient(135deg, #e3fd43, #4cb96b); color: #102016; font-weight: 700; }
				#${PANEL_ID} .library-acceptance-button.danger { border-color: rgba(255,96,96,.35); color: #ffaaaa; }
				#${PANEL_ID} .library-acceptance-button:disabled { cursor: default; opacity: .42; }
				#${PANEL_ID} .library-acceptance-status { min-height: 18px; color: rgba(255,255,255,.74); }
				#${PANEL_ID} .library-acceptance-status[data-tone=pass] { color: #a6f246; }
				#${PANEL_ID} .library-acceptance-status[data-tone=fail] { color: #ff9c9c; }
				#${PANEL_ID} .library-acceptance-capabilities, #${PANEL_ID} .library-acceptance-log { margin: 0; border-radius: 6px; padding: 8px; background: rgba(0,0,0,.24); color: rgba(255,255,255,.76); font: 11px/1.45 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
				#${PANEL_ID} .library-acceptance-log { max-height: 190px; overflow: auto; }
				#${PANEL_ID} .library-acceptance-counts { color: rgba(255,255,255,.72); font: 11px/1.45 Consolas, monospace; }
				@media (max-width: 720px) { #${PANEL_ID} { top: 52px; right: 16px; } }
			`
			document.head.appendChild(style)
		}

		function buildPanel() {
			document.getElementById(PANEL_ID)?.remove()
			const panel = createElement('aside')
			panel.id = PANEL_ID
			panel.setAttribute('aria-label', text('title'))
			panel.tabIndex = -1
			for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel']) panel.addEventListener(type, stopGamePropagation)
			panel.addEventListener('contextmenu', stopGameInput)

			const header = createElement('div', 'library-acceptance-header')
			header.appendChild(createElement('h2', '', text('title')))
			const close = createElement('button', 'library-acceptance-button', text('close'))
			close.type = 'button'
			close.tabIndex = -1
			close.addEventListener('mousedown', stopGameInput, true)
			close.addEventListener('click', function (event) { stopGameInput(event); setPanelOpen(false) }, true)
			header.appendChild(close)
			panel.appendChild(header)
			panel.appendChild(createElement('div', 'library-acceptance-warning', text('temporary')))

			const capabilitySection = createElement('section', 'library-acceptance-section')
			capabilitySection.appendChild(createElement('h3', '', text('capabilities')))
			capabilitySection.appendChild(createElement('pre', 'library-acceptance-capabilities', '-'))
			capabilitySection.appendChild(createElement('h3', '', text('counts')))
			capabilitySection.appendChild(createElement('div', 'library-acceptance-counts', 'active=0 | trash=0 | quarantine=0 | cache=0'))
			panel.appendChild(capabilitySection)

			const tests = buildSection('tests')
			addButton(tests.actions, 'runAll', function () { runNamed('allName', runAllTests) }, { primary: true })
			addButton(tests.actions, 'basic', function () { runNamed('basicName', basicTest) })
			addButton(tests.actions, 'errors', function () { runNamed('errorsName', errorsTest) })
			addButton(tests.actions, 'lifecycle', function () { runNamed('lifecycleName', lifecycleTest) })
			addButton(tests.actions, 'cache', function () { runNamed('cacheName', cacheTest) })
			addButton(tests.actions, 'watcher', function () { runNamed('watcherName', watcherTest) })
			panel.appendChild(tests.section)

			const manual = buildSection('manual')
			addButton(manual.actions, 'refresh', function () { runNamed('refresh', refreshState) })
			addButton(manual.actions, 'openFolder', function () { runNamed('openFolder', async function () { await library.openFolder({ area: 'active' }); setStatus(text('folderOpened'), 'pass') }) })
			addButton(manual.actions, 'externalWatch', function () { runNamed('externalName', externalWatcherTest) }, { primary: true })
			addButton(manual.actions, 'clean', function () { runNamed('cleanName', cleanupLibrary) }, { danger: true })
			panel.appendChild(manual.section)

			const logSection = createElement('section', 'library-acceptance-section')
			logSection.appendChild(createElement('h3', '', text('log')))
			logSection.appendChild(createElement('pre', 'library-acceptance-log', ''))
			panel.appendChild(logSection)
			panel.appendChild(createElement('div', 'library-acceptance-status', text('ready')))
			document.body.appendChild(panel)
			state.panel = panel
			state.releasePanelHud = api.ui?.hud?.register?.({ id: 'library-acceptance-panel', element: panel, side: 'right' })
			renderCapabilities()
			renderCounts()
			return panel
		}

		function setPanelOpen(open) {
			if (!state.panel?.isConnected) buildPanel()
			state.panel.classList.toggle('active', !!open)
			state.toggle?.classList.toggle('active', !!open)
			if (!open) return
			Promise.all([capabilitiesTest(), refreshState()]).catch(function (error) {
				setStatus(text('failed', { name: text('capabilities'), message: error.message }), 'fail')
			})
		}

		function buildToggle() {
			document.getElementById(TOGGLE_ID)?.remove()
			const toggle = createElement('button', '', 'LIB')
			toggle.id = TOGGLE_ID
			toggle.type = 'button'
			toggle.tabIndex = -1
			toggle.title = text('toggle')
			toggle.setAttribute('aria-label', text('toggle'))
			toggle.addEventListener('mousedown', stopGameInput, true)
			toggle.addEventListener('click', function (event) { stopGameInput(event); setPanelOpen(!state.panel?.classList.contains('active')) }, true)
			state.releaseToggle = api.ui?.registerCornerButton?.({ id: 'library-acceptance', element: toggle, anchor: 'game-bottom-right', order: 100, hideOnMobile: false })
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
