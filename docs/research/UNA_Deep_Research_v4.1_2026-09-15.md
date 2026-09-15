# U.N.A. Desktop — Deep Research v4.1
## Архитектурное исследование open-source проектов и технологий для U.N.A. v40

**Дата:** 15 сентября 2026  
**Статус:** новый воспроизводимый отчёт.  
**Важно:** это не восстановленный байт-в-байт старый файл. Предыдущий исследовательский проход действительно проводился, но отдельный артефакт v4.1 не был сохранён. Этот документ выполнен заново по текущему GitHub-состоянию U.N.A. и свежим публичным источникам.

---

# 0. Executive Summary

U.N.A. не следует превращать в «чат с аватаром». Целевая система должна быть программным цифровым компаньоном с непрерывностью состояния:

`Identity + Memory + Attention + State + Cognition + Planning + Tools + Policy + Resources + Persistence + Presence`.

Главный вывод: v40 уже движется в правильном направлении. Последний коммит `e9c222b` вынес единый роутер L0/L1/L2 из tool-loop; до этого были local-first, VRAM gate, gaming detection, Graphiti MCP, SQLite/FTS5, embeddings и честное обслуживание памяти. Следующий крупный рывок не в добавлении ещё одной LLM, а в оформлении непрерывной runtime-архитектуры: `Session ≠ Memory ≠ Context`, Event/World State, Task Runtime, Attention, durable autonomy, `Policy → Execute → Verify`, observability и Presence.

Наиболее полезные внешние ориентиры:

1. **AIRI** — ближайший прямой аналог по digital companion/presence/avatar/game awareness.
2. **Hermes Agent** — session persistence, memory bounds, context engine, scheduling.
3. **opencode-memory** — `WRITE → DREAM → SURFACE`, provenance, privacy scope, abstention.
4. **Cloudflare Agents** — session tree, compaction overlays, FTS, durable runs/schedules.
5. **Gemini CLI** — hierarchical memory и task tracker с зависимостями.
6. **OpenHands** — sandboxed execution и разделение reasoning/action/runtime.
7. **MCP** — расширяемый capability layer.
8. **ActivityWatch** — идеи для локального World State.
9. **OpenTelemetry/Phoenix** — наблюдаемость runtime.
10. **Silero VAD / whisper.cpp / Piper** — локальная голосовая периферия.
11. **Graphiti / Letta / LlamaIndex / GraphRAG / PydanticAI / LangGraph / LiteLLM** — источники отдельных паттернов, но не готовые ядра для U.N.A.

Главный анти-вывод: **не превращать U.N.A. в зоопарк агентных фреймворков**. Исследования нужны как библиотека паттернов, а не как список зависимостей.

---

# 1. Методология

Критерии:

| Ось | Смысл |
|---|---|
| Direct Match | Близость к U.N.A. |
| Architectural Value | Ценность паттерна |
| Surprise Value | Неожиданный перенос идеи |
| Resource Efficiency | Пригодность для слабого ПК |
| Maturity | Зрелость |
| Activity | Текущая живость проекта |
| Integration Cost | Цена внедрения |
| Security Risk | Новая поверхность риска |

Stars не использовались как основной показатель.

---

# 2. Текущий baseline U.N.A. v40

## Последний коммит

`e9c222b59e74a0a30915e2a2ce183f3e8b035372` — `feat(m5): единый роутер L0/L1/L2 — маршрутизация вынесена из tool-loop`, 15.09.2026.

Лестница:

```text
L0-fast
  ↓
L0-direct
  ↓
L1-semantic
  ↓
L1-regex
  ↓
L2-LLM
```

Маршрутизация вынесена в `electron/ai/router.ts`; введён `RouteDecision`; добавлены тесты лестницы. В commit message заявлены `tsc 0`, `Vitest 209/209`, build и manifest verification OK.

Источник: https://github.com/MaxSC2/una-desktop/commit/e9c222b59e74a0a30915e2a2ce183f3e8b035372

## Манифест

`6266686` сделал `manifest-files.json` единственным источником правды. Заявлено `240/240`, 0 missing, 0 extra.

Источник: https://github.com/MaxSC2/una-desktop/commit/626668643f00080a0dcf1f7e1e52a6ca4113b264

## M1–M4

