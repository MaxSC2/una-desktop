import { Intent } from './intent';

export type ExecutionMode =
  | 'code'
  | 'research'
  | 'creative'
  | 'chat'
  | 'system'
  | 'default';

export interface ModeConfig {
  name: ExecutionMode;
  label: string;
  description: string;
  allowedTools: string[];
  instructions: string;
  contextBudget: 'normal' | 'reduced' | 'extended';
}

const MODE_REGISTRY: Record<ExecutionMode, ModeConfig> = {
  code: {
    name: 'code',
    label: 'Разработка',
    description: 'Работа с кодом, файлами, git, терминалом',
    allowedTools: [
      'list_files', 'read_file', 'write_file', 'grep', 'edit_file',
      'apply_patch', 'run_code', 'execute_command', 'system_info',
      'find_files', 'memory_save', 'memory_recall', 'ask_clarification',
    ],
    instructions: `Ты в режиме разработчика. Отвечай технически точно.
Показывай код, объясняй синтаксис. Предлагай несколько вариантов решения.
Перед изменением файлов читай их содержимое. Используй git статус для контекста.`,
    contextBudget: 'extended',
  },
  research: {
    name: 'research',
    label: 'Исследование',
    description: 'Поиск информации, анализ, работа с источниками',
    allowedTools: [
      'web_search', 'web_fetch', 'web_download',
      'memory_save', 'memory_recall', 'ask_clarification',
    ],
    instructions: `Ты в режиме исследования. Ищи информацию в нескольких источниках.
Проверяй факты. Цитируй источники. Если информация противоречива — укажи это.
Сохраняй важные находки в память через memory_save.`,
    contextBudget: 'extended',
  },
  creative: {
    name: 'creative',
    label: 'Творчество',
    description: 'Идеи, тексты, brainstorming, свободное общение',
    allowedTools: ['ask_clarification', 'memory_save', 'memory_recall'],
    instructions: `Ты в творческом режиме. Будь свободной, образной, вдохновляющей.
Не бойся предлагать необычные идеи. Меньше анализа, больше воображения.
Если нужно найти информацию — просто спроси пользователя.`,
    contextBudget: 'reduced',
  },
  chat: {
    name: 'chat',
    label: 'Беседа',
    description: 'Обычный разговор, приветствия, общение',
    allowedTools: [],
    instructions: `Свободная беседа. Будь тёплой и естественной. Меньше формальностей.
Не используй инструменты — просто общайся. Можешь шутить и быть неформальной.`,
    contextBudget: 'reduced',
  },
  system: {
    name: 'system',
    label: 'Система',
    description: 'Управление ПК, скриншоты, команды',
    allowedTools: [
      'system_info', 'execute_command', 'take_screenshot',
      'analyze_screen', 'list_files', 'list_windows',
      'open_app', 'ask_clarification', 'request_confirmation',
    ],
    instructions: `Ты в системном режиме. Выполняй команды точно и безопасно.
Перед опасными операциями запрашивай подтверждение.
Отвечай кратко — только результат и если нужно, пояснение.`,
    contextBudget: 'normal',
  },
  default: {
    name: 'default',
    label: 'Универсальный',
    description: 'Общий режим — доступны все инструменты',
    allowedTools: [
      'web_search', 'web_fetch', 'web_download',
      'list_files', 'read_file', 'write_file', 'grep', 'edit_file',
      'apply_patch', 'run_code', 'execute_command', 'system_info',
      'find_files', 'take_screenshot', 'analyze_screen',
      'open_app', 'type_text', 'click', 'key_press', 'list_windows',
      'memory_save', 'memory_recall', 'create_reminder',
      'ask_clarification', 'request_confirmation',
    ],
    instructions: '',
    contextBudget: 'normal',
  },
};

const INTENT_TO_MODE: Record<Intent, ExecutionMode> = {
  weather: 'research',
  news: 'research',
  web_search: 'research',
  file_read: 'code',
  file_write: 'code',
  file_find: 'code',
  code: 'code',
  system: 'system',
  screen: 'system',
  gui: 'system',
  memory: 'default',
  greeting: 'chat',
  unknown: 'default',
};

let currentMode: ExecutionMode = 'default';

export function resolveMode(intent: Intent): ExecutionMode {
  const mode = INTENT_TO_MODE[intent] ?? 'default';
  currentMode = mode;
  return mode;
}

export function getModeConfig(mode?: ExecutionMode): ModeConfig {
  return MODE_REGISTRY[mode ?? currentMode] ?? MODE_REGISTRY.default;
}

export function getCurrentMode(): ExecutionMode {
  return currentMode;
}

export function setMode(mode: ExecutionMode): void {
  currentMode = mode;
}

export function filterToolsByMode(
  tools: Array<{ type: 'function'; function: Record<string, unknown> }>,
  mode?: ExecutionMode
): Array<{ type: 'function'; function: Record<string, unknown> }> {
  const cfg = getModeConfig(mode);
  if (cfg.allowedTools.length === 0) return [];
  return tools.filter(t => cfg.allowedTools.includes(t.function.name as string));
}

export function getModeInstructions(mode?: ExecutionMode): string {
  const cfg = getModeConfig(mode);
  if (!cfg.instructions) return '';
  return `\n\n# Режим работы: ${cfg.label}\n${cfg.instructions}`;
}

export function listModes(): Array<{ name: ExecutionMode; label: string; description: string }> {
  return Object.values(MODE_REGISTRY).map(({ name, label, description }) => ({
    name, label, description,
  }));
}
