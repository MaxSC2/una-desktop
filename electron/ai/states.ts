import { ResourceState, UserActivity } from './resource-manager';

export type UnaState = 'sleep' | 'idle' | 'thinking' | 'gaming' | 'night' | 'active';

interface StateConfig {
  label: string;
  icon: string;
  description: string;
  llmLoaded: boolean;
  observeEnabled: boolean;
  memoryMaintenance: boolean;
  proactive: boolean;
  tickIntervalMs: number;
}

const STATE_REGISTRY: Record<UnaState, StateConfig> = {
  sleep: {
    label: 'Сплю',
    icon: '💤',
    description: 'Компьютер простаивает — UNA почти ничего не делает',
    llmLoaded: false,
    observeEnabled: false,
    memoryMaintenance: false,
    proactive: false,
    tickIntervalMs: 60_000,
  },
  idle: {
    label: 'Наблюдаю',
    icon: '👀',
    description: 'Пользователь работает — UNA наблюдает и обновляет контекст',
    llmLoaded: false,
    observeEnabled: true,
    memoryMaintenance: false,
    proactive: false,
    tickIntervalMs: 30_000,
  },
  thinking: {
    label: 'Думаю',
    icon: '🧠',
    description: 'Генерация ответа — LLM загружена',
    llmLoaded: true,
    observeEnabled: false,
    memoryMaintenance: false,
    proactive: false,
    tickIntervalMs: 30_000,
  },
  gaming: {
    label: 'Не мешаю',
    icon: '🎮',
    description: 'Пользователь играет — UNA в режиме экономии ресурсов',
    llmLoaded: false,
    observeEnabled: false,
    memoryMaintenance: false,
    proactive: false,
    tickIntervalMs: 60_000,
  },
  night: {
    label: 'Уборка',
    icon: '🌙',
    description: 'Ночь — UNA занимается обслуживанием памяти',
    llmLoaded: false,
    observeEnabled: true,
    memoryMaintenance: true,
    proactive: false,
    tickIntervalMs: 30_000,
  },
  active: {
    label: 'Работаю',
    icon: '⚡',
    description: 'Нормальный режим — полная функциональность',
    llmLoaded: true,
    observeEnabled: true,
    memoryMaintenance: true,
    proactive: true,
    tickIntervalMs: 15_000,
  },
};

let currentState: UnaState = 'idle';

export function resolveState(resource: ResourceState, hour: number): UnaState {
  // Gaming detection (highest priority)
  if (resource.activity === 'gaming') {
    return 'gaming';
  }

  // Sleep: idle for >15 min with low CPU
  if (resource.activity === 'idle' && resource.cpu.loadPercent < 10) {
    // Check if user has been idle for long
    if (resource.timestamp && Date.now() - resource.timestamp > 15 * 60 * 1000) {
      return 'sleep';
    }
    return 'idle';
  }

  // Night mode: late night, low activity
  if ((hour >= 0 && hour < 6) || (hour >= 22 && hour <= 23)) {
    if (resource.activity === 'idle' || resource.cpu.loadPercent < 15) {
      return 'night';
    }
  }

  // Active: normal operation
  if (resource.activity === 'active' || resource.activity === 'compiling' || resource.activity === 'meeting') {
    return 'active';
  }

  return 'active';
}

export function setState(state: UnaState): void {
  currentState = state;
}

export function getCurrentState(): UnaState {
  return currentState;
}

export function getStateConfig(state?: UnaState): StateConfig {
  return STATE_REGISTRY[state ?? currentState] ?? STATE_REGISTRY.active;
}

export function getStateLabel(state?: UnaState): string {
  const cfg = getStateConfig(state);
  return `${cfg.icon} ${cfg.label}`;
}

export function getStateInstructions(state?: UnaState): string {
  const cfg = getStateConfig(state ?? currentState);
  return `\n\n# Состояние UNA: ${cfg.icon} ${cfg.label}\n${cfg.description}`;
}

export function listStates(): Array<{ name: UnaState; label: string; icon: string; description: string }> {
  return Object.entries(STATE_REGISTRY).map(([name, cfg]) => ({
    name: name as UnaState,
    label: cfg.label,
    icon: cfg.icon,
    description: cfg.description,
  }));
}
