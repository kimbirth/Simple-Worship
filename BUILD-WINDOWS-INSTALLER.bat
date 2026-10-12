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

echo.
echo This creates an UNSIGNED local test installer only.
echo Official releases are built on GitHub and signed through SignPath.
echo.
call npm run build:win:unsigned
if errorlevel 1 goto :failed

echo.
echo Unsigned test installer created in the release folder.
echo Do not distribute it as an official release.
pause
exit /b 0

:failed
echo.
echo The installer could not be built. The complete error is shown above.
pause
exit /b 1
