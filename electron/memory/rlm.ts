/**
 * RLM (Recurrent Language Model) Memory System
 *
 * Manages a 3-tier memory hierarchy to fit context in ~4K tokens:
 *  - HOT:  what's in the LLM prompt right now (≤4K tokens, rebuilt per request)
 *  - WARM: in-memory cache for fast access (50 messages, 20 facts)
 *  - COLD: SQLite permanent storage (existing store.ts)
 *
 * Key innovation: [MEM] tokens — LLM manages its own memory by emitting
 * hidden [MEM] save:category:fact commands at the end of responses.
 */

import { recallFacts, saveFact, Fact, listPods, getPodByName, createPod, incrementPodUse, markFactForget as storeMarkFactForget, setFactImportance as storeSetFactImportance, listFacts } from './store';
import { getRelatedFacts } from './knowledge-graph';
import { findRelevantPods, classifyToPod } from './pods';
import { getMemoryConfig } from '../ai/config';
import { getOptimalContextTokens } from '../ai/resource-manager';

// ============================================================
// TYPES
// ============================================================

export interface RLMConfig {
  maxHotTokens: number;
  maxHistoryMessages: number;
  maxRecentFacts: number;
  hotSystemPromptMaxTokens: number;
  hotFactsMax: number;
  hotMessagesMax: number;
  enableMemoryTokens: boolean;
  debug: boolean;
}

export const DEFAULT_RLM_CONFIG: RLMConfig = {
  maxHotTokens: getOptimalContextTokens(),
  maxHistoryMessages: 50,
  maxRecentFacts: 20,
  hotSystemPromptMaxTokens: 2000,
  hotFactsMax: 3,
  hotMessagesMax: 5,
  enableMemoryTokens: true,
  debug: false,
};

export interface HotContext {
  systemPrompt: string;
  facts: string[];
  relatedFacts: string[];
  recentMessages: Array<{ role: string; content: string }>;
  workContext: string | null;
  emotionContext: string | null;
  activePods: Array<{ id?: number; name: string; description: string; factCount: number }>;
  totalTokens: number;
}

export interface MemoryToken {
  action: 'save' | 'recall' | 'forget' | 'set_importance' | 'load_context' | 'summarize' | 'create_pod' | 'switch_pod';
  category: string;
  content: string;
}

// ============================================================
// WARM CACHE (in-memory, process lifetime)
// ============================================================

interface WarmCache {
  messages: Array<{ role: string; content: string; timestamp: string }>;
  topFacts: Fact[];
  emotionSummary: string | null;
  sessionStartTime: number;
  lastFactsRefresh: number;
}

const warmCache: WarmCache = {
  messages: [],
  topFacts: [],
  emotionSummary: null,
  sessionStartTime: Date.now(),
  lastFactsRefresh: 0,
};

export function warmCacheAddMessage(role: string, content: string): void {
  warmCache.messages.push({ role, content, timestamp: new Date().toISOString() });
  // Keep only last 50
  if (warmCache.messages.length > 50) {
    warmCache.messages = warmCache.messages.slice(-50);
  }
}

export function warmCacheGetMessages(n: number = 10): Array<{ role: string; content: string }> {
  return warmCache.messages.slice(-n);
}

export function warmCacheClear(): void {
  warmCache.messages = [];
  warmCache.topFacts = [];
  warmCache.emotionSummary = null;
}

// ============================================================
// TOKEN ESTIMATION
// ============================================================

/**
 * Rough token estimate: ~4 chars per token for English, ~2 chars for Cyrillic.
 * Uses a blended average of 3.5 chars/token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count Cyrillic chars
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const other = text.length - cyrillic;
  // Cyrillic: ~2 chars/token, other: ~4 chars/token
  return Math.ceil(cyrillic / 2 + other / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;
  // Approximate: keep ~maxTokens * 3.5 chars
  const maxChars = Math.floor(maxTokens * 3.5);
  if (text.length <= maxChars) return text;
  // Truncate at last sentence boundary before maxChars
  const truncated = text.slice(0, maxChars);
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > maxChars * 0.7) {
    return truncated.slice(0, lastSentence + 1) + '...';
  }
  return truncated + '...';
}

// ============================================================
// HOT CONTEXT BUILDER
// ============================================================

/**
 * Build the HOT context — what goes into the LLM prompt.
 * Target: ≤4K tokens total.
 */
