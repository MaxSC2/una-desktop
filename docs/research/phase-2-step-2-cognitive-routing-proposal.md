# Phase 2 / Step 2 — Cognitive Routing Proposal (consolidated)

**Дата:** 2026-09-18
**Статус:** PROPOSAL + DEC DRAFT. Production code не изменён. Реализация — только после DEC.
**Основа:** `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md` (идея),
`UNA_Phase2_Step2_Cognitive_Routing_Adaptation.md` (адаптация),
`docs/research/phase-2-step-1.5-routing-reconciliation.md` (аудит, `c677eb6`),
`docs/research/phase-2-memory-research.md` (Step 1, `6ef17cb`).
**Принцип:** `Route to the cheapest mechanism capable of solving the request correctly.
No route is better than a wrong route.` Privacy — независимый gate.

Все утверждения размечены **[V]** (verified: код/прогон) и **[I]** (inference/design).

---

## 1. Problem statement

**[V] Что уже работает (не надо строить):** лестница `L0-fast → L0-direct → L1-semantic →
L1-regex → L2-llm` существует и вызывается из единственной точки — `routeMessage()` в
`router.ts:136`, которую вызывает `executeToolLoop` (`tool-loop.ts:93`). Оба IPC-входа
(`chat:send`, `chat:stream`) идут через tool-loop. Новый роутер не нужен.

**[V] Реальные разрывы, найденные аудитом:**

| # | Разрыв | Последствие |
|---|---|---|
| G1 | **L1 не экономит LLM** (F5) | LLM-free = 35.7% корпуса; `weather/news/greeting/media` всё равно зовут модель |
| G2 | **Нет Action-словаря** (Intent ≠ Action ≠ Tool) | media/reminder не имеют ни якоря, ни интента: `unknown` = 23.2% корпуса |
| G3 | **Capability-контракта нет** | `config.ts` знает имя модели, не её возможности → Graphiti extraction падал (B), `num_ctx` берётся из ресурсов, а не из модели |
| G4 | **Attention не влияет на маршрут и бюджет** | `AttentionState.maxContextTokens` не читает никто; event-salience отсутствует |
| G5 | **Дубли D1–D8** | два детектора intent, два писателя `currentMode`, два фильтра tools, три значения бюджета |
| G6 | **Дефекты F1–F4** | GUI-действия недостижимы на раунде 0; три ложных маршрута |
| G7 | **Graphiti: причина провала мифологизирована** | на деле: канал схемы (B/B′) + языковая нормализация (C), а не «слабая модель» |

**[I] Формулировка задачи Step 2 в одну строку:** не строить когнитивную маршрутизацию, а
**достроить слой `Intent → Capability/Action → Tool` и capability-контракт, устранив дубли**, —
при этом сохранив решения Step 1 (SURFACE gate, детерминированный бюджет, forget/retention,
static/cacheable/volatile композер).

---

## 2. Существующие механизмы U.N.A. (карта, сжатая версия аудита)

**[V] Полная таблица из 10 вопросов — в `phase-2-step-1.5-routing-reconciliation.md §1`.**
Сводка:

```text
utterance
  └─ router.ts:136  routeMessage()                      ← canonical routing authority
       ├─ L0-fast    fast-path.ts    : regex + 26 алиасов → dispatchTool(open_app)
       ├─ L0-direct  router.ts       : regex + 18 алиасов → open_app | system_info
       ├─ L1-semantic semantic-router.ts : embed() → centroids → cosine ≥ 0.6
       ├─ L1-regex   intent.ts       : 13 интентов, фиксированный порядок
       └─ L2-llm     tool-loop.ts    : LLM (всегда, если route.direct == null)
```

Исполнители и обвязка **[V]**: `tools/index.ts` (25 локальных tools + MCP merge),
`dispatchTool` (local → MCP fallback), `modes.ts` (mode + allowlist), `llm.ts` (`num_ctx`),
`dynamic-prompt/index.ts` (сборка промпта; **второй** детектор intent и **второй** писатель mode),
`attention-manager.ts`, `resource-manager.ts`, `world-model.ts`, `app-resolver.ts`.

**[V] Что уже есть как прообраз Context Resolver:** `app-resolver.ts` (резолв `.lnk`,
приоритет exact > fuzzy > substring) — используется `open_app`. Это первая функция будущего
Context Resolver, а не новый сервис.

---

## 3. Model independence

**[V] Текущее состояние:** модель задана **именем и провайдером** (`config.ts`:
`provider: 'auto'`, `localModel: 'qwen3:1.7b'`, `cloudProvider: 'gemini'`). Возможности —
неявные предположения, размазанные по коду:
- `embed.ts:19` шлёт embeddings **диалоговой** моделью (`cfg.localModel`);
- fallback-парсинг tool-calls в `llm.ts` включён всем моделям одинаково (D8);
- `num_ctx` берётся из ресурсов, не из окна модели (G3);
- extraction Graphiti не проверяет capability заранее (G3 → провал B).

**[I] Принцип:** capability — **данные**, полученные из (provider, model), а не ветвление по имени.
Код не должен содержать `if (model === 'qwen3:1.7b')`.

**[V] Дрейф документации как симптом:** README описывает одну модель, AGENTS.md другую, код третью.
Такое расхождение невозможно, если источник — контракт, а документация ссылается на него.

---

## 4. Capability model

**[I] Контракт (расширение §4 оригинала, местоположение — рядом с LLM config, как в Adaptation §4):**

