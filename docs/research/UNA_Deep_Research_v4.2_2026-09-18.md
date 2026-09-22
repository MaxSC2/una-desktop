# U.N.A. Deep Research v4.2 — Open-Source Cognitive Runtime & Companion Ecosystem

**Дата среза:** 18 сентября 2026
**Репозиторий U.N.A.:** `MaxSC2/una-desktop`
**Назначение:** обновлённая карта открытых проектов и технологий, пригодных для архитектуры U.N.A. как долговременно живущего desktop AI companion / cognitive runtime.
**Отношение к v4.1:** v4.2 расширяет и не отменяет v4.1. Все ранее найденные проекты сохранены в каталоге; новые проекты и новые архитектурные выводы добавлены отдельными секциями.

> Важно: это не попытка перечислить весь GitHub. Это глубокий целевой срез открытых проектов и ближайшего экосистемного поля, релевантного архитектуре U.N.A. Все статусы “current” относятся к дате среза. Если текущий статус старого проекта не удалось подтвердить новым первичным источником в этом проходе, он помечен как **carry-forward / revalidation needed**, а не выдуман.

---

## 1. Executive Summary

Главный вывод v4.2:

**U.N.A. не следует строить как “LLM, к которой прикручены инструменты”.** Более перспективная архитектура — это model-independent cognitive runtime, где генеративная LLM является одним из дорогих когнитивных providers, а большая часть повседневной работы выполняется deterministic, semantic и typed-decision механизмами.

Новый центральный принцип:

> **Route to the cheapest mechanism capable of solving the request correctly.**

Из него следуют четыре независимых слоя:

1. **Perception / normalization** — текст, голос, наблюдения, жесты и другие сигналы приводятся к нормализованным событиям.
2. **Fast / semantic / decision routing** — система определяет intent, capability, target, urgency и необходимость дальнейшего cognition без обязательного вызова генеративной LLM.
3. **Context and policy** — WorldState, Memory, Attention, Resource, Privacy и Safety участвуют в решении независимо от выбранной модели.
4. **Cognition providers** — локальная LLM, специализированная extraction-model, VLM, cloud model и потенциальные decision models выбираются по capability + resource + latency + privacy.

Это позволяет U.N.A. деградировать мягко: слабая локальная модель не должна ломать всю систему, потому что fast path, semantic router, context resolver, policy и executor продолжают работать без неё.

### Ключевые архитектурные находки v4.2

- **U.N.A. уже содержит значительную часть будущего routing stack.** `router.ts` уже объединяет L0-fast, L0-direct, L1-semantic, L1-regex и L2-LLM; отдельный новый CognitiveRouter не следует создавать без доказательства необходимости. Источник: текущий код U.N.A.
- **Embedding intent routing уже существует.** `semantic-router.ts` строит центроиды intent и применяет confidence threshold. Следующий шаг — hardening/generalization, а не второй router.
- **Attention без LLM уже частично реализован.** `attention-manager.ts` вычисляет focus, urgency, interruptibility и attention score на основе наблюдаемого состояния.
- **Intent ≠ capability ≠ action ≠ tool.** Для U.N.A. полезно формализовать цепочку `utterance → intent → capability/action → context resolution → tool`.
- **Decision Models / System One** — новая важная категория. Закрытый Jev показывает ценность typed decisions + confidence вместо генерации текста для routing/selection. OpenJev и jevlike показывают попытки воспроизвести этот архитектурный класс открытыми средствами.
- **vLLM Semantic Router** движется к programmable Mixture-of-Models routing и использует сигналы, предпочтения и policy для выбора model path. Это сильный reference для provider routing.
- **Structured generation стало самостоятельным инфраструктурным слоем.** Outlines, XGrammar, SGLang structured outputs и Guidance важны для Graphiti extraction и любых typed-decision contracts.
- **Graphiti должен рассматриваться как отдельный memory subsystem, а не как обязательный “мозг” U.N.A.** Kuzu deprecated; Graphiti официально ориентирует новые установки на Neo4j/FalkorDB. Текущий U.N.A. spike уже показал отдельную проблему extraction на qwen3:1.7b.
- **Memory research и routing research сходятся в Context Composer.** Memory retrieval, surface gate, budget, context regions и provider capabilities должны соединяться в едином CognitionRequest.
- **Открытый рынок подтверждает тенденцию к specialization.** Memory, routing, durable execution, browser control, VAD, ASR, TTS, observability и inference serving развиваются как отдельные подсистемы.

---

## 2. Methodology and Evidence Rules

Для каждого проекта использована следующая классификация:

- **V / Verified** — факт подтверждён первичным источником, официальным GitHub README/docs/release или текущим кодом U.N.A.
- **I / Inference** — архитектурный вывод, сделанный из verified facts.
- **Carry-forward** — проект сохранён из v4.1, но новый текущий статус в этом проходе не был повторно доказан.
- **Candidate** — технология потенциально полезна, но integration не подтверждён.
- **Do not adopt wholesale** — не означает “плохой проект”; означает, что полное внедрение принесёт больше архитектурной зависимости, чем пользы.

Правило исследования:

> Открытый проект рассматривается не как готовый dependency, а как источник паттерна, интерфейса, алгоритма, теста, data model или implementation idea.

---

# 3. U.N.A. Baseline — что уже есть до внешних проектов

## 3.1 Existing routing

### `fast-path.ts`

В U.N.A. уже существует deterministic L0 path. `runFastCommand()` распознаёт известные команды вида “открой Discord/Chrome/VS Code” по регулярным выражениям и alias-map и напрямую вызывает tool без LLM. Если команда не распознана, возвращается `null`, и поток продолжается дальше. Это уже реальная реализация принципа “не буди модель ради известного действия”.

### `semantic-router.ts`

В U.N.A. уже есть L1 semantic route: anchor phrases → embeddings → intent centroids → cosine similarity → threshold. Confidence ниже `0.6` отбрасывается в `unknown`. Это фактически начальная версия semantic decision layer.

### `router.ts`

`router.ts` уже является фактической canonical route authority текущего кода:

```text
L0-fast
  ↓
L0-direct
  ↓
L1-semantic
  ↓
L1-regex
  ↓
L2-llm
```

Это ключевой факт для v4.2: любые новые routing concepts сначала должны отображаться на эту систему, а не создавать параллельную архитектуру.

### `intent.ts`

Regex fallback задаёт intent vocabulary и tool filtering. Важно сохранить его как fallback / policy layer, но не превращать его в ещё одну независимую точку конечного route decision.

## 3.2 Existing attention

`attention-manager.ts` уже получает resource/activity context и поддерживает `deep_focus`, `light_work`, `idle`, `chatting`, `gaming`, `meeting`, interruptibility, urgency, proactive permissions, sound permissions и session attention score.

Следствие:

