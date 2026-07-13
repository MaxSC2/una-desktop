'use client';

import { useEffect, useState } from 'react';
import { DeleteIcon, BellIcon, PlusIcon, ClockIcon } from '@/components/ui/animated-icons';

interface Reminder {
  id: number;
  text: string;
  trigger_at: string;
  created_at: string;
  done: number;
}

export function RemindersPanel() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [text, setText] = useState('');
  const [delay, setDelay] = useState('30');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await window.una.reminders.list() as { reminders: Reminder[] };
    setReminders(res.reminders.filter((r) => !r.done));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!text.trim()) return;
    const minutes = parseInt(delay) || 30;
    const triggerAt = new Date(Date.now() + minutes * 60000).toISOString();
    await window.una.reminders.create(text.trim(), triggerAt);
    setText('');
    load();
  };

  const remove = async (id: number) => {
    await window.una.reminders.delete(id);
    load();
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <BellIcon size={16} className="text-una-400" />
        <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Напоминания</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-slate-500 text-sm">Загрузка...</p>
        ) : reminders.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Нет напоминаний</p>
        ) : (
          reminders.map((r) => (
            <div key={r.id} className="flex items-start gap-2 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
              <ClockIcon size={16} className="text-una-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200">{r.text}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  {new Date(r.trigger_at).toLocaleString('ru-RU')}
                </p>
              </div>
              <button onClick={() => remove(r.id)} className="p-1 hover:bg-rose-500/20 rounded text-slate-500 hover:text-rose-400">
                <DeleteIcon size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-una-500/20 bg-slate-900/60 p-3 space-y-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Текст напоминания..."
          className="w-full bg-slate-950/60 border border-una-500/30 rounded-lg px-3 py-2 text-sm text-una-50 placeholder:text-slate-600 focus:outline-none focus:border-una-400 font-mono"
        />
        <div className="flex gap-2">
          <input
            type="number"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            min={1}
            className="w-20 bg-slate-950/60 border border-una-500/30 rounded-lg px-2 py-2 text-sm text-una-50 text-center font-mono"
          />
          <span className="text-xs text-slate-500 self-center">минут</span>
          <button
            onClick={add}
            disabled={!text.trim()}
            className="ml-auto flex items-center gap-1 bg-una-600 hover:bg-una-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm"
          >
            <PlusIcon size={14} />
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
