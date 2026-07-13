/**
 * Quick Command Palette — мгновенный ввод команды.
 *
 * Как Spotlight (Mac) или PowerToys Run (Windows):
 * - Открывается по горячей клавише
 * - Поле ввода + мгновенный ответ U.N.A.
 * - Не нужно открывать полное окно
 * - Закрывается по Esc или после ответа
 *
 * Идея: U.N.A. всегда на расстоянии одного нажатия.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useUNA } from '../hooks/useUNA';
import { X, Loader2 } from 'lucide-react';
import { SendIcon } from '@/components/ui/animated-icons';

export function QuickPalette({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const { sendMessage } = useUNA();
  const status = useStore((s) => s.status);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || waiting) return;
    setWaiting(true);
    setResponse(null);
    const result = await sendMessage(input);
    setWaiting(false);
    if (result && result.reply) {
      setResponse(result.reply);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-950/95 border border-una-500/30 rounded-2xl shadow-2xl shadow-una-500/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-una-400 to-accent-500 flex items-center justify-center shrink-0">
            <span className="text-xs font-mono font-bold text-slate-950">U</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спросите U.N.A. о чём угодно..."
            disabled={waiting}
            className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 focus:outline-none text-base font-mono"
          />
          {waiting ? (
            <Loader2 className="h-4 w-4 text-una-400 animate-spin shrink-0" />
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="p-2 rounded-lg bg-una-600 hover:bg-una-500 disabled:opacity-30 text-white shrink-0"
            >
              <SendIcon size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Response */}
        {response && (
          <div className="px-5 py-4 border-t border-una-500/20 bg-slate-900/60">
            <div className="text-xs text-slate-500 font-mono mb-2">U.N.A.:</div>
            <div className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">
              {response}
            </div>
            <button
              onClick={onClose}
              className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
            >
              Закрыть (Esc)
            </button>
          </div>
        )}

        {/* Hints */}
        {!response && !waiting && (
          <div className="px-5 py-3 border-t border-una-500/10 bg-slate-900/40">
            <div className="flex gap-3 text-[10px] text-slate-600 font-mono">
              <span>↵ Отправить</span>
              <span>Esc Закрыть</span>
              <span>·</span>
              <span>U.N.A. на расстоянии одного нажатия</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
