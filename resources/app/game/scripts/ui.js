class Achiever {

	constructor(master){

		this.master = master
		this.data = this.master.codex.achievements

		this.element = document.createElement(`div`)
		this.element.classList.add(`glory_vessel`)
		document.body.append(this.element)

		this.setState()

	}

	fireAchievement(id){
		this.fired[id] = true

		const vessel = document.createElement(`div`)
		vessel.classList.add(`glory_item`)
		const image = document.createElement(`div`)
		image.classList.add(`glory_image`)
		const text = document.createElement(`div`)
		text.classList.add(`glory_text`)
		const name = document.createElement(`div`)
		name.classList.add(`glory_name`)
		const description = document.createElement(`div`)
		description.classList.add(`glory_description`)

		image.style.backgroundImage = `url(${this.data[id].src})`
		name.innerHTML = `<nobr>${this.master.pronounce('achievements', id, 'name')}</nobr>`
		description.innerHTML = `${this.master.pronounce('achievements', id, 'description')}`

		vessel.append(image)
		vessel.append(text)
		text.append(name)
		text.append(description)

		this.element.append(vessel)
		setTimeout(_=>{
			this.element.removeChild(vessel)
		},10000)

		this.master.splash.updateGlory()

		//STEAM
		this.master.updateSteamAchievement(this.data[id].steamid, true)

	}

	sneakAchievement(id){
		this.fired[id] = true
		this.master.splash.updateGlory()
	}

	setState(achievedList = new Array(this.data.length).fill(false)){

		this.fired = achievedList
		this.queue = []
		this.element.innerHTML = ``

		for (let i = 0; i < this.data.length; i++){

			if (!this.fired[i]){

				this.queue.push({
					id: i,
					condition: this.data[i].condition
				})

			}

		}

		this.master.splash.updateGlory()

	}

	update(dt){

		for (let i = 0; i < this.queue.length; i++){

			if (this.queue[i].condition(this.master)){

				this.fireAchievement(this.queue[i].id)
				this.queue.splice(i,1)
				i--

			}

		}

	}

}
class Messenger {

	constructor(master){

		this.master = master
		// this.data = this.master.codex.messages
		const post = this.master.completions > 0
		this.events = post ? this.master.codex.messages.postEvents : this.master.codex.messages.events
		this.origins = post ? this.master.codex.messages.postOrigins : this.master.codex.messages.origins

		this.element = document.createElement(`div`)
		this.element.classList.add(`messenger`)
		document.body.append(this.element)

		this.newMarker = null

		if (!this.master.isMobile){
			this.chatIcon = document.createElement(`div`)
			this.chatIcon.classList.add(`chatIcon`)
			document.body.append(this.chatIcon)
			this.chatCounter = document.createElement(`div`)
			this.chatCounter.classList.add(`counter`)
			this.chatIcon.append(this.chatCounter)

			this.chatIcon.onclick = _=>{
				if (this.messagesShown === 1){
					this.hideMessages()
				} else {
					this.showMessages()
				}
			}
		} else {
			this.chatCounter = document.createElement(`div`)
			this.chatCounter.classList.add(`counter`)
			this.master.store.html.chat.append(this.chatCounter) //WIP MOBILE
		}

		this.setState()
		if (this.master.isMobile) this.hideMessages()

	}

	hideMessages(){

		this.messagesShown = 0
		this.element.classList.add(`collapsed`)
		if (this.newMarker) {
			this.newMarker.remove()
			delete this.newMarker
		}
		if (this.master.shop?.mobileChat) { //MOB
			this.master.shop.mobileChat.classList.remove(`pressed`)
		}

	}

	showMessages(){

		this.messagesShown = 1
		this.unreadCounter = 0
		this.chatCounter.style.display = `none`
		this.element.classList.remove(`collapsed`)
		if (this.newMarker) this.newMarker.scrollIntoView({behavior: `smooth`, block: `center`})
		// if (this.master.isMobile) this.element.scroll(0, this.element.scrollHeight)
		if (this.master.shop?.mobileChat) { //MOB
			this.master.shop.mobileChat.classList.add(`pressed`)
		}

	}

	update(dt){

		for (let i = 0; i < this.eventIdQueue.length; i++){

			const e = this.events[this.eventIdQueue[i]]
			if (e.condition(this.master)){

				this.firedEvents[this.eventIdQueue[i]] = true
				this.initChain(e.chain)
				this.eventIdQueue.splice(i,1)
				i--

			}

		}


		const m = this.messageQueue[0]
		if (m){
			m.timer -= dt
			if (m.timer <= 0){

				// console.log(this.element.scrollTop)
				if (!this.newMarker && !this.messagesShown){
					this.newMarker = document.createElement(`div`)
					this.newMarker.classList.add(`newMarker`)
					this.newMarker.innerText = this.master.pronounce(`random`, `existed`)
					this.element.append(this.newMarker)
				}

				this.element.append(m.element)
				setTimeout(_=>{m.element.classList.remove(`unpopped`)}, 10)
				this.messageQueue.shift()
				// this.element.scrollTo({ top: this.element.scrollHeight, behavior: 'smooth' })
				if (!this.messagesShown) {
					this.unreadCounter++
					this.chatCounter.style.display = `flex`
					this.chatCounter.innerHTML = this.unreadCounter
				}

			}
		}

	}

	setState(fired = [], list = [], shown = 1){

		this.shownMessages = list
		this.firedEvents = fired
		this.messageQueue = []
		this.eventIdQueue = []

		this.element.innerHTML = ``

		for (let i = 0; i < this.shownMessages.length; i++){

			if (this.master.isMobile && this.shownMessages[i] === 32) continue //Hardcode for mobile
			// const message = this.data.list[this.shownMessages[i]]
			const wrap = document.createElement(`div`)
			wrap.classList.add(`bubblewrap`, this.origins[this.shownMessages[i]] ? `right` : `left`)
			const bubble = document.createElement(`div`)
			bubble.classList.add(`bubble`)
			// bubble.innerHTML = message.text[this.master.language]
			bubble.innerHTML = this.master.pronounce('messages', this.shownMessages[i])
			wrap.append(bubble)
			this.element.append(wrap)
		}

		for (let i = 0; i < this.events.length; i++){
			this.events[i].fired = this.firedEvents[i] || false
			if (!this.events[i].fired) {
				this.eventIdQueue.push(i)
			}
		}

		setTimeout(_=>{this.element.scrollTo({ top: this.element.scrollHeight, behavior: 'smooth' })}, 100)

		if (shown){
			this.showMessages()
		} else {
			this.hideMessages()
		}

	}

	initChain(chain=[]){

		const mobileExceptions = {
			'32': false,
		}

		for (let i = 0; i < chain.length; i++){

			if (this.master.isMobile && mobileExceptions[chain[i]] !== undefined){
				if (!mobileExceptions[chain[i]]) continue
			}

			// const previous = this.data.list[chain[i-1]] || false
			// const message = this.data.list[chain[i]]
			const messageText = this.master.pronounce('messages', chain[i])
			const previousText = this.master.pronounce('messages', chain[i-1]) || ``

			const wrap = document.createElement(`div`)
			wrap.classList.add(`bubblewrap`, this.origins[chain[i]] ? `right` : `left`, `unpopped`)
			const bubble = document.createElement(`div`)
			bubble.classList.add(`bubble`)
			// bubble.innerHTML = message.text[this.master.language]
			bubble.innerHTML = messageText
			wrap.append(bubble)

			this.shownMessages.push(chain[i])
			this.messageQueue.push({
				// timer: 900 + message.text[this.master.language].length * 50 + (previous ? previous.text[this.master.language].length * 50 : 0),
				timer: 900 + messageText.length * 50 + previousText.length * 50,
				element: wrap,
				id: chain[i]
			})

		}

	}

}

class Splash {
	constructor(master){
		this.master = master

		this.gameIsMute = this.master.isMute
		this.isShown = true

		this.element = document.createElement(`div`)
		this.element.classList.add(`splash`)
		this.items = []

		this.glory = document.createElement(`div`)
		this.glory.classList.add(`achievementSplash`)

		this.warehouse = document.createElement(`div`)
		this.warehouse.classList.add(`warehouseSplash`)

		this.selected = false
		this.selectedId = 0

		if (this.master.isMobile){
			this.initMobile()
		} else {
			this.init()
		}
		
	}

	say(key){
		return this.master.pronounce(`splash`, key)
	}

	fireWarningDisclaimer(){

		const stopit = sessionStorage.getItem(`sf_disclaimerFired`)
		if (stopit) return

		sessionStorage.setItem(`sf_disclaimerFired`, true)

		const veil = document.createElement(`div`)
		veil.classList.add(`veil`)
		this.element.append(veil)

		const text = document.createElement(`div`)
		text.classList.add(`text`)
		text.innerHTML = `${this.master.pronounce('splash', 'flashbang')}<br /><img src="img/disclaimer.png" />`
		veil.append(text)

		const close = document.createElement(`div`)
		close.classList.add(`close`)
		veil.append(close)

		veil.addEventListener(`click`, _=>{
			veil.remove()
		})

	}

	fireNotification(t,el = this.element, up, leftFlag, time = 16000){
		const n = document.createElement(`div`)
		n.classList.add(`splashNotification`)
		if (leftFlag) n.classList.add(`leftFlag`)
		if (up) n.classList.add(`splashNotificationUp`)
		n.innerHTML = t
		el.append(n)
		setTimeout(_=>{n.remove()}, time)
		n.onanimationend = _=>{
			n.remove()
		}

	}

	fireResetNotification(){
		// console.log(this.texts.warning)
		this.pillar.style.background = `none`
		this.element.style.background = `#000`
		this.element.style.transition = `background 1s ease`
		this.headerBox.style.transition = `opacity .2s ease`
		this.sf.style.transition = `opacity .2s ease`

		this.headerBox.style.opacity = 0
		this.sf.style.opacity = 0

		if (!this.tempResetOverlay){
			this.tempResetOverlay = document.createElement(`div`)
			this.tempResetOverlay.classList.add(`resetOverlay`)
			this.tempResetOverlay.innerHTML = `<div>${this.texts.warning}</div>`
			this.element.append(this.tempResetOverlay)
		}
		
	}

	dismissResetNotification(){
		// console.log(this.texts.warning)
		this.element.removeAttribute(`style`)
		this.pillar.removeAttribute(`style`)
		this.headerBox.removeAttribute(`style`)
		this.sf.removeAttribute(`style`)

		this.tempResetOverlay.remove()
		delete this.tempResetOverlay
		// console.log(this.element)
	}

	selectItem(){
		this.selected = true
		this.items[this.selectedId].classList.add(`selected`)
	}
	selectPreviousItem(){
		if (this.items[this.selectedId - 1]){
			this.items[this.selectedId].classList.remove(`selected`)
			this.selectedId--
			this.items[this.selectedId].classList.add(`selected`)
		}
	}
	selectNextItem(){
		if (this.items[this.selectedId + 1]){
			this.items[this.selectedId].classList.remove(`selected`)
			this.selectedId++
			this.items[this.selectedId].classList.add(`selected`)
		}
	}
	deselectItem(){
		this.selected = false
	}

	setPhotofobia(v){

		if (v){
			this.element.classList.add(`photofobia`)
		} else {
			this.element.classList.remove(`photofobia`)
		}

	}

	show(){

		const rx = Math.floor(Math.random() * 4)
		const ry = Math.floor(Math.random() * 2)
		this.sf.style.backgroundPosition = `${100 / 3 * rx}% ${100 * ry}%`;

		this.isShown = true
		this.master.mute(true)
		document.body.appendChild(this.element)
		document.body.appendChild(this.glory)
		document.body.append(this.warehouse)

	}
	close(){
		this.isShown = false
		if (!this.gameIsMute) this.master.mute(false)
		document.body.removeChild(this.element)
		document.body.removeChild(this.glory)
		document.body.removeChild(this.warehouse)
		this.deGloryButton.style.display = `none`
		this.playElement.innerHTML = this.texts.continue
		this.glory.style.left = `100%`
		this.warehouse.style.bottom = `100%`
	}

	updateMute(mute){
		this.gameIsMute = mute
		this.muteElement.innerHTML = this.gameIsMute ? this.texts.soundoff : this.texts.soundon
		if (!this.gameIsMute && !this.master.isMobile) this.muteElement.append(this.soundBar)
		this.master.savePreferences()
		// localStorage.setItem(`abstractv03_mute${this.master.steamId}`, this.gameIsMute)
	}

