# U.N.A. Research — Needle 3: action-модель как дешёвый когнитивный примитив

**Дата:** 2026-09-17
**Статус:** research note (кандидат Pass 6, System-One / Decision models); локального прогона ещё не было — NOT ASSESSED
**Связь:** `docs/research/system-one-decision-models.md` (Needle — конкретная реализация decision/action-класса), Step 1.5 (routing reconciliation), `docs/research/task-context-isolation.md` (много TaskContext без тяжёлого inference), Step 2 (лестница cognition)

---

## 1. Что это (факты из репозитория, не из ролика)

Needle 3 (Cactus Compute) — automation foundation model для tool/function calling
и structured extraction. Текущее описание — Laddered Simple Attention Network:
один набор весов, глубины 2–20 слоёв как отдельные deployable-модели
(2L/4L/8L/16L/20L — subnetworks той же trained ladder, а не случайные обрезки).

| Параметр | Значение |
|---|---|
| Размер | ~8–29 МБ в зависимости от глубины |
| Архитектура | ~121M параметров при меньшей вычислительной стоимости |
| Слои | 2 → 20; база 16L (`needle3.safetensors`), полный 20L (`needle3_enterprise.safetensors`) |
| Лицензия | репозиторий публичный, Python-пакет `cactus-needle` — **Apache-2.0** |
| Runtime | локальный on-device inference; движки под платформы вкл. Windows `win_amd64`, Linux, macOS ARM, WASM; офлайн после загрузки |
| Установка | `pip install cactus-needle`, затем `needle download needle3` / `needle3.safetensors` / `needle3_enterprise.safetensors` |
| LoRA | свой dataset format, `needle finetune`, экспорт собственного `.cact`, запуск тем же engine; JAX/Flax/Optax, GPU через `jax[cuda12]` |

Ориентироваться — на текущий репозиторий, а не на цифры из обзорных видео
(«53M-параметровая модель» — устаревшее упрощение).

## 2. Почему это не «ещё одна маленькая LLM»

Обычная LLM для вызова инструмента:

```text
"включи музыку" → текст → JSON? → парсер → валидация → ошибка? → повтор
```

Needle:

```text
"включи музыку" → function_calls → PLAY_MEDIA(...)
```

Три свойства, критичные для U.N.A.:

1. **Grammar-constrained generation.** Схема инструмента ограничивает пространство
   допустимого вывода на уровне byte-level grammar: «ты физически можешь
   сгенерировать только допустимый call» вместо «пожалуйста, верни корректный JSON».
   (Актуально после Graphiti-мучений с `json_object` на qwen3:1.7b.)
2. **Встроенный tool retrieval.** При >5 инструментов сначала выбираются до пяти
   релевантных, grammar строится только для них. При 100+ инструментах U.N.A.
   это готовый **Capability Routing Layer**.
3. **Confidence как отдельный сигнал.** Рекомендация вендора: свой порог, выше —
   выполнять, ниже — эскалировать. И жёсткое правило для нас:
   **confidence ≠ разрешение на выполнение.** Даже `confidence = 0.99` не значит
   «можно удалить 400 файлов»: `Needle confidence + Policy/risk + Capability
   permissions + verification → execution`.
4. **Нет free-text fallback.** Неподдерживаемый запрос → пустой набор вызовов
   (встроенный abstention, родня нашему «No route is better than a wrong route»).
5. **Extraction-режим.** `ASR → Needle extraction → structured event → Task Manager`
   без тяжёлой LLM (пример: «Напомни завтра в семь купить воду» → task/date/time).

## 3. Куда встаёт в архитектуре U.N.A.

Не «Needle внутри делает всё», а **Needle Action Router** между семантикой и LLM:

```text
INPUT → Signal parsing → Intent/Route (semantic)
   ├── ACTION ──→ Needle ──→ structured call ──┐
   └── COGNITION ──→ local LLM ──→ reasoning ───┤
                                                ▼
                                    Policy → Capability → Executor
                                     → Verify → Event → Memory
```

Граница деления (важная): action-oriented вход («включи музыку») — в Needle;
cognition-oriented («я сегодня какой-то уставший» — conversation, emotion,
memory) — в LLM/cognition. Needle **не заменяет** Semantic Router там, где нет
пространства допустимых действий.

