# TASK-008: Приёмочные тесты electron/ai/identity.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-008-identity-tests` (stacked на TASK-007)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (identity).

## Observable contract (по коду @ e24e8a3)

- DEFAULT_IDENTITY: version 1, name 'U.N.A.', title, voice{female,formal,4 tone,sarcastic}, 10 values, 5 style, 5 boundaries, 6 traits.
- `getIdentity()` — копия текущей (shallow).
- `loadIdentity()`: store.get('unaIdentity'); saved && saved.version===current.version → merge с дефолтом; иначе текущая.
- `saveIdentity(patch)`: merge в current + store.set('unaIdentity', merged).
- `resetIdentity()`: дефолт + persist.
- `buildIdentityPrompt(id?)`: «# Личность», имя, пол (female→женский/neutral→нейтральный), тон (если непустой), юмор (none→нет строки; light/sarcastic/all — свои строки), формальность (informal→«ты», иначе «вы»), секции Ценности/Стиль/Границы при непустых массивах.
- Персистентность через перезагрузку модуля: общий стор + loadIdentity восстанавливает сохранённое при совпадении version.

## Изоляция

Мок `./config` с in-memory Map через `vi.hoisted`. `vi.resetModules()` на тест. Прод-код не меняется.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
