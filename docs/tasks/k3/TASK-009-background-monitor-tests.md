# TASK-009: Приёмочные тесты electron/ai/background-monitor.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-009-background-monitor-tests` (stacked на TASK-008)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (background-monitor).

## Observable contract (по коду @ 8b7675a)

- `startBackgroundMonitor()`: повторный вызов — no-op; `backgroundMonitorEnabled=false` → лог и выход; интервал = clamp(cfg, fallback 5, min 1, max 1440) минут; setInterval → collectSnapshot.
- `stopBackgroundMonitor()`: clearInterval; isRunning=false.
- `collectSnapshot()` (через forceSnapshot): disabled → ранний выход (snapshot не трогаем); успех → lastSnapshot=ctx, monitorCount++, updateActivity(); каждые `backgroundSaveEveryChecks` (clamp 1..288) → saveSnapshotToMemory; исключение → console.warn, счётчик не растёт.
- `saveSnapshotToMemory`: activeProjects>0 → saveFact('project', 'Активные проекты: …'); isLongSession → saveFact('task', 'Долгая сессия: N часов…'); repo.uncommittedCount>5 → saveFact('task', '<basename>: N незакоммиченных файлов'); ошибки saveFact глотаются.
- `getMonitorStats()`: {isRunning, checksPerformed, lastSnapshotTime: lastSnapshot ? new Date() : null}.

## Изоляция

Моки: `./work-context` (getWorkContext, updateActivity), `../memory/store` (saveFact), `./config` (getProactiveConfig). Fake timers для интервала. `vi.resetModules()` на тест + stopBackgroundMonitor в afterEach. Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
