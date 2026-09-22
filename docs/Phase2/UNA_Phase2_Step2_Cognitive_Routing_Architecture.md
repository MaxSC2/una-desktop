# U.N.A. v40 — Phase 2 / Step 2
## Cognitive Routing Architecture: model-independent cognition, semantic intents, deterministic attention

**Дата подготовки:** 2026-09-17  
**Проект:** U.N.A. Desktop v40  
**Статус:** архитектурное предложение, production tree не изменяет  
**Базовый контекст:** Phase 2 / Step 1 завершён коммитом `6ef17cb`; research по Memory & Continuity зафиксирован в `docs/research/phase-2-memory-research.md`.

---

## 1. Зачем нужен этот документ

U.N.A. нельзя строить как приложение, в котором любой вход пользователя автоматически превращается в вызов большой языковой модели.

Текущая U.N.A. уже имеет память, инструменты, безопасность, world state, attention manager, фоновые подсистемы и несколько cognition-путей. При этом локальная модель по умолчанию сейчас маленькая: `qwen3:1.7b`. Это полезно как эксплуатационный baseline, но не должно становиться архитектурным ограничением.

Цель Step 2:

> Построить слой когнитивной маршрутизации, который отделяет возможности U.N.A. от возможностей конкретной модели и отправляет каждую задачу на самый дешёвый механизм, который способен решить её достаточно надёжно.

Одновременно нужно сохранить ресурсную возможность использовать большие модели и современные API, когда задача действительно этого требует.

Главная идея:

**U.N.A. должна использовать ИИ, а не существовать ради вызова ИИ.**

---

## 2. Исходное наблюдение

Для большой доли повседневных команд генеративное рассуждение не нужно.

Примеры:

- «включи музыку»;
- «поставь на паузу»;
- «открой браузер»;
- «сделай скриншот»;
- «покажи системную информацию»;
- «создай напоминание через два часа»;
- «увеличь громкость».

Во всех таких случаях путь вида:

```text
input → LLM → tool selection → execution
```

может быть лишним по времени, CPU/GPU, VRAM и сложности.

Более подходящий путь:

```text
input
  ↓
normalization
  ↓
intent / capability detection
  ↓
context resolution
  ↓
policy
  ↓
action
```

LLM подключается только там, где нужен уровень обобщения, которого не хватает deterministic/semantic слоям.

---

## 3. Ключевой принцип: model-agnostic U.N.A.

Текущая модель является конфигурацией, а не частью идентичности архитектуры.

Нельзя кодировать систему в предположении:

- что всегда будет Qwen;
- что всегда будет 1.7B;
- что локальная модель умеет structured output;
- что она умеет vision;
- что она поддерживает одинаковое tool calling;
- что context window одинаков у всех providers;
- что одна модель одинаково хороша для диалога, extraction, vision, planning и memory.

Нужно разделить:

```text
U.N.A. Runtime
        │
        ├── cognition interface
        │
        ├── memory
        ├── safety
        ├── tools
        ├── world state
        ├── attention
        ├── tasks
        └── identity

Cognition Providers
        ├── local Ollama models
        ├── cloud APIs
        └── specialized models/providers
```

Заменяемость модели должна происходить через capability contract, а не через переписывание ядра.

---

## 4. Capability model

Предлагается ввести концепцию возможностей модели, а не только её имени.

Пример концептуального интерфейса:

```ts
interface ModelCapabilities {
  provider: string;
  model: string;
  local: boolean;

  contextWindow: number;
  maxOutputTokens?: number;

  streaming: boolean;
  toolCalling: boolean;
  parallelToolCalls?: boolean;

  structuredOutput?: boolean;
  jsonMode?: boolean;

  reasoning?: boolean;
  vision?: boolean;
  audioInput?: boolean;
  audioOutput?: boolean;

  embeddings?: boolean;
}
```

Это пример архитектурного контракта, а не финальный API.

