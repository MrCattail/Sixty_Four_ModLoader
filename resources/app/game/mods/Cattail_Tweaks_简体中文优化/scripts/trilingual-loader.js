(function () {
	'use strict'

	const MOD_ID = 'Cattail_Tweaks_简体中文优化'
	const DATA_KEY = '__cattailTweaksSimplifiedChineseTrilingual'
	const LANGUAGE_KEYS = [ 'en', 'sch', 'modsch' ]
	const OPEN_MODE_KEY = 'translationFileOpenMode'
	const OPEN_ACTION_KEY = 'openTranslationFile'
	const hasOwn = function (value, key) {
		return Object.prototype.hasOwnProperty.call(value, key)
	}

	const extractModsch = function (value, path) {
		if (Array.isArray(value)) {
			return value.map(function (item, index) {
				return extractModsch(item, `${path}[${index}]`)
			})
		}

		if (!value || typeof value !== 'object') {
			throw new Error(`[${MOD_ID}] invalid trilingual node at ${path}`)
		}

		const presentLanguages = LANGUAGE_KEYS.filter(function (language) {
			return hasOwn(value, language)
		})
		if (presentLanguages.length) {
			const missingLanguages = LANGUAGE_KEYS.filter(function (language) {
				return !hasOwn(value, language)
			})
			if (missingLanguages.length) {
				throw new Error(`[${MOD_ID}] missing ${missingLanguages.join(', ')} at ${path}`)
			}

			const unexpectedKeys = Object.keys(value).filter(function (key) {
				return LANGUAGE_KEYS.indexOf(key) === -1
			})
			if (unexpectedKeys.length) {
				throw new Error(`[${MOD_ID}] unexpected keys ${unexpectedKeys.join(', ')} at ${path}`)
			}

			for (const sourceLanguage of [ 'en', 'sch' ]) {
				const sourceText = value[sourceLanguage]
				if (sourceText !== null && typeof sourceText !== 'string') {
					throw new Error(`[${MOD_ID}] ${sourceLanguage} must be text or null at ${path}`)
				}
			}
			if (typeof value.modsch !== 'string') {
				throw new Error(`[${MOD_ID}] modsch must be text at ${path}`)
			}

			return value.modsch
		}

		const result = {}
		for (const key of Object.keys(value)) {
			result[key] = extractModsch(value[key], path ? `${path}.${key}` : key)
		}
		return result
	}

	const isBranch = function (value) {
		return !!value && typeof value === 'object' && !Array.isArray(value)
	}

	const mergeModsch = function (target, patch) {
		if (!isBranch(patch)) return patch

		const result = isBranch(target) ? target : {}
		for (const key of Object.keys(patch)) {
			const value = patch[key]
			if (isBranch(value)) {
				result[key] = mergeModsch(result[key], value)
			} else if (Array.isArray(value)) {
				result[key] = value.slice()
			} else {
				result[key] = value
			}
		}
		return result
	}

	const getTranslationFileTools = function () {
		if (typeof require !== 'function') throw new Error('Desktop file access is unavailable.')
		const shell = require('electron')?.shell
		const fileURLToPath = require('url')?.fileURLToPath
		if (!shell || typeof fileURLToPath !== 'function') throw new Error('Desktop file access is unavailable.')
		return { shell, fileURLToPath }
	}

	const getTranslationFilePath = function (api) {
		const tools = getTranslationFileTools()
		const assetUrl = new URL(api.asset('locale/trilingual-data.js'), window.location.href)
		return { shell: tools.shell, path: tools.fileURLToPath(assetUrl) }
	}

	const registerTranslationFileSettings = function (api) {
		const settings = api?.ui?.settings
		if (!settings || !Array.isArray(settings.types) || !settings.types.includes('action') || typeof settings.register !== 'function') return
		settings.register([
			{
				key: OPEN_MODE_KEY,
				type: 'select',
				default: 'reveal',
				persist: 'change',
				section: 'translationFile',
				sectionLabel: 'Translation file',
				label: 'Open method',
				description: 'Choose how the translation source file opens.',
				options: [
					{ value: 'reveal', label: 'Show in File Explorer' },
					{ value: 'system', label: 'Use system default association (.js may run)' }
				]
			},
			{
				key: OPEN_ACTION_KEY,
				type: 'action',
				section: 'translationFile',
				sectionLabel: 'Translation file',
				label: 'Open translation file',
				description: 'Opens locale/trilingual-data.js using the selected method.',
				buttonLabel: 'Open translation file',
				pendingText: 'Opening...',
				successText: 'Translation file opened.',
				errorText: 'Could not open the translation file: {value}',
				async onAction() {
					const target = getTranslationFilePath(api)
					const mode = api.config.get(OPEN_MODE_KEY, 'reveal')
					if (mode === 'system') {
						const errorMessage = await target.shell.openPath(target.path)
						if (errorMessage) throw new Error(errorMessage)
						return
					}
					target.shell.showItemInFolder(target.path)
				}
			}
		])
	}

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			const source = globalThis[DATA_KEY]
			if (!source || typeof source !== 'object') {
				throw new Error(`[${MOD_ID}] trilingual data was not loaded before the converter`)
			}

			// Validate the complete source during mod initialization so malformed edits fail early.
			extractModsch(source, '')
			api.on('afterWords', function (words) {
				words.modsch = mergeModsch(words.modsch, extractModsch(source, ''))
				return words
			})
			registerTranslationFileSettings(api)
		}
	})
})()
