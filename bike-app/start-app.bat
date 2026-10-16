@echo off
cd /d "%~dp0"
set "NODE=node"
echo ==========================================
echo    Bike Locator - Local Server
echo    http://localhost:8080
echo    Close this window to stop the server
echo ==========================================
echo.
REM If port 8080 is already in use, do not start another server (avoids EADDRINUSE)
netstat -ano | findstr :8080 | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
  echo [info] Server already running. Opening browser...
  start "" "http://localhost:8080"
  echo.
  pause
  exit /b 0
)
echo Starting server...
start "" /b "%NODE%" server.js
timeout /t 2 >nul
start "" "http://localhost:8080"
echo Server running. Opening browser...
echo.
pause
