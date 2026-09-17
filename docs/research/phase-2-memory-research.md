# Phase 2 / Step 1 — Lightweight Pass 2 Research: Memory & Continuity

Дата: 2026-09-16
Статус: RESEARCH COMPLETE (production tree не изменён)
Скоуп: только 4 design questions + Graphiti E2E gap #3.

## 0. Метод и правила

- Достоверность: **[V]** verified (первоисточник / наш код / реальный прогон), **[I]** inference.
- Источники — первичные: официальные docs проектов + фактический код U.N.A. + живой E2E-прогон (лог сохранён).
- Marketing claims (бенчмарки LoCoMo и т.п.) фиксируются как claims, не как факты.

## 1. SURFACE GATE — когда memory candidate становится surfaced memory

### Факты из кода U.N.A. [V]
- `electron/memory/manager.ts`: вход через `scoreCandidate()` (база 0.3; +0.2 длина ≥ `minFactLength`=8; +0.1 >200 симв; +0.15 за цифры/капитализацию/тех-паттерны; −0.5 при негативных паттернах; clamp 0..1) → гейт `score < 0.25` ⇒ candidate уходит в таблицу `candidates` (reason `low_score`), НЕ в L1.
- Дедуп: скан последних 50 фактов (`dedupeScanLimit`); дубликат ⇒ candidate архивируется (reason `duplicate`), существующий факт reinforced.
- Восстановление из архива: `elevateCandidate(candidateId)` (manager.ts:458, origin `elevated`).
- `store.ts`: у фактов есть `pinned` (0/1) и `importance`.
- RLM (`rlm.ts`): `hotFactsMax: 3` — максимум 3 факта + до 3 related попадает в HOT-контекст; `maxRecentFacts: 20` — счётчик для L2-флуша.
- `enableMemoryTokens: true` — модель может сама тянуть память через [MEM] recall.
- **Гэп**: гейт стоит на входе (при записи), но НЕ на выходе: нет per-query relevance при surfacing; нет лимита «не более N surfaced за ход»; score факта заморожен с момента записи.

### Подходы в отрасли [V]
- **Letta** (docs.letta.com/agent-sdk/memory/index.md): класс памяти определяет, когда она входит в контекст: `system/`-файлы MemFS — в system prompt каждый ход; всё остальное — вне контекста (агент видит только дерево файлов и читает по необходимости). У классической модели Letta: core blocks (в контексте, с лимитами) vs archival/recall (search-only).
- **Mem0** (github.com/mem0ai/mem0 README): retrieval candidate ≠ surfaced memory в прямом виде: `search(query, filters, top_k=3)` возвращает ранжированный список; решение о вставке в промпт — за вызывающим кодом; score при записи отсутствует — фильтрация при извлечении.
- **Graphiti** (help.getzep.com/graphiti/working-with-data/searching): `graphiti.search()` hybrid (semantic + BM25, RRF-rerank), `search(query, focal_node_uuid)` — node-distance reranking; 15 предустановленных recipes (`EDGE_HYBRID_SEARCH_RRF`, `EDGE_HYBRID_SEARCH_NODE_DISTANCE`, ...); edge содержит `fact`, `valid_at/invalid_at/expired_at` — темпоральная валидность как критерий surface.
- **LangMem** (langchain-ai.github.io/langmem): hot-path (агент ищет сам в ходе диалога) vs background (memory manager в фоне); official guidance — «include memories without the agent having to explicitly search».

### Вывод [I]
В U.N.A. гейт есть на входе, но отсутствует на выходе. Отраслевой паттерн — гейт на выходе, управляемый запросом: relevance(query) × recency × importance, с pinned-boost. Минимальное правило для U.N.A.: surfaced = top-K по релевантности к текущему сообщению (семантический score от nomic-embed уже доступен), K=3 (совпадает с существующим `hotFactsMax`), принцип «no memory is better than wrong memory»: пустой результат не подменяется натянутыми совпадениями (порог отсечки).

## 2. TOKEN BUDGET