export async function buildHotContext(
  userMessage: string,
  recentMessages: Array<{ role: string; content: string }>,
  fullSystemPrompt: string,
  workContext?: string | null,
  emotion?: string | null,
  config?: Partial<RLMConfig>
): Promise<HotContext> {
  const cfg = { ...DEFAULT_RLM_CONFIG, ...config };

  // 1. Compress system prompt to ≤800 tokens
  const systemPrompt = truncateToTokens(fullSystemPrompt, cfg.hotSystemPromptMaxTokens);

  // 2. Get top-3 relevant facts via semantic search
  let facts: Fact[] = [];
  try {
    facts = await recallFacts(userMessage, cfg.hotFactsMax);
  } catch (e) {
    console.warn('[RLM] recallFacts failed:', e);
  }
  const factStrings = facts.map((f) => `[${f.category}] ${f.content}`);

  // 2.1 Knowledge Graph: get related facts for each recalled fact
  let relatedFactStrings: string[] = [];
  try {
    const relatedIds = facts.map(f => f.id).filter((id): id is number => id !== undefined);
    if (relatedIds.length > 0) {
      const allRelated = relatedIds.flatMap(id => getRelatedFacts(id));
      const seen = new Set<number>();
      for (const rf of allRelated) {
        const rfid = rf.fact.id;
        if (rfid && !seen.has(rfid) && !facts.some(f => f.id === rfid)) {
          seen.add(rfid);
          relatedFactStrings.push(`[${rf.fact.category}] ${rf.fact.content} (${rf.relation})`);
        }
      }
    }
  } catch (e) {
    console.warn('[RLM] knowledge graph query failed:', e);
  }
  const maxRelated = 3;
  if (relatedFactStrings.length > maxRelated) relatedFactStrings = relatedFactStrings.slice(0, maxRelated);

  // 2.5 Find relevant pods for the user query
  let activePods: Array<{ id?: number; name: string; description: string; factCount: number }> = [];
  try {
    const relevantPods = findRelevantPods(userMessage);
    if (relevantPods.length > 0) {
      activePods = relevantPods.slice(0, 3);
      for (const pod of activePods) {
        if (pod.id) incrementPodUse(pod.id);
      }
    }
  } catch (e) {
    console.warn('[RLM] findRelevantPods failed:', e);
  }

  // 3. Select recent messages — fit into half the token budget
  const messageBudget = Math.floor(cfg.maxHotTokens * 0.5);
  const selectedMessages = selectMessages(recentMessages, messageBudget);

  // 4. Work context (if available)
  let workCtx: string | null = null;
  if (workContext) {
    workCtx = truncateToTokens(workContext, 200);
  }

  // 5. Emotion context
  let emotionCtx: string | null = null;
  if (emotion) {
    emotionCtx = `Настроение: ${emotion}`;
  }

  // 6. Pod context string
  const podContextStr = activePods.length > 0
    ? `\n\n[Доступные модули памяти]\n${activePods.map((p) => `- ${p.name}: ${p.description} (${p.factCount} фактов)`).join('\n')}`
    : '';
  const podTokens = estimateTokens(podContextStr);

  // 7. Calculate total tokens
  const totalTokens =
    estimateTokens(systemPrompt) +
    factStrings.reduce((sum, f) => sum + estimateTokens(f), 0) +
    selectedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0) +
    (workCtx ? estimateTokens(workCtx) : 0) +
    (emotionCtx ? estimateTokens(emotionCtx) : 0) +
    podTokens +
    estimateTokens(userMessage);

  if (cfg.debug) {
    console.log(`[RLM] HOT: ${totalTokens} tokens (system: ${estimateTokens(systemPrompt)}, facts: ${factStrings.reduce((s, f) => s + estimateTokens(f), 0)}, messages: ${selectedMessages.reduce((s, m) => s + estimateTokens(m.content), 0)}, context: ${(workCtx ? estimateTokens(workCtx) : 0) + (emotionCtx ? estimateTokens(emotionCtx) : 0)}, pods: ${podTokens})`);
  }

  return {
    systemPrompt,
    facts: factStrings,
    relatedFacts: relatedFactStrings,
    recentMessages: selectedMessages,
    workContext: workCtx,
    emotionContext: emotionCtx,
    activePods,
    totalTokens,
  };
}

/**
 * Select messages that fit within a token budget.
 * Prioritizes recent messages, drops old ones.
 */
function selectMessages(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  const selected: Array<{ role: string; content: string }> = [];
  let usedTokens = 0;

  // Iterate from most recent to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content);

    if (usedTokens + msgTokens > maxTokens) {
      // If this message is too big, try to truncate it
      if (selected.length === 0 && msgTokens > maxTokens) {
        // At least include a truncated version of the latest message
        selected.unshift({
          role: msg.role,
          content: truncateToTokens(msg.content, maxTokens),
        });
      }
      break;
    }

    selected.unshift(msg);
    usedTokens += msgTokens;
  }

  return selected;
}

