# Рекомендации и объяснения по U.N.A. (UNA Desktop)

Документ предназначен для быстрого понимания архитектуры и практических советов по развитию/отладке проекта: Electron (main) + React (renderer), unified tool-calling, memory, safety и proactive-движок.

---

## 1) Архитектурная карта (как всё связано)

### Renderer (UI)
- Точка входа: `src/main.tsx`
- Главный layout: `src/App.tsx`
- IPC клиент: `src/hooks/useUNA.ts`
  - `sendMessage()` → `window.una.chat.send()` (non-stream)
  - `sendMessageStream()` → `window.una.chat.stream()` + подписки на:
    - `chat:chunk`
    - `chat:stream-end`
    - `chat:stream-error`
- Подтверждение dangerous операций: `src/components/ConfirmationDialog.tsx`
  - отображается при `pendingConfirmation` в Zustand

### Preload (security boundary)
- `electron/preload.ts`
  - экспортирует строго ограниченное API в `window.una` через `contextBridge.exposeInMainWorld`
  - `on()` принимает только whitelisted каналы событий:
    - `overlay:start-listening`
    - `chat:chunk`
    - `chat:stream-end`
    - `chat:stream-error`

### Main (orchestration)
- `electron/main.ts`
  - создаёт окна:
    - mainWindow (UI)
    - overlayWindow (transparent, alwaysOnTop)
  - реализует IPC handlers:
    - `chat:send`, `chat:stream`, `chat:confirm`
    - `asr:transcribe`, `tts:synthesize`
    - `files:list`, `config:get,set`, `ollama:check`, `system:info`
    - onboarding + UI memory (list/delete facts)
  - стартует фоновые движки:
    - `initMemory()`
    - `startBackgroundMonitor()`
    - `startProactiveEngine()`

### “Единый цикл” tool-calling
- `electron/ai/tool-loop.ts`
  - единая точка, где:
    1) строится prompt (system + context + user)
    2) модель может запросить `tool_calls`
    3) tool_calls исполняются
    4) результаты возвращаются в модель (через сообщения)
    5) при опасных действиях вызывается подтверждение
    6) post-processing: парсинг скрытых `[MEM]` токенов

---

## 2) Рекомендации по tool-calling и потокам (stream)

### 2.1. О чём помнить при streaming
- В renderer обновление текста идёт по `chat:chunk`:
  - type `text` → `appendToMessage(placeholderId, delta)`
  - status переключается на `executing` при `tool_start` и обратно при tool_* событиях
- В main:
  - `chat:stream` отправляет chunks через `sender.send('chat:chunk', ...)`
  - финал приходит через `chat:stream-end`

**Рекомендация:** при отладке “гонок” проверьте, что:
- `useUNA.ts` корректно отписывается от подписок в `finally`
- не происходит двойной `setStatus('idle')` раньше `stream-end`

### 2.2. Парсинг tool_calls
- `electron/ai/llm.ts` нормализует tool_calls из формата ollama/cloud.
- fallback: `extractToolCallsFromContent()` парсит `<json>...</json>`.

**Рекомендация:** добавьте телеметрию/логирование на случай:
- JSON внутри `<json>` парсится ошибочно
- tool_calls пустые, но модель “ожидала” инструменты

---

## 3) Safety: как модель должна безопасно работать

### 3.1. Потоки безопасности
- Safety классифицирует shell команду:
  - `forbidden` → блокируется
  - `dangerous` → требует подтверждения токеном
- UI показывает confirmation-модалку при `pendingConfirmation`.

### 3.2. Важный момент по safety
`electron/ai/dynamic-prompt/index.ts` требует от модели “вызвать request_confirmation перед опасной операцией”.

**Однако:** реальная фактическая гарантия идёт от серверной части:
- `electron/tools/index.ts` всё равно проверяет:
  - `classifyCommand()`
  - `needs_confirmation` и `confirmedTokens`

**Рекомендация:** не полагайтесь только на промпт.
- Любой dangerous tool должен возвращать `needs_confirmation` независимо от текста системы.

---

## 4) Memory (память): COLD/WARM/HOT и `[MEM]` токены

### 4.1. COLD (SQLite)
- `electron/memory/store.ts`
  - facts: семантические факты + embedding BLOB
  - messages: episodic история
  - emotions: эмоциональная память

Embedding реализован “хэш эвристикой”, без тяжёлых ML зависимостей.

