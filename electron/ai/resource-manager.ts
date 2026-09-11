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

// CPU-время для дельты: os.loadavg() на Windows всегда возвращает [0,0,0],
// поэтому CPU% считаем сами — по разности cpus().times между пробами.
let lastCpuTimes: { idle: number; total: number } | null = null;

function readCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

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

// Игры и лаунчеры: если такой процесс активен — это игровой сеанс, и UNA должна
// освободить VRAM/CPU (модель выгружается через vram-gate).
const GAME_PROCESSES = [
  // Известные игры (Steam/Epic/standalone)
  'steam', 'cs2', 'csgo', 'dota2', 'dota 2', 'valorant', 'fortnite', 'league of legends',
  'wow.exe', 'gta5', 'gta v', 'cyberpunk', 'eldenring', 'sekiro', 'starfield',
  'minecraft', 'terraria', 'overwatch', 'apex', 'pubg', 'warzone', 'destiny',
  'rimworld', 'stellaris', 'civ6', 'civilization', 'baldurs', 'fallout', 'skyrim',
  'mohaa', 'medal of honor', 'towerdefense', 'tower defense', 'factorio', 'satisfactory',
  'forza', 'assettocorsa', 'warframe', 'pathofexile', 'diablo', 'witcher', 'rocketleague',
  // Лаунчеры
  'epicgames', 'ubisoft', 'gog', 'origin', 'battle.net', 'r5apex', 'steam.exe',
];

export function detectActivityByProcesses(cpuPercent = 0): UserActivity {
  try {
    // Один проход: имя + признак «есть окно». Headless-процессы (Steam/battle.net
    // в трее) не должны выдавать 'gaming' — у активной игры окно всегда есть.
    const result = execSync(
      `powershell -NoProfile -Command "Get-Process | ForEach-Object { '{0}|{1}' -f $_.ProcessName, [int]($_.MainWindowHandle -ne 0) }"`,
      { timeout: 3000 }
    );
    const output = result.toString();
    const windowed: string[] = [];
    const all: string[] = [];
    for (const line of output.toLowerCase().split('\n')) {
      const s = line.trim();
      const idx = s.lastIndexOf('|');
      if (idx <= 0) continue;
      all.push(s.slice(0, idx));
      if (s.slice(idx + 1) === '1') windowed.push(s.slice(0, idx));
    }

    // Игра активна → 'gaming'. Проверяем ПЕРВЫМ: Discord/Teams обычно открыты
    // рядом с игрой, и прежний порядок «сначала meetings» ложно классифицировал
    // игровой сеанс как 'meeting' — VRAM-gate молчал.
    for (const game of GAME_PROCESSES) {
      if (windowed.some((p: string) => p.includes(game))) return 'gaming';
    }

    for (const meeting of MEETING_APPS) {
      if (windowed.some((p: string) => p.includes(meeting))) return 'meeting';
    }

    const highCpu: boolean = cpuPercent > 80;
    for (const compile of COMPILING_PROCESSES) {
      if (all.some((p: string) => p.includes(compile)) && highCpu) return 'compiling';
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

  // CPU% по дельте cpus().times — loadavg на Windows мёртв (всегда 0),
  // из-за чего cpuPercent был всегда 0 и 'compiling' никогда не детектился.
  const cpuTimes = readCpuTimes();
  let cpuPercent = 0;
  if (lastCpuTimes && cpuTimes.total > lastCpuTimes.total) {
    const idleDelta = cpuTimes.idle - lastCpuTimes.idle;
    const totalDelta = cpuTimes.total - lastCpuTimes.total;
    cpuPercent = Math.min(Math.max(Math.round((1 - idleDelta / totalDelta) * 100), 0), 100);
  }
  lastCpuTimes = cpuTimes;

  const [gpu, power] = await Promise.all([getGpuInfo(), getBatteryStatus()]);

  let activity: UserActivity = detectActivityByProcesses(cpuPercent);
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