/**
 * Build the messages array for LLM from HotContext.
 */
export function buildMessagesFromHot(hot: HotContext, userMessage: string): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // System prompt
  messages.push({ role: 'system', content: hot.systemPrompt });

  // Facts as a system message
  if (hot.facts.length > 0) {
    messages.push({
      role: 'system',
      content: `Вспомненные факты (используй при необходимости):\n${hot.facts.join('\n')}`,
    });
  }

  // Related facts from Knowledge Graph
  if (hot.relatedFacts && hot.relatedFacts.length > 0) {
    messages.push({
      role: 'system',
      content: `Связанные факты (Knowledge Graph):\n${hot.relatedFacts.join('\n')}`,
    });
  }

  // Recent messages
  for (const msg of hot.recentMessages) {
    messages.push(msg);
  }

  // Context (work + emotion) appended to user message
  // Pods are listed in system prompt via dynamic-prompt — not duplicated here
  let enhancedUserMessage = userMessage;
  if (hot.workContext) {
    enhancedUserMessage += `\n\n[Контекст работы]\n${hot.workContext}`;
  }
  if (hot.emotionContext) {
    enhancedUserMessage += `\n[Состояние]\n${hot.emotionContext}`;
  }

  messages.push({ role: 'user', content: enhancedUserMessage });

  return messages;
}

// ============================================================
// MEMORY TOKEN PARSER
// ============================================================

/**
 * Parse [MEM] tokens from LLM response.
 * Format: [MEM] action:category:content
 *
 * Example response:
 * "Привет! Я U.N.A.\n[MEM] save:user:Пользователя зовут Макс\n[MEM] recall:python"
 */
export function parseMemoryTokens(llmResponse: string): { tokens: MemoryToken[]; cleanResponse: string } {
  const tokens: MemoryToken[] = [];

  // Find [MEM] block — either at end or inline
  const memRegex = /\[MEM\]\s*(\w+):([^:]+):(.+)/g;
  let match;

  while ((match = memRegex.exec(llmResponse)) !== null) {
    const action = match[1].toLowerCase();
    const category = match[2].trim();
    const content = match[3].trim();

    const validActions = ['save', 'recall', 'forget', 'set_importance', 'load_context', 'summarize', 'create_pod', 'switch_pod'];
    if (validActions.includes(action)) {
      tokens.push({
        action: action as MemoryToken['action'],
        category,
        content,
      });
    }
  }

  // Remove [MEM] lines from response
  const cleanResponse = llmResponse
    .replace(/\[MEM\][\s\S]*?(?=\n\[MEM\]|\n*$|$)/g, '') // Remove [MEM] blocks
    .replace(/\[MEM\].*/g, '') // Remove any remaining [MEM] lines
    .trim();

  return { tokens, cleanResponse };
}

// ============================================================
// MEMORY TOKEN EXECUTOR
// ============================================================

