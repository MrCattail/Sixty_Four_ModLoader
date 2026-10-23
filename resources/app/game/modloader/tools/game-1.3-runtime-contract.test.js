'use strict'

async function verifyMainSaveBridge() {
    const sourceRoot = path.resolve(process.argv[3] || path.join(__dirname, '../../../../..'))
    const main = fs.readFileSync(path.join(sourceRoot, 'resources/app/main.js'), 'utf8')
    const bridgeFile = path.join(sourceRoot, 'resources/app/game/modloader/main-process.js')
    const bridge = fs.readFileSync(bridgeFile, 'utf8')
    const checks = []
    const check = (name, value) => { assert.ok(value, name); checks.push(name) }
    const configuration = main.match(/^ModLoaderMainProcess\.configureSaveCloud\(client\.cloud\)$/m)?.[0]
    check('actual main configures the save backend', configuration)
    const beforeStore = main.search(/^ipcMain\.on\(.store.,/m), afterStore = main.search(/^ipcMain\.on\(.updateAccumulatedPlaytime.,/m)
    const beforeLoad = main.search(/^ipcMain\.on\(.getMyStuff.,/m), afterLoad = main.search(/^ipcMain\.on\(.achieve.,/m)
    const beforeRead = main.indexOf('const sleep = ms =>'), afterRead = main.indexOf('function getAccumulatedPlayTime()')
    assert(beforeStore >= 0 && afterStore > beforeStore && beforeRead >= 0 && afterRead > beforeRead)
    const slice = bridge.slice(bridge.indexOf('let tweaksSlotStore = null'), bridge.indexOf('// The optional temporary collector owns all timing'))
    const mod = 'Cattail_TweaksQuality_Tweaks'
    assert.equal(main.split('ModLoaderMainProcess.dispatchSaveStore(e, slots, value =>').length - 1, 2)
    assert(main.includes('ModLoaderMainProcess.readSaveOverlay(client.cloud, JSON.parse(save))'))
    assert(main.includes('savePolicyLayout: slots?.policyLayout,'))
    const backendPath = path.join(sourceRoot, 'resources/app/game/mods', mod, 'scripts/save-policy-core.js')
    if (!fs.existsSync(backendPath)) { console.log('Main save bridge source checks passed; optional Tweaks backend absent (SkipMods), backend behavior not exercised.'); return }
    const backend = require(backendPath)
    const record = n => ({ state: { stuff: [], resources: [n], timestamp: n }, permanents: {}, isProtected: false })
    const manual = { name: 'Synthetic manual', ownerHash: 1, creationTimeStamp: 1, lastModified: 1, stack: [record(1)] }
    function fixture(initial = [manual]) {
        const files = new Map([['charpsMemory', JSON.stringify(initial)]]), writes = [], on = new Map(), handles = new Map(), messages = []
        const cloud = { fileExists: f => files.has(f), readFile: f => { if (!files.has(f)) throw Error('Synthetic missing file'); return files.get(f) }, writeFile(f, data) { writes.push(f); files.set(f, data); return true } }
        const frame = {}, contents = { mainFrame: frame, send: (channel, value) => messages.push({ channel, value }) }
        const win = { webContents: contents, isDestroyed: () => false }
        const event = { sender: contents, senderFrame: frame }
        const context = {
            require: require('module').createRequire(bridgeFile), __dirname: path.dirname(bridgeFile), path,
            win, ipcMain: { on: (name, fn) => on.set(name, fn), handle: (name, fn) => handles.set(name, fn) },
            measureDiagnostic: (_name, run) => run(), runtimeLog() {},
            normalizeEnabledEntries: () => [{ path: mod }], readJsonFile: () => ({ id: mod, entries: ['scripts/auto-save-stutter-fix.js'] }),
            client: { cloud }, STEAMID: 'synthetic-owner', STEAMLANGUAGE: 'english', languages: { english: 0 }, DEBUG: '',
            console: { log() {}, warn() {}, error() {} }, setTimeout: fn => { fn(); return 0 }
        }
        vm.runInNewContext(slice + ';globalThis.api={configureSaveCloud,readSaveOverlay,hasSaveOverlay,dispatchSaveStore,clearTweaksSlotStore};', context)
        context.api.clearSnapshotContext = () => {}
        context.ModLoaderMainProcess = context.api
        const unavailable = handles.get('modloader:tweaks-slot-store')(event, { action: 'begin', protocol: backend.PROTOCOL, gameVersion: '1.3', owner: 'synthetic-owner' })
        assert.equal(unavailable.ok, false, 'unconfigured backend must not begin a session')
        vm.runInNewContext(configuration + '\n' + main.slice(beforeRead, afterRead) + '\n' + main.slice(beforeLoad, afterLoad) + '\n' + main.slice(beforeStore, afterStore), context)
        const begin = () => handles.get('modloader:tweaks-slot-store')(event, { action: 'begin', protocol: backend.PROTOCOL, gameVersion: '1.3', owner: 'synthetic-owner' })
        return { files, writes, on, handles, event, messages, api: context.api, cloud, begin }
    }
    const f = fixture(), baseline = f.files.get('charpsMemory')
    const packet = { protocol: backend.PROTOCOL, action: 'commit', owner: 'synthetic-owner', token: 'not-a-session', revision: 0, changes: {}, records: {} }
    check('protocol before begin cannot fall back to native full write', (await f.handles.get('store')(f.event, packet)).reason === 'resync' && f.writes.length === 0)
    const hello = f.begin()
    check('actual configuration and trusted begin reach existing backend', hello.ok)
    const auto = { ...manual, name: 'Auto', creationTimeStamp: 20, lastModified: 2, stack: [record(2)], tweaksSavePolicy: { id: 'global-auto', role: 'auto', sourceId: 'manual' } }
    const nextPacket = revision => ({ ...packet, token: hello.token, revision, layoutAt: 50, changes: { 20: backend.describe(auto) }, records: { [backend.hash(auto.stack[0])]: auto.stack[0] } })
    const saved = await f.handles.get('store')(f.event, nextPacket(hello.revision))
    check('actual invoke dispatch writes delta and leaves baseline byte-identical', saved.saved && f.files.get('charpsMemory') === baseline && f.writes.includes(backend.INDEX))
    auto.stack[0] = record(3); auto.lastModified = 3
    const sent = f.on.get('store')(f.event, nextPacket(saved.revision))
    check('actual send dispatch updates the same delta path', sent.saved && f.files.get('charpsMemory') === baseline)
    await f.on.get('getMyStuff')(f.event, 'please')
    const reply = f.messages.findLast(m => m.channel === 'hereYouGoSir').value
    check('actual startup reconstructs latest delta and forwards layout separately', reply.slots[20].stack[0].state.resources[0] === 3 && reply.savePolicyLayout.at === 50 && !reply.noSave)
    const before = [...f.files.entries()]
    for (const value of [{ protocol: 'tweaks-save-policy-v3' }, { protocol: 'other-command' }, 'bad', { 0: 'bad' }, { 0: { stack: [] } }, { 0: { stack: [{ state: [], permanents: {} }] } }]) {
        const result = await f.handles.get('store')(f.event, value)
        assert.equal(result.ok, false)
    }
    check('malformed collections and unknown protocols make no cloud changes', JSON.stringify([...f.files.entries()]) === JSON.stringify(before))
    const foreign = await f.handles.get('store')({ sender: {}, senderFrame: {} }, [manual])
    const subframe = await f.handles.get('store')({ sender: f.event.sender, senderFrame: {} }, [manual])
    check('foreign sender and subframe cannot reach native writes', foreign.reason === 'sender' && subframe.reason === 'sender')
    for (const mode of ['send', 'invoke']) {
        const t = fixture(), values = [manual]
        const result = mode === 'send' ? t.on.get('store')(t.event, values) : await t.handles.get('store')(t.event, values)
        check('native full collection stays compatible through ' + mode, result === true && t.files.get('charpsMemory') === JSON.stringify(values))
    }
    const malformed = fixture(packet)
    await malformed.on.get('getMyStuff')(malformed.event, 'please')
    const denied = malformed.messages.findLast(m => m.channel === 'hereYouGoSir').value
    check('actual startup rejects a protocol-overwritten baseline with noSave', denied.noSave && denied.slots === false && malformed.writes.length === 0)
    const missing = fixture()
    missing.files.delete('charpsMemory'); missing.files.set(backend.INDEX, '{}')
    await missing.on.get('getMyStuff')(missing.event, 'please')
    const absent = missing.messages.findLast(m => m.channel === 'hereYouGoSir').value
    check('orphan overlay without its baseline never becomes a fresh world', absent.noSave && absent.slots === false && missing.writes.length === 0)
    check('valid empty collection remains compatible without overlay', fixture([]).api.readSaveOverlay({ fileExists: () => false }, []).length === 0)
    console.log('Main save bridge actual-handler contract passed: ' + checks.length + ' checks.')
}


const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const loader = fs.readFileSync(path.join(__dirname, '../loader.js'), 'utf8')
const knownId = '11111111-1111-4111-8111-111111111111'
function harness() {
    const calls = []
    const transport = { async invoke(channel, payload) {
        calls.push({ channel, payload })
        return { ok: true, value: { token: 'test-context', capabilities: { activeSave: true } } }
    } }
    const node = () => ({ style: {}, children: [], classList: { add() {}, remove() {}, contains() { return false }, toggle() {} }, addEventListener() {}, appendChild(n) { this.children.push(n); return n } })
    const context = {
        window: { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 },
        document: { body: node(), head: node(), createElement: node, getElementById() { return null }, querySelector() { return null }, addEventListener() {} },
        console: { log() {}, warn() {} }, performance: { now() { return 0 } },
        setTimeout, clearTimeout, requestAnimationFrame(fn) { fn() },
        localStorage: { getItem() { throw new Error('1.3 must not read legacy localStorage for snapshot identity') } },
        require(id) {
            if (id === 'crypto') return crypto
            if (id === 'electron') return { ipcRenderer: transport }
            throw new Error('Unexpected module: ' + id)
        }
    }
    const marker = 'window.ModLoader = api'
    assert.equal(loader.split(marker).length, 2)
    vm.runInNewContext(loader.replace(marker, marker + '; window.testInternals = { activateSnapshotContext, verifyPersistedSnapshotIdentity, captureVanillaGameHudState, restoreVanillaGameHudState }'), context)
    const api = context.window.ModLoader
    return { api, internals: context.window.testInternals, calls, transport }
}
function nativeGame(h) {
    let persisted
    return {
        version: '1.3', currentSlotId: 2, preventSaving: false,
        async saveGame() { await Promise.resolve(); persisted = { stack: [{ state: h.api.applySave({ stuff: [] }, this), permanents: { upgrades: 3 } }] } },
        async readFromSlot(id) { assert.equal(id, 2); return persisted }
    }
}
async function run() {
    await verifyMainSaveBridge()
    // Execute the generated native init through the real data/image/language
    // consumers, stopping before DOM/world creation. The image promise is held
    // pending to catch a lost await, early words setup, or repeated preload.
    const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../../scripts/game.js'), 'utf8').replace(/\r\n/g, '\n')
    const init = source.match(/^\tasync init\(preload\)\{\n[\s\S]*?^\t\}/m)?.[0]
    assert.ok(init?.includes('ModLoader?.applyWords'), 'runtime contract requires patched native Game')
    const end = init.indexOf('this.words_en = words.en')
    assert.ok(end > 0)
    for (const languageId of [0, 18, 19, 999]) {
        const events = [], images = { resolved: true }, extraWords = { label: 'modsch' }, english = { label: 'en' }
        let releaseImages, preloadCalls = 0
        const api = {
            async stage(name, game, preload) { events.push(name); return preload },
            applyData(codex) { events.push('data'); codex.preload.push('mod-image'); return codex },
            applyLanguages(languages) { events.push('languages'); return [...languages, 'modsch'] },
            applyWords(words) { events.push('words'); return { ...words, modsch: extraWords } }
        }
        const prefix = init.slice(0, end) + 'this.words_en = words.en\n\t}'
        const nativeInit = vm.runInNewContext('({' + prefix + '}).init', {
            window: { ModLoader: api }, console: { log() {} },
            abstract_getCodex: () => ({ preload: ['native-image'] }), abstract_getWords: () => ({ en: english }),
            OpenSimplex2S: class {}, require() { throw new Error('no real Electron in VM') }
        })
        const game = {
            isMobile: false, preferences: { languageId, zoom: 1 }, languages: ['en', ...Array.from({ length: 18 }, (_, i) => 'native-' + i)],
            saveSlots: { 1: { stack: [{ permanents: {} }] } }, currentSlotId: 1, zoomRange: [0.5, 2],
            async prepareSavedGameData() { events.push('prepare') }, async loadScripts() {}, async loadStyle() {},
            getAbsolutes() { return {} }, initAlfa() { events.push('alfa') },
            preloadImages() { preloadCalls++; assert.ok(this.codex.preload.includes('mod-image')); events.push('preload'); return new Promise(resolve => { releaseImages = () => resolve(images) }) }
        }
        const pending = nativeInit.call(game, {})
        await new Promise(setImmediate)
        assert.equal(preloadCalls, 1)
        assert.equal(game.words, undefined, 'words must wait for native image decoding')
        assert.equal(events.includes('languages'), false, 'split initialization preserves native ordering')
        releaseImages()
        await pending
        assert.equal(game.images, images, 'images is the resolved table, never a Promise')
        assert.equal(game.language, languageId === 19 ? 'modsch' : 'en')
        assert.equal(game.words, languageId === 19 ? extraWords : english)
        assert.equal(game.words_en, english)
        assert.ok(events.indexOf('data') < events.indexOf('preload'))
        assert.ok(events.indexOf('languages') < events.indexOf('words'))
    }
    {
        const h = harness()
        let booted = 0
        h.api.boot = async () => { booted++ }
        await assert.rejects(h.api.stage('beforeGamePrepare', { version: '1.2.1' }, {}), /desktop game 1.3/)
        assert.equal(booted, 0)
        const preload = { slots: {} }
        assert.equal(await h.api.stage('beforeGamePrepare', { version: '1.3' }, preload), preload)
        assert.equal(booted, 1)
    }
    {
        const h = harness(), game = nativeGame(h)
        h.api.applyLoadedSave({ modloader: { saveInstanceId: knownId, customMetadata: { keep: 1 } }, stuff: [] }, game)
        const saved = h.api.applySave({ stuff: [] }, game)
        assert.equal(saved.modloader.customMetadata.keep, 1)
        assert.equal(saved.modloader.saveInstanceId, knownId)
        assert.throws(() => h.api.applySave('encoded legacy save', game), /state object/)
        h.api.forMod('bad-result').on('beforeSaveWrite', () => 'bad')
        assert.throws(() => h.api.applySave({}, game), /preserve the save state object/)
    }
    {
        const h = harness(), game = nativeGame(h)
        let release
        const write = game.saveGame.bind(game)
        game.saveGame = async () => { await new Promise(resolve => { release = resolve }); await write() }
        const activation = h.internals.activateSnapshotContext(game)
        await Promise.resolve()
        assert.equal(h.calls.length, 0, 'IPC activation waits for native async persistence')
        release()
        const capabilities = await activation
        assert.equal(capabilities.activeSave, true)
        assert.equal(h.calls.length, 1)
        assert.equal(h.api.state.snapshotIdentityNeedsPersistence, false)
    }
    for (const failure of ['write', 'readback', 'slot-change', 'preventSaving']) {
        const h = harness(), game = nativeGame(h)
        if (failure === 'write') game.saveGame = async () => { throw new Error('disk rejected') }
        if (failure === 'readback') game.readFromSlot = async () => ({ stack: [{ state: { modloader: { saveInstanceId: knownId } } }] })
        if (failure === 'slot-change') game.saveGame = async () => { game.currentSlotId = 3 }
        if (failure === 'preventSaving') game.preventSaving = true
        assert.equal(await h.internals.activateSnapshotContext(game), null, failure)
        assert.equal(h.calls.length, 0, 'no snapshot activation on ' + failure)
        assert.equal(h.api.state.snapshotContextReady, false)
    }
    {
        const h = harness(), game = nativeGame(h)
        h.api.applyLoadedSave({ modloader: { saveInstanceId: knownId } }, game)
        game.readFromSlot = async () => ({ stack: [{ state: { modloader: { saveInstanceId: knownId } } }] })
        game.saveGame = async () => { throw new Error('existing persisted identity must not force a save') }
        assert.equal((await h.internals.activateSnapshotContext(game)).activeSave, true)
        const hud = h.internals.captureVanillaGameHudState({ store: { vessel: { scrollTop: 37 } }, shop: { vessel: { scrollTop: 9 } } })
        assert.equal(hud.shopScrollTop, 37, 'HUD uses the active Store')
    }
    {
        const h = harness(), game = nativeGame(h), replies = []
        h.transport.invoke = () => new Promise(resolve => replies.push(resolve))
        game.readFromSlot = async () => ({ stack: [{ state: { modloader: { saveInstanceId: h.api.state.snapshotSaveInstanceId } } }] })
        h.api.applyLoadedSave({ modloader: { saveInstanceId: knownId } }, game)
        const previous = h.internals.activateSnapshotContext(game)
        await new Promise(setImmediate)
        h.api.applyLoadedSave({ modloader: { saveInstanceId: '22222222-2222-4222-8222-222222222222' } }, game)
        const current = h.internals.activateSnapshotContext(game)
        await new Promise(setImmediate)
        assert.equal(replies.length, 2)
        replies[1]({ ok: true, value: { token: 'current', capabilities: { activeSave: true } } })
        await current
        replies[0]({ ok: true, value: { token: 'stale', capabilities: { activeSave: false } } })
        assert.equal(await previous, null)
        assert.equal(h.api.state.snapshotContextToken, 'current', 'stale IPC result cannot replace the new save context')
        assert.equal(h.api.state.snapshotCapabilities.activeSave, true)
    }
    {
        const h = harness(), game = nativeGame(h)
        const saved = { stack: [{ state: { modloader: { saveInstanceId: knownId } } }] }
        let release
        h.api.applyLoadedSave(saved.stack[0].state, game)
        game.readFromSlot = () => new Promise(resolve => { release = resolve })
        const previous = h.internals.activateSnapshotContext(game)
        await new Promise(setImmediate)
        h.api.applyLoadedSave(saved.stack[0].state, game)
        game.readFromSlot = async () => saved
        await h.internals.activateSnapshotContext(game)
        release(saved)
        assert.equal(await previous, null)
        assert.equal(h.calls.length, 1, 'obsolete persistence completion cannot dispatch a new activation')
    }
    {
        const h = harness()
        const category = (closed, scrollTop) => {
            const classes = new Set(closed ? ['closed'] : [])
            return { button: { classList: { contains: name => classes.has(name), toggle(name, value) { value ? classes.add(name) : classes.delete(name) } } }, wrap: { scrollTop } }
        }
        const store = { html: { types: { uniques: category(false, 73), production: category(true, 0) } }, isOpen: true, adjustWrap() {} }
        const game = { store }
        const captured = h.internals.captureVanillaGameHudState(game)
        store.html.types = { uniques: category(true, 0), production: category(true, 0) }
        store.isOpen = false
        h.internals.restoreVanillaGameHudState(game, captured)
        assert.equal(store.html.types.uniques.button.classList.contains('closed'), false, 'rebuild preserves the previously open category')
        assert.equal(store.html.types.production.button.classList.contains('closed'), true)
        assert.equal(store.html.types.uniques.wrap.scrollTop, 73, 'rebuild preserves category scroll')
        assert.equal(store.isOpen, true)
    }
    console.log('Game 1.3 runtime contract passed: native awaited startup and language fallback, object saves, metadata, early lifecycle, async persistence, failure and slot guards, Store HUD.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