> Новый “Attention Engine” не нужен как отдельная подсистема, пока не доказано, что существующий manager нельзя расширить.

## 3.3 Existing memory

U.N.A. уже имеет:

- SQLite + FTS5;
- embeddings через Ollama + hashing fallback;
- RLM HOT/WARM/COLD;
- Memory Manager;
- Memory Pods;
- candidate storage;
- pinned/importance;
- Graphiti MCP integration boundary.

Step 1 Memory Research уже выявил четыре основных gap:

1. surface gate в основном стоит на записи, а не на query-time surfacing;
2. context budget может рассинхронизироваться с реальным model context window;
3. полноценный decay / last_accessed / invalidation отсутствует;
4. `buildDynamicPrompt` и RLM формируют overlapping context channels.

## 3.4 Existing security

U.N.A. уже имеет:

- safety classifier;
- pending-action confirmations;
- TTL/origin/one-shot semantics;
- SSRF protection;
- protected-file gates;
- env filtering;
- indirect-injection fixtures.

Следствие: новый “Policy Engine” должен быть **консолидацией/расширением** этих механизмов, а не шестой системой безопасности.

---

# 4. Architecture Thesis v4.2

## 4.1 LLM is a provider, not U.N.A.

У U.N.A. должна существовать абстракция уровня:

```text
CognitionProvider
ModelCapabilities
ProviderPolicy
ProviderRouter
```

Модель выбирается не по имени, а по возможностям:

```text
contextWindow
streaming
toolCalling
structuredOutput
jsonMode
vision
reasoning
parallelTools
embeddings
local
privacyClass
latencyClass
resourceCost
```

## 4.2 Capability-based routing

Router должен задавать вопрос:

> “Какой механизм способен решить задачу с требуемым качеством?”

а затем:

> “Какой из способных механизмов сейчас дешевле/быстрее/приватнее?”

Это снимает архитектурную зависимость от конкретного Qwen/Gemma/OpenAI/Gemini/etc.

## 4.3 Escalation hierarchy

Рекомендуемая логическая лестница:

```text
Input
 ↓
L0 deterministic
 ↓
L1 semantic / embedding
 ↓
L1.5 typed decision model (optional)
 ↓
L2 contextual resolver
 ↓
L3 local generative model
 ↓
L4 powerful cloud model
```

Это не обязательная линейная цепочка. Decision layer может быть вызван параллельно с context resolver; deterministic attention может отсеять событие ещё раньше.

## 4.4 No-route is valid

Нельзя принудительно сопоставлять запрос с capability только потому, что найдено ближайшее embedding.

```text
high confidence → route
medium confidence → additional evidence / clarification
low confidence → abstain
```

Принцип:

> **No route is better than a confident wrong route.**

---

# 5. NEW CATEGORY — Decision Models / System One

## 5.1 Jev — reference, not dependency

Jev — закрытая коммерческая decision-model система TypeSafe. Она ориентирована на typed decisions, confidence/probabilities и использование в routing/selection/verification вместо генеративного текстового ответа.

Source: https://typesafe.ai/
Source: https://typesafe.ai/blog/introducing-system-one-models-and-jev

### Что важно для U.N.A.

Полезен не сам бренд Jev, а API pattern:

```text
state + typed question
        ↓
decision + confidence
```

Примеры вопросов:

```text
Which capability?
Should we interrupt?
Is this urgent?
Need clarification?
Need LLM?
Which provider?
Which tool?
Risk level?
```

### Что НЕ следует делать

Не делать Jev обязательной зависимостью. Архитектура должна позволять:

```text
DecisionProvider
├─ Jev
├─ open decision model
├─ local classifier
├─ embedding scorer
└─ LLM fallback
```

## 5.2 OpenJev

Open-source попытка воспроизвести архитектурный паттерн Jev средствами открытых моделей. Сам проект подчёркивает, что не является копией закрытой модели.

Source: https://github.com/TheoLeeCJ/openjev

Релевантность: **HIGH / research**.

Что изучать:

- decision API;
- question schema;
- confidence semantics;
- local serving;
- calibration;
- training/evaluation methodology.

## 5.3 jevlike

Небольшой open-source проект, реализующий похожий паттерн выбора из динамического набора вариантов с вероятностями.

Source: https://github.com/vinnylarouge/jevlike

Релевантность: **HIGH / experimental**.

Полезен как доказательство того, что typed-choice слой можно исследовать независимо от закрытого Jev.

## 5.4 jev-ultrafast

Browser-use проект, где Jev выбирает операцию и элемент, а небольшая LLM подключается только там, где требуется генерация текста. Это практически прямой reference для:

```text
Decision model → choose action
Small LLM → generate text only when required
```

Source: https://github.com/browser-use/jev-ultrafast

Релевантность: **VERY HIGH / architecture reference**.

---

# 6. Semantic Routing

## 6.1 vLLM Semantic Router

Programmable Mixture-of-Models routing layer, который учитывает сигналы запроса, пользовательские предпочтения и policy для выбора model path. Проект активно развивается; v0.3 “Themis” добавляет stateful production routing.

Source: https://github.com/vllm-project/semantic-router

Релевантность: **VERY HIGH**.

Что взять:

- signal-driven routing;
- capability/model selection;
- heterogeneous compute awareness;
- privacy-aware routing;
- model pool thinking;
- stateful routing.

Что не брать целиком:

- инфраструктуру Kubernetes/gateway уровня, если она не нужна desktop U.N.A.;
- делать внешний router владельцем U.N.A. cognition.

## 6.2 Aurelio Semantic Router

Open-source semantic routing library, ориентированная на быстрые решения без генерации полного ответа.

Source: https://github.com/aurelio-labs/semantic-router

Релевантность: **HIGH**.

Особенно полезна для изучения:

- route abstractions;
- encoder choices;
- thresholds;
- fuzzy/semantic decisions;
- route validation.

## 6.3 NadirClaw

Open-source LLM router/cost optimizer, использующий классификацию/centroids и cascade verification. Новые версии используют PolyForm Noncommercial License, поэтому лицензия должна учитываться отдельно.

Source: https://github.com/NadirRouter/NadirClaw

Source: https://github.com/NadirRouter/NadirClaw/blob/main/CHANGELOG.md

Релевантность: **HIGH / research, license caution**.

Полезный паттерн:

```text
route
→ verifier
→ cascade
→ escalate
```

Не переносить зависимость на U.N.A. автоматически из-за лицензии и gateway-oriented дизайна.

---

# 7. Structured Decisions / Constrained Generation

Эта категория стала особенно важной после Graphiti failure.

## 7.1 Outlines

Structured-output framework: schema/grammar constrained generation, поддержка OpenAI, Ollama, vLLM и других backends. Apache-2.0.

Source: https://github.com/dottxt-ai/outlines

Релевантность: **VERY HIGH** для structured output, extraction и typed cognition contracts.

