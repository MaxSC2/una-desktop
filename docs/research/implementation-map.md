# Implementation Map — U.N.A. v40

> Единая карта состояния подсистем. Связывает research-идеи с кодом.
> **Иерархия источников истины** (при конфликте побеждает верхняя):
> 1. Реальный код → 2. Тесты / build / verification → 3. Git history → 4. HONEST_STATUS → 5. Planning docs → 6. Research → 7. Сообщения ИИ.
> Если документ говорит «planned», а код и тесты показывают рабочую подсистему — статус `VERIFIED`, документ устарел.

**Статусы:** `VERIFIED` (работает, покрыто проверками) · `IMPLEMENTED` (в runtime, но без собственных тестов/E2E — пробел указан) · `NOT WIRED` (код есть, в runtime не подключён) · `PLANNED` (в backlog, не начато) · `RESEARCHED` (изучено, решения нет) · `REJECTED`.

**Последняя верификация:** 2026-09-16 — tsc 0 (electron+renderer), vitest 250/250 (13 файлов), `npm run build` ✓ (vite 21s), manifest 273/273 (0 пропущено; «1 лишний» = untracked `docs/design/prototype-scene-vNext/`, DEC-012). Коммиты среза: `e9c222b`(m5) → `91be822` → `13e667f`(m6) → `52111f7` → `03101a3` → `3206003`(P1-1) → `88b7619`(P1-2) → `277a3e4`(review-fixes) → `f3c8f67` → `c57dcb6`(DEC-012).

**Правила обновления:** статус меняется только при новом Evidence (прогон тестов, новый коммит, wiring). При сомнении — статус ниже по лестнице. Поле «Пробелы → шаг» — вход в JOURNAL/бэклог.

---

## Маршрутизация

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| L0 Fast Path | VERIFIED | импортирован из router.ts; router.test.ts | ai/fast-path.ts, ai/router.ts | M1 | — |
| L1 Semantic Router | VERIFIED | initSemanticRouter в main.ts; regex-fallback | ai/semantic-router.ts | M1 | бенчмарк точности не формализован |
| Unified Router L0–L2 | VERIFIED | вынесен из tool-loop; RouteDecision; тесты лестницы | ai/router.ts, ai/tool-loop.ts | M5 (`e9c222b`) | — |
| VRAM Gate + game detection | VERIFIED | startVramGate/stopVramGate/isOllamaModelLoaded в main.ts | ai/vram-gate.ts | M2/M3 | — |
| Resource Manager | IMPLEMENTED (wired) | getResourceState в main.ts | ai/resource-manager.ts | M2 | нет отдельных тестов |

