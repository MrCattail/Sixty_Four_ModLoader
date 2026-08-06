'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const modRoot = path.resolve(__dirname, '..')
const protocol = require(path.join(modRoot, 'scripts', 'protocol.js'))
const safeMode = require(path.join(modRoot, 'scripts', 'safe-mode.js'))
const transportModule = require(path.join(modRoot, 'scripts', 'transport.js'))

let checks = 0
function check(name, fn) {
    fn()
    checks += 1
    process.stdout.write(`PASS ${name}\n`)
}

check('manifest contract', function () {
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, 'mod.json'), 'utf8'))
    assert.strictEqual(manifest.id, 'cattail.p2p-multiplayer')
    assert.strictEqual(manifest.version, '0.1.0')
    assert.strictEqual(manifest.loaderVersion, '>=0.3.1')
    assert.deepStrictEqual(manifest.entry, [
        'scripts/protocol.js', 'scripts/safe-mode.js', 'scripts/transport.js', 'scripts/ui.js', 'scripts/main.js'
    ])
})

check('manual signal token round trip', function () {
    const token = protocol.encodeSignal({ kind: 'offer', description: { type: 'offer', sdp: 'v=0\r\n' } })
    assert.ok(token.startsWith('P2P1.'))
    assert.strictEqual(protocol.decodeSignal(token, 'offer').description.sdp, 'v=0\r\n')
    assert.throws(function () { protocol.decodeSignal('bad') }, /prefix/)
})

check('envelope and handshake validation', function () {
    const handshake = protocol.buildHandshake({
        role: 'host', sessionId: 'phase1-local', gameVersion: '1.2.1', loaderVersion: '0.3.1',
        mods: [{ id: protocol.MOD_ID, version: protocol.MOD_VERSION }]
    })
    assert.strictEqual(protocol.validateHandshake(handshake).role, 'host')
    assert.throws(function () {
        protocol.validateHandshake(Object.assign({}, handshake, { mods: [{ id: 'foreign.mod', version: '1' }] }))
    }, /Unsupported remote mods/)
    assert.strictEqual(protocol.validateEnvelope(protocol.makeEnvelope('phase1.handshake', handshake)).protocolVersion, 1)
})

check('deterministic binary probe', function () {
    const first = protocol.inspectBinaryProbe(protocol.createBinaryProbe(4096))
    const second = protocol.inspectBinaryProbe(protocol.createBinaryProbe(4096))
    assert.deepStrictEqual(first, second)
    assert.strictEqual(first.byteLength, 4096)
})

check('launch configuration contract', function () {
    const config = safeMode.readLaunchConfig([
        'sixtyfour.exe', '--p2p-safe-test', '--p2p-role=guest', '--p2p-session=s1'
    ], { APPDATA: 'A' })
    assert.strictEqual(config.safeTest, true)
    assert.strictEqual(config.role, 'guest')
    assert.strictEqual(config.sessionId, 's1')

    const rendererConfig = safeMode.readLaunchConfig(['sixtyfour.exe'], {
        CATTAIL_P2P_SAFE_TEST: '1',
        CATTAIL_P2P_ROLE: 'host',
        CATTAIL_P2P_SESSION: 'renderer-session',
        CATTAIL_P2P_TEST_ROOT: 'T',
        CATTAIL_P2P_AUDIT_PATH: 'T/audit.jsonl',
        APPDATA: 'A'
    })
    assert.strictEqual(rendererConfig.safeTest, true)
    assert.strictEqual(rendererConfig.role, 'host')
    assert.strictEqual(rendererConfig.sessionId, 'renderer-session')
    assert.strictEqual(rendererConfig.auditPath, 'T/audit.jsonl')
})

