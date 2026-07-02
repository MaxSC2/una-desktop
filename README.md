# U.N.A. — Universal Neural Assistant

> Персональный AI-ассистент для ПК. Женская персона. Работает локально, видит экран, слышит голос, управляет файлами и командами — с системой безопасности.

**U.N.A.** = **U**niversal **N**eural **A**ssistant

---

## Что это

U.N.A. — десктопное приложение (Electron + React + TypeScript), которое работает как полноценный персональный ассистент:

- 💬 **Диалог** — общается по-русски, помнит контекст
- 🎙️ **Голос** — слышит вас (ASR) и отвечает женским голосом (TTS)
- 📁 **Файлы** — читает, пишет, ищет файлы
- ⚡ **Команды** — выполняет shell-команды с проверкой безопасности
- 🖥️ **Экран** — делает скриншоты и анализирует через VLM
- 🛡️ **Безопасность** — запрещает `rm -rf /`, требует подтверждения для опасных операций
- 🧠 **Память** — 5-уровневая архитектура (working / session / episodic / semantic / procedural)
- 📌 **Фоновый режим** — сворачивается в tray, активируется горячей клавишей

## Железо

Минимум: **Intel Core i5, 8 ГБ RAM, 4 ГБ VRAM (GTX 1650)** — потянет.

Подробнее: [HARDWARE.md](docs/HARDWARE.md)

## Быстрый старт

### 1. Установите Node.js 20+ и Git

```bash
# Windows: скачайте с https://nodejs.org
# Linux/Mac:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Распакуйте проект и установите зависимости

```bash
cd una-desktop
npm install
```

### 3. (Опционально) Установите локальные модели

**Ollama** (для LLM):
- Скачайте с https://ollama.com
- Запустите: `ollama pull gemma4:e2b-it-qat-2k` (текущая модель по умолчанию)

> Модель по умолчанию задаётся в `electron/ai/config.ts` (`localModel`).
> Ранее использовалась `qwen2.5:3b-instruct-q4_K_M` — заменена на Gemma 4 E2B QAT
> (лучшее function-calling, нативная поддержка контекста 2K). Если у вас уже
> установлена другая модель — поменяйте `localModel` в настройках UI или в `config.ts`.

**whisper.cpp** (для ASR):
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
# Скачайте модель: bash ./models/download-ggml-model.sh small
```

**Piper** (для TTS):
- Скачайте с https://github.com/rhasspy/piper
- Скачайте голос `ru_RU-irina-medium.onnx`

### 4. Запуск в режиме разработки

```bash
npm run dev
```

### 5. Сборка в исполняемый файл

```bash
# Windows (.exe)
npm run package:win

# Linux (.AppImage)
npm run package:linux

# macOS (.dmg)
npm run package:mac
```

Готовый файл появится в папке `release/`.

## Использование

1. **Запустите U.N.A.** — появится окно с анимированным Orb.
2. **Напишите команду** в поле ввода или нажмите микрофон.
3. **Горячая клавиша** `Ctrl+Shift+Space` — открывает overlay для голосовых команд.
4. **Tray-иконка** — клик правой кнопкой для меню (показать/голосовая команда/выход).
5. **Закрытие окна** — U.N.A. остаётся в tray. Полный выход через меню tray → «Выход».

## Примеры команд

- «Что у меня на рабочем столе?»
- «Покажи топ процессов по памяти»
- «Найди все файлы .docx»
- «Что сейчас открыто на экране?»
- «Запиши в файл notes.txt: купить молоко»
- «Удали все временные файлы в /tmp» (потребует подтверждения)

## Документация

- [Архитектура](docs/ARCHITECTURE.md) — как всё устроено
- [Память](docs/MEMORY.md) — 5-уровневая система памяти
- [Железо](docs/HARDWARE.md) — требования и оптимизация под ваше железо
- [Установка](docs/INSTALL.md) — подробный гайд по установке
- [Безопасность](docs/SECURITY.md) — как работает защита
- [Фоновый режим](docs/BACKGROUND.md) — tray, overlay, lock screen

## Структура проекта

```
una-desktop/
├── electron/               # Главный процесс (Node.js)
│   ├── main.ts            # Точка входа, окна, tray, hotkeys
│   ├── preload.ts         # Безопасный мост к рендереру
│   ├── tools/             # Инструменты (files, commands, ...)
│   ├── ai/                # LLM, ASR, TTS провайдеры
│   ├── memory/            # 5-уровневая память
│   └── safety/            # Классификация опасных команд
├── src/                   # Рендерер (React)
│   ├── components/        # UI компоненты
│   ├── hooks/             # React hooks
│   ├── lib/               # Store, API типы
│   └── styles/            # CSS
├── prompts/               # Системный промпт U.N.A.
├── docs/                  # Документация
└── assets/                # Иконки, изображения
```

## Лицензия

MIT — используйте, модифицируйте, распространяйте свободно.
