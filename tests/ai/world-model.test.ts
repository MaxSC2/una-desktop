/**
 * TASK-006 (DEC-021): приёмочные тесты для electron/ai/world-model.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Моки: ./work-context
 * (getWorkContext) и ./config (getConfig). os и Intl не мокаются — проверяем
 * структуру и присутствие, не точные значения железа.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkContext } from '../../electron/ai/work-context';
import type { WorkContext } from '../../electron/ai/work-context';

vi.mock('../../electron/ai/work-context', () => ({
  getWorkContext: vi.fn(),
}));

vi.mock('../../electron/ai/config', () => ({
  getConfig: vi.fn(() => ({})),
}));

const mockGetWorkContext = vi.mocked(getWorkContext);

async function getWM() {
  return await import('../../electron/ai/world-model');
}

function makeWorkContext(overrides: Partial<WorkContext> = {}): WorkContext {
  return {
    gitRepos: [],
    recentFiles: [],
    activeProjects: [],
    session: { startTime: new Date().toISOString(), filesTouched: 0, commandsRun: 0 },
    patterns: [],
    workDuration: 0,
    isLongSession: false,
    suggestedBreak: false,
    ...overrides,
  } as WorkContext;
}

beforeEach(() => {
  vi.resetModules();
  mockGetWorkContext.mockReset();
  mockGetWorkContext.mockResolvedValue(null as unknown as WorkContext);
});

describe('сессионное состояние', () => {
  it('incrementMessageCount накапливает счётчик в buildWorldState', async () => {
    const wm = await getWM();
    expect((await wm.buildWorldState()).messageCount).toBe(0);
    wm.incrementMessageCount();
    wm.incrementMessageCount();
    expect((await wm.buildWorldState()).messageCount).toBe(2);
  });

  it('resetSession обнуляет счётчик и меняет sessionId', async () => {
    const wm = await getWM();
    const before = await wm.buildWorldState();
    wm.incrementMessageCount();
    // sessionId строится из Date.now() — сдвигаем часы, чтобы id гарантированно сменился
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    wm.resetSession();
    nowSpy.mockRestore();
    const after = await wm.buildWorldState();
    expect(after.messageCount).toBe(0);
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(after.sessionId).toMatch(/^session_\d+$/);
  });
});

describe('buildWorldState', () => {
  it('возвращает структуру мира: время, ОС, сессия, пустые паттерны', async () => {
    const wm = await getWM();
    const s = await wm.buildWorldState();
    expect(s.timezone).toBeTruthy();
    expect(s.localTime).toBeTruthy();
    expect(['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']).toContain(s.dayOfWeek);
    expect(typeof s.uptimeHours).toBe('number');
    expect(s.osInfo).toBeTruthy();
    expect(s.hostname).toBeTruthy();
    expect(s.locale).toBeTruthy();
    expect(s.workContext).toBeNull();
    expect(s.knownPatterns).toEqual([]);
  });

  it('getWorkContext бросает → workContext=null, ошибка поглощена', async () => {
    mockGetWorkContext.mockRejectedValue(new Error('fs down'));
    const wm = await getWM();
    const s = await wm.buildWorldState();
    expect(s.workContext).toBeNull();
  });

  it('isLongSession → паттерн «долгая рабочая сессия»', async () => {
    mockGetWorkContext.mockResolvedValue(makeWorkContext({ isLongSession: true }));
    const wm = await getWM();
    const s = await wm.buildWorldState();
    expect(s.knownPatterns).toContain('долгая рабочая сессия');
  });

  it('gitRepos>0 → паттерн «активные репозитории»', async () => {
    mockGetWorkContext.mockResolvedValue(makeWorkContext({
      gitRepos: [{ path: '/repo', branch: 'main', status: 'clean' }] as WorkContext['gitRepos'],
    }));
    const wm = await getWM();
    const s = await wm.buildWorldState();
    expect(s.knownPatterns.some(p => p.startsWith('активные репозитории:'))).toBe(true);
  });
});

describe('formatWorldStateForPrompt', () => {
  function makeState(overrides: Record<string, unknown> = {}) {
    return {
      timezone: 'Europe/Moscow',
      localTime: '22.09.2026, 12:00:00',
      dayOfWeek: 'вторник',
      uptimeHours: 0,
      osInfo: 'Windows_NT 10.0.19045',
      hostname: 'host',
      locale: 'ru-RU',
      workContext: null,
      sessionId: 'session_1',
      sessionStart: '2026-09-22T09:00:00.000Z',
      messageCount: 0,
      knownPatterns: [],
      ...overrides,
    };
  }

  it('минимальное состояние → только базовые строки', async () => {
    const wm = await getWM();
    const out = wm.formatWorldStateForPrompt(makeState() as never);
    expect(out).toContain('# Модель мира');
    expect(out).toContain('Время: 22.09.2026, 12:00:00 (вторник)');
    expect(out).toContain('Часовой пояс: Europe/Moscow');
    expect(out).toContain('Система: Windows_NT 10.0.19045');
    expect(out).not.toContain('Время работы ПК');
    expect(out).not.toContain('Проекты:');
    expect(out).not.toContain('Сообщений в сессии');
    expect(out).not.toContain('Замечено:');
  });

  it('uptimeHours>1 → «Время работы ПК: ~Nч»; =1 → без строки', async () => {
    const wm = await getWM();
    expect(wm.formatWorldStateForPrompt(makeState({ uptimeHours: 5 }) as never)).toContain('Время работы ПК: ~5ч');
    expect(wm.formatWorldStateForPrompt(makeState({ uptimeHours: 1 }) as never)).not.toContain('Время работы ПК');
  });

  it('messageCount>5 → «Сообщений в сессии»; =5 → без строки', async () => {
    const wm = await getWM();
    expect(wm.formatWorldStateForPrompt(makeState({ messageCount: 6 }) as never)).toContain('Сообщений в сессии: 6');
    expect(wm.formatWorldStateForPrompt(makeState({ messageCount: 5 }) as never)).not.toContain('Сообщений в сессии');
  });

  it('workContext: проекты (≤5), длительная сессия, dirty-репозитории', async () => {
    const wm = await getWM();
    const wc = makeWorkContext({
      activeProjects: ['a', 'b', 'c', 'd', 'e', 'f'],
      workDuration: 125,
      gitRepos: [
        { path: '/r1', branch: 'main', status: 'dirty' },
        { path: '/r2', branch: 'dev', status: 'clean' },
      ] as WorkContext['gitRepos'],
    });
    const out = wm.formatWorldStateForPrompt(makeState({ workContext: wc }) as never);
    expect(out).toContain('Проекты: a, b, c, d, e');
    expect(out).not.toContain('Проекты: a, b, c, d, e, f');
    expect(out).toContain('Сессия: 2ч 5м');
    expect(out).toContain('Git: 1 репозиториев с незакоммиченными изменениями');
  });

  it('workDuration≤10 → без «Сессия:»; knownPatterns → «Замечено:»', async () => {
    const wm = await getWM();
    const wc = makeWorkContext({ workDuration: 10 });
    const out = wm.formatWorldStateForPrompt(makeState({ workContext: wc, knownPatterns: ['долгая рабочая сессия', 'x'] }) as never);
    expect(out).not.toContain('Сессия:');
    expect(out).toContain('Замечено: долгая рабочая сессия; x');
  });

  it('workDuration<60 → «Сессия: Yм» без часов', async () => {
    const wm = await getWM();
    const wc = makeWorkContext({ workDuration: 45 });
    const out = wm.formatWorldStateForPrompt(makeState({ workContext: wc }) as never);
    expect(out).toContain('Сессия: 45м');
    expect(out).not.toContain('0ч');
  });
});

