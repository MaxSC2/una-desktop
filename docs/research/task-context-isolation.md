# U.N.A. Research — Task Context Isolation / Cognitive Sessions

**Дата:** 2026-09-17
**Статус:** research note (концепт для следующего архитектурного документа); production не меняет
**Связь:** Step 1 (memory research — SURFACE gate, context composer), Step 1.5 (routing reconciliation), Step 2 proposal (лестница cognition), Pass 5 backlog (long-running work / scheduler)

---

## 1. Проблема: одна кастрюля контекста

U.N.A. одновременно: помогает с кодом, отвечает на сообщение, следит за загрузкой файла, ищет информацию, выполняет фоновую задачу. Если всё складывать в один общий cognition context — модель получает «открой YouTube» рядом с «проверь migration.test.ts» и «напомни через два часа». Классическое смешивание историй, перепутывание целей, неожиданные ассоциации.

Решение — **изолированные контексты исполнения** (не «профили задач» в смысле личностей):

> **U.N.A. = одна личность + много изолированных контекстов деятельности + единая память + единый мир + общий scheduler.**

Ключевое правило (формулировка lead'а):

> **Изоляция должна касаться состояния задачи, а не идентичности сущности.**

Профиль не превращает Юну в «Юну для кода» / «Юну для музыки». Это одна U.N.A., у которой в данный момент существуют несколько рабочих контекстов.

## 2. Три слоя состояния

```text
            GLOBAL
              │
      ┌───────┼────────┐
      ↓       ↓        ↓
   TASK A   TASK B   TASK C
      │       │        │
      ↓       ↓        ↓
  EPHEMERAL EPHEMERAL EPHEMERAL
```

- **GLOBAL** — Identity, Personality, long-term preferences, core memory, user relationship. Одно на систему, все задачи используют одно `UNA Identity`.
- **TASK** — goal, local history, task memory, active tools, constraints.
- **EPHEMERAL** — current turn, временные наблюдения, промежуточное reasoning, текущие результаты tools.

### TaskContext (эскиз контракта)

```ts
TaskContext {
  id; type; goal; status;

  localHistory; localVariables; localArtifacts; localToolState;

  activeCapabilities; priority; deadline;

  requiredMemoryRefs;   // ссылки, не копии
  worldSnapshot;

  cognitionPolicy;
}
```

Чего **не копировать** в задачу: identity, все memories, все conversations, весь world state, все tasks. Вместо копирования — **ссылки**:

```text
Task A (coding):  project/una, github/current-branch, recent-debugging
Task B (music):   music/preferences, media/history
Task C (reminder): reminders
```

Память общая, но **surface memory для каждой задачи своя** — прямое продолжение
SURFACE gate из Step 1.

## 3. Параллельность контекстов ≠ параллельность inference

Разделяются две разные вещи:

- **параллельность контекстов** — изоляция состояния;
- **параллельность inference** — одновременные вызовы моделей.

На облаке параллельные API-вызовы возможны (в рамках квот). На локальной машине
GPU один, VRAM 4 ГБ — попытка держать несколько тяжёлых инстансов закончится
swapping, а не синергией. Поэтому допустимо:

```text
Task A ─┐
Task B ─┼→ Scheduler → LLM (последовательно)
Task C ┘

A → inference → B → inference → A → inference → C → inference
```

При этом **A никогда не видит историю B**. Изоляция без параллельной нагрузки на GPU — уже выигрыш.

### Состояния задачи

```text
READY / RUNNING / WAITING / PAUSED / BLOCKED / DONE
```

Scheduler решает: Task A → waiting network, Task B → ready, Task C → waiting user
→ к LLM идёт только B, A не занимает GPU; при возврате ресурса — resume со своего
контекста.

Связи: durable task runtime + memory + context composer + resource manager +
cognition router (Pass 5 backlog: минимальный встроенный queue, не server stack).

## 4. Типы контекстов (шире, чем «задачи»)

| Тип контекста | Пример |
|---|---|
| Task Context | «помоги мне с кодом» |
| Conversation Context | «поговорим о чём-нибудь» |
| Activity Context | «я сейчас играю» |
| Tool Context | «работаем с этим проектом» |
| Autonomous Context | «проверь ночью backup» |

Всегда: одна U.N.A.

## 5. Обмен между задачами: результаты, а не контексты

Задачи иногда пересекаются (Task B — проверка GitHub issues, Task A — код проекта).
Если B нашла релевантное для A, она **не должна** подмешивать свой контекст в A.
Обмен — только через структурированные находки:

```text
Task B → Structured Finding → Global Event / Shared Artifact → Task A
```

```json
{
  "type": "new-relevant-finding",
  "sourceTask": "B",
  "targetTask": "A",
  "relevance": 0.91,
  "payload": "Issue #42 references current memory migration."
}
```

**Обмениваться должны не контексты, а результаты** — иначе снова смешивание.

## 6. Budget и приоритеты

У каждой задачи — собственный context budget:

```text
Task A coding   budget = 6000   priority = high
Task B music    budget = 1500   priority = low
Task C reminder budget = 500    priority = urgent
```

Scheduler учитывает: priority + attention + deadline + resource state + model capability + task complexity → выбирает, кто получает cognition. Прямое продолжение вывода Step 1 по Context Composer: у каждой задачи

```text
static context + cacheable task state + volatile turn context
```

Производительность растёт без увеличения мощности: 4 задачи × узкие контексты вместо 4 задач × один огромный контекст, отправляемый целиком каждый ход.

## 7. Встраивание в архитектуру (с учётом Step 1.5 / decision-слоя)

```text
EVENT / INPUT
   ↓
ATTENTION
   ↓
TASK IDENTIFIER
   ↓
существующий TaskContext?
   ├── yes → resume task
   └── no  → create task
   ↓
TASK CONTEXT
   ↓
ROUTER (canonical authority — router.ts, Step 1.5)
   ↓
cheapest capable path
   ↓
L0 / L1 / DecisionModel / LocalLLM / CloudLLM
   ↓
Tool / Memory / Response / Event
```

Task Identifier становится шагом между attention и router: сначала определить,
в какой контекст попадает ввод (resume существующего или создать новый), и только
потом маршрутизировать cognition.

## 8. Граница: Task Context ≠ Memory

Легко перепутать:

```text
Task Context = что нужно для выполнения текущей задачи
Memory       = что U.N.A. должна помнить вне этой задачи
```

Примеры: «в этом проекте ветка phase2-routing» — task state; «пользователь
предпочитает local-first» — long-term memory.

При завершении задачи:

```text
Task Context → extract durable facts? → Memory Manager → candidate → memory
```

Задача может закончиться, полезное знание — остаться. Связь с Memory Manager (M6)
и мягким забыванием — extraction кандидатов идёт через тот же скоринг-гейт.

## 9. Почему это ценно даже без параллельного inference

Task Isolation — фундаментальная изоляция runtime, не GPU-оптимизация. Она решает:

- смешивание историй и целей;
- неправильное использование инструментов между задачами;
- конфликтующие задачи;
- восстановление после паузы (resume);
- перенос задачи между моделями;
- перенос задачи на другой компьютер;
- повторный запуск;
- приоритеты и фоновые задачи.

Поэтому порядок интеграции произвольный:

```text
parallel cloud → parallel local → sequential local → hybrid
```

**Параллелизм становится возможностью исполнения, а не требованием архитектуры.**

## 10. Чего НЕ делать

- ❌ Не превращать Task Context в новую Memory (task state ≠ memory; durable-факты
  уходят в Memory Manager только по extraction-гейту при завершении задачи)
- ❌ Не заводить жёсткие «личности» CODE_YUNA / MUSIC_YUNA
- ❌ Не требовать параллельного inference как условие архитектуры
- ❌ Не начинать реализацию до Step 1.5 (routing reconciliation) и DEC —
  task identifier встраивается в уже существующий путь `router.ts`, а не рядом

## 11. Место в фазах

- Формулировка: «U.N.A. = одна личность + много изолированных контекстов деятельности»
  — кандидат в `UNA_MANIFEST.md` (философский уровень) и в обновлённый Step 2 proposal.
- Реализация — зона **Phase 3 (Agency & Task Runtime)**; до того — только
  методологическая согласованность: TaskContext.requiredMemoryRefs ↔ SURFACE gate,
  context composer STATIC/CACHEABLE/VOLATILE внутри каждой задачи.
- Decision-слой (Pass 6) ложится сюда же: TASK IDENTIFIER и scheduler-решения —
  типовые кандидаты на дешёвые typed judgments.

