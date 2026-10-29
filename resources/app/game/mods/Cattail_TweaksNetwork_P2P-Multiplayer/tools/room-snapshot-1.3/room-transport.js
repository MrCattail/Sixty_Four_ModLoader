(function (root) {
    'use strict'

    function create(options) {
        const protocol = options.protocol
        const signaling = options.signaling
        const config = options.config || {}
        const audit = options.audit || { record: function () {} }
        const getHandshake = options.getHandshake
        const PeerConnection = options.RTCPeerConnection || root.RTCPeerConnection
        const localOnly = config.localOnly === true
        const context = options.context
        if (localOnly && (!config.desktop13 || !context?.validate(config))) throw new Error('Valid early P2P session required.')
        if (!localOnly || !config.desktop13 || !context?.config?.runId) throw new Error('ROOM_EXPERIMENT_REQUIRED.');
        const endpoint = () => root.Snapshot13?.wire;
        const listeners = new Set()
        const peers = new Map()
        let destroyed = false
        let iceServers = localOnly ? [] : [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }]
        let lastLoopback = null
        let lastError = null

        function publicPeer(record) {
            return {
                peerId: record.peerId,
                role: record.role,
                status: record.status,
                channelOpen: !!record.channel && record.channel.readyState === 'open',
                sameMachine: record.sameMachine === true,
                connectionPath: record.connectionPath,
                localCandidateType: record.localCandidateType,
                remoteCandidateType: record.remoteCandidateType,
                retry: record.retry,
                remoteHandshake: record.remoteHandshake,
                handshakeAck: record.handshakeAck,
                snapshotChannelOpen: record.snapshotChannel?.readyState === 'open',
                sameConnectionChannels: !!record.snapshotChannel && !!record.channel,
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
                iceServerCount: iceServers.length,
                localOnly,
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
            if (root.Snapshot13?.wire) for (const record of peers.values()) endpoint().update({roomCode:signaling.getState().roomCode,localPeerId:signaling.getState().peerId,remotePeerId:record.peerId,role:config.role,generation:record.retry,primaryReady:!!record.remoteHandshake && record.handshakeAck && record.channel?.readyState === 'open',direct:record.sameMachine && record.connectionPath === 'direct'});
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
            if (localOnly) context.assertReady()
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
                handshakeAck: false,
                snapshotChannel: null,
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
            clearTimeout(record.pathTimer)
            endpoint()?.end('ROOM_CONNECTION_ENDED');
            if (record.snapshotChannel) { try { record.snapshotChannel.close() } catch (error) {} }
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
                if (localOnly && record.remoteHandshake.gameVersion !== getHandshake().gameVersion) throw new Error('Remote game version mismatch.')
                sendEnvelope(record, protocol.MESSAGE_TYPES.HANDSHAKE_ACK, { accepted: true, protocolVersion: protocol.PROTOCOL_VERSION })
                audit.record('remote-handshake-accepted', { peerId: record.peerId, role: record.remoteHandshake.role })
            } else if (envelope.type === protocol.MESSAGE_TYPES.HANDSHAKE_ACK) {
                if (envelope.payload?.accepted !== true || envelope.payload?.protocolVersion !== protocol.PROTOCOL_VERSION) throw new Error('HANDSHAKE_ACK_REJECTED');
                record.handshakeAck = true;
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
                endpoint()?.end('ROOM_CONNECTION_ENDED');
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
                const pc = record.pc
                const reports = await pc.getStats()
                if (record.pc !== pc || pc.connectionState === 'closed') return
                let pair = null
                reports.forEach(function (report) {
                    if (report.type === 'transport' && report.selectedCandidatePairId) pair = reports.get(report.selectedCandidatePairId)
                })
                if (!pair) reports.forEach(function (report) {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.nominated || report.selected)) pair = report
                })
                const local = pair && reports.get(pair.localCandidateId)
                const remote = pair && reports.get(pair.remoteCandidateId)
                if (!pair || [local, remote].some(function (candidate) { return !candidate || !candidate.address || !candidate.port || !candidate.candidateType })) {
                    record.pathAttempts = (record.pathAttempts || 0) + 1
                    if (record.pc && record.pathAttempts < 20) {
                        clearTimeout(record.pathTimer)
                        record.pathTimer = setTimeout(function () { inspectConnectionPath(record) }, 250)
                    } else {
                        audit.record('connection-path-unavailable', { peerId: record.peerId, message: 'Selected ICE candidate statistics remain incomplete after bounded retries.' })
                    }
                    return
                }
                clearTimeout(record.pathTimer)
                if (localOnly) {
                    for (const candidate of [local, remote]) context.candidateAllowed({ candidate: 'candidate:stats 1 udp 1 ' + candidate?.address + ' ' + candidate?.port + ' typ ' + candidate?.candidateType })
                    record.sameMachine = true
                }
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
                    if (localOnly) context.candidateAllowed(event.candidate)
                    signaling.send(protocol.SIGNAL_TYPES.ICE, { targetPeerId: record.peerId, candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate })
                } catch (error) { fail(error, 'ice-signal-send-error', record) }
            }
            pc.onconnectionstatechange = function () {
                if (pc.connectionState === 'connected') {
                    record.status = record.channel?.readyState === 'open' ? 'connected' : 'ice-connected'
                    inspectConnectionPath(record)
                    emit()
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    retryPeer(record, 'connection-failed')
                } else if (pc.connectionState === 'closed') {
                    record.status = 'closed'
                    emit()
                }
            }
            if (hostCreatesChannel) {
                attachChannel(record, pc.createDataChannel(protocol.CHANNEL_LABEL, { ordered: true }));
                record.snapshotChannel = pc.createDataChannel(endpoint().label, { ordered: true });
                endpoint().attach(record.snapshotChannel);
            } else pc.ondatachannel = function (event) {
                if (event.channel.label === protocol.CHANNEL_LABEL && !record.channel) attachChannel(record, event.channel);
                else if (event.channel.label === endpoint().label && !record.snapshotChannel) { record.snapshotChannel = event.channel; endpoint().attach(event.channel); }
                else { event.channel.close(); endpoint().rejectChannel(); }
            }
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
            // Peer-joined and the signaling state subscription can announce the same guest.
            if (record?.pc && record.retry === Math.max(0, Math.min(1, Number(retry || 0))) && !['failed', 'closed'].includes(record.pc.connectionState)) return
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
                if (localOnly) context.descriptionAllowed(message.payload.description)
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
                if (localOnly) context.descriptionAllowed(message.payload.description)
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
                if (localOnly) context.candidateAllowed(message.payload.candidate)
                if (record.pc.remoteDescription) await record.pc.addIceCandidate(message.payload.candidate)
                else record.pendingCandidates.push(message.payload.candidate)
            } catch (error) {
                fail(error, 'ice-candidate-error', record)
            }
        }

        function retryPeer(record, reason) {
            if (record.remoteHandshake) { endpoint()?.end('ROOM_CONNECTION_ENDED'); return; }
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
            endpoint()?.signal(signalState);
            if (Array.isArray(signalState.iceServers)) setIceServers(signalState.iceServers)
            if (config.role !== 'host' || !signalState.socketOpen) return
            for (const peer of signalState.peers || []) {
                if (peer.role === 'guest' && !peers.has(peer.peerId)) createOffer(peer.peerId, 0)
            }
        }

        function setIceServers(nextServers) {
            if (!Array.isArray(nextServers)) return
            iceServers = localOnly ? [] : nextServers.slice()
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

        async function runLoopback() { throw new Error('LOOPBACK_DISABLED_IN_ROOM_SNAPSHOT'); }

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
