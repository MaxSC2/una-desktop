# Ежедневник — UNA-Desktop

> Рабочий журнал: что сделано за день, короткими отметками.
> Подробности — в `git log` и `docs/history/`. Правила ведения:
> - одна секция = один рабочий день, дата в ISO (`ГГГГ-ММ-ДД`);
> - новые дни добавляются **сверху**;
> - пункт = тема → суть + артефакт (файл / коммит / тест);
> - в конце дня — счётчики проверок (tsc / vitest / manifest), если гонялись;
> - не дублируем changelog-прозу: журнал — это оглавление дня, не отчёт.

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
