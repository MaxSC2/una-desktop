import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchTool: vi.fn(),
  detectIntent: vi.fn(() => 'unknown'),
  detectSemanticIntent: vi.fn(async () => ({ intent: 'unknown', confidence: 0, scores: [] })),
}));

const TOOLS = vi.hoisted(() => [
  { type: 'function', function: { name: 'system_info', description: 'sys', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'open_app', description: 'open', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'list_files', description: 'ls', parameters: { type: 'object', properties: {}, required: [] } } },
]);

vi.mock('../../electron/tools', () => ({
  TOOL_DEFINITIONS: TOOLS,
  getToolDefinitions: () => TOOLS,
  dispatchTool: mocks.dispatchTool,
}));

vi.mock('../../electron/ai/intent', () => ({
  detectIntent: mocks.detectIntent,
  filterToolsByIntent: vi.fn((tools) => tools),
}));

vi.mock('../../electron/ai/semantic-router', () => ({
  detectSemanticIntent: mocks.detectSemanticIntent,
  SEMANTIC_CONFIDENCE_THRESHOLD: 0.6,
}));

import { routeMessage } from '../../electron/ai/router';

const ctx = () => ({ confirmedTokens: new Set<string>() });

describe('router (M5) — единая лестница L0/L1/L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('L0-fast: известный алиас приложения обрабатывается без LLM', async () => {
    mocks.dispatchTool.mockResolvedValueOnce({ success: true, data: { launched: true } });

    const d = await routeMessage('открой хром', ctx());

    expect(d.layer).toBe('L0-fast');
    expect(d.direct?.fastPath).toBe(true);
    expect(d.direct?.tool).toBe('open_app');
    expect(d.direct?.text).toContain('Chrome');
    expect(d.tools).toEqual([]);
    expect(mocks.dispatchTool).toHaveBeenCalledWith('open_app', { app_name: 'Chrome' }, expect.anything());
  });

  it('L0-direct: неизвестный алиас передаётся сырым именем (fallback открытия)', async () => {
    mocks.dispatchTool.mockResolvedValueOnce({ success: true, data: {} });

    const d = await routeMessage('запусти mycustomapp', ctx());

    expect(d.layer).toBe('L0-direct');
    expect(d.direct?.fastPath).toBe(false);
    expect(d.direct?.args).toEqual({ app_name: 'mycustomapp' });
    expect(d.intent).toBe('gui');
  });

  it('L0-direct: «сколько памяти» → system_info без LLM', async () => {
    mocks.dispatchTool.mockResolvedValueOnce({
      success: true,
      data: { platform_name: 'win32', cpu_cores: 8, memory: { used_pct: 42 } },
    });

    const d = await routeMessage('сколько памяти занято', ctx());

    expect(d.layer).toBe('L0-direct');
    expect(d.direct?.tool).toBe('system_info');
    expect(d.direct?.text).toContain('42%');
  });

  it('L1-semantic: уверенный embeddings-intent задаёт intent и режим', async () => {
    mocks.detectSemanticIntent.mockResolvedValueOnce({ intent: 'code', confidence: 0.82, scores: [] });

    const d = await routeMessage('поправь функцию в проекте', ctx());

    expect(d.layer).toBe('L1-semantic');
    expect(d.intent).toBe('code');
    expect(d.mode).toBe('code');
    expect(d.direct).toBeNull();
    expect(d.tools.length).toBeGreaterThan(0);
  });

  it('L1-regex: низкая уверенность семантики → regex-fallback', async () => {
    mocks.detectSemanticIntent.mockResolvedValueOnce({ intent: 'news', confidence: 0.4, scores: [] });
    mocks.detectIntent.mockReturnValueOnce('greeting');

    const d = await routeMessage('ну что там', ctx());

    expect(d.layer).toBe('L1-regex');
    expect(d.intent).toBe('greeting');
    expect(d.mode).toBe('chat');
    expect(d.tools).toEqual([]);
  });

  it('L2: unknown intent → default-режим с доступными инструментами', async () => {
    const d = await routeMessage('расскажи историю про драконов', ctx());

    expect(d.intent).toBe('unknown');
    expect(d.mode).toBe('default');
    expect(d.direct).toBeNull();
    expect(d.tools.map((t) => t.function.name)).toContain('system_info');
    expect(mocks.dispatchTool).not.toHaveBeenCalled();
  });
});