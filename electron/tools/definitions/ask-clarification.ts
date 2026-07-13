import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'ask_clarification',
    description: 'Уточнить у пользователя, если запрос неоднозначен или может привести к разным результатам. ВЫЗЫВАЙ когда не уверена в интерпретации. Лучше спросить, чем сделать неправильно.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Вопрос пользователю.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Варианты ответа (если есть). Пустой массив = открытый вопрос.',
        },
      },
      required: ['question'],
    },
  },
};

/**
 * ask_clarification — возвращает вопрос пользователю.
 * LLM вызывает когда не уверена в интерпретации запроса.
 */
export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const typedArgs = args as { question: string; options?: string[] };
  if (!typedArgs.question) {
    return { success: false, error: 'Требуется параметр question' };
  }
  return {
    success: true,
    data: {
      type: 'clarification',
      question: typedArgs.question,
      options: typedArgs.options || [],
      needs_user_input: true,
    },
  };
}
