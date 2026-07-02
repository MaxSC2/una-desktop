# U.N.A. Desktop — Честный статус (HONEST STATUS)

> **Дата проверки:** 30 июня 2026 (перепроверено по реальному коду, не по старым записям)
> **Версия проекта:** v40 (рабочее дерево)
> **Цель:** Честно документировать что РЕАЛЬНО работает, что частично, что не работает.
>
> ⚠️ Эта ревизия заменяет собой устаревший отчёт от v30. Несколько пунктов,
> ранее отмеченных как «не работает / не починено», **исправлены в коде** — ниже они перенесены в ✅.

---

## Как проверялось

| Проверка | Команда | Результат |
|----------|---------|-----------|
| TypeScript (electron) | `tsc -p electron/tsconfig.json --noEmit` | ✅ 0 ошибок |
| TypeScript (renderer) | `tsc -p tsconfig.json --noEmit` | ✅ 0 ошибок |
| Тесты | `vitest run` | ✅ 170 / 170 pass (3.36s) |
| Сборка рендерера | `vite build` | ✅ собирается (1.28 MB JS, warning про размер чанка) |
| Инструменты | `grep` по `TOOL_DEFINITIONS` | 24 инструмента |
| Интеграции | `grep` по импортам `main.ts` | см. ниже |

---

## ✅ РАБОТАЕТ (проверено)

### Backend
| Компонент | Статус | Заметки |
|-----------|--------|---------|
| TypeScript компиляция | ✅ 0 errors | electron + renderer |
| Vite build | ✅ | 1.28 MB JS (с syntax highlighter + Rive) |
| 170 тестов | ✅ все pass | code-tools, web-tools (unit+integration), safety/classifier |
| Electron entry point | ✅ | `dist-electron/electron/main.js` |
| npm install | ✅ | с `--legacy-peer-deps` |
| Pre-build validation | ✅ | `scripts/pre-build-check.js` |

### Инструменты (24 в `TOOL_DEFINITIONS`)
| Инструмент | Статус | Заметки |
|-----------|--------|---------|
| list_files | ✅ | |
| read_file | ✅ | + protected files |
| write_file | ✅ | + path safety |
| edit_file | ✅ | + backup |
| find_files | ✅ | |
| grep | ✅ | ripgrep + JS fallback |
| apply_patch | ✅ | + context verification |
| run_code | ✅ | + sandbox (timeout, blocked modules) |
| execute_command | ✅ | + env filtering |
| system_info | ✅ | |
| take_screenshot | ✅ | через desktopCapturer |
| analyze_screen | ✅ | через Z.ai Vision |
| memory_save | ✅ | SQLite |
| memory_recall | ⚠️ | Без embeddings (см. ниже) |
| request_confirmation | ✅ | |
| ask_clarification | ✅ | |
| web_search | ✅ | через z-ai-web-dev-sdk |
| web_fetch | ✅ | + SSRF protection |
| web_download | ✅ | + streaming |
| open_app | ⚠️ | объявлен в TOOL_DEFINITIONS; требует @nut-tree/nut-js/robotjs |
| type_text | ⚠️ | см. open_app |
| click | ⚠️ | см. open_app |
| key_press | ⚠️ | см. open_app |
| list_windows | ⚠️ | см. open_app |

> **Важно:** 5 GUI-инструментов (`open_app`, `type_text`, `click`, `key_press`, `list_windows`)
> **уже зарегистрированы** в `TOOL_DEFINITIONS` (реестр отфильтрован через `intent.ts`).
> Реализация лежит в `electron/ai/gui-automation.ts`. Но их фактический запуск зависит от
> наличия нативных зависимостей (`@nut-tree/nut-js` или `robotjs`), которые **не в package.json**.
> Поэтому статус — «объявлены, но требуют установки нативной зависимости».

### UI
| Компонент | Статус | Заметки |
|-----------|--------|---------|
| ChatPanel | ✅ | markdown + code blocks + copy + stop + блок рассуждений `<think>` |
| MarkdownRenderer | ✅ | react-markdown + remark-gfm |
| CodeBlock | ✅ | syntax highlighting + copy button |
| OnboardingWizard | ✅ | 5 шагов |
| UnaAvatar | ⚠️ | «сделан из рук вон плохо» (цитата пользователя) |
| SettingsPanel | ✅ | |
| FilesPanel | ✅ | |
| MemoryPanel | ✅ | |
| EmotionPanel | ✅ | |
| MiniOverlay | ✅ | |
| QuickPalette | ✅ | |
| UnaMascot | ⚠️ | альтернативный аватар (новый, статус TBD) |
| RiveMascot | ⚠️ | Rive-маскот, новый, статус TBD |

---

## ✅ ЧТО ИСПРАВЛЕНО со времени v30 (раньше числилось багами)

> Эти пункты **уже в коде**, но в старом HONEST_STATUS значились как проблемы. Перенесены сюда, чтобы не вводить в заблуждение.

1. **SSE парсинг Ollama** — ✅ `chatOllamaStream` корректно убирает `data:` prefix перед `JSON.parse`.
2. **Дублирование tool-loop** — ✅ вынесено в единый `electron/ai/tool-loop.ts` (`executeToolLoop`). `chat:send` и `chat:stream` оба вызывают его — единственная точка правды.
3. **tool_choice = 'auto'** — ✅ добавлен и в Ollama, и в cloud путь (`chatOllama`, `chatOllamaStream`, `chatCloud`, `chatCloudStream`).
4. **Fallback парсинг tool calls из текста** — ✅ `extractToolCallsFromContent` парсит `<json>{...}</json>` (в Ollama non-stream и stream).
5. **Фильтрация `process.env` в execute_command** — ✅ `filterEnv()` (секреты отфильтрованы).
6. **Graceful degradation TTS** — ✅ возвращает пустой audio вместо throw.
7. **Дублирование user-сообщения** — ✅ `recent.slice(0, -1)` + `rlmMessages.slice(1, -1)` в обоих IPC хендлерах.
8. **Модель сменена** — ✅ дефолт `localModel: 'gemma4:e2b-it-qat-2k'` (`config.ts`), не `qwen2.5:3b`.

