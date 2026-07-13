# AI Module

LLM-провайдеры, эмбеддинги, контекст, инструменты и фоновые процессы.

## Файлы

### `llm.ts` — LLM Communication
- `chatOllama(url, model, messages, tools?, signal?)` — нестриминг
- `chatOllamaStream(url, model, messages, tools?, signal?)` — стриминг
- `chatCloud(url, apiKey, model, messages, tools?, signal?)` — OpenAI-совместимые API
- `extractToolCallsFromContent` — fallback парсинг `<json>` из текста ответа
- Все функции поддерживают `AbortSignal` для остановки генерации

### `config.ts` — Unified Config
- `getLLMConfig()` — модель, URL, API ключи
- `getMemoryConfig()` — лимиты памяти (maxFacts, maxWorkingMessages)
- Хранится в `electron-store`

### `embed.ts` — Embeddings
- `embed(text)` — Float32Array (256-dim)
- Ollama `/api/embed` с fallback на hashing trick
- Hashing trick: char n-grams + word hashing, L2-нормализация

### `intent.ts` — Intent Detection
- `detectIntent(message)` — классификация намерения (weather, code, greeting, file_read, и т.д.)
- `filterToolsByIntent(tools, intent)` — фильтрация инструментов под намерение
- Round 1: только релевантные инструменты. Round 2+: все.

### `tool-loop.ts` — Tool Execution Loop
- `executeToolLoop(model, messages, tools, maxRounds?, signal?)` — цикл вызова LLM → tools → LLM
- До 5 раундов. Поддерживает abort через signal.
- Добавляет результаты tool call'ов в историю сообщений

### `dynamic-prompt/index.ts` — Dynamic Prompt Engine
- `buildDynamicPrompt(userMessage, context?)` — сборка system prompt:
  - BASE_PERSONALITY + адаптации (эмоция, время, режим работы)
  - RAG: факты из памяти + эпизодические диалоги
  - Work context + доступные модули памяти (Pods)
  - Проактивные подсказки

### `proactive.ts` — Proactive Engine
- Фоновый мониторинг: напоминания, предложения, проверка целей
- Срабатывает по триггерам (время, событие, бездействие)

### `work-context.ts` — Work Context
- `getWorkContext()` — активное окно, открытые файлы, процесс
- `formatWorkContextForPrompt(ctx)` — форматирование для промпта

### `code-tools.ts` — Code Analysis Tools
- Чтение файлов, поиск, анализ кода, определение языка

### `web-tools.ts` — Web Tools
- `isUrlSafe(url)` — проверка безопасности URL (localhost/private IP blocker)
- `webSearch(query)` — поиск через API
- `webFetch(url, opts)` — загрузка страниц с rate limit

### `asr.ts` — Automatic Speech Recognition
- Whisper.cpp интеграция
- `transcribe(audioPath)` → текст

### `tts.ts` — Text-to-Speech
- Piper TTS интеграция
- `speak(text)` → аудиофайл

### `mcp-adapter.ts` — MCP Protocol
- Адаптер для Model Context Protocol
- `executeMcpTool(serverName, toolName, args)`

### `goal-tracker.ts` — Goal Tracking
- Отслеживание прогресса по целям пользователя
- Автоматическое обновление статуса

### `skills.ts` — Skills System
- Управление навыками UNA
- Загрузка, активация, выполнение

### `rollback.ts` — Rollback Manager
- Откат изменений при ошибках
- Snapshots состояния перед опасными операциями

### `gui-automation.ts` — GUI Automation
- Управление мышью/клавиатурой через nut-js
- Скриншоты, анализ экрана

### `autonomous-loop.ts` — Autonomous Loop
- Фоновый цикл самостоятельных действий UNA
- Наблюдение → осмысление → действие

### `background-monitor.ts` — Background Monitor
- Мониторинг системных событий (окна, процессы, файлы)

### `resource-manager.ts` — Resource Manager
- Мониторинг GPU (nvidia-smi), CPU, RAM, батареи
- `getResourceState()` — полный снимок системы
- `canRunTask(priority)` — решает, можно ли выполнять задачу сейчас
- `getOptimalContextTokens()` — оптимальный размер контекста под VRAM
- `shouldMaintainMemory()` — пора ли чистить память
- Детекция режимов: gaming, compiling, meeting, idle

### `identity.ts` — Identity Manager
- Структурированная личность UNA: голос, ценности, стиль, границы
- `getIdentity()` / `saveIdentity()` / `resetIdentity()` — CRUD из config
- `buildIdentityPrompt()` — генерация секции личности для system prompt
- Model-agnostic: личность не зависит от текущей LLM
- Версионирование (version field) для плавной эволюции
- Заменяет hardcoded BASE_PERSONALITY

### `states.ts` — Sleep States
- Формализованные состояния жизни UNA: `sleep`, `idle`, `thinking`, `gaming`, `night`, `active`
- `resolveState(resource, hour)` — выбор состояния по ресурсам и времени
- Каждое состояние: свой icon, label, LLM-loaded флаг, частота тиков
- `getStateInstructions()` — секция # Состояние UNA в system prompt
- Интеграция: Life Loop переключает состояние каждый tick, dynamic-prompt (шаг 13)

