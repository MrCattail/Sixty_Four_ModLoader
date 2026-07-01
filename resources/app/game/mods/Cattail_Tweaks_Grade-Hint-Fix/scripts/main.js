ModLoader.register({
	id: 'Cattail_Tweaks_Grade-Hint-Fix',
	init(api) {
		api.on('afterVanillaScripts', function () {
			if (typeof Hint === 'undefined') return

			api.patch(Hint.prototype, 'addGradeAndProgress', function () {
				return function (grade, type, check) {
					const wrap = document.createElement('div')
					wrap.classList.add('gradeWrap')
					this.element.append(wrap)

					const gradeHint = document.createElement('div')
					gradeHint.classList.add('gradeHint')
					const activeStars = Math.max(1, Math.min(3, (Number(grade) || 0) + 1))
					const active = document.createElement('span')
					active.textContent = '\u2605'.repeat(activeStars)
					gradeHint.append(active)
					if (activeStars < 3) {
						const inactive = document.createElement('span')
						inactive.style.opacity = '.2'
						inactive.textContent = '\u2605'.repeat(3 - activeStars)
						gradeHint.append(inactive)
					}
					const color = this.master['co' + 'dex'].resources[type].triplet[2]
					gradeHint.style.color = color
					wrap.append(gradeHint)

					const back = document.createElement('div')
					back.classList.add('hintProgressBarBack')
					const bar = document.createElement('div')
					bar.classList.add('hintProgressBar')
					back.append(bar)
					wrap.append(back)

					if (check) {
						this.checks.push({
							element: bar,
							f: check,
							effect: 'width'
						})
					}
				}
			})
		})
	}
})
