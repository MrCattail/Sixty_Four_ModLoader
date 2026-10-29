@echo off
setlocal
for %%I in ("%~dp0..\..\..\..\..") do set "GAME_ROOT=%%~fI"
if not exist "%GAME_ROOT%\sixtyfour.exe" (
  echo Sixty Four executable was not found. Keep this launcher inside modloader\tools.
  pause
  exit /b 1
)
tasklist /FI "IMAGENAME eq sixtyfour.exe" /NH 2>NUL | find /I "sixtyfour.exe" >NUL
if not errorlevel 1 (
  echo Close all Sixty Four windows first, then run this launcher again.
  echo No running process has been stopped.
  pause
  exit /b 1
)
echo Starting a one-run 60-second startup probe.
echo Reports: resources\app\game\modloader\state\startup-probes
start "" /D "%GAME_ROOT%" "%GAME_ROOT%\sixtyfour.exe" --modloader-startup-probe
endlocal
