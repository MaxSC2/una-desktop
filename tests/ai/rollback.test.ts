/**
 * TASK-014 (DEC-021): приёмочные тесты для electron/ai/rollback.ts.
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение. Изоляция: :memory: БД +
 * ОБЯЗАТЕЛЬНЫЙ tmp backupRoot (fs.mkdtemp) — реальный ~/.una/backups запрещён.
 *
 * Зафиксированные эджи:
 * - restoreBackupsForOperation: operationId вставляется в LIKE '%…%' — LIKE-спецсимволы
 *   ('%', '_') работают как wildcards: operationId '%' матчит ВСЕ бэкапы.
 * - cleanupOldBackups: если файл бэкапа уже удалён (ENOENT) — строка всё равно
 *   удаляется, счётчик растёт.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';

type RB = typeof import('../../electron/ai/rollback');

let db: InstanceType<typeof Database>;
let rb: RB;
let tmpDir: string;
let backupRoot: string;
let workFile: string;

beforeEach(async () => {
  vi.resetModules();
  rb = await import('../../electron/ai/rollback');
  db = new Database(':memory:');
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'una-rb-'));
  backupRoot = path.join(tmpDir, 'backups');
  workFile = path.join(tmpDir, 'work.txt');
  await fs.writeFile(workFile, 'оригинал');
  rb.initRollbackSystem(db, backupRoot);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function makeOld(id: string, daysAgo: number): Promise<void> {
  const old = new Date(Date.now() - daysAgo * 86400000).toISOString();
  db.prepare('UPDATE backups SET timestamp = ? WHERE id = ?').run(old, id);
}

describe('init / createBackup', () => {
  it('без init → throw «RollbackSystem not initialized»', async () => {
    vi.resetModules();
    const fresh: RB = await import('../../electron/ai/rollback');
    await expect(fresh.createBackup('x', 'op')).rejects.toThrow('RollbackSystem not initialized');
    expect(() => fresh.listBackups()).toThrow('RollbackSystem not initialized');
    expect(() => fresh.getRollbackStats()).toThrow('RollbackSystem not initialized');
  });

  it('существующий файл → BackupRecord: hash sha256[0..16], size, restored false, .bak на диске', async () => {
    const rec = await rb.createBackup(workFile, 'edit_file');
    expect(rec).not.toBeNull();
    const expectedHash = crypto.createHash('sha256').update(Buffer.from('оригинал')).digest('hex').slice(0, 16);
    expect(rec!.file_hash).toBe(expectedHash);
    expect(rec!.file_size).toBe(Buffer.from('оригинал').length);
    expect(rec!.restored).toBe(false);
    expect(path.basename(rec!.backup_path)).toMatch(/^work\.txt\..+\.edit_file\.bak$/);
    expect(rec!.backup_path.startsWith(backupRoot)).toBe(true);
    expect(await fs.readFile(rec!.backup_path, 'utf8')).toBe('оригинал');
  });

  it('несуществующий файл (ENOENT) → null', async () => {
    expect(await rb.createBackup(path.join(tmpDir, 'nope.txt'), 'edit_file')).toBeNull();
  });

  it('basename санитизируется (не [a-zA-Z0-9._-] → _)', async () => {
    const weird = path.join(tmpDir, 'мой файл (1).txt');
    await fs.writeFile(weird, 'x');
    const rec = await rb.createBackup(weird, 'write_file');
    expect(path.basename(rec!.backup_path)).toMatch(/^[a-zA-Z0-9._-]+\.write_file\.bak$/);
  });
});

describe('restoreBackup', () => {
  it('round-trip: изменённый файл восстанавливается, restored → true', async () => {
    const rec = (await rb.createBackup(workFile, 'edit_file'))!;
    await fs.writeFile(workFile, 'испорчено');
    expect(await rb.restoreBackup(rec.id)).toBe(true);
    expect(await fs.readFile(workFile, 'utf8')).toBe('оригинал');
    expect(rb.listBackups()[0].restored).toBe(true);
  });

  it('неизвестный id → false', async () => {
    expect(await rb.restoreBackup('nope')).toBe(false);
  });
});

describe('restoreBackupsForOperation', () => {
  it('матчинг по operation: все бэкапы операции восстановлены, счётчики верны', async () => {
    const f2 = path.join(tmpDir, 'w2.txt');
    await fs.writeFile(f2, 'второй');
    await rb.createBackup(workFile, 'op-A');
    await rb.createBackup(f2, 'op-A');
    await rb.createBackup(workFile, 'op-B');
    const res = await rb.restoreBackupsForOperation('op-A');
    expect(res).toEqual({ restored: 2, failed: 0 });
  });

  it('матчинг по timestamp-подстроке (LIKE по обеим колонкам)', async () => {
    const rec = (await rb.createBackup(workFile, 'edit_file'))!;
    const tsPrefix = rec.timestamp.slice(0, 10); // '2026-09-24'
    const res = await rb.restoreBackupsForOperation(tsPrefix);
    expect(res.restored).toBe(1);
  });

  it('нет совпадений → {0,0}', async () => {
    await rb.createBackup(workFile, 'edit_file');
    expect(await rb.restoreBackupsForOperation('no-such-op')).toEqual({ restored: 0, failed: 0 });
  });

  it('ЭДЖ: operationId «%» — LIKE-wildcard матчит ВСЕ бэкапы', async () => {
    await rb.createBackup(workFile, 'op-A');
    await rb.createBackup(workFile, 'op-B');
    const res = await rb.restoreBackupsForOperation('%');
    expect(res.restored).toBe(2); // фактическое поведение, не фикс
  });
});

describe('listBackups / getBackupsForFile', () => {
  it('DESC по timestamp, лимит (дефолт 50)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    await rb.createBackup(workFile, 'op1');
    vi.setSystemTime(new Date('2026-09-24T11:00:00Z'));
    await rb.createBackup(workFile, 'op2');
    vi.useRealTimers();
    const all = rb.listBackups();
    expect(all).toHaveLength(2);
    expect(all[0].operation).toBe('op2'); // новый первым
    expect(rb.listBackups(1)).toHaveLength(1);
    expect(rb.listBackups()[0].restored).toBe(false);
  });

  it('getBackupsForFile: только бэкапы указанного пути', async () => {
    const f2 = path.join(tmpDir, 'other.txt');
    await fs.writeFile(f2, 'x');
    await rb.createBackup(workFile, 'op');
    await rb.createBackup(f2, 'op');
    const list = rb.getBackupsForFile(workFile);
    expect(list).toHaveLength(1);
    expect(list[0].original_path).toBe(workFile);
  });
});

describe('cleanupOldBackups', () => {
  it('старше maxAgeDays: файл+строка удаляются, счётчик; свежие не трогает', async () => {
    const oldRec = (await rb.createBackup(workFile, 'old'))!;
    await rb.createBackup(workFile, 'fresh');
    await makeOld(oldRec.id, 10);
    const deleted = await rb.cleanupOldBackups(7);
    expect(deleted).toBe(1);
    await expect(fs.access(oldRec.backup_path)).rejects.toThrow();
    expect(rb.listBackups()).toHaveLength(1);
    expect(rb.listBackups()[0].operation).toBe('fresh');
  });

  it('ЭДЖ: файл уже удалён вручную (ENOENT) → строка всё равно удаляется, счётчик растёт', async () => {
    const rec = (await rb.createBackup(workFile, 'old'))!;
    await makeOld(rec.id, 10);
    await fs.unlink(rec.backup_path);
    expect(await rb.cleanupOldBackups(7)).toBe(1);
    expect(rb.listBackups()).toHaveLength(0);
  });

  it('дефолт 7 дней: 6 дней не трогает, 8 — удаляет', async () => {
    const a = (await rb.createBackup(workFile, 'a'))!;
    const b = (await rb.createBackup(workFile, 'b'))!;
    await makeOld(a.id, 6);
    await makeOld(b.id, 8);
    expect(await rb.cleanupOldBackups()).toBe(1);
    expect(rb.listBackups().map(x => x.operation)).toEqual(['a']);
  });
});

describe('getRollbackStats', () => {
  it('пустая БД → total 0, totalSizeBytes 0, oldestTimestamp null', () => {
    expect(rb.getRollbackStats()).toEqual({ total: 0, restored: 0, totalSizeBytes: 0, oldestTimestamp: null });
  });

  it('с бэкапами: суммы и oldest; restored учитывается', async () => {
    const rec = (await rb.createBackup(workFile, 'op'))!;
    await rb.restoreBackup(rec.id);
    const stats = rb.getRollbackStats();
    expect(stats.total).toBe(1);
    expect(stats.restored).toBe(1);
    expect(stats.totalSizeBytes).toBe(Buffer.from('оригинал').length);
    expect(stats.oldestTimestamp).toBe(rec.timestamp);
  });
});