## 7.2 XGrammar

Constrained decoding framework, поддерживающий JSON Schema, EBNF, Lark и structural tags. Отдельно полезен тем, что позиционируется как способ гарантировать структуру выхода во время генерации.

Source: https://github.com/mlc-ai/xgrammar

Релевантность: **VERY HIGH** для local inference и Graphiti extraction.

## 7.3 SGLang structured outputs

SGLang поддерживает JSON schema, regex и EBNF constraints с XGrammar, Outlines и Llguidance backends.

Source: https://github.com/sgl-project/sglang
Source: https://github.com/sgl-project/sgl-project.github.io/blob/main/markdown/advanced_features/structured_outputs.md

Релевантность: **HIGH**.

## 7.4 Guidance

Программный подход к управлению генерацией, условным ветвлениям, loop/tool use и constrained outputs.

Source: https://github.com/guidance-ai/guidance

Релевантность: **MEDIUM/HIGH**.

Полезен скорее как research reference по deterministic control поверх генеративного backend.

## 7.5 Instructor

Previously tracked in v4.1 as a typed structured-output library. Retained in catalog for comparison with Outlines/XGrammar; primary adoption candidate depends on exact provider/runtime boundaries and should not be introduced merely to wrap existing schema validation.

Source: https://github.com/instructor-ai/instructor

Релевантность: **MEDIUM / comparison**.

---

# 8. Memory / Continuity / Context

## 8.1 Letta / Letta Code

Letta has evolved from MemGPT into a stateful-agent platform. Current active code is centered in `letta-ai/letta-code`, with memory, identity, skills, sessions and long-lived agents.

Source: https://github.com/letta-ai/letta
Source: https://github.com/letta-ai/letta-code

Релевантность: **VERY HIGH**.

Особенно полезно:

- separation of core memory vs archival/search memory;
- identity persistence;
- session continuity;
- “dreaming” / background memory work;
- procedural memory via skills;
- current-vs-historical architecture transition.

## 8.2 Magic Context

CortexKit / Magic Context формализует unbounded context, capture → consolidate → recall и explicit injection budget. Current configuration docs expose `injection_budget_tokens` and cross-session memory behavior.

Source: https://github.com/cortexkit/magic-context
Source: https://github.com/cortexkit/magic-context/blob/master/CONFIGURATION.md

Релевантность: **VERY HIGH**.

Особенно важные ideas:

- bounded injection budget;
- context outside prompt;
- selective recall;
- consolidation;
- memory inspector / provenance.

## 8.3 opencode-memory

WRITE → DREAM → SURFACE lifecycle, conflict tracking, core/archival/temporary/pinned tiers, relevance-gated surfacing, retrieval feedback and privacy-aware memory.

Source: https://github.com/cioffiAI/opencode-memory

Релевантность: **VERY HIGH**.

Это почти прямой reference для U.N.A. memory lifecycle:

```text
WRITE
→ candidate
→ DREAM / consolidate
→ SURFACE only if relevant
```

## 8.4 opencode-lcm

Lossless Context Memory plugin: архивирование старого контекста, searchable summaries/artifacts, automatic retrieval, retention controls and performance harness.

Source: https://github.com/Plutarch01/opencode-lcm

Релевантность: **VERY HIGH**.

## 8.5 opencode-short-term-memory

Retained from v4.1 catalog as an OpenCode memory experiment. **Carry-forward / current revalidation needed**. Compare specifically for short-term memory, context packing and tool/session lifecycle.

## 8.6 Cloudflare Agents Sessions

Sessions capability provides durable conversation history, tree-structured messages, streamed/byte-budgeted reads, compaction overlays, optional FTS and lossless payload storage. Crucially, prompt assembly lives in `agents/context`, separate from session persistence.

Source: https://github.com/cloudflare/agents/blob/main/docs/agents/sessions.md

Релевантность: **VERY HIGH**.

Это подтверждает architectural separation:

```text
Session storage ≠ Context assembly
```

## 8.7 Mem0

Retained from v4.1 as major memory reference. Retrieval-oriented API, memory operations, conflict/update/delete semantics and scoped memory remain relevant.

Source: https://github.com/mem0ai/mem0

Релевантность: **VERY HIGH / comparison**.

## 8.8 Graphiti

Temporal knowledge graph for agents with provenance, temporal validity, episodes and hybrid retrieval.

Source: https://github.com/getzep/graphiti

Current verified ecosystem fact: Kuzu is deprecated; Graphiti documentation recommends Neo4j or FalkorDB for new deployments. FalkorDB and falkordblite are supported extras.

Source: https://github.com/getzep/graphiti/blob/main/pyproject.toml
Source: https://github.com/getzep/graphiti?ref=www.getzep.com/blog

U.N.A. relevance: **VERY HIGH, but integration remains OPEN**.

The U.N.A. Step 1 spike demonstrated:

```text
U.N.A. MCP
→ Graphiti
→ memory_add
→ extraction
→ FAIL on qwen3:1.7b structured-output path
```

The important conclusion is not “Graphiti is broken”; the evidenced failure is specific to the tested extraction/backend path.

## 8.9 LlamaIndex

LlamaIndex now treats `Memory` as a flexible abstraction, with short-term FIFO memory and optional long-term extraction. It also separates workflow context from memory, which maps well to U.N.A.

Source: https://github.com/run-llama/llama_index
Source: https://github.com/run-llama/llama_index/blob/main/docs/src/content/docs/framework/module_guides/deploying/agents/memory.mdx

Релевантность: **HIGH**.

## 8.10 GraphRAG

Microsoft GraphRAG remains relevant as graph retrieval research, but the repository explicitly says it is largely in maintenance mode and not accepting new feature work.

Source: https://github.com/microsoft/graphrag

Релевантность: **MEDIUM / research reference**, not adoption target.

---

# 9. Context and Cache Infrastructure

## 9.1 LMCache

KV-cache management layer designed to reuse prompt computation across requests/sessions and across inference engines. Supports persistent/tiered cache, local disk, Redis/Valkey and other backends.

Source: https://github.com/LMCache/LMCache

Релевантность: **HIGH / future research**.

Important for U.N.A.:

- static/cacheable prompt regions;
- multi-turn latency;
- local inference efficiency;
- possibility of moving repeated prompt computation out of the critical path.

Do not add now: U.N.A. should first fix logical context composition before optimizing cache machinery.

## 9.2 Prompt-cache principles

Anthropic/OpenAI prompt caching research retained from v4.1: stable prefix, mutable/cacheable region, volatile suffix. v4.2 treats this as a composition design constraint, not a provider-specific feature.

---

# 10. Agent Runtime / Multi-Agent / Workflow

## 10.1 Microsoft Agent Framework

Open framework for production-grade agents/workflows in Python and .NET, including type-safe routing, checkpointing, human-in-the-loop, agent sessions, context providers and MCP clients.

