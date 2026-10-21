(function () {
	'use strict'

	const opencc = globalThis.__cattailChineseOpenCC
	if (!opencc?.Converter) throw new Error('Chinese Optimization requires the bundled OpenCC converter.')
	const convert = opencc.Converter({ from: 'cn', to: 'tw' })
	const cache = new Map()
	// Preserve markup/attributes, placeholders and literal links/paths, not visible prose.
	const protectedTokens = /(<\/?[A-Za-z][^>]*>|\{\{[^{}]*\}\}|\{[^{}]*\}|(?:https?|file):\/\/[^\s<>"'，。！？；（）]+|[A-Za-z]:[\\/][^\r\n<>"'，。！？；（）]+|(?:\.?\.\/|(?:[A-Za-z0-9_.-]+\/)+)[^\s<>"'，。！？；（）]+)/g
	const convertText = function (text) {
		if (typeof text !== 'string' || !text) return text
		if (cache.has(text)) return cache.get(text)
		const result = text.split(protectedTokens).map(function (part, index) {
			return index % 2 ? part : convert(part)
		}).join('')
		if (cache.size >= 4096) cache.clear()
		cache.set(text, result)
		return result
	}
	const convertWords = function (value) {
		if (typeof value === 'string') return convertText(value)
		if (Array.isArray(value)) return value.map(convertWords)
		if (!value || typeof value !== 'object') return value
		const result = {}
		for (const key of Object.keys(value)) result[key] = convertWords(value[key])
		return result
	}
	globalThis.__cattailChineseTraditional = Object.freeze({ convertText, convertWords })
})()