- M1: local-first / L0 pre-router / TTL cache / MCP handshake.
- M2: VRAM gate / keep_alive / gaming detection hardening / app resolver.
- M3: Graphiti MCP / gaming detection + VRAM gate.
- M4: honest memory / real local summarization / soft forgetting / env-loader.

HONEST_STATUS отдельно отмечает важное различие: некоторые подсистемы написаны и компилируются, но не интегрированы в runtime `main.ts`. Поэтому наличие файла не считается capability.

Источник: https://github.com/MaxSC2/una-desktop/blob/main/HONEST_STATUS.md

---

# 3. Direct companion: AIRI

Repository: https://github.com/moeru-ai/airi

AIRI позиционирует себя как open-source digital companion / virtual character environment. README прямо описывает digital companion, Windows/macOS/web, voice, games, Live2D/VRM и отдельные memory/integration/stage components.

### Что особенно полезно U.N.A.

- Presence не равна chat UI.
- Avatar = presentation layer.
- Voice отделяется от cognition.
- Game/environment awareness является отдельной capability.
- Stage lifecycle и анимации должны жить отдельно от reasoning.
- Performance на desktop/mobile является архитектурным ограничением.

### Не брать

Не копировать AIRI целиком и не тянуть весь его stage/game stack только ради похожего интерфейса.

**Вердикт:** ADOPT PATTERNS. Direct 5/5, Architectural 5/5, Integration 3/5.

Источник: https://github.com/moeru-ai/airi

---

# 4. Memory / Context

## 4.1 Hermes Agent

Repository: https://github.com/NousResearch/hermes-agent

Hermes использует SQLite sessions + FTS5, bounded persistent memory, context engine, compaction, scheduling, plugins и background maintenance.

Ключевой паттерн: bounded memory не заменяет полную историю. Долгая история остаётся searchable, а context engine решает, что реально попадёт в prompt. В документации `MEMORY.md` и `USER.md` ограничены, а context compression вынесен в отдельный engine.

### Для U.N.A.

```text
Session history
     ↓
search / retrieval
     ↓
Context Builder
     ↓
LLM
```

А не «весь архив в system prompt».

Взять:
- persistent searchable sessions;
- bounded hot memory;
- pluggable context engine;
- housekeeping;
- scheduling.

Не брать Hermes целиком как runtime.

**Вердикт:** ADOPT PATTERNS. Direct 5/5, Architectural 5/5.

Источники:
https://github.com/NousResearch/hermes-agent  
https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md  
https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/context-compression-and-caching.md

## 4.2 opencode-memory

Repository: https://github.com/cioffiAI/opencode-memory

Главный lifecycle:

`WRITE → DREAM → SURFACE`

Особенно ценно:
- provenance;
- confidence;
- contradiction lifecycle;
- tiers: core / archival / temporary / pinned;
- lexical + semantic retrieval;
- abstention;
- local-only privacy scope;
- project/global isolation;
- crash recovery.

Для U.N.A. это практически готовая спецификация будущего `Memory Manager`.

Важный принцип:

> Memory Manager должен иметь право не вспоминать слабое совпадение.

**Вердикт:** HIGH PRIORITY PATTERN. Direct 5/5, Architectural 5/5, Surprise 5/5, Security 5/5.

Источник: https://github.com/cioffiAI/opencode-memory

## 4.3 Magic Context

Repository: https://github.com/cortexkit/opencode-magic-context

Идеи: cache-aware context, cross-session project memory, background compression, dreamer/consolidation, SQLite и стабильная project identity.

Для U.N.A. особенно полезно разделение:

`foreground cognition + background consolidation`

Не запускать тяжёлый dream/maintenance во время gaming или resource pressure.

**Вердикт:** ADOPT SELECTIVELY.

## 4.4 Lossless Context Management

LCM-проекты показывают важную модель:

```text
original session
   +
compact representation
   +
ability to recover source
```

Сводка не должна быть единственной копией истины.

---

# 5. Cloudflare Agents

Repository: https://github.com/cloudflare/agents

Особенно интересны:

- session messages;
- compaction overlays;
- context blocks;
- FTS;
- durable runs;
- schedules;
- restart-safe state.

Паттерн:

```text
Session
 ├── messages
 ├── compaction
 └── lineage

Agent
 ├── durable runs
 └── schedules
```

Для U.N.A. это сильный источник дизайна durable Task Runtime.

**Вердикт:** HIGH VALUE PATTERN.

