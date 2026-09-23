# Ежедневник — UNA-Desktop

> Рабочий журнал: что сделано за день, короткими отметками.
> Подробности — в `git log` и `docs/history/`. Правила ведения:
> - одна секция = один рабочий день, дата в ISO (`ГГГГ-ММ-ДД`);
> - новые дни добавляются **сверху**;
> - пункт = тема → суть + артефакт (файл / коммит / тест);
> - в конце дня — счётчики проверок (tsc / vitest / manifest), если гонялись;
> - не дублируем changelog-прозу: журнал — это оглавление дня, не отчёт.

---

## 2026-09-22

**DEC-021 — автономная рабочая зона K3 (lead утвердил; оформил архитектурный совет):**
- `docs/research/k3-autonomous-workzone-proposal.md` — спецификация: модель контура, матрица разрешений (+дополнения совета: `electron/safety/**`, workflows, `package*.json`, `AGENTS.md`), DEC-граница, enforcement, контракт отчёта, стоп-условия
- `docs/research/decision-log.md` — DEC-021 (Accepted): K3 в ветке `k3/*`, цикл анализ→код→тесты→commit→отчёт; enforcement гейтами, не инструкциями
- `.github/CODEOWNERS` — критичные пути под review lead (@MaxSC2)
- `docs/reports/k3/README.md` — контракт отчёта K3
- находка: `sync-manifest` подхватил `.review-profile/` (кэш-профиль дизайнера) в манифест — кандидат на EXCLUDE (PROPOSED, не исправлено — вне scope задачи)

**Волна архивариуса 2026-09-17/18 ушла в git:** коммит `c186f0b` (DEC-013, Pass 5/6, Phase2 Step1.5/2 briefs, Needle, DR v4.2) — отложенный «коммит за кодером» выполнен в рамках выданной автономии.

