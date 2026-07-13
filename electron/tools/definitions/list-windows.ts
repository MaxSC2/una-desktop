import { list_windows } from '../../ai/gui-automation';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'list_windows',
    description: 'Список открытых окон. Не требует nut.js, работает через OS API.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

export async function handler(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return list_windows();
}
