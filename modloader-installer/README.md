# Sixty Four ModLoader Installer

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


This development adapter supports desktop game **1.3 only**. Its source-copy
installation, rollback and Loader checks pass. An isolated offline Electron smoke
test also passes; player acceptance, Steam Cloud and individual Mod compatibility
are still pending. The live game has not been patched by this
development task. The installation instructions below describe an explicit
installation action, not a required step for continuing source development.

Run these scripts from PowerShell. `GameRoot` is the game's `win-unpacked`
folder, for example:

```text
D:\Steam\steamapps\common\Sixty Four\win-unpacked
```


## Easy Double-Click Install

For most players:

1. Extract the ModLoader zip into the Sixty Four `win-unpacked` folder.
2. Open `modloader-installer` and double-click `Install ModLoader.cmd`.
3. Start the game and press `Ctrl+M`.

The installer prints `Installation may take a minute. Do not close this window.`
before it starts. After the five source checks, silent file-list, backup and copy
work uses a single-line `| / - \` spinner with the current phase and file count.
When output is redirected to a log or automated test, it prints one normal line
per phase instead of carriage-return animation.

If Windows extracts the zip into a new `SixtyFour-ModLoader` folder inside
`win-unpacked`, open `SixtyFour-ModLoader\modloader-installer` and double-click
`Install ModLoader.cmd` there. The installer will detect the nested package and
install into the parent `win-unpacked` folder automatically.

Use `modloader-installer\update.cmd` to update from any newer ModLoader zip,
`modloader-installer\Uninstall ModLoader.cmd` to restore the latest install backup, or
`modloader-installer\Verify ModLoader.cmd` to check the loader hooks.

## Update

For installed players:

1. Put any newer ModLoader zip in `modloader-installer`. The file name does not matter.
2. Double-click `update.cmd`.
3. The updater scans all zip files there, ignores non-ModLoader or older packages,
   and uses the newest ModLoader package it can find. A package is newer when its
   version is higher, or when the version is the same but its package build time
   is newer.
4. Choose whether the package `mods` folder should replace the current `mods`
   folder.
5. After a successful update, choose whether to delete the zip package that was
   just used.

Choose **Yes** on the mods prompt only when you want the package mods to fully
replace the current mods folder. Choose **No** to update ModLoader while leaving
the current mods folder untouched.

Command-line options:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\update.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

Use `-ReplaceMods` or `-PreserveMods` to skip the mods prompt. Use `-DeletePackage` or `-KeepPackage` to skip the post-update package cleanup prompt.

## Install

From the package root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\install.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

The package does not include copied Sixty Four source files. Instead,
`patch-source.ps1` inserts the small hooks ModLoader needs into the player's
local install.

The installer:

- checks all five source transformations and required runtime anchors before writing
- backs up every file it can overwrite to `resources/app/game/modloader/state/install-backups/`
- patches the local game files with the ModLoader hooks
- copies `modloader/`
- copies `modloader-installer/` into the game folder for future updates
- copies mod folders and templates
- keeps an existing `mods/enabled.json`
- runs installation-only `verify.ps1 -LoaderOnly` and treats a nonzero exit as installation failure

`patch-source.ps1 -GameRoot <target> -CheckOnly` performs the source preflight
without writing. All transformations are prepared before source writes; an I/O
failure restores already-written source files from their original bytes. An
installation failure additionally restores overwritten runtime/installer/Mod
files, removes newly copied files, and restores a replaced Mods folder. This is
failure recovery, not a guarantee against process termination or power loss.

Runtime `state/` and `backups/` are excluded from copying. `-SkipMods` preserves
the target Mods directory. Add `-FullVerification` only when the consumer Mods
required by the full verifier are present and ready for that check. Loader-only
verification deliberately does not claim consumer compatibility.

The backup manifest keeps the established core/enabled list in `files` for
ordinary uninstall and the full installation recovery list in `rollbackFiles`.
Backup IDs include milliseconds and a random suffix, so repeated installs do not
reuse a backup directory.

ModLoader 0.3.0 also installs the main-process Library API v1 store module and
verifies its IPC bridge. Manifest-declared installation libraries, such as a
top-level `blueprints\` folder, are player data outside `modloader\`; the
installer and updater do not create, replace, copy, or delete their contents.
Back up those folders separately before verifying game files, moving the game,
or uninstalling it.

If ModLoader is already installed, add `-Force` to reinstall after backup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\install.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked" -Force
```

## Uninstall

Restore the latest install backup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\uninstall.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked" -ConfirmUninstall
```

Restore a specific backup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\uninstall.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked" -BackupId 20260621-220538 -ConfirmUninstall
```

By default, uninstall restores backed-up core files and leaves `modloader/`
and `mods/` in place. Add `-RemoveModloaderFiles` only if you want to delete
the loader tools too.
When testing the installer from an already-installed development folder,
source and target files may be the same. The installer skips identical source
and target files, but still creates a backup and runs verification.
To build a zip with no example mods enabled:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\build-package.ps1 -Clean -CleanEnabled
```

`-CleanEnabled` only changes the generated zip/staging copy. It does not modify
your current game directory's `mods/enabled.json`.

## Long Windows paths (2026-10-28)

`install.ps1` and `uninstall.ps1` load the adjacent `filesystem.ps1` helper.
Keep these three files together when distributing a script-only fix. Installation
scans, file existence checks, directory creation, copying, SHA256/length reads,
rollback and backed-up file restoration use extended Windows paths internally.
Backup directory layout and relative manifest fields remain unchanged; dependency
files are retained. ReplaceMods keeps its existing resolved game-root containment
check before recursive removal. No Windows registry or system setting is changed.

Run the isolated regression with Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File modloader-installer/tests/verify-long-paths.ps1
```

