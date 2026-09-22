/**
 * TASK-003 (DEC-021): приёмочные тесты для electron/ai/modes.ts.
 *
 * Контракт P1-2 (DEC-008): фиксируем ТЕКУЧЕЕ поведение. Модуль чистый
 * (импорт Intent — type-only), моков нет. currentMode изолируется
 * через vi.resetModules() + dynamic import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Intent } from '../../electron/ai/intent';

async function getModes() {
  return await import('../../electron/ai/modes');
}

type ToolEntry = { type: 'function'; function: Record<string, unknown> };
const tool = (name: string): ToolEntry => ({ type: 'function', function: { name } });

beforeEach(() => {
  vi.resetModules();
});

describe('resolveMode — маппинг intent → режим', () => {
  it('исследовательские интенты → research', async () => {
    const m = await getModes();
    for (const intent of ['weather', 'news', 'web_search'] as Intent[]) {
      expect(m.resolveMode(intent)).toBe('research');
    }
  });

  it('файловые/кодовые интенты → code', async () => {
    const m = await getModes();
    for (const intent of ['file_read', 'file_write', 'file_find', 'code'] as Intent[]) {
      expect(m.resolveMode(intent)).toBe('code');
    }
  });

  it('системные интенты → system', async () => {
    const m = await getModes();
    for (const intent of ['system', 'screen', 'gui'] as Intent[]) {
      expect(m.resolveMode(intent)).toBe('system');
    }
  });

  it('memory → default; greeting → chat; unknown → default', async () => {
    const m = await getModes();
    expect(m.resolveMode('memory')).toBe('default');
    expect(m.resolveMode('greeting')).toBe('chat');
    expect(m.resolveMode('unknown')).toBe('default');
  });

  it('resolveMode обновляет currentMode', async () => {
    const m = await getModes();
    expect(m.getCurrentMode()).toBe('default');
    m.resolveMode('code');
    expect(m.getCurrentMode()).toBe('code');
  });
});

describe('mode config / current / каталог', () => {
  it('getModeConfig(mode) — реестр; без аргумента — текущий; unknown → default', async () => {
    const m = await getModes();
    expect(m.getModeConfig('creative').label).toBe('Творчество');
    m.setMode('system');
    expect(m.getModeConfig().label).toBe('Система');
    expect(m.getModeConfig('bogus' as never).name).toBe('default');
  });

  it('setMode/getCurrentMode roundtrip', async () => {
    const m = await getModes();
    m.setMode('research');
    expect(m.getCurrentMode()).toBe('research');
  });

  it('listModes → 6 режимов', async () => {
    const m = await getModes();
    const list = m.listModes();
    expect(list).toHaveLength(6);
    expect(list.map(x => x.name)).toEqual(['code', 'research', 'creative', 'chat', 'system', 'default']);
  });
});

describe('filterToolsByMode — фильтрация инструментов', () => {
  it('chat (allowedTools=[]) → всегда пустой список', async () => {
    const m = await getModes();
    const tools = [tool('read_file'), tool('ask_clarification')];
    expect(m.filterToolsByMode(tools, 'chat')).toEqual([]);
  });

  it('code → только разрешённые имена, неизвестные отброшены', async () => {
    const m = await getModes();
    const tools = [tool('read_file'), tool('web_search'), tool('write_file'), tool('nonexistent')];
    const out = m.filterToolsByMode(tools, 'code');
    expect(out.map(t => t.function.name)).toEqual(['read_file', 'write_file']);
  });

  it('без аргумента mode — используется currentMode', async () => {
    const m = await getModes();
    m.setMode('research');
    const tools = [tool('web_search'), tool('read_file')];
    const out = m.filterToolsByMode(tools);
    expect(out.map(t => t.function.name)).toEqual(['web_search']);
  });
});

describe('getModeInstructions', () => {
  it('default (пустые instructions) → пустая строка', async () => {
    const m = await getModes();
    expect(m.getModeInstructions('default')).toBe('');
  });

  it('code → блок с заголовком режима и инструкциями', async () => {
    const m = await getModes();
    const instr = m.getModeInstructions('code');
    expect(instr).toContain('# Режим работы: Разработка');
    expect(instr).toContain('Ты в режиме разработчика');
  });
});
