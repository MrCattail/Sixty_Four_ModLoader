@echo off
setlocal
set "GAME_ROOT=%~dp0.."
for %%I in ("%GAME_ROOT%") do set "GAME_ROOT=%%~fI"
cd /d "%GAME_ROOT%"
if "%GAME_ROOT:~-1%"=="\" set "GAME_ROOT=%GAME_ROOT:~0,-1%"

echo Sixty Four ModLoader Verify
echo.

if not exist "resources\app\game\modloader\tools\verify.ps1" (
  echo ERROR: Missing resources\app\game\modloader\tools\verify.ps1
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%GAME_ROOT%\resources\app\game\modloader\tools\verify.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
pause
exit /b %RESULT%
