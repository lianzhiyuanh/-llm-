@echo off
chcp 65001 > nul

:: ===================================================================
:: == RAG Engine - One-Click Start Script (Batch)
:: ===================================================================

:: --- Configuration ---
set BACKEND_SCRIPT=zhengqiangjiansuoshengcheng/server.py
set FRONTEND_DIR=zhengqiangjiansuoshengcheng
set FRONTEND_PORT=8000
set BACKEND_PORT=5001

:: --- Start Backend Service ---
echo Starting Backend Flask Server (Port %BACKEND_PORT%)...
start "RAG Backend" cmd /c "chcp 65001 > nul && python %BACKEND_SCRIPT%"

:: --- Start Frontend Service ---
echo Starting HTTP Server for Frontend (Port %FRONTEND_PORT%)...
cd %FRONTEND_DIR%
start "RAG Frontend" cmd /c "chcp 65001 > nul && python -m http.server %FRONTEND_PORT%"
cd ..

:: --- Wait for servers to initialize ---
echo Waiting for servers to start (5 seconds)...
timeout /t 5 /nobreak >nul

:: --- Open Frontend in Browser ---
set FRONTEND_URL=http://localhost:%FRONTEND_PORT%
echo Backend is running at http://127.0.0.1:%BACKEND_PORT%
echo Frontend is ready! Opening in browser: %FRONTEND_URL%
start "" "%FRONTEND_URL%"

echo.
echo ---
echo Startup Complete!
echo - Backend API service is running in a new window.
echo - Frontend HTTP service is running in a new window.
echo - The application should be open in your browser.
echo ---
pause