### Факты из кода U.N.A. [V]
- `getOptimalContextTokens()` (resource-manager.ts:238): адаптивный от состояния машины (cloud ⇒ большой; local — от свободной VRAM). Детерминирован, но в `DEFAULT_RLM_CONFIG.maxHotTokens` **фиксируется на момент старта сессии**.
- `DEFAULT_RLM_CONFIG` (rlm.ts): `hotSystemPromptMaxTokens: 2000`, `messageBudget = floor(maxHotTokens * 0.5)` (rlm.ts:199), `hotFactsMax: 3`.
- `estimateTokens` — эвристика chars/3.5, не реальный токенайзер.
- `num_ctx` для Ollama-вызовов берётся из того же `getOptimalContextTokens` ⇒ расчётный бюджет и окно модели из одного источника. НО: `qwen3:1.7b` физически имеет окно 4096 (проверено `GET /api/ps`, 2026-09-16) — бюджет может его превышать: рассинхрон «расчётный бюджет vs реальное окно модели».
- Переполнение: `selectMessages` усекает историю с начала списка; явной лестницы приоритетов system > facts > history нет.
- Под surfaced memory нет зарезервированной доли бюджета — факты вставляются «по остатку».

### Отраслевые подходы [V]
- **Anthropic prompt caching** (docs.anthropic.com/docs/build-with-claude/prompt-caching): мин. 1024/2048 токенов для cache-eligibility; кэшируется длиннейший общий префикс; TTL 5 мин.
- **OpenAI prompt caching** (platform.openai.com/docs/guides/prompt-caching): автоматически при >1024 токенах; LRU; скидка 50% на cached input.
- **Letta / Context Constitution** (github.com/letta-ai/context-constitution): что входит в контекст, в каком порядке и с какой детализацией — архитектурный принцип (explicit constitution), а не рантайм-хак.

### Вывод [I]
Deterministic budgeting для U.N.A. **нужен**:
1. Пересчёт бюджета per-request, а не на старте сессии.
2. Бюджет обязан не превышать реальное окно активной модели (сейчас может — см. рассинхрон 4096).
3. Явная лестница приоритетов при переполнении: system identity (не урезается) → surfaced memory (K фактов, урезается последним) → history (урезается первой, из середины, сохраняя начало и последнее сообщение).
4. Под surfaced memory — фиксированная зарезервированная доля (~15-20% бюджета), не «остаток».
5. Оценка токенов: реальный токенайзер GGUF из TS недоступен ⇒ chars/3.5 остаётся, но мультипликатор per-model как конфиг (ru ~3.2, en ~3.5).

## 3. FORGET / RETENTION

### Факты из кода U.N.A. [V]
- Жизненный цикл сейчас: candidate (score<0.25 / duplicate / low_score) → таблица `candidates`; вставка → факт L1; `elevateCandidate` — восстановление; `pinned` + `importance` — ручные ручки.
- **Отсутствует**: consolidation (объединение по смыслу), decay (нет `last_accessed`; доступы не отмечаются), политика archive→delete, **explicit user correction** (нет пути «пользователь: это неверно» → пометка/замена; только ручные pinned/importance).
- `graph_synced_at` — отметка синка с Graphiti, не access-time.

### Отраслевые подходы [V]
- **Mem0** (docs.mem0.ai/core-concepts/memory-operations): CRUD с LLM-модерацией: на каждом `add()` решение ADD/UPDATE/DELETE/NONE; history DB логирует операции; `expiration_date` скрывает память из search/get_all (не удаляет); `delete()`/`delete_all()` явные. [I] LLM-модерация на каждый add тяжела для local-first U.N.A.; но история операций и явное мягкое удаление — кандидаты на adoption.
- **Letta Dreaming** (docs.letta.com/agent-sdk/memory/index.md): фоновые subagents консолидируют память по триггеру (N шагов / compaction event) — аналог нашего maintenance-тика, но с консолидацией по смыслу.
- **LangMem**: semantic/episodic/procedural классы; консолидация = background refinement.

