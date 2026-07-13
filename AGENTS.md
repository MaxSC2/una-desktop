# AGENTS.md — Памятка для ИИ-кодеров

> ⚠️ **ВАЖНО:** Этот файл содержит все ручные правки, которые не отражены в git.
> Если ты новый ИИ-кодер и открываешь свежий архив проекта — **ОБЯЗАТЕЛЬНО прочитай раздел
> "Что добавить в новом архиве"** внизу и примени все изменения перед любой работой с кодом.

## Стек
- Electron 33 + React 19 + TypeScript 5.6 + Vite 5.4
- Сборка: `npm run build` (tsc + vite), дев: `npm run dev`
- База: better-sqlite3, конфиг: electron-store

## Модель
- **Текущая:** Qwen 3 4B (`qwen3:4b`, ~2.5 GB)
- **Предыдущая:** Qwen 2.5 3B — удалена (слабое function calling)
- **Запасная:** Qwen 3 4B (`qwen3:4b`, 2.5 GB) — нативное function calling
- Ollama на localhost:11434, GPU: GTX 1650 (4GB VRAM)

## Сделанные правки (важные)

### 1. SSE парсинг — llm.ts
- Ollama stream: добавлен `strip data: ` prefix перед JSON.parse
- Оригинал работал с raw JSON, но Ollama шлёт SSE `data: {...}`

### 2. Status race condition — src/hooks/useUNA.ts
- В `finally` добавлена проверка: если `chat:stream-end` уже пришёл, не сбрасывать статус
- Исправляет зависание на "размышляет"

### 3. Tool calling — electron/ai/dynamic-prompt/index.ts (BASE_PERSONALITY)
- Добавлены `web_search`, `web_fetch`, `web_download` в список инструментов
- Добавлена инструкция: "ОБЯЗАТЕЛЬНО вызывай web_search для погоды/новостей"
- Qwen 2.5 3B без явного упоминания в промпте не вызывал tools

### 4. Duplicate user message — electron/main.ts
- `getRecentMessages` возвращал только что сохранённое user сообщение
- Потом `buildMessagesFromHot` добавлял его ещё раз
- Потом `executeToolLoop` добавлял в третий раз
- Фикс: `recent = allRecent.slice(0, -1)` — убираем последнее из recent
- Фикс: `rlmMessages.slice(1, -1)` — убираем system prompt И user (executeToolLoop добавит сам)
- Применено для обоих IPC хендлеров: `chat:send` и `chat:stream`

### 5. tool_choice — electron/ai/llm.ts
- Добавлен `body.tool_choice = 'auto'` для Ollama (функции `chatOllama` и `chatOllamaStream`)
- Без этого модель могла игнорировать инструменты

### 6. Fallback парсинг tool calls — electron/ai/llm.ts
- Функция `extractToolCallsFromContent`: парсит `<json>{...}</json>` из текста ответа
- Qwen 2.5 3B иногда писал tool call текстом вместо API tool_calls
- Добавлен в оба пути: `chatOllama` (non-streaming) и `chatOllamaStream`

### 7. RLM конфиг — electron/memory/rlm.ts
- `hotSystemPromptMaxTokens` увеличен с 800 → 2000
- Системный промпт с адаптациями не влезал в 800 токенов

### 8. UNA_SYSTEM_PROMPT — prompts/system.ts
- Добавлена секция `# Инструменты` с web_search, web_fetch, web_download

### 9. Смена модели — electron/ai/config.ts
- `localModel` изменён с `qwen2.5:3b-instruct-q4_K_M` на `gemma4:e2b-it-qat-2k`
- Ollama: удалена модель `qwen2.5:3b-instruct-q4_K_M`

## Известные проблемы
- **@xenova/transformers** — ESM/CJS conflict, эмбеддинги on hold
- **Overlay окно** — не показывает аватар, только фрагмент
- **Proactive engine** — может слать неуместные предложения
- **Context loss** — после перезапуска сессии контекст не восстанавливается (RLM не интегрирован полностью)