---

## ⚠️ ЧАСТИЧНО РАБОТАЕТ

### Streaming LLM
- **Ollama streaming:** ✅ SSE парсинг работает.
- **Z.ai streaming:** ✅ SSE работает.
- **Остаточный риск:** если LLM возвращает пустой content — `executeToolLoop` подставляет заглушку с причиной (`'Я сделала много шагов…'` или `'Извините, я не смогла…'`), логгирует причину.

### Memory (embeddings)
- **Сохранение фактов:** ✅ работает (SQLite, `saveFact`).
- **Embeddings:** ❌ НЕ РАБОТАЕТ (`@xenova/transformers` — ESM в CJS окружении).
- **Cosine similarity:** ❌ не считается.
- **`memory_recall`:** возвращает факты, но без семантического поиска (только LIKE).
- **Workaround в коде:** try-catch, возвращает null вместо throw.

### TTS (Piper)
- **Локальный Piper:** ⚠️ требует ручной настройки путей.
- **Облако Z.ai TTS:** ⚠️ требует валидный API ключ.
- **Результат:** TTS молчит без настройки, но U.N.A. не падает.

### ASR (Whisper)
- **Локальный whisper.cpp:** ⚠️ требует ручной настройки путей.
- **Облако Z.ai ASR:** ⚠️ требует валидный API ключ.
- **Результат:** голосовой ввод не работает без настройки.

### GUI Automation
- **Архитектура:** ✅ реализована (`gui-automation.ts`, 5 инструментов).
- **Регистрация в TOOL_DEFINITIONS:** ✅ инструменты добавлены.
- **Нативная зависимость:** ❌ `@nut-tree/nut-js` / `robotjs` не в `package.json` — запуск в рантайме упадёт, пока не установлены.

---

## ❌ НЕ РАБОТАЕТ / НЕ ПОДКЛЮЧЕНО

### Embeddings (@xenova/transformers)
- **Проблема:** ESM-only библиотека в CommonJS окружении.
- **Влияние:** `memory_recall` не работает семантически.
- **Решение:** конвертировать electron в ESM (большая работа) или найти CJS-совместимую альтернативу.

### Подсистемы написаны, но НЕ интегрированы в `main.ts`
Проверено по импортам `main.ts` — следующие модули **не импортируются** и не вызываются из точки входа:

| Модуль | Файл | Статус |
|--------|------|--------|
| Multi-agent orchestrator | `electron/agents/index.ts` | ❌ не подключён (main.ts использует прямой `executeToolLoop`) |
| Autonomous Loop | `electron/ai/autonomous-loop.ts` | ❌ не подключён |
| MCP Adapter | `electron/ai/mcp-adapter.ts` | ❌ не подключён, без end-to-end тестов |
| Skills System | `electron/ai/skills.ts` | ❌ не подключён (dynamic creation не реализовано) |

> Код этих подсистем существует и компилируется, но **не используется** в рантайме.

### Z.ai API (если ключ протух)
- **Проблема:** 401 Unauthorized → LLM возвращает пустой content.
- **Влияние:** без валидного ключа облако не работает.
- **Решение:** использовать Ollama (локально) или обновить ключ.

---

## 📊 Реальный счёт (по проверенному коду)

| Категория | Работает | Частично | Не работает |
|-----------|----------|----------|-------------|
| Инструменты (24) | 18 | 6 (memory_recall, 5 GUI) | 0 |
| UI компоненты | 11 | 3 (avatar×2, rive) | 0 |
| AI/cognition | — | streaming (2) | embeddings |
| Память | факты (save/list) | recall (LIKE only) | embeddings (семантика) |
| Автономность | 0 подключено | — | agents, loop, MCP, skills |
| Голос | 0 | TTS + ASR (3) | 0 |
| Безопасность | classifier + SSRF + env filter + protected files | — | — |

### Честная оценка зрелости: 5.5/10
Ядро (чат + tools + streaming + память фактов + безопасность) работает и протестировано.
Крупные подсистемы (agents, autonomous loop, MCP, skills, GUI, embeddings) написаны, но не интегрированы.

---

## 📝 Уроки (актуальные)

1. **Документация отстаёт от кода.** Старый HONEST_STATUS (v30) числил исправленными вещи, которые уже починены. Проверяйте по коду, не по записям.
2. **ESM/CJS совместимость критична** — `@xenova/transformers` блокирует семантическую память.
3. **«Готово.» вместо ответа = баг** — теперь причина логгируется в `executeToolLoop`.
4. **Много кода написано, но не интегрировано** — agents, loop, MCP, skills, GUI. Приоритет — подключить.
5. **Нативные зависимости GUI** не объявлены в `package.json`.

---

## 🎯 Приоритеты на ближайшее время

1. **Интегрировать multi-agent в `main.ts`** — код есть, но не используется.
2. **Починить embeddings** — ESM-конверсия или CJS-альтернатива.
3. **Подключить GUI-automation** — установить `@nut-tree/nut-js` / `robotjs`, проверить end-to-end.
4. **Avatar redesign** — `UnaAvatar` по оценке пользователя сделан плохо.
5. **Подключить Autonomous Loop / MCP / Skills** — после архитектурного решения о маршрутизации с multi-agent.
