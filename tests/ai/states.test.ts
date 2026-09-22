/**
 * TASK-003 (DEC-021): приёмочные тесты для electron/ai/states.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Модуль чистый
 * (импорт ResourceState — type-only), моков нет. currentState изолируется
 * через vi.resetModules() + dynamic import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceState } from '../../electron/ai/resource-manager';

async function getStates() {
  return await import('../../electron/ai/states');
}

function makeResource(overrides: {
  activity?: ResourceState['activity'];
  cpu?: number;
  timestamp?: number;
} = {}): ResourceState {
  return {
    cpu: { loadPercent: overrides.cpu ?? 20, cores: 8 },
    ram: { totalGB: 16, freeGB: 8, percentUsed: 50 },
    gpu: null,
    power: { onBattery: false, batteryPercent: null },
    activity: overrides.activity ?? 'active',
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

const minutesAgo = (m: number) => Date.now() - m * 60 * 1000;

beforeEach(() => {
  vi.resetModules();
});

describe('resolveState — приоритеты состояний', () => {
  it('gaming-активность → gaming, даже ночью (высший приоритет)', async () => {
    const st = await getStates();
    expect(st.resolveState(makeResource({ activity: 'gaming' }), 12)).toBe('gaming');
    expect(st.resolveState(makeResource({ activity: 'gaming' }), 2)).toBe('gaming');
  });

  it('idle + cpu<10 + простой >15 мин → sleep', async () => {
    const st = await getStates();
    const r = makeResource({ activity: 'idle', cpu: 5, timestamp: minutesAgo(20) });
    expect(st.resolveState(r, 12)).toBe('sleep');
  });

  it('idle + cpu<10 + свежий timestamp → idle (ранний return до ночной проверки)', async () => {
    const st = await getStates();
    const r = makeResource({ activity: 'idle', cpu: 5 });
    expect(st.resolveState(r, 12)).toBe('idle');
    // Зафиксированное текущее поведение: даже в 2 часа ночи — 'idle', не 'night'.
    expect(st.resolveState(r, 2)).toBe('idle');
  });

  it('night: hour∈{2, 23} + (idle с cpu≥10 | cpu<15)', async () => {
    const st = await getStates();
    expect(st.resolveState(makeResource({ activity: 'idle', cpu: 20 }), 2)).toBe('night');
    expect(st.resolveState(makeResource({ activity: 'active', cpu: 10 }), 23)).toBe('night');
    expect(st.resolveState(makeResource({ activity: 'active', cpu: 14 }), 0)).toBe('night');
  });

  it('ночные часы, но высокая CPU-нагрузка и не idle → НЕ night', async () => {
    const st = await getStates();
    expect(st.resolveState(makeResource({ activity: 'active', cpu: 50 }), 2)).toBe('active');
    expect(st.resolveState(makeResource({ activity: 'compiling', cpu: 90 }), 3)).toBe('active');
  });

  it('дневные часы: active/compiling/meeting → active; границы 6 и 21 — не ночь', async () => {
    const st = await getStates();
    expect(st.resolveState(makeResource({ activity: 'active' }), 12)).toBe('active');
    expect(st.resolveState(makeResource({ activity: 'compiling', cpu: 90 }), 12)).toBe('active');
    expect(st.resolveState(makeResource({ activity: 'meeting' }), 12)).toBe('active');
    expect(st.resolveState(makeResource({ activity: 'idle', cpu: 20 }), 6)).toBe('active');
    expect(st.resolveState(makeResource({ activity: 'idle', cpu: 20 }), 21)).toBe('active');
  });

  it('idle с cpu≥10 днём → fallback active (зафиксировано)', async () => {
    const st = await getStates();
    expect(st.resolveState(makeResource({ activity: 'idle', cpu: 20 }), 12)).toBe('active');
  });
});

describe('currentState / config / каталог', () => {
  it('дефолт — idle; setState → getCurrentState roundtrip; getStateConfig() без аргумента — текущее', async () => {
    const st = await getStates();
    expect(st.getCurrentState()).toBe('idle');
    st.setState('night');
    expect(st.getCurrentState()).toBe('night');
    expect(st.getStateConfig().label).toBe('Уборка');
  });

  it('getStateConfig(unknown) → fallback active', async () => {
    const st = await getStates();
    const cfg = st.getStateConfig('bogus' as never);
    expect(cfg.label).toBe('Работаю');
  });

  it('getStateLabel = icon + label; getStateInstructions = блок состояния', async () => {
    const st = await getStates();
    expect(st.getStateLabel('sleep')).toBe('💤 Сплю');
    expect(st.getStateLabel('gaming')).toBe('🎮 Не мешаю');
    const instr = st.getStateInstructions('night');
    expect(instr).toContain('# Состояние UNA: 🌙 Уборка');
    expect(instr).toContain('Ночь — UNA занимается обслуживанием памяти');
  });

  it('listStates → 6 состояний с label/icon/description', async () => {
    const st = await getStates();
    const list = st.listStates();
    expect(list).toHaveLength(6);
    expect(list.map(s => s.name)).toEqual(['sleep', 'idle', 'thinking', 'gaming', 'night', 'active']);
    for (const s of list) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});