```ts
// electron/ai/capabilities.ts (новый, ~100 строк)
export type CapabilityKey =
  | 'tool_calling'        // нативный function calling
  | 'structured_output'   // может выдавать JSON по схеме
  | 'json_schema_native'  // принимает JSON-schema (constrained decoding)
  | 'vision' | 'reasoning' | 'streaming'
  | 'long_context'        // окно ≥ 32k
  | 'multilingual_stable'; // не нормализует язык ввода в другой язык

export interface ModelCapabilities {
  provider: string; model: string;
  contextWindow: number;              // реальное окно (не желаемое)
  maxOutputTokens: number;
  capabilities: Record<CapabilityKey, boolean>;
  privacyClass: 'local-only' | 'private' | 'normal';
  costClass: 'free' | 'cheap' | 'expensive';
  measured?: {                        // факты из наших прогонов, не из marketing
    structuredOutputLatencyMs?: number;
    structuredOutputValid?: boolean;
  };
}

export function resolveCapabilities(provider: string, model: string): ModelCapabilities;
```

**[V] Наполнение фактами из спайка (не из README):**

| Модель | structured_output | json_schema_native | contextWindow | measured | источник |
|---|---|---|---|---|---|
| `qwen3:1.7b` (Ollama) | **false** (json_object → эхо схемы) | **true** | **4096** | 9.5 с, 4 edges, валидно | `/api/ps`, B′ |
| `qwen3:4b` (Ollama) | false | true | 4096 | **48.4 с**, 6 edges, валидно | B′ |
| cloud (gemini-flash) | true | — | 1M (заявлено) | не измерялось | docs |

**[V] Ключевые выводы для контракта:**
1. `qwen3:1.7b` **умеет** structured output через native `format`, но **не умеет** через
   prompt-injected `json_object` ⇒ два разных capability, а не одно.
2. Окно `qwen3:1.7b` = **4096**, при этом бюджет мог назначаться больше (Step 1) —
   контракт обязан иметь `contextWindow` и быть источником для `num_ctx`.
3. `structured_output_latency` у 1.7b в 5 раз лучше, чем у 4b ⇒ «более крупная модель» не
   автоматически лучше; решение должно опираться на измерение.
4. `multilingual_stable=false` у `qwen3:1.7b` (C: русский эпизод → английские факты) —
   это capability, влияющий на **extraction и retrieval**, и он должен быть видим до вызова.

**[I] Для неизвестных моделей** — консервативный дефолт: все capability `false`,
`contextWindow: 4096`, `privacyClass: 'normal'`. Тогда неизвестная модель деградирует предсказуемо
(и это видно в логах), а не ломается молча.

**[I] Consumer #1 (немедленный):** extraction для L2-памяти — вызов разрешён, только если
`json_schema_native || structured_output` **и** (для RU-контента) `multilingual_stable`. Иначе —
явный отказ с причиной, а не падение внутри pydantic.

---

## 5. Deterministic + semantic routing

**[V] Что есть:** `router.ts` — строгий порядок L0-fast → L0-direct → L1-semantic → L1-regex →
L2-llm, без арбитража между уровнями. Это правильная основа: детерминированное решение
принимается раньше вероятностного.

**[I] Что меняется (все — расширение, не замена):**

| # | Изменение | Закрывает |
|---|---|---|
| S1 | Слить таблицы алиасов `fast-path` + `router` в один источник (26 ∪ 18 записей) | D1 |
| S2 | Слить verb-regex (`OPEN_APP_RE`) в один паттерн с полным набором глаголов (RU/EN) | D2 |
| S3 | Добавить класс **прямых ответов без LLM** (`время/дата`, `system_info`, `greeting`) — не «интент», а готовый ответ | G1, F5 |
| S4 | L1 обязан уметь отдавать **Action**, а не только сужать tools | G2, F5 |
| S5 | `intent=unknown` перестаёт быть «сигналом LLM»: он значит «не сведено к Action» | F6 |
| S6 | Ошибка/неудача L0 больше не финал: `null`-путь эскалирует дальше, явная ошибка tool — тоже (по DEC) | F10 |

**[V] Ключевой факт замера, определяющий §5:** LLM-free = 35.7% (n=56), и **L1 не экономит LLM**
(F5). Значит, рост «дешевизны» даёт не лучший классификатор, а **действия без LLM** (S3/S4).
Поэтому порядок работ: сначала Action-словарь и прямые ответы, потом калибровка embeddings.

**[I] Правило маршрута (сохраняет принцип Step 2):**
```text
если действие выразимо детерминированно и его цель однозначна → L0 (без LLM)
если действие выразимо, но цель/формулировка вариативны      → L1 (semantic/regex) → Action → Tool
если нужен контекст диалога/задачи                           → L2 (contextual)
если нужна генерация/понимание                               → L3/L4 (LLM, capability-gated)
```

---

## 6. Embedding Intent Router

**[V] Что есть:** `semantic-router.ts` — якорные фразы на intent, эмбеддинг, центроиды, cosine,
`SEMANTIC_CONFIDENCE_THRESHOLD = 0.6`, reject → `unknown` → regex. Это уже работающий
embedding-intent-router; **новый индекс не создаётся** (см. §2, §10 аудита).

**[V] Предусловия, найденные аудитом (без них калибровка бессмысленна):**
- **F7** — размерность расходится (Ollama 768 vs hashing-fallback 256), `cosine` берёт `min()`;
- **F8** — embeddings считает **диалоговая** модель (`cfg.localModel`), а не embedding-модель.

**[I] Целевой дизайн (hardening того же файла):**
1. Якоря — на **Action**, а не только на домен-intent: добавить `PLAY_MEDIA`, `PAUSE_MEDIA`,
   `SET_VOLUME`, `CREATE_REMINDER`, `FIND_FILE`, `GET_SYSTEM_INFO`, `CLICK`, `TYPE_TEXT` (RU+EN).
   Это прямо закрывает G2 (media/action = 23.2% `unknown`).