	initMobile(o){

		if (this.master.isAndroid()) document.body.classList.add(`android`)

		this.texts = this.master.pronounce('splash')

		this.element.innerHTML = ``
		this.glory.innerHTML = ``

		this.pillar = document.createElement(`div`)
		this.pillar.classList.add(`menuPillar`)
		this.element.append(this.pillar)

		this.sf = document.createElement(`div`)
		this.sf.classList.add(`sixtyFour`)
		this.pillar.append(this.sf)

		this.headerBox = document.createElement(`div`)
		this.headerBox.classList.add(`headerBox`)
		this.headerBox.innerHTML = `SIXTY&nbsp;FOUR`//this.texts.sixtyfour
		this.pillar.append(this.headerBox)

		const menu = document.createElement(`div`)
		menu.classList.add(`menu`)
		this.pillar.append(menu)

		this.playElement = document.createElement(`div`)
		this.playElement.classList.add(`menuItem`, `main`)
		// this.playElement.innerHTML = localStorage.getItem(`abstractv03${this.master.steamId}`) ? this.texts.continue : this.texts.start
		this.playElement.innerHTML = this.master.saveSlots[this.master.currentSlotId].stack[0].state ? this.say('continue') : this.say('start')
		menu.append(this.playElement)

		this.muteElement = document.createElement(`div`)
		this.muteElement.classList.add(`menuItem`, `muteButton`)
		this.muteElement.innerHTML = this.gameIsMute ? this.say('soundoff') : this.say('soundon')
		menu.append(this.muteElement)

		const language = document.createElement(`div`)
		language.classList.add(`menuItem`)
		language.innerHTML = this.texts.language
		menu.append(language)

		//Achievements
		this.gloryButton = document.createElement(`div`)
		this.gloryButton.classList.add(`menuItem`)
		this.gloryButton.innerHTML = this.texts.glory
		menu.append(this.gloryButton)

		this.deGloryButton = document.createElement(`div`)
		this.deGloryButton.classList.add(`gloryButton`)
		this.deGloryButton.innerHTML = this.texts.deglory
		this.deGloryButton.style.display = `none`
		this.glory.append(this.deGloryButton)

		this.gloryButton.ontouchstart = _=>{
			this.glory.style.left = 0
			this.deGloryButton.style.display = `block`
		}

		this.deGloryButton.ontouchstart = _=>{
			this.glory.style.left = `100%`
			this.deGloryButton.style.display = `none`
		}

		const reset = document.createElement(`div`)
		// reset.style.position = `relative`
		this.resetProgressbar = document.createElement(`div`)
		this.resetProgressbar.classList.add(`resetProgressbar`)
		const resetText = document.createElement(`div`)
		resetText.style.position = `relative`
		resetText.style.display = `inline-block`
		resetText.innerText = this.texts.reset
		reset.classList.add(`menuItem`)
		reset.append(this.resetProgressbar)
		reset.append(resetText)
		menu.append(reset)

		// const exp = document.createElement(`span`)
		// exp.classList.add(`hoverable`)
		// exp.innerHTML = `[${this.texts.export}]&nbsp;`
		// const imp = document.createElement(`span`)
		// imp.classList.add(`hoverable`)
		// imp.innerHTML = `[${this.texts.import}]`

		const credit = document.createElement(`div`)
		credit.classList.add(`credit`)
		credit.innerHTML = `<span>${this.texts.credit} ${this.master.version}</span> `//this.texts.credit + ` ` + this.master.version
		// credit.append(exp)
		// credit.append(imp)
		this.element.append(credit)

		const publisher = document.createElement(`div`)
		publisher.classList.add(`publisher`)
		this.element.append(publisher)

		const flashlight = document.createElement(`div`)
		flashlight.classList.add(`flashlight`)
		this.element.append(flashlight)

		this.chill = document.createElement(`div`)
		this.chill.classList.add(`chill`)
		this.element.append(this.chill)

		const discord = document.createElement(`div`)
		discord.classList.add(`discord`)
		this.element.append(discord)

		const wiki = document.createElement(`div`)
		wiki.classList.add(`wiki`)
		this.element.append(wiki)

		this.playElement.ontouchstart = _=>{
			if (!this.master.actx && !this.gameIsMute) this.master.initAudio()
			this.close()
		}

		this.muteElement.ontouchstart = _=>{
			this.updateMute(!this.gameIsMute)
		}

		reset.ontouchstart = _=>{
			// this.fireNotification(this.texts.warning, resetText)
			this.fireResetNotification()
			this.resetProgressbar.classList.add(`active`)
			this.resetProgressbar.onanimationend = _=>{
				this.master.preventSaving = true
				this.master.reset()
				// this.master.spaceport.send(`reset`, ``)
				// localStorage.removeItem(`abstractv03${this.master.steamId}`)
				// localStorage.removeItem(`abstractv03_helpIsNeeded${this.master.steamId}`)
				// if (this.master.explainer?.lskey) localStorage.removeItem(this.master.explainer.lskey)

				// setTimeout(_=>{location.reload()},400)
			}
		}
		reset.ontouchend = _=>{
			this.dismissResetNotification()
			this.resetProgressbar.onanimationend = null
			this.resetProgressbar.classList.remove(`active`)
		}
		reset.onmouseout = _=>{
			this.resetProgressbar.onanimationend = null
			this.resetProgressbar.classList.remove(`active`)
		}

		// exp.ontouchstart = _=>{
		// 	this.master.exportSave()
		// 	this.fireNotification(this.master.preventSaving ? this.words.random.toolate : this.master.words.random.paste, exp, true)
		// }
		// imp.ontouchstart = _=>{
		// 	this.master.loadSaveFromClipboard()
		// }

		language.ontouchstart = _=>{
			// this.master.changeLanguage((this.master.languageId + 1) % (this.master.languages.length))

			const vessel = document.createElement(`div`)
			vessel.classList.add(`languageList`)
			vessel.style.pointerEvents = `none`

			const words = abstract_getWords()

			for (let i = 0; i < this.master.languages.length; i++){

				const line = document.createElement(`div`)
				line.classList.add(`languageLine`)
				line.innerText = words[this.master.languages[i]].splash.language 
				vessel.append(line)

				line.onclick = _=>{
					vessel.remove()
					this.master.changeLanguage(i)
				}

			}

			vessel.onanimationend = _=>{vessel.style.pointerEvents = `auto`}

			document.body.append(vessel)

		}

		flashlight.ontouchstart = _=>{
			this.master.togglePhotofobia()
		}

		this.chill.ontouchstart = _=>{
			this.master.toggleChill()
		}

		discord.ontouchstart = _=>{
			if (this.master.isMobile) {
				try{
					Capacitor.Plugins.Browser.open({url: `https://discord.gg/7YXd3tScqS`})
				} catch(e){
					console.log(`Can't open an external link for some reason.`)
				}
			}
			this.master.spaceport?.send(`openDiscord`,``)
		}

		wiki.ontouchstart = _=>{
			if (this.master.isMobile) {
				try{
					Capacitor.Plugins.Browser.open({url: `https://sixtyfour.game-vault.net`})
				} catch(e){
					console.log(`Can't open an external link for some reason.`)
				}

			}

			this.master.spaceport?.send(`openWiki`,``)
		}

		this.achievements = []

		for (let i = 0; i < this.master.codex.achievements.length; i++){

			const cell = document.createElement(`div`)
			cell.classList.add(`ablock`)
			cell.style.opacity = .3
			this.glory.append(cell)

			const img = document.createElement(`div`)
			img.classList.add(`image`)
			img.style.backgroundImage = `url('img/glory/blank.png')`
			cell.append(img)

			const name = document.createElement(`div`)
			name.classList.add(`name`)
			name.innerHTML = ``
			cell.append(name)

			const desc = document.createElement(`div`)
			desc.classList.add(`description`)
			desc.innerHTML = ``
			cell.append(desc)

			this.achievements.push({
				cell: cell,
				img: img,
				name: name,
				desc: desc
			})

		}

		this.updateGlory()

		this.items = [
			this.playElement,
			this.muteElement,
			language,
			reset
		]

	}

	init(o){

		this.texts = this.master.pronounce('splash')

		this.element.innerHTML = ``
		this.glory.innerHTML = ``

		this.headerBox = document.createElement(`div`)
		this.headerBox.classList.add(`headerBox`)
		this.headerBox.innerHTML = `SIXTY&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;FOUR`//this.texts.sixtyfour
		this.element.append(this.headerBox)

		this.sf = document.createElement(`div`)
		this.sf.classList.add(`sixtyFour`)
		this.element.append(this.sf)

		const menu = document.createElement(`div`)
		menu.classList.add(`menu`)
		this.element.append(menu)

		this.playElement = document.createElement(`div`)
		this.playElement.classList.add(`menuItem`, `main`)
		this.playElement.innerHTML = this.master.saveSlots[this.master.currentSlotId].stack[0].state ? this.say('continue') : this.say('start')
		menu.append(this.playElement)

		this.muteElement = document.createElement(`div`)
		this.muteElement.classList.add(`menuItem`, `muteButton`)
		this.muteElement.innerHTML = this.gameIsMute ? this.say('soundoff') : this.say('soundon')
		menu.append(this.muteElement)

		if (!this.master.isMobile){
			this.soundBar = document.createElement(`div`)
			this.soundBar.classList.add(`soundBar`)
			if (!this.gameIsMute) this.muteElement.append(this.soundBar)
			this.soundSlider = document.createElement(`div`)
			this.soundSlider.classList.add(`soundSlider`)
			this.soundBar.append(this.soundSlider)
		}

		const saveload = document.createElement(`div`)
		// saveload.style.position = `relative`
		saveload.classList.add(`menuItem`)//, `nohover`)
		saveload.innerHTML = `${this.say('save')}/${this.say('load')}`
		// const save = document.createElement(`span`)
		// save.classList.add(`subMenuItem`)
		// save.innerHTML = this.texts.save
		// const load = document.createElement(`span`)
		// load.classList.add(`subMenuItem`)
		// load.innerHTML = this.texts.load
		// const slash = document.createElement(`span`)
		// slash.innerHTML = ` / `
		// slash.style.color = `#CCC`
		// saveload.append(save)
		// saveload.append(slash)
		// saveload.append(load)
		menu.append(saveload)

		const language = document.createElement(`div`)
		language.classList.add(`menuItem`)
		language.innerHTML = this.say('language')
		menu.append(language)

		// const reset = document.createElement(`div`)
		// // reset.style.position = `relative`
		// this.resetProgressbar = document.createElement(`div`)
		// this.resetProgressbar.classList.add(`resetProgressbar`)
		// const resetText = document.createElement(`div`)
		// resetText.style.position = `relative`
		// resetText.style.display = `inline-block`
		// resetText.innerText = this.say('reset')
		// reset.classList.add(`menuItem`)
		// reset.append(this.resetProgressbar)
		// reset.append(resetText)
		// menu.append(reset)

		let quit
		if (!this.master.isMobile){
			quit = document.createElement(`div`)
			quit.classList.add(`menuItem`)
			quit.innerHTML = this.say('quit')
			menu.append(quit)
		}

		//EXIMP
		// const exp = document.createElement(`span`)
		// exp.classList.add(`hoverable`)
		// exp.innerHTML = `[${this.texts.export}]&nbsp;`
		// const imp = document.createElement(`span`)
		// imp.classList.add(`hoverable`)
		// imp.innerHTML = `[${this.texts.import}]`

		const credit = document.createElement(`div`)
		credit.classList.add(`credit`)
		credit.innerHTML = `<span>${this.say('credit')} ${this.master.version}</span> `//this.texts.credit + ` ` + this.master.version
		// credit.append(exp)
		// credit.append(imp)
		this.element.append(credit)

		const publisher = document.createElement(`div`)
		publisher.classList.add(`publisher`)
		this.element.append(publisher)

		const flashlight = document.createElement(`div`)
		flashlight.classList.add(`flashlight`)
		this.element.append(flashlight)

		this.chill = document.createElement(`div`)
		this.chill.classList.add(`chill`)
		this.element.append(this.chill)

		const fullscreen = document.createElement(`div`)
		fullscreen.classList.add(`fullscreen`)
		this.element.append(fullscreen)

		const discord = document.createElement(`div`)
		discord.classList.add(`discord`)
		this.element.append(discord)

		// if (!this.master.isMobile){
		// 	this.backupLabels = []
		// 	this.backupElements = []
		// 	const backupVessel = document.createElement(`div`)
		// 	backupVessel.classList.add(`backupVessel`)
		// 	this.element.append(backupVessel)
		// 	for (let i = 0; i < 4; i++){

		// 		const bel = document.createElement(`div`)
		// 		bel.classList.add(`backupElement`)
		// 		this.backupElements.push(bel)
		// 		backupVessel.append(bel)

		// 		const dot = document.createElement(`div`)
		// 		dot.classList.add(`dot`)
		// 		bel.append(dot)

		// 		const blab = document.createElement(`div`)
		// 		blab.classList.add(`backupLabel`)
		// 		this.backupLabels.push(blab)
		// 		bel.append(blab)

		// 	}
		// }

		this.playElement.onclick = _=>{
			if (!this.master.actx && !this.gameIsMute) this.master.initAudio()
			this.close()
		}

		this.muteElement.onclick = _=>{
			this.updateMute(!this.gameIsMute)
		}

		if (!this.master.isMobile){
			this.soundBar.onmousedown = e=>{
				const v = e.offsetX / e.target.offsetWidth
				this.master.updateGlobalVolume(v)
			}
			this.soundBar.onmousemove = e=>{
				if (e.buttons){
					const v = e.offsetX / e.target.offsetWidth
					this.master.updateGlobalVolume(v)
				}
			}
			this.soundBar.onclick = e=>{
				e.stopPropagation()
			}
		}

		// reset.onmousedown = reset.ontouchstart = _=>{
		// 	this.fireNotification(this.texts.warning, resetText)
		// 	this.resetProgressbar.classList.add(`active`)
		// 	this.resetProgressbar.onanimationend = _=>{
		// 		this.master.preventSaving = true
		// 		this.master.reset()
		// 		// this.master.spaceport.send(`reset`, ``)
		// 		// localStorage.removeItem(`abstractv03${this.master.steamId}`)
		// 		// localStorage.removeItem(`abstractv03_helpIsNeeded${this.master.steamId}`)

		// 		// setTimeout(_=>{location.reload()},400)
		// 	}
		// }
		// reset.onmouseup = reset.ontouchend = _=>{
		// 	this.resetProgressbar.onanimationend = null
		// 	this.resetProgressbar.classList.remove(`active`)
		// }
		// reset.onmouseout = _=>{
		// 	this.resetProgressbar.onanimationend = null
		// 	this.resetProgressbar.classList.remove(`active`)
		// }

		saveload.onclick = _=>{
			this.updateWarehouse()
			this.warehouse.style.bottom = 0
		}

		// save.onclick = _=>{
		// 	this.master.exportSave()
		// 	this.fireNotification(this.master.preventSaving ? this.words.random.toolate : this.master.words.random.paste, saveload)
		// }

		// load.onclick = _=>{
		// 	this.master.loadSaveFromClipboard()
		// }

		// exp.onclick = _=>{
		// 	this.master.exportSave()
		// 	this.fireNotification(this.master.preventSaving ? this.master.pronounce('random', 'toolate') : this.master.pronounce('random', 'paste'), exp, true)
		// }
		// imp.onclick = _=>{
		// 	this.master.loadSaveFromClipboard()
		// }

		language.onclick = _=>{
			this.master.changeLanguage((this.master.languageId + 1) % (this.master.languages.length))
		}
		if (!this.master.isMobile){
			quit.onclick = async _=>{
				console.log(`Peace out!`)
				await this.master.saveGame()
				this.master.spaceport.send(`quit`, ``)
			}
		}

		flashlight.onclick = _=>{
			this.master.togglePhotofobia()
		}

		this.chill.onclick = _=>{
			this.master.toggleChill()
		}

		fullscreen.onclick = _=>{
			this.master.spaceport?.send(`toggleFullscreen`,``)
		}

		discord.onclick = _=>{
			this.master.spaceport?.send(`openDiscord`,``)
		}

		//Achievements
		this.gloryButton = document.createElement(`div`)
		this.gloryButton.classList.add(`gloryButton`)
		this.gloryButton.innerHTML = this.texts.glory
		this.element.append(this.gloryButton)

		this.deGloryButton = document.createElement(`div`)
		this.deGloryButton.classList.add(`gloryButton`)
		this.deGloryButton.innerHTML = this.texts.deglory
		this.deGloryButton.style.display = `none`
		this.glory.append(this.deGloryButton)

		this.gloryButton.onclick = _=>{
			this.glory.style.left = 0
			this.deGloryButton.style.display = `block`
		}

		this.deGloryButton.onclick = _=>{
			this.glory.style.left = `100%`
			this.deGloryButton.style.display = `none`
		}

		this.achievements = []

		for (let i = 0; i < this.master.codex.achievements.length; i++){

			const cell = document.createElement(`div`)
			cell.classList.add(`ablock`, `unfired`)
			// cell.style.opacity = .3
			this.glory.append(cell)

			const img = document.createElement(`div`)
			img.classList.add(`image`)
			img.style.backgroundImage = `url('img/glory/blank.png')`
			cell.append(img)

			const name = document.createElement(`div`)
			name.classList.add(`name`)
			name.innerHTML = ``
			cell.append(name)

			const desc = document.createElement(`div`)
			desc.classList.add(`description`)
			desc.innerHTML = this.master.pronounce('achievements', i, 'description')//``
			if (this.master.codex.achievements[i].noorbs) desc.innerHTML += ` (${this.master.pronounce('random', 'noorbs')})`
			cell.append(desc)

			this.achievements.push({
				cell: cell,
				img: img,
				name: name,
				desc: desc
			})

		}

		this.updateGlory()

		this.items = [
			this.playElement,
			this.muteElement,
			// save,
			// load,
			language,
			// reset
		]
		if (!this.master.isMobile) this.items.push(quit)

		if (o?.selectedId) this.selectedId = o.selectedId
		if (o?.selected) this.selectItem()

	}

