# ModLoader Tools

## Current verification boundary (5A, 2026-10-28)

Normal installation and `Verify ModLoader.cmd` run installation checks only:
required hook points and runtime files, expected Loader version, enabled-list
shape, and JavaScript syntax when Node.js is available. Missing Node is reported
as a skipped syntax check, never as syntax acceptance. Installation also freezes
source metadata and checks copied file length/SHA-256; backups are checked before
patching. Failures still restore backups and return nonzero. Incomplete recovery
is reported separately with the backup path.

The 25 feature/consumer suites run from the development checkout with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\resources\app\game\modloader\tools\verify-development.ps1
```

This requires Node.js, all suite inputs and the relevant consumer Mods. Missing
inputs or failed suites block development acceptance. Existing `-FullVerification`
installation requests are checked for development inputs before any target write;
a player package without those inputs rejects the request explicitly. A complete
request runs both installation checks and development suites. Legacy `-LoaderOnly`
is accepted by the installation verifier with a migration notice.

Player packaging retains only these Loader tools: verify/common/modifier-watch,
snapshot/report/restore, and README. Development suites, their helper/fixtures,
and installer tests stay in source but are excluded from player packages.
Diagnostics, Mod test directories, player templates, P2P service dependencies and
other previously discussed exclusions are unchanged by this 5A batch. No candidate
package is created by the verification tests.


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

Checks installed hook points, required runtime files, version and enabled-list
shape; validates JavaScript syntax when Node.js is available:

```powershell
.\resources\app\game\modloader\tools\verify.ps1
```

`-LoaderOnly` is a legacy alias for installation-only checks and prints a migration
notice. Functional contracts now run exclusively through `verify-development.ps1`.
Manual Verify also checks installation only. Run checks against an explicitly
installed isolated copy; they do not launch the game or prove player acceptance.

## Traditional Chinese locale checks

Development verification includes `chinese-optimization-traditional-contract.test.js`.
It runs real Loader/Mod/native lookup code in an isolated VM: all 752 fields and
425 messages, native menu labels, late word hooks, source preservation, placeholder
and value protection, locale fallback, and Loader panel/manifest/settings text.
It does not boot Electron or access player saves. Installation verification does not run this suite.

The Chinese Mod also has `tests/verify-localization-1.3.cjs` for native reference
and Simplified text regression checks. Its preserved-text hash was refreshed to
the user-maintained Simplified input at the 2026-10-16 modtch approval; no source
translations were changed to satisfy the old pre-review hash.

## Author words.js export checks

Development verification also runs `chinese-optimization-author-export-contract.test.js`.
The Chinese Mod's Settings action reads the saved translation source, converts
Traditional Chinese offline, and replaces only the native `sch`/`tch` objects in
a standalone copy of the game's `words.js`. It uses the existing save-dialog IPC;
there is no new Loader API or main-process handler. The contract checks 752 fields,
425 messages and all 50 credits per locale, the other 17 languages and source bytes,
fresh reads, cancellation, malformed input, protected paths/links and atomic-write
failure. All file writes and dialog stubs use a temporary fixture, without starting
the game. Native Save As and Explorer interaction still need player acceptance.
Installation verification does not run this suite.

## Game 1.3 foundation tests

From the development root, with Node.js and Windows PowerShell available:

```powershell
node .\resources\app\game\modloader\tools\game-1.3-runtime-contract.test.js
node .\resources\app\game\modloader\tools\game-1.3-install-contract.test.js
```

The runtime suite uses isolated mocks for object saves, metadata preservation,
early startup, asynchronous identity persistence, failure and slot guards,
concurrent activation, and Store HUD selection. It is part of `verify-development.ps1`.

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

## Optional translation catalog contracts (2026-10-28)

The four panel/shortcut contracts read `fixtures/panel-translations-v0.5.0.json`,
not the user's optional `../translations.json`. This fixed sample contains only
the existing 20-language menu keys needed by those tests. It is test input, not
a default override to install into a player's directory.

`translation-catalog-compatibility-contract.test.js` executes the actual Loader
catalog read and text-selection functions. It checks built-in fallback, old and
custom overrides, invalid JSON reporting, removal, and no write-back. To include
an original old catalog, set `MODLOADER_OLD_CATALOG_PATH` to an isolated copy; the
file is read only. The development verifier runs this contract; installation verification does not.

The installer contract requires pristine native source as its third argument
(or `MODLOADER_INSTALL_FIXTURE_ROOT`). It rejects patched input and asserts that
negative-test mutations hit the source. The maintenance suite prepares this
fixture from the original game-source ZIP and passes it automatically. This
avoids testing no-op mutations against an already installed workspace.

Full installation/update regression is available through
`modloader-installer/tests/verify-install-maintenance.ps1`. Its result file records
each subprocess outcome, including expected failures. Helper-only or interrupted
runs are not complete upgrade verification. Packaging filters/archiving helpers
are exercised only on tiny fixtures; no distribution package is built.

The configuration identifier contract also uses the fixed test-only
`fixtures/config-identifier-v0.5.0.json` schema. Its 58 actual Loader scenario
groups no longer require the player to have a particular Tweaks manifest version
installed. This snapshot contains schema/defaults/compatibility metadata, not
player settings. It is never copied into a Mod or written to player storage.


## Player package diagnostics boundary (15A, 2026-10-28)

The complete Loader `diagnostics/` tree is excluded from newly built player
packages. Local diagnostic sources remain available in the development checkout.
Without that directory, diagnostic controls are hidden, startup-origin requests
are skipped, and the startup-probe switch does not load a missing module. Explicit
client initialization reports that the optional component is not installed.
`placement-render-hooks.js` is retained and still installed: the placement-shadow
optimization also uses this shared runtime adapter. `tools/modifier-watch.ps1`
remains a runtime helper and is retained.

This is a build filter, not an installed-file cleanup. Older diagnostic files
already present in a player's directory are left intact and can still expose
optional diagnostics. Existing ZIPs are unchanged until separately rebuilt.


The opt-in `game-1.3-smoke.test.js` reads `development_restore_20261003.json` from this tools directory. This is the historical 2026-10-03 development-copy inventory (3,308 paths with sizes and hashes), used by that test only to select Mod paths for before/after protection checks. It is not a source archive, runtime configuration, or player save. Moved here from Codex-md on 2026-10-28 without changing its contents.
