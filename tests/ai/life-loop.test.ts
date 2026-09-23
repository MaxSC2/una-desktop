/**
 * TASK-011 (DEC-021): приёмочные тесты для electron/ai/life-loop.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Все 8 зависимостей
 * замоканы. Несколько тиков: fake timers + configureLifeLoop({tickIntervalMs:100}),
 * немедленный tick флашится через advanceTimersByTimeAsync(0).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getResourceState, canRunTask, shouldMaintainMemory,
  getOptimalContextTokens, getPerformanceAdvice,
} from '../../electron/ai/resource-manager';
import { listFacts } from '../../electron/memory/store';
import { getWorkContext } from '../../electron/ai/work-context';
import { getActiveGoals } from '../../electron/ai/executive';
import { runDeepReview, getReviewSummary } from '../../electron/ai/self-review';
import { resolveState, setState, getCurrentState, getStateConfig } from '../../electron/ai/states';
import { generateThought } from '../../electron/ai/monologue';
import { runMaintenance } from '../../electron/ai/compression';

vi.mock('electron', () => ({ BrowserWindow: class {} }));

vi.mock('../../electron/ai/resource-manager', () => ({
  getResourceState: vi.fn(async () => ({ activity: 'active', power: { onBattery: false, batteryPercent: null } })),
  canRunTask: vi.fn(() => true),
  shouldMaintainMemory: vi.fn(() => false),
  getOptimalContextTokens: vi.fn(() => 4096),
  getPerformanceAdvice: vi.fn(() => []),
}));
vi.mock('../../electron/memory/store', () => ({ listFacts: vi.fn(() => []) }));
vi.mock('../../electron/ai/work-context', () => ({ getWorkContext: vi.fn(async () => ({ gitRepos: [] })) }));
vi.mock('../../electron/ai/executive', () => ({ getActiveGoals: vi.fn(() => []) }));
vi.mock('../../electron/ai/self-review', () => ({
  runDeepReview: vi.fn(),
  getReviewSummary: vi.fn(() => ({ totalReviews: 0, averageScore: 0, topWeaknesses: [] })),
}));
vi.mock('../../electron/ai/states', () => ({
  resolveState: vi.fn(() => 'normal'),
  setState: vi.fn(),
  getCurrentState: vi.fn(() => 'normal'),
  getStateConfig: vi.fn(() => ({ observeEnabled: true, memoryMaintenance: true, proactive: true })),
}));
vi.mock('../../electron/ai/monologue', () => ({ generateThought: vi.fn(() => null) }));
vi.mock('../../electron/ai/compression', () => ({
  runMaintenance: vi.fn(async () => ({ compressed: 0, promoted: 0, demoted: 0 })),
}));

const mResource = vi.mocked(getResourceState);
const mCanRun = vi.mocked(canRunTask);
const mShouldMaintain = vi.mocked(shouldMaintainMemory);
const mPerfAdvice = vi.mocked(getPerformanceAdvice);
const mFacts = vi.mocked(listFacts);
const mWorkCtx = vi.mocked(getWorkContext);
const mGoals = vi.mocked(getActiveGoals);
const mReviewSummary = vi.mocked(getReviewSummary);
const mResolve = vi.mocked(resolveState);
const mSetState = vi.mocked(setState);
const mStateCfg = vi.mocked(getStateConfig);
const mThought = vi.mocked(generateThought);
const mMaintenance = vi.mocked(runMaintenance);

async function getLL() {
  return await import('../../electron/ai/life-loop');
}

const nullWindow = () => null;

/** Флашит немедленный tick после startLifeLoop. */
async function flushTicks(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(0);
}

