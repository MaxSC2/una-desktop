# Phase 1 — скоуп рабочей точки (Pass 1 remainder)

> Дата: 2026-09-15. Статус: Accepted (выбор пользователя: Вариант B).
> Правило обновлений — DEC-011: decision-log → implementation-map → JOURNAL → commit → push.
> Проверка — DEC-010: код > тесты/build > git history > HONEST_STATUS > planning docs > research.

## Цель

Закрыть два пробела из `implementation-map.md` («Известные системные пробелы», п.1–2),
они же — незакрытая часть `research-backlog.md / Pass 1`:

1. Миграционные тесты M6 (старая БД → апгрейд, повторный старт, FTS).
2. Injection-фикстуры (PyRIT-style) для `web_fetch` / `read_file` / `web_search` / MCP.

Третий пункт Pass 1 — pending-action record — **уже закрыт** (`03101a3`, DEC-003/DEC-004,
`tests/tools/confirmation.test.ts` — 12 тестов). Повторно не делаем.

## P1-1 — Миграционные тесты M6

**Файлы:** новый `tests/memory/migration.test.ts`. Прод-код — только при необходимости
(`user_version` или чинка существующего `initMemory`); предпочтительно tests-only.

**Сценарии (минимум):**
- fresh: чистая БД → `initMemory()` → все таблицы + FTS external-content + триггеры `facts_ai/ad/au`;
- legacy: БД старого формата (обычная FTS5-таблица без `content='facts'`, без M6-колонок
  `importance/origin/pinned/graph_synced_at/provenance_json`, без `memory_candidates`) →
  `initMemory()` → апгрейд без потери фактов, FTS ищет старые и новые факты;
- restart: двойной `initMemory()` подряд — идемпотентно, данные целы, без «SQL logic error»;
- triggers: insert/update/delete факта после миграции → `facts_fts` синхронен
  (проверка через прямой запрос к `facts_fts`, а не только через `recallFacts`);
- rollback-док: 3–5 строк в шапке теста — как откатиться (бэкап `una-memory.db*` перед апгрейдом).

**Готово:** новый файл зелёный + весь `vitest run` зелёный, `tsc` 0 (electron+renderer).

## P1-2 — Injection-фикстуры (корпус + контрактные тесты)

**Файлы:** новый `tests/safety/indirect-injection.test.ts` (+ фикстуры рядом или инлайн).
Прод-код — только при необходимости; по умолчанию tests-only, фиксируем контракт.

**Контракт под тестом:** вывод инструментов — недоверенные данные, а не инструкции.
Проверяем, что враждебные вставки в контенте НЕ превращаются в действия:
- `web_fetch`: HTML с `<script>`, `javascript:`-ссылками, текстом «Ignore previous instructions…»,
  `onerror=`-пейлоадами → возвращается как данные (`success: true, data.text`), без исполнения;
- `read_file`: файл с тем же набором вставок + секреты рядом (`.env`) → контент как данные,
  секреты по-прежнему блокируются `isProtectedFile`;
- `web_search`: сниппеты с инструктивными вставками → возвращаются как данные;
- MCP: результат `callTool` с инструктивной вставкой → пробрасывается как данные в `ToolResult`,
  `tool-loop` не выполняет вложенных действий без отдельного вызова.

**Источники образцов:** AT0M1Ceng1n33r1ng/PyRIT (паттерны indirect-injection),
поверх — собственные строки на русском/английском под наши инструменты.
Это корпус + фиксация поведения (DEC-008: новый санитайзер/подсистема НЕ создаётся).

**Готово:** новый файл зелёный + весь `vitest run` зелёный.

## Метрика выхода (оба коммита)

- `tsc -p electron/tsconfig.json --noEmit` — 0 ошибок;
- `tsc -p tsconfig.json --noEmit` — 0 ошибок;
- `npx vitest run` — всё зелёное, **новых skip нет**
  (существующие `skipIf(!hasInternet)` в `web-tools-integration` — задокументированы, не расширять);
- `npm run build` — собирается;
- `node scripts/sync-manifest.js` + `verify-manifest.js` — 0 пропущено, 0 лишних.

## Документальная цепочка (DEC-011, каждый коммит)

- `implementation-map.md`: строки «сценарии миграции старой БД — PLANNED» →
  VERIFIED с Evidence (имя теста); строка «Injection fixtures — PLANNED» → VERIFIED;
  сводка пробелов п.1–2 — пометить решёнными;
- `JOURNAL.md`: запись дня (тема → суть + артефакт/коммит);
- `HONEST_STATUS.md`: счётчики тестов/манифеста, если изменились;
- `decision-log.md`: новая DEC-запись **только если** по ходу принято архитектурное решение
  (ожидаемо — нет; миграция и фикстуры решений не требуют);
- commit + push в `origin/main`. Шаблоны сообщений:
  `test(memory): P1-1 миграционные тесты M6 — старая БД, рестарт, FTS`
  `test(safety): P1-2 injection-фикстуры web/file/search/MCP`

## Вне скоупа (DEC-008, не трогать в этих коммитах)

Agents/autonomous-loop/skills wiring · Graphiti end-to-end recall · Playwright/Stagehand ·
voice/avatar · durable queue (Pass 5) · observability · любые новые зависимости в `package.json`.

## Как проверять (для внешнего наблюдателя)

| Пункт backlog | Код/тест | Commit | Документ |
|---|---|---|---|
| M6 storage migration | `tests/memory/migration.test.ts` | `test(memory): P1-1…` | implementation-map «Память», JOURNAL |
| PyRIT-inspired corpus | `tests/safety/indirect-injection.test.ts` | `test(safety): P1-2…` | implementation-map «Безопасность», JOURNAL |
| Метрика выхода | `tsc` + `vitest` + `build` + manifest | хэш коммита | HONEST_STATUS |
