# Phase 2 / Step 1.5 — Routing Reconciliation & Baseline

**Дата:** 2026-09-18
**Статус:** AUDIT COMPLETE (production tree не изменён; baseline снят реальным прогоном)
**Вход:** `docs/Phase2/UNA_Phase2_Step1.5_Routing_Reconciliation_Brief.md`, `UNA_Phase2_Step2_Cognitive_Routing_Architecture.md`, `UNA_Phase2_Step2_Cognitive_Routing_Adaptation.md`
**Принцип:** не создавать новый routing subsystem. Сначала — какие стены уже стоят.

---

## 0. Метод

- Все факты помечены **[V]** (проверено в коде/прогоне) или **[I]** (вывод/предложение).
- Ссылки в формате `файл:строка` — на момент `6ef17cb` + рабочее дерево 2026-09-18.
- Baseline: корпус 56 команд прогнан через **настоящий** `router.ts` в изолированном harness
  (`vitest`, мок только внешнего: `dispatchTool` + `semantic-router`). Скрипт и лог сохранены
  вне репозитория: `C:\TEMP\step15-probe.test.ts`, `C:\TEMP\step15-probe-output.txt`.
  Сам harness из дерева удалён — в коммит не попадает.

---

## 1. Таблица решений: кто что делает (10 вопросов брифа)

| Модуль | 1. Кто решает | 2. Входы | 3. Embeddings | 4. Regex | 5. Tool exec | 6. «Нужна ли LLM» | 7. Выбор tools | 8. Resource | 9. Attention | 10. Fallback |
|---|---|---|---|---|---|---|---|---|---|---|
| `fast-path.ts` | L0-fast матч | текст пользователя | — | `OPEN_APP_RE` + `APP_ALIASES` (26) | да: `dispatchTool('open_app')` | **да** (L0 ⇒ LLM не зовётся) | — | — | — | `null` → отдаёт router'у; ошибка tool → текст ошибки, LLM **не** зовётся |
| `router.ts` L0-direct | direct-команды | текст (≤80 симв) | — | 2 regex (`открой X`, RAM/CPU) + `DIRECT_APP_ALIASES` (18) | да: `open_app`/`system_info` | **да** | — | — | — | `null` → L1 |
| `semantic-router.ts` | L1-semantic intent | текст | **да** (`embed()` → centroids, cosine) | — | — | нет (не его роль) | — | — | — | порог 0.6 → `unknown` → regex; ошибка → `unknown` |
| `intent.ts` | L1-regex intent | текст | — | 13 интентов, порядок фиксирован | — | нет | **мёртвый** `filterToolsByIntent` (`TOOL_BY_INTENT`) | — | — | `unknown` (= сигнал «нужна LLM») |
| `modes.ts` | mode + фильтр tools | `Intent` | — | — | — | **косвенно** (mode=chat ⇒ tools=[]) | **да**: `filterToolsByMode` (allowlist) | — | — | `default` |
| `tool-loop.ts` | исполнение маршрута | `RouteDecision` | — | — | **да**: `dispatchTool` (раунды ≥1) | **да**: `route.direct` ⇒ skip; иначе LLM | берёт `route.tools`, на раунде ≥1 → `getToolDefinitions()` | — | — | ошибка tool → в LLM как `role:'tool'` |
| `llm.ts` | провайдер + `num_ctx` | конфиг, ресурсы | — | — | — | **фактический вызов** | `tools` (приняты от tool-loop) | **да**: `getOptimalContextTokens()` (:362, :424) | — | local ⇄ cloud (внутри провайдера) |
| `embed.ts` | вектор текста | текст | **да** (Ollama `/api/embed`) | — | — | — | — | — | — | hashing-trick (256d) |
| `mcp-adapter.ts` | MCP-инструменты | — | — | — | `callTool` | — | `getToolDefinitions()` merge (`tools/index.ts:70`) | — | — | tool не найден локально → MCP |
| `dynamic-prompt/index.ts` | сборка промпта | `userMessage`, контекст | — | **да**: `resolveMode(detectIntent())` (:291) | — | нет | — | — | — | исключения секций → `console.warn` |
| `attention-manager.ts` | attention state | resource + UI-интеракции | — | — | — | нет | — | **да** (`getContextBudget` :143) | **сам** | DND ⇒ deep_focus/deferred |
| `resource-manager.ts` | resource state | ОС (CPU/RAM/VRAM/батарея) | — | — | — | — | — | **да** | отдаёт attention | TTL-кэш 45 с |
| `world-model.ts` | world state | ОС + work-context | — | — | — | — | — | — | — | ошибки → пустые поля |
| `app-resolver.ts` | резолв приложения | имя | — | — | — | — | — | — | — | exact > fuzzy > substring |

