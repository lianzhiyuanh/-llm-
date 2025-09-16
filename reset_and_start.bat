@echo off
chcp 65001 > nul

:: ===================================================================
:: == RAG Engine - RESET and Start Script (Batch)
:: ==
:: == This script will first DELETE the existing database to resolve
:: == potential corruption issues, then start all services.
:: ===================================================================

:: --- Configuration ---
set DB_DIR=zhengqiangjiansuoshengcheng\chroma_db
set BACKEND_SCRIPT=zhengqiangjiansuoshengcheng/server.py
set FRONTEND_DIR=zhengqiangjiansuoshengcheng
set FRONTEND_PORT=8000
set BACKEND_PORT=5001

:: --- Reset Database ---
echo Checking for existing database directory...
if exist %DB_DIR% (
    echo Database directory found. Deleting %DB_DIR% to ensure a clean start...
    rmdir /s /q %DB_DIR%
    echo Database directory deleted.
) else (
    echo No existing database directory found. Skipping deletion.
)
echo.

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
echo - The database has been reset.
echo - Please re-load your knowledge base file from the UI after starting.
echo ---
pause
