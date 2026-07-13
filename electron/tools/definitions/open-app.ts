import { open_app } from '../../ai/gui-automation';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'open_app',
    description: 'Открыть приложение. Работает на Windows, macOS, Linux. Требует nut.js или robotjs для некоторых операций.',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Имя приложения (например: notepad, code, chrome).' },
        args: { type: 'array', items: { type: 'string' }, description: 'Аргументы запуска.' },
      },
      required: ['app_name'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return open_app(args as { app_name: string; args?: string[] });
}
