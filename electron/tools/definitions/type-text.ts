import { type_text } from '../../ai/gui-automation';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'type_text',
    description: 'Напечатать текст в активном окне. Требует nut.js или robotjs.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Текст для ввода.' },
        delay_ms: { type: 'number', description: 'Задержка между клавишами (мс).' },
      },
      required: ['text'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return type_text(args as { text: string; delay_ms?: number });
}
