import { grep } from '../../ai/code-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'grep',
    description: 'Поиск по файлам через ripgrep (с JS fallback). Возвращает file, line_number, line_content для каждого совпадения. Исключает node_modules, .git, dist. Максимум 100 результатов.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Шаблон поиска (regex по умолчанию, если use_regex=false — точная строка).' },
        path: { type: 'string', description: 'Папка поиска (по умолчанию — текущая). Должна быть внутри домашней папки.' },
        include: { type: 'string', description: 'Glob-фильтр файлов (например *.ts, *.js).' },
        max_results: { type: 'number', description: 'Максимум результатов (по умолчанию 30, максимум 100).' },
        case_insensitive: { type: 'boolean', description: 'Игнорировать регистр (по умолчанию false).' },
        use_regex: { type: 'boolean', description: 'Использовать regex (по умолчанию true).' },
      },
      required: ['pattern'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return grep(args as {
    pattern: string;
    path?: string;
    include?: string;
    max_results?: number;
    case_insensitive?: boolean;
    use_regex?: boolean;
  });
}
