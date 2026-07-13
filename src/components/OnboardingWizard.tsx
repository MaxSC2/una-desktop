/**
 * Onboarding Wizard — мастер первого запуска U.N.A.
 *
 * 5 шагов:
 * 1. Приветствие
 * 2. Как обращаться (имя, формальность)
 * 3. Чем занимаетесь (work_style, projects)
 * 4. Настройки ответов (tone, language)
 * 5. Приватность (proactive, vision) + завершение
 */

'use client';

import { useState, useEffect } from 'react';
import { useStore, UserProfile } from '../lib/store';
import { UnaAvatar } from './UnaAvatar';
import { ChevronLeft } from 'lucide-react';
import { CheckIcon, ChevronRightIcon, SparklesIcon, EyeIcon, BellIcon } from '@/components/ui/animated-icons';

const STEPS = [
  { id: 0, title: 'Приветствие', icon: SparklesIcon },
  { id: 1, title: 'Как обращаться', icon: CheckIcon },
  { id: 2, title: 'Чем занимаетесь', icon: CheckIcon },
  { id: 3, title: 'Настройки ответов', icon: CheckIcon },
  { id: 4, title: 'Приватность', icon: CheckIcon },
];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    name: '',
    language: 'ru',
    formality: 'informal',
    work_style: 'coder',
    main_projects: [],
    preferred_tone: 'concise',
    proactive_mode: true,
    vision_enabled: false,
  });
  const [projectInput, setProjectInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);
  const setUserProfile = useStore((s) => s.setUserProfile);

  // При монтировании проверяем, может onboarding уже пройден
  useEffect(() => {
    (async () => {
      try {
        const check = await window.una.onboarding.check();
        if (check.completed && check.profile) {
          setOnboardingCompleted(true);
          setUserProfile(check.profile as UserProfile);
        }
      } catch (e) {
        // ignore — onboarding покажется
      }
    })();
  }, [setOnboardingCompleted, setUserProfile]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const addProject = () => {
    const p = projectInput.trim();
    if (p && !profile.main_projects?.includes(p)) {
      setProfile({ ...profile, main_projects: [...(profile.main_projects ?? []), p] });
      setProjectInput('');
    }
  };

  const removeProject = (p: string) => {
    setProfile({ ...profile, main_projects: (profile.main_projects ?? []).filter((x) => x !== p) });
  };

  const finish = async () => {
    if (!profile.name?.trim()) {
      setError('Введите имя');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await window.una.onboarding.save(profile as UserProfile);
      if (result.ok) {
        setOnboardingCompleted(true);
        setUserProfile(profile as UserProfile);
      } else {
        setError(result.error ?? 'Не удалось сохранить');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return (profile.name?.trim().length ?? 0) > 0;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-una-500/30 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header с прогрессом */}
        <div className="border-b border-una-500/20 px-6 py-4 bg-slate-950/40">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12">
              <UnaAvatar emotion="happy" status="idle" size={48} />
            </div>
            <div>
              <h1 className="text-lg font-mono text-una-300">U.N.A. — привет!</h1>
              <p className="text-xs text-slate-500">Давай познакомимся — это займёт минуту</p>
            </div>
          </div>
          {/* Прогресс-бар */}
          <div className="flex gap-1.5">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  s.id <= step ? 'bg-una-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-600 font-mono">
            <span>Шаг {step + 1} из {STEPS.length}</span>
            <span>{STEPS[step].title}</span>
          </div>
        </div>

        {/* Контент шага */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-una-100">
                Привет! Я U.N.A.
              </h2>
              <p className="text-slate-300 leading-relaxed">
                Я — твой персональный AI-компаньон. Помогу с кодом, файлами, поиском в интернете,
                напоминаниями и просто поболтаю когда скучно.
              </p>
              <p className="text-slate-400 leading-relaxed">
                Но сначала давай познакомимся. Я задам несколько вопросов, чтобы сразу работать
                так, как тебе удобно — без долгой настройки.
              </p>
              <div className="bg-una-500/10 border border-una-500/30 rounded-lg p-3 text-sm text-una-100">
                <strong>Что я умею:</strong>
                <ul className="mt-2 space-y-1 text-slate-300 text-xs">
                  <li>• 19 инструментов: файлы, код, веб, поиск, выполнение JS/TS</li>
                  <li>• Streaming-ответы (печатаю по слову, а не жду весь ответ)</li>
                  <li>• Память: помню факты о тебе и твоих проектах</li>
                  <li>• Голос: могу говорить и слушать</li>
                  <li>• Безопасность: все опасные операции требуют подтверждения</li>
                </ul>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  Как тебя зовут?
                </label>
                <input
                  type="text"
                  value={profile.name ?? ''}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="Например: Алексей"
                  autoFocus
                  className="w-full bg-slate-950/60 border border-una-500/30 rounded-lg px-4 py-3 text-una-50 placeholder:text-slate-600 focus:outline-none focus:border-una-400 font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Я буду использовать это имя для обращения
                </p>
              </div>

              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  На "ты" или на "вы"?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setProfile({ ...profile, formality: 'informal' })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      profile.formality === 'informal'
                        ? 'border-una-400 bg-una-500/20 text-una-100'
                        : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                    }`}
                  >
                    <div className="font-mono text-sm">На "ты"</div>
                    <div className="text-xs text-slate-500 mt-1">Дружески, неформально</div>
                  </button>
                  <button
                    onClick={() => setProfile({ ...profile, formality: 'formal' })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      profile.formality === 'formal'
                        ? 'border-una-400 bg-una-500/20 text-una-100'
                        : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                    }`}
                  >
                    <div className="font-mono text-sm">На "вы"</div>
                    <div className="text-xs text-slate-500 mt-1">Уважительно, формально</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  Язык общения
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: 'ru', label: 'Русский' },
                    { val: 'en', label: 'English' },
                    { val: 'kk', label: 'Қазақша' },
                  ] as const).map((lang) => (
                    <button
                      key={lang.val}
                      onClick={() => setProfile({ ...profile, language: lang.val })}
                      className={`p-2 rounded-lg border text-center text-sm transition-colors ${
                        profile.language === lang.val
                          ? 'border-una-400 bg-una-500/20 text-una-100'
                          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  Чем ты занимаешься?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { val: 'coder', label: '💻 Программирую', desc: 'Код, разработка, IT' },
                    { val: 'writer', label: '✍️ Пишу', desc: 'Тексты, статьи, контент' },
                    { val: 'student', label: '🎓 Учусь', desc: 'Учеба, исследования' },
                    { val: 'manager', label: '📊 Управляю', desc: 'Проекты, команды' },
                    { val: 'designer', label: '🎨 Дизайню', desc: 'UI/UX, графика' },
                    { val: 'other', label: '⭐ Другое', desc: 'Что-то уникальное' },
                  ] as const).map((ws) => (
                    <button
                      key={ws.val}
                      onClick={() => setProfile({ ...profile, work_style: ws.val })}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        profile.work_style === ws.val
                          ? 'border-una-400 bg-una-500/20 text-una-100'
                          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                      }`}
                    >
                      <div className="font-mono text-sm">{ws.label}</div>
                      <div className="text-xs text-slate-500 mt-1">{ws.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  Над какими проектами работаешь? (опционально)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectInput}
                    onChange={(e) => setProjectInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addProject();
                      }
                    }}
                    placeholder="Название проекта и Enter"
                    className="flex-1 bg-slate-950/60 border border-una-500/30 rounded-lg px-3 py-2 text-una-50 placeholder:text-slate-600 focus:outline-none focus:border-una-400 font-mono text-sm"
                  />
                  <button
                    onClick={addProject}
                    className="bg-una-600 hover:bg-una-500 text-white px-4 rounded-lg text-sm"
                  >
                    Добавить
                  </button>
                </div>
                {profile.main_projects && profile.main_projects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {profile.main_projects.map((p) => (
                      <span
                        key={p}
                        className="bg-una-500/20 border border-una-500/40 text-una-100 px-2 py-1 rounded text-xs font-mono flex items-center gap-1"
                      >
                        {p}
                        <button
                          onClick={() => removeProject(p)}
                          className="text-una-400 hover:text-rose-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  Я запомню это и буду учитывать контекст
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-mono text-una-300 mb-2">
                  Как предпочитаешь ответы?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setProfile({ ...profile, preferred_tone: 'concise' })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      profile.preferred_tone === 'concise'
                        ? 'border-una-400 bg-una-500/20 text-una-100'
                        : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                    }`}
                  >
                    <div className="font-mono text-sm">📄 Краткие</div>
                    <div className="text-xs text-slate-500 mt-1">1-2 предложения, по делу</div>
                  </button>
                  <button
                    onClick={() => setProfile({ ...profile, preferred_tone: 'detailed' })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      profile.preferred_tone === 'detailed'
                        ? 'border-una-400 bg-una-500/20 text-una-100'
                        : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-una-500/50'
                    }`}
                  >
                    <div className="font-mono text-sm">📚 Развёрнутые</div>
                    <div className="text-xs text-slate-500 mt-1">С пояснениями и контекстом</div>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950/40 border border-slate-700/50 rounded-lg p-4">
                <div className="text-xs font-mono text-slate-500 mb-2">Пример:</div>
                <div className="text-sm text-slate-300">
                  {profile.preferred_tone === 'concise' ? (
                    <>
                      <strong>Ты:</strong> Что такое JWT?<br/>
                      <strong>U.N.A.:</strong> JWT (JSON Web Token) — стандарт для аутентификации.
                      Состоит из header, payload, signature. Подписывается секретом, передаётся в
                      Authorization header.
                    </>
                  ) : (
                    <>
                      <strong>Ты:</strong> Что такое JWT?<br/>
                      <strong>U.N.A.:</strong> JWT (JSON Web Token) — это открытый стандарт (RFC 7519)
                      для безопасной передачи информации между сторонами в виде JSON-объекта...
                      <span className="text-slate-500"> (далее 3 абзаца с подробностями)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="bg-una-500/10 border border-una-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <BellIcon size={20} className="text-una-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-una-100">Proactive mode</div>
                        <div className="text-xs text-slate-400 mt-1">
                          Я могу сама предлагать помощь, напоминать о перерывах,
                          замечать ошибки на экране
                        </div>
                      </div>
                      <button
                        onClick={() => setProfile({ ...profile, proactive_mode: !profile.proactive_mode })}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          profile.proactive_mode ? 'bg-una-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                            profile.proactive_mode ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/40 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <EyeIcon size={20} className="text-slate-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-sm text-slate-100">Зрение экрана</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Я могу видеть твой экран (по таймеру) и предлагать помощь
                          когда вижу ошибки. Все скриншоты остаются локально.
                        </div>
                      </div>
                      <button
                        onClick={() => setProfile({ ...profile, vision_enabled: !profile.vision_enabled })}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          profile.vision_enabled ? 'bg-una-500' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                            profile.vision_enabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
                {!profile.vision_enabled && (
                  <p className="text-xs text-slate-500 mt-2 ml-8">
                    ✓ Можно включить позже в настройках
                  </p>
                )}
              </div>

              <div className="text-center text-slate-400 text-sm pt-2">
                Всё готово! Нажми "Завершить" — и я запомню твои настройки.
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer с кнопками */}
        <div className="border-t border-una-500/20 px-6 py-4 bg-slate-950/40 flex items-center justify-between">
          <button
            onClick={prev}
            disabled={step === 0 || saving}
            className="flex items-center gap-1 text-slate-400 hover:text-una-300 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Назад
          </button>

          <div className="text-xs text-slate-600 font-mono">
            Все данные хранятся локально
          </div>

          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              disabled={!canProceed() || saving}
              className="flex items-center gap-1 bg-una-600 hover:bg-una-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              Далее
              <ChevronRightIcon size={16} />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving || !canProceed()}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
            >
              {saving ? 'Сохраняю...' : 'Завершить'}
              <CheckIcon size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
