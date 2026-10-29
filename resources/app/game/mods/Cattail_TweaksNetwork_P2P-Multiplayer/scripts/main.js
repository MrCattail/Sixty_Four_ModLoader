ModLoader.register({
    id: 'cattail.p2p-multiplayer',
    init(api) {
        const protocol = CattailP2PProtocol
        const safeMode = CattailP2PSafeMode
        const signalingModule = CattailP2PSignaling
        const transportModule = CattailP2PTransport
        const uiModule = CattailP2PUi
        const config = safeMode.readLaunchConfig(
            typeof process !== 'undefined' ? process.argv : [],
            typeof process !== 'undefined' ? process.env : {}
        )
        const audit = safeMode.createAudit(config)
        let ipcRenderer = null
        try {
            ipcRenderer = require('electron').ipcRenderer
        } catch (error) {
            audit.record('electron-ipc-unavailable', { message: error.message })
        }

        const GameClass = typeof Game === 'function' ? Game : null
        const safety = safeMode.install({ config, audit, ipcRenderer, api, GameClass })
        const runtime = {
            api,
            game: null,
            config,
            audit,
            safety,
            signaling: null,
            transport: null,
            page: null,
            joinCode: '',
            busy: '',
            notice: '',
            refreshPage: null
        }

        function loadedModList() {
            const mods = Array.isArray(api.state?.mods) ? api.state.mods : []
            const result = mods.filter(function (mod) { return mod.loaded !== false }).map(function (mod) {
                return { id: mod.id, version: mod.manifest?.version || '' }
            })
            return result.length ? result : [{ id: protocol.MOD_ID, version: protocol.MOD_VERSION }]
        }

        function assertReady() {
            if (!runtime.game?.version) throw new Error('Game is not ready.')
            if (config.desktop13) safety.context.assertReady()
        }

        function getHandshake() {
            assertReady()
            const signalState = runtime.signaling.getState()
            return protocol.buildHandshake({
                role: signalState.role,
                peerId: signalState.peerId,
                roomCode: signalState.roomCode,
                gameVersion: runtime.game.version,
                loaderVersion: api.version || api.state?.version || 'unknown',
                mods: loadedModList()
            })
        }

        runtime.signaling = signalingModule.create({ protocol, config, audit, assertReady, context: safety.context })
        runtime.transport = transportModule.create({ protocol, signaling: runtime.signaling, config, audit, getHandshake, context: safety.context })
        runtime.page = uiModule.install(api, runtime)

        api.on('afterGameInit', function (payload, game) {
            if (config.desktop13) safety.context.markReady(game)
            runtime.game = game
            audit.record('game-ready', { gameVersion: game?.version || 'unknown' })
            runtime.page?.refresh()
        })

        window.addEventListener('beforeunload', function () {
            runtime.transport.close()
            runtime.signaling.close()
            runtime.safety.dispose()
        }, { once: true })

        window.CattailP2PPhase2 = Object.freeze({
            config: Object.freeze({
                localOnly: config.localOnly,
                safeTest: config.safeTest,
                role: config.role,
                sessionId: config.sessionId,
                signalingUrl: config.signalingUrl,
                alphaInviteConfigured: !!config.alphaInviteToken
            }),
            getStatus() {
                return {
                    ready: !!runtime.game?.version && (!config.desktop13 || safety.context.ready),
                    signaling: runtime.signaling.getState(),
                    transport: runtime.transport.getState()
                }
            },
            createRoom() { assertReady(); return runtime.signaling.createRoom() },
            joinRoom(roomCode) { assertReady(); return runtime.signaling.joinRoom(roomCode) },
            runLoopback() { return runtime.transport.runLoopback() },
            sendProbeToAll() { return runtime.transport.sendProbeToAll(4096) },
            getAuditEntries() { return runtime.audit.entries() },
            openPage() {
                assertReady()
                if (runtime.game.splash && !runtime.game.splash.isShown) runtime.game.splash.show()
                return runtime.page.open(runtime.game.splash)
            }
        })
        audit.record('phase2-initialized', {
            modVersion: protocol.MOD_VERSION,
            protocolVersion: protocol.PROTOCOL_VERSION,
            safeTest: config.safeTest,
            role: config.role
        })
    }
})
