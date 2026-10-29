(function () {
  const once = Symbol.for('cattail.better-uis.independent-auto-save.registered')
  if (globalThis[once]) return
  globalThis[once] = true
  ModLoader.register({ id: 'Cattail_TweaksQuality_Better-UIs', init(api) {
    // Keep an explicit new choice; copy a saved legacy boolean only once.
    const key = 'modloader:Cattail_TweaksQuality_Better-UIs:config:enableIndependentAutoSave'
    try {
      if (localStorage.getItem(key) === null) {
        let legacy
        try { legacy = JSON.parse(localStorage.getItem('modloader:Cattail_TweaksQuality_Tweaks:config:enableAutoSaveStutterFix')) } catch (_) {}
        api.config.set('enableIndependentAutoSave', typeof legacy === 'boolean' ? legacy : true)
      }
    } catch (_) {}
    let installed = false
    api.on('beforeGamePrepare', () => {
      if (installed || api.config.get('enableSaveSlots', true) === false || api.config.get('enableIndependentAutoSave', true) === false) return
      installed = true
      require(require('path').join(__dirname, 'mods/Cattail_TweaksQuality_Better-UIs/scripts/save-policy.js')).install(api, Game)
    })
  } })
})()