Source: https://github.com/microsoft/agent-framework
Source: https://github.com/MicrosoftDocs/semantic-kernel-docs/blob/main/agent-framework/overview/index.md

Релевантность: **HIGH / reference**.

Особенно важны:

- type-safe routing;
- workflow graphs;
- checkpointing;
- session state;
- middleware/policy hooks.

Не переносить whole framework в Electron автоматически.

## 10.2 LangGraph

Graph-based agent/workflow runtime with checkpoint persistence, state snapshots, task-level writes, durability modes and stores for long-term memory.

Source: https://github.com/langchain-ai/langgraph
Source: https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/persistence.mdx

Релевантность: **VERY HIGH / architecture reference for Phase 3**.

Important distinction:

```text
checkpointer = short-term execution state
store = long-term cross-thread memory
```

## 10.3 Hermes Agent

NousResearch autonomous agent with persistent memory, session search, skills, provider routing, computer use, cron/jobs and current active releases. As of the research snapshot, v0.21.3 is the latest listed release dated 2026-09-14.

Source: https://github.com/NousResearch/hermes-agent
Source: https://github.com/NousResearch/hermes-agent/releases

Memory source: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md

Computer-use source: https://github.com/NousResearch/hermes-agent/blob/main/skills/autonomous-ai-agents/computer-use/SKILL.md

Релевантность: **VERY HIGH**.

Interesting pattern:

- bounded always-in-context memory;
- separate FTS5 session search with no LLM call;
- procedural skills as separate memory class;
- provider routing;
- background computer use without moving foreground focus.

## 10.4 OpenHands

Open-source development agent platform with tools, web/API access, local workstation workflows and separate Agent SDK.

Source: https://github.com/openhands

Релевантность: **HIGH / execution reference**.

## 10.5 OpenInterpreter

Carry-forward from v4.1 as a strong reference for natural-language-to-computer execution. Current status should be revalidated before dependency adoption.

## 10.6 AutoGen

Carry-forward historical reference. Compare only where its multi-agent interaction patterns are still useful; do not assume it is the current strategic runtime without fresh evaluation.

## 10.7 CrewAI

Carry-forward multi-agent framework reference. Useful for role/task orchestration comparisons, but U.N.A. should not adopt a framework solely because “multi-agent” sounds advanced.

## 10.8 CAMEL

Carry-forward research reference for multi-agent systems and agent societies. More valuable as a research source than as a runtime dependency for the current desktop architecture.

---

# 11. Browser / GUI / Computer Use

## 11.1 Playwright

Stable browser automation foundation. U.N.A. should prefer DOM/accessibility-backed browser automation over raw mouse coordinates whenever a browser-specific route is available.

Source: https://github.com/microsoft/playwright

Релевантность: **VERY HIGH**.

## 11.2 Browser Use

Open-source web agent stack. Current organization remains active; browser-use itself and browser-harness provide browser-agent and self-healing automation patterns.

Source: https://github.com/browser-use/browser-use

Релевантность: **VERY HIGH**.

## 11.3 Stagehand

Browser-agent SDK built on Playwright concepts, with self-healing actions, token-efficient context, `act/observe/extract`, OTel support and WebMCP.

Source: https://github.com/browserbase/stagehand

Релевантность: **VERY HIGH / Pass 3**.

## 11.4 Skyvern

Carry-forward browser-automation reference from v4.1. Revalidate current architecture before choosing alongside Browser Use/Stagehand.

## 11.5 OmniParser

Microsoft visual parser for GUI understanding. Current release listing shows v2.0.1 dated 2026-09-12.

Source: https://github.com/microsoft/OmniParser/releases

Релевантность: **HIGH** for screen understanding / computer-use research.

## 11.6 pywinauto

Carry-forward Windows GUI automation reference. Useful for accessibility/UIA-backed Windows control and complementary to coordinate-only automation.

## 11.7 Hermes CUA driver pattern

Hermes computer-use documentation describes background-first desktop driving that does not move the user's cursor or steal foreground focus, with accessibility-tree mechanics and platform-specific drivers.

Source: https://github.com/NousResearch/hermes-agent/blob/main/skills/autonomous-ai-agents/computer-use/SKILL.md

Релевантность: **VERY HIGH**.

This is directly relevant to U.N.A. because its desired presence model should coexist with user work rather than seize the foreground.

---

# 12. Voice / Perception

## 12.1 Silero VAD

Small VAD family with ONNX support and broad language coverage; v6.2.2 listed in current releases.

Source: https://github.com/snakers4/silero-vad/releases

Релевантность: **VERY HIGH** as low-cost perception gate.

This fits the U.N.A. principle:

```text
audio
→ VAD
→ speech segment
→ ASR
```

rather than always waking ASR/LLM.

## 12.2 whisper.cpp

Carry-forward local ASR reference. Especially useful for Windows/local deployment and offline operation.

Source: https://github.com/ggerganov/whisper.cpp

## 12.3 faster-whisper

Whisper reimplementation using CTranslate2, with memory/latency optimizations and quantization support.

Source: https://github.com/SYSTRAN/faster-whisper

Релевантность: **HIGH**.

## 12.4 sherpa-onnx

Offline speech processing stack for Windows/Linux/mobile and multiple runtimes; current releases actively ship new functionality. Current repo also shows work around smart-turn detection and multilingual audio components.

Source: https://github.com/k2-fsa/sherpa-onnx
Source: https://github.com/k2-fsa/sherpa-onnx/releases

Релевантность: **VERY HIGH** for future local-first voice pipeline.

## 12.5 Piper

Carry-forward local TTS reference.

Source: https://github.com/rhasspy/piper

## 12.6 pixi-live2d-display

Carry-forward Live2D rendering reference. Use as renderer technology, not cognition layer.

---

# 13. Desktop Companion / Presence Projects

The companion category remains strategically important because U.N.A. is not intended to be only an agent runtime. It must have presence, personality and continuous interaction.

## 13.1 Project AIRI

Open-source self-hosted virtual companion focused on voice, visual character and game/world interaction. Current README explicitly covers Windows/macOS/Web, realtime voice and integrations such as Minecraft/Factorio.

Source: https://github.com/moeru-ai/airi

Релевантность: **VERY HIGH / presence research**.

Take:

- continuous presence;
- real-time voice loop;
- world/game integration;
- companion architecture;
- Live2D ecosystem.

Do not take:

- the project’s character assumptions as U.N.A. identity;
- project-specific gameplay stack wholesale.

## 13.2 Alice

Voice-first Electron desktop companion with memory, function calling, MCP, local/cloud providers, STT/TTS and embeddings.

Source: https://github.com/pmbstyle/Alice

Релевантность: **VERY HIGH** because its overall product shape is unusually close to U.N.A.

## 13.3 AILIS

