# U.N.A. v40 — Phase 2 / Step 2-A
## Cognitive Routing: адаптация архитектурного предложения под реальное состояние кода v40

**Дата:** 2026-09-17
**Статус:** адаптация proposal'а после ревью по коду; production tree не изменяет
**Оригинал:** `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md`
**База:** фактическая инвентаризация routing-путей в v40 (fast-path, semantic-router, intent, router, attention-manager, app-resolver, config)

---

## 1. Что это и чем отличается от оригинала

Оригинальный документ Step 2 (1150 строк) — сильный идейный документ, но он
предлагает 12 новых сущностей, значительная часть которых **уже реализована** в
production-коде v40. Эта адаптация сохраняет главную идею и честно отделяет
«уже построено» от «действительно отсутствует».

**Главная поправка:** Step 2 — это не «построить когнитивную маршрутизацию».
Она уже построена (router.ts, M5). Step 2 — это **достроить capability-слой
над маршрутизацией**, которого не существует: система знает *имя* модели,
но не знает её *возможностей*.

Сохранённый из оригинала без изменений принцип:

> **Route to the cheapest mechanism capable of solving the request correctly.**
> **No route is better than a wrong route.**
> **Privacy policy — независимый gate поверх fallback-цепочки.**

---

## 2. Инвентаризация: идея Step 2 → где уже живёт в коде v40

| Идея из Step 2 | Уровень | Уже реализовано в | Статус |
|---|---|---|---|
| L0 deterministic fast path | L0-fast | `fast-path.ts` — алиасы приложений (RU/EN), `open_app` без LLM | ✅ работает |
| L0 детерминированные команды | L0-direct | `router.ts` (сырые имена приложений, сводка о системе) | ✅ |
| L1 semantic intent (embedding + threshold + reject) | L1-semantic | `semantic-router.ts` — якорные фразы, cosine similarity, `SEMANTIC_CONFIDENCE_THRESHOLD`, fallback в regex | ✅ активен (M1) |
| L1 regex fallback | L1-regex | `intent.ts` — 12 интентов, паттерны RU/EN | ✅ |
| L2 LLM cognition | L2-llm | `tool-loop.ts` (единая точка правды) | ✅ |
| Target resolution из среды | Context Resolver (частично) | `app-resolver.ts` (resolve *.lnk из Start Menu, приоритет exact > fuzzy > substring) | ✅ для open_app |
| Внимание как runtime-механизм | Attention | `attention-manager.ts` — FocusState (deep_focus/gaming/…), ResponseUrgency, DND | ⚠️ user-attention есть; **event-salience — нет** |
| Capability contract (`ModelCapabilities`) | Capability Registry | — | ❌ **нет**. `config.ts` хранит `localModel: string` + `provider: 'auto'`, о capabilities ничего не знает |
| Capability negotiation (required/preferred/fallback + privacy gate) | Provider Router | — | ❌ **нет**. В `llm.ts` ветки провайдеров без переговоров |
| Отдельный provider для memory extraction (Graphiti fix) | — | — | ❌ нет (падает на `ExtractedEdges: edges Field required`) |
| Context Composer (STATIC/CACHEABLE/VOLATILE) | — | частично: `dynamic-prompt/index.ts` + RLM, но без явного кэшируемого региона | ⚠️ |
| Salience score для событий | Attention Engine | — | ❌ нет (события → proactive.ts напрямую) |

**Вывод таблицы:** лестница L0→L2 и «дешёвый путь первым» — это уже **текущий
прод** v40, а не будущее. Дублирующего «шестого роутера» строить не нужно.

---

## 3. Реальный пробел, который закрывает Step 2

`config.ts` описывает модель **именем и провайдером**:

```ts
provider: 'auto',        // local-first
localModel: 'qwen3:1.7b',
cloudProvider: 'gemini',
```

Всё остальное (structured output, tool calling, vision, контекст) — неявные
предположения, размазанные по коду. Симптомы уже есть:

1. **Graphiti E2E падает** на `ExtractedEdges: edges Field required` — потому что
   qwen3:1.7b не тянет structured output, а система не знает, что нужно проверить
   capability **до** вызова.
2. **Дрейф документации по модели** (README: gemma4 / AGENTS.md: qwen3:4b / код:
   qwen3:1.7b) — ровно тот класс проблем, который решает capability contract:
   доки перестают дублировать то, что должно читаться из конфига.
3. Fallback-парсинг tool calls (`extractToolCallsFromContent`) включён всем
   моделям одинаково, хотя нужен только слабым.