2. Матч — не только `score ≥ threshold`, но и **margin** между top-1 и top-2: если
   `score1 - score2 < marginThreshold` → не форсировать (это и есть правило «reject вместо forced
   intent» из §19 оригинала).
3. `UNKNOWN/CLARIFY` — только когда *действие* неоднозначно и у него есть побочный эффект.
   Для безопасного действия с дефолтом (`PLAY_MEDIA` без цели) — дефолтная цель вместо вопроса
   (см. §7).
4. Embedding-модель — **отдельный конфиг** (`nomic-embed-text`, уже используется Graphiti), а не
   `localModel`; fallback-размерность привести к одной константе.
5. Калибровка thresholds — по логам (Шаг 2 sequencing), не руками.

**[I] Контракт (candidate, §16):**
```ts
interface IntentAnchor { action: ActionKey; phrases: string[]; lang: 'ru' | 'en' }
interface SemanticMatch { action: ActionKey; score: number; margin: number; matched: boolean }
```

**[V] Ничего из этого не реализуется на Step 2** (запрещено ТЗ). Это описание цели для DEC.

---

## 7. Context Resolver

**[V] Прообраз существует:** `app-resolver.ts` — `exact > fuzzy > substring`, резолв `.lnk` из
Start Menu, используется `open_app`. Это первая функция будущего Context Resolver.

**[I] Форма — функция, не сервис:**
```ts
resolveTarget(action: ActionKey, ctx: { world: WorldState; prefs: Preferences;
  recent: RecentHistory; memory?: SurfacedMemory }): ActionArgs | { clarify: ClarifyRequest }
```

**[I] Приоритеты разрешения цели (пример `PLAY_MEDIA`):**
```text
1. явная цель в utterance        («включи YouTube»)      → она
2. активная media-session        (браузер/плеер не спит) → она
3. preference (пользовательский дефолт)                  → он
4. recent history (последний раз)                        → он
5. системный дефолт                                      → браузер/плеер
clarify — только если ≥2 равноправных кандидата и нет preference/дефолта
```

**[V] Ограничение, зафиксированное аудитом (§8 оригинала / Adaptation §5):** сценарии
«активная YouTube-вкладка» требуют e2e-перечисления окон/медиа **до** проектирования. Поэтому:
- **Context Resolver v0 = WorldState + preferences + `app-resolver.ts`** (без media-session);
- media-сценарии (target=браузер/плеер) — **отложены** до GUI e2e (блокер, не в Step 2).

**[I] Инвариант:** Resolver никогда не вызывает LLM. Неоднозначность решается дефолтом или
`clarify`, но не «спросим модель, куда кликнуть».

---

## 8. Attention without LLM

**[V] Что есть:** `attention-manager.ts` — детерминированный (без нейросетей и LLM) расчёт
`FocusState` (`deep_focus/light_work/idle/chatting/gaming/meeting`), `interruptible`,
`ResponseUrgency`, `allowProactive`, `allowSound`, `sessionAttentionScore`, `conversationBurst`,
DND. Входы: resource state + история UI-интеракций (окно 50 событий).

**[V] Чего нет:** `maxContextTokens` не читает никто (G4/D6); нет event-salience — системные
события идут в `proactive.ts` напрямую; реакционные уровни отсутствуют.

**[V] Правило «EVENT ≠ LLM TRIGGER» уже выполняется де-факто:** `proactive.ts`, `life-loop.ts`,
`background-monitor.ts` **не вызывают** LLM (единственные вызовы `chatWithTools*` — в
`tool-loop.ts` и мёртвом `agents/index.ts`). Новый слой не должен это сломать.

**[I] Целевой дизайн — расширение того же файла, без второй state machine:**

```text
Event { source, type, urgency, novelty, userRelevance, explicitRequest, ignoredCount }
   ↓  salience = детерминированная взвешенная сумма (не LLM)
LEVEL:  ignore | observe | notice | react | cognize | interrupt
        ──────┬──────  ─────┬─────  ──┬──  ───┬───  ───┬───  ─────┬────
           запись      наблюдение  UI-    локальный  только    только
           в журнал    (без действ.) реакция действие   cognition interrupt
                                                     (L3/L4)   + notice
```

Принципы **[I]**:
1. salience считается **кодом**; LLM никогда не вычисляет salience и не решает «моргнуть ли».
2. Уровни `ignore→interrupt` — **проекция** над существующим `AttentionState`, не новый
   автомат. `interrupt` дополнительно требует `interruptible == true`.
3. `cognize`/`interrupt` — единственные уровни, которым разрешено звать cognition; всё остальное
   пишется/откладывается/отражается в UI.
4. `ignoredCount` и повтор (noise) **понижают** salience — защита от навязчивости.
5. Параметры весов калибруются по логам существующих событий, не назначаются вручную.
6. Attention → маршрут/бюджет: `maxContextTokens` становится **входом** бюджета (§12), а не мёртвым
   полем (закрывает часть G4; решение — в DEC).

**[I] Что НЕ делается:** новый `AttentionEngine`, нейросетевой классификатор событий, «LLM для
настроения». Это прямо запрещено и не нужно: всё выразимо детерминированно.

---

## 9. Cognition hierarchy L0–L4

**[V] Терминологическая коллизия, которую надо снять до кода:** в коде `layer = 'L2-llm'` означает
«вызвана LLM». В Step 2 `L3 = local LLM`, `L4 = powerful/cloud`. Это **одно и то же решение под
разными именами** и прямой источник путаницы в метриках.

**[I] Каноническая шкала (предлагается к DEC):**

