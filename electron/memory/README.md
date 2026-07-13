# Memory Module

Трёхуровневая система памяти (RLM) + тематические контейнеры (Memory Pods).

## Файлы

### `store.ts` — Data Layer
- SQLite: `facts`, `conversations`, `messages`, `patterns`, `emotions`, `memory_pods`
- CRUD: `saveFact`, `recallFacts`, `listFacts`, `deleteFact`, `createPod`, `listPods`
- Embedding-поиск через cosine similarity (Ollama /api/embed + hashing fallback)
- FTS5 pre-filter для быстрого поиска по ключевым словам

**Экспортирует:** `initMemory`, `getDb`, `Fact`, `Pod`, `saveFact`, `recallFacts`, `listFacts`, `deleteFact`, `createPod`, `listPods`, `getPod`, `getPodByName`, `deletePod`, `incrementPodUse`, `searchEpisodic`, `saveEmotion`, и др.

### `rlm.ts` — Recurrent Language Model (Context Management)
- **HOT** — что в промпте LLM прямо сейчас (≤8K токенов)
- **WARM** — in-memory кеш (50 сообщений, 20 фактов)
- **COLD** — SQLite (store.ts)
- Парсит и выполняет `[MEM]` токены: save, recall, forget, create_pod, switch_pod

**Экспортирует:** `buildHotContext`, `buildMessagesFromHot`, `parseMemoryTokens`, `executeMemoryTokens`, `getMemoryInstructions`, `warmCacheAddMessage`, `warmCacheGetMessages`

### `knowledge-graph.ts` — Knowledge Graph
- `fact_relations` таблица в SQLite: from_id → to_id + relation + weight
- Типы связей: related_to, part_of, depends_on, contradicts, generalizes, causes, follows, references
- `addRelation(fromId, toId, relation)` — создать связь
- `getRelatedFacts(factId)` — все связанные факты (outgoing + incoming)
- `autoLinkFacts(factId)` — автоматическое связывание по пересечению ключевых слов (≥3 общих слова)
- `getRelationStats()` — статистика по типам связей
- Интеграция: autoLinkFacts вызывается при saveFact, связанные факты попадают в HOT контекст RLM

### `pods.ts` — Memory Director
- Keyword-based классификация фактов в поды (`classifyToPod`)
- Поиск релевантных подов по запросу (`findRelevantPods`)
- 6 подов по умолчанию: profile, project, preference, emotion, work, general

**Экспортирует:** `classifyToPod`, `findRelevantPods`, `DEFAULT_PODS`

## Схема данных

```
memory_pods              facts
┌───────────┐           ┌───────────┐
│ id (PK)   │◄──────────│ pod_id    │
│ name      │           │ id (PK)   │
│ description│          │ category  │
│ embedding │           │ content   │
│ created_at│           │ embedding │
│ last_used │           │ created_at│
│ use_count │           │ last_used │
└───────────┘           │ use_count │
                        └───────────┘
```

## Правила работы
1. `recallFacts(query, limit)` — ищет по всем подам (если podId не указан)
2. `recallFacts(query, limit, podId)` — ищет только в указанном поде
3. При сохранении факта: `saveFact(category, content, podId?)` — podId опционален
4. Старые факты без pod_id мигрируются в под `general` при инициализации
5. LLM управляет подами через `[MEM] create_pod` и `[MEM] switch_pod`
