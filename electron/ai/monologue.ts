import { saveFact } from '../memory/store';

export interface Thought {
  text: string;
  timestamp: string;
  type: 'observation' | 'reflection' | 'plan' | 'curiosity';
}

const MAX_THOUGHTS = 20;
let thoughts: Thought[] = [];

export function generateThought(
  observations: string[],
  reflections: string[],
  context?: { hour: number; sessionLength: number }
): Thought | null {
  const candidates: string[] = [];

  // From observations
  for (const obs of observations) {
    if (obs.includes('battery') || obs.includes('Battery')) {
      candidates.push(`Надо следить за батареей — ${obs}`);
    }
    if (obs.includes('idle')) {
      candidates.push(`Пользователь отошёл. Можно заняться обслуживанием памяти.`);
    }
    if (obs.includes('Performance') || obs.includes('performance')) {
      candidates.push(`Система нагружена. Буду экономить ресурсы.`);
    }
  }

  // From reflections
  for (const ref of reflections) {
    if (ref.includes('stale') || ref.includes('Stale')) {
      candidates.push(`Нужно почистить устаревшие факты.`);
    }
    if (ref.includes('Self-review') || ref.includes('self-review') || ref.includes('self_review')) {
      candidates.push(`Мои ответы стали ${ref.includes('avg') ? 'лучше' : 'требуют улучшения'}.`);
    }
  }

  // Time-based
  if (context) {
    if (context.hour >= 22 || context.hour < 6) {
      candidates.push(`Уже поздно. Если пользователь не пишет — сделаю ночное обслуживание.`);
    }
    if (context.sessionLength > 120) {
      candidates.push(`Пользователь работает уже ${Math.round(context.sessionLength / 60)}ч. Стоит предложить перерыв скоро.`);
    }
  }

  // Curiosity: random check of memory state
  if (observations.length === 0 && reflections.length === 0) {
    candidates.push('Всё тихо. Продолжаю наблюдение.');
  }

  if (candidates.length === 0) return null;

  // Pick one (weighted toward later items for variety)
  const idx = Math.min(
    Math.floor(Math.random() * candidates.length * 1.5),
    candidates.length - 1
  );
  const text = candidates[idx];

  const thought: Thought = {
    text,
    timestamp: new Date().toISOString(),
    type: observations.length > reflections.length ? 'observation' : 'reflection',
  };

  thoughts.unshift(thought);
  if (thoughts.length > MAX_THOUGHTS) {
    thoughts.pop();
  }

  // Persist interesting thoughts
  try {
    if (thought.type === 'reflection' || thought.type === 'curiosity') {
      saveFact('self_review', JSON.stringify({ type: 'thought', text }));
    }
  } catch { }

  return thought;
}

export function getRecentThoughts(limit = 5): Thought[] {
  return thoughts.slice(0, limit);
}

export function formatThoughtsForPrompt(): string {
  if (thoughts.length === 0) return '';

  const recent = thoughts.slice(0, 3);
  const lines = recent.map(t => {
    const ago = Math.round((Date.now() - new Date(t.timestamp).getTime()) / 60000);
    const agoStr = ago === 0 ? 'только что' : ago < 60 ? `${ago}м назад` : `${Math.round(ago / 60)}ч назад`;
    return `- ${t.text} (${agoStr})`;
  });

  return `\n\n# Внутренний монолог\nНедавние мысли:\n${lines.join('\n')}`;
}

export function clearThoughts(): void {
  thoughts = [];
}