| Step 2 уровень | Код (`RouteDecision.layer`) | Решает | LLM? | Примеры из корпуса (n=56) | Latency-цель |
|---|---|---|---|---|---|
| **L0** deterministic | `L0-fast`, `L0-direct` | regex/алиасы + прямые ответы | нет | «открой хром», «запусти курс», «сколько оперативки» | ≤ 10 мс |
| **L1** semantic/rules | `L1-semantic`, `L1-regex` | embedding/regex → **Action** | нет | «давай музыку», «сделай громче», «поставь напоминание» | ≤ 100 мс (embedding) |
| **L2** contextual | *(новый)* | контекст диалога/задачи/WorldState | нет/иногда локальная LLM для разбора | «напомни через 2 часа», «а теперь то же, но в другом окне» | ≤ 300 мс |
| **L3** local LLM | `L2-llm` (local) | понимание/генерация/инструменты | да, локальная | «почему проект падает после обновления» | секунды |
| **L4** powerful/cloud | `L2-llm` (cloud) | сложное рассуждение, длинный контекст, vision | да, облако | «проанализируй проект и предложи план» | секунды |

**[I] Правила перехода:**
```text
L0: цель однозначна и действие детерминировано          → tool/ответ, LLM не зовётся
L1: действие известно, формулировок много                → Action → Context Resolver → tool
L2: нужен контекст (диалог/задача/мир), но не генерация  → детерминированно, при необходимости
                                                            лёгкий локальный разбор (без tools)
L3: нужна генерация/рассуждение на локальном бюджете     → local LLM (capability-gated)
L4: нужны возможности, которых нет локально              → cloud, только если privacyClass
                                                            это допускает (§14)
```

**[V] Следствия из замера:** сегодня L1 фактически не существует как «дешёвый механизм»
(F5: после L1 всё равно вызывается LLM) — реализация §5/§6 впервые делает L0/L1 «LLM-free
классом». До этого таблица выше — цель, а не текущее состояние.

**[I] Метрика:** доля LLM-free = (L0 + L1 + L2) / все запросы. Baseline — 35.7% (нижняя граница,
без embeddings). Цель — ≥ 50% на повседневном профиле (Adaptation §6).

---

## 10. Provider Router

**[V] Что есть:** `llm.ts` — ветвление по `provider: 'auto' | 'local' | 'cloud'`, внутри —
local (Ollama native `/api/chat`) и cloud (OpenAI-совместимый/Gemini), с fallback
«облако → локальный Ollama». Capability-переговоров нет.

**[I] Форма — функция, не класс** (Adaptation §4, Дельта 2): `provider: 'auto'` уже означает
«выбери сам»; расширяем эту логику.

```ts
interface CognitionRequest {
  requiredCapabilities: CapabilityKey[];    // без них — не маршрутить вообще
  preferredCapabilities?: CapabilityKey[];  // порядок предпочтения
  privacyClass: 'local-only' | 'private' | 'normal';
  latencyBudgetMs?: number;
  maxCostClass?: 'free' | 'cheap' | 'expensive';
}
selectProvider(req, models: ModelCapabilities[], res: ResourceState)
  → { chosen: ModelCapabilities; chain: ModelCapabilities[]; reason: string }
```

**[I] Порядок решения (порядок важен):**
```text
1. privacy-фильтр:  local-only → все не-local выкидываются ДО перебора
                    (сильнее оригинала: там privacy — gate «поверх»; здесь — фильтр списка)
2. capability-фильтр: остаются модели, где все requiredCapabilities == true
3. resource-фильтр:  недостаток ресурсов (VRAM/CPU/батарея/режим gaming) → модель исключается
                     или помечается «отложить»
4. ранжирование:     preferred → latency → costClass
5. нет кандидатов → ЯВНЫЙ отказ/очередь с причиной
                     (никогда — молчаливый выбор неподходящей модели)
```

**[I] Graceful degrade:** `L4→L3→L2→L1` по возможностям, а не по «наличию ключа». Если задача
требует `structured_output`, а локальная модель его не имеет — это **не** повод вызвать её и
получить мусор (текущее поведение, приведшее к провалу Graphiti), а повод взять другую модель либо
честно отказаться.

---

## 11. Specialized models

**[I] Принцип:** роль = **требование к capability**, а не имя модели. Одна модель может закрывать
несколько ролей; невыполненная роль означает деградацию конкретной функции, а не отказ системы.

| Роль | Требуемые capability | Кандидат | [V] Измерено | Статус |
|---|---|---|---|---|
| conversation | `tool_calling`, `streaming` | `qwen3:1.7b` | окно **4096**; VRAM ~1.7 ГБ | ✅ есть |
| embedding | — (отдельный endpoint) | `nomic-embed-text` | используется Graphiti; ~0.3 ГБ | ⚠️ **не в конфиге U.N.A.** (F8) |
| memory extraction | `structured_output` **или** `json_schema_native`; для RU — `multilingual_stable` | `qwen3:1.7b` (native `format`) | **9.5 с**, `edges=4`, валидно; **но** RU→EN нормализация | ⚠️ условно годен |
| memory extraction (alt) | то же | `qwen3:4b` (native `format`) | **48.4 с** (≈5×), `edges=6` | ⚠️ дорого |
| memory extraction (alt) | `structured_output` | cloud (gemini-flash) | не измерялось | ⚠️ требует privacy-решения |
| vision | `vision` | — | — | ❌ нет |
| ASR | — | Web Speech API (fallback есть) / whisper.cpp (future) | — | ⚠️ fallback |
| TTS | — | Piper (**GPL-3.0** — только внешний процесс) / `speechSynthesis` | — | ⚠️ fallback |
| planner/reasoner | `reasoning`, `long_context` | cloud / крупная локальная | — | ❌ нет (не в Step 2) |

**[V] Главный вывод для архитектуры:** `qwen3:1.7b` **умеет** structured output через native
`format`, но **не умеет** через prompt-injected `json_object` (§4). То есть «extraction сломан» —
это про **канал** и **язык**, а не про «маленькая модель ни на что не годится». Более крупная
модель при этом **в 5 раз медленнее** — «больше» ≠ «лучше» автоматически.

