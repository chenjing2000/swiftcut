@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Test-T06.ps1"
echo.
echo Test finished. Press any key to close this window.
pause >nul
endlocal
