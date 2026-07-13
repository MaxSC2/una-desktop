# Система памяти U.N.A.

U.N.A. использует **5-уровневую архитектуру памяти**, вдохновлённую когнитивной психологией человека.

## Архитектура (текущая)

Система памяти построена на двух уровнях:

1. **RLM (Recurrent Language Model)** — трёхуровневый менеджер контекста: HOT/WARM/COLD
2. **Memory Pods** — тематические контейнеры фактов (Profile, Work, Emotions и т.д.)

---

### RLM: HOT / WARM / COLD

#### HOT — что в промпте прямо сейчас
- **Объём:** ≤8K токенов (настраивается)
- Собирается заново на каждый запрос через `buildHotContext()`
- Включает: system prompt, топ-3 факта, последние сообщения, work context, emotion, список активных подов
- Сборка: `electron/memory/rlm.ts`

#### WARM — in-memory кеш
- **Объём:** 50 сообщений, 20 фактов
- Живёт, пока запущен процесс Electron
- Позволяет быстро отвечать без обращения к SQLite
- Сброс: `warmCacheClear()`

#### COLD — SQLite
- **Объём:** без ограничений
- Таблицы: `conversations`, `messages`, `facts`, `patterns`, `emotions`, `memory_pods`
- Поиск фактов: FTS5 префильтр + cosine similarity по эмбеддингам

---

### Memory Pods — тематические контейнеры

Память организована в тематические модули (поды). Каждый под содержит факты по одной теме.

**Поды по умолчанию:**
| Под | Описание |
|-----|----------|
| `profile` | Личные данные: имя, возраст, профессия, контакты |
| `project` | Информация о проектах: репозитории, технологии, задачи |
| `preference` | Предпочтения: стиль общения, любимые технологии, привычки |
| `emotion` | Эмоциональный контекст: настроение, триггеры, реакции |
| `work` | Рабочий контекст: текущие задачи, код, файлы |
| `general` | Общие факты (под по умолчанию) |

**Как работает:**
1. `classifyToPod(text)` — Memory Director определяет, к какому поду относится факт (по ключевым словам)
2. `findRelevantPods(query)` — перед запросом выбирает топ-3 релевантных пода
3. `recallFacts(query, limit, podId?)` — поиск фактов с опциональной фильтрацией по поду
4. LLM управляет подами через `[MEM] create_pod` и `[MEM] switch_pod`

---

### Управление контекстом (RLM + Pods)

При каждом запросе:

```
buildHotContext(userMessage)
  │
  ├─ 1. System prompt (≤2000 токенов)
  ├─ 2. recallFacts(userMessage, 3) — топ-3 факта глобально
  ├─ 3. findRelevantPods(userMessage) — топ-3 пода по теме
  ├─ 4. selectMessages(recentMessages, 2048) — последние сообщения
  ├─ 5. Work context + Emotion
  └─ 6. [Доступные модули памяти] — список активных подов
```

### [MEM] токены — LLM управляет памятью

Модель может в конце ответа добавить блок `[MEM]`:
- `[MEM] save:категория:факт` — запомнить
- `[MEM] recall:запрос` — вспомнить
- `[MEM] forget:категория:что` — забыть
- `[MEM] create_pod:имя:описание` — создать новый модуль
- `[MEM] switch_pod:имя:запрос` — переключить фокус
- `[MEM] summarize:количество` — сжать старые сообщения

## Схема БД

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,         -- user | assistant | system | tool
  content TEXT NOT NULL,
  tool_calls TEXT,            -- JSON с историей вызовов
  timestamp TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX idx_messages_conv ON messages(conversation_id);
CREATE INDEX idx_messages_time ON messages(timestamp);

CREATE TABLE facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,     -- user | project | preference | task
  content TEXT NOT NULL,
  embedding BLOB,             -- Float32Array, 256 элементов = 1024 байта
  created_at TEXT NOT NULL,
  last_used TEXT,
  use_count INTEGER DEFAULT 0,
  pod_id INTEGER REFERENCES memory_pods(id)  -- NULL → 'general' под
);
CREATE INDEX idx_facts_pod ON facts(pod_id);

CREATE TABLE memory_pods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,  -- 'profile', 'project', 'preference', 'emotion', 'work', 'general'
  description TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  created_at TEXT NOT NULL,
  last_used TEXT,
  use_count INTEGER DEFAULT 0
);

CREATE TABLE patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  action TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_used TEXT
);

CREATE TABLE emotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  emotion TEXT NOT NULL,
  trigger TEXT,
  intensity REAL DEFAULT 0.5,
  message_preview TEXT,
  conversation_id INTEGER
);
```

## Где хранится БД

- **Windows:** `%APPDATA%\una-assistant\una-memory.db`
- **Linux:** `~/.config/una-assistant/una-memory.db`
- **macOS:** `~/Library/Application Support/una-assistant/una-memory.db`

Путь определяется через `app.getPath('userData')` в Electron.

## Embeddings

Используется **Ollama `/api/embed`** (модель из конфига `localModel`).

**Размерность:** 256 dimensions.

**Fallback:** hashing trick (char n-grams + word hashing, L2-нормализация) — работает без LLM, без интернета.

```typescript
// electron/ai/embed.ts
async function embed(text: string): Promise<Float32Array> {
  // Ollama /api/embed → 256-dim вектор
  // При отказе → embedHash(text) — детерминированный хеш
}
```

## Контекст для LLM

Контекст строится через **RLM** (`electron/memory/rlm.ts`):

1. **System prompt** — `buildDynamicPrompt()` (адаптации под эмоцию, время, режим работы)
2. **Факты** — `recallFacts(query, 3)` (топ-3 релевантных факта)
3. **Активные поды** — `[Доступные модули памяти]` (топ-3 пода по теме запроса)
4. **История** — последние сообщения (в пределах токенового бюджета)
5. **Work context** — активное окно, файлы, процессы
6. **Emotion** — текущее настроение пользователя

```
[SYSTEM PROMPT]
Ты — U.N.A., персональный ИИ-компаньон...

# Вспомненные факты
- [user] Пользователь программист

# Доступные модули памяти
- project: Информация о проектах (12 фактов)
- work: Рабочий контекст (5 фактов)

[USER] ...сообщения истории...
[USER] (сейчас) Создай README.md
```

## Производительность памяти

- SQLite с WAL mode — параллельные чтения без блокировок
- Векторный поиск: FTS5 префильтр + cosine similarity (~5-15 мс на 500 фактов)
- Embeddings (256-dim Float32) — 1024 байта на факт, кешируются в BLOB
- При росте до 5000+ фактов — потребуется ANN индекс

## Приватность

**Всё хранится локально.** Никакие факты, диалоги, embeddings не отправляются в облако без вашего ведома.

При локальном режиме (Ollama) — полный офлайн.
