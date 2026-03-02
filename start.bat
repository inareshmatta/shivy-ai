@echo off
title ClassbookAI - Starting...
color 0A

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║         ClassbookAI - AI Voice Tutor          ║
echo  ║           Starting all services...            ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: Check if .env exists
if not exist "backend\.env" (
    echo [!] backend\.env not found!
    echo     Create backend\.env with your Gemini API key:
    echo     GEMINI_API_KEY=your_key_here
    echo.
    pause
    exit /b 1
)

:: Kill any existing processes on ports 8080 and 5173
echo [1/4] Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Install backend dependencies (skip if already installed)
echo [2/4] Checking backend dependencies...
cd backend
pip install -r requirements.txt --quiet --disable-pip-version-check 2>nul
cd ..

:: Start backend
echo [3/4] Starting backend server (port 8080)...
start "ClassbookAI Backend" cmd /c "cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8080 --reload"

:: Wait for backend to be ready
echo      Waiting for backend...
timeout /t 3 /nobreak >nul

:: Start frontend
echo [4/4] Starting frontend (port 5173)...
cd frontend
start "ClassbookAI Frontend" cmd /c "npx vite --host --open"
cd ..

echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║           ClassbookAI is running!             ║
echo  ╠═══════════════════════════════════════════════╣
echo  ║  Frontend:  http://localhost:5173             ║
echo  ║  Backend:   http://localhost:8080             ║
echo  ║  Health:    http://localhost:8080/health       ║
echo  ╠═══════════════════════════════════════════════╣
echo  ║  Close this window to stop all services      ║
echo  ╚═══════════════════════════════════════════════╝
echo.

:: Open browser automatically after a short delay
timeout /t 4 /nobreak >nul
start http://localhost:5173

:: Keep window open
echo Press any key to stop all services...
pause >nul

:: Cleanup
echo Stopping services...
taskkill /FI "WINDOWTITLE eq ClassbookAI Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ClassbookAI Frontend" /F >nul 2>&1
echo Done. Goodbye!
