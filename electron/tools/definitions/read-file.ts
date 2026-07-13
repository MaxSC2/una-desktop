import { promises as fs } from 'fs';
import * as path from 'path';
import { isProtectedFile } from '../../safety/classifier';
import { home, truncate, ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'read_file',
    description: 'Прочитать текстовый файл. Не работает с бинарными и защищёнными файлами.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь к файлу.' },
        max_bytes: { type: 'number', description: 'Максимум байт (по умолчанию 32768).' },
      },
      required: ['path'],
    },
  },
};

/**
 * Чтение текстового файла.
 */
export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { path: string; max_bytes?: number };
  const target = path.resolve(typedArgs.path.replace(/^~/, home()));
  const maxBytes = Math.min(typedArgs.max_bytes ?? 32768, 1024 * 1024);

  if (isProtectedFile(target)) {
    return {
      success: false,
      error:
        'Этот файл защищён (вероятно содержит секреты). Содержимое не отображается. Могу сообщить только факт его наличия.',
    };
  }

  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) return { success: false, error: 'Это директория, а не файл.' };
    if (stat.size > 5 * 1024 * 1024) {
      return { success: false, error: `Файл слишком большой (${(stat.size / 1024 / 1024).toFixed(1)} МБ). Максимум 5 МБ.` };
    }
    const buf = await fs.readFile(target);
    const content = buf.toString('utf8', 0, Math.min(buf.length, maxBytes));
    const isText = !/[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1024));
    if (!isText && buf.length > 0) {
      return {
        success: true,
        data: { path: target, size: stat.size, binary: true, note: 'Бинарный файл — содержимое не отображается.' },
      };
    }
    return {
      success: true,
      data: {
        path: target,
        size: stat.size,
        binary: false,
        truncated: buf.length > maxBytes,
        content: truncate(content, maxBytes),
      },
    };
  } catch (e) {
    return { success: false, error: `Не удалось прочитать файл: ${(e as Error).message}` };
  }
}