	updateWarehouse(){

		this.warehouse.innerHTML = ``

		const m = this.master
		const sts = m.saveSlots

		const internals = document.createElement(`div`)
		internals.classList.add(`internals`)
		this.warehouse.append(internals)

		const column = document.createElement(`div`)
		column.classList.add(`slotColumn`)
		internals.append(column)

		const slotStuff = document.createElement(`div`)
		slotStuff.classList.add(`slotStuff`)
		internals.append(slotStuff)

		for (let i = 0; i < sts.length; i++){

			const s = document.createElement(`div`)
			s.classList.add(`saveSlot`)
			if (i === m.currentSlotId) s.classList.add(`active`, `current`)
			s.innerHTML = sts[i]?.name ? sts[i].name : `${this.say('slot')} ${i+1}`
			column.append(s)

			const showInternals = _=>{
				slotStuff.innerHTML = ``

				for (let i = 0; i < column.children.length; i++){
					column.children[i].classList.remove(`active`)
				}
				s.classList.add(`active`)

				//Header
				const header = document.createElement(`div`)
				header.classList.add(`saveHeader`)

				const title = document.createElement(`h1`)
				title.innerText = sts[i].name && sts[i].name.length ? sts[i].name : `${this.say('slot')} ${i+1}`
				header.append(title)
				header.append(document.createElement(`br`))

				title.addEventListener(`click`, _=>{
					title.contentEditable = true
					title.focus()
					
				})
				title.addEventListener(`focus`, _=>{
					const range = document.createRange()
					range.selectNodeContents(title)
					const selection = window.getSelection()
					selection.removeAllRanges()
					selection.addRange(range)
				})
				title.addEventListener(`keydown`, e=>{
					if (e.key === `Enter`){
						e.preventDefault()
						title.blur()
					}
				})
				title.addEventListener(`blur`, _=>{
					title.contentEditable = false
					sts[i].name = title.textContent
					s.innerHTML = sts[i].name
					// this.master.saveGame()
					if (!this.master.preventSaving) this.master.writeToSlot(sts[i], i)
				})
				title.addEventListener(`input`, _=>{
					if (title.textContent.length > 63){

						title.textContent = title.textContent.slice(0, 63)

						const range = document.createRange()
						range.selectNodeContents(title)
						range.collapse(false)

						const selection = window.getSelection()
						selection.removeAllRanges()
						selection.addRange(range)
					}
				})

				//Load latest
				if (this.master.currentSlotId !== i){
					const llatest = document.createElement(`div`)
					llatest.classList.add(`warehouseButton`)
					llatest.innerHTML = this.say('switchslot')
					header.append(llatest)
					llatest.addEventListener(`click`,_=>{
						this.master.loadSaveFromSlotStack(i, 0)
						// this.master.exportSave()//WIP make notification
						// this.fireNotification(this.master.preventSaving ? this.master.pronounce('random', 'toolate') : this.master.pronounce('random', 'paste'), exportButton, true)
					})
				}


				//Export
				const exportButton = document.createElement(`div`)
				exportButton.classList.add(`warehouseButton`)
				exportButton.innerHTML = this.say('export')
				header.append(exportButton)
				exportButton.addEventListener(`click`,_=>{
					this.master.exportSave()//WIP make notification
					// this.fireNotification(this.master.preventSaving ? this.master.pronounce('random', 'toolate') : this.master.pronounce('random', 'paste'), exportButton, true)
				})

				//Reset
				if (this.master.currentSlotId === i){
					let resetWord = this.say('reset')
					resetWord = resetWord.charAt(0).toUpperCase() + resetWord.slice(1).toLowerCase()
					const resetButton = document.createElement(`div`)
					resetButton.classList.add(`warehouseButton`)
					resetButton.innerHTML = `${resetWord} [8]`
					header.append(resetButton)

					{
						let ctd = 8
						let interId
						let resetting = false

						resetButton.addEventListener(`click`, async _=>{
							if (resetting) return
							console.log(i)
							ctd--
							resetButton.innerText = `${resetWord} [${ctd}]`
							clearTimeout(interId)
							interId = setTimeout(_=>{
								ctd = 8
								resetButton.innerText = `${resetWord} [${ctd}]`
							},1000)
							if (ctd <= 0){
								resetButton.classList.add(`disabled`)
								resetting = true
								clearTimeout(interId)

								await this.master.saveGame()
								await this.master.reset()
								resetting = false
								this.updateWarehouse()
								return
							}
						})
					}
				}
				
				if (this.master.currentSlotId !== i){
					const deleteButton = document.createElement(`div`)
					deleteButton.classList.add(`warehouseButton`)
					deleteButton.innerText = `${this.say('wipe')} [64]`
					header.append(deleteButton)
					
					if (this.master.currentSlotId !== i){
						let ctd = 64
						let interId
						deleteButton.addEventListener(`click`, async _=>{
							ctd--
							deleteButton.innerText = `${this.say('wipe')} [${ctd}]`
							clearTimeout(interId)
							interId = setTimeout(_=>{
								ctd = 64
								deleteButton.innerText = `${this.say('wipe')} [${ctd}]`
							},1000)
							if (ctd <= 0){
								deleteButton.classList.add(`disabled`)
								clearTimeout(interId)
								const success = await this.master.wipeSlot(i)
								if (success) {
									this.updateWarehouse()
									return
								}
							}
						})
					}
				}

				slotStuff.append(header)

				//Rows of saves
				for (let j = 0; j < sts[i].stack.length; j++){

					const nobr = document.createElement(`nobr`)
					const string = document.createElement(`div`)
					string.classList.add(`status`)
					nobr.append(string)

					let htmlstring = ``

					if (!sts[i].stack[j].state){
						htmlstring += this.master.pronounce(`random`, `existed`)
					} else {

						htmlstring += `<span class="column1">${this.formatSaveTimestamp(sts[i].stack[j].state?.timestamp)} </span>`

						const resources = sts[i].stack[j].state?.resources
						
						for (let r = 0; r < resources.length; r++){
							if (resources[r] <= 0) continue
							htmlstring += `<div class="rico r${r}"></div>`
						}
						
					}

					string.innerHTML = htmlstring
					slotStuff.append(nobr)

					string.addEventListener(`click`, _=>{
						this.master.loadSaveFromSlotStack(i, j)
					})

				}

				// slotStuff.innerHTML = htmlstring
			}

			s.addEventListener(`click`, showInternals)
			if (i===m.currentSlotId) showInternals()

		}

		//New slot
		const extra = document.createElement(`div`)
		extra.classList.add(`saveSlot`, `extra`)
		extra.innerHTML = this.say('newslot')
		column.append(extra)
		extra.addEventListener(`click`, _=>{
			this.master.addNewSlot()
		})

		//Import
		const imp = document.createElement(`div`)
		imp.classList.add(`saveSlot`, `extra`)
		imp.innerHTML = this.say('importClipboard')
		column.append(imp)
		imp.addEventListener(`click`, _=>{
			// this.master.addNewSlot()
			this.master.loadSaveFromClipboard()

		})

		const newGame = document.createElement(`div`)
		newGame.classList.add(`saveSlot`, `empty`)

		const desaveload = document.createElement(`div`)
		desaveload.classList.add(`desaveload`)
		desaveload.innerHTML = this.say('deglory')
		this.warehouse.append(desaveload)

		desaveload.onclick = _=>{
			this.warehouse.style.bottom = `100%`
		}

	}

	formatSaveTimestamp(timestamp){

		const date = new Date(timestamp)
		const now = new Date()

		const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()

		const isThisYear = date.getFullYear() === now.getFullYear()

		let options

		if (isToday) {
			options = {
				hour: '2-digit',
				minute: '2-digit'
			}
		} else if (isThisYear) {
			options = {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			}
		} else {
			options = {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			}
		}

		return new Intl.DateTimeFormat(undefined, options).format(date)
	}

	// updateBackups(){

	// 	if (this.master.isMobile) return

	// 	for (let i = 0; i < 4; i++){

			
	// 		if (this.master.backups[i]){

	// 			this.backupElements[i].classList.remove(`disabled`)
	// 			this.backupElements[i].onclick = _=>{
	// 				this.master.restoreBackup(i)
	// 			}

	// 			const date = new Date(this.master.backups[i].timestamp)
	// 			const dd = date.getDate()
	// 			let mm = date.getMonth() + 1 + ``
	// 			if (mm.length === 1) mm = `0` + mm
  	// 			const hh = date.getHours()
  	// 			let min = date.getMinutes() + ``
  	// 			if (min.length === 1) min = `0` + min

	// 			this.backupLabels[i].innerHTML = `<nobr>${this.texts.load.slice(0,1)+this.texts.load.slice(1).toLowerCase()} ${dd}.${mm}, ${hh}:${min}</nobr>`
	// 		} else {

	// 			this.backupElements[i].classList.add(`disabled`)
	// 			this.backupElements[i].onclick = null

	// 		}

	// 	}

	// }

	updateGlory(){

		for (let i = 0; i < this.achievements.length; i++){

			const a = this.achievements[i]
			if (this.master.achiever?.fired[i]){

				a.cell.classList.remove(`unfired`)
				// a.cell.style.opacity = 1
				a.img.style.backgroundImage = `url('${this.master.codex.achievements[i].src}')`
				a.name.innerHTML = this.master.pronounce('achievements', i, 'name')
				a.desc.innerHTML = this.master.pronounce('achievements', i, 'description')

			}

		}

	}
}

class Cloud {

	constructor(entity){
		this.entity = entity
		this.master = entity.master
		this.updatables = []
		this.element = document.createElement(`div`)
		this.element.classList.add(`hintBubble`)
		this.checks = []
	}

	setDarkMode(){
		this.element.classList.add(`dark`)
	}

	addName(name){
		const el = document.createElement(`div`)
		el.classList.add(`entityName`)
		el.innerHTML = name
		this.element.append(el)
	}

	addDynamicText(check = (_=>0)){
		const el = document.createElement(`div`)
		el.classList.add(`hintDepth`)
		this.element.append(el)

		if (check){
			this.checks.push({
				element: el,
				f: check,
				effect: `text`
			})
		}
	}

	addDescription(d){
		const el = document.createElement(`div`)
		el.classList.add(`hintDescription`)
		el.innerHTML = d
		this.element.append(el)
	}

