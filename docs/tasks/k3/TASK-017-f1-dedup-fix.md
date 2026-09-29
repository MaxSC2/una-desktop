# TASK-017-FIX - F1: дубль user message (вариант 1, минимальный дифф)

- **Основание:** Q-002 решение Lead — вариант 1 (allRecent.slice(0,-1) в main.ts).
- **Исполнитель:** K3. **Ветка:** k3/task-017-f1-dedup-fix (от актуального main;
  rebase после merge PR #17/#19 обязателен). **Статус:** READY.
- **Механизм (подтвержден оркестратором 2026-09-24):** хендлер сначала saveMessage(user), затем
  getRecentMessages (последний элемент — только что сохраненное), затем
  buildMessagesFromHot(hot, text) дописывает text еще раз (rlm.ts:284-320) — дубль.
  Два call sites: main.ts:276 и main.ts:380 (одинаковый паттерн).

## Фикс (ровно вариант 1, без самодеятельности)
- В ОБОИХ местах: allRecent исключить последний элемент перед buildHotContext:
  `const allRecent = getRecentMessages(...).map(...).slice(0, -1);`
  (пустой массив -> пустой, безопасно). Вариант 2 (трогать buildMessagesFromHot) — НЕ делать.
- Остальной код хендлеров не трогать.

## Тесты
- Хендлеры main.ts напрямую в vitest не вызвать (IPC/Electron) — стратегия:
  unit-тест контракта rlm.ts (history без текущего + text -> ровно одно вхождение user-текста
  в итоговых messages) + ручной чеклист (диалог из 2-3 реплик, дублей нет).
- Файл: tests/ai/f1-dedup.test.ts (новый) — мокать только rlm-зависимости при нужде;
  buildMessagesFromHot — чистая функция, тестируется напрямую.

## Scope строго
- Разрешено: electron/main.ts (2 точечные правки), tests/ai/f1-dedup.test.ts (новый),
  отчет docs/reports/k3/YYYY-MM-DD-task-017.md, manifest sync.
- Запрещено: rlm.ts и любой другой production-код; safety/workflows/package*.json;
  decision-log/AGENTS.md/docs сверх отчета; ручной manifest.

## Acceptance
- Дубль устранен в обоих хендлерах; unit-тест зеленый; npm test полностью зеленый;
  tsc electron+root 0; manifest sync/verify чисто; ветка k3/task-017-f1-dedup-fix;
  отчет DEC-021 раздел 5.
- **Стоп (DEC-021 раздел 6):** отклонения — только через оркестратора.
- **Код — истина (DEC-010).**
