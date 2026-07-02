# U.N.A. Desktop — Manifest of All Files

> **Этот файл — единый источник правды о структуре проекта.**
> При каждой модификации U.N.A. сверяйтесь с этим манифестом.
> Если файл пропал — он должен быть восстановлен.
>
> **Последнее обновление:** v40 (1 июля 2026) — синхронизировано с реальным деревом
> **Всего файлов:** 94
> **Проверка:** `node scripts/verify-manifest.js`
>
> ⚠️ Список файлов в этом документе и в `scripts/verify-manifest.js` (`EXPECTED_FILES`)
> должны совпадать. При добавлении/удалении файла правятся **оба места**.

---

## Структура проекта

```
una-desktop/
├── .cursorrules              # AI coding rules (Cursor, Claude, GPT)
├── .env.example              # Example конфигурация (ZAI_API_KEY, и т.д.)
├── .gitignore                # Git ignore rules
├── README.md                 # Project overview
├── MANIFEST.md               # ← ЭТОТ ФАЙЛ
├── CHANGELOG.md              # История версий
├── INSTALL.md                # Инструкция по установке
├── package.json              # npm dependencies + scripts
├── tsconfig.json             # TypeScript config (renderer)
├── vite.config.ts            # Vite bundler config
├── vitest.config.ts          # Vitest test config
├── tailwind.config.js        # Tailwind CSS config
├── postcss.config.js         # PostCSS config
├── index.html                # Vite entry point
├── start.bat                 # Windows launcher (ASCII, CRLF)
├── install.bat               # Windows installer (ASCII, CRLF)
├── start.ps1                 # PowerShell launcher (Unicode-safe)
├── start.sh                  # Linux/macOS launcher
│
├── assets/
│   └── icon.png              # App icon
│
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # Архитектура проекта
│   ├── BACKGROUND.md         # Background и философия
│   ├── CODE.md               # Code conventions
│   ├── HARDWARE.md           # Требования к железу
│   ├── INSTALL.md            # Установка (детально)
│   ├── MEMORY.md             # Архитектура памяти
│   └── SECURITY.md           # Безопасность
│
├── electron/                 # Backend (main process, Node.js)
│   ├── main.ts               # Entry point, IPC handlers
│   ├── preload.ts            # contextBridge (renderer ↔ main)
│   ├── tsconfig.json         # TypeScript config (electron)
│   │
│   ├── ai/                   # AI modules
│   │   ├── llm.ts            # LLM provider (Ollama + Z.ai, streaming)
│   │   ├── config.ts         # Unified config store (единый electron-store)
│   │   ├── intent.ts         # Intent detector → фильтр инструментов
│   │   ├── tool-loop.ts      # Единый цикл function-calling (executeToolLoop)
│   │   ├── asr.ts            # ASR (whisper.cpp)
│   │   ├── tts.ts            # TTS (Piper)
│   │   ├── web-tools.ts      # web_search, web_fetch, web_download + SSRF
│   │   ├── code-tools.ts     # edit_file, grep, apply_patch, run_code
│   │   ├── goal-tracker.ts   # SQLite-backed goal tracking
│   │   ├── autonomous-loop.ts# Цикл план→исполнение→проверка→откат
│   │   ├── rollback.ts       # Автоматический бэкап файлов
│   │   ├── mcp-adapter.ts    # MCP integration (stdio + http)
│   │   ├── skills.ts         # Динамические навыки
│   │   ├── gui-automation.ts # GUI tools (open_app, click, type, key_press, list_windows)
│   │   ├── background-monitor.ts # Silent context collection
│   │   ├── proactive.ts      # Proactive suggestions (break/git/mood)
│   │   ├── work-context.ts   # Git repos, recent files, session
│   │   └── dynamic-prompt/
│   │       └── index.ts      # Dynamic prompt builder
│   │
│   ├── agents/               # Multi-agent orchestrator
│   │   ├── index.ts          # Router → 5 специалистов → Verifier
│   │   └── rlm-extensions.ts # retry, cache, selfConsistency, timeout
│   │
│   ├── memory/               # SQLite storage + RLM
│   │   ├── store.ts          # 5-level memory (Working/Session/Episodic/Semantic/Procedural)
│   │   └── rlm.ts            # RLM: HOT/WARM/COLD + memory tokens
│   │
│   ├── safety/               # Safety system
│   │   └── classifier.ts     # 4-level risk classifier + protected files
│   │
│   ├── tools/                # Tool definitions + dispatch
│   │   └── index.ts          # 24 tools + dispatchTool
│   │
│   └── validation/           # Zod schemas
│       └── schemas.ts        # IPC message validation
│
├── src/                      # Frontend (renderer, React 19)
│   ├── App.tsx               # Main app component
│   ├── main.tsx              # React entry point
│   │
│   ├── components/           # UI components
│   │   ├── ChatPanel.tsx     # Chat interface (markdown, code, copy, stop)
│   │   ├── MarkdownRenderer.tsx # Markdown rendering (react-markdown)
│   │   ├── CodeBlock.tsx     # Code block с syntax highlighting + copy
│   │   ├── OnboardingWizard.tsx # First-run wizard (5 шагов)
│   │   ├── UnaAvatar.tsx     # Canvas avatar (7 эмоций, 6 статусов)
│   │   ├── UnaMascot.tsx     # Альтернативный аватар-маскот
│   │   ├── RiveMascot.tsx    # Rive-анимированный маскот (@rive-app)
│   │   ├── MiniOverlay.tsx   # Floating mini-chat
│   │   ├── QuickPalette.tsx  # Spotlight-style commands
│   │   ├── EmotionPanel.tsx  # Emotion dashboard
│   │   ├── WorkPanel.tsx     # Work context display
│   │   ├── SettingsPanel.tsx # Settings (LLM, ASR, TTS, onboarding reset)
│   │   ├── MemoryPanel.tsx   # Memory facts viewer
│   │   ├── FilesPanel.tsx    # Filesystem viewer
│   │   ├── ConfirmationDialog.tsx # Dangerous operation confirm
│   │   ├── ErrorBoundary.tsx # React error boundary
│   │   └── Orb.tsx           # Animated orb (legacy)
│   │
│   ├── hooks/
│   │   └── useUNA.ts         # Main hook (sendMessage, sendMessageStream, stopGeneration)
│   │
│   ├── lib/
│   │   ├── store.ts          # Zustand store
│   │   ├── api.ts            # TypeScript types for window.una
│   │   └── toast-utils.ts    # Toast notifications
│   │
│   └── styles/
│       └── index.css         # Global styles + Tailwind
│
├── prompts/
│   └── system.ts             # System prompt ("напарник, не слуга")
│
├── scripts/                  # Utility scripts
│   ├── setup.js              # Dependency checker + launcher
│   ├── verify-manifest.js    # File integrity checker
│   ├── test-web-tools.ts     # Web tools smoke tests
│   └── test-code-tools.ts    # Code tools smoke tests
│
└── tests/                    # Vitest test suites
    ├── ai/
    │   ├── web-tools.test.ts           # 43 unit tests (SSRF, URLs)
    │   ├── web-tools-integration.test.ts # 13 integration tests (real HTTP)
    │   ├── code-tools.test.ts          # 7 unit tests (regex, diff, dangerous code)
    │   └── code-tools-integration.test.ts # 19 integration tests (edit_file, apply_patch)
    └── safety/
        └── classifier.test.ts          # 26 tests (forbidden, dangerous, protected files)
```

