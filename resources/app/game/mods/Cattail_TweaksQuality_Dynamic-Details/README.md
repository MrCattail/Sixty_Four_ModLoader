# Dynamic Details

Dynamic Details adds optional building detail cards, resource-source panels, coordinate tools, direction pointers, and shop countdowns. Version `0.1.1` also publishes a read-only production telemetry API for other mods.

## ModLoader shortcut hints

All 18 existing keyboard/mouse actions are listed through ModLoader's display-only Shortcut API. Open the lower-left `?` to see the **Information and diagnostics** category. Disabled features hide their entries; enabled features with unmet conditions keep an inactive row explaining the required context. ModLoader's global and per-Mod shortcut visibility preferences still apply.

| Keys | Action / context |
| --- | --- |
| Alt + Shift | Hold building details over a building or supported cell hint. |
| Ctrl + Alt | Pin/unpin building details in that context, unless a resource is hovered. |
| Z + wheel up/down | Change card opacity while Alt/details are active, outside resource-source controls. |
| Middle mouse | Switch whole-card/detail-only opacity in a building context. |
| Alt | Hold sources/consumers over a resource icon on the main plane. |
| Ctrl + Alt | Pin/unpin the hovered resource panel. |
| Shift | Temporarily preview resource links; with a line lock, preview the hovered resource and restore the lock on release or leaving the icons. Otherwise requires Alt or a pinned resource panel. |
| Middle mouse | Lock, transfer or release links over a resource icon. |
| Wheel up/down | Toggle the resource bar/line chart over an icon after its unlock, with the line-chart setting enabled. |
| O | Switch resource links between Canvas 2D and WebGL. |
| F8 | Toggle the resource-source performance profiler (diagnostics). |
| Alt | Hold hovered-cell coordinates. |
| Alt + C | Pin/unpin coordinates. |
| Alt + Shift + C | Open coordinate teleport on an empty cell. |
| Enter | Confirm teleport while its panel has focus. |
| Escape | Close teleport while its panel has focus. |
| Alt + Shift | Hold important-target directions on an empty cell. |
| Ctrl + Alt | Pin/unpin directions on an empty cell, outside building/resource controls. |

The consumer provides its own descriptions and conditions in all 20 manifest languages, with English fallback. These texts are separate from the four-language game-detail dictionary and manifest/settings translations. The API does not intercept or rebind input; existing controls and persistence remain owned by Dynamic Details. Repeated combinations represent different contexts and may produce the API's expected conflict warnings.

`scripts/shortcut-hints.js` registers after game initialization and cleans its own handles on replacement. A private read-only core snapshot refreshes hints when context changes; focus events also refresh them. This adds no timer or animation loop. A Loader without the Shortcut API safely skips the hints.

Run `node resources/app/game/mods/Cattail_TweaksQuality_Dynamic-Details/tests/verify-shortcut-hints.js` for the real Loader registry/panel, 20 languages, feature/context states, actual input and lifecycle checks. It runs in fresh isolated browser contexts with synthetic game/world data. Player acceptance remains separate.

## Shop build countdown (desktop 1.3)

The existing `enableBuildCountdown` setting displays an estimated build time under an unaffordable item's price. It supports the native 1.3 shop without Better UIs, plus Better UIs' native layout, 1.2.1-style list, eight-category compact view and 1.3 capsule layout. Affordable, locked, only-one and other-plane items have no active countdown.

The estimate retains the recent net-resource-flow model: a 30-second window, a two-second minimum sample, roughly one-second display updates, the longest missing-resource wait, and the existing storage-cap oscillation safeguards. Unknown or nonpositive income displays `--`; durations round up to whole seconds. Orbifold theoretical production is a separate task.

The feature follows the real Store card/price maps and its existing update lifecycle. It restores countdowns after price clearing and language rebuilds, cleans its old nodes on Store replacement, and adds no polling loop. Compact-view price signatures ignore countdown nodes so changing seconds does not replace rows or tooltip targets. Purchase rules and handlers remain native.

Run `node resources/app/game/mods/Cattail_TweaksQuality_Dynamic-Details/tests/verify-build-countdown-browser.js` from the checkout. This uses real Store and Game resource methods in an isolated browser with synthetic world data and actions; it does not open a player profile or replace in-game acceptance.

## Resource-source line controls

Middle-click a resource to lock its income/consumption lines. While A is locked, hold Shift over B to temporarily show only B; release Shift or move away from the resource icons to restore A. This preview does not require Alt and does not change the saved lock. Hovering A draws one set of lines. Middle-clicking B still transfers the lock, and middle-clicking the locked resource releases it.