Current open-source desktop AI companion with VRM character, voice, long-term memory, computer use and an evaluated general agent harness.

Source: https://github.com/haowenGuo/AILIS

Релевантность: **VERY HIGH / new v4.2 discovery**.

Particularly useful because it explicitly combines:

- presence;
- long-term memory;
- general tools;
- controllable execution;
- traceable progress;
- recoverable failure.

## 13.4 Yumii

Open-source Windows-first voice-first companion with persistent memory and permission-gated tools, advertised as fully local.

Source: https://github.com/CodeNeuron58/Yumii

Релевантность: **HIGH / product comparison**.

## 13.5 Nexus

Local-first desktop companion with Electron + React + TypeScript, Live2D/portrait-puppet presence, text/voice and memory.

Source: https://github.com/FanyinLiu/Nexus

Релевантность: **HIGH**.

## 13.6 Warashi

Open-source desktop companion with Live2D, voice, long-term memory, proactive conversation and sleep mode, built around Open-LLM-VTuber foundations.

Source: https://github.com/inni918/warashi

Релевантность: **HIGH**.

## 13.7 LiveClaw

Live2D desktop companion for OpenClaw with voice and WebSocket streaming; Electron-based.

Source: https://github.com/zeikar/liveclaw

Релевантность: **MEDIUM/HIGH** as integration/presence reference.

## 13.8 Accompany

Tauri + React + PixiJS/Live2D desktop companion that monitors coding-agent sessions and proactively alerts the user.

Source: https://github.com/windameister/accompany

Релевантность: **HIGH** for agent-state → presence/notification coupling.

## 13.9 Desktop AI Companion

Electron + Live2D + Ollama + whisper.cpp + memory. Useful as a minimal reference for local desktop presence stack.

Source: https://github.com/moheith/desktop-ai-companion

Релевантность: **MEDIUM**.

## 13.10 Desktop-Pet variants

`valerieliang/desktop-pet`: Windows desktop pet, any OpenAI-compatible backend, persistent memory, tools, alarms.

Source: https://github.com/valerieliang/desktop-pet

`Imzl-zl/desktop-pet`: coding-agent-aware pixel pet, monitors multiple agents and reacts offline.

Source: https://github.com/Imzl-zl/desktop-pet

`chron303/desktop-pet`: local Windows companion reacting to apps/music/memory.

Source: https://github.com/chron303/desktop-pet

Релевантность: **MEDIUM/HIGH** as presence/reactivity references.

## 13.11 AVATAR / Agent Avatar

`ARPAHLS/avatar` provides open-source VRM desktop overlay, lip sync and audio-reactive motion for local/cloud AI or any audio source.

Source: https://github.com/ARPAHLS/avatar

Релевантность: **HIGH for renderer/presence**.

## 13.12 DesktopFriends

Carry-forward from v4.1 companion catalog. **Current status revalidation needed.** Retain because it was part of the original ecosystem scan.

## 13.13 DesktopPetLive2D

Carry-forward from v4.1. **Current status revalidation needed.**

## 13.14 NyaDeskPet

Carry-forward from v4.1. **Current status revalidation needed.**

## 13.15 Agent Avatar

Carry-forward from v4.1. **Current status revalidation needed.**

---

# 14. Model Serving / Local Inference

## 14.1 llama.cpp

Foundational local GGUF inference stack and tokenizer/context reference.

Source: https://github.com/ggerganov/llama.cpp

Релевантность: **VERY HIGH** for local model capability discovery and possible tokenizer/context introspection.

## 14.2 llamafile

Mozilla AI packaging approach that combines llama.cpp + Cosmopolitan libc into single-file executables. Current release listing includes v0.10.4.

Source: https://github.com/mozilla-ai/llamafile
Source: https://github.com/mozilla-ai/llamafile/releases

Релевантность: **MEDIUM/HIGH** for portable local deployments.

## 14.3 vLLM

OpenAI-compatible model serving and high-performance inference platform.

Source: https://github.com/vllm-project/vllm

Релевантность: **HIGH / future provider backend**, especially when user hardware eventually permits server-class local inference.

## 14.4 SGLang

High-performance serving/runtime with structured output support via XGrammar/Outlines/Llguidance.

Source: https://github.com/sgl-project/sglang

Релевантность: **HIGH**.

## 14.5 LMCache

Covered in context/cache section. Candidate for advanced prompt/KV reuse.

---

# 15. Model / Provider Gateway

## 15.1 LiteLLM

Unified OpenAI-style interface to 100+ LLM providers plus gateway features such as load balancing, spending and guardrails.

Source: https://github.com/BerriAI/litellm

Релевантность: **HIGH as architectural reference**.

But U.N.A. should likely own its own provider abstraction rather than blindly inserting LiteLLM into Electron. LiteLLM may become useful as a sidecar/gateway if the number of providers becomes large enough.

## 15.2 LLM-Router

Carry-forward router reference from v4.1. Revalidate exact project/version before adoption.

## 15.3 vLLM Semantic Router

Preferred research reference for capability-aware Mixture-of-Models routing.

---

# 16. Context Observation / World State

## 16.1 ActivityWatch

Privacy-focused open-source time tracker. Watchers can observe active application/window title, active browser tab/title/URL and keyboard/mouse activity.

Source: https://github.com/ActivityWatch/activitywatch

Релевантность: **VERY HIGH**.

Why it matters for U.N.A.:

`WorldState` requires observation, but it should not require LLM reasoning for every observation.

ActivityWatch is a strong pattern for:

```text
watchers
→ local events
→ durable event store
→ context layer
```

Privacy is also aligned with U.N.A.’s local-first model.

## 16.2 Glances

Carry-forward system-monitoring reference. Useful for exposing low-cost resource telemetry to ResourceManager.

Source: https://github.com/nicolargo/glances

Релевантность: **MEDIUM/HIGH**.

---

# 17. Durable Task Runtime / Background Agency

## 17.1 Temporal

Durable execution platform with resilient workflows, retries and process-failure recovery.

Source: https://github.com/temporalio/temporal

Релевантность: **VERY HIGH / Phase 3+ reference**.

Important U.N.A. lesson:

```text
conversation runtime ≠ durable task runtime
```

A long-running autonomous task must survive restart independently of a chat session.

## 17.2 LangGraph checkpoints

Checkpointing at graph supersteps and task-level writes enables time-travel, resumability, and recovery.

Source: https://github.com/langchain-ai/langgraph
Source: https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/checkpointers.mdx

Релевантность: **VERY HIGH**.

## 17.3 BullMQ

Node-oriented queue system with delayed jobs, retries, multiple language clients and Redis/Postgres-backed options.

Source: https://github.com/taskforcesh/bullmq

Релевантность: **HIGH for a lightweight local task queue**, but external Redis may be overkill for early U.N.A.

## 17.4 Prefect

Workflow orchestration with scheduling, retries, caching, dynamic flows and event-based automations.