Главный смысл: router спрашивает не «какая это модель?», а «какие возможности реально доступны сейчас?».

---

## 5. Иерархия когнитивных уровней

Предлагаемая лестница:

### L0 — deterministic fast path

Regex, словари, finite-state logic, прямые преобразования, системные API.

Подходит для однозначных команд:

```text
mute
pause
stop
open
close
screenshot
system_info
volume
```

### L1 — semantic intent routing

Небольшая embedding-модель и/или лёгкий classifier сводят произвольную формулировку к ограниченному набору intents/capabilities.

Например:

```text
«давай послушаем музыку»
«вруби что-нибудь»
«поставь музыку»
«можешь включить плеер?»

→ PLAY_MEDIA
```

LLM на этом уровне не нужен.

### L2 — contextual resolution

Intent уже известен, но требуется понять параметры и target из состояния системы.

Например:

```text
PLAY_MEDIA
```

дальше Context Resolver проверяет:

- активная media session;
- текущее окно;
- открытая вкладка браузера;
- последний использованный плеер;
- пользовательский preference;
- доступные приложения;
- предыдущая цель текущего диалога.

Пример:

```text
«включи музыку»
      ↓
PLAY_MEDIA
      ↓
active YouTube tab
      ↓
target = YouTube
```

Если target не определён достаточно надёжно, система сначала пытается решить вопрос локальным путём или делает короткое clarification.

### L3 — local LLM cognition

Для сложных языковых задач, планирования и неоднозначных операций, где локальная модель ещё достаточно хороша.

### L4 — powerful model / cloud cognition

Для тяжёлого анализа, сложного planning, больших документов, сложной vision-задачи, сложной tool orchestration и других задач, где экономия ресурсов локальной машины менее важна, чем качество.

---

## 6. Embedding Router: идея пользователя

Предлагается сделать ограниченное пространство semantic intents.

Не «ключевые слова» в буквальном смысле, а **ключевые способности / намерения**, представленные нормализованными идентификаторами.

Пример:

```text
PLAY_MEDIA
PAUSE_MEDIA
STOP_MEDIA
OPEN_APP
SEARCH_WEB
OPEN_FILE
READ_FILE
WRITE_FILE
CREATE_REMINDER
TAKE_SCREENSHOT
SYSTEM_INFO
SET_VOLUME
MUTE_AUDIO
...
```

Для каждого intent хранятся несколько эталонных фраз/семантических представлений.

Пример:

```text
PLAY_MEDIA
- включи музыку
- вруби музыку
- поставь что-нибудь послушать
- давай музыку
- включи мой плеер
```

Вход пользователя преобразуется embedding-моделью в вектор и сравнивается с ограниченным пространством intents.

Условная схема:

```text
user text
   ↓
embedding
   ↓
nearest intent
   ↓
similarity score
   ↓
threshold / reject
   ↓
PLAY_MEDIA
```

Ключевой принцип:

> Если уверенности недостаточно, система не должна насильно выбирать ближайший intent.

То есть:

```text
nearest = PLAY_MEDIA
score = 0.41
threshold = 0.78

→ UNKNOWN / CLARIFY
```

Принцип:

**No route is better than a wrong route.**

---

## 7. Embedding не заменяет LLM

Embedding Router решает другую задачу.

Он не должен пытаться «понять всё». Он должен очень быстро определить, попадает ли запрос в известное пространство возможностей.

Это делает его полезным для первого слоя маршрутизации:

```text
«поставь музыку»
→ PLAY_MEDIA
```

Но сложный запрос:

```text
«включи то, что я слушал вчера вечером, но что-нибудь похожее,
только не слишком спокойное, потому что я сейчас работаю»
```

уже требует:

- memory retrieval;
- temporal context;
- user preference;
- current activity;
- возможно ranking;
- возможно LLM reasoning.

Таким образом semantic routing не уничтожает LLM, а **не позволяет LLM заниматься тем, что можно решить дешевле**.

---

