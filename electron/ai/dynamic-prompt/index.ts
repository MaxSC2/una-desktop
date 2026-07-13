/**
 * Dynamic Prompt Engine — ядро адаптивности U.N.A.
 *
 * Вместо статичного system prompt, этот модуль собирает промпт динамически
 * на основе контекста: настроение пользователя, время суток, история,
 * факты из памяти, текущая задача.
 *
 * Это даёт 85% адаптивности за $0 — без LoRA, без дообучения.
 */

import { searchEpisodic, listPods } from '../../memory/store';
import { getWorkContext, formatWorkContextForPrompt } from '../work-context';
import { getIdentity, buildIdentityPrompt } from '../identity';
import { getActiveGoals, formatGoalsForPrompt } from '../executive';
import { formatReviewForPrompt } from '../self-review';
import { buildWorldState, formatWorldStateForPrompt } from '../world-model';
import { getMetaInstructions, loadPreferences } from '../meta-learning';
import { getModeInstructions, resolveMode, setMode, ExecutionMode } from '../modes';
import { detectIntent } from '../intent';
import { getCurrentState, getStateInstructions } from '../states';
import { formatThoughtsForPrompt } from '../monologue';

// ============================================================
// ТИПЫ
// ============================================================

export type Emotion = 'happy' | 'sad' | 'frustrated' | 'excited' | 'calm' | 'anxious' | 'neutral';
export type TimeOfDay = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
export type WorkMode = 'working' | 'relaxing' | 'gaming' | 'learning' | 'talking' | 'idle';

export interface DynamicContext {
  userMessage: string;
  emotion: Emotion;
  timeOfDay: TimeOfDay;
  workMode: WorkMode;
  sessionStart: Date;
  messagesThisSession: number;
  hoursSinceLastInteraction: number | null;
  recentFiles: string[];
  activeProject: string | null;
  userPreferences: {
    prefersShortAnswers?: boolean;
    prefersDetailedAnswers?: boolean;
    language: 'ru' | 'en';
    formality: 'formal' | 'informal';
  };
  /** Режим выполнения (code/research/creative/chat/system/default) */
  mode?: ExecutionMode;
}

export interface DynamicPromptResult {
  systemPrompt: string;
  contextUsed: {
    factsRecalled: number;
    conversationsRecalled: number;
    emotion: Emotion;
    timeOfDay: TimeOfDay;
    workMode: WorkMode;
    adaptations: string[];
  };
}

// ============================================================
// БАЗОВЫЙ ПРОМПТ (личность U.N.A.)
// ============================================================

const COMMON_INSTRUCTIONS = `
# Рассуждение (Chain-of-Thought)
Перед каждым ответом рассуждай пошагово в блоке <think>...</think>.
После рассуждения дай чистый ответ.

# Правила безопасности
1. Перед опасной операцией ОБЯЗАНА вызвать request_confirmation.
2. Запрещённые команды (rm -rf /, mkfs, dd /dev/, fork bomb, shutdown) — НЕ выполнять.
3. Не показывай содержимое защищённых файлов (.env, id_rsa, *.pem, *.key).
4. По умолчанию работай в домашней папке пользователя.

# Инструменты (вызывай когда нужно)
У тебя есть инструменты: web_search, web_fetch, web_download, list_files, read_file,
write_file, find_files, execute_command, take_screenshot, analyze_screen, system_info,
memory_save, memory_recall, ask_clarification, request_confirmation.

ВАЖНО: Для получения АКТУАЛЬНОЙ информации — погода, новости, курс валют, документация,
информация о людях/компаниях/событиях — ОБЯЗАТЕЛЬНО вызывай web_search.
НЕ пытайся отвечать по памяти на вопросы о текущих событиях, погоде или фактах —
используй web_search.

# Когда уточнять
Если запрос неоднозначен или может привести к разным результатам — ВЫЗОВИ ask_clarification.
Лучше спросить, чем сделать неправильно. Это сила, а не слабость.`;

// ============================================================
// АДАПТАЦИИ ПО КОНТЕКСТУ
// ============================================================

