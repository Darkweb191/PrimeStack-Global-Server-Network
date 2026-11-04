@echo off
title PrimeStack Switch
color 0b
mode con: cols=100 lines=45

echo.
echo ============================================
echo   PrimeStack Switch - Payment Platform
echo   14 Services ^| 16 Migrations ^| 9 Tests
echo ============================================
echo.

REM -- Step 1: Check Docker --
echo [1/4] Checking Docker...
where docker >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker not found on PATH.
    echo Adding Docker to PATH...
    set "PATH=C:\Users\prime\AppData\Local\Programs\DockerDesktop\resources\bin;%PATH%"
)
docker --version 2>nul
if errorlevel 1 (
    echo Docker is not running. Please start Docker Desktop first.
    echo.
    pause
    exit /b 1
)
echo OK: Docker is available
echo.

REM -- Step 2: Start infrastructure --
echo [2/4] Starting infrastructure (PostgreSQL, Redis, RabbitMQ)...
cd /d "d:\PrimeStack Asset Gateway\services"
docker compose up -d postgres redis rabbitmq 2>nul
echo Waiting 10 seconds for databases...
timeout /t 10 /nobreak >nul
echo OK: Infrastructure running
echo.

REM -- Step 3: Start all 14 services --
echo [3/4] Building and starting 14 services...
echo First run takes 3-5 minutes to build Docker images.
echo.
docker compose up -d --build

echo.
echo Waiting for services to start...
set count=0
:waitloop
timeout /t 5 /nobreak >nul
set /a count+=1
for /f "tokens=*" %%i in ('docker compose ps --format "{{.Status}}" 2^>nul ^| find /c "Up"') do set running=%%i
echo   Check %count%/24 - Running containers: %running%
if %running% GEQ 14 (
    echo All services are up!
    goto ready
)
if %count% LSS 24 goto waitloop
echo Timeout: Some services may still be starting.

:ready
echo.
echo Service Status:
echo ----------------------------------------------
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>nul
echo.

REM -- Step 4: Start dashboard server + beep + open browser --
echo [4/4] Starting dashboard server on port 8081...
cd /d "d:\PrimeStack Asset Gateway"

REM Kill any existing process on port 8081
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1

REM Start dashboard server in a minimized window (more reliable than start /b with redirection)
start "PrimeStack Dashboard" /min cmd /c "node start-dashboard.js"

echo Waiting 5 seconds for dashboard to start...
timeout /t 5 /nobreak >nul

REM Verify dashboard is running
curl -s http://localhost:8081/health >nul 2>&1
if errorlevel 1 (
    echo WARNING: Dashboard may not have started. Check if Node.js is on PATH.
    echo You can start it manually: node start-dashboard.js
) else (
    echo OK: Dashboard is running on port 8081
)

REM Beep 3 times
powershell -command "[console]::beep(800,300); Start-Sleep -m 200; [console]::beep(1000,300); Start-Sleep -m 200; [console]::beep(1200,500)"

echo.
echo ============================================
echo   PRIMESTACK SWITCH IS RUNNING
echo.
echo   Dashboards:
echo     Operations:  http://localhost:8081/ops
echo     Admin:       http://localhost:8081/admin/dashboard
echo     Merchant:    http://localhost:8081/admin/merchant-dashboard
echo.
echo   API Endpoints:
echo     Health All:  http://localhost:8081/admin/health-all
echo     Live Data:   http://localhost:8081/admin/live-data
echo     Gateway:     http://localhost:8080/health
echo.
echo   Services (all on Docker):
echo     4001  Ledger Service
echo     4002  IP Whitelist
echo     4003  Auth Service
echo     4004  Terminal Service (TMS)
echo     4005  Transfer Service
echo     4006  Risk Engine
echo     4007  Audit Service
echo     4008  Settlement Engine
echo     4009  Notification Service
echo     4010  Switch Core
echo     4011  Security Service
echo     4012  Routing Engine
echo     4013  ISO 8583 Gateway
echo     4014  Crypto Payout Service
echo     8080  API Gateway (external)
echo.
echo   Stop:  stop-primestack.bat
echo   Logs:  cd services ^&^& docker compose logs -f
echo ============================================
echo.

REM Open operations hub in browser
start "" "http://localhost:8081/ops"

REM Wait 2 seconds then open admin dashboard too
timeout /t 2 /nobreak >nul
start "" "http://localhost:8081/admin/dashboard"

echo Operations hub opened in browser.
echo Keep this window open. Close it to stop.
pause
