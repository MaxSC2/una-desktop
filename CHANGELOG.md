# Changelog

Все заметные изменения U.N.A. Desktop документируются здесь.
Формат основан на [Keep a Changelog](https://keepachangelog.com/),
и проект следует [Semantic Versioning](https://semver.org/).

---

## [v31] — 2026-09-09

### Fixed
- **MCP handshake** (`electron/ai/mcp-adapter.ts`): `waitForResponse` вызывался с 3 аргументами вместо 4 — tsc падал, `npm run build` был неработоспособен. Передача `send` как 4-го арга инициализировала listener ДО записи в stdin (без гонки).

### Added — M1: Local-first + L0 pre-router
- **Local-first по умолчанию** (`electron/main.ts`, `electron/ai/config.ts`): убран принудительный cloud-провайдер Gemini с хардкод-ключом. Дефолт `provider: 'auto'` → сначала локальный Ollama `qwen3:1.7b` (помещается в 4GB VRAM), облако — только fallback. Хардкод-секреты удалены.
- **Qwen3 think off** (`electron/ai/llm.ts`): `body.think = false` для моделей `qwen*` в обеих ветках (stream/non-stream) — убирает reasoning-блок, ускоряет в ~10×.
- **L0 pre-router** (`electron/ai/tool-loop.ts` → `tryDirectCommand`): детерминированный путь для `gui`/`system` intent без LLM. «открой Discord» → `open_app` (< 50 мс, ноль GPU); «сколько памяти» → `system_info`. Регистр приложений (discord/telegram/chrome/code/calc/explorer/...).
- **TTL-кэш ресурсов** (`electron/ai/resource-manager.ts`): `getResourceState` кэшируется 45с — убирает 3 процесса (nvidia-smi + 2×powershell) каждый тик life-loop.

### Added — M2: VRAM-gate + Graphiti MCP
- **Ollama keep_alive** (`electron/ai/llm.ts`): `keep_alive: '5m'` (env `OLLAMA_KEEP_ALIVE`) — при простое >5 мин Ollama сама выгружает модель из VRAM. Это и есть VRAM-gate: пока играешь/кодишь, запросов нет → VRAM освобождается автоматически, без отдельного gaming-детекта.
- **MCP-пример** (`electron/ai/mcp-adapter.ts`): обновлён на реальный `graphiti-una` stdio-сервер (graphiti-core + Kuzu, без Docker).

### Statistics
- TypeScript: 0 ошибок (electron + renderer)
- Vite build: ✓ (1.45 MB JS)
- 203/203 тестов pass
- Зрелость: 7.5/10 → 8/10

### Fixed — P0: FTS5 «SQL logic error» (память фактов падала на UPDATE/DELETE)

- **Было:** любой `UPDATE facts` (recallFacts, incrementFactUse, setFactImportance,
  markFactForget) и `DELETE FROM facts` (deleteFact) падал с `SqliteError: SQL logic error`.
- **Причина:** `facts_fts` была создана как **обычная** FTS5-таблица, а триггеры
  `facts_ad`/`facts_au` использовали FTS5-команду `'delete'` — она допустима только
  для external-content таблиц. Дополнительно deleteFact делал двойное удаление
  (вручную из facts_fts + через триггер).
- **Стало:** `facts_fts` переведена на external-content режим
  (`content='facts', content_rowid='id'`). Автоматическая миграция существующих
  БД при старте (пересоздание таблицы + `rebuild` индекса). Ручной `DELETE FROM
  facts_fts` в deleteFact убран — синхронизирует триггер `facts_ad`.
- **Проверено:** воспроизводимый минимальный тест до/после; **203/203 тестов pass**.

### Added — Голос работает «из коробки» (без Piper / Z.ai)

- **TTS fallback:** если серверный TTS вернул пустое аудио (Piper/Z.ai не
  настроены), ответ озвучивается системным голосом через `speechSynthesis`
  (работает в Electron на Windows из коробки). «Стоп» останавливает и его.
- **ASR fallback:** если ASR не настроен (нет whisper.cpp и облачного ключа),
  рендерер пробует встроенное Web Speech API; при полном отсутствии — понятное
  сообщение в чате вместо молчаливого сброса статуса.

### Added — LLM resilience: облако → локальный Ollama

- `chatWithTools` / `chatWithToolsStream`: при ошибке облачного провайдера
  (невалидный ключ, нет сети) автоматический fallback на локальный Ollama
  (если запущен). Раньше ассистент молчал при протухшем ключе.

### Added — Инфраструктура сборки/тестов

- `npm run rebuild:node` / `npm run rebuild:electron` — управление ABI
  better-sqlite3 (Node 22 для vitest = MODULE_VERSION 127 vs Electron 33 = 130).
- `npm test` автоматически пересобирает модуль под Node; `npm run dev` — под
  Electron. Устраняет 27 «фантомных» падений тестов памяти.

### Added — Graphiti как долговременная память (MCP)

- Документация `docs/GRAPHITI_MEMORY.md`: подключение темпорального графа знаний
  [getzep/graphiti](https://github.com/getzep/graphiti) через MCP-адаптер.
- Заготовка конфига `graphiti-memory` в `DEFAULT_MCP_SERVERS` (stdio + mcp-remote).

### Statistics
- **203/203 тестов pass** (было 173/203)
- TypeScript: 0 ошибок (electron + renderer)
- Vite build: ✓ (1.45 MB JS)

---

## [v29] — 2026-07-29

### Fixed — 3 критичных бага от пользователя

#### Fix 1: package.json "main" path
- **Было:** `"main": "dist-electron/main.js"`
- **Стало:** `"main": "dist-electron/electron/main.js"`
- **Причина:** tsconfig.json с `rootDir: ".."` складывает компилят в `dist-electron/electron/`, а не в `dist-electron/`
- **Ломало:** `electron .` (не мог найти entry point), `electron-builder` (не мог найти main.js в asar)

#### Fix 2: package.json "author" format
- **Было:** `"author": "UNA Team"` (строка)
- **Стало:** `"author": { "name": "UNA Team", "email": "alaster3070@gmail.com" }` (объект)
- **Причина:** electron-builder требует email для Linux .deb сборки (maintainer field)
- **Ломало:** `npx electron-builder --linux`

#### Fix 3: Missing dependencies
- **Было:** `sonner` и `lucide-react` импортируются в коде, но не объявлены в package.json
- **Стало:** добавлены в dependencies
- **Ломало:** `vite build` (вторая фаза сборки падала с "Cannot find module")
- **Исправление:** `npm install sonner lucide-react --legacy-peer-deps`

### Added — Pre-build validation
- **`scripts/pre-build-check.js`** — автоматическая проверка перед build/package
  - Проверяет main path соответствует tsconfig outDir/rootDir
  - Проверяет author формат (object с email для electron-builder)
  - Сканирует все imports в src/ и electron/, проверяет что они в dependencies
  - Проверяет наличие критичных файлов
  - Проверяет что TypeScript компилируется
  - Запускается автоматически: `npm run build` → prebuild → check → build
  - Запускается вручную: `npm run check`

### Changed
- `package.json` scripts: добавлены `prebuild`, `prepackage`, `check`, `manifest`
- `build` script теперь: `npm run prebuild && tsc && vite build`
- `package:*` scripts теперь: `npm run prepackage && npm run build && electron-builder`

### Statistics
- 170 тестов pass
- 0 TypeScript errors
- pre-build-check: 0 errors, 4 warnings (optional deps)
- Entry point `dist-electron/electron/main.js` exists after build

---

## [v28] — 2026-07-29

### Fixed — Windows .bat compatibility
- start.bat, install.bat: ASCII only, CRLF line endings, English messages
- start.ps1: NEW PowerShell launcher (native Unicode, colored output)
- scripts/setup.js: non-interactive (removed readline), English messages, ANSI detection

---

## [v27] — 2026-07-29

### Added
- **MANIFEST.md** — полный список всех файлов проекта (72+ файлов) с описанием
- **scripts/verify-manifest.js** — checker целостности файлов (запуск: `node scripts/verify-manifest.js`)
- **CHANGELOG.md** — этот файл, история версий
- **Git initialization** — локальный git repo для защиты от потери файлов

### Security
- Файлы теперь защищены через git history — даже если локально пропадут, можно восстановить

---

## [v26] — 2026-07-29

### Added — Восстановлены пропавшие файлы (12 штук!)
- `start.bat` — Windows launcher
- `install.bat` — Windows installer
- `start.sh` — Linux/macOS launcher
- `scripts/setup.js` — Node.js dependency checker (кросс-платформенный)
- `electron/agents/index.ts` — multi-agent orchestrator (Router → 5 специалистов → Verifier)
- `electron/agents/rlm-extensions.ts` — retryWithBackoff, LRUCache, selfConsistency, timedCall
- `electron/ai/goal-tracker.ts` — SQLite-backed goal tracking
- `electron/ai/autonomous-loop.ts` — цикл план→исполнение→проверка→откат→отчёт
- `electron/ai/rollback.ts` — автоматический бэкап файлов перед изменениями
- `electron/ai/mcp-adapter.ts` — Model Context Protocol integration
- `electron/ai/skills.ts` — динамическое создание навыков
- `electron/ai/gui-automation.ts` — 5 GUI tools (open_app, type_text, click, key_press, list_windows)
- `.cursorrules` — AI coding rules
- `.env.example` — example конфигурация

### Added — UI polishiing (4 критичных улучшения)
- **Markdown rendering** — `react-markdown` + `remark-gfm` (заголовки, списки, таблицы, ссылки, цитаты)
- **Code blocks** — `react-syntax-highlighter` с темой vscDarkPlus + кнопка Copy
- **Stop generation button** — красная кнопка StopCircle при стриминге
- **Copy button** — иконка Copy в header ответа ассистента

### Added — Новые компоненты
- `src/components/MarkdownRenderer.tsx` — markdown рендеринг с кастомными компонентами
- `src/components/CodeBlock.tsx` — code block с syntax highlighting + copy

### Changed
- `ChatPanel.tsx` — использует MarkdownRenderer вместо plain text, добавлены copy/stop buttons
- `useUNA.ts` — добавлен `stopGeneration()` функция
- `package.json` — добавлены react-markdown, remark-gfm, react-syntax-highlighter, @types/react-syntax-highlighter

---

## [v25] — 2026-07-29

### Added — Исследование расширено
- **PDF исследование**: 32 → 36 глав, 143 → 167 страниц
- Глава 33: Статус реализации v20→v24 (6 таблиц, 24 пункта что НЕ сделано)
- Глава 34: UI/UX анализ — ChatGPT vs Claude vs U.N.A. (24 параметра)
- Глава 35: Анализ стека — почему Electron+React, достаточно ли
- Глава 36: Roadmap и дистрибуция — успеем ли, .exe vs архив

---

## [v24] — 2026-07-29

### Added — 6 фич завершены

#### Фича 1: Bugfix
- `electron-store` v10 → v8.2.0 (CommonJS совместимость)
- Исправлен `tsconfig.json` (rootDir для prompts/system.ts)
- Добавлены 3 недостающих dispatch cases (analyze_screen, memory_save, memory_recall)
- TypeScript: 24 ошибки → 0

#### Фича 2: Web tools (3 инструмента)
- `web_search` — поиск через z-ai-web-dev-sdk
- `web_fetch` — загрузка страниц с HTML→text extraction
- `web_download` — скачивание файлов (streaming)
- SSRF protection (блок localhost, 127.x, 192.168.x, 10.x, IPv6 private, .local)
- Создан `electron/ai/web-tools.ts` (400+ строк)

#### Фича 3: Streaming LLM
- `chatWithToolsStream()` для Ollama (newline JSON) и Z.ai (SSE)
- IPC `chat:stream` с chunk events (text, tool_start, tool_result, tool_done)
- Кнопка-переключатель стриминга в ChatPanel
- Мигающий курсор, индикатор "печатает..."
- Корректная отписка от events

#### Фича 4: Code tools (4 инструмента)
- `edit_file` — replace/insert_at_line/append/delete_lines + backup
- `grep` — ripgrep с JS fallback, include glob, regex
- `apply_patch` — unified diff с context verification
- `run_code` — sandbox: timeout 30с, memory 256MB, blocked fs/child_process/net/process.env
- Создан `electron/ai/code-tools.ts` (770+ строк)

#### Фича 5: Onboarding wizard
- 5 шагов: приветствие → имя/формальность → работа/проекты → тон → приватность
- 8 полей профиля: name, language, formality, work_style, projects, tone, proactive, vision
- IPC handlers: onboarding:save, onboarding:check, onboarding:reset
- Кнопка "Пройти онбординг заново" в Settings
- Создан `src/components/OnboardingWizard.tsx` (490+ строк)

#### Фича 6: Tests
- Установлен vitest + @vitest/coverage-v8
- 82 теста, все pass
- Coverage: 52% statements, 41% branches, 46% functions
- 4 test suites: safety/classifier, web-tools, code-tools, code-tools-integration

### Statistics
- **19 инструментов** (12 базовых + 3 web + 4 code)
- **82 теста**, все pass
- **TypeScript**: 0 ошибок
- **Vite build**: 314 KB JS
- **Зрелость**: 6.8/10 → 7.8/10

---

## [v20] — 2026-06-24

### Initial version
- 12 инструментов (list_files, read_file, write_file, find_files, execute_command, system_info, take_screenshot, analyze_screen, memory_save, memory_recall, request_confirmation, ask_clarification)
- Multi-agent архитектура (5 специалистов)
- 5-уровневая память (Working/Session/Episodic/Semantic/Procedural)
- Emotional memory
- Background monitor
- Proactive suggestions
- UnaAvatar (7 эмоций, 6 статусов)
- MiniOverlay, QuickPalette, EmotionPanel, WorkPanel
- Zod validation для IPC
- Safety classifier (4 уровня)
- Whisper.cpp ASR, Piper TTS, openWakeWord
- Hybrid LLM (Ollama + Z.ai)
- Dynamic Prompt Engine
- 24 ошибки TypeScript (исправлены в v24)

---

## Соглашения о версиях

- **v0.x** — pre-alpha (разработка)
- **v1.x** — alpha (usable daily, но с bugs)
- **v2.x** — beta (стабильно, auto-update, подпись)
- **v3.x** — production 1.0 (полноценный продукт)

Текущая версия: **v27** (alpha, близко к v1.0)
