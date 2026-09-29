/**
 * TASK-016 (DEC-021): приёмочные тесты для electron/ai/asr.ts.
 *
 * Моки: child_process.spawn (фейковый процесс на EventEmitter), ./config
 * (getASRConfig/setASRConfig — unified store), 'z-ai-web-dev-sdk' (динамический импорт).
 * Реальные whisper.cpp / Z.ai / сеть не используются. tmp-файлы — только в os.tmpdir()
 * (имена детерминированы через spy на Date.now).
 */
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  spawn: vi.fn(),
  asrCreate: vi.fn(),
  getCfg: vi.fn(),
  setCfg: vi.fn(),
}));

vi.mock('child_process', () => ({ spawn: m.spawn }));

vi.mock('z-ai-web-dev-sdk', () => ({
  default: { create: async () => ({ audio: { asr: { create: m.asrCreate } } }) },
}));

vi.mock('../../electron/ai/config', () => ({
  getASRConfig: m.getCfg,
  setASRConfig: m.setCfg,
}));

import { transcribe, setASRConfig } from '../../electron/ai/asr';

function cfg(over: Partial<Record<string, string>> = {}) {
  m.getCfg.mockReturnValue({
    provider: 'local', whisperPath: 'C:\\whisper\\whisper-cli.exe', modelPath: 'C:\\whisper\\ggml-small.bin',
    language: 'ru', cloudApiKey: 'key', ...over,
  });
}

/** Фейковый процесс; сценарий (события) откладывается через setTimeout — после навешивания слушателей. */
function fakeProc(scenario: (p: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }) => void) {
  const p = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } };
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.stdin = { write: vi.fn(), end: vi.fn() };
  setTimeout(() => scenario(p), 5);
  return p;
}

const T = 1_234_567;
const tmpDir = () => path.join(os.tmpdir(), 'una-asr');

beforeEach(() => {
  m.spawn.mockReset();
  m.asrCreate.mockReset();
  m.getCfg.mockReset();
  m.setCfg.mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(T);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  cfg();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('transcribe — local (whisper.cpp)', () => {
  it('local без whisperPath/modelPath → throw с пояснением', async () => {
    cfg({ whisperPath: '', modelPath: '' });
    await expect(transcribe('AAAA')).rejects.toThrow(/Не настроен whisper\.cpp/);
    expect(m.spawn).not.toHaveBeenCalled();
  });

  it('успех: читает output .txt, trim, чистит tmp (вход и txt удалены)', async () => {
    const txtPath = path.join(tmpDir(), `output_${T}.txt`);
    m.spawn.mockImplementation(() => fakeProc((p) => {
      fs.writeFileSync(txtPath, '  распознано  ');
      p.emit('close', 0);
    }));
    await expect(transcribe('QUJD')).resolves.toBe('распознано');
    expect(fs.existsSync(txtPath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir(), `input_${T}.wav`))).toBe(false);
    const [bin, args] = m.spawn.mock.calls[0];
    expect(bin).toBe('C:\\whisper\\whisper-cli.exe');
    expect(args).toContain('-m');
    expect(args).toContain('--no-prints');
  });

  it('close с кодом 1 + stderr → reject с кодом и stderr в тексте', async () => {
    m.spawn.mockImplementation(() => fakeProc((p) => {
      p.stderr.emit('data', Buffer.from('bad model'));
      p.emit('close', 1);
    }));
    await expect(transcribe('QUJD')).rejects.toThrow(/exited 1: bad model/);
  });

  it('событие error → reject с исходной ошибкой', async () => {
    m.spawn.mockImplementation(() => fakeProc((p) => p.emit('error', new Error('ENOENT whisper'))));
    await expect(transcribe('QUJD')).rejects.toThrow('ENOENT whisper');
  });

  it('provider local + провал → throw БЕЗ облачного fallback', async () => {
    cfg({ provider: 'local' });
    m.spawn.mockImplementation(() => fakeProc((p) => p.emit('close', 2)));
    await expect(transcribe('QUJD')).rejects.toThrow(/exited 2/);
    expect(m.asrCreate).not.toHaveBeenCalled();
  });
});

describe('transcribe — auto/cloud', () => {
  it('auto без whisperPath → сразу облако (spawn не вызывается)', async () => {
    cfg({ provider: 'auto', whisperPath: '' });
    m.asrCreate.mockResolvedValue({ text: 'cloud ok' });
    await expect(transcribe('QUJD')).resolves.toBe('cloud ok');
    expect(m.spawn).not.toHaveBeenCalled();
  });

  it('auto + local провал → fallback в облако', async () => {
    cfg({ provider: 'auto' });
    m.spawn.mockImplementation(() => fakeProc((p) => p.emit('close', 1)));
    m.asrCreate.mockResolvedValue({ data: { text: 'из облака' } });
    await expect(transcribe('QUJD')).resolves.toBe('из облака');
  });

  it('cloud: data:-префикс счищается, модель glm-asr', async () => {
    cfg({ provider: 'cloud' });
    m.asrCreate.mockResolvedValue({ text: 'x' });
    await transcribe('data:audio/wav;base64,QUJD');
    expect(m.asrCreate).toHaveBeenCalledWith({ file_base64: 'QUJD', model: 'glm-asr' });
  });

  it('cloud без ключа → throw', async () => {
    cfg({ provider: 'cloud', cloudApiKey: '' });
    await expect(transcribe('QUJD')).rejects.toThrow(/Не настроен облачный ASR/);
  });
});

describe('setASRConfig', () => {
  it('пробрасывает patch в unified store', () => {
    setASRConfig({ language: 'en' });
    expect(m.setCfg).toHaveBeenCalledWith({ language: 'en' });
  });
});

