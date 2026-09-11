/**
 * LLM провайдер: гибридная схема.
 *
 * 1. Сначала пробуем локальный Ollama (http://localhost:11434)
 *    — работает офлайн, бесплатно, приватно.
 *    — модели: qwen2.5:3b, llama3.2:3b, phi3:mini и т.д.
 *
 * 2. Если Ollama недоступен — fallback на облачный Z.ai API
 *    — требует интернет, нужен API ключ.
 *
 * Конфигурация через electron-store (см. config.ts).
 */

import { getLLMConfig as getLLMConfigFromConfig, setLLMConfig as setLLMConfigStore } from './config';
import { getOptimalContextTokens } from './resource-manager';

export interface LLMConfig {
  provider: 'local' | 'cloud' | 'auto';
  localUrl: string; // http://localhost:11434
  localModel: string;
  cloudApiKey: string;
  cloudModel: string; // glm-4.5v или glm-4.6
  cloudBaseUrl: string;
  temperature: number;
  maxTokens: number;
  cloudProvider: 'openai' | 'gemini' | 'groq' | 'openrouter';
}

/**
 * Профили облачных провайдеров (M4).
 * openai/groq/openrouter — OpenAI-совместимые (один код-путь chatCloud),
 * gemini — нативный API (chatGemini).
 */
export type CloudProviderName = LLMConfig['cloudProvider'];

interface CloudProfile {
  provider: CloudProviderName;
  baseUrl: string;
  envKey: string;
  defaultModel: string;
  kind: 'openai-compat' | 'gemini';
}

const CLOUD_PROFILES: CloudProfile[] = [
  {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    kind: 'openai-compat',
  },
  {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-flash-latest',
    kind: 'gemini',
  },
  {
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    kind: 'openai-compat',
  },
  {
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o-mini',
    kind: 'openai-compat',
  },
];

export interface CloudTarget {
  profile: CloudProfile;
  apiKey: string;
  model: string;
  baseUrl: string;
}

/**
 * Строит упорядоченную цепочку облачных целей:
 *  1) настроенный провайдер (ключ из UI или из env),
 *  2) остальные провайдеры, у которых есть ключ в окружении.
 * Пустой массив = облако не сконфигурировано.
 */