**Подготовка первой задачи K3 (DEC-021, директивы lead'а):**
- ветка `k3/task-001-compression-tests` (push в origin) + worktree `../UNA-k3-workzone`; `.env` отсутствует по построению (не в git, локально не существует)
- `docs/tasks/k3/TASK-001-compression-tests.md` — спецификация: приёмочные тесты на `electron/ai/compression.ts` (implementation-map пробел №5); продакшн-код не менять, расхождения → отчёт (контракт P1-2)
- `implementation-map.md` — пробел №5 аннотирован (TASK-001 назначена), добавлен пробел №6: `.review-profile/` в манифесте → pending-задача (lead), не начата
- окружение K3: node_modules зеркалирован с основного дерева robocopy (npm install в worktree давал битую распаковку optional-deps — npm bug #4828: rolldown/electron/undici-types); провалидировано: vitest 250/250 ✓, tsc electron 0 ✓
- статус: READY; блокер запуска — ruleset на `main` (lead, GitHub UI)

**Проверки:** verify-manifest 329/329 (0 пропущено, 0 лишних); tsc/vitest не гонялись — docs-only.

**Коммиты:** `c186f0b` (архивариус 09-17/18), `21a3214` (DEC-021 + CODEOWNERS + контракт отчётов) + этот коммит (TASK-001 + pending-задача).

**Дальше:** lead — ruleset на `main` в GitHub UI → старт K3 по TASK-001.

---

## 2026-09-17

**Архитектура Phase 2 — раскидка раздумий lead'а (роль контекст-архивариуса, DEC-013):**
- `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Adaptation.md` — адаптация Step 2 по коду: лестница L0–L2 уже в `router.ts`, реальный пробел — capability-слой
- `docs/Phase2/UNA_Phase2_Step1.5_Routing_Reconciliation_Brief.md` — обязательный Step 1.5: карта механизмов, canonical authority = `router.ts`, Intent ≠ Capability ≠ Action ≠ Tool, baseline-методика; находка: `filterToolsByIntent` — мёртвый код
- `docs/research/system-one-decision-models.md` — Jev/System-One как промежуточный примитив; DecisionProvider как optional capability, не зависимость
- `docs/research/task-context-isolation.md` — изолированные TaskContext'ы (GLOBAL/TASK/EPHEMERAL), обмен Structured Findings; изоляция ≠ идентичность
- `docs/research/architecture-synthesis-cognitive-runtime.md` — синтез 18 идей brainstorm'а (exists/rename/new/merge/research-only); находка: `executive.ts` vs `goal-tracker.ts` — два менеджера целей (в scope Step 1.5); Memory Scopes = формализация подов
- `docs/research/needle-action-model.md` — Needle 3 как флагман-кандидат Pass 6 (Apache-2.0, ladder 2–20, grammar-constraints, retrieval, confidence ≠ разрешение); Needle Lab: 20L, RU-first, корпус A–H
- `docs/research/decision-log.md` — DEC-013 (роли: lead + исследователь + кодер + архивариус; конвейер утверждений); `research-backlog.md` — Pass 5 (Task Isolation), Pass 6 (+Needle)

**Скилл project-worklog:** `practice-log-mandatory` удалён, создан адаптивный `project-worklog`; legacy `PRACTICE_LOG.md` (OneDrive) удалён — журнал ведётся здесь.

**Проверки:** tsc electron 0 · tsc renderer 0 · vitest 250/250 (13 файлов)

**Коммитов нет** (только документы; коммит — за lead'ом/кодером).

**Дальше:** Step 1.5 аудит по брифу → обновление Step 2 proposal → DEC; Needle Lab (Решение №1).

**Needle-экосистема (вечер, архивариус):** `docs/research/needle-action-model.md` — §12: Mini-UNA как лаборатория (факты сверены с живым репо MaxSC2/Mini-UNA: NeedleServer + needle3.cact + arm64, 28 tools, SafetyPolicy ALLOW/CONFIRM/BLOCK); разделение на 4 корзины (Needle из коробки / наш scope / Needle не решает / U.N.A. Core); граница — Needle только внутри отрезка utterance→Action; методология — мерить «чистый Needle» и «Needle+deterministic» отдельно.

**Решение DEC-014 (2026-09-22):** Needle — единственное активное micro-model направление (не зоопарк); Jev/Laya/Kev/decider → резерв backlog'а; поправка Laya-multilingual зафиксирована; скоуп GLM/Kimi — только абстракции (Action/Capability/CognitionProvider contract/abstain/confidence/escalation), без CognitiveRouter и multi-ProviderRouter; remote proposal `c436a49` сверен (698 строк, [V]/[I], корпус n=56, baseline 35.7%) — локальные v40-доки его предшественники.

**Аудит ревью (9 пунктов, сверено по коду, без изменений):** `docs/research/code-audit-2026-09-22.md` — 7×CONFIRMED + 1 residual + 1 MIXED. Главное: дубль user message РЕАЛЕН в обоих хендлерах (фикса `slice(0,-1)` из AGENTS.md нет в дереве); `open_app` — инъекция в `cmd.exe` (security, первым в очередь); IPC-гонка — остаточная (теряется stream-end); `tool_choice` ЕСТЬ, но в cloud-путях, а не в Ollama (доки — наоборот); AGENTS.md/HONEST_STATUS по трём фиксам описывают чужое дерево — статусы STALE до сверки с git-историей.

**Аудит, партия 2 (6 пунктов, сверено):** 5×CONFIRMED + 1 MIXED. Telegram — перехват `chatId` любым + нет персистентности (security); бэкап — валидатор режет `self_review` (реально пишется из `monologue.ts:80`, `self-review.ts:56`), `pod_id` и 4 таблицы вне дампа; напоминания — календарной даты в промпте нет (только поэтическое timeOfDay), галлюцинации срабатывают мгновенно; SSRF — `redirect:follow` + проверка ПОСЛЕ (оба инструмента, TOCTOU); `run_code` — хостовые интринсики в `vm` (`Buffer` в т.ч.); MCP — `disconnectAll()` СУЩЕСТВУЕТ, но не вызывается нигде → зомби реальны. Обновлённый приоритет: security-кластер (#3,#10,#13,#14) первым пакетом.

---

## 2026-09-16

**Phase 1 / Pass 1 remainder — P1-2 (injection-фикстуры, корпус + контрактные тесты):**
- новый `tests/safety/indirect-injection.test.ts` (10 тестов). Контракт: вывод инструментов — недоверенные ДАННЫЕ, а не инструкции (indirect prompt injection не превращается в действия).
- «внешний мир» мокается (dns, global `fetch`, дочерний процесс MCP), тестируемая логика — настоящая:
  - `read_file`: файл с инструктивными вставками возвращается инертными данными; `.env` рядом — по-прежнему блокируется `isProtectedFile`, секрет не утекает ни в `error`, ни в JSON;
  - `web_fetch`: текст вставки сохраняется, но `<script>`, `onerror=` и `javascript:` снимаются HTML-парсером; SSRF-адреса (127.0.0.1, localhost, 169.254.169.254, file://) блокируются до сети — `fetch` не вызывается;
  - `web_search`: инструктивная вставка в сниппете возвращается инертным текстом;
  - MCP: мини-сервер JSON-RPC (stdio, реальный `child_process`) отдаёт враждебный контент — `callTool` возвращает его как `data`;
  - defense in depth: classifier помечает payload-команды как forbidden/dangerous; опасная команда требует подтверждения и не исполняется;
  - observation-канал tool-loop: вставка в tool-результате не порождает дополнительных вызовов инструментов и уходит в модель как `role: 'tool'`.
- санитайзер НЕ создавался — осознанное решение DEC-008 (тест фиксирует текущее поведение, а не подменяет его новым слоем).
- пробел implementation-map №2 закрыт.
- манифест 267→273: +1 этот тест; +5 файлов параллельного UI-дизайнера (`docs/design/` — scene v0.2) оформлены отдельным коммитом, чтобы коммит P1-2 остался монотематическим.

**Проверки:** tsc electron 0 · tsc renderer 0 · vitest 250/250 (13 файлов) · `npm run build` ✓ · verify-manifest 273/273 (0 пропущено, 0 лишних)

**Коммит:** `test(safety): P1-2 injection-фикстуры web/file/search/MCP`

**Дальше:** Pass 2 (сравнение memory-проектов) либо Pass 3 (браузер — разблокирован после закрытия контракта подтверждений).

---

## 2026-09-15

**Память (M6):**
- восстановлен и закоммичен Memory Manager (`electron/memory/manager.ts`): скоринг-гейт → L1 store → L2 Graphiti, maintenance, elevate, архив отклонённых кандидатов
- фиксы: кириллица в regex-фильтре шума (`(?![а-яa-zё])`), семантика `setFactProvenance` (`!== undefined`), опция `force` для `elevateCandidate`, тест-хук `__testResetWindows()` против дедуп-окон
- тесты memory: 44/44 (новый `tests/memory/manager.test.ts`, 13 тестов)

**Безопасность (токены подтверждений):**
- fix: токены exec_/write_/confirm_ стали детерминированными — `actionToken()` (sha256 от параметров действия) в `electron/tools/helpers.ts`; повтор того же действия находит подтверждение, изменение параметров → новый запрос
- `request_confirmation`: после подтверждения возвращает `success: true` — цикл в `executeToolLoop` завершается, больше не зацикливается
- стор подтверждений ограничен 100 записями (`chat:confirm`, `main.ts`)
- новые тесты: `tests/tools/confirmation.test.ts` (6)

**Уборка репо (совместная с GPT-сессией):**
- история доков → `docs/history/{audits,planning}`, research-заметки → `docs/research/`
- `.agents/` и `.kilo/` — в игноры git и манифеста; манифест перегенерирован (248 файлов, вычищены 248 путей из `.kilo/worktrees`)
- `.kilo` удалена целиком (worktree `acidic-department` снят через `git worktree remove`, ~5,8 МБ)

**Коммиты:** `91be822` (chore: уборка), `13e667f` (feat: m6 + токены)

**Проверки:** tsc 0 ошибок · vitest 228/228 (11 файлов) · verify-manifest ✓

---

**Подтверждения v2 — pending-action records (research-backlog Pass 1):**
- `confirmedTokens: string[]` → `confirmedActions: ConfirmedActionRecord[]` (`electron/tools/helpers.ts`, `electron/ai/config.ts`): token + action + origin + createdAt
- TTL 10 минут (`CONFIRM_TTL_MS`), чистка `purgeExpiredActions()` — чистая функция, fail-closed для битых/будущих дат
- одноразовость: `consumeToken` в `ToolContext`, инструменты гасят токен после исполнения (execute-command, write-file)
- `chat:confirm` принимает `{token, action}`, origin=`chat`; цепочка preload → api → useUNA проведена
- backup-валидация переведена на `confirmedActions`
- тесты `tests/tools/confirmation.test.ts`: 6 → 12 (TTL ×4, one-shot ×2)

**Документация:**
- HONEST_STATUS.md: ревизия M6, счётчики 203→234 и манифест 94→249, приоритет «аудит подтверждений» закрыт, DoD из backlog (tsc/test/build) выполнен

**Проверки (вечер):** tsc electron 0 · tsc renderer 0 · vitest 234/234 (11 файлов) · `npm run build` ✓ (28.4s, warning о размере чанка — старый)

**Дальше:** миграционные тесты M6 → injection-фикстуры (web/MCP) → Pass 2 (сравнение memory-проектов).

---

**Phase 0 — Stabilization & Architectural Baseline (закрытие):**
- Deep Research v4.1 сохранён в репо: `docs/research/UNA_Deep_Research_v4.1_2026-09-15.md` (перенесён из корня)
- `docs/research/decision-log.md` — DEC-001…010: лестница роутинга, policy-слой, детерминированные токены, pending-action records, одно ядро памяти, Graphiti=MCP, мягкое забывание, запрет новых подсистем до аудита, шкалы M/Phase, иерархия истины
- `docs/research/implementation-map.md` — статусы всех подсистем по Evidence (код → тесты → git): VERIFIED / IMPLEMENTED (wired) / NOT WIRED (agents, autonomous-loop, skills) / PLANNED; сводка системных пробелов
- решение по шкалам: M1–M6 — архивные ревизии (включая найденную m5 `e9c222b`), фазы — Phase 0–5 (DEC-009)
- Phase 0: **STATUS: VERIFIED** — фиксируется хэшем коммита этой записи
- DEC-011: GitHub — оперативная память проекта; правило «decision-log → implementation-map → JOURNAL → commit → push»

---

**Phase 1 / Pass 1 remainder — P1-1 (миграционные тесты M6):**
- новый `tests/memory/migration.test.ts` (6 тестов): fresh DB (таблицы + external-content FTS + триггеры), legacy-апгрейд старой БД (plain FTS5 → external-content, факты и use_count сохранены, M6-колонки добавлены), v30-регрессия (delete мигрированного факта не роняет FTS), restart (close+init и двойной init без close), триггеры insert/update/delete с прямой проверкой `facts_fts`
- прод-код не тронут (tests-only); старый `initMemory()` прошёл все сценарии без изменений
- пробел implementation-map №1 закрыт

**Уроки (ч.2):**
- **Не доверять отфильтрованному выводу — только независимому перечитыванию persisted-состояния.** Причина: PS-пайплайн (`| Select-Object -First N`, `| Out-String`) может обрывать/искажать вывод процесса (EPIPE), а stdout при `2>&1` идёт в UTF-16, что приводит к ложным/усечённым данным. Отсюда ложный инцидент «sync не сохранил изменения», которого не было.
- **`npm run build` может виснуть на prebuild (`pre-build-check.js`)** — не признак ошибки кода. Обход: отдельно `npx tsc -p electron/tsconfig.json --noEmit && npx vite build` (при проверке — build ✓ built in 21s).
- **Параллельные агенты в том же дереве** (UI-дизайнер) создают untracked-файлы → они попадают в verify-manifest как «лишние». Это нормально: их возвращает sync на следующем прогоне; чужую работу не трогаем.
- **`sync-manifest.js` стал идемпотентным** — не создаёт фальшивый diff, если список файлов не изменился.
- **Добавлен `.gitattributes`** (`* text=auto eol=lf`) — репо LF-нормализован, предупреждения LF/CRLF исчезли.

**Проверки:** tsc electron 0 · tsc renderer 0 · vitest 250/250 (13 файлов) · vite build ✓ (21s) · manifest 273/273 (0 missing, 1 «лишний» — untracked `docs/design/prototype-scene-vNext/`, работа UI-дизайнера)

**Коммит:** `chore: fixes from review (manifest churn, doc counters, line endings)` — `277a3e4`

**Дальше:** Phase 2 — синхронизировать скоуп с GPT: research-backlog Pass 2 (memory-projects comparison) vs Pass 3 browser/GUI track vs lifecycle «Phase 2 — Memory & Continuity».

**Решение DEC-012** (закрывает открытый вопрос №2 из ревью `3206003`): один коммит = одна задача;
файлы дизайнера (`docs/design/**`) — только отдельными дизайн-коммитами, никогда не подхватывать
автоматически (проверка `git status --short` перед индексацией). Записано в `decision-log.md`.

**Проверки:** tsc electron 0 · tsc renderer 0 · vitest 240/240 (12 файлов) · `npm run build` ✓ (0 errors, 2 warning — старые, robotjs optional)

**Коммит:** `test(memory): P1-1 миграционные тесты M6 — старая БД, рестарт, FTS`

**Дальше:** P1-2 injection-фикстуры (`tests/safety/indirect-injection.test.ts`) — по scope ждёт своей очереди.

---

## 2026-09-22 — TASK-001 выполнена: приёмочные тесты compression + починка CI PR #1

**Контекст:** первая задача K3-зоны (DEC-021). Мандат владельца: от failed CI PR #1 до
финального отчёта без промежуточных остановок.

**CI PR #1 (root cause, по логу раннера):** `npm ci` → postinstall
`electron-builder install-app-deps` → исходная сборка better-sqlite3 → `prebuild-install`
без пребилда → `node-gyp 9.4.1` не распознаёт **Visual Studio 18** на новом образе
`windows-latest` (`unknown version "undefined"`). Падали Lint и Type Check на шаге
Install dependencies. **Фикс:** `npm ci --ignore-scripts` во всех трёх джобах (`596ae18`) —
ни одна CI-джоба не исполняет нативные модули/бинарь electron. CI зелёный (run 35763907470).

**TASK-001 acceptance:** `tests/ai/compression.test.ts` — 26 кейсов по контракту
(все 4 функции, use_count>=5, защита project/preference, лимиты 10/20/5, моки LLM,
эпизодический fallback-гейт, регрессии). Прод-код не тронут (P1-2) — расхождений
код/контракт нет. Проверки: vitest 26/26 и полный набор 276/276 · tsc electron 0 ·
tsc root 0 · verify-manifest 291/291 (0/0).

**Попутный фикс (`f16f032`):** sync/verify-manifest исключают `.git`-gitfile
(артефакт worktree; раньше попадал в манифест).

**Блокер (требует человека):** merge PR #1 упирается в ruleset «1 approving review
with write access»; единственный аккаунт с write access — автор PR, self-approve
невозможен. Нужен Approve → Merge в GitHub UI. Открытый процессный вопрос: DEC-011
(«коммит в main») vs PR-based workflow — вынесено в отчёт, DEC-011 не менялся.

**Коммиты на `k3/task-001-compression-tests`:** `596ae18` (ci) · `f16f032` (manifest-fix) ·
`753b1aa` (tests) · docs-коммит с этим журналом и отчётом `docs/reports/k3/2026-09-22-task-001.md`.

**Дальше:** TASK-002 — приёмочные тесты `electron/ai/resource-manager.ts` (рекомендация);
pending-задача №6 (`.review-profile/` → EXCLUDE_DIRS) ждёт решения о семантике манифеста.

---

## 2026-09-23 — K3 wave 2: пробел №5 закрыт целиком (TASK-002…TASK-011)

**Контекст:** продолжение автономной волны K3 по мандату владельца. Стек stacked-веток
`k3/task-002…011`, каждая от предыдущей, вершина `a557494`.

**Результат:** 10 приёмочных наборов для `electron/ai/*` — resource-manager (37), states+modes (24),
attention-manager (14), monologue (18), world-model (12), meta-learning (20), identity (13),
background-monitor (12), proactive (13), life-loop (27). **180 новых кейсов; полный набор 466/466
(25 файлов), tsc 0, manifest 0/0.** Прод-код не тронут (P1-2, DEC-008).

**Главная находка (F-кандидат):** `meta-learning.ts` — все RU-regex используют `\b`, который не
работает с кириллицей (`\w` = ASCII) → детекция поправок/предпочтений для русского ввода мертва.
Зафиксировано тестами «как есть» (EN-паттерны), вопрос вынесен Архитектору в отчёте волны
`docs/reports/k3/2026-09-23-wave2-task-002-011.md`.

**Дефлейки волны:** world-model `sessionId` из `Date.now()` (spyOn-сдвиг, `8b7675a`); life-loop
night-maintenance — тысячи фейковых тиков на прокрутке часов → `tickIntervalMs: 10_000` (`a557494`).

**PR-статус:** PR #1 (`chore/k3-task-001-prep`) — **MERGED 2026-09-22** (`3e80ae4` в main).
PR #2 (TASK-001 tests) — OPEN, ждёт approve (review-gate). Стек волны 2 запушен в origin
(`k3/task-002…011`); merge — цепочкой после PR #2.

**Implementation-map:** пробел №5 → ЗАКРЫТ (evidence в строке №5). Открыты: №6 (`.review-profile/`
→ EXCLUDE_DIRS — ждёт решения о семантике манифеста), Graphiti E2E (Phase 2), мёртвый узел
agents/autonomous-loop/skills (Phase 2, DEC-008).

