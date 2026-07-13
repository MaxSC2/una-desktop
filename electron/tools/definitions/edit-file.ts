import { edit_file } from '../../ai/code-tools';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'edit_file',
    description: 'Точечное редактирование файла: найти-заменить, вставить строку, добавить в конец, удалить диапазон строк. Автоматически создаёт бэкап в ~/.una/backups/. Работает только внутри домашней папки. Не работает с защищёнными файлами (.env, *.key, id_rsa).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Абсолютный путь к файлу.' },
        operation: {
          type: 'string',
          enum: ['replace', 'insert_at_line', 'append', 'delete_lines'],
          description: 'replace — найти и заменить (требует find, replace); insert_at_line — вставить на строку (требует line, content); append — добавить в конец (требует content); delete_lines — удалить диапазон (требует start_line, end_line).',
        },
        find: { type: 'string', description: 'Для operation=replace: текст для поиска (точное совпадение).' },
        replace: { type: 'string', description: 'Для operation=replace: текст замены.' },
        line: { type: 'number', description: 'Для operation=insert_at_line: номер строки (1-indexed).' },
        content: { type: 'string', description: 'Для operation=insert_at_line или append: текст для вставки.' },
        start_line: { type: 'number', description: 'Для operation=delete_lines: начальная строка (1-indexed, inclusive).' },
        end_line: { type: 'number', description: 'Для operation=delete_lines: конечная строка (1-indexed, inclusive).' },
        create_backup: { type: 'boolean', description: 'Создать бэкап перед изменением (по умолчанию true).' },
      },
      required: ['path', 'operation'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  return edit_file(args as {
    path: string;
    operation: 'replace' | 'insert_at_line' | 'append' | 'delete_lines';
    find?: string;
    replace?: string;
    line?: number;
    content?: string;
    start_line?: number;
    end_line?: number;
    create_backup?: boolean;
  });
}
