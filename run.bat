@echo off
setlocal enabledelayedexpansion
title Big Binary Tech - Lead Engine
color 0B

echo ===============================================================================
echo                BIG BINARY TECH - LEAD INTELLIGENCE ENGINE
echo         Zero-API-Cost Lead Discovery, Web Audit and ML Propensity Scorer
echo ===============================================================================
echo.

rem 1. Add common Node.js install directories to PATH
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"

rem 2. Add common Git install directories to PATH
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"
if exist "C:\Program Files\Git\bin\git.exe" set "PATH=C:\Program Files\Git\bin;%PATH%"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

rem 3. Pull latest code from GitHub. Live data lives in MongoDB Atlas, not git,
rem    so back up + discard the local data mirrors first (they never conflict).
where git >nul 2>nul
if %errorlevel% equ 0 (
    if exist ".git\" (
        echo [*] Auto-Sync: Pulling latest code from GitHub...
        if exist "data\leads_db.json" copy /Y "data\leads_db.json" "data\leads_db.backup.json" >nul 2>nul
        git checkout -- data/leads_db.json data/call_logs.json >nul 2>nul
        git pull origin master
        if errorlevel 1 git pull origin main
        echo [*] Repository sync complete.
        echo.
    )
)

rem 4. Check Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on this computer.
    echo Install Node.js LTS from https://nodejs.org then run this script again.
    echo.
    pause
    exit /b 1
)

rem 5. Install dependencies on first run
if not exist "node_modules\" (
    echo [*] First run on this PC - installing dependencies...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Check your connection and run: npm install
        echo.
        pause
        exit /b 1
    )
    echo [*] Dependencies installed.
    echo.
)

rem 6. Ensure a .env exists
if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul 2>nul
    echo [i] Created default .env file.
)

rem 7. Auto-tunnel via ngrok on the reserved domain (stable URL for Clay every launch).
rem    Registers the authtoken from .env if present.
set "NGROK_DOMAIN=triage-garbage-sultry.ngrok-free.dev"
where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"ngrok_auth_token=" ".env"`) do set "NGROK_TOKEN=%%B"
    if defined NGROK_TOKEN ngrok config add-authtoken !NGROK_TOKEN! >nul 2>nul
    echo [*] Starting ngrok tunnel on !NGROK_DOMAIN! ...
    start "" /B ngrok http 3000 --url https://!NGROK_DOMAIN! >nul 2>nul
    set "APP_URL=https://!NGROK_DOMAIN!"
    echo [*] Clay callback URL: https://!NGROK_DOMAIN!/api/leads/sync
) else (
    echo [i] ngrok not found - real-time Clay callbacks disabled ^(local use still works^).
)
echo.

echo [*] Starting Lead Intelligence Server on port 3000...
echo [*] Dashboard will open at http://localhost:3000
echo.

rem 8. Open the browser a couple seconds after the server starts
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

rem 9. Start the Express server (inherits APP_URL set above)
node src/server/app.js

echo.
echo [x] Server stopped.
pause
