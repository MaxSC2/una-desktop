/**
 * Панель настроек — конфигурация LLM, ASR, TTS.
 */

'use client';

import { useEffect, useState } from 'react';
import { Settings, Cpu, Mic, Volume2, Keyboard, Check, X, Cat, Download, Upload } from 'lucide-react';
import { useStore } from '../lib/store';

export function SettingsPanel() {
  const [config, setConfig] = useState<any>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean; models: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, []);

  const loadConfig = async () => {
    const cfg = await window.una.config.get();
    setConfig(cfg);
    const status = await window.una.ollama.check();
    setOllamaStatus(status);
  };

  const save = async () => {
    setSaving(true);
    await window.una.config.set(config);
    setSaving(false);
  };

  if (!config) return <div className="p-4 text-slate-500">Загрузка...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-950/60 border border-una-500/20 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-una-500/20 bg-slate-900/60">
        <Settings className="h-4 w-4 text-una-400" />
        <h2 className="text-xs font-mono uppercase tracking-wider text-una-300">Настройки</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* LLM */}
        <Section icon={<Cpu className="h-4 w-4" />} title="LLM (языковая модель)">
          <Field label="Режим">
            <select
              value={config.llm.provider}
              onChange={(e) => setConfig({ ...config, llm: { ...config.llm, provider: e.target.value } })}
              className="bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200"
            >
              <option value="auto">Авто (локально если есть, иначе облако)</option>
              <option value="local">Только локальный (Ollama)</option>
              <option value="cloud">Только облачный (Z.ai)</option>
            </select>
          </Field>
          <Field label="URL Ollama">
            <input
              type="text"
              value={config.llm.localUrl}
              onChange={(e) => setConfig({ ...config, llm: { ...config.llm, localUrl: e.target.value } })}
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <Field label="Локальная модель">
            <select
              value={config.llm.localModel}
              onChange={(e) => setConfig({ ...config, llm: { ...config.llm, localModel: e.target.value } })}
              className="bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 w-full"
            >
              <option value="qwen2.5:3b-instruct-q4_K_M">qwen2.5:3b (рекомендуется для 4ГБ VRAM)</option>
              <option value="llama3.2:3b">llama3.2:3b</option>
              <option value="phi3:mini">phi3:mini (самая лёгкая)</option>
              <option value="qwen2.5:7b-instruct-q4_K_M">qwen2.5:7b (если VRAM больше 6ГБ)</option>
              {ollamaStatus?.available &&
                ollamaStatus.models.map((m) => (
                  <option key={m} value={m}>
                    {m} (установлена)
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Cloud API Key">
            <input
              type="password"
              value={config.llm.cloudApiKey}
              onChange={(e) => setConfig({ ...config, llm: { ...config.llm, cloudApiKey: e.target.value } })}
              placeholder="ZAI API ключ"
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <div className="text-xs">
            Ollama: {ollamaStatus?.available ? (
              <span className="text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" /> доступен, моделей: {ollamaStatus.models.length}</span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1"><X className="h-3 w-3" /> недоступен</span>
            )}
          </div>
        </Section>

        {/* ASR */}
        <Section icon={<Mic className="h-4 w-4" />} title="ASR (распознавание речи)">
          <Field label="Режим">
            <select
              value={config.asr.provider}
              onChange={(e) => setConfig({ ...config, asr: { ...config.asr, provider: e.target.value } })}
              className="bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200"
            >
              <option value="auto">Авто</option>
              <option value="local">Локально (whisper.cpp)</option>
              <option value="cloud">Облако (Z.ai ASR)</option>
            </select>
          </Field>
          <Field label="Путь к whisper.cpp">
            <input
              type="text"
              value={config.asr.whisperPath}
              onChange={(e) => setConfig({ ...config, asr: { ...config.asr, whisperPath: e.target.value } })}
              placeholder="C:\whisper.cpp\main.exe"
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <Field label="Путь к модели">
            <input
              type="text"
              value={config.asr.modelPath}
              onChange={(e) => setConfig({ ...config, asr: { ...config.asr, modelPath: e.target.value } })}
              placeholder="C:\whisper.cpp\models\ggml-small.bin"
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <div className="text-[11px] text-slate-500">
            Рекомендуется модель <code className="text-una-300">small</code> для русского (≈500 МБ VRAM).
          </div>
        </Section>

        {/* TTS */}
        <Section icon={<Volume2 className="h-4 w-4" />} title="TTS (синтез речи)">
          <Field label="Режим">
            <select
              value={config.tts.provider}
              onChange={(e) => setConfig({ ...config, tts: { ...config.tts, provider: e.target.value } })}
              className="bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200"
            >
              <option value="auto">Авто</option>
              <option value="local">Локально (Piper)</option>
              <option value="cloud">Облако (Z.ai TTS)</option>
            </select>
          </Field>
          <Field label="Путь к Piper">
            <input
              type="text"
              value={config.tts.piperPath}
              onChange={(e) => setConfig({ ...config, tts: { ...config.tts, piperPath: e.target.value } })}
              placeholder="C:\piper\piper.exe"
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <Field label="Голос Piper (.onnx)">
            <input
              type="text"
              value={config.tts.voicePath}
              onChange={(e) => setConfig({ ...config, tts: { ...config.tts, voicePath: e.target.value } })}
              placeholder="C:\piper\ru_RU-irina-medium.onnx"
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <Field label="Облачный голос">
            <select
              value={config.tts.cloudVoice}
              onChange={(e) => setConfig({ ...config, tts: { ...config.tts, cloudVoice: e.target.value } })}
              className="bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200"
            >
              <option value="nova">Nova (женский, по умолчанию)</option>
              <option value="shimmer">Shimmer (женский мягкий)</option>
              <option value="echo">Echo (мужской)</option>
            </select>
          </Field>
        </Section>

        {/* Маскот */}
        <Section icon={<Cat className="h-4 w-4" />} title="Маскот">
          <Field label="Анимация">
            <div className="flex items-center gap-3">
              <span className={`text-sm ${!useStore.getState().useRiveMascot ? 'text-una-300' : 'text-slate-500'}`}>
                Пиксельный
              </span>
              <button
                onClick={() => {
                  const store = useStore.getState();
                  store.setUseRiveMascot(!store.useRiveMascot);
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  useStore.getState().useRiveMascot ? 'bg-una-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    useStore.getState().useRiveMascot ? 'translate-x-5' : ''
                  }`}
                />
              </button>
              <span className={`text-sm ${useStore.getState().useRiveMascot ? 'text-una-300' : 'text-slate-500'}`}>
                Rive 3D
              </span>
            </div>
          </Field>
          <div className="text-[11px] text-slate-500">
            Rive: положи <code className="text-una-300">una-mascot.riv</code> в <code className="text-una-300">public/</code>
          </div>
        </Section>

        {/* Прочее */}
        <Section icon={<Keyboard className="h-4 w-4" />} title="Прочее">
          <Field label="Горячая клавиша (overlay)">
            <input
              type="text"
              value={config.hotkey}
              onChange={(e) => setConfig({ ...config, hotkey: e.target.value })}
              className="w-full bg-slate-950 border border-una-500/30 rounded px-2 py-1 text-sm text-slate-200 font-mono"
            />
          </Field>
          <Field label="Запускать свёрнутой">
            <input
              type="checkbox"
              checked={config.startMinimized}
              onChange={(e) => setConfig({ ...config, startMinimized: e.target.checked })}
              className="ml-2"
            />
            <span className="text-sm text-slate-400 ml-2">Только в tray</span>
          </Field>
        </Section>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-una-600 hover:bg-una-500 disabled:opacity-50 text-white py-2 rounded-lg font-mono text-sm"
        >
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>

        <div className="border-t border-slate-800 pt-3 mt-3">
          <button
            onClick={async () => {
              if (confirm('Сбросить профиль и пройти онбординг заново?')) {
                await window.una.onboarding.reset();
                window.location.reload();
              }
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg font-mono text-sm"
          >
            Пройти онбординг заново
          </button>
        </div>

        {/* Backup */}
        <Section icon={<Download className="h-4 w-4" />} title="Резервное копирование">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                const result = await window.una.data.export();
                if (result.success) {
                  alert(`✅ Бэкап сохранён:\n${result.path}`);
                } else if (result.error !== 'Отменено пользователем') {
                  alert(`❌ Ошибка: ${result.error}`);
                }
              }}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm"
            >
              <Download className="h-4 w-4" />
              Экспорт
            </button>
            <button
              onClick={async () => {
                if (!confirm('Импорт заменит все текущие данные U.N.A. (диалоги, факты, настройки). Продолжить?')) return;
                const result = await window.una.data.import();
                if (result.success) {
                  alert('✅ Данные восстановлены. Приложение будет перезагружено.');
                  window.location.reload();
                } else if (result.error !== 'Отменено пользователем') {
                  alert(`❌ Ошибка: ${result.error}`);
                }
              }}
              className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg text-sm"
            >
              <Upload className="h-4 w-4" />
              Импорт
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            Экспорт: все диалоги, факты, эмоции и настройки в .json
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex items-center gap-2 mb-3 text-una-400">
        {icon}
        <h3 className="text-[11px] font-mono uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block mb-1">{label}</label>
      {children}
    </div>
  );
}
