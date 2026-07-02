/**
 * U.N.A. Desktop - Setup & Dependency Checker
 *
 * Cross-platform Node.js script.
 * Run: node scripts/setup.js
 * Or via: start.bat (Windows), start.sh (Linux/macOS), start.ps1 (PowerShell)
 *
 * This script is NON-INTERACTIVE (safe for all terminals).
 * To launch U.N.A., run: npm run dev
 *
 * Checks:
 *  - Node.js version
 *  - npm version
 *  - node_modules (installs if missing)
 *  - .env file (creates from .env.example)
 *  - ZAI_API_KEY
 *  - Ollama (optional)
 *  - Git (optional)
 *  - ripgrep (optional)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// Cross-platform output (no ANSI on old Windows cmd)
// ============================================================

const isWindows = os.platform() === 'win32';
const supportsAnsi = process.stdout.isTTY && (
  !isWindows ||
  process.env.WT_SESSION || // Windows Terminal
  process.env.TERM_PROGRAM === 'vscode' ||
  process.env.CI
);

const C = {
  green: supportsAnsi ? '\x1b[32m' : '',
  red: supportsAnsi ? '\x1b[31m' : '',
  yellow: supportsAnsi ? '\x1b[33m' : '',
  cyan: supportsAnsi ? '\x1b[36m' : '',
  reset: supportsAnsi ? '\x1b[0m' : '',
  bold: supportsAnsi ? '\x1b[1m' : '',
};

function log(msg, color = 'reset') {
  console.log(`${C[color] || ''}${msg}${C.reset}`);
}

function checkCommand(cmd) {
  try {
    const result = spawnSync(cmd, ['--version'], {
      stdio: 'pipe',
      shell: isWindows,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function getVersion(cmd) {
  try {
    const result = spawnSync(cmd, ['--version'], {
      stdio: 'pipe',
      shell: isWindows,
    });
    return (result.stdout.toString().trim() || result.stderr.toString().trim()).split('\n')[0];
  } catch {
    return null;
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const line = '='.repeat(60);
  log(line, 'cyan');
  log('  U.N.A. Desktop - Setup & Dependency Checker', 'bold');
  log('  Universal Neural Assistant', 'cyan');
  log(line, 'cyan');
  log('');

  let hasErrors = false;
  let hasWarnings = false;

  // ============================================================
  // 1. Node.js
  // ============================================================
  log('[1/7] Checking Node.js...', 'cyan');
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor >= 18) {
    log(`  [OK] Node.js ${nodeVersion} (requires >=18)`, 'green');
  } else {
    log(`  [FAIL] Node.js ${nodeVersion} - too old. Need >=18.`, 'red');
    log('         Download: https://nodejs.org/', 'yellow');
    hasErrors = true;
  }
  log('');

  // ============================================================
  // 2. npm
  // ============================================================
  log('[2/7] Checking npm...', 'cyan');
  const npmVersion = getVersion('npm');
  if (npmVersion) {
    const npmMajor = parseInt(npmVersion.split('.')[0], 10);
    if (npmMajor >= 9) {
      log(`  [OK] npm ${npmVersion} (requires >=9)`, 'green');
    } else {
      log(`  [WARN] npm ${npmVersion} - recommend >=9. Update: npm install -g npm@latest`, 'yellow');
      hasWarnings = true;
    }
  } else {
    log('  [FAIL] npm not found', 'red');
    hasErrors = true;
  }
  log('');

  // ============================================================
  // 3. node_modules
  // ============================================================
  log('[3/7] Checking dependencies...', 'cyan');
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    log('  [OK] node_modules installed', 'green');
  } else {
    log('  [WARN] node_modules not found. Installing...', 'yellow');
    hasWarnings = true;
    try {
      execSync('npm install', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
        shell: isWindows,
      });
      log('  [OK] Dependencies installed', 'green');
    } catch (e) {
      log('  [FAIL] npm install failed. Try manually: npm install', 'red');
      hasErrors = true;
    }
  }
  log('');

  // ============================================================
  // 4. .env file
  // ============================================================
  log('[4/7] Checking configuration (.env)...', 'cyan');
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      log('  [OK] .env created from .env.example', 'green');
    } else {
      log('  [WARN] .env not found. Creating minimal...', 'yellow');
      fs.writeFileSync(envPath, '# U.N.A. Configuration\nZAI_API_KEY=\n');
      hasWarnings = true;
    }
  } else {
    log('  [OK] .env exists', 'green');
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const hasZaiKey = /ZAI_API_KEY\s*=\s*\S/.test(envContent);
  if (hasZaiKey) {
    log('  [OK] ZAI_API_KEY set', 'green');
  } else {
    log('  [WARN] ZAI_API_KEY not set. Cloud LLM will not work.', 'yellow');
    log('         Get key: https://z.ai/developers', 'yellow');
    hasWarnings = true;
  }
  log('');

  // ============================================================
  // 5. Ollama (optional)
  // ============================================================
  log('[5/7] Checking Ollama (optional, for local LLM)...', 'cyan');
  if (checkCommand('ollama')) {
    const ollamaVersion = getVersion('ollama');
    log(`  [OK] Ollama ${ollamaVersion}`, 'green');
    log('  [INFO] Checking server...', 'cyan');
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      if (resp.ok) {
        const data = await resp.json();
        const models = data.models || [];
        if (models.length > 0) {
          log(`  [OK] Server running, models: ${models.length}`, 'green');
          for (const m of models.slice(0, 3)) {
            log(`        - ${m.name}`, 'cyan');
          }
        } else {
          log('  [WARN] Server running, but no models. Install: ollama pull qwen2.5:3b', 'yellow');
          hasWarnings = true;
        }
      } else {
        log('  [WARN] Server not responding on http://localhost:11434', 'yellow');
        log('         Start: ollama serve', 'yellow');
        hasWarnings = true;
      }
    } catch {
      log('  [WARN] Server not running. Start: ollama serve', 'yellow');
      hasWarnings = true;
    }
  } else {
    log('  [WARN] Ollama not installed (optional, for local LLM)', 'yellow');
    log('         Install: https://ollama.ai/', 'yellow');
    hasWarnings = true;
  }
  log('');

  // ============================================================
  // 6. Git (optional)
  // ============================================================
  log('[6/7] Checking git (optional, for work context)...', 'cyan');
  if (checkCommand('git')) {
    log(`  [OK] git ${getVersion('git')}`, 'green');
  } else {
    log('  [WARN] git not installed. Work context will not work.', 'yellow');
    hasWarnings = true;
  }
  log('');

  // ============================================================
  // 7. ripgrep (optional)
  // ============================================================
  log('[7/7] Checking ripgrep (optional, for grep tool)...', 'cyan');
  if (checkCommand('rg')) {
    log('  [OK] ripgrep installed', 'green');
  } else {
    log('  [WARN] ripgrep not installed. grep will use JS fallback (slower).', 'yellow');
    log('         Install: https://github.com/BurntSushi/ripgrep#installation', 'yellow');
    hasWarnings = true;
  }
  log('');

  // ============================================================
  // Summary
  // ============================================================
  log(line, 'cyan');
  if (hasErrors) {
    log('  [FAIL] Setup NOT complete - critical errors found.', 'red');
    log('         Fix errors above and run again.', 'red');
    log(line, 'cyan');
    process.exit(1);
  } else if (hasWarnings) {
    log('  [WARN] Setup complete with warnings.', 'yellow');
    log('         U.N.A. will work, but some features may be unavailable.', 'yellow');
  } else {
    log('  [OK] Setup complete! Everything ready.', 'green');
  }
  log(line, 'cyan');
  log('');

  log('Commands:', 'bold');
  log('  npm run dev           - Start in dev mode', 'cyan');
  log('  npm run build         - Production build', 'cyan');
  log('  npm test              - Run tests', 'cyan');
  log('  npm run package:win   - Build Windows .exe', 'cyan');
  log('  npm run package:linux - Build Linux .AppImage', 'cyan');
  log('  npm run package:mac   - Build macOS .dmg', 'cyan');
  log('');

  log('To start U.N.A.: npm run dev', 'green');
}

main().catch((e) => {
  log(`\n[FAIL] Critical error: ${e.message}`, 'red');
  console.error(e);
  process.exit(1);
});
