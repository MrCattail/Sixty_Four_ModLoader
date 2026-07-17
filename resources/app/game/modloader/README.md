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

ModLoader creates a stacked canvas renderer around the vanilla game canvas. The
vanilla canvas remains the main world canvas, and layer canvases are created
lazily. When a mod registers or accesses a layer, matching safe vanilla draw
calls can be routed to that layer so ordering stays stable. Unused layers keep
their vanilla draw calls on the main canvas to avoid extra compositor cost.
Background and building layers exist for future world-splitting work, but the
current vanilla world is still drawn on the main canvas.

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
`ui`, `screen-effects`, `cursor`, and `top-effects`. Custom layers can be
registered with `api.render.registerLayer(id, { order, zIndex, clearEachFrame })`.
Use `api.render.layers.get(id)` to access a layer canvas/context directly.
The ModLoader menu settings page includes a Render API switch. Turning it off
returns vanilla draw calls to the main canvas and skips registered render-layer
callbacks until it is turned on again.

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