	addQEString(q,e,entity){

		if (this.master.isMobile){

			const el = document.createElement(`div`)
			el.classList.add(`hintQE`)
			// let elq, ele
			this.qElement = null
			this.eElement = null

			if (q){
				this.qElement = document.createElement(`div`)
				this.qElement.classList.add(`q_mobile`)
				el.append(this.qElement)

				this.qElement.addEventListener(`touchstart`, _=>{
					if (this.master.canAfford(entity.name) && !this.master.onlyones[entity.name] && this.master.codex.entities[entity.name].canPurchase){
						this.master.pickupItem(entity.name)
						this.master.pressedQOnMachine = true
						this.master.store.html.store.classList.add(`active`)
						this.master.interactionMode = `build`
					}
				})
			}

			if (e){
				this.eElement = document.createElement(`div`)
				this.eElement.classList.add(`e_mobile`)
				el.append(this.eElement)

				this.eElement.addEventListener(`touchstart`, _=>{
					// if (this.master.entitiesInGame.mega3 > 0 && this.master.resources[4] >= 1 && this.master.canRelocate(entity) && !this.master.plane && !this.master.entitiesInGame.pinhole){
					if (this.master.entitiesInGame.mega3 > 0 && this.master.canRelocate(entity) && !this.master.plane && !this.master.entitiesInGame.pinhole){
						

						this.master.processE()

						// WIP FAST RELOCATION
						// this.master.transportedEntity = entity
						// this.master.itemInHand = new this.master.codex.entities[entity.name].class(this.master)
						// this.touchMode = 2



						// delete this.master.itemInHand
						// delete this.master.itemInHandPriceTag
						// delete this.master.itemInHandPriceAndRefundTag




						// this.master.interactionMode = `relocate`
						// this.master.relocationOrigin = [...entity.position]
						// this.master.relocationTarget = [...entity.position]
						// this.master.updateRelocationArea()

						// this.master.relocationCandidatesList = [entity]
						// this.master.pickupEntitiesForRelocation()
						// console.log(this.master.relocationList)

					}
				})
			}

			this.element.append(el)
			return [this.qElement, this.eElement]

		} else {

			const el = document.createElement(`div`)
			el.classList.add(`hintQE`)

			if (q){
				const elq = document.createElement(`div`)
				elq.classList.add(`q`)
				el.append(elq)
			}

			if (e){
				const ele = document.createElement(`div`)
				ele.classList.add(`e`)
				el.append(ele)
			}

			this.element.append(el)

		}

	}

	addInfo(url){

		if (!this.master.isMobile) return
		

		const el = document.createElement(`div`)
		el.classList.add(`hintInfo`)
		this.element.append(el)
		let closed = true

		let info, video

		el.onclick = _=>{

			if (closed){
				closed = false
				info = document.createElement(`div`)
				info.classList.add(`hint_info_vessel`, `appear`)
				info.onanimationend = _=>{info.classList.remove(`appear`)}

				video = document.createElement(`video`)
				video.setAttribute(`muted`, ``)
				video.setAttribute(`autoplay`, ``)
				video.setAttribute(`loop`, ``)
				video.setAttribute(`playsinline`, ``)

				video.innerHTML = `<source src="img/how/${url}" type="video/mp4">`

				this.element.append(info)

				video.addEventListener('canplay', _=>{
			        video.play()
			        info.append(video)
			    })

				this.master.canvas.style.filter = `brightness(0.7)`
				this.master.canvas.style.transition = `filter .2s`
			} else {
				info.classList.add(`disappear`)
				this.master.canvas.style.filter = `brightness(1)`
				info.onanimationend = _=>{
					closed = true
					info.remove()
					video.remove()
					this.master.canvas.style.removeProperty('filter')
					this.master.canvas.style.removeProperty('transition')
				}
			}

		}

		this.element.onremove = _=>{
			closed = true
			if (info) info.remove()
			if (video) video.remove()
			this.master.canvas.style.removeProperty('filter')
			this.master.canvas.style.removeProperty('transition')
		}

		// el.onvisibilitychange = _=>{console.log(`pup`)}


	}

	addLine(d){
		const el = document.createElement(`div`)
		el.classList.add(`hintLine`)
		this.element.append(el)
	}

	addProgress(check){
		const back = document.createElement(`div`)
		back.classList.add(`hintProgressBarBack`)
		const bar = document.createElement(`div`)
		bar.classList.add(`hintProgressBar`)
		back.append(bar)
		this.element.append(back)

		if (check){
			this.checks.push({
				element: bar,
				f: check,
				effect: `width`
			})
		}
	}
	addGradeAndProgress(grade, type, check){

		const wrap = document.createElement(`div`)
		wrap.classList.add(`gradeWrap`)
		this.element.append(wrap)

		const gradeHint = document.createElement(`div`)
		gradeHint.classList.add(`gradeHint`)
		// gradeHint.innerHTML = grade === 2 ? `<span><span style="transform:scale(1,.5)">▎</span><span style="transform:scale(1,.75)">▎</span><span style="transform:scale(1,1)">▎</span></span>` : grade === 1 ? `<span><span style="transform:scale(1,.5)">▎</span><span style="transform:scale(1,.75)">▎</span></span><span style="opacity:.2"><span style="transform:scale(1,1)">▎</span></span>` : `<span><span style="transform:scale(1,.5)">▎</span></span><span style="opacity:.2"><span style="transform:scale(1,.75)">▎</span><span style="transform:scale(1,1)">▎</span></span>`
		gradeHint.innerHTML = grade === 2 ? `<span>★★★</span>` : grade === 1 ? `<span>★★<span style="opacity:.2">★</span></span>` : `<span>★<span style="opacity:.2">★★</span></span>`
		const color = this.master.codex.resources[type].triplet[2]
		gradeHint.style.color = color
		wrap.append(gradeHint)

		const back = document.createElement(`div`)
		back.classList.add(`hintProgressBarBack`)
		const bar = document.createElement(`div`)
		bar.classList.add(`hintProgressBar`)
		back.append(bar)
		wrap.append(back)

		if (check){
			this.checks.push({
				element: bar,
				f: check,
				effect: `width`
			})
		}
	}

	addResourceContent(e,rmap = [1,1,1,1,1,1,1,1,1,1]){

		if (!e.resources) return null

		const wrap = document.createElement(`div`)

		for (let i = 0; i < rmap.length; i++){

			if (!rmap[i]) continue

			const chunk = document.createElement(`div`)
			chunk.classList.add(`hintResourceChunk`)
			wrap.append(chunk)

			const resourceIcon = document.createElement(`div`)
			resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
			chunk.append(resourceIcon)

			const resourceString = document.createElement(`div`)
			resourceString.classList.add(`hintResourceString`)
			chunk.append(resourceString)
			resourceString.innerHTML = this.master.makeReadable(e.resources[i])//Math.ceil(r[i])

			this.checks.push({
				element: resourceString,
				f: _=>this.master.makeReadable(e.resources[i]),
				effect: `text`
			})

		}

		this.element.append(wrap)

	}

	addResourceList(r){

		const wrap = document.createElement(`div`)
		let empty = true

		for (let i = 0; i < r.length; i++){

			if (r[i]){
				empty = false
				const chunk = document.createElement(`div`)
				chunk.classList.add(`hintResourceChunk`)
				wrap.append(chunk)

				this.checks.push({
					element: chunk,
					f: _=>this.master.resources[i]>=r[i],
					effect: `opacity`
				})

				const resourceIcon = document.createElement(`div`)
				resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
				chunk.append(resourceIcon)

				const resourceString = document.createElement(`div`)
				resourceString.classList.add(`hintResourceString`)
				chunk.append(resourceString)
				resourceString.innerHTML = this.master.makeReadable(Math.ceil(r[i]))//Math.ceil(r[i])

			}

		}

		if (!empty) this.element.append(wrap)

	}

	addResourcePercentageList(r){

		const wrap = document.createElement(`div`)
		let empty = true

		for (let i = 0; i < r.length; i++){

			if (r[i]){
				empty = false
				const chunk = document.createElement(`div`)
				chunk.classList.add(`hintResourceChunk`)
				wrap.append(chunk)

				this.checks.push({
					element: chunk,
					f: _=>this.master.resources[i]>=r[i],
					effect: `opacity`
				})

				const resourceIcon = document.createElement(`div`)
				resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
				chunk.append(resourceIcon)

				const resourceString = document.createElement(`div`)
				resourceString.classList.add(`hintResourceString`)
				chunk.append(resourceString)
				resourceString.innerHTML = this.master.makeReadable(Math.round(r[i] * 100)) + ` %`

			}

		}

		if (!empty) this.element.append(wrap)

	}

	addConvertersOutput(r,f = _=>false){

		const vessel = document.createElement(`div`)
		vessel.classList.add(`converterOutputVessel`)
		const wrap = document.createElement(`div`)
		wrap.classList.add(`converterInput`)
		const wrap2 = document.createElement(`div`)
		wrap2.classList.add(`converterOutput`)

		let empty = true

		for (let i = 0; i < r.length; i++){

			if (r[i]){
				empty = false
				const chunk = document.createElement(`div`)
				chunk.classList.add(`hintResourceChunk`)
				wrap.append(chunk)

				this.checks.push({
					element: chunk,
					f: _=>this.master.resources[i]>=r[i],
					effect: `opacity`
				})

				const resourceIcon = document.createElement(`div`)
				resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
				chunk.append(resourceIcon)

				const resourceString = document.createElement(`div`)
				resourceString.classList.add(`hintResourceString`)
				chunk.append(resourceString)
				resourceString.innerHTML = this.master.makeReadable(Math.ceil(r[i]))//Math.ceil(r[i])

			}

		}

		const o = f()
		if (o){
			for (let i = 0; i < o.length; i++){

				if (o[i]){
					const chunk = document.createElement(`div`)
					chunk.classList.add(`hintResourceChunk`)
					wrap2.append(chunk)

					const resourceIcon = document.createElement(`div`)
					resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
					chunk.append(resourceIcon)

					const resourceString = document.createElement(`div`)
					resourceString.classList.add(`hintResourceString`)
					chunk.append(resourceString)
					resourceString.innerHTML = this.master.makeReadable(Math.ceil(r[i]))//Math.ceil(r[i])

					this.checks.push({
						element: resourceString,
						f: _=> this.master.makeReadable(f()[i]),
						effect: `text`
					})

				}

			}
		}

		vessel.append(wrap, wrap2)
		if (!empty) this.element.append(vessel)

	}

	addSellIcon(){

		const wrap = document.createElement(`div`)

		const chunk1 = document.createElement(`div`)
		chunk1.classList.add(`hintResourceChunk`, `ref1`)
		wrap.append(chunk1)

		const chunk2 = document.createElement(`div`)
		chunk2.classList.add(`hintResourceChunk`, `ref2`)
		wrap.append(chunk2)

		const chunk3 = document.createElement(`div`)
		chunk3.classList.add(`hintResourceChunk`, `ref3`)
		wrap.append(chunk3)

		this.checks.push({
			element: wrap,
			f: _=> this.master.eraserType === 2 ? `ref_hell` : this.master.eraserType === 1 ? `ref_beta` : `ref_qanetite`,
			effect: `class`
		})

		const resourceIcon1 = document.createElement(`div`)
		resourceIcon1.classList.add(`hintResourceIcon`, `r2`)
		chunk1.append(resourceIcon1)

		const resourceString1 = document.createElement(`div`)
		resourceString1.classList.add(`hintResourceString`)
		resourceString1.innerHTML = `1`
		chunk1.append(resourceString1)

		const resourceIcon2 = document.createElement(`div`)
		resourceIcon2.classList.add(`hintResourceIcon`, `r3`)
		chunk2.append(resourceIcon2)

		const resourceString2 = document.createElement(`div`)
		resourceString2.classList.add(`hintResourceString`)
		resourceString2.innerHTML = `1`
		chunk2.append(resourceString2)

		const resourceIcon3 = document.createElement(`div`)
		resourceIcon3.classList.add(`hintResourceIcon`, `r4`)
		chunk3.append(resourceIcon3)

		const resourceString3 = document.createElement(`div`)
		resourceString3.classList.add(`hintResourceString`)
		resourceString3.innerHTML = `1`
		chunk3.append(resourceString3)

		this.element.append(wrap)

	}

	addRefundListFromArray(initPrice){

		const wrap = document.createElement(`div`)
		let empty = true

		for (let i = 0; i < initPrice.length; i++){

			if (initPrice[i]){
				empty = false
				const chunk = document.createElement(`div`)
				chunk.classList.add(`hintResourceChunk`)
				wrap.append(chunk)

				const resourceIcon = document.createElement(`div`)
				resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
				chunk.append(resourceIcon)

				const resourceString = document.createElement(`div`)
				resourceString.classList.add(`hintResourceString`, `refund`)
				chunk.append(resourceString)
				resourceString.innerHTML = `+` + this.master.makeReadable(Math.floor(initPrice[i]))

			}

		}

		if (!empty) this.element.append(wrap)

	}

	addRefundList(name){

		const initPrice = this.master.getRealPrice(name, true)
		const wrap = document.createElement(`div`)
		let empty = true

		for (let i = 0; i < initPrice.length; i++){

			if (initPrice[i]){
				empty = false
				const chunk = document.createElement(`div`)
				chunk.classList.add(`hintResourceChunk`)
				wrap.append(chunk)

				const resourceIcon = document.createElement(`div`)
				resourceIcon.classList.add(`hintResourceIcon`, `r${i}`)
				chunk.append(resourceIcon)

				const resourceString = document.createElement(`div`)
				resourceString.classList.add(`hintResourceString`, `refund`)
				chunk.append(resourceString)
				resourceString.innerHTML = `+` + this.master.makeReadable(Math.floor(initPrice[i]))

				this.checks.push({
					element: resourceString,
					f: _=>{
						const p = this.master.getRealPrice(name, true)
						return `+` + this.master.makeReadable(Math.floor(p[i]))
					},
					effect: `text`
				})

			}

		}

		if (!empty) this.element.append(wrap)

	}

	update(){

		if (this.checks.length){
			for (let i = 0; i < this.checks.length; i++){

				const c = this.checks[i]

				if (c.effect === `width`){
					c.element.style.width = c.f() * 100 + `%`
				} else if (c.effect === `opacity`){
					c.element.style.opacity = c.f() ? 1 : .3
				} else if (c.effect === `text`){
					c.element.innerHTML = c.f()
				} else if (c.effect === `class`){
					c.element.className = c.f()
				}

			}
		}

		//QE update
		if (this.qElement){
			if (this.master.canAfford(this.entity.name)){
				this.qElement.classList.remove(`disabled`)
			} else {
				this.qElement.classList.add(`disabled`)
			}
		}

	}

}

class Store {

	constructor(container, master){

		this.master = master
		this.vessel = container

		this.html = {
			types: {},
			items: {},
			priceContainers: {},
			priceElements: {},
			counters: {},
			existeds: {},
		}
		this.existed = {}

	}

