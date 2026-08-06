(function (root) {
    'use strict'

    function create(options) {
        const protocol = options.protocol
        const config = options.config || {}
        const audit = options.audit || { record: function () {} }
        const fetchImpl = options.fetch || root.fetch?.bind(root)
        const WebSocketImpl = options.WebSocket || root.WebSocket
        const AbortControllerImpl = options.AbortController || root.AbortController
        const listeners = new Set()
        const signalListeners = new Set()
        let socket = null
        let intentionalClose = false
        let reconnects = 0
        let refreshTimer = null
        let heartbeatTimer = null
        let participantToken = ''
        let resumeToken = ''
        const alphaInviteToken = String(config.alphaInviteToken || '')

        const state = {
            status: 'idle',
            role: config.role || 'none',
            roomCode: '',
            peerId: '',
            slot: null,
            peers: [],
            signalingUrl: normalizeBaseUrl(config.signalingUrl || 'http://127.0.0.1:8787', !!config.safeTest),
            socketOpen: false,
            reconnectAttempt: 0,
            iceMode: 'stun-only',
            iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }],
            turnExpiresAt: null,
            lastEvent: null,
            error: null
        }

        function normalizeBaseUrl(value, allowLocalHttp) {
            const url = new URL(String(value || '').trim())
            const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
            if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) {
                throw new Error('Signaling requires HTTPS; safe-test localhost may use HTTP.')
            }
            url.pathname = url.pathname.replace(/\/+$/, '')
            url.search = ''
            url.hash = ''
            return url.toString().replace(/\/$/, '')
        }

        function snapshot() {
            return JSON.parse(JSON.stringify(state))
        }

        function emit() {
            const value = snapshot()
            for (const listener of listeners) {
                try { listener(value) } catch (error) {}
            }
        }

        function update(values) {
            Object.assign(state, values)
            emit()
        }

        function fail(error, event) {
            const message = error?.message || String(error)
            update({ status: 'error', error: message })
            audit.record(event || 'signaling-error', { message })
            return error instanceof Error ? error : new Error(message)
        }

        function assertLocalScope() {
            if (!config.safeTest) throw new Error('Phase 2 local implementation requires SAFE TEST MODE.')
            if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable in this runtime.')
            if (typeof WebSocketImpl !== 'function') throw new Error('WebSocket is unavailable in this runtime.')
        }

        async function request(path, body, auth) {
            const controller = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null
            const timeout = setTimeout(function () { controller?.abort() }, 10000)
            try {
                const headers = { 'content-type': 'application/json' }
                if (alphaInviteToken) headers['x-p2p-alpha-invite'] = alphaInviteToken
                if (auth) {
                    headers.authorization = `Bearer ${participantToken}`
                    headers['x-p2p-resume-token'] = resumeToken
                }
                const response = await fetchImpl(state.signalingUrl + path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body || {}),
                    signal: controller?.signal
                })
                let value = {}
                try { value = await response.json() } catch (error) {}
                if (!response.ok) throw new Error(value.error || `Signaling request failed with HTTP ${response.status}.`)
                return value
            } finally {
                clearTimeout(timeout)
            }
        }

        function applySession(value) {
            if (value.protocolVersion !== protocol.PROTOCOL_VERSION) throw new Error(`Signaling protocol mismatch: ${value.protocolVersion}`)
            participantToken = String(value.participantToken || '')
            resumeToken = String(value.resumeToken || '')
            if (!participantToken || !resumeToken) throw new Error('Signaling service did not issue private session credentials.')
            update({
                role: protocol.normalizeRole(value.role),
                roomCode: protocol.validateRoomCode(value.roomCode),
                peerId: String(value.peerId || ''),
                slot: Number.isFinite(value.slot) ? value.slot : value.role === 'host' ? 0 : null,
                peers: [],
                iceServers: Array.isArray(value.iceServers) ? value.iceServers : state.iceServers,
                error: null
            })
        }

        function websocketUrl() {
            const url = new URL(`${state.signalingUrl}/v2/rooms/${encodeURIComponent(state.roomCode)}/socket`)
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
            return url.toString()
        }

        function send(type, payload, requestId) {
            if (!socket || socket.readyState !== WebSocketImpl.OPEN) throw new Error('Signaling WebSocket is not open.')
            socket.send(JSON.stringify(protocol.makeSignalMessage(type, payload, { requestId })))
        }

        function publishSignal(message) {
            for (const listener of signalListeners) {
                try { listener(message) } catch (error) { audit.record('signal-listener-error', { message: error.message }) }
            }
        }

        function handleMessage(event, resolveAuth, rejectAuth) {
            try {
                const message = protocol.validateSignalMessage(JSON.parse(String(event.data || '')))
                update({ lastEvent: { type: message.type, sentAt: message.sentAt } })
                if (message.type === protocol.SIGNAL_TYPES.AUTH_OK) {
                    resumeToken = String(message.payload?.resumeToken || '')
                    if (!resumeToken) throw new Error('Signaling reconnect token was not rotated.')
                    reconnects = 0
                    update({
                        status: 'signaling-ready',
                        socketOpen: true,
                        peerId: String(message.payload.peerId || state.peerId),
                        role: protocol.normalizeRole(message.payload.role || state.role),
                        slot: Number.isFinite(message.payload.slot) ? message.payload.slot : state.slot,
                        peers: Array.isArray(message.payload.peers) ? message.payload.peers : [],
                        reconnectAttempt: 0,
                        error: null
                    })
                    audit.record('signaling-authenticated', { role: state.role, peerId: state.peerId, roomCodeLength: state.roomCode.length })
                    scheduleHeartbeat()
                    resolveAuth?.(snapshot())
                    return
                }
                if (message.type === protocol.SIGNAL_TYPES.PEER_JOINED) {
                    const peer = message.payload || {}
                    const peers = state.peers.filter(function (entry) { return entry.peerId !== peer.peerId })
                    peers.push({ peerId: String(peer.peerId || ''), role: protocol.normalizeRole(peer.role), slot: Number(peer.slot) })
                    update({ peers })
                } else if (message.type === protocol.SIGNAL_TYPES.PEER_LEFT) {
                    update({ peers: state.peers.filter(function (entry) { return entry.peerId !== message.payload?.peerId }) })
                } else if (message.type === protocol.SIGNAL_TYPES.ERROR) {
                    throw new Error(String(message.payload?.message || 'Signaling server reported an error.'))
                }
                publishSignal(message)
            } catch (error) {
                rejectAuth?.(error)
                fail(error, 'signaling-message-error')
            }
        }

        function scheduleHeartbeat() {
            clearTimeout(heartbeatTimer)
            heartbeatTimer = setTimeout(function heartbeat() {
                if (!socket || socket.readyState !== WebSocketImpl.OPEN) return
                try { send(protocol.SIGNAL_TYPES.HEARTBEAT, { clientTime: Date.now() }) } catch (error) {}
                heartbeatTimer = setTimeout(heartbeat, 25000)
            }, 25000)
        }

        function connectSocket() {
            assertLocalScope()
            intentionalClose = false
            update({ status: reconnects ? 'reconnecting' : 'signaling', reconnectAttempt: reconnects, error: null })
            return new Promise(function (resolve, reject) {
                let settled = false
                const authTimeout = setTimeout(function () {
                    if (settled) return
                    settled = true
                    try { socket?.close() } catch (error) {}
                    reject(fail(new Error('Signaling authentication timed out after 10 seconds.'), 'signaling-auth-timeout'))
                }, 10000)
                socket = new WebSocketImpl(websocketUrl())
                socket.onopen = function () {
                    try {
                        send(protocol.SIGNAL_TYPES.AUTH, { participantToken, resumeToken, alphaInviteToken })
                    } catch (error) {
                        clearTimeout(authTimeout)
                        settled = true
                        reject(fail(error, 'signaling-auth-send-error'))
                    }
                }
                socket.onmessage = function (event) {
                    handleMessage(event, function (value) {
                        if (settled) return
                        settled = true
                        clearTimeout(authTimeout)
                        resolve(value)
                    }, function (error) {
                        if (settled) return
                        settled = true
                        clearTimeout(authTimeout)
                        reject(error)
                    })
                }
                socket.onerror = function () {
                    audit.record('signaling-socket-error', { status: state.status })
                }
                socket.onclose = function (event) {
                    clearTimeout(authTimeout)
                    clearTimeout(heartbeatTimer)
                    update({ socketOpen: false })
                    if (!settled) {
                        settled = true
                        reject(fail(new Error(`Signaling WebSocket closed before authentication (${event.code || 0}).`), 'signaling-closed-before-auth'))
                        return
                    }
                    if (intentionalClose || !participantToken) {
                        update({ status: 'closed' })
                        return
                    }
                    if (reconnects < 1) {
                        reconnects += 1
                        update({ status: 'reconnecting', reconnectAttempt: reconnects })
                        setTimeout(function () { connectSocket().catch(function (error) { fail(error, 'signaling-reconnect-error') }) }, 500)
                    } else {
                        fail(new Error('Signaling connection was lost after one automatic reconnect attempt.'), 'signaling-reconnect-exhausted')
                    }
                }
            })
        }

        async function refreshIceServers() {
            if (!state.roomCode || !participantToken || !resumeToken) throw new Error('A room session is required before requesting ICE servers.')
            const result = await request(`/v2/rooms/${encodeURIComponent(state.roomCode)}/turn`, {}, true)
            const refreshAfterMs = Math.max(5 * 60 * 1000, Number(result.refreshAfterMs || 90 * 60 * 1000))
            update({
                iceMode: result.mode === 'stun-turn' ? 'stun-turn' : 'stun-only',
                iceServers: Array.isArray(result.iceServers) ? result.iceServers : state.iceServers,
                turnExpiresAt: Date.now() + Math.max(10 * 60 * 1000, Number(result.ttlSeconds || 7200) * 1000)
            })
            clearTimeout(refreshTimer)
            refreshTimer = setTimeout(function () {
                refreshIceServers().then(function () {
                    publishSignal(protocol.makeSignalMessage(protocol.SIGNAL_TYPES.HEARTBEAT, { kind: 'ice-servers-refreshed', iceServers: state.iceServers }))
                }).catch(function (error) { fail(error, 'turn-refresh-error') })
            }, refreshAfterMs)
            audit.record('ice-servers-refreshed', { mode: state.iceMode, serverCount: state.iceServers.length, refreshAfterMs })
            return state.iceServers.slice()
        }

        async function createRoom() {
            try {
                assertLocalScope()
                closeSession(false)
                update({ status: 'creating-room', error: null })
                const value = await request('/v2/rooms', { protocolVersion: protocol.PROTOCOL_VERSION, modVersion: protocol.MOD_VERSION })
                applySession(value)
                await connectSocket()
                await refreshIceServers()
                return snapshot()
            } catch (error) {
                throw fail(error, 'room-create-error')
            }
        }

        async function joinRoom(roomCode) {
            try {
                assertLocalScope()
                closeSession(false)
                const code = protocol.validateRoomCode(roomCode)
                update({ status: 'joining-room', roomCode: code, error: null })
                const value = await request(`/v2/rooms/${encodeURIComponent(code)}/join`, { protocolVersion: protocol.PROTOCOL_VERSION, modVersion: protocol.MOD_VERSION })
                applySession(value)
                await connectSocket()
                await refreshIceServers()
                return snapshot()
            } catch (error) {
                throw fail(error, 'room-join-error')
            }
        }

        function closeSession(clearIdentity) {
            intentionalClose = true
            clearTimeout(refreshTimer)
            clearTimeout(heartbeatTimer)
            if (socket) {
                try { socket.close(1000, 'Client closed session') } catch (error) {}
            }
            socket = null
            reconnects = 0
            if (clearIdentity !== false) {
                participantToken = ''
                resumeToken = ''
                update({ status: 'closed', roomCode: '', peerId: '', slot: null, peers: [], socketOpen: false, reconnectAttempt: 0 })
            }
        }

        function retry() {
            if (!participantToken || !resumeToken || !state.roomCode) return Promise.reject(new Error('There is no room session to retry.'))
            reconnects = 0
            return connectSocket().then(refreshIceServers)
        }

        function subscribe(listener) {
            listeners.add(listener)
            listener(snapshot())
            return function () { listeners.delete(listener) }
        }

        function onSignal(listener) {
            signalListeners.add(listener)
            return function () { signalListeners.delete(listener) }
        }

        return Object.freeze({
            createRoom,
            joinRoom,
            refreshIceServers,
            retry,
            close: function () { closeSession(true) },
            send,
            subscribe,
            onSignal,
            getState: snapshot
        })
    }

    const exported = Object.freeze({ create })
    root.CattailP2PSignaling = exported
    if (typeof module === 'object' && module.exports) module.exports = exported
})(typeof window !== 'undefined' ? window : globalThis)
