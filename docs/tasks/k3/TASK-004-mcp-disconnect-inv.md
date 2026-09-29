# TASK-004-INV - investigation: F15 lifecycle (disconnectAll в before-quit)

- **Основание:** Q-004, решение Lead ДА (2026-09-24): фиксить, порядок определит investigation.
- **Исполнитель:** K3. **Ветка:** k3/task-004-mcp-disconnect-inv (от актуального main).
  **Статус:** READY. Тип: investigation — production-код НЕ менять, только отчет + fix-спека.
- **Контекст (сверено оркестратором 2026-09-24):**
  main.ts:28 импортирует синглтон mcpAdapter; before-quit (main.ts:976-985) останавливает
  proactive/monitor/life-loop/vram/reminders/telegram + closeMemory + unregisterAll,
  но mcpAdapter.disconnectAll() (mcp-adapter.ts:345) нигде не вызывается — stdio-дети
  (spawn, mcp-adapter.ts:102) переживают выход.

## Вопросы investigation (ответить фактами из кода, не мнениями)
1. Все call sites connectAll/disconnectAll/registerServer: кто, когда, в каком порядке при старте.
2. disconnectAll: синхронность kill в цикле (await внутри нет — подтвердить), поведение при
   уже-упавших процессах, при пустом servers, повторный вызов (идемпотентность?).
3. Порядок в before-quit: ДО или ПОСЛЕ closeMemory — с обоснованием (in-flight MCP-записи
   при закрытой БД vs висящие процессы при раннем выходе). Дефолт решения: после closeMemory,
   перед unregisterAll — подтвердить или опровергнуть с причиной.
4. Тестируемость: before-quit хендлер в vitest напрямую не вызвать (объект app Electron) —
   предложить стратегию: unit-тесты disconnectAll (мок spawn/ChildProcess: kill вызван на каждый
   сервер, ошибки глотаются, tools cleared, initialized false) + чеклист ручной проверки wiring.
5. Риски фикса: async без await в синхронном хендлере (успеет ли kill), Windows-специфика kill,
   зависшие stdio-трубы.

## Выход (обязательно)
- docs/reports/k3/YYYY-MM-DD-task-004-inv.md: ответы 1-5 с цитатами строк кода.
- Готовая fix-спека (в том же отчете, раздел FIX-SPEC): точная вставка в before-quit,
  unit-тесты disconnectAll, чеклист ручной проверки, риски. K3 fix делать НЕ должен —
  только спека; fix отдельной задачей после утверждения спеки.
- Scope: только отчет (+ manifest sync). Production и тесты НЕ трогать.

## Acceptance
- Отчет отвечает на все 5 вопросов с evidence (файл:строка); FIX-SPEC содержит точный дифф
  (куда вставить, порядок) + тест-план; manifest чисто; ветка k3/task-004-mcp-disconnect-inv.
