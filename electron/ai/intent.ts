export type Intent =
  | 'weather'
  | 'news'
  | 'web_search'
  | 'file_read'
  | 'file_write'
  | 'file_find'
  | 'code'
  | 'system'
  | 'screen'
  | 'gui'
  | 'memory'
  | 'greeting'
  | 'unknown';

const INTENT_PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: 'weather',
    patterns: [
      /погод|погод[ауе]|weather|температур|градус|дожд|снег|ветер|влажност/i,
      /^какая погода|^что с погодой|^сколько градусов/i,
    ],
  },
  {
    intent: 'news',
    patterns: [
      /новост|новин|последн|свеж[ие]|что новог|что случилос/i,
      /курс (валют|доллар|евро|рубл)/i,
      /актуальн|последние новости/i,
    ],
  },
  {
    intent: 'web_search',
    patterns: [
      /найди|поищи|найти информац|поиск|найди в интернет|проверь|узнай/i,
      /search|google|look up|find.*online/i,
      /кто такой|что такое|как работает/i,
    ],
  },
  {
    intent: 'file_read',
    patterns: [
      /прочитай|открой файл|покажи файл|read.*file|open.*file|cat\s/i,
      /открой (файл|документ)/i,
    ],
  },
  {
    intent: 'file_write',
    patterns: [
      /запиши|сохрани|создай файл|напиши в файл|write.*file|save.*file/i,
      /создай (файл|документ|скрипт)/i,
    ],
  },
  {
    intent: 'file_find',
    patterns: [
      /найди файл|где (лежит|находит)|find.*file|grep|поищи.*файл/i,
    ],
  },
  {
    intent: 'code',
    patterns: [
      /напиши код|напиши скрипт|запусти код|code|run.*script|compile|debug|отлад/i,
      /напиши (программ|функци|класс|модуль)/i,
      /исправь (баг|ошибк|код)/i,
    ],
  },
  {
    intent: 'system',
    patterns: [
      /систем|system|процесс|задач|памят|cpu|диск|компьютер/i,
      /сколько (оперативн|памят)/i,
      /выполни коман|выполни (в )?терминал/i,
    ],
  },
  {
    intent: 'screen',
    patterns: [
      /скриншот|screenshot|экран|screen|что на экран|покажи экран/i,
      /проанализируй экран|analyze.*screen/i,
    ],
  },
  {
    intent: 'gui',
    patterns: [
      /откр(ой|ыва) (приложени|браузер|программ)/i,
      /нажми|кликни|напечатай|напиши текст|откр(ой|ыва) (папк|диск)/i,
      /open.*app|launch|click|type|наведи/i,
    ],
  },
  {
    intent: 'memory',
    patterns: [
      /запомни|запиши (что я |что мы )|не забудь|remember|save.*fact/i,
      /что ты знаешь обо мне|вспомни|как меня зову/i,
    ],
  },
  {
    intent: 'greeting',
    patterns: [
      /^(привет|здравствуй|хай|hello|hi|дарова|здаров)/i,
      /^(доброе утро|добрый день|добрый вечер)/i,
      /^как дела|^чё как|^how are you/i,
      /^(пока|до свидания|goodbye|bye)/i,
    ],
  },
];

export function detectIntent(text: string): Intent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return intent;
      }
    }
  }
  return 'unknown';
}

const TOOL_BY_INTENT: Record<Intent, string[]> = {
  weather: ['web_search'],
  news: ['web_search', 'web_fetch'],
  web_search: ['web_search', 'web_fetch', 'web_download'],
  file_read: ['list_files', 'read_file', 'grep'],
  file_write: ['write_file', 'edit_file'],
  file_find: ['find_files', 'grep', 'list_files'],
  code: ['list_files', 'read_file', 'write_file', 'grep', 'edit_file', 'apply_patch', 'run_code', 'execute_command', 'system_info'],
  system: ['system_info', 'execute_command', 'list_files'],
  screen: ['take_screenshot', 'analyze_screen', 'list_windows'],
  gui: ['open_app', 'type_text', 'click', 'key_press', 'list_windows'],
  memory: ['memory_save', 'memory_recall', 'create_reminder'],
  greeting: [],
  unknown: ['web_search', 'web_fetch', 'web_download', 'list_files', 'read_file', 'write_file', 'find_files', 'execute_command', 'system_info', 'take_screenshot', 'analyze_screen', 'memory_save', 'memory_recall', 'create_reminder', 'edit_file', 'grep', 'apply_patch', 'run_code', 'open_app', 'type_text', 'click', 'key_press', 'list_windows', 'ask_clarification', 'request_confirmation'],
};

export function filterToolsByIntent(
  tools: Array<{ type: 'function'; function: Record<string, unknown> }>,
  intent: Intent
): Array<{ type: 'function'; function: Record<string, unknown> }> {
  const allowed = TOOL_BY_INTENT[intent];
  if (!allowed || allowed.length === 0) return [];
  return tools.filter((t) => allowed.includes(t.function.name as string));
}
