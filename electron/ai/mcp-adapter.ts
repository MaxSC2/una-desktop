/**
 * MCP Adapter — Model Context Protocol integration.
 *
 * Позволяет U.N.A. подключаться к MCP-серверам (GitHub, Notion, Slack, etc.)
 * и использовать их инструменты как собственные.
 *
 * MCP серверы могут быть:
 *  - stdio-based (запускаются как child process)
 *  - HTTP-based (REST API)
 */

import { ChildProcess, spawn } from 'child_process';
import { ToolContext, ToolResult } from '../tools/helpers';

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string; // для stdio
  args?: string[]; // для stdio
  env?: Record<string, string>; // для stdio
  url?: string; // для http
  headers?: Record<string, string>; // для http
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  serverName: string; // какой MCP-сервер предоставляет этот tool
}

export interface MCPCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================================
// MCP ADAPTER
// ============================================================

export class MCPAdapter {
  private servers = new Map<string, { config: MCPServerConfig; process?: ChildProcess; initialized?: boolean }>();
  private tools = new Map<string, MCPTool>();
  private initialized = false;

  /**
   * Регистрирует MCP-сервер (но не подключается сразу).
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.name, { config });
    console.log(`[MCP] Registered server: ${config.name} (${config.transport})`);
  }

  /**
   * Подключается ко всем зарегистрированным серверам и загружает tools.
   */
  async connectAll(): Promise<{ connected: number; failed: number; toolsLoaded: number }> {
    let connected = 0;
    let failed = 0;
    let toolsLoaded = 0;

    for (const [name, entry] of this.servers.entries()) {
      if (!entry.config.enabled) continue;

      try {
        await this.connectToServer(name);
        connected++;
        const serverTools = await this.listTools(name);
        toolsLoaded += serverTools.length;
      } catch (e) {
        console.error(`[MCP] Failed to connect to ${name}:`, e);
        failed++;
      }
    }

    this.initialized = true;
    console.log(`[MCP] Connected: ${connected}, Failed: ${failed}, Tools loaded: ${toolsLoaded}`);
    return { connected, failed, toolsLoaded };
  }

