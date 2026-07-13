import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'request_confirmation',
    description: 'Запросить подтверждение опасной операции.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Описание действия.' },
        risk: { type: 'string', enum: ['caution', 'dangerous'], description: 'Уровень риска.' },
        details: { type: 'string', description: 'Подробности.' },
      },
      required: ['action', 'risk', 'details'],
    },
  },
};

/**
 * Запрос подтверждения опасной операции.
 */
export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { action: string; risk: 'caution' | 'dangerous'; details: string };
  const token = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    success: false,
    needs_confirmation: {
      token,
      action: typedArgs.action,
      risk: typedArgs.risk,
      details: typedArgs.details,
    },
  };
}