	setEraserType(t){
		this.html.eraser.classList.remove(`ii`, `iii`)
		if (t) this.html.eraser.classList.add(t === 1 ? `ii` : `iii`)
	}
	setExisted(e){
		this.existed = e
		this.compositionUpdate()
	}
	visibilityLoop(){
		setInterval(_=>{this.visibilityUpdate()}, 100)
	}
	compositionUpdate(){

		//On demand update
		let newItems = 0
		for (let i in this.html.items){
			const item = this.html.items[i]

			//Price
			this.html.priceContainers[i].innerHTML = ``
			this.html.priceElements[i] = []
			const realPrice = this.master.getRealPrice(i)
			
			for (let r = 0; r < realPrice.length; r++){
				if (!realPrice[r]) continue
				const nobr = document.createElement(`nobr`)
				const rico = document.createElement(`div`)
				rico.classList.add(`rico`, `r${r}`)
				const string = document.createElement(`span`)
				string.className = `priceString`
				string.innerHTML = this.master.makeReadable( Math.ceil(realPrice[r]) )

				nobr.append(rico, string)
				this.html.priceContainers[i].append(nobr)
				this.html.priceElements[i][r] = nobr
			}

			//Counter
			this.html.counters[i].innerHTML = this.master.entitiesInGame[i] || ``

			//Existed
			if (this.html.existeds[i] && (this.master.entitiesInGame[i] || this.existed[i])){
				this.html.existeds[i].style.display = `none`
				item.classList.remove(`newItem`)
				this.existed[i] = true
				delete this.html.existeds[i]
			}

		}

	}
	createEntityCard(id){

		const e = this.master.codex.entities[id]
		if (!e.canPurchase) return null

		const type = e.type ?? `default`
		const item = document.createElement(`div`)

		item.classList.add(`item`, `newItem`, `hidden`)
		if (type === `dark`) item.classList.add(`dark`)

		const imageVessel = document.createElement(`div`)
		imageVessel.classList.add(`imageVessel`)
		item.append(imageVessel)
		const image = document.createElement(`img`)
		image.src = window.ModLoader?.resolveAsset(e.shopImage || `img/shop/${e.isDark ? id + '_dark' : id}.jpg`) || e.shopImage || `img/shop/${e.isDark ? id + '_dark' : id}.jpg`
		imageVessel.append(image)

		const upgrade = this.master.codex.entities[id]?.isUpgradeTo
		if (upgrade && !(upgrade === `chasm` || upgrade === `hollow`)){
			const upBox = document.createElement(`div`)
			upBox.classList.add(`upgradeFrom`)
			upBox.style.backgroundImage = `url("img/shop/${upgrade}.jpg")`
			imageVessel.append(upBox)
		}

		const header = document.createElement(`div`)
		header.classList.add(`itemHeader`)
		header.innerText = this.master.pronounce('entities', id, 'name')
		item.append(header)

		const description = document.createElement(`div`)
		description.classList.add(`itemDescription`)
		description.innerText = this.master.pronounce('entities', id, 'description')
		item.append(description)

		const price = document.createElement(`div`)
		price.classList.add(`itemPrice`)
		item.append(price)

		const counter = document.createElement(`div`)
		counter.classList.add(`itemCounter`)
		item.append(counter)

		const existed = document.createElement(`div`)
		existed.classList.add(`existed`)
		existed.innerText = this.master.pronounce('random', 'existed')
		item.append(existed)

		return {
			card: item,
			price: price,
			counter: counter,
			existed: existed,
			type: type
		}

	}

}

class DesktopStoreVersion extends Store{

	constructor(container, master){

		super(container, master)
		this.isOpen = false

		this.init()
		this.visibilityLoop()

	}

	centerItem(n){
		console.log(`WIP: MAKE gamePadPresent ICON`)

		//Does it make sense
		if (!this.html.items[n] || this.html.items[n].classList.contains(`hidden`)) return

		//Find the right tab
		const type = this.master.codex.entities[n].type ?? `default`

		for (let j in this.html.types){

			if (j === type) {
				if (this.html.types[j].button.classList.contains(`closed`) && !this.html.types[j].button.classList.contains(`hidden`)) this.html.types[j].button.classList.remove(`closed`)
				requestAnimationFrame(_=>{
					this.adjustWrap(this.html.types[j].wrap)
					this.html.items[n].scrollIntoView({behavior: `smooth`, block: `center`})
				})
				
			} else {
				this.html.types[j].button.classList.add(`closed`)
			}

		}

		this.isOpen = true
	}

	adjustWrap(w){

		w.style.transform = `translate(-100%, -50%)`
		const rect = w.getBoundingClientRect()
		if (rect.top < 0){
			const percent = rect.top / rect.height * 100
			w.style.transform = `translate(-100%, -${50 + percent}%)`
		} else if (rect.bottom > innerHeight){
			const offset =  rect.bottom - innerHeight
			const percent = offset / rect.height * 100
			w.style.transform = `translate(-100%, -${50 + percent}%)`
		}

	}

	reinit() {
		this.vessel.replaceChildren()

		this.html = {
			types: {},
			items: {},
			priceContainers: {},
			priceElements: {},
			counters: {},
			existeds: {},
		}

		this.init()
		this.compositionUpdate()
		this.visibilityUpdate()
	}

	init() {

		//Create categories
		for (let i in this.master.codex.entityTypes){

			const t = this.html.types[i] = {} 
			t.button = document.createElement(`div`)
			t.button.classList.add(`element`, `hidden`, `closed`)
			t.button.style.backgroundImage = `url(img/shop/${i}.svg)`
			this.vessel.append(t.button)

			const dot = document.createElement(`div`)
			dot.classList.add(`dot`)
			t.button.append(dot)
			t.dot = dot

			t.wrap = document.createElement(`div`)
			t.wrap.classList.add(`itemWrap`)
			t.button.append(t.wrap)

			t.button.addEventListener(`mousedown`, _=>{

				delete this.master.interactionMode

				this.isOpen = false
				for (let j in this.html.types){

					if (j === i && this.html.types[j].button.classList.contains(`closed`)) {
						this.html.types[j].button.classList.remove(`closed`)
						this.isOpen = true
						requestAnimationFrame(_=>{this.adjustWrap(this.html.types[j].wrap)})
					} else {
						this.html.types[j].button.classList.add(`closed`)
					}

				}

			})
		}

		//Eraser
		{
			const e = document.createElement(`div`)
			e.classList.add(`element`, `eraser`, `hidden`, `closed`)
			e.style.backgroundImage = `url(img/shop/delete.svg)`
			this.vessel.append(e)
			this.html.eraser = e
			e.addEventListener(`mousedown`, _=>{
				if (e.classList.contains(`closed`)){
					e.classList.remove(`closed`)
					this.master.pickupEraser()
					this.closeTypes()
				} else {
					if (this.master.interactionMode === `erase`) {
						delete this.master.interactionMode
						this.master.cleanupErase()
					}
					e.classList.add(`closed`)
				}
				
			})
		}

		//relocator WIP
		{
			const e = document.createElement(`div`)
			e.classList.add(`element`, `relocator`, `hidden`, `closed`)
			e.style.backgroundImage = `url(img/m_relocate.png)`
			this.vessel.append(e)
			this.html.relocator = e
			e.addEventListener(`mousedown`, _=>{
				if (e.classList.contains(`closed`)){
					e.classList.remove(`closed`)
					const ok = this.master.entitiesInGame.mega3 > 0 && !this.master.entitiesInGame.pinhole && !this.master.plane
					if (ok) {
						this.master.interactionMode = `relocate`
						this.closeTypes()
					}
				} else {
					if (this.master.interactionMode === `relocate`) {
						delete this.master.interactionMode
						delete this.master.itemInHand
						delete this.master.transportedEntity
						this.master.cleanupRelocation()
					}
					e.classList.add(`closed`)
				}
				
			})
		}


		//Fill the store up except complete
		for (let i in this.master.codex.entities){

			const pack = this.createEntityCard(i)
			if (!pack) continue

			pack.card.onmousedown = e=>{
				if (pack.card.classList.contains(`disabled`)) return
				this.master.pickupItem(i)
				e.stopPropagation() //Otherwise listener on button will cancel the mode
			}

			this.html.items[i] = pack.card
			this.html.types[pack.type].wrap.append(pack.card)
			this.html.priceContainers[i] = pack.price
			this.html.counters[i] = pack.counter
			this.html.existeds[i] = pack.existed

		}

	}

	closeTypes(){
		for (let j in this.html.types) this.html.types[j].button.classList.add(`closed`)
		this.isOpen = false
	}

	visibilityUpdate(){

		//Fast update
		let openType
		let openTypeChanged = false
		for (let type in this.html.types){
			if (!this.html.types[type].button.classList.contains(`closed`)){
				openType = type
				break
			}
		}

		//Modes
		if (this.master.interactionMode !== `erase` && !this.html.eraser.classList.contains(`closed`)){
			this.html.eraser.classList.add(`closed`)
		} else if (this.master.interactionMode === `erase` && this.html.eraser.classList.contains(`closed`)){
			this.html.eraser.classList.remove(`closed`)
		}

		if (this.master.interactionMode !== `relocate` && !this.html.relocator.classList.contains(`closed`)){
			this.html.relocator.classList.add(`closed`)
		} else if (this.master.interactionMode === `relocate` && this.html.relocator.classList.contains(`closed`)){
			this.html.relocator.classList.remove(`closed`)
		}

		let newAndAvailable = []

		for (let i in this.html.types){
			this.html.types[i].dot.classList.add(`hidden`, `grey`)
			this.html.types[i].button.classList.add(`dim`, `hidden`)
		}

		if (this.html.eraser.classList.contains(`hidden`) && this.master.unlockedEntities.pump && !this.master.plane){
			this.html.eraser.classList.remove(`hidden`)
		} else if (!this.html.eraser.classList.contains(`hidden`) && this.master.plane){
			this.html.eraser.classList.add(`hidden`)
		}

		if (this.html.relocator.classList.contains(`hidden`) && this.master.entitiesInGame.mega3 && !this.master.plane){
			this.html.relocator.classList.remove(`hidden`)
		} else if (!this.html.relocator.classList.contains(`hidden`) && this.master.plane){
			this.html.relocator.classList.add(`hidden`)
		}

		for (let i in this.html.items){

			const item = this.html.items[i]
			const wasHidden = item.classList.contains(`hidden`)

			let unlocked = this.master.unlockedEntities[i] || false
			if (!unlocked) {
				//On unlock
				unlocked = (this.master.codex.entities[i].shouldUnlock && this.master.codex.entities[i].shouldUnlock(this.master)) ? true : false
				if (unlocked) this.master.unlockedEntities[i] = true
			}

			if (!unlocked) continue

			const type = this.master.codex.entities[i].type ?? `default`
			item.classList.remove(`hidden`)
			const local = (type === `dark` && this.master.plane) || (type !== `dark` && !this.master.plane)
			if (!this.master.onlyones[i] && local) this.html.types[type].button.classList.remove(`hidden`)
			
			let afford = true
			const matrix = []
			const price = this.master.getRealPrice(i)

			for (let j = 0; j < price.length; j++){
				if (price[j]){
					if (price[j] > this.master.resources[j]){
						afford = false
						matrix[j] = 0
					} else {
						matrix[j] = 1
					}
				}
			}

			const availableInStore = !this.master.onlyones[i] && local
			if (this.html.existeds[i] && availableInStore) {
				this.html.types[type].dot.classList.remove(`hidden`)
				if (afford) this.html.types[type].dot.classList.remove(`grey`)
			}

			if (afford){
				item.classList.remove(`disabled`)
				this.html.types[type].button.classList.remove(`dim`)
			} else {
				item.classList.add(`disabled`)

				// if (this.html.existeds[i]) this.html.types[type].dot.classList.add(`grey`)

				if (this.html.priceElements[i]){

					for (let j = 0; j < matrix.length; j++){

						if (matrix[j]){
							this.html.priceElements[i][j].classList.add(`available`)
						} else if (this.html.priceElements[i][j]){
							this.html.priceElements[i][j].classList.remove(`available`)
							
						}

					}

				}
			}

			if (this.master.onlyones[i]){
				item.classList.add(`hidden`)
			}

			if (
				wasHidden !== item.classList.contains(`hidden`) &&
				type === openType
			){
				openTypeChanged = true
			}

		}

		if (openTypeChanged){
			requestAnimationFrame(_=>{
				const tab = this.html.types[openType]
				if (!tab.button.classList.contains(`closed`) && !tab.button.classList.contains(`hidden`)){
					this.adjustWrap(tab.wrap)
				}
			})
		}

	}

}

class MobileStoreVersion extends Store{

	constructor(container, master){

		super(container, master)
		this.isOpen = false

		this.init()
		this.visibilityLoop()

	}

