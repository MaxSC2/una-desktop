import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatWithTools: vi.fn(),
  chatWithToolsStream: vi.fn(),
  dispatchTool: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  desktopCapturer: {
    getSources: vi.fn(),
  },
}));

vi.mock('../../electron/ai/llm', () => ({
  chatWithTools: mocks.chatWithTools,
  chatWithToolsStream: mocks.chatWithToolsStream,
  analyzeImage: vi.fn(),
}));

vi.mock('../../electron/tools', () => ({
  TOOL_DEFINITIONS: [
    {
      type: 'function',
      function: {
        name: 'system_info',
        description: 'system info',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ],
  getToolDefinitions: () => [
    {
      type: 'function',
      function: {
        name: 'system_info',
        description: 'system info',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ],
  dispatchTool: mocks.dispatchTool,
}));

vi.mock('../../electron/memory/store', () => ({
  saveFact: vi.fn(),
  recallFacts: vi.fn(async () => []),
}));

vi.mock('../../electron/memory/rlm', async () => {
  const actual = await vi.importActual<typeof import('../../electron/memory/rlm')>('../../electron/memory/rlm');
  return {
    ...actual,
    executeMemoryTokens: vi.fn(),
    warmCacheAddMessage: vi.fn(),
  };
});

vi.mock('../../electron/ai/intent', () => ({
  detectIntent: vi.fn(() => 'unknown'),
  filterToolsByIntent: vi.fn((tools) => tools),
}));

import { executeToolLoop } from '../../electron/ai/tool-loop';

describe('executeToolLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns final text when the LLM does not request tools', async () => {
    mocks.chatWithTools.mockResolvedValueOnce({
      content: 'Готово',
      tool_calls: undefined,
      provider: 'local',
    });

    const result = await executeToolLoop({
      systemPrompt: 'system',
      context: [],
      userMessage: 'привет',
      toolContext: { confirmedTokens: new Set() },
    });

    expect(result.finalText).toBe('Готово');
    expect(result.toolCallHistory).toEqual([]);
    expect(result.provider).toBe('local');
    expect(mocks.dispatchTool).not.toHaveBeenCalled();
  });

  it('dispatches requested tools and sends tool results back to the LLM', async () => {
    mocks.chatWithTools
      .mockResolvedValueOnce({
        content: '',
        provider: 'local',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'system_info', arguments: '{}' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Система проверена',
        tool_calls: [],
        provider: 'local',
      });

    mocks.dispatchTool.mockResolvedValueOnce({
      success: true,
      data: { platform: 'test' },
    });

    const result = await executeToolLoop({
      systemPrompt: 'system',
      context: [],
      userMessage: 'проверь систему',
      toolContext: { confirmedTokens: new Set() },
    });

    expect(mocks.dispatchTool).toHaveBeenCalledWith('system_info', {}, { confirmedTokens: expect.any(Set) });
    expect(mocks.chatWithTools).toHaveBeenCalledTimes(2);
    expect(result.finalText).toBe('Система проверена');
    expect(result.toolCallHistory).toHaveLength(1);
    expect(result.toolCallHistory[0].name).toBe('system_info');
  });
});