**[I] Следствие:** вопрос «менять ли диалоговую модель ради Graphiti» **не ставится**. Правильная
постановка: у extraction — свой провайдер и свои требования. Это отдельное архитектурное решение
(§13, DEC-018), а не «апгрейд модели U.N.A.».

---

## 12. Context Composer integration

**[V] Что есть:** `dynamic-prompt/index.ts` собирает промпт из ~14 секций; RLM даёт HOT/WARM/COLD;
`[MEM]`-токены для памяти. Явного разделения STATIC/CACHEABLE/VOLATILE нет; episodic-поиск
происходит **внутри префикса** ⇒ префикс меняется каждый ход (Step 1, §4 исследования).

**[I] Целевой контракт — структурированный запрос, а не «строка от подсистемы»:**

```ts
interface CognitionRequest {
  regions: {
    static:    string[];   // identity, safety, capability descriptions, tool schemas
    cacheable: string[];   // world state, surfaced memory (меняется редко/предсказуемо)
    volatile:  string[];   // user message, текущая задача, транзиентное состояние
  };
  budget: TokenBudget;     // из ЕДИНОГО источника (§15)
  route: RouteDecision;    // уровень + Action, определивший запрос
}
```

**[I] Правила сборки:**
1. **Порядок:** `static → cacheable → volatile`. Префикс (`static + cacheable`) должен быть
   **стабильным между ходами** — тогда cloud prompt/KV caching становится возможным
   (Anthropic/OpenAI требуют стабильный префикс ≳1024 токенов).
2. **Surfaced memory идёт в `cacheable`, не в `static`** и проходит SURFACE gate Step 1:
   только top-K по релевантности к запросу, не «вся память».
3. **Transcript ≠ memory.** История диалога — `volatile` (или отдельный регион), surfaced memory —
   `cacheable`. Смешение этих сущностей запрещено (Step 1 / research v3 §57).
4. **Композиция детерминированная:** layout регионов определяет код; LLM не решает, что и куда
   положить. LLM влияет только на *содержимое* ответа.
5. **Бюджет — единый** (`getOptimalContextTokens` / capability `contextWindow` / attention), см. §15.
6. **При переполнении** — детерминированная лестница: сжать историю → урезать surfaced memory
   (по приоритету SURFACE gate) → урезать world state. `static` не урезается никогда.
7. **Влияние на KV cache:** `cacheable` меняется реже, чем `volatile`; изменение `cacheable`
   инвалидирует кэш — поэтому world state/memory обновляются по TTL/порогу, а не на каждый токен
   (согласуется с Step 1).

**[V] Связь со Step 1 (не разрушать):** SURFACE gate, deterministic token budgeting,
forget/retention, static/cacheable/volatile — все четыре решения Step 1 остаются в силе; §12 —
их интеграция с маршрутизацией, а не замена.

---

## 13. Graphiti boundary

**[V] Вердикты спайка (Step 1.5, §12 аудита) — по границам, а не «Graphiti плох/хорош»:**

| Граница | Вердикт | Доказательство |
|---|---|---|
| **A. FalkorDB local-only на Windows** | **FAILED** | `falkordblite` без `win_amd64` wheel (только macosx/manylinux + sdist) → на Windows нужна компиляция Redis+FalkorDB (C). Docker нет; WSL Ubuntu есть — **не проверялся** |
| **A′. Поддержка в graphiti-core 0.30.1** | **VERIFIED** | extras `falkordb>=1.1.2`, `falkordblite>=0.5.0` (python≥3.12); наш 3.12.13 подходит. Официальные бэкенды: Neo4j / FalkorDB / Neptune. **Kuzu deprecated** |
| **B. Extraction, prompt-injected `json_object`** | **FAILED** | схема инжектится в промпт (`openai_generic_client.py:194-200`) → `qwen3:1.7b` вернул эхо схемы → `ExtractedEdges: edges Field required` |
| **B′. Extraction, native `format`=schema** | **VERIFIED** | реальная схема `ExtractedEdges`: 1.7b → валидно, `edges=4`, **9.5 с**; 4b → `edges=6`, **48.4 с** |
| **C. Write path** | **VERIFIED** | ADD **OK за 27.1 с**: 6 Entity / 10 RELATES_TO / 5 RelatesToNode_ / 1 Episodic |
| **C. Retrieval** | **VERIFIED при совпадении языка**, FAILED на русском запросе | SEARCH 0.1 с → 5 фактов (EN); RU-запрос → 0 |

**[V] Две точные причины провала (не «слабая модель»):**
1. **канал схемы** — prompt-injected `json_object` вместо native `format` (закрывается B′);
2. **языковая нормализация** — `qwen3:1.7b` записал русский эпизод **английскими фактами**, а FTS
   создан со `stemmer := 'english'` ⇒ русский запрос не находит ничего.

**[I] Варианты решения (для DEC-018):**

| Вариант | Плюс | Минус | Рекомендация |
|---|---|---|---|
| **L2 на Kuzu** (sidecar, native `format`, отдельный extraction provider) | **полностью локально**, уже проверено (C VERIFIED), VRAM влезает | бэкенд **deprecated**; языковую нормализацию надо лечить | ✅ оставить L2 **опциональным** слоем за capability-gate |
| **FalkorDB через WSL** | официальный бэкенд | требует WSL/Docker; local-only на Windows FAILED; не проверялось | ⏸ отложить (не блокирует Phase 2) |
| **Заморозить L2** | нет риска | L1 остаётся без temporal-графа при строящейся архитектуре памяти | ⏸ допустимо как fallback |

