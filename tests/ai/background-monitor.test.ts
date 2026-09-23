/**
 * TASK-009 (DEC-021): приёмочные тесты для electron/ai/background-monitor.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Моки: work-context
 * (getWorkContext/updateActivity), memory/store (saveFact), config
 * (getProactiveConfig). Интервал — fake timers + advanceTimersByTimeAsync.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkContext, updateActivity } from '../../electron/ai/work-context';
import { saveFact } from '../../electron/memory/store';
import { getProactiveConfig } from '../../electron/ai/config';
import type { WorkContext } from '../../electron/ai/work-context';

vi.mock('../../electron/ai/work-context', () => ({
  getWorkContext: vi.fn(),
  updateActivity: vi.fn(),
}));

vi.mock('../../electron/memory/store', () => ({
  saveFact: vi.fn(async () => ({})),
}));

vi.mock('../../electron/ai/config', () => ({
  getProactiveConfig: vi.fn(() => ({
    backgroundMonitorEnabled: true,
    backgroundMonitorIntervalMinutes: 5,
    backgroundSaveEveryChecks: 6,
  })),
}));

const mockGetWorkContext = vi.mocked(getWorkContext);
const mockUpdateActivity = vi.mocked(updateActivity);
const mockSaveFact = vi.mocked(saveFact);
const mockCfg = vi.mocked(getProactiveConfig);

async function getBM() {
  return await import('../../electron/ai/background-monitor');
}

function makeCtx(overrides: Partial<WorkContext> = {}): WorkContext {
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
  vi.useFakeTimers();
  mockGetWorkContext.mockReset().mockResolvedValue(makeCtx());
  mockUpdateActivity.mockClear();
  mockSaveFact.mockClear();
  mockCfg.mockReset().mockReturnValue({
    backgroundMonitorEnabled: true,
    backgroundMonitorIntervalMinutes: 5,
    backgroundSaveEveryChecks: 6,
  } as ReturnType<typeof getProactiveConfig>);
});

afterEach(async () => {
  const bm = await getBM();
  bm.stopBackgroundMonitor();
  vi.useRealTimers();
});

describe('start/stop', () => {
  it('disabled в конфиге → монитор не запускается', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: false, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 6 } as never);
    const bm = await getBM();
    bm.startBackgroundMonitor();
    expect(bm.getMonitorStats().isRunning).toBe(false);
  });

  it('enabled → запуск; повторный start — no-op; stop → остановлен', async () => {
    const bm = await getBM();
    bm.startBackgroundMonitor();
    expect(bm.getMonitorStats().isRunning).toBe(true);
    bm.startBackgroundMonitor(); // no-op
    expect(bm.getMonitorStats().isRunning).toBe(true);
    bm.stopBackgroundMonitor();
    expect(bm.getMonitorStats().isRunning).toBe(false);
  });

  it('интервал из конфига: снимок собирается через 5 минут', async () => {
    const bm = await getBM();
    bm.startBackgroundMonitor();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1);
    expect(mockGetWorkContext).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockGetWorkContext).toHaveBeenCalledTimes(1);
  });

  it('интервал клампится снизу: 0 минут → 1 минута', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: true, backgroundMonitorIntervalMinutes: 0, backgroundSaveEveryChecks: 6 } as never);
    const bm = await getBM();
    bm.startBackgroundMonitor();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(mockGetWorkContext).toHaveBeenCalledTimes(1);
  });
});

describe('collectSnapshot / forceSnapshot', () => {
  it('успех: snapshot сохранён, счётчик вырос, updateActivity вызван', async () => {
    const bm = await getBM();
    const ctx = makeCtx({ activeProjects: ['UNA'] });
    mockGetWorkContext.mockResolvedValue(ctx);
    const snap = await bm.forceSnapshot();
    expect(snap).toBe(ctx);
    expect(bm.getLastSnapshot()).toBe(ctx);
    expect(bm.getMonitorStats().checksPerformed).toBe(1);
    expect(mockUpdateActivity).toHaveBeenCalledTimes(1);
  });

  it('disabled → collectSnapshot выходит рано: snapshot=null, счётчик 0', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: false, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 6 } as never);
    const bm = await getBM();
    const snap = await bm.forceSnapshot();
    expect(snap).toBeNull();
    expect(mockGetWorkContext).not.toHaveBeenCalled();
    expect(bm.getMonitorStats().checksPerformed).toBe(0);
  });

  it('getWorkContext бросает → ошибка поглощена, snapshot=null, счётчик 0', async () => {
    mockGetWorkContext.mockRejectedValue(new Error('scan failed'));
    const bm = await getBM();
    const snap = await bm.forceSnapshot();
    expect(snap).toBeNull();
    expect(bm.getMonitorStats().checksPerformed).toBe(0);
  });

  it('saveEveryChecks: сохранение в память только на N-й проверке', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: true, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 2 } as never);
    mockGetWorkContext.mockResolvedValue(makeCtx({ activeProjects: ['UNA'] }));
    const bm = await getBM();
    await bm.forceSnapshot(); // count=1, 1%2≠0 → без сохранения
    expect(mockSaveFact).not.toHaveBeenCalled();
    await bm.forceSnapshot(); // count=2 → сохранение
    expect(mockSaveFact).toHaveBeenCalledTimes(1);
    expect(mockSaveFact).toHaveBeenCalledWith('project', 'Активные проекты: UNA');
  });
});

describe('saveSnapshotToMemory — маппинг фактов', () => {
  it('isLongSession → факт «Долгая сессия»; dirty repo >5 → факт с basename', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: true, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 1 } as never);
    mockGetWorkContext.mockResolvedValue(makeCtx({
      isLongSession: true,
      workDuration: 181,
      gitRepos: [
        { path: '/home/user/myrepo', branch: 'main', status: 'dirty', uncommittedCount: 7, lastCommit: null },
        { path: '/home/user/clean', branch: 'main', status: 'clean', uncommittedCount: 5, lastCommit: null },
      ] as WorkContext['gitRepos'],
    }));
    const bm = await getBM();
    await bm.forceSnapshot();
    expect(mockSaveFact).toHaveBeenCalledWith('task', 'Долгая сессия: 3 часов непрерывной работы');
    expect(mockSaveFact).toHaveBeenCalledWith('task', 'myrepo: 7 незакоммиченных файлов');
    expect(mockSaveFact).toHaveBeenCalledTimes(2); // clean repo с 5 файлами — не сохраняется
  });

  it('пустой контекст → ни одного saveFact', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: true, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 1 } as never);
    const bm = await getBM();
    await bm.forceSnapshot();
    expect(mockSaveFact).not.toHaveBeenCalled();
  });

  it('ошибка saveFact глотается — сбор продолжается', async () => {
    mockCfg.mockReturnValue({ backgroundMonitorEnabled: true, backgroundMonitorIntervalMinutes: 5, backgroundSaveEveryChecks: 1 } as never);
    mockSaveFact.mockRejectedValue(new Error('db down'));
    mockGetWorkContext.mockResolvedValue(makeCtx({ activeProjects: ['UNA'] }));
    const bm = await getBM();
    const snap = await bm.forceSnapshot();
    expect(snap).not.toBeNull();
    expect(bm.getMonitorStats().checksPerformed).toBe(1);
  });
});

describe('getMonitorStats', () => {
  it('без snapshot → lastSnapshotTime=null; после snapshot → Date', async () => {
    const bm = await getBM();
    expect(bm.getMonitorStats().lastSnapshotTime).toBeNull();
    await bm.forceSnapshot();
    expect(bm.getMonitorStats().lastSnapshotTime).toBeInstanceOf(Date);
  });
});

