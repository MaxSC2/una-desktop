/**
 * Multi-agent orchestrator — Router → Specialists → Verifier.
 *
 * Архитектура:
 *  1. Router LLM анализирует запрос, определяет какого специалиста вызвать
 *  2. Specialist (files/shell/screen/chat/memory) выполняет задачу с нужными инструментами
 *  3. Verifier (для опасных операций) проверяет результат вторым LLM-вызовом
 *  4. Для critical-dangerous: self-consistency (3 LLM + голосование)
 *
 * Преимущества:
 *  - Каждый агент имеет специализированный system prompt
 *  - Можно использовать разные LLM для разных агентов
 *  - Параллельное выполнение (несколько агентов одновременно)
 */

import { chatWithTools, ChatMessage, LLMResponse } from '../ai/llm';
import { TOOL_DEFINITIONS, dispatchTool, ToolContext, ToolResult } from '../tools';
import { classifyCommand } from '../safety/classifier';
import { selfConsistency, retryWithBackoff, cachedCall } from './rlm-extensions';

export type AgentType = 'router' | 'files' | 'shell' | 'screen' | 'chat' | 'memory' | 'verifier';

export interface AgentConfig {
  type: AgentType;
  systemPrompt: string;
  allowedTools: string[];
  model?: string; // переопределение модели для этого агента
  temperature?: number;
}

export interface MultiAgentResult {
  routerDecision: AgentType;
  specialistResponse: LLMResponse;
  verifierResult?: {
    approved: boolean;
    reason: string;
    corrections?: string;
  };
  selfConsistencyResult?: {
    votes: boolean[];
    finalDecision: boolean;
  };
  toolCallHistory: Array<{
    agent: AgentType;
    name: string;
    args: Record<string, unknown>;
    result: ToolResult;
    timestamp: string;
  }>;
}

// ============================================================
// КОНФИГУРАЦИЯ АГЕНТОВ
// ============================================================

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  router: {
    type: 'router',
    systemPrompt: `Ты — Router, маршрутизатор запросов в multi-agent системе U.N.A.
Анализируй запрос пользователя и определяй, какой специалист лучше подойдёт:
- files: работа с файлами (чтение, запись, поиск)
- shell: shell-команды, system info
- screen: зрение, скриншоты, анализ экрана
- chat: диалог, советы, уточнения
- memory: память, факты, поиск по истории

Отвечай ОДНИМ словом: files, shell, screen, chat, или memory.
Если задача комплексная — выбери главного (например, files для "открой файл и ...").`,
    allowedTools: ['ask_clarification'],
    temperature: 0.3,
  },
  files: {
    type: 'files',
    systemPrompt: `Ты — files_agent, специалист по файловой системе U.N.A.
Ты работаешь с файлами: читаешь, пишешь, ищешь, редактируешь.
Используй инструменты: list_files, read_file, write_file, find_files, edit_file, grep, apply_patch.
Безопасность: защищённые файлы (.env, *.key, id_rsa) недоступны. Вне домашней папки — подтверждение.
Отвечай кратко и по делу. Если файл не найден — скажи, не выдумывай.`,
    allowedTools: ['list_files', 'read_file', 'write_file', 'find_files', 'edit_file', 'grep', 'apply_patch', 'ask_clarification'],
    temperature: 0.4,
  },
  shell: {
    type: 'shell',
    systemPrompt: `Ты — shell_agent, DevOps инженер U.N.A.
Выполняешь shell-команды, получаешь system info, работаешь с процессами.
Опасные команды (rm -rf, sudo, mkfs) требуют подтверждения через request_confirmation.
Никогда не выполняй: rm -rf /, mkfs, dd в /dev, fork bomb, shutdown, reboot.
Отвечай с выводом команды (stdout/stderr), кратко.`,
    allowedTools: ['execute_command', 'system_info', 'request_confirmation', 'ask_clarification'],
    temperature: 0.3,
  },
  screen: {
    type: 'screen',
    systemPrompt: `Ты — screen_agent, эксперт по UI/UX и зрению U.N.A.
Делаешь скриншоты, анализируешь экран через VLM, помогаешь с визуальными задачами.
Используй: take_screenshot, analyze_screen.
Приватность: банковские сайты, почта, пароли — не анализируй. Спроси разрешение если сомневаешься.`,
    allowedTools: ['take_screenshot', 'analyze_screen', 'ask_clarification'],
    temperature: 0.5,
  },
  chat: {
    type: 'chat',
    systemPrompt: `Ты — chat_agent, напарник и собеседник U.N.A.
Ты НЕ слуга и НЕ клоун. Ты — коллега, который работает вместе с пользователем.
Можешь шутить, но приоритет — реальная работа. Честно говори когда не знаешь.
Используй ask_clarification когда запрос неоднозначен. memory_save для важных фактов.
Отвечай на русском, кратко (если пользователь не просит развёрнуто).`,
    allowedTools: ['ask_clarification', 'memory_save', 'memory_recall', 'web_search', 'web_fetch', 'request_confirmation'],
    temperature: 0.7,
  },
  memory: {
    type: 'memory',
    systemPrompt: `Ты — memory_agent, хранитель памяти U.N.A.
Сохраняешь факты о пользователе, вспоминаешь по теме, ведёшь knowledge base.
Используй: memory_save, memory_recall. Категории: user, project, preference, task.
Сохраняй только важное, не мусор. Если факт уже есть — обновляй, не дублируй.`,
    allowedTools: ['memory_save', 'memory_recall', 'ask_clarification'],
    temperature: 0.3,
  },
  verifier: {
    type: 'verifier',
    systemPrompt: `Ты — Verifier, проверяющий результаты опасных операций U.N.A.
Получаешь: исходную задачу, что сделал агент, какой результат.
Отвечай JSON: { "approved": true/false, "reason": "...", "corrections": "..." }
approved=false если: операция не выполнена, результат неверный, нарушена безопасность.
Будь строгим — лучше отклонить, чем пропустить ошибку.`,
    allowedTools: [],
    temperature: 0.2,
  },
};

