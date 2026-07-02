/**
 * Глобальный store Zustand для UI.
 */

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    timestamp: string;
  }>;
  audio_base64?: string | null;
}

export interface PendingConfirmation {
  token: string;
  action: string;
  risk: 'caution' | 'dangerous';
  details: string;
}

export type AssistantStatus =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'listening'
  | 'executing'
  | 'awaiting_confirmation';

export type CurrentEmotion = 'neutral' | 'happy' | 'sad' | 'frustrated' | 'excited' | 'anxious' | 'thinking';

export type Panel = 'chat' | 'files' | 'memory' | 'reminders' | 'emotions' | 'work' | 'settings';

interface UNAState {
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateLastAssistant: (patch: Partial<ChatMessage>) => void;
  updateMessageById: (id: string, patch: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, textDelta: string) => void;
  clearMessages: () => void;

  status: AssistantStatus;
  setStatus: (s: AssistantStatus) => void;

  currentEmotion: CurrentEmotion;
  setCurrentEmotion: (e: CurrentEmotion) => void;

  pendingConfirmation: PendingConfirmation | null;
  setPendingConfirmation: (c: PendingConfirmation | null) => void;

  activePanel: Panel;
  setActivePanel: (p: Panel) => void;

  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;

  streamingEnabled: boolean;
  setStreamingEnabled: (v: boolean) => void;

  onboardingCompleted: boolean;
  setOnboardingCompleted: (v: boolean) => void;

  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile) => void;

  useRiveMascot: boolean;
  setUseRiveMascot: (v: boolean) => void;
}

export interface UserProfile {
  name: string;              // Как обращаться к пользователю
  language: 'ru' | 'en' | 'kk';
  formality: 'formal' | 'informal';  // на "ты" или на "вы"
  work_style: 'coder' | 'writer' | 'student' | 'manager' | 'designer' | 'other';
  main_projects: string[];   // над чем работает
  preferred_tone: 'concise' | 'detailed';  // короткие или развёрнутые ответы
  proactive_mode: boolean;   // U.N.A. сама предлагает помощь
  vision_enabled: boolean;   // U.N.A. может видеть экран
}

export const useStore = create<UNAState>((set) => ({
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastAssistant: (patch) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], ...patch };
          break;
        }
      }
      return { messages: msgs };
    }),
  updateMessageById: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  appendToMessage: (id, textDelta) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: (m.content === '...' ? '' : m.content) + textDelta } : m
      ),
    })),
  clearMessages: () => set({ messages: [] }),

  status: 'idle',
  setStatus: (status) => set({ status }),

  currentEmotion: 'neutral',
  setCurrentEmotion: (currentEmotion) => set({ currentEmotion }),

  pendingConfirmation: null,
  setPendingConfirmation: (pendingConfirmation) => set({ pendingConfirmation }),

  activePanel: 'chat',
  setActivePanel: (activePanel) => set({ activePanel }),

  voiceEnabled: true,
  setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),

  streamingEnabled: true,
  setStreamingEnabled: (streamingEnabled) => set({ streamingEnabled }),

  onboardingCompleted: false,
  setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),

  userProfile: null,
  setUserProfile: (userProfile) => set({ userProfile }),

  useRiveMascot: false,
  setUseRiveMascot: (useRiveMascot) => set({ useRiveMascot }),
}));