	init() {

		//WIP DUMMIES
		// this.html.eraser = document.createElement(`div`)
		// this.html.relocator = document.createElement(`div`)
		// this.html.chat = document.createElement(`div`)
		// this.html.menu = document.createElement(`div`)

		const firstRow = document.createElement(`div`)
		firstRow.classList.add(`firstRow`)
		document.body.append(firstRow)

		//Menu button
		this.html.menu = document.createElement(`div`)
		this.html.menu.classList.add(`mobileMenu`)
		firstRow.appendChild(this.html.menu)
		this.html.menu.ontouchstart = _=>{
			this.master.cleanupErase()
			// this.master.cleanupClone() // WIP
			this.master.toggleSplash()
		}

		//Chat button
		this.html.chat = document.createElement(`div`)
		this.html.chat.classList.add(`mobileChat`)
		firstRow.appendChild(this.html.chat)

		this.html.chat.ontouchstart = _=>{
			this.master.removeHint()
			this.master.cleanupErase()
			// this.master.cleanupClone() //WIP
			if (this.master.messenger.messagesShown === 1){
				this.master.messenger.hideMessages()
			} else {
				this.master.messenger.showMessages()
			}
		}

		//Central button
		this.pristineShop = true
		this.html.store = document.createElement(`div`)
		this.html.store.classList.add(`mobileToggle`)
		firstRow.appendChild(this.html.store)
		this.html.store.ontouchstart = _=>{
			delete this.master.interactionMode
			this.master.cleanupErase()
			// this.master.cleanupClone() //WIP
			this.master.messenger.hideMessages()
			if (this.master.itemInHand){
				delete this.master.itemInHand
				delete this.master.transportedEntity
				this.html.store.classList.remove(`active`)
			} else {
				this.vessel.classList.toggle(`visible`)
				this.html.store.classList.toggle(`active`)
			}
			this.toggleAllButStore()
		}

		// Counter
		this.html.availableMachines = document.createElement(`div`)
		this.html.availableMachines.classList.add(`mobileAvailableMachines`)
		this.html.availableMachines.innerHTML = `42`
		this.html.store.append(this.html.availableMachines)

		//Eraser
		this.pristineDelete = true
		this.html.eraser = document.createElement(`div`)
		this.html.eraser.classList.add(`mobileEraser`)
		firstRow.append(this.html.eraser)
		this.html.eraser.ontouchstart = _=>{
			this.master.pressedMobileDisassemble = true
			this.master.messenger.hideMessages()
			this.html.store.classList.remove(`active`)
			this.vessel.classList.remove(`visible`)

			if (this.master.interactionMode === `erase`){
				delete this.master.interactionMode
				this.master.cleanupErase()
			} else {
				this.master.pickupEraser()
			}
			

			// this.toggleMobileEraser()
			// this.master.cleanupErase()
			// this.master.cleanupClone() //WIP
		}

		//Relocator
		this.pristineRelocate = true
		this.html.relocator = document.createElement(`div`)
		this.html.relocator.classList.add(`mobileRelocator`)
		firstRow.appendChild(this.html.relocator)
		this.html.relocator.ontouchstart = _=>{
			// this.master.messenger.hideMessages()
			// this.mobileToggle.classList.remove(`active`)
			// this.vessel.classList.remove(`visible`)
			// this.toggleMobileRelocator()
			// this.master.cleanupErase()
			// this.master.cleanupClone()

			const ok = this.master.entitiesInGame.mega3 > 0 && !this.master.entitiesInGame.pinhole && !this.master.plane
			if (!ok) return

			if (this.master.interactionMode === `relocate`) {
				delete this.master.interactionMode
				delete this.master.itemInHand
				delete this.master.transportedEntity
				this.master.cleanupRelocation()
				return
			}

			this.master.interactionMode = `relocate`

		}


		//Store shelves
		const itemWrap = document.createElement(`div`)
		itemWrap.classList.add(`itemWrap`)
		this.vessel.append(itemWrap)

		for (let i in this.master.codex.entities){

			const pack = this.createEntityCard(i)
			if (!pack) continue

			pack.card.onmousedown = e=>{
				if (pack.card.classList.contains(`disabled`)) return
				this.master.pickupItem(i)
				this.master.updatePointerState()
				this.vessel.classList.toggle(`visible`)
				e.stopPropagation()
			}

			this.html.items[i] = pack.card
			// this.html.types[pack.type].wrap.append(pack.card)
			this.html.priceContainers[i] = pack.price
			this.html.counters[i] = pack.counter
			this.html.existeds[i] = pack.existed

			itemWrap.append(pack.card) //WIP
			
		}

	}

	closeTypes(){
		for (let j in this.html.types) this.html.types[j].button.classList.add(`closed`)
		this.isOpen = false
	}

	toggleAllButStore(){

		// const on = this.html.store.classList.contains(`active`)
		// if (on) {
		// 	this.html.chat.style.display = `none`
		// 	this.html.relocator.style.display = `none`
		// 	this.html.eraser.style.display = `none`
		// 	this.html.menu.style.display = `none`
		// } else {
		// 	this.html.chat.removeAttribute(`style`)
		// 	this.html.menu.removeAttribute(`style`)
		// 	if (!this.master.plane){
		// 		this.html.relocator.removeAttribute(`style`)
		// 		this.html.eraser.removeAttribute(`style`)
		// 	}
		// }
	}

	visibilityUpdate(){

		// Show or hide buttons
		if (this.pristineShop && this.master.stats.absoluteResourcesCount){
			this.pristineShop = false
		}
		if (this.pristineDelete && this.master.resources[2]){
			this.pristineDelete = false
		}
		if (this.pristineRelocate && this.master.entitiesInGame.mega3){
			this.pristineRelocate = false
		}

		//Button visibility
		const bv = [1, 1, this.pristineShop ? 0 : 1, this.pristineDelete ? 0 : 1, this.pristineRelocate ? 0 : 1]

		//Store open
		if (this.html.store.classList.contains(`active`)){
			bv[0] *= 0
			bv[1] *= 0
			bv[2] *= 1
			bv[3] *= 0
			bv[4] *= 0
		}

		//Plane handling
		if (this.master.plane){
			bv[3] *= 0
			bv[4] *= 0
		} else {
			bv[3] *= 1
			bv[4] *= 1
		}

		if (this.html.menu.classList.contains(`hidden`) && bv[0]) this.html.menu.classList.remove(`hidden`); else if (!this.html.menu.classList.contains(`hidden`) && !bv[0]) this.html.menu.classList.add(`hidden`)
		if (this.html.chat.classList.contains(`hidden`) && bv[1]) this.html.chat.classList.remove(`hidden`); else if (!this.html.chat.classList.contains(`hidden`) && !bv[1]) this.html.chat.classList.add(`hidden`)
		if (this.html.store.classList.contains(`hidden`) && bv[2]) this.html.store.classList.remove(`hidden`); else if (!this.html.store.classList.contains(`hidden`) && !bv[2]) this.html.store.classList.add(`hidden`)
		if (this.html.eraser.classList.contains(`hidden`) && bv[3]) this.html.eraser.classList.remove(`hidden`); else if (!this.html.eraser.classList.contains(`hidden`) && !bv[3]) this.html.eraser.classList.add(`hidden`)
		if (this.html.relocator.classList.contains(`hidden`) && bv[4]) this.html.relocator.classList.remove(`hidden`); else if (!this.html.relocator.classList.contains(`hidden`) && !bv[4]) this.html.relocator.classList.add(`hidden`)

		// Handling button press states
		if (this.master.interactionMode === `erase`){
			this.html.eraser.classList.add(`pressed`)
			this.html.relocator.classList.remove(`pressed`)
		} else if (this.master.interactionMode === `relocate`){
			this.html.eraser.classList.remove(`pressed`)
			this.html.relocator.classList.add(`pressed`)
		} else {
			this.html.eraser.classList.remove(`pressed`)
			this.html.relocator.classList.remove(`pressed`)
		}

		if (this.master.messenger.messagesShown === 1 && !this.html.chat.classList.contains(`pressed`)){
			this.html.chat.classList.add(`pressed`)
		} else if (this.master.messenger.messagesShown !== 1 && this.html.chat.classList.contains(`pressed`)){
			this.html.chat.classList.remove(`pressed`)
		}

		//Fast update
		// let openType
		// let openTypeChanged = false
		// for (let type in this.html.types){
		// 	if (!this.html.types[type].button.classList.contains(`closed`)){
		// 		openType = type
		// 		break
		// 	}
		// }

		// //Modes
		// if (this.master.interactionMode !== `erase` && !this.html.eraser.classList.contains(`closed`)){
		// 	this.html.eraser.classList.add(`closed`)
		// } else if (this.master.interactionMode === `erase` && this.html.eraser.classList.contains(`closed`)){
		// 	this.html.eraser.classList.remove(`closed`)
		// }

		// if (this.master.interactionMode !== `relocate` && !this.html.relocator.classList.contains(`closed`)){
		// 	this.html.relocator.classList.add(`closed`)
		// } else if (this.master.interactionMode === `relocate` && this.html.relocator.classList.contains(`closed`)){
		// 	this.html.relocator.classList.remove(`closed`)
		// }

		// let newAndAvailable = []

		// for (let i in this.html.types){
		// 	this.html.types[i].dot.classList.add(`hidden`, `grey`)
		// 	this.html.types[i].button.classList.add(`dim`, `hidden`)
		// }

		// if (this.html.eraser.classList.contains(`hidden`) && this.master.unlockedEntities.pump && !this.master.plane){
		// 	this.html.eraser.classList.remove(`hidden`)
		// } else if (!this.html.eraser.classList.contains(`hidden`) && this.master.plane){
		// 	this.html.eraser.classList.add(`hidden`)
		// }

		// if (this.html.relocator.classList.contains(`hidden`) && this.master.entitiesInGame.mega3 && !this.master.plane){
		// 	this.html.relocator.classList.remove(`hidden`)
		// } else if (!this.html.relocator.classList.contains(`hidden`) && this.master.plane){
		// 	this.html.relocator.classList.add(`hidden`)
		// }

		//Store shelves visibility
		let itemCount = 0
		for (let i in this.html.items){

			const item = this.html.items[i]
			const wasHidden = item.classList.contains(`hidden`)

			let unlocked = this.master.unlockedEntities[i] || false
			if (!unlocked) {
				//On unlock
				unlocked = (this.master.codex.entities[i].shouldUnlock && this.master.codex.entities[i].shouldUnlock(this.master)) ? true : false
				if (unlocked) this.master.unlockedEntities[i] = true
			}

			if (!unlocked) continue

			const type = this.master.codex.entities[i].type ?? `default`
			item.classList.remove(`hidden`)
			const local = (type === `dark` && this.master.plane) || (type !== `dark` && !this.master.plane)
			// if (!this.master.onlyones[i] && local) this.html.types[type].button.classList.remove(`hidden`)
			
			let afford = true
			const matrix = []
			const price = this.master.getRealPrice(i)

			for (let j = 0; j < price.length; j++){
				if (price[j]){
					if (price[j] > this.master.resources[j]){
						afford = false
						matrix[j] = 0
					} else {
						matrix[j] = 1
					}
				}
			}

			const availableInStore = !this.master.onlyones[i] && local
			if (this.html.existeds[i] && availableInStore) {
				// this.html.types[type].dot.classList.remove(`hidden`)
				// if (afford) this.html.types[type].dot.classList.remove(`grey`)
			}

			if (afford){
				item.classList.remove(`disabled`)
				if (availableInStore) itemCount++
				// this.html.types[type].button.classList.remove(`dim`)
			} else {
				item.classList.add(`disabled`)

				// if (this.html.existeds[i]) this.html.types[type].dot.classList.add(`grey`)

				if (this.html.priceElements[i]){

					for (let j = 0; j < matrix.length; j++){

						if (matrix[j]){
							this.html.priceElements[i][j].classList.add(`available`)
						} else if (this.html.priceElements[i][j]){
							this.html.priceElements[i][j].classList.remove(`available`)
							
						}

					}

				}
			}

			if (this.master.onlyones[i]){
				item.classList.add(`hidden`)
			}

			// if (
			// 	wasHidden !== item.classList.contains(`hidden`) &&
			// 	type === openType
			// ){
			// 	openTypeChanged = true
			// }

		}

		//Store counter update
		if (this.html.availableMachines) {
			this.html.availableMachines.innerText = itemCount
			if (itemCount){
				this.html.availableMachines.classList.remove(`hidden`)
			} else {
				this.html.availableMachines.classList.add(`hidden`)
			}
		}

		// if (openTypeChanged){
		// 	requestAnimationFrame(_=>{
		// 		const tab = this.html.types[openType]
		// 		if (!tab.button.classList.contains(`closed`) && !tab.button.classList.contains(`hidden`)){
		// 			this.adjustWrap(tab.wrap)
		// 		}
		// 	})
		// }

	}

}

class Shop {

