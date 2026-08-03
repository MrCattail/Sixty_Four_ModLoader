(function () {
	'use strict'

	const MOD_ID = 'Cattail_Tweaks_简体中文优化'
	const DATA_KEY = '__cattailTweaksSimplifiedChineseTrilingual'
	const LANGUAGE_KEYS = [ 'en', 'sch', 'modsch' ]
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
		}
	})
})()