export function resolveCloudTargets(cfg: LLMConfig): CloudTarget[] {
  const envKey = (k: string): string => (process.env[k] ?? '').trim();
  const targets: CloudTarget[] = [];

  const configured =
    CLOUD_PROFILES.find((p) => p.provider === cfg.cloudProvider) ?? CLOUD_PROFILES[0];
  const configuredKey = (cfg.cloudApiKey ?? '').trim() || envKey(configured.envKey);
  if (configuredKey) {
    targets.push({
      profile: configured,
      apiKey: configuredKey,
      model: cfg.cloudModel || configured.defaultModel,
      baseUrl: cfg.cloudBaseUrl || configured.baseUrl,
    });
  }

  for (const p of CLOUD_PROFILES) {
    if (p.provider === configured.provider) continue;
    const key = envKey(p.envKey);
    if (key) {
      targets.push({ profile: p, apiKey: key, model: p.defaultModel, baseUrl: p.baseUrl });
    }
  }

  return targets;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LLMResponse {
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tokens_used?: number;
  provider: 'local' | 'cloud';
}

// Config is now managed by unified config store (electron/ai/config.ts)
// No separate electron-store instance here

export function getLLMConfig(): LLMConfig {
  return getLLMConfigFromConfig();
}

export function setLLMConfig(patch: Partial<LLMConfig>): void {
  setLLMConfigStore(patch);
}

/**
 * Проверяет, доступен ли локальный Ollama.
 */
export async function isOllamaAvailable(url: string = getLLMConfig().localUrl): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Список доступных моделей в Ollama.
 */
export async function listOllamaModels(url: string = getLLMConfig().localUrl): Promise<string[]> {
  try {
    const resp = await fetch(`${url}/api/tags`);
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Честная суммаризация текста локальной моделью (Ollama).
 *
 * Возвращает '' если Ollama недоступна или запрос не удался —
 * вызывающий код ДОЛЖЕН пропустить сжатие, а не фабриковать краткое содержание.
 */
export async function summarizeText(
  text: string,
  options?: { maxInputChars?: number; temperature?: number }
): Promise<string> {
  const cfg = getLLMConfig();
  // Только локальный Ollama — бесплатно, приватно, без неожиданных облачных расходов.
  if (cfg.provider !== 'local' && cfg.provider !== 'auto') return '';

  const available = await isOllamaAvailable(cfg.localUrl);
  if (!available) return '';

  const maxInputChars = options?.maxInputChars ?? 12000;
  const truncated = text.length > maxInputChars
    ? text.slice(0, maxInputChars) + '\n…'
    : text;

  try {
    const resp = await fetch(`${cfg.localUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.localModel,
        messages: [
          {
            role: 'system',
            content:
              'Ты — система сжатия долговременной памяти. Сократи переписку до краткого резюме на русском: ' +
              'ключевые факты, решения, предпочтения пользователя. 3–7 предложений, без воды и нумерации. ' +
              'Если контента мало — верни 1–2 предложения.',
          },
          { role: 'user', content: truncated },
        ],
        stream: false,
        options: { temperature: options?.temperature ?? 0.2, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = (await resp.json()) as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(data.error);
    const content = (data.message?.content ?? '').trim();
    return content.length > 20 ? content : '';
  } catch (e) {
    console.warn(`[LLM] summarizeText failed: ${(e as Error).message}`);
    return '';
  }
}


/**
 * Главный метод — чат с tools.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: any }>,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const cfg = getLLMConfig();

  if (cfg.provider === 'local' || (cfg.provider === 'auto' && (await isOllamaAvailable(cfg.localUrl)))) {
    try {
      return await chatOllama(cfg, messages, tools, signal);
    } catch (e) {
      console.error('[LLM] Ollama failed, falling back to cloud:', e);
      if (cfg.provider === 'local') throw e;
    }
  }

  // M4: цепочка облачных провайдеров (настроенный → остальные с ключами в env)
  const targets = resolveCloudTargets(cfg);
  let lastErr: unknown = null;
  for (const t of targets) {
    const cloudCfg: LLMConfig = {
      ...cfg,
      cloudProvider: t.profile.provider,
      cloudApiKey: t.apiKey,
      cloudBaseUrl: t.baseUrl,
      cloudModel: t.model,
    };
    try {
      const res =
        t.profile.kind === 'gemini'
          ? await chatGemini(cloudCfg, messages, tools, signal)
          : await chatCloud(cloudCfg, messages, tools, signal);
      console.log(`[LLM] Cloud provider OK: ${t.profile.provider} (${t.model})`);
      return res;
    } catch (e) {
      lastErr = e;
      console.warn(`[LLM] Cloud provider ${t.profile.provider} failed:`, (e as Error).message);
    }
  }

  // Финальный fallback: локальный Ollama
  if (await isOllamaAvailable(cfg.localUrl)) {
    console.warn('[LLM] Falling back to local Ollama:', cfg.localModel);
    return chatOllama(cfg, messages, tools, signal);
  }
  if (lastErr) throw lastErr;
  throw new Error(
    'Нет доступного LLM: Ollama не запущена и нет облачных ключей ' +
      '(OPENAI_API_KEY / GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY).'
  );
}

/**
 * Streaming-версия chatWithTools.
 *
 * Вместо ожидания полного ответа, вызывает onChunk() по мере получения токенов.
 * Возвращает финальный результат (как chatWithTools).
 *
 * Семантика чанков:
 *  - onChunk({ type: 'text', delta: '...слово...' }) — кусочек текста
 *  - onChunk({ type: 'tool_calls', tool_calls: [...] }) — LLM решила вызвать инструменты
 *  - onChunk({ type: 'done', content, tool_calls }) — финальный результат
 *  - onChunk({ type: 'error', error: '...' }) — ошибка
 *
 * Важно: при стриминге с tool_calls, текст обычно пустой (LLM либо вызывает tool, либо пишет текст).
 */
export async function chatWithToolsStream(
  messages: ChatMessage[],
  tools: Array<{ type: 'function'; function: any }>,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const cfg = getLLMConfig();

  if (cfg.provider === 'local' || (cfg.provider === 'auto' && (await isOllamaAvailable(cfg.localUrl)))) {
    try {
      return await chatOllamaStream(cfg, messages, tools, onChunk, signal);
    } catch (e) {
      console.error('[LLM] Ollama stream failed, falling back to cloud:', e);
      if (cfg.provider === 'local') throw e;
    }
  }

  // M4: цепочка облачных провайдеров (стрим)
  const targets = resolveCloudTargets(cfg);
  let lastErr: unknown = null;
  for (const t of targets) {
    const cloudCfg: LLMConfig = {
      ...cfg,
      cloudProvider: t.profile.provider,
      cloudApiKey: t.apiKey,
      cloudBaseUrl: t.baseUrl,
      cloudModel: t.model,
    };
    try {
      const res =
        t.profile.kind === 'gemini'
          ? await chatGeminiStream(cloudCfg, messages, tools, onChunk, signal)
          : await chatCloudStream(cloudCfg, messages, tools, onChunk, signal);
      console.log(`[LLM] Cloud stream OK: ${t.profile.provider} (${t.model})`);
      return res;
    } catch (e) {
      lastErr = e;
      console.warn(`[LLM] Cloud stream ${t.profile.provider} failed:`, (e as Error).message);
    }
  }

  // Финальный fallback: локальный Ollama (стрим)
  if (await isOllamaAvailable(cfg.localUrl)) {
    console.warn('[LLM] Falling back to local Ollama stream:', cfg.localModel);
    return chatOllamaStream(cfg, messages, tools, onChunk, signal);
  }
  if (lastErr) throw lastErr;
  throw new Error(
    'Нет доступного LLM (stream): Ollama не запущена и нет облачных ключей ' +
      '(OPENAI_API_KEY / GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY).'
  );
}

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_calls'; tool_calls: NonNullable<LLMResponse['tool_calls']> }
  | { type: 'done'; content: string; tool_calls?: LLMResponse['tool_calls']; provider: 'local' | 'cloud' }
  | { type: 'error'; error: string };



/**
 * Локальный чат через Ollama (нативный /api/chat).
 * /v1/chat/completions не поддерживает options.num_ctx — Gemma 4 крашится.
 */
async function chatOllama(cfg: LLMConfig, messages: ChatMessage[], tools: any[], signal?: AbortSignal): Promise<LLMResponse> {
  const optimalCtx = getOptimalContextTokens();
  const body: any = {
    model: cfg.localModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    options: { num_ctx: optimalCtx, num_predict: cfg.maxTokens, temperature: cfg.temperature },
    stream: false,
    // keep_alive: простой > keep_alive минут → Ollama сам выгрузит модель из VRAM.
    // Это даёт локальный VRAM-gate без отдельного gaming-детекта: пока играешь/кодишь,
    // запросов к модели нет → VRAM освобождается автоматически.
    keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '5m',
  };
  if (tools.length > 0) { body.tools = tools; }
  // Qwen3 — отключаем reasoning-блок: быстрее и меньше токенов (проверено: 1.7b → ~14с на извлечение)
  if (cfg.localModel.startsWith('qwen')) {
    body.think = false;
  }

  const resp = await fetch(`${cfg.localUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(180000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Ollama ${resp.status}: ${txt}`);
  }

  const data = await resp.json() as {
    message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: any } }> };
    done?: boolean;
    total_duration?: number;
  };

  const toolCalls = data.message?.tool_calls?.map((tc) => ({
    id: `call_${Date.now()}`,
    type: 'function' as const,
    function: {
      name: tc.function.name,
      arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments),
    },
  }));

  return {
    tool_calls: toolCalls ?? extractToolCallsFromContent(data.message?.content ?? ""),
    content: data.message?.content ?? '',
    tokens_used: undefined,
    provider: 'local',
  };
}

/**
 * Streaming-версия локального чата через Ollama (нативный /api/chat).
 */
async function chatOllamaStream(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: any[],
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const optimalCtx = getOptimalContextTokens();
  const body: any = {
    model: cfg.localModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    options: { num_ctx: optimalCtx, num_predict: cfg.maxTokens, temperature: cfg.temperature },
    stream: true,
    // keep_alive: VRAM-gate на простой (см. non-stream ветку)
    keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '5m',
  };
  if (tools.length > 0) { body.tools = tools; }
  // Qwen3 — отключаем reasoning-блок в стриме тоже
  if (cfg.localModel.startsWith('qwen')) {
    body.think = false;
  }

  const resp = await fetch(`${cfg.localUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(180000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Ollama ${resp.status}: ${txt}`);
  }

  if (!resp.body) {
    throw new Error('Ollama stream: нет тела ответа');
  }

  let fullContent = '';
  let toolCalls: NonNullable<LLMResponse['tool_calls']> | undefined;
  let totalTokens: number | undefined;

  const bodyStream = resp.body as unknown as NodeJS.ReadableStream;
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of bodyStream) {
    const value = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk as unknown as string);
    buffer += decoder.decode(value, { stream: true });

    let nlIdx: number;
    while ((nlIdx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);
      if (!line) continue;

      try {
        const data = JSON.parse(line) as {
          message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: any } }> };
          done?: boolean;
          total_duration?: number;
        };

        if (data.message?.content) {
          fullContent += data.message.content;
          onChunk({ type: 'text', delta: data.message.content });
        }

        if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
          if (!toolCalls) toolCalls = [];
          for (const tc of data.message.tool_calls) {
            const t = {
              id: `call_${Date.now()}_${toolCalls.length}`,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments),
              },
            };
            toolCalls.push(t);
          }
        }

        if (data.done) {
          break;
        }
      } catch {
        // skip invalid JSON lines
      }
    }
  }

  if (!toolCalls && tools.length > 0) {
    toolCalls = extractToolCallsFromContent(fullContent);
  }

  if (toolCalls && toolCalls.length > 0) {
    onChunk({ type: 'tool_calls', tool_calls: toolCalls });
  }
  onChunk({ type: 'done', content: fullContent, tool_calls: toolCalls, provider: 'local' });

  return {
    content: fullContent,
    tool_calls: toolCalls,
    tokens_used: totalTokens,
    provider: 'local',
  };
}

/**
 * Streaming-версия облачного чата через Z.ai.
 * Z.ai поддерживает OpenAI-совместимый SSE формат (data: {...}\n\n).
 */
async function chatCloudStream(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: any[],
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  if (!cfg.cloudApiKey) {
    throw new Error('Облачный API ключ не настроен. Установите ZAI_API_KEY или настройте в UI.');
  }

  const body: any = {
    model: cfg.cloudModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: true,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const resp = await fetch(`${cfg.cloudBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.cloudApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Cloud ${resp.status}: ${txt}`);
  }

  if (!resp.body) {
    throw new Error('Cloud stream: нет тела ответа');
  }

  let fullContent = '';
  let toolCalls: NonNullable<LLMResponse['tool_calls']> | undefined;
  let totalTokens: number | undefined;
  let reasoningOpen = false;

  // SSE формат: "data: {...}\n\n", заканчивается "data: [DONE]\n\n"
  const bodyStream = resp.body as unknown as NodeJS.ReadableStream;
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of bodyStream) {
    const value = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk as unknown as string);
    buffer += decoder.decode(value, { stream: true });

    // Обрабатываем SSE-события (разделяются \n\n)
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const lines = event.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
              };
              finish_reason?: string;
            }>;
            usage?: { total_tokens: number };
          };

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          // DeepSeek reasoning_content → оборачиваем в <think> для UI
          if (choice.delta?.reasoning_content) {
            const text = choice.delta.reasoning_content;
            if (!reasoningOpen) {
              fullContent += '<think>';
              reasoningOpen = true;
            }
            fullContent += text;
            onChunk({ type: 'text', delta: text });
          }

          if (choice.delta?.content) {
            if (reasoningOpen) {
              fullContent += '</think>';
              reasoningOpen = false;
            }
            fullContent += choice.delta.content;
            onChunk({ type: 'text', delta: choice.delta.content });
          }

          if (choice.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
            if (!toolCalls) toolCalls = [];
            for (const tc of choice.delta.tool_calls) {
              const existing = toolCalls.find((t) => t.id === tc.id);
              if (existing) {
                existing.function.arguments += tc.function.arguments;
              } else {
                toolCalls.push({ ...tc, function: { ...tc.function } });
              }
            }
          }

          if (chunk.usage?.total_tokens) {
            totalTokens = chunk.usage.total_tokens;
          }
        } catch (e) {
          console.debug('[Stream] skip SSE data:', data.slice(0, 80));
        }
      }
    }
  }

  if (reasoningOpen) {
    fullContent += '</think>';
  }

  if (toolCalls && toolCalls.length > 0) {
    onChunk({ type: 'tool_calls', tool_calls: toolCalls });
  }
  onChunk({ type: 'done', content: fullContent, tool_calls: toolCalls, provider: 'cloud' });

  return {
    content: fullContent,
    tool_calls: toolCalls,
    tokens_used: totalTokens,
    provider: 'cloud',
  };
}

/**
 * Облачный чат через Z.ai (OpenAI-совместимый API).
 */
async function chatCloud(cfg: LLMConfig, messages: ChatMessage[], tools: any[], signal?: AbortSignal): Promise<LLMResponse> {
  if (!cfg.cloudApiKey) {
    throw new Error('Облачный API ключ не настроен. Установите ZAI_API_KEY или настройте в UI.');
  }

  const body: any = {
    model: cfg.cloudModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    stream: false,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const resp = await fetch(`${cfg.cloudBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.cloudApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Cloud ${resp.status}: ${txt}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{
      message: { content?: string; reasoning_content?: string; tool_calls?: any[] };
      finish_reason: string;
    }>;
    usage?: { total_tokens: number };
  };

  const choice = data.choices[0];
  let content = choice.message.content ?? '';
  if (choice.message.reasoning_content) {
    content = `<think>${choice.message.reasoning_content}</think>` + content;
  }
  return {
    content,
    tokens_used: data.usage?.total_tokens,
    provider: 'cloud',
  };
}

/**
 * Cached Z.ai SDK instance (avoid dynamic import on every call).
 */

/**
 * Convert internal messages format to Gemini API contents array + system_instruction.
 */
function convertToGeminiMessages(
  messages: ChatMessage[]
): { contents: any[]; systemInstruction: string } {
  let systemInstruction = '';

  // Extract all system prompts
  const nonSystem = messages.filter((m) => {
    if (m.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + m.content;
      return false;
    }
    return true;
  });

  const contents: any[] = [];
  for (const msg of nonSystem) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const parts: any[] = msg.content ? [{ text: msg.content }] : [];
        for (const tc of msg.tool_calls) {
          let args: Record<string, any> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          parts.push({
            functionCall: { name: tc.function.name, args },
          });
        }
        contents.push({ role: 'model', parts });
      } else {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    } else if (msg.role === 'tool') {
      let parsedContent: any = {};
      try { parsedContent = JSON.parse(msg.content || '{}'); } catch {}
      // tool_call_id contains the function name in our format
      // But we need the function name - find it from previous assistant message
      // If not found, try to extract from content
      let funcName = 'unknown';
      if (msg.tool_call_id) {
        // Look back for which function this matches
        for (let i = nonSystem.indexOf(msg) - 1; i >= 0; i--) {
          const prev = nonSystem[i];
          if (prev.role === 'assistant' && prev.tool_calls) {
            const match = prev.tool_calls.find(tc => tc.id === msg.tool_call_id);
            if (match) { funcName = match.function.name; break; }
          }
        }
      }
      // Extract result data
      const responseContent = parsedContent.success !== undefined
        ? { success: parsedContent.success, data: parsedContent.data, error: parsedContent.error }
        : parsedContent;

      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: funcName,
            response: {
              name: funcName,
              content: responseContent,
            },
          },
        }],
      });
    }
  }

  return { contents, systemInstruction };
}

/**
 * Convert internal tool definitions to Gemini functionDeclarations format.
 */
function convertToolsToGemini(tools: Array<{ type: string; function: any }>): any[] {
  if (!tools || tools.length === 0) return [];
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: t.function.parameters || { type: 'object', properties: {} },
    })),
  }];
}

