import { ToolContext, ToolDefinition, ToolResult } from './helpers';

export interface ToolEntry {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const registry = new Map<string, ToolEntry>();

export function register(name: string, definition: ToolDefinition, handler: ToolEntry['handler']): void {
  const existing = registry.get(name);
  if (existing) {
    if (existing.definition !== definition || existing.handler !== handler) {
      throw new Error(`Tool already registered: ${name}`);
    }
    return;
  }
  registry.set(name, { definition, handler });
}

export function getDefinition(name: string): ToolDefinition | undefined {
  return registry.get(name)?.definition;
}

export function getHandler(name: string): ToolEntry['handler'] | undefined {
  return registry.get(name)?.handler;
}

export function getAll(): ToolDefinition[] {
  return Array.from(registry.values()).map((entry) => entry.definition);
}

/**
 * Диспетчер инструментов.
 */
export async function dispatch(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const handler = getHandler(name);
  if (!handler) {
    return { success: false, error: `Неизвестный инструмент: ${name}` };
  }
  return handler(args, ctx);
}
