# TASK-002: Приёмочные тесты electron/ai/resource-manager.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-002-resource-manager-tests` (stacked на `k3/task-001-compression-tests`)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение; расхождение → отчёт, не правка кода.
- **Источник:** implementation-map пробел №5 (resource-manager — следующий после compression).

## Целевой модуль

`electron/ai/resource-manager.ts` — снимок ресурсов ПК и решения «можно ли запускать фоновую работу».

## Observable contract (зафиксирован по коду @ e7b527a)

### Чистые decision-функции (explicit `state` — без моков module state)
- `canRunTask(task, state?)`: `critical` → всегда true; нет state → true; `gaming` → false (кроме critical);
  `compiling` → false для всего, кроме `background`; `onBattery && battery<20 && deferrable` → false;
  `cpu>90 && maintenance` → false; `ram>90 && deferrable` → false; иначе true.
- `getOptimalContextTokens(state?)`: provider `cloud` → 24576; нет state/нет gpu → 4096;
  vram>3000 → 8192; vram>1500 → 4096; иначе 2048.
- `shouldMaintainMemory(state?)`: нет state → false; `activity==='idle' && canRunTask('maintenance')`.
- `getPerformanceAdvice(state?)`: нет state → []; ram>85 → совет; gpu vram<500 → совет;
  battery<30 onBattery → совет.

### Детекция активности (мок child_process.execSync)
- `detectActivityByProcesses(cpu)`: парсинг `name|hasWindow`; windowed game → `gaming` (приоритет над meeting —
  регрессия VRAM-gate); headless game-процесс ≠ gaming; windowed meeting-app → `meeting`;
  compile-процесс + cpu>80 → `compiling`; throw → `active`.

### Внешние пробники (мок child_process.exec через promisify)
- `detectGpu()`: stdout непустой → true; throw → false (кэш 5 мин — изоляция через resetModules).
- `getGpuInfo()`: нет GPU → null; CSV `total, free, driver` → объект; `parts<3` → null; нечисла → 0.
- `getBatteryStatus()`: процент + status!==2 → onBattery; status===2 → сеть; не-число → `{true, null}`; throw → `{false, null}`.

### Агрегатор
- `getResourceState()`: структура ResourceState; первый вызов cpuPercent=0 (нет дельты);
  TTL-кэш 45 с — повторный вызов возвращает тот же объект без новых процессов.

## Изоляция

- Моки: `child_process` (exec/execSync), `./config` (getConfig/getConfigStore).
- `vi.resetModules()` + dynamic import в каждом тесте (detectGpu-кэш, lastState).
- БД не используется. Прод-код не меняется.

## Acceptance

- targeted vitest зелёный; полный набор зелёный; tsc electron/root 0; manifest sync/verify 0/0.
