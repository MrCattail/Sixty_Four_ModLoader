# Dynamic Details

Dynamic Details adds optional building detail cards, resource-source panels, coordinate tools, direction pointers, and shop countdowns. Version `0.1.1` also publishes a read-only production telemetry API for other mods.

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
