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

export interface LLMConfig {
  provider: 'local' | 'cloud' | 'auto';
  localUrl: string; // http://localhost:11434
  localModel: string;
  cloudApiKey: string;
  cloudModel: string; // glm-4.5v или glm-4.6
  cloudBaseUrl: string;
  temperature: number;
  maxTokens: number;
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

  return chatCloud(cfg, messages, tools, signal);
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

  return chatCloudStream(cfg, messages, tools, onChunk, signal);
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
  const body: any = {
    model: cfg.localModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    options: { num_ctx: 4096 },
    temperature: cfg.temperature,
    stream: false,
  };
  if (tools.length > 0) { body.tools = tools; }

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
  const body: any = {
    model: cfg.localModel,
    messages: messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    options: { num_ctx: 4096 },
    temperature: cfg.temperature,
    stream: true,
  };
  if (tools.length > 0) { body.tools = tools; }

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
                tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
              };
              finish_reason?: string;
            }>;
            usage?: { total_tokens: number };
          };

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
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
      message: { content: string; tool_calls?: any[] };
      finish_reason: string;
    }>;
    usage?: { total_tokens: number };
  };

  const choice = data.choices[0];
  return {
    content: choice.message.content ?? '',
    tokens_used: data.usage?.total_tokens,
    provider: 'cloud',
  };
}

/**
 * Cached Z.ai SDK instance (avoid dynamic import on every call).
 */
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