### `monologue.ts` — Internal Monologue
- Генерация фоновых "мыслей" на основе наблюдений и рефлексий Life Loop
- Типы мыслей: observation, reflection, plan, curiosity
- `generateThought(observations, reflections)` — вызывается каждый tick Life Loop
- `formatThoughtsForPrompt()` — секция # Внутренний монолог в system prompt
- Сохранение ценных мыслей как фактов (category: 'self_review')

### `compression.ts` — Memory Compression
- `compressOldConversations()` — суммаризация старых бесед (>7 дней, без summary)
- `promoteFrequentFacts()` — продвижение часто используемых фактов в 'preference'
- `demoteStaleFacts()` — удаление неиспользуемых фактов (>30 дней, <3 использований)
- `runMaintenance()` — полный цикл обслуживания (запускается Life Loop раз в час)

### `modes.ts` — Execution Modes (Multi-Agent)
- **Одна личность UNA, разные контексты выполнения**
- 6 режимов: `code`, `research`, `creative`, `chat`, `system`, `default`
- Каждый режим: свой набор инструментов + инструкции + бюджет контекста
- `resolveMode(intent)` → автоматчиеский выбор режима по намерению
- `filterToolsByMode()` — фильтрация инструментов под режим (заменяет intent-based filtering)
- `getModeInstructions()` — секция # Режим работы в system prompt
- Ручное переключение: IPC `modes:set`
- Интеграция: tool-loop (round 1 использует режим), dynamic-prompt (шаг 2.1)

### `meta-learning.ts` — Meta Learning
- Обучение на паттернах взаимодействия: исправления, предпочтения, повторяющиеся ошибки
- `detectCorrection()` — распознаёт, когда пользователь исправляет UNA
- `learnFromMessage()` — извлекает предпочтения (кратко/подробно, минимум инструментов)
- `getMetaInstructions()` — секция # Мета-обучение в system prompt
- Источники: self-review (повторяющиеся слабости), corrections (частота исправлений), preferences (предпочтения)
- Интеграция: tool-loop (после каждого ответа), dynamic-prompt (шаг 12)

### `world-model.ts` — World Model
- Модель окружения пользователя: время, часовой пояс, OS, аптайм, день недели
- Объединяет work-context (git, файлы, сессия) + system info в единую картину
- `buildWorldState()` — собирает полный срез окружения
- `formatWorldStateForPrompt()` — секция # Модель мира в system prompt
- IPC handler: `world:state`
- Интеграция: динамический промпт (шаг 11)

### `self-review.ts` — Self Review
- Автоматическая рефлексия каждого ответа после генерации (в tool-loop.ts)
- 7 правил проверки: длина ответа, использование инструментов, ошибки, тон, <think>, структура, прямой ответ
- Оценка 1-5 по совокупности проверок
- Сохранение ревью как факта (category: 'self_review') — persistent
- `formatReviewForPrompt()` — секция # Саморефлексия в system prompt (средняя оценка, слабости, уроки)
- `runDeepReview()` — глубокий анализ всех сохранённых ревью (вызывается Life Loop раз в ~10 мин)
- IPC handlers: `review:recent`, `review:summary`, `review:deep`, `review:clear`

### `executive.ts` — Executive Manager
- Оркестрация многошаговых целей: создание, прогресс, завершение
- goals таблица в SQLite (persistent) — создаётся при initMemory()
- `createGoal(description, subgoals[])` → авторазбивка на подшаги
- `updateSubgoalStatus()`, `interruptGoal()`, `resumeGoal()`, `completeGoal()`, `cancelGoal()`
- `formatGoalsForPrompt()` — генерация секции # Текущие цели в system prompt
- `parseGoalToken()` — парсинг [GOAL] create / done / cancel из ответа модели
- Интеграция: goals в dynamic-prompt (шаг 9), Life Loop проверяет активные цели
- UI: IPC handlers `exec:*` для создания и отслеживания целей из renderer

### `attention-manager.ts` — Attention Manager
- Определяет состояние внимания: chatting, deep_focus, gaming, meeting, idle
- `recordInteraction()` — отмечает активность пользователя
- `getAttentionState()` — фокус, interruptible, responseUrgency, allowProactive
- `setDoNotDisturb()` / `getDoNotDisturb()` — DnD режим
- Burst detection: если пользователь пишет часто — `chatting` (быстрый ответ)
- Интегрирован с Resource Manager (активность) и main.ts (IPC handlers)

### `life-loop.ts` — Life Loop (фоновая когниция)
- Цикл: Observe → Reflect → Update Memory → Plan → Wait
- Тик каждые 30 секунд
- Накапливает idle-тики для отсроченных задач
- Координируется с Resource Manager — не мешает играм/компиляции
- `getLifeLoopStats()` — статистика циклов для UI

## Принципы
1. **Model-agnostic** — все провайдеры через единый интерфейс
2. **Graceful degradation** — fallback при отказе любого компонента
3. **Safety first** — URL filter, command safety, abort support
4. **Minimal prompts** — Intent Detector фильтрует инструменты, Dynamic Prompt собирает только нужное
