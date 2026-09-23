import { saveFact, listFacts, getFactsByCategory } from '../memory/store';
import { getReviewSummary } from './self-review';

export interface MetaInsight {
  pattern: string;
  confidence: number;
  instruction: string;
  source: 'self_review' | 'correction' | 'preference';
  detectedAt: string;
}

export interface LearnedPreference {
  key: string;
  value: string | number | boolean;
  confidence: number;
  observations: number;
  lastUpdated: string;
}

// Границы слова с поддержкой кириллицы (Q-META): в JS \w = [A-Za-z0-9_],
// поэтому \b не работает рядом с А-Я. Lookaround-границы едины для EN/RU.
const WB_START = '(?:(?<![A-Za-zА-Яа-яЁё0-9_]))';
const WB_END = '(?:(?![A-Za-zА-Яа-яЁё0-9_]))';
const wbr = (body: string) => new RegExp(`${WB_START}${body}${WB_END}`, 'i');
// Стем-литералы (ошибк-, подробн-, кратк-...) — только начальная граница:
// конечная граница ломает словоформы ('ошибка', 'подробнее').
const wbs = (body: string) => new RegExp(`${WB_START}${body}`, 'i');

const CORRECTION_PATTERNS = [
  wbr('нет'), wbr('не то'), wbr('не так'), wbr('исправь'),
  wbr('другое'), wbr('иначе'), wbr('не это'), wbs('неправ'),
  wbs('ошибк'), wbs('неверн'), wbs('не нуж'), wbr('не про то'),
  new RegExp(`${WB_START}я имел${WB_END}.*${WB_START}виду${WB_END}`, 'i'),
  new RegExp(`${WB_START}я хоте.*${WB_START}друго`, 'i'),
  wbr('stop'), wbr('wrong'), wbr('no'), wbr('not what'),
  new RegExp(`${WB_START}actually${WB_END}.*${WB_START}mean${WB_END}`, 'i'),
];

const SHORT_ANSWER_PATTERNS = [
  wbr('короче'), wbs('кратк'), wbs('не расписыв'), wbr('суть'),
  wbr('коротко'), wbs('лаконичн'), wbr('без воды'),
  wbr('short'), wbr('brief'), wbr('concise'), wbr('tldr'),
];

const LONG_ANSWER_PATTERNS = [
  wbs('подробн'), wbs('развернут'), wbs('детальн'), wbs('объясн'),
  wbs('распиш'), wbr('по полкам'), wbr('разжуй'),
  wbr('detail'), wbr('detailed'), wbr('elaborate'), wbr('in depth'),
];

const LESS_TOOL_PATTERNS = [
  new RegExp(`${WB_START}не надо${WB_END}.*${WB_START}искать${WB_END}`, 'i'),
  wbr('не ищи'), wbr('без поиска'),
  wbr('просто ответь'),
  new RegExp(`${WB_START}не нужно${WB_END}.*${WB_START}инструмент`, 'i'),
  wbr('just answer'), wbr("don't search"), wbr('no tools'),
];

let preferences: LearnedPreference[] = [];
let inMemoryInsights: MetaInsight[] = [];
let correctionCount = 0;
let totalInteractions = 0;

export function recordInteraction(isCorrection: boolean): void {
  totalInteractions++;
  if (isCorrection) correctionCount++;
}

export function detectCorrection(userMessage: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(userMessage));
}

export function learnFromMessage(userMessage: string): void {
  // Detect preference for short answers
  if (SHORT_ANSWER_PATTERNS.some(p => p.test(userMessage))) {
    upsertPreference('answer_style', 'short', 0.6);
  }

  // Detect preference for long answers
  if (LONG_ANSWER_PATTERNS.some(p => p.test(userMessage))) {
    upsertPreference('answer_style', 'detailed', 0.6);
  }

  // Detect preference for less tool usage
  if (LESS_TOOL_PATTERNS.some(p => p.test(userMessage))) {
    upsertPreference('tool_usage', 'minimal', 0.5);
  }
}

export function getMetaInstructions(): string {
  const insights = generateInsights();
  const parts: string[] = [];

  if (insights.length === 0) return '';

  for (const insight of insights) {
    if (insight.confidence >= 0.3) {
      parts.push(`- ${insight.instruction}`);
    }
  }

  if (parts.length === 0) return '';

  return `\n\n# Мета-обучение (выученные паттерны)\n${parts.join('\n')}`;
}

