/**
 * TTS (синтез речи) — гибрид: локальный Piper или облачный Z.ai.
 *
 * Piper — сверхбыстрый TTS на CPU, модели ~100 МБ.
 * Голоса: ru_RU-irina-medium, ru_RU-denis-medium, en_US-amy-medium
 * Скорость: ~50мс на предложение на i5.
 *
 * Альтернатива локально: Silero, Coqui TTS.
 *
 * Облако: Z.ai TTS (женский голос "nova").
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getTTSConfig as getTTSConfigUnified, setTTSConfig as setTTSConfigUnified } from './config';

export interface TTSConfig {
  provider: 'local' | 'cloud' | 'auto';
  piperPath: string; // путь к piper.exe
  voicePath: string; // путь к ru_RU-irina-medium.onnx
  cloudApiKey: string;
  cloudVoice: string; // 'nova' | 'shimmer' | ...
}

// Config is now managed by unified config store
export function getTTSConfig(): TTSConfig {
  return getTTSConfigUnified();
}

export function setTTSConfig(patch: Partial<TTSConfig>): void {
  setTTSConfigUnified(patch);
}

/**
 * Синтез речи. Возвращает base64 MP3/WAV.
 * If TTS is not configured, returns empty audio (graceful degradation).
 */
export async function synthesize(text: string): Promise<{ audio_base64: string; format: string }> {
  const cfg = getTTSConfig();

  // Try local Piper first
  if (cfg.provider === 'local' || (cfg.provider === 'auto' && cfg.piperPath && cfg.voicePath)) {
    try {
      return await synthesizeLocal(cfg, text);
    } catch (e) {
      console.error('[TTS] Local Piper failed:', e);
      if (cfg.provider === 'local') {
        // If explicitly local, return empty instead of crashing
        return { audio_base64: '', format: 'none' };
      }
    }
  }

  // Try cloud TTS
  if (cfg.cloudApiKey) {
    try {
      return await synthesizeCloud(cfg, text);
    } catch (e) {
      console.error('[TTS] Cloud TTS failed:', e);
    }
  }

  // Graceful degradation: no TTS available, return empty
  console.warn('[TTS] No TTS provider available, returning empty audio');
  return { audio_base64: '', format: 'none' };
}

/**
 * Локальный синтез через Piper.
 * Piper читает текст из stdin и пишет WAV в stdout.
 */
async function synthesizeLocal(cfg: TTSConfig, text: string): Promise<{ audio_base64: string; format: string }> {
  if (!cfg.piperPath || !cfg.voicePath) {
    throw new Error('Не настроен Piper: укажите piperPath и voicePath в настройках.');
  }

  return new Promise((resolve, reject) => {
    const args = ['--model', cfg.voicePath, '--output-raw'];
    const proc = spawn(cfg.piperPath, args);

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => console.error('[Piper]', d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited ${code}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      // Конвертируем raw PCM в WAV заголовок
      const wav = pcmToWav(buf, 22050, 16, 1);
      resolve({ audio_base64: wav.toString('base64'), format: 'wav' });
    });

    proc.on('error', reject);
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

/**
 * Облачный синтез через Z.ai.
 */
async function synthesizeCloud(cfg: TTSConfig, text: string): Promise<{ audio_base64: string; format: string }> {
  if (!cfg.cloudApiKey) {
    throw new Error('Не настроен облачный TTS: укажите ZAI_API_KEY.');
  }

  // Use cached ZAI SDK instance
  const { getZAISDK } = await import('./llm');
  const zai = await getZAISDK();
  const resp = await zai.audio.tts.create({
    input: text.slice(0, 1500),
    voice: cfg.cloudVoice,
    response_format: 'mp3',
  });
  const audio =
    (resp as { audio?: string; data?: string }).audio ??
    (resp as { data?: string }).data ??
    '';
  if (!audio) throw new Error('TTS вернул пустой ответ');
  return { audio_base64: audio, format: 'mp3' };
}

/**
 * Конвертация raw PCM в WAV файл.
 */
function pcmToWav(pcm: Buffer, sampleRate: number, bitsPerSample: number, channels: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);

  return buffer;
}
