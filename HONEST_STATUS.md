# U.N.A. Desktop — Честный статус (HONEST STATUS)

> **Дата проверки:** 15 сентября 2026 (M4 «Честная память») — полный аудит
> **Версия проекта:** v40 (рабочее дерево)
> **Цель:** Честно документировать что РЕАЛЬНО работает, что частично, что не работает.
>
> ⚠️ Ревизия M4: честная память (реальные LLM-сводки вместо заглушек, мягкое забывание вместо DELETE,
> подключён env-loader) + Graphiti MCP включён автодетектом (M3) + VRAM-gate и детект игр (M2) +
> L0 fast-path и local-first по умолчанию (M1).

---

## Как проверялось

| Проверка | Команда | Результат |
|----------|---------|-----------|
| TypeScript (electron) | `tsc -p electron/tsconfig.json --noEmit` | ✅ 0 ошибок |
| TypeScript (renderer) | `tsc -p tsconfig.json --noEmit` | ✅ 0 ошибок |
| Тесты | `vitest run` | ✅ 203 / 203 pass |
| Сборка рендерера | `vite build` | ✅ собирается (1.45 MB JS, warning про размер чанка) |
| Инструменты | `ls electron/tools/definitions` | 25 инструментов |
| Манифест файлов | `node scripts/verify-manifest.js` | ✅ 94/94 на месте, 0 пропущено (147 «лишних» вне MANIFEST.md) |
| MCP (graphiti) | `node scripts/m3-smoke-mcp.mjs` | ✅ initialize + tools/list, 3 tools |
| Pre-build check | `node scripts/pre-build-check.js` | ✅ 0 ошибок, 2 warning (robotjs optional) |
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

### Инструменты (25 в `TOOL_DEFINITIONS`)
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
| memory_recall | ✅ | FTS5 (external-content) + Ollama embeddings + hashing fallback. FTS5 «SQL logic error» на UPDATE/DELETE исправлен (v30) |
| request_confirmation | ✅ | |
| ask_clarification | ✅ | |
| web_search | ✅ | через z-ai-web-dev-sdk |
| web_fetch | ✅ | + SSRF protection |
| web_download | ✅ | + streaming |
| create_reminder | ✅ | persistent reminders (`electron/reminders/index.ts`) |
| open_app | ⚠️ | объявлен в TOOL_DEFINITIONS; требует @nut-tree/nut-js/robotjs |
| type_text | ⚠️ | см. open_app |
| click | ⚠️ | см. open_app |
| key_press | ⚠️ | см. open_app |
| list_windows | ⚠️ | см. open_app |

> **Важно:** 5 GUI-инструментов (`open_app`, `type_text`, `click`, `key_press`, `list_windows`)
> **уже зарегистрированы** в `TOOL_DEFINITIONS` (реестр отфильтрован через `intent.ts`).
> Реализация лежит в `electron/ai/gui-automation.ts`. Нативная зависимость
> `@nut-tree-fork/nut-js` установлена в `package.json` (v30). Фактический запуск
> GUI-автоматизации end-to-end на реальном рабочем столе пока не подтверждён.

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
8. **Модель сменена** — ✅ дефолт `localModel: 'qwen3:1.7b'`, `provider: 'auto'` (local-first, M1); `qwen2.5:3b` удалена.
9. **env-loader подключён (M4)** — ✅ `loadEnvFile()` вызывается в `main.ts` до инициализации конфига (ключи из `.env`, не хардкод).

---

## ⚠️ ЧАСТИЧНО РАБОТАЕТ

### Streaming LLM
- **Ollama streaming:** ✅ SSE парсинг работает.
- **Z.ai streaming:** ✅ SSE работает.
- **Остаточный риск:** если LLM возвращает пустой content — `executeToolLoop` подставляет заглушку с причиной (`'Я сделала много шагов…'` или `'Извините, я не смогла…'`), логгирует причину.

