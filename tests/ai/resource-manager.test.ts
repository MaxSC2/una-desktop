/**
 * TASK-002 (DEC-021): приёмочные тесты для electron/ai/resource-manager.ts.
 *
 * Контракт P1-2 (DEC-008): тесты фиксируют ТЕКУЧЕЕ поведение продакшн-кода.
 * Расхождение поведения с ожиданием — находка в отчёт, а не повод править код.
 *
 * Мокается внешний мир: child_process (nvidia-smi / powershell), ./config.
 * Тестируемая логика resource-manager.ts — настоящая. Чистым decision-функциям
 * передаётся explicit state; модульное состояние (detectGpu-кэш, lastState)
 * изолируется через vi.resetModules() + dynamic import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exec, execSync } from 'child_process';
import { getConfig } from '../../electron/ai/config';
import type { ResourceState } from '../../electron/ai/resource-manager';

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('../../electron/ai/config', () => ({
  getConfig: vi.fn(() => ({ llm: { provider: 'local' } })),
  getConfigStore: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
}));

const mockExec = vi.mocked(exec);
const mockExecSync = vi.mocked(execSync);
const mockGetConfig = vi.mocked(getConfig);

type ExecCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

/** exec (promisify-совместимый): ответы по подстроке команды; без совпадения — ошибка. */
function execResponds(map: Array<[substring: string, stdout: string]>): void {
  mockExec.mockImplementation(((cmd: string, _opts: object, cb: ExecCallback) => {
    const hit = map.find(([m]) => cmd.includes(m));
    if (hit) cb(null, { stdout: hit[1], stderr: '' });
    else cb(new Error(`unexpected cmd: ${cmd}`), { stdout: '', stderr: '' });
  }) as typeof exec);
}

function execFails(): void {
  mockExec.mockImplementation(((_cmd: string, _opts: object, cb: ExecCallback) => {
    cb(new Error('probe failed'), { stdout: '', stderr: '' });
  }) as typeof exec);
}

/** Список процессов в формате `name|hasWindow` для execSync-мока. */
function processList(entries: Array<[name: string, windowed: boolean]>): string {
  return entries.map(([n, w]) => `${n}|${w ? 1 : 0}`).join('\n');
}

async function getRM() {
  return await import('../../electron/ai/resource-manager');
}

/** Фабрика валидного ResourceState с точечными переопределениями. */
function makeState(overrides: {
  cpu?: Partial<ResourceState['cpu']>;
  ram?: Partial<ResourceState['ram']>;
  gpu?: ResourceState['gpu'];
  power?: Partial<ResourceState['power']>;
  activity?: ResourceState['activity'];
} = {}): ResourceState {
  return {
    cpu: { loadPercent: 20, cores: 8, ...(overrides.cpu ?? {}) },
    ram: { totalGB: 16, freeGB: 8, percentUsed: 50, ...(overrides.ram ?? {}) },
    gpu: overrides.gpu === undefined
      ? { available: true, vramTotalMB: 4096, vramFreeMB: 3500, driverVersion: '537.13' }
      : overrides.gpu,
    power: { onBattery: false, batteryPercent: null, ...(overrides.power ?? {}) },
    activity: overrides.activity ?? 'active',
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockExec.mockReset();
  mockExecSync.mockReset();
  mockGetConfig.mockReturnValue({ llm: { provider: 'local' } } as ReturnType<typeof getConfig>);
});

describe('canRunTask — решающая матрица приоритетов', () => {
  it('critical проходит всегда, даже в gaming', async () => {
    const rm = await getRM();
    expect(rm.canRunTask('critical', makeState({ activity: 'gaming' }))).toBe(true);
  });

  it('без state и без lastState (свежий модуль) → true', async () => {
    const rm = await getRM();
    expect(rm.canRunTask('deferrable')).toBe(true);
  });

  it('gaming блокирует background/maintenance/deferrable', async () => {
    const rm = await getRM();
    const s = makeState({ activity: 'gaming' });
    expect(rm.canRunTask('background', s)).toBe(false);
    expect(rm.canRunTask('maintenance', s)).toBe(false);
    expect(rm.canRunTask('deferrable', s)).toBe(false);
  });

  it('compiling пропускает только background', async () => {
    const rm = await getRM();
    const s = makeState({ activity: 'compiling' });
    expect(rm.canRunTask('background', s)).toBe(true);
    expect(rm.canRunTask('maintenance', s)).toBe(false);
    expect(rm.canRunTask('deferrable', s)).toBe(false);
  });

  it('батарея <20% блокирует только deferrable', async () => {
    const rm = await getRM();
    const s = makeState({ power: { onBattery: true, batteryPercent: 15 } });
    expect(rm.canRunTask('deferrable', s)).toBe(false);
    expect(rm.canRunTask('maintenance', s)).toBe(true);
    expect(rm.canRunTask('background', s)).toBe(true);
  });

  it('батарея 50% или null — правило не срабатывает', async () => {
    const rm = await getRM();
    expect(rm.canRunTask('deferrable', makeState({ power: { onBattery: true, batteryPercent: 50 } }))).toBe(true);
    expect(rm.canRunTask('deferrable', makeState({ power: { onBattery: true, batteryPercent: null } }))).toBe(true);
  });

  it('CPU >90% блокирует maintenance', async () => {
    const rm = await getRM();
    expect(rm.canRunTask('maintenance', makeState({ cpu: { loadPercent: 95 } }))).toBe(false);
    expect(rm.canRunTask('maintenance', makeState({ cpu: { loadPercent: 50 } }))).toBe(true);
  });

  it('RAM >90% блокирует deferrable', async () => {
    const rm = await getRM();
    expect(rm.canRunTask('deferrable', makeState({ ram: { percentUsed: 95 } }))).toBe(false);
    expect(rm.canRunTask('background', makeState({ ram: { percentUsed: 95 } }))).toBe(true);
  });
});

