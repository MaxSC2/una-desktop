/**
 * Proactive Engine — U.N.A. сама инициирует контакт.
 *
 * Как коллега, который:
 * - Замечает, что вы засиделись → предлагает перерыв
 * - Видит незакоммиченные файлы → напоминает
 * - Замечает повторяющуюся ошибку → предлагает помощь
 * - Вспоминает, что вы обещали кому-то → напоминает
 *
 * НЕ спамит. Одно предложение → если игнор → замолкает.
 * Периодичность: каждые 30-60 минут (настраивается).
 */

import { BrowserWindow, Notification } from 'electron';
import { getWorkContext, WorkContext } from './work-context';
import { getLastEmotion, getEmotionSummary } from '../memory/store';

export interface ProactiveSuggestion {
  id: string;
  type: 'break' | 'git_reminder' | 'error_pattern' | 'memory_recall' | 'mood_check' | 'task_reminder';
  priority: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  action?: string; // текст команды для выполнения
  timestamp: Date;
}

let proactiveTimer: ReturnType<typeof setInterval> | null = null;
let lastSuggestionTime: Date = new Date();
let lastSuggestionType: string | null = null;
let ignoredCount: number = 0;

const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 минут минимум между предложениями
const MAX_IGNORED = 3; // после 3 игнорирований — затихаем на 2 часа

/**
 * Запустить proactive engine.
 */
export function startProactiveEngine(getMainWindow: () => BrowserWindow | null): void {
  if (proactiveTimer) return;

  // Проверяем каждые 10 минут
  proactiveTimer = setInterval(async () => {
    await checkAndSuggest(getMainWindow);
  }, 10 * 60 * 1000);

  console.log('[Proactive] Engine started (interval: 10 min)');
}

/**
 * Остановить.
 */
export function stopProactiveEngine(): void {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
    console.log('[Proactive] Engine stopped');
  }
}

/**
 * Главная проверка — собрать контекст и решить, нужно ли предложить.
 */
async function checkAndSuggest(getMainWindow: () => BrowserWindow | null): Promise<void> {
  const now = new Date();
  const sinceLast = now.getTime() - lastSuggestionTime.getTime();

  // Если слишком рано — пропускаем
  if (sinceLast < MIN_INTERVAL_MS) return;

  // Если пользователь игнорирует — затихаем
  if (ignoredCount >= MAX_IGNORED) {
    const quietHours = 2 * 60 * 60 * 1000;
    if (sinceLast < quietHours) return;
    ignoredCount = 0; // сброс после 2 часов тишины
  }

  try {
    const workCtx = await getWorkContext();
    const lastEmotion = getLastEmotion();
    const emotionSummary = getEmotionSummary(1); // за сегодня

    const suggestion = evaluateContext(workCtx, lastEmotion, emotionSummary);

    if (suggestion) {
      deliverSuggestion(suggestion, getMainWindow);
      lastSuggestionTime = now;
      lastSuggestionType = suggestion.type;
    }
  } catch (e) {
    console.warn('[Proactive] check failed:', e);
  }
}

/**
 * Оценить контекст и сгенерировать предложение.
 */
function evaluateContext(
  workCtx: WorkContext,
  lastEmotion: { emotion: string; timestamp: string } | null,
  emotionSummary: Array<{ emotion: string; count: number }>
): ProactiveSuggestion | null {
  // 1. Перерыв (3+ часа работы)
  if (workCtx.isLongSession) {
    const hours = Math.round(workCtx.workDuration / 60);
    return {
      id: `break_${Date.now()}`,
      type: 'break',
      priority: 'high',
      title: 'Перерыв',
      message: `Сессия ${hours} часов. Засиделись. 5 минут перерыв?`,
      timestamp: new Date(),
    };
  }

  // 2. Git — много незакоммиченных файлов
  for (const repo of workCtx.gitRepos) {
    if (repo.uncommittedCount > 15 && lastSuggestionType !== 'git_reminder') {
      return {
        id: `git_${Date.now()}`,
        type: 'git_reminder',
        priority: 'medium',
        title: 'Git',
        message: `${repo.path.split('/').pop()}: ${repo.uncommittedCount} незакоммиченных файлов. Закоммитить?`,
        action: `Покажи статус git в ${repo.path} и помоги закоммитить`,
        timestamp: new Date(),
      };
    }
  }

  // 3. Настроение — если грустит целый день
  const sadToday = emotionSummary.find(e => e.emotion === 'sad');
  if (sadToday && sadToday.count >= 3 && lastSuggestionType !== 'mood_check') {
    return {
      id: `mood_${Date.now()}`,
      type: 'mood_check',
      priority: 'medium',
      title: 'Как дела?',
      message: `Замечаю, сегодня непростой день. Хочешь поговорить или помочь с чем-то?`,
      timestamp: new Date(),
    };
  }

  // 4. Долго не общались (4+ часа)
  if (lastEmotion) {
    const hoursSince = (Date.now() - new Date(lastEmotion.timestamp).getTime()) / 3600000;
    if (hoursSince > 4 && lastSuggestionType !== 'memory_recall') {
      return {
        id: `recall_${Date.now()}`,
        type: 'memory_recall',
        priority: 'low',
        title: 'Давно не виделись',
        message: `Привет. Была занята своими мыслями. Над чем работаете сейчас?`,
        timestamp: new Date(),
      };
    }
  }

  return null;
}

/**
 * Доставить предложение пользователю.
 */
function deliverSuggestion(
  suggestion: ProactiveSuggestion,
  getMainWindow: () => BrowserWindow | null
): void {
  // Системное уведомление
  const notification = new Notification({
    title: `U.N.A.: ${suggestion.title}`,
    body: suggestion.message,
    silent: suggestion.priority === 'low',
  });

  notification.on('click', () => {
    // Показать главное окно
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      // Отправить предложение в чат
      win.webContents.send('proactive:suggestion', suggestion);
    }
    ignoredCount = 0; // сброс — пользователь отреагировал
  });

  notification.on('close', () => {
    // Игнор — увеличиваем счётчик
    ignoredCount++;
    console.log(`[Proactive] Ignored (${ignoredCount}/${MAX_IGNORED}): ${suggestion.type}`);
  });

  notification.show();
  console.log(`[Proactive] Suggested: ${suggestion.type} — ${suggestion.message}`);
}

/**
 * Пользователь отреагировал на предложение — сбросить счётчик игнорирований.
 */
export function userResponded(): void {
  ignoredCount = 0;
}

/**
 * Принудительно предложить (для тестирования).
 */
export async function forceSuggest(getMainWindow: () => BrowserWindow | null): Promise<void> {
  lastSuggestionTime = new Date(0); // сброс таймера
  ignoredCount = 0;
  await checkAndSuggest(getMainWindow);
}
