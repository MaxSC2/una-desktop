import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'analyze_screen',
    description: 'Сделать снимок экрана и проанализировать через VLM.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Вопрос про экран.' },
      },
      required: ['question'],
    },
  },
};

export async function handler(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  // Анализ экрана выполняется в main.ts (нужен desktopCapturer + VLM)
  // Здесь возвращаем заглушку — реальный код в main.ts обходит dispatchTool
  return {
    success: false,
    error: 'analyze_screen обрабатывается в main.ts через desktopCapturer + VLM. Если вы видите эту ошибку — вызовите через IPC.',
  };
}
