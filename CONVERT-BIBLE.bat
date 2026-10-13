@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"

echo SimpleWorship .db to .swbible Converter
echo ========================================
echo.

if not "%~1"=="" goto :arguments

echo Enter the full path to a compatible SQLite Bible .db file.
echo You can also cancel and drag the .db file onto CONVERT-BIBLE.bat.
echo.
set "BIBLE_INPUT="
set /p "BIBLE_INPUT=Input .db path: "
set "BIBLE_INPUT=%BIBLE_INPUT:"=%"
if not defined BIBLE_INPUT goto :cancelled

set "BIBLE_OUTPUT="
set /p "BIBLE_OUTPUT=Output .swbible path (Enter = name it from the Bible version): "
set "BIBLE_OUTPUT=%BIBLE_OUTPUT:"=%"
goto :ready

:arguments
if not "%~4"=="" goto :usage
set "BIBLE_INPUT=%~f1"
set "BIBLE_OUTPUT="
set "BIBLE_FORCE="

if "%~2"=="" goto :ready
if /i "%~2"=="--force" (
  if not "%~3"=="" goto :usage
  set "BIBLE_FORCE=--force"
  goto :ready
)

set "BIBLE_OUTPUT=%~f2"
if "%~3"=="" goto :ready
if /i not "%~3"=="--force" goto :usage
set "BIBLE_FORCE=--force"

:ready
if not exist "%BIBLE_INPUT%" (
  echo Input file not found:
  echo   %BIBLE_INPUT%
  goto :failed
)

for %%F in ("%BIBLE_INPUT%") do set "BIBLE_INPUT_EXTENSION=%%~xF"
if /i not "%BIBLE_INPUT_EXTENSION%"==".db" (
  echo The input file must end in .db
  goto :failed
)

if not defined BIBLE_OUTPUT goto :check_tools
for %%F in ("%BIBLE_OUTPUT%") do set "BIBLE_OUTPUT_EXTENSION=%%~xF"
if /i not "%BIBLE_OUTPUT_EXTENSION%"==".swbible" (
  echo The output file must end in .swbible
  goto :failed
)

:check_tools
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org and try again.
  goto :failed
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm is not available. Reinstall Node.js LTS and try again.
  goto :failed
)

if not exist "node_modules\sql.js\dist\sql-wasm.wasm" (
  echo Installing project dependencies first...
  call npm ci
  if errorlevel 1 goto :failed
)

echo.
echo Converting and validating the Bible package...
if defined BIBLE_OUTPUT (
  if defined BIBLE_FORCE (
    call npm run bible:convert -- "%BIBLE_INPUT%" "%BIBLE_OUTPUT%" --force
  ) else (
    call npm run bible:convert -- "%BIBLE_INPUT%" "%BIBLE_OUTPUT%"
  )
) else (
  if defined BIBLE_FORCE (
    call npm run bible:convert -- "%BIBLE_INPUT%" --force
  ) else (
    call npm run bible:convert -- "%BIBLE_INPUT%"
  )
)
if errorlevel 1 goto :failed

echo.
echo Conversion complete. Import the created .swbible file into SimpleWorship.
pause
exit /b 0

:usage
echo Usage:
echo   CONVERT-BIBLE.bat "C:\Bibles\bible.db"
echo   CONVERT-BIBLE.bat "C:\Bibles\bible.db" "C:\Bibles\RTPV05.swbible"
echo   CONVERT-BIBLE.bat "C:\Bibles\bible.db" "C:\Bibles\RTPV05.swbible" --force
goto :failed

:cancelled
echo.
echo Conversion cancelled.
exit /b 0

:failed
echo.
echo Conversion was not completed. See the message above.
pause
exit /b 1
