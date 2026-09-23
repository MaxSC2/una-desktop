# TASK-005: Приёмочные тесты electron/ai/monologue.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-005-monologue-tests` (stacked на TASK-004)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (monologue — отдельная контрактная семья: stateful генератор мыслей).

## Observable contract (по коду @ 7f2044b)

- `generateThought(observations, reflections, context?)`:
  - кандидаты: obs с 'battery' → мысль о батарее; 'idle' → об обслуживании; 'performance' → об экономии;
    refs с 'stale' → о чистке фактов; 'self-review'/'self_review' → об оценках ('avg' → «лучше», иначе «требуют улучшения»);
    context.hour∈[22..5] → ночная; context.sessionLength>120 → о перерыве;
    пустые obs+refs → «Всё тихо…».
  - нет кандидатов → null.
  - выбор случайный (weighted к поздним): при >1 кандидате assert membership в множестве кандидатов.
  - type: `observations.length > reflections.length ? 'observation' : 'reflection'` (curiosity-мысль при 0/0 → 'reflection' — зафиксировано).
  - мысль unshift в буфер, кап MAX_THOUGHTS=20.
  - persist: type reflection|curiosity → `saveFact('self_review', JSON)`; ошибки глотаются.
- `getRecentThoughts(limit=5)` — slice буфера.
- `formatThoughtsForPrompt`: пусто → ''; иначе блок «# Внутренний монолог» (≤3 мыслей, «только что»/«Nm назад»/«Nч назад»).
- `clearThoughts()` — сброс.

## Изоляция

- Мок `../memory/store` (saveFact). RNG не мокается — membership-asserts.
- `vi.resetModules()` на тест (буфер мыслей). Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
