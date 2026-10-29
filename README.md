# Sixty Four ModLoader

<p align="center">
  <a href="https://github.com/MrCattail/Sixty_Four_ModLoader/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/LICENSE-MIT-55aa00?style=for-the-badge" alt="License MIT">
  </a>
  <img src="https://img.shields.io/badge/MODLOADER-0.5.0-008fd5?style=for-the-badge" alt="ModLoader 0.5.0">
  <img src="https://img.shields.io/badge/GAME%20VERSION-1.3-555555?style=for-the-badge" alt="Game version 1.3">
</p>

<p align="center">
  <a href="https://github.com/MrCattail/Sixty_Four_ModLoader/releases">
    <img src="https://img.shields.io/badge/DOWNLOAD-RELEASE-ff5f6d?style=for-the-badge&logo=github&logoColor=white" alt="Download release">
  </a>
</p>

A lightweight ModLoader and bundled mod collection for **Sixty Four**. It adds an in-game `Ctrl+M` mod panel, manifest-based mod loading, configurable quality-of-life tweaks, and a double-click installer/updater flow for players.

> The current source tree and player package do not include the game executable, game assets, or copied core game scripts. The installer patches the player's local game files in place. Earlier commits in the retained development history contain game files.

## Features

- In-game ModLoader panel opened with `Ctrl+M`
- Manifest-driven mods with dependencies, conflicts, config, translations, and reload policies
- Double-click install, update, uninstall, and verify scripts
- Local backup and restore flow for patched game files
- Bundled quality, interface, mechanic, locale, audio, and editor mods
- Release package builds that refuse to include copied core game source files

## Download

Download the latest `SixtyFour-ModLoader-0.5.0.zip` from:

[![Download latest release](https://img.shields.io/badge/Download-Latest%20Release-ff5f6d?style=for-the-badge&logo=github&logoColor=white)](https://github.com/MrCattail/Sixty_Four_ModLoader/releases)

To build a player package locally:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\build-package.ps1 -OutputPath .\dist\SixtyFour-ModLoader-0.5.0.zip -CleanEnabled
```

The generated package will be written to:

```text
dist\SixtyFour-ModLoader-0.5.0.zip
```

## Install

1. Extract `SixtyFour-ModLoader-0.5.0.zip` into the Sixty Four `win-unpacked` folder.
2. Open `modloader-installer`.
3. Double-click `Install ModLoader.cmd`.
4. Start the game.
5. Press `Ctrl+M` to open the ModLoader panel.

Your folder should look like this:

```text
win-unpacked\
  sixtyfour.exe
  resources\
  modloader-installer\
```

If Windows extracts the package into a nested `SixtyFour-ModLoader` folder, open that folder's `modloader-installer` directory and run `Install ModLoader.cmd` there. The installer can detect the parent game folder automatically.

## Update

1. Put any newer ModLoader zip inside `modloader-installer`.
2. Double-click `update.cmd`.
3. Choose whether to replace the current `mods` folder or keep your existing one.
4. Choose whether to delete the used zip after a successful update.

## Included Mods

| Mod | What it does |
| --- | --- |
| Better UIs | Adds shop categories, save slots, language menu improvements, and an in-game settings page. |
| Tweaks | A collection of quality-of-life, rendering, accessibility, camera, performance, and visual-tuning features. |
| Dynamic Details | Adds richer hover details, coordinate overlays, direction pointers, build countdowns, and resource-source views. |
| Resource Watcher | Adds a resource monitor window with resource selection and lock behavior. |
| Reality Pack | Optional gameplay/mechanic changes such as Reality automation, scan surges, Super Silo, and Hollow Stone time-flow modes. |
| Chat Timestamps | Adds timestamps to chat bubbles and saves them. |
| HyperX 12-Channel Audio Fix | Adds audio compatibility fallbacks for virtual surround / 12-channel output devices. |
| Optimized Simplified Chinese Locale | Adds an optimized Simplified Chinese language option. |
| World Editor | Adds an in-game world editing mode with selection, stats, copy, blueprint preview, validation, and library storage. |

The player package includes these nine Mods, disabled by default. Enable the Mods you want in the Ctrl+M panel. Template and example Mods are also included for mod authors. P2P experiments and diagnostics remain available in the development sources and are excluded from the player package.

## Command-Line Install

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modloader-installer\install.ps1 -GameRoot "D:\Steam\steamapps\common\Sixty Four\win-unpacked"
```

More installer details:

- [Installer README](modloader-installer/README.md)
- [ModLoader README](resources/app/game/modloader/README.md)

## Verify

After installing or updating, you can run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\resources\app\game\modloader\tools\verify.ps1
```

The verifier checks that the required ModLoader hooks and files are present. Package checks do not establish full in-game, Steam Cloud, or cross-device acceptance.

## Contributors

<a href="https://github.com/MrCattail/Sixty_Four_ModLoader/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=MrCattail/Sixty_Four_ModLoader&max=24" alt="Contributors">
</a>

## Disclaimer

This is an unofficial fan project. It is not affiliated with Sixty Four or its developers.

The MIT license in this repository applies only to the original ModLoader, installer, tooling, and mod code published here. Sixty Four, its original source code, executable, assets, name, and related rights remain the property of their respective owners.

## License

Released under the [MIT License](LICENSE).
