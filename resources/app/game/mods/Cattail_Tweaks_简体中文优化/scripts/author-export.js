(function () {
	'use strict'

	const DATA_KEY = '__cattailTweaksSimplifiedChineseTrilingual'
	const fail = function (message) { throw new Error(message) }

	// A deliberately restricted scanner for the vanilla data-returning function.
	// Reject executable/template expressions instead of guessing at source ranges.
	const locateLocales = function (source) {
		const matches = Array.from(source.matchAll(/^function abstract_getWords\s*\(\s*\)\s*\{\s*return\s*\{/gm))
		if (matches.length !== 1) fail('Cannot locate a unique vanilla abstract_getWords function.')
		let position = matches[0].index + matches[0][0].length
		const skip = function () {
			while (position < source.length) {
				if (/\s/.test(source[position])) { position++; continue }
				if (source.startsWith('//', position)) {
					const end = source.indexOf('\n', position + 2)
					position = end < 0 ? source.length : end + 1
					continue
				}
				if (source.startsWith('/*', position)) {
					const end = source.indexOf('*/', position + 2)
					if (end < 0) fail('Unclosed words.js comment.')
					position = end + 2
					continue
				}
				break
			}
		}
		const quoted = function () {
			const quote = source[position++]
			while (position < source.length) {
				const char = source[position++]
				if (char === '\\') { position++; continue }
				if (char === quote) return
				if (quote === '`' && char === '$' && source[position] === '{') fail('Template expressions in words.js are unsupported.')
			}
			fail('Unclosed words.js string.')
		}
		const ranges = Object.create(null)
		while (position < source.length) {
			skip()
			if (source[position] === '}') return ranges
			const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(position))
			if (!match || ranges[match[0]]) fail('Invalid or duplicate vanilla language key.')
			const key = match[0]
			position += key.length
			skip()
			if (source[position++] !== ':') fail('Invalid vanilla language separator.')
			skip()
			const start = position
			if (source[position] !== '{') fail('Vanilla language must be an object.')
			const stack = []
			do {
				skip()
				const char = source[position]
				if (char === '"' || char === "'" || char === '`') { quoted(); continue }
				if (char === '{' || char === '[') stack.push(char)
				if (char === '}' || char === ']') {
					if (stack.pop() !== (char === '}' ? '{' : '[')) fail('Unbalanced words.js data.')
				}
				if (!char || char === '/' || char === '(' || char === '=') fail('Unsupported words.js data syntax.')
				position++
			} while (stack.length)
			ranges[key] = { start, end: position }
			skip()
			if (source[position] === ',') position++
			else if (source[position] !== '}') fail('Invalid vanilla language boundary.')
		}
		fail('Unclosed words.js language table.')
	}

	const evaluate = function (vm, source, result, filename) {
		return vm.runInNewContext(source + '\n;' + result, Object.create(null), {
			filename, timeout: 5000, contextCodeGeneration: { strings: false, wasm: false }
		})
	}
	const same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b) }
	const validateShape = function (reference, value, location) {
		if (typeof reference === 'string') {
			if (typeof value !== 'string') fail('Missing translation: ' + location)
			return
		}
		if (!reference || !value || typeof value !== 'object' || Array.isArray(reference) !== Array.isArray(value)) fail('Invalid translation branch: ' + location)
		if (Array.isArray(reference)) {
			// The optimization adds a credit; retain all later credits, including the last one.
			if (location === 'credits') {
				if (value.length < reference.length || value.some(item => typeof item !== 'string')) fail('Incomplete credits.')
			} else if (value.length !== reference.length) fail('Wrong translation array length: ' + location)
		} else if (!same(Object.keys(reference).sort(), Object.keys(value).sort())) fail('Translation keys differ: ' + location)
		for (const key of Object.keys(reference)) validateShape(reference[key], value[key], location ? location + '.' + key : key)
	}

	const build = function (source, dataSource, extractModsch, traditional, vm) {
		const ranges = locateLocales(source)
		if (!ranges.en || !ranges.sch || !ranges.tch) fail('Native en/sch/tch languages are required.')
		const original = evaluate(vm, source, 'abstract_getWords()', 'words.js')
		if (!same(Object.keys(ranges), Object.keys(original))) fail('Vanilla language ranges do not match the language table.')
		const data = evaluate(vm, dataSource, 'globalThis.' + DATA_KEY, 'trilingual-data.js')
		const sch = extractModsch(data, '')
		validateShape(original.en, sch, '')
		const tch = traditional.convertWords(sch)
		sch.splash.language = '语言：简体中文'
		tch.splash.language = '語言：繁體中文'
		const replacements = { sch, tch }
		const newline = source.includes('\r\n') ? '\r\n' : '\n'
		let output = source
		for (const key of ['sch', 'tch'].sort((a, b) => ranges[b].start - ranges[a].start)) {
			const range = ranges[key]
			const line = source.slice(source.lastIndexOf('\n', range.start) + 1, range.start)
			const indent = /^\s*/.exec(line)[0]
			const replacement = JSON.stringify(replacements[key], null, '    ').split('\n').join(newline + indent)
			output = output.slice(0, range.start) + replacement + output.slice(range.end)
		}
		const exported = evaluate(vm, output, 'abstract_getWords()', 'exported-words.js')
		if (!same(Object.keys(original), Object.keys(exported))) fail('Export changed the language list.')
		for (const key of Object.keys(original)) {
			if (!same(exported[key], replacements[key] || original[key])) fail('Export validation failed: ' + key)
		}
		return output
	}

	const assertSafeTarget = function (fs, path, target, appRoot) {
		const inside = function (root, candidate) {
			const relative = path.relative(root, candidate)
			return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
		}
		const absolute = path.resolve(target)
		const realTarget = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute))
		if (inside(path.resolve(appRoot), absolute) || inside(fs.realpathSync(appRoot), realTarget)) fail('Choose a location outside resources/app to protect the game and Mod source files.')
		if (fs.existsSync(absolute)) {
			const stat = fs.lstatSync(absolute)
			if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) fail('The export target must be a regular file, not a linked file or directory.')
		}
		return absolute
	}

	const writeCopy = function (fs, path, crypto, target, text) {
		const temporary = path.join(path.dirname(target), '.' + path.basename(target) + '.' + crypto.randomBytes(8).toString('hex') + '.tmp')
		let created = false
		try {
			const descriptor = fs.openSync(temporary, 'wx')
			created = true
			try { fs.writeFileSync(descriptor, text, 'utf8'); fs.fsyncSync(descriptor) }
			finally { fs.closeSync(descriptor) }
			if (fs.readFileSync(temporary, 'utf8') !== text) fail('The saved copy failed verification.')
			fs.renameSync(temporary, target)
		} finally {
			if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary)
		}
	}

	const exportFile = async function (api, extractModsch, traditional, messages) {
		if (typeof require !== 'function') fail('Desktop file access is unavailable.')
		const electron = require('electron'), fs = require('fs'), path = require('path')
		const fileURLToPath = require('url').fileURLToPath
		const dataPath = fileURLToPath(new URL(api.asset('locale/trilingual-data.js'), window.location.href))
		const gameRoot = path.resolve(path.dirname(dataPath), '..', '..', '..')
		const options = {
			title: messages.title, defaultPath: 'words.js',
			filters: [{ name: 'JavaScript', extensions: ['js'] }], properties: ['showOverwriteConfirmation']
		}
		let selection
		if (electron.ipcRenderer?.invoke) selection = await electron.ipcRenderer.invoke('modloader:dialog:save', options)
		else if (electron.dialog?.showSaveDialog) selection = await electron.dialog.showSaveDialog(options)
		else fail('The desktop save dialog is unavailable.')
		if (!selection || selection.canceled || !selection.filePath) return messages.canceled
		const target = assertSafeTarget(fs, path, selection.filePath, path.dirname(gameRoot))
		const bytes = fs.readFileSync(path.join(gameRoot, 'scripts', 'words.js'))
		const source = bytes.toString('utf8')
		if (!bytes.equals(Buffer.from(source, 'utf8'))) fail('words.js must use valid UTF-8 encoding.')
		const output = build(source, fs.readFileSync(dataPath, 'utf8'), extractModsch, traditional, require('vm'))
		// Check again after reading/validation; write a temporary sibling before replacing a chosen copy.
		assertSafeTarget(fs, path, target, path.dirname(gameRoot))
		writeCopy(fs, path, require('crypto'), target, output)
		try { electron.shell?.showItemInFolder(target) } catch (_) { /* The export is already saved. */ }
		return messages.success + ' ' + target
	}

	globalThis.__cattailChineseAuthorExport = Object.freeze({ build, locateLocales, assertSafeTarget, writeCopy, exportFile })
})()
