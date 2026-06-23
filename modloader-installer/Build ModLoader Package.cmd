@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "GAME_ROOT=%~dp0.."
for %%I in ("%GAME_ROOT%") do set "GAME_ROOT=%%~fI"
cd /d "%GAME_ROOT%"
if "%GAME_ROOT:~-1%"=="\" set "GAME_ROOT=%GAME_ROOT:~0,-1%"

echo Sixty Four ModLoader Package Builder
echo.

if not exist "%SCRIPT_DIR%build-package.ps1" (
  echo ERROR: Missing %SCRIPT_DIR%build-package.ps1
  echo.
  pause
  exit /b 1
)

echo This will create a clean package for new players:
echo dist\SixtyFour-ModLoader.zip
echo.
echo The package will use an empty mods\enabled.json.
echo Your current game's enabled.json will not be changed.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%build-package.ps1" -Clean -CleanEnabled
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Package created:
  echo %GAME_ROOT%\dist\SixtyFour-ModLoader.zip
) else (
  echo Package build failed. See the message above.
)
echo.
pause
exit /b %RESULT%
