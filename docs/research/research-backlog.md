# Backlog исследования

Это порядок проверки гипотез. Он не является roadmap реализации.

## Pass 1 — Foundation audit

**Цель:** превратить текущие идеи M6 memory и safety в проверяемые contracts.

- Проверить M6 storage migration: новая БД, старая БД, повторный старт, FTS triggers, rollback.
- Описать pending-action record: идентификатор, digest действия, TTL, origin, одноразовое подтверждение.
- Построить PyRIT-inspired test corpus для indirect injection из `web_fetch`, `read_file`, `web_search`
  и MCP results.
- Метрика выхода: TypeScript, unit/integration tests и production build зелёные без пропуска suites.

## Pass 2 — Memory/context comparison

Кандидаты: Hermes, opencode-memory, Magic Context, Letta, Mem0, Graphiti, AIRI Alaya.

| Вопрос | Что искать | Артефакт |
|---|---|---|
| WRITE | scoring, dedupe, provenance, user review | таблица write policies |
| DREAM | idle-only consolidation, idempotence, no data loss | lifecycle/state diagram |
| SURFACE | relevance gate, token budget, source labels | retrieval evaluation cases |
| Context | memory ≠ transcript ≠ prompt cache | composer contract |
| Forget | soft delete, retention and undo | data lifecycle policy |

## Pass 3 — Browser and desktop capabilities

Кандидаты: Playwright, Stagehand, Browser Use, Skyvern, pywinauto, OmniParser.

Сначала сравнить contracts, а не APIs:

```text
intent -> policy -> permission -> deterministic action -> result -> verification -> audit log
```

POC разрешён только для Playwright; Stagehand сравнивается после того, как deterministic path уже
работает. GUI and vision automation не получают доступ к credentials и destructive actions без
отдельного product decision.

## Pass 4 — Voice, presence and activity

- Silero VAD: local benchmark, end-of-turn accuracy, CPU, idle battery cost.
- whisper.cpp / sherpa-onnx: compare startup, Russian ASR quality and packaging burden.
- AIRI/DesktopFriends: extract a state-to-animation interface, not avatar assets or LLM core.
- ActivityWatch: draft consent screen, allowlist and retention before adapter research.

## Pass 5 — Long-running work

Кандидаты: BullMQ, Temporal, Prefect, LangGraph, OpenHands, Cloudflare Agents.

Проверять только после появления реального пользовательского сценария, который не решается
существующими reminders/life-loop. Для ПК-помощника на одной машине первым сравнением должен быть
минимальный встроенный queue, а не отдельный server stack.

## Definition of done для записи каталога

Запись становится `ASSESSED`, когда у неё есть: конкретный UNA gap, upstream URL + tag, license,
resource estimate, security impact, smallest POC, adoption decision и причина отказа/принятия.
