# Промт для ведущего программиста U.N.A. — Phase 2 / Step 2

Ты ведущий программист U.N.A. Desktop v40.

Контекст:
- GitHub repo: MaxSC2/una-desktop
- Phase 2 = Memory & Continuity
- Phase 2 / Step 1 уже завершён коммитом `6ef17cb`
- `docs/research/phase-2-memory-research.md` содержит исследование SURFACE gate, token budget, forget/retention, Context Composer и Graphiti E2E gap #3.
- Production tree на Step 1 не менялся.
- Текущий local-first дефолт в коде: `qwen3:1.7b`.
- Graphiti E2E реально проверен и сейчас НЕ доказан: `memory_add` на `qwen3:1.7b` падает с `ExtractedEdges: edges Field required`; также сервер предупреждает, что Kuzu backend deprecated.

ПРОЧИТАЙ ПЕРЕД НАЧАЛОМ:
1. `docs/research/phase-2-memory-research.md`
2. `docs/research/implementation-map.md`
3. `docs/research/decision-log.md`
4. `docs/research/research-backlog.md`
5. `HONEST_STATUS.md`
6. текущие `electron/ai/router.ts`, `electron/ai/intent.ts`, `electron/ai/resource-manager.ts`, `electron/ai/attention-manager.ts`, `electron/ai/world-model.ts`, `electron/ai/tool-loop.ts`, `electron/ai/mcp-adapter.ts`, `electron/memory/rlm.ts`, `electron/ai/dynamic-prompt/index.ts`, `electron/ai/config.ts`.

ЦЕЛЬ STEP 2:
Спроектировать следующий слой U.N.A. так, чтобы система была независима от конкретной LLM, но могла эффективно использовать и маленькие локальные модели, и большие модели/API.

ГЛАВНАЯ ИДЕЯ:
Не делать `input → LLM → tools` универсальным маршрутом.

Новый принцип:
`Route to the cheapest mechanism capable of solving the request correctly.`

Это означает:

L0 = deterministic fast path
L1 = semantic/embedding intent routing
L2 = contextual resolution
L3 = local LLM cognition
L4 = powerful/cloud cognition

При этом LLM остаётся cognition provider, а не самой U.N.A.

ТРЕБОВАНИЕ 1 — MODEL INDEPENDENCE
Спроектируй capability-based architecture.
Не ориентируйся на имя Qwen/Gemma/OpenAI/Gemini как на архитектурный контракт.
Опиши минимум:
- ModelCapabilities
- capability discovery
- required/preferred/fallback capabilities
- context-window awareness
- tool calling
- structured output / JSON mode
- vision / reasoning / streaming
- local/cloud/privacy constraints

ТРЕБОВАНИЕ 2 — EMBEDDING INTENT ROUTER
Проработай идею пользователя:
пользователь может формулировать одну и ту же простую команду десятками способов, а U.N.A. должна сводить её к ограниченному semantic intent/capability.

Пример:
«давай музыку»
«вруби что-нибудь»
«включи музыку»
«поставь плеер»
→ PLAY_MEDIA

Нужны:
- deterministic-first;
- embedding semantic matching;
- ограниченный набор intents;
- confidence/similarity;
- reject threshold;
- UNKNOWN/CLARIFY при низкой уверенности;
- запрет на принудительное сопоставление при слабом score.

ТРЕБОВАНИЕ 3 — CONTEXT RESOLVER
Не считать intent равным полному действию.

Например:
PLAY_MEDIA + context → YouTube / локальный плеер / другой active media target.

Проработай использование:
- WorldState;
- active window/app;
- browser context;
- media session;
- preferences;
- recent history;
- memory;
- текущего диалога.

Нужно автоматическое разрешение target без лишнего вопроса пользователю, но с clarification при реальной неоднозначности.

ТРЕБОВАНИЕ 4 — ATTENTION WITHOUT LLM
Исследуй и спроектируй attention engine, который может работать без генеративного ИИ.

Разделяй:
- transformer/neural attention;
- runtime attention U.N.A. как управление вычислительным вниманием.

Предложи:
- salience score;
- urgency;
- novelty;
- user relevance;
- explicit request;
- ignored_count/repetition/noise;
- levels `ignore / observe / react / cognize / interrupt` или эквивалент.

Главное правило:
EVENT ≠ LLM TRIGGER.
Большинство системных событий не должны будить LLM.

ТРЕБОВАНИЕ 5 — ИЕРАРХИЯ COGNITION
Составь таблицу маршрутов:
- deterministic;
- embedding/classifier;
- contextual;
- local LLM;
- powerful LLM.

Покажи, какие реальные команды идут на каждом уровне.

ТРЕБОВАНИЕ 6 — PROVIDER ROUTER
Спроектируй маршрутизацию не по имени модели, а по capability + resource + privacy + latency.

Нужно уметь:
- выбрать локальную модель;
- подняться на более сильную локальную модель;
- уйти в cloud при допустимой privacy policy;
- gracefully degrade;
- использовать специализированные модели отдельно от диалоговой модели.

