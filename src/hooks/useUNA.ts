/**
 * Главный хук U.N.A. — связывает UI с Electron main process.
 */

'use client';

import { useCallback, useRef } from 'react';
import { useStore, ChatMessage } from '../lib/store';

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useUNA() {
  const store = useStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(userMsg);

      const placeholderId = genId();
      store.addMessage({
        id: placeholderId,
        role: 'assistant',
        content: '...',
        timestamp: new Date().toISOString(),
      });
      store.setStatus('thinking');

      try {
        const data = await window.una.chat.send(text);

        store.updateLastAssistant({
          content: data.reply,
          audio_base64: data.audio_base64,
          toolCalls: data.tool_calls,
        });

        // Сохраняем эмоцию для аватара
        if ((data as any).emotion) {
          store.setCurrentEmotion((data as any).emotion);
        }

        if (data.pending_confirmation) {
          store.setPendingConfirmation(data.pending_confirmation);
          store.setStatus('awaiting_confirmation');
        } else {
          store.setStatus('idle');
        }

        if (data.audio_base64 && store.voiceEnabled) {
          playAudio(data.audio_base64);
        } else if (store.voiceEnabled && data.reply) {
          // Fallback: серверный TTS не настроен — озвучиваем системным голосом ОС
          speakText(data.reply);
        }

        return data;
      } catch (e) {
        store.updateLastAssistant({
          content: `Ошибка: ${(e as Error).message}`,
        });
        store.setStatus('idle');
        return null;
      }
    },
    [store]
  );

  /**
   * Streaming-версия sendMessage.
   * Использует chat:stream IPC + подписывается на chat:chunk / chat:stream-end / chat:stream-error events.
   * Текст печатается в реальном времени, по мере получения токенов от LLM.
   */
  const sendMessageStream = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      store.addMessage(userMsg);

      const placeholderId = genId();
      store.addMessage({
        id: placeholderId,
        role: 'assistant',
        content: '', // Начинаем с пустого, будем наполнять
        timestamp: new Date().toISOString(),
      });
      store.setStatus('thinking');

      // Подписываемся на chunk events
      const unsubChunk = window.una.on('chat:chunk', (chunk: any) => {
        if (chunk.type === 'text' && chunk.delta) {
          // Добавляем кусочек текста к сообщению
          store.appendToMessage(placeholderId, chunk.delta);
        } else if (chunk.type === 'tool_start') {
          // U.N.A. начала вызывать инструменты
          store.setStatus('executing');
        } else if (chunk.type === 'tool_result') {
          // Инструмент завершился — возвращаемся к thinking (ждём финальный текст)
          store.setStatus('thinking');
        } else if (chunk.type === 'tool_done') {
          // Все инструменты завершены, ждём финальный текст
          store.setStatus('thinking');
        }
      });

      const unsubEnd = window.una.on('chat:stream-end', (data: any) => {
        // Финальный ответ — обновляем сообщение целиком (на случай если были tool calls)
        store.updateMessageById(placeholderId, {
          content: data.reply,
          audio_base64: data.audio_base64,
          toolCalls: data.tool_calls,
        });

        if (data.emotion) {
          store.setCurrentEmotion(data.emotion);
        }

        if (data.pending_confirmation) {
          store.setPendingConfirmation(data.pending_confirmation);
          store.setStatus('awaiting_confirmation');
        } else {
          store.setStatus('idle');
        }

        if (data.audio_base64 && store.voiceEnabled) {
          playAudio(data.audio_base64);
        } else if (store.voiceEnabled && data.reply) {
          // Fallback: серверный TTS не настроен — озвучиваем системным голосом ОС
          speakText(data.reply);
        }
      });

      const unsubError = window.una.on('chat:stream-error', (err: any) => {
        store.updateMessageById(placeholderId, {
          content: `Ошибка: ${err.error ?? 'неизвестная'}`,
        });
        store.setStatus('idle');
      });

      try {
        await window.una.chat.stream(text);
      } catch (e) {
        store.updateMessageById(placeholderId, {
          content: `Ошибка: ${(e as Error).message}`,
        });
        store.setStatus('idle');
      } finally {
        // Отписываемся после завершения
        unsubChunk();
        unsubEnd();
        unsubError();
        // Fix: don't reset status if stream-end already arrived
        // (prevents race condition where finally runs before stream-end callback)
        const currentStatus = useStore.getState().status;
        if (currentStatus === 'thinking' || currentStatus === 'executing') {
          useStore.getState().setStatus('idle');
        }
      }
    },
    [store]
  );

  const confirmAction = useCallback(async () => {
    const conf = store.pendingConfirmation;
    if (!conf) return;
    await window.una.chat.confirm(conf.token, conf.action);
    store.setPendingConfirmation(null);
    store.setStatus('idle');
    store.addMessage({
      id: genId(),
      role: 'system',
      content: `Подтверждено: ${conf.action}`,
      timestamp: new Date().toISOString(),
    });
  }, [store]);

  const rejectAction = useCallback(() => {
    const conf = store.pendingConfirmation;
    if (!conf) return;
    store.addMessage({
      id: genId(),
      role: 'assistant',
      content: `Действие отклонено: ${conf.action}`,
      timestamp: new Date().toISOString(),
    });
    store.setPendingConfirmation(null);
    store.setStatus('idle');
  }, [store]);

  const playAudio = useCallback((base64: string) => {
    try {
      const blob = base64ToBlob(base64, 'audio/mp3');
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onplay = () => useStore.getState().setStatus('speaking');
      audioRef.current.onended = () => {
        URL.revokeObjectURL(url);
        useStore.getState().setStatus('idle');
      };
      audioRef.current.play().catch(() => {});
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // Останавливаем и системный синтез речи (fallback-озвучка)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (store.status === 'speaking') store.setStatus('idle');
  }, [store]);

  const startListening = useCallback(async () => {
    store.setStatus('listening');

    // Если серверный ASR не настроен (нет whisper.cpp / облачного ключа) —
    // пробуем встроенное распознавание речи движка (best-effort).
    if (!(await hasServerAsr()) && getSpeechRecognitionCtor()) {
      const started = startWebSpeechRecognition(
        (t) => { void sendMessage(t); },
        (s) => store.setStatus(s),
      );
      if (started) return; // WebSpeech запущен, MediaRecorder не нужен
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const base64 = await blobToBase64(blob);
        store.setStatus('thinking');
        try {
          const text = await window.una.asr.transcribe(base64);
          if (text && text.trim()) {
            await sendMessage(text);
          } else {
            store.setStatus('idle');
          }
        } catch (e) {
          console.error('ASR error:', e);
          store.addMessage({
            id: genId(),
            role: 'assistant',
            content: '🎙️ Голосовой ввод недоступен: не настроен ASR (whisper.cpp или облачный ключ Z.ai). Укажите пути в настройках или произнесите команду ещё раз.',
            timestamp: new Date().toISOString(),
          });
          store.setStatus('idle');
        }
      };
      mr.start();
      // Останавливаем через 5 секунд автоматически, или по кнопке
      setTimeout(() => mr.state === 'recording' && mr.stop(), 5000);
      // Сохраняем recorder для ручной остановки
      (window as any).__unaRecorder = mr;
    } catch (e) {
      console.error('Mic error:', e);
      store.setStatus('idle');
    }
  }, [store, sendMessage]);

  const stopListening = useCallback(() => {
    const mr = (window as any).__unaRecorder as MediaRecorder | undefined;
    if (mr && mr.state === 'recording') mr.stop();
  }, []);

  /**
   * Останавливает генерацию ответа U.N.A.
   * Main process прерывает fetch запрос через AbortController.
   */
  const stopGeneration = useCallback(() => {
    window.una.chat.stop().catch(() => {});
    useStore.getState().setStatus('idle');
  }, []);

  return {
    sendMessage,
    sendMessageStream,
    stopGeneration,
    confirmAction,
    rejectAction,
    playAudio,
    stopAudio,
    startListening,
    stopListening,
  };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const cleaned = base64.replace(/^data:audio\/\w+;base64,/, '');
  const bytes = atob(cleaned);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================
