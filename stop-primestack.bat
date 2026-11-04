@echo off
setlocal
title PrimeStack Switch - Shutdown
color 0C

echo.
echo  ================================================================
echo  Stopping PrimeStack Switch...
echo  ================================================================
echo.

echo  Stopping the PrimeStack dashboard application...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$listeners = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue; foreach ($listener in $listeners) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess); if ($process -and $process.CommandLine -match 'runtime-loader\.cjs|dist\\server\.js') { Stop-Process -Id $listener.OwningProcess -Force; Write-Output '  PrimeStack application stopped.' } }"
echo.

echo  Stopping microservices...
cd /d "%~dp0services"
docker compose down 2>nul
echo  OK: Services stopped

echo.
echo  Stopping infrastructure...
cd /d "%~dp0"
docker compose down 2>nul
echo  OK: Infrastructure stopped

echo.
echo  Cleaning up unused Docker resources...
docker system prune -f 2>nul

echo.
echo  ================================================================
echo  All PrimeStack services stopped.
echo  ================================================================
echo.
pause
