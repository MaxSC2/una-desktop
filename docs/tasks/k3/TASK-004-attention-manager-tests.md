# TASK-004: Приёмочные тесты electron/ai/attention-manager.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-004-attention-manager-tests` (stacked на TASK-003)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5.

## Observable contract (по коду @ d225a09)

- `setDoNotDisturb/getDoNotDisturb` roundtrip; DnD проверяется ПЕРВЫМ (перекрывает gaming/meeting).
- `getAttentionState(state?)` — детерминированный автомат фокуса:
  - dnD → deep_focus / не прерываем / deferred / без proactive / без звука;
  - gaming → gaming / deferred / тишина; meeting → meeting / deferred / тишина;
  - compiling → deep_focus / deferred / звук ON;
  - <1 мин с последнего взаимодействия + burst → chatting / immediate;
  - <5 мин → light_work / normal / proactive / звук ON; <30 мин → light_work / звук OFF;
  - иначе → idle / deferred.
- `recordInteraction`: сдвигает lastInteractionTime; burst = ≥3 метки, средний зазор последних ≤5 <30 с.
- `sessionAttentionScore`: burst&<1мин → 1.0; <5 → 0.8; <15 → 0.5; <60 → 0.3; иначе 0.1.
- `maxContextTokens`: без state → 4096; gpu vram>3000 → 8192; >1500 → 4096; ≤1500 → 2048;
  без gpu: ram>80 → 2048, иначе 4096.
- `getLastFocus` — последний вычисленный фокус.

## Изоляция

- Мок `./config` (импортируется, но по коду не используется — грузим безопасно).
- Время — `vi.useFakeTimers()` + `setSystemTime`; `vi.resetModules()` на тест.
- `getLastResourceState` не задействуется: state передаётся явно. Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
