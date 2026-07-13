import { key_press } from '../../ai/gui-automation';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'key_press',
    description: 'Нажать клавишу или комбинацию. Требует nut.js или robotjs.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Клавиша (enter, escape, tab, space, и т.д.).' },
        modifiers: { type: 'array', items: { type: 'string' }, description: 'Модификаторы (ctrl, shift, alt, cmd).' },
      },
      required: ['key'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return key_press(args as { key: string; modifiers?: string[] });
}
