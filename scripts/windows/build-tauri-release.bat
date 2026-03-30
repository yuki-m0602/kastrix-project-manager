@echo off
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo [1/2] npm run build:ui
call npm run build:ui
if errorlevel 1 (
  echo.
  echo ERROR: build:ui failed
  exit /b 1
)

echo.
echo [2/2] npx tauri build
call npx tauri build
if errorlevel 1 (
  echo.
  echo ERROR: tauri build failed
  exit /b 1
)

echo.
echo Done.
exit /b 0
