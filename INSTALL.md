# U.N.A. Desktop — Installation Guide

## Quick Start

### Windows
1. Распакуйте архив в папку
2. Двойной клик на `start.bat`
3. Скрипт проверит зависимости и предложит запустить U.N.A.

### Linux/macOS
```bash
./start.sh
```

### Manual (все платформы)
```bash
npm install
npm run dev
```

---

## Требования

### Обязательные
- **Node.js** 18+ ([скачать](https://nodejs.org/))
- **npm** 9+ (входит в Node.js)

### Опциональные (для дополнительных функций)
- **Ollama** — для локального LLM ([установка](https://ollama.ai/))
- **Git** — для work context (статус репозиториев)
- **ripgrep** — для быстрого grep (иначе JS fallback)
- **ZAI_API_KEY** — для облачного LLM ([получить](https://z.ai/developers))

---

## Конфигурация

### .env файл
Скопируйте `.env.example` в `.env` и заполните:
```bash
cp .env.example .env
```

```env
# Z.ai API ключ (обязательно для облачного LLM)
ZAI_API_KEY=your_key_here

# Опционально
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=
```

### Ollama (локальный LLM)
```bash
# Установить Ollama: https://ollama.ai/
# Скачать модель:
ollama pull gemma4:e2b-it-qat-2k

# Запустить сервер:
ollama serve
```

---

## Команды

```bash
npm run dev           # Запуск dev-режима (Vite + Electron)
npm run build         # Production build
npm test              # Запуск тестов (170 тестов)
npm run test:coverage # Тесты с coverage (52%)
npm run package:win   # Собрать Windows .exe (portable)
npm run package:linux # Собрать Linux .AppImage
npm run package:mac   # Собрать macOS .dmg
```

---

## Проверка целостности файлов

После распаковки архива запустите:
```bash
node scripts/verify-manifest.js
```

Это проверит, что все 72+ файла проекта на месте. Если что-то пропало — скрипт сообщит.

---

## Устранение неполадок

### "electron-store" ошибки
```bash
# Если electron-store v10 установлен (ESM проблема):
npm install electron-store@8.2.0
```

### TypeScript ошибки
```bash
# Проверить:
npx tsc -p electron/tsconfig.json --noEmit
npx tsc --noEmit

# Если ошибки — проверить tsconfig.json
```

### Ollama не подключается
```bash
# Проверить, что сервер запущен:
curl http://localhost:11434/api/tags

# Если не запущен:
ollama serve
```

### ZAI_API_KEY не работает
- Проверьте, что ключ в `.env` файле (не в `.env.example`)
- Проверьте, что нет пробелов вокруг `=`
- Перезапустите U.N.A.

---

## Сборка portable .exe

### Windows
```bash
npm run package:win
```
Результат: `dist/UNA-Desktop-Setup-x.y.z.exe` (~180 МБ)

### Linux
```bash
npm run package:linux
```
Результат: `dist/UNA-Desktop-x.y.z.AppImage` (~180 МБ)

### macOS
```bash
npm run package:mac
```
Результат: `dist/UNA-Desktop-x.y.z.dmg` (~180 МБ)

---

## Структура проекта

См. `MANIFEST.md` для полного списка файлов.

```
una-desktop/
├── electron/          # Backend (Node.js)
├── src/               # Frontend (React 19)
├── prompts/           # System prompts
├── docs/              # Documentation
├── scripts/           # Setup + smoke tests
├── tests/             # Vitest tests
├── start.bat          # Windows launcher
├── start.sh           # Linux/macOS launcher
└── MANIFEST.md        # Список всех файлов
```

---

## Git protection (рекомендуется)

Для защиты от потери файлов:
```bash
git init
git add -A
git commit -m "Initial commit: U.N.A. v27"

# Пуш на GitHub (создайте repo на github.com):
git remote add origin https://github.com/USERNAME/una-desktop.git
git branch -M main
git push -u origin main
```

После пуша на GitHub файлы защищены навсегда.
