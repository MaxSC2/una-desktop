import { dialog, app } from 'electron';
import * as fs from 'fs/promises';
import { getDb, initMemory, closeMemory } from '../memory/store';
import { getConfigStore } from '../ai/config';

interface BackupData {
  version: number;
  exportedAt: string;
  db: {
    conversations: BackupConversation[];
    messages: BackupMessage[];
    facts: BackupFact[];
    patterns: BackupPattern[];
    emotions: BackupEmotion[];
  };
  config: BackupConfig;
}

interface BackupConversation {
  id: number;
  started_at: string;
  ended_at?: string;
  summary?: string;
}

interface BackupMessage {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  tool_calls?: string;
  timestamp: string;
}

interface BackupFact {
  id: number;
  category: string;
  content: string;
  embedding?: string;
  created_at: string;
  last_used?: string;
  use_count?: number;
}

interface BackupPattern {
  id: number;
  trigger: string;
  action: string;
  success_count: number;
  fail_count: number;
}

interface BackupEmotion {
  id: number;
  timestamp: string;
  emotion: string;
  trigger?: string;
  intensity?: number;
  message_preview?: string;
  conversation_id?: number;
}

interface BackupConfig {
  currentConversationId?: number | null;
  confirmedActions?: unknown;
  hotkey?: string;
  startMinimized?: boolean;
  onboardingCompleted?: boolean;
  userProfile?: unknown;
  llm?: {
    provider?: string;
    localUrl?: string;
    localModel?: string;
    cloudApiKey?: string;
    cloudModel?: string;
    cloudBaseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  };
  tts?: unknown;
  asr?: unknown;
  memory?: unknown;
  telegramBotToken?: string;
  cloudApiKey?: string;
}

const TABLES = ['conversations', 'messages', 'facts', 'patterns', 'emotions'] as const;

const REQUIRED_BACKUP_KEYS = ['version', 'db', 'config'] as const;
const REQUIRED_DB_TABLES = TABLES;
const VALID_CATEGORIES = ['user', 'project', 'preference', 'task'];
const MAX_BACKUP_SIZE = 50 * 1024 * 1024; // 50 MB

// ============================================================
// ВАЛИДАЦИЯ
// ============================================================

function validateBackupStructure(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Бэкап должен быть объектом' };
  }

  const obj = data as Record<string, unknown>;

  // Проверяем обязательные ключи
  for (const key of REQUIRED_BACKUP_KEYS) {
    if (!(key in obj)) {
      return { valid: false, error: `Отсутствует обязательный ключ: ${key}` };
    }
  }

  // Проверяем версию
  if (typeof obj.version !== 'number') {
    return { valid: false, error: 'version должен быть числом' };
  }

  // Проверяем дату экспорта
  if (typeof obj.exportedAt !== 'string') {
    return { valid: false, error: 'exportedAt должен быть строкой' };
  }

  // Проверяем, что дата валидна
  if (isNaN(new Date(obj.exportedAt).getTime())) {
    return { valid: false, error: 'exportedAt — невалидная дата' };
  }

  // Проверяем db
  const db = obj.db;
  if (!db || typeof db !== 'object') {
    return { valid: false, error: 'db должен быть объектом' };
  }

  const dbRecord = db as Record<string, unknown>;
  for (const table of REQUIRED_DB_TABLES) {
    if (!Array.isArray(dbRecord[table])) {
      return { valid: false, error: `db.${String(table)} должен быть массивом` };
    }
  }

  // Проверяем config
  const config = obj.config;
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'config должен быть объектом' };
  }

  return { valid: true };
}

function validateDbData(db: BackupData['db']): { valid: boolean; error?: string } {
  for (const table of REQUIRED_DB_TABLES) {
    const rows = db[table] as unknown as Array<Record<string, unknown>>;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // id должен быть числом
      if (typeof row.id !== 'number') {
        return { valid: false, error: `${table}[${i}].id должен быть числом` };
      }

      // content должен быть строкой (для messages, facts)
      if (table === 'messages' && typeof row.content !== 'string') {
        return { valid: false, error: `${table}[${i}].content должен быть строкой` };
      }
      if (table === 'facts' && typeof row.content !== 'string') {
        return { valid: false, error: `${table}[${i}].content должен быть строкой` };
      }

      // category должен быть валидным (для facts)
      if (table === 'facts' && typeof row.category === 'string' && !VALID_CATEGORIES.includes(row.category)) {
        return { valid: false, error: `${table}[${i}].category: недопустимое значение "${row.category}"` };
      }

      // conversation_id должен быть числом (для messages, emotions)
      if ((table === 'messages' || table === 'emotions') && row.conversation_id !== undefined && typeof row.conversation_id !== 'number') {
        return { valid: false, error: `${table}[${i}].conversation_id должен быть числом` };
      }
    }
  }

  return { valid: true };
}

