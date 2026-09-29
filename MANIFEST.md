# U.N.A. Desktop — Manifest of Project Files

Этот файл объясняет структуру проекта и указывает, где искать документацию. Полный перечень файлов
находится только в автоматически генерируемом приложении внизу страницы.

## Источник правды и проверка

- `scripts/manifest-files.json` — список, сгенерированный из дерева проекта.
- `node scripts/verify-manifest.js` — проверяет пропавшие и лишние файлы.
- `node scripts/sync-manifest.js` — обновляет JSON и приложение A после осознанного изменения дерева.

Не поддерживайте второй ручной список файлов: он неизбежно устаревает.

## Что должно оставаться в корне

| Файл | Назначение |
|---|---|
| `README.md` | Входная точка проекта и быстрый старт. |
| `INSTALL.md` | Практическая установка. |
| `CHANGELOG.md` | История изменений. |
| `HONEST_STATUS.md` | Срез фактического состояния и известных ограничений. |
| `UNA_MANIFEST.md` | Продуктовые и архитектурные принципы UNA. |
| `AGENTS.md` | Инструкции для AI-кодеров и незакоммиченные ручные правки. |
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | Сборка и зависимости. |
| `electron-builder.yml`, `start.*`, `install.bat` | Packaging и запуск. |

## Карта каталогов

```text
assets/     App icon и sprite assets.
docs/       Актуальная документация, research и исторические записи.
electron/   Main process, AI, memory, safety, tool registry и IPC.
prompts/    System prompts.
scripts/    Проверки, миграционные и сервисные скрипты.
src/        React renderer.
tests/      Unit и integration tests.
```

## Документация

### Актуальная

- [README](README.md) — общий обзор.
- [Architecture](docs/ARCHITECTURE.md) — процессы и границы системы.
- [Memory](docs/MEMORY.md) — SQLite/RLM/Pods.
- [Security](docs/SECURITY.md) — модель угроз и ограничения инструментов.
- [Hardware](docs/HARDWARE.md) — целевое ресурсное окружение.
- [Research map](docs/research/README.md) — внешний research, проверка актуальности и backlog.

### Историческая

- [Audit of the old research PDF](docs/history/audits/AUDIT_REPORT_2026-06-29.md).
- [Task board snapshot, July 2026](docs/history/planning/TASK_BOARD_2026-07.md).
- [Research PDF](docs/UNA_Research.pdf) — архивная версия исследования.

Исторические документы не являются спецификацией текущего runtime. При противоречии приоритет имеют
код, тесты, `AGENTS.md`, актуальный `HONEST_STATUS.md` и документы в `docs/research/`.

## Защищённые части дерева

Перед перемещением или удалением файлов всегда проверяйте ссылки через `rg`. В частности:

- `sprite_sheet.png` используется `scripts/extract_sprites.py` и не является мусором.
- Файлы в `assets/`, `prompts/`, `electron/`, `src/`, `tests/` нельзя классифицировать как архивные
  только по дате.
- Файлы, попадающие в пакет, задаются `package.json` / `electron-builder.yml`; packaging проверяется
  полноценной сборкой, а не только наличием в манифесте.

<!-- MANIFEST:AUTO:BEGIN -->
## Приложение A — автосписок файлов (генерируется)

> Источник правды: `scripts/manifest-files.json`. Обновление: `node scripts/sync-manifest.js`.
> Не редактировать вручную — блок перезаписывается.

> **Всего файлов:** 330 · **Сгенерировано:** 2026-09-23

