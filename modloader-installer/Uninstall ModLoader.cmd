@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "GAME_ROOT=%~dp0.."
for %%I in ("%GAME_ROOT%") do set "GAME_ROOT=%%~fI"
cd /d "%GAME_ROOT%"
if "%GAME_ROOT:~-1%"=="\" set "GAME_ROOT=%GAME_ROOT:~0,-1%"

echo Sixty Four ModLoader Uninstaller
echo.

if not exist "resources\app\game" (
  echo ERROR: This file must be run from the Sixty Four win-unpacked\modloader-installer folder.
  echo Expected to find: %GAME_ROOT%\resources\app\game
  echo.
  pause
  exit /b 1
)

if not exist "%SCRIPT_DIR%uninstall.ps1" (
  echo ERROR: Missing %SCRIPT_DIR%uninstall.ps1
  echo.
  pause
  exit /b 1
)

echo This will restore the latest ModLoader install backup.
echo Your mods folder is kept unless the installer backup says otherwise.
echo.
choice /C YN /N /M "Continue? [Y/N] "
if errorlevel 2 (
  echo Cancelled.
  echo.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%uninstall.ps1" -GameRoot "%GAME_ROOT%" -ConfirmUninstall
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Uninstall finished.
) else (
  echo Uninstall failed. See the message above.
)
echo.
pause
exit /b %RESULT%
