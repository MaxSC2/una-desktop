@echo off
setlocal enabledelayedexpansion
REM U.N.A. Desktop - Windows launcher
REM Compatible with Windows 7/8/10/11
REM No Cyrillic, no Unicode symbols, ASCII only

title U.N.A. Desktop

echo.
echo ============================================================
echo   U.N.A. Desktop - Universal Neural Assistant
echo ============================================================
echo.

REM Check Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Install from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Get script directory (handles spaces in path)
set "SCRIPT_DIR=%~dp0"

REM Check if setup.js exists
if not exist "%SCRIPT_DIR%scripts\setup.js" (
    echo [ERROR] scripts\setup.js not found in:
    echo   %SCRIPT_DIR%scripts\
    echo.
    echo Make sure you extracted the archive correctly.
    echo.
    pause
    exit /b 1
)

REM Run setup.js - it will check everything and offer to start
echo [INFO] Running setup and dependency check...
echo.
node "%SCRIPT_DIR%scripts\setup.js"

REM Check exit code
if errorlevel 1 (
    echo.
    echo [ERROR] Setup did not complete. See errors above.
    echo.
    pause
    exit /b 1
)

REM setup.js handles the "launch now?" prompt, so we just exit
endlocal