**Вывод по вопросу 6 [V]:** решение «нужна ли LLM» принимается **в двух местах** — `router.ts`
(L0 ⇒ `direct != null`) и `tool-loop.ts:95` (проверка `route.direct`). Фактически это одно решение,
продублированное как флаг. Ниже L0 **LLM вызывается всегда** — включая `weather`, `news`,
`greeting`, `пауза`. То есть сегодня «L1» = *дешевле контекст* для той же LLM, а не «дешёвый
механизм, решающий задачу».


---

## 2. Дубли (D1–D8)

| # | Дубль | Где | Статус |
|---|---|---|---|
| **D1** | Таблицы алиасов приложений | `fast-path.ts:14-48` (26 записей) vs `router.ts:56-77` (18 записей) | **[V] расходятся**: `router` знает `steam/spotify/vk/youtube/paint`, `fast-path` — `wt/cmd/taskmgr/msedge/Firefox`. «Открой хром» → L0-fast (Chrome), «открой ютуб» → L0-direct. Два источника правды об одном домене. |
| **D2** | Regex «открой/запусти X» | `fast-path.ts:51` (`OPEN_APP_RE`, есть `включи`) vs `router.ts:89-91` (нет `включи`, есть `запустите/откройте`) | **[V]** разная семантика глаголов. |
| **D3** | Определение intent | `router.ts:167-170` (semantic+regex) vs `dynamic-prompt/index.ts:291` (`detectIntent`) | **[V] два независимых детектора** на одно сообщение. |
| **D4** | Разрешение mode | `router.ts:143,158,171` (`resolveMode`) vs `dynamic-prompt/index.ts:288-292` (`setMode`/`resolveMode`) | **[V] два писателя в один глобал** `currentMode` (`modes.ts:115`). Порядок: dynamic-prompt → router, поэтому промпт собран под режим A, а фильтр tools применён под режим B. |
| **D5** | Фильтры инструментов | `intent.ts:136` `filterToolsByIntent` (никто не зовёт) vs `modes.ts:135` `filterToolsByMode` (реальный) | **[V]** мёртвый + живой. `TOOL_BY_INTENT` (`intent.ts:120-134`) не используется. |
| **D6** | Бюджет контекста | `resource-manager.ts:238` `getOptimalContextTokens` (cloud 24576) vs `attention-manager.ts:143` `getContextBudget` (без cloud-ветки) | **[V] две реализации**, расходятся при `provider='cloud'`. |
| **D7** | Третье значение бюджета | `config.ts:156` `resource.maxContextTokens: 8192` | **[V] не читает никто** (grep пуст). Мёртвый конфиг. |
| **D8** | Расширения tool-calls | `llm.ts` fallback-парсинг `extractToolCallsFromContent` включён всем моделям | **[V]** одинаково для сильных и слабых моделей (дубль логики там, где нужен capability-гейт). |

Следствие D2/D5 для `AGENTS.md` (v37, п.11) **[V]**: документация описывает «dynamic tool expansion
по intent», реально работает mode-фильтрация. Документ требует синхронизации (вне скоупа Step 1.5,
отмечено как долг).

---

## 3. Дефекты, найденные замером (не исправлялись)

Все — воспроизведены на корпусе (лог `C:\TEMP\step15-probe-output.txt`).

