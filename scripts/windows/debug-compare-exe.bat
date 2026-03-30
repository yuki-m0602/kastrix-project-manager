@echo off
cd /d "%~dp0..\.."
set "ROOT=%CD%"
set KASTRIX_DEBUG_TEAM_CONFLICT=1

set EXE=%ROOT%\target\release\kastrix.exe
if not exist "%EXE%" (
  echo [ERROR] 見つかりません: %EXE%
  echo         先に scripts\windows\build.bat または npx tauri build を実行してください。
  pause
  exit /b 1
)

echo.
echo ========================================================================
echo  Kastrix — RELEASE 側（target\release\kastrix.exe）
echo ========================================================================
echo  環境変数: KASTRIX_DEBUG_TEAM_CONFLICT=1
echo  本番 exe はコンソール無しのため、詳細はログファイルを見てください。
echo  ログファイル（DEV / EXE 共通・追記）:
echo    %TEMP%\kastrix_team_conflict.log
echo  比較のしかた: debug-compare-dev.bat の画面に書いてあります。
echo ========================================================================
echo.

echo 起動中: %EXE%
start "Kastrix" /wait "%EXE%"

echo.
echo アプリを終了しました。ログを開きます（メモ帳）。
echo ファイル: %TEMP%\kastrix_team_conflict.log
notepad "%TEMP%\kastrix_team_conflict.log"
