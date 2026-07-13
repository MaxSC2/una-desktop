import { web_download } from '../../ai/web-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'web_download',
    description: 'Скачать файл по URL в указанную папку (по умолчанию ~/Downloads). Поддерживает любые типы файлов. Максимум 100 МБ. Возвращает путь к скачанному файлу.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Полный URL файла.' },
        dest_dir: { type: 'string', description: 'Папка назначения (должна быть внутри домашней папки). По умолчанию ~/Downloads.' },
        filename: { type: 'string', description: 'Имя файла (если не указано — берётся из URL).' },
        timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 60000, максимум 300000).' },
      },
      required: ['url'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return web_download(args as { url: string; dest_dir?: string; filename?: string; timeout_ms?: number });
}
