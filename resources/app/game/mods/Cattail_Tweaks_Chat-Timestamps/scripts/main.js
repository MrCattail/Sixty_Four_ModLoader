ModLoader.register({
	id: 'Cattail_Tweaks_Chat-Timestamps',
	init(api) {
		api.on('beforeSaveWrite', function (save, game) {
			const compact = compactMessageTimestamps(game?.messenger?.messageTimestamps)
			if (compact) save.messengerMessageTimestamps = compact
			return save
		})

		api.on('beforeSaveLoad', function (save, game) {
			if (game) game.__chatTimestampMessageTimestamps = expandSavedMessageTimestamps(save?.messengerMessageTimestamps)
			return save
		})

		api.on('afterVanillaScripts', function () {
			installMessageTimestampStyles()
			patchMessenger(api)
		})
	}
})

function installMessageTimestampStyles() {
	if (document.getElementById('cattail-chat-timestamps-style')) return

	const style = document.createElement('style')
	style.id = 'cattail-chat-timestamps-style'
	style.textContent = `
		.messenger .bubblewrap .bubble .messageTime {
			margin-top: .45em;
			color: #999;
			opacity: .9;
			font: 400 calc(var(--unit) * .55)/120% 'Montserrat';
		}
		.messenger .bubblewrap.right .bubble .messageTime { text-align: right; }
		.mobile .messenger .bubblewrap .bubble .messageTime {
			margin-top: calc(var(--munit) * .7);
			font: 400 calc(var(--munit) * 1.05)/120% 'Montserrat';
		}
	`
	document.head.append(style)
}

function patchMessenger(api) {
	if (typeof Messenger === 'undefined') return

	Messenger.prototype.formatMessageTimestamp = Messenger.prototype.formatMessageTimestamp || function (d = new Date()) {
		return formatMessageTimestampDate(d)
	}

	api.patch(Messenger.prototype, 'setState', function (original) {
		return function (fired = [], list = [], shown = 1, timestamps) {
			const existing = this.messageTimestamps?.slice() || []
			original.call(this, fired, list, shown)

			const imported = this.master?.__chatTimestampMessageTimestamps
			const restored = timestamps !== undefined ? timestamps : imported !== undefined ? imported : existing
			this.messageTimestamps = expandSavedMessageTimestamps(restored)
			fillMissingMessageTimestamps(this)

			const bubbles = this.element.querySelectorAll('.bubblewrap .bubble')
			for (let i = 0; i < this.shownMessages.length; i++) {
				ensureTimestampNode(bubbles[i], this.messageTimestamps[i])
			}
			refreshTimestampCursor(this)
		}
	})

	api.patch(Messenger.prototype, 'initChain', function (original) {
		return function (chain = []) {
			const previousLength = this.messageQueue.length
			const timestampsBefore = this.messageTimestamps?.length || 0
			original.call(this, chain)

			this.messageTimestamps = this.messageTimestamps || []
			const originalAlreadyAddedTimestamps = this.messageTimestamps.length > timestampsBefore
			const newMessageCount = this.messageQueue.length - previousLength
			const generatedTimestamps = originalAlreadyAddedTimestamps ? [] : buildStaggeredChainTimestamps(this, chain, newMessageCount)
			for (let i = previousLength; i < this.messageQueue.length; i++) {
				const queued = this.messageQueue[i]
				if (!queued) continue

				const localIndex = i - previousLength
				const timestampIndex = timestampsBefore + localIndex
				const timestamp = originalAlreadyAddedTimestamps ? this.messageTimestamps[timestampIndex] : generatedTimestamps[localIndex]
				if (!originalAlreadyAddedTimestamps) this.messageTimestamps.push(timestamp)
				ensureTimestampNode(queued.element?.querySelector('.bubble'), timestamp)
			}
			refreshTimestampCursor(this)
		}
	})
}



function compactMessageTimestamps(timestamps) {
	if (!Array.isArray(timestamps) || !timestamps.length) return null
	const baseTimestamp = timestamps[0]
	const baseDate = parseMessageTimestamp(baseTimestamp)
	if (!baseDate) return timestamps.slice()
	const seconds = []
	for (let i = 0; i < timestamps.length; i++) {
		const date = parseMessageTimestamp(timestamps[i])
		if (!date) return timestamps.slice()
		seconds.push(Math.round((date.getTime() - baseDate.getTime()) / 1000))
	}
	return { v: 1, b: baseTimestamp, s: seconds }
}

