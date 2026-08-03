# Snapshot API Acceptance — temporary test Mod

This completed acceptance tool is archived under `mods/Archived` and is not
discovered or loaded by ModLoader. To reuse it, first move this entire Mod
directory back to the direct `mods` directory.

This Mod is intentionally not added to `mods/enabled.json`. It only exercises
the public `api.storage.snapshots` contract in its own current-save namespace.
It does not read or write world entities, resources, Better UIs slots, or Steam
Cloud directly.

## In-game use

1. Restart the game so ModLoader 0.2.0 is active.
2. Open `Ctrl+M`, enable `[TEMP] Snapshot API Acceptance`, then choose
   `Save & Reload`.
3. Load the save that will be used for acceptance.
4. Click the green `SNAP` button in the lower-right game HUD.
5. Run `Basic`, `Rotation`, and `Errors`, or use `Run all`.
6. Close the test card, open `Ctrl+M -> Snapshots`, and inspect the records for
   `Cattail_Tools_Snapshot-Acceptance`.
7. Validate and export one record, then test the deletion confirmation.
8. After acceptance, disable this Mod in `Ctrl+M` and `Save & Reload`.

`Basic` leaves two records so the management page has data to inspect.
`Rotation` creates 12 records and verifies that only the newest 10 remain.
`Errors` verifies stable rejection for invalid data, missing reason, invalid
tags, an oversized payload, and a missing snapshot id.

The `Delete all` button only deletes records visible through this Mod's own
bound Snapshot API. It cannot see or delete another Mod or save namespace.
