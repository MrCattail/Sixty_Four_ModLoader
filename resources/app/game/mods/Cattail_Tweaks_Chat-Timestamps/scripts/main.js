ModLoader.register({
	id: 'Cattail_Tweaks_Chat-Timestamps',
	init(api) {
		api.on('beforeSaveWrite', function (save, game) {
			if (game?.messenger?.messageTimestamps) save.messengerMessageTimestamps = game.messenger.messageTimestamps
			return save
		})

		api.on('beforeSaveLoad', function (save, game) {
			if (game) game.__chatTimestampMessageTimestamps = save?.messengerMessageTimestamps || []
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
		const pad = n => String(n).padStart(2, '0')
		return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${pad(d.getFullYear() % 100)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	}

	api.patch(Messenger.prototype, 'setState', function (original) {
		return function (fired = [], list = [], shown = 1, timestamps) {
			const existing = this.messageTimestamps?.slice() || []
			original.call(this, fired, list, shown)

			const imported = this.master?.__chatTimestampMessageTimestamps
			const restored = Array.isArray(timestamps) ? timestamps : Array.isArray(imported) ? imported : existing
			this.messageTimestamps = restored.slice()

			const bubbles = this.element.querySelectorAll('.bubblewrap .bubble')
			for (let i = 0; i < this.shownMessages.length; i++) {
				if (!this.messageTimestamps[i]) this.messageTimestamps[i] = this.formatMessageTimestamp()
				ensureTimestampNode(bubbles[i], this.messageTimestamps[i])
			}
		}
	})

	api.patch(Messenger.prototype, 'initChain', function (original) {
		return function (chain = []) {
			const previousLength = this.messageQueue.length
			const timestampsBefore = this.messageTimestamps?.length || 0
			original.call(this, chain)

			this.messageTimestamps = this.messageTimestamps || []
			const originalAlreadyAddedTimestamps = this.messageTimestamps.length > timestampsBefore
			for (let i = previousLength; i < this.messageQueue.length; i++) {
				const queued = this.messageQueue[i]
				if (!queued) continue

				const timestampIndex = timestampsBefore + (i - previousLength)
				const timestamp = originalAlreadyAddedTimestamps ? this.messageTimestamps[timestampIndex] : this.formatMessageTimestamp()
				if (!originalAlreadyAddedTimestamps) this.messageTimestamps.push(timestamp)
				ensureTimestampNode(queued.element?.querySelector('.bubble'), timestamp)
			}
		}
	})
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
