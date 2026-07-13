import { promises as fs } from 'fs';
import * as path from 'path';
import { home, ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'list_files',
    description: 'Показать содержимое директории. По умолчанию — домашняя папка.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь к папке.' },
      },
      required: [],
    },
  },
};

/**
 * Список файлов в директории.
 */
export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { path?: string };
  const target = typedArgs.path ? path.resolve(typedArgs.path.replace(/^~/, home())) : home();
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      return { success: false, error: `Это не директория: ${target}` };
    }
    const entries = await fs.readdir(target, { withFileTypes: true });
    const items = await Promise.all(
      entries.slice(0, 500).map(async (entry) => {
        const fullPath = path.join(target, entry.name);
        try {
          const s = await fs.stat(fullPath);
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: s.size,
            modified: s.mtime.toISOString(),
            path: fullPath,
          };
        } catch {
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: 0,
            modified: null,
            path: fullPath,
          };
        }
      })
    );
    return { success: true, data: { path: target, count: items.length, items } };
  } catch (e) {
    return { success: false, error: `Не удалось прочитать директорию: ${(e as Error).message}` };
  }
}
