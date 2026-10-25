@echo off
title Nexus Flow - Online 1-Click Updater
cd /d "%~dp0"

echo ============================================================== 
echo              NEXUS FLOW - 1-CLICK ONLINE UPDATER             
echo ============================================================== 
echo.

:: Detect Node.js path if not in current PATH
where node >nul 2>nul
if errorlevel 1 (
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
    if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
)

:: Run the Hybrid Auto-Updater
if exist "tools\auto-updater.cjs" (
    node tools\auto-updater.cjs
) else if exist ".git" (
    echo [*] Checking for updates via Git...
    git pull origin main
) else (
    echo [!] Updater script tools\auto-updater.cjs not found.
)

echo.
echo ============================================================== 
echo   Update check completed!
echo   Press any key to launch Nexus Flow Terminal...
echo ============================================================== 
echo.
pause >nul
call start-all.bat
