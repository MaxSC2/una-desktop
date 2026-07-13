import { ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'take_screenshot',
    description: 'Сделать снимок экрана и вернуть base64.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

/**
 * Захват экрана (через Electron desktopCapturer в main.ts).
 */
export async function handler(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  // Реализация в main.ts через desktopCapturer
  // Здесь возвращаем заглушку — реальный код в ipc-handlers.ts
  return {
    success: false,
    error: 'Снимок экрана должен выполняться через IPC — смотрите ipc-handlers.ts',
  };
}
