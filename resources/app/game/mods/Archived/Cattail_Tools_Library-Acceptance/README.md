# Library API Acceptance Fixture

This is a temporary, disabled-by-default in-game acceptance harness for
ModLoader 0.3.0 Library API 1.0.0.

It declares one installation library named `acceptance` at the top-level
`library-api-acceptance/` directory. It never reads or writes world/save data,
never uses the future `blueprints/` directory, and cannot request an arbitrary
filesystem path.

## Enable

1. Start Sixty Four and press `Ctrl+M`.
2. Enable `[TEMP] Library API Acceptance`.
3. Save the Mod change. The ordinary renderer reload is not enough because
   Library declarations are read by the main process.
4. Fully exit Sixty Four, start it again, and confirm a `LIB` button appears in
   the lower-right ModLoader HUD area.

Do not edit `mods/enabled.json` by hand for this acceptance run.

## Automated in-game acceptance

1. Click `LIB`.
2. Click `Run all`.
3. Wait for `PASS all automated tests` / `通过：全部自动测试`.
4. Confirm the managed counts return to
   `active=0 | trash=0 | quarantine=0 | cache=0`.

The automated run covers capabilities without path disclosure, UTF-8 and
binary data, SHA-256 revisions, explicit replacement backup, stale revision
rejection, safe errors, entry quota, trash/restore, quarantine/permanent
removal, cache LRU pruning, and the native watcher.

## Manual filesystem acceptance

1. Click `Open folder`; confirm Explorer opens the installation-level
   `library-api-acceptance` directory.
2. Return to the panel and click `External watcher`.
3. Explorer opens again with an `external-watch-*.cattail-library-test.json`
   sample. Delete it within 30 seconds, or rename it while preserving the
   `.cattail-library-test.json` suffix.
4. Confirm the panel reports PASS for the external filesystem watcher.
5. Click `Clean test data` and confirm every managed count is zero.

The managed directory and its empty internal directories may remain after test
data cleanup. Their final deletion or retention is a separate decision.

## Disable

1. Press `Ctrl+M`.
2. Disable `[TEMP] Library API Acceptance`.
3. Save and reload. A later full game restart removes its main-process library
   declaration as well.

Do not archive, delete, stage, or commit this fixture until its acceptance
result has been recorded and a separate disposition has been approved.