## 8. Context Resolver: контекст как часть команды

Запрос может быть неполным без состояния среды.

Пример:

```text
«включи музыку»
```

Нельзя заранее записать:

```text
PLAY_MEDIA → YouTube
```

Правильная модель:

```text
intent = PLAY_MEDIA
        ↓
resolve target from context
        ↓
current media app?
active browser media?
last player?
user preference?
available players?
        ↓
target
```

То есть context должен участвовать в маршрутизации ещё до вызова тяжёлой модели.

Это одновременно соединяет новую архитектуру с уже существующими WorldState, Memory, Attention и user preferences.

---

## 9. Автоматизация маршрута выполнения задачи

Цель не в том, чтобы каждый раз спрашивать пользователя, куда именно отправить команду.

Нужно строить маршрут автоматически.

Пример:

```text
USER
«включи музыку»

→ perception
→ intent = PLAY_MEDIA
→ context resolver
→ target = current media player
→ policy check
→ execute
→ verify
→ record
```

При неоднозначности:

```text
intent = PLAY_MEDIA
context = несколько равных targets
confidence = insufficient

→ ask_clarification
```

После повторяющихся паттернов система может использовать history/preferences:

```text
user repeatedly chooses local player

→ preferred target confidence increases
```

При этом автоматизация не должна превращаться в неконтролируемую автономность. Policy Engine остаётся перед исполнением действия.

---

## 10. Attention без LLM

Да. Attention U.N.A. может быть в первую очередь системным механизмом управления вычислительным вниманием.

Важно различать:

1. neural attention внутри transformer;
2. runtime attention U.N.A. — решение, какое событие заслуживает ресурсов системы.

Нам нужен второй вариант.

Каждое событие может получить deterministic salience score:

```text
salience =
    importance
  + urgency
  + user_relevance
  + novelty
  + persistence
  + explicit_request
  - repetition
  - ignored_count
  - noise
```

Это концептуальная формула. В production она должна быть нормализована и проверена тестами.

Примеры:

```text
CPU 34%
→ low salience

новое сообщение в Telegram
→ medium

пользователь произнёс wake word
→ very high

опасное действие требует подтверждения
→ very high

открылась новая вкладка
→ low/medium
```

---

## 11. Attention states

Предлагается сохранить и развить уже существующую идею уровней внимания:

```text
ASLEEP
  ↓
PASSIVE_OBSERVATION
  ↓
EVENT_DETECTED
  ↓
ATTENTIVE
  ↓
LOCAL_REACTION
  ↓
SHORT_COGNITION
  ↓
FULL_COGNITION
  ↓
AUTONOMOUS_TASK
```

Большинство времени U.N.A. должно находиться на дешёвых уровнях.

Например:

```text
система работает нормально
→ PASSIVE_OBSERVATION

запущена игра
→ EVENT_DETECTED
→ обновить WorldState

пользователь обратился к U.N.A.
→ ATTENTIVE

«открой браузер»
→ LOCAL_REACTION

«почему проект падает после сборки?»
→ SHORT_COGNITION / LLM

«проанализируй проект, найди причины и внеси исправления»
→ FULL_COGNITION / TASK RUNTIME
```

---

## 12. EventBus не должен автоматически будить LLM

Новое правило:

> Событие не равно cognition trigger.

Системное событие сначала проходит через attention/salience filter.

```text
Event
 ↓
Normalize
 ↓
Salience
 ↓
Should U.N.A. care?
 ├── no → record/update state
 └── yes
       ↓
   determine reaction level
       ├── deterministic
       ├── semantic
       ├── local LLM
       └── powerful model
```

Это предотвращает ситуацию, когда мониторинг экрана, процессов, окон и сети создаёт бесконечный поток дорогих LLM-вызовов.

---

## 13. LLM как специализированный дорогой ресурс

Предлагаемая mental model:

```text
LLM ≠ U.N.A.
LLM = cognition capability
```

