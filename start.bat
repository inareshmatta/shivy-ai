@echo off
title KlassroomAI
color 0A

echo.
echo  ========================================
echo    KlassroomAI - Starting App
echo  ========================================
echo.

:: Kill any existing processes on port 8080
echo [1/3] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Navigate to backend
cd /d "%~dp0backend"

echo [2/3] Opening browser...
start http://localhost:8080

echo [3/3] Starting backend server...
echo.
echo  ========================================
echo    KlassroomAI is running!
echo    Frontend & Backend: http://localhost:8080
echo  ========================================
echo.
echo Press Ctrl+C to stop the server and close the app.
echo.

:: Start server
python -m uvicorn main:app --host 0.0.0.0 --port 8080 --workers 1