| # | Дефект | Доказательство | Влияние |
|---|---|---|---|
| **F1** | **gui-intent не может вызвать GUI-инструменты.** `INTENT_TO_MODE['gui'] = 'system'`, но `MODE_REGISTRY['system'].allowedTools` (`modes.ts:71-75`) **не содержит** `type_text`, `click`, `key_press` — хотя `TOOL_BY_INTENT['gui']` (`intent.ts:130`) их содержит | «кликни по иконке» → `intent=gui`, `mode=system`, tools отфильтрованы | GUI-действия недостижимы на раунде 0; работают только случайно после раунда ≥1 |
| **F2** | **Порядок интентов даёт ложный web_search.** `web_search` идёт раньше `file_find` (`intent.ts:33` vs `:55`) и ловит `/найди/` | «найди файл отчёт» → `intent=web_search` (ожидалось `file_find`) | Файловые инструменты выпадают из контекста LLM |
| **F3** | **«поиск» в GUI-команде уводит в веб.** `/поиск/` из `web_search` | «нажми кнопку поиска в ютубе» → `intent=web_search` (ожидалось `gui`) | Реальная GUI-задача маршрутизируется в веб-инструменты |
| **F4** | **Пропуск словоформы «оперативки».** Оба паттерна требуют `оперативн`, а не `оперативк` (`router.ts:108`, `intent.ts:72`) | «сколько оперативки свободно» → **не** L0-direct, а L1-regex `unknown` | Ложный negative: детерминированная команда уходит в LLM. Единственный mismatch из 10 ожидавшихся L0-direct |
| **F5** | **L1 не экономит LLM.** Все `weather/news/greeting/media` всё равно вызывают LLM | `tool-loop.ts:95` — пропуск LLM только при `route.direct` | L1 сегодня = «дешёвый контекст, та же LLM», а не «дешёвый механизм» |
| **F6** | **`layer` не умеет выражать «нужна LLM».** `unknown` попадает в `L1-regex` | замер: 13 из 56 строк = `intent=unknown`, но `layer=L1-regex` | Метрика по `layer` **занижает** долю LLM-вызовов: реальный L2 = 23.2%, а не 0% |
| **F7** | **Размерность embeddings расходится.** Ollama-вектор — 768 (`embed.ts:24-28`, без усечения), hashing-fallback — 256 (`EMBED_DIM=256`); `cosine` берёт `min(length)` (`semantic-router.ts:157`) | `embed.ts` fallback-ветка | При недоступной Ollama центроиды 768 vs вектор 256 → сравнение по 256 компонентам, тихое искажение |
| **F8** | **Embeddings считаются диалоговой моделью.** `embed()` шлёт `model: cfg.localModel` (= `qwen3:1.7b`) на `/api/embed` | `embed.ts:19` + `config.ts:105` | Нет конфига embedding-модели; качество/семантика неявно привязаны к чат-модели |
| **F9** | **`world-model` печатает hostname вместо репозиториев.** `workContext.gitRepos.map(r => os.hostname)` | `world-model.ts:63` | «Активные репозитории» в промпте — список одинаковых hostname |
| **F10** | **Ошибка L0 не эскалируется в LLM.** `fast-path`/`tryDirectCommands` при неудаче возвращают текст ошибки | `fast-path.ts:109-111`, `router.ts:100-102` | Пользователь получает «Не нашла X» вместо помощи модели |

---

## 4. Intent ≠ Capability ≠ Action ≠ Tool

### Что есть сейчас [V]

```text
utterance → Intent(13) → ExecutionMode(6) → tool-allowlist(mode) → Tool(25)
```

- `Intent` (`intent.ts:1-14`) — **домен запроса**, не действие: `weather, news, web_search,
  file_read, file_write, file_find, code, system, screen, gui, memory, greeting, unknown`.
- `ExecutionMode` (`modes.ts:3-9`) — режим подачи промпта + набор инструментов, не действие.
- `Tool` (`tools/index.ts`) — механический исполнитель; 25 локальных + MCP.
- **Слоя Capability/Action нет вообще.** Связь «что хочет пользователь → что именно выполнять»
  сегодня целиком в голове LLM: intent лишь сужает набор инструментов.

### Проверка на примерах [V]

| Utterance | Сейчас | Правильно (Action) | Проблема |
|---|---|---|---|
| «открой хром» | L0-fast → `open_app(Chrome)` | `OPEN_APP(target=Chrome)` | работает |
| «кликни по иконке» | `gui`→`system` → **инструменты GUI отсутствуют** (F1) | `CLICK(target)` | сломано |
| «давай музыку» | `unknown` → LLM (default, 25 tools) | `PLAY_MEDIA(target=?)` | якоря нет |
| «пауза» | `unknown` → LLM | `PAUSE_MEDIA` | якоря нет |
| «сделай громче» | `unknown` → LLM | `SET_VOLUME(+)` | якоря нет |
| «найди файл отчёт» | `web_search` (F2) | `FIND_FILE(query)` | ложный intent |
| «поставь напоминание через 2 часа» | `unknown` → LLM | `CREATE_REMINDER(when)` | якоря нет |
| «сколько оперативки» | `unknown` → LLM (F4) | `GET_SYSTEM_INFO` | false negative |