U.N.A. владеет:

- memory;
- identity;
- attention;
- world state;
- tools;
- safety;
- policies;
- context composition;
- task state;
- provider routing.

LLM предоставляет:

- language understanding;
- generation;
- reasoning;
- planning;
- extraction;
- complex tool selection.

Таким образом можно заменить:

```text
qwen3:1.7b
→ другая локальная модель
→ более крупная локальная модель
→ cloud model
```

без переписывания U.N.A. core.

---

## 14. Большие модели должны оставаться частью ресурса U.N.A.

Нельзя делать ошибку «мы сейчас ограничены GTX 1650, значит проектируем только под слабые модели».

Нужно наоборот:

**архитектура должна быть пригодна для слабой модели, но capability surface должен включать возможности сильных моделей.**

Например:

```text
Local small model
- basic chat
- simple tool calls
- limited structured output
- limited context

Local larger model
- better planning
- better tool selection
- larger context
- stronger structured output

Cloud model
- advanced reasoning
- long context
- vision
- stronger tool orchestration
- advanced structured output
```

Это не означает, что все возможности должны быть включены на каждой машине.

Это означает, что U.N.A. должна знать, какие возможности доступны и уметь деградировать.

---

## 15. Capability negotiation

Каждый cognition request должен учитывать:

```text
required capabilities
preferred capabilities
available capabilities
fallback capabilities
```

Пример:

```text
Task: memory extraction

preferred:
  structured_output

fallback:
  json_mode

last resort:
  constrained parser / plain text extraction
```

Или:

```text
Task: screen analysis

required:
  vision

preferred:
  local vision

fallback:
  cloud vision

no capability:
  ask user / degrade gracefully
```

Это предотвращает жёсткую привязку функциональности к одному provider.

---

## 16. Отдельные модели для отдельных когнитивных задач

Диалоговая модель не обязана выполнять все функции.

В перспективной архитектуре допускается:

```text
conversation model
memory extraction model
embedding model
vision model
ASR model
TTS model
planning model
```

Например:

```text
Диалог:
qwen3:1.7b

Embeddings:
nomic-embed-text

Memory extraction:
отдельный provider с лучшим structured output

Vision:
специализированный VLM

ASR:
whisper

TTS:
Piper
```

Это особенно важно для Graphiti.

Текущий Graphiti E2E не проходит при `qwen3:1.7b`, потому что memory extraction падает на structured-output контракте (`ExtractedEdges: edges Field required`). Поэтому нельзя делать вывод «Graphiti плохой» только из этого эксперимента.

Нужно разделить:

```text
backend compatibility
LLM extraction compatibility
retrieval compatibility
```

---

## 17. Graphiti decision boundary

На текущем шаге не следует автоматически:

- выбрасывать Graphiti;
- объявлять Graphiti обязательной частью системы;
- менять production backend только ради исследования.

Рациональный порядок:

```text
Kuzu
→ текущий E2E failure

FalkorDB spike
→ проверить backend

qwen3:1.7b structured output
→ проверить extraction

json_object / другой extraction mode
→ проверить fallback

memory_add
→ memory_search
→ end-to-end recall
```

Если Graphiti в одном сочетании не работает, это не должно разрушать локальный L1 memory.

Graphiti остаётся optional L2 capability, пока его E2E пригодность не доказана.

---

## 18. Context Composer и routing должны быть связаны

Context restoration, исследованный на Step 1, и Cognitive Routing нельзя проектировать независимо.

Роутер должен передавать composer структурированный запрос, а composer должен собирать контекст согласно policy.

Например:

```text
intent
current user message
attention state
relevant memory
world state
active task
model capabilities
```

→ Context Composer

→ cognition provider

При этом composer должен оставаться deterministic настолько, насколько это возможно.

Предлагаемая структура:

```text
STATIC PREFIX
  identity
  mode
  stable instructions

CACHEABLE REGION
  stable memory blocks
  stable work context

VOLATILE SUFFIX
  current user message
  surfaced memory
  current state
  time/emotion/etc.
```