// ============================================================
// ROUTER
// ============================================================

/**
 * Router анализирует запрос и выбирает агента.
 */
export async function routeRequest(
  userMessage: string,
  context: ChatMessage[]
): Promise<AgentType> {
  const routerConfig = AGENT_CONFIGS.router;

  const routerTools = TOOL_DEFINITIONS.filter((t) =>
    routerConfig.allowedTools.includes(t.function.name)
  );

  const messages: ChatMessage[] = [
    { role: 'system', content: routerConfig.systemPrompt },
    ...context.slice(-5), // последние 5 сообщений для контекста
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await chatWithTools(messages, routerTools);
    const content = response.content.toLowerCase().trim();

    // Извлекаем тип агента из ответа
    const agentMatch = content.match(/\b(files|shell|screen|chat|memory)\b/);
    if (agentMatch) {
      return agentMatch[1] as AgentType;
    }

    // Fallback: chat agent
    console.warn('[Router] Не удалось определить агента из:', content);
    return 'chat';
  } catch (e) {
    console.error('[Router] Error:', e);
    return 'chat';
  }
}

// ============================================================
// SPECIALIST
// ============================================================

/**
 * Specialist выполняет задачу с нужными инструментами.
 */
export async function runSpecialist(
  agentType: AgentType,
  userMessage: string,
  context: ChatMessage[],
  toolContext: ToolContext,
  maxRounds: number = 6
): Promise<{ response: LLMResponse; toolCallHistory: MultiAgentResult['toolCallHistory'] }> {
  const config = AGENT_CONFIGS[agentType];
  if (!config) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const specialistTools = TOOL_DEFINITIONS.filter((t) =>
    config.allowedTools.includes(t.function.name)
  );

  const messages: ChatMessage[] = [
    { role: 'system', content: config.systemPrompt },
    ...context.slice(-10),
    { role: 'user', content: userMessage },
  ];

  const toolCallHistory: MultiAgentResult['toolCallHistory'] = [];
  let finalResponse: LLMResponse | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const response = await chatWithTools(messages, specialistTools);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      finalResponse = response;
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      tool_calls: response.tool_calls,
    });

    // Выполняем tool calls
    let needsConfirmation = false;
    for (const call of response.tool_calls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(call.function.arguments || '{}');
      } catch {
        // ignore parse errors
      }

      const result = await dispatchTool(call.function.name, parsedArgs, toolContext);

      toolCallHistory.push({
        agent: agentType,
        name: call.function.name,
        args: parsedArgs,
        result,
        timestamp: new Date().toISOString(),
      });

      if (result.needs_confirmation) {
        needsConfirmation = true;
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }

    if (needsConfirmation) {
      finalResponse = {
        content: 'Требуется подтверждение пользователя.',
        tool_calls: response.tool_calls,
        provider: response.provider,
      };
      break;
    }
  }

  if (!finalResponse) {
    finalResponse = {
      content: 'Достигнут лимит раундов. Задача может быть не завершена.',
      provider: 'local',
    };
  }

  return { response: finalResponse, toolCallHistory };
}

