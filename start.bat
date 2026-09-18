@echo off
echo.
echo  ============================================
echo   HOLOGRAPHIC INTERFACE — Starting up...
echo  ============================================
echo.

:: Step 1: Build the frontend
echo  [1/2] Building frontend...
cd /d "%~dp0client"
call npm run build
if errorlevel 1 (
    echo  ERROR: Frontend build failed!
    pause
    exit /b 1
)

:: Step 2: Launch the server (which serves the built frontend)
echo.
echo  [2/2] Starting server on http://localhost:3001
echo.
cd /d "%~dp0server"

:: Open browser after a short delay
start /b "" timeout /t 2 /nobreak >nul
start "" "http://localhost:3001"

call npm run dev
