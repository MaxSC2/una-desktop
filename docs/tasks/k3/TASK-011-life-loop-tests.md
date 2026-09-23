# TASK-011: Приёмочные тесты electron/ai/life-loop.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-011-life-loop-tests` (stacked на TASK-010)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (life-loop).

## Observable contract (по коду @ 1382923)

- `startLifeLoop(getMainWindow)`: повтор — no-op; tickCount=0; немедленный tick + setInterval(config.tickIntervalMs, default 30s).
- `tick()`: tickCount++; resource=getResourceState(); unaState=resolveState(resource, hour) → setState; idle tracking (activity==='idle' → consecutiveIdleTicks++, иначе 0); lastActivity. Фазы: observe (config && stateCfg.observeEnabled), reflect (config.reflectEnabled; внутри canRunTask('maintenance')), updateMemory (config && stateCfg.memoryMaintenance && canRunTask), plan (config && stateCfg.proactive). Затем generateThought(obs, refl, {hour, sessionLength: idle*0.5}) → thoughts. Night/idle maintenance: canRunTask && >60 мин с прошлого → runMaintenance, ненулевой результат → memoryUpdate. Ошибки → warn, cycle.phase='wait', durationMs, currentCycle сохраняется.
- observe: `UNA state: X`; perfAdvice join('; '); idle==1 → 'User went idle…'; idle>3 && %6==0 → '~N minutes'; battery → 'Battery: X%'; shouldMaintainMemory → 'System idle…'.
- reflect: night || (idle>5 && %12==0): stale facts (>30д, use_count<3) >5 → 'Found N potentially stale facts…'. idle>3 && tick%20==0: self-review summary при totalReviews>0 (+topWeakness).
- updateMemory: shouldMaintainMemory обязателен; night || (idle>3 && %6==0): 'Context tokens optimized to N…'; dirty repos (uncommitted>0) → 'Dirty repos: <basename(\\-split)>: N, …'.
- plan: gaming → ранний выход; батарея <15% → 'Critical battery…' + return; idle>10 → 'Deep idle…'; idle>3 && %6==0 && незавершённые цели → 'Active goals: N goal(s) in progress'.
- `getLifeLoopStats()`: {isRunning, ticks, consecutiveIdleTicks, lastActivity, lastCycle, currentState}.

## Изоляция

Моки всех 8 зависимостей (resource-manager, memory/store, work-context, executive, self-review, states, monologue, compression). Fake timers + `configureLifeLoop({tickIntervalMs: 100})`; немедленный tick флашится через `advanceTimersByTimeAsync(0)`. `vi.resetModules()` на тест (tickCount/idle/config — module state). Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
