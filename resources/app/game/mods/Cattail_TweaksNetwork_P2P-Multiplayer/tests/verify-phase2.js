'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const modRoot = path.resolve(__dirname, '..')
const protocol = require(path.join(modRoot, 'scripts', 'protocol.js'))
const safeMode = require(path.join(modRoot, 'scripts', 'safe-mode.js'))
const signalingModule = require(path.join(modRoot, 'scripts', 'signaling.js'))
const transportModule = require(path.join(modRoot, 'scripts', 'transport.js'))

let checks = 0
async function check(name, fn) {
    await fn()
    checks += 1
    process.stdout.write(`PASS ${name}\n`)
}

function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

class FakeWebSocket {
    static OPEN = 1
    static instances = []

    constructor(url) {
        this.url = url
        this.readyState = 0
        FakeWebSocket.instances.push(this)
        setTimeout(() => {
            this.readyState = FakeWebSocket.OPEN
            this.onopen?.()
        }, 0)
    }

    send(raw) {
        const message = JSON.parse(raw)
        if (message.type === protocol.SIGNAL_TYPES.AUTH) {
            assert.strictEqual(message.payload.alphaInviteToken, 'private-alpha-invite')
            setTimeout(() => {
                this.onmessage?.({ data: JSON.stringify(protocol.makeSignalMessage(protocol.SIGNAL_TYPES.AUTH_OK, {
                    peerId: 'host', role: 'host', slot: 0, roomCode: 'ABCDEFGH', resumeToken: `rotated-${FakeWebSocket.instances.length}`, peers: []
                }, { requestId: message.requestId })) })
            }, 0)
        }
    }

    close(code = 1000) {
        if (this.readyState === 3) return
        this.readyState = 3
        this.onclose?.({ code })
    }

    serverClose(code = 1006) {
        this.close(code)
    }
}

function fakeFetch(url, options) {
    const pathname = new URL(url).pathname
    assert.strictEqual(options.headers['x-p2p-alpha-invite'], 'private-alpha-invite')
    let value
    let status = 200
    if (pathname === '/v2/rooms') {
        value = {
            protocolVersion: 2, modVersion: '0.2.1', roomCode: 'ABCDEFGH', role: 'host', peerId: 'host',
            participantToken: 'private-host-token', resumeToken: 'private-resume-token',
            iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }]
        }
        status = 201
    } else if (pathname.endsWith('/turn')) {
        assert.match(options.headers.authorization, /^Bearer /)
        assert.ok(options.headers['x-p2p-resume-token'])
        value = { mode: 'stun-only', iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], ttlSeconds: 7200, refreshAfterMs: 5400000 }
    } else {
        status = 404
        value = { error: 'Not found.' }
    }
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async function () { return value } })
}

class FakePeerConnection {
    constructor(configuration) {
        this.configuration = configuration
        this.connectionState = 'new'
        this.remoteDescription = null
        FakePeerConnection.instances.push(this)
    }
    createDataChannel() { return { readyState: 'connecting', close() {}, send() {} } }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' } }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' } }
    async setLocalDescription(value) { this.localDescription = value }
    async setRemoteDescription(value) { this.remoteDescription = value }
    async addIceCandidate() {}
    setConfiguration(value) { this.configuration = value }
    close() { this.connectionState = 'closed' }
}
FakePeerConnection.instances = []

function fakeSignalingWithGuests() {
    const stateListeners = new Set()
    const signalListeners = new Set()
    const sent = []
    const state = {
        socketOpen: true,
        roomCode: 'ABCDEFGH',
        role: 'host',
        peerId: 'host',
        iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
        peers: [1, 2, 3].map(function (slot) { return { peerId: `guest-${slot}`, role: 'guest', slot } })
    }
    return {
        sent,
        getState() { return JSON.parse(JSON.stringify(state)) },
        send(type, payload) { sent.push({ type, payload }) },
        subscribe(listener) { stateListeners.add(listener); listener(this.getState()); return function () { stateListeners.delete(listener) } },
        onSignal(listener) { signalListeners.add(listener); return function () { signalListeners.delete(listener) } }
    }
}

