import { promises as fs } from 'fs';
import * as os from 'os';
import { home, ToolContext, ToolDefinition, ToolResult } from '../helpers';

export const definition: ToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'system_info',
    description: 'Информация о системе: ОС, CPU, память, диск, uptime.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
};

/**
 * Информация о системе.
 */
export async function handler(_args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
  try {
    const platform = os.platform();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();

    let diskInfo: { available: number; total: number } | null = null;
    try {
      const stat = await fs.statfs(home());
      diskInfo = { available: stat.bavail * stat.bsize, total: stat.blocks * stat.bsize };
    } catch {
      /* statfs недоступен на всех платформах */
    }

    return {
      success: true,
      data: {
        platform: `${platform} ${os.release()}`,
        platform_name:
          platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : platform === 'linux' ? 'Linux' : platform,
        arch: os.arch(),
        hostname: os.hostname(),
        cpu: cpus[0]?.model ?? 'unknown',
        cpu_cores: cpus.length,
        memory: {
          total_gb: +(totalMem / 1024 ** 3).toFixed(2),
          free_gb: +(freeMem / 1024 ** 3).toFixed(2),
          used_pct: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
        },
        disk: diskInfo
          ? {
              total_gb: +(diskInfo.total / 1024 ** 3).toFixed(2),
              free_gb: +(diskInfo.available / 1024 ** 3).toFixed(2),
              used_pct: +(((diskInfo.total - diskInfo.available) / diskInfo.total) * 100).toFixed(1),
            }
          : null,
        uptime_hours: +(uptime / 3600).toFixed(2),
        home: home(),
      },
    };
  } catch (e) {
    return { success: false, error: `Не удалось получить информацию о системе: ${(e as Error).message}` };
  }
}
