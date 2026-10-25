@echo off
title Push Nexus Flow Portable to GitHub
cd /d "%~dp0..\nexus-flow-portable"

echo ============================================================== 
echo       PUSH NEXUS-FLOW-PORTABLE TO GITHUB REPOSITORY          
echo ============================================================== 
echo.

git status
echo.

echo [*] Staging all changes...
git add -A
git commit -m "Update portable client release" >nul 2>&1

echo [*] Syncing with remote repository...
git -c credential.helper= pull --rebase origin main >nul 2>&1

echo [*] Pushing to GitHub (origin main)...
git -c credential.helper= push origin main
if not errorlevel 1 (
    echo.
    echo ============================================================== 
    echo   [OK] Successfully pushed to GitHub!                         
    echo   Your traders will now receive these updates automatically.   
    echo ============================================================== 
) else (
    echo.
    echo [ERROR] Git push failed. Please check your internet connection.
)

echo.
pause
