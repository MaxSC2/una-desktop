/**
 * Диалог подтверждения опасной операции.
 */

'use client';

import { useStore } from '../lib/store';
import { useUNA } from '../hooks/useUNA';
import { AlertTriangle, Shield, X } from 'lucide-react';
import { CheckIcon } from '@/components/ui/animated-icons';

export function ConfirmationDialog() {
  const pending = useStore((s) => s.pendingConfirmation);
  const { confirmAction, rejectAction } = useUNA();

  if (!pending) return null;
  const isDangerous = pending.risk === 'dangerous';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-xl border-2 bg-slate-950 shadow-2xl overflow-hidden ${
          isDangerous ? 'border-rose-500/50' : 'border-amber-500/50'
        }`}
      >
        <div
          className={`flex items-center gap-3 px-5 py-4 border-b ${
            isDangerous ? 'bg-rose-950/40 border-rose-500/30' : 'bg-amber-950/40 border-amber-500/30'
          }`}
        >
          {isDangerous ? (
            <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />
          ) : (
            <Shield className="h-6 w-6 text-amber-400 shrink-0" />
          )}
          <div>
            <h3
              className={`font-mono text-sm uppercase tracking-wider ${
                isDangerous ? 'text-rose-300' : 'text-amber-300'
              }`}
            >
              {isDangerous ? 'Опасная операция' : 'Требуется внимание'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">U.N.A. просит подтверждения</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">Действие</div>
            <div className="text-slate-100 font-mono text-sm">{pending.action}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">Причина</div>
            <div className="text-slate-300 text-sm">{pending.details}</div>
          </div>
        </div>

        <div className="flex gap-2 p-4 bg-slate-900/60 border-t border-slate-800">
          <button
            onClick={confirmAction}
            className={`flex-1 gap-2 px-4 py-2 rounded-lg font-mono text-sm flex items-center justify-center ${
              isDangerous ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            <CheckIcon size={16} />
            Подтвердить
          </button>
          <button
            onClick={rejectAction}
            className="flex-1 gap-2 px-4 py-2 rounded-lg font-mono text-sm flex items-center justify-center border border-slate-700 bg-slate-800/50 text-slate-200 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
            Отклонить
          </button>
        </div>
      </div>
    </div>
  );
}
