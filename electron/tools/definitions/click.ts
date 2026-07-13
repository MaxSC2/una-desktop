import { click } from '../../ai/gui-automation';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'click',
    description: 'Клик мышью по координатам. Требует nut.js или robotjs.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X координата.' },
        y: { type: 'number', description: 'Y координата.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Кнопка мыши (по умолчанию left).' },
        double: { type: 'boolean', description: 'Двойной клик.' },
      },
      required: ['x', 'y'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return click(args as { x: number; y: number; button?: 'left' | 'right' | 'middle'; double?: boolean });
}
