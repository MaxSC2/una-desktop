import { BrowserWindow } from 'electron';
import {
  getResourceState, canRunTask, shouldMaintainMemory,
  getOptimalContextTokens, getPerformanceAdvice,
  ResourceState, UserActivity
} from './resource-manager';
import { listFacts } from '../memory/store';
import { getWorkContext } from './work-context';
import { getActiveGoals } from './executive';
import { runDeepReview, getReviewSummary } from './self-review';
import { resolveState, setState, getCurrentState, getStateConfig, UnaState } from './states';
import { generateThought } from './monologue';
import { runMaintenance } from './compression';

export interface LifeLoopConfig {
  tickIntervalMs: number;
  observeEnabled: boolean;
  reflectEnabled: boolean;
  updateMemoryEnabled: boolean;
  planEnabled: boolean;
}

export interface LifeCycle {
  tick: number;
  phase: 'observe' | 'reflect' | 'update' | 'plan' | 'wait';
  state: ResourceState | null;
  unaState: UnaState;
  observations: string[];
  reflections: string[];
  memoryUpdates: string[];
  plans: string[];
  thoughts: string[];
  startedAt: string;
  durationMs: number;
}

const DEFAULT_CONFIG: LifeLoopConfig = {
  tickIntervalMs: 30_000,
  observeEnabled: true,
  reflectEnabled: true,
  updateMemoryEnabled: true,
  planEnabled: true,
};

let loopTimer: ReturnType<typeof setInterval> | null = null;
let currentCycle: LifeCycle | null = null;
let tickCount = 0;
let lastActivity: UserActivity | null = null;
let consecutiveIdleTicks = 0;
let config: LifeLoopConfig = { ...DEFAULT_CONFIG };
let lastMaintenanceRun = 0;

export function configureLifeLoop(cfg: Partial<LifeLoopConfig>): void {
  config = { ...config, ...cfg };
}

export function startLifeLoop(getMainWindow: () => BrowserWindow | null): void {
  if (loopTimer) return;
  tickCount = 0;
  loopTimer = setInterval(() => tick(getMainWindow), config.tickIntervalMs);
  tick(getMainWindow);
}

export function stopLifeLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

export function getCurrentCycle(): LifeCycle | null {
  return currentCycle;
}

async function tick(getMainWindow: () => BrowserWindow | null): Promise<void> {
  tickCount++;
  const startedAt = Date.now();
  const resource = await getResourceState();
  const hour = new Date().getHours();
  const unaState = resolveState(resource, hour);
  setState(unaState);

  const cycle: LifeCycle = {
    tick: tickCount,
    phase: 'observe',
    state: resource,
    unaState,
    observations: [],
    reflections: [],
    memoryUpdates: [],
    plans: [],
    thoughts: [],
    startedAt: new Date().toISOString(),
    durationMs: 0,
  };

  if (resource.activity === 'idle') {
    consecutiveIdleTicks++;
  } else {
    consecutiveIdleTicks = 0;
  }
  lastActivity = resource.activity;

  const cfg = getStateConfig(unaState);

  try {
    if (config.observeEnabled && cfg.observeEnabled) {
      await observePhase(cycle, resource, unaState);
    }

    if (config.reflectEnabled) {
      await reflectPhase(cycle, resource, unaState);
    }

    if (config.updateMemoryEnabled && cfg.memoryMaintenance && canRunTask('maintenance', resource)) {
      await updateMemoryPhase(cycle, resource, unaState);
    }

    if (config.planEnabled && cfg.proactive) {
      await planPhase(cycle, resource);
    }

    // Internal monologue: generate thoughts from cycle data
    const thought = generateThought(cycle.observations, cycle.reflections, {
      hour,
      sessionLength: consecutiveIdleTicks * 0.5,
    });
    if (thought) {
      cycle.thoughts.push(thought.text);
    }

    // Night/idle maintenance (memory compression) — once per hour
    if ((unaState === 'night' || unaState === 'idle') && canRunTask('maintenance', resource)) {
      const minutesSinceMaintenance = (Date.now() - lastMaintenanceRun) / 60000;
      if (minutesSinceMaintenance > 60) {
        const result = runMaintenance();
        lastMaintenanceRun = Date.now();
        if (result.compressed > 0 || result.promoted > 0 || result.demoted > 0) {
          cycle.memoryUpdates.push(
            `Maintenance: compressed=${result.compressed} promoted=${result.promoted} demoted=${result.demoted}`
          );
        }
      }
    }
  } catch (e) {
    console.warn('[LifeLoop] cycle error:', e);
  }

  cycle.phase = 'wait';
  cycle.durationMs = Date.now() - startedAt;
  currentCycle = cycle;

  if (cycle.observations.length > 0 || cycle.reflections.length > 0 || cycle.thoughts.length > 0) {
    console.log(
      `[LifeLoop] tick=${tickCount} state=${unaState} activity=${resource.activity} ` +
      `obs=${cycle.observations.length} refl=${cycle.reflections.length} ` +
      `mem=${cycle.memoryUpdates.length} plans=${cycle.plans.length} ` +
      `thoughts=${cycle.thoughts.length} ${cycle.durationMs}ms`
    );
  }
}

