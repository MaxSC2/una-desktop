import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMessagesFromHot,
  estimateTokens,
  parseMemoryTokens,
  warmCacheAddMessage,
  warmCacheClear,
  warmCacheGetMessages,
} from '../../electron/memory/rlm';

describe('RLM memory helpers', () => {
  beforeEach(() => {
    warmCacheClear();
  });

  it('estimates Cyrillic text as more token-dense than ASCII text', () => {
    expect(estimateTokens('hello world')).toBeLessThan(estimateTokens('привет мир'));
    expect(estimateTokens('')).toBe(0);
  });

  it('parses memory tokens and removes them from the visible response', () => {
    const parsed = parseMemoryTokens(
      'Запомнила.\n[MEM] save:user:Пользователя зовут Алия\n[MEM] save:project:UNA Desktop'
    );

    expect(parsed.cleanResponse).toBe('Запомнила.');
    expect(parsed.tokens).toEqual([
      { action: 'save', category: 'user', content: 'Пользователя зовут Алия' },
      { action: 'save', category: 'project', content: 'UNA Desktop' },
    ]);
  });

  it('keeps only the requested number of warm-cache messages', () => {
    warmCacheAddMessage('user', 'one');
    warmCacheAddMessage('assistant', 'two');
    warmCacheAddMessage('user', 'three');

    expect(warmCacheGetMessages(2)).toMatchObject([
      { role: 'assistant', content: 'two' },
      { role: 'user', content: 'three' },
    ]);
  });

  it('builds LLM messages from hot context in the expected order', () => {
    const messages = buildMessagesFromHot(
      {
        systemPrompt: 'system',
        facts: ['[user] Любит короткие ответы'],
        recentMessages: [{ role: 'assistant', content: 'раньше' }],
        workContext: 'проект UNA',
        emotionContext: 'Настроение: neutral',
        totalTokens: 10,
      },
      'что дальше?'
    );

    expect(messages.map((m) => m.role)).toEqual(['system', 'system', 'assistant', 'user']);
    expect(messages[1].content).toContain('Любит короткие ответы');
    expect(messages[3].content).toContain('[Контекст работы]');
    expect(messages[3].content).toContain('[Состояние]');
  });
});