```
## .github (3)
  .github/CODEOWNERS
  .github/workflows/ci.yml
  .github/workflows/release.yml

## (root) (24)
  .cursorrules
  .env.example
  .gitattributes
  .gitignore
  AGENTS.md
  CHANGELOG.md
  HONEST_STATUS.md
  INSTALL.md
  MANIFEST.md
  README.md
  UNA_MANIFEST.md
  electron-builder.yml
  index.html
  install.bat
  package.json
  postcss.config.js
  sprite_sheet.png
  start.bat
  start.ps1
  start.sh
  tailwind.config.js
  tsconfig.json
  vite.config.ts
  vitest.config.ts

## assets (35)
  assets/icon.png
  assets/sprites/una_00.png
  assets/sprites/una_01.png
  assets/sprites/una_02.png
  assets/sprites/una_03.png
  assets/sprites/una_04.png
  assets/sprites/una_05.png
  assets/sprites/una_06.png
  assets/sprites/una_07.png
  assets/sprites/una_08.png
  assets/sprites/una_09.png
  assets/sprites/una_10.png
  assets/sprites/una_11.png
  assets/sprites/una_12.png
  assets/sprites/una_13.png
  assets/sprites/una_14.png
  assets/sprites/una_15.png
  assets/sprites/una_16.png
  assets/sprites/una_17.png
  assets/sprites/una_18.png
  assets/sprites/una_19.png
  assets/sprites/una_20.png
  assets/sprites/una_21.png
  assets/sprites/una_22.png
  assets/sprites/una_23.png
  assets/sprites/una_24.png
  assets/sprites/una_25.png
  assets/sprites/una_26.png
  assets/sprites/una_27.png
  assets/sprites/una_28.png
  assets/sprites/una_29.png
  assets/sprites/una_30.png
  assets/sprites/una_31.png
  assets/sprites/una_32.png
  assets/sprites/una_33.png

## docs (78)
  docs/ARCHITECTURE.md
  docs/BACKGROUND.md
  docs/CODE.md
  docs/GRAPHITI_MEMORY.md
  docs/HARDWARE.md
  docs/INSTALL.md
  docs/JOURNAL.md
  docs/MASCOT_TZ.md
  docs/MEMORY.md
  docs/MENTOR_BRIEFING.md
  docs/Phase2/UNA_Phase2_Step1.5_Routing_Reconciliation_Brief.md
  docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Adaptation.md
  docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md
  docs/Phase2/UNA_Phase2_Step2_Prompt_for_Lead.md
  docs/SECURITY.md
  docs/UNA_Research.pdf
  docs/design/GRAMMAR_INTERACTION_v0.1.md
  docs/design/GRAMMAR_MOTION_v0.1.md
  docs/design/GRAMMAR_VISUAL_v0.1.md
  docs/design/SCENE_COMPOSITION_v0.2.md
  docs/design/UNA_PRESENCE_DESIGN_v0.1.md
  docs/design/prototype-a1-a3/README.md
  docs/design/prototype-a1-a3/index.html
  docs/design/prototype-a1-a3/prototype.css
  docs/design/prototype-a1-a3/prototype.js
  docs/design/prototype-scene-v0.2/README.md
  docs/design/prototype-scene-v0.2/index.html
  docs/design/prototype-scene-v0.2/scene.css
  docs/design/prototype-scene-v0.2/scene.js
  docs/design/wireframes/01-idle.md
  docs/design/wireframes/02-speaking.md
  docs/design/wireframes/03-working.md
  docs/design/wireframes/04-sleeping.md
  docs/design/wireframes/05-system-aware.md
  docs/history/README.md
  docs/history/audits/AUDIT_REPORT_2026-06-29.md
  docs/history/planning/TASK_BOARD_2026-07.md
  docs/reports/k3/2026-09-22-task-001.md
  docs/reports/k3/2026-09-23-wave2-task-002-011.md
  docs/reports/k3/2026-09-24-task-012.md
  docs/reports/k3/2026-09-24-task-013.md
  docs/reports/k3/2026-09-24-task-014.md
  docs/reports/k3/2026-09-24-task-015.md
  docs/reports/k3/README.md
  docs/research/README.md
  docs/research/UNA_Deep_Research_v4.1_2026-09-15.md
  docs/research/UNA_Deep_Research_v4.2_2026-09-18.md
  docs/research/architecture-synthesis-cognitive-runtime.md
  docs/research/catalog.md
  docs/research/decision-log.md
  docs/research/implementation-map.md
  docs/research/k3-autonomous-workzone-proposal.md
  docs/research/needle-action-model.md
  docs/research/phase-1-scope.md
  docs/research/phase-2-memory-research.md
  docs/research/phase-2-step-1.5-routing-reconciliation.md
  docs/research/phase-2-step-2-cognitive-routing-proposal.md
  docs/research/research-backlog.md
  docs/research/system-one-decision-models.md
  docs/research/task-context-isolation.md
  docs/research/una-gap-map.md
  docs/research/verification-log.md
  docs/tasks/k3/TASK-001-compression-tests.md
  docs/tasks/k3/TASK-002-resource-manager-tests.md
  docs/tasks/k3/TASK-003-states-modes-tests.md
  docs/tasks/k3/TASK-004-attention-manager-tests.md
  docs/tasks/k3/TASK-005-monologue-tests.md
  docs/tasks/k3/TASK-006-world-model-tests.md
  docs/tasks/k3/TASK-007-meta-learning-tests.md
  docs/tasks/k3/TASK-008-identity-tests.md
  docs/tasks/k3/TASK-009-background-monitor-tests.md
  docs/tasks/k3/TASK-010-proactive-tests.md
  docs/tasks/k3/TASK-011-life-loop-tests.md
  docs/tasks/k3/TASK-012-executive-tests.md
  docs/tasks/k3/TASK-013-regex-fixes.md
  docs/tasks/k3/TASK-014-wave3-state-tests.md
  docs/tasks/k3/TASK-015-routing-tests.md
  docs/tasks/k3/TASK-016-wave3-media-review.md

## electron (82)
  electron/agents/index.ts
  electron/agents/rlm-extensions.ts
  electron/ai/README.md
  electron/ai/app-resolver.ts
  electron/ai/asr.ts
  electron/ai/attention-manager.ts
  electron/ai/autonomous-loop.ts
  electron/ai/background-monitor.ts
  electron/ai/code-tools.ts
  electron/ai/compression.ts
  electron/ai/config.ts
  electron/ai/dynamic-prompt/index.ts
  electron/ai/embed.ts
  electron/ai/env-loader.ts
  electron/ai/executive.ts
  electron/ai/fast-path.ts
  electron/ai/goal-tracker.ts
  electron/ai/gui-automation.ts
  electron/ai/identity.ts
  electron/ai/intent.ts
  electron/ai/life-loop.ts
  electron/ai/llm.ts
  electron/ai/mcp-adapter.ts
  electron/ai/meta-learning.ts
  electron/ai/modes.ts
  electron/ai/monologue.ts
  electron/ai/proactive.ts
  electron/ai/resource-manager.ts
  electron/ai/rollback.ts
  electron/ai/router.ts
  electron/ai/self-review.ts
  electron/ai/semantic-router.ts
  electron/ai/skills.ts
  electron/ai/states.ts
  electron/ai/tool-loop.ts
  electron/ai/tts.ts
  electron/ai/vram-gate.ts
  electron/ai/web-tools.ts
  electron/ai/work-context.ts
  electron/ai/world-model.ts
  electron/data/backup.ts
  electron/main.ts
  electron/memory/README.md
  electron/memory/knowledge-graph.ts
  electron/memory/manager.ts
  electron/memory/pods.ts
  electron/memory/rlm.ts
  electron/memory/store.ts
  electron/preload.ts
  electron/reminders/index.ts
  electron/safety/classifier.ts
  electron/telegram/index.ts
  electron/tools/definitions/analyze-screen.ts
  electron/tools/definitions/apply-patch.ts
  electron/tools/definitions/ask-clarification.ts
  electron/tools/definitions/click.ts
  electron/tools/definitions/create-reminder.ts
  electron/tools/definitions/edit-file.ts
  electron/tools/definitions/execute-command.ts
  electron/tools/definitions/find-files.ts
  electron/tools/definitions/grep.ts
  electron/tools/definitions/key-press.ts
  electron/tools/definitions/list-files.ts
  electron/tools/definitions/list-windows.ts
  electron/tools/definitions/memory-recall.ts
  electron/tools/definitions/memory-save.ts
  electron/tools/definitions/open-app.ts
  electron/tools/definitions/read-file.ts
  electron/tools/definitions/request-confirmation.ts
  electron/tools/definitions/run-code.ts
  electron/tools/definitions/system-info.ts
  electron/tools/definitions/take-screenshot.ts
  electron/tools/definitions/type-text.ts
  electron/tools/definitions/web-download.ts
  electron/tools/definitions/web-fetch.ts
  electron/tools/definitions/web-search.ts
  electron/tools/definitions/write-file.ts
  electron/tools/helpers.ts
  electron/tools/index.ts
  electron/tools/registry.ts
  electron/tsconfig.json
  electron/validation/schemas.ts

## prompts (1)
  prompts/system.ts

## scripts (15)
  scripts/apply-m3-mcp.mjs
  scripts/apply-m4-audit-doc.mjs
  scripts/apply-m4-briefing.mjs
  scripts/apply-m4-honesty.mjs
  scripts/apply-m5-router.mjs
  scripts/apply-manifest-doc-fix.mjs
  scripts/extract_sprites.py
  scripts/m3-smoke-mcp.mjs
  scripts/pre-build-check.js
  scripts/read-pdf.js
  scripts/setup.js
  scripts/sync-manifest.js
  scripts/test-code-tools.ts
  scripts/test-web-tools.ts
  scripts/verify-manifest.js

## src (60)
  src/App.tsx
  src/components/ChatPanel.tsx
  src/components/CodeBlock.tsx
  src/components/ConfirmationDialog.tsx
  src/components/EmotionPanel.tsx
  src/components/ErrorBoundary.tsx
  src/components/FilesPanel.tsx
  src/components/MarkdownRenderer.tsx
  src/components/MemoryPanel.tsx
  src/components/MiniOverlay.tsx
  src/components/OnboardingWizard.tsx
  src/components/Orb.tsx
  src/components/QuickPalette.tsx
  src/components/RemindersPanel.tsx
  src/components/RiveMascot.tsx
  src/components/SettingsPanel.tsx
  src/components/UnaAvatar.tsx
  src/components/UnaMascot.tsx
  src/components/WorkPanel.tsx
  src/components/ui/animated-icons/activity.tsx
  src/components/ui/animated-icons/bell.tsx
  src/components/ui/animated-icons/bot-message-square.tsx
  src/components/ui/animated-icons/brain.tsx
  src/components/ui/animated-icons/briefcase-business.tsx
  src/components/ui/animated-icons/check.tsx
  src/components/ui/animated-icons/chevron-down.tsx
  src/components/ui/animated-icons/chevron-right.tsx
  src/components/ui/animated-icons/circle-check.tsx
  src/components/ui/animated-icons/clock.tsx
  src/components/ui/animated-icons/cloud-upload.tsx
  src/components/ui/animated-icons/coffee.tsx
  src/components/ui/animated-icons/cog.tsx
  src/components/ui/animated-icons/copy.tsx
  src/components/ui/animated-icons/cpu.tsx
  src/components/ui/animated-icons/delete.tsx
  src/components/ui/animated-icons/download.tsx
  src/components/ui/animated-icons/eye.tsx
  src/components/ui/animated-icons/file-text.tsx
  src/components/ui/animated-icons/folders.tsx
  src/components/ui/animated-icons/frown.tsx
  src/components/ui/animated-icons/heart.tsx
  src/components/ui/animated-icons/index.ts
  src/components/ui/animated-icons/mic.tsx
  src/components/ui/animated-icons/minimize.tsx
  src/components/ui/animated-icons/plus.tsx
  src/components/ui/animated-icons/send.tsx
  src/components/ui/animated-icons/smile.tsx
  src/components/ui/animated-icons/sparkles.tsx
  src/components/ui/animated-icons/volume-2.tsx
  src/components/ui/animated-icons/volume-x.tsx
  src/components/ui/animated-icons/wrench.tsx
  src/hooks/useUNA.ts
  src/i18n/index.tsx
  src/i18n/locales.ts
  src/lib/api.ts
  src/lib/store.ts
  src/lib/toast-utils.ts
  src/lib/utils.ts
  src/main.tsx
  src/styles/index.css

## tests (32)
  tests/ai/attention-manager.test.ts
  tests/ai/background-monitor.test.ts
  tests/ai/code-tools-integration.test.ts
  tests/ai/code-tools.test.ts
  tests/ai/compression.test.ts
  tests/ai/executive.test.ts
  tests/ai/fast-path.test.ts
  tests/ai/goal-tracker.test.ts
  tests/ai/identity.test.ts
  tests/ai/intent.test.ts
  tests/ai/life-loop.test.ts
  tests/ai/meta-learning.test.ts
  tests/ai/modes.test.ts
  tests/ai/monologue.test.ts
  tests/ai/proactive.test.ts
  tests/ai/resource-manager.test.ts
  tests/ai/rollback.test.ts
  tests/ai/router.test.ts
  tests/ai/semantic-router.test.ts
  tests/ai/states.test.ts
  tests/ai/tool-loop.test.ts
  tests/ai/web-tools-integration.test.ts
  tests/ai/web-tools.test.ts
  tests/ai/work-context.test.ts
  tests/ai/world-model.test.ts
  tests/memory/manager.test.ts
  tests/memory/migration.test.ts
  tests/memory/rlm.test.ts
  tests/memory/store.test.ts
  tests/safety/classifier.test.ts
  tests/safety/indirect-injection.test.ts
  tests/tools/confirmation.test.ts

```
<!-- MANIFEST:AUTO:END -->
