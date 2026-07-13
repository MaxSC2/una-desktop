import { web_fetch } from '../../ai/web-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'web_fetch',
    description: 'Загрузить содержимое веб-страницы по URL. Возвращает текст (HTML или извлечённый plain text). Максимум 512 КБ. Используй для чтения документации, статей, и т.д.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Полный URL (http:// или https://).' },
        max_bytes: { type: 'number', description: 'Максимум байт (по умолчанию 524288, максимум 524288).' },
        timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 30000, максимум 60000).' },
        extract_text: { type: 'boolean', description: 'Извлечь plain text из HTML (по умолчанию true).' },
      },
      required: ['url'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return web_fetch(args as { url: string; max_bytes?: number; timeout_ms?: number; extract_text?: boolean });
}
