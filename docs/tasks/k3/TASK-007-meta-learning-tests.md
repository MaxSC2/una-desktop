# TASK-007: Приёмочные тесты electron/ai/meta-learning.ts

- **Статус:** IN PROGRESS (2026-09-22, K3 wave 2)
- **Ветка:** `k3/task-007-meta-learning-tests` (stacked на TASK-006)
- **Контракт:** P1-2 (DEC-008) — фиксируем ТЕКУЧЕЕ поведение.
- **Источник:** implementation-map пробел №5 (meta-learning).

## Observable contract (по коду @ aa3b634)

- `detectCorrection(msg)` — regex-набор (нет/не то/исправь/stop/wrong/no/actually...mean/…), i-флаг.
- `recordInteraction(isCorrection)` — счётчики; rate-инсайт: total>=10 && corrections/total>0.3 → conf=min(rate,0.9).
- `learnFromMessage(msg)`:
  - short-паттерны → upsert('answer_style','short',0.6); long → 'detailed',0.6; less-tools → ('tool_usage','minimal',0.5).
  - upsert: существующий key → value перезаписывается, observations++, confidence=min(+boost,1.0); saveFact('preference', JSON) (ошибки глотаются).
- insights из preferences: short/detailed при conf>=0.4; tool minimal при conf>=0.3.
- insights из self-review (мок getReviewSummary): totalReviews>=3 && avg<3 → conf 0.7; weakness count>=3 → conf=min(0.5+n*0.1, 0.9).
- `getMetaInstructions()`: нет инсайтов → ''; иначе блок «# Мета-обучение (выученные паттерны)» со строками `- instruction` (conf>=0.3).
- `loadPreferences()`: читает getFactsByCategory('preference'), JSON.parse, только новые key; битый JSON пропускается.
- `resetLearning()` — полный сброс.

## Изоляция

Моки: `../memory/store` (saveFact/listFacts/getFactsByCategory), `./self-review` (getReviewSummary). `vi.resetModules()` на тест. Прод-код не меняется.

## Findings (важно)

- **F-кандидат:** все русские regex-паттерны построены на `/\bслово\b/i`, но в JS `\w = [A-Za-z0-9_]`, кириллица — `\W`, поэтому `\b` рядом с русской буквой никогда не матчится. Итог: `detectCorrection` и `learnFromMessage` игнорируют ВЕСЬ русский ввод («нет, не то», «короче», «подробнее», «просто ответь»…). Работают только ASCII-паттерны. Зафиксировано тестами как текущее поведение; прод-код НЕ менялся (P1-2). Требует решения Архитектора (вероятный фикс: убрать `\b` или использовать lookaround с `\p{L}` + флаг `u`).

## Acceptance

targeted зелёный; полный набор зелёный; tsc 0; manifest 0/0.