export function getInsights(): MetaInsight[] {
  return generateInsights();
}

function generateInsights(): MetaInsight[] {
  const insights: MetaInsight[] = [];

  // 1. From preferences
  for (const pref of preferences) {
    if (pref.key === 'answer_style' && pref.value === 'short' && pref.confidence >= 0.4) {
      insights.push({
        pattern: 'Пользователь предпочитает краткие ответы',
        confidence: pref.confidence,
        instruction: 'Пользователь предпочитает краткие ответы. Отвечай 2-3 предложения.',
        source: 'preference',
        detectedAt: pref.lastUpdated,
      });
    }
    if (pref.key === 'answer_style' && pref.value === 'detailed' && pref.confidence >= 0.4) {
      insights.push({
        pattern: 'Пользователь предпочитает развёрнутые ответы',
        confidence: pref.confidence,
        instruction: 'Пользователь предпочитает развёрнутые ответы. Объясняй подробно, давай контекст.',
        source: 'preference',
        detectedAt: pref.lastUpdated,
      });
    }
    if (pref.key === 'tool_usage' && pref.value === 'minimal' && pref.confidence >= 0.3) {
      insights.push({
        pattern: 'Пользователь предпочитает минимум инструментов',
        confidence: pref.confidence,
        instruction: 'Используй инструменты только по явной просьбе. Отвечай из знаний.',
        source: 'preference',
        detectedAt: pref.lastUpdated,
      });
    }
  }

  // 2. From self-review
  try {
    const summary = getReviewSummary();
    if (summary.totalReviews >= 3) {
      if (summary.averageScore < 3) {
        insights.push({
          pattern: 'Низкая средняя оценка ответов',
          confidence: 0.7,
          instruction: 'Качество ответов ниже ожидаемого. Уделяй больше внимания рассуждению перед ответом.',
          source: 'self_review',
          detectedAt: new Date().toISOString(),
        });
      }

      for (const w of summary.topWeaknesses) {
        if (w.count >= 3) {
          insights.push({
            pattern: `Повторяющаяся слабость: ${w.pattern}`,
            confidence: Math.min(0.5 + w.count * 0.1, 0.9),
            instruction: `Обрати внимание: ${w.pattern}. Старайся избегать этой ошибки.`,
            source: 'self_review',
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch { }

  // 3. From correction rate
  if (totalInteractions >= 10) {
    const correctionRate = correctionCount / totalInteractions;
    if (correctionRate > 0.3) {
      insights.push({
        pattern: 'Высокая частота исправлений',
        confidence: Math.min(correctionRate, 0.9),
        instruction: 'Пользователь часто тебя исправляет. Перед ответом тщательнее анализируй запрос. Используй ask_clarification при неоднозначности.',
        source: 'correction',
        detectedAt: new Date().toISOString(),
      });
    }
  }

  inMemoryInsights = insights;
  return insights;
}

function upsertPreference(key: string, value: string | number | boolean, confidenceBoost: number): void {
  const existing = preferences.find(p => p.key === key);
  if (existing) {
    existing.observations++;
    existing.value = value;
    existing.confidence = Math.min(existing.confidence + confidenceBoost, 1.0);
    existing.lastUpdated = new Date().toISOString();
  } else {
    preferences.push({
      key,
      value,
      confidence: confidenceBoost,
      observations: 1,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Persist preference as fact
  try {
    saveFact('preference', JSON.stringify({ key, value, confidence: confidenceBoost }));
  } catch { }
}

export function loadPreferences(): void {
  try {
    const facts = getFactsByCategory('preference');
    for (const fact of facts) {
      try {
        const data = JSON.parse(fact.content);
        if (data.key && data.value !== undefined) {
          const existing = preferences.find(p => p.key === data.key);
          if (!existing) {
            preferences.push({
              key: data.key,
              value: data.value,
              confidence: data.confidence ?? 0.3,
              observations: 1,
              lastUpdated: fact.created_at ?? new Date().toISOString(),
            });
          }
        }
      } catch { }
    }
  } catch { }
}

export function resetLearning(): void {
  preferences = [];
  inMemoryInsights = [];
  correctionCount = 0;
  totalInteractions = 0;
}
