/**
 * Zod schemas для runtime валидации IPC.
 *
 * Защита от некорректных данных из рендерера.
 * Все IPC-хендлеры должны валидировать вход через эти схемы.
 */

import { z } from 'zod';

// ============================================================
// ЧАТ
// ============================================================

export const ChatSendSchema = z.object({
  text: z.string().min(1).max(10000),
});

export const ChatConfirmSchema = z.object({
  token: z.string().min(1).max(200),
});

// ============================================================
// ASR / TTS
// ============================================================

export const ASRTranscribeSchema = z.object({
  audio_base64: z.string().min(100),
});

export const TTSSynthesizeSchema = z.object({
  text: z.string().min(1).max(5000),
});

// ============================================================
// ФАЙЛЫ
// ============================================================

export const FilesListSchema = z.object({
  path: z.string().max(1000).optional(),
});

// ============================================================
// КОНФИГУРАЦИЯ
// ============================================================

export const ConfigSetSchema = z.object({
  llm: z.any().optional(),
  asr: z.any().optional(),
  tts: z.any().optional(),
  hotkey: z.string().max(100).optional(),
  startMinimized: z.boolean().optional(),
  enableVerifier: z.boolean().optional(),
  enableRLM: z.boolean().optional(),
  enableMultiAgent: z.boolean().optional(),
  multiProvider: z.any().optional(),
  wakeWord: z.any().optional(),
}).strict();

// ============================================================
// ПАМЯТЬ
// ============================================================

export const MemoryDeleteFactSchema = z.object({
  id: z.number().int().positive(),
});

// ============================================================
// SHELL
// ============================================================

export const ShellOpenSchema = z.object({
  url: z.string().url(),
});

// ============================================================
// НАПОМИНАНИЯ
// ============================================================

export const RemindersCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  trigger_at: z
    .string()
    .min(1)
    .max(100)
    .refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime());
    }, 'trigger_at must be a valid date/ISO string'),
});

export const RemindersDeleteSchema = z.object({
  id: z.number().int().positive(),
});

// ============================================================
// УТИЛИТЫ
// ============================================================

/**
 * Безопасно парсит и валидирует данные.
 * При ошибке бросает ValidationError с понятным сообщением.
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string = 'IPC'
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ');
    const error = new Error(`[${context}] Validation failed: ${issues}`);
    (error as any).validationErrors = result.error.issues;
    throw error;
  }
  return result.data;
}

/**
 * Type guard: является ли объект валидным по схеме.
 */
export function isValid<T>(schema: z.ZodSchema<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}