## Архитектурные заметки
- Два IPC хендлера: `chat:send` (non-streaming) и `chat:stream` (streaming)
- Оба используют `executeToolLoop` из `tool-loop.ts` (единая точка правды)
- RLM: HOT (≤4K токенов) + WARM (in-memory 50 сообщений) + COLD (SQLite)
- System prompt строится через `buildDynamicPrompt` (BASE_PERSONALITY + адаптации)
- Инструменты в `electron/tools/index.ts` (`TOOL_DEFINITIONS` + `dispatchTool`)

---

## Что добавить в новом архиве (для нового ИИ-ассистента)

Если ты ИИ-кодер и открыл **свежий архив UNA-Desktop** (например, UNA-Desktop-v37.zip),
то следующие правки **НЕ ПЕРЕНЕСЕНЫ** и их нужно внести вручную:

### Файл: electron/ai/llm.ts
1. В `chatOllama()` (non-streaming): после `if (tools.length > 0) body.tools = tools;` добавить `body.tool_choice = 'auto';`
2. В `chatOllamaStream()`: то же самое
3. В `chatOllamaStream()`: добавить переменную `finishReason`, в конце перед return добавить fallback `extractToolCallsFromContent(fullContent)`
4. Добавить функцию `extractToolCallsFromContent` в тело файла (см. ниже)
5. В `chatOllama()`: в return добавить fallback `extractToolCallsFromContent(content)`

### Файл: electron/main.ts
6. В обоих IPC хендлерах (`chat:send` и `chat:stream`): заменить
   ```
   const recent = getRecentMessages(convId, 20).map(...)
   ```
   на
   ```
   const allRecent = getRecentMessages(convId, 20).map(...)
   const recent = allRecent.length > 0 ? allRecent.slice(0, -1) : allRecent;
   ```
7. В обоих хендлерах: заменить
   ```
   context: rlmMessages.slice(1),
   ```
   на
   ```
   context: rlmMessages.slice(1, -1),
   ```
   и вынести `const context = rlmMessages.slice(1, -1);` BEFORE вызова executeToolLoop

### Файл: electron/ai/dynamic-prompt/index.ts
8. В `BASE_PERSONALITY` секцию `# Инструменты` заменить на:
   ```
   # Инструменты (вызывай когда нужно)
   У тебя есть инструменты: web_search, web_fetch, web_download, list_files, read_file,
   write_file, find_files, execute_command, take_screenshot, analyze_screen, system_info,
   memory_save, memory_recall, ask_clarification, request_confirmation.

   ВАЖНО: Для получения АКТУАЛЬНОЙ информации — погода, новости, курс валют, документация,
   информация о людях/компаниях/событиях — ОБЯЗАТЕЛЬНО вызывай web_search.
   НЕ пытайся отвечать по памяти на вопросы о текущих событиях, погоде или фактах —
   используй web_search.
   ```

### Файл: prompts/system.ts
9. Добавить секцию `# Инструменты` после `# Память`:
   ```
   # Инструменты (вызывай по необходимости)
   - web_search: поиск в интернете — ВСЕГДА используй для погоды, новостей, документации
   - web_fetch: загрузить содержимое веб-страницы
   - web_download: скачать файл
   - list_files, read_file, write_file, find_files, execute_command, take_screenshot, analyze_screen, system_info
   ```

### Файл: electron/ai/config.ts
10. Сменить модель: `localModel: 'qwen2.5:3b-instruct-q4_K_M'` → `localModel: 'gemma4:e2b-it-qat-2k'`

### Файл: electron/memory/rlm.ts
11. В `DEFAULT_RLM_CONFIG`: `hotSystemPromptMaxTokens: 800` → `hotSystemPromptMaxTokens: 2000`