async function observePhase(cycle: LifeCycle, state: ResourceState, unaState: UnaState): Promise<void> {
  cycle.phase = 'observe';

  cycle.observations.push(`UNA state: ${unaState}`);

  const perfAdvice = getPerformanceAdvice(state);
  if (perfAdvice.length > 0) {
    cycle.observations.push(`Performance: ${perfAdvice.join('; ')}`);
  }

  if (consecutiveIdleTicks === 1) {
    cycle.observations.push('User went idle — good time for maintenance');
  } else if (consecutiveIdleTicks > 3 && consecutiveIdleTicks % 6 === 0) {
    cycle.observations.push(`User idle for ~${Math.round(consecutiveIdleTicks * 0.5)} minutes`);
  }

  if (state.power.onBattery && state.power.batteryPercent !== null) {
    cycle.observations.push(`Battery: ${state.power.batteryPercent}%`);
  }

  if (shouldMaintainMemory(state)) {
    cycle.observations.push('System idle — memory maintenance possible');
  }
}

async function reflectPhase(cycle: LifeCycle, state: ResourceState, unaState: UnaState): Promise<void> {
  cycle.phase = 'reflect';

  if (!canRunTask('maintenance', state)) return;

  if (unaState === 'night' || (consecutiveIdleTicks > 5 && consecutiveIdleTicks % 12 === 0)) {
    try {
      const facts = listFacts();
      const staleFacts = facts.filter(f => {
        if (!f.last_used) return false;
        const daysSinceUse = (Date.now() - new Date(f.last_used).getTime()) / 86400000;
        return daysSinceUse > 30 && (f.use_count ?? 0) < 3;
      });
      if (staleFacts.length > 5) {
        cycle.reflections.push(`Found ${staleFacts.length} potentially stale facts (>30d unused, <3 uses)`);
      }
    } catch { }
  }

  // Self Review deep analysis
  if (consecutiveIdleTicks > 3 && tickCount % 20 === 0) {
    try {
      const summary = getReviewSummary();
      if (summary.totalReviews > 0) {
        cycle.reflections.push(`Self-review: ${summary.totalReviews} reviews, avg ${summary.averageScore}/5`);
        if (summary.topWeaknesses.length > 0) {
          cycle.reflections.push(`Top weakness: ${summary.topWeaknesses[0].pattern} (${summary.topWeaknesses[0].count}x)`);
        }
      }
    } catch { }
  }
}

async function updateMemoryPhase(cycle: LifeCycle, state: ResourceState, unaState: UnaState): Promise<void> {
  cycle.phase = 'update';

  if (!shouldMaintainMemory(state)) return;

  if (unaState === 'night' || (consecutiveIdleTicks > 3 && consecutiveIdleTicks % 6 === 0)) {
    try {
      const ctx = await getWorkContext();
      const tokens = getOptimalContextTokens(state);
      cycle.memoryUpdates.push(`Context tokens optimized to ${tokens} based on current VRAM`);

      if (ctx.gitRepos.length > 0) {
        const dirtyRepos = ctx.gitRepos.filter(r => r.uncommittedCount > 0);
        if (dirtyRepos.length > 0) {
          const repoList = dirtyRepos.map(r => `${r.path.split('\\').pop()}: ${r.uncommittedCount}`).join(', ');
          cycle.memoryUpdates.push(`Dirty repos: ${repoList}`);
        }
      }
    } catch { }
  }
}

async function planPhase(cycle: LifeCycle, state: ResourceState): Promise<void> {
  cycle.phase = 'plan';

  if (state.activity === 'gaming') return;

  if (state.power.onBattery && state.power.batteryPercent !== null && state.power.batteryPercent < 15) {
    cycle.plans.push('Critical battery — defer all background work');
    return;
  }

  if (consecutiveIdleTicks > 10 && state.activity === 'idle') {
    cycle.plans.push('Deep idle — ready for proactive suggestion if enough context');
  }

  if (consecutiveIdleTicks > 3 && consecutiveIdleTicks % 6 === 0) {
    try {
      const activeGoals = getActiveGoals();
      if (activeGoals.length > 0) {
        const incomplete = activeGoals.filter(g => g.progress < 100);
        if (incomplete.length > 0) {
          cycle.plans.push(`Active goals: ${incomplete.length} goal(s) in progress`);
        }
      }
    } catch { }
  }
}

export function getLifeLoopStats(): {
  isRunning: boolean;
  ticks: number;
  consecutiveIdleTicks: number;
  lastActivity: UserActivity | null;
  lastCycle: LifeCycle | null;
  currentState: UnaState;
} {
  return {
    isRunning: loopTimer !== null,
    ticks: tickCount,
    consecutiveIdleTicks,
    lastActivity,
    lastCycle: currentCycle,
    currentState: getCurrentState(),
  };
}
