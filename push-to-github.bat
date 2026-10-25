@echo off
title Push Nexus Flow Portable to GitHub
cd /d "%~dp0..\nexus-flow-portable"

echo ============================================================== 
echo       PUSH NEXUS-FLOW-PORTABLE TO GITHUB REPOSITORY          
echo ============================================================== 
echo.

git status
echo.

git remote -v | findstr "origin" >nul 2>nul
if errorlevel 1 (
    echo ============================================================== 
    echo   [SETUP REQUIRED] Git remote is not configured yet!          
    echo ============================================================== 
    echo   1. Create a repository on GitHub (e.g. nexus-flow-portable) 
    echo   2. Run this command once in command prompt:                 
    echo      git remote add origin https://github.com/YOUR_USER/nexus-flow-portable.git
    echo   3. Then run this script again to push!                      
    echo ============================================================== 
    echo.
    pause
    exit /b 1
)

echo [*] Staging all files...
git add -A
git commit -m "Update portable client release" >nul 2>&1
echo [*] Pushing to GitHub (origin main)...
git push origin main
if not errorlevel 1 (
    echo.
    echo ============================================================== 
    echo   [OK] Successfully pushed to GitHub!                         
    echo   Your traders will now receive these updates automatically.   
    echo ============================================================== 
) else (
    echo.
    echo [ERROR] Git push failed. Please check your internet connection or GitHub credentials.
)

echo.
pause
