@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM 使い方: 引数にラベルを付けるとログ先頭に書きます（例: DEV  EXE  SHORTCUT）
set "LABEL=%~1"
if "%LABEL%"=="" set "LABEL=no-label"

for /f %%i in ('powershell -NoProfile -Command "[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')"') do set "TS=%%i"
set "OUT=%TEMP%\kastrix_launch_context_%TS%_%RANDOM%.txt"

(
  echo === Kastrix launch context snapshot ===
  echo UTC-ish stamp: %TS%
  echo LABEL: %LABEL%
  echo.
  echo --- Where this batch was started from ---
  echo BAT_DIR: %~dp0
  echo CD:      %CD%
  echo.
  echo --- Common dirs ---
  echo USERPROFILE: %USERPROFILE%
  echo APPDATA:     %APPDATA%
  echo LOCALAPPDATA:%LOCALAPPDATA%
  echo TEMP:        %TEMP%
  echo.
  echo --- Full environment ^(for diff with another snapshot^) ---
  set
) > "%OUT%"

echo 保存しました:
echo   %OUT%
echo.
echo 比較のしかた:
echo   1^) dev を起動する前に、このバッチを「dev と同じ開き方」で実行し LABEL に DEV
echo   2^) exe を試す前に、別の cmd やショートカットの「開始場所」で同様に LABEL に EXE
echo   3^) 2 つのテキストを差分比較（PATH・CD・独自環境変数の差が出やすい）
echo.
pause
