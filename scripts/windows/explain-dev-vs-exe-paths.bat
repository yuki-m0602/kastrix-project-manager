@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0..\.."
set "ROOT=%CD%"

set "EXE_DEBUG=%ROOT%\target\debug\kastrix.exe"
set "EXE_RELEASE=%ROOT%\target\release\kastrix.exe"
set "UI_DIR=%ROOT%\ui"
set "TAURI_CONF=%ROOT%\src-tauri\tauri.conf.json"
set "LOG_OUT=%TEMP%\kastrix_dev_exe_paths.log"
set "APP_DATA_GUESS=%APPDATA%\com.kastrix.desktop"
set "DOC=%~dp0explain-dev-vs-exe-paths.ja.txt"

call :run_out
call :run_out >> "%LOG_OUT%"

echo.
echo 上記をログに保存しました:
echo   %LOG_OUT%
echo.
pause
goto :eof

:run_out
if exist "%DOC%" (type "%DOC%") else (echo [WARN] 見つかりません: %DOC%)
echo.
echo ------------------------------------------------------------------------
echo  このマシン・このフォルダで解決したパス
echo ------------------------------------------------------------------------
echo   REPO_ROOT          %ROOT%
echo   TAURI_CONF         %TAURI_CONF%
echo   UI_DIR             %UI_DIR%
echo   UI_INDEX           %UI_DIR%\index.html
echo.
if exist "%EXE_DEBUG%" (set "D_OK=yes") else (set "D_OK=missing")
if exist "%EXE_RELEASE%" (set "R_OK=yes") else (set "R_OK=missing")
echo   EXE_DEBUG          %EXE_DEBUG%  [%D_OK%]
echo   EXE_RELEASE        %EXE_RELEASE%  [%R_OK%]
echo.
echo   APP_DATA guess     %APP_DATA_GUESS%
echo   DB file guess      %APP_DATA_GUESS%\kastrix.db
echo.
echo ------------------------------------------------------------------------
echo  参考: 環境（このコンソール）
echo ------------------------------------------------------------------------
echo   CD                 %CD%
echo   TEMP               %TEMP%
exit /b 0
