import { actionToken, ToolContext, ToolDefinition, ToolResult } from '../helpers';

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
export async function handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { action: string; risk: 'caution' | 'dangerous'; details: string };
  // Токен привязан к описанию действия: после подтверждения повторный вызов
  // этого же запроса возвращает успех вместо нового диалога (раньше цикл не завершался).
  const token = actionToken('confirm', `${typedArgs.risk}|${typedArgs.action}|${typedArgs.details}`);
  if (ctx.confirmedTokens.has(token)) {
    return { success: true, data: { confirmed: true, action: typedArgs.action } };
  }
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
