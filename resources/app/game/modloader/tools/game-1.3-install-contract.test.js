'use strict'

// Copies vanilla source only. Never starts Electron, Steam, a game profile, or a Mod.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const cp = require('node:child_process')
const vm = require('node:vm')
const root = path.resolve(process.argv[2] || path.join(__dirname, '../../../../..'))
// Optional pristine fixture root allows repeating the contract after publishing
// hooks to the workspace, without stripping or rewriting official game files.
const fixtureRoot = path.resolve(process.argv[3] || root)
const suite = fs.mkdtempSync(path.join(os.tmpdir(), 'sixtyfour-loader-13-'))
const core = ['resources/app/main.js', 'resources/app/game/index.html', 'resources/app/game/scripts/game.js', 'resources/app/game/scripts/ui.js', 'resources/app/game/scripts/sprites.js']
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const hashes = dir => core.map(p => digest(path.join(dir, p)))
const officialBaseline = hashes(root)
const baseline = hashes(fixtureRoot)
const patcher = path.join(root, 'modloader-installer/patch-source.ps1')
function fixture(name) {
    const dir = path.join(suite, name)
    for (const p of core) {
        fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true })
        fs.copyFileSync(path.join(fixtureRoot, p), path.join(dir, p))
    }
    fs.mkdirSync(path.join(dir, 'resources/app/game/mods'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'resources/app/game/mods/enabled.json'), '{"mods":[]}')
    return dir
}
function ps(args, ok = true) {
    // Windows PowerShell must resolve its own modules, not an inherited pwsh 7 runtime.
    const env = { ...process.env }
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key]
    const result = cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', timeout: 120000, windowsHide: true, env })
    if (ok) assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr)
    else assert.notEqual(result.status, 0, 'expected rejection')
    return result
}
const clean = fixture('clean')
ps(['-File', patcher, '-GameRoot', clean, '-CheckOnly'])
assert.deepEqual(hashes(clean), baseline, 'preflight does not write')
ps(['-File', patcher, '-GameRoot', clean])
for (const p of core.filter(p => p.endsWith('.js'))) {
    const result = cp.spawnSync(process.execPath, ['--check', path.join(clean, p)], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
}
const patched = hashes(clean)
ps(['-File', patcher, '-GameRoot', clean])
assert.deepEqual(hashes(clean), patched, 'repeat patch is byte-identical')
const gameText = fs.readFileSync(path.join(clean, core[2]), 'utf8')
assert.ok(gameText.indexOf('stage(`beforeGamePrepare`') < gameText.indexOf('await this.prepareSavedGameData(preload)'), 'early lifecycle precedes native migration')
assert.match(gameText, /return window\.ModLoader\?\.applySave\(saveState, this\) \|\| saveState/)
assert.doesNotMatch(gameText, /this\.getLanguageId\(/)
const initText = gameText.match(/^\tasync init\(preload\)\{\n[\s\S]*?^\t\}/m)[0]
for (const hook of ['applyData', 'applyLanguages', 'applyWords']) {
    assert.equal(initText.split('ModLoader?.' + hook + '(').length - 1, 1, 'one active ' + hook)
}
if (gameText.includes('async preloadImages()')) {
    assert.match(initText, /this\.images = await this\.preloadImages\(\)/)
    assert.ok(initText.indexOf('applyData(') < initText.indexOf('await this.preloadImages()'))
    assert.ok(initText.indexOf('await this.preloadImages()') < initText.indexOf('applyLanguages('))
    assert.ok(initText.indexOf('applyLanguages(') < initText.indexOf('applyWords('))
}
const mainText = fs.readFileSync(path.join(clean, core[0]), 'utf8')
for (const name of ['configureSaveCloud(client.cloud)', 'readSaveOverlay(client.cloud, JSON.parse(save))', 'savePolicyLayout: slots?.policyLayout,', 'hasSaveOverlay(client.cloud)']) assert.equal(mainText.split(name).length - 1, 1, name)
assert.equal(mainText.split('ModLoaderMainProcess.dispatchSaveStore(e, slots, value =>').length - 1, 2, 'both IPC modes must dispatch')
const brokenSaveBridges = [
 ['missing save configure', text => text.replace('ModLoaderMainProcess.configureSaveCloud(client.cloud)', '')],
 ['missing overlay reconstruction', text => text.replace('ModLoaderMainProcess.readSaveOverlay(client.cloud, JSON.parse(save))', 'JSON.parse(save)')],
 ['missing layout forwarding', text => text.replace('savePolicyLayout: slots?.policyLayout,', '')],
 ['missing invoke dispatch', text => { const at = text.indexOf('ipcMain.handle('); return text.slice(0, at) + text.slice(at).replace('ModLoaderMainProcess.dispatchSaveStore(e, slots, value =>', 'rawDispatch(e, slots, value =>') }],
 ['duplicate store handler', text => text + '\nipcMain.on(' + String.fromCharCode(96) + 'store' + String.fromCharCode(96) + ', (e,slots)=>{\n})\n'],
 ['duplicate save configure', text => text + '\nModLoaderMainProcess.configureSaveCloud(client.cloud)\n'],
 ['partial save marker', text => text.replace('// ModLoader save bridge v2', '')],
 ['missing read guard', text => text.replace("if (e?.code === 'SAVE_COLLECTION_INVALID' || e?.code === 'SAVE_BASELINE_MISSING')", 'if (false)')]
]
for (const [label, alter] of brokenSaveBridges) {
 const dir = fixture(label.replaceAll(' ', '-'))
 for (const name of core) fs.copyFileSync(path.join(clean, name), path.join(dir, name))
 fs.writeFileSync(path.join(dir, core[0]), alter(mainText))
 const before = hashes(dir)
 ps(['-File', patcher, '-GameRoot', dir], false)
 assert.deepEqual(hashes(dir), before, label + ' rejects before any source write')
}

assert.match(mainText, /ModLoaderMainProcess\.runtimeLog\('console'/, 'commented native DevTools menu cannot skip diagnostics')
assert.match(mainText, /ModLoaderMainProcess\.runtimeLog\('render-process-gone'/)
assert.match(mainText, /ModLoaderMainProcess\.runtimeLog\('did-fail-load'/)
assert.match(mainText, /globalShortcut\.register\('F12'/)
assert.match(mainText, /\s+\{role: 'toggleDevTools'\}/)
assert.equal((mainText.match(/const menu = Menu\.buildFromTemplate/g) || []).length, 1, 'preserve native menu without duplicate declarations')
// Exercise the actual generated console listener for both Electron signatures.
const consoleHook = mainText.match(/win\.webContents\.on\('console-message', ([\s\S]*?)\n  \}\)/)[1]
const logged = []
const logConsole = vm.runInNewContext('(' + consoleHook + '\n  })', { ModLoaderMainProcess: { runtimeLog(...args) { logged.push(args) } } })
logConsole({}, { level: 'error', message: 'new signature', sourceId: 'game.js', lineNumber: 42 })
logConsole({}, 3, 'old signature', 21, 'old.js')
assert.deepEqual(logged, [['console', 'error', 'new signature', 'game.js:42'], ['console', 3, 'old signature', 'old.js:21']])
for (const kind of ['missing-words', 'duplicate-data', 'partial-hook']) {
    const bad = fixture(kind), file = path.join(bad, core[2])
    let text = fs.readFileSync(file, 'utf8')
    if (kind === 'missing-words') text = text.replace('const words = abstract_getWords()', 'const words = changed_getWords()')
    if (kind === 'duplicate-data') text = text.replace('this.codex = abstract_getCodex()', 'this.codex = abstract_getCodex()\n\t\tthis.images = await this.preloadImages()\n\t\tthis.codex = abstract_getCodex()')
    if (kind === 'partial-hook') text = text.replace('this.codex = abstract_getCodex()', 'this.codex = window.ModLoader?.applyData(abstract_getCodex(), this)')
    fs.writeFileSync(file, text)
    const before = hashes(bad)
    ps(['-File', patcher, '-GameRoot', bad], false)
    assert.deepEqual(hashes(bad), before, kind + ' fails before any file is written')
}
// Also retain support for the earlier synchronous, contiguous 1.3 layout.
if (gameText.includes('async preloadImages()')) {
    const earlier = fixture('earlier-contiguous-layout'), file = path.join(earlier, core[2])
    let text = fs.readFileSync(file, 'utf8')
    const words = '\t\tconst words = abstract_getWords()\n\t\tthis.words = words[this.language]\n\t\tthis.words_en = words.en\n'
    assert.ok(text.includes(words))
    text = text.replace(words, '').replace('this.images = await this.preloadImages()\n', 'this.images = this.preloadImages()\n' + words).replace('async preloadImages(){', 'preloadImages(){').replace('await Promise.all(', 'Promise.all(')
    fs.writeFileSync(file, text)
    ps(['-File', patcher, '-GameRoot', earlier])
    const first = hashes(earlier)
    ps(['-File', patcher, '-GameRoot', earlier])
    assert.deepEqual(hashes(earlier), first, 'earlier layout stays idempotent')
    assert.match(fs.readFileSync(file, 'utf8'), /this\.images = this\.preloadImages\(\)/)
}
const assembleMatch = gameText.match(/^\tassembleSave\(\)\{\n[\s\S]*?^\t\}/m)
assert.ok(assembleMatch)
const assemble = vm.runInNewContext('({' + assembleMatch[0] + '}).assembleSave', { window: { ModLoader: { applySave(save) { save.testMetadata = 'kept'; return save } } } })
const assembled = assemble.call({ stuff: [], store: { existed: {} }, messenger: {}, achiever: { fired: [] }, alfa: { currentEvents: [] } })
assert.equal(typeof assembled, 'object', 'patched native assembly remains an object')
assert.equal(assembled.testMetadata, 'kept')
const drift = fixture('late-anchor-drift')
const ui = path.join(drift, core[3])
fs.writeFileSync(ui, fs.readFileSync(ui, 'utf8').replace('image.src = `img/shop/${e.isDark', 'image.src = `img/changed/${e.isDark'))
const driftBefore = hashes(drift)
ps(['-File', patcher, '-GameRoot', drift], false)
assert.deepEqual(hashes(drift), driftBefore, 'late preflight failure leaves all files unchanged')
const legacy = fixture('unsupported')
const legacyGame = path.join(legacy, core[2])
fs.writeFileSync(legacyGame, fs.readFileSync(legacyGame, 'utf8').replace('this.version = `1.3`', 'this.version = `1.2.1`'))
const legacyBefore = hashes(legacy)
ps(['-File', patcher, '-GameRoot', legacy], false)
assert.deepEqual(hashes(legacy), legacyBefore, 'unsupported version is rejected without writes')
const locked = fixture('write-failure')
const quote = value => "'" + value.replace(/'/g, "''") + "'"
const lockPath = path.join(locked, core[4])
ps(['-Command', `$ErrorActionPreference='Stop'; $handle=[IO.File]::Open(${quote(lockPath)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read); try { & ${quote(patcher)} -GameRoot ${quote(locked)} } finally { $handle.Dispose() }`], false)
assert.deepEqual(hashes(locked), baseline, 'write failure restores already-written files')
const install = fixture('installed')
ps(['-File', path.join(root, 'modloader-installer/install.ps1'), '-GameRoot', install, '-SourceRoot', root, '-SkipMods'])
const installedHashes = hashes(install)
const backupId = fs.readFileSync(path.join(install, 'resources/app/game/modloader/state/install-backups/latest-install.txt'), 'utf8').trim()
ps(['-File', path.join(root, 'modloader-installer/install.ps1'), '-GameRoot', install, '-SourceRoot', root, '-SkipMods', '-Force'])
assert.deepEqual(hashes(install), installedHashes, 'repeat installation is idempotent')
ps(['-File', path.join(root, 'modloader-installer/uninstall.ps1'), '-GameRoot', install, '-BackupId', backupId, '-ConfirmUninstall'])
assert.deepEqual(hashes(install), baseline, 'uninstall restores exact original core bytes')
assert.equal(fs.existsSync(path.join(install, 'resources/app/game/modloader/loader.js')), true, 'ordinary uninstall preserves runtime and tools')
const faultSource = path.join(suite, 'fault-source')
for (const rel of ['modloader-installer', 'resources/app/game/modloader']) {
    fs.cpSync(path.join(root, rel), path.join(faultSource, rel), { recursive: true, filter: src => !['state', 'backups'].includes(path.basename(src)) })
}
fs.writeFileSync(path.join(faultSource, 'resources/app/game/modloader/tools/verify.ps1'), 'exit 17')
fs.mkdirSync(path.join(faultSource, 'resources/app/game/mods/new-test-mod'), { recursive: true })
fs.writeFileSync(path.join(faultSource, 'resources/app/game/mods/enabled.json'), '{"mods":[]}')
fs.writeFileSync(path.join(faultSource, 'resources/app/game/mods/new-test-mod/payload.txt'), 'test payload only')
const rollback = fixture('verification-rollback')
const oldLoader = path.join(rollback, 'resources/app/game/modloader/loader.js')
fs.mkdirSync(path.dirname(oldLoader), { recursive: true })
fs.writeFileSync(oldLoader, 'old runtime bytes')
fs.mkdirSync(path.join(rollback, 'resources/app/game/mods/old-test-mod'), { recursive: true })
fs.writeFileSync(path.join(rollback, 'resources/app/game/mods/old-test-mod/keep.txt'), 'original mod')
const oldRuntimeHash = digest(oldLoader)
ps(['-File', path.join(root, 'modloader-installer/install.ps1'), '-GameRoot', rollback, '-SourceRoot', faultSource, '-ReplaceMods', '-Force'], false)
assert.deepEqual(hashes(rollback), baseline, 'verification failure rolls back all game hooks')
assert.equal(digest(oldLoader), oldRuntimeHash, 'verification failure restores overwritten runtime')
assert.equal(fs.readFileSync(path.join(rollback, 'resources/app/game/mods/old-test-mod/keep.txt'), 'utf8'), 'original mod')
assert.equal(fs.existsSync(path.join(rollback, 'resources/app/game/mods/new-test-mod/payload.txt')), false, 'failed install removes new payload')
assert.deepEqual(hashes(root), officialBaseline, 'official game source untouched')
fs.writeFileSync(path.join(suite, 'result.json'), JSON.stringify({ status: 'passed', officialRoot: root, fixtureRoot: suite, cases: [...brokenSaveBridges.map(([name]) => name), 'preflight', 'patch syntax', 'split awaited initialization', 'earlier contiguous initialization', 'partial/duplicate/missing anchors', 'Electron console signatures', 'object assembly', 'idempotence', 'late anchor failure', 'unsupported version', 'write rollback', 'installer', 'loader verification', 'repeat install', 'uninstall', 'verification failure rollback'] }, null, 2))
console.log('Game 1.3 installer contract passed. Fixtures: ' + suite)