function setActivity(activity: string, power: { onBattery: boolean; batteryPercent: number | null } = { onBattery: false, batteryPercent: null }) {
  mResource.mockResolvedValue({ activity, power } as never);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  mResource.mockReset().mockResolvedValue({ activity: 'active', power: { onBattery: false, batteryPercent: null } } as never);
  mCanRun.mockReset().mockReturnValue(true);
  mShouldMaintain.mockReset().mockReturnValue(false);
  mPerfAdvice.mockReset().mockReturnValue([]);
  mFacts.mockReset().mockReturnValue([]);
  mWorkCtx.mockReset().mockResolvedValue({ gitRepos: [] } as never);
  mGoals.mockReset().mockReturnValue([]);
  mReviewSummary.mockReset().mockReturnValue({ totalReviews: 0, averageScore: 0, topWeaknesses: [] });
  mResolve.mockReset().mockReturnValue('normal' as never);
  mSetState.mockClear();
  mStateCfg.mockReset().mockReturnValue({ observeEnabled: true, memoryMaintenance: true, proactive: true } as never);
  mThought.mockReset().mockReturnValue(null);
  mMaintenance.mockReset().mockResolvedValue({ compressed: 0, promoted: 0, demoted: 0 });
});

afterEach(async () => {
  const ll = await getLL();
  ll.stopLifeLoop();
  vi.useRealTimers();
});

describe('жизненный цикл', () => {
  it('start → немедленный tick; stats: isRunning, ticks=1, фаза завершается wait', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    const stats = ll.getLifeLoopStats();
    expect(stats.isRunning).toBe(true);
    expect(stats.ticks).toBe(1);
    const cycle = ll.getCurrentCycle()!;
    expect(cycle.tick).toBe(1);
    expect(cycle.phase).toBe('wait');
    expect(cycle.durationMs).toBeGreaterThanOrEqual(0);
    expect(mSetState).toHaveBeenCalledWith('normal');
  });

  it('повторный start — no-op (tickCount не сбрасывается, тиков не прибавляется)', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    ll.startLifeLoop(nullWindow); // no-op
    await flushTicks();
    expect(ll.getLifeLoopStats().ticks).toBe(1);
  });

  it('stop → тиков по таймеру больше нет', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    ll.stopLifeLoop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ll.getLifeLoopStats().ticks).toBe(1);
    expect(ll.getLifeLoopStats().isRunning).toBe(false);
  });

  it('interval: тики идут по расписанию', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(300);
    await flushTicks(6);
    expect(ll.getLifeLoopStats().ticks).toBe(4); // 1 немедленный + 3 по интервалу
  });

  it('idle tracking: idle → счётчик растёт, active → сброс; lastActivity фиксируется', async () => {
    setActivity('idle');
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(100);
    await flushTicks();
    expect(ll.getLifeLoopStats().consecutiveIdleTicks).toBe(2);
    expect(ll.getLifeLoopStats().lastActivity).toBe('idle');
    setActivity('active');
    await vi.advanceTimersByTimeAsync(100);
    await flushTicks();
    expect(ll.getLifeLoopStats().consecutiveIdleTicks).toBe(0);
    expect(ll.getLifeLoopStats().lastActivity).toBe('active');
  });
});

describe('observe phase', () => {
  it('базовое наблюдение: UNA state + idle==1 + battery + maintainable', async () => {
    setActivity('idle', { onBattery: true, batteryPercent: 42 });
    mShouldMaintain.mockReturnValue(true);
    mPerfAdvice.mockReturnValue(['Low VRAM']);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    const obs = ll.getCurrentCycle()!.observations;
    expect(obs).toContain('UNA state: normal');
    expect(obs).toContain('Performance: Low VRAM');
    expect(obs).toContain('User went idle — good time for maintenance');
    expect(obs).toContain('Battery: 42%');
    expect(obs).toContain('System idle — memory maintenance possible');
  });

  it('idle>3 и %6==0 → «User idle for ~N minutes»', async () => {
    setActivity('idle');
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(500); // 5 тиков по интервалу → idleTicks=6
    await flushTicks(10);
    const obs = ll.getCurrentCycle()!.observations;
    expect(obs).toContain('User idle for ~3 minutes');
  });

  it('observeEnabled=false (config) → наблюдений нет', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100, observeEnabled: false });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.observations).toHaveLength(0);
  });

  it('state config observeEnabled=false → наблюдений нет', async () => {
    mStateCfg.mockReturnValue({ observeEnabled: false, memoryMaintenance: true, proactive: true } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.observations).toHaveLength(0);
  });
});


