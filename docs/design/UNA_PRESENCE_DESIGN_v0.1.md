# U.N.A. Presence / Living Stage Design v0.1

> Статус: Draft / визуальная спецификация (код не трогаем)
> Цель: зафиксировать, как ощущается присутствие Юны.
> Принцип: Юна не находится В интерфейсе. Интерфейс — пространство, где Юна находится.
> Дата: 2026-09-15

Связано: docs/ARCHITECTURE.md, docs/MASCOT_TZ.md, docs/CODE.md

## 1. Design principles

### P1 — Presence over panels
Главный объект экрана — сцена (Living Stage), не чат и не табы.

Обычный AI: UI -> chat -> avatar
U.N.A.: presence (stage, avatar, voice, ambient) + conversation + tasks + memory + environment

### P2 — One place, many states
Одна сцена меняет состояния. Проверка: IDLE → SPEAKING → WORKING
должны ощущаться как одна и та же Юна в одном месте, а не три страницы.

### P3 — Calm technology
Медленные дышащие анимации (3–5 сек). Никакого цирка из шестерёнок
на THINKING. Пустота в IDLE — это нормально.

### P4 — Color is state
Цвет = язык состояния. Один акцент за раз. Никаких RGB-ёлок.

### P5 — Placeholder must survive aesthetics
Даже кривой placeholder (ромб, orb, пятно) смотрится уместно
за счёт сцены: фон, свет, позиция, подпись, реплика.

### P6 — Space has memory
Сцена не сбрасывается между репликами. Позиция и приглушение
персистентны в рамках сессии.

## 2. Living Stage layout

Каркас:

Header 40px: U.N.A. | время | точка состояния (ACTIVE)
Living Stage flex-1: AVATAR SLOT + presence line + conversation strip + activity pocket
Dock 56-64px: Chat / Tasks / Memory / System + mic + Input