Without a line lock, Shift retains the existing requirement of an active Alt resource view or a pinned resource panel. Pinned-panel virtual hover does not override a locked line's real-mouse preview. Canvas2D and WebGL, with Render API enabled or disabled, share this selection rule.

Run `node resources/app/game/mods/Cattail_TweaksQuality_Dynamic-Details/tests/verify-resource-source-links.js` for the isolated real-Canvas/WebGL drawing checks. These use synthetic world/events and Render API callbacks; in-game acceptance is separate.

## Production telemetry API

The API is available after vanilla scripts load:

```js
const telemetry = globalThis[
	Symbol.for('cattail.dynamic-details.production-telemetry')
]
```

Public contract:

```js
telemetry.apiVersion             // 1
telemetry.snapshotSchemaVersion  // 1
telemetry.canonicalUnit          // "perSecond"
telemetry.sampleWindowMs         // 30000
telemetry.capabilities
telemetry.status()
telemetry.snapshotEntity(entity, options)
telemetry.snapshotEntities(entities, options)
telemetry.dispose(reason)
```

The API object and every returned status or snapshot are frozen. Snapshots contain detached plain data and never expose internal events or entity references.

`dispose()` invalidates only that public controller. Telemetry patches are installed once for the current page and remain available to a replacement controller. Reloading the game page resets all patches and samples.

## Snapshot shape

```js
{
	ready: true,
	reason: null,
	schemaVersion: 1,
	sampledAt: 0,
	canonicalUnit: "perSecond",
	sampleWindowMs: 30000,
	metrics: {
		theoretical: true,
		actual: true,
		supplemental: true
	},
	quality: "complete",
	sampleDuration: {
		minMs: 30000,
		maxMs: 30000,
		collectingEntities: 0
	},
	entities: {
		requested: 0,
		included: 0,
		duplicates: 0,
		invalid: 0,
		stale: 0,
		unsupported: {
			theoretical: 0,
			actualOutput: 0,
			actualConsume: 0
		}
	},
	events: {
		scanned: 0,
		matched: 0,
		dropped: 0,
		truncated: false
	},
	totals: {
		theoretical: { output: [], consume: [], net: [] },
		actual: { output: [], consume: [], net: [] }
	},
	byType: []
}
```

Resource arrays are dense and indexed by the vanilla `resourceId`. `output` and `consume` are finite non-negative rates. `net` is `output - consume` and may be negative. Consumers should perform display rounding and `s`, `min`, or `hr` conversion themselves.

Snapshots include theoretical and supplemental metrics by default. A consumer performing frequent selection updates can skip those calculations without changing the actual-rate contract:

```js
telemetry.snapshotEntities(selectedEntities, {
	theoretical: false,
	supplemental: false
})
```

The returned `metrics` object records which optional calculations were requested. Actual output and consumption are always included.

`byType` is sorted by the original entity name. Each item includes its entity count, per-metric support state, theoretical and actual flows, sample-duration range, and supplemental metrics. Pumps may expose:

```js
{
	id: "pumpMining",
	basis: "instantaneous",
	resources: []
}
```

`pumpMining` is the current mining rate and must not be added to actual credited output.

## Data meaning

Actual output and consumption come only from resource `gain` and `consume` events attributed to exact entity instances. They do not include the separate building-card `recordOutput()` samples.

Each entity uses its own effective sample duration, capped at 30 seconds with a minimum one-second divisor. A batch snapshot computes each entity rate before aggregation.

Snapshot quality:

- `complete`: every included entity has a complete window and no active event truncation.
- `collecting`: at least one included entity has less than 30 seconds of history.
- `truncated`: the 12,000-event cap removed data still belonging to the current window.

Consumers must not present `truncated` data as an exact complete measurement.

Theoretical resource flow is currently supported for:

- `pump`
- `pump2`
- `gradient`
- `converter32`
- `converter13`
- `converter41`
- `converter76`
- `converter64`

Converter theoretical input is `fuel * progressPerSecond`; theoretical output is `getConversionOutput() * progressPerSecond`. Buildings without a stable resource formula remain actual-only. Power, force, stored resources, transport contents, and connection counts are outside API version 1.

## UI independence

Production telemetry is installed whenever Dynamic Details is enabled. Disabling the resource-source interface prevents its panels, lines, shortcuts, line chart, and profiler from installing, but does not stop production event collection.

The API creates no polling interval or animation-frame loop. Existing game method patches update the bounded event window and per-source totals. Snapshot formatting runs only when a consumer requests it.

## Read-only inspection

```js
const telemetry = globalThis[
	Symbol.for('cattail.dynamic-details.production-telemetry')
]

telemetry.status()

// Supply entity objects already selected by the consuming mod.
telemetry.snapshotEntities(selectedEntities)
```
