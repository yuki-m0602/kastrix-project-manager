@echo off
cd /d "%~dp0..\.."
set "ROOT=%CD%"
set KASTRIX_DEBUG_TEAM_CONFLICT=1

echo.
echo ========================================================================
echo  Kastrix — DEV 側（tauri dev / debug ビルド）
echo ========================================================================
echo  環境変数: KASTRIX_DEBUG_TEAM_CONFLICT=1
echo  コンソール: このウィンドウに [DEV_debug] 付きの行が出ます。
echo  ログファイル（DEV / EXE 共通・追記）:
echo    %TEMP%\kastrix_team_conflict.log
echo  比較のしかた:
echo    1. まずこのバッチで起動し、競合を再現する
echo    2. 終了後、debug-compare-exe.bat で同じ操作をする
echo    3. ログの [DEV_debug] と [RELEASE_exe] の有無を並べて見る
echo        - 片方にしか emit JSON が無い → Rust 側が片方でしか emit していない
echo        - 両方あるのにモーダルが片方だけ → WebView / フロント側を疑う
echo ========================================================================
echo.

start "Tailwind" cmd /k "cd /d %ROOT% && npm run css:watch"
npx tauri dev
