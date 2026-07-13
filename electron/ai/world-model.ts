import * as os from 'os';
import { getWorkContext, WorkContext } from './work-context';
import { getConfig } from './config';

export interface WorldState {
  // Time awareness
  timezone: string;
  localTime: string;
  dayOfWeek: string;
  uptimeHours: number;

  // User context
  osInfo: string;
  hostname: string;
  locale: string;

  // Work context snapshot
  workContext: WorkContext | null;

  // Session
  sessionId: string;
  sessionStart: string;
  messageCount: number;

  // Persistent patterns (learned over time)
  knownPatterns: string[];
}

let sessionId = `session_${Date.now()}`;
let sessionStart = new Date().toISOString();
let messageCount = 0;

export function incrementMessageCount(): void {
  messageCount++;
}

export function resetSession(): void {
  sessionId = `session_${Date.now()}`;
  sessionStart = new Date().toISOString();
  messageCount = 0;
}

export async function buildWorldState(): Promise<WorldState> {
  const now = new Date();
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  let workContext: WorkContext | null = null;
  try {
    workContext = await getWorkContext();
  } catch {
    // work context unavailable
  }

  const config = getConfig();
  const knownPatterns: string[] = [];

  if (workContext) {
    if (workContext.isLongSession) {
      knownPatterns.push('долгая рабочая сессия');
    }
    if (workContext.gitRepos.length > 0) {
      knownPatterns.push(`активные репозитории: ${workContext.gitRepos.map(r => os.hostname).join(', ')}`);
    }
  }

  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localTime: now.toLocaleString('ru-RU'),
    dayOfWeek: days[now.getDay()],
    uptimeHours: Math.round(os.uptime() / 3600),

    osInfo: `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
    locale: Intl.DateTimeFormat().resolvedOptions().locale,

    workContext,
    sessionId,
    sessionStart,
    messageCount,

    knownPatterns,
  };
}

export function formatWorldStateForPrompt(state: WorldState): string {
  const parts: string[] = [];

  parts.push(`\n\n# Модель мира`);
  parts.push(`Время: ${state.localTime} (${state.dayOfWeek})`);
  parts.push(`Часовой пояс: ${state.timezone}`);
  parts.push(`Система: ${state.osInfo}`);

  if (state.uptimeHours > 1) {
    parts.push(`Время работы ПК: ~${state.uptimeHours}ч`);
  }

  if (state.workContext) {
    const wc = state.workContext;

    if (wc.activeProjects.length > 0) {
      parts.push(`Проекты: ${wc.activeProjects.slice(0, 5).join(', ')}`);
    }

    if (wc.workDuration > 10) {
      const hours = Math.floor(wc.workDuration / 60);
      const mins = wc.workDuration % 60;
      parts.push(`Сессия: ${hours > 0 ? `${hours}ч ` : ''}${mins}м`);
    }

    const dirtyRepos = wc.gitRepos.filter(r => r.status === 'dirty');
    if (dirtyRepos.length > 0) {
      parts.push(`Git: ${dirtyRepos.length} репозиториев с незакоммиченными изменениями`);
    }
  }

  if (state.messageCount > 5) {
    parts.push(`Сообщений в сессии: ${state.messageCount}`);
  }

  if (state.knownPatterns.length > 0) {
    parts.push(`Замечено: ${state.knownPatterns.join('; ')}`);
  }

  return parts.join('\n');
}