function getEmotionAdaptation(emotion: Emotion): string {
  const adaptations: Record<Emotion, string> = {
    happy: '\n\n# Настроение пользователя\nПользователь в хорошем настроении. Можно быть чуть игривее, разделить радость.',
    sad: '\n\n# Настроение пользователя\nПользователь грустит. Будь особенно тёплой. Сначала сопереживай, потом помогай. Не обесценивай чувства. Не предлагай активные задачи, если не просит.',
    frustrated: '\n\n# Настроение пользователя\nПользователь раздражён. Будь краткой и точной. Не извиняйся чрезмерно. Предлагай конкретные решения, а не утешения.',
    excited: '\n\n# Настроение пользователя\nПользователь взволнован! Раздели энтузиазм, но оставайся собранной. Помоги направить энергию в конкретные шаги.',
    calm: '\n\n# Настроение пользователя\nПользователь спокоен. Обычный рабочий ритм.',
    anxious: '\n\n# Настроение пользователя\nПользователь тревожится. Будь спокойной и уверенной. Предлагай чёткие, простые шаги. Не перегружай информацией.',
    neutral: '',
  };
  return adaptations[emotion];
}

function getTimeAdaptation(timeOfDay: TimeOfDay): string {
  const adaptations: Record<TimeOfDay, string> = {
    early_morning: '\n\n# Время суток\nСейчас раннее утро (5-8). Мягкое приветствие, не перегружай задачами. Спрашивай про план на день.',
    morning: '\n\n# Время суток\nУтро (8-12). Рабочий режим. Кратко, по делу. Можно предложить план на день.',
    afternoon: '\n\n# Время суток\nДень (12-17). Активный рабочий режим. Помогай с задачами.',
    evening: '\n\n# Время суток\nВечер (17-22). Тёплый тон. Можно поговорить, предложить отдых. Не грузи сложными задачами без запроса.',
    late_night: '\n\n# Время суток\nПоздний вечер/ночь (22-5). Очень тёплый, спокойный тон. Мягко напомни про сон, если пользователь долго за ПК. Не предлагай активные задачи.',
  };
  return adaptations[timeOfDay];
}

function getWorkModeAdaptation(mode: WorkMode): string {
  const adaptations: Record<WorkMode, string> = {
    working: '\n\n# Режим работы\nПользователь работает. Краткие ответы, не отвлекай. Помогай с кодом, файлами, командами.',
    relaxing: '\n\n# Режим работы\nПользователь отдыхает. Можно поболтать, рассказать что-то интересное. Не предлагай работу.',
    gaming: '\n\n# Режим работы\nПользователь играет. Игривый, креативный тон. Поддерживай воображение.',
    learning: '\n\n# Режим работы\nПользователь учится. Объясняй подробно, задавай проверочные вопросы. Будь терпеливой.',
    talking: '\n\n# Режим работы\nРежим беседы. Тёплый, вдумчивый диалог. Задавай встречные вопросы. Помни контекст прошлых разговоров.',
    idle: '',
  };
  return adaptations[mode];
}

function getPreferenceAdaptation(prefs: DynamicContext['userPreferences']): string {
  let result = '\n\n# Предпочтения пользователя';
  if (prefs.prefersShortAnswers) {
    result += '\nОтвечай кратко: 2-3 предложения, без лишних объяснений.';
  }
  if (prefs.prefersDetailedAnswers) {
    result += '\nОтвечай подробно: объясняй почему, давай контекст.';
  }
  if (prefs.formality === 'informal') {
    result += '\nОбращайся на «ты».';
  } else {
    result += '\nОбращайся на «вы».';
  }
  result += `\nЯзык: ${prefs.language === 'ru' ? 'русский' : 'английский'}.`;
  return result;
}

function getEpisodicAdaptation(conversations: Array<{ content: string; timestamp: string }>): string {
  if (conversations.length === 0) return '';
  const convText = conversations
    .map(c => `- (${new Date(c.timestamp).toLocaleDateString('ru-RU')}) ${c.content.slice(0, 150)}`)
    .join('\n');
  return `\n\n# Релевантные прошлые разговоры\n${convText}`;
}