---

## Полный список файлов (94 файла)

> Нумерация сплошная. Этот список = `EXPECTED_FILES` в `scripts/verify-manifest.js`.

### Корневые файлы (20)
| # | Файл | Назначение | Размер |
|---|------|-----------|--------|
| 1 | `.cursorrules` | AI coding rules | 6 KB |
| 2 | `.env.example` | Example конфигурация (ZAI_API_KEY, и т.д.) | 1 KB |
| 3 | `.gitignore` | Git ignore rules | 1 KB |
| 4 | `README.md` | Project overview | 6 KB |
| 5 | `MANIFEST.md` | Этот файл | ~12 KB |
| 6 | `CHANGELOG.md` | История версий | ~5 KB |
| 7 | `INSTALL.md` | Инструкция по установке | ~4 KB |
| 8 | `AGENTS.md` | Памятка для ИИ-кодеров (ручные правки, не в git) | 13 KB |
| 9 | `AUDIT_REPORT.md` | Отчёт аудита достоверности исследования (PDF) | 14 KB |
| 10 | `HONEST_STATUS.md` | Честный статус что работает / не работает | 9 KB |
| 11 | `UNA_Research.pdf` | Исследование (32+ глав, 156 стр.) | 537 KB |
| 12 | `package.json` | npm dependencies + scripts | 3.5 KB |
| 13 | `tsconfig.json` | TypeScript config (renderer) | 1 KB |
| 14 | `vite.config.ts` | Vite bundler config | 1 KB |
| 15 | `vitest.config.ts` | Vitest test config | 1 KB |
| 16 | `tailwind.config.js` | Tailwind CSS config | 1 KB |
| 17 | `postcss.config.js` | PostCSS config | 1 KB |
| 18 | `index.html` | Vite entry point | 1 KB |
| 19 | `start.bat` | Windows launcher | 1 KB |
| 20 | `install.bat` | Windows installer | 2 KB |
| 21 | `start.ps1` | PowerShell launcher (Unicode-safe) | 5 KB |
| 22 | `start.sh` | Linux/macOS launcher | 2 KB |

