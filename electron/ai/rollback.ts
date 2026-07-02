/**
 * Rollback System — автоматический бэкап файлов перед изменениями.
 *
 * Перед каждой операцией edit_file, write_file, apply_patch:
 *  1. Копируем оригинал в ~/.una/backups/{filename}.{timestamp}.{op}.bak
 *  2. Сохраняем метаданные в SQLite (backups table)
 *  3. Если операция провалилась или Verifier отклонил — восстанавливаем
 *
 * Хранение: 7 дней по умолчанию, потом auto-cleanup.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;
let backupDir: string = '';

export interface BackupRecord {
  id: string;
  original_path: string;
  backup_path: string;
  operation: string; // edit_file, write_file, apply_patch
  file_hash: string;
  file_size: number;
  timestamp: string;
  restored: boolean;
}

export function initRollbackSystem(database: Database.Database, backupRoot?: string): void {
  db = database;
  backupDir = backupRoot ?? path.join(os.homedir(), '.una', 'backups');

  // Создаём директорию для бэкапов
  fs.mkdir(backupDir, { recursive: true }).catch(() => {});

  db.exec(`
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      original_path TEXT NOT NULL,
      backup_path TEXT NOT NULL,
      operation TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      restored INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_backups_original ON backups(original_path);
    CREATE INDEX IF NOT EXISTS idx_backups_timestamp ON backups(timestamp);
  `);

  console.log(`[Rollback] Initialized, backup dir: ${backupDir}`);
}

// ============================================================
// CREATE BACKUP
// ============================================================

/**
 * Создаёт бэкап файла перед операцией.
 * Если файла не существует — возвращает null (это нормально для create операций).
 */
export async function createBackup(
  filePath: string,
  operation: string
): Promise<BackupRecord | null> {
  if (!db) throw new Error('RollbackSystem not initialized');

  try {
    // Читаем оригинал
    const content = await fs.readFile(filePath);

    // Считаем hash
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const fileSize = content.length;

    // Создаём имя бэкапа
    const basename = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${basename}.${timestamp}.${operation}.bak`;
    const backupPath = path.join(backupDir, backupFileName);

    // Копируем
    await fs.writeFile(backupPath, content);

    // Сохраняем запись в БД
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO backups (id, original_path, backup_path, operation, file_hash, file_size, timestamp, restored)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, filePath, backupPath, operation, hash, fileSize, now);

    return {
      id,
      original_path: filePath,
      backup_path: backupPath,
      operation,
      file_hash: hash,
      file_size: fileSize,
      timestamp: now,
      restored: false,
    };
  } catch (e) {
    // Если файл не существует — это нормально для create операций
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.error('[Rollback] createBackup error:', e);
    return null;
  }
}

// ============================================================
// RESTORE
// ============================================================

/**
 * Восстанавливает файл из бэкапа.
 */
export async function restoreBackup(backupId: string): Promise<boolean> {
  if (!db) throw new Error('RollbackSystem not initialized');

  const record = db.prepare('SELECT * FROM backups WHERE id = ?').get(backupId) as any;
  if (!record) {
    console.error('[Rollback] Backup not found:', backupId);
    return false;
  }

  try {
    // Читаем бэкап
    const content = await fs.readFile(record.backup_path);

    // Восстанавливаем оригинал
    await fs.writeFile(record.original_path, content);

    // Помечаем как restored
    db.prepare('UPDATE backups SET restored = 1 WHERE id = ?').run(backupId);

    console.log(`[Rollback] Restored: ${record.original_path} from ${record.backup_path}`);
    return true;
  } catch (e) {
    console.error('[Rollback] restoreBackup error:', e);
    return false;
  }
}

/**
 * Восстанавливает ВСЕ бэкапы для заданной операции (например, для rollback всего цикла).
 */
export async function restoreBackupsForOperation(
  operationId: string
): Promise<{ restored: number; failed: number }> {
  if (!db) throw new Error('RollbackSystem not initialized');

  // operationId может быть timestamp или operation name
  const records = db
    .prepare(
      'SELECT * FROM backups WHERE operation LIKE ? OR timestamp LIKE ? ORDER BY timestamp DESC'
    )
    .all(`%${operationId}%`, `%${operationId}%`) as any[];

  let restored = 0;
  let failed = 0;

  for (const record of records) {
    const ok = await restoreBackup(record.id);
    if (ok) restored++;
    else failed++;
  }

  return { restored, failed };
}

// ============================================================
// LIST & CLEANUP
// ============================================================

export function listBackups(limit: number = 50): BackupRecord[] {
  if (!db) throw new Error('RollbackSystem not initialized');

  const rows = db
    .prepare('SELECT * FROM backups ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as any[];

  return rows.map((row) => ({
    ...row,
    restored: Boolean(row.restored),
  }));
}

export function getBackupsForFile(filePath: string): BackupRecord[] {
  if (!db) throw new Error('RollbackSystem not initialized');

  const rows = db
    .prepare('SELECT * FROM backups WHERE original_path = ? ORDER BY timestamp DESC')
    .all(filePath) as any[];

  return rows.map((row) => ({
    ...row,
    restored: Boolean(row.restored),
  }));
}

/**
 * Удаляет бэкапы старше maxAgeDays.
 * По умолчанию — 7 дней.
 */
export async function cleanupOldBackups(maxAgeDays: number = 7): Promise<number> {
  if (!db) throw new Error('RollbackSystem not initialized');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString();

  const oldRecords = db
    .prepare('SELECT * FROM backups WHERE timestamp < ?')
    .all(cutoffStr) as any[];

  let deleted = 0;
  for (const record of oldRecords) {
    try {
      await fs.unlink(record.backup_path);
      db.prepare('DELETE FROM backups WHERE id = ?').run(record.id);
      deleted++;
    } catch (e) {
      // Файл уже удалён — просто убираем запись
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        db.prepare('DELETE FROM backups WHERE id = ?').run(record.id);
        deleted++;
      }
    }
  }

  console.log(`[Rollback] Cleaned up ${deleted} old backups (> ${maxAgeDays} days)`);
  return deleted;
}

// ============================================================
// STATISTICS
// ============================================================

export function getRollbackStats(): {
  total: number;
  restored: number;
  totalSizeBytes: number;
  oldestTimestamp: string | null;
} {
  if (!db) throw new Error('RollbackSystem not initialized');

  const row = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN restored = 1 THEN 1 ELSE 0 END) as restored,
        SUM(file_size) as total_size,
        MIN(timestamp) as oldest
      FROM backups`
    )
    .get() as any;

  return {
    total: row?.total ?? 0,
    restored: row?.restored ?? 0,
    totalSizeBytes: row?.total_size ?? 0,
    oldestTimestamp: row?.oldest ?? null,
  };
}