**[V] факт:** из корпуса 56 команд **13 (23.2%)** попадают в `unknown`; из них большинство — команды,
которые имеют детерминированный Action, но не имеют ни якоря, ни интента: media (6), action (2),
плюс F4.

### Вывод [I]

Слой `Intent → Capability/Action` **необходим**, но как **расширение существующего**, а не новая система:

1. `Capability` — производная от `Intent` + `WorldState` (не хранилище; вычисляется).
2. `Action` — новый ограниченный словарь (`PLAY_MEDIA`, `PAUSE_MEDIA`, `SET_VOLUME`, `OPEN_APP`,
   `FIND_FILE`, `SEARCH_WEB`, `CREATE_REMINDER`, `GET_SYSTEM_INFO`, `CLICK`, `TYPE_TEXT`, …),
   который маппится в `Tool` + arguments.
3. `Context Resolver` — **функция**, не сервис: `resolveTarget(Action, WorldState) → arguments`
   (уже есть прообраз: `app-resolver.ts` — резолв `.lnk` для `open_app`).
4. `TOOL_BY_INTENT` (мёртвый, D5) — не выбрасывать и не воскрешать как есть: **заменить** на
   `ACTION → Tool` + `Capability → required tools`. Тогда intent-фильтр и mode-фильтр перестают
   спорить (F1 закрывается самим словарём Action).

**Медиа — тест на дизайн:** ни один из 6 media-запросов не имеет якоря, интента, Action или Tool.
Это доказательство, что текущая система не «сводит формулировки», а **только сужает инструменты**.

---

## 5. Canonical routing authority

**[V] факты:**
- `routeMessage()` (`router.ts:136`) — единственная точка, вызываемая из `tool-loop.ts:93`.
- Оба IPC-входа (`chat:send` `main.ts:299`, `chat:stream` `main.ts:402`) идут через `executeToolLoop`.
- Других вызовов routing-примитивов нет (grep: `detectSemanticIntent` — только router;
  `runFastCommand` — только router; `filterToolsByMode` — только router).
- Прямые вызовы LLM помимо tool-loop: `electron/agents/index.ts:156,207,304` — **[V] мёртвый узел**
  (единственная ссылка на `../agents` — `autonomous-loop.ts:15`, который сам не импортируется).

**[I] Решение:** **`router.ts` — canonical routing authority.** Причины: единственный вход,
единственный вызывающий, уже содержит лестницу уровней. Новый `CognitiveRouter` не создаётся.

**Что мешает ему стать authority прямо сейчас [V]:** `dynamic-prompt/index.ts:288-292` — второй
писатель в `currentMode` (D4) и второй детектор intent (D3). Пока это не устранено, «ровно один
компонент принимает решение» не выполняется: промпт описывает один режим, а tools приходят из другого.

### Mapping существующих модулей → целевые роли [I]

| Модуль | Сейчас | Целевая роль | Действие |
|---|---|---|---|
| `router.ts` | лестница L0/L1/L2 | **canonical routing authority** | расширять (не переписывать) |
| `fast-path.ts` | L0-fast алиасы | поставщик детерминированных решений | слить алиасы с router (D1/D2) |
| `intent.ts` | детектор домена | доменный классификатор + словарь Action | добавить Action-словарь, убрать `TOOL_BY_INTENT` |
| `semantic-router.ts` | centroid-matching | **EmbeddingIntentIndex** | расширять (hardening, калибровка), не заменять |
| `modes.ts` | mode + tool-allowlist | policy/context-слой | вынести из decision-пути фильтр (F1) |
| `attention-manager.ts` | user-attention | **Attention engine** | расширять: добавить salience/уровни как проекцию |
| `resource-manager.ts` | resource state + бюджет | **capability/resource gate** | единственный источник бюджета (D6/D7) |
| `world-model.ts` | world state | вход **Context Resolver** | расширять |
| `app-resolver.ts` | резолв .lnk | **Context Resolver** (первая функция) | расширять на media/window |
| `tool-loop.ts` | исполнение цикла | executor | оставить; убрать дубль решения «нужна LLM» |
| `dynamic-prompt` | сборка промпта | Context Composer | **убрать** ре-детект intent/mode (D3/D4) |
---