Source: https://github.com/PrefectHQ/prefect

Релевантность: **MEDIUM/HIGH as reference**, Python-heavy.

## 17.5 Toolfish

Carry-forward task/runtime research candidate. **Current status revalidation needed** before adoption.

---

# 18. Observability / Evaluation

## 18.1 OpenTelemetry

OpenTelemetry JS provides standard collection of traces, metrics and logs.

Source: https://github.com/open-telemetry/opentelemetry-js

Релевантность: **HIGH / later integration**.

## 18.2 Phoenix

Open-source AI observability/evaluation platform with OTel-based tracing, dataset experiments, retrieval/response evaluations and prompt management.

Source: https://github.com/Arize-ai/phoenix

Релевантность: **VERY HIGH for evaluation architecture**, not necessarily as a permanent embedded production dependency.

## 18.3 Metrics principle for U.N.A.

Before large routing changes, collect baseline metrics:

```text
route_distribution
L0_fast%
L0_direct%
L1_semantic%
L1_regex%
L2_llm%
L3_specialized%
L4_cloud%

latency
p50 / p95

resource
LLM_calls/request
tokens/request
GPU_time
CPU_time

quality
false_route
abstain_rate
fallback_rate
clarification_rate
```

This is essential because “cheaper” is otherwise an intuition, not an engineering result.

---

# 19. Security / Credential / Red-Team

## 19.1 PyRIT

Microsoft open-source AI red-team/evaluation framework. Current release history includes scanner/scorer/converter support and GUI groundwork.

Source: https://github.com/Azure/PyRIT
Source: https://github.com/microsoft/PyRIT/releases

Релевантность: **HIGH for testing methodology**.

## 19.2 1Password Shell Plugins

CLI authentication approach where credentials are kept outside plaintext local files and temporary credential use is approved via biometrics.

Source: https://github.com/1Password/shell-plugins

Релевантность: **MEDIUM/HIGH security reference**, especially for future CLI/tool credential flows.

## 19.3 Indirect injection principle

Retain v4.1 decision: external tool output is data, not instructions. Do not blindly “sanitize everything” into lossy text. The safer architecture is trust-boundary separation + policy evaluation + constrained action interface.

---

# 20. MCP

## 20.1 MCP TypeScript SDK

The official MCP TypeScript SDK is now on the v2 stable release line implementing the 2026-07-28 specification. Official docs list TypeScript as Tier 1.

Source: https://github.com/modelcontextprotocol/typescript-sdk
Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md
Source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/sdk.mdx

Релевантность: **VERY HIGH**.

Architectural implication:

MCP is a **capability transport/protocol**, not a replacement for U.N.A.’s own policy and routing layers.

U.N.A. should retain:

```text
Provider
  ↓
Policy
  ↓
MCP/tool capability
  ↓
Executor
  ↓
Verify
  ↓
Record
```

---

# 21. Full Carry-Forward Catalog from v4.1

The following entries are intentionally retained so v4.2 does not erase research history.

## Companion / presence

- Project AIRI — updated/current.
- Alice — updated/current.
- DesktopFriends — carry-forward.
- DesktopPetLive2D — carry-forward.
- Desktop AI Companion — updated/current enough for architecture reference.
- Warashi — updated/current.
- LiveClaw — updated/current.
- Accompany — updated/current.
- Agent Avatar — carry-forward.
- AVATAR — updated/current via ARPAHLS/avatar.
- NyaDeskPet — carry-forward.
- Desktop-Pet — updated via multiple current variants.
- AILIS — new v4.2.
- Yumii — new v4.2.
- Nexus — new v4.2.

## Memory / context

- Hermes Agent — updated/current.
- Magic Context — updated/current.
- opencode-memory — updated/current.
- opencode-lcm — updated/current.
- opencode-short-term-memory — carry-forward.
- Cloudflare Agents Sessions — updated/current.
- Gemini CLI — updated/current.
- Letta — updated/current.
- Graphiti — updated/current.
- LlamaIndex — updated/current.
- Mem0 — carry-forward/current ecosystem reference.
- GraphRAG — updated/current but maintenance mode.

## Agent / execution

- OpenInterpreter — carry-forward.
- OpenHands — updated/current.
- MCP TypeScript SDK — updated/current v2.
- Microsoft Agent Framework — updated/current.
- AutoGen — carry-forward / revalidation needed.
- CAMEL — carry-forward.
- CrewAI — carry-forward.
- LangGraph — updated/current.
- Prefect — updated/current.
- Temporal — updated/current.
- BullMQ — updated/current.
- Toolfish — carry-forward.

## Browser / GUI

- Playwright — updated/current.
- Browser Use — updated/current.
- Stagehand — updated/current.
- Skyvern — carry-forward.
- pywinauto — carry-forward.
- OmniParser — updated/current.

## Voice / presence

- Silero VAD — updated/current.
- whisper.cpp — retained.
- faster-whisper — updated/current.
- sherpa-onnx — updated/current.
- Piper — retained.
- pixi-live2d-display — retained.

## Models / inference / routing

- LiteLLM — retained/updated reference.
- LLM-Router — carry-forward.
- llama.cpp — retained.
- vLLM — retained/current.
- SGLang — updated/current.
- LMCache — updated/current.
- llamafile — new explicit current subsection.
- vLLM Semantic Router — new v4.2.
- Aurelio Semantic Router — new v4.2.
- NadirClaw — new v4.2.

## Structured output / decision models

- Outlines — new v4.2.
- Guidance — new v4.2.
- Instructor — new v4.2 comparison.
- XGrammar — new v4.2.
- Jev — new v4.2, closed reference.
- OpenJev — new v4.2.
- jevlike — new v4.2.
- jev-ultrafast — new v4.2.

## Observability / resource / security

- Phoenix — updated/current.
- OpenTelemetry — updated/current.
- ActivityWatch — updated/current.
- Glances — retained.
- PyRIT — updated/current.
- 1Password Shell Plugins — updated/current.

---

# 22. What U.N.A. Should Borrow vs Avoid

## Borrow

### From Letta

```text
core memory ≠ archival memory
memory ≠ transcript
skills ≠ memory facts
```

### From opencode-memory

```text
WRITE → DREAM → SURFACE
```

and:

```text
relevance-gated surfacing
conflict lifecycle
privacy per memory
```

### From Cloudflare Sessions

```text
persistent session storage
separate context assembly
byte-budgeted reads
```

### From Jev / decision-model class

```text
typed decision
confidence
abstention
many narrow questions instead of one giant generation
```

### From vLLM Semantic Router

```text
request signals
user preference
policy
resource
model path selection
```

### From NadirClaw

```text
route → verify → escalate
```

### From Outlines / XGrammar / SGLang

```text
constrained generation
schema contracts
provider-independent structured outputs
```

### From ActivityWatch

