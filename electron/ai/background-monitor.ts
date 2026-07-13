/**
 * Background Monitor — тихий сбор контекста в фоне.
 *
 * Не нагружает систему: проверяет контекст раз в 5 минут,
 * сохраняет snapshot в память для будущих запросов.
 *
 * Это позволяет U.N.A. «помнить» что вы делали, даже если
 * не общались с ней напрямую.
 */

import { getWorkContext, WorkContext, updateActivity } from './work-context';
import { saveFact } from '../memory/store';
import { getProactiveConfig } from './config';

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: WorkContext | null = null;
let monitorCount: number = 0;

function minutes(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/**
 * Запустить фоновый мониторинг.
 */
export function startBackgroundMonitor(): void {
  if (monitorTimer) return;

  const cfg = getProactiveConfig();
  if (!cfg.backgroundMonitorEnabled) {
    console.log('[BackgroundMonitor] Disabled in config');
    return;
  }

  const intervalMinutes = minutes(cfg.backgroundMonitorIntervalMinutes, 5, 1, 24 * 60);

  monitorTimer = setInterval(async () => {
    await collectSnapshot();
  }, intervalMinutes * 60 * 1000);

  console.log(`[BackgroundMonitor] Started (interval: ${intervalMinutes} min)`);
}

/**
 * Остановить.
 */
export function stopBackgroundMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log('[BackgroundMonitor] Stopped');
  }
}

/**
 * Собрать snapshot контекста.
 */
async function collectSnapshot(): Promise<void> {
  const cfg = getProactiveConfig();
  if (!cfg.backgroundMonitorEnabled) return;

  try {
    const ctx = await getWorkContext();
    lastSnapshot = ctx;
    monitorCount++;

    // Каждые 30 минут — сохраняем ключевые паттерны в память
    const saveEveryChecks = Math.min(Math.max(cfg.backgroundSaveEveryChecks, 1), 288);
    if (monitorCount % saveEveryChecks === 0) {
      await saveSnapshotToMemory(ctx);
    }

    // Обновляем активность (даже если пользователь не пишет U.N.A.)
    updateActivity();
  } catch (e) {
    console.warn('[BackgroundMonitor] snapshot failed:', e);
  }
}

/**
 * Сохранить snapshot в память — U.N.A. «запоминает» что вы делали.
 */
async function saveSnapshotToMemory(ctx: WorkContext): Promise<void> {
  // Запоминаем активные проекты
  if (ctx.activeProjects.length > 0) {
    const projectList = ctx.activeProjects.join(', ');
    try {
      await saveFact('project', `Активные проекты: ${projectList}`);
    } catch {
      // memory может быть не инициализирована
    }
  }

  // Запоминаем долгую сессию
  if (ctx.isLongSession) {
    const hours = Math.round(ctx.workDuration / 60);
    try {
      await saveFact('task', `Долгая сессия: ${hours} часов непрерывной работы`);
    } catch {}
  }

  // Запоминаем незакоммиченные репозитории
  for (const repo of ctx.gitRepos) {
    if (repo.uncommittedCount > 5) {
      try {
        await saveFact(
          'task',
          `${repo.path.split('/').pop()}: ${repo.uncommittedCount} незакоммиченных файлов`
        );
      } catch {}
    }
  }
}

/**
 * Получить последний snapshot (для proactive engine и UI).
 */
export function getLastSnapshot(): WorkContext | null {
  return lastSnapshot;
}

/**
 * Принудительно собрать snapshot (для тестирования).
 */
export async function forceSnapshot(): Promise<WorkContext | null> {
  await collectSnapshot();
  return lastSnapshot;
}

/**
 * Статистика мониторинга.
 */
export function getMonitorStats(): {
  isRunning: boolean;
  checksPerformed: number;
  lastSnapshotTime: Date | null;
} {
  return {
    isRunning: monitorTimer !== null,
    checksPerformed: monitorCount,
    lastSnapshotTime: lastSnapshot ? new Date() : null,
  };
}
