# TASK-014 - Wave 3 tests: goal-tracker + rollback + work-context (большой кусок)

- **Основание:** DEC-021 (Accepted); Wave 3 — покрытие stateful-хелперов без dedicated-тестов.
  Первый комплексный кусок: 3 подсистемы, ~800 строк, один бранч.
- **Исполнитель:** K3. **Ветка:** k3/task-014-wave3-state-tests (от актуального main на момент старта).
  **Статус:** READY. Выдавать после merge PR #14 (rebase на свежий main обязателен).
- **Зависимости:** нет (tests-only).
- **State (сверено с кодом 2026-09-24):** dedicated-тестов нет ни у одного из трех файлов.

## Файл 1: electron/ai/goal-tracker.ts (227 строк)
- Инициализация: initGoalTracker(database) создает таблицы goals/subtasks (+индексы).
  Без init все функции бросают 'GoalTracker not initialized' (кроме отсутствия БД — проверить).
- createGoal: дефолты priority medium, deadline/context null; возвращает getGoal(id).
- getGoal: null при отсутствии; subtasks отсортированы по order_idx; context парсится из JSON.
- getActiveGoals: только status active, created DESC.
- addSubtask: авто-order = max+1 (первый = 0); явный orderIdx уважается.
- updateSubtaskStatus: silent no-op на несуществующий id (проверить).
- getNextSubtask: первый pending по order_idx; null если нет.
- getGoalProgress: счетчики по статусам; percentage 0 при пустых (без NaN — проверить).
- getGoalStats: группировка по статусам + total.
- Эджи (фиксируй — не чини): неизвестный status в stats (динамический ключ); deleteGoal оставляет
  subtasks-сирот если FK выключен (проверить фактическое поведение :memory: по умолчанию).
- Изоляция: new Database(':memory:') + initGoalTracker в beforeEach.

## Файл 2: electron/ai/rollback.ts (227 строк)
- initRollbackSystem(database, backupRoot) — в тестах ОБЯЗАТЕЛЬНО передавать tmp backupRoot
  (fs.mkdtemp(os.tmpdir())); дефолт ~/.una/backups в тестах запрещен.
- createBackup: существующий файл -> BackupRecord (hash sha256 slice 0..16, size, restored false);
  несуществующий (ENOENT) -> null.
- restoreBackup: round-trip контент->восстановление->restored=1; неизвестный id -> false.
- restoreBackupsForOperation: матчинг по LIKE operation/timestamp; счетчики restored/failed.
- listBackups: DESC по timestamp, лимит (дефолт 50); getBackupsForFile: фильтр по пути.
- cleanupOldBackups: старше maxAgeDays (дефолт 7) удаляются файл+строка; счетчик.
- getRollbackStats: пустая БД -> total 0, totalSizeBytes 0, oldestTimestamp null.
- Эджи (фиксируй): операция с LIKE-спецсимволами в operationId; cleanup при уже удаленном файле
  (ENOENT -> строка все равно удаляется, счетчик растет).

## Файл 3: electron/ai/work-context.ts (337 строк)
- Сессия: updateActivity (+1 msg, lastActivity), markTaskCompleted (+1), resetSession (сброс всего),
  getWorkDuration (минуты; Date.now — мокать через vi.spyOn или fake timers).
- formatWorkContextForPrompt(ctx): ЧИСТАЯ функция — тестировать прямыми объектами:
  пустой ctx -> ''; gitRepos>0 -> секция; recentFiles>0 -> секция; workDuration>60 -> строка времени;
  isLongSession -> предупреждение; patterns -> секция.
- findGitRepos(tmpDir): находит вложенный .git, не спускается внутрь, пропускает node_modules/скрытые,
  лимит глубины и 20 репо.
- getRecentFiles(tmpDir): только файлы с mtime < 24ч, сортировка DESC, лимит maxResults.
- getGitRepoStatus: на tmp git-репо (git init + commit) -> branch/status/counts; на не-репо -> null.
- ЗАПРЕЩЕНО в тестах: getWorkContext() на реальном homedir (медленно и машинозависимо);
  сканирование реального дома; исполнение git вне tmp.

## Scope строго
- Разрешено: tests/ai/goal-tracker.test.ts, tests/ai/rollback.test.ts, tests/ai/work-context.test.ts (новые),
  отчет docs/reports/k3/YYYY-MM-DD-task-014.md, manifest sync.
- Запрещено: любой production-код; реальный homedir; реальный ~/.una; safety/workflows/package*.json;
  decision-log/AGENTS.md/docs сверх отчета; ручной manifest.

## Acceptance
- Три файла зеленые (ориентир: 15-25 кейсов каждый); npm test полностью зеленый;
  tsc electron+root 0; manifest sync/verify чисто (0 missing) в worktree;
  ветка k3/task-014-wave3-state-tests; отчет DEC-021 раздел 5.
- **Стоп (DEC-021 раздел 6):** один сабмит; флейки по времени — fake timers, не слипы;
  сомнения в контракте — в отчет, не в фикс.
- **Код — истина (DEC-010).**
