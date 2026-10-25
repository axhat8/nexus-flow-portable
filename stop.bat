@echo off
title Stop Nexus Flow Terminal & Edge Daemon
cd /d "%~dp0"

echo ==============================================================
echo    STOPPING NEXUS FLOW - TERMINAL 007 & HFT EDGE DAEMON
echo ==============================================================
echo.

set FOUND=0

:: 1. Terminate any process listening on port 5173 (Terminal UI)
echo [*] Stopping Terminal UI processes on port 5173...
powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) | Where-Object OwningProcess -gt 4 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; exit 0" >nul 2>&1

:: 2. Terminate any process listening on port 5174 (HFT Edge Daemon)
echo [*] Stopping HFT Edge Daemon processes on port 5174...
powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) | Where-Object OwningProcess -gt 4 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; exit 0" >nul 2>&1

:: 3. Terminate background windows by title
taskkill /FI "WINDOWTITLE eq Nexus Flow Terminal (Port 5173)*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Nexus Flow HFT Edge Daemon*" /F >nul 2>&1

echo.
if "%FOUND%"=="1" (
    echo [✓] All Nexus Flow terminal and edge daemon processes stopped.
) else (
    echo [i] No active servers were found running on ports 5173 or 5174.
)

echo.
echo ==============================================================
timeout /t 3 >nul
