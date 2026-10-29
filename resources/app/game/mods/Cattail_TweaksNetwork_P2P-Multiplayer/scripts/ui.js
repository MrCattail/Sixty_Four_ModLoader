(function (root) {
    'use strict'

    function element(tag, text, styles) {
        const node = document.createElement(tag)
        if (text !== undefined && text !== null) node.textContent = String(text)
        if (styles) Object.assign(node.style, styles)
        return node
    }

    function button(label, action, disabled) {
        const node = element('button', label, {
            border: '1px solid rgba(255,255,255,.25)', borderRadius: '5px', padding: '7px 10px',
            background: 'rgba(255,255,255,.1)', color: 'inherit', cursor: disabled ? 'default' : 'pointer'
        })
        node.type = 'button'
        node.disabled = !!disabled
        node.onclick = function (event) {
            event.preventDefault()
            event.stopPropagation()
            if (!node.disabled) action()
        }
        return node
    }

    function row(label, value) {
        const wrap = element('div', null, { display: 'grid', gridTemplateColumns: '155px 1fr', gap: '8px' })
        wrap.append(element('strong', label), element('span', value))
        return wrap
    }

    function peerRows(peers) {
        const wrap = element('div', null, { display: 'grid', gap: '5px' })
        if (!peers.length) {
            wrap.append(element('div', 'No WebRTC peers connected yet.', { opacity: '.75' }))
            return wrap
        }
        for (const peer of peers) {
            const probe = peer.lastProbe ? `${peer.lastProbe.byteLength} bytes / checksum ${peer.lastProbe.checksum}` : 'not run'
            wrap.append(element('div', `${peer.peerId} · ${peer.status} · ${peer.connectionPath} · probe ${probe}`, {
                padding: '6px 8px', border: '1px solid rgba(255,255,255,.15)', borderRadius: '5px'
            }))
        }
        return wrap
    }

    function install(api, runtime) {
        const pageHandle = api.ui.pages.register({
            id: 'p2p-phase2',
            prefix: 'cattail-p2p-phase2',
            menuLabel: 'P2P MULTIPLAYER',
            title: 'P2P MULTIPLAYER — PHASE 2',
            width: '840px',
            contentHeight: '620px',
            mobileContentHeight: '680px',
            inertialScroll: { multiplier: 1 },
            renderContent: function (ctx) {
                runtime.refreshPage = ctx.refresh
                const signal = runtime.signaling.getState()
                const transport = runtime.transport.getState()
                const ready = !!runtime.game?.version && (!runtime.config.desktop13 || runtime.safety.context.ready)
                const safe = runtime.config.safeTest && ready
                const host = runtime.config.role === 'host'
                const guest = runtime.config.role === 'guest'
                const rootNode = element('div', null, { display: 'grid', gap: '11px', color: 'inherit' })
                rootNode.append(element('div', safe
                    ? runtime.config.localOnly ? 'LOCAL TEST: progress commits to session memory only; same-machine host ICE only. Reset, import and slot changes are restricted.' : 'SAFE TEST MODE: Phase 2 may signal and probe, but persistence, Steam stats, achievements, reset and import/restore writes are blocked.'
                    : runtime.config.safeTest ? 'Waiting for game and early protection readiness. Room operations are disabled.' : 'SAFE TEST MODE IS OFF. Phase 2 room operations are disabled.', {
                        padding: '9px', border: '1px solid rgba(255,190,80,.45)', borderRadius: '6px',
                        background: 'rgba(255,190,80,.12)'
                    }))

                const summary = element('div', null, { display: 'grid', gap: '5px' })
                summary.append(
                    row('Role', runtime.config.role.toUpperCase()),
                    row('Signaling', signal.status),
                    row('Room code', runtime.config.localOnly && signal.roomCode ? 'local room (copy to join)' : signal.roomCode || 'not created/joined'),
                    row('ICE mode', signal.iceMode),
                    row('WebRTC peers', `${transport.connectedPeers} connected / ${transport.peers.length} known`),
                    row('Audit log', runtime.audit.path || 'memory only')
                )
                rootNode.append(summary)

                const roomControls = element('div', null, { display: 'flex', flexWrap: 'wrap', gap: '7px', alignItems: 'center' })
                roomControls.append(button('Create room', function () {
                    runAction(runtime, 'create-room', function () { return runtime.signaling.createRoom() })
                }, !safe || !host || runtime.busy))
                const joinInput = element('input', null, {
                    width: '145px', padding: '7px', borderRadius: '5px', border: '1px solid rgba(255,255,255,.25)',
                    background: 'rgba(0,0,0,.15)', color: 'inherit', textTransform: 'uppercase', font: '13px Consolas, monospace'
                })
                joinInput.value = runtime.joinCode || ''
                joinInput.maxLength = runtime.api?.protocol?.ROOM_CODE_LENGTH || 8
                joinInput.placeholder = 'ROOM CODE'
                joinInput.oninput = function () { runtime.joinCode = joinInput.value.toUpperCase() }
                roomControls.append(joinInput)
                roomControls.append(button('Join room', function () {
                    runAction(runtime, 'join-room', function () { return runtime.signaling.joinRoom(runtime.joinCode) })
                }, !safe || !guest || runtime.busy))
                roomControls.append(button('Copy room code', async function () {
                    try {
                        await navigator.clipboard.writeText(signal.roomCode || '')
                        runtime.notice = 'Room code copied.'
                    } catch (error) { runtime.notice = `Copy failed: ${error.message}` }
                    ctx.refresh()
                }, !signal.roomCode))
                rootNode.append(roomControls)

                const transportControls = element('div', null, { display: 'flex', flexWrap: 'wrap', gap: '7px' })
                transportControls.append(
                    button('Run one-instance loopback', function () { runAction(runtime, 'loopback', function () { return runtime.transport.runLoopback() }) }, !!runtime.busy),
                    button('Send 4 KiB probe to all', function () { runAction(runtime, 'probe-all', function () { return runtime.transport.sendProbeToAll(4096) }) }, !transport.connectedPeers || !!runtime.busy),
                    button('Retry signaling', function () { runAction(runtime, 'retry-signaling', function () { return runtime.signaling.retry() }) }, !signal.roomCode || signal.socketOpen || !!runtime.busy),
                    button('Close room connection', function () {
                        runtime.transport.reset()
                        runtime.signaling.close()
                        runtime.notice = 'Room connection closed.'
                        ctx.refresh()
                    }, !signal.roomCode),
                    button('Export sanitized diagnostics', function () { exportDiagnostics(runtime) }, false)
                )
                rootNode.append(transportControls)
                rootNode.append(peerRows(transport.peers))

                const loopback = transport.lastLoopback
                const status = element('pre', [
                    runtime.busy ? `Working: ${runtime.busy}` : (runtime.notice || 'Ready.'),
                    signal.error ? `Signaling error: ${signal.error}` : '',
                    transport.error ? `Transport error: ${transport.error}` : '',
                    loopback ? `Loopback: PASS, ${loopback.byteLength} bytes, checksum ${loopback.checksum}, ${loopback.elapsedMs} ms` : 'Loopback: not run'
                ].filter(Boolean).join('\n'), {
                    whiteSpace: 'pre-wrap', padding: '9px', borderRadius: '6px', background: 'rgba(0,0,0,.2)',
                    font: '11px/1.45 Consolas, monospace'
                })
                rootNode.append(status)
                return rootNode
            }
        })

        runtime.signaling.subscribe(function () { runtime.refreshPage?.() })
        runtime.transport.subscribe(function () { runtime.refreshPage?.() })
        runtime.audit.subscribe(function () { runtime.refreshPage?.() })
        return pageHandle
    }

    async function runAction(runtime, name, action) {
        if (runtime.busy) return
        runtime.busy = name
        runtime.notice = ''
        runtime.refreshPage?.()
        try {
            const result = await action()
            runtime.notice = `${name} completed${result?.ok ? ': PASS' : '.'}`
        } catch (error) {
            runtime.notice = `${name} failed: ${error.message}`
        } finally {
            runtime.busy = ''
            runtime.refreshPage?.()
        }
    }

    function exportDiagnostics(runtime) {
        try {
            const protocol = root.CattailP2PProtocol
            const diagnostic = protocol.sanitizeDiagnostic({
                exportedAt: new Date().toISOString(),
                modVersion: protocol.MOD_VERSION,
                protocolVersion: protocol.PROTOCOL_VERSION,
                role: runtime.config.role,
                signaling: runtime.signaling.getState(),
                transport: runtime.transport.getState(),
                audit: runtime.audit.entries()
            })
            const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: 'application/json' })
            const href = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = href
            anchor.download = `cattail-p2p-phase2-diagnostics-${Date.now()}.json`
            anchor.click()
            setTimeout(function () { URL.revokeObjectURL(href) }, 1000)
            runtime.notice = 'Sanitized diagnostics export requested.'
            runtime.audit.record('diagnostics-export-requested', { eventCount: runtime.audit.entries().length })
        } catch (error) {
            runtime.notice = `Diagnostics export failed: ${error.message}`
        }
        runtime.refreshPage?.()
    }

    const exported = Object.freeze({ install })
    root.CattailP2PUi = exported
    if (typeof module === 'object' && module.exports) module.exports = exported
})(typeof window !== 'undefined' ? window : globalThis)