## 6. Attention и события

**[V] что есть:** `attention-manager.ts` — детерминированный, считает `FocusState`
(`deep_focus/light_work/idle/chatting/gaming/meeting`), `interruptible`, `ResponseUrgency`,
`allowProactive`, `allowSound`, `sessionAttentionScore`, `conversationBurst`, DND. Входы —
resource state + история UI-интеракций (`recordInteraction`, окно 50 событий, burst при среднем
интервале < 30 с).

**[V] чего нет:**
- attention не влияет ни на маршрут, ни на бюджет контекста (`maxContextTokens` не читается, D6);
- нет event-salience — системные события идут в `proactive.ts` напрямую;
- `AttentionState`, отданный в renderer (`main.ts:666`), нигде не использует эти поля осмысленно.

**[V] правило «EVENT ≠ LLM TRIGGER» сегодня выполняется де-факто:** `proactive.ts`,
`life-loop.ts`, `background-monitor.ts` **не вызывают LLM** (grep по `chatWithTools*`:
единственные вызовы — `tool-loop.ts` и мёртвый `agents/index.ts`).

**[I] Решение:** реакционные уровни (`ignore→observe→notice→react→cognize→interrupt`) — **проекция**
над существующим `AttentionState` + новый скоринг salience в том же файле. Второй state machine нет.

---

## 7. Resource и бюджет контекста

**[V] потребители `getOptimalContextTokens()`:** `llm.ts:362`, `llm.ts:424` (`num_ctx`),
`rlm.ts:36` (module-level константа `DEFAULT_RLM_CONFIG.maxHotTokens`, фиксируется при импорте),
`life-loop.ts:229`. Плюс дубль-реализация `attention-manager.getContextBudget` (D6) и мёртвый
`config.resource.maxContextTokens` (D7).

**[V] следствие (совпадает с Step 1):** бюджет фиксируется на старте сессии и **не зависит от
реального окна модели** (`qwen3:1.7b` = 4096 по `/api/ps`), при `provider='cloud'` берётся 24576.

**[I] Решение:** единственный источник — `resource-manager` (fail-fast при cloud-ветке),
`attention-manager.getContextBudget` удаляется как дубль, `config.resource.maxContextTokens`
удаляется как мёртвый. Бюджет становится функцией `(resource, modelCapabilities, attention)`.

---

## 8. Карта fallback

| Слой | Fallback | Где |
|---|---|---|
| L0-fast | `null` → router L0-direct | `fast-path.ts:100` |
| L0 (оба) | ошибка tool → текст ошибки, **без** эскалации в LLM (F10) | `fast-path.ts:109`, `router.ts:100` |
| L1-semantic | порог 0.6 / ошибка → `unknown` → regex | `semantic-router.ts:226-232` |
| L1-semantic init | ошибка → `initialized=false` → всегда `unknown` | `semantic-router.ts:197-199` |
| embeddings | Ollama недоступен → hashing 256d (F7) | `embed.ts:31-33` |
| L1-regex | `unknown` → mode `default` → 25 tools + LLM | `intent.ts:117`, `modes.ts:81-96` |
| tools | mode-фильтр **срезает MCP** (нет имён MCP в allowlist) | `modes.ts:20-97`, `tools/index.ts:70` |
| LLM | local ⇄ cloud внутри `llm.ts` (без capability-согласования) | `llm.ts:362,424` |
| MCP | local handler отсутствует → MCP `callTool` | `tools/index.ts:80-88` |

**[V] важный побочный факт:** фильтр режима применяется и к MCP-инструментам, но ни один
MCP-инструмент не входит ни в один `allowedTools` ⇒ на раунде 0 MCP-инструменты **невидимы для
модели во всех режимах**. Спасает только `tool-loop.ts:165` (раунд ≥1 → полный список).

---

## 9. Baseline: методология и ПЕРВЫЙ ЗАМЕР

### 9.1 Методология (для повторяемости)

1. **Корпус**: типовые команды по категориям (app, app-raw, system, weather, news, web, file,
   code, screen, memory, greeting, media, action, gui, free). Цель — ~200; первый прогон — 56.
