# TASK-016 - Wave 3 tests + fix: self-review + vram-gate + asr + tts (мега-пакет)

- **Основание:** DEC-021 (Accepted); Wave 3 — последний ряд непокрытых подсистем.
  Мега-пакет: 4 файла, ~600 строк, один бранч. Конвейер: стартовать после TASK-015 (stacked).
- **Исполнитель:** K3. **Ветка:** k3/task-016-wave3-media-review (от актуального main на момент старта).
  **Статус:** READY (спеку утвердил оркестратор; продуктовых решений внутри нет — см. Fix 0).
- **Зависимости:** нет.
- **State (сверено с кодом 2026-09-24):** dedicated-тестов нет ни у одного из четырех файлов.

## Fix 0 (утверждено оркестратором как расширение решения A, вето Lead — до старта):
  self-review.ts runChecks содержит ТОТ ЖЕ класс дефекта, что Q-META: `\b` вокруг кириллицы
  (проверки 2/4/7: needsWeb, greeting, answerPrefixes). Применить те же wbr/wbs-хелперы из TASK-013.
  Тесты писать сразу на ИСПРАВЛЕННОЕ поведение (без промежуточной инверсии).
  Если Lead наложит вето — вместо фикса зафиксировать как дефект + Q-SELF-001.

## Файл 1: electron/ai/self-review.ts (226 строк)
- reviewResponse: score 5 минус штрафы (7 проверок), clamp [1,5]; обрезки 200/300 символов;
  in-memory cap 20 (unshift+pop); saveFact замокан (mock ../memory/store), console.warn при ошибке.
- Проверки (RU+EN кейсы на каждую): длина вопрос/ответ (пороги 80/500 и 300/100, -0.5);
  toolCallCount 0 + needWeb -> -1 / >0 -> strength; hadError -> -1;
  приветствие без ответа -> -0.5; <think> >200 символов -> -0.5 / наличие -> strength;
  >15 строк + >1000 символов -> strength; вопрос без прямого ответа -> -0.5.
- getReviewSummary: пусто -> нули; средний с округлением x.x; топ-5 слабостей по убыванию;
  уники-уроки топ-5. getRecentReviews: лимит дефолт 5. formatReviewForPrompt: пусто -> ''.
- clearReviews для изоляции (beforeEach). runDeepReview: мок listFacts — null при пустых,
  агрегация score/weakness/lessons, битый JSON пропускается.

## Файл 2: electron/ai/vram-gate.ts (125 строк)
- Мокать: ./config getConfig (llm + resource.unloadOnGaming), ./resource-manager getResourceState,
  global fetch. Время — fake timers (кулдауны 60с/120с).
- isModelLoaded: non-ok -> true (консервативно); throw -> true; models массив/объект/пусто;
  пустой localUrl -> false (через isOllamaModelLoaded/unloadOllamaModel).
- unloadOllamaModel: уже выгружена -> false без POST; успех -> true + keep_alive 0 в body;
  non-ok -> false; throw -> false.
- checkAndFreeVram: unloadOnGaming false -> false; gaming + окно кулдауна -> unload;
  повторный вызов в кулдаун -> false; fail -> failedAt выставлен; не-gaming после gaming ->
  wasGaming сброшен + false.
- start/stop/isVramGateRunning: двойной start — один таймер; stop без start — безопасно.
- ЗАПРЕЩЕНО: реальный fetch/Ollama, реальные таймеры 15с (fake timers обязательны).

## Файл 3+4: electron/ai/asr.ts (109) + electron/ai/tts.ts (137)
- Мокать: child_process.spawn (фейковый процесс через EventEmitter: stdout/stderr/close/error),
  ./config (getASRConfig/getTTSConfig + set), 'z-ai-web-dev-sdk' (vi.mock), ./llm getZAISDK.
- asr: local без путей -> throw; спавн code!=0 -> reject с кодом в тексте; error-событие -> reject;
  data:-префикс счищается; успех читает output .txt + trim + чистит tmp.
  auto без whisperPath -> cloud; local-провал при provider local -> throw;
  auto-провал -> fallback cloud; cloud без ключа -> throw.
- tts synthesize: local-успех -> wav base64 (проверить RIFF-заголовок); local-провал при
  provider local -> пусто 'none' (не throw); auto+cloud-ключ -> mp3; все недоступно -> пусто 'none'.
- synthesizeCloud: обрезка input 1500 символов; пустой ответ -> throw.
- setASRConfig/setTTSConfig: проброс patch в unified store (мок).
- ЗАПРЕЩЕНО: реальные spawn whisper/piper, реальный Z.ai, запись вне tmp.

## Scope строго
- Разрешено: self-review.ts (только Fix 0), 4 новых тест-файла, отчет, manifest sync.
- Запрещено: любая другая production-правка; сеть/процессы/ключив тестах; safety/workflows/package*.json;
  decision-log/AGENTS.md/docs сверх отчета; ручной manifest.

## Acceptance
- Четыре файла зеленые (ориентир 60-80 кейсов); npm test полностью зеленый; tsc electron+root 0;
  manifest sync/verify чисто (0 missing); ветка k3/task-016-wave3-media-review; отчет DEC-021 раздел 5.
- **Стоп (DEC-021 раздел 6):** флейки spawn/timer — только через моки и fake timers;
  сомнения — в отчет, не в фикс. **Код — истина (DEC-010).**