**[I] Решение-рекомендация:** **не мигрировать backend сейчас**; L2-память остаётся
**опциональным слоем** (`enabled`-флаг + capability precheck), extraction — отдельный провайдер,
язык — требование к extraction-провайдеру (`multilingual_stable`), а не хак в FTS. Step 2 **не
трогает** прод-Graphiti: границы зафиксированы, реализация — отдельным решением.

**[V] Что НЕ доказано и остаётся открытым:** E2E-цепочка *через U.N.A. MCP* (write → search →
surfaced memory → Context Composer). Спайк доказал отдельные звенья, не всю цепочку. Это
честный OPEN-gap, а не VERIFIED.

---

## 14. Security / privacy implications

**[V] Что есть:** `safety/classifier.ts` (SSRF, env-filter, protected files), pending-action
confirmations (TTL/origin/one-shot — закрыто в M6), tool output = данные (P1-2 injection-фикстуры),
sandbox для shell.

**[I] Что добавляет routing-слой:**

| # | Правило | Почему |
|---|---|---|
| P1 | `privacyClass` **обязателен** в любом cognition-запросе, идущем через Provider Router | иначе облако выбирается «по умолчанию» |
| P2 | `local-only` — **фильтр кандидатов**, а не пост-проверка | нельзя «сначала сходить в облако, потом проверить» |
| P3 | В облако уходит **минимум**: surfaced memory, помеченная как local-only, не отправляется | «память может существовать на диске и не попадать в model-visible context» (Step 1) |
| P4 | Extraction-провайдер, если он облачный, получает **только эпизод**, не сырые секреты | extraction ≠ доступ ко всей памяти |
| P5 | Опасные действия — только через confirmation с digest/TTL/one-shot | уже реализовано (M6), routing не должен обходить |
| P6 | Результат инструмента — **данные**; никакая инструкция из web/file/MCP не меняет маршрут | P1-2 зафиксировал контракт; routing обязан его уважать |

**[I] Ключевое:** routing-слой — новое место, где может произойти «случайный» уход данных в облако
(через fallback). Поэтому privacy-фильтр стоит **до** перебора кандидатов, а не после (§10).

---

## 15. Resource implications

**[V] Факты железа и замеров:** GTX 1650 **4 ГБ VRAM**; `qwen3:1.7b` ≈ 1.7 ГБ, `nomic-embed-text`
≈ 0.3 ГБ; extraction 1.7b — 9.5 с, 4b — 48.4 с; ADD 27.1 с, SEARCH 0.1 с; `qwen3:1.7b` окно
**4096** (не 32k).

**[V] Проблемы, найденные аудитом:**
- **D6/D7** — три значения бюджета контекста, из них два мёртвых/дублирующих;
- **G4** — attention не влияет на бюджет;
- **G3** — `num_ctx` берётся из ресурсов, а не из реального окна модели (может превысить 4096);
- **F7/F8** — embeddings считает диалоговая модель; размерность плавает.

**[I] Целевые правила:**
1. **Единственный источник бюджета:** `min(capability.contextWindow, resource.available, attention.maxContextTokens)`.
2. **Одна тяжёлая модель в VRAM** одновременно; embedding — кандидат на CPU (0.3 ГБ освобождается).
3. **Режимы ресурсов** (уже частично есть: gaming/battery) → фильтр кандидатов Provider Router.
4. **Embedding-модель — отдельный конфиг** (закрывает F8 и снижает нагрузку: 1.7b не считает
   векторы).
5. **Latency-бюджеты** по уровням (§9): L0 ≤ 10 мс, L1 ≤ 100 мс (embedding), L2 ≤ 300 мс,
   L3/L4 — секунды; при превышении — деградация вниз, а не ожидание.
6. **Не запускать тяжёлое в фоне** при gaming: L2-память и extraction — в idle-окна (согласуется
   с Step 1 maintenance и существующим VRAM-gate M2).

**[I] Стоимость в облаке:** `costClass` — часть решения (§10); «дёшево» ≠ «бесплатно», поэтому
local-first остаётся дефолтом (`provider: 'auto'`), а облако — по capability/privacy, не по
умолчанию.

---

## 16. Candidate interfaces / data contracts

**[I] Минимальный набор (все — проектные, не реализованные).** Расширяют существующие типы,
не заменяют их.

```ts
// --- уже существуют (расширяются) ---
type Layer = 'L0-fast' | 'L0-direct' | 'L1-semantic' | 'L1-regex' | 'L2-llm';
interface RouteDecision { layer: Layer; direct?: DirectResult; tools?: ToolDef[];
  intent?: Intent; confidence?: number; reason?: string; action?: ActionKey }  // + action

// --- новые ---
type ActionKey = 'OPEN_APP' | 'PLAY_MEDIA' | 'PAUSE_MEDIA' | 'SET_VOLUME' | 'FIND_FILE'
  | 'SEARCH_WEB' | 'CREATE_REMINDER' | 'GET_SYSTEM_INFO' | 'READ_FILE' | 'WRITE_FILE'
  | 'CLICK' | 'TYPE_TEXT' | 'KEY_PRESS' | 'RUN_COMMAND';
interface ActionRequest { action: ActionKey; args: Record<string, unknown>;
  source: 'rule' | 'semantic' | 'context' | 'llm'; confidence: number }

interface IntentAnchor { action: ActionKey; phrases: string[]; lang: 'ru' | 'en' }
interface SemanticMatch { action: ActionKey; score: number; margin: number; matched: boolean }

interface ModelCapabilities { provider: string; model: string; contextWindow: number;
  maxOutputTokens: number; capabilities: Record<CapabilityKey, boolean>;
  privacyClass: 'local-only' | 'private' | 'normal';
  costClass: 'free' | 'cheap' | 'expensive';
  measured?: { structuredOutputLatencyMs?: number; structuredOutputValid?: boolean } }

interface CognitionRequest { requiredCapabilities: CapabilityKey[];
  preferredCapabilities?: CapabilityKey[]; privacyClass: ...;
  latencyBudgetMs?: number; maxCostClass?: ... }

interface AttentionDecision { level: 'ignore'|'observe'|'notice'|'react'|'cognize'|'interrupt';
  salience: number; reasons: string[] }

interface TokenBudget { total: number; static: number; cacheable: number; volatile: number;
  memory: number; source: { contextWindow: number; resource: number; attention: number } }
```

