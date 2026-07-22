# Sixty Four ModLoader Installer

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

- backs up core files to `resources/app/game/modloader/state/install-backups/`
- patches the local game files with the ModLoader hooks
- copies `modloader/`
- copies `modloader-installer/` into the game folder for future updates
- copies mod folders and templates
- keeps an existing `mods/enabled.json`
- runs `verify.ps1`

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