Это продолжает выводы Step 1: episodic retrieval не должен случайно менять стабильный prefix на каждом ходе.

---

## 19. Главная схема U.N.A.

```text
                         ┌──────────────────────┐
                         │        INPUTS        │
                         │ text / voice / UI    │
                         │ gesture / events     │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ SIGNAL NORMALIZER    │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ PERCEPTION / INTENT  │
                         │ deterministic +      │
                         │ embedding classifier │
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
                  ▼                                   ▼
        ┌───────────────────┐               ┌──────────────────┐
        │ ATTENTION ENGINE  │               │ CONTEXT RESOLVER │
        │ no LLM required   │               │ world/memory/etc │
        └─────────┬─────────┘               └────────┬─────────┘
                  │                                  │
                  └────────────────┬─────────────────┘
                                   ▼
                         ┌──────────────────────┐
                         │   CAPABILITY ROUTER  │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┼───────────────────┐
                 │                  │                   │
                 ▼                  ▼                   ▼
             L0/L1/L2          LOCAL LLM          POWERFUL LLM
             fast path          cognition           cognition
                 │                  │                   │
                 └──────────────────┼───────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │    POLICY ENGINE     │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │       EXECUTOR       │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │ VERIFY + RECORD      │
                         └──────────────────────┘
```

---

## 20. Принцип маршрутизации

Кандидат на архитектурное правило:

> **Route to the cheapest mechanism capable of solving the request correctly.**

Под «cheapest» имеется в виду не только деньги.

Нужно учитывать:

- latency;
- CPU;
- RAM;
- VRAM;
- network;
- privacy;
- model availability;
- capability support;
- confidence;
- task complexity.

Поэтому маршрутизация должна быть capability-aware и resource-aware.

---

## 21. Degradation model

Каждая capability должна иметь fallback.

Например:

```text
structured output
   ↓
json mode
   ↓
constrained parser
   ↓
ask clarification / defer
```

или:

```text
local cognition
   ↓
stronger local model
   ↓
cloud cognition
   ↓
graceful failure
```

Важно: fallback не должен автоматически означать передачу приватных данных наружу. Privacy policy должна быть независимым gate.

---

## 22. Что не надо делать

На этом этапе не следует:

- сразу переписывать весь `main.ts`;
- создавать новую memory subsystem;
- заставлять LLM заниматься intent classification для каждой команды;
- удалять текущий L0/L1/L2 router без доказательства необходимости;
- жёстко привязывать U.N.A. к Graphiti;
- считать embedding similarity достаточной для всех задач;
- превращать attention manager в ещё один LLM loop;
- подключать автономный loop только потому, что он уже написан;
- считать наличие capability равным её E2E-проверке.

Сначала design → DEC → tests → implementation.

---

## 23. Предлагаемые сущности для дальнейшего дизайна

Названия предварительные.

```text
SignalNormalizer
IntentRouter
EmbeddingIntentIndex
CapabilityRegistry
CapabilityPolicy
ContextResolver
AttentionEngine
CognitionRouter
ProviderRouter
ContextComposer
ActionPlanner
ActionRoute
```

Главное — не создать десять классов ради десяти классов. Если несколько функций естественно принадлежат одной подсистеме, их можно объединять.

---

## 24. Предлагаемый минимальный data contract

```ts
interface IntentDecision {
  intent: string;
  confidence: number;
  source: 'deterministic' | 'embedding' | 'classifier' | 'llm';
}

interface AttentionDecision {
  level: 'ignore' | 'observe' | 'react' | 'cognize' | 'interrupt';
  salience: number;
  reason: string[];
}

interface CognitionRequest {
  intent?: IntentDecision;
  attention?: AttentionDecision;
  requiredCapabilities: string[];
  preferredCapabilities?: string[];
  contextBudget?: number;
  privacyClass?: 'local-only' | 'private' | 'normal';
}
```

