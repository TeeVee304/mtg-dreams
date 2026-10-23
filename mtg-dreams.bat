@echo off
rem Launches MTG Dreams from source, rebuilding it only when the code has changed. No installation needed.
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies ^(first run only^)...
  call npm install --no-fund --no-audit || goto :error
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Downloading Electron ^(first run only^)...
  call node node_modules\electron\install.js || goto :error
)

node scripts\needs-build.mjs
if errorlevel 1 (
  echo Building MTG Dreams...
  call npx electron-vite build --logLevel error || goto :error
  rem An open window would keep running the old build (a second launch only brings it forward): close it.
  powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '%CD%\node_modules\electron\dist\electron.exe' -and $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.WaitForExit(10000) | Out-Null }"
)

start "" "node_modules\electron\dist\electron.exe" .
exit /b 0

:error
echo.
echo Could not start the app - see the messages above.
pause
exit /b 1
