@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_SKIP_BINARY_DOWNLOAD=
set npm_config_ignore_scripts=false

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org then run this file again.
  goto :failed
)

if not exist node_modules (
  echo Installing SimpleWorship dependencies...
  call npm ci
  if errorlevel 1 goto :failed
)

call ENSURE-ELECTRON.bat
if errorlevel 1 goto :failed

echo Starting SimpleWorship...
call npm run dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo SimpleWorship could not start. The error is shown above.
pause
exit /b 1
