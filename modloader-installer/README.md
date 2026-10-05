# Sixty Four ModLoader Installer

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
- runs `verify.ps1 -LoaderOnly` and treats a nonzero exit as installation failure

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
