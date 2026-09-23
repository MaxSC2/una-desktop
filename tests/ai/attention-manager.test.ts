/**
 * TASK-004 (DEC-021): приёмочные тесты для electron/ai/attention-manager.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Моки: ./config
 * (импортирован, но не используется — защита от electron-store цепочки).
 * Время контролируется fake timers; ResourceState передаётся явно,
 * поэтому getLastResourceState не задействуется.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceState } from '../../electron/ai/resource-manager';

vi.mock('../../electron/ai/config', () => ({
  getConfigStore: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
}));

const T0 = new Date('2026-09-22T12:00:00Z').getTime();

async function getAM() {
  return await import('../../electron/ai/attention-manager');
}

function makeState(overrides: {
  activity?: ResourceState['activity'];
  ramUsed?: number;
  vramFreeMB?: number | null;
} = {}): ResourceState {
  return {
    cpu: { loadPercent: 20, cores: 8 },
    ram: { totalGB: 16, freeGB: 8, percentUsed: overrides.ramUsed ?? 50 },
    gpu: overrides.vramFreeMB === null || overrides.vramFreeMB === undefined
      ? (overrides.vramFreeMB === null ? null : { available: true, vramTotalMB: 4096, vramFreeMB: 3500, driverVersion: 'x' })
      : { available: true, vramTotalMB: 4096, vramFreeMB: overrides.vramFreeMB, driverVersion: 'x' },
    power: { onBattery: false, batteryPercent: null },
    activity: overrides.activity ?? 'active',
    timestamp: Date.now(),
  };
}

/** Сдвиг «сейчас» на N минут вперёд от T0. */
function atMinute(m: number): void {
  vi.setSystemTime(T0 + m * 60 * 1000);
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Do-Not-Disturb', () => {
  it('roundtrip set/get', async () => {
    const am = await getAM();
    expect(am.getDoNotDisturb()).toBe(false);
    am.setDoNotDisturb(true);
    expect(am.getDoNotDisturb()).toBe(true);
  });

  it('DnD перекрывает даже gaming: deep_focus, не прерываем, deferred, тишина', async () => {
    const am = await getAM();
    am.setDoNotDisturb(true);
    const s = am.getAttentionState(makeState({ activity: 'gaming' }));
    expect(s).toMatchObject({
      focus: 'deep_focus', interruptible: false,
      responseUrgency: 'deferred', allowProactive: false, allowSound: false,
    });
  });
});

describe('автомат фокуса по активности ресурсов', () => {
  it('gaming → gaming/deferred/тишина', async () => {
    const am = await getAM();
    const s = am.getAttentionState(makeState({ activity: 'gaming' }));
    expect(s).toMatchObject({ focus: 'gaming', interruptible: false, responseUrgency: 'deferred', allowProactive: false, allowSound: false });
  });

  it('meeting → meeting/deferred/тишина', async () => {
    const am = await getAM();
    const s = am.getAttentionState(makeState({ activity: 'meeting' }));
    expect(s).toMatchObject({ focus: 'meeting', interruptible: false, responseUrgency: 'deferred', allowSound: false });
  });

  it('compiling → deep_focus/deferred, но звук ON', async () => {
    const am = await getAM();
    const s = am.getAttentionState(makeState({ activity: 'compiling' }));
    expect(s).toMatchObject({ focus: 'deep_focus', interruptible: false, allowSound: true });
  });
});

describe('временнáя шкала взаимодействий', () => {
  it('свежая метка (<1 мин) без burst → light_work/normal/proactive/звук', async () => {
    const am = await getAM();
    am.recordInteraction();
    const s = am.getAttentionState(makeState());
    expect(s).toMatchObject({ focus: 'light_work', responseUrgency: 'normal', allowProactive: true, allowSound: true, conversationBurst: false });
  });

  it('burst (3 метки с зазорами <30с) + <1 мин → chatting/immediate, score 1.0', async () => {
    const am = await getAM();
    am.recordInteraction();
    vi.setSystemTime(T0 + 10_000);
    am.recordInteraction();
    vi.setSystemTime(T0 + 20_000);
    am.recordInteraction();
    vi.setSystemTime(T0 + 21_000);
    const s = am.getAttentionState(makeState());
    expect(s).toMatchObject({ focus: 'chatting', responseUrgency: 'immediate', conversationBurst: true, sessionAttentionScore: 1.0 });
  });

  it('редкие метки (зазор 60с) → burst не детектится', async () => {
    const am = await getAM();
    am.recordInteraction();
    atMinute(1); am.recordInteraction();
    atMinute(2); am.recordInteraction();
    atMinute(2.5);
    const s = am.getAttentionState(makeState());
    expect(s.conversationBurst).toBe(false);
    expect(s.focus).toBe('light_work');
  });

  it('6 минут тишины → light_work без звука; 31 минута → idle/deferred', async () => {
    const am = await getAM();
    am.recordInteraction();
    atMinute(6);
    let s = am.getAttentionState(makeState());
    expect(s).toMatchObject({ focus: 'light_work', allowProactive: true, allowSound: false, sessionAttentionScore: 0.5 });
    atMinute(31);
    s = am.getAttentionState(makeState());
    expect(s).toMatchObject({ focus: 'idle', interruptible: true, responseUrgency: 'deferred', allowProactive: false, sessionAttentionScore: 0.3 });
  });

  it('score-лесенка: <5→0.8, <15→0.5, <60→0.3', async () => {
    const am = await getAM();
    am.recordInteraction();
    atMinute(4);
    expect(am.getAttentionState(makeState()).sessionAttentionScore).toBe(0.8);
    atMinute(10);
    expect(am.getAttentionState(makeState()).sessionAttentionScore).toBe(0.5);
    atMinute(30);
    expect(am.getAttentionState(makeState()).sessionAttentionScore).toBe(0.3);
  });

  it('lastInteractionMsAgo отражает реальный сдвиг; getLastFocus — последний фокус', async () => {
    const am = await getAM();
    am.recordInteraction();
    atMinute(6);
    const s = am.getAttentionState(makeState());
    expect(s.lastInteractionMsAgo).toBe(6 * 60 * 1000);
    expect(am.getLastFocus()).toBe('light_work');
  });
});

describe('maxContextTokens — бюджет по ресурсам', () => {
  it('без state (lastResourceState=null) → 4096', async () => {
    const am = await getAM();
    expect(am.getAttentionState().maxContextTokens).toBe(4096);
  });

  it('gpu: vram>3000 → 8192; >1500 → 4096; ≤1500 → 2048', async () => {
    const am = await getAM();
    expect(am.getAttentionState(makeState({ vramFreeMB: 3500 })).maxContextTokens).toBe(8192);
    expect(am.getAttentionState(makeState({ vramFreeMB: 2000 })).maxContextTokens).toBe(4096);
    expect(am.getAttentionState(makeState({ vramFreeMB: 800 })).maxContextTokens).toBe(2048);
  });

  it('без gpu: ram>80 → 2048, иначе 4096', async () => {
    const am = await getAM();
    expect(am.getAttentionState(makeState({ vramFreeMB: null, ramUsed: 85 })).maxContextTokens).toBe(2048);
    expect(am.getAttentionState(makeState({ vramFreeMB: null, ramUsed: 50 })).maxContextTokens).toBe(4096);
  });
});

