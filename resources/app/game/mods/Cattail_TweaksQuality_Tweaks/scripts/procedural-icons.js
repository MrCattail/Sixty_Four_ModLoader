(function () {
	const MOD_ID = 'Cattail_TweaksQuality_Tweaks'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			if (!api?.ui?.icons || typeof api.ui.icons.registerProcedural !== 'function') return
			api.ui.icons.registerProcedural('voidAltarWave', drawVoidAltarWaveIcon)
		}
	})

	function drawVoidAltarWaveIcon(options) {
		const ctx = options?.ctx
		if (!ctx) return
		const width = Math.max(8, Number(options.width) || 36)
		const height = Math.max(8, Number(options.height) || 40)
		const fill = normalizeHexColor(options.fill || options.color) || '#FFFFFF'
		const stroke = normalizeHexColor(options.stroke) || fill
		const background = normalizeHexColor(options.background)
		const time = Number.isFinite(Number(options.time)) ? Number(options.time) : Date.now() / 1000
		const radius = Math.max(1, Math.min(width, height) * 0.31)
		const da = Math.PI * 2 / 72

		if (background) {
			ctx.fillStyle = background
			ctx.beginPath()
			ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.43, 0, Math.PI * 2)
			ctx.fill()
		}

		ctx.save()
		ctx.translate(width / 2, height / 2)
		ctx.fillStyle = fill
		ctx.strokeStyle = stroke
		ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.04)
		ctx.shadowColor = fill
		ctx.shadowBlur = Math.max(0, Math.min(width, height) * 0.08)
		ctx.beginPath()
		ctx.moveTo(radius + radius * Math.sin(time) * 0.04 + radius * Math.sin(time * 1.3) * 0.04 + radius * Math.sin(-time * 1.9) * 0.02, 0)
		for (let a = da; a < Math.PI * 2; a += da) {
			const r = radius + radius * Math.sin(a * 5 + time) * 0.04 + radius * Math.sin(a * 4 + time * 1.3) * 0.04 + radius * Math.sin(a * 7 - time * 1.9) * 0.02
			ctx.lineTo(r * Math.cos(a), r * Math.sin(a))
		}
		ctx.closePath()
		ctx.fill()
		ctx.shadowBlur = 0
		ctx.globalAlpha = 0.75
		ctx.stroke()
		ctx.restore()
	}

	function normalizeHexColor(value) {
		if (value === undefined || value === null) return ''
		const text = String(value).trim()
		const shortMatch = text.match(/^#?([0-9a-f]{3})$/i)
		if (shortMatch) {
			return '#' + shortMatch[1].split('').map(function (part) { return part + part }).join('').toUpperCase()
		}
		const fullMatch = text.match(/^#?([0-9a-f]{6})$/i)
		return fullMatch ? '#' + fullMatch[1].toUpperCase() : ''
	}
})()