ТРЕБОВАНИЕ 7 — СПЕЦИАЛИЗИРОВАННЫЕ МОДЕЛИ
Не предполагай, что одна модель обязана делать всё.
Рассмотри архитектуру:
- conversation model;
- memory extraction model;
- embedding model;
- vision model;
- ASR;
- TTS;
- planner/reasoner.

Это особенно важно для Graphiti, где текущая маленькая модель не проходит structured-output extraction.

ТРЕБОВАНИЕ 8 — CONTEXT COMPOSER
Свяжи результаты Step 1 с новым routing layer.

Сохрани идею:
STATIC PREFIX
→ CACHEABLE REGION
→ VOLATILE SUFFIX

Context Composer должен получать структурированный `CognitionRequest`, а не произвольную строку от разных подсистем.

Учитывай:
- surfaced memory;
- attention state;
- world state;
- current user message;
- current task;
- model capability;
- token budget.

ТРЕБОВАНИЕ 9 — GRAPHITI
Не выбрасывай Graphiti автоматически и не делай его обязательным.

Сделай отдельный compatibility boundary:
A. backend compatibility;
B. LLM extraction compatibility;
C. retrieval compatibility.

Предложи узкий spike для FalkorDB/FalkorDB-compatible backend и отдельно проверь extraction capability.

ОБЯЗАТЕЛЬНО:
Не менять production только ради spike.
Не делать вывод «Graphiti плох» только из падения qwen3:1.7b structured output.

ТРЕБОВАНИЕ 10 — ИНТЕГРАЦИЯ С УЖЕ СУЩЕСТВУЮЩИМ
Не создавать параллельную систему без анализа существующей.

Нужно определить отношения между:
- `fast-path.ts`;
- `router.ts`;
- `intent.ts`;
- `tool-loop.ts`;
- `attention-manager.ts`;
- `resource-manager.ts`;
- `world-model.ts`;
- `dynamic-prompt`;
- `mcp-adapter.ts`.

Особенно проверь, чтобы не получить три разных intent router-а, два fast path-а и четыре места, где принимается решение «звать LLM или нет».

АРТЕФАКТ:
Создай research/design artifact:
`docs/research/phase-2-step-2-cognitive-routing-proposal.md`

СОДЕРЖАНИЕ АРТЕФАКТА:
1. Problem statement
2. Existing U.N.A. mechanisms
3. Model independence
4. Capability model
5. Deterministic + semantic routing
6. Embedding Intent Router
7. Context Resolver
8. Attention without LLM
9. Cognition hierarchy L0-L4
10. Provider Router
11. Specialized models
12. Context Composer integration
13. Graphiti boundary
14. Security/privacy implications
15. Resource implications
16. Candidate interfaces/data contracts
17. Migration plan from current architecture
18. Test strategy
19. Open questions
20. Proposed DEC

ВАЖНО:
Разделяй [V] VERIFIED FACTS из текущего кода и [I] INFERENCE / DESIGN PROPOSAL.
Не выдавай гипотезы за факты.

ЧТО ЗАПРЕЩЕНО НА STEP 2:
- production code changes;
- новая dependency без отдельного решения;
- массовый refactor;
- подключение autonomous loop;
- подключение multi-agent;
- подключение skills;
- полноценная реализация нового embedding router;
- полноценная реализация нового attention engine;
- production migration Graphiti.

ДОПУСТИМО:
- анализ текущего кода;
- маленькие isolated experiments только если они не изменяют production tree и нужны для архитектурного доказательства;
- research fixtures / notes;
- proposal;
- DEC draft.

ОБЯЗАТЕЛЬНАЯ ПРОВЕРКА:
Перед proposal найди все существующие механизмы маршрутизации и укажи, какой будет canonical routing authority.

ОБЯЗАТЕЛЬНАЯ СВЯЗКА С MEMORY:
Новая маршрутизация не должна разрушить решения Step 1:
- SURFACE gate;
- deterministic token budgeting;
- forget/retention;
- static/cacheable/volatile Context Composer.

ФИНАЛЬНЫЙ ВЫВОД ДОЛЖЕН ОТВЕТИТЬ НА 6 ВОПРОСОВ:
1. Как U.N.A. решает, что LLM вообще не нужна?
2. Как U.N.A. решает, что нужен embedding/classifier?
3. Как U.N.A. решает, что нужен local LLM?
4. Как U.N.A. решает, что нужен powerful/cloud model?
5. Как U.N.A. использует WorldState/Memory/Attention до LLM?
6. Как U.N.A. остаётся работоспособной при слабой или недоступной модели?

EXIT CRITERIA:
- production tree unchanged;
- proposal committed separately;
- no unrelated files;
- current routing architecture mapped;
- canonical routing authority proposed;
- capability model proposed;
- attention-without-LLM proposed;
- embedding intent layer proposed;
- provider fallback proposed;
- Graphiti backend/extraction/retrieval boundaries separated;
- Step 1 memory decisions preserved;
- DEC draft prepared for review before implementation.

Не «улучшай заодно» существующую архитектуру. Сначала докажи дизайн, затем жди DEC.
