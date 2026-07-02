#!/usr/bin/env bash
# U.N.A. Desktop - Linux/macOS launcher
# Checks dependencies and runs setup.js
# For macOS: ./start.sh
# For Linux: ./start.sh

set -e

echo ""
echo "============================================================"
echo "  U.N.A. Desktop - Universal Neural Assistant"
echo "============================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found."
    echo "  Install from: https://nodejs.org/"
    echo "  macOS:  brew install node"
    echo "  Ubuntu: sudo apt install nodejs npm"
    echo "  Fedora: sudo dnf install nodejs npm"
    echo ""
    exit 1
fi

NODE_VERSION=$(node --version)
echo "[OK] Node.js $NODE_VERSION found"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found."
    echo "  Should come with Node.js installation"
    exit 1
fi

NPM_VERSION=$(npm --version)
echo "[OK] npm $NPM_VERSION found"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check package.json
if [ ! -f "package.json" ]; then
    echo "[ERROR] package.json not found in: $SCRIPT_DIR"
    echo "  Make sure you extracted the archive correctly."
    exit 1
fi
echo "[OK] package.json found"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "[WARN] node_modules not found. Installing dependencies..."
    npm install
    echo "[OK] Dependencies installed"
else
    echo "[OK] node_modules exists"
fi

# Run setup.js for full check
echo ""
echo "Running full dependency check..."
echo ""
node "$SCRIPT_DIR/scripts/setup.js"

# Offer to launch
echo ""
echo "============================================================"
echo "  To start U.N.A.: npm run dev"
echo "============================================================"
echo ""

read -p "Launch U.N.A. now? (y/N): " answer
if [[ "$answer" =~ ^[YyДд]$ ]]; then
    echo ""
    echo "[INFO] Launching U.N.A..."
    echo ""
    npm run dev
fi
