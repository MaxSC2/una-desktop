# Журнал актуальности и лицензий

Дата проверки: 2026-09-15. Источник должен быть первичным: официальный GitHub repository,
официальная документация или лицензия. Поисковая выдача, сторонние обзоры и README-копии не заменяют
проверку release notes, issues и license file перед внедрением.

## Уже проверено

| Проект | Статус на дату проверки | Лицензия/условие | Вывод для UNA | Источник |
|---|---|---|---|---|
| MCP TypeScript SDK | Официальный Tier 1 SDK; идёт линия v1/v2 и migration work | Проверять package/version branch перед POC | Не менять adapter без compatibility matrix | [roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md) |
| Playwright | Активный cross-browser automation framework | Apache-2.0 | Лучший P1 кандидат для deterministic web tools | [repository](https://github.com/microsoft/playwright) |
| Stagehand | Активный SDK для browser agents, local и remote execution | MIT; remote требует Browserbase credentials | Только поверх capability/policy boundary | [repository](https://github.com/browserbase/stagehand) |
| Silero VAD | Production-stable Python package; имеется ONNX extra | MIT; Python/Torch и ONNX имеют разные operational costs | Исследовать ONNX path, не тащить Torch в Electron | [package metadata](https://github.com/snakers4/silero-vad/blob/master/pyproject.toml) |
| ActivityWatch | Локальный open-source tracker: app/window, browser and AFK watchers | MPL-2.0; чрезвычайно чувствительные данные | Только user-installed/opt-in connector | [repository](https://github.com/ActivityWatch/activitywatch) |
| Graphiti | Активный temporal graph framework и MCP server | Apache-2.0; MCP server требует Python, Docker, LLM/embed provider | Уже есть adapter; не расширять до стабилизации M6 | [MCP requirements](https://github.com/getzep/graphiti/blob/main/mcp_server/README.md) |
| Project AIRI | Активный ранний companion project с Web/Native/Live2D направлениями | MIT repository; модели/ассеты проверяются отдельно | Pattern/reference, не dependency | [repository](https://github.com/SEKAI-OS/AIRI) |
| Hermes Agent | Разделяет bounded durable memory и SQLite/FTS session history | Проверить upstream license и commit при заимствовании | Сильный memory/context pattern | [memory analysis with upstream revision](https://github.com/neoneye/agent-memory-atlas/blob/main/content/systems/hermes-agent.md) |
| PyRIT | Active red-teaming framework; есть направление malicious tool-call injection | Проверять Python dependency chain | Test-only candidate для security regression suite | [official docs](https://microsoft.github.io/PyRIT/latest/code/executor/workflow/) |

## Обязательная процедура перед POC

1. Открыть основной репозиторий, `LICENSE`, releases, security policy и минимум три последних
   закрытых/открытых issue по нужной функции.
2. Записать commit/tag, дату, license SPDX и поддерживаемые Node/Electron/OS версии в этот журнал.
3. Проверить, имеет ли проект cloud default, telemetry, `.env` autoload или фоновый network traffic.
4. Составить минимальный POC вне `main.ts`; определить CPU/RAM/VRAM и network budget.
5. Написать negative tests: отказ permissions, malicious tool output, timeout, rollback/error state.
6. Только после этого принять ADR: integrate / adapt / pattern / reject.

## Непроверенные записи

Каталог намеренно содержит и непроверенные кандидаты из первоначального исследования. Они не являются
рекомендациями на внедрение. Их статус должен быть `DISCOVERED`, пока не заполнены все поля выше.

## Сигналы остановки

- Лицензия несовместима с предполагаемой дистрибуцией или неясна.
- Потребление VRAM/RAM нельзя ограничить на целевом компьютере.
- Feature требует передачи пользовательских данных стороннему облаку без отдельного consent flow.
- Проект дублирует существующий модуль, но не даёт измеримого выигрыша.
- Нет изолируемого failure mode или permission boundary.
