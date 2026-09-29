import { saveFact, listFacts } from '../memory/store';

export interface ReviewEntry {
  id: string;
  timestamp: string;
  userMessage: string;
  responsePreview: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  lessons: string[];
  toolCallCount: number;
  hadError: boolean;
}

export interface ReviewSummary {
  totalReviews: number;
  averageScore: number;
  topWeaknesses: Array<{ pattern: string; count: number }>;
  recentLessons: string[];
}

let inMemoryReviews: ReviewEntry[] = [];
const MAX_REVIEWS_IN_MEMORY = 20;

// Границы слова с поддержкой кириллицы (Fix 0, TASK-016 — тот же подход, что TASK-013/Q-META):
// в JS \w = [A-Za-z0-9_], поэтому \b мёртв рядом с А-Я (чисто русский текст не матчился).
// wbr — полное слово (обе границы), wbs — стем-префикс (только начальная граница).
const WB_START = '(?:(?<![A-Za-zА-Яа-яЁё0-9_]))';
const WB_END = '(?:(?![A-Za-zА-Яа-яЁё0-9_]))';

// Check 2: стемы (погод-, новост-, ...) — wbs; полные слова — wbr.
const NEEDS_WEB_RE = new RegExp(
  `${WB_START}(?:погод|новост|актуальн|последн)` +
  `|${WB_START}(?:курс|доллар|евро|сейчас|сегодня|новый|вышел)${WB_END}`,
  'i'
);
// Check 4: 'здравствуй' — стем (здравствуйте), 'привет'/'добрый' — полные слова.
const GREETING_RE = new RegExp(
  `${WB_START}здравствуй|${WB_START}(?:привет|добрый)${WB_END}`,
  'i'
);
const USER_GREETED_RE = new RegExp(
  `${WB_START}здравствуй|${WB_START}привет${WB_END}`,
  'i'
);
// Check 7: все префиксы — полные слова.
const ANSWER_PREFIX_RE = new RegExp(
  `${WB_START}(?:да|нет|конечно|разумеется|вот)${WB_END}`,
  'i'
);

export function reviewResponse(
  userMessage: string,
  assistantResponse: string,
  options: {
    toolCallCount?: number;
    hadError?: boolean;
  } = {}
): ReviewEntry {
  const checks = runChecks(userMessage, assistantResponse, options);

  const entry: ReviewEntry = {
    id: `review_${Date.now()}`,
    timestamp: new Date().toISOString(),
    userMessage: userMessage.slice(0, 200),
    responsePreview: assistantResponse.slice(0, 300),
    score: checks.score,
    strengths: checks.strengths,
    weaknesses: checks.weaknesses,
    lessons: checks.lessons,
    toolCallCount: options.toolCallCount ?? 0,
    hadError: options.hadError ?? false,
  };

  inMemoryReviews.unshift(entry);
  if (inMemoryReviews.length > MAX_REVIEWS_IN_MEMORY) {
    inMemoryReviews.pop();
  }

  // Persist as a fact in memory
  try {
    saveFact('self_review', JSON.stringify({
      score: entry.score,
      strengths: entry.strengths,
      weaknesses: entry.weaknesses,
      lessons: entry.lessons,
      toolCalls: entry.toolCallCount,
    }));
  } catch (e) {
    console.warn('[SelfReview] save failed:', e);
  }

  return entry;
}

export function getRecentReviews(limit = 5): ReviewEntry[] {
  return inMemoryReviews.slice(0, limit);
}

export function getReviewSummary(): ReviewSummary {
  if (inMemoryReviews.length === 0) {
    return { totalReviews: 0, averageScore: 0, topWeaknesses: [], recentLessons: [] };
  }

  const total = inMemoryReviews.length;
  const avgScore = inMemoryReviews.reduce((s, r) => s + r.score, 0) / total;

  const weaknessCount = new Map<string, number>();
  for (const r of inMemoryReviews) {
    for (const w of r.weaknesses) {
      weaknessCount.set(w, (weaknessCount.get(w) ?? 0) + 1);
    }
  }

  const topWeaknesses = [...weaknessCount.entries()]
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const allLessons = inMemoryReviews.flatMap((r) => r.lessons);
  const uniqueLessons = [...new Set(allLessons)].slice(0, 5);

  return {
    totalReviews: total,
    averageScore: Math.round(avgScore * 10) / 10,
    topWeaknesses,
    recentLessons: uniqueLessons,
  };
}

export function formatReviewForPrompt(): string {
  const summary = getReviewSummary();
  if (summary.totalReviews === 0) return '';

  let result = `\n\n# Саморефлексия (последние ${summary.totalReviews} ответов)`;
  result += `\nСредняя оценка: ${summary.averageScore}/5`;

  if (summary.topWeaknesses.length > 0) {
    result += '\nПовторяющиеся слабости:';
    for (const w of summary.topWeaknesses) {
      result += `\n- ${w.pattern} (${w.count} раз)`;
    }
  }

  if (summary.recentLessons.length > 0) {
    result += '\nУроки:';
    for (const l of summary.recentLessons) {
      result += `\n- ${l}`;
    }
  }

  return result;
}

