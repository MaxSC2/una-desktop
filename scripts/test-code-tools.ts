/**
 * Smoke tests for code tools: edit_file, grep, apply_patch, run_code.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { edit_file, grep, apply_patch, run_code } from '../electron/ai/code-tools';

async function main() {
  // Используем домашнюю папку (для прохождения проверки безопасности)
  const tmpDir = await fs.mkdtemp(path.join(os.homedir(), '.una-test-'));
  console.log(`Test dir: ${tmpDir}\n`);

  // ============================================================
  console.log('=== Test 1: edit_file (operation=append) ===');
  const testFile1 = path.join(tmpDir, 'test1.txt');
  await fs.writeFile(testFile1, 'line 1\nline 2\nline 3\n', 'utf-8');

  const r1 = await edit_file({
    path: testFile1,
    operation: 'append',
    content: 'line 4\nline 5',
  });
  if (r1.success) {
    const after = await fs.readFile(testFile1, 'utf-8');
    const ok = after.includes('line 4') && after.includes('line 5');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? 'append works, file now has 5 lines' : 'file content wrong'}`);
    console.log(`    Backup: ${(r1.data as any).backup_path ? 'created' : 'NOT created'}`);
  } else {
    console.log(`  FAIL: ${r1.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 2: edit_file (operation=replace) ===');
  const r2 = await edit_file({
    path: testFile1,
    operation: 'replace',
    find: 'line 2',
    replace: 'LINE TWO',
  });
  if (r2.success) {
    const after = await fs.readFile(testFile1, 'utf-8');
    const ok = after.includes('LINE TWO') && !after.includes('line 2');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? 'replace works' : 'content wrong'}`);
  } else {
    console.log(`  FAIL: ${r2.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 3: edit_file (operation=delete_lines) ===');
  const r3 = await edit_file({
    path: testFile1,
    operation: 'delete_lines',
    start_line: 1,
    end_line: 2,
  });
  if (r3.success) {
    const after = await fs.readFile(testFile1, 'utf-8');
    const lines = after.split('\n').filter(Boolean);
    // После удаления строк 1-2 из [line 1, LINE TWO, line 3, line 4, line 5]
    // должно остаться [line 3, line 4, line 5]
    const ok = lines.length === 3 && lines[0] === 'line 3';
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? 'delete_lines works' : 'lines: ' + JSON.stringify(lines)}`);
  } else {
    console.log(`  FAIL: ${r3.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 4: edit_file (protected file) ===');
  const envFile = path.join(tmpDir, '.env');
  await fs.writeFile(envFile, 'SECRET=abc123\n', 'utf-8');
  const r4 = await edit_file({
    path: envFile,
    operation: 'append',
    content: 'more secrets',
  });
  if (!r4.success && r4.error?.includes('защищён')) {
    console.log(`  PASS: Correctly blocked protected file: ${r4.error}`);
  } else {
    console.log(`  FAIL: Should have been blocked`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 5: grep (basic) ===');
  // Создаём отдельную папку без точки в имени (grep пропускает .папки)
  const grepDir = path.join(os.homedir(), 'una-grep-test-' + Date.now());
  await fs.mkdir(grepDir, { recursive: true });
  await fs.writeFile(path.join(grepDir, 'a.ts'), 'const x = 1;\nfunction foo() { return x; }\n', 'utf-8');
  await fs.writeFile(path.join(grepDir, 'b.ts'), 'const y = 2;\nfunction bar() { return y; }\n', 'utf-8');
  await fs.mkdir(path.join(grepDir, 'sub'), { recursive: true });
  await fs.writeFile(path.join(grepDir, 'sub', 'c.ts'), 'const z = 3;\nfunction foo() { return z; }\n', 'utf-8');

  const r5 = await grep({
    pattern: 'function',
    path: grepDir,
    include: '*.ts',
    max_results: 10,
  });
  if (r5.success) {
    const data = r5.data as { count: number; results: any[]; engine: string };
    const ok = data.count === 3;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? `grep found ${data.count} matches (engine: ${data.engine})` : `expected 3, got ${data.count}`}`);
    for (const r of data.results) {
      console.log(`    ${r.file.replace(grepDir, '.')}:${r.line_number} -> ${r.line_content.slice(0, 60)}`);
    }
  } else {
    console.log(`  FAIL: ${r5.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 6: grep (regex) ===');
  const r6 = await grep({
    pattern: 'function\\s+(\\w+)',
    path: grepDir,
    include: '*.ts',
    max_results: 10,
    use_regex: true,
  });
  if (r6.success) {
    const data = r6.data as { count: number };
    const ok = data.count === 3;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? `grep regex found ${data.count} matches` : `expected 3, got ${data.count}`}`);
  } else {
    console.log(`  FAIL: ${r6.error}`);
  }
  // Cleanup grep dir
  await fs.rm(grepDir, { recursive: true, force: true });
  console.log('');

  // ============================================================
  console.log('=== Test 7: apply_patch (unified diff) ===');
  const patchFile = path.join(tmpDir, 'patch-test.txt');
  await fs.writeFile(patchFile, 'first line\nsecond line\nthird line\nfourth line\n', 'utf-8');

  const patch = `--- a/patch-test.txt
+++ b/patch-test.txt
@@ -1,4 +1,4 @@
 first line
-second line
+SECOND LINE (modified)
 third line
 fourth line
`;

  const r7 = await apply_patch({
    path: patchFile,
    patch,
  });
  if (r7.success) {
    const after = await fs.readFile(patchFile, 'utf-8');
    const ok = after.includes('SECOND LINE (modified)') && !after.includes('second line');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? 'patch applied correctly' : 'patch failed'}`);
    console.log(`    Hunks applied: ${(r7.data as any).hunks_applied}`);
  } else {
    console.log(`  FAIL: ${r7.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 8: apply_patch (context mismatch) ===');
  const r8 = await apply_patch({
    path: patchFile,
    patch: `--- a/patch-test.txt
+++ b/patch-test.txt
@@ -1,4 +1,4 @@
 WRONG CONTEXT
-second line
+modified
 third line
 fourth line
`,
  });
  if (!r8.success && r8.error?.includes('Context mismatch')) {
    console.log(`  PASS: Correctly rejected patch with bad context`);
  } else {
    console.log(`  FAIL: Should have rejected bad context (got: ${JSON.stringify(r8).slice(0, 100)})`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 9: run_code (basic math) ===');
  const r9 = await run_code({
    code: `
      const a = 5;
      const b = 7;
      console.log('result:', a * b);
      console.log('pi:', Math.PI.toFixed(4));
    `,
    timeout_ms: 5000,
  });
  if (r9.success) {
    const data = r9.data as { stdout: string; exit_code: number };
    const ok = data.stdout.includes('result: 35') && data.stdout.includes('pi: 3.1416');
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${ok ? 'code executed, output correct' : 'output: ' + data.stdout.slice(0, 100)}`);
  } else {
    console.log(`  FAIL: ${r9.error}`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 10: run_code (dangerous — fs) ===');
  const r10 = await run_code({
    code: `const fs = require('fs'); fs.writeFileSync('/tmp/hack', 'pwned');`,
    timeout_ms: 5000,
  });
  if (!r10.success && r10.error?.includes('опасный')) {
    console.log(`  PASS: Correctly blocked dangerous code: ${r10.error}`);
  } else {
    console.log(`  FAIL: Should have blocked (got: ${JSON.stringify(r10).slice(0, 100)})`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 11: run_code (dangerous — process.exit) ===');
  const r11 = await run_code({
    code: `process.exit(0);`,
    timeout_ms: 5000,
  });
  if (!r11.success && r11.error?.includes('опасный')) {
    console.log(`  PASS: Correctly blocked process.exit`);
  } else {
    console.log(`  FAIL: Should have blocked`);
  }
  console.log('');

  // ============================================================
  console.log('=== Test 12: run_code (timeout) ===');
  const r12 = await run_code({
    code: `while(true) { /* infinite loop */ }`,
    timeout_ms: 2000,
  });
  if (!r12.success && (r12.error?.includes('timeout') || (r12.data as any)?.timed_out)) {
    console.log(`  PASS: Correctly timed out infinite loop`);
  } else {
    console.log(`  FAIL: Should have timed out (got: ${JSON.stringify(r12).slice(0, 100)})`);
  }
  console.log('');

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
  // Clean up backup dir from this test
  const backupDir = path.join(os.homedir(), '.una', 'backups');
  try {
    const backups = await fs.readdir(backupDir);
    for (const b of backups) {
      if (b.startsWith('test1.txt.') || b.startsWith('patch-test.txt.')) {
        await fs.unlink(path.join(backupDir, b));
      }
    }
  } catch {
    // ignore
  }

  console.log('\n=== All tests done ===');
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