	constructor(container, master){

		this.master = master
		this.vessel = container
		
		this.selected = false
		this.selectedId = 0

		//Minimized
		this.shopToggle = document.createElement(`div`)
		this.shopToggle.classList.add(`shopToggle`)
		document.body.appendChild(this.shopToggle)
		this.shopToggle.onclick = _=>{
			this.vessel.classList.toggle(`minimized`)
			this.shopToggle.classList.toggle(`toggled`)
		}

		//Mobile lower menu
		if (this.master.isMobile){

			const firstRow = document.createElement(`div`)
			firstRow.classList.add(`firstRow`)
			document.body.append(firstRow)

			this.pristineShop = true
			this.mobileToggle = document.createElement(`div`)
			this.mobileToggle.classList.add(`mobileToggle`, `pristine`)
			firstRow.appendChild(this.mobileToggle)
			this.mobileToggle.ontouchstart = _=>{
				this.master.touchMode = 0
				this.master.cleanupErase()
				this.master.cleanupClone()
				this.master.messenger.hideMessages()
				this.updateMobileMenuState()
				if (this.master.itemInHand){
					delete this.master.itemInHand
					delete this.master.transportedEntity
					this.mobileToggle.classList.remove(`active`)
				} else {
					this.vessel.classList.toggle(`visible`)
					this.mobileToggle.classList.toggle(`active`)
				}
				this.toggleAllButShop()
				
			}

			this.availableMachines = document.createElement(`div`)
			this.availableMachines.classList.add(`mobileAvailableMachines`)
			this.availableMachines.innerHTML = `42`
			this.mobileToggle.append(this.availableMachines)

			this.pristineDelete = true
			this.mobileEraser = document.createElement(`div`)
			this.mobileEraser.classList.add(`mobileEraser`, `pristine`)
			firstRow.appendChild(this.mobileEraser)
			this.mobileEraser.ontouchstart = _=>{
				this.master.pressedMobileDisassemble = true
				this.master.messenger.hideMessages()
				this.mobileToggle.classList.remove(`active`)
				this.vessel.classList.remove(`visible`)
				this.toggleMobileEraser()
				this.master.cleanupErase()
				this.master.cleanupClone()
			}

			this.pristineRelocate = true
			this.mobileRelocator = document.createElement(`div`)
			this.mobileRelocator.classList.add(`mobileRelocator`, `pristine`)
			firstRow.appendChild(this.mobileRelocator)
			this.mobileRelocator.ontouchstart = _=>{
				this.master.messenger.hideMessages()
				this.mobileToggle.classList.remove(`active`)
				this.vessel.classList.remove(`visible`)
				this.toggleMobileRelocator()
				this.master.cleanupErase()
				this.master.cleanupClone()
			}
			this.mobileRelocatorSwitch = document.createElement(`div`)
			this.mobileRelocatorSwitch.classList.add(`mobileRelocatorSwitch`)
			this.mobileRelocatorSwitchClone = document.createElement(`div`)
			this.mobileRelocatorSwitchClone.classList.add(`clone`, `active`)
			this.mobileRelocatorSwitch.append(this.mobileRelocatorSwitchClone)
			this.mobileRelocatorSwitchMove = document.createElement(`div`)
			this.mobileRelocatorSwitchMove.classList.add(`move`)
			this.mobileRelocatorSwitch.append(this.mobileRelocatorSwitchMove)

			this.mobileRelocatorSwitchClone.ontouchstart = _=>{
				this.master.massRelocation = false
				this.mobileRelocatorSwitchMove.classList.remove(`active`)
				this.mobileRelocatorSwitchClone.classList.add(`active`)	
			}

			this.mobileRelocatorSwitchMove.ontouchstart = _=>{
				this.master.massRelocation = true
				this.mobileRelocatorSwitchMove.classList.add(`active`)
				this.mobileRelocatorSwitchClone.classList.remove(`active`)	
			}

			this.mobileConfirmButton = document.createElement(`div`)
			this.mobileConfirmButton.classList.add(`mobileConfirmButton`, `hidden`)
			document.body.append(this.mobileConfirmButton)
			this.mobileConfirmButton.ontouchstart = _=>{

				if (this.master.massRelocation){
					this.master.confirmMassRelocation()
				} else {
					this.master.confirmMassClone()
				}

				this.toggleMobileRelocator()
				this.master.cleanupClone()

			}

			
			this.mobileChat = document.createElement(`div`)
			this.mobileChat.classList.add(`mobileChat`)
			firstRow.appendChild(this.mobileChat)

			this.mobileChat.ontouchstart = _=>{
				this.master.removeHint()
				this.master.cleanupErase()
				this.master.cleanupClone()
				if (this.master.messenger.messagesShown === 1){
					this.master.messenger.hideMessages()
				} else {
					this.master.messenger.showMessages()
				}
			}

			this.mobileMenu = document.createElement(`div`)
			this.mobileMenu.classList.add(`mobileMenu`)
			firstRow.appendChild(this.mobileMenu)

			this.mobileMenu.ontouchstart = _=>{
				this.master.cleanupErase()
				this.master.cleanupClone()
				this.master.toggleSplash()
			}
		}

		//Gamepad
		this.gamePadHint = document.createElement(`div`)
		this.gamePadHint.classList.add(`shopGamepadHint`)
		document.body.append(this.gamePadHint)

		this.init()
		this.checkLoop()


	}

	toggleAllButShop(){

		const on = this.mobileToggle.classList.contains(`active`)
		if (on) {
			this.mobileChat.style.display = `none`
			this.mobileRelocator.style.display = `none`
			this.mobileEraser.style.display = `none`
			this.mobileMenu.style.display = `none`
		} else {
			this.mobileChat.removeAttribute(`style`)
			this.mobileMenu.removeAttribute(`style`)
			if (!this.master.plane){
				this.mobileRelocator.removeAttribute(`style`)
				this.mobileEraser.removeAttribute(`style`)
			}
		}
	}

	updateMobileMenuState(){

		if (this.master.touchMode === 1){
			this.mobileEraser.classList.add(`pressed`)
			this.mobileRelocator.classList.remove(`pressed`)
		} else if (this.master.touchMode === 2){
			this.mobileEraser.classList.remove(`pressed`)
			this.mobileRelocator.classList.add(`pressed`)
		} else {
			this.mobileEraser.classList.remove(`pressed`)
			this.mobileRelocator.classList.remove(`pressed`)
		}

	}

	toggleMobileEraser(){
		this.master.touchMode = this.master.touchMode === 1 ? 0 : 1
		delete this.master.itemInHand
		delete this.master.transportedEntity

		this.updateMobileMenuState()
	}

	toggleMobileRelocator(){
		this.master.touchMode = this.master.touchMode === 2 ? 0 : 2
		delete this.master.itemInHand
		delete this.master.transportedEntity

		if (this.master.touchMode === 2){
			document.body.append(this.mobileRelocatorSwitch)
		}
		this.updateMobileMenuState()
	}

	centerItem(name){

		for (let i = 0; i < this.items.length; i++){
			if (name === this.items[i].name) {
				this.items[i].html.scrollIntoView({behavior: `smooth`, block: `center`})
			}
		}

	}

	selectItem(){

		if (!this.master.unlockedEntities[this.items[this.selectedId].name]){
			for (let i = 1; i < this.items.length; i++){
				if (this.master.unlockedEntities[this.items[i].name] && !this.items[i].html.classList.contains(`hidden`)){
					this.selectedId = i
					break
				}
			}
		}

		this.selected = true
		this.items[this.selectedId].html.classList.add(`selected`)
		this.items[this.selectedId].html.scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"})

	}

	selectNextItem(){

		for (let i = this.selectedId + 1; i < this.items.length; i++){
			if (this.items[i]?.name && !this.items[i].html.classList.contains(`hidden`)){

				this.items[this.selectedId].html.classList.remove(`selected`)
				this.selectedId = i
				this.items[this.selectedId].html.classList.add(`selected`)
				this.items[this.selectedId].html.scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"})
				break

			}
		}

	}

	selectPreviousItem(){

		for (let i = this.selectedId - 1; i >= 0; i--){
			if (this.items[i]?.name && !this.items[i].html.classList.contains(`hidden`)){

				this.items[this.selectedId].html.classList.remove(`selected`)
				this.selectedId = i
				this.items[this.selectedId].html.classList.add(`selected`)
				this.items[this.selectedId].html.scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"})
				break

			}
		}

	}

	deselectItem(){
		this.selected = false
		this.items[this.selectedId].html.classList.remove(`selected`)
	}

	setExisted(v){
		this.existed = v
		this.updateElements()
	}

	init(dark){

		if (dark) {
			this.vessel.classList.add(`darkShop`)
		} else {
			this.vessel.classList.remove(`darkShop`)
		}
		this.items = []
		if (!this.existed){
			this.existed = {
				eraser: true,
				eraser2: true,
				eraser3: true
			}
		}
		// this.darkitems = []
		this.vessel.innerHTML = ``
		this.shopToggle.style.display = this.master.pinhole ? `none` : `block`

		let pack = false
		for (let i in this.master.codex.entities){
			const e = this.master.codex.entities[i]
			if (e.canPurchase && ((dark && e.isDark) || (!dark && !e.isDark))){
				if (this.master.isMobile && (i === `eraser` || i === `eraser2` || i === `eraser3`)) continue
				if (e.merge && !this.master.isMobile){

					if (!pack){
						pack = document.createElement(`div`)
						pack.classList.add(`shopPack`)
						this.vessel.append(pack)
					}

					this.addItem({
					isDark: dark,
					vessel: pack,
					name: this.master.pronounce('entities', i, 'name'),
					description: this.master.pronounce('entities', i, 'description'),
					price: e.price,
					priceExponent: e.priceExponent || 1,
					id: i})

				} else {

					this.addItem({
					isDark: dark,
					vessel: pack ? pack : this.vessel,
					name: this.master.pronounce('entities', i, 'name'),
					description: this.master.pronounce('entities', i, 'description'),
					price: e.price,
					priceExponent: e.priceExponent || 1,
					id: i})

					pack = false
				}
				
			}
		}

		this.updateElements()
	}

	switchPlane(p){

		this.init(p === 1 ? true : false)

	} 

	checkLoop(){

		setTimeout(_=>{this.checkLoop()}, 100)
		this.check()

	}

	check(){

		//Mobile
		if (this.master.isMobile){
			if (this.pristineShop && this.master.stats.absoluteResourcesCount){
				this.mobileToggle.classList.remove(`pristine`)
				this.pristineShop = false
			}
			if (this.pristineDelete && this.master.resources[2]){
				this.mobileEraser.classList.remove(`pristine`)
				this.pristineDelete = false
			}
			if (this.pristineRelocate && this.master.entitiesInGame.mega3){
				this.mobileRelocator.classList.remove(`pristine`)
				this.pristineRelocate = false
			}
		}

		if (this.master.resources[0]) this.gamePadHint.classList.add(`shopActive`)

		let itemCount = 0
		for (let i = 0; i < this.items.length; i++){

			let unlocked = this.master.unlockedEntities[this.items[i].name] || false
			if (!unlocked) {
				unlocked = (this.master.codex.entities[this.items[i].name].shouldUnlock && this.master.codex.entities[this.items[i].name].shouldUnlock(this.master)) ? true : false
				if (unlocked) this.master.unlockedEntities[this.items[i].name] = true
			}
			
			let afford = true
			const matrix = []
			const price = this.master.getRealPrice(this.items[i].name)
			for (let j = 0; j < price.length; j++){
				if (price[j]){
					if (price[j] > this.master.resources[j]){
						afford = false
						matrix.push(0)
					} else {
						matrix.push(1)
					}
				}
			}

			if (afford){
				if (unlocked && !this.master.onlyones[this.items[i].name]) itemCount++
				this.items[i].html.classList.remove(`disabled`)
			} else {
				this.items[i].html.classList.add(`disabled`)
				if (this.items[i].priceElements){

					for (let j = 0; j < this.items[i].priceElements.length; j++){

						if (matrix[j]){
							this.items[i].priceElements[j].classList.add(`available`)
						} else {
							this.items[i].priceElements[j].classList.remove(`available`)
						}

					}

				}
			}

			if (unlocked) {
				this.items[i].html.classList.remove(`hidden`)
				if (this.items[i].pack) this.items[i].pack.classList.add(`visible`)
			}

			if (this.master.onlyones[this.items[i].name]){
				this.items[i].html.classList.add(`hidden`)
			}


			//ERASERS CHECK
			if (this.items[i].name === `eraser`){
				if (this.master.eraserType === 0 && this.master.unlockedEntities[this.items[i].name]){
					this.items[i].html.classList.remove(`hidden`)
				} else {
					this.items[i].html.classList.add(`hidden`)
				}
			}
			if (this.items[i].name === `eraser2`){
				if (this.master.eraserType === 1){
					this.items[i].html.classList.remove(`hidden`)
				} else {
					this.items[i].html.classList.add(`hidden`)
				}
			}
			if (this.items[i].name === `eraser3`){
				if (this.master.eraserType === 2){
					this.items[i].html.classList.remove(`hidden`)
				} else {
					this.items[i].html.classList.add(`hidden`)
				}
			}

		}

		if (this.availableMachines) {
			this.availableMachines.innerHTML = itemCount
			if (itemCount){
				this.availableMachines.classList.remove(`hidden`)
			} else {
				this.availableMachines.classList.add(`hidden`)
			}
		}

	}

	addItem(params){

		const item = document.createElement(`div`)
		item.classList.add(`shopItem`, `hidden`)

		const imageVessel = document.createElement(`div`)
		imageVessel.classList.add(`imageVessel`)
		item.append(imageVessel)
		const image = document.createElement(`img`)
		image.src = `img/shop/${params.isDark ? params.id + '_dark' : params.id}.jpg`
		imageVessel.appendChild(image)

		const upgrade = this.master.codex.entities[params.id]?.isUpgradeTo
		if (upgrade && !(upgrade === `chasm` || upgrade === `hollow`)){
			const upBox = document.createElement(`div`)
			upBox.classList.add(`upgradeFrom`)
			upBox.style.backgroundImage = `url("img/shop/${upgrade}.jpg")`
			imageVessel.appendChild(upBox)
		}

		const header = document.createElement(`div`)
		header.classList.add(`itemHeader`)
		header.innerText = params.name
		item.append(header)

		const description = document.createElement(`div`)
		description.classList.add(`itemDescription`)
		description.innerText = params.description
		item.append(description)

		const price = document.createElement(`div`)
		price.classList.add(`itemPrice`)
		item.append(price)

		const counter = document.createElement(`div`)
		counter.classList.add(`itemCounter`)
		item.append(counter)

		const existed = document.createElement(`div`)
		existed.classList.add(`existed`)
		existed.innerText = this.master.pronounce('random', 'existed')
		item.append(existed)

		params.vessel.append(item)

		item.onmousedown = _=>{
			if (item.classList.contains(`disabled`)) return
			this.master.pickupItem(params.id)
			this.master.processMousemove2()
			if (this.master.isMobile) this.vessel.classList.toggle(`visible`)
		}

		this.items.push({
			html: item,
			pack: params.vessel.classList.contains(`shopPack`) ? params.vessel : false, 
			priceHtml: price, 
			price: params.price, 
			priceExponent: params.priceExponent,
			name: params.id, 
			counter: counter,
			existed: existed
		})

	}

	updateElements(){
		let newItems = 0
		for (let i = 0; i < this.items.length; i++){
			this.updatePrice(this.items[i])
			this.updateCounter(this.items[i])
			if (!this.updateExisted(this.items[i]) && this.master.unlockedEntities[this.items[i].name]) newItems++
		}

		if (this.availableMachines){
			if (newItems){
				this.availableMachines.classList.add(`hasNew`)
			} else {
				this.availableMachines.classList.remove(`hasNew`)
			}
		}

	}

	updateExisted(item){
		if (this.master.entitiesInGame[item.name]) this.existed[item.name] = true

		item.existed.style.display = this.existed[item.name] ? `none` : `block`
		if (this.existed[item.name]){
			item.html.classList.remove(`newItem`)
		} else {
			item.html.classList.add(`newItem`)
		}

		return this.existed[item.name]
	}

