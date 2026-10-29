'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const loaderPath = path.resolve(__dirname, '..', 'loader.js')
const readmePath = path.resolve(__dirname, '..', 'README.md')
const source = fs.readFileSync(loaderPath, 'utf8')
const readme = fs.readFileSync(readmePath, 'utf8')

const extractConstFunction = function (name, nextName) {
	const pattern = new RegExp(`\\tconst ${name} = function \\(\\w+(?:, \\w+)*\\) \\{[\\s\\S]*?(?=\\n\\tconst ${nextName} =)`, 'm')
	const match = source.match(pattern)
	assert.ok(match, `${name} source is present`)
	return match[0].trim()
}

const ownerBlock = source.match(/\tlet panelTooltipOwner = null[\s\S]*?(?=\n\tconst getPanelTooltipElement =)/)
assert.ok(ownerBlock, 'shared Tooltip portal has an explicit owner contract')
assert.match(source, /const showPanelTooltip = function \(target, point, owner\)/)
assert.match(source, /claimPanelTooltipOwner\(owner\)/)
assert.match(source, /const hidePanelTooltip = function \(owner\)/)
assert.match(source, /if \(!releasePanelTooltipOwner\(owner\)\) return false/)
assert.match(source, /const deactivate = function \(event\) \{[\s\S]*?getPanelTooltipTarget\(event\.target, root\)[\s\S]*?target !== activeTarget[\s\S]*?pointerActive \|\| focusActive/s)
assert.match(readme, /remains visible[\s\S]*?pointer[\s\S]*?keyboard focus[\s\S]*?actual target exit/i)
assert.match(readme, /shared\s+portal owner[\s\S]*?unrelated root/i)

const result = vm.runInNewContext(`(() => {
	${ownerBlock[0].trim()}
	${extractConstFunction('getPanelTooltipDelayMs', 'panelRow')}
	${extractConstFunction('getPanelTooltipTarget', 'installPanelTooltips')}
	let visibleTarget = null
	let visibleOwner = null
	let now = 0
	let nextTimer = 1
	let nextFrame = 1
	const timers = new Map()
	const frames = new Map()
	const showPanelTooltip = function (target, point, owner) {
		claimPanelTooltipOwner(owner)
		visibleTarget = target
		visibleOwner = owner
	}
	const hidePanelTooltip = function (owner) {
		if (!releasePanelTooltipOwner(owner)) return false
		visibleTarget = null
		visibleOwner = null
		return true
	}
	const setTimeout = function (callback, delay) {
		const id = nextTimer++
		timers.set(id, { at: now + delay, callback })
		return id
	}
	const clearTimeout = function (id) { timers.delete(id) }
	const requestAnimationFrame = function (callback) {
		const id = nextFrame++
		frames.set(id, callback)
		return id
	}
	const cancelAnimationFrame = function (id) { frames.delete(id) }
	const flushFrames = function () {
		const pending = Array.from(frames.values())
		frames.clear()
		for (const callback of pending) callback()
	}
	const advance = function (amount) {
		now += amount
		let progressed = true
		while (progressed) {
			progressed = false
			for (const [id, timer] of Array.from(timers)) {
				if (timer.at > now) continue
				timers.delete(id)
				timer.callback()
				progressed = true
			}
		}
	}
	const windowHandlers = new Map()
	const window = {
		addEventListener(type, handler) {
			if (!windowHandlers.has(type)) windowHandlers.set(type, new Set())
			windowHandlers.get(type).add(handler)
		},
		removeEventListener(type, handler) { windowHandlers.get(type)?.delete(handler) }
	}
	const createTarget = function (name, delayMs) {
		const target = {
			name,
			dataset: { modloaderPanelTooltip: name },
			closest(selector) { return selector === '[data-modloader-panel-tooltip]' ? target : null }
		}
		if (delayMs) target.dataset.modloaderPanelTooltipDelayMs = String(delayMs)
		return target
	}
	const createRoot = function (name, target) {
		const unrelated = { name: name + '-unrelated', closest() { return null } }
		const nodes = new Set([target, unrelated])
		const handlers = new Map()
		return {
			name,
			target,
			unrelated,
			handlers,
			contains(node) { return nodes.has(node) },
			addEventListener(type, handler) { handlers.set(type, handler) },
			removeEventListener(type, handler) { if (handlers.get(type) === handler) handlers.delete(type) }
		}
	}
	const emit = function (root, type, target, properties) {
		root.handlers.get(type)?.(Object.assign({ type, target }, properties || {}))
	}
	${extractConstFunction('installPanelTooltips', 'applyPanelHiddenPosition')}

	const targetA = createTarget('A')
	const targetB = createTarget('B')
	const rootA = createRoot('rootA', targetA)
	const rootB = createRoot('rootB', targetB)
	const cleanupA = installPanelTooltips(rootA)
	const cleanupB = installPanelTooltips(rootB)

	emit(rootA, 'pointerover', targetA, { clientX: 10, clientY: 20 })
	flushFrames()
	assert.equal(visibleTarget, targetA, 'pointer entry displays A')
	emit(rootA, 'pointerout', rootA.unrelated, { relatedTarget: null })
	emit(rootA, 'focusout', rootA.unrelated, { relatedTarget: null })
	assert.equal(visibleTarget, targetA, 'unrelated exit events do not hide A')

	emit(rootB, 'pointerover', targetB, { clientX: 30, clientY: 40 })
	flushFrames()
	assert.equal(visibleTarget, targetB, 'B can claim the shared portal')
	emit(rootA, 'scroll', rootA)
	assert.equal(visibleTarget, targetB, 'non-owner root scroll does not hide B')
	cleanupA()
	assert.equal(visibleTarget, targetB, 'non-owner root cleanup does not hide B')
	emit(rootB, 'scroll', rootB)
	assert.equal(visibleTarget, null, 'owner root scroll hides its Tooltip')
	cleanupB()

	const targetC = createTarget('C')
	const rootC = createRoot('rootC', targetC)
	const cleanupC = installPanelTooltips(rootC)
	emit(rootC, 'pointerover', targetC, { clientX: 50, clientY: 60 })
	flushFrames()
	emit(rootC, 'focusin', targetC)
	flushFrames()
	emit(rootC, 'pointerout', targetC, { relatedTarget: null })
	assert.equal(visibleTarget, targetC, 'focus ownership keeps C visible after pointer exit')
	emit(rootC, 'focusout', targetC, { relatedTarget: null })
	assert.equal(visibleTarget, null, 'C hides after both pointer and focus leave')

	emit(rootC, 'pointerover', targetC, { clientX: 70, clientY: 80 })
	flushFrames()
	emit(rootC, 'pointerout', targetC, { relatedTarget: null })
	assert.equal(visibleTarget, null, 'actual pointer exit hides C')
	cleanupC()

	const delayedTarget = createTarget('delayed', 600)
	const delayedRoot = createRoot('delayedRoot', delayedTarget)
	const cleanupDelayed = installPanelTooltips(delayedRoot)
	emit(delayedRoot, 'pointerover', delayedTarget, { clientX: 90, clientY: 100 })
	advance(599)
	flushFrames()
	assert.equal(visibleTarget, null, 'pointer delay remains in force before 600 ms')
	emit(delayedRoot, 'focusin', delayedTarget)
	flushFrames()
	assert.equal(visibleTarget, delayedTarget, 'keyboard focus bypasses pointer delay')
	emit(delayedRoot, 'pointerout', delayedTarget, { relatedTarget: null })
	assert.equal(visibleTarget, delayedTarget, 'focus keeps delayed Tooltip visible after pointer exit')
	emit(delayedRoot, 'focusout', delayedTarget, { relatedTarget: null })
	assert.equal(visibleTarget, null, 'delayed Tooltip hides after final owner leaves')
	cleanupDelayed()

	return { timers: timers.size, frames: frames.size, visibleOwner }
})()`, { assert })

assert.equal(result.timers, 0)
assert.equal(result.frames, 0)
assert.equal(result.visibleOwner, null)

console.log('Tooltip lifecycle contract passed: persistent pointer/focus ownership, shared portal isolation, delays, and cleanup.')
