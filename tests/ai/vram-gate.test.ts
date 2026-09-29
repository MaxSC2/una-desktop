/**
 * TASK-016 (DEC-021): приёмочные тесты для electron/ai/vram-gate.ts.
 *
 * Моки: ./config (getConfig), ./resource-manager (getResourceState), global fetch.
 * Реальной сети/Ollama нет. Кулдауны (60с/120с) — fake timers (setSystemTime).
 * Состояние модуля (lastUnloadAt/wasGaming/timer) сбрасывается через resetModules.
 *
 * Зафиксированные эджи (контракт P1-2):
 * - isModelLoaded при non-ok/throw → true (консервативно: не выгружаем вслепую).
 * - lastUnloadAt=0 при старте: при Date.now() < 60с первая выгрузка заблокирована
 *   кулдауном (в тестах время сдвинуто на 1_000_000 мс).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../electron/ai/config', () => ({ getConfig: vi.fn() }));
vi.mock('../../electron/ai/resource-manager', () => ({ getResourceState: vi.fn() }));

import { getConfig } from '../../electron/ai/config';
import { getResourceState } from '../../electron/ai/resource-manager';

const cfgMock = vi.mocked(getConfig);
const resMock = vi.mocked(getResourceState);
const fetchMock = vi.fn();

type VG = typeof import('../../electron/ai/vram-gate');
let vg: VG;

function config(over: { localUrl?: string; unloadOnGaming?: boolean } = {}) {
  cfgMock.mockReturnValue({
    llm: { localUrl: over.localUrl ?? 'http://localhost:11434', localModel: 'qwen3:4b' },
    resource: { unloadOnGaming: over.unloadOnGaming ?? true },
  } as never);
}

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => '' } as Response;
}
const notOk = { ok: false, status: 500, json: async () => ({}), text: async () => 'err' } as Response;

const T0 = 1_000_000; // > UNLOAD_COOLDOWN_MS от нулевого lastUnloadAt

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  cfgMock.mockReset();
  resMock.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  config();
  resMock.mockResolvedValue({ activity: 'idle' } as never);
  vg = await import('../../electron/ai/vram-gate');
});

afterEach(() => {
  vg.stopVramGate();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isOllamaModelLoaded / isModelLoaded', () => {
  it('пустой localUrl → false без fetch', async () => {
    config({ localUrl: '' });
    expect(await vg.isOllamaModelLoaded()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('non-ok → true (консервативно); throw → true', async () => {
    fetchMock.mockResolvedValue(notOk);
    expect(await vg.isOllamaModelLoaded()).toBe(true);
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await vg.isOllamaModelLoaded()).toBe(true);
  });

  it('models-объект: имя совпало (case-insensitive) → true; пусто/чужое → false', async () => {
    fetchMock.mockResolvedValue(okJson({ models: [{ name: 'QWEN3:4B' }] }));
    expect(await vg.isOllamaModelLoaded()).toBe(true);
    fetchMock.mockResolvedValue(okJson({ models: [] }));
    expect(await vg.isOllamaModelLoaded()).toBe(false);
    fetchMock.mockResolvedValue(okJson({ models: [{ name: 'other:1b' }] }));
    expect(await vg.isOllamaModelLoaded()).toBe(false);
  });

  it('голый массив и поле model вместо name — принимаются', async () => {
    fetchMock.mockResolvedValue(okJson([{ model: 'qwen3:4b' }]));
    expect(await vg.isOllamaModelLoaded()).toBe(true);
  });
});

describe('unloadOllamaModel', () => {
  it('пустой localUrl → false без fetch', async () => {
    config({ localUrl: '' });
    expect(await vg.unloadOllamaModel()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('уже выгружена → false, POST /api/chat НЕ отправляется', async () => {
    fetchMock.mockResolvedValue(okJson({ models: [] }));
    expect(await vg.unloadOllamaModel()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // только /api/ps
    expect(fetchMock.mock.calls[0][0]).toContain('/api/ps');
  });

  it('загружена + POST ok → true; body содержит keep_alive: 0 и num_predict: 1', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ models: [{ name: 'qwen3:4b' }] }))
      .mockResolvedValueOnce(okJson({}));
    expect(await vg.unloadOllamaModel()).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.keep_alive).toBe(0);
    expect(body.options.num_predict).toBe(1);
    expect(fetchMock.mock.calls[1][0]).toContain('/api/chat');
  });

  it('POST non-ok → false; POST throw → false', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ models: [{ name: 'qwen3:4b' }] })).mockResolvedValueOnce(notOk);
    expect(await vg.unloadOllamaModel()).toBe(false);
    fetchMock.mockReset()
      .mockResolvedValueOnce(okJson({ models: [{ name: 'qwen3:4b' }] }))
      .mockRejectedValueOnce(new Error('net'));
    expect(await vg.unloadOllamaModel()).toBe(false);
  });
});

describe('checkAndFreeVram — кулдауны и wasGaming', () => {
  function gaming() {
    resMock.mockResolvedValue({ activity: 'gaming' } as never);
  }
  function loadedThenOk() {
    fetchMock
      .mockResolvedValueOnce(okJson({ models: [{ name: 'qwen3:4b' }] }))
      .mockResolvedValueOnce(okJson({}));
  }

  it('unloadOnGaming=false → false, состояние ресурсов не опрашивается', async () => {
    config({ unloadOnGaming: false });
    gaming();
    expect(await vg.checkAndFreeVram()).toBe(false);
    expect(resMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gaming → выгрузка → true', async () => {
    gaming();
    loadedThenOk();
    expect(await vg.checkAndFreeVram()).toBe(true);
  });

  it('повторный вызов в кулдаун 60с → false без fetch; после 61с — снова выгружает', async () => {
    gaming();
    loadedThenOk();
    expect(await vg.checkAndFreeVram()).toBe(true);
    expect(await vg.checkAndFreeVram()).toBe(false); // кулдаун
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(T0 + 61_000);
    loadedThenOk();
    expect(await vg.checkAndFreeVram()).toBe(true);
  });

  it('неудачная выгрузка → fail-кулдаун 120с блокирует повторы, потом ретрай', async () => {
    gaming();
    fetchMock
      .mockResolvedValueOnce(okJson({ models: [{ name: 'qwen3:4b' }] }))
      .mockResolvedValueOnce(notOk); // unload не удался
    expect(await vg.checkAndFreeVram()).toBe(false);
    // В окне 120с — даже не пробуем (fetch не вызывается)
    vi.setSystemTime(T0 + 119_000);
    expect(await vg.checkAndFreeVram()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // После 120с — ретрай (60s cooldown с последней УСПЕШНОЙ выгрузки не было: lastUnloadAt=0)
    vi.setSystemTime(T0 + 121_000);
    loadedThenOk();
    expect(await vg.checkAndFreeVram()).toBe(true);
  });

  it('не-gaming после gaming → false, wasGaming сброшен (лог о конце сессии)', async () => {
    gaming();
    loadedThenOk();
    await vg.checkAndFreeVram();
    resMock.mockResolvedValue({ activity: 'coding' } as never);
    expect(await vg.checkAndFreeVram()).toBe(false);
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).toContain('Game session ended');
    // повторный не-gaming — тихо, без повторного лога
    vi.mocked(console.log).mockClear();
    await vg.checkAndFreeVram();
    expect(vi.mocked(console.log)).not.toHaveBeenCalled();
  });

  it('activity undefined → false', async () => {
    resMock.mockResolvedValue(undefined as never);
    expect(await vg.checkAndFreeVram()).toBe(false);
  });
});

describe('start/stop/isVramGateRunning', () => {
  it('start → running; stop → не running; stop без start — безопасно', async () => {
    expect(vg.isVramGateRunning()).toBe(false);
    vg.startVramGate();
    expect(vg.isVramGateRunning()).toBe(true);
    vg.stopVramGate();
    expect(vg.isVramGateRunning()).toBe(false);
    expect(() => vg.stopVramGate()).not.toThrow();
  });

  it('двойной start → один таймер (проверка раз в 15с, не чаще)', async () => {
    vg.startVramGate();
    vg.startVramGate();
    await vi.advanceTimersByTimeAsync(0); // мгновенная первая проверка
    const callsAfterStart = resMock.mock.calls.length;
    expect(callsAfterStart).toBe(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(resMock.mock.calls.length).toBe(callsAfterStart + 1); // ровно один тик
    vg.stopVramGate();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resMock.mock.calls.length).toBe(callsAfterStart + 1); // после stop тиков нет
  });
});

