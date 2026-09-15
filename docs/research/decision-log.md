# Decision Log — архитектурные решения U.N.A.

> Архитектурная память проекта: почему система устроена так, а не иначе.
> Каждая запись: **Decision / Date / Problem / Options / Chosen / Why / Evidence / Affected modules / Status / Superseded by**.
> Статусы: `Proposed → Accepted → Superseded / Rejected`. Отменённое решение не удаляется — в него дописывается «Superseded by».
> Иерархия источников истины — в шапке `implementation-map.md`.

---

## DEC-001 — Лестница маршрутизации L0 → L1 → L2

- **Decision:** детерминированные уровни впереди, LLM — последний рубеж.
- **Date:** 2026-09-15 (коммит `e9c222b`, метка m5)
- **Problem:** каждый запрос гонял LLM-классификатор — задержка и расход VRAM даже на тривиальных командах.
- **Options:** (a) LLM на каждый интент; (b) отдельная мелкая LLM на каждом уровне; (c) лестница fast/direct → semantic/regex → LLM.
- **Chosen:** (c) L0 fast/direct → L1 semantic → L1 regex → L2 LLM.
- **Why:** < 50 мс и ноль GPU для gui/system-команд; regex-fallback сохраняет работу без embeddings.
- **Evidence:** `electron/ai/router.ts`, `electron/ai/fast-path.ts` (импортирован из router.ts), `electron/ai/semantic-router.ts` (init в main.ts), `tests/ai/router.test.ts`, HONEST_STATUS M1.
- **Affected modules:** router.ts, fast-path.ts, semantic-router.ts, tool-loop.ts.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-002 — LLM ≠ управляющий системой

- **Decision:** модель предлагает действия, но решение и исполнение — за policy-слоем.
- **Date:** 2026-09 (правило зафиксировано в gap-map 2026-09-15).
- **Problem:** произвольные tool-calls могут выполнить опасные действия без контроля.
- **Options:** доверять модели; жёсткий whitelist; classifier + подтверждение перед исполнением.
- **Chosen:** policy-слой: safety classifier → confirmation gate → execution.
- **Evidence:** `electron/safety/classifier.ts`, `tests/safety/classifier.test.ts`, гейты в execute-command/write-file, gap-map «Что сознательно не делать».
- **Affected modules:** safety/*, tools/definitions/*, tool-loop.ts.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-003 — Детерминированные токены подтверждений

- **Decision:** токен = sha256-дайджест параметров действия (`actionToken`), а не случайная строка.
- **Date:** 2026-09-15 (коммит `13e667f`).
- **Problem:** токены генерировались заново при каждом вызове — подтверждение не могло сработать повторно.
- **Options:** (a) персистентный random-токен + реестр; (b) digest параметров.
- **Chosen:** (b): тот же вызов находит подтверждение, изменённые параметры → новый запрос.
- **Why:** устраняет класс бага без нового хранимого состояния; модификация команды по умолчанию безопасна.
- **Evidence:** `electron/tools/helpers.ts` (actionToken), `tests/tools/confirmation.test.ts`, коммит `13e667f`.
- **Affected modules:** helpers.ts, execute-command.ts, write-file.ts, request-confirmation.ts.
- **Status:** Accepted.
- **Superseded by:** частично DEC-004 (хранилище строк → записи; сама схема токена сохранена).


## DEC-004 — Pending-action records: TTL, origin, одноразовость

- **Decision:** подтверждение — запись `{token, action, origin, createdAt}` с TTL 10 минут и погашением после исполнения.
- **Date:** 2026-09-15 (коммит `03101a3`).
- **Problem:** подтверждения жили вечно, не было аудит-полей и погашения.
- **Options:** (a) строки с лимитом 100; (b) записи + TTL + `consumeToken`.
- **Chosen:** (b); чистка fail-closed (битые/будущие даты удаляются); one-shot после исполнения.
- **Evidence:** `helpers.ts` (CONFIRM_TTL_MS, purgeExpiredActions), `ai/config.ts` (confirmedActions), `main.ts` (chat:confirm), `tests/tools/confirmation.test.ts` (12 тестов).
- **Affected modules:** helpers.ts, ai/config.ts, main.ts, execute-command.ts, write-file.ts, preload/api/useUNA.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-005 — Память: одно ядро, внешние библиотеки — источники паттернов

- **Decision:** ядро памяти — собственное (SQLite + FTS5 + graph adapter); LangGraph/Letta/Mem0/LlamaIndex/Graphiti одновременно не подключаем.
- **Date:** 2026-09-15 (gap-map).
- **Problem:** зоопарк memory-плагинов = второй orchestration core.
- **Options:** миграция на внешнее ядро; своё ядро + паттерны извне.
- **Chosen:** второе; Pass 2 backlog — сравнение политик WRITE/DREAM/SURFACE, а не внедрение.
- **Evidence:** gap-map «Что сознательно не делать», research-backlog Pass 2.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-006 — Graphiti как L2-слой памяти через MCP, не замена SQLite

- **Decision:** граф-память подключается MCP-адаптером с автодетектом, поверх L1-стора.
- **Date:** 2026-09 (метка M3).
- **Evidence:** `ai/mcp-adapter.ts` (импорт в main.ts), `scripts/m3-smoke-mcp.mjs` (initialize + tools/list = 3 tools), `docs/GRAPHITI_MEMORY.md`.
- **Пробел:** end-to-end recall из графа не подтверждён (implementation-map, раздел «Память»).
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-007 — Forget = мягкое забывание, не DELETE

- **Decision:** забывание факта — `use_count = -1`, данные остаются восстановимыми.
- **Date:** 2026-09 (метка M4).
- **Evidence:** HONEST_STATUS M4; `memory/store.ts`.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-008 — Никаких новых крупных подсистем до завершения аудита

- **Decision:** browser/GUI tools и прочие нововведения не включаются до закрытия критичных пробелов (Pass 1).
- **Date:** 2026-09-15.
- **Evidence:** gap-map «Критические факты» (п.2–3); практика: контракт подтверждений закрыт до любых POC.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-009 — Шкалы проекта: M1–M6 архивны, фазы — Phase 0–5

- **Decision:** M1–M6 остаются метками ревизий статуса (история архитектуры); жизненный цикл разработки — Phase 0–5 без префикса «M».
- **Date:** 2026-09-15.
- **Problem:** предложение «Phase M0» из внешнего обсуждения конфликтовало с существующей шкалой M.
- **Chosen:** два независимых пространства имён; коммитные метки feat(mN) — легитимная история.
- **Evidence:** коммит `e9c222b` (feat(m5), единый роутер), `13e667f`/`03101a3` (feat(m6)), MENTOR_BRIEFING.md:75, JOURNAL.
- **Status:** Accepted.
- **Superseded by:** —.

## DEC-010 — Иерархия источников истины для статусов

- **Decision:** код > тесты/build > git history > HONEST_STATUS > planning docs > research > сообщения ИИ.
- **Date:** 2026-09-15.
- **Why:** README и исследования описывают намерения, код — факты; статусы меняются только при новом Evidence.
- **Evidence:** шапка `implementation-map.md`.
- **Status:** Accepted.
- **Superseded by:** —.