Для Task Contexts: много контекстов могут существовать одновременно, потому что
Needle не обязан занимать GPU — тяжёлая модель вызывается только при
неуверенности / сложности / reasoning / генерации ответа. Прямое подтверждение
«parallel cognition ≠ parallel GPU inference».

---

## 4. Текущая рабочая гипотеза U.N.A. (зафиксировано, не догма)

> «LLM не нужна для действий» — НЕ объявляем. Рабочая гипотеза, проверяемая
> тестами: **большая LLM — дорогой уровень эскалации, а не обязательный
> двигатель каждого действия.**

```text
1. U.N.A. ≠ LLM
2. Большая LLM: живая беседа, сложный контекст, reasoning, неоднозначность, эскалация
3. Простые активности: deterministic / embeddings / micro-model / Needle
4. Любое действие: Intent → Capability → Policy → Executor → Verify → Record
```

При этом Task Context, Attention, World State, Memory и Presence остаются
**системами U.N.A., а не моделью**. Финальную архитектуру не рисуем: вектор +
ближайший эксперимент вместо «генерального плана до 2030».

Скорректированный тезис (вместо «LLM вообще не нужен для function calling»):
**большой универсальный LLM не нужен для значительной части function calling.**

## 5. Needle Lab: протокол первого эксперимента (НЕ интеграция)

Этап 1 — поставить отдельно, понять поведение на наших задачах. Не обучать свою
UNA-Needle до понимания failure modes.

| Параметр лаборатории | Значение |
|---|---|
| Checkpoint | **20L** (`needle3_enterprise.safetensors`), не 2L ради экономии |
| Схемы | реальные U.N.A. tools (не игрушечные `turn_on_fan`) |
| Язык | **русский в первую очередь** (английский — контроль) |
| Метрики | latency / RAM / CPU / accuracy / confidence / false calls / abstention |
| Инстансы | переиспользование для контекста; разные toolsets — отдельные экземпляры |

Языковое предупреждение (из документации, в протокол обязательно): confidence-калибровка
относится к base model, для non-English языков confidence воспринимать осторожно;
после fine-tuning confidence становится `None` (confidence head не обучается с LoRA).
Нам важнее «вруби музыку и сделай потише», чем “Dim the living room lights to 30” —
иначе получим великолепный benchmark и бесполезную U.N.A.

### Тестовый корпус (~100–150 запросов, инженерный набор)

```text
A. Простые:            "открой браузер" / "поставь громкость 30" / "включи музыку"
B. Синонимы:           "вруби музыку" / "поставь что-нибудь послушать" / "запусти плеер"
C. Несколько действий: "открой браузер и поставь музыку"
D. Недостающие params: "поставь музыку" / "открой приложение"
E. Неоднозначность:    "сделай потише" / "запусти его" / "открой там"
F. Неподдерживаемые:   "что такое квантовая запутанность?" (ожидаем пустой набор)
G. Мусорный язык:      "слушай ну короче можешь там музыку какую-нибудь поставить"
H. Контекст:           запрос → ответ → follow-up
```

Отдельно — протечки состояния:

```text
A: "включи музыку" → B: "сделай её потише"      (контекст должен сохраниться)
A: "включи музыку" → B: "открой браузер"        (старое состояние НЕ должно протекать)
```

Плюс spike-матрица: `tests/needle/` — basic / multi / confidence / empty-call /
ambiguous / messy / defaults / context-reset / 2L-vs-4L-vs-8L / CPU-latency / RAM-usage.

## 6. Fine-tuning: сначала контракт, потом обучение

**Свою UNA-Needle сейчас не обучаем.** Порядок: BASE MODEL → проверка →
понимание failure modes → tool schema design → dataset → LoRA.

Требования документации к dataset (совпадают с нашим контрактом поведения):

```text
Не понимаю → не вызываю инструмент        (отрицательные/off-topic примеры, answers: [])
Не хватает аргумента → не выдумываю       (аргументы нельзя придумывать)
Несколько кандидатов → разбираюсь/эскалирую (неоднозначные примеры полезны)
Действие опасное → Policy                 (длинные примеры режутся по max-len)
```

