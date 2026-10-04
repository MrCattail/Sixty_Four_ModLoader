(function (root) {
    'use strict'

    function create(options) {
        const protocol = options.protocol
        const signaling = options.signaling
        const config = options.config || {}
        const audit = options.audit || { record: function () {} }
        const getHandshake = options.getHandshake
        const PeerConnection = options.RTCPeerConnection || root.RTCPeerConnection
        const listeners = new Set()
        const peers = new Map()
        let destroyed = false
        let iceServers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }]
        let lastLoopback = null
        let lastError = null

        function publicPeer(record) {
            return {
                peerId: record.peerId,
                role: record.role,
                status: record.status,
                channelOpen: !!record.channel && record.channel.readyState === 'open',
                connectionPath: record.connectionPath,
                localCandidateType: record.localCandidateType,
                remoteCandidateType: record.remoteCandidateType,
                retry: record.retry,
                remoteHandshake: record.remoteHandshake,
                sentMessages: record.sentMessages,
                receivedMessages: record.receivedMessages,
                sentBytes: record.sentBytes,
                receivedBytes: record.receivedBytes,
                lastProbe: record.lastProbe,
                error: record.error
            }
        }

        function snapshot() {
            const list = Array.from(peers.values()).map(publicPeer).sort(function (left, right) { return left.peerId.localeCompare(right.peerId) })
            return {
                status: destroyed ? 'closed' : list.some(function (peer) { return peer.channelOpen }) ? 'connected' : list.length ? 'connecting' : 'idle',
                role: config.role || 'none',
                peers: list,
                connectedPeers: list.filter(function (peer) { return peer.channelOpen }).length,
                lastLoopback,
                error: lastError
            }
        }

        function emit() {
            const value = snapshot()
            for (const listener of listeners) {
                try { listener(value) } catch (error) {}
            }
        }

        function fail(error, event, record) {
            const message = error?.message || String(error)
            lastError = message
            if (record) {
                record.status = 'error'
                record.error = message
            }
            emit()
            audit.record(event || 'transport-error', { peerId: record?.peerId || '', message })
            return error instanceof Error ? error : new Error(message)
        }

        function assertAvailable() {
            if (destroyed) throw new Error('Transport has been closed.')
            if (typeof PeerConnection !== 'function') throw new Error('RTCPeerConnection is unavailable in this runtime.')
        }

        function newRecord(peerId, role, retry) {
            return {
                peerId,
                role,
                status: 'new',
                connectionPath: 'unknown',
                localCandidateType: 'unknown',
                remoteCandidateType: 'unknown',
                retry: Math.max(0, Math.min(1, Number(retry || 0))),
                pc: null,
                channel: null,
                pendingCandidates: [],
                connectTimer: null,
                remoteHandshake: null,
                sentMessages: 0,
                receivedMessages: 0,
                sentBytes: 0,
                receivedBytes: 0,
                lastProbe: null,
                error: null
            }
        }

        function closeRecord(record, reason) {
            clearTimeout(record.connectTimer)
            if (record.channel) {
                try { record.channel.close() } catch (error) {}
            }
            if (record.pc) {
                try { record.pc.close() } catch (error) {}
            }
            record.channel = null
            record.pc = null
            record.status = reason || 'closed'
        }

        function removePeer(peerId, reason) {
            const record = peers.get(peerId)
            if (!record) return
            closeRecord(record, reason || 'left')
            peers.delete(peerId)
            audit.record('peer-removed', { peerId, reason: reason || 'left' })
            emit()
        }

        function sendEnvelope(record, type, payload) {
            if (!record.channel || record.channel.readyState !== 'open') throw new Error('DataChannel is not open.')
            const message = JSON.stringify(protocol.makeEnvelope(type, payload))
            record.channel.send(message)
            record.sentMessages += 1
            record.sentBytes += protocol.jsonByteLength(message)
            emit()
        }

        function handleTextMessage(record, raw) {
            const envelope = protocol.validateEnvelope(JSON.parse(raw))
            record.receivedMessages += 1
            record.receivedBytes += protocol.jsonByteLength(raw)
            if (envelope.type === protocol.MESSAGE_TYPES.HANDSHAKE) {
                record.remoteHandshake = protocol.validateHandshake(envelope.payload, {
                    roomCode: signaling.getState().roomCode,
                    localRole: config.role,
                    peerId: record.peerId
                })
                sendEnvelope(record, protocol.MESSAGE_TYPES.HANDSHAKE_ACK, { accepted: true, protocolVersion: protocol.PROTOCOL_VERSION })
                audit.record('remote-handshake-accepted', { peerId: record.peerId, role: record.remoteHandshake.role })
            } else if (envelope.type === protocol.MESSAGE_TYPES.HANDSHAKE_ACK) {
                audit.record('handshake-acknowledged', { peerId: record.peerId })
            } else if (envelope.type === protocol.MESSAGE_TYPES.PROBE_ACK) {
                record.lastProbe = Object.assign({}, envelope.payload, { acknowledgedAt: Date.now() })
                audit.record('binary-probe-acknowledged', { peerId: record.peerId, byteLength: record.lastProbe.byteLength, checksum: record.lastProbe.checksum })
            } else if (envelope.type === protocol.MESSAGE_TYPES.ERROR) {
                throw new Error(`Remote peer reported: ${String(envelope.payload?.message || 'unknown error')}`)
            }
            emit()
        }

        function handleBinaryMessage(record, data) {
            const result = protocol.inspectBinaryProbe(data)
            record.receivedMessages += 1
            record.receivedBytes += result.byteLength
            record.lastProbe = Object.assign({}, result, { receivedAt: Date.now() })
            sendEnvelope(record, protocol.MESSAGE_TYPES.PROBE_ACK, result)
            audit.record('binary-probe-received', { peerId: record.peerId, byteLength: result.byteLength, checksum: result.checksum })
            emit()
        }

        function attachChannel(record, channel) {
            record.channel = channel
            channel.binaryType = 'arraybuffer'
            channel.onopen = function () {
                try {
                    clearTimeout(record.connectTimer)
                    record.status = 'connected'
                    record.error = null
                    lastError = null
                    sendEnvelope(record, protocol.MESSAGE_TYPES.HANDSHAKE, getHandshake())
                    audit.record('data-channel-open', { peerId: record.peerId, role: record.role, retry: record.retry })
                    inspectConnectionPath(record)
                    emit()
                } catch (error) {
                    fail(error, 'data-channel-open-error', record)
                }
            }
            channel.onclose = function () {
                if (destroyed || !peers.has(record.peerId)) return
                record.status = 'disconnected'
                audit.record('data-channel-closed', { peerId: record.peerId })
                emit()
            }
            channel.onerror = function () {
                fail(new Error('DataChannel error.'), 'data-channel-error', record)
            }
            channel.onmessage = function (event) {
                try {
                    if (typeof event.data === 'string') handleTextMessage(record, event.data)
                    else handleBinaryMessage(record, event.data)
                } catch (error) {
                    try { sendEnvelope(record, protocol.MESSAGE_TYPES.ERROR, { message: error.message }) } catch (sendError) {}
                    fail(error, 'data-channel-message-error', record)
                }
            }
        }

        async function inspectConnectionPath(record) {
            try {
                if (!record.pc || typeof record.pc.getStats !== 'function') return
                const reports = await record.pc.getStats()
                let pair = null
                reports.forEach(function (report) {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || report.selected)) pair = report
                })
                if (!pair) return
                const local = reports.get(pair.localCandidateId)
                const remote = reports.get(pair.remoteCandidateId)
                record.localCandidateType = String(local?.candidateType || 'unknown')
                record.remoteCandidateType = String(remote?.candidateType || 'unknown')
                record.connectionPath = record.localCandidateType === 'relay' || record.remoteCandidateType === 'relay' ? 'relay' : 'direct'
                audit.record('connection-path-detected', {
                    peerId: record.peerId,
                    path: record.connectionPath,
                    localCandidateType: record.localCandidateType,
                    remoteCandidateType: record.remoteCandidateType
                })
                emit()
            } catch (error) {
                audit.record('connection-path-unavailable', { peerId: record.peerId, message: error.message })
            }
        }

        function createPeerConnection(record, hostCreatesChannel) {
            assertAvailable()
            const pc = new PeerConnection({ iceServers: iceServers.slice() })
            record.pc = pc
            record.status = 'ice-dtls'
            pc.onicecandidate = function (event) {
                if (!event.candidate) return
                try {
                    signaling.send(protocol.SIGNAL_TYPES.ICE, { targetPeerId: record.peerId, candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate })
                } catch (error) { fail(error, 'ice-signal-send-error', record) }
            }
            pc.onconnectionstatechange = function () {
                if (pc.connectionState === 'connected') {
                    record.status = record.channel?.readyState === 'open' ? 'connected' : 'ice-connected'
                    inspectConnectionPath(record)
                    emit()
                } else if (pc.connectionState === 'failed') {
                    retryPeer(record, 'connection-failed')
                } else if (pc.connectionState === 'closed') {
                    record.status = 'closed'
                    emit()
                }
            }
            if (hostCreatesChannel) attachChannel(record, pc.createDataChannel(protocol.CHANNEL_LABEL, { ordered: true }))
            else pc.ondatachannel = function (event) { attachChannel(record, event.channel) }
            clearTimeout(record.connectTimer)
            record.connectTimer = setTimeout(function () { retryPeer(record, 'connection-timeout') }, 30000)
            return pc
        }

        async function flushCandidates(record) {
            if (!record.pc?.remoteDescription) return
            const pending = record.pendingCandidates.splice(0)
            for (const candidate of pending) await record.pc.addIceCandidate(candidate)
        }

        async function createOffer(peerId, retry) {
            let record = peers.get(peerId)
            if (record) closeRecord(record, 'restarting')
            record = newRecord(peerId, 'guest', retry)
            peers.set(peerId, record)
            try {
                const pc = createPeerConnection(record, true)
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                signaling.send(protocol.SIGNAL_TYPES.OFFER, { targetPeerId: peerId, description: pc.localDescription, retry: record.retry })
                record.status = 'offer-sent'
                audit.record('automatic-offer-sent', { peerId, retry: record.retry })
                emit()
            } catch (error) {
                fail(error, 'automatic-offer-error', record)
            }
        }

        async function acceptOffer(message) {
            const peerId = String(message.payload?.sourcePeerId || '')
            if (config.role !== 'guest' || peerId !== 'host') throw new Error('Guest received an invalid host offer.')
            let record = peers.get(peerId)
            if (record) closeRecord(record, 'restarting')
            record = newRecord(peerId, 'host', message.payload?.retry)
            peers.set(peerId, record)
            try {
                const pc = createPeerConnection(record, false)
                await pc.setRemoteDescription(message.payload.description)
                await flushCandidates(record)
                await pc.setLocalDescription(await pc.createAnswer())
                signaling.send(protocol.SIGNAL_TYPES.ANSWER, { targetPeerId: peerId, description: pc.localDescription, retry: record.retry })
                record.status = 'answer-sent'
                audit.record('automatic-answer-sent', { peerId, retry: record.retry })
                emit()
            } catch (error) {
                fail(error, 'automatic-answer-error', record)
            }
        }

        async function acceptAnswer(message) {
            const peerId = String(message.payload?.sourcePeerId || '')
            const record = peers.get(peerId)
            if (config.role !== 'host' || !record?.pc) throw new Error('Host received an answer without an active offer.')
            try {
                await record.pc.setRemoteDescription(message.payload.description)
                await flushCandidates(record)
                record.status = 'ice-dtls'
                audit.record('automatic-answer-applied', { peerId, retry: record.retry })
                emit()
            } catch (error) {
                fail(error, 'automatic-answer-apply-error', record)
            }
        }

        async function acceptCandidate(message) {
            const peerId = String(message.payload?.sourcePeerId || '')
            const record = peers.get(peerId)
            if (!record?.pc) return
            try {
                if (record.pc.remoteDescription) await record.pc.addIceCandidate(message.payload.candidate)
                else record.pendingCandidates.push(message.payload.candidate)
            } catch (error) {
                fail(error, 'ice-candidate-error', record)
            }
        }

        function retryPeer(record, reason) {
            if (destroyed || !peers.has(record.peerId) || record.status === 'connected') return
            clearTimeout(record.connectTimer)
            if (record.retry >= 1) {
                fail(new Error('Peer connection failed after one automatic retry.'), reason, record)
                return
            }
            audit.record('peer-connection-retry', { peerId: record.peerId, reason, retry: 1 })
            if (config.role === 'host') createOffer(record.peerId, 1)
            else {
                closeRecord(record, 'waiting-retry-offer')
                record.retry = 1
                emit()
            }
        }

        function handleSignal(message) {
            if (destroyed) return
            Promise.resolve().then(function () {
                if (message.type === protocol.SIGNAL_TYPES.PEER_JOINED && config.role === 'host' && message.payload?.role === 'guest') {
                    return createOffer(String(message.payload.peerId), 0)
                }
                if (message.type === protocol.SIGNAL_TYPES.PEER_LEFT) {
                    removePeer(String(message.payload?.peerId || ''), 'signaling-left')
                    return
                }
                if (message.type === protocol.SIGNAL_TYPES.OFFER) return acceptOffer(message)
                if (message.type === protocol.SIGNAL_TYPES.ANSWER) return acceptAnswer(message)
                if (message.type === protocol.SIGNAL_TYPES.ICE) return acceptCandidate(message)
                if (message.type === protocol.SIGNAL_TYPES.HEARTBEAT && message.payload?.kind === 'ice-servers-refreshed') setIceServers(message.payload.iceServers)
            }).catch(function (error) { fail(error, 'signal-handler-error') })
        }

        function reconcileSignaling(signalState) {
            if (Array.isArray(signalState.iceServers)) setIceServers(signalState.iceServers)
            if (config.role !== 'host' || !signalState.socketOpen) return
            for (const peer of signalState.peers || []) {
                if (peer.role === 'guest' && !peers.has(peer.peerId)) createOffer(peer.peerId, 0)
            }
        }

        function setIceServers(nextServers) {
            if (!Array.isArray(nextServers) || !nextServers.length) return
            iceServers = nextServers.slice()
            for (const record of peers.values()) {
                try { record.pc?.setConfiguration({ iceServers: iceServers.slice() }) } catch (error) {
                    audit.record('ice-server-refresh-apply-error', { peerId: record.peerId, message: error.message })
                }
            }
            emit()
        }

        function sendBinaryProbe(peerId, byteLength) {
            const record = peers.get(String(peerId || ''))
            if (!record?.channel || record.channel.readyState !== 'open') throw fail(new Error('Selected peer DataChannel is not open.'), 'binary-probe-send-error', record)
            const probe = protocol.createBinaryProbe(byteLength || 4096)
            const result = protocol.inspectBinaryProbe(probe)
            record.channel.send(probe)
            record.sentMessages += 1
            record.sentBytes += result.byteLength
            record.lastProbe = Object.assign({}, result, { sentAt: Date.now() })
            audit.record('binary-probe-sent', { peerId: record.peerId, byteLength: result.byteLength, checksum: result.checksum })
            emit()
            return result
        }

        function sendProbeToAll(byteLength) {
            const results = []
            for (const record of peers.values()) if (record.channel?.readyState === 'open') results.push({ peerId: record.peerId, result: sendBinaryProbe(record.peerId, byteLength) })
            if (!results.length) throw new Error('No connected peers are available for a probe.')
            return results
        }

        function waitFor(condition, timeoutMs, description) {
            return new Promise(function (resolve, reject) {
                const started = Date.now()
                const timer = setInterval(function () {
                    const value = condition()
                    if (value) {
                        clearInterval(timer)
                        resolve(value)
                    } else if (Date.now() - started >= timeoutMs) {
                        clearInterval(timer)
                        reject(new Error(`Timed out waiting for ${description}.`))
                    }
                }, 20)
            })
        }

        async function runLoopback() {
            assertAvailable()
            const startedAt = Date.now()
            const left = new PeerConnection({ iceServers: [] })
            const right = new PeerConnection({ iceServers: [] })
            const probe = protocol.createBinaryProbe(4096)
            const expected = protocol.inspectBinaryProbe(probe)
            let received = null
            let rightChannel = null
            const leftChannel = left.createDataChannel(protocol.CHANNEL_LABEL, { ordered: true })
            try {
                right.ondatachannel = function (event) {
                    rightChannel = event.channel
                    rightChannel.binaryType = 'arraybuffer'
                    rightChannel.onmessage = function (message) { received = protocol.inspectBinaryProbe(message.data) }
                }
                await left.setLocalDescription(await left.createOffer())
                await right.setRemoteDescription(left.localDescription)
                await right.setLocalDescription(await right.createAnswer())
                await left.setRemoteDescription(right.localDescription)
                await waitFor(function () { return leftChannel.readyState === 'open' && rightChannel?.readyState === 'open' }, 10000, 'loopback DataChannel open')
                leftChannel.send(probe)
                await waitFor(function () { return received }, 5000, 'loopback binary probe')
                if (received.byteLength !== expected.byteLength || received.checksum !== expected.checksum) throw new Error('Loopback binary probe verification failed.')
                lastLoopback = { ok: true, byteLength: received.byteLength, checksum: received.checksum, elapsedMs: Date.now() - startedAt }
                audit.record('loopback-passed', lastLoopback)
                emit()
                return lastLoopback
            } catch (error) {
                throw fail(error, 'loopback-error')
            } finally {
                try { leftChannel.close() } catch (error) {}
                try { rightChannel?.close() } catch (error) {}
                left.close()
                right.close()
            }
        }

        const unsubscribeSignal = signaling.onSignal(handleSignal)
        const unsubscribeState = signaling.subscribe(reconcileSignaling)

        function reset() {
            if (destroyed) return
            for (const record of peers.values()) closeRecord(record, 'reset')
            peers.clear()
            lastError = null
            emit()
            audit.record('transport-reset', { role: config.role })
        }

        function close() {
            if (destroyed) return
            destroyed = true
            unsubscribeSignal()
            unsubscribeState()
            for (const record of peers.values()) closeRecord(record, 'closed')
            peers.clear()
            emit()
            audit.record('transport-closed', { role: config.role })
        }

        return Object.freeze({
            sendBinaryProbe,
            sendProbeToAll,
            runLoopback,
            setIceServers,
            reset,
            close,
            subscribe: function (listener) { listeners.add(listener); listener(snapshot()); return function () { listeners.delete(listener) } },
            getState: snapshot
        })
    }

    const exported = Object.freeze({ create })
    root.CattailP2PTransport = exported
    if (typeof module === 'object' && module.exports) module.exports = exported
})(typeof window !== 'undefined' ? window : globalThis)
