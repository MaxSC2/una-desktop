/**
 * Панель памяти — показывает сохранённые факты.
 */

'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BrainIcon, DeleteIcon } from '@/components/ui/animated-icons';

export function MemoryPanel() {
  const [facts, setFacts] = useState<Array<{ id: number; category: string; content: string; created_at: string; use_count: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.una.memory.listFacts();
      setFacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const del = async (id: number) => {
    await window.una.memory.deleteFact(id);
    void load();
  };

  const categoryColors: Record<string, string> = {
    user: 'text-cyan-300 border-cyan-500/30 bg-cyan-950/30',
    project: 'text-violet-300 border-violet-500/30 bg-violet-950/30',
    preference: 'text-amber-300 border-amber-500/30 bg-amber-950/30',
    task: 'text-emerald-300 border-emerald-500/30 bg-emerald-950/30',
  };

  const categoryLabels: Record<string, string> = {
    user: 'О пользователе',
    project: 'Проект',
    preference: 'Предпочтение',
    task: 'Задача',
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <BrainIcon size={16} className="text-una-400" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Память U.N.A.</h2>
        </div>
        <button onClick={load} className="p-1.5 hover:bg-una-500/10 rounded text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-2">
          Семантическая память — {facts.length} фактов
        </div>
        {facts.length === 0 && !loading && (
          <div className="text-center text-slate-500 text-xs py-8">
            Пока нет сохранённых фактов.
            <br />
            <span className="text-slate-600">U.N.A. будет помнить важное о вас автоматически.</span>
          </div>
        )}
        {facts.map((f) => (
          <div
            key={f.id}
            className={`rounded border p-2.5 ${categoryColors[f.category] || 'border-slate-700'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wider font-mono">
                {categoryLabels[f.category] || f.category}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">×{f.use_count}</span>
                <button onClick={() => del(f.id)} className="text-slate-500 hover:text-rose-400">
                  <DeleteIcon size={12} />
                </button>
              </div>
            </div>
            <div className="text-sm text-slate-100">{f.content}</div>
            <div className="text-[10px] text-slate-600 mt-1">
              {new Date(f.created_at).toLocaleString('ru-RU')}
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-slate-800/50 bg-slate-900/40 text-[10px] text-slate-500 font-mono">
        Память хранится в SQLite. Embeddings: all-MiniLM-L6-v2 (384d).
      </div>
    </div>
  );
}