Источник: https://github.com/cloudflare/agents

---

# 6. Gemini CLI

Repository: https://github.com/google-gemini/gemini-cli

Gemini CLI использует hierarchical context/memory:

```text
Global
Project
Private project
Session/task
```

Есть `/memory show`, `/memory reload`, imports через `@file.md` и auto-memory. Experimental tracker хранит tasks, dependencies, status и parent/epic.

### Для U.N.A.

Полезны две идеи:

1. hierarchical memory/context;
2. task DAG вместо плоского todo list.

```text
A
├── B
├── C
│   └── D
└── E
```

Не надо копировать Gemini CLI memory 1:1: это скорее instruction/project memory, чем полноценная episodic memory companion-а.

**Вердикт:** ADOPT PATTERNS.

Источники:
https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md  
https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/memory.md  
https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/tracker.md

---

# 7. Agent execution и security

## 7.1 OpenHands

Repository: https://github.com/All-Hands-AI/OpenHands

Главный урок:

```text
LLM reasoning
   ↓
action request
   ↓
execution runtime / sandbox
   ↓
result
   ↓
verification
```

LLM не должна получать сырые права OS.

Для U.N.A. полезна capability/trust модель:

```text
T0 read-only
T1 safe local mutation
T2 network/tool execution
T3 desktop automation
T4 high-impact
```

**Вердикт:** HIGH SECURITY PATTERN.

## 7.2 MCP TypeScript SDK

Repository: https://github.com/modelcontextprotocol/typescript-sdk

MCP логично оставить capability transport/interface. Но MCP не является brain U.N.A.; cognition и policy остаются выше него.

## 7.3 Playwright

Repository: https://github.com/microsoft/playwright

Для browser automation предпочтительнее DOM/semantic actions, когда это возможно. Browser capability не должна быть равна raw desktop clicking.

```text
browser capability
    ≠
desktop automation
```

Рекомендация: ADOPT.

## 7.4 Browser Use / Stagehand

Repositories:
https://github.com/browser-use/browser-use  
https://github.com/browserbase/stagehand

Полезны как исследовательские примеры state → action → observation → retry для web. Не следует пускать LLM безгранично управлять браузером.

---

# 8. Graph / Knowledge Memory

## Graphiti

Repository: https://github.com/getzep/graphiti

Vector search отвечает на «что похоже», temporal graph помогает отвечать на «что связано и когда связь была актуальна».

U.N.A. разумно использовать:

```text
SQLite + FTS5 + embeddings + Graphiti
```

а не заставлять Graphiti решать все задачи памяти.

U.N.A. уже имеет Graphiti MCP integration.

**Вердикт:** KEEP / EXPAND.

## Letta

Repository: https://github.com/letta-ai/letta

Полезна идея persistent agent state. Не нужна как ядро U.N.A.

## LlamaIndex / GraphRAG

Repositories:
https://github.com/run-llama/llama_index  
https://github.com/microsoft/graphrag

Использовать для больших локальных knowledge bases, а не для каждой заметки пользователя.

Правило:

```text
small data → SQLite / FTS5
semantic → embeddings
graph relations → graph
large knowledge base → RAG / GraphRAG
```

---

# 9. Orchestration

## PydanticAI

Repository: https://github.com/pydantic/pydantic-ai

Ценность: typed tools, structured results, validation, explicit dependencies. Для TypeScript U.N.A. полезно перенять принципы, а не библиотеку.

## LangGraph

Repository: https://github.com/langchain-ai/langgraph

Сильный паттерн stateful graph execution:

```text
STATE → NODE → STATE → NODE
```

Это подходит для Task Runtime, retries, branches, verification и resumability.

Но U.N.A. лучше сделать компактный native state machine, чем импортировать весь framework.

## Multi-agent swarm

Основной вывод отрицательный: не создавать множество агентов только ради сложности.

На 4 GB VRAM:

```text
router agent
+ planner agent
+ critic agent
+ tool agent
+ memory agent
```

легко превращаются в latency + VRAM thrashing + сложность отладки.

Лучше:

```text
deterministic L0
+ lightweight semantic L1
+ one primary LLM
+ specialized background workers
```

---

# 10. Provider Manager

## LiteLLM

Repository: https://github.com/BerriAI/litellm

Полезно как ориентир для unified provider interface, capabilities, fallback и health.

Но принципиально важно:

`provider fallback = reliability, not privacy`.

Privacy должна контролироваться до provider adapter:

```text
Policy
 ↓
Data classification
 ↓
redaction / localization
 ↓
provider
```

Для U.N.A. вероятно выгоднее небольшой нативный `ProviderManager`, чем полный внешний gateway.

---

# 11. Voice

## Silero VAD

Repository: https://github.com/snakers4/silero-vad

VAD должен быть отдельным дешёвым локальным слоем:

`Mic → VAD → ASR → Router → Cognition → TTS`.

## whisper.cpp

Repository: https://github.com/ggerganov/whisper.cpp

Хороший кандидат для local ASR на Windows при приемлемом качестве/скорости.

## Piper

Repository: https://github.com/OHF-Voice/piper1-gpl

Кандидат для local TTS. Перед redistribution нужно отдельно проверить лицензию конкретной сборки и моделей.

---

# 12. World State и Desktop awareness

## ActivityWatch

Repository: https://github.com/ActivityWatch/activitywatch

Неожиданно сильный источник идей для World State:

```text
foreground application
active window
idle time
recent activity
```

Но наблюдать нужно только то, что требуется для полезного поведения. Это не повод строить локальную систему тотального слежения.

Предлагаемый тип:

```ts
type WorldState = {
  foregroundApp: string | null
  activeWindow: string | null
  isGaming: boolean
  isIdle: boolean
  recentActivity: Activity[]
  systemLoad: ResourceSnapshot
  networkAvailable: boolean
}
```

**Вердикт:** HIGH VALUE PATTERN.

---

# 13. Attention Manager

Главный вывод research:

**U.N.A. не должна думать постоянно.**

Предлагаемые уровни:

```text
0 sleep
1 passive presence
2 environment monitoring
3 user-related event
4 active interaction
5 complex task
```

Большая часть времени должна проходить на 1–3.

Attention решает, стоит ли поднимать cognition, прежде чем вообще запускать LLM.

---

# 14. Resource Manager

Для 4 GB VRAM ресурсный policy должен быть центральным.

```text
idle
normal
constrained
gaming
critical
```

Пример:

```text
gaming:
  unload heavy model
  stop background heavy work

constrained:
  small local model
  no parallel embedding jobs

normal:
  one active reasoning model

idle:
  optional maintenance
```

Нужны admission control, hysteresis и cooldown, чтобы не получить модельную миграцию:

`load → unload → load → unload`.

---

# 15. Task Runtime

Следующий крупный слой после routing/resource/memory.

Каждая autonomous task должна иметь:

```ts
type TaskSpec = {
  id: string
  title: string
  priority: number
  deadline?: number
  permissions: Permission[]
  resourceBudget: ResourceBudget
  cancelCondition?: Condition
  retryPolicy: RetryPolicy
  verification: VerificationSpec
}
```

Lifecycle:

```text
CREATED
 ↓
QUEUED
 ↓
RUNNING
 ↓
WAITING_TOOL
 ↓
VERIFYING
 ├─ success → COMPLETED
 ├─ retry   → RUNNING
 ├─ blocked → BLOCKED
 └─ fail    → FAILED
```

Состояние task должно переживать restart.

---

# 16. Event System

Предлагаемый EventBus:

```text
user.message
app.changed
game.started
game.stopped
window.changed
memory.updated
task.created
task.completed
llm.started
llm.finished
resource.changed
voice.started
voice.finished
```

Но событие само по себе не должно будить LLM:

```text
event → filter → attention → priority → possible action
```

---

# 17. World Model

WorldState описывает текущее внешнее состояние:

```text
User idle
Foreground = VS Code
Game = false
Network = online
Ollama = available
VRAM = constrained
Task #17 = running
Last interaction = 4 min
```

Это лучше, чем заставлять LLM каждый раз угадывать состояние из текста.

---

# 18. Presence / Living Stage

Presence должна существовать независимо от Chat UI:

```text
Presence Runtime
├── avatar state
├── voice state
├── attention state
├── mood state
├── idle behavior
└── environment reactions
```

LLM может генерировать semantic intent/content, но не должна управлять каждым кадром анимации.

Цепочка:

```text
Cognition
  ↓
high-level intent
  ↓
Companion State Machine
  ↓
emotion / posture / activity
  ↓
Animation Controller
  ↓
Live2D / VRM / sprite
```

---

