@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "PACKAGE_ROOT=%SCRIPT_DIR%.."
for %%I in ("%PACKAGE_ROOT%") do set "PACKAGE_ROOT=%%~fI"
if "%PACKAGE_ROOT:~-1%"=="\" set "PACKAGE_ROOT=%PACKAGE_ROOT:~0,-1%"
set "PARENT_ROOT=%PACKAGE_ROOT%\.."
for %%I in ("%PARENT_ROOT%") do set "PARENT_ROOT=%%~fI"
if "%PARENT_ROOT:~-1%"=="\" set "PARENT_ROOT=%PARENT_ROOT:~0,-1%"
set "GAME_ROOT=%PACKAGE_ROOT%"
set "SOURCE_ROOT=%PACKAGE_ROOT%"
set "NESTED_PACKAGE="

if not exist "%GAME_ROOT%\resources\app\game" (
  if exist "%PARENT_ROOT%\resources\app\game" if exist "%PACKAGE_ROOT%\resources\app\game\modloader\loader.js" (
    set "GAME_ROOT=%PARENT_ROOT%"
    set "NESTED_PACKAGE=1"
  )
)

cd /d "%GAME_ROOT%"
if "%GAME_ROOT:~-1%"=="\" set "GAME_ROOT=%GAME_ROOT:~0,-1%"

echo Sixty Four ModLoader Installer
echo.

if defined NESTED_PACKAGE (
  echo Detected a nested extracted ModLoader package.
  echo Package: %SOURCE_ROOT%
  echo Game:    %GAME_ROOT%
  echo.
)

if not exist "resources\app\game" (
  echo ERROR: Could not find the Sixty Four win-unpacked folder.
  echo Expected to find: %GAME_ROOT%\resources\app\game
  echo.
  echo Extract this ModLoader package into the Sixty Four win-unpacked folder, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "%SOURCE_ROOT%\resources\app\game\modloader\loader.js" (
  echo ERROR: Missing ModLoader package files.
  echo Expected to find: %SOURCE_ROOT%\resources\app\game\modloader\loader.js
  echo.
  pause
  exit /b 1
)

if not exist "%SCRIPT_DIR%install.ps1" (
  echo ERROR: Missing %SCRIPT_DIR%install.ps1
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1" -GameRoot "%GAME_ROOT%" -SourceRoot "%SOURCE_ROOT%" -Force
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Install finished. Start the game and press Ctrl+M to open the ModLoader panel.
) else (
  echo Install failed. See the message above.
)
echo.
pause
exit /b %RESULT%
