# U.N.A. Research — Architecture Synthesis: Cognitive Runtime

**Дата:** 2026-09-17
**Статус:** architecture synthesis (запрошено lead'ом вместо немедленного «Step 2 proposal»); production не меняет
**Метод:** не «придумать ещё подсистемы», а классифицировать накопленные идеи по отношению к существующему коду и свести 4 исследовательских потока в одну систему
**Входные потоки:** (1) Cognitive Routing (Step 2 + Step 2-A + Step 1.5 brief), (2) System-One / Decision Models, (3) Task Context Isolation / Cognitive Sessions, (4) brainstorm «потоки деятельности» (настоящий документ — синтез)

> Правило ведущего принципиального уровня:
> **не добавлять подсистемы — добавить несколько фундаментальных принципов, которые
> заставят уже существующие подсистемы работать как единый cognitive runtime.**

---

## 1. Главный вывод

> **U.N.A. не должна быть одной большой AI-моделью. Она должна быть системой
> управления несколькими уровнями cognition, где большая модель — усилитель,
> а не фундамент.**

* deterministic механизмы работают постоянно;
* embeddings дёшево классифицируют и ищут;
* decision models выдают типизированные суждения;
* context resolver связывает намерение с миром;
* scheduler решает, кому дать ресурсы;
* LLM — только там, где остальные не справились.

Текущий код уже содержит зачатки почти всех будущих слоёв. Задача синтеза —
не строить этажи, а назвать принципы, которые заставят существующее работать
как одно целое.

---

## 2. Классификация идей мозгового штурма (18 + Memory Scopes)

Легенда: **EXISTS** — уже в коде; **RENAME/MERGE** — переименование/уточнение
уже зафиксированного концепта; **NEW** — действительно новое, требует места в
документах; **RESEARCH** — research-only до DEC; **LATER** — зона Phase 3+.

| # | Идея | Вердикт | Куда ложится |
|---|---|---|---|
| 1 | Потоки деятельности: Task Contexts, состояние во времени (waiting/paused сохраняются) | MERGE | `task-context-isolation.md` (§2–3). Код: `executive.ts` — Goal с `status: active\|interrupted\|completed\|cancelled` + `context_snapshot`, `interruptGoal`/`resumeGoal` (SQLite). Зачаток «существования во времени» уже написан |
| 2 | Context Packet / Cognitive Event | MERGE (термин) | = Structured Findings в `task-context-isolation.md` §5. Единый термин: **Context Packet**. Обмен результатами, не контекстами |
| 3 | Context Locality (OWN/SHARED + privacy boundary) | NEW (refinement) | Дополнение к task-context-isolation: locality — не только performance/correctness, но и **privacy boundary** (task DOWNLOAD_FILE не видит CODE_PROJECT_PRIVATE_KEYS) |
| 4 | Internal action language (`PLAY_MEDIA(target)`…) | MERGE | Step 1.5 §3 (Intent ≠ Capability ≠ Action ≠ Tool). Текущий `Intent` (weather/gui/…) — верхний semantic layer, не выбрасывается |
| 5 | Abstention: confidence + margin + ambiguity | NEW (refinement) | Усиление semantic-router hardening (Step 1.5 calibration): margin top1−top2; PLAY_MEDIA 0.91 vs OPEN_APP 0.89 → AMBIGUOUS, а не forced route. Прямое развитие «No route is better than a wrong route» |
| 6 | Batched decision pass (один вызов — пачка judgments) | MERGE | Pass 6 (`system-one-decision-models.md` §4): несколько typed judgments из одного state за один pass — вместо 4 последовательных вызовов |
| 7 | Attention как CPU-level scheduler (AttentionTicket) | EVOLUTION | `attention-manager.ts` не заменяется, а развивается в scheduler policy: salience → AttentionTicket → {ignore, observe, update world, react, invoke cognition, interrupt}. Продолжение Step 1.5 §4 (проекция, не новая state machine) |
| 8 | CognitionBudget | NEW | `maxLatency / maxLLMCalls / maxTokens / maxVRAM / maxInterruptions / allowedProviders` на задачу; задача сама сообщает «сколько мне можно стоить». Стыкуется с resource-manager; поле `cognitionPolicy` уже эскизено в TaskContext |
| 9 | Мультиплексирование inference | EXISTING (документ) | Уже зафиксировано: `task-context-isolation.md` §3 (последовательный scheduler при параллельных контекстах; GTX 1650 закрыла бы приложение при «4 моделях») |
| 10 | CognitionPool (пул моделей по capability) | MERGE | Ядро Step 2-A Дельта 1 (`capabilities.ts`) + DecisionProvider (Pass 6): «capability важнее имени модели»; одна модель может временно совмещать роли (dialogue=yes/decision=maybe/planner=no) |
| 11 | Skill Compiler | NEW (research) | LLM однажды строит Recipe (`OPEN_APP(Code) → OPEN_APP(Terminal) → CHECK_GIT()`), после проверки — детерминированный Skill без LLM. Родня незадействованному `electron/ai/skills.ts` (HONEST_STATUS: не подключён). Фаза 3+, research-only до DEC |
| 12 | Shadow Cognition | NEW (research) | Фоновая (idle-only) проверка «маршрут был правильный?» сильной моделью для калибровки threshold/anchors и сбора false-positives. Паттерн idle-only уже проверен в M4 (`shouldMaintainMemory`) |
| 13 | Replay Engine | NEW (инженерный приоритет) | EVENT → STATE → DECISION → ACTION → RESULT в логах; реплей без пользователя: regression, routing/attention benchmarks, provider-routing тесты. **Прямо кормит baseline-методику Step 1.5** (flight recorder U.N.A.) |
| 14 | World State с происхождением знания (Observed / Inferred / Remembered / Expected) | NEW (refinement) | Расширение `world-model.ts`: статус знания обязателен, иначе «предполагаю» за 10 минут становится «знаю». Критично для Context Resolver (Step 2) |
| 15 | Refractory period для событий | NEW (малый) | event family + last handled + cooldown/suppression window: один реальный event → одна реакция, а не двадцать воплей от одного пикселя. Часть event-salience расширения attention-manager |
| 16 | Attention Intent для UI (observe/react/speak/notify/animate/idle/interrupt) | NEW (мост) | Превращает design-ветку (`docs/design/*`) в renderer состояния: UI получает Attention Intent, а не сырые события. Связывает presence-design и cognitive runtime |
| 17 | Task inheritance (parent/child) | EXTEND | Продолжение task-context-isolation: A порождает A1/A2/A3 с inherited constraints и shared artifacts, но не всем контекстом родителя. Естественная дорога к autonomous loop (Phase 3) без его преждевременного включения |
| 18 | Cognitive Lease | EXTEND | Временные права на ресурсы (GPU/network/tool/attention/LLM lease) с checkpoint/resume. Эволюция `resource-manager.canRunTask` в lease-модель. Phase 3 |
| + | Memory Scopes | MERGE/RENAME | **≈ Memory Pods уже реализованы** (profile/project/preference/emotion/work/general, `recallFacts` уже принимает podId). «Не создавать»: Scope = формализация pods + task-level scoping; см. анти-дублирование Step 1.5 |

---

## 3. Фундаментальные принципы (вместо новых подсистем)

1. **Потоки, а не запросы.** Система живёт во времени: `event → task context → state transition → action`. Задача не забывается из-за того, что пользователь попросил музыку.
2. **Обмен результатами, а не контекстами** (Context Packet). Контексты не смешиваются никогда.
3. **Context Locality** — OWN по умолчанию, SHARED только по ссылкам. Это performance + correctness + **privacy boundary** (одна и та же изоляция работает на все три).
4. **Капабилити важнее имени модели.** CognitionPool: ConversationModel / DecisionModel / EmbeddingModel / ExtractionModel / VisionModel / ASR / TTS; одна модель может совмещать роли.
5. **Abstention везде.** Не «насколько уверен», а «насколько следующий вариант хуже» (confidence + margin + ambiguity). Reject лучше wrong route — на всех уровнях.
6. **Бюджет до действия.** Задача сообщает, «сколько ей разрешено быть» (CognitionBudget), scheduler/leases учитывают это до вызова cognition.
7. **Мультиплексирование вместо параллелизма** на локальном железе.
8. **Каждое решение — событие с происхождением.** Знание имеет статус (Observed/Inferred/Remembered/Expected); решения реплеятся; интеллект компилируется в процедуры (Skill Compiler), а LLM — усилитель, не фундамент.

## 4. Что уже существует — НЕ создавать (проверено по коду)

| Идея из штурма | Уже в коде |
|---|---|
| Attention scheduler | `attention-manager.ts` (focus/urgency/score) — эволюция в policy, не новый движок |
| Task с прерыванием | `executive.ts`: Goal (active/interrupted/completed/cancelled) + context_snapshot + resumeGoal |
| Цикл деятельности | `life-loop.ts`: observe → reflect → update → plan → wait (тик 30 c) |
| Memory Scopes | `memory_pods` + `recallFacts(podId)` — scopes это формализация подов, не новая память |
| Context budget | `attention-manager.getContextBudget` + `resource-manager.getOptimalContextTokens` |
| CognitionPool по capability | ядро уже спроектировано в Step 2-A Дельта 1 (`capabilities.ts`) |

**Найден ещё один дубль (сверх находки Step 1.5):** `executive.ts` (Goal с
interrupted/resume, таблица `goals`) и `goal-tracker.ts` (свой Goal/Subtask, своя
`initGoalTracker`) — **два параллельных менеджера целей** с разными контрактами.
Добавить в scope аудита Step 1.5: определить, кто канонический, второй — кандидат
на объединение или deprecation.

## 5. Единая карта (цель)

```text
U.N.A. CORE
   ├── Identity        (одна личность)
   ├── Memory Scopes   (pods + core/domain/task/ephemeral, retrieval по scope)
   └── World State     (Observed/Inferred/Remembered/Expected)
        ↓
   Attention Scheduler  (salience → AttentionTicket → refractory period)
        ↓
   Task Manager         (TaskContext, наследование, lease, состояния)
        ↓
   Context Isolation    (Context Locality: OWN/SHARED; Context Packet обмен)
        ↓
   Semantic Routing     (router.ts — canonical authority; + margin/ambiguity)
        ↓
   Decision Layer       (DecisionProvider: батч typed judgments; Pass 6)
        ↓
   Resource Scheduler   (multiplexing, CognitionBudget, leases)
        ↓
   Cognition Pool       (fast path / embeddings / decision / local LLM / cloud)
        ↓
   Replay Engine        (flight recorder: EVENT/STATE/DECISION/ACTION/RESULT)
```

## 6. Распределение по этапам

| Этап | Что попадает |
|---|---|
| **Step 1.5** (бриф готов, промт в `UNA_Phase2_Step1.5_...Brief.md`) | routing reconciliation + пункты этого синтеза: (а) `filterToolsByIntent` dead code; (б) `executive.ts` vs `goal-tracker.ts` — какой менеджер целей канонический; (в) Memory Scopes = формализация pods, не новая память; (г) **Replay Engine v0** = RouteDecision-логирование + corpus для baseline (та же инструментация, не две) |
| **Step 2 update (после Step 1.5 + DEC)** | action language (Capability/Action слой), abstention (margin/ambiguity) в контракты, CognitionBudget в CognitionRequest, provenance в World State, AttentionTicket как развитие attention-manager |
| **Phase 3 (Task Runtime)** | TaskContext + task inheritance + Cognitive Lease + Skill Compiler (вместе с оживлением `skills.ts`) |
| **Research-only до Phase 3** | Shadow Cognition, Skill Compiler, Cognitive Lease, Attention Intent → UI (согласовать с design-треком), task inheritance |

## 7. Что остаётся research-only (никакой реализации сейчас)

- Skill Compiler — до появления Skills Runtime (Phase 3) и DEC
- Shadow Cognition — только как паттерн; вход в бюджет idle-работы (M4-паттерн)
- Cognitive Lease / task inheritance — дизайн-заготовки Phase 3
- Attention Intent для UI — передать в design-трек (presence design) как контракт
  «UI = renderer состояния», не требовать реализации от cognitive-ветки

## 8. Порядок работ (итог синтеза)

```text
1. ШАГ СЕЙЧАС: Step 1.5 Routing Reconciliation (бриф готов, промт готов)
   + расширенные пункты: executive.ts vs goal-tracker.ts; pods vs scopes
   + Replay Engine v0 как instrument baseline (RouteDecision → лог → корпус)

2. Synthesis → обновление Step 2 proposal
   (объединение 4 потоков: routing, decision models, task isolation, capability pool)

3. DEC по Step 2 (capability contract, privacy-фильтр, extraction provider,
   decision provider опционально)

4. Только потом — Phase 3: task runtime, leases, skills, autonomous loop
```

Никакого кода до DEC. Синтез — документ-зонтик: task isolation, decision models,
model-independent cognition и routing map — **одна система**, а не четыре проекта.

## 9. Статус

- Документ: **PENDING APPROVAL** (lead утверждает disposition'ы таблицы §2).
- После утверждения: вынести «пункты (а)–(в)» в бриф Step 1.5 (однострочные
  дополнения), решение о goal-tracker/executive — в аудит Step 1.5.
- Приоритет инженерных новинок: **Replay Engine** (кормит baseline Step 1.5) >
  margin/ambiguity (калибровка semantic-router) > остальные — после DEC.