# 19. Privacy architecture

Каждый input должен проходить классификацию:

```text
PUBLIC
INTERNAL
PRIVATE
SECRET
NEVER_CLOUD
```

Например:

```text
weather → PUBLIC
project source → INTERNAL
personal file → PRIVATE
API key → SECRET
```

`NEVER_CLOUD` не должен попадать даже в provider adapter.

Целевая схема:

```text
Local Security Boundary
 ↓
sanitization
 ↓
opaque reference / derived result
 ↓
LLM
```

---

# 20. Verification pipeline

Каждое действие:

```text
PLAN
 ↓
POLICY
 ↓
EXECUTE
 ↓
VERIFY
 ↓
RECORD
```

Вызов tool не считается успешным только потому, что promise завершился без исключения.

Для GUI:

```text
open_app
 ↓
check process/window
 ↓
verify expected state
```

Это особенно важно для будущей автономности.

---

# 21. Observability

U.N.A. уже является маленькой distributed-ish системой:

```text
renderer
main process
LLM provider
MCP
Graphiti
SQLite
tools
voice
background tasks
```

Нужен trace:

```text
interaction
├── route
├── retrieval
├── context build
├── model call
├── tool calls
├── verification
└── final result
```

Metrics:

```text
route_latency
llm_latency
tool_latency
memory_latency
tokens_in/out
cache_hit
fallback_count
tool_failure_rate
verification_failure_rate
vram_state
```

OpenTelemetry: https://github.com/open-telemetry/opentelemetry-js  
Phoenix: https://github.com/Arize-ai/phoenix

Рекомендация: сначала простой собственный structured event log, затем OpenTelemetry, когда runtime станет достаточно сложным.

---

# 22. Security / prompt injection

PyRIT: https://github.com/Azure/PyRIT

Web content необходимо считать untrusted input.

Опасная цепочка:

```text
malicious webpage
 ↓
prompt injection
 ↓
LLM
 ↓
tool
 ↓
malicious action
```

Поэтому system policy не должна приходить из web/page text.

---

# 23. Главный cross-project вывод: Session ≠ Memory ≠ Context

### Session

Фактическое происходившее:

```text
messages
tool calls
results
timestamps
```

### Memory

Что U.N.A. решила сохранить:

```text
facts
preferences
projects
relationships
learned patterns
```

### Context

Что прямо сейчас надо показать модели:

```text
relevant memory
recent messages
current state
task state
available capabilities
```

Это три разные системы.

---

# 24. Предлагаемая Memory Architecture

```text
RAW EXPERIENCE
      ↓
Session Store
      │
      ├── events/facts
      └── conversation
              ↓
       summaries / index

Memory candidates
      ↓
Core / Archival / Temporary / Pinned
      ↓
Retrieval
 ├── FTS5
 ├── embeddings
 └── Graphiti
      ↓
Relevance gate / abstention
      ↓
Context Builder
      ↓
LLM
```

Lifecycle:

```text
WRITE
 ↓
VALIDATE
 ↓
TAG
 ↓
STORE
 ↓
INDEX
 ↓
DREAM / CONSOLIDATE
 ↓
CONFIDENCE / CONFLICT
 ↓
DECAY
 ↓
ARCHIVE
```

Physical DELETE не должен быть default behavior.

---

# 25. Graceful Degradation

U.N.A. должна переживать отказ компонентов.

```text
LLM unavailable → deterministic tools / state / reminders continue
Memory unavailable → current session continues
Internet unavailable → local capabilities continue
Avatar unavailable → core continues
Chat closed → background runtime continues where intended
Heavy GPU unavailable → lightweight mode
```

Это сильнее определяет «существование» U.N.A., чем размер модели.

---

# 26. Текущие архитектурные gaps

