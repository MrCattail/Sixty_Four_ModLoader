# Sixty Four Mod Loader

This loader keeps vanilla game files as stable as possible.

## Enable Mods

Edit `mods/enabled.json`:

```json
{
  "mods": [
    "example-zh-cn",
    "example-price-tweak"
  ]
}
```

The order is the load order. Later mods can override earlier data patches.

## Mod Shape

```text
mods/my-mod/
  mod.json
  scripts/main.js
  locale/zh-CN.json
  data/patch.json
  img/
  sfx/
```

Prefer JSON patches for language, prices, unlocks, and preload lists. Use
`scripts/main.js` only when the mod needs new classes or behavior hooks.

Behavior entries can be split across multiple files. `entry` may be a string or
an array, and `entries` / `scripts` are also accepted:

```json
{
  "entries": [
    "features/mainfunction1.json",
    "features/mainfunction2.json",
    "scripts/main.js"
  ]
}
```

JSON entry files load during boot, before data and word patches are applied. Use
`{ "type": "data", "patch": { ... } }`, `{ "type": "words", "patch": { ... } }`,
or a mini manifest with `patches.data`, `patches.words`, `data` file refs, or
`locale` file refs. JavaScript entries load later, in the listed order, after
vanilla scripts exist.

## Main Hooks

- `beforeVanillaScripts`
- `afterVanillaScripts`
- `afterData`
- `afterWords`
- `afterGameInit`

## In-Game Diagnostics

Press `Ctrl+M` in game to open the ModLoader panel. It shows loaded mods,
registered languages, patch counts, hook stages, orphan entities, and recent
loader logs. The panel can open the `mods` folder, import mod zip packages by
file drop or paste, and delete mod folders after an in-panel confirmation. Menu
labels follow the current game language where ModLoader translations exist.

The lower-left status line also shows the loader version, enabled mod count,
and `Ctrl+M` reminder.

## Game HUD API

Press `H` in game to hide or restore the game HUD. ModLoader handles vanilla
shop, chat, hints, resource icons, and registered game-HUD mod elements.

Mods can register their own HUD elements:

```js
const releaseHud = api.ui.hud.register({
  id: 'my-widget',
  element: widget,
  side: 'right',
  capture() {
    return { scrollTop: widget.scrollTop }
  },
  restore(saved) {
    if (saved) widget.scrollTop = saved.scrollTop || 0
  }
})
```

`side` can be `left`, `right`, `top`, or `bottom`. ModLoader will animate the
element off that edge while the HUD is hidden. Use `managed: false` when a mod
wants to handle its own animation and only needs the hide/show callbacks.

Game-corner buttons registered with `api.ui.registerCornerButton()` are treated
as game HUD by default when they use a `game-*` dock. Pass `gameHud: false` to
opt out, or `hudSide` to choose a different hide edge.

## Render Layers API

The Canvas2D Render API is a stable v1 contract. Read `api.render.version` (or
`api.render.apiVersion`) for the semantic version, call
`api.render.supports(capability)` before using an optional feature, and use
`api.render.getCapabilities()` or `api.render.contract()` for a machine-readable
snapshot. The capability names shipped by v1 are `canvas2dLayers`,
`customLayers`, `layerDemand`, `cachedLayers`, `methodRouting`, `scopedCleanup`,
`lifecycleEvents`, `diagnostics`, `conflictDiagnostics`,
`callbackErrorIsolation`, and `renderTiming`. `webgl2Layers` and
`methodEmitters` currently report `false`; future GPU support will be additive
and must not change the existing Canvas2D callback contract.

```js
if (api.render.supports('canvas2dLayers')) {
  console.log(api.render.version, api.render.contract())
}
```

Render API 1.x preserves the documented methods and Canvas2D behavior; new
capabilities may be added in a minor release, while an incompatible contract
change requires a new major version.

ModLoader creates a stacked canvas renderer around the vanilla game canvas. The
vanilla canvas remains the main world canvas, and layer canvases are created
lazily. When a mod registers or accesses a layer, matching safe vanilla draw
calls can be routed to that layer so ordering stays stable. Unused layers keep
their vanilla draw calls on the main canvas to avoid extra compositor cost.
When the `background` layer is demanded, or when any demanded layer sits below
the main canvas, the vanilla full-frame background fill is routed onto the
background layer and the main canvas is cleared transparent before the remaining
world draw calls. This makes under-main layers such as `buildings` visible
without requiring each mod to manually demand `background`. Building/entity
splitting is still future work, but mods can demand `buildings` to route the
current vanilla world/entity stack as one uncached layer.

