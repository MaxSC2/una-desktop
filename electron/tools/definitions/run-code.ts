import { run_code } from '../../ai/code-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'run_code',
    description: 'Выполнить JavaScript или TypeScript код в изолированном sandbox. Timeout 30 сек, memory limit 256 МБ. Перехватывает console.log/error/warn. Запрещён доступ к fs, child_process, net, http, process.env. Используй для вычислений, проверки гипотез, обработки данных.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Код для выполнения (JavaScript или TypeScript).' },
        language: { type: 'string', enum: ['javascript', 'typescript'], description: 'Язык кода (по умолчанию javascript).' },
        timeout_ms: { type: 'number', description: 'Таймаут в мс (по умолчанию 10000, максимум 30000).' },
        setup_code: { type: 'string', description: 'Код для выполнения перед основным (например, установка переменных).' },
      },
      required: ['code'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return run_code(args as { code: string; language?: 'javascript' | 'typescript'; timeout_ms?: number; setup_code?: string });
}