Итого: **маршрутизация запросов готова, маршрутизация по возможностям — нет.**

---

## 4. Скоуп Step 2-A: пять дельт (и только они)

### Дельта 1 — Capability contract (новое, ядро шага)

`ModelCapabilities` из оригинала (§4) принимается как основа. Единственное
архитектурное решение: **contract живёт рядом с LLM config, а не в отдельном
`CapabilityRegistry`** — отдельный реестр на текущем масштабе избыточен
(ответ на DEC-вопрос 1 оригинала).

```ts
// electron/ai/capabilities.ts (новый файл, ~100 строк)
export interface ModelCapabilities { /* как в оригинале §4 */ }

/** Единственный источник правды: capabilities по (provider, model). */
export function resolveCapabilities(provider: string, model: string): ModelCapabilities;
```

- Таблица известных моделей — статические данные (qwen3:1.7b, qwen3:4b, gemma,
  cloud-модели), для неизвестных — консервативные дефолты (все опции off).
- Consumer #1 (немедленный): Graphiti memory extraction — см. Дельту 3.

### Дельта 2 — ProviderRouter как функция, не класс

`provider: 'auto'` в config уже означает «выбери сам». Capability negotiation —
это расширение этой логики, а не новая подсистема:

```ts
interface CognitionRequest {
  requiredCapabilities: CapabilityKey[];   // без них — не маршрутить вообще
  preferredCapabilities?: CapabilityKey[]; // порядок предпочтения
  privacyClass: 'local-only' | 'private' | 'normal';
}
```

Privacy gate: `local-only` запрещает fallback в облако **до** перебора
fallback-цепочки, а не после (сильнее оригинала: там privacy — gate «поверх»,
здесь — фильтр списка кандидатов до перебора).

### Дельта 3 — Отдельный extraction provider для Graphiti

Решает зафиксированный E2E failure без смены dialogue-модели:

```text
dialogue:        qwen3:1.7b          (дёшево, всегда)
extraction:      модель с structured output (cloud или более крупная локальная)
embeddings:      nomic-embed-text (уже так)
```

Это ровно §16 оригинала, но прицельно: первый consumer — `memory_add`/`memory_search`
через MCP. Изолированный эксперимент, не трогает чат.

### Дельта 4 — Salience gate для событий (Attention без LLM)

Формула из §10 оригинала принимается, с двумя уточнениями:

- параметры калибруются **по логам** существующих событий (proactive, background-monitor),
  не руками;
- результат — **расширение** `attention-manager.ts` (там уже живут FocusState и
  ResponseUrgency), а не новый `AttentionEngine`. Новое — только salience-скoring
  для *системных событий* (EventBus → salience → cognition или record).
  Ключевое правило оригинала сохраняется: **событие ≠ cognition trigger**.

### Дельта 5 — Контекстная зона кэширования

`dynamic-prompt/index.ts` + RLM разделяются на STATIC / CACHEABLE / VOLATILE
(§18 оригинала). Сейчас стабильный prefix не отделён явно — это блокирует и
prompt caching у cloud-провайдеров, и кэширование embeddings-индексов.

---

## 5. Что НЕ делать (адаптация §22 оригинала + ревью)

Всё из оригинала (§22) остаётся в силе. Добавляется по итогам ревью:

- **Не создавать** `EmbeddingIntentIndex` как новый модуль — это hardening
  существующего `semantic-router.ts` (якорные фразы, калибровка threshold на
  реальных логах, смешанные RU/EN запросы). Новая сущность там, где уже есть
  рабочая, — регрессия обслуживаемости.
- **Не вводить** новый `IntentRouter`/`CognitionRouter` — `router.ts` уже единая
  точка входа с уровнями L0-fast → L0-direct → L1-semantic → L1-regex → L2-llm.
- **Не проектировать** Context Resolver для media-сценариев (§8 оригинала,
  «active YouTube tab») до e2e-подтверждения GUI-перечисления (`list_windows`,
  nut-js). Context Resolver v0 = WorldState + preferences + `app-resolver.ts`.
- **Не заводить** новый `Policy Engine` как отдельную подсистему: policy = текущий
  safety classifier + pending-action confirmations; capability gate добавляется
  в них, а не рядом.
- **Не начинать** реализацию до консолидационного аудита (Шаг 1 ниже) и до
  базовых метрик (Шаг 2) — иначе нечем будет доказать пользу.

---

## 6. Метрики приёмки (новое относительно оригинала)

Оригинал не задавал, как измерить «дешевле». Фиксируем до реализации:

| Метрика | Baseline (снять до работ) | Цель после Step 2 |
|---|---|---|
| Доля команд, решённых без LLM (L0/L1) | инструментировать `RouteDecision.layer` в логи | ≥ 50% на повседневном профиле |
| p95 latency простых команд («открой X») | замерить | ≤ 500 мс |
| LLM-вызовов в сутки (окно обычного использования) | из логов tool-loop | −30% без потери качества |
| Graphiti memory_add E2E | сейчас FAIL (structured output) | PASS с extraction-provider |
| Ложные маршруты (wrong route при уверенном threshold) | 0 по определению | 0 — reject вместо forced intent |

Способ снятия baseline: логирование `RouteDecision` (layer, confidence, reason)
уже предусмотрено структурой `router.ts` — добавить экспорт статистики, не менять
поведение.

---

## 7. Порядок работ ( sequencing )

```text
Шаг 1. Routing audit (1 сессия, только чтение)
        Инвентаризация всех routing-путей в коде: router.ts, fast-path.ts,
        semantic-router.ts, intent.ts, tool-loop.ts, proactive.ts, main.ts IPC.
        Выход: таблица «кто что решает, где дубли» — подтверждает/ломает §2 этого документа.

Шаг 2. Baseline metrics (не меняет поведение)
        Логирование layer/confidence + сборка 7-дневной статистики.

Шаг 3. Capability contract (Дельта 1)
        capabilities.ts + resolveCapabilities + таблица моделей + тесты fixtures.

Шаг 4. Extraction provider spike (Дельта 3)
        Graphiti memory_add с отдельным extraction provider. Не трогает диалог.

Шаг 5. DEC — только теперь, с цифрами:
        - capability в config vs отдельный registry (Дельта 1 решает: рядом с config)
        - threshold семантического роутера (калибровка по логам Шага 2)
        - privacy-gate как фильтр, а не пост-проверка
        - нужен ли ProviderRouter как класс или функция (по умолчанию: функция)

Позже (не в Step 2): Context Resolver media-сценарии (блокер: GUI e2e),
autonomous loop, attention states ladder поверх attention-manager.
```

---

## 8. Сокращённый список DEC-вопросов

Из 12 вопросов оригинала (§26) сняты кодом ещё до DEC:

| # | Вопрос оригинала | Ответ по коду v40 |
|---|---|---|
| 1 | Отдельный CapabilityRegistry? | Нет — `capabilities.ts` рядом с config, реестр не нужен |
| 2 | Где жить Embedding Intent Index? | Он уже живёт: `semantic-router.ts`. Только калибровка |
| 5 | Когда deterministic бьёт embedding? | Уже решено в `router.ts`: L0 → L1-semantic → L1-regex, без арбитража — строгий порядок |
| 6 | Как сочетать с существующим intent.ts? | Ничего не менять; regex — fallback при reject, как сейчас |
| 8 | Duplicate routing? | Снимается инвентаризацией §2; новых роутеров не заводить |

Остаются открытыми для DEC: порог similarity и калибровка (по логам), извлечение
extraction provider (Дельта 3), salience-параметры (по логам), формула
capability+resource+privacy в выборе провайдера.

---

## 9. Минимальные контракты

Принимаются из оригинала (§24) без изменений — `IntentDecision`,
`AttentionDecision`, `CognitionRequest` — с одним дополнением: поле
`privacyClass` поднимается из optional в обязательный для любого cognition
запроса, проходящего через ProviderRouter (см. §4 Дельта 2).

---

## 10. Отличия от оригинала (сводно)

| Аспект | Оригинал Step 2 | Адаптация Step 2-A |
|---|---|---|
| Диагноз | маршрутизации нет, надо построить | лестница есть (router.ts M5), нет capability-слоя |
| EmbeddingIntentIndex | новая сущность | hardening существующего semantic-router.ts |
| Attention Engine | новый модуль | расширение attention-manager.ts |
| Policy Engine | новая подсистема | расширение safety classifier + confirmations |
| Privacy | gate поверх fallback | фильтр списка провайдеров до перебора |
| Приёмка | сценарии A–G (качественные) | + измеримые метрики и baseline до работ |
| Порядок | design → DEC → impl | audit → metrics → contract → spike → DEC |
| Новых сущностей | 12 | 1 файл (capabilities.ts) + расширения существующих |

---

## 11. Статус

Принято к рассмотрению как **поправка к оригиналу**, не замена: оригинал
остаётся идейным документом, эта адаптация — рабочим скоупом Step 2.
Следующий шаг — Шаг 1 (routing audit): только чтение кода, таблица дублирования,
без изменений прод-дерева.