/**
 * Parse Gemini response into our internal LLMResponse format.
 */
function parseGeminiResponse(data: any): LLMResponse {
  const candidate = data.candidates?.[0];
  if (!candidate) return { content: '', provider: 'cloud' };

  const parts = candidate.content?.parts ?? [];
  let textContent = '';
  const toolCalls: LLMResponse['tool_calls'] = [];

  for (const part of parts) {
    if (part.text) {
      textContent += part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        id: `call_gemini_${Date.now()}_${toolCalls.length}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        },
      });
    }
  }

  return {
    content: textContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    tokens_used: data.usageMetadata?.totalTokenCount,
    provider: 'cloud',
  };
}

/**
 * Non-streaming chat with Gemini API.
 */
async function chatGemini(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: any[],
  signal?: AbortSignal
): Promise<LLMResponse> {
  if (!cfg.cloudApiKey) {
    throw new Error('API key not configured for Gemini. Set cloudApiKey in settings.');
  }

  const { contents, systemInstruction } = convertToGeminiMessages(messages);

  const body: any = {
    contents,
    generationConfig: {
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (tools.length > 0) {
    body.tools = convertToolsToGemini(tools);
  }

  const resp = await fetch(
    `${cfg.cloudBaseUrl}/models/${cfg.cloudModel}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': cfg.cloudApiKey,
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(120000),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  return parseGeminiResponse(data);
}

/**
 * Streaming chat with Gemini API (uses streamGenerateContent).
 */
async function chatGeminiStream(
  cfg: LLMConfig,
  messages: ChatMessage[],
  tools: any[],
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  if (!cfg.cloudApiKey) {
    throw new Error('API key not configured for Gemini. Set cloudApiKey in settings.');
  }

  const { contents, systemInstruction } = convertToGeminiMessages(messages);

  const body: any = {
    contents,
    generationConfig: {
      temperature: cfg.temperature,
      maxOutputTokens: cfg.maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (tools.length > 0) {
    body.tools = convertToolsToGemini(tools);
  }

  // Use streamGenerateContent with SSE
  const resp = await fetch(
    `${cfg.cloudBaseUrl}/models/${cfg.cloudModel}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': cfg.cloudApiKey,
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(120000),
    }
  );

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${txt}`);
  }

  if (!resp.body) {
    throw new Error('Gemini stream: no response body');
  }

  let fullContent = '';
  let toolCalls: NonNullable<LLMResponse['tool_calls']> | undefined;
  let totalTokens: number | undefined;
  let textAccumulated = false;

  // SSE format: "data: {...}\n\n" or just "data: {...}"
  const bodyStream = resp.body as unknown as NodeJS.ReadableStream;
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of bodyStream) {
    const value = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk as unknown as string);
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const candidate = parsed.candidates?.[0];
          if (!candidate) continue;

          const parts = candidate.content?.parts ?? [];

          for (const part of parts) {
            if (part.text) {
              textAccumulated = true;
              fullContent += part.text;
              onChunk({ type: 'text', delta: part.text });
            }
            if (part.functionCall) {
              if (!toolCalls) toolCalls = [];
              toolCalls.push({
                id: `call_gemini_${Date.now()}_${toolCalls.length}`,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args ?? {}),
                },
              });
            }
          }

          if (parsed.usageMetadata?.totalTokenCount) {
            totalTokens = parsed.usageMetadata.totalTokenCount;
          }
        } catch (e) {
          console.debug('[Gemini Stream] skip parse:', (e as Error).message);
        }
      }
    }
  }

  if (toolCalls && toolCalls.length > 0) {
    onChunk({ type: 'tool_calls', tool_calls: toolCalls });
  }
  onChunk({ type: 'done', content: fullContent, tool_calls: toolCalls, provider: 'cloud' });

  return {
    content: fullContent,
    tool_calls: toolCalls,
    tokens_used: totalTokens,
    provider: 'cloud',
  };
}

