'use strict'

// Real Electron smoke test. Opt-in only: creates an offline copy and never runs
// the original executable. No Steam native modules or old Mods are copied.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const cp = require('node:child_process')
const assert = require('node:assert/strict')
const source = path.resolve(__dirname, '../../../../..')
const lab = path.resolve(source, '../ModLoader-Test-1.3')
const runtime = path.join(lab, 'runtime')
const markerPath = path.join(lab, 'lab.json')
const core = ['resources/app/main.js', 'resources/app/game/index.html', 'resources/app/game/scripts/game.js', 'resources/app/game/scripts/ui.js', 'resources/app/game/scripts/sprites.js']
const protectedFiles = [...core, 'resources/app/game/mods/enabled.json', 'modloader-installer/Build ModLoader Package.cmd', 'modloader-installer/Uninstall ModLoader.cmd', 'modloader-installer/Verify ModLoader.cmd', '.git/HEAD']
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const baseline = Object.fromEntries(protectedFiles.map(file => [file, hash(path.join(source, file))]))
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to) }
const restoreManifest = JSON.parse(fs.readFileSync(path.join(source, 'Codex-md/development_restore_20261003.json'), 'utf8').replace(/^\uFEFF/, ''))
const modHashes = restoreManifest.Files.filter(file => file.Path.startsWith('resources/app/game/mods/')).map(file => ({ path: file.Path, hash: hash(path.join(source, file.Path)) }))

