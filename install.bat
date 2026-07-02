@echo off
setlocal enabledelayedexpansion
REM U.N.A. Desktop - Windows installer (dependencies only)
REM Compatible with Windows 7/8/10/11
REM No Cyrillic, no Unicode symbols, ASCII only

title U.N.A. Desktop - Installer

echo.
echo ============================================================
echo   U.N.A. Desktop - Installer
echo   Installing dependencies and checking environment
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

REM Get script directory
set "SCRIPT_DIR=%~dp0"

REM Check if package.json exists
if not exist "%SCRIPT_DIR%package.json" (
    echo [ERROR] package.json not found in:
    echo   %SCRIPT_DIR%
    echo.
    echo Make sure you extracted the archive correctly.
    echo.
    pause
    exit /b 1
)

REM Install npm dependencies
echo [INFO] Installing npm dependencies...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    echo Try manually: npm install
    echo.
    pause
    exit /b 1
)

REM Rebuild native modules for Electron
echo.
echo [INFO] Rebuilding native modules for Electron...
call npm run postinstall
if errorlevel 1 (
    echo.
    echo [WARN] postinstall finished with warning, but it may be OK.
    echo If U.N.A. doesn't start, try: npm rebuild
) else (
    echo [OK] Native modules rebuilt.
)

REM Final check
echo.
echo ============================================================
echo   Installation complete!
echo.
echo   To start U.N.A.:
echo   1. Run start.bat
echo   2. Or manually: npm run dev
echo ============================================================
echo.
pause

endlocal