### Файл: src/hooks/useUNA.ts
12. В `finally` блоке после сброса статуса добавить проверку:
    ```typescript
    if (status === 'streaming') setStatus('idle');
    // (или эквивалент: не сбрасывать если уже пришёл chat:stream-end)
    ```

### Код функции extractToolCallsFromContent (для п.3-5)
```typescript
function extractToolCallsFromContent(content: string): LLMResponse['tool_calls'] | undefined {
  const jsonMatch = content.match(/<json>\s*(\{[\s\S]*?\})\s*<\/json>/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.name) {
        return [{
          id: `call_fallback_${Date.now()}`,
          type: 'function',
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments),
          },
        }];
      }
    } catch { /* ignore */ }
  }
  return undefined;
}
```

## Новые правки (v37 — Intent + Thinking)

### 10. Intent Detector — новый файл `electron/ai/intent.ts`
- Определяет намерение пользователя по тексту (weather, news, file_read, code, greeting и т.д.)
- Фильтрует `TOOL_DEFINITIONS` — модель получает только релевантные инструменты
- `greeting` → 0 инструментов (просто чат), `unknown` → все инструменты (fallback)
- Паттерны на русском и английском

### 11. Dynamic tool expansion — `electron/ai/tool-loop.ts`
- Round 1: инструменты отфильтрованы по intent'у первого сообщения
- Round 2+: все инструменты доступны (модель видит результаты tool call'ов и может выбрать другие)
- Решает проблему "найди в интернете и сохрани в файл" (round 1 = web_search, round 2 = write_file)

### 12. 8K контекст — `electron/memory/rlm.ts`
- `maxHotTokens: 4096` → `8192`
- `selectMessages` budget: `2048` → `4096` (в 2 раза больше сообщений в HOT)
- Для Gemma 4 (родной контекст 128K) это безопасно, GTX 1650 ограничивает ~8K

### 13. Thinking mode — `prompts/system.ts` и `electron/ai/dynamic-prompt/index.ts`
- Убрана инструкция "НЕ показывай содержимое <think> пользователю" из обоих файлов
- Модель пишет рассуждения в `<think>...</think>`, UI их показывает

### 14. UI: блок рассуждений — `src/components/ChatPanel.tsx`
- `parseThinkBlock(content)` — парсит `<think>...` из ответа
- Во время стриминга: пока `</think>` не пришёл, всё считается мыслями
- После `</think>`: мысли в collapsible блоке (🧠 Рассуждение), ответ — markdown
- Блок рассуждений открыт по умолчанию (`thoughtExpanded: true`)
- Анимированный курсор в блоке мыслей пока стримится

### Файл: electron/ai/intent.ts (НОВЫЙ)
```typescript
// Полный список intent'ов с паттернами и TOOL_BY_INTENT маппингом
// weather → ['web_search']
// greeting → [] (ноль инструментов)
// unknown → все 24 инструмента
```

### Файл: electron/ai/tool-loop.ts
- Заменить `TOOL_DEFINITIONS` → `filterToolsByIntent(TOOL_DEFINITIONS, intent)` на round 1
- Добавить `if (round >= 1) currentTools = TOOL_DEFINITIONS;`
- Импорт: `import { detectIntent, filterToolsByIntent } from './intent';`

### Файл: prompts/system.ts
- Удалить строку `НЕ показывай содержимое <think> пользователю.` из секции Chain-of-Thought

### Файл: electron/ai/dynamic-prompt/index.ts
- Удалить строку `НЕ показывай содержимое <think> пользователю — используй только для внутренней проверки.` из секции # Рассуждение

### Файл: src/components/ChatPanel.tsx
- Добавить функцию `parseThinkBlock` (см. выше)
- В `MessageBubble`: распарсить `content` на `thinking` + `answer`
- Рендерить `thinking` в collapsible блоке с `🧠 Рассуждение`
- Рендерить `answer` как обычный Markdown

### Файл: electron/memory/rlm.ts
- `maxHotTokens: 4096` → `8192`
- `selectMessages` budget: `2048` → `4096`

### Файл: electron/memory/store.ts
- Добавить null-проверку `f.embedding` в `recallFacts` перед `new Float32Array(f.embedding.buffer, ...)`
- Старые факты могут иметь NULL в колонке embedding — без проверки краш

### Файл: electron/main.ts
- Глобальная `activeAbortController: AbortController | null`
- Перед `executeToolLoop` в `chat:stream`: `const controller = new AbortController(); activeAbortController = controller;`
- Передать `signal: controller.signal` в `executeToolLoop`
- В catch: проверка `(e as Error).name === 'AbortError'` → `chat:stream-end` с сообщением об остановке
- В finally: `activeAbortController = null`
- Новый IPC `chat:stop`: `if (activeAbortController) activeAbortController.abort()`

### Файл: electron/ai/llm.ts
- Все функции чата (`chatWithTools`, `chatWithToolsStream`, `chatOllama`, `chatOllamaStream`, `chatCloud`, `chatCloudStream`) принимают `signal?: AbortSignal`
- `signal` передаётся в fetch: `signal: signal ?? AbortSignal.timeout(180000)`

### Файл: electron/ai/tool-loop.ts
- `ToolLoopOptions` — новое поле `signal?: AbortSignal`
- `signal` передаётся в `chatWithTools` / `chatWithToolsStream`

### Файл: electron/preload.ts
- `chat.stop: () => ipcRenderer.invoke('chat:stop')`

### Файл: src/hooks/useUNA.ts
- `stopGeneration` больше не шлёт `___STOP_GENERATION___`, а вызывает `window.una.chat.stop()`

## Новые правки (Memory Pods — Phase 1)

### Добавлены файлы:
- `electron/memory/pods.ts` — Memory Director, классификатор `classifyToPod()`, поиск релевантных подов `findRelevantPods()`

### Файл: electron/memory/store.ts
- `memory_pods` таблица SQLite + `ALTER TABLE facts ADD COLUMN pod_id` миграция в `initMemory()`
- Seed 6 подов по умолчанию: profile, project, preference, emotion, work, general
- `Fact` interface: новый `pod_id?: number`
- Новые экспорты: `createPod()`, `listPods()`, `getPod()`, `getPodByName()`, `deletePod()`, `incrementPodUse()`
- `saveFact()` — 3-й параметр `podId?: number`
- `recallFacts()` — 3-й параметр `podId?: number` для фильтрации по поду

### Файл: electron/memory/rlm.ts
- `HotContext.activePods` — список активных подов (топ-3 по релевантности)
- `buildHotContext()` — находит релевантные поды через `findRelevantPods()`, инкрементирует их use_count
- `buildMessagesFromHot()` — добавляет `[Доступные модули памяти]` блок в user message
- `MemoryToken` — новые actions: `create_pod`, `switch_pod`
- `parseMemoryTokens()` — валидирует create_pod и switch_pod
- `executeMemoryTokens()` — обработчики create_pod (создание пода) и switch_pod (переключение фокуса)
- `getMemoryInstructions()` — документация подов в системном промпте

### Файл: electron/ai/dynamic-prompt/index.ts
- Импорт `listPods` из store
- Новый шаг 8: `# Доступные модули памяти` в system prompt со списком всех подов

### Архитектура Memory Pods
- **Поды** — тематические контейнеры фактов (Profile, Work, Emotions и т.д.)
- **Memory Director** в pods.ts — классифицирует факты по ключевым словам
- **Два уровня RAG**: (1) выбор релевантных подов по query, (2) поиск фактов внутри подов
- **LLM self-management**: [MEM] create_pod, [MEM] switch_pod
- **Backward compat**: старые факты без pod_id → 'general' под, recallFacts без podId = все поды