// Голосовой fallback из коробки (без Piper / Z.ai)
// ============================================================

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

/**
 * Проверяет, настроен ли серверный ASR (whisper.cpp или облачный ключ).
 */
async function hasServerAsr(): Promise<boolean> {
  try {
    const cfg = (await window.una.config.get()) as {
      asr?: { provider?: string; whisperPath?: string; cloudApiKey?: string };
    };
    const asr = cfg?.asr;
    if (!asr) return false;
    if (asr.provider === 'local') return !!asr.whisperPath;
    if (asr.provider === 'cloud') return !!asr.cloudApiKey;
    // auto: работает если настроено хоть что-то
    return !!asr.whisperPath || !!asr.cloudApiKey;
  } catch {
    return false;
  }
}

/**
 * Живое распознавание через Web Speech API (best-effort; в части сборок
 * Electron может быть недоступно — тогда возвращаем false и идём старым путём).
 */
function startWebSpeechRecognition(
  onText: (text: string) => void,
  onStatus: (status: 'listening' | 'idle') => void,
): boolean {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return false;
  try {
    const rec = new Ctor();
    rec.lang = 'ru-RU';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: unknown) => {
      const ev = e as { results: ArrayLike<ArrayLike<{ transcript?: string }>> };
      const text = Array.from(ev.results as ArrayLike<any>)
        .map((r) => r?.[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    rec.onerror = () => onStatus('idle');
    rec.onend = () => {
      // Статус обновляется в onText (→ thinking) или onerror (→ idle)
    };
    rec.start();
    return true;
  } catch {
    return false;
  }
}

/**
 * Системная озвучка через speechSynthesis (работает в Electron на Windows/Linux/macOS).
 * Используется когда Piper/Z.ai TTS не настроены — голос работает из коробки.
 */
function speakText(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const clean = text
      .replace(/```[\s\S]*?```/g, ' фрагмент кода ')
      .replace(/[*_`#>|]/g, '')
      .slice(0, 1000);
    if (!clean.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find((v) => v.lang?.toLowerCase().startsWith('ru'));
    if (ruVoice) utter.voice = ruVoice;
    utter.lang = ruVoice?.lang ?? 'ru-RU';
    utter.rate = 1.05;
    utter.onstart = () => useStore.getState().setStatus('speaking');
    utter.onend = () => useStore.getState().setStatus('idle');
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.error('SpeechSynthesis error:', e);
  }
}