/**
 * Gemini thought signatures - maps function call IDs to their thought signatures.
 * Required by Gemini API for multi-turn tool calling.
 */
const geminiThoughtSignatures = new Map<string, string>();

let _zaiInstance: any = null;
let _zaiInitPromise: Promise<any> | null = null;

export async function getZAISDK(): Promise<any> {
  if (_zaiInstance) return _zaiInstance;
  if (_zaiInitPromise) return _zaiInitPromise;

  _zaiInitPromise = (async () => {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      _zaiInstance = await ZAI.create();
      return _zaiInstance;
    } catch (e) {
      _zaiInitPromise = null; // allow retry
      throw new Error(`Failed to init Z.ai SDK: ${(e as Error).message}`);
    }
  })();

  return _zaiInitPromise;
}

/**
 * Vision-анализ (только облако — локально сложно).
 * Альтернатива: локальный LLaVA через Ollama, если установлена.
 */
export async function analyzeImage(
  imageBase64: string,
  question: string,
  systemPrompt: string
): Promise<string> {
  const cfg = getLLMConfig();

  // Пробуем локальный LLaVA
  if (cfg.provider !== 'cloud' && (await isOllamaAvailable(cfg.localUrl))) {
    try {
      const resp = await fetch(`${cfg.localUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llava:7b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question, images: [imageBase64] },
          ],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = (await resp.json()) as { message?: { content?: string }; error?: string };
      if (data.error) throw new Error(data.error);
      return data.message?.content ?? 'Не удалось проанализировать.';
    } catch (e) {
      console.error('[VLM] Local LLaVA failed, falling back:', e);
    }
  }

  // Cloud fallback через Z.ai vision API
  if (!cfg.cloudApiKey) {
    return 'Анализ изображений недоступен: нет ни локального LLaVA, ни облачного API ключа.';
  }

  // Cache ZAI SDK instance (avoid 50-200ms dynamic import on every call)
  const zai = await getZAISDK();
  const vlmResp = await zai.chat.completions.createVision({
    model: 'glm-4.5v',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: question },
          {
            type: 'image_url',
            image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}` },
          },
        ],
      },
    ],
  });
  return (
    (vlmResp as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ??
    'Не удалось проанализировать изображение.'
  );
}

/**
 * Fallback: extract tool calls from LLM text content.
 * Some models (Qwen 2.5 3B) write tool calls as <json>{...}</json> instead of API tool_calls.
 */
function extractToolCallsFromContent(content: string): LLMResponse['tool_calls'] | undefined {
  const jsonMatch = content.match(/<json>\s*(\{[\s\S]*?\})\s*<\/json>/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.name) {
        return [{
          id: `call_fallback_${Date.now()}`,
          type: 'function' as const,
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments),
          },
        }];
      }
    } catch { /* ignore parse errors */ }
  }
  return undefined;
}