| Component | Оценка |
|---|---|
| L0 fast path | VERIFIED |
| L1 semantic routing | VERIFIED |
| Unified L0/L1/L2 | VERIFIED by latest commit |
| VRAM/resource gate | VERIFIED |
| Gaming awareness | VERIFIED |
| MCP | VERIFIED protocol-level |
| SQLite memory | VERIFIED |
| FTS5 | VERIFIED |
| Ollama embeddings | VERIFIED |
| Graphiti | VERIFIED protocol-level |
| Honest memory maintenance | VERIFIED |
| Cloud/local fallback | PARTIAL/AVAILABLE |
| Provider abstraction | PARTIAL |
| Session/Memory/Context separation | NEEDS FORMALIZATION |
| Durable Task Runtime | NEXT |
| EventBus + WorldState | NEXT |
| Attention Manager | NEXT |
| Autonomous Loop integration | NOT FULLY INTEGRATED |
| Skills integration | NOT FULLY INTEGRATED |
| Browser capability | PARTIAL |
| Policy→Execute→Verify | PARTIAL |
| Observability | EARLY |
| Presence runtime | EARLY |
| Avatar state machine | EARLY |
| Voice pipeline | PARTIAL |
| Long-term DREAM/consolidation | NEXT |
| Privacy data-routing policy | NEEDS FORMALIZATION |

---

# 27. Top 20 external references

| # | Project | Main lesson | Action |
|---:|---|---|---|
| 1 | AIRI | digital presence | ADOPT |
| 2 | Hermes Agent | sessions/context/memory | ADOPT PATTERNS |
| 3 | opencode-memory | WRITE/DREAM/SURFACE | ADOPT |
| 4 | Cloudflare Agents | durable sessions/runs | ADOPT PATTERNS |
| 5 | Gemini CLI | hierarchical memory/task DAG | ADOPT PATTERNS |
| 6 | Graphiti | temporal graph | KEEP/EXPAND |
| 7 | OpenHands | sandboxed execution | ADOPT SECURITY |
| 8 | MCP TS SDK | capability protocol | KEEP |
| 9 | Playwright | deterministic browser | ADOPT |
| 10 | ActivityWatch | World State | RESEARCH/ADOPT PATTERN |
| 11 | whisper.cpp | local ASR | EVALUATE |
| 12 | Silero VAD | voice gating | EVALUATE |
| 13 | Piper | local TTS | EVALUATE |
| 14 | OpenTelemetry | tracing | ADOPT LATER |
| 15 | Phoenix | AI observability | RESEARCH |
| 16 | Letta | persistent agent state | STUDY |
| 17 | LangGraph | stateful task graph | STUDY / NATIVE |
| 18 | PydanticAI | typed contracts | STUDY |
| 19 | LiteLLM | provider abstraction | STUDY |
| 20 | GraphRAG/LlamaIndex | large knowledge retrieval | ONLY WHEN NEEDED |

---

# 28. Что НЕ делать сейчас

1. Full multi-agent swarm.
2. Constant autonomous loop.
3. Full GraphRAG everywhere.
4. Avatar-driven cognition.
5. Multiple simultaneous LLMs on 4 GB VRAM.
6. Generic agent framework as the core.
7. Permanent heavy model loading.

---

# 29. Incremental roadmap

## Phase 0 — Stabilization & Architectural Baseline

Фактически уже выполнена de-facto. Осталось оформить artefacts:

- `JOURNAL.md`
- `decision-log.md`
- `implementation-map.md`
- research archive

## Phase 1 — Core Runtime Contracts

- `WorldState`
- `AttentionState`
- `TaskSpec` / `TaskState`
- `CapabilitySpec`
- `ProviderSpec`
- `VerificationResult`

## Phase 2 — Memory & Continuity

- Session Store
- memory tiers
- provenance
- confidence
- contradiction handling
- consolidation
- context builder
- privacy-scoped memories

## Phase 3 — Task Runtime

- durable tasks
- dependencies
- retry/cancel
- resource budget
- permission gates
- verification
- restart recovery

## Phase 4 — Attention / Presence

- attention levels
- event filtering
- mood/state
- avatar state machine
- voice pipeline
- Living Stage
- sparse proactive behavior

## Phase 5 — Environment / Living OS

- world model
- activity awareness
- OS integrations
- browser capability
- broader automation
- cross-device presence

---

# 30. Priority matrix

| Initiative | Value | Cost | Resource risk | Priority |
|---|---:|---:|---:|---:|
| Session/Memory/Context separation | 5 | 3 | 1 | P0 |
| Decision/implementation docs | 5 | 1 | 1 | P0 |
| Task Runtime | 5 | 4 | 2 | P1 |
| EventBus + WorldState | 5 | 3 | 1 | P1 |
| Attention Manager | 5 | 3 | 1 | P1 |
| Memory consolidation | 5 | 4 | 2 | P1 |
| Policy→execute→verify | 5 | 3 | 1 | P1 |
| Browser capability | 4 | 3 | 2 | P2 |
| Observability | 4 | 3 | 1 | P2 |
| Voice upgrade | 4 | 3 | 2 | P2 |
| Avatar state machine | 4 | 3 | 1 | P2 |
| Live2D/VRM polish | 3 | 4 | 2 | P3 |
| Multi-agent swarm | 2 | 5 | 5 | NO |
| Full GraphRAG | 2 | 5 | 4 | NO |
| Always-on LLM loop | 1 | 5 | 5 | NO |