Схема будущего пути (только после Решения №1):

```text
Needle → Adapter для U.N.A. → Shadow mode → сравнение с текущим router
→ A/B → только потом production
```

и затем, при хороших результатах: реальные логи → dataset → LoRA → UNA-Needle
(`needle finetune` → `needle build` → собственный `.cact`).

## 7. Ветка B: собственные микро-модели (исследовательское направление)

Needle — доказательство концепции, а не потолок: узкая задача (текст → retrieval
→ extraction → validated action) даёт микроскопическую модель. Значит, можно
проектировать специализированные модели под когнитивные функции U.N.A.:

```text
ActionModel / IntentModel / AttentionModel / ContextModel /
ExtractionModel / MemoryModel / RoutingModel
```

Не все обязаны быть нейросетями: deterministic + embedding + tiny model +
Needle + LLM. Deployment profiles поверх одной архитектуры (intelligence ladder):
Desktop 20L → Laptop 16L → Phone 4L; сама U.N.A. при этом не меняется.
Первый кандидат собственной модели: `"поставь музыку потише и открой браузер" →
[SET_VOLUME(30), OPEN_APP("browser")]`, затем + контекст, неоднозначность,
confidence, abstention, retrieval, preferences, WorldState.

Исследовательский вопрос вместо «сколько байт потратить»:
**«Какую часть интеллекта U.N.A. вообще можно вынести из большой LLM в
маленькие специализированные модели?»**

## 8. Задачи по ролям (DEC-013)

- **Ты (экспериментатор):** Needle Lab по §5 → Решение №1 (где Needle полезен).
- **GLM-кодер:** продолжает Phase 2 / консолидацию; НЕ «переделать под Needle».
  Следующий этап готовить через provider/capability boundary. Главная задача —
  **сведение существующего**: определить Canonical Router / Intent / Attention /
  Policy / Capability / Cognition Provider в `router.ts`, `semantic-router.ts`,
  `intent.ts`, `attention-manager.ts`, `resource-manager.ts`. `EmbeddingIntentIndex`
  как ещё один параллельный router — не создавать (аудит уже показал размазанность).
- **Архивариус:** исследование → Architectural Pattern → Candidate → Evidence →
  Applicable? → Decision / Rejected / Open. По Needle собрано в этой заметке
  (§1–§7: architecture, API, schema rules, retrieval, confidence, context/state,
  extraction, fine-tuning, language limitations, deployment, licensing,
  benchmarks-заглушка, failure modes (протокол), relation to U.N.A.).

## 9. Чего НЕ делаем

```text
"U.N.A. 5.0" / финальная архитектура / полный rewrite / встроить Needle везде /
обучить собственную модель сейчас / 12 микромоделей сразу
```

Ближайшая петля: идея → маленький эксперимент → данные → решение →
архитектурное изменение → следующий эксперимент. Это — основа процесса
разработки U.N.A. (дополняет DEC-013).

## 10. Источники

- Repo: https://github.com/cactus-compute/needle
- llms.txt (архитектура, ladder, слои, веса): https://github.com/cactus-compute/needle/blob/main/llms.txt
- apis.md (retrieval, confidence, grammar, контексты): https://github.com/cactus-compute/needle/blob/main/doc/apis.md
- finetuning.md (dataset, LoRA, confidence-калибровка, non-English): https://github.com/cactus-compute/needle/blob/main/doc/finetuning.md
- pyproject.toml (Apache-2.0): https://github.com/cactus-compute/needle/blob/main/pyproject.toml
- Hugging Face (extraction): https://huggingface.co/Cactus-Compute/needle3
- Intelligence Ladders: https://www.cactuscompute.com/blog/intelligence-ladders
- Product: https://www.cactuscompute.com/needle

## 11. Статус