**[I] Правило контрактов:** `Intent ≠ Capability ≠ Action ≠ Tool`.
`Intent` — домен; `Capability` — **вычисляемая** производная (не хранилище);
`Action` — ограниченный глагол; `Tool` — механический исполнитель.
`Action → Tool` — единственная таблица маппинга (заменяет мёртвый `TOOL_BY_INTENT`, D5).

---

## 17. Migration plan from current architecture

**[I] Принцип:** никакого big-bang. Каждый шаг — маленький, тестируемый, обратимый, за DEC.

| Шаг | Что | Закрывает | Риск |
|---|---|---|---|
| **M-a** | Мелкие фиксы F1–F10 без новой архитектуры (GUI-действия на раунде 0, ложные маршруты, `world-model` hostname, эскалация ошибок L0) | F1–F4, F9, F10 | низкий |
| **M-b** | Слить D1/D2 (одна таблица алиасов + один verb-regex); убрать D3/D4 (ре-детект intent/mode в `dynamic-prompt`) | D1–D4 | средний (расхождение таблиц) |
| **M-c** | Action-словарь + `Action → Tool` вместо `TOOL_BY_INTENT`; прямые ответы без LLM (S3) | G1, G2, D5 | средний |
| **M-d** | `capabilities.ts` + `resolveCapabilities`; `num_ctx` из `contextWindow`; embedding-модель в конфиг | G3, F7, F8 | низкий |
| **M-e** | Единый источник бюджета + регионы композера (static/cacheable/volatile) | D6, D7, Step 1 §4 | средний |
| **M-f** | Salience + уровни как проекция над `attention-manager` | G4 | средний |
| **M-g** | Provider Router (функция) + extraction-провайдер (capability-gated) | G3, §13/DEC-018 | средний |
| **M-h** | Якоря на Action + калибровка порогов semantic-router по логам | §6 | низкий |

**[I] Порядок обоснован:** сначала то, что не зависит от новых сущностей (M-a…M-c дают измеримый
рост LLM-free), потом контракты (M-d), потом композер/attention (M-e/M-f), затем провайдеры
(M-g) и калибровка (M-h).

**[V] Ограничение:** реализация любого шага — **только после DEC**; Step 2 остаётся proposal.

---

## 18. Test strategy

**[V] Что есть:** `tests/ai/router.test.ts` (6 тестов лестницы), `tests/ai/tool-loop.test.ts`,
`tests/memory/*`, `tests/safety/*`, `tests/tools/confirmation.test.ts`. Всего 250/250.

**[I] Что добавляется:**

| # | Тест | Что охраняет |
|---|---|---|
| T1 | **Корпус маршрутов** (~200 команд: expected layer/action/tool) | любое изменение маршрута становится видимым диффом |
| T2 | Golden-тесты L0/L1 **без сети и Ollama** | воспроизводимость в CI |
| T3 | Semantic-matching на stub-эмбеддингах (fixed vectors) | порог/`margin`/reject не «плывут» |
| T4 | Contract-тесты `resolveCapabilities` (fixtures моделей) | capability не зависит от имени по коду |
| T5 | `Action → Tool` таблица: каждая Action имеет tool или явный отказ | нет «повисших» actions |
| T6 | Регрессии F1–F4 (GUI на раунде 0, ложные маршруты) | дефекты не вернутся |
| T7 | Privacy-фильтр: `local-only` никогда не даёт cloud-кандидата | утечка в облако |
| T8 | Бюджет: единый источник, `static` не урезается | регресс Step 1 |
| T9 | Salience: событие не зовёт cognition при низком salience | «EVENT ≠ LLM TRIGGER» |
| T10 | Метрика LLM-free share на корпусе | цель ≥ 50% проверяема числом |

**[I] Правило:** ни одно изменение маршрутизации не принимается без диффа по T1 (корпус) — это
защита от «стало дешевле, но сломалось тихо».

**[V] Существующие тесты не ослабляются:** injection-контракт (P1-2), confirmations (M6),
migration (P1-1), память — остаются зелёными на каждом шаге.

---

## 19. Open questions

**Из аудита Step 1.5 (§13):**
1. Владелец Action-словаря: `intent.ts` или новый `actions.ts`? (рекомендация — `intent.ts`)
2. `TOOL_BY_INTENT`/`filterToolsByIntent`: удалить или заменить на `Action → Tool`? (рекомендация — заменить)
3. `mode` как policy-слой: остаётся в decision-пути или становится только конфигурацией промпта?
4. Attention: `maxContextTokens` влияет на маршрут/бюджет или attention остаётся потребителем?
5. Capability-контракт: где таблица моделей (рекомендация — рядом с `config.ts`)?
6. Graphiti: применять ли B′ (native `format`) и с каким extractor-провайдером? Как лечить языковую нормализацию?
7. Медиа: какой target для `PLAY_MEDIA` (плеер/media-session/браузер)? — блокер: GUI e2e
8. Чинить ли F1–F10 отдельным маленьким коммитом сразу после DEC?

