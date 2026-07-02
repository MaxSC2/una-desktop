# Установка U.N.A.

## Вариант 1: Готовый установщик (Windows)

1. Скачайте `UNA-Setup-x.x.x.exe` из релизов
2. Запустите установщик
3. Выберите папку установки
4. После установки — ярлык на рабочем столе и в меню «Пуск»
5. Запустите U.N.A.

## Вариант 2: Портативная версия

1. Скачайте `UNA-x.x.x-portable.exe`
2. Поместите в любую папку
3. Запустите — настройки сохранятся рядом в `%APPDATA%\una-assistant\`

## Вариант 3: Сборка из исходников

### Шаг 1. Установите Node.js

Скачайте Node.js 20+ с https://nodejs.org и установите.

Проверка:
```bash
node --version  # должно быть v20.x или выше
npm --version
```

### Шаг 2. Распакуйте проект

```bash
# Если у вас архив UNA-Desktop.zip
unzip UNA-Desktop.zip
cd una-desktop
```

### Шаг 3. Установите зависимости

```bash
npm install
```

Это займёт 2-5 минут (скачивается ~500 МБ пакетов).

### Шаг 4. (Опционально) Установите локальные модели

#### Ollama (LLM)

Windows:
1. Скачайте installer: https://ollama.com/download/windows
2. Установите
3. Откройте терминал и скачайте модель:
   ```bash
   ollama pull gemma4:e2b-it-qat-2k
   ```
4. Проверьте:
   ```bash
   ollama list
   ```

#### whisper.cpp (ASR)

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# Windows (нужен CMake и Visual Studio Build Tools):
mkdir build && cd build
cmake .. -DWHISPER_CUBLAS=ON  # для GPU ускорения
cmake --build . --config Release

# Скачайте модель (русский):
powershell -Command "Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' -OutFile 'models\ggml-small.bin'"
```

Проверка:
```bash
.\build\bin\Release\whisper-cli.exe -m models\ggml-small.bin -f samples\jfk.wav
```

#### Piper (TTS)

1. Скачайте последний release: https://github.com/rhasspy/piper/releases
   - Файл: `piper_windows_amd64.zip`
2. Распакуйте в `C:\piper\`
3. Скачайте русский голос:
   - https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx
   - Сохраните как `C:\piper\ru_RU-irina-medium.onnx`

Проверка:
```bash
echo "Привет, я U.N.A." | C:\piper\piper.exe --model C:\piper\ru_RU-irina-medium.onnx --output-raw > out.wav
```

### Шаг 5. Получите облачный API ключ (опционально)

Если хотите использовать облачные модели (для сложных задач или VLM):

1. Зарегистрируйтесь на https://z.ai
2. Получите API ключ
3. Вставьте в настройках U.N.A. → «Cloud API Key»

### Шаг 6. Запуск

#### Режим разработки (с hot reload)

```bash
npm run dev
```

Откроются два процесса:
- Vite dev server на http://localhost:5173 (рендерер)
- Electron приложение (главное окно)

#### Сборка исполняемого файла

```bash
# Windows
npm run package:win
# Результат: release/UNA-Setup-1.0.0.exe

# Linux
npm run package:linux
# Результат: release/UNA-1.0.0.AppImage

# macOS (на Mac)
npm run package:mac
# Результат: release/UNA-1.0.0.dmg
```

## Первая настройка

1. Запустите U.N.A.
2. Перейдите на панель «Настройки»
3. Проверьте статус Ollama (должен быть «доступен» если установлен)
4. Укажите пути к whisper.cpp и Piper (если используете локальный ASR/TTS)
5. Вставьте Cloud API Key (если используете облако)
6. Нажмите «Сохранить»
7. Готово — можно общаться

## Проверка работоспособности

Откройте чат и спросите:

- «Привет!» — U.N.A. ответит
- «Покажи информацию о системе» — вызовет `system_info`
- «Что у меня на рабочем столе?» — вызовет `list_files`
- «Что на моём экране?» — сделает скриншот и проанализирует

Если все три команды работают — U.N.A. настроена правильно.

## Решение проблем

### Ollama недоступен

- Проверьте, что Ollama запущен: иконка в трее или `ollama serve`
- Проверьте URL: по умолчанию `http://localhost:11434`
- Откройте http://localhost:11434/api/tags в браузере — должен вернуть JSON

### Whisper не работает

- Проверьте путь к `whisper-cli.exe`
- Проверьте путь к модели `.bin`
- Запустите whisper из терминала вручную, посмотрите ошибку

### Piper не работает

- Проверьте, что файл `.onnx` скачан полностью
- Проверьте, что piper.exe запускается (`piper.exe --help`)

### Микрофон не работает

- Windows: Настройки → Конфиденциальность → Микрофон → разрешите приложениям доступ
- Проверьте, что микрофон выбран по умолчанию

### Скриншоты не работают

- На Windows: Настройки → Уведомления → «Capture and record」 — разрешите
- На macOS: Системные настройки → Конфиденциальность → Запись экрана

### TTS не работает

- Если локальный Piper не настроен — используется облако, нужен API ключ
- Проверьте громкость в системе
- Проверьте, что `voiceEnabled = true` (кнопка в чате)

### GPU не используется

- Ollama: установите CUDA toolkit, проверьте `ollama ps` — должна быть запись GPU
- whisper.cpp: соберите с `-DWHISPER_CUBLAS=ON`

## Обновление

### Из установщика

Просто запустите новый установщик — он обновит существующий.

### Из исходников

```bash
git pull
npm install
npm run build
```

## Удаление

- Установщик: «Панель управления» → «Удаление программ» → U.N.A.
- Портативная: удалите папку
- Данные: удалите `%APPDATA%\una-assistant\` (настройки, память, БД)
