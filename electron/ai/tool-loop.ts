/**
 * Tool Loop Executor — единый цикл function-calling.
 *
 * Заменяет дублирование в main.ts (chat:send и chat:stream имели ~130 строк идентичного кода).
 *
 * Архитектура:
 *  1. Вызывает LLM (streaming или non-streaming)
 *  2. Если LLM вернула tool_calls — выполняет их
 *  3. Результаты tools отправляются обратно в LLM
 *  4. Повторяет до MAX_ROUNDS или пока LLM не вернёт текст без tool_calls
 *
 * Поддержка:
 *  - Streaming (onChunk callback)
 *  - Non-streaming (просто ждёт результат)
 *  - Special tools (screenshot, memory) — обрабатываются inline
 *  - Safety (request_confirmation)
 */

import { BrowserWindow, desktopCapturer } from 'electron';
import { chatWithTools, chatWithToolsStream, ChatMessage, LLMResponse, StreamChunk } from './llm';
import { dispatchTool, getToolDefinitions, ToolContext, ToolResult } from '../tools';
import { saveFact, recallFacts } from '../memory/store';
import { analyzeImage } from './llm';
import { classifyCommand } from '../safety/classifier';
import { parseMemoryTokens, executeMemoryTokens, warmCacheAddMessage } from '../memory/rlm';
import { detectIntent, filterToolsByIntent } from './intent';
import { tryFastCommand } from './fast-path';
import { detectSemanticIntent, initSemanticRouter, SEMANTIC_CONFIDENCE_THRESHOLD } from './semantic-router';
import { resolveMode, filterToolsByMode, getModeConfig } from './modes';
import { reviewResponse } from './self-review';
import { detectCorrection, recordInteraction, learnFromMessage } from './meta-learning';

export interface ToolLoopOptions {
  /** Streaming mode — вызывает onChunk для каждого текстового кусочка */
  stream?: boolean;
  /** Callback для streaming chunks */
  onChunk?: (chunk: StreamChunk | { type: 'tool_start'; tools: string[] } | { type: 'tool_result'; name: string; success: boolean } | { type: 'tool_done' }) => void;
  /** Max rounds (default 6) */
  maxRounds?: number;
  /** System prompt */
  systemPrompt: string;
  /** Context messages (recent conversation) */
  context: ChatMessage[];
  /** User message */
  userMessage: string;
  /** Tool context (confirmedTokens etc.) */
  toolContext: ToolContext;
  /** Window for desktopCapturer (screenshot tool) */
  mainWindow?: BrowserWindow | null;
  /** System prompt for VLM (analyze_screen) */
  vlmSystemPrompt?: string;
  /** AbortSignal for stopping generation */
  signal?: AbortSignal;
}

export interface ToolLoopResult {
  /** Final text response from LLM */
  finalText: string;
  /** History of all tool calls made */
  toolCallHistory: Array<{
    name: string;
    args: Record<string, unknown>;
    result: ToolResult;
    timestamp: string;
  }>;
  /** Pending confirmation (if dangerous operation) */
  pendingConfirmation: ToolResult['needs_confirmation'] | null;
  /** Whether we hit max rounds without final answer */
  maxRoundsHit: boolean;
  /** Messages array (for saving to memory) */
  messages: ChatMessage[];
  /** Provider used */
  provider: 'local' | 'cloud' | undefined;
}

/**
 * Execute the tool-calling loop.
 * This is the SINGLE source of truth — replaces duplicated code in chat:send and chat:stream.
 */
