(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'
	const enableConfigKey = 'enableWindowSizePresets'
	const modeConfigKey = 'windowPresentationMode'
	const aspectConfigKey = 'windowAspectRatio'
	const presetConfigKey = 'windowSizePreset'
	const userPresetMarkerKey = 'modloader:' + MOD_ID + ':windowPresetUserSelected'
	const fallbackModeOptions = [
		{ value: 'fullscreen', label: 'Fullscreen' },
		{ value: 'borderless', label: 'Borderless' },
		{ value: 'window', label: 'Window' }
	]
	const fallbackAspectOptions = [
		{ value: '1:1', label: '1:1' },
		{ value: '4:3', label: '4:3' },
		{ value: '16:9', label: '16:9' }
	]
	const fallbackPresetOptions = [
		{ value: '1280x720', label: '1280 x 720' }
	]

	let previewEnabled = null
	let previewMode = null
	let previewAspect = null
	let previewPreset = null
	let cachedState = null
	let applying = false

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			setSelectOptions(api, modeConfigKey, buildModeOptions(api))
			setSelectOptions(api, aspectConfigKey, buildAspectOptions(api, null))
			setSelectOptions(api, presetConfigKey, fallbackPresetOptions)
			refreshWindowOptions(api)
			installConfigPreviewListener(api)
			api.on('afterGameInit', function () {
				refreshWindowOptions(api)
			})
		}
	})

	function installConfigPreviewListener(api) {
		try {
			window.addEventListener('modloader:config-preview', function (event) {
				const detail = event?.detail || {}
				if (detail.modId !== MOD_ID) return
				if (detail.key === enableConfigKey) previewEnabled = detail.value === true
				if (detail.key === modeConfigKey) {
					previewMode = normalizeMode(detail.value)
					api.config.set(modeConfigKey, previewMode)
				}
				if (detail.key === aspectConfigKey) {
					previewAspect = normalizeAspect(detail.value)
					api.config.set(aspectConfigKey, previewAspect)
					updatePresetOptionsForAspect(api)
				}
				if (detail.key === presetConfigKey) {
					previewPreset = String(detail.value || '')
					markUserPresetSelected()
					api.config.set(presetConfigKey, previewPreset)
				}
				if (detail.key === enableConfigKey || detail.key === modeConfigKey || detail.key === aspectConfigKey || detail.key === presetConfigKey) {
					applyConfiguredWindow(api)
				}
			})
		} catch (error) {}
	}

	async function refreshWindowOptions(api) {
		if (!api?.appWindow?.getState) return
		try {
			cachedState = await api.appWindow.getState()
			setSelectOptions(api, modeConfigKey, buildModeOptions(api))
			setSelectOptions(api, aspectConfigKey, buildAspectOptions(api, cachedState))
			updatePresetOptionsForAspect(api)
			syncConfigFromWindowState(api, cachedState)
			logWindowPresetProbe('refresh', cachedState)
		} catch (error) {
			console.warn('[Tweaks] Window presets unavailable.', error)
		}
	}

	function buildModeOptions(api) {
		return fallbackModeOptions.map(function (option) {
			return {
				value: option.value,
				label: getLocalizedConfigValueLabel(api, modeConfigKey, option.value, option.label)
			}
		})
	}

	function buildAspectOptions(api, state) {
		const ratios = Array.isArray(state?.aspectRatios) ? state.aspectRatios : []
		const options = ratios.map(function (ratio) {
			const id = String(ratio.id)
			return { value: id, label: getLocalizedConfigValueLabel(api, aspectConfigKey, id, String(ratio.label || ratio.id)) }
		})
		return options.length ? options : fallbackAspectOptions
	}

	function updatePresetOptionsForAspect(api) {
		const aspect = getConfiguredAspect(api)
		const presets = Array.isArray(cachedState?.presetsByAspect?.[aspect])
			? cachedState.presetsByAspect[aspect]
			: (cachedState?.aspect?.id === aspect && Array.isArray(cachedState?.presets) ? cachedState.presets : [])
		let options = presets.filter(function (preset) {
			return preset && preset.id
		}).map(function (preset) {
			return {
				value: String(preset.id),
				label: String(preset.label || ((preset.physicalWidth || preset.width) + ' x ' + (preset.physicalHeight || preset.height)))
			}
		})
		if (!options.length && cachedState?.aspectRatios?.some(function (entry) { return entry.id === aspect })) {
			options = fallbackPresetOptions
		}
		const activeOptions = options.length ? options : fallbackPresetOptions
		const selected = getConfiguredPreset(api)
		const fallback = getClosestPresetOption(activeOptions, selected)
		if (!activeOptions.some(function (option) { return option.value === selected }) && fallback) {
			previewPreset = fallback.value
			api.config.set(presetConfigKey, previewPreset)
		}
		setSelectOptions(api, presetConfigKey, activeOptions)
		if (previewPreset !== null) updateSelectValue(presetConfigKey, previewPreset)
	}

	function setSelectOptions(api, key, options) {
		const normalized = options.map(function (option) {
			return { value: String(option.value), label: String(option.label || option.value) }
		})
		if (key === presetConfigKey) {
			try {
				console.info('[Tweaks] windowPresetOptions ' + JSON.stringify({
					count: normalized.length,
					values: normalized.map(function (option) { return option.value })
				}))
			} catch (error) {}
		}
		const item = getManifestConfigItem(api, key)
		if (item) item.options = normalized
		const schemaItem = (api.state?.configs?.[MOD_ID]?.schema || []).find(function (entry) {
			return entry?.key === key
		})
		if (schemaItem) schemaItem.options = normalized
		updateSelectOptions(api, key, normalized)
	}

	function updateSelectOptions(api, key, options) {
		try {
			const select = findSelect(key)
			if (!select) return
			const current = key === modeConfigKey ? getConfiguredMode(api) : key === aspectConfigKey ? getConfiguredAspect(api) : getConfiguredPreset(api)
			const previousValue = select.value
			if (typeof select.setSelectOptions === 'function') {
				select.setSelectOptions(options)
			} else {
				select.textContent = ''
				for (const option of options) {
					const elementOption = document.createElement('option')
					elementOption.value = option.value
					elementOption.textContent = option.label
					select.appendChild(elementOption)
				}
			}
			const hasCurrent = options.some(function (option) { return option.value === current })
			const hasPrevious = options.some(function (option) { return option.value === previousValue })
			const fallbackOption = key === presetConfigKey
				? getClosestPresetOption(options, current || previousValue)
				: options[0]
			const fallback = fallbackOption?.value || previousValue
			const nextValue = hasCurrent ? current : (hasPrevious ? previousValue : fallback)
			if (typeof select.setSelectValue === 'function') select.setSelectValue(nextValue)
			else select.value = nextValue
		} catch (error) {}
	}

	function updateSelectValue(key, value) {
		const select = findSelect(key)
		if (!select) return
		if (typeof select.setSelectValue === 'function') select.setSelectValue(value)
		else select.value = value
	}

	function findSelect(key) {
		const selects = Array.from(document.querySelectorAll('.modloader-select-control.modloader-config-input, select.modloader-config-input'))
		return selects.find(function (entry) {
			return entry?.dataset?.modloaderModId === MOD_ID && entry?.dataset?.modloaderConfigKey === key
		}) || null
	}

	function getManifestConfigItem(api, key) {
		const config = api.state?.modById?.[MOD_ID]?.manifest?.config
		if (!config) return null
		if (Array.isArray(config)) return config.find(function (item) { return item?.key === key }) || null
		if (config[key] && typeof config[key] === 'object') return config[key]
		return null
	}

	function getLanguageCandidates(api) {
		const raw = String(api?.state?.game?.language || '').trim().toLowerCase()
		const candidates = []
		const add = function (language) {
			if (language && candidates.indexOf(language) === -1) candidates.push(language)
		}
		add(raw)
		if (raw === 'sch' || raw === 'modsch') {
			add('sch')
			add('modsch')
			add('zh-cn')
			add('zh')
		}
		if (raw === 'tch') {
			add('tch')
			add('zh-tw')
			add('sch')
		}
		add('en')
		return candidates
	}

	function pickLocalizedText(value, candidates) {
		if (typeof value === 'string') return value
		if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
		for (const language of candidates) {
			if (typeof value[language] === 'string') return value[language]
		}
		return ''
	}

	function getCatalogConfigText(api, key) {
		const languages = api?.state?.translationCatalog?.languages
		if (!languages || typeof languages !== 'object' || Array.isArray(languages)) return null
		for (const language of getLanguageCandidates(api)) {
			const config = languages[language]?.mods?.[MOD_ID]?.config?.[key]
			if (config && typeof config === 'object' && !Array.isArray(config)) return config
		}
		return null
	}

	function getLocalizedConfigValueLabel(api, key, value, fallback) {
		const catalogValueLabels = getCatalogConfigText(api, key)?.valueLabels
		const catalogLabel = catalogValueLabels && typeof catalogValueLabels === 'object' && !Array.isArray(catalogValueLabels)
			? catalogValueLabels[String(value)]
			: ''
		if (typeof catalogLabel === 'string' && catalogLabel) return catalogLabel
		const item = getManifestConfigItem(api, key)
		const manifestValueLabels = item?.valueLabels
		const manifestLabel = manifestValueLabels && typeof manifestValueLabels === 'object' && !Array.isArray(manifestValueLabels)
			? pickLocalizedText(manifestValueLabels[String(value)], getLanguageCandidates(api))
			: ''
		return manifestLabel || fallback || String(value)
	}

	function getConfiguredEnabled(api) {
		return previewEnabled === null ? api.config.get(enableConfigKey, true) !== false : previewEnabled === true
	}

	function getConfiguredMode(api) {
		return previewMode || normalizeMode(api.config.get(modeConfigKey, cachedState?.windowMode || 'fullscreen'))
	}

	function getConfiguredAspect(api) {
		return previewAspect || normalizeAspect(api.config.get(aspectConfigKey, cachedState?.selectedAspectRatio || '16:9'))
	}

	function getConfiguredPreset(api) {
		return previewPreset || String(api.config.get(presetConfigKey, cachedState?.selectedPreset || '1280x720') || '1280x720')
	}

	function normalizeMode(value) {
		const mode = String(value || '').trim().toLowerCase()
		return mode === 'fullscreen' || mode === 'borderless' || mode === 'window' ? mode : 'fullscreen'
	}

	function normalizeAspect(value) {
		const aspect = String(value || '').trim()
		return aspect === '1:1' || aspect === '4:3' || aspect === '16:9' || aspect === '21:9' || aspect === '32:9' ? aspect : '16:9'
	}

	function hasStoredConfig(key) {
		try {
			return localStorage.getItem('modloader:' + MOD_ID + ':config:' + key) !== null
		} catch (error) {
			return false
		}
	}

	function hasUserPresetSelected() {
		try {
			return localStorage.getItem(userPresetMarkerKey) === 'true'
		} catch (error) {
			return false
		}
	}

	function markUserPresetSelected() {
		try {
			localStorage.setItem(userPresetMarkerKey, 'true')
		} catch (error) {}
	}

	function getDefaultPresetOption(options) {
		if (!Array.isArray(options) || !options.length) return null
		return options.find(function (option) { return option.value === '1920x1080' }) || options.find(function (option) { return option.value === '1280x720' }) || options[0]
	}

	function parsePresetSize(value) {
		const match = String(value || '').match(/^(\d{3,5})x(\d{3,5})$/)
		if (!match) return null
		const width = Number(match[1])
		const height = Number(match[2])
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
		return { width, height, area: width * height }
	}

	function getClosestPresetOption(options, referenceValue) {
		if (!Array.isArray(options) || !options.length) return null
		const reference = parsePresetSize(referenceValue)
		if (!reference) return getDefaultPresetOption(options)
		let bestOption = null
		let bestScore = Infinity
		for (const option of options) {
			const size = parsePresetSize(option?.value)
			if (!size) continue
			const heightDelta = Math.abs(size.height - reference.height)
			const areaDelta = Math.abs(size.area - reference.area)
			const widthDelta = Math.abs(size.width - reference.width)
			const score = heightDelta * 100000000 + areaDelta * 10 + widthDelta
			if (score < bestScore) {
				bestScore = score
				bestOption = option
			}
		}
		return bestOption || getDefaultPresetOption(options)
	}

	function syncConfigFromWindowState(api, state) {
		if (!state) return
		if (previewMode === null && !hasStoredConfig(modeConfigKey) && state.windowMode && api.config.get(modeConfigKey, '') !== state.windowMode) api.config.set(modeConfigKey, state.windowMode)
		if (previewAspect === null && !hasStoredConfig(aspectConfigKey) && state.selectedAspectRatio && api.config.get(aspectConfigKey, '') !== state.selectedAspectRatio) api.config.set(aspectConfigKey, state.selectedAspectRatio)
		if (previewPreset !== null) return
		const aspect = normalizeAspect(api.config.get(aspectConfigKey, state.selectedAspectRatio || '16:9'))
		const presets = Array.isArray(state?.presetsByAspect?.[aspect])
			? state.presetsByAspect[aspect]
			: (Array.isArray(state?.presets) ? state.presets : [])
		const storedPreset = String(api.config.get(presetConfigKey, '') || '')
		const storedPresetValid = !!storedPreset && presets.some(function (preset) { return preset?.id === storedPreset })
		if (storedPresetValid) return
		if (state.selectedPreset && api.config.get(presetConfigKey, '') !== state.selectedPreset) api.config.set(presetConfigKey, state.selectedPreset)
	}

	function logWindowPresetProbe(source, state) {
		try {
			const presetCounts = {}
			for (const key in state?.presetsByAspect || {}) presetCounts[key] = Array.isArray(state.presetsByAspect[key]) ? state.presetsByAspect[key].length : 0
			console.info('[Tweaks] Window preset probe', {
				source,
				mode: state?.windowMode,
				aspect: state?.selectedAspectRatio,
				selectedPreset: state?.selectedPreset,
				display: state?.display,
				presetCounts,
				currentPresets: (state?.presets || []).map(function (preset) { return preset.id })
			})
		} catch (error) {}
	}

	async function applyConfiguredWindow(api) {
		if (applying || !getConfiguredEnabled(api) || !api?.appWindow?.isAvailable?.()) return
		applying = true
		try {
			const mode = getConfiguredMode(api)
			const aspectRatio = getConfiguredAspect(api)
			if (mode === 'fullscreen') {
				cachedState = await api.appWindow.setMode(mode)
			} else {
				cachedState = await api.appWindow.applyPreset(getConfiguredPreset(api), { aspectRatio, mode, userInitiated: true })
			}
			await refreshWindowOptions(api)
		} catch (error) {
			console.warn('[Tweaks] Window preset failed.', error)
		} finally {
			applying = false
		}
	}
})()
