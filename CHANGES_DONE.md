# Что починено и как работает

## 1. Пустой ответ в чате (был краш)

**Симптом:** Отправляешь сообщение → UNA думает "размышляет" → пустая зона ответа.
**Причина:** `llm.ts` использовал OpenAI-совместимый эндпоинт `/v1/chat/completions`. Gemma 4 E2B QAT имеет родной контекст 128K токенов, и при попытке загрузить модель через этот эндпоинт — Ollama падал с `GGML_ASSERT(n_inputs < GGML_SCHED_MAX_SPLIT_INPUTS)`. 4 GB VRAM не хватало для 128K контекста.

**Фикс:** Переписал обе функции (`chatOllama` и `chatOllamaStream`) на нативный Ollama API `/api/chat` с параметром `options: { num_ctx: 4096 }`. Нативный API корректно применяет лимит контекста, модель не крашится. Таймаут увеличен с 120с до 180с — модель грузится ~130с на первом запросе.

**Цепочка вызова:**
```
ChatPanel (кнопка Send)
  → useUNA.sendMessageStream(text)
    → ipcRenderer.invoke('chat:stream', text)
      → main.ts chat:stream handler
        → executeToolLoop({ stream: true, ... })
          → chatWithToolsStream(messages, tools, onChunk, signal)
            → chatOllamaStream(cfg, messages, tools, onChunk, signal)
              → fetch('localhost:11434/api/chat', { signal, body: JSON.stringify({ model, messages, tools, options: { num_ctx: 4096 }, stream: true }) })
                → SSE-like stream of JSON lines
                  → каждая строка: { message: { content: "..." }, done: false }
                  → onChunk({ type: 'text', delta })
                    → sender.send('chat:chunk', chunk)
                      → renderer получает событие
                        → store.appendToMessage(id, delta)
                          → Zustand re-render → текст печатается
```

## 2. Кнопка "Стоп" не работала

**Симптом:** Нажимаешь Stop → статус сбрасывается на idle, но LLM продолжает генерацию в фоне, а когда заканчивает — UI получает "лишний" ответ.
**Причина:** `stopGeneration()` отправлял `___STOP_GENERATION___` как обычное текстовое сообщение через `chat.send`. LLM пыталась ответить на этот текст, main process не прерывался.

**Фикс:** Добавлен AbortController, который живёт в main process:

```
main.ts:
  let activeAbortController: AbortController | null = null;

  ipcMain.handle('chat:stream', ...) {
    const controller = new AbortController();
    activeAbortController = controller;
    const loopResult = await executeToolLoop({ signal: controller.signal, ... });
    // ...
    finally { activeAbortController = null; }
  }

  ipcMain.handle('chat:stop', () => {
    activeAbortController?.abort();  // ← прерывает fetch
  });
```

Когда fetch прерывается (`AbortError`), catch проверяет `err.name === 'AbortError'` и шлёт нормальный `chat:stream-end` с сообщением "⏹️ Генерация остановлена" вместо ошибки.

## 3. recallFacts падал с null buffer

**Симптом:** Ошибка `TypeError: Cannot read properties of null (reading 'buffer')` при старте или поиске фактов.
**Причина:** В SQLite могли быть факты с `NULL` в колонке `embedding` (старые записи, созданные до добавления эмбеддингов, или ручные вставки). Функция `recallFacts` на строке 349 делала `new Float32Array(f.embedding.buffer, ...)` без проверки на null.

**Фикс:** Добавлена проверка `if (!f.embedding) return { ... score: 0 }` — факты без эмбеддинга просто получают нулевой score (не участвуют в поиске, но не крашат приложение).

## 4. Backup/Restore

Новый модуль `electron/data/backup.ts`:
- `exportBackup()` — читает все таблицы из SQLite (`conversations`, `messages`, `facts`, `patterns`, `emotions`) + config из electron-store → открывает диалог сохранения → пишет `.json`
- `importBackup()` — открывает диалог выбора → читает `.json` → транзакция: `DELETE FROM` + `INSERT OR REPLACE` для всех таблиц → восстанавливает config
- IPC: `data:export`, `data:import`
- UI: кнопки Экспорт/Импорт в SettingsPanel

## 5. Смена модели

Gemma 4 E2B QAT (4.3 GB, крашилась, слабое function calling) → Qwen 3 4B (2.5 GB, нативное function calling, быстрее загрузка).