export async function executeToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    stream = false,
    onChunk,
    maxRounds = 6,
    systemPrompt,
    context,
    userMessage,
    toolContext,
    mainWindow,
    vlmSystemPrompt,
    signal,
  } = options;

  // Определяем намерение и режим выполнения
  // L1: semantic router (embeddings) → fallback на regex
  const semantic = await detectSemanticIntent(userMessage);
  const intent =
    semantic.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD
      ? semantic.intent
      : detectIntent(userMessage);
  const mode = resolveMode(intent);

  // L0 fast-path: детерминированные команды («открой Discord») без LLM.
  const fastReply = await tryFastCommand(userMessage, toolContext);
  if (fastReply !== null) {
    console.log('[ToolLoop] Fast-path hit — LLM skipped');
    warmCacheAddMessage('user', userMessage);
    warmCacheAddMessage('assistant', fastReply);
    return {
      finalText: fastReply,
      toolCallHistory: [
        {
          name: '_fast_path',
          args: {},
          result: { success: true, data: { fast: true } },
          timestamp: new Date().toISOString(),
        },
      ],
      pendingConfirmation: null,
      maxRoundsHit: false,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: fastReply },
      ],
      provider: undefined,
    };
  }
  if (semantic.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD) {
    console.log(`[ToolLoop] Semantic intent: ${intent} (${semantic.confidence.toFixed(2)}), candidates: ${semantic.scores.map((s) => `${s.intent}:${s.score.toFixed(2)}`).join(', ')}`);
  }

  // L0: детерминированный быстрый путь — простые команды без LLM (< 50 мс, ноль GPU)
  const direct = await tryDirectCommand(userMessage, toolContext);
  if (direct) {
    if (onChunk) {
      onChunk({ type: 'tool_start', tools: direct.toolCallHistory.map((t) => t.name) });
      onChunk({ type: 'tool_done' });
    }
    return direct;
  }

  let currentTools = filterToolsByMode(getToolDefinitions(), mode);
  console.log(`[ToolLoop] Intent: ${intent}, Mode: ${mode}, tools: ${currentTools.length}/${getToolDefinitions().length}`);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...context,
    { role: 'user', content: userMessage },
  ];

  const toolCallHistory: ToolLoopResult['toolCallHistory'] = [];
  let pendingConfirmation: ToolResult['needs_confirmation'] | null = null;
  let finalText = '';
  let maxRoundsHit = false;
  let provider: 'local' | 'cloud' | undefined;

  for (let round = 0; round < maxRounds; round++) {
    // Round 2+: расширяем до всех инструментов (модель уже видит результаты tool call'ов)
    if (round >= 1) {
      currentTools = getToolDefinitions();
    }

    // Call LLM (streaming or non-streaming)
    let resp: LLMResponse;

    if (stream && onChunk) {
      resp = await chatWithToolsStream(messages, currentTools, (chunk) => {
        if (chunk.type === 'text' && chunk.delta) {
          onChunk({ type: 'text', delta: chunk.delta });
        }
      }, signal);
    } else {
      resp = await chatWithTools(messages, currentTools, signal);
    }

    provider = resp.provider;

    // Accumulate text across rounds (fix: finalText was only last round)
    if (resp.content) {
      finalText += (finalText ? '\n\n' : '') + resp.content;
    }

    // No tool calls = final answer
    if (!resp.tool_calls || resp.tool_calls.length === 0) {
      messages.push({ role: 'assistant', content: finalText });
      break;
    }

    // Has tool calls
    messages.push({
      role: 'assistant',
      content: resp.content ?? '',
      tool_calls: resp.tool_calls,
    });

    // Notify stream listeners about tool execution
    if (onChunk) {
      onChunk({
        type: 'tool_start',
        tools: resp.tool_calls.map((tc) => tc.function.name),
      });
    }

    // Execute each tool call
    for (const call of resp.tool_calls) {
      // Parse arguments (with error logging — no more empty catch)
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || '{}');
      } catch (e) {
        console.warn(`[ToolLoop] Failed to parse args for ${call.function.name}:`, (e as Error).message);
        console.warn(`[ToolLoop] Raw args:`, call.function.arguments?.slice(0, 200));
      }

      const toolName = call.function.name;

      // === Special tools that need main-process access ===

      // Screenshot / Screen analysis (needs desktopCapturer)
      if (toolName === 'take_screenshot' || toolName === 'analyze_screen') {
        const result = await handleScreenshotTool(
          toolName,
          parsedArgs,
          call.id,
          vlmSystemPrompt ?? ''
        );
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
        toolCallHistory.push({
          name: toolName,
          args: parsedArgs,
          result,
          timestamp: new Date().toISOString(),
        });
        if (onChunk) {
          onChunk({ type: 'tool_result', name: toolName, success: result.success });
        }
        continue;
      }

      // Memory save (needs store)
      if (toolName === 'memory_save') {
        const fact = String(parsedArgs.fact ?? '');
        const category = String(parsedArgs.category ?? 'user') as 'user' | 'project' | 'preference' | 'task';
        await saveFact(category, fact);
        const result: ToolResult = { success: true, data: { saved: true } };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
        toolCallHistory.push({
          name: 'memory_save',
          args: parsedArgs,
          result,
          timestamp: new Date().toISOString(),
        });
        if (onChunk) {
          onChunk({ type: 'tool_result', name: 'memory_save', success: true });
        }
        continue;
      }

      // Memory recall (needs store)
      if (toolName === 'memory_recall') {
        const query = String(parsedArgs.query ?? '');
        const facts = await recallFacts(query, 5);
        const result: ToolResult = { success: true, data: { facts } };
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
        toolCallHistory.push({
          name: 'memory_recall',
          args: parsedArgs,
          result,
          timestamp: new Date().toISOString(),
        });
        if (onChunk) {
          onChunk({ type: 'tool_result', name: 'memory_recall', success: true });
        }
        continue;
      }

      // === Standard tools (via dispatchTool) ===
      const result = await dispatchTool(toolName, parsedArgs, toolContext);

      toolCallHistory.push({
        name: toolName,
        args: parsedArgs,
        result,
        timestamp: new Date().toISOString(),
      });

      if (onChunk) {
        onChunk({ type: 'tool_result', name: toolName, success: result.success });
      }

      // Handle confirmation needed
      if (result.needs_confirmation) {
        pendingConfirmation = result.needs_confirmation;
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ pending_confirmation: true, ...result.needs_confirmation }),
        });
      } else {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    if (onChunk) {
      onChunk({ type: 'tool_done' });
    }

    // Confirmation now flows through the loop — tool results are in messages,
    // LLM decides how to proceed on the next round

    // Last round — check if we got an answer
    if (round === maxRounds - 1 && !finalText) {
      maxRoundsHit = true;
      finalText = '';
    }
  }

  // Log reason for empty response (code review fix 4.7)
  if (!finalText) {
    if (maxRoundsHit) {
      console.warn('[ToolLoop] Empty response: hit max rounds without final answer');
      finalText = 'Я сделала много шагов, но задача не завершена. Продолжить или остановиться?';
    } else {
      console.warn('[ToolLoop] Empty response: LLM returned empty content');
      finalText = 'Извините, я не смогла сформулировать ответ. Попробуйте переформулировать вопрос.';
    }
  }

  // RLM: Parse [MEM] memory tokens from LLM response
  const { tokens: memTokens, cleanResponse } = parseMemoryTokens(finalText);
  if (memTokens.length > 0) {
    finalText = cleanResponse;
    try {
      await executeMemoryTokens(memTokens);
    } catch (e) {
      console.warn('[ToolLoop] Memory token execution failed:', e);
    }
  }

  // RLM: Add to WARM cache
  warmCacheAddMessage('user', userMessage);
  warmCacheAddMessage('assistant', finalText);

  // Meta Learning: detect corrections and learn preferences
  try {
    const isCorrection = detectCorrection(userMessage);
    recordInteraction(isCorrection);
    learnFromMessage(userMessage);
  } catch (e) {
    console.warn('[ToolLoop] meta-learning failed:', e);
  }

  // Self Review: evaluate response quality
  try {
    const hadError = toolCallHistory.some((t) => !t.result.success);
    reviewResponse(userMessage, finalText, {
      toolCallCount: toolCallHistory.length,
      hadError,
    });
  } catch (e) {
    console.warn('[ToolLoop] self-review failed:', e);
  }

  return {
    finalText,
    toolCallHistory,
    pendingConfirmation,
    maxRoundsHit,
    messages,
    provider,
  };
}

