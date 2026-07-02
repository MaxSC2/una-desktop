/**
 * Система безопасности U.N.A.
 *
 * Классифицирует команды по уровню риска:
 * - safe: обычные команды (ls, cat, pwd, ps)
 * - caution: требуют предупреждения (curl, wget, git push)
 * - dangerous: требуют подтверждения (rm, sudo, apt install)
 * - forbidden: блокируются всегда (rm -rf /, mkfs, dd /dev/)
 *
 * Также проверяет защищённые файлы (ключи, .env, пароли) — их нельзя читать.
 */

export type RiskLevel = 'safe' | 'caution' | 'dangerous' | 'forbidden';

export interface SafetyCheck {
  level: RiskLevel;
  reason: string;
  suggestion?: string;
}

// Паттерны, которые блокируются ВСЕГДА — необратимые разрушительные операции
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf\s+\/(\s|$|\*)/i, reason: 'rm -rf / — удаление корневой файловой системы' },
  { pattern: /rm\s+-rf\s+\*/i, reason: 'rm -rf * — удаление всех файлов в текущей директории' },
  { pattern: /mkfs/i, reason: 'Форматирование файловой системы (mkfs)' },
  { pattern: /dd\s+if=.*of=\/dev\//i, reason: 'Прямая запись в блочное устройство (dd)' },
  { pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/i, reason: 'Fork bomb' },
  { pattern: /\bshutdown\b/i, reason: 'Выключение системы' },
  { pattern: /\breboot\b/i, reason: 'Перезагрузка системы' },
  { pattern: /\bhalt\b/i, reason: 'Остановка системы' },
  { pattern: /\bpoweroff\b/i, reason: 'Выключение питания' },
  { pattern: />\s*\/dev\/sd[a-z]/i, reason: 'Запись напрямую в жёсткий диск' },
  { pattern: /chmod\s+-R\s+777\s+\//i, reason: 'chmod 777 на корневую директорию' },
  { pattern: /\binit\s+0\b/i, reason: 'Выключение через init' },
];

// Опасные команды — требуют подтверждения пользователя
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-rf?|-fr?)\b/i, reason: 'Рекурсивное удаление файлов' },
  { pattern: /\brmdir\b/i, reason: 'Удаление директории' },
  { pattern: /\bdel\s+/i, reason: 'Удаление файлов (Windows)' },
  { pattern: /\bsudo\b/i, reason: 'Команда с правами суперпользователя' },
  { pattern: /\bapt\s+(-y\s+|--yes\s+)?(install|remove|purge|autoremove)\b/i, reason: 'Установка/удаление пакетов apt' },
  { pattern: /\byum\s+(install|remove)/i, reason: 'Установка/удаление пакетов yum' },
  { pattern: /\bpip\s+install\b/i, reason: 'Установка Python-пакетов' },
  { pattern: /\bpip3\s+install\b/i, reason: 'Установка Python-пакетов' },
  { pattern: /\bnpm\s+install\s+-g\b/i, reason: 'Глобальная установка npm-пакетов' },
  { pattern: /\biptables\b/i, reason: 'Изменение правил фаервола' },
  { pattern: /\bnetsh\b/i, reason: 'Изменение сетевых настроек Windows' },
  { pattern: /\bkill(\s+-9)?\s+/i, reason: 'Принудительное завершение процесса' },
  { pattern: /\bkillall\b/i, reason: 'Завершение всех процессов по имени' },
  { pattern: /\btaskkill\b/i, reason: 'Завершение процесса (Windows)' },
  { pattern: /\bfdisk\b/i, reason: 'Работа с разделами диска' },
  { pattern: /\bdiskpart\b/i, reason: 'Работа с разделами диска (Windows)' },
  { pattern: /\bformat\s+[a-z]:/i, reason: 'Форматирование диска (Windows)' },
  { pattern: /\breg\s+(delete|add)\b/i, reason: 'Изменение реестра Windows' },
  { pattern: /\bsystemctl\s+(stop|disable|restart)\b/i, reason: 'Управление системными сервисами' },
  { pattern: /\bservice\s+\w+\s+(stop|restart)/i, reason: 'Управление сервисами' },
  { pattern: /\bcrontab\s+-r\b/i, reason: 'Удаление cron-задач' },
  { pattern: /\bmv\s+\S+\s+\/(tmp|dev)/i, reason: 'Перемещение файлов в системную папку' },
  { pattern: /\/etc\//i, reason: 'Доступ к системной папке /etc' },
  { pattern: /C:\\\\Windows/i, reason: 'Доступ к системной папке Windows' },
  { pattern: /\/usr\//i, reason: 'Доступ к системной папке /usr' },
  { pattern: /\/bin\//i, reason: 'Доступ к системной папке /bin' },
  { pattern: /\\System32/i, reason: 'Доступ к System32' },
  { pattern: /\btruncate\s+-s\s*0\b/i, reason: 'Очистка файла' },
];

// Команды повышенного внимания — предупреждаем, но выполняем
const CAUTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bcp\s+-r\b/i, reason: 'Рекурсивное копирование' },
  { pattern: /\bwget\b/i, reason: 'Загрузка файла из интернета' },
  { pattern: /\bcurl\b/i, reason: 'HTTP-запрос' },
  { pattern: /\bgit\s+(push|reset\s+--hard|clean)/i, reason: 'Потенциально необратимая git-операция' },
  { pattern: /\btar\s+.*--remove-files/i, reason: 'Архивация с удалением исходников' },
  { pattern: /\bchmod\s+-R\b/i, reason: 'Рекурсивное изменение прав' },
  { pattern: /\bchown\s+-R\b/i, reason: 'Рекурсивная смена владельца' },
];

// Защищённые файлы — их содержимое никогда не показываем
const PROTECTED_FILE_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,
  /id_rsa/i,
  /id_ecdsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\/shadow$/i,
  /\/passwd$/i,
  /credentials/i,
  /\.kube\/config/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.git-credentials$/i,
  /\.aws\/credentials/i,
  /seed/i,
  /mnemonic/i,
];

/**
 * Классифицирует команду по уровню риска.
 */
export function classifyCommand(command: string): SafetyCheck {
  const trimmed = command.trim();

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        level: 'forbidden',
        reason,
        suggestion: 'Эта команда заблокирована. Предложите пользователю безопасную альтернативу.',
      };
    }
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        level: 'dangerous',
        reason,
        suggestion: 'Запросите подтверждение у пользователя через request_confirmation.',
      };
    }
  }

  for (const { pattern, reason } of CAUTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        level: 'caution',
        reason,
        suggestion: 'Проинформируйте пользователя и продолжайте с осторожностью.',
      };
    }
  }

  return { level: 'safe', reason: 'Команда выглядит безопасно' };
}

/**
 * Проверяет, является ли файл защищённым (содержит секреты).
 */
export function isProtectedFile(filePath: string): boolean {
  return PROTECTED_FILE_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Проверяет, находится ли путь внутри домашней папки пользователя.
 */
export function isPathInsideHome(filePath: string, home: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const normalizedHome = home.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith(normalizedHome);
}
