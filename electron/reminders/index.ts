import { BrowserWindow, Notification } from 'electron';
import { getDb } from '../memory/store';

export interface Reminder {
  id: number;
  text: string;
  trigger_at: string;
  created_at: string;
  done: number;
}

let checkerInterval: ReturnType<typeof setInterval> | null = null;

export function initRemindersTable(): void {
  const database = getDb();
  if (!database) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    )
  `);
}

export function createReminder(text: string, triggerAt: string): Reminder {
  const database = getDb();
  if (!database) throw new Error('DB not initialized');
  const now = new Date().toISOString();
  const result = database.prepare(
    `INSERT INTO reminders (text, trigger_at, created_at) VALUES (?, ?, ?)`
  ).run(text, triggerAt, now);
  return {
    id: result.lastInsertRowid as number,
    text,
    trigger_at: triggerAt,
    created_at: now,
    done: 0,
  };
}

export function listReminders(): Reminder[] {
  const database = getDb();
  if (!database) return [];
  return database.prepare(
    'SELECT * FROM reminders ORDER BY trigger_at ASC'
  ).all() as Reminder[];
}

export function deleteReminder(id: number): void {
  const database = getDb();
  if (!database) return;
  database.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

function getPendingReminders(): Reminder[] {
  const database = getDb();
  if (!database) return [];
  const now = new Date().toISOString();
  return database.prepare(
    'SELECT * FROM reminders WHERE trigger_at <= ? AND done = 0'
  ).all(now) as Reminder[];
}

function markDone(id: number): void {
  const database = getDb();
  if (!database) return;
  database.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id);
}

export function startReminderChecker(mainWindow: BrowserWindow | null): void {
  if (checkerInterval) return;
  checkerInterval = setInterval(() => {
    const pending = getPendingReminders();
    for (const r of pending) {
      markDone(r.id);
      new Notification({
        title: 'U.N.A. — Напоминание',
        body: r.text,
      }).show();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reminder:fire', r);
      }
    }
  }, 30000);
  console.log('[Reminders] Checker started (every 30s)');
}

export function stopReminderChecker(): void {
  if (checkerInterval) {
    clearInterval(checkerInterval);
    checkerInterval = null;
    console.log('[Reminders] Checker stopped');
  }
}