  /**
   * Подключается к одному серверу.
   */
  private async connectToServer(name: string): Promise<void> {
    const entry = this.servers.get(name);
    if (!entry) throw new Error(`Server ${name} not registered`);

    const { config } = entry;

    if (config.transport === 'stdio') {
      if (!config.command) throw new Error('stdio server requires command');

      const child = spawn(config.command, config.args ?? [], {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.on('error', (e) => {
        console.error(`[MCP] Server ${name} error:`, e);
      });

      child.on('exit', (code) => {
        console.warn(`[MCP] Server ${name} exited with code ${code}`);
        // Сбрасываем состояние: при переподключении handshake нужен заново
        this.servers.set(name, { config, initialized: false });
      });

      entry.process = child;
      entry.initialized = false;
    } else if (config.transport === 'http') {
      // HTTP servers не требуют постоянного соединения
      // Проверяем доступность
      if (!config.url) throw new Error('http server requires url');
    }

    this.servers.set(name, entry);
  }

  /**
   * Запрашивает список tools у MCP-сервера.
   */
  async listTools(serverName: string): Promise<MCPTool[]> {
    const entry = this.servers.get(serverName);
    if (!entry) throw new Error(`Server ${serverName} not registered`);

    try {
      const response = await this.sendRequest(serverName, 'tools/list', {});
      const tools = (response.tools ?? []) as MCPTool[];

      // Регистрируем tools
      for (const tool of tools) {
        tool.serverName = serverName;
        this.tools.set(`${serverName}:${tool.name}`, tool);
      }

      return tools;
    } catch (e) {
      console.error(`[MCP] listTools failed for ${serverName}:`, e);
      return [];
    }
  }

  /**
   * Вызывает tool на MCP-сервере.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    _ctx: ToolContext
  ): Promise<ToolResult> {
    // Ищем tool по имени (может быть с префиксом server: или без)
    let toolKey = toolName;
    if (!this.tools.has(toolKey)) {
      // Ищем по имени без префикса
      const found = Array.from(this.tools.keys()).find((k) => k.endsWith(`:${toolName}`));
      if (found) toolKey = found;
    }

    const tool = this.tools.get(toolKey);
    if (!tool) {
      return { success: false, error: `MCP tool not found: ${toolName}` };
    }

    try {
      const response = await this.sendRequest(tool.serverName, 'tools/call', {
        name: tool.name,
        arguments: args,
      });

      return {
        success: !response.isError,
        data: response.content,
        error: response.isError ? String(response.content) : undefined,
      };
    } catch (e) {
      return { success: false, error: `MCP call failed: ${(e as Error).message}` };
    }
  }

  /**
   * Отправляет JSON-RPC запрос к MCP-серверу.
   */
  private async sendRequest(
    serverName: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<any> {
    const entry = this.servers.get(serverName);
    if (!entry) throw new Error(`Server ${serverName} not registered`);

    const requestId = Math.random().toString(36).slice(2);
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    });

    if (entry.config.transport === 'stdio' && entry.process) {
      const child = entry.process;
      // MCP spec: перед любым запросом нужен initialize-handshake
      if (!entry.initialized && method !== 'initialize') {
        await this.initializeServer(entry);
      }
      // send передаётся как 4-й аргумент: listener навешивается ДО записи в stdin,
      // чтобы не потерять мгновенный ответ сервера (без гонки).
      await this.waitForResponse(child, requestId, 30000, () => {
        child.stdin?.write(request + '\n');
      });
    } else if (entry.config.transport === 'http' && entry.config.url) {
      const resp = await fetch(entry.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...entry.config.headers,
        },
        body: request,
      });

      if (!resp.ok) {
        throw new Error(`MCP HTTP ${resp.status}: ${await resp.text()}`);
      }

      const data: any = await resp.json();
      if (data.error) {
        throw new Error(data.error.message ?? 'MCP error');
      }
      return data.result;
    } else {
      throw new Error(`Server ${serverName} not connected`);
    }
  }

  /**
   * MCP initialize-handshake: обязателен перед любым запросом к stdio-серверу.
   */
  private async initializeServer(
    entry: { config: MCPServerConfig; process?: ChildProcess; initialized?: boolean }
  ): Promise<void> {
    const child = entry.process;
    if (!child) throw new Error('Server process not running');

    const requestId = Math.random().toString(36).slice(2);
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'una-assistant', version: '1.0.0' },
      },
    });

    await this.waitForResponse(child, requestId, 15000, () => {
      child.stdin?.write(request + '\n');
    });

    // Уведомление о завершении инициализации (без id — это notification)
    child.stdin?.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
    );
    entry.initialized = true;
    console.log(`[MCP] Server initialized: ${entry.config.name}`);
  }

  /**
   * Ждёт JSON-RPC ответ с нужным id (построчный разбор stdout).
   */
  private waitForResponse(
    child: ChildProcess,
    requestId: string,
    timeoutMs: number,
    send: () => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let responseData = '';

      const cleanup = () => {
        clearTimeout(timeout);
        child.stdout?.removeListener('data', onData);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('MCP request timeout'));
      }, timeoutMs);

      const onData = (data: Buffer) => {
        responseData += data.toString();
        // Построчный разбор: сервер может прислать несколько JSON-строк одним чанком
        const lines = responseData.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.id === requestId) {
              cleanup();
              if (parsed.error) {
                reject(new Error(parsed.error.message ?? 'MCP error'));
              } else {
                resolve(parsed.result);
              }
              return;
            }
          } catch {
            // Строка ещё не полный JSON — ждём дальше
          }
        }
      };

      child.stdout?.on('data', onData);
      send();
    });
  }

  /**
   * Возвращает все загруженные MCP tools в формате TOOL_DEFINITIONS.
   */
  getToolDefinitions() {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: `${tool.serverName}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
        description: `[MCP:${tool.serverName}] ${tool.description}`,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Отключается от всех серверов.
   */
  async disconnectAll(): Promise<void> {
    for (const [name, entry] of this.servers.entries()) {
      if (entry.process) {
        try {
          entry.process.kill();
          console.log(`[MCP] Disconnected from ${name}`);
        } catch (e) {
          console.warn(`[MCP] Error disconnecting ${name}:`, e);
        }
      }
    }
    this.tools.clear();
    this.initialized = false;
  }

  /**
   * Возвращает статус всех серверов.
   */
  getStatus(): Array<{ name: string; transport: string; connected: boolean; toolsCount: number }> {
    return Array.from(this.servers.entries()).map(([name, entry]) => ({
      name,
      transport: entry.config.transport,
      connected: Boolean(entry.process) || entry.config.transport === 'http',
      toolsCount: Array.from(this.tools.values()).filter((t) => t.serverName === name).length,
    }));
  }
}

// Глобальный экземпляр
export const mcpAdapter = new MCPAdapter();

// ============================================================
// PREDEFINED SERVER CONFIGS
// ============================================================

export const DEFAULT_MCP_SERVERS: MCPServerConfig[] = [
  // Graphiti — темпоральный граф знаний как долговременная память U.N.A.
  // (https://github.com/getzep/graphiti). Требует запущенный Graphiti MCP-сервер:
  //   git clone https://github.com/getzep/graphiti.git
  //   cd graphiti/mcp_server && uv sync && uv run main.py --group-id una
  //   (env: OPENAI_BASE_URL=http://localhost:11434/v1, MODEL_NAME=qwen3:4b,
  //    OPENAI_API_KEY=ollama, GRAPHITI_TELEMETRY_ENABLED=false)
  // Полная инструкция: docs/GRAPHITI_MEMORY.md
  // {
  //   name: 'graphiti-memory',
  //   transport: 'stdio',
  //   command: 'npx',
  //   args: ['-y', 'mcp-remote', 'http://localhost:8000/mcp/'],
  //   env: { GRAPHITI_TELEMETRY_ENABLED: 'false' },
  //   enabled: false,  // ← поставьте true после запуска сервера
  // },
  // Примеры — раскомментируйте и настройте при необходимости
  // {
  //   name: 'github',
  //   transport: 'stdio',
  //   command: 'npx',
  //   args: ['-y', '@modelcontextprotocol/server-github'],
  //   env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '' },
  //   enabled: false,
  // },
  // {
  //   name: 'filesystem',
  //   transport: 'stdio',
  //   command: 'npx',
  //   args: ['-y', '@modelcontextprotocol/server-filesystem', require('os').homedir()],
  //   enabled: false,
  // },
];

