// Временный M3-фиксер: Graphiti MCP-сервер включается автоматически (удалить после прогона).
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(ROOT, 'electron', 'ai', 'mcp-adapter.ts');
let s = fs.readFileSync(p, 'utf8');

// 1) Импорты os/fs/path (нужны для автообнаружения сервера)
if (!/^import \* as os from 'os';$/m.test(s)) {
  s = s.replace(
    /^import \{ ChildProcess, spawn \} from 'child_process';$/m,
    "import { ChildProcess, spawn } from 'child_process';\nimport * as os from 'os';\nimport * as fs from 'fs';\nimport * as path from 'path';"
  );
}

// 2) Заменяем DEFAULT_MCP_SERVERS: автодетект graphiti-una + включённый сервер
const start = s.indexOf('export const DEFAULT_MCP_SERVERS: MCPServerConfig[] = [');
const end = s.indexOf('];', start);
if (start < 0 || end < 0) { console.error('[FAIL] DEFAULT_MCP_SERVERS not found'); process.exit(1); }

const block = `export const DEFAULT_MCP_SERVERS: MCPServerConfig[] = [
  // Graphiti-una — долговременная память U.N.A. (темпоральный граф знаний).
  // Автообнаружение: сервер считается установленным, если есть ~/graphiti-una/server.py.
  // Venv-питон предпочитается системному. БД — %SystemDrive%\\\\Users\\\\Public\\\\una-graphiti.
  ...(() => {
    const serverPy = path.join(os.homedir(), 'graphiti-una', 'server.py');
    if (!fs.existsSync(serverPy)) return [];

    const venvPy = path.join(os.homedir(), 'graphiti-una', '.venv', 'Scripts', 'python.exe');
    const py = fs.existsSync(venvPy) ? venvPy : 'python';

    console.log(\`[MCP] Graphiti memory server found: \${serverPy}\`);
    return [
      {
        name: 'graphiti-memory',
        transport: 'stdio' as const,
        command: py,
        args: [serverPy],
        env: {
          OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
          OPENAI_API_KEY: 'ollama',
          MODEL_NAME: 'qwen3:1.7b',
          EMBEDDER_MODEL: 'nomic-embed-text',
          GRAPHITI_DB_PATH: path.join('C:', 'Users', 'Public', 'una-graphiti', 'una-graph.kz'),
          GRAPHITI_GROUP_ID: 'una',
          GRAPHITI_TELEMETRY_ENABLED: 'false',
        },
        enabled: true,
      },
    ];
  })(),
];`;

s = s.slice(0, start) + block + s.slice(end + 2);
fs.writeFileSync(p, s, 'utf8');
console.log('[OK] DEFAULT_MCP_SERVERS patched (graphiti-memory auto-detect, enabled)');
