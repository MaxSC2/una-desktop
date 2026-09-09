import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { getConfigStore, getConfig } from './config';

const execAsync = promisify(exec);

export interface ResourceState {
  cpu: { loadPercent: number; cores: number };
  ram: { totalGB: number; freeGB: number; percentUsed: number };
  gpu: { available: boolean; vramTotalMB: number; vramFreeMB: number; driverVersion: string } | null;
  power: { onBattery: boolean; batteryPercent: number | null };
  activity: UserActivity;
  timestamp: number;
}

export type UserActivity = 'idle' | 'active' | 'gaming' | 'compiling' | 'meeting';

export type TaskPriority = 'critical' | 'background' | 'maintenance' | 'deferrable';

let lastState: ResourceState | null = null;
let lastStateAt = 0;
const RESOURCE_TTL_MS = 45_000; // кэш состояния: не спавним nvidia-smi/powershell каждый тик
let gpuAvailable: boolean | null = null;
let lastGpuCheck = 0;

function minutesSince(ts: number): number {
  return (Date.now() - ts) / 60000;
}

export async function detectGpu(): Promise<boolean> {
  if (gpuAvailable !== null && minutesSince(lastGpuCheck) < 5) return gpuAvailable;
  lastGpuCheck = Date.now();
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=driver_version --format=csv,noheader', { timeout: 5000 });
    gpuAvailable = stdout.trim().length > 0;
  } catch {
    gpuAvailable = false;
  }
  return gpuAvailable;
}

export async function getGpuInfo(): Promise<ResourceState['gpu'] | null> {
  try {
    const hasGpu = await detectGpu();
    if (!hasGpu) return null;
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=memory.total,memory.free,driver_version --format=csv,noheader,nounits',
      { timeout: 5000 }
    );
    const parts = stdout.trim().split(', ');
    if (parts.length < 3) return null;
    return {
      available: true,
      vramTotalMB: parseInt(parts[0]) || 0,
      vramFreeMB: parseInt(parts[1]) || 0,
      driverVersion: parts[2]?.trim() || '',
    };
  } catch {
    return null;
  }
}

export async function getBatteryStatus(): Promise<{ onBattery: boolean; batteryPercent: number | null }> {
  try {
    const { stdout } = await execAsync(
      'powershell -Command "(Get-WmiObject Win32_Battery).EstimatedChargeRemaining"',
      { timeout: 5000 }
    );
    const batteryPercent = parseInt(stdout.trim());
    if (isNaN(batteryPercent)) return { onBattery: true, batteryPercent: null };
    const { stdout: statusOut } = await execAsync(
      'powershell -Command "(Get-WmiObject Win32_Battery).BatteryStatus"',
      { timeout: 5000 }
    );
    const status = parseInt(statusOut.trim());
    const onBattery = status !== 2;
    return { onBattery, batteryPercent };
  } catch {
    return { onBattery: false, batteryPercent: null };
  }
}

const COMPILING_PROCESSES = [
  'node', 'tsc', 'webpack', 'vite', 'msbuild', 'cargo', 'rustc',
  'gcc', 'clang', 'ninja', 'cmake', 'pip', 'npm',
];

const MEETING_APPS = [
  'zoom', 'teams', 'slack', 'discord', 'skype', 'webex',
];

export function detectActivityByProcesses(): UserActivity {
  try {
    const result = execSync(
      'powershell -Command "Get-Process | Select-Object -ExpandProperty ProcessName"',
      { timeout: 3000 }
    );
    const output = result.toString();
    const processes: string[] = output.toLowerCase().split('\n').map((s: string) => s.trim());

    for (const meeting of MEETING_APPS) {
      if (processes.some((p: string) => p.includes(meeting))) return 'meeting';
    }

    const loadAvgs: number[] = os.loadavg();
    const cpu: number = loadAvgs.length > 0 ? loadAvgs[0] : 0;
    const highCpu: boolean = cpu > os.cpus().length * 0.8;
    for (const compile of COMPILING_PROCESSES) {
      if (processes.some((p: string) => p.includes(compile)) && highCpu) return 'compiling';
    }

    return 'active';
  } catch {
    return 'active';
  }
}

export function isIdle(thresholdMinutes = 5): boolean {
  if (!lastState) return false;
  return minutesSince(lastState.timestamp) > thresholdMinutes;
}

export async function getResourceState(): Promise<ResourceState> {
  // TTL-кэш: жизнь-loop тикает каждые 15-30с; без кэша это 3 процесса за тик.
  // С кэшем — свежий опрос раз в 45с, остальное — из памяти (ноль нагрузки).
  const nowMs = Date.now();
  if (lastState && nowMs - lastStateAt < RESOURCE_TTL_MS) {
    return lastState;
  }

  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const loadAvgs: number[] = os.loadavg();
  const cpuLoad: number = loadAvgs.length > 0 ? loadAvgs[0] : 0;
  const cpuPercent = Math.min(Math.round((cpuLoad / cpus.length) * 100), 100);

  const [gpu, power] = await Promise.all([getGpuInfo(), getBatteryStatus()]);

  let activity: UserActivity = detectActivityByProcesses();
  if (isIdle(10) && cpuPercent < 10) activity = 'idle';

  const state: ResourceState = {
    cpu: { loadPercent: cpuPercent, cores: cpus.length },
    ram: {
      totalGB: Math.round(totalMem / 1073741824),
      freeGB: Math.round(freeMem / 1073741824),
      percentUsed: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    gpu,
    power,
    activity,
    timestamp: Date.now(),
  };

  lastState = state;
  lastStateAt = Date.now();
  return state;
}

export function getLastResourceState(): ResourceState | null {
  return lastState;
}

export function canRunTask(task: TaskPriority, state?: ResourceState): boolean {
  const s = state ?? lastState;
  if (!s) return true;

  if (task === 'critical') return true;

  if (s.activity === 'gaming') return false;

  if (s.activity === 'compiling' && task !== 'background') return false;

  if (s.power.onBattery && s.power.batteryPercent !== null && s.power.batteryPercent < 20 && task === 'deferrable') {
    return false;
  }

  if (s.cpu.loadPercent > 90 && task === 'maintenance') return false;

  if (s.ram.percentUsed > 90 && task === 'deferrable') return false;

  return true;
}

export function getOptimalContextTokens(state?: ResourceState): number {
  const s = state ?? lastState;
  // Cloud models have generous context limits
  if (getConfig().llm.provider === 'cloud') return 24576;

  if (!s || !s.gpu) return 4096;

  const freeVRAM = s.gpu.vramFreeMB;
  if (freeVRAM > 3000) return 8192;
  if (freeVRAM > 1500) return 4096;
  return 2048;
}

export function shouldMaintainMemory(state?: ResourceState): boolean {
  const s = state ?? lastState;
  if (!s) return false;
  return s.activity === 'idle' && canRunTask('maintenance', s);
}

export function getPerformanceAdvice(state?: ResourceState): string[] {
  const s = state ?? lastState;
  if (!s) return [];
  const advice: string[] = [];

  if (s.ram.percentUsed > 85) {
    advice.push('RAM usage high — close some programs for better performance');
  }

  if (s.gpu && s.gpu.vramFreeMB < 500) {
    advice.push(`Low VRAM (${s.gpu.vramFreeMB}MB free) — consider a smaller model or closing GPU apps`);
  }

  if (s.power.onBattery && s.power.batteryPercent !== null && s.power.batteryPercent < 30) {
    advice.push(`Battery low (${s.power.batteryPercent}%) — UNA is reducing background activity`);
  }

  return advice;
}