function treeHashes(dir) {
    if (!fs.existsSync(dir)) return null
    const files = {}
    function walk(folder) {
        for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
            const full = path.join(folder, e.name)
            if (e.isSymbolicLink()) throw new Error('Refusing to follow profile symlink: ' + full)
            if (e.isDirectory()) walk(full)
            else if (e.isFile()) files[path.relative(dir, full)] = hash(full)
        }
    }
    walk(dir)
    return files
}
const realProfile = path.join(process.env.APPDATA, 'sixtyfour')
const profileBefore = treeHashes(realProfile)
if (fs.existsSync(lab)) {
    assert.ok(process.argv.includes('--reuse'), 'Lab already exists; inspect it and explicitly use --reuse.')
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    assert.equal(marker.source, source)
    assert.equal(marker.kind, 'sixtyfour-offline-smoke-1.3')
    if (marker.activePid) {
        let running = false
        try { process.kill(marker.activePid, 0); running = true } catch (error) { if (error.code !== 'ESRCH') throw error }
        assert.ok(!running, 'Close the previous test game before refreshing its files.')
    }
} else {
    fs.mkdirSync(lab)
    fs.writeFileSync(markerPath, JSON.stringify({ kind: 'sixtyfour-offline-smoke-1.3', source, runtime }, null, 2))
    for (const e of fs.readdirSync(source, { withFileTypes: true })) {
        if (e.isFile() && /\.(exe|dll|pak|dat|bin|json)$/i.test(e.name)) copy(path.join(source, e.name), path.join(runtime, e.name))
    }
    fs.cpSync(path.join(source, 'locales'), path.join(runtime, 'locales'), { recursive: true })
    for (const e of fs.readdirSync(path.join(source, 'resources/app'), { withFileTypes: true })) {
        if (e.isFile() && e.name !== 'steam_appid.txt') copy(path.join(source, 'resources/app', e.name), path.join(runtime, 'resources/app', e.name))
    }
    const game = path.join(source, 'resources/app/game')
    fs.cpSync(game, path.join(runtime, 'resources/app/game'), {
        recursive: true,
        filter: file => {
            const rel = path.relative(game, file).replace(/\\/g, '/')
            return !/^(mods|modloader)(\/|$)/.test(rel)
        }
    })
    fs.mkdirSync(path.join(runtime, 'resources/app/game/mods'), { recursive: true })
    fs.writeFileSync(path.join(runtime, 'resources/app/game/mods/enabled.json'), '{"mods":[]}\n')
}
assert.ok(!fs.existsSync(path.join(runtime, 'resources/app/node_modules')), 'Offline copy must not have native Steam/telemetry dependencies.')
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runtime, 'resources/app/game/mods/enabled.json'), 'utf8')), { mods: [] })
// Refresh only this owned test copy. Original source files remain unpatched.
for (const file of core) copy(path.join(source, file), path.join(runtime, file))
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const evidence = path.join(lab, 'evidence', runId)
fs.mkdirSync(evidence, { recursive: true })
fs.writeFileSync(path.join(evidence, 'source-baseline.json'), JSON.stringify({ baseline, realProfile, profileBefore, modHashes }, null, 2))
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key]
const install = cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(source, 'modloader-installer/install.ps1'), '-GameRoot', runtime, '-SourceRoot', source, '-SkipMods', '-Force'], { encoding: 'utf8', timeout: 120000, windowsHide: true, env })
fs.writeFileSync(path.join(evidence, 'install.log'), install.stdout + install.stderr)
assert.equal(install.status, 0, install.error?.message || install.stdout + install.stderr)
copy(path.join(__dirname, 'game-1.3-smoke-bootstrap.cjs'), path.join(runtime, 'resources/app/smoke-bootstrap.cjs'))
const pkgPath = path.join(runtime, 'resources/app/package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.main = 'smoke-bootstrap.cjs'
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
const profile = path.join(lab, 'profile')
for (const dir of ['userData', 'sessionData', 'appData', 'localAppData', 'temp']) fs.mkdirSync(path.join(profile, dir), { recursive: true })
const settings = path.join(profile, 'userData/appSettings.json')
if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ fullscreen: false, windowMode: 'window' }))
fs.writeFileSync(path.join(runtime, 'resources/app/smoke-config.json'), JSON.stringify({ lab, evidence, profile, manual: process.argv.includes('--manual') }, null, 2))
for (const key of Object.keys(env)) if (['appdata', 'localappdata', 'temp', 'tmp', 'electron_run_as_node', 'node_options'].includes(key.toLowerCase())) delete env[key]
Object.assign(env, { APPDATA: path.join(profile, 'appData'), LOCALAPPDATA: path.join(profile, 'localAppData'), TEMP: path.join(profile, 'temp'), TMP: path.join(profile, 'temp') })
const out = fs.openSync(path.join(evidence, 'process.log'), 'a')
const child = cp.spawn(path.join(runtime, 'sixtyfour.exe'), [], { cwd: path.join(runtime, 'resources/app'), env, windowsHide: false, stdio: ['ignore', out, out] })
const activeMarker = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
activeMarker.activePid = child.pid || null
fs.writeFileSync(markerPath, JSON.stringify(activeMarker, null, 2))
console.log('Offline test running. Evidence: ' + evidence)
const timeout = process.argv.includes('--manual') ? null : setTimeout(() => child.kill(), 100000)
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => {
    if (timeout) clearTimeout(timeout)
    fs.closeSync(out)
    activeMarker.activePid = null
    fs.writeFileSync(markerPath, JSON.stringify(activeMarker, null, 2))
    const guards = {
        sourceFilesUnchanged: protectedFiles.every(file => hash(path.join(source, file)) === baseline[file]),
        modFilesUnchanged: modHashes.every(file => hash(path.join(source, file.path)) === file.hash),
        realProfileUnchanged: JSON.stringify(treeHashes(realProfile)) === JSON.stringify(profileBefore),
        realProfile, realProfileExisted: profileBefore !== null,
        executableExitCode: code
    }
    fs.writeFileSync(path.join(evidence, 'protection.json'), JSON.stringify(guards, null, 2))
    console.log(JSON.stringify(guards))
    const resultPath = path.join(evidence, 'result.json')
    const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : { status: 'missing-result' }
    console.log('Smoke result: ' + result.status + '; ' + evidence)
    if (code !== 0 || (!process.argv.includes('--manual') && result.status !== 'passed') || !guards.sourceFilesUnchanged || !guards.modFilesUnchanged || !guards.realProfileUnchanged) process.exitCode = 1
})
