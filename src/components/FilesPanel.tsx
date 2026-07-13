/**
 * Панель файлов — просмотрщик файловой системы.
 */

'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ArrowUp, Lock } from 'lucide-react';
import { FoldersIcon, FileTextIcon, ChevronRightIcon } from '@/components/ui/animated-icons';

export function FilesPanel() {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDir = async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.una.files.list(dirPath);
      if (result.success && result.data) {
        setCurrentPath(result.data.path);
        setItems(result.data.items);
      } else {
        setError(result.error ?? 'Ошибка');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDir();
  }, []);

  const goUp = () => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(sep).filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    const parent = (currentPath.startsWith('/') ? '/' : '') + parts.join(sep);
    void loadDir(parent);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <FoldersIcon size={16} className="text-una-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Файлы</h2>
        </div>
        <div className="flex gap-1">
          <button onClick={goUp} className="p-1.5 hover:bg-una-500/10 rounded text-slate-300">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button onClick={() => loadDir(currentPath)} className="p-1.5 hover:bg-una-500/10 rounded text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-800/50 bg-slate-950/40">
        <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-0.5">Путь</div>
        <div className="text-xs font-mono text-una-200 break-all">{currentPath}</div>
      </div>

      {error && (
        <div className="m-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded p-2">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {items.map((item: any) => (
          <button
            key={item.path}
            onClick={() => item.type === 'directory' && loadDir(item.path)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm font-mono hover:bg-una-500/10 text-slate-200 text-left"
          >
            {item.type === 'directory' ? (
              <FoldersIcon size={16} className="text-una-400 shrink-0" />
            ) : (
              <FileTextIcon size={16} className="text-slate-400 shrink-0" />
            )}
            <span className="truncate flex-1">{item.name}</span>
            {item.type === 'file' && (
              <span className="text-[10px] text-slate-500 shrink-0">
                {item.size > 1024 ? `${(item.size / 1024).toFixed(1)}KB` : `${item.size}B`}
              </span>
            )}
            {item.type === 'directory' && <ChevronRightIcon size={16} className="text-slate-600 shrink-0" />}
          </button>
        ))}
        {items.length === 0 && !loading && <div className="text-center text-slate-500 text-xs py-8">Папка пуста</div>}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-800/50 bg-slate-900/40 text-[10px] text-slate-500 font-mono flex items-center gap-2">
        <Lock className="h-3 w-3" />
        Защищённые файлы (.env, ключи) не читаются
      </div>
    </div>
  );
}
