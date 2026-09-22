# U.N.A. v40 — Phase 2 / Step 1.5
## Routing Reconciliation & Baseline (аудит существующих механизмов, без production-кода)

**Дата:** 2026-09-17
**Статус:** обязательный промежуточный шаг между Step 1 (memory research, закрыт `6ef17cb`) и Step 2 (Cognitive Routing proposal)
**Родственные документы:**
- `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md` — оригинальный proposal
- `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Adaptation.md` — адаптация Step 2-A по коду v40
- `docs/research/system-one-decision-models.md` — decision-model слой, меняет понимание лестницы L0–L4

**Ключевой вывод, из которого вырос этот шаг:**

> Идеи уже начали материализовываться в коде раньше, чем мы сформулировали их
> единую теорию. Теперь нужно не наращивать этажи, а выяснить, какие стены уже стоят.

Изначальное рассуждение «надо создать: Fast Path, Embedding Router, Attention Engine,
Context Resolver, Provider Router…» не соответствует реальности — почти каждый из этих
компонентов уже частично существует. Правильный вопрос теперь:

> **«Как объединить уже существующие механизмы в одну когнитивную архитектуру, не плодя параллельные системы?»**

---

## 1. Что уже стоит в коде (предварительная карта; финализируется аудитом)

| Решение | Где сейчас | Что делает | Кто должен быть хозяином |
|---|---|---|---|
| L0 fast | `fast-path.ts` | известные детерминированные команды (алиасы приложений RU/EN) | `router.ts` |
| L0 direct | `router.ts` | direct tools / system info | `router.ts` |
| Semantic intent | `semantic-router.ts` | embeddings-центроиды + cosine + порог 0.6 + reject | `router.ts` |
| Regex intent | `intent.ts` | fallback при reject / недоступных embeddings | `router.ts` |
| Tool filtering | `modes.ts` + `router.ts` | ограничение tools по execution mode | `router.ts` (единая точка) |
| Attention | `attention-manager.ts` | focus / interruptibility / urgency / proactive permissions / attention score (детерминированно) | пока он сам, но под общей моделью внимания |
| Execution mode | `modes.ts` | режимы (code/research/creative/chat/system/default) + contextBudget | отдельный policy/context слой (в перспективе) |
| Resource gating | `resource-manager.ts` | VRAM/CPU/RAM/battery, canRunTask, context tokens | capability/resource gate |
| World context | `world-model.ts` | состояние среды для промпта | Context Resolver (будущий) |
| Вызов маршрута | `tool-loop.ts:93` | `routeMessage()` вызывается ВНУТРИ `executeToolLoop` | — |

**Факт по точке входа (проверено по коду):** `routeMessage()` вызывается только из
`executeToolLoop` (`tool-loop.ts:93`); оба IPC-хендлера `chat:send` / `chat:stream` в
`main.ts` идут через `executeToolLoop`. То есть `router.ts` уже де-факто единая точка
принятия решения о маршруте.

**Главная цель реконсиляции:**

> **ровно один компонент принимает окончательное решение о маршруте cognition.**

Кандидат на этот статус уже существует — `router.ts`. **Новый `CognitiveRouter` не
создаётся**, если только аудит не докажет, что `router.ts` архитектурно не способен
стать этой точкой. Сейчас он выглядит как естественная canonical authority.

---

## 2. Находка пред-аудита: orphaned tool-filtering (мёртвый код)

Проверено grep'ом по `electron/**` на 2026-09-17:

- `filterToolsByIntent` (intent.ts:136, маппинг `TOOL_BY_INTENT`) — **экспортируется,
  но нигде не вызывается** в production-коде (только определение + упоминание в
  `electron/ai/README.md:26`).
- Актуальный фильтр инструментов на L1 — `filterToolsByMode(getToolDefinitions(), mode)`
  внутри `router.ts` (через `modes.ts`), результат идёт в `route.tools`.
- `tool-loop.ts` round 2+ расширяет до `getToolDefinitions()` полностью (`tool-loop.ts:165`).

Следствия:
1. Описание «dynamic tool expansion по intent'у round 1» в `AGENTS.md` (раздел v37,
   п.11) **устарело** — M5-рефакторинг заменил его mode-фильтрацией. Документацию надо
   синхронизировать.
