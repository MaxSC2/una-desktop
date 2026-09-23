# TASK-006: Приёмочные тесты electron/ai/world-model.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-006-world-model-tests` (stacked на TASK-005)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (world-model).

## Observable contract (по коду @ 7c03348)

- Модульное состояние: `sessionId = session_${Date.now()}`, `sessionStart = ISO`, `messageCount = 0`.
- `incrementMessageCount()` — +1; `resetSession()` — новый id/start, count=0.
- `buildWorldState()`:
  - `getWorkContext()` бросает → `workContext=null` (поглощено).
  - `knownPatterns`: isLongSession → «долгая рабочая сессия»; gitRepos>0 → «активные репозитории: …» (значение — `os.hostname` в map — зафиксированный баг-поведение).
  - dayOfWeek из русского массива по `getDay()`; uptimeHours = round(uptime/3600).
- `formatWorldStateForPrompt(state)`:
  - всегда: «# Модель мира», Время, Часовой пояс, Система.
  - uptimeHours>1 → «Время работы ПК: ~Nч»; ≤1 → строки нет.
  - workContext: activeProjects>0 → «Проекты:» (slice 0..5); workDuration>10 → «Сессия: Xч Yм»; dirty repos>0 → «Git: N репозиториев…».
  - messageCount>5 → «Сообщений в сессии: N»; ≤5 → нет.
  - knownPatterns>0 → «Замечено: …».

## Изоляция

Моки: `./work-context` (getWorkContext), `./config` (getConfig). `os` не мокаем (значения присутствия, не точные). `vi.resetModules()` на тест для sessionId/messageCount. Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
