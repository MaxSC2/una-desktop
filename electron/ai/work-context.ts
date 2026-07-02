/**
 * Work Context Engine — U.N.A. знает над чем вы работаете.
 *
 * Отслеживает:
 * - Git репозитории (статус, последние коммиты, незакоммиченные файлы)
 * - Активные файлы (недавно изменённые)
 * - Запущенные процессы (IDE, браузер, терминал)
 * - Время работы сессии
 * - Повторяющиеся паттерны
 *
 * Это делает U.N.A. напарником, а не слугой: она видит контекст
 * и может предложить помощь до того, как попросили.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// ============================================================
// ТИПЫ
// ============================================================

export interface GitRepo {
  path: string;
  branch: string;
  status: 'clean' | 'dirty' | 'ahead' | 'behind';
  uncommittedCount: number;
  lastCommit: {
    hash: string;
    message: string;
    date: string;
    author: string;
  } | null;
  recentCommits: Array<{
    hash: string;
    message: string;
    date: string;
  }>;
}

export interface RecentFile {
  path: string;
  name: string;
  modified: Date;
  size: number;
}

export interface WorkSession {
  startedAt: Date;
  lastActivityAt: Date;
  totalMessages: number;
  tasksCompleted: number;
  projectsTouched: string[];
}

export interface WorkPattern {
  type: 'frequent_command' | 'frequent_file' | 'work_time' | 'break_pattern';
  description: string;
  occurrences: number;
  lastSeen: Date;
  suggestion?: string;
}

export interface WorkContext {
  gitRepos: GitRepo[];
  recentFiles: RecentFile[];
  activeProjects: string[];
  session: WorkSession;
  patterns: WorkPattern[];
  workDuration: number; // minutes since session start
  isLongSession: boolean; // 3+ hours
  suggestedBreak: boolean;
}

// ============================================================
// GIT — сканирование репозиториев
// ============================================================

/**
 * Найти все git-репозитории в папке (ограниченно).
 */
export async function findGitRepos(searchDir?: string, maxDepth: number = 3): Promise<string[]> {
  const home = searchDir || os.homedir();
  const repos: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || repos.length > 20) return;

    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) {
      repos.push(dir);
      return; // не углубляемся в репозиторий
    }

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Пропускаем тяжёлые/системные папки
        if (['node_modules', '.git', 'vendor', '__pycache__', '.cache', 'dist', 'build', '.next', '.venv'].includes(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        await walk(path.join(dir, entry.name), depth + 1);
      }
    } catch {
      // permission errors — ignore
    }
  }

  await walk(home, 0);
  return repos;
}

/**
 * Получить статус git-репозитория.
 */
export async function getGitRepoStatus(repoPath: string): Promise<GitRepo | null> {
  try {
    // Branch
    const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      timeout: 5000,
    });
    const branch = branchOut.trim();

    // Status
    const { stdout: statusOut } = await execAsync('git status --porcelain', {
      cwd: repoPath,
      timeout: 5000,
    });
    const uncommittedLines = statusOut.trim().split('\n').filter(Boolean);
    const uncommittedCount = uncommittedLines.length;

    // Last commit
    const { stdout: logOut } = await execAsync(
      'git log -5 --format="%H|%s|%ai|%an" --no-merges',
      { cwd: repoPath, timeout: 5000 }
    );
    const commits = logOut.trim().split('\n').filter(Boolean).map(line => {
      const [hash, message, date, author] = line.split('|');
      return { hash: hash.slice(0, 8), message, date, author };
    });

    // Ahead/behind
    let status: GitRepo['status'] = 'clean';
    if (uncommittedCount > 0) status = 'dirty';
    else {
      try {
        const { stdout: ahead } = await execAsync('git rev-list --count @{upstream}..HEAD 2>/dev/null || echo 0', {
          cwd: repoPath,
          timeout: 3000,
        });
        if (parseInt(ahead.trim()) > 0) status = 'ahead';
      } catch {
        // no upstream
      }
    }

    return {
      path: repoPath,
      branch,
      status,
      uncommittedCount,
      lastCommit: commits[0] || null,
      recentCommits: commits.slice(0, 5),
    };
  } catch {
    return null;
  }
}

// ============================================================
// НЕДАВНИЕ ФАЙЛЫ
// ============================================================

/**
 * Найти недавно изменённые файлы в папке.
 */
export async function getRecentFiles(searchDir?: string, maxResults: number = 15): Promise<RecentFile[]> {
  const home = searchDir || os.homedir();
  const results: RecentFile[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4 || results.length > 100) return;

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length > 100) return;

        const fullPath = path.join(dir, entry.name);

        // Пропускаем тяжёлые папки
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'vendor', '__pycache__', '.cache', 'dist', 'build', '.next', '.venv', 'AppData', 'Library', 'proc', 'sys'].includes(entry.name)) continue;
          if (entry.name.startsWith('.')) continue;
          await walk(fullPath, depth + 1);
          continue;
        }

        // Файл — проверяем дату
        try {
          const stat = await fs.promises.stat(fullPath);
          if (stat.mtime.getTime() > dayAgo) {
            results.push({
              path: fullPath,
              name: entry.name,
              modified: stat.mtime,
              size: stat.size,
            });
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // permission errors
    }
  }

  await walk(home, 0);

  // Сортируем по дате изменения (новые первыми)
  return results
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .slice(0, maxResults);
}

