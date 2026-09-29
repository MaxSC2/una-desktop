/**
 * TASK-016 (DEC-021): приёмочные тесты для electron/ai/tts.ts.
 *
 * Моки: child_process.spawn (фейковый Piper на EventEmitter), ./config
 * (getTTSConfig/setTTSConfig), ./llm (getZAISDK — динамический импорт).
 * Реальные piper / Z.ai / сеть не используются; записи на диск нет вообще.
 *
 * Зафиксированные эджи (контракт P1-2):
 * - provider local + провал Piper → { '', 'none' }, НЕ throw (graceful).
 * - cloud-провал тоже деградирует в { '', 'none' } (исключение проглочено synthesize).
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  spawn: vi.fn(),
  ttsCreate: vi.fn(),
  getZAISDK: vi.fn(),
  getCfg: vi.fn(),
  setCfg: vi.fn(),
}));

vi.mock('child_process', () => ({ spawn: m.spawn }));

vi.mock('../../electron/ai/llm', () => ({ getZAISDK: m.getZAISDK }));

vi.mock('../../electron/ai/config', () => ({
  getTTSConfig: m.getCfg,
  setTTSConfig: m.setCfg,
}));

import { synthesize, setTTSConfig } from '../../electron/ai/tts';

function cfg(over: Partial<Record<string, string>> = {}) {  m.getCfg.mockReturnValue({
    provider: 'local', piperPath: 'C:\\piper\\piper.exe', voicePath: 'C:\\piper\\ru.onnx',
    cloudApiKey: 'key', cloudVoice: 'nova', ...over,
  });
}

function fakeProc(scenario: (p: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }) => void) {
  const p = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } };
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.stdin = { write: vi.fn(), end: vi.fn() };
  setTimeout(() => scenario(p), 5);
  return p;
}

let lastProc: ReturnType<typeof fakeProc>;

beforeEach(() => {
  m.spawn.mockReset().mockImplementation(() => lastProc);
  m.ttsCreate.mockReset();
  m.getZAISDK.mockReset().mockResolvedValue({ audio: { tts: { create: m.ttsCreate } } });  m.getCfg.mockReset();  m.setCfg.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  cfg();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('synthesize — local (Piper)', () => {
  it('успех → wav base64 с RIFF/WAVE-заголовком; текст ушёл в stdin', async () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    lastProc = fakeProc((p) => {
      p.stdout.emit('data', pcm);
      p.emit('close', 0);
    });
    const r = await synthesize('привет');
    expect(r.format).toBe('wav');
    const buf = Buffer.from(r.audio_base64, 'base64');
    expect(buf.subarray(0, 4).toString()).toBe('RIFF');
    expect(buf.subarray(8, 12).toString()).toBe('WAVE');
    expect(buf.length).toBe(44 + pcm.length);
    expect(buf.subarray(44).equals(pcm)).toBe(true);
    expect(lastProc.stdin.write).toHaveBeenCalledWith('привет');
    expect(lastProc.stdin.end).toHaveBeenCalled();
    const [bin, args] = m.spawn.mock.calls[0];
    expect(bin).toBe('C:\\piper\\piper.exe');
    expect(args).toEqual(['--model', 'C:\\piper\\ru.onnx', '--output-raw']);
  });

  it('provider local + Piper упал (code 2) → { "", "none" }, НЕ throw (эдж)', async () => {
    lastProc = fakeProc((p) => p.emit('close', 2));
    await expect(synthesize('текст')).resolves.toEqual({ audio_base64: '', format: 'none' });
  });

  it('provider local без путей → { "", "none" } (throw пойман в synthesize)', async () => {
    cfg({ provider: 'local', piperPath: '', voicePath: '' });
    await expect(synthesize('текст')).resolves.toEqual({ audio_base64: '', format: 'none' });
    expect(m.spawn).not.toHaveBeenCalled();
  });
});

describe('synthesize — auto/cloud', () => {
  it('auto + local провал (error) + есть ключ → облачный mp3', async () => {
    cfg({ provider: 'auto' });
    lastProc = fakeProc((p) => p.emit('error', new Error('no piper')));
    m.ttsCreate.mockResolvedValue({ audio: 'b64mp3' });
    const r = await synthesize('текст');
    expect(r).toEqual({ audio_base64: 'b64mp3', format: 'mp3' });
  });

  it('auto без piper → сразу облако; resp.data как запасная форма', async () => {
    cfg({ provider: 'auto', piperPath: '', voicePath: '' });
    m.ttsCreate.mockResolvedValue({ data: 'b64data' });
    const r = await synthesize('текст');
    expect(r).toEqual({ audio_base64: 'b64data', format: 'mp3' });
    expect(m.spawn).not.toHaveBeenCalled();
  });

  it('cloud: вход обрезан до 1500 символов, voice и response_format проброшены', async () => {
    cfg({ provider: 'cloud', cloudVoice: 'shimmer' });
    m.ttsCreate.mockResolvedValue({ audio: 'x' });
    await synthesize('й'.repeat(2000));
    const arg = m.ttsCreate.mock.calls[0][0];
    expect(arg.input).toHaveLength(1500);
    expect(arg.voice).toBe('shimmer');
    expect(arg.response_format).toBe('mp3');
  });

  it('cloud вернул пустой ответ → деградация в { "", "none" } (throw внутри пойман)', async () => {
    cfg({ provider: 'cloud' });
    m.ttsCreate.mockResolvedValue({});
    await expect(synthesize('текст')).resolves.toEqual({ audio_base64: '', format: 'none' });
  });

  it('getZAISDK бросил → { "", "none" }', async () => {
    cfg({ provider: 'cloud' });
    m.getZAISDK.mockRejectedValue(new Error('sdk init fail'));
    await expect(synthesize('текст')).resolves.toEqual({ audio_base64: '', format: 'none' });
  });

  it('всё недоступно (auto, нет piper, нет ключа) → { "", "none" } + warn', async () => {
    cfg({ provider: 'auto', piperPath: '', voicePath: '', cloudApiKey: '' });
    await expect(synthesize('текст')).resolves.toEqual({ audio_base64: '', format: 'none' });
    expect(vi.mocked(console.warn)).toHaveBeenCalled();
    expect(m.spawn).not.toHaveBeenCalled();
  });
});

describe('setTTSConfig', () => {
  it('пробрасывает patch в unified store', () => {
    setTTSConfig({ cloudVoice: 'shimmer' });
    expect(m.setCfg).toHaveBeenCalledWith({ cloudVoice: 'shimmer' });
  });
});

