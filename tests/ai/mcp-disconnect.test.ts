/**
 * TASK-004-FIX (DEC-021): unit-тесты MCPAdapter.disconnectAll (F15/Q-004).
 *
 * Стратегия из INV-отчёта (docs/reports/k3/2026-09-24-task-004-inv.md, FIX-SPEC §2):
 * child_process.spawn замокан фейковым процессом с in-process JSON-RPC эхо —
 * connectAll проходит handshake/tools-list без реальных процессов и без
 * 15-30с таймаутов waitForResponse. Реальный Electron/app не используется;
 * wiring before-quit покрывается ручным чеклистом (отчёт).
 *
 * Зафиксированная семантика (P1-2): kill гасит ошибки; tools cleared; initialized
 * сбрасывается (наблюдаемо через повторный connectAll); сервер с exit-событием
 * скипается (обработчик mcp-adapter.ts:111-115); enabled:false не спавнится.
 */
import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('child_process', () => ({ spawn: m.spawn }));

import { MCPAdapter } from '../../electron/ai/mcp-adapter';

interface FakeProc extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
}

/** Фейковый ChildProcess: stdin.write парсит JSON-RPC и эхом отвечает в stdout тем же id. */
function makeFakeProc(onKill?: () => void): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn(() => {
    onKill?.();
    return true;
  });
  proc.stdin = {
    write: vi.fn((data: string) => {
      try {
        const msg = JSON.parse(String(data).trim()) as { id?: string; method?: string };
        if (msg && msg.id !== undefined) {
          const result =
            msg.method === 'initialize'
              ? { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0' } }
              : msg.method === 'tools/list'
                ? { tools: [{ name: 'ping', description: 'ping tool', inputSchema: { type: 'object', properties: {} } }] }
                : {};
          queueMicrotask(() =>
            proc.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n'))
          );
        }
      } catch {
        /* notification или невалидный JSON — молча */
      }
      return true;
    }),
    end: vi.fn(),
  };
  return proc;
}

let spawned: FakeProc[];

function serverCfg(name: string, enabled = true) {
  return { name, transport: 'stdio' as const, command: 'fake-server', args: [], enabled };
}

beforeEach(() => {
  spawned = [];
  m.spawn.mockReset().mockImplementation(() => {
    const p = makeFakeProc();
    spawned.push(p);
    return p;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('disconnectAll', () => {
  it('пустой набор серверов → resolve без throw (no-op)', async () => {
    const adapter = new MCPAdapter();
    await expect(adapter.disconnectAll()).resolves.toBeUndefined();
    expect(m.spawn).not.toHaveBeenCalled();
  });

  it('kill вызван на каждый сервер; tools очищены; повторный connectAll снова наполняет', async () => {
    const adapter = new MCPAdapter();
    adapter.registerServer(serverCfg('a'));
    adapter.registerServer(serverCfg('b'));
    const conn = await adapter.connectAll();
    expect(conn).toEqual({ connected: 2, failed: 0, toolsLoaded: 2 });
    expect(adapter.getToolDefinitions()).toHaveLength(2);
    expect(spawned).toHaveLength(2);

    await adapter.disconnectAll();
    expect(spawned[0].kill).toHaveBeenCalledTimes(1);
    expect(spawned[1].kill).toHaveBeenCalledTimes(1);
    expect(adapter.getToolDefinitions()).toEqual([]);

    // initialized сброшен: повторный connectAll работает (новые процессы)
    const conn2 = await adapter.connectAll();
    expect(conn2.connected).toBe(2);
    expect(adapter.getToolDefinitions()).toHaveLength(2);
  });

  it('ошибки kill глотаются: падение одного сервера не мешает остальным', async () => {
    let first = true;
    m.spawn.mockReset().mockImplementation(() => {
      const p = makeFakeProc(() => {
        if (first) {
          first = false;
          throw new Error('kill boom');
        }
      });
      spawned.push(p);
      return p;
    });
    const adapter = new MCPAdapter();
    adapter.registerServer(serverCfg('a'));
    adapter.registerServer(serverCfg('b'));
    await adapter.connectAll();

    await expect(adapter.disconnectAll()).resolves.toBeUndefined();
    expect(spawned[0].kill).toHaveBeenCalled();
    expect(spawned[1].kill).toHaveBeenCalledTimes(1); // несмотря на бросок у 'a'
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
  });

  it('повторный вызов (без exit-событий) → не бросает, kill вызывается снова', async () => {
    const adapter = new MCPAdapter();
    adapter.registerServer(serverCfg('a'));
    await adapter.connectAll();

    await adapter.disconnectAll();
    await expect(adapter.disconnectAll()).resolves.toBeUndefined();
    expect(spawned[0].kill).toHaveBeenCalledTimes(2);
  });

  it('после события exit сервер скипается (запись без process) — kill НЕ вызывается', async () => {
    const adapter = new MCPAdapter();
    adapter.registerServer(serverCfg('a'));
    await adapter.connectAll();

    spawned[0].emit('exit', 0); // обработчик mcp-adapter.ts:111-115 сбрасывает entry
    await adapter.disconnectAll();
    expect(spawned[0].kill).not.toHaveBeenCalled();
  });

  it('disabled-сервер не спавнится и не убивается', async () => {
    const adapter = new MCPAdapter();
    adapter.registerServer(serverCfg('off', false));
    adapter.registerServer(serverCfg('on', true));
    const conn = await adapter.connectAll();
    expect(conn.connected).toBe(1);
    expect(spawned).toHaveLength(1); // spawn только для enabled

    await adapter.disconnectAll();
    expect(spawned).toHaveLength(1);
    expect(spawned[0].kill).toHaveBeenCalledTimes(1);
  });
});

