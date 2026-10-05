# ModLoader Tools

Run these from PowerShell in the game folder or by full path.

## Snapshot

Backs up files touched by the loader integration:

```powershell
.\resources\app\game\modloader\tools\snapshot.ps1
```

Snapshots are stored under:

```text
resources/app/game/modloader/state/snapshots/
```

## Verify

Checks that loader hook points still exist, validates JavaScript syntax when
Node.js is available, and runs the Render API plus Storage Snapshot API v1
contract suites:

```powershell
.\resources\app\game\modloader\tools\verify.ps1
```

`-LoaderOnly` checks patched desktop 1.3 hooks and Loader contracts while skipping
Mod-dependent translation and consumer feature suites. The installer uses this
mode by default. Full verification still includes those consumer suites. Run
either mode against an explicitly installed test copy; the current development
workspace intentionally retains unpatched native entry files.

## Game 1.3 foundation tests

From the development root, with Node.js and Windows PowerShell available:

```powershell
node .\resources\app\game\modloader\tools\game-1.3-runtime-contract.test.js
node .\resources\app\game\modloader\tools\game-1.3-install-contract.test.js
```

The runtime suite uses isolated mocks for object saves, metadata preservation,
early startup, asynchronous identity persistence, failure and slot guards,
concurrent activation, and Store HUD selection. It is also part of `verify.ps1`.

The installer suite copies only the five native source files into a unique
temporary directory. It checks preflight, syntax, object assembly, repeat patch
and installation, unsupported version/anchor rejection, write rollback, uninstall,
and verification-failure recovery. Successful installs use an empty Mod list;
failure tests use synthetic inert payloads. It never launches Electron/Steam,
opens a game profile, or executes real Mods. Fixtures and `result.json` remain in
the printed directory. The suite is invoked separately to avoid verifier recursion.
Its Windows PowerShell child processes resolve their own module search path.

## Opt-in offline Electron smoke test (1.3)

`game-1.3-smoke.test.js` runs the actual game's Electron executable in the owned
`../ModLoader-Test-1.3/runtime` copy. It is **never** part of normal `verify.ps1`
or installation. Running it requires explicit approval to launch the test game.

```powershell
# First creation only; fails if the target already exists.
node .\resources\app\game\modloader\tools\game-1.3-smoke.test.js
# Explicitly refresh and retest the already-owned copy after closing it.
node .\resources\app\game\modloader\tools\game-1.3-smoke.test.js --reuse
# Open that copy for manual inspection; close the window to finish.
node .\resources\app\game\modloader\tools\game-1.3-smoke.test.js --reuse --manual
```

Only the copied game receives source hooks. The test copy has an empty Mod list,
no native Steam/TrackJS dependencies, and separate appData/userData/sessionData,
temp, log and crash directories. A copied bootstrap supplies an empty 1.3 cloud
slot envelope and returns false for cloud writes; no actual Steam calls occur.
This prevents vanilla's missing-Steam legacy conversion from replacing local
test slots on reload. HTTP(S)/WebSocket requests are blocked in its session.
The expected native red Steam warning remains visible.

The harness checks Ctrl+M, Store categories and asset resolution, Window IPC,
HUD hide/rebuild/restore, object saves and actual IndexedDB persistence, Snapshot
IPC, reload identity, and rejection of an old context token. It unlocks one card
only in the test save and binds a temporary Snapshot probe without loading a Mod.
It hashes original entries, all original Mods, and the real default profile before
and after. Results, screenshots and logs remain under `evidence/`; the test profile
persists separately. Automatic runs close their own game window. They do not prove
Steam Cloud behavior, player acceptance, or compatibility of existing Mods.

The three `snapshot-*-v1-contract.test.js` files test the public Storage API,
binary export container, atomic store, namespace isolation, rotation,
quarantine, and the management-page action boundary. These runtime snapshots
are stored under Electron `userData/modloader/snapshots/`; they are separate
from the integration backup made by `snapshot.ps1`.

## Report

Prints enabled mods and tracked file hashes:

```powershell
.\resources\app\game\modloader\tools\report.ps1
```

## Restore

Restore is intentionally guarded:

```powershell
.\resources\app\game\modloader\tools\restore.ps1 -SnapshotId 20260101-120000 -ConfirmRestore
```

Omit `-SnapshotId` to use the latest snapshot.
If Windows blocks `.ps1` execution, run scripts with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\resources\app\game\modloader\tools\verify.ps1
```
