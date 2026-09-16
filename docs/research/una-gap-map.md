# Карта UNA-v40: реальность, пробелы и внешние доноры

Дата среза: 2026-09-15. Источник фактов о UNA — код рабочей директории, прежде всего
`electron/main.ts`, `electron/ai/*`, `electron/memory/*`, `electron/tools/*` и тесты.

## Что реально подключено к runtime

| Область | Текущая реализация | Состояние | Внешний research-кандидат |
|---|---|---|---|
| Диалог и tools | `main.ts` → `executeToolLoop` → registry/MCP | Подключено | Open Interpreter, Pydantic AI — только паттерны contracts/execution |
| Маршрутизация | L0 fast/direct + L1 semantic/regex + L2 LLM в `router.ts` | Подключено | Alice, Stagehand — сравнить паттерны, не заменять |
| Память | SQLite, FTS5, RLM, Pods, graph adapter; M6 manager закрыт (`13e667f`); миграционные тесты БД (`3206003`, 6) + manager 13, store 27, rlm 4 | VERIFIED (Phase 0) | Hermes, opencode-memory, Letta, Graphiti |
| MCP | свой `mcp-adapter.ts`, подключается из `main.ts` | Подключено | MCP TypeScript SDK — нормализовать контракт позже |
| Web tools | search/fetch/download с отдельными handlers (web-tools 43 + интеграция 13) | Подключено | Playwright — детерминированный browser layer |
| GUI automation | Nut.js-oriented handlers и `gui-automation.ts` | Частично; E2E не подтверждён | pywinauto, OmniParser — будущие POC |
| Голос | ASR/TTS adapter, browser fallback, Whisper/Piper конфигурация | Частично | Silero VAD, whisper.cpp, sherpa-onnx |
| Presence | React, Rive, overlay, avatar components | Частично | AIRI, DesktopFriends, Live2D projects |
| Background behavior | life loop, proactive engine, background monitor, attention manager | Подключено, требует продуктовых правил | ActivityWatch, Toolfish |
| Ресурсы | VRAM gate, resource manager, game detection | Подключено | llama.cpp, Glances; vLLM/SGLang не подходят этому ПК сейчас |
| Security | command classifier (88 тестов), protected-file policy, SSRF guard, pending-action confirmations (TTL/origin/one-shot, `03101a3`, 12 тестов), injection-фикстуры web/file/MCP (`88b7619`, 10 тестов) | Критичный пробел закрыт (Phase 0); injection-фикстуры закрыты (Pass 1, P1-2) | PyRIT, 1Password shell plugins |

## Критические факты перед расширением

1. ~~В рабочем дереве есть незакоммиченный M6 memory manager.~~ → **решено 2026-09-15 (Phase 0):**
   закоммичен (`13e667f`), 44 теста менеджера; сравнения памяти с внешними проектами — вход в Pass 2,
   а не повод добавлять ещё одну memory-библиотеку.
2. ~~Подтверждения опасных действий требуют отдельного аудита жизненного цикла token/pending action.~~
   → **решено 2026-09-15 (Phase 0):** pending-action records (TTL 10 мин, origin, одноразовость, `03101a3`).
   Блокировка browser/GUI tool снята; POC только Playwright (Pass 3).
3. Runtime уже содержит много архитектурных модулей. Для каждого внешнего кандидата действует
   правило «adapter или pattern, не второй orchestration core».

## Счётчик фактов (по коду и тестам, срез 2026-09-16)

| Факт | Значение | Источник |
|---|---|---|
| Инструменты | 25 (20 рабочих + 5 GUI e2e) | `electron/tools/index.ts` (25 × `register()`) |
| Тесты vitest | 250/250 (13 файлов) | прогон 2026-09-16: router 6 · tool-loop 2 · code-tools 7+19 · web-tools 43+13 · store 27 · rlm 4 · manager 13 · migration 6 · classifier 88 · confirmation 12 · injection 10 |
| Манифест | 273/273 (0 missing) | `verify-manifest.js`, 2026-09-16; «+1 лишний» = untracked `docs/design/prototype-scene-vNext/` (работа дизайнера, DEC-012) |
| Мёртвый узел | agents/autonomous-loop/skills — по-прежнему NOT WIRED (единственная ссылка на autonomous-loop — `scripts/apply-m4-briefing.mjs`; runtime-импортов нет) | импорт-граф, 2026-09-16 |
| Graphiti | протокол VERIFIED (m3-smoke: initialize + 3 tools); E2E recall не подтверждён — остаётся открытым гэпом №3 | код + smoke-скрипт |

## Пробел → рекомендуемый research-проход

| Приоритет | Пробел | Донор | Результат исследования, не внедрение |
|---|---|---|---|
| P0 | Проверяемая, безопасная память | Hermes, opencode-memory | Матрица WRITE/DREAM/SURFACE, provenance и tests для M6 |
| ~~P0~~ ✅ | Indirect prompt injection | PyRIT | **Закрыто (P1-2, `88b7619`):** `tests/safety/indirect-injection.test.ts` — 10 фикстур (web/file/MCP output → данные, SSRF, protected files, опасные команды, observation-канал) |
| P1 | Детерминированный браузер | Playwright | Изолированный capability contract и permission model |
| P1 | Voice turn detection | Silero VAD | ONNX/local sidecar benchmark на целевом ПК |
| P2 | Уважительный activity context | ActivityWatch | Consent UX, data boundary, API adapter design |
| P2 | Presence/avatar | AIRI, DesktopFriends | State-to-animation contract, без переноса LLM/memory |
| P3 | Долгие задачи | BullMQ/Temporal/LangGraph | Сравнение durable state/retry; пока pattern-only |

## Что сознательно не делать сейчас

- Не подключать одновременно LangGraph, Letta, Mem0, LlamaIndex, Graphiti и несколько memory plugins.
- Не запускать vLLM, SGLang или тяжёлый vision agent на GTX 1650 4 GB VRAM.
- Не собирать activity history без явного opt-in, просмотра и удаления данных.
- Не превращать Stagehand/Browser Use в обход policy engine: browser action — такой же capability,
  как shell command.
- Не копировать код Live2D companion-проектов без отдельной проверки лицензий моделей и ассетов.