### assets/ (1 файл)
| # | Файл | Назначение |
|---|------|-----------|
| 23 | `assets/icon.png` | App icon |

### docs/ (8 файлов)
| # | Файл | Назначение |
|---|------|-----------|
| 24 | `docs/ARCHITECTURE.md` | Архитектура проекта |
| 25 | `docs/BACKGROUND.md` | Background и философия |
| 26 | `docs/CODE.md` | Code conventions |
| 27 | `docs/HARDWARE.md` | Требования к железу |
| 28 | `docs/INSTALL.md` | Установка (детально) |
| 29 | `docs/MEMORY.md` | Архитектура памяти |
| 30 | `docs/SECURITY.md` | Безопасность |
| 31 | `docs/MASCOT_TZ.md` | ТЗ для маскота/аватара |

### electron/ (25 файлов)
| # | Файл | Назначение | Строк |
|---|------|-----------|-------|
| 32 | `electron/main.ts` | Entry point, IPC handlers | ~610 |
| 33 | `electron/preload.ts` | contextBridge | ~70 |
| 34 | `electron/tsconfig.json` | TS config | ~20 |
| 35 | `electron/ai/llm.ts` | LLM provider (Ollama+cloud, streaming) | ~600 |
| 36 | `electron/ai/config.ts` | Unified config store (единый electron-store) | ~220 |
| 37 | `electron/ai/intent.ts` | Intent detector → фильтр инструментов | ~145 |
| 38 | `electron/ai/tool-loop.ts` | Единый цикл function-calling (executeToolLoop) | ~350 |
| 39 | `electron/ai/asr.ts` | ASR (whisper.cpp) | ~120 |
| 40 | `electron/ai/tts.ts` | TTS (Piper) | ~130 |
| 41 | `electron/ai/web-tools.ts` | web_search/fetch/download + SSRF | ~400 |
| 42 | `electron/ai/code-tools.ts` | edit_file/grep/apply_patch/run_code | ~770 |
| 43 | `electron/ai/goal-tracker.ts` | Goal tracking (SQLite) | ~220 |
| 44 | `electron/ai/autonomous-loop.ts` | Цикл план→исполнение→проверка→откат | ~270 |
| 45 | `electron/ai/rollback.ts` | Backup system | ~230 |
| 46 | `electron/ai/mcp-adapter.ts` | MCP integration (stdio + http) | ~330 |
| 47 | `electron/ai/skills.ts` | Skills system | ~250 |
| 48 | `electron/ai/gui-automation.ts` | 5 GUI tools | ~330 |
| 49 | `electron/ai/background-monitor.ts` | Background context | ~120 |
| 50 | `electron/ai/proactive.ts` | Proactive suggestions | ~200 |
| 51 | `electron/ai/work-context.ts` | Work context | ~350 |
| 52 | `electron/ai/dynamic-prompt/index.ts` | Dynamic prompt builder | ~200 |
| 53 | `electron/agents/index.ts` | Multi-agent orchestrator | ~400 |
| 54 | `electron/agents/rlm-extensions.ts` | retry/cache/selfConsistency | ~280 |
| 55 | `electron/memory/store.ts` | SQLite: 5-level memory | ~420 |
| 56 | `electron/memory/rlm.ts` | RLM: HOT/WARM/COLD + memory tokens | ~280 |
| 57 | `electron/safety/classifier.ts` | Safety classifier (4 уровня) | ~155 |
| 58 | `electron/tools/index.ts` | 24 tools + dispatch | ~820 |
| 59 | `electron/validation/schemas.ts` | Zod schemas | ~150 |

