/**
 * Emotion Dashboard — панель эмоциональной истории.
 * Показывает график эмоций за неделю, текущее настроение.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { BrainIcon, SmileIcon, FrownIcon, HeartIcon } from '@/components/ui/animated-icons';

interface EmotionSummary {
  emotion: string;
  count: number;
  avg_intensity: number;
  last_occurrence: string;
}

interface EmotionPanelProps {
  // В реальной интеграции — через window.una.memory.getEmotionSummary()
  // Пока заглушка для UI
}

const EMOTION_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }> }> = {
  happy: { label: 'Радость', color: '#10B981', icon: SmileIcon },
  sad: { label: 'Грусть', color: '#6366F1', icon: FrownIcon },
  frustrated: { label: 'Раздражение', color: '#EF4444', icon: AlertCircle },
  excited: { label: 'Волнение', color: '#F59E0B', icon: HeartIcon },
  anxious: { label: 'Тревога', color: '#8B5CF6', icon: AlertCircle },
  calm: { label: 'Спокойствие', color: '#06B6D4', icon: SmileIcon },
  neutral: { label: 'Нейтрально', color: '#64748B', icon: BrainIcon },
};

export function EmotionPanel({}: EmotionPanelProps) {
  const [summary, setSummary] = useState<EmotionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // В реальной интеграции — IPC запрос к main process
    // const data = await window.una.memory.getEmotionSummary(7);
    // Пока показываем демо
    const demo: EmotionSummary[] = [
      { emotion: 'neutral', count: 15, avg_intensity: 0.3, last_occurrence: new Date().toISOString() },
      { emotion: 'happy', count: 8, avg_intensity: 0.7, last_occurrence: new Date().toISOString() },
      { emotion: 'frustrated', count: 3, avg_intensity: 0.6, last_occurrence: new Date().toISOString() },
      { emotion: 'sad', count: 1, avg_intensity: 0.8, last_occurrence: new Date().toISOString() },
    ];
    setSummary(demo);
    setLoading(false);
  }, []);

  const totalCount = summary.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <BrainIcon size={16} className="text-una-400" />
        <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Эмоции недели</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 text-xs py-8">Загрузка...</div>
        ) : summary.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-8">
            Пока нет данных об эмоциях.
            <br />
            Поговорите с U.N.A. — она запомнит ваше настроение.
          </div>
        ) : (
          <>
            {/* Общая статистика */}
            <div className="text-xs text-slate-400 mb-3">
              Всего взаимодействий за неделю: <span className="text-una-300 font-mono">{totalCount}</span>
            </div>

            {/* Бары эмоций */}
            {summary.map((e) => {
              const meta = EMOTION_META[e.emotion] || EMOTION_META.neutral;
              const Icon = meta.icon;
              const pct = totalCount > 0 ? (e.count / totalCount) * 100 : 0;
              return (
                <div key={e.emotion} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Icon size={12} style={{ color: meta.color }} />
                      <span className="text-slate-300">{meta.label}</span>
                    </div>
                    <span className="text-slate-500 font-mono">
                      {e.count} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-600">
                    Интенсивность: {(e.avg_intensity * 100).toFixed(0)}% · последний раз:{' '}
                    {new Date(e.last_occurrence).toLocaleDateString('ru-RU')}
                  </div>
                </div>
              );
            })}

            {/* Тренд */}
            <div className="mt-6 p-3 bg-slate-900/40 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-3 w-3 text-una-400" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                  Анализ U.N.A.
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {summary[0]?.emotion === 'happy' && 'Вы были в основном в хорошем настроении на этой неделе. Отлично!'}
                {summary[0]?.emotion === 'neutral' && 'Спокойная неделя. Равновесие — это хорошо.'}
                {summary[0]?.emotion === 'sad' && 'На этой неделе было трудновато. Позаботьтесь о себе.'}
                {summary[0]?.emotion === 'frustrated' && 'Много раздражения. Может, стоит отдохнуть?'}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-800/50 bg-slate-900/40 text-[10px] text-slate-500 font-mono">
        Эмоции анализируются локально, не уходят в облако
      </div>
    </div>
  );
}
