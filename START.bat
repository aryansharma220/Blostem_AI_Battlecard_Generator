@echo off
REM Blostem Battlecard — Quick Start Script (Windows)
REM This script installs dependencies and starts the dev server

echo.
echo ========================================
echo  Blostem Competitive Intelligence Demo
echo ========================================
echo.

REM Check if Node.js is installed
if not exist "%ProgramFiles%\nodejs\node.exe" (
  if not exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    echo ERROR: Node.js is not installed.
    echo Please download Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
  )
)

echo [1/3] Checking Node.js version...
node --version
npm --version

echo.
echo [2/3] Installing dependencies (this may take 1-2 minutes)...
call npm install --legacy-peer-deps

if errorlevel 1 (
  echo ERROR: npm install failed. Check internet connection and try again.
  pause
  exit /b 1
)

echo.
echo [3/3] Starting development server...
echo.
echo ========================================
echo  Server is running!
echo  
echo  Open: http://localhost:3000
echo  
echo  Try these competitors:
echo    - Razorpay
echo    - Paytm
echo    - PhonePe
echo ========================================
echo.

call npm run dev

pause
