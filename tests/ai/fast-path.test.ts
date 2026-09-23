/**
 * TASK-015 (DEC-021): приёмочные тесты для electron/ai/fast-path.ts.
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение. matchFastCommand — чистая
 * функция; dispatchTool из ../tools замокан (реальный open_app запрещён).
 *
 * Зафиксированные эджи:
 * - trailing-пунктуация срезается ровно ОДИН символ ([.!?]?): «!!» → null.
 * - глаголы без цели («открой») → null (regex требует (.+?)).
 * - неизвестное приложение после срезов → null (не fast-path).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../electron/tools', () => ({
  dispatchTool: vi.fn(),
}));

import { dispatchTool } from '../../electron/tools';
import { matchFastCommand, runFastCommand, tryFastCommand } from '../../electron/ai/fast-path';

const ctx = {} as import('../../electron/tools').ToolContext;
const dispatchMock = vi.mocked(dispatchTool);

beforeEach(() => {
  dispatchMock.mockReset();
});

describe('matchFastCommand — глаголы и базовые алиасы', () => {
  it.each([
    ['открой дискорд', 'Discord'],
    ['запусти телеграм', 'Telegram'],
    ['включи хром', 'Chrome'],
    ['открою код', 'Code'],
    ['открыть терминал', 'wt'],
    ['открывай блокнот', 'Notepad'],
    ['open discord', 'Discord'],
    ['launch telegram', 'Telegram'],
    ['start calc', 'calc'],
  ])('%s → %s', (input, app) => {
    const m = matchFastCommand(input)!;
    expect(m.tool).toBe('open_app');
    expect(m.app).toBe(app);
    expect(m.args).toEqual({ app_name: app });
  });

  it('регистронезависим и терпим к пробелам по краям', () => {
    expect(matchFastCommand('  ОТКРОЙ ДИСКОРД  ')!.app).toBe('Discord');
  });

  it('алиасы: проводник/телегу/диспетчер задач/vs code', () => {
    expect(matchFastCommand('открой проводник')!.args).toEqual({ app_name: 'explorer' });
    expect(matchFastCommand('запусти телегу')!.args).toEqual({ app_name: 'Telegram' });
    expect(matchFastCommand('открой диспетчер задач')!.args).toEqual({ app_name: 'taskmgr' });
    expect(matchFastCommand('open vs code')!.args).toEqual({ app_name: 'Code' });
  });
});

describe('matchFastCommand — срезы префиксов/суффиксов и пунктуация', () => {
  it('«пожалуйста» в начале и в конце', () => {
    expect(matchFastCommand('пожалуйста открой хром')!.app).toBe('Chrome');
    expect(matchFastCommand('открой дискорд пожалуйста')!.app).toBe('Discord');
  });

  it('префиксы приложение/программу/прогу/app', () => {
    expect(matchFastCommand('открой приложение код')!.app).toBe('Code');
    expect(matchFastCommand('запусти программу калькулятор')!.app).toBe('calc');
    expect(matchFastCommand('open app discord')!.app).toBe('Discord');
  });

  it('trailing-пунктуация: один символ срезается', () => {
    expect(matchFastCommand('открой дискорд!')!.app).toBe('Discord');
    expect(matchFastCommand('открой дискорд?')!.app).toBe('Discord');
  });

  it('ЭДЖ: двойной «!!» — срезается один, второй ломает алиас → null', () => {
    expect(matchFastCommand('открой дискорд!!')).toBeNull(); // фактическое поведение
  });
});

describe('matchFastCommand — не fast-path', () => {
  it.each([
    'как дела',
    'открой',               // нет цели
    'открой холодильник',   // неизвестное приложение
    'открой дверь',         // нет в алиасах
    'просто текст про open',
    '',
  ])('%s → null', (input) => {
    expect(matchFastCommand(input)).toBeNull();
  });
});

describe('runFastCommand / tryFastCommand (dispatchTool замокан)', () => {
  it('success → «Открываю X.», fastPath true, dispatchTool вызван с open_app', async () => {
    dispatchMock.mockResolvedValue({ success: true, output: 'ok' });
    const out = (await runFastCommand('открой дискорд', ctx))!;
    expect(out.text).toBe('Открываю Discord.');
    expect(out.fastPath).toBe(true);
    expect(out.tool).toBe('open_app');
    expect(out.result.success).toBe(true);
    expect(dispatchMock).toHaveBeenCalledWith('open_app', { app_name: 'Discord' }, ctx);
  });

  it('failure result → текст с ошибкой; без error → «неизвестная ошибка»', async () => {
    dispatchMock.mockResolvedValue({ success: false, error: 'приложение не найдено' });
    expect((await runFastCommand('открой дискорд', ctx))!.text)
      .toBe('Не удалось открыть Discord: приложение не найдено');
    dispatchMock.mockResolvedValue({ success: false });
    expect((await runFastCommand('открой дискорд', ctx))!.text)
      .toBe('Не удалось открыть Discord: неизвестная ошибка');
  });

  it('dispatchTool бросил → error-текст (исключение проглочено)', async () => {
    dispatchMock.mockRejectedValue(new Error('бум'));
    const out = (await runFastCommand('запусти телеграм', ctx))!;
    expect(out.text).toBe('Не удалось открыть Telegram: бум');
    expect(out.result.success).toBe(false);
  });

  it('нет match → null, dispatchTool НЕ вызывается', async () => {
    expect(await runFastCommand('расскажи шутку', ctx)).toBeNull();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('tryFastCommand: текст при match, null без match', async () => {
    dispatchMock.mockResolvedValue({ success: true, output: 'ok' });
    expect(await tryFastCommand('открой хром', ctx)).toBe('Открываю Chrome.');
    expect(await tryFastCommand('привет', ctx)).toBeNull();
  });
});
