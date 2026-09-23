# TASK-015 - Wave 3 tests: routing-пакет (fast-path + intent + semantic-router)

- **Основание:** DEC-021 (Accepted); Wave 3 — покрытие routing-слоя L0/L1 без dedicated-тестов.
  Второй комплексный кусок после TASK-014: 3 файла, ~475 строк, один бранч.
- **Исполнитель:** K3. **Ветка:** k3/task-015-routing-tests (от актуального main на момент старта).
  **Статус:** READY. Выдавать после merge PR #15 (rebase на свежий main обязателен).
- **Зависимости:** нет (tests-only).
- **State (сверено с кодом 2026-09-24):** dedicated-тестов нет ни у одного из трех файлов.

## Файл 1: electron/ai/fast-path.ts (109 строк)
- matchFastCommand — ЧИСТАЯ функция, моки не нужны:
  RU/EN глаголы открытия (открой/запусти/open/launch/start + опциональное 'пожалуйста');
  алиасы из таблицы (включая кириллические: дискорд, телеграм, хром, код, терминал и т.д.);
  срез префиксов (приложение/program/app) и суффикса 'пожалуйста'; trailing-пунктуация;
  неизвестное приложение -> null; не-команда -> null.
- runFastCommand/tryFastCommand: мокать dispatchTool из ../tools (vi.mock):
  success -> текст 'Открываю X.' + fastPath true; failure -> текст с ошибкой;
  throw dispatch -> error-текст; нет match -> null.
- ЗАПРЕЩЕНО: реальный dispatchTool (никаких настоящих open_app в тестах).

## Файл 2: electron/ai/intent.ts (139 строк, чистые функции)
- detectIntent: по 2-3 RU+EN кейса на каждый intent (weather/news/web_search/file_read/file_write/
  file_find/code/system/screen/gui/memory/greeting) + unknown на мусоре.
- Приоритет порядка (первый матч побеждает): зафиксировать фактическое поведение на пересечениях
  (например, weather-паттерны раньше остальных) — не чинить, фиксировать.
- filterToolsByIntent: подмножества по таблице (greeting -> [], unknown -> полный список,
  code -> длинный список), неизвестные имена инструментов отфильтровываются.
- TOOL_BY_INTENT: проверить ключевые маппинги напрямую (memory включает memory_save/memory_recall).

## Файл 3: electron/ai/semantic-router.ts (226 строк)
- detectSemanticIntent без init -> { unknown, 0, [] }.
- initSemanticRouter: мокать ./embed (vi.mock) детерминированными векторами — 12 центроидов,
  флаг initialized (повторный init — no-op).
- detect: мок embed возвращает вектор близко к якорю -> intent + confidence >= 0.6;
  далекий вектор -> unknown; embed бросает -> unknown/0.
- Порог SEMANTIC_CONFIDENCE_THRESHOLD = 0.6 проверить напрямую.
- ЗАПРЕЩЕНО: реальная сеть / Ollama (embed либо замокан, либо fetch замокан в отказ -> hashing fallback).
- Состояние модуля (initialized/centroids) сбрасывать через vi.resetModules + re-import (образец — TASK-008).

## Scope строго
- Разрешено: tests/ai/fast-path.test.ts, tests/ai/intent.test.ts, tests/ai/semantic-router.test.ts (новые),
  отчет docs/reports/k3/YYYY-MM-DD-task-015.md, manifest sync.
- Запрещено: любой production-код; реальный dispatchTool; реальная сеть/Ollama;
  safety/workflows/package*.json; decision-log/AGENTS.md/docs сверх отчета; ручной manifest.

## Acceptance
- Три файла зеленые (ориентир: 15-25 кейсов каждый); npm test полностью зеленый;
  tsc electron+root 0; manifest sync/verify чисто (0 missing) в worktree;
  ветка k3/task-015-routing-tests; отчет DEC-021 раздел 5.
- **Стоп (DEC-021 раздел 6):** сомнения в контракте (особенно приоритеты detectIntent) — в отчет, не в фикс.
- **Код — истина (DEC-010).**
