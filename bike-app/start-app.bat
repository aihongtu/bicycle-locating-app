@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node.js not found. Install Node.js first.
  pause
  exit /b 1
)
echo ==========================================
echo    Bike Locator - Local Server
echo    http://localhost:8080
echo    Close the server window to stop it
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
start "BikeApp Server" cmd /k node server.js
timeout /t 2 >nul
start "" "http://localhost:8080"
echo Server window opened. Close it to stop the server.
echo.
pause