2. **Для каждой**: `expected route`, `actual route` (`layer`, `intent`, `mode`, `tools`), latency.
3. **Метрики**: распределение L0-fast / L0-direct / L1-semantic / L1-regex / **L2(LLM)**;
   LLM-free share; LLM calls/request; p50/p95 latency; fallback rate; FP/FN rate.
4. **Инструментирование**: `RouteDecision` уже содержит `layer/confidence/reason` — достаточно
   экспортировать агрегат без изменения поведения (не observability-подсистема).
5. **Прогон**: детерминированная часть — без сети/Ollama (воспроизводимо в CI); embedding-часть —
   отдельный прогон с Ollama.

### 9.2 Результат первого прогона [V] — измерено, не оценено

Условие: **embeddings недоступны** (semantic-router отключён) ⇒ это **нижняя граница** LLM-free.

```text
n = 56

L0-fast      10   17.9%
L0-direct    10   17.9%
L1-regex     36   64.3%
L1-semantic   0    0.0%   (не измерялось — harness без Ollama)
LLM-free = 20/56 = 35.7%

Фактический L2 (intent == unknown) = 13/56 = 23.2%
Latency (детерминированная часть): p50 = 0.02 ms, p95 = 0.31 ms, max = 1.46 ms
```

Распределение интентов: `gui 18` (**32%** — подтверждает «gui слишком широк»), `unknown 13`,
`web_search 5`, `system 3`, `weather 3`, `news 3`, `greeting 3`, `code 2`, `screen 2`, `memory 2`,
`file_read 1`, `file_write 1`.

Точность на детерминированной части: из 10 ожидавшихся L0-direct **1 false negative** (F4,
«сколько оперативки свободно»); на L1 — **2 ложных маршрута** (F2 «найди файл отчёт» → web_search,
F3 «нажми кнопку поиска» → web_search).

**[I] Оценка при работающих embeddings:** доля L1-semantic вырастет за счёт части из 36 L1-regex
строк, но **LLM-free останется 35.7%** — потому что L1 не пропускает LLM (F5). Это ключевой вывод:
дальнейший рост «дешевизны» требует не лучшего intent-детектора, а **действий без LLM**.

### 9.3 Что замер НЕ покрывает (честно)

- доля L1-semantic (нужен прогон с Ollama + electron-store harness);
- реальный L2 latency и tokens/request (нужны живые вызовы LLM);
- FP/FN по всем категориям (нужна разметка ~200 команд);
- GUI/медиа-сценарии end-to-end (нужен GUI-контекст).

---

## 10. Что НЕ надо создавать (жёсткий список)

|  Не создавать | Почему (из аудита) |
|---|---|
| Новый `CognitiveRouter` | `router.ts` — единственный вход и единственный вызывающий; authority уже де-факто. Мешают только D3/D4 |
| Новый `AttentionEngine` / вторая state machine | `attention-manager.ts` уже детерминированно считает focus/urgency/proactive; нужны salience + проекция уровней **в том же файле** |
| Новый `EmbeddingIntentIndex` | `semantic-router.ts` — centroid-matching с порогом и reject; нужны hardening + калибровка + якоря Action |
| Новый `FastPath` / вторая таблица алиасов | D1/D2: две таблицы уже есть; надо **слить в одну** |
| Новый `Context Resolver` как сервис | прообраз есть — `app-resolver.ts`; нужна **функция**, расширенная на target (media/window) |
| Третий фильтр инструментов | уже два (D5); нужен один, выведенный из Action/Capability |
| Третья функция бюджета контекста | уже три (D6/D7); нужен один источник |
| `Observability` subsystem | достаточно агрегата по существующему `RouteDecision` |
| Параллельная система Actions | словарь Action должен **заменить** `TOOL_BY_INTENT`, а не жить рядом |

---

## 11. Implications для Step 2 proposal

1. **Scope сокращается**: «построить когнитивную маршрутизацию» → «достроить
   `Intent → Capability/Action → Tool` и устранить D3/D4».
2. **Capability-контракт нужен раньше**, чем казалось: он — предусловие не только для Graphiti,
   но и для (а) выбора `num_ctx` (F5/Step 1), (б) включения fallback-парсера tool-calls только
   слабым моделям (D8), (в) gate «structured output» перед extraction.