- Документ: **APPROVED для хранения** (факты из репозитория + протокол lead'а).
- Needle как кандидат: **PENDING** локального прогона (Decision #1). До него —
  никаких production-решений, никакого `EmbeddingIntentIndex`-дубля.
- Встраивание в backlog: Pass 6 (System-One / Decision models) — Needle как
  флагман-кандидат класса; spike идёт по §5, integration — только через
  capability boundary после A/B.

---

## 12. Mini-UNA: действующая лаборатория (факты сверены 2026-09-22)

Репозиторий **MaxSC2/Mini-UNA** (публичный, Kotlin/Android; main на коммите
`3921f75` от 22.09 — по сообщению lead'а; сверено по README: 108 коммитов,
структура совпадает):

- `NeedleServer` + локальный `needle3.cact` + Android-arm64 бинарь — нативный
  Needle поднят реально (`needle --serve` на localhost, приложение ходит по HTTP),
  не mock. Полная сборка — через CI (`.github/workflows/android.yml`); обычная
  сборка даёт APK без Needle (только правила + fallback).
- `assets/needle_tools.json` — **28 function-tools для Needle** (открытие
  приложений, настройки, web, timer, volume, media, screen, notifications,
  YouTube, Telegram, системные действия). Готовый реальный корпус инструментов —
  исследовать на нём, а не на `turn_on_fan`.
- `NeedleEngine.kt` — LLM-роутер + fastPath + fallback; `LocalIntentEngine.kt` —
  keyword-fallback; отдельный `SafetyPolicy.kt` (ALLOW / CONFIRM / BLOCK).
  Диагностика: экран «Модель» + `adb logcat | grep MiniUNA-Needle`.
- Два уровня понимания уже в проде Mini-UNA: быстрые детерминированные правила
  → Needle 3 → fallback-правила.

Статус Mini-UNA: **лаборатория, а не «вторая U.N.A.»**.

### Архитектурная граница (не копировать вслепую)

В Mini-UNA `NeedleEngine` реализует `IntentEngine` — Needle как «движок intent
classification». Для лаборатории нормально. Для большой U.N.A. — нет: у нас
строже, и Needle сидит только внутри отрезка:

```text
User utterance → Route → Intent / Action → Capability → Tool
                     ^^^^^^^^^^^^^^^^^
                     Needle — только здесь, не владелец всей семантики
```

### Методологическое правило (обязательно для стенда)

`classifyAll()` в Mini-UNA предварительно разбивает составные команды, и часть
уходит через fallback **мимо Needle** (для прод-приложения — разумный fast path).
Для исследовательского стенда это значит: **измерять «чистый Needle» и
«Needle + deterministic pre/post-processing» отдельно**. Иначе спорим о
результатах, не понимая, что тестировали.

### Разделение: четыре корзины micro-model/action-model ecosystem

| Корзина | Содержимое |
|---|---|
| **A. Уже работает у Needle** (из коробки) | grammar-constrained calls; retrieval top-5; confidence-сигнал; no free-text fallback (встроенный abstention); extraction-режим; локальный CPU-runtime; LoRA + `.cact`; ladder 2–20L; нативный подъём на Android (доказано Mini-UNA: `needle --serve` + `needle3.cact` + arm64-бинарь, не mock) |
| **B. Мы хотели сделать сами** (наш scope, не отдавать) | semantic-router (embeddings + margin/abstention); DecisionProvider-батчинг; attention salience; Context Resolver; capability contract; Skill Compiler; Shadow Cognition; Replay Engine; Memory Scopes; Task Isolation; action language; собственные микро-модели (ветка B, §7) |
| **C. Needle не решает** (проверять/обходим) | cognition-вход (эмоции, беседа, «я уставший»); управление контекстами задач; память; policy/risk-решения; многошаговое планирование; калибровка confidence на русском (предупреждение доков!); поведение state leakage (тесты §5H); составные команды без deterministic pre-split (факт Mini-UNA: часть уходит в fallback мимо Needle) |
| **D. Принадлежит U.N.A. Core** (не модели) | Identity, Memory, World State, Attention, Task Manager, Context Isolation, Policy, Capability Registry, Executor, Verification, Presence; цепочка `utterance → Route → Intent/Action → Capability → Tool`; canonical routing authority (`router.ts`); SafetyPolicy отдельно от confidence (в Mini-UNA уже отдельный `SafetyPolicy.kt` — тот же принцип, что наш «confidence ≠ разрешение») |

Вывод разделения: Needle закрывает корзину A (ActionModel + частично IntentModel
и extraction). Всё остальное — либо наш scope (B), либо открытые вопросы (C),
либо ядро, которое моделью не является (D).