2. `TOOL_BY_INTENT` — кандидат в dead code ИЛИ кандидат на возвращение в роли
   intent-level фильтра **поверх** mode-фильтра (решает аудит; сейчас действует только
   mode-фильтр).
3. Это живой пример того, почему Step 1.5 нужен: два механизма фильтрации инструментов
   описаны в двух местах, реально работает один, а документация описывает второй.

---

## 3. Intent ≠ Capability ≠ Action ≠ Tool

Текущая система интентов (`intent.ts`) находится на уровне:

```text
weather, news, web_search, file_read, file_write, code, system, screen, gui, memory, greeting
```

Идея сведения формулировок к ограниченному набору действий требует следующего уровня:

```text
PLAY_MEDIA, PAUSE_MEDIA, SET_VOLUME, OPEN_APP, SEARCH_WEB, CREATE_REMINDER, ...
```

Проблема: `gui` слишком широк для маршрутизации. Примеры:

```text
«открой YouTube»                 → gui
«нажми кнопку поиска в YouTube»  → gui
```

— оба `gui`, но задачи совершенно разные. Разведение:

```text
Intent         — ЧТО хочет пользователь (домен запроса)
Capability     — КАКОЙ класс способности системы нужен
Action         — КОНКРЕТНОЕ действие (что выполнять)
Tool           — механический исполнитель (уже есть: 25 в TOOL_DEFINITIONS)
```

Двухступенчатая семантика:

```text
User utterance → Intent → Capability/Action → Arguments → Context Resolver → Tool
```

Аудит Step 1.5 обязан проверить необходимость отдельного слоя между Intent и Tool
и не допустить, что `TOOL_BY_INTENT` (мёртвый сейчас) останется единственным
носителем этой связи.

---

## 4. Attention: проекция, а не новая state machine

Уже есть (`attention-manager.ts`, детерминированный):

```text
focus (deep_focus/light_work/idle/chatting/gaming/meeting)
interruptible, responseUrgency, allowProactive, allowSound
sessionAttentionScore, conversationBurst, gaming/meeting/compiling/idle
```

Хотим получить (из proposal Step 2): `ignore → observe → notice → react → cognize → interrupt`.

**Не создавать вторую state machine.** Реакционные уровни — это, скорее всего,
**другая проекция существующего AttentionState**:

```text
AttentionManager → salience → response policy → reaction level
```

а не `AttentionManager + NewAttentionEngine + AttentionStateMachine`.

Отдельно определяется: **event-salience** (скоринг системных событий до решения
«заслуживает ли событие ресурсов») — сейчас в production отсутствует; это расширение
`attention-manager.ts`, а не новый движок. Правило оригинала сохраняется:
**событие ≠ cognition trigger**.

---

## 5. Baseline metrics methodology (обязательная часть Step 1.5)

Принцип «самый дешёвый механизм, способный решить задачу» обязан стать измеримым,
иначе мы не узнаем, помогла архитектура или просто красиво нарисовала стрелочки.

Baseline **не обязательно** требует observability-подсистемы: первый проход —
research/test instrumentation.

**Методика:**

1. Корпус типичных пользовательских команд (~200): «открой хром», «вруби музыку»,
   «пауза», «найди мой файл», «посмотри что на экране», «поставь напоминание через два часа»…
2. Для каждой команды зафиксировать: expected route, actual route, latency.
3. Распределение по слоям:

```text
L0_fast %  /  L0_direct %  /  L1_semantic %  /  L1_regex %  /  L2_LLM %  (+ L3/L4 — перспективные)
```

4. Дополнительно: average latency, p95 latency, LLM calls/request, tokens/request,
   failed routes, fallback rate, false positive route rate, false negative rate.

Пример ожидаемого результата первого прогона:

```text
L0 = 47%   L1 = 31%   L2 = 22%
```

Это и будет настоящий baseline. После архитектурных изменений прогон повторяется —
только так можно доказать, что U.N.A. стала меньше зависеть от LLM.

**Важно:** на первом проходе инструментирование НЕ превращается в observability
subsystem. Достаточно: `RouteDecision` (layer/confidence/reason) уже структура
`router.ts` — добавить экспорт статистики без изменения поведения.

---

