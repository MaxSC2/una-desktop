/**
 * Главный компонент U.N.A. — десктопный UI.
 *
 * Layout:
 *  - Header: имя, статус, кнопки
 *  - Left sidebar: Orb + быстрые действия
 *  - Center: активная панель (чат/файлы/память/настройки)
 *  - Right sidebar: переключатель панелей + информация
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Orb } from './components/Orb';
import { UnaAvatar } from './components/UnaAvatar';
import { OnboardingWizard } from './components/OnboardingWizard';
import { useStore } from './lib/store';
import { ChatPanel } from './components/ChatPanel';
import { FilesPanel } from './components/FilesPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { RemindersPanel } from './components/RemindersPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { EmotionPanel } from './components/EmotionPanel';
import { WorkPanel } from './components/WorkPanel';
import { MiniOverlay } from './components/MiniOverlay';
import { QuickPalette } from './components/QuickPalette';
import { useUNA } from './hooks/useUNA';
import { BotMessageSquareIcon, FoldersIcon, BrainIcon, CogIcon, MinimizeIcon, HeartIcon, BriefcaseBusinessIcon, BellIcon } from '@/components/ui/animated-icons';
import { useI18n } from './i18n';

const QUICK_ACTIONS = [
  { labelKey: 'quick.git' as const, prompt: 'Покажи статус всех моих git репозиториев: незакоммиченные файлы, последние коммиты' },
  { labelKey: 'quick.today' as const, prompt: 'Что я делал за ПК сегодня? Покажи недавно изменённые файлы' },
  { labelKey: 'quick.screen' as const, prompt: 'Опиши, что сейчас открыто на моём экране' },
  { labelKey: 'quick.processes' as const, prompt: 'Покажи топ-10 процессов по потреблению памяти' },
  { labelKey: 'quick.system' as const, prompt: 'Покажи информацию о системе: CPU, память, диск' },
  { labelKey: 'quick.files' as const, prompt: 'Найди все файлы .ts в моей домашней папке' },
];

export default function App() {
  const [isOverlay] = useState(() => window.location.hash === '#/overlay');

  // Overlay mode — отдельное маленькое окно (480x200, alwaysOnTop)
  if (isOverlay) {
    return <MiniOverlay />;
  }

  const activePanel = useStore((s) => s.activePanel);
  const setActivePanel = useStore((s) => s.setActivePanel);
  const status = useStore((s) => s.status);
  const currentEmotion = useStore((s) => s.currentEmotion);
  const [showPalette, setShowPalette] = useState(false);
  const { sendMessage } = useUNA();
  const { t } = useI18n();

  // Глобальный hotkey для Quick Palette (Ctrl+Shift+U)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'U') {
        e.preventDefault();
        setShowPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const busy = status === 'thinking' || status === 'executing';
  const onboardingCompleted = useStore((s) => s.onboardingCompleted);

  // Если onboarding не пройден — показываем wizard
  if (!onboardingCompleted) {
    return <OnboardingWizard />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Декоративный фон */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(34,211,238,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.06) 0%, transparent 50%)',
        }}
      />

      {/* Header */}
      <header className="relative flex items-center justify-between px-4 py-2 border-b border-una-500/20 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-una-400 to-accent-500 flex items-center justify-center">
            <div className="absolute inset-0.5 rounded-full bg-slate-950 flex items-center justify-center">
              <span className="text-xs font-mono font-bold text-una-300">U</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-sm tracking-[0.3em] text-una-300 uppercase">U.N.A.</div>
            <div className="text-[9px] text-slate-500 font-mono">{t('app.subtitle')}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'idle' ? 'bg-emerald-400' : 'bg-una-400 animate-pulse'
              }`}
            />
            {status === 'idle' ? t('status.online') : status.toUpperCase()}
          </div>
          <button
            onClick={() => window.una.window.hide()}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
            title={t('header.minimize')}
          >
            <MinimizeIcon size={16} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex-1 flex gap-3 p-3 overflow-hidden">
        {/* Left: Orb + Quick actions */}
        <aside className="flex flex-col gap-3 w-[280px] shrink-0">
          <div className="flex flex-col items-center rounded-lg bg-slate-950/60 border border-una-500/20 p-5">
            <UnaAvatar emotion={currentEmotion} status={status} size={200} />
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-una-500/20 p-3 flex-1 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-2">
              {t('quick.title')}
            </div>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.labelKey}
                  disabled={busy}
                  onClick={() => sendMessage(a.prompt)}
                  className="w-full text-left text-xs font-mono text-slate-300 hover:text-una-200 hover:bg-una-500/10 rounded px-2 py-1.5 border border-transparent hover:border-una-500/30 disabled:opacity-50"
                >
                  {t(a.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: Active panel */}
        <section className="flex-1 min-w-0">
          {activePanel === 'chat' && <ChatPanel />}
          {activePanel === 'files' && <FilesPanel />}
          {activePanel === 'memory' && <MemoryPanel />}
          {activePanel === 'emotions' && <EmotionPanel />}
          {activePanel === 'work' && <WorkPanel />}
          {activePanel === 'reminders' && <RemindersPanel />}
          {activePanel === 'settings' && <SettingsPanel />}
        </section>

        {/* Right: Tabs */}
        <aside className="w-[180px] shrink-0">
          <div className="flex flex-col gap-1.5">
            <TabButton
              active={activePanel === 'chat'}
              onClick={() => setActivePanel('chat')}
              icon={<BotMessageSquareIcon size={16} />}
              label={t('tabs.chat')}
            />
            <TabButton
              active={activePanel === 'files'}
              onClick={() => setActivePanel('files')}
              icon={<FoldersIcon size={16} />}
              label={t('tabs.files')}
            />
            <TabButton
              active={activePanel === 'memory'}
              onClick={() => setActivePanel('memory')}
              icon={<BrainIcon size={16} />}
              label={t('tabs.memory')}
            />
            <TabButton
              active={activePanel === 'emotions'}
              onClick={() => setActivePanel('emotions')}
              icon={<HeartIcon size={16} />}
              label={t('tabs.emotions')}
            />
            <TabButton
              active={activePanel === 'work'}
              onClick={() => setActivePanel('work')}
              icon={<BriefcaseBusinessIcon size={16} />}
              label={t('tabs.work')}
            />
            <TabButton
              active={activePanel === 'reminders'}
              onClick={() => setActivePanel('reminders')}
              icon={<BellIcon size={16} />}
              label={t('tabs.reminders')}
            />
            <TabButton
              active={activePanel === 'settings'}
              onClick={() => setActivePanel('settings')}
              icon={<CogIcon size={16} />}
              label={t('tabs.settings')}
            />
          </div>

          <div className="mt-4 rounded-lg bg-slate-950/60 border border-una-500/20 p-3 text-[11px] font-mono text-slate-400">
            <div className="text-una-300 uppercase tracking-wider mb-2">{t('hotkey.title')}</div>
            <div className="text-slate-300">Ctrl+Shift+Space</div>
            <div className="text-slate-600 mt-1">— {t('hotkey.openOverlay')}</div>
            <div className="mt-3 text-una-300 uppercase tracking-wider mb-2">{t('tray.title')}</div>
            <div className="text-slate-600">{t('tray.description')}</div>
          </div>
        </aside>
      </main>

      <ConfirmationDialog />

      {/* Mini Overlay — U.N.A. в фоне, доступна одним кликом */}
      <MiniOverlay />

      {/* Quick Command Palette — Ctrl+Shift+U */}
      {showPalette && <QuickPalette onClose={() => setShowPalette(false)} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const iconWithFullHitArea = icon && typeof icon === 'object' && 'type' in icon
    ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
        className: 'absolute inset-0 w-full h-full [&>svg]:pointer-events-none',
      })
    : icon;

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-mono transition-colors ${
        active
          ? 'bg-una-500/20 text-una-300 border border-una-500/40'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
      }`}
    >
      <span className="relative z-10 flex items-center gap-2.5">
        <span className="relative">{icon}</span>
        {label}
      </span>
      <span className="absolute inset-0" children={iconWithFullHitArea} />
    </button>
  );
}