```text
cheap observation
local ownership
watchers → events → context
```

### From Temporal / LangGraph

```text
execution state separate from conversation
checkpointing
resume after crash
```

### From Hermes

```text
bounded always-in-context memory
FTS session search without LLM calls
skills as procedural memory
background computer use
```

### From AIRI / Alice / AILIS / Warashi / Accompany

```text
presence
voice
avatar
proactivity
agent state → visible state
```

---

# 23. What U.N.A. Should NOT Build Twice

The following are now explicit anti-duplication constraints:

1. Do not create another Fast Router. Extend `fast-path.ts` / `router.ts`.
2. Do not create another Semantic Intent Router. Harden `semantic-router.ts`.
3. Do not create a second regex Intent system. Keep `intent.ts` as deterministic fallback / vocabulary.
4. Do not create a separate Attention Engine until `attention-manager.ts` is formally proven insufficient.
5. Do not create a separate Policy Engine that duplicates `classifier.ts` + confirmations. Define it as a composition boundary first.
6. Do not create a new “EmbeddingIntentIndex” merely to rename existing functionality.
7. Do not make Jev mandatory.
8. Do not make Graphiti mandatory.
9. Do not make the current qwen3:1.7b model an architectural dependency.
10. Do not tie memory extraction to the same model used for dialogue.
11. Do not use GUI coordinate automation when an accessibility/DOM/browser-native route exists.
12. Do not invoke an LLM for every event detected by WorldState/Attention.
13. Do not put the full transcript into every prompt.
14. Do not add observability stacks before the underlying metrics questions are defined.

---

# 24. Recommended U.N.A. Cognitive Runtime Target

```text
                       ┌───────────────────────────────┐
                       │           INPUTS              │
                       │ text / voice / screen /      │
                       │ events / gestures / files    │
                       └──────────────┬────────────────┘
                                      ↓
                            SIGNAL NORMALIZER
                                      ↓
                           OBSERVATION / WORLDSTATE
                                      ↓
                              ATTENTION GATE
                         ┌────────────┴────────────┐
                         │                         │
                       ignore                    notice
                                                   ↓
                                          INTENT / SEMANTICS
                                                   ↓
                                     CAPABILITY / ACTION RESOLVER
                                                   ↓
                                           CONTEXT RESOLVER
                              ┌────────────────────┼──────────────────┐
                              │                    │                  │
                           Memory              WorldState          User prefs
                              └────────────────────┼──────────────────┘
                                                   ↓
                                            POLICY / SAFETY
                                                   ↓
                                            ROUTE AUTHORITY
                                                   ↓
                ┌───────────────┬──────────────────┼─────────────────┐
                │               │                  │                 │
              L0/L1       Decision Model      Local LLM       Cloud LLM
                │               │                  │                 │
                └───────────────┴──────────────────┴─────────────────┘
                                                   ↓
                                              ACTION GRAPH
                                                   ↓
                                               EXECUTOR
                                                   ↓
                                               VERIFY
                                                   ↓
                                                RECORD
                                                   ↓
                                              MEMORY / STATE
```

This is an architectural target, not a demand to implement all boxes now.

---

# 25. Attention Without LLM — Reference Design

Attention should be mostly deterministic.

## Event salience

```text
salience =
    importance
  + urgency
  + user_relevance
  + novelty
  + persistence
  - repetition
  - ignored_count
  - noise
```

The score is not truth by itself; it is a cheap trigger-control mechanism.

## Suggested levels

```text
0 IGNORE
1 OBSERVE
2 UPDATE
3 REACT
4 COGNIZE
5 INTERRUPT
```

Possible mapping to current U.N.A. states should be performed in the reconciliation step, not by introducing another state machine.

## Crucial rule

```text
EVENT ≠ LLM TRIGGER
```

A new window appearing, CPU changing, or a browser tab changing should ordinarily update state, not invoke a generative model.

---

# 26. Intent → Capability → Action

Current U.N.A. `intent` vocabulary is comparatively coarse. v4.2 recommends exploring a second semantic vocabulary.

Example:

```text
User:
"вруби что-нибудь"

Intent:
media_control

Capability:
PLAY_MEDIA

Context:
active media session?
preferred player?
last player?
browser media?

Action:
play(target)
```

This solves the distinction:

```text
intent = what domain is this?
capability = what kind of operation?
action = concrete operation + arguments
tool = implementation mechanism
```

This is one of the most important architectural clarifications to carry into Step 2/3.

---

# 27. Specialized Model Architecture

U.N.A. should not assume one model can do everything.

A plausible provider graph:

```text
Conversation model
      │
      ├── local small model
      └── cloud/large model

Memory extraction model
      ├── local structured model
      └── cloud fallback

Embedding model
      └── local semantic vectors

Vision model
      └── screen/image understanding

ASR
      └── whisper/sherpa/etc.

TTS
      └── Piper/cloud

Decision model
      ├── local classifier
      ├── OpenJev-like
      └── Jev (optional external)

Planner
      └── local or strong LLM depending on complexity
```

This lets the dialogue model remain lightweight while a stronger specialized model handles memory extraction or complex planning only when needed.

---

# 28. Graphiti Decision Boundary

Current research boundary:

### A — Backend

`Graphiti + Kuzu` should not be treated as future architecture because current Graphiti explicitly deprecates Kuzu.

Candidate backends:

- FalkorDB;
- falkordblite;
- Neo4j;
- Neptune for remote/cloud contexts.

### B — Extraction

Current U.N.A. spike showed `json_object` path failure where the local model echoed an injected schema instead of returning the expected extraction object.

Next question:

```text
native Ollama JSON-schema / constrained decoding
```

not just “try another prompt”.

### C — Retrieval

Still unverified until write/extraction succeeds.

Decision rule:

> Do not make Graphiti an architecture dependency until A+B+C can be tested independently and end-to-end.

---

# 29. Phase 2 Research Priorities after v4.2

Recommended order:

## Step 1.5 — Routing Reconciliation

Inventory actual current routing code and prove canonical authority.

Output:

```text
fast-path.ts
semantic-router.ts
intent.ts
router.ts
attention-manager.ts
resource-manager.ts
world-model.ts
modes.ts
```

Build a table of who makes which decision.

## Step 1.5b — Baseline Metrics

Build a representative command/event corpus and measure current route distribution and latency.

## Graphiti compatibility spike

Test:

1. FalkorDB/falkordblite compatibility;
2. native JSON-schema constrained extraction;
3. retrieval;
4. resource/latency impact.

## Step 2 — Cognitive Routing Proposal

Only after reconciliation.

The proposal should map each concept to existing code whenever possible.

## Step 3 — DEC

Potential DEC topics:

- canonical routing authority;
- Intent/Capability/Action separation;
- optional DecisionProvider capability;
- model/provider independence;
- Attention expansion;
- Graphiti boundary;
- CognitionRequest / Context Composer.

