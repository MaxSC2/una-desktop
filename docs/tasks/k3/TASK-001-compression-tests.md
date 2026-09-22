# TASK-001 — Приёмочные тесты для `electron/ai/compression.ts`

- **Основание:** DEC-021 (Accepted, 2026-09-22); implementation-map, системный пробел №5
  («подсистемы без собственных тестов: compression, …»).
- **Исполнитель:** K3 (автономный AI-кодер).
- **Ветка:** `k3/task-001-compression-tests` (push только в неё; `main` не трогать — DEC-021 §2).
- **Окружение:** worktree `../UNA-k3-workzone` — **подготовлено и провалидировано 2026-09-22**
  (vitest 250/250, tsc electron 0). `.env` отсутствует по построению (не в git, локально нет).
  node_modules зеркалирован с основного дерева — `npm install` в worktree не запускать
  (npm bug #4828: битая распаковка optional-deps).
- **Статус:** READY. **Блокер запуска:** ruleset на `main` (lead настраивает в GitHub UI).

---

## 1. Цель

Закрыть пробел «compression без тестов» приёмочным набором `tests/ai/compression.test.ts`.
Прецедент-контракт (P1-2, DEC-008): **тест фиксирует текущее поведение, а не подменяет его**.
Если поведение выглядит как баг — это находка в отчёт, а не повод править продакшн-код.

## 2. Scope

**Входит:** один новый файл `tests/ai/compression.test.ts` (+ при необходимости только
тестовые хелперы внутри него).

**Не входит (запрещено в этой задаче):**
- правки `electron/ai/compression.ts` и любого продакшн-кода;
- `resource-manager.ts` и фоновые подсистемы — отдельные задачи;
- запрещённые пути DEC-021 §2 (safety, workflows, package*.json, decision-log, AGENTS.md, docs/design);
- новые зависимости.

## 3. Контракт тестов (что фиксируем, по коду `compression.ts`)

### `promoteFrequentFacts()`
- факт `category='user'` с `use_count >= 5` → `category='preference'`, **use_count сохраняется**;
- факты с `use_count < 5` или `category != 'user'` не трогаются;
- лимит: не более 10 за проход; пустая БД → `0`; `getDb() = null` → `0`.

### `demoteStaleFacts()`
- `last_used` старше 30 дней (или NULL) и `use_count < 3` (или NULL) → `markFactForget`
  (use_count = -1, факт НЕ удаляется);
- защищённые категории `project`/`preference` не трогаются даже при stale-условиях;
- свежие факты не трогаются; лимит 20 за проход.

### `compressOldConversations()`
- нет бесед старше 7 дней без summary → `0`, LLM не вызывается;
- `shouldMaintainMemory() = false` → `0`, summary не пишется (беседы остаются без summary);
- LLM (`summarizeText`) вернул пустую строку → summary не пишется, сообщения беседы целы;
- LLM вернул сводку → `conversations.summary` обновлена, счётчик увеличен;
- гейт `remember()` отклонил (`stored: false`) или бросил ошибку → summary всё равно
  сохраняется в `conversations` (эпизодический слой), функция не падает;
- сэмпл для сводки: первые 3 + последние 3 сообщения, дедупликация по id, срез 800 символов.

### `runMaintenance()`
- возвращает агрегат `{ compressed, promoted, demoted }`, согласованный с результатами
  трёх функций выше.

## 4. Конвенции и референсы

- vitest, `tests/**/*.test.ts`, environment node (`vitest.config.ts`).
- Паттерн БД: `tests/memory/store.test.ts` — мок `electron` (`app.getPath` → `os.tmpdir()`),
  мок `electron/ai/embed`, реальный `electron/memory/store` на временной БД, динамический
  `await import` после моков.
- Внешний мир мокаем, тестируемую логику — нет (P1-2): мокаются `./llm` (`summarizeText`),
  `./resource-manager` (`shouldMaintainMemory`), `../memory/manager` (`remember`);
  `compression.ts` и `memory/store.ts` — настоящие.
- Очистка temp-БД в `afterEach`/`afterAll` (как в store.test.ts / migration.test.ts).

## 5. Acceptance criteria

1. `npx vitest run tests/ai/compression.test.ts` — зелёный.
2. `npm test` — весь набор зелёный (существующие тесты не сломаны).
3. `npx tsc -p electron/tsconfig.json --noEmit` — 0 ошибок.
4. `node scripts/sync-manifest.js` + `node scripts/verify-manifest.js` — 0 пропущено / 0 лишних.
5. Коммит(ы) монотематические (DEC-012), push в `k3/task-001-compression-tests`.
6. Отчёт `docs/reports/k3/YYYY-MM-DD-task-001.md` по контракту DEC-021 §5.

## 6. Стоп-условия (DEC-021 §6)

Стоп + отчёт вместо «творческого решения», если: тест невозможен без правки продакшн-кода;
полный набор не зеленеет после 3 итераций; обнаружен конфликт с Accepted DEC; поведение
`compression.ts` противоречит этому контракту (→ находка в отчёт, не фикс).