async function main() {
    await check('manifest is Phase 2 and loads signaling before transport', function () {
        const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, 'mod.json'), 'utf8'))
        assert.strictEqual(manifest.id, 'cattail.p2p-multiplayer')
        assert.strictEqual(manifest.version, '0.2.1')
        assert.deepStrictEqual(manifest.entry, [
            'scripts/protocol.js', 'scripts/safe-mode.js', 'scripts/signaling.js', 'scripts/transport.js', 'scripts/ui.js', 'scripts/main.js'
        ])
    })

    await check('protocol v2 validates room, envelopes, signaling and handshake', function () {
        assert.strictEqual(protocol.PROTOCOL_VERSION, 2)
        assert.strictEqual(protocol.validateRoomCode('abcd-efgh'), 'ABCDEFGH')
        const envelope = protocol.makeEnvelope(protocol.MESSAGE_TYPES.HANDSHAKE_ACK, { accepted: true })
        assert.strictEqual(protocol.validateEnvelope(envelope).protocolVersion, 2)
        const signal = protocol.makeSignalMessage(protocol.SIGNAL_TYPES.OFFER, { targetPeerId: 'guest-1' })
        assert.strictEqual(protocol.validateSignalMessage(signal).type, protocol.SIGNAL_TYPES.OFFER)
        const handshake = protocol.buildHandshake({
            role: 'guest', peerId: 'guest-1', roomCode: 'ABCDEFGH',
            mods: [{ id: protocol.MOD_ID, version: protocol.MOD_VERSION }]
        })
        assert.strictEqual(protocol.validateHandshake(handshake, { roomCode: 'ABCDEFGH', localRole: 'host', peerId: 'guest-1' }).role, 'guest')
        assert.throws(function () { protocol.validateHandshake(handshake, { localRole: 'guest' }) }, /host-star/)
    })

    await check('diagnostics redact private networking fields', function () {
        const value = protocol.sanitizeDiagnostic({ roomCode: 'ABCDEFGH', participantToken: 'private', candidate: { address: '203.0.113.1' }, safe: 'ok' })
        assert.strictEqual(value.roomCode, '[redacted]')
        assert.strictEqual(value.participantToken, '[redacted]')
        assert.strictEqual(value.candidate, '[redacted]')
        assert.strictEqual(value.safe, 'ok')
    })

    await check('deterministic Phase 2 binary probe remains 4096 bytes', function () {
        const first = protocol.inspectBinaryProbe(protocol.createBinaryProbe(4096))
        const second = protocol.inspectBinaryProbe(protocol.createBinaryProbe(4096))
        assert.deepStrictEqual(first, second)
        assert.strictEqual(first.byteLength, 4096)
    })

    await check('safe launch configuration carries the local signaling URL', function () {
        const config = safeMode.readLaunchConfig(['game.exe', '--p2p-safe-test', '--p2p-role=guest'], {
            CATTAIL_P2P_SIGNALING_URL: 'http://127.0.0.1:8787', CATTAIL_P2P_ALPHA_INVITE: 'private-alpha-invite', APPDATA: 'A'
        })
        assert.strictEqual(config.safeTest, true)
        assert.strictEqual(config.role, 'guest')
        assert.strictEqual(config.signalingUrl, 'http://127.0.0.1:8787')
        assert.strictEqual(config.alphaInviteToken, 'private-alpha-invite')
        assert.strictEqual(config.sessionId, 'phase2-local')
    })

    await check('signaling client creates, authenticates, refreshes and reconnects without exposing tokens', async function () {
        FakeWebSocket.instances.length = 0
        const signaling = signalingModule.create({
            protocol,
            config: { safeTest: true, role: 'host', signalingUrl: 'http://127.0.0.1:8787', alphaInviteToken: 'private-alpha-invite' },
            audit: { record() {} },
            fetch: fakeFetch,
            WebSocket: FakeWebSocket
        })
        const created = await signaling.createRoom()
        assert.strictEqual(created.status, 'signaling-ready')
        assert.strictEqual(created.roomCode, 'ABCDEFGH')
        assert.doesNotMatch(JSON.stringify(created), /private-host-token|private-resume-token|rotated-/)
        assert.doesNotMatch(JSON.stringify(created), /private-alpha-invite/)
        FakeWebSocket.instances[0].serverClose()
        await delay(550)
        assert.strictEqual(FakeWebSocket.instances.length, 2)
        assert.strictEqual(signaling.getState().status, 'signaling-ready')
        signaling.close()
    })

    await check('host transport allocates one offer per guest and never guest-to-guest', async function () {
        FakePeerConnection.instances.length = 0
        const signaling = fakeSignalingWithGuests()
        const transport = transportModule.create({
            protocol,
            signaling,
            config: { safeTest: true, role: 'host' },
            audit: { record() {} },
            getHandshake() { return protocol.buildHandshake({ role: 'host', peerId: 'host', roomCode: 'ABCDEFGH', mods: [{ id: protocol.MOD_ID, version: protocol.MOD_VERSION }] }) },
            RTCPeerConnection: FakePeerConnection
        })
        await delay(10)
        assert.strictEqual(FakePeerConnection.instances.length, 3)
        assert.deepStrictEqual(signaling.sent.map(function (entry) { return entry.payload.targetPeerId }).sort(), ['guest-1', 'guest-2', 'guest-3'])
        assert.ok(signaling.sent.every(function (entry) { return entry.type === protocol.SIGNAL_TYPES.OFFER }))
        assert.deepStrictEqual(Object.keys(transport).sort(), [
            'close', 'getState', 'reset', 'runLoopback', 'sendBinaryProbe', 'sendProbeToAll', 'setIceServers', 'subscribe'
        ].sort())
        transport.close()
    })

    await check('source scope excludes world synchronization and manual SDP', function () {
        const combined = ['scripts/signaling.js', 'scripts/transport.js', 'scripts/ui.js', 'scripts/main.js'].map(function (file) {
            return fs.readFileSync(path.join(modRoot, file), 'utf8')
        }).join('\n')
        assert.doesNotMatch(combined, /assembleSave|loadSave\(|entity.*sync|resource.*sync/i)
        assert.doesNotMatch(combined, /manual[- ]sdp|Incoming offer\/answer token|P2P1\./i)
        assert.match(combined, /Export sanitized diagnostics/)
    })

    await check('service contract uses declarative SQLite Durable Objects and guarded deploy command', function () {
        const config = fs.readFileSync(path.join(modRoot, 'services', 'signaling', 'wrangler.jsonc'), 'utf8')
        const alphaConfig = fs.readFileSync(path.join(modRoot, 'services', 'signaling', 'wrangler.alpha.jsonc'), 'utf8')
        const servicePackage = JSON.parse(fs.readFileSync(path.join(modRoot, 'services', 'signaling', 'package.json'), 'utf8'))
        assert.match(config, /"exports"/)
        assert.match(config, /P2PRoom/)
        assert.match(config, /P2PAdmission/)
        assert.match(alphaConfig, /"SERVICE_DISABLED": "true"/)
        assert.match(alphaConfig, /"ALPHA_INVITE_REQUIRED": "true"/)
        assert.match(alphaConfig, /"TURN_DISABLED": "true"/)
        assert.match(alphaConfig, /"workers_dev": false/)
        assert.match(alphaConfig, /"preview_urls": false/)
        assert.doesNotMatch(alphaConfig, /"routes?"\s*:/)
        assert.match(servicePackage.scripts.deploy, /separate explicit authorization/)
        assert.strictEqual(servicePackage.overrides.undici, '7.29.0')
    })

    process.stdout.write(`P2P_PHASE2_VERIFY=${checks}/9\n`)
}

main().catch(function (error) {
    console.error(error)
    process.exitCode = 1
})
