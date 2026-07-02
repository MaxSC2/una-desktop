/**
 * Integration tests for ai/code-tools.ts — edit_file operations.
 * Эти тесты создают реальные файлы во временной директории внутри home.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { edit_file, apply_patch } from '../../electron/ai/code-tools';

let tmpDir: string;

beforeEach(async () => {
  // Создаём временную папку ВНУТРИ home (для прохождения security check)
  tmpDir = await fs.mkdtemp(path.join(os.homedir(), 'una-vitest-'));
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  // Clean backups created during tests
  const backupDir = path.join(os.homedir(), '.una', 'backups');
  try {
    const backups = await fs.readdir(backupDir);
    for (const b of backups) {
      if (b.includes('vitest') || b.includes('test-file')) {
        await fs.unlink(path.join(backupDir, b)).catch(() => {});
      }
    }
  } catch {
    // ignore
  }
});

describe('edit_file — operation: append', () => {
  it('appends content to existing file', async () => {
    const file = path.join(tmpDir, 'test-file.txt');
    await fs.writeFile(file, 'line 1\nline 2\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'append',
      content: 'line 3',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('line 1\nline 2\nline 3');
  });

  it('creates file if not exists', async () => {
    const file = path.join(tmpDir, 'new-file.txt');

    const result = await edit_file({
      path: file,
      operation: 'append',
      content: 'first line',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('first line');
  });

  it('creates backup by default', async () => {
    const file = path.join(tmpDir, 'with-backup.txt');
    await fs.writeFile(file, 'original\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'append',
      content: 'added',
    });

    expect(result.success).toBe(true);
    const data = result.data as { backup_path: string };
    expect(data.backup_path).toBeTruthy();
    // Backup должен содержать оригинал
    const backup = await fs.readFile(data.backup_path, 'utf-8');
    expect(backup).toBe('original\n');
  });

  it('skips backup when create_backup=false', async () => {
    const file = path.join(tmpDir, 'no-backup.txt');
    await fs.writeFile(file, 'original\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'append',
      content: 'added',
      create_backup: false,
    });

    expect(result.success).toBe(true);
    const data = result.data as { backup_path: string | null };
    expect(data.backup_path).toBeNull();
  });
});

describe('edit_file — operation: replace', () => {
  it('replaces all occurrences', async () => {
    const file = path.join(tmpDir, 'replace.txt');
    await fs.writeFile(file, 'foo bar foo baz foo', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'replace',
      find: 'foo',
      replace: 'qux',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('qux bar qux baz qux');
  });

  it('fails if find not found', async () => {
    const file = path.join(tmpDir, 'no-match.txt');
    await fs.writeFile(file, 'hello world', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'replace',
      find: 'nonexistent',
      replace: 'x',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не найден/);
  });

  it('fails if find not provided', async () => {
    const file = path.join(tmpDir, 'no-find.txt');
    await fs.writeFile(file, 'content', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'replace',
      replace: 'x',
    });

    expect(result.success).toBe(false);
  });

  it('handles empty replace (deletion)', async () => {
    const file = path.join(tmpDir, 'empty-replace.txt');
    await fs.writeFile(file, 'hello cruel world', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'replace',
      find: 'cruel ',
      replace: '',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('hello world');
  });
});

describe('edit_file — operation: insert_at_line', () => {
  it('inserts at specified line', async () => {
    const file = path.join(tmpDir, 'insert.txt');
    await fs.writeFile(file, 'line 1\nline 2\nline 3\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'insert_at_line',
      line: 2,
      content: 'INSERTED',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('line 1\nINSERTED\nline 2\nline 3\n');
  });

  it('inserts at end if line > file length', async () => {
    const file = path.join(tmpDir, 'insert-end.txt');
    await fs.writeFile(file, 'only line\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'insert_at_line',
      line: 100,
      content: 'appended',
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toContain('appended');
  });

  it('fails if line < 1', async () => {
    const file = path.join(tmpDir, 'insert-invalid.txt');
    await fs.writeFile(file, 'content', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'insert_at_line',
      line: 0,
      content: 'x',
    });

    expect(result.success).toBe(false);
  });
});

describe('edit_file — operation: delete_lines', () => {
  it('deletes range of lines', async () => {
    const file = path.join(tmpDir, 'delete.txt');
    await fs.writeFile(file, 'l1\nl2\nl3\nl4\nl5\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'delete_lines',
      start_line: 2,
      end_line: 4,
    });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('l1\nl5\n');
  });

  it('fails if start_line > end_line', async () => {
    const file = path.join(tmpDir, 'delete-invalid.txt');
    await fs.writeFile(file, 'l1\nl2\n', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'delete_lines',
      start_line: 3,
      end_line: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe('edit_file — security', () => {
  it('blocks protected files', async () => {
    const file = path.join(tmpDir, '.env');
    await fs.writeFile(file, 'SECRET=abc', 'utf-8');

    const result = await edit_file({
      path: file,
      operation: 'append',
      content: 'more',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/защищён/);
  });

  it('blocks paths outside home', async () => {
    const result = await edit_file({
      path: '/tmp/some-file-outside-home.txt',
      operation: 'append',
      content: 'x',
    });

    expect(result.success).toBe(false);
    // Может быть либо "защищён" либо "вне домашней папки"
    expect(result.error).toMatch(/защищён|домашней папки/);
  });
});

describe('apply_patch', () => {
  it('applies simple unified diff', async () => {
    const file = path.join(tmpDir, 'patch.txt');
    await fs.writeFile(file, 'first\nsecond\nthird\nfourth\n', 'utf-8');

    const patch = `@@ -1,4 +1,4 @@
 first
-second
+SECOND
 third
 fourth
`;

    const result = await apply_patch({ path: file, patch });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toBe('first\nSECOND\nthird\nfourth\n');
  });

  it('rejects patch with wrong context', async () => {
    const file = path.join(tmpDir, 'bad-patch.txt');
    await fs.writeFile(file, 'first\nsecond\nthird\n', 'utf-8');

    const patch = `@@ -1,3 +1,3 @@
 WRONG
-second
+SECOND
 third
`;

    const result = await apply_patch({ path: file, patch });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Context mismatch/);
  });

  it('handles multiple hunks', async () => {
    const file = path.join(tmpDir, 'multi-hunk.txt');
    await fs.writeFile(file, 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n', 'utf-8');

    const patch = `@@ -1,2 +1,2 @@
 l1
-l2
+L2
@@ -7,2 +7,2 @@
 l7
-l8
+L8
`;

    const result = await apply_patch({ path: file, patch });

    expect(result.success).toBe(true);
    const after = await fs.readFile(file, 'utf-8');
    expect(after).toContain('L2');
    expect(after).toContain('L8');
    expect(after).not.toContain('l2');
    expect(after).not.toContain('l8');
  });

  it('fails on invalid patch format', async () => {
    const file = path.join(tmpDir, 'invalid-patch.txt');
    await fs.writeFile(file, 'content\n', 'utf-8');

    const result = await apply_patch({
      path: file,
      patch: 'just some text without hunks',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hunks/);
  });
});
