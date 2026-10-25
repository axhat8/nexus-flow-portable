@echo off
title Nexus Flow Terminal 007

echo ============================================================== 
echo    NEXUS FLOW - TERMINAL 007 (High-Speed Trading Terminal)    
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
echo 3. After installing, double-click start.bat again.
echo.
pause
exit /b 1

:NODE_READY
echo [*] Node.js detected successfully.
echo.

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
:: Clean up any hung process on port 5173 before launching
echo [*] Checking port 5173 availability...
powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) | Where-Object OwningProcess -gt 4 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; exit 0" >nul 2>&1

echo [*] Opening browser in background...
start "" cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:5173"

echo ============================================================== 
echo   [OK] STARTING NEXUS FLOW TERMINAL...                         
echo   Browser will open automatically at: http://localhost:5173    
echo.                                                               
echo   Keep this window open while trading!                         
echo ============================================================== 
echo.

if exist "tools\serve.cjs" (
    node tools\serve.cjs 5173
) else (
    call npm run dev
)
if errorlevel 1 (
    echo.
    echo [ERROR] Terminal server stopped.
    pause
)
