# Graphiti как долговременная память U.N.A.

> Интеграция [Graphiti](https://github.com/getzep/graphiti) (getzep, ~30k★, Apache-2.0) —
> темпорального графа знаний для AI-агентов — через уже встроенный MCP-адаптер U.N.A.

---

## TL;DR

**Graphiti** — это «мозг-архив» с пониманием времени: факты связываются в граф
(кто → что → кого/чего), помечаются временными метками, автоматически
устаревают и вытесняются новыми. В отличие от плоской таблицы фактов в SQLite,
Graphiti хранит **связи и историю изменений** фактов.

В U.N.A. подключается через `electron/ai/mcp-adapter.ts` — **без единой строки
нового кода в main process**: инструменты Graphiti появляются в
`getToolDefinitions()` автоматически и становятся доступны модели через
function calling.

---

## Как это вписывается в память U.N.A.

| Уровень | Реализация | Скорость | Что хранит |
|---|---|---|---|
| HOT (рабочая) | RLM, in-memory | мгновенно | текущий диалог |
| WARM (сессия) | in-memory 50 сообщений | мгновенно | контекст сессии |
| COLD (факты) | SQLite + FTS5 + embeddings | мс | отдельные факты |
| **Граф (новый)** | **Graphiti (MCP)** | 10–100 мс | **связанные факты, отношения, история** |

Graphiti **не заменяет** SQLite-память — он дополняет её: где SQLite отвечает на
вопрос «что пользователь говорил про X?», Graphiti отвечает «**как X связан с Y**,
когда это изменилось и что устарело».

---

## Требования

| Компонент | Вариант | Примечание |
|---|---|---|
| Python | 3.10+ | для MCP-сервера Graphiti |
| uv | свежая версия | `pip install uv` / installer с astral.sh |
| Графовая БД | **FalkorDB** (Docker, по умолчанию) или Neo4j 5.26+ | Docker Desktop нужен для варианта по умолчанию |
| LLM для извлечения сущностей | **Ollama** (уже установлен у вас) | Graphiti умеет OpenAI-совместимые эндпоинты |
| Embeddings | OpenAI / Voyage / **sentence-transformers (локально)** | sentence-transformers = полностью офлайн |

⚠️ **Железо:** Neo4j/FalkorDB + Ollama + Electron на 8 ГБ RAM — плотно, но
реально. Рекомендация: держите Ollama с `qwen3:4b` (2.5 GB VRAM), графовая БД
съест ~300–500 МБ RAM.

---

## Установка (Windows)

### 1. Запустите Graphiti MCP-сервер

```bash
git clone https://github.com/getzep/graphiti.git
cd graphiti\mcp_server
uv sync
```

Создайте `.env` рядом с `main.py` (граф и LLM — всё локально):

```env
# Отключаем телеметрию
GRAPHITI_TELEMETRY_ENABLED=false

# LLM через локальный Ollama (OpenAI-совместимый эндпоинт)
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
MODEL_NAME=qwen3:4b

# Embeddings локально (опционально; иначе OpenAI-совместимый путь)
EMBEDDER_PROVIDER=sentence-transformers
```

Старт сервера (HTTP-транспорт, порт 8000):

```bash
uv run main.py --group-id una
```

> `--group-id una` — неймспейс графа, чтобы данные U.N.A. не пересекались
> с другими проектами. БД по умолчанию — FalkorDB, поднимается через
> `docker compose up` из той же папки (или укажите Neo4j).

### 2. Включите сервер в U.N.A.

В `electron/ai/mcp-adapter.ts` в `DEFAULT_MCP_SERVERS` уже заготовлен
закомментированный блок `graphiti-memory`. Раскомментируйте и поставьте
`enabled: true`:

```ts
{
  name: 'graphiti-memory',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'mcp-remote', 'http://localhost:8000/mcp/'],
  env: { GRAPHITI_TELEMETRY_ENABLED: 'false' },
  enabled: true,
},
```

> Почему `mcp-remote`: Graphiti MCP работает по Streamable HTTP (`/mcp/`),
> а встроенный адаптер для stdio гоняет JSON-RPC по stdout/stdin child-процесса.
> `mcp-remote` — официальный мост stdio↔HTTP от авторов MCP. Альтернатива:
> расширить адаптер до полноценного Streamable HTTP-клиента.

### 3. Перезапустите U.N.A.

При старте в логе появится:

```
[MCP] Registered server: graphiti-memory (stdio)
[UNA] MCP initialized: ...
```

Инструменты Graphiti (`add_memory`, `search_nodes`, `search_facts`, эпизоды и
др.) автоматически попадут в `getToolDefinitions()` → модель сможет их вызывать.
Чтобы модель активно пользовалась памятью, добавьте упоминание инструментов в
`electron/ai/dynamic-prompt/index.ts` (по аналогии с web_search) — паттерн
уже опробован на Qwen (см. AGENTS.md, правка №3).

---

## Проверка

1. Спросите U.N.A.: «Запомни: проект Аврора дедлайн 30 сентября, за него отвечает Марат».
2. Через минуту (Graphiti обрабатывает эпизоды асинхронно): «Кто отвечает за Аврору и когда дедлайн?»
3. В логах MCP-сервера видны вызовы `add_episode` / `search` от U.N.A.

---

## Ограничения и заметки

- **Асинхронность:** Graphiti инкрементирует граф через очередь — факт появляется
  в графе не мгновенно, а через несколько секунд.
- **Стоимость извлечения:** каждый `add_memory` — это LLM-вызов для извлечения
  сущностей. На Ollama qwen3:4b это секунды, не миллисекунды — не дёргайте
  на каждом сообщении, а на значимых фактах.
- **Телеметрия:** отключается через `GRAPHITI_TELEMETRY_ENABLED=false` (мы
  делаем это в конфиге по умолчанию).
- **Резервное копирование:** граф живёт в FalkorDB/Neo4j — добавьте его volume
  в ваш бэкап-процесс (кнопка «Экспорт» в U.N.A. копирует только SQLite).
