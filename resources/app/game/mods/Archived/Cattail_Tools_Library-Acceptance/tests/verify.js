'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mod.json'), 'utf8'))
const scriptPath = path.join(root, manifest.entry)
const source = fs.readFileSync(scriptPath, 'utf8')

assert.equal(manifest.id, 'Cattail_Tools_Library-Acceptance')
assert.equal(manifest.version, '0.1.0')
assert.equal(manifest.loaderVersion, '>=0.3.0')
assert.equal(manifest.reloadPolicy, 'restart')
assert.equal(manifest.entry, 'scripts/main.js')
assert.equal(fs.existsSync(scriptPath), true)

const declaration = manifest.libraries?.acceptance
assert.ok(declaration)
assert.equal(declaration.directory, 'library-api-acceptance')
assert.deepEqual(declaration.extensions, ['.cattail-library-test.json'])
assert.equal(declaration.maxFileBytes, 1024)
assert.equal(declaration.maxTotalBytes, 8192)
assert.equal(declaration.maxEntries, 6)
assert.deepEqual(declaration.cache.directories, ['thumbnails'])
assert.deepEqual(declaration.cache.extensions, ['.png'])
assert.equal(declaration.cache.maxBytes, 64)

assert.match(source, /api\.storage\.libraries\.open\('acceptance'\)/)
for (const method of ['capabilities', 'list', 'read', 'write', 'rename', 'trash', 'restore', 'quarantine', 'remove', 'watch', 'openFolder']) {
	assert.match(source, new RegExp(`library\\.${method}\\(`), `${method} is exercised`)
}
for (const code of ['PERMISSION_DENIED', 'PATH_INVALID', 'NAME_CONFLICT', 'REVISION_CONFLICT', 'TOO_LARGE', 'QUOTA_EXCEEDED', 'NOT_FOUND']) {
	assert.match(source, new RegExp(`['"]${code}['"]`), `${code} is asserted`)
}
assert.match(source, /active=0 \| trash=0 \| quarantine=0 \| cache=0/)
assert.match(source, /Promise\.race\(\[eventPromise, timeout\]\)/)
assert.doesNotMatch(source, /require\(['"](?:fs|path|electron)['"]\)/)
assert.doesNotMatch(source, /blueprints\//)
assert.doesNotMatch(source, /saveGame|applySave|beforeSaveWrite/)

console.log('Library API acceptance fixture verification passed.')
