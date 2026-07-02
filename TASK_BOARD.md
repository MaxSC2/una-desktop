# TASK BOARD — UNA-Desktop

> Доска задач для команды ИИ-кодеров.
> Каждый ИИ перед началом работы **берёт задачу** (ставит `assignee`, `taken_at`, `status: doing`),
> а после завершения обновляет статус и пишет отчёт.

---

## 📋 Активные задачи

<!-- 1 задача = 1 строка таблицы. Кто взял — пишет assignee + время + статус -->

| # | Задача | Assignee | Взята | Статус | Комментарий |
|---|--------|----------|-------|--------|-------------|
| 1 | Backup/Restore | lead | 2026-07-01 17:30 | ✅ done | Экспорт/импорт БД + конфиг в .json, кнопки в SettingsPanel |
| 2 | Persistent reminders | lead | 2026-07-01 18:45 | ✅ done | SQLite, проверка каждые 30с, Notification API, IPC, UI-панель в боксе |
| 3 | Auto-update + CI-CD | koda | 2026-07-01 19:20 | ✅ done | electron-builder.yml, .github/workflows/ci.yml + release.yml, autoUpdater в main.ts/preload |
| 4 | Telegram bot | lead | 2026-07-01 19:30 | ✅ done | electron/telegram/index.ts, 4 команды, config токена, IPC статус, старт/стоп в main.ts |
| 5 | i18n en/kk | — | — | ⏳ free | i18next, locale файлы, переключение языка |
| 6 | Qwen 3 4B model switch | lead | 2026-07-01 18:00 | ✅ done | config.ts → `localModel: 'qwen3:4b'` |
| 7 | Overlay окно (аватар) | — | — | ⏳ free | Не показывает аватар, только фрагмент |
| 8 | Neural embeddings | lead | 2026-07-01 19:10 | ✅ done | Ollama /api/embed (нейронные) + hashing fallback |
| 9 | Rive mascot `.riv` file | — | — | ⏳ free | Создать .riv файл для RiveMascot компонента |
| 10 | P1-5: Импорт бэкапа — валидация | koda | 2026-07-02 10:00 | 🔄 review | BackupData интерфейсы, validateBackupStructure(), validateDbData(), проверка размера файла |
| 11 | P1-1: getRecentMessages — убрать slice(0,-1) | koda | 2026-07-02 10:00 | 🔄 review | allRecent → allRecent, messagesThisSession: allRecent.length |
| 12 | P2-1: Два Store → единый | koda | 2026-07-02 10:00 | 🔄 review | Убран Store из main.ts, все на configStore, refreshConfirmedTokens() |
| 10 | 🔴 P0: run_code sandbox | — | — | ⏳ free | vm.runInNewContext вместо regex-фильтра |
| 11 | 🔴 P0: execute_command env | — | — | ⏳ free | Убрать ...process.env из exec, белый список |
| 12 | 🔴 P0: web_fetch SSRF | — | — | ⏳ free | Блокировать private IP после DNS-резолва |
| 13 | 🔴 P0: apply_patch path traversal | — | — | ⏳ free | fs.realpathSync для разрешения симлинков |
| 14 | 🟠 P1: duplicate user message | koda | 2026-07-01 19:50 | 🔄 review | Рефакторинг slice(1,-1) — allRecent без обрезки |
| 15 | 🟠 P1: confirmedTokens race | lead | 2026-07-01 20:00 | ✅ done | refreshConfirmedTokens() — новый Set из store перед каждым запросом, убрана мутация общего Set |
| 16 | 🟠 P1: embed NaN for empty | — | — | ⏳ free | Guard для пустой строки в hashing fallback |
| 17 | 🟠 P1: backup import validation | koda | 2026-07-01 19:50 | 🔄 review | BackupData интерфейсы, validateBackupStructure(), validateDbData(), проверка размера файла |
| 18 | 🟠 P1: extractTextFromHtml XSS | — | — | ⏳ free | Санитизация event handler'ов |
| 19 | 🟠 P1: buildHotContext async error | lead | 2026-07-01 20:15 | ✅ done | Уже пофикшено: try/catch + facts=[] инит. Остальные recallFacts под try/catch в proactive.ts |
| 20 | 🟡 P2: merge two config Stores | koda | 2026-07-01 19:50 | 🔄 review | Перенести всё в единый Store из config.ts — удалён дублирующий Store из main.ts |
| 21 | 🟡 P2: TOOL_DEFINITIONS strategy | — | — | ⏳ free | Каждый инструмент — отдельный файл, glob-загрузка |
| 22 | 🟡 P2: recallFacts FTS5 index | — | — | ⏳ free | Предфильтрация через FTS5 перед cosine search |
| 23 | 🟡 P2: proactive engine settings | — | — | ⏳ free | Вынести интервалы в UI/конфиг |
| 24 | 🟡 P2: WAL checkpoint | — | — | ⏳ free | Периодический wal_checkpoint в store.ts |
| 25 | 🟡 P2: tests for tool-loop/rlm | — | — | ⏳ free | Покрыть ядро системы тестами |
| 26 | 🟡 P2: executeToolLoop empty text | lead | 2026-07-01 20:20 | 🔨 doing | Fallback при пустом content + пустых tool_calls |

---

## 📌 Статусы
- `⏳ free` — свободна, можно брать
- `🔨 doing` — в работе
- `🔄 review` — нужна проверка
- `✅ done` — завершена
- `❌ blocked` — заблокирована (в комментарии причина)

## 🚀 Как брать задачу
1. Найти строку со статусом `⏳ free`
2. Заменить `—` в `Assignee` на свой ник, в `Взята` — текущее время
3. Статус → `🔨 doing`
4. После завершения → `✅ done` + комментарий что сделано

---

## 📝 Ченджлог

### 2026-07-01
- `Backup/Restore` — lead: создан `electron/data/backup.ts`, IPC handlers, UI кнопки. Экспорт всех таблиц SQLite + config в .json, импорт с подтверждением.
- `Qwen 3 4B` — lead: переключена модель в `config.ts`, скомпилировано.
- `stopGeneration` — lead: AbortController цепочка (main.ts → tool-loop → llm.ts → fetch), отдельный IPC chat:stop.
- `recallFacts` — lead: null check для `f.embedding` в store.ts.
- `/api/chat` — lead: переписан `llm.ts` с OpenAI-совместимого на нативный Ollama API, т.к. `/v1/chat/completions` крашился с Gemma 4.
### 2026-07-01 (вечер)
- `Koda CLI audit` — koda: проведён полный аудит безопасности/архитектуры. 4xP0, 8xP1, 10xP2, 4xP3. Задачи #10-26 добавлены в доску.