check('safe IPC guard blocks exact write channels', function () {
    const forwarded = []
    const blocked = []
    const ipc = { send() { forwarded.push(Array.from(arguments)); return 'forwarded' } }
    safeMode.installIpcGuard(ipc, { safeTest: true }, { record(type, details) { blocked.push({ type, details }) } })
    assert.strictEqual(ipc.send('save', { test: true }), false)
    assert.strictEqual(ipc.send('getMyStuff'), 'forwarded')
    assert.deepStrictEqual(forwarded, [['getMyStuff']])
    assert.strictEqual(blocked.some(function (entry) { return entry.type === 'ipc-blocked' && entry.details.channel === 'save' }), true)
})

check('guest game guards block persistence and export', function () {
    let originals = 0
    class FakeGame {}
    for (const name of safeMode.BLOCKED_GAME_METHODS.concat(['exportSave'])) {
        FakeGame.prototype[name] = function () { originals += 1; return true }
    }
    const api = {
        patch(target, name, wrapper) {
            const original = target[name]
            target[name] = wrapper(original)
            return function () { target[name] = original }
        }
    }
    const guards = safeMode.installGameGuards(api, FakeGame, { safeTest: true, role: 'guest' }, { record() {} })
    const game = new FakeGame()
    assert.strictEqual(game.saveGame(), false)
    assert.strictEqual(game.importSave(), false)
    assert.strictEqual(game.exportSave(), false)
    assert.strictEqual(originals, 0)
    assert.ok(guards.installed.includes('exportSave:guest'))
})

check('transport surface is Phase 1 only', function () {
    const adapter = Object.assign({}, protocol, {
        MESSAGE_TYPES: { HANDSHAKE: 'phase1.handshake', HANDSHAKE_ACK: 'phase1.handshakeAck', PROBE_ACK: 'phase1.probeAck', ERROR: 'phase1.error' },
        createEnvelope: protocol.makeEnvelope,
        encodeSignalToken: protocol.encodeSignal,
        decodeSignalToken: protocol.decodeSignal
    })
    const transport = transportModule.create({
        protocol: adapter,
        config: { safeTest: true, role: 'host' },
        audit: { record() {} },
        getHandshake() { return protocol.buildHandshake({ role: 'host', mods: [{ id: protocol.MOD_ID, version: protocol.MOD_VERSION }] }) },
        RTCPeerConnection: null
    })
    assert.deepStrictEqual(Object.keys(transport).sort(), [
        'acceptAnswer', 'acceptOffer', 'close', 'createHostOffer', 'getState', 'reset', 'runLoopback', 'sendBinaryProbe', 'subscribe'
    ].sort())
    assert.strictEqual(transport.getState().status, 'idle')
    const combined = ['scripts/transport.js', 'scripts/ui.js', 'scripts/main.js'].map(function (file) {
        return fs.readFileSync(path.join(modRoot, file), 'utf8')
    }).join('\n')
    assert.doesNotMatch(combined, /assembleSave|loadSave\(|entity.*sync|resource.*sync/i)
})

check('isolation tooling has fixed safety markers', function () {
    const prepare = fs.readFileSync(path.join(modRoot, 'tools', 'prepare-phase1.ps1'), 'utf8')
    const start = fs.readFileSync(path.join(modRoot, 'tools', 'start-phase1-instance.ps1'), 'utf8')
    assert.match(prepare, /C:\\tmp\\sixtyfour-p2p-phase1/)
    assert.match(prepare, /Refusing to overwrite/)
    assert.match(prepare, /Cattail_TweaksNetwork_P2P-Multiplayer/)
    assert.match(start, /--p2p-safe-test/)
    assert.match(start, /--p2p-role=/)
    assert.match(start, /CATTAIL_P2P_SAFE_TEST/)
    assert.match(start, /CATTAIL_P2P_ROLE/)
    assert.match(start, /--user-data-dir=/)
    const ui = fs.readFileSync(path.join(modRoot, 'scripts', 'ui.js'), 'utf8')
    assert.match(ui, /prefix:\s*["']cattail-p2p-phase1["']/)
})

process.stdout.write(`P2P_PHASE1_VERIFY=${checks}/9\n`)
