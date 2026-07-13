import { createReminder } from '../../reminders';
import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'create_reminder',
    description:
      'Создать напоминание, которое сработает в указанное время (даже если приложение свёрнуто в tray). Пользователь получит системное уведомление. Используй когда пользователь говорит «напомни», «через N минут», «завтра в 9 утра». Сам посчитай ISO-время: для «через 30 минут» возьми текущее время + 30 минут в UTC.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Что напомнить (короткий текст).' },
        trigger_at: {
          type: 'string',
          description:
            'Когда сработать, в формате ISO 8601 (UTC). Например: 2026-07-03T15:30:00.000Z. Для «через N минут» — now + N минут.',
        },
      },
      required: ['text', 'trigger_at'],
    },
  },
};

export async function handler(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  const text = String(args.text ?? '').trim();
  const triggerAt = String(args.trigger_at ?? '').trim();

  if (!text) {
    return { success: false, error: 'Требуется параметр text' };
  }
  if (!triggerAt) {
    return { success: false, error: 'Требуется параметр trigger_at (ISO 8601)' };
  }

  const d = new Date(triggerAt);
  if (isNaN(d.getTime())) {
    return { success: false, error: `Некорректная дата trigger_at: ${triggerAt}` };
  }

  try {
    const reminder = createReminder(text, d.toISOString());
    return {
      success: true,
      data: {
        id: reminder.id,
        text: reminder.text,
        trigger_at: reminder.trigger_at,
        created_at: reminder.created_at,
      },
    };
  } catch (e) {
    return { success: false, error: `Не удалось создать напоминание: ${(e as Error).message}` };
  }
}
