import { saveFact } from '../../memory/store';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'memory_save',
    description: 'Сохранить важный факт о пользователе или задаче в долговременную память.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'Факт для запоминания.' },
        category: { type: 'string', enum: ['user', 'project', 'preference', 'task'], description: 'Категория.' },
      },
      required: ['fact', 'category'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const fact = String(args.fact ?? '').trim();
  const category = String(args.category ?? 'user') as 'user' | 'project' | 'preference' | 'task';

  if (!fact) {
    return { success: false, error: 'Требуется параметр fact' };
  }

  if (!['user', 'project', 'preference', 'task'].includes(category)) {
    return { success: false, error: 'Некорректная категория памяти' };
  }

  try {
    await saveFact(category, fact);
    return { success: true, data: { saved: true } };
  } catch (e) {
    return { success: false, error: `Не удалось сохранить факт: ${(e as Error).message}` };
  }
}