Mods can draw into a layer every frame:

```js
const stop = api.render.onLayer('interaction', ({ game, ctx }) => {
  if (!game.hoveredCell) return
  ctx.save()
  ctx.fillStyle = 'rgba(64, 255, 160, .25)'
  ctx.fillRect(20, 20, 80, 80)
  ctx.restore()
})
```

For one-off drawing or advanced wrappers, temporarily switch `game.ctx` with
`withLayer()`:

```js
api.render.withLayer('ui', (ctx, game) => {
  ctx.font = game.smallFont
  ctx.fillStyle = '#fff'
  ctx.fillText('mod overlay', game.screenUnit, game.screenUnit * 2)
})
```

Built-in layer ids are `background`, `buildings`, `effects`, `interaction`,
`ui`, `screen-effects`, `cursor`, `reduced-flashes`, and `top-effects`.
Custom layers can be registered with `api.render.registerLayer(id, { order, zIndex, clearEachFrame, cache })`, `api.render.defineLayer(id, options)`, or `api.render.layers.define(id, options)`; this defines or updates the layer but does not create or demand a canvas by itself. Passing `{ cache: true }` / `{ cached: true }` defaults `clearEachFrame` to false and redraws callbacks or routed methods only while the layer is dirty.
Render callbacks accept `enabled: false` or an `enabled(ctx)` predicate; disabled callbacks are skipped before their layer is touched for that frame. Prefer `enabled(ctx)` for hot toggles or overlays that are only visible in specific game states. Pass `space: 'screen'` when a callback draws screen-space UI or full-screen overlays; this defaults `copyTransform` and `copyState` to `false` for that callback.
Use `api.render.demandLayer(id, { enabled })` or `api.render.layers.demand(id, { enabled })` when a mod only needs a layer or routed vanilla method to be active for the frame and does not need to draw its own callback. Demanding `background`, or any layer below the main canvas such as `buildings`, also enables routing of the vanilla full-canvas black/white background fill to the background layer.
When an active layer sits above the main canvas but below the built-in `cursor`
layer, ModLoader also demands `cursor` for that frame. This keeps the vanilla
cursor above routed resource UI and custom mid-stack overlays. The cursor canvas
still receives no draw when the vanilla game hides its cursor, and layers
intentionally placed above the cursor keep their higher ordering.
Use `api.render.layers.get(id)` to access a layer canvas/context directly.
Use `api.render.demandedLayers()` or `api.render.layers.demands()` to inspect which layer ids are active for the current frame, and `api.render.isLayerDemanded(id)` / `api.render.layers.isDemanded(id)` to check one active layer without creating it. Direct `getLayer()` / `withLayer()` access keeps a persistent demand by default; pass `{ persistent: false }` / `{ persist: false }` for current-frame-only access, or call `api.render.releaseLayer(id)` / `api.render.layers.release(id)` to release an existing persistent direct-access demand. Use `{ currentFrame: true }` only when the current active mark should be cleared too. `onLayer()` callbacks and `demandLayer()` entries only demand their layer while enabled. Use `api.render.markDirty(id)` / `api.render.markClean(id)` / `api.render.isDirty(id)` or the matching `api.render.layers.*` helpers to control cached redraws. Render callback contexts include `cached`, `dirty`, and `redraw`. Only active layer canvases are shown, synced, and cleared during the normal frame path.
Use `api.render.describeLayer(id)` / `api.render.layers.describe(id)`, `api.render.definedLayers()`, `api.render.createdLayers()`, `api.render.callbacks()`, `api.render.layerDemanders()`, and `api.render.summary()` for read-only diagnostics that do not create canvases or demand layers; layer diagnostics include cache/dirty fields plus `owner` / `definitionOwner` and remain safe before a game or render manager exists.
If different registered mod owners redefine a layer with incompatible order,
z-index, clear, or cache behavior, or route the same method to different
layers, v1 records a conflict and logs a warning. A first intentional override
of a built-in default establishes the mod owner without producing a warning.
The compatibility rule is
`last-registration-wins`; disposing a scope restores the previous registration
when it is still the active one. Inspect copied conflict records with
`api.render.conflicts({ type, key, owner, limit })` or
`api.render.diagnostics.conflicts()`, clear them with
`api.render.clearConflicts()`, and read `summary().conflictCount` for the current
count. Conflict types are `layer-definition` and `method-route`.
Render timing diagnostics are disabled by default; enable them temporarily with `api.render.timing.enable({ samples: 240 })`, inspect `api.render.timing.summary()`, `console.table(api.render.timing.methods())`, or `console.table(api.render.timing.entities())`, then call `api.render.timing.disable()` when finished. Timing records `renderloop`, routed vanilla render methods, Render API callbacks, built-in overlay redraws, and entity render/darkrender calls grouped by entity name while inside `renderEntities()` or `renderConductors()`. Pass `{ entities: false }` to `enable()` to skip entity-level patching for a method-only timing run. Pass `{ entityDetailMethods: ['drawResources'] }` to also time selected nested entity submethods; detail rows use their actual `renderMethod`, `summary().entityDetailMethods` and `timing.detailMethods()` report the active allowlist, and passing an empty array returns to render/darkrender-only timing. Detail timing is opt-in, accepts at most 16 JavaScript method names, and is restored with the other entity timing wrappers when timing is disabled. Pass `{ vfx: true }` to additionally time active objects in `game.vfx` and `game.chasmVfx` by constructor and render context, then inspect `console.table(api.render.timing.vfx())`; VFX timing is also opt-in and `summary().vfxEnabled` / `summary().topVfx` report its state and leading rows.
Use `api.render.onReady(fn)`, `api.render.onFrameStart(fn)`, and `api.render.onFrame(fn)` for render lifecycle notifications; callbacks receive a lightweight context and return cleanup functions. The grouped aliases `api.render.events.ready(fn)`, `api.render.events.frameStart(fn)`, and `api.render.events.frame(fn)` are also available.
Use `api.render.createScope()` or `api.render.scope()` to group cleanup-returning render registrations. The returned scope exposes `add(cleanup)`, `dispose()` / `cleanup()` / `stop()`, and scoped wrappers for layer callbacks, scoped layer definitions, layer demands, method routes, and render events; disposal is idempotent, runs cleanups in reverse registration order, and restores scoped layer definitions only while they still match the scope-owned definition.
Use `api.render.routeMethod(methodName, layerId)` or `api.render.routes.register(methodName, layerId)` to add a routed `Game.prototype` render method; routing still only happens when the API is enabled and the target layer is demanded for that frame.
Built-in safe vanilla routes include world/entity stack draws such as `renderConductors` / `renderChasmVFX` / `renderEntities` -> `buildings`, `renderVFX` -> `effects`, interaction overlays such as `renderAvailability` / `renderSOI` / `renderHoveredCell` / `renderAffected` / `renderGrid` -> `interaction`, resource UI -> `ui`, hollow/slowdown screen effects -> `screen-effects`, and `renderCursor` -> `cursor`.
Do not register the vanilla `buildings` route as cached unless the original draw order is preserved. `Game.renderEntities()` replays entities in sorted map order, and static-looking sprites can be interleaved with animated, progress-state, or random-effect machines. Future building/entity caching should replay cached entries in the same original sequence, such as per entity or per sorted slice with explicit dirty signatures, instead of globally separating static and dynamic entity layers.
Use `api.render.routedMethods()` / `api.render.methodRoutes()` to inspect which vanilla render methods currently route because the Render API is enabled and their target layer is demanded. Pass `{ all: true }` to include inactive routes; entries include `method`, `layer`, `owner`, `demanded`, `routed`, `builtIn`, `custom`, and `patched`. Use `api.render.isMethodRouted(methodName)` and `api.render.getMethodLayer(methodName)` for single-method checks.
The `Ctrl+M` ModLoader panel shows the same Render API switch state, demanded layer ids, created layer ids, callback active/total counts, demand-only layer demander active/total counts, and active method routes in its summary block.
The ModLoader menu settings page includes a Render API switch. Turning it off
returns vanilla draw calls to the main canvas and skips registered render-layer
callbacks until it is turned on again.
`modloader/tools/verify.ps1` runs the v1 runtime contract test, including
capability discovery, competing mod ownership, nested scope restoration,
shared-layer callback error isolation, route fallback while disabled, resize
synchronization, and cleanup after disposal.