### Вывод [I]
Минимальный forget-механизм для U.N.A.:
1. `last_accessed` на факте + decay в существующем maintenance-тике ⇒ лестница temporary/useful/core: temporary (не surfaced по умолчанию) → useful (surfaced по релевантности) → core (surfaced всегда, ограничен K_core; ~аналог pinned).
2. Explicit correction: «пользователь: это неверно» ⇒ `invalidated` (мягкое забывание; запись сохраняется; surfaced-гейт никогда не поднимает invalidated). Distinction: забывание ≠ удаление из storage — физическое удаление только из archive-таблицы по возрасту/размеру; L1 не удаляется молча.
3. Консолидация по смыслу — Phase 3+ (требует LLM-проход), в минимальный скоуп не входит.

## 4. CONTEXT COMPOSER

### Факты из кода U.N.A. [V]
- Фактический композер = `buildDynamicPrompt` (electron/ai/dynamic-prompt/index.ts:252): одна строка `prompt += ...` собирается последовательно: identity+COMMON_INSTRUCTIONS → mode instructions → адаптации (emotion/time/workMode/preferences) → episodic → proactivity → work context → memory pods → goals → self review → world model → meta learning. Формально — single string, никаких регионов.
- RLM даёт второй канал: `buildHotContext()` (rlm.ts) возвращает systemPrompt (усечён до `hotSystemPromptMaxTokens`), facts (≤3), related (≤3), selectedMessages (≤50% бюджета). Как эти части склеиваются с dynamic-prompt — решает вызывающий код (tool-loop), единой схемы нет.
- tool-loop (tool-loop.ts:151): `messages = [system, ...context, user]` — префикс (system+context) строится на КАЖДЫЙ ход заново и зависит от эмоции/времени/episodic-поиска ⇒ нестабилен между ходами.
- Физического отделения transcript/history от surfaced memory нет: всё — текстовые вставки.

### Отраслевые подходы [V]
- **Anthropic prompt caching**: стабильный статичный префикс первым, затем cacheable region (min 1024/2048 токенов), volatile — в конец. Инструменты объявляются ДО system ⇒ изменения в начале ломают кэш.
- **OpenAI prompt caching**: кэшируется длиннейший префикс (≥1024) автоматически; изменение байта в начале инвалидирует всё.
- **Letta MemFS**: `system/` — стабилен; остальное читается по требованию; dreaming меняет память ФОНОМ, не в горячем ходе.

### Вывод [I]
Архитектурное правило композера для U.N.A.:
1. Три региона: static prefix (identity, mode, COMMON — меняется только с версией) → cacheable region (memory blocks, work context — меняется медленно, через maintenance) → volatile suffix (surfaced memory этого хода, эмоция/время, история, текущее сообщение).
2. Episodic-поиск (сейчас внутри buildDynamicPrompt, меняет префикс каждый ход) — перенести в volatile suffix, иначе кэш префикса неосуществим в принципе.
3. Композиция — детерминированная функция от (identity-version, memory-snapshot, user-message): одинаковый вход ⇒ байт-в-байт одинаковый промпт. Model-driven composition отвергаем: недетерминизм убивает и кэш, и debuggability.

## 5. GRAPHITI E2E GAP #3 — реальный прогон write → retrieval

### Метод [V]
- Стенд: `~/graphiti-una/server.py` (MCP stdio) + Ollama `qwen3:1.7b` (LLM) + `nomic-embed-text` (embeddings), Kuzu-граф.
- Прогон: протокол `scripts/graphiti-smoke.mjs`, переиспользующий `electron/ai/mcp-adapter.ts` (реальный код U.N.A., не тестовый мок): MCP initialize → ListTools → memory_add → memory_search. Лог: C:\TEMP\e2e-run.log (2026-09-16).