### 4.2. HOT (prompt-time context)
- `electron/memory/rlm.ts`
  - `buildHotContext()`:
    - сжимает system prompt
    - делает semantic recall фактов
    - выбирает subset recent messages под лимит
    - добавляет work/emotion контекст
- `buildMessagesFromHot()`:
  - собирает систему + facts + recentMessages + enhanced userMessage

### 4.3. `[MEM]` токены
- `parseMemoryTokens()` и `executeMemoryTokens()`
- Набор действий: `save/recall/forget/set_importance/load_context/summarize`

**Рекомендация (важно):**
В `rlm.ts` есть несколько частично реализованных/placeholder действий:
- `forget`
- `set_importance`
- возможно часть логики `load_context/summarize`

Если вы планируете наращивать качество памяти — стоит довести эти ветки до “полностью рабочей” реализации (через недостающие функции в `store.ts`).

---

## 5) Dynamic Prompt Engine (RAG + адаптации)

- `electron/ai/dynamic-prompt/index.ts`
  - определяет `emotion`, `timeOfDay`, `workMode`
  - добавляет адаптации personality
  - делает RAG:
    - facts: `recallFacts(userMessage, 5)`
    - episodic: `searchEpisodic(userMessage, 3)`
  - добавляет work context: `getWorkContext()`
  - добавляет proactive подсказки (как текст в prompt)

**Рекомендация:** при жалобах “ассистент игнорирует контекст” проверьте:
- размер и качество фактов/episodic подстановок
- не “затирается” ли HOT context memory системой в `tool-loop` (там system prompt тоже строится отдельно)

---

## 6) Proactive engine (уведомления “сама инициирует”)

- `electron/ai/proactive.ts`
  - каждые 10 минут проверяет контекст
  - предлагает:
    - break (при долгой сессии)
    - git reminder (много незакоммиченных)
    - mood check (много sad эмоций)
    - memory_recall (долго не общались)
  - доставляет предложение через `Notification`

**Рекомендации:**
- Убедиться, что обработчик клика Notification реально конвертирует событие в сообщение в чат (в проекте ожидается `proactive:suggestion`, но нужно проверить связанный listener в renderer).
- Следить за лимитами частоты и `ignoredCount` (чтобы не “спамить”).

---

## 7) Практический чеклист отладки (быстро найти проблему)

### Если “ассистент молчит”
- проверить, не сработало ли:
  - tool-loop max rounds hit
  - empty response fallback в `tool-loop.ts`
- проверить, что LLM provider вернул `content` или tool_calls

### Если “tool calls не исполняются”
- проверить:
  - `TOOL_DEFINITIONS` доступен модели
  - корректно ли парсятся `arguments` (JSON.parse)
  - `dispatchTool()` не вернул “unknown tool”
  - при необходимости confirm token реально добавляется через `chat:confirm`

### Если “memory не сохраняется”
- проверить:
  - model реально добавляет скрытые `[MEM] ...` в конце
  - `parseMemoryTokens()` матчится вашим форматом
  - `executeMemoryTokens()` вызывает `saveFact()` (оно реально реализовано)

---

## 8) Что сделать дальше (приоритеты улучшений)

1) Довести `forget`, `set_importance` и часть token actions в `electron/memory/rlm.ts` до полной работоспособности (нужны реальные store-функции).
2) Добавить тесты на tool-loop:
   - сценарий: tool возвращает `needs_confirmation`
   - сценарий: битый JSON arguments
   - сценарий: screenshot/analyze_screen (mock)
3) Добавить e2e/интеграционные проверки UI flow:
   - подтверждение dangerous операций
   - поведение статуса `thinking/executing/awaiting_confirmation/idle`
4) Провести нагрузочную проверку “больших” сообщений/файлов:
   - read_file max_bytes truncation
   - stream chunk sizes

---

## 9) Полезные ссылки по коду
- Tool loop: `electron/ai/tool-loop.ts`
- Tools + safety: `electron/tools/index.ts` и `electron/safety/classifier.ts`
- LLM provider: `electron/ai/llm.ts`
- RLM memory: `electron/memory/rlm.ts`
- SQLite store: `electron/memory/store.ts`
- Dynamic prompt: `electron/ai/dynamic-prompt/index.ts`
- Work context: `electron/ai/work-context.ts`
- Proactive: `electron/ai/proactive.ts`