	updatePrice(item){

		// const quantity = (this.master.entitiesInGame[item.name] || 0)

		// let priceString = ``
		item.priceElements = []
		item.priceHtml.innerHTML = ``
		const realPrice = this.master.getRealPrice(item.name)

		for (let i = 0; i < item.price.length; i++){
			if (item.price[i]){

				const nobr = document.createElement(`nobr`)
				const rico = document.createElement(`div`)
				rico.classList.add(`rico`, `r${i}`)
				const string = document.createElement(`span`)
				string.className = `priceString`
				string.innerHTML = this.master.makeReadable( Math.ceil(realPrice[i]) )

				nobr.append(rico, string)
				item.priceHtml.append(nobr)
				item.priceElements.push(nobr)


				// priceString += `<nobr><div class="rico r${i}" ></div><span class="priceString">${this.master.makeReadable( Math.ceil(item.price[i] * item.priceExponent ** quantity) )}</span></nobr>`
			}
		}

		// item.priceHtml.innerHTML = priceString

	}

	updateCounter(item){
		item.counter.innerHTML = this.master.entitiesInGame[item.name] || ``
	}

}

class DesktopExplainer {

	constructor(master, next = 0){

		if (+next === -1){
			this.finished = true
		}

		this.master = master

		this.stuff = [

			{
				showIf: (m,t)=>(t > 30000),
				hideIf: (m,t)=>(m.entitiesInGame.cube > 0)
			},
			{
				showIf: (m,t)=>(m.messenger.firedEvents[1] && t > 2000),
				hideIf: (m,t)=>(m.resources[0] > 0 && t > 10000)
			},
			{
				showIf: (m,t)=>(m.itemInHand),
				hideIf: (m,t)=>(!m.itemInHand)
			},
			{
				showIf: (m,t)=>(m.messenger.firedEvents[7] && t > 1000),
				hideIf: (m,t)=>(m.altActive && m.hoveredEntity)
			},
			{
				showIf: (m,t)=>(m.messenger.firedEvents[7]),
				hideIf: (m,t)=>(m.pressedQOnBlank)
			},
			{
				showIf: (m,t)=>(m.messenger.firedEvents[7]),
				hideIf: (m,t)=>(m.pressedQOnMachine)
			},
			{
				showIf: (m,t)=>(m.messenger.firedEvents[10]),
				hideIf: (m,t)=>(m.translation[0] || m.translation[1])
			}
		]
		this.next = +next
		this.state = 0 //0 not shown, 1 is shown
		this.timer = 0

		this.element = document.createElement(`div`)
		this.element.classList.add(`explainer`)
		document.body.append(this.element)

	}

	update(dt){

		if (!this.master.splash.isShown){

			const item = this.stuff[this.next]
			if (this.finished || !item) return

			if (!this.state){
				this.timer += dt
				if (item.showIf(this.master, this.timer)){

					this.element.innerHTML = this.master.pronounce('explainer', this.next)
					this.timer = 0
					this.state = 1

				}
			}

			if (this.state) {
				this.timer += dt
				if (item.hideIf(this.master, this.timer)){

					this.element.innerHTML = ``
					this.next++
					this.state = 0
					this.timer = 0

					if (!this.stuff[this.next]){
						this.element.remove()
						this.finished = true
						this.master.savePreferences()
						// localStorage.setItem(`abstractv03_helpIsNeeded${this.master.steamId}`, -1)
					} else {
						this.master.savePreferences()
						// localStorage.setItem(`abstractv03_helpIsNeeded${this.master.steamId}`, this.next)
					}

				}
			}
		}

	}

}
class MobileExplainer {

	constructor(master, pointer = 0){

		this.master = master
		// this.lskey = `abstractv03_mobileExplainerPointer`
		const next = pointer//localStorage.getItem(this.lskey)

		if (+next === -1){
			this.finished = true
		} else {
			this.next = +next
		}

		this.stuff = [

			{	//Didn't press out a cube
				showIf: (m,t)=>(t > 27000),
				hideIf: (m,t)=>document.querySelector(`.hintInfo`),
				// url: `url("img/mex/001.png")`,
				getAttractor: _=>this.master.pumps.values().next().value
			},
			{	//Hint info
				showIf: (m,t)=>document.querySelector(`.hintInfo`),
				hideIf: (m,t)=>document.querySelector(`.hint_info_vessel`),
				// url: `url("img/mex/001.png")`,
				getAttractor: _=>document.querySelector(`.hintInfo`)
			},
			{	//Didn't break out a cube
				showIf: (m,t)=>{
					// if (t < 10000 || !m.entitiesInGame.cube) return false
					if (m.resources[0]) return true
					for (let i = 0; i < m.stuff.length; i++){
						if (m.stuff[i] instanceof Cube && m.stuff[i].state === 2) return true
					}
				},
				hideIf: (m,t)=>(m.resources[0] > 250),
				// url: `url("img/mex/002.png")`
				getAttractor: _=>{
					for (let i = this.master.stuff.length - 1; i >=0; i--){
						if (this.master.stuff[i] instanceof Cube && this.master.stuff[i].state === 2) return this.master.stuff[i]
					}
					return null
				}
			},
			{	//Store
				showIf: (m,t)=>m.resources[0] >= 512,
				hideIf: (m,t)=>document.querySelector(`.mobileToggle`).classList.contains(`active`),
				// url: `url("img/mex/002.png")`
				getAttractor: _=> document.querySelector(`.mobileToggle`)
			},
			{	//Placing destabilizer
				showIf: (m,t)=>m.itemInHand instanceof Destabilizer,
				hideIf: (m,t)=>m.entitiesInGame.destabilizer >= 1,
				getAttractor: _=> {return {position: [0,2]}}
			},
			{	//Misclick
				showIf: (m,t)=>{
					if (m.hoveredEntity) return false
					if (!m.hoveredCell) return false
					const uv = m.hoveredCell
					if (m.stuffMap[`u${uv[0]+1}v${uv[1]+1}`] instanceof Cube || m.stuffMap[`u${uv[0]}v${uv[1]+1}`] instanceof Cube || m.stuffMap[`u${uv[0]+1}v${uv[1]}`] instanceof Cube) {
						m.temp_misclicked = m.stuffMap[`u${uv[0]+1}v${uv[1]+1}`] instanceof Cube ? m.stuffMap[`u${uv[0]+1}v${uv[1]+1}`] : m.stuffMap[`u${uv[0]}v${uv[1]+1}`] instanceof Cube ? m.stuffMap[`u${uv[0]}v${uv[1]+1}`] : m.stuffMap[`u${uv[0]+1}v${uv[1]}`] instanceof Cube ? m.stuffMap[`u${uv[0]+1}v${uv[1]}`] : false
						return true
					}
				},
				hideIf: (m,t)=>this.master.temp_misclicked && this.master.temp_misclicked.broken === 1,
				getAttractor: _=> {
					return this.master.temp_misclicked
				}
			},
			{	//Didn't disassemble anything
				showIf: (m,t)=>(m.resources[2] > 0),
				hideIf: (m,t)=>(m.resources[2] > 0 && m.pressedMobileDisassemble),
				// url: `url("img/mex/003.png")`
				getAttractor: _=>document.querySelector(`.mobileEraser`)
			},
			{	//Didn't press +1 in machine tooltip
				showIf: (m,t)=>m.entitiesInGame.mega2 > 0 && !!document.querySelector(`.q_mobile`),
				hideIf: (m,t)=>m.pressedQOnMachine,
				// url: `url("img/mex/004.png")`
				getAttractor: _=>document.querySelector(`.q_mobile`)
			},
			{	//Waited to break a green cube
				showIf: (m,t)=>this.master.firstHellgem && (performance.now() - this.master.firstHellgem.timestamp > 10000),
				hideIf: (m,t)=>m.resources[4] > 0,
				getAttractor: _=>this.master.firstHellgem.entity
			},
			{	//Didn't relocate anything
				showIf: (m,t)=>m.entitiesInGame.mega3 > 0,
				hideIf: (m,t)=>m.transportedEntity,
				getAttractor: _=> document.querySelector(`.mobileRelocator`)
				// url: `url("img/mex/005.png")`
			}
		]

		// let a = game.addEntity(`cube`, game.hoveredCell, {resources: new Array(64).fill(4)})
		// a.accept(1e3)

		this.state = 0 //0 not shown, 1 is shown
		this.timer = 0

		this.element = document.createElement(`div`)
		this.element.classList.add(`explainer`)
		document.body.append(this.element)

	}

	hideAndGoNext(){
		this.next++
		this.state = 0
		this.timer = 0
		this.element.classList.remove(`galavant`)
		delete this.master.attractor

		if (!this.stuff[this.next]){
			setTimeout(_=>{this.element.remove()}, 1000)
			this.finished = true
			// this.savePermanents()
			// localStorage.setItem(this.lskey, -1)
		} else {
			// this.savePermanents()
			// localStorage.setItem(this.lskey, this.next)
		}
		this.master.savePreferences()
	}

	update(dt){


		if (!this.master.splash.isShown && !this.finished){

			const item = this.stuff[this.next]
			if (!item) return

			if (item.hideIf(this.master, this.timer)) {
				this.hideAndGoNext()
				return
			}

			if (!this.state){
				this.timer += dt

				if (item.showIf(this.master, this.timer)){

					if (item.url){
						this.element.style.backgroundImage = item.url
						this.timer = 0
						this.state = 1
						this.element.classList.add(`galavant`)
					}
					if (item.getAttractor){
						this.master.attractor = item.getAttractor()
					}

				}
			}

			if (this.state) {
				this.timer += dt
				if (item.hideIf(this.master, this.timer)) this.hideAndGoNext()
			}
		}

	}

}

class OrbifoldMenu {

	constructor(master, e){

		this.master = master
		this.e = e

		this.worldXY = [...e.position]
		
		this.vessel = document.createElement(`div`)
		this.vessel.classList.add(`orbVessel`)

		document.body.append(this.vessel)
		this.updatePosition()

		//CARDS
		const collapse = this.createCard(`collapsing`, e)
		this.vessel.append(collapse)

		const expand = this.createCard(`expanding`, e)
		this.vessel.append(expand)

		const morph = this.createCard(`morphing`, e)
		this.vessel.append(morph)

		const malform = this.createCard(`malformed`, e)
		this.vessel.append(malform)

		const oversat = this.createCard(`oversaturated`, e)
		this.vessel.append(oversat)

		const intercal = this.createCard(`intercalating`, e)
		this.vessel.append(intercal)

		let totalUpgrades = 0
		for (let i = 0; i < this.master.orbUpgradeMap.length; i++){
			totalUpgrades += this.master.orbUpgradeMap[i]
		}
		const pendingUpgrades = Math.max(0,this.master.orbUpgrades - totalUpgrades)
		if (pendingUpgrades){

			const up = document.createElement(`div`)
			up.classList.add(`orbUpgrade`)
			up.innerHTML = `${this.master.pronounce(`random`, `orificeUpgrade`)} ${this.master.getRoman(this.e.tier + 1)}`
			this.vessel.append(up)

			up.addEventListener(`click`, e=>{

				const index = this.master.getOrbIndex(this.e)
				if (index === null) {console.log(`This is not supposed to be here`); return}

				if (!this.master.orbUpgradeMap[index]) this.master.orbUpgradeMap[index] = 0
				this.master.orbUpgradeMap[index]++
				this.e.tier++
				this.e.init()
				this.master.closeOrbifolds()

			})

		}

		requestAnimationFrame(_=>{
			collapse.style.left = `-21em`
			collapse.style.top = `13em`
			expand.style.left = `0em`
			expand.style.top = `20em`
			malform.style.left = `21em`
			malform.style.top = `13em`
			morph.style.left = `21em`
			morph.style.top = `-16em`
			oversat.style.left = `-21em`
			oversat.style.top = `-16em`
			intercal.style.left = `0em`
			intercal.style.top = `-20em`
		})

	}

	createCard(name, whitehole){

		const e = this.master.codex.entities[name]
		const exists = this.master.entitiesInGame[name] > 0
		const lowTier = this.master.codex.entities[name].minTier > whitehole.tier

		const card = document.createElement(`div`)
		card.classList.add(`orbCard`)

		if (exists){
			card.classList.add(`empty`)
		} else if (lowTier) {
			card.classList.add(`disabled`)
		}
		// if (type) card.classList.add(type === 1 ? `disabled` : `empty`)

		if (!exists) {

			const imageVessel = document.createElement(`div`)
			imageVessel.classList.add(`orbImage`)
			card.append(imageVessel)

			const image = document.createElement(`img`)
			image.src = `img/shop/${name}.jpg`
			imageVessel.append(image)

			const header = document.createElement(`div`)
			header.classList.add(`orbHeader`)
			header.innerText = this.master.pronounce('entities', name, 'name')
			card.append(header)

			const description = document.createElement(`div`)
			description.classList.add(`orbDescription`)
			description.innerText = this.master.pronounce('entities', name, 'description')
			card.append(description)

			if (lowTier){

				const tier = document.createElement(`div`)
				tier.classList.add(`tier`)
				tier.innerText = `${this.master.pronounce(`random`,`lowTier`)} ${this.master.getRoman(this.master.codex.entities[name].minTier)}`
				card.append(tier)

			} else {

				card.addEventListener(`click`, e=>{
					this.master.clearCell(this.worldXY)
					const entity = this.master.addEntity(name, this.worldXY)
					entity.tier = this.e.tier
					this.master.createCompleteTransaction(this.worldXY)
					this.master.playSound(`complete`)
					this.master.punchScreen(10, 100)
					this.master.closeOrbifolds()
					entity.init()
					this.master.checkMemoryComplex()
				})

			}

		}

		return card

	}

	updatePosition(){

		this.screenXY = this.master.uvToXYUntranslated(this.worldXY)
		this.vessel.style.top = this.screenXY[1] / this.master.pixelRatio + `px`
		this.vessel.style.left = this.screenXY[0] / this.master.pixelRatio + `px`

	}

	close(){
		this.vessel.remove()
	}

}
