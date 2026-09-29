# TASK-004-FIX - F15: disconnectAll в before-quit + unit-тесты (fix по утвержденной спеке)

- **Основание:** Q-004 решение Lead ДА + утверждение FIX-SPEC оркестратором 2026-09-24
  (INV-отчет docs/reports/k3/2026-09-24-task-004-inv.md, разделы FIX-SPEC §1-3+§5).
- **Исполнитель:** K3. **Ветка:** k3/task-004-mcp-disconnect-fix (от актуального main;
  rebase после merge PR #17/#18 обязателен). **Статус:** READY.
- **Зависимости:** нет.

## Фикс (ровно как в FIX-SPEC §1, без самодеятельности)
- Вставка в app.on('before-quit') (electron/main.ts, после closeMemory(), перед
  globalShortcut.unregisterAll()):
  `// F15/Q-004` + `void mcpAdapter.disconnectAll();` (import уже есть, main.ts:28).
- mcp-adapter.ts НЕ трогать. §4 hardening (обнуление entry.process) — ОТЛОЖЕН, не делать.

## Тесты (FIX-SPEC §2): tests/ai/mcp-disconnect.test.ts, ~7-10 кейсов
- Мок child_process (фейк-процесс с JSON-RPC эхо, без 15-30с waitForResponse);
  прецедент — indirect-injection.test.ts.
- Кейсы: kill вызван на каждый зарегистрированный сервер; ошибки kill глотаются;
  tools cleared + initialized false; пустой набор — no-op; повторный вызов безопасен;
  skip сервера после exit (без process); disabled-сервер не трогается.
- Wiring before-quit покрыть ручным чеклистом из FIX-SPEC §3 (в отчет, не в код —
  объект app Electron в vitest недоступен).

## Scope строго
- Разрешено: electron/main.ts (вставка 2 строк), tests/ai/mcp-disconnect.test.ts (новый),
  отчет docs/reports/k3/YYYY-MM-DD-task-004-fix.md, manifest sync.
- Запрещено: все остальное, включая §4 hardening; safety/workflows/package*.json;
  decision-log/AGENTS.md/docs сверх отчета; ручной manifest.

## Acceptance
- Вставка ровно 2 строки; unit-тесты зеленые; npm test полностью зеленый; tsc electron+root 0;
  manifest sync/verify чисто; ветка k3/task-004-mcp-disconnect-fix; отчет DEC-021 раздел 5
  с выполненным ручным чеклистом или пометкой 'требует ручной проверки owner'.
- **Стоп (DEC-021 раздел 6):** отклонения от FIX-SPEC — только через оркестратора.
- **Код — истина (DEC-010).**
