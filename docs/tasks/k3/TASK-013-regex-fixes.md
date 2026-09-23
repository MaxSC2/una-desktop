# TASK-013 - fix-пакет: regex-парсинг токенов (Q-META + Q-EXEC-001)

- **Основание:** решение Lead A от 2026-09-24 (вариант A из Q-META и Q-EXEC-001): чинить пакетом.
- **Исполнитель:** K3. **Ветка:** k3/task-013-regex-fixes (от main ab3e0da). **Статус:** READY.
- **Subsystem:** electron/ai/meta-learning.ts (202 строки), electron/ai/executive.ts parseGoalToken.
- **Зависимости:** нет. Это первый production-fix после Wave 2 — НЕ tests-only.

## Дефект 1 (Q-EXEC-001): parseGoalToken create-ветка
- **Текущее:** regex `^\[GOAL\]\s+create:\s*(.+)\s*\|?\s*(.+)$` — пайп необязателен,
  жадный (.+) съедает все кроме последнего символа.
- **Фикс (утверждено, не на выбор K3):** пайп — обязательный разделитель, description — нежадный:
  `^\[GOAL\]\s+create:\s*(.+?)\s*\|\s*(.+)$`.
- **Новое поведение:** 'create: do X | a, b, c' -> description 'do X', subgoals ['a','b','c'];
  'create: do X' (без пайпа) -> null. Ветки done/cancel/garbage — без изменений.
- **Инверсия тестов (tests/ai/executive.test.ts):** обновить ровно 2 эдж-теста create (ожидания выше);
  остальные parseGoalToken-тесты (done/cancel/null) должны остаться зелеными без правок.

## Дефект 2 (Q-META): \b + кириллица в meta-learning.ts
- **Текущее:** CORRECTION_PATTERNS / SHORT_ANSWER / LONG_ANSWER / LESS_TOOL_PATTERNS используют
  `\b` вокруг кириллических литералов; в JS `\w = [A-Za-z0-9_]`, кириллица — \W,
  поэтому границы \b внутри кириллических слов не срабатывают (эмпирика TASK-007: 0/4).
- **Фикс (утверждено, не на выбор K3):** заменить `\b` на явные границы через lookaround-helpers
  в начале файла: начало `(?:(?<![A-Za-zА-Яа-яЁё0-9_]))`, конец `(?:(?![A-Za-zА-Яа-яЁё0-9_]))`;EN-литералы (stop/wrong/no/...) перевести на те же хелперы для единообразия.
  Композитные `.*` внутри паттернов сохранить как есть. Node 18+ lookbehind — разрешен (проверить tsc target).
- **Инверсия тестов (tests/ai/meta-learning.test.ts):** 2 дефект-теста инвертировать:
  кириллические коррекции ('стоп, ты не так понял', 'исправь', 'не исправь', 'это ошибка' и т.п.) -> detectCorrection true;
  'покороче' / 'отвечай подробнее' / 'искать в интернете не нужно' -> insights появляются.
  Все EN-тесты должны остаться зелеными без правок.

## Scope строго
- Разрешено: electron/ai/meta-learning.ts, electron/ai/executive.ts (только 2 regex-места),
  tests/ai/meta-learning.test.ts, tests/ai/executive.test.ts (только инверсии + новые позитивные RU-кейсы),
  отчет docs/reports/k3/YYYY-MM-DD-task-013.md, manifest sync.
- Запрещено: любые другие production-файлы; менять семантику сверх указанного (пороги confidence,
  лимиты, статусы целей); новые фичи; трогать DEC/AGENTS/docs кроме отчета.
- Manifest: заодно удалить фантом docs/tasks/k3/TASK-006-identity-tests.md (утёк в main через TASK-012 sync,
  файла нет в дереве) — verify должен показать 0 missing.

## Acceptance
- RU-кейсы обоих дефектов зеленые (позитивные), EN-регрессия зеленая;
- npm test полностью зеленый (490+ минус 0, плюс новые кейсы); tsc electron+root 0;
- manifest sync/verify чисто (0 missing) в worktree; ветка k3/task-013-regex-fixes;
- отчет docs/reports/k3/YYYY-MM-DD-task-013.md (DEC-021 раздел 5) с до/после таблицей поведения.
- **Стоп (DEC-021 раздел 6):** больше 3 попыток на один regex — эскалация с примерами строк;
  любые сомнения в границе слова — в отчет, не в самодеятельность.
- **Код — истина (DEC-010).** После фикса旧-ожидания в тестах считаются устаревшими и инвертируются —
  это утверждено данным спеком, а не решением K3.
