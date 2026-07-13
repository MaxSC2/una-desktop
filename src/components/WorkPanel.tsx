/**
 * Work Panel — рабочая панель напарника.
 *
 * Показывает:
 * - Git репозитории (статус, незакоммиченные файлы)
 * - Недавно изменённые файлы
 * - Время сессии
 * - Предложения U.N.A. (перерыв, закоммитить, etc.)
 *
 * Это не «мониторинг» — это общий рабочий стол напарника.
 */

import { useEffect, useState } from 'react';
import { GitBranch, FileCode, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ClockIcon, CoffeeIcon } from '@/components/ui/animated-icons';

interface GitRepoInfo {
  path: string;
  branch: string;
  status: 'clean' | 'dirty' | 'ahead' | 'behind';
  uncommittedCount: number;
  lastCommit: { hash: string; message: string; date: string } | null;
}

interface RecentFileInfo {
  path: string;
  name: string;
  modified: string;
  size: number;
}

interface WorkData {
  gitRepos: GitRepoInfo[];
  recentFiles: RecentFileInfo[];
  workDuration: number;
  isLongSession: boolean;
  patterns: Array<{ description: string; suggestion?: string }>;
}

export function WorkPanel() {
  const [data, setData] = useState<WorkData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // В реальной интеграции — IPC запрос к main process
    // Пока демо-данные для UI
    const demo: WorkData = {
      gitRepos: [
        {
          path: '~/projects/una-desktop',
          branch: 'main',
          status: 'dirty',
          uncommittedCount: 8,
          lastCommit: { hash: 'a3f2b1c', message: 'feat: add emotion dashboard', date: new Date(Date.now() - 3600000).toISOString() },
        },
        {
          path: '~/projects/my-app',
          branch: 'feature/auth',
          status: 'clean',
          uncommittedCount: 0,
          lastCommit: { hash: 'b8e4d2a', message: 'fix: login redirect', date: new Date(Date.now() - 86400000).toISOString() },
        },
      ],
      recentFiles: [
        { path: '~/projects/una-desktop/electron/main.ts', name: 'main.ts', modified: new Date(Date.now() - 600000).toISOString(), size: 18432 },
        { path: '~/projects/una-desktop/src/App.tsx', name: 'App.tsx', modified: new Date(Date.now() - 1800000).toISOString(), size: 8192 },
        { path: '~/notes/ideas.md', name: 'ideas.md', modified: new Date(Date.now() - 3600000).toISOString(), size: 2048 },
      ],
      workDuration: 145,
      isLongSession: false,
      patterns: [
        { description: '8 незакоммиченных файлов в una-desktop', suggestion: 'Закоммитить?' },
      ],
    };
    setData(demo);
    setLoading(false);
  }, []);

  if (loading) return <div className="p-4 text-slate-500 text-sm">Загрузка...</div>;
  if (!data) return null;

  const hours = Math.floor(data.workDuration / 60);
  const mins = data.workDuration % 60;

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-una-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Рабочий контекст</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <ClockIcon size={12} />
          {hours > 0 ? `${hours}ч ` : ''}{mins}м
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Предложения U.N.A. */}
        {data.patterns.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-una-400 font-mono">Предложения</div>
            {data.patterns.map((p, i) => (
              <div key={i} className="rounded-lg border border-una-500/30 bg-una-950/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-una-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-slate-200">{p.description}</p>
                    {p.suggestion && (
                      <p className="text-[11px] text-una-300 mt-1">→ {p.suggestion}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Долгая сессия */}
        {data.isLongSession && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
            <div className="flex items-center gap-2">
              <CoffeeIcon size={14} className="text-amber-400" />
              <p className="text-xs text-amber-200">Сессия 3+ часов. Перерыв?</p>
            </div>
          </div>
        )}

        {/* Git репозитории */}
        {data.gitRepos.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Git репозитории</div>
            {data.gitRepos.map((repo, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3 w-3 text-una-400" />
                    <span className="text-xs font-mono text-slate-200">
                      {repo.path.split('/').pop()}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{repo.branch}</span>
                  </div>
                  {repo.status === 'clean' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] text-amber-400 font-mono">
                      {repo.uncommittedCount} изм.
                    </span>
                  )}
                </div>
                {repo.lastCommit && (
                  <div className="text-[10px] text-slate-500 font-mono pl-5">
                    {repo.lastCommit.hash} · {repo.lastCommit.message.slice(0, 50)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Недавние файлы */}
        {data.recentFiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">Недавние файлы</div>
            {data.recentFiles.map((file, i) => {
              const ageMin = Math.round((Date.now() - new Date(file.modified).getTime()) / 60000);
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/40">
                  <FileCode className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="text-xs font-mono text-slate-300 truncate flex-1">{file.name}</span>
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {ageMin < 60 ? `${ageMin}м` : `${Math.round(ageMin / 60)}ч`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-800/50 bg-slate-900/40 text-[10px] text-slate-500 font-mono">
        U.N.A. видит контекст работы — как напарник за соседним столом
      </div>
    </div>
  );
}
