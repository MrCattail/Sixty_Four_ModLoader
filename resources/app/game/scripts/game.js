//containment vessel and catalytic refinery price to the power of 2

//zoom
//align store horizontally
//Click a cube and build, not only autoclickers
//Dark sounds surge lightning
//Scroll on disabled items in store
//Не включать замедление при промотке времени
//Не давать заряжать сило пока они не вылезли

//+Store covers controls
//+Label near plus sucks (make Label precise)
//+Speedup after offline
//+Drag on cubes as well
//+Stars in stab hints
//+Close chat on other buttons
//+Remove delete from shop
//+Ending animation + remove ui + centered credits

class VFX {

	constructor(master, payload){

		this.master = master
		this.oncomplete = _=>{}
		this.visibility = payload?.visibility || [1]

	}

	update(dt){

		this.time += dt

		if (this.time >= this.maxEndTime){
			
			this.oncomplete()
			this.terminate = true

		}

	}

	render(){

	}
	

}

class Exhaust extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.time = 0
		this.maxEndTime = 220
		this.uv = payload?.uv || [0,0]
		this.shift = [(Math.random() * 2 - 1) * this.master.unit * .2, (Math.random() * 2 - 1) * this.master.unit * .2]
		this.maxRadius = (.6 + Math.random() * .8) * this.master.unit
		this.color = payload?.color || `#EEE`

	}

	render(){

		if (this.visibility[this.master.plane]){

			const f = (this.time / this.maxEndTime)
			const r1 = f ** .3 * this.maxRadius
			const r2 = Math.max(0, (f - .3333) * 1.3) ** .4 * this.maxRadius
			const p = this.master.uvToXYUntranslated(this.uv)

			const ctx = this.master.ctx

			ctx.fillStyle = this.color

			ctx.beginPath()
			ctx.arc(p[0], p[1], r1, 0, Math.PI * 2)
			// ctx.closePath()

			// ctx.beginPath()
			ctx.arc(p[0], p[1], r2, 0, Math.PI * 2)
			ctx.closePath()

			ctx.fill(`evenodd`)

		}

	}

}

class Ripple extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.time = 0
		this.maxEndTime = 500
		this.uv = payload?.source || [0,0]
		this.maxRadius = 1.5
		this.color = `#F00`

	}

	render(){

		if (this.visibility[this.master.plane]){

			const f = (this.time / this.maxEndTime) ** .5
			const p = this.master.uvToXYUntranslated(this.uv)

			// const dx = .866 * this.master.unit * (1 + this.maxRadius * f)
			// const dy = .5 * this.master.unit * (1 + this.maxRadius * f)
			const u = this.master.unit
			const r = u * (1 + this.maxRadius * f)

			const ctx = this.master.ctx
			ctx.save()
			ctx.translate(p[0], p[1])
			ctx.scale(.866,.5)
			ctx.globalCompositeOperation = `difference`

			const fill = ctx.createRadialGradient(0,0,0,0,0, r)
			fill.addColorStop(.5, `#FFFF`)
			fill.addColorStop(1, `#FFF0`)
			ctx.strokeStyle = fill

			//Grid
			ctx.globalAlpha = 1-f
			ctx.lineWidth = u * .04 * (1-f)
			
			ctx.beginPath()
			ctx.moveTo(-u,-u*2)
			ctx.lineTo(u*2,u)
			ctx.stroke()

			ctx.beginPath()
			ctx.moveTo(-u*2,-u)
			ctx.lineTo(u,u*2)
			ctx.stroke()

			ctx.beginPath()
			ctx.moveTo(-u*2,u)
			ctx.lineTo(u,-u*2)
			ctx.stroke()

			ctx.beginPath()
			ctx.moveTo(-u,u*2)
			ctx.lineTo(u*2,-u)
			ctx.stroke()

			//Ripple
			ctx.strokeStyle = `#FFF3`
			ctx.lineWidth = u * .1 * (1-f)

			// ctx.beginPath()
			// ctx.lineTo(0,-r)
			// ctx.lineTo(r,0)
			// ctx.lineTo(0,r)
			// ctx.lineTo(-r,0)
			// ctx.closePath()
			// ctx.stroke()

			ctx.beginPath()
			ctx.arc(0,0,r,0,Math.PI*2)
			ctx.closePath()
			ctx.stroke()


			ctx.restore()

		}

	}

}

class ResourceExplosion extends VFX {

	constructor(master, payload){

		super(master, payload)

		//payload:
		//resources, source

		const force = (payload?.force || 9) * this.master.unit
		const endRange = [100,600]
		const paths = []
		const resources = []
		const endTimes = []

		let maxEndTime = 0

		for (let i = 0; i < payload.resources.length; i++){

			const max = Math.min(payload.resources[i], this.master.renderLimitOfAKind)
			const rp = payload?.source ? payload.source : this.master.resourceHomes[i]

			for (let j = 0; j < max; j++){

				const d = [force * (Math.random() * 2 - 1), force * (Math.random() * 2 - 1)]

				const curve = new Bezier([[rp[0], rp[1]], [rp[0] + d[0], rp[1] + d[1]],[rp[0] + d[0], rp[1] + d[1]], [rp[0]+d[0], rp[1] + d[1]]])
				const endTime = endRange[0] + Math.random() * [endRange[1] - endRange[0]]
				paths.push(curve)
				resources.push(i)
				endTimes.push(endTime)
				maxEndTime = Math.max(maxEndTime, endTime)
				
			}

		}


		this.resources = resources
		this.paths = paths
		this.endTimes = endTimes
		this.maxEndTime = maxEndTime
		this.time = 0

	}

	render(){

		if (this.visibility[this.master.plane]){

			for (let j = 0; j < this.resources.length; j++){

				// if ((this.resources[j] !== 9 && !this.master.plane) || (this.resources[j] === 9 && this.master.plane === 1)){

					const f = (this.time / this.endTimes[j]) ** .6
					if (f <= 1){
					
						const from = Math.max(0, f - .05)
						const to = Math.min(1, f + .05)
						const q = this.quantities ? this.quantities[j] : 1

						const b = this.paths[j]
						this.master.ctx.strokeStyle = this.master.codex.resources[this.resources[j]].triplet[j%3]
						this.master.ctx.lineCap = `round`
						this.master.ctx.lineWidth = (.5 + (1-f) * .5) * this.master.unit * .04
						this.master.ctx.beginPath()
						const p0 = b.getXY(from)
						this.master.ctx.moveTo(p0[0], p0[1])
						for (let f = from + .02; f < to; f+=.02){
							const p = b.getXY(f)
							this.master.ctx.lineTo(p[0], p[1])
						}
						this.master.ctx.stroke()

					}

				// }
				

			}
		}

	}

}

class ResourceSpark extends VFX {

	constructor(master, payload){

		super(master, payload)

		//payload:
		//resources, source

		const multiplyer = 16
		const force = this.master.unit * 2
		const endRange = [60,300]
		const paths = []
		const resources = []
		const endTimes = []

		let maxEndTime = 0

		for (let i = 0; i < payload.resources.length; i++){

			const max = Math.min(payload.resources[i] * multiplyer, this.master.renderLimitOfAKind)
			const rp = payload?.source ? payload.source : this.master.resourceHomes[i]

			for (let j = 0; j < max; j++){

				const d = [force * (Math.random() * 2 - 1), force * (Math.random() * 2 - 1)]
				const offsetA = [force * (Math.random() * 2 - 1) * .2, force * (Math.random() * 2 - 1) * .2]
				const offsetB = [force * (Math.random() * 2 - 1) * .2, force * (Math.random() * 2 - 1) * .2]

				const curve = new Bezier([
					[rp[0], rp[1]], 
					[rp[0] + offsetA[0], rp[1] + offsetA[0]],
					[rp[0] + d[0] + offsetB[0], rp[1] + d[1] + offsetB[1]], 
					[rp[0] + d[0], rp[1] + d[1]]])
				const endTime = endRange[0] + Math.random() * [endRange[1] - endRange[0]]
				paths.push(curve)
				resources.push(i)
				endTimes.push(endTime)
				maxEndTime = Math.max(maxEndTime, endTime)
				
			}

		}

		this.resources = resources
		this.paths = paths
		this.endTimes = endTimes
		this.maxEndTime = maxEndTime
		this.time = 0
		this.visibility = payload.visibility || [1,0]

	}

	render(){

		if (this.visibility[this.master.plane]){

			for (let j = 0; j < this.resources.length; j++){

				const f = (this.time / this.endTimes[j]) ** .6
				if (f <= 1){
				
					const from = Math.max(0, f - .05)
					const to = Math.min(1, f + .05)
					const q = this.quantities ? this.quantities[j] : 1

					const b = this.paths[j]
					this.master.ctx.strokeStyle = this.master.codex.resources[this.resources[j]].triplet[j%3]
					this.master.ctx.lineCap = `round`
					this.master.ctx.lineWidth = (.5 + (1-f) * .5) * this.master.unit * .04
					this.master.ctx.beginPath()
					const p0 = b.getXY(from)
					this.master.ctx.moveTo(p0[0], p0[1])
					for (let f = from + .02; f < to; f+=.02){
						const p = b.getXY(f)
						this.master.ctx.lineTo(p[0], p[1])
					}
					this.master.ctx.stroke()

				}

			}

		}

	}

}

class ScannerMap extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.radius = 16
		this.radius2 = this.radius ** 2
		this.cells = []
		this.source = payload.source

		for (let dx = -this.radius; dx < this.radius; dx++){
			for (let dy = -this.radius; dy < this.radius; dy++){

				//Collect
				const e = this.master.entityAtCoordinates([dx + this.source[0], dy + this.source[1]])
				if (e){
					e.ondarkhover()//11111111
				}

				const d2 = dx ** 2 + dy ** 2
				if (d2 > this.radius2) continue
				const map = this.master.getResourceNodeValues(dx + this.source[0], dy + this.source[1])
				if (!map.length) continue
				this.cells.push({
					p: [dx + this.source[0], dy + this.source[1]],
					values: map,
					f2: d2/this.radius2
				})

			}
		}

		this.maxEndTime = 20000
		this.time = 0

	}

	update(dt){

		this.time += dt

		if (this.time >= this.maxEndTime){
			
			this.oncomplete()
			this.terminate = true

		}

	}

	render(){

		const ctx = this.master.ctx
		const maxRadius = this.master.unit * .5
		const f = this.time / (this.maxEndTime * .12)
		const opacity = 1 - this.time / this.maxEndTime

		ctx.save()
		ctx.globalAlpha = opacity
		for (let i = 0; i < this.cells.length; i++){

			const xy = this.master.uvToXYUntranslated(this.cells[i].p)
			let rmult = this.cells[i].f2 < f ? 1 : 0
			const edge = Math.abs(f - this.cells[i].f2)
			if (edge < .2) rmult += (.2 - edge) * 5
			const noise = Math.random() * .02

			for (let j = 0; j < this.cells[i].values.length; j++){

				const m = this.cells[i].values[j]
				if (m.rid === 0) continue

				this.master.resourcesSprites[m.rid].scale = .6 * m.v * rmult + noise
				this.master.resourcesSprites[m.rid].renderXY(xy)
				this.master.resourcesSprites[m.rid].scale = .25

			}

		}
		ctx.restore()

	}

}

class Impact extends VFX {

	constructor(master, payload){

		super(master, payload)

		//payload:
		//source, color, visibility
		this.uv = payload.uv || [0,0]
		this.color = payload.color || `#000`

		this.maxEndTime = 200
		this.time = 0

	}

	render(){

		// console.log(`IMPACT: ${this.time}`)
		const f = this.time / this.maxEndTime
		const h = this.master.unit * 32
		const xy = this.master.uvToXYUntranslated(this.uv)
		const ctx = this.master.ctx

		ctx.lineWidth = this.master.unit * (1 - f) ** 4
		ctx.strokeStyle = this.color

		ctx.beginPath()
		ctx.moveTo(xy[0], xy[1])
		ctx.lineTo(xy[0], xy[1] - h)
		ctx.stroke()

	}

}

class CompleteTransaction extends VFX {

	constructor(master, p){

		super(master, {visibility: [1,0]})

		this.time = 0
		this.maxEndTime = 1600
		this.uv = p

		this.branches = []
		for (let i = 0; i < 60; i++){

			this.branches.push({
				offset: Math.random() * 2 - 1,
				weight: Math.random(),
			})

		}

	}

	render() {

		const ff = 1 - this.time / this.maxEndTime
		const f = ff > .8 ? 1 : (ff / .8) ** .5
		const f2 = ff ** 2
		const f3 = f2 < .3 ? 0 : (f2 - .3) / .7
		// const f4 = ff ** 8
		const ctx = this.master.ctx
		const xy = this.master.uvToXYUntranslated(this.uv)
		const u = this.master.unit * 1.2
		const h3 = this.master.h * 3
		const bu = Math.max(.01, u * .6 * f3)

		const grad = ctx.createRadialGradient(xy[0], xy[1], u * f3 + u * f2, xy[0], xy[1], u + u * 4 * f)
		grad.addColorStop(0, `#112f`)
		grad.addColorStop(1, `#f000`)

		ctx.lineCap = `butt`
		ctx.fillStyle = grad
		ctx.globalAlpha = ff > .2 ? 1 : ff ** .2 * 5

		//Base
		ctx.beginPath()
		ctx.arc(xy[0], xy[1], u*6, 0, Math.PI * 2)
		ctx.closePath()
		ctx.fill()

		ctx.fillStyle = ctx.strokeStyle = `#112`
		ctx.lineWidth = bu

		//Ellipse
		ctx.beginPath()
		ctx.ellipse(xy[0], xy[1], u*2 + u*12 * (1-f2), u + u*6 * (1-f2), 0, 0, Math.PI * 2)
		ctx.closePath()
		ctx.stroke()

		//Seal
		const a = f3 ** 2 * .4
		const dia = u * 10
		ctx.save()
		ctx.globalAlpha = ff
		ctx.translate(xy[0], xy[1]-u/2)
		ctx.rotate(a)
		ctx.drawImage(this.master.images[`img/seal_outer.png`], -dia/2, -dia/2, dia, dia)
		ctx.rotate(-a*2)
		ctx.drawImage(this.master.images[`img/seal_inner.png`], -dia/2, -dia/2, dia, dia)
		ctx.restore()

		//Stem
		ctx.fillRect(xy[0] - u * 2 * f3, xy[1]-h3, u * 4 * f3, h3)

		//Branches
		if (f3 > 0) {
			for (let i=0; i < this.branches.length; i++){

				const b = this.branches[i]
				ctx.lineWidth = b.weight * bu

				ctx.beginPath()
				ctx.moveTo(xy[0] + b.offset * u * .5, xy[1])
				ctx.lineTo(xy[0] + b.offset * u * 32, xy[1] - h3)
				ctx.stroke()

			}
		}


		ctx.globalAlpha = 1

		


	}

}

class ResourceTransfer extends VFX {

	constructor(master, payload){

		super(master, payload)

		//payload:
		//force, resources, source, destination, skip analytics

		const force = (payload?.force || 9) * this.master.unit
		const endRange = this.master.resourceTransferType < 2 ? [900,1500] : [100,600]
		const paths = []
		const resources = []
		const endTimes = []
		const quantities = []
		let maxEndTime = 0

		if (this.master.resourceTransferType < 3){

			for (let i = 0; i < payload.resources.length; i++){

				if (payload.resources[i]){

					const max = Math.min(payload.resources[i], this.master.renderLimitOfAKind)
					const rd = payload?.destination ? payload.destination : this.master.resourceHomes[i]
					const rp = payload?.source ? payload.source : this.master.resourceHomes[i]

					for (let j = 0; j < max; j++){

						const curve = new Bezier([
							[rp[0], rp[1]], 
							[rp[0] + force * (Math.random() * 2 - 1), rp[1] + force * (Math.random() * 2 - 1)],
							[rd[0] + force * .1 * (Math.random() * 2 - 1), rd[1] + force * .1 * (Math.random() * 2 - 1)], 
							[rd[0], rd[1]]
						])
						const endTime = endRange[0] + Math.random() * [endRange[1] - endRange[0]]
						paths.push(curve)
						resources.push(i)
						quantities.push(1)
						endTimes.push(endTime)
						maxEndTime = Math.max(maxEndTime, endTime)
						
					}
				}

			}
		} else {
			for (let i = 0; i < payload.resources.length; i++){

				if (payload.resources[i]){

				const rd = payload?.destination ? payload.destination : this.master.resourceHomes[i]
				const rp = payload?.source ? payload.source : this.master.resourceHomes[i]

				const curve = new Bezier([
					[rp[0], rp[1]], 
					[rp[0] + force * (Math.random() * 2 - 1), rp[1] + force * (Math.random() * 2 - 1)],
					[rd[0] + force * (Math.random() * 2 - 1), rd[1] + force * (Math.random() * 2 - 1)],
					[rd[0], rd[1]]
					])
				const endTime = endRange[0] + Math.random() * (endRange[1] - endRange[0])
				paths.push(curve)
				resources.push(i)
				quantities.push(payload.resources[i])
				endTimes.push(endTime)
				maxEndTime = Math.max(maxEndTime, endTime)
					
				}

			}
		}


		this.resources = resources
		this.quantities = quantities
		this.paths = paths
		this.endTimes = endTimes
		this.maxEndTime = endRange[1]//maxEndTime
		// this.completeOffset = endRange[1] - maxEndTime//ttttttt
		this.oncomplete = payload?.f ? payload.f : _=>{this.master.addResourcesFromArray(payload.resources, payload.skip)}
		this.time = 0
		
	}

	render(){

		if (this.visibility[this.master.plane]){

			for (let j = 0; j < this.resources.length; j++){

				
				let f = (this.time / this.endTimes[j]) ** .6
				if (f <= 1){

					if (this.master.resourceTransferType === 0){

						const coords = this.paths[j].getXY(f)
						this.master.drawResourceInScreenCoordinates(this.resources[j], coords)

					} else {
				
						const from = Math.max(0, f - .05)
						const to = Math.min(1, f + .05)
						const q = this.quantities ? this.quantities[j] : 1

						const b = this.paths[j]
						this.master.ctx.strokeStyle = this.master.codex.resources[this.resources[j]].triplet[j%3]
						this.master.ctx.lineCap = `round`
						// this.master.ctx.lineWidth = (.5 + (1-f) * .5) * this.master.pixelRatio * 4 * (this.master.resourceTransferType < 3 ? 1 : .5 + 5 * Math.min(1, q / 256))
						this.master.ctx.lineWidth = (.5 + (1-f) * .5) * this.master.unit * 0.04 * (this.master.resourceTransferType < 3 ? 1 : .5 + 5 * Math.min(1, q / 256))
						this.master.ctx.beginPath()
						const p0 = b.getXY(from)
						this.master.ctx.moveTo(p0[0], p0[1])
						for (let f = from + .02; f < to; f+=.02){
							const p = b.getXY(f)
							this.master.ctx.lineTo(p[0], p[1])
						}
						this.master.ctx.stroke()

					}

				}
				

			}

		}

	}

}

class ChasmTransfer extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.resources = payload.resources
		this.maxEndTime = 200 + Math.random() * 400
		this.path = payload.path
		this.oncomplete = payload?.f ? payload.f : _=>{this.master.addResourcesFromArray(payload.resources)}
		this.time = 0
		this.skipIndex = payload.skipIndex !== false ? payload.skipIndex : false

		this.pathLengths = []
		this.totalPathLength = 0
		for (let i = 1; i < this.path.length; i++){

			const p1 = this.path[i-1]
			const p2 = this.path[i]
			const l = ((p2[0]-p1[0]) ** 2 + (p2[1]-p1[1]) ** 2) ** .5

			this.pathLengths.push(l)
			if (this.skipIndex !== undefined && this.skipIndex === i - 1) continue
			this.totalPathLength += l

		}
		
	}

	getPointAtLength(l){

		if (l <= 0) return [...this.path[0]]
		if (l >= this.totalPathLength) return [...this.path[this.path.length - 1]]

		let remains = l
		for (let i = 0; i < this.pathLengths.length; i++){

			if (this.skipIndex !== undefined && this.skipIndex === i) continue

			if (remains < this.pathLengths[i]){

				const f = remains / this.pathLengths[i]
				const p1 = this.path[i]
				const p2 = this.path[i+1]
				return [p1[0] + (p2[0] - p1[0]) * f, p1[1] + (p2[1] - p1[1]) * f]

			} else {
				remains -= this.pathLengths[i]
			}

		}

	}

	render(){

		if (!this.visibility[this.master.plane] || this.path.length < 2) return

		const ctx = this.master.ctx

		const f = this.time / this.maxEndTime
		const dl = .9
		const beauty = 8
		const step = dl / beauty
		const threshold = 2

		ctx.lineWidth = this.master.unit * .02
		// let layer = 0
		for (let r = 0; r < this.resources.length; r++){

			if (!this.resources[r]) continue

			// layer++
			// const dh = -this.master.pixelRatio * 3.8 * layer
			const deviation = (r - 2.6) * this.master.unit * (.03)

			ctx.strokeStyle = this.master.codex.resources[r].triplet[0]
			
			ctx.beginPath()
			const start = f * this.totalPathLength
			let last = []

			for (let i = 0; i <= beauty; i++){
				
				const l = start - i * step
				const uv = this.getPointAtLength(l)

				// uv[0] += Math.sin(l * 5) * .12
				// uv[1] -= Math.cos(l * 5 + .5) * .12

				let dp = last.length ? Math.max(Math.abs(uv[0] - last[0]), Math.abs(uv[1] - last[1])) : 0
				if (dp > threshold){
					ctx.stroke()
					ctx.beginPath()
				}
				last = uv

				const xy = this.master.uvToXYUntranslated(uv)
				xy[1] -= deviation
				ctx.lineTo(xy[0], xy[1])

			}
			ctx.stroke()
		}

	}

}

class Lightning extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.color = payload.color || `#FFF`
		this.seed = this.master.stats.totalPlayTime + 64

		const force = 4 * this.master.unit
		this.resources = payload.resources
		this.maxEndTime = 100 + Math.random() * 200

		const rd = payload?.destination ? payload.destination : this.master.resourceHomes[i]
		const rp = payload?.source ? payload.source : this.master.resourceHomes[i]
		const curve = new Bezier([
			[rp[0], rp[1]], 
			[rp[0] + force * (Math.random() * 2 - 1), rp[1] + force * (Math.random() * 2 - 1)],
			[rd[0] + force * (Math.random() * 2 - 1), rd[1] + force * (Math.random() * 2 - 1)],
			[rd[0], rd[1]]
			])
		
		this.path = curve
		this.oncomplete = payload?.f ? payload.f : _=>{this.master.addResourcesFromArray(payload.resources)}
		this.time = 0
		
	}

	render(){

		if (this.visibility[this.master.plane]){

			const t = this.time / this.maxEndTime
			const u = this.master.unit

			this.master.ctx.strokeStyle = this.color
			this.master.ctx.lineCap = `round`
			this.master.ctx.lineWidth = (1 - t) * this.master.pixelRatio * 4

			this.master.ctx.beginPath()
			for (let f = 0; f <= 1; f += .01){

				const xy = this.path.getXY(f)
				const affect = 1 - Math.abs(.5 - f) * 2
				const noiseScale = .002
				const timeScale = 8e-5
				const scale = 2

				const xnoise1 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale + this.seed + 64, xy[1] * noiseScale + this.seed + 64, this.master.stats.totalPlayTime * timeScale)) * u * scale * affect
				const ynoise1 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale + this.seed + 64, xy[1] * noiseScale + this.seed + 64, this.master.stats.totalPlayTime * timeScale + 7845) * .5 + .5) * u * scale * affect
				const xnoise2 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale * 10 + this.seed + 64, xy[1] * noiseScale * 10 + this.seed + 64, this.master.stats.totalPlayTime * timeScale * 40)) * u * scale * affect * .05
				const ynoise2 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale * 10 + this.seed + 64, xy[1] * noiseScale * 10 + this.seed + 64, this.master.stats.totalPlayTime * timeScale * 40 + 7845)) * u * scale * affect * .05

				xy[0] += (xnoise1 + xnoise2)
				xy[1] -= 1.6 * (ynoise1 + ynoise2)

				const r1 = (Math.random() * 2 - 1) * this.master.unit * .02
				const r2 = (Math.random() * 2 - 1) * this.master.unit * .02

				this.master.ctx.lineTo(xy[0] + r1, xy[1] + r2)

			}
			this.master.ctx.stroke()

			// this.master.ctx.beginPath()
			// const p0 = this.path.getXY(0)
			// this.master.ctx.moveTo(p0[0], p0[1])
			// for (let f = .05; f <= 1; f+=.05){
			// 	const p = this.path.getXY(f)
			// 	const r1 = (Math.random() * 2 - 1) * this.master.unit * .1
			// 	const r2 = (Math.random() * 2 - 1) * this.master.unit * .1
			// 	this.master.ctx.lineTo(p[0] + r1, p[1] + r2)
			// }
			// this.master.ctx.stroke()

			if (t < .33 && !this.master.chillMode){
				this.master.ctx.save()
				this.master.ctx.globalAlpha = (1 - t*3) * .1
				this.master.ctx.fillStyle = this.color
				this.master.ctx.fillRect(0,0,this.master.w,this.master.h)
				this.master.ctx.restore()
			}

		}

	}

}

class Discharge extends VFX{
	// this.vfx.push(new Discharge(this, {fromA: fromA, fromB: fromB, visibility: visibility, color: color, time: time}))
	constructor(master, payload){

		super(master, payload)

		this.color = payload.color
		this.seed = this.master.stats.totalPlayTime + 64

		this.force = payload.force * this.master.unit

		this.fromA = payload.fromA
		this.fromB = payload.fromB
		this.toA = payload.toA
		this.toB = payload.toB
		// this.forces = [force * (Math.random() * 2 - 1), force * (Math.random() * 2 - 1), force * (Math.random() * 2 - 1), force * (Math.random() * 2 - 1)]

		// const rd = payload?.destination ? payload.destination : this.master.resourceHomes[i]
		// const rp = payload?.source ? payload.source : this.master.resourceHomes[i]
		// const curve = new Bezier([
		// 	[rp[0], rp[1]], 
		// 	[rp[0] + force * (Math.random() * 2 - 1), rp[1] + force * (Math.random() * 2 - 1)],
		// 	[rd[0] + force * (Math.random() * 2 - 1), rd[1] + force * (Math.random() * 2 - 1)],
		// 	[rd[0], rd[1]]
		// 	])
		
		// this.path = curve
		// this.oncomplete = payload?.f ? payload.f : _=>{this.master.addResourcesFromArray(payload.resources)}

		this.maxEndTime = payload.time
		this.time = 0
		
	}

	render(){

		if (this.visibility[this.master.plane]){

			const u = this.master.unit
			const t = this.time / this.maxEndTime
			const rpw = [this.fromA[0] + (this.fromB[0] - this.fromA[0]) * t, this.fromA[1] + (this.fromB[1] - this.fromA[1]) * t]
			const rdw = [this.toA[0] + (this.toB[0] - this.toA[0]) * t, this.toA[1] + (this.toB[1] - this.toA[1]) * t]

			const rp = this.master.uvToXYUntranslated(rpw)
			const rd = this.master.uvToXYUntranslated(rdw)

			this.path = new Bezier([
				[rp[0], rp[1]], 
				[rp[0], rp[1] - this.force],
				[rd[0], rd[1] - this.force],
				[rd[0], rd[1]]
			])

			// this.master.ctx.fillRect(0,0,100,100)

			this.master.ctx.strokeStyle = this.color
			this.master.ctx.lineCap = `round`
			this.master.ctx.lineWidth = (1 - t**4) * this.master.pixelRatio * 4

			this.master.ctx.beginPath()
			for (let f = 0; f <= 1; f += .01){

				const xy = this.path.getXY(f)
				const wxy = this.master.xyToUV(xy)
				const affect = 1 - Math.abs(.5 - f) * 2
				// const noiseScale = .002
				// const timeScale = 8e-5
				// const scale = 2

				// const xnoise1 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale + this.seed + 64, xy[1] * noiseScale + this.seed + 64, this.master.stats.totalPlayTime * timeScale)) * u * scale * affect
				// const ynoise1 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale + this.seed + 64, xy[1] * noiseScale + this.seed + 64, this.master.stats.totalPlayTime * timeScale + 7845) * .5 + .5) * u * scale * affect
				// const xnoise2 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale * 10 + this.seed + 64, xy[1] * noiseScale * 10 + this.seed + 64, this.master.stats.totalPlayTime * timeScale * 40)) * u * scale * affect * .05
				// const ynoise2 = (this.master.resourceNoise.noise3_Classic(xy[0] * noiseScale * 10 + this.seed + 64, xy[1] * noiseScale * 10 + this.seed + 64, this.master.stats.totalPlayTime * timeScale * 40 + 7845)) * u * scale * affect * .05

				// xy[0] += (xnoise1 + xnoise2)
				// xy[1] -= 1.6 * (ynoise1 + ynoise2)

				// const r1 = (Math.random() * 2 - 1) * this.master.unit * .02
				// const r2 = (Math.random() * 2 - 1) * this.master.unit * .02

				// this.master.ctx.lineTo(xy[0] + r1, xy[1] + r2)

				///////

				// const wxy = line.getXY(j)
				// const xy = this.master.uvToXY(wxy)
				// const affect = 1 - Math.abs(.5 - j) * 2
				const noiseScale = .5
				const timeScale = 3e-4
				const scale = 1.6

				const xnoise1 = (this.master.resourceNoise.noise3_Classic(wxy[0] * noiseScale + this.seed * 64 + 64, wxy[1] * noiseScale + this.seed * 64 + 64, this.master.stats.totalPlayTime * timeScale)) * u * scale * affect
				const ynoise1 = (this.master.resourceNoise.noise3_Classic(wxy[0] * noiseScale + this.seed * 64 + 64, wxy[1] * noiseScale + this.seed * 64 + 64, this.master.stats.totalPlayTime * timeScale + 7845) * .5 + .5) * u * scale * affect
				const xnoise2 = (this.master.resourceNoise.noise3_Classic(wxy[0] * noiseScale * 10 + this.seed * 64 + 64, wxy[1] * noiseScale * 10 + this.seed * 64 + 64, this.master.stats.totalPlayTime * timeScale * 40)) * u * scale * affect * .05
				const ynoise2 = (this.master.resourceNoise.noise3_Classic(wxy[0] * noiseScale * 10 + this.seed * 64 + 64, wxy[1] * noiseScale * 10 + this.seed * 64 + 64, this.master.stats.totalPlayTime * timeScale * 40 + 7845)) * u * scale * affect * .05

				xy[0] += (xnoise1 + xnoise2)
				xy[1] -= 1.6 * (ynoise1 + ynoise2)

				this.master.ctx.lineTo(xy[0], xy[1])

			}
			this.master.ctx.stroke()

		}

	}
}

class DarkWave extends VFX {

	constructor(master, payload){

		super(master, payload)

		this.maxEndTime = Math.random() * 500
		this.origin = payload.origin
		this.order = payload.order - 1
		this.visibility = [0,0]
		this.oncomplete = _=>{

			if (this.order <= 0) return
			
			const n = []
			const soi = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
			for (let i = 0; i < soi.length; i++){
				const origin = [this.origin[0] + soi[i][0], this.origin[1] + soi[i][1]]
				const e = this.master.entityAtCoordinates(origin)
				if (e && e.ondarkhover && e.soul === 1){

					e.ondarkhover(this.order)
				}
			}

		}
		this.time = 0
		
	}

}

class Game {

	constructor(canvas, preload){

		this.version = `1.3`
		this.isWindows = navigator.userAgent.indexOf(`Win`) !== -1

		this.canvas = canvas
		this.canvas.addEventListener(`contextmenu`, e=>{
			e.preventDefault()
		})
		this.ctx = this.canvas.getContext(`2d`)

		// Colored sprites back canvas
		this.bcanvas = new OffscreenCanvas(100,100)//document.createElement(`canvas`)
		this.bctx = this.bcanvas.getContext(`2d`)

		this.pixelRatio = devicePixelRatio

		this.languages = [`en`, `ru`, `de`, `ptbr`, `it`, `es`, `fr`, `nl`, `cz`, `pl`, `jp`, `kr`, `sch`, `tch`, `thai`, `hu`, `lv`, `ro`, `no`]

		this.saveStackUpdateNeeded = false
		this.maxSaveSlots = 8
		this.maxSaveStack = 16
		this.saveSlots = []

		this.maxHoles = 6
		this.orbPositions = [[6,6], [-8,2], [2,-8], [-2,8], [8,-2], [-6,-6]]

		this.mobileScreenLimit = 420

		this.translation = [0, 0]
		this.translationMap = [0, 0, 0, 0]

		this.zoomRange = [.3, 2]

		this.translationSpeed = this.pixelRatio
		this.distanceToOrigins = 0

		this.time = {lt: performance.now(), dt: 0, realDt: 0}
		this.renderTime = {lt: performance.now(), dt: 0}
		this.mouse = {
			xy: [0,0],
			sxy: [0,0],
			cursorVisible: true,
			state: 0,
			positionChanged: false,
			lastOffset: [0,0],
			lastTouch: [0,0],
			automate: false,
			maxTimer: 150,
			timer: 150
		}

		this.gamepadButtons = []
		this.globalSoundVolume = .6
		this.chillMode = false
		this.photofobia = false

		this.stuff = []
		this.stuffMap = {}
		this.unlockedEntities = {}
		this.vfx = []
		this.chasmVfx = []
		this.entitiesInGame = {}
		this.plane = 0
		this.bridge = false
		this.maxEntityHeight = 3
		this.selectedCell = false
		this.selectedEntity = false
		this.resourceTransferType = 0
		this.onlyones = {}
		this.eraserType = 0
		this.hellgemChunk = 64
		this.renderLimitOfAKind = 96
		this.clickPower = 1
		this.extractionSpeed = 1
		this.conversionSpeed = 1
		this.currentHint = {
			entity: undefined,
			element: undefined
		}
		this.canPlace = false
		this.needNoHelp = false
		this.music = {
			volume: .5,
			playing: false,
			finishedAt: performance.now(),
			nextIn: 30000 + Math.random() * 1000 * 60 * 5
		}
		this.soundSources = new Set()

		this.hollowSite = false
		this.hollowHardness = 64
		this.hollowEvents = []
		this.darkHollowEvents = []
		this.hollowImage = new Image()
		this.hollowImage.src = `img/hollowEvent.png`

		this.memorycomplexCenter = [-1024, -1024]
		this.memorycomplexRadius = 256
		this.memoryComplexIsVisible = false
		this.currentMemoryComplexStage = 0
		this.unlockedMemoryStages = 0
		this.memoryComplexStages = [
			{
				src: `img/complex_01.jpg`,
				color: `#000`//`#050915`
			},
			{
				src: `img/complex_02.jpg`,
				color: `#232936`
			},
			{
				src: `img/complex_03.jpg`,
				color: `#232936`
			},
			{
				src: `img/complex_04.jpg`,
				color: `#000`,
				beam: true
			}
		]

		this.surgeSpawnTimer = 30000 + Math.random() * 120000

		this.voidsculpture = false
		this.switchedplanes = false

		this.slowdown = {
			state: false,
			timer: 0,
			totalTime: 0,
			multiplyer: .1,
			f: 0,
			cooldown: 0
		}
		this.punch = {
			state: 0,
			offset: 0,
			timer: 0,
			maxTimer: 0,
			maxOffset: 0
		}

		this.initAnalytics()

		this.waypointList = []
		this.activeCubes = new Set()
		this.annihilators = new Set()
		this.annihilationMachines = new Set()
		this.vaults = new Set()
		this.fruits = new Set()
		this.pumps = new Set()
		this.conductors = new Set()
		this.activeConverters = new Set()
		this.stabilizers = new Set()
		this.waypoints2 = new Set()

		this.stats = {
			totalResourcesMined: new Array(10).fill(0),
			absoluteResourcesCount: 0,
			maxDepth: 0,
			timeEvents: 0,
			totalPlayTime: 0,
			totalPlayAndIdleTime: 0,
			totalCubeClicks: 0,
			machinesBuild: 0,
			machinesSold: 0,
			timesTeleported: 0,
			strangeRockPoked: 0,
			darkVisited: 0,
			timeSinceLastDelete: Infinity,
			excavatorWasBuilt: false,
			orbsWerePresent: false,
			gameIsFinished: false
		}

		this.isMobile = false
		this.init(preload)

	}

	async prepareSavedGameData(steamData){

		//Conversion from legacy format
		let preload = steamData
		if (preload && !preload.slots){

			let decoded = this.decodeSave(preload.save)
			if (decoded === 0) decoded = null

			const converted = {
				steamId: preload.steamId, 
				languageId: preload.languageId,
				debug: preload.debug,
				slots: {0: {
					name: `Steam save`,
					note: `steamLegacy`,
					ownerHash: this.hash53(preload.steamId),
					creationTimeStamp: Date.now(),
					lastModified: Date.now(),
					stack: [
						{
							isProtected: false,
							permanents: {
								glory: preload.steamAchievements,
								// globalStats: {
									completions: 0,
									upgrades: 0,
									orbUpgradeMap: [],
								// }
							},
							state: decoded
						}
					]
				}}
			}

			preload = converted
		}

		//Safeguard
		this.preventSaving = steamData?.noSave
		if (this.preventSaving) alert(`Your savegame is safe, but there is a problem with loading it from the cloud. A rare phenomenon really. I strongly recommend closing the game and starting it again in a minute or so. In any case saving won't work until then. If this problem persists, text me on discord. —Yesname`)

		//Let's go
		this.steamId = preload?.steamId || ``
		this.preferences = this.getPreferences()
		this.currentSlotId = this.preferences.currentSlotId !== undefined ? this.preferences.currentSlotId : 0

		//DB
		this.localDatabase = await this.getDatabase()

		//Get the newest or fallback
		const localIds = await this.getSlotList()
		const cloudIds = preload?.slots ? Object.keys(preload.slots).map(Number) : []
		const slotIds = new Set([...localIds, ...cloudIds])

		if (slotIds.size){
			for (const id of slotIds){
				const ldata = await this.readFromSlot(id)
				const cdata = preload?.slots?.[id]

				let data = ldata
				let localWriteNeeded = false
				if (!ldata){
					data = cdata
					localWriteNeeded = true
				} else if (cdata && cdata.lastModified >= ldata.lastModified){
					data = cdata
					localWriteNeeded = true
				}

				if (!data) continue

				this.saveSlots[id] = data
				if (localWriteNeeded && !this.preventSaving){
					await this.writeToSlot(data, id)
				}

			}
		} else {
			//Fallback
			const old = localStorage.getItem(`abstractv03${this.steamId}`)
			this.saveSlots[0] = {
				name: false,
				ownerHash: this.hash53(this.steamId),
				creationTimeStamp: Date.now(),
				stack: [{
					isProtected: false,
					state: old ? this.decodeSave(old) : null,
					permanents: this.fallbackAssemblePermanents()
				}],
				lastModified: Date.now()
				
			}
			if (!this.preventSaving) await this.writeToSlot(this.saveSlots[0], 0)
		}

		//Select current slot
		if (!this.saveSlots[this.currentSlotId]){
			this.currentSlotId = 0
		}

		if (this.saveSlots[this.currentSlotId].ownerHash !== this.hash53(this.steamId)){
			this.preventGlory = true
			console.log(`Achievements disabled`)
		}
		
	}

	getDatabase() {
	    return new Promise((resolve, reject) => {
	        const request = indexedDB.open(`sixtyfour_warehouse`, 1)
	        request.onupgradeneeded = _=> {
	            const db = request.result
	            if (!db.objectStoreNames.contains(`charps_memory_slots`)) {
	                db.createObjectStore(`charps_memory_slots`)
	            }
	        }

	        request.onsuccess = _=> resolve(request.result)
	        request.onerror = _=> reject(request.error)
	    })
	}
	async writeToSlot(data, slot){

		return new Promise((resolve, reject) => {
			const tx = this.localDatabase.transaction(`charps_memory_slots`, `readwrite`)
			tx.objectStore(`charps_memory_slots`).put(data, [this.steamId, slot])
			tx.oncomplete = resolve
			tx.onerror = _=> reject(tx.error)
		})

		// const cloudPromise = this.spaceport?.invoke ? this.spaceport.invoke('store', this.saveSlots) : Promise.resolve(false)
		// const localPromise = new Promise((resolve, reject) => {
		// 	const tx = this.localDatabase.transaction(`charps_memory_slots`, `readwrite`)
		// 	tx.objectStore(`charps_memory_slots`).put(data, [this.steamId, slot])
		// 	tx.oncomplete = resolve
		// 	tx.onerror = _=> reject(tx.error)
		// })

		// const [saved] = await Promise.all([
	    //     cloudPromise,
	    //     localPromise
	    // ])

	    // return saved

	}
	readFromSlot(slot) {
		return new Promise((resolve, reject) => {
			const tx = this.localDatabase.transaction(`charps_memory_slots`, `readonly`)
			const store = tx.objectStore(`charps_memory_slots`)
			const request = store.get([this.steamId, slot])
			request.onsuccess = _=> resolve(request.result)
			request.onerror = _=> reject(request.error)
		})
	}
	deleteSlot(slot){
		return new Promise((resolve, reject) => {
			const tx = this.localDatabase.transaction(`charps_memory_slots`, `readwrite`)
			tx.objectStore(`charps_memory_slots`).delete([this.steamId, slot])
			tx.oncomplete = _=> resolve()
			tx.onerror = _=> reject(tx.error)
		})
	}
	getSlotList() {
		return new Promise((resolve, reject) => {
			const tx = this.localDatabase.transaction(`charps_memory_slots`, `readonly`)
			const store = tx.objectStore(`charps_memory_slots`)
			const range = IDBKeyRange.bound(
	            [this.steamId, 0],
	            [this.steamId, Number.MAX_SAFE_INTEGER]
	        )
	        const request = store.getAllKeys(range)
			request.onsuccess = _=> resolve(request.result.map(key => key[1]))
			request.onerror = _=> reject(request.error)
		})
	}
	shiftSlots(slotId) {
	    return new Promise((resolve, reject) => {

	        const tx = this.localDatabase.transaction(`charps_memory_slots`,`readwrite`)
	        const store = tx.objectStore(`charps_memory_slots`)
	        const lastSlotId = this.saveSlots.length - 1

	        for (let id = slotId; id < lastSlotId; id++) {
	            store.put(this.saveSlots[id + 1], [this.steamId, id])
	        }

	        store.delete([this.steamId, lastSlotId])

	        tx.oncomplete = () => resolve()
	        tx.onerror = () => reject(tx.error)
	        tx.onabort = () => reject(tx.error)
	    })
	}
	async wipeSlot(slotId){

		if (slotId === this.currentSlotId || !this.saveSlots[slotId]) return false

	    await this.shiftSlots(slotId)
	    this.saveSlots.splice(slotId, 1)

	    if (this.currentSlotId > slotId) {
	        this.currentSlotId--
	        this.savePreferences()
	    }

	    if (this.spaceport?.invoke) {
	        await this.spaceport.invoke(`store`, this.saveSlots)
	    }

	    return true

	}

	async init(preload){

		preload = await window.ModLoader?.stage(`beforeGamePrepare`, this, preload) ?? preload
		await this.prepareSavedGameData(preload)
		
		if (this.isMobile){
			await this.loadScriptsMobile()
			await this.loadStyle(`cascade_mobile.css`)
			this.touchMode = 0
		} else {
			await window.ModLoader?.stage(`beforeVanillaScripts`, this)
			await this.loadScripts()
			await window.ModLoader?.stage(`afterVanillaScripts`, this)
			await this.loadStyle(`cascade.css`)
		}

        const vanillaCodex = abstract_getCodex()
        this.codex = window.ModLoader?.applyData(vanillaCodex, this) || vanillaCodex
        this.images = await this.preloadImages()
		console.log(`Assets loaded...`)
		
		const slot = this.saveSlots[this.currentSlotId]
		const permanents = slot.stack[0].permanents

		// WIP: ABSOLUTES
		this.absolutes = this.getAbsolutes()

		this.resourceNoise = new OpenSimplex2S(64)
		this.hasSteam = this.steamId ? true : false

		this.languageId = this.preferences.languageId
		if (this.languageId === null) this.languageId = (preload && preload.languageId !== null) ? preload.languageId : 0
		// if (preload && preload.languageId !== null) this.languageId = preload.languageId
        this.languages = window.ModLoader?.applyLanguages(this.languages) || this.languages
        if (!this.languages[this.languageId]) this.languageId = 0
        this.language = this.languages[this.languageId]

		this.isMute = this.preferences.mute
		this.memorycomplex = permanents.memorycomplex
		this.memoryBuffer = (this.memorycomplex && permanents.memory) ? permanents.memory : []

		// Local fallback (prod don't need it)
		this.unlockedMemoryStages = permanents.unlockedMemoryStages || 0
		this.currentMemoryComplexStage = permanents.currentMemoryComplexStage || 0
		this.completions = permanents.globalStats ? permanents.globalStats.completions : permanents.completions
		this.orbUpgrades = permanents.globalStats ? permanents.globalStats.upgrades : permanents.upgrades
		this.orbUpgradeMap = permanents.globalStats ? permanents.globalStats.orbUpgradeMap : permanents.orbUpgradeMap
		this.currentOrbPositions = (this.memorycomplex && !slot.stack[0].state) ? (permanents.lastOrbPositions ?? new Array(6).fill(false)) : new Array(6).fill(false) //Will init with orbifolds
		const zoom = this.preferences.zoom
		this.zoom = (zoom >= this.zoomRange[0] && zoom <= this.zoomRange[1]) ? zoom : 1

		try {
			this.spaceport = require(`electron`).ipcRenderer
		} catch(e){
			this.spaceport = {send:_=>false, isPlaceholder: true}
		}
		this.initAlfa()
	
        const vanillaWords = abstract_getWords()
        const words = window.ModLoader?.applyWords(vanillaWords, this) || vanillaWords
        if (!words[this.language]) {
            this.languageId = 0
            this.language = this.languages[this.languageId] || `en`
        }
        this.words = words[this.language]
        this.words_en = words.en
		this.initResources()
		this.updateMemoryComplexUI()

		this.setCommonListeners()
		if (this.isMobile){
			this.initScreenSizeMobile()
			this.store = new MobileStoreVersion(document.querySelector(`.store`), this)
			this.explainer = new MobileExplainer(this, this.preferences.helpIsNeeded)
			this.setListenersMobile() // setListenersTouch
		} else {
			this.initScreenSize()
			this.store = new DesktopStoreVersion(document.querySelector(`.store`), this)
			this.explainer = new DesktopExplainer(this, this.preferences.helpIsNeeded)
			this.setListenersDesktop()
			if (!this.hasSteam) this.showSteamWarning()
		}

		this.splash = new Splash(this)
		this.messenger = new Messenger(this)
		this.achiever = new Achiever(this)
		this.achiever.setState(preload?.steamAchievements ?? permanents.glory ?? [])
		
		this.poleSprite = new Sprite({
			master: this,
			src: `img/pole.png`,
			frames: [[0,0,128,192]],
			origins: [63,190],
			scale: 1,
			intervals: 100
		})

		this.updateLoop()
		this.clock = new Worker(`scripts/clock.js`)
		this.clock.addEventListener(`message`, m=>{
			this.updateLoop()
		})
		this.renderloop()
		setTimeout( _=>this.saveLoop(), 10000)
		setTimeout( _=>this.backupLoop(), 240000)

		this.splash.show()

		//LOADING THE GAME
		if (slot.stack[0].state){
			const success = this.loadSave(slot.stack[0].state)
			if (!success) this.prepopulate()
		} else {
			this.prepopulate()
		}

		this.initOrbifolds()

		if (this.preferences.photofobia) this.togglePhotofobia()
		if (this.preferences.chill) this.toggleChill()
		if (!this.chillMode) this.splash.fireNotification(this.pronounce('splash', 'flashbang') || ``, this.splash.chill, true, true, 32000)

		this.updateGlobalVolume(this.preferences.globalSoundVolume)

		this.updateMouseData(this.w2/2, this.h2/2)
		this.processMove()

		//Memory complex check
		if (!slot.stack[0].state){
			if (this.completions > 16 && this.unlockedMemoryStages < 2){
				this.unlockedMemoryStages = 2
				this.triggerMemory(1)
				this.codex.messages.postEvents[6].condition = _=>true
			} else if (this.completions > 32 && this.unlockedMemoryStages < 3){
				this.unlockedMemoryStages = 3
				this.triggerMemory(2)
				this.codex.messages.postEvents[7].condition = _=>true
			} else if (this.completions > 64 && this.unlockedMemoryStages < 4){
				this.unlockedMemoryStages = 4
				this.triggerMemory(3)
				this.codex.messages.postEvents[8].condition = _=>true
			}
		}

        await window.ModLoader?.stage(`afterGameInit`, this)
		//Pinhole test

		if (this.onlyones.pinhole){
			// console.log(this.onlyones)
			this.quickFinish()
		}
	}

	// async initMobile(preload){

		//Only mobile-specific
		//Keep it commented until mobile is ok

		// this.isMobile = true
		// this.touchMode = 0 // 1 delete, 2 q, 3 e
		// this.spaceport = {send:_=>false, isPlaceholder: true}
		// this.initScreenSizeMobile()

		//OLD

		// await this.loadScriptsMobile()
		// await this.loadStyle(`cascade_mobile.css`)

		// this.resourceNoise = new OpenSimplex2S(64)

		// this.isMobile = true

		// this.touchMode = 0 // 1 delete, 2 q, 3 e

		// this.spaceport = {send:_=>false, isPlaceholder: true}
		// this.initAlfa()

		// this.codex = abstract_getCodex()
		// this.images = this.preloadImages()
		// const words = abstract_getWords()
		// this.words = words[this.language]
		// this.words_en = words.en
		// this.initResources()
		// this.initScreenSizeMobile()
		
		// const shopElement = document.querySelector(`.shop`)
		// this.shop = new Shop(shopElement, this)
		// // this.store = new Shop(shopElement, this) //WIP: transition to store
		// this.splash = new Splash(this)
		// this.messenger = new Messenger(this)
		// // this.eternalGlory = preload?.steamAchievements ?? permanents.glory
		// this.achiever = new Achiever(this)
		// this.achiever.setState(preload?.steamAchievements ?? permanents.glory)
		// this.explainer = new MobileExplainer(this, this.preferences.mobileExplainerPointer)

		// this.setListenersTouch()

		// this.poleSprite = new Sprite({
		// 	master: this,
		// 	src: `img/pole.png`,
		// 	frames: [[0,0,128,192]],
		// 	origins: [63,190],
		// 	scale: 1,
		// 	intervals: 100
		// })

		// this.updateLoop()
		// this.clock = new Worker(`scripts/clock.js`)
		// this.clock.addEventListener(`message`, m=>{
		// 	this.updateLoop()
		// })
		// this.renderloop()
		// setTimeout( _=>this.saveLoop(), 10000)
		// setTimeout( _=>this.backupLoop(), 240000)

		// this.splash.show()

		// this.initialLoad(preload?.save)
		
		// if (this.preferences.photofobia) this.togglePhotofobia()
		// if (this.preferences.chill) this.toggleChill()
		// if (!this.chillMode) this.splash.fireWarningDisclaimer()

		// this.updateGlobalVolume(this.preferences.globalSoundVolume)

		// this.updateMouseData(this.w2/2, this.h2/2)
		// this.processMousemove2()
	// }

	initOrbifolds(){

		const totalHoles = Math.min(this.maxHoles, this.completions - this.orbUpgrades)

		for (let i = 0; i < totalHoles; i++){
			const e = this.entityAtCoordinates(this.orbPositions[i])
			if (e && this.codex.entities[e.name].type !== `complete`) console.log(`That shouldn't be here...`)
			if (!e){
				
				if (this.currentOrbPositions[i]){

					const orb = this.addEntity(this.currentOrbPositions[i], this.orbPositions[i])
					orb.tier = 1 + (this.orbUpgradeMap[i] ?? 0)
					orb.init()

				} else {

					const hole = this.addEntity(`whitehole`, this.orbPositions[i])
					hole.index = i
					hole.tier = 1 + (this.orbUpgradeMap[i] ?? 0)
					hole.init()

				}
			}
		}

	}

	getOrbIndex(e){

		for (let i = 0; i < this.orbPositions.length; i++){

			const p = this.orbPositions[i]
			if (e.position[0] === p[0] && e.position[1] === p[1]) return i

		}

		return null

	}

	checkMemoryComplex(){

		if (this.memorycomplex) return

		let isComplete = true
		for (let i = 0; i < 6; i++){
			if (!this.currentOrbPositions[i]){
				isComplete = false
				break
			}
		}

		if (isComplete && !this.memorycomplex){

			console.log(`Memory complex`)
			this.memorycomplex = true
			this.unlockedMemoryStages = 1
			this.triggerMemory(0)
			this.codex.messages.postEvents[5].condition = _=>true

		}

	}

	triggerMemory(id){

		this.switchToMemory(id)

		const origin = [(this.memorycomplexCenter[0] * 0.866 - this.memorycomplexCenter[1] * .866) * this.unit / this.zoom, (this.memorycomplexCenter[0] * .5 + this.memorycomplexCenter[1] * .5) * this.unit / this.zoom]
		this.translation[0] = origin[0]
		this.translation[1] = origin[1]

		this.processMove()
		this.updateGlobalPositioning()

		this.zoom = 1
			

	}

	switchToMemory(id){

		if (id !== this.currentMemoryComplexStage) delete this.memoryComplexImage
		this.currentMemoryComplexStage = id
		this.updateMemoryComplexUI()


	}

	updateMemoryComplexUI(){

		if (this.memoryComplexUI) this.memoryComplexUI.remove()

		const ui = this.memoryComplexUI = document.createElement(`div`)
		ui.classList.add(`memoryComplexVessel`)

		const selector = document.createElement(`div`)
		selector.classList.add(`memorySelectors`)

		for (let i = 0; i < 4; i++){
			const button = document.createElement(`div`)
			button.classList.add(`memorySwitch`)
			button.innerText = i + 1

			let shouldWork = true
			if (i === this.currentMemoryComplexStage) {button.classList.add(`selected`); shouldWork = false}
			if (i >= this.unlockedMemoryStages) {button.classList.add(`disabled`); shouldWork = false}
			selector.append(button)

			if (shouldWork){
				button.addEventListener(`click`, _=>{
					this.switchToMemory(i)
					this.updateGlobalPositioning()
				})
			}


		}

		ui.append(selector)

		const header = document.createElement(`div`)
		header.classList.add(`memoryHeader`)
		header.innerText = this.pronounce(`memories`, `memory${this.currentMemoryComplexStage}`, `header`)
		ui.append(header)

		const lore = document.createElement(`div`)
		lore.classList.add(`memoryLore`)
		lore.innerHTML = this.pronounce(`memories`, `memory${this.currentMemoryComplexStage}`, `lore`)
		ui.append(lore)

		document.body.append(ui)

	}

	async loadScripts(){

		return new Promise(async (resolve, reject) =>{

			const scripts = [`scripts/bezier.js`, `scripts/ui.js`, `scripts/sprites.js`, `scripts/stuff.js`, `scripts/words.js`, `scripts/codex.js`, `scripts/osimp.js`]
			let counter = scripts.length

			for (let i = 0; i < counter; i++){
				await this.loadScript(scripts[i])
			}

			console.log(`Desktop scripts are ready, starting the game...`)
			resolve()

		})
	}

	async loadScriptsMobile(){

		return new Promise(async (resolve, reject) =>{

			const scripts = [`scripts/bezier.js`, `scripts/ui.js`, `scripts/sprites.js`, `scripts/stuff.js`, `scripts/words_mobile.js`, `scripts/codex.js`, `scripts/osimp.js`]
			let counter = scripts.length

			for (let i = 0; i < counter; i++){
				await this.loadScript(scripts[i])
			}

			console.log(`Mobile scripts are ready, starting the game...`)
			resolve()

		})
	}

	async loadScript(url){

		return new Promise((resolve, reject) => {
	        const script = document.createElement(`script`)
		    script.src = url
		    script.type = `text/javascript`
		    script.onload = _ => {
		        console.log(`Loaded ${url}`)
		        resolve()
		    }
		    script.onerror = _ => {
		        reject(new Error(`Failed to load script: ${url}`))
		    }

		    document.head.appendChild(script)
	    })
	}

	async loadStyle(url){
		return new Promise((resolve, reject) => {
	        const link = document.createElement(`link`)
		    link.href = url
		    link.type = `text/css`
		    link.rel = `stylesheet`
		    link.onload = _ => {
		        console.log(`Loaded css ${url}`)
		        resolve()
		    }
		    link.onerror = _ => {
		        reject(new Error(`Failed to load css: ${url}`))
		    }

		    document.head.appendChild(link)
	    })
	}

	// getPermanents(){

	// 	// return this.preparedData.permanents

	// 	let json = localStorage.getItem(`abstractv03_permanents${this.steamId}`)
	// 	if (!json) json = this.fallbackAssemblePermanents()
	// 	return JSON.parse(json)

	// }

	getPreferences(){

		let json = localStorage.getItem(`abstractv03_preferences${this.steamId}`)
		return json ? JSON.parse(json) : this.fallbackGetPreferences()

	}

	fallbackGetPreferences(){
		
		const mute = localStorage.getItem(`abstractv03_mute${this.steamId}`)
		const languageId = localStorage.getItem(`abstractv03_language${this.steamId}`)
		const photofobia = localStorage.getItem(`abstractv03_photofobia${this.steamId}`)
		const chill = localStorage.getItem(`abstractv03_chill${this.steamId}`)
		const zoom = localStorage.getItem(`abstractv03_zoom${this.steamId}`)
		const globalSoundVolume = localStorage.getItem(`abstractv03_globalSoundVolume${this.steamId}`)
		const helpIsNeeded = localStorage.getItem(`abstractv03_helpIsNeeded${this.steamId}`)
		const mobileExplainerPointer = localStorage.getItem(`abstractv03_mobileExplainerPointer`)

		return {
			mute: mute === `true`,
			photofobia: photofobia === `true`,
			chill: chill === `true`,
			languageId: languageId === null ? null : +languageId,
			zoom: zoom === null ? 1 : +zoom,
			globalSoundVolume: globalSoundVolume === null ? .6 : +globalSoundVolume,
			helpIsNeeded: helpIsNeeded === null ? true : +helpIsNeeded,
			mobileExplainerPointer: mobileExplainerPointer === null ? 0 : +mobileExplainerPointer
		}
		
	}

	fallbackAssemblePermanents(){

		const achievements = localStorage.getItem(`abstractv03_glory${this.steamId}`)

		const permanents = {
			glory: achievements ? JSON.parse(achievements) : null,
			// globalStats: {
				completions: 0,
				upgrades: 0,
				orbUpgradeMap: [],
			// }
		}

		return permanents

	}


	assemblePermanents(){
		return {
			glory: this.achiever.fired,
			// globalStats: {
				completions: this.completions,
				upgrades: this.orbUpgrades,
				orbUpgradeMap: this.orbUpgradeMap,
			// },
			memorycomplex: this.memorycomplex,
			memory: this.saveSlots[this.currentSlotId].stack[0]?.permanents.memory, //Just forward
			lastOrbPositions: this.currentOrbPositions,
			unlockedMemoryStages: this.unlockedMemoryStages || 0,
			currentMemoryComplexStage: this.currentMemoryComplexStage || 0
		}
	}

	assemblePreferences(){
		return {
			mute: this.splash.gameIsMute,
			languageId: this.languageId,
			currentSlotId: this.currentSlotId,
			photofobia: this.photofobia ?? false,
			chill: this.chillMode,
			zoom: this.zoom,
			globalSoundVolume: this.globalSoundVolume ** .5,
			helpIsNeeded: this.explainer.finished ? -1 : this.explainer.next,
			mobileExplainerPointer: this.explainer.finished ? -1 : this.explainer.next
		}
	}

	savePermanents(withLayout){

		const permanents = this.assemblePermanents()
		if (withLayout) {
			permanents.memory = this.assembleMemory()
			permanents.lastOrbPositions = this.currentOrbPositions
		}
		localStorage.setItem(`abstractv03_permanents${this.steamId}`, JSON.stringify(permanents))

	}

	savePreferences(){

		const preferences = this.assemblePreferences()
		localStorage.setItem(`abstractv03_preferences${this.steamId}`, JSON.stringify(preferences))

	}

	//Mobile absolutes

	getAbsolutes(){

		//WIP: move to backend
		const json = localStorage.getItem(`sixtyfourabsoluteslocal`)
		return json ? JSON.parse(json) : {
			enabled: false,
			alfa: 0,
			bought: 0,
			found: 0,
			spent: 0
		}

	}

	saveAbsolutes(){

		//WIP: move to backend
		localStorage.setItem(`sixtyfourabsoluteslocal`, JSON.stringify(this.absolutes))

	}

	spendAlfa(v){
		if (this.absolutes.alfa < v) return false
		this.absolutes.alfa -= v
		this.absolutes.spent += v
		this.saveAbsolutes()
		return true
	}

	buyAlfa(v){
		this.absolutes.alfa += v
		this.absolutes.bought += v
		this.saveAbsolutes()
	}

	findAlfa(v){
		this.absolutes.enabled = true
		this.absolutes.alfa += v
		this.absolutes.found += v
		this.saveAbsolutes()
	}

	initAlfa(){

		this.alfa = {
			currentEvents: [],
			currentNodes: [],
			spawnIntervalRange: [300000, 2400000],
			nodeProperties: {
				radius: 1,
				duration: 16000,
				spiralCount: 64,
				spiralAngle: 0.7638888889 * Math.PI,
				spiralStep: .04
			},
			prices: {
				haste: 6,
				insta: 6,
				oiled: 6,
				fill: 10,
				convert: 6
			}
		}
		this.alfa.spawnTimer = this.alfa.spawnIntervalRange[0] + (this.alfa.spawnIntervalRange[1] - this.alfa.spawnIntervalRange[0]) * Math.random()

		this.alfa.startEvent = label => {

			const events = {
				haste: {
					id: `haste`,
					onstart: _=>{console.log(`Haste event started`)},
					onupdate: _=>{this.time.dt *= 2},
					onfinish: _=>{console.log(`Haste event finished`)},
					remains: 600000
				},
				insta: {
					id: `insta`,
					onstart: _=>{
						console.log(`Insta event started`)
						this.clickPower = 1e3
					},
					onfinish: _=>{
						this.clickPower = 1
						console.log(`Insta event finished`)
					},
					remains: 300000
				},
				oiled: {
					id: `oiled`,
					onstart: _=>{
						console.log(`Oiled event started`)
						this.extractionSpeed = 10
					},
					onfinish: _=>{
						this.extractionSpeed = 1
						console.log(`Oiled event finished`)
					},
					remains: 300000
				},
				fill: {
					id: `fill`,
					onupdate: _=>{
						if (this.unfilledEntities.length){
							const i = Math.floor(Math.random() * this.unfilledEntities.length)
							const e = this.unfilledEntities[i]
							if (e.refill) e.refill()
						}
					},
					remains: 3600000
				},
				convert: {
					id: `convert`,
					onstart: _=>{
						this.conversionSpeed = 8
					},
					onfinish: _=>{
						this.conversionSpeed = 1
					},
					remains: 1200000
				}
			}

			const event = events[label]
			const instance = {...event}
			
			if (instance.onstart) instance.onstart()
			this.alfa.currentEvents.push(instance)
			this.store.pushAlfaEvent(instance)

			return instance
		}
		this.alfa.activate = label => {
			//Check for current
			for (let i = 0; i < this.alfa.currentEvents.length; i++){
				if (this.alfa.currentEvents[i].id === label) return null
			}

			const price = this.alfa.prices[label]
			const good = this.spendAlfa(price)
			let e = null
			if (good) e = this.alfa.startEvent(label); else console.log(`you broke`)
			return e
		}
	}

	updateAlfa(dt){

		if (!this.alfa || this.pinhole) return
		for (let i = 0; i < this.alfa.currentEvents.length; i++){
			const e = this.alfa.currentEvents[i]
			if (e.onupdate) e.onupdate(dt)

			e.remains -= dt
			if (e.remains <= 0){
				if (e.onfinish) e.onfinish()
				this.alfa.currentEvents.splice(i,1)
				i--
			}

		}

	}

	pronounce(...props){

		if (this.language === `en`){
			return this.getWordBranch(props, true)
		} else {
			let noten = this.getWordBranch(props)
			return noten === undefined ? this.getWordBranch(props, true) : noten
		}

	}
	getWordBranch(a, en){
		let out = en ? this.words_en : this.words
		for (let i = 0; i < a.length; i++){
			const next = out?.[a[i]]
			if (next === undefined) return undefined
			out = next
		}
		return out
	}

	getResourceNodeValues(u,v){

		const generalDensity = (x,y)=>{
			let v = this.resourceNoise.noise3_Classic(x * .02, y * .02, 666) * .5 + .5
			return v < .5 ? 0 : ((v - .5) / (1 - .5)) ** .25
		}

		const generatorC = _=>1
		const generatorE = (x,y)=>{
			let v = this.resourceNoise.noise3_Classic(x * .02, y * .02, 0) * .5 + .5
			v = v < .7 ? 0 : (v - .7) / (1 - .7)
			return v
		}
		const generatorQ = (x,y)=>{
			let v = this.resourceNoise.noise3_Classic(x * .2, y * .2, 16) * .5 + .5
			v = v < .8 ? 0 : (v - .8) / (1 - .8)
			return v
		}
		const generatorBP = (x,y)=>{
			let v = this.resourceNoise.noise3_Classic(x * .1 + Math.sin(y * .2) * .2, y * .01, 8) * .5 + .5
			v = v < .7 ? 0 : (v - .7) / (1 - .7)
			return v
		}
		const generatorF = (x,y)=>{
			let v = this.resourceNoise.noise3_Classic(x * .01 + Math.sin(y * .2) * .3, y * .01 + Math.sin(x * .2) * .3, 32) * .5 + .5
			v = v < .7 ? 0 : (v - .7) / (1 - .7)
			return v
		}
		const distance= Math.max(Math.abs(u), Math.abs(v))
		const power = distance > 1024 ? .5 : 3 - 2.5 * (distance / 1024)
		const powers = [1,power,power,power,power]
		const rids = [0, 1, 2, 3, 6]
		const dns = generalDensity(u,v)
		// const values = [1, dns]
		const values = [1, generatorE(u,v) ** powers[1] * dns, generatorQ(u,v)** powers[2] * dns, generatorBP(u,v)** powers[3] * dns, generatorF(u,v)** powers[4] * dns]
		const map = []
		for (let i = 0; i < values.length; i++){
			if (!values[i]) continue
			map.push({rid: rids[i], v: values[i]})
		}
		map.sort((a,b)=>b.v - a.v) //Order important for rendering
		return map
	}

	initAnalytics(){

		this.analytics = {
			measuringFrame: 1000,
			frameCount: 16,
			frames: [],
			frame: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
			frameTimer: 0,
			average: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
			instant: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
			dataSize: 64,
			graphs: []
		}

		for (let i = 0; i < 10; i++){

			const canvas = document.createElement(`canvas`)
			canvas.width = this.w2 / 2
			canvas.height = this.h2 / 2

			this.analytics.graphs.push({
				canvas: canvas,
				ctx: canvas.getContext(`2d`),
				data: [],
				max: 10
			})

		}

	}

	togglePhotofobia(){

		this.photofobia = !this.photofobia
		this.splash.setPhotofobia(this.photofobia)
		this.savePreferences()
		// localStorage.setItem(`abstractv03_photofobia${this.steamId}`, this.photofobia)

	}

	toggleChill(){

		this.chillMode = !this.chillMode
		this.splash.chill.classList.toggle(`active`)
		this.savePreferences()
		// localStorage.setItem(`abstractv03_chill${this.steamId}`, this.chillMode)

	}

	async preloadImages(){

		const list = window.ModLoader?.applyPreloadList(this.codex.preload) || this.codex.preload
		const images = {}
		const promises = []

		for (let i = 0; i < list.length; i++){

			const src = list[i]
			const img = new Image()

			images[src] = img

			promises.push(new Promise((resolve, reject) => {
				img.onload = resolve
				img.onerror = reject
			}))

			img.src = src
		}

		await Promise.all(promises)

		return images

		// const list = this.codex.preload
		// const images = {}
		// for (let i = 0; i < list.length; i++){

		// 	const img = new Image()
		// 	img.src = list[i]
		// 	images[list[i]] = img

		// }
		// return images

	}

	showSteamWarning(){

		const warn = document.createElement(`div`)
		warn.classList.add(`steamWarning`)
		document.body.append(warn)

		warn.innerHTML = this.pronounce('random', 'steamWarning')

	}

	initialLoad(save){

		if (save){
			const cloud = this.decodeSave(save)
			const local = this.decodeSave(localStorage.getItem(`abstractv03${this.steamId}`))

			const loadSuccess = this.loadSave((!local && cloud) || (cloud?.timestamp > local?.timestamp) ? cloud : local)
			if (!loadSuccess) {
				this.prepopulate()
				// this.splash.updateBackups()
			}
		    this.cleanup()
		} else {
			const loadSuccess = this.loadSave()
	     	if (!loadSuccess) {
	     		this.prepopulate()
	     		// this.splash.updateBackups()
	     	}
	     	this.cleanup()
		}

		

	}

	prepopulate(){
		this.addEntity(`pump`,[0,0])
		if (!this.entityAtCoordinates([-100,-100]) ){
			this.addEntity(`strange`,[-100,-100])
		}
		if (!this.entityAtCoordinates([-1024,1024]) ){
			this.addEntity(`cookie`,[-1024,1024])
		}
	}

	updateSteamAchievement(id,v){
		this.spaceport?.send(`achieve`, id)
	}

	changeLanguage(id){

		if (this.languages[id]){
			this.languageId = id
			this.language = this.languages[this.languageId]
			const words = window.ModLoader?.applyWords(abstract_getWords(), this) || abstract_getWords()
			if (!words[this.language]) {
				this.languageId = 0
				this.language = this.languages[this.languageId] || `en`
			}
			this.words = words[this.language]
			this.words_en = words.en
			this.splash[this.isMobile ? `initMobile` : `init`]({selected: this.splash.selected, selectedId: this.splash.selectedId})
			// this.splash.updateBackups()
			// this.shop.init()
			// this.shop.switchPlane(this.plane)//TST
			this.switchPlane(this.plane)
			this.store.reinit()
			// this.shop.init(this.plane)
			this.messenger.setState(this.messenger.firedEvents, this.messenger.shownMessages, this.messenger.messagesShown)

			for (let i = 0; i < this.stuff.length; i++){
				this.stuff[i].initHint()
			}

			this.savePreferences()
			// localStorage.setItem(`abstractv03_language${this.steamId}`, this.languageId)
		}
	}

	initScreenSize(){
		this.w = this.canvas.width = this.canvas.offsetWidth * this.pixelRatio
		this.h = this.canvas.height = this.canvas.offsetHeight * this.pixelRatio
		this.w2 = this.w / 2
		this.h2 = this.h / 2
		this.solidUnit = this.screenUnit = Math.min(this.h, this.w) * .1
		this.regularFont = `600 ` + this.screenUnit * .16 + `px Montserrat, sans-serif`
		this.smallFont = `600 ` + this.screenUnit * .12 + `px Montserrat, sans-serif`
		this.microFont = this.screenUnit * .09 + `px Montserrat, sans-serif`
		this.bigFont = this.screenUnit * .3 + `px Verdana, sans-serif`
		this.setResourceHomes()

		this.flashlight = this.ctx.createRadialGradient(this.w2, this.h2, this.h2/4, this.w2, this.h2, this.w2)
		this.flashlight.addColorStop(0, `#1120`)
		this.flashlight.addColorStop(1, `#1129`)

		const dx = this.pixelRatio * 4
		for (let i = 0; i < this.analytics.graphs.length; i++){
			this.analytics.graphs[i].canvas.width = dx * this.analytics.dataSize + dx * 16//this.w2 / 2
			this.analytics.graphs[i].canvas.height = this.analytics.graphs[i].canvas.width * .5//this.h2/3
		}
	}

	initScreenSizeMobile(){
		this.w = this.canvas.width = this.canvas.offsetWidth * this.pixelRatio
		this.h = this.canvas.height = this.canvas.offsetHeight * this.pixelRatio
		this.w2 = this.w / 2
		this.h2 = this.h / 2
		// console.log(innerWidth > 420)
		// const ratio = Math.min(this.w / this.h, this.h / this.w)
		// const unitMult = ratio < 0 ? 1 : 1 - (ratio - .5)
		const screenReference = Math.min(this.h, this.w, this.mobileScreenLimit * this.pixelRatio)
		this.solidUnit = this.screenUnit = screenReference * .16
		this.regularFont = `600 ` + this.screenUnit * .16 + `px Montserrat, sans-serif`
		this.smallFont = `600 ` + this.screenUnit * .12 + `px Montserrat, sans-serif`
		this.microFont = this.screenUnit * .09 + `px Montserrat, sans-serif`
		this.bigFont = this.screenUnit * .3 + `px Verdana, sans-serif`
		this.setResourceHomesMobile()

		this.flashlight = this.ctx.createRadialGradient(this.w2, this.h2, this.h2/4, this.w2, this.h2, this.w2)
		this.flashlight.addColorStop(0, `#1120`)
		this.flashlight.addColorStop(1, `#1129`)

		const dx = this.pixelRatio * 4
		for (let i = 0; i < this.analytics.graphs.length; i++){
			this.analytics.graphs[i].canvas.width = dx * this.analytics.dataSize + dx * 16//this.w2 / 2
			this.analytics.graphs[i].canvas.height = this.analytics.graphs[i].canvas.width * .5//this.h2/3
		}
	}

	finishGame(){
		this.playSound(`lightning`)
		this.createHollowEvent(`#000`, 50000)
		this.stats.gameIsFinished = true

		//Finish alfa
		if (this.alfa?.currentEvents.length){
			for (let i = 0; i < this.alfa.currentEvents.length; i++){
				const e = this.alfa.currentEvents[i]
				if (e.onfinish) e.onfinish()
			}
			this.alfa.currentEvents = []
		}

		if (this.voidsculpture) this.clearCell(this.voidsculpture.position)
		if (this.orbifoldUI) this.closeOrbifolds()
		for (let i = 0; i < this.stuff.length; i++){

			const e = this.stuff[i]
			if (this.codex.entities[e.name].type === `complete`){
				this.clearCell(e.position)
				if (this.entityAtCoordinates(e.position)) this.clearCell(e.position) //Double kill
			}

		}

		this.store.vessel.style.display = `none`

		this.hollowSite.spawnTimerBase = 2000
		// this.master.playSound(`endingMusic`,undefined,undefined,undefined,true)
		this.playMusic(`shallow_anne`)

		//Mobile
		if (this.store?.html.store) this.store.html.store.remove()
		if (this.store?.html.eraser) this.store.html.eraser.remove()
		if (this.store?.html.relocator) this.store.html.relocator.remove()

		setTimeout(_=>this.rbrtimeup = true, 640)
	}

	quickFinish(){

		// this.savePermanents(true)

		// this.preventSaving = true
		this.playSound(`lightning`)
		// this.createHollowEvent(`#000`, 50000)
		if (this.orbifoldUI) this.closeOrbifolds()
		this.stats.gameIsFinished = true
		this.halt = true

		this.store.vessel.style.display = `none`
		//Mobile
		if (this.store?.html.store) this.store.html.store.remove()
		if (this.store?.html.eraser) this.store.html.eraser.remove()
		if (this.store?.html.relocator) this.store.html.relocator.remove()

		this.deployOrbElement(true)

	}

	watchCredits(){

		this.preventSaving = true
		const texts = this.pronounce('credits')
		const eonly = abstract_getWords().en.credits
		const l = this.language

		const addLine = t => {
			const say = document.createElement(`p`)
			say.innerHTML = t
			this.creditPillar.appendChild(say)
		}

		this.halt = true
		this.messenger.element.innerHTML = ``
		setTimeout(_=>{this.lastDialogue = true}, 20000)

		this.credits = document.createElement(`div`)
		this.credits.classList.add(`credits`)
		document.body.appendChild(this.credits)

		this.creditImage = document.createElement(`video`)
		this.creditImage.classList.add(`tstv`)
		this.creditImage.setAttribute(`muted`, ``)
		this.creditImage.setAttribute(`autoplay`, ``)
		this.creditImage.setAttribute(`playsinline`, ``)
		this.creditImage.innerHTML = `<source src="img/tst/${this.isMobile ? `sf_mobile` : `tst3`}.mp4" type="video/mp4">`
		this.creditImage.addEventListener('canplay', _=>{
		    this.creditImage.play()
		    this.credits.append(this.creditImage)
		})

		this.creditPillar = document.createElement(`div`)
		this.creditPillar.classList.add(`creditPillar`)
		this.credits.appendChild(this.creditPillar)
		this.creditPillar.style.transform = `translate(0,${innerHeight}px)`

		addLine(texts[0])
		addLine(texts[1])
		addLine(texts[2])
		addLine(`&nbsp;`)
		addLine(texts[3])
		const rtotal = this.makeReadable(this.stats.absoluteResourcesCount)
		addLine(`${texts[4]} ${rtotal}`)

		addLine(`${texts[5]} ${this.makeReadable(this.stats.totalResourcesMined[0])}<br>
			${texts[6]} ${this.makeReadable(this.stats.totalResourcesMined[1])}<br>
			${texts[7]} ${this.makeReadable(this.stats.totalResourcesMined[2])}<br>
			${texts[8]} ${this.makeReadable(this.stats.totalResourcesMined[3])}<br>
			${texts[9]} ${this.makeReadable(this.stats.totalResourcesMined[4])}<br>
			${texts[10]} ${this.makeReadable(this.stats.totalResourcesMined[5])}<br>
			${texts[11]} ${this.makeReadable(this.stats.totalResourcesMined[6])}<br>
			${texts[12]} ${this.makeReadable(this.stats.totalResourcesMined[7])}<br>
			${texts[13]} ${this.makeReadable(this.stats.totalResourcesMined[8])}<br>
			${texts[14]} ${this.makeReadable(this.stats.totalResourcesMined[9])}
			`)

		addLine(`${texts[15]} ${this.stats.machinesBuild}`)
		addLine(`${texts[16]} ${this.stats.machinesSold}`)
		addLine(`${texts[17]} ${Math.floor(this.stats.maxDepth * 10)}`)
		addLine(`${texts[18]} ${this.stats.strangeRockPoked}`)
		addLine(`${texts[19]} ${this.stats.timesTeleported}`)
		addLine(`${texts[20]} ${this.stats.totalCubeClicks}`)
		addLine(`${texts[21]} ${this.stats.timeEvents}`)
		addLine(`${texts[22]} ${Math.floor(this.stats.totalPlayTime / 1000 / 60 / 60 * 10)/10} ${texts[23]}`)

		addLine(`&nbsp;`)
		addLine(texts[24])
		addLine(texts[25])
		addLine(texts[26])
		addLine(texts[27])
		addLine(texts[28])
		addLine(texts[31])
		addLine(`${eonly[32]}<br>${eonly[33]}<br>${eonly[34]}<br>${eonly[35]}<br>${eonly[36]}<br>${eonly[37]}<br>${eonly[38]}<br>${eonly[39]}<br>${eonly[40]}<br>${eonly[41]}<br>${eonly[42]}<br>${eonly[43]}<br>${eonly[44]}<br>${eonly[45]}<br>${eonly[46]}<br>${eonly[47]}<br>${eonly[48]}`)
		addLine(`&nbsp;`)
		addLine(texts[29])
		addLine(texts[30])

		this.creditImage.style.opacity = 1
		this.creditImage.play()

		this.creditImage.addEventListener(`ended`,_=>{
			this.creditImage.style.transition = `opacity 48s ease`
			this.creditImage.style.opacity = 0
		})

		const speed = this.isMobile ? .04 : .02
		let scrollAmount = this.isMobile ? -2000 : -1000
		let lt = performance.now()
		// let finalChord = false

		setTimeout(_=>{this.deployOrbElement()}, 50000) 

		const scrollDown = p=>{

			const edge = p.getBoundingClientRect().bottom < 0

			if (!edge) requestAnimationFrame(_=>{scrollDown(p)})

			const now = performance.now()
			const dt = now - lt
			lt = now

			scrollAmount += speed * dt
			p.style.transform = `translate(0,${innerHeight - scrollAmount}px)`

			// if (!finalChord && edge){
			// 	finalChord = document.createElement(`div`)
			// 	finalChord.classList.add(`finalChord`)
			// 	finalChord.innerHTML = `<span>T-1</span>`
			// 	this.credits.append(finalChord)
			// 	finalChord.onclick = _=>{
			// 		location.reload()
			// 	}
			// 	setTimeout(_=>{finalChord.style.opacity = 1}, this.isMobile ? 320 : 640)
			// }

		}
		scrollDown(this.creditPillar)


	}

	deployOrbElement(quick){

		const offerNewHole = (this.completions ?? 0) + 1 - (this.orbUpgrades ?? 0) <= this.maxHoles
		const offerUpgrade = this.completions > 0

		let wrap
		if (quick){

			const darkness = document.createElement(`div`)
			darkness.classList.add(`orbVeil`)
			document.body.append(darkness)

			wrap = document.createElement(`div`)
			wrap.classList.add(`orbResetWrap`)
			darkness.append(wrap)

			requestAnimationFrame(_=>{
				darkness.style.backdropFilter = `blur(64px)`
				darkness.style.background = `#000E`
			})

		} else {

			wrap = document.createElement(`div`)
			wrap.classList.add(`orbResetWrap`)
			document.body.append(wrap)

		}

		if (offerNewHole){

			const newHole = document.createElement(`div`)
			newHole.classList.add(`orbResetButton`)
			newHole.innerText = this.pronounce('random', 'newHole')
			wrap.append(newHole)
			newHole.style.animationDelay = `.5s`
			requestAnimationFrame(_=>{
				newHole.style.opacity = 1
			})

			newHole.addEventListener(`click`, _=>{

				this.completions++
				this.reset(true)
				// this.savePermanents(true)
				// this.spaceport.send(`reset`, ``)
				// localStorage.removeItem(`abstractv03${this.steamId}`)
				// setTimeout(_=>{location.reload()},400)

			})

		}

		if (offerUpgrade){

			const upgrade = document.createElement(`div`)
			upgrade.classList.add(`orbResetButton`)
			upgrade.innerText = this.pronounce('random', 'newUpgrade')
			wrap.append(upgrade)
			upgrade.style.animationDelay = `1.4s`
			requestAnimationFrame(_=>{
				upgrade.style.opacity = 1
			})

			upgrade.addEventListener(`click`,_=>{

				this.completions++
				this.orbUpgrades++
				this.reset(true)
				// this.savePermanents(true)
				// this.spaceport.send(`reset`, ``)
				// localStorage.removeItem(`abstractv03${this.steamId}`)
				// setTimeout(_=>{location.reload()},400)

			})

		}

	}

	closeCredits(){
		if (this.credits){
			this.halt = false
			this.credits.innerHTML = ``
			document.body.removeChild(this.credits)
			this.credits = undefined
		}
	}

	popOrbifolds(e){

		if (this.orbifoldUI) {
			const same = this.orbifoldUI.worldXY[0] === e.position[0] && this.orbifoldUI.worldXY[1] === e.position[1]
			this.closeOrbifolds()
			if (!same) this.orbifoldUI = new OrbifoldMenu(this, e)
		} else {
			this.orbifoldUI = new OrbifoldMenu(this, e)
		}

	}

	closeOrbifolds(){

		if (!this.orbifoldUI) return
		this.orbifoldUI.close()
		delete this.orbifoldUI

	}

	switchPlane(p){

		if (this.plane === 0 && p === 1) this.stats.darkVisited++
		this.plane = p ? 1 : 0

		if (this.isMobile){

			// this.store.compositionUpdate()

			//WIP Mobile button handling

			// this.shop.switchPlane(p)

			// if (p){
			// 	this.shop.mobileEraser.style.display = `none`
			// 	this.shop.mobileRelocator.style.display = `none`
			// } else {
			// 	this.shop.mobileEraser.removeAttribute(`style`)
			// 	this.shop.mobileRelocator.removeAttribute(`style`)
			// }

		}

		this.removeHint()
		this.updateGlobalPositioning()

	}

	getAutonomy(){

		if (!this.chasm) return false

		const key = this.chasm.chasmNetwork
		const silos = []
		const automatedStuff = new Set()
		const auxes = new Set()
		const pumps = new Set()
		const mapTiles = new Set()
		const pumpZones = []

		//Get all connected silos
		for (let i = 0; i < this.stuff.length; i++){

			const s = this.stuff[i]
			if (s instanceof Silo && s.chasmNetwork === key){
				silos.push(s)
			}

		}

		//Get all supplied auxes
		for (let i = 0; i < silos.length; i++){

			const s = silos[i]
			const m = s.getNeighbours()

			for (let j = 0; j < m.length; j++){

				if (m[j] && m[j] instanceof Auxpump) auxes.add(m[j])
				if (m[j] && !(m[j] instanceof Cube)) automatedStuff.add(m[j])

			}

		}

		//Get all automated pumps
		for (let a of auxes){

			for (let i = 0; i < a.soi.length; i++){

				const uv = [a.position[0] + a.soi[i][0], a.position[1] + a.soi[i][1]]
				const entity = this.entityAtCoordinates(uv)
				if (entity instanceof Pump) pumps.add(entity)

			}


		}

		//Get zones available for cubes with pump speeds
		for (let p of pumps){

			const range = p.soe ? p.soe : p.soi

			//Hardcode for auxes
			let auxMult = .25
			for (let i = 0; i < p.auxes.length; i++){

				if (auxes.has(p.auxes[i]) && p.auxes[i] instanceof Auxpump2){
					auxMult = 1
					break
				}

			}

			const zone = {
				pump: p,
				speed: p.pumpSpeed * (1 + auxMult),
				uvs: []
			}

			for (let i = 0; i < range.length; i++){

				const uv = [p.position[0] + range[i][0], p.position[1] + range[i][1]]
				const uvString = `u${uv[0]}v${uv[1]}`
				const entity = this.entityAtCoordinates(uv)

				if (!entity || entity instanceof Cube || !mapTiles.has(uvString)) {
					zone.uvs.push(uv)
					mapTiles.add(uvString)
				}

			}

			pumpZones.push(zone)

		}

		//Check for bonuses and breakers for each spot
		const soi = [[0,-1], [1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]
		for (let i = 0; i < pumpZones.length; i++){

			const pz = pumpZones[i]

			for (let j = 0; j < pz.uvs.length; j++){

				const c = pz.uvs[j]

				let cubeBreakpower = .08
				let initialPower = 0
				let powerRate = 0
				let breakSpeed = 0

				for (let k = 0; k < soi.length; k++){

					const entity = this.entityAtCoordinates( [c[0] + soi[k][0], c[1] + soi[k][1]] )
					if (!entity || !automatedStuff.has(entity)) continue
					if (entity instanceof Entropic2a) {
						initialPower += entity.power
					} else if (entity instanceof Entropic) {
						initialPower += entity.power
						powerRate += entity.power / entity.interval
					}

				}

				if(!initialPower || !powerRate) console.log(c)

			}

		}


		// console.log(automatedStuff)

	}

	//RESOURCES

	initResources(){

		this.resources = new Array(10).fill(0)
		this.resourcePops = new Array(10).fill(0)
		this.resourcesSprites = []

		// if (this.permanents.globalStats.completeStructures) this.resources[10] = this.permanents.globalStats.completeStructures

		for (let i = 0; i < this.codex.resources.length; i++){
			this.resourcesSprites.push(new Sprite({
				master: this,
				src: `img/resources.png`,
				frames: [[i*108,0,104,120]],
				origins: [52,60],
				scale: .25,
				intervals: 100
			}))
		}

		this.resourceBuffer = new Array(10).fill(0)
		this.resourceRates = new Array(10).fill(0)

	}

	setResourceHomes(){

		this.resourceHomes = []

		for (let i = 0; i < this.resources.length; i++){
			this.resourceHomes.push([this.screenUnit * (i+1) * .8, this.screenUnit])
		}

	}
	setResourceHomesMobile(){

		this.resourceHomes = []

		const limit = Math.min(this.w, this.mobileScreenLimit * this.pixelRatio)
		const margin = this.screenUnit / 2
		const leftEdge = [this.w2 - limit / 2 + margin, this.screenUnit * 1.4]
		const delta = (limit - margin * 2) / (this.resources.length - 1)

		for (let i = 0; i < this.resources.length; i++){
			this.resourceHomes.push([leftEdge[0] + delta * i, leftEdge[1]])
		}

	}

	//SAVE

	async exportSave(){

		// if (!this.preventSaving){
		// 	const save = this.assembleSave()
		// 	await navigator.clipboard.writeText(save)
		// }
		console.log(`Preparing export. Saving game...`)

		if (this.preventSaving) return null
		await this.saveGame()

		console.log(`Game saved. Exporting...`)

		const raw = this.saveSlots[this.currentSlotId]
		const serialized = JSON.stringify({
			data: raw.stack[0], 
			ownerHash: raw.ownerHash, 
			creationTimeStamp: raw.creationTimeStamp, 
			lastModified: raw.lastModified
		})
		const base = this.encodeSave(serialized)

		await navigator.clipboard.writeText(base)
		console.log(`Exported`)

	}

	async loadSaveFromClipboard(){

		// const encoded = await navigator.clipboard.readText()
		// const state = this.decodeSave(encoded)
		// if (!state) return
		// delete state.timestamp
		// const hope = this.encodeSave(JSON.stringify(state))
		// this.importSave(hope)

		let encoded
		try {
			encoded = await navigator.clipboard.readText()
		} catch (e) {
			console.log(`No paste`)
			encoded = prompt(`Paste save`)
			console.log(encoded)
			// return
			// console.warn('Clipboard read failed:', e)
			// return 'clipboard-unavailable'

		}

		if (!encoded) return

		// const encoded = await navigator.clipboard.readText()
		let decoded = this.decodeSave(encoded)
		if (decoded === 0){
			return
		}

		// let existingSlotId = null
		// for (let i = 0; i < this.saveSlots.length; i++){
		// 	const ss = this.saveSlots[i]
		// 	if (ss.ownerHash === decoded.ownerHash && ss.creationTimeStamp === decoded.creationTimeStamp){
		// 		existingSlotId = i
		// 		break
		// 	}
		// }

		// console.log(existingSlotId)
		
		//Check for legacy
		const legacy = !decoded.creationTimeStamp
		if (legacy){
			decoded = {
				data: {
					isProtected: false,
					permanents: decoded.permanents ?? {
						glory: decoded.glory || null,
						// globalStats: {
							completions: 0,
							upgrades: 0,
							orbUpgradeMap: [],
						// }
					},
					state: decoded
				}, 
				ownerHash: 64, 
				creationTimeStamp: Date.now(), 
				lastModified: Date.now()
			}
		}

		//Always create a new slot
		const newId = this.saveSlots.length
		const slot = {
			name: this.pronounce(`splash`, `imported`) + ` ` + newId,
			ownerHash: decoded.ownerHash,
			creationTimeStamp: decoded.creationTimeStamp,
			stack: [decoded.data],
			lastModified: decoded.lastModified
		}

		await this.saveGame()

		this.saveSlots[newId] = slot
		this.currentSlotId = newId
		this.savePreferences()

		await this.writeToSlot(slot, this.currentSlotId)

		location.reload()

	}

	// importSave(data){
		
	// 	this.spaceport?.send(`save`, data)
	// 	localStorage.setItem(`abstractv03${this.steamId}`, data)
	// 	location.reload()

	// }

	// loadSave( manual = this.decodeSave(localStorage.getItem(`abstractv03${this.steamId}`)) ){
	loadSave( manual = this.saveSlots[this.currentSlotId].stack[0].state ){

		if (!manual) return false

		try {
			manual = window.ModLoader?.applyLoadedSave(manual, this) || manual
			//To make sure
			for (let i = 0; i < manual.resources.length; i++){
				if (manual.resources[i]) this.resources[i] = manual.resources[i]
			}

			this.onlyones = manual.onlyones || {}

			//Just to make sure
			for (let i in this.onlyones){
				if (!this.codex.entities[i]?.onlyone) delete this.onlyones[i]
			}

			this.updateEraserType(manual.eraserType || 0)

			if (manual.hollowHardness) this.hollowHardness = Math.min(64, manual.hollowHardness)
			if (manual.slowdown) this.slowdown = manual.slowdown
			if (manual.plane) {
				this.plane = manual.plane
				this.switchPlane(this.plane)
			}
			if (manual.switchedplanes) this.switchedplanes = manual.switchedplanes
			if (manual.bridge) this.bridge = manual.bridge
			if (manual.unlockedEntities) this.unlockedEntities = manual.unlockedEntities
			if (manual.needNoHelp) this.needNoHelp = true
			if (manual.messengerFiredEvents && manual.messengerShownMessages && manual.messengerShown !== undefined) {
				this.messenger.setState(manual.messengerFiredEvents, manual.messengerShownMessages, manual.messengerShown)
			}
			if (manual.existed) {
				this.store.setExisted(manual.existed)
			}
			if (manual.glory) this.achiever.setState(manual.glory)
			if (manual.stats) {
				for (let i in manual.stats)
				this.stats[i] = manual.stats[i]
			}

			//Game is finished from the achievement
			if (manual.glory && manual.glory[20]){
				this.stats[20] = true
			}

			//Legacy for play and idle time
			if (this.stats.totalPlayAndIdleTime < this.stats.totalPlayTime) this.stats.totalPlayAndIdleTime = this.stats.totalPlayTime
			if (manual.existed?.pump2) this.stats.excavatorWasBuilt = true
			
			for (let i = 0; i < manual.stuff.length; i++){

				const s = manual.stuff[i]
				if (!window.ModLoader?.canLoadEntity(s.name, this) && !this.codex.entities[s.name]) {
					window.ModLoader?.rememberOrphanEntity(s)
					continue
				}
				const entity = s.name === `cube` ? this.addEntity(s.name, s.position, {pump: false, resources: s.par.resources}) : s.name === `surge` ? this.addEntity(s.name, s.position, {resources: s.par.resources, rayNumber: s.par.rayNumber, grade: s.par.grade, colors: s.par.colors, type: s.par.type, maxLife: s.par.maxLife, life: s.par.life}) : (s.name === `waypoint` || s.name === `waypoint2`) ? this.addEntity(s.name, s.position, {timestamp: s.par.timestamp}) : this.addEntity(s.name, s.position, undefined, {skipShopUpdate: true})
				if (entity){
					try{
						for (let j in s.par){
							entity[j] = s.par[j]
						}
					} catch(e){console.log(s)}

					entity.init()
				}

			}

			//Center on chancel
			if (this.plane){
				let origin = [0,0]
				if (this.voidsculpture){
					const uv = this.voidsculpture.position
					origin = [(uv[0] * 0.866 - uv[1] * .866) * this.unit / this.zoom, (uv[0] * .5 + uv[1] * .5) * this.unit / this.zoom]
				}
				this.translation[0] = origin[0]
				this.translation[1] = origin[1]
			}

			this.store.compositionUpdate()

			if (this.memorycomplex){
				//Rewrite memory buffer for non-pristine saves
				if (manual.memory) this.memoryBuffer = manual.memory
			}

			this.cleanup()

			if (manual.timestamp){
				const timeSinceLastSave = (Date.now() - manual.timestamp)
				this.simulateIdleTime(timeSinceLastSave)
			}

			if (manual.currentAlfaEvents){
				for (let i = 0; i < manual.currentAlfaEvents.length; i++){
					const e = this.alfa.startEvent(manual.currentAlfaEvents[i].id)
					e.remains = manual.currentAlfaEvents[i].remains
				}
				if (this.store.updateAlfa) this.store.updateAlfa()
			}

			return true

		} catch(e){
			console.log(e)
			console.error(e.message)
			// alert(`Sorry, there is a problem with loading the game. Game saving won't be available and all the progress will be lost on quit. ${e}`)
			this.preventSaving = true
			return false
		}

	}

	simulateIdleTime(t){

		if (t < 20000 || this.stats.maxDepth < 30) return
		
		const dt = 64
		let timer = Math.min(Math.max(0, t), 28800000) // Limit for 8h
		let elapsed = 0
		let cancel = false

		//Idle splash
		const cover = document.createElement(`div`)
		cover.classList.add(`idleCover`)
		document.body.append(cover)
		cover.addEventListener(`touchstart`, e=>{
			e.stopPropagation()
		})

		const splash = document.createElement(`div`)
		splash.classList.add(`idleSplash`)
		cover.append(splash)

		const animation = document.createElement(`div`)
		animation.classList.add(`timer_animation`)
		splash.append(animation)

		const t_element = document.createElement(`div`)
		t_element.classList.add(`timer`)
		splash.append(t_element)

		const nobr = document.createElement(`nobr`)
		t_element.append(nobr)

		const t_ff = document.createElement(`div`)
		t_ff.classList.add(`ff`)
		nobr.append(t_ff)

		const t_time = document.createElement(`span`)
		t_time.classList.add(`time`)
		nobr.append(t_time)
		t_time.innerHTML = ``

		const cancel_el = document.createElement(`div`)
		cancel_el.classList.add(`cancelIdle`)
		cover.append(cancel_el)

		cancel_el.addEventListener(`click`, e=>{
			cancel = true
		})

		
		let nextStopAt = Infinity
		let nextResourceId = -1
		
		if (this.completions < 1){
			const startingDepth = this.stats.maxDepth
			const stopDepths = [45,80,620,1690]

			for (let i = 0; i < stopDepths.length; i++){
				if (startingDepth < stopDepths[i]){
					nextStopAt = stopDepths[i]
					break
				}
			}

			for (let i = 0; i < this.stats.totalResourcesMined.length; i++){
				if (!this.stats.totalResourcesMined[i]){
					nextResourceId = i
					break
				}
			}
		}

		const run = _=>{

			let finished = false

			const r_before = this.stats.absoluteResourcesCount

			for (let i = 0; i < 5e3; i++){
				this.updateCycle(dt,true)
				elapsed += dt
				timer -= dt
				if (timer <= 0 || this.stats.maxDepth > nextStopAt || this.stats.totalResourcesMined[nextResourceId] > 0 || cancel) {
					finished = true
					break
				}
			}

			//Cutoffs
			const resourcesChanged = this.stats.absoluteResourcesCount !== r_before
			
			if (!finished && resourcesChanged) {
				t_time.innerHTML = parseTime(elapsed)
				setTimeout(_=>{
					run()
				}, 32)
			} else {
				delete this.preventNoise
				document.body.removeChild(cover)
			}

		}

		//Suspend audio and delay for screen update
		this.preventNoise = true
		setTimeout(_=>{
			run()
		}, 64)
	

		function parseTime(t){

			const hh = Math.floor(t / 3600000)
			let mm = Math.floor((t % 3600000) / 60000)
			if (mm < 10) mm = `0` + mm

			return `${hh}h ${mm}m`

		}
		
	}

	// restoreBackup(n){

	// 	if (!this.backups[n]) return
	// 	const state = this.decodeSave(this.backups[n].data)
	// 	if (!state) return
	// 	state.backups = this.backups
	// 	const hope = this.encodeSave(JSON.stringify(state))
	// 	this.importSave(hope)

	// }

	backupLoop(){

		this.saveStackUpdateNeeded = true
		setTimeout(_=>{this.backupLoop()}, 240000)

	}

	saveLoop(){

		setTimeout(_=>{this.saveLoop()}, 10000)
		this.saveGame()

		//UPDATES
		const payload = [
			{id: `HOURSINARUN`, value: Math.floor(this.stats.totalPlayAndIdleTime / 1000 / 60 / 60) || 0 },
			{id: `DARKVISITS`, value: this.stats.darkVisited || 0},
			{id: `TOTALRESOURCECOUNT_K`, value: Math.min(Math.floor(this.stats.absoluteResourcesCount / 1e3), 64) || 0},
			{id: `TOTALRESOURCECOUNT_M`, value: Math.min(Math.floor(this.stats.absoluteResourcesCount / 1e6), 64) || 0},
			{id: `TOTALRESOURCECOUNT_B`, value: Math.min(Math.floor(this.stats.absoluteResourcesCount / 1e9), 64) || 0},
			{id: `TOTALCUBECLICKS`, value: this.stats.totalCubeClicks || 0},
			{id: `MACHINESBUILT`, value: this.stats.machinesBuild || 0},
			{id: `MACHINESSOLD`, value: this.stats.machinesSold || 0},
			{id: `VAULTS`, value: this.entitiesInGame.vault || 0},
			{id: `ROCKPOKES`, value: this.stats.strangeRockPoked || 0},
			{id: `PUMPS`, value: this.entitiesInGame.pump2 || 0},
			{id: `MAXDEPTH`, value: this.stats.maxDepth * 10 || 0},
			{id: `TIMESTELEPORTED`, value: this.stats.timesTeleported || 0}
		]
		this.spaceport?.send(`updateStat`, payload)

	}

	// saveGame(){
	// 	if (!this.preventSaving){
	// 		// this.UPDATE_saveGame()
	// 		this.savePermanents()
	// 		this.savePreferences()
	// 		// localStorage.setItem(`abstractv03_zoom${this.steamId}`, this.zoom)
	// 		// localStorage.setItem(`abstractv03_glory${this.steamId}`, JSON.stringify(this.achiever.fired))
	// 		const save = this.assembleSave()
			
	// 		localStorage.setItem(`abstractv03${this.steamId}`, save)
	// 		this.spaceport?.send(`save`, save)
			
	// 	}
	// }

	async saveGame(){

		if (this.preventSaving) return

		// WIP current slot should be a separate flag in preferences?
		// Writing to the stack is conrolled by this.saveStackUpdateNeeded

		//Select the slot or create one if none
		if (!this.saveSlots[this.currentSlotId]){
			this.saveSlots[this.currentSlotId] = {
				name: false,
				ownerHash: this.hash53(this.steamId),
				creationTimeStamp: Date.now(),
				stack: [],
				lastModified: Date.now()
			}
		}
		const slot = this.saveSlots[this.currentSlotId]

		if (this.saveStackUpdateNeeded){
			this.saveStackUpdateNeeded = false
			//Clear the first stack position
			//Warning: if there are lots of protected saves check performance
			if (slot.stack.length >= this.maxSaveStack){
				//Godspeed old save
				for (let i = slot.stack.length - 1; i >= 0; i--){
					const save = slot.stack[i]
					if (!save.isProtected){
						slot.stack.splice(i,1)
						break
					}
				}
			}
			slot.stack.unshift(null)

		}

		//Write the save
		slot.lastModified = Date.now()
		slot.stack[0] = {
			isProtected: false,
			state: this.assembleSave(),
			permanents: this.assemblePermanents()
		}

		await this.writeToSlot(slot, this.currentSlotId)
		// this.spaceport?.send(`save`, slot)

		// localStorage.setItem(this.getSlotKey(this.currentSlotId), JSON.stringify(slot))
	}

	async reset(memoryNeeded = false){

		//Create a new blank save for a new game
		const slot = this.saveSlots[this.currentSlotId]
		if (slot.stack.length >= this.maxSaveStack){
			//Godspeed old save
			for (let i = slot.stack.length - 1; i >= 0; i--){
				const save = slot.stack[i]
				if (!save.isProtected){
					slot.stack.splice(i,1)
					break
				}
			}
		}

		const freshSpawn = {
			isProtected: false,
			state: null,
			permanents: this.assemblePermanents()
		}

		if (memoryNeeded){
			freshSpawn.permanents.memory = this.assembleMemory()
			freshSpawn.permanents.lastOrbPositions = this.currentOrbPositions
		}

		slot.stack.unshift(freshSpawn)
		slot.lastModified = Date.now()

		await this.writeToSlot(slot, this.currentSlotId)
		// this.spaceport?.send(`save`, slot)

		setTimeout(_=>{location.reload()},400)


		// this.spaceport.send(`reset`, ``)


		// this.savePermanents(true)
		// this.spaceport.send(`reset`, ``)
		// localStorage.removeItem(`abstractv03${this.steamId}`)
		// setTimeout(_=>{location.reload()},400)

	}

	// getSlotKey(slotId = this.currentSlotId){
	// 	return `charps_${this.steamId}_memory_slot${slotId}`
	// }

	// saveToSlot(slot = 0){

	// 	const KEY = `abstractv03_slot${slot}`
	// 	const save = this.assembleSave(true)
	// 	localStorage.setItem(KEY, save)
	// 	console.log(`Saved to slot ${slot}`)

	// }

	// loadFromSlot(slot = 0){

	// 	const KEY = `abstractv03_slot${slot}`
	// 	const string = localStorage.getItem(KEY)
	// 	const data = this.decodeSave(string)

	// 	if (!data) {
	// 		console.log(`Slot ${slot} is empty`)
	// 		return
	// 	}

	// 	delete data.timestamp
		
	// 	this.importSave(string)

	// }

	// assembleSave(backupless){

	// 	const stuff = []
	// 	for (let i = 0; i < this.stuff.length; i++){
	// 		const string = this.getEntityString(this.stuff[i])
	// 		if (string) stuff.push(string)
	// 	}

	// 	const string = JSON.stringify({
	// 		stuff: stuff, 
	// 		onlyones: this.onlyones, 
	// 		resources: this.resources, 
	// 		eraserType: this.eraserType,
	// 		hollowHardness: this.hollowHardness,
	// 		slowdown: this.slowdown,
	// 		plane: this.plane,
	// 		version: this.version,
	// 		switchedplanes: this.switchedplanes,
	// 		bridge: this.bridge,
	// 		unlockedEntities: this.unlockedEntities,
	// 		needNoHelp: this.needNoHelp,
	// 		messengerShownMessages: this.messenger.shownMessages,
	// 		messengerFiredEvents: this.messenger.firedEvents,
	// 		messengerShown: this.messenger.messagesShown,
	// 		// existed: this.shop.existed, //MOB
	// 		existed: this.store.existed,
	// 		glory: this.achiever.fired,
	// 		stats: this.stats,
	// 		timestamp: Date.now(),
	// 		backups: backupless ? undefined : this.backups,
	// 		permanents: this.assemblePermanents(),
	// 		memory: this.memoryBuffer
	// 	})

	// 	return this.encodeSave(string)
		

	// }

	assembleCurrentAlfaEvents(){
		const events = []
		for (let i = 0; i < this.alfa.currentEvents.length; i++){
			events.push({id: this.alfa.currentEvents[i].id, remains: this.alfa.currentEvents[i].remains})
		}
		return events
	}

	assembleSave(){

		const stuff = []
		for (let i = 0; i < this.stuff.length; i++){
			const string = this.getEntityString(this.stuff[i])
			if (string) stuff.push(string)
		}

		const saveState = {
			stuff: stuff, 
			onlyones: this.onlyones, 
			resources: this.resources, 
			eraserType: this.eraserType,
			hollowHardness: this.hollowHardness,
			slowdown: this.slowdown,
			plane: this.plane,
			version: this.version,
			switchedplanes: this.switchedplanes,
			bridge: this.bridge,
			unlockedEntities: this.unlockedEntities,
			messengerShownMessages: this.messenger.shownMessages,
			messengerFiredEvents: this.messenger.firedEvents,
			messengerShown: this.messenger.messagesShown,
			existed: this.store.existed,
			glory: this.achiever.fired,
			stats: this.stats,
			timestamp: Date.now(),
			memory: this.memoryBuffer,
			currentAlfaEvents: this.alfa.currentEvents.length ? this.assembleCurrentAlfaEvents() : null
		}

		return window.ModLoader?.applySave(saveState, this) || saveState
	}

	decodeSave(s){
		try {
			const legacy = s.substring(0,8) === `{"stuff"`
			const payload = legacy ? s : atob(s)
			return JSON.parse(payload)
		} catch(e){
			console.log(`I cant load most brobably because you have something weird in your clipboard. Gimme a save!`)
			return 0
		}
	}

	encodeSave(s){
		try {
			return btoa(s)
		} catch(e){
			console.log(`I cant save because the designer of this game decided "Well, there is no weird characters in save, I'll just encode it and call it a day." Tell him to fix this shit.`)
		}
		
	}

	getEntityString(e){

		if (!e.name || e.name === `cube` && e.state !== 2) return

		const par = {}
		if (e.name === `pump` || e.name === `pump2`) par.depth = e.depth
		if (e.name === `pump2`) par.timeStamp = 0
		if (e.fill !== undefined) par.fill = e.fill
		if (e.state !== undefined) par.state = (e.state === 1 ? 0 : e.state)
		if (e.conversion !== undefined) par.conversion = e.conversion
		if (e.resources !== undefined) par.resources = e.resources
		if (e.resourceCount !== undefined) par.resourceCount = e.resourceCount
		if (e.spawnedHollows !== undefined) par.spawnedHollows = e.spawnedHollows
		if (e.variant !== undefined) par.variant = e.variant
		if (e.order !== undefined) par.order = e.order
		if (e.soul !== undefined) par.soul = e.soul
		if (e.grade !== undefined) {
			par.grade = e.grade
			par.type = e.type
			par.rayNumber = e.rayNumber
			par.colors = e.colors
			par.maxLife = e.maxLifeTimer
			par.life = e.lifeTimer
			if (e.stabilizer) par.stabilizerPosition = e.stabilizer.position
		}
		if (e.penalty) par.penalty = e.penalty
		if (e.timestamp) par.timestamp = e.timestamp
		if (e.name === `cube` && e.state === 2) {
			par.broken = e.broken
			par.state = 2
		}
		if (e.tier) par.tier = e.tier
		if (e.rid) par.rid = e.rid
		if (e.activeResourceId) par.activeResourceId = e.activeResourceId
		if (e.entityName) par.entityName = e.entityName

		const entityState = {name: e.name, position: e.position, par: par}
		return window.ModLoader?.applyEntitySave(entityState, e, this) || entityState
	}

	async addNewSlot(){
		const slot = {
			name: false,
			ownerHash: this.hash53(this.steamId),
			creationTimeStamp: Date.now(),
			stack: [{
				isProtected: false,
				state: null,
				permanents: {
					glory: null,
					// globalStats: {
						completions: 0,
						upgrades: 0,
						orbUpgradeMap: [],
					// }
				}
			}],
			lastModified: Date.now()
		}

		await this.saveGame()

		const newId = this.saveSlots.length
		this.saveSlots[newId] = slot
		this.currentSlotId = newId
		this.savePreferences()

		await this.writeToSlot(slot, this.currentSlotId)

		location.reload()
	}

	async loadSaveFromSlotStack(slotId, stackId){
		
		const slot = this.saveSlots[slotId]
	    if (!slot?.stack[stackId]) return false

	    if (this.currentSlotId !== slotId) {
	        this.currentSlotId = slotId
	        this.savePreferences()
	    }

	    const save = slot.stack.splice(stackId, 1)[0]
	    slot.stack.unshift(save)
	    slot.lastModified = Date.now()

	    await this.writeToSlot(slot, slotId)

	    location.reload()
	    return true



		// if (!this.saveSlots[slotId] || !this.saveSlots[slotId].stack[stackId]) return false

		// const sameSlot = this.currentSlotId === slotId

		// if (!sameSlot){
		// 	this.currentSlotId = slotId
		// 	this.savePreferences()
		// }

		// //Relocate save
		// const slot = this.saveSlots[this.currentSlotId]
		// const save = slot.stack.splice(stackId,1)[0]
		// slot.stack.unshift(save)

		// location.reload()

	}

	addWaypoint(e){

		let exists = false
		for (let i = 0; i < this.waypointList.length; i++){
			if (e === this.waypointList[i]){
				exists = true
				break
			}
		}

		if (!exists) this.waypointList.push(e)

		this.waypointList.sort((a,b)=>a.timestamp - b.timestamp)

	}

	removeWaypoint(e){

		for (let i = 0; i < this.waypointList.length; i++){

			if (e === this.waypointList[i]){

				this.waypointList.splice(i,1)
				break

			}
			
		}

		this.waypointList.sort((a,b)=>a.timestamp - b.timestamp)

	}

	useWaypoint(e){

		for (let i = 0; i < this.waypointList.length; i++){

			if (e === this.waypointList[i]){
				const next = this.waypointList[(i+1)%this.waypointList.length]
				const delta = this.uvToXY(next.position)
				this.translation[0] += delta[0] / this.zoom
				this.translation[1] += delta[1] / this.zoom

				this.updateGlobalPositioning()
				this.playSound(`teleport`,undefined,undefined,undefined,true)
				this.createHollowEvent(`#000`, this.voidsculpture ? 1000 : 10000)
				this.stats.timesTeleported++

				//Gamepad
				const gamepad = navigator.getGamepads()[0]
				if (gamepad && gamepad.vibrationActuator){
					gamepad.vibrationActuator?.reset()
					gamepad.vibrationActuator?.playEffect(`dual-rumble`,{
					startDelay: 0,
					  duration: 200,
					  weakMagnitude: .2,
					  strongMagnitude: 0,
					})
				}

				break

			}

		}

	}

	cleanup(){
		//Govnocode to fix everything in legacy

		//thee mega1 onlyones
		if (!this.entitiesInGame.mega1b && this.onlyones.mega1b) delete this.onlyones.mega1b
		if (!this.entitiesInGame.mega1a && !this.entitiesInGame.mega1b && this.onlyones.mega1a) delete this.onlyones.mega1a
		if (!this.entitiesInGame.mega1 && !this.entitiesInGame.mega1a && !this.entitiesInGame.mega1b && this.onlyones.mega1) delete this.onlyones.mega1
		// this.shop.check()

	}

	mute(on){

		if (on){
			this.fadeSound(0)
			this.isMute = true
		} else {
			this.fadeSound(1)
			this.isMute = false
		}

	}

	updateEraserType(t){
		this.eraserType = t
		// this.shop.check()
		this.store.setEraserType(t)
	}


	getLoudnessFromXY(xy){
		const distance = Math.max(Math.abs(xy[0] - this.w2), Math.abs(xy[1] - this.h2)) / this.w / 2
		return Math.max(0, 1 - distance)
	}

	getPanValueFromX(x){
		return Math.min(Math.max(-1, x / this.w * 2 - 1), 1)
	}

	pickupItem(name){


		if (name === `eraser` || name === `eraser2` || name === `eraser3`){
			this.itemInHand = {name: name, eraser: true}
		} else {
			this.itemInHand = new this.codex.entities[name].class(this)
		}

		delete this.transportedEntity

		if (!this.itemInHand.eraser){
			this.interactionMode = `build`
			this.itemInHandPriceTag = new Cloud({master: this})
			this.itemInHandPriceTag.addResourceList(this.getRealPrice(this.itemInHand.name))
			if (this.codex.entities[this.itemInHand.name].isUpgradeTo) {

				// const refundPrice = this.getRealPrice(this.codex.entities[this.itemInHand.name].isUpgradeTo, true)
				this.itemInHandPriceAndRefundTag = new Cloud({master: this})
				this.itemInHandPriceAndRefundTag.addResourceList(this.getRealPrice(this.itemInHand.name))
				this.itemInHandPriceAndRefundTag.addLine()
				this.itemInHandPriceAndRefundTag.addRefundList(this.codex.entities[this.itemInHand.name].isUpgradeTo)

			}
			// console.log(this.codex.entities[this.itemInHand.name].isUpgradeTo)
		}

	}

	//WIP new eraser 2
	pickupEraser(){
		this.cleanupInteractionMode()
		if (!this.unlockedEntities.pump) return null //Never had a resource 3 (insecure)
		this.interactionMode = `erase`
		// delete this.transportedEntity
		// delete this.itemInHand
		return true
	}

	requestResources(r,d,f,skip){

		let good = true
		
		for (let i = 0; i < r.length; i++){

			if (r[i] && this.resources[i] < r[i]){
				good = false
				break
			}

		}

		if (good) {

			this.substractResourcesFromArray(r,skip)
			// if (!r[10]) {
			this.createResourceTransfer(r, false, this.uvToXYUntranslated(d), f ? f : _=>{}, undefined, skip)
			// } else {
			// 	this.createCompleteTransaction(d)
			// 	this.playSound(`complete`)
			// }
			return true
		}

		return false

	}

	askForResources(r,d,f,skip){

		const response = []
		
		for (let i = 0; i < r.length; i++){

			if (r[i]){
				response[i] = Math.min(this.resources[i], r[i])
			}

		}

		this.substractResourcesFromArray(response,skip)
		this.createResourceTransfer(response, false, this.uvToXYUntranslated(d), f ? _=>{f(response)} : _=>{}, undefined, skip)
		return true

	}

	updateGlobalPositioning(){
		
		for (const s of this.soundSources){
			this.updateSoundSource(s)
		}

		let D
		if (this.memorycomplex){
			const uvc = this.xyToUVUntranslated([0,0])
			D = ((uvc[0] - this.memorycomplexCenter[0]) ** 2 + (uvc[1] - this.memorycomplexCenter[1]) ** 2) ** .5
			this.memoryComplexIsVisible = D <= this.memorycomplexRadius
		}

		//Given I have mc
		if (this.memoryComplexIsVisible ){
			if (!this.store.vessel.classList.contains(`memory_faded`)){
				this.store.vessel.classList.add(`memory_faded`)
			}
			if (!this.memoryComplexUI.classList.contains(`active`)) this.memoryComplexUI.classList.add(`active`)
			this.memoryComplexUI.style.opacity = D < this.memorycomplexRadius / 2 ? 1 - 2 * D / this.memorycomplexRadius : 0
		}

		if (!this.memoryComplexIsVisible ){
			if (this.store.vessel.classList.contains(`memory_faded`)){
				this.store.vessel.classList.remove(`memory_faded`)
			}
			if (this.memoryComplexUI.classList.contains(`active`)) this.memoryComplexUI.classList.remove(`active`)
		}

	}

	updateSoundSource(s){
		const sxy = this.uvToXYUntranslated(s.position)
		const pan = this.getPanValueFromX(sxy[0])
		const loudness = this.getLoudnessFromXY(sxy)

		s.pan.pan.value = pan
		s.volume.gain.value = loudness * s.baseVolume

		if (!s.audibility[this.plane] && !s.filterOn){
			//Engage
			s.filterOn = true
			s.volume.disconnect(this.sfx.master)
			s.volume.connect(s.filter)
			s.filter.connect(this.sfx.master)
		} else if (s.audibility[this.plane] && s.filterOn){
			//Disengage
			s.filterOn = false
			s.volume.disconnect(s.filter)
			s.filter.disconnect(this.sfx.master)
			s.volume.connect(this.sfx.master)
		}
	}

	updateGlobalVolume(v = this.globalSoundVolume){
		v = Math.max(0, Math.min(1, v))
		this.globalSoundVolume = v ** 2
		if (this.splash.soundSlider) this.splash.soundSlider.style.width = 100 * v + `%`
		this.savePreferences()
		// localStorage.setItem(`abstractv03_globalSoundVolume${this.steamId}`, v)

	}

	fadeSound(v){
		if (this.actx){
			this.sfx.master.gain.cancelScheduledValues(this.actx.currentTime)
			this.sfx.master.gain.linearRampToValueAtTime(.001 + this.globalSoundVolume * v, this.actx.currentTime + 1)
			if (v === 0) this.sfx.master.gain.setValueAtTime(0, this.actx.currentTime + 1)

		}
	}

	initAudio(){

		this.actx = new (AudioContext || webkitAudioContext)()
		this.sfx = {
			ready: false,
			master: this.actx.createGain(),
			samples: {},
			stackSize: 0
		}
		this.sfx.master.gain.value = this.globalSoundVolume
		this.sfx.master.connect(this.actx.destination)

		let counter = 0
		let samples = [
			{src: `sfx/tap.mp3?v5`, name: `tap1`, duration: .2, detune: 300, volume: .5},
			{src: `sfx/tap2.mp3?v2`, name: `tap2`, duration: 1.5, detune: 300, volume: .06},
			{src: `sfx/tap3.mp3?v1`, name: `tap3`, duration: 2, detune: 200, volume: .4},
			{src: `sfx/tap4.mp3?v1`, name: `tap4`, duration: .7, detune: 300, volume: .3},
			{src: `sfx/tap5.mp3?v1`, name: `tap5`, duration: .6, detune: 200, volume: .1},
			{src: `sfx/tap6.mp3?v1`, name: `tap6`, detune: 200, volume: .6},
			{src: `sfx/tap7.mp3`, name: `tap7`, detune: 80, volume: .3},
			{src: `sfx/break.mp3?v3`, name: `break`, duration: .5, detune: 300, volume: .6},
			{src: `sfx/rumble.mp3`, name: `rumble`, volume: .8},
			{src: `sfx/bubble.mp3`, name: `bubble`, volume: .2},
			{src: `sfx/counter.mp3`, name: `geiger`, volume: .3, detune: 100},
			{src: `sfx/release.mp3`, name: `release`, volume: .6},
			{src: `sfx/hellbreak.mp3`, name: `hellbreak`, volume: .4,detune: 100},
			{src: `sfx/horn.mp3`, name: `horn`, volume: .9},
			{src: `sfx/hollow.mp3`, name: `hollow`, detune: 250, volume: .2},
			{src: `sfx/teleport.mp3`, name: `teleport`, volume: .9},
			{src: `sfx/void.mp3`, name: `void`, volume: .9, detune: 100},
			{src: `sfx/soul.mp3`, name: `soul`, volume: 1, detune: 800},
			{src: `sfx/exhaust.mp3`, name: `exhaust`, volume: 1, detune: 200},
			{src: `sfx/lightning.mp3`, name: `lightning`, volume: .5, detune: 50},
			{src: `sfx/siloin.mp3`, name: `silo`, volume: .8},
			{src: `sfx/siloout.mp3`, name: `silo2`, volume: .8},
			{src: `sfx/collect.mp3`, name: `collect`, volume: 1},
			{src: `sfx/place.mp3`, name: `place`, volume: .4},
			{src: `sfx/recycle.mp3`, name: `recycle`, volume: .3},
			{src: `sfx/buildup.mp3`, name: `buildup`, volume: 1},
			{src: `sfx/scan.mp3`, name: `scan`, volume: .8, detune: 140},
			{src: `sfx/impact.mp3`, name: `impact`, volume: .8, detune: 80},
			{src: `sfx/collapsing.mp3`, name: `collapsing_drone`, volume: .5},
			{src: `sfx/drone_exp.mp3`, name: `expanding`, volume: 1},
			{src: `sfx/complete.mp3`, name: `complete`, volume: .8},
			{src: `sfx/alfanode.mp3`, name: `alfanode`, volume: .5}
		]

		samples = window.ModLoader?.applySoundList(samples) || samples

		for (let i = 0; i < samples.length; i++){

			const s = samples[i]

			fetch(s.src).then(r => {
				r.arrayBuffer().then(buffer=>{
					this.actx.decodeAudioData(buffer, data=>{
						this.sfx.samples[s.name] = {data: data, duration: s.duration, detune: s.detune, volume: s.volume}
						check(this.sfx)
					})
				})
			})

		}

		function check(sfx){
			counter++
			if (counter >= samples.length) sfx.ready = true;
		}

		
	}

	playMusic(name){
		if (!this.actx || this.preventNoise) return
		fetch(window.ModLoader?.resolveMusic(name) || `sfx/${name}.mp3`).then(r => {
			r.arrayBuffer().then(buffer=>{
				this.actx.decodeAudioData(buffer, data=>{

					if (this.music.playing){
						delete this.music.playing.onended
						this.music.gainNode.gain.exponentialRampToValueAtTime(.01, this.actx.currentTime + 3)
						this.music.playing.stop(this.actx.currentTime + 3)
					}

					const source = this.actx.createBufferSource()
					const volume = this.actx.createGain()

					volume.gain.value = this.music.volume
					source.buffer = data

					source.connect(volume)
					volume.connect(this.sfx.master)

					if (this.music.playing) this.music.playing.stop(this.actx.currentTime)
					source.start(this.actx.currentTime + 1)

					this.music.playing = source
					this.music.gainNode = volume
					this.music.playing.onended =  e=>{
						
						this.music.playing = false
						this.music.finishedAt = performance.now()
						this.music.nextIn = 1000 * 60 * 20 + (Math.random() * 2 - 1) * 1000 * 60 * 10

					}

				})
			})
		})
		

	}

	startSound(id, panning, loudness){
		if (this.sfx?.ready && !this.preventNoise){
			if (loudness === undefined) loudness = 1
			const source = this.actx.createBufferSource()
			const volume = this.actx.createGain()
			const pan = this.actx.createStereoPanner()
			pan.pan.value = panning || 0
			volume.gain.value = this.sfx.samples[id].volume * loudness || .5 * loudness
			source.buffer = this.sfx.samples[id].data
			source.loop = true
			if (this.sfx.samples[id].detune) source.detune.value = (Math.random() * 2 - 1) * this.sfx.samples[id].detune
			source.connect(pan)
			pan.connect(volume)
			volume.connect(this.sfx.master)
			
			source.start(this.actx.currentTime)
			// this.sfx.stackSize++

			return {source: source, volume: volume, pan: pan, baseVolume: this.sfx.samples[id].volume || .5}
		}
		return false
	}

	stopSound(sfx, t){
		if (this.sfx?.ready && sfx){
			sfx.volume.gain.exponentialRampToValueAtTime(.01, this.actx.currentTime + (t || 1))
			sfx.source.stop(this.actx.currentTime + (t || 1))
			// this.sfx.stackSize = Math.max(0, this.sfx.stackSize - 1)
		}
	}

	setLoudnessToSFX(sfx, l){
		if (this.sfx?.ready && sfx){
			sfx.volume.gain.value = sfx.baseVolume * l
		}
	}

	setPanToSFX(sfx, p){
		if (this.sfx?.ready && sfx){
			sfx.pan.pan.value = p
		}
	}

	addSoundSource(id, p, audibility = [1,0]){
		
		if (this.actx && this.actx.state !== `running`) this.actx.resume()
		if (!this.sfx?.ready || this.preventNoise) return false

		const source = this.actx.createBufferSource()
		const volume = this.actx.createGain()
		const pan = this.actx.createStereoPanner()
		const filter = this.actx.createBiquadFilter()
		filter.type = `lowpass`

		pan.pan.value = 0
		volume.gain.value = this.sfx.samples[id].volume ?? .5
		source.buffer = this.sfx.samples[id].data
		source.loop = true
		if (this.sfx.samples[id].detune) source.detune.value = (Math.random() * 2 - 1) * this.sfx.samples[id].detune
		
		source.connect(pan).connect(volume).connect(this.sfx.master)
		source.start(this.actx.currentTime)
		
		const soundSource = {
			position: p,
			source: source,
			volume: volume,
			pan: pan,
			filter: filter,
			baseVolume: this.sfx.samples[id].volume ?? .5,
			filterOn: false,
			audibility: audibility
		}

		this.soundSources.add(soundSource)

		this.updateSoundSource(soundSource)
		return soundSource
	}

	deleteSoundSource(s,t=1){

		if (!this.soundSources.has(s)) {
			console.warn(`Something wrong here with sounds`)
			return false
		}

		s.volume.gain.exponentialRampToValueAtTime(.01, this.actx.currentTime + t)
		s.source.stop(this.actx.currentTime + t)

		this.soundSources.delete(s)

		return true
	}

	playSound(id, panning, loudness, dark, forced){

		if (this.preventNoise) return
		if (this.actx && this.actx.state !== `running`) this.actx.resume()
		if (this.sfx?.ready && (this.sfx.stackSize < 128 || forced)){
			loudness = (loudness === undefined ? 1 : loudness)
			let filter
			let source = this.actx.createBufferSource()
			let volume = this.actx.createGain()
			let pan = this.actx.createStereoPanner()
			pan.pan.value = panning || 0
			volume.gain.value = this.sfx.samples[id].volume * loudness || .5 * loudness
			source.buffer = this.sfx.samples[id].data
			let detune = this.sfx.samples[id].detune ? (Math.random() * 2 - 1) * this.sfx.samples[id].detune : 0
			if (this.slowdown.state) {
				detune += (this.slowdown.multiplyer < 1 ? -100/this.slowdown.multiplyer : this.slowdown.multiplyer * 200) * this.slowdown.f
			}
			source.detune.value = detune
			source.connect(pan)
			pan.connect(volume)
			if (!this.plane || dark){
				volume.connect(this.sfx.master)
			} else {
				filter = this.actx.createBiquadFilter()
				filter.type = `lowpass`
				volume.connect(filter).connect(this.sfx.master)
			}
			this.sfx.stackSize++

			setTimeout(_=>{this.sfx.stackSize = Math.max(0, this.sfx.stackSize - 1)}, (this.sfx.samples[id].duration || source.buffer.duration) * 1000)
			source.start(this.actx.currentTime)
			source.stop(this.actx.currentTime + (this.sfx.samples[id].duration || source.buffer.duration))
		}

	}

	isWithinMemoryComplex(uv){

		//Manhattan
		const safe = 8
		return (uv[0] > this.memorycomplexCenter[0] - this.memorycomplexRadius - safe && uv[0] < this.memorycomplexCenter[0] + this.memorycomplexRadius + safe) && (uv[1] > this.memorycomplexCenter[1] - this.memorycomplexRadius - safe && uv[1] < this.memorycomplexCenter[1] + this.memorycomplexRadius + safe)

	}

	getRealPrice(name, sale, extra = 0){

		// if (price[i]) this.resources[i] += Math.floor(price[i] * (this.eraserType === 2 ? 1 : this.eraserType === 1 ? .9 : .5))

		const mult = this.codex.entities[name].priceExponent ? this.codex.entities[name].priceExponent ** Math.max(0, (this.entitiesInGame[name] + extra || 0) - (sale ? 1 : 0)) : 1
		const sellMult = sale ? (this.eraserType === 2 ? 1 : this.eraserType === 1 ? .9 : .5) : 1
		if (mult === 1) return this.codex.entities[name].price

		const realPrice = []
		for (let i = 0; i < this.codex.entities[name].price.length; i++){
			realPrice.push(this.codex.entities[name].price[i] * mult * sellMult)
		}
		return realPrice

	}


	canAfford(name){

		let can = true
		const price = this.getRealPrice(name)
		const source = this.resources

		for (let i = 0; i < price.length; i++){

			if (price[i] && (!source[i] || source[i] < price[i])){
				can = false
				break
			}

		}

		return can

	}

	clearCell(uv){
		const entity = this.entityAtCoordinates(uv)
		if (!entity) return
		if (entity.onDelete) entity.onDelete()
		const n = entity.getNeighbours()

		this.entitiesInGame[entity.name]--
		this.store.compositionUpdate()

		if (!entity.entitySpan) {
			delete this.stuffMap[`u${entity.position[0]}v${entity.position[1]}`]
		} else {
			const s = entity.entitySpan
			for (let dy = -s; dy <= s; dy++){
				for (let dx = -s; dx <= s; dx++){

					delete this.stuffMap[`u${entity.position[0]+dx}v${entity.position[1]+dy}`]

				}
			}
		}
		
		for (let i = 0; i < this.stuff.length; i++){
			if (this.stuff[i] === entity){
				this.stuff.splice(i,1)
				break
			}
		}

		//Orbifolds
		if (this.codex.entities[entity.name].type === `complete` && entity.name !== `whitehole`){
			const hole = this.addEntity(`whitehole`, entity.position)
			hole.tier = entity.tier ?? 1
			hole.init()
		}

		for (let i = 0; i < n.length; i++){
			if (n[i]) n[i].init()
		}

	}

	updateMouseData(x = this.mouse.sxy[0], y = this.mouse.sxy[1], adjustTap){

		this.mouse.sxy[0] = x
		this.mouse.sxy[1] = y
		this.mouse.xy[0] = x * this.pixelRatio
		this.mouse.xy[1] = y * this.pixelRatio

		// this.mouse.delta = ((x - this.mouse.lastOffset[0]) ** 2 + (y - this.mouse.lastOffset[1]) ** 2) ** .5
		this.mouse.delta = [x - this.mouse.lastOffset[0], y - this.mouse.lastOffset[1]]
		this.mouse.lastOffset[0] = x
		this.mouse.lastOffset[1] = y
		if (Math.abs(this.mouse.delta[0]) > .5 || Math.abs(this.mouse.delta[1]) > .5) this.mouse.positionChanged = true

		//What is there
		const uv = this.xyToUV([x, y])
		const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]

		if (adjustTap){
			//Tap adjust
			const C = this.entityAtCoordinates(targetCell)
			const B = this.entityAtCoordinates([targetCell[0] + 1, targetCell[1] + 1])
			const R = this.entityAtCoordinates([targetCell[0] + 1, targetCell[1]])
			const L = this.entityAtCoordinates([targetCell[0], targetCell[1] + 1])
			const right = (uv[1] - Math.floor(uv[1])) < (uv[0] - Math.floor(uv[0]))

			if (!C && (B && B instanceof Cube)){
				this.hoveredCell = [targetCell[0] + 1, targetCell[1] + 1]
				this.hoveredEntity = B
			} else if (!C && (R && R instanceof Cube) && right) {
				this.hoveredCell = [targetCell[0] + 1, targetCell[1]]
				this.hoveredEntity = R
			} else if (!C && (L && L instanceof Cube) && !right) {
				this.hoveredCell = [targetCell[0], targetCell[1] + 1]
				this.hoveredEntity = L
			} else {
				this.hoveredCell = targetCell
				this.hoveredEntity = this.entityAtCoordinates(this.hoveredCell)
			}
		} else {
			this.hoveredCell = targetCell
			this.hoveredEntity = this.entityAtCoordinates(this.hoveredCell)
		}

		this.hoveredResource = false
		const delta = this.screenUnit * .3
		for (let i = 0; i < this.resourceHomes.length; i++){
			const home = this.resourceHomes[i]
			if (this.mouse.xy[0] > home[0] - delta && this.mouse.xy[0] < home[0] + delta && this.mouse.xy[1] > home[1] - delta && this.mouse.xy[1] < home[1] + delta){
				this.hoveredResource = i
				break
			}

		}

		if (this.plane === 1 && this.hoveredEntity?.ondarkhover){
			this.hoveredEntity.ondarkhover()
		}

		// External labels for touch devices
		if (this.isMobile){
			const labelCell = [Math.floor(uv[0] + 1.7), Math.floor(uv[1] + 1.7)]
			const entity = this.entityAtCoordinates(labelCell)
			this.hoveredLabel = this.shouldBeFilled(entity) ? entity : false
		}

	}

	processMousemove2(xy, dxy, click){

		//OBSOLETE
		//WIP REMOVE
		console.log(`REMOVE`)

		if (this.interactionMode === `erase` && click){

			if (!this.eraseTarget || this.hoveredCell[0] !== this.eraseTarget[0] || this.hoveredCell[1] !== this.eraseTarget[1]){
				this.eraseTarget = this.hoveredCell
				this.updateEraseArea()
			}
				
		} else if (this.interactionMode === `relocate` && click){

			if (!this.selectionTarget || this.hoveredCell[0] !== this.selectionTarget[0] || this.hoveredCell[1] !== this.selectionTarget[1]){
				this.selectionTarget = this.hoveredCell
				this.updateRelocationArea()
			}

		}

		//Conditioned update
		if (xy){
			this.updateMouseData(xy[0],xy[1])
			if (dxy && click === 2){
				this.translation[0] -= dxy[0]
				this.translation[1] -= dxy[1]
			} else if (this.hoveredEntity && click === 1){
				const n = this.hoveredEntity.name
				const donotclick = (n === `cube` || n === `pump` || n === `pump2` || n === `waypoint` || n === `waypoint2` || n === `voidsculpture` || n === `strange` || n === `strange1` || n === `strange2` || n === `strange3` || n === `cookie` || n === `hollow` || n === `malformed`)
				if (!this.itemInHand && !this.plane && !donotclick){
					this.hoveredEntity?.onmousedown()
				}
			}
		}

		//Conditionless update
		const uv = this.xyToUV([this.mouse.sxy[0], this.mouse.sxy[1]])
		const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]
		this.hoveredCell = targetCell
		this.hoveredEntity = this.entityAtCoordinates(this.hoveredCell)

		this.hoveredResource = false
		const delta = this.screenUnit * .3
		for (let i = 0; i < this.resourceHomes.length; i++){
			const home = this.resourceHomes[i]
			if (this.mouse.xy[0] > home[0] - delta && this.mouse.xy[0] < home[0] + delta && this.mouse.xy[1] > home[1] - delta && this.mouse.xy[1] < home[1] + delta){
				this.hoveredResource = i
				break
			}

		}

		if (this.plane === 1 && this.hoveredEntity?.ondarkhover){
			this.hoveredEntity.ondarkhover()
		}

		this.canPlace = false
		if (this.itemInHand){
			const up = this.codex.entities[this.itemInHand.name].isUpgradeTo
			const base = this.hoveredCell && this.canAfford(this.itemInHand.name)
			const eraserOk = this.itemInHand.eraser && this.hoveredEntity && !this.hoveredEntity.indestructible && !(this.hoveredEntity instanceof Cube) && !((this.hoveredEntity instanceof Pump || this.hoveredEntity instanceof Gradient) && ((this.entitiesInGame[`pump`] || 0) + (this.entitiesInGame[`pump2`] || 0) + (this.entitiesInGame[`gradient`] || 0) < 2))
			const newOk = !this.itemInHand.eraser && !this.hoveredEntity && !(up && this.codex.entities[up].onlyone) && !(up && (this.itemInHand.name === `flower` || this.itemInHand.name === `fruit` || this.itemInHand.name === `gradient_rem`))
			const upgradeOk = this.hoveredEntity && !this.itemInHand.eraser && this.codex.entities[this.itemInHand.name]?.isUpgradeTo === this.hoveredEntity.name
			// this.canPlace = this.transportedEntity ? (!this.hoveredEntity || this.canRelocate(this.hoveredEntity)) : (base && (eraserOk || newOk || upgradeOk))
			let relocationOk = true
			if (this.transportedEntity){
				const span = this.transportedEntity.entitySpan
				for (let x = -span; x <= span; x++){
					for (let y = -span; y <= span; y++){
						const xy = [this.hoveredCell[0] + x, this.hoveredCell[1] + y]
						const e = this.entityAtCoordinates(xy)
						if (!e || e === this.transportedEntity || (x === 0 && y === 0 && e.entitySpan === this.transportedEntity.entitySpan && this.canRelocate(e))) continue
						relocationOk = false
						break
					}
				}
			}
			this.canPlace = this.transportedEntity ? relocationOk : (base && (eraserOk || newOk || upgradeOk))
			
		}

	}

	canPlaceEntityHere(e,p){

		if (this.isWithinMemoryComplex(p)) return false

		const name = e.name
		const entityAtPoint = this.entityAtCoordinates(p)
		let vacant = true
		const span = e.entitySpan ?? 0
		for (let x = -span; x <= span; x++){
			for (let y = -span; y <= span; y++){
				const xy = [p[0] + x, p[1] + y]
				if (this.isWithinMemoryComplex(xy)) return false
				const e = this.entityAtCoordinates(xy)
				if (e) {
					vacant = false
					break
				}
			}
		}
		const up = this.codex.entities[name].isUpgradeTo
		const legitUpgrade = entityAtPoint && up && up === entityAtPoint.name
		const legitBuildNew = vacant && this.canAfford(name) && !(up && this.codex.entities[up].onlyone) && !(up && (name === `flower` || name === `fruit` || name === `gradient_rem`))

		return legitUpgrade || legitBuildNew

	}

	canRelocateEntityHere(t,p){
		//Skip canRelocate check given it is made earlier
		let ok = true
		if (t){
			const span = t.entitySpan
			for (let x = -span; x <= span; x++){
				for (let y = -span; y <= span; y++){
					const xy = [p[0] + x, p[1] + y]
					const e = this.entityAtCoordinates(xy)
					if (!e || e === t || (x === 0 && y === 0 && e.entitySpan === t.entitySpan && this.canRelocate(e))) continue
					ok = false
					break
				}
			}
		}
		return ok
	}

	// processTouchDown(){

	// 	this.mouse.positionChanged = false
	// 	this.mouse.originalPosition = [...this.mouse.xy]

	// 	if (this.interactionMode === `erase`){
	// 		this.eraseOrigin = this.hoveredCell
	// 		this.eraseTarget = this.hoveredCell
	// 		this.updateEraseArea()
	// 		return
	// 	}

	// 	if (this.interactionMode === `relocate` && !this.relocationList){
	// 		this.relocationOrigin = this.hoveredCell
	// 		this.relocationTarget = this.hoveredCell
	// 		this.updateRelocationArea()
	// 		return
	// 	}

	// 	const cubeClicked = (this.hoveredEntity && this.hoveredEntity.name === `cube`)
	// 	if (!this.itemInHand || cubeClicked){

	// 		if (cubeClicked){
	// 			this.stats.totalCubeClicks++
	// 		}

	// 		let didntTouch = true
	// 		const uv = this.xyToUV([this.mouse.sxy[0], this.mouse.sxy[1]])
	// 		uv[0] += 1.7
	// 		uv[1] += 1.7

	// 		const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]
	// 		const entity = this.entityAtCoordinates(targetCell)

	// 		if (shouldBeFilled(entity)){
	// 			entity.refill()
	// 			didntTouch = false
	// 		}

	// 		if (didntTouch && this.hoveredEntity){

	// 			this.selectedEntity = this.hoveredEntity
	// 			if (!this.plane){
	// 				this.selectedEntity.onmousedown()
	// 			} else if (this.plane === 1 && this.selectedEntity.ondarkmousedown){
	// 				this.selectedEntity.ondarkmousedown()
	// 			}
				
	// 		}

	// 	}

	// }

	shouldBeFilled(entity){
		return entity && !(entity instanceof Cube) && entity.fill === 0 && entity.state !== 1
	}

	// processDown(rightclick){
	// 	//WIP OBSOLETE?
	// 	console.log(this.interactionMode)

	// 	if (this.interactionMode === `erase`){
	// 		this.eraseOrigin = this.hoveredCell
	// 		this.eraseTarget = this.hoveredCell
	// 		this.updateEraseArea()
	// 		return
	// 	}

	// 	// if (this.interactionMode === `relocate`){
	// 	// 	this.relocationOrigin = this.hoveredCell
	// 	// 	this.relocationTarget = this.hoveredCell
	// 	// 	this.updateRelocationArea()
	// 	// 	return
	// 	// }

	// 	if (!rightclick){

	// 		this.mouse.state = 1

	// 		//Hitbox check
	// 		const cubeClicked = (this.hoveredEntity && this.hoveredEntity.name === `cube`)
	// 		if (!this.itemInHand || cubeClicked){

	// 			if (cubeClicked){
	// 				this.stats.totalCubeClicks++
	// 			}

	// 			let didntTouch = true
	// 			if (this.isMobile){

	// 				const uv = this.xyToUV([this.mouse.sxy[0], this.mouse.sxy[1]])
	// 				uv[0] += 1.7
	// 				uv[1] += 1.7

	// 				const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]
	// 				const entity = this.entityAtCoordinates(targetCell)

	// 				if (entity && !(entity instanceof Cube) && entity.fill === 0 && entity.state !== 1){
	// 					entity.refill()
	// 					didntTouch = false
	// 				}

	// 			}

	// 			if (didntTouch && this.hoveredEntity){
	// 				// this.selectedCell = winner.position
	// 				this.selectedEntity = this.hoveredEntity
	// 				if (!this.plane){
	// 					this.selectedEntity.onmousedown()
	// 				} else if (this.plane === 1 && this.selectedEntity.ondarkmousedown){
	// 					this.selectedEntity.ondarkmousedown()
	// 				}
					
	// 			}

	// 			this.processMousemove2()

	// 		}

	// 	}

	// 	this.mouse.positionChanged = false
	// }

	processQ(){

		if (this.entitiesInGame.pinhole) return

		if (this.orbifoldUI){
			this.closeOrbifolds()
		} else if (!this.itemInHand && this.store.isOpen && !this.hoveredEntity) {
			this.store.closeTypes()
		} else if (this.itemInHand || this.interactionMode){ //Like esc, don't close the store
			this.cleanupInteractionMode()
		} else if (this.hoveredEntity && !this.plane){ // Copy
			this.store.centerItem(this.hoveredEntity.name)
			if (this.canAfford(this.hoveredEntity.name) && !this.onlyones[this.hoveredEntity.name] && this.codex.entities[this.hoveredEntity.name].canPurchase){
				this.pickupItem(this.hoveredEntity.name)
				this.pressedQOnMachine = true
			}
		} else if (!this.plane){ //Eraser
			this.store.closeTypes()
			if (this.pickupEraser()) this.pressedQOnBlank = true
		}
	}

	processE(){

		const ok = this.entitiesInGame.mega3 > 0 && !this.entitiesInGame.pinhole && !this.plane
		if (!ok) return

		if (this.interactionMode === `relocate`) {
			this.cleanupInteractionMode()
			return
		}

		this.interactionMode = `relocate`

		if (this.hoveredEntity){

			if (this.canRelocate(this.hoveredEntity)){
				this.selectionCandidateSet = new Set([this.hoveredEntity])
				this.pickupEntitiesForRelocation()
			} else {
				delete this.interactionMode
			}

		}


		// const ok = this.entitiesInGame.mega3 > 0 && this.hoveredEntity && this.canRelocate(this.hoveredEntity) && !this.plane && !this.entitiesInGame.pinhole

		// if (ok) {
		// 	this.interactionMode = `relocate`
		// 	this.transportedEntity = this.hoveredEntity
		// 	this.itemInHand = new this.codex.entities[this.hoveredEntity.name].class(this)
		// 	delete this.itemInHandPriceTag
		// 	delete this.itemInHandPriceAndRefundTag
		// }

	}

	canRelocate(e){
		if (!e || !e.name) return false
		return (this.codex.entities[e.name].canPurchase || e.name === `stabilizer3`) && !(e.name === `flower` || e.name === `fruit` || e.name === `strange1` || e.name === `strange2` || e.name === `strange3` || e.name === `pump` || e.name === `pump2` || e.name === `cube` || e.name === `gradient_rem` || e.name === `puncture`)
	}

	canClone(e){
		if (!e || !e.name) return false
		return this.codex.entities[e.name].canPurchase && !this.onlyones[e.name] && !(e.name === `flower` || e.name === `fruit`)
	}

	massRelocate(entities,positions){

		//WIP
		//No big machines swap with entitySpan > 0

		if (!entities.length || !positions.length || entities.length !== positions.length) return

		//Swapping entities
		const relocationSet = new Set(entities)
		const swapList = []
		const swapPositionList = []
		for (let i = 0; i < entities.length; i++){
			if(!this.canRelocate(entities[i])) return
			const se = this.entityAtCoordinates(positions[i])
			if (!se || relocationSet.has(se)) continue
			if (!this.canRelocate(se)) return
			swapList.push(se)
			swapPositionList.push([entities[i].position[0], entities[i].position[1]])
		}

		const e = [...entities, ...swapList]
		const p = [...positions, ...swapPositionList]

		//One chair two guys protection
		const targetSet = new Set()
		for (let i = 0; i < p.length; i++) {
			const uvstring = `u${p[i][0]}v${p[i][1]}`
			if (targetSet.has(uvstring)) return
			targetSet.add(uvstring)
		}

		//Clean up map
		for (let i = 0; i < e.length; i++){
			delete this.stuffMap[`u${e[i].position[0]}v${e[i].position[1]}`]
		}

		//Collect all the old and new neighbors
		let n = []
		for (let i = 0; i < e.length; i++){
			const locals = e[i].getNeighbours()
			if (locals) n.push(...locals)
		}

		//Write entities position without triggering init
		for (let i = 0; i < p.length; i++){
			e[i].position = [...p[i]]
		}

		//Collect new neighbours
		for (let i = 0; i < e.length; i++){
			const locals = e[i].getNeighbours()
			if (locals) n.push(...locals)
		}

		let neighbours = new Set(n)
		neighbours.delete(undefined)
		neighbours = Array.from(neighbours)

		//Write to the map
		for (let i = 0; i < p.length; i++){
			if (this.stuffMap[`u${p[i][0]}v${p[i][1]}`]){
				console.warn(`Something was overritten! It shouldn't happen.`)
			}
			this.stuffMap[`u${p[i][0]}v${p[i][1]}`] = e[i]
		}

		//Now trigger init
		for (let i = 0; i < e.length; i++){
			if (e[i].name === `gradient`){
				e[i].penalty = .5
			}
			// e[i].init()
			e[i].setPosition(e[i].position)
			
		}

		//And for the neighbours
		for (let i = 0; i < neighbours.length; i++){
			neighbours[i].init()
		}

		this.stuff.sort((a,b)=>a.position[0] + a.position[1] - b.position[0] - b.position[1])

		//SFX
		this.playSound(`place`)
		this.punchScreen()

	}

	massClone(entities, positions){

		//WIP: make upgrades
		//WIP: SUPER IMPORTANT: ONLYONES: I can relocate first and then just clone

		for (let i = 0; i < entities.length; i++){

			const e = entities[i]
			const p = positions[i]
			const ee = this.entityAtCoordinates(p)
			const up = this.codex.entities[e.name].isUpgradeTo

			const isLegitUpgrade = ee && up && up === ee.name
			const isLegitBuild = !ee && !(up && this.codex.entities[up].onlyone) && !(up && (e.name === `flower` || e.name === `fruit` || e.name === `gradient_rem`))

			if (isLegitUpgrade){

				this.clearCell(p)
				const price = this.getRealPrice(e.name)
				const refund = this.getRealPrice(ee.name)
				const xy = this.uvToXYUntranslated(p)
				this.createResourceTransfer(refund, xy, undefined, undefined, undefined, true)
				this.requestResources(price, p, _=>{}, true)
				this.addEntity(e.name, p)

				this.stats.machinesBuild++
				if (this.codex.entities[e.name].onlyone) this.onlyones[e.name] = true

			} else if (isLegitBuild){

				const price = this.getRealPrice(e.name)
				this.requestResources(price, p, false, true)
				const ne = this.addEntity(e.name, p)
				if (e.name === `gradient`){
					ne.penalty = .5
					ne.init()
				}

				this.stats.machinesBuild++
				if (this.codex.entities[e.name].onlyone) this.onlyones[e.name] = true

			}

		}

		//SFX
		this.playSound(`place`)
		this.punchScreen()
		// this.shop.check()

	}

	relocate(e,p){

		//WIP V2.0: trusted swappingEntities list
		let okay = true
		// const swappingEntities = new Map()
		if (this.transportedEntity){
			const span = this.transportedEntity.entitySpan
			for (let x = -span; x <= span; x++){
				for (let y = -span; y <= span; y++){
					const xy = [p[0] + x, p[1] + y]
					const e2 = this.entityAtCoordinates(xy)
					if (!e2 || e2 === e || (x === 0 && y === 0 && e.entitySpan === e2.entitySpan && this.canRelocate(e2))) continue
					okay = false
					break
				}
			}
		}

		if (!okay) return

		const n = e.getNeighbours()
		const targetEntity = this.entityAtCoordinates(p)
		if (targetEntity && targetEntity !== e && (targetEntity.entitySpan > 0 || !(this.canRelocate(targetEntity)))) return

		//Clean up without triggering ondelete
		if (!e.entitySpan) {
			delete this.stuffMap[`u${e.position[0]}v${e.position[1]}`]
		} else {
			const s = e.entitySpan
			for (let dy = -s; dy <= s; dy++){
				for (let dx = -s; dx <= s; dx++){
					delete this.stuffMap[`u${e.position[0]+dx}v${e.position[1]+dy}`]
				}
			}
		}

		//relocate
		if (!e.entitySpan) {
			this.stuffMap[`u${p[0]}v${p[1]}`] = e
		} else {
			const s = e.entitySpan
			for (let dy = -s; dy <= s; dy++){
				for (let dx = -s; dx <= s; dx++){
					this.stuffMap[`u${p[0]+dx}v${p[1]+dy}`] = e
				}
			}
		}

		//swap
		if (targetEntity && targetEntity !== e) {
			this.stuffMap[`u${e.position[0]}v${e.position[1]}`] = targetEntity
			targetEntity.setPosition([...e.position])
		}
		
		e.setPosition(p)

		//SFX
		const screenxy = this.uvToXYUntranslated(p)
		const pan = this.getPanValueFromX(screenxy[0])
		this.playSound(`place`, pan)
		this.punchScreen()


		this.stuff.sort((a,b)=>a.position[0] + a.position[1] - b.position[0] - b.position[1])

		//update new neighbours
		for (let i = 0; i < e.soi.length; i++){
			const cell = this.stuffMap[`u${e.position[0] + e.soi[i][0]}v${e.position[1] + e.soi[i][1]}`]
			if (cell){
				cell.init()
			}
		}

		//update previous neighbours
		for (let i = 0; i < n.length; i++){
			if (n[i]) n[i].init()
		}

	}

	processClick(){

		console.log(`DEPRECATED`)

		//WIP: UNTANGLE and make universal checks for both move and place
		//1. Have nothing
		//1.1 Clicked empty
		//1.2 Clicked entity

		//2. Want to build, have item in hand
		//2.1 Can build here
		//2.1.1 Build on empty cell
		//2.1.2 Upgrade hovered entity
		//2.2 Can't build here
		//2.2.1 Can't afford
		//2.2.2 There's something there
		//2.2.3 Can only build on specific entity

		//3. Want to relocate, have transported entity
		//3.1 Can place here
		//3.1.1 Place on empty spot
		//3.1.2 Can place and relocate what's there already
		//3.2 Can't place here

		//4. Want to destroy
		//4.1 Can destroy
		//4.2 Can't destroy




		const ok = this.itemInHand && this.hoveredCell && this.canAfford(this.itemInHand.name) && !(this.itemInHand.eraser && (this.hoveredEntity instanceof Pump || this.hoveredEntity instanceof Gradient) && ((this.entitiesInGame[`pump`] || 0) + (this.entitiesInGame[`pump2`] || 0) + (this.entitiesInGame[`gradient`] || 0) < 2))
		
		// if (this.transportedEntity && this.hoveredCell && this.resources[4] >= 1){
		if (this.transportedEntity && this.hoveredCell){

			//Relocation
			// this.requestResources([0,0,0,0,1], this.hoveredCell, false, true)
			this.relocate(this.transportedEntity, this.hoveredCell)
			if (this.itemInHand.name === `gradient`){
				this.transportedEntity.penalty = .5
				this.transportedEntity.init()
			}
			delete this.transportedEntity
			delete this.itemInHand

		} else if (ok){
			// const entityHere = this.entityAtCoordinates(this.hoveredCell)

			//Just your regular item placement
			const up = this.codex.entities[this.itemInHand.name].isUpgradeTo
			// if (!this.hoveredEntity && !this.itemInHand.eraser && !this.codex.entities[this.itemInHand.name].isUpgradeTo){
			if (!this.hoveredEntity && !this.itemInHand.eraser && !(up && this.codex.entities[up].onlyone) && !(up && (this.itemInHand.name === `flower` || this.itemInHand.name === `fruit` || this.itemInHand.name === `gradient_rem`))){

				const price = this.getRealPrice(this.itemInHand.name)

				this.requestResources(price, this.hoveredCell, false, true)

				const e = this.addEntity(this.itemInHand.name, this.hoveredCell)
				if (this.itemInHand.name === `gradient`){
					e.penalty = .5
					e.init()
				}

				//SFX
				const screenxy = this.uvToXYUntranslated(this.hoveredCell)
				const pan = this.getPanValueFromX(screenxy[0])
				this.playSound(`place`, pan)
				this.punchScreen()

				this.stats.machinesBuild++
				if (this.shop.mobileToggle) {
					this.shop.mobileToggle.classList.remove(`active`)
					this.shop.toggleAllButShop()
				}
				this.processMousemove2()

				if (this.codex.entities[this.itemInHand.name].onlyone){
					this.onlyones[this.itemInHand.name] = true
					this.shop.check()
					delete this.itemInHand
				} else if (!this.canAfford(this.itemInHand?.name)){
					delete this.itemInHand
				} else {
					this.pickupItem(this.itemInHand.name)
				}
				
				// console.log(this.itemInHand)
				// if (this.itemInHand && !this.canAfford(this.itemInHand.name)) { //zzz random error in console "Cannot read properties of undefined (reading 'name')" fixed?
				// 	delete this.itemInHand
				// } else {
				// 	this.pickupItem(this.itemInHand.name) // to update the price
				// }
				// delete this.hoveredCell

			//Erasing
			} else if (this.hoveredEntity && this.itemInHand.eraser && !(this.hoveredEntity instanceof Cube) && !this.hoveredEntity.indestructible){

				//REFUND
				const price = this.getRealPrice(this.hoveredEntity.name, true)
				const xy = this.uvToXYUntranslated(this.hoveredCell)

				if (this.codex.entities[this.hoveredEntity.name].onlyone){

					let chainElement = this.codex.entities[this.hoveredEntity.name]
					while (chainElement.isUpgradeTo){
						delete this.onlyones[chainElement.isUpgradeTo]
						chainElement = this.codex.entities[chainElement.isUpgradeTo]
					}

					if (this.codex.entities[this.hoveredEntity.name].isUpgradeTo){
						delete this.onlyones[this.codex.entities[this.hoveredEntity.name].isUpgradeTo]
					}

					delete this.onlyones[this.hoveredEntity.name]
					this.shop.check()

				}

				this.createResourceTransfer(price, xy, undefined, undefined, undefined, true)

				//SFX
				const pan = this.getPanValueFromX(xy[0])
				this.playSound(`recycle`, pan)

				this.requestResources(this.getRealPrice(this.itemInHand.name), this.hoveredCell, false, true) //just the cost of erasing
				this.clearCell(this.hoveredCell)
				this.stats.machinesSold++
				this.stats.timeSinceLastDelete = 0
				this.hoveredEntity = undefined

			//Upgrading
			} else if (this.hoveredEntity && !this.itemInHand.eraser && this.codex.entities[this.itemInHand.name]?.isUpgradeTo === this.hoveredEntity.name){

				if (this.itemInHand.name === `pinhole`){
					this.saveGame()
					this.preventSaving = true
				}
				
				this.clearCell(this.hoveredCell)
				if (this.itemInHand.name !== `pinhole`) this.stats.timeSinceLastDelete = 0

				const price = this.getRealPrice(this.itemInHand.name)
				const refund = this.getRealPrice(this.hoveredEntity.name)
				
				this.createResourceTransfer(refund, this.uvToXYUntranslated(this.hoveredCell), undefined, undefined, undefined, true)
				this.requestResources(price, this.hoveredCell, _=>{}, true)
				this.addEntity(this.itemInHand.name, this.hoveredEntity.position)

				//SFX
				const screenxy = this.uvToXYUntranslated(this.hoveredEntity.position)
				const pan = this.getPanValueFromX(screenxy[0])
				this.playSound(`place`, pan)
				this.punchScreen()

				this.stats.machinesBuild++
				if (this.shop.mobileToggle) {
					this.shop.mobileToggle.classList.remove(`active`)
					this.shop.toggleAllButShop()
				}
				if (this.codex.entities[this.itemInHand.name].onlyone) {
					this.onlyones[this.itemInHand.name] = true
					delete this.itemInHand
				} else if (!this.canAfford(this.itemInHand?.name)){
					delete this.itemInHand
				} else {
					this.pickupItem(this.itemInHand.name) // to update the price
				}
				this.shop.check()
				// delete this.hoveredCell

			//Cancel build mode if click on machine
			} else if (this.itemInHand && this.hoveredEntity?.name !== `cube`) {
				delete this.itemInHand
				if (this.shop.mobileToggle) {
					this.shop.mobileToggle.classList.remove(`active`)
					this.shop.toggleAllButShop()
				}
			}
		}
		

		// if (this.plane === 1){

		// 	if (this.hoveredEntity && this.hoveredEntity instanceof Pump){
		// 		this.createDarkLink(this.hoveredEntity)
		// 	}

		// }

	}

	processTouchUp(){
		this.mouse.state = 0
		this.mouse.timer = this.mouse.maxTimer
		if (this.selectedEntity && !this.plane) this.selectedEntity.onmouseup()
		this.selectedEntity = false
	}

	processMouseup(){

		if (this.interactionMode === `erase`){
			this.finalizeErase()
			return
		}

		this.mouse.state = 0
		this.mouse.timer = this.mouse.maxTimer
		if (this.selectedEntity && !this.plane) this.selectedEntity.onmouseup()
		this.selectedEntity = false
	}

	processMouseout(){
		if (!this.isMobile) this.mouse.cursorVisible = false
		if (this.selectedEntity && !this.plane) this.selectedEntity.onmouseup()
		this.selectedEntity = false
		this.removeHint()
	}

	zoomInOut(delta){
		this.zoom *= Math.exp(delta * 0.001)
		this.zoom = Math.min(this.zoomRange[1], Math.max(this.zoomRange[0], this.zoom))
		// this.zoom = Math.min(this.zoomRange[1], Math.max(this.zoomRange[0], this.zoom + delta * this.time.realDt * .0002))
	}

	doOnBlur(){

		if (this.isInBackground) return

		this.isInBackground = true
		if (!this.isMute) this.fadeSound(0)
		this.shiftPressed = false
		this.altActive = false
		document.body.classList.remove(`altHolded`)
		this.translationMap[0] = 0
		this.translationMap[1] = 0
		this.translationMap[2] = 0
		this.translationMap[3] = 0

		if (this.isMobile){
			this.halt = true
			this.blurTimeStamp = Date.now()
		}
	}

	doOnFocus(){

		if (!this.isInBackground) return
		
		delete this.isInBackground
		if (this.isMobile){
			this.halt = false
			if (this.actx) this.actx.resume()
			if (this.blurTimeStamp) {
				const delta = Date.now() - this.blurTimeStamp
				delete this.blurTimeStamp
				this.simulateIdleTime(delta)
			}
		}

		if (!this.isMute) this.fadeSound(1)
		this.mouse.cursorVisible = true
	}

	toggleSplash(){
		if (this.splash.isShown){
			if (!this.actx && !this.splash?.gameIsMute) this.initAudio()
			this.splash.close()
		} else {
			this.splash.show()
		}
	}

	// canEraseNow(){
	// 	return this.canAfford(this.eraserType === 1 ? `eraser2` : this.eraserType === 2 ? `eraser3` : `eraser`) && this.hoveredEntity && !(this.hoveredEntity instanceof Cube) && !this.hoveredEntity.indestructible && !((this.hoveredEntity instanceof Pump || this.hoveredEntity instanceof Gradient) && ((this.entitiesInGame[`pump`] || 0) + (this.entitiesInGame[`pump2`] || 0) + (this.entitiesInGame[`gradient`] || 0) < 2))
	// }
	//TST NEW ERASE
	canEraseEntity(e){
		return e && !(e instanceof Cube) && !e.indestructible && !((e instanceof Pump || e instanceof Gradient) && ((this.entitiesInGame[`pump`] || 0) + (this.entitiesInGame[`pump2`] || 0) + (this.entitiesInGame[`gradient`] || 0) < 2))
	}

	createRipple(c){
		this.vfx.push(new Ripple(this, {source: c, visibility: [1,1]}))
	}

	setListenersMobile(){

		this.canvas.addEventListener(`touchstart`, e=>{

			if (e.target === this.canvas) e.preventDefault()

			const twoFingers = e.touches[1] !== undefined
			const currentTouch = twoFingers ? e.touches[1] : e.touches[0]
			if (twoFingers) {
				this.mouse.fingerChanged = true
				this.mouse.fingerDelta = ((e.touches[1].clientX - e.touches[0].clientX) ** 2 + (e.touches[1].clientY - e.touches[0].clientY) ** 2) ** .5
			}

			// this.mouse.state = 1
			this.updatePointerState({sxy: [currentTouch.clientX, currentTouch.clientY], button: 1, isTap: true, adjustTap: true})
			// this.updateMouseData(currentTouch.clientX, currentTouch.clientY, !this.touchMode)
			this.mouse.positionChanged = false

			this.createRipple(this.hoveredCell)

			this.processDown()

			//TST NEW DELETE
			// if (this.touchMode === 1){
			// 	this.eraseOrigin = this.hoveredCell
			// 	this.eraseTarget = this.hoveredCell
			// 	this.updateEraseArea()
			// } else if (this.touchMode === 2 && !this.cloneAreaSelected){
			// 	this.cloneOrigin = this.hoveredCell
			// 	this.cloneTarget = this.hoveredCell
			// 	this.updateCloneArea()
			// }

			//WIP LOOKS IMPORTANT
			// this.mouse.currentAction = (this.touchMode === 1 && !this.plane && this.hoveredEntity) ? `erase` : (this.touchMode === 2 && !this.transportedEntity && this.entitiesInGame.mega3 > 0 && this.hoveredEntity && this.canRelocate(this.hoveredEntity) && !this.plane && !this.entitiesInGame.pinhole) ? `pickupForRelocation` : (this.transportedEntity && this.hoveredCell  && !this.plane) ? `relocate` : (this.itemInHand && this.hoveredCell && this.canAfford(this.itemInHand.name)) ? `build` : (this.hoveredLabel && !this.plane) ? `refill` : (this.hoveredEntity && this.hoveredEntity instanceof Cube && !this.plane) ? `break` : this.hoveredEntity ? `entity` : `empty`

			// if (this.mouse.currentAction === `erase`){

			// 	// const eraser = this.eraserType === 1 ? `eraser2` : this.eraserType === 2 ? `eraser3` : `eraser`
			// 	// const eraserOk = this.canEraseNow()
			// 	// if (eraserOk) this.pickupItem(eraser)


			// } else if (this.mouse.currentAction === `pickupForRelocation`) {

			// 	// this.transportedEntity = this.hoveredEntity
			// 	// this.itemInHand = new this.codex.entities[this.hoveredEntity.name].class(this)
			// 	// delete this.itemInHandPriceTag
			// 	// delete this.itemInHandPriceAndRefundTag

			// } else if (this.mouse.currentAction === `build`){

			// 	this.pickupItem(this.itemInHand.name)

			// } else if (this.mouse.currentAction === `refill`){
			// 	this.hoveredLabel.refill()
			// } else if ((this.mouse.currentAction === `entity` && !this.shouldBeFilled(this.hoveredEntity)) || this.mouse.currentAction === `break`){
			// 	if (!this.plane) {
			// 		this.hoveredEntity.onmousedown()
			// 	} else if (this.hoveredEntity.ondarkmousedown){
			// 		this.hoveredEntity.ondarkmousedown()
			// 	}
			// }

			
			
		})

		this.canvas.addEventListener(`touchend`, e=>{

			e.preventDefault()

			if (e.touches.length > 0) this.mouse.fingerChanged = true; else this.mouse.fingerChanged = false

			// this.mouse.state = 0

			this.updatePointerState({sxy: [e.changedTouches[0].clientX, e.changedTouches[0].clientY], button: this.mouse.state, isTap: true})

			this.processUp()


			//WIP: Move to processUp

			// //TST NEW DELETE
			// let legitClone = true, legitRelocate = true
			// //Erase confirmation
			// if (this.touchMode === 1 && this.eraseList){

			// 	this.finalizeErase()

			// // Clone/move area select
			// } else if (this.touchMode === 2 && this.cloneList && !this.cloneAreaSelected){

			// 	let canAfford = true
			// 	for (let i = 0; i < this.totalCloneCost.length; i++){
			// 		if (this.totalCloneCost[i] > this.resources[i]){
			// 			canAfford = false
			// 			break
			// 		}
			// 	}

			// 	if (this.massRelocation) canAfford = true

			// 	if (!canAfford || !this.cloneList.length){
			// 		this.shop.toggleMobileRelocator()
			// 		this.cleanupClone()
			// 	} else {

			// 		this.cloneAreaSelected = true
			// 		this.cloneAreaOrigin = this.xyToUV([0,0])
			// 		this.cloneEntitiesList = []
			// 		this.cloneEntitiesPositionsList = []
			// 		for (let i = 0; i < this.cloneList.length; i++){
			// 			const e = new this.codex.entities[this.cloneList[i].name].class(this)
			// 			const p = [...this.cloneList[i].position]
			// 			this.cloneEntitiesPositionsList.push([...p])
			// 			e.position = [...p]
			// 			this.cloneEntitiesList.push(e)
			// 		}

			// 	}

			// // Clone/move confirmation
			// } else if (this.touchMode === 2 && this.cloneAreaSelected && !this.mouse.positionChanged){

			// 	let clickedGreen = false

			// 	for (let i = 0; i < this.cloneEntitiesList.length; i++){
			// 		if (this.hoveredCell[0] === this.cloneEntitiesList[i].position[0] && this.hoveredCell[1] === this.cloneEntitiesList[i].position[1]){
			// 			clickedGreen = true	
			// 		}
			// 	}

			// 	if (this.massRelocation && clickedGreen){

			// 		const dict = {}
			// 		for (let i = 0; i < this.cloneList.length; i++){
			// 			dict[`u${this.cloneList[i].position[0]}v${this.cloneList[i].position[1]}`] = true
			// 		}

			// 		let relocationCondition = true
			// 		for (let i = 0; i < this.cloneEntitiesList.length; i++){
			// 			if (!this.canRelocate(this.cloneList[i]) || (this.entityAtCoordinates(this.cloneEntitiesList[i].position) && !dict[`u${this.cloneEntitiesList[i].position[0]}v${this.cloneEntitiesList[i].position[1]}`])){
			// 				relocationCondition = false
			// 				break
			// 			}
			// 		}

			// 		if (relocationCondition) {

			// 			this.confirmMassRelocation()
			// 		}

			// 	} else if (clickedGreen) {

			// 		let canAfford = true
			// 		for (let i = 0; i < this.totalCloneCost.length; i++){
			// 			if (this.totalCloneCost[i] > this.resources[i]){
			// 				canAfford = false
			// 				break
			// 			}
			// 		}

			// 		if (canAfford){

			// 			this.confirmMassClone()

			// 		}

			// 	}

			// 	this.shop.toggleMobileRelocator()
			// 	this.cleanupClone()
			
			// // Adjusting the placement
			// } else if (this.touchMode === 2 && this.cloneAreaSelected && this.mouse.positionChanged){

			// 	let canConfirm = true

			// 	if (this.massRelocation){

			// 		const dict = {}
			// 		for (let i = 0; i < this.cloneList.length; i++){
			// 			dict[`u${this.cloneList[i].position[0]}v${this.cloneList[i].position[1]}`] = true
			// 		}

			// 		for (let i = 0; i < this.cloneEntitiesList.length; i++){
			// 			if (!this.canRelocate(this.cloneList[i]) || (this.entityAtCoordinates(this.cloneEntitiesList[i].position) && !dict[`u${this.cloneEntitiesList[i].position[0]}v${this.cloneEntitiesList[i].position[1]}`])){
			// 				canConfirm = false
			// 				break
			// 			}
			// 		}

			// 	} else {

			// 		for (let i = 0; i < this.totalCloneCost.length; i++){
			// 			if (this.totalCloneCost[i] > this.resources[i]){
			// 				canConfirm = false
			// 				break
			// 			}
			// 		}

			// 		if (canConfirm){

			// 			let haveAtLeastOne = false

			// 			for (let i = 0; i < this.cloneEntitiesList.length; i++){

			// 				const e = this.cloneEntitiesList[i]
			// 				const ee = this.entityAtCoordinates(e.position)
			// 				const up = this.codex.entities[e.name].isUpgradeTo

			// 				const isLegitUpgrade = ee && up && up === ee.name
			// 				const isLegitBuild = !ee && !(up && this.codex.entities[up].onlyone) && !(up && (e.name === `flower` || e.name === `fruit` || e.name === `gradient_rem`))

			// 				if (isLegitUpgrade || isLegitBuild){
			// 					haveAtLeastOne = true
			// 					break
			// 				}

			// 			}

			// 			if (!haveAtLeastOne) canConfirm = false

			// 		}

			// 	}

			// 	if (canConfirm) this.shop.mobileConfirmButton.classList.remove(`hidden`); else this.shop.mobileConfirmButton.classList.add(`hidden`)

			// }

			// if (this.mouse.currentAction === `build` && this.itemInHand && !this.mouse.positionChanged){

			// 	const up = this.codex.entities[this.itemInHand.name].isUpgradeTo

			// 	if (!this.hoveredEntity && !(up && this.codex.entities[up].onlyone) && !(up && (this.itemInHand.name === `flower` || this.itemInHand.name === `fruit` || this.itemInHand.name === `gradient_rem`))){

			// 		const price = this.getRealPrice(this.itemInHand.name)

			// 		this.requestResources(price, this.hoveredCell, false, true)

			// 		const e = this.addEntity(this.itemInHand.name, this.hoveredCell)
			// 		if (this.itemInHand.name === `gradient`){
			// 			e.penalty = .5
			// 			e.init()
			// 		}
			// 		this.stats.machinesBuild++

			// 		//SFX
			// 		const screenxy = this.uvToXYUntranslated(this.hoveredCell)
			// 		const pan = this.getPanValueFromX(screenxy[0])
			// 		this.playSound(`place`, pan)
			// 		this.punchScreen()
					
			// 		this.updateMouseData()
			// 		this.mouse.positionChanged = false

			// 		if (this.codex.entities[this.itemInHand.name].onlyone){
			// 			this.onlyones[this.itemInHand.name] = true
			// 			this.shop.check()
			// 			delete this.itemInHand
			// 			this.shop.mobileToggle.classList.remove(`active`)
			// 			this.shop.toggleAllButShop()
			// 		// } else if (!this.canAfford(this.itemInHand?.name)){
			// 		// 	delete this.itemInHand
			// 		// 	this.shop.mobileToggle.classList.remove(`active`)
			// 		// } else {
			// 		// 	this.pickupItem(this.itemInHand.name)
			// 		// }
			// 		} else {
			// 			delete this.itemInHand
			// 			this.shop.mobileToggle.classList.remove(`active`)
			// 			this.shop.toggleAllButShop()
			// 		}

			// 	} else if (this.hoveredEntity && up === this.hoveredEntity.name){

			// 		if (this.itemInHand.name === `pinhole`){
			// 			this.saveGame()
			// 			this.preventSaving = true
			// 		}
					
			// 		this.clearCell(this.hoveredCell)
			// 		if (this.itemInHand.name !== `pinhole`) this.stats.timeSinceLastDelete = 0

			// 		const price = this.getRealPrice(this.itemInHand.name)
			// 		const refund = this.getRealPrice(this.hoveredEntity.name)
					
			// 		this.createResourceTransfer(refund, this.uvToXYUntranslated(this.hoveredCell), undefined, undefined, undefined, true)
			// 		this.requestResources(price, this.hoveredCell, _=>{}, true)
			// 		this.addEntity(this.itemInHand.name, this.hoveredEntity.position)
			// 		this.stats.machinesBuild++

			// 		//SFX
			// 		const screenxy = this.uvToXYUntranslated(this.hoveredCell)
			// 		const pan = this.getPanValueFromX(screenxy[0])
			// 		this.playSound(`place`, pan)
			// 		this.punchScreen()

			// 		// if (this.shop.mobileToggle) this.shop.mobileToggle.classList.remove(`active`)

			// 		if (this.codex.entities[this.itemInHand.name].onlyone) {
			// 			this.onlyones[this.itemInHand.name] = true
			// 			delete this.itemInHand
			// 			this.shop.mobileToggle.classList.remove(`active`)
			// 			this.shop.toggleAllButShop()
			// 		// } else if (!this.canAfford(this.itemInHand?.name)){
			// 		// 	delete this.itemInHand
			// 		// 	this.shop.mobileToggle.classList.remove(`active`)
			// 		// } else {
			// 		// 	this.pickupItem(this.itemInHand.name)
			// 		// }
			// 		} else {
			// 			delete this.itemInHand
			// 			this.shop.mobileToggle.classList.remove(`active`)
			// 			this.shop.toggleAllButShop()
			// 		}
			// 		this.shop.check()
				
			// 	} else if (this.itemInHand && this.hoveredEntity?.name !== `cube`) {
			// 		delete this.itemInHand
			// 		if (this.shop.mobileToggle) {
			// 			this.shop.mobileToggle.classList.remove(`active`)
			// 			this.shop.toggleAllButShop()
			// 		}
			// 	}
			// } else if (this.mouse.currentAction === `entity`){
			// 	this.hoveredEntity?.onmouseup()
			// } else if (this.mouse.currentAction === `relocate` && !this.mouse.positionChanged){

			// 	//Relocation
			// 	// this.requestResources([0,0,0,0,1], this.hoveredCell, false, true)

			// 	this.relocate(this.transportedEntity, this.hoveredCell)
			// 	delete this.transportedEntity
			// 	delete this.itemInHand

			// 	this.touchMode = 0
			// 	this.shop.updateMobileMenuState()

			// }

			// this.mouse.timer = this.mouse.maxTimer
			// // if (this.selectedEntity && !this.plane) this.selectedEntity.onmouseup()
			// this.selectedEntity = false
			// if (this.itemInHand?.eraser) delete this.itemInHand

			// delete this.mouse.currentAction
		})

		this.canvas.addEventListener(`touchmove`, e=>{

			if (e.target === this.canvas) e.preventDefault()

			if (e.touches[1]){

				const fingerDelta = ((e.touches[1].clientX - e.touches[0].clientX) ** 2 + (e.touches[1].clientY - e.touches[0].clientY) ** 2) ** .5
				const zoom = fingerDelta - this.mouse.fingerDelta
				this.mouse.fingerDelta = fingerDelta

				this.zoom = Math.min(this.zoomRange[1], Math.max(this.zoomRange[0], this.zoom + zoom * .004))
				if (this.interactionMode === `relocate`) this.updateRelocationPositioning()
				this.mouse.positionChanged = true

			} else {

				if (this.mouse.fingerChanged) return
				this.updatePointerState({sxy: [e.touches[0].clientX, e.touches[0].clientY], button: 1, isTap: true})
				this.processMove()
				this.updateGlobalPositioning()

			}

			// const prevEntity = this.hoveredEntity
			// this.updateMouseData(e.touches[0].clientX, e.touches[0].clientY)
			// const nextEntity = this.hoveredEntity

			// if (prevEntity !== nextEntity && prevEntity?.onmouseup) prevEntity.onmouseup()

			//TST NEW DELETE
			// if (this.touchMode === 1){
			// 	if (!this.eraseTarget || this.hoveredCell[0] !== this.eraseTarget[0] || this.hoveredCell[1] !== this.eraseTarget[1]){
			// 		this.eraseTarget = this.hoveredCell
			// 		this.updateEraseArea()
			// 	}
				
			// } else if (this.touchMode === 2){
			// 	if (!this.cloneAreaSelected){
			// 		if (!this.cloneTarget || this.hoveredCell[0] !== this.cloneTarget[0] || this.hoveredCell[1] !== this.cloneTarget[1]){
			// 			this.cloneTarget = this.hoveredCell
			// 			this.updateCloneArea()
			// 		}	
			// 	} else {
			// 		this.translation[0] -= this.mouse.delta[0] * this.pixelRatio / this.zoom
			// 		this.translation[1] -= this.mouse.delta[1] * this.pixelRatio / this.zoom

			// 		const currentPosition = this.xyToUV([0,0])
			// 		const offset = [-Math.round(this.cloneAreaOrigin[0] - currentPosition[0]), -Math.round(this.cloneAreaOrigin[1] - currentPosition[1])]
			// 		// let offsetChanged = this.cloneEntitiesList.length && (this.cloneEntitiesList[0].position[0] !== this.cloneEntitiesPositionsList[0][0] + offset[0] || this.cloneEntitiesList[0].position[1] !== this.cloneEntitiesPositionsList[0][1] + offset[1])
					
			// 		for (let i = 0; i < this.cloneEntitiesList.length; i++){
			// 			this.cloneEntitiesList[i].position[0] = this.cloneEntitiesPositionsList[i][0] + offset[0]
			// 			this.cloneEntitiesList[i].position[1] = this.cloneEntitiesPositionsList[i][1] + offset[1]
			// 		}

			// 		// console.log(offsetChanged)

			// 	}
				
				
			// } else {
			// // if (this.mouse.currentAction !== `erase`){
			// 	this.translation[0] -= this.mouse.delta[0] * this.pixelRatio / this.zoom
			// 	this.translation[1] -= this.mouse.delta[1] * this.pixelRatio / this.zoom
			// }
			
		})

	}

	finalizeErase(){

		const xy = this.uvToXYUntranslated(this.hoveredCell)

		for (let e of this.selectionCandidateSet){

			let chainElement = this.codex.entities[e.name]
			while (chainElement.isUpgradeTo){
				delete this.onlyones[chainElement.isUpgradeTo]
				chainElement = this.codex.entities[chainElement.isUpgradeTo]
			}

			if (this.codex.entities[e.name].isUpgradeTo){
				delete this.onlyones[this.codex.entities[e.name].isUpgradeTo]
			}

			delete this.onlyones[e.name]

			this.clearCell(e.position)
			this.stats.machinesSold++

			//Memory wipe
			for (let i = 0; i < this.memoryBuffer.length; i++){
				if (this.memoryBuffer[i].position[0] === e.position[0] && this.memoryBuffer[i].position[1] === e.position[1]){
					this.memoryBuffer.splice(i,1)
					break
				}
			}

		}

		this.createResourceTransfer(this.totalRefund, xy, undefined, undefined, undefined, true)

		this.stats.timeSinceLastDelete = 0
		this.hoveredEntity = undefined
		this.updateMouseData()

		//SFX
		const pan = this.getPanValueFromX(xy[0])
		this.playSound(`recycle`, pan)
		
		this.cleanupInteractionMode()

	}

	pickupEntitiesForRelocation(){

		this.selectionList = []

		// const xy = this.uvToXYUntranslated(this.hoveredCell)

		for (let e of this.selectionCandidateSet){

			if (this.canRelocate(e)) this.selectionList.push(e)

		}

		this.selectionOffsets = []
		const center = [0,0]

		for (let i = 0; i < this.selectionList.length; i++){

			center[0] += this.selectionList[i].position[0]
			center[1] += this.selectionList[i].position[1]

		}

		center[0] = Math.floor(center[0] / this.selectionList.length)
		center[1] = Math.floor(center[1] / this.selectionList.length)

		for (let i = 0; i < this.selectionList.length; i++){

			this.selectionOffsets.push([
				this.selectionList[i].position[0] - center[0],
				this.selectionList[i].position[1] - center[1]
			])

		}

		delete this.selectionOrigin
		delete this.selectionTarget
		delete this.selectionCandidateSet
	}

	pickupEntitiesForCloning(){

		//WIP: make in a single function with relocation

		this.selectionList = []

		for (let e of this.selectionCandidateSet){
			this.selectionList.push(e)
		}

		this.selectionOffsets = []
		const center = [0,0]

		for (let i = 0; i < this.selectionList.length; i++){

			center[0] += this.selectionList[i].position[0]
			center[1] += this.selectionList[i].position[1]

		}

		center[0] = Math.floor(center[0] / this.selectionList.length)
		center[1] = Math.floor(center[1] / this.selectionList.length)

		for (let i = 0; i < this.selectionList.length; i++){

			this.selectionOffsets.push([
				this.selectionList[i].position[0] - center[0],
				this.selectionList[i].position[1] - center[1]
			])

		}

		delete this.selectionOrigin
		delete this.selectionTarget
		delete this.selectionCandidateSet
	}

	confirmMassRelocation(){

		const targetPositions = []
		for (let i = 0; i < this.cloneEntitiesList.length; i++){
			targetPositions.push([this.cloneEntitiesList[i].position[0], this.cloneEntitiesList[i].position[1]])
		}

		this.massRelocate(this.cloneList, targetPositions)

	}

	confirmMassClone(){

		for (let i = 0; i < this.cloneEntitiesList.length; i++){

			const e = this.cloneEntitiesList[i]
			const ee = this.entityAtCoordinates(e.position)
			const up = this.codex.entities[e.name].isUpgradeTo

			const isLegitUpgrade = ee && up && up === ee.name
			const isLegitBuild = !ee && !(up && this.codex.entities[up].onlyone) && !(up && (e.name === `flower` || e.name === `fruit` || e.name === `gradient_rem`))

			if (isLegitUpgrade){

				this.clearCell(e.position)
				const price = this.getRealPrice(e.name)
				const refund = this.getRealPrice(ee.name)
				const xy = this.uvToXYUntranslated(e.position)
				this.createResourceTransfer(refund, xy, undefined, undefined, undefined, true)
				this.requestResources(price, e.position, _=>{}, true)
				this.addEntity(e.name, e.position)

				this.stats.machinesBuild++

				if (this.codex.entities[e.name].onlyone) this.onlyones[e.name] = true

			} else if (isLegitBuild){

				const price = this.getRealPrice(e.name)
				this.requestResources(price, e.position, false, true)
				const ne = this.addEntity(e.name, e.position)
				if (e.name === `gradient`){
					ne.penalty = .5
					ne.init()
				}

				this.stats.machinesBuild++
				this.processMousemove2()
				if (this.codex.entities[e.name].onlyone) this.onlyones[e.name] = true

			}

		}

		//SFX
		this.playSound(`place`)
		this.punchScreen()
		// this.shop.check()

	}

	updateSelectionArea(){

		this.selectionCandidateSet = new Set()
		if (!this.selectionOrigin || !this.selectionTarget) return
		
		const umin = Math.min(this.selectionTarget[0], this.selectionOrigin[0])
		const umax = Math.max(this.selectionTarget[0], this.selectionOrigin[0])
		const vmin = Math.min(this.selectionTarget[1], this.selectionOrigin[1])
		const vmax = Math.max(this.selectionTarget[1], this.selectionOrigin[1])
		// this.selectionIsSingleCell = this.selectionTarget[0] === this.selectionOrigin[0] && this.selectionTarget[1] === this.selectionOrigin[1]

		for (let u = umin; u <= umax; u++){
			for (let v = vmin; v <= vmax; v++){
				const entity = this.entityAtCoordinates([u,v])
				if (entity) this.selectionCandidateSet.add(entity)
			}
		}

	}

	updateEraseArea(){

		this.updateSelectionArea()

		const singleCell = this.selectionTarget[0] === this.selectionOrigin[0] && this.selectionTarget[1] === this.selectionOrigin[1]
		const extra = {}
		this.totalRefund = new Array(10).fill(0)

		for (let e of this.selectionCandidateSet){

			const validForErase = this.canEraseEntity(e) && !(!singleCell && (e instanceof Pump || e instanceof Gradient))

			if (validForErase) {
				if (extra[e.name]===undefined) extra[e.name] = -1
				extra[e.name]++
				const refund = this.getRealPrice(e.name, true, -extra[e.name])
				for (let i = 0; i < refund.length; i++){
					if (refund[i]) this.totalRefund[i] += refund[i]
				}
			} else {
				this.selectionCandidateSet.delete(e)
			}
		}

		const hint = new Cloud({master:this})
		hint.addRefundListFromArray(this.totalRefund)
		this.areaHint = hint

	}

	updateRelocationArea(){

		this.updateSelectionArea()

		for (let e of this.selectionCandidateSet){
			if (!this.canRelocate(e)) this.selectionCandidateSet.delete(e)
		}

	}

	updateCloneArea(){

		this.updateSelectionArea()

		const extra = {}
		this.totalPrice = new Array(10).fill(0) // WIP: WHY THIS.TOTAL not const and for erase as well?

		//Calculate price
		for (let e of this.selectionCandidateSet){

			if (this.canClone(e)) {
				if (extra[e.name]===undefined) extra[e.name] = -1
				extra[e.name]++

				const price = this.getRealPrice(e.name, false, extra[e.name])
				for (let i = 0; i < price.length; i++){
					if (price[i]) this.totalPrice[i] += price[i]
				}
			} else {
				this.selectionCandidateSet.delete(e)
			}

		}

		this.canPlace = true //WIP: rename to interactionIsOkay or smth
		for (let i = 0; i < this.totalPrice.length; i++){
			if (this.resources[i] < this.totalPrice[i]){
				this.canPlace = false
				break
			}
		}

		const hint = new Cloud({master:this})
		hint.addResourceList(this.totalPrice)
		this.areaHint = hint

	}

	REM_updateCloneArea(){

		this.cloneList = []
		this.totalCloneCost = new Array(10).fill(0)
		const extra = {}
		if (!this.cloneOrigin || !this.cloneTarget) return
		
		const umin = Math.min(this.cloneTarget[0], this.cloneOrigin[0])
		const umax = Math.max(this.cloneTarget[0], this.cloneOrigin[0])
		const vmin = Math.min(this.cloneTarget[1], this.cloneOrigin[1])
		const vmax = Math.max(this.cloneTarget[1], this.cloneOrigin[1])
		const singleCell = this.cloneTarget[0] === this.cloneOrigin[0] && this.cloneTarget[1] === this.cloneOrigin[1]

		for (let u = umin; u <= umax; u++){
			for (let v = vmin; v <= vmax; v++){

				const entity = this.entityAtCoordinates([u,v])
				const condition = this.massRelocation ? (entity && this.canRelocate(entity)) : (entity && !this.onlyones[entity.name] && this.codex.entities[entity.name].canPurchase && !(entity.name === `flower` || entity.name === `fruit`))

				if (condition) {
					if (extra[entity.name]===undefined) extra[entity.name] = -1
					extra[entity.name]++
					const cost = this.getRealPrice(entity.name,false,extra[entity.name])
					for (let i = 0; i < cost.length; i++){
						if (cost[i]) this.totalCloneCost[i] += cost[i]
					}
					this.cloneList.push(entity)
				}
			}
		}

		if (this.massRelocation){
			this.cloneHint = false
		} else {
			const hint = new Cloud({master:this})
			hint.addResourceList(this.totalCloneCost)
			this.cloneHint = hint
		}

		// if (hint.element !== this.currentHint.element){

		// 	if (this.currentHint.element) document.body.removeChild(this.currentHint.element)
		// 	this.currentHint.element = hint.element
		// 	document.body.appendChild(this.currentHint.element)

		// }

	}

	cleanupInteractionMode(){
		delete this.interactionMode
		delete this.itemInHand
		delete this.transportedEntity
		delete this.selectionOrigin
		delete this.selectionTarget
		delete this.selectionCandidateSet
		delete this.selectionList
		delete this.selectionOffsets
		delete this.totalRefund
		delete this.areaHint
		delete this.forcedMobileAnchor
		if (this.store.html.mobileConfirmButton) this.store.html.mobileConfirmButton.classList.add(`hidden`)
		if (this.store.html.mobileRelocatorSwitch) this.store.html.mobileRelocatorSwitch.remove()
		if (this.isMobile) this.store.pushMenu(true)
		this.removeHint()
	}

	cleanupClone(){
		delete this.cloneOrigin
		delete this.cloneTarget
		delete this.cloneList
		delete this.totalCloneCost
		delete this.cloneHint
		delete this.cloneAreaSelected
		delete this.cloneAreaOrigin
		delete this.cloneEntitiesList
		delete this.cloneEntitiesPositionsList
		this.shop.mobileConfirmButton.classList.add(`hidden`)
		if (this.touchMode !== 2) this.shop.mobileRelocatorSwitch.remove()
		this.removeHint()
	}

	//NEW==========================

	setCommonListeners(){

		if (!this.spaceport.isPlaceholder){
			this.spaceport.on(`windowState`, (e,d)=>{
                    if (d === `blur`) this.doOnBlur()
                    if (d === `focus`) this.doOnFocus()
            })
		}

		addEventListener(`resize`, _=>{
			cancelAnimationFrame(this.resizeAnimationFrame)
			this.resizeAnimationFrame = requestAnimationFrame(_=>{this.initScreenSize()})
		})

		addEventListener(`gamepadconnected`, _=>{
			this.gamepadIsConnected = true
			// this.shop.gamePadHint.classList.add(`gamePadPresent`)
		})

		addEventListener(`gamepaddisconnected`, _=>{
			this.gamepadIsConnected = false
			// this.shop.gamePadHint.classList.remove(`gamePadPresent`)
			this.splash.show()
			this.splash.selected = false
		})

		addEventListener(`blur`, e=>{
			this.doOnBlur()
		})
		addEventListener(`focus`, e=>{
			this.doOnFocus()
		})

		if (this.isMobile){
			addEventListener(`visibilitychange`, e=>{
				if (document.hidden){
					this.doOnBlur()
				} else {
					this.doOnFocus()
				}
			})
		}

	}

	setListenersDesktop(){
		
		this.canvas.addEventListener(`mouseenter`, e=>{
			this.mouse.cursorVisible = true
		})
		this.canvas.addEventListener(`mouseout`, e=>{
			this.processMouseout()
		})

		//Keyboard events
		addEventListener(`keydown`, e=>{

			this.gamepadControl = false
			this.thereWasZoomAction = true

			if (e.code === `Escape`){

				this.cleanupInteractionMode()

				if (this.orbifoldUI) {
					this.closeOrbifolds()
				} else {
					this.toggleSplash()
				}
				
			} else if (e.code === `KeyQ`){
				this.processQ()
			} else if (e.key === `Alt`){
				e.preventDefault()
				this.altActive = true
				document.body.classList.add(`altHolded`)
			} else if (e.code === `KeyE`){
				this.processE()
			} else if (e.code === `KeyW` || e.code === `ArrowUp`){
				this.translationMap[0] = 1
			} else if (e.code === `KeyD` || e.code === `ArrowRight`){
				this.translationMap[1] = 1
			} else if (e.code === `KeyS` || e.code === `ArrowDown`){
				this.translationMap[2] = 1
			} else if (e.code === `KeyA` || e.code === `ArrowLeft`){
				this.translationMap[3] = 1
			} else if (e.key === `Shift` || e.key === `Control`){

				if (this.interactionMode === `relocate`){
					// console.log(`clone`)
					this.interactionMode = `clone`
					this.processMove()

					return

				}

				if (!this.zoomWhenShiftPressed) {
					this.zoomWhenShiftPressed = this.zoom
					delete this.thereWasZoomAction
				}
				this.shiftPressed = true
			}

		})
		addEventListener(`keyup`, e=>{
			if (e.code === `KeyW` || e.code === `ArrowUp`){
				this.translationMap[0] = 0
				// if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.code === `KeyD` || e.code === `ArrowRight`){
				this.translationMap[1] = 0
				// if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.code === `KeyS` || e.code === `ArrowDown`){
				this.translationMap[2] = 0
				// if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.code === `KeyA` || e.code === `ArrowLeft`){
				this.translationMap[3] = 0
				// if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.key === `Alt`){
				this.altActive = false
				document.body.classList.remove(`altHolded`)
			} else if (e.key === `Shift` || e.key === `Control`){

				if (this.interactionMode === `clone`){
					// console.log(`relocate`)
					this.interactionMode = `relocate`
					this.processMove()
					return
				}

				this.shiftPressed = false
				if (!this.thereWasZoomAction){
					this.zoom = 1
				}
				delete this.zoomWhenShiftPressed
			}
		})

		//Wheel events
		this.canvas.addEventListener('wheel', e=>{

			e.preventDefault()

			const scale = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1
			const dx = e.deltaX * scale
			const dy = e.deltaY * scale

			if (this.shiftPressed || e.ctrlKey){

				if (!this.thereWasZoomAction) this.thereWasZoomAction = true
				const boost = this.shiftPressed ? 1 : 6
				const delta = e.ctrlKey ? -dy : -(Math.abs(dy) > Math.abs(dx) ? dy : dx)
				this.zoomInOut(delta * boost)

				//e.ctrlKey here

				// const delta = [
				// 	e.wheelDeltaX * (this.isWindows ? .2 : .5),
				// 	e.wheelDeltaY * (this.isWindows ? .2 : .5)
				// ]

				// this.zoomInOut(Math.abs(delta[1]) > Math.abs(delta[0]) ? delta[1] : delta[0])

			} else {

				this.translation[0] += dx / this.zoom
				this.translation[1] += dy / this.zoom

				this.updateMouseData()
				this.processMove()
				this.updateGlobalPositioning()

				// const delta = [
				// 	e.wheelDeltaX * (this.isWindows ? .2 : .5) / this.zoom,
				// 	e.wheelDeltaY * (this.isWindows ? .2 : .5) / this.zoom
				// ]

				// this.translation[0] -= delta[0]
				// this.translation[1] -= delta[1]

				// this.updateMouseData()
				// this.processMove()
				// this.updateGlobalPositioning()


			}
			
		})
		
		//Mouse events
		this.canvas.addEventListener(`mousedown`,e=>{
			this.updatePointerState({
				sxy: [e.offsetX, e.offsetY],
				button: e.buttons
			})
			this.processDown()

		})
		this.canvas.addEventListener(`mouseup`,e=>{
			const lastButton = this.mouse.state
			this.updatePointerState({
				sxy: [e.offsetX, e.offsetY],
				button: lastButton//e.buttons
			})
			this.processUp()
			this.processMove()

		})
		this.canvas.addEventListener(`mousemove`,e=>{
			this.updatePointerState({
				sxy: [e.offsetX, e.offsetY],
				button: e.buttons
			})
			this.processMove()
		})

	}

	updatePointerState(p={}){

		this.mouse.delta = [0,0]

		if (p.button !== undefined){
			this.mouse.state = p.button	
		}
		
		if (p.sxy){
			this.mouse.delta[0] = p.sxy[0] - this.mouse.sxy[0]
			this.mouse.delta[1] = p.sxy[1] - this.mouse.sxy[1]
			this.mouse.sxy[0] = p.sxy[0]
			this.mouse.sxy[1] = p.sxy[1]
			this.mouse.xy[0] = this.mouse.sxy[0] * this.pixelRatio
			this.mouse.xy[1] = this.mouse.sxy[1] * this.pixelRatio
		}

		const uv = this.xyToUV(this.mouse.sxy)
		const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]

		//Detect alfa nodes
		for (let i = 0; i < this.alfa.currentNodes.length; i++){
			const n = this.alfa.currentNodes[i]
			const dst = ((n.position[0] - uv[0]) ** 2 + (n.position[1] - uv[1]) ** 2) ** .5
			n.hit = dst < this.alfa.nodeProperties.radius
		}

		//Update hover
		if (p.adjustTap){
			const C = this.entityAtCoordinates(targetCell)
			const B = this.entityAtCoordinates([targetCell[0] + 1, targetCell[1] + 1])
			const R = this.entityAtCoordinates([targetCell[0] + 1, targetCell[1]])
			const L = this.entityAtCoordinates([targetCell[0], targetCell[1] + 1])
			const right = (uv[1] - Math.floor(uv[1])) < (uv[0] - Math.floor(uv[0]))

			if (!C && (B && B instanceof Cube)){
				this.hoveredCell = [targetCell[0] + 1, targetCell[1] + 1]
				this.hoveredEntity = B
			} else if (!C && (R && R instanceof Cube) && right) {
				this.hoveredCell = [targetCell[0] + 1, targetCell[1]]
				this.hoveredEntity = R
			} else if (!C && (L && L instanceof Cube) && !right) {
				this.hoveredCell = [targetCell[0], targetCell[1] + 1]
				this.hoveredEntity = L
			} else {
				this.hoveredCell = targetCell
				this.hoveredEntity = this.entityAtCoordinates(this.hoveredCell)
			}
		} else {
			this.hoveredCell = targetCell
			this.hoveredEntity = this.entityAtCoordinates(this.hoveredCell)
		}

		//Update resource hover
		this.hoveredResource = false
		const delta = this.screenUnit * .3
		for (let i = 0; i < this.resourceHomes.length; i++){
			const home = this.resourceHomes[i]
			if (this.mouse.xy[0] > home[0] - delta && this.mouse.xy[0] < home[0] + delta && this.mouse.xy[1] > home[1] - delta && this.mouse.xy[1] < home[1] + delta){
				this.hoveredResource = i
				break
			}

		}

		// External fill labels for touch devices
		if (this.isMobile){
			const labelCell = [Math.floor(uv[0] + 1.7), Math.floor(uv[1] + 1.7)]
			const entity = this.entityAtCoordinates(labelCell)
			this.hoveredLabel = this.shouldBeFilled(entity) ? entity : false
		}

	}

	processDown(){

		this.mouse.positionChanged = false
		this.mouse.originalPosition = [...this.mouse.xy]

		const validForAreaSelection = this.interactionMode === `erase` || this.interactionMode === `relocate` || this.interactionMode === `clone`
		if (validForAreaSelection){
			this.selectionOrigin = this.hoveredCell
			this.selectionTarget = this.hoveredCell

			if (this.interactionMode === `erase`){
				this.updateEraseArea()
			} else if (this.interactionMode === `relocate` && !this.selectionList){
				this.updateRelocationArea()
			} else if (this.interactionMode === `clone` && !this.selectionList){
				this.updateCloneArea()
			}
		}

		if (this.isMobile && this.plane === 1 && this.hoveredEntity?.ondarkhover){
			this.hoveredEntity.ondarkhover()
		}

		//Default
		if (this.mouse.state !== 2){

			//Hitbox check
			const cubeClicked = (this.hoveredEntity && this.hoveredEntity.name === `cube`)
			if (!this.itemInHand || cubeClicked){

				if (cubeClicked){
					this.stats.totalCubeClicks++
				}

				let didntTouch = true
				if (this.isMobile){

					const uv = this.xyToUV([this.mouse.sxy[0], this.mouse.sxy[1]])
					uv[0] += 1.7
					uv[1] += 1.7

					const targetCell = [Math.floor(uv[0]), Math.floor(uv[1])]
					const entity = this.entityAtCoordinates(targetCell)

					if (this.shouldBeFilled(entity)){
						entity.refill()
						didntTouch = false
					}

				}

				if (didntTouch && this.hoveredEntity){

					this.selectedEntity = this.hoveredEntity
					if (!this.plane){
						//WIP: Keep refill for mobile?
						this.selectedEntity.onmousedown()
					} else if (this.plane === 1 && this.selectedEntity.ondarkmousedown){
						this.selectedEntity.ondarkmousedown()
					}
					
				}

			}

		}

	}

	finalizeRelocation(){
		if (this.canPlace && this.selectionOffsets){

			const anchor = this.getSelectionAnchor()
			const positions = []
			for (let i = 0; i < this.selectionList.length; i++){
				const p = [anchor[0] + this.selectionOffsets[i][0], anchor[1] + this.selectionOffsets[i][1]]
				positions.push(p)
			}
			this.massRelocate(this.selectionList, positions)
			this.cleanupInteractionMode()

		} else {
			this.cleanupInteractionMode()
		}
	}

	finalizeCloning(){
		if (this.canPlace && this.selectionOffsets){

			const anchor = this.getSelectionAnchor()
			const positions = []
			for (let i = 0; i < this.selectionList.length; i++){
				const p = [anchor[0] + this.selectionOffsets[i][0], anchor[1] + this.selectionOffsets[i][1]]
				positions.push(p)
			}
			this.massClone(this.selectionList, positions)
			this.cleanupInteractionMode()

		} else {
			this.cleanupInteractionMode()
		}
	}

	processUp(){

		if (this.mouse.state === 2 || this.mouse.state === 3){
			//RBM or LMB + RMB: esc
			this.cleanupInteractionMode()
		}

		if (this.interactionMode === `erase`){

			this.finalizeErase()
			return

		} else if (this.interactionMode === `relocate`) {

			if (this.selectionList){

				if (this.isMobile && this.mouse.positionChanged) return
				if (this.isMobile){
					this.forcedMobileAnchor = true
					this.updateRelocationPositioning()
				} else {
					this.finalizeRelocation()
				}

			} else {
				if (!this.selectionCandidateSet.size){
					this.cleanupInteractionMode()
				} else {
					this.pickupEntitiesForRelocation()
					this.updateRelocationPositioning()
				}
			}
			return

		} else if (this.interactionMode === `clone`) {

			if (this.selectionList){

				if (this.isMobile && this.mouse.positionChanged) return

				if (this.isMobile && this.selectionOffsets){
					this.forcedMobileAnchor = true
					this.updateClonePositioning()
				} else {
					this.finalizeCloning()
				}

			} else {
				if (!this.selectionCandidateSet.size || !this.canPlace){
					this.cleanupInteractionMode()
				} else {
					this.pickupEntitiesForCloning()
				}
			}
			return

		} else if (this.interactionMode === `build` && !this.mouse.positionChanged){
			
			const ok = this.canPlaceEntityHere(this.itemInHand, this.hoveredCell)
			if (!ok) return

			const isUpgrade = this.hoveredEntity && this.codex.entities[this.itemInHand.name]?.isUpgradeTo === this.hoveredEntity?.name

			if (isUpgrade){

				if (this.itemInHand.name === `pinhole`){
					this.saveGame()
					this.preventSaving = true
				}
				
				this.clearCell(this.hoveredCell)
				if (this.itemInHand.name !== `pinhole`) this.stats.timeSinceLastDelete = 0

				const price = this.getRealPrice(this.itemInHand.name)
				const refund = this.getRealPrice(this.hoveredEntity.name)
				
				this.createResourceTransfer(refund, this.uvToXYUntranslated(this.hoveredCell), undefined, undefined, undefined, true)
				this.requestResources(price, this.hoveredCell, _=>{}, true)
				this.addEntity(this.itemInHand.name, this.hoveredEntity.position)
			} else {
				const price = this.getRealPrice(this.itemInHand.name)
				this.requestResources(price, this.hoveredCell, false, true)

				const e = this.addEntity(this.itemInHand.name, this.hoveredCell)
				if (this.itemInHand.name === `gradient`){
					e.penalty = .5
					e.init()
				}
			}

			//SFX
			const screenxy = this.uvToXYUntranslated(this.hoveredCell)
			const pan = this.getPanValueFromX(screenxy[0])
			this.playSound(`place`, pan)
			this.punchScreen()

			this.stats.machinesBuild++
			if (this.store.html.store) {
				if (this.codex.entities[this.itemInHand.name].onlyone){
					this.onlyones[this.itemInHand.name] = true
				}
				delete this.interactionMode
				delete this.itemInHand
				this.store.html.store.classList.remove(`active`)
			} else {
				if (this.codex.entities[this.itemInHand.name].onlyone){
					this.onlyones[this.itemInHand.name] = true
					delete this.itemInHand
					delete this.interactionMode
				} else if (!this.canAfford(this.itemInHand?.name)){
					delete this.itemInHand
					delete this.interactionMode
				} else {
					this.pickupItem(this.itemInHand.name)
				}
			}

			

		}

		//Default
		this.mouse.timer = this.mouse.maxTimer
		if (this.selectedEntity && !this.plane) this.selectedEntity.onmouseup()
		this.selectedEntity = false
		this.mouse.state = 0
		
	}

	processMove(wheel){

		//Always
		this.mouse.positionChanged = this.mouse.originalPosition ? Math.abs(this.mouse.xy[0] - this.mouse.originalPosition[0]) + Math.abs(this.mouse.xy[1] - this.mouse.originalPosition[1]) > 1 : false
		if (this.mouse.positionChanged) delete this.forcedMobileAnchor

		if (this.plane === 1 && this.hoveredEntity?.ondarkhover){
			this.hoveredEntity.ondarkhover()
		}

		//Camera Movement
		const mobileTranslateCondition = this.isMobile && this.mouse.state === 1 && (this.interactionMode !== `relocate` || this?.selectionList) && (this.interactionMode !== `clone` || this?.selectionList) && this.interactionMode !== `erase`

		if ((this.mouse.delta[0] || this.mouse.delta[1]) && (this.mouse.state === 2 || mobileTranslateCondition)){
			this.translation[0] -= this.mouse.delta[0] * this.pixelRatio / this.zoom
			this.translation[1] -= this.mouse.delta[1] * this.pixelRatio / this.zoom
		}

		if (this.interactionMode === `erase` && this.mouse.state === 1){
			if (!this.selectionTarget || this.hoveredCell[0] !== this.selectionTarget[0] || this.hoveredCell[1] !== this.selectionTarget[1]){
				this.selectionTarget = this.hoveredCell
				this.updateEraseArea()
			}	
		} else if (this.interactionMode === `build`){
			this.canPlace = this.canPlaceEntityHere(this.itemInHand, this.hoveredCell)
			
		} else if (this.interactionMode === `relocate`){

			this.updateRelocationPositioning()

		} else if (this.interactionMode === `clone`){

			this.updateClonePositioning()

		}

		//Brush refill
		const he = this.hoveredEntity
		if (he?.refill && he.state === 0 && this.mouse.state === 1){
			// console.log(he.state)
			he.onmousedown()
		}
		// if (he && he.fill)

		//

	}

	updateRelocationPositioning(){

		const anchor = this.getSelectionAnchor()

		if (this.selectionList && this.selectionOffsets && anchor){
			
			const relocationSet = new Set(this.selectionList)
			this.canPlace = true
			for (let i = 0; i < this.selectionList.length; i++){

				if (!this.canRelocate(this.selectionList[i])){
					this.canPlace = false
					break
				}

				const position = [anchor[0] + this.selectionOffsets[i][0], anchor[1] + this.selectionOffsets[i][1]]
				if (this.isWithinMemoryComplex(position)){
					this.canPlace = false
					break
				}
				const entityHere = this.entityAtCoordinates(position)

				if (!entityHere) continue

				let isInList = relocationSet.has(entityHere)
				if (!isInList){
					if (!this.canRelocate(entityHere)){
						this.canPlace = false
						break
					}

					const swapTarget = this.selectionList[i].position

					for (let j = 0; j < this.selectionList.length; j++){
						if (i === j) continue
						const alreadyBooked = [anchor[0] + this.selectionOffsets[j][0], anchor[1] + this.selectionOffsets[j][1]]
						if (swapTarget[0] === alreadyBooked[0] && swapTarget[1] === alreadyBooked[1]){
							this.canPlace = false
							break
						}
					}
				}
				
				if (!this.canPlace) break

			}

		} else if (!this.selectionTarget || anchor[0] !== this.selectionTarget[0] || anchor[1] !== this.selectionTarget[1]){
			this.selectionTarget = anchor
			this.updateRelocationArea()
		}

		const shouldConfirm = this.isMobile && this.canPlace && this.selectionList && this.selectionOffsets
		if (shouldConfirm && this.store.html.mobileConfirmButton.classList.contains(`hidden`)){
			this.store.html.mobileConfirmButton.classList.remove(`hidden`)
		} else if (!shouldConfirm && !this.store.html.mobileConfirmButton.classList.contains(`hidden`)){
			this.store.html.mobileConfirmButton.classList.add(`hidden`)
		}
	}

	updateClonePositioning(){

		const anchor = this.getSelectionAnchor()

		if (this.selectionList && this.selectionOffsets && anchor){

			this.canPlace = true

			this.totalPrice = new Array(10).fill(0)
			const extra = {}

			for (let i = 0; i < this.selectionList.length; i++){

				const e = this.selectionList[i]

				if (!this.canClone(e)){
					this.canPlace = false
					break
				}

				const position = [anchor[0] + this.selectionOffsets[i][0], anchor[1] + this.selectionOffsets[i][1]]

				if (this.isWithinMemoryComplex(position)){
					this.canPlace = false
					break
				}
				const entityHere = this.entityAtCoordinates(position)

				if (entityHere && !(this.codex.entities[e.name].isUpgradeTo === entityHere.name)) {
					this.canPlace = false
					break
				}

				if (extra[e.name]===undefined) extra[e.name] = -1
				extra[e.name]++
				const price = this.getRealPrice(e.name, false, extra[e.name])
				for (let i = 0; i < price.length; i++){
					if (price[i]) this.totalPrice[i] += price[i]
				}

			}

			if (!this.areaHint){
				const hint = new Cloud({master:this})
				hint.addResourceList(this.totalPrice)
				this.areaHint = hint
			}

			for (let i = 0; i < this.totalPrice.length; i++){
				if (this.resources[i] < this.totalPrice[i]){
					this.canPlace = false
					break
				}
			}

		} else if (!this.selectionTarget || anchor[0] !== this.selectionTarget[0] || anchor[1] !== this.selectionTarget[1]){
			this.selectionTarget = anchor
			this.updateCloneArea()
		}

		const shouldConfirm = this.isMobile && this.canPlace && this.selectionList && this.selectionOffsets
		if (shouldConfirm && this.store.html.mobileConfirmButton.classList.contains(`hidden`)){
			this.store.html.mobileConfirmButton.classList.remove(`hidden`)
		} else if (!shouldConfirm && !this.store.html.mobileConfirmButton.classList.contains(`hidden`)){
			this.store.html.mobileConfirmButton.classList.add(`hidden`)
		}
	}

	getSelectionAnchor(){
		if (!this.forcedMobileAnchor && this.isMobile && this.selectionList && this.selectionOffsets){
			const uv = this.xyToUVUntranslated([0, 0])
			return [Math.floor(uv[0]), Math.floor(uv[1])]
		}
		return this.hoveredCell
	}

	//==============================

	setListeners(){

		//WIP REMOVE AFTER MOBILE

		if (!this.spaceport.isPlaceholder){
			this.spaceport.on(`windowState`, (e,d)=>{
					// console.log(d)
                    if (d === `blur`) this.doOnBlur()
                    if (d === `focus`) this.doOnFocus()
            })

            this.spaceport.on(`console`, (e,d)=>{
					console.log(d)
            })
		}

		addEventListener(`resize`, _=>{
			cancelAnimationFrame(this.resizeAnimationFrame)
			this.resizeAnimationFrame = requestAnimationFrame(_=>{this.initScreenSize()})
		})

		addEventListener(`gamepadconnected`, _=>{
			this.gamepadIsConnected = true
			// this.shop.gamePadHint.classList.add(`gamePadPresent`)
		})
		addEventListener(`gamepaddisconnected`, _=>{
			this.gamepadIsConnected = false
			// this.shop.gamePadHint.classList.remove(`gamePadPresent`)
			this.splash.show()
			this.splash.selected = false
		})

		addEventListener(`blur`, e=>{
			this.doOnBlur()
		})
		addEventListener(`focus`, e=>{
			this.doOnFocus()
		})

		addEventListener(`keydown`, e=>{

			this.gamepadControl = false
			this.thereWasZoomAction = true

			if (e.keyCode === 27){
				if (this.itemInHand) {
					delete this.itemInHand
					delete this.transportedEntity
				} else if (this.interactionMode){
					this.cleanupInteractionMode()
				} else {
					this.toggleSplash()
				}
				
			} else if (e.keyCode === 81){
				this.processQ()
				
			} else if (e.keyCode === 18){
				e.preventDefault()
				this.altActive = true
				document.body.classList.add(`altHolded`)
			} else if (e.keyCode === 69){
				this.processE()
			} else if (e.keyCode === 87 || e.keyCode === 38){
				this.translationMap[0] = 1
			} else if (e.keyCode === 68 || e.keyCode === 39){
				this.translationMap[1] = 1
			} else if (e.keyCode === 83 || e.keyCode === 40){
				this.translationMap[2] = 1
			} else if (e.keyCode === 65 || e.keyCode === 37){
				this.translationMap[3] = 1
			} else if (e.keyCode === 16 || e.keyCode === 17){
				if (!this.zoomWhenShiftPressed) {
					this.zoomWhenShiftPressed = this.zoom
					delete this.thereWasZoomAction
				}
				this.shiftPressed = true
			}

		})
		addEventListener(`keyup`, e=>{
			if (e.keyCode === 87 || e.keyCode === 38){
				this.translationMap[0] = 0
				if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.keyCode === 68 || e.keyCode === 39){
				this.translationMap[1] = 0
				if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.keyCode === 83 || e.keyCode === 40){
				this.translationMap[2] = 0
				if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.keyCode === 65 || e.keyCode === 37){
				this.translationMap[3] = 0
				if (this.keyboardMovementHappening === 87) delete this.keyboardMovementHappening
			} else if (e.keyCode === 18){
				this.altActive = false
				document.body.classList.remove(`altHolded`)
			} else if (e.keyCode === 16 || e.keyCode === 17){
				this.shiftPressed = false
				if (!this.thereWasZoomAction){
					this.zoom = 1
				}
				delete this.zoomWhenShiftPressed
			}
		})

		this.canvas.addEventListener(`click`, e=>{
			
			this.processClick()
			
		})

		// this.canvas.addEventListener(`touchstart`, e=>{

		// 	if (e.target === this.canvas) e.preventDefault()

		// 	this.mouse.lastTouch[0] = e.touches[0].clientX
		// 	this.mouse.lastTouch[1] = e.touches[0].clientY
		// 	this.processMousemove2(
		// 		[e.touches[0].clientX, e.touches[0].clientY],
		// 		false,
		// 		1
		// 	)

		// 	this.mouse.positionChanged = false
			
		// })

		// this.canvas.addEventListener(`touchend`, e=>{

		// 	if (e.target === this.canvas) e.preventDefault()

		// 	if (!this.mouse.positionChanged){
		// 		this.processClick()
		// 	}

		// })

		// this.canvas.addEventListener(`touchmove`, e=>{
		// 	if (e.target === this.canvas) e.preventDefault()
		// 	if (e.touches.length > 1){
		// 		const delta = [
		// 			(e.touches[0].clientX - this.mouse.lastTouch[0]) * this.pixelRatio / this.zoom,
		// 			(e.touches[0].clientY - this.mouse.lastTouch[1]) * this.pixelRatio / this.zoom,
		// 		]
		// 		// this.processMousemove(e.touches[0], delta)
		// 		this.processMousemove2(
		// 			[e.touches[0].clientX, e.touches[0].clientY],
		// 			delta,
		// 			2
		// 		)
		// 	} else {
		// 		// this.processMousemove(e.touches[0])
		// 		this.processMousemove2(
		// 			[e.touches[0].clientX, e.touches[0].clientY],
		// 			false,
		// 			1
		// 		)
		// 	}
		// 	this.mouse.lastTouch[0] = e.touches[0].clientX
		// 	this.mouse.lastTouch[1] = e.touches[0].clientY
			
		// })

		this.canvas.addEventListener(`mousedown`, e=>{

			this.processDown(e.buttons === 2)

		})

		this.canvas.addEventListener(`mousemove`, e=>{
			// this.processMousemove(e)
			this.processMousemove2(
				[e.offsetX, e.offsetY],
				[e.movementX * this.pixelRatio / this.zoom, e.movementY * this.pixelRatio / this.zoom],
				e.buttons
			)
		})

		this.canvas.addEventListener(`mouseup`, e=>{

			if (!this.mouse.positionChanged && e.button === 2 && this.itemInHand){
				this.cleanupInteractionMode()
			}

			this.processMouseup()

		})

		this.canvas.addEventListener(`mouseenter`, e=>{
			this.mouse.cursorVisible = true
		})
		this.canvas.addEventListener(`mouseout`, e=>{
			this.processMouseout()
		})

		this.canvas.addEventListener('wheel', e=>{
			e.preventDefault()

			if (this.shiftPressed){

				if (!this.thereWasZoomAction) this.thereWasZoomAction = true

				const delta = [
					e.wheelDeltaX * (this.isWindows ? .2 : .5),
					e.wheelDeltaY * (this.isWindows ? .2 : .5)
				]

				this.zoomInOut(Math.abs(delta[1]) > Math.abs(delta[0]) ? delta[1] : delta[0])

			} else {

				const delta = [
					e.wheelDeltaX * (this.isWindows ? .2 : .5) / this.zoom,
					e.wheelDeltaY * (this.isWindows ? .2 : .5) / this.zoom
				]

				// this.processMousemove(e, delta)
				this.processMousemove2(
					[e.offsetX, e.offsetY],
					[delta[0], delta[1]],
					2
				)

			}
			
		})

	}

	getHitCoordinates(xy){
		return [(xy[0] * this.pixelRatio - this.w2 + this.translation[0]) / this.unit, (xy[1] * this.pixelRatio - this.h2 + this.translation[1]) / this.unit]
	}

	checkHitBox(uv, hb){

		if (uv[0] > hb[0] && uv[0] < hb[2] && uv[1] > hb[1] && uv[1] < hb[3]) return true
		return false
	}

	updateAnalytics(dt){

		const a = this.analytics

		a.frameTimer -= dt
		if (a.frameTimer < 0){

			a.frameTimer = a.measuringFrame + a.frameTimer
			a.frames.push(a.frame)
			a.instant = a.frame
			for (let i = 0; i < a.instant.length; i++){
				const norm = a.measuringFrame / 1000
				a.instant[i][0] /= norm
				a.instant[i][1] /= norm
				a.graphs[i].data.push(a.instant[i])
				if (a.graphs[i].data.length > a.dataSize) a.graphs[i].data.shift()
			}


			a.frame = [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]
			if (a.frames.length > a.frameCount) a.frames.shift()

			//Average
			a.average = [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]]
			for (let i = 0; i < a.frames.length; i++){
				const norm = a.frames.length / (i + 1) * this.analytics.frames.length / 2
				for (let j = 0; j < a.frames[i].length; j++){

					a.average[j][0] += a.frames[i][j][0] / norm
					a.average[j][1] += a.frames[i][j][1] / norm

				}
			}

		}

	}

	updateLoop(){

		//Service updates
		const now = performance.now()
		const span = Math.min(now - this.time.lt, 1000)
		this.stats.totalPlayTime += span
		this.time.lt = now

		//Scroll bug
		if (document.body.scrollTop !== 0) {
			document.body.scrollTop = 0
		}

		// this.time.dt = Math.min(now - this.time.lt, 1000)
		// this.time.realDt = this.time.dt
		// const realDt = this.time.dt
		// this.time.lt = now
		// this.stats.totalPlayTime += this.time.dt
		// this.stats.timeSinceLastDelete += this.time.dt

		// this.updateGamepad(this.time.dt)
		// this.messenger.update(this.time.dt)
		// this.achiever.update(this.time.dt)
		// this.explainer?.update(this.time.dt)

		// if (this.halt) {
		// 	this.clock?.postMessage(true)
		// 	return
		// }

		// //Ingame updates
		// this.currentlyExtracting = false
		// this.updateSlowdownEvent()
		// this.updateUnfilled(this.time.dt)
		// this.updateEntities(this.time.dt)
		// this.updateResourceInteractions(this.time.dt)
		// this.updateVFX(this.time.dt)
		// this.updateHollowEvents(this.time.dt)
		// // this.updateRange()
		// this.updateTranslation(realDt)
		// this.updateResourcePops(this.time.dt)
		// this.updateAutoClicker(this.time.dt)
		// this.updateSurge(this.time.dt)
		// // this.updateResourceInteractions(this.time.dt)
		// this.updateAnalytics(this.time.dt)
		// this.updateMusic(realDt)

		// if (this.entitiesInGame.pinhole > 0){
		// 	this.resources = new Array(10).fill(.01)
		// }

		const done = this.updateCycle(span)

		this.clock?.postMessage(done)

	}

	updateCycle(span = 16, silent = false){

		this.time.dt = span
		this.time.realDt = this.time.dt
		const realDt = this.time.dt
		this.stats.totalPlayAndIdleTime += this.time.dt
		this.stats.timeSinceLastDelete += this.time.dt

		this.updateGamepad(this.time.dt)
		this.messenger.update(this.time.dt)
		this.achiever.update(this.time.dt)
		this.explainer?.update(this.time.dt)

		if (this.halt) {
			return true
		}

		//Ingame updates
		this.currentlyExtracting = false
		this.updateSlowdownEvent()
		if (this.alfa) this.updateAlfa(realDt)
		this.updatePunch(this.time.dt)
		this.updateUnfilled(this.time.dt)
		this.updateMemories(this.time.dt)
		this.updateEntities(this.time.dt)
		this.updateResourceInteractions(this.time.dt)
		this.updateVFX(this.time.dt)
		this.updateHollowEvents(this.time.dt)
		this.updateResourcePops(this.time.dt)
		this.updateSurge(this.time.dt)
		this.updateAnalytics(this.time.dt)

		if (!silent){
			this.updateAlfaNodes(realDt)
			this.updateTranslation(realDt)
			this.updateAutoClicker(this.time.dt)
			this.updateMusic(realDt)
		}

		if (this.entitiesInGame.pinhole > 0){
			this.resources = new Array(10).fill(.01)
		}

		return true
	}

	updateAlfaNodes(dt){

		//Spawning loop
		this.alfa.spawnTimer -= dt
		if (this.alfa.spawnTimer <= 0){
			this.alfa.spawnTimer = this.alfa.spawnIntervalRange[0] + (this.alfa.spawnIntervalRange[1] - this.alfa.spawnIntervalRange[0]) * Math.random()
			
			//WIP is it enough?
			const condition = this.resources[3] > 0
			if (condition) this.spawnAlfa()
		}


		if (!this.alfa?.currentNodes?.length) return

		for (let i = 0; i < this.alfa.currentNodes.length; i++){

			const n = this.alfa.currentNodes[i]
			if (n.hit && !n.tainted){
				n.tainted = true
				n.timer = 0
				this.createHollowEvent(`#FF1769`, 1000)
				this.playSound(`impact`)
				this.findAlfa(1)
				this.store.updateAlfa()
				if (this.store.html.store){
					this.store.html.store.classList.add(`alfaFlash`)
					setTimeout(_=>{this.store.html.store.classList.remove(`alfaFlash`)}, 100)
				}
			}

			n.timer -= dt
			if (n.timer <= 0){
				this.deleteSoundSource(n.sfx)
				this.alfa.currentNodes.splice(i,1)
				i--
				continue
			}

		}
	}

	updateMemories(dt){

		if (!this.memoryBuffer.length) return

		const MAXT = 1e4
		const MINT = 1e3

		for (let i = 0; i < this.memoryBuffer.length; i++){

			const m = this.memoryBuffer[i]
			if (m.terminate) {
				this.memoryBuffer.splice(i,1)
				i--
				continue
			}

			const p = m.position
			let en = m.entityName

			if (m.timer === undefined) m.timer = MINT + (MAXT - MINT) * Math.random()

			m.timer -= dt
			if (m.timer <= 0){

				m.timer = undefined

				//////////////////////////////////////////////////////////////////////////////////////////

				const allowed = [en]
				const entityHere = this.entityAtCoordinates(p)
				let onlyoneIsHere = false
				if (entityHere?.name === en){
					//Already has final machine
					m.terminate = true
					continue
				} else if (entityHere?.name === `surge` || entityHere?.name === `cube`){
					continue
				}
				if (entityHere) {
					//Check if it is predecessor
					let validUpgrade = false
					if (this.codex.entities[en].isUpgradeTo){
						let chainName = en
						for (let j = 0; j < 1e2; j++){
							const up = this.codex.entities[chainName].isUpgradeTo
							if (!up) break
							if (entityHere.name === up){
								validUpgrade = true
								if (this.onlyones[entityHere.name]) onlyoneIsHere = true
								break
							}
							chainName = up
							allowed.push(up)
						}
					}
					if (!validUpgrade){
						m.terminate = true
						continue
					}
				} else if (this.codex.entities[en].isUpgradeTo) {
					let chainName = en
					for (let j = 0; j < 1e2; j++){
						const up = this.codex.entities[chainName].isUpgradeTo
						if (!up) break
						chainName = up
						allowed.push(up)
					}
				}

				if (this.codex.entities[en].onlyone){

					const alreadyBuilt = this.onlyones[en]
					let thereIsParentSomewhere = false
					let chainName = en
					for (let j = 0; j < 1e2; j++){
						const up = this.codex.entities[chainName].isUpgradeTo
						if (!up) break
						if (this.onlyones[up]){
							thereIsParentSomewhere = true
							break
						}
						chainName = up
					}
					if (alreadyBuilt || (thereIsParentSomewhere && !onlyoneIsHere)) {
						m.terminate = true
						continue
					}

				}

				let affordableTarget = false
				for (let j = 0; j < allowed.length; j++){
					if (this.canAfford(allowed[j])){
						affordableTarget = allowed[j]
						break
					}
				}

				if (!affordableTarget){
					continue
				}

				//Early exit without building a pinhole
				if (affordableTarget === `pinhole`){
					this.saveGame()
					this.preventSaving = true

					this.completions++
					this.orbUpgrades++
					m.terminate = true
					this.reset(true)
					return
				}


				//ALL GOOD, PROCEED
				const sxy = this.uvToXYUntranslated(p)
				const price = this.getRealPrice(affordableTarget)

				if (entityHere){

					this.clearCell(p)
					this.stats.timeSinceLastDelete = 0

					const refund = this.getRealPrice(entityHere.name)
					this.createResourceTransfer(refund, sxy, undefined, undefined, undefined, true)
					this.stats.machinesSold++

				}

				this.requestResources(price, p, false, true)
				this.addEntity(affordableTarget, p)

				this.createImpact(p, `#000`, [1,0])
				const pan = this.getPanValueFromX(sxy[0])
				this.playSound(`place`, pan)
				this.playSound(`impact`, pan)
				this.punchScreen()
				this.stats.machinesBuild++

				if (this.codex.entities[affordableTarget].onlyone){

					this.onlyones[affordableTarget] = true
					if (this.itemInHand && this.itemInHand.name === affordableTarget) delete this.itemInHand
					
					let chainName = affordableTarget
					for (let j = 0; j < 1e2; j++){
						const up = this.codex.entities[chainName].isUpgradeTo
						if (!up) break
						this.onlyones[up] = true
						chainName = up
					}
				}

				// ////////////
				// if (affordableTarget === `pinhole`){
				// 	this.completions++
				// 	this.orbUpgrades++
				// 	this.reset(true)
				// }
				// /////////////

				if (affordableTarget === en){
					m.terminate = true
					continue
				}

			}

		}

	}

	updateMusic(dt){
		const m = this.music
		if (m.playing || this.pinhole) return

		m.nextIn -= dt
		if (m.nextIn <= 0){

			m.nextIn = 1000 * 60 * 10

			const tracks = this.switchedplanes ? [`AlgorithmicAwakening`, `AlmostAlive`, `EntropyExpansion`, `MachineryMeditations`] : [`AlgorithmicAwakening`, `AlmostAlive`, `EntropyExpansion`]
			const id = Math.floor(Math.random() * tracks.length)

			this.playMusic(tracks[id])

		}
	}

	updateAutoClicker(dt){

		if (this.interactionMode || !this.mouse.automate || !this.mouse.state || !this.hoveredEntity || !(this.hoveredEntity instanceof Cube || this.hoveredEntity instanceof Hollow || this.hoveredEntity instanceof Malformed)) return
		//cube, hollow cube, malformed

		this.mouse.timer -= dt
		if (this.mouse.timer <= 0){

			this.mouse.timer = this.mouse.maxTimer// + (Math.random() * this.mouse.maxTimer * .5 - this.mouse.maxTimer * .25)
			this.processDown()

		}

	}

	updateGamepad(dt){

		//WIP: UPDATE

		if (!this.gamepadIsConnected) return
		const gamepad = navigator.getGamepads()[0]
		if (!gamepad || gamepad.id.toLowerCase().includes("wheel") || gamepad.id.toLowerCase().includes("driving")) return

		// Check mapping
		// for (let i = 0; i < gamepad.buttons.length; i++){
		// 	if (gamepad.buttons[i].pressed) console.log(i)
		// }

		//Move - achievements - dialogue
		const deadzone = .25
		const freezone = .75
		if (gamepad.axes && gamepad.axes[0] !== undefined && Math.abs(gamepad.axes[0]) > deadzone){
			this.gamepadControl = true
			this.translationMap[gamepad.axes[0] > 0 ? 1 : 3] = (Math.abs(gamepad.axes[0]) - deadzone) / freezone * 1.6
			this.mouse.positionChanged = true
		} else {
			if (this.gamepadControl) this.translationMap[1] = this.translationMap[3] = 0
		}

		if (gamepad.axes && gamepad.axes[1] !== undefined && Math.abs(gamepad.axes[1]) > deadzone){
			if (this.altActive){
				this.messenger.element.scrollBy(0, dt * gamepad.axes[1])
			} else if (this.splash.isShown){
				this.splash.glory.scrollBy(0, dt * gamepad.axes[1])
			} else {
				this.gamepadControl = true
				this.translationMap[gamepad.axes[1] > 0 ? 2 : 0] = (Math.abs(gamepad.axes[1]) - deadzone) / freezone * 1.6
				this.mouse.positionChanged = true	
			}

		} else {
			if (this.gamepadControl) this.translationMap[2] = this.translationMap[0] = 0
		}

		//Mouse
		if (gamepad.axes && gamepad.axes[2] !== undefined && gamepad.axes[3] !== undefined && Math.abs(gamepad.axes[2]) > deadzone || Math.abs(gamepad.axes[3]) > deadzone){
			const x = Math.min(this.w / this.pixelRatio, Math.max(0, this.mouse.sxy[0] + (Math.max(0, Math.abs(gamepad.axes[2]) - deadzone)) * Math.sign(gamepad.axes[2]) / freezone * dt * this.pixelRatio * .4))
			const y = Math.min(this.h / this.pixelRatio, Math.max(0, this.mouse.sxy[1] + (Math.max(0, Math.abs(gamepad.axes[3]) - deadzone)) * Math.sign(gamepad.axes[3]) / freezone * dt * this.pixelRatio * .4))
			this.updateMouseData(x,y)
			this.processMousemove2()
		}
		
		//Main action WIP GAMEPAD SHOP CONNECT
		const mainAction = v=>{
			if (this.splash.isShown){
				if (v) {
					if (this.splash.selected && this.splash.items[this.splash.selectedId].onmousedown) this.splash.items[this.splash.selectedId].onmousedown()
					if (this.splash.selected) this.splash.items[this.splash.selectedId].click()
				} else {
					if (this.splash.selected && this.splash.items[this.splash.selectedId].onmouseup) this.splash.items[this.splash.selectedId].onmouseup()
				}
			} else if (this.shop.selected){
				const id = this.shop.items[this.shop.selectedId].name
				if (this.canAfford(id)) {
					this.pickupItem(id)
					this.processMousemove2()
				}
				this.shop.deselectItem()
			} else {
				if (v) {
					this.processDown()
				} else {
					if (!this.mouse.positionChanged) {
						this.processClick()
					}
					this.processMouseup()
				}
			}
		}

		const isValidButton = (id,prop=`value`) => gamepad.buttons[id] && gamepad.buttons[id][prop] !== undefined && gamepad.buttons[id][prop] !== this.gamepadButtons[id]

		// console.log(this.shop.selected)

		if (isValidButton(0)){
			mainAction(gamepad.buttons[0].value)
			this.gamepadButtons[0] = gamepad.buttons[0].value
		}
		if (isValidButton(7,`pressed`)){
			mainAction(gamepad.buttons[7].pressed)
			this.gamepadButtons[7] = gamepad.buttons[7].pressed
		}

		//E
		if (isValidButton(2)){
			if (gamepad.buttons[2].value) this.processE()
			this.gamepadButtons[2] = gamepad.buttons[2].value
		}


		//Cancel
		if (isValidButton(1)){
			if (gamepad.buttons[1].value) this.processQ()
			this.gamepadButtons[1] = gamepad.buttons[1].value
		}

		//Chat
		if (isValidButton(10)){
			if (gamepad.buttons[10].value) this.messenger.chatIcon.click()
			this.gamepadButtons[10] = gamepad.buttons[10].value
		}

		//Shop and menu
		if (isValidButton(12)){
			if (gamepad.buttons[12].value) {
				if (this.splash.isShown){
					if (this.splash.selected){
						this.splash.selectPreviousItem()
					} else {
						this.splash.selectItem()
					}
				} else if (this.shop.selected){
					this.shop.selectPreviousItem()
				} else {
					this.shop.selectItem()
				}
				
			}
			this.gamepadButtons[12] = gamepad.buttons[12].value
		}

		if (isValidButton(13)){
			if (gamepad.buttons[13].value) {
				if (this.splash.isShown){
					if (this.splash.selected){
						this.splash.selectNextItem()
					} else {
						this.splash.selectItem()
					}
				} else if (this.shop.selected){
					this.shop.selectNextItem()
				} else {
					this.shop.selectItem()
				}
				
			}
			this.gamepadButtons[13] = gamepad.buttons[13].value
		}

		if (isValidButton(14)){
			if (gamepad.buttons[14].value) {
				if (this.splash.isShown){
					if (this.splash.items[this.splash.selectedId] === this.splash.muteElement){
						this.updateGlobalVolume(this.globalSoundVolume - .1)
					} else {
						this.splash.deGloryButton.click()	
					}
				} else if (this.shop.selected){
					this.shop.deselectItem()
				} else {
					this.shop.selectItem()
				}
				
			}
			this.gamepadButtons[14] = gamepad.buttons[14].value
		}

		if (isValidButton(15)){
			if (gamepad.buttons[15].value) {
				if (this.splash.isShown){
					if (this.splash.items[this.splash.selectedId] === this.splash.muteElement){
						this.updateGlobalVolume(this.globalSoundVolume + .1)
					} else {
						this.splash.gloryButton.click()
					}
				} else if (this.shop.selected){
					const id = this.shop.items[this.shop.selectedId].name
					if (this.canAfford(id)) {
						this.pickupItem(id)
						this.processMousemove2()
					}
					this.shop.deselectItem()
				} else {
					this.shop.selectItem()
				}
				
			}
			this.gamepadButtons[15] = gamepad.buttons[15].value
		}

		//Flashlight
		if (isValidButton(8)){
			if (gamepad.buttons[8].value) {
				this.togglePhotofobia()
				
			}
			this.gamepadButtons[8] = gamepad.buttons[8].value
		}

		//Menu
		if (isValidButton(9)){
			if (gamepad.buttons[9].value) {
				this.toggleSplash()
			}
			this.gamepadButtons[9] = gamepad.buttons[9].value
		}

		//Alt
		if (isValidButton(6,`pressed`)){
			if (gamepad.buttons[6].pressed) {
				this.altActive = true
				document.body.classList.add(`altHolded`)
			} else {
				this.altActive = false
				document.body.classList.remove(`altHolded`)
			}
			this.gamepadButtons[6] = gamepad.buttons[6].pressed
		}

	}

	measureRates(){

		const timeWindow = 11000
		const resourceBuffer = [...this.resources]
		this.rateMeasureMode = true

		setTimeout(_=>{

			const delta = this.resources.map((v,i)=>v-resourceBuffer[i])
			const resourceRates = delta.map(v=>v/timeWindow*100) //Change in resources per second
			// console.log(resourceRates)
			delete this.rateMeasureMode

		},timeWindow)

		
		// this.resourceRates = delta.map(v=>v/dt)

		// console.log(this.resourceRates)//zzz

		// this.resourceBuffer = [...this.resources]

	}

	updateSlowdownEvent(){

		if (this.slowdown.state){

			this.slowdown.timer -= this.time.dt

			const f = this.slowdown.timer / this.slowdown.totalTime
			this.slowdown.f = f < .2 ? f * 5 : f < .8 ? 1 : 1 - (f - .8) * 5

			this.time.dt *= (1 * (1 - this.slowdown.f) + this.slowdown.multiplyer * this.slowdown.f)


			//zzz I don't remember why it was !this.plane. Weird.
			if (this.slowdown.timer <= 0 || this.plane){
				this.slowdown.state = false
			}

		} else if (!this.slowdown.cooldown && !this.entitiesInGame.pinhole){

			const hollows = this.entitiesInGame.hollow || 0
			const flowers = (this.entitiesInGame.flower || 0) + (this.entitiesInGame.fruit || 0)
			const threshold = Math.max(0, hollows - flowers) * this.time.dt * 1e-6

			if (Math.random() < threshold && !this.plane){

				const dice = Math.random()
				const power = (dice < .1 && hollows > 8) ? .02 : dice < .3 ? .1 : dice < .7 ? .5 : 2

				const time = (10000 + Math.random() * 10000 * hollows) * (power === .01 ? .5 : 1)

				// const fast = Math.random() < .333
				// const veryslow = hollows > 8 && fast && (Math.random() < .333)

				// const time = (20000 + Math.random() * 20000 * hollows) * (veryslow ? .5 : 1)
				this.slowdown.cooldown = 96000
				this.initiateSlowdown( time, power )
				
			}

		} else {

			this.slowdown.cooldown = Math.max(0, this.slowdown.cooldown - this.time.dt)

		}

	}

	updatePunch(dt){
		if (this.punch.state){

			this.punch.timer += dt
			if (this.punch.timer >= this.punch.maxTimer){
				this.punch.state = 0
				this.punch.offset = 0
				return
			}

			const f = Math.min(1, this.punch.timer / this.punch.maxTimer)
			
			// this.punch.offset = f ** .5 * this.punch.maxOffset
			// this.punch.offset = (-2 * (f - .3) ** 2 + 1) * this.punch.maxOffset
			this.punch.offset = (1 - f**2) * this.punch.maxOffset

		}
	}

	punchScreen(force = 1, time = 60){
		this.punch.maxOffset = this.unit * .06 * force
		this.punch.timer = 0
		this.punch.maxTimer = time
		this.punch.state = 1
	}

	updateResourceInteractions(dt){

		//Halflife
		if (this.resources[5]){

			const decayChance = 2e-5 * dt

			// const outcomes = [
			// 	[.5, n=>[0,0,0,0,2*n]],
			// 	[.85, n=>[0,0,0,8*n]],
			// 	[.97, n=>[0,0,16*n]],
			// 	[1, n=>[0,32*n]]
			// ]
			// const outcomesDecay = [
			// 	[.5, n=>[0,0,0,0,4*n]],
			// 	[.8, n=>[0,0,0,16*n]],
			// 	[.9, n=>[0,0,32*n]],
			// 	[1, n=>[0,64*n]]
			// ]

			const outcomes = this.generaldecay ? [[.5, n=>[0,0,0,0,4*n]],[.8, n=>[0,0,0,16*n]],[.93, n=>[0,0,32*n]],[1, n=>[0,64*n]]] : [[.5, n=>[0,0,0,0,2*n]],[.85, n=>[0,0,0,8*n]],[.97, n=>[0,0,16*n]],[1, n=>[0,32*n]]]

			const average = this.chromaToContain * decayChance
			let hits = 0

			if (average < 1 && Math.random() < average) {
				hits = 1
			} else if (average >= 1){
				hits = Math.floor(average)
			} else {
				hits = 0
			}

			// this.resources[5] = Math.max(0, this.resources[5] - hits)
			this.substractResourcesFromArray([0,0,0,0,0,hits])

			if (hits) {

				const dice = Math.random()
				let outcome
				for (let i = 0; i < 4; i++){
					if (dice < outcomes[i][0]){
						outcome = outcomes[i]
						break
					}
				}

				if (this.generaldecay){
					this.generaldecay.consume(outcome[1](hits))
				} else {
					this.playSound(`geiger`)
					this.createResourceTransfer(outcome[1](hits), this.resourceHomes[5])
				}
			}

		}

		//Crusade
		if (this.resources[6]){

			let heavenToDestroy = Math.min(Math.floor(Math.max(0, this.resources[4] - this.vaults.size * 1024) / this.hellgemChunk), this.resources[6])
			let hellToDestroy = heavenToDestroy * this.hellgemChunk
			if (!hellToDestroy && this.forcedAnnihilation){
				delete this.forcedAnnihilation
				hellToDestroy = Math.min(1, this.resources[4])
				heavenToDestroy = hellToDestroy
			}

			if (this.resources[4] > 1e9) this.resources[4] = 1e9

			if (hellToDestroy){
				
				this.substractResourcesFromArray([0,0,0,0,hellToDestroy,0,heavenToDestroy])
				this.createResourceTransfer([0,0,0,hellToDestroy * 4], this.resourceHomes[4])
				
				let annihilatorWorking = false
				for (const a of this.annihilators){
					annihilatorWorking = a.tap() || annihilatorWorking
				}
				this.playSound(`hellbreak`,0, this.voidsculpture ? .16 : 1)
				if (!annihilatorWorking){
					this.createResourceExplosion([0,0,0,0,hellToDestroy,0,heavenToDestroy])
				}

				for (const m of this.annihilationMachines){
					m.tap()
				}

			}

		}

	}

	updateResourcePops(dt){

		for (let i = 0; i < this.resourcePops.length; i++){
			this.resourcePops[i] = Math.max(0, this.resourcePops[i] * (1 - 1/dt))
		}

	}

	updateTranslation(dt){

		let updated = false
		const mult = 1//this.shiftPressed ? 2 : 1

		if (this.translationMap[0]) {this.translation[1] -= mult * dt * this.translationSpeed * this.translationMap[0] / this.zoom; updated = true}
		if (this.translationMap[1]) {this.translation[0] += mult * dt * this.translationSpeed * this.translationMap[1] / this.zoom; updated = true}
		if (this.translationMap[2]) {this.translation[1] += mult * dt * this.translationSpeed * this.translationMap[2] / this.zoom; updated = true}
		if (this.translationMap[3]) {this.translation[0] -= mult * dt * this.translationSpeed * this.translationMap[3] / this.zoom; updated = true}

		if (updated){
			this.processMove()
			this.updateGlobalPositioning()
		}

		//Distance to origin
		if (this.hoveredCell){
			this.distanceToOrigins = Math.min( (this.hoveredCell[0] ** 2 + this.hoveredCell[1] ** 2)**.5, ((this.hoveredCell[0] + 100) ** 2 + (this.hoveredCell[1] + 100) ** 2)**.5 )
		}

		if (this.orbifoldUI){

			this.orbifoldUI.updatePosition()

		}

	}

	renderloop(){

		requestAnimationFrame(_=>{this.renderloop()})


		this.unit = this.solidUnit * this.zoom

		if (this.halt) return

			const now = performance.now()
			this.renderTime.dt = now - this.renderTime.lt
			this.renderTime.lt = now

			if (this.slowdown.state) this.renderTime.dt *= (1 * (1 - this.slowdown.f) + this.slowdown.multiplyer * this.slowdown.f)

			if (this.plane === 1){
				this.ctx.fillStyle = `#000`
				this.ctx.fillRect(0, 0, this.w, this.h)
			} else {
				this.ctx.fillStyle = `#FFF`
				this.ctx.fillRect(0, 0, this.w, this.h)
			}
			
			this.ctx.save()
			this.ctx.translate(this.w2, this.h2 + this.punch.offset)

			//HIGHLIGHT
			this.renderConductors(this.renderTime.dt)
			this.ctx.translate(-this.w2, -this.h2)
			this.renderChasmVFX()
			this.ctx.translate(this.w2, this.h2)

			// this.renderEntities(this.renderTime.dt) //PLANNING MODE?
			// this.renderEntitiesAbstract(this.renderTime.dt)

			const showItemInHand = this.itemInHand && this.hoveredCell
			const ifNotMobileOrWhileTap = !this.isMobile || this.mouse.state === 1
			const clearView = showItemInHand || this.touchMode || this.altActive || this.interactionMode === `erase` || this.interactionMode === `relocate` || this.interactionMode === `clone`

			if (clearView) {
				this.renderEntitiesAbstract(this.renderTime.dt)
			} else {
				this.renderEntities(this.renderTime.dt)
			}

			//MEMORIES
			for (let i = 0; i < this.memoryBuffer.length; i++){
				const position = this.memoryBuffer[i].position
				const xy = this.uvToXY(position)

				const seed = this.stats.totalPlayTime / 60 + position[0] + position[1]
				const phase = (seed % (Math.PI * 2)) / Math.PI / 2
				const r = this.unit * .02 + (Math.sin(seed) * .5 + .5) * this.unit * .05

				this.ctx.fillStyle = `#112`
				this.ctx.beginPath()
				this.ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()
			}

			//Alfa nodes
			if (this.alfa.currentNodes?.length){
				for (let i = 0; i < this.alfa.currentNodes.length; i++){
					const np = this.alfa.nodeProperties
					const n = this.alfa.currentNodes[i]
					const r = np.radius * this.unit * 1
					const xy = this.uvToXY([n.position[0] - .5, n.position[1] - .5])

					const s = this.unit * .25
					const t = performance.now() / 20
					const phase = t/50 % 1

					const age = n.timer / np.duration
					let alfaMult = age < .1 ? age * 10 : age > .8 ? 1 - (age-.8) * 5 : 1
					alfaMult *= .8

					for (let j = 0; j < np.spiralCount; j++){

						const index = (j + t) % np.spiralCount

					    const a = j * np.spiralAngle

					    const f = index / np.spiralCount
					    const shift = r * f ** .5

					    const fadeOut = Math.min(1, (1 - f) * 2)
					    const alpha = Math.max(0, Math.min(1, fadeOut))
					    const ss = s * (0.5 + f * 1.5) * alpha

					    this.ctx.save()
					    this.ctx.globalAlpha = alfaMult * alpha * ((Math.sin(t/10 + j * 7.12) * .5 + .5) * .9 + .1)
					    this.ctx.translate(xy[0], xy[1])
					    this.ctx.scale(1,.68)
					    this.ctx.rotate(a)
					    this.ctx.translate(0, shift)

					    // this.ctx.fillRect(-ss / 2, -ss / 2, ss, ss)
					    this.ctx.drawImage(this.images[`img/shard.jxl`], -ss/2, -ss/2, ss, ss * (1 + f * 64 * age))
					    this.ctx.restore()

					}

					this.ctx.globalAlpha = alfaMult
					let si = this.unit * .6
					si *= (1 + .1 * Math.random())
					this.ctx.drawImage(this.images[`img/shard.jxl`], xy[0]-si/2, xy[1]-si/2, si, si)
					this.ctx.globalAlpha = 1
					


				}
			}

			//Alt mode
			if (this.altActive && !this.plane) {
				// this.ctx.fillStyle = `#FFFC`
				// this.ctx.fillRect(-this.w2, -this.h2, this.w, this.h)

				if (this.hoveredEntity && !(this.hoveredEntity instanceof Cube)){
					this.renderSOI(this.hoveredEntity)
					this.hoveredEntity.render(0)
					this.renderAffected(this.hoveredEntity)
				}

			}

			if (this.interactionMode === `build` && this.hoveredCell && ifNotMobileOrWhileTap){
				this.renderAvailability()
				this.renderSOI(this.hoveredCell)
			} else if (this.interactionMode === `erase` && this.hoveredCell && !this.selectionCandidateSet?.size){
				if (this.hoveredEntity && this.canEraseEntity(this.hoveredEntity)){
					this.renderEntityInColor(`bad`, this.hoveredEntity)
				}
			}

			if (this.hoveredCell && ifNotMobileOrWhileTap) this.renderHoveredCell()

			//ERASE RELOCATE CLONE
			if (this.selectionCandidateSet){
				const scheme = this.interactionMode === `erase` || (this.interactionMode === `clone` && !this.canPlace) ? `bad` : `good`
				for (let c of this.selectionCandidateSet){
					this.renderEntityInColor(scheme, c)
				}

				if (this.selectionOrigin && this.selectionTarget){

					const color = this.interactionMode === `erase` ? `#FF241C` : `#24AA1C`

					const umin = Math.min(this.selectionTarget[0], this.selectionOrigin[0])
					const umax = Math.max(this.selectionTarget[0], this.selectionOrigin[0])
					const vmin = Math.min(this.selectionTarget[1], this.selectionOrigin[1])
					const vmax = Math.max(this.selectionTarget[1], this.selectionOrigin[1])

					const dx = .866 * this.unit
					const dy = .5 * this.unit

					const xyA = this.uvToXY([umin, vmin])
					const xyB = this.uvToXY([umax, vmin])
					const xyC = this.uvToXY([umax, vmax])
					const xyD = this.uvToXY([umin, vmax])

					this.ctx.save()

					this.ctx.setLineDash([this.pixelRatio * 8, this.pixelRatio * 10])
					this.ctx.lineWidth = this.pixelRatio * 3
					this.ctx.strokeStyle = color

					this.ctx.beginPath()
					this.ctx.moveTo(xyA[0], xyA[1] - dy)
					this.ctx.lineTo(xyB[0] + dx, xyB[1])
					this.ctx.lineTo(xyC[0], xyC[1] + dy)
					this.ctx.lineTo(xyD[0] - dx, xyD[1])
					this.ctx.closePath()
					this.ctx.stroke()

					this.ctx.restore()

				}

			}

			if (this.selectionList && this.selectionOffsets){

				const anchor = this.getSelectionAnchor()

				const c = this.canPlace ? `#09D35055` : this.getColorWave([236,20,1,.5],[220,220,220,.9])
				for (let i = 0; i < this.selectionList.length; i++){

					this.selectionList[i].renderColored(0, [anchor[0] + this.selectionOffsets[i][0], anchor[1] + this.selectionOffsets[i][1]], c)

				}

			}

			if (this.cloneList && !this.cloneAreaSelected){

				let canAfford = true
				for (let i = 0; i < this.totalCloneCost.length; i++){
					if (this.totalCloneCost[i] > this.resources[i]){
						canAfford = false
						break
					}
				}
				if (this.massRelocation) canAfford = true

				for (let i = 0; i < this.cloneList.length; i++){
					const color = canAfford ? `good` : `bad`
					this.renderInColor(color, this.cloneList[i].position)
				}
				if (this.cloneOrigin && this.cloneTarget){

					const umin = Math.min(this.cloneTarget[0], this.cloneOrigin[0])
					const umax = Math.max(this.cloneTarget[0], this.cloneOrigin[0])
					const vmin = Math.min(this.cloneTarget[1], this.cloneOrigin[1])
					const vmax = Math.max(this.cloneTarget[1], this.cloneOrigin[1])

					const dx = .866 * this.unit
					const dy = .5 * this.unit

					const xyA = this.uvToXY([umin, vmin])
					const xyB = this.uvToXY([umax, vmin])
					const xyC = this.uvToXY([umax, vmax])
					const xyD = this.uvToXY([umin, vmax])

					this.ctx.save()

					this.ctx.setLineDash([this.pixelRatio * 8, this.pixelRatio * 10])
					this.ctx.lineWidth = this.pixelRatio * 3
					this.ctx.strokeStyle = `#30CE6F`

					this.ctx.beginPath()
					this.ctx.moveTo(xyA[0], xyA[1] - dy)
					this.ctx.lineTo(xyB[0] + dx, xyB[1])
					this.ctx.lineTo(xyC[0], xyC[1] + dy)
					this.ctx.lineTo(xyD[0] - dx, xyD[1])
					this.ctx.closePath()
					this.ctx.stroke()

					this.ctx.restore()

				}
			} else if (this.cloneEntitiesList && this.cloneAreaSelected){
				if (this.massRelocation){

					const dict = {}
					for (let i = 0; i < this.cloneList.length; i++){
						dict[`u${this.cloneList[i].position[0]}v${this.cloneList[i].position[1]}`] = true
					}

					let relocationCondition = true
					for (let i = 0; i < this.cloneEntitiesList.length; i++){
						if (!this.canRelocate(this.cloneList[i]) || (this.entityAtCoordinates(this.cloneEntitiesList[i].position) && !dict[`u${this.cloneEntitiesList[i].position[0]}v${this.cloneEntitiesList[i].position[1]}`])){
							relocationCondition = false
							break
						}
					}

					for (let i = 0; i < this.cloneEntitiesList.length; i++){
						this.cloneEntitiesList[i].render()
						const color = relocationCondition ? `good` : `bad`
						this.renderInColor(color, this.cloneEntitiesList[i].position)
					}
				} else {
					for (let i = 0; i < this.cloneEntitiesList.length; i++){
						this.cloneEntitiesList[i].render()
						const color = this.canPlaceEntityHere(this.cloneEntitiesList[i], this.cloneEntitiesList[i].position) ? `good` : `bad`
						this.renderInColor(color, this.cloneEntitiesList[i].position)
					}
				}
			}

			//Render Clone List
			if (showItemInHand && ifNotMobileOrWhileTap){
				const c = this.canPlace ? `#09D35055` : this.getColorWave([236,20,1,.5],[220,220,220,.9])
				if (this.plane) {this.itemInHand.darkrenderColored(0, this.hoveredCell, c)} else {this.itemInHand.renderColored(0, this.hoveredCell, c)}
				this.renderAffected(this.itemInHand)
			}

			//Pinhole
			if (this.pinhole){

				const radius = this.unit * .01 + this.unit * 2 * this.pinhole.f
				const da = .05
				const time = performance.now() / 1000

				const noise = (Math.sin(time * 37) * .6 + Math.sin(time * 1913.2) * .4) * this.unit * .08

				const ctx = this.ctx
				const xy = this.uvToXY(this.pinhole.position)
				ctx.save()
				ctx.translate(xy[0], xy[1] - this.unit)
				ctx.fillStyle = this.plane ? `#FFF` : `#000`

				ctx.beginPath()
				ctx.arc(0,0,Math.max(0,radius + noise),0,Math.PI * 2)

				ctx.closePath()

				ctx.fill()
				ctx.restore()

			}

			this.ctx.restore()

			if (this.mouse.cursorVisible) this.renderCursor(clearView)
			if (clearView) this.renderGrid()
			if (this.isMobile) {
				
				if (showItemInHand){

					const circleScale = 2.2
					const radius = this.screenUnit * circleScale
					const cutoff = radius * .533
					const itemScale = circleScale * .4

					this.ctx.save()
					this.ctx.translate(this.w/2, this.h/4)

					const grad = this.ctx.createRadialGradient(0,0,cutoff,0,0,radius)
					grad.addColorStop(0, `#2244`)
					grad.addColorStop(1, `#4480`)
					this.ctx.fillStyle = grad
					this.ctx.beginPath()
					this.ctx.arc(0,0,radius, 0, Math.PI * 2)
					this.ctx.fill()

					this.ctx.fillStyle = `#FFF`
					this.ctx.beginPath()
					this.ctx.arc(0,0,cutoff, 0, Math.PI * 2)
					this.ctx.fill()

					this.ctx.scale(itemScale / this.zoom, itemScale / this.zoom)
					this.itemInHand.render(0, this.xyToUVUntranslated())

					this.ctx.restore()
				}
			}

			this.renderVFX()

			//Touch mode modes (relocation, eraser)
			if (this.isMobile && this.interactionMode === `erase`){

				const fill = this.ctx.createLinearGradient(0, 0, 0, this.h)
				fill.addColorStop(0, `#FF241CFF`)
				fill.addColorStop(1, `#FFB97F00`)

				this.ctx.save()
				this.ctx.globalCompositeOperation = `multiply`
				this.ctx.fillStyle = fill
				this.ctx.fillRect(0, 0, this.w, this.h)

				this.ctx.globalCompositeOperation = `source-over`
				this.ctx.font = `600 ` + this.screenUnit * .5 + `px Montserrat, sans-serif`
				this.ctx.textAlign = `center`
				this.ctx.fillStyle = `#FFF`
				this.ctx.fillText(this.pronounce('entities', this.eraserType === 1 ? `eraser2` : this.eraserType === 2 ? `eraser3` : `eraser`, 'name'), this.w2, this.h * .25)

				this.ctx.restore()

			} else if (this.isMobile && this.interactionMode === `relocate`){

				const fill = this.ctx.createLinearGradient(0, 0, 0, this.h)
				fill.addColorStop(0, `#30F1FFFF`)
				fill.addColorStop(1, `#CEFFB400`)
				this.ctx.save()
				this.ctx.globalCompositeOperation = `multiply`
				this.ctx.fillStyle = fill
				this.ctx.fillRect(0, 0, this.w, this.h)

				this.ctx.globalCompositeOperation = `difference`
				this.ctx.font = `600 ` + this.screenUnit * .5 + `px Montserrat, sans-serif`
				this.ctx.textAlign = `center`
				this.ctx.fillStyle = `#FFF`
				this.ctx.fillText(this.pronounce('random', 'relocate'), this.w2, this.h * .25)

				this.ctx.restore()

			} else if (this.isMobile && this.interactionMode === `clone`){

				const fill = this.ctx.createLinearGradient(0, 0, 0, this.h)
				fill.addColorStop(0, `#C7FF7EFF`)
				fill.addColorStop(1, `#FFF5B400`)
				this.ctx.save()
				this.ctx.globalCompositeOperation = `multiply`
				this.ctx.fillStyle = fill
				this.ctx.fillRect(0, 0, this.w, this.h)

				this.ctx.globalCompositeOperation = `difference`
				this.ctx.font = `600 ` + this.screenUnit * .5 + `px Montserrat, sans-serif`
				this.ctx.textAlign = `center`
				this.ctx.fillStyle = `#FFF`
				this.ctx.fillText(this.pronounce('random', 'clone'), this.w2, this.h * .25)

				this.ctx.restore()

			}

			//Desktop modes
			// if (this.interactionMode === `erase` || this.interactionMode === `relocate` || this.interactionMode === `clone`){

			// 	this.ctx.font = this.smallFont

			// 	const sh = this.pixelRatio * 4
			// 	const h = this.pixelRatio * 30
			// 	const db = h
			// 	const txt = this.interactionMode === `erase` ? `Click / Click + Drag` : this.interactionMode === `relocate` ? `Click on a machine or select an area to move machines. SHIFT to clone.` : `Click on a machine or select an area to copy machines`//this.pronounce(`entities`, `eraser3`, `name`)
			// 	const tw = this.ctx.measureText(txt).width

			// 	const x1 = this.w2 - tw/2
			// 	const x2 = this.w2 + tw/2

			// 	this.ctx.fillStyle = this.interactionMode === `erase` ? `#AA4F43` : this.interactionMode === `relocate` ? `#477868` : `#645EB7`

			// 	this.ctx.beginPath()
			// 	this.ctx.moveTo(0, this.h - sh)
			// 	this.ctx.lineTo(x1 - db - db, this.h - sh)
			// 	this.ctx.bezierCurveTo(x1 - db, this.h - sh, x1 - db , this.h - h, x1, this.h - h)
			// 	this.ctx.lineTo(x2, this.h - h)
			// 	this.ctx.bezierCurveTo(x2 + db, this.h - h, x2 + db , this.h - sh, x2 + db + db , this.h - sh)
			// 	this.ctx.lineTo(this.w, this.h - sh)
			// 	this.ctx.lineTo(this.w, this.h)
			// 	this.ctx.lineTo(0, this.h)
			// 	this.ctx.closePath()
			// 	this.ctx.fill()

			// 	this.ctx.fillStyle = `#FFF`
			// 	this.ctx.fillText(txt,this.w2, this.h - h*.48)

			// }
			

			if (!this.plane){

				if (this.chasm) this.renderChasm()
				this.renderResources()
				if (!this.chillMode) this.renderHollowEvents()
				this.renderSlowdown()

			} else {

				if (this.entitiesInGame.pinhole > 0){
					this.renderResources()
				} else {
					this.renderDarkResources()
				}
				
				if (!this.chillMode) this.renderDarkHollowEvents()

			}

			//Hint position update
			if (this.currentHint.element && !this.isMobile){

				this.currentHint.element.style.left = this.mouse.sxy[0] + `px`
				this.currentHint.element.style.top = this.mouse.sxy[1] + `px`

			}

			if (this.photofobia && this.flashlight && !this.plane){
				this.ctx.fillStyle = this.flashlight
				this.ctx.fillRect(0,0,this.w,this.h)
			}

			if (this.attractor) this.renderAttractor(this.attractor)

			//MEMORY COMPLEX
			if (this.memoryComplexIsVisible && !this.plane){
				this.ctx.save()
				this.ctx.translate(this.w2, this.h2 + this.punch.offset)
				this.renderMemoryComplex()
				this.ctx.restore()
			}


	}

	renderMemoryComplex(){
		const mc = this.memoryComplexStages[this.currentMemoryComplexStage]
		if (!mc) return

		const C = this.uvToXY(this.memorycomplexCenter)
		// const R = this.memorycomplexRadius * this.unit
		const uvc = this.xyToUVUntranslated([0,0])

		const f0 = this.memorycomplexRadius
		const f1 = this.memorycomplexRadius * .5
		const D = ((uvc[0] - this.memorycomplexCenter[0]) ** 2 + (uvc[1] - this.memorycomplexCenter[1]) ** 2) ** .5
		const F = Math.max(0, Math.min(1, (D - f0) / (f1 - f0)))

		if (F > 0) {
			this.ctx.globalAlpha = F
			this.ctx.fillStyle = mc.color
			this.ctx.fillRect(-this.w2,-this.h2,this.w,this.h)
			this.ctx.globalAlpha = 1
		}

		//Cache check
		if (!this.memoryComplexImage){
			this.memoryComplexImage = new Image()
			this.memoryComplexImage.src = mc.src
			this.memoryComplexImageSize = 50
			this.memoryComplexImageAspect = .75
			this.memoryComplexImage.onload = _=>{
				this.memoryComplexImageAspect = this.memoryComplexImage.naturalHeight / this.memoryComplexImage.naturalWidth
			}
		}

		const w = this.unit*this.memoryComplexImageSize
		const h = this.unit*this.memoryComplexImageSize * this.memoryComplexImageAspect

		this.ctx.drawImage(this.memoryComplexImage, C[0] - w/2, C[1] - h/2, w, h)

		if (mc.beam){

			const bw = this.unit * 6.093
			const offsetX = this.unit * .315
			const offsetY = this.unit * 16
			const bh = this.unit * this.memorycomplexRadius

			this.ctx.fillStyle = `#FFF`
			this.ctx.fillRect(C[0] + offsetX - bw/2, C[1] - bh, bw, bh - offsetY)

		}

		//Cursor
		this.ctx.fillStyle = `#FFF`
		const radius = this.pixelRatio * 3
		this.ctx.beginPath()
		this.ctx.arc(this.mouse.xy[0] - this.w2, this.mouse.xy[1] - this.h2, radius, 0, Math.PI * 2)
		this.ctx.closePath()
		this.ctx.fill()
	}

	renderAttractor(A){

		if (!A) return

		let target
		let cell = false

		if (A.getBoundingClientRect && A.isConnected){
			const bcr = A.getBoundingClientRect()
			target = [(bcr.x + bcr.width / 2) * this.pixelRatio, (bcr.y + bcr.height / 2) * this.pixelRatio]
		} else if (A.position){
			target = this.uvToXYUntranslated(A.position)
			cell = true
		}

		if (!target) return

		//Cell highlight
		if (cell){
			const dx = .866 * this.unit
			const dy = .5 * this.unit
			const f = (Math.sin(performance.now() * 1e-2) * .5 + .5)
			const o = Math.max(0, Math.round(f * .6 * 255)).toString(16).toUpperCase().padStart(2, `0`)

			this.ctx.strokeStyle = `#FFBF2B`
			this.ctx.fillStyle = `#FFBF2B${o}`
			this.ctx.beginPath()
			this.ctx.moveTo(target[0], target[1] - dy)
			this.ctx.lineTo(target[0] + dx, target[1])
			this.ctx.lineTo(target[0], target[1] + dy)
			this.ctx.lineTo(target[0] - dx, target[1])
			this.ctx.closePath()
			this.ctx.fill()

			const s = .2
			const l = .8
			const b = 1 + f * .4

			this.ctx.lineWidth = this.unit * .05

			this.ctx.beginPath()
			this.ctx.moveTo(target[0] - dx * s * b, target[1] - dy * l * b)
			this.ctx.lineTo(target[0], target[1] - dy * b)
			this.ctx.lineTo(target[0] + dx * s * b, target[1] - dy * l * b)
			this.ctx.stroke()

			this.ctx.beginPath()
			this.ctx.moveTo(target[0] + dx * l * b, target[1] - dy * s * b)
			this.ctx.lineTo(target[0] + dx * b, target[1])
			this.ctx.lineTo(target[0] + dx * l * b, target[1] + dy * s * b)
			this.ctx.stroke()

			this.ctx.beginPath()
			this.ctx.moveTo(target[0] - dx * s * b, target[1] + dy * l * b)
			this.ctx.lineTo(target[0], target[1] + dy * b)
			this.ctx.lineTo(target[0] + dx * s * b, target[1] + dy * l * b)
			this.ctx.stroke()

			this.ctx.beginPath()
			this.ctx.moveTo(target[0] - dx * l * b, target[1] - dy * s * b)
			this.ctx.lineTo(target[0] - dx * b, target[1])
			this.ctx.lineTo(target[0] - dx * l * b, target[1] + dy * s * b)
			this.ctx.stroke()
		} else {

			const R = this.w2
			const bands = 4
			const interval = 4000
			const f = 1 - (performance.now() % interval) / interval
			const grad = this.ctx.createRadialGradient(0,0,0,0,0,R)
			grad.addColorStop(0,`#FFF0`)
			grad.addColorStop(.2,`#FFBF2B`)
			grad.addColorStop(1,`#FFF0`)
			this.ctx.save()
			this.ctx.translate(target[0], target[1])

			this.ctx.strokeStyle = grad

			for (let i = 0; i < bands; i++){
				const ff = ((f + (1 / bands) * i) % 1) ** 4
				this.ctx.lineWidth = this.unit * .2 * ff
				this.ctx.beginPath()
				this.ctx.arc(0,0,R * ff, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.stroke()
			}

		}
		
		this.ctx.restore()

	}

	renderSlowdown(){
		if (this.slowdown.state) {

			this.ctx.save()
			
			this.ctx.globalAlpha = this.slowdown.f
			this.ctx.globalCompositeOperation = `multiply`

			this.ctx.fillStyle = `#FFBB36`
			this.ctx.fillRect(0,0,this.w,this.h)
			
			this.ctx.restore()

			}
	}

	renderHoveredCell(){

		if (this.hoveredEntity){
			this.ctx.save()
			const xy = this.uvToXY(this.hoveredEntity?.position || this.hoveredCell)
			this.ctx.translate(xy[0], xy[1])

			const mult = this.hoveredEntity?.entitySpan === 1 ? 3 : 1.1
			const dx = .866 * this.unit * mult
			const dy = .5 * this.unit * mult
			const s = .2
			const l = .8

			this.ctx.strokeStyle = this.hoveredEntity ? `#112` : `#D0D4D8`
			this.ctx.lineWidth = this.unit * (this.hoveredEntity ? .02 : .01)

			if (!this.hoveredEntity){
				this.ctx.beginPath()
				this.ctx.moveTo(-dx * s, -dy * l)
				this.ctx.lineTo(0, -dy)
				this.ctx.lineTo(dx * s, -dy * l)
				this.ctx.stroke()
			}

			this.ctx.beginPath()
			this.ctx.moveTo(dx * l, -dy * s)
			this.ctx.lineTo(dx, 0)
			this.ctx.lineTo(dx * l, dy * s)
			this.ctx.stroke()

			this.ctx.beginPath()
			this.ctx.moveTo(-dx * s, dy * l)
			this.ctx.lineTo(0, dy)
			this.ctx.lineTo(dx * s, dy * l)
			this.ctx.stroke()

			this.ctx.beginPath()
			this.ctx.moveTo(-dx * l, -dy * s)
			this.ctx.lineTo(-dx, 0)
			this.ctx.lineTo(-dx * l, dy * s)
			this.ctx.stroke()
			
			this.ctx.restore()
		}

	}

	renderSOI(entity){

		// this.drawPrism(this.hoveredCell, 3, 0, [`#FF03`,`#FF03`,`#FF03`])

		//NEW
		this.ctx.save()
		const xy = this.uvToXY(entity.position || entity)
		this.ctx.translate(xy[0], xy[1])

		const dx = .866 * this.unit * 3
		const dy = .5 * this.unit * 3
		const s = .1
		const l = .9

		this.ctx.fillStyle = `#11112208`//`#E8A52316`
		this.ctx.beginPath()
		this.ctx.moveTo(0, -dy)
		this.ctx.lineTo(dx, 0)
		this.ctx.lineTo(0, dy)
		this.ctx.lineTo(-dx, 0)
		this.ctx.closePath()
		this.ctx.fill()

		this.ctx.strokeStyle = `#A5A5B4`//`#FF8F60`
		this.ctx.lineWidth = this.unit * .02

		this.ctx.beginPath()
		this.ctx.moveTo(-dx * s, -dy * l)
		this.ctx.lineTo(0, -dy)
		this.ctx.lineTo(dx * s, -dy * l)
		this.ctx.stroke()

		this.ctx.beginPath()
		this.ctx.moveTo(dx * l, -dy * s)
		this.ctx.lineTo(dx, 0)
		this.ctx.lineTo(dx * l, dy * s)
		this.ctx.stroke()

		this.ctx.beginPath()
		this.ctx.moveTo(-dx * s, dy * l)
		this.ctx.lineTo(0, dy)
		this.ctx.lineTo(dx * s, dy * l)
		this.ctx.stroke()

		this.ctx.beginPath()
		this.ctx.moveTo(-dx * l, -dy * s)
		this.ctx.lineTo(-dx, 0)
		this.ctx.lineTo(-dx * l, dy * s)
		this.ctx.stroke()
		
		this.ctx.restore()


	}

	renderAffected(entity){
		const name = entity.name
		const list = this.codex.entities[name].affected
		if (!list) return

		const color = `#53B976`
		const n = []
		const o = this.hoveredCell
		const r = this.unit * .05

		const xy0 = this.uvToXY(o)

		const width = 3 + entity.entitySpan * 2
		const width2 = width ** 2
		const from = -(1 + entity.entitySpan)
		const swing = width * .16 * this.unit

		for (let i = 0; i < width2; i++){
			const du = from + i % width
			const dv = from + Math.floor(i / width)
			const m = this.stuffMap[`u${o[0] + du}v${o[1] + dv}`]
			if (!m || !list[m.name] || m === entity) continue
			const conductorok = (name === `conductor` || m?.name === `conductor`) ? i%2 : 1
			if (conductorok) n.push(m)
		}

		if (!n.length) return

		this.ctx.strokeStyle = color
		this.ctx.lineWidth = r * .5

		//Lines and circles on targets
		for (let i = 0; i < n.length; i++){

			const xy = this.uvToXY(n[i].position)

			this.ctx.beginPath()
			this.ctx.moveTo(xy0[0], xy0[1])
			this.ctx.bezierCurveTo(xy0[0], xy0[1] + swing, xy[0], xy[1] + swing, xy[0], xy[1])
			this.ctx.stroke()

			this.ctx.fillStyle = color
			this.ctx.beginPath()
			this.ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2)
			this.ctx.closePath()
			this.ctx.fill()
			this.ctx.fillStyle = `#FFF`
			this.ctx.beginPath()
			this.ctx.arc(xy[0], xy[1], r - this.ctx.lineWidth, 0, Math.PI * 2)
			this.ctx.closePath()
			this.ctx.fill()

		}

		//Circle on origin
		this.ctx.fillStyle = color
		this.ctx.beginPath()
		this.ctx.arc(xy0[0], xy0[1], r, 0, Math.PI * 2)
		this.ctx.closePath()
		this.ctx.fill()
		this.ctx.fillStyle = `#FFF`
		this.ctx.beginPath()
		this.ctx.arc(xy0[0], xy0[1], r - this.ctx.lineWidth, 0, Math.PI * 2)
		this.ctx.closePath()
		this.ctx.fill()

	}

	renderCursor(clear){


		if (!this.plane){
			const hint = ((this.selectionCandidateSet?.size && this.interactionMode === `erase`) || (this.interactionMode === `clone` && (this.selectionCandidateSet?.size || this.selectionList?.length))) ? this.areaHint : this.cloneList?.length ? this.cloneHint : (this.interactionMode === `erase` && !this.selectionCandidateSet?.size ? this.hoveredEntity?.getSellHint() : (this.itemInHand && this.hoveredEntity && this.hoveredEntity.name === this.codex.entities[this.itemInHand.name].isUpgradeTo) ? this.itemInHandPriceAndRefundTag : this.itemInHand ? this.itemInHandPriceTag : this.hoveredEntity?.getHint())
			const canHit = this.hoveredEntity && this.hoveredEntity.canHit()

			if (!this.touchMode){

				if (this.showUnfilled) this.renderUnfilled()
				if (this.isMobile && !clear) this.renderActions()

				this.ctx.save()
				this.ctx.translate(this.mouse.xy[0], this.mouse.xy[1])

				if (this.interactionMode === `erase`){

					const big = this.hoveredEntity && this.canEraseEntity(this.hoveredEntity)
					const radius = this.pixelRatio * (big ? 10 : 6)
					this.ctx.lineWidth = this.pixelRatio * (big ? 3 : 2)
					this.ctx.strokeStyle = `#000`
					this.ctx.beginPath()
					this.ctx.moveTo(-radius, -radius)
					this.ctx.lineTo(radius, radius)
					this.ctx.stroke()
					this.ctx.beginPath()
					this.ctx.moveTo(radius, -radius)
					this.ctx.lineTo(-radius, radius)
					this.ctx.stroke()

				} else if (this.interactionMode === `relocate`){

					const big = this.hoveredEntity && this.canRelocate(this.hoveredEntity)
					const length = this.pixelRatio * (big ? 20 : 12)
					const slength = length * .3
					this.ctx.lineWidth = this.pixelRatio * (big ? 3 : 2)
					this.ctx.strokeStyle = this.ctx.fillStyle = `#000`
					this.ctx.beginPath()
					this.ctx.moveTo(0, -slength)
					this.ctx.lineTo(0, -length)
					this.ctx.stroke()
					this.ctx.beginPath()
					this.ctx.moveTo(-slength, slength-length)
					this.ctx.lineTo(0, -length)
					this.ctx.lineTo(slength, slength-length)
					this.ctx.stroke()
					this.ctx.beginPath()
					this.ctx.arc(0,0,slength * .6,0,Math.PI * 2)
					this.ctx.closePath()
					this.ctx.fill()


				} else if (this.interactionMode === `clone`){

					const big = this.canClone(this.hoveredEntity)
					const length = this.pixelRatio * (big ? 20 : 12)
					const slength = length * .3
					this.ctx.fillStyle = `#000`
					this.ctx.beginPath()
					this.ctx.arc(-slength,0,slength * .8,0,Math.PI * 2)
					this.ctx.closePath()
					this.ctx.fill()
					this.ctx.beginPath()
					this.ctx.arc(slength,0,slength * .8,0,Math.PI * 2)
					this.ctx.closePath()
					this.ctx.fill()


				} else {

					const radius = this.pixelRatio * (canHit ? 12 : 6)
					this.ctx.fillStyle = canHit ? `#000` : `#FFF`
					this.ctx.beginPath()
					this.ctx.arc(0, 0, radius, 0, Math.PI * 2)
					this.ctx.closePath()
					this.ctx.fill()
					this.ctx.fillStyle = canHit ? `#FFF` : `#000`
					this.ctx.beginPath()
					this.ctx.arc(0, 0, radius * .8, 0, Math.PI * 2)
					this.ctx.closePath()
					this.ctx.fill()

				}

				this.ctx.restore()

			}

			if (hint){

				hint.update()

				if (hint.element !== this.currentHint.element){

					if (this.currentHint.element) document.body.removeChild(this.currentHint.element)
					this.currentHint.element = hint.element
					this.currentHint.entity = this.hoveredEntity
					document.body.appendChild(this.currentHint.element)

				}

				if (this.itemInHand){
					this.currentHint.element.style.opacity = this.canPlace ? 1 : .3
				}

			}
			if (!hint && this.currentHint.element){
				this.removeHint()
			}

		} else if (this.plane === 1){

			const hint = this.hoveredEntity?.getDarkHint()
			const canHit = this.hoveredEntity?.canDarkHit()

			if (this.showUnfilled) this.renderExit()

			this.ctx.save()
			this.ctx.translate(this.mouse.xy[0], this.mouse.xy[1])

			const radius = this.pixelRatio * (canHit ? 12 : 6)

			this.ctx.fillStyle = `#FFF`
			this.ctx.beginPath()
			this.ctx.arc(0, 0, radius, 0, Math.PI * 2)
			this.ctx.closePath()
			this.ctx.fill()

			if (hint){

				hint.update()

				if (hint.element !== this.currentHint.element){

					if (this.currentHint.element) document.body.removeChild(this.currentHint.element)
					this.currentHint.element = hint.element
					this.currentHint.entity = this.hoveredEntity
					document.body.appendChild(this.currentHint.element)

				}

			}

			if ((this.itemInHand || !hint) && this.currentHint.element){
				this.removeHint()
			}

			this.ctx.restore()

		}

		//ARROW
		if (this.distanceToOrigins > 80 && this.hoveredCell){
			const origin = this.uvToXYUntranslated([0,0])
			const vector = [origin[0] - this.mouse.xy[0], origin[1] - this.mouse.xy[1]]
			const angle = Math.atan2(vector[1], vector[0])
			this.ctx.save()
			this.ctx.translate(this.mouse.xy[0], this.mouse.xy[1])
			this.ctx.rotate(angle)
			this.ctx.fillStyle = this.plane ? `#FFF` : `#000`
			this.ctx.beginPath()
			const u = this.unit / this.zoom
			this.ctx.moveTo(-u*.1, -u * .1)
			this.ctx.lineTo(u * .2, 0)
			this.ctx.lineTo(-u*.1, u * .1)
			this.ctx.lineTo(-u * .05, 0)
			this.ctx.closePath()
			this.ctx.fill()
			this.ctx.restore()
		}


	}

	removeHint(){
		if (this.currentHint.element) {
			if (this.currentHint.element.onremove) this.currentHint.element.onremove()
			document.body.removeChild(this.currentHint.element)
			this.currentHint.element = undefined
			this.currentHint.entity = undefined
		}
	}

	isAndroid(){

		const ua = navigator.userAgent ?? ``
		const plat = navigator.userAgentData?.platform ?? navigator.platform ?? ``
		return /Android/i.test(ua) ?? /Android/i.test(plat)

	}

	renderExit(){

		this.ctx.save()
		const margin = this.pixelRatio * 26
		const size = this.pixelRatio * 28

		//Wells
		const color = this.getColorWave([10,10,20,1],[255,255,255,1])

		for (let i = 0; i < this.idleStuff.length; i++){

			if (!(this.idleStuff[i] instanceof Voidsculpture)) continue

			const coords = this.uvToXYUntranslated(this.idleStuff[i].position)
			const vector = [this.mouse.xy[0] - coords[0], this.mouse.xy[1] - coords[1]]
			const length = (vector[0] ** 2 + vector[1] ** 2) ** .5

			if (length > this.unit * 6){
				this.ctx.strokeStyle = color
				this.ctx.lineWidth = this.pixelRatio * 4
				vector[0] /= length
				vector[1] /= length
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0] - vector[0] * margin * 1.8, this.mouse.xy[1] - vector[1] * margin * 1.8)
				this.ctx.lineTo(this.mouse.xy[0] - vector[0] * size * 2, this.mouse.xy[1] - vector[1] * size * 2)
				this.ctx.stroke()

			} else {

				this.ctx.fillStyle = color
				this.ctx.strokeStyle = color
				this.ctx.lineWidth = this.pixelRatio * 2
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0], this.mouse.xy[1])
				this.ctx.lineTo(coords[0], coords[1])
				this.ctx.stroke()

				this.ctx.beginPath()
				this.ctx.arc(coords[0], coords[1], this.pixelRatio * 2, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()

			}

		}

		this.ctx.restore()

	}

	renderUnfilled(){
		this.ctx.save()
		const margin = this.pixelRatio * 26
		const size = this.pixelRatio * 28
		for (let i = 0; i < this.unfilledEntities.length; i++){
			const coords = this.uvToXYUntranslated(this.unfilledEntities[i].position)
			const vector = [this.mouse.xy[0] - coords[0], this.mouse.xy[1] - coords[1]]
			const length = (vector[0] ** 2 + vector[1] ** 2) ** .5

			if (length > this.unit * 6){
				this.ctx.strokeStyle = `#112`
				this.ctx.lineWidth = this.pixelRatio
				vector[0] /= length
				vector[1] /= length
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0] - vector[0] * margin, this.mouse.xy[1] - vector[1] * margin)
				this.ctx.lineTo(this.mouse.xy[0] - vector[0] * size, this.mouse.xy[1] - vector[1] * size)
				this.ctx.stroke()

				// const a
				// const formula = fi => Math.cos(fi)

				// const vmax = Math.max(this.w, this.h)
				// const margin = vmax * .02
				// const marginr = vmax * .148

				// this.ctx.fillStyle = `#112`
				// this.ctx.fillRect(margin, margin, this.w - margin * 2 - marginr - 8 * this.pixelRatio, this.h - margin * 2)

			} else {
				this.ctx.fillStyle = `#112`
				this.ctx.strokeStyle = `#778`
				this.ctx.lineWidth = this.pixelRatio / 2
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0], this.mouse.xy[1])
				this.ctx.lineTo(coords[0], coords[1])
				this.ctx.stroke()

				this.ctx.beginPath()
				this.ctx.arc(coords[0], coords[1], this.pixelRatio * 2, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()
			}
			
		}

		//Wells
		const color = this.getColorWave([10,10,20,1],[255,84,84,1])

		for (let i = 0; i < this.idleStuff.length; i++){

			const coords = this.uvToXYUntranslated(this.idleStuff[i].position)
			const vector = [this.mouse.xy[0] - coords[0], this.mouse.xy[1] - coords[1]]
			const length = (vector[0] ** 2 + vector[1] ** 2) ** .5

			if (length > this.unit * 6){
				this.ctx.strokeStyle = color
				this.ctx.lineWidth = this.pixelRatio * 4
				vector[0] /= length
				vector[1] /= length
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0] - vector[0] * margin * 1.8, this.mouse.xy[1] - vector[1] * margin * 1.8)
				this.ctx.lineTo(this.mouse.xy[0] - vector[0] * size * 2, this.mouse.xy[1] - vector[1] * size * 2)
				this.ctx.stroke()

			} else {

				this.ctx.fillStyle = color
				this.ctx.strokeStyle = color
				this.ctx.lineWidth = this.pixelRatio * 2
				this.ctx.beginPath()
				this.ctx.moveTo(this.mouse.xy[0], this.mouse.xy[1])
				this.ctx.lineTo(coords[0], coords[1])
				this.ctx.stroke()

				this.ctx.beginPath()
				this.ctx.arc(coords[0], coords[1], this.pixelRatio * 2, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()

			}

		}


		this.ctx.restore()
	}

	getColorWave(rgb1 = [0,0,0,1], rgb2 = [255,255,255,1]){
		const wave = Math.sin(this.stats.totalPlayTime / 128) * .5 + .5
		// return `rgb(${255 * wave}, ${84 * wave}, ${84 * wave})`
		return `rgb(${rgb1[0] + wave * (rgb2[0] - rgb1[0])}, ${rgb1[1] + wave * (rgb2[1] - rgb1[1])}, ${rgb1[2] + wave * (rgb2[2] - rgb1[2])}, ${rgb1[3] + wave * (rgb2[3] - rgb1[3])})`
	}

	renderActions(){
		this.ctx.save()
		this.ctx.translate(this.w2, this.h2)
		const margin = this.pixelRatio * 16
		const size = this.pixelRatio * 18
		for (let i = 0; i < this.totalUnfilledEntities.length; i++){

			const ue = this.totalUnfilledEntities[i]
			if (!this.isVisible(ue)) continue

			const topUV = [ue.position[0]-1.7, ue.position[1]-1.7]
			const coords = this.uvToXY(topUV)

			this.poleSprite.render(ue.position)

			const rMap = []
			const vMap = []

			for (let j = 0; j < ue.fuel.length; j++){
				if (ue.fuel[j]){
					rMap.push(j)
					vMap.push(this.resources[j] >= ue.fuel[j])
				}
			}

			if (rMap.length === 1){
				this.ctx.globalAlpha = vMap[0] ? 1 : .3
				this.resourcesSprites[rMap[0]].renderXY([coords[0], coords[1]])
				this.ctx.globalAlpha = 1
			} else if (rMap.length === 2) {
				this.ctx.globalAlpha = vMap[0] ? 1 : .3
				this.resourcesSprites[rMap[0]].renderXY([coords[0] - this.unit * .18, coords[1]], false, false, .2)
				this.ctx.globalAlpha = vMap[1] ? 1 : .3
				this.resourcesSprites[rMap[1]].renderXY([coords[0] + this.unit * .18, coords[1]], false, false, .2)
				this.ctx.globalAlpha = 1
			} else if (rMap.length === 3) {
				this.ctx.globalAlpha = vMap[0] ? 1 : .3
				this.resourcesSprites[rMap[0]].renderXY([coords[0] - this.unit * .18, coords[1] + this.unit * .11], false, false, .2)
				this.ctx.globalAlpha = vMap[1] ? 1 : .3
				this.resourcesSprites[rMap[1]].renderXY([coords[0] + this.unit * .18, coords[1] + this.unit * .11], false, false, .2)
				this.ctx.globalAlpha = vMap[2] ? 1 : .3
				this.resourcesSprites[rMap[2]].renderXY([coords[0], coords[1] - this.unit * .2], false, false, .2)
				this.ctx.globalAlpha = 1
			}else {

				const width = (rMap.length - 1) * this.unit * .2
				const dw = width / (rMap.length - 1)
				let id = 0

				for (let x = -width/2; x <= width / 2; x += dw){
					this.ctx.globalAlpha = vMap[id] ? 1 : .3
					this.resourcesSprites[rMap[id++]].renderXY([coords[0] + x, coords[1]],false,false,.2)
					this.ctx.globalAlpha = 1
				}

			}


			// this.ctx.fillStyle = `#F00`
			// this.ctx.beginPath()
			// this.ctx.arc(coords[0], coords[1], 10, 0, Math.PI * 2)
			// this.ctx.closePath()
			// this.ctx.fill()
			
			
		}
		this.ctx.restore()
	}

	renderAvailability(){

		this.renderInColor(this.canPlace ? `good` : `bad`, this.hoveredCell)

		// const good = this.plane ? `#FFF6` : `#0F06`
		// const bad = this.getColorWave([236,20,1,.5],[220,220,220,.9])
		// // this.drawPrism(this.hoveredCell, 1, 0, this.canPlace ? good : bad)

		// const dx = .866 * this.unit
		// const dy = .5 * this.unit

		// // this.ctx.save()
		// const xy = this.uvToXY(this.hoveredCell)
		// // this.ctx.translate(xy[0], xy[1])

		// this.ctx.fillStyle = this.canPlace ? good : bad
		// this.ctx.beginPath()
		// this.ctx.moveTo(xy[0], xy[1] - dy)
		// this.ctx.lineTo(xy[0] + dx, xy[1])
		// this.ctx.lineTo(xy[0], xy[1] + dy)
		// this.ctx.lineTo(xy[0] - dx, xy[1])
		// this.ctx.closePath()
		// this.ctx.fill()

		// // this.ctx.restore()

	}

	renderInColor(color=`good`, uv=[0,0]){

		const colors = {
			good: this.plane ? `#FFF6` : `#0F06`,
			bad: this.getColorWave([236,20,1,.5],[220,220,220,.9])
		}

		const dx = .866 * this.unit
		const dy = .5 * this.unit
		const xy = this.uvToXY(uv)

		this.ctx.fillStyle = colors[color]
		this.ctx.beginPath()
		this.ctx.moveTo(xy[0], xy[1] - dy)
		this.ctx.lineTo(xy[0] + dx, xy[1])
		this.ctx.lineTo(xy[0], xy[1] + dy)
		this.ctx.lineTo(xy[0] - dx, xy[1])
		this.ctx.closePath()
		this.ctx.fill()

	}

	renderEntityInColor(color = `good`, entity){
		if (!entity?.position) return
		const span = entity.entitySpan ?? 0
		for (let dx = -span; dx <= span; dx++){
			for (let dy = -span; dy <= span; dy++){

				const p = [entity.position[0] + dx, entity.position[1] + dy]
				this.renderInColor(color, p)

			}
		}
	}

	renderResources(){

		this.ctx.textAlign = `center`
		this.ctx.textBaseline = `middle`

		const glow = this.ctx.createRadialGradient(0,0,0,0,0,this.screenUnit * .4)
		glow.addColorStop(.5, `#FFFF`)
		glow.addColorStop(1, `#FFF0`)

		for (let i = 0; i < 10; i++){ //Show only main resources

			if (this.resources[i]){

				this.ctx.font = this.regularFont
				const s = this.resourcePops[i] || 0
				this.ctx.save()
				this.ctx.translate(this.resourceHomes[i][0], this.resourceHomes[i][1])
				this.ctx.scale(.8 + s, .8 + s)

				this.ctx.fillStyle = glow
				this.ctx.beginPath()
				this.ctx.arc(0,0,this.screenUnit * .4,0,Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()
				
				this.drawResourceInScreenCoordinates(i, [0,0])
				this.ctx.restore()

				let text = this.isMobile ? this.makeReadableFloor(this.resources[i]) : this.makeReadable(this.resources[i])
				if (this.pinhole){

					const t = performance.now()
					if (Math.sin(t/834) * .6 + Math.sin(t/27) * .4 > 0){
						// text = Math.random().toString(36).slice(2, 5)
						text = this.pinhole.labels[Math.floor(this.pinhole.labels.length * Math.random())]
					} else {
						const dict = [`U/D`,`C/S`,`T/B`,`E/νE`,`μ/νμ`,`τ/ντ`,`G/γ`,`Z/W`,`H`,`Δ/νΔ`]
						text = dict[i]
					}

				}
				// let text = `TST`

				const pad = this.screenUnit * .04
				const x = this.resourceHomes[i][0]
				const y = this.resourceHomes[i][1] - this.screenUnit * .4
				this.ctx.fillStyle = `#FFF`
				const measure = this.ctx.measureText(text)
				
				if (this.ctx.roundRect){
					this.ctx.beginPath()
					this.ctx.roundRect(x - measure.actualBoundingBoxLeft - pad, y - measure.actualBoundingBoxAscent - pad, measure.width + pad * 2, measure.actualBoundingBoxDescent + measure.actualBoundingBoxAscent + pad * 2, this.pixelRatio * 2)
					this.ctx.closePath()
					this.ctx.fill()
				} else {
					this.ctx.fillRect(x - measure.actualBoundingBoxLeft - pad, y - measure.actualBoundingBoxAscent - pad, measure.width + pad * 2, measure.actualBoundingBoxDescent + measure.actualBoundingBoxAscent + pad * 2)
				}
				

				this.ctx.fillStyle = `#000`
				this.ctx.fillText(text, this.resourceHomes[i][0], this.resourceHomes[i][1] - this.screenUnit * .4)

				if (i === this.hoveredResource){

					//Name
					const shift = -this.screenUnit * .84
					const nameMeasure = this.ctx.measureText(this.pronounce('resources', i))
					this.ctx.fillStyle = `#FFF`
					if (this.ctx.roundRect){
						this.ctx.beginPath()
						this.ctx.roundRect(x - nameMeasure.actualBoundingBoxLeft - pad, y - nameMeasure.actualBoundingBoxAscent - pad - shift, nameMeasure.width + pad * 2, nameMeasure.actualBoundingBoxDescent + nameMeasure.actualBoundingBoxAscent + pad * 2, this.pixelRatio * 2)
						this.ctx.closePath()
						this.ctx.fill()
					} else {
						this.ctx.fillRect(x - nameMeasure.actualBoundingBoxLeft - pad, y - nameMeasure.actualBoundingBoxAscent - pad, nameMeasure.width + pad * 2, nameMeasure.actualBoundingBoxDescent + nameMeasure.actualBoundingBoxAscent + pad * 2)
					}
					this.ctx.fillStyle = this.codex.resources[i].triplet[2]
					this.ctx.fillText(this.pronounce('resources', i), this.resourceHomes[i][0], this.resourceHomes[i][1] - this.screenUnit * .4 - shift)

					//Gradient instant
					this.ctx.font = this.smallFont
					if (this.entitiesInGame.mega1 > 0 || this.entitiesInGame.mega1a > 0 || this.entitiesInGame.mega1b > 0){
						const shift2 = -this.screenUnit * 1.03
						const value = this.analytics.average[i][0]
						const average = `+ ${this.makeReadable(value)} / s`
						const averageMeasure = this.ctx.measureText(average)
						this.ctx.fillStyle = `#FFF`
						if (this.ctx.roundRect){
							this.ctx.beginPath()
							this.ctx.roundRect(x - averageMeasure.actualBoundingBoxLeft - pad, y - averageMeasure.actualBoundingBoxAscent - pad - shift2, averageMeasure.width + pad * 2, averageMeasure.actualBoundingBoxDescent + averageMeasure.actualBoundingBoxAscent + pad * 2, this.pixelRatio * 2)
							this.ctx.closePath()
							this.ctx.fill()
						} else {
							this.ctx.fillRect(x - averageMeasure.actualBoundingBoxLeft - pad, y - averageMeasure.actualBoundingBoxAscent - pad, averageMeasure.width + pad * 2, averageMeasure.actualBoundingBoxDescent + averageMeasure.actualBoundingBoxAscent + pad * 2)
						}
						this.ctx.fillStyle = `#6ea56e`
						this.ctx.fillText(average, this.resourceHomes[i][0], this.resourceHomes[i][1] - this.screenUnit * .4 - shift2)

						const shift3 = -this.screenUnit * 1.2
						const value2 = this.analytics.average[i][1]
						const average2 = `– ${this.makeReadable(-value2)} / s`
						const averageMeasure2 = this.ctx.measureText(average2)
						this.ctx.fillStyle = `#FFF`
						if (this.ctx.roundRect){
							this.ctx.beginPath()
							this.ctx.roundRect(x - averageMeasure2.actualBoundingBoxLeft - pad, y - averageMeasure2.actualBoundingBoxAscent - pad - shift3, averageMeasure2.width + pad * 2, averageMeasure2.actualBoundingBoxDescent + averageMeasure2.actualBoundingBoxAscent + pad * 2, this.pixelRatio * 2)
							this.ctx.closePath()
							this.ctx.fill()
						} else {
							this.ctx.fillRect(x - averageMeasure2.actualBoundingBoxLeft - pad, y - averageMeasure2.actualBoundingBoxAscent - pad, averageMeasure2.width + pad * 2, averageMeasure2.actualBoundingBoxDescent + averageMeasure2.actualBoundingBoxAscent + pad * 2)
						}
						this.ctx.fillStyle = `#C38C75`
						this.ctx.fillText(average2, this.resourceHomes[i][0], this.resourceHomes[i][1] - this.screenUnit * .4 - shift3)
					}

					if (this.entitiesInGame.mega1b > 0){
						//Graphs
						const padding = this.pixelRatio * 16
						const dx = this.pixelRatio * 4
						const g = this.analytics.graphs[i]
						// g.canvas.width = dx * this.analytics.dataSize + padding * 8
						const width = g.canvas.width
						//const dx = Math.floor((width - padding * 7) / this.analytics.dataSize)
						const shortWidth = dx * this.analytics.dataSize
						const height = g.canvas.height / 2
						const ctx = g.ctx
						ctx.clearRect(0,0,width,height*2)
						ctx.fillStyle = `#FFFFFFF6`
						ctx.beginPath()
						ctx.roundRect(0,0,width,height*2, this.pixelRatio * 4)
						ctx.closePath()
						ctx.fill()
						// ctx.fillRect(0,0,width,height*2)
						// ctx.fillStyle = this.codex.resources[i].triplet[0]

						let max = 0
						let negative = false

						for (let j = 0; j < g.data.length; j++){

							if (g.data[j][0] > max){
								max = g.data[j][0]
								negative = false
							}

							if (-g.data[j][1] > max){
								max = -g.data[j][1]
								negative = true
							}
						}

						const order = +Math.floor(max).toString().length
						const delta = 10 ** (order - 1)
						max = delta * (Math.floor(max / delta) + 1) //10 ** order

						for (let j = 0; j < g.data.length; j++){
							const hhPlus = Math.floor(g.data[j][0] / max * height)
							const hhMinus = Math.floor(-g.data[j][1] / max * height)
							ctx.globalAlpha = .4
							ctx.fillStyle = `#C38C75`
							ctx.fillRect(j*dx, height, dx, hhMinus)
							ctx.fillStyle = `#6ea56e`
							ctx.fillRect(j*dx, height - hhPlus, dx, hhPlus)
							ctx.globalAlpha = 1
							ctx.fillStyle = `#C38C75`
							ctx.fillRect(j*dx, height + hhMinus, dx, this.pixelRatio)
							ctx.fillStyle = `#6ea56e`
							ctx.fillRect(j*dx, height - hhPlus, dx - this.pixelRatio, this.pixelRatio)
						}

						const lastPlus = Math.floor(this.analytics.frame[i][0] / (this.analytics.measuringFrame - this.analytics.frameTimer) * 1000 / max * height)
						const lastMinus = Math.floor(-this.analytics.frame[i][1] / (this.analytics.measuringFrame - this.analytics.frameTimer) * 1000 / max * height)
						ctx.globalAlpha = .4
						ctx.fillStyle = `#C38C75`
						ctx.fillRect(g.data.length*dx, height, dx, lastMinus)
						ctx.fillStyle = `#6ea56e`
						ctx.fillRect(g.data.length*dx, height - lastPlus, dx, lastPlus)
						ctx.globalAlpha = 1
						ctx.fillStyle = `#C38C75`
						ctx.fillRect(g.data.length*dx, height + lastMinus, dx, this.pixelRatio)
						ctx.fillStyle = `#6ea56e`
						ctx.fillRect(g.data.length*dx, height - lastPlus, dx - this.pixelRatio, this.pixelRatio)

						ctx.fillStyle = `#000`
						ctx.font = height * .12 + `px Montserrat, sans-serif`//this.microFont
						ctx.textBaseline = `middle`
						ctx.textAlign = `left`

						const maxDigit = +max.toString()[0]
						const secondHalf = maxDigit < 2 || maxDigit > 5

						for (let v = delta-max; v < max; v+=delta){

							const digit = +Math.abs(v).toString()[0]
							if (secondHalf && (digit % 2)) continue

							const lh = height - (v / max) * height

							ctx.globalAlpha = .1
							ctx.fillRect(0, lh, shortWidth + dx, 1)

							ctx.globalAlpha = 1
							ctx.fillText(this.makeReadable(v) + ` / s`, shortWidth + padding, lh)

						}


						this.ctx.imageSmoothingEnabled = false
						this.ctx.drawImage(g.canvas, Math.max(this.resourceHomes[0][0] / 2, this.resourceHomes[i][0] - width/2), this.resourceHomes[0][1] * 2)
						this.ctx.imageSmoothingEnabled = true
					}

				}
				

			}

		}

	}

	renderResourceBeds(){

		this.ctx.fillStyle = `#FFF`
		const r = this.unit * .5

		for (let i = 0; i < this.resources.length; i++){

			if (this.resources[i]){

				this.ctx.beginPath()
				this.ctx.arc(this.resourceHomes[i][0], this.resourceHomes[i][1], r, 0, Math.PI * 2)
				this.ctx.closePath()
				this.ctx.fill()

				// this.ctx.save()
				// this.ctx.translate(this.resourceHomes[i][0], this.resourceHomes[i][1])
				// this.ctx.scale(.8 + s, .8 + s)
				// this.drawResourceInScreenCoordinates(i, [0,0])
				// this.ctx.restore()
				// this.ctx.fillStyle = `#000`

				

			}

		}

	}

	renderDarkResources(){

		this.ctx.font = this.regularFont
		this.ctx.textAlign = `center`
		this.ctx.textBaseline = `middle`
		

		if (this.resources[9]){

			const s = this.resourcePops[9] || 0
			this.ctx.save()
			this.ctx.translate(this.resourceHomes[0][0], this.resourceHomes[0][1])
			this.ctx.scale(.8 + s, .8 + s)
			this.drawResourceInScreenCoordinates(9, [0,0])
			this.ctx.restore()
			this.ctx.fillStyle = `#FFF`
			this.ctx.fillText(this.makeReadable(this.resources[9]), this.resourceHomes[0][0], this.resourceHomes[0][1] - this.screenUnit * .4)
			
		}

		

	}

	makeReadable(n){
		const sign = Math.sign(n)
		const abs = Math.abs(n)
		if (abs<1e4) return sign * Math.floor(abs)
		if (abs<1e6) return sign * Math.floor(abs/10)/100 + ` K`
		if (abs<1e9) return sign * Math.floor(abs/10000)/100 + ` M`
		if (abs<1e12) return sign * Math.floor(abs/10000000)/100 + ` B`
		if (abs<1e15) return sign * Math.floor(abs/10000000000)/100 + ` T`
		if (abs<1e18) return sign * Math.floor(abs/10000000000000)/100 + ` Q`
		return `A lot`
	}

	makeReadableFloor(n){
		const sign = Math.sign(n)
		const abs = Math.abs(n)
		if (abs<1e4) return sign * Math.floor(abs)
		if (abs<1e6) return sign * Math.floor(abs/1000) + ` K`
		if (abs<1e9) return sign * Math.floor(abs/1000000) + ` M`
		if (abs<1e12) return sign * Math.floor(abs/1000000000) + ` B`
		if (abs<1e15) return sign * Math.floor(abs/1000000000000) + ` T`
		if (abs<1e18) return sign * Math.floor(abs/1000000000000000) + ` Q`
		return `A lot`
	}

	getRoman(n){
		if (!Number.isInteger(n) || n > 3999) return n

		const symbols = [
			[1000, "M"],
		    [900, "CM"],
		    [500, "D"],
		    [400, "CD"],
		    [100, "C"],
		    [90, "XC"],
		    [50, "L"],
		    [40, "XL"],
		    [10, "X"],
		    [9, "IX"],
		    [5, "V"],
		    [4, "IV"],
		    [1, "I"]
		]
		let roman = ``
		for (const [v,s] of symbols){
			while (n >= v) {
				roman += s
				n -= v
			}
		}

		return roman
	}

	addResourcesFromArray(a,skipAnalytics){

		const f = this.analytics.frame || []

		for (let i = 0; i < a.length; i++){
			if (a[i]) {
				this.resources[i] += a[i]
				if (!skipAnalytics) f[i][0] += a[i]
				this.resourcePops[i] = .5
				this.stats.totalResourcesMined[i] += a[i]
				this.stats.absoluteResourcesCount += a[i]
			}
		}

	}

	substractResourcesFromArray(a,skipAnalytics){

		const f = this.analytics.frame || []

		for (let i = 0; i < a.length; i++){
			if (a[i]) {
				this.resources[i] = Math.max(0, this.resources[i] -= a[i])
				if (!skipAnalytics) f[i][1] -= a[i]
			}
		}

	}

	isVisible(p){

		const coords = this.uvToXYUntranslated(p.position)
		const span = p.entitySpan * this.unit || 0
		if (coords[0] + span < -this.unit || coords[0] - span > this.w + this.unit || coords[1] + span < -this.unit || coords[1] - span > this.h + this.unit + (p.entityHeight || 1) * this.unit) return false
		return true

	}

	renderConductors(dt){
		if (!this.plane){
			const c = Array.from(this.conductors)
			for (let i = 0; i < c.length; i++){
				if (this.isVisible(c[i])) c[i].render(dt)
			}

		}
	}

	renderEntities(dt){

		if (!this.plane){

			for (let i = 0; i < this.stuff.length; i++){

				if (this.stuff[i].name !== `conductor` && this.isVisible(this.stuff[i])) {

					this.stuff[i].render(dt)					
					
				}
				
			}

		} else if (this.plane === 1){

			for (let i = 0; i < this.stuff.length; i++){

				if (this.isVisible(this.stuff[i])) this.stuff[i].darkrender(dt)

			}

		}

	}

	renderEntitiesAbstract(dt){

		const dx = .866 * this.unit 	//*.9
		const dy = .5 * this.unit 		//*.9
		const nx = dx * .06
		const ny = dy * .06

		if (!this.plane){

			for (let i = this.stuff.length - 1; i >= 0; i--){

				if (this.isVisible(this.stuff[i])) { //this.stuff[i].name !== `conductor`

					this.stuff[i].render(dt)

					const xy = this.uvToXY(this.stuff[i].position)
					const mult = (this.stuff[i].entitySpan ?? 0) * 2 + 1
					this.ctx.fillStyle = `#FFF`
					this.ctx.beginPath()

					this.ctx.lineTo(xy[0] + dx * mult + dx, -this.h2)
					this.ctx.lineTo(xy[0] + dx * mult + dx, xy[1] - dy)
					this.ctx.lineTo(xy[0] + dx * mult -nx, xy[1] + dy - dy + ny)
					this.ctx.lineTo(xy[0], xy[1] - dy * mult + ny * 2)
					this.ctx.lineTo(xy[0] - dx * mult + nx, xy[1] + ny)
					this.ctx.lineTo(xy[0] - dx * mult - dx, xy[1] - dy)
					this.ctx.lineTo(xy[0] - dx * mult - dx, -this.h2)

					this.ctx.closePath()
					this.ctx.fill()
					
				}
				
			}

		} else if (this.plane === 1){

			for (let i = 0; i < this.stuff.length; i++){

				if (this.isVisible(this.stuff[i])) this.stuff[i].darkrender(dt)

			}

		}

		//// CLIP METHOD

		// const dx = .9 * .866 * this.unit
		// const dy = .9 * .5 * this.unit

		// if (!this.plane){

		// 	for (let i = 0; i < this.stuff.length; i++){

		// 		if (this.stuff[i].name !== `conductor` && this.isVisible(this.stuff[i])) {

		// 			const xy = this.uvToXY(this.stuff[i].position)
		// 			const mult = (this.stuff[i].entitySpan ?? 0) * 2 + 1

		// 			this.ctx.save()
		// 			this.ctx.beginPath()
		// 			this.ctx.moveTo(xy[0], xy[1] - dy * mult)
		// 			this.ctx.lineTo(xy[0] + dx * mult, xy[1])
		// 			this.ctx.lineTo(xy[0], xy[1] + dy * mult)
		// 			this.ctx.lineTo(xy[0] - dx * mult, xy[1])
		// 			// this.ctx.arc(0,0,300,0,Math.PI*2)
		// 			this.ctx.closePath()
		// 			this.ctx.clip()
		// 			this.stuff[i].render(dt)
		// 			this.ctx.restore()
					
		// 		}
				
		// 	}

		// } else if (this.plane === 1){

		// 	for (let i = 0; i < this.stuff.length; i++){

		// 		if (this.isVisible(this.stuff[i])) this.stuff[i].darkrender(dt)

		// 	}

		// }

	}

	updateUnfilled(){

		this.unfilledEntities = []
		this.totalUnfilledEntities = []
		this.idleStuff = []

		for (let i = 0; i < this.stuff.length; i++){

			if (this.shouldBeFilled(this.stuff[i])) {
				this.totalUnfilledEntities.push(this.stuff[i])
				if (!this.stuff[i].isNextToSilo) this.unfilledEntities.push(this.stuff[i])
			}

			const well = (this.stuff[i] instanceof Gradient && this.chasm?.chasmNetworkKey !== this.stuff[i].chasmNetwork)
			const puncture = this.stuff[i] instanceof Puncture
			const stab = (this.stuff[i] instanceof Stabilizer && !this.stuff[i].surge)
			const surge = (this.stuff[i] instanceof Surge && !this.stuff[i].stabilizer)
			const exit = (this.stuff[i] instanceof Voidsculpture && this.plane)
			const strange = (!this.entitiesInGame.strange1 && this.stuff[i] instanceof Strange && this.resources[6])

			if (well || puncture || stab || surge || exit || strange){
				this.idleStuff.push(this.stuff[i])
			}
		}

	}

	updateEntities(dt){

		this.chromaToContain = this.resources[5]
		// this.unfilledEntities = []

		for (let i = 0; i < this.stuff.length; i++){

			if (this.stuff[i].killme){

				this.stuff[i].onDelete()
				this.entitiesInGame[this.stuff[i].name]--
				delete this.stuffMap[`u${this.stuff[i].position[0]}v${this.stuff[i].position[1]}`]
				this.stuff.splice(i,1)
				i--

			} else {

				//Halflife stuff
				if (this.stuff[i] instanceof Vessel){
					if (this.chromaToContain && this.stuff[i].state === 2){
						this.stuff[i].tap(dt)
						this.stuff[i].isUsed = true
						this.chromaToContain = Math.max(0, this.chromaToContain - this.stuff[i].capacity)
					} else {
						this.stuff[i].isUsed = false
					}
				}

				this.stuff[i].update(dt)
				this.stuff[i]?.updateSoul(dt)
				// if (this.stuff[i]?.fill === 0 && !(this.stuff[i] instanceof Cube)) this.unfilledEntities.push(this.stuff[i])
				// if (!(this.stuff[i] instanceof Cube) && this.stuff[i]?.fill === 0 && !this.stuff[i].isNextToSilo) this.unfilledEntities.push(this.stuff[i])
			}

		}

	}

	// updateRange(){

	// 	this.range = {x: [-5, 5], y: [-5, 5]}

	// }

	renderGrid(){

		const lt = this.xyToUV([0,0])
		const rb = this.xyToUV([this.w, this.h])
		const rt = this.xyToUV([this.w,0])
		const lb = this.xyToUV([0,this.h])

		lt[0] = Math.floor(lt[0])// + .5
		lt[1] = Math.floor(lt[1])// + .5
		rb[0] = Math.floor(rb[0])// + .5
		rb[1] = Math.floor(rb[1])// + .5
		rt[0] = Math.floor(rt[0])// + .5
		rt[1] = Math.floor(rt[1])// + .5
		lb[0] = Math.floor(lb[0])// + .5
		lb[1] = Math.floor(lb[1])// + .5

		this.ctx.save()
		this.ctx.strokeStyle = this.plane ? `#334` : `#BBBBC5`
		this.ctx.lineCap = `butt`
		// this.ctx.setLineDash([8,8])
		this.ctx.lineWidth = this.pixelRatio

		for (let y = rt[1] + .5; y <= lb[1] + .5; y++){
			this.ctx.beginPath()
			const xy0 = this.uvToXYUntranslated([lt[0] + .5,y])
			this.ctx.moveTo(xy0[0] + .5, xy0[1] + .5)
			const xy1 = this.uvToXYUntranslated([rb[0] + .5,y])
			this.ctx.lineTo(xy1[0] + .5, xy1[1] + .5)
			this.ctx.stroke()
		}
		for (let x = lt[0] + .5; x <= rb[0] + .5; x++){
			this.ctx.beginPath()
			const xy0 = this.uvToXYUntranslated([x,rt[1] + .5])
			this.ctx.moveTo(xy0[0] + .5, xy0[1] + .5)
			const xy1 = this.uvToXYUntranslated([x,lb[1] + .5])
			this.ctx.lineTo(xy1[0] + .5, xy1[1] + .5)
			this.ctx.stroke()
		}
		this.ctx.restore()

		//Available spots
		if (this.itemInHand && !this.transportedEntity && !(this.itemInHand.name === `eraser` || this.itemInHand.name === `eraser2` || this.itemInHand.name === `eraser3`)){
		
			const dx = .866 * this.unit
			const dy = .5 * this.unit

			for (let y = rt[1]; y < lb[1]; y++){
				for (let x = lt[0]; x < rb[0]; x++){

					const e = this.stuffMap[`u${x}v${y}`]
					if (!e) continue

					if (this.codex.entities[this.itemInHand.name].isUpgradeTo === e.name) continue

					this.ctx.fillStyle = `#1125`
					const xy = this.uvToXYUntranslated([x,y])

					this.ctx.beginPath()
					this.ctx.moveTo(xy[0], xy[1] - dy)
					this.ctx.lineTo(xy[0] + dx, xy[1])
					this.ctx.lineTo(xy[0], xy[1] + dy)
					this.ctx.lineTo(xy[0] - dx, xy[1])
					this.ctx.closePath()
					this.ctx.fill()
				}
			}
		}

	}

	drawResourceInScreenCoordinates(id, p){

		this.resourcesSprites[id].scale = .25/this.zoom
		this.resourcesSprites[id].renderXY(p)
		this.resourcesSprites[id].scale = .25

	}

	drawBeam(uv = [0,0], c = `#000`){
		const xy = this.uvToXY(uv)

		const dh = this.unit * -(6 + Math.random() * 2.4)
		const color = this.ctx.createLinearGradient(0,0,0,dh)
		color.addColorStop(0, c)
		color.addColorStop(1, `#FFF0`)

		this.ctx.save()
		this.ctx.translate(xy[0], xy[1])
		this.ctx.scale(1,.68)
		this.ctx.lineWidth = this.unit * .1
		this.ctx.strokeStyle = color
		this.ctx.beginPath()
		this.ctx.moveTo(0, 0)
		this.ctx.lineTo(0, dh)
		this.ctx.stroke()
		this.ctx.restore()
		
	}

	drawCube(position, size, triplet){

		this.drawPrism([position[0]+size/2, position[1]+size/2], size, size, triplet)

	}

	drawPrism(position, size, height, triplet){

		const colors = triplet ? triplet : [`#FFC759`, `#FFE86F`, `#FF8F60`]
		height = height || 0

		const hy = height * this.unit
		const dx = size * .866 * this.unit
		const dy = size * .5 * this.unit

		this.ctx.save()
		const xy = this.uvToXY(position)
		this.ctx.translate(xy[0], xy[1])

		if (height){
			this.ctx.fillStyle = colors[0]
			this.ctx.beginPath()
			this.ctx.moveTo(0, -hy - dy)
			this.ctx.lineTo(dx, -hy)
			this.ctx.lineTo(dx, 0)
			this.ctx.lineTo(0, dy)
			this.ctx.lineTo(-dx, 0)
			this.ctx.lineTo(-dx, -hy)
			this.ctx.closePath()
			this.ctx.fill()

			this.ctx.fillStyle = colors[2]
			this.ctx.beginPath()
			this.ctx.moveTo(dx, -hy)
			this.ctx.lineTo(dx, 0)
			this.ctx.lineTo(0, dy)
			this.ctx.lineTo(0, dy - hy)
			this.ctx.closePath()
			this.ctx.fill()
		}

		this.ctx.fillStyle = colors[1]
		this.ctx.beginPath()
		this.ctx.moveTo(0, -hy - dy)
		this.ctx.lineTo(dx, -hy)
		this.ctx.lineTo(0, dy - hy)
		this.ctx.lineTo(-dx, -hy)
		this.ctx.closePath()
		this.ctx.fill()

		this.ctx.restore()

	}

	uvToXY(uv){

		return [ (uv[0] * 0.866 - uv[1] * .866) * this.unit - this.translation[0] * this.zoom, (uv[0] * .5 + uv[1] * .5) * this.unit - this.translation[1] * this.zoom]

	}
	uvToXYUntranslated(uv){

		const xy = this.uvToXY(uv)
		return [xy[0] + this.w2, xy[1] + this.h2]

	}

	xyToUV(xy){

		const centered = [xy[0]*this.pixelRatio - this.w2 + this.translation[0] * this.zoom, xy[1]*this.pixelRatio - this.h2 + this.translation[1] * this.zoom]
		const fx = centered[0] / .866 * .5
		const normalized = [(centered[1] + fx) / this.unit + .5, (centered[1] - fx) / this.unit + .5]
		return normalized

	}
	xyToUVUntranslated(xy = [0,0]){

		const centered = [xy[0]*this.pixelRatio + this.translation[0] * this.zoom, xy[1]*this.pixelRatio + this.translation[1] * this.zoom]
		const fx = centered[0] / .866 * .5
		const normalized = [(centered[1] + fx) / this.unit + .5, (centered[1] - fx) / this.unit + .5]
		return normalized

	}

	entityAtCoordinates(p){
		return this.stuffMap[`u${p[0]}v${p[1]}`]

	}

	addEntity(name, position, misc, options = {}){

		//Make check for bigger entities zzz
		if (this.codex.entities[name] && !this.entityAtCoordinates(position)){

			let entity
			try {
				entity = new this.codex.entities[name].class(this, misc)
			} catch {
				entity = false
			}

			if (entity){
				this.stuff.push(entity)
				if (!entity.entitySpan) {
					this.stuffMap[`u${position[0]}v${position[1]}`] = entity
				} else {

					const s = entity.entitySpan
					for (let dy = -s; dy <= s; dy++){
						for (let dx = -s; dx <= s; dx++){

							this.stuffMap[`u${position[0]+dx}v${position[1]+dy}`] = entity

						}
					}

				}
				
				entity.setPosition(position)
				this.stuff.sort((a,b)=>a.position[0] + a.position[1] - b.position[0] - b.position[1])

				//AUTOINIT everything around
				if (!(entity instanceof Cube)){
					for (let i = 0; i < entity.soi.length; i++){
						const cell = this.stuffMap[`u${entity.position[0] + entity.soi[i][0]}v${entity.position[1] + entity.soi[i][1]}`]
						if (cell){
							cell.init()
						}
					}
				}

				if (!this.entitiesInGame[entity.name]) {
					this.entitiesInGame[entity.name] = 1
				} else {
					this.entitiesInGame[entity.name]++
				}

				if (!options.skipShopUpdate && name !== `cube`) {
					this.store.compositionUpdate()
				}

			}

			return entity
		} else {
			// console.log(`This place is occupied`)
		}
		return false

	}

	renderVFX(){
		for (let i = 0; i < this.vfx.length; i++){
			if (this.chillMode && i > 32) return
			this.vfx[i].render()
		}
	}

	renderChasmVFX(){
		for (let i = 0; i < this.chasmVfx.length; i++){
			if (this.chillMode && i > 32) return
			this.chasmVfx[i].render()
		}
	}

	renderChasm(){

		const chasmDeltas = [
			[-this.unit * .3, 	-this.unit * 1.38],
			[-this.unit * .19, 	-this.unit * 1.45],
			[-this.unit * .085, -this.unit * 1.51],
			[this.unit * .025, 	-this.unit * 1.57],
			[this.unit * .13, 	-this.unit * 1.64],

			[-this.unit * .13, 	-this.unit * 1.29],
			[-this.unit * .02, 	-this.unit * 1.35],
			[this.unit * .085, 	-this.unit * 1.41],
			[this.unit * .195, 	-this.unit * 1.47],
			[this.unit * .3, 	-this.unit * 1.54],
		]

		if (this.isVisible(this.chasm)){

			const cp = this.uvToXYUntranslated(this.chasm.position)

			for (let i = 0; i < 10; i++){

				if (!this.resources[i]) continue

				const delta = chasmDeltas[i] || [0,0]
				const tilt = i < 5 ? -this.unit * .4 : this.unit
				const rp = this.resourceHomes[i]
				const cy = rp[1] + (cp[1] + delta[1] - rp[1]) * .7

				this.ctx.strokeStyle = this.codex.resources[i].triplet[0]
				this.ctx.lineWidth = this.unit * (.02 + .1 * this.resourcePops[i])

				this.ctx.beginPath()
				this.ctx.moveTo(rp[0], rp[1])
				this.ctx.bezierCurveTo(rp[0], cy, cp[0] + delta[0] + tilt, cy, cp[0] + delta[0], cp[1] + delta[1])
				this.ctx.stroke()

			}

		}

	}

	updateVFX(dt){

		for (let i = 0; i < this.vfx.length; i++){

			this.vfx[i].update(dt)
			if (this.vfx[i].terminate){
				this.vfx.splice(i,1)
				i--
			}
			
		}

		for (let i = 0; i < this.chasmVfx.length; i++){

			this.chasmVfx[i].update(dt)
			if (this.chasmVfx[i].terminate){
				this.chasmVfx.splice(i,1)
				i--
			}
			
		}

	}

	// Resources, origin position, destination position, onfinish or will be added to resources, visibility
	createResourceTransfer(r,p,d,f,v,skip){
		const transfer = new ResourceTransfer(this, {resources: r, source: p, destination: d, f: f, visibility: v, skip: skip})
		this.vfx.push(transfer)
		// this.chasmVfx.push(transfer)

	}

	createCompleteTransaction(p){
		const transaction = new CompleteTransaction(this, p)
		this.vfx.push(transaction)
	}

	createChasmTransfer(r,path,f,v,skipIndex){

		const transfer = new ChasmTransfer(this, {resources: r, path: path, f: f, visibility: v, skipIndex: skipIndex})
		this.chasmVfx.push(transfer)

	}

	createLightning(r,p,d,f,v,c){

		this.vfx.push(new Lightning(this, {resources: r, source: p, destination: d, f: f, visibility: v, color: c}))

	}

	createDischarge(fromA=[0,0],fromB=[0,0],toA=[1,0],toB=[1,0], force = 4, visibility=[1,0],color = `#000`,time = 500 + Math.random() * 1000){
		// World coordinates. WIP: should do the same for lightning actually
		this.vfx.push(new Discharge(this, {fromA: fromA, fromB: fromB, toA: toA, toB: toB, force: force, visibility: visibility, color: color, time: time}))

	}

	createResourceExplosion(r,p,v){
		this.vfx.push(new ResourceExplosion(this, {resources: r, source: p, visibility: v}))
	}

	createResourceSpark(c,p,v){
		this.vfx.push(new ResourceSpark(this, {resources: c, source: p, visibility: v}))
	}

	createScan(p){
		this.vfx.push(new ScannerMap(this, {source: p}))
	}

	createExhaust(uv,c,v){
		this.vfx.push(new Exhaust(this, {uv: uv, color: c, visibility: v}))
	}

	createImpact(uv,c,v){
		this.vfx.push(new Impact(this, {uv: uv, color: c, visibility: v}))
	}

	createHollowEvent(color = `#FFBB36`, time = 6000, sound = false, image = false){

		if (sound) this.playSound(sound, 0, 1)

		this.hollowEvents.push({max: time, time: time, color: color, imageTime: image ? 250 : 0, maxImageTime: 200})

	}
	createDarkHollowEvent(color = `#FFBB36`, time = 6000, sound = false, image = false){

		if (sound) this.playSound(sound, 0, 1)

		this.darkHollowEvents.push({max: time, time: time, color: color, imageTime: image ? 250 : 0, maxImageTime: 200})

	}

	updateHollowEvents(dt){

		for (let i = 0; i < this.hollowEvents.length; i++){

			const e = this.hollowEvents[i]
			e.time -= dt
			e.imageTime -= dt
			if (e.time <= 0){
				
				this.hollowEvents.splice(i,1)
				i--

			}

		}
		for (let i = 0; i < this.darkHollowEvents.length; i++){

			const e = this.darkHollowEvents[i]
			e.time -= dt
			e.imageTime -= dt
			if (e.time <= 0){
				
				this.darkHollowEvents.splice(i,1)
				i--

			}

		}

	}

	renderHollowEvents(){

		this.ctx.save()
		for (let i = 0; i < this.hollowEvents.length; i++){

			const e = this.hollowEvents[i]
			this.ctx.globalAlpha = e.time / e.max

			this.ctx.fillStyle = e.color
			this.ctx.fillRect(0,0,this.w,this.h)

			if (e.imageTime > 0){

				this.ctx.globalAlpha = e.imageTime / e.maxImageTime
				const size = this.unit * 6
				this.ctx.drawImage(this.hollowImage, this.w2 - size / 2, this.h2 - size / 2, size, size)

			}

		}
		this.ctx.restore()

	}

	renderDarkHollowEvents(){

		this.ctx.save()
		for (let i = 0; i < this.darkHollowEvents.length; i++){

			const e = this.darkHollowEvents[i]
			this.ctx.globalAlpha = e.time / e.max

			this.ctx.fillStyle = e.color
			this.ctx.fillRect(0,0,this.w,this.h)

			if (e.imageTime > 0){

				this.ctx.globalAlpha = e.imageTime / e.maxImageTime
				const size = this.unit * 6
				this.ctx.drawImage(this.hollowImage, this.w2 - size / 2, this.h2 - size / 2, size, size)

			}

		}
		this.ctx.restore()

	}

	initiateSlowdown(t,m){

		this.stats.timeEvents++

		this.slowdown.state = true 
		this.slowdown.timer = t
		this.slowdown.totalTime = t
		this.slowdown.multiplyer = m

	}

	updateSurge(dt){
		if (this.currentlyExtracting) this.surgeSpawnTimer -= dt
		if (this.surgeSpawnTimer <= 0){
			this.spawnSurge()
			this.surgeSpawnTimer = 20000 + Math.random() * 80000
		}
	}

	spawnSurge(){

		if (!this.resources[1]) return

		const dice = Math.random()
		const multiplyer = dice < .75 ? .1 : dice < .9 ? .3 : .5

		let maxId = 0
		for (let i = 9; i >=0; i--){
			if (this.resources[i] > 0){
				maxId = i
				break
			}
		}
		const rid = Math.floor(Math.random() * (maxId + 1))
		const source = rid > 6 ? Math.min(this.resources[rid], 512) : rid === 5 ? Math.min(this.resources[rid], 16384) : Math.min(this.resources[rid], 262144)
		const base = this.stats.totalResourcesMined[rid] > 2048 ? 512 + multiplyer * source : multiplyer * source
		const amount = Math.max(1, base + source * multiplyer * Math.random())

		const resources = []
		resources[rid] = amount
		const colors = this.codex.resources[rid].surgeTriplet ? this.codex.resources[rid].surgeTriplet : this.codex.resources[rid].triplet

		const origin = this.xyToUV(this.mouse.sxy)
		const radius = 6

		for (let i = 0; i < 32; i++){

			const u = Math.floor((Math.random() * 2 - 1) * radius + origin[0])
			const v = Math.floor((Math.random() * 2 - 1) * radius + origin[1])
			const rayNumber = 1 + Math.floor(multiplyer * 24)
			const grade = rayNumber < 5 ? 0 : rayNumber < 10 ? 1 : 2

			const placed = this.addEntity(`surge`, [u,v], {
				resources: resources,
				rayNumber: rayNumber,
				grade: grade,
				colors: colors,
				type: rid
			}, {skipShopUpdate: true})

			if (placed) break

		}

	}

	spawnAlfa(){

		//WIP Mobile (there nothing to see here, move along)

		// const origin = this.xyToUV(this.mouse.sxy)
		// const radius = 6
		// const u = Math.floor((Math.random() * 2 - 1) * radius + origin[0])
		// const v = Math.floor((Math.random() * 2 - 1) * radius + origin[1])

		// this.alfa.currentNodes.push({
		// 	position: [u,v],
		// 	timer: this.alfa.nodeProperties.duration,
		// 	sfx: this.addSoundSource(`alfanode`, [u, v])
		// })

	}

	assembleMemory(){

		const memory = []
		const exceptions = new Set([`flower`, `fruit`])

		for (let i = 0; i < this.stuff.length; i++){

			const e = this.stuff[i]

			if (!this.codex.entities[e.name]?.canPurchase || exceptions.has(e.name)) continue

			memory.push({
				entityName: e.name,
				position: e.position
			})

		}

		return memory

	}

	playMemory(m){

		this.memoryBuffer = m

		// for (let i = 0; i < m.length; i++){

		// 	if (this.entityAtCoordinates(m[i].position)) continue

		// 	const memory = this.addEntity(`memory`, m[i].position)
		// 	memory.entityName = m[i].name

		// }

	}

	hash53(str, seed = 0) {
		let a = 0x9e3779b1 ^ seed
		let b = 0x85ebca77 ^ seed

		for (let i = 0; i < str.length; i++) {
			const c = str.charCodeAt(i)
			a = Math.imul(a ^ c, 0x27d4eb2d)
			b = Math.imul(b ^ c, 0x165667b1)
			a ^= b >>> 15
			b ^= a >>> 13
		}

		a = Math.imul(a ^ (a >>> 16), 0x85ebca6b)
		b = Math.imul(b ^ (b >>> 13), 0xc2b2ae35)

		a ^= b >>> 16
		b ^= a >>> 15

		return (b & 0x1fffff) * 0x100000000 + (a >>> 0)
	}

}