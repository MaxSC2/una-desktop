/**
 * Preload скрипт — мост между рендерером (React) и main process (Node).
 *
 * Безопасный API: рендерер не имеет прямого доступа к Node.js,
 * только через явно экспортированные методы.
 */

import { contextBridge, ipcRenderer } from 'electron';

const UNA_API = {
  // Чат
  chat: {
    send: (text: string) => ipcRenderer.invoke('chat:send', text),
    stream: (text: string) => ipcRenderer.invoke('chat:stream', text),
    confirm: (token: string) => ipcRenderer.invoke('chat:confirm', token),
    stop: () => ipcRenderer.invoke('chat:stop'),
  },
  // Речь
  asr: {
    transcribe: (audioBase64: string) => ipcRenderer.invoke('asr:transcribe', audioBase64),
  },
  tts: {
    synthesize: (text: string) => ipcRenderer.invoke('tts:synthesize', text),
  },
  // Система
  system: {
    info: () => ipcRenderer.invoke('system:info'),
  },
  files: {
    list: (path?: string) => ipcRenderer.invoke('files:list', path),
  },
  // Конфиг
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (cfg: any) => ipcRenderer.invoke('config:set', cfg),
  },
  ollama: {
    check: () => ipcRenderer.invoke('ollama:check'),
  },
  // Окна
  window: {
    show: () => ipcRenderer.invoke('window:show'),
    hide: () => ipcRenderer.invoke('window:hide'),
    showOverlay: () => ipcRenderer.invoke('overlay:show'),
    hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  },
  // Память
  memory: {
    listFacts: () => ipcRenderer.invoke('memory:list-facts'),
    deleteFact: (id: number) => ipcRenderer.invoke('memory:delete-fact', id),
  },
  // Onboarding
  onboarding: {
    save: (profile: any) => ipcRenderer.invoke('onboarding:save', profile),
    check: () => ipcRenderer.invoke('onboarding:check'),
    reset: () => ipcRenderer.invoke('onboarding:reset'),
  },
  // События от main
  on: (channel: string, cb: (...args: any[]) => void) => {
    const validChannels = ['overlay:start-listening', 'chat:chunk', 'chat:stream-end', 'chat:stream-error', 'reminder:fire', 'update:available', 'update:not-available', 'update:downloaded'];
    if (validChannels.includes(channel)) {
      const listener = (_e: unknown, ...args: any[]) => cb(...args);
      ipcRenderer.on(channel, listener);
      // Возвращаем функцию отписки
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },
  // Data backup
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
  },
  // Reminders
  reminders: {
    create: (text: string, triggerAt: string) => ipcRenderer.invoke('reminders:create', text, triggerAt),
    list: () => ipcRenderer.invoke('reminders:list'),
    delete: (id: number) => ipcRenderer.invoke('reminders:delete', id),
  },
  // Auto-update
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
  },
  // Прочее
  shell: {
    open: (url: string) => ipcRenderer.invoke('shell:open', url),
  },
};

contextBridge.exposeInMainWorld('una', UNA_API);

// Типы для TypeScript (для рендерера)
export type UNAApi = typeof UNA_API;
