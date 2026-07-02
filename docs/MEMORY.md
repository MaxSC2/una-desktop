# Система памяти U.N.A.

U.N.A. использует **5-уровневую архитектуру памяти**, вдохновлённую когнитивной психологией человека.

## Уровни

### 1. WORKING MEMORY (рабочая)

**Что:** последние сообщения в контексте LLM.
**Где:** in-memory (RAM).
**Объём:** последние 20 сообщений (настраивается).
**Время жизни:** текущий диалог.

Передаётся в LLM как часть `messages`. Это аналог краткосрочной памяти человека — то, что вы сейчас обсуждаете.

```typescript
// В memory/store.ts
const cfg = store.get('memory');
const recent = getRecentMessages(convId, cfg.maxWorkingMessages);
```

### 2. SESSION MEMORY (сессионная)

**Что:** контекст текущей сессии: активные файлы, текущая задача, недавние действия.
**Где:** in-memory + SQLite.
**Объём:** ~10-20 элементов.
**Время жизни:** до перезапуска U.N.A.

Позволяет U.N.A. помнить «мы только что говорили про проект X» даже если конкретные сообщения ушли из working memory.

### 3. EPISODIC MEMORY (эпизодическая)

**Что:** вся история диалогов с временными метками.
**Где:** SQLite, таблицы `conversations` и `messages`.
**Объём:** без ограничений ( SQLite — сотни тысяч строк без проблем).
**Время жизни:** пока не удалите БД.

Каждое сообщение сохраняется:
```sql
INSERT INTO messages (conversation_id, role, content, tool_calls, timestamp)
VALUES (?, ?, ?, ?, ?);
```

Поиск по истории — через `LIKE`:
```sql
SELECT * FROM messages WHERE content LIKE '%проект%' ORDER BY timestamp DESC LIMIT 10;
```

### 4. SEMANTIC MEMORY (семантическая)

**Что:** факты о пользователе, его проектах, предпочтениях.
**Где:** SQLite, таблица `facts` + векторные embeddings.
**Объём:** по умолчанию 500 фактов (LRU-вытеснение).
**Время жизни:** пока не удалите.

U.N.A. **автоматически** сохраняет важные факты через инструмент `memory_save`:
- «пользователь программист на Python»
- «проект X находится в /home/user/projects/X»
- «пользователь предпочитает тёмную тему»

Для поиска используется **векторная семантика**:
- Каждый факт проходит через `all-MiniLM-L6-v2` (384-мерный embedding)
- При запросе «помнишь, какой у меня проект?» — U.N.A. вызывает `memory_recall`
- Embedding запроса сравнивается с embedding'ами фактов (cosine similarity)
- Топ-5 релевантных фактов добавляются в контекст LLM

```typescript
// В memory/store.ts
async function recallFacts(query: string, limit = 5): Promise<Fact[]> {
  const queryEmbedding = await embed(query);
  const all = db.prepare('SELECT * FROM facts').all();
  // Сортируем по cosine similarity
  const scored = all
    .map((f) => ({ ...f, score: cosine(queryEmbedding, f.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  // Обновляем last_used для найденных
  return scored;
}
```

**Почему `all-MiniLM-L6-v2`?**
- Размер: ~25 МБ
- Скорость: ~10 мс на embedding (CPU)
- Качество: достаточно для русского и английского
- Работает локально, без интернета
- Через `@xenova/transformers` — чистый JS, без Python

### 5. PROCEDURAL MEMORY (процедурная)

**Что:** усвоенные шаблоны «если пользователь спросил X → делай Y».
**Где:** SQLite, таблица `patterns`.
**Объём:** без ограничений.
**Время жизни:** пока не удалите.

Пример:
- Триггер: «открой проект»
- Действие: «вызови list_files для ~/projects и спроси какой проект»

Пока используется ограниченно — для ускорения типичных команд. В будущем можно развить в полноценную систему обучения.

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
  embedding BLOB,             -- Float32Array, 384 элемента = 1536 байт
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
```

## Где хранится БД

- **Windows:** `%APPDATA%\una-assistant\una-memory.db`
- **Linux:** `~/.config/una-assistant/una-memory.db`
- **macOS:** `~/Library/Application Support/una-assistant/una-memory.db`

Путь определяется через `app.getPath('userData')` в Electron.

## Контекст для LLM

Когда вы пишете сообщение, U.N.A. строит контекст так:

```
[SYSTEM PROMPT]
Ты — U.N.A., персональный ИИ-ассистент...

# Вспомненные факты о пользователе
- [user] Пользователь программист на Python
- [project] Проект "myapp" находится в /home/user/myapp
- [preference] Пользователь предпочитает тёмную тему

[USER] (5 минут назад) Покажи, что в проекте myapp
[ASSISTANT] (5 минут назад) В /home/user/myapp: src/, package.json...

[USER] (сейчас) Создай там файл README.md
```

LLM видит и вашу текущую задачу, и важные факты из прошлого — отвечает контекстно.

## Управление памятью

В UI есть панель **«Память»**:
- Список всех фактов с категориями
- Счётчик использований (use_count)
- Кнопка удаления факта
- Автообновление при сохранении новых фактов

Можно удалять факты, которые U.N.A. запомнила неправильно.

## Производительность памяти

- SQLite с WAL mode — параллельные чтения без блокировок
- Векторный поиск по 500 фактам: ~5-10 мс (полный скан, но быстрый)
- При росте до 5000+ фактов — нужен ANN индекс (FAISS, hnswlib)
- Embeddings кешируются в BLOB — не пересчитываются

## Приватность

**Всё хранится локально.** Никакие факты, диалоги, embeddings не отправляются в облако без вашего ведома.

Единственное, что уходит в облако (если включён облачный режим):
- Тексты ваших сообщений (для LLM)
- Embeddings запросов (для cloud embeddings, если используются)

При локальном режиме (Ollama + whisper + piper) — полный офлайн.
