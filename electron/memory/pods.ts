import { listPods } from './store';

interface DefaultPodDef {
  name: string;
  description: string;
  keywords: string[];
}

export const DEFAULT_PODS: DefaultPodDef[] = [
  {
    name: 'profile',
    description: 'Личные данные пользователя: имя, возраст, профессия, контакты, биография',
    keywords: [
      'зовут', 'имя', 'фамилия', 'возраст', 'лет', 'родился', 'живу', 'живёт',
      'работаю', 'учусь', 'профессия', 'должность', 'навык', 'образование',
      'контакт', 'телефон', 'email', 'почта', 'город', 'адрес', 'страна',
      'день рождения', 'семья', 'дети', 'супруг', 'хобби', 'увлечени',
    ],
  },
  {
    name: 'project',
    description: 'Информация о проектах: репозитории, технологии, задачи, сроки',
    keywords: [
      'проект', 'репозиторий', 'репа', 'git', 'ветка', 'branch', 'коммит',
      'пулреквест', 'pr', 'issue', 'таск', 'story', 'epic', 'дедлайн',
      'спринт', 'релиз', 'фича', 'баг', 'фикс', 'документация', 'api',
      'фреймворк', 'библиотек', 'стек', 'технологи', 'зависимост',
    ],
  },
  {
    name: 'preference',
    description: 'Предпочтения пользователя: стиль общения, любимые технологии, привычки',
    keywords: [
      'люблю', 'нравится', 'обожаю', 'предпочитаю', 'best', 'favorite',
      'prefer', 'like', 'любимый',
      'не люблю', 'терпеть не могу', 'бесит', 'раздражает', 'ненавижу',
      'вкус', 'цвет', 'музык', 'фильм', 'книг', 'сериал', 'жанр',
      'привычк', 'ритуал', 'традици',
    ],
  },
  {
    name: 'emotion',
    description: 'Эмоциональный контекст: настроение, триггеры, эмоциональные реакции',
    keywords: [
      'настроение', 'mood', 'чувствую', 'груст', 'рад', 'счастлив',
      'зл', 'сердит', 'тревож', 'спокоен', 'устал', 'устала',
      'энерги', 'взволнован', 'напуган', 'обижен', 'разочарован',
      'вдохновлён', 'мотиваци', 'стресс', 'тревог', 'депрессив',
    ],
  },
  {
    name: 'work',
    description: 'Рабочий контекст: текущие задачи, код, файлы, команды, дедлайны',
    keywords: [
      'код', 'файл', 'папк', 'директори', 'команда', 'терминал',
      'npm', 'yarn', 'pip', 'npx', 'docker', 'build', 'deploy',
      'функция', 'класс', 'метод', 'интерфейс', 'тип', 'переменная',
      'баг', 'дебаг', 'отладка', 'ошибк', 'error', 'exception',
      'рефакторинг', 'оптимизаци', 'тест', 'unit', 'integration',
      'todo', 'fixme', 'hack', 'дедлайн', 'таск',
    ],
  },
  {
    name: 'general',
    description: 'Общие факты, не подходящие под другие категории',
    keywords: [],
  },
];

const POD_KEYWORDS_MAP: Record<string, string[]> = {};
for (const pod of DEFAULT_PODS) {
  POD_KEYWORDS_MAP[pod.name] = pod.keywords;
}

function wordBoundaryRegex(kw: string): RegExp {
  // Build a regex that matches the keyword as a whole word
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s|[,.;:!?])${escaped}($|\\s|[,.;:!?])`, 'i');
}

export function classifyToPod(text: string): string {
  let bestScore = 0;
  let bestPod = 'general';

  for (const pod of DEFAULT_PODS) {
    if (pod.keywords.length === 0) continue;
    let score = 0;
    for (const kw of pod.keywords) {
      if (wordBoundaryRegex(kw).test(text)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPod = pod.name;
    }
  }

  return bestPod;
}

export function findRelevantPods(query: string): ReturnType<typeof listPods> {
  const lower = query.toLowerCase();
  const allPods = listPods();

  const scored = allPods.map((pod) => {
    const keywords = POD_KEYWORDS_MAP[pod.name] ?? [];
    let score = 0;
    for (const kw of keywords) {
      if (wordBoundaryRegex(kw).test(lower)) {
        score += 1;
      }
    }
    score += Math.log2((pod.use_count ?? 0) + 1) * 0.5;
    return { pod, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score > 0 || s.pod.name === 'general')
    .map((s) => s.pod);
}