---

# 31. Proposed target architecture

```text
                    U.N.A. CORE
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
   Identity             State          Attention
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                   Cognition Router
                         │
                ┌────────┼────────┐
                │        │        │
               L0       L1       L2
                │        │        │
                └────────┼────────┘
                         │
                      Planner
                         │
                   Task Runtime
                         │
                       Policy
                         │
                  Capability Layer
             ┌───────────┼───────────┐
             │           │           │
           Native        MCP       Browser
             │           │           │
             └───────────┼───────────┘
                         │
                     Executor
                         │
                    Verification
                         │
                       Events
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
     Persistence                     Presence
          │                      ┌──────┼───────┐
   Sessions / Memory              Voice Avatar UI
```

---

# 32. Definition of Done: «U.N.A. существует»

Проверки:

- LLM A offline → core survives.
- LLM B offline → core survives.
- Ollama offline → degraded but alive.
- Internet offline → local functions survive.
- Memory search down → current session survives.
- Avatar closed → core survives.
- Chat closed → background runtime survives where intended.
- Game starts → heavy model unloads.
- Task survives restart.
- Tool failure is verified/retried safely.
- Web prompt injection cannot override policy.

Это операционное определение digital entity гораздо сильнее, чем «модель отвечает красиво».

---

# 33. Final conclusions

Исследование не указывает на необходимость «найти более умную модель». Оно указывает на необходимость улучшить:

```text
continuity
+ state
+ memory
+ attention
+ task execution
+ resource governance
+ verification
+ presence
```

U.N.A. уже прошла путь:

```text
chatbot
  ↓
tool-using assistant
  ↓
stateful local-first assistant
  ↓
beginning of companion runtime
```

Следующая граница:

```text
companion runtime
  ↓
persistent digital entity
```

Именно здесь большинство исследованных проектов сходятся: **контроль должен быть системным, память отдельной, контекст селективным, действия permissioned и verifiable, а присутствие отделённым от reasoning.**

---

# Appendix A — Source index

- U.N.A.: https://github.com/MaxSC2/una-desktop
- AIRI: https://github.com/moeru-ai/airi
- Hermes Agent: https://github.com/NousResearch/hermes-agent
- opencode-memory: https://github.com/cioffiAI/opencode-memory
- Magic Context: https://github.com/cortexkit/opencode-magic-context
- Cloudflare Agents: https://github.com/cloudflare/agents
- Gemini CLI: https://github.com/google-gemini/gemini-cli
- OpenHands: https://github.com/All-Hands-AI/OpenHands
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Playwright: https://github.com/microsoft/playwright
- Browser Use: https://github.com/browser-use/browser-use
- Stagehand: https://github.com/browserbase/stagehand
- Graphiti: https://github.com/getzep/graphiti
- Letta: https://github.com/letta-ai/letta
- LlamaIndex: https://github.com/run-llama/llama_index
- GraphRAG: https://github.com/microsoft/graphrag
- PydanticAI: https://github.com/pydantic/pydantic-ai
- LangGraph: https://github.com/langchain-ai/langgraph
- LiteLLM: https://github.com/BerriAI/litellm
- Silero VAD: https://github.com/snakers4/silero-vad
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- Piper: https://github.com/OHF-Voice/piper1-gpl
- ActivityWatch: https://github.com/ActivityWatch/activitywatch
- OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
- Arize Phoenix: https://github.com/Arize-ai/phoenix
- PyRIT: https://github.com/Azure/PyRIT

# Appendix B — Evidence rule

Третий party README описывает intent проекта, а не доказывает реализацию U.N.A. Текущий U.N.A. code, tests/build, Git history и HONEST_STATUS имеют приоритет над research notes. Если исходник старого v4.1 недоступен, этот новый файл не выдаёт реконструкцию за оригинал.

**End of U.N.A. Deep Research v4.1**
