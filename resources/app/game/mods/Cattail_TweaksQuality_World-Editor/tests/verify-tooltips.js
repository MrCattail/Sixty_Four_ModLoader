'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const MOD_ROOT = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(MOD_ROOT, relative), 'utf8')
const files = Object.freeze({
	shared: 'scripts/core/shared.js',
	shell: 'scripts/ui/editor-shell.js',
	deletion: 'scripts/ui/selection-delete-ui.js',
	cut: 'scripts/ui/selection-cut-ui.js',
	production: 'scripts/ui/production-cards.js',
	library: 'scripts/ui/blueprint-library-ui.js',
	blueprint: 'scripts/blueprint-session.js',
	opacity: 'scripts/ui/card-opacity.js'
})
const sources = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, read(file)]))

assert.match(sources.shared, /init\(api\)/)
assert.match(sources.shared, /const tooltipScopes = new Set\(\)/)
assert.match(sources.shared, /function createTooltipScope\(options\)/)
assert.match(sources.shared, /tooltipApi\.attach\(target, text, attachOptions\)/)
assert.match(sources.shared, /target\.removeAttribute\?\.\('title'\)/)
assert.match(sources.shared, /tooltipScopes\.add\(scope\)/)
assert.match(sources.shared, /for \(const scope of Array\.from\(tooltipScopes\)\) scope\.dispose\(\)/)

for (const name of ['shell', 'deletion', 'cut', 'production', 'library', 'blueprint', 'opacity']) {
	assert.match(sources[name], /createTooltipScope\?\.\(\)|createTooltipScope\(\)/, `${files[name]} creates a shared tooltip scope`)
	assert.match(sources[name], /tooltips\?*\.set\(/, `${files[name]} attaches shared tooltips`)
	assert.match(sources[name], /tooltips\?*\.dispose\(\)/, `${files[name]} disposes shared tooltips`)
}

const allowedHiddenDetailAssignments = Object.freeze({
	shell: new Set(['historyStatus', 'economyStatus']),
	deletion: new Set(['status']),
	cut: new Set(['status'])
})
const nativeTitleAssignments = []
for (const [name, source] of Object.entries(sources)) {
	if (name === 'shared') continue
	for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*)\.title\s*=/g)) {
		if (allowedHiddenDetailAssignments[name]?.has(match[1])) continue
		nativeTitleAssignments.push(`${files[name]}:${match[1]}`)
	}
}
assert.deepEqual(nativeTitleAssignments, [], 'interactive World Editor controls do not retain native title tooltips')

assert.doesNotMatch(sources.opacity, /dataset\.tooltip/)
assert.doesNotMatch(sources.opacity, /attr\(data-tooltip\)/)
assert.doesNotMatch(sources.opacity, /cattail-world-editor-card-opacity-hint:hover::after/)

console.log('World Editor tooltip verification passed: shared ModLoader API adapter, complete migration, exclusions, and cleanup.')