function expandSavedMessageTimestamps(saved) {
	if (Array.isArray(saved)) return saved.slice()
	if (!saved || typeof saved !== 'object') return []
	const baseTimestamp = saved.b || saved.base
	const seconds = Array.isArray(saved.s) ? saved.s : Array.isArray(saved.offsets) ? saved.offsets : null
	const baseDate = parseMessageTimestamp(baseTimestamp)
	if (!baseDate || !seconds) return []
	return seconds.map((offset) => {
		const value = Number(offset)
		if (!Number.isFinite(value)) return ''
		return formatMessageTimestampDate(new Date(baseDate.getTime() + Math.round(value) * 1000))
	})
}

function formatMessageTimestampDate(d = new Date()) {
	const pad = n => String(n).padStart(2, '0')
	return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + pad(d.getFullYear() % 100) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

function fillMissingMessageTimestamps(messenger) {
	messenger.messageTimestamps = messenger.messageTimestamps || []
	let cursor = new Date()
	for (let i = 0; i < messenger.shownMessages.length; i++) {
		const existing = parseMessageTimestamp(messenger.messageTimestamps[i])
		if (existing) {
			cursor = existing
			continue
		}
		if (i > 0) cursor = advanceTimestampDate(cursor, messenger, messenger.shownMessages[i])
		messenger.messageTimestamps[i] = messenger.formatMessageTimestamp(cursor)
	}
}

function buildStaggeredChainTimestamps(messenger, chain, count) {
	const out = []
	let cursor = getNextTimestampDate(messenger)
	for (let i = 0; i < count; i++) {
		if (i > 0) cursor = advanceTimestampDate(cursor, messenger, chain[i])
		out.push(messenger.formatMessageTimestamp(cursor))
	}
	if (count > 0) messenger.__chatTimestampCursorDate = advanceTimestampDate(cursor, messenger, chain[count - 1])
	return out
}

function getNextTimestampDate(messenger) {
	const now = new Date()
	const runtime = validDate(messenger.__chatTimestampCursorDate) ? messenger.__chatTimestampCursorDate : null
	const history = getHistoryNextTimestampDate(messenger)
	const time = Math.max(now.getTime(), runtime ? runtime.getTime() : 0, history ? history.getTime() : 0)
	return new Date(time)
}

function refreshTimestampCursor(messenger) {
	const next = getHistoryNextTimestampDate(messenger)
	if (next) messenger.__chatTimestampCursorDate = next
}

function getHistoryNextTimestampDate(messenger) {
	const timestamps = messenger.messageTimestamps || []
	const messages = messenger.shownMessages || []
	const lastIndex = Math.min(timestamps.length, messages.length) - 1
	if (lastIndex < 0) return null
	const lastDate = parseMessageTimestamp(timestamps[lastIndex])
	if (!lastDate) return null
	return advanceTimestampDate(lastDate, messenger, messages[lastIndex])
}

function advanceTimestampDate(date, messenger, messageId) {
	return new Date(date.getTime() + timestampDelaySeconds(messenger, messageId) * 1000)
}

function timestampDelaySeconds(messenger, messageId) {
	const text = plainMessageText(messenger, messageId)
	const length = Array.from(text).length
	const seconds = Math.round(length * .75)
	return Math.max(5, Math.min(60, seconds))
}

function plainMessageText(messenger, messageId) {
	const raw = messenger?.master?.pronounce?.('messages', messageId) || ''
	return String(raw).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseMessageTimestamp(timestamp) {
	if (!timestamp) return null
	const match = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp)
	if (!match) return null
	const year = 2000 + Number(match[3])
	const date = new Date(year, Number(match[1]) - 1, Number(match[2]), Number(match[4]), Number(match[5]), Number(match[6]))
	return validDate(date) ? date : null
}

function validDate(date) {
	return date instanceof Date && !Number.isNaN(date.getTime())
}

function ensureTimestampNode(bubble, timestamp) {
	if (!bubble || !timestamp) return
	let time = bubble.querySelector('.messageTime')
	if (!time) {
		time = document.createElement('div')
		time.classList.add('messageTime')
		bubble.append(time)
	}
	time.textContent = timestamp
}