/**
 * L0 — детерминированный pre-router.
 * Простые команды («открой Discord», «сколько памяти») выполняются
 * напрямую через инструменты, без запуска LLM.
 * Отклик < 50 мс, ноль нагрузки на GPU.
 */
const APP_ALIASES: Record<string, string> = {
  'браузер': 'chrome',
  'хром': 'chrome',
  'гугл': 'chrome',
  'телеграм': 'telegram',
  'telegram': 'telegram',
  'tg': 'telegram',
  'дискорд': 'discord',
  'discord': 'discord',
  'код': 'code',
  'vscode': 'code',
  'visual studio': 'code',
  'блокнот': 'notepad',
  'notepad': 'notepad',
  'калькулятор': 'calc',
  'calc': 'calc',
  'проводник': 'explorer',
  'explorer': 'explorer',
  'паинт': 'paint',
  'paint': 'paint',
};

async function tryDirectCommand(
  userMessage: string,
  ctx: ToolContext
): Promise<ToolLoopResult | null> {
  const t = userMessage.trim();
  if (!t || t.length > 80) return null;

  const mkResult = (
    name: string,
    args: Record<string, unknown>,
    result: ToolResult,
    finalText: string
  ): ToolLoopResult => ({
    finalText,
    toolCallHistory: [
      { name, args, result, timestamp: new Date().toISOString() },
    ],
    pendingConfirmation: null,
    maxRoundsHit: false,
    messages: [],
    provider: undefined,
  });

  // «открой / запусти X»
  const openMatch = t.match(
    /^(?:открой|откройте|запусти|запустите|запускай|open|launch|start)\s+(?:пожалуйста\s+)?(.{2,40})$/i
  );
  if (openMatch) {
    const raw = openMatch[1]
      .trim()
      .replace(/^(?:приложение|программу|софт|программы?)\s*/, '')
      .toLowerCase();
    if (!raw) return null;
    const app = APP_ALIASES[raw] ?? raw;
    const result = await dispatchTool('open_app', { app_name: app }, ctx);
    const finalText = result.success
      ? `Открываю «${app}».`
      : `Не нашла «${app}» в системе. Скажи точное имя приложения — попробую ещё раз.`;
    return mkResult('open_app', { app_name: app }, result, finalText);
  }

  // «сколько памяти / оперативки / загрузка CPU»
  if (
    /(?:оперативн|памят|ram|загрузк|cpu|процессор)/i.test(t) &&
    !/код|скрипт|напиши|найди файл/i.test(t)
  ) {
    const result = await dispatchTool('system_info', {}, ctx);
    if (result.success && result.data) {
      const d = result.data as Record<string, any>;
      const mem = d?.memory;
      const memPct = typeof mem?.used_pct === 'number' ? `${mem.used_pct}%` : '?';
      const cores = d?.cpu_cores ?? '?';
      const platform = d?.platform_name ?? d?.platform ?? '?';
      return mkResult(
        'system_info',
        {},
        result,
        `Система: ${platform}, ядер CPU: ${cores}, занято RAM: ${memPct}.`
      );
    }
  }

  return null;
}

/**
 * Handle screenshot/analyze_screen tools (need desktopCapturer + VLM).
 */
async function handleScreenshotTool(
  name: string,
  args: Record<string, unknown>,
  callId: string,
  vlmSystemPrompt: string
): Promise<ToolResult> {
  const question =
    name === 'analyze_screen'
      ? String(args.question ?? 'Опиши, что на экране.')
      : 'Опиши содержимое экрана пользователя.';

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 },
    });

    if (sources.length === 0) {
      return { success: false, error: 'Не удалось получить источник экрана' };
    }

    const base64 = sources[0].thumbnail.toPNG().toString('base64');
    const analysis = await analyzeImage(base64, question, vlmSystemPrompt);

    return {
      success: true,
      data: { analysis, question },
    };
  } catch (e) {
    return { success: false, error: `Screenshot/VLM failed: ${(e as Error).message}` };
  }
}

