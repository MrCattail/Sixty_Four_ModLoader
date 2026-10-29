'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { createService, CHANNEL, clean } = require('../diagnostics/startup-main')
const { createClient, relativeSource, errorPosition } = require('../diagnostics/startup-preload')
const checks = [], output = fs.mkdtempSync(path.join(os.tmpdir(), 'sixtyfour-startup-contract-'))
function clock() {
  let time = 1700000000000, serial = 0
  const tasks = new Map()
  const timers = { setTimeout(fn, ms) { const id = ++serial; tasks.set(id, { fn, ms, due: time + ms }); return id }, clearTimeout(id) { tasks.delete(id) }, setInterval(fn, ms) { const id = ++serial; tasks.set(id, { fn, ms, due: time + ms, repeat: true }); return id }, clearInterval(id) { tasks.delete(id) } }
  return { timers, now: () => time, tasks, advance(ms) { const until = time + ms; for (;;) { const next = [...tasks].filter(([, t]) => t.due <= until).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; time = next[1].due; if (next[1].repeat) next[1].due += next[1].ms; else tasks.delete(next[0]); next[1].fn() } time = until } }
}
function windowFixture() {
  const window = new EventEmitter(), contents = new EventEmitter()
  contents.mainFrame = {}; contents.send = function (...args) { this.sent.push(args) }; contents.sent = []
  contents.capturePage = async () => ({ toPNG: () => Buffer.from('synthetic PNG') })
  window.webContents = contents; window.isDestroyed = () => false
  return window
}
function mainFixture(extra = {}) {
  const c = clock(), ipcMain = new EventEmitter(), app = new EventEmitter(), win = windowFixture()
  const service = createService({ enabled: true, electron: { app, ipcMain }, outputRoot: path.join(output, String(checks.length)), timers: c.timers, now: c.now, ...extra })
  service.attachWindow(win)
  const emit = message => ipcMain.emit(CHANNEL, { sender: win.webContents, senderFrame: win.webContents.mainFrame }, message)
  return { ...c, service, ipcMain, app, win, emit }
}
class Events {
  constructor() { this.listeners = new Map() }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn) }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn) }
  fire(type, detail = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this, ...detail }) }
}
function rendererFixture(extra = {}) {
  const c = clock(), win = new Events(), ipc = new EventEmitter(), sent = []
  ipc.send = (_channel, message) => sent.push(message)
  win.Promise = Promise; win.document = new Events(); win.innerWidth = 1280; win.innerHeight = 720
  win.Image = class Image extends Events { constructor() { super(); this.src = '' } }
  const Module = { _load(request) { return request } }
  const client = createClient({ window: win, ipcRenderer: ipc, Module, timers: c.timers, now: c.now, ...extra })
  return { ...c, win, ipc, Module, client, sent, events: () => sent.filter(x => x.type === 'event').map(x => x.event) }
}
async function test(name, run) { await run(); checks.push(name); console.log('PASS ' + name) }
(async () => {
  await test('off creates no collector, timers or directory', () => {
    const dir = path.join(output, 'off'), c = clock()
    assert.equal(createService({ enabled: false, outputRoot: dir, timers: c.timers }), null)
    assert.equal(fs.existsSync(dir), false); assert.equal(c.tasks.size, 0)
  })
  await test('foreign renderer and subframe cannot write diagnostic events', async () => {
    const f = mainFixture(), before = f.service.state().events
    f.ipcMain.emit(CHANNEL, { sender: {} }, { type: 'event', event: { kind: 'begin', name: 'foreign' } })
    f.ipcMain.emit(CHANNEL, { sender: f.win.webContents, senderFrame: {} }, { type: 'event', event: { kind: 'begin', name: 'subframe' } })
    assert.equal(f.service.state().events, before); await f.service.stop('closed')
  })
  await test('pending callback remains in a usable provisional on-disk summary', async () => {
    const f = mainFixture()
    f.emit({ type: 'event', event: { kind: 'begin', id: '1', name: 'hook:synthetic:afterGameInit', payload: { token: 'PRIVATE' } } })
    f.advance(6000)
    const report = JSON.parse(fs.readFileSync(path.join(f.service.directory, 'summary.json')))
    assert.equal(report.mainTicks, 6); assert.equal(report.pending[0].name, 'hook:synthetic:afterGameInit')
    assert.ok(!fs.readFileSync(path.join(f.service.directory, 'timeline.jsonl'), 'utf8').includes('PRIVATE'))
    await f.service.stop('closed'); assert.equal(f.tasks.size, 0)
  })
  await test('heartbeats distinguish renderer progress from an outstanding asynchronous stage', async () => {
    const f = mainFixture()
    f.emit({ type: 'event', event: { kind: 'begin', id: '2', name: 'stage:pending' } })
    f.emit({ type: 'heartbeat', detail: { raf: 7, completed: 4, failed: 1, token: 'PRIVATE' } }); f.advance(1000)
    assert.equal(f.service.state().heartbeat.completed, 4); assert.equal(f.service.state().rendererHeartbeatAgeMs, 1000)
    f.emit({ type: 'event', event: { kind: 'end', id: '2', outcome: 'error', error: { name: 'TypeError', message: 'PRIVATE' } } })
    assert.equal(f.service.state().lastError.name, 'stage:pending'); assert.equal(f.service.state().pending.length, 0)
    await f.service.stop('closed')
  })
  await test('last completed stage is retained when later frame/sample calls finish', async () => {
    const f = mainFixture()
    for (const [id,name] of [['stage','stage:afterGameInit'],['frame','game:renderloop'],['sample','probe:visible-output-sample']]) {
      f.emit({type:'event',event:{kind:'begin',id,name}})
      f.emit({type:'event',event:{kind:'end',id,outcome:'ok'}})
    }
    assert.equal(f.service.state().lastCompletedStage.name,'stage:afterGameInit')
    assert.equal(f.service.state().lastCompleted.name,'probe:visible-output-sample')
    await f.service.stop('closed')
  })
  await test('native request/response observer delegates receiver and payload unchanged', async () => {
    const f = mainFixture(), payload = { contents: 'PRIVATE' }
    f.ipcMain.emit('getMyStuff', { sender: f.win.webContents }); assert.equal(f.service.state().pending.length, 1)
    f.win.webContents.send('hereYouGoSir', payload)
    assert.equal(f.win.webContents.sent.at(-1)[1], payload); assert.equal(f.service.state().pending.length, 0)
    assert.ok(!fs.readFileSync(path.join(f.service.directory, 'timeline.jsonl'), 'utf8').includes('PRIVATE'))
    await f.service.stop('closed')
  })
  await test('existing preload remains intact; default options are not mutated', async () => {
    const f = mainFixture(), existing = { webPreferences: { preload: 'existing.js', nodeIntegration: true } }
    assert.equal(f.service.prepareWindowOptions(existing), existing)
    const base = { webPreferences: { nodeIntegration: true } }, result = f.service.prepareWindowOptions(base)
    assert.equal(base.webPreferences.preload, undefined); assert.ok(result.webPreferences.preload.endsWith('startup-preload.js'))
    await f.service.stop('closed')
  })
  await test('window recreation rejects the old sender and restores only its owned send wrapper', async () => {
    const f = mainFixture(), old = f.win, next = windowFixture(), originalSend = next.webContents.send
    f.service.attachWindow(next); old.emit('closed')
    assert.equal(f.service.state().status, 'recording')
    f.emit({ type: 'event', event: { kind: 'begin', id: 'old', name: 'old-window' } })
    assert.equal(f.service.state().pending.length, 0)
    await f.service.stop('closed'); assert.equal(next.webContents.send, originalSend); assert.equal(f.ipcMain.listenerCount(CHANNEL), 0)
  })
  await test('event cap stops all observers and keeps JSON output within budget', async () => {
    const f = mainFixture({ limits: { events: 8, jsonBytes: 8192 } })
    for (let i = 0; i < 30; i++) f.emit({ type: 'event', event: { kind: 'mark', name: 'noise-' + i, detail: { name: 'x'.repeat(10000) } } })
    await f.service.stop('closed'); assert.equal(f.service.state().status, 'limit'); assert.equal(f.tasks.size, 0)
    const bytes = fs.readdirSync(f.service.directory).filter(n => n.endsWith('.json') || n.endsWith('.jsonl') || n.endsWith('.txt')).reduce((n, file) => n + fs.statSync(path.join(f.service.directory, file)).size, 0)
    assert.ok(bytes <= 8192)
  })
  await test('never-returning screenshot times out and produces the final summary', async () => {
    const f = mainFixture({ limits: { captureMilliseconds: 10 } })
    f.win.webContents.capturePage = () => new Promise(() => {})
    const stopped = f.service.stop(); f.advance(20); const report = await stopped
    assert.equal(report.screenshot.status, 'timeout'); assert.equal(f.tasks.size, 0)
  })
  await test('screenshot size cap is enforced and deadline stops recording', async () => {
    const f = mainFixture({ limits: { milliseconds: 100, screenshotBytes: 3 } })
    f.advance(100); const report = await f.service.stop()
    assert.equal(report.status, 'time-limit'); assert.equal(report.screenshot.status, 'size-limit')
    assert.equal(fs.existsSync(path.join(f.service.directory, 'window.png')), false)
  })
  await test('output I/O failure cannot escape into native event callbacks', async () => {
    const f = mainFixture()
    const moved = f.service.directory + '-retired'
    assert.ok(path.resolve(moved).startsWith(path.resolve(output) + path.sep))
    fs.renameSync(f.service.directory, moved)
    assert.doesNotThrow(() => f.service.mark('after-output-unavailable'))
    await f.service.stop('closed'); assert.equal(f.service.state().status, 'io-error')
  })
  await test('browser timers retain the Window receiver during early preload', () => {
    const f = rendererFixture(); f.client.stop()
    for (const name of ['setInterval','clearInterval','setTimeout','clearTimeout']) f.win[name] = function (...args) { assert.equal(this, f.win); return f.timers[name](...args) }
    const client = createClient({ window: f.win, ipcRenderer: f.ipc, Module: f.Module, now: f.now })
    f.advance(1000); client.stop(); assert.equal(f.tasks.size, 0)
  })
  await test('sync receiver, arguments, return and thrown object are preserved', () => {
    const f = rendererFixture(), receiver = {}, arg = {}, boom = new TypeError('PRIVATE')
    assert.equal(f.client.observe('call', () => arg), arg)
    assert.throws(() => f.client.observe('throw', () => { throw boom }), error => error === boom)
    const row = f.events().find(e => e.outcome === 'error'); assert.equal(row.error.name, 'TypeError')
    assert.ok(!JSON.stringify(row).includes('PRIVATE')); f.client.stop(); assert.equal(f.tasks.size, 0)
  })
  await test('same Promise is returned; pending and rejected work retain useful spans', async () => {
    const f = rendererFixture(), pending = new Promise(() => {}), boom = new RangeError('PRIVATE'), rejected = Promise.reject(boom)
    assert.equal(f.client.observe('pending', () => pending), pending)
    assert.equal(f.client.observe('reject', () => rejected), rejected)
    await assert.rejects(rejected, error => error === boom); await Promise.resolve()
    assert.ok(f.events().some(e => e.name === 'reject' && e.outcome === 'error'))
    assert.equal(f.events().filter(e => e.name === 'pending').length, 1); f.client.stop()
  })
  await test('instance observer follows late prototype patches without altering source fingerprints', () => {
    const f = rendererFixture(), calls = [], proto = { renderloop(value) { calls.push(['native', this, value]); return value }, renderResources() { return 3 } }, source = Function.prototype.toString.call(proto.renderloop), game = Object.create(proto), arg = {}
    f.client.attachGame(game); const original = proto.renderloop
    proto.renderloop = function (...args) { calls.push(['mod']); return original.apply(this, args) }
    assert.equal(game.renderloop(arg), arg); assert.equal(calls[0][0], 'mod'); assert.equal(calls[1][1], game); assert.equal(calls[1][2], arg)
    assert.equal(Function.prototype.toString.call(original), source)
    f.client.stop(); assert.equal(Object.hasOwn(game, 'renderloop'), false); assert.equal(game.renderloop, proto.renderloop)
  })
  await test('first-frame errors are counted; later instance patches survive cleanup', () => {
    const f = rendererFixture(), boom = new Error('PRIVATE'), proto = { renderloop() { throw boom } }, game = Object.create(proto)
    f.client.attachGame(game); assert.throws(() => game.renderloop(), error => error === boom)
    assert.equal(f.client.status().failed, 1); assert.equal(f.client.status().completed, 0)
    const later = () => 5; game.renderloop = later; f.client.stop(); assert.equal(game.renderloop, later)
  })
  await test('SDK observation preserves module identity/initialize arguments and is removable', () => {
    const f = rendererFixture(), values = [], sdk = { initialize(...args) { values.push([this, ...args]); return 7 } }, original = sdk.initialize
    // Replace the underlying loader before creating this observer, as real require does.
    f.client.stop(); const Module = { _load: () => sdk }, client = createClient({ window: f.win, ipcRenderer: f.ipc, Module, timers: f.timers, now: f.now })
    assert.equal(Module._load('@playsaurus-inc/sdk'), sdk); const input = { token: 'PRIVATE' }
    assert.equal(sdk.initialize(input), 7); assert.equal(values[0][0], sdk); assert.equal(values[0][1], input)
    client.stop(); assert.equal(sdk.initialize, original); assert.ok(!JSON.stringify(f.sent).includes('PRIVATE'))
  })
  await test('pending/failed image records retain source without replacing application handlers', () => {
    const f = rendererFixture(), Original = f.win.Image, image = new f.win.Image()
    image.src = 'file:///synthetic/game/img/missing.png?token=PRIVATE'; assert.equal(f.client.status().pendingImages, 1)
    image.fire('error'); assert.equal(f.client.status().pendingImages, 0)
    const row = f.events().find(e => e.name === 'image-error'); assert.equal(row.detail.source, 'img/missing.png')
    f.client.stop(); assert.notEqual(f.win.Image, Original); assert.ok(!JSON.stringify(f.sent).includes('PRIVATE'))
  })
  await test('image/event bursts stay bounded before main can reply', () => {
    const f = rendererFixture()
    for(let i=0;i<6000;i++){const image=new f.win.Image();image.src='img/synthetic.png';image.fire('load')}
    assert.ok(f.sent.length<=4000); assert.equal(f.client.status().pendingImages,0); f.client.stop(); assert.equal(f.tasks.size,0)
  })
  await test('pixel sampling excludes auxiliary and ancestor-hidden canvases', () => {
    const f = rendererFixture(), style = { display: 'block', visibility: 'visible', opacity: '1', zIndex: '0', transform: 'none' }
    const game = { renderloop() {} }; f.client.attachGame(game); game.renderloop()
    const element = (name, parent = null) => ({ tagName: 'CANVAS', className: name, width: 1000, height: 700, parentElement: parent, style: { ...style }, getBoundingClientRect: () => ({ x: 0, y: 0, width: 1000, height: 700 }) })
    const body = element('body'), main = element('canvas', body), aux = element('', body), hidden = element('canvas', { ...body, style: { ...style, display: 'none' } })
    f.win.getComputedStyle = e => e.style; f.win.document.body = body; f.win.document.querySelectorAll = () => [main, aux, hidden]; f.win.document.querySelector = () => null
    f.win.document.createElement = () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([10, 10, 10, 255]) }) }) })
    f.client.sample(); const layers = f.sent.find(m => m.type === 'snapshot').detail.layers
    assert.equal(layers[0].sample.nonwhite, 1); assert.equal(layers[1].sample, undefined); assert.equal(layers[2].sample, undefined); f.client.stop()
  })
  await test('readback failures are attributed to the probe, not native draw methods', () => {
    const f=rendererFixture(), game={renderloop(){}};f.client.attachGame(game);game.renderloop()
    const canvas={tagName:'CANVAS',className:'canvas',width:100,height:100,getBoundingClientRect:()=>({x:0,y:0,width:100,height:100})}
    f.win.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'})
    f.win.document.querySelectorAll=()=>[canvas];f.win.document.querySelector=()=>null
    f.win.document.createElement=()=>({getContext:()=>({drawImage(){},getImageData(){throw new Error('PRIVATE')}})})
    f.client.sample()
    assert.ok(f.events().some(e=>e.name==='probe:canvas-readback'&&e.outcome==='error'))
    assert.equal(f.client.status().failed,0);f.client.stop()
  })
  await test('message/error sanitization excludes arbitrary payload and first error line', () => {
    assert.deepEqual(clean({ payload: 'PRIVATE', token: 'PRIVATE', name: 'allowed' }), { name: 'allowed' })
    assert.equal(relativeSource('file:///profile/game/mods/a/main.js?token=PRIVATE'), 'mods/a/main.js')
    const error = new Error('PRIVATE'); assert.ok(!JSON.stringify(errorPosition(error)).includes('PRIVATE'))
  })
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks }, null, 2))
  console.log(`Startup probe: ${checks.length} checks passed. Evidence: ${output}`)
})().catch(error => { console.error(error); process.exitCode = 1 })
