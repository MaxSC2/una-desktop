// M3 smoke: MCP stdio handshake with the same protocol the UNA adapter uses (no model load).
import { spawn } from 'node:child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const serverPy = path.join(os.homedir(), 'graphiti-una', 'server.py');
const venvPy = path.join(os.homedir(), 'graphiti-una', '.venv', 'Scripts', 'python.exe');

const env = {
  ...process.env,
  OPENAI_BASE_URL: 'http://127.0.0.1:11434/v1',
  OPENAI_API_KEY: 'ollama',
  MODEL_NAME: 'qwen3:1.7b',
  EMBEDDER_MODEL: 'nomic-embed-text',
  GRAPHITI_DB_PATH: path.join('C:', 'Users', 'Public', 'una-graphiti', 'una-graph.kz'),
  GRAPHITI_GROUP_ID: 'una',
  GRAPHITI_TELEMETRY_ENABLED: 'false',
};

console.log('serverPy:', serverPy, 'exists:', fs.existsSync(serverPy));
console.log('venvPy:', venvPy, 'exists:', fs.existsSync(venvPy));

const child = spawn(venvPy, [serverPy], { env, stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let pyerrBuf = '';
let toolsCount = -1;
let done = false;

const failAndDump = (why, code) => {
  if (done) return;
  done = true;
  console.error('SMOKE ' + why);
  console.error('--- PYTHON STDERR (full) ---');
  console.error(pyerrBuf || '(empty)');
  child.kill();
  process.exit(code);
};

const timer = setTimeout(() => failAndDump('FAIL: timeout waiting for tools/list', 1), 60000);

child.stdout.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split('\n');
  buf = lines.pop(); // keep incomplete tail
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const msg = JSON.parse(t);
      if (msg.id === 'smoke-init') {
        console.log('INITIALIZE OK, server:', msg.result?.serverInfo?.name ?? 'unknown');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'smoke-list', method: 'tools/list', params: {} }) + '\n');
      } else if (msg.id === 'smoke-list') {
        if (msg.error) { failAndDump('tools/list ERROR: ' + JSON.stringify(msg.error), 2); return; }
        const tools = (msg.result?.tools ?? []);
        toolsCount = tools.length;
        console.log('TOOLS/LIST OK, ' + toolsCount + ' tools: ' + tools.map((t) => t.name).join(', '));
        clearTimeout(timer);
        child.kill();
        process.exit(toolsCount > 0 ? 0 : 2);
      }
    } catch { /* incomplete line — wait for more */ }
  }
});

child.on('error', (e) => { console.error('spawn error:', e); process.exit(1); });
child.stderr.on('data', (d) => { pyerrBuf += d.toString(); });
child.on('exit', (code) => { if (!done) failAndDump('server exited early, code=' + code, 3); });

child.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 'smoke-init', method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'una-assistant', version: '1.0.0' } },
}) + '\n');