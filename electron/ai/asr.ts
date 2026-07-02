/**
 * ASR (распознавание речи) — гибрид: локальный whisper.cpp или облачный Z.ai.
 *
 * Локально: используется whisper.cpp через CLI или node-addon.
 * Рекомендуется модель small (для русского) или base для скорости.
 * На GTX 1650: small.en/small = real-time, medium = ~1.5x real-time.
 *
 * Облако: Z.ai ASR API.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getASRConfig as getASRConfigUnified, setASRConfig as setASRConfigUnified } from './config';

// Use native fetch (Node 20+ / Electron 33+)

export interface ASRConfig {
  provider: 'local' | 'cloud' | 'auto';
  whisperPath: string; // путь к whisper-cli
  modelPath: string; // путь к ggml-small.bin
  language: string; // 'ru' | 'en' | 'auto'
  cloudApiKey: string;
}

// Config is now managed by unified config store
export function getASRConfig(): ASRConfig {
  return getASRConfigUnified();
}

export function setASRConfig(patch: Partial<ASRConfig>): void {
  setASRConfigUnified(patch);
}

/**
 * Распознавание аудио.
 * @param audioBase64 base64 аудио (wav/mp3/webm)
 */
export async function transcribe(audioBase64: string): Promise<string> {
  const cfg = getASRConfig();

  if (cfg.provider === 'local' || (cfg.provider === 'auto' && cfg.whisperPath)) {
    try {
      return await transcribeLocal(cfg, audioBase64);
    } catch (e) {
      console.error('[ASR] Local failed, falling back:', e);
      if (cfg.provider === 'local') throw e;
    }
  }

  return transcribeCloud(cfg, audioBase64);
}

/**
 * Локальное распознавание через whisper.cpp.
 */
async function transcribeLocal(cfg: ASRConfig, audioBase64: string): Promise<string> {
  if (!cfg.whisperPath || !cfg.modelPath) {
    throw new Error('Не настроен whisper.cpp: укажите whisperPath и modelPath в настройках.');
  }

  // Сохраняем во временный файл
  const tmpDir = path.join(require('os').tmpdir(), 'una-asr');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const inputPath = path.join(tmpDir, `input_${Date.now()}.wav`);
  const outputPath = path.join(tmpDir, `output_${Date.now()}`);

  const cleaned = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
  await fs.promises.writeFile(inputPath, Buffer.from(cleaned, 'base64'));

  return new Promise<string>((resolve, reject) => {
    const args = [
      '-m', cfg.modelPath,
      '-f', inputPath,
      '-l', cfg.language,
      '-of', outputPath,
      '--no-prints',
    ];

    const proc = spawn(cfg.whisperPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', async (code) => {
      try {
        // Очистка входного файла
        await fs.promises.unlink(inputPath).catch(() => {});

        if (code !== 0) {
          reject(new Error(`whisper.cpp exited ${code}: ${stderr}`));
          return;
        }

        // Читаем результат (whisper.cpp создаёт .txt файл)
        const txtPath = `${outputPath}.txt`;
        const txt = await fs.promises.readFile(txtPath, 'utf8');
        await fs.promises.unlink(txtPath).catch(() => {});
        resolve(txt.trim());
      } catch (e) {
        reject(e);
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Облачное распознавание через Z.ai ASR.
 */
async function transcribeCloud(cfg: ASRConfig, audioBase64: string): Promise<string> {
  if (!cfg.cloudApiKey) {
    throw new Error('Не настроен облачный ASR: укажите ZAI_API_KEY.');
  }

  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();
  const cleaned = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
  const resp = await zai.audio.asr.create({
    file_base64: cleaned,
    model: 'glm-asr',
  });
  const text =
    (resp as { text?: string; data?: { text?: string } }).text ??
    (resp as { data?: { text?: string } }).data?.text ??
    '';
  return text;
}