3. **Новый приоритет — «LLM-free actions».** Замер: LLM-free = 35.7%, и L1 не помогает (F5).
   Дешёвый механизм для `greeting`, `weather`, `media`, `system` — это **не** классификация,
   а прямое действие/ответ без LLM.
4. **Медиа — обязательный тест-кейс** (6/56 запросов, 0 якорей, 0 Actions, 0 Tools). Если Step 2
   не даёт `PLAY_MEDIA/PAUSE_MEDIA/SET_VOLUME` без LLM — архитектура не решает заявленную задачу.
5. **F1 — блокер GUI-направления**: GUI-действия недостижимы на раунде 0. Чинится словарём Action.
6. **Формализм `layer` уточнить**: `L1-regex + intent=unknown` фактически L2 (F6), иначе метрика
   «сколько LLM-вызовов» врёт.
7. **Graphiti-границы разделены** (раздел 12) — решение по L2 можно принимать отдельно от Step 2.

---

## 12. Graphiti compatibility spike — финальный статус

| Граница | Вердикт | Доказательство |
|---|---|---|
| **A. FalkorDB local-only на Windows** | **FAILED** | `falkordblite` не публикует `win_amd64` wheel ни в одном релизе (только macosx/manylinux + sdist) ⇒ на Windows нужна компиляция Redis+FalkorDB (C). Docker отсутствует. WSL Ubuntu есть — единственный обход, **не проверялся** |
| **A′. Поддержка в graphiti-core 0.30.1** | **VERIFIED** | METADATA: extras `falkordb>=1.1.2`, `falkordblite>=0.5.0` (python≥3.12); наш Python 3.12.13 подходит. Официальные бэкенды: Neo4j / FalkorDB / Neptune. **Kuzu помечен deprecated** |
| **B. Extraction, `json_object`** | **FAILED (воспроизведён)** | `json_object` инжектит схему в промпт (`openai_generic_client.py:194-200`); `qwen3:1.7b` вернул эхо схемы → `ExtractedEdges: edges Field required` |
| **B′. Extraction, native `format`=schema** | **VERIFIED** | Изолированный прогон с **реальной** схемой `ExtractedEdges`: 1.7b → валидный JSON, `edges=4`, без эха, **9.5 с**; 4b → `edges=6`, **48.4 с** |
| **C. Write path** | **VERIFIED** | `c-probe.py`: ADD **OK за 27.1 с**; в графе **6 Entity / 10 RELATES_TO / 5 RelatesToNode_ / 1 Episodic** |
| **C. Retrieval path** | **VERIFIED при совпадении языка**, FAILED при русском запросе | SEARCH **0.1 с** → 5 фактов (EN-запрос); RU-запрос → 0 |

### 12.1 Разделение проблем (главный результат спайка)

**[V] Блокер E2E — НЕ backend и НЕ «слабая модель сама по себе».** Точные причины:
1. **канал передачи схемы**: prompt-injected `json_object` (эхо) вместо native `format`
   (constrained decoding) — закрывается B′;
2. **языковая нормализация extraction**: `qwen3:1.7b` записал русский эпизод **английскими фактами**
   (`Maksim said on 15 September 2026 that he prefers dark theme…`), а FTS-индексы созданы со
   `stemmer := 'english'` (`kuzu_driver.py:143-148`) ⇒ русский запрос не находит ничего.

**[V] Доказательство пункта 2** (тот же граф, разные языки запроса):
```text
search('Какую тему в редакторе предпочитает Максим?')   → edges=0
search('What theme does Maksim prefer in the editor?')  → edges=5
QUERY_FTS_INDEX('RelatesToNode_','edge_name_and_fact','Neovim')  → 1 ребро, score 0.566  (механика работает)
QUERY_FTS_INDEX('RelatesToNode_','edge_name_and_fact','Максим')  → 0                     (язык не совпал)
```

**[I] Семантическое качество 1.7b** (не блокер, но важно): `target_entity_name` = «15 сентября
2026 года», `relation_type` = «said» — структура валидна, содержание слабое. Для L2 нужен либо
более сильный extractor-провайдер, либо пост-фильтрация (capability-вопрос, вне Step 1.5).

### 12.2 Метрики спайка (latency / VRAM / зависимости)

