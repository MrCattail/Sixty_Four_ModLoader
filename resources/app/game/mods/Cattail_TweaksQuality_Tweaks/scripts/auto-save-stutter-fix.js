(function () {
  const once = Symbol.for('cattail.tweaks.save-policy.registered')
  if (globalThis[once]) return
  globalThis[once] = true
  ModLoader.register({ id: 'Cattail_TweaksQuality_Tweaks', init(api) {
    let installed = false
    api.on('beforeGamePrepare', () => {
      if (installed || api.config.get('enableAutoSaveStutterFix', true) === false) return
      installed = true
      require(require('path').join(__dirname, 'mods/Cattail_TweaksQuality_Tweaks/scripts/save-policy.js')).install(api, Game)
    })
  } })
})()