**Новые из этого proposal:**
9. **Терминология L0–L4** (§9): принимаем каноническую шкалу и маппинг `L2-llm → L3/L4`, или оставляем имена кода?
10. **`marginThreshold`** для semantic-router: значение и как калибровать (по логам)?
11. **Прямые ответы без LLM** (S3): считаются ли `greeting/weather/news` «действием» или отдельным классом «responder»?
12. **Salience-веса**: набор факторов и формула — фиксируем сейчас или калибруем по логам (Шаг 2)?
13. **Extraction-провайдер**: локальный (9.5 с, но RU→EN) или облачный (privacy)? Что дефолт?
14. **SURFACE gate**: где именно стоит гейт в новом композере — до `cacheable`-региона или внутри него?

---

## 20. Proposed DEC (draft — на утверждение, не в лог)

| DEC | Решение | Основание | Статус |
|---|---|---|---|
| **DEC-014** | **Canonical routing authority = `router.ts`.** Новый `CognitiveRouter` не создаётся; `dynamic-prompt` лишается права ре-детекта intent/mode (D3/D4) | §2, §5, аудит §5 | DRAFT |
| **DEC-015** | **Слой `Intent → Action → Tool` вводится как расширение:** Action-словарь живёт в `intent.ts`, заменяет мёртвый `TOOL_BY_INTENT`; `Capability` — вычисляемая, не хранилище | §2, §16, аудит §4 | DRAFT |
| **DEC-016** | **Capability-контракт — `electron/ai/capabilities.ts`** (рядом с config, без отдельного Registry). Источник для `num_ctx`, для gate «structured output», для включения fallback-парсера tool-calls только слабым моделям | §4, §11 | DRAFT |
| **DEC-017** | **Единый источник token budget** + регионы композера `static/cacheable/volatile`; бюджет = `min(contextWindow, resource, attention)`. Решения Step 1 (SURFACE gate, forget/retention) сохраняются | §12, §15 | DRAFT |
| **DEC-018** | **Graphiti/L2: backend не мигрируем.** L2 остаётся **опциональным** слоем за capability-gate; extraction — отдельный провайдер; язык — требование (`multilingual_stable`), не хак в FTS. E2E через MCP остаётся OPEN | §13 | DRAFT |
| **DEC-019** | **Каноническая шкала L0–L4** (§9) с маппингом кодовых имён; `L2-llm` в коде трактуется как L3/L4 по провайдеру | §9 | DRAFT |
| **DEC-020** | **F1–F10 чинятся отдельным маленьким коммитом** после DEC (без новой архитектуры) | §17 M-a | DRAFT |

**[I] Порядок утверждения:** DEC-014/019 (рамка) → DEC-015/016 (контракты) → DEC-017 (память/бюджет)
→ DEC-018 (Graphiti) → DEC-020 (фиксы). Реализация — по §17 (M-a…M-h).

---

## Финальный вывод — 6 вопросов ТЗ

**1. Как U.N.A. решает, что LLM вообще не нужна?**
Детерминированно, до всякого вызова: L0 (regex/алиасы/прямые ответы) и L1 (semantic/regex → **Action**).
Критерий: действие выразимо и его цель разрешима из WorldState/preferences (`Context Resolver`).
Сегодня это даёт **35.7%** LLM-free (нижняя граница, без embeddings); цель — ≥ 50% за счёт
Action-словаря и прямых ответов, а не за счёт лучшего классификатора (F5).

**2. Как U.N.A. решает, что нужен embedding/classifier?**
Когда формулировок много, а действие ограничено: L1-semantic (`semantic-router.ts`) — матч якоря
Action по cosine, с **порогом и margin**, и с явным правом на reject. Embedding — дешёвый
(≤100 мс) механизм **сведения формулировки к действию**, а не «мини-LLM».

**3. Как U.N.A. решает, что нужен local LLM?**
Когда задача требует понимания/генерации и не сводится к Action (L3): открытый диалог, разбор
неоднозначной формулировки, планирование с инструментами. Проверка — capability-контракт
(`tool_calling`, `contextWindow`), ресурсный фильтр (VRAM/режим) и бюджет контекста.

**4. Как U.N.A. решает, что нужен powerful/cloud?**
Когда требуемых capability локально нет (`reasoning`, `long_context`, `vision`, большой объём) **и**
`privacyClass` это допускает. Privacy — **фильтр кандидатов до перебора**, поэтому «случайный уход
в облако» невозможен по построению. Если и облако недопустимо — явный отказ/очередь, не тихий
выбор неподходящей модели.

**5. Как U.N.A. использует WorldState/Memory/Attention до LLM?**
- **WorldState** → `Context Resolver` (target действия) и `cacheable`-регион промпта;
- **Memory** → SURFACE gate (top-K по релевантности) → `cacheable`, отдельно от transcript;
- **Attention** → salience событий (уровни `ignore…interrupt`) и `maxContextTokens` как вход бюджета.
Ни один из трёх не требует LLM: всё детерминировано.

**6. Как U.N.A. остаётся работоспособной при слабой или недоступной модели?**
Через capability-контракт и явную деградацию: L4→L3→L2→L1→L0 по возможностям; задача без
подходящего провайдера **отклоняется с причиной**, а не выполняется неподходящей моделью.
Локальная память, маршрутизация, attention, confirmations и прямые действия работают **без LLM
вообще**; теряется только генеративная часть.

---

## Статус

- **[V] Production tree не изменён** (шаг — только документы).
- **[V] Артефакт:** этот файл. **[I] DEC-014…DEC-020** — черновик, не внесён в `decision-log.md`
  (ждёт утверждения lead).
- **[V] Границы Graphiti:** A FAILED / A′ VERIFIED / B FAILED / B′ VERIFIED / C VERIFIED-с-оговоркой;
  E2E через MCP — **OPEN**.
- **[V] Решения Step 1 сохранены** (§12, §14).
- **[I] Следующий шаг:** утверждение DEC → M-a (фиксы F1–F10) → M-b/M-c (дубли + Action-словарь).