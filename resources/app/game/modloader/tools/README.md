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

Checks that loader hook points still exist:

```powershell
.\resources\app\game\modloader\tools\verify.ps1
```

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