// ============================================================
// VERIFIER (для опасных операций)
// ============================================================

/**
 * Verifier проверяет результат опасной операции.
 * Вызывается после specialist, если операция была dangerous.
 */
export async function verifyResult(
  originalTask: string,
  agentResponse: LLMResponse,
  toolCallHistory: MultiAgentResult['toolCallHistory']
): Promise<MultiAgentResult['verifierResult']> {
  const verifierConfig = AGENT_CONFIGS.verifier;

  const summary = toolCallHistory
    .map(
      (tc) =>
        `- ${tc.name}(${JSON.stringify(tc.args).slice(0, 200)}) → ${
          tc.result.success ? 'success' : 'FAILED'
        }`
    )
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: verifierConfig.systemPrompt },
    {
      role: 'user',
      content: `Задача: ${originalTask}\n\nДействия агента:\n${summary}\n\nОтвет агента: ${agentResponse.content}\n\nПроверь: задача выполнена? Результат верный? Безопасность соблюдена?`,
    },
  ];

  try {
    const response = await chatWithTools(messages, []);
    const content = response.content.trim();

    // Пытаемся распарсить JSON из ответа
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: Boolean(parsed.approved),
          reason: String(parsed.reason ?? ''),
          corrections: parsed.corrections ? String(parsed.corrections) : undefined,
        };
      } catch {
        // ignore parse error, fallback below
      }
    }

    // Fallback: ищем ключевые слова
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('approved": true') || lowerContent.includes('одобрено')) {
      return { approved: true, reason: content };
    }
    return { approved: false, reason: content };
  } catch (e) {
    console.error('[Verifier] Error:', e);
    return {
      approved: false,
      reason: `Verifier error: ${(e as Error).message}`,
    };
  }
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Главный orchestrator — запускает router → specialist → verifier (опционально).
 */
export async function orchestrate(
  userMessage: string,
  context: ChatMessage[],
  toolContext: ToolContext,
  options: {
    verifyDangerous?: boolean;
    useSelfConsistency?: boolean;
  } = {}
): Promise<MultiAgentResult> {
  const { verifyDangerous = true, useSelfConsistency = false } = options;

  // 1. Router
  const agentType = await routeRequest(userMessage, context);
  console.log(`[Orchestrator] Router → ${agentType}`);

  // 2. Specialist
  const { response, toolCallHistory } = await runSpecialist(
    agentType,
    userMessage,
    context,
    toolContext
  );

  const result: MultiAgentResult = {
    routerDecision: agentType,
    specialistResponse: response,
    toolCallHistory,
  };

  // 3. Verifier (для опасных операций)
  if (verifyDangerous) {
    const hasDangerousOps = toolCallHistory.some((tc) => {
      if (tc.name === 'execute_command' && typeof tc.args.command === 'string') {
        const safety = classifyCommand(tc.args.command);
        return safety.level === 'dangerous';
      }
      return false;
    });

    if (hasDangerousOps) {
      console.log('[Orchestrator] Dangerous operation detected → running Verifier');
      result.verifierResult = await verifyResult(userMessage, response, toolCallHistory);

      // 4. Self-consistency для critical-dangerous
      if (useSelfConsistency && result.verifierResult && !result.verifierResult.approved) {
        console.log('[Orchestrator] Verifier rejected → running self-consistency (3 LLM)');
        const votes = await selfConsistency(
          async () => {
            const v = await verifyResult(userMessage, response, toolCallHistory);
            return v ? v.approved : false;
          },
          3 // 3 параллельных вызова
        );
        result.selfConsistencyResult = {
          votes,
          finalDecision: votes.filter(Boolean).length >= 2, // большинство
        };
      }
    }
  }

  return result;
}
