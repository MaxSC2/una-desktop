import { remember } from '../../memory/manager';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'memory_save',
    description:
      'Сохранить важный факт о пользователе или задаче в долговременную память. ' +
      'Факт проходит скоринг-гейт: шум и обрывки отклоняются, значимое — сохраняется ' +
      '(высоко важное дополнительно попадает в граф знаний).',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'Факт для запоминания.' },
        category: { type: 'string', enum: ['user', 'project', 'preference', 'task'], description: 'Категория.' },
        importance: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Важность факта (high — в граф знаний).' },
      },
      required: ['fact', 'category'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const fact = String(args.fact ?? '').trim();
  const category = String(args.category ?? 'user') as 'user' | 'project' | 'preference' | 'task';
  const importanceRaw = String(args.importance ?? 'medium');
  const importance = (['high', 'medium', 'low'].includes(importanceRaw) ? importanceRaw : 'medium') as
    | 'high'
    | 'medium'
    | 'low';

  if (!fact) {
    return { success: false, error: 'Требуется параметр fact' };
  }

  if (!['user', 'project', 'preference', 'task'].includes(category)) {
    return { success: false, error: 'Некорректная категория памяти' };
  }

  try {
    const verdict = await remember(category, fact, { importance, origin: 'tool' });
    if (verdict.stored) {
      return { success: true, data: { saved: true, id: verdict.id, score: verdict.score } };
    }
    return { success: false, error: `Отклонено скоринг-гейтом: ${verdict.reason ?? 'score_below_threshold'}` };
  } catch (e) {
    return { success: false, error: `Не удалось сохранить факт: ${(e as Error).message}` };
  }
}
