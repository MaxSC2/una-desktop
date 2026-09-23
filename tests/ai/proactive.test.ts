/**
 * TASK-010 (DEC-021): приёмочные тесты для electron/ai/proactive.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Моки: electron
 * (Notification с hoisted-реестром инстансов), work-context, memory/store,
 * config, resource-manager. Основной вход — forceSuggest (сбрасывает таймер
 * и ignoredCount); rate-limit проверяем через повторный вызов таймера.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkContext } from '../../electron/ai/work-context';
import { getLastEmotion, getEmotionSummary } from '../../electron/memory/store';
import { getProactiveConfig } from '../../electron/ai/config';
import { getLastResourceState, canRunTask } from '../../electron/ai/resource-manager';
import type { WorkContext } from '../../electron/ai/work-context';

const notifRegistry = vi.hoisted(() => ({
  instances: [] as Array<{
    opts: { title: string; body: string; silent: boolean };
    shown: boolean;
    handlers: Record<string, () => void>;
  }>,
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class {
    shown = false;
    handlers: Record<string, () => void> = {};
    constructor(public opts: { title: string; body: string; silent: boolean }) {
      notifRegistry.instances.push(this as never);
    }
    on(event: string, cb: () => void) { this.handlers[event] = cb; return this; }
    show() { this.shown = true; }
  },
}));

vi.mock('../../electron/ai/work-context', () => ({ getWorkContext: vi.fn() }));
vi.mock('../../electron/memory/store', () => ({
  getLastEmotion: vi.fn(() => null),
  getEmotionSummary: vi.fn(() => []),
}));
vi.mock('../../electron/ai/config', () => ({
  getProactiveConfig: vi.fn(() => ({
    enabled: true,
    checkIntervalMinutes: 10,
    minSuggestionIntervalMinutes: 30,
    maxIgnored: 3,
    quietHoursAfterIgnored: 2,
  })),
}));
vi.mock('../../electron/ai/resource-manager', () => ({
  getLastResourceState: vi.fn(() => null),
  canRunTask: vi.fn(() => true),
}));

const mockGetWorkContext = vi.mocked(getWorkContext);
const mockLastEmotion = vi.mocked(getLastEmotion);
const mockEmotionSummary = vi.mocked(getEmotionSummary);
const mockCfg = vi.mocked(getProactiveConfig);
const mockResourceState = vi.mocked(getLastResourceState);
const mockCanRun = vi.mocked(canRunTask);

async function getPE() {
  return await import('../../electron/ai/proactive');
}

function makeCtx(overrides: Partial<WorkContext> = {}): WorkContext {
  return {
    gitRepos: [], recentFiles: [], activeProjects: [],
    session: { startTime: new Date().toISOString(), filesTouched: 0, commandsRun: 0 },
    patterns: [], workDuration: 0, isLongSession: false, suggestedBreak: false,
    ...overrides,
  } as WorkContext;
}

const nullWindow = () => null;

beforeEach(() => {
  vi.resetModules();
  notifRegistry.instances.length = 0;
  mockGetWorkContext.mockReset().mockResolvedValue(makeCtx());
  mockLastEmotion.mockReset().mockReturnValue(null);
  mockEmotionSummary.mockReset().mockReturnValue([]);
  mockResourceState.mockReset().mockReturnValue(null);
  mockCanRun.mockReset().mockReturnValue(true);
  mockCfg.mockReset().mockReturnValue({
    enabled: true, checkIntervalMinutes: 10, minSuggestionIntervalMinutes: 30,
    maxIgnored: 3, quietHoursAfterIgnored: 2,
  } as never);
});

afterEach(async () => {
  const pe = await getPE();
  pe.stopProactiveEngine();
});

describe('гейты checkAndSuggest', () => {
  it('enabled=false → ничего не происходит', async () => {
    mockCfg.mockReturnValue({ enabled: false, checkIntervalMinutes: 10, minSuggestionIntervalMinutes: 30, maxIgnored: 3, quietHoursAfterIgnored: 2 } as never);
    mockGetWorkContext.mockResolvedValue(makeCtx({ isLongSession: true, workDuration: 200 }));
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(0);
  });

  it('resource-gate: canRunTask=false → пропуск; state=null → продолжаем', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({ isLongSession: true, workDuration: 200 }));
    mockResourceState.mockReturnValue({} as never);
    mockCanRun.mockReturnValue(false);
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(0);

    mockResourceState.mockReturnValue(null);
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
  });

  it('rate-limit: повторный тик раньше minInterval → без нового уведомления', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({ isLongSession: true, workDuration: 200 }));
    vi.useFakeTimers();
    const pe = await getPE();
    pe.startProactiveEngine(nullWindow);
    // первый тик на 10 мин: sinceLast(с момента импорта модуля) ~10 мин < 30 → пропуск
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(notifRegistry.instances).toHaveLength(0);
    // тик на 30 мин: sinceLast = 30 мин ≥ minInterval → доставка
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(notifRegistry.instances).toHaveLength(1);
    // следующий тик: после доставки lastSuggestionTime обновлён → пропуск
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(notifRegistry.instances).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('evaluateContext — приоритеты предложений', () => {
  it('break: isLongSession → high priority, silent=false', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({ isLongSession: true, workDuration: 181 }));
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
    const n = notifRegistry.instances[0];
    expect(n.opts.title).toBe('U.N.A.: Перерыв');
    expect(n.opts.body).toBe('Сессия 3 часов. Засиделись. 5 минут перерыв?');
    expect(n.opts.silent).toBe(false);
    expect(n.shown).toBe(true);
  });

  it('git_reminder: >15 незакоммиченных → medium с action; подряд не повторяется', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({
      gitRepos: [{ path: '/home/user/repo', branch: 'main', status: 'dirty', uncommittedCount: 20, lastCommit: null }] as WorkContext['gitRepos'],
    }));
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
    expect(notifRegistry.instances[0].opts.title).toBe('U.N.A.: Git');
    expect(notifRegistry.instances[0].opts.body).toBe('repo: 20 незакоммиченных файлов. Закоммитить?');
    // повтор: lastSuggestionType==='git_reminder' → то же условие не сработает, других нет → null
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
  });

  it('mood_check: sad>=3 сегодня → medium; подряд не повторяется', async () => {
    mockEmotionSummary.mockReturnValue([{ emotion: 'sad', count: 3 }]);
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
    expect(notifRegistry.instances[0].opts.title).toBe('U.N.A.: Как дела?');
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
  });


  it('memory_recall: lastEmotion старше 4ч → low/silent; свежее → нет', async () => {
    mockLastEmotion.mockReturnValue({ emotion: 'neutral', timestamp: new Date(Date.now() - 5 * 3600000).toISOString() });
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
    const n = notifRegistry.instances[0];
    expect(n.opts.title).toBe('U.N.A.: Давно не виделись');
    expect(n.opts.silent).toBe(true); // low priority → silent

    mockLastEmotion.mockReturnValue({ emotion: 'neutral', timestamp: new Date(Date.now() - 3600000).toISOString() });
    notifRegistry.instances.length = 0;
    vi.resetModules();
    const pe2 = await getPE();
    await pe2.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(0);
  });

  it('приоритет: break побеждает git и mood одновременно', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({
      isLongSession: true, workDuration: 200,
      gitRepos: [{ path: '/r', branch: 'm', status: 'dirty', uncommittedCount: 99, lastCommit: null }] as WorkContext['gitRepos'],
    }));
    mockEmotionSummary.mockReturnValue([{ emotion: 'sad', count: 5 }]);
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(1);
    expect(notifRegistry.instances[0].opts.title).toBe('U.N.A.: Перерыв');
  });

  it('нет условий → предложения нет', async () => {
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(0);
  });

  it('getWorkContext бросает → ошибка поглощена, уведомлений нет', async () => {
    mockGetWorkContext.mockRejectedValue(new Error('fs down'));
    const pe = await getPE();
    await pe.forceSuggest(nullWindow);
    expect(notifRegistry.instances).toHaveLength(0);
  });
});

describe('доставка и реакция пользователя', () => {
  it('click по уведомлению: окно показывается, suggestion уходит в чат', async () => {
    mockGetWorkContext.mockResolvedValue(makeCtx({ isLongSession: true, workDuration: 200 }));
    const win = { show: vi.fn(), focus: vi.fn(), webContents: { send: vi.fn() } };
    const pe = await getPE();
    await pe.forceSuggest(() => win as never);
    const n = notifRegistry.instances[0];
    n.handlers['click']();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith('proactive:suggestion', expect.objectContaining({ type: 'break' }));
  });

  it('start/stop: enabled → запуск, повторный start no-op, stop останавливает', async () => {
    vi.useFakeTimers();
    const pe = await getPE();
    pe.startProactiveEngine(nullWindow);
    pe.startProactiveEngine(nullWindow); // no-op
    pe.stopProactiveEngine();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(notifRegistry.instances).toHaveLength(0); // после stop тиков нет
    vi.useRealTimers();
  });

  it('disabled в конфиге → start не запускает таймер', async () => {
    mockCfg.mockReturnValue({ enabled: false, checkIntervalMinutes: 10, minSuggestionIntervalMinutes: 30, maxIgnored: 3, quietHoursAfterIgnored: 2 } as never);
    vi.useFakeTimers();
    const pe = await getPE();
    pe.startProactiveEngine(nullWindow);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mockGetWorkContext).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

