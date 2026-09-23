# TASK-010: Приёмочные тесты electron/ai/proactive.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-010-proactive-tests` (stacked на TASK-009)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (proactive).

## Observable contract (по коду @ 1665376)

- `startProactiveEngine(getMainWindow)`: повтор — no-op; `enabled=false` → выход; интервал clamp(checkIntervalMinutes, 10, 1, 1440).
- `stopProactiveEngine()` — clearInterval.
- `checkAndSuggest` (через forceSuggest / таймер):
  - disabled → выход; sinceLast < minSuggestionInterval (clamp 30 мин) → пропуск.
  - ignoredCount >= maxIgnored → тишина quietHoursAfterIgnored, затем сброс.
  - resource-gate: state && !canRunTask('background', state) → пропуск; state=null → продолжаем.
  - evaluateContext приоритеты: break (isLongSession) > git_reminder (uncommitted>15, не повторяется подряд) > mood_check (sad>=3 сегодня, не повторяется) > memory_recall (lastEmotion старше 4ч, не повторяется) > null.
  - успех → deliverSuggestion (Notification, silent при low), lastSuggestionTime/Type обновляются.
- `userResponded()` — сброс ignoredCount.
- `forceSuggest()` — сброс таймера и ignoredCount, вызов checkAndSuggest.

## Изоляция

Моки: `electron` (Notification — hoisted-реестр инстансов), `./work-context`, `../memory/store` (getLastEmotion/getEmotionSummary), `./config` (getProactiveConfig), `./resource-manager` (getLastResourceState/canRunTask). `vi.resetModules()` на тест. Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
