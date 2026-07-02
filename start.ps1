# U.N.A. Desktop - PowerShell launcher
# More reliable than .bat, supports Unicode natively
# Usage: Right-click -> Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File start.ps1

param(
    [switch]$Install,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ============================================================
# Helper functions
# ============================================================

function Write-Header {
    param([string]$Title)
    $line = "=" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
    Write-Host ""
}

function Write-OK {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  [ERROR] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "  [INFO] $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Cmd)
    $null = Get-Command $Cmd -ErrorAction SilentlyContinue
    return $?
}

# ============================================================
# Main
# ============================================================

if ($Help) {
    Write-Host "U.N.A. Desktop - PowerShell launcher"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\start.ps1           - Check deps and launch U.N.A."
    Write-Host "  .\start.ps1 -Install  - Install dependencies only"
    Write-Host "  .\start.ps1 -Help     - Show this help"
    exit 0
}

Write-Header "U.N.A. Desktop - Universal Neural Assistant"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Info "Working directory: $ScriptDir"

# ============================================================
# Check Node.js
# ============================================================

Write-Host ""
Write-Host "Checking Node.js..." -ForegroundColor Cyan

if (Test-Command "node") {
    $nodeVersion = node --version
    Write-OK "Node.js $nodeVersion found"
} else {
    Write-Err "Node.js not found!"
    Write-Host ""
    Write-Host "  Install from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "  Choose LTS version (18+)" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================================
# Check npm
# ============================================================

Write-Host ""
Write-Host "Checking npm..." -ForegroundColor Cyan

if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-OK "npm $npmVersion found"
} else {
    Write-Err "npm not found!"
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================================
# Check package.json
# ============================================================

Write-Host ""
Write-Host "Checking project files..." -ForegroundColor Cyan

if (Test-Path "package.json") {
    Write-OK "package.json found"
} else {
    Write-Err "package.json not found in: $ScriptDir"
    Write-Host ""
    Write-Host "  Make sure you extracted the archive correctly." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================================
# Install dependencies if needed
# ============================================================

Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Warn "node_modules not found. Installing dependencies..."
    Write-Host ""
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install failed!"
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-OK "Dependencies installed"
} else {
    Write-OK "node_modules exists"
}

# ============================================================
# Run setup.js for full check
# ============================================================

Write-Host ""
Write-Host "Running full dependency check..." -ForegroundColor Cyan
Write-Host ""

node "scripts\setup.js"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Err "Setup did not complete. See errors above."
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================================
# Install-only mode
# ============================================================

if ($Install) {
    Write-Header "Installation complete!"
    Write-Host "  To start U.N.A.: .\start.ps1"
    Write-Host "  Or manually: npm run dev"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

# ============================================================
# Offer to launch
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  U.N.A. is ready to launch!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$answer = Read-Host "Launch U.N.A. now? (y/N)"

if ($answer -eq "y" -or $answer -eq "Y" -or $answer -eq "yes") {
    Write-Host ""
    Write-Info "Launching U.N.A..."
    Write-Host ""
    npm run dev
} else {
    Write-Host ""
    Write-Info "OK. To launch later: npm run dev"
    Write-Host ""
}
