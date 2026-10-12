@echo off
setlocal
cd /d "%~dp0"

set ELECTRON_SKIP_BINARY_DOWNLOAD=
set npm_config_ignore_scripts=false

if exist "node_modules\electron\dist\electron.exe" exit /b 0

if not exist "node_modules\electron\install.js" (
  echo Electron package files are missing. Restoring dependencies...
  call npm ci
  if errorlevel 1 exit /b 1
)

echo Electron executable is missing. Downloading it now...
call npm run electron:install
if exist "node_modules\electron\dist\electron.exe" (
  echo Electron downloaded successfully.
  exit /b 0
)

echo.
echo Electron could not be downloaded.
echo Check your internet connection and Windows Security quarantine, then try again.
exit /b 1
