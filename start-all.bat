@echo off
title Nexus Flow - All Systems Launcher

echo ============================================================== 
echo    NEXUS FLOW - ALL-IN-ONE LAUNCHER (TERMINAL + HFT WIRE)     
echo ============================================================== 
echo.

cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto :NODE_READY

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :NODE_READY
)

if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    goto :NODE_READY
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    goto :NODE_READY
)

echo ============================================================== 
echo  [ERROR] Node.js is NOT installed on this computer!           
echo ============================================================== 
echo.
echo This trading terminal requires Node.js to run.
echo.
echo 1. Open your browser and go to: https://nodejs.org/
echo 2. Download and install the LTS version.
echo 3. After installing, double-click start-all.bat again.
echo.
pause
exit /b 1

:NODE_READY
echo [*] Node.js detected successfully.
echo.

if exist "tools\serve.cjs" goto :DEPS_OK

if exist package.json goto :PACKAGE_OK
echo [ERROR] package.json not found in this folder!
echo Please make sure the entire nexus-flow folder was extracted properly.
pause
exit /b 1

:PACKAGE_OK
if exist "node_modules\vite\bin\vite.js" goto :DEPS_OK
echo [*] Setting up dependencies for this PC, please wait...
call npm install

:DEPS_OK
:: Check for online updates from GitHub before launching (preserves hybrid local architecture)
if exist "tools\auto-updater.cjs" (
    node tools\auto-updater.cjs
)

:: Launch Nexus Flow Terminal UI (opens browser at http://localhost:5173)
:: Note: The HFT Sniper Engine executes on your dedicated remote cloud server (Render / VPS)
echo [*] Launching Nexus Flow Terminal UI on port 5173...
call start.bat
