@echo off
title Big Binary Tech - Lead Intelligence & SDR Engine
color 0B

echo ===============================================================================
echo                BIG BINARY TECH - LEAD INTELLIGENCE ENGINE
echo         Zero-API-Cost Lead Discovery, Web Audit ^& ML Propensity Scorer
echo ===============================================================================
echo.

:: 1. Add common Node.js install directories to PATH
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
)
if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
)

:: 2. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on this computer!
    echo.
    echo Please install Node.js (LTS version) from: https://nodejs.org
    echo Once installed, double-click run.bat again.
    echo.
    pause
    exit /b 1
)

:: 3. Check and install dependencies
if not exist "node_modules\" (
    echo [*] First run on this PC detected! Installing required dependencies...
    echo [*] This takes about 30 seconds...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install npm packages.
        echo Please check your internet connection and try running: npm install
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [*] Dependencies installed successfully!
    echo.
)

:: 4. Check for .env configuration
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul 2>nul
    )
    echo [i] Created default .env file.
)

echo [*] Starting Lead Intelligence Server on port 3000...
echo [*] Opening Dashboard at: http://localhost:3000
echo.

:: 5. Launch browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 6. Start Express Server
node src/server/app.js

echo.
echo [!] Server stopped.
pause
