# U.N.A. Research — System-One / Decision Models

**Дата:** 2026-09-17
**Статус:** research note (ветка backlog'а Pass 6); не принят в production, не зависит от него
**Связь:** уточняет лестницу когнитивных уровней из `docs/Phase2/UNA_Phase2_Step2_Cognitive_Routing_Architecture.md`; учитывается Step 1.5 (routing reconciliation)

---

## 1. Что такое System One Models (на примере Jev)

Новый класс моделей, заявленный TypeSafe AI (early access, сентябрь 2026): модель
**не генерирует текст**, а принимает `state` + заранее заданные типизированные
вопросы и возвращает `choice` / `score` / boolean с вероятностью и уверенностью.
Vendor-reported характеристики: 70–500 мс на запрос, $0.042 за миллион входных
токенов. Результат — структура, которую программа использует непосредственно
для ветвления, а не текст, который нужно парсить.

Целевые сценарии самого продукта совпадают с потребностями U.N.A.:
routing, выбор следующего tool/subagent, продолжать/остановить выполнение,
retry/stop, оценка urgency/risk, verification.

**Ключевая идея для U.N.A.: это не замена LLM. Это промежуточный когнитивный
примитив** — «умный, но дешёвый и типизированный» слой между embeddings и
генеративной моделью.

## 2. Переосмысление лестницы L0–L4

Раньше: `L0 → L1 → L2 → L3 → L4` как жёсткая последовательность моделей.
Теперь лестница понимается как **уровни стоимости и когнитивной свободы**:

```text
Deterministic                  (fast-path, regex, системные API)
    ↓
Semantic retrieval/классификация (embeddings, centroid + cosine — semantic-router.ts)
    ↓
Probabilistic decision model   (System One / Jev-класс: typed judgments, ~сотни мс)
    ↓
Contextual reasoning           (local LLM + state + memory)
    ↓
Generative reasoning           (крупная/cloud LLM)
```

Decision-model слой занимает место **между** «embedding nearest-neighbour» и
«генеративной моделью» (условно L1.5). С существующим `semantic-router.ts` это
не конкуренты — два разных класса одного направления:

```text
текст → embedding → сходство → intent          (уже есть)
состояние → decision model → несколько typed judgments → вероятности   (новый класс)
```

## 3. Открытость

- **Сам Jev закрыт**: hosted API, ограниченная лицензия, весов и исходников
  модели нет в публичном доступе. Vendor-числа (70–500 мс, $0.042/1M входных
  токенов) — **vendor-reported**, не доказательство преимущества на нашей задаче.
- **Идея воспроизводится открытым сообществом**:
  - OpenJev (TheoLeeCJ) — независимая реализация паттерна на открытых моделях;
  - `jevlike` (vinnylarouge) — маленькая модель, выбирающая вариант из
    динамического набора с вероятностями;
  - `jev-ultrafast` (browser-use) — decision-модель выбирает операцию/UI-элемент,
    генеративная LLM подключается только для текста; практически демонстрация
    нашего принципа «не тратить генеративную модель там, где достаточно decision layer»;
  - EVIE (Tencent) — открытый аналог класса задач.

## 4. Архитектурный принцип для U.N.A.

Записываем НЕ «мы используем Jev», а:

> **U.N.A. поддерживает optional DecisionProvider для дешёвых вероятностных
> классификаций, маршрутизации, оценки риска, attention и verification.**

```text
DecisionProvider
 ├── TypeSafe Jev            (hosted, закрытый)
 ├── local Jev-like модель   (открытые воспроизведения)
 ├── маленький classifier    ( embeddings/логистическая регрессия )
 └── fallback to LLM
```

Это продолжение принципа model-agnostic: система не должна зависеть ни от
Qwen 1.7B, ни от Jev, ни от любого другого конкретного «мозга».

### Типизированные суждения над одним состоянием

Вместо одного универсального Intent Router — набор независимых вопросов над общим
состоянием:

```text
State
 ↓
What is this?          (choice: intents…, none)
Is it relevant?        (score)
Is it urgent?          (score: low/medium/high/critical)
Which capability?      (choice)
Which target?          (choice)
Can auto-execute?      (boolean)
Need confirmation?     (boolean)
Need LLM?              (boolean)
Should interrupt?      (choice/score)
```

Пример контракта:

```text
state = текущая ситуация U.N.A.

questions:
  attention:         choice = [ignore, observe, react, cognize, interrupt]
  intent:            choice = [play_media, open_app, web_search, …, none]
  urgency:           score  = [low, medium, high, critical]
  requires_llm:      boolean
  privacy_sensitive: boolean
```

### Гибрид attention (события)

```text
Event
 ↓
deterministic salience        (novelty, urgency, user_relevance, repetition…)
 → не интересно → ignore (record/update state)
 ↓ интересно
decision model: relevance / urgent / interrupt / observe (вероятности)
 → обновление WorldState без LLM  |  |  → поднять attention / interrupt
```

Пример: «новое окно Discord»: deterministic (novelty 0.7, light_work,
interruptible) + decision (observe = 0.91) → просто обновить WorldState, ноль LLM.

## 5. Место в лестнице (пересмотр L0–L4)

Лестница L0–L4 — не жёсткая последовательность моделей, а **уровни стоимости
и когнитивной свободы**:

```text
Deterministic → Semantic → Probabilistic decision → Contextual reasoning → Generative reasoning
```

Decision-модель помещается между семантикой и генеративным reasoning. Она не
разговаривает и не рассуждает — она быстро и дёшево выдаёт judgments, пригодные
для ветвления кода.

## 6. Ограничения и предостережения (анти-фанатизм)

1. Jev не истина: typed output гарантирует **тип интерфейса**, а не правильность
   суждения. Confidence обязан калиброваться на собственных данных U.N.A.
2. Низкая уверенность → человек (clarification) или более сильная модель.
   Никаких forced decisions при reject — то же правило, что и в semantic-router
   («No route is better than a wrong route»).
3. Публикуемые TypeSafe результаты — reference-модели, возможные biases;
   скорость/цена — vendor-reported, не доказательство.
4. **Jev не архитектурная зависимость. System-One / decision-model capability —
   архитектурная возможность.** Провайдер заменяем, fallback — в LLM.

## 7. Куда встаёт в архитектуре U.N.A.

```text
Deterministic (fast-path)          «открой хром»
    ↓
Semantic (embeddings)              «вруби что-нибудь» → PLAY_MEDIA
    ↓
Decision layer (опционально)       play_media=0.94, youtube=0.71,
                                   need_clarification=0.18, requires_llm=0.04
    ↓
Contextual layer                   WorldState/Memory/ActiveWindow/Preferences
    ↓
Generative layer (LLM)             только когда недостаточно детерминированного
```

Особенно перспективно для **attention/events** (детерминированный salience-gate →
decision-модель для «что делать с событием») и для Graphiti extraction-вопросов
(быстрый typed judgment вместо генеративного extraction на слабой модели).

## 8. Статус и следующие шаги

- Добавлено в `docs/research/research-backlog.md` как **Pass 6 — System-One / Decision models**.
- Не влияет на Step 1.5 (routing reconciliation), но меняет целевую лестницу
  Step 2: между L1 и L2 появляется опциональный decision-слой.
- Никакой интеграции до результатов Step 1.5 и DEC. POC — только если Pass 6
  докажет gap (см. Definition of done в backlog).

## Источники

- TypeSafe AI — Introducing System One Models and Jev: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- TypeSafe AI — Master customer agreement (закрытость): https://typesafe.ai/legal/mca
- Vercel changelog — Jev on AI Gateway: https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway
- OpenJev (открытая реализация паттерна): https://github.com/TheoLeeCJ/openjev
- jevlike (динамический выбор вариантов с вероятностями): https://github.com/vinnylarouge/jevlike
- jev-ultrafast (browser-use): https://github.com/browser-use/jev-ultrafast
- EVIE (Tencent): https://github.com/Tencent/EVIE
- Ask Jev: https://www.askjev.ai/

> Числа скорости/стоимости — vendor-reported, воспринимать как маркетинговые
> ориентиры, не как доказательства. confidence-калибровка обязательна на
> собственных данных U.N.A.