export async function executeMemoryTokens(tokens: MemoryToken[], debug = false): Promise<void> {
  for (const token of tokens) {
    try {
      if (debug) console.log(`[RLM] Memory token: ${token.action}:${token.category}:${token.content}`);

      switch (token.action) {
        case 'save': {
          const validCategories = ['user', 'project', 'preference', 'task'];
          const category = validCategories.includes(token.category)
            ? (token.category as Fact['category'])
            : 'user';
          await saveFact(category, token.content);
          if (debug) console.log(`[RLM]   → saved fact: [${category}] ${token.content}`);
          break;
        }

        case 'recall': {
          // Recall facts matching the query — they'll be loaded into HOT next round
          const facts = await recallFacts(token.content, 5);
          if (debug) console.log(`[RLM]   → recalled ${facts.length} facts for: ${token.content}`);
          break;
        }

        case 'forget': {
          // Mark facts as forgotten (soft delete)
          await markFactForget(token.category, token.content);
          if (debug) console.log(`[RLM]   → forgot: ${token.category}:${token.content}`);
          break;
        }

        case 'set_importance': {
          // Set importance on a fact (high/medium/low)
          // Content format: "category/fact-id:level"
          const parts = token.content.split(':');
          if (parts.length === 2) {
            const factId = parseInt(parts[0], 10);
            const level = parts[1];
            await setFactImportance(factId, level);
            if (debug) console.log(`[RLM]   → importance: fact#${factId} = ${level}`);
          }
          break;
        }

        case 'load_context': {
          // Load context from WARM cache — triggers refresh
          warmCache.lastFactsRefresh = 0; // Force refresh
          if (debug) console.log(`[RLM]   → load_context: ${token.category}`);
          break;
        }

        case 'summarize': {
          // Request to summarize old messages
          // Content: number of messages to summarize
          const n = parseInt(token.content, 10) || 10;
          await summarizeOldMessages(n);
          if (debug) console.log(`[RLM]   → summarize: last ${n} messages`);
          break;
        }

        case 'create_pod': {
          // Create a new memory pod
          // Content format: "name:description"
          const colonIdx = token.content.indexOf(':');
          if (colonIdx > 0) {
            const podName = token.content.slice(0, colonIdx).trim();
            const podDesc = token.content.slice(colonIdx + 1).trim();
            if (podName && podDesc) {
              const existingPod = await getPodByName(podName);
              if (!existingPod) {
                createPod(podName, podDesc);
                if (debug) console.log(`[RLM]   → created pod: ${podName}`);
              } else {
                if (debug) console.log(`[RLM]   → pod exists: ${podName}`);
              }
            }
          }
          break;
        }

        case 'switch_pod': {
          // Focus on a specific pod
          // Content: "podName:query"
          const switchColon = token.content.indexOf(':');
          if (switchColon > 0) {
            const podName = token.content.slice(0, switchColon).trim();
            const query = token.content.slice(switchColon + 1).trim();
            const pod = await getPodByName(podName);
            if (pod) {
              warmCache.lastFactsRefresh = 0; // Force refresh
              if (debug) console.log(`[RLM]   → switched to pod: ${podName}, query: ${query}`);
            }
          }
          break;
        }
      }
    } catch (e) {
      console.warn(`[RLM] Memory token failed (${token.action}):`, e);
    }
  }
}

// ============================================================
// FACT MANAGEMENT HELPERS
// ============================================================

/**
 * Mark facts as forgotten (soft delete via use_count = -1).
 */
async function markFactForget(category: string, contentPattern: string): Promise<void> {
  const facts = await recallFacts(contentPattern, 20);
  for (const fact of facts) {
    if (fact.category === category || category === 'all') {
      if (fact.id) storeMarkFactForget(fact.id);
    }
  }
}

/**
 * Set importance level on a fact.
 */
async function setFactImportance(factId: number, level: string): Promise<void> {
  const valid = level === 'high' || level === 'medium' || level === 'low';
  storeSetFactImportance(factId, valid ? level : 'medium');
}

// ============================================================
// SUMMARIZATION
// ============================================================

/**
 * Summarize old messages to save context space.
 * This is a placeholder — actual summarization would use LLM.
 */
async function summarizeOldMessages(n: number): Promise<string> {
  const messages = warmCacheGetMessages(n);
  if (messages.length === 0) return '';

  // Create a simple summary (in production, would use LLM for this)
  const summary = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
    .join(' | ');

  // Clear summarized messages from warm cache
  warmCache.messages = warmCache.messages.slice(n);

  return summary;
}

// ============================================================
// SYSTEM PROMPT WITH MEMORY INSTRUCTIONS
// ============================================================

/**
 * Returns the [MEM] instruction block to append to system prompt.
 */
export function getMemoryInstructions(): string {
  return `

# Управление памятью
После ответа ты можешь управлять своей памятью. Добавь в КОНЦЕ ответа блок [MEM] если нужно:
[MEM] save:категория:факт — запомнить (категории: user, project, preference, task)
[MEM] recall:запрос — вспомнить факты по теме
[MEM] forget:категория:что забыть — забыть устаревшее
[MEM] summarize:количество — сжать старые сообщения
[MEM] create_pod:имя:описание — создать новый модуль памяти
[MEM] switch_pod:имя:запрос — переключить фокус на модуль памяти

Примеры:
[MEM] save:user:Пользователя зовут Макс
[MEM] save:preference:Любит Python, не любит Java
[MEM] save:project:Работает над UNA Desktop v32
[MEM] recall:какой язык программирования
[MEM] create_pod:cooking:Рецепты и кулинарные предпочтения пользователя
[MEM] switch_pod:project:текущий статус проекта

# Модули памяти (Memory Pods)
Твоя память организована в тематические модули (поды). Каждый под содержит факты по теме.
В начале диалога ты получаешь список доступных модулей в блоке [Доступные модули памяти].
Используй create_pod чтобы создать новый модуль для новой темы.
Используй switch_pod чтобы запросить загрузку фактов из конкретного модуля.

Блок [MEM] не виден пользователю. Используй только когда действительно нужно что-то запомнить.`;
}