| Метрика | Значение | Условие |
|---|---|---|
| ADD (эпизод 227 симв.) | **27.1 с** | qwen3:1.7b + nomic-embed, Kuzu embedded, `max_coroutines=1` |
| SEARCH (hybrid) | **0.1 с** | тот же стенд |
| Extraction напрямую (native `format`) | **9.5 с** | qwen3:1.7b, реальная схема |
| Extraction напрямую (native `format`) | **48.4 с** | qwen3:4b (≈5× медленнее) |
| Extraction (prompt-injected json) | 10.1 с, **невалидно** | qwen3:1.7b |
| VRAM | ~1.7 ГБ (LLM) + ~0.3 ГБ (embed) | по `/api/ps`; влезает в 4 ГБ GTX 1650 |
| Локальность | **полностью local-only** | Kuzu embedded + Ollama, внешних сервисов нет |
| FalkorDB | требует WSL/Docker/сервер | единственный подтверждённый путь для FalkorDB |

**[I] Следствие:** L2-слой технически достижим локально на Kuzu с native `format`, но упирается в
(а) deprecated-бэкенд, (б) языковую нормализацию. Оба — вопросы capability/провайдера, а не
«Graphiti не работает».

---

## 13. Открытые вопросы (для DEC)

1. Владелец Action-словаря: расширение `intent.ts` или новый `actions.ts`? (рекомендация: `intent.ts`,
   чтобы не появился третий файл-истина)
2. `filterToolsByIntent` / `TOOL_BY_INTENT`: удалить как dead или заменить `Action → Tool`?
   (рекомендация: заменить, но не раньше DEC)
3. `mode` как policy-слой: остаётся частью decision-пути или становится только конфигурацией
   промпта (тогда инструменты выбирает Action)?
4. Attention: должен ли `maxContextTokens` влиять на маршрут/бюджет, или attention остаётся
   потребителем policy?
5. Capability-контракт: где живёт таблица моделей (рядом с `config.ts`, как в Adaptation §4)?
6. Graphiti: применять ли B′ в sidecar (native `format`) и с каким extractor-провайдером?
   Отдельно — как лечить языковую нормализацию (вопрос качества L2).
7. Медиа: какой backend становится target для `PLAY_MEDIA` (локальный плеер / media-session /
   браузер)? — вопрос Context Resolver, требует e2e-перечисления.
8. Чинить ли F1–F4 отдельным маленьким коммитом сразу после DEC (они не требуют новой архитектуры)?

---

## 14. Exit criteria — чеклист

- [x] Карта решений построена (10 вопросов брифа, раздел 1) и согласована с кодом.
- [x] Дубли перечислены (D1–D8) с `файл:строка`.
- [x] Canonical routing authority выбран: **`router.ts`** (раздел 5).
- [x] «Что не надо создавать» зафиксировано (раздел 10).
- [x] Baseline methodology зафиксирована (9.1) **и первый прогон снят реально** (9.2, n=56).
- [x] Intent ≠ Capability ≠ Action ≠ Tool разобрано (раздел 4).
- [x] Graphiti spike доведён: A FAILED, A′ VERIFIED, B FAILED, B′ VERIFIED, C VERIFIED-с-оговоркой
      (раздел 12), с метриками latency/VRAM/локальности.
- [x] Production tree не изменён (в коммит идёт только этот файл + probe вне репозитория).
- [x] Никаких «заодно исправили».

**[V] Побочный эффект аудита:** найдено 10 дефектов (F1–F10), включая F1 (GUI-действия недостижимы
на раунде 0) и три ложных маршрута (F2–F4). Ни один не исправлялся — все вынесены в DEC.

### Артефакты спайка (вне репозитория, для воспроизведения)

```text
C:\TEMP\step15-probe.test.ts     — harness baseline (56 команд, реальный router.ts)
C:\TEMP\step15-probe-output.txt  — лог baseline
C:\TEMP\b-probe.cjs, b2-out.txt  — extraction B/B′ (упрощённая и реальная схема)
C:\TEMP\edges-schema.json        — реальная схема ExtractedEdges (из graphiti-core)
C:\TEMP\c-probe.py, c-out.txt    — E2E write+retrieve (своя БД)
C:\TEMP\c-inspect.py, c-fts.py   — инспекция графа и FTS-индексов
C:\TEMP\c-probe3.py, c3-out.txt  — языковая проверка retrieval
```


