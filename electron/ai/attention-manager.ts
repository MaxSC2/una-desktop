import { getLastResourceState, UserActivity, ResourceState } from './resource-manager';
import { getConfigStore } from './config';

export type FocusState = 'deep_focus' | 'light_work' | 'idle' | 'chatting' | 'gaming' | 'meeting';

export type ResponseUrgency = 'immediate' | 'normal' | 'deferred';

export interface AttentionState {
  focus: FocusState;
  interruptible: boolean;
  responseUrgency: ResponseUrgency;
  maxContextTokens: number;
  allowProactive: boolean;
  allowSound: boolean;
  sessionAttentionScore: number;
  conversationBurst: boolean;
  lastInteractionMsAgo: number;
}

let lastInteractionTime = Date.now();
let interactionCount = 0;
let interactionTimestamps: number[] = [];
let lastFocus: FocusState = 'idle';
let dnD = false;

export function setDoNotDisturb(v: boolean): void {
  dnD = v;
}

export function getDoNotDisturb(): boolean {
  return dnD;
}

export function recordInteraction(): void {
  lastInteractionTime = Date.now();
  interactionCount++;
  interactionTimestamps.push(Date.now());
  if (interactionTimestamps.length > 50) interactionTimestamps.shift();
}

export function getAttentionState(state?: ResourceState): AttentionState {
  const s = state ?? getLastResourceState();
  const msAgo = Date.now() - lastInteractionTime;
  const minutesAgo = msAgo / 60000;

  const burst = detectBurst();

  let focus: FocusState;
  let interruptible: boolean;
  let urgency: ResponseUrgency;
  let proactive: boolean;
  let sound: boolean;

  if (dnD) {
    focus = 'deep_focus';
    interruptible = false;
    urgency = 'deferred';
    proactive = false;
    sound = false;
  } else if (s?.activity === 'gaming') {
    focus = 'gaming';
    interruptible = false;
    urgency = 'deferred';
    proactive = false;
    sound = false;
  } else if (s?.activity === 'meeting') {
    focus = 'meeting';
    interruptible = false;
    urgency = 'deferred';
    proactive = false;
    sound = false;
  } else if (s?.activity === 'compiling') {
    focus = 'deep_focus';
    interruptible = false;
    urgency = 'deferred';
    proactive = false;
    sound = true;
  } else if (minutesAgo < 1 && burst) {
    focus = 'chatting';
    interruptible = true;
    urgency = 'immediate';
    proactive = false;
    sound = true;
  } else if (minutesAgo < 5) {
    focus = 'light_work';
    interruptible = true;
    urgency = 'normal';
    proactive = true;
    sound = true;
  } else if (minutesAgo < 30) {
    focus = 'light_work';
    interruptible = true;
    urgency = 'normal';
    proactive = true;
    sound = false;
  } else {
    focus = 'idle';
    interruptible = true;
    urgency = 'deferred';
    proactive = false;
    sound = false;
  }

  lastFocus = focus;

  return {
    focus,
    interruptible,
    responseUrgency: urgency,
    maxContextTokens: s ? getContextBudget(s) : 4096,
    allowProactive: proactive,
    allowSound: sound,
    sessionAttentionScore: computeAttentionScore(minutesAgo, burst),
    conversationBurst: burst,
    lastInteractionMsAgo: msAgo,
  };
}

export function getLastFocus(): FocusState {
  return lastFocus;
}

function detectBurst(): boolean {
  if (interactionTimestamps.length < 3) return false;
  const recent = interactionTimestamps.slice(-5);
  if (recent.length < 2) return false;
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    gaps.push(recent[i] - recent[i - 1]);
  }
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return avgGap < 30000;
}

function computeAttentionScore(minutesAgo: number, burst: boolean): number {
  if (burst && minutesAgo < 1) return 1.0;
  if (minutesAgo < 5) return 0.8;
  if (minutesAgo < 15) return 0.5;
  if (minutesAgo < 60) return 0.3;
  return 0.1;
}

function getContextBudget(s: ResourceState): number {
  if (s.gpu) {
    const freeVRAM = s.gpu.vramFreeMB;
    if (freeVRAM > 3000) return 8192;
    if (freeVRAM > 1500) return 4096;
    return 2048;
  }
  if (s.ram.percentUsed > 80) return 2048;
  return 4096;
}