## 6. Статус Graphiti compatibility spike (вход в Step 1.5)

```text
A   Backend Windows local-only FalkorLite   → FAILED
A'  Graphiti 0.30.1 support                → VERIFIED
B   json_object extraction                 → FAILED
B'  native JSON-schema / constrained       → NOT TESTED
C   retrieval                              → OPEN
```

Корректная формулировка статуса (не «Graphiti не работает»):

> **конкретная комбинация backend + extraction path + qwen3:1.7b не прошла E2E.**

Step 1.5 должен закончить compatibility spike (A / B / B' / C) до любых решений
о судьбе Graphiti.

---

## 7. Что НЕ надо создавать (жёсткий список)

- ❌ Новый `CognitiveRouter` — если аудит не докажет неспособность `router.ts`
- ❌ Новый `AttentionEngine` / вторая state machine — если `attention-manager.ts`
  расширяем проекцией реакционных уровней + event-salience
- ❌ Новый `EmbeddingIntentIndex` — если `semantic-router.ts` является естественной
  основой (hardening + калибровка вместо новой подсистемы)
- ❌ Новый Context Resolver для media-сценариев до e2e GUI-перечисления
- ❌ Observability subsystem на первом проходе (достаточно test instrumentation)
- ❌ Любой production-код до DEC

---

## 8. Промт для исполнителя аудита (без изменений смысла)

```text
PHASE 2 / STEP 1.5
ROUTING RECONCILIATION & BASELINE

Цель:
Не создавать новый routing subsystem.

Провести аудит существующих механизмов и определить canonical routing authority.

Обязательно исследовать код:
- fast-path.ts, router.ts, semantic-router.ts, intent.ts, tool-loop.ts,
  attention-manager.ts, resource-manager.ts, world-model.ts, modes.ts,
  mcp-adapter.ts, dynamic-prompt

Построить таблицу:
1. кто принимает решение;
2. какие входы использует;
3. где происходят embeddings;
4. где regex;
5. где выполняется tool;
6. где решается "нужна ли LLM";
7. где выбираются tools;
8. где учитываются resource;
9. где учитывается attention;
10. где происходит fallback.

ОСОБЕННО:
- обнаружить дубли;
- определить canonical authority;
- не создавать новый router, если router.ts можно расширить;
- не создавать новый Attention Engine, если attention-manager.ts можно расширить;
- не создавать новый EmbeddingIntentIndex, если semantic-router.ts является
  естественной основой.

ОТДЕЛЬНО ОПРЕДЕЛИТЬ: Intent ≠ Capability ≠ Action ≠ Tool.

ОСОБО ПРОВЕРИТЬ (находка пред-аудита от 2026-09-17):
- filterToolsByIntent не вызывается в production (экспортируется, но мёртв);
  реальный фильтр — filterToolsByMode в router.ts L1;
  AGENTS.md (раздел v37) описывает устаревшую схему — синхронизировать.

ОТДЕЛЬНО ОПРЕДЕЛИТЬ: Intent ≠ Capability ≠ Action ≠ Tool.
Проверить необходимость слоя: utterance → Intent → Capability/Action →
Context Resolver → Tool.

Сформировать baseline methodology:
- corpus типовых пользовательских команд; expected route; actual route;
  L0/L1/L2 distribution; latency; fallback; false-positive/negative;
  LLM calls/request.

Не менять production code.

OUTPUT: docs/research/phase-2-step-1.5-routing-reconciliation.md

В конце:
- canonical routing authority;
- mapping существующих модулей;
- список дублирования;
- список того, что НЕ надо создавать;
- baseline metrics methodology;
- implications for Step 2 proposal.

После этого только обновить
phase-2-step-2-cognitive-routing-proposal.md и подготовить DEC.

Никакого кода до DEC.
```

---

## 9. Выход Step 1.5 (артефакты)

1. `docs/research/phase-2-step-1.5-routing-reconciliation.md` — таблица решений,
   canonical authority, дубли, «что не создавать», baseline methodology.
2. Обновление `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md`
   (proposal) с учётом реконсиляции + подготовка DEC.
3. Exit criteria: карта согласована с кодом, дубли перечислены, authority выбран,
   baseline methodology зафиксирована, метрики сняты (или методология зафиксирована
   и корпус согласован).
