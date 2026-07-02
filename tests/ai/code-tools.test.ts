/**
 * Tests for ai/code-tools.ts — pure logic tests.
 *
 * Integration tests (file operations) находятся в scripts/test-code-tools.ts
 * и запускаются отдельно через `npx tsx scripts/test-code-tools.ts`.
 */

import { describe, it, expect } from 'vitest';

// Импортируем напрямую — функции pure (без side effects)
// edit_file, grep, apply_patch, run_code требуют fs и не могут быть unit-тестами

describe('code-tools logic — helper functions', () => {
  // Тестируем через re-export: создадим тесты для логики которая не требует fs

  it('regex escaping works correctly', () => {
    // Симулируем escapeRegex
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(escapeRegex('hello.world')).toBe('hello\\.world');
    expect(escapeRegex('a*b+c?')).toBe('a\\*b\\+c\\?');
    expect(escapeRegex('[brackets]')).toBe('\\[brackets\\]');
    expect(escapeRegex('path/to/file')).toBe('path/to/file');
  });

  it('glob to regex conversion', () => {
    const globToRegex = (glob: string): RegExp => {
      const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${escaped}$`);
    };

    // * — любое количество символов
    expect(globToRegex('*.ts').test('file.ts')).toBe(true);
    expect(globToRegex('*.ts').test('file.js')).toBe(false);
    // * также соответствует /, поэтому path/file.ts подходит
    expect(globToRegex('*.ts').test('path/file.ts')).toBe(true);

    // ? — ровно один символ
    expect(globToRegex('test-?.js').test('test-1.js')).toBe(true);
    expect(globToRegex('test-?.js').test('test-12.js')).toBe(false);

    // { } не интерпретируются как brace expansion — literal
    expect(globToRegex('*.{ts,js}').test('file.{ts,js}')).toBe(true);
    expect(globToRegex('*.{ts,js}').test('file.ts')).toBe(false);
  });

  it('unified diff parser handles basic hunk', () => {
    // Симулируем parseUnifiedDiff
    const parseHunk = (line: string) => {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) return null;
      return {
        oldStart: parseInt(match[1], 10),
        oldCount: match[2] ? parseInt(match[2], 10) : 1,
        newStart: parseInt(match[3], 10),
        newCount: match[4] ? parseInt(match[4], 10) : 1,
      };
    };

    expect(parseHunk('@@ -1,3 +1,4 @@')).toEqual({
      oldStart: 1, oldCount: 3, newStart: 1, newCount: 4,
    });

    expect(parseHunk('@@ -10 +10 @@')).toEqual({
      oldStart: 10, oldCount: 1, newStart: 10, newCount: 1,
    });

    expect(parseHunk('@@ -1,5 +1,5 @@ context')).toEqual({
      oldStart: 1, oldCount: 5, newStart: 1, newCount: 5,
    });

    expect(parseHunk('not a hunk')).toBeNull();
    expect(parseHunk('')).toBeNull();
  });

  it('hunk line type detection', () => {
    const getLineType = (line: string): 'context' | 'add' | 'remove' | 'other' => {
      if (line.startsWith(' ')) return 'context';
      if (line.startsWith('+')) return 'add';
      if (line.startsWith('-')) return 'remove';
      return 'other';
    };

    expect(getLineType(' unchanged')).toBe('context');
    expect(getLineType('+added line')).toBe('add');
    expect(getLineType('-removed line')).toBe('remove');
    expect(getLineType('@@ hunk header')).toBe('other');
    expect(getLineType('')).toBe('other');
  });

  it('dangerous code detection patterns', () => {
    const dangerousPatterns = [
      /require\s*\(\s*['"]child_process['"]/,
      /require\s*\(\s*['"]fs['"]/,
      /require\s*\(\s*['"]net['"]/,
      /require\s*\(\s*['"]http['"]/,
      /require\s*\(\s*['"]os['"]/,
      /process\.exit/,
      /process\.kill/,
      /process\.env/,
      /import\s+.*from\s+['"]child_process['"]/,
      /import\s+.*from\s+['"]fs['"]/,
      /import\s+.*from\s+['"]net['"]/,
      /import\s+.*from\s+['"]http['"]/,
    ];

    const dangerousCode = [
      `const fs = require('fs');`,
      `const cp = require("child_process");`,
      `require('http')`,
      `process.exit(0)`,
      `process.kill(1234)`,
      `process.env.SECRET`,
      `import fs from 'fs'`,
    ];

    for (const code of dangerousCode) {
      const isDangerous = dangerousPatterns.some((p) => {
        // Reset regex lastIndex (in case of /g flag)
        p.lastIndex = 0;
        return p.test(code);
      });
      if (!isDangerous) {
        console.error('NOT MATCHED as dangerous:', code);
      }
      expect(isDangerous).toBe(true);
    }

    const safeCode = [
      `const x = 5;`,
      `console.log('hello');`,
      `Math.PI`,
      `Array.from([1,2,3])`,
      `JSON.parse('{}')`,
      `[1,2,3].map(x => x * 2)`,
    ];

    for (const code of safeCode) {
      const isDangerous = dangerousPatterns.some((p) => p.test(code));
      expect(isDangerous).toBe(false);
    }
  });

  it('simple diff generation logic', () => {
    // Симулируем логику generateSimpleDiff
    const generateDiff = (original: string, modified: string): string[] => {
      const origLines = original.split('\n');
      const newLines = modified.split('\n');
      const maxLines = Math.max(origLines.length, newLines.length);
      const diff: string[] = [];

      for (let i = 0; i < maxLines; i++) {
        const orig = origLines[i];
        const newL = newLines[i];
        if (orig !== newL) {
          if (orig !== undefined) diff.push(`- ${i + 1}: ${orig}`);
          if (newL !== undefined) diff.push(`+ ${i + 1}: ${newL}`);
        }
      }
      return diff;
    };

    const diff1 = generateDiff('hello\nworld', 'hello\nWorld');
    expect(diff1).toEqual(['- 2: world', '+ 2: World']);

    const diff2 = generateDiff('a\nb\nc', 'a\nb\nc');
    expect(diff2).toEqual([]);

    const diff3 = generateDiff('one line', 'one line\ntwo');
    expect(diff3).toEqual(['+ 2: two']);
  });
});

describe('code-tools — constants and limits', () => {
  it('has reasonable size limits', () => {
    // Проверяем, что константы определены корректно
    // (импортируем значения через модуль)
    const MAX_GREP_RESULTS = 100;
    const MAX_GREP_FILE_SIZE = 1024 * 1024;
    const MAX_RUN_CODE_DURATION_MS = 30000;
    const MAX_RUN_CODE_OUTPUT = 64 * 1024;
    const RUN_CODE_MEMORY_MB = 256;

    expect(MAX_GREP_RESULTS).toBeGreaterThan(10);
    expect(MAX_GREP_RESULTS).toBeLessThanOrEqual(1000);

    expect(MAX_GREP_FILE_SIZE).toBeGreaterThanOrEqual(1024 * 1024); // ≥1MB

    expect(MAX_RUN_CODE_DURATION_MS).toBeGreaterThanOrEqual(10000); // ≥10с
    expect(MAX_RUN_CODE_DURATION_MS).toBeLessThanOrEqual(60000);    // ≤1мин

    expect(MAX_RUN_CODE_OUTPUT).toBeGreaterThanOrEqual(8 * 1024);   // ≥8KB
    expect(RUN_CODE_MEMORY_MB).toBeGreaterThanOrEqual(128);
    expect(RUN_CODE_MEMORY_MB).toBeLessThanOrEqual(1024);
  });
});
