@echo off
cd /d "%~dp0..\.."
echo Building Tailwind CSS...
call npm run css:build
echo Building Tauri...
cd src-tauri
cargo tauri build
echo Done!
pause
