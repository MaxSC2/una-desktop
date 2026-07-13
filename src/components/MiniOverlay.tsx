/**
 * MiniOverlay — лёгкий плавающий мини-чат.
 *
 * Вместо полного окна U.N.A. — маленький оверлей в углу экрана:
 * - Всегда поверх окон (alwaysOnTop)
 * - Без рамки, полупрозрачный
 * - Сворачивается до иконки аватара
 * - Разворачивается при клике или hotkey
 *
 * Идея: U.N.A. в фоне, но доступна одним кликом.
 */

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useUNA } from '../hooks/useUNA';
import { UnaAvatar, AvatarEmotion, AvatarStatus } from './UnaAvatar';
import { Minimize2 } from 'lucide-react';
import { SendIcon } from '@/components/ui/animated-icons';

interface ProactiveSuggestion {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  action?: string;
}

export function MiniOverlay() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<ProactiveSuggestion | null>(null);
  const messages = useStore((s) => s.messages);
  const status = useStore((s) => s.status);
  const currentEmotion = useStore((s) => s.currentEmotion);
  const { sendMessage } = useUNA();
  const inputRef = useRef<HTMLInputElement>(null);

  // Слушаем proactive предложения от main process
  useEffect(() => {
    const handler = (s: ProactiveSuggestion) => {
      setSuggestion(s);
      setExpanded(true);
    };
    if (window.una?.on) {
      window.una.on('proactive:suggestion', handler as (...args: unknown[]) => void);
    }
    return () => {
      if (window.una?.on) {
        window.una.on('proactive:suggestion', () => {});
      }
    };
  }, []);

  // Автофокус при разворачивании
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    void sendMessage(text);
  };

  const handleSuggestionAction = () => {
    if (suggestion?.action) {
      void sendMessage(suggestion.action);
    } else {
      void sendMessage(suggestion?.message || '');
    }
    setSuggestion(null);
  };

  const handleDismiss = () => {
    setSuggestion(null);
    setExpanded(false);
  };

  // Последние 3 сообщения для мини-чата
  const recentMessages = messages.slice(-3);
  const lastMessage = messages[messages.length - 1];

  const avatarStatus: AvatarStatus = status;
  const avatarEmotion: AvatarEmotion = currentEmotion;

  // СХОРОЖЕННЫЙ режим — только аватар
  if (!expanded) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 cursor-pointer transition-all hover:scale-105"
        onClick={() => setExpanded(true)}
        title="Нажмите чтобы поговорить с U.N.A."
      >
        <div className="relative">
          <UnaAvatar emotion={avatarEmotion} status={avatarStatus} size={64} />
          {status !== 'idle' && (
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-una-400 animate-pulse" />
          )}
        </div>
      </div>
    );
  }

  // РАЗВЁРНУТЫЙ режим — мини-чат
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-slate-950/95 backdrop-blur-xl border border-una-500/30 rounded-2xl shadow-2xl shadow-una-500/10 overflow-hidden">
      {/* Header — аватар + статус + свернуть */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-una-500/20 bg-slate-900/80">
        <div className="scale-50 origin-left -ml-4 -my-2">
          <UnaAvatar emotion={avatarEmotion} status={avatarStatus} size={40} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono text-una-300">U.N.A.</div>
          <div className="text-[10px] text-slate-500">
            {status === 'idle' ? 'на связи' : status === 'thinking' ? 'размышляю...' : status}
          </div>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="p-1 rounded hover:bg-slate-800 text-slate-400"
          title="Свернуть"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Proactive предложение */}
      {suggestion && (
        <div className="mx-3 mt-2 p-2.5 rounded-lg bg-una-950/40 border border-una-500/30">
          <p className="text-xs text-una-100">{suggestion.message}</p>
          <div className="flex gap-1.5 mt-2">
            {suggestion.action && (
              <button
                onClick={handleSuggestionAction}
                className="px-2 py-1 rounded bg-una-600 hover:bg-una-500 text-white text-[10px] font-mono"
              >
                Да
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono"
            >
              Позже
            </button>
          </div>
        </div>
      )}

      {/* Последние сообщения */}
      <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1.5">
        {recentMessages.length === 0 && (
          <div className="text-center text-slate-600 text-xs py-4">
            На связи. Чем займёмся?
          </div>
        )}
        {recentMessages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs leading-relaxed ${
              msg.role === 'user' ? 'text-right' : ''
            }`}
          >
            <span
              className={`inline-block max-w-[85%] px-2.5 py-1.5 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-una-600/20 text-una-100'
                  : msg.role === 'system'
                  ? 'bg-amber-950/30 text-amber-200 text-[10px]'
                  : 'bg-slate-800/60 text-slate-200'
              }`}
            >
              {msg.content.slice(0, 200)}
              {msg.content.length > 200 && '...'}
            </span>
          </div>
        ))}
        {status === 'thinking' && (
          <div className="text-xs text-slate-500 italic px-2">
            <span className="inline-flex gap-1">
              <span className="h-1 w-1 rounded-full bg-una-400 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-1 rounded-full bg-una-400 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-1 rounded-full bg-una-400 animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-una-500/20 bg-slate-900/80">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === 'Escape') {
              setExpanded(false);
            }
          }}
          placeholder="Спросить U.N.A..."
          className="flex-1 bg-slate-950/60 border border-una-500/20 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-una-400/50 font-mono"
          disabled={status === 'thinking'}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || status === 'thinking'}
          className="p-1.5 rounded-lg bg-una-600 hover:bg-una-500 disabled:opacity-30 text-white shrink-0"
        >
          <SendIcon size={12} />
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 py-1 bg-slate-950/60 text-[9px] text-slate-600 font-mono flex justify-between">
        <span>Esc — свернуть · Enter — отправить</span>
        <span>Ctrl+Shift+Space — голос</span>
      </div>
    </div>
  );
}