The test creates synthetic files under a unique temporary directory and retains
that directory as evidence. It checks the two reported dependency paths, longer
source/target paths, literal brackets, backup hashes, successful installation,
verification-failure rollback, ReplaceMods recovery, read-only files and old-format
uninstall manifests. UNC conversion is checked without accessing a network share.
This does not replace acceptance on the affected player's computer.

## Optional translations and maintenance compatibility (8A, 2026-10-28)

`resources/app/game/modloader/translations.json` is an optional user override.
Installation does not create it or copy a package's override over the player's
file. Verification uses fixed test-only menu translations under `tools/fixtures`
and executes the actual Loader fallback functions against missing, old, custom,
invalid and removed catalogs. User catalogs are never rewritten by these tests.

Source copying and future package staging omit `.vite` directory segments while
retaining ordinary `node_modules` dependencies. Existing player caches are not
cleaned. Full failure-recovery backups retain existing files, including caches.
A replacement install must use a separate source directory: replacing Mods from
the target directory itself is rejected before modification.

The updater uses the shared long-path filesystem helper for extraction, source
copying and temporary-directory cleanup. Archive names are checked before any
entry is written, including both slash forms. `filesystem.ps1` must accompany
install, update, uninstall and build scripts. `-RemoveModloaderFiles` retains its
explicit opt-in and now removes long paths after checking the target containment.
Missing recovery files cause an explicit failure rather than silent skipping.

The maintenance regression uses original source archives and the old Loader ZIP
read-only. It creates independent fixtures and logs under a new evidence folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File modloader-installer/tests/verify-install-maintenance.ps1
```

`-ArchiveRoot` selects the backup directory; `-EvidenceRoot` must be a new directory.
`-HelperOnly` is a partial diagnostic and never reports full maintenance success.
The suite may create tiny archive inputs for updater/helper checks. It does not
run the full build script, alter `dist`, build a distribution ZIP, start Electron,
or access real player saves. Actual package verification is a separate step.

Development configuration compatibility verification uses a fixed test schema;
an absent or older Tweaks installation is not treated as a Loader installation
failure. The migration scenarios still execute the actual Loader functions.

## Archived Mods in player packages (11A)

The builder excludes the top-level `resources/app/game/mods/Archived/` tree
(case-insensitive path-segment match). Local archive sources are retained.
`template_and_example/`, similarly named directories such as `Archived-extra/`,
and nested directories inside current Mods are unaffected. Existing ZIPs and
already installed archives are not removed by this build rule.

## P2P excluded from player packages (13A)

The complete top-level `Cattail_TweaksNetwork_P2P-Multiplayer/` Mod is excluded,
including runtime, services, installed dependencies, tools and tests. Local P2P
source and existing player installations are not deleted. Before changing staging
or output, the builder rejects a source enabled list that enables this excluded
Mod. `-CleanEnabled` remains an explicit alternative that empties only the package
copy. Templates and similarly named directories are retained. Existing ZIPs must
be rebuilt separately to reflect this rule.


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

## Mod tests and historical translation backup (18A)

Player packaging excludes each Mod's immediate `tests/` tree, while preserving
all of `template_and_example/`, similarly named directories such as `tests-extra/`,
and deeper runtime resource paths. The exact Loader-root historical file
`Translations-20260721-191815.json` is also excluded. No local source, test,
translation or previously installed file is deleted. Candidate package creation
and verification remain separate steps.

## Actual candidate ZIP verification (23A)

`tests/verify-candidate-package.ps1 -CandidateZip <zip> -SourceRoot <frozen-checkout>
-EvidenceRoot <new-external-directory>` verifies an actual built archive against
its frozen staging, then installs/upgrades from its extracted contents. It covers
empty enabled list, exclusions, runtime entries/templates, missing/old/custom
catalogs, preserve/replace Mods, repeat install, uninstall, both update modes,
old updater bootstrap, and injected verifier-failure rollback. It never launches
the game. Developer source/testing remains separate and must pass before building.
Candidate outputs must use a new name and be accompanied by hashes and inventory;
never use the one-click Clean build when preserving existing dist files.

### Verified candidate, 2026-10-28

`dist/candidates/SixtyFour-ModLoader-0.5.0-20261028-rc1.zip` was built from
frozen inputs after 25 development suites passed. Its actual extracted archive
passed content/hash/entry/template checks and 13 install-maintenance scenarios.
The candidate contains 199 files (1,826,131 bytes), with an empty enabled list.
Sibling `.sha256`, `.files.json` and `.verification.json` files identify its bytes
and automatic verification. It is a candidate, not a published or player-accepted
release. Existing `dist/SixtyFour-ModLoader.zip` was not replaced.
