# TASK-003: Приёмочные тесты electron/ai/states.ts + electron/ai/modes.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-003-states-modes-tests` (stacked на TASK-002)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение; расхождение → отчёт, не правка кода.
- **Источник:** implementation-map пробел №5. Мандат разрешает объединение identity/modes/states/monologue
  «только если они образуют один тестируемый контракт». Объединяются ТОЛЬКО states+modes.

## Обоснование объединения (ровно одна контрактная семья)

Оба модуля — чистые статичные реестры с идентичной формой контракта:
`REGISTRY` + `resolve*(вход) → ключ` + `get*Config(ключ?) → конфиг` + `set/getCurrent*` +
`*Instructions(ключ?) → prompt-строка` + `list*() → каталог`. Без внешних зависимостей
(импорты — type-only, элидируются). identity (store-persisted) и monologue (stateful RNG-генератор) —
другие семьи, идут отдельными задачами.

## Observable contract (по коду @ b6313e2)

### states.ts
- `resolveState(resource, hour)`: gaming-activity → `gaming` (высший приоритет, в т.ч. ночью);
  `idle && cpu<10 && ts>15мин` → `sleep`; `idle && cpu<10 && свежий ts` → `idle` (ранний return —
  ночная проверка НЕ достигается, зафиксировано как текущее поведение);
  hour∈[0..5]∪[22..23] && (activity=idle || cpu<15) → `night`;
  active/compiling/meeting → `active`; прочее → `active`.
- `setState/getCurrentState`: дефолт `idle`; roundtrip; `getStateConfig()` без аргумента — текущее.
- `getStateConfig(unknown)` → fallback `active`. `getStateLabel` = `icon + ' ' + label`.
- `getStateInstructions` = `\n\n# Состояние UNA: …`. `listStates()` = 6 записей.

### modes.ts
- `resolveMode(intent)`: weather/news/web_search→research; file_*/code→code; system/screen/gui→system;
  memory→default; greeting→chat; unknown→default; обновляет currentMode.
- `getModeConfig(mode?)`: реестр; fallback `default`. `setMode/getCurrentMode` roundtrip.
- `filterToolsByMode(tools, mode)`: allowedTools=[] (chat) → всегда []; фильтр по function.name;
  неизвестные имена отбрасываются.
- `getModeInstructions`: пустые instructions (default) → ''; иначе `\n\n# Режим работы: …`.
- `listModes()` = 6 режимов.

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest sync/verify 0/0. Прод-код не меняется.
