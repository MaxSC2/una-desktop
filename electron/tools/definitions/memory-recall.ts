import { recall } from '../../memory/manager';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'memory_recall',
    description:
      'Вспомнить факты из долговременной памяти по теме: релевантные факты, ' +
      'связанные факты из графа знаний и релевантные эпизоды истории.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Тема для вспоминания.' },
      },
      required: ['query'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const query = String(args.query ?? '').trim();

  if (!query) {
    return { success: false, error: 'Требуется параметр query' };
  }

  try {
    const result = await recall(query, 5);
    return {
      success: true,
      data: { facts: result.facts, related: result.related, episodes: [] },
    };
  } catch (e) {
    return { success: false, error: `Не удалось вспомнить факты: ${(e as Error).message}` };
  }
}
