/**
 * TASK-017-FIX (DEC-021): F1 — дубль user message (Q-002, вариант 1).
 *
 * Хендлеры main.ts в vitest не поднять (IPC/Electron) — тестируем контракт на уровне
 * rlm.ts: buildMessagesFromHot чистая; эмулируем пайплайн хендлера
 * (getRecentMessages → [fix: .slice(0,-1)] → buildHotContext → buildMessagesFromHot →
 * context = rlmMessages.slice(1,-1) → executeToolLoop добавляет system+user сам).
 *
 * Контракт (после фикса): history БЕЗ текущего сообщения + text →
 * ровно ОДНО вхождение user-текста в итоговом входе LLM.
 * rlm.ts НЕ менялся (вариант 2 запрещён) — кейс «до фикса» документирует баг.
 */
import { describe, expect, it } from 'vitest';
import { buildMessagesFromHot, HotContext } from '../../electron/memory/rlm';

interface Msg { role: string; content: string }

function hot(recentMessages: Msg[]): HotContext {
  return {
    systemPrompt: 'SYS',
    facts: [],
    relatedFacts: [],
    recentMessages,
    workContext: null,
    emotionContext: null,
    activePods: [],
    totalTokens: 0,
  };
}

/** Эмуляция сборки входа LLM как в executeToolLoop: system + context + user(text). */
function llmInput(history: Msg[], text: string) {
  const rlmMessages = buildMessagesFromHot(hot(history), text);
  const context = rlmMessages.slice(1, -1); // как в main.ts: context: rlmMessages.slice(1, -1)
  return [{ role: 'system', content: 'SYS' }, ...context, { role: 'user', content: text }];
}

function countUserText(msgs: Msg[], text: string): number {
  // Точное совпадение: в пайплайне без work/emotion-контекстов enhancedUserMessage === text.
  return msgs.filter((m) => m.role === 'user' && m.content === text).length;
}

describe('F1: дубль user message (контракт пайплайна хендлера)', () => {
  it('ПОСЛЕ фикса: history.slice(0,-1) + text → ровно одно вхождение (оно — последнее)', () => {
    const text = 'какая погода?';
    const raw = [
      { role: 'assistant', content: 'привет' },
      { role: 'user', content: 'ранее' },
      { role: 'assistant', content: 'ответ' },
      { role: 'user', content: text }, // только что сохранённое saveMessage
    ];
    const msgs = llmInput(raw.slice(0, -1), text); // ФИКС вариант 1: slice на callsite
    expect(countUserText(msgs, text)).toBe(1);
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: text });
  });

  it('ДО фикса (регресс-демонстрация): без slice — ДВА вхождения (баг F1)', () => {
    const text = 'какая погода?';
    const raw = [
      { role: 'assistant', content: 'ответ' },
      { role: 'user', content: text },
    ];
    const msgs = llmInput(raw, text);
    expect(countUserText(msgs, text)).toBe(2); // это и лечил фикс
  });

  it('пустая история: slice(0,-1) на [] безопасен → один user без краша', () => {
    const msgs = llmInput([].slice(0, -1), 'привет');
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
    expect(countUserText(msgs, 'привет')).toBe(1);
  });

  it('история только из текущего сообщения → после slice пусто → один user', () => {
    const text = 'напомни';
    const raw = [{ role: 'user', content: text }];
    const msgs = llmInput(raw.slice(0, -1), text);
    expect(countUserText(msgs, text)).toBe(1);
    expect(msgs).toHaveLength(2); // system + user
  });

  it('роли и порядок сохраняются: [u1,a1,u2] → context=[u1,a1], вывод system,u,a,user', () => {
    const text = 'вопрос';
    const raw = [
      { role: 'user', content: 'первый вопрос' },
      { role: 'assistant', content: 'первый ответ' },
      { role: 'user', content: text },
    ];
    const msgs = llmInput(raw.slice(0, -1), text);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toBe('первый вопрос');
    expect(msgs[3].content).toBe(text);
    expect(countUserText(msgs, text)).toBe(1);
  });

  it('ЭДЖ: slice(0,-1) слепо режет последний элемент — инвариант «последний = текущее» держит хендлер', () => {
    const raw = [
      { role: 'user', content: 'старый вопрос' },
      { role: 'assistant', content: 'хвостовой ответ' },
    ];
    const msgs = llmInput(raw.slice(0, -1), 'новый');
    // последний assistant потерян — фактическое поведение; в хендлере этого не происходит,
    // потому что saveMessage(user) всегда вызывается до getRecentMessages.
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'user']);
    expect(countUserText(msgs, 'новый')).toBe(1);
  });
});