No production implementation before these decisions are accepted.

---

# 30. Research Backlog — New Questions Raised by v4.2

1. Can U.N.A. expose a stable `ModelCapabilities` interface without coupling to provider-specific SDKs?
2. Can existing `semantic-router.ts` evolve into an embedding capability router without creating a second router?
3. Should the decision layer support multiple typed questions per request?
4. What confidence calibration method should U.N.A. use for semantic and decision routes?
5. When should the system abstain instead of escalating?
6. Can Attention Manager become a deterministic resource gate for LLM invocation?
7. Should `DecisionProvider` be local-only by default?
8. Can a small specialized extraction model outperform a larger general dialogue model for structured memory write?
9. Should memory extraction and conversation use different models by default?
10. Can Graphiti be retained as optional L2 while core memory remains SQLite/FTS5?
11. Should ActivityWatch-like watchers feed WorldState directly?
12. How much of GUI automation can be moved from coordinates to accessibility/DOM semantics?
13. Can browser automation run in a background-first mode without stealing focus?
14. Which durable execution pattern is appropriate for U.N.A. Phase 3 without a large external service?
15. What is the minimum observability layer needed to prove routing savings?
16. What token budget should be reserved for memory vs history for different model classes?
17. How should `Context Composer` expose stable cacheable regions to heterogeneous providers?
18. Can prompt cache/KV cache reuse survive provider/model changes?
19. How should U.N.A. represent privacy boundaries independently of provider choice?
20. How should the system expose user correction of memory as `invalidated`, `replaced`, or `deleted`?

---

# 31. Final Architectural Position

The strongest idea emerging from v4.2 is not “use a better model”. It is:

> **Reduce the amount of cognition that requires a generative model at all.**

A mature U.N.A. should look like:

```text
perceive cheaply
↓
filter cheaply
↓
classify semantically
↓
make narrow decisions
↓
resolve context
↓
apply policy
↓
use tools deterministically where possible
↓
call a local LLM only when necessary
↓
escalate to stronger models only when justified
↓
verify
↓
record
↓
learn/remember
```

The system should therefore be evaluated by more than model benchmark quality. A good U.N.A. runtime should reduce:

- unnecessary LLM calls;
- unnecessary prompt tokens;
- unnecessary model swaps;
- unnecessary interruptions;
- unnecessary tool exposure;
- unnecessary context injection;
- unnecessary network access.

And it should increase:

- route correctness;
- abstention quality;
- continuity;
- observability;
- resource awareness;
- recoverability;
- privacy control;
- model interchangeability.

---

# 32. Source Index

Primary sources used or refreshed for v4.2 include:

- Project AIRI — https://github.com/moeru-ai/airi
- Alice — https://github.com/pmbstyle/Alice
- AILIS — https://github.com/haowenGuo/AILIS
- Yumii — https://github.com/CodeNeuron58/Yumii
- Nexus — https://github.com/FanyinLiu/Nexus
- Warashi — https://github.com/inni918/warashi
- LiveClaw — https://github.com/zeikar/liveclaw
- Accompany — https://github.com/windameister/accompany
- Desktop AI Companion — https://github.com/moheith/desktop-ai-companion
- Desktop Pet — https://github.com/valerieliang/desktop-pet
- ARPAHLS AVATAR — https://github.com/ARPAHLS/avatar
- Letta — https://github.com/letta-ai/letta
- Letta Code — https://github.com/letta-ai/letta-code
- Magic Context — https://github.com/cortexkit/magic-context
- opencode-memory — https://github.com/cioffiAI/opencode-memory
- opencode-lcm — https://github.com/Plutarch01/opencode-lcm
- Cloudflare Agents Sessions — https://github.com/cloudflare/agents/blob/main/docs/agents/sessions.md
- Graphiti — https://github.com/getzep/graphiti
- GraphRAG — https://github.com/microsoft/graphrag
- LlamaIndex — https://github.com/run-llama/llama_index
- Hermes Agent — https://github.com/NousResearch/hermes-agent
- OpenHands — https://github.com/openhands
- Microsoft Agent Framework — https://github.com/microsoft/agent-framework
- LangGraph — https://github.com/langchain-ai/langgraph
- MCP TypeScript SDK — https://github.com/modelcontextprotocol/typescript-sdk
- Playwright — https://github.com/microsoft/playwright
- Browser Use — https://github.com/browser-use/browser-use
- Stagehand — https://github.com/browserbase/stagehand
- OmniParser — https://github.com/microsoft/OmniParser
- Silero VAD — https://github.com/snakers4/silero-vad
- whisper.cpp — https://github.com/ggerganov/whisper.cpp
- faster-whisper — https://github.com/SYSTRAN/faster-whisper
- sherpa-onnx — https://github.com/k2-fsa/sherpa-onnx
- llama.cpp — https://github.com/ggerganov/llama.cpp
- llamafile — https://github.com/mozilla-ai/llamafile
- vLLM — https://github.com/vllm-project/vllm
- SGLang — https://github.com/sgl-project/sglang
- LMCache — https://github.com/LMCache/LMCache
- LiteLLM — https://github.com/BerriAI/litellm
- vLLM Semantic Router — https://github.com/vllm-project/semantic-router
- Aurelio Semantic Router — https://github.com/aurelio-labs/semantic-router
- NadirClaw — https://github.com/NadirRouter/NadirClaw
- Outlines — https://github.com/dottxt-ai/outlines
- XGrammar — https://github.com/mlc-ai/xgrammar
- Guidance — https://github.com/guidance-ai/guidance
- Instructor — https://github.com/instructor-ai/instructor
- Jev reference — https://typesafe.ai/
- OpenJev — https://github.com/TheoLeeCJ/openjev
- jevlike — https://github.com/vinnylarouge/jevlike
- jev-ultrafast — https://github.com/browser-use/jev-ultrafast
- Temporal — https://github.com/temporalio/temporal
- BullMQ — https://github.com/taskforcesh/bullmq
- Prefect — https://github.com/PrefectHQ/prefect
- Phoenix — https://github.com/Arize-ai/phoenix
- OpenTelemetry JS — https://github.com/open-telemetry/opentelemetry-js
- ActivityWatch — https://github.com/ActivityWatch/activitywatch
- Glances — https://github.com/nicolargo/glances
- PyRIT — https://github.com/Azure/PyRIT
- 1Password Shell Plugins — https://github.com/1Password/shell-plugins

---

# 33. Status of This Research Artifact

**Research version:** v4.2
**Date:** 2026-09-18
**Production U.N.A. code changes:** none implied by this document
**Purpose:** architecture research / project selection / decision preparation
**Decision authority:** `decision-log.md`, not this document
**Implementation authority:** `implementation-map.md` + actual code/tests

The research document is not itself a design approval. It is a map of evidence and candidates.