// ============================================================
// DUMP / RESTORE
// ============================================================

async function dumpDb(): Promise<BackupData['db']> {
  const database = getDb();
  if (!database) throw new Error('DB not initialized');

  const db: any = {};
  for (const table of TABLES) {
    db[table] = database.prepare(`SELECT * FROM ${table}`).all();
  }
  return db as BackupData['db'];
}

async function restoreDb(data: BackupData['db']): Promise<void> {
  const database = getDb();
  if (!database) throw new Error('DB not initialized');

  const insertConversation = database.prepare(
    `INSERT OR REPLACE INTO conversations (id, started_at, ended_at, summary) VALUES (?, ?, ?, ?)`
  );
  const insertMessage = database.prepare(
    `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, tool_calls, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertFact = database.prepare(
    `INSERT OR REPLACE INTO facts (id, category, content, embedding, created_at, last_used, use_count) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPattern = database.prepare(
    `INSERT OR REPLACE INTO patterns (id, trigger, action, success_count, fail_count) VALUES (?, ?, ?, ?, ?)`
  );
  const insertEmotion = database.prepare(
    `INSERT OR REPLACE INTO emotions (id, timestamp, emotion, trigger, intensity, message_preview, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = database.transaction(() => {
    for (const table of TABLES) {
      database.prepare(`DELETE FROM ${table}`).run();
    }

    for (const row of data.conversations) {
      insertConversation.run(row.id, row.started_at, row.ended_at, row.summary);
    }
    for (const row of data.messages) {
      insertMessage.run(row.id, row.conversation_id, row.role, row.content, row.tool_calls, row.timestamp);
    }
    for (const row of data.facts) {
      insertFact.run(row.id, row.category, row.content, row.embedding, row.created_at, row.last_used, row.use_count);
    }
    for (const row of data.patterns) {
      insertPattern.run(row.id, row.trigger, row.action, row.success_count, row.fail_count);
    }
    for (const row of data.emotions) {
      insertEmotion.run(row.id, row.timestamp, row.emotion, row.trigger, row.intensity, row.message_preview, row.conversation_id);
    }
  });

  transaction();
}

export async function exportBackup(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const dbData = await dumpDb();
    const configStore = getConfigStore();
    const config = configStore.store;

    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      db: dbData,
      config,
    };

    const result = await dialog.showSaveDialog({
      title: 'Экспорт данных U.N.A.',
      defaultPath: `una-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'UNA Backup', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Отменено пользователем' };
    }

    await fs.writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf-8');
    return { success: true, path: result.filePath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function importBackup(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Импорт данных U.N.A.',
      filters: [{ name: 'UNA Backup', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Отменено пользователем' };
    }

    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);

    // Проверка размера файла
    if (stats.size > MAX_BACKUP_SIZE) {
      return { success: false, error: `Файл бэкапа слишком большой (${(stats.size / 1024 / 1024).toFixed(1)} MB), максимум ${(MAX_BACKUP_SIZE / 1024 / 1024)} MB` };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const backup: unknown = JSON.parse(content);

    // Валидация структуры бэкапа
    const structureValidation = validateBackupStructure(backup);
    if (!structureValidation.valid) {
      return { success: false, error: `Неверная структура бэкапа: ${structureValidation.error}` };
    }

    const validatedBackup = backup as BackupData;

    // Валидация данных БД
    const dbValidation = validateDbData(validatedBackup.db);
    if (!dbValidation.valid) {
      return { success: false, error: `Ошибка в данных БД: ${dbValidation.error}` };
    }

    // Предупреждение о перезаписи API-ключей
    if (validatedBackup.config?.cloudApiKey) {
      console.warn('[Backup] Внимание: API-ключ из бэкапа будет использован');
    }

    await restoreDb(validatedBackup.db);

    const configStore = getConfigStore();
    configStore.store = validatedBackup.config as any;

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
