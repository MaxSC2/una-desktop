# Дневник практики — UNA Desktop

## 2026-07-09 — Documentation + Manifesto (по совету GPT)

### Что сделано
- **UNA_MANIFEST.md** — 10 философских принципов проекта (память важнее модели, личность важнее памяти, доверие важнее скорости и т.д.)
- **electron/memory/README.md** — документация модуля памяти: store.ts, rlm.ts, pods.ts, схема БД
- **electron/ai/README.md** — документация AI модуля: все 18 файлов с описанием ответственности
- **docs/MEMORY.md** — обновлён: RLM + Memory Pods, новая схема БД, контекст для LLM

## 2026-07-09 — Life Loop + Resource Manager

### Что сделано
- **resource-manager.ts** — мониторинг GPU (nvidia-smi), CPU, RAM, батареи; `canRunTask()`, `getOptimalContextTokens()`, `shouldMaintainMemory()`, `detectActivityByProcesses()` (gaming/compiling/meeting/idle)
- **life-loop.ts** — фоновый цикл когниции: Observe → Reflect → Update Memory → Plan → Wait. Тик каждые 30 секунд, idle-детекция, deferred maintenance
- **Интеграция** — Life Loop стартует в `main.ts` вместе с Background Monitor и Proactive Engine, останавливается в `before-quit`
- **IPC handlers** — `life-loop:stats` и `resource:state` для будущего UI
- **Config** — `ResourceManagerConfig` с полями `unloadOnGaming`, `throttleOnBattery`, `maintenanceDuringIdle`

## 2026-07-09 — Memory Pods Phase 1

### Что сделано
- Создана архитектура **Modular Memory Pods** — тематические контейнеры памяти
- **pods.ts** — Memory Director с keyword-based классификацией (`classifyToPod`) и поиском релевантных подов (`findRelevantPods`)
- **store.ts** — `memory_pods` таблица SQLite, `ALTER TABLE facts ADD COLUMN pod_id` миграция, seed 6 подов (profile, project, preference, emotion, work, general), CRUD функции
- **rlm.ts** — `activePods` в HotContext, pod-контекст в `buildMessagesFromHot`, MEM токены `create_pod` и `switch_pod`, документация подов в `getMemoryInstructions`
- **dynamic-prompt/index.ts** — секция `# Доступные модули памяти` в system prompt

### Результаты
- TypeScript: 0 errors
- Build: 3120 modules, 0 errors
- Tests: 202/203 pass (1 pre-existing false-positive unchanged)

### Следующие шаги
- Phase 2: Pod-filtered recall — вызывать `recallFacts(query, limit, podId)` для каждого активного пода
- Phase 3: Embedding pod summaries для similarity-based выбора подов вместо keyword matching
- Phase 4: UI для Memory Pods — просмотр и управление подами из приложения