describe('getOptimalContextTokens — бюджет контекста', () => {
  it('cloud-провайдер → 24576 независимо от state', async () => {
    mockGetConfig.mockReturnValue({ llm: { provider: 'cloud' } } as ReturnType<typeof getConfig>);
    const rm = await getRM();
    expect(rm.getOptimalContextTokens(makeState())).toBe(24576);
    expect(rm.getOptimalContextTokens()).toBe(24576);
  });

  it('local + нет state (свежий модуль) → 4096', async () => {
    const rm = await getRM();
    expect(rm.getOptimalContextTokens()).toBe(4096);
  });

  it('local + gpu=null → 4096', async () => {
    const rm = await getRM();
    expect(rm.getOptimalContextTokens(makeState({ gpu: null }))).toBe(4096);
  });

  it('vram>3000 → 8192; >1500 → 4096; иначе 2048', async () => {
    const rm = await getRM();
    expect(rm.getOptimalContextTokens(makeState({ gpu: { available: true, vramTotalMB: 4096, vramFreeMB: 3001, driverVersion: '' } }))).toBe(8192);
    expect(rm.getOptimalContextTokens(makeState({ gpu: { available: true, vramTotalMB: 4096, vramFreeMB: 2000, driverVersion: '' } }))).toBe(4096);
    expect(rm.getOptimalContextTokens(makeState({ gpu: { available: true, vramTotalMB: 4096, vramFreeMB: 800, driverVersion: '' } }))).toBe(2048);
  });
});

describe('shouldMaintainMemory', () => {
  it('нет state (свежий модуль) → false', async () => {
    const rm = await getRM();
    expect(rm.shouldMaintainMemory()).toBe(false);
  });

  it('idle + maintenance разрешён → true', async () => {
    const rm = await getRM();
    expect(rm.shouldMaintainMemory(makeState({ activity: 'idle' }))).toBe(true);
  });

  it('active → false', async () => {
    const rm = await getRM();
    expect(rm.shouldMaintainMemory(makeState({ activity: 'active' }))).toBe(false);
  });

  it('idle, но CPU >90% (maintenance заблокирован) → false', async () => {
    const rm = await getRM();
    expect(rm.shouldMaintainMemory(makeState({ activity: 'idle', cpu: { loadPercent: 95 } }))).toBe(false);
  });
});

describe('getPerformanceAdvice', () => {
  it('нет state (свежий модуль) → пустой массив', async () => {
    const rm = await getRM();
    expect(rm.getPerformanceAdvice()).toEqual([]);
  });

  it('RAM >85% → совет про память', async () => {
    const rm = await getRM();
    const advice = rm.getPerformanceAdvice(makeState({ ram: { percentUsed: 90 } }));
    expect(advice.some(a => a.includes('RAM'))).toBe(true);
  });

  it('VRAM <500MB → совет про VRAM', async () => {
    const rm = await getRM();
    const advice = rm.getPerformanceAdvice(makeState({ gpu: { available: true, vramTotalMB: 4096, vramFreeMB: 300, driverVersion: '' } }));
    expect(advice.some(a => a.includes('VRAM') && a.includes('300'))).toBe(true);
  });

  it('батарея <30% → совет; 40% → без совета; здоровая система → пусто', async () => {
    const rm = await getRM();
    expect(rm.getPerformanceAdvice(makeState({ power: { onBattery: true, batteryPercent: 20 } })).some(a => a.includes('Battery'))).toBe(true);
    expect(rm.getPerformanceAdvice(makeState({ power: { onBattery: true, batteryPercent: 40 } })).some(a => a.includes('Battery'))).toBe(false);
    expect(rm.getPerformanceAdvice(makeState())).toEqual([]);
  });
});