describe('reflect phase', () => {
  it('night + >5 протухших фактов (>30д, <3 использований) → рефлексия', async () => {
    mResolve.mockReturnValue('night' as never);
    const stale = Array.from({ length: 6 }, (_, i) => ({
      fact: `f${i}`, last_used: new Date(Date.now() - 40 * 86400000).toISOString(), use_count: 1,
    }));
    mFacts.mockReturnValue(stale as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.reflections).toContain('Found 6 potentially stale facts (>30d unused, <3 uses)');
  });

  it('свежие факты / ≤5 протухших → рефлексии нет', async () => {
    mResolve.mockReturnValue('night' as never);
    mFacts.mockReturnValue([
      { fact: 'fresh', last_used: new Date().toISOString(), use_count: 10 },
      { fact: 'old-but-used', last_used: new Date(Date.now() - 40 * 86400000).toISOString(), use_count: 5 },
    ] as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.reflections).toHaveLength(0);
  });

  it('canRunTask(maintenance)=false → reflect пропускается даже ночью', async () => {
    mResolve.mockReturnValue('night' as never);
    mCanRun.mockReturnValue(false);
    const stale = Array.from({ length: 6 }, (_, i) => ({ fact: `f${i}`, last_used: new Date(Date.now() - 40 * 86400000).toISOString(), use_count: 1 }));
    mFacts.mockReturnValue(stale as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.reflections).toHaveLength(0);
    expect(mFacts).not.toHaveBeenCalled();
  });

  it('self-review: idle>3 и tick%20==0, есть обзоры → рефлексии о слабостях', async () => {
    setActivity('idle');
    mReviewSummary.mockReturnValue({
      totalReviews: 7, averageScore: 3.5,
      topWeaknesses: [{ pattern: 'long_answers', count: 4 }],
    } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(1900); // 19 тиков → всего 20
    await flushTicks(40);
    const refl = ll.getCurrentCycle()!.reflections;
    expect(refl).toContain('Self-review: 7 reviews, avg 3.5/5');
    expect(refl).toContain('Top weakness: long_answers (4x)');
  });
});

describe('updateMemory phase', () => {
  it('night → токены + dirty repos (basename по обратному слэшу)', async () => {
    mResolve.mockReturnValue('night' as never);
    mShouldMaintain.mockReturnValue(true);
    mWorkCtx.mockResolvedValue({
      gitRepos: [
        { path: 'C:\\Users\\user\\repo1', uncommittedCount: 3 },
        { path: 'C:\\Users\\user\\clean', uncommittedCount: 0 },
      ],
    } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    const upd = ll.getCurrentCycle()!.memoryUpdates;
    expect(upd).toContain('Context tokens optimized to 4096 based on current VRAM');
    expect(upd).toContain('Dirty repos: repo1: 3');
  });

  it('shouldMaintainMemory=false → фаза выходит рано', async () => {
    mResolve.mockReturnValue('night' as never);
    mShouldMaintain.mockReturnValue(false);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(mWorkCtx).not.toHaveBeenCalled();
    expect(ll.getCurrentCycle()!.memoryUpdates).toHaveLength(0);
  });

  it('state config memoryMaintenance=false → фаза пропускается целиком', async () => {
    mResolve.mockReturnValue('night' as never);
    mShouldMaintain.mockReturnValue(true);
    mStateCfg.mockReturnValue({ observeEnabled: true, memoryMaintenance: false, proactive: true } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.memoryUpdates).toHaveLength(0);
  });
});


describe('plan phase', () => {
  it('gaming → планов нет (ранний выход)', async () => {
    setActivity('gaming');
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.plans).toHaveLength(0);
  });

  it('батарея <15% → Critical battery и return', async () => {
    setActivity('idle', { onBattery: true, batteryPercent: 10 });
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.plans).toEqual(['Critical battery — defer all background work']);
  });

  it('deep idle (>10 тиков) → план проактивности', async () => {
    setActivity('idle');
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(1000); // 10 тиков → idleTicks=11
    await flushTicks(25);
    expect(ll.getCurrentCycle()!.plans).toContain('Deep idle — ready for proactive suggestion if enough context');
  });

  it('idle>3 и %6==0 с незавершёнными целями → план Active goals', async () => {
    setActivity('idle');
    mGoals.mockReturnValue([
      { title: 'A', progress: 50 }, { title: 'B', progress: 100 }, { title: 'C', progress: 0 },
    ] as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    await vi.advanceTimersByTimeAsync(500); // idleTicks=6
    await flushTicks(10);
    expect(ll.getCurrentCycle()!.plans).toContain('Active goals: 2 goal(s) in progress');
  });

  it('state config proactive=false → plan пропускается', async () => {
    setActivity('idle', { onBattery: true, batteryPercent: 10 });
    mStateCfg.mockReturnValue({ observeEnabled: true, memoryMaintenance: true, proactive: false } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.plans).toHaveLength(0);
  });
});

describe('thoughts и night-maintenance', () => {
  it('generateThought вернул мысль → попадает в cycle.thoughts с контекстом', async () => {
    mThought.mockReturnValue({ type: 'reflection', text: 'Мысль дня', urgency: 'share_next_message' } as never);
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.thoughts).toEqual(['Мысль дня']);
    expect(mThought).toHaveBeenCalledWith(
      expect.any(Array), expect.any(Array),
      expect.objectContaining({ hour: expect.any(Number), sessionLength: 0 }),
    );
  });

  it('generateThought=null → thoughts пуст', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(ll.getCurrentCycle()!.thoughts).toHaveLength(0);
  });

  it('night: runMaintenance раз в час; ненулевой результат → memoryUpdate', async () => {
    mResolve.mockReturnValue('night' as never);
    mMaintenance.mockResolvedValue({ compressed: 2, promoted: 1, demoted: 0 });
    const ll = await getLL();
    // большой интервал: иначе прокрутка 30+ мин фейковых таймеров = тысячи тиков → таймаут
    ll.configureLifeLoop({ tickIntervalMs: 10_000 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(mMaintenance).toHaveBeenCalledTimes(1);
    expect(ll.getCurrentCycle()!.memoryUpdates).toContain('Maintenance: compressed=2 promoted=1 demoted=0');

    // второй тик через 30 мин — раньше часа → не вызывается
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await flushTicks(4);
    expect(mMaintenance).toHaveBeenCalledTimes(1);

    // через 61 мин от прошлого запуска → вызывается снова
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
    await flushTicks(4);
    expect(mMaintenance).toHaveBeenCalledTimes(2);
  });

  it('normal state (не night/idle) → maintenance не вызывается', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    expect(mMaintenance).not.toHaveBeenCalled();
  });
});

describe('ошибки и stats', () => {
  it('исключение в фазе → цикл завершается с phase=wait, cycle сохраняется', async () => {
    mPerfAdvice.mockImplementation(() => { throw new Error('boom'); });
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    const cycle = ll.getCurrentCycle()!;
    expect(cycle.phase).toBe('wait');
    expect(cycle.tick).toBe(1);
  });

  it('getLifeLoopStats: полная форма', async () => {
    const ll = await getLL();
    ll.configureLifeLoop({ tickIntervalMs: 100 });
    ll.startLifeLoop(nullWindow);
    await flushTicks();
    const stats = ll.getLifeLoopStats();
    expect(stats).toMatchObject({
      isRunning: true, ticks: 1, consecutiveIdleTicks: 0,
      lastActivity: 'active', currentState: 'normal',
    });
    expect(stats.lastCycle).toBe(ll.getCurrentCycle());
  });
});

