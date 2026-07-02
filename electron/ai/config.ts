/**
 * Unified Configuration Store — единая точка конфигурации U.N.A.
 *
 * Заменяет 5 отдельных electron-store инстансов:
 *  - main.ts: main store (conversationId, hotkey, onboarding, userProfile)
 *  - llm.ts: LLM config
 *  - tts.ts: TTS config
 *  - asr.ts: ASR config
 *  - store.ts: memory config
 *
 * Все настройки в одном JSON файле: config.json в userData.
 * Нет race conditions, нет 5 файлов, нет 5 инстансов.
 */

import Store from 'electron-store';
import type { LLMConfig } from '../ai/llm';
import type { TTSConfig } from '../ai/tts';
import type { ASRConfig } from '../ai/asr';

// ============================================================
// TYPES
// ============================================================

export interface UserProfile {
  name: string;
  language: 'ru' | 'en' | 'kk';
  formality: 'formal' | 'informal';
  work_style: string;
  main_projects: string[];
  preferred_tone: 'concise' | 'detailed';
  proactive_mode: boolean;
  vision_enabled: boolean;
}

export interface MemoryConfig {
  maxWorkingMessages: number;
  maxFacts: number;
}

export interface UNAConfig {
  // Main
  currentConversationId: number | null;
  confirmedTokens: string[];
  hotkey: string;
  startMinimized: boolean;

  // Onboarding
  onboardingCompleted: boolean;
  userProfile: Record<string, unknown> | null;

  // LLM
  llm: LLMConfig;

  // TTS
  tts: TTSConfig;

  // ASR
  asr: ASRConfig;

  // Memory
  memory: MemoryConfig;

  // Telegram
  telegramBotToken: string;
}

// ============================================================
// DEFAULTS
// ============================================================

export const DEFAULT_CONFIG: UNAConfig = {
  currentConversationId: null,
  confirmedTokens: [],
  hotkey: 'CommandOrControl+Shift+Space',
  startMinimized: false,

  onboardingCompleted: false,
  userProfile: null,

  llm: {
    provider: 'auto',
    localUrl: 'http://localhost:11434',
    localModel: 'qwen3:4b',
    cloudApiKey: process.env.ZAI_API_KEY ?? '',
    cloudModel: 'glm-4.6',
    cloudBaseUrl: 'https://api.z.ai/api/paas/v4',
    temperature: 0.6,
    maxTokens: 2048,
  },

  tts: {
    provider: 'auto',
    piperPath: '',
    voicePath: '',
    cloudApiKey: process.env.ZAI_API_KEY ?? '',
    cloudVoice: 'nova',
  },

  asr: {
    provider: 'auto',
    whisperPath: '',
    modelPath: '',
    language: 'ru',
    cloudApiKey: process.env.ZAI_API_KEY ?? '',
  },

  memory: {
    maxWorkingMessages: 20,
    maxFacts: 1000,
  },

  telegramBotToken: '',
};

// ============================================================
// SINGLE STORE INSTANCE
// ============================================================

let _store: Store<UNAConfig> | null = null;

export function getConfigStore(): Store<UNAConfig> {
  if (_store) return _store;

  _store = new Store<UNAConfig>({
    name: 'config',
    defaults: DEFAULT_CONFIG,
  });

  return _store;
}

// ============================================================
// CONVENIENCE GETTERS / SETTERS
// ============================================================

export function getConfig(): UNAConfig {
  return getConfigStore().store;
}

export function setConfig(patch: Partial<UNAConfig>): void {
  const store = getConfigStore();
  for (const [key, value] of Object.entries(patch)) {
    store.set(key as keyof UNAConfig, value);
  }
}

// LLM
export function getLLMConfig(): LLMConfig {
  return getConfigStore().get('llm');
}

export function setLLMConfig(patch: Partial<LLMConfig>): void {
  const store = getConfigStore();
  store.set('llm', { ...store.get('llm'), ...patch });
}

// TTS
export function getTTSConfig(): TTSConfig {
  return getConfigStore().get('tts');
}

export function setTTSConfig(patch: Partial<TTSConfig>): void {
  const store = getConfigStore();
  store.set('tts', { ...store.get('tts'), ...patch });
}

// ASR
export function getASRConfig(): ASRConfig {
  return getConfigStore().get('asr');
}

export function setASRConfig(patch: Partial<ASRConfig>): void {
  const store = getConfigStore();
  store.set('asr', { ...store.get('asr'), ...patch });
}

// Memory
export function getMemoryConfig(): MemoryConfig {
  return getConfigStore().get('memory');
}

export function setMemoryConfig(patch: Partial<MemoryConfig>): void {
  const store = getConfigStore();
  store.set('memory', { ...store.get('memory'), ...patch });
}

// Onboarding
export function getOnboardingCompleted(): boolean {
  return getConfigStore().get('onboardingCompleted');
}

export function setOnboardingCompleted(value: boolean): void {
  getConfigStore().set('onboardingCompleted', value);
}

export function getUserProfile(): Record<string, unknown> | null {
  return getConfigStore().get('userProfile');
}

export function setUserProfile(profile: Record<string, unknown>): void {
  getConfigStore().set('userProfile', profile);
}

// Main
export function getConfirmedTokens(): string[] {
  return getConfigStore().get('confirmedTokens');
}

export function addConfirmedToken(token: string): void {
  const tokens = getConfigStore().get('confirmedTokens');
  if (!tokens.includes(token)) {
    getConfigStore().set('confirmedTokens', [...tokens, token]);
  }
}

export function getCurrentConversationId(): number | null {
  return getConfigStore().get('currentConversationId');
}

// Telegram
export function getTelegramToken(): string {
  return getConfigStore().get('telegramBotToken');
}

export function setTelegramToken(token: string): void {
  getConfigStore().set('telegramBotToken', token);
}

export function setCurrentConversationId(id: number | null): void {
  getConfigStore().set('currentConversationId', id);
}
