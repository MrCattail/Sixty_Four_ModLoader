'use strict'

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
    console.log('Game 1.3 runtime contract passed: object saves, metadata, early lifecycle, async persistence, failure and slot guards, Store HUD.')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
