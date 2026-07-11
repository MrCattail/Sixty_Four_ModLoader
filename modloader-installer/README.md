# Sixty Four ModLoader Installer

Run these scripts from PowerShell. `GameRoot` is the game's `win-unpacked`
folder, for example:

```text
D:\Steam\steamapps\common\Sixty Four\win-unpacked
```


## Easy Double-Click Install

For most players:

1. Extract the ModLoader zip into the Sixty Four `win-unpacked` folder.
2. Open `modloader-installer`.
3. Double-click `Install ModLoader.cmd`.
4. Start the game and press `Ctrl+M`.

Use `modloader-installer\update.cmd` to update from a new `SixtyFour-ModLoader.zip`,
`modloader-installer\Uninstall ModLoader.cmd` to restore the latest install backup, or
`modloader-installer\Verify ModLoader.cmd` to check the loader hooks.

## Update

For installed players:

1. Put the new `SixtyFour-ModLoader.zip` in `modloader-installer`.
2. Double-click `update.cmd`.
3. Choose whether the package `mods` folder should replace the current `mods`
   folder.

Choose **Yes** only when you want the package mods to fully replace the current
mods folder. Choose **No** to update ModLoader while leaving the current mods
folder untouched.

Command-line options:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\update.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

Use `-ReplaceMods` or `-PreserveMods` to skip the prompt.

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