## Translation Catalog

Open `Ctrl+M` -> Menu Settings -> `translations` to create or open
`resources/app/game/modloader/translations.json`. The file is organized as
`language -> modloader/mods -> text` and can override ModLoader panel labels,
mod names/descriptions, config labels/descriptions, and slider value labels.

Mods can declare whether they follow the game's language switching with:

```json
"languageSupport": { "gameLanguage": true }
```

The catalog only changes display text at runtime. It is local user data and is
excluded from release packages so updates do not overwrite a player's edits.
## Example Building

Enable the entity example with:

```json
{
  "mods": [
    "example-building"
  ]
}
```

It adds `mod_soul_lamp`, a harmless test building that appears in the shop,
can be placed, and is saved by name like vanilla entities.




## Assets

Use `api.asset(path)` for files inside the current mod folder:

```js
const image = api.asset('img/my-building.png')
```

Use `api.replaceAsset(from, to)` to redirect vanilla paths without overwriting
vanilla files:

```js
api.replaceAsset('img/eye.png', 'img/custom-eye.png')
api.replaceAsset('sfx/tap.mp3?v5', 'sfx/custom-tap.mp3')
```

Use `api.registerSound(name, src, options)` for new sound ids and
`api.registerMusic(name, src, options)` for music ids used by `playMusic(name)`.
Registered or replaced images are picked up by preload, `Sprite`, shop icons,
and `GLSprite`.


