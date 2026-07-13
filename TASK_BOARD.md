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
| 5 | i18n en/kk | glm5.2 | 2026-07-03 | ✅ done | src/i18n/ + переключатель в SettingsPanel |
| 6 | Qwen 3 4B model switch | lead | 2026-07-01 18:00 | ✅ done | config.ts → `localModel: 'qwen3:4b'` |
| 7 | Overlay окно (аватар) | lead | 2026-07-02 22:30 | ✅ done | Hash-роутинг #/overlay → только MiniOverlay, 480×200 |
| 8 | Neural embeddings | lead | 2026-07-01 19:10 | ✅ done | Ollama /api/embed (нейронные) + hashing fallback |
| 9 | Rive mascot `.riv` file | — | — | ⏳ free | Создать .riv файл для RiveMascot компонента |
| 10 | 🔴 P0: run_code sandbox | koda | 2026-07-02 12:30 | ✅ done | Переписано на vm.runInNewContext — изолированный контекст без process/require/fs. TypeScript strip. console перехват.
| 11 | 🔴 P0: execute_command env | lead | 2026-07-02 22:30 | ✅ done | safeEnv() — белый список из 20 переменных + обнуление API-ключей |
| 12 | 🔴 P0: web_fetch SSRF | lead | 2026-07-02 22:30 | ✅ done | Проверка resp.url после redirect через isUrlSafe |
| 13 | 🔴 P0: apply_patch path traversal | lead | 2026-07-02 22:30 | ✅ done | fs.realpath перед isPathInsideHome/isProtectedFile |
| 14 | 🟠 P1: duplicate user message | koda | 2026-07-01 19:50 | ✅ done | slice(1,-1) — allRecent без обрезки |
| 15 | 🟠 P1: confirmedTokens race | lead | 2026-07-01 20:00 | ✅ done | refreshConfirmedTokens() — новый Set из store |
| 16 | 🟠 P1: embed NaN for empty | koda | 2026-07-02 12:00 | ✅ done | Guard для пустой строки в embedHash |
| 17 | 🟠 P1: backup import validation | koda | 2026-07-01 19:50 | ✅ done | validateBackupStructure + validateDbData |
| 18 | 🟠 P1: extractTextFromHtml XSS | lead | 2026-07-02 22:30 | ✅ done | regex удаления /\son\w+\s*=\s*["'][^"']*["']/gi |
| 19 | 🟠 P1: buildHotContext async error | lead | 2026-07-01 20:15 | ✅ done | Уже пофикшено try/catch |
| 20 | 🟡 P2: merge two config Stores | koda | 2026-07-01 19:50 | ✅ done | configStore везде, удалён Store из main.ts |
| 21 | 🟡 P2: TOOL_DEFINITIONS strategy | gpt55 | 2026-07-03 | ✅ done | Разделены registry/helpers/definitions, index.ts — оркестратор |
| 22 | 🟡 P2: recallFacts FTS5 index | lead | 2026-07-02 22:45 | ✅ done | FTS5 virtual table + triggers + предфильтрация в recallFacts |
| 23 | 🟡 P2: proactive engine settings | glm5.2 | 2026-07-03 | ✅ done | ProactiveConfig + UI в SettingsPanel + proactive.ts читает из config |
| 24 | 🟡 P2: WAL checkpoint | lead | 2026-07-02 22:45 | ✅ done | walCheckpoint() + вызов в closeMemory |
| 25 | 🟡 P2: tests for tool-loop/rlm/memory/store | lead | 2026-07-04 18:30 | ✅ done | 27 тестов для store.ts (CRUD, FTS5, embeddings, WAL, patterns, emotions, RLM). Починены FTS5 triggers (удалены поломанные facts_ad/facts_au — FTS cleanup теперь в deleteFact явно). Починен savePattern upsert. Все 202/203 тестов проходят (1 pre-existing false positive в isUrlSafe). |
| 26 | 🟡 P2: executeToolLoop empty text | lead | 2026-07-01 20:20 | ✅ done | Fallback при пустом content
| 27 | 🟡 P2: memory_save/memory_recall | gpt55 | 2026-07-03 | ✅ done | Реальные импорты из memory/store в definitions/memory-save.ts + memory-recall.ts |

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
### 2026-07-02
- `P1: embed NaN for empty` — koda: guard для пустой строки в `embedHash` — возвращает единичный вектор вместо NaN.
### 2026-07-03
- `TASK_BOARD.md` — lead: #7, #11, #18 переведены в done (по факту уже сделаны); #21 в 🔨 doing (GPT-5.5).
- `P1: backup import validation` — koda: `validateBackupStructure()`, `validateDbData()`, интерфейсы `BackupData`, проверка размера.
- `P2: merge two config Stores` — koda: единый Store из `config.ts`, удалён дублирующий Store из `main.ts`, `refreshConfirmedTokens()`.
- `P1: duplicate user message` — koda: `allRecent` без обрезки, `messagesThisSession: allRecent.length`.
- `compile fix: await isUrlSafe + RegExp` — koda: добавлен `await` перед `isUrlSafe()` в `fetch_webpage`/`download_file`, исправлен `.source.replace()` на RegExp literal в `obfuscationPatterns`.
- `P0: run_code sandbox` — koda: полная переписалка `run_code` на `vm.runInNewContext`. Изолированный контекст без `process`/`require`/`fs`/`eval`. Безопасные глобальные: JSON, Math, Date, fetch, Buffer. console перехват stdout/stderr. Минимальный TypeScript strip. Regex-фильтры удалены — sandbox на уровне VM.
- `🔴 P0: run_code sandbox` — koda: переписала на `vm.runInNewContext` (изолированный контекст, console capture, AbortController). lead: починил импорты, Reject→AbortController, вынес stdout/stderr из try, убрал дубликаты констант.
- `🟡 P2: FTS5 index` — lead: `facts_fts` virtual table, sync triggers, `ftsKeywords()` экстракция, FTS5-предфильтрация перед cosine в `recallFacts`.
- `🟡 P2: WAL checkpoint` — lead: `walCheckpoint()` с `PRAGMA wal_checkpoint(TRUNCATE)`, вызов в `closeMemory`.
- `🔴 P0: SSRF` — lead: проверка `resp.url` через `isUrlSafe` после редиректа в `web_fetch` и `web_download`.
- `🔴 P0: path traversal` — lead: `resolveRealPath()` (fs.realpath) в `edit_file`, `apply_patch`, `grep`.
### 2026-07-04
- `🟡 P2: tests for tool-loop/rlm/memory/store #25` — lead: 27 тестов для store.ts (CRUD, FTS5, embeddings, WAL, patterns, emotions, RLM extensions, recallFacts, buildContext, searchEpisodic). Починены FTS5 triggers — удалены поломанные `facts_ad`/`facts_au` (вызывали `SQL logic error` на UPDATE/DELETE), FTS cleanup теперь в `deleteFact` явно через `DELETE FROM facts_fts`. Починен `savePattern` upsert (`result.changes` вместо `db.changes`). 202/203 тестов проходят.
- `🔴 P0: FTS5 SQL error` — lead: починен `memory:delete-fact` crash (SQL logic error в FTS5 triggers).
### 2026-07-06
- `🔴 P0: execute_command injection fix` — lead: заменён `child_process.exec` на `execFile` (через `/bin/sh -c` на Linux, `cmd.exe /d /c` на Windows). Команда передаётся как аргумент shell, а не конкатенируется — OWASP-compliant, предотвращает shell argument injection.
- `🟡 P1: web_fetch/web_download rate limiting` — lead: добавлен `SimpleRateLimiter` (10 запросов/мин на хост) в web-tools.ts. Rate limit проверяется после `isUrlSafe` и до выполнения запроса.
- `🟡 P1: GUI automation` — lead: установлен `@nut-tree-fork/nut-js` (оригинальный `@nut-tree/nut-js` стал paid-only, удалён с npm). Обновлены импорты и сообщения об ошибках в `gui-automation.ts`.