describe('detectActivityByProcesses — классификация по процессам', () => {
  it('игра с окном → gaming', async () => {
    mockExecSync.mockReturnValue(processList([['cs2', true]]));
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(0)).toBe('gaming');
  });

  it('headless-лаунчер без окна (steam в трее) → НЕ gaming', async () => {
    mockExecSync.mockReturnValue(processList([['steam', false]]));
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(0)).toBe('active');
  });

  it('регрессия VRAM-gate: discord+игра с окнами → gaming (игра проверяется первой)', async () => {
    mockExecSync.mockReturnValue(processList([['discord', true], ['dota2', true]]));
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(0)).toBe('gaming');
  });

  it('windowed meeting-приложение → meeting', async () => {
    mockExecSync.mockReturnValue(processList([['zoom', true]]));
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(0)).toBe('meeting');
  });

  it('компилятор + cpu>80 → compiling; cpu≤80 → active', async () => {
    mockExecSync.mockReturnValue(processList([['node', false]]));
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(85)).toBe('compiling');
    expect(rm.detectActivityByProcesses(50)).toBe('active');
  });

  it('ошибка powershell → безопасный active', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('powershell unavailable'); });
    const rm = await getRM();
    expect(rm.detectActivityByProcesses(0)).toBe('active');
  });
});

describe('detectGpu / getGpuInfo — пробники nvidia-smi', () => {
  it('detectGpu: непустой stdout → true', async () => {
    execResponds([['driver_version', '537.13']]);
    const rm = await getRM();
    expect(await rm.detectGpu()).toBe(true);
  });

  it('detectGpu: ошибка exec → false', async () => {
    execFails();
    const rm = await getRM();
    expect(await rm.detectGpu()).toBe(false);
  });

  it('getGpuInfo: GPU отсутствует → null', async () => {
    execFails();
    const rm = await getRM();
    expect(await rm.getGpuInfo()).toBeNull();
  });

  it('getGpuInfo: валидный CSV → структура с VRAM и драйвером', async () => {
    execResponds([
      ['memory.total', '4096, 3500, 537.13'],
      ['driver_version', '537.13'],
    ]);
    const rm = await getRM();
    expect(await rm.getGpuInfo()).toEqual({
      available: true, vramTotalMB: 4096, vramFreeMB: 3500, driverVersion: '537.13',
    });
  });

  it('getGpuInfo: malformed CSV (parts<3) → null; нечисла → 0', async () => {
    execResponds([
      ['memory.total', 'broken'],
      ['driver_version', '537.13'],
    ]);
    let rm = await getRM();
    expect(await rm.getGpuInfo()).toBeNull();

    vi.resetModules();
    execResponds([
      ['memory.total', 'abc, def, ghi'],
      ['driver_version', '537.13'],
    ]);
    rm = await getRM();
    expect(await rm.getGpuInfo()).toEqual({
      available: true, vramTotalMB: 0, vramFreeMB: 0, driverVersion: 'ghi',
    });
  });
});

describe('getBatteryStatus — WMI-пробник', () => {
  it('BatteryStatus!==2 → onBattery=true с процентом', async () => {
    execResponds([
      ['EstimatedChargeRemaining', '85'],
      ['BatteryStatus', '1'],
    ]);
    const rm = await getRM();
    expect(await rm.getBatteryStatus()).toEqual({ onBattery: true, batteryPercent: 85 });
  });

  it('BatteryStatus===2 (сеть) → onBattery=false', async () => {
    execResponds([
      ['EstimatedChargeRemaining', '85'],
      ['BatteryStatus', '2'],
    ]);
    const rm = await getRM();
    expect(await rm.getBatteryStatus()).toEqual({ onBattery: false, batteryPercent: 85 });
  });

  it('не-числовой процент → {onBattery:true, null} без второго вызова', async () => {
    execResponds([['EstimatedChargeRemaining', '']]);
    const rm = await getRM();
    expect(await rm.getBatteryStatus()).toEqual({ onBattery: true, batteryPercent: null });
  });

  it('ошибка exec (нет батареи) → {onBattery:false, null}', async () => {
    execFails();
    const rm = await getRM();
    expect(await rm.getBatteryStatus()).toEqual({ onBattery: false, batteryPercent: null });
  });
});

describe('getResourceState — агрегатор с TTL-кэшем', () => {
  it('структура снимка: cpu/ram/power/activity/timestamp; первый замер cpuPercent=0', async () => {
    mockExecSync.mockReturnValue(processList([['cs2', true]]));
    execFails(); // gpu → null, battery → {false, null}
    const rm = await getRM();
    const s = await rm.getResourceState();
    expect(s.cpu.cores).toBeGreaterThan(0);
    expect(s.cpu.loadPercent).toBe(0); // нет предыдущей пробы — дельта 0
    expect(s.ram.totalGB).toBeGreaterThan(0);
    expect(s.ram.percentUsed).toBeGreaterThanOrEqual(0);
    expect(s.ram.percentUsed).toBeLessThanOrEqual(100);
    expect(s.gpu).toBeNull();
    expect(s.power).toEqual({ onBattery: false, batteryPercent: null });
    expect(s.activity).toBe('gaming'); // cs2 с окном
    expect(typeof s.timestamp).toBe('number');
  });

  it('TTL-кэш 45с: повторный вызов возвращает тот же объект без новых пробников', async () => {
    mockExecSync.mockReturnValue(processList([]));
    execFails();
    const rm = await getRM();
    const first = await rm.getResourceState();
    const second = await rm.getResourceState();
    expect(second).toBe(first);
    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(rm.getLastResourceState()).toBe(first);
  });
});

