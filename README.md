# Sixty Four ModLoader

ModLoader **0.5.0** provides an in-game `Ctrl+M` panel, configurable Mods,
shared APIs, and installation tools for the desktop **Sixty Four 1.3** series.

## Download

Download `SixtyFour-ModLoader.zip` from [GitHub Releases](https://github.com/MrCattail/Sixty_Four_ModLoader/releases).
Check the version and SHA-256 published with that release. A source version on
this branch does not mean a matching player package has been published yet.

## Install

1. Close the game and extract the player ZIP into its `win-unpacked` folder.
2. Open `modloader-installer` and run `Install ModLoader.cmd`.
3. Start the game.
4. Press `Ctrl+M` to open the ModLoader panel.

New player packages start with all Mods disabled. Enable the Mods you want.

The folder should contain `sixtyfour.exe`, `resources`, and
`modloader-installer` at the same level. The installer also detects a package
extracted into a nested `SixtyFour-ModLoader` folder.

## Update

Place the newer player ZIP in `modloader-installer` and run `update.cmd`.
The updater selects a newer package by version, then build time, and asks whether
to replace installed Mods. Follow the prompts and restart the game afterward.

## Features and documentation

- Mod panel with search, settings, translations, and configurable layouts.
- Manifest-based loading with dependencies, configuration, and lifecycle hooks.
- Shared Settings, Window, Storage, Library, Snapshot, Shortcut, and Render APIs.
- Bundled interface, gameplay, localization, audio, and editor Mods.
- Installation and update verification with backup and rollback support.

See the [installer guide](modloader-installer/README.md),
[Loader API guide](resources/app/game/modloader/README.md), and each Mod's
documentation under [`resources/app/game/mods`](resources/app/game/mods).

## Source checkout and player package

The current source tree excludes the game executable, assets, and copied core
game scripts. The installer patches the player's own local installation.
This repository retains two development histories; older commits contain game
files excluded from the current tree and player package.

Development sources retain P2P experiments, diagnostic tools, and tests. The
player package excludes P2P, archived Mods, diagnostics, Mod tests, and most
development tools. Templates and runtime verification helpers are retained.
P2P is not part of the 0.5.0 player package.

Run source development checks from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\resources\app\game\modloader\tools\verify-development.ps1
```

Some checks require a separately prepared local game installation or optional
dependencies. Automated checks do not establish real Steam Cloud, cross-device,
or complete in-game acceptance. See the
[development tools guide](resources/app/game/modloader/tools/README.md).

Build a player package locally:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\build-package.ps1 -OutputPath .\dist\SixtyFour-ModLoader.zip -CleanEnabled
```

The build generates package metadata and a player-specific README. Keep source
checks, package verification, and in-game acceptance separate before publishing.

## Command-Line Install

You can also install with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\install.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

See `modloader-installer/README.md` and
`resources/app/game/modloader/README.md` for details.

## License

[MIT](LICENSE). Third-party components retain their own license notices.
