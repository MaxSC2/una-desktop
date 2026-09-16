# Implementation Map — U.N.A. v40

> Единая карта состояния подсистем. Связывает research-идеи с кодом.
> **Иерархия источников истины** (при конфликте побеждает верхняя):
> 1. Реальный код → 2. Тесты / build / verification → 3. Git history → 4. HONEST_STATUS → 5. Planning docs → 6. Research → 7. Сообщения ИИ.
> Если документ говорит «planned», а код и тесты показывают рабочую подсистему — статус `VERIFIED`, документ устарел.

**Статусы:** `VERIFIED` (работает, покрыто проверками) · `IMPLEMENTED` (в runtime, но без собственных тестов/E2E — пробел указан) · `NOT WIRED` (код есть, в runtime не подключён) · `PLANNED` (в backlog, не начато) · `RESEARCHED` (изучено, решения нет) · `REJECTED`.

**Последняя верификация:** 2026-09-16 — tsc 0 (electron+renderer), vitest 250/250 (13 файлов), `npm run build` ✓, manifest 273/273 (0 пропущено, 0 лишних). Коммиты среза: `e9c222b`(m5) → `91be822` → `13e667f`(m6) → `52111f7` → `03101a3` → `3206003`(P1-1) → P1-2 (indirect-injection.test.ts, +10).

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
| Injection fixtures (PyRIT-style) | VERIFIED | indirect-injection.test.ts (10): «вывод = данные, не инструкции» для web_fetch/read_file/web_search/MCP, SSRF-блок, protected files, гейты опасных команд, observation-канал tool-loop | tests/safety/indirect-injection.test.ts | Phase 1 / P1-2 | санитайзера нет осознанно (DEC-008); E2E на живой модели — отдельный трек |

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
3. Graphiti end-to-end recall — после Pass 1.
4. Мёртвый узел agents/autonomous-loop/skills — решение о маршрутизации (DEC-008 блокирует до Pass 2).
5. Подсистемы без собственных тестов: compression, resource-manager, фоновые (life-loop/proactive/monitor/attention/world/meta/identity) — приёмочные тесты по мере касания.
