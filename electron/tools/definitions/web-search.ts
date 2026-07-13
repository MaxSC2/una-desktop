import { web_search } from '../../ai/web-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Поиск в интернете через встроенный search engine. Возвращает заголовок, URL, snippet для каждого результата. Используй когда нужно найти актуальную информацию, проверить факты, или найти документацию.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Поисковый запрос.' },
        num: { type: 'number', description: 'Количество результатов (по умолчанию 5, максимум 20).' },
        recency_days: { type: 'number', description: 'Фильтр по давности: только результаты за последние N дней.' },
      },
      required: ['query'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return web_search(args as { query: string; num?: number; recency_days?: number });
}
