/**
 * App Resolver — резолв «человеческого» имени приложения в запускаемый путь.
 *
 * Зачем: `start "" "Discord"` в cmd ищет только в PATH и App Paths, а per-user
 * приложения (Discord, Telegram, VS Code, Chrome) там не зарегистрированы —
 * «открой Discord» падало с «Command failed».
 *
 * Порядок резолва (Windows):
 *   1) PATH через `where` (notepad, cmd, explorer, wt, taskmgr...)
 *   2) Start Menu *.lnk (per-user установки: Discord, Telegram, Chrome, VS Code)
 *   3) Реестр Uninstall → InstallLocation → первый *.exe (остальной софт)
 *
 * Результат кэшируется в памяти (запросы недёшевы).
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

/** Кэш: имя → путь (null = не нашли, тоже кэшируем чтобы не долбить реестр). */
const appPathCache = new Map<string, string | null>();

/** Поиск *.lnk в Start Menu. Скоринг: точное имя > префикс > подстрока, потом короче. */
function findShortcut(rootDir: string, name: string): string | null {
  interface Match {
    score: number;
    file: string;
  }
  const candidates: Match[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // нет прав / нет каталога
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.toLowerCase().endsWith('.lnk')) {
        const base = entry.name.toLowerCase().slice(0, -4);
        let score = 0;
        if (base === name) score = 3;
        else if (base.startsWith(name)) score = 2;
        else if (base.includes(name)) score = 1;
        if (score > 0) candidates.push({ score, file: full });
      }
    }
  };

  walk(path.join(rootDir, 'Programs'), 0);
  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) =>
    b.score > a.score || (b.score === a.score && b.file.length < a.file.length) ? b : a
  );
  return best.file;
}

export async function resolveAppPath(appName: string): Promise<string | null> {
  // Санитизация: имя может прийти от LLM — не даём ему стать частью команды.
  const key = appName.toLowerCase().trim().replace(/[&|<>^"'\r\n]/g, '');
  if (!key) return null;
  if (appPathCache.has(key)) return appPathCache.get(key) ?? null;

  let resolved: string | null = null;

  // 1) PATH
  try {
    const { stdout } = await execAsync(`where ${key}`, { timeout: 3000 });
    const first = stdout.trim().split(/\r?\n/)[0];
    if (first) resolved = first.trim();
  } catch {
    /* не в PATH */
  }

  // 2) Start Menu (APPDATA = per-user, ProgramData = all-users)
  if (!resolved) {
    const roots = [
      process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu') : '',
      process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu') : '',
    ].filter(Boolean);
    for (const root of roots) {
      const lnk = findShortcut(root, key);
      if (lnk) {
        resolved = lnk;
        break;
      }
    }
  }

  // 3) Реестр (DisplayName → InstallLocation → *.exe) — одиночный вызов PowerShell
  if (!resolved) {
    try {
      const safe = key.replace(/'/g, "''");
      const ps =
        "$roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'," +
        "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'," +
        "'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall');" +
        "foreach($r in $roots){Get-ItemProperty -Path ($r+'\\*') -ErrorAction SilentlyContinue|" +
        "Where-Object{$_.DisplayName -and $_.DisplayName.ToLower().Contains('" + safe + "')}|" +
        'ForEach-Object{$_.InstallLocation}}';
      const { stdout } = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${ps}"`,
        { timeout: 10000 }
      );
      const loc = stdout
        .trim()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.length > 3);
      if (loc) {
        try {
          const exes = fs.readdirSync(loc).filter((f) => f.toLowerCase().endsWith('.exe'));
          const exact = exes.find((f) => f.toLowerCase().startsWith(key));
          if (exact) resolved = path.join(loc, exact);
        } catch {
          /* каталог недоступен */
        }
      }
    } catch {
      /* реестр недоступен */
    }
  }

  appPathCache.set(key, resolved);
  return resolved;
}