### Memory (embeddings)
- **Сохранение фактов:** ✅ работает (SQLite, `saveFact`).
- **Embeddings:** ✅ работает через Ollama `/api/embed` (нейронные) + hashing fallback (задача #8).
- **Cosine similarity:** ✅ считается в `recallFacts` (с FTS5-предфильтрацией).
- **FTS5 «SQL logic error»:** ✅ исправлен в v30 — `facts_fts` переведена на
  external-content режим, автамиграция существующих БД при старте.
- **`memory_recall`:** ✅ работает (семантика + FTS + пороги).

### TTS (Piper)
- **Локальный Piper:** ⚠️ требует ручной настройки путей.
- **Облако Z.ai TTS:** ⚠️ требует валидный API ключ.
- **Fallback (v30):** ✅ если TTS не настроен — ответ озвучивается системным
  голосом через `speechSynthesis` (работает в Electron на Windows из коробки).

### ASR (Whisper)
- **Локальный whisper.cpp:** ⚠️ требует ручной настройки путей.
- **Облако Z.ai ASR:** ⚠️ требует валидный API ключ.
- **Fallback (v30):** ⚠️ при ненастроенном ASR рендерер пробует Web Speech API;
  если недоступно — понятное сообщение в чате (раньше — молчаливый сброс).

### GUI Automation
- **Архитектура:** ✅ реализована (`gui-automation.ts`, 5 инструментов).
- **Регистрация в TOOL_DEFINITIONS:** ✅ инструменты добавлены.
- **Нативная зависимость:** ✅ `@nut-tree-fork/nut-js` в `package.json`
  (оригинальный `@nut-tree/nut-js` стал paid-only). End-to-end на реальном
  рабочем столе пока не подтверждён.

---

## ❌ НЕ РАБОТАЕТ / НЕ ПОДКЛЮЧЕНО

### Embeddings (@xenova/transformers) — историческая запись, снято с повестки
- **Проблема (v30):** ESM-only библиотека в CommonJS окружении.
- **Факт (проверено M4):** семантическая память работает через Ollama `/api/embed` + hashing fallback (см. «Memory (embeddings)» выше). Зависимость от `@xenova/transformers` не требуется — раздел оставлен для истории.

### Подсистемы написаны, но НЕ интегрированы в `main.ts`
Проверено по импортам `main.ts` — следующие модули **не импортируются** и не вызываются из точки входа:

| Модуль | Файл | Статус |
|--------|------|--------|
| Multi-agent orchestrator | `electron/agents/index.ts` | ❌ не подключён (main.ts использует прямой `executeToolLoop`) |
| Autonomous Loop | `electron/ai/autonomous-loop.ts` | ❌ не подключён |
| MCP Adapter | `electron/ai/mcp-adapter.ts` | ✅ подключён в `main.ts` + fallback диспетчер в `tools/index.ts`. Graphiti-сервер автодетектится (M3: `DEFAULT_MCP_SERVERS` → ~/graphiti-una/server.py); проверено протокольно: `initialize` + `tools/list` = 3 tools (memory_add/memory_search/memory_status). Вызовы памяти требуют запущенной Ollama; см. docs/GRAPHITI_MEMORY.md |
| Skills System | `electron/ai/skills.ts` | ❌ не подключён (dynamic creation не реализовано) |

> Код этих подсистем существует и компилируется, но **не используется** в рантайме.

### Z.ai API (если ключ протух)
- **Проблема:** 401 Unauthorized → LLM возвращает пустой content.
- **Влияние:** без валидного ключа облако не работает.
- **Решение:** использовать Ollama (локально) или обновить ключ.

---

## 📊 Реальный счёт (по проверенному коду, v30)

| Категория | Работает | Частично | Не работает |
|-----------|----------|----------|-------------|
| Инструменты (24) | 19 (вкл. memory_recall) | 5 (GUI, зависят от nut-js e2e) | 0 |
| UI компоненты | 11 | 3 (avatar×2, rive) | 0 |
| AI/cognition | streaming (2) | — | — |
| Память | факты + recall (FTS5 + embeddings) | Graphiti (docs, конфиг-заготовка) | — |
| Автономность | MCP подключён | — | agents, loop, skills |
| Голос | TTS fallback (speechSynthesis) | Piper/Z.ai (по настройке), ASR fallback | — |
| Безопасность | classifier + SSRF + env filter + protected files | — | — |

### Честная оценка зрелости: 8/10
Ядро (чат + tools + streaming + память фактов + безопасность + голос-fallback) работает
и протестировано (203/203). M1: local-first по умолчанию (Ollama qwen3:1.7b, think off),
L0 pre-router (gui/system — < 50 мс, ноль GPU), MCP handshake починен.
M2: ollama keep_alive 5m = VRAM-gate на простой (модель сама выгружается, пока играешь/работаешь),
пример MCP-сервера обновлён на реальный graphiti-una stdio-сервер.
L1: semantic router (embeddings-intent) с regex-fallback активен.
M3: детект игр + VRAM-gate (при запуске игры модель мгновенно выгружается из VRAM).
M4: честная память — LLM-сводки старых бесед только при реальном ответе модели и только в простое
(`shouldMaintainMemory`); forget = мягкое забывание (`use_count = -1`), а не DELETE; env-loader подключён;
Graphiti MCP включается автодетектом (M3) и проверен на уровне протокола (initialize + tools/list = 3 tools).
Не интегрированы: multi-agent, autonomous loop, skills.

---

## 📝 Уроки (актуальные)

1. **Документация отстаёт от кода.** Старый HONEST_STATUS (v30) числил исправленными вещи, которые уже починены. Проверяйте по коду, не по записям.
2. **ESM/CJS совместимость критична** — `@xenova/transformers` блокирует семантическую память.
3. **«Готово.» вместо ответа = баг** — теперь причина логгируется в `executeToolLoop`.
4. **Много кода написано, но не интегрировано** — agents, loop, MCP, skills, GUI. Приоритет — подключить.
5. **Нативные зависимости GUI** не объявлены в `package.json`.
6. **Аудит-чеклист обязателен перед отчётом** — сверять счётчики (инструментов 25, не 24), прогонять `vitest run` + `verify-manifest.js`; иначе документация снова разойдётся с кодом.

---

## 🎯 Приоритеты на ближайшее время

1. ~~**Починить embeddings**~~ — ✅ решено через Ollama `/api/embed` + FTS5 fix (v30).
2. ~~**MCP Adapter**~~ — ✅ подключён в main.ts (v30); end-to-end с Graphiti см. docs/GRAPHITI_MEMORY.md.
3. **Интегрировать multi-agent в `main.ts`** — код есть, но не используется.
4. **GUI-automation end-to-end** — зависимость установлена, проверить на реальном столе.
5. **Avatar redesign** — `UnaAvatar` по оценке пользователя сделан плохо.
6. **Подключить Autonomous Loop / Skills** — после архитектурного решения о маршрутизации с multi-agent.