// ============================================================
// РАБОЧАЯ СЕССИЯ
// ============================================================

let sessionStart: Date = new Date();
let lastActivity: Date = new Date();
let messagesCount: number = 0;
let tasksCompleted: number = 0;

export function updateActivity(): void {
  lastActivity = new Date();
  messagesCount++;
}

export function markTaskCompleted(): void {
  tasksCompleted++;
}

export function resetSession(): void {
  sessionStart = new Date();
  lastActivity = new Date();
  messagesCount = 0;
  tasksCompleted = 0;
}

export function getWorkDuration(): number {
  return Math.round((Date.now() - sessionStart.getTime()) / 60000); // minutes
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ — собрать полный контекст работы
// ============================================================

export async function getWorkContext(): Promise<WorkContext> {
  // 1. Git репозитории
  const repoPaths = await findGitRepos(os.homedir(), 2);
  const gitRepos: GitRepo[] = [];
  for (const repoPath of repoPaths.slice(0, 10)) {
    const repo = await getGitRepoStatus(repoPath);
    if (repo) gitRepos.push(repo);
  }

  // 2. Недавние файлы
  const recentFiles = await getRecentFiles(os.homedir(), 15);

  // 3. Активные проекты (из git repos + recent files)
  const activeProjects = new Set<string>();
  for (const repo of gitRepos) {
    activeProjects.add(path.basename(repo.path));
  }
  for (const file of recentFiles) {
    // Пытаемся определить проект по пути
    const parts = file.path.split(path.sep);
    if (parts.length > 2) {
      const projectDir = parts[parts.length - 2];
      if (projectDir && !['Desktop', 'Downloads', 'Documents', 'tmp', 'cache'].includes(projectDir)) {
        activeProjects.add(projectDir);
      }
    }
  }

  // 4. Сессия
  const workDuration = getWorkDuration();
  const session: WorkSession = {
    startedAt: sessionStart,
    lastActivityAt: lastActivity,
    totalMessages: messagesCount,
    tasksCompleted,
    projectsTouched: Array.from(activeProjects).slice(0, 10),
  };

  // 5. Паттерны (упрощённо)
  const patterns: WorkPattern[] = [];

  // Долгая сессия
  if (workDuration > 180) {
    patterns.push({
      type: 'work_time',
      description: `Сессия длится ${Math.round(workDuration / 60)}ч ${workDuration % 60}м`,
      occurrences: 1,
      lastSeen: new Date(),
      suggestion: 'Предложить перерыв',
    });
  }

  // Незакоммиченные изменения
  for (const repo of gitRepos) {
    if (repo.uncommittedCount > 10) {
      patterns.push({
        type: 'frequent_file',
        description: `${repo.path}: ${repo.uncommittedCount} незакоммиченных файлов`,
        occurrences: repo.uncommittedCount,
        lastSeen: new Date(),
        suggestion: 'Предложить закоммитить',
      });
    }
  }

  return {
    gitRepos,
    recentFiles,
    activeProjects: Array.from(activeProjects).slice(0, 10),
    session,
    patterns,
    workDuration,
    isLongSession: workDuration > 180,
    suggestedBreak: workDuration > 180 && workDuration % 60 < 5,
  };
}

/**
 * Краткий текстовый отчёт для системного промпта.
 */
export function formatWorkContextForPrompt(ctx: WorkContext): string {
  const lines: string[] = [];

  if (ctx.gitRepos.length > 0) {
    lines.push('\n\n# Контекст работы пользователя');
    lines.push('Git репозитории:');
    for (const repo of ctx.gitRepos.slice(0, 5)) {
      const status = repo.status === 'clean' ? 'чистый' : `${repo.uncommittedCount} изм.`;
      lines.push(`- ${path.basename(repo.path)} (${repo.branch}, ${status})`);
      if (repo.lastCommit) {
        lines.push(`  последний коммит: ${repo.lastCommit.message.slice(0, 60)}`);
      }
    }
  }

  if (ctx.recentFiles.length > 0) {
    lines.push('\nНедавно изменённые файлы:');
    for (const file of ctx.recentFiles.slice(0, 5)) {
      const age = Math.round((Date.now() - file.modified.getTime()) / 60000);
      lines.push(`- ${file.name} (${age}м назад)`);
    }
  }

  if (ctx.workDuration > 60) {
    lines.push(`\nСессия: ${Math.round(ctx.workDuration / 60)}ч ${ctx.workDuration % 60}м`);
  }

  if (ctx.isLongSession) {
    lines.push('ВНИМАНИЕ: долгая сессия (3+ часов). Предложи перерыв.');
  }

  if (ctx.patterns.length > 0) {
    lines.push('\nПаттерны:');
    for (const p of ctx.patterns) {
      lines.push(`- ${p.description}`);
      if (p.suggestion) lines.push(`  → ${p.suggestion}`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
}
