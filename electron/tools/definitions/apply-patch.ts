import { apply_patch } from '../../ai/code-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'apply_patch',
    description: 'Применить unified diff патч к файлу. Формат: строки начинаются с пробела (context), + (add), - (remove), заголовки hunk: @@ -start,count +start,count @@. Автоматически создаёт бэкап. Проверяет context перед изменением.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь к файлу.' },
        patch: { type: 'string', description: 'Unified diff патч. Формат: @@ -1,3 +1,4 @@\\n unchanged\\n-removed\\n+added\\n unchanged' },
        create_backup: { type: 'boolean', description: 'Создать бэкап (по умолчанию true).' },
      },
      required: ['path', 'patch'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return apply_patch(args as { path: string; patch: string; create_backup?: boolean });
}
