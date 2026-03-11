@echo off
setlocal

:: Deployment script for KlassroomAI to Google Cloud Run

echo ========================================
echo   Deploying KlassroomAI to Cloud Run
echo ========================================
echo.

:: 1. Ensure frontend is built and copied to backend
echo [1/3] Building frontend...
cd /d "%~dp0frontend"
if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
)
echo Compiling frontend...
call npm run build

echo.
echo Copying frontend build to backend...
xcopy /s /e /y "dist\*" "..\backend\static\" >nul

:: 2. Deploy to Google Cloud Run
echo.
echo [2/3] Deploying to Google Cloud Run...
cd /d "%~dp0backend"

:: Set your GCP Project ID here
set GCP_PROJECT_ID=klassroom-ai-backend
set SERVICE_NAME=klassroom-api
set REGION=us-central1

echo Project: %GCP_PROJECT_ID%
echo Service: %SERVICE_NAME%
echo Region: %REGION%

call gcloud run deploy %SERVICE_NAME% ^
    --source . ^
    --region %REGION% ^
    --project %GCP_PROJECT_ID% ^
    --allow-unauthenticated

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Deployment failed. Please check the logs above.
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Done
echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
pause