### src/ (22 файла)
| # | Файл | Назначение | Строк |
|---|------|-----------|-------|
| 60 | `src/App.tsx` | Main app | ~230 |
| 61 | `src/main.tsx` | React entry | ~25 |
| 62 | `src/components/ChatPanel.tsx` | Chat UI + блок рассуждений `<think>` | ~300 |
| 63 | `src/components/MarkdownRenderer.tsx` | Markdown rendering | ~140 |
| 64 | `src/components/CodeBlock.tsx` | Code block + copy | ~110 |
| 65 | `src/components/OnboardingWizard.tsx` | Onboarding (5 шагов) | ~490 |
| 66 | `src/components/UnaAvatar.tsx` | Canvas avatar (7 эмоций, 6 статусов) | ~450 |
| 67 | `src/components/UnaMascot.tsx` | Альтернативный аватар-маскот | TBD |
| 68 | `src/components/RiveMascot.tsx` | Rive-анимированный маскот | TBD |
| 69 | `src/components/MiniOverlay.tsx` | Floating chat | ~250 |
| 70 | `src/components/QuickPalette.tsx` | Spotlight | ~150 |
| 71 | `src/components/EmotionPanel.tsx` | Emotion dashboard | ~190 |
| 72 | `src/components/WorkPanel.tsx` | Work context | ~230 |
| 73 | `src/components/SettingsPanel.tsx` | Settings | ~240 |
| 74 | `src/components/MemoryPanel.tsx` | Memory viewer | ~90 |
| 75 | `src/components/FilesPanel.tsx` | Filesystem | ~120 |
| 76 | `src/components/ConfirmationDialog.tsx` | Confirm dialog | ~90 |
| 77 | `src/components/ErrorBoundary.tsx` | Error boundary | ~50 |
| 78 | `src/components/Orb.tsx` | Legacy orb | ~130 |
| 79 | `src/hooks/useUNA.ts` | Main hook (sendMessage, stream, stop) | ~290 |
| 80 | `src/lib/store.ts` | Zustand store | ~135 |
| 81 | `src/lib/api.ts` | API types | ~80 |
| 82 | `src/lib/toast-utils.ts` | Toast utils | ~30 |
| 83 | `src/styles/index.css` | Global styles + Tailwind | ~60 |

### prompts/ (1 файл)
| # | Файл | Назначение |
|---|------|-----------|
| 84 | `prompts/system.ts` | System prompt («напарник, не слуга») |

### scripts/ (5 файлов)
| # | Файл | Назначение |
|---|------|-----------|
| 85 | `scripts/setup.js` | Dependency checker + launcher |
| 86 | `scripts/verify-manifest.js` | File integrity checker |
| 87 | `scripts/pre-build-check.js` | Pre-build validation (main path, author, deps) |
| 88 | `scripts/test-web-tools.ts` | Web tools smoke tests |
| 89 | `scripts/test-code-tools.ts` | Code tools smoke tests |

### tests/ (5 файлов)
| # | Файл | Назначение |
|---|------|-----------|
| 90 | `tests/ai/web-tools.test.ts` | 43 unit tests (SSRF, URLs) |
| 91 | `tests/ai/web-tools-integration.test.ts` | 13 integration tests (real HTTP) |
| 92 | `tests/ai/code-tools.test.ts` | 7 unit tests (regex, diff, dangerous code) |
| 93 | `tests/ai/code-tools-integration.test.ts` | 19 integration tests (edit_file, apply_patch) |
| 94 | `tests/safety/classifier.test.ts` | 88 tests (forbidden, dangerous, protected files) |

> ⚠️ Кол-во тестов в файле — на момент аудита. Фактическое: `npx vitest run` (170 всего).

---

## Критичные файлы (НЕ удалять!)

Эти файлы — ядро проекта. Если любой из них пропадёт, U.N.A. перестанет работать:

### Backend критичные
- `electron/main.ts` — entry point, IPC handlers
- `electron/preload.ts` — IPC bridge
- `electron/ai/llm.ts` — LLM (streaming + non-streaming)
- `electron/ai/tool-loop.ts` — единый цикл function-calling (точка правды для chat:send/chat:stream)
- `electron/ai/config.ts` — unified config store
- `electron/ai/intent.ts` — фильтр инструментов по намерению
- `electron/tools/index.ts` — 24 tools + dispatch
- `electron/safety/classifier.ts` — safety
- `electron/memory/store.ts` — SQLite (5-level memory)
- `electron/memory/rlm.ts` — RLM (HOT/WARM/COLD, memory tokens)
- `electron/ai/code-tools.ts` — code tools
- `electron/ai/web-tools.ts` — web tools

