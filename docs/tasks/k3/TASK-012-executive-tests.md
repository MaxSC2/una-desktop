# TASK-012 - тесты electron/ai/executive.ts (цели: CRUD + interrupt/resume)

- **Основание:** DEC-021 (Accepted); implementation-map, пробел 5 follow-up (фоновые подсистемы закрыты Wave 2 — executive остался без dedicated-тестов; durable task runtime — Pass 5 research).
- **Исполнитель:** K3. **Ветка:** k3/task-012-executive-tests (от main c974c0e). **Статус:** READY.
- **Subsystem:** electron/ai/executive.ts (158 строк, SQLite-таблица goals).
- **Зависимости:** нет (tests-only; после Wave 2).
- **State (сверено с main 2026-09-24):** экспорты createGoal/getActiveGoals/getAllGoals/
  getGoalById/updateSubgoalStatus/interruptGoal/resumeGoal/completeGoal/cancelGoal/
  deleteGoal/formatGoalsForPrompt/parseGoalToken; dedicated-тестов нет.
- **Scope строго:** только новый tests/ai/executive.test.ts.
- **Запрещено:** править executive.ts и любой другой production-код; safety/workflows/
  package*.json/decision-log/AGENTS.md/docs/design; ручной manifest.
- **Изоляция БД (образец — TASK-008):** замокать ../memory/store getDb (better-sqlite3 :memory: + таблица
  goals либо vi.mock) + vi.resetModules() в beforeEach, чтобы тесты не трогали реальный store.
- **Контракт (по коду, фиксируй — не чини):**
  - createGoal(desc, subgoals) -> статус active, progress 0, subgoals pending;
    getDb() = null -> throw No database.
  - getActiveGoals -> только active+interrupted, лимит 10, порядок created DESC;
    без БД -> пустой массив.
  - getAllGoals -> лимит 50, created DESC; без БД -> пустой массив.
  - getGoalById -> Goal/null (без БД -> null).
  - updateSubgoalStatus -> пересчет progress (% done); 100% -> статус completed;
    несуществующий goal / OOB-индекс / без БД — silent no-op. Пустой subgoals -> зафиксировать
    фактическое поведение, НЕ исправлять.
  - interruptGoal(id, snapshot) -> interrupted + snapshot; resumeGoal(id) -> active
    (только из interrupted, snapshot сбрасывается); несуществующий id — зафиксировать, не чинить.
    resumeGoal не-interrupted цели -> зафиксировать фактическое поведение.
  - completeGoal/cancelGoal/deleteGoal -> смена статуса/удаление; getGoalById после delete -> null.
  - formatGoalsForPrompt -> пустая строка при пустых; иначе блок с description и [GOAL]-подсказкой.
  - parseGoalToken -> create / done:goalId:subIndex / cancel:goalId / null;
    create без pipe-части -> зафиксировать фактическое поведение, НЕ чинить.
- **Acceptance:** новый файл зеленый; npm test полностью зеленый; tsc electron 0;
  manifest sync/verify чисто (в worktree); ветка k3/task-012-executive-tests;
  отчет docs/reports/k3/YYYY-MM-DD-task-012.md (DEC-021 раздел 5).
- **Стоп (DEC-021 раздел 6):** один файл за раз; больше 3 попыток — эскалация; конфликты с Accepted DEC;
  продуктовые/архитектурные решения — в QUESTIONS, не в код.
- **Код — истина (DEC-010).** Расхождения spec и кода — в отчет, не в фикс.
- **Примечание:** заменяет untracked-черновик TASK-003-executive-tests.md (ID-коллизия с merged TASK-003
  states-modes); черновик можно удалить после приемки TASK-012.
