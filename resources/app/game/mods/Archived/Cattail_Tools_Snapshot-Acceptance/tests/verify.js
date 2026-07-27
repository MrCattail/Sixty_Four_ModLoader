'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'scripts', 'main.js'), 'utf8')

assert.equal(manifest.id, 'Cattail_Tools_Snapshot-Acceptance')
assert.equal(manifest.version, '0.1.0')
assert.equal(manifest.loaderVersion, '>=0.2.0')
assert.equal(manifest.entry, 'scripts/main.js')

assert.match(source, /api\.storage\.snapshots/)
for (const method of ['create', 'list', 'read', 'remove', 'prune', 'capabilities']) {
	assert.match(source, new RegExp(`snapshots\\.${method}\\(`), `public snapshot method ${method} is exercised`)
}
assert.match(source, /maxSnapshotsPerNamespace === 10/)
assert.match(source, /MAX_PAYLOAD_BYTES \+ 1/)
assert.match(source, /'INVALID_PAYLOAD'/)
assert.match(source, /'TOO_LARGE'/)
assert.match(source, /'NOT_FOUND'/)
assert.match(source, /registerCornerButton/)
assert.doesNotMatch(source, /panel\.addEventListener\(type,\s*stopGameInput,\s*true\)/, 'panel capture listener would block its own buttons')
assert.match(source, /panel\.addEventListener\(type,\s*stopGamePropagation\)/, 'panel input bubbles are isolated without disabling scrolling')

for (const forbidden of [
	/\brequire\s*\(/,
	/\bfs\./,
	/\bipcRenderer\b/,
	/\blocalStorage\b/,
	/ModLoader\.state/,
	/\.saveGame\s*\(/,
	/\.entities\b/,
	/Steam Cloud/i
]) {
	assert.doesNotMatch(source, forbidden, `acceptance Mod crossed forbidden boundary: ${forbidden}`)
}

const enabled = JSON.parse(fs.readFileSync(path.resolve(root, '..', '..', 'enabled.json'), 'utf8'))
assert.ok(!enabled.mods.includes(manifest.id), 'temporary acceptance Mod must remain disabled by default')

console.log('Snapshot acceptance Mod verification passed.')