Это концептуальный контракт для proposal, не обязательный финальный TypeScript.

---

## 25. Сценарии, которые должны быть продуманы в proposal

### Сценарий A: простая команда

```text
«открой браузер»
→ deterministic/semantic
→ OPEN_APP
→ target resolver
→ policy
→ execute
```

### Сценарий B: двусмысленная простая команда

```text
«включи музыку»
→ PLAY_MEDIA
→ context resolver
→ один target
→ execute
```

или:

```text
→ несколько равных targets
→ clarification
```

### Сценарий C: команда с памятью

```text
«включи то, что я слушал вчера»
→ PLAY_MEDIA
→ memory retrieval
→ temporal resolution
→ target
→ возможно LLM
```

### Сценарий D: сложный запрос

```text
«разберись, почему приложение не собирается»
→ low-confidence / high-complexity
→ local LLM
→ tools
→ verify
```

### Сценарий E: тяжёлая задача

```text
«проанализируй проект, документацию и логи и составь план исправлений»
→ task classification
→ powerful cognition provider
```

### Сценарий F: event-driven attention

```text
game launched
→ event
→ salience
→ attention
→ update resource mode
→ no LLM
```

### Сценарий G: Graphiti

```text
memory event
→ extraction capability check
→ suitable provider
→ graph write
→ retrieval
→ verify
```

---

## 26. Необходимые решения Step 2 / DEC

Proposal должен дать аргументированное решение по следующим вопросам:

1. Нужен ли отдельный `CapabilityRegistry` или capability model можно встроить в существующий LLM config/provider layer?
2. Где должен жить Embedding Intent Index?
3. Какой минимальный набор intents/capabilities входит в первый production slice?
4. Как выбрать similarity threshold и reject behavior?
5. Когда deterministic parser побеждает embedding?
6. Как сочетать intent routing с существующим `intent.ts`?
7. Должен ли attention route event непосредственно в cognition или только повышать attention state?
8. Как избежать duplicate routing между fast-path, semantic-router и будущим embedding router?
9. Как считать capability + resource + privacy в ProviderRouter?
10. Какой fallback допустим при отсутствии structured output?
11. Должен ли Graphiti memory extraction иметь отдельный provider?
12. Как ограничить LLM usage так, чтобы архитектура была usable на слабом локальном железе, но не ограничивала cloud/large-model режим?

---

## 27. Главный вывод

U.N.A. должна двигаться от модели:

```text
assistant = LLM + tools
```

к модели:

```text
assistant = runtime + perception + attention + context + routing + tools + memory + cognition providers
```

LLM становится одной из наиболее дорогих, но не единственной когнитивной capability.

Embedding Router даёт дешёвую семантическую маршрутизацию по ограниченному пространству возможностей.

Deterministic Attention позволяет системе решать, заслуживает ли событие вычислительного внимания, ещё до вызова LLM.

Context Resolver позволяет отвечать на неполные команды через WorldState, Memory и preferences.

Capability Registry и Provider Router делают архитектуру независимой от конкретной модели.

Таким образом слабая локальная модель не становится слабым фундаментом системы: она становится одним из доступных cognition providers.

Большие модели остаются частью архитектурного ресурса U.N.A., но используются тогда, когда их дополнительные capability действительно нужны.

Именно это должно позволить U.N.A. расходовать вычисления не по принципу «всё через самый умный доступный механизм», а по принципу:

> **минимально достаточное вычисление для данного уровня задачи, с возможностью подняться на следующий уровень без архитектурной перестройки.**

---

## 28. Статус после Step 2 proposal

Пока не принято:

- production implementation;
- новый intent index;
- новый attention engine;
- новый provider router;
- новый Graphiti backend;
- новый API contract.

Следующий технический шаг после этого документа:

```text
review proposal
→ DEC
→ implementation map update
→ tests/design fixtures
→ production implementation
→ verification
```