## Память

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| SQLite + FTS5 core | VERIFIED | миграции колонок; store.test.ts; migration.test.ts (6: fresh/legacy/restart/триггеры) | memory/store.ts | — | закрыто (P1-1) |
| RLM (memory tokens) | VERIFIED | rlm.test.ts; parseMemoryTokens/executeMemoryTokens в tool-loop | memory/rlm.ts | M4 | — |
| Memory Manager (скоринг-гейт, maintenance, elevate) | VERIFIED | manager.test.ts (13); wired в main.ts + tool-loop | memory/manager.ts | M6 (`13e667f`) | миграционные тесты — закрыто (P1-1, migration.test.ts) |
| Graphiti L2 (MCP) | VERIFIED (протокол) | mcp-adapter в main.ts; m3-smoke = 3 tools | ai/mcp-adapter.ts, docs/GRAPHITI_MEMORY.md | M3 | end-to-end recall не подтверждён |
## Безопасность

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| Safety classifier | VERIFIED | classifier.test.ts | safety/classifier.ts | — | — |
| Pending-action confirmations | VERIFIED | confirmation.test.ts (12): TTL/origin/one-shot | tools/helpers.ts, ai/config.ts, main.ts | M6 (`03101a3`) | origin telegram/autonomous пока неактивны (только chat) |
| SSRF guard / env filter / protected files | VERIFIED | HONEST_STATUS; classifier | tools/*, safety/* | — | — |
| Injection fixtures (PyRIT-style) | VERIFIED (unit) / E2E pending | indirect-injection.test.ts (10): «вывод = данные, не инструкции» для web_fetch/read_file/web_search/MCP, SSRF-блок, protected files, гейты опасных команд, observation-канал tool-loop | tests/safety/indirect-injection.test.ts | Phase 1 / P1-2 (`88b7619`) | E2E на живой модели (Ollama) — кандидат в Phase 2; санитайзера нет осознанно (DEC-008) |

## Инструменты

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| Web tools (search/fetch/download) | VERIFIED | web-tools.test.ts + integration | ai/web-tools.ts, tools/definitions/web-* | — | Playwright-слой — Pass 3 |
| Code tools (patch/edit/grep/run) | VERIFIED | code-tools.test.ts + integration | ai/code-tools.ts, tools/definitions/* | — | — |
| GUI automation | IMPLEMENTED (E2E не подтверждён) | gui-automation.ts; gap-map | ai/gui-automation.ts, tools handlers | — | E2E на реальном столе (разблокировано после `03101a3`) |

## Фоновые подсистемы

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| Life Loop | IMPLEMENTED (wired) | startLifeLoop в main.ts | ai/life-loop.ts | — | продуктовые правила |
| Proactive engine | IMPLEMENTED (wired) | startProactiveEngine в main.ts | ai/proactive.ts | — | — |
| Background monitor | IMPLEMENTED (wired) | импорт в main.ts | ai/background-monitor.ts | — | — |
| Attention manager | IMPLEMENTED (wired) | recordInteraction/getAttentionState в main.ts | ai/attention-manager.ts | — | — |
| World model | IMPLEMENTED (wired) | buildWorldState/incrementMessageCount в main.ts | ai/world-model.ts | — | — |
| Meta-learning | IMPLEMENTED (wired) | getInsights/resetLearning в main.ts | ai/meta-learning.ts | — | — |
| Identity / modes / states / monologue | IMPLEMENTED (wired) | импорты main.ts | ai/identity.ts, modes.ts, states.ts, monologue.ts | — | — |
| Executive (goals) | IMPLEMENTED (wired) | main.ts + life-loop + agents/index.ts | ai/executive.ts | — | durable task runtime — Pass 5 |

## Агентность

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| Agents core (multi-agent) | NOT WIRED | единственный импорт — autonomous-loop.ts:15; сам он недостижим | agents/index.ts | — | решение о маршрутизации (DEC-008) |
| Autonomous Loop | NOT WIRED | не импортируется никем в runtime | ai/autonomous-loop.ts | — | после multi-agent |
| Skills | NOT WIRED | импортов нет | ai/skills.ts | — | после multi-agent |

## Presence и voice

| Компонент | Статус | Evidence | Файлы | Коммит/этап | Пробелы → шаг |
|---|---|---|---|---|---|
| Voice (ASR/TTS + fallback) | IMPLEMENTED (частично) | адаптеры; browser fallback | ai/asr.ts, ai/tts.ts | — | VAD/whisper.cpp — Pass 4 |
| Avatar / presence | IMPLEMENTED (частично) | React/Rive/overlay (gap-map) | src/components/* | — | redesign; state-to-animation — Pass 4 |

## Research-горизонт

| Направление | Статус | Источник | Следующий шаг |
|---|---|---|---|
| Observability (OTel/Phoenix) | RESEARCHED | v4.1; в коде отсутствует | решение после Pass 1–2 |
| Task Runtime (durable) | RESEARCHED | v4.1; Pass 5 | только при реальном сценарии |
| Deep Research v4.1 | STORED | `docs/research/UNA_Deep_Research_v4.1_2026-09-15.md` | источник кандидатов, не истина (DEC-010) |

---

### Известные системные пробелы (сводка)

1. ~~Миграционные тесты M6 (старая БД → апгрейд, повторный старт, FTS) — Pass 1.~~ → **решено (P1-1):** `tests/memory/migration.test.ts` (6 тестов: fresh, legacy-апгрейд с сохранением фактов, v30-регрессия delete, 2× restart, триггеры insert/update/delete).
2. ~~Injection-фикстуры для web/file/MCP — Pass 1.~~ → **решено (P1-2):** `tests/safety/indirect-injection.test.ts` (10 тестов: контракт «вывод = данные» для web_fetch/read_file/web_search/MCP, SSRF-блок, защищённые файлы, гейты опасных команд, observation-канал tool-loop).
3. Graphiti end-to-end recall — после Pass 1 → **кандидат Phase 2 → Step 1 подтверждён гэпом**: остаётся открытым (протокол VERIFIED: initialize + 3 tools; реальный recall не подтверждён. **2026-09-16 реальный E2E-прогон через mcp-adapter (qwen3:1.7b + nomic-embed): memory_add падает — `ExtractedEdges: edges Field required` (structured output локальной модели); сервер предупреждает: Kuzu-бэкенд deprecated (upstream не поддерживается). См. docs/research/phase-2-memory-research.md §5.** Блокер остаётся: Python sidecar + LLM-провайдер. **Step 1.5 спайк (2026-09-17, `c677eb6`):** причина изолирована — не «слабая модель», а канал схемы (prompt-injected `json_object`) и язык (RU-эпизод записан EN-фактами, FTS `stemmer=english`); native `format`=schema на `qwen3:1.7b` даёт валидный extraction (9.5 с, edges=4; 4b — 48.4 с), write path ADD OK (27.1 с), FalkorDB local-only на Windows FAILED (нет `win_amd64` wheel). Решение отложено за DEC-018 (draft, §13 proposal Step 2): backend не мигрируем, L2 — опциональный слой.
4. Мёртвый узел agents/autonomous-loop/skills — решение о маршрутизации (DEC-008); **пере-срез 2026-09-16:** подтверждено NOT WIRED (импорт-граф: единственная ссылка — `scripts/apply-m4-briefing.mjs`, runtime-импортов нет) → решение переносится в Phase 2.
5. Подсистемы без собственных тестов: compression, resource-manager, фоновые (life-loop/proactive/monitor/attention/world/meta/identity) — приёмочные тесты по мере касания. **2026-09-22: compression — назначена K3 как TASK-001** (`docs/tasks/k3/TASK-001-compression-tests.md`, ветка `k3/task-001-compression-tests`). **2026-09-22: compression — ЗАКРЫТО (TASK-001 DONE):** `tests/ai/compression.test.ts`, 26/26, отчёт `docs/reports/k3/2026-09-22-task-001.md`; в main попадёт через PR (ruleset review-gate). **2026-09-23: пробел №5 ЗАКРЫТ ЦЕЛИКОМ (K3 wave 2, TASK-002…TASK-011, stacked-ветки `k3/task-002…011`):** resource-manager 37 кейсов (`b6313e2`), states+modes 24 (`d225a09`), attention-manager 14 (`7f2044b`), monologue 18 (`7c03348`), world-model 12 (`aa3b634`), meta-learning 20 (`e24e8a3`), identity 13 (`507d6f1`), background-monitor 12 (`1665376`), proactive 13 (`1382923`), life-loop 27 (`43043bb`) — всего **180 новых кейсов** в `tests/ai/`; полный набор **466/466**, tsc 0, manifest 0/0. Прод-код не тронут (P1-2). **Побочная находка (F-кандидат):** в `meta-learning.ts` все RU-regex используют `\b`, который не матчит кириллицу (`\w` = ASCII) → `detectCorrection`/`learnFromMessage` игнорируют любой русский ввод (мёртвая детекция поправок/предпочтений) — нужно решение Архитектора (спека TASK-007 + отчёт волны `docs/reports/k3/2026-09-23-wave2-task-002-011.md`).
6. `.review-profile/` (кэш-профиль дизайнера в `docs/design/prototype-scene-vNext/`) попадает в манифест — `sync/verify-manifest` не исключают Chromium-кэш (Code Cache, leveldb), это плодит churn манифеста. Кандидат: добавить в EXCLUDE_DIRS обоих скриптов. **Статус 2026-09-22: pending-задача (зафиксирована lead'ом), не начата.**