export function clearReviews(): void {
  inMemoryReviews = [];
}

function runChecks(
  userMessage: string,
  response: string,
  options: { toolCallCount?: number; hadError?: boolean }
): { score: number; strengths: string[]; weaknesses: string[]; lessons: string[] } {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const lessons: string[] = [];
  let score = 5;

  const lowerUser = userMessage.toLowerCase();
  const lowerResp = response.toLowerCase();

  // Check 1: Response length appropriateness
  const isShortQuestion = userMessage.length < 80;
  const isLongResponse = response.length > 500;
  if (isShortQuestion && isLongResponse) {
    weaknesses.push('Слишком длинный ответ на короткий вопрос');
    lessons.push('На короткие вопросы отвечай кратко (2-3 предложения)');
    score -= 0.5;
  }

  const isLongQuestion = userMessage.length > 300;
  const isShortResponse = response.length < 100;
  if (isLongQuestion && isShortResponse) {
    weaknesses.push('Слишком короткий ответ на сложный вопрос');
    lessons.push('На развёрнутые вопросы давай развёрнутые ответы с примерами');
    score -= 0.5;
  }

  // Check 2: Tool usage
  if (options.toolCallCount !== undefined) {
    if (options.toolCallCount === 0) {
      const needsWeb = NEEDS_WEB_RE.test(lowerUser);
      if (needsWeb) {
        weaknesses.push('Не использован web_search для актуальной информации');
        lessons.push('Для вопросов о погоде, новостях, курсах валют — ОБЯЗАТЕЛЬНО вызывай web_search');
        score -= 1;
      }
    } else {
      strengths.push(`Использовано ${options.toolCallCount} инструментов`);
    }
  }

  // Check 3: Error handling
  if (options.hadError) {
    weaknesses.push('Произошла ошибка при выполнении');
    lessons.push('При ошибке — сообщи пользователю понятным языком и предложи альтернативу');
    score -= 1;
  }

  // Check 4: Tone check
  const hasGreeting = GREETING_RE.test(lowerResp);
  const userGreeted = USER_GREETED_RE.test(lowerUser);
  if (userGreeted && !hasGreeting) {
    weaknesses.push('Не поприветствовала пользователя в ответ');
    score -= 0.5;
  }

  // Check 5: Think block presence
  if (!response.includes('<think>') && response.length > 200) {
    weaknesses.push('Нет блока рассуждений <think> в развёрнутом ответе');
    lessons.push('Перед ответом всегда рассуждай в <think>...</think>');
    score -= 0.5;
  } else if (response.includes('<think>')) {
    strengths.push('Использует цепочку рассуждений');
  }

  // Check 6: Clarity
  const lines = response.split('\n').filter((l) => l.trim()).length;
  if (lines > 15 && response.length > 1000) {
    strengths.push('Хорошая структура ответа');
  }

  // Check 7: Direct answer
  const questionMarks = (userMessage.match(/\?/g) || []).length;
  const answerPrefixes = ANSWER_PREFIX_RE.test(lowerResp.slice(0, 100));
  if (questionMarks > 0 && !answerPrefixes && response.length > 200) {
    weaknesses.push('Нет прямого ответа на вопрос');
    lessons.push('Отвечай на вопрос прямо в первом предложении');
    score -= 0.5;
  }

  // Normalize score
  score = Math.max(1, Math.min(5, score));

  return { score, strengths, weaknesses, lessons };
}

// Periodic deep review — analyze patterns across all saved self-reviews
export async function runDeepReview(): Promise<ReviewSummary | null> {
  try {
    const allFacts = listFacts();
    const facts = allFacts.filter(f => f.category === 'self_review').slice(0, 50);
    if (facts.length === 0) return null;

    const weaknessCount = new Map<string, number>();
    const lessons: string[] = [];
    let totalScore = 0;

    for (const fact of facts) {
      try {
        const data = JSON.parse(fact.content);
        totalScore += data.score ?? 3;

        if (Array.isArray(data.weaknesses)) {
          for (const w of data.weaknesses) {
            weaknessCount.set(w, (weaknessCount.get(w) ?? 0) + 1);
          }
        }

        if (Array.isArray(data.lessons)) {
          for (const l of data.lessons) {
            if (!lessons.includes(l)) lessons.push(l);
          }
        }
      } catch { }
    }

    const topWeaknesses = [...weaknessCount.entries()]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalReviews: facts.length,
      averageScore: Math.round((totalScore / facts.length) * 10) / 10,
      topWeaknesses,
      recentLessons: lessons.slice(0, 5),
    };
  } catch {
    return null;
  }
}