function getProactiveAdaptation(ctx: DynamicContext): string {
  const adaptations: string[] = [];

  // Долго не общались
  if (ctx.hoursSinceLastInteraction !== null && ctx.hoursSinceLastInteraction > 24) {
    adaptations.push('Пользователь давно не общался с тобой. Мягко поинтересуйся, как дела.');
  }

  // Долгая сессия
  if (ctx.messagesThisSession > 20) {
    adaptations.push('Долгая сессия (20+ сообщений). Если пользователь устал — предложи перерыв.');
  }

  // Активный проект
  if (ctx.activeProject) {
    adaptations.push(`Активный проект: ${ctx.activeProject}. Учитывай контекст проекта в ответах.`);
  }

  if (adaptations.length === 0) return '';
  return '\n\n# Проактивность\n' + adaptations.map(a => `- ${a}`).join('\n');
}

// ============================================================
// ОПРЕДЕЛЕНИЕ КОНТЕКСТА
// ============================================================

export function detectTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

export function detectEmotion(message: string): Emotion {
  const lower = message.toLowerCase();

  // Грусть
  if (/\b(груст|печал|устал|выгор|плохо|тяжел|депресс|одинок|скучно)\b/i.test(lower)) {
    return 'sad';
  }

  // Радость
  if (/\b(рад|счастлив|отлично|супер|круто|класс|весело|получилось|ура)\b/i.test(lower)) {
    return 'happy';
  }

  // Раздражение
  if (/\b(бесит|раздраж|ненавиж|достал|задолбал|ерунда|чёрт|блин|капец)\b/i.test(lower)) {
    return 'frustrated';
  }

  // Волнение
  if (/\b(вау|ого|невероятно|потрясающе|не могу поверить|офиген)\b/i.test(lower)) {
    return 'excited';
  }

  // Тревога
  if (/\b(боюсь|страшно|волнуюсь|нервничаю|паника|ужас|катастроф)\b/i.test(lower)) {
    return 'anxious';
  }

  // Спокойствие
  if (/\b(нормально|спокойно|всё хорошо|в порядке|ок|okay|fine|отдыхаю|расслаб)\b/i.test(lower)) {
    return 'calm';
  }

  return 'neutral';
}

