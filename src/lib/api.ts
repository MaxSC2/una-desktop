/**
 * Типы для IPC API Electron.
 * window.una — экспортированный API из preload.ts.
 */

export interface UNAApi {
  chat: {
    send: (text: string) => Promise<{
      reply: string;
      audio_base64: string | null;
      tool_calls: Array<{
        name: string;
        args: Record<string, unknown>;
        result: unknown;
        timestamp: string;
      }>;
      pending_confirmation: {
        token: string;
        action: string;
        risk: 'caution' | 'dangerous';
        details: string;
      } | null;
    }>;
    stream: (text: string) => Promise<{ ok: boolean; error?: string }>;
    confirm: (token: string, action?: string) => Promise<{ ok: boolean }>;
    stop: () => Promise<{ ok: boolean }>;
  };
  asr: {
    transcribe: (audioBase64: string) => Promise<string>;
  };
  tts: {
    synthesize: (text: string) => Promise<{ audio_base64: string; format: string }>;
  };
  system: {
    info: () => Promise<{ success: boolean; data?: any; error?: string }>;
  };
  files: {
    list: (path?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  };
  config: {
    get: () => Promise<any>;
    set: (cfg: any) => Promise<{ ok: boolean }>;
  };
  ollama: {
    check: () => Promise<{ available: boolean; models: string[] }>;
  };
  window: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    showOverlay: () => Promise<void>;
    hideOverlay: () => Promise<void>;
  };
  memory: {
    listFacts: () => Promise<Array<{ id: number; category: string; content: string; created_at: string; use_count: number }>>;
    deleteFact: (id: number) => Promise<{ ok: boolean }>;
  };
  reminders: {
    create: (text: string, triggerAt: string) => Promise<{ success: boolean; reminder?: any; error?: string }>;
    list: () => Promise<{ reminders: Array<{ id: number; text: string; trigger_at: string; created_at: string; done: number }> }>;
    delete: (id: number) => Promise<{ success: boolean }>;
  };
  onboarding: {
    save: (profile: {
      name: string;
      language: 'ru' | 'en' | 'kk';
      formality: 'formal' | 'informal';
      work_style: string;
      main_projects: string[];
      preferred_tone: 'concise' | 'detailed';
      proactive_mode: boolean;
      vision_enabled: boolean;
    }) => Promise<{ ok: boolean; profile?: any; error?: string }>;
    check: () => Promise<{ completed: boolean; profile: any }>;
    reset: () => Promise<{ ok: boolean }>;
  };
  data: {
    export: () => Promise<{ success: boolean; path?: string; error?: string }>;
    import: () => Promise<{ success: boolean; error?: string }>;
  };
  on: (channel: string, cb: (...args: any[]) => void) => () => void;
  shell: {
    open: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    una: UNAApi;
  }
}
