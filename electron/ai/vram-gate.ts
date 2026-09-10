/**
 * VRAM Gate — освобождает видеопамять под игры/тяжёлые приложения.
 *
 * Следит за активностью пользователя через resource-manager. Если обнаружен
 * игровой сеанс ('gaming') — отправляет Ollama «тихий» запрос с keep_alive: 0,
 * после которого модель выгружается из VRAM немедленно (или по завершении
 * текущей генерации). Обычные запросы UNA остаются с keep_alive: '5m'.
 *
 * Без детекта игр: юзер играет, а модель висит в VRAM → фризы/нехватка памяти.
 * С vram-gate: игра пошла → VRAM свободна.
 */

import { getResourceState, UserActivity } from './resource-manager';
import { getConfig } from './config';

let timer: ReturnType<typeof setInterval> | null = null;
let lastUnloadAt = 0;
let wasGaming = false;

const CHECK_MS = 15_000; // раз в 15с проверяем активность
const UNLOAD_COOLDOWN_MS = 60_000; // не дёргаем ollama чаще раза в минуту

/**
 * «Тихий» запрос к Ollama: keep_alive = 0 → модель выгрузится после ответа.
 * Через нативный /api/chat — крошечный ответ, минимум токенов.
 */
export async function unloadOllamaModel(): Promise<boolean> {
  const cfg = getConfig().llm;
  if (!cfg.localUrl) return false;
  try {
    const resp = await fetch(`${cfg.localUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.localModel,
        messages: [{ role: 'user', content: 'ok' }],
        stream: false,
        keep_alive: 0, // выгрузить сразу после ответа
        options: { num_predict: 1 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[VRAMGate] unload non-ok:', resp.status, txt.slice(0, 120));
      return false;
    }
    lastUnloadAt = Date.now();
    console.log(`[VRAMGate] Ollama model unloaded (keep_alive=0), VRAM free for gaming`);
    return true;
  } catch (e) {
    console.warn('[VRAMGate] unload failed:', (e as Error).message);
    return false;
  }
}

/**
 * Проверить активность и, если игра запущена, выгрузить модель.
 * Возвращает true если выгрузка произведена.
 */
export async function checkAndFreeVram(): Promise<boolean> {
  // getResourceState() уважает TTL-кэш (45с) — лишних процесс-спавнов не будет.
  const state = await getResourceState();
  const activity: UserActivity | undefined = state?.activity;

  if (activity === 'gaming') {
    wasGaming = true;
    if (Date.now() - lastUnloadAt >= UNLOAD_COOLDOWN_MS) {
      return await unloadOllamaModel();
    }
  } else if (wasGaming) {
    // Игра закрыта — модель подгрузится сама при следующем запросе (keep_alive 5m)
    wasGaming = false;
    console.log('[VRAMGate] Game session ended — model will reload on next request');
  }
  return false;
}

export function startVramGate(): void {
  if (timer) return;
  // Первая проверка — сразу после старта
  void checkAndFreeVram();
  timer = setInterval(() => { void checkAndFreeVram(); }, CHECK_MS);
  console.log('[VRAMGate] started (every 15s, cooldown 60s)');
}

export function stopVramGate(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function isVramGateRunning(): boolean {
  return timer !== null;
}