### Результат [V] — E2E FAILED, гэп #3 остаётся открытым (теперь с доказательством)
1. MCP-стек жив: initialize OK (6s), ListTools OK → `memory_add, memory_search, memory_status`.
2. `memory_add` ПАДАЕТ: `Error executing tool memory_add: 1 validation error for ExtractedEdges — edges: Field required` (pydantic v2.13, 35s).
3. Диагноз [I]: extractor Graphiti требует structured output (JSON-schema c edges); qwen3:1.7b вернул схему вместо данных — модель не тянет reliable structured output.
4. Первоисточник добавил второй факт: Kuzu-бэкенд объявлен **deprecated** («upstream Kuzu no longer maintained; migrate to Neo4j or FalkorDB») — предупреждение живого сервера в логе.
5. Ретрай на qwen3:4b не выполнялся осознанно: в прошлом прогоне (DEC-006) 4b зависал на structured output; риск повторения. Ретрай возможен отдельно.

### Вывод [I]
- RETRIEVAL-путь (memory_search) не достигнут — ADD падает раньше. Полный E2E (write → Graphiti → retrieval → Composer) **не подтверждён**; гэп #3 остаётся OPEN, теперь с точной причиной и двумя подпунктами: (a) structured output локальной модели, (b) деградация Kuzu-стека.
- Влияние на дизайн: surfaced-память в Phase 2 строится на ЛОКАЛЬНОМ пути (SQLite L1 + nomic-embed); Graphiti — параллельный sink, не источник surfaced-памяти. Это совпадает с текущей архитектурой, но теперь это осознанное решение, а не случайность.

## 6. Contradictions: U.N.A. vs отраслевые подходы

| # | U.N.A. сейчас | Отраслевой паттерн | Суть противоречия |
|---|---|---|---|
| C1 | Score при записи (0.25); при surfacing релевантности к запросу нет | Mem0/Graphiti: ranking при извлечении | Гейт не там |
| C2 | maxHotTokens фиксируется на старте сессии; может превышать реальное окно модели (4096 у qwen3:1.7b) | Бюджет ≤ окно модели, per-request | Рассинхрон бюджета и окна |
| C3 | История усекается с начала; приоритетов нет | Anthropic/OpenAI: стабильный префикс, volatile в хвосте | Нет регионов и кэш-гигиены |
| C4 | Episodic-поиск меняет префикс каждый ход | Кэшируемый префикс должен быть стабильным | Убивает prompt caching |
| C5 | Нет last_accessed/decay/invalidated | Mem0: expiration+history; Letta: dreaming; LangMem: consolidation | Нет lifecycle памяти |
| C6 | Graphiti — единственный «графовый» путь, но E2E не работает (ADD падает) | — | Зависимость не подтвердилась |

## 7. Открытые вопросы (для DEC / следующего шага)

1. K_core для «core»-фактов (surfaced всегда): 3? 5? Требует замера влияния на 4k-окно qwen3:1.7b.
2. Порог отсечки surfacing («no memory better than wrong memory»): фиксировать (напр. 0.35 semantic score) или конфиг?
3. SURFACE-гейт для [MEM] recall memory-token'ов: сейчас модель может тянуть память в обход гейта — ограничивать ли тем же top-K правилом?
4. Decay: линейный по дням с последнего доступа? Отмечать ли доступ к факту (запись в SQLite на каждый surfacing)?
5. invalidate-UX: где пользователь говорит «это неверно» — чат-команда или GUI-флаг? (только дизайн, не код)
6. Graphiti: (a) FalkorDB/Neo4j вместо deprecated Kuzu? (b) extractor c qwen3:4b или Ollama format=json? Или заморозить Graphiti до Phase 3?

## 8. Exit criteria — чеклист

- [x] Research artifact завершён (этот файл).
- [x] Открытые вопросы явно перечислены (раздел 7).
- [x] Contradictions зафиксированы (раздел 6, C1–C6).
- [x] Graphiti E2E: однозначно оставлен как открытый gap с доказательством (раздел 5) — НЕ VERIFIED.
- [x] Production tree не изменён (git status: только docs/research).
- [x] Никаких «заодно исправили».



