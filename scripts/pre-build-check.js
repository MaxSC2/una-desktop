#!/usr/bin/env node
/**
 * U.N.A. Desktop - Pre-build Validation
 *
 * Запускается автоматически перед build и package (через prebuild/prepackage scripts).
 * Можно запустить вручную: npm run check
 *
 * Проверяет:
 *  1. package.json validity (main path, author format, required fields)
 *  2. Entry point existence (after build)
 *  3. Dependencies declared (scan src/ for imports, check package.json)
 *  4. Critical files present
 *  5. TypeScript compiles
 *  6. tsconfig.json correctness
 *
 * Exit codes:
 *  0 - all checks passed
 *  1 - critical issues found
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

let errors = 0;
let warnings = 0;

// ============================================================
// Helpers
// ============================================================

function ok(msg) {
  console.log(`  [OK] ${msg}`);
}

function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  [WARN] ${msg}`);
  warnings++;
}

function section(num, title) {
  console.log(`\n[${num}] ${title}`);
}

// ============================================================
// 1. package.json validity
// ============================================================

section(1, 'package.json validation');

// 1a. main field
if (!pkg.main) {
  fail('package.json: "main" field is missing');
} else {
  // Check that main path matches tsconfig outDir + rootDir structure
  const tsconfigPath = path.join(ROOT, 'electron', 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8').replace(/\/\/.*$/gm, ''));
    const outDir = tsconfig.compilerOptions.outDir; // relative to tsconfig location (electron/)
    const rootDir = tsconfig.compilerOptions.rootDir; // relative to tsconfig location

    if (outDir && rootDir) {
      // tsconfig is at electron/tsconfig.json
      // outDir "../dist-electron" → resolves to <root>/dist-electron
      // rootDir ".." → resolves to <root>
      // main.ts is at electron/main.ts → relative to rootDir: electron/main.ts
      // compiled output: <root>/dist-electron/electron/main.js
      // pkg.main should be: "dist-electron/electron/main.js" (relative to package.json at root)

      // Resolve outDir relative to tsconfig dir
      const tsconfigDir = path.join(ROOT, 'electron');
      const resolvedOutDir = path.resolve(tsconfigDir, outDir);
      const resolvedRootDir = path.resolve(tsconfigDir, rootDir);

      // main.ts relative path within rootDir
      const mainTsRel = path.relative(resolvedRootDir, path.join(ROOT, 'electron', 'main.ts'));
      // Expected output: outDir/mainTsRel with .js extension
      const expectedOutput = path.join(resolvedOutDir, mainTsRel).replace(/\.ts$/, '.js');
      // Expected pkg.main (relative to ROOT)
      const expectedMain = path.relative(ROOT, expectedOutput).replace(/\\/g, '/');

      if (pkg.main !== expectedMain) {
        fail(`package.json "main" = "${pkg.main}" but should be "${expectedMain}"`);
        fail(`  Reason: tsconfig outDir="${outDir}", rootDir="${rootDir}"`);
        fail(`  main.ts compiled to: ${expectedMain}`);
      } else {
        ok(`main path correct: ${pkg.main}`);
      }
    }
  }
}

// 1b. author field (electron-builder requires object with email for Linux)
if (!pkg.author) {
  warn('package.json: "author" field is missing (electron-builder requires it for Linux builds)');
} else if (typeof pkg.author === 'string') {
  fail('package.json: "author" is a string, but electron-builder requires an object');
  fail('  Fix: change to {"name": "Your Name", "email": "you@example.com"}');
  fail('  Reason: Linux .deb packages require maintainer email');
} else if (typeof pkg.author === 'object') {
  if (!pkg.author.name) {
    warn('package.json: author.name is missing');
  }
  if (!pkg.author.email) {
    warn('package.json: author.email is missing (electron-builder needs it for Linux .deb)');
  } else {
    ok(`author format correct: ${pkg.author.name} <${pkg.author.email}>`);
  }
}

// 1c. Required fields
const requiredFields = ['name', 'version', 'description', 'license', 'main'];
for (const field of requiredFields) {
  if (!pkg[field]) {
    fail(`package.json: required field "${field}" is missing`);
  }
}

// 1d. electron-builder build config
if (!pkg.build) {
  warn('package.json: "build" config for electron-builder is missing');
} else {
  if (!pkg.build.appId) warn('build.appId missing');
  if (!pkg.build.productName) warn('build.productName missing');
  if (!pkg.build.directories?.output) warn('build.directories.output missing');
}

// ============================================================
// 2. Dependencies check (scan src/ and electron/ for imports)
// ============================================================

section(2, 'Dependencies check');

// Collect all imports from src/ and electron/
const importedPackages = new Set();
const sourceDirs = ['src', 'electron', 'prompts'];

function scanImports(dir) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) return;

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'dist-electron', '.git'].includes(entry.name)) {
          walk(fp);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fp, 'utf-8');
        // Match: import ... from 'package' or require('package')
        const importRegex = /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"]([^'"./][^'"]*?)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
          let pkgName = match[1];
          // Handle scoped packages: @scope/name → @scope/name
          // Handle subpaths: package/sub → package (or @scope/name/sub → @scope/name)
          if (pkgName.startsWith('@')) {
            const parts = pkgName.split('/');
            pkgName = parts.slice(0, 2).join('/');
          } else {
            pkgName = pkgName.split('/')[0];
          }
          // Skip Node.js built-ins
          const builtins = ['fs', 'path', 'os', 'child_process', 'crypto', 'util', 'http', 'https', 'net', 'url', 'stream', 'events', 'buffer', 'process', 'querystring', 'zlib', 'readline', 'cluster', 'worker_threads', 'perf_hooks', 'timers', 'assert'];
          if (!builtins.includes(pkgName)) {
            importedPackages.add(pkgName);
          }
        }
      }
    }
  }
  walk(fullPath);
}

for (const dir of sourceDirs) {
  scanImports(dir);
}

// Node.js built-in modules (don't need to be in package.json)
const builtins = [
  'fs', 'path', 'os', 'child_process', 'crypto', 'util', 'http', 'https',
  'net', 'url', 'stream', 'events', 'buffer', 'process', 'querystring',
  'zlib', 'readline', 'cluster', 'worker_threads', 'perf_hooks', 'timers',
  'assert', 'dns', 'tls', 'dgram', 'vm', 'tty', 'string_decoder', 'punycode',
  'module', 'console', 'inspector', 'async_hooks', 'trace_events', 'v8', 'node:',
];

// Optional packages — used via require() with fallback, not required
const optionalDeps = [
  '@nut-tree/nut-js',  // GUI automation (optional, has JS fallback check)
  'robotjs',           // GUI automation (optional, has JS fallback check)
];

// Check each imported package is in dependencies or devDependencies
const allDeps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
  ...pkg.optionalDependencies,
};

const missingDeps = [];
const missingOptional = [];
for (const pkgName of importedPackages) {
  if (builtins.includes(pkgName)) continue; // built-in, skip
  if (optionalDeps.includes(pkgName)) {
    if (!allDeps[pkgName]) {
      missingOptional.push(pkgName);
    }
    continue;
  }
  if (!allDeps[pkgName]) {
    missingDeps.push(pkgName);
  }
}

if (missingDeps.length === 0) {
  ok(`All ${importedPackages.size} imported packages are declared in package.json`);
} else {
  fail(`${missingDeps.length} packages imported but not in package.json:`);
  for (const p of missingDeps) {
    fail(`  - ${p} (install: npm install ${p} --legacy-peer-deps)`);
  }
}

if (missingOptional.length > 0) {
  warn(`${missingOptional.length} optional packages not installed (OK if using fallback):`);
  for (const p of missingOptional) {
    warn(`  - ${p} (optional, install: npm install ${p} --legacy-peer-deps)`);
  }
}

// ============================================================
// 3. Critical files check
// ============================================================

section(3, 'Critical files');

const criticalFiles = [
  'package.json',
  'electron/main.ts',
  'electron/preload.ts',
  'electron/tsconfig.json',
  'vite.config.ts',
  'tsconfig.json',
  'src/App.tsx',
  'src/main.tsx',
  'prompts/system.ts',
  'index.html',
];

for (const file of criticalFiles) {
  if (fs.existsSync(path.join(ROOT, file))) {
    ok(file);
  } else {
    fail(`Missing critical file: ${file}`);
  }
}

// ============================================================
// 4. Entry point check (after build)
// ============================================================

section(4, 'Entry point');

if (pkg.main) {
  const entryPath = path.join(ROOT, pkg.main);
  if (fs.existsSync(entryPath)) {
    ok(`Entry point exists: ${pkg.main}`);
  } else {
    warn(`Entry point not found yet: ${pkg.main} (run "npm run build" first)`);
  }
}

// ============================================================
// 5. TypeScript compile check
// ============================================================

section(5, 'TypeScript check');

const tscResult = spawnSync('npx', ['tsc', '-p', 'electron/tsconfig.json', '--noEmit'], {
  cwd: ROOT,
  stdio: 'pipe',
  shell: true,
});

if (tscResult.status === 0) {
  ok('electron TypeScript compiles without errors');
} else {
  const stderr = tscResult.stderr.toString();
  const stdout = tscResult.stdout.toString();
  fail('electron TypeScript has errors:');
  console.error(stderr || stdout);
}

const tscRendererResult = spawnSync('npx', ['tsc', '--noEmit'], {
  cwd: ROOT,
  stdio: 'pipe',
  shell: true,
});

if (tscRendererResult.status === 0) {
  ok('renderer TypeScript compiles without errors');
} else {
  const stderr = tscRendererResult.stderr.toString();
  const stdout = tscRendererResult.stdout.toString();
  fail('renderer TypeScript has errors:');
  console.error(stderr || stdout);
}

// ============================================================
// Summary
// ============================================================

console.log('\n' + '='.repeat(60));
if (errors > 0) {
  console.error(`[FAIL] ${errors} error(s), ${warnings} warning(s)`);
  console.error('       Fix errors before building!');
  console.log('='.repeat(60));
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`[WARN] 0 errors, ${warnings} warning(s)`);
  console.log('='.repeat(60));
  process.exit(0);
} else {
  console.log(`[OK] All checks passed!`);
  console.log('='.repeat(60));
  process.exit(0);
}
