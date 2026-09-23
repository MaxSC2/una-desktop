/**
 * TASK-014 (DEC-021): приёмочные тесты для electron/ai/work-context.ts.
 *
 * Контракт P1-2: фиксируем ТЕКУЧЕЕ поведение. Жёсткие рамки:
 * - os.homedir замокан на tmp (hoisted holder) — реальный homedir не сканируется;
 * - git исполняется только в tmp-репозитории;
 * - время — fake timers (никаких слипов).
 *
 * Зафиксированные эджи:
 * - formatWorkContextForPrompt: одна одиночная секция (только workDuration>60
 *   или только isLongSession) → lines.length===1 → возвращается '' (порог >1).
 * - getRecentFiles: файлы с mtime ровно/старше 24ч исключены (строгое >).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

const h = vi.hoisted(() => ({ home: '' }));

vi.mock('os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('os')>();
  return { ...orig, homedir: () => h.home || orig.homedir() };
});

type WC = typeof import('../../electron/ai/work-context');

let wc: WC;
let tmpDir: string;

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'una-wc-'));
  h.home = tmpDir;
  wc = await import('../../electron/ai/work-context');
});

afterEach(async () => {
  h.home = '';
  vi.useRealTimers();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function emptyCtx(): import('../../electron/ai/work-context').WorkContext {
  return {
    gitRepos: [], recentFiles: [], activeProjects: [],
    session: {
      startedAt: new Date(), lastActivityAt: new Date(),
      totalMessages: 0, tasksCompleted: 0, projectsTouched: [],
    },
    patterns: [], workDuration: 0, isLongSession: false, suggestedBreak: false,
  };
}

describe('рабочая сессия', () => {
  it('getWorkDuration: минуты от sessionStart (fake timers)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    wc.resetSession();
    vi.setSystemTime(new Date('2026-09-24T11:30:00Z'));
    expect(wc.getWorkDuration()).toBe(90);
  });

  it('updateActivity/markTaskCompleted/resetSession видны через getWorkContext (tmp homedir)', async () => {
    wc.resetSession();
    wc.updateActivity();
    wc.updateActivity();
    wc.markTaskCompleted();
    let ctx = await wc.getWorkContext();
    expect(ctx.session.totalMessages).toBe(2);
    expect(ctx.session.tasksCompleted).toBe(1);
    expect(ctx.gitRepos).toEqual([]); // в tmp нет репозиториев
    expect(ctx.isLongSession).toBe(false);

    wc.resetSession();
    ctx = await wc.getWorkContext();
    expect(ctx.session.totalMessages).toBe(0);
    expect(ctx.session.tasksCompleted).toBe(0);
    expect(ctx.workDuration).toBe(0);
  });

  it('getWorkContext: workDuration>180 → isLongSession + work_time паттерн', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    wc.resetSession();
    vi.setSystemTime(new Date('2026-09-24T13:03:00Z')); // +183 мин: 183 % 60 = 3 < 5
    const ctx = await wc.getWorkContext();
    expect(ctx.workDuration).toBe(183);
    expect(ctx.isLongSession).toBe(true);
    expect(ctx.patterns.some(p => p.type === 'work_time')).toBe(true);
    expect(ctx.suggestedBreak).toBe(true);
  });
});

describe('formatWorkContextForPrompt (чистая функция)', () => {
  it('пустой ctx → пустая строка', () => {
    expect(wc.formatWorkContextForPrompt(emptyCtx())).toBe('');
  });

  it('gitRepos: секция с branch, статусом clean/dirty, последним коммитом', () => {
    const ctx = emptyCtx();
    ctx.gitRepos = [
      { path: '/x/alpha', branch: 'main', status: 'clean', uncommittedCount: 0,
        lastCommit: { hash: 'abcd1234', message: 'initial commit', date: '2026-09-24', author: 'A' },
        recentCommits: [] },
      { path: '/x/beta', branch: 'dev', status: 'dirty', uncommittedCount: 3,
        lastCommit: null, recentCommits: [] },
    ];
    const out = wc.formatWorkContextForPrompt(ctx);
    expect(out).toContain('# Контекст работы пользователя');
    expect(out).toContain('- alpha (main, чистый)');
    expect(out).toContain('последний коммит: initial commit');
    expect(out).toContain('- beta (dev, 3 изм.)');
    expect(out).not.toContain('Недавно изменённые файлы');
  });

  it('gitRepos: только первые 5', () => {
    const ctx = emptyCtx();
    ctx.gitRepos = Array.from({ length: 7 }, (_, i) => ({
      path: `/x/repo${i}`, branch: 'main', status: 'clean' as const, uncommittedCount: 0,
      lastCommit: null, recentCommits: [],
    }));
    const out = wc.formatWorkContextForPrompt(ctx);
    expect(out).toContain('repo4');
    expect(out).not.toContain('repo5');
  });

  it('recentFiles: секция с возрастом в минутах (по Date.now)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    const ctx = emptyCtx();
    ctx.recentFiles = [{
      path: '/x/notes.txt', name: 'notes.txt',
      modified: new Date(Date.now() - 5 * 60000), size: 10,
    }];
    const out = wc.formatWorkContextForPrompt(ctx);
    expect(out).toContain('Недавно изменённые файлы:');
    expect(out).toContain('- notes.txt (5м назад)');
  });

  it('workDuration>60 → строка сессии; ровно 60 → нет', () => {
    const ctx60 = emptyCtx();
    ctx60.workDuration = 60;
    ctx60.gitRepos = [{ path: '/x/a', branch: 'm', status: 'clean', uncommittedCount: 0, lastCommit: null, recentCommits: [] }];
    expect(wc.formatWorkContextForPrompt(ctx60)).not.toContain('Сессия:');
    const ctx61 = emptyCtx();
    ctx61.workDuration = 125;
    ctx61.gitRepos = ctx60.gitRepos;
    expect(wc.formatWorkContextForPrompt(ctx61)).toContain('Сессия: 2ч 5м');
  });

  it('ЭДЖ: только workDuration>60 без других секций → \'\' (порог lines.length>1)', () => {
    const ctx = emptyCtx();
    ctx.workDuration = 90;
    expect(wc.formatWorkContextForPrompt(ctx)).toBe(''); // фактическое поведение
  });

  it('isLongSession → предупреждение; patterns → секция с → suggestion', () => {
    const ctx = emptyCtx();
    ctx.gitRepos = [{ path: '/x/a', branch: 'm', status: 'clean', uncommittedCount: 0, lastCommit: null, recentCommits: [] }];
    ctx.isLongSession = true;
    ctx.patterns = [{ type: 'work_time', description: 'Сессия длится 3ч 10м', occurrences: 1, lastSeen: new Date(), suggestion: 'Предложить перерыв' }];
    const out = wc.formatWorkContextForPrompt(ctx);
    expect(out).toContain('ВНИМАНИЕ: долгая сессия (3+ часов). Предложи перерыв.');
    expect(out).toContain('Паттерны:');
    expect(out).toContain('- Сессия длится 3ч 10м');
    expect(out).toContain('→ Предложить перерыв');
  });
});


describe('findGitRepos (tmp-дерево)', () => {
  it('находит вложенный .git; не спускается внутрь найденного репо', async () => {
    const repo = path.join(tmpDir, 'a', 'b');
    await fs.mkdir(path.join(repo, '.git'), { recursive: true });
    await fs.mkdir(path.join(repo, 'inner', '.git'), { recursive: true }); // внутри репо — игнор
    const repos = await wc.findGitRepos(tmpDir);
    expect(repos).toEqual([repo]);
  });

  it('пропускает node_modules и скрытые папки', async () => {
    const nm = path.join(tmpDir, 'proj', 'node_modules', 'lib');
    await fs.mkdir(path.join(nm, '.git'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.hidden', '.git'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'proj', '.git'), { recursive: true });
    const repos = await wc.findGitRepos(tmpDir);
    expect(repos).toEqual([path.join(tmpDir, 'proj')]);
  });

  it('лимит глубины 3: репо на глубине 4 не находится', async () => {
    const shallow = path.join(tmpDir, 'a', 'b', 'c'); // depth 3 — найдётся
    await fs.mkdir(path.join(shallow, '.git'), { recursive: true });
    const deep = path.join(tmpDir, 'x', 'y', 'z', 'w'); // depth 4 — нет
    await fs.mkdir(path.join(deep, '.git'), { recursive: true });
    const repos = await wc.findGitRepos(tmpDir);
    expect(repos).toEqual([shallow]);
  });

  it('пустая папка → пустой массив', async () => {
    expect(await wc.findGitRepos(tmpDir)).toEqual([]);
  });
});

describe('getRecentFiles (tmp-дерево)', () => {
  it('только файлы за 24ч, сортировка DESC, старый файл исключён', async () => {
    const oldF = path.join(tmpDir, 'old.txt');
    const midF = path.join(tmpDir, 'mid.txt');
    const newF = path.join(tmpDir, 'new.txt');
    await fs.writeFile(oldF, 'o');
    await fs.writeFile(midF, 'm');
    await fs.writeFile(newF, 'n');
    const now = Date.now();
    const twoDays = new Date(now - 2 * 86400000);
    await fs.utimes(oldF, twoDays, twoDays);
    const hour = new Date(now - 3600000);
    await fs.utimes(midF, hour, hour);
    const files = await wc.getRecentFiles(tmpDir);
    expect(files.map(f => f.name)).toEqual(['new.txt', 'mid.txt']); // old.txt старше 24ч
    expect(files[0].modified.getTime()).toBeGreaterThan(files[1].modified.getTime());
    expect(files[0].size).toBe(1);
  });

  it('не спускается в node_modules; лимит maxResults', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'dep.js'), 'x');
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b');
    const files = await wc.getRecentFiles(tmpDir, 1);
    expect(files).toHaveLength(1);
    expect(files[0].name).not.toBe('dep.js');
  });
});

describe('getGitRepoStatus (реальный git в tmp)', () => {
  function git(args: string, cwd: string): void {
    execSync(`git ${args}`, { cwd, stdio: 'pipe' });
  }

  it('чистый tmp-репо → branch/status/counts/lastCommit', async () => {
    const repo = path.join(tmpDir, 'repo');
    await fs.mkdir(repo, { recursive: true });
    git('init -b main', repo);
    git('-c user.email=t@t -c user.name=T commit --allow-empty -m init', repo);
    const st = await wc.getGitRepoStatus(repo);
    expect(st).not.toBeNull();
    expect(st!.branch).toBe('main');
    expect(st!.status).toBe('clean');
    expect(st!.uncommittedCount).toBe(0);
    expect(st!.lastCommit!.hash).toHaveLength(8);
    expect(st!.lastCommit!.message).toBe('init');
    expect(st!.recentCommits).toHaveLength(1);
  });

  it('незакоммиченный файл → dirty + count 1', async () => {
    const repo = path.join(tmpDir, 'repo');
    await fs.mkdir(repo, { recursive: true });
    git('init -b main', repo);
    git('-c user.email=t@t -c user.name=T commit --allow-empty -m init', repo);
    await fs.writeFile(path.join(repo, 'new.txt'), 'x');
    const st = await wc.getGitRepoStatus(repo);
    expect(st!.status).toBe('dirty');
    expect(st!.uncommittedCount).toBe(1);
  });

  it('не-репо → null', async () => {
    expect(await wc.getGitRepoStatus(tmpDir)).toBeNull();
  });
});