> `electron/agents/index.ts` (multi-agent) — написан, но **не импортируется** в main.ts. См. HONEST_STATUS.md.

### Frontend критичные
- `src/App.tsx` — main app
- `src/components/ChatPanel.tsx` — chat
- `src/components/MarkdownRenderer.tsx` — markdown
- `src/components/CodeBlock.tsx` — code blocks
- `src/components/OnboardingWizard.tsx` — onboarding
- `src/hooks/useUNA.ts` — main hook
- `src/lib/store.ts` — state
- `src/lib/api.ts` — types

### Infrastructure критичные
- `package.json` — dependencies
- `electron/tsconfig.json` — TS config
- `vite.config.ts` — bundler
- `prompts/system.ts` — system prompt
- `start.bat`, `install.bat`, `start.sh` — launchers
- `scripts/setup.js` — dependency checker

---

## Как использовать этот манифест

### При модификации U.N.A.

1. **Перед изменениями:** запусти `node scripts/verify-manifest.js` — проверит что все файлы на месте
2. **После изменений:** обнови этот MANIFEST.md (добавь новые файлы, удали удалённые)
3. **Перед архивацией:** запусти verify-manifest.js снова

### При восстановлении

Если файл пропал:
1. Найди его в этом манифесте (раздел "Полный список файлов")
2. Восстанови из git history (`git log -- <file>`) или из последнего архива
3. Запусти `node scripts/verify-manifest.js` для подтверждения

### Git защита

> ⚠️ **Текущее состояние:** git в проекте **НЕ инициализирован** (проверено).
> Это означает, что восстановить случайно удалённый файл можно только из бэкапа/архива.
> Рекомендуется инициализировать git при первой возможности (см. ниже).

```bash
# Инициализация git (рекомендуется сделать до следующих изменений)
git init
git add -A
git commit -m "Initial commit: U.N.A. v40 (docs sync)"

# Пуш на GitHub (создай repo на github.com сначала)
git remote add origin https://github.com/USERNAME/una-desktop.git
git branch -M main
git push -u origin main
```

После пуша на GitHub — файлы защищены навсегда. Даже если локально всё пропадёт, можно сделать `git clone`.

---

## Версионирование

| Версия | Дата | Что добавлено |
|--------|------|---------------|
| v20 | 24 июн 2026 | Базовая версия (12 инструментов) |
| v24 | 29 июл 2026 | 6 фич: bugfix, web tools, streaming, code tools, onboarding, tests |
| v25 | 29 июл 2026 | Исследование расширено (36 глав) |
| v26 | 29 июл 2026 | Восстановлены 12 файлов + UI polishing (markdown, code, copy, stop) |
| v27 | 29 июл 2026 | MANIFEST.md + verify-manifest.js |
| v28–29 | 29 июл 2026 | Windows .bat compatibility; pre-build-check.js, main path + author fixes |
| v30+ | 30 июн 2026 | SSE fix, env filter, tool-loop вынесен в единый модуль, RLM, intent-фильтр, смена модели на gemma4 |
| v37 | 30 июн 2026 | Intent detector + thinking mode (`<think>`), 8K контекст RLM |
| v40 | 1 июл 2026 | **Документация синхронизирована с кодом** (HONEST_STATUS, MANIFEST, verify-manifest.js) |

> Подробности правок — в `CHANGELOG.md` и `AGENTS.md` (разделы «Сделанные правки» и «Новые правки v37»).

---

## Связанные документы

- `README.md` — краткий обзор проекта
- `INSTALL.md` — инструкция по установке
- `CHANGELOG.md` — история изменений
- `AGENTS.md` — памятка для ИИ-кодеров (ручные правки, не в git)
- `HONEST_STATUS.md` — честный статус что работает / не работает
- `AUDIT_REPORT.md` — отчёт аудита достоверности исследования
- `docs/ARCHITECTURE.md` — архитектура
- `docs/MEMORY.md` — архитектура памяти
- `docs/MASCOT_TZ.md` — ТЗ для маскота/аватара
- `UNA_Research.pdf` — исследование (32+ глав, 156 страниц)