Enable `example-asset-replace` to test asset replacement. It redirects the Eye
image and shop icon to existing vanilla Void Sculpture assets, without copying
or overwriting vanilla files.

## Mod Config

A mod can declare config defaults in `mod.json`:

```json
{
  "id": "my-mod",
  "config": {
    "enabled": { "type": "boolean", "default": true },
    "multiplier": { "type": "number", "default": 2 },
    "opacity": { "type": "slider", "default": 0.8, "min": 0, "max": 1, "step": 0.05 }
  }
}
```

Read config from a mod entry with:

```js
api.config.get('enabled', true)
api.config.set('multiplier', 3)
api.config.all()
api.config.schema()
```

Values are stored in `localStorage` as `modloader:<modId>:config:<key>`.
The `Ctrl+M` panel can edit declared config fields for enabled mods. Booleans
use switches, numbers use number inputs, strings use text fields, and
array/object values use JSON text boxes. Numeric slider controls can be declared
with `type: "slider"` or by adding `ui`, `control`, or `input` set to
`"slider"` on a numeric field; sliders use `min`, `max`, and `step`, and save
ordinary number values. Config-only saves do not reload the game automatically;
mods that read config during startup still need a manual reload to apply those
values.

Color map config can use the built-in `resourceColors` control. It renders an
optional Export colors / Import colors toolbar, then rows in this order:
optional resource icon, color picker, hex color input, reset button. Other mods
can disable the toolbar or icons with `importExport: false` or `showIcons: false`.

```json
{
  "config": {
    "resourceGlowColors": {
      "type": "resourceColors",
      "default": {},
      "reloadPolicy": "hot"
    }
  }
}
```

Custom palettes can provide `resources`, `rows`, or `colors` entries with `id`,
`name`, `defaultColor`, and optional `iconIndex`; saved values are an object of
`id` to `#RRGGBB` overrides.

## Dependencies And Conflicts

A mod can declare simple dependency and conflict lists in `mod.json`:

```json
{
  "id": "my-mod",
  "dependencies": ["library-mod"],
  "conflicts": ["other-overhaul"]
}
```

References can use either the target mod `id` or its folder name under `mods/`.
The `Ctrl+M` panel reports missing dependencies, conflicts, duplicate enabled
entries, duplicate mod ids, and manifest load failures.

## Entity Mods

Use `api.registerEntity(id, Class, dataEntry)` from an `afterVanillaScripts`
hook. The class can extend vanilla `Entity` because all vanilla scripts have
already loaded at that point.

```js
ModLoader.register({
  id: 'my-mod',
  init(api) {
    api.on('afterVanillaScripts', function () {
      class MyBuilding extends Entity {}
      api.registerEntity('my_building', MyBuilding, {
        price: [64],
        canPurchase: true,
        shopImage: api.asset('img/shop/my_building.jpg')
      })
    })
  }
})
```

If a save contains an entity whose mod is disabled, the loader keeps that
entity in `save.modloader.orphanEntities` instead of crashing or deleting it.
