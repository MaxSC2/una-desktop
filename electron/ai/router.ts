/**
 * Router (M5) — единая лестница маршрутизации запроса.
 *
 * Раньше решение «кто обработает запрос» было размазано по tool-loop.ts:
 * semantic-intent + regex-intent + fast-path + tryDirectCommand жили вперемешку,
 * а два детерминированных пути («открой X») дублировали друг друга с разной логикой.
 * Теперь это один модуль с явными уровнями:
 *
 *   L0-fast     — известные приложения по алиасам («открой хром») → tool, ноль LLM
 *   L0-direct   — прочие детерминированные команды (приложение по сырому имени,
 *                 сводка о системе) → tool, ноль LLM
 *   L1-semantic — intent по embeddings (если роутер инициализирован и уверенность ≥ порога)
 *   L1-regex    — intent по регуляркам (intent.ts)
 *   L2-llm      — обычный tool-loop с LLM
 *
 * Каждый следующий уровень дороже предыдущего (мс → десятки мс → секунды + GPU),
 * поэтому он включается только если выше вернули «не моё».
 */

import { dispatchTool, getToolDefinitions, ToolContext, ToolResult } from '../tools';
import { runFastCommand } from './fast-path';
import { detectIntent, Intent } from './intent';
import { detectSemanticIntent, SEMANTIC_CONFIDENCE_THRESHOLD } from './semantic-router';
import { resolveMode, filterToolsByMode, ExecutionMode } from './modes';

export type RouteLayer = 'L0-fast' | 'L0-direct' | 'L1-semantic' | 'L1-regex' | 'L2-llm';

/** Результат уровня L0 — запрос обработан без LLM. */
export interface DirectOutcome {
  /** Готовый текст ответа пользователю. */
  text: string;
  /** Инструмент, который отработал (для истории и логов). */
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
  /** true — это fast-path (в историю пишем псевдо-tool `_fast_path`). */
  fastPath: boolean;
}

export interface RouteDecision {
  /** Какой уровень принял решение. */
  layer: RouteLayer;
  intent: Intent;
  mode: ExecutionMode;
  /** Уверенность L1 (0, если работал regex/L0). */
  confidence: number;
  /** Инструменты для LLM (пусто, если запрос уже обработан на L0). */
  tools: Array<{ type: 'function'; function: Record<string, unknown> }>;
  /** Заполнено, только если layer = L0-* (LLM не нужен). */
  direct: DirectOutcome | null;
  /** Человекочитаемая причина — для логов и отладки. */
  reason: string;
}

/** Алиасы L0-direct: сырые имена приложений (когда fast-path не узнал алиас). */
const DIRECT_APP_ALIASES: Record<string, string> = {
  'steam': 'steam',
  'spotify': 'spotify',
  'vk': 'vk',
  'ютуб': 'youtube',
  'youtube': 'youtube',
  'телеграм': 'telegram',
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

/**
 * L0-direct: детерминированные команды, которые не покрыл fast-path.
 *  - «открой/запусти X» с неизвестным алиасом → пробуем передать сырое имя в open_app;
 *  - «сколько памяти / загрузка CPU» → system_info.
 */
async function tryDirectCommands(text: string, ctx: ToolContext): Promise<DirectOutcome | null> {
  const t = text.trim();
  if (!t || t.length > 80) return null;

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
    const app = DIRECT_APP_ALIASES[raw] ?? raw;
    const result = await dispatchTool('open_app', { app_name: app }, ctx);
    const outText = result.success
      ? `Открываю «${app}».`
      : `Не нашла «${app}» в системе. Скажи точное имя приложения — попробую ещё раз.`;
    return { text: outText, tool: 'open_app', args: { app_name: app }, result, fastPath: false };
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
      return {
        text: `Система: ${platform}, ядер CPU: ${cores}, занято RAM: ${memPct}.`,
        tool: 'system_info',
        args: {},
        result,
        fastPath: false,
      };
    }
  }

  return null;
}

/**
 * Единая точка принятия решения о маршруте запроса.
 * Побочные эффекты: вызов tool на уровнях L0 (это и есть обработка запроса)
 * и обновление глобального execution-mode (resolveMode) — как было и раньше.
 */
export async function routeMessage(text: string, ctx: ToolContext): Promise<RouteDecision> {
  // --- L0-fast: известные приложения по алиасам ---
  const fast = await runFastCommand(text, ctx);
  if (fast) {
    return {
      layer: 'L0-fast',
      intent: 'gui',
      mode: resolveMode('gui'),
      confidence: 1,
      tools: [],
      direct: { text: fast.text, tool: fast.tool, args: fast.args, result: fast.result, fastPath: true },
      reason: 'fast-path: известный алиас приложения',
    };
  }

  // --- L0-direct: прочие детерминированные команды ---
  const direct = await tryDirectCommands(text, ctx);
  if (direct) {
    const intent: Intent = direct.tool === 'open_app' ? 'gui' : 'system';
    return {
      layer: 'L0-direct',
      intent,
      mode: resolveMode(intent),
      confidence: 1,
      tools: [],
      direct,
      reason: `deterministic: ${direct.tool}`,
    };
  }

  // --- L1: intent по embeddings, иначе по регуляркам ---
  const semantic = await detectSemanticIntent(text);
  const semanticHit =
    semantic.intent !== 'unknown' && semantic.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD;
  const intent = semanticHit ? semantic.intent : detectIntent(text);
  const mode = resolveMode(intent);

  return {
    layer: semanticHit ? 'L1-semantic' : 'L1-regex',
    intent,
    mode,
    confidence: semantic.confidence,
    tools: filterToolsByMode(getToolDefinitions(), mode),
    direct: null,
    reason: semanticHit
      ? `semantic intent ${intent} (${semantic.confidence.toFixed(2)})`
      : `regex intent ${intent}`,
  };
}
