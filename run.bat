@echo off
setlocal
title Big Binary Tech - Lead Engine
color 0B

echo ===============================================================================
echo                BIG BINARY TECH - LEAD INTELLIGENCE ENGINE
echo         Zero-API-Cost Lead Discovery, Web Audit and ML Propensity Scorer
echo ===============================================================================
echo.

:: 1. Add common Node.js install directories to PATH
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\node\node.exe" set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"

:: 2. Add common Git install directories to PATH
if exist "C:\Program Files\Git\cmd\git.exe" set "PATH=C:\Program Files\Git\cmd;%PATH%"
if exist "C:\Program Files\Git\bin\git.exe" set "PATH=C:\Program Files\Git\bin;%PATH%"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

:: 3. Automatically pull latest updates and leads from GitHub
where git >nul 2>nul
if %errorlevel% equ 0 (
    if exist ".git\" (
        echo [*] Auto-Sync: Pulling latest leads and code from GitHub...
        git pull origin master
        if errorlevel 1 (
            git pull origin main
        )
        echo [*] Repository sync complete!
        echo.
    )
)

:: 4. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found on this computer!
    echo.
    echo Please install Node.js LTS from: https://nodejs.org
    echo Once installed, run this script again.
    echo.
    pause
    exit /b 1
)

:: 5. Check and install dependencies
if not exist "node_modules\" (
    echo [*] First run on this PC detected! Installing required dependencies...
    echo [*] This takes about 30 seconds...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to install npm packages.
        echo Please check your internet connection and run: npm install
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [*] Dependencies installed successfully!
    echo.
)

:: 6. Check for .env configuration
if not exist ".env" (
    if exist ".env.example" copy ".env.example" ".env" >nul 2>nul
    echo [i] Created default .env file.
)

:: 7. Auto-tunnel via ngrok so Clay can POST enrichment callbacks back in real-time
where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] ngrok detected — starting public tunnel for Clay callbacks...
    start "" /B ngrok http 3000 >nul 2>nul
    :: Give ngrok 4 seconds to establish the tunnel
    timeout /t 4 /nobreak >nul
    :: Query ngrok local API for the HTTPS public URL
    for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "(Invoke-RestMethod http://localhost:4040/api/tunnels -ErrorAction SilentlyContinue).tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1 -ExpandProperty public_url"`) do set "NGROK_URL=%%U"
    if defined NGROK_URL (
        set "APP_URL=%NGROK_URL%"
        echo [*] Clay callback URL set: %NGROK_URL%
        echo [*] Clay will auto-update leads in real-time via this public URL.
    ) else (
        echo [i] ngrok tunnel not ready — Clay callbacks will fall back to localhost.
        echo [i] Make sure you have run: ngrok config add-authtoken YOUR_TOKEN
    )
) else (
    echo [i] ngrok not found — Clay real-time auto-update disabled.
    echo [i] Install ngrok from https://ngrok.com and add it to your PATH to enable it.
)
echo.

echo [*] Starting Lead Intelligence Server on port 3000...
echo [*] Opening Dashboard at: http://localhost:3000
echo.

:: 8. Launch browser after 2 seconds
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 9. Start Express Server (inherits APP_URL env var set above)
node src/server/app.js

echo.
echo [!] Server stopped.
pause
