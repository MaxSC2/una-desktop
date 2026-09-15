import { promises as fs } from 'fs';
import * as path from 'path';
import { isPathInsideHome } from '../../safety/classifier';
import { actionToken, home, ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'write_file',
    description: 'Создать или перезаписать файл. Требует подтверждения вне домашней папки.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь.' },
        content: { type: 'string', description: 'Содержимое файла.' },
      },
      required: ['path', 'content'],
    },
  },
};

/**
 * Запись в файл.
 */
export async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { path: string; content: string };
  const target = path.resolve(typedArgs.path.replace(/^~/, home()));

  if (!isPathInsideHome(target, home())) {
    // Токен привязан к целевому пути: пользователь подтверждает запись именно в этот файл.
    const token = actionToken('write', target);
    if (!ctx.confirmedTokens.has(token)) {
      return {
        success: false,
        needs_confirmation: {
          token,
          action: `Записать файл: ${target}`,
          risk: 'dangerous',
          details: 'Файл находится вне домашней директории пользователя.',
        },
      };
    }
  }

  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, typedArgs.content, 'utf8');
    return { success: true, data: { path: target, bytes: Buffer.byteLength(typedArgs.content, 'utf8') } };
  } catch (e) {
    return { success: false, error: `Не удалось записать файл: ${(e as Error).message}` };
  }
}