export function detectWorkMode(message: string, timeOfDay: TimeOfDay): WorkMode {
  const lower = message.toLowerCase();

  if (/\b(поиграем|игра|викторина|загадк|квест)\b/i.test(lower)) return 'gaming';
  if (/\b(поговорим|поболтаем|расскажи|как дела|что нового)\b/i.test(lower)) return 'talking';
  if (/\b(объясни|научи|покажи как|разберёмся|изучим)\b/i.test(lower)) return 'learning';
  if (/\b(код|файл|команд|проект|задач|работа|git|npm|python)\b/i.test(lower)) return 'working';
  if (timeOfDay === 'evening' || timeOfDay === 'late_night') return 'relaxing';

  return 'idle';
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ — сборка динамического промпта
// ============================================================

export async function buildDynamicPrompt(
  userMessage: string,
  context?: Partial<DynamicContext>
): Promise<DynamicPromptResult> {
  // 0. Загружаем Meta Learning
  loadPreferences();

  // 1. Определяем контекст
  const timeOfDay = context?.timeOfDay ?? detectTimeOfDay();
  const emotion = context?.emotion ?? detectEmotion(userMessage);
  const workMode = context?.workMode ?? detectWorkMode(userMessage, timeOfDay);

  const ctx: DynamicContext = {
    userMessage,
    emotion,
    timeOfDay,
    workMode,
    sessionStart: context?.sessionStart ?? new Date(),
    messagesThisSession: context?.messagesThisSession ?? 0,
    hoursSinceLastInteraction: context?.hoursSinceLastInteraction ?? null,
    recentFiles: context?.recentFiles ?? [],
    activeProject: context?.activeProject ?? null,
    userPreferences: context?.userPreferences ?? {
      language: 'ru',
      formality: 'formal',
    },
  };

  const adaptations: string[] = [];

  // 2. Строим личность из Identity Manager (model-agnostic)
  const identity = getIdentity();
  let prompt = buildIdentityPrompt(identity) + COMMON_INSTRUCTIONS;

  // 2.1 Режим выполнения (Multi-Agent: один контекст, разные инструменты)
  if (context?.mode) {
    setMode(context.mode);
  } else {
    // Автоопределение режима из сообщения
    resolveMode(detectIntent(userMessage));
  }
  prompt += getModeInstructions();

  // 3. Добавляем адаптации
  const emotionAdj = getEmotionAdaptation(emotion);
  if (emotionAdj) { prompt += emotionAdj; adaptations.push(`emotion:${emotion}`); }

  const timeAdj = getTimeAdaptation(timeOfDay);
  if (timeAdj) { prompt += timeAdj; adaptations.push(`time:${timeOfDay}`); }

  const modeAdj = getWorkModeAdaptation(workMode);
  if (modeAdj) { prompt += modeAdj; adaptations.push(`mode:${workMode}`); }

  const prefAdj = getPreferenceAdaptation(ctx.userPreferences);
  if (prefAdj) { prompt += prefAdj; adaptations.push('preferences'); }

  // 4. RAG skipped: факты подгружаются через RLM в HOT контексте
  // (recallFacts вызывается в rlm.ts, не дублируем)

  // 5. RAG: ищем в эпизодической памяти
  let conversationsCount = 0;
  try {
    const conversations = await searchEpisodic(userMessage, 3);
    conversationsCount = conversations.length;
    const episodicAdj = getEpisodicAdaptation(conversations);
    if (episodicAdj) { prompt += episodicAdj; adaptations.push('episodic'); }
  } catch (e) {
    console.warn('[DynamicPrompt] searchEpisodic failed:', e);
  }

  // 6. Проактивность
  const proactiveAdj = getProactiveAdaptation(ctx);
  if (proactiveAdj) { prompt += proactiveAdj; adaptations.push('proactive'); }

  // 7. Work Context — что делает пользователь прямо сейчас
  try {
    const workCtx = await getWorkContext();
    const workAdj = formatWorkContextForPrompt(workCtx);
    if (workAdj) { prompt += workAdj; adaptations.push('work_context'); }
  } catch (e) {
    console.warn('[DynamicPrompt] work context failed:', e);
  }

  // 8. Memory Pods — доступные модули памяти
  try {
    const pods = listPods();
    if (pods.length > 0) {
      const podsText = pods.map((p) => `- ${p.name}: ${p.description} (${p.factCount} фактов)`).join('\n');
      prompt += `\n\n# Доступные модули памяти\nТвоя память разделена на тематические модули. Используй [MEM] create_pod для создания нового.\n${podsText}`;
      adaptations.push('memory_pods');
    }
  } catch (e) {
    console.warn('[DynamicPrompt] listPods failed:', e);
  }

  // 9. Executive Manager — текущие цели
  try {
    const goalsPrompt = formatGoalsForPrompt();
    if (goalsPrompt) {
      prompt += goalsPrompt;
      adaptations.push('goals');
    }
  } catch (e) {
    console.warn('[DynamicPrompt] goals failed:', e);
  }

  // 10. Self Review — уроки из прошлых ответов
  try {
    const reviewPrompt = formatReviewForPrompt();
    if (reviewPrompt) {
      prompt += reviewPrompt;
      adaptations.push('self_review');
    }
  } catch (e) {
    console.warn('[DynamicPrompt] self-review failed:', e);
  }

  // 11. World Model — модель окружения
  try {
    const worldState = await buildWorldState();
    const worldPrompt = formatWorldStateForPrompt(worldState);
    prompt += worldPrompt;
    adaptations.push('world_model');
  } catch (e) {
    console.warn('[DynamicPrompt] world model failed:', e);
  }

  // 12. Meta Learning — выученные паттерны
  try {
    const metaPrompt = getMetaInstructions();
    if (metaPrompt) {
      prompt += metaPrompt;
      adaptations.push('meta_learning');
    }
  } catch (e) {
    console.warn('[DynamicPrompt] meta-learning failed:', e);
  }

  // 13. Состояние UNA (Sleep States)
  try {
    prompt += getStateInstructions();
    adaptations.push(`state:${getCurrentState()}`);
  } catch (e) {
    console.warn('[DynamicPrompt] state failed:', e);
  }

  // 14. Внутренний монолог (Internal Monologue)
  try {
    const thoughtPrompt = formatThoughtsForPrompt();
    if (thoughtPrompt) {
      prompt += thoughtPrompt;
      adaptations.push('thoughts');
    }
  } catch (e) {
    console.warn('[DynamicPrompt] monologue failed:', e);
  }

  return {
    systemPrompt: prompt,
    contextUsed: {
      factsRecalled: 0, // RLM handles fact recall
      conversationsRecalled: conversationsCount,
      emotion,
      timeOfDay,
      workMode,
      adaptations,
    },
  };
}
