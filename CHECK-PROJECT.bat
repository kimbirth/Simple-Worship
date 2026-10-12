@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_SKIP_BINARY_DOWNLOAD=
set npm_config_ignore_scripts=false

if not exist node_modules (
  echo Installing dependencies first...
  call npm ci
  if errorlevel 1 goto :failed
)

call ENSURE-ELECTRON.bat
if errorlevel 1 goto :failed

call npm run check
if errorlevel 1 goto :failed

echo.
echo Checks passed. The project is ready to run.
pause
exit /b 0

:failed
echo.
echo A check failed. The full error is shown above.
pause
exit /b 1