Правила:
- Чат НЕ занимает весь экран. Видимы 3–4 последние реплики.
- Табы переключают фокус панели, а не сцену. Юна остаётся на месте.
- Header — только идентичность + состояние + время.
- Overlay (#/overlay 480x200) — отдельная мини-сцена.

Связь с кодом сейчас: App.tsx = Header + Left(avatar) + Center(panel)
+ Right(tabs). В v0.1 Left и Center сливаются в Living Stage,
ChatPanel становится conversation strip внутри сцены.
Миграция — позже. Сейчас только спецификация.

## 3. Spatial zones

Юна имеет место, не img в div. Позиция читается как смысл.

CENTER — общается (IDLE, SPEAKING, THINKING). Центр, 160–220px.
RIGHT — работает (WORKING). Сдвиг вправо + раскрыт activity pocket.
LEFT — наблюдает (OBSERVING). Сдвиг влево, 120px, тихая.
BOTTOM — отдыхает. Опущена вниз, приглушена.
SLEEP ZONE — спит. Центр 96px, почти темно.
OVERLAY — срочно обращается. Поверх всего, только важное.

Перемещения: сдвиг + кроссфейд 400–600ms. Без прыжков.
CENTER → RIGHT — самый частый переход: реплика остаётся,
рядом раскрывается задача, сцена не пересобирается.
## 4. U.N.A. states

Минимум v0.1:

IDLE — Юна просто рядом. Дышит. Тихая presence line.
SPEAKING — говорит. Движение + voice indicator + активная реплика.
THINKING — думает. Минимальная индикация, без цирка.
WORKING — делает. Сдвиг в RIGHT + activity pocket с задачей.
OBSERVING — не мешает. Сдвиг в LEFT, уменьшена, тихая.
HAPPY — тёплая реакция поверх состояния (эмоция, не место).
CONCERNED — сдержанное беспокойство (риск, подтверждение).
SLEEPING — приглушённая сцена. Минимум активности.
ERROR — сдержанный красный. Что случилось + что делать.

### Маппинг на существующий код (мост, не код)

Presence IDLE = AssistantStatus idle = UnaState active/idle
  = Attention light_work/idle = Emotion neutral.
Presence SPEAKING = speaking = active = chatting = любая эмоция.
Presence THINKING = thinking = thinking = chatting = thinking.
Presence WORKING = executing = active = light_work/deep_focus = neutral.
Presence OBSERVING = idle = idle/gaming
  = deep_focus/gaming/meeting = neutral.
HAPPY и CONCERNED — слой поверх состояния, а не место.
  WORKING + HAPPY = задача готова. SPEAKING + CONCERNED = нужно подтверждение.
SLEEPING = idle = sleep/night = idle = neutral.
ERROR = awaiting_confirmation = Emotion frustrated/sad.

Эмоция — слой поверх. Юна может быть WORKING + HAPPY
или SPEAKING + CONCERNED.

### Будущий CompanionPresence (слот для Terra, НЕ реализовывать)

PresenceState: IDLE | SPEAKING | THINKING | WORKING
  | OBSERVING | HAPPY | CONCERNED | SLEEPING | ERROR
PresenceZone: CENTER | RIGHT | LEFT | BOTTOM | SLEEP | OVERLAY
Поля: state (что делает), zone (где), emotion (слой поверх),
attention (из attention-manager), world day/night (из world-model).

## 5. State → visual behavior

IDLE: placeholder дышит (scale 1→1.03, 4s). Базовый violet glow 0.5.
  Presence line: «Я рядом. Чем займёмся?» Последние 2–3 реплики приглушены.
  Activity pocket схлопнут. Тихо.

SPEAKING: лёгкое покачивание + voice indicator (3 столбика).
  Glow ярче (0.8–1.0), тот же hue. Активная реплика стримится рядом
  с аватаром. think-блок в collapsible (как сейчас в ChatPanel). TTS если включён.

THINKING: замирание + медленная пульсация ореола (2s).
  Одна строка «подумаю…» italic. Плейсхолдер уже есть в ChatPanel — сохранить.
  Никаких спиннеров на весь экран.

WORKING: сдвиг в RIGHT за 500ms. Рядом текущая задача:
  «Делаю: <имя>», шаг X/N. Чат заморожен (не скроллится сам).
  Pocket раскрыт: имя, шаги, лог под катом, кнопка стоп (chat:stop уже есть).

OBSERVING: сдвиг в LEFT, 120px, opacity 0.8. Dim −20%.
  Тишина — нормально, presence line нет. Звук выключен (respect DnD/gaming).

HAPPY (слой 1.5s): теплее glow, subtle green tint, «Готово».
  Результат уходит в чат одной строкой. Мягкий chime опционально.

CONCERNED (слой): warm amber, «Тут нужен твой взгляд…».
  Показывает риск caution/dangerous. ConfirmationDialog — внутри pocket,
  а не модалкой поверх Юны.

SLEEPING: центр 96px, почти статичен. Muted blue/violet, dim −60%.
  «Сплю. Разбуди, если нужно.» Чат скрыт. Звук и proactive выключены.

ERROR: на месте, без прыжков. Restrained red glow 0.6, сцена НЕ мигает.
  Человеческий текст + что делать. Лог под катом.

Анти-паттерны (запрещено):
- шестерёнки / спиннеры fullscreen на THINKING
- смена фоновой картинки при смене состояния
- RGB-переливы, bounce-анимации, прыжки аватара
- больше одного яркого акцента одновременно
- модалки поверх Юны (кроме OVERLAY-срочности)
## 6. Chat integration (чат как часть пространства)

- Conversation strip, а не страница. Видимы 3–4 последних сообщения.
  Остальное — скролл внутри strip фиксированной высоты. Сцена сверху всегда видна.
- Активная реплика принадлежит Юне. Во время SPEAKING текст стримится
  в bubble рядом с аватаром. Курсор + лёгкая пульсация (уже есть в ChatPanel).
- think-блок в collapsible («Рассуждение», открыт во время стрима) — оставить.
- Tool calls — в activity pocket, не в чат. Чат показывает результат
  человеческим языком. Сырой args JSON живёт под катом «Инструменты (N)».
- Input один на все состояния (Dock). Во время WORKING рядом кнопка Стоп
  (chat:stop уже существует).

## 7. Task integration (задачи)

Activity pocket — визуальное лицо WORKING.
Источники: executive.ts (голы), tool-loop.ts (шаги), goal-tracker.ts.

Структура pocket:
  Заголовок: «Делаю: <короткое имя задачи>», шаг X/N
  Шаги: готовые с галочкой, текущий пульсирует, будущие тусклые
  Низ: лог под катом + кнопка остановить

Правила:
- Pocket раскрыт ТОЛЬКО при WORKING. Иначе кромка 8px или скрыт.
- Завершение: HAPPY-слой 1.5s, pocket схлопывается,
  результат в чат одной строкой.
- Ошибка шага: CONCERNED/ERROR-слой, pocket остаётся с логом.
- Подтверждение (awaiting_confirmation) — внутри pocket,
  не модалкой поверх Юны.

## 8. Voice integration (голос)

Mic в Dock: IDLE тусклый, SPEAKING эквалайзер, LISTENING красный + волна,
  DnD/gaming зачёркнут.
Voice indicator у аватара: 3 столбика на SPEAKING (дышат с речью),
  кольцо «слушаю» на LISTENING. Кольцо — DOM/Canvas вокруг слота,
  чтобы не перерисовывать модель.
Субтитры: стрим текста = субтитры. Промежуточный ASR-текст italic в input.
TTS toggle уже есть (voiceEnabled). При DnD авто-off.
ASR-флоу (startListening/stopListening в useUNA) не меняется.
Меняется только видимость LISTENING на сцене.

## 9. Day/night behavior (время суток)

Источник: world-model.ts (localTime, dayOfWeek) + states.ts (night, sleep).

Утро 6–12: базовый violet, чуть светлее. «Доброе утро. С чего начнём?»
День 12–18: базовый. «Я рядом. Чем займёмся?»
## 10. Avatar abstraction (слот аватара)

Сцена не знает, ЧТО внутри слота. Слот — контракт:

Бокс фиксирован: CENTER 220px, LEFT 120px, SLEEP 96px. Не прыгает от контента.
Входы: status (idle/thinking/speaking/listening/working)
  + emotion (neutral/happy/...) — совместимо с Rive inputs из MASCOT_TZ.md.
Выходы: ничего, слот только рисует.
Placeholder v0.1: ромб + имя ЮНА + мягкое свечение. Обязан смотреться
  нормально на тёмном фоне без картинки. Допустимо: Canvas Orb (уже есть),
  SVG-пятно, CSS-ромб с glow.
Замена без переделки сцены: placeholder → Rive (.riv) → Live2D / VRM.

## 11. Responsive behavior

Ширина от 1100px: полная сцена (CENTER + strip + pocket справа).
700–1100px: pocket становится overlay-панелью поверх правого края,
  закрывается крестиком. Сцена не сжимается.
Меньше 700px: сцена 40% высоты сверху (аватар 120px), strip + Dock снизу.
  LEFT/RIGHT — плоский сдвиг translateX ±40px вместо ±200px.
Overlay 480x200: только аватар-малый + presence line + input. Без pocket.
Высота меньше 500px: strip схлопывается до 1 реплики, сцена приоритетна.

## 12. Accessibility

- Состояние дублируется текстом, цвет никогда не единственный носитель:
  точка + подпись («В сети / Думаю / Делаю», STATUS_LABELS уже есть).
- Reduced motion: при prefers-reduced-motion убрать дыхание/пульсации,
  оставить кроссфейды до 200ms. Аватар статичен.
- Контраст: presence line и чат минимум 4.5:1 на фоне #0a0e1a.
  Приглушённый текст минимум 3:1, не несёт критической информации.
- Клавиатура: Tab доходит до Input → Mic → Stop → табы.
  Ctrl+Shift+Space — overlay (уже есть). Esc — стоп / закрыть pocket.
- Скринридер: смена PresenceState через aria-live polite одной строкой
  («Юна: думаю», «Юна: делаю, шаг 2 из 4»). Стрим текста — live off,
  финальная реплика — polite.
- Дальтонизм: успех/ошибка различаются иконкой (галочка/крест/воскл. знак),
  а не только цветом (в tool calls уже так — сохранить).

## 13. Future Live2D/VRM slot (задел)

- Бокс слота свободен снизу: никаких панелей впритык к аватару.
- Фон слоистый (3 слоя): deep gradient → nebula blobs → grain/vignette.
  VRM/прозрачный PNG ляжет без белого ореола.
- CENTER/RIGHT/LEFT — будущие bone targets. Сдвиг через transform translate,
  чтобы потом маппиться на движение модели.
- Эмоции — данные строкой в слот (как Rive inputs), не захардкоженные PNG.
- Голосовое кольцо отдельно от модели (DOM/Canvas вокруг слота).
## 14. Prototype acceptance criteria

Прототип годный, если:

A1 — Одна сцена. IDLE/SPEAKING/WORKING на одном каркасе
  (Header + Stage + Dock). Не три разные страницы.
A2 — Чат не fullscreen. Зона аватара видна целиком в каждом состоянии.
  Conversation не выше 40% высоты сцены.
A3 — Placeholder выжил. IDLE с ромбом смотрится целостно
  (свет, подпись, presence line). Не пустой div.
A4 — Переход CENTER→RIGHT бесшовный: реплика осталась,
  раскрылся pocket, аватар сдвинулся, сцена не пересобралась.
A5 — THINKING тихий: одна строка + дыхание ореола. Без спиннеров fullscreen.
A6 — Цвет = состояние: один акцент за раз (токены ниже).
A7 — SLEEPING приглушён минимум на 50%, звук/proactive off,
  будится одной репликой.
A8 — Маппинг на код: каждое визуальное состояние маппится
  на AssistantStatus / UnaState / Attention без новых сущностей в рантайме.
A9 — Доступность: состояние читается текстом, reduced-motion предусмотрен.
A10 — Слот будущего: виден бокс Avatar Slot с запасом под Live2D/VRM
  и voice ring вне модели.

Обязательный минимум: A1–A3 + wireframes 01-idle/02-speaking/03-working.
Желательно: 04-sleeping/05-system-aware.

## 15. Визуальные токены v0.1

Сейчас код — циан (una-* в tailwind.config.js, фон #0a0e1a).
Направление v0.1 — violet-first, циан остаётся вторичным (голос/успех).
Миграция позже, токены фиксируем сейчас.

Фон сцены #0a0e1a (совпадает с текущим).
Поверхности: полупрозрачный slate (bg-slate-950/60 сегодня).
Рамки: violet 20% прозрачности (сегодня циан una-500/20 → станет violet).
IDLE: violet, glow 0.5. Активность: brighter violet, glow 0.9.
Успех: subtle green. Внимание: warm amber. Ошибка: restrained red, glow 0.6.
Сон: muted blue/violet + dim. Голосовой слой: cyan (наследие Orb, оставить).
Шрифт UI Inter. Шрифт статуса JetBrains Mono, uppercase, tracking 0.3em
  (уже так в Orb/Avatar — сохранить).

Фон 3 слоя:
  1. radial violet 12% сверху слева — дыхание
  2. radial cyan 6% снизу справа — шёпот
  3. vignette + noise 2% — глубина и комнатность

## 16. Что дальше (для Terra, не делать сейчас)

1. Утвердить главный документ + 3 грамматики + 5 wireframes.
2. Кликабельный прототип 3 состояний на текущем стеке (React + Tailwind,
   без новой логики).
3. После A1–A3 — маппить CompanionPresence на store.ts
   (status, currentEmotion, activePanel) + attention-manager + world-model.
4. Rive .riv из MASCOT_TZ.md ложится в Avatar Slot без переделки сцены.

Код пока не трогаем (решение v0.1).
## 17. Грамматики v0.1 (обязательные приложения)

Три документа доводят v0.1 до готовности к прототипу.
Прототип A1–A3 без них не начинать (иначе получатся красивые кнопки
без понятного смысла).

- GRAMMAR_VISUAL_v0.1.md — визуальная грамматика: SPACE (содержит),
  REACTION (тело/голос/свет Юны), INFORMATION (факты и действия).
  Слои z-order 0–8. Тест классификации: любой пиксель макета обязан
  однозначно лечь в один класс.
- GRAMMAR_MOTION_v0.1.md — motion-грамматика: 6 примитивов
  (BREATHE, LEAN, SHIFT, APPEAR, GLOW, DIM), таблица переходов зон,
  взгляд через позицию и свет, бюджет движения (1 SHIFT + 1 GLOW
  + BREATHE одновременно максимум), reduced motion.
- GRAMMAR_INTERACTION_v0.1.md — interaction-грамматика: 5 touchable
  точек (INPUT, MIC, STOP, TABS, POCKET-CONTROLS), observable источники
  (attention/world/state — только как это выглядит), обряд из 3 шагов
  для любого нового объекта (классифицируй → дай движение из словаря
  → свяжи с присутствием), запреты (аватар не кликается, overlay
  только системный).

Порядок дальше: утвердить главный документ + 3 грамматики + 5 wireframes,
потом кликабельный A1–A3 прототип, потом маппинг на store/attention/world.


