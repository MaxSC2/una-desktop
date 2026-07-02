/**
 * Панель чата — основной интерфейс общения с U.N.A.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useUNA } from '../hooks/useUNA';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ChevronDown, ChevronRight, Wrench, Volume2, VolumeX, Trash2, Send, Mic, Square, Activity, Copy, Check, StopCircle } from 'lucide-react';
import { UnaMascot, MascotEmotion, MascotStatus } from './UnaMascot';
import { RiveMascot } from './RiveMascot';

export function ChatPanel() {
  const messages = useStore((s) => s.messages);
  const clearMessages = useStore((s) => s.clearMessages);
  const voiceEnabled = useStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useStore((s) => s.setVoiceEnabled);
  const streamingEnabled = useStore((s) => s.streamingEnabled);
  const setStreamingEnabled = useStore((s) => s.setStreamingEnabled);
  const status = useStore((s) => s.status);
  const { sendMessage, sendMessageStream, stopGeneration, startListening, stopListening } = useUNA();

  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || status === 'thinking') return;
    const text = input;
    setInput('');
    if (streamingEnabled) {
      void sendMessageStream(text);
    } else {
      void sendMessage(text);
    }
  };

  const handleMic = () => {
    if (listening) {
      stopListening();
      setListening(false);
    } else {
      startListening();
      setListening(true);
    }
  };

  const busy = status === 'thinking' || status === 'executing' || status === 'speaking';

  const [demoEmotion, setDemoEmotion] = useState<MascotEmotion>('neutral');
  const [demoStatus, setDemoStatus] = useState<MascotStatus>('idle');

  useEffect(() => {
    if (status !== 'idle') return;
    const emotions: MascotEmotion[] = ['neutral', 'happy', 'thinking', 'excited', 'sad', 'frustrated', 'anxious'];
    const statuses: MascotStatus[] = ['idle', 'thinking', 'listening', 'executing', 'speaking'];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % (emotions.length + statuses.length);
      if (i < emotions.length) {
        setDemoEmotion(emotions[i]);
        setDemoStatus('idle');
      } else {
        setDemoEmotion('neutral');
        setDemoStatus(statuses[i - emotions.length]);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-una-400 animate-pulse" />
          <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Диалог с U.N.A.</h2>
          {status === 'idle' && (
            <div className="ml-2">
              <UnaMascot emotion={demoEmotion} status={demoStatus} size={24} />
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <button
            className={`p-1.5 rounded text-slate-400 hover:text-una-300 ${streamingEnabled ? 'bg-una-500/20 text-una-300' : 'hover:bg-una-500/10'}`}
            onClick={() => setStreamingEnabled(!streamingEnabled)}
            title={streamingEnabled ? 'Стриминг включён (печатает по слову)' : 'Стриминг выключен (ждёт полный ответ)'}
          >
            <Activity className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 hover:bg-una-500/10 rounded text-slate-400 hover:text-una-300"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            title={voiceEnabled ? 'Выключить голос' : 'Включить голос'}
          >
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            className="p-1.5 hover:bg-red-500/10 rounded text-slate-400"
            onClick={clearMessages}
            title="Очистить"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-12">
            <p className="font-mono text-una-300">U.N.A. готова.</p>
            <p className="text-xs mt-2 text-slate-600">
              Напишите или нажмите микрофон, чтобы говорить.
              <br />
              Горячая клавиша: Ctrl+Shift+Space
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isStreaming={
              i === messages.length - 1 &&
              msg.role === 'assistant' &&
              (status === 'thinking' || status === 'executing') &&
              streamingEnabled
            }
          />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-una-500/20 bg-slate-900/60 p-3">
        <div className="flex items-end gap-2">
          <button
            onClick={handleMic}
            disabled={busy}
            className={`p-2.5 rounded-lg shrink-0 ${
              listening
                ? 'bg-pink-600 hover:bg-pink-500 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            } disabled:opacity-50`}
            title={listening ? 'Остановить запись' : 'Голосовая команда'}
          >
            {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Введите команду..."
            rows={1}
            className="flex-1 bg-slate-950/60 border border-una-500/30 rounded-lg px-3 py-2 text-sm text-una-50 placeholder:text-slate-600 focus:outline-none focus:border-una-400 font-mono resize-none min-h-[40px] max-h-32"
            disabled={busy}
          />
          {busy ? (
            <button
              onClick={stopGeneration}
              className="bg-rose-600 hover:bg-rose-500 text-white p-2.5 rounded-lg shrink-0"
              title="Остановить генерацию"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-una-600 hover:bg-una-500 disabled:opacity-50 text-white p-2.5 rounded-lg shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function parseThinkBlock(content: string): { thinking: string; answer: string } {
  if (content.includes('<think') && !content.includes('</think>')) {
    const thinkStart = content.indexOf('<think');
    return { thinking: content.slice(thinkStart + 7).trim(), answer: content.slice(0, thinkStart).trim() };
  }
  const match = content.match(/<think>([\s\S]*?)<\/think>/);
  if (match) {
    const idx = match.index as number;
    const before = content.slice(0, idx).trim();
    const after = content.slice(idx + match[0].length).trim();
    return {
      thinking: match[1].trim(),
      answer: before + (before && after ? '\n\n' : '') + after,
    };
  }
  return { thinking: '', answer: content };
}

function MessageBubble({ msg, isStreaming = false }: { msg: any; isStreaming?: boolean }) {
  const useRive = useStore((s) => s.useRiveMascot);
  const [expanded, setExpanded] = useState(false);
  const [thoughtExpanded, setThoughtExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  const { thinking, answer } = !isUser && !isSystem ? parseThinkBlock(msg.content ?? '') : { thinking: '', answer: msg.content ?? '' };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`flex flex-col gap-1 msg-in ${isUser ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
        {isUser ? 'Вы' : isSystem ? 'Система' : 'U.N.A.'}
        <span className="text-slate-700">
          {new Date(msg.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {isStreaming && (
          <span className="text-una-400 animate-pulse">● печатает...</span>
        )}
        {!isUser && !isSystem && !isStreaming && msg.content && (
          <button
            onClick={handleCopy}
            className="ml-1 text-slate-600 hover:text-una-300 transition-colors"
            title="Скопировать ответ"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </div>
      <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser && !isSystem && (
          <div className="shrink-0 mt-1">
            {useRive ? (
              <RiveMascot
                emotion={isStreaming ? 'thinking' : 'neutral'}
                status={isStreaming ? 'thinking' : 'idle'}
                size={36}
                src="/una-mascot.riv"
              />
            ) : (
              <UnaMascot
                emotion={isStreaming ? 'thinking' : 'neutral'}
                status={isStreaming ? 'thinking' : 'idle'}
                size={36}
              />
            )}
          </div>
        )}
        <div
          className={`rounded-lg px-3 py-2 max-w-[80%] text-sm leading-relaxed ${
            isUser
              ? 'bg-una-600/20 border border-una-500/30 text-una-50'
              : isSystem
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-100'
              : 'bg-slate-800/60 border border-slate-700/50 text-slate-100'
          }`}
        >
        {!isUser && !isSystem ? (
          <div className="break-words">
            {thinking && (
              <div className="mb-3 border border-amber-500/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => setThoughtExpanded(!thoughtExpanded)}
                  className="flex items-center gap-1.5 w-full px-2.5 py-1.5 bg-amber-500/10 text-amber-300/80 hover:bg-amber-500/15 text-[10px] font-mono uppercase tracking-wider"
                >
                  {thoughtExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="animate-pulse">🧠</span>
                  Рассуждение
                </button>
                {thoughtExpanded && (
                  <div className="px-2.5 py-2 bg-amber-500/5 text-amber-200/70 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {thinking}
                    {isStreaming && !(msg.content ?? '').includes('</think>') && (
                      <span className="inline-block w-1.5 h-3 bg-amber-400 ml-0.5 animate-pulse align-middle" />
                    )}
                  </div>
                )}
              </div>
            )}
            {answer ? (
              <MarkdownRenderer content={answer} />
            ) : isStreaming ? (
              <span className="text-slate-500 italic">подумаю...</span>
            ) : null}
            {isStreaming && answer && (
              <span className="inline-block w-2 h-4 bg-una-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        )}

        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2 border-t border-slate-700/50 pt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 hover:text-una-300 font-mono"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Wrench className="h-3 w-3" />
              Инструменты ({msg.toolCalls.length})
            </button>
            {expanded && (
              <div className="mt-2 space-y-1.5">
                {msg.toolCalls.map((tc: any, i: number) => (
                  <div key={i} className="bg-slate-950/60 border border-slate-700/40 rounded p-2 font-mono text-[10px]">
                    <div className={`font-bold ${tc.result?.success !== false ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tc.result?.success !== false ? '✓' : '✗'} {tc.name}
                    </div>
                    <div className="text-slate-400 mt-1 break-all">
                      args: {JSON.stringify(tc.args).slice(0, 200)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
