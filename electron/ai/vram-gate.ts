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
let lastUnloadFailedAt = 0;

const CHECK_MS = 15_000; // раз в 15с проверяем активность
const UNLOAD_COOLDOWN_MS = 60_000; // не дёргаем ollama чаще раза в минуту
const FAIL_COOLDOWN_MS = 120_000; // после неудачной выгрузки не долбим ollama

/** Есть ли модель уже в памяти Ollama (дешёвый локальный запрос /api/ps). */
async function isModelLoaded(localUrl: string, localModel: string): Promise<boolean> {
  try {
    const resp = await fetch(`${localUrl}/api/ps`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return true; // не смогли проверить — считаем загруженной (безопаснее)
    // /api/ps отвечает {"models":[...]}; на всякий случай принимаем и голый массив.
    const data: unknown = await resp.json();
    const models = Array.isArray(data)
      ? (data as Array<{ name?: string; model?: string }>)
      : ((data as { models?: Array<{ name?: string; model?: string }> } | null)?.models ?? []);
    return models.some(
      (m) => (m.name ?? m.model ?? '').toLowerCase().includes(localModel.toLowerCase())
    );
  } catch {
    return true; // ollama недоступна/ошибка — выгрузку не инициируем
  }
}

/**
 * «Тихий» запрос к Ollama: keep_alive = 0 → модель выгрузится после ответа.
 * Через нативный /api/chat — крошечный ответ, минимум токенов.
 *
 * ВАЖНО: если модель уже выгружена — НЕ отправляем ничего. Пустой /api/chat
 * сам загрузил бы модель в VRAM (GPU-скачок прямо посреди игры).
 */
export async function unloadOllamaModel(): Promise<boolean> {
  const cfg = getConfig().llm;
  if (!cfg.localUrl) return false;

  if (!(await isModelLoaded(cfg.localUrl, cfg.localModel))) {
    return false; // уже выгружена — VRAM и так свободна
  }

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
    console.log('[VRAMGate] Ollama model unloaded (keep_alive=0), VRAM free for gaming');
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
  // Флаг пользователя: выгрузку можно выключить в настройках (resource.unloadOnGaming).
  if (!getConfig().resource.unloadOnGaming) return false;

  // getResourceState() уважает TTL-кэш (45с) — лишних процесс-спавнов не будет.
  const state = await getResourceState();
  const activity: UserActivity | undefined = state?.activity;

  if (activity === 'gaming') {
    wasGaming = true;
    const failedRecently = Date.now() - lastUnloadFailedAt < FAIL_COOLDOWN_MS;
    if (Date.now() - lastUnloadAt >= UNLOAD_COOLDOWN_MS && !failedRecently) {
      const ok = await unloadOllamaModel();
      if (!ok) lastUnloadFailedAt = Date.now();
      return ok;
    }
  } else if (wasGaming) {
    // Игра закрыта — модель подгрузится сама при следующем запросе (keep_alive 5m)
    wasGaming = false;
    console.log('[VRAMGate] Game session ended — model will reload on next request');
  }
  return false;
}

/** Публичный доступ: загружена ли сейчас модель в Ollama (для stats/диагностики). */
export async function isOllamaModelLoaded(): Promise<boolean> {
  const cfg = getConfig().llm;
  if (!cfg.localUrl) return false;
  return isModelLoaded(cfg.localUrl, cfg.localModel);
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