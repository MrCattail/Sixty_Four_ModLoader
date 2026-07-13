(function () {
	const MOD_ID = 'Cattail_TweaksFix_HyperX-12-Channel-Audio'
	const installedKey = '__cattailHyperx12ChannelAudioFixInstalled'
	const appliedKey = '__cattailHyperx12ChannelAudioFixApplied'
	const warningKey = '__cattailHyperx12ChannelAudioFixWarningShown'
	const diagnosticsKey = '__cattailHyperx12ChannelAudioDiagnosticsLogged'
	const pannerBypassInstalledKey = '__cattailHyperx12ChannelAudioPannerBypassInstalled'
	const pannerBypassNativeKey = '__cattailHyperx12ChannelAudioNativeStereoPanner'
	const enableConfigKey = 'enableStereoOutputFix'
	const bypassPannerConfigKey = 'bypassStereoPanner'
	const diagnosticsConfigKey = 'logAudioDiagnostics'

	ModLoader.register({
		id: MOD_ID,
		init(api) {
			api.on('afterVanillaScripts', function () {
				installAudioFix(api)
			})

			api.on('afterGameInit', function (payload, game) {
				ensureStereoOutput(game, api)
			})
		}
	})

	function installAudioFix(api) {
		installStereoPannerBypass(api)
		if (window[installedKey] || typeof Game === 'undefined') return
		window[installedKey] = true

		api.patch(Game.prototype, 'initAudio', function (original) {
			return function (...args) {
				const result = original.apply(this, args)
				ensureStereoOutput(this, api)
				return result
			}
		})
	}

	function ensureStereoOutput(game, api) {
		if (api.config.get(enableConfigKey, true) === false) return false

		const audioContext = game?.actx
		const destination = audioContext?.destination
		if (!destination || destination[appliedKey]) return false

		// NGENUITY's 12-channel virtual endpoint exposes a high channel count to
		// Chromium, while Sixty Four only produces stereo. Keep the final graph
		// stereo so the driver receives the same layout as the working 8-channel mode.
		const before = describeAudioNode(destination)
		const targetChannels = getTargetChannelCount(destination)
		const masterOk = normalizeAudioNode(game?.sfx?.master, 2)
		const destinationOk = normalizeAudioNode(destination, targetChannels)
		destination[appliedKey] = destinationOk || destination.channelCount === targetChannels

		if (api.config.get(diagnosticsConfigKey, true) === true && !destination[diagnosticsKey]) {
			destination[diagnosticsKey] = true
			logAudioDiagnostic('WebAudio destination', {
				context: describeAudioContext(audioContext),
				before,
				after: describeAudioNode(destination),
				master: describeAudioNode(game?.sfx?.master),
				masterOk,
				destinationOk,
				applied: destination[appliedKey],
				userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
				platform: typeof navigator !== 'undefined' ? navigator.platform : '',
				electron: typeof process !== 'undefined' ? process.versions?.electron : ''
			})
		}

		if (!destination[appliedKey] && !destination[warningKey]) {
			destination[warningKey] = true
			logAudioDiagnostic('Could not force WebAudio destination to stereo', {
				context: describeAudioContext(audioContext),
				before,
				after: describeAudioNode(destination)
			}, 'warn')
		}

		return destination[appliedKey]
	}

	function installStereoPannerBypass(api) {
		if (window[pannerBypassInstalledKey] || api.config.get(bypassPannerConfigKey, true) === false) return false
		const AudioContextCtor = window.AudioContext || window.webkitAudioContext
		const prototype = AudioContextCtor?.prototype
		if (!prototype || typeof prototype.createStereoPanner !== 'function') return false
		if (prototype[pannerBypassNativeKey]) return true

		const nativeCreateStereoPanner = prototype.createStereoPanner
		prototype[pannerBypassNativeKey] = nativeCreateStereoPanner
		prototype.createStereoPanner = function () {
			const node = this.createGain()
			node.pan = createBypassPanParam()
			normalizeAudioNode(node, 2)
			return node
		}
		window[pannerBypassInstalledKey] = true
		logAudioDiagnostic('StereoPannerNode bypass enabled', {
			reason: 'Chromium reports live WebAudio nodes but -inf dBFS output on the HyperX 12-channel endpoint',
			effect: 'SFX panning is centered while audio compatibility mode is enabled'
		})
		return true
	}

	function createBypassPanParam() {
		return {
			value: 0,
			setValueAtTime(value) {
				this.value = Number(value) || 0
				return this
			},
			linearRampToValueAtTime(value) {
				this.value = Number(value) || 0
				return this
			},
			exponentialRampToValueAtTime(value) {
				this.value = Number(value) || 0
				return this
			},
			cancelScheduledValues() {
				return this
			}
		}
	}

	function getTargetChannelCount(destination) {
		const max = Number(destination?.maxChannelCount)
		if (Number.isFinite(max) && max > 0) return Math.min(2, max)
		return 2
	}

	function normalizeAudioNode(node, channelCount) {
		if (!node) return false
		let ok = true
		ok = safeSet(node, 'channelCountMode', 'explicit') && ok
		ok = safeSet(node, 'channelInterpretation', 'speakers') && ok
		ok = safeSet(node, 'channelCount', channelCount) && ok
		return ok
	}

	function safeSet(node, key, value) {
		if (!(key in node)) return true
		try {
			node[key] = value
			return node[key] === value
		} catch (error) {
			return false
		}
	}

	function logAudioDiagnostic(label, data, level = 'info') {
		const text = '[HyperX 12-Channel Audio Fix] ' + label + ' ' + safeJson(data)
		const writer = level === 'warn' ? console.warn : console.info
		writer(text)
	}

	function safeJson(data) {
		try {
			return JSON.stringify(data)
		} catch (error) {
			return String(data)
		}
	}

	function describeAudioContext(audioContext) {
		if (!audioContext) return null
		return {
			state: audioContext.state,
			sampleRate: audioContext.sampleRate,
			baseLatency: audioContext.baseLatency,
			outputLatency: audioContext.outputLatency,
			sinkId: audioContext.sinkId
		}
	}
	function describeAudioNode(node) {
		if (!node) return null
		return {
			channelCount: node.channelCount,
			channelCountMode: node.channelCountMode,
			channelInterpretation: node.channelInterpretation,
			maxChannelCount: node.maxChannelCount
		}
	}
})()
