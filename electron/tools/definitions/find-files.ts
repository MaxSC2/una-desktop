import { promises as fs } from 'fs';
import * as path from 'path';
import { home, ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'find_files',
    description: 'Найти файлы по шаблону (поддерживает * и ?).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Шаблон имени (например *.txt).' },
        path: { type: 'string', description: 'Папка поиска.' },
        max_results: { type: 'number', description: 'Максимум результатов (по умолчанию 50).' },
      },
      required: ['pattern'],
    },
  },
};

/**
 * Поиск файлов по шаблону (glob * и ?).
 */
export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { pattern: string; path?: string; max_results?: number };
  const searchRoot = typedArgs.path ? path.resolve(typedArgs.path.replace(/^~/, home())) : home();
  const max = Math.min(typedArgs.max_results ?? 50, 200);
  const pattern = typedArgs.pattern.toLowerCase();

  // Конвертация glob в regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexStr}$`, 'i');

  const results: Array<{ path: string; name: string; size: number; modified: string }> = [];
  const visited = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (results.length >= max || depth > 6 || visited.has(dir)) return;
    visited.add(dir);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= max) return;
        const full = path.join(dir, entry.name);
        // Пропускаем тяжёлые/системные директории
        if (
          entry.isDirectory() &&
          (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === 'AppData' ||
            entry.name === 'Library' ||
            entry.name === '__pycache__' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build')
        ) {
          continue;
        }
        if (entry.isFile() && regex.test(entry.name)) {
          try {
            const s = await fs.stat(full);
            results.push({ path: full, name: entry.name, size: s.size, modified: s.mtime.toISOString() });
          } catch {
            /* ignore */
          }
        } else if (entry.isDirectory()) {
          await walk(full, depth + 1);
        }
      }
    } catch {
      /* ignore permission errors */
    }
  }

  await walk(searchRoot, 0);
  return {
    success: true,
    data: {
      root: searchRoot,
      pattern: typedArgs.pattern,
      count: results.length,
      truncated: results.length >= max,
      results,
    },
  };
}
