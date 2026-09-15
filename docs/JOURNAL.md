# Ежедневник — UNA-Desktop

> Рабочий журнал: что сделано за день, короткими отметками.
> Подробности — в `git log` и `docs/history/`. Правила ведения:
> - одна секция = один рабочий день, дата в ISO (`ГГГГ-ММ-ДД`);
> - новые дни добавляются **сверху**;
> - пункт = тема → суть + артефакт (файл / коммит / тест);
> - в конце дня — счётчики проверок (tsc / vitest / manifest), если гонялись;
> - не дублируем changelog-прозу: журнал — это оглавление дня, не отчёт.

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

**Дальше:** pending-action record (TTL/origin/одноразовость подтверждений) → обновить HONEST_STATUS → миграционные тесты M6.
