/**
 * TASK-015 (DEC-021): приёмочные тесты для electron/ai/intent.ts (чистые функции).
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение, включая ПРИОРИТЕТ ПОРЯДКА
 * (первый матч в INTENT_PATTERNS побеждает) — не чиним:
 * - weather проверяется раньше greeting: «привет, какая погода» → weather.
 * - web_search (/найди/) раньше file_find: «найди файл x» → web_search.
 * - file_read (/открой (файл|документ)/) раньше gui: «открой файл» → file_read,
 *   но «открой браузер» → gui.
 * TOOL_BY_INTENT не экспортируется — маппинги проверяются через filterToolsByIntent.
 */
import { describe, expect, it } from 'vitest';
import { detectIntent, filterToolsByIntent, Intent } from '../../electron/ai/intent';

describe('detectIntent — по intent (RU+EN)', () => {
  it.each([
    ['какая погода в Москве', 'weather'],
    ['weather forecast tomorrow', 'weather'],
    ['будет ли дождь вечером', 'weather'],
    ['последние новости', 'news'],
    ['курс доллара сегодня', 'news'],
    ['что случилось в мире', 'news'],
    ['найди информацию о квантах', 'web_search'],
    ['search for documentation', 'web_search'],
    ['что такое REST API', 'web_search'],
    ['прочитай файл config.txt', 'file_read'],
    ['read the file please', 'file_read'],
    ['открой документ', 'file_read'],
    ['запиши это в файл', 'file_write'],
    ['создай скрипт для бэкапа', 'file_write'],
    ['write to file', 'file_write'],
    ['где лежит конфиг nginx', 'file_find'],
    ['find file named main.ts', 'file_find'],
    ['где находится файл логов', 'file_find'],
    ['напиши код сортировки', 'code'],
    ['write code example', 'code'],
    ['исправь баг в модуле', 'code'],
    ['сколько оперативной памяти', 'system'],
    ['system info', 'system'],
    ['выполни команду dir', 'system'],
    ['сделай скриншот', 'screen'],
    ['what is on screen', 'screen'],
    ['проанализируй экран', 'screen'],
    ['открой приложение калькулятор', 'gui'],
    ['launch program', 'gui'],
    ['нажми кнопку', 'gui'],
    ['запомни что я пью чай', 'memory'],
    ['remember this', 'memory'],
    ['как меня зовут', 'memory'],
    ['привет', 'greeting'],
    ['hello', 'greeting'],
    ['доброе утро', 'greeting'],
    ['как дела', 'greeting'],
  ])('%s → %s', (input, expected) => {
    expect(detectIntent(input)).toBe(expected as Intent);
  });

  it.each(['asdf qwer zxcv', '123 456 !!!', ''])('%s → unknown', (input) => {
    expect(detectIntent(input)).toBe('unknown');
  });
});

describe('detectIntent — ЭДЖИ приоритета порядка (факт, не фикс)', () => {
  it('weather раньше greeting: «привет, какая погода» → weather', () => {
    expect(detectIntent('привет, какая погода сегодня')).toBe('weather');
  });

  it('weather раньше news при пересечении', () => {
    expect(detectIntent('какая погода и последние новости')).toBe('weather');
  });

  it('web_search (/найди/) раньше file_find: «найди файл test.txt» → web_search', () => {
    expect(detectIntent('найди файл test.txt')).toBe('web_search');
  });

  it('file_read раньше gui: «открой файл readme» → file_read', () => {
    expect(detectIntent('открой файл readme.md')).toBe('file_read');
  });

  it('но «открой браузер» → gui (file_read не матчится)', () => {
    expect(detectIntent('открой браузер')).toBe('gui');
  });

  it('code (/запусти код/) раньше gui: «запусти код» → code', () => {
    expect(detectIntent('запусти код')).toBe('code');
  });
});

const ALL_TOOLS = [
  'web_search', 'web_fetch', 'web_download', 'list_files', 'read_file', 'write_file',
  'find_files', 'execute_command', 'system_info', 'take_screenshot', 'analyze_screen',
  'memory_save', 'memory_recall', 'create_reminder', 'edit_file', 'grep', 'apply_patch',
  'run_code', 'open_app', 'type_text', 'click', 'key_press', 'list_windows',
  'ask_clarification', 'request_confirmation',
];

function toolList(names: string[]) {
  return names.map((name) => ({ type: 'function' as const, function: { name } }));
}

function namesOf(tools: Array<{ function: Record<string, unknown> }>): string[] {
  return tools.map((t) => t.function.name as string);
}

describe('filterToolsByIntent', () => {
  it('greeting → пустой список (просто чат)', () => {
    expect(filterToolsByIntent(toolList(ALL_TOOLS), 'greeting')).toEqual([]);
  });

  it('unknown → полный список без потерь', () => {
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'unknown'))).toEqual(ALL_TOOLS);
  });

  it('weather → только web_search; news → web_search+web_fetch', () => {
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'weather'))).toEqual(['web_search']);
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'news'))).toEqual(['web_search', 'web_fetch']);
  });

  it('code → длинный список (9 инструментов в порядке входного массива)', () => {
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'code'))).toEqual([
      'list_files', 'read_file', 'write_file', 'execute_command', 'system_info',
      'edit_file', 'grep', 'apply_patch', 'run_code',
    ]);
  });

  it('memory → memory_save/memory_recall/create_reminder (маппинг TOOL_BY_INTENT)', () => {
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'memory')))
      .toEqual(['memory_save', 'memory_recall', 'create_reminder']);
  });

  it('gui → open_app/type_text/click/key_press/list_windows', () => {
    expect(namesOf(filterToolsByIntent(toolList(ALL_TOOLS), 'gui')))
      .toEqual(['open_app', 'type_text', 'click', 'key_press', 'list_windows']);
  });

  it('неизвестные имена инструментов отфильтровываются', () => {
    const tools = toolList(['web_search', 'nonexistent_tool', 'web_fetch']);
    expect(namesOf(filterToolsByIntent(tools, 'weather'))).toEqual(['web_search']);
    expect(namesOf(filterToolsByIntent(tools, 'news'))).toEqual(['web_search', 'web_fetch']);
  });

  it('порядок результата = порядок входного массива (не TOOL_BY_INTENT)', () => {
    const tools = toolList(['web_fetch', 'web_search']);
    expect(namesOf(filterToolsByIntent(tools, 'news'))).toEqual(['web_fetch', 'web_search']);
